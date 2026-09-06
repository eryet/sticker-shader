/* Focused attachment regression: node test/sticking.mjs
 * Uses Playwright; PLAYWRIGHT_MODULE and PLAYWRIGHT_EXECUTABLE_PATH may override the defaults.
 * A synthetic alpha mask keeps this independent of model downloads.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.stickerApp);
  const photoId = await page.evaluate(async () => {
    Segmenter.autoDetect = async canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return { mask: Float32Array.from({ length: canvas.width * canvas.height }, (_, i) => pixels[i * 4 + 3] / 255), labels: ['sample'] };
    };
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f7c6d4'; ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI * 2); ctx.fill();
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    return (await stickerApp.addSticker(blob, 'Circle photo')).id;
  });
  await page.waitForFunction(id => stickerApp.scene.get(id)?.phase === 'ready', photoId);
  const iconId = await page.evaluate(id => {
    const sc = stickerApp.scene, photo = sc.get(id);
    Object.assign(photo.settings, { anim: 'none', idleSway: 0, hoverTilt: 0, dragLean: 0, baseRotation: 0 });
    photo.x = photo.restX = sc.stageW * 0.4; photo.y = photo.restY = sc.stageH * 0.45;
    sc.select(photo);
    return stickerApp.addIcon('star', { settings: { stickerScale: 0.15, anim: 'none', idleSway: 0, baseRotation: 0 } }).id;
  }, photoId);
  const parentOf = id => page.evaluate(id => stickerApp.scene.get(id)?.parent?.id || null, id);
  assert.equal(await parentOf(iconId), photoId);
  const secondId = await page.evaluate(() => stickerApp.addIcon('heart').id);
  assert.equal(await parentOf(secondId), photoId, 'adding while an attached icon is selected keeps decorating its photo');
  await page.evaluate(() => stickerApp.deleteSelected());
  const offId = await page.evaluate(id => {
    stickerApp.scene.select(stickerApp.scene.get(id));
    return stickerApp.addIcon('bow', { settings: { iconStick: false } }).id;
  }, photoId);
  assert.equal(await parentOf(offId), null, 'new icons respect an explicitly disabled stick setting');
  await page.evaluate(() => stickerApp.deleteSelected());
  console.log('PASS adding icons to selected photos and continuing decoration');

  const position = id => page.evaluate(id => { const e = stickerApp.scene.get(id); return { x: e.x, y: e.y }; }, id);
  const drag = async (id, to) => {
    const from = await position(id), box = await page.locator('#glCanvas').boundingBox();
    await page.mouse.move(box.x + from.x, box.y + from.y); await page.mouse.down();
    for (let i = 1; i <= 18; i++) {
      await page.mouse.move(box.x + from.x + (to.x - from.x) * i / 18, box.y + from.y + (to.y - from.y) * i / 18);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(250); await page.mouse.up(); await page.waitForTimeout(650);
  };
  await page.waitForTimeout(500);
  const photoBefore = await position(photoId), iconBefore = await position(iconId);
  await drag(photoId, { x: photoBefore.x + 130, y: photoBefore.y + 65 });
  const photoAfter = await position(photoId), iconAfter = await position(iconId);
  assert(photoAfter.x - photoBefore.x > 100, 'photo really moved');
  assert(Math.abs((iconAfter.x - iconBefore.x) - (photoAfter.x - photoBefore.x)) < 5);
  assert(Math.abs((iconAfter.y - iconBefore.y) - (photoAfter.y - photoBefore.y)) < 5);
  await page.evaluate(() => stickerApp.undo()); await page.waitForTimeout(600);
  assert(Math.abs((await position(iconId)).x - iconBefore.x) < 5, 'undo carries the attached icon back');
  await page.evaluate(() => stickerApp.redo()); await page.waitForTimeout(600);
  await drag(iconId, { x: 65, y: 65 });
  assert.equal(await parentOf(iconId), null, 'drag away detaches');
  await page.evaluate(() => stickerApp.undo());
  assert.equal(await parentOf(iconId), photoId, 'undo restores attachment');
  await page.evaluate(() => stickerApp.redo());
  assert.equal(await parentOf(iconId), null, 'redo restores detachment');
  await drag(iconId, await position(photoId));
  assert.equal(await parentOf(iconId), photoId, 'drop on a photo attaches');
  console.log('PASS dragging, following, detaching, and undo/redo');

  await page.locator('#ctl-iconStick').uncheck(); assert.equal(await parentOf(iconId), null);
  await page.evaluate(() => stickerApp.undo()); assert.equal(await parentOf(iconId), photoId);
  await page.evaluate(() => stickerApp.redo()); assert.equal(await parentOf(iconId), null);
  await page.locator('#ctl-iconStick').check(); assert.equal(await parentOf(iconId), photoId);
  const resized = await page.evaluate(({ photoId, iconId }) => {
    const sc = stickerApp.scene, p = sc.get(photoId), icon = sc.get(iconId);
    icon.x = p.x + 60; icon.y = p.y; sc.attach(icon, p);
    p.settings.stickerScale *= 0.7; sc.relayout(p);
    return { x: p.x + icon.offset.u * sc.size(p).w, y: p.y + icon.offset.v * sc.size(p).h };
  }, { photoId, iconId });
  await page.waitForTimeout(800);
  assert(Math.abs((await position(iconId)).x - resized.x) < 3, 'offset follows parent resize');
  await page.evaluate(id => { stickerApp.scene.select(stickerApp.scene.get(id)); stickerApp.deleteSelected(); }, photoId);
  assert.equal(await parentOf(iconId), null);
  await page.evaluate(() => stickerApp.undo()); assert.equal(await parentOf(iconId), photoId);
  console.log('PASS stick toggle, resizing, parent deletion and restoration');

  const frameId = await page.evaluate(() => stickerApp.addFrame({ quiet: true, settings: { baseRotation: 0 } }).id);
  const targets = await page.evaluate(({ photoId, iconId, frameId }) => {
    const sc = stickerApp.scene, p = sc.get(photoId), icon = sc.get(iconId), f = sc.get(frameId);
    f.x = f.restX = p.x; f.y = f.restY = p.y;
    icon.x = p.x; icon.y = p.y;
    const top = sc.dropTargetFor(icon, { x: icon.x, y: icon.y })?.id;
    sc.onDropTarget(p);
    const onDrop = sc.onDrop(icon, f);
    const photo = stickerApp.records.get(frameId).frame.photoId;
    // Move the frame away and probe a transparent corner of the circular photo's atlas.
    f.x = f.restX = sc.stageW + 1000;
    const size = sc.size(p);
    icon.x = p.x - size.w * 0.49; icon.y = p.y - size.h * 0.49;
    const corner = sc.dropTargetFor(icon, { x: icon.x, y: icon.y });
    icon.x = p.x; icon.y = p.y; sc.attach(icon, p);
    f.x = f.restX = p.x; f.y = f.restY = p.y;
    return { top, onDrop, photo, corner: corner?.id || null };
  }, { photoId, iconId, frameId });
  assert.equal(targets.top, photoId, 'topmost photo wins over the frame underneath');
  assert.equal(targets.onDrop, false, 'icon drop never tries to fill the photo window');
  assert.equal(targets.photo, '');
  assert.equal(targets.corner, null, 'transparent photo corners do not attract icons');
  await page.evaluate(({ photoId, frameId }) => stickerApp.setFramePhoto(stickerApp.records.get(frameId), photoId), { photoId, frameId });
  assert.equal(await parentOf(iconId), frameId);
  await page.evaluate(() => stickerApp.undo()); assert.equal(await parentOf(iconId), photoId);
  await page.evaluate(() => stickerApp.redo()); assert.equal(await parentOf(iconId), frameId);
  await page.evaluate(() => stickerApp.undo());
  const svg = await page.evaluate(id => stickerApp.animatedSvg(stickerApp.scene.get(id)), photoId);
  assert((svg.match(/<image /g) || []).length >= 2, 'animated SVG includes the attached icon');
  console.log('PASS cutout targeting, frame compatibility, framing undo/redo, and animated SVG');

  await page.evaluate(id => stickerApp.scene.select(stickerApp.scene.get(id)), iconId);
  await page.click('#langSwitch button[data-locale="zh-TW"]');
  assert(await page.getByText('黏在貼紙或相框上', { exact: true }).isVisible());
  assert.deepEqual(errors, []);
  fs.mkdirSync(path.join(ROOT, 'test/.out'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'test/.out/sticker-attachment.png') });
  console.log('PASS translated control and no browser errors');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
