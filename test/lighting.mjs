/* Artwork-preserving highlights, master shine and lighting persistence. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test/.out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.route('https://**', r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.stickerApp);
  const report = await page.evaluate(() => {
    const r = stickerApp.scene.renderer, size = 64;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const settings = { ...StickerUI.DEFAULTS, borderWidth: 0, diffuse: 0, bevel: 0, grain: 0, holoIntensity: 0, metallic: 0, glitter: 0, fresnel: 0, specular: 2, inkFoil: .85 };
    const pixel = c => [...c.getContext('2d').getImageData(size / 2, size / 2, 1, 1).data];
    const measure = colour => {
      ctx.fillStyle = colour; ctx.fillRect(0, 0, size, size);
      const source = pixel(canvas), tex = r.createTextures({ canvas, sdf: new Float32Array(size * size).fill(100), w: size, h: size });
      const render = (strength, gentle) => pixel(r.renderToCanvas({ width: size, height: size, draw() {
        r.beginFrame({ stageW: size, stageH: size, camDist: 6400, light: [0, 0, 6400], time: 0 });
        r.drawSticker(tex, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, width: size, height: size }, { ...settings, lightStrength: strength, softHighlights: gentle });
      } }));
      const result = { source, legacy: render(100, false), gentle: render(100, true), defaults: render(65, true), off: render(0, true), steps: [0, 20, 40, 65, 80, 100].map(s => render(s, true)) };
      r.deleteTextures(tex); return result;
    };
    return ['#dbe8fb', '#f7c6d4', '#2b2a33', '#ffffff', '#000000'].map(measure);
  });
  const distance = (a, b) => a.slice(0, 3).reduce((n, v, i) => n + Math.abs(v - b[i]), 0);
  for (const row of report) {
    assert(distance(row.off, row.source) <= 3, 'zero shine preserves source colour');
    assert(row.steps.every(p => p[3] === 255), 'shine does not change opacity');
    if (row.source[0] < 250 && row.source[0] > 0) {
      assert(distance(row.gentle, row.source) < distance(row.legacy, row.source), JSON.stringify(row));
      const deviations = row.steps.map(p => distance(p, row.source));
      assert(deviations.every((d, i) => !i || d >= deviations[i - 1] - 1), 'strength changes smoothly and monotonically');
    }
  }
  assert(report[2].defaults.slice(0, 3).every(v => v < 115), 'dark printed details stay dark even under a direct highlight');
  assert(report[3].defaults[0] > 220 && report[4].off.slice(0, 3).every(v => v === 0), 'white stays bright and zero-light black is finite');
  console.log('PASS real WebGL pixels: softer highlight peaks, dark print protection, original colour at 0%, unchanged alpha and smooth strength');
  console.log(JSON.stringify(report.map(r => ({ source: r.source, legacy: r.legacy, gentle: r.defaults }))));

  const id = await page.evaluate(() => stickerApp.addFrame({ settings: { frameDesign: 'cinnamoroll', baseRotation: -6, idleSway: 0, hoverTilt: 0 } }).id);
  const setRange = async (id, value) => page.locator(id).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  assert.equal(await page.locator('#ctl-lightStrength').inputValue(), '65'); assert(await page.locator('#ctl-softHighlights').isChecked());
  await setRange('#ctl-lightStrength', 35);
  await page.evaluate(() => stickerApp.undo()); assert.equal(await page.locator('#ctl-lightStrength').inputValue(), '65');
  await page.evaluate(() => stickerApp.redo()); assert.equal(await page.locator('#ctl-lightStrength').inputValue(), '35');
  await page.locator('#ctl-softHighlights').uncheck();
  await page.evaluate(() => stickerApp.undo()); assert(await page.locator('#ctl-softHighlights').isChecked());
  await setRange('#ctl-lightFollow', .15);
  await page.selectOption('#presetSelect', 'Holographic');
  assert.equal(await page.locator('#ctl-lightStrength').inputValue(), '35'); assert(await page.locator('#ctl-softHighlights').isChecked());
  assert.equal(await page.locator('#ctl-lightFollow').inputValue(), '0.15');
  await page.evaluate(id => stickerApp.lockObject(id), id);
  assert(await page.locator('#ctl-lightStrength').isDisabled()); assert(await page.locator('#ctl-softHighlights').isDisabled());
  await page.evaluate(id => stickerApp.lockObject(id), id);
  const shared = await page.evaluate(async () => {
    const before = new Set(stickerApp.records.keys()), { data, url } = await stickerApp.shareLink();
    await stickerApp.loadSharedScene(new URL(url).hash);
    const rec = [...stickerApp.records.values()].find(r => !before.has(r.id));
    return { stored: data.items[0].s.lightStrength, restored: rec.settings.lightStrength, gentle: rec.settings.softHighlights, follow: rec.settings.lightFollow };
  });
  assert.deepEqual(shared, { stored: 35, restored: 35, gentle: true, follow: .15 });
  await page.evaluate(id => stickerApp.scene.select(stickerApp.scene.get(id)), id);
  await page.locator('[data-locale="zh-TW"]').click();
  assert.equal(await page.locator('label[for="ctl-lightStrength"]').textContent(), '光澤強度');
  await page.locator('[data-locale="en"]').click();
  console.log('PASS lighting controls, undo/redo, locking, preset preservation, sharing and Traditional Chinese');

  // A contact sheet exercises every preset with white areas, dark ink and pastel fills.
  const sheets = await page.evaluate(() => {
    const app = stickerApp, scene = app.scene; scene.stop();
    const icon = app.addIcon('cinnamoroll', { quiet: true, settings: { baseRotation: 0, iconBlink: false } }), entry = scene.get(icon.id);
    const names = Object.keys(StickerUI.PRESETS), width = 280, height = 195;
    const sheet = document.createElement('canvas'); sheet.width = width * 4; sheet.height = height * Math.ceil(names.length / 4);
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#e5eff8'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    let sameAlpha = true, nonempty = true, zeroMatches = true;
    const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    names.forEach((name, index) => {
      StickerUI.applyPreset(icon.settings, name);
      const base = { ...icon.settings };
      const snap = (strength, gentle) => {
        Object.assign(icon.settings, base, { lightStrength: strength, softHighlights: gentle });
        return scene.snapshot(entry, { scale: .45, shadow: false });
      };
      const old = snap(100, false), soft = snap(65, true), off = snap(0, true), a = pixels(old), b = pixels(soft), z = pixels(off);
      Object.assign(icon.settings, { holoIntensity: 0, metallic: 0, glitter: 0, specular: 0, fresnel: 0, lightStrength: 100 });
      const plain = pixels(scene.snapshot(entry, { scale: .45, shadow: false }));
      sameAlpha &&= a.every((v, i) => i % 4 !== 3 || v === b[i]);
      nonempty &&= b.some((v, i) => i % 4 === 3 && v > 250);
      zeroMatches &&= z.every((v, i) => Math.abs(v - plain[i]) <= 1);
      const x = index % 4 * width, y = Math.floor(index / 4) * height;
      ctx.fillStyle = '#2b2a33'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(name, x + 12, y + 22);
      for (const [j, c] of [old, soft].entries()) {
        const scale = Math.min(128 / c.width, 125 / c.height), w = c.width * scale, h = c.height * scale;
        ctx.drawImage(c, x + 6 + j * 140 + (128 - w) / 2, y + 35 + (125 - h) / 2, w, h);
      }
      ctx.font = '12px sans-serif'; ctx.fillText('Previous', x + 40, y + 180); ctx.fillText('Gentle · 65%', x + 168, y + 180);
      Object.assign(icon.settings, base);
    });
    Object.assign(icon.settings, StickerUI.DEFAULTS, { lightStrength: 0, borderWidth: 0, shadowOpacity: 0, iconBlink: false });
    const noShine = scene.animationFrames(entry, { size: 128, fps: 2, shadow: false });
    Object.assign(icon.settings, { lightStrength: 100, holoIntensity: 0, metallic: 0, glitter: 0, specular: 0, fresnel: 0 });
    const noEffects = scene.animationFrames(entry, { size: 128, fps: 2, shadow: false });
    const animationMatches = noShine.frames.every((f, i) => { const expected = pixels(noEffects.frames[i]); return pixels(f).every((v, j) => Math.abs(v - expected[j]) <= 1); });
    app.scene.select(null);
    return { png: sheet.toDataURL('image/png'), sameAlpha, nonempty, zeroMatches, animationMatches, count: names.length };
  });
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'lighting-presets.png'), Buffer.from(sheets.png.split(',')[1], 'base64'));
  assert(sheets.sameAlpha && sheets.nonempty && sheets.zeroMatches && sheets.animationMatches, JSON.stringify({ ...sheets, png: undefined }));
  console.log(`PASS ${sheets.count} preset renders, transparent PNGs, zero-shine equivalence and animated exports`);
  await page.evaluate(id => {
    const app = stickerApp; for (const e of app.scene.stickers) if (e.id !== id) e.x = e.restX = -3000;
    const rec = app.records.get(id); Object.assign(rec.settings, { lightStrength: 65, softHighlights: true });
    for (const sec of document.querySelectorAll('#panel .group')) if (!['frame', 'lighting'].includes(sec.dataset.group)) { sec.classList.add('collapsed'); sec.querySelector('.group-head').setAttribute('aria-expanded', 'false'); }
    app.scene.select(app.scene.get(id)); app.scene.start();
  }, id);
  await page.locator('[data-group="lighting"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'lighting-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-group="lighting"]').scrollIntoViewIfNeeded();
  const bounds = await page.locator('[data-group="lighting"]').boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await page.locator('[data-group="lighting"]').screenshot({ path: path.join(OUT, 'lighting-mobile.png') });
  assert.deepEqual(errors, []);
} finally { await browser?.close(); server.close(); }
