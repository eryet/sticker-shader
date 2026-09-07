/* Delete confirmation: every entry point, safe cancellation, ownership and history. */
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
  const icon = await page.evaluate(() => stickerApp.addIcon('heart', { settings: { anim: 'none', baseRotation: 0 } }).id);
  const dialog = page.locator('#deleteDialog'), confirm = page.locator('#deleteConfirm'), cancel = page.locator('#deleteCancel');
  const exists = id => page.evaluate(id => stickerApp.records.has(id), id);
  const select = id => page.evaluate(id => stickerApp.scene.select(stickerApp.scene.get(id)), id);
  const history = () => page.evaluate(() => stickerApp.history.undo.length);
  const before = await history();
  await page.locator('#btnDelete').click(); assert(await dialog.isVisible()); assert(await exists(icon));
  assert.equal(await page.locator('#deleteTitle').textContent(), 'Delete this icon?');
  assert(await cancel.evaluate(el => el === document.activeElement));
  await page.keyboard.press('Delete'); await page.keyboard.press('Backspace'); await page.keyboard.press('Control+z');
  const blockedPaste = await page.evaluate(() => {
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented;
  });
  assert(blockedPaste, 'pasting cannot change the background canvas while confirming');
  assert(await exists(icon)); assert.equal(await history(), before);
  await page.keyboard.press('Tab'); assert(await confirm.evaluate(el => el === document.activeElement));
  await page.keyboard.press('Tab'); assert(await cancel.evaluate(el => el === document.activeElement), 'focus stays in the modal');
  await page.keyboard.press('Enter'); assert(await dialog.isHidden()); assert(await exists(icon));
  assert(await page.locator('#btnDelete').evaluate(el => el === document.activeElement), 'cancel restores the launcher focus');
  await page.keyboard.press('Delete'); assert(await dialog.isVisible()); await page.keyboard.press('Escape');
  assert(await dialog.isHidden()); assert.equal(await page.evaluate(() => stickerApp.selected.id), icon); assert.equal(await history(), before);
  await page.keyboard.press('Backspace'); assert(await dialog.isVisible()); await page.mouse.click(8, 8); assert(await dialog.isHidden());
  assert(await exists(icon)); assert.equal(await history(), before);
  await page.locator('#btnDelete').click(); await confirm.click(); assert.equal(await exists(icon), false); assert.equal(await history(), before + 1);
  await page.keyboard.press('Control+z'); assert(await exists(icon)); await page.keyboard.press('Control+Shift+z'); assert.equal(await exists(icon), false);
  await page.evaluate(() => stickerApp.undo()); await select(icon);
  console.log('PASS toolbar/Delete/Backspace confirmation, cancel/Enter/Escape/backdrop, focus trap, repeated shortcuts and one-step undo/redo');

  // Deletion names are plain text, and the request stays bound to the item shown.
  await page.evaluate(id => { stickerApp.records.get(id).name = '<img src=x onerror=alert(1)> & my heart'; stickerApp.deleteSelected(); }, icon);
  assert.equal(await page.locator('#deleteName img').count(), 0);
  assert.match(await page.locator('#deleteName').textContent(), /<img/);
  const other = await page.evaluate(() => stickerApp.addIcon('star').id);
  await confirm.click(); assert.equal(await exists(icon), false); assert(await exists(other));
  await page.evaluate(() => stickerApp.undo()); await select(icon);
  await page.evaluate(() => stickerApp.deleteSelected()); await page.evaluate(id => stickerApp.lockObject(id), icon);
  await confirm.click(); assert(await exists(icon), 'a newly locked target cannot be removed');
  await page.evaluate(() => stickerApp.deleteSelected()); assert(await dialog.isHidden());
  await page.evaluate(id => stickerApp.lockObject(id), icon);
  console.log('PASS captured target across selection changes, escaped item names and locks rechecked at confirmation');

  const photo = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#afcfff'; ctx.fillRect(0, 0, 320, 240);
    return (await stickerApp.addSticker(await new Promise(r => c.toBlob(r)), 'Summer memory.png', { imageMode: 'whole' })).id;
  });
  await page.waitForFunction(id => !!stickerApp.records.get(id)?.atlas, photo);
  const frame = await page.evaluate(() => stickerApp.addFrame({ settings: { ...StickerDecor.FRAME_PRESETS['Bon voyage'], frameCaption: 'SUMMER', baseRotation: 0, idleSway: 0 } }).id);
  await page.evaluate(({ frame, icon }) => { stickerApp.scene.attach(stickerApp.scene.get(icon), stickerApp.scene.get(frame)); stickerApp.scene.select(stickerApp.scene.get(frame)); }, { frame, icon });
  const version = await history();
  await page.locator('#btnDelete').click(); assert(await page.locator('#deletePhotoNote').isVisible()); assert(await page.locator('#deleteIconsNote').isVisible());
  assert.equal(await page.locator('#deleteTitle').textContent(), 'Delete this frame?');
  fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, 'delete-confirmation-desktop.png') });
  await cancel.click(); assert.equal(await page.evaluate(id => stickerApp.records.get(id).framedIn, photo), frame); assert.equal(await history(), version);
  await page.locator('#ctl-frameCaption').fill('TEST'); await page.keyboard.press('Backspace'); assert(await dialog.isHidden(), 'typing never deletes the frame');
  await page.locator('#btnDelete').click(); await confirm.click();
  assert.equal(await exists(frame), false); assert(await exists(photo)); assert(await exists(icon));
  assert.equal(await page.evaluate(id => stickerApp.scene.get(id).parent, icon), null);
  await page.evaluate(() => stickerApp.undo()); assert(await exists(frame));
  assert.equal(await page.evaluate(id => stickerApp.records.get(id).framedIn, photo), frame);
  assert.equal(await page.evaluate(id => stickerApp.scene.get(id).parent.id, icon), frame);
  console.log('PASS frame/photo/attached-icon consequences, cancel preserves ownership, text editing and full group restoration');

  await select(frame); await page.locator('[data-locale="zh-TW"]').click(); await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => stickerApp.deleteSelected());
  assert.equal(await page.locator('#deleteTitle').textContent(), '要刪除這個相框嗎？');
  const bounds = await dialog.boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(OUT, 'delete-confirmation-mobile.png') });
  await page.keyboard.press('Escape'); assert(await dialog.isHidden()); assert(await exists(frame));
  assert.deepEqual(errors, []); console.log('PASS Traditional Chinese, mobile modal bounds and no browser errors');
} finally { await browser?.close(); server.close(); }
