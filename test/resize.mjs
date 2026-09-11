/* Corner transforms and proportional attachment sizing through real editor UI. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'test/.out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const close = (a, b, message, tolerance = .01) => assert(Math.abs(a - b) < tolerance, `${message}: ${a} vs ${b}`);
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.route('https://**', r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.stickerApp);
  const ids = await page.evaluate(() => {
    I18N.setLocale('en');
    const settings = { anim: 'none', idleSway: 0, hoverTilt: 0, surfaceEffect: 'none', workingRes: '512', baseRotation: 0 };
    const frame = stickerApp.addFrame({ settings: { ...settings, stickerScale: .55, frameDecor: 'none', baseRotation: 27 } });
    const icon = stickerApp.addIcon('star', { settings: { ...settings, stickerScale: .2, iconBlink: false } });
    const nested = stickerApp.addIcon('heart', { settings: { ...settings, stickerScale: .12, iconBlink: false } });
    const other = stickerApp.addIcon('cloud', { settings: { ...settings, stickerScale: .25, iconStick: false } });
    return { frame: frame.id, icon: icon.id, nested: nested.id, other: other.id };
  });
  await page.waitForFunction(ids => Object.values(ids).every(id => stickerApp.scene.get(id)?.tex), ids);
  await page.evaluate(ids => {
    const sc = stickerApp.scene; sc.stop(); sc.time += 5;
    for (const e of sc.stickers) { e.spawn = 0; e.rotZ = -e.settings.baseRotation * Math.PI / 180; e.rotX = e.rotY = e.ax = e.ay = e.vx = e.vy = 0; }
    const frame = sc.get(ids.frame), icon = sc.get(ids.icon), nested = sc.get(ids.nested), other = sc.get(ids.other);
    frame.x = frame.restX = 475; frame.y = frame.restY = 470; frame.rotX = .12; frame.rotY = -.16;
    sc.attach(icon, frame); icon.offset = { u: .25, v: -.2 };
    sc.attach(nested, icon); nested.offset = { u: .3, v: .2 };
    sc.detach(other); other.x = other.restX = 100; other.y = other.restY = 650;
    sc.translateResize(frame, 0, 0); sc.select(frame); sc.render();
  }, ids);
  const state = () => page.evaluate(() => ({ history: stickerApp.history.undo.length, items: stickerApp.scene.stickers.map(e => ({ id: e.id, scale: e.settings.stickerScale, x: e.x, y: e.y, parent: e.parent?.id, offset: e.offset ? { ...e.offset } : null })) }));
  const geometry = () => page.evaluate(() => stickerApp.scene.resizeGeometry().points);
  async function drag(corner, ratio, end = true) {
    const points = await geometry(), tip = points[corner], anchor = points[(corner + 2) % 4];
    const handle = await page.locator(`.resize-handle[data-corner="${corner}"]`).boundingBox();
    const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + (tip.x - anchor.x) * (ratio - 1), y + (tip.y - anchor.y) * (ratio - 1), { steps: 6 });
    if (end) await page.mouse.up();
  }
  assert.equal(await page.locator('.resize-handle:visible').count(), 0);
  assert.equal(await page.locator('#showResizeHandles').isChecked(), false);
  const viewBefore = await state();
  await page.locator('#showResizeHandles').check();
  assert.equal(await page.locator('.resize-handle:visible').count(), 4);
  await page.locator('#showResizeHandles').uncheck();
  assert.equal(await page.locator('.resize-handle:visible').count(), 0);
  assert.deepEqual(await state(), viewBefore, 'visibility does not change artwork or undo history');
  await page.locator('#showResizeHandles').check();
  const before = await state(), beforeCorners = await geometry();
  await drag(2, 1.24);
  const after = await state(), afterCorners = await geometry();
  const factor = after.items[0].scale / before.items[0].scale;
  assert(factor > 1.18 && factor < 1.3);
  close(afterCorners[0].x, beforeCorners[0].x, 'fixed opposite corner x'); close(afterCorners[0].y, beforeCorners[0].y, 'fixed opposite corner y');
  for (const id of [ids.icon, ids.nested]) close(after.items.find(e => e.id === id).scale / before.items.find(e => e.id === id).scale, factor, 'nested group proportions', 1e-9);
  assert.deepEqual(after.items.find(e => e.id === ids.other), before.items.find(e => e.id === ids.other));
  assert.equal(after.history, before.history + 1);
  await page.evaluate(() => stickerApp.undo()); assert.deepEqual((await state()).items, before.items);
  await page.evaluate(() => stickerApp.redo()); assert.deepEqual((await state()).items, after.items);
  await drag(1, 1.12, false); assert(await page.evaluate(() => !!stickerApp.scene.resizing));
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual((await state()).items, after.items); assert.equal((await state()).history, after.history);
  console.log('PASS rotated + tilted corner anchor, nested group scale, unrelated artwork, single Undo/Redo, Escape rollback');

  await page.locator('.object-resize-together').click();
  const solo = await state(); await drag(3, .9);
  const soloAfter = await state();
  assert(soloAfter.items[0].scale < solo.items[0].scale);
  for (const id of [ids.icon, ids.nested]) assert.equal(soloAfter.items.find(e => e.id === id).scale, solo.items.find(e => e.id === id).scale);
  await page.locator('.object-resize-together').click();
  const sliderBefore = await state();
  await page.locator('#ctl-stickerScale-frame').evaluate(el => { el.value = '1.1'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const sliderAfter = await state(), sliderFactor = 1.1 / sliderBefore.items[0].scale;
  close(sliderAfter.items[0].scale, 1.1, 'slider');
  close(sliderAfter.items.find(e => e.id === ids.icon).scale, sliderBefore.items.find(e => e.id === ids.icon).scale * sliderFactor, 'slider scales child');
  await page.evaluate(() => stickerApp.undo()); assert.deepEqual((await state()).items, sliderBefore.items);
  await page.evaluate(() => { const sc = stickerApp.scene, e = sc.selected; sc.canvas.dispatchEvent(new WheelEvent('wheel', { clientX: sc.canvas.getBoundingClientRect().left + e.x, clientY: sc.canvas.getBoundingClientRect().top + e.y, deltaY: -100, bubbles: true, cancelable: true })); });
  const wheel = await state(); close(wheel.items[1].scale / sliderBefore.items[1].scale, wheel.items[0].scale / sliderBefore.items[0].scale, 'wheel group ratio', 1e-9);
  await page.locator('.resize-handle[data-corner="2"]').focus(); await page.keyboard.press('ArrowUp');
  assert((await state()).items[0].scale > wheel.items[0].scale);
  console.log('PASS individual mode, group slider + wheel + keyboard and undo');

  const touch = await page.evaluate(() => {
    const sc = stickerApp.scene, button = document.querySelector('.resize-handle[data-corner="2"]'), b = button.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    const before = sc.selected.settings.stickerScale, history = stickerApp.history.undo.length;
    const send = (type, dx = 0) => button.dispatchEvent(new PointerEvent(type, { pointerId: 51, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y + dx, bubbles: true, cancelable: true }));
    send('pointerdown'); send('pointermove', 45); const grown = sc.selected.settings.stickerScale;
    send('pointercancel'); const cancelled = sc.selected.settings.stickerScale;
    send('pointerdown'); send('pointermove', 45); send('pointerup', 45);
    return { before, grown, cancelled, final: sc.selected.settings.stickerScale, history, finalHistory: stickerApp.history.undo.length, resizing: !!sc.resizing };
  });
  assert(touch.grown > touch.before); assert.equal(touch.cancelled, touch.before); assert(touch.final > touch.before); assert.equal(touch.finalHistory, touch.history + 1); assert(!touch.resizing);
  await page.evaluate(id => stickerApp.lockObject(id), ids.icon); await page.evaluate(() => stickerApp.scene.render());
  assert.equal(await page.locator('.resize-handle:disabled').count(), 4);
  const locked = await state();
  await page.locator('#ctl-stickerScale-frame').evaluate(el => { el.value = '2.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.deepEqual((await state()).items, locked.items);
  await page.evaluate(id => stickerApp.lockObject(id), ids.icon);
  await page.locator('.resize-handle[data-corner="2"]').focus(); await page.keyboard.press('End');
  const maximum = await state(); close(maximum.items[0].scale, 2.5, 'root maximum');
  const reach = await page.locator('.resize-handle').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(), stage = document.querySelector('#stage').getBoundingClientRect(); return r.x >= stage.x && r.y >= stage.y && r.right <= stage.right && r.bottom <= stage.bottom; }));
  assert(reach.every(Boolean));
  console.log('PASS touch commit/cancel, locked attachments, shared size cap, reachable oversized handles');

  await page.evaluate(() => { I18N.setLocale('zh-TW'); stickerApp.scene.render(); });
  assert.equal(await page.locator('.object-resize-together span').textContent(), '整組縮放');
  assert.equal(await page.locator('.resize-handle').first().getAttribute('aria-label'), '拖曳左上角縮放');
  assert.equal(await page.locator('label[for="showResizeHandles"] span').textContent(), '顯示縮放控制點');
  await page.evaluate(() => { const sc = stickerApp.scene; const s = sc.captureResize(sc.selected); sc.scaleFrom(s, .65); sc.translateResize(sc.selected, sc.stageW / 2 - sc.selected.x, sc.stageH / 2 - sc.selected.y); sc.render(); });
  fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, 'resize-review.png') });
  assert.deepEqual(errors, []);
  console.log('PASS English/Chinese UI; screenshot test/.out/resize-review.png');

  // A large decoration sets the upper group limit; a tiny one sets its lower limit.
  const limits = await page.evaluate(ids => {
    const sc = stickerApp.scene, root = sc.get(ids.frame), icon = sc.get(ids.icon), small = sc.get(ids.nested);
    const saved = sc.captureResize(root);
    root.settings.stickerScale = .5; icon.settings.stickerScale = 2.4; small.settings.stickerScale = .12;
    const snapshot = sc.captureResize(root); sc.scaleFrom(snapshot, 2.5);
    const upper = [root, icon, small].map(e => e.settings.stickerScale);
    sc.scaleFrom(snapshot, .1); const lower = [root, icon, small].map(e => e.settings.stickerScale);
    sc.restoreResize(saved); sc.render(); return { upper, lower };
  }, ids);
  close(limits.upper[1], 2.5, 'largest child clamps group'); close(limits.upper[0] / .5, 2.5 / 2.4, 'root preserves ratio at child maximum');
  close(limits.lower[2], .1, 'smallest child clamps group'); close(limits.lower[0] / .5, .1 / .12, 'root preserves ratio at child minimum');
  const exported = await page.evaluate(() => {
    const sc = stickerApp.scene, root = sc.selected, saved = sc.captureResize(root);
    const frames = () => sc.animationFrames(root, { size: 96, fps: 2, shadow: false }).frames.map(c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
    const a = frames(); sc.scaleFrom(saved, root.settings.stickerScale * 1.2); const b = frames();
    let max = 0; a.forEach((frame, i) => { const other = b[i]; frame.forEach((v, j) => { max = Math.max(max, Math.abs(v - other[j])); }); });
    sc.restoreResize(saved); sc.render();
    const withUI = sc.snapshotCanvas({ background: null }).toDataURL();
    document.querySelector('#resizeFrame').hidden = true;
    const withoutUI = sc.snapshotCanvas({ background: null }).toDataURL(); sc.render();
    return { max, sameCanvas: withUI === withoutUI, count: a.length };
  });
  assert(exported.count > 1); assert(exported.max <= 1, 'normalized animation keeps identical group proportions'); assert(exported.sameCanvas, 'UI grips do not enter canvas exports');
  console.log('PASS member size limits and unchanged group composition in animation exports; handles excluded from Canvas PNG');

  // Actual requestAnimationFrame pauses, then resumes after cancellation.
  await page.evaluate(() => { const sc = stickerApp.scene; sc.selected.settings.anim = 'drift'; sc.start(); });
  await page.waitForTimeout(180);
  const paused = await page.evaluate(() => {
    const b = document.querySelector('.resize-handle[data-corner="2"]'), r = b.getBoundingClientRect();
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 70, pointerType: 'touch', isPrimary: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
    return { time: stickerApp.scene.time, resizing: !!stickerApp.scene.resizing };
  });
  assert(paused.resizing); await page.waitForTimeout(180); assert.equal(await page.evaluate(() => stickerApp.scene.time), paused.time);
  await page.keyboard.press('Escape'); await page.waitForTimeout(160); assert(await page.evaluate(time => stickerApp.scene.time > time, paused.time));
  await page.evaluate(() => { stickerApp.scene.stop(); stickerApp.scene.selected.settings.anim = 'none'; });
  console.log('PASS live animation pauses throughout the resize and resumes after Escape');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', e => errors.push(e.message)); await mobile.route('https://**', r => r.abort());
  await mobile.goto(`http://127.0.0.1:${server.address().port}/`); await mobile.waitForFunction(() => window.stickerApp);
  const mobileId = await mobile.evaluate(async () => {
    I18N.setLocale('zh-TW');
    const c = document.createElement('canvas'); c.width = 320; c.height = 220;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#c6e3f7'; ctx.fillRect(0, 0, 320, 220); ctx.fillStyle = '#f698be'; ctx.beginPath(); ctx.arc(160, 110, 70, 0, Math.PI * 2); ctx.fill();
    const photo = await stickerApp.addSticker(await new Promise(r => c.toBlob(r)), 'My sticker', { imageMode: 'whole', settings: { stickerScale: .75, idleSway: 0, hoverTilt: 0, baseRotation: 0 } });
    stickerApp.addIcon('heart', { settings: { stickerScale: .15, iconBlink: false } });
    return photo.id;
  });
  await mobile.waitForFunction(id => stickerApp.scene.get(id)?.phase === 'ready', mobileId);
  await mobile.evaluate(id => { const sc = stickerApp.scene; sc.select(sc.get(id)); sc.stop(); sc.time += 5; sc.selected.x = sc.selected.restX = sc.stageW / 2; sc.selected.y = sc.selected.restY = sc.stageH / 2; sc.render(); }, mobileId);
  assert.equal(await mobile.locator('.resize-handle:visible').count(), 0);
  await mobile.locator('#showResizeHandles').check();
  const mobileBounds = await mobile.locator('.resize-handle').evaluateAll(els => els.map(el => { const a = el.getBoundingClientRect(), b = document.querySelector('#stage').getBoundingClientRect(); return a.width >= 44 && a.height >= 44 && a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom; }));
  assert(mobileBounds.every(Boolean)); assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mobile.screenshot({ path: path.join(OUT, 'resize-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS mobile photo sticker, 44px touch targets, Chinese labels, no horizontal overflow');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
