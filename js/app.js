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
  const tr = (s, p) => window.I18N.t(s, p);
  /* a record's name for people: icon and frame names are translated, file names and typed text pass through */
  const displayName = (rec) => (rec.kind === 'frame' ? rec.name.replace('Portrait frame', tr(!rec.artworkId && rec.settings.frameDesign === 'conference' ? 'Conference pass' : 'Portrait frame')) : tr(rec.name));
  const SCENE_KEY = 'sticker-shader-editor:scene:v2';   // v2: pastel Sky backdrop by default
  const IMPORT_KEY = 'sticker-shader-editor:import-mode';
  let importMode = 'cutout';
  try { if (localStorage.getItem(IMPORT_KEY) === 'whole') importMode = 'whole'; } catch (e) { /* storage is optional */ }
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
  const ICON_LOOK = {
    kaomoji: { borderWidth: 0, bevel: 0, holoIntensity: 0, metallic: 0, glitter: 0, specular: 0, fresnel: 0, grain: 0, diffuse: 0, shadowOpacity: 0 },
  };
  function newLook(kind) {
    const s = clone(lastLook);
    for (const k of SCENE_KEYS) s[k] = sceneSettings[k];
    for (const k of COMPOSE_KEYS) s[k] = StickerUI.DEFAULTS[k];
    if (KIND_LOOK[kind]) Object.assign(s, KIND_LOOK[kind]);
    s.flipX = false;
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
    brushHardness: $('#brushHardness'), brushCursor: $('#brushCursor'), btnRedoMask: $('#btnRedoMask'),
    brushStrength: $('#brushStrength'), lassoFeather: $('#lassoFeather'),
    editToolbar: $('.edit-toolbar'), editFooter: $('.edit-footer'), editBusy: $('#editBusy'),
    editZoomIn: $('#editZoomIn'), editZoomOut: $('#editZoomOut'), editZoomValue: $('#editZoomValue'), editFit: $('#editFit'),
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
  let discovery = null, comparison = null, replacePhotoTarget = null;
  let nextId = 1;
  const state = { mode: 'sticker', tool: 'brushRemove', brush: null, mlStatus: 'unknown' };

  let renderer, scene, panel, objectsUI;
  try {
    renderer = new StickerRenderer(els.gl);
  } catch (err) {
    els.drop.innerHTML = `<div class="empty"><h2>${tr('WebGL2 is required')}</h2><p>${err.message}</p></div>`;
    throw err;
  }
  scene = new StickerScene(els.gl, renderer);
  scene.onAtlas = entry => syncSecondTexture(records.get(entry.id), entry);
  scene.onSelect = (entry) => { selected = entry ? records.get(entry.id) || null : null; syncSelection(); };
  scene.onFrame = () => positionDeleteButton();
  scene.onPhase = (entry) => { if (selected && selected.id === entry.id) syncSelection(); };
  function setStageHint(show, target = null) {
    const icon = scene.drag && records.get(scene.drag.entry.id)?.kind === 'icon';
    $('#stageHintText').textContent = tr(target ? (icon ? 'release to stick it here' : 'release to put it in the frame') : 'Drag a sticker to move it');
    els.hint.classList.toggle('drop', !!target);
    els.hint.classList.toggle('show', !!show);
    els.hint.setAttribute('aria-hidden', String(!show));
  }
  scene.onHover = (entry) => { setStageHint(!!entry && !scene.drag && entry.phase === 'ready' && !scene.isLocked(entry)); };
  /* Icons stick to photos/frames; photo stickers dropped on a frame window get framed. */
  scene.dropTargetFor = (entry, p) => {
    const rec = records.get(entry.id);
    if (rec && rec.kind === 'icon') return rec.settings.iconStick ? attachmentNear(entry) : null;
    if (!rec || rec.kind !== 'sticker' || !rec.atlas) return null;
    for (let i = scene.stickers.length - 1; i >= 0; i--) {
      const e = scene.stickers[i]; if (e === entry || !e.atlas || scene.isLocked(e)) continue;
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
    setStageHint(!!target, target);
  };
  scene.onDrop = (entry, target) => {
    const photo = records.get(entry.id), fr = records.get(target.id);
    if (!photo || photo.kind !== 'sticker' || !fr || fr.kind !== 'frame') return false;
    setFramePhoto(fr, photo.id);
    scene.select(target);
    setStatus(tr('{name} is in the frame · set Photo to "none" in the panel to take it out', { name: displayName(photo) }), false, { ttl: 5000 });
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
      bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error(tr('Could not decode image'))); img.src = URL.createObjectURL(blob); });
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

  async function addSticker(blob, name, opts = {}) {
    const imageMode = (opts.imageMode || importMode) === 'whole' ? 'whole' : 'cutout';
    if (!isImage(blob)) { setStatus(tr('That file is not an image.'), false, { error: true, ttl: 3000 }); return null; }
    let source;
    try { source = await decodeToCanvas(blob); }
    catch (err) { setStatus(tr('Could not load image: {error}', { error: err.message }), false, { error: true, ttl: 5000 }); return null; }
    const rec = {
      id: 's' + nextId++, kind: 'sticker', name: name || blob.name || 'sticker', source, imageMode,
      work: null, workData: null, mask: null, autoMask: null, maskVersion: 0, refined: null, history: [], atlas: null,
      settings: Object.assign(newLook('sticker'), opts.settings || {}), labels: null, phase: 'processing', lastBuildMs: 0, framedIn: null,
    };
    prepareWork(rec);
    rec.committed = clone(rec.settings);
    records.set(rec.id, rec);
    exitEditor();
    scene.add({ id: rec.id, full: imageMode === 'whole' ? null : rec.work, work: { w: rec.work.width, h: rec.work.height }, instant: imageMode === 'whole', settings: rec.settings });
    els.drop.classList.add('hidden');
    if (!opts.quiet) pushHistory(addCommand(rec, tr('add {what}', { what: rec.name })));
    if (imageMode === 'whole') {
      useWholeImage(rec); syncSelection();
      setStatus(tr('{name}: whole image added · Remove background is available on the sticker toolbar', { name: displayName(rec) }), false, { ttl: 4500 });
    } else enqueue(() => extract(rec));
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
    commitSettings(rec, tr('resize'));
  };
  scene.onResize = (snapshot, source) => commitResize(snapshot, source);
  const ICON_COLOR_KEYS = ['iconFill', 'iconAccent', 'iconExtra', 'iconWarm', 'iconBrown', 'iconMint', 'iconOutline'];
  const FRAME_STYLE_KEYS = Object.keys(StickerDecor.FRAME_PRESETS['Cinnamon café']).concat(['frameBodyPatternColor', 'tapeColor', 'frameLanyard', 'frameLanyardColor', 'frameLanyardTextColor', 'frameLanyardLength']);

  /* ---- icons stick to photo stickers and frames ---- */
  /* The topmost eligible surface under the icon or within reach of its edge. */
  function attachmentNear(entry) {
    const isz = scene.size(entry);
    for (let i = scene.stickers.length - 1; i >= 0; i--) {
      const f = scene.stickers[i];
      const fr = records.get(f.id);
      if (f === entry || !fr || !['frame', 'sticker'].includes(fr.kind) || !f.atlas || f.phase !== 'ready' || scene.isLocked(f)) continue;
      const fsz = scene.size(f);
      const { u, v } = scene.localPoint(f, entry.x, entry.y);
      const mu = isz.w * 0.45 / fsz.w, mv = isz.h * 0.45 / fsz.h;   // an icon overlapping the frame's edge still counts
      if (u <= -mu || u >= 1 + mu || v <= -mv || v >= 1 + mv) continue;
      if (fr.kind === 'frame') return f;
      // Test the photo's cutout, not the transparent corners of its rectangular atlas.
      const a = f.atlas, px = u * a.w, py = v * a.h;
      const x = Math.max(0, Math.min(a.w - 1, Math.floor(px))), y = Math.max(0, Math.min(a.h - 1, Math.floor(py)));
      const sdf = a.sdf[y * a.w + x] - Math.hypot(px - x, py - y);
      const reach = Math.min(isz.w, isz.h) * 0.45 / (f.s * (f.ascale || 1));
      if (sdf + f.settings.borderWidth + reach >= 0) return f;
    }
    return null;
  }
  function restick(entry) {
    if (scene.isLocked(entry)) return;
    const rec = records.get(entry.id);
    if (!rec || rec.kind !== 'icon') return;
    const f = rec.settings.iconStick ? attachmentNear(entry) : null;
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
        if (p.settings.flipX) {
          for (let y = 0; y < a.h; y++) for (let x = 0; x < Math.floor(a.w / 2); x++) {
            const i = y * a.w + x, j = y * a.w + a.w - 1 - x;
            [photo.sdf[i], photo.sdf[j]] = [photo.sdf[j], photo.sdf[i]];
            for (let c = 0; c < 4; c++) [photo.data[i * 4 + c], photo.data[j * 4 + c]] = [photo.data[j * 4 + c], photo.data[i * 4 + c]];
          }
        }
      }
    }
    return { kind: rec.kind, icon: rec.icon, settings: clone(rec.settings), photo, image: rec.image || null, frameArtwork: rec.frameArtwork || null, frames: rec.frames || null, durations: rec.durations || null, workingRes: rec.settings.workingRes };
  }
  function composeRecord(rec, opts) {
    if (rec.kind !== 'icon' && rec.kind !== 'frame') return;
    if (rec.kind === 'frame' && rec.artworkId && !rec.frameArtwork) rec.settings.frameOpening = 'rectangle';
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
    rec.atlas = { canvas: toCanvas(a.image), blink: a.blink ? toCanvas(a.blink) : null, frames: a.frames ? a.frames.map((fr) => ({ canvas: toCanvas(fr), sdf: fr.sdf || null })) : null, durations: out.durations || null, sdf: a.sdf, w: a.w, h: a.h, x0: a.x0, y0: a.y0, scale: a.scale, pad: a.pad };
    rec.atlas.assemblyBase = a.assemblyBase ? toCanvas(a.assemblyBase) : null;
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
    rec.composeTimer = setTimeout(() => { rec.composeTimer = 0; if (alive(rec)) composeRecord(rec); }, state.composeMode === 'worker' ? 60 : 140);
  }

  /* Continue decorating the selected photo/frame (or the selected icon's parent). */
  function iconAnchor() {
    const entry = selected && scene.get(selected.id);
    if (entry && entry.atlas && entry.phase === 'ready' && !scene.isLocked(entry)) {
      if (selected.kind === 'frame' || selected.kind === 'sticker') return entry;
      if (selected.kind === 'icon' && entry.parent) return entry.parent;
    }
    for (let i = scene.stickers.length - 1; i >= 0; i--) { const r = records.get(scene.stickers[i].id); if (r && r.kind === 'frame' && !scene.isLocked(scene.stickers[i])) return scene.stickers[i]; }
    return null;
  }

  function addIcon(id, opts) {
    opts = opts || {};
    const def = StickerDecor.iconById[id]; if (!def) return null;
    const settings = newLook('icon');
    Object.assign(settings, ICON_LOOK[id]);
    if (def.palette) Object.assign(settings, StickerDecor.ICON_PALETTES[def.palette], { iconPalette: def.palette });
    if (def.line) settings.borderWidth = 0;
    if (def.text) settings.iconText = def.text;
    if (opts.text) settings.iconText = opts.text;
    settings.baseRotation = Math.round((Math.random() * 2 - 1) * 14);
    if (opts.settings) Object.assign(settings, opts.settings);   // a shared scene brings its own
    const name = opts.name || (id === 'emoji' || id === 'kaomoji' ? settings.iconText : id === 'pixel' ? pixelName(settings.iconText) : def.name);
    const rec = {
      id: 's' + nextId++, kind: 'icon', icon: id, name, artworkId: opts.artworkId || null, source: null, image: opts.image || null, frames: opts.frames || null, durations: opts.durations || null,
      work: null, workData: null, mask: null, autoMask: null, maskVersion: 0, refined: null, history: [], atlas: null,
      settings, labels: null, phase: 'ready', lastBuildMs: 0,
    };
    rec.committed = clone(settings);
    records.set(rec.id, rec);
    composeRecord(rec, { sync: true });
    exitEditor();
    const anchor = opts.quiet || !settings.iconStick ? null : iconAnchor();
    const entry = scene.add({ id: rec.id, work: { w: rec.work.width, h: rec.work.height }, settings, instant: true, near: anchor, layer: 2, select: !opts.quiet });
    scene.setAtlas(rec.id, rec.atlas);
    if (anchor) scene.attach(entry, anchor);
    els.drop.classList.add('hidden');
    if (opts.quiet) return rec;
    const what = id === 'emoji' || id === 'kaomoji' ? rec.name : tr(def.name).toLowerCase();
    pushHistory(addCommand(rec, tr('add {what}', { what })));
    setStatus(tr(anchor ? 'Added {what} · it sticks and moves with its sticker or frame' : 'Added {what} · drag it anywhere', { what }), false, { ttl: 3000 });
    return rec;
  }

  /* ---- pixel art from the collection (pixels/manifest.json) ---- */
  const pixelName = (src) => String(src || 'pixel').split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/^(sk|cp|bc|cg|da|kr)_/, '');
  const pixelCategory = (src) => new URL(src, document.baseURI).pathname.split('/').slice(-2, -1)[0];
  const pixelScale = (src, img) => ({ tiny: 0.2, cursor: 0.18, blinkies: 0.5, stamps: 0.34, dividers: 0.75, buttons: 0.42, bg: 0.6 }[pixelCategory(src)] || Math.min(0.42, 0.24 + Math.max(img.width, img.height) / 800));
  const pixelCache = new Map();
  /*
   * Fetch a picture: { image, frames, durations }. An animated GIF / WebP / APNG keeps
   * its frames (frames = every frame, durations in ms); a still has frames = null.
   * Cutout pictures with opaque edges get their border-connected background keyed out. Complete
   * designs (banners, stamps, buttons and backgrounds) retain their original pixels.
   */
  function loadPixel(src) {
    if (pixelCache.has(src)) return pixelCache.get(src);
    const p = (async () => {
      const res = await fetch(src);
      if (!res.ok) throw new Error(src + ' (' + res.status + ')');
      const blob = await res.blob();
      const anim = await decodeAnimation(blob);
      const raw = anim ? anim.frames : [await createImageBitmap(blob)];
      const preserveBackground = ['blinkies', 'stamps', 'dividers', 'buttons', 'bg'].includes(pixelCategory(src));
      const frames = [];
      for (const bmp of raw) frames.push(preserveBackground ? bmp : await keyedBitmap(bmp));
      return { image: frames[0], frames: frames.length > 1 ? frames : null, durations: anim ? anim.durations : null };
    })();
    pixelCache.set(src, p);
    p.catch(() => pixelCache.delete(src));
    return p;
  }
  async function keyedBitmap(bmp) {
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
    // Tolerate isolated interior holes (at most 0.1% of the image), while keeping
    // meaningful transparency in illustrated frames and existing cutouts intact.
    let transparent = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) transparent++;
    if (transparent > c.width * c.height * 0.001) return bmp;
    if (!keyBorder(d, c.width, c.height)) return bmp;
    ctx.putImageData(id, 0, 0); bmp.close();
    return createImageBitmap(c);
  }
  /*
   * The frames of an animated picture through the browser's ImageDecoder, at most
   * MAX_FRAMES of them (an even selection, each keeping the time of the frames it
   * stands for). null for a still, or in a browser without ImageDecoder.
   */
  const MAX_FRAMES = 16;
  /* image type from the magic bytes: GIF, WebP, PNG (APNG) */
  function sniffImageType(buf) {
    const h = new Uint8Array(buf, 0, Math.min(16, buf.byteLength)), str = (a, b) => String.fromCharCode(...h.slice(a, b));
    if (str(0, 4) === 'GIF8') return 'image/gif';
    if (str(0, 4) === 'RIFF' && str(8, 12) === 'WEBP') return 'image/webp';
    if (h[0] === 0x89 && str(1, 4) === 'PNG') return 'image/png';
    return null;
  }
  async function decodeAnimation(blob) {
    if (typeof ImageDecoder === 'undefined') return null;
    try {
      const data = await blob.arrayBuffer();
      const type = sniffImageType(data) || blob.type;   // the file itself says what it is; servers do not always
      if (!type || !(await ImageDecoder.isTypeSupported(type))) return null;
      const dec = new ImageDecoder({ data, type });
      await dec.tracks.ready; await dec.completed;
      const track = dec.tracks.selectedTrack, n = track ? track.frameCount : 0;
      if (n <= 1) { dec.close(); return null; }
      const keep = Math.min(n, MAX_FRAMES), frames = [], durations = [];
      let acc = 0, slot = 0;
      for (let i = 0; i < n; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        acc += Math.max(20, image.duration ? image.duration / 1000 : 100);
        const want = Math.floor((i + 1) * keep / n);
        if (want > slot) { frames.push(await createImageBitmap(image)); durations.push(acc); acc = 0; slot = want; }
        image.close();
      }
      if (acc > 0 && durations.length) durations[durations.length - 1] += acc;
      dec.close();
      return frames.length > 1 ? { frames, durations } : null;
    } catch (err) { console.warn('animation decode failed, using the first frame:', err && err.message ? err.message : err); return null; }
  }
  /* make the background transparent: the colour most of the border shares, flood-filled inward from the edges */
  function keyBorder(d, w, h) {
    const n = w * h, counts = new Map(), border = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
    // Interior transparency can vary between GIF frames even when the outer matte
    // stays opaque. Check the edges so a tiny transparent detail cannot flash a box.
    if (border.some(i => d[i * 4 + 3] < 250)) return false;
    let ref = -1, best = 0;
    for (const i of border) { const k = (d[i * 4] >> 3) + ',' + (d[i * 4 + 1] >> 3) + ',' + (d[i * 4 + 2] >> 3); const v = (counts.get(k) || 0) + 1; counts.set(k, v); if (v > best) { best = v; ref = i; } }
    if (ref < 0 || best < border.length * 0.5) return false;   // no single background colour around the edge
    const r = d[ref * 4], g = d[ref * 4 + 1], b = d[ref * 4 + 2];
    const near = (i) => d[i * 4 + 3] >= 250 && Math.abs(d[i * 4] - r) + Math.abs(d[i * 4 + 1] - g) + Math.abs(d[i * 4 + 2] - b) <= 48;
    const seen = new Uint8Array(n), stack = [];
    for (const i of border) if (!seen[i] && near(i)) { seen[i] = 1; stack.push(i); }
    let removed = 0;
    while (stack.length) {
      const i = stack.pop(); removed++;
      const x = i % w, y = (i - x) / w;
      if (x > 0 && !seen[i - 1] && near(i - 1)) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && !seen[i + 1] && near(i + 1)) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && !seen[i - w] && near(i - w)) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && !seen[i + w] && near(i + w)) { seen[i + w] = 1; stack.push(i + w); }
    }
    if (!removed || removed > n * 0.95) return false;
    for (let i = 0; i < n; i++) if (seen[i]) d[i * 4 + 3] = 0;
    return true;
  }
  async function addPixel(src, opts) {
    opts = opts || {};
    let pic;
    try { pic = await loadPixel(src); } catch (err) { setStatus(tr('Could not load image: {error}', { error: err.message }), false, { error: true, ttl: 4000 }); return null; }
    // Fine dividers and cursor art should not disappear inside a thick generated outline.
    const delicate = ['dividers', 'buttons', 'cursor', 'bg'].includes(pixelCategory(src));
    const settings = Object.assign({ stickerScale: pixelScale(src, pic.image) }, delicate ? { iconLine: 0, borderWidth: 0, feather: 0 } : {}, opts.settings || {});
    return addIcon('pixel', Object.assign({}, opts, { text: src, image: pic.image, frames: pic.frames, durations: pic.durations, settings }));
  }

  let frameCount = 0;
  function addFrame(opts) {
    opts = opts || {};
    const settings = newLook('frame');
    if (opts.settings) Object.assign(settings, opts.settings);
    const rec = {
      id: 's' + nextId++, kind: 'frame', name: opts.name || 'Portrait frame' + (frameCount++ ? ' ' + frameCount : ''), source: null,
      artworkId: opts.artworkId || null, image: opts.image || null, frameArtwork: opts.frameArtwork || null,
      work: null, workData: null, mask: null, autoMask: null, maskVersion: 0, refined: null, history: [], atlas: null,
      settings, labels: null, phase: 'ready', lastBuildMs: 0, frame: { photoId: '', layout: null },
    };
    rec.committed = clone(settings);
    records.set(rec.id, rec);
    composeRecord(rec, { sync: true });
    exitEditor();
    // a lone ready photo sticker jumps straight into the frame, which takes its place
    const loose = opts.quiet ? [] : [...records.values()].filter((r) => r.kind === 'sticker' && r.atlas && !r.framedIn && !r.locked);
    const le = loose.length === 1 ? scene.get(loose[0].id) : null;
    scene.add({ id: rec.id, work: { w: rec.work.width, h: rec.work.height }, settings, instant: true, at: le ? { x: le.x, y: le.y } : null, layer: 0, select: !opts.quiet });
    scene.setAtlas(rec.id, rec.atlas);
    els.drop.classList.add('hidden');
    if (opts.quiet) return rec;
    const cmds = [addCommand(rec, tr('add frame'))];
    if (le) cmds.push(frameCommand(rec, () => applyFramePhoto(rec, loose[0].id, { sync: true })));
    // loose icons already lying on the new frame stick to it
    const fe = scene.get(rec.id);
    for (const e of scene.stickers) { const r = records.get(e.id); if (r && r.kind === 'icon' && !e.parent && !scene.isLocked(e) && r.settings.iconStick && attachmentNear(e) === fe) scene.attach(e, fe); }
    syncSelection();
    pushHistory(composite(tr('add frame'), cmds));
    setStatus(loose.length === 1 ? tr('{name} placed in the frame · type a caption in the panel', { name: displayName(loose[0]) }) : tr('Drop a sticker onto the frame window, or pick one under Photo in the panel'), false, { ttl: 5000 });
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
        // Keep its decorations together when the photo leaves the stage for a frame.
        const target = scene.get(frameRec.id);
        if (target) for (const icon of scene.children(scene.get(photo.id))) scene.attach(icon, target);
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
    if (scene.isLocked(scene.get(frameRec.id)) || records.get(photoId)?.locked) { frameRec.settings.framePhoto = frameRec.frame.photoId; syncSelection(); return; }
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
    scene.get(photo.id).locked = !!photo.locked;
    if (!quiet) { composeRecord(frameRec); syncSelection(); }
  }
  function photoOptions(frameRec) {
    const opts = [['', 'none']];
    for (const r of records.values()) {
      if (r.kind !== 'sticker' || !r.atlas || (r.locked && r.id !== frameRec.frame.photoId)) continue;
      if (r.framedIn && r.framedIn !== frameRec.id) { opts.push([r.id, r.name + ' (in another frame)']); continue; }
      opts.push([r.id, r.name]);
    }
    return opts;
  }

  async function addFiles(files) {
    const imageMode = importMode; // one choice for the whole batch, even while decoding
    for (const f of files) await addSticker(f, f.name, { imageMode });
  }

  function useWholeImage(rec) {
    rec.imageMode = rec.autoImageMode = 'whole'; rec.maskEdited = false;
    rec.mask = Float32Array.from({ length: rec.work.width * rec.work.height }, (_, i) => rec.workData.data[i * 4 + 3] / 255);
    rec.autoMask = rec.mask.slice(); rec.maskVersion++; rec.refined = null;
    rec.history = []; rec.redoMasks = []; rec.labels = [];
    rebuildCutout(rec); rec.phase = 'ready';
  }

  function imageSnapshot(rec) {
    return { mask: rec.mask, autoMask: rec.autoMask, imageMode: rec.imageMode || 'cutout', autoImageMode: rec.autoImageMode, maskEdited: !!rec.maskEdited, labels: rec.labels,
      history: rec.history.slice(), redoMasks: (rec.redoMasks || []).slice(), width: rec.work.width, height: rec.work.height };
  }
  function restoreImage(rec, snap) {
    if (!alive(rec)) return;
    rec.extractSeq = (rec.extractSeq || 0) + 1; rec.imageBusy = false;
    const resize = mask => {
      if (!mask || (snap.width === rec.work.width && snap.height === rec.work.height)) return mask;
      const w = rec.work.width, h = rec.work.height;
      return Float32Array.from({ length: w * h }, (_, i) => mask[Math.min(snap.height - 1, Math.floor(Math.floor(i / w) * snap.height / h)) * snap.width + Math.min(snap.width - 1, Math.floor(i % w * snap.width / w))]);
    };
    rec.mask = resize(snap.mask); rec.autoMask = resize(snap.autoMask); rec.imageMode = snap.imageMode; rec.autoImageMode = snap.autoImageMode; rec.maskEdited = snap.maskEdited; rec.labels = snap.labels;
    rec.history = snap.width === rec.work.width && snap.height === rec.work.height ? snap.history.slice() : [];
    rec.redoMasks = snap.width === rec.work.width && snap.height === rec.work.height ? snap.redoMasks.slice() : [];
    rec.maskVersion++; rec.refined = null; rebuildCutout(rec);
    if (rec === selected) syncSelection();
  }
  async function changeImageMode(rec, mode) {
    const entry = rec && scene.get(rec.id);
    if (!rec || rec.kind !== 'sticker' || !rec.mask || rec.imageBusy || !entry || scene.isLocked(entry) || state.mode === 'edit') return;
    const before = imageSnapshot(rec);
    if (mode === 'whole') {
      rec.extractSeq = (rec.extractSeq || 0) + 1; useWholeImage(rec);
    } else {
      const work = rec.work, seq = rec.extractSeq = (rec.extractSeq || 0) + 1;
      rec.imageBusy = true; syncSelection(); objectsUI?.refresh();
      try { if (!await enqueue(() => rec.work === work && extract(rec, { requireUnlocked: true, seq }))) return; }
      finally {
        if (rec.extractSeq === seq) rec.imageBusy = false;
        if (alive(rec) && rec === selected) syncSelection(); objectsUI?.refresh();
      }
    }
    if (!alive(rec)) return;
    const after = imageSnapshot(rec), label = tr(mode === 'whole' ? 'Restore original' : 'Remove background');
    pushHistory({ label, undo: () => restoreImage(rec, before), redo: () => restoreImage(rec, after) });
    if (rec === selected) syncSelection(); objectsUI?.refresh();
    if (mode === 'whole') setStatus(tr('Original image restored'), false, { ttl: 2500 });
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

  function reprocessImage(rec) {
    const previous = rec.work, mask = rec.mask, autoMask = rec.autoMask;
    prepareWork(rec);
    if (rec.imageMode === 'whole') useWholeImage(rec);
    else if (rec.maskEdited && mask) {
      const w = rec.work.width, h = rec.work.height, pw = previous.width, ph = previous.height;
      const resize = m => m && Float32Array.from({ length: w * h }, (_, i) => {
        const x = Math.max(0, Math.min(pw - 1, (i % w + .5) * pw / w - .5));
        const y = Math.max(0, Math.min(ph - 1, (Math.floor(i / w) + .5) * ph / h - .5));
        const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(pw - 1, x0 + 1), y1 = Math.min(ph - 1, y0 + 1);
        return (m[y0 * pw + x0] * (1 - x + x0) + m[y0 * pw + x1] * (x - x0)) * (1 - y + y0) +
          (m[y1 * pw + x0] * (1 - x + x0) + m[y1 * pw + x1] * (x - x0)) * (y - y0);
      });
      rec.mask = resize(mask); rec.autoMask = resize(autoMask);
      if (pw !== w || ph !== h) { rec.history = []; rec.redoMasks = []; }
      rec.maskVersion++; rebuildCutout(rec);
    } else enqueue(() => extract(rec));
    if (state.mode === 'edit') { clearLasso(); layoutEditor(); drawEditor(); }
    syncSelection();
  }

  function coverage(mask) { let a = 0; for (let i = 0; i < mask.length; i++) if (mask[i] > 0.5) a++; return a / mask.length; }
  const uniq = (arr) => [...new Set(arr)];
  const nextTick = () => new Promise((r) => setTimeout(r, 0));
  const alive = (rec) => records.get(rec.id) === rec;

  /* Extraction chain: subject model (WebGPU) → DeepLab characters → tap model at centre → colour key. */
  async function extract(rec, opts) {
    if (!alive(rec) || (opts?.seq != null && rec.extractSeq !== opts.seq) || (opts?.requireUnlocked && scene.isLocked(scene.get(rec.id)))) return false;
    const work = rec.work, seq = opts?.seq ?? (rec.extractSeq = (rec.extractSeq || 0) + 1);
    const current = () => alive(rec) && rec.work === work && rec.extractSeq === seq && (!opts?.requireUnlocked || !scene.isLocked(scene.get(rec.id)));
    let mask = null, how = '', labels = [];
    try {
      const res = await Segmenter.autoDetect(work, progressCb);
      if (!current()) return false;
      state.mlStatus = 'ready';
      if (res) {
        mask = res.mask; labels = res.labels;
        how = res.method === 'saliency' ? tr('Found the subject with {model} on {engine}', { model: res.model, engine: res.engine === 'webgpu' ? 'WebGPU' : 'CPU' }) : tr('Found {labels}', { labels: uniq(res.labels).map((l) => tr(l)).join(', ') });
      }
      else {
        setStatus(tr('No people or animals found — trying the centre of the image…'), null);
        const m = await Segmenter.tapSelect(work, [{ x: 0.5, y: 0.5, positive: true }], progressCb);
        if (coverage(m) > 0.01) { mask = m; how = tr('Selected the subject at the centre'); }
      }
    } catch (err) {
      console.warn('ML segmentation unavailable, falling back to colour key', err);
      state.mlStatus = 'unavailable';
      how = tr('AI models unavailable — used colour keying');
    }
    if (!current()) return false;
    if (!mask) {
      setStatus(tr('Keying out the background colour…'), null);
      await nextTick();
      mask = Segmenter.colorKey(work, { tolerance: 0.5 });
      if (!how) how = tr('Keyed out the background colour');
    }
    if (!current()) return false;
    if (opts && opts.keepHistory && rec.mask && rec.mask.length === mask.length) pushMaskHistory(rec);
    else { rec.history = []; rec.redoMasks = []; }
    rec.mask = mask; rec.imageMode = rec.autoImageMode = 'cutout'; rec.maskEdited = false; rec.labels = labels; rec.maskVersion++;
    rec.autoMask = Float32Array.from(mask);
    rebuildCutout(rec);
    rec.phase = 'ready';
    if (selected === rec) syncSelection();
    setStatus(tr('{name}: {how} · drag the sticker · Edit cutout to refine', { name: displayName(rec), how }), false, { ttl: 6000 });
    return true;
  }

  function pushMaskHistory(rec) {
    if (!rec.mask) return;
    rec.history.push({ mask: rec.mask, autoMask: rec.autoMask, imageMode: rec.imageMode, autoImageMode: rec.autoImageMode, maskEdited: !!rec.maskEdited });
    if (rec.kind === 'sticker') { rec.imageMode = 'cutout'; rec.maskEdited = true; }
    if (rec.history.length > 12) rec.history.shift();
    rec.redoMasks = [];
    if (rec === selected) syncSelection();
  }
  function syncMaskButtons() {
    const rec = selected, busy = !!(editor.pending || state.brush || editor.lasso);
    els.btnUndo.disabled = busy || !(rec && rec.history.length);
    els.btnRedoMask.disabled = busy || !(rec && rec.redoMasks && rec.redoMasks.length);
    for (const b of els.editor.querySelectorAll('[data-selection]')) b.disabled = busy || !editor.selection || editor.selection.rec !== rec || editor.preview === 'original';
  }
  function undoMask(redo) {
    const rec = selected; if (!rec || editor.pending || state.brush || editor.lasso) return;
    clearLasso();
    rec.redoMasks = rec.redoMasks || [];
    const from = redo === true ? rec.redoMasks : rec.history, to = redo === true ? rec.history : rec.redoMasks;
    if (!from.length) return;
    to.push({ mask: rec.mask, autoMask: rec.autoMask, imageMode: rec.imageMode, autoImageMode: rec.autoImageMode, maskEdited: !!rec.maskEdited });
    const snap = from.pop(); rec.mask = snap.mask; rec.autoMask = snap.autoMask; rec.imageMode = snap.imageMode; rec.autoImageMode = snap.autoImageMode; rec.maskEdited = snap.maskEdited; rec.maskVersion++;
    syncSelection();
    drawEditor(); scheduleRebuild(rec);
  }

  /* ------------------------------------------------------------------ */
  /* Cutout pipeline                                                      */
  /* ------------------------------------------------------------------ */
  function scheduleRebuild(rec) {
    clearTimeout(rec.rebuildTimer);
    rec.rebuildTimer = setTimeout(() => { rec.rebuildTimer = 0; rebuildCutout(rec); }, 120);
  }

  function rebuildCutout(rec) {
    if (!rec.mask || !rec.work || !alive(rec)) return;
    const s = rec.settings, whole = rec.kind === 'sticker' && rec.imageMode === 'whole';
    const directMask = whole || (rec.kind === 'sticker' && rec.maskEdited);
    const w = rec.work.width, h = rec.work.height, n = w * h;
    const t0 = performance.now();
    let soft = rec.mask;
    if (!directMask && s.edgeRefine) {
      const r = Math.max(1, Math.round(s.refineRadius * Math.max(w, h) / 1024));
      if (!rec.refined || rec.refined.version !== rec.maskVersion || rec.refined.radius !== r) {
        rec.refined = { version: rec.maskVersion, radius: r, data: MaskOps.guidedFilter(rec.workData.data, rec.mask, w, h, r, 0.004) };
      }
      soft = rec.refined.data;
    }
    let bin = MaskOps.threshold(soft, directMask ? 0.001 : 0.5);
    const scale = Math.max(w, h) / 1024;
    if (!directMask && s.outlineSmooth > 0) bin = MaskOps.smoothOutline(bin, w, h, s.outlineSmooth * scale);
    if (!directMask && s.keepLargest) bin = MaskOps.keepLargest(bin, w, h, 0.04);
    if (!directMask && s.fillHoles) bin = MaskOps.fillHoles(bin, w, h, 0.02);
    if (!directMask && s.outlineOffset !== 0) bin = MaskOps.offset(bin, w, h, s.outlineOffset * scale);
    if (MaskOps.area(bin) === 0) setStatus(tr('The cutout is empty — use Edit cutout to select the subject.'), false, { error: true, ttl: 5000 });
    const sd = MaskOps.signedDistance(bin, w, h);
    let alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) alpha[i] = directMask ? soft[i] : sd[i] > 1.5 ? 1 : sd[i] > -1.5 ? Math.max(soft[i], sd[i] > 0.5 ? 0.5 : 0) : 0;
    if (!directMask && s.feather > 0) alpha = MaskOps.gaussianBlur(alpha, w, h, s.feather * scale);
    const pad = Math.round(120 * scale);
    const bb = (!whole && MaskOps.bbox(bin, w, h)) || { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
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
        const i = sy * w + sx, a = rec.kind === 'sticker' ? Math.min(alpha[i], src[i * 4 + 3] / 255) : alpha[i];
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
    rec.atlas = { canvas: atlasCanvas, blink, sdf, w: aw, h: ah, x0: ax0, y0: ay0, scale, pad, preserveAlpha: !!directMask };
    rec.atlasMaskVersion = rec.maskVersion;
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
    setStatus(tr('Undo · {label}', { label: c.label }), false, { ttl: 1500 });
  }
  function redoCanvas() {
    const c = hist.redo.pop(); if (!c) return;
    muted(() => c.redo()); hist.undo.push(c);
    syncHistoryButtons(); syncSelection();
    setStatus(tr('Redo · {label}', { label: c.label }), false, { ttl: 1500 });
  }
  function syncHistoryButtons() {
    els.histUndo.disabled = !hist.undo.length; els.histRedo.disabled = !hist.redo.length;
    els.histUndo.title = hist.undo.length ? tr('Undo {label} (Ctrl+Z)', { label: hist.undo[hist.undo.length - 1].label }) : tr('Nothing to undo');
    els.histRedo.title = hist.redo.length ? tr('Redo {label} (Ctrl+Shift+Z)', { label: hist.redo[hist.redo.length - 1].label }) : tr('Nothing to redo');
  }
  const composite = (label, cmds) => ({ label, undo() { for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo(); }, redo() { for (const c of cmds) c.redo(); } });

  function restoreStack(ids) {
    const rank = new Map(ids.map((id, i) => [id, i]));
    scene.stickers.sort((a, b) => a.layer - b.layer || (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length));
  }

  /* where an entry sits: position, rest, and what it is stuck to */
  function snapEntry(e) { return { x: e.x, y: e.y, restX: e.restX, restY: e.restY, parent: e.parent ? e.parent.id : null, offset: e.offset ? { u: e.offset.u, v: e.offset.v } : null }; }
  function restoreEntry(e, s) {
    if (!e) return;
    e.x = s.x; e.y = s.y; e.restX = s.restX; e.restY = s.restY; e.vx = 0; e.vy = 0;
    const p = s.parent ? scene.get(s.parent) : null;
    if (p && s.offset) { e.parent = p; e.offset = { u: s.offset.u, v: s.offset.v }; } else scene.detach(e);
  }

  function commitResize(snapshot, source, withPosition = false) {
    const before = [], after = [];
    for (const item of snapshot.items) {
      const e = item.entry, rec = records.get(e.id); if (!rec || scene.get(e.id) !== e) continue;
      before.push({ id: e.id, scale: item.scale, position: withPosition ? { x: item.x, y: item.y, restX: item.restX, restY: item.restY,
        parent: item.parent?.id || null, offset: item.offset ? { ...item.offset } : null } : null });
      after.push({ id: e.id, scale: e.settings.stickerScale, position: withPosition ? snapEntry(e) : null });
      rec.committed.stickerScale = e.settings.stickerScale;
    }
    const changed = before.some((item, i) => Math.abs(item.scale - after[i].scale) > 1e-9 || withPosition &&
      (Math.hypot(item.position.x - after[i].position.x, item.position.y - after[i].position.y) > .01 ||
        JSON.stringify(item.position.offset) !== JSON.stringify(after[i].position.offset)));
    panel.refresh(); els.preset.value = '';
    if (!changed) return;
    const rec = records.get(snapshot.entry.id); if (rec) rememberLook(rec);
    const apply = values => {
      for (const item of values) {
        const e = scene.get(item.id), rec = records.get(item.id); if (!e || !rec) continue;
        rec.settings.stickerScale = rec.committed.stickerScale = item.scale;
        if (item.position) restoreEntry(e, item.position);
        scene.relayout(e);
      }
      if (rec && alive(rec)) rememberLook(rec);
      panel.refresh();
    };
    const key = ['wheel', 'slider', 'keyboard'].includes(source) ? source + ':' + snapshot.entry.id + ':' + snapshot.together + ':' + before.map(item => item.id).join(',') : null;
    const now = performance.now(), last = hist.undo[hist.undo.length - 1];
    if (key && last?.type === 'resize' && last.key === key && now - last.at < 1200 && !hist.redo.length) {
      last.after = after; last.at = now; return;
    }
    const cmd = { type: 'resize', key, at: now, label: tr('resize'), before, after,
      undo() { apply(this.before); }, redo() { apply(this.after); } };
    pushHistory(cmd);
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
    if (rec.kind !== 'sticker') { if (compose || cutout || image || (rec.kind === 'frame' && keys.includes('surfaceEffect'))) composeRecord(rec); }
    else if (image) reprocessImage(rec);
    else if (cutout) scheduleRebuild(rec);
    if (keys.includes('iconStick') && entry) restick(entry);
    rememberLook(rec);
    if (rec === selected) { panel.refresh(); syncSurfaceAssets(); if (rec.kind === 'frame') panel.setOptions('framePhoto', photoOptions(rec)); }
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
    pushHistory({ type: 'scene', key, at: now, label: label || tr('scene'), before, after, undo() { apply(before); }, redo() { apply(after); } });
  }

  /* an item on the stage: undo removes it, redo puts it back where it was */
  function addCommand(rec, label) {
    const e = scene.get(rec.id), snap = snapEntry(e), layer = e.layer;
    return { type: 'add', label, undo() { removeRecord(rec); }, redo() { restoreRecord(rec, snap, layer); } };
  }
  function removeCommand(rec, label) {
    const e = scene.get(rec.id), snap = snapEntry(e), layer = e.layer;
    const order = scene.stickers.map(e => e.id);
    // Icons come back attached when their photo or frame is restored.
    const kids = scene.children(e).map((c) => ({ id: c.id, offset: { u: c.offset.u, v: c.offset.v } }));
    return {
      type: 'remove', label,
      undo() {
        restoreRecord(rec, snap, layer);
        const parent = scene.get(rec.id);
        for (const k of kids) { const ce = scene.get(k.id); if (ce && parent) { ce.parent = parent; ce.offset = { u: k.offset.u, v: k.offset.v }; } }
        restoreStack(order);
      },
      redo() { removeRecord(rec); },
    };
  }
  function removeRecord(rec) {
    if (!alive(rec)) return;
    rec.extractSeq = (rec.extractSeq || 0) + 1; rec.imageBusy = false;
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
    else if (rec.kind === 'sticker') { if (rec.imageMode === 'whole') useWholeImage(rec); else enqueue(() => extract(rec)); }
    restoreEntry(scene.get(rec.id), snap);
    scene.get(rec.id).locked = !!rec.locked;
    els.drop.classList.add('hidden');
    syncSelection();
  }
  /* A framing change remembers photos and decorations, including their attachments. */
  function frameCommand(frameRec, fn) {
    const itemsOnStage = () => { const out = {}; for (const r of records.values()) if (r.kind === 'sticker' || r.kind === 'icon') { const e = scene.get(r.id); if (e) out[r.id] = snapEntry(e); } return out; };
    const before = { photo: frameRec.frame.photoId || '', snaps: itemsOnStage(), order: scene.stickers.map(e => e.id) };
    fn();
    const after = { photo: frameRec.frame.photoId || '', snaps: itemsOnStage(), order: scene.stickers.map(e => e.id) };
    const apply = (st) => {
      if (!alive(frameRec)) return;
      applyFramePhoto(frameRec, st.photo, { at: st.snaps[st.photo === before.photo ? after.photo : before.photo] });
      for (const id in st.snaps) restoreEntry(scene.get(id), st.snaps[id]);
      restoreStack(st.order);
    };
    return { type: 'frame', label: after.photo ? 'put photo in frame' : 'take photo out', undo() { apply(before); }, redo() { apply(after); } };
  }

  /* drags: the app snapshots the entry at the start and records the move at the end */
  let dragSnap = null;
  scene.onDragStart = (entry) => { dragSnap = snapEntry(entry); setStageHint(false); };
  scene.onDragEnd = (entry, moved = true) => {
    const before = dragSnap; dragSnap = null;
    if (!moved) return;
    restick(entry);
    if (!before) return;
    const after = snapEntry(entry);
    if (Math.hypot(after.restX - before.restX, after.restY - before.restY) < 1 && after.parent === before.parent) return;
    const id = entry.id;
    pushHistory({ type: 'move', label: tr('move'), undo() { restoreEntry(scene.get(id), before); }, redo() { restoreEntry(scene.get(id), after); } });
  };

  /* ------------------------------------------------------------------ */
  /* Selection → panel, buttons, delete control                           */
  /* ------------------------------------------------------------------ */
  function syncSelection() {
    const rec = selected;
    const locked = scene.isLocked(scene.selected);
    const ready = !!(rec && rec.mask);
    const kind = rec ? rec.kind : null;
    const replaceButton = $('#btnReplacePhoto');
    for (const button of document.querySelectorAll('#btnCompareMaterials, #btnCompareFoils')) button.disabled = !rec?.atlas || locked || !!rec?.imageBusy;
    if (replaceButton) replaceButton.disabled = kind !== 'frame' || locked || !!rec?.imageBusy;
    panel.bind(rec && !locked && !rec.imageBusy ? rec.settings : null, sceneSettings, kind, rec?.imageMode === 'whole' ? 'whole' : rec?.maskEdited ? 'manual' : 'cutout', !!rec?.artworkId);
    syncSurfaceAssets();
    if (kind === 'frame') {
      panel.setOptions('framePhoto', photoOptions(rec));
      panel.setOptions('frameOpening', rec.frameArtwork ? [['auto', 'Transparent opening'], ['rectangle', 'Adjustable rectangle']] : [['rectangle', 'Adjustable rectangle']]);
    }
    els.panelName.textContent = rec ? displayName(rec) : tr('Knobs');
    const subs = { frame: rec && rec.frame && rec.frame.photoId ? tr('editing this frame') : tr('drop a sticker on the frame window'), icon: tr('editing this icon') };
    els.panelSub.textContent = rec ? (ready ? subs[kind] || tr('editing this sticker') : tr('cutting out…')) : (records.size ? tr('select a sticker on the canvas') : tr('add an image to start'));
    if (rec?.imageBusy) els.panelSub.textContent = tr('Removing background…');
    else if (rec?.imageMode === 'whole') els.panelSub.textContent = tr('Whole image · background kept');
    if (locked) els.panelSub.textContent = tr('Locked · unlock in Layers to edit');
    els.edit.disabled = !ready || kind !== 'sticker' || locked || !!rec?.imageBusy;
    els.preset.disabled = !rec || locked || !!rec?.imageBusy;
    els.pasteSettings.disabled = locked || !!rec?.imageBusy;
    els.resetSettings.disabled = locked || !!rec?.imageBusy;
    els.exportMenu.querySelectorAll('button[data-export]').forEach((b) => {
      const kind = b.dataset.export;
      b.disabled = kind === 'link' ? false : kind === 'canvas' || kind === 'clip' ? records.size === 0 : !ready;
    });
    syncMaskButtons();
    els.preset.value = '';
    if (state.mode === 'edit' && !ready) exitEditor();
    positionDeleteButton();
  }

  let delTransform = '';
  function positionDeleteButton() {
    if (objectsUI) { objectsUI.tick(); return; }
    const b = scene.bounds();
    if (!b || state.mode === 'edit') { if (!els.del.hidden) els.del.hidden = true; return; }
    if (els.del.hidden) els.del.hidden = false;
    const x = Math.min(scene.stageW - 18, Math.max(18, b.x + b.w - 8));
    const y = Math.min(scene.stageH - 18, Math.max(18, b.y + 6));
    const tf = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    if (tf !== delTransform) { delTransform = tf; els.del.style.transform = tf; }   // runs every frame: skip the style write when nothing moved
  }

  const deleteDialog = $('#deleteDialog');
  const interactionModalOpen = () => !!document.querySelector('dialog[open]');
  let deleteTarget = null, deleteBackdropDown = false;
  function refreshDeleteDialog() {
    if (!deleteTarget) return;
    $('#deleteTitle').textContent = tr(deleteTarget.kind === 'frame' ? 'Delete this frame?' : deleteTarget.kind === 'icon' ? 'Delete this icon?' : 'Delete this sticker?');
    $('#deleteName').textContent = displayName(deleteTarget);
    $('#deletePhotoNote').hidden = !deleteTarget.frame?.photoId;
    $('#deleteIconsNote').hidden = !scene.children(scene.get(deleteTarget.id)).length;
  }
  function deleteSelected() {
    const rec = selected, entry = rec && scene.get(rec.id);
    if (!rec || !entry || scene.isLocked(entry) || interactionModalOpen()) return;
    deleteTarget = rec; refreshDeleteDialog();
    const c = $('#deletePreview'), ctx = c.getContext('2d'), source = rec.atlas?.canvas || (rec.work?.getContext ? rec.work : null);
    ctx.clearRect(0, 0, c.width, c.height);
    if (source) { const scale = 132 / Math.max(source.width, source.height); ctx.drawImage(source, (144 - source.width * scale) / 2, (144 - source.height * scale) / 2, source.width * scale, source.height * scale); }
    StickerColorPicker.close(); deleteDialog.showModal(); $('#deleteCancel').focus();
  }
  function cancelDelete() { deleteTarget = null; deleteDialog.close(); }
  deleteDialog.addEventListener('cancel', e => { e.preventDefault(); cancelDelete(); });
  deleteDialog.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const buttons = [...deleteDialog.querySelectorAll('button:not(:disabled)')], i = buttons.indexOf(document.activeElement);
    e.preventDefault(); buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
  });
  $('#deleteCancel').addEventListener('click', cancelDelete);
  const outsideDeleteDialog = e => { const r = deleteDialog.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  deleteDialog.addEventListener('pointerdown', e => { deleteBackdropDown = e.target === deleteDialog && outsideDeleteDialog(e); });
  deleteDialog.addEventListener('click', e => { if (deleteBackdropDown && e.target === deleteDialog && outsideDeleteDialog(e)) cancelDelete(); deleteBackdropDown = false; });
  deleteDialog.addEventListener('close', () => { if (!deleteDialog.open) deleteTarget = null; });
  $('#deleteConfirm').addEventListener('click', () => {
    const rec = deleteTarget; deleteTarget = null; deleteDialog.close();
    const entry = rec && scene.get(rec.id);
    // Confirm the item shown in the dialog, even if an async import changed selection.
    if (!rec || !alive(rec) || !entry || scene.isLocked(entry)) return;
    deleteRecord(rec); els.histUndo.focus();
  });
  function deleteRecord(rec) {
    exitEditor();
    const cmds = [];
    // a frame gives its photo back before it goes
    if (rec.kind === 'frame' && rec.frame.photoId) cmds.push(frameCommand(rec, () => applyFramePhoto(rec, '')));
    const rm = removeCommand(rec, tr('delete {name}', { name: displayName(rec) }));
    rm.redo(); cmds.push(rm);
    pushHistory(composite(tr('delete {name}', { name: displayName(rec) }), cmds));
    setStatus(tr('Removed {name}', { name: displayName(rec) }), false, { ttl: 1500 });
  }
  els.del.addEventListener('pointerdown', (e) => e.stopPropagation());
  els.del.addEventListener('click', deleteSelected);

  /* Object actions share the same records and history as canvas edits. */
  function duplicateSelected() {
    const original = selected, root = original && scene.get(original.id);
    if (!root || !original.atlas || original.imageBusy || root.phase !== 'ready' || state.mode === 'edit') return null;
    const flush = rec => {
      if (rec.kind === 'sticker' && (rec.rebuildTimer || rec.atlasMaskVersion !== rec.maskVersion)) {
        clearTimeout(rec.rebuildTimer); rec.rebuildTimer = 0; rebuildCutout(rec);
      } else if (rec.kind !== 'sticker' && (rec.composeTimer || [...pendingCompose.values()].includes(rec))) {
        clearTimeout(rec.composeTimer); rec.composeTimer = 0; composeRecord(rec, { sync: true });
      }
    };
    flush(original);
    for (const child of scene.children(root)) flush(records.get(child.id));
    const copies = [], entries = [];
    const copyRecord = rec => {
      const copy = Object.assign({}, rec, {
        id: 's' + nextId++, name: tr('{name} copy', { name: displayName(rec) }), locked: false,
        settings: clone(rec.settings), mask: rec.mask?.slice(), autoMask: rec.autoMask?.slice(),
        history: [], redoMasks: [], refined: null, framedIn: null, composeTimer: 0, composeSeq: 0, rebuildTimer: 0,
      });
      copy.committed = clone(copy.settings);
      if (rec.frame) copy.frame = Object.assign({}, rec.frame, { photoId: '' });
      records.set(copy.id, copy); copies.push(copy); return copy;
    };
    const copy = copyRecord(original);
    if (original.frame?.photoId) {
      const photo = copyRecord(records.get(original.frame.photoId));
      photo.framedIn = copy.id; copy.frame.photoId = photo.id;
      copy.settings.framePhoto = copy.committed.framePhoto = photo.id;
    }
    const dx = Math.max(20, Math.min(scene.stageW - 20, root.x + 24)) - root.x;
    const dy = Math.max(20, Math.min(scene.stageH - 20, root.y + 24)) - root.y;
    const place = (rec, source, parentId) => {
      const snap = snapEntry(source);
      snap.x += dx; snap.y += dy; snap.restX = snap.x; snap.restY = snap.y;
      if (parentId) snap.parent = parentId;
      // restoreRecord expects the record to be absent. All copies have independent GPU textures.
      records.delete(rec.id); restoreRecord(rec, snap, source.layer);
      const e = scene.get(rec.id);
      if (e.parent) scene.attach(e, e.parent);
      entries.push({ rec, snap: snapEntry(e), layer: e.layer });
    };
    place(copy, root);
    for (const child of scene.children(root)) place(copyRecord(records.get(child.id)), child, copy.id);
    const staged = new Set(entries.map(item => item.rec.id));
    const hidden = copies.filter(rec => !staged.has(rec.id));
    pushHistory({ label: tr('duplicate {name}', { name: displayName(original) }),
      undo() {
        for (const rec of copies.slice().reverse()) { if (scene.get(rec.id)) scene.remove(rec.id); records.delete(rec.id); }
        scene.select(scene.get(original.id)); syncSelection();
      },
      redo() {
        for (const rec of hidden) records.set(rec.id, rec);
        for (const item of entries) restoreRecord(item.rec, item.snap, item.layer);
        scene.select(scene.get(copy.id)); syncSelection();
      },
    });
    scene.select(scene.get(copy.id)); syncSelection();
    setStatus(tr('Duplicated {name} with its attached icons', { name: displayName(original) }), false, { ttl: 2200 });
    return copy;
  }
  function lockObject(id) {
    const rec = records.get(id), entry = scene.get(id);
    if (!rec || !entry || state.mode === 'edit' || scene.isLocked(entry.parent)) return;
    const before = !!rec.locked, after = !before;
    const apply = value => {
      rec.locked = value;
      const e = scene.get(id); if (e) e.locked = value;
      syncSelection();
    };
    apply(after);
    pushHistory({ label: tr(after ? 'lock {name}' : 'unlock {name}', { name: displayName(rec) }), undo: () => apply(before), redo: () => apply(after) });
  }
  function orderNeighbor(entry, direction) {
    if (!entry) return null;
    const siblings = scene.stickers.filter(e => e.layer === entry.layer);
    return siblings[siblings.indexOf(entry) + direction] || null;
  }
  function objectAction(action, direction) {
    const rec = selected, entry = scene.selected;
    if (!rec || !entry || state.mode === 'edit') return;
    if (action === 'duplicate') { duplicateSelected(); return; }
    if (scene.isLocked(entry)) return;
    if (action === 'order') {
      const other = orderNeighbor(entry, direction); if (!other) return;
      const before = scene.stickers.map(e => e.id), after = before.slice();
      const a = before.indexOf(entry.id), b = before.indexOf(other.id);
      [after[a], after[b]] = [after[b], after[a]];
      const apply = ids => { restoreStack(ids); objectsUI?.refresh(); };
      apply(after);
      pushHistory({ label: tr(direction > 0 ? 'move forward' : 'move backward'), undo: () => apply(before), redo: () => apply(after) });
      return;
    }
    if (!rec.atlas || rec.imageBusy || entry.phase !== 'ready') return;
    if (action === 'resizeTogether') {
      rec.settings.resizeTogether = rec.settings.resizeTogether === false;
      commitSettings(rec, tr('Resize together')); objectsUI?.refresh(); return;
    }
    if (action === 'image' && rec.kind === 'sticker') {
      return changeImageMode(rec, rec.imageMode === 'whole' ? 'cutout' : 'whole').catch(err => {
        console.error(err); setStatus(tr('Selection failed: {error}', { error: err.message }), false, { error: true, ttl: 4000 });
      });
    }
    if (action === 'attach' && rec.kind === 'icon') {
      const target = entry.parent ? null : attachmentNear(entry);
      if (!entry.parent && !target) return;
      const before = snapEntry(entry), beforeStick = rec.settings.iconStick;
      if (target) scene.attach(entry, target); else scene.detach(entry);
      // Explicit detachment stays detached until the user chooses Attach again.
      rec.settings.iconStick = !!target; rec.committed.iconStick = !!target;
      const after = snapEntry(entry), afterStick = rec.settings.iconStick;
      const apply = (snap, stick) => { rec.settings.iconStick = rec.committed.iconStick = stick; restoreEntry(scene.get(rec.id), snap); syncSelection(); };
      pushHistory({ label: tr(target ? 'attach icon' : 'detach icon'), undo: () => apply(before, beforeStick), redo: () => apply(after, afterStick) });
      syncSelection(); return;
    }
    const key = action === 'flip' ? (rec.kind === 'icon' ? 'iconFlip' : 'flipX') : 'baseRotation';
    if (action === 'flip') rec.settings[key] = !rec.settings[key];
    else if (action === 'rotate') rec.settings.baseRotation = StickerScene.wrapRotation((rec.settings.baseRotation || 0) + 15);
    else return;
    afterSettingsChange(rec, [key]); commitSettings(rec, tr(action === 'flip' ? 'flip sticker' : 'rotate sticker'));
    objectsUI?.refresh();
  }

  /* ------------------------------------------------------------------ */
  /* Cutout editor (works on the selected sticker)                        */
  /* ------------------------------------------------------------------ */
  const editor = {
    overlay: null, cutout: null, maskView: null, overlayVersion: -1, overlayFor: null, preview: 'overlay',
    view: { x: 0, y: 0, w: 1, h: 1 }, area: null, zoom: 1, panX: 0, panY: 0,
    cursor: null, space: false, alt: false, pan: null, pointers: new Map(), pinch: null, pending: 0, drawRequest: 0,
    lasso: null, selection: null,
  };
  const BRUSH_PRESETS = {
    detail: { size: 8, hardness: 100, strength: 100 },
    soft: { size: 40, hardness: 20, strength: 40 },
    broad: { size: 120, hardness: 100, strength: 100 },
  };

  function clearLasso() { editor.lasso = editor.selection = null; syncMaskButtons(); }
  function finishLasso(cancel) {
    const lasso = editor.lasso; if (!lasso) return;
    editor.lasso = null;
    const p = lasso.points;
    const area = Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a.x * b.y - b.x * a.y; }, 0)) / 2;
    if (!cancel && p.length >= 3 && area >= 2) editor.selection = lasso;
    updateEditHint(); drawEditor();
  }
  function applyLasso(action) {
    if (editor.pending || editor.lasso || state.brush) return;
    const selection = editor.selection, rec = selected;
    if (action === 'cancel') { clearLasso(); updateEditHint(); drawEditor(); return; }
    if (!selection || selection.rec !== rec || !alive(rec) || scene.isLocked(scene.selected) || editor.preview === 'original') return;
    const w = rec.work.width, h = rec.work.height, canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.beginPath();
    selection.points.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y));
    ctx.closePath(); ctx.fill();
    const pixels = ctx.getImageData(0, 0, w, h).data;
    let region = Float32Array.from({ length: w * h }, (_, i) => pixels[i * 4 + 3] / 255);
    if (+els.lassoFeather.value) region = MaskOps.gaussianBlur(region, w, h, +els.lassoFeather.value);
    pushMaskHistory(rec);
    rec.mask = Float32Array.from(rec.mask, (v, i) => action === 'erase' ? v * (1 - region[i])
      : action === 'keep' ? v * region[i] : Math.max(v, region[i] * rec.workData.data[i * 4 + 3] / 255));
    rec.maskVersion++; clearLasso(); updateEditHint(); drawEditor(); scheduleRebuild(rec);
    setStatus(tr({ erase: 'Erased selected area', restore: 'Restored selected area', keep: 'Kept only selected area' }[action]), false, { ttl: 1800 });
  }

  function enterEditor() {
    const rec = selected; if (!rec || rec.kind !== 'sticker' || !rec.mask || rec.imageBusy || scene.isLocked(scene.selected)) return;
    editor.zoom = 1; editor.panX = editor.panY = 0; editor.cursor = null;
    clearLasso();
    state.mode = 'edit';
    els.editor.hidden = false;
    els.edit.classList.add('active');
    els.stage.classList.add('editing');
    setEditTool(state.tool);
    layoutEditor();
    drawEditor();
    updateEditHint();
    positionDeleteButton();
  }
  function exitEditor() {
    if (state.mode !== 'edit') return;
    finishEditorGesture();
    clearLasso();
    editor.space = editor.alt = false; editor.cursor = null;
    els.brushCursor.hidden = true; els.editor.classList.remove('panning');
    state.mode = 'sticker';
    els.editor.hidden = true;
    els.edit.classList.remove('active');
    els.stage.classList.remove('editing');
    if (selected && selected.mask) rebuildCutout(selected);
    syncSelection();
    positionDeleteButton();
  }
  function layoutEditor() {
    const rec = selected; if (!rec) return;
    const rect = els.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(rect.width)), ch = Math.max(1, Math.round(rect.height));
    if (els.editCanvas.width !== cw * dpr || els.editCanvas.height !== ch * dpr) { els.editCanvas.width = cw * dpr; els.editCanvas.height = ch * dpr; }
    els.editCanvas.style.width = cw + 'px'; els.editCanvas.style.height = ch + 'px';
    const w = rec.work.width, h = rec.work.height;
    const top = els.editToolbar.offsetTop + els.editToolbar.offsetHeight + 14;
    const bottom = els.editFooter.offsetTop - 14;
    const area = editor.area = { x: 18, y: top, w: Math.max(1, cw - 36), h: Math.max(1, bottom - top) };
    const fit = Math.max(0.001, Math.min(area.w / w, area.h / h));
    const vw = w * fit * editor.zoom, vh = h * fit * editor.zoom;
    // Keep part of the image reachable even after panning or a viewport resize.
    const clampPan = (p, size, room) => Math.max(-(size + room) / 2 + Math.min(40, room / 2), Math.min((size + room) / 2 - Math.min(40, room / 2), p));
    editor.panX = clampPan(editor.panX, vw, area.w); editor.panY = clampPan(editor.panY, vh, area.h);
    editor.view = { x: area.x + (area.w - vw) / 2 + editor.panX, y: area.y + (area.h - vh) / 2 + editor.panY, w: vw, h: vh, dpr };
    els.editZoomValue.textContent = Math.round(editor.zoom * 100) + '%';
    els.editZoomIn.disabled = editor.zoom >= 8; els.editZoomOut.disabled = editor.zoom <= 1;
    updateBrushCursor();
  }
  function zoomEditor(next, point) {
    if (state.mode !== 'edit' || state.brush || editor.lasso) return;
    const v = editor.view, area = editor.area;
    const p = point || { x: area.x + area.w / 2, y: area.y + area.h / 2 };
    const u = (p.x - v.x) / v.w, t = (p.y - v.y) / v.h;
    editor.zoom = Math.max(1, Math.min(8, next));
    layoutEditor();
    editor.panX += p.x - (editor.view.x + u * editor.view.w);
    editor.panY += p.y - (editor.view.y + t * editor.view.h);
    layoutEditor(); drawEditor();
  }
  function fitEditor() { editor.zoom = 1; editor.panX = editor.panY = 0; layoutEditor(); drawEditor(); }
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
    if (!editor.cutout) editor.cutout = document.createElement('canvas');
    editor.cutout.width = w; editor.cutout.height = h;
    const pixels = new ImageData(new Uint8ClampedArray(rec.workData.data), w, h);
    for (let i = 0, j = 3; i < m.length; i++, j += 4) pixels.data[j] = Math.min(pixels.data[j], Math.max(0, m[i]) * 255);
    editor.cutout.getContext('2d').putImageData(pixels, 0, 0);
    if (!editor.maskView) editor.maskView = document.createElement('canvas');
    editor.maskView.width = w; editor.maskView.height = h;
    for (let i = 0, j = 0; i < m.length; i++, j += 4) {
      const alpha = pixels.data[j + 3]; pixels.data[j] = pixels.data[j + 1] = pixels.data[j + 2] = alpha; pixels.data[j + 3] = 255;
    }
    editor.maskView.getContext('2d').putImageData(pixels, 0, 0);
    editor.overlayVersion = rec.maskVersion; editor.overlayFor = rec;
  }
  function drawEditor() {
    const rec = selected;
    if (state.mode !== 'edit' || !rec) return;
    if (editor.preview !== 'original' && (editor.overlayFor !== rec || editor.overlayVersion !== rec.maskVersion || !editor.overlay)) buildOverlay(rec);
    const ctx = els.editCanvas.getContext('2d');
    const v = editor.view, dpr = v.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, els.editCanvas.width, els.editCanvas.height);
    const area = editor.area;
    ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
    ctx.imageSmoothingEnabled = editor.zoom < 4;
    if (editor.preview === 'black' || editor.preview === 'white') { ctx.fillStyle = editor.preview === 'black' ? '#27232b' : '#fff'; ctx.fillRect(area.x, area.y, area.w, area.h); }
    else {
      ctx.fillStyle = '#fff'; ctx.fillRect(area.x, area.y, area.w, area.h); ctx.fillStyle = '#eee7ec';
      for (let y = 0; y < area.h; y += 12) for (let x = 0; x < area.w; x += 12) if ((x / 12 + y / 12) % 2) ctx.fillRect(area.x + x, area.y + y, 12, 12);
    }
    ctx.drawImage(editor.preview === 'overlay' || editor.preview === 'original' ? rec.work : editor.preview === 'mask' ? editor.maskView : editor.cutout, v.x, v.y, v.w, v.h);
    if (editor.preview === 'overlay') ctx.drawImage(editor.overlay, v.x, v.y, v.w, v.h);
    const selection = editor.lasso || editor.selection;
    if (selection?.rec === rec && editor.preview !== 'original') {
      const points = selection.points;
      ctx.beginPath();
      points.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](v.x + p.x / rec.work.width * v.w, v.y + p.y / rec.work.height * v.h));
      ctx.closePath(); ctx.fillStyle = '#52bbde30'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#266c94'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke();
    }
    ctx.restore(); updateBrushCursor(); syncMaskButtons();
  }
  function requestEditorDraw() {
    if (editor.drawRequest) return;
    editor.drawRequest = requestAnimationFrame(() => { editor.drawRequest = 0; drawEditor(); });
  }
  function updateBrushCursor() {
    const p = editor.cursor, area = editor.area, rec = selected;
    const visible = state.mode === 'edit' && rec && p && area && state.tool.startsWith('brush') && !editor.pan && !editor.space && !editor.pending && editor.preview !== 'original' && p.x >= area.x && p.x <= area.x + area.w && p.y >= area.y && p.y <= area.y + area.h;
    const cursor = els.brushCursor; cursor.hidden = !visible;
    if (!visible) return;
    const diameter = brushRadiusWork(rec) * 2 * editor.view.w / rec.work.width;
    cursor.style.left = p.x + 'px'; cursor.style.top = p.y + 'px'; cursor.style.width = cursor.style.height = Math.max(2, diameter) + 'px';
    cursor.dataset.add = String(state.brush ? state.brush.add : (state.tool === 'brushAdd') !== editor.alt);
    cursor.firstElementChild.style.width = cursor.firstElementChild.style.height = els.brushHardness.value + '%';
  }
  function updateEditReadouts() {
    $('#brushSizeValue').textContent = selected ? Math.round(brushRadiusWork(selected) * 2) + ' px' : '';
    $('#brushHardnessValue').textContent = els.brushHardness.value + '%';
    $('#brushStrengthValue').textContent = els.brushStrength.value + '%';
    $('#lassoFeatherValue').textContent = els.lassoFeather.value + ' px';
    $('#keyToleranceValue').textContent = Math.round(+els.keyTol.value * 100) + '%';
    for (const b of els.editor.querySelectorAll('[data-brush-preset]')) {
      const p = BRUSH_PRESETS[b.dataset.brushPreset];
      b.setAttribute('aria-pressed', String(+els.brushSize.value === p.size && +els.brushHardness.value === p.hardness && +els.brushStrength.value === p.strength));
    }
    updateBrushCursor();
  }
  function brushRadiusWork() { return +els.brushSize.value / 2; }
  function toWork(e, rec) {
    const r = els.editCanvas.getBoundingClientRect(), v = editor.view;
    const x = (e.clientX - r.left - v.x) / v.w * rec.work.width, y = (e.clientY - r.top - v.y) / v.h * rec.work.height;
    const area = editor.area, px = e.clientX - r.left, py = e.clientY - r.top;
    return { x, y, inside: x >= 0 && y >= 0 && x < rec.work.width && y < rec.work.height && px >= area.x && py >= area.y && px <= area.x + area.w && py <= area.y + area.h };
  }

  function paintDisc(stroke, w, h, cx, cy) {
    const { radius: r, hardness, strength, add, before, coverage } = stroke, mask = stroke.rec.mask;
    if (r <= .5) { cx = Math.round(cx); cy = Math.round(cy); }
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
    const inner = r * hardness;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const t = Math.max(0, Math.min(1, (r - d) / Math.max(1e-3, r - inner)));
      const v = d <= inner ? 1 : t * t * (3 - 2 * t);
      const i = y * w + x;
      if (v <= coverage[i]) continue;
      coverage[i] = v;
      const limit = stroke.rec.workData.data[i * 4 + 3] / 255;
      const next = add ? before[i] + Math.max(0, limit - before[i]) * v * strength : before[i] * (1 - v * strength);
      if (next !== before[i]) stroke.changed = true;
      mask[i] = next;
    }
  }
  function brushLine(rec, from, to) {
    const w = rec.work.width, h = rec.work.height, r = state.brush.radius;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (r * 0.35)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      paintDisc(state.brush, w, h, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
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

  function colorRegionAt(rec, p) {
    const w = rec.work.width, h = rec.work.height;
    const m = MaskOps.colorKey(rec.workData.data, w, h, { tolerance: parseFloat(els.keyTol.value), seeds: [p] });
    const region = new Float32Array(m.length);
    for (let i = 0; i < m.length; i++) region[i] = 1 - m[i];
    return region;
  }

  function updateEditHint() {
    const t = state.tool;
    const hints = {
      brushAdd: tr('Restore with the brush · Alt switches to erase · [ ] resize · Space + drag pans'),
      brushRemove: tr('Erase with the brush · Alt switches to restore · [ ] resize · Space + drag pans'),
      lasso: tr(editor.selection ? 'Selection ready · erase, restore or keep only this area · Esc cancels' : 'Draw a loop around an area, then choose what to keep or erase.'),
      key: tr('Click a background colour to key out everything connected to it.'),
      pan: tr('Drag to move the image · scroll or pinch to zoom · Fit resets the view'),
    };
    els.editHint.textContent = editor.preview === 'original' ? tr('Original image · choose another preview to resume editing') : hints[t] || '';
    updateEditReadouts();
  }

  function setEditTool(tool) {
    if (state.brush || editor.pending || editor.lasso) return;
    if (!['brushAdd', 'brushRemove', 'lasso', 'key', 'pan'].includes(tool)) return;
    if (tool !== state.tool) clearLasso();
    state.tool = tool;
    els.editTools.querySelectorAll('button[data-tool]').forEach((x) => { const on = x.dataset.tool === tool; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
    els.editor.dataset.tool = tool;
    els.editor.classList.toggle('brush', state.tool.startsWith('brush'));
    els.editor.classList.toggle('keying', state.tool === 'key');
    updateEditHint();
    if (state.mode === 'edit') { layoutEditor(); drawEditor(); }
  }
  els.editTools.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tool]'); if (b) setEditTool(b.dataset.tool);
  });
  els.editor.addEventListener('click', e => {
    const preset = e.target.closest('[data-brush-preset]'), selection = e.target.closest('[data-selection]');
    if (preset && !state.brush && !editor.pending) {
      const p = BRUSH_PRESETS[preset.dataset.brushPreset];
      els.brushSize.value = p.size; els.brushHardness.value = p.hardness; els.brushStrength.value = p.strength; updateEditReadouts();
    }
    if (selection) applyLasso(selection.dataset.selection);
  });

  function runEditorTask(fn) {
    clearLasso();
    editor.pending++; els.editBusy.hidden = false; els.editor.setAttribute('aria-busy', 'true');
    for (const b of els.editor.querySelectorAll('#editTools button, .edit-actions button')) b.disabled = true;
    updateBrushCursor();
    return Promise.resolve().then(fn).catch(err => { console.error(err); setStatus(tr('Selection failed: {error}', { error: err.message }), false, { error: true, ttl: 4000 }); }).finally(() => {
      editor.pending--;
      if (!editor.pending) {
        els.editBusy.hidden = true; els.editor.removeAttribute('aria-busy');
        for (const b of els.editor.querySelectorAll('#editTools button, .edit-actions button')) b.disabled = false;
      }
      syncMaskButtons(); updateEditHint();
      if (state.mode === 'edit') { layoutEditor(); drawEditor(); }
    });
  }
  function canvasPoint(e) { const r = els.editCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function finishBrush(cancel) {
    const b = state.brush; if (!b) return;
    if (cancel || !b.changed) { b.rec.mask = b.before; b.rec.imageMode = b.imageModeBefore; b.rec.maskEdited = b.maskEditedBefore; b.rec.history = b.historyBefore; b.rec.redoMasks = b.redoBefore; }
    state.brush = null; b.rec.maskVersion++;
    if (b.rec === selected) syncSelection();
    drawEditor(); scheduleRebuild(b.rec);
  }
  function finishEditorGesture() {
    finishBrush(); finishLasso(true); editor.pan = editor.pinch = editor.tap = null;
    const ids = [...editor.pointers.keys()]; editor.pointers.clear();
    for (const id of ids) if (els.editCanvas.hasPointerCapture(id)) els.editCanvas.releasePointerCapture(id);
    els.editor.classList.remove('dragging-view'); updateBrushCursor();
  }
  function pinchGeometry() {
    const [a, b] = [...editor.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  els.editCanvas.addEventListener('pointerdown', (e) => {
    const rec = selected;
    if (state.mode !== 'edit' || !rec || !rec.mask || e.button > 1) return;
    e.preventDefault();
    els.editCanvas.focus({ preventScroll: true });
    const point = canvasPoint(e); editor.cursor = point; editor.alt = e.altKey;
    editor.pointers.set(e.pointerId, point); els.editCanvas.setPointerCapture(e.pointerId);
    if (editor.pointers.size === 2) {
      finishBrush(true); finishLasso(true); editor.pan = editor.tap = null;
      const g = pinchGeometry(), v = editor.view;
      editor.pinch = { distance: g.distance, zoom: editor.zoom, u: (g.x - v.x) / v.w, v: (g.y - v.y) / v.h };
      els.editor.classList.add('dragging-view'); updateBrushCursor(); return;
    }
    if (editor.pointers.size > 2) return;
    if (state.tool === 'pan' || editor.space || e.button === 1 || editor.preview === 'original') {
      editor.pan = { id: e.pointerId, x: point.x, y: point.y, panX: editor.panX, panY: editor.panY };
      els.editor.classList.add('dragging-view'); updateBrushCursor(); return;
    }
    if (editor.pending) return;
    const p = toWork(e, rec); if (!p.inside) return;
    const tool = state.tool;
    if (tool === 'key') {
      // Commit taps on release, so a second finger can turn the gesture into a pinch.
      editor.tap = { id: e.pointerId, rec, p, point }; return;
    }
    if (tool === 'lasso') {
      clearLasso(); editor.lasso = { id: e.pointerId, rec, points: [p] }; updateEditHint(); requestEditorDraw(); return;
    }
    const historyBefore = rec.history.slice(), redoBefore = rec.redoMasks, before = rec.mask, imageModeBefore = rec.imageMode, maskEditedBefore = rec.maskEdited;
    pushMaskHistory(rec);
    rec.mask = Float32Array.from(rec.mask); rec.maskVersion++;
    state.brush = { rec, id: e.pointerId, last: p, add: (tool === 'brushAdd') !== e.altKey, historyBefore, redoBefore, before, imageModeBefore, maskEditedBefore,
      coverage: new Float32Array(rec.mask.length), radius: brushRadiusWork(), hardness: +els.brushHardness.value / 100, strength: +els.brushStrength.value / 100 };
    brushLine(rec, p, p);
    requestEditorDraw();
  });
  els.editCanvas.addEventListener('pointermove', (e) => {
    if (state.mode !== 'edit') return;
    const point = canvasPoint(e); editor.cursor = point; editor.alt = e.altKey;
    if (editor.pointers.has(e.pointerId)) editor.pointers.set(e.pointerId, point);
    if (editor.pinch && editor.pointers.size >= 2) {
      editor.tap = null;
      const g = pinchGeometry(), pinch = editor.pinch;
      editor.zoom = Math.max(1, Math.min(8, pinch.zoom * g.distance / pinch.distance)); layoutEditor();
      editor.panX += g.x - (editor.view.x + pinch.u * editor.view.w); editor.panY += g.y - (editor.view.y + pinch.v * editor.view.h);
      layoutEditor(); requestEditorDraw(); return;
    }
    if (editor.pan && editor.pan.id === e.pointerId) {
      editor.panX = editor.pan.panX + point.x - editor.pan.x; editor.panY = editor.pan.panY + point.y - editor.pan.y;
      layoutEditor(); requestEditorDraw(); return;
    }
    if (editor.tap && Math.hypot(point.x - editor.tap.point.x, point.y - editor.tap.point.y) > 8) editor.tap = null;
    if (editor.lasso?.id === e.pointerId) {
      const lasso = editor.lasso, p = toWork(e, lasso.rec), last = lasso.points[lasso.points.length - 1];
      p.x = Math.max(0, Math.min(lasso.rec.work.width, p.x)); p.y = Math.max(0, Math.min(lasso.rec.work.height, p.y));
      if (Math.hypot(p.x - last.x, p.y - last.y) * editor.view.w / lasso.rec.work.width >= 2) { lasso.points.push(p); requestEditorDraw(); }
    }
    if (state.brush && state.brush.id === e.pointerId) {
      const p = toWork(e, state.brush.rec);
      if (p.inside) {
        brushLine(state.brush.rec, state.brush.last || p, p);
        state.brush.last = p; state.brush.rec.maskVersion++; requestEditorDraw();
      } else state.brush.last = null;
    }
    updateBrushCursor();
  });
  const endEditorPointer = (e) => {
    if (!editor.pointers.has(e.pointerId)) return;
    const tap = editor.tap; editor.tap = null;
    editor.pointers.delete(e.pointerId);
    if (state.brush && state.brush.id === e.pointerId) finishBrush(e.type === 'pointercancel');
    if (editor.lasso?.id === e.pointerId) finishLasso(e.type !== 'pointerup');
    if (editor.pinch) {
      editor.pinch = null;
      if (editor.pointers.size === 1) { const [id, p] = [...editor.pointers.entries()][0]; editor.pan = { id, x: p.x, y: p.y, panX: editor.panX, panY: editor.panY }; }
    } else if (editor.pan && editor.pan.id === e.pointerId) editor.pan = null;
    if (!editor.pointers.size) finishEditorGesture();
    if (els.editCanvas.hasPointerCapture(e.pointerId)) els.editCanvas.releasePointerCapture(e.pointerId);
    if (tap && tap.id === e.pointerId && e.type === 'pointerup' && !editor.pending) {
      applyRegion(tap.rec, colorRegionAt(tap.rec, tap.p), false, tr('Keyed out the clicked colour'));
    }
  };
  els.editCanvas.addEventListener('pointerup', endEditorPointer);
  els.editCanvas.addEventListener('pointercancel', endEditorPointer);
  els.editCanvas.addEventListener('lostpointercapture', endEditorPointer);
  els.editCanvas.addEventListener('pointerleave', () => { editor.cursor = null; updateBrushCursor(); });
  els.editCanvas.addEventListener('wheel', e => {
    if (state.mode !== 'edit') return;
    e.preventDefault();
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? editor.area.h : 1);
    zoomEditor(editor.zoom * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.003), canvasPoint(e));
  }, { passive: false });
  for (const input of [els.brushSize, els.brushHardness, els.brushStrength, els.lassoFeather, els.keyTol]) input.addEventListener('input', updateEditReadouts);
  els.editZoomIn.addEventListener('click', () => zoomEditor(editor.zoom * 1.4));
  els.editZoomOut.addEventListener('click', () => zoomEditor(editor.zoom / 1.4));
  els.editFit.addEventListener('click', fitEditor);
  els.editFooter.addEventListener('click', e => {
    const b = e.target.closest('[data-preview]'); if (!b) return;
    finishEditorGesture(); editor.preview = b.dataset.preview; els.editor.dataset.preview = editor.preview;
    els.editFooter.querySelectorAll('[data-preview]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    updateEditHint(); layoutEditor(); drawEditor();
  });

  els.btnDone.addEventListener('click', exitEditor);
  els.btnUndo.addEventListener('click', () => undoMask());
  els.btnRedoMask.addEventListener('click', () => undoMask(true));
  els.btnInvert.addEventListener('click', () => { const rec = selected; if (!rec) return; clearLasso(); pushMaskHistory(rec); const m = Float32Array.from(rec.mask); for (let i = 0; i < m.length; i++) m[i] = 1 - m[i]; rec.mask = m; rec.maskVersion++; drawEditor(); scheduleRebuild(rec); });
  els.btnClear.addEventListener('click', () => { const rec = selected; if (!rec) return; clearLasso(); pushMaskHistory(rec); rec.mask = new Float32Array(rec.mask.length); rec.maskVersion++; drawEditor(); scheduleRebuild(rec); });
  els.btnReset.addEventListener('click', () => { const rec = selected; if (!rec || !rec.autoMask) return; clearLasso(); pushMaskHistory(rec); rec.mask = Float32Array.from(rec.autoMask); rec.imageMode = rec.autoImageMode || 'cutout'; rec.maskEdited = false; rec.maskVersion++; syncSelection(); drawEditor(); scheduleRebuild(rec); });
  els.btnAuto.addEventListener('click', () => { const rec = selected; if (!rec || editor.pending || state.brush) return; runEditorTask(() => enqueue(async () => { await extract(rec, { keepHistory: true }); drawEditor(); })); });
  els.edit.addEventListener('click', () => { if (state.mode === 'edit') exitEditor(); else enterEditor(); });

  document.addEventListener('keydown', (e) => {
    if (interactionModalOpen()) return;
    if (e.target && e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (e.key === 'Escape') {
      if (state.mode === 'edit' && (editor.selection || editor.lasso || state.brush)) { e.preventDefault(); finishBrush(true); clearLasso(); finishEditorGesture(); updateEditHint(); drawEditor(); return; }
      if (exportDetails.open || els.iconMenuWrap.open) { exportDetails.open = false; els.iconMenuWrap.open = false; return; }
      if (state.mode === 'edit') exitEditor(); else scene.select(null);
    }
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (state.mode === 'edit') {
      if (mod && (k === 'z' || k === 'y')) { e.preventDefault(); undoMask(k === 'y' || e.shiftKey); return; }
      if (e.key === 'Alt') { editor.alt = true; updateBrushCursor(); }
      if (e.code === 'Space' && !e.target.closest('button')) { e.preventDefault(); editor.space = true; els.editor.classList.add('panning'); updateBrushCursor(); }
      if (!mod && !e.altKey) {
        if (['b', 'e', 'h', 'l'].includes(k)) { e.preventDefault(); setEditTool({ b: 'brushAdd', e: 'brushRemove', h: 'pan', l: 'lasso' }[k]); }
        if (e.key === '[' || e.key === ']') { e.preventDefault(); els.brushSize.value = Math.max(1, Math.min(300, +els.brushSize.value + (e.key === '[' ? -4 : 4))); updateEditReadouts(); }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomEditor(editor.zoom * 1.4); }
        if (e.key === '-') { e.preventDefault(); zoomEditor(editor.zoom / 1.4); }
        if (e.key === '0') { e.preventDefault(); fitEditor(); }
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault(); deleteSelected();
    } else if (mod && k === 'z' && e.shiftKey) { e.preventDefault(); redoCanvas(); }
    else if (mod && k === 'z') { e.preventDefault(); undoCanvas(); }
    else if (mod && k === 'y') { e.preventDefault(); redoCanvas(); }
    else if (mod && k === 'c' && selected && selected.atlas) { e.preventDefault(); copySticker(); }
    else if (mod && k === 'd' && selected) { e.preventDefault(); duplicateSelected(); }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'Space') { editor.space = false; els.editor.classList.remove('panning'); }
    if (e.key === 'Alt') editor.alt = false;
    if (state.mode === 'edit') updateBrushCursor();
  });
  window.addEventListener('blur', () => {
    editor.space = editor.alt = false; els.editor.classList.remove('panning');
    if (state.mode === 'edit') finishEditorGesture();
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
    for (const button of document.querySelectorAll('[data-background-theme]')) button.setAttribute('aria-pressed', String(!s.checker && s.sceneTheme === button.dataset.backgroundTheme));
  }
  function applyTheme(name) {
    const t = StickerDecor.THEMES[name]; if (!t) return;
    Object.assign(sceneSettings, t, { checker: false });
    sceneSettings.sceneTheme = name;
    panel.refresh(); applyScene(); persist();
    commitScene('theme ' + name);
  }

  function rememberLook(rec) {
    if (rec.kind !== 'sticker') return; // frames and icons keep their own look
    for (const k of LOOK_KEYS) lastLook[k] = rec.settings[k];
    persist();
  }

  /* a panel change: scene keys apply to the backdrop, everything else to the selected sticker */
  function onPanelChange(key, value, control) {
    if (control.scene) {
      if (key === 'sceneTheme') { if (value) applyTheme(value); return; }
      sceneSettings.sceneTheme = ''; panel.refresh();
      applyScene(); persist();
      commitScene(control.label.toLowerCase(), key);
      return;
    }
    const rec = selected; if (!rec) return;
    const entry = scene.get(rec.id);
    if (key === 'stickerScale' && entry) {
      const snapshot = scene.captureResize(entry);
      snapshot.items[0].scale = rec.committed.stickerScale;
      rec.settings.stickerScale = snapshot.items[0].scale;
      scene.scaleFrom(snapshot, value);
      commitResize(snapshot, 'slider');
      return;
    }
    if (key === 'surfacePreview') { scene.playSurface(entry); return; }
    if (key.startsWith('surface')) {
      panel.refresh(); syncSurfaceAssets();
      if (key === 'surfaceEffect' && rec.kind === 'frame') composeRecord(rec);
      if (entry && !(rec.settings.surfaceEffect === 'lenticular' && rec.settings.surfaceTrigger === 'pointer')) scene.playSurface(entry);
      else if (entry) entry.surfaceStarted = undefined;
    }
    if (key === 'material') {
      StickerUI.applyMaterial(rec.settings, value);
      panel.refresh(); rememberLook(rec); els.preset.value = ''; commitSettings(rec, tr('Material')); return;
    }
    if (['foil', 'sparkle'].some(id => StickerUI.SCHEMA.find(g => g.id === id).controls.some(c => c.key === key)) || ['gloss', 'specular', 'fresnel', 'grain'].includes(key)) {
      rec.settings.materialFinish = 'custom'; panel.refresh();
    }
    if (key === 'borderPalette') {
      const p = StickerUI.BORDER_PALETTES[value]; if (!p) return;
      for (const k of StickerUI.BORDER_COLOUR_KEYS) if (k in p) rec.settings[k] = p[k];
      if (rec.settings.borderWidth <= 0) rec.settings.borderWidth = StickerUI.DEFAULTS.borderWidth;
      panel.refresh(); rememberLook(rec); els.preset.value = ''; commitSettings(rec, tr('border colours')); return;
    }
    if (StickerUI.BORDER_COLOUR_KEYS.includes(key)) {
      rec.settings.borderPalette = '';
      if (key === 'borderStyle' && value !== 'solid' && rec.settings.borderWidth <= 0) rec.settings.borderWidth = StickerUI.DEFAULTS.borderWidth;
      panel.refresh();
    }
    if (key === 'framePhoto') { setFramePhoto(rec, value); return; }
    if (key === 'frameOpening' || key === 'frameDesign' || key === 'frameLanyard') panel.refresh();
    if (key === 'framePreset') {
      if (value) {
        if (value === 'Cinnamoroll café' && rec.settings.frameCaption === StickerUI.DEFAULTS.frameCaption) rec.settings.frameCaption = 'CINNAMOROLL';
        Object.assign(rec.settings, StickerDecor.FRAME_PRESETS[value]); panel.refresh(); composeRecord(rec); commitSettings(rec, tr('frame style'));
      }
      return;
    }
    if (key === 'iconPalette') { if (value) { Object.assign(rec.settings, StickerDecor.ICON_PALETTES[value]); panel.refresh(); composeRecord(rec); commitSettings(rec, tr('palette')); } return; }
    if (key === 'iconStick') { if (entry) restick(entry); commitSettings(rec, tr('stick to sticker or frame')); return; }
    // hand edits turn the one-click style back to "Custom"
    if (rec.kind === 'frame' && FRAME_STYLE_KEYS.includes(key) && rec.settings.framePreset) { rec.settings.framePreset = ''; panel.refresh(); }
    if (rec.kind === 'icon' && ICON_COLOR_KEYS.includes(key) && rec.settings.iconPalette) { rec.settings.iconPalette = ''; panel.refresh(); }
    rememberLook(rec);
    if (control.layout && entry) scene.relayout(entry);
    if (control.rebuild === 'compose') scheduleCompose(rec);
    else if (control.rebuild === 'image') reprocessImage(rec);
    else if (control.rebuild === 'cutout') scheduleRebuild(rec);
    if (control.rebuild !== 'compose') els.preset.value = '';
    commitSettings(rec, tr(control.label).toLowerCase(), control.discrete ? undefined : key);
  }
  function syncSecondTexture(rec, entry = rec && scene.get(rec.id)) {
    if (!entry?.tex) return;
    if (entry.tex.second) renderer.gl.deleteTexture(entry.tex.second);
    entry.tex.second = null;
    if (!rec?.secondImage) return;
    const a = entry.atlas, source = rec.secondImage.canvas;
    let x0 = a.w, y0 = a.h, x1 = 0, y1 = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (a.sdf[y * a.w + x] >= 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x0 > x1 || y0 > y1) { x0 = y0 = 0; x1 = a.w - 1; y1 = a.h - 1; }
    const canvas = document.createElement('canvas'); canvas.width = a.w; canvas.height = a.h;
    const ctx = canvas.getContext('2d'), w = x1 - x0 + 1, h = y1 - y0 + 1, fit = Math.max(w / source.width, h / source.height);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, a.w, a.h);
    ctx.drawImage(source, x0 + (w - source.width * fit) / 2, y0 + (h - source.height * fit) / 2, source.width * fit, source.height * fit);
    entry.tex.second = renderer.createImageTexture(canvas).tex;
  }
  function setSecondImage(rec, image) {
    if (!alive(rec) || scene.isLocked(scene.get(rec.id))) return;
    const before = rec.secondImage || null;
    const apply = value => { rec.secondImageSeq = (rec.secondImageSeq || 0) + 1; rec.secondImage = value; syncSecondTexture(rec); if (rec === selected) syncSurfaceAssets(); scene.render(); };
    apply(image);
    pushHistory({ type: 'second-image', label: tr(image ? 'Set flip image' : 'Remove flip image'), undo() { apply(before); }, redo() { apply(image); } });
  }
  async function importSecondImage(rec, file) {
    if (!rec || !file || !alive(rec) || scene.isLocked(scene.get(rec.id))) return;
    if (!isImage(file) || file.size > 20 * 1024 * 1024) { setStatus(tr('Choose an image up to 20 MB.'), false, { error: true, ttl: 4000 }); return; }
    const seq = rec.secondImageSeq = (rec.secondImageSeq || 0) + 1;
    try {
      const canvas = await decodeToCanvas(file);
      if (!alive(rec) || scene.isLocked(scene.get(rec.id)) || seq !== rec.secondImageSeq) return;
      setSecondImage(rec, { canvas, name: file.name });
      setStatus(tr('Second image ready. Move across the sticker to flip it.'), false, { ttl: 4500 });
    } catch (error) { setStatus(tr('Could not load image: {error}', { error: error.message }), false, { error: true, ttl: 4000 }); }
  }
  function syncSurfaceAssets() {
    const card = $('#surfaceAssets'); if (!card) return;
    const rec = selected, flip = rec?.settings.surfaceEffect === 'lenticular', assembly = rec?.settings.surfaceEffect === 'assembly';
    card.hidden = !flip && !assembly;
    card.querySelector('.surface-image-tools').hidden = !flip;
    const locked = !rec || scene.isLocked(scene.get(rec.id)) || rec.imageBusy;
    card.querySelectorAll('button').forEach(b => b.disabled = locked || (b.id === 'btnRemoveFlipImage' && !rec?.secondImage));
    $('#btnFlipImage').textContent = tr(rec?.secondImage ? 'Replace second image' : 'Choose second image');
    $('#flipImageName').textContent = rec?.secondImage ? tr(rec.secondImage.name) : tr('Add a second picture or try the sample.');
    card.querySelector('.surface-assets-hint').textContent = tr(assembly ? 'The frame lands first, its photo appears next, and attached icons arrive one by one. Preview the whole group from its parent.' : 'Move left and right to change pictures, or choose a loop. The second image fills the current sticker shape and stays local; share links do not include it.');
    const canvas = card.querySelector('canvas'); canvas.hidden = !rec?.secondImage;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (rec?.secondImage) { const image = rec.secondImage.canvas, fit = Math.min(canvas.width / image.width, canvas.height / image.height); ctx.drawImage(image, (canvas.width - image.width * fit) / 2, (canvas.height - image.height * fit) / 2, image.width * fit, image.height * fit); }
  }
  function buildSurfaceAssets() {
    const card = document.createElement('div'); card.id = 'surfaceAssets'; card.className = 'surface-assets'; card.hidden = true;
    const tools = document.createElement('div'); tools.className = 'surface-image-tools';
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 76; canvas.setAttribute('aria-hidden', 'true');
    const name = document.createElement('p'); name.id = 'flipImageName';
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true; input.id = 'flipImageInput';
    let target;
    input.addEventListener('change', () => { const file = input.files[0], rec = target; input.value = ''; target = null; importSecondImage(rec, file); });
    tools.append(canvas, name, input);
    for (const [id, label, action] of [
      ['btnFlipImage', 'Choose second image', () => { target = selected; input.click(); }],
      ['btnSampleFlipImage', 'Try sample image', () => { if (selected) setSecondImage(selected, { canvas: drawSample(1), name: tr('Sample flip image') }); }],
      ['btnRemoveFlipImage', 'Remove second image', () => { if (selected) setSecondImage(selected, null); }],
    ]) { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.id = id; button.textContent = tr(label); button.addEventListener('click', action); tools.append(button); }
    const hint = document.createElement('p'); hint.className = 'surface-assets-hint'; card.append(tools, hint);
    $('#ctl-surfaceEffect').closest('.control').after(card);
  }

  /* (re)build the knob panel; collapsed groups stay collapsed across a rebuild */
  function buildPanelNow() {
    const collapsed = new Set([...els.panel.querySelectorAll('section.group.collapsed')].map((s) => s.dataset.group));
    const backgroundsOpen = !!els.panel.querySelector('.background-collection')?.open;
    panel = StickerUI.buildPanel(els.panel, onPanelChange);
    buildSurfaceAssets();
    for (const [group, id, label, action] of [['material', 'btnCompareMaterials', 'Compare materials', () => discovery?.open('materials')], ['foil', 'btnCompareFoils', 'Explore holographic foils', () => comparison?.open(StickerUI.comparisonVariants().find(v => v.foil))], ['scene', 'btnStarterScenes', 'Starter scenes', () => discovery?.open('starters')], ['frame', 'btnReplacePhoto', 'Replace photo', () => {
      if (selected?.kind !== 'frame' || scene.isLocked(scene.selected)) return;
      replacePhotoTarget = selected.id; $('#replaceFramePhoto').click();
    }]]) {
      const button = document.createElement('button'); button.type = 'button'; button.id = id; button.className = 'btn discovery-panel-action'; button.textContent = tr(label);
      button.disabled = group !== 'scene'; button.addEventListener('click', action);
      els.panel.querySelector(`[data-group="${group}"] .group-body`).prepend(button);
    }
    const backgrounds = document.createElement('details'); backgrounds.className = 'background-collection';
    backgrounds.open = backgroundsOpen;
    const summary = document.createElement('summary'); summary.textContent = tr('Discover backgrounds'); backgrounds.append(summary);
    const gallery = document.createElement('div'); gallery.className = 'background-gallery'; backgrounds.append(gallery);
    const themes = Object.entries(StickerDecor.THEMES);
    for (const [name, theme] of [...themes.slice(9), ...themes.slice(0, 9)]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'background-choice'; button.dataset.backgroundTheme = name;
      button.setAttribute('aria-pressed', String(sceneSettings.sceneTheme === name && !sceneSettings.checker));
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 140; canvas.setAttribute('aria-hidden', 'true');
      const ctx = canvas.getContext('2d'); ctx.fillStyle = theme.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
      StickerDecor.fillPattern(ctx, 0, 0, canvas.width, canvas.height, theme.bgPattern, theme.bgPatternColor, theme.bgPatternScale * .5);
      const label = document.createElement('span'); label.textContent = tr(name); button.append(canvas, label); gallery.append(button);
      button.addEventListener('click', () => applyTheme(name));
    }
    $('#btnStarterScenes').after(backgrounds);
    for (const s of els.panel.querySelectorAll('section.group')) if (collapsed.has(s.dataset.group)) { s.classList.add('collapsed'); const h = s.querySelector('.group-head'); if (h) h.setAttribute('aria-expanded', 'false'); }
  }
  buildPanelNow();
  panel.bind(null, sceneSettings, null);
  applyScene();

  for (const name in StickerUI.PRESETS) { const o = document.createElement('option'); o.value = name; o.textContent = tr(name); els.preset.appendChild(o); }
  StickerUI.enhanceSelect(els.preset);
  els.preset.value = '';
  els.preset.addEventListener('change', () => {
    const rec = selected;
    if (!els.preset.value || !rec) { els.preset.value = ''; return; }
    StickerUI.applyPreset(rec.settings, els.preset.value);
    for (const k of SCENE_KEYS) rec.settings[k] = sceneSettings[k];
    panel.refresh(); rememberLook(rec);
    commitSettings(rec, tr('preset {name}', { name: tr(els.preset.value) }));
  });

  els.copySettings.addEventListener('click', async () => {
    const src = clone(selected ? selected.settings : newLook('sticker'));
    delete src.framePhoto;
    if (!selected || selected.kind === 'sticker') for (const k of COMPOSE_KEYS) delete src[k];
    const json = JSON.stringify(src, null, 2);
    try { await navigator.clipboard.writeText(json); setStatus(tr('Settings copied to clipboard'), false, { ttl: 2000 }); }
    catch (e) { window.prompt(tr('Copy your settings:'), json); }
  });
  els.pasteSettings.addEventListener('click', () => {
    const raw = window.prompt(tr('Paste settings JSON:')); if (!raw) return;
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
        commitSettings(selected, tr('paste settings'));
      }
      panel.refresh(); applyScene(); persist();
      commitScene('paste settings');
      setStatus(tr('Imported {n} settings', { n }), false, { ttl: 2000 });
    } catch (e) { setStatus(tr('That was not valid JSON'), false, { error: true, ttl: 3000 }); }
  });
  els.resetSettings.addEventListener('click', () => {
    for (const k of SCENE_KEYS) sceneSettings[k] = StickerUI.DEFAULTS[k];
    for (const k of LOOK_KEYS) lastLook[k] = StickerUI.DEFAULTS[k];
    const rec = selected;
    if (rec) {
      Object.assign(rec.settings, StickerUI.DEFAULTS, KIND_LOOK[rec.kind] || {}, ICON_LOOK[rec.icon]);
      if (rec.kind === 'frame') rec.settings.framePhoto = rec.frame.photoId;
      if (rec.kind === 'sticker') scheduleRebuild(rec); else scheduleCompose(rec);
      const entry = scene.get(rec.id); if (entry) scene.relayout(entry);
      commitSettings(rec, tr('reset'));
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
    if ($('#walkthrough').open) return;
    for (const d of [exportDetails, els.iconMenuWrap]) if (d.open && !d.contains(e.target)) d.open = false;
  });

  /* ------------------------------------------------------------------ */
  /* Frame + icon buttons                                                 */
  /* ------------------------------------------------------------------ */
  els.frame.addEventListener('click', () => addFrame());
  const toolbarMotionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  for (const [trigger, type] of [[els.frame, 'frame'], [els.iconMenuWrap.querySelector('summary'), 'heart']]) {
    const svg = trigger.querySelector('svg');
    const play = () => {
      if (toolbarMotionPreference.matches) return;
      const moving = type === 'frame' ? svg : svg.querySelector('.toolbar-heart');
      const start = getComputedStyle(moving).transform;
      svg.getAnimations({ subtree: true }).forEach(a => a.cancel());
      const pose = (transform, offset) => ({ transform, offset, easing: 'cubic-bezier(.22,1,.36,1)' });
      if (type === 'frame') {
        moving.animate([pose(start, 0), pose('translateY(-1px) rotate(-13deg) scale(1.12)', .28), pose('rotate(8deg)', .6), pose('rotate(-2deg)', .82), pose('none', 1)], { duration: 950 });
        svg.querySelector('.toolbar-frame-photo').animate([
          { opacity: .55 }, { opacity: .08, offset: .3 }, { opacity: .8, offset: .48 }, { opacity: .55 },
        ], { duration: 850, easing: 'ease-in-out' });
      } else {
        moving.animate([pose(start, 0), pose('scale(1.28) rotate(-7deg)', .24), pose('scale(.93)', .43), pose('scale(1.17) rotate(4deg)', .65), pose('none', 1)], { duration: 950 });
        const ink = getComputedStyle(moving).fill;
        moving.animate([{ fill: ink }, { fill: '#f276a9', offset: .35 }, { fill: ink }], { duration: 950, easing: 'ease-in-out' });
        svg.querySelectorAll('.toolbar-heart-spark').forEach((spark, i) => spark.animate([
          { opacity: 0, transform: 'scale(.3)' },
          { opacity: 1, transform: `translate(${i ? 1 : -1}px,-1px) scale(1.1)`, offset: .4 },
          { opacity: 0, transform: `translate(${i ? 2 : -2}px,-2px) scale(.6)` },
        ], { duration: 650, delay: 130 + i * 110, fill: 'backwards', easing: 'ease-out' }));
      }
    };
    trigger.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') play(); });
    trigger.addEventListener('focus', () => { if (trigger.matches(':focus-visible')) play(); });
    trigger.addEventListener('click', play);
    toolbarMotionPreference.addEventListener('change', e => { if (e.matches) svg.getAnimations({ subtree: true }).forEach(a => a.cancel()); });
  }
  async function addArtwork(item) {
    const animation = item.kind === 'icon' ? await decodeAnimation(item.blob) : null;
    const raw = animation ? animation.frames : [await createImageBitmap(item.blob)];
    const pictures = [];
    try {
      for (const bitmap of raw) {
        const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
        pictures.push(await createImageBitmap(bitmap, { resizeWidth: Math.max(1, Math.round(bitmap.width * scale)), resizeHeight: Math.max(1, Math.round(bitmap.height * scale)), resizeQuality: 'high' }));
      }
      const image = pictures[0];
      const preview = document.createElement('canvas'), previewScale = 160 / Math.max(image.width, image.height);
      preview.width = Math.max(1, Math.round(image.width * previewScale)); preview.height = Math.max(1, Math.round(image.height * previewScale));
      preview.getContext('2d').drawImage(image, 0, 0, preview.width, preview.height);
      item.preview = await canvasBlob(preview);
      const opts = { artworkId: item.id, name: item.name, image, settings: { borderWidth: 0, feather: 0 } };
      if (item.kind === 'frame') {
        opts.frameArtwork = await StickerArtwork.findOpening(image);
        Object.assign(opts.settings, { framePreset: '', frameCaption: '', frameSubtitle: '', frameOpening: opts.frameArtwork ? 'auto' : 'rectangle' });
        return addFrame(opts);
      }
      Object.assign(opts.settings, { iconLine: 0, iconText: '', iconBlink: false });
      return addIcon('imported', { ...opts, frames: animation ? pictures : null, durations: animation?.durations });
    } catch (e) { for (const image of pictures) image.close(); throw e; }
    finally { for (const image of raw) image.close(); }
  }
  StickerArtwork.init(addArtwork);
  /* little drawings in the chrome: the brand mark and the empty-state art */
  I18N.apply(document);
  for (const id of ['roll', 'cloud', 'heart', 'star', 'teacup']) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'empty-sticker';
    button.dataset.welcomeIcon = id;
    const label = () => { const name = tr('Add {name}', { name: tr(StickerDecor.iconById[id].name) }); button.setAttribute('aria-label', name); button.title = name; };
    label(); I18N.onChange(label);
    const drawing = StickerDecor.thumbnail(id, 62); drawing.setAttribute('aria-hidden', 'true'); button.append(drawing);
    button.addEventListener('click', e => { if (interactionModalOpen()) return; addIcon(id); if (e.detail === 0) $('#propertiesTab').focus({ preventScroll: true }); });
    $('#emptyArt').appendChild(button);
  }
  /*
   * The sticker tray: a search box that also takes any emoji or word, tabs per
   * group, one scrolling body. Click adds and closes; shift-click keeps it open.
   */
  const KAOMOJI = [
    '(◕‿◕)', '(｡♥‿♥｡)', 'ʕ•ᴥ•ʔ', '(๑>◡<๑)', '(◍•ᴗ•◍)❤', '(´｡• ᵕ •｡`)', '٩(◕‿◕｡)۶', 'ヽ(>∀<☆)ノ', '(≧◡≦)', '(◠‿◠)', '(⌒‿⌒)', '(´∀｀)♡',
    '( ´ ▽ ` )ﾉ', '(◡ ω ◡)', '(=^･ω･^=)', '₍ᐢ•ﻌ•ᐢ₎', '(ᵔᴥᵔ)', '(^・ω・^ )', 'ʕ￫ᴥ￩ʔ', '(っ˘ω˘ς )', '(´ε｀ )', '( ˘ ³˘)♥', '(´,,•ω•,,)♡', '(✿◠‿◠)',
    '(◕ᴗ◕✿)', '(๑˃ᴗ˂)ﻭ', '٩(๑❛ᴗ❛๑)۶', '(•̀ᴗ•́)و', '(ง •̀_•́)ง', 'ヾ(＾∇＾)', '(ノ^_^)ノ', 'ヾ(＠⌒ー⌒＠)ノ', '☆*:.｡.o(≧▽≦)o.｡.:*☆', '(づ｡◕‿‿◕｡)づ', '(⁄ ⁄•⁄ω⁄•⁄ ⁄)', '(¬‿¬)',
    '(¬_¬)', '(－‸ლ)', '(ಥ﹏ಥ)', '(｡•́︿•̀｡)', '(´；ω；`)', '(╯︵╰,)', '(︶︹︺)', '(-_-) zzZ', '(∪｡∪)｡｡｡zzZ', '(ﾉ´ヮ`)ﾉ*: ･ﾟ', '(´• ω •`)', '(⑅˘꒳˘)',
  ];
  /* a face typed into the search box: brackets plus something beyond plain letters, and no emoji */
  const looksLikeKaomoji = (text) => !/\p{Extended_Pictographic}/u.test(text) && /[()（）\[\]｡･ω‿ᴥ]/.test(text) && /[^\w\s.,!?'"-]/.test(text);
  const PICK = 'button[data-icon], button[data-pixel], button[data-kaomoji]';
  let pixelManifest = null;   // pixels/manifest.json, when the folder is there
  const pixelFilter = { collection: '', category: '' };
  let trayFocus = () => {};
  function buildTray() {
    const menu = els.iconMenu; menu.innerHTML = '';
    const EMOJI = ['🍓', '🌸', '🍰', '☁️', '⭐', '🌈', '🎀', '🧸', '🍩', '🍪', '☕', '🍬', '🎈', '💖', '✨', '🌙', '🐰', '🐱', '🐶', '🦄', '🍡', '🧁', '🎵', '💌'];
    const TABS = [{ id: 'emoji', title: tr('Emoji') }, { id: 'kaomoji', title: tr('Kaomoji') }]
      .concat(pixelManifest ? [{ id: 'pixel', title: tr('Pixel') }] : [])
      .concat(StickerDecor.ICON_GROUPS.map((g, i) => ({ id: 'g' + i, title: tr(g.title), ids: g.ids })));
    const head = document.createElement('div'); head.className = 'icon-head';
    head.innerHTML = `
      <label class="icon-search">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.2 9.2L12.5 12.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="iconSearch" type="text" placeholder="${tr('Search, or type an emoji / word')}" autocomplete="off" spellcheck="false" maxlength="24" aria-label="${tr('Search icons, or type an emoji or word to add')}">
        <button id="emojiAdd" type="button" class="btn small primary" hidden>Add</button>
      </label>
      <div class="icon-tabbar">
        <button type="button" class="tab-arrow" data-dir="-1" aria-label="${tr('Previous group')}" title="${tr('Previous group')}"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5L4 6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="icon-tabs" role="tablist"></div>
        <button type="button" class="tab-arrow" data-dir="1" aria-label="${tr('Next group')}" title="${tr('Next group')}"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>`;
    const tabs = head.querySelector('.icon-tabs');
    const arrows = head.querySelectorAll('.tab-arrow');
    const body = document.createElement('div'); body.className = 'icon-body';
    const sections = {};
    const pixelGroups = [];
    const filters = document.createElement('div'); filters.className = 'pixel-filters'; filters.hidden = true;
    if (pixelManifest) {
      const makeFilter = (key, label, choices) => {
        const wrap = document.createElement('label'); const caption = document.createElement('span'); caption.textContent = tr(label);
        const select = document.createElement('select'); select.id = key === 'collection' ? 'pixelCollection' : 'pixelCategory';
        for (const [value, text] of choices) { const option = document.createElement('option'); option.value = value; option.textContent = tr(text); select.appendChild(option); }
        select.value = pixelFilter[key]; StickerUI.enhanceSelect(select);
        select.addEventListener('change', () => { pixelFilter[key] = select.value; applySearch(); body.scrollTop = 0; });
        wrap.append(caption, select); filters.appendChild(wrap);
      };
      makeFilter('collection', 'Collection', [['', 'All goodies'], ...[...new Set(pixelManifest.groups.map(g => g.collection))].map(c => [c, c])]);
      makeFilter('category', 'Type', [['', 'All types'], ...[...new Map(pixelManifest.groups.map(g => [g.category, g.title])).entries()]]);
      head.appendChild(filters);
    }
    for (const t of TABS) {
      const tb = document.createElement('button'); tb.type = 'button'; tb.role = 'tab'; tb.dataset.tab = t.id; tb.textContent = t.title; tabs.appendChild(tb);
      const sec = document.createElement('section'); sec.dataset.tab = t.id; sec.hidden = true; sections[t.id] = sec;
      if (t.id === 'emoji') {
        const row = document.createElement('div'); row.className = 'emoji-row';
        for (const em of EMOJI) { const b = document.createElement('button'); b.type = 'button'; b.className = 'emoji-pick'; b.dataset.emoji = em; b.textContent = em; b.title = tr('Add {emoji}', { emoji: em }); row.appendChild(b); }
        sec.appendChild(row);
        const hint = document.createElement('p'); hint.className = 'icon-hint'; hint.textContent = tr('Any emoji works — type or paste one above and press Enter. A short word becomes a hand-lettered sticker.'); sec.appendChild(hint);
      } else if (t.id === 'kaomoji') {
        const row = document.createElement('div'); row.className = 'kao-row';
        for (const k of KAOMOJI) { const b = document.createElement('button'); b.type = 'button'; b.className = 'kao-pick'; b.dataset.kaomoji = k; b.dataset.name = ('kaomoji ' + k).toLowerCase(); b.textContent = k; b.title = tr('Add {emoji}', { emoji: k }); row.appendChild(b); }
        sec.appendChild(row);
        const hint = document.createElement('p'); hint.className = 'icon-hint'; hint.textContent = tr('Tap a face to add it as plain text · type your own in the search box'); sec.appendChild(hint);
      } else if (t.id === 'pixel') {
        for (const g of pixelManifest.groups) {
          const group = document.createElement('div'); group.className = 'pixel-group'; group.dataset.collection = g.collection; group.dataset.category = g.category;
          const label = document.createElement('div'); label.className = 'menu-label'; label.textContent = `${tr(g.collection)} · ${tr(g.title)}`; group.appendChild(label);
          const grid = document.createElement('div'); grid.className = 'pixel-cells' + (['blinkies', 'dividers', 'buttons'].includes(g.category) ? ' wide' : '');
          for (const it of g.items) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'pixel-pick'; b.dataset.pixel = it.src; b.dataset.name = [g.collection, tr(g.collection), g.title, tr(g.title), g.id, pixelName(it.src)].join(' ').toLowerCase();
            b.title = it.credit ? `${pixelName(it.src)} · ${it.credit}` : pixelName(it.src);
            b.setAttribute('aria-label', tr('Add {emoji}', { emoji: pixelName(it.src) }));
            const img = document.createElement('img'); img.src = it.src; img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
            if (Math.max(it.w || 0, it.h || 0) <= 32) img.classList.add('tiny');
            b.appendChild(img); grid.appendChild(b);
          }
          group.appendChild(grid); sec.appendChild(group); pixelGroups.push(group);
        }
        const empty = document.createElement('p'); empty.className = 'icon-hint pixel-empty'; empty.hidden = true; empty.textContent = tr('No goodies in this collection and type.'); sec.appendChild(empty);
        const hint = document.createElement('p'); hint.className = 'icon-hint'; hint.textContent = tr('Cinnamoroll & Kuromi © Sanrio · original artist credits in pixels/CREDITS.txt'); sec.appendChild(hint);
      } else {
        const grid = document.createElement('div'); grid.className = 'icon-cells';
        for (const id of t.ids) {
          const def = StickerDecor.iconById[id]; if (!def) continue;
          const b = document.createElement('button'); b.type = 'button'; b.dataset.icon = def.id; b.dataset.name = (def.id + ' ' + def.name + ' ' + tr(def.name) + ' ' + t.title).toLowerCase(); b.title = tr(def.name);
          b.appendChild(StickerDecor.thumbnail(def.id, 44));
          const label = document.createElement('span'); label.textContent = tr(def.name); b.appendChild(label);
          grid.appendChild(b);
        }
        sec.appendChild(grid);
      }
      body.appendChild(sec);
    }
    const FOOT = tr('Click to add · shift-click keeps the tray open · new icons stick to the selected sticker or frame');
    const foot = document.createElement('div'); foot.className = 'icon-foot'; foot.textContent = FOOT;
    menu.appendChild(head); menu.appendChild(body); menu.appendChild(foot);

    const input = head.querySelector('#iconSearch'), addBtn = head.querySelector('#emojiAdd');
    let current = '';
    try { current = localStorage.getItem('sticker-shader-editor:tray') || ''; } catch (e) { /* ignore */ }
    if (!sections[current]) current = 'emoji';
    function showTab(id) {
      current = id;
      for (const t of TABS) { sections[t.id].hidden = t.id !== id; }
      filters.hidden = id !== 'pixel';
      for (const group of pixelGroups) group.hidden = !!((pixelFilter.collection && group.dataset.collection !== pixelFilter.collection) || (pixelFilter.category && group.dataset.category !== pixelFilter.category));
      const empty = sections.pixel?.querySelector('.pixel-empty'); if (empty) empty.hidden = pixelGroups.some(g => !g.hidden);
      tabs.querySelectorAll('button').forEach((b) => { b.classList.toggle('active', b.dataset.tab === id); b.setAttribute('aria-selected', String(b.dataset.tab === id)); });
      showTabPage(Math.floor(TABS.findIndex((t) => t.id === id) / TABS_PER_PAGE));   // the page that holds it
      try { localStorage.setItem('sticker-shader-editor:tray', id); } catch (e) { /* ignore */ }
      body.scrollTop = 0;
    }
    /* the tabs come in pages of four; the arrows turn the page, the arrow keys step through the groups */
    const TABS_PER_PAGE = 4, pages = Math.ceil(TABS.length / TABS_PER_PAGE);
    let tabPage = 0;
    function showTabPage(p) {
      tabPage = Math.min(pages - 1, Math.max(0, p));
      tabs.querySelectorAll('button[data-tab]').forEach((b, i) => { b.hidden = Math.floor(i / TABS_PER_PAGE) !== tabPage; });
      arrows[0].disabled = tabPage === 0; arrows[1].disabled = tabPage >= pages - 1;
    }
    arrows.forEach((a) => a.addEventListener('click', () => showTabPage(tabPage + +a.dataset.dir)));
    const stepTab = (dir) => { const i = TABS.findIndex((t) => t.id === current); const j = Math.min(TABS.length - 1, Math.max(0, i + dir)); if (j !== i) { input.value = ''; applySearch(); showTab(TABS[j].id); } };
    tabs.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepTab(e.key === 'ArrowLeft' ? -1 : 1); const b = tabs.querySelector('button.active'); if (b) b.focus(); } });
    /* searching shows every matching icon across the groups; the text can always be added as a sticker */
    function applySearch() {
      const q = input.value.trim().toLowerCase();
      addBtn.hidden = !q;
      addBtn.textContent = q ? tr('Add “{text}”', { text: input.value.trim() }) : tr('Add');
      menu.classList.toggle('searching', !!q);
      if (!q) { showTab(current); body.querySelectorAll(PICK).forEach((b) => { b.hidden = false; }); foot.textContent = FOOT; return; }
      filters.hidden = true;
      let any = 0;
      for (const t of TABS) {
        if (t.id === 'emoji') { sections[t.id].hidden = true; continue; }
        let n = 0;
        sections[t.id].querySelectorAll(PICK).forEach((b) => { const hit = b.dataset.name.includes(q); b.hidden = !hit; if (hit) n++; });
        sections[t.id].hidden = n === 0; any += n;
      }
      for (const group of pixelGroups) group.hidden = !group.querySelector('button[data-pixel]:not([hidden])');
      const empty = sections.pixel?.querySelector('.pixel-empty'); if (empty) empty.hidden = true;
      tabs.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      foot.textContent = any ? tr(any > 1 ? '{n} matches · Enter adds the first, or add the text itself' : '1 match · Enter adds the first, or add the text itself', { n: any }) : tr('No icon by that name · Enter adds it as an emoji / word sticker');
    }
    const done = (keepOpen) => { if (!keepOpen) els.iconMenuWrap.open = false; input.value = ''; applySearch(); foot.textContent = FOOT; };
    const addText = (keepOpen) => { const text = input.value.trim(); if (!text) return; addIcon(looksLikeKaomoji(text) ? 'kaomoji' : 'emoji', { text }); done(keepOpen); };
    tabs.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { input.value = ''; applySearch(); showTab(b.dataset.tab); } });
    input.addEventListener('input', applySearch);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { input.value = ''; applySearch(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = body.querySelector(`section:not([hidden]) :is(${PICK}):not([hidden])`);
      if (input.value.trim() && first && menu.classList.contains('searching')) { pick(first); done(e.shiftKey); } else addText(e.shiftKey);
    });
    addBtn.addEventListener('click', (e) => addText(e.shiftKey));
    /* add whatever a tray button stands for */
    const pick = (b) => { if (b.dataset.icon) addIcon(b.dataset.icon); else if (b.dataset.kaomoji) addIcon('kaomoji', { text: b.dataset.kaomoji }); else if (b.dataset.pixel) addPixel(b.dataset.pixel); };
    body.addEventListener('click', (e) => {
      const em = e.target.closest('button[data-emoji]');
      if (em) { addIcon('emoji', { text: em.dataset.emoji }); done(e.shiftKey); return; }
      const b = e.target.closest(PICK); if (!b) return;
      pick(b); done(e.shiftKey);
    });
    trayFocus = () => input.focus({ preventScroll: true });
    showTab(current);
  }
  buildTray();
  els.iconMenuWrap.addEventListener('toggle', () => { if (els.iconMenuWrap.open) setTimeout(trayFocus, 0); });
  // the pixel collection is optional: the tab appears once its manifest is found
  fetch('pixels/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
    if (m && m.v === 1 && Array.isArray(m.groups) && m.groups.some((g) => g.items && g.items.length)) { pixelManifest = m; buildTray(); }
  }).catch((err) => console.warn('pixel collection not loaded:', err && err.message ? err.message : err));

  /*
   * Language: a segmented EN | 中文 switch. Switching happens in place: the static
   * markup is re-translated, and everything built from strings (the panel, the
   * tray, the preset list, tooltips and hints) is rebuilt. Stickers stay put.
   */
  const langSwitch = $('#langSwitch');
  function syncLang() { langSwitch.querySelectorAll('button[data-locale]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.locale === I18N.locale))); }
  langSwitch.addEventListener('click', (e) => { const b = e.target.closest('button[data-locale]'); if (b) I18N.setLocale(b.dataset.locale); });
  I18N.onChange(() => {
    syncLang();
    buildPanelNow();
    buildTray();
    for (const o of els.preset.options) if (o.value) o.textContent = tr(o.value);
    syncSelection();
    syncHistoryButtons();
    updateEditHint();
    refreshDeleteDialog();
    setStageHint(els.hint.classList.contains('show'), scene.dropTarget);
  });
  syncLang();

  /* the caption font arrives late; redraw anything with lettering once it does */
  StickerDecor.loadFonts().then((ok) => {
    if (!ok) return;
    for (const rec of records.values()) if (rec.kind === 'frame' || (rec.kind === 'icon' && StickerDecor.iconById[rec.icon].text)) composeRecord(rec);
  });
  StickerDecor.referenceReady.then((ok) => {
    if (!ok) return;
    for (const button of els.iconMenu.querySelectorAll('button[data-icon^="cafe-"]')) {
      const old = button.querySelector('canvas');
      if (old) old.replaceWith(StickerDecor.thumbnail(button.dataset.icon, 44));
    }
    for (const rec of records.values()) if ((rec.kind === 'frame' && (rec.settings.frameDesign === 'cinnamoroll' || rec.settings.frameDecor === 'cinnamoroll')) || (rec.kind === 'icon' && rec.icon.startsWith('cafe-'))) composeRecord(rec);
  });
  els.exportMenu.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-export]'); if (!b) return;
    exportDetails.open = false;
    const kind = b.dataset.export;
    const rec = selected, entry = rec ? scene.get(rec.id) : null;
    try {
      if (kind === 'canvas') { download(await canvasBlob(canvasWithBackdrop()), 'sticker-canvas.png'); return; }
      if (kind === 'clip') {
        setStatus(tr('Recording a 4 second clip…'), null);
        const blob = await scene.record(4, sceneSettings.background);
        setStatus(tr('Clip ready'), false, { ttl: 2000 });
        download(blob, 'sticker-clip.webm'); return;
      }
      if (kind === 'link') { await copyShareLink(); return; }
      if (!rec || !entry || !entry.tex) return;
      if (kind === 'png') download(await canvasBlob(scene.snapshot(entry, { scale: 1, shadow: false })), baseName(rec) + '-sticker.png');
      else if (kind === 'png2x') download(await canvasBlob(scene.snapshot(entry, { scale: 2, shadow: false })), baseName(rec) + '-sticker@2x.png');
      else if (kind === 'posed') download(await canvasBlob(scene.snapshot(entry, { scale: 1, posed: true, shadow: true })), baseName(rec) + '-posed.png');
      else if (kind === 'cutout') {
        let canvas = rec.atlas.canvas;
        // The shader atlas stores premultiplied RGB. A plain PNG needs source RGB
        // with the edited alpha, or soft brush strokes acquire dark fringes.
        if (rec.kind === 'sticker') {
          const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
          const ctx = c.getContext('2d'); ctx.drawImage(rec.work, -rec.atlas.x0, -rec.atlas.y0);
          const pixels = ctx.getImageData(0, 0, c.width, c.height), alpha = canvas.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < alpha.length; i += 4) pixels.data[i] = alpha[i];
          ctx.putImageData(pixels, 0, 0); canvas = c;
        }
        if (rec.settings.flipX) { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; const ctx = c.getContext('2d'); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(canvas, 0, 0); canvas = c; }
        download(await canvasBlob(canvas), baseName(rec) + '-cutout.png');
      }
      else if (kind === 'pack') download(await canvasBlob(packCanvas(entry, 512)), baseName(rec) + '-512.png');
      else if (kind === 'copy') await copySticker();
      else if (kind === 'svg') {
        setStatus(tr('Building the SVG…'), null); await nextTick();
        const svg = animatedSvg(entry);
        const kids = scene.children(entry).length;
        setStatus(tr('Animated SVG ready · {kb} KB', { kb: Math.round(svg.length / 1024) }) + (kids ? tr(kids > 1 ? ' · {n} stuck icons included' : ' · 1 stuck icon included', { n: kids }) : ''), false, { ttl: 4000 });
        download(new Blob([svg], { type: 'image/svg+xml' }), baseName(rec) + '-animated.svg');
      }
      else if (kind === 'apng' || kind === 'gif' || kind === 'gif-hq') {
        const highQuality = kind === 'gif-hq';
        setStatus(tr(highQuality ? 'Building a high-quality GIF… Larger files take longer.' : 'Rendering the animation…'), null); await nextTick();
        const anim = scene.animationFrames(entry, { size: highQuality ? 1024 : 512, fps: highQuality || usesLenticular(entry) ? 25 : 16, shadow: false, lazy: highQuality });
        if (!highQuality) { setStatus(tr('Encoding {n} frames…', { n: anim.frames.length }), null); await nextTick(); }
        const blob = kind === 'apng' ? await StickerAnim.encodeAPNG(anim.frames, anim.fps) : StickerAnim.encodeGIF(anim.frames, anim.fps, { highQuality });
        setStatus(tr('Animated {fmt} ready · {sec} s loop · {kb} KB', { fmt: kind === 'apng' ? 'PNG' : 'GIF', sec: anim.seconds.toFixed(1), kb: Math.round(blob.size / 1024) }), false, { ttl: 4000 });
        download(blob, baseName(rec) + (kind === 'apng' ? '-animated.png' : highQuality ? '-animated-hq.gif' : '-animated.gif'));
      }
    } catch (err) { console.error(err); setStatus(tr('Export failed: {error}', { error: err.message }), false, { error: true, ttl: 4000 }); }
  });

  /*
   * Animated SVG of a sticker: its flat render as an embedded image, its idle
   * animation, a foil sweep and blinking as SVG animation. A photo/frame brings every
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
  function usesLenticular(entry) {
    return (entry.settings.surfaceEffect === 'lenticular' && entry.settings.surfaceAmount !== 0 && !!entry.tex?.second) || scene.children(entry).some(usesLenticular);
  }
  function animatedSvg(entry) {
    const hasSurface = e => (StickerRenderer.SURFACE_EFFECTS.includes(e.settings.surfaceEffect) && e.settings.surfaceAmount !== 0) || scene.children(e).some(hasSurface);
    if (hasSurface(entry)) {
      const cycle = scene.animationFrames(entry, { size: 512, fps: usesLenticular(entry) ? 25 : 12, shadow: false });
      return StickerAnim.encodeFrameSVG(cycle.frames, cycle.seconds);
    }
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
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') { setStatus(tr('This browser cannot put images on the clipboard'), false, { error: true, ttl: 3000 }); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasBlob(scene.snapshot(entry, { scale: 1, shadow: false })) })]);
      setStatus(tr('{name} copied · paste it anywhere that takes images', { name: displayName(rec) }), false, { ttl: 2500 });
    } catch (err) { setStatus(tr('Copy failed: {error}', { error: err.message }), false, { error: true, ttl: 3000 }); }
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
    const entries = scene.stickers.filter((e) => { const r = records.get(e.id); return r && r.kind !== 'sticker' && !r.artworkId; });
    const index = new Map(entries.map((e, i) => [e.id, i]));
    const items = entries.map((e) => {
      const r = records.get(e.id);
      const it = { k: r.kind, s: diff(r.settings), x: +(e.x / scene.stageW).toFixed(4), y: +(e.y / scene.stageH).toFixed(4) };
      if (r.kind === 'icon') it.i = r.icon;
      if (r.locked) it.l = true;
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
    const hasArtwork = [...records.values()].some(r => r.artworkId);
    if (!data.items.length) { setStatus(tr(hasArtwork ? 'Imported artwork stays local. Add a built-in frame or icon to create a share link.' : 'Add a frame or some icons first · photos are never part of a share link'), false, { error: true, ttl: 4000 }); return; }
    try { window.history.replaceState(null, '', url); } catch (e) { /* ignore */ }
    try { await navigator.clipboard.writeText(url); setStatus(tr('Share link copied · {n} items, {kb} KB · photos stay on your machine', { n: data.items.length, kb: (url.length / 1024).toFixed(1) }) + (hasArtwork ? tr(' · imported artwork stays local') : ''), false, { ttl: 4500 }); }
    catch (e) { window.prompt(tr('Copy your share link:'), url); }
  }
  async function loadSharedScene(hash) {
    const m = /[#&]s=([^&]+)/.exec(hash == null ? location.hash : hash); if (!m) return false;
    let data;
    try { data = JSON.parse(await unpackText(m[1])); } catch (e) { setStatus(tr('That share link could not be read'), false, { error: true, ttl: 4000 }); return false; }
    if (!data || data.v !== 1 || !Array.isArray(data.items)) return false;
    const images = await Promise.all(data.items.map((it) => (it.k !== 'frame' && it.i === 'pixel' && it.s && it.s.iconText ? loadPixel(it.s.iconText).catch(() => null) : null)));
    muted(() => {
      Object.assign(sceneSettings, data.scene || {}); applyScene(); persist();
      const made = [];
      for (const [i, it] of data.items.entries()) {
        const s = it.s || {}; delete s.framePhoto;
        if (it.k !== 'frame' && it.i === 'pixel' && !images[i]) { made.push(null); continue; }   // the picture is gone
        const pic = images[i] || {};
        const rec = it.k === 'frame' ? addFrame({ quiet: true, settings: s }) : addIcon(it.i, { quiet: true, settings: s, image: pic.image, frames: pic.frames, durations: pic.durations });
        if (!rec) { made.push(null); continue; }
        rec.committed = clone(rec.settings);
        const e = scene.get(rec.id);
        e.x = e.restX = it.x * scene.stageW; e.y = e.restY = it.y * scene.stageH;
        rec.locked = e.locked = it.l === true;
        scene.relayout(e);
        made.push(e);
      }
      data.items.forEach((it, i) => { const e = made[i], p = made[it.p]; if (e && e.layer === 2 && it.p != null && p && p.layer < 2 && it.o) { e.parent = p; e.offset = { u: it.o[0], v: it.o[1] }; } });
    });
    sceneCommitted = clone(sceneSettings);
    scene.select(null); syncSelection();
    setStatus(tr('Opened a shared scene · {n} items · drop your own photo onto the frame', { n: data.items.length }), false, { ttl: 5000 });
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Intake wiring: file input, drag & drop, paste, samples               */
  /* ------------------------------------------------------------------ */
  function syncImportMode() {
    $('#importMode').value = importMode;
    els.stage.dataset.dropHint = tr(importMode === 'whole' ? 'Drop to add whole images' : 'Drop to cut out stickers');
  }
  StickerUI.enhanceSelect($('#importMode')); syncImportMode();
  $('#importMode').addEventListener('change', e => {
    importMode = e.target.value === 'whole' ? 'whole' : 'cutout';
    try { localStorage.setItem(IMPORT_KEY, importMode); } catch (e) { /* storage is optional */ }
    syncImportMode();
  });
  I18N.onChange(syncImportMode);
  els.file.addEventListener('change', () => { addFiles([...els.file.files]); els.file.value = ''; });
  let fileDragDepth = 0, fileDragTimer = 0;
  function clearFileDrag() {
    if (!fileDragDepth && !fileDragTimer) return;
    fileDragDepth = 0; clearTimeout(fileDragTimer); fileDragTimer = 0;
    els.stage.classList.remove('dragover');
  }
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    if (interactionModalOpen()) { clearFileDrag(); return; }
    if (ev === 'dragenter') fileDragDepth++;
    els.stage.classList.add('dragover');
    // OS file drags can end outside the page without a final leave or dragend.
    // Active drags keep sending dragover, including while held in place.
    clearTimeout(fileDragTimer); fileDragTimer = setTimeout(clearFileDrag, 1500);
  }));
  document.addEventListener('dragleave', e => {
    fileDragDepth = Math.max(0, fileDragDepth - 1);
    const outside = !e.relatedTarget && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight);
    if (outside || (!fileDragDepth && !document.documentElement.contains(e.relatedTarget))) clearFileDrag();
  });
  document.addEventListener('drop', e => { e.preventDefault(); clearFileDrag(); });
  document.addEventListener('dragend', clearFileDrag);
  window.addEventListener('blur', clearFileDrag);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearFileDrag(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') clearFileDrag(); }, true);
  // Pointer events resume once a native file drag has been canceled.
  document.addEventListener('pointermove', clearFileDrag, { passive: true });
  document.addEventListener('pointerdown', clearFileDrag, { passive: true });
  document.addEventListener('drop', (e) => { if (interactionModalOpen()) return; const fl = e.dataTransfer && e.dataTransfer.files; if (fl && fl.length) addFiles([...fl]); });
  document.addEventListener('paste', (e) => {
    if (interactionModalOpen()) { e.preventDefault(); return; }
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
    addSticker(blob, ['sample-cat.png', 'sample-robot.png', 'sample-bunny.png'][variant], { imageMode: 'cutout' });
  });

  function renderMaterialPreview(id, variant, time = 0) {
    const rec = records.get(id), entry = scene.get(id); if (!rec?.atlas || !entry?.tex) return null;
    const settings = { ...rec.settings }; StickerUI.applyComparison(settings, variant);
    // Render a copy: comparisons must never change the artwork, history, or export settings.
    const preview = { ...entry, settings, rotX: .08 * Math.sin(time * 1.5), rotY: .22 * Math.sin(time * 1.8), rotZ: 0 };
    return scene.snapshot(preview, { scale: 190 / Math.max(entry.atlas.w, entry.atlas.h), posed: true, shadow: false });
  }
  async function createStarter(recipe, settings) {
    const commands = [], originalSelection = selected?.id;
    try {
      const sample = drawSample(recipe.sample);
      const photo = await addSticker(await canvasBlob(sample), tr(recipe.name) + '.png', { imageMode: 'whole', quiet: true, settings: { ...StickerUI.DEFAULTS, borderWidth: 0 } });
      if (!photo) throw new Error(tr('Could not prepare the sample photo.'));
      photo.starterSample = true;
      commands.push(addCommand(photo, tr('add photo')));
      const frame = addFrame({ quiet: true, name: tr(recipe.name), settings });
      commands.push(addCommand(frame, tr('add frame')));
      commands.push(frameCommand(frame, () => applyFramePhoto(frame, photo.id, { sync: true })));
      const parent = scene.get(frame.id);
      for (const [id, u, v] of recipe.icons) {
        const icon = addIcon(id, { quiet: true, settings: { ...StickerUI.DEFAULTS, stickerScale: .15, baseRotation: u < 0 ? -12 : 12, anim: 'none', iconStick: true } });
        const child = scene.get(icon.id); scene.attach(child, parent); child.offset = { u, v };
        commands.push(addCommand(icon, tr('add icon')));
      }
      pushHistory(composite(tr('Add starter scene'), commands));
      scene.select(parent); $('#propertiesTab').click();
      const group = $('[data-group="frame"]'); group.classList.remove('collapsed'); group.querySelector('.group-head').setAttribute('aria-expanded', 'true');
      setStatus(tr('Your scene is ready. Use Replace photo to make it yours.'), false, { ttl: 6000 });
      return frame;
    } catch (error) {
      muted(() => { for (const command of commands.reverse()) command.undo(); });
      if (originalSelection) scene.select(scene.get(originalSelection));
      throw error;
    }
  }
  $('#replaceFramePhoto').addEventListener('change', async e => {
    const file = e.target.files[0], frame = records.get(replacePhotoTarget); e.target.value = ''; replacePhotoTarget = null;
    if (!file || !frame || scene.isLocked(scene.get(frame.id))) return;
    const photo = await addSticker(file, file.name, { imageMode: 'whole', quiet: true }); if (!photo) return;
    if (!alive(frame) || scene.isLocked(scene.get(frame.id))) { removeRecord(photo); return; }
    const previousPhoto = records.get(frame.frame.photoId);
    const command = addCommand(photo, tr('add photo'));
    const framing = frameCommand(frame, () => applyFramePhoto(frame, photo.id, { sync: true }));
    const commands = [command, framing];
    if (previousPhoto?.starterSample && alive(previousPhoto)) { commands.push(removeCommand(previousPhoto, tr('Replace photo'))); removeRecord(previousPhoto); }
    pushHistory(composite(tr('Replace photo'), commands)); scene.select(scene.get(frame.id));
    setStatus(tr('Photo replaced. Adjust Photo zoom and position in Properties.'), false, { ttl: 5000 });
  });

  /* ------------------------------------------------------------------ */
  /* Layout                                                               */
  /* ------------------------------------------------------------------ */
  objectsUI = StickerObjects.create({
    scene, records, name: displayName, editing: () => state.mode === 'edit',
    select: id => { if (state.mode !== 'edit') { scene.select(scene.get(id)); syncSelection(); } },
    action: objectAction, lock: lockObject,
    resize: (snapshot, source, withPosition) => commitResize(snapshot, source, withPosition),
    resizePreview: () => panel.refresh(),
    rotate: (id, value, discrete) => {
      const rec = records.get(id), entry = scene.get(id);
      if (rec !== selected || !rec?.atlas || !entry || scene.isLocked(entry) || state.mode === 'edit') return;
      rec.settings.baseRotation = value;
      onPanelChange('baseRotation', value, { ...StickerUI.controlsByKey.baseRotation, discrete }); panel.refresh();
    },
    attachment: entry => entry ? attachmentNear(entry) : null,
    canOrder: (entry, direction) => !!orderNeighbor(entry, direction),
  });
  const ro = new ResizeObserver(() => { scene.resize(); if (state.mode === 'edit') { layoutEditor(); drawEditor(); } });
  ro.observe(els.stage);
  const editorResize = new ResizeObserver(() => { if (state.mode === 'edit') { layoutEditor(); drawEditor(); } });
  editorResize.observe(els.editToolbar); editorResize.observe(els.editFooter);
  syncSelection();

  // warm the runtime in the background so the first extraction is quick
  Segmenter.loadRuntime().then(() => { state.mlStatus = 'ready'; }).catch((err) => { state.mlStatus = 'unavailable'; console.warn('MediaPipe runtime unavailable', err); });

  // exposed for tests / console tinkering
  window.stickerApp = {
    get selected() { return selected; }, records, state, scene, renderer, sceneSettings,
    addSticker, addFiles, rebuildCutout, enterEditor, exitEditor, extract, deleteSelected, drawSample,
    addFrame, addIcon, addPixel, setFramePhoto, composeRecord, applyTheme, canvasWithBackdrop,
    history: hist, undo: undoCanvas, redo: redoCanvas, serializeScene, shareLink, loadSharedScene, packCanvas, copySticker, animatedSvg,
    duplicateSelected, lockObject, objectAction,
  };
  window.stickerApp.tour = StickerTour.create(window.stickerApp);
  discovery = StickerDiscovery.create({
    compare: variant => comparison?.open(variant),
    selectedId: () => selected?.id,
    canCompare: id => { const r = records.get(id), e = scene.get(id); return !!(r?.atlas && e?.tex && !r.imageBusy && !scene.isLocked(e)); },
    currentMaterial: id => { const s = records.get(id)?.settings; return s && StickerUI.comparisonId(s); },
    renderMaterial: renderMaterialPreview,
    createStarter,
    focusPhoto: () => { const button = $('#btnReplacePhoto'); button?.scrollIntoView({ block: 'nearest' }); button?.focus({ preventScroll: true }); },
    drawStarter: (canvas, recipe, settings) => {
      const sample = drawSample(recipe.sample), composed = StickerDecor.composeFrame(settings, { canvas: sample, w: sample.width, h: sample.height, pad: 0 }).canvas;
      const ctx = canvas.getContext('2d'), fit = Math.min((canvas.width - 45) / composed.width, (canvas.height - 30) / composed.height);
      const w = composed.width * fit, h = composed.height * fit, x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;
      ctx.drawImage(composed, x, y, w, h);
      for (const [id, u, v] of recipe.icons) ctx.drawImage(StickerDecor.thumbnail(id, 52), canvas.width / 2 + u * w - 19, canvas.height / 2 + v * h - 19, 38, 38);
    },
  });
  window.stickerApp.discovery = discovery;
  comparison = StickerCompare.create({
    begin: variant => {
      const rec = selected, entry = rec && scene.get(rec.id);
      if (!rec?.atlas || !entry?.tex || rec.imageBusy || scene.isLocked(entry) || state.mode === 'edit') return null;
      const before = { ...rec.settings };
      scene.comparison = { id: rec.id, before, after: { ...before }, split: .5, light: [...scene._view().light] };
      const current = StickerUI.comparisonId(before);
      return { variant: variant?.id || (current === 'glass' ? 'holographic' : 'glass'), label: StickerUI.comparisonVariants().find(v => v.id === current)?.label || 'Material', split: Math.max(.05, Math.min(.95, entry.x / scene.stageW)) };
    },
    preview: variant => {
      if (!scene.comparison || !variant) return;
      const after = { ...scene.comparison.before }; StickerUI.applyComparison(after, variant);
      scene.comparison.after = after; scene.render();
    },
    split: fraction => { if (scene.comparison) { scene.comparison.split = fraction; scene.render(); } },
    changed: () => !!scene.comparison && JSON.stringify(scene.comparison.before) !== JSON.stringify(scene.comparison.after),
    apply: () => {
      const preview = scene.comparison, rec = records.get(preview?.id), entry = rec && scene.get(rec.id);
      if (!rec || !entry || rec.imageBusy || scene.isLocked(entry)) return false;
      if (JSON.stringify(rec.settings) === JSON.stringify(preview.after)) return true;
      Object.assign(rec.settings, preview.after); commitSettings(rec, tr('Material')); rememberLook(rec);
      els.preset.value = ''; panel.refresh(); return true;
    },
    end: () => { if (scene.comparison) { scene.comparison = null; scene.render(); } },
    browse: () => discovery.open('gallery'),
  });
  window.stickerApp.comparison = comparison;
  // a shared scene in the URL opens once everything is ready
  loadSharedScene().catch((err) => console.warn('shared scene failed', err));
})();
