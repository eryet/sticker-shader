/*
 * anim.js — dependency-free encoders for animated sticker exports.
 *
 *  - encodeAPNG(frames, fps): lossless, full alpha (LINE-style animated PNG,
 *    shown by every modern browser). Uses CompressionStream for deflate.
 *  - encodeGIF(frames, fps): the chat-friendly classic; 255-colour palette
 *    built from the frames, 1-bit transparency, LZW compression.
 *
 * `frames` are same-size canvases with straight alpha.
 */
window.StickerAnim = (() => {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* shared                                                             */
  /* ---------------------------------------------------------------- */
  const CRC = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
  function crc32(bytes, start, end) {
    let c = -1;
    for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  function pixels(canvas) { return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; }
  function concat(parts) {
    let n = 0; for (const p of parts) n += p.length;
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') throw new Error('This browser cannot compress PNG data (no CompressionStream).');
    const cs = new CompressionStream('deflate');
    const w = cs.writable.getWriter(); w.write(bytes); w.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  }

  /* ---------------------------------------------------------------- */
  /* APNG                                                               */
  /* ---------------------------------------------------------------- */
  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  }
  function u32(...vals) { const b = new Uint8Array(vals.length * 4), dv = new DataView(b.buffer); vals.forEach((v, i) => dv.setUint32(i * 4, v)); return b; }
  function u16(v) { return new Uint8Array([(v >> 8) & 255, v & 255]); }

  /* PNG "Sub" filter on every row: cheap and compresses well on flat art */
  function filterRows(rgba, w, h) {
    const stride = w * 4, out = new Uint8Array((stride + 1) * h);
    for (let y = 0; y < h; y++) {
      const src = y * stride, dst = y * (stride + 1);
      out[dst] = 1;
      for (let x = 0; x < stride; x++) out[dst + 1 + x] = (rgba[src + x] - (x >= 4 ? rgba[src + x - 4] : 0)) & 255;
    }
    return out;
  }

  async function encodeAPNG(frames, fps) {
    const w = frames[0].width, h = frames[0].height;
    const delayMs = Math.max(10, Math.round(1000 / fps));
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
    parts.push(chunk('IHDR', concat([u32(w, h), new Uint8Array([8, 6, 0, 0, 0])])));
    parts.push(chunk('acTL', u32(frames.length, 0)));
    let seq = 0;
    for (let i = 0; i < frames.length; i++) {
      const data = await deflate(filterRows(pixels(frames[i]), w, h));
      parts.push(chunk('fcTL', concat([u32(seq++, w, h, 0, 0), u16(delayMs), u16(1000), new Uint8Array([1, 0])])));
      if (i === 0) parts.push(chunk('IDAT', data));
      else parts.push(chunk('fdAT', concat([u32(seq++), data])));
    }
    parts.push(chunk('IEND', new Uint8Array(0)));
    return new Blob([concat(parts)], { type: 'image/apng' });
  }

  /* ---------------------------------------------------------------- */
  /* GIF                                                                */
  /* ---------------------------------------------------------------- */
  /* 255-colour palette: the most common 5-5-5 bins across all frames, then nearest-colour mapping per bin */
  function buildPalette(datas) {
    const hist = new Uint32Array(32768);
    for (const d of datas) for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++;
    const bins = [];
    for (let b = 0; b < 32768; b++) if (hist[b]) bins.push(b);
    bins.sort((a, b) => hist[b] - hist[a]);
    const pal = bins.slice(0, 255).map((b) => [((b >> 10) & 31) * 8 + 4, ((b >> 5) & 31) * 8 + 4, (b & 31) * 8 + 4]);
    while (pal.length < 255) pal.push([0, 0, 0]);
    const map = new Uint8Array(32768).fill(255);
    for (const b of bins) {
      const r = ((b >> 10) & 31) * 8 + 4, g = ((b >> 5) & 31) * 8 + 4, bl = (b & 31) * 8 + 4;
      let best = 0, bd = Infinity;
      for (let i = 0; i < pal.length; i++) { const p = pal[i]; const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - bl) ** 2; if (d < bd) { bd = d; best = i; if (d === 0) break; } }
      map[b] = best;
    }
    return { pal, map };
  }
  function indexFrame(d, map) {
    const out = new Uint8Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) out[j] = d[i + 3] < 128 ? 255 : map[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)];
    return out;
  }
  /* GIF-flavoured LZW with a min code size of 8, written as 255-byte sub-blocks */
  function lzw(indices) {
    const out = []; let block = []; let cur = 0, bits = 0;
    const emit = (code, size) => {
      cur |= code << bits; bits += size;
      while (bits >= 8) { block.push(cur & 255); cur >>>= 8; bits -= 8; if (block.length === 255) { out.push(255, ...block); block = []; } }
    };
    const CLEAR = 256, END = 257;
    let dict = new Map(), size = 9, next = 258;
    const reset = () => { dict = new Map(); size = 9; next = 258; };
    emit(CLEAR, 9);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = (prefix << 8) | k;
      const found = dict.get(key);
      if (found !== undefined) { prefix = found; continue; }
      emit(prefix, size);
      if (next < 4096) { dict.set(key, next++); if (next - 1 === (1 << size) && size < 12) size++; }
      else { emit(CLEAR, size); reset(); }
      prefix = k;
    }
    emit(prefix, size); emit(END, size);
    if (bits > 0) block.push(cur & 255);
    if (block.length) out.push(block.length, ...block);
    out.push(0);
    return new Uint8Array(out);
  }

  function encodeGIF(frames, fps) {
    const w = frames[0].width, h = frames[0].height;
    const datas = frames.map(pixels);
    const { pal, map } = buildPalette(datas);
    const delay = Math.max(2, Math.round(100 / fps));
    const parts = [];
    parts.push(new Uint8Array([71, 73, 70, 56, 57, 97]));                       // GIF89a
    parts.push(new Uint8Array([w & 255, w >> 8, h & 255, h >> 8, 0xf7, 255, 0]));  // global palette, 256 entries, bg = transparent index
    const gct = new Uint8Array(256 * 3);
    pal.forEach((p, i) => { gct[i * 3] = p[0]; gct[i * 3 + 1] = p[1]; gct[i * 3 + 2] = p[2]; });
    parts.push(gct);
    parts.push(new Uint8Array([0x21, 0xff, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0]));  // loop forever
    for (const d of datas) {
      parts.push(new Uint8Array([0x21, 0xf9, 4, 0x09, delay & 255, delay >> 8, 255, 0]));     // dispose to background, transparent = 255
      parts.push(new Uint8Array([0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 8]));   // image descriptor + LZW min code size
      parts.push(lzw(indexFrame(d, map)));
    }
    parts.push(new Uint8Array([0x3b]));
    return new Blob([concat(parts)], { type: 'image/gif' });
  }

  /* ---------------------------------------------------------------- */
  /* Animated SVG                                                       */
  /* ---------------------------------------------------------------- */
  /*
   * A tree of stickers as an SVG that animates on its own (SMIL, no script):
   * each node is its rendered die-cut image, its idle animation is sampled
   * from the same formulas as on the canvas, a rainbow band masked by the
   * sticker's own shape slides across it for the foil, faces blink through a
   * second closed-eyes image, and children (icons stuck to a frame) are nested
   * inside their parent so they ride along.
   *
   * node: { img: data URL, blink: data URL | null, w, h, x, y (centre offset
   * inside the parent), rot (deg, clockwise), cfg: settings, children: [node] }
   * opts: { animOffsets(cfg, sz, T), periods: { name: T } }
   */
  function encodeSVG(root, opts) {
    const f = (n) => String(Math.round(n * 100) / 100);
    let uid = 0, defs = '';
    // A parent's animation also moves and scales its children. Reserve the
    // whole subtree's reach so a hop/pop never clips an attached decoration.
    function reach(n) {
      let r = Math.hypot(n.w, n.h) / 2;
      for (const child of n.children || []) r = Math.max(r, Math.hypot(child.x || 0, child.y || 0) + reach(child));
      let extent = r * 1.22;
      const cfg = n.cfg || {}, period = opts.periods[cfg.anim] || Math.PI * 2;
      if (opts.animOffsets) for (let i = 0; i <= 180; i++) {
        const o = opts.animOffsets(cfg, { w: n.w, h: n.h }, i / 180 * period);
        extent = Math.max(extent, (Math.hypot(o.ax, o.ay) + r * o.ascale) * 1.03);
      }
      return extent;
    }
    function node(n) {
      const id = 'n' + (++uid), cfg = n.cfg || {};
      // the picture lives once in <defs>; the visible copy and the foil mask both <use> it
      defs += `<image id="${id}-i" href="${n.img}" x="${f(-n.w / 2)}" y="${f(-n.h / 2)}" width="${f(n.w)}" height="${f(n.h)}"/>`;
      const image = () => `<use href="#${id}-i"/>`;
      // idle animation: translate + rotate + scale sampled over one period, summed
      let anim = '';
      const an = cfg.anim || 'none';
      if (an !== 'none' && (cfg.animAmount == null || cfg.animAmount > 0) && opts.animOffsets) {
        const period = opts.periods[an] || Math.PI * 2, N = 36, dur = f(period / (cfg.animSpeed || 1)) + 's';
        const tr = [], ro = [], sc = [], kt = [];
        for (let i = 0; i <= N; i++) {
          const o = opts.animOffsets(cfg, { w: n.w, h: n.h }, (i / N) * period);
          tr.push(`${f(o.ax)} ${f(o.ay)}`); ro.push(f(-o.arot * 180 / Math.PI)); sc.push(f(o.ascale)); kt.push(String(Math.round(i / N * 1000) / 1000));
        }
        const at = (type, values) => `<animateTransform attributeName="transform" type="${type}" values="${values.join(';')}" keyTimes="${kt.join(';')}" dur="${dur}" repeatCount="indefinite" additive="sum"/>`;
        anim = at('translate', tr) + at('rotate', ro) + at('scale', sc);
      }
      let body = image();
      // blink: the closed-eyes drawing flashes on for a moment every few seconds
      if (n.blink) {
        const p = 0.4 + Math.random() * 0.5;
        body += `<image href="${n.blink}" x="${f(-n.w / 2)}" y="${f(-n.h / 2)}" width="${f(n.w)}" height="${f(n.h)}" opacity="0"><animate attributeName="opacity" values="0;1;0" keyTimes="0;${f(p)};${f(p + 0.04)}" calcMode="discrete" dur="3.6s" repeatCount="indefinite"/></image>`;
      }
      // holographic sweep: a repeating rainbow band, masked by the sticker, sliding along the foil angle
      const holo = Math.max(0, cfg.holoIntensity || 0) * Math.max(0, Math.min(100, cfg.lightStrength ?? 65)) / 100;
      if (holo > 0.05) {
        const op = f(Math.min(0.55, 0.12 + holo * 0.35) * (cfg.softHighlights === false ? 1 : .65)), ang = cfg.patternAngle == null ? 35 : cfg.patternAngle;
        const L = Math.hypot(n.w, n.h), rep = L * 0.9;
        const sat = cfg.saturation == null ? 1 : Math.min(1, cfg.saturation);
        const stop = (o, hue) => `<stop offset="${o}" stop-color="hsl(${hue} ${Math.round(70 * sat + 10)}% ${Math.round(60 + 25 * (1 - sat))}%)"/>`;
        defs += `<linearGradient id="${id}-g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${f(rep)}" y2="0" spreadMethod="repeat">${stop(0, 0)}${stop(0.17, 60)}${stop(0.33, 120)}${stop(0.5, 180)}${stop(0.67, 240)}${stop(0.83, 300)}${stop(1, 360)}</linearGradient>`;
        defs += `<mask id="${id}-m" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="${f(-L)}" y="${f(-L)}" width="${f(2 * L)}" height="${f(2 * L)}">${image()}</mask>`;
        body += `<g mask="url(#${id}-m)" style="mix-blend-mode:screen" opacity="${op}"><g transform="rotate(${f(ang)})"><rect x="${f(-1.5 * L)}" y="${f(-L)}" width="${f(3 * L + rep)}" height="${f(2 * L)}" fill="url(#${id}-g)"><animateTransform attributeName="transform" type="translate" from="0 0" to="${f(-rep)} 0" dur="3.2s" repeatCount="indefinite"/></rect></g></g>`;
      }
      let kids = '';
      for (const c of n.children || []) kids += `<g transform="translate(${f(c.x || 0)} ${f(c.y || 0)})">${node(c)}</g>`;
      return `<g>${anim}<g transform="rotate(${f(n.rot || 0)})">${body}</g>${kids}</g>`;
    }

    const inner = node(root), radius = reach(root) + 8;
    const x0 = -radius, y0 = -radius, W = radius * 2, H = radius * 2;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${f(x0)} ${f(y0)} ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}">\n<!-- made with Sticker Shader Editor: animation is plain SVG, no script -->\n<defs>${defs}</defs>\n${inner}\n</svg>\n`;
  }

  return { encodeAPNG, encodeGIF, encodeSVG };
})();
