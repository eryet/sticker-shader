/* Live shaker physics. Drawing and collision walls use the same geometry. */
globalThis.StickerShaker = (() => {
  const DURATION = 4000, LIMIT = 48, BASE_CAPACITY = 12, STEP = 1 / 120;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const COLLECTIONS = {
    classic: [['round', 'Round'], ['square', 'Rounded square'], ['capsule', 'Capsule'], ['heart', 'Heart'], ['star', 'Star']],
    taiwan: [['tw-boba', 'Bubble tea'], ['tw-lantern', 'Festival lantern'], ['tw-pineapple', 'Pineapple'], ['tw-charm', 'Peace charm'], ['tw-tea', 'Tea tin'], ['tw-street', 'Corner shop sign'], ['tw-island', 'Taiwan island']],
  };
  const DESIGNS = Object.values(COLLECTIONS).flat();
  const COLORS = { 'tw-boba': '#efc49e', 'tw-lantern': '#ee786d', 'tw-pineapple': '#edc967', 'tw-charm': '#e9829a', 'tw-tea': '#8dabc9', 'tw-street': '#e88976', 'tw-island': '#94b892' };
  const ILLUSTRATED_FINISH = { materialDepth: .28, materialTexture: .05, materialOpacity: .12, materialTint: '#fff7ed', gloss: .3, specular: .15, fresnel: .04, bevel: .12, metallic: 0, grain: .045 };
  const collectionOf = name => COLORS[name] ? 'taiwan' : 'classic';
  const shellScale = settings => clamp(Number(settings.stickerScale) || .8, .1, 2.5);
  // Old scenes capture their current scale on load so their existing artwork keeps its size.
  const contentScale = settings => clamp(Number(settings.shakerContentScale) || shellScale(settings), .1, 2.5);
  function capacity(settings = {}) {
    const growth = shellScale(settings) / contentScale(settings);
    return clamp(Math.floor(BASE_CAPACITY * growth * growth + 1e-8), BASE_CAPACITY, LIMIT);
  }
  function roundedPolygon(vertices, r = 2.5) {
    return vertices.flatMap(([x, y], i) => {
      const prev = vertices[(i + vertices.length - 1) % vertices.length], next = vertices[(i + 1) % vertices.length];
      const start = Math.min(r / Math.hypot(prev[0] - x, prev[1] - y), .4), end = Math.min(r / Math.hypot(next[0] - x, next[1] - y), .4);
      const ax = x + (prev[0] - x) * start, ay = y + (prev[1] - y) * start, bx = x + (next[0] - x) * end, by = y + (next[1] - y) * end;
      return Array.from({ length: 5 }, (_, k) => { const t = k / 4, u = 1 - t; return [u * u * ax + 2 * u * t * x + t * t * bx, u * u * ay + 2 * u * t * y + t * t * by]; });
    });
  }
  const canvas = size => {
    const c = typeof document === 'undefined' ? new OffscreenCanvas(size, size) : document.createElement('canvas');
    c.width = c.height = size; return c;
  };
  const geometryCache = new Map();
  function geometry(name = 'round') {
    if (!DESIGNS.some(([id]) => id === name)) name = 'round';
    if (geometryCache.has(name)) return geometryCache.get(name);
    const points = [];
    const box = ({ square: [29, 28.5, 4], capsule: [23, 28.5, 20], 'tw-lantern': [22, 19, 18.5], 'tw-pineapple': [18.8, 21.5, 15.5], 'tw-tea': [22, 22, 7], 'tw-street': [25.5, 17, 4.5] })[name];
    if (name === 'round') for (let i = 0; i < 80; i++) { const a = i / 80 * Math.PI * 2; points.push([Math.cos(a) * 28.8, Math.sin(a) * 28.8]); }
    if (box) {
      const [w, h, r] = box;
      for (let corner = 0; corner < 4; corner++) {
        const cx = [1, -1, -1, 1][corner] * (w - r), cy = [1, 1, -1, -1][corner] * (h - r);
        for (let k = 0; k <= 12; k++) { const a = (corner + k / 12) * Math.PI / 2; points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      }
    }
    if (name === 'heart') for (let i = 0; i < 80; i++) {
      const a = i / 80 * Math.PI * 2;
      points.push([Math.pow(Math.sin(a), 3) * 29, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * 1.9 - 4]);
    }
    if (name === 'star') for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 17.8 : 30; points.push([Math.cos(a) * r, Math.sin(a) * r]); }
    if (name === 'tw-boba') points.push(...roundedPolygon([[-22, -18], [22, -18], [18, 22], [-18, 22]], 4));
    if (name === 'tw-charm') points.push(...roundedPolygon([[-13, -21], [13, -21], [21, -11], [24, 12], [20, 23], [-18, 23], [-24, 13], [-21, -10]], 5));
    if (name === 'tw-island') points.push(...roundedPolygon([[-12, 29], [-17, 20], [-21, 8], [-20, -2], [-15, -12], [-5, -23], [8, -29], [17, -28], [21, -24], [18, -20], [16, -8], [10, 6], [0, 20], [-9, 30]].map(([x, y]) => [x * 1.07, y * .96]), 2.6));
    const turns = points.map((a, i) => { const b = points[(i + 1) % points.length], c = points[(i + 2) % points.length]; return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); });
    const concave = turns.some(v => v > .001) && turns.some(v => v < -.001);
    const segments = points.map(([ax, ay], i) => {
      const [bx, by] = points[(i + 1) % points.length], dx = bx - ax, dy = by - ay;
      return { ax, ay, by, dx, dy, inv: 1 / (dx * dx + dy * dy || 1) };
    });
    const g = { name, points, segments, box, concave, rimScale: name === 'tw-island' ? 1.16 : 1.42, safe: { x: 0, y: 0, radius: 0 } };
    if (concave || COLORS[name]) {
      // Largest clear spot gives oversized artwork a safe limit for free rotation.
      for (let x = -14; x <= 14; x += 2) for (let y = -12; y <= 16; y += 2) {
        const radius = distance(g, x, y).d;
        if (radius > g.safe.radius) g.safe = { x, y, radius };
      }
    } else g.safe.radius = distance(g, 0, 0).d;
    geometryCache.set(name, g); return g;
  }
  function boundary(ctx, g, scale = 1) {
    ctx.beginPath(); g.points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](50 + x * scale, 63 + y * scale)); ctx.closePath();
  }
  // Positive inside, with a normal pointing back into the chamber.
  function distance(g, x, y) {
    if (g.name === 'round') { const d = Math.hypot(x, y); return { d: 28.8 - d, nx: d ? -x / d : 1, ny: d ? -y / d : 0 }; }
    if (g.box) {
      const [w, h, r] = g.box;
      const qx = Math.abs(x) - (w - r), qy = Math.abs(y) - (h - r), ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy);
      return { d: r - len - Math.min(Math.max(qx, qy), 0), nx: -(len ? ox / len : qx > qy ? 1 : 0) * Math.sign(x || 1), ny: -(len ? oy / len : qy >= qx ? 1 : 0) * Math.sign(y || 1) };
    }
    let inside = false, best = Infinity, px = 0, py = 0;
    for (let i = 0; i < g.segments.length; i++) {
      const { ax, ay, by, dx, dy, inv } = g.segments[i];
      if ((ay > y) !== (by > y) && x < dx * (y - ay) / dy + ax) inside = !inside;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) * inv, 0, 1), ex = ax + t * dx, ey = ay + t * dy;
      const d = (x - ex) ** 2 + (y - ey) ** 2; if (d < best) { best = d; px = ex; py = ey; }
    }
    const len = Math.sqrt(best), sign = inside ? 1 : -1;
    return { d: sign * len, nx: len ? (x - px) / len * sign : 0, ny: len ? (y - py) / len * sign : -1 };
  }
  const CREAM = '#fff4dc', ROSE = '#d96268', LEAF = '#628d70';
  function blob(ctx, path, fill, edge = false) {
    const p = new Path2D(path);
    if (edge) { ctx.strokeStyle = CREAM; ctx.lineWidth = 1.9; ctx.stroke(p); }
    ctx.fillStyle = fill; ctx.fill(p);
  }
  function patch(ctx, x, y, w, h, fill, r = 3) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  }
  function lettering(ctx, text, x, y, color, size = 5) {
    ctx.fillStyle = color; ctx.font = `900 ${size}px "DFKai-SB", "KaiTi", "Microsoft JhengHei", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [...text].forEach((char, i) => {
      ctx.save(); ctx.translate(x + (i - (text.length - 1) / 2) * size * 1.12, y + (i % 2 ? .3 : -.2));
      ctx.rotate(i % 2 ? .045 : -.035); ctx.fillText(char, 0, 0); ctx.restore();
    });
  }
  function leaf(ctx, x, y, size, angle, color = LEAF) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(size, size);
    blob(ctx, 'M0 0 Q-1.2 -1.6 .1 -3 Q1.4 -1.5 0 0Z', color);
    ctx.strokeStyle = '#dce5b278'; ctx.lineWidth = .11; ctx.stroke(new Path2D('M0 -.25 Q.12 -1.2 .08 -2.3'));
    ctx.restore();
  }
  function flower(ctx, x, y, r, color = CREAM, centre = '#edbd61', rotation = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(i * Math.PI * 2 / 5); ctx.scale(r, r);
      blob(ctx, 'M-.14 .15 C-.75 -.05 -.69 -.72 -.32 -.92 C.09 -1.17 .56 -.78 .42 -.34 Q.3 .15 -.14 .15Z', color);
      ctx.restore();
    }
    ctx.fillStyle = centre; ctx.beginPath(); ctx.ellipse(0, 0, r * .34, r * .3, .3, 0, Math.PI * 2); ctx.fill();
    if (r > 3.3) {
      ctx.fillStyle = '#fff5dba6';
      for (const [dx, dy] of [[-.12, -.08], [.12, .06], [0, .14]]) { ctx.beginPath(); ctx.arc(dx * r, dy * r, r * .065, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
  function floral(ctx, x, y, r, color, centre, angle = 0) {
    leaf(ctx, x - r * .45, y + r * .65, r * .6, -1.9);
    leaf(ctx, x + r * .3, y + r * .45, r * .53, 1.5, '#94ae7c');
    flower(ctx, x, y, r, color, centre, angle);
  }
  function bow(ctx, x, y, color = '#a1bbae') {
    ctx.save(); ctx.translate(x, y);
    blob(ctx, 'M0 0 C-5 -8 -13 -7 -11 -1 Q-8 4 0 0 C4 -7 13 -8 11 -1 Q8 4 0 0Z', color, true);
    blob(ctx, 'M-1 0 Q-1 7 -6 10 L-7 6 -10 6 Q-5 3 -4 0Z M1 0 Q2 7 7 9 L7 5 10 5 Q5 2 4 0Z', color);
    ctx.strokeStyle = '#ccaa7480'; ctx.lineWidth = .65; ctx.stroke(new Path2D('M-3 -1 Q-7 -3 -9 -2 M3 -1 Q7 -3 9 -2 M-3 2 L-6 6 M3 2 L6 5'));
    patch(ctx, -1.7, -2.2, 3.4, 4.4, '#f9e4ba', 1.4); ctx.restore();
  }
  // A slightly uneven, generous printed border surrounds the exact collision wall.
  function paintedBoundary(ctx, g, scale = g.rimScale) {
    ctx.beginPath();
    g.points.forEach(([x, y], i) => {
      const a = Math.atan2(y, x), wobble = 1 + Math.sin(a * 7 + 1) * .009 + Math.cos(a * 11) * .005;
      ctx[i ? 'lineTo' : 'moveTo'](50 + x * scale * wobble, 63 + y * scale * wobble);
    });
    ctx.closePath();
  }
  function rimClip(ctx, g) {
    paintedBoundary(ctx, g);
    g.points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](50 + x, 63 + y)); ctx.closePath(); ctx.clip('evenodd');
  }
  function cottonLoop(ctx, name, color) {
    ctx.save(); ctx.translate(name === 'tw-island' ? 11 : 0, 0);
    ctx.lineJoin = ctx.lineCap = 'round';
    const loop = new Path2D('M49 23 C34 22 37 4 49 4 C64 3 67 23 51 23');
    ctx.strokeStyle = '#c69b84'; ctx.lineWidth = 4.7; ctx.stroke(loop);
    ctx.strokeStyle = '#f4d4b1'; ctx.lineWidth = 3.4; ctx.stroke(loop);
    ctx.strokeStyle = '#fff3db'; ctx.lineWidth = .8; ctx.stroke(new Path2D('M40 14 Q39 6 48 6 M55 21 Q60 19 60 15'));
    // A small sewn tab and oval link meet the shell instead of a bulky knot.
    blob(ctx, 'M47 26 Q50 24 53 26 L54 34 Q50 37 46 34Z', color, true);
    ctx.strokeStyle = '#fff1d4'; ctx.lineWidth = .65; ctx.setLineDash([.7, 1]);
    ctx.stroke(new Path2D('M48 29 L48 33 Q50 34 52 33 L52 29')); ctx.setLineDash([]);
    ctx.strokeStyle = '#c69b84'; ctx.lineWidth = 2.3; ctx.beginPath(); ctx.ellipse(50, 25, 2.8, 4.5, -.09, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = CREAM; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  // These details are printed on the casing; nothing is added to the chamber.
  function taiwanExtras(ctx, name, color, foreground) {
    if (!foreground) {
      cottonLoop(ctx, name, color);
      if (name === 'tw-boba') {
        ctx.strokeStyle = CREAM; ctx.lineWidth = 8; ctx.stroke(new Path2D('M62 40 L65 22 77 18'));
        ctx.strokeStyle = ROSE; ctx.lineWidth = 5.5; ctx.stroke(new Path2D('M62 40 L65 22 77 18'));
        ctx.strokeStyle = '#f7c8b1'; ctx.lineWidth = 2;
        for (const [x, y] of [[63, 31], [64, 26], [69, 21], [74, 19]]) { ctx.beginPath(); ctx.moveTo(x - 1.9, y - 1); ctx.lineTo(x + 1.9, y + 1); ctx.stroke(); }
      }
      if (name === 'tw-lantern') {
        patch(ctx, 35, 28, 30, 11, '#e9b75c', 4); patch(ctx, 36, 31, 27, 3, '#f7d890', 1.5);
        patch(ctx, 39, 85, 22, 6, '#c94f50', 2.5);
        ctx.strokeStyle = '#e9b75c'; ctx.lineWidth = 3.4; ctx.stroke(new Path2D('M50 88 L50 93'));
        blob(ctx, 'M47 91 Q50 90 53 91 L58 97 Q50 98.5 42 97Z', '#e9b75c', true);
        ctx.strokeStyle = '#f9d999'; ctx.lineWidth = .8;
        for (let x = 45; x <= 55; x += 2.5) { ctx.beginPath(); ctx.moveTo(50 + (x - 50) * .3, 93); ctx.lineTo(x, 96.8); ctx.stroke(); }
      }
      if (name === 'tw-pineapple') {
        blob(ctx, 'M49 41 Q28 39 28 27 Q39 24 46 34 Q36 20 39 17 Q50 21 51 34 Q48 18 54 17 Q62 23 55 35 Q66 22 72 27 Q72 38 55 43Z', '#69926f', true);
        blob(ctx, 'M48 39 Q39 33 36 29 Q45 28 50 37 Q49 25 53 22 Q59 31 54 39 Q61 31 67 30 Q64 39 54 43Z', '#a9bd86');
        ctx.strokeStyle = '#d8dcb287'; ctx.lineWidth = .7; ctx.stroke(new Path2D('M50 40 Q42 33 35 29 M53 38 L53 25 M55 40 L65 31'));
      }
      if (name === 'tw-charm') {
        blob(ctx, 'M31 39 Q29 31 34 28 Q39 31 42 27 Q47 30 51 27 Q55 31 60 28 Q64 31 69 29 Q73 33 68 39Z', color, true);
        ctx.strokeStyle = '#c95e79'; ctx.lineWidth = 1.2; ctx.stroke(new Path2D('M37 32 L39 39 M46 32 L46 38 M57 31 L56 39 M64 33 L61 39'));
      }
      if (name === 'tw-tea') patch(ctx, 41, 27, 18, 7, '#809ab4', 3);
      if (name === 'tw-street') {
        ctx.strokeStyle = '#91a897'; ctx.lineWidth = 3; ctx.stroke(new Path2D('M25 42 L47 29 Q50 27 53 29 L75 42'));
      }
      return;
    }
    if (name === 'tw-boba') {
      blob(ctx, 'M20 37 Q20 34 25 34 L77 34 Q82 34 81 39 L80 43 Q77 45 73 44 L25 44 Q18 44 20 37Z', '#8aaf9b', true);
      ctx.strokeStyle = '#c8d3ad'; ctx.lineWidth = 1.7; ctx.stroke(new Path2D('M24 37 Q47 36 76 37'));
      patch(ctx, 39, 35, 22, 10, CREAM, 3); lettering(ctx, '珍奶', 50, 40.5, '#b3665b', 7.2);
      flower(ctx, 29, 39, 3.2, CREAM, '#d48a80'); flower(ctx, 70, 39, 3.1, '#edb3ac', CREAM, .2);
    }
    if (name === 'tw-lantern') {
      ctx.save(); ctx.translate(50, 35); ctx.rotate(-.07); patch(ctx, -7, -6, 14, 11, '#f9d58c', 3); lettering(ctx, '福', 0, 0, '#b84e4d', 9); ctx.restore();
      ctx.strokeStyle = '#f8d68d'; ctx.lineWidth = 1.2;
      for (const x of [24, 76]) {
        ctx.save(); ctx.translate(x, 61);
        ctx.stroke(new Path2D('M0 0 C-7 -6 5 -7 0 0 C6 -7 7 5 0 0 C7 6 -5 7 0 0 C-6 7 -7 -5 0 0 M0 3 L0 6'));
        ctx.restore();
      }
    }
    if (name === 'tw-pineapple') {
      floral(ctx, 68, 43, 4.8, CREAM, '#d48967', .3);
      patch(ctx, 43.5, 85.7, 13, 7.5, CREAM, 2.5); ctx.strokeStyle = '#dfb46f'; ctx.lineWidth = .55; ctx.stroke(new Path2D('M46 87 L54 87')); lettering(ctx, '旺', 50, 89.7, '#a47c43', 6.2);
    }
    if (name === 'tw-charm') {
      bow(ctx, 50, 33.2, '#f6dba6');
      ctx.save(); ctx.translate(51, 91); ctx.rotate(-.055); patch(ctx, -10, -4.4, 20, 9, CREAM, 2); lettering(ctx, '平安', 0, .2, '#c56475', 6.8); ctx.restore();
    }
    if (name === 'tw-tea') {
      blob(ctx, 'M20 36 Q19 32 24 32 Q50 30 77 32 Q82 32 81 36 L80 40 Q50 42 20 40Z', CREAM, true);
      ctx.strokeStyle = '#bacbd0'; ctx.lineWidth = 1.2; ctx.stroke(new Path2D('M24 34 Q50 32 77 34'));
      leaf(ctx, 34, 38, 1.6, -1.05, '#8aa69b'); leaf(ctx, 36, 38, 1.5, .8, '#8aa69b');
      leaf(ctx, 64, 38, 1.6, -1.05, '#8aa69b'); leaf(ctx, 66, 38, 1.5, .8, '#8aa69b');
      patch(ctx, 22, 91, 56, 3.8, CREAM, 1.5);
      ctx.strokeStyle = '#b7c6c4'; ctx.lineWidth = .6; ctx.stroke(new Path2D('M26 93 Q50 94 74 93'));
      flower(ctx, 50, 34.8, 6.1, '#698da9', '#698da9'); lettering(ctx, '茶', 50, 34.8, CREAM, 8);
    }
    if (name === 'tw-street') {
      const awning = 'M12 36 Q12 33 17 33 L83 33 Q88 33 88 36 L88 44 Q88 48.5 83 48.5 Q80 48.5 79 45 Q78 49 74 49 Q70 49 69 45 Q68 49 64 49 Q60 49 59 45 Q58 49 54 49 Q50 49 49 45 Q48 49 44 49 Q40 49 39 45 Q38 49 34 49 Q30 49 29 45 Q28 49 24 49 Q20 49 19 45 Q18 48.5 15 48.5 Q12 48.5 12 44Z';
      blob(ctx, awning, CREAM, true);
      ctx.save(); ctx.clip(new Path2D(awning));
      ctx.fillStyle = '#e7967f';
      for (let x = 15; x < 89; x += 10) { ctx.beginPath(); ctx.moveTo(x, 33); ctx.lineTo(x + 5, 33); ctx.lineTo(x + 6, 50); ctx.lineTo(x - 1, 50); ctx.fill(); }
      ctx.restore();
      patch(ctx, 29, 29, 42, 14, '#d9685e', 4); lettering(ctx, '呷飽沒', 50, 36.2, CREAM, 9.5);
      ctx.strokeStyle = '#f8cca0'; ctx.lineWidth = 1; ctx.stroke(new Path2D('M33 31 L67 31'));
      lettering(ctx, '巷口小店', 50, 85, CREAM, 5.8);
      flower(ctx, 22, 84, 3.3, '#f6d787', '#c47167'); flower(ctx, 79, 84, 3.3, '#f6d787', '#c47167', .3);
    }
    if (name === 'tw-island') {
      floral(ctx, 71.5, 34.5, 4.2, '#e79a93', CREAM, .4);
      floral(ctx, 36, 94, 3.3, CREAM, '#d5a765', .8);
    }
  }
  function taiwanPattern(ctx, g) {
    ctx.save(); rimClip(ctx, g);
    if (g.name === 'tw-boba') {
      ctx.fillStyle = '#f9dfbd'; ctx.fillRect(18, 85, 65, 14);
      // Two soft woven stripes overlap to make gingham, rather than a chessboard.
      ctx.fillStyle = '#be7d6b69';
      for (let x = 18; x < 83; x += 7) ctx.fillRect(x, 85, 3.5, 14);
      for (let y = 85; y < 99; y += 7) ctx.fillRect(18, y, 65, 3.5);
      ctx.strokeStyle = '#fff1d8'; ctx.lineWidth = .55; ctx.stroke(new Path2D('M20 85 L80 85'));
      ctx.strokeStyle = CREAM; ctx.lineWidth = 2.1; ctx.stroke(new Path2D('M23 48 L27 77 M76 49 L74 66'));
      floral(ctx, 28, 79, 3.7, CREAM, '#d18a76', .2);
    }
    if (g.name === 'tw-lantern') {
      ctx.strokeStyle = '#c95d5b'; ctx.lineWidth = 2.5;
      for (const w of [9, 20, 29]) { ctx.beginPath(); ctx.ellipse(50, 63, w, 29, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = '#f8b69b'; ctx.lineWidth = 1.3; boundary(ctx, g, 1.33); ctx.stroke();
      ctx.fillStyle = '#f9ce9a'; for (const y of [50, 73]) for (const x of [22, 78]) { ctx.beginPath(); ctx.ellipse(x, y, 1, 1.5, .3, 0, Math.PI * 2); ctx.fill(); }
    }
    if (g.name === 'tw-pineapple') {
      ctx.strokeStyle = '#cb984f'; ctx.lineWidth = 1.05;
      for (let x = -60; x < 120; x += 12) {
        ctx.stroke(new Path2D(`M${x} 30 Q${x + 35} 70 ${x + 80} 100`));
        ctx.stroke(new Path2D(`M${x + 80} 30 Q${x + 45} 70 ${x} 100`));
      }
      ctx.strokeStyle = '#fff0bc'; ctx.lineWidth = 1.5; boundary(ctx, g, 1.31); ctx.stroke();
    }
    if (g.name === 'tw-charm' || g.name === 'tw-tea') {
      const charm = g.name === 'tw-charm';
      const blooms = charm ? [[33,44,4.7], [21,61,4.5], [23,83,4.7], [77,55,4.6], [81,76,4.8], [65,92,4.2], [47,91,3.5]]
        : [[25,46,5.8], [22,68,6.4], [32,90,6], [71,44,5.4], [78,60,6], [74,82,6.2], [52,91,4.5]];
      blooms.forEach(([x, y, r], i) => floral(ctx, x, y, r, [CREAM, charm ? '#b9d2d3' : '#e7a8ac', '#f4d790'][i % 3], ['#dd8e8f', '#f8edcb', '#8d9ea5'][i % 3], i * .35));
      ctx.strokeStyle = CREAM; ctx.lineWidth = .8; ctx.setLineDash([1.1, 2]); boundary(ctx, g, 1.075); ctx.stroke(); ctx.setLineDash([]);
    }
    if (g.name === 'tw-island') {
      ctx.strokeStyle = '#e9edc8'; ctx.lineWidth = .7; ctx.setLineDash([1.5, 1.6]); boundary(ctx, g, 1.085); ctx.stroke(); ctx.setLineDash([]);
      for (const [x, y, angle] of [[26, 66, -.5], [30, 78, -.8], [65, 66, 2.3], [58, 79, 2.4]]) leaf(ctx, x, y, 1.35, angle, '#c7d7aa');
    }
    if (g.name === 'tw-street') {
      ctx.fillStyle = '#fbe3bb'; for (const x of [17, 79]) for (let y = 49; y < 81; y += 6) ctx.fillRect(x, y, 4, 3.5);
      ctx.strokeStyle = CREAM; ctx.lineWidth = 1; boundary(ctx, g, 1.08); ctx.stroke();
    }
    ctx.restore();
  }
  function paperTexture(ctx, seed) {
    let n = seed;
    const random = () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; };
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = i % 3 ? '#fff9e91c' : '#805c4920';
      ctx.fillRect(random() * 100, random() * 100, .1 + random() * .5, .08 + random() * .25);
    }
    ctx.restore();
  }
  const taiwanLayerCache = new Map();
  function taiwanLayer(design, color, front) {
    const key = `${design}:${color}:${front}`;
    if (taiwanLayerCache.has(key)) return taiwanLayerCache.get(key);
    const layer = canvas(640), ctx = layer.getContext('2d'), g = geometry(design);
    ctx.scale(6.4, 6.4); ctx.lineJoin = ctx.lineCap = 'round';
    if (!front) {
      taiwanExtras(ctx, design, color, false);
      paintedBoundary(ctx, g); ctx.strokeStyle = CREAM; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.fillStyle = color; ctx.fill();
      ctx.save(); ctx.strokeStyle = '#8c68583b'; ctx.lineWidth = .5; ctx.stroke(); ctx.restore();
      taiwanPattern(ctx, g);
      taiwanExtras(ctx, design, color, true);
      paperTexture(ctx, design.split('').reduce((n, c) => n + c.charCodeAt(0), 71));
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; boundary(ctx, g); ctx.fill(); ctx.restore();
      const glass = ctx.createLinearGradient(25, 35, 72, 94);
      glass.addColorStop(0, '#fffcf326'); glass.addColorStop(.4, '#fffaf30c'); glass.addColorStop(1, '#f7ecd81a');
      ctx.fillStyle = glass; boundary(ctx, g); ctx.fill();
    } else {
      ctx.strokeStyle = '#947f6240'; ctx.lineWidth = .6; boundary(ctx, g, 1.008); ctx.stroke();
      ctx.strokeStyle = '#fff5df'; ctx.lineWidth = .85; boundary(ctx, g, 1.028); ctx.stroke();
      // The small reflection follows each window's upper-left curve, including the island coast.
      ctx.strokeStyle = '#fffdf7b0'; ctx.lineWidth = 1.05; ctx.beginPath(); let drawing = false;
      for (const [x, y] of g.points) {
        const a = Math.atan2(y, x), highlight = a > -2.8 && a < -2.05;
        if (highlight) ctx[drawing ? 'lineTo' : 'moveTo'](50 + x * .958, 63 + y * .958);
        drawing = highlight;
      }
      ctx.stroke();
    }
    // The illustrated border is static. Reuse it at every physics frame and export frame.
    if (taiwanLayerCache.size >= 32) taiwanLayerCache.delete(taiwanLayerCache.keys().next().value);
    taiwanLayerCache.set(key, layer); return layer;
  }
  function shell(ctx, color, front, design = 'round') {
    if (COLORS[design]) { ctx.drawImage(taiwanLayer(design, color, front), 0, 0, 100, 100); return; }
    const g = geometry(design); ctx.lineJoin = ctx.lineCap = 'round';
    if (!front) {
      const metal = ctx.createLinearGradient(39, 0, 60, 25);
      metal.addColorStop(0, '#8c7c58'); metal.addColorStop(.35, '#fff1bc'); metal.addColorStop(.6, '#d5b15f'); metal.addColorStop(1, '#8a7044');
      ctx.strokeStyle = metal; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(50, 11, 8.5, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(50, 24, 3.3, 6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color; ctx.strokeStyle = '#8b6078'; ctx.lineWidth = .65;
      ctx.beginPath(); ctx.roundRect(44, 26, 12, 18, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.strokeStyle = '#8b6078'; ctx.lineWidth = .65;
      boundary(ctx, g, 1.13); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; boundary(ctx, g); ctx.fill(); ctx.restore();
      const glass = ctx.createLinearGradient(20, 35, 80, 90);
      glass.addColorStop(0, '#fffaff70'); glass.addColorStop(.45, '#e9f5fb28'); glass.addColorStop(1, '#fff1e55c');
      ctx.fillStyle = glass; boundary(ctx, g); ctx.fill();
    } else {
      ctx.strokeStyle = '#ffffffbb'; ctx.lineWidth = 1; boundary(ctx, g, 1.065); ctx.stroke();
      ctx.save(); boundary(ctx, g, .96); ctx.clip(); ctx.strokeStyle = '#ffffffcf'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(25, 60); ctx.quadraticCurveTo(23, 40, 44, 38); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(67, 85); ctx.quadraticCurveTo(76, 79, 77, 69); ctx.stroke(); ctx.restore();
    }
  }
  function hull(points) {
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const half = points => { const out = []; for (const p of points) { while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop(); out.push(p); } return out; };
    return [...half(points).slice(0, -1), ...half(points.slice().reverse()).slice(0, -1)];
  }
  // Circumscribed support planes give a small convex collider that contains all artwork.
  // Twelve sides retain the shape of clouds, stars and flowers without expensive pixel tests.
  function collisionHull(outline) {
    const planes = Array.from({length:12}, (_, i) => {
      const angle=i*Math.PI/6, nx=Math.cos(angle), ny=Math.sin(angle);
      return {nx,ny,d:Math.max(...outline.map(([x,y])=>x*nx+y*ny))};
    });
    return hull(planes.map((a,i)=>{
      const b=planes[(i+1)%planes.length], det=a.nx*b.ny-a.ny*b.nx;
      return [(a.d*b.ny-a.ny*b.d)/det,(a.nx*b.d-a.d*b.nx)/det];
    }));
  }
  let artId = 0;
  // Crop transparent margins, then measure the actual artwork for wall contacts.
  function prepare(item) {
    const pictures = (item.frames?.length ? item.frames : [item.image]).map(image => StickerDecor.drawIcon(item.icon, 96, { ...StickerDecor.iconStyleOf(item.settings), image }));
    const points = []; let x0 = 96, y0 = 96, x1 = 0, y1 = 0;
    for (const c of pictures) {
      const d = c.getContext('2d').getImageData(0, 0, 96, 96).data;
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (d[(y * 96 + x) * 4 + 3] > 40) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
        if (x === 0 || x === 95 || y === 0 || y === 95 || [1, -1, 96, -96].some(k => d[((y * 96 + x) + k) * 4 + 3] <= 40)) points.push([x + .5, y + .5]);
      }
    }
    if (!points.length) { x0 = y0 = 0; x1 = y1 = 96; points.push([0, 0], [96, 0], [96, 96], [0, 96]); }
    const w = x1 - x0, h = y1 - y0, size = Math.max(w, h), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const outline = hull(points).map(([x, y]) => [(x - cx) / size, (y - cy) / size]);
    // Midpoints also catch a sprite bridging a heart notch or a star valley.
    const support = outline.flatMap((p, i) => { const q = outline[(i + 1) % outline.length]; return [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]]; });
    const collider = collisionHull(outline);
    return { id: ++artId, pictures, crop: [x0, y0, w, h], ratio: [w / size, h / size], outline, support, collider, radius: Math.max(...collider.map(p => Math.hypot(...p))) };
  }
  function body(i) { return { x: (i % 4 - 1.5) * 10, y: -12 + Math.floor(i / 4) * 10, vx: 0, vy: 0, a: 0, va: 0, r: 1.4, size: 0, hull: null, mass: 1, invMass: 1, invInertia: 1, cx: 0, cy: 0 }; }
  // Signed polygon integrals work for both convex pieces and concave chambers.
  function polygonProperties(points) {
    let area = 0, cx = 0, cy = 0, inertia = 0;
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i], [u, v] = points[(i + 1) % points.length], cross = x * v - u * y;
      area += cross; cx += (x + u) * cross; cy += (y + v) * cross;
      inertia += cross * (x * x + x * u + u * u + y * y + y * v + v * v);
    }
    if (Math.abs(area) < 1e-8) return { area: 0, cx: 0, cy: 0, inertia: 0 };
    cx /= 3 * area; cy /= 3 * area;
    return { area: Math.abs(area) / 2, cx, cy, inertia: Math.abs(inertia / 12) - Math.abs(area) / 2 * (cx * cx + cy * cy) };
  }
  function clipBelow(points, nx, ny, height) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const da = a[0] * nx + a[1] * ny - height, db = b[0] * nx + b[1] * ny - height;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  function centre(b) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    return { x: b.x + c * b.cx - s * b.cy, y: b.y + s * b.cx + c * b.cy };
  }
  const PIECE_GAP = .14;
  function sizeBody(b, art, size, concave) {
    b.size=size; b.r=art.radius*size;
    b.hull=(concave ? art.support : art.outline).map(([x,y])=>[x*size,y*size]);
    b.collider=art.collider.map(([x,y])=>[x*size,y*size]);
    const p = polygonProperties(b.collider);
    b.area = p.area; b.cx = p.cx; b.cy = p.cy;
    // Acrylic charms are slightly denser than water. Larger pieces carry more momentum.
    b.density = 1.22; b.mass = Math.max(.01, p.area * b.density / 50);
    b.invMass = 1 / b.mass; b.invInertia = 1 / Math.max(.01, p.inertia * b.density / 50);
    b.world=null;
  }
  function world(b) {
    if (b.world && b.worldX===b.x && b.worldY===b.y && b.worldA===b.a) return b.world;
    // Solver passes mostly translate pieces. Reuse the vertices and edge normals.
    if(b.world && b.worldA===b.a){
      const dx=b.x-b.worldX,dy=b.y-b.worldY;
      for(const p of b.world){p[0]+=dx;p[1]+=dy;}
      b.worldX=b.x;b.worldY=b.y;return b.world;
    }
    const c=Math.cos(b.a),s=Math.sin(b.a);
    b.worldX=b.x;b.worldY=b.y;b.worldA=b.a;
    if(!b.world){b.world=b.collider.map(()=>[0,0]);b.axes=b.collider.map(()=>[0,0]);}
    for(let i=0;i<b.collider.length;i++){
      const [x,y]=b.collider[i];b.world[i][0]=b.x+x*c-y*s;b.world[i][1]=b.y+x*s+y*c;
    }
    for(let i=0;i<b.world.length;i++){
      const [x,y]=b.world[i];
      const next=b.world[(i+1)%b.world.length], dx=next[0]-x,dy=next[1]-y,len=Math.hypot(dx,dy);
      b.axes[i][0]=-dy/len;b.axes[i][1]=dx/len;
    }
    return b.world;
  }
  // Normal points from a to b. A positive depth means the pieces need separating.
  function pairContact(a,b,gap=PIECE_GAP,withPoint=false) {
    const dx=b.x-a.x,dy=b.y-a.y,r=a.r+b.r+gap;
    if(dx*dx+dy*dy>=r*r) return null;
    if(!a.collider || !b.collider) {
      const len=Math.hypot(dx,dy);return {depth:r-len,nx:len>1e-7?dx/len:1,ny:len>1e-7?dy/len:0,x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    }
    const pa=world(a),pb=world(b);let depth=Infinity,nx=0,ny=0;
    for(const axes of [a.axes,b.axes]) for(const [x,y] of axes) {
      let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
      for(const p of pa){const d=p[0]*x+p[1]*y;amin=Math.min(amin,d);amax=Math.max(amax,d);}
      for(const p of pb){const d=p[0]*x+p[1]*y;bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
      const forward=amax-bmin+gap,backward=bmax-amin+gap;
      if(forward<=0 || backward<=0) return null;
      if(forward<depth){depth=forward;nx=x;ny=y;}
      if(backward<depth){depth=backward;nx=-x;ny=-y;}
    }
    if (!withPoint) return {depth,nx,ny};
    // Midpoint of the overlapping support faces, rather than the line between centres.
    // This is what makes an off-centre hit transfer angular momentum.
    const an = Math.max(...pa.map(p => p[0] * nx + p[1] * ny));
    const bn = Math.min(...pb.map(p => p[0] * nx + p[1] * ny));
    const at = pa.filter(p => an - p[0] * nx - p[1] * ny < .04).map(p => -p[0] * ny + p[1] * nx);
    const bt = pb.filter(p => p[0] * nx + p[1] * ny - bn < .04).map(p => -p[0] * ny + p[1] * nx);
    const t = (Math.max(Math.min(...at), Math.min(...bt)) + Math.min(Math.max(...at), Math.max(...bt))) / 2, n = (an + bn) / 2;
    return {depth,nx,ny,x:nx*n-ny*t,y:ny*n+nx*t};
  }
  function impulse(b, x, y, rx, ry) {
    b.vx += x * b.invMass; b.vy += y * b.invMass;
    b.va += (rx * y - ry * x) * b.invInertia;
  }
  function collide(state, a, b, hit) {
    const ca = centre(a), cb = b ? centre(b) : { x: hit.x, y: hit.y };
    const ax = hit.x - ca.x, ay = hit.y - ca.y, bx = hit.x - cb.x, by = hit.y - cb.y;
    const { nx, ny } = hit, ma = a.invMass, mb = b?.invMass || 0, ia = a.invInertia, ib = b?.invInertia || 0;
    // Normal points from a towards b (or outwards into a static wall).
    const relative = () => ({ x: (b ? b.vx - b.va * by : 0) - a.vx + a.va * ay, y: (b ? b.vy + b.va * bx : 0) - a.vy - a.va * ax });
    const v = relative(), speed = v.x * nx + v.y * ny;
    if (speed >= 0) return;
    const ra = ax * ny - ay * nx, rb = bx * ny - by * nx;
    const wet = Math.max(a.wet || 0, b?.wet || 0);
    const bounce = speed < -6 ? state.bounce * (1 - wet * .65) : 0;
    const normal = -(1 + bounce) * speed / (ma + mb + ra * ra * ia + rb * rb * ib);
    impulse(a, -nx * normal, -ny * normal, ax, ay);
    if (b) impulse(b, nx * normal, ny * normal, bx, by);
    const slip = relative(), ta = ax * nx + ay * ny, tb = bx * nx + by * ny;
    const friction = .38 - wet * .2;
    const tangent = clamp(-(-slip.x * ny + slip.y * nx) / (ma + mb + ta * ta * ia + tb * tb * ib), -friction * normal, friction * normal);
    impulse(a, ny * tangent, -nx * tangent, ax, ay);
    if (b) impulse(b, -ny * tangent, nx * tangent, bx, by);
  }
  function validLayout(state) {
    for(let i=0;i<state.bodies.length;i++) {
      const a=state.bodies[i];
      if(!Number.isFinite(a.x+a.y+a.a) || (distance(state.geometry,a.x,a.y).d<a.r && contact(state,a).d<-.015)) return false;
      for(let j=i+1;j<state.bodies.length;j++) if(pairContact(a,state.bodies[j],.025)) return false;
    }
    return true;
  }
  function separate(state,passes=12,impulses=false) {
    for(let pass=0;pass<passes;pass++) {
      let changed=false;
      for(let i=0;i<state.bodies.length;i++) for(let j=i+1;j<state.bodies.length;j++) {
        const a=state.bodies[i],b=state.bodies[j],hit=pairContact(a,b,PIECE_GAP,impulses);
        if(!hit || hit.depth<.001) continue;
        if(impulses) collide(state,a,b,hit);
        const {nx,ny,depth}=hit, correction=(depth+.002)/(a.invMass+b.invMass);
        a.x-=nx*correction*a.invMass;a.y-=ny*correction*a.invMass;b.x+=nx*correction*b.invMass;b.y+=ny*correction*b.invMass;changed=true;
      }
      for(const b of state.bodies) changed=wall(state,b,impulses)||changed;
      if(!changed) break;
    }
  }
  function poseOf(b) { return {x:b.x,y:b.y,a:b.a}; }
  function restorePoses(state,poses) {state.bodies.forEach((b,i)=>{Object.assign(b,poses[i]);b.world=null;});}
  function placeLayout(state) {
    const placed=[],g=state.geometry;
    const xmin=Math.min(...g.points.map(p=>p[0])),xmax=Math.max(...g.points.map(p=>p[0]));
    const ymin=Math.min(...g.points.map(p=>p[1])),ymax=Math.max(...g.points.map(p=>p[1]));
    const order=state.bodies.slice().sort((a,b)=>b.r-a.r);
    for(const b of order) {
      const fits=()=>contact(state,b).d>=.07 && placed.every(a=>!pairContact(a,b,PIECE_GAP+.04));
      if(fits()){placed.push(b);continue;}
      let found=false;
      const increment=Math.max(.8,b.size*.16),angles=[b.a,0,Math.PI/2,-Math.PI/2];
      for(const angle of [...new Set(angles)]) {
        b.a=angle;
        for(let row=0,y=ymax-.1;y>=ymin && !found;y-=increment,row++) {
          for(let x=xmin+.1+(row%2)*increment*.5;x<=xmax;x+=increment) {
            b.x=x;b.y=y;
            if(fits()){found=true;break;}
          }
        }
        if(found) break;
      }
      if(!found) return false;
      b.vx=b.vy=b.va=0;placed.push(b);
    }
    return true;
  }
  function arrange(state) {
    if(validLayout(state)) return true;
    separate(state,24);
    if(validLayout(state)) return true;
    const initial=state.bodies.map(poseOf);
    if(placeLayout(state)) return true;
    // A second deterministic packing order avoids making existing positions mandatory.
    for(const b of state.bodies){b.x=1000;b.y=1000;b.a=0;}
    if(placeLayout(state)) return true;
    restorePoses(state,initial);return false;
  }
  function configure(state, settings = {}, options = {}) {
    state.geometry = geometry(settings.shakerDesign); state.mode = settings.shakerMode === 'flat' ? 'flat' : 'gravity';
    state.bounce = clamp(Number(settings.shakerBounce ?? .55), .1, .9);
    const number = (key, fallback, min, max) => Number.isFinite(Number(settings[key])) ? clamp(Number(settings[key]), min, max) : fallback;
    state.liquid = settings.shakerLiquid === true;
    state.fill = number('shakerLiquidLevel', .65, .1, .95);
    state.liquidColor = /^#[\da-f]{6}$/i.test(settings.shakerLiquidColor || '') ? settings.shakerLiquidColor : '#94d9ef';
    state.viscosity = number('shakerViscosity', .45, 0, 1);
    state.glitter = number('shakerGlitter', .5, 0, 1);
    state.magnetMode = ['attract', 'repel'].includes(settings.shakerMagnet) ? settings.shakerMagnet : 'off';
    state.magnetStrength = number('shakerMagnetStrength', .65, .1, 1);
    if (state.magnetMode === 'off') { state.magnet = null; state.previewRemaining = 0; }
    state.fluid ||= { angle: (Number(settings.baseRotation) || 0) * Math.PI / 180 * (settings.flipX ? -1 : 1), velocity: 0, energy: 0 };
    state.dust ||= makeDust(state.geometry);
    if (state.dustGeometry !== state.geometry.name) { state.dust = makeDust(state.geometry); state.dustGeometry = state.geometry.name; }
    updateSurface(state);
    state.shellScale = shellScale(settings);
    const size = clamp(Number(settings.shakerPieceSize) || 14, 6, 24) * contentScale(settings) / state.shellScale;
    state.fitted=false;state.crowded=false;state.fitScale=1;
    state.bodies.forEach((b,i)=>{
      const art=state.art[i],requested=size*clamp(Number(state.items[i].scale)||1,.5,1.5);
      const fit=Math.min(requested,(state.geometry.safe.radius-.15)/art.radius);
      state.fitted ||= fit<requested-.01;
      sizeBody(b,art,fit,state.geometry.concave);
    });
    if(options.fit===false && state.fitted)return null;
    const key=state.geometry.name+':'+state.bodies.map((b,i)=>state.art[i].id+'/'+b.size.toFixed(5)).join(',');
    state.layouts ||= new Map();
    const saved=state.layouts.get(key);
    if(!validLayout(state) && saved) restorePoses(state,saved);
    let fits=arrange(state);
    if(!fits && options.fit===false) return null;
    if(!fits) {
      // Only previously saved overcrowded contents need this fallback. Never discard an icon.
      const sizes=state.bodies.map(b=>b.size);
      for(let attempt=1;!fits && attempt<=18;attempt++) {
        state.fitScale=Math.pow(.86,attempt);
        state.bodies.forEach((b,i)=>{sizeBody(b,state.art[i],sizes[i]*state.fitScale,state.geometry.concave);b.x=1000;b.y=1000;b.a=0;});
        fits=placeLayout(state);
      }
      state.fitted=state.crowded=true;
    }
    if(!fits) throw new Error('Could not place shaker pieces without overlap');
    if(!state.crowded){
      if(state.layouts.size>=24)state.layouts.delete(state.layouts.keys().next().value);
      state.layouts.set(key,state.bodies.map(poseOf));
    }
    state.bodies.forEach(b=>{b.px=b.x;b.py=b.y;b.pa=b.a;});
    return state;
  }
  function contact(state, b) {
    if (!b.hull) { const d = distance(state.geometry, b.x, b.y); return { ...d, d: d.d - b.r, rx: -d.nx * b.r, ry: -d.ny * b.r }; }
    const c = Math.cos(b.a), s = Math.sin(b.a); let deepest = { d: Infinity }; const contacts = [];
    for (const [x, y] of b.hull) {
      const rx = c * x - s * y, ry = s * x + c * y, d = distance(state.geometry, b.x + rx, b.y + ry);
      contacts.push({ ...d, rx, ry });
      if (d.d < deepest.d) deepest = { ...d, rx, ry };
    }
    const face = contacts.filter(p => p.d < deepest.d + .025 && p.nx * deepest.nx + p.ny * deepest.ny > .98);
    if (face.length > 1) { deepest.rx = face.reduce((n,p) => n+p.rx,0)/face.length; deepest.ry = face.reduce((n,p) => n+p.ry,0)/face.length; }
    return deepest;
  }
  function wall(state, b, impulses = true) {
    // Most pieces are clear of the wall. Avoid testing every artwork vertex there.
    if (distance(state.geometry, b.x, b.y).d >= b.r + .06) return false;
    const hit = contact(state, b); if (hit.d >= .055) return false;
    if (impulses) collide(state, b, null, { nx: -hit.nx, ny: -hit.ny, x: b.x + hit.rx, y: b.y + hit.ry });
    b.x += hit.nx * (.06 - hit.d); b.y += hit.ny * (.06 - hit.d);
    return true;
  }
  function constrain(state) {
    for (let p = 0; p < 8; p++) {
      let changed = false;
      for (const b of state.bodies) changed = wall(state, b) || changed;
      if (!changed) break;
    }
  }
  // The liquid is a damped free surface, with buoyancy and drag on the existing rigid pieces.
  // It shares the collision chamber and fixed clock with live rendering and exports.
  function makeDust(g) {
    let seed = 8137;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    return Array.from({ length: 84 }, (_, i) => {
      let x = 0, y = 0;
      for (let k = 0; k < 300; k++) { x = random() * 60 - 30; y = random() * 60 - 30; if (distance(g, x, y).d > .6) break; }
      return { x, y, vx: 0, vy: 0, phase: random() * Math.PI * 2, size: .22 + random() * .48, hue: i % 4 };
    });
  }
  function updateSurface(state) {
    const f = state.fluid;
    if (f.surfaceAngle === f.angle && f.surfaceFill === state.fill && f.surfaceGeometry === state.geometry) return;
    f.nx = Math.sin(f.angle); f.ny = Math.cos(f.angle);
    const heights = state.geometry.points.map(([x, y]) => x * f.nx + y * f.ny);
    let lo = Math.min(...heights), hi = Math.max(...heights);
    const volume = polygonProperties(state.geometry.points).area * state.fill;
    // Fill is an area fraction, so a tilted heart or bottle retains its liquid volume.
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (polygonProperties(clipBelow(state.geometry.points, f.nx, f.ny, mid)).area > volume) lo = mid; else hi = mid;
    }
    f.height = (lo + hi) / 2;
    f.surfaceAngle = f.angle; f.surfaceFill = state.fill; f.surfaceGeometry = state.geometry;
  }
  function liquidDepth(state, x, y) {
    const f = state.fluid, along = x * f.ny - y * f.nx;
    return x * f.nx + y * f.ny - f.height + Math.sin(along * .19 + state.elapsed * 5) * f.energy * 1.6;
  }
  function magnetPath(state, time = state.elapsed) {
    if (state.magnetMode === 'off') return null;
    const g = state.geometry.safe, a = time / (DURATION / 1000) * Math.PI * 2;
    return { x: g.x + Math.cos(a) * g.radius * .62, y: g.y + Math.sin(a) * g.radius * .62 };
  }
  function updateLiquid(state, fx, fy, dt) {
    if (!state.liquid) return;
    const f = state.fluid, gx = state.gravityX || 0, gy = state.gravityY || 0;
    const target = Math.hypot(gx + fx, gy + fy) > .1 ? Math.atan2(gx + fx, gy + fy) : f.angle;
    const delta = Math.atan2(Math.sin(target - f.angle), Math.cos(target - f.angle));
    f.velocity = clamp(f.velocity + (delta * 28 - f.velocity * (4 + state.viscosity * 5)) * dt, -8, 8);
    f.angle += f.velocity * dt;
    f.energy = clamp(f.energy * Math.exp(-dt * 1.8) + Math.hypot(fx, fy) * dt * .0012, 0, 1);
    updateSurface(state);
    // A bounded bulk slosh keeps moving after the shell stops. Pieces and glitter
    // experience drag relative to this flow, not relative to an immobile background.
    const damping = 2.2 + state.viscosity * 6;
    f.vx = ((f.vx || 0) + (fx * .45 - (f.x || 0) * 24) * dt) * Math.exp(-damping * dt);
    f.vy = ((f.vy || 0) + (fy * .45 - (f.y || 0) * 24) * dt) * Math.exp(-damping * dt);
    f.x = clamp((f.x || 0) + f.vx * dt, -12, 12); f.y = clamp((f.y || 0) + f.vy * dt, -12, 12);
    for (const p of state.dust.slice(0, Math.round(state.glitter * 84))) {
      const flow = liquidFlow(state, p.x, p.y), drag = Math.exp(-dt * (6 + state.viscosity * 8));
      p.vx = flow.x + (p.vx - flow.x + (fx + gx * .05) * dt) * drag;
      p.vy = flow.y + (p.vy - flow.y + (fy + gy * .05) * dt) * drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const depth = liquidDepth(state, p.x, p.y);
      if (depth < .3) { p.x += f.nx * (.3 - depth); p.y += f.ny * (.3 - depth); }
      const hit = distance(state.geometry, p.x, p.y);
      if (hit.d < .6) { p.x += hit.nx * (.6 - hit.d); p.y += hit.ny * (.6 - hit.d); p.vx *= .35; p.vy *= .35; }
    }
  }
  function liquidFlow(state, x, y) {
    const f = state.fluid, depth = Math.max(0, x * f.nx + y * f.ny - f.height);
    const swirl = f.velocity * Math.exp(-depth / 20) * .32;
    return { x: (f.vx || 0) + (y - state.geometry.safe.y) * swirl, y: (f.vy || 0) - (x - state.geometry.safe.x) * swirl };
  }
  function submerged(state, b) {
    if (!state.liquid || !b.collider) return { wet: 0, x: 0, y: 0 };
    const f = state.fluid, p = polygonProperties(clipBelow(world(b), f.nx, f.ny, f.height));
    return { wet: clamp(p.area / b.area, 0, 1), x: p.cx, y: p.cy };
  }
  function step(state, fx, fy, dt=STEP) {
    const drag = Math.pow(state.mode === 'flat' ? .983 : .996,dt/STEP);
    for (const b of state.bodies) {
      b.px=b.x;b.py=b.y;b.pa=b.a;
      const cm = centre(b), water = submerged(state, b), wet = b.wet = water.wet;
      const buoyancy = wet / (b.density || 1.22), ux = -fx * buoyancy, uy = -fy * buoyancy;
      const omega = state.omega || 0, alpha = state.alpha || 0;
      let bx = fx + ux + alpha * cm.y + omega * omega * cm.x + 2 * omega * b.vy;
      let by = fy + uy - alpha * cm.x + omega * omega * cm.y - 2 * omega * b.vx;
      b.va -= alpha * dt;
      b.va += ((water.x - cm.x) * uy - (water.y - cm.y) * ux) * b.mass * b.invInertia * dt;
      if (state.magnet) {
        const dx = state.magnet.x - b.x, dy = state.magnet.y - b.y, d = Math.hypot(dx, dy);
        const power = (state.magnetMode === 'repel' ? -1 : 1) * state.magnetStrength * 1000 / (1 + d * d / 280);
        bx += dx / Math.max(6, d) * power; by += dy / Math.max(6, d) * power;
        // Capture damping is strongest near the pole; it prevents endless orbiting.
        if (state.magnetMode === 'attract') { const capture = Math.exp(-dt * state.magnetStrength * 18 / (1 + d * d / 90)); b.vx *= capture; b.vy *= capture; }
      }
      const flow = wet ? liquidFlow(state, cm.x, cm.y) : { x: 0, y: 0 };
      const resistance = Math.exp(-dt * wet * (1.4 + state.viscosity * 10) * 8 / Math.max(3, b.size));
      b.vx=clamp((flow.x+(b.vx+bx*dt-flow.x)*resistance)*drag,-220,220);
      b.vy=clamp((flow.y+(b.vy+by*dt-flow.y)*resistance)*drag,-220,220);
      b.va *= Math.exp(-dt * ((state.mode==='flat'?2.4:.72) + wet * (2 + state.viscosity * 7)));
      b.va=clamp(b.va,-35,35);b.a+=b.va*dt;
      const next = centre(b);
      b.x+=b.vx*dt+cm.x-next.x;b.y+=b.vy*dt+cm.y-next.y;
    }
    separate(state,10,true);
    if(!validLayout(state)) {
      separate(state,12,true);
      if(!validLayout(state)) {
        // Restore the whole last valid step: restoring one piece can overlap its neighbour.
        for(const b of state.bodies){b.x=b.px;b.y=b.py;b.a=b.pa;b.vx*=.25;b.vy*=.25;b.va=0;b.world=null;}
      }
    }
  }
  function create(items = [], settings = {}, options = {}) {
    items = items.length>LIMIT ? items.slice(0,LIMIT) : items;
    const previous=options.previous, used=new Set();
    const matches=items.map(item=>{
      const i=previous?.items.findIndex((old,i)=>!used.has(i)&&(old===item || old.settings===item.settings)) ?? -1;
      if(i>=0)used.add(i);return i;
    });
    const state={items,art:items.map((item,i)=>matches[i]>=0?previous.art[matches[i]]:prepare(item)),
      bodies:items.map((_,i)=>matches[i]>=0?{...previous.bodies[matches[i]],world:null}:body(i)),
      accumulator:previous?.accumulator||0,elapsed:previous?.elapsed||0,burst:previous?.burst||0,updates:previous?.updates||0,
      motion:previous?.motion,canvas:previous?.canvas,layouts:previous?.layouts||new Map(),
      fluid: previous?.fluid ? { ...previous.fluid } : null,
      dust: previous?.dust?.map(p => ({ ...p })), dustGeometry: previous?.dustGeometry};
    if(!configure(state,settings,options)) return null;
    if(!previous && options.settle!==false && state.mode==='gravity' && !state.liquid)for(let k=0;k<180;k++)step(state,0,105);
    return state;
  }
  function advance(state, dt, force = {}) {
    dt = clamp(Number(dt) || 0, 0, .05); state.accumulator += dt;
    const gx = state.mode === 'flat' ? 0 : force.gx ?? 0, gy = state.mode === 'flat' ? 0 : force.gy ?? 105;
    state.gravityX = gx; state.gravityY = gy;
    state.omega = clamp(Number(force.omega) || 0, -12, 12);
    state.alpha = clamp(Number(force.alpha) || 0, -120, 120);
    if (state.magnetMode === 'off' || !(force.magnet || force.preview || state.previewRemaining > 0)) state.magnet = null;
    while (state.accumulator + 1e-9 >= STEP) {
      state.elapsed += STEP;
      state.magnet = state.magnetMode === 'off' ? null : force.magnet || ((force.preview || state.previewRemaining > 0) ? magnetPath(state) : null);
      state.previewRemaining = Math.max(0, (state.previewRemaining || 0) - STEP);
      const shake = state.burst > 0 || force.loop, fx = (force.x || 0) + (shake ? Math.sin(state.elapsed * 25) * 750 : 0);
      const fy = (force.y || 0) + (shake ? (state.mode === 'flat' ? 0 : -230) + Math.cos(state.elapsed * 21) * 280 : 0);
      if (state.liquid) state.fluid.angle += state.omega * STEP;
      updateLiquid(state, fx, fy, STEP);
      const speed=Math.max(0,...state.bodies.map(b=>Math.hypot(b.vx,b.vy)+Math.abs(b.va)*b.r)), radius=Math.max(.3,Math.min(10,...state.bodies.map(b=>b.r)));
      const substeps=Math.min(4,Math.max(1,Math.ceil(speed*STEP/(radius*.6))));
      for(let k=0;k<substeps;k++)step(state,clamp(gx+fx,-1800,1800),clamp(gy+fy,-1800,1800),STEP/substeps);
      state.burst = Math.max(0, state.burst - STEP); state.accumulator -= STEP;
    }
    state.updates++;
  }
  function liquidPath(ctx, state, surfaceOnly = false) {
    const f = state.fluid;
    ctx.beginPath();
    for (let t = -75; t <= 75; t += 2.5) {
      const h = f.height - Math.sin(t * .19 + state.elapsed * 5) * f.energy * 1.6;
      ctx[t === -75 ? 'moveTo' : 'lineTo'](50 + f.ny * t + f.nx * h, 63 - f.nx * t + f.ny * h);
    }
    if (!surfaceOnly) {
      ctx.lineTo(50 + f.ny * 75 + f.nx * 90, 63 - f.nx * 75 + f.ny * 90);
      ctx.lineTo(50 - f.ny * 75 + f.nx * 90, 63 + f.nx * 75 + f.ny * 90); ctx.closePath();
    }
  }
  function paintLiquid(ctx, state, front) {
    if (!state.liquid) return;
    ctx.save(); liquidPath(ctx, state); ctx.clip();
    if (!front) {
      const tint = ctx.createLinearGradient(15, 32, 70, 95);
      tint.addColorStop(0, state.liquidColor + '55'); tint.addColorStop(1, state.liquidColor + 'c4');
      ctx.fillStyle = tint; ctx.fillRect(0, 0, 100, 100);
      // Tiny bubbles drift along the liquid normal; clipping keeps them inside any shell.
      for (let i = 0; i < 8; i++) {
        const t = (i * 17.13) % 48 - 24, h = 32 - ((state.elapsed * (1.8 + i * .17) + i * 9.3) % 64), f = state.fluid;
        ctx.strokeStyle = '#ffffff70'; ctx.lineWidth = .28; ctx.beginPath();
        ctx.arc(50 + f.ny * t + f.nx * h, 63 - f.nx * t + f.ny * h, .45 + i % 3 * .25, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      for (const p of state.dust.slice(0, Math.round(state.glitter * 84))) {
        ctx.save(); ctx.translate(50 + p.x, 63 + p.y); ctx.rotate(p.phase + state.elapsed * .6);
        ctx.globalAlpha = .45 + .5 * Math.sin(p.phase + state.elapsed * 2) ** 2;
        ctx.fillStyle = ['#fff6c7', '#ffffff', '#efc9ff', '#bbfff3'][p.hue];
        ctx.fillRect(-p.size, -p.size * .4, p.size * 2, p.size * .8); ctx.restore();
      }
    }
    ctx.restore();
    if (front) { liquidPath(ctx, state, true); ctx.strokeStyle = '#ffffffb8'; ctx.lineWidth = .65; ctx.stroke(); }
  }
  function paint(ctx, state, color, options = {}) {
    shell(ctx, color, false, state.geometry.name); ctx.save(); boundary(ctx, state.geometry); ctx.clip();
    paintLiquid(ctx, state, false);
    for (const [i, b] of state.bodies.entries()) {
      ctx.save(); ctx.translate(50 + b.x, 63 + b.y); ctx.rotate(b.a);
      const item = state.items[i], art = state.art[i], durations = item.durations || art.pictures.map(() => 100);
      const total = durations.reduce((a, b) => a + b, 0); let elapsed = (state.elapsed * 1000) % total, index = 0;
      while (index < art.pictures.length - 1 && elapsed >= durations[index]) elapsed -= durations[index++];
      const w = b.size * art.ratio[0], h = b.size * art.ratio[1]; ctx.imageSmoothingEnabled = item.icon !== 'pixel';
      ctx.drawImage(art.pictures[index], ...art.crop, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    paintLiquid(ctx, state, true);
    if (state.magnet && options.interactive) {
      ctx.strokeStyle = state.magnetMode === 'repel' ? '#d76a92' : '#716ac4'; ctx.lineWidth = .65;
      ctx.beginPath(); ctx.arc(50 + state.magnet.x, 63 + state.magnet.y, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.font = 'bold 4px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(state.magnetMode === 'repel' ? '−' : '+', 50 + state.magnet.x, 63 + state.magnet.y);
    }
    ctx.restore(); shell(ctx, color, true, state.geometry.name);
  }
  function render(items, color = '#f7bfd5', settings = {}) {
    const c = canvas(320), ctx = c.getContext('2d'); ctx.scale(3.2, 3.2); paint(ctx, create(items, settings), color); return [c];
  }
  function simulate(count) {
    const state = create(); state.bodies = Array.from({ length: count }, (_, i) => body(i));
    const frames = []; for (let i = 0; i < 120; i++) { step(state, Math.sin(i * .3) * 500, 105); frames.push(state.bodies.map(b => ({ ...b }))); } return frames;
  }
  return { render, shell, simulate, create, configure, advance, paint, geometry, distance, contact, constrain, liquidDepth, magnetPath, STEP, DURATION, LIMIT, capacity, pairContact, validLayout, DESIGNS, COLLECTIONS, COLORS, ILLUSTRATED_FINISH, collectionOf };
})();
