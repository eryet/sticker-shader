/* Compare affixed artwork against the same artwork printed into one sheet.
 * This catches rigid-centre tilting, floating shadows, double curls and show-through. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'test/.out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); }); await page.route('https://**', r => r.abort());
  await page.addInitScript(() => localStorage.setItem('sticker-shader-editor:locale', 'en'));
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.stickerApp);
  fs.mkdirSync(OUT, { recursive: true });
  const oracle = await page.evaluate(() => {
    stickerApp.scene.stop();
    const R = StickerRenderer, r = stickerApp.renderer;
    const make = (w, h, inset, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); const sdf = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sdf[y * w + x] = Math.min(x - inset + .5, y - inset + .5, w - inset - x - .5, h - inset - y - .5);
      return { c, tex: r.createTextures({ canvas: c, sdf, w, h }) }; };
    const parent = make(240, 240, 16, ctx => { ctx.fillStyle = '#f6cada'; ctx.fillRect(16, 16, 208, 208); });
    const icon = make(96, 80, 0, ctx => { ctx.fillStyle = '#146585'; ctx.fillRect(0, 0, 96, 80); ctx.fillStyle = '#ffee81'; ctx.fillRect(8, 8, 80, 10); ctx.fillRect(8, 62, 80, 10); ctx.fillStyle = '#f276b3'; ctx.beginPath(); ctx.arc(48, 40, 16, 0, Math.PI * 2); ctx.fill(); });
    const merged = make(240, 240, 16, ctx => { ctx.drawImage(parent.c, 0, 0); ctx.drawImage(icon.c, 120, 32); });
    const cfg = { ...StickerUI.DEFAULTS, lightStrength: 0, diffuse: 0, grain: 0, borderWidth: 0, shadowOpacity: 0, surfaceEffect: 'peel', surfaceAmount: 1 };
    const rootPose = { x: 0, y: 0, z: 0, width: 300, height: 300, rotX: 0, rotY: 0, rotZ: 0 };
    const childPose = { x: 60, y: 60, z: 0, width: 120, height: 100, rotX: 0, rotY: 0, rotZ: 0 };
    const overhang = R.surfaceVertex(R.bindSurface({ ...childPose, x: 180, y: 180 }, { pose: rootPose, amount: 0, inset: 0 }), .5, .5);
    const render = (phase, together, childShadow = 0) => r.renderToCanvas({ width: 380, height: 380, draw() {
      r.beginFrame({ stageW: 380, stageH: 380, camDist: 950, time: 0, light: [-150, 200, 600] });
      r.drawSticker(together ? merged.tex : parent.tex, rootPose, cfg, { surfacePhase: phase });
      if (!together) {
        const surface = { pose: rootPose, tex: parent.tex, settings: cfg, phase, amount: R.surfaceState(cfg, phase).peel, inset: R.peelInset(parent.tex, cfg) };
        r.drawSticker(icon.tex, R.bindSurface(childPose, surface), { ...cfg, surfaceSpeed: 2, shadowOpacity: childShadow }, { surfacePhase: .18, shadow: { dir: [.3, -.4], h0: 50, ref: 22, scale: 1.04 } });
      }
    }});
    const pix = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const sheet = document.createElement('canvas'); sheet.width = 1140; sheet.height = 840; const out = sheet.getContext('2d'); out.fillStyle = '#edf2fc'; out.fillRect(0, 0, 1140, 840);
    out.fillStyle = '#402d41'; out.font = 'bold 22px sans-serif'; out.fillText('Attached icon bends with the sheet', 18, 30);
    const results = [0, .24, .48, .72, 1].map((phase, i) => {
      const actual = render(phase, false, 1), expected = render(phase, true), a = pix(actual), b = pix(expected); let sum = 0, wrong = 0;
      for (let j = 0; j < a.length; j += 4) { let delta = 0; for (let k = 0; k < 3; k++) delta += Math.abs(a[j + k] * a[j + 3] - b[j + k] * b[j + 3]) / 255; sum += delta; if (delta > 72) wrong++; }
      if (i > 0 && i < 4) { out.drawImage(actual, (i - 1) * 380, 45); out.drawImage(expected, (i - 1) * 380, 440); }
      const withoutShadow = pix(render(phase, false));
      return { phase, mean: sum / (380 * 380 * 3), wrong, noGhostShadow: a.every((v, j) => Math.abs(v - withoutShadow[j]) < 2) };
    });
    out.fillStyle = '#402d41'; out.font = '18px sans-serif'; out.fillText('Reference: identical design printed onto a single sheet', 18, 435);
    const gl = r.gl, state = { depth: gl.isEnabled(gl.DEPTH_TEST), mask: [...gl.getParameter(gl.COLOR_WRITEMASK)], error: gl.getError() };
    for (const t of [parent.tex, icon.tex, merged.tex]) r.deleteTextures(t);
    return { results, state, overhang, png: sheet.toDataURL() };
  });
  fs.writeFileSync(path.join(OUT, 'peel-attachments-review.png'), Buffer.from(oracle.png.split(',')[1], 'base64'));
  console.log(JSON.stringify(oracle.results));
  for (const r of oracle.results) { assert(r.mean < .5 && r.wrong < 650, 'attached drawing must match the printed-sheet reference: ' + JSON.stringify(r)); assert(r.noGhostShadow); }
  assert.equal(oracle.state.depth, false); assert.deepEqual(oracle.state.mask, [true, true, true, true]); assert.equal(oracle.state.error, 0);
  assert.equal(oracle.overhang.x, 180); assert.equal(oracle.overhang.y, 180); assert.equal(oracle.overhang.z, 0);
  const integration = await page.evaluate(() => {
    const sc = stickerApp.scene, R = StickerRenderer;
    const p = stickerApp.addFrame({ settings: { ...StickerUI.DEFAULTS, surfaceEffect: 'peel', surfaceAmount: 1, surfaceTrigger: 'loop', baseRotation: 24, anim: 'none' } });
    const c = stickerApp.addIcon('heart'), n = stickerApp.addIcon('star');
    const root = sc.get(p.id), child = sc.get(c.id), nested = sc.get(n.id);
    sc.attach(child, root); child.offset = { u: .25, v: -.24 }; sc.attach(nested, child); nested.offset = { u: .1, v: -.2 };
    root.x = sc.stageW / 2; root.y = sc.stageH / 2; root.rotX = .2; root.rotY = -.16; root.rotZ = -24 * Math.PI / 180;
    for (const e of [root, child, nested]) { e.spawn = 0; e.surfaceStarted = 0; e.ascale = 1; e.ax = e.ay = e.arot = 0; }
    child.x = child.y = -10000; sc.time = 1.92;
    const pose = sc._pose(child, sc.stageW, sc.stageH), nestPose = sc._pose(nested, sc.stageW, sc.stageH);
    const center = R.surfaceVertex(pose, .5, .5), edge = R.surfaceVertex(pose, .95, .05);
    const stable = pose.surface.entry === root && nestPose.surface.entry === root && Math.abs(pose.x) < 1000 && Math.abs(pose.y) < 1000 && Math.abs(center.z - edge.z) > 1;
    const cam = sc._view().camDist, wx = sc.stageW / 2 + center.x / (1 - center.z / cam), wy = sc.stageH / 2 - center.y / (1 - center.z / cam);
    const picked = sc.hitTest(wx, wy); const pick = picked === child || picked === nested || picked === root;
    const capture = [], draw = sc.renderer.drawSticker;
    sc.renderer.drawSticker = function(tex, pose, settings, opts) { if (!opts?.depthOnly && tex.img === child.tex.img) capture.push({ inherited: !!pose.surface, amount: pose.surface?.amount, owner: pose.surface?.entry.id }); return draw.call(this, tex, pose, settings, opts); };
    let cycle; try { cycle = sc.animationFrames(root, { size: 96, fps: 2, tilt: false }); } finally { sc.renderer.drawSticker = draw; }
    const rect = sc.canvas.getBoundingClientRect(), camDist = sc._view().camDist;
    const reset = trigger => { root.settings.surfaceTrigger = trigger; root.surfaceStarted = undefined; sc.hovered = null; sc.time += 10; };
    const point = entry => {
      const pose = sc._pose(entry, sc.stageW, sc.stageH);
      for (let v = .2; v < .9; v += .1) for (let u = .2; u < .9; u += .1) {
        const p = R.surfaceVertex(pose, u, v), w = 1 - p.z / camDist;
        const x = sc.stageW / 2 + p.x / w, y = sc.stageH / 2 - p.y / w;
        if (sc.hitTest(x, y) === entry) return { x, y };
      }
      throw new Error('No visible hit on attached icon ' + entry.id);
    };
    const event = (type, p, pointerType = 'mouse') => new PointerEvent(type, { pointerId: 7, pointerType, clientX: rect.left + p.x, clientY: rect.top + p.y, bubbles: true });
    reset('hover'); const childPoint = point(child), nestedPoint = point(nested);
    sc._move(event('pointermove', childPoint)); const hover = root.surfaceStarted === sc.time;
    sc.time += .02; sc._move(event('pointermove', nestedPoint)); const continuous = sc.hovered === nested && root.surfaceStarted === sc.time - .02;
    reset('tap'); const anchor = { ...child.offset };
    sc._down(event('pointerdown', childPoint)); const boundOnPress = sc.drag?.entry === child && sc._pose(child, sc.stageW, sc.stageH).surface?.entry === root;
    sc._up(event('pointerup', childPoint)); const tap = root.surfaceStarted === sc.time && child.offset.u === anchor.u && child.offset.v === anchor.v;
    reset('hover'); sc._down(event('pointerdown', nestedPoint, 'touch')); sc._up(event('pointerup', nestedPoint, 'touch')); const touch = root.surfaceStarted === sc.time;
    reset('tap'); sc._down(event('pointerdown', childPoint)); sc._up(event('pointercancel', childPoint)); const cancel = root.surfaceStarted == null;
    sc._down(event('pointerdown', childPoint)); const moved = { x: childPoint.x + 30, y: childPoint.y };
    sc._move(event('pointermove', moved)); sc._up(event('pointerup', moved)); const drag = root.surfaceStarted == null;
    sc.detach(child); const detached = !sc._pose(child, sc.stageW, sc.stageH).surface;
    return { stable, pick, detached, capture, gestures: { hover, continuous, boundOnPress, tap, touch, cancel, drag }, frames: cycle.frames.length, error: sc.renderer.gl.getError(), rootId: root.id };
  });
  assert(integration.stable && integration.pick && integration.detached, JSON.stringify(integration));
  assert(integration.capture.length === integration.frames && integration.capture.every(p => p.inherited && p.owner === integration.rootId));
  assert(integration.capture.some(p => p.amount > .9)); assert.equal(integration.error, 0);
  assert(Object.values(integration.gestures).every(Boolean), JSON.stringify(integration.gestures));
  assert.deepEqual(errors, []); console.log('PASS shared curvature, fold occlusion, no floating shadows, nested attachments, stable anchors, picking, group hover/tap/touch, exports, detaching and GL state restoration');
} finally { await browser?.close(); server.close(); }
