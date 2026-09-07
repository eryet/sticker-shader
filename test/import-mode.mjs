/* Default cutout, whole-image intake, source alpha and reversible conversion. */
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
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => window.stickerApp);
  const setup = () => page.evaluate(() => {
    window.modelCalls = 0;
    window.testDetect = async c => { modelCalls++; return { mask: Float32Array.from({ length: c.width * c.height }, (_, i) => Math.hypot(i % c.width - c.width / 2, Math.floor(i / c.width) - c.height / 2) < c.height * .25 ? 1 : 0), labels: ['person'] }; };
    Segmenter.autoDetect = testDetect;
  });
  await setup();
  const picture = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 200; const x = c.getContext('2d');
    x.fillStyle = '#bcd9f6'; x.fillRect(0, 0, 320, 200); x.fillStyle = '#fff7d8'; x.fillRect(10, 10, 40, 40);
    x.fillStyle = '#f7c6d4'; x.beginPath(); x.arc(160, 100, 48, 0, Math.PI * 2); x.fill(); x.fillStyle = '#2b2a33';
    x.beginPath(); x.arc(145, 93, 4, 0, Math.PI * 2); x.arc(175, 93, 4, 0, Math.PI * 2); x.fill();
    return c.toDataURL();
  });
  const input = { name: 'picture.png', mimeType: 'image/png', buffer: Buffer.from(picture.split(',')[1], 'base64') };
  const ready = () => page.waitForFunction(() => stickerApp.selected?.mask && stickerApp.scene.selected?.phase === 'ready' && !stickerApp.selected.imageBusy);
  const chosen = () => page.evaluate(() => ({ id: stickerApp.selected.id, mode: stickerApp.selected.imageMode, calls: modelCalls }));
  const setMode = value => page.selectOption('#importMode', value);
  assert.equal(await page.locator('#importMode').inputValue(), 'cutout');
  await page.locator('#fileInput').setInputFiles(input); await ready();
  assert.equal((await chosen()).mode, 'cutout'); assert.equal((await chosen()).calls, 1);
  assert.equal(await page.locator('[data-action="image"]').textContent(), 'Restore original');
  await setMode('whole');
  await page.locator('#fileInput').setInputFiles({ ...input, name: 'whole.png' }); await ready();
  const full = await chosen(); assert.equal(full.mode, 'whole'); assert.equal(full.calls, 1);
  assert(await page.locator('.whole-image-note').isVisible());
  assert(await page.locator('#ctl-feather').isHidden()); assert(await page.locator('#ctl-feather').isDisabled());
  assert(await page.locator('#ctl-workingRes').isEnabled());
  assert(await page.evaluate(() => { const r = stickerApp.selected; return r.mask.every(v => v === 1) && r.atlas.w - 2 * r.atlas.pad === 320 && r.atlas.h - 2 * r.atlas.pad === 200; }));
  await page.locator('[data-action="image"]').click(); await ready(); assert.equal((await chosen()).mode, 'cutout');
  assert(await page.locator('#ctl-feather').isVisible()); assert(await page.locator('#ctl-feather').isEnabled());
  await page.evaluate(() => stickerApp.undo()); assert.equal((await chosen()).mode, 'whole');
  await page.evaluate(() => stickerApp.redo()); assert.equal((await chosen()).mode, 'cutout');
  await page.locator('[data-action="image"]').click(); assert.equal((await chosen()).mode, 'whole');
  await page.evaluate(() => stickerApp.undo()); assert.equal((await chosen()).mode, 'cutout');
  await page.evaluate(() => stickerApp.redo()); assert.equal((await chosen()).mode, 'whole');
  await page.evaluate(id => stickerApp.lockObject(id), full.id); assert(await page.locator('[data-action="image"]').isDisabled());
  await page.evaluate(id => stickerApp.lockObject(id), full.id);
  await page.locator('[data-action="duplicate"]').click(); await ready(); assert.equal((await chosen()).mode, 'whole');
  await page.selectOption('#ctl-workingRes', '1536'); await ready(); assert.equal((await chosen()).mode, 'whole'); assert.equal((await chosen()).calls, 2);
  console.log('PASS auto cutout default, whole upload skips AI, original proportions, convert/restore undo and redo, locks, duplicates and resolution');

  const intake = await page.evaluate(async picture => {
    const blob = await (await fetch(picture)).blob(), make = name => new File([blob], name, { type: blob.type });
    let prior = stickerApp.records.size;
    const wait = async () => { while (stickerApp.records.size === prior) await new Promise(r => setTimeout(r, 10)); prior = stickerApp.records.size; return stickerApp.selected.imageMode; };
    const drop = new DataTransfer(); drop.items.add(make('drop.png'));
    document.dispatchEvent(new DragEvent('dragover', { dataTransfer: drop, bubbles: true, cancelable: true }));
    const hint = getComputedStyle(document.getElementById('stage'), '::after').content;
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: drop, bubbles: true, cancelable: true })); const dropped = await wait();
    const paste = new DataTransfer(); paste.items.add(make('paste.png'));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: paste, bubbles: true })); const pasted = await wait();
    const pending = stickerApp.addFiles([make('batch-1.png'), make('batch-2.png')]);
    const menu = document.getElementById('importMode'); menu.value = 'cutout'; menu.dispatchEvent(new Event('change'));
    await pending;
    return { dropped, pasted, hint, batch: [...stickerApp.records.values()].filter(r => r.name.startsWith('batch-')).map(r => r.imageMode), calls: modelCalls };
  }, picture);
  assert.equal(intake.dropped, 'whole'); assert.equal(intake.pasted, 'whole'); assert.deepEqual(intake.batch, ['whole', 'whole']); assert.equal(intake.calls, 2); assert.match(intake.hint, /whole images/);
  await setMode('whole'); await page.reload(); await page.waitForFunction(() => window.stickerApp); await setup();
  assert.equal(await page.locator('#importMode').inputValue(), 'whole');
  const alpha = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 100; c.height = 80; const x = c.getContext('2d');
    x.fillStyle = '#f7c6d4'; x.fillRect(20, 20, 50, 45); x.fillStyle = 'rgba(80,140,200,.125)'; x.fillRect(2, 2, 10, 10);
    const rec = await stickerApp.addSticker(await new Promise(r => c.toBlob(r)), 'transparent.png');
    Object.assign(rec.settings, { borderWidth: 0, lightStrength: 0, diffuse: 0, grain: 0 });
    stickerApp.rebuildCutout(rec); const rendered = stickerApp.scene.snapshot(stickerApp.scene.get(rec.id), { shadow: false });
    const ctx = rendered.getContext('2d'), px = (a,b) => [...ctx.getImageData(a - rec.atlas.x0, b - rec.atlas.y0, 1, 1).data];
    return { calls: modelCalls, transparent: px(90, 70), faint: px(5, 5), opaque: px(35, 35), id: rec.id };
  });
  assert.equal(alpha.calls, 0); assert.equal(alpha.transparent[3], 0); assert(Math.abs(alpha.faint[3] - 32) <= 1, JSON.stringify(alpha)); assert.equal(alpha.opaque[3], 255);
  console.log('PASS drops, paste, fixed batch mode, preference persistence and real PNG export alpha including faint isolated details');

  // Delayed model responses cannot modify deleted/recreated or newly locked records.
  await page.evaluate(() => { Segmenter.autoDetect = c => new Promise(resolve => { window.finishDetection = async () => resolve(await testDetect(c)); }); });
  await page.locator('[data-action="image"]').click();
  await page.waitForFunction(() => window.finishDetection);
  assert(await page.locator('#btnEdit').isDisabled());
  await page.evaluate(id => stickerApp.lockObject(id), alpha.id); await page.evaluate(() => finishDetection());
  await page.waitForFunction(() => !stickerApp.selected.imageBusy); assert.equal((await chosen()).mode, 'whole');
  await page.evaluate(id => stickerApp.lockObject(id), alpha.id);
  await page.evaluate(() => { window.finishDetection = null; });
  await page.locator('[data-action="image"]').click(); await page.waitForFunction(() => window.finishDetection);
  await page.evaluate(() => stickerApp.deleteSelected()); await page.locator('#deleteConfirm').click(); await page.evaluate(() => finishDetection());
  await page.waitForFunction(() => !stickerApp.records.size);
  await page.evaluate(id => { stickerApp.undo(); stickerApp.scene.select(stickerApp.scene.get(id)); }, alpha.id); await ready(); assert.equal((await chosen()).mode, 'whole');

  // A cancelled job waiting in the queue must not run after undo restores the record,
  // or clear the busy state of a newer conversion for that same record.
  const callsBeforeQueue = (await chosen()).calls;
  await page.evaluate(async picture => {
    window.finishDetection = null;
    await stickerApp.addSticker(await (await fetch(picture)).blob(), 'queued-cutout.png', { imageMode: 'cutout' });
  }, picture);
  await page.waitForFunction(() => window.finishDetection);
  await page.evaluate(id => stickerApp.scene.select(stickerApp.scene.get(id)), alpha.id);
  await page.locator('[data-action="image"]').click();
  await page.evaluate(() => stickerApp.deleteSelected()); await page.locator('#deleteConfirm').click();
  await page.evaluate(id => { stickerApp.undo(); stickerApp.scene.select(stickerApp.scene.get(id)); }, alpha.id);
  await page.locator('[data-action="image"]').click();
  await page.evaluate(() => { Segmenter.autoDetect = testDetect; finishDetection(); });
  await ready(); assert.equal((await chosen()).mode, 'cutout'); assert.equal((await chosen()).calls, callsBeforeQueue + 2);
  await page.locator('[data-action="image"]').click(); assert.equal((await chosen()).mode, 'whole');

  await page.evaluate(() => { Segmenter.autoDetect = testDetect; });
  await page.locator('#btnEdit').click(); await page.locator('#btnClear').click();
  assert.equal((await chosen()).mode, 'cutout'); assert(await page.locator('#ctl-feather').isHidden());
  await page.locator('#btnUndo').click(); assert.equal((await chosen()).mode, 'whole'); assert(await page.locator('#ctl-feather').isHidden());
  await page.locator('#btnClear').click(); await page.locator('#btnReset').click(); assert.equal((await chosen()).mode, 'whole', 'reset remembers a whole-image starting mask');
  await page.locator('#btnDone').click();
  console.log('PASS pending-extraction guards and whole-image cutout editing with mask undo');
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'import-whole-desktop.png') });
  await page.locator('#importMode').click();
  assert(await page.locator('#importMode option').evaluateAll(opts => opts.every(o => o.getBoundingClientRect().height <= 36)));
  await page.screenshot({ path: path.join(OUT, 'import-menu-desktop.png') }); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-locale="zh-TW"]').click();
  assert.equal(await page.locator('#importMode option[value="whole"]').textContent(), '完整圖片');
  await page.locator('#importMode').click(); await page.screenshot({ path: path.join(OUT, 'import-menu-mobile.png') }); await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
} finally { await browser?.close(); server.close(); }
