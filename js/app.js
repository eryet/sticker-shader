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
  const SCENE_KEY = 'sticker-shader-editor:scene:v2';   // v2: pastel Sky backdrop by default
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
  const COMPOSE_KEYS = StickerUI.COMPOSE_KEYS;
  const LOOK_KEYS = Object.keys(StickerUI.DEFAULTS).filter((k) => !SCENE_KEYS.includes(k) && !COMPOSE_KEYS.includes(k));
  let lastLook = loadStored(LOOK_KEY, LOOK_KEYS);
  const sceneSettings = loadStored(SCENE_KEY, SCENE_KEYS);
  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LOOK_KEY, JSON.stringify(lastLook)); localStorage.setItem(SCENE_KEY, JSON.stringify(sceneSettings)); } catch (e) { /* ignore */ }
    }, 250);
  }
  /*
   * Frames and icons are drawn by us, so they skip the photo-oriented cutout
   * steps, and they start smaller / larger and with their own border.
   */
  const KIND_LOOK = {
    frame: { workingRes: '1536', edgeRefine: false, feather: 0.5, outlineSmooth: 0, outlineOffset: 0, fillHoles: false, keepLargest: false, borderWidth: 0, stickerScale: 0.95, baseRotation: -6 },
    icon: { workingRes: '1024', edgeRefine: false, feather: 0.5, outlineSmooth: 0, outlineOffset: 0, fillHoles: false, keepLargest: false, borderWidth: 12, stickerScale: 0.3 },
  };
  function newLook(kind) {
    const s = clone(lastLook);
    for (const k of SCENE_KEYS) s[k] = sceneSettings[k];
    for (const k of COMPOSE_KEYS) s[k] = StickerUI.DEFAULTS[k];
    if (KIND_LOOK[kind]) Object.assign(s, KIND_LOOK[kind]);
    return s;
  }

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
    frame: $('#btnFrame'), iconMenu: $('#iconMenu'), iconMenuWrap: $('#iconMenuWrap'),
    histUndo: $('#btnHistUndo'), histRedo: $('#btnHistRedo'),
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
  /* photo stickers dragged over a frame's window get framed on release */
  scene.dropTargetFor = (entry, p) => {
    const rec = records.get(entry.id);
    if (!rec || rec.kind !== 'sticker' || !rec.atlas) return null;
    for (let i = scene.stickers.length - 1; i >= 0; i--) {
      const e = scene.stickers[i]; if (e === entry || !e.atlas) continue;
      const fr = records.get(e.id); if (!fr || fr.kind !== 'frame' || !fr.frame.layout) continue;
      const { u, v } = scene.localPoint(e, p.x, p.y);
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const k = fr.work.width / fr.source.width; // composed canvas px → working px
      const wx = e.atlas.x0 + u * e.atlas.w, wy = e.atlas.y0 + v * e.atlas.h;
      const win = fr.frame.layout.window;
      if (wx >= win.x * k && wx <= (win.x + win.w) * k && wy >= win.y * k && wy <= (win.y + win.h) * k) return e;
    }
    return null;
  };
  scene.onDropTarget = (target) => {
    els.hint.textContent = target ? 'release to put it in the frame' : 'drag me';
    els.hint.classList.toggle('drop', !!target);
    els.hint.classList.toggle('show', !!target);
  };
  scene.onDrop = (entry, target) => {
    const photo = records.get(entry.id), fr = records.get(target.id);
    if (!photo || !fr || fr.kind !== 'frame') return false;
    setFramePhoto(fr, photo.id);
    scene.select(target);
    setStatus(`${photo.name} is in the frame · set Photo to "none" in the panel to take it out`, false, { ttl: 5000 });
    return true;
  };
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
      id: 's' + nextId++, kind: 'sticker', name: name || blob.name || 'sticker', source,
      work: null, workData: null, mask: null, autoMask: null, maskVersion: 0, refined: null, history: [], atlas: null,
      settings: newLook('sticker'), labels: null, phase: 'processing', lastBuildMs: 0, framedIn: null,
    };
    prepareWork(rec);
    rec.committed = clone(rec.settings);
    records.set(rec.id, rec);
    exitEditor();
    scene.add({ id: rec.id, full: rec.work, settings: rec.settings });
    els.drop.classList.add('hidden');
    pushHistory(addCommand(rec, 'add ' + rec.name));
    enqueue(() => extract(rec));
    return rec;
  }

  /* ------------------------------------------------------------------ */
  /* Frames and icons: drawn by StickerDecor, then cut out like a photo     */
  /* ------------------------------------------------------------------ */
  /* the mouse wheel or a pinch changed a sticker's size or rotation on the canvas */
  scene.onTweak = (entry) => {
    const rec = records.get(entry.id); if (!rec) return;
    rememberLook(rec);
    if (rec === selected) { panel.refresh(); els.preset.value = ''; }
    commitSettings(rec, 'resize');
  };
  const ICON_COLOR_KEYS = ['iconFill', 'iconAccent', 'iconExtra', 'iconWarm', 'iconBrown', 'iconMint', 'iconOutline'];
  const FRAME_STYLE_KEYS = Object.keys(StickerDecor.FRAME_PRESETS['Cinnamon café']).concat(['frameBodyPatternColor', 'tapeColor']);

  /* ---- icons stick to frames ---- */
  /* the topmost frame an icon is resting on or right beside, or null */
  function frameNear(entry) {
    const isz = scene.size(entry);
    for (let i = scene.stickers.length - 1; i >= 0; i--) {
      const f = scene.stickers[i];
      const fr = records.get(f.id); if (!fr || fr.kind !== 'frame' || !f.atlas) continue;
      const fsz = scene.size(f);
      const { u, v } = scene.localPoint(f, entry.x, entry.y);
      const mu = isz.w * 0.45 / fsz.w, mv = isz.h * 0.45 / fsz.h;   // an icon overlapping the frame's edge still counts
      if (u > -mu && u < 1 + mu && v > -mv && v < 1 + mv) return f;
    }
    return null;
  }
  function restick(entry) {
    const rec = records.get(entry.id);
    if (!rec || rec.kind !== 'icon') return;
    const f = rec.settings.iconStick ? frameNear(entry) : null;
    if (f) scene.attach(entry, f); else scene.detach(entry);
  }

  /*
   * (Re)draw a frame or icon and rebuild its cutout from the drawing's alpha.
   * Normally the drawing and the distance-field work happen in a worker so the
   * page never stalls; the first build of a new item (opts.sync) and any
   * browser without workers use the same code on the main thread.
   */
  let composeSeq = 0;
  const pendingCompose = new Map();   // seq → rec
  const composeWorker = (() => {
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || location.protocol === 'file:') return null;
      const w = new Worker('js/compose-worker.js');
      w.onmessage = onComposed;
      w.onerror = (e) => { console.warn('compose worker unavailable, composing on the page:', e.message || e); disableComposeWorker(); };
      return w;
    } catch (err) { return null; }
  })();
  state.composeMode = composeWorker ? 'worker' : 'main';
  function disableComposeWorker() {
    if (state.composeMode === 'main') return;
    state.composeMode = 'main';
    const waiting = [...pendingCompose.values()]; pendingCompose.clear();
    for (const rec of waiting) if (alive(rec)) composeRecord(rec, { sync: true });
  }
  function composeSpec(rec) {
    let photo = null;
    if (rec.kind === 'frame' && rec.frame.photoId) {
      const p = records.get(rec.frame.photoId);
      if (p && p.atlas) {
        const a = p.atlas;
        photo = { data: new Uint8ClampedArray(a.canvas.getContext('2d').getImageData(0, 0, a.w, a.h).data), sdf: Float32Array.from(a.sdf), w: a.w, h: a.h, pad: a.pad };
      }
    }
    return { kind: rec.kind, icon: rec.icon, settings: clone(rec.settings), photo, workingRes: rec.settings.workingRes };
  }
  function composeRecord(rec, opts) {
    if (rec.kind !== 'icon' && rec.kind !== 'frame') return;
    const spec = composeSpec(rec);
    if (state.composeMode === 'worker' && !(opts && opts.sync)) {
      const seq = ++composeSeq;
      rec.composeSeq = seq; pendingCompose.set(seq, rec);
      const transfer = spec.photo ? [spec.photo.data.buffer, spec.photo.sdf.buffer] : [];
      composeWorker.postMessage({ type: 'compose', id: rec.id, seq, spec }, transfer);
      return;
    }
    rec.composeSeq = ++composeSeq;
    installComposed(rec, StickerDecor.buildComposed(spec));
  }
  function onComposed(ev) {
    const m = ev.data;
    const rec = pendingCompose.get(m.seq); pendingCompose.delete(m.seq);
    if (!rec || !alive(rec) || rec.composeSeq !== m.seq) return;   // superseded or removed meanwhile
    if (m.type === 'error') { console.warn('compose worker error:', m.message); disableComposeWorker(); composeRecord(rec, { sync: true }); return; }
    installComposed(rec, m.out);
  }
  /* the composed result (from either thread) becomes the record's cutout */
  function installComposed(rec, out) {
    rec.source = { width: out.source.width, height: out.source.height };
    rec.work = { width: out.work.width, height: out.work.height };
    rec.mask = out.mask; rec.autoMask = out.mask; rec.maskVersion++;
    if (rec.kind === 'frame') rec.frame.layout = out.layout;
    const a = out.atlas;
    const toCanvas = (img) => { const c = document.createElement('canvas'); c.width = img.w; c.height = img.h; c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0); return c; };
    rec.atlas = { canvas: toCanvas(a.image), blink: a.blink ? toCanvas(a.blink) : null, sdf: a.sdf, w: a.w, h: a.h, x0: a.x0, y0: a.y0, scale: a.scale, pad: a.pad };
    const entry = scene.get(rec.id);
    if (entry && (entry.work.w !== rec.work.width || entry.work.h !== rec.work.height)) {
      // the drawing changed size (another frame shape): keep it centred where it is
      entry.work = { w: rec.work.width, h: rec.work.height };
      entry.cropCenter = { x: rec.work.width / 2, y: rec.work.height / 2 };
      scene.relayout(entry);
    }
    scene.setAtlas(rec.id, rec.atlas);
  }
  function scheduleCompose(rec) {
    clearTimeout(rec.composeTimer);
    rec.composeTimer = setTimeout(() => { if (alive(rec)) composeRecord(rec); }, state.composeMode === 'worker' ? 60 : 140);
  }

  /* the frame that decorations gather around: the selected one, else the newest */
  function anchorFrame() {
    if (selected && selected.kind === 'frame') return scene.get(selected.id);
    for (let i = scene.stickers.length - 1; i >= 0; i--) { const r = records.get(scene.stickers[i].id); if (r && r.kind === 'frame') return scene.stickers[i]; }
    return null;
  }

  function addIcon(id, opts) {
    opts = opts || {};
    const def = StickerDecor.iconById[id]; if (!def) return null;
    const settings = newLook('icon');
    if (def.line) settings.borderWidth = 0;
    if (def.text) settings.iconText = def.text;
    if (opts.text) settings.iconText = opts.text;
    settings.baseRotation = Math.round((Math.random() * 2 - 1) * 14);
    if (opts.settings) Object.assign(settings, opts.settings);   // a shared scene brings its own
    const rec = {
      id: 's' + nextId++, kind: 'icon', icon: id, name: id === 'emoji' ? settings.iconText : def.name, source: null,
      work: null, workData: null, mask: null, autoMask: null, maskVersion: 0, refined: null, history: [], atlas: null,
      settings, labels: null, phase: 'ready', lastBuildMs: 0,
    };
    rec.committed = clone(settings);
    records.set(rec.id, rec);
    composeRecord(rec, { sync: true });
    exitEditor();
    const anchor = opts.quiet ? null : anchorFrame();
    const entry = scene.add({ id: rec.id, work: { w: rec.work.width, h: rec.work.height }, settings, instant: true, near: anchor, layer: 2, select: !opts.quiet });
    scene.setAtlas(rec.id, rec.atlas);
    if (anchor) scene.attach(entry, anchor);
    els.drop.classList.add('hidden');
    if (opts.quiet) return rec;
    const what = id === 'emoji' ? rec.name : def.name.toLowerCase();
    pushHistory(addCommand(rec, 'add ' + what));
    setStatus(`Added ${what}${anchor ? ' · it sticks to the frame and moves with it' : ' · drag it anywhere'}`, false, { ttl: 3000 });
    return rec;
  }

  let frameCount = 0;
  function addFrame(opts) {
    opts = opts || {};
    const settings = newLook('frame');
    if (opts.settings) Object.assign(settings, opts.settings);
    const rec = {
      id: 's' + nextId++, kind: 'frame', name: 'Portrait frame' + (frameCount++ ? ' ' + frameCount : ''), source: null,
      work: null, workData: null, mask: null, autoMask: null, maskVersion: 0, refined: null, history: [], atlas: null,
      settings, labels: null, phase: 'ready', lastBuildMs: 0, frame: { photoId: '', layout: null },
    };
    rec.committed = clone(settings);
    records.set(rec.id, rec);
    composeRecord(rec, { sync: true });
    exitEditor();
    // a lone ready photo sticker jumps straight into the frame, which takes its place
    const loose = opts.quiet ? [] : [...records.values()].filter((r) => r.kind === 'sticker' && r.atlas && !r.framedIn);
    const le = loose.length === 1 ? scene.get(loose[0].id) : null;
    scene.add({ id: rec.id, work: { w: rec.work.width, h: rec.work.height }, settings, instant: true, at: le ? { x: le.x, y: le.y } : null, layer: 0, select: !opts.quiet });
    scene.setAtlas(rec.id, rec.atlas);
    els.drop.classList.add('hidden');
    if (opts.quiet) return rec;
    const cmds = [addCommand(rec, 'add frame')];
    if (le) cmds.push(frameCommand(rec, () => applyFramePhoto(rec, loose[0].id, { sync: true })));
    // loose icons already lying on the new frame stick to it
    const fe = scene.get(rec.id);
    for (const e of scene.stickers) { const r = records.get(e.id); if (r && r.kind === 'icon' && !e.parent && r.settings.iconStick && frameNear(e) === fe) scene.attach(e, fe); }
    syncSelection();
    pushHistory(composite('add frame', cmds));
    setStatus(loose.length === 1 ? `${loose[0].name} placed in the frame · type a caption in the panel` : 'Drop a sticker onto the frame window, or pick one under Photo in the panel', false, { ttl: 5000 });
    return rec;
  }

  /*
   * Put a photo sticker into a frame (or take it out with photoId = '').
   * The framed sticker leaves the stage but keeps its record, so it comes back
   * exactly as it was. opts: { sync, at } — compose on the main thread now,
   * and where a released photo should land.
   */
  function applyFramePhoto(frameRec, photoId, opts) {
    opts = opts || {};
    photoId = photoId || '';
    const cur = frameRec.frame.photoId || '';
    if (cur === photoId) { frameRec.settings.framePhoto = cur; return; }
    if (cur) releasePhoto(frameRec, true, opts.at);
    if (photoId) {
      const photo = records.get(photoId);
      if (!photo || photo.kind !== 'sticker' || !photo.atlas) { frameRec.settings.framePhoto = ''; composeRecord(frameRec, opts); syncSelection(); return; }
      if (photo.framedIn && photo.framedIn !== frameRec.id) {
        const other = records.get(photo.framedIn);
        if (other) { other.frame.photoId = ''; other.settings.framePhoto = ''; scheduleCompose(other); }
      } else if (scene.get(photo.id)) {
        scene.remove(photo.id);
      }
      photo.framedIn = frameRec.id;
      frameRec.frame.photoId = photoId;
    }
    frameRec.settings.framePhoto = frameRec.frame.photoId;
    composeRecord(frameRec, opts);
    syncSelection();
  }
  /* the same, recorded in the history */
  function setFramePhoto(frameRec, photoId, opts) {
    if ((frameRec.frame.photoId || '') === (photoId || '')) { frameRec.settings.framePhoto = frameRec.frame.photoId; return; }
    pushHistory(frameCommand(frameRec, () => applyFramePhoto(frameRec, photoId, opts)));
  }
  function releasePhoto(frameRec, quiet, at) {
    const photo = records.get(frameRec.frame.photoId);
    frameRec.frame.photoId = ''; frameRec.settings.framePhoto = '';
    if (!photo) return;
    photo.framedIn = null;
    const fe = scene.get(frameRec.id);
    if (!at) at = fe ? { x: Math.min(scene.stageW - 40, fe.x + scene.size(fe).w * 0.35), y: Math.min(scene.stageH - 40, fe.y + scene.size(fe).h * 0.2) } : null;
    scene.add({ id: photo.id, work: { w: photo.work.width, h: photo.work.height }, settings: photo.settings, instant: true, at, select: false });
    scene.setAtlas(photo.id, photo.atlas);
    if (!quiet) { composeRecord(frameRec); syncSelection(); }
  }
  function photoOptions(frameRec) {
    const opts = [['', 'none']];
    for (const r of records.values()) {
      if (r.kind !== 'sticker' || !r.atlas) continue;
      if (r.framedIn && r.framedIn !== frameRec.id) { opts.push([r.id, r.name + ' (in another frame)']); continue; }
      opts.push([r.id, r.name]);
    }
    return opts;
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

  function pushMaskHistory(rec) {
    if (!rec.mask) return;
    rec.history.push(rec.mask);
    if (rec.history.length > 12) rec.history.shift();
    if (rec === selected) els.btnUndo.disabled = false;
  }
  function undoMask() {
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
    let blink = null;
    if (rec.variant && rec.variant.width === w && rec.variant.height === h) {
      // the closed-eyes drawing, painted through the same alpha so it lines up exactly
      blink = document.createElement('canvas'); blink.width = aw; blink.height = ah;
      const bctx = blink.getContext('2d'), bout = bctx.createImageData(aw, ah);
      const vsrc = rec.variant.getContext('2d').getImageData(0, 0, w, h).data;
      for (let y = 0; y < ah; y++) {
        const sy = y + ay0; if (sy < 0 || sy >= h) continue;
        for (let x = 0; x < aw; x++) {
          const sx = x + ax0; if (sx < 0 || sx >= w) continue;
          const i = sy * w + sx, a = alpha[i]; if (a <= 0) continue;
          const o = (y * aw + x) * 4;
          bout.data[o] = vsrc[i * 4] * a; bout.data[o + 1] = vsrc[i * 4 + 1] * a; bout.data[o + 2] = vsrc[i * 4 + 2] * a; bout.data[o + 3] = a * 255;
        }
      }
      bctx.putImageData(bout, 0, 0);
    }
    const sdf = MaskOps.signedDistance(abin, aw, ah);
    rec.atlas = { canvas: atlasCanvas, blink, sdf, w: aw, h: ah, x0: ax0, y0: ay0, scale, pad };
    scene.setAtlas(rec.id, rec.atlas);
    rec.lastBuildMs = performance.now() - t0;
  }

  /* ------------------------------------------------------------------ */
  /* History: undo / redo on the canvas                                   */
  /* ------------------------------------------------------------------ */
  /*
   * Every change is a command with undo() and redo(). Settings edits are
   * recorded as diffs against the record's last committed settings, and a
   * slider drag (same key within a second) folds into one step.
   */
  const hist = { undo: [], redo: [], max: 120, muted: 0 };
  function pushHistory(cmd) {
    if (!cmd || hist.muted) return;
    hist.undo.push(cmd);
    if (hist.undo.length > hist.max) hist.undo.shift();
    hist.redo.length = 0;
    syncHistoryButtons();
  }
  function muted(fn) { hist.muted++; try { return fn(); } finally { hist.muted--; } }
  function undoCanvas() {
    const c = hist.undo.pop(); if (!c) return;
    muted(() => c.undo()); hist.redo.push(c);
    syncHistoryButtons(); syncSelection();
    setStatus('Undo · ' + c.label, false, { ttl: 1500 });
  }
  function redoCanvas() {
    const c = hist.redo.pop(); if (!c) return;
    muted(() => c.redo()); hist.undo.push(c);
    syncHistoryButtons(); syncSelection();
    setStatus('Redo · ' + c.label, false, { ttl: 1500 });
  }
  function syncHistoryButtons() {
    els.histUndo.disabled = !hist.undo.length; els.histRedo.disabled = !hist.redo.length;
    els.histUndo.title = hist.undo.length ? `Undo ${hist.undo[hist.undo.length - 1].label} (Ctrl+Z)` : 'Nothing to undo';
    els.histRedo.title = hist.redo.length ? `Redo ${hist.redo[hist.redo.length - 1].label} (Ctrl+Shift+Z)` : 'Nothing to redo';
  }
  const composite = (label, cmds) => ({ label, undo() { for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo(); }, redo() { for (const c of cmds) c.redo(); } });

  /* where an entry sits: position, rest, and what it is stuck to */
  function snapEntry(e) { return { x: e.x, y: e.y, restX: e.restX, restY: e.restY, parent: e.parent ? e.parent.id : null, offset: e.offset ? { u: e.offset.u, v: e.offset.v } : null }; }
  function restoreEntry(e, s) {
    if (!e) return;
    e.x = s.x; e.y = s.y; e.restX = s.restX; e.restY = s.restY; e.vx = 0; e.vy = 0;
    const p = s.parent ? scene.get(s.parent) : null;
    if (p && s.offset) { e.parent = p; e.offset = { u: s.offset.u, v: s.offset.v }; } else scene.detach(e);
  }

  /* settings: diff against the last committed values; `key` lets a slider drag coalesce */
  function commitSettings(rec, label, key) {
    if (!rec.committed) rec.committed = clone(rec.settings);
    const before = {}, after = {}; let n = 0;
    for (const k in rec.settings) {
      if (k === 'framePhoto' || rec.committed[k] === rec.settings[k]) continue;
      before[k] = rec.committed[k]; after[k] = rec.settings[k]; n++;
    }
    if (!n) return;
    Object.assign(rec.committed, after);
    if (hist.muted) return;
    const now = performance.now(), last = hist.undo[hist.undo.length - 1];
    if (key && last && last.type === 'settings' && last.rec === rec && last.key === key && now - last.at < 1200) { Object.assign(last.after, after); last.at = now; return; }
    const cmd = { type: 'settings', rec, key: n === 1 ? Object.keys(after)[0] : key, at: now, label: label || 'change', before, after,
      undo() { applySettings(rec, before); }, redo() { applySettings(rec, after); } };
    pushHistory(cmd);
  }
  function applySettings(rec, values) {
    if (!alive(rec)) return;
    Object.assign(rec.settings, values);
    if (!rec.committed) rec.committed = clone(rec.settings); else Object.assign(rec.committed, values);
    afterSettingsChange(rec, Object.keys(values));
  }
  /* the side effects a settings change needs (also used by undo / redo) */
  function afterSettingsChange(rec, keys) {
    const entry = scene.get(rec.id);
    let layout = false, compose = false, cutout = false, image = false;
    for (const k of keys) {
      const c = StickerUI.controlsByKey[k]; if (!c) continue;
      if (c.layout) layout = true;
      if (c.rebuild === 'compose') compose = true; else if (c.rebuild === 'cutout') cutout = true; else if (c.rebuild === 'image') image = true;
    }
    if (layout && entry) scene.relayout(entry);
    if (rec.kind !== 'sticker') { if (compose || cutout || image) composeRecord(rec); }
    else if (image) { prepareWork(rec); enqueue(() => extract(rec)); }
    else if (cutout) scheduleRebuild(rec);
    if (keys.includes('iconStick') && entry) restick(entry);
    rememberLook(rec);
    if (rec === selected) { panel.refresh(); if (rec.kind === 'frame') panel.setOptions('framePhoto', photoOptions(rec)); }
    els.preset.value = '';
  }
  let sceneCommitted = clone(sceneSettings);
  function commitScene(label, key) {
    const before = {}, after = {}; let n = 0;
    for (const k in sceneSettings) if (sceneCommitted[k] !== sceneSettings[k]) { before[k] = sceneCommitted[k]; after[k] = sceneSettings[k]; n++; }
    if (!n) return;
    Object.assign(sceneCommitted, after);
    if (hist.muted) return;
    const now = performance.now(), last = hist.undo[hist.undo.length - 1];
    if (key && last && last.type === 'scene' && last.key === key && now - last.at < 1200) { Object.assign(last.after, after); last.at = now; return; }
    const apply = (v) => { Object.assign(sceneSettings, v); Object.assign(sceneCommitted, v); panel.refresh(); applyScene(); persist(); };
    pushHistory({ type: 'scene', key, at: now, label: label || 'scene', before, after, undo() { apply(before); }, redo() { apply(after); } });
  }

  /* an item on the stage: undo removes it, redo puts it back where it was */
  function addCommand(rec, label) {
    const e = scene.get(rec.id), snap = snapEntry(e), layer = e.layer;
    return { type: 'add', label, undo() { removeRecord(rec); }, redo() { restoreRecord(rec, snap, layer); } };
  }
  function removeCommand(rec, label) {
    const e = scene.get(rec.id), snap = snapEntry(e), layer = e.layer;
    // icons stuck to a frame come back stuck to it
    const kids = scene.children(e).map((c) => ({ id: c.id, offset: { u: c.offset.u, v: c.offset.v } }));
    return {
      type: 'remove', label,
      undo() {
        restoreRecord(rec, snap, layer);
        const parent = scene.get(rec.id);
        for (const k of kids) { const ce = scene.get(k.id); if (ce && parent) { ce.parent = parent; ce.offset = { u: k.offset.u, v: k.offset.v }; } }
      },
      redo() { removeRecord(rec); },
    };
  }
  function removeRecord(rec) {
    if (!alive(rec)) return;
    if (state.mode === 'edit' && selected === rec) exitEditor();
    scene.remove(rec.id);
    records.delete(rec.id);
    if (selected === rec) selected = null;
    if (!records.size) els.drop.classList.remove('hidden');
    syncSelection();
  }
  function restoreRecord(rec, snap, layer) {
    if (alive(rec)) return;
    records.set(rec.id, rec);
    const ready = !!rec.atlas;
    scene.add({ id: rec.id, work: { w: rec.work.width, h: rec.work.height }, full: ready ? null : rec.work, settings: rec.settings, instant: ready, at: { x: snap.x, y: snap.y }, layer, select: false });
    if (ready) scene.setAtlas(rec.id, rec.atlas);
    else if (rec.kind === 'sticker') enqueue(() => extract(rec));   // it was still being cut out when it was undone
    restoreEntry(scene.get(rec.id), snap);
    els.drop.classList.add('hidden');
    syncSelection();
  }
  /* a framing change: runs `fn` now and remembers where every affected photo was */
  function frameCommand(frameRec, fn) {
    const photosOnStage = () => { const out = {}; for (const r of records.values()) if (r.kind === 'sticker') { const e = scene.get(r.id); if (e) out[r.id] = snapEntry(e); } return out; };
    const before = { photo: frameRec.frame.photoId || '', snaps: photosOnStage() };
    fn();
    const after = { photo: frameRec.frame.photoId || '', snaps: photosOnStage() };
    const apply = (st) => {
      if (!alive(frameRec)) return;
      applyFramePhoto(frameRec, st.photo, { at: st.snaps[st.photo === before.photo ? after.photo : before.photo] });
      for (const id in st.snaps) restoreEntry(scene.get(id), st.snaps[id]);
    };
    return { type: 'frame', label: after.photo ? 'put photo in frame' : 'take photo out', undo() { apply(before); }, redo() { apply(after); } };
  }

  /* drags: the app snapshots the entry at the start and records the move at the end */
  let dragSnap = null;
  scene.onDragStart = (entry) => { dragSnap = snapEntry(entry); };
  scene.onDragEnd = (entry) => {
    restick(entry);
    const before = dragSnap; dragSnap = null;
    if (!before) return;
    const after = snapEntry(entry);
    if (Math.hypot(after.restX - before.restX, after.restY - before.restY) < 1 && after.parent === before.parent) return;
    const id = entry.id;
    pushHistory({ type: 'move', label: 'move', undo() { restoreEntry(scene.get(id), before); }, redo() { restoreEntry(scene.get(id), after); } });
  };

  /* ------------------------------------------------------------------ */
  /* Selection → panel, buttons, delete control                           */
  /* ------------------------------------------------------------------ */
  function syncSelection() {
    const rec = selected;
    const ready = !!(rec && rec.mask);
    const kind = rec ? rec.kind : null;
    panel.bind(rec ? rec.settings : null, sceneSettings, kind);
    if (kind === 'frame') panel.setOptions('framePhoto', photoOptions(rec));
    els.panelName.textContent = rec ? rec.name : 'Knobs';
    const subs = { frame: rec && rec.frame && rec.frame.photoId ? 'editing this frame' : 'drop a sticker on the frame window', icon: 'editing this icon' };
    els.panelSub.textContent = rec ? (ready ? subs[kind] || 'editing this sticker' : 'cutting out…') : (records.size ? 'select a sticker on the canvas' : 'add an image to start');
    els.edit.disabled = !ready || kind !== 'sticker';
    els.exportMenu.querySelectorAll('button[data-export]').forEach((b) => {
      const kind = b.dataset.export;
      b.disabled = kind === 'link' ? false : kind === 'canvas' || kind === 'clip' ? records.size === 0 : !ready;
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
    const cmds = [];
    // a frame gives its photo back before it goes
    if (rec.kind === 'frame' && rec.frame.photoId) cmds.push(frameCommand(rec, () => applyFramePhoto(rec, '')));
    const rm = removeCommand(rec, 'delete ' + rec.name);
    rm.redo(); cmds.push(rm);
    pushHistory(composite('delete ' + rec.name, cmds));
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
      // what is cut away sinks under a plum tint; the die-cut line is pink
      if (m[i] < 0.5) { d[j] = 58; d[j + 1] = 42; d[j + 2] = 53; d[j + 3] = 165 + (0.5 - Math.max(0, m[i])) * 80; }
    }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; const a = m[i] >= 0.5;
      if (a !== (m[i - 1] >= 0.5) || a !== (m[i + 1] >= 0.5) || a !== (m[i - w] >= 0.5) || a !== (m[i + w] >= 0.5)) {
        const j = i * 4; d[j] = 255; d[j + 1] = 143; d[j + 2] = 184; d[j + 3] = 255;
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
    pushMaskHistory(rec);
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
    pushMaskHistory(rec);
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
  els.btnUndo.addEventListener('click', undoMask);
  els.btnInvert.addEventListener('click', () => { const rec = selected; if (!rec) return; pushMaskHistory(rec); const m = Float32Array.from(rec.mask); for (let i = 0; i < m.length; i++) m[i] = 1 - m[i]; rec.mask = m; rec.maskVersion++; drawEditor(); scheduleRebuild(rec); });
  els.btnClear.addEventListener('click', () => { const rec = selected; if (!rec) return; pushMaskHistory(rec); rec.mask = new Float32Array(rec.mask.length); rec.maskVersion++; drawEditor(); scheduleRebuild(rec); });
  els.btnReset.addEventListener('click', () => { const rec = selected; if (!rec || !rec.autoMask) return; pushMaskHistory(rec); rec.mask = Float32Array.from(rec.autoMask); rec.maskVersion++; drawEditor(); scheduleRebuild(rec); });
  els.btnAuto.addEventListener('click', () => { const rec = selected; if (!rec) return; enqueue(async () => { await extract(rec); drawEditor(); }); });
  els.edit.addEventListener('click', () => { if (state.mode === 'edit') exitEditor(); else enterEditor(); });

  document.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'Escape') {
      if (exportDetails.open || els.iconMenuWrap.open) { exportDetails.open = false; els.iconMenuWrap.open = false; return; }
      if (state.mode === 'edit') exitEditor(); else scene.select(null);
    }
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (state.mode === 'edit') {
      if (e.key === '[') { els.brushSize.value = Math.max(2, parseFloat(els.brushSize.value) - 4); drawEditor(); }
      if (e.key === ']') { els.brushSize.value = Math.min(160, parseFloat(els.brushSize.value) + 4); drawEditor(); }
      if (mod && k === 'z') { e.preventDefault(); undoMask(); }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault(); deleteSelected();
    } else if (mod && k === 'z' && e.shiftKey) { e.preventDefault(); redoCanvas(); }
    else if (mod && k === 'z') { e.preventDefault(); undoCanvas(); }
    else if (mod && k === 'y') { e.preventDefault(); redoCanvas(); }
    else if (mod && k === 'c' && selected && selected.atlas) { e.preventDefault(); copySticker(); }
  });
  els.histUndo.addEventListener('click', undoCanvas);
  els.histRedo.addEventListener('click', redoCanvas);

  /* ------------------------------------------------------------------ */
  /* Panel + presets                                                      */
  /* ------------------------------------------------------------------ */
  function applyScene() {
    const s = sceneSettings;
    els.stage.style.setProperty('--stage-bg', s.background);
    els.stage.classList.toggle('checker', !!s.checker);
    const tile = s.checker ? null : StickerDecor.patternTile(s.bgPattern, s.bgPatternColor, s.bgPatternScale, 2);
    if (tile) {
      els.stage.style.backgroundImage = `url(${tile.toDataURL()})`;
      els.stage.style.backgroundSize = `${tile.width / 2}px ${tile.height / 2}px`;
    } else { els.stage.style.backgroundImage = ''; els.stage.style.backgroundSize = ''; }
    els.stage.classList.toggle('patterned', !!tile);
    const c = StickerRenderer.hexToRgb(s.background);
    const light = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 0.6;
    els.stage.classList.toggle('light', light);
    document.documentElement.style.setProperty('--stage-ink', light ? '#1a1a1f' : '#f2f0ea');
  }
  function applyTheme(name) {
    const t = StickerDecor.THEMES[name]; if (!t) return;
    Object.assign(sceneSettings, t);
    sceneSettings.sceneTheme = name;
    panel.refresh(); applyScene(); persist();
    commitScene('theme ' + name);
  }

  function rememberLook(rec) {
    if (rec.kind !== 'sticker') return; // frames and icons keep their own look
    for (const k of LOOK_KEYS) lastLook[k] = rec.settings[k];
    persist();
  }

  panel = StickerUI.buildPanel(els.panel, (key, value, control) => {
    if (control.scene) {
      if (key === 'sceneTheme') { if (value) applyTheme(value); return; }
      sceneSettings.sceneTheme = ''; panel.refresh();
      applyScene(); persist();
      commitScene(control.label.toLowerCase(), key);
      return;
    }
    const rec = selected; if (!rec) return;
    const entry = scene.get(rec.id);
    if (key === 'framePhoto') { setFramePhoto(rec, value); return; }
    if (key === 'framePreset') { if (value) { Object.assign(rec.settings, StickerDecor.FRAME_PRESETS[value]); panel.refresh(); composeRecord(rec); commitSettings(rec, 'frame style'); } return; }
    if (key === 'iconPalette') { if (value) { Object.assign(rec.settings, StickerDecor.ICON_PALETTES[value]); panel.refresh(); composeRecord(rec); commitSettings(rec, 'palette'); } return; }
    if (key === 'iconStick') { if (entry) restick(entry); commitSettings(rec, 'stick to frame'); return; }
    // hand edits turn the one-click style back to "Custom"
    if (rec.kind === 'frame' && FRAME_STYLE_KEYS.includes(key) && rec.settings.framePreset) { rec.settings.framePreset = ''; panel.refresh(); }
    if (rec.kind === 'icon' && ICON_COLOR_KEYS.includes(key) && rec.settings.iconPalette) { rec.settings.iconPalette = ''; panel.refresh(); }
    rememberLook(rec);
    if (control.layout && entry) scene.relayout(entry);
    if (control.rebuild === 'compose') scheduleCompose(rec);
    else if (control.rebuild === 'image') { prepareWork(rec); enqueue(() => extract(rec)); }
    else if (control.rebuild === 'cutout') scheduleRebuild(rec);
    if (control.rebuild !== 'compose') els.preset.value = '';
    commitSettings(rec, control.label.toLowerCase(), key);
  });
  panel.bind(null, sceneSettings, null);
  applyScene();

  for (const name in StickerUI.PRESETS) { const o = document.createElement('option'); o.value = name; o.textContent = name; els.preset.appendChild(o); }
  els.preset.value = '';
  els.preset.addEventListener('change', () => {
    const rec = selected;
    if (!els.preset.value || !rec) { els.preset.value = ''; return; }
    StickerUI.applyPreset(rec.settings, els.preset.value);
    for (const k of SCENE_KEYS) rec.settings[k] = sceneSettings[k];
    panel.refresh(); rememberLook(rec);
    commitSettings(rec, 'preset ' + els.preset.value);
  });

  els.copySettings.addEventListener('click', async () => {
    const src = clone(selected ? selected.settings : newLook('sticker'));
    delete src.framePhoto;
    if (!selected || selected.kind === 'sticker') for (const k of COMPOSE_KEYS) delete src[k];
    const json = JSON.stringify(src, null, 2);
    try { await navigator.clipboard.writeText(json); setStatus('Settings copied to clipboard', false, { ttl: 2000 }); }
    catch (e) { window.prompt('Copy your settings:', json); }
  });
  els.pasteSettings.addEventListener('click', () => {
    const raw = window.prompt('Paste settings JSON:'); if (!raw) return;
    try {
      const obj = JSON.parse(raw); let n = 0, composed = false;
      const target = selected ? selected.settings : lastLook;
      for (const k in obj) {
        if (!(k in StickerUI.DEFAULTS) || k === 'framePhoto') continue;
        if (SCENE_KEYS.includes(k)) sceneSettings[k] = obj[k];
        else if (COMPOSE_KEYS.includes(k)) { if (selected && selected.kind !== 'sticker') { target[k] = obj[k]; composed = true; } else continue; }
        else target[k] = obj[k];
        n++;
      }
      if (selected) {
        rememberLook(selected);
        if (composed) scheduleCompose(selected); else scheduleRebuild(selected);
        const entry = scene.get(selected.id); if (entry) scene.relayout(entry);
        commitSettings(selected, 'paste settings');
      }
      panel.refresh(); applyScene(); persist();
      commitScene('paste settings');
      setStatus(`Imported ${n} settings`, false, { ttl: 2000 });
    } catch (e) { setStatus('That was not valid JSON', false, { error: true, ttl: 3000 }); }
  });
  els.resetSettings.addEventListener('click', () => {
    for (const k of SCENE_KEYS) sceneSettings[k] = StickerUI.DEFAULTS[k];
    for (const k of LOOK_KEYS) lastLook[k] = StickerUI.DEFAULTS[k];
    const rec = selected;
    if (rec) {
      Object.assign(rec.settings, StickerUI.DEFAULTS, KIND_LOOK[rec.kind] || {});
      if (rec.kind === 'frame') rec.settings.framePhoto = rec.frame.photoId;
      if (rec.kind === 'sticker') scheduleRebuild(rec); else scheduleCompose(rec);
      const entry = scene.get(rec.id); if (entry) scene.relayout(entry);
      commitSettings(rec, 'reset');
    }
    panel.refresh(); applyScene(); persist(); els.preset.value = '';
    commitScene('reset');
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

  /* The whole stage with the backdrop colour and its pattern, as on screen. */
  function canvasWithBackdrop() {
    const shot = scene.snapshotCanvas({ background: null });
    const out = document.createElement('canvas'); out.width = shot.width; out.height = shot.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = sceneSettings.background; ctx.fillRect(0, 0, out.width, out.height);
    if (!sceneSettings.checker && sceneSettings.bgPattern !== 'none') {
      StickerDecor.fillPattern(ctx, 0, 0, out.width, out.height, sceneSettings.bgPattern, sceneSettings.bgPatternColor, sceneSettings.bgPatternScale * (shot.width / scene.stageW));
    }
    ctx.drawImage(shot, 0, 0);
    return out;
  }

  const exportDetails = els.exportMenu.closest('details');
  document.addEventListener('pointerdown', (e) => {
    for (const d of [exportDetails, els.iconMenuWrap]) if (d.open && !d.contains(e.target)) d.open = false;
  });

  /* ------------------------------------------------------------------ */
  /* Frame + icon buttons                                                 */
  /* ------------------------------------------------------------------ */
  els.frame.addEventListener('click', () => addFrame());
  /* little drawings in the chrome: the brand mark and the empty-state art */
  $('#brandMark').appendChild(StickerDecor.thumbnail('cloudface', 34));
  for (const id of ['roll', 'cloud', 'heart', 'star', 'teacup']) $('#emptyArt').appendChild(StickerDecor.thumbnail(id, 62));
  /*
   * The sticker tray: a search box that also takes any emoji or word, tabs per
   * group, one scrolling body. Click adds and closes; shift-click keeps it open.
   */
  {
    const menu = els.iconMenu;
    const EMOJI = ['🍓', '🌸', '🍰', '☁️', '⭐', '🌈', '🎀', '🧸', '🍩', '🍪', '☕', '🍬', '🎈', '💖', '✨', '🌙', '🐰', '🐱', '🐶', '🦄', '🍡', '🧁', '🎵', '💌'];
    const TABS = [{ id: 'emoji', title: 'Emoji' }].concat(StickerDecor.ICON_GROUPS.map((g, i) => ({ id: 'g' + i, title: g.title, ids: g.ids })));
    const head = document.createElement('div'); head.className = 'icon-head';
    head.innerHTML = `
      <label class="icon-search">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.2 9.2L12.5 12.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="iconSearch" type="text" placeholder="Search, or type an emoji / word" autocomplete="off" spellcheck="false" maxlength="24" aria-label="Search icons, or type an emoji or word to add">
        <button id="emojiAdd" type="button" class="btn small primary" hidden>Add</button>
      </label>
      <div class="icon-tabs" role="tablist"></div>`;
    const tabs = head.querySelector('.icon-tabs');
    const body = document.createElement('div'); body.className = 'icon-body';
    const sections = {};
    for (const t of TABS) {
      const tb = document.createElement('button'); tb.type = 'button'; tb.role = 'tab'; tb.dataset.tab = t.id; tb.textContent = t.title; tabs.appendChild(tb);
      const sec = document.createElement('section'); sec.dataset.tab = t.id; sec.hidden = true; sections[t.id] = sec;
      if (t.id === 'emoji') {
        const row = document.createElement('div'); row.className = 'emoji-row';
        for (const em of EMOJI) { const b = document.createElement('button'); b.type = 'button'; b.className = 'emoji-pick'; b.dataset.emoji = em; b.textContent = em; b.title = 'Add ' + em; row.appendChild(b); }
        sec.appendChild(row);
        const hint = document.createElement('p'); hint.className = 'icon-hint'; hint.textContent = 'Any emoji works — type or paste one above and press Enter. A short word becomes a hand-lettered sticker.'; sec.appendChild(hint);
      } else {
        const grid = document.createElement('div'); grid.className = 'icon-cells';
        for (const id of t.ids) {
          const def = StickerDecor.iconById[id]; if (!def) continue;
          const b = document.createElement('button'); b.type = 'button'; b.dataset.icon = def.id; b.dataset.name = def.name.toLowerCase(); b.title = def.name;
          b.appendChild(StickerDecor.thumbnail(def.id, 44));
          const label = document.createElement('span'); label.textContent = def.name; b.appendChild(label);
          grid.appendChild(b);
        }
        sec.appendChild(grid);
      }
      body.appendChild(sec);
    }
    const foot = document.createElement('div'); foot.className = 'icon-foot'; foot.textContent = 'Click to add · shift-click keeps the tray open · new icons stick to the selected frame';
    menu.appendChild(head); menu.appendChild(body); menu.appendChild(foot);

    const input = head.querySelector('#iconSearch'), addBtn = head.querySelector('#emojiAdd');
    let current = '';
    try { current = localStorage.getItem('sticker-shader-editor:tray') || ''; } catch (e) { /* ignore */ }
    if (!sections[current]) current = 'emoji';
    function showTab(id) {
      current = id;
      for (const t of TABS) { sections[t.id].hidden = t.id !== id; }
      tabs.querySelectorAll('button').forEach((b) => { b.classList.toggle('active', b.dataset.tab === id); b.setAttribute('aria-selected', String(b.dataset.tab === id)); });
      try { localStorage.setItem('sticker-shader-editor:tray', id); } catch (e) { /* ignore */ }
      body.scrollTop = 0;
    }
    /* searching shows every matching icon across the groups; the text can always be added as a sticker */
    function applySearch() {
      const q = input.value.trim().toLowerCase();
      addBtn.hidden = !q;
      addBtn.textContent = q ? `Add “${input.value.trim()}”` : 'Add';
      menu.classList.toggle('searching', !!q);
      if (!q) { showTab(current); body.querySelectorAll('button[data-icon]').forEach((b) => { b.hidden = false; }); return; }
      let any = 0;
      for (const t of TABS) {
        if (t.id === 'emoji') { sections[t.id].hidden = true; continue; }
        let n = 0;
        sections[t.id].querySelectorAll('button[data-icon]').forEach((b) => { const hit = b.dataset.name.includes(q); b.hidden = !hit; if (hit) n++; });
        sections[t.id].hidden = n === 0; any += n;
      }
      tabs.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      foot.textContent = any ? `${any} match${any > 1 ? 'es' : ''} · Enter adds the first, or add the text itself` : 'No icon by that name · Enter adds it as an emoji / word sticker';
    }
    const done = (keepOpen) => { if (!keepOpen) els.iconMenuWrap.open = false; input.value = ''; applySearch(); foot.textContent = 'Click to add · shift-click keeps the tray open · new icons stick to the selected frame'; };
    const addText = (keepOpen) => { const text = input.value.trim(); if (!text) return; addIcon('emoji', { text }); done(keepOpen); };
    tabs.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { input.value = ''; applySearch(); showTab(b.dataset.tab); } });
    input.addEventListener('input', applySearch);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { input.value = ''; applySearch(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = body.querySelector('section:not([hidden]) button[data-icon]:not([hidden])');
      if (input.value.trim() && first && menu.classList.contains('searching')) { addIcon(first.dataset.icon); done(e.shiftKey); } else addText(e.shiftKey);
    });
    addBtn.addEventListener('click', (e) => addText(e.shiftKey));
    body.addEventListener('click', (e) => {
      const em = e.target.closest('button[data-emoji]');
      if (em) { addIcon('emoji', { text: em.dataset.emoji }); done(e.shiftKey); return; }
      const b = e.target.closest('button[data-icon]'); if (!b) return;
      addIcon(b.dataset.icon); done(e.shiftKey);
    });
    els.iconMenuWrap.addEventListener('toggle', () => { if (els.iconMenuWrap.open) setTimeout(() => input.focus({ preventScroll: true }), 0); });
    showTab(current);
  }

  /* the caption font arrives late; redraw anything with lettering once it does */
  StickerDecor.loadFonts().then((ok) => {
    if (!ok) return;
    for (const rec of records.values()) if (rec.kind === 'frame' || (rec.kind === 'icon' && StickerDecor.iconById[rec.icon].text)) composeRecord(rec);
  });
  els.exportMenu.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-export]'); if (!b) return;
    exportDetails.open = false;
    const kind = b.dataset.export;
    const rec = selected, entry = rec ? scene.get(rec.id) : null;
    try {
      if (kind === 'canvas') { download(await canvasBlob(canvasWithBackdrop()), 'sticker-canvas.png'); return; }
      if (kind === 'clip') {
        setStatus('Recording a 4 second clip…', null);
        const blob = await scene.record(4, sceneSettings.background);
        setStatus('Clip ready', false, { ttl: 2000 });
        download(blob, 'sticker-clip.webm'); return;
      }
      if (kind === 'link') { await copyShareLink(); return; }
      if (!rec || !entry || !entry.tex) return;
      if (kind === 'png') download(await canvasBlob(scene.snapshot(entry, { scale: 1, shadow: false })), baseName(rec) + '-sticker.png');
      else if (kind === 'png2x') download(await canvasBlob(scene.snapshot(entry, { scale: 2, shadow: false })), baseName(rec) + '-sticker@2x.png');
      else if (kind === 'posed') download(await canvasBlob(scene.snapshot(entry, { scale: 1, posed: true, shadow: true })), baseName(rec) + '-posed.png');
      else if (kind === 'cutout') download(await canvasBlob(rec.atlas.canvas), baseName(rec) + '-cutout.png');
      else if (kind === 'pack') download(await canvasBlob(packCanvas(entry, 512)), baseName(rec) + '-512.png');
      else if (kind === 'copy') await copySticker();
      else if (kind === 'svg') {
        setStatus('Building the SVG…', null); await nextTick();
        const svg = animatedSvg(entry);
        const kids = scene.children(entry).length;
        setStatus(`Animated SVG ready · ${Math.round(svg.length / 1024)} KB${kids ? ` · ${kids} stuck icon${kids > 1 ? 's' : ''} included` : ''}`, false, { ttl: 4000 });
        download(new Blob([svg], { type: 'image/svg+xml' }), baseName(rec) + '-animated.svg');
      }
      else if (kind === 'apng' || kind === 'gif') {
        setStatus('Rendering the animation…', null); await nextTick();
        const anim = scene.animationFrames(entry, { size: 512, fps: 16, shadow: false });
        setStatus(`Encoding ${anim.frames.length} frames…`, null); await nextTick();
        const blob = kind === 'apng' ? await StickerAnim.encodeAPNG(anim.frames, anim.fps) : StickerAnim.encodeGIF(anim.frames, anim.fps);
        setStatus(`Animated ${kind === 'apng' ? 'PNG' : 'GIF'} ready · ${anim.seconds.toFixed(1)} s loop · ${Math.round(blob.size / 1024)} KB`, false, { ttl: 4000 });
        download(blob, baseName(rec) + (kind === 'apng' ? '-animated.png' : '-animated.gif'));
      }
    } catch (err) { console.error(err); setStatus('Export failed: ' + err.message, false, { error: true, ttl: 4000 }); }
  });

  /*
   * Animated SVG of a sticker: its flat render as an embedded image, its idle
   * animation, a foil sweep and blinking as SVG animation. A frame brings every
   * icon stuck to it, nested so they follow its motion.
   */
  function svgNode(entry, withChildren) {
    const sz = scene.size(entry);
    // crisp but not huge: the longest side of an embedded picture stays around 1200 px
    const scale = Math.min(2, 1200 / Math.max(entry.atlas.w, entry.atlas.h));
    const flat = scene.snapshot(entry, { scale, shadow: false });
    const blink = entry.tex.blink ? scene.snapshot(entry, { scale, shadow: false, tex: Object.assign({}, entry.tex, { img: entry.tex.blink }) }) : null;
    const node = { img: flat.toDataURL('image/png'), blink: blink ? blink.toDataURL('image/png') : null, w: sz.w, h: sz.h, rot: entry.settings.baseRotation || 0, cfg: entry.settings, children: [] };
    if (withChildren) {
      for (const c of scene.children(entry)) {
        if (!c.tex || !c.offset) continue;
        const n = svgNode(c, false);
        n.x = c.offset.u * sz.w; n.y = c.offset.v * sz.h;
        node.children.push(n);
      }
    }
    return node;
  }
  function animatedSvg(entry) {
    return StickerAnim.encodeSVG(svgNode(entry, true), { animOffsets: StickerScene.animOffsets, periods: StickerScene.ANIM_PERIOD });
  }

  /* the flat sticker fitted into a square, the size sticker packs want (512 × 512) */
  function packCanvas(entry, size) {
    const flat = scene.snapshot(entry, { scale: 1, shadow: false });
    const out = document.createElement('canvas'); out.width = size; out.height = size;
    const ctx = out.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    const k = (size * 0.96) / Math.max(flat.width, flat.height);
    ctx.drawImage(flat, (size - flat.width * k) / 2, (size - flat.height * k) / 2, flat.width * k, flat.height * k);
    return out;
  }
  async function copySticker() {
    const rec = selected, entry = rec ? scene.get(rec.id) : null;
    if (!rec || !entry || !entry.tex) return;
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') { setStatus('This browser cannot put images on the clipboard', false, { error: true, ttl: 3000 }); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasBlob(scene.snapshot(entry, { scale: 1, shadow: false })) })]);
      setStatus(`${rec.name} copied · paste it anywhere that takes images`, false, { ttl: 2500 });
    } catch (err) { setStatus('Copy failed: ' + err.message, false, { error: true, ttl: 3000 }); }
  }

  /* ------------------------------------------------------------------ */
  /* Share link: frames, icons and the scene packed into the URL hash.    */
  /* Photos never leave the machine; a link opens with empty frames.      */
  /* ------------------------------------------------------------------ */
  function bytesToB64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBytes(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function packText(text) {
    const bytes = new TextEncoder().encode(text);
    if (typeof CompressionStream === 'undefined') return 'j' + bytesToB64url(bytes);
    const cs = new CompressionStream('deflate-raw'); const w = cs.writable.getWriter(); w.write(bytes); w.close();
    return 'd' + bytesToB64url(new Uint8Array(await new Response(cs.readable).arrayBuffer()));
  }
  async function unpackText(str) {
    const bytes = b64urlToBytes(str.slice(1));
    if (str[0] === 'j') return new TextDecoder().decode(bytes);
    const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
  }
  /* only what differs from the defaults, positions as fractions of the stage */
  function serializeScene() {
    const D = StickerUI.DEFAULTS;
    const diff = (s) => { const o = {}; for (const k in s) if (k !== 'framePhoto' && k in D && s[k] !== D[k]) o[k] = s[k]; return o; };
    const entries = scene.stickers.filter((e) => { const r = records.get(e.id); return r && r.kind !== 'sticker'; });
    const index = new Map(entries.map((e, i) => [e.id, i]));
    const items = entries.map((e) => {
      const r = records.get(e.id);
      const it = { k: r.kind, s: diff(r.settings), x: +(e.x / scene.stageW).toFixed(4), y: +(e.y / scene.stageH).toFixed(4) };
      if (r.kind === 'icon') it.i = r.icon;
      if (e.parent && index.has(e.parent.id) && e.offset) { it.p = index.get(e.parent.id); it.o = [+e.offset.u.toFixed(3), +e.offset.v.toFixed(3)]; }
      return it;
    });
    return { v: 1, scene: diff(sceneSettings), items };
  }
  async function shareLink() {
    const data = serializeScene();
    return { data, url: location.origin + location.pathname + '#s=' + await packText(JSON.stringify(data)) };
  }
  async function copyShareLink() {
    const { data, url } = await shareLink();
    if (!data.items.length) { setStatus('Add a frame or some icons first · photos are never part of a share link', false, { error: true, ttl: 4000 }); return; }
    try { window.history.replaceState(null, '', url); } catch (e) { /* ignore */ }
    try { await navigator.clipboard.writeText(url); setStatus(`Share link copied · ${data.items.length} items, ${(url.length / 1024).toFixed(1)} KB · photos stay on your machine`, false, { ttl: 4500 }); }
    catch (e) { window.prompt('Copy your share link:', url); }
  }
  async function loadSharedScene(hash) {
    const m = /[#&]s=([^&]+)/.exec(hash == null ? location.hash : hash); if (!m) return false;
    let data;
    try { data = JSON.parse(await unpackText(m[1])); } catch (e) { setStatus('That share link could not be read', false, { error: true, ttl: 4000 }); return false; }
    if (!data || data.v !== 1 || !Array.isArray(data.items)) return false;
    muted(() => {
      Object.assign(sceneSettings, data.scene || {}); applyScene(); persist();
      const made = [];
      for (const it of data.items) {
        const s = it.s || {}; delete s.framePhoto;
        const rec = it.k === 'frame' ? addFrame({ quiet: true, settings: s }) : addIcon(it.i, { quiet: true, settings: s });
        if (!rec) { made.push(null); continue; }
        rec.committed = clone(rec.settings);
        const e = scene.get(rec.id);
        e.x = e.restX = it.x * scene.stageW; e.y = e.restY = it.y * scene.stageH;
        scene.relayout(e);
        made.push(e);
      }
      data.items.forEach((it, i) => { const e = made[i]; if (e && it.p != null && made[it.p] && it.o) { e.parent = made[it.p]; e.offset = { u: it.o[0], v: it.o[1] }; } });
    });
    sceneCommitted = clone(sceneSettings);
    scene.select(null); syncSelection();
    setStatus(`Opened a shared scene · ${data.items.length} items · drop your own photo onto the frame`, false, { ttl: 5000 });
    return true;
  }

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
    if (variant === 2) {
      // a round little bunny on pink paper — made to sit in a portrait frame
      const bg = ctx.createLinearGradient(0, 0, 0, 900); bg.addColorStop(0, '#fbe6ee'); bg.addColorStop(1, '#f3cfdd');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 900);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let y = 60; y < 900; y += 120) for (let x = 60 + ((y / 120) % 2) * 60; x < 1200; x += 120) { ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); }
      ctx.save(); ctx.translate(600, 500);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#2b2a33'; ctx.lineWidth = 14;
      const part = (fill, path) => { ctx.beginPath(); path(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };
      // ears
      part('#ffffff', () => ctx.ellipse(-120, -300, 58, 170, -0.25, 0, Math.PI * 2));
      part('#ffffff', () => ctx.ellipse(120, -300, 58, 170, 0.25, 0, Math.PI * 2));
      ctx.fillStyle = '#f7c6d4';
      ctx.beginPath(); ctx.ellipse(-118, -300, 30, 120, -0.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(118, -300, 30, 120, 0.25, 0, Math.PI * 2); ctx.fill();
      // body + head
      part('#ffffff', () => ctx.ellipse(0, 190, 200, 150, 0, 0, Math.PI * 2));
      part('#ffffff', () => ctx.ellipse(0, -60, 250, 210, 0, 0, Math.PI * 2));
      // paws
      part('#ffffff', () => ctx.ellipse(-120, 240, 70, 50, 0.2, 0, Math.PI * 2));
      part('#ffffff', () => ctx.ellipse(120, 240, 70, 50, -0.2, 0, Math.PI * 2));
      // face
      ctx.fillStyle = '#2b2a33';
      ctx.beginPath(); ctx.ellipse(-95, -70, 22, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(95, -70, 22, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-88, -80, 8, 0, Math.PI * 2); ctx.arc(102, -80, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(247,150,175,0.75)';
      ctx.beginPath(); ctx.ellipse(-160, -10, 38, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(160, -10, 38, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-30, -5); ctx.quadraticCurveTo(0, 25, 30, -5); ctx.stroke();
      ctx.fillStyle = '#f7a8bd'; ctx.beginPath(); ctx.ellipse(0, -18, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
      // bow
      ctx.lineWidth = 10;
      part('#9ec9ee', () => { ctx.moveTo(-190, -215); ctx.bezierCurveTo(-250, -300, -320, -270, -290, -200); ctx.bezierCurveTo(-270, -160, -220, -180, -190, -215); ctx.closePath(); });
      part('#9ec9ee', () => { ctx.moveTo(-190, -215); ctx.bezierCurveTo(-160, -300, -80, -300, -110, -220); ctx.bezierCurveTo(-125, -170, -170, -180, -190, -215); ctx.closePath(); });
      part('#9ec9ee', () => ctx.arc(-190, -215, 22, 0, Math.PI * 2));
      ctx.restore();
      return c;
    }
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
    const variant = sampleIndex++ % 3;
    const c = drawSample(variant);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    addSticker(blob, ['sample-cat.png', 'sample-robot.png', 'sample-bunny.png'][variant]);
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
    addFrame, addIcon, setFramePhoto, composeRecord, applyTheme, canvasWithBackdrop,
    history: hist, undo: undoCanvas, redo: redoCanvas, serializeScene, shareLink, loadSharedScene, packCanvas, copySticker, animatedSvg,
  };
  // a shared scene in the URL opens once everything is ready
  loadSharedScene().catch((err) => console.warn('shared scene failed', err));
})();
