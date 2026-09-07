/* Collectible frames: photo clipping, main/worker composition, UI and actual exports. */
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
  page.on('pageerror', e => errors.push(e.message)); await page.route('https://**', r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.stickerApp);
  const drawings = await page.evaluate(() => {
    const fixture = document.createElement('canvas'); fixture.width = fixture.height = 256;
    const f = fixture.getContext('2d'); f.fillStyle = '#fc6b08'; f.fillRect(0, 0, 256, 256);
    const photo = { canvas: fixture, w: 256, h: 256, pad: 0 };
    const sheet = document.createElement('canvas'); sheet.width = 1200; sheet.height = 1080;
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#f5f1fa'; ctx.fillRect(0, 0, 1200, 1080);
    const reports = [];
    for (const [index, [name]] of StickerDecor.FRAME_COLLECTION.entries()) {
      const p = { ...StickerUI.DEFAULTS, ...StickerDecor.FRAME_PRESETS[name], frameCaption: ['STARLIGHT', 'LET’S GO', 'LUCKY YOU', 'HIGH SCORE', 'SNOW DAY', 'LOVE SPELL'][index], frameSubtitle: '' };
      const empty = StickerDecor.composeFrame(p, null), filled = StickerDecor.composeFrame(p, photo);
      const a = empty.canvas.getContext('2d').getImageData(0, 0, empty.canvas.width, empty.canvas.height).data;
      const b = filled.canvas.getContext('2d').getImageData(0, 0, filled.canvas.width, filled.canvas.height).data;
      const win = filled.layout.window, w = filled.canvas.width, h = filled.canvas.height;
      let changed = 0, escaped = 0, cropped = 0;
      for (let i = 0; i < a.length; i += 4) {
        const x = i / 4 % w, y = Math.floor(i / 4 / w);
        if (a[i + 3] && (x < 8 || x >= w - 8 || y < 8 || y >= h - 8)) cropped++;
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
          changed++; if (x < win.x - 1 || x > win.x + win.w + 1 || y < win.y - 1 || y > win.y + win.h + 1) escaped++;
        }
      }
      const alternate = StickerDecor.composeFrame({ ...p, tapeColor: '#19c490' }, null).canvas;
      const colorChanges = alternate.toDataURL() !== empty.canvas.toDataURL();
      const x = index % 3 * 400, y = Math.floor(index / 3) * 540;
      const scale = Math.min(365 / w, 465 / h);
      ctx.drawImage(empty.canvas, x + (400 - w * scale) / 2, y + 12 + (465 - h * scale) / 2, w * scale, h * scale);
      ctx.fillStyle = '#44374f'; ctx.textAlign = 'center'; ctx.font = 'bold 19px sans-serif'; ctx.fillText(name, x + 200, y + 503);
      reports.push({ name, changed, escaped, cropped, colorChanges });
    }
    const legacy = Object.keys(StickerDecor.FRAME_PRESETS).every(name => {
      const r = StickerDecor.composeFrame({ ...StickerUI.DEFAULTS, ...StickerDecor.FRAME_PRESETS[name] }, photo);
      return r.canvas.width > 100 && r.layout.window.w > 100;
    });
    return { reports, legacy, preview: sheet.toDataURL() };
  });
  for (const r of drawings.reports) assert(r.changed > 10000 && r.escaped === 0 && r.cropped === 0 && r.colorChanges, JSON.stringify(r));
  assert(drawings.legacy); fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'frame-collection.png'), Buffer.from(drawings.preview.split(',')[1], 'base64'));
  console.log('PASS six distinct designs, empty/photo windows, photo clipping, uncropped silhouettes, editable accents and existing frame styles');

  const workerChecks = await page.evaluate(async () => {
    const worker = new Worker('js/compose-worker.js'), reports = [];
    try {
      for (const [name] of StickerDecor.FRAME_COLLECTION) {
        const spec = { kind: 'frame', workingRes: '384', settings: { ...StickerUI.DEFAULTS, ...StickerDecor.FRAME_PRESETS[name], frameCaption: '', edgeRefine: false, fillHoles: false, keepLargest: false } };
        const main = StickerDecor.buildComposed(spec);
        const offscreen = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Frame worker timed out')), 15000);
          worker.onerror = e => { clearTimeout(timer); reject(new Error(e.message)); };
          worker.onmessage = ({ data }) => { clearTimeout(timer); data.type === 'error' ? reject(new Error(data.message)) : resolve(data.out); };
          worker.postMessage({ type: 'compose', id: name, seq: 1, spec });
        });
        reports.push({ name, sameShape: main.mask.length === offscreen.mask.length && main.mask.every((v, i) => Math.abs(v - offscreen.mask[i]) < 0.01), sameLayout: JSON.stringify(main.layout) === JSON.stringify(offscreen.layout) });
      }
      return reports;
    } finally { worker.terminate(); }
  });
  assert(workerChecks.every(r => r.sameShape && r.sameLayout), JSON.stringify(workerChecks));
  console.log('PASS identical frame silhouettes and photo layout in the compose worker and main-thread fallback');

  const ids = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fc6b08'; ctx.fillRect(0, 0, 256, 256);
    const p = await stickerApp.addSticker(await new Promise(r => c.toBlob(r)), 'Test photo', { imageMode: 'whole' });
    const f = stickerApp.addFrame({ settings: { baseRotation: 0, anim: 'none', idleSway: 0, hoverTilt: 0, frameCaption: 'MY MEMORY', frameSubtitle: '09 · 07', lightStrength: 0, diffuse: 0 } });
    return { photo: p.id, frame: f.id };
  });
  const choose = name => page.locator(`[data-frame-preset="${name}"]`).click();
  assert.equal(await page.locator('.frame-gallery button').count(), 6);
  const names = await page.evaluate(() => StickerDecor.FRAME_COLLECTION.map(([name]) => name));
  for (const name of names) {
    const version = await page.evaluate(() => stickerApp.selected.maskVersion);
    await choose(name);
    await page.waitForFunction(v => stickerApp.selected.maskVersion > v, version);
    assert.equal(await page.locator('#ctl-framePreset').inputValue(), name);
    assert.equal(await page.locator(`[data-frame-preset="${name}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => stickerApp.selected.frame.photoId), ids.photo);
    assert.equal(await page.locator('#ctl-frameCaption').inputValue(), 'MY MEMORY');
    assert.equal(await page.locator('#ctl-frameSubtitle').inputValue(), '09 · 07');
    assert.equal(await page.locator('#ctl-tapeColor-picker').getAttribute('aria-label'), 'Detail colour');
  }
  await page.evaluate(() => stickerApp.undo()); assert.equal(await page.locator('#ctl-framePreset').inputValue(), 'Snow day');
  await page.evaluate(() => stickerApp.redo()); assert.equal(await page.locator('#ctl-framePreset').inputValue(), 'Love potion');
  await page.evaluate(id => stickerApp.lockObject(id), ids.frame); assert(await page.locator('.frame-gallery button').first().isDisabled());
  await page.evaluate(id => stickerApp.lockObject(id), ids.frame);
  await page.locator('#ctl-tapeColor-picker').click(); await page.locator('.colour-hex').fill('#75bddd'); await page.locator('.colour-hex').press('Enter');
  assert.equal(await page.locator('#ctl-framePreset').inputValue(), ''); assert.equal(await page.locator('.frame-gallery [aria-pressed="true"]').count(), 0);
  assert(await page.locator('#colourPicker').isVisible()); await page.keyboard.press('Escape');
  await page.selectOption('#ctl-framePreset', 'Cinnamon café'); assert.equal(await page.locator('#ctl-tapeColor-picker').getAttribute('aria-label'), 'Tape colour');
  await choose('Starlight rare');
  console.log('PASS gallery/dropdown sync, captions and photo retention, undo/redo, locks, custom colour picker and contextual labels');

  const exports = await page.evaluate(async ({ frame }) => {
    const rec = stickerApp.records.get(frame), { scene } = stickerApp; scene.stop(); const e = scene.get(frame);
    const reports = [];
    const orangePixels = c => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 50 && d[i + 1] < 170 && d[i + 2] < 40 && d[i + 3] > 240) n++;
      return n;
    };
    for (const [name] of StickerDecor.FRAME_COLLECTION) {
      Object.assign(rec.settings, StickerDecor.FRAME_PRESETS[name], { framePreset: name, lightStrength: 0, diffuse: 0, anim: 'swing', frameCaption: 'CUTE', frameSubtitle: '' });
      stickerApp.composeRecord(rec, { sync: true });
      const still = scene.snapshot(e, { scale: .2, shadow: false });
      const animation = scene.animationFrames(e, { size: 144, fps: 2, tilt: false });
      const blobs = [StickerAnim.encodeGIF(animation.frames, animation.fps), await StickerAnim.encodeAPNG(animation.frames, animation.fps)];
      const counts = [];
      for (const blob of blobs) {
        const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type === 'image/apng' ? 'image/png' : blob.type }); await decoder.tracks.ready;
        const { image } = await decoder.decode({ frameIndex: 0 });
        const c = document.createElement('canvas'); c.width = c.height = 144; c.getContext('2d').drawImage(image, 0, 0); image.close();
        counts.push({ frames: decoder.tracks.selectedTrack.frameCount, photo: orangePixels(c) }); decoder.close();
      }
      reports.push({ name, photo: orangePixels(still), moving: new Set(animation.frames.map(c => c.toDataURL())).size > 1, encoded: counts, svg: !new DOMParser().parseFromString(stickerApp.animatedSvg(e), 'image/svg+xml').querySelector('parsererror') });
    }
    scene.start(); return reports;
  }, ids);
  for (const r of exports) assert(r.photo > 100 && r.moving && r.encoded.every(e => e.frames > 1 && e.photo > 80) && r.svg, JSON.stringify(r));
  console.log('PASS actual PNG, decoded GIF/APNG and SVG for all six frames with a photo');

  await page.evaluate(id => stickerApp.scene.select(stickerApp.scene.get(id)), ids.frame);
  const finalVersion = await page.evaluate(() => stickerApp.selected.maskVersion);
  await choose('Starlight rare'); await page.waitForFunction(v => stickerApp.selected.maskVersion > v, finalVersion);
  await page.locator('.frame-gallery').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'frame-collection-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-locale="zh-TW"]').click();
  await page.locator('.frame-gallery').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.frame-gallery button').first().textContent(), '稀有卡');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert(await page.locator('.frame-gallery button').evaluateAll(buttons => buttons.every(b => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44)));
  await page.screenshot({ path: path.join(OUT, 'frame-collection-mobile.png') });
  const shared = await page.evaluate(async () => {
    const before = new Set(stickerApp.records.keys()), { url } = await stickerApp.shareLink(); await stickerApp.loadSharedScene(new URL(url).hash);
    return [...stickerApp.records.values()].filter(r => !before.has(r.id) && r.kind === 'frame').map(r => r.settings.frameDesign);
  });
  assert(shared.includes('rarecard')); assert.deepEqual(errors, []);
  console.log('PASS shared frames, desktop/Chinese mobile gallery and touch target bounds');
} finally { await browser?.close(); server.close(); }
