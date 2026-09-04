/*
 * maskops.js — pure CPU image/mask utilities for the sticker editor.
 *
 * Masks are Float32Array of length w*h with values in [0,1] (1 = subject).
 * Binary masks are Uint8Array (0/1). All functions are side-effect free and
 * allocate their own outputs unless documented otherwise.
 */
(typeof window !== 'undefined' ? window : self).MaskOps = (() => {   // also loads inside the compose worker
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Separable box blur (moving sum), edge-normalised.                    */
  /* ------------------------------------------------------------------ */
  function boxBlur(src, w, h, r, out) {
    r = Math.max(0, Math.round(r));
    out = out || new Float32Array(w * h);
    if (r === 0) { out.set(src); return out; }
    const tmp = new Float32Array(w * h);
    // horizontal
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0, count = 0;
      for (let x = 0; x <= Math.min(r, w - 1); x++) { sum += src[row + x]; count++; }
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / count;
        const add = x + r + 1, sub = x - r;
        if (add < w) { sum += src[row + add]; count++; }
        if (sub >= 0) { sum -= src[row + sub]; count--; }
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let y = 0; y <= Math.min(r, h - 1); y++) { sum += tmp[y * w + x]; count++; }
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / count;
        const add = y + r + 1, sub = y - r;
        if (add < h) { sum += tmp[add * w + x]; count++; }
        if (sub >= 0) { sum -= tmp[sub * w + x]; count--; }
      }
    }
    return out;
  }

  /* Three box blurs approximate a gaussian of the given sigma. */
  function gaussianBlur(src, w, h, sigma) {
    if (sigma <= 0.3) return Float32Array.from(src);
    const r = Math.max(1, Math.round(sigma * 0.85));
    let a = boxBlur(src, w, h, r);
    a = boxBlur(a, w, h, r);
    return boxBlur(a, w, h, r);
  }

  function threshold(src, t) {
    const out = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = src[i] > t ? 1 : 0;
    return out;
  }

  function toFloat(bin) {
    const out = new Float32Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin[i];
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Guided filter (He et al.) with an RGB guide. Snaps a coarse mask to  */
  /* the image edges and produces soft alpha on hair / fur.               */
  /* rgba: Uint8ClampedArray of the guide image, p: Float32Array mask.    */
  /* ------------------------------------------------------------------ */
  function guidedFilter(rgba, p, w, h, radius, eps) {
    const n = w * h;
    const Ir = new Float32Array(n), Ig = new Float32Array(n), Ib = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      Ir[i] = rgba[j] / 255; Ig[i] = rgba[j + 1] / 255; Ib[i] = rgba[j + 2] / 255;
    }
    const mul = (a, b) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = a[i] * b[i]; return o; };
    const box = (a) => boxBlur(a, w, h, radius);

    const mIr = box(Ir), mIg = box(Ig), mIb = box(Ib), mP = box(p);
    const mIrP = box(mul(Ir, p)), mIgP = box(mul(Ig, p)), mIbP = box(mul(Ib, p));
    const mRR = box(mul(Ir, Ir)), mRG = box(mul(Ir, Ig)), mRB = box(mul(Ir, Ib));
    const mGG = box(mul(Ig, Ig)), mGB = box(mul(Ig, Ib)), mBB = box(mul(Ib, Ib));

    const ar = new Float32Array(n), ag = new Float32Array(n), ab = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const cr = mIrP[i] - mIr[i] * mP[i];
      const cg = mIgP[i] - mIg[i] * mP[i];
      const cb = mIbP[i] - mIb[i] * mP[i];
      // covariance matrix + eps*I
      const s00 = mRR[i] - mIr[i] * mIr[i] + eps;
      const s01 = mRG[i] - mIr[i] * mIg[i];
      const s02 = mRB[i] - mIr[i] * mIb[i];
      const s11 = mGG[i] - mIg[i] * mIg[i] + eps;
      const s12 = mGB[i] - mIg[i] * mIb[i];
      const s22 = mBB[i] - mIb[i] * mIb[i] + eps;
      // inverse of symmetric 3x3 via cofactors
      const c00 = s11 * s22 - s12 * s12;
      const c01 = s02 * s12 - s01 * s22;
      const c02 = s01 * s12 - s02 * s11;
      const c11 = s00 * s22 - s02 * s02;
      const c12 = s01 * s02 - s00 * s12;
      const c22 = s00 * s11 - s01 * s01;
      let det = s00 * c00 + s01 * c01 + s02 * c02;
      if (Math.abs(det) < 1e-12) det = 1e-12;
      const id = 1 / det;
      const xr = (c00 * cr + c01 * cg + c02 * cb) * id;
      const xg = (c01 * cr + c11 * cg + c12 * cb) * id;
      const xb = (c02 * cr + c12 * cg + c22 * cb) * id;
      ar[i] = xr; ag[i] = xg; ab[i] = xb;
      b[i] = mP[i] - xr * mIr[i] - xg * mIg[i] - xb * mIb[i];
    }
    const mAr = box(ar), mAg = box(ag), mAb = box(ab), mB = box(b);
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = mAr[i] * Ir[i] + mAg[i] * Ig[i] + mAb[i] * Ib[i] + mB[i];
      q[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return q;
  }

  /* ------------------------------------------------------------------ */
  /* Exact euclidean distance transform (Felzenszwalb & Huttenlocher).    */
  /* ------------------------------------------------------------------ */
  const INF = 1e20;
  function edt1d(f, n, d, v, z) {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  }

  /* Squared distance from every pixel to the nearest pixel where bin==target. */
  function edtSquared(bin, w, h, target) {
    const n = w * h;
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = bin[i] === target ? 0 : INF;
    const m = Math.max(w, h);
    const f = new Float32Array(m), d = new Float32Array(m);
    const v = new Int32Array(m), z = new Float32Array(m + 1);
    // columns
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = g[y * w + x];
      edt1d(f, h, d, v, z);
      for (let y = 0; y < h; y++) g[y * w + x] = d[y];
    }
    // rows
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) f[x] = g[row + x];
      edt1d(f, w, d, v, z);
      for (let x = 0; x < w; x++) g[row + x] = d[x];
    }
    return g;
  }

  /* Signed distance in pixels: positive inside the shape, negative outside. */
  function signedDistance(bin, w, h) {
    const n = w * h;
    const dOut = edtSquared(bin, w, h, 1); // distance to nearest fg (for bg px)
    const dIn = edtSquared(bin, w, h, 0);  // distance to nearest bg (for fg px)
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = bin[i] ? Math.sqrt(dIn[i]) - 0.5 : -(Math.sqrt(dOut[i]) - 0.5);
    }
    return out;
  }

  /* Distance from each foreground pixel to the nearest background pixel (0 outside). */
  function innerDistance(bin, w, h) {
    const d = edtSquared(bin, w, h, 0);
    const out = new Float32Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin[i] ? Math.sqrt(d[i]) : 0;
    return out;
  }

  /* Offset a binary shape by `px` (positive grows, negative shrinks). */
  function offset(bin, w, h, px) {
    if (px === 0) return Uint8Array.from(bin);
    const sd = signedDistance(bin, w, h);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = sd[i] > -px ? 1 : 0;
    return out;
  }

  /* Smooth a binary outline: blur + re-threshold (rounds corners, removes specks). */
  function smoothOutline(bin, w, h, sigma) {
    if (sigma <= 0.3) return Uint8Array.from(bin);
    const f = gaussianBlur(toFloat(bin), w, h, sigma);
    return threshold(f, 0.5);
  }

  /* ------------------------------------------------------------------ */
  /* Connected components (4-neighbour) with an explicit stack.           */
  /* ------------------------------------------------------------------ */
  function components(bin, w, h) {
    const n = w * h;
    const labels = new Int32Array(n); // 0 = unlabelled / background
    const sizes = [0];
    const stack = new Int32Array(n);
    let next = 1;
    for (let i = 0; i < n; i++) {
      if (!bin[i] || labels[i]) continue;
      let sp = 0; stack[sp++] = i; labels[i] = next; let size = 0;
      while (sp > 0) {
        const p = stack[--sp]; size++;
        const x = p % w, y = (p - x) / w;
        if (x > 0 && bin[p - 1] && !labels[p - 1]) { labels[p - 1] = next; stack[sp++] = p - 1; }
        if (x < w - 1 && bin[p + 1] && !labels[p + 1]) { labels[p + 1] = next; stack[sp++] = p + 1; }
        if (y > 0 && bin[p - w] && !labels[p - w]) { labels[p - w] = next; stack[sp++] = p - w; }
        if (y < h - 1 && bin[p + w] && !labels[p + w]) { labels[p + w] = next; stack[sp++] = p + w; }
      }
      sizes.push(size); next++;
    }
    return { labels, sizes, count: next - 1 };
  }

  /* Keep components whose area is at least `ratio` of the largest one. */
  function keepLargest(bin, w, h, ratio) {
    const { labels, sizes, count } = components(bin, w, h);
    if (count <= 1) return Uint8Array.from(bin);
    let largest = 0;
    for (let k = 1; k < sizes.length; k++) largest = Math.max(largest, sizes[k]);
    const keep = new Uint8Array(sizes.length);
    for (let k = 1; k < sizes.length; k++) keep[k] = sizes[k] >= largest * ratio ? 1 : 0;
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = keep[labels[i]] ? 1 : 0;
    return out;
  }

  /* Fill enclosed holes: background not reachable from the image border becomes fg.
     maxHoleFrac limits the size of holes that get filled (fraction of image area). */
  function fillHoles(bin, w, h, maxHoleFrac) {
    const inv = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) inv[i] = bin[i] ? 0 : 1;
    const { labels, sizes } = components(inv, w, h);
    const touchesBorder = new Uint8Array(sizes.length);
    for (let x = 0; x < w; x++) { touchesBorder[labels[x]] = 1; touchesBorder[labels[(h - 1) * w + x]] = 1; }
    for (let y = 0; y < h; y++) { touchesBorder[labels[y * w]] = 1; touchesBorder[labels[y * w + w - 1]] = 1; }
    const maxSize = (maxHoleFrac == null ? 1 : maxHoleFrac) * w * h;
    const out = Uint8Array.from(bin);
    for (let i = 0; i < bin.length; i++) {
      const l = labels[i];
      if (l && !touchesBorder[l] && sizes[l] <= maxSize) out[i] = 1;
    }
    return out;
  }

  function bbox(bin, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (bin[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) return null;
    return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function area(bin) { let a = 0; for (let i = 0; i < bin.length; i++) a += bin[i]; return a; }

  /* ------------------------------------------------------------------ */
  /* Colour-key background removal (no ML). Models the background from the */
  /* image border with k-means in CIELAB, then floods from the edges.      */
  /* ------------------------------------------------------------------ */
  function rgb2lab(r, g, b) {
    // sRGB -> linear
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const R = lin(r), G = lin(g), B = lin(b);
    let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
    let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  function labImage(rgba, w, h) {
    const n = w * h;
    const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
    // cache on quantised colour to keep this fast
    const cache = new Map();
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const key = ((rgba[j] >> 2) << 12) | ((rgba[j + 1] >> 2) << 6) | (rgba[j + 2] >> 2);
      let lab = cache.get(key);
      if (!lab) { lab = rgb2lab(rgba[j], rgba[j + 1], rgba[j + 2]); cache.set(key, lab); }
      L[i] = lab[0]; A[i] = lab[1]; B[i] = lab[2];
    }
    return { L, A, B };
  }

  function kmeans(points, k, iters) {
    // points: array of [l,a,b]
    const centers = [];
    const step = Math.max(1, Math.floor(points.length / k));
    for (let i = 0; i < k; i++) centers.push(points[Math.min(points.length - 1, i * step)].slice());
    const assign = new Int32Array(points.length);
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < points.length; i++) {
        let best = 0, bd = Infinity; const p = points[i];
        for (let c = 0; c < k; c++) {
          const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2;
          if (d < bd) { bd = d; best = c; }
        }
        assign[i] = best;
      }
      const sums = centers.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < points.length; i++) { const s = sums[assign[i]], p = points[i]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; }
      for (let c = 0; c < k; c++) if (sums[c][3] > 0) centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
    // spread per cluster
    const spread = centers.map(() => 0), counts = centers.map(() => 0);
    for (let i = 0; i < points.length; i++) {
      const c = assign[i], p = points[i], q = centers[c];
      spread[c] += Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2); counts[c]++;
    }
    return centers.map((c, i) => ({ center: c, spread: counts[i] ? spread[i] / counts[i] : 0, weight: counts[i] / points.length }))
      .filter(c => c.weight > 0.02);
  }

  /*
   * opts: { tolerance: 0..1 (default .5), seeds: [{x,y}] optional explicit
   *         background sample points, ring: border thickness fraction }
   * Returns Float32Array soft mask (1 = subject).
   */
  function colorKey(rgba, w, h, opts) {
    opts = opts || {};
    const tol = opts.tolerance == null ? 0.5 : opts.tolerance;
    const lab = labImage(rgba, w, h);
    const pts = [];
    if (opts.seeds && opts.seeds.length) {
      const rad = Math.max(2, Math.round(Math.min(w, h) * 0.006));
      for (const s of opts.seeds) {
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          const x = Math.round(s.x) + dx, y = Math.round(s.y) + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const i = y * w + x; pts.push([lab.L[i], lab.A[i], lab.B[i]]);
        }
      }
    } else {
      const ring = Math.max(2, Math.round(Math.min(w, h) * (opts.ring || 0.03)));
      const stride = Math.max(1, Math.round(Math.sqrt((w * h) / 6000)));
      for (let y = 0; y < h; y += stride) for (let x = 0; x < w; x += stride) {
        if (x < ring || y < ring || x >= w - ring || y >= h - ring) { const i = y * w + x; pts.push([lab.L[i], lab.A[i], lab.B[i]]); }
      }
    }
    const k = opts.seeds && opts.seeds.length ? 2 : Math.min(5, Math.max(1, Math.floor(pts.length / 40)));
    const clusters = kmeans(pts, k, 12);
    // per-pixel background likelihood
    const n = w * h;
    const bgProb = new Float32Array(n);
    // tolerance -> lab distance scale (roughly 6..40 units)
    const scale = 6 + tol * 34;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (const c of clusters) {
        const d = Math.sqrt((lab.L[i] - c.center[0]) ** 2 + (lab.A[i] - c.center[1]) ** 2 + (lab.B[i] - c.center[2]) ** 2);
        const dn = Math.max(0, d - c.spread * 0.5) / scale;
        if (dn < best) best = dn;
      }
      bgProb[i] = Math.exp(-best * best);
    }
    // flood from the border through likely-background pixels
    const isBg = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const push = (i) => { if (!isBg[i] && bgProb[i] > 0.5) { isBg[i] = 1; stack[sp++] = i; } };
    if (opts.seeds && opts.seeds.length) {
      // explicit seeds: flood only from them (a click on a region)
      for (const s of opts.seeds) {
        const x = Math.min(w - 1, Math.max(0, Math.round(s.x))), y = Math.min(h - 1, Math.max(0, Math.round(s.y)));
        const i = y * w + x; bgProb[i] = 1; push(i);
      }
    } else {
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    }
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    // soft mask: inside flood → soft by bgProb near edges, else subject
    const mask = new Float32Array(n);
    for (let i = 0; i < n; i++) mask[i] = isBg[i] ? Math.max(0, 1 - bgProb[i]) * 0.5 : 1 - bgProb[i] * 0.5 * (bgProb[i] > 0.85 ? 1 : 0);
    // clean: binary core, remove specks, then soften edges with the image
    let bin = threshold(mask, 0.5);
    if (!(opts.seeds && opts.seeds.length)) bin = keepLargest(bin, w, h, 0.02);
    const soft = guidedFilter(rgba, toFloat(bin), w, h, Math.max(2, Math.round(Math.max(w, h) / 200)), 0.002);
    return soft;
  }

  /* ------------------------------------------------------------------ */
  /* Resampling helpers                                                    */
  /* ------------------------------------------------------------------ */
  function resizeFloat(src, sw, sh, dw, dh) {
    if (sw === dw && sh === dh) return Float32Array.from(src);
    const out = new Float32Array(dw * dh);
    const sx = sw / dw, sy = sh / dh;
    for (let y = 0; y < dh; y++) {
      const fy = Math.min(sh - 1, (y + 0.5) * sy - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(sh - 1, y0 + 1), ty = Math.max(0, fy - y0);
      for (let x = 0; x < dw; x++) {
        const fx = Math.min(sw - 1, (x + 0.5) * sx - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(sw - 1, x0 + 1), tx = Math.max(0, fx - x0);
        const a = src[y0 * sw + x0], b = src[y0 * sw + x1], c = src[y1 * sw + x0], d = src[y1 * sw + x1];
        out[y * dw + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      }
    }
    return out;
  }

  return {
    boxBlur, gaussianBlur, threshold, toFloat, guidedFilter,
    signedDistance, innerDistance, offset, smoothOutline, components, keepLargest, fillHoles,
    bbox, area, colorKey, resizeFloat, rgb2lab,
  };
})();
