/* Each half of the split button responds independently to pointer, keyboard and touch input. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.HEADER_TEST_OUTPUT || path.join(ROOT, 'test/.out/import-button');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0];
  const file = path.join(ROOT, name === '/' ? 'index.html' : decodeURIComponent(name));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
fs.mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const errors = [];
  const openPage = async options => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US', ...options });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.stickerApp);
    await page.evaluate(() => stickerApp.ready);
    await page.locator('#siteLoader').waitFor({ state: 'hidden' });
    await page.evaluate(() => stickerApp.scene.stop());
    return page;
  };
  const page = await openPage();
  const main = page.locator('#btnAddImages'), toggle = page.locator('#importMenuWrap > summary');
  const settle = () => page.waitForTimeout(220);
  const pose = async label => {
    const result = await page.locator('.image-intake').evaluate(el => {
      const a = el.querySelector('#btnAddImages'), b = el.querySelector('summary');
      const first = a.getBoundingClientRect(), second = b.getBoundingClientRect(), arrow = b.querySelector('.import-chevron').getBoundingClientRect();
      return { y: first.y, otherY: second.y, seam: first.right - second.left, arrowOffset: arrow.y + arrow.height / 2 - second.y - second.height / 2,
        shadow: getComputedStyle(a).boxShadow, otherShadow: getComputedStyle(b).boxShadow,
        mainColor: getComputedStyle(a).backgroundColor, modeColor: getComputedStyle(b).backgroundColor };
    });
    assert(Math.abs(result.seam) < .1 && Math.abs(result.arrowOffset) < .1, `${label}: ${JSON.stringify(result)}`);
    return result;
  };
  await page.mouse.move(400, 150); const idle = await pose('idle');
  assert.equal(idle.y, idle.otherY); assert.equal(idle.shadow, idle.otherShadow);
  await page.locator('.image-intake').screenshot({ path: path.join(OUT, 'idle.png') });
  let choosers = 0; page.on('filechooser', () => choosers++);
  for (const [name, target] of [['upload', main], ['options', toggle]]) {
    const [movingY, stillY, movingColor, stillColor, movingShadow, stillShadow] = name === 'upload'
      ? ['y', 'otherY', 'mainColor', 'modeColor', 'shadow', 'otherShadow']
      : ['otherY', 'y', 'modeColor', 'mainColor', 'otherShadow', 'shadow'];
    await target.hover(); await settle(); const hover = await pose(`${name} hover`);
    assert(hover[movingY] < idle[movingY], `${name} lifts on hover`);
    assert.notEqual(hover[movingColor], idle[movingColor]); assert.notEqual(hover[movingShadow], idle[movingShadow]);
    for (const key of [stillY, stillColor, stillShadow]) assert.equal(hover[key], idle[key], `other half keeps its ${key} during ${name} hover`);
    await page.locator('.image-intake').screenshot({ path: path.join(OUT, `${name}-hover.png`) });
    await page.mouse.down(); await settle(); const pressed = await pose(`${name} pressed`);
    assert(pressed[movingY] > idle[movingY], `${name} depresses on press`);
    for (const key of [stillY, stillColor, stillShadow]) assert.equal(pressed[key], idle[key], `other half keeps its ${key} during ${name} press`);
    await page.locator('.image-intake').screenshot({ path: path.join(OUT, `${name}-pressed.png`) });
    // Releasing away from either half cancels the activation and clears :active.
    await page.mouse.move(400, 150); await page.mouse.up(); await settle();
    const cancelled = await pose(`${name} cancelled`);
    assert.equal(cancelled.y, idle.y); assert.equal(cancelled.otherY, idle.otherY);
    assert(await page.locator('.import-menu').isHidden());
  }
  assert.equal(choosers, 0);
  await toggle.click(); await settle(); const opened = await pose('open');
  assert.equal(opened.y, idle.y); assert.notEqual(opened.modeColor, idle.modeColor);
  const menuBox = await page.locator('.import-menu').boundingBox();
  await page.locator('[data-import-mode="whole"]').hover(); await settle();
  assert.deepEqual(await page.locator('.import-menu').boundingBox(), menuBox, 'menu does not follow button hover motion');
  const menuHovered = await pose('menu hovered');
  assert.equal(menuHovered.y, idle.y); assert.equal(menuHovered.otherY, idle.otherY);
  await main.hover(); await settle();
  const mainHovered = await pose('upload hovered with menu open');
  assert(mainHovered.y < idle.y); assert.equal(mainHovered.otherY, idle.otherY);
  assert.deepEqual(await page.locator('.import-menu').boundingBox(), menuBox);
  await page.locator('[data-import-mode="whole"]').hover(); await settle();
  await page.screenshot({ path: path.join(OUT, 'menu-open.png') });
  await page.locator('[data-import-mode="whole"]').click(); await settle();
  assert(await page.locator('.import-menu').isHidden());
  assert.equal(await page.locator('#importModeGlyph').getAttribute('href'), '#importWholeGlyph');
  assert(await toggle.evaluate(el => el === document.activeElement));
  for (let i = 0; i < 6; i++) await toggle.click();
  await page.mouse.move(400, 150); await settle();
  assert(await page.locator('.import-menu').isHidden());
  assert.equal((await pose('rapid toggle settled')).y, idle.y);
  assert.equal(await page.locator('.import-chevron').evaluate(el => getComputedStyle(el).transform), 'none');
  await main.focus(); await page.keyboard.down('Space'); await settle();
  const keyboardPressed = await pose('Space held');
  assert(keyboardPressed.y > idle.y); assert.equal(keyboardPressed.otherY, idle.otherY); assert.equal(choosers, 0);
  let chooser = page.waitForEvent('filechooser'); await page.keyboard.up('Space'); await chooser;
  chooser = page.waitForEvent('filechooser'); await page.keyboard.press('Enter'); await chooser;
  chooser = page.waitForEvent('filechooser'); await main.click(); await chooser;
  assert.equal(choosers, 3, 'one chooser per Space, Enter and click activation');
  assert(await main.locator('svg').evaluate(el => el.getAnimations({ subtree: true }).length > 0), 'upload click replays its icon');
  console.log('PASS independent hover/press/cancel, stable open menu, rapid toggles, and native upload activation');

  const iconsIdle = () => page.waitForFunction(() => [...document.querySelectorAll('#btnAddImages > svg, .import-mode-icon, .import-choice-art')].every(el => el.getAnimations({ subtree: true }).length === 0));
  const checkIconPulse = async (name, target, other, moving, screenshot = '.image-intake') => {
    await page.mouse.move(400, 150); await iconsIdle();
    await target.hover(); await page.waitForTimeout(300);
    assert.notEqual(await moving.evaluate(el => getComputedStyle(el).transform), 'none', `${name} icon bounces`);
    assert(await target.locator('.header-icon-spark').evaluateAll(nodes => nodes.some(el => +getComputedStyle(el).opacity > .1)), `${name} sparkles appear`);
    assert.equal(await other.locator('svg').first().evaluate(el => el.getAnimations({ subtree: true }).length), 0, `${name} leaves the other icon still`);
    await page.locator(screenshot).screenshot({ path: path.join(OUT, `${name}-icon-motion.png`) });
    await iconsIdle();
    assert.equal(await moving.evaluate(el => getComputedStyle(el).transform), 'none', `${name} returns to its resting pose`);
    assert(await target.locator('.header-icon-spark').evaluateAll(nodes => nodes.every(el => +getComputedStyle(el).opacity === 0)));
  };
  await checkIconPulse('upload', main, toggle, main.locator('svg'));
  await checkIconPulse('whole-image', toggle, main, page.locator('#importModeGlyph'));
  await toggle.click();
  assert(await page.locator('.import-mode-icon').evaluate(el => el.getAnimations({ subtree: true }).length > 0), 'options click replays after hover has finished');
  await page.locator('[data-import-mode="cutout"]').click();
  await checkIconPulse('auto-cutout', toggle, main, page.locator('#importModeGlyph'));
  await page.mouse.move(400, 150); await main.focus(); await iconsIdle();
  await page.keyboard.press('Tab');
  assert(await toggle.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
  assert(await page.locator('.import-mode-icon').evaluate(el => el.getAnimations({ subtree: true }).length > 0), 'keyboard focus animates the focused icon');
  console.log('PASS upload, whole-image and cutout icon motion, independent sparkles, click replay and keyboard focus');

  await page.keyboard.press('Enter');
  const cutoutChoice = page.locator('[data-import-mode="cutout"]'), wholeChoice = page.locator('[data-import-mode="whole"]');
  const choiceBounds = await wholeChoice.boundingBox();
  for (const [name, target, other] of [['cutout-choice', cutoutChoice, wholeChoice], ['whole-choice', wholeChoice, cutoutChoice]]) {
    await checkIconPulse(name, target, other, target.locator('use'), '.import-menu');
    assert.deepEqual(await wholeChoice.boundingBox(), choiceBounds, 'icon motion leaves the menu layout fixed');
    assert.equal(await page.locator('.import-mode-icon').evaluate(el => el.getAnimations({ subtree: true }).length), 0, 'choice hover leaves the header icon still');
  }
  await page.mouse.move(400, 150); await toggle.focus(); await iconsIdle(); await page.keyboard.press('Tab');
  assert(await cutoutChoice.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
  assert(await cutoutChoice.locator('.import-choice-art').evaluate(el => el.getAnimations({ subtree: true }).length > 0));
  await page.keyboard.press('Space');
  assert(await page.locator('.import-menu').isHidden());
  assert.equal(await page.locator('#importMode').getAttribute('data-mode'), 'cutout');
  console.log('PASS independent menu-choice icon motion, fixed card layout, keyboard focus and immediate selection');

  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.mouse.move(400, 150); await settle();
  const reducedIdle = await pose('reduced idle');
  await toggle.hover(); await page.mouse.down(); await settle();
  const reducedPress = await pose('reduced press');
  assert.equal(reducedPress.y, reducedIdle.y); assert.equal(reducedPress.otherY, reducedIdle.otherY);
  await page.mouse.up(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.image-intake').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
  await toggle.click(); await wholeChoice.hover(); await settle();
  assert.equal(await wholeChoice.locator('.import-choice-art').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
  await wholeChoice.click(); assert(await page.locator('.import-menu').isHidden());

  const touch = await openPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touchToggle = touch.locator('#importMenuWrap > summary');
  await touchToggle.tap();
  assert(await touch.locator('.import-mode-icon').evaluate(el => el.getAnimations({ subtree: true }).length > 0), 'tap plays the mode icon animation');
  await touch.waitForTimeout(220);
  const sheet = await touch.locator('.import-menu').boundingBox();
  assert(sheet.x >= 0 && sheet.x + sheet.width <= 390 && sheet.y + sheet.height <= 844, 'touch sheet stays in viewport');
  await touch.locator('[data-import-mode="whole"]').tap(); await touch.waitForTimeout(220);
  assert(await touch.locator('.import-menu').isHidden());
  assert.equal(await touch.locator('#btnAddImages').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42), 0, 'touch leaves no sticky hover lift');
  assert.deepEqual(errors, []);
  console.log('PASS reduced motion and touch without stuck hover or misplaced sheet');
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
