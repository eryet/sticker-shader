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
    { title: 'Café & sweets', ids: ['roll', 'teacup', 'mug', 'cupcake', 'macaron', 'pancakes', 'donut', 'cinnamon', 'softserve', 'cookie', 'milk', 'candy', 'strawberry', 'cherry'] },
    { title: 'Sky', ids: ['cloud', 'cloudface', 'rainbow', 'star', 'sparkle', 'sparkles', 'moon', 'raindrop', 'umbrella', 'balloon'] },
    { title: 'Cute', ids: ['heart', 'bow', 'flower', 'crown', 'paw', 'ghost', 'letter', 'note', 'notes'] },
    { title: 'With text', ids: ['ticket', 'bubble', 'tag', 'sign'] },
  ];

  /* Colour sets for icons: the sky-blue / white / soft pink / cinnamon one is the default. */
  const ICON_PALETTES = {
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
    if (faceOn) { ctx.lineWidth = lw; face(ctx, style, def.face[0], def.face[1], def.face[2], !!def.face[3], !!opts.blink); }
    if (def.outlineFromAlpha && lw > 0.01) alphaOutline(c, lw * 0.7 * k, style.outline);
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
      ctx.drawImage(drawIcon(id, size * 2, DEFAULT_ICON_STYLE), 0, 0);
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
  const WINDOW_OPTIONS = [['rounded', 'Rounded'], ['square', 'Square'], ['circle', 'Circle'], ['arch', 'Arch'], ['heart', 'Heart'], ['cloud', 'Cloud']];
  const DESIGN_OPTIONS = [
    ['classic', 'Classic card'], ['film', 'Film strip'], ['booth', 'Photo booth strip'], ['heart', 'Heart'],
    ['badge', 'Round badge'], ['envelope', 'Love letter'], ['tv', 'Retro TV'], ['bookmark', 'Bookmark'], ['notebook', 'Notebook page'],
    ['bubble', 'Speech bubble'], ['cup', 'Coffee cup'],
  ];
  const DECOR_OPTIONS = [['none', 'None'], ['clouds', 'Clouds'], ['hearts', 'Hearts'], ['stars', 'Stars'], ['sparkles', 'Sparkles'], ['bows', 'Bows'], ['rolls', 'Cinnamon rolls'], ['cafe', 'Café mix'], ['sky', 'Sky mix']];
  const DECOR_SETS = {
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
  };

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
  const DESIGNS = {
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
  function drawDecor(ctx, p, spots) {
    const set = DECOR_SETS[p.frameDecor]; if (!set || !spots) return;
    const style = Object.assign({}, DEFAULT_ICON_STYLE, { outline: p.frameOutline || '#2b2a33' });
    spots.forEach(([x, y, rot, k], i) => {
      const img = drawIcon(set[i % set.length], 256, style);
      const s = 140 * (k == null ? 1 : k);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore();
    });
  }

  /*
   * Compose the frame. p: the frame's settings (frame* / window* / photo* /
   * tape* keys), photo: the framed sticker's atlas { canvas, sdf, w, h, pad }
   * or null. Returns { canvas, layout } where layout.window is the bounding
   * box of the photo windows in canvas pixels (used for drop targeting).
   */
  function composeFrame(p, photo) {
    const design = DESIGNS[p.frameDesign] || DESIGNS.classic;
    const line = Math.max(0, p.frameLine == null ? 10 : p.frameLine);
    const L = design.layout(p, line);
    const c = newCanvas(L.W + 2 * M, L.H + 2 * M);
    const ctx = c.getContext('2d');
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(M, M);
    const pen = () => { ctx.strokeStyle = p.frameOutline || '#2b2a33'; ctx.lineWidth = line; };
    pen();
    L.body(ctx);
    for (const w of L.windows) {
      pen();
      const parts = windowParts(ctx, w.shape, w.x, w.y, w.w, w.h, w.r);
      if (line > 0) { ctx.save(); ctx.lineWidth = line * 1.6; for (const pt of parts) { ctx.beginPath(); pt(); ctx.stroke(); } ctx.restore(); }
      ctx.save();
      ctx.beginPath(); for (const pt of parts) pt(); ctx.clip();
      const bx = w.x - w.w * 0.2, by = w.y - w.h * 0.3, bw = w.w * 1.4, bh = w.h * 1.6;
      ctx.fillStyle = p.windowFill || '#dbe8fb'; ctx.fillRect(bx, by, bw, bh);
      if (p.windowPattern && p.windowPattern !== 'none') fillPattern(ctx, bx, by, bw, bh, p.windowPattern, p.windowPatternColor || '#ffffff', (p.windowPatternScale || 1) * 1.6);
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
    return { canvas: c, layout: { M, W: L.W, H: L.H, window: { x: M + x0, y: M + y0, w: x1 - x0, h: y1 - y0 } } };
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
  function cutout(work, mask, s, variant) {
    const M = (typeof window !== 'undefined' ? window : self).MaskOps;
    const w = work.w, h = work.h, n = w * h;
    let soft = mask;
    if (s.edgeRefine) soft = M.guidedFilter(work.data, mask, w, h, Math.max(1, Math.round(s.refineRadius * Math.max(w, h) / 1024)), 0.004);
    let bin = M.threshold(soft, 0.5);
    const scale = Math.max(w, h) / 1024;
    if (s.outlineSmooth > 0) bin = M.smoothOutline(bin, w, h, s.outlineSmooth * scale);
    if (s.keepLargest) bin = M.keepLargest(bin, w, h, 0.04);
    if (s.fillHoles) bin = M.fillHoles(bin, w, h, 0.02);
    if (s.outlineOffset !== 0) bin = M.offset(bin, w, h, s.outlineOffset * scale);
    const sd = M.signedDistance(bin, w, h);
    let alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) alpha[i] = sd[i] > 1.5 ? 1 : sd[i] > -1.5 ? Math.max(soft[i], sd[i] > 0.5 ? 0.5 : 0) : 0;
    if (s.feather > 0) alpha = M.gaussianBlur(alpha, w, h, s.feather * scale);
    const pad = Math.round(120 * scale);
    const bb = M.bbox(bin, w, h) || { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
    const ax0 = bb.x0 - pad, ay0 = bb.y0 - pad, aw = bb.x1 - bb.x0 + 1 + pad * 2, ah = bb.y1 - bb.y0 + 1 + pad * 2;
    const abin = new Uint8Array(aw * ah);
    const paint = (src, fillBin) => {
      const out = new Uint8ClampedArray(aw * ah * 4);
      for (let y = 0; y < ah; y++) {
        const sy = y + ay0; if (sy < 0 || sy >= h) continue;
        for (let x = 0; x < aw; x++) {
          const sx = x + ax0; if (sx < 0 || sx >= w) continue;
          const i = sy * w + sx, a = alpha[i];
          if (fillBin) abin[y * aw + x] = bin[i];
          if (a <= 0) continue;
          const o = (y * aw + x) * 4;
          out[o] = src[i * 4] * a; out[o + 1] = src[i * 4 + 1] * a; out[o + 2] = src[i * 4 + 2] * a; out[o + 3] = a * 255;
        }
      }
      return { data: out, w: aw, h: ah };
    };
    const image = paint(work.data, true);
    const blink = variant ? paint(variant.data, false) : null;
    const sdf = M.signedDistance(abin, aw, ah);
    return { image, blink, sdf, w: aw, h: ah, x0: ax0, y0: ay0, scale, pad };
  }
  /*
   * spec: { kind: 'icon' | 'frame', icon, settings, photo: { data, sdf, w, h, pad } | null, workingRes }
   * → { source: {width, height}, work: {width, height}, mask, atlas, layout }
   */
  function buildComposed(spec) {
    const s = spec.settings;
    let source, variant = null, layout = null;
    if (spec.kind === 'icon') {
      const style = iconStyleOf(s);
      source = drawIcon(spec.icon, 512, style);
      if (s.iconBlink && canBlink(spec.icon, style.face)) variant = drawIcon(spec.icon, 512, style, { blink: true });
    } else {
      let photo = null;
      if (spec.photo) {
        const c = newCanvas(spec.photo.w, spec.photo.h);
        c.getContext('2d').putImageData(new ImageData(spec.photo.data, spec.photo.w, spec.photo.h), 0, 0);
        photo = { canvas: c, sdf: spec.photo.sdf, w: spec.photo.w, h: spec.photo.h, pad: spec.photo.pad };
      }
      const out = composeFrame(s, photo);
      source = out.canvas; layout = out.layout;
    }
    const res = parseInt(spec.workingRes, 10) || 1024;
    const work = scaledWork(source, res);
    const v = variant ? scaledWork(variant, res) : null;
    const d = work.data, n = work.w * work.h, mask = new Float32Array(n);
    for (let i = 0; i < n; i++) mask[i] = d[i * 4 + 3] / 255;
    const atlas = cutout(work, mask, s, v && v.w === work.w && v.h === work.h ? v : null);
    return { source: { width: source.width, height: source.height }, work: { width: work.w, height: work.h }, mask, atlas, layout };
  }

  /* Ask the browser for the caption font; resolves true once it is usable. */
  function loadFonts() {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve(false);
    return Promise.all([document.fonts.load('40px "Patrick Hand"'), document.fonts.load('40px "Varela Round"')])
      .then((sets) => sets.some((s) => s.length > 0)).catch(() => false);
  }

  return {
    ICONS, ICON_GROUPS, iconById, drawIcon, hasFace, canBlink, thumbnail, DEFAULT_ICON_STYLE, ICON_PALETTES, iconStyleOf, buildComposed,
    composeFrame, DESIGN_OPTIONS, FRAME_STYLE_OPTIONS, EDGE_OPTIONS, WINDOW_OPTIONS, DECOR_OPTIONS, TAPE_OPTIONS, FRAME_PRESETS,
    PATTERN_OPTIONS, patternTile, fillPattern, THEMES,
    FONTS, FONT_OPTIONS, loadFonts,
  };
})();
