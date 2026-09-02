/*
 * segmenter.js — subject extraction.
 *
 * Primary path: MediaPipe Tasks Vision (loaded lazily from a pinned CDN build),
 *   - DeepLab v3 image segmenter to find where the characters are
 *   - Interactive segmenter (magic touch) for the actual high-quality cutout:
 *     auto-detect taps each character DeepLab found; the editor taps by hand
 * Fallback path: pure-JS colour keying from MaskOps when the runtime or the
 * models cannot be fetched (offline, blocked CDN, old browser).
 *
 * Model files are cached with the Cache API so they download once per browser.
 * All masks returned are Float32Array at the size of the canvas passed in.
 */
window.Segmenter = (() => {
  'use strict';

  const CFG = Object.assign({
    cdn: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1',
    models: {
      deeplab: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite',
      interactive: 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite',
    },
    cacheName: 'sticker-shader-models-v1',
  }, window.STICKER_CONFIG || {});

  // DeepLab v3 (PASCAL VOC) label indices that count as "characters".
  const CHARACTER_LABELS = new Set(['person', 'cat', 'dog', 'bird', 'horse', 'cow', 'sheep']);

  const state = {
    runtime: null,       // { vision, fileset }
    runtimePromise: null,
    runtimeError: null,
    imageSegmenter: null,
    interactive: null,
    delegate: 'GPU',
  };

  const noop = () => {};

  /* ------------------------------------------------------------------ */
  /* Runtime + model loading                                              */
  /* ------------------------------------------------------------------ */
  function loadRuntime(progress) {
    progress = progress || noop;
    if (state.runtime) return Promise.resolve(state.runtime);
    if (state.runtimePromise) return state.runtimePromise;
    state.runtimePromise = (async () => {
      progress({ stage: 'runtime', message: 'Loading segmentation runtime…', ratio: null });
      const vision = await import(/* webpackIgnore: true */ CFG.cdn + '/vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(CFG.cdn + '/wasm');
      state.runtime = { vision, fileset };
      return state.runtime;
    })().catch((err) => {
      state.runtimeError = err;
      state.runtimePromise = null;
      throw err;
    });
    return state.runtimePromise;
  }

  async function fetchModel(key, progress) {
    progress = progress || noop;
    const url = CFG.models[key];
    let cache = null;
    try { if (typeof caches !== 'undefined') cache = await caches.open(CFG.cacheName); } catch (e) { cache = null; }
    if (cache) {
      const hit = await cache.match(url);
      if (hit) {
        progress({ stage: 'model', key, message: 'Loading cached model…', ratio: 1 });
        return new Uint8Array(await hit.arrayBuffer());
      }
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('Model download failed: ' + res.status);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    let bytes;
    if (reader) {
      const chunks = []; let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.length;
        progress({ stage: 'model', key, message: `Downloading model (${(received / 1048576).toFixed(1)} MB${total ? ' / ' + (total / 1048576).toFixed(1) + ' MB' : ''})…`, ratio: total ? received / total : null });
      }
      bytes = new Uint8Array(received); let off = 0;
      for (const c of chunks) { bytes.set(c, off); off += c.length; }
    } else {
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    if (cache) {
      try { await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (e) { /* quota — ignore */ }
    }
    return bytes;
  }

  /*
   * MediaPipe takes ownership of the model bytes it is given (the Uint8Array is
   * transferred into the Wasm heap), so every attempt gets its own copy.
   */
  async function createWithFallbackDelegate(buffer, create) {
    try {
      return await create(state.delegate, buffer.slice());
    } catch (err) {
      if (state.delegate === 'GPU') {
        console.warn('GPU delegate failed, retrying on CPU:', err && err.message ? err.message.split('\n')[0] : err);
        state.delegate = 'CPU';
        return create('CPU', buffer.slice());
      }
      throw err;
    }
  }

  async function getImageSegmenter(progress) {
    if (state.imageSegmenter) return state.imageSegmenter;
    const { vision, fileset } = await loadRuntime(progress);
    const buffer = await fetchModel('deeplab', progress);
    progress && progress({ stage: 'init', message: 'Initialising detector…', ratio: null });
    state.imageSegmenter = await createWithFallbackDelegate(buffer, (delegate, bytes) =>
      vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: bytes, delegate },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: true,
      }));
    return state.imageSegmenter;
  }

  async function getInteractive(progress) {
    if (state.interactive) return state.interactive;
    const { vision, fileset } = await loadRuntime(progress);
    const buffer = await fetchModel('interactive', progress);
    progress && progress({ stage: 'init', message: 'Initialising tap-to-select…', ratio: null });
    // 1.0.x renamed the magic-touch task to *Legacy; older builds expose it as InteractiveSegmenter.
    const Task = vision.InteractiveSegmenterLegacy || vision.InteractiveSegmenter;
    // The legacy task only accepts a path, so serve the cached bytes from a blob URL.
    const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }));
    state.interactive = await createWithFallbackDelegate(buffer, (delegate) =>
      Task.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: blobUrl, delegate },
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      }));
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    return state.interactive;
  }

  /* ------------------------------------------------------------------ */
  /* Mask helpers                                                         */
  /* ------------------------------------------------------------------ */
  function maskToFloat(mpMask) {
    const w = mpMask.width, h = mpMask.height;
    let data = null;
    // GPU-backed masks report hasFloat32Array() === false but still convert
    // correctly through getAsFloat32Array(); the uint8 view of such a mask is
    // not reliable, so always prefer the float path.
    try { data = Float32Array.from(mpMask.getAsFloat32Array()); } catch (err) { data = null; }
    if (!data) {
      const u8 = mpMask.getAsUint8Array();
      data = new Float32Array(u8.length);
      let max = 0; for (let i = 0; i < u8.length; i++) if (u8[i] > max) max = u8[i];
      const scale = max > 1 ? 1 / 255 : 1;
      for (let i = 0; i < u8.length; i++) data[i] = u8[i] * scale;
    }
    return { data, w, h };
  }

  function fitTo(mask, w, h) {
    if (mask.w === w && mask.h === h) return mask.data;
    return MaskOps.resizeFloat(mask.data, mask.w, mask.h, w, h);
  }

  function nextFrame() { return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); }

  /* ------------------------------------------------------------------ */
  /* Public operations                                                    */
  /* ------------------------------------------------------------------ */

  /*
   * Detect the main characters in `canvas`. Returns
   *   { mask: Float32Array, labels: string[], method: 'characters'|'objects' } or null
   * when nothing meaningful was found.
   */
  async function autoDetect(canvas, progress) {
    const coarse = await detectCoarse(canvas, progress);
    if (!coarse) return null;
    try {
      const refined = await refineWithTaps(canvas, coarse.mask, progress);
      if (refined) coarse.mask = refined;
    } catch (err) {
      console.warn('Tap refinement unavailable, keeping the coarse mask', err);
    }
    return coarse;
  }

  /* Coarse semantic pass: where are the characters? */
  async function detectCoarse(canvas, progress) {
    const seg = await getImageSegmenter(progress);
    progress && progress({ stage: 'run', message: 'Finding characters…', ratio: null });
    await nextFrame();
    const w = canvas.width, h = canvas.height;
    const labels = seg.getLabels ? seg.getLabels() : [];
    const result = seg.segment(canvas);
    try {
      const conf = result.confidenceMasks || [];
      const n = w * h;
      const union = (indices) => {
        const out = new Float32Array(n);
        for (const idx of indices) {
          const m = fitTo(maskToFloat(conf[idx]), w, h);
          for (let i = 0; i < n; i++) if (m[i] > out[i]) out[i] = m[i];
        }
        return out;
      };
      const coverage = (m) => { let a = 0; for (let i = 0; i < n; i++) if (m[i] > 0.5) a++; return a / n; };
      const found = [];
      if (conf.length) {
        // Which classes actually appear? Use the category mask if present.
        let present = new Set();
        if (result.categoryMask) {
          const cat = result.categoryMask.getAsUint8Array();
          const counts = new Map();
          for (let i = 0; i < cat.length; i += 7) counts.set(cat[i], (counts.get(cat[i]) || 0) + 1);
          for (const [k, v] of counts) if (k !== 0 && v * 7 > cat.length * 0.004) present.add(k);
        } else {
          for (let k = 1; k < conf.length; k++) present.add(k);
        }
        const charIdx = [...present].filter((k) => CHARACTER_LABELS.has(labels[k]));
        if (charIdx.length) {
          const m = union(charIdx);
          const c = coverage(m);
          // a tiny person next to a big object: keep both, the tap tool can drop either
          if (c > 0.01 && c < 0.02 && present.size > charIdx.length) {
            const all = union([...present]);
            if (coverage(all) > c * 3) return { mask: all, labels: [...present].map((k) => labels[k]), method: 'characters' };
          }
          if (c > 0.01) return { mask: m, labels: charIdx.map((k) => labels[k]), method: 'characters' };
        }
        const objIdx = [...present];
        if (objIdx.length) {
          const m = union(objIdx);
          if (coverage(m) > 0.01) return { mask: m, labels: objIdx.map((k) => labels[k]), method: 'objects' };
        }
        // last resort: everything that is not background
        const bg = fitTo(maskToFloat(conf[0]), w, h);
        const m = new Float32Array(n);
        for (let i = 0; i < n; i++) m[i] = 1 - bg[i];
        if (coverage(m) > 0.01) return { mask: m, labels: ['foreground'], method: 'objects' };
      }
      return null;
    } finally {
      if (result.close) result.close();
      else {
        (result.confidenceMasks || []).forEach((m) => m.close && m.close());
        result.categoryMask && result.categoryMask.close && result.categoryMask.close();
      }
    }
  }

  /*
   * Tap each region of a coarse mask with the interactive model and union the
   * results. Returns null when nothing usable came back.
   */
  async function refineWithTaps(canvas, coarse, progress) {
    const w = canvas.width, h = canvas.height, n = w * h;
    const bin = MaskOps.threshold(coarse, 0.5);
    const { labels, sizes, count } = MaskOps.components(bin, w, h);
    if (!count) return null;
    // seed = deepest interior point of each sizeable component
    const inner = MaskOps.innerDistance(bin, w, h);
    const best = new Float32Array(sizes.length), bestIdx = new Int32Array(sizes.length);
    for (let i = 0; i < n; i++) { const l = labels[i]; if (l && inner[i] > best[l]) { best[l] = inner[i]; bestIdx[l] = i; } }
    const comps = [];
    for (let l = 1; l < sizes.length; l++) if (sizes[l] > n * 0.003) comps.push({ l, size: sizes[l], idx: bestIdx[l] });
    comps.sort((a, b) => b.size - a.size);
    const seeds = comps.slice(0, 6);
    if (!seeds.length) return null;
    const union = new Float32Array(n);
    let used = 0;
    for (let k = 0; k < seeds.length; k++) {
      const sd = seeds[k];
      const x = (sd.idx % w) + 0.5, y = Math.floor(sd.idx / w) + 0.5;
      progress && progress({ stage: 'run', message: `Cutting out character ${k + 1} of ${seeds.length}…`, ratio: k / seeds.length });
      const m = await tapSelect(canvas, [{ x: x / w, y: y / h, positive: true }], progress);
      // sanity: it must overlap the region it was seeded from and not swallow the image
      let overlap = 0, area = 0;
      for (let i = 0; i < n; i++) { if (m[i] > 0.5) { area++; if (labels[i] === sd.l) overlap++; } }
      if (area < n * 0.9 && overlap > sd.size * 0.25) {
        for (let i = 0; i < n; i++) if (m[i] > union[i]) union[i] = m[i];
        used++;
      }
    }
    return used ? union : null;
  }

  /*
   * Interactive selection. points: [{x, y}] in normalised [0,1] coordinates of
   * `canvas` (one point = tap, several = scribble). Returns Float32Array mask
   * of the object under the points.
   */
  async function tapSelect(canvas, points, progress) {
    const seg = await getInteractive(progress);
    progress && progress({ stage: 'run', message: 'Segmenting selection…', ratio: null });
    await nextFrame();
    const roi = points.length === 1
      ? { keypoint: { x: points[0].x, y: points[0].y } }
      : { scribble: points.map((p) => ({ x: p.x, y: p.y })) };
    let out = null;
    seg.segment(canvas, roi, (res) => {
      const masks = res.confidenceMasks || [];
      // magic touch emits a single confidence channel = the selected object
      const src = masks.length ? masks[masks.length - 1] : null;
      if (src) out = fitTo(maskToFloat(src), canvas.width, canvas.height);
    });
    if (!out) throw new Error('The interactive segmenter returned no mask.');
    return out;
  }

  /* Kept for API symmetry: the legacy task has no per-image state to reset. */
  function invalidateImage() { /* no-op */ }

  /* Colour-key extraction (no ML). */
  function colorKey(canvas, opts) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return MaskOps.colorKey(img.data, canvas.width, canvas.height, opts);
  }

  function isRuntimeAvailable() { return !!state.runtime; }
  function runtimeError() { return state.runtimeError; }

  return { loadRuntime, autoDetect, tapSelect, invalidateImage, colorKey, isRuntimeAvailable, runtimeError, CFG };
})();
