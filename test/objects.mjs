/* Interaction regressions for the contextual toolbar and Layers panel.
 * Runs in an isolated browser profile with deterministic cutouts, without model downloads.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.stickerApp);
  const photoId = await page.evaluate(async () => {
    Segmenter.autoDetect = async c => {
      const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      return { mask: Float32Array.from({ length: c.width * c.height }, (_, i) => p[i * 4 + 3] / 255), labels: [] };
    };
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#f6adc4'; ctx.fillRect(20, 25, 70, 210); ctx.fillRect(20, 165, 210, 70);
    const blob = await new Promise(r => c.toBlob(r));
    return (await stickerApp.addSticker(blob, 'Pink cutout')).id;
  });
  await page.waitForFunction(id => stickerApp.scene.get(id)?.phase === 'ready', photoId);
  await page.evaluate(id => {
    const e = stickerApp.scene.get(id);
    Object.assign(e.settings, { baseRotation: 0, idleSway: 0, hoverTilt: 0, anim: 'none', flipX: false });
    e.x = e.restX = 350; e.y = e.restY = 430;
  }, photoId);
  const iconId = await page.evaluate(() => stickerApp.addIcon('bow', { settings: { baseRotation: 0, anim: 'none' } }).id);
  await page.locator('#layersTab').click();
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 2);
  assert.match(await page.locator(`.layer-row[data-id="${iconId}"] small`).textContent(), /Attached to Pink cutout/);
  const select = async id => { await page.locator(`.layer-row[data-id="${id}"] .layer-select`).click(); await page.waitForFunction(id => stickerApp.selected?.id === id, id); };
  const chosenId = () => page.evaluate(() => stickerApp.selected.id);
  const parentOf = id => page.evaluate(id => stickerApp.scene.get(id)?.parent?.id || null, id);

  await page.locator('[data-action="attach"]').click();
  assert.equal(await parentOf(iconId), null);
  await page.keyboard.press('Control+z'); assert.equal(await parentOf(iconId), photoId);
  await page.keyboard.press('Control+Shift+z'); assert.equal(await parentOf(iconId), null);
  await page.evaluate(({ photoId, iconId }) => {
    const p = stickerApp.scene.get(photoId), e = stickerApp.scene.get(iconId);
    e.x = e.restX = p.x - 80; e.y = e.restY = p.y + 100;
  }, { photoId, iconId });
  await page.waitForFunction(() => !document.querySelector('[data-action="attach"]').disabled);
  await page.locator('[data-action="attach"]').click(); assert.equal(await parentOf(iconId), photoId);
  console.log('PASS attachment labels, explicit detach/attach and undo/redo');

  await select(photoId);
  await page.evaluate(() => {
    const rec = stickerApp.selected;
    // A just-finished edit can still be waiting for the debounced atlas rebuild.
    rec.mask = rec.mask.slice();
    for (let y = 0; y < rec.work.height; y++) for (let x = 0; x < 45; x++) rec.mask[y * rec.work.width + x] = 0;
    rec.maskVersion++;
  });
  await page.locator('[data-action="duplicate"]').click();
  const copyId = await chosenId();
  assert.notEqual(copyId, photoId);
  assert.equal(await page.evaluate(id => stickerApp.scene.children(stickerApp.scene.get(id)).length, copyId), 1);
  assert(await page.evaluate(({ photoId, copyId }) => {
    const a = stickerApp.records.get(photoId), b = stickerApp.records.get(copyId);
    return a.mask !== b.mask && a.mask.every((v, i) => v === b.mask[i]) && a.settings !== b.settings && b.atlasMaskVersion === b.maskVersion;
  }, { photoId, copyId }), 'duplicates preserve cutout and independent editing state');
  await page.keyboard.press('Control+z'); assert.equal(await page.evaluate(() => stickerApp.scene.stickers.length), 2);
  await page.keyboard.press('Control+Shift+z'); assert.equal(await page.evaluate(() => stickerApp.scene.stickers.length), 4);
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 4);
  console.log('PASS decorated-photo duplication is one undoable action');

  await select(copyId);
  await page.locator(`.layer-row[data-id="${copyId}"] .layer-lock`).click();
  const childId = await page.evaluate(id => stickerApp.scene.children(stickerApp.scene.get(id))[0].id, copyId);
  await select(childId);
  assert(await page.locator('[data-action="flip"]').isDisabled());
  assert(await page.locator('#btnDelete').isDisabled());
  await page.keyboard.press('Delete'); assert.equal(await page.evaluate(id => stickerApp.records.has(id), childId), true);
  await page.locator('#propertiesTab').click();
  assert(await page.locator('#ctl-stickerScale-icon').isDisabled());
  assert(await page.locator('#btnPasteSettings').isDisabled());
  await page.locator('#layersTab').click();
  await select(copyId);
  const before = await page.evaluate(id => { const e = stickerApp.scene.get(id); return { x: e.x, y: e.y, scale: e.settings.stickerScale }; }, copyId);
  const box = await page.locator('#glCanvas').boundingBox();
  await page.mouse.move(box.x + before.x - 80, box.y + before.y + 100); await page.mouse.wheel(0, 250);
  assert.equal(await page.evaluate(id => stickerApp.scene.get(id).settings.stickerScale, copyId), before.scale);
  await page.locator(`.layer-row[data-id="${copyId}"] .layer-lock`).click();
  await page.keyboard.press('Control+z'); assert(await page.locator('[data-action="flip"]').isDisabled());
  await page.keyboard.press('Control+Shift+z');
  console.log('PASS parent locking protects children, properties, Delete and wheel edits');

  await select(copyId);
  const ids = () => page.evaluate(() => stickerApp.scene.stickers.map(e => e.id));
  const orderBefore = await ids();
  await page.locator('[data-order="-1"]').click();
  const orderAfter = await ids(); assert.notDeepEqual(orderAfter, orderBefore);
  await select(photoId); assert.deepEqual(await ids(), orderAfter, 'selection leaves stacking order intact');
  await page.keyboard.press('Control+z'); assert.deepEqual(await ids(), orderBefore);
  await page.keyboard.press('Control+Shift+z'); assert.deepEqual(await ids(), orderAfter);
  await select(copyId); await page.locator('#btnDelete').click();
  await page.keyboard.press('Control+z'); assert.deepEqual(await ids(), orderAfter, 'delete undo restores the exact stack order');
  assert(await page.evaluate(() => stickerApp.scene.stickers.every((e, i, all) => !i || all[i - 1].layer <= e.layer)));
  console.log('PASS layer selection, reorder and undo respect stack boundaries');

  // Mirroring must agree between the on-canvas silhouette and exported pixels.
  await select(photoId);
  const flipped = await page.evaluate(() => {
    const app = stickerApp, e = app.scene.selected;
    app.objectAction('flip'); e.rotX = e.rotY = e.rotZ = e.arot = 0; e.ax = e.ay = 0; e.ascale = 1;
    const mirrored = app.scene.snapshot(e, { shadow: false });
    const a = mirrored.getContext('2d').getImageData(0, 0, mirrored.width, mirrored.height).data;
    const uv = app.scene.localPoint(e, e.x - app.scene.size(e).w / 4, e.y).u;
    app.objectAction('flip');
    const normal = app.scene.snapshot(e, { shadow: false });
    const b = normal.getContext('2d').getImageData(0, 0, normal.width, normal.height).data;
    let error = 0;
    for (let y = 0; y < normal.height; y++) for (let x = 0; x < normal.width; x++) error += Math.abs(b[(y * normal.width + x) * 4 + 3] - a[(y * normal.width + normal.width - 1 - x) * 4 + 3]);
    return { uv, error: error / (normal.width * normal.height) };
  });
  assert(Math.abs(flipped.uv - .75) < .001); assert(flipped.error < 1, 'exported alpha is mirrored');
  await page.locator('[data-action="rotate"]').click();
  assert.equal(await page.evaluate(() => stickerApp.selected.settings.baseRotation), 15);
  await page.keyboard.press('Control+z'); assert.equal(await page.evaluate(() => stickerApp.selected.settings.baseRotation), 0);
  console.log('PASS rotation undo and mirrored hit testing / PNG export');

  const frameId = await page.evaluate(id => {
    const f = stickerApp.addFrame({ quiet: true, settings: { baseRotation: 0 } });
    stickerApp.setFramePhoto(f, id, { sync: true }); stickerApp.scene.select(stickerApp.scene.get(f.id)); return f.id;
  }, photoId);
  await page.waitForFunction(id => document.querySelector(`.layer-row[data-id="${id}"]`), frameId);
  await select(frameId); await page.keyboard.press('Control+d');
  const frameCopy = await chosenId();
  const ownership = await page.evaluate(({ frameId, frameCopy }) => {
    const a = stickerApp.records.get(frameId), b = stickerApp.records.get(frameCopy);
    return { a: a.frame.photoId, b: b.frame.photoId, owner: stickerApp.records.get(b.frame.photoId).framedIn };
  }, { frameId, frameCopy });
  assert.notEqual(ownership.a, ownership.b); assert.equal(ownership.owner, frameCopy);
  await page.keyboard.press('Control+z'); assert.equal(await page.evaluate(id => stickerApp.records.has(id), ownership.b), false);
  await page.keyboard.press('Control+Shift+z');
  await page.locator('#btnDelete').click();
  assert.equal(await page.evaluate(id => stickerApp.scene.get(id)?.id, ownership.b), ownership.b, 'deleting duplicated frame releases its own photo');
  assert.equal(await page.evaluate(id => stickerApp.records.get(id).frame.photoId, frameId), photoId);
  await page.keyboard.press('Control+z');
  console.log('PASS frame duplication preserves independent photo ownership and delete/undo');

  await select(frameId);
  await page.waitForTimeout(700);
  fs.mkdirSync(path.join(ROOT, 'test/.out'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'test/.out/objects-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#glCanvas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const bounds = await page.evaluate(() => {
    const a = document.getElementById('objectToolbar').getBoundingClientRect(), b = document.getElementById('stage').getBoundingClientRect();
    return { left: a.left - b.left, right: b.right - a.right, top: a.top - b.top, bottom: b.bottom - a.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert(Object.values(bounds).slice(0, 4).every(v => v >= 0)); assert.equal(bounds.overflow, false);
  await page.screenshot({ path: path.join(ROOT, 'test/.out/objects-mobile.png'), fullPage: true });
  await page.locator('[data-locale="zh-TW"]').click();
  await page.waitForFunction(() => document.querySelector('[data-action="duplicate"] span').textContent === '複製');
  await page.locator('#layersTab').focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#propertiesTab').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#layersTab').getAttribute('aria-selected'), 'true');
  const shared = await page.evaluate(async id => {
    const app = stickerApp;
    app.lockObject(id);
    const { data, url } = await app.shareLink();
    const before = new Set(app.records.keys());
    await app.loadSharedScene(new URL(url).hash);
    const restored = app.scene.stickers.filter(e => !before.has(e.id));
    return { locks: data.items.filter(it => it.l).length, restoredLocks: restored.filter(e => e.locked).length,
      attachedLocks: restored.filter(e => e.parent?.locked && app.scene.isLocked(e)).length };
  }, frameId);
  assert(shared.locks > 0); assert.equal(shared.restoredLocks, shared.locks); assert(shared.attachedLocks > 0);
  assert.deepEqual(errors, []);
  console.log('PASS mobile bounds, keyboard panels, Traditional Chinese and shared group locks');
} finally {
  await browser?.close(); server.close();
}
