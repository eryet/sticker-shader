/* Motion authoring usability: focus, picker dismissal and persistent actions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'test/.out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' }), errors = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message)); await page.route('https://**', r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.stickerApp);
  await page.evaluate(() => stickerApp.addIcon('heart', { settings: { iconBlink: false, stickerScale: .65 } }));
  await page.waitForFunction(() => stickerApp.scene.selected?.tex);
  await page.evaluate(() => stickerApp.motionDesigner.open());
  assert.equal(await page.locator('[data-recipe="slide"]').getAttribute('aria-pressed'), 'true');
  assert(await page.locator('#motionPoseFields').isHidden());
  assert(await page.locator('.topbar-actions').isHidden());
  await page.locator('#motion-easing').focus(); await page.locator('#motion-easing').selectOption('linear');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'motion-easing');
  await page.locator('#motion-light').click();
  assert(await page.locator('#motion-light').evaluate(el => el.matches(':open')));
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => !!stickerApp.motionDesigner.draft), 'Escape dismisses a picker without cancelling motion');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'motion-light');
  await page.locator('#motion-light').click(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'motion-light');
  await page.locator('[data-recipe="float"]').click();
  assert.equal(await page.locator('[data-recipe="float"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.recipe), 'float');
  await page.locator('[data-endpoint="end"]').click();
  assert(await page.locator('#motionPoseFields').isVisible());
  assert.equal(await page.evaluate(() => document.activeElement.dataset.endpoint), 'end');
  await page.evaluate(() => { window.poseInput = document.getElementById('motion-x'); document.querySelector('.motion-light').open = false; });
  await page.locator('#motion-duration').fill('3'); await page.locator('#motion-duration').press('Tab');
  assert(await page.evaluate(() => window.poseInput === document.getElementById('motion-x')));
  assert.equal(await page.locator('.motion-style-status').textContent(), 'Custom motion');
  assert.equal(await page.locator('.motion-light').evaluate(el => el.open), false);
  await page.locator('#motionUndo').click();
  assert.equal(await page.locator('[data-recipe="float"]').getAttribute('aria-pressed'), 'true');
  // A cancelled canvas gesture must leave a previously available Redo intact.
  const grip = await page.locator('.motion-grip.move').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 20, grip.y + grip.height / 2 + 10);
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert(await page.locator('#motionRedo').isEnabled());
  await page.locator('#motionRedo').click(); assert.equal(await page.locator('#motion-duration').inputValue(), '3');
  await page.locator('#motion-mode').selectOption('once');
  assert(await page.locator('#motion-holdStart').isHidden());
  await page.locator('.motion-light summary').click();
  await page.locator('#motion-light').selectOption('keep');
  assert(await page.locator('.motion-sweep-fields').isHidden());
  await page.locator('#motion-light').selectOption('orbit');
  assert(await page.locator('.motion-sweep-fields').isVisible());
  assert.equal(await page.locator('#motion-lightEnd').getAttribute('max'), '100');
  console.log('PASS picker Escape, select/recipe/pose focus, stable controls, draft history and contextual fields');
  for (const locale of ['en', 'zh-TW']) {
    await page.evaluate(locale => I18N.setLocale(locale), locale);
    for (const [width, height] of [[1440, 900], [900, 700], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#motion-light').scrollIntoViewIfNeeded();
      const layout = await page.evaluate(() => {
        const b = document.getElementById('motionApply').getBoundingClientRect(), scroll = document.querySelector('.motion-scroll');
        const bar = document.getElementById('motionTransport').getBoundingClientRect(), panel = document.querySelector('.panel-wrap').getBoundingClientRect();
        return { applyVisible: b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth && !!document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('#motionApply'),
          overflow: scroll.scrollWidth > scroll.clientWidth + 1, pageOverflow: document.documentElement.scrollWidth > innerWidth,
          transportFits: bar.left >= 0 && bar.right <= innerWidth && (innerWidth > 960 || bar.bottom <= panel.top + 1) };
      });
      assert(layout.applyVisible && !layout.overflow && !layout.pageOverflow && layout.transportFits, `${locale} ${width}: ${JSON.stringify(layout)}`);
    }
    await page.setViewportSize({ width: locale === 'en' ? 1440 : 390, height: locale === 'en' ? 900 : 844 });
    await page.evaluate(() => { document.querySelector('.motion-scroll').scrollTop = 0; });
    await page.screenshot({ path: path.join(OUT, `motion-ui-${locale}.png`) });
  }
  await page.locator('[data-endpoint="preview"]').click(); assert(await page.locator('#motionPoseFields').isHidden());
  // Tab must skip the hidden/disabled pose inputs and the custom select's internal button.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => { const el = document.activeElement; return el !== document.body && !el.matches(':disabled') && !el.closest('[hidden]') && (el.tagName === 'SELECT' || !el.closest('select')); }));
  }
  await page.locator('#motionApply').click(); assert.equal(await page.evaluate(() => !!stickerApp.motionDesigner.draft), false);
  assert.equal(await page.evaluate(() => stickerApp.selected.motionClip.duration), 3);
  assert(await page.locator('.topbar-actions').isVisible());
  await page.evaluate(() => stickerApp.motionDesigner.open());
  await page.locator('#motion-duration').fill('5'); await page.locator('#motion-duration').press('Tab');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => stickerApp.selected.motionClip.duration), 3);
  assert.equal(await page.evaluate(() => !!stickerApp.motionDesigner.draft), false);
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-TW' });
  phone.setDefaultTimeout(15000); phone.on('pageerror', e => errors.push(e.message)); await phone.route('https://**', r => r.abort());
  await phone.goto(`http://127.0.0.1:${server.address().port}/`); await phone.waitForFunction(() => window.stickerApp);
  await phone.evaluate(() => stickerApp.addIcon('star', { settings: { iconBlink: false } }));
  await phone.waitForFunction(() => stickerApp.scene.selected?.tex); await phone.evaluate(() => stickerApp.motionDesigner.open());
  await phone.locator('[data-endpoint="end"]').tap();
  await phone.locator('#motion-duration').scrollIntoViewIfNeeded();
  for (const selector of ['#motionApply', '#motionCancel', '#motionClose', '#motionPlay', '#motionUndo', '[data-endpoint="end"]']) {
    const box = await phone.locator(selector).boundingBox(); assert(box.height >= 44, selector);
  }
  const phoneApply = await phone.locator('#motionApply').boundingBox(); assert(phoneApply.y + phoneApply.height <= 844);
  await phone.evaluate(() => { document.querySelector('.motion-scroll').scrollTop = 0; });
  await phone.screenshot({ path: path.join(OUT, 'motion-ui-touch.png') });
  await phone.locator('#motionCancel').tap(); assert.equal(await phone.evaluate(() => !!stickerApp.motionDesigner.draft), false);
  assert.deepEqual(errors, []);
  console.log('PASS persistent Apply/Cancel, EN/ZH desktop/mobile layout, timeline fit, keyboard traversal and apply/cancel');
} finally { await browser?.close(); server.closeAllConnections(); server.close(); }
