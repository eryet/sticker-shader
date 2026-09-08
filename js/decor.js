/*
 * decor.js — the cute bits.
 *
 *  - ICONS: a procedural library of little decorations (teacup, latte mug,
 *    cinnamon roll, cupcake, clouds, moon, sparkles, music notes, ticket stub,
 *    …) drawn with thick rounded outlines and pastel fills. Each icon is
 *    rendered to a canvas and then goes through the normal die-cut pipeline,
 *    so it becomes a sticker with a white border and the foil material like
 *    everything else.
 *  - composeFrame: a Polaroid-style portrait frame (body with a straight,
 *    scalloped, cloud, ticket or postage-stamp edge; a rounded / circle /
 *    heart / cloud / arch window; hand-lettered caption and subtitle; corner
 *    decorations; optional washi tape) with a photo sticker's cutout composed
 *    into the window.
 *  - patterns: tiling dots / grid / stripes / hearts / stars / checks shared
 *    by the stage backdrop, the frame window and body, and the PNG export.
 *
 * Everything here draws with Canvas 2D at whatever resolution is asked for.
 */
(typeof window !== 'undefined' ? window : self).StickerDecor = (() => {   // also loads inside the compose worker
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hasDOM = typeof document !== 'undefined';
  // The reference stays unmodified; these masks reuse its original decoration artwork.
  let referenceArtwork = null;
  const REFERENCE_SPRITES = {
    'cafe-teacup': { box: [52, 56, 286, 267], path: 'M60 153 C75 119 112 94 153 76 C188 60 218 57 237 63 C265 44 288 62 302 83 C313 103 314 116 307 130 C332 137 342 159 337 181 C334 202 316 222 298 239 C301 252 278 267 251 280 C215 301 170 319 143 322 C112 325 89 311 87 288 C86 270 96 255 100 244 C78 227 56 208 54 188 C51 174 55 161 60 153 Z' },
    'cafe-cloud': { box: [906, 109, 271, 210], path: 'M917 219 C900 196 910 163 931 151 C944 143 956 140 968 143 C980 120 1002 107 1024 109 C1052 109 1072 122 1084 140 C1110 133 1138 146 1152 166 C1164 184 1161 204 1154 215 C1176 234 1184 260 1170 284 C1156 313 1127 321 1099 315 C1086 313 1075 307 1068 302 C1048 317 1023 317 1002 306 C986 298 977 284 971 272 C944 271 923 256 916 238 C914 231 914 225 917 219 Z' },
    'cafe-roll': { box: [42, 890, 263, 253], path: 'M48 973 C56 937 89 899 119 892 C133 888 145 891 155 895 C186 887 220 903 244 923 C273 946 293 974 291 1000 C300 1020 306 1045 301 1066 C296 1090 278 1115 258 1127 C234 1144 208 1146 184 1137 C159 1132 141 1118 119 1106 C92 1092 65 1069 52 1042 C43 1020 39 995 48 973 Z' },
  };
  const referenceSprites = {};
  function referenceSprite(id) {
    if (!referenceArtwork || !REFERENCE_SPRITES[id]) return null;
    if (!referenceSprites[id]) {
      const { box: [x, y, w, h], path } = REFERENCE_SPRITES[id];
      const c = newCanvas(w, h), ctx = c.getContext('2d');
      ctx.translate(-x, -y); ctx.clip(new Path2D(path)); ctx.drawImage(referenceArtwork, 0, 0);
      // The wide white sticker border separates the artwork from the thin grid lines.
      // Follow that border to remove the original backdrop around the rough region mask.
      const pixels = ctx.getImageData(0, 0, w, h), d = pixels.data;
      const ops = (hasDOM ? window : self).MaskOps, white = new Float32Array(w * h);
      for (let i = 0; i < white.length; i++) white[i] = d[i * 4 + 3] > 250 && Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) > 246 ? 1 : 0;
      const border = ops.boxBlur(white, w, h, 2), outside = new Uint8Array(w * h), queue = new Int32Array(w * h);
      let head = 0, tail = 0;
      const visit = (i) => { if (!outside[i] && border[i] < 0.999) { outside[i] = 1; queue[tail++] = i; } };
      for (let i = 0; i < outside.length; i++) if (!d[i * 4 + 3] || i < w || i >= w * (h - 1) || i % w === 0 || i % w === w - 1) visit(i);
      while (head < tail) {
        const i = queue[head++], col = i % w;
        if (col) visit(i - 1); if (col < w - 1) visit(i + 1);
        if (i >= w) visit(i - w); if (i < w * (h - 1)) visit(i + w);
      }
      for (let i = 0; i < outside.length; i++) if (outside[i]) d[i * 4 + 3] = 0;
      ctx.putImageData(pixels, 0, 0); alphaOutline(c, 2.5, '#ffffff');
      referenceSprites[id] = c;
    }
    return referenceSprites[id];
  }
  function drawReferenceIcon(ctx, id) {
    const img = referenceSprite(id); if (!img) return false;
    const scale = 92 / Math.max(img.width, img.height);
    ctx.drawImage(img, 50 - img.width * scale / 2, 50 - img.height * scale / 2, img.width * scale, img.height * scale);
    return true;
  }
  /* a drawing surface that works on the page and inside a worker */
  function newCanvas(w, h) {
    if (hasDOM) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return new OffscreenCanvas(w, h);
  }

  const FONTS = {
    marker: '"Patrick Hand", "Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive',
    round: '"Varela Round", "Arial Rounded MT Bold", "Nunito", "Helvetica Rounded", system-ui, sans-serif',
    typewriter: '"Courier Prime", "Courier New", ui-monospace, monospace',
    clean: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    // kaomoji mix Latin, Greek, katakana and symbols: a stack with wide coverage and consistent weights
    kaomoji: '"Segoe UI", "Noto Sans TC", "Hiragino Sans", "Noto Sans", "Apple Symbols", "Segoe UI Symbol", system-ui, sans-serif',
  };
  const FONT_OPTIONS = [['marker', 'Hand lettered'], ['round', 'Rounded'], ['typewriter', 'Typewriter'], ['clean', 'Clean sans']];

  /* ------------------------------------------------------------------ */
  /* Tiling patterns                                                      */
  /* ------------------------------------------------------------------ */
  const PATTERNS = {
    dots: { w: 48, h: 48, draw(ctx) { dot(ctx, 12, 12, 4.5); dot(ctx, 36, 36, 4.5); } },
    grid: { w: 96, h: 96, draw(ctx) { ctx.fillRect(0, 0, 96, 3); ctx.fillRect(0, 0, 3, 96); } },
    lines: { w: 8, h: 40, draw(ctx) { ctx.fillRect(0, 18, 8, 2.5); } },
    stripes: { w: 40, h: 40, draw(ctx) { ctx.lineWidth = 6; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(-10, 50); ctx.lineTo(50, -10); ctx.moveTo(-10, 10); ctx.lineTo(10, -10); ctx.moveTo(30, 50); ctx.lineTo(50, 30); ctx.stroke(); } },
    hearts: { w: 64, h: 64, draw(ctx) { ctx.beginPath(); heartPath(ctx, 16, 17, 8); ctx.fill(); ctx.beginPath(); heartPath(ctx, 48, 49, 8); ctx.fill(); } },
    stars: { w: 72, h: 72, draw(ctx) { ctx.beginPath(); sparklePath(ctx, 18, 18, 9); ctx.fill(); ctx.beginPath(); sparklePath(ctx, 54, 50, 6); ctx.fill(); ctx.beginPath(); sparklePath(ctx, 58, 14, 3.5); ctx.fill(); dot(ctx, 24, 56, 2.2); } },
    clouds: { w: 96, h: 72, draw(ctx) { for (const [x, y, s] of [[26, 24, 1], [70, 54, 0.8]]) { ctx.beginPath(); ctx.arc(x - 9 * s, y + 3 * s, 7 * s, 0, TAU); ctx.arc(x, y - 3 * s, 9 * s, 0, TAU); ctx.arc(x + 9 * s, y + 3 * s, 7 * s, 0, TAU); ctx.rect(x - 12 * s, y + 3 * s, 24 * s, 7 * s); ctx.fill(); } } },
    checks: { w: 48, h: 48, draw(ctx) { ctx.fillRect(0, 0, 24, 24); ctx.fillRect(24, 24, 24, 24); } },
    scallops: { w: 48, h: 24, draw(ctx) { ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(12, 14, 11, Math.PI, 0); ctx.arc(36, 14, 11, Math.PI, 0); ctx.stroke(); } },
  };
  const PATTERN_OPTIONS = [['none', 'None'], ['dots', 'Polka dots'], ['grid', 'Grid paper'], ['lines', 'Ruled lines'], ['stripes', 'Diagonal stripes'], ['hearts', 'Tiny hearts'], ['stars', 'Sparkles'], ['clouds', 'Little clouds'], ['checks', 'Gingham checks'], ['scallops', 'Scallops']];

  function dot(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

  /*
   * One tile of a pattern. `scale` stretches the period, `res` is extra
   * resolution (use the devicePixelRatio for CSS backgrounds). Returns null
   * for 'none'.
   */
  function patternTile(kind, color, scale, res) {
    const p = PATTERNS[kind]; if (!p) return null;
    scale = scale || 1; res = res || 1;
    const c = newCanvas(Math.max(1, Math.round(p.w * scale * res)), Math.max(1, Math.round(p.h * scale * res)));
    const ctx = c.getContext('2d');
    ctx.scale(c.width / p.w, c.height / p.h);
    ctx.fillStyle = color; ctx.strokeStyle = color;
    p.draw(ctx);
    return c;
  }

  /* Fill a rectangle with a pattern, tiles anchored at (x, y). */
  function fillPattern(ctx, x, y, w, h, kind, color, scale) {
    const tile = patternTile(kind, color, scale, 1); if (!tile) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* Backdrop themes: one click to a cute scene. */
  const THEMES = {
    'Sky': { background: '#a3cbee', bgPattern: 'grid', bgPatternColor: '#ffffff', bgPatternScale: 1.2 },
    'Cloudy sky': { background: '#b7d6f2', bgPattern: 'clouds', bgPatternColor: '#ffffff', bgPatternScale: 1.4 },
    'Blossom': { background: '#f9d3de', bgPattern: 'dots', bgPatternColor: '#ffffff', bgPatternScale: 1 },
    'Mint': { background: '#c6ead6', bgPattern: 'hearts', bgPatternColor: '#ffffff', bgPatternScale: 1 },
    'Lemon': { background: '#fbe8a6', bgPattern: 'stars', bgPatternColor: '#fff9e0', bgPatternScale: 1.2 },
    'Lavender': { background: '#ddd3f5', bgPattern: 'checks', bgPatternColor: '#e9e2fa', bgPatternScale: 1 },
    'Café latte': { background: '#f1e4d3', bgPattern: 'dots', bgPatternColor: '#ffffff', bgPatternScale: 1.2 },
    'Notebook': { background: '#fbf7ee', bgPattern: 'lines', bgPatternColor: '#c9d8ea', bgPatternScale: 1 },
    'Night': { background: '#1c1d22', bgPattern: 'none', bgPatternColor: '#ffffff', bgPatternScale: 1 },
  };

  /* ------------------------------------------------------------------ */
  /* Shape helpers (icon space is 0..100)                                 */
  /* ------------------------------------------------------------------ */
  function rrPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function heartPath(ctx, cx, cy, s) {
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 0.7, cy + s * 0.4, cx - s, cy + s * 0.02, cx - s, cy - s * 0.32);
    ctx.bezierCurveTo(cx - s, cy - s * 0.7, cx - s * 0.7, cy - s * 0.92, cx - s * 0.44, cy - s * 0.92);
    ctx.bezierCurveTo(cx - s * 0.2, cy - s * 0.92, cx - s * 0.05, cy - s * 0.78, cx, cy - s * 0.6);
    ctx.bezierCurveTo(cx + s * 0.05, cy - s * 0.78, cx + s * 0.2, cy - s * 0.92, cx + s * 0.44, cy - s * 0.92);
    ctx.bezierCurveTo(cx + s * 0.7, cy - s * 0.92, cx + s, cy - s * 0.7, cx + s, cy - s * 0.32);
    ctx.bezierCurveTo(cx + s, cy + s * 0.02, cx + s * 0.7, cy + s * 0.4, cx, cy + s * 0.9);
    ctx.closePath();
  }
  function sparklePath(ctx, cx, cy, r, pinch) {
    const p = r * (pinch == null ? 0.14 : pinch);
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + p, cy - p, cx + r, cy);
    ctx.quadraticCurveTo(cx + p, cy + p, cx, cy + r);
    ctx.quadraticCurveTo(cx - p, cy + p, cx - r, cy);
    ctx.quadraticCurveTo(cx - p, cy - p, cx, cy - r);
    ctx.closePath();
  }
  function starPath(ctx, cx, cy, R, r, n) {
    n = n || 5;
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r : R;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  /*
   * The puffy cloud used by icons, the frame window and frame decorations
   * (unit box 0..100; the cloud itself spans x 13..88, y 22..76). Each part
   * starts with moveTo so several parts can share one path without joins.
   */
  function cloudParts(ctx, x, y, w, h) {
    const sx = w / 100, sy = h / 100;
    const ell = (cx, cy, r) => () => { ctx.moveTo(x + (cx + r) * sx, y + cy * sy); ctx.ellipse(x + cx * sx, y + cy * sy, r * sx, r * sy, 0, 0, TAU); };
    return [
      ell(30, 58, 17), ell(50, 45, 23), ell(71, 56, 17),
      () => rrPath(ctx, x + 20 * sx, y + 56 * sy, 62 * sx, 20 * sy, Math.min(10 * sx, 10 * sy)),
    ];
  }
  /* cloudParts sized so the cloud itself fills the box (x, y, w, h) */
  function cloudFilling(ctx, x, y, w, h) {
    const bw = w / 0.75, bh = h / 0.54;
    return cloudParts(ctx, x - 0.13 * bw, y - 0.22 * bh, bw, bh);
  }

  /* fill + outline one path */
  function shape(ctx, fill, path) {
    ctx.beginPath(); path();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (ctx.lineWidth > 0.01) ctx.stroke();
  }
  /*
   * Several overlapping parts drawn as one blob with a single outer outline:
   * stroke every part at double width first, then fill them all on top.
   */
  function blob(ctx, fill, lw, parts) {
    const prev = ctx.lineWidth;
    if (lw > 0.01) {
      ctx.lineWidth = lw * 2;
      for (const p of parts) { ctx.beginPath(); p(); ctx.stroke(); }
    }
    ctx.fillStyle = fill;
    for (const p of parts) { ctx.beginPath(); p(); ctx.fill(); }
    ctx.lineWidth = prev;
  }
  /* punch a hole and outline it */
  function hole(ctx, path) {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); path(); ctx.fill(); ctx.restore();
    ctx.beginPath(); path(); ctx.stroke();
  }
  function shine(ctx, x, y, rx, ry, rot) {
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  function blush(ctx, x, y) {
    ctx.save(); ctx.fillStyle = 'rgba(242,128,160,0.6)';
    ctx.beginPath(); ctx.ellipse(x, y, 4.2, 2.6, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  /* kawaii face: dot eyes (or closed arcs when sleepy / blinking), a small smile, blush */
  function face(ctx, c, cx, cy, spread, sleepy, blink) {
    spread = spread || 7;
    ctx.save();
    ctx.fillStyle = c.outline; ctx.strokeStyle = c.outline;
    if (sleepy || blink) {
      ctx.lineWidth = Math.max(1.4, ctx.lineWidth * 0.5);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * spread, cy - 1.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    } else { dot(ctx, cx - spread, cy, 1.8); dot(ctx, cx + spread, cy, 1.8); }
    ctx.lineWidth = Math.max(1.2, ctx.lineWidth * 0.45); ctx.beginPath(); ctx.arc(cx, cy + 1.5, 3.2, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
    ctx.restore();
    blush(ctx, cx - spread - 4, cy + 4); blush(ctx, cx + spread + 4, cy + 4);
  }
  function steam(ctx, lw, xs, y0) {
    ctx.save(); ctx.lineWidth = lw * 0.7;
    for (const x of xs) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.bezierCurveTo(x - 7, y0 - 6, x + 7, y0 - 10, x, y0 - 17); ctx.stroke(); }
    ctx.restore();
  }
  function sprinkles(ctx, c, pts, lw) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = lw * 0.55;
    const cols = [c.extra, c.warm, c.fill, c.mint];
    pts.forEach(([x, y, a], i) => { ctx.strokeStyle = cols[i % cols.length]; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 2.6, y - Math.sin(a) * 2.6); ctx.lineTo(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6); ctx.stroke(); });
    ctx.restore();
  }

  /* Centred text that shrinks to fit a box. */
  function fitText(ctx, str, cx, cy, maxW, maxH, color, font, weight) {
    if (!str) return;
    let size = maxH;
    const fam = FONTS[font] || FONTS.marker;
    for (let i = 0; i < 12; i++) {
      ctx.font = `${weight || 400} ${size.toFixed(1)}px ${fam}`;
      const w = ctx.measureText(str).width;
      if (w <= maxW || size < 4) break;
      size *= Math.max(0.6, Math.min(0.96, maxW / w));
    }
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, cx, cy);
  }

  /* ------------------------------------------------------------------ */
  /* Icon library                                                         */
  /* ------------------------------------------------------------------ */
  /* Code-drawn artwork from the café reference, shared by the frame and tray. */
  function puppyHead(ctx) {
    ctx.moveTo(32, 32);
    ctx.bezierCurveTo(38, 22, 62, 22, 69, 32);
    ctx.bezierCurveTo(79, 30, 80, 42, 91, 45);
    ctx.bezierCurveTo(103, 49, 97, 62, 87, 61);
    ctx.bezierCurveTo(78, 61, 74, 53, 70, 44);
    ctx.bezierCurveTo(76, 60, 65, 66, 50, 66);
    ctx.bezierCurveTo(34, 66, 25, 60, 30, 44);
    ctx.bezierCurveTo(23, 54, 17, 62, 9, 61);
    ctx.bezierCurveTo(-1, 60, 0, 48, 10, 45);
    ctx.bezierCurveTo(21, 42, 23, 31, 32, 32);
    ctx.closePath();
  }
  function drawCinnamoroll(ctx, c, lw) {
    ctx.save(); ctx.lineWidth = lw * 0.32;
    shape(ctx, c.fill, () => { ctx.moveTo(61, 71); ctx.bezierCurveTo(74, 60, 84, 66, 82, 76); ctx.bezierCurveTo(80, 87, 66, 85, 63, 79); ctx.closePath(); });
    shape(ctx, null, () => { ctx.moveTo(72, 71); ctx.bezierCurveTo(79, 72, 75, 81, 70, 77); });
    shape(ctx, c.fill, () => ctx.ellipse(33, 72, 7, 4, -0.7, 0, TAU));
    shape(ctx, c.fill, () => ctx.ellipse(66, 72, 7, 4, 0.65, 0, TAU));
    shape(ctx, c.fill, () => ctx.ellipse(42, 86, 5.3, 5, -0.3, 0, TAU));
    shape(ctx, c.fill, () => ctx.ellipse(59, 86, 5.3, 5, 0.3, 0, TAU));
    shape(ctx, c.fill, () => { ctx.moveTo(37, 62); ctx.bezierCurveTo(31, 70, 32, 85, 45, 86); ctx.bezierCurveTo(64, 89, 72, 75, 62, 63); ctx.closePath(); });
    shape(ctx, c.fill, () => puppyHead(ctx));
    ctx.restore();
  }
  function cinnamorollFace(ctx, c, lw, blink) {
    ctx.save(); ctx.lineWidth = lw * 0.24;
    ctx.fillStyle = c.accent;
    for (const x of [37, 64]) { ctx.beginPath(); ctx.ellipse(x, 55, 5, 3.4, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = c.extra; ctx.strokeStyle = c.extra;
    for (const x of [40, 61]) {
      if (blink) { ctx.beginPath(); ctx.moveTo(x - 2, 49); ctx.quadraticCurveTo(x, 51, x + 2, 49); ctx.stroke(); }
      else { ctx.beginPath(); ctx.ellipse(x, 49, 2, 3.1, 0, 0, TAU); ctx.fill(); }
    }
    ctx.strokeStyle = c.outline;
    shape(ctx, null, () => { ctx.moveTo(46, 54); ctx.bezierCurveTo(46, 58, 49, 57, 50.5, 54.5); ctx.bezierCurveTo(52, 57, 55, 58, 55, 54); });
    ctx.restore();
  }
  function drawCinnamorollDuo(ctx, c, lw, text, faceOn) {
    ctx.save(); ctx.translate(0, 19); ctx.scale(1, 0.8); drawCinnamoroll(ctx, c, lw); ctx.restore();
    ctx.save(); ctx.translate(25, 7); ctx.scale(0.5, 0.5); ctx.lineWidth = lw * 0.45;
    shape(ctx, c.fill, () => puppyHead(ctx));
    shape(ctx, null, () => { ctx.moveTo(44, 35); ctx.bezierCurveTo(33, 24, 40, 14, 49, 21); ctx.bezierCurveTo(59, 30, 39, 35, 41, 20); });
    if (faceOn) {
      ctx.fillStyle = c.accent;
      for (const x of [34, 67]) { ctx.beginPath(); ctx.ellipse(x, 53, 5, 3.5, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = c.outline;
      for (const x of [38, 63]) { ctx.beginPath(); ctx.ellipse(x, 47, 2.5, 3.6, 0, 0, TAU); ctx.fill(); }
      shape(ctx, c.fill, () => ctx.ellipse(50, 56, 4.3, 5.2, 0, 0, TAU));
    }
    for (const x of [31, 69]) shape(ctx, c.fill, () => ctx.ellipse(x, 64, 5.5, 4, 0, 0, TAU));
    ctx.restore();
  }
  /*
   * draw(ctx, c, lw, text, faceOn): ctx is scaled so the icon lives in
   * 0..100, c = { fill, accent, extra, warm, brown, mint, outline }, lw =
   * outline width. `line: true` marks pure line-art icons that look best
   * without the white die-cut border (they get border 0 by default). `text`
   * gives a default caption for icons that carry text. `face: [x, y, spread,
   * sleepy]` says where a kawaii face can go; `faceDefault` whether it is
   * shown unless asked otherwise (faceOn tells draw() so it can leave room).
   */
  const ICONS = [
    /* ---- Cinnamoroll café reference ---- */
    { id: 'cinnamoroll', name: 'Cinnamoroll', palette: 'Cinnamoroll café', face: [50, 49, 10], faceDefault: true, draw: drawCinnamoroll, drawFace: cinnamorollFace },
    {
      id: 'cinnamoroll-duo', name: 'Cinnamoroll duo', palette: 'Cinnamoroll café', face: [50, 58, 10], faceDefault: true, draw: drawCinnamorollDuo,
      drawFace(ctx, c, lw, blink) { ctx.save(); ctx.translate(0, 19); ctx.scale(1, 0.8); cinnamorollFace(ctx, c, lw, blink); ctx.restore(); },
    },
    {
      id: 'cafe-teacup', name: 'Café teacup', palette: 'Cinnamoroll café', draw(ctx, c, lw) {
        if (drawReferenceIcon(ctx, 'cafe-teacup')) return;
        ctx.lineWidth = lw * 0.8;
        shape(ctx, c.extra, () => ctx.ellipse(50, 77, 39, 14, 0, 0, TAU));
        shape(ctx, null, () => { ctx.moveTo(25, 76); ctx.bezierCurveTo(26, 84, 64, 84, 74, 74); });
        shape(ctx, c.fill, () => { ctx.moveTo(72, 29); ctx.bezierCurveTo(96, 16, 101, 56, 73, 59); ctx.closePath(); });
        hole(ctx, () => { ctx.moveTo(78, 34); ctx.bezierCurveTo(90, 29, 90, 48, 77, 49); ctx.closePath(); });
        const cup = () => { ctx.moveTo(16, 35); ctx.lineTo(77, 35); ctx.bezierCurveTo(80, 65, 66, 76, 46, 76); ctx.bezierCurveTo(27, 76, 16, 64, 16, 35); ctx.closePath(); };
        shape(ctx, c.fill, cup);
        ctx.save(); ctx.beginPath(); cup(); ctx.clip(); ctx.fillStyle = c.accent; ctx.fillRect(10, 36, 70, 11); ctx.restore();
        shape(ctx, c.brown, () => ctx.ellipse(46.5, 35, 30.5, 11, 0, 0, TAU));
        ctx.save(); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = c.fill;
        shape(ctx, null, () => { ctx.ellipse(46.5, 35, 28, 9, 0, Math.PI * 1.05, Math.PI * 1.9); }); ctx.restore();
      },
    },
    {
      id: 'cafe-roll', name: 'Frosted cinnamon roll', palette: 'Cinnamoroll café', draw(ctx, c, lw) {
        if (drawReferenceIcon(ctx, 'cafe-roll')) return;
        ctx.lineWidth = lw * 0.78;
        shape(ctx, c.brown, () => ctx.ellipse(50, 59, 36, 30, 0, 0, TAU));
        shape(ctx, c.accent, () => { ctx.moveTo(17, 52); ctx.bezierCurveTo(14, 21, 37, 10, 59, 19); ctx.bezierCurveTo(83, 25, 95, 51, 78, 71); ctx.bezierCurveTo(72, 78, 65, 73, 55, 72); ctx.bezierCurveTo(39, 70, 21, 72, 17, 52); ctx.closePath(); });
        shape(ctx, null, () => {
          for (let t = 0; t <= 1.001; t += 0.02) {
            const a = 0.4 + t * Math.PI * 3.6, r = 2 + t * 22;
            const x = 51 + Math.cos(a) * r, y = 44 + Math.sin(a) * r * 0.9;
            if (!t) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
        });
        shape(ctx, null, () => { ctx.moveTo(24, 51); ctx.bezierCurveTo(27, 66, 44, 77, 58, 79); });
      },
    },
    {
      id: 'cafe-cloud', name: 'Café cloud', palette: 'Cinnamoroll café', draw(ctx, c, lw) {
        if (drawReferenceIcon(ctx, 'cafe-cloud')) return;
        ctx.lineWidth = lw * 0.8;
        shape(ctx, c.extra, () => { ctx.moveTo(23, 65); ctx.bezierCurveTo(1, 68, 2, 34, 25, 39); ctx.bezierCurveTo(28, 14, 55, 14, 60, 38); ctx.bezierCurveTo(82, 27, 94, 48, 82, 60); ctx.bezierCurveTo(106, 82, 73, 97, 60, 77); ctx.bezierCurveTo(47, 95, 24, 83, 23, 65); ctx.closePath(); });
      },
    },
    /* ---- café & sweets ---- */
    {
      id: 'roll', name: 'Cinnamon roll', face: [50, 44, 9], faceDefault: false, draw(ctx, c, lw, text, faceOn) {
        shape(ctx, c.brown, () => ctx.ellipse(50, 60, 40, 30, 0, 0, TAU));
        shape(ctx, c.fill, () => {
          ctx.moveTo(12, 56);
          ctx.bezierCurveTo(10, 30, 30, 22, 50, 22);
          ctx.bezierCurveTo(70, 22, 90, 30, 88, 56);
          ctx.bezierCurveTo(88, 65, 80, 67, 78, 60);
          ctx.bezierCurveTo(76, 54, 70, 56, 66, 61);
          ctx.bezierCurveTo(62, 69, 54, 67, 52, 60);
          ctx.bezierCurveTo(50, 54, 44, 56, 40, 63);
          ctx.bezierCurveTo(36, 71, 26, 69, 24, 60);
          ctx.bezierCurveTo(22, 54, 14, 63, 12, 56);
          ctx.closePath();
        });
        if (!faceOn) {
          ctx.save(); ctx.lineWidth = lw * 0.8; ctx.beginPath();
          for (let t = 0; t <= 1.0001; t += 0.02) {
            const a = t * Math.PI * 4.6, r = 2 + t * 23;
            const x = 50 + Math.cos(a) * r, y = 42 + Math.sin(a) * r * 0.6;
            if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke(); ctx.restore();
          blush(ctx, 30, 50); blush(ctx, 70, 50);
        }
      },
    },
    {
      id: 'teacup', name: 'Teacup', draw(ctx, c, lw) {
        shape(ctx, c.extra, () => ctx.ellipse(50, 81, 42, 9, 0, 0, TAU));
        ctx.save(); ctx.lineWidth = lw * 0.55; ctx.beginPath(); ctx.ellipse(50, 80, 28, 4.5, 0, 0, TAU); ctx.stroke(); ctx.restore();
        shape(ctx, c.fill, () => ctx.arc(78, 51, 12, 0, TAU));
        const cup = () => { ctx.moveTo(18, 35); ctx.lineTo(78, 35); ctx.bezierCurveTo(78, 63, 66, 77, 48, 77); ctx.bezierCurveTo(30, 77, 18, 63, 18, 35); ctx.closePath(); };
        shape(ctx, c.fill, cup);
        ctx.save(); ctx.beginPath(); cup(); ctx.clip(); ctx.fillStyle = c.accent; ctx.fillRect(0, 60, 100, 30); ctx.restore();
        ctx.beginPath(); cup(); ctx.stroke();
        shape(ctx, c.brown, () => ctx.ellipse(48, 35, 30, 8, 0, 0, TAU));
        shine(ctx, 38, 33.5, 8, 2, 0);
        steam(ctx, lw, [38, 54], 22);
      },
    },
    {
      id: 'mug', name: 'Latte mug', face: [45, 50, 8], faceDefault: false, draw(ctx, c, lw) {
        shape(ctx, c.fill, () => ctx.arc(74, 56, 14, 0, TAU));
        const body = () => rrPath(ctx, 18, 30, 54, 56, 9);
        shape(ctx, c.fill, body);
        ctx.save(); ctx.beginPath(); body(); ctx.clip(); ctx.fillStyle = c.extra; ctx.fillRect(0, 62, 100, 12); ctx.restore();
        ctx.beginPath(); body(); ctx.stroke();
        hole(ctx, () => ctx.arc(76, 56, 5.5, 0, TAU));
        shape(ctx, c.brown, () => ctx.ellipse(45, 31, 27, 8, 0, 0, TAU));
        ctx.save(); ctx.translate(45, 32); ctx.scale(1, 0.62); ctx.fillStyle = c.fill; ctx.beginPath(); heartPath(ctx, 0, 0, 7); ctx.fill(); ctx.restore();
        steam(ctx, lw, [34, 52], 20);
      },
    },
    {
      id: 'cupcake', name: 'Cupcake', face: [50, 70, 8], faceDefault: false, draw(ctx, c, lw) {
        const cup = () => { ctx.moveTo(22, 54); ctx.lineTo(78, 54); ctx.lineTo(70, 90); ctx.lineTo(30, 90); ctx.closePath(); };
        shape(ctx, c.accent, cup);
        ctx.save(); ctx.beginPath(); cup(); ctx.clip(); ctx.fillStyle = c.fill;
        for (const x of [34, 50, 66]) ctx.fillRect(x - 3, 54, 6, 40);
        ctx.restore(); ctx.beginPath(); cup(); ctx.stroke();
        blob(ctx, c.fill, lw, [
          () => ctx.arc(33, 50, 13, 0, TAU), () => ctx.arc(50, 44, 15, 0, TAU), () => ctx.arc(67, 50, 13, 0, TAU),
          () => rrPath(ctx, 22, 46, 56, 12, 6), () => ctx.arc(50, 31, 9, 0, TAU),
        ]);
        sprinkles(ctx, c, [[36, 46, 0.4], [58, 38, -0.7], [64, 52, 1.2], [46, 52, 2.4]], lw);
        ctx.beginPath(); ctx.moveTo(50, 22); ctx.quadraticCurveTo(54, 14, 60, 12); ctx.stroke();
        shape(ctx, c.accent, () => ctx.arc(50, 24, 5.5, 0, TAU));
      },
    },
    {
      id: 'macaron', name: 'Macaron', face: [50, 39, 8], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.extra, () => ctx.ellipse(50, 66, 34, 12, 0, 0, TAU));
        shape(ctx, c.fill, () => rrPath(ctx, 18, 47, 64, 14, 7));
        shape(ctx, c.extra, () => ctx.ellipse(50, 40, 34, 13, 0, 0, TAU));
      },
    },
    {
      id: 'pancakes', name: 'Pancakes', draw(ctx, c, lw) {
        for (const y of [76, 64, 52]) shape(ctx, c.brown, () => ctx.ellipse(50, y, 38, 13, 0, 0, TAU));
        shape(ctx, c.warm, () => {
          ctx.moveTo(14, 50); ctx.bezierCurveTo(14, 36, 86, 36, 86, 50);
          ctx.bezierCurveTo(86, 56, 80, 58, 78, 52); ctx.bezierCurveTo(76, 62, 70, 64, 68, 54);
          ctx.bezierCurveTo(66, 60, 60, 60, 58, 54); ctx.bezierCurveTo(56, 66, 48, 68, 46, 54);
          ctx.bezierCurveTo(44, 60, 36, 60, 34, 54); ctx.bezierCurveTo(32, 64, 24, 62, 22, 52);
          ctx.bezierCurveTo(20, 56, 14, 56, 14, 50); ctx.closePath();
        });
        shape(ctx, c.fill, () => rrPath(ctx, 41, 30, 18, 11, 2));
        ctx.save(); ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(41, 36); ctx.lineTo(59, 36); ctx.stroke(); ctx.restore();
      },
    },
    {
      id: 'donut', name: 'Donut', draw(ctx, c, lw) {
        shape(ctx, c.brown, () => ctx.arc(50, 52, 36, 0, TAU));
        ctx.save(); ctx.beginPath(); ctx.arc(50, 52, 36, 0, TAU); ctx.clip();
        shape(ctx, c.accent, () => {
          ctx.moveTo(10, 50); ctx.bezierCurveTo(10, 20, 90, 20, 90, 50);
          ctx.bezierCurveTo(90, 60, 82, 62, 80, 54); ctx.bezierCurveTo(78, 64, 70, 66, 68, 56);
          ctx.bezierCurveTo(64, 68, 54, 68, 52, 58); ctx.bezierCurveTo(48, 66, 40, 66, 38, 56);
          ctx.bezierCurveTo(34, 68, 24, 66, 22, 56); ctx.bezierCurveTo(20, 62, 10, 60, 10, 50); ctx.closePath();
        });
        ctx.restore();
        hole(ctx, () => ctx.arc(50, 52, 11, 0, TAU));
        sprinkles(ctx, c, [[30, 40, 0.5], [46, 32, -0.5], [64, 36, 1.1], [74, 48, 2.2], [28, 54, 1.6]], lw);
      },
    },
    {
      id: 'cinnamon', name: 'Cinnamon sticks', draw(ctx, c, lw) {
        for (const a of [-0.55, 0.55]) {
          ctx.save(); ctx.translate(50, 52); ctx.rotate(a);
          shape(ctx, c.brown, () => rrPath(ctx, -38, -8, 76, 16, 8));
          ctx.lineWidth = lw * 0.55; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.bezierCurveTo(-20, -6, -10, 6, 0, 0); ctx.bezierCurveTo(10, -6, 20, 6, 30, 0); ctx.stroke();
          ctx.restore();
        }
        shape(ctx, c.accent, () => heartPath(ctx, 50, 24, 6));
      },
    },
    {
      id: 'softserve', name: 'Soft serve', face: [50, 41, 6], faceDefault: false, draw(ctx, c, lw, text, faceOn) {
        const cone = () => { ctx.moveTo(30, 54); ctx.lineTo(70, 54); ctx.lineTo(50, 94); ctx.closePath(); };
        shape(ctx, c.warm, cone);
        ctx.save(); ctx.beginPath(); cone(); ctx.clip(); ctx.lineWidth = lw * 0.5;
        for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(20 + i * 12, 40); ctx.lineTo(60 + i * 12, 100); ctx.moveTo(80 - i * 12, 40); ctx.lineTo(40 - i * 12, 100); ctx.stroke(); }
        ctx.restore(); ctx.beginPath(); cone(); ctx.stroke();
        shape(ctx, c.fill, () => ctx.ellipse(50, 50, 24, 11, 0, 0, TAU));
        shape(ctx, c.fill, () => ctx.ellipse(50, 38, 19, 10, 0, 0, TAU));
        shape(ctx, c.fill, () => ctx.ellipse(50, 27, 13, 9, 0, 0, TAU));
        shape(ctx, c.fill, () => { ctx.moveTo(42, 22); ctx.quadraticCurveTo(50, 4, 58, 22); ctx.closePath(); });
        shape(ctx, c.accent, () => ctx.arc(50, 13, 4.5, 0, TAU));
        if (!faceOn) { blush(ctx, 36, 46); blush(ctx, 64, 46); }
      },
    },
    {
      id: 'cookie', name: 'Cookie', face: [46, 54, 8], faceDefault: true, draw(ctx, c, lw, text, faceOn) {
        const cookie = () => ctx.arc(48, 54, 36, 0, TAU);
        shape(ctx, c.warm, cookie);
        ctx.fillStyle = c.brown;
        const chips = faceOn ? [[34, 40, 4.5], [56, 36, 4], [64, 66, 4.5], [30, 68, 4]] : [[34, 44, 4.5], [54, 38, 4], [62, 60, 4.5], [38, 68, 4], [50, 56, 3.5]];
        for (const [x, y, r] of chips) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0.4, 0, TAU); ctx.fill(); }
        // a bite: erase, then outline only the part of the bite inside the cookie
        ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(80, 30, 13, 0, TAU); ctx.fill(); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.arc(48, 54, 36 + ctx.lineWidth / 2, 0, TAU); ctx.clip(); ctx.beginPath(); ctx.arc(80, 30, 13, 0, TAU); ctx.stroke(); ctx.restore();
      },
    },
    {
      id: 'milk', name: 'Milk carton', face: [50, 54, 7], faceDefault: false, draw(ctx, c, lw, text, faceOn) {
        shape(ctx, c.fill, () => { ctx.moveTo(26, 36); ctx.lineTo(74, 36); ctx.lineTo(74, 86); ctx.arcTo(74, 90, 70, 90, 4); ctx.lineTo(30, 90); ctx.arcTo(26, 90, 26, 86, 4); ctx.closePath(); });
        shape(ctx, c.extra, () => { ctx.moveTo(26, 36); ctx.lineTo(36, 14); ctx.lineTo(64, 14); ctx.lineTo(74, 36); ctx.closePath(); });
        ctx.save(); ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(50, 14); ctx.lineTo(50, 36); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(26, 36, 48, 54); ctx.clip(); ctx.fillStyle = c.extra; ctx.fillRect(26, 70, 48, 8); ctx.restore();
        ctx.beginPath(); ctx.moveTo(26, 70); ctx.lineTo(74, 70); ctx.moveTo(26, 78); ctx.lineTo(74, 78); ctx.save(); ctx.lineWidth = lw * 0.5; ctx.stroke(); ctx.restore();
        if (!faceOn) shape(ctx, c.accent, () => heartPath(ctx, 50, 54, 10));
      },
    },
    {
      id: 'candy', name: 'Candy', face: [50, 50, 7], faceDefault: false, draw(ctx, c, lw, text, faceOn) {
        shape(ctx, c.accent, () => { ctx.moveTo(32, 50); ctx.lineTo(12, 34); ctx.quadraticCurveTo(16, 50, 12, 66); ctx.closePath(); });
        shape(ctx, c.accent, () => { ctx.moveTo(68, 50); ctx.lineTo(88, 34); ctx.quadraticCurveTo(84, 50, 88, 66); ctx.closePath(); });
        shape(ctx, c.accent, () => ctx.arc(50, 50, 22, 0, TAU));
        if (!faceOn) {
          ctx.save(); ctx.beginPath(); ctx.arc(50, 50, 22, 0, TAU); ctx.clip();
          ctx.fillStyle = c.fill; ctx.lineWidth = lw * 0.6;
          for (const dx of [-16, 0, 16]) { ctx.beginPath(); ctx.moveTo(50 + dx - 6, 20); ctx.lineTo(50 + dx + 6, 20); ctx.lineTo(50 + dx + 14, 80); ctx.lineTo(50 + dx + 2, 80); ctx.closePath(); ctx.fill(); }
          ctx.restore();
          ctx.beginPath(); ctx.arc(50, 50, 22, 0, TAU); ctx.stroke();
        }
        shine(ctx, 40, 40, 5, 3, -0.6);
      },
    },
    {
      id: 'strawberry', name: 'Strawberry', face: [50, 60, 9], faceDefault: false, draw(ctx, c, lw, text, faceOn) {
        shape(ctx, c.accent, () => { ctx.moveTo(50, 92); ctx.bezierCurveTo(22, 76, 12, 54, 20, 40); ctx.bezierCurveTo(30, 24, 70, 24, 80, 40); ctx.bezierCurveTo(88, 54, 78, 76, 50, 92); ctx.closePath(); });
        ctx.fillStyle = c.fill;
        const seeds = faceOn ? [[30, 48], [70, 48], [38, 78], [62, 78]] : [[38, 52], [56, 48], [46, 66], [63, 62], [34, 68], [52, 80]];
        for (const [x, y] of seeds) { ctx.beginPath(); ctx.ellipse(x, y, 2.4, 3.4, 0, 0, TAU); ctx.fill(); }
        blob(ctx, c.mint, lw, [
          () => ctx.ellipse(37, 31, 14, 6, -0.45, 0, TAU),
          () => ctx.ellipse(63, 31, 14, 6, 0.45, 0, TAU),
          () => ctx.ellipse(50, 28, 6, 11, 0, 0, TAU),
        ]);
        ctx.beginPath(); ctx.moveTo(50, 22); ctx.lineTo(50, 10); ctx.stroke();
        shine(ctx, 33, 46, 3.6, 6, 0.35);
      },
    },
    {
      id: 'cherry', name: 'Cherries', draw(ctx, c) {
        ctx.beginPath(); ctx.moveTo(38, 60); ctx.quadraticCurveTo(40, 30, 58, 14); ctx.moveTo(66, 62); ctx.quadraticCurveTo(62, 34, 58, 14); ctx.stroke();
        shape(ctx, c.mint, () => ctx.ellipse(69, 20, 13, 6, -0.5, 0, TAU));
        shape(ctx, c.accent, () => ctx.arc(36, 71, 16, 0, TAU));
        shape(ctx, c.accent, () => ctx.arc(66, 75, 16, 0, TAU));
        shine(ctx, 30, 64, 4, 3, -0.5); shine(ctx, 60, 68, 4, 3, -0.5);
      },
    },

    /* ---- sky ---- */
    {
      id: 'cloud', name: 'Cloud', face: [50, 56, 10], faceDefault: false, draw(ctx, c, lw) {
        blob(ctx, c.extra, lw, cloudParts(ctx, 0, 0, 100, 100));
        shine(ctx, 59, 34, 5, 3, -0.5); shine(ctx, 68, 41, 2.4, 2.4);
      },
    },
    {
      id: 'cloudface', name: 'Sleepy cloud', face: [50, 56, 10, true], faceDefault: true, draw(ctx, c, lw) {
        blob(ctx, c.fill, lw, cloudParts(ctx, 0, 0, 100, 100));
      },
    },
    {
      id: 'rainbow', name: 'Rainbow', draw(ctx, c, lw) {
        const cx = 50, cy = 74;
        const band = (r0, r1, col) => shape(ctx, col, () => { ctx.arc(cx, cy, r1, Math.PI, 0); ctx.arc(cx, cy, r0, 0, Math.PI, true); ctx.closePath(); });
        band(30, 42, c.accent); band(18, 30, c.warm); band(6, 18, c.extra);
        for (const x of [16, 84]) {
          blob(ctx, c.fill, lw, [
            () => ctx.arc(x - 6, 76, 7, 0, TAU),
            () => ctx.arc(x + 2, 71, 9.5, 0, TAU),
            () => ctx.arc(x + 9, 77, 6.5, 0, TAU),
            () => rrPath(ctx, x - 12, 76, 27, 8, 4),
          ]);
        }
      },
    },
    {
      id: 'star', name: 'Star', face: [50, 56, 8], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.warm, () => starPath(ctx, 50, 54, 42, 20));
      },
    },
    {
      id: 'sparkle', name: 'Sparkle', line: true, draw(ctx, c) {
        shape(ctx, c.fill, () => sparklePath(ctx, 50, 50, 42));
      },
    },
    {
      id: 'sparkles', name: 'Sparkles', draw(ctx, c) {
        shape(ctx, c.warm, () => sparklePath(ctx, 40, 56, 34));
        shape(ctx, c.fill, () => sparklePath(ctx, 77, 25, 16));
        shape(ctx, c.fill, () => sparklePath(ctx, 82, 66, 10));
      },
    },
    {
      id: 'moon', name: 'Moon', face: [30, 58, 6, true], faceDefault: true, draw(ctx, c, lw) {
        const outer = () => ctx.arc(46, 52, 38, 0, TAU), inner = () => ctx.arc(64, 42, 30, 0, TAU);
        ctx.fillStyle = c.warm; ctx.beginPath(); outer(); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); inner(); ctx.fill(); ctx.restore();
        ctx.save(); ctx.beginPath(); outer(); ctx.clip(); ctx.beginPath(); inner(); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(-10, -10, 120, 120); inner(); ctx.clip('evenodd'); ctx.beginPath(); outer(); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.lineWidth = lw * 0.6; shape(ctx, c.fill, () => sparklePath(ctx, 82, 74, 8)); ctx.restore();
      },
    },
    {
      id: 'raindrop', name: 'Raindrop', face: [50, 62, 8], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.extra, () => { ctx.moveTo(50, 8); ctx.bezierCurveTo(52, 28, 82, 42, 82, 62); ctx.arc(50, 62, 32, 0, Math.PI); ctx.bezierCurveTo(18, 42, 48, 28, 50, 8); ctx.closePath(); });
        shine(ctx, 34, 52, 3.5, 7, 0.3);
      },
    },
    {
      id: 'umbrella', name: 'Umbrella', draw(ctx, c, lw) {
        const canopy = () => { ctx.moveTo(10, 52); ctx.arc(50, 52, 40, Math.PI, 0); for (let i = 0; i < 4; i++) ctx.arc(80 - i * 20, 52, 10, 0, Math.PI); ctx.closePath(); };
        shape(ctx, c.accent, canopy);
        ctx.save(); ctx.beginPath(); canopy(); ctx.clip(); ctx.fillStyle = c.fill;
        for (const x of [30, 70]) { ctx.beginPath(); ctx.moveTo(50, 12); ctx.quadraticCurveTo(x, 30, x, 62); ctx.lineTo(x - 10 * Math.sign(x - 50), 62); ctx.quadraticCurveTo(x - 6 * Math.sign(x - 50), 30, 50, 12); ctx.closePath(); ctx.fill(); }
        ctx.restore(); ctx.beginPath(); canopy(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(50, 8); ctx.lineTo(50, 12); ctx.stroke();
        ctx.save(); ctx.lineWidth = lw * 1.2; ctx.beginPath(); ctx.moveTo(50, 60); ctx.lineTo(50, 84); ctx.arc(58, 84, 8, Math.PI, 0, true); ctx.stroke(); ctx.restore();
      },
    },
    {
      id: 'balloon', name: 'Balloon', face: [50, 46, 8], faceDefault: false, draw(ctx, c, lw) {
        ctx.save(); ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(50, 78); ctx.bezierCurveTo(40, 86, 60, 90, 48, 98); ctx.stroke(); ctx.restore();
        shape(ctx, c.accent, () => { ctx.moveTo(50, 70); ctx.lineTo(44, 80); ctx.lineTo(56, 80); ctx.closePath(); });
        shape(ctx, c.accent, () => ctx.ellipse(50, 42, 27, 32, 0, 0, TAU));
        shine(ctx, 38, 28, 5, 9, 0.35);
      },
    },

    /* ---- cute ---- */
    {
      id: 'heart', name: 'Heart', face: [50, 48, 9], faceDefault: false, draw(ctx, c) {
        shape(ctx, c.accent, () => heartPath(ctx, 50, 52, 40));
        shine(ctx, 31, 34, 6, 3.6, -0.7);
      },
    },
    {
      id: 'bow', name: 'Bow', draw(ctx, c) {
        shape(ctx, c.extra, () => { ctx.moveTo(46, 56); ctx.lineTo(30, 88); ctx.lineTo(44, 84); ctx.lineTo(50, 66); ctx.closePath(); });
        shape(ctx, c.extra, () => { ctx.moveTo(54, 56); ctx.lineTo(70, 88); ctx.lineTo(56, 84); ctx.lineTo(50, 66); ctx.closePath(); });
        shape(ctx, c.extra, () => { ctx.moveTo(48, 50); ctx.bezierCurveTo(30, 14, 4, 22, 10, 46); ctx.bezierCurveTo(14, 62, 36, 60, 48, 50); ctx.closePath(); });
        shape(ctx, c.extra, () => { ctx.moveTo(52, 50); ctx.bezierCurveTo(70, 14, 96, 22, 90, 46); ctx.bezierCurveTo(86, 62, 64, 60, 52, 50); ctx.closePath(); });
        shape(ctx, c.extra, () => rrPath(ctx, 41, 41, 18, 18, 6));
        shine(ctx, 24, 35, 5, 3, -0.5); shine(ctx, 76, 35, 5, 3, 0.5);
      },
    },
    {
      id: 'flower', name: 'Flower', face: [50, 52, 5.5], faceDefault: true, draw(ctx, c, lw) {
        const petals = [];
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; petals.push(() => ctx.arc(50 + Math.cos(a) * 25, 52 + Math.sin(a) * 25, 17, 0, TAU)); }
        blob(ctx, c.accent, lw, petals);
        shape(ctx, c.warm, () => ctx.arc(50, 52, 15, 0, TAU));
      },
    },
    {
      id: 'crown', name: 'Crown', draw(ctx, c, lw) {
        shape(ctx, c.warm, () => { ctx.moveTo(14, 78); ctx.lineTo(12, 36); ctx.lineTo(33, 54); ctx.lineTo(50, 22); ctx.lineTo(67, 54); ctx.lineTo(88, 36); ctx.lineTo(86, 78); ctx.closePath(); });
        ctx.save(); ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(15, 66); ctx.lineTo(85, 66); ctx.stroke(); ctx.restore();
        shape(ctx, c.accent, () => ctx.arc(50, 22, 6.5, 0, TAU));
        shape(ctx, c.extra, () => ctx.arc(12, 36, 5.5, 0, TAU));
        shape(ctx, c.extra, () => ctx.arc(88, 36, 5.5, 0, TAU));
        shape(ctx, c.accent, () => heartPath(ctx, 50, 72, 5));
      },
    },
    {
      id: 'paw', name: 'Paw print', draw(ctx, c) {
        shape(ctx, c.extra, () => ctx.ellipse(50, 66, 21, 17, 0, 0, TAU));
        for (const [x, y] of [[26, 46], [42, 32], [58, 32], [74, 46]]) shape(ctx, c.extra, () => ctx.arc(x, y, 9.5, 0, TAU));
        shine(ctx, 40, 58, 5, 3, -0.4);
      },
    },
    {
      id: 'ghost', name: 'Ghost', face: [50, 52, 9], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.fill, () => {
          ctx.moveTo(18, 52); ctx.arc(50, 52, 32, Math.PI, 0);
          ctx.lineTo(82, 84); ctx.quadraticCurveTo(74, 76, 66, 86); ctx.quadraticCurveTo(58, 76, 50, 86);
          ctx.quadraticCurveTo(42, 76, 34, 86); ctx.quadraticCurveTo(26, 76, 18, 84); ctx.closePath();
        });
      },
    },
    {
      id: 'letter', name: 'Love letter', draw(ctx, c, lw) {
        shape(ctx, c.fill, () => rrPath(ctx, 10, 28, 80, 52, 6));
        ctx.save(); ctx.lineWidth = lw * 0.85; ctx.beginPath(); ctx.moveTo(11, 33); ctx.lineTo(50, 62); ctx.lineTo(89, 33); ctx.stroke(); ctx.restore();
        shape(ctx, c.accent, () => heartPath(ctx, 50, 63, 9));
      },
    },
    {
      id: 'note', name: 'Music note', line: true, draw(ctx, c, lw) {
        ctx.fillStyle = c.outline;
        ctx.beginPath(); ctx.ellipse(37, 75, 15, 10.5, -0.35, 0, TAU); ctx.fill();
        ctx.lineWidth = lw * 1.3; ctx.beginPath(); ctx.moveTo(50.5, 71); ctx.lineTo(50.5, 17); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(50, 17); ctx.quadraticCurveTo(82, 28, 70, 56); ctx.quadraticCurveTo(75, 35, 50, 30); ctx.closePath(); ctx.fill();
        ctx.lineWidth = lw * 0.5; ctx.stroke();
      },
    },
    {
      id: 'notes', name: 'Two notes', line: true, draw(ctx, c, lw) {
        ctx.fillStyle = c.outline;
        ctx.beginPath(); ctx.ellipse(28, 78, 13, 9, -0.3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(66, 70, 13, 9, -0.3, 0, TAU); ctx.fill();
        ctx.lineWidth = lw * 1.2;
        ctx.beginPath(); ctx.moveTo(40, 75); ctx.lineTo(40, 24); ctx.moveTo(78, 67); ctx.lineTo(78, 16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(40, 22); ctx.lineTo(78, 14); ctx.lineTo(78, 27); ctx.lineTo(40, 35); ctx.closePath(); ctx.fill();
      },
    },

    /* ---- more café treats ---- */
    {
      id: 'boba', name: 'Bubble tea', face: [50, 49, 8], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.accent, () => rrPath(ctx, 55, 8, 9, 37, 3));
        shape(ctx, c.brown, () => { ctx.moveTo(24, 31); ctx.lineTo(76, 31); ctx.lineTo(70, 86); ctx.quadraticCurveTo(50, 94, 30, 86); ctx.closePath(); });
        shape(ctx, c.fill, () => rrPath(ctx, 20, 27, 60, 10, 4));
        ctx.fillStyle = c.outline;
        for (const [x, y] of [[39, 73], [53, 76], [63, 68], [45, 84], [60, 85]]) dot(ctx, x, y, 3.5);
        shine(ctx, 33, 50, 2, 8);
      },
    },
    {
      id: 'toast', name: 'Butter toast', face: [50, 66, 9], faceDefault: true, draw(ctx, c) {
        const bread = () => { ctx.moveTo(22, 45); ctx.bezierCurveTo(3, 20, 30, 10, 50, 17); ctx.bezierCurveTo(70, 10, 97, 20, 78, 45); ctx.lineTo(78, 82); ctx.quadraticCurveTo(50, 89, 22, 82); ctx.closePath(); };
        shape(ctx, c.brown, bread);
        ctx.save(); ctx.translate(8, 8); ctx.scale(0.84, 0.84); shape(ctx, c.warm, bread); ctx.restore();
        shape(ctx, c.fill, () => rrPath(ctx, 37, 33, 26, 18, 5));
        shine(ctx, 44, 38, 5, 2);
      },
    },
    {
      id: 'pudding', name: 'Caramel pudding', face: [50, 61, 9], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.fill, () => ctx.ellipse(50, 82, 40, 9, 0, 0, TAU));
        shape(ctx, c.warm, () => { ctx.moveTo(29, 33); ctx.lineTo(71, 33); ctx.lineTo(80, 76); ctx.bezierCurveTo(70, 89, 30, 89, 20, 76); ctx.closePath(); });
        shape(ctx, c.brown, () => ctx.ellipse(50, 34, 22, 8, 0, 0, TAU));
        shape(ctx, c.fill, () => ctx.ellipse(50, 26, 10, 7, 0, 0, TAU));
        shape(ctx, c.accent, () => ctx.arc(52, 16, 5, 0, TAU));
      },
    },
    {
      id: 'peach', name: 'Peach', face: [50, 62, 8], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.mint, () => { ctx.moveTo(49, 28); ctx.quadraticCurveTo(49, 6, 76, 12); ctx.quadraticCurveTo(69, 31, 49, 28); });
        shape(ctx, c.accent, () => { ctx.moveTo(50, 31); ctx.bezierCurveTo(12, 12, 0, 65, 32, 81); ctx.quadraticCurveTo(50, 95, 68, 81); ctx.bezierCurveTo(100, 65, 88, 12, 50, 31); ctx.closePath(); });
        shape(ctx, null, () => { ctx.moveTo(50, 32); ctx.quadraticCurveTo(41, 40, 44, 46); });
        shine(ctx, 26, 42, 4, 7, 0.4);
      },
    },
    /* ---- space ---- */
    {
      id: 'planet', name: 'Ringed planet', face: [50, 42, 7], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.extra, () => ctx.arc(50, 50, 28, 0, TAU));
        shape(ctx, c.accent, () => { ctx.moveTo(23, 45); ctx.bezierCurveTo(-13, 74, 27, 91, 74, 61); ctx.bezierCurveTo(97, 45, 97, 32, 77, 33); ctx.lineTo(79, 40); ctx.bezierCurveTo(96, 44, 37, 78, 17, 67); ctx.quadraticCurveTo(12, 62, 24, 54); ctx.closePath(); });
        shine(ctx, 39, 30, 5, 2, -0.5);
      },
    },
    {
      id: 'ufo', name: 'Flying saucer', face: [50, 40, 7], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.mint, () => { ctx.moveTo(28, 55); ctx.lineTo(28, 42); ctx.arc(50, 42, 22, Math.PI, 0); ctx.lineTo(72, 55); ctx.closePath(); });
        shape(ctx, c.extra, () => ctx.ellipse(50, 62, 40, 15, 0, 0, TAU));
        for (const x of [26, 50, 74]) shape(ctx, c.warm, () => ctx.arc(x, 64, 4, 0, TAU));
        shine(ctx, 36, 30, 3, 5, 0.4);
      },
    },
    /* ---- animals ---- */
    {
      id: 'bunny', name: 'Bunny', face: [50, 62, 10], faceDefault: true, draw(ctx, c, lw) {
        blob(ctx, c.fill, lw, [() => ctx.ellipse(33, 33, 11, 20, -0.15, 0, TAU), () => ctx.ellipse(67, 33, 11, 20, 0.15, 0, TAU), () => ctx.ellipse(50, 63, 33, 26, 0, 0, TAU)]);
        ctx.fillStyle = c.accent;
        for (const x of [33, 67]) { ctx.beginPath(); ctx.ellipse(x, 29, 4, 11, 0, 0, TAU); ctx.fill(); }
      },
    },
    {
      id: 'cat', name: 'Kitten', face: [50, 59, 10], faceDefault: true, draw(ctx, c, lw) {
        shape(ctx, c.warm, () => { ctx.moveTo(18, 49); ctx.lineTo(19, 17); ctx.lineTo(39, 35); ctx.quadraticCurveTo(50, 31, 61, 35); ctx.lineTo(81, 17); ctx.lineTo(82, 49); ctx.bezierCurveTo(101, 98, -1, 98, 18, 49); ctx.closePath(); });
        for (const x of [22, 66]) shape(ctx, c.accent, () => { ctx.moveTo(x, 27); ctx.lineTo(x + 10, 37); ctx.lineTo(x + 2, 40); ctx.closePath(); });
        ctx.lineWidth = lw * 0.55;
        for (const side of [-1, 1]) shape(ctx, null, () => { ctx.moveTo(50 + side * 24, 61); ctx.lineTo(50 + side * 35, 58); ctx.moveTo(50 + side * 24, 67); ctx.lineTo(50 + side * 35, 69); });
      },
    },
    {
      id: 'bear', name: 'Teddy bear', face: [50, 54, 10], faceDefault: true, draw(ctx, c, lw) {
        blob(ctx, c.brown, lw, [() => ctx.arc(25, 29, 14, 0, TAU), () => ctx.arc(75, 29, 14, 0, TAU), () => ctx.ellipse(50, 57, 34, 31, 0, 0, TAU)]);
        ctx.fillStyle = c.accent; dot(ctx, 25, 27, 7); dot(ctx, 75, 27, 7);
        ctx.fillStyle = c.warm; ctx.beginPath(); ctx.ellipse(50, 62, 17, 13, 0, 0, TAU); ctx.fill();
      },
    },
    {
      id: 'frog', name: 'Frog', face: [50, 53, 17], faceDefault: true, draw(ctx, c, lw) {
        blob(ctx, c.mint, lw, [() => ctx.arc(30, 34, 15, 0, TAU), () => ctx.arc(70, 34, 15, 0, TAU), () => ctx.ellipse(50, 60, 38, 27, 0, 0, TAU)]);
        shine(ctx, 23, 29, 4, 2, -0.5);
      },
    },
    {
      id: 'chick', name: 'Baby chick', face: [50, 45, 9], faceDefault: true, draw(ctx, c) {
        for (const x of [36, 64]) shape(ctx, c.brown, () => rrPath(ctx, x - 7, 80, 14, 7, 3));
        shape(ctx, c.warm, () => ctx.ellipse(50, 53, 31, 32, 0, 0, TAU));
        shape(ctx, c.warm, () => { ctx.moveTo(21, 48); ctx.quadraticCurveTo(4, 57, 20, 66); });
        shape(ctx, c.warm, () => { ctx.moveTo(79, 48); ctx.quadraticCurveTo(96, 57, 80, 66); });
        shape(ctx, c.brown, () => { ctx.moveTo(45, 58); ctx.lineTo(55, 58); ctx.lineTo(50, 64); ctx.closePath(); });
        shape(ctx, null, () => { ctx.moveTo(48, 21); ctx.quadraticCurveTo(39, 9, 47, 10); ctx.moveTo(49, 21); ctx.quadraticCurveTo(59, 8, 60, 16); });
      },
    },
    {
      id: 'whale', name: 'Little whale', face: [40, 59, 8], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.extra, () => { ctx.moveTo(70, 57); ctx.quadraticCurveTo(82, 64, 80, 41); ctx.quadraticCurveTo(91, 40, 92, 28); ctx.quadraticCurveTo(76, 25, 75, 37); ctx.quadraticCurveTo(64, 29, 60, 39); ctx.bezierCurveTo(8, 16, -6, 80, 38, 84); ctx.quadraticCurveTo(70, 88, 70, 57); ctx.closePath(); });
        shape(ctx, c.fill, () => { ctx.moveTo(29, 74); ctx.quadraticCurveTo(47, 87, 63, 74); ctx.quadraticCurveTo(48, 80, 29, 74); });
        shape(ctx, null, () => { ctx.moveTo(36, 29); ctx.lineTo(36, 17); ctx.quadraticCurveTo(25, 9, 24, 19); ctx.moveTo(36, 17); ctx.quadraticCurveTo(48, 8, 49, 18); });
      },
    },
    /* ---- garden ---- */
    {
      id: 'tulip', name: 'Tulip', draw(ctx, c) {
        shape(ctx, null, () => { ctx.moveTo(50, 49); ctx.lineTo(50, 91); });
        for (const side of [-1, 1]) shape(ctx, c.mint, () => { ctx.moveTo(50, 80); ctx.quadraticCurveTo(50 + side * 29, 80, 50 + side * 28, 57); ctx.quadraticCurveTo(50 + side * 5, 60, 50, 80); });
        shape(ctx, c.accent, () => { ctx.moveTo(25, 20); ctx.lineTo(39, 30); ctx.lineTo(50, 12); ctx.lineTo(61, 30); ctx.lineTo(75, 20); ctx.bezierCurveTo(82, 71, 18, 71, 25, 20); ctx.closePath(); });
        shine(ctx, 35, 39, 3, 7, -0.2);
      },
    },
    {
      id: 'sprout', name: 'Sprout', draw(ctx, c) {
        shape(ctx, c.brown, () => ctx.ellipse(50, 85, 29, 7, 0, 0, TAU));
        shape(ctx, null, () => { ctx.moveTo(50, 83); ctx.quadraticCurveTo(46, 57, 52, 37); });
        shape(ctx, c.mint, () => { ctx.moveTo(49, 60); ctx.bezierCurveTo(13, 61, 13, 38, 16, 30); ctx.quadraticCurveTo(49, 28, 49, 60); });
        shape(ctx, c.mint, () => { ctx.moveTo(50, 43); ctx.bezierCurveTo(48, 12, 80, 10, 85, 18); ctx.quadraticCurveTo(84, 45, 50, 43); });
      },
    },
    {
      id: 'mushroom', name: 'Mushroom', face: [50, 72, 7], faceDefault: true, draw(ctx, c) {
        shape(ctx, c.warm, () => { ctx.moveTo(37, 50); ctx.lineTo(63, 50); ctx.lineTo(68, 85); ctx.quadraticCurveTo(50, 94, 32, 85); ctx.closePath(); });
        shape(ctx, c.accent, () => { ctx.moveTo(12, 56); ctx.bezierCurveTo(13, 4, 87, 4, 88, 56); ctx.quadraticCurveTo(50, 67, 12, 56); ctx.closePath(); });
        ctx.fillStyle = c.fill; for (const [x, y, r] of [[32, 39, 7], [54, 27, 6], [69, 46, 8]]) dot(ctx, x, y, r);
      },
    },
    {
      id: 'cactus', name: 'Potted cactus', face: [50, 43, 7], faceDefault: true, draw(ctx, c, lw) {
        blob(ctx, c.mint, lw, [() => rrPath(ctx, 37, 17, 26, 58, 13), () => rrPath(ctx, 20, 36, 22, 23, 9), () => rrPath(ctx, 59, 31, 22, 23, 9)]);
        shape(ctx, c.brown, () => { ctx.moveTo(29, 69); ctx.lineTo(71, 69); ctx.lineTo(65, 90); ctx.lineTo(35, 90); ctx.closePath(); });
        shape(ctx, c.warm, () => rrPath(ctx, 25, 63, 50, 10, 3));
        shape(ctx, c.accent, () => heartPath(ctx, 59, 20, 9));
      },
    },
    {
      id: 'butterfly', name: 'Butterfly', draw(ctx, c) {
        for (const side of [-1, 1]) {
          shape(ctx, c.accent, () => ctx.ellipse(50 + side * 22, 37, 20, 24, side * 0.4, 0, TAU));
          shape(ctx, c.extra, () => ctx.ellipse(50 + side * 18, 69, 16, 18, side * -0.5, 0, TAU));
          shine(ctx, 50 + side * 25, 31, 5, 8, side * 0.4);
        }
        shape(ctx, c.brown, () => rrPath(ctx, 45, 33, 10, 46, 5));
        shape(ctx, null, () => { ctx.moveTo(47, 35); ctx.quadraticCurveTo(47, 22, 39, 21); ctx.moveTo(53, 35); ctx.quadraticCurveTo(53, 22, 61, 21); });
      },
    },
    {
      id: 'clover', name: 'Lucky clover', draw(ctx, c) {
        shape(ctx, null, () => { ctx.moveTo(50, 49); ctx.quadraticCurveTo(50, 79, 68, 91); });
        for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(50, 47); ctx.rotate(i * TAU / 4); shape(ctx, c.mint, () => heartPath(ctx, 0, -17, 19)); ctx.restore(); }
        shape(ctx, c.warm, () => ctx.arc(50, 47, 5, 0, TAU));
      },
    },
    /* ---- everyday treasures ---- */
    {
      id: 'camera', name: 'Retro camera', draw(ctx, c) {
        shape(ctx, c.accent, () => rrPath(ctx, 22, 20, 22, 15, 4));
        shape(ctx, c.extra, () => rrPath(ctx, 10, 31, 80, 51, 9));
        shape(ctx, c.fill, () => rrPath(ctx, 68, 39, 12, 8, 2));
        shape(ctx, c.accent, () => ctx.arc(45, 57, 21, 0, TAU));
        shape(ctx, c.outline, () => ctx.arc(45, 57, 13, 0, TAU));
        shine(ctx, 41, 52, 4, 5, 0.5);
      },
    },
    {
      id: 'headphones', name: 'Headphones', draw(ctx, c) {
        shape(ctx, c.extra, () => { ctx.moveTo(14, 61); ctx.lineTo(14, 46); ctx.arc(50, 46, 36, Math.PI, 0); ctx.lineTo(86, 61); ctx.lineTo(75, 61); ctx.lineTo(75, 46); ctx.arc(50, 46, 25, 0, Math.PI, true); ctx.lineTo(25, 61); ctx.closePath(); });
        for (const x of [13, 69]) shape(ctx, c.accent, () => rrPath(ctx, x, 49, 18, 35, 8));
        shine(ctx, 19, 61, 2, 6);
      },
    },
    {
      id: 'gamepad', name: 'Game controller', draw(ctx, c) {
        shape(ctx, c.extra, () => { ctx.moveTo(28, 29); ctx.quadraticCurveTo(50, 36, 72, 29); ctx.bezierCurveTo(86, 25, 100, 78, 85, 82); ctx.quadraticCurveTo(76, 86, 64, 67); ctx.lineTo(36, 67); ctx.quadraticCurveTo(24, 86, 15, 82); ctx.bezierCurveTo(0, 78, 14, 25, 28, 29); ctx.closePath(); });
        shape(ctx, c.fill, () => { ctx.moveTo(25, 41); ctx.lineTo(33, 41); ctx.lineTo(33, 48); ctx.lineTo(40, 48); ctx.lineTo(40, 56); ctx.lineTo(33, 56); ctx.lineTo(33, 63); ctx.lineTo(25, 63); ctx.lineTo(25, 56); ctx.lineTo(18, 56); ctx.lineTo(18, 48); ctx.lineTo(25, 48); ctx.closePath(); });
        shape(ctx, c.accent, () => ctx.arc(72, 45, 5, 0, TAU));
        shape(ctx, c.warm, () => ctx.arc(63, 57, 5, 0, TAU));
      },
    },
    {
      id: 'book', name: 'Open book', draw(ctx, c, lw) {
        for (const side of [-1, 1]) shape(ctx, c.fill, () => { ctx.moveTo(50, 29); ctx.quadraticCurveTo(50 + side * 20, 17, 50 + side * 39, 24); ctx.lineTo(50 + side * 39, 78); ctx.quadraticCurveTo(50 + side * 20, 71, 50, 84); ctx.closePath(); });
        shape(ctx, c.accent, () => { ctx.moveTo(63, 24); ctx.lineTo(63, 50); ctx.lineTo(69, 45); ctx.lineTo(75, 48); ctx.lineTo(75, 22); ctx.closePath(); });
        ctx.lineWidth = lw * 0.55;
        for (const y of [42, 53, 64]) shape(ctx, null, () => { ctx.moveTo(20, y); ctx.quadraticCurveTo(31, y - 1, 40, y + 3); });
      },
    },
    {
      id: 'gift', name: 'Gift box', draw(ctx, c) {
        for (const side of [-1, 1]) shape(ctx, c.accent, () => { ctx.moveTo(50, 33); ctx.bezierCurveTo(50 + side * 48, 35, 50 + side * 21, -1, 50, 33); ctx.closePath(); });
        shape(ctx, c.extra, () => rrPath(ctx, 20, 42, 60, 46, 5));
        shape(ctx, c.extra, () => rrPath(ctx, 15, 33, 70, 16, 4));
        shape(ctx, c.accent, () => rrPath(ctx, 43, 33, 14, 55, 2));
        shine(ctx, 28, 61, 3, 8);
      },
    },
    {
      id: 'pencil', name: 'Pencil', draw(ctx, c) {
        ctx.translate(50, 50); ctx.rotate(0.55); ctx.translate(-50, -50);
        shape(ctx, c.warm, () => rrPath(ctx, 39, 22, 22, 51, 2));
        shape(ctx, c.accent, () => rrPath(ctx, 39, 9, 22, 18, 5));
        shape(ctx, c.fill, () => rrPath(ctx, 39, 23, 22, 9, 1));
        shape(ctx, c.brown, () => { ctx.moveTo(39, 73); ctx.lineTo(61, 73); ctx.lineTo(50, 92); ctx.closePath(); });
        shape(ctx, c.outline, () => { ctx.moveTo(46, 85); ctx.lineTo(54, 85); ctx.lineTo(50, 92); ctx.closePath(); });
        shape(ctx, null, () => { ctx.moveTo(50, 36); ctx.lineTo(50, 66); });
      },
    },

    /* ---- with text ---- */
    {
      id: 'ticket', name: 'Ticket', text: 'ADMIT ONE', draw(ctx, c, lw, text) {
        const x0 = 5, x1 = 95, y0 = 29, y1 = 71, r = 6, nx = 31, nr = 6.5;
        const path = () => {
          ctx.moveTo(x0 + r, y0);
          ctx.lineTo(nx - nr, y0); ctx.arc(nx, y0, nr, Math.PI, 0, true);
          ctx.lineTo(x1 - r, y0); ctx.arcTo(x1, y0, x1, y1, r);
          ctx.lineTo(x1, y1 - r); ctx.arcTo(x1, y1, x0, y1, r);
          ctx.lineTo(nx + nr, y1); ctx.arc(nx, y1, nr, 0, Math.PI, true);
          ctx.lineTo(x0 + r, y1); ctx.arcTo(x0, y1, x0, y0, r);
          ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r);
          ctx.closePath();
        };
        shape(ctx, c.warm, path);
        ctx.save(); ctx.beginPath(); path(); ctx.clip(); ctx.fillStyle = c.accent; ctx.fillRect(0, 0, nx, 100); ctx.restore();
        ctx.beginPath(); path(); ctx.stroke();
        ctx.save(); ctx.setLineDash([2.2, 3]); ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.moveTo(nx, y0 + nr + 2.5); ctx.lineTo(nx, y1 - nr - 2.5); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.lineWidth = lw * 0.6; shape(ctx, c.fill, () => sparklePath(ctx, 18, 50, 7.5)); ctx.restore();
        fitText(ctx, text, (nx + x1) / 2 + 1.5, 50.5, x1 - nx - 12, 21, c.outline, 'marker', 700);
      },
    },
    {
      id: 'bubble', name: 'Speech bubble', text: 'hi!', draw(ctx, c, lw, text) {
        blob(ctx, c.fill, lw, [
          () => rrPath(ctx, 8, 14, 84, 56, 17),
          () => { ctx.moveTo(24, 62); ctx.lineTo(16, 90); ctx.lineTo(48, 62); ctx.closePath(); },
        ]);
        fitText(ctx, text, 50, 42.5, 68, 30, c.outline, 'marker', 400);
      },
    },
    {
      id: 'tag', name: 'Name tag', text: 'NAME', draw(ctx, c, lw, text) {
        const path = () => { ctx.moveTo(30, 28); ctx.lineTo(90, 28); ctx.arcTo(94, 28, 94, 32, 4); ctx.lineTo(94, 68); ctx.arcTo(94, 72, 90, 72, 4); ctx.lineTo(30, 72); ctx.lineTo(6, 50); ctx.closePath(); };
        shape(ctx, c.accent, path);
        shape(ctx, c.fill, () => ctx.arc(24, 50, 5, 0, TAU));
        ctx.save(); ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(19, 50); ctx.quadraticCurveTo(4, 52, 6, 36); ctx.stroke(); ctx.restore();
        fitText(ctx, text, 61, 50.5, 52, 22, c.outline, 'marker', 700);
      },
    },
    {
      id: 'sign', name: 'Café sign', text: 'CAFÉ', draw(ctx, c, lw, text) {
        shape(ctx, c.fill, () => rrPath(ctx, 10, 34, 80, 44, 8));
        const awning = () => { ctx.moveTo(6, 22); ctx.lineTo(94, 22); ctx.lineTo(94, 36); for (let i = 0; i < 5; i++) ctx.arc(85.2 - i * 17.6, 36, 8.8, 0, Math.PI); ctx.closePath(); };
        shape(ctx, c.extra, awning);
        ctx.save(); ctx.beginPath(); awning(); ctx.clip(); ctx.fillStyle = c.fill; for (let i = 0; i < 5; i += 2) ctx.fillRect(6 + i * 17.6, 20, 17.6, 30); ctx.restore();
        ctx.beginPath(); awning(); ctx.stroke();
        fitText(ctx, text, 50, 59, 62, 24, c.outline, 'marker', 700);
        shape(ctx, c.accent, () => heartPath(ctx, 84, 60, 4));
      },
    },
    /* ---- any emoji, or a short word (not in the tray groups; the tray has its own row for it) ---- */
    {
      id: 'emoji', name: 'Emoji', hidden: true, outlineFromAlpha: true, text: '🍓', draw(ctx, c, lw, text) {
        const str = (text || '🍓').trim() || '🍓';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (/\p{Extended_Pictographic}/u.test(str)) {
          const fam = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", sans-serif';
          let size = 70;
          for (let i = 0; i < 8; i++) { ctx.font = `${size.toFixed(1)}px ${fam}`; const w = ctx.measureText(str).width; if (w <= 82 || size < 10) break; size *= Math.max(0.6, 82 / w); }
          ctx.fillStyle = c.outline;   // only matters for monochrome fallback glyphs
          ctx.fillText(str, 50, 53);
        } else {
          fitText(ctx, str, 50, 51, 84, 62, c.accent, 'marker', 700);
        }
      },
    },
    {
      // Keep the face as text on transparency, without a tag or a default die-cut border.
      id: 'kaomoji', name: 'Kaomoji', hidden: true, line: true, text: '(◕‿◕)', draw(ctx, c, lw, text) {
        const str = (text || '(◕‿◕)').trim() || '(◕‿◕)';
        let size = 30;
        ctx.font = `700 ${size}px ${FONTS.kaomoji}`;
        const w = ctx.measureText(str).width;
        if (w > 80) { size *= 80 / w; ctx.font = `700 ${size.toFixed(1)}px ${FONTS.kaomoji}`; }
        ctx.fillStyle = c.outline; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(str, 50, 51);
      },
    },
    {
      // a pixel picture (an ImageBitmap handed in through the style) fitted to the tile with hard pixel edges
      id: 'pixel', name: 'Pixel art', hidden: true, outlineFromAlpha: true, outlineScale: 0.6, draw(ctx, c) {
        const img = c.image; if (!img) return;
        const k = Math.min(84 / img.width, 84 / img.height), w = img.width * k, h = img.height * k;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 50 - w / 2, 50 - h / 2, w, h);
        ctx.imageSmoothingEnabled = true;
      },
    },
    {
      id: 'imported', name: 'Custom icon', hidden: true, outlineFromAlpha: true, draw(ctx, c) {
        const img = c.image; if (!img) return;
        const k = Math.min(90 / img.width, 90 / img.height);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 50 - img.width * k / 2, 50 - img.height * k / 2, img.width * k, img.height * k);
      },
    },
  ];
  const iconById = {};
  ICONS.forEach((i) => { iconById[i.id] = i; });

  /* a solid outline grown from whatever was drawn, laid underneath (emoji and text keep their own colours) */
  function alphaOutline(canvas, px, color) {
    const M = (typeof window !== 'undefined' ? window : self).MaskOps;
    const w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d');
    const src = ctx.getImageData(0, 0, w, h).data;
    const bin = new Uint8Array(w * h);
    for (let i = 0, j = 3; i < bin.length; i++, j += 4) bin[i] = src[j] > 90 ? 1 : 0;
    const sd = M.signedDistance(bin, w, h);
    const out = ctx.createImageData(w, h), rgb = hexToRgb255(color);
    for (let i = 0, j = 0; i < bin.length; i++, j += 4) {
      const a = clamp(sd[i] + px + 0.5, 0, 1); if (a <= 0) continue;
      out.data[j] = rgb[0]; out.data[j + 1] = rgb[1]; out.data[j + 2] = rgb[2]; out.data[j + 3] = a * 255;
    }
    const under = newCanvas(w, h); under.getContext('2d').putImageData(out, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-over'; ctx.drawImage(under, 0, 0); ctx.restore();
  }

  const ICON_GROUPS = [
    { title: 'Café & sweets', ids: ['roll', 'teacup', 'mug', 'cupcake', 'macaron', 'pancakes', 'donut', 'cinnamon', 'softserve', 'cookie', 'milk', 'candy', 'strawberry', 'cherry', 'boba', 'toast', 'pudding', 'peach'] },
    { title: 'Sky', ids: ['cloud', 'cloudface', 'rainbow', 'star', 'sparkle', 'sparkles', 'moon', 'raindrop', 'umbrella', 'balloon', 'planet', 'ufo'] },
    { title: 'Cute', ids: ['heart', 'bow', 'flower', 'crown', 'paw', 'ghost', 'letter', 'note', 'notes'] },
    { title: 'With text', ids: ['ticket', 'bubble', 'tag', 'sign'] },
    { title: 'Animals', ids: ['bunny', 'cat', 'bear', 'frog', 'chick', 'whale'] },
    { title: 'Garden', ids: ['tulip', 'sprout', 'mushroom', 'cactus', 'butterfly', 'clover'] },
    { title: 'Everyday', ids: ['camera', 'headphones', 'gamepad', 'book', 'gift', 'pencil'] },
    { title: 'Cinnamoroll café', ids: ['cinnamoroll', 'cinnamoroll-duo', 'cafe-teacup', 'cafe-cloud', 'cafe-roll'] },
  ];

  /* Colour sets for icons: the sky-blue / white / soft pink / cinnamon one is the default. */
  const ICON_PALETTES = {
    'Cinnamoroll café': { iconFill: '#ffffff', iconAccent: '#f5d8e2', iconExtra: '#9bcde8', iconWarm: '#f6dc9a', iconBrown: '#e1b888', iconMint: '#bfe8d0', iconOutline: '#363b36' },
    'Cinnamon sky': { iconFill: '#ffffff', iconAccent: '#f7c6d4', iconExtra: '#bcd9f6', iconWarm: '#f6dc9a', iconBrown: '#dcae7c', iconMint: '#bfe8d0', iconOutline: '#2b2a33' },
    'Strawberry milk': { iconFill: '#fff7fa', iconAccent: '#f29bb6', iconExtra: '#fbd3df', iconWarm: '#ffe4a8', iconBrown: '#e4b58e', iconMint: '#c7ead2', iconOutline: '#4a2f3a' },
    'Mint cream': { iconFill: '#ffffff', iconAccent: '#f9c9d6', iconExtra: '#b9e6d4', iconWarm: '#f8e2a0', iconBrown: '#d8b08c', iconMint: '#8fd4b5', iconOutline: '#2f3b37' },
    'Lavender': { iconFill: '#fbf8ff', iconAccent: '#e6bfe8', iconExtra: '#cbbdf3', iconWarm: '#ffe6b0', iconBrown: '#d9b393', iconMint: '#c9e6d9', iconOutline: '#3a2f4a' },
    'Ink & paper': { iconFill: '#ffffff', iconAccent: '#e8e8ec', iconExtra: '#d6d6dc', iconWarm: '#efefe9', iconBrown: '#cfc6bb', iconMint: '#dfe6e1', iconOutline: '#1c1c22' },
    'Night glow': { iconFill: '#f6f7ff', iconAccent: '#ffb3c7', iconExtra: '#9fc3ff', iconWarm: '#ffe08a', iconBrown: '#d7a978', iconMint: '#a6e6cc', iconOutline: '#26283f' },
  };

  /* whether an icon shows its kawaii face under the face mode 'auto' | 'on' | 'off' */
  function hasFace(id, mode) {
    const def = iconById[id]; if (!def || !def.face) return false;
    mode = mode || 'auto';
    return mode === 'on' || (mode !== 'off' && !!def.faceDefault);
  }
  /* faces with open eyes can blink (sleepy ones already have them closed) */
  function canBlink(id, mode) { return hasFace(id, mode) && !iconById[id].face[3]; }

  /*
   * Render one icon. style: { fill, accent, extra, warm, brown, mint, outline,
   * line (outline width multiplier), text, flip, face: 'auto'|'on'|'off' },
   * opts: { blink } draws the closed-eyes frame. Returns a straight-alpha canvas.
   */
  function drawIcon(id, size, style, opts) {
    const def = iconById[id]; if (!def) return null;
    opts = opts || {};
    const c = newCanvas(size, size);
    const ctx = c.getContext('2d');
    const k = size / 100;
    ctx.scale(k, k);
    if (style.flip) { ctx.translate(100, 0); ctx.scale(-1, 1); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const lw = 4.6 * (style.line == null ? 1 : style.line);
    ctx.lineWidth = lw; ctx.strokeStyle = style.outline;
    const faceOn = hasFace(id, style.face);
    def.draw(ctx, style, lw, style.text != null && style.text !== '' ? style.text : def.text || '', faceOn);
    if (faceOn) {
      ctx.lineWidth = lw;
      if (def.drawFace) def.drawFace(ctx, style, lw, !!opts.blink);
      else face(ctx, style, def.face[0], def.face[1], def.face[2], !!def.face[3], !!opts.blink);
    }
    if (def.outlineFromAlpha && lw > 0.01) alphaOutline(c, lw * 0.7 * k * (def.outlineScale || 1), style.outline);
    return c;
  }

  const DEFAULT_ICON_STYLE = { fill: '#ffffff', accent: '#f7c6d4', extra: '#bcd9f6', warm: '#f6dc9a', brown: '#dcae7c', mint: '#bfe8d0', outline: '#2b2a33', line: 1, text: '', flip: false };

  /* Small preview for menus (cached per icon). */
  const thumbs = {};
  function thumbnail(id, size) {
    size = size || 64;
    const key = id + ':' + size;
    if (!thumbs[key]) {
      const c = newCanvas(size * 2, size * 2);
      const ctx = c.getContext('2d');
      const palette = ICON_PALETTES[iconById[id].palette];
      const style = palette ? Object.assign({}, DEFAULT_ICON_STYLE, iconStyleOf(palette)) : DEFAULT_ICON_STYLE;
      ctx.drawImage(drawIcon(id, size * 2, style), 0, 0);
      if (c.style) { c.style.width = size + 'px'; c.style.height = size + 'px'; }
      thumbs[key] = c;
    }
    return thumbs[key];
  }

  /* ------------------------------------------------------------------ */
  /* Portrait frame                                                       */
  /* ------------------------------------------------------------------ */
  const M = 130;   // canvas margin around the body: edges, tape, ribbons and tassels poke out into it

  /* proportions of the classic design */
  const FRAME_STYLES = {
    polaroid: { win: [840, 840], band: 300 },
    portrait: { win: [840, 1050], band: 300 },
    landscape: { win: [840, 630], band: 300 },
    wide: { win: [840, 520], band: 230 },
    square: { win: [840, 840], band: 80 },
  };
  const FRAME_STYLE_OPTIONS = [['polaroid', 'Polaroid'], ['portrait', 'Portrait'], ['landscape', 'Landscape'], ['wide', 'Wide'], ['square', 'Square (no caption)']];
  const EDGE_OPTIONS = [['straight', 'Straight'], ['scallop', 'Scalloped'], ['cloud', 'Puffy cloud'], ['ticket', 'Ticket stub'], ['stamp', 'Postage stamp']];
  const WINDOW_OPTIONS = [['rounded', 'Rounded corners'], ['square', 'Square'], ['circle', 'Circle'], ['arch', 'Arch'], ['heart', 'Heart'], ['cloud', 'Cloud']];
  const DESIGN_OPTIONS = [
    ['classic', 'Classic card'], ['cinnamoroll', 'Cinnamoroll card'], ['film', 'Film strip'], ['booth', 'Photo booth strip'], ['heart', 'Heart'],
    ['badge', 'Round badge'], ['envelope', 'Love letter'], ['tv', 'Retro TV'], ['bookmark', 'Bookmark'], ['notebook', 'Notebook page'],
    ['bubble', 'Speech bubble'], ['cup', 'Coffee cup'],
    ['rarecard', 'Rare collector card'], ['suitcase', 'Travel suitcase'], ['capsule', 'Toy capsule'],
    ['arcade', 'Mini arcade'], ['snowglobe', 'Snow globe'], ['potion', 'Potion bottle'], ['conference', 'Conference pass'],
  ];
  const DECOR_OPTIONS = [['none', 'None'], ['cinnamoroll', 'Cinnamoroll café'], ['clouds', 'Clouds'], ['hearts', 'Hearts'], ['stars', 'Stars'], ['sparkles', 'Sparkles'], ['bows', 'Bows'], ['rolls', 'Cinnamon rolls'], ['cafe', 'Café mix'], ['sky', 'Sky mix']];
  const DECOR_SETS = {
    cinnamoroll: ['cafe-teacup', 'cafe-cloud', 'sparkle', 'cafe-roll', 'sparkle', 'heart'],
    clouds: ['cloud', 'cloud', 'cloud', 'cloud', 'cloudface', 'cloud'],
    hearts: ['heart', 'heart', 'heart', 'heart', 'heart', 'heart'],
    stars: ['star', 'star', 'star', 'star', 'sparkle', 'sparkle'],
    sparkles: ['sparkle', 'sparkles', 'sparkle', 'sparkles', 'sparkle', 'sparkle'],
    bows: ['bow', 'bow', 'bow', 'bow', 'heart', 'heart'],
    rolls: ['roll', 'roll', 'roll', 'roll', 'heart', 'heart'],
    cafe: ['roll', 'mug', 'cupcake', 'macaron', 'heart', 'sparkle'],
    sky: ['cloud', 'star', 'rainbow', 'moon', 'sparkle', 'cloudface'],
  };
  const TAPE_OPTIONS = [['none', 'None'], ['top', 'One strip on top'], ['corners', 'Two corners'], ['sides', 'Left and right']];

  /* One-click frame looks (they never touch the caption text or the photo). */
  const FRAME_PRESETS = {
    'Cinnamoroll café': { frameDesign: 'cinnamoroll', frameEdge: 'straight', windowShape: 'square', frameColor: '#ffffff', frameOutline: '#363b36', captionColor: '#363b36', frameLine: 10, frameRadius: 0, frameBodyPattern: 'none', frameBodyPatternColor: '#ffffff', windowFill: '#c4defc', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 0.6, frameDecor: 'cinnamoroll', frameFont: 'marker', frameTape: 'none', tapeColor: '#f5d8e2' },
    'Cinnamon café': { frameDesign: 'classic', frameEdge: 'straight', windowShape: 'rounded', frameColor: '#ffffff', frameOutline: '#2b2a33', captionColor: '#2b2a33', frameLine: 10, frameRadius: 28, frameBodyPattern: 'none', frameBodyPatternColor: '#f3f3f6', windowFill: '#dbe8fb', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 1, frameDecor: 'clouds', frameFont: 'marker', frameTape: 'none', tapeColor: '#f7c6d4' },
    'Cloud nine': { frameDesign: 'classic', frameEdge: 'cloud', windowShape: 'cloud', frameColor: '#ffffff', frameOutline: '#2b2a33', captionColor: '#5b8fd1', frameLine: 10, frameRadius: 40, frameBodyPattern: 'none', windowFill: '#bcd9f6', windowPattern: 'stars', windowPatternColor: '#ffffff', windowPatternScale: 1.2, frameDecor: 'none', frameFont: 'round', frameTape: 'none' },
    'Sky ticket': { frameDesign: 'classic', frameEdge: 'ticket', windowShape: 'rounded', frameColor: '#eaf3fd', frameOutline: '#2b2a33', captionColor: '#2b2a33', frameLine: 10, frameRadius: 30, frameBodyPattern: 'none', windowFill: '#ffffff', windowPattern: 'grid', windowPatternColor: '#cfe1f7', windowPatternScale: 0.8, frameDecor: 'stars', frameFont: 'marker', frameTape: 'none' },
    'Sweet pink': { frameDesign: 'classic', frameEdge: 'scallop', windowShape: 'heart', frameColor: '#fde3ec', frameOutline: '#5a3644', captionColor: '#5a3644', frameLine: 9, frameRadius: 30, frameBodyPattern: 'dots', frameBodyPatternColor: '#ffffff', windowFill: '#fff6f9', windowPattern: 'hearts', windowPatternColor: '#f7c6d4', windowPatternScale: 1, frameDecor: 'hearts', frameFont: 'round', frameTape: 'none' },
    'Bakery': { frameDesign: 'classic', frameEdge: 'scallop', windowShape: 'circle', frameColor: '#fff4e6', frameOutline: '#5b4232', captionColor: '#5b4232', frameLine: 9, frameRadius: 24, frameBodyPattern: 'checks', frameBodyPatternColor: '#fbe7d0', windowFill: '#dbe8fb', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 1, frameDecor: 'cafe', frameFont: 'marker', frameTape: 'none' },
    'Postage stamp': { frameDesign: 'classic', frameEdge: 'stamp', windowShape: 'square', frameColor: '#fff9ee', frameOutline: '#6b5b4e', captionColor: '#6b5b4e', frameLine: 6, frameRadius: 0, frameBodyPattern: 'none', windowFill: '#e9f1fb', windowPattern: 'none', frameDecor: 'none', frameFont: 'typewriter', frameTape: 'none' },
    'Lace doily': { frameDesign: 'classic', frameEdge: 'scallop', windowShape: 'arch', frameColor: '#fffdf8', frameOutline: '#7c6a76', captionColor: '#7c6a76', frameLine: 6, frameRadius: 20, frameBodyPattern: 'scallops', frameBodyPatternColor: '#efe4ea', windowFill: '#f7ecef', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 0.8, frameDecor: 'bows', frameFont: 'round', frameTape: 'none' },
    'Classic polaroid': { frameDesign: 'classic', frameEdge: 'straight', windowShape: 'square', frameColor: '#ffffff', frameOutline: '#d9d9de', captionColor: '#2b2a33', frameLine: 4, frameRadius: 12, frameBodyPattern: 'none', windowFill: '#f0f0f2', windowPattern: 'none', frameDecor: 'none', frameFont: 'clean', frameTape: 'top', tapeColor: '#f7c6d4' },
    'Night sky': { frameDesign: 'classic', frameEdge: 'straight', windowShape: 'rounded', frameColor: '#2b2f4a', frameOutline: '#f4f6ff', captionColor: '#ffffff', frameLine: 8, frameRadius: 28, frameBodyPattern: 'none', windowFill: '#3b4470', windowPattern: 'stars', windowPatternColor: '#ffffff', windowPatternScale: 1.2, frameDecor: 'sparkles', frameFont: 'marker', frameTape: 'none' },
    'Film strip': { frameDesign: 'film', frameColor: '#2b2a33', frameOutline: '#14141a', captionColor: '#ffffff', frameLine: 6, frameRadius: 24, frameBodyPattern: 'none', windowFill: '#dbe8fb', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 1, frameDecor: 'none', frameFont: 'typewriter', frameTape: 'none' },
    'Photo booth': { frameDesign: 'booth', windowShape: 'rounded', frameColor: '#ffffff', frameOutline: '#2b2a33', captionColor: '#2b2a33', frameLine: 8, frameRadius: 24, frameBodyPattern: 'none', windowFill: '#dbe8fb', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 1, frameDecor: 'none', frameFont: 'marker', frameTape: 'none' },
    'Heart': { frameDesign: 'heart', frameColor: '#fbd5e0', frameOutline: '#4a2f3a', captionColor: '#4a2f3a', frameLine: 10, frameBodyPattern: 'none', windowFill: '#fff6f9', windowPattern: 'hearts', windowPatternColor: '#f7c6d4', windowPatternScale: 1, frameDecor: 'sparkles', frameFont: 'round', frameTape: 'none', tapeColor: '#ffffff' },
    'Round badge': { frameDesign: 'badge', frameColor: '#bcd9f6', frameOutline: '#2b2a33', captionColor: '#2b2a33', frameLine: 10, frameBodyPattern: 'stripes', frameBodyPatternColor: '#cfe3fb', windowFill: '#ffffff', windowPattern: 'dots', windowPatternColor: '#e3eefb', windowPatternScale: 1, frameDecor: 'stars', frameFont: 'round', frameTape: 'none', tapeColor: '#ffffff' },
    'Love letter': { frameDesign: 'envelope', frameColor: '#fbe1ea', frameOutline: '#4a2f3a', captionColor: '#4a2f3a', frameLine: 9, frameBodyPattern: 'none', windowFill: '#ffffff', windowPattern: 'lines', windowPatternColor: '#e8d5dd', windowPatternScale: 1, frameDecor: 'hearts', frameFont: 'marker', frameTape: 'none', tapeColor: '#f29bb6' },
    'Retro TV': { frameDesign: 'tv', frameColor: '#f6d9b8', frameOutline: '#4a3a2e', captionColor: '#4a3a2e', frameLine: 10, frameBodyPattern: 'none', windowFill: '#dbe8fb', windowPattern: 'none', frameDecor: 'none', frameFont: 'round', frameTape: 'none', tapeColor: '#bcd9f6' },
    'Bookmark': { frameDesign: 'bookmark', windowShape: 'arch', frameColor: '#fff8ee', frameOutline: '#5b4232', captionColor: '#5b4232', frameLine: 8, frameBodyPattern: 'none', windowFill: '#dbe8fb', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 1, frameDecor: 'rolls', frameFont: 'typewriter', frameTape: 'none', tapeColor: '#f7c6d4' },
    'Notebook page': { frameDesign: 'notebook', windowShape: 'rounded', frameColor: '#fffdf6', frameOutline: '#5b5b66', captionColor: '#5b5b66', frameLine: 6, frameBodyPattern: 'lines', frameBodyPatternColor: '#cfd9e6', windowFill: '#ffffff', windowPattern: 'grid', windowPatternColor: '#dfe7f2', windowPatternScale: 0.8, frameDecor: 'none', frameFont: 'marker', frameTape: 'top', tapeColor: '#bcd9f6' },
    'Speech bubble': { frameDesign: 'bubble', windowShape: 'rounded', frameColor: '#ffffff', frameOutline: '#2b2a33', captionColor: '#2b2a33', frameLine: 10, frameBodyPattern: 'none', windowFill: '#dbe8fb', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 1, frameDecor: 'none', frameFont: 'marker', frameTape: 'none' },
    'Coffee cup': { frameDesign: 'cup', windowShape: 'rounded', frameColor: '#ffffff', frameOutline: '#4a3a2e', captionColor: '#4a3a2e', frameLine: 9, frameBodyPattern: 'none', windowFill: '#dbe8fb', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 1, frameDecor: 'cafe', frameFont: 'marker', frameTape: 'none', tapeColor: '#dcae7c' },
    'Starlight rare': collectionStyle('rarecard', '#2c2948', '#352c4a', '#efd08d', '#f0eaff', '#fff3d4', 'stars'),
    'Bon voyage': collectionStyle('suitcase', '#bde8d9', '#354a49', '#dfac83', '#f5fff9', '#354a49', 'grid'),
    'Lucky capsule': collectionStyle('capsule', '#ecfaff', '#4d3957', '#f4abc9', '#f5f0ff', '#4d3957', 'stars'),
    'Player one': collectionStyle('arcade', '#c6b4ee', '#39314f', '#f5b4cb', '#e5f4ff', '#39314f', 'grid'),
    'Snow day': collectionStyle('snowglobe', '#e3f6ff', '#3f526e', '#adc6ee', '#e6edfc', '#3f526e', 'none'),
    'Love potion': collectionStyle('potion', '#e9dcfb', '#514062', '#f1b8d3', '#fcf0f8', '#514062', 'stars'),
    'Conference pass': { ...collectionStyle('conference', '#fffdf8', '#302b43', '#b6f16b', '#ece8f7', '#302b43', 'none'),
      frameLanyard: 'solid', frameLanyardColor: '#7655d5', frameLanyardTextColor: '#ffffff', frameLanyardText: 'CREATIVE SUMMIT', frameLanyardLength: .65 },
  };
  function collectionStyle(frameDesign, frameColor, frameOutline, tapeColor, windowFill, captionColor, windowPattern) {
    return { frameDesign, frameColor, frameOutline, tapeColor, windowFill, captionColor, windowPattern,
      frameEdge: 'straight', windowShape: 'rounded', frameLine: 8, frameRadius: 24, frameBodyPattern: 'none',
      frameBodyPatternColor: '#ffffff', windowPatternColor: '#ffffff', windowPatternScale: 0.75,
      frameDecor: 'none', frameFont: 'round', frameTape: 'none' };
  }
  const FRAME_COLLECTION = [
    ['Starlight rare', 'Rare card'], ['Bon voyage', 'Suitcase'], ['Lucky capsule', 'Capsule'],
    ['Player one', 'Arcade'], ['Snow day', 'Snow globe'], ['Love potion', 'Potion'], ['Conference pass', 'Conference pass'],
  ];

  /* seeded jitter for the hand-lettered caption */
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function drawLettering(ctx, str, font, color, cx, cy, maxW, maxH, caps) {
    if (caps) str = str.toUpperCase();
    if (!str || !str.trim()) return 0;
    const fam = FONTS[font] || FONTS.marker;
    const weight = font === 'clean' || font === 'round' ? 700 : 400;
    const spacing = font === 'marker' ? 0.06 : 0.02;
    let size = maxH;
    const width = () => { ctx.font = `${weight} ${size.toFixed(1)}px ${fam}`; let w = 0; for (const ch of str) w += ctx.measureText(ch).width + size * spacing; return w - size * spacing; };
    let w = width();
    for (let i = 0; i < 12 && w > maxW && size > 8; i++) { size *= Math.max(0.6, Math.min(0.96, maxW / w)); w = width(); }
    ctx.save();
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const jit = font === 'marker' ? 1 : 0;
    const rand = rng(str.length * 7919 + 13);
    let x = cx - w / 2;
    for (const ch of str) {
      const cw = ctx.measureText(ch).width;
      const rot = (rand() - 0.5) * 0.11 * jit, dy = (rand() - 0.5) * size * 0.08 * jit;
      ctx.save(); ctx.translate(x + cw / 2, cy + dy); ctx.rotate(rot); ctx.fillText(ch, 0, 0); ctx.restore();
      x += cw + size * spacing;
    }
    ctx.restore();
    return size;
  }

  /* caption (+ optional small line) inside a box; `cap.sub` lets the small line share the box */
  function drawCaptionBlock(ctx, p, cap, subBox) {
    const color = p.captionColor || '#2b2a33', font = p.frameFont || 'marker';
    const subText = (p.frameSubtitle || '').trim(), subFont = font === 'marker' ? 'marker' : 'clean';
    if (p.frameDesign === 'cinnamoroll' && font === 'marker' && !subText && referenceArtwork &&
        (p.frameCaps ? (p.frameCaption || '').toUpperCase() : p.frameCaption) === 'CINNAMOROLL') {
      const art = referenceCaption(color);
      ctx.drawImage(art, 60, 748); return;
    }
    if (cap.sub && subText) {
      drawLettering(ctx, p.frameCaption || '', font, color, cap.cx, cap.cy - cap.maxH * 0.2, cap.maxW, cap.maxH * 0.82, !!p.frameCaps);
      drawLettering(ctx, subText, subFont, color, cap.cx, cap.cy + cap.maxH * 0.52, cap.maxW * 0.9, cap.maxH * 0.36, false);
    } else {
      drawLettering(ctx, p.frameCaption || '', font, color, cap.cx, cap.cy, cap.maxW, cap.maxH, !!p.frameCaps);
      if (subText && subBox) drawLettering(ctx, subText, subFont, color, subBox.cx, subBox.cy, subBox.maxW, subBox.maxH, false);
    }
  }

  /* Straight-alpha copy of a premultiplied atlas canvas (cached on the atlas). */
  function straightCanvas(atlas) {
    if (atlas._straight) return atlas._straight;
    const c = newCanvas(atlas.w, atlas.h);
    const ctx = c.getContext('2d');
    const src = atlas.canvas.getContext('2d').getImageData(0, 0, atlas.w, atlas.h);
    const d = src.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]; if (a === 0 || a === 255) continue;
      const k = 255 / a;
      d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
    }
    ctx.putImageData(src, 0, 0);
    atlas._straight = c;
    return c;
  }

  /* A solid silhouette grown by `grow` px from the atlas distance field. */
  function borderCanvas(atlas, grow, color) {
    const key = grow + ':' + color;
    if (atlas._border && atlas._border.key === key) return atlas._border.canvas;
    const c = newCanvas(atlas.w, atlas.h);
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(atlas.w, atlas.h);
    const rgb = hexToRgb255(color), d = id.data, sdf = atlas.sdf;
    for (let i = 0, j = 0; i < sdf.length; i++, j += 4) {
      const a = clamp(sdf[i] + grow + 0.5, 0, 1);
      if (a <= 0) continue;
      d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; d[j + 3] = a * 255;
    }
    ctx.putImageData(id, 0, 0);
    atlas._border = { key, canvas: c };
    return c;
  }

  function hexToRgb255(hex) {
    const h = (hex || '#ffffff').replace('#', '');
    const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  /* the photo fitted into a window (win.fit overrides the box it is fitted to; win.zoom/dx/dy add per-window variation) */
  function drawPhoto(ctx, photo, p, win) {
    const fit = win.fit || win;
    const pad = photo.pad || 0, pb = Math.max(0, p.photoBorder || 0);
    const cw = Math.max(1, photo.w - 2 * pad + 2 * pb), ch = Math.max(1, photo.h - 2 * pad + 2 * pb);
    const sc = Math.min(fit.w / cw, fit.h / ch) * (p.photoZoom || 1) * (win.zoom || 1);
    const cx = fit.x + fit.w / 2 + ((p.photoX || 0) + (win.dx || 0)) * fit.w / 2, cy = fit.y + fit.h / 2 + ((p.photoY || 0) + (win.dy || 0)) * fit.h / 2;
    const dx = cx - photo.w / 2 * sc, dy = cy - photo.h / 2 * sc;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (pb > 0) ctx.drawImage(borderCanvas(photo, pb, p.photoBorderColor || '#ffffff'), dx, dy, photo.w * sc, photo.h * sc);
    ctx.drawImage(straightCanvas(photo), dx, dy, photo.w * sc, photo.h * sc);
  }

  function drawTape(ctx, p, W, H) {
    const kind = p.frameTape || 'none'; if (kind === 'none') return;
    const strip = (x, y, rot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.globalAlpha = 0.86; ctx.fillStyle = p.tapeColor || '#f7c6d4';
      ctx.beginPath(); rrPath(ctx, -140, -30, 280, 60, 4); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
      for (let i = -120; i <= 120; i += 40) { ctx.beginPath(); ctx.arc(i, 0, 6, 0, TAU); ctx.fill(); }
      ctx.restore();
    };
    if (kind === 'top') strip(W / 2, 4, -0.06);
    else if (kind === 'corners') { strip(0, 0, -Math.PI / 4); strip(W, 0, Math.PI / 4); }
    else if (kind === 'sides') { strip(0, H * 0.42, Math.PI / 2 - 0.08); strip(W, H * 0.42, Math.PI / 2 + 0.08); }
  }

  /*
   * Rectangle outline with semicircular notches cut inward. notches: array of
   * { side: 'top'|'right'|'bottom'|'left', t: 0..1 along that side }.
   */
  function notchedRectPath(ctx, x, y, w, h, r, notches, nr) {
    const on = (side) => notches.filter((n) => n.side === side).map((n) => n.t).sort((a, b) => a - b);
    ctx.moveTo(x + r, y);
    for (const t of on('top')) { const cx = x + t * w; ctx.lineTo(cx - nr, y); ctx.arc(cx, y, nr, Math.PI, 0, true); }
    ctx.lineTo(x + w - r, y); if (r > 0) ctx.arcTo(x + w, y, x + w, y + h, r);
    for (const t of on('right')) { const cy = y + t * h; ctx.lineTo(x + w, cy - nr); ctx.arc(x + w, cy, nr, -Math.PI / 2, Math.PI / 2, true); }
    ctx.lineTo(x + w, y + h - r); if (r > 0) ctx.arcTo(x + w, y + h, x, y + h, r);
    for (const t of on('bottom').reverse()) { const cx = x + t * w; ctx.lineTo(cx + nr, y + h); ctx.arc(cx, y + h, nr, 0, Math.PI, true); }
    ctx.lineTo(x + r, y + h); if (r > 0) ctx.arcTo(x, y + h, x, y, r);
    for (const t of on('left').reverse()) { const cy = y + t * h; ctx.lineTo(x, cy + nr); ctx.arc(x, cy, nr, Math.PI / 2, -Math.PI / 2, true); }
    ctx.lineTo(x, y + r); if (r > 0) ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function stampNotches(W, H, step) {
    const out = [];
    const along = (len, side) => { const n = Math.max(2, Math.round(len / step)); for (let i = 1; i < n; i++) out.push({ side, t: i / n }); };
    along(W, 'top'); along(W, 'bottom'); along(H, 'left'); along(H, 'right');
    return out;
  }
  /* bumps along the rectangle edge (scallop: even, cloud: irregular); each part starts with moveTo */
  function bumpParts(ctx, W, H, r, irregular) {
    const parts = [];
    const rand = rng(W * 31 + H);
    const along = (len, fn) => {
      const n = Math.max(2, Math.round(len / (r * 1.7)));
      for (let i = 0; i <= n; i++) {
        const t = i / n, rr = irregular ? r * (0.75 + rand() * 0.6) : r;
        const [x, y] = fn(t); parts.push(() => { ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); });
      }
    };
    along(W, (t) => [t * W, 0]); along(W, (t) => [t * W, H]); along(H, (t) => [0, t * H]); along(H, (t) => [W, t * H]);
    return parts;
  }

  const patternOf = (p) => (p.frameBodyPattern && p.frameBodyPattern !== 'none' ? p.frameBodyPattern : null);
  const radiusOf = (p) => Math.max(0, p.frameRadius == null ? 28 : p.frameRadius);

  /* fill + body pattern + outline for one closed path */
  function fillBody(ctx, p, pathFn, line) {
    ctx.beginPath(); pathFn(); ctx.fillStyle = p.frameColor || '#ffffff'; ctx.fill();
    const pattern = patternOf(p);
    if (pattern) {
      ctx.save(); ctx.beginPath(); pathFn(); ctx.clip();
      fillPattern(ctx, -M, -M, 3000, 3000, pattern, p.frameBodyPatternColor || '#f3f3f6', 1.6);
      ctx.restore();
    }
    if (line > 0) { ctx.beginPath(); pathFn(); ctx.stroke(); }
  }
  /*
   * Several overlapping parts as one body with a single outer outline (the blob
   * trick). partsFor(ctx) rebuilds the parts for any context so the patterned
   * silhouette can be pre-rendered offscreen and laid over the outline pass.
   */
  function blobBody(ctx, p, partsFor, line) {
    const parts = partsFor(ctx);
    const pattern = patternOf(p);
    if (!pattern) { blob(ctx, p.frameColor || '#ffffff', line, parts); return; }
    const tmp = newCanvas(ctx.canvas.width, ctx.canvas.height);
    const t = tmp.getContext('2d'); t.setTransform(ctx.getTransform());
    const partsT = partsFor(t);
    t.fillStyle = p.frameColor || '#ffffff'; t.beginPath(); for (const pt of partsT) pt(); t.fill();
    t.save(); t.beginPath(); for (const pt of partsT) pt(); t.clip();
    fillPattern(t, -M, -M, 3000, 3000, pattern, p.frameBodyPatternColor || '#f3f3f6', 1.6);
    t.restore();
    if (line > 0) { ctx.save(); ctx.lineWidth = line * 2; for (const pt of parts) { ctx.beginPath(); pt(); ctx.stroke(); } ctx.restore(); }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(tmp, 0, 0); ctx.restore();
  }
  /* cut a hole through everything drawn so far, and outline it */
  function punch(ctx, pathFn, lw) {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); pathFn(); ctx.fill(); ctx.restore();
    if (lw > 0) { ctx.save(); ctx.lineWidth = lw; ctx.beginPath(); pathFn(); ctx.stroke(); ctx.restore(); }
  }

  /* the classic card body with its edge styles */
  function classicBody(ctx, p, W, H, R, line, bandY) {
    const edge = p.frameEdge || 'straight';
    if (edge === 'scallop' || edge === 'cloud') {
      const r = edge === 'cloud' ? 58 : 30;
      blobBody(ctx, p, (c) => [() => rrPath(c, 0, 0, W, H, Math.max(R, r))].concat(bumpParts(c, W, H, r, edge === 'cloud')), line);
    } else if (edge === 'stamp') {
      fillBody(ctx, p, () => notchedRectPath(ctx, 0, 0, W, H, 0, stampNotches(W, H, 62), 18), line);
    } else if (edge === 'ticket') {
      fillBody(ctx, p, () => notchedRectPath(ctx, 0, 0, W, H, R, [{ side: 'left', t: bandY / H }, { side: 'right', t: bandY / H }], 34), line);
      ctx.save(); ctx.setLineDash([14, 16]); ctx.lineWidth = Math.max(3, line * 0.5); ctx.beginPath(); ctx.moveTo(48, bandY); ctx.lineTo(W - 48, bandY); ctx.stroke(); ctx.restore();
    } else {
      fillBody(ctx, p, () => rrPath(ctx, 0, 0, W, H, R), line);
    }
  }

  /* The photo window's path (a set of parts for the blob outline). */
  function windowParts(ctx, shapeName, x, y, w, h, r) {
    if (shapeName === 'circle') return [() => { ctx.moveTo(x + w, y + h / 2); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); }];
    if (shapeName === 'square') return [() => rrPath(ctx, x, y, w, h, 4)];
    if (shapeName === 'arch') return [() => { const rr = w / 2; ctx.moveTo(x, y + h); ctx.lineTo(x, y + rr); ctx.arc(x + rr, y + rr, rr, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }];
    if (shapeName === 'heart') return [() => { ctx.save(); ctx.translate(x + w / 2, y + h * 0.5); ctx.scale(1, h / w); heartPath(ctx, 0, 0, w / 2); ctx.restore(); }];
    if (shapeName === 'cloud') return cloudFilling(ctx, x + w * 0.03, y + h * 0.04, w * 0.94, h * 0.92);
    return [() => rrPath(ctx, x, y, w, h, r)];
  }

  /* a ribbon banner with swallow-tailed ends, coloured like the tape */
  function drawRibbon(ctx, p, cx, cy, w, h) {
    const col = p.tapeColor || '#f7c6d4';
    const tail = (dir) => { const x0 = cx + dir * (w / 2 - 40); ctx.moveTo(x0, cy - h * 0.32); ctx.lineTo(x0 + dir * 90, cy - h * 0.42); ctx.lineTo(x0 + dir * 62, cy); ctx.lineTo(x0 + dir * 90, cy + h * 0.42); ctx.lineTo(x0, cy + h * 0.32); ctx.closePath(); };
    shape(ctx, col, () => tail(-1)); shape(ctx, col, () => tail(1));
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#000'; ctx.beginPath(); tail(-1); ctx.fill(); ctx.beginPath(); tail(1); ctx.fill(); ctx.restore();
    shape(ctx, col, () => rrPath(ctx, cx - w / 2, cy - h / 2, w, h, 14));
  }

  /*
   * Frame designs. layout(p, line) → { W, H, body(ctx), windows: [{x, y, w, h,
   * shape, r, fit?, zoom?, dx?, dy?}], over?(ctx) drawn on top of the photo,
   * caption: {cx, cy, maxW, maxH, sub}, sub?: {cx, cy, maxW, maxH},
   * decor: [[x, y, rot, size?]], tape: bool }.
   */
  // Small engraved details share the frame's outline and editable accent colour.
  function framePrint(ctx, text, x, y, width, height, color) {
    drawLettering(ctx, text, 'clean', color, x, y, width, height, false);
  }
  function metalFill(ctx, accent, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    [[0, accent], [0.24, '#fff9e6'], [0.48, accent], [0.7, '#d5c9f6'], [1, accent]].forEach(([t, c]) => g.addColorStop(t, c));
    return g;
  }
  function chamferPath(ctx, x, y, w, h, cut) {
    ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
  }
  const DESIGNS = {
    conference: {
      layout(p, line) {
        const W = 900, H = 1240, accent = p.tapeColor || '#b6f16b', ink = p.captionColor || '#302b43';
        return { W, H,
          body(ctx) {
            fillBody(ctx, p, () => rrPath(ctx, 0, 0, W, H, 52), line);
            ctx.save(); ctx.beginPath(); rrPath(ctx, 0, 0, W, H, 52); ctx.clip();
            ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 216); ctx.fillRect(0, H - 90, W, 90);
            ctx.fillStyle = '#ffffff50'; ctx.beginPath(); ctx.arc(W - 38, 32, 144, 0, TAU); ctx.fill();
            ctx.fillStyle = ink; ctx.fillRect(58, 157, 784, 3);
            framePrint(ctx, p.passEvent ?? 'CREATIVE SUMMIT', 450, 112, 760, 66, ink);
            framePrint(ctx, p.passDate ?? '2026', 450, 186, 756, 25, ink);
            framePrint(ctx, p.passName ?? 'YOUR NAME', 450, 922, 744, 82, ink);
            framePrint(ctx, p.passOrganization ?? 'DESIGN · BUILD · CONNECT', 450, 994, 740, 30, ink);
            shape(ctx, accent, () => rrPath(ctx, 232, 1048, 436, 70, 35));
            framePrint(ctx, p.passRole ?? 'ATTENDEE', 450, 1084, 374, 36, ink);
            // A simple printed stripe, without pretending to encode a scannable credential.
            for (let i = 0; i < 43; i++) { ctx.fillStyle = ink; ctx.fillRect(68 + i * 12, 1179, i % 3 === 0 ? 6 : 3, 28); }
            framePrint(ctx, 'PASS', 746, 1192, 130, 28, ink);
            ctx.restore();
            ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = '#746d81';
            shape(ctx, '#d8d4df', () => rrPath(ctx, 388, 24, 124, 20, 10)); ctx.restore();
          },
          windows: [{ x: 146, y: 264, w: 608, h: 572, shape: 'rounded', r: 28, lineScale: .55 }],
          hanger: { x: W / 2, y: 34 }, tape: false,
        };
      },
    },
    rarecard: {
      layout(p, line) {
        const W = 900, H = 1260, accent = p.tapeColor || '#efd08d', ink = p.frameOutline || '#352c4a';
        return { W, H,
          body(ctx) {
            shape(ctx, metalFill(ctx, accent, 0, 0, W, H), () => chamferPath(ctx, 0, 0, W, H, 48));
            fillBody(ctx, p, () => chamferPath(ctx, 26, 26, 848, 1208, 36), line);
            ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = 3;
            shape(ctx, null, () => chamferPath(ctx, 48, 48, 804, 1164, 26));
            for (const x of [62, 838]) for (const y of [170, 977]) shape(ctx, accent, () => sparklePath(ctx, x, y, 22));
            shape(ctx, metalFill(ctx, accent, 72, 185, 756, 770), () => chamferPath(ctx, 72, 180, 756, 780, 24));
            shape(ctx, metalFill(ctx, accent, 680, 76, 134, 66), () => chamferPath(ctx, 680, 76, 134, 66, 14));
            framePrint(ctx, 'SSR', 747, 110, 100, 32, ink);
            framePrint(ctx, 'STARLIGHT EDITION', 352, 110, 500, 31, accent);
            shape(ctx, '#ffffff12', () => rrPath(ctx, 80, 996, 740, 168, 20));
            for (let i = 0; i < 5; i++) shape(ctx, accent, () => starPath(ctx, 374 + i * 38, 1193, 12, 5));
            framePrint(ctx, '001 / 999', 730, 1193, 130, 19, accent);
            ctx.restore();
          },
          windows: [{ x: 86, y: 194, w: 728, h: 752, shape: 'rounded', r: 18, lineScale: 0.5 }],
          caption: { cx: 450, cy: 1080, maxW: 650, maxH: 84, sub: true },
          decor: [[62, 170, 0, 0.5], [838, 977, 0, 0.5]], tape: false,
        };
      },
    },
    suitcase: {
      layout(p, line) {
        const W = 980, H = 1240, accent = p.tapeColor || '#dfac83', ink = p.frameOutline || '#354a49';
        return { W, H,
          body(ctx) {
            shape(ctx, accent, () => rrPath(ctx, 320, 0, 340, 190, 55));
            punch(ctx, () => rrPath(ctx, 370, 45, 240, 110, 22), line * 0.5);
            for (const x of [125, 745]) shape(ctx, ink, () => rrPath(ctx, x, 1100, 110, 140, 40));
            fillBody(ctx, p, () => rrPath(ctx, 0, 140, W, 1000, 105), line);
            ctx.save(); ctx.lineWidth = Math.max(2, line * 0.5);
            for (const x of [100, 796]) {
              shape(ctx, accent, () => rrPath(ctx, x, 143, 84, 994, 14));
              ctx.save(); ctx.setLineDash([7, 12]); shape(ctx, null, () => rrPath(ctx, x + 13, 155, 58, 966, 10)); ctx.restore();
              shape(ctx, '#fff4dd', () => rrPath(ctx, x - 9, 568, 102, 104, 13));
              shape(ctx, accent, () => rrPath(ctx, x + 11, 590, 62, 59, 6));
            }
            for (const x of [22, 876]) for (const y of [164, 1031]) shape(ctx, accent, () => rrPath(ctx, x, y, 80, 82, 22));
            shape(ctx, '#ffffff', () => rrPath(ctx, 196, 266, 588, 648, 42));
            shape(ctx, '#fff8e9', () => rrPath(ctx, 229, 958, 522, 130, 16));
            ctx.fillStyle = accent; for (const x of [249, 731]) dot(ctx, x, 980, 7);
            ctx.save(); ctx.translate(723, 209); ctx.rotate(0.16);
            shape(ctx, '#fbe0e9', () => rrPath(ctx, -82, -44, 164, 88, 12));
            framePrint(ctx, 'AIR MAIL', 0, -8, 133, 23, ink); framePrint(ctx, 'WITH LOVE', 0, 22, 122, 13, ink); ctx.restore();
            framePrint(ctx, 'BON VOYAGE', 422, 211, 294, 25, ink);
            ctx.restore();
          },
          windows: [{ x: 212, y: 282, w: 556, h: 616, shape: 'rounded', r: 30, lineScale: 0.6 }],
          caption: { cx: 490, cy: 1027, maxW: 444, maxH: 62, sub: true },
          decor: [[82, 944, -0.2, 0.72], [900, 354, 0.25, 0.72]], tape: false,
        };
      },
    },
    capsule: {
      layout(p, line) {
        const W = 1000, H = 1000, accent = p.tapeColor || '#f4abc9', ink = p.frameOutline || '#4d3957';
        return { W, H,
          body: ctx => fillBody(ctx, p, () => { ctx.moveTo(980, 500); ctx.arc(500, 500, 480, 0, TAU); }, line),
          windows: [{ x: 105, y: 77, w: 790, h: 530, shape: 'arch', r: 0, lineScale: 0.5,
            fit: { x: 175, y: 175, w: 650, h: 405 } }],
          over(ctx) {
            shape(ctx, accent, () => { ctx.moveTo(22, 550); ctx.bezierCurveTo(52, 1130, 948, 1130, 978, 550); ctx.closePath(); });
            shape(ctx, p.frameColor || '#ecfaff', () => rrPath(ctx, 22, 530, 956, 65, 22));
            shape(ctx, '#fffaf5', () => { ctx.moveTo(559, 563); ctx.arc(500, 563, 59, 0, TAU); });
            ctx.save(); ctx.lineWidth = Math.max(2, line * 0.5);
            shape(ctx, accent, () => heartPath(ctx, 500, 563, 27));
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(500, 500, 436, 3.5, 4.08); ctx.stroke();
            ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(500, 500, 412, 4.26, 4.55); ctx.stroke();
            ctx.strokeStyle = ink; ctx.globalAlpha = 0.22; ctx.lineWidth = 4;
            for (const x of [200, 242, 758, 800]) { ctx.beginPath(); ctx.moveTo(x, 704); ctx.lineTo(x + (500 - x) * 0.12, 790); ctx.stroke(); }
            ctx.restore(); framePrint(ctx, 'A LITTLE LUCK INSIDE', 500, 876, 390, 23, ink);
          },
          caption: { cx: 500, cy: 750, maxW: 550, maxH: 100, sub: true },
          decor: [[87, 556, -0.2, 0.7], [913, 556, 0.2, 0.7]], tape: false,
        };
      },
    },
    arcade: {
      layout(p, line) {
        const W = 960, H = 1350, accent = p.tapeColor || '#f5b4cb', ink = p.frameOutline || '#39314f';
        return { W, H,
          body(ctx) {
            fillBody(ctx, p, () => { ctx.moveTo(110, 0); ctx.lineTo(850, 0); ctx.lineTo(940, 205); ctx.lineTo(870, 853); ctx.lineTo(940, 1040); ctx.lineTo(850, 1100); ctx.lineTo(850, H); ctx.lineTo(110, H); ctx.lineTo(110, 1100); ctx.lineTo(20, 1040); ctx.lineTo(90, 853); ctx.lineTo(20, 205); ctx.closePath(); }, line);
            shape(ctx, accent, () => rrPath(ctx, 140, 46, 680, 133, 20));
            framePrint(ctx, 'PLAYER 01', 480, 113, 435, 57, ink);
            for (const x of [204, 756]) shape(ctx, '#fff5c8', () => starPath(ctx, x, 111, 25, 11));
            shape(ctx, ink, () => rrPath(ctx, 130, 236, 700, 623, 42));
            ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(90, 215); ctx.lineTo(134, 807); ctx.moveTo(870, 215); ctx.lineTo(826, 807); ctx.stroke(); ctx.restore();
            shape(ctx, accent, () => { ctx.moveTo(92, 897); ctx.lineTo(868, 897); ctx.lineTo(924, 1037); ctx.lineTo(36, 1037); ctx.closePath(); });
            shape(ctx, ink, () => { ctx.moveTo(250, 922); ctx.lineTo(292, 922); ctx.lineTo(292, 951); ctx.lineTo(324, 951); ctx.lineTo(324, 991); ctx.lineTo(292, 991); ctx.lineTo(292, 1020); ctx.lineTo(250, 1020); ctx.lineTo(250, 991); ctx.lineTo(218, 991); ctx.lineTo(218, 951); ctx.lineTo(250, 951); ctx.closePath(); });
            for (const [x, y, col] of [[647, 980, '#bfe8e1'], [731, 949, '#fff0ad']]) shape(ctx, col, () => { ctx.moveTo(x + 30, y); ctx.arc(x, y, 30, 0, TAU); });
            shape(ctx, '#ffffff65', () => rrPath(ctx, 165, 1108, 630, 147, 20));
            shape(ctx, ink, () => rrPath(ctx, 405, 1290, 150, 17, 6));
            framePrint(ctx, 'START', 480, 968, 115, 24, ink);
          },
          windows: [{ x: 158, y: 264, w: 644, h: 567, shape: 'rounded', r: 24, lineScale: 0.5 }],
          caption: { cx: 480, cy: 1181, maxW: 556, maxH: 78, sub: true },
          decor: [[91, 861, -0.2, 0.6], [869, 861, 0.2, 0.6]], tape: false,
        };
      },
    },
    snowglobe: {
      layout(p, line) {
        const W = 1080, H = 1280, accent = p.tapeColor || '#adc6ee', ink = p.frameOutline || '#3f526e';
        return { W, H,
          body: ctx => fillBody(ctx, p, () => { ctx.moveTo(1040, 510); ctx.arc(540, 510, 500, 0, TAU); }, line),
          windows: [{ x: 104, y: 74, w: 872, h: 872, shape: 'circle', r: 0, lineScale: 0.4,
            fit: { x: 210, y: 180, w: 660, h: 650 } }],
          over(ctx) {
            ctx.save(); ctx.beginPath(); ctx.arc(540, 510, 489, 0, TAU); ctx.clip();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(20, 916); ctx.bezierCurveTo(325, 810, 516, 916, 1070, 832); ctx.lineTo(1080, 1100); ctx.lineTo(0, 1100); ctx.fill();
            for (const [x, y, r] of [[166, 430, 8], [860, 276, 10], [260, 740, 7], [839, 701, 9], [730, 822, 8], [440, 858, 6], [350, 153, 8], [868, 497, 6]]) dot(ctx, x, y, r);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(540, 510, 465, 3.45, 4.12); ctx.stroke();
            ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(540, 510, 440, 4.25, 4.5); ctx.stroke();
            ctx.lineWidth = 2; for (const [x, y, r] of [[220, 274, 27], [851, 583, 22]]) shape(ctx, '#ffffff', () => sparklePath(ctx, x, y, r));
            ctx.restore();
            shape(ctx, accent, () => { ctx.moveTo(200, 951); ctx.lineTo(880, 951); ctx.lineTo(990, 1207); ctx.lineTo(90, 1207); ctx.closePath(); });
            shape(ctx, p.frameColor || '#e3f6ff', () => rrPath(ctx, 156, 943, 768, 72, 24));
            shape(ctx, accent, () => rrPath(ctx, 59, 1198, 962, 82, 26));
            shape(ctx, '#fffaf0', () => rrPath(ctx, 248, 1053, 584, 119, 23));
            ctx.fillStyle = ink; for (const x of [269, 811]) dot(ctx, x, 1112, 5);
          },
          caption: { cx: 540, cy: 1115, maxW: 490, maxH: 61, sub: true },
          decor: [[136, 1110, -0.2, 0.62], [944, 1110, 0.2, 0.62]], tape: false,
        };
      },
    },
    potion: {
      layout(p, line) {
        const W = 920, H = 1310, accent = p.tapeColor || '#f1b8d3', ink = p.frameOutline || '#514062';
        return { W, H,
          body(ctx) {
            shape(ctx, accent, () => rrPath(ctx, 340, 0, 240, 219, 28));
            ctx.save(); ctx.globalAlpha = 0.3; ctx.lineWidth = 5;
            for (const x of [381, 427, 512, 547]) { ctx.beginPath(); ctx.moveTo(x, 22); ctx.lineTo(x - 8, 128); ctx.stroke(); } ctx.restore();
            fillBody(ctx, p, () => { ctx.moveTo(320, 186); ctx.lineTo(600, 186); ctx.lineTo(600, 323); ctx.bezierCurveTo(602, 387, 902, 401, 902, 818); ctx.bezierCurveTo(902, 1176, 765, 1290, 460, 1290); ctx.bezierCurveTo(155, 1290, 18, 1176, 18, 818); ctx.bezierCurveTo(18, 401, 318, 387, 320, 323); ctx.closePath(); }, line);
            shape(ctx, accent, () => rrPath(ctx, 286, 169, 348, 80, 24));
            ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(308, 277); ctx.bezierCurveTo(496, 335, 605, 255, 731, 345); ctx.lineTo(748, 400); ctx.stroke(); ctx.restore();
            shape(ctx, '#fff2c8', () => starPath(ctx, 748, 431, 65, 33));
            shape(ctx, accent, () => rrPath(ctx, 207, 1016, 506, 169, 38));
            framePrint(ctx, '100% MAGIC', 460, 1240, 300, 25, ink);
          },
          windows: [{ x: 143, y: 366, w: 634, h: 634, shape: 'circle', r: 0, lineScale: 0.65 }],
          over(ctx) {
            ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(94, 837); ctx.bezierCurveTo(83, 665, 163, 492, 235, 464); ctx.stroke();
            ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(100, 902); ctx.lineTo(109, 954); ctx.stroke(); ctx.restore();
            ctx.save(); ctx.lineWidth = 3; shape(ctx, '#fff8df', () => sparklePath(ctx, 816, 936, 42)); ctx.restore();
          },
          caption: { cx: 460, cy: 1100, maxW: 434, maxH: 82, sub: true },
          decor: [[132, 1070, -0.2, 0.65], [760, 1142, 0.2, 0.65]], tape: false,
        };
      },
    },
    classic: {
      layout(p, line) {
        const st = FRAME_STYLES[p.frameStyle] || FRAME_STYLES.polaroid;
        const W = 1000, edge = 80, ww = st.win[0], wh = st.win[1], band = st.band, H = edge + wh + band, R = radiusOf(p);
        const decor = [[22, 26, -0.35], [W - 22, 30, 0.3], [W - 26, H - 30, 0.2], [26, H - 26, -0.25]];
        if (band >= 200) decor.push([edge * 0.55, edge + wh + band / 2, -0.2, 0.72], [W - edge * 0.55, edge + wh + band / 2, 0.25, 0.72]);
        return {
          W, H,
          body: (ctx) => classicBody(ctx, p, W, H, R, line, edge + wh + band * 0.02),
          windows: [{ x: edge, y: edge, w: ww, h: wh, shape: p.windowShape || 'rounded', r: Math.min(R * 0.5, 24) }],
          caption: band >= 120 ? { cx: W / 2, cy: edge + wh + band / 2 + 6, maxW: W * 0.78, maxH: band * 0.56, sub: true } : null,
          decor, tape: true,
        };
      },
    },
    cinnamoroll: {
      layout(p, line) {
        const W = 835, H = 914;
        return {
          W, H, margin: 240,
          body: (ctx) => classicBody(ctx, p, W, H, radiusOf(p), line, 701),
          windows: [{ x: 40, y: 45, w: 725, h: 656, shape: p.windowShape || 'square', r: radiusOf(p), lineScale: 1, under: p.frameDecor === 'cinnamoroll' ? referenceNotes : null }],
          caption: { cx: 420, cy: 802, maxW: 686, maxH: 83, sub: true },
          decor: [[5, 40, -0.3, 2.1], [820, 142, 0.2, 1.7], [865, 895, 0.25, 0.62], [3, 866, -0.32, 1.95], [-62, 460, -0.25, 0.67], [920, 480, 0.3, 0.88]],
          tape: true,
        };
      },
    },
    film: {
      layout(p, line) {
        const W = 1000, H = 1280, n = 10, step = 84, x0 = (W - (n - 1) * step - 46) / 2;
        const holes = [];
        for (let i = 0; i < n; i++) { holes.push([x0 + i * step, 28]); holes.push([x0 + i * step, H - 62]); }
        return {
          W, H,
          body: (ctx) => {
            fillBody(ctx, p, () => rrPath(ctx, 0, 0, W, H, Math.min(radiusOf(p), 40)), line);
            for (const [x, y] of holes) punch(ctx, () => rrPath(ctx, x, y, 46, 34, 8), Math.max(2, line * 0.5));
          },
          windows: [{ x: 80, y: 90, w: 840, h: 840, shape: 'square', r: 14 }],
          caption: { cx: W / 2, cy: 1065, maxW: 700, maxH: 130, sub: true },
          decor: [[100, 1065, -0.2, 0.7], [900, 1065, 0.2, 0.7]], tape: false,
        };
      },
    },
    booth: {
      layout(p, line) {
        const W = 640, gap = 60, s = 520, H = 2020;
        const vars = [{ zoom: 1, dx: 0, dy: 0 }, { zoom: 1.18, dx: -0.05, dy: 0.1 }, { zoom: 0.92, dx: 0.05, dy: -0.04 }];
        const shapeName = p.windowShape === 'circle' || p.windowShape === 'heart' || p.windowShape === 'square' ? p.windowShape : 'rounded';
        return {
          W, H,
          body: (ctx) => fillBody(ctx, p, () => rrPath(ctx, 0, 0, W, H, Math.min(radiusOf(p), 30)), line),
          windows: vars.map((v, i) => Object.assign({ x: gap, y: gap + i * (s + gap), w: s, h: s, shape: shapeName, r: 18 }, v)),
          caption: { cx: W / 2, cy: 1860, maxW: 520, maxH: 110, sub: true },
          decor: [[36, 1860, -0.2, 0.6], [604, 1860, 0.2, 0.6]], tape: true,
        };
      },
    },
    heart: {
      layout(p, line) {
        const W = 1100, H = 1000, cx = 550;
        return {
          W, H,
          body: (ctx) => fillBody(ctx, p, () => heartPath(ctx, cx, 505, 540), line),
          windows: [{ x: 220, y: 130, w: 660, h: 610, shape: 'heart', r: 0 }],
          over: (ctx) => drawRibbon(ctx, p, cx, 810, 680, 130),
          caption: { cx, cy: 810, maxW: 540, maxH: 84, sub: false },
          decor: [[230, 120, -0.3], [870, 120, 0.3], [550, 935, 0, 0.7]], tape: false,
        };
      },
    },
    badge: {
      layout(p, line) {
        const W = 1000, H = 1000;
        return {
          W, H,
          body: (ctx) => {
            fillBody(ctx, p, () => { ctx.moveTo(1000, 500); ctx.arc(500, 500, 500, 0, TAU); }, line);
            if (line > 0) { ctx.save(); ctx.lineWidth = Math.max(2, line * 0.5); ctx.setLineDash([2, 14]); ctx.beginPath(); ctx.arc(500, 500, 452, 0, TAU); ctx.stroke(); ctx.restore(); }
          },
          windows: [{ x: 190, y: 120, w: 620, h: 620, shape: 'circle', r: 0 }],
          over: (ctx) => drawRibbon(ctx, p, 500, 830, 760, 150),
          caption: { cx: 500, cy: 830, maxW: 600, maxH: 96, sub: false },
          decor: [[150, 260, -0.3, 0.8], [850, 260, 0.3, 0.8], [500, 50, 0, 0.8]], tape: false,
        };
      },
    },
    envelope: {
      layout(p, line) {
        const W = 1000, H = 1180;
        return {
          W, H,
          body: (ctx) => fillBody(ctx, p, () => rrPath(ctx, 0, 380, W, 800, 30), line),
          windows: [{ x: 90, y: 0, w: 820, h: 880, shape: 'rounded', r: 30, fit: { x: 90, y: 30, w: 820, h: 540 } }],
          over: (ctx) => {
            fillBody(ctx, p, () => { ctx.moveTo(0, 380); ctx.lineTo(500, 780); ctx.lineTo(1000, 380); ctx.lineTo(1000, 1150); ctx.arcTo(1000, 1180, 970, 1180, 30); ctx.lineTo(30, 1180); ctx.arcTo(0, 1180, 0, 1150, 30); ctx.closePath(); }, line);
            shape(ctx, p.tapeColor || '#f7c6d4', () => heartPath(ctx, 500, 790, 62));
          },
          caption: { cx: 500, cy: 985, maxW: 760, maxH: 140, sub: true },
          decor: [[60, 1110, -0.2, 0.8], [940, 1110, 0.2, 0.8]], tape: false,
        };
      },
    },
    tv: {
      layout(p, line) {
        const W = 1100, H = 1060, body = p.frameColor || '#ffffff', knob = p.tapeColor || '#f7c6d4';
        return {
          W, H,
          body: (ctx) => {
            ctx.save(); ctx.lineWidth = Math.max(4, line * 1.2); ctx.beginPath(); ctx.moveTo(470, 140); ctx.lineTo(330, 14); ctx.moveTo(630, 140); ctx.lineTo(770, 14); ctx.stroke();
            ctx.fillStyle = p.frameOutline || '#2b2a33'; dot(ctx, 330, 14, 16); dot(ctx, 770, 14, 16); ctx.restore();
            shape(ctx, body, () => rrPath(ctx, 170, 980, 170, 80, 18));
            shape(ctx, body, () => rrPath(ctx, 760, 980, 170, 80, 18));
            fillBody(ctx, p, () => rrPath(ctx, 0, 120, W, 880, 70), line);
          },
          windows: [{ x: 90, y: 210, w: 720, h: 600, shape: 'rounded', r: 50 }],
          over: (ctx) => {
            for (const y of [330, 480]) {
              shape(ctx, knob, () => { ctx.moveTo(1004, y); ctx.arc(960, y, 44, 0, TAU); });
              ctx.save(); ctx.lineWidth = Math.max(3, line * 0.6); ctx.beginPath(); ctx.moveTo(960, y); ctx.lineTo(988, y - 22); ctx.stroke(); ctx.restore();
            }
            ctx.save(); ctx.lineWidth = Math.max(3, line * 0.7); for (const y of [600, 650, 700, 750]) { ctx.beginPath(); ctx.moveTo(900, y); ctx.lineTo(1020, y); ctx.stroke(); } ctx.restore();
          },
          caption: { cx: 450, cy: 912, maxW: 660, maxH: 100, sub: true },
          decor: [[40, 160, -0.3, 0.8], [1060, 160, 0.3, 0.8]], tape: false,
        };
      },
    },
    bookmark: {
      layout(p, line) {
        const W = 620, H = 1520;
        return {
          W, H,
          body: (ctx) => {
            ctx.save(); ctx.lineWidth = Math.max(3, line * 0.7); ctx.beginPath(); ctx.ellipse(310, -10, 22, 78, 0, 0, TAU); ctx.stroke(); ctx.restore();
            fillBody(ctx, p, () => { ctx.moveTo(24, 0); ctx.lineTo(W - 24, 0); ctx.arcTo(W, 0, W, 24, 24); ctx.lineTo(W, 1380); ctx.lineTo(310, 1520); ctx.lineTo(0, 1380); ctx.lineTo(0, 24); ctx.arcTo(0, 0, 24, 0, 24); ctx.closePath(); }, line);
            punch(ctx, () => { ctx.moveTo(342, 92); ctx.arc(310, 92, 32, 0, TAU); }, line);
            const bow = drawIcon('bow', 256, Object.assign({}, DEFAULT_ICON_STYLE, { extra: p.tapeColor || '#f7c6d4', outline: p.frameOutline || '#2b2a33' }));
            ctx.drawImage(bow, 230, -150, 160, 160);
          },
          windows: [{ x: 60, y: 175, w: 500, h: 640, shape: p.windowShape === 'arch' ? 'arch' : 'rounded', r: 24 }],
          caption: { cx: 310, cy: 990, maxW: 500, maxH: 120, sub: true },
          decor: [[90, 1300, -0.25, 0.75], [530, 1300, 0.25, 0.75]], tape: false,
        };
      },
    },
    notebook: {
      layout(p, line) {
        const W = 1000, H = 1180;
        return {
          W, H,
          body: (ctx) => {
            fillBody(ctx, p, () => rrPath(ctx, 40, 0, 960, H, 24), line);
            for (let y = 80; y <= H - 60; y += 100) {
              punch(ctx, () => { ctx.moveTo(108, y); ctx.arc(90, y, 18, 0, TAU); }, Math.max(2, line * 0.5));
              ctx.save(); ctx.lineWidth = Math.max(3, line * 0.8); ctx.beginPath(); ctx.ellipse(62, y, 36, 24, 0, 0, TAU); ctx.stroke(); ctx.restore();
            }
          },
          windows: [{ x: 150, y: 90, w: 760, h: 760, shape: p.windowShape || 'rounded', r: 20 }],
          caption: { cx: 530, cy: 1010, maxW: 700, maxH: 150, sub: true },
          decor: [[900, 40, 0.3, 0.8], [960, 1120, 0.2, 0.7]], tape: true,
        };
      },
    },
    bubble: {
      layout(p, line) {
        const W = 1000, H = 1180;
        return {
          W, H,
          body: (ctx) => blobBody(ctx, p, (c) => [() => rrPath(c, 0, 0, 1000, 1000, 120), () => { c.moveTo(170, 950); c.lineTo(110, 1180); c.lineTo(400, 950); c.closePath(); }], line),
          windows: [{ x: 80, y: 80, w: 840, h: 620, shape: p.windowShape || 'rounded', r: 40 }],
          caption: { cx: 500, cy: 850, maxW: 800, maxH: 150, sub: true },
          decor: [[40, 40, -0.3], [960, 40, 0.3]], tape: false,
        };
      },
    },
    cup: {
      layout(p, line) {
        const W = 900, H = 1300, body = p.frameColor || '#ffffff';
        const xl = (y) => 40 + 90 * (y - 170) / 1080, xr = (y) => 860 - 90 * (y - 170) / 1080;
        return {
          W, H,
          body: (ctx) => {
            ctx.save(); ctx.lineWidth = Math.max(4, line * 0.8);
            for (const x of [380, 520]) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.bezierCurveTo(x - 40, -40, x + 40, -70, x, -112); ctx.stroke(); }
            ctx.restore();
            shape(ctx, body, () => rrPath(ctx, 300, -2, 300, 84, 26));
            fillBody(ctx, p, () => { ctx.moveTo(40, 170); ctx.lineTo(860, 170); ctx.lineTo(xr(1250), 1250); ctx.quadraticCurveTo(xr(1300), 1300, 700, 1300); ctx.lineTo(200, 1300); ctx.quadraticCurveTo(xl(1300), 1300, xl(1250), 1250); ctx.closePath(); }, line);
            shape(ctx, body, () => rrPath(ctx, 0, 60, 900, 110, 34));
          },
          windows: [{ x: 110, y: 230, w: 680, h: 540, shape: p.windowShape || 'rounded', r: 30 }],
          over: (ctx) => shape(ctx, p.tapeColor || '#dcae7c', () => { ctx.moveTo(xl(820) - 8, 820); ctx.lineTo(xr(820) + 8, 820); ctx.lineTo(xr(1060) + 8, 1060); ctx.lineTo(xl(1060) - 8, 1060); ctx.closePath(); }),
          caption: { cx: 450, cy: 940, maxW: 620, maxH: 120, sub: false },
          sub: { cx: 450, cy: 1160, maxW: 460, maxH: 64 },
          decor: [[46, 940, -0.2, 0.8], [854, 940, 0.2, 0.8]], tape: false,
        };
      },
    },
  };

  /* Little icon stickers on the body at the design's spots ([x, y, rot, size?]). */
  function referenceSpace(ctx) { ctx.rotate(Math.atan2(100, 828)); ctx.translate(-168, -163); }
  let referenceCaptionCache = null;
  function referenceCaption(color) {
    if (!referenceCaptionCache || referenceCaptionCache.color !== color) {
      const c = newCanvas(715, 110), ctx = c.getContext('2d');
      ctx.translate(-60, -748); referenceSpace(ctx); ctx.drawImage(referenceArtwork, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height), rgb = hexToRgb255(color);
      for (let i = 0; i < img.data.length; i += 4) {
        const alpha = clamp((255 - img.data[i]) / (255 - 54), 0, 1);
        img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = alpha * 255;
      }
      ctx.putImageData(img, 0, 0); referenceCaptionCache = { color, canvas: c };
    }
    return referenceCaptionCache.canvas;
  }
  function referenceNotes(ctx) {
    ctx.save(); referenceSpace(ctx); ctx.lineWidth = 6;
    shape(ctx, null, () => { ctx.moveTo(409, 814); ctx.lineTo(407, 761); ctx.lineTo(460, 738); ctx.lineTo(472, 786); ctx.moveTo(419, 771); ctx.lineTo(463, 752); });
    shape(ctx, ctx.strokeStyle, () => ctx.ellipse(407, 814, 13, 18, 0.55, 0, TAU));
    shape(ctx, ctx.strokeStyle, () => ctx.ellipse(463, 791, 13, 17, 0.5, 0, TAU));
    shape(ctx, null, () => { ctx.moveTo(906, 511); ctx.lineTo(893, 468); ctx.bezierCurveTo(899, 488, 932, 457, 934, 487); });
    shape(ctx, ctx.strokeStyle, () => ctx.ellipse(902, 521, 12, 17, 0.4, 0, TAU));
    ctx.restore();
  }
  function referenceDecor(ctx) {
    ctx.save(); referenceSpace(ctx);
    for (const id of ['cafe-teacup', 'cafe-cloud', 'cafe-roll']) {
      const [x, y] = REFERENCE_SPRITES[id].box;
      ctx.save(); ctx.shadowColor = 'rgba(54,59,54,.12)'; ctx.shadowOffsetX = 12; ctx.shadowOffsetY = 13;
      ctx.drawImage(referenceSprite(id), x, y); ctx.restore();
    }
    ctx.strokeStyle = '#363b36'; ctx.lineWidth = 9;
    shape(ctx, '#9bcde8', () => { ctx.moveTo(1114, 533); ctx.bezierCurveTo(1081, 522, 1075, 491, 1094, 482); ctx.bezierCurveTo(1105, 477, 1119, 485, 1126, 489); ctx.bezierCurveTo(1110, 464, 1130, 435, 1150, 442); ctx.bezierCurveTo(1195, 449, 1199, 535, 1140, 539); });
    ctx.lineWidth = 7;
    shape(ctx, null, () => { ctx.moveTo(69, 597); ctx.bezierCurveTo(80, 620, 73, 637, 57, 656); ctx.bezierCurveTo(81, 651, 104, 668, 117, 681); ctx.bezierCurveTo(111, 659, 109, 644, 130, 622); ctx.bezierCurveTo(108, 625, 92, 619, 69, 597); });
    shape(ctx, null, () => { ctx.moveTo(1084, 1000); ctx.bezierCurveTo(1106, 1007, 1125, 991, 1134, 977); ctx.bezierCurveTo(1124, 998, 1125, 1013, 1146, 1033); ctx.bezierCurveTo(1129, 1026, 1110, 1037, 1100, 1051); ctx.bezierCurveTo(1107, 1030, 1101, 1014, 1084, 1000); });
    ctx.restore();
  }
  function drawDecor(ctx, p, spots) {
    const set = DECOR_SETS[p.frameDecor]; if (!set || !spots) return;
    const themed = p.frameDecor === 'cinnamoroll';
    if (themed && p.frameDesign === 'cinnamoroll' && referenceArtwork) { referenceDecor(ctx); return; }
    const style = Object.assign({}, DEFAULT_ICON_STYLE, themed ? iconStyleOf(ICON_PALETTES['Cinnamoroll café']) : {}, { outline: p.frameOutline || '#2b2a33' });
    spots.forEach(([x, y, rot, k], i) => {
      const id = set[i % set.length];
      const img = drawIcon(id, 256, themed && id === 'heart' ? Object.assign({}, style, { accent: style.extra }) : style);
      if (themed && id.startsWith('cafe-') && !referenceArtwork) alphaOutline(img, 12, '#ffffff');
      const s = 140 * (k == null ? 1 : k);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      if (themed && id.startsWith('cafe-')) { ctx.shadowColor = 'rgba(54, 59, 54, .12)'; ctx.shadowOffsetX = 9; ctx.shadowOffsetY = 11; }
      ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore();
    });
  }

  /*
   * Compose the frame. p: the frame's settings (frame* / window* / photo* /
   * tape* keys), photo: the framed sticker's atlas { canvas, sdf, w, h, pad }
   * or null. Returns { canvas, layout } where layout.window is the bounding
   * box of the photo windows in canvas pixels (used for drop targeting).
   */
  /* A lanyard is composed around the frame rather than baked into its artwork.
   * Carry the shifted photo window through to drop targeting and worker output. */
  function withLanyard(out, p) {
    if (!p.frameLanyard || p.frameLanyard === 'none') return out;
    const bodyW = out.layout.W, band = bodyW * .048;
    const length = bodyW * Math.max(.25, Math.min(1.25, Number(p.frameLanyardLength) || .65));
    const hanger = out.layout.hanger || { x: out.canvas.width / 2, y: out.layout.M || 0 };
    const extra = Math.max(0, Math.ceil(length + band * 2 - hanger.y));
    const c = newCanvas(out.canvas.width, out.canvas.height + extra), ctx = c.getContext('2d');
    const cx = hanger.x, bottom = hanger.y + extra, top = bottom - length, half = bodyW * .26;
    const strap = () => {
      ctx.beginPath(); ctx.moveTo(cx, bottom - band * .6); ctx.lineTo(cx - half, top + band * 1.8);
      ctx.bezierCurveTo(cx - half - band * .5, top - band * .5, cx + half + band * .5, top - band * .5, cx + half, top + band * 1.8);
      ctx.lineTo(cx, bottom - band * .6);
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strap(); ctx.strokeStyle = '#302b43'; ctx.lineWidth = band + Math.max(1, band * .08); ctx.stroke();
    strap(); ctx.strokeStyle = p.frameLanyardColor || '#7655d5'; ctx.lineWidth = band; ctx.stroke();
    ctx.save();
    strap(); ctx.strokeStyle = '#ffffff35'; ctx.lineWidth = band * .72; ctx.setLineDash([band * .035, band * .1]); ctx.stroke();
    ctx.restore();
    if (p.frameLanyard === 'striped') {
      ctx.save(); strap(); ctx.strokeStyle = p.frameLanyardTextColor || '#ffffff'; ctx.lineWidth = band * .18; ctx.stroke(); ctx.restore();
    }
    if (p.frameLanyardText) {
      const dx = half, dy = bottom - band * .6 - (top + band * 1.8), usable = Math.hypot(dx, dy) * .66;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(cx + side * half * .53, (bottom - band * .6 + top + band * 1.8) / 2);
        ctx.rotate(side < 0 ? Math.atan2(dy, dx) : -Math.atan2(dy, dx));
        drawLettering(ctx, p.frameLanyardText, 'clean', p.frameLanyardTextColor || '#ffffff', 0, 0, usable, band * .46, false);
        ctx.restore();
      }
    }
    ctx.drawImage(out.canvas, 0, extra);
    ctx.strokeStyle = '#655f71'; ctx.lineWidth = Math.max(1, band * .075);
    shape(ctx, metalFill(ctx, '#d4d8e3', cx - band * .35, bottom - band, band * .7, band), () => rrPath(ctx, cx - band * .35, bottom - band, band * .7, band * 1.06, band * .18));
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = band * .05;
    ctx.beginPath(); ctx.moveTo(cx - band * .19, bottom - band * .8); ctx.lineTo(cx - band * .19, bottom - band * .15); ctx.stroke();
    return { canvas: c, layout: { ...out.layout, hanger: { x: cx, y: bottom }, window: { ...out.layout.window, y: out.layout.window.y + extra } } };
  }
  function composeCustomFrame(p, photo, image, opening) {
    const W = image.width, H = image.height;
    const automatic = p.frameOpening === 'auto' && opening;
    const w = automatic ? { ...opening.window } : {
      x: Math.max(0, Math.min(99, p.frameOpeningX)) / 100 * W,
      y: Math.max(0, Math.min(99, p.frameOpeningY)) / 100 * H,
      w: Math.max(1, Math.min(100, p.frameOpeningW)) / 100 * W,
      h: Math.max(1, Math.min(100, p.frameOpeningH)) / 100 * H,
    };
    w.w = Math.min(w.w, W - w.x); w.h = Math.min(w.h, H - w.y);
    const c = newCanvas(W, H), ctx = c.getContext('2d');
    const mask = newCanvas(W, H), mx = mask.getContext('2d');
    if (automatic) mx.drawImage(opening.mask, 0, 0);
    else { mx.fillStyle = '#fff'; mx.fillRect(w.x, w.y, w.w, w.h); }
    ctx.fillStyle = p.windowFill || '#dbe8fb'; ctx.fillRect(0, 0, W, H);
    if (p.windowPattern && p.windowPattern !== 'none') fillPattern(ctx, w.x, w.y, w.w, w.h, p.windowPattern, p.windowPatternColor || '#fff', (p.windowPatternScale || 1) * Math.max(W, H) / 1024);
    if (photo) drawPhoto(ctx, photo, p, w);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-over';
    const art = newCanvas(W, H), ax = art.getContext('2d'); ax.drawImage(image, 0, 0);
    if (!automatic) { ax.globalCompositeOperation = 'destination-out'; ax.drawImage(mask, 0, 0); }
    ctx.drawImage(art, 0, 0);
    const spine = ax.getImageData(Math.floor(W / 2), 0, 1, H).data;
    let attachY = 0; while (attachY < H - 1 && spine[attachY * 4 + 3] < 128) attachY++;
    return withLanyard({ canvas: c, layout: { M: 0, W, H, hanger: { x: W / 2, y: attachY }, window: { ...w } } }, p);
  }
  function composeFrame(p, photo) {
    const design = DESIGNS[p.frameDesign] || DESIGNS.classic;
    const line = Math.max(0, p.frameLine == null ? 10 : p.frameLine);
    const L = design.layout(p, line);
    const margin = L.margin || M;
    const c = newCanvas(L.W + 2 * margin, L.H + 2 * margin);
    const ctx = c.getContext('2d');
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(margin, margin);
    const pen = () => { ctx.strokeStyle = p.frameOutline || '#2b2a33'; ctx.lineWidth = line; };
    pen();
    L.body(ctx);
    for (const w of L.windows) {
      pen();
      const parts = windowParts(ctx, w.shape, w.x, w.y, w.w, w.h, w.r);
      if (line > 0) { ctx.save(); ctx.lineWidth = line * (w.lineScale || 1.6); for (const pt of parts) { ctx.beginPath(); pt(); ctx.stroke(); } ctx.restore(); }
      ctx.save();
      ctx.beginPath(); for (const pt of parts) pt(); ctx.clip();
      const bx = w.x - w.w * 0.2, by = w.y - w.h * 0.3, bw = w.w * 1.4, bh = w.h * 1.6;
      ctx.fillStyle = p.windowFill || '#dbe8fb'; ctx.fillRect(bx, by, bw, bh);
      if (p.windowPattern && p.windowPattern !== 'none') fillPattern(ctx, bx, by, bw, bh, p.windowPattern, p.windowPatternColor || '#ffffff', (p.windowPatternScale || 1) * 1.6);
      if (w.under) w.under(ctx);
      if (photo) drawPhoto(ctx, photo, p, w);
      ctx.restore();
    }
    pen();
    if (L.over) L.over(ctx);
    pen();
    if (L.caption) drawCaptionBlock(ctx, p, L.caption, L.sub);
    drawDecor(ctx, p, L.decor);
    if (L.tape) drawTape(ctx, p, L.W, L.H);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const w of L.windows) { x0 = Math.min(x0, w.x); y0 = Math.min(y0, w.y); x1 = Math.max(x1, w.x + w.w); y1 = Math.max(y1, w.y + w.h); }
    return withLanyard({ canvas: c, layout: { M: margin, W: L.W, H: L.H,
      hanger: L.hanger ? { x: margin + L.hanger.x, y: margin + L.hanger.y } : { x: c.width / 2, y: margin },
      window: { x: margin + x0, y: margin + y0, w: x1 - x0, h: y1 - y0 } } }, p);
  }

  const framePreviews = new Map();
  function frameThumbnail(name) {
    if (!framePreviews.has(name)) {
      const out = composeFrame({ ...FRAME_PRESETS[name], frameCaption: 'CUTE', frameCaps: true }, null).canvas;
      const preview = newCanvas(180, 184), ctx = preview.getContext('2d');
      const scale = Math.min(180 / out.width, 184 / out.height);
      ctx.drawImage(out, (180 - out.width * scale) / 2, (184 - out.height * scale) / 2, out.width * scale, out.height * scale);
      framePreviews.set(name, preview);
    }
    const c = newCanvas(180, 184); c.getContext('2d').drawImage(framePreviews.get(name), 0, 0); return c;
  }

  /* ------------------------------------------------------------------ */
  /* Composed records: draw → working size → alpha mask → die-cut atlas.   */
  /* Runs on the page or inside the compose worker (js/compose-worker.js). */
  /* ------------------------------------------------------------------ */
  function iconStyleOf(s) {
    return { fill: s.iconFill, accent: s.iconAccent, extra: s.iconExtra, warm: s.iconWarm, brown: s.iconBrown, mint: s.iconMint, outline: s.iconOutline, line: s.iconLine, text: s.iconText, flip: s.iconFlip, face: s.iconFace };
  }
  function scaledWork(source, res) {
    const sc = Math.min(1, res / Math.max(source.width, source.height));
    const w = Math.max(8, Math.round(source.width * sc)), h = Math.max(8, Math.round(source.height * sc));
    const c = newCanvas(w, h);
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  }
  /*
   * The die-cut pipeline for a drawing whose alpha is the mask (the same
   * steps as the photo pipeline in app.js). `variant` is an optional second
   * drawing with the same silhouette (closed eyes). Pixel data comes back as
   * plain arrays so it can cross a worker boundary.
   */
  /*
   * The die-cut pipeline. work: the drawing (RGBA at working size), mask: its soft
   * alpha, s: the cutout settings, variant: a second drawing with the same shape
   * (an icon with its eyes closed), frames: further frames of an animated picture,
   * each { data, w, h, mask } with its own shape. Every frame is cut on its own, so
   * a moving picture keeps its transparency; they share one atlas rectangle that
   * holds all of them, so their textures line up.
   */
  function cutout(work, mask, s, variant, frames) {
    const M = (typeof window !== 'undefined' ? window : self).MaskOps;
    const w = work.w, h = work.h, n = w * h;
    const scale = Math.max(w, h) / 1024;
    /* soft mask (+ the drawing as the guide) → the die (bin) and the pixel alpha, following the settings */
    const shape = (m, data) => {
      let soft = m;
      if (s.edgeRefine) soft = M.guidedFilter(data, m, w, h, Math.max(1, Math.round(s.refineRadius * Math.max(w, h) / 1024)), 0.004);
      let bin = M.threshold(soft, 0.5);
      if (s.outlineSmooth > 0) bin = M.smoothOutline(bin, w, h, s.outlineSmooth * scale);
      if (s.keepLargest) bin = M.keepLargest(bin, w, h, 0.04);
      if (s.fillHoles) bin = M.fillHoles(bin, w, h, 0.02);
      if (s.outlineOffset !== 0) bin = M.offset(bin, w, h, s.outlineOffset * scale);
      const sd = M.signedDistance(bin, w, h);
      let alpha = new Float32Array(n);
      for (let i = 0; i < n; i++) alpha[i] = sd[i] > 1.5 ? 1 : sd[i] > -1.5 ? Math.max(soft[i], sd[i] > 0.5 ? 0.5 : 0) : 0;
      if (s.feather > 0) alpha = M.gaussianBlur(alpha, w, h, s.feather * scale);
      return { bin, alpha };
    };
    const main = shape(mask, work.data);
    const extra = frames ? frames.map((fr) => shape(fr.mask, fr.data)) : null;
    const pad = Math.round(120 * scale);
    // one atlas rectangle around every frame's die
    let bb = M.bbox(main.bin, w, h) || { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
    if (extra) for (const e of extra) { const b = M.bbox(e.bin, w, h); if (b) bb = { x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1) }; }
    const ax0 = bb.x0 - pad, ay0 = bb.y0 - pad, aw = bb.x1 - bb.x0 + 1 + pad * 2, ah = bb.y1 - bb.y0 + 1 + pad * 2;
    /* a drawing through a shape → premultiplied atlas pixels, and (when asked) the shape's distance field */
    const paint = (src, shp, withSdf) => {
      const out = new Uint8ClampedArray(aw * ah * 4);
      const abin = withSdf ? new Uint8Array(aw * ah) : null;
      for (let y = 0; y < ah; y++) {
        const sy = y + ay0; if (sy < 0 || sy >= h) continue;
        for (let x = 0; x < aw; x++) {
          const sx = x + ax0; if (sx < 0 || sx >= w) continue;
          const i = sy * w + sx, a = shp.alpha[i];
          if (abin) abin[y * aw + x] = shp.bin[i];
          if (a <= 0) continue;
          const o = (y * aw + x) * 4;
          out[o] = src[i * 4] * a; out[o + 1] = src[i * 4 + 1] * a; out[o + 2] = src[i * 4 + 2] * a; out[o + 3] = a * 255;
        }
      }
      return { data: out, w: aw, h: ah, sdf: abin ? M.signedDistance(abin, aw, ah) : null };
    };
    const image = paint(work.data, main, true);
    const blink = variant ? paint(variant.data, main, false) : null;
    const more = extra ? extra.map((e, k) => paint(frames[k].data, e, true)) : null;
    return { image: { data: image.data, w: aw, h: ah }, blink: blink ? { data: blink.data, w: aw, h: ah } : null, frames: more, sdf: image.sdf, w: aw, h: ah, x0: ax0, y0: ay0, scale, pad };
  }

  /*
   * spec: { kind: 'icon' | 'frame', icon, settings, photo: { data, sdf, w, h, pad } | null, workingRes }
   * → { source: {width, height}, work: {width, height}, mask, atlas, layout }
   */
  function buildComposed(spec) {
    const s = spec.settings;
    let source, variant = null, layout = null, frames = null;
    if (spec.kind === 'icon') {
      const style = iconStyleOf(s);
      const pics = spec.frames && spec.frames.length ? spec.frames : spec.image ? [spec.image] : null;
      if (pics) style.image = pics[0];   // pixel art rides along with the spec
      const iconSize = spec.icon === 'imported' ? Math.min(1536, parseInt(spec.workingRes, 10) || 1024) : 512;
      source = drawIcon(spec.icon, iconSize, style);
      if (s.iconBlink && canBlink(spec.icon, style.face)) variant = drawIcon(spec.icon, 512, style, { blink: true });
      // an animated picture: every further frame drawn the same way, each cut on its own shape
      if (pics && pics.length > 1) frames = pics.slice(1).map((img) => drawIcon(spec.icon, iconSize, Object.assign({}, style, { image: img })));
    } else {
      let photo = null;
      if (spec.photo) {
        const c = newCanvas(spec.photo.w, spec.photo.h);
        c.getContext('2d').putImageData(new ImageData(spec.photo.data, spec.photo.w, spec.photo.h), 0, 0);
        photo = { canvas: c, sdf: spec.photo.sdf, w: spec.photo.w, h: spec.photo.h, pad: spec.photo.pad };
      }
      const out = spec.image ? composeCustomFrame(s, photo, spec.image, spec.frameArtwork) : composeFrame(s, photo);
      source = out.canvas; layout = out.layout;
    }
    const res = parseInt(spec.workingRes, 10) || 1024;
    const work = scaledWork(source, res);
    const v = variant ? scaledWork(variant, res) : null;
    const fw = frames ? frames.map((f) => scaledWork(f, res)).filter((f) => f.w === work.w && f.h === work.h) : null;
    const alphaOf = (img) => { const d = img.data, m = new Float32Array(img.w * img.h); for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255; return m; };
    const mask = alphaOf(work);
    const fr = fw && fw.length ? fw.map((f) => ({ data: f.data, w: f.w, h: f.h, mask: alphaOf(f) })) : null;   // every frame cut on its own shape
    const atlas = cutout(work, mask, s, v && v.w === work.w && v.h === work.h ? v : null, fr);
    return { source: { width: source.width, height: source.height }, work: { width: work.w, height: work.h }, mask, atlas, layout, durations: fw && fw.length ? spec.durations || null : null };
  }

  /* Ask the browser for the caption font; resolves true once it is usable. */
  function loadFonts() {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve(false);
    return Promise.all([document.fonts.load('40px "Patrick Hand"'), document.fonts.load('40px "Varela Round"')])
      .then((sets) => sets.some((s) => s.length > 0)).catch(() => false);
  }

  const referenceReady = (async () => {
    try {
      const base = hasDOM ? document.baseURI : new URL('../', self.location.href);
      const url = new URL('reference/4b50b771996bfdfbc32bf74cd2861190.png', base);
      if (hasDOM) {
        const img = new Image(); img.src = url.href; await img.decode(); referenceArtwork = img;
      } else {
        const response = await fetch(url); if (!response.ok) return false;
        referenceArtwork = await createImageBitmap(await response.blob());
      }
      for (const key of Object.keys(thumbs)) if (key.startsWith('cafe-')) delete thumbs[key];
      return true;
    } catch (e) { return false; } // The vector drawings remain usable offline if the source is missing.
  })();

  return {
    ICONS, ICON_GROUPS, iconById, drawIcon, hasFace, canBlink, thumbnail, DEFAULT_ICON_STYLE, ICON_PALETTES, iconStyleOf, buildComposed,
    composeFrame, frameThumbnail, FRAME_COLLECTION, DESIGN_OPTIONS, FRAME_STYLE_OPTIONS, EDGE_OPTIONS, WINDOW_OPTIONS, DECOR_OPTIONS, TAPE_OPTIONS, FRAME_PRESETS,
    PATTERN_OPTIONS, patternTile, fillPattern, THEMES,
    FONTS, FONT_OPTIONS, loadFonts, referenceReady,
  };
})();
