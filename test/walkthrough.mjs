/* Feature guide: read-only navigation, restored UI, localization, and viewport layout. */
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
fs.mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.route('https://**', r => r.abort());
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => window.stickerApp?.tour);
  const tour = page.locator('#walkthrough'), next = page.locator('#tourNext'), jump = page.locator('#tourJump');
  const snapshot = () => page.evaluate(() => ({ scene: stickerApp.serializeScene(), selected: stickerApp.selected?.id || null,
    settings: [...stickerApp.records.values()].map(r => [r.id, { ...r.settings }, r.framedIn]),
    history: [stickerApp.history.undo.length, stickerApp.history.redo.length], size: stickerApp.records.size }));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bounds = async () => {
    await settle();
    const b = await page.evaluate(() => {
      const r = document.querySelector('#tourCard').getBoundingClientRect(), s = document.querySelector('#tourSpotlight');
      const sr = s.getBoundingClientRect(), footer = document.querySelector('#tourNext').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, bottom: footer.bottom,
        spot: s.hidden ? null : { x: sr.x, y: sr.y, w: sr.width, h: sr.height }, step: stickerApp.tour.step,
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= b.vw + 1 && b.y + b.h <= b.vh, JSON.stringify(b));
    assert(b.bottom <= b.vh, `footer visible: ${JSON.stringify(b)}`); assert(!b.overflow, `horizontal overflow: ${JSON.stringify(b)}`);
    if (b.spot && b.vw <= 960) assert(b.spot.y + b.spot.h <= b.y + 1, `spotlight above mobile card: ${JSON.stringify(b)}`);
    return b;
  };
  assert(await page.locator('#tourInvite').isVisible()); assert(await tour.isHidden(), 'invitation does not interrupt editing');
  const empty = await snapshot(); await page.locator('#tourInviteStart').click(); assert(await tour.isVisible()); await bounds();
  assert(await page.locator('#tourTitle').evaluate(el => el === document.activeElement));
  await page.keyboard.press('Shift+Tab'); assert(await next.evaluate(el => el === document.activeElement));
  await page.keyboard.press('Tab'); assert(await page.locator('#tourClose').evaluate(el => el === document.activeElement));
  await page.screenshot({ path: path.join(OUT, 'walkthrough-welcome.png') });
  const ids = await page.evaluate(() => StickerTour.STEPS.map(s => s.id));
  for (let i = 0; i < ids.length; i++) {
    assert.equal(await tour.getAttribute('data-step'), ids[i]); await bounds();
    assert.equal(await page.locator('#tourCount').textContent(), `Step ${i + 1} of ${ids.length}`);
    if (['border', 'icons', 'export'].includes(ids[i])) await page.screenshot({ path: path.join(OUT, `walkthrough-${ids[i]}.png`) });
    if (i < ids.length - 1) await next.click();
  }
  assert.deepEqual(await snapshot(), empty, 'empty-canvas tour has no scene/history side effects');
  await next.click(); assert(await tour.isHidden());
  assert.equal(await page.evaluate(() => localStorage.getItem(StickerTour.KEY)), 'completed');
  await page.reload(); await page.waitForFunction(() => stickerApp?.tour); assert(await page.locator('#tourInvite').isHidden());
  await page.locator('#btnGuide').click(); await next.click(); await page.keyboard.press('ArrowRight');
  assert.equal(await tour.getAttribute('data-step'), 'canvas'); await page.keyboard.press('ArrowLeft');
  assert.equal(await tour.getAttribute('data-step'), 'import'); await page.locator('#tourBack').click();
  assert.equal(await tour.getAttribute('data-step'), 'welcome'); await page.keyboard.press('Escape');
  assert(await tour.isHidden()); assert(await page.locator('#btnGuide').evaluate(el => el === document.activeElement));
  console.log('PASS all feature steps on an empty canvas, first-visit invitation, completion persistence, keyboard and reopen');

  const photo = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#aaccff'; ctx.fillRect(0, 0, 320, 240);
    return (await stickerApp.addSticker(await new Promise(r => c.toBlob(r)), 'My photo.png', { imageMode: 'whole' })).id;
  });
  await page.waitForFunction(id => !!stickerApp.records.get(id)?.atlas, photo);
  const frame = await page.evaluate(() => stickerApp.addFrame({ settings: { ...StickerDecor.FRAME_PRESETS['Starlight rare'], anim: 'none', baseRotation: 0, idleSway: 0 } }).id);
  await page.evaluate(id => {
    stickerApp.addIcon('heart', { settings: { anim: 'none', baseRotation: 0 } });
    stickerApp.scene.select(stickerApp.scene.get(id));
    document.querySelectorAll('.group').forEach(el => { el.classList.add('collapsed'); el.querySelector('.group-head').setAttribute('aria-expanded', 'false'); });
  }, frame);
  await page.locator('#layersTab').click(); await settle();
  const withArt = await snapshot(); await page.locator('#btnGuide').click();
  for (const key of ['Delete', 'Backspace', 'Control+z', 'Control+d', 'Control+Shift+z']) await page.keyboard.press(key);
  const blocked = await page.evaluate(() => {
    stickerApp.deleteSelected();
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented;
  });
  assert(blocked); assert(await page.locator('#deleteDialog').isHidden(), 'no stacked deletion over guide');
  for (let i = 0; i < ids.length; i++) { await jump.selectOption(String(i)); await bounds(); }
  assert.deepEqual(await snapshot(), withArt, 'tour preserves artwork, ownership, settings, selection and history');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#layersTab').getAttribute('aria-selected'), 'true');
  assert(await page.evaluate(() => [...document.querySelectorAll('.group')].every(el => el.classList.contains('collapsed'))));
  await page.locator('#propertiesTab').click();
  await page.evaluate(() => {
    document.querySelector('[data-group="frame"]').classList.remove('collapsed');
    document.querySelector('.frame-collection').open = false;
    document.querySelector('#panel').scrollTop = 160;
    document.querySelector('#exportMenuWrap').open = true;
  });
  const scroll = await page.locator('#panel').evaluate(el => el.scrollTop);
  await page.evaluate(() => stickerApp.tour.start()); await jump.selectOption(String(ids.indexOf('frames'))); await bounds();
  assert(await page.locator('.frame-collection').evaluate(el => el.open), 'tour reveals a previously closed frame gallery');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#panel').evaluate(el => el.scrollTop), scroll);
  assert(await page.locator('#exportMenuWrap').evaluate(el => el.open));
  assert.equal(await page.locator('.frame-collection').evaluate(el => el.open), false);
  console.log('PASS scene isolation, modal keyboard/paste guards, layer/group/menu/scroll restoration');

  // Every tour sentence is translated, including variable animation counts.
  await page.evaluate(() => { document.querySelector('#exportMenuWrap').open = false; I18N.setLocale('zh-TW'); document.querySelector('.frame-collection').open = false; stickerApp.tour.start(); });
  const untranslated = await page.evaluate(() => StickerTour.STEPS.flatMap(s => [s.chapter, s.title, s.text, ...s.points]).filter(s => I18N.t(s) === s));
  assert.deepEqual(untranslated, []);
  await page.setViewportSize({ width: 390, height: 844 });
  for (let i = 0; i < ids.length; i++) {
    await jump.selectOption(String(i)); const b = await bounds();
    if (['icons', 'border', 'animation', 'export'].includes(ids[i])) {
      assert(b.spot, `visible mobile highlight for ${ids[i]}`);
      await page.screenshot({ path: path.join(OUT, `walkthrough-mobile-${ids[i]}.png`) });
    }
  }
  await page.evaluate(() => I18N.setLocale('en')); assert.equal(await page.locator('#tourTitle').textContent(), 'Your next sticker starts here');
  await page.setViewportSize({ width: 390, height: 520 });
  for (const id of ['welcome', 'cutout', 'animation', 'export']) { await jump.selectOption(String(ids.indexOf(id))); await bounds(); }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await jump.selectOption(String(ids.indexOf('animation'))); await settle();
  const pixels = () => page.locator('.tour-motion').evaluate(c => c.toDataURL());
  const still = await pixels(); await page.waitForTimeout(150); assert.equal(await pixels(), still, 'reduced-motion preview stays still');
  await page.keyboard.press('Escape');
  // Resizing the canvas recomputes attached icons' world positions; their saved
  // parent-relative offsets, settings and ownership must remain identical.
  const durable = s => ({ ...s, scene: { ...s.scene, items: s.scene.items.map(item => item.p == null ? item : { ...item, x: 0, y: 0 }) } });
  assert.deepEqual(durable(await snapshot()), durable(withArt));
  assert.equal(await page.locator('.frame-collection').evaluate(el => el.open), false, 'detail state survives localized panel rebuilds');
  console.log('PASS Chinese translation, all mobile steps, short viewport, live locale change and reduced motion');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(id => stickerApp.setFramePhoto(stickerApp.records.get(id), ''), frame);
  await page.evaluate(id => { stickerApp.scene.select(stickerApp.scene.get(id)); stickerApp.enterEditor(); }, photo);
  const editState = () => page.evaluate(() => ({ mode: stickerApp.state.mode, maskVersion: stickerApp.selected.maskVersion, history: stickerApp.selected.history.length }));
  const editorBefore = await editState(); assert.equal(editorBefore.mode, 'edit');
  await page.locator('#btnGuide').click(); await jump.selectOption(String(ids.indexOf('cutout'))); await bounds();
  await page.keyboard.press('e'); await page.keyboard.press('l'); await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape'); assert.deepEqual(await editState(), editorBefore, 'editor and mask remain unchanged');
  await page.evaluate(() => stickerApp.exitEditor());
  await page.evaluate(id => { stickerApp.scene.select(stickerApp.scene.get(id)); stickerApp.selected.settings.borderStyle = 'rainbow'; stickerApp.lockObject(id); }, frame);
  const locked = await snapshot();
  await page.locator('#btnGuide').click(); await jump.selectOption(String(ids.indexOf('colour')));
  assert((await bounds()).spot, 'rainbow border without colour inputs still gets a useful highlight');
  await page.keyboard.press('Escape'); assert.deepEqual(durable(await snapshot()), durable(locked));
  console.log('PASS active cutout sessions, locked items and rainbow-border fallback');

  // Storage is optional: privacy settings must not break the guide or app.
  const restricted = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  await restricted.route('https://**', r => r.abort());
  await restricted.addInitScript(() => { Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage disabled'); }; });
  restricted.on('pageerror', e => errors.push(e.message));
  await restricted.goto(url); await restricted.waitForFunction(() => window.stickerApp?.tour);
  const inviteBounds = await restricted.locator('#tourInvite').boundingBox(), stageBounds = await restricted.locator('#stage').boundingBox();
  const emptyBounds = await restricted.locator('.empty').boundingBox();
  assert(emptyBounds.x >= 0 && emptyBounds.x + emptyBounds.width <= 390, 'mobile welcome card fits horizontally');
  assert(inviteBounds.y + inviteBounds.height <= stageBounds.y + stageBounds.height, 'mobile invitation fits inside the canvas');
  await restricted.screenshot({ path: path.join(OUT, 'walkthrough-mobile-invitation.png') });
  await restricted.locator('#tourInviteDismiss').click(); assert(await restricted.locator('#tourInvite').isHidden());
  await restricted.locator('#btnGuide').click(); assert(await restricted.locator('#walkthrough').isVisible()); await restricted.keyboard.press('Escape');
  assert.deepEqual(errors, []); console.log('PASS disabled storage and zero browser errors');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
