/*
 * app.js — wires everything together: image intake (many at once), subject
 * extraction queue, per-sticker cutout pipeline (mask → alpha + signed
 * distance atlas), the cutout editor (tap / brush / colour-key tools), the
 * knob panel bound to the selected sticker, presets and export.
 */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const LOOK_KEY = 'sticker-shader-editor:look:v3';
  const SCENE_KEY = 'sticker-shader-editor:scene:v1';
  const SCENE_KEYS = StickerUI.SCENE_KEYS;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------------ */
  /* Settings: one "look" per sticker (new stickers inherit the last one    */
  /* edited) and a global scene object.                                     */
  /* ------------------------------------------------------------------ */
  function loadStored(key, keys) {
    const out = {};
    for (const k of keys) out[k] = StickerUI.DEFAULTS[k];
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const saved = JSON.parse(raw); for (const k in saved) if (k in out) out[k] = saved[k]; }
    } catch (e) { /* ignore */ }
    return out;
  }
  const LOOK_KEYS = Object.keys(StickerUI.DEFAULTS).filter((k) => !SCENE_KEYS.includes(k));
  let lastLook = loadStored(LOOK_KEY, LOOK_KEYS);
  const sceneSettings = loadStored(SCENE_KEY, SCENE_KEYS);
  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LOOK_KEY, JSON.stringify(lastLook)); localStorage.setItem(SCENE_KEY, JSON.stringify(sceneSettings)); } catch (e) { /* ignore */ }
    }, 250);
  }
  function newLook() { const s = clone(lastLook); for (const k of SCENE_KEYS) s[k] = sceneSettings[k]; return s; }

  /* ------------------------------------------------------------------ */
  /* DOM                                                                  */
  /* ------------------------------------------------------------------ */
  const els = {
    stage: $('#stage'), gl: $('#glCanvas'), drop: $('#dropzone'), panel: $('#panel'), panelWrap: $('.panel-wrap'),
    panelName: $('#panelName'), panelSub: $('#panelSub'),
    file: $('#fileInput'), sample: $('#btnSample'), preset: $('#presetSelect'), edit: $('#btnEdit'), del: $('#btnDelete'),
    status: $('#statusText'), progress: $('#progressBar'), statusbar: $('#statusbar'),
    editor: $('#editor'), editCanvas: $('#editCanvas'), editTools: $('#editTools'), brushSize: $('#brushSize'), keyTol: $('#keyTolerance'),
    editHint: $('#editHint'), btnDone: $('#btnDone'), btnUndo: $('#btnUndo'), btnAuto: $('#btnAuto'), btnInvert: $('#btnInvert'), btnClear: $('#btnClear'), btnReset: $('#btnReset'),
    exportMenu: $('#exportMenu'), hint: $('#stageHint'), copySettings: $('#btnCopySettings'), pasteSettings: $('#btnPasteSettings'), resetSettings: $('#btnResetSettings'),
  };

  /* ------------------------------------------------------------------ */
  /* State                                                                */
  /* ------------------------------------------------------------------ */
  const records = new Map();   // id → sticker record (image data, mask, history, settings)
  let selected = null;         // record
  let nextId = 1;
  const state = { mode: 'sticker', tool: 'tapAdd', brush: null, mlStatus: 'unknown' };

  let renderer, scene, panel;
  try {
    renderer = new StickerRenderer(els.gl);
  } catch (err) {
    els.drop.innerHTML = `<div class="empty"><h2>WebGL2 is required</h2><p>${err.message}</p></div>`;
    throw err;
  }
  scene = new StickerScene(els.gl, renderer);
  scene.onSelect = (entry) => { selected = entry ? records.get(entry.id) || null : null; syncSelection(); };
  scene.onFrame = () => positionDeleteButton();
  scene.onPhase = (entry) => { if (selected && selected.id === entry.id) syncSelection(); };
  scene.onHover = (entry) => { els.hint.classList.toggle('show', !!entry && !scene.drag && entry.phase === 'ready'); };
  scene.start();

  /* ------------------------------------------------------------------ */
  /* Status                                                               */
  /* ------------------------------------------------------------------ */
  let statusTimer = 0;
  function setStatus(msg, ratio, opts) {
    opts = opts || {};
    clearTimeout(statusTimer);
    els.status.textContent = msg || '';
    els.statusbar.classList.toggle('error', !!opts.error);
    els.statusbar.classList.toggle('busy', ratio !== undefined && ratio !== false);
    if (ratio === undefined || ratio === false) { els.progress.style.width = '0%'; els.progress.classList.remove('indeterminate'); }
    else if (ratio === null) { els.progress.classList.add('indeterminate'); els.progress.style.width = '35%'; }
    else { els.progress.classList.remove('indeterminate'); els.progress.style.width = Math.round(ratio * 100) + '%'; }
    els.statusbar.classList.toggle('hidden', !msg);
    if (opts.ttl) statusTimer = setTimeout(() => { els.statusbar.classList.add('hidden'); }, opts.ttl);
  }
  const progressCb = (p) => setStatus(p.message, p.ratio === undefined ? null : p.ratio);

  /* Segmentation runs one job at a time. */
  let queue = Promise.resolve();
  function enqueue(fn) { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; }

  /* ------------------------------------------------------------------ */
  /* Image intake                                                         */
  /* ------------------------------------------------------------------ */
  async function decodeToCanvas(blob) {
    let bmp;
    try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('Could not decode image')); img.src = URL.createObjectURL(blob); });
    }
    const MAX = 4096;
    const sc = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c;
  }

  function isImage(blob) { return blob && (/^image\//.test(blob.type) || (blob.name && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(blob.name))); }

  async function addSticker(blob, name) {
    if (!isImage(blob)) { setStatus('That file is not an image.', false, { error: true, ttl: 3000 }); return null; }
    let source;
    try { source = await decodeToCanvas(blob); }
    catch (err) { setStatus('Could not load image: ' + err.message, false, { error: true, ttl: 5000 }); return null; }
    const rec = {
      id: 's' + nextId++, name: name || blob.name || 'sticker', source,
      work: null, workData: null, mask: null, autoMask: null, maskVersion: 0, refined: null, history: [], atlas: null,
      settings: newLook(), labels: null, phase: 'processing', lastBuildMs: 0,
    };
    prepareWork(rec);
    records.set(rec.id, rec);
    exitEditor();
    scene.add({ id: rec.id, full: rec.work, settings: rec.settings });
    els.drop.classList.add('hidden');
    enqueue(() => extract(rec));
    return rec;
  }

  async function addFiles(files) {
    for (const f of files) await addSticker(f, f.name);
  }

  function prepareWork(rec) {
    const res = parseInt(rec.settings.workingRes, 10) || 1024;
    const src = rec.source;
    const sc = Math.min(1, res / Math.max(src.width, src.height));
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(src.width * sc)); c.height = Math.max(8, Math.round(src.height * sc));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    rec.work = c;
    rec.workData = ctx.getImageData(0, 0, c.width, c.height);
    rec.refined = null;
  }

  function coverage(mask) { let a = 0; for (let i = 0; i < mask.length; i++) if (mask[i] > 0.5) a++; return a / mask.length; }
  const uniq = (arr) => [...new Set(arr)];
  const nextTick = () => new Promise((r) => setTimeout(r, 0));
  const alive = (rec) => records.get(rec.id) === rec;

  /* Extraction chain: DeepLab characters → tap model at centre → colour key. */
  async function extract(rec) {
    if (!alive(rec)) return;
    const work = rec.work;
    let mask = null, how = '';
    try {
      const res = await Segmenter.autoDetect(work, progressCb);
      state.mlStatus = 'ready';
      if (res) { mask = res.mask; how = 'Found ' + uniq(res.labels).join(', '); rec.labels = res.labels; }
      else {
        setStatus('No people or animals found — trying the centre of the image…', null);
        const m = await Segmenter.tapSelect(work, [{ x: 0.5, y: 0.5, positive: true }], progressCb);
        if (coverage(m) > 0.01) { mask = m; how = 'Selected the subject at the centre'; }
      }
    } catch (err) {
      console.warn('ML segmentation unavailable, falling back to colour key', err);
      state.mlStatus = 'unavailable';
      how = 'AI models unavailable — used colour keying';
    }
    if (!alive(rec)) return;
    if (!mask) {
      setStatus('Keying out the background colour…', null);
      await nextTick();
      mask = Segmenter.colorKey(work, { tolerance: 0.5 });
      if (!how) how = 'Keyed out the background colour';
    }
    if (!alive(rec)) return;
    rec.history = [];
    rec.mask = mask; rec.maskVersion++;
    rec.autoMask = Float32Array.from(mask);
    rebuildCutout(rec);
    rec.phase = 'ready';
    if (selected === rec) syncSelection();
    setStatus(`${rec.name}: ${how} · drag the sticker · Edit cutout to refine`, false, { ttl: 6000 });
  }

  function pushHistory(rec) {
    if (!rec.mask) return;
    rec.history.push(rec.mask);
    if (rec.history.length > 12) rec.history.shift();
    if (rec === selected) els.btnUndo.disabled = false;
  }
  function undo() {
    const rec = selected; if (!rec || !rec.history.length) return;
    rec.mask = rec.history.pop(); rec.maskVersion++;
    els.btnUndo.disabled = rec.history.length === 0;
    drawEditor(); scheduleRebuild(rec);
  }

  /* ------------------------------------------------------------------ */
  /* Cutout pipeline                                                      */
  /* ------------------------------------------------------------------ */
  function scheduleRebuild(rec) {
    clearTimeout(rec.rebuildTimer);
    rec.rebuildTimer = setTimeout(() => rebuildCutout(rec), 120);
  }

  function rebuildCutout(rec) {
    if (!rec.mask || !rec.work || !alive(rec)) return;
    const s = rec.settings;
    const w = rec.work.width, h = rec.work.height, n = w * h;
    const t0 = performance.now();
    let soft = rec.mask;
    if (s.edgeRefine) {
      const r = Math.max(1, Math.round(s.refineRadius * Math.max(w, h) / 1024));
      if (!rec.refined || rec.refined.version !== rec.maskVersion || rec.refined.radius !== r) {
        rec.refined = { version: rec.maskVersion, radius: r, data: MaskOps.guidedFilter(rec.workData.data, rec.mask, w, h, r, 0.004) };
      }
      soft = rec.refined.data;
    }
    let bin = MaskOps.threshold(soft, 0.5);
    const scale = Math.max(w, h) / 1024;
    if (s.outlineSmooth > 0) bin = MaskOps.smoothOutline(bin, w, h, s.outlineSmooth * scale);
    if (s.keepLargest) bin = MaskOps.keepLargest(bin, w, h, 0.04);
    if (s.fillHoles) bin = MaskOps.fillHoles(bin, w, h, 0.02);
    if (s.outlineOffset !== 0) bin = MaskOps.offset(bin, w, h, s.outlineOffset * scale);
    if (MaskOps.area(bin) < 16) setStatus('The cutout is empty — use Edit cutout to select the subject.', false, { error: true, ttl: 5000 });
    const sd = MaskOps.signedDistance(bin, w, h);
    let alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) alpha[i] = sd[i] > 1.5 ? 1 : sd[i] > -1.5 ? Math.max(soft[i], sd[i] > 0.5 ? 0.5 : 0) : 0;
    if (s.feather > 0) alpha = MaskOps.gaussianBlur(alpha, w, h, s.feather * scale);
    const pad = Math.round(120 * scale);
    const bb = MaskOps.bbox(bin, w, h) || { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
    const ax0 = bb.x0 - pad, ay0 = bb.y0 - pad, aw = bb.x1 - bb.x0 + 1 + pad * 2, ah = bb.y1 - bb.y0 + 1 + pad * 2;
    const atlasCanvas = document.createElement('canvas'); atlasCanvas.width = aw; atlasCanvas.height = ah;
    const actx = atlasCanvas.getContext('2d');
    const out = actx.createImageData(aw, ah);
    const src = rec.workData.data;
    const abin = new Uint8Array(aw * ah);
    for (let y = 0; y < ah; y++) {
      const sy = y + ay0;
      for (let x = 0; x < aw; x++) {
        const sx = x + ax0;
        const o = (y * aw + x) * 4;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const i = sy * w + sx, a = alpha[i];
        abin[y * aw + x] = bin[i];
        if (a <= 0) continue;
        out.data[o] = src[i * 4] * a; out.data[o + 1] = src[i * 4 + 1] * a; out.data[o + 2] = src[i * 4 + 2] * a; out.data[o + 3] = a * 255;
      }
    }
    actx.putImageData(out, 0, 0);
    const sdf = MaskOps.signedDistance(abin, aw, ah);
    rec.atlas = { canvas: atlasCanvas, sdf, w: aw, h: ah, x0: ax0, y0: ay0, scale, pad };
    scene.setAtlas(rec.id, rec.atlas);
    rec.lastBuildMs = performance.now() - t0;
  }

  /* ------------------------------------------------------------------ */
  /* Selection → panel, buttons, delete control                           */
  /* ------------------------------------------------------------------ */
  function syncSelection() {
    const rec = selected;
    const ready = !!(rec && rec.mask);
    panel.bind(rec ? rec.settings : null, sceneSettings);
    els.panelName.textContent = rec ? rec.name : 'Knobs';
    els.panelSub.textContent = rec ? (ready ? 'editing this sticker' : 'cutting out…') : (records.size ? 'select a sticker on the canvas' : 'add an image to start');
    els.edit.disabled = !ready;
    els.exportMenu.querySelectorAll('button[data-export]').forEach((b) => {
      const kind = b.dataset.export;
      b.disabled = kind === 'canvas' || kind === 'clip' ? records.size === 0 : !ready;
    });
    els.btnUndo.disabled = !(rec && rec.history.length);
    els.preset.value = '';
    if (state.mode === 'edit' && !ready) exitEditor();
    positionDeleteButton();
  }

  function positionDeleteButton() {
    const b = scene.bounds();
    if (!b || state.mode === 'edit') { if (!els.del.hidden) els.del.hidden = true; return; }
    if (els.del.hidden) els.del.hidden = false;
    const x = Math.min(scene.stageW - 18, Math.max(18, b.x + b.w - 8));
    const y = Math.min(scene.stageH - 18, Math.max(18, b.y + 6));
    els.del.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }

  function deleteSelected() {
    const rec = selected; if (!rec) return;
    exitEditor();
    scene.remove(rec.id);
    records.delete(rec.id);
    selected = null;
    syncSelection();
    if (!records.size) els.drop.classList.remove('hidden');
    setStatus(`Removed ${rec.name}`, false, { ttl: 1500 });
  }
  els.del.addEventListener('pointerdown', (e) => e.stopPropagation());
  els.del.addEventListener('click', deleteSelected);

  /* ------------------------------------------------------------------ */
  /* Cutout editor (works on the selected sticker)                        */
  /* ------------------------------------------------------------------ */
  const editor = { overlay: null, overlayVersion: -1, overlayFor: null, view: { x: 0, y: 0, w: 1, h: 1 }, cursor: null };

  function enterEditor() {
    const rec = selected; if (!rec || !rec.mask) return;
    state.mode = 'edit';
    els.editor.hidden = false;
    els.edit.classList.add('active');
    els.stage.classList.add('editing');
    layoutEditor();
    drawEditor();
    updateEditHint();
    positionDeleteButton();
  }
  function exitEditor() {
    if (state.mode !== 'edit') return;
    state.mode = 'sticker';
    els.editor.hidden = true;
    els.edit.classList.remove('active');
    els.stage.classList.remove('editing');
    if (selected && selected.mask) rebuildCutout(selected);
    positionDeleteButton();
  }
  function layoutEditor() {
    const rec = selected; if (!rec) return;
    const rect = els.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(rect.width)), ch = Math.max(1, Math.round(rect.height));
    els.editCanvas.width = cw * dpr; els.editCanvas.height = ch * dpr;
    els.editCanvas.style.width = cw + 'px'; els.editCanvas.style.height = ch + 'px';
    const w = rec.work.width, h = rec.work.height;
    const margin = 24, toolbarH = 72;
    const fit = Math.min((cw - margin * 2) / w, (ch - margin * 2 - toolbarH) / h);
    editor.view = { x: (cw - w * fit) / 2, y: toolbarH + (ch - toolbarH - h * fit) / 2, w: w * fit, h: h * fit, dpr };
  }
  function buildOverlay(rec) {
    const w = rec.work.width, h = rec.work.height;
    if (!editor.overlay) editor.overlay = document.createElement('canvas');
    editor.overlay.width = w; editor.overlay.height = h;
    const ctx = editor.overlay.getContext('2d');
    const id = ctx.createImageData(w, h);
    const m = rec.mask, d = id.data;
    for (let i = 0, j = 0; i < m.length; i++, j += 4) {
      if (m[i] < 0.5) { d[j] = 16; d[j + 1] = 20; d[j + 2] = 34; d[j + 3] = 175 + (0.5 - Math.max(0, m[i])) * 80; }
    }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; const a = m[i] >= 0.5;
      if (a !== (m[i - 1] >= 0.5) || a !== (m[i + 1] >= 0.5) || a !== (m[i - w] >= 0.5) || a !== (m[i + w] >= 0.5)) {
        const j = i * 4; d[j] = 246; d[j + 1] = 196; d[j + 2] = 69; d[j + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);
    editor.overlayVersion = rec.maskVersion; editor.overlayFor = rec;
  }
  function drawEditor() {
    const rec = selected;
    if (state.mode !== 'edit' || !rec) return;
    if (editor.overlayFor !== rec || editor.overlayVersion !== rec.maskVersion || !editor.overlay) buildOverlay(rec);
    const ctx = els.editCanvas.getContext('2d');
    const v = editor.view, dpr = v.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, els.editCanvas.width, els.editCanvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(rec.work, v.x, v.y, v.w, v.h);
    ctx.drawImage(editor.overlay, v.x, v.y, v.w, v.h);
    if (editor.cursor && (state.tool === 'brushAdd' || state.tool === 'brushRemove')) {
      const r = brushRadiusWork(rec) * (v.w / rec.work.width);
      ctx.beginPath(); ctx.arc(editor.cursor.x, editor.cursor.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = state.tool === 'brushAdd' ? 'rgba(116,224,194,0.95)' : 'rgba(255,120,120,0.95)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  function brushRadiusWork(rec) { return parseFloat(els.brushSize.value) * Math.max(rec.work.width, rec.work.height) / 1024; }
  function toWork(e, rec) {
    const r = els.editCanvas.getBoundingClientRect(), v = editor.view;
    const x = (e.clientX - r.left - v.x) / v.w * rec.work.width, y = (e.clientY - r.top - v.y) / v.h * rec.work.height;
    return { x, y, inside: x >= 0 && y >= 0 && x < rec.work.width && y < rec.work.height };
  }

  function paintDisc(mask, w, h, cx, cy, r, add, hardness) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
    const inner = r * hardness;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const v = d <= inner ? 1 : 1 - (d - inner) / Math.max(1e-3, r - inner);
      const i = y * w + x;
      if (add) { if (v > mask[i]) mask[i] = v; } else if (1 - v < mask[i]) mask[i] = 1 - v;
    }
  }
  function brushLine(rec, from, to, add) {
    const w = rec.work.width, h = rec.work.height, r = brushRadiusWork(rec);
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (r * 0.35)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      paintDisc(rec.mask, w, h, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, r, add, 0.7);
    }
  }

  function applyRegion(rec, region, positive, label) {
    pushHistory(rec);
    const next = Float32Array.from(rec.mask);
    for (let i = 0; i < next.length; i++) next[i] = positive ? Math.max(next[i], region[i]) : Math.min(next[i], 1 - region[i]);
    rec.mask = next; rec.maskVersion++;
    drawEditor(); scheduleRebuild(rec);
    setStatus(label, false, { ttl: 1500 });
  }

  function tapAt(rec, p, positive) {
    const w = rec.work.width, h = rec.work.height;
    return enqueue(async () => {
      let region = null;
      if (state.mlStatus !== 'unavailable') {
        try {
          region = await Segmenter.tapSelect(rec.work, [{ x: p.x / w, y: p.y / h, positive: true }], progressCb);
          state.mlStatus = 'ready';
        } catch (err) { console.warn('tap model unavailable', err); state.mlStatus = 'unavailable'; updateEditHint(); }
      }
      if (!alive(rec)) return;
      if (!region) region = colorRegionAt(rec, p);
      applyRegion(rec, region, positive, positive ? 'Added region' : 'Removed region');
    }).catch((err) => { console.error(err); setStatus('Selection failed: ' + err.message, false, { error: true, ttl: 4000 }); });
  }

  function colorRegionAt(rec, p) {
    const w = rec.work.width, h = rec.work.height;
    const m = MaskOps.colorKey(rec.workData.data, w, h, { tolerance: parseFloat(els.keyTol.value), seeds: [p] });
    const region = new Float32Array(m.length);
    for (let i = 0; i < m.length; i++) region[i] = 1 - m[i];
    return region;
  }

  function updateEditHint() {
    const t = state.tool;
    const ml = state.mlStatus === 'unavailable';
    const hints = {
      tapAdd: ml ? 'Tap a colour region to add it (AI model unavailable).' : 'Tap the thing you want on the sticker. Hold Alt to remove.',
      tapRemove: ml ? 'Tap a colour region to remove it (AI model unavailable).' : 'Tap something to remove it from the sticker.',
      brushAdd: 'Paint to add. [ and ] change the brush size.',
      brushRemove: 'Paint to erase. [ and ] change the brush size.',
      key: 'Click a background colour to key out everything connected to it.',
    };
    els.editHint.textContent = hints[t] || '';
  }

  els.editTools.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tool]'); if (!b) return;
    state.tool = b.dataset.tool;
    els.editTools.querySelectorAll('button[data-tool]').forEach((x) => x.classList.toggle('active', x === b));
    els.editor.classList.toggle('brush', state.tool.startsWith('brush'));
    els.editor.classList.toggle('keying', state.tool === 'key');
    updateEditHint(); drawEditor();
  });

  els.editCanvas.addEventListener('pointerdown', (e) => {
    const rec = selected;
    if (state.mode !== 'edit' || !rec || !rec.mask) return;
    const p = toWork(e, rec); if (!p.inside) return;
    e.preventDefault();
    const tool = state.tool;
    if (tool === 'tapAdd' || tool === 'tapRemove') { tapAt(rec, p, tool === 'tapAdd' && !e.altKey); return; }
    if (tool === 'key') { applyRegion(rec, colorRegionAt(rec, p), false, 'Keyed out the clicked colour'); return; }
    els.editCanvas.setPointerCapture(e.pointerId);
    pushHistory(rec);
    rec.mask = Float32Array.from(rec.mask); rec.maskVersion++;
    state.brush = { rec, last: p, add: tool === 'brushAdd' };
    brushLine(rec, p, p, state.brush.add);
    drawEditor();
  });
  els.editCanvas.addEventListener('pointermove', (e) => {
    if (state.mode !== 'edit') return;
    const r = els.editCanvas.getBoundingClientRect();
    editor.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (state.brush) {
      const p = toWork(e, state.brush.rec);
      brushLine(state.brush.rec, state.brush.last, p, state.brush.add);
      state.brush.last = p; state.brush.rec.maskVersion++;
    }
    drawEditor();
  });
  const endBrush = (e) => {
    if (!state.brush) return;
    try { els.editCanvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const rec = state.brush.rec;
    state.brush = null; rec.maskVersion++;
    drawEditor(); scheduleRebuild(rec);
  };
  els.editCanvas.addEventListener('pointerup', endBrush);
  els.editCanvas.addEventListener('pointercancel', endBrush);
  els.editCanvas.addEventListener('pointerleave', () => { editor.cursor = null; drawEditor(); });
  els.brushSize.addEventListener('input', drawEditor);

  els.btnDone.addEventListener('click', exitEditor);
  els.btnUndo.addEventListener('click', undo);
  els.btnInvert.addEventListener('click', () => { const rec = selected; if (!rec) return; pushHistory(rec); const m = Float32Array.from(rec.mask); for (let i = 0; i < m.length; i++) m[i] = 1 - m[i]; rec.mask = m; rec.maskVersion++; drawEditor(); scheduleRebuild(rec); });
  els.btnClear.addEventListener('click', () => { const rec = selected; if (!rec) return; pushHistory(rec); rec.mask = new Float32Array(rec.mask.length); rec.maskVersion++; drawEditor(); scheduleRebuild(rec); });
  els.btnReset.addEventListener('click', () => { const rec = selected; if (!rec || !rec.autoMask) return; pushHistory(rec); rec.mask = Float32Array.from(rec.autoMask); rec.maskVersion++; drawEditor(); scheduleRebuild(rec); });
  els.btnAuto.addEventListener('click', () => { const rec = selected; if (!rec) return; enqueue(async () => { await extract(rec); drawEditor(); }); });
  els.edit.addEventListener('click', () => { if (state.mode === 'edit') exitEditor(); else enterEditor(); });

  document.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'Escape') { if (state.mode === 'edit') exitEditor(); else scene.select(null); }
    if (state.mode === 'edit') {
      if (e.key === '[') { els.brushSize.value = Math.max(2, parseFloat(els.brushSize.value) - 4); drawEditor(); }
      if (e.key === ']') { els.brushSize.value = Math.min(160, parseFloat(els.brushSize.value) + 4); drawEditor(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault(); deleteSelected();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Panel + presets                                                      */
  /* ------------------------------------------------------------------ */
  function applyScene() {
    els.stage.style.setProperty('--stage-bg', sceneSettings.background);
    els.stage.classList.toggle('checker', !!sceneSettings.checker);
    const c = StickerRenderer.hexToRgb(sceneSettings.background);
    document.documentElement.style.setProperty('--stage-ink', (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 0.6 ? '#1a1a1f' : '#f2f0ea');
  }

  function rememberLook(rec) {
    for (const k of LOOK_KEYS) lastLook[k] = rec.settings[k];
    persist();
  }

  panel = StickerUI.buildPanel(els.panel, (key, value, control) => {
    if (control.scene) { applyScene(); persist(); return; }
    const rec = selected; if (!rec) return;
    rememberLook(rec);
    const entry = scene.get(rec.id);
    if (control.layout && entry) scene.relayout(entry);
    if (control.rebuild === 'image') { prepareWork(rec); enqueue(() => extract(rec)); }
    else if (control.rebuild === 'cutout') scheduleRebuild(rec);
    els.preset.value = '';
  });
  panel.bind(null, sceneSettings);
  applyScene();

  for (const name in StickerUI.PRESETS) { const o = document.createElement('option'); o.value = name; o.textContent = name; els.preset.appendChild(o); }
  els.preset.value = '';
  els.preset.addEventListener('change', () => {
    const rec = selected;
    if (!els.preset.value || !rec) { els.preset.value = ''; return; }
    StickerUI.applyPreset(rec.settings, els.preset.value);
    for (const k of SCENE_KEYS) rec.settings[k] = sceneSettings[k];
    panel.refresh(); rememberLook(rec);
  });

  els.copySettings.addEventListener('click', async () => {
    const src = selected ? selected.settings : Object.assign(newLook());
    const json = JSON.stringify(src, null, 2);
    try { await navigator.clipboard.writeText(json); setStatus('Settings copied to clipboard', false, { ttl: 2000 }); }
    catch (e) { window.prompt('Copy your settings:', json); }
  });
  els.pasteSettings.addEventListener('click', () => {
    const raw = window.prompt('Paste settings JSON:'); if (!raw) return;
    try {
      const obj = JSON.parse(raw); let n = 0;
      const target = selected ? selected.settings : lastLook;
      for (const k in obj) if (k in StickerUI.DEFAULTS) { if (SCENE_KEYS.includes(k)) sceneSettings[k] = obj[k]; else target[k] = obj[k]; n++; }
      if (selected) { rememberLook(selected); scheduleRebuild(selected); const entry = scene.get(selected.id); if (entry) scene.relayout(entry); }
      panel.refresh(); applyScene(); persist();
      setStatus(`Imported ${n} settings`, false, { ttl: 2000 });
    } catch (e) { setStatus('That was not valid JSON', false, { error: true, ttl: 3000 }); }
  });
  els.resetSettings.addEventListener('click', () => {
    for (const k of SCENE_KEYS) sceneSettings[k] = StickerUI.DEFAULTS[k];
    for (const k of LOOK_KEYS) lastLook[k] = StickerUI.DEFAULTS[k];
    if (selected) { Object.assign(selected.settings, StickerUI.DEFAULTS); scheduleRebuild(selected); const entry = scene.get(selected.id); if (entry) scene.relayout(entry); }
    panel.refresh(); applyScene(); persist(); els.preset.value = '';
  });

  /* ------------------------------------------------------------------ */
  /* Export                                                               */
  /* ------------------------------------------------------------------ */
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function canvasBlob(c) { return new Promise((res) => c.toBlob(res, 'image/png')); }
  const baseName = (rec) => (rec.name || 'sticker').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') || 'sticker';

  const exportDetails = els.exportMenu.closest('details');
  document.addEventListener('pointerdown', (e) => { if (exportDetails.open && !exportDetails.contains(e.target)) exportDetails.open = false; });
  els.exportMenu.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-export]'); if (!b) return;
    exportDetails.open = false;
    const kind = b.dataset.export;
    const rec = selected, entry = rec ? scene.get(rec.id) : null;
    try {
      if (kind === 'canvas') { const c = scene.snapshotCanvas({ background: sceneSettings.background }); download(await canvasBlob(c), 'sticker-canvas.png'); return; }
      if (kind === 'clip') {
        setStatus('Recording a 4 second clip…', null);
        const blob = await scene.record(4, sceneSettings.background);
        setStatus('Clip ready', false, { ttl: 2000 });
        download(blob, 'sticker-clip.webm'); return;
      }
      if (!rec || !entry || !entry.tex) return;
      if (kind === 'png') download(await canvasBlob(scene.snapshot(entry, { scale: 1, shadow: false })), baseName(rec) + '-sticker.png');
      else if (kind === 'png2x') download(await canvasBlob(scene.snapshot(entry, { scale: 2, shadow: false })), baseName(rec) + '-sticker@2x.png');
      else if (kind === 'posed') download(await canvasBlob(scene.snapshot(entry, { scale: 1, posed: true, shadow: true })), baseName(rec) + '-posed.png');
      else if (kind === 'cutout') download(await canvasBlob(rec.atlas.canvas), baseName(rec) + '-cutout.png');
    } catch (err) { console.error(err); setStatus('Export failed: ' + err.message, false, { error: true, ttl: 4000 }); }
  });

  /* ------------------------------------------------------------------ */
  /* Intake wiring: file input, drag & drop, paste, samples               */
  /* ------------------------------------------------------------------ */
  els.file.addEventListener('change', () => { addFiles([...els.file.files]); els.file.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); els.stage.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === document.documentElement) els.stage.classList.remove('dragover'); }));
  document.addEventListener('drop', (e) => { const fl = e.dataTransfer && e.dataTransfer.files; if (fl && fl.length) addFiles([...fl]); });
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items; if (!items) return;
    const files = [];
    for (const it of items) if (it.type.startsWith('image/')) files.push(it.getAsFile());
    if (files.length) addFiles(files);
  });

  /* Procedural sample characters so the demo needs no external images. */
  function drawSample(variant) {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
    const ctx = c.getContext('2d');
    if (variant === 1) {
      const bg = ctx.createLinearGradient(0, 0, 0, 900); bg.addColorStop(0, '#f6e7d2'); bg.addColorStop(1, '#e8c9a8');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 900);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < 9; i++) { ctx.fillRect(80 + i * 130, 120 + (i % 3) * 40, 60, 60); }
      ctx.save(); ctx.translate(600, 480);
      // robot body
      const body = ctx.createLinearGradient(-180, -220, 180, 220); body.addColorStop(0, '#7fb6ff'); body.addColorStop(1, '#3d6fd6');
      ctx.fillStyle = body; roundRect(ctx, -170, -140, 340, 300, 60); ctx.fill();
      ctx.fillStyle = '#2b4a95'; roundRect(ctx, -120, -250, 240, 150, 46); ctx.fill();
      ctx.fillStyle = '#dfe9ff'; roundRect(ctx, -90, -225, 180, 100, 30); ctx.fill();
      ctx.fillStyle = '#1b1e2b'; ctx.beginPath(); ctx.arc(-40, -175, 20, 0, Math.PI * 2); ctx.arc(40, -175, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-33, -182, 7, 0, Math.PI * 2); ctx.arc(47, -182, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b4a95'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -250); ctx.lineTo(0, -320); ctx.stroke();
      ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(0, -335, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1e2b'; roundRect(ctx, -110, -80, 220, 120, 26); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#ffd166', '#06d6a0', '#ef476f'][i]; ctx.beginPath(); ctx.arc(-60 + i * 60, -20, 18, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#3d6fd6'; ctx.lineWidth = 34;
      ctx.beginPath(); ctx.moveTo(-170, -60); ctx.quadraticCurveTo(-290, 0, -260, 120); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(170, -60); ctx.quadraticCurveTo(290, -140, 330, -40); ctx.stroke();
      ctx.fillStyle = '#2b4a95'; roundRect(ctx, -140, 160, 100, 90, 24); ctx.fill(); roundRect(ctx, 40, 160, 100, 90, 24); ctx.fill();
      ctx.restore();
      return c;
    }
    const bg = ctx.createLinearGradient(0, 0, 1200, 900); bg.addColorStop(0, '#dfe7f5'); bg.addColorStop(1, '#b8c7e6');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 900);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(120 + i * 90, 700 + Math.sin(i) * 60, 38, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.translate(600, 470);
    const body = ctx.createRadialGradient(-60, -80, 40, 0, 0, 260); body.addColorStop(0, '#ffb35c'); body.addColorStop(1, '#e8632a');
    ctx.fillStyle = body; ctx.beginPath();
    ctx.moveTo(-210, 40); ctx.bezierCurveTo(-230, -180, -120, -260, 0, -250); ctx.bezierCurveTo(130, -260, 240, -170, 215, 40);
    ctx.bezierCurveTo(200, 200, 90, 250, 0, 250); ctx.bezierCurveTo(-90, 250, -200, 200, -210, 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8632a';
    ctx.beginPath(); ctx.moveTo(-170, -160); ctx.lineTo(-210, -330); ctx.lineTo(-60, -230); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(170, -160); ctx.lineTo(210, -330); ctx.lineTo(60, -230); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd7a3';
    ctx.beginPath(); ctx.moveTo(-160, -180); ctx.lineTo(-185, -290); ctx.lineTo(-90, -225); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(160, -180); ctx.lineTo(185, -290); ctx.lineTo(90, -225); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe3bf'; ctx.beginPath(); ctx.ellipse(0, 90, 120, 130, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b1d16';
    ctx.beginPath(); ctx.ellipse(-70, -50, 26, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(70, -50, 26, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-60, -62, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(80, -62, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,110,120,0.55)';
    ctx.beginPath(); ctx.ellipse(-125, 5, 30, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(125, 5, 30, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b1d16'; ctx.beginPath(); ctx.ellipse(0, 5, 16, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2b1d16'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-30, 30); ctx.quadraticCurveTo(0, 60, 30, 30); ctx.stroke();
    ctx.lineWidth = 4;
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(s * 150, 20 + i * 18); ctx.lineTo(s * 240, 10 + i * 34); ctx.stroke(); }
    ctx.strokeStyle = '#e8632a'; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(200, 150); ctx.bezierCurveTo(330, 120, 360, 10, 300, -60); ctx.stroke();
    ctx.restore();
    return c;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  let sampleIndex = 0;
  els.sample.addEventListener('click', async () => {
    const variant = sampleIndex++ % 2;
    const c = drawSample(variant);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    addSticker(blob, variant === 1 ? 'sample-robot.png' : 'sample-cat.png');
  });

  /* ------------------------------------------------------------------ */
  /* Layout                                                               */
  /* ------------------------------------------------------------------ */
  const ro = new ResizeObserver(() => { scene.resize(); if (state.mode === 'edit') { layoutEditor(); drawEditor(); } });
  ro.observe(els.stage);
  syncSelection();

  // warm the runtime in the background so the first extraction is quick
  Segmenter.loadRuntime().then(() => { state.mlStatus = 'ready'; }).catch((err) => { state.mlStatus = 'unavailable'; console.warn('MediaPipe runtime unavailable', err); });

  // exposed for tests / console tinkering
  window.stickerApp = {
    get selected() { return selected; }, records, state, scene, renderer, sceneSettings,
    addSticker, addFiles, rebuildCutout, enterEditor, exitEditor, tapAt, extract, deleteSelected, drawSample,
  };
})();
