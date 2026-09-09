/* Interactive welcome stickers, sample intake, localization and reduced motion. */
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
  await page.goto(url); await page.waitForFunction(() => window.stickerApp);
  await page.evaluate(() => { Segmenter.autoDetect = async c => ({ mask: new Float32Array(c.width * c.height).fill(1), labels: [] }); });
  const icons = page.locator('.empty-sticker'); assert.equal(await icons.count(), 5);
  for (const locale of ['en', 'zh-TW']) {
    await page.evaluate(locale => I18N.setLocale(locale), locale);
    assert.equal(await page.locator('[data-welcome-icon="heart"]').getAttribute('aria-label'), locale === 'en' ? 'Add Heart' : '加入 愛心');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const b = await page.locator('.empty').boundingBox(); assert(b.x >= 0 && b.x + b.width <= width + 1);
      await page.locator('.empty-actions').evaluate(el => { if (el.scrollWidth > el.clientWidth) throw new Error('Welcome actions overflow'); });
      if (width !== 320) await page.locator('.empty').screenshot({path:path.join(OUT, `welcome-${locale}-${width}.png`)});
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await icons.first().evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.sample-spark').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.locator('[data-welcome-icon="heart"]').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => stickerApp.selected.icon), 'heart');
  assert(await page.locator('#dropzone').evaluate(el => el.classList.contains('hidden')));
  assert(await page.locator('#propertiesTab').evaluate(el => el === document.activeElement));
  await page.evaluate(() => stickerApp.undo()); assert(await icons.first().isVisible());
  await page.locator('[data-welcome-icon="teacup"]').click(); assert.equal(await page.evaluate(() => stickerApp.selected.icon), 'teacup');
  await page.evaluate(() => stickerApp.undo());
  await page.locator('.welcome-sample').click();
  await page.waitForFunction(() => stickerApp.selected?.atlas && stickerApp.selected.name === 'sample-cat.png');
  assert.equal(await page.evaluate(() => stickerApp.records.size), 1);
  assert.deepEqual(errors, []);
  console.log('PASS welcome sticker mouse/keyboard actions, undo, sample creation, localization, small layouts and reduced motion');
} finally { await browser?.close(); server.close(); }
