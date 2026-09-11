/* Surface shaders, interaction triggers, exports, persistence and accessibility. */
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
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  await page.route('https://**', r => r.abort());
  await page.addInitScript(() => localStorage.setItem('sticker-shader-editor:locale', 'en'));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.stickerApp);
  fs.mkdirSync(OUT, { recursive: true });
  const report = await page.evaluate(() => {
    const r = stickerApp.renderer, c = document.createElement('canvas'); c.width = c.height = 320;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#ffbad5'; ctx.fillRect(35, 35, 250, 250);
    ctx.strokeStyle = '#fff9ed'; ctx.lineWidth = 4; ctx.strokeRect(49, 49, 222, 222);
    ctx.fillStyle = '#583d67'; ctx.textAlign = 'center'; ctx.font = 'bold 75px sans-serif'; ctx.fillText('✦', 160, 166);
    ctx.font = 'bold 24px sans-serif'; ctx.fillText('STICKER', 160, 217);
    const sdf = new Float32Array(320 * 320); for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) sdf[y * 320 + x] = Math.min(x - 35, y - 35, 284 - x, 284 - y);
    const tex = r.createTextures({ canvas: c, sdf, w: 320, h: 320 });
    const s = { ...StickerUI.DEFAULTS, ...StickerUI.FOIL_LOOKS.shards.settings, holoIntensity: .18, metallic: .03, materialFinish: 'custom', borderWidth: 8, surfaceAmount: 1 };
    const render = (surfaceEffect, phase, extra = {}) => r.renderToCanvas({ width: 340, height: 340, draw() {
      r.beginFrame({ stageW: 340, stageH: 340, camDist: 900, light: [-170, 200, 600], time: 0 });
      r.drawSticker(tex, { x: 0, y: 0, z: 0, width: 300, height: 300, rotX: 0, rotY: 0, rotZ: -.06 }, { ...s, surfaceEffect, ...extra }, { surfacePhase: phase, shadow: { dir: [.18, -.3], h0: 10, ref: 10, scale: 1 } });
    }});
    const data = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const sig = c => data(c).reduce((n, v, i) => (n + v * (i % 31 + 1)) % 2147483647, 0);
    const differences = (a, b) => { const A = data(a), B = data(b); let count = 0, max = 0, alpha = 0;
      for (let i = 0; i < A.length; i += 4) { let delta = 0; alpha = Math.max(alpha, Math.abs(A[i + 3] - B[i + 3]));
        for (let j = 0; j < 3; j++) delta = Math.max(delta, Math.abs(A[i + j] * A[i + 3] - B[i + j] * B[i + 3]) / 255);
        if (delta > 1) count++; max = Math.max(max, delta);
      } return { count, max, alpha }; };
    // Compare premultiplied colour: unpremultiplication amplifies a one-level
    // rounding difference at nearly transparent antialiased edges.
    const same = (a, b) => { const A = data(a), B = data(b); for (let i = 0; i < A.length; i += 4) {
      if (Math.abs(A[i + 3] - B[i + 3]) > 1) return false;
      for (let j = 0; j < 3; j++) if (Math.abs(A[i + j] * A[i + 3] - B[i + j] * B[i + 3]) > 255) return false;
    } return true; };
    const baseline = render('none', 0), phases = [0, .25, .48, .72, 1];
    const sheet = document.createElement('canvas'); sheet.width = 1700; sheet.height = 800; const out = sheet.getContext('2d');
    out.fillStyle = '#fff5fa'; out.fillRect(0, 0, sheet.width, sheet.height); out.font = 'bold 25px sans-serif'; out.fillStyle = '#402d41'; out.fillText('Surface animations · same artwork, light and pose', 24, 35);
    const results = ['foil-reveal', 'peel'].map((effect, row) => {
      const frames = phases.map((p, i) => { const img = render(effect, p); out.fillStyle = '#dfeafa'; out.fillRect(i * 340, 60 + row * 370, 340, 340); out.drawImage(img, i * 340, 60 + row * 370); return img; });
      out.fillStyle = '#402d41'; out.font = '18px sans-serif'; out.fillText(effect, 15, 421 + row * 370);
      return { effect, sigs: frames.map(sig), seamDifference: differences(frames[0], frames[4]), off: same(render(effect, .48, { surfaceAmount: 0 }), baseline), seam: same(frames[0], frames[4]), reset: same(frames[0], baseline), alpha: frames.every(f => data(f)[3] === 0), dark: effect !== 'foil-reveal' || same(render(effect, .48, { lightStrength: 0 }), render('none', .48, { lightStrength: 0 })) };
    });
    r.deleteTextures(tex); return { results, png: sheet.toDataURL(), glError: r.gl.getError() };
  });
  fs.writeFileSync(path.join(OUT, 'surface-effects-review.png'), Buffer.from(report.png.split(',')[1], 'base64'));
  assert.equal(report.glError, 0);
  for (const result of report.results) {
    assert(result.off && result.seam && result.reset && result.alpha && result.dark, JSON.stringify(result));
    assert(new Set(result.sigs).size >= 4, JSON.stringify(result));
  }
  await page.evaluate(() => {
    stickerApp.scene.stop();
    stickerApp.addIcon('heart');
    const g = document.querySelector('[data-group="motion"]'); g.classList.remove('collapsed'); g.querySelector('.group-head').setAttribute('aria-expanded', 'true');
  });
  const history = () => page.evaluate(() => stickerApp.history.undo.length);
  const before = await history();
  await page.locator('[data-surface-effect="foil-reveal"]').click();
  assert.equal(await history(), before + 1);
  assert.equal(await page.locator('[data-surface-effect="foil-reveal"]').getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => stickerApp.undo());
  assert.equal(await page.locator('[data-surface-effect="none"]').getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => stickerApp.redo());
  await page.locator('#ctl-surfaceTrigger').selectOption('tap');
  const h = await history();
  await page.locator('#btnPreviewSurface').click(); assert.equal(await history(), h, 'preview does not enter history');
  const triggers = await page.evaluate(() => {
    const sc = stickerApp.scene, e = sc.selected; sc.time = 10; e.surfaceStarted = undefined;
    const before = sc.surfacePhase(e); sc.playSurface(e); sc.time += 1; const active = sc.surfacePhase(e); sc.time += 8;
    return { before, active, after: sc.surfacePhase(e) };
  });
  assert.equal(triggers.before, -1); assert(triggers.active > 0 && triggers.active < 1); assert.equal(triggers.after, -1);
  const gestures = await page.evaluate(() => {
    const sc = stickerApp.scene, e = sc.selected, rect = sc.canvas.getBoundingClientRect();
    e.x = e.restX = sc.stageW / 2; e.y = e.restY = sc.stageH / 2; e.spawn = 0; e.rotX = e.rotY = e.rotZ = 0;
    const event = (type, pointerType = 'mouse', dx = 0) => new PointerEvent(type, { pointerId: 7, pointerType, clientX: rect.left + e.x + dx, clientY: rect.top + e.y, bubbles: true });
    const reset = trigger => { e.surfaceStarted = undefined; e.settings.surfaceTrigger = trigger; sc.hovered = null; sc.time += 10; };
    reset('hover'); sc._move(event('pointermove')); const hover = e.surfaceStarted === sc.time;
    reset('tap'); sc._down(event('pointerdown')); sc._up(event('pointerup')); const tap = e.surfaceStarted === sc.time;
    reset('hover'); sc._down(event('pointerdown', 'touch')); sc._up(event('pointerup', 'touch')); const touch = e.surfaceStarted === sc.time;
    reset('tap'); sc._down(event('pointerdown')); sc._move(event('pointermove', 'mouse', 30)); sc._up(event('pointerup', 'mouse', 30)); const drag = e.surfaceStarted == null;
    reset('tap'); sc._down(event('pointerdown')); sc._up(event('pointercancel')); const cancel = e.surfaceStarted == null;
    Object.assign(e.settings, { surfaceEffect: 'peel', surfaceTrigger: 'loop', surfaceAmount: 1 });
    sc.time = 1.9; e.surfaceStarted = 0; e.lift = 0;
    let best = null;
    for (let y = 0; y < e.atlas.h; y += 3) for (let x = 0; x < e.atlas.w; x += 3) if (e.atlas.sdf[y * e.atlas.w + x] > 5 && (!best || x - y > best.x - best.y)) best = { x, y };
    const R = StickerRenderer, pose = sc._pose(e, sc.stageW, sc.stageH), amount = R.surfaceState(e.settings, sc.surfacePhase(e)).peel;
    const bent = R.peelPoint((best.x / e.atlas.w - .5) * pose.width, (.5 - best.y / e.atlas.h) * pose.height, pose.width, pose.height, amount, R.peelInset(e.tex, e.settings));
    const scale = 1 / (1 - bent.z / sc._view().camDist);
    const hit = sc.hitTest(sc.stageW / 2 + bent.x * scale, sc.stageH / 2 - bent.y * scale)?.id === e.id;
    Object.assign(e.settings, { surfaceEffect: 'foil-reveal', surfaceTrigger: 'tap', surfaceAmount: .8 });
    return { hover, tap, touch, drag, cancel, hit };
  });
  assert(Object.values(gestures).every(Boolean), JSON.stringify(gestures));
  const exports = await page.evaluate(async () => {
    const sc = stickerApp.scene, e = sc.selected, results = [];
    for (const effect of ['foil-reveal', 'peel']) {
      e.settings.surfaceEffect = effect;
      const cycle = sc.animationFrames(e, { size: 96, fps: 4, tilt: false });
      const png = await StickerAnim.encodeAPNG(cycle.frames, cycle.fps), gif = StickerAnim.encodeGIF(cycle.frames, cycle.fps);
      const sigs = cycle.frames.map(c => c.toDataURL());
      const svg = StickerAnim.encodeFrameSVG(cycle.frames, cycle.seconds);
      results.push({ effect, changed: new Set(sigs).size > 3, png: png.size, gif: gif.size, svg: svg.includes('calcMode="discrete"'), frames: cycle.frames.length });
    }
    const { url } = await stickerApp.shareLink(); const oldIds = new Set(stickerApp.records.keys()); await stickerApp.loadSharedScene(new URL(url).hash);
    const copy = [...stickerApp.records.values()].find(r => !oldIds.has(r.id));
    return { results, settings: copy.settings };
  });
  assert(exports.results.every(r => r.changed && r.png > 100 && r.gif > 100 && r.svg));
  assert.equal(exports.settings.surfaceEffect, 'peel'); assert.equal(exports.settings.surfaceTrigger, 'tap');
  await page.evaluate(() => stickerApp.scene.select(stickerApp.scene.stickers.at(-1)));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => { stickerApp.scene.playSurface(); return stickerApp.scene.surfacePhase(stickerApp.scene.selected); }), -1);
  await page.waitForFunction(() => document.querySelector('#btnPreviewSurface').disabled);
  assert(await page.locator('#btnPreviewSurface').isDisabled());
  await page.evaluate(() => I18N.setLocale('zh-TW')); await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-surface-effect="peel"]').scrollIntoViewIfNeeded();
  assert((await page.locator('[data-surface-effect="peel"]').innerText()).includes('掀角回貼'));
  const overflow = await page.locator('.surface-effects').evaluate(el => el.scrollWidth > el.clientWidth + 1); assert.equal(overflow, false);
  await page.screenshot({ path: path.join(OUT, 'surface-effects-mobile.png') });
  await page.evaluate(() => stickerApp.lockObject(stickerApp.selected.id));
  assert(await page.locator('[data-surface-effect="peel"]').isDisabled());
  assert.deepEqual(errors, []);
  console.log('PASS shader effects, seamless endpoints, zero intensity, transparency, shine control, preview/undo, triggers, raster/SVG export, sharing, Chinese, mobile and reduced motion');
} finally { await browser?.close(); server.close(); }
