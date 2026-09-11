/* Temporal continuity, scale-independent lens filtering, and real pointer hit paths. */
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
  page.on('pageerror', e => errors.push(e.message)); await page.route('https://**', r => r.abort());
  await page.addInitScript(() => localStorage.setItem('sticker-shader-editor:locale', 'en'));
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.stickerApp); fs.mkdirSync(OUT, { recursive: true });
  const rendered = await page.evaluate(() => {
    stickerApp.scene.stop(); const r = stickerApp.renderer;
    const image = (size, colour) => { const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); ctx.fillStyle = colour; ctx.fillRect(0, 0, size, size); return c; };
    const texture = size => r.createTextures({ canvas: image(size, '#ff0000'), second: image(size, '#0000ff'), sdf: new Float32Array(size * size).fill(100), w: size, h: size });
    const low = texture(128), high = texture(1024), settings = { ...StickerUI.DEFAULTS, surfaceEffect: 'lenticular', surfaceAmount: 1, lightStrength: 0, diffuse: 0, grain: 0, borderWidth: 0, shadowOpacity: 0 };
    const render = (tex, mix, size, x = 0) => r.renderToCanvas({ width: size, height: size, draw() {
      r.beginFrame({ stageW: size, stageH: size, camDist: 1000, light: [0, 0, 500], time: 0 });
      r.drawSticker(tex, { x, y: 0, z: 0, width: size * .8, height: size * .8, rotX: 0, rotY: 0, rotZ: 0 }, settings, { surfacePhase: 0, surfaceMix: mix });
    }});
    const sample = c => { const side = Math.floor(c.width * .4), data = c.getContext('2d').getImageData(Math.floor(c.width * .3), Math.floor(c.height * .3), side, side).data; const blue = []; for (let i = 2; i < data.length; i += 4) blue.push(data[i]); return { mean: blue.reduce((a, b) => a + b, 0) / blue.length, spread: Math.max(...blue) - Math.min(...blue) }; };
    const ramp = Array.from({ length: 33 }, (_, i) => sample(render(low, i / 32, 160)).mean);
    const normal = ramp.map(v => (v - ramp[0]) / (ramp.at(-1) - ramp[0]));
    const steps = normal.slice(1).map((v, i) => v - normal[i]);
    const data = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const small = render(high, .5, 48), moved = render(high, .5, 48, .3), large = render(high, .5, 256);
    const a = data(render(low, .5, 160)), b = data(render(high, .5, 160));
    const resolutionDifference = a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0);
    const sheet = document.createElement('canvas'); sheet.width = 1040; sheet.height = 185; const out = sheet.getContext('2d'); out.fillStyle = '#edf2fc'; out.fillRect(0, 0, 1040, 185); out.font = '16px sans-serif'; out.fillStyle = '#402d41';
    [0, .125, .25, .375, .5, .625, .75, .875].forEach((v, i) => { out.drawImage(render(high, v, 130), i * 130, 38); out.fillText(Math.round(v * 100) + '% movement', i * 130 + 10, 26); });
    const result = { early: normal[4], late: normal[28], maxStep: Math.max(...steps), monotonic: steps.every(n => n >= -.001), small: sample(small), moved: sample(moved), large: sample(large), resolutionDifference, png: sheet.toDataURL(), gl: r.gl.getError() };
    r.deleteTextures(low); r.deleteTextures(high); return result;
  });
  fs.writeFileSync(path.join(OUT, 'lenticular-smooth-ramp.png'), Buffer.from(rendered.png.split(',')[1], 'base64'));
  console.log(JSON.stringify({ ...rendered, png: undefined }));
  assert(rendered.early > .025 && rendered.late < .975 && rendered.maxStep < .06 && rendered.monotonic);
  assert(rendered.small.spread <= 1 && rendered.moved.spread <= 1 && Math.abs(rendered.small.mean - rendered.moved.mean) <= 1);
  assert(rendered.large.spread > 3); assert(rendered.resolutionDifference < 20); assert.equal(rendered.gl, 0);
  const motion = await page.evaluate(() => {
    const sc = stickerApp.scene, cfg = { ...StickerUI.DEFAULTS, surfaceEffect: 'lenticular', surfaceTrigger: 'pointer', surfaceSpeed: 1 };
    const sample = hz => { const e = { settings: cfg, surfaceTarget: 1 }; for (let i = 0; i < hz / 2; i++) sc._updateLenticular(e, 1 / hz); return e.surfacePointer; };
    const rates = [30, 60, 120].map(sample);
    const e = { settings: cfg, surfaceTarget: 1 }, positions = [];
    for (let i = 0; i < 120; i++) { if (i === 25) e.surfaceTarget = 0; if (i === 55) e.surfaceTarget = 1; sc._updateLenticular(e, 1 / 60); positions.push(e.surfacePointer); }
    const maxStep = Math.max(...positions.slice(1).map((v, i) => Math.abs(v - positions[i])));
    const before = e.surfacePointer; e.surfaceStarted = sc.time;
    const immediate = sc._surfaceOptions(e).surfaceMix; sc.time += 1 / 60; sc._updateLenticular(e, 1 / 60); const firstFrame = sc._surfaceOptions(e).surfaceMix;
    e.surfacePointer = .01; e.surfaceVelocity = 0; e.surfaceStarted = sc.time - StickerRenderer.surfacePeriod(cfg) + .001;
    const beforeEnd = sc._surfaceOptions(e).surfaceMix; sc.time += .002; const afterEnd = sc._surfaceOptions(e).surfaceMix;
    sc._updateLenticular(e, 1 / 60); const resumed = sc._surfaceOptions(e).surfaceMix;
    return { rates, maxStep, bounded: positions.every(v => v >= 0 && v <= 1), settled: positions.at(-1), before, immediate, firstFrame, beforeEnd, afterEnd, resumed };
  });
  assert(Math.max(...motion.rates) - Math.min(...motion.rates) < 1e-9, JSON.stringify(motion));
  assert(motion.maxStep < .12 && motion.bounded && motion.settled > .99);
  assert.equal(motion.immediate, motion.before); assert(Math.abs(motion.firstFrame - motion.before) < .05);
  assert.equal(motion.beforeEnd, motion.afterEnd); assert(motion.resumed < .06);
  const tracking = await page.evaluate(() => {
    const sc = stickerApp.scene, r = stickerApp.renderer, settings = { ...StickerUI.DEFAULTS, surfaceEffect: 'lenticular', surfaceTrigger: 'pointer', baseRotation: 0, anim: 'none', hoverTilt: 0, idleSway: 0, borderWidth: 0 };
    const atlas = (size, hole = false) => { const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); ctx.fillStyle = '#e79dc0'; ctx.fillRect(0, 0, size, size); const sdf = new Float32Array(size * size); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) sdf[y * size + x] = Math.min(x + 1, y + 1, size - x, size - y, hole ? Math.hypot(x - size / 2, y - size / 2) - 24 : size); return { canvas: c, sdf, w: size, h: size, x0: 0, y0: 0 }; };
    const root = sc.add({ id: 'lens-ring', settings, work: { w: 128, h: 128 }, instant: true, layer: 0 }); sc.setAtlas(root.id, atlas(128, true)); root.s = 1; root.spawn = 0; root.x = root.restX = 400; root.y = root.restY = 300;
    const child = sc.add({ id: 'lens-decoration', settings: { ...settings, surfaceEffect: 'none' }, work: { w: 20, h: 20 }, instant: true, layer: 2 }); sc.setAtlas(child.id, atlas(20)); child.s = 1; child.spawn = 0; child.x = 440; child.y = 300; sc.attach(child, root); sc.select(root);
    const rect = sc.canvas.getBoundingClientRect(), move = x => sc._move(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'mouse', clientX: rect.left + x, clientY: rect.top + 300 }));
    move(350); const left = root.surfaceTarget;
    const hole = !sc.hitTest(405, 300); move(405); const middle = root.surfaceTarget;
    const icon = sc.hitTest(440, 300) === child; move(440); const right = root.surfaceTarget;
    root.rotX = .4; root.rotY = -.3; root.rotZ = .2; root.ax = 14; root.ay = -9; move(440); const tilted = root.surfaceTarget;
    root.surfacePointer = .72; root.surfaceStarted = sc.time; move(420); const takeover = root.surfaceStarted == null && sc._surfaceOptions(root).surfaceMix === .72;
    sc.remove(child.id); sc.remove(root.id);
    return { left, middle, right, tilted, hole, icon, takeover, gl: r.gl.getError() };
  });
  assert(tracking.hole && tracking.icon && tracking.takeover && tracking.left < .2 && tracking.middle > .5 && tracking.right > .8, JSON.stringify(tracking));
  assert.equal(tracking.right, tracking.tilted); assert.equal(tracking.gl, 0);
  // Verify the user-facing SVG export really samples a 25 fps flip cycle.
  const exported = await page.evaluate(() => {
    const app = stickerApp, rec = app.addIcon('heart', { settings: { ...StickerUI.DEFAULTS, surfaceEffect: 'lenticular', surfaceTrigger: 'loop', surfaceAmount: 1, anim: 'none', workingRes: '512' } });
    const root = app.scene.get(rec.id), second = app.drawSample(1); root.tex.second = app.renderer.createImageTexture(second).tex;
    const svg = app.animatedSvg(root), frames = (svg.match(/data:image\/png;base64,/g) || []).length;
    return { frames, seconds: StickerRenderer.surfacePeriod(root.settings), discrete: svg.includes('calcMode="discrete"') };
  });
  assert.equal(exported.frames, exported.seconds * 25); assert(exported.discrete);
  const downloaded = page.waitForEvent('download');
  await page.locator('[data-export="gif"]').evaluate(button => button.click());
  const gif = await downloaded, gifPath = path.join(OUT, 'smooth-lenticular.gif'); await gif.saveAs(gifPath);
  const bytes = fs.readFileSync(gifPath); assert.equal(bytes.toString('ascii', 0, 6), 'GIF89a');
  let offset = 13 + ((bytes[10] & 128) ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0), frames = 0; const delays = [];
  const blocks = () => { let n; while ((n = bytes[offset++])) offset += n; };
  while (bytes[offset] !== 0x3b && offset < bytes.length) {
    const tag = bytes[offset++];
    if (tag === 0x21) { const label = bytes[offset++]; if (label === 0xf9) delays.push(bytes.readUInt16LE(offset + 2)); blocks(); }
    else if (tag === 0x2c) { const packed = bytes[offset + 8]; offset += 9; if (packed & 128) offset += 3 * (2 ** ((packed & 7) + 1)); offset++; blocks(); frames++; }
    else throw new Error('Invalid GIF block ' + tag);
  }
  assert.equal(frames, exported.seconds * 25); assert.equal(delays.length, frames); assert(delays.every(n => n === 4));
  assert.deepEqual(errors, []);
  console.log('PASS continuous image ramp, filtered lens ribs, texture-resolution independence, 30/60/120 Hz damping, reversal/preview handoffs, holes/attached icons/tilt tracking and real 25 fps GIF/SVG exports');
} finally { await browser?.close(); server.close(); }
