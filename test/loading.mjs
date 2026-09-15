/* Startup waits for real resources, stays usable on failures, and never loads the whole catalog. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.LOADING_TEST_OUTPUT || path.join(ROOT, 'test/.out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
try {
  fs.mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  async function openPage(options = {}) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
    await page.route('https://**', r => r.abort());
    await page.addInitScript(() => { try { localStorage.setItem('sticker-shader-editor:locale', 'en'); } catch (_) {} });
    return page;
  }
  const page = await openPage(), errors = [], imageRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/(pixels|assets\/piknik)\/.*\.(gif|png|webp)/.test(r.url())) imageRequests.push(r.url()); });
  function hold(pattern, complete = r => r.continue()) {
    let release, arrived;
    const requested = new Promise(resolve => { arrived = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    return page.route(pattern, async route => { arrived(); await gate; await complete(route); }).then(() => ({ release, requested }));
  }
  const style = await hold('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: `@font-face {font-family:'Varela Round';src:url('${url}startup-test-font.woff2')}` }));
  const font = await hold('**/startup-test-font.woff2', r => r.abort());
  const catalog = await hold('**/pixels/manifest.json');
  const artwork = await hold('**/reference/4b50b771996bfdfbc32bf74cd2861190.png');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.stickerApp);
  await page.evaluate(() => stickerApp.scene.stop());
  assert(await page.locator('#siteLoader').isVisible());
  assert(!await page.locator('#btnSample').isVisible(), 'unfinished editor is not interactive');
  await page.screenshot({ path: path.join(OUT, 'loading-desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await page.locator('.loading-card').boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.screenshot({ path: path.join(OUT, `loading-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.loading-sticker').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.loading-dots i').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  style.release(); await font.requested;
  assert(await page.locator('#siteLoader').isVisible(), 'font file is a readiness gate, not just its stylesheet');
  font.release(); await catalog.requested;
  assert(await page.locator('#siteLoader').isVisible(), 'catalog is still pending');
  catalog.release(); await artwork.requested;
  assert(await page.locator('#siteLoader').isVisible(), 'reference artwork is still pending');
  artwork.release();
  await page.evaluate(() => stickerApp.ready);
  await page.waitForSelector('#siteLoader', { state: 'detached' });
  await page.locator('[data-welcome-icon="heart"]').click();
  assert.equal(await page.evaluate(() => stickerApp.selected.icon), 'heart');
  assert.equal(imageRequests.length, 0, 'thousands of catalog images stay lazy');
  assert.deepEqual(errors, []);
  console.log('PASS actual stylesheet/font/catalog/artwork gates, desktop/mobile, reduced motion, lazy images and editor interaction');
  const sharedURL = await page.evaluate(async () => {
    await stickerApp.addPixel('pixels/pochacco/tiny/cy_pochacco-shy.gif', { quiet: true });
    return (await stickerApp.shareLink()).url;
  });
  await page.close();

  const shared = await openPage();
  let releaseImage, imageArrived;
  const imageGate = new Promise(resolve => { releaseImage = resolve; });
  const imageRequested = new Promise(resolve => { imageArrived = resolve; });
  await shared.route('**/pixels/pochacco/tiny/cy_pochacco-shy.gif', async r => { imageArrived(); await imageGate; await r.continue(); });
  await shared.goto(sharedURL, { waitUntil: 'domcontentloaded' });
  await imageRequested;
  assert(await shared.locator('#siteLoader').isVisible(), 'shared scene is kept behind the curtain until its images arrive');
  releaseImage();
  await shared.evaluate(() => stickerApp.ready);
  await shared.waitForSelector('#siteLoader', { state: 'detached' });
  assert.equal(await shared.evaluate(() => stickerApp.records.size), 2);
  assert(await shared.evaluate(() => [...stickerApp.records.values()].every(r => r.atlas)));
  await shared.close();
  console.log('PASS shared-scene artwork finishes restoring before the editor is revealed');

  const slow = await openPage();
  let releaseSlow;
  const slowGate = new Promise(resolve => { releaseSlow = resolve; });
  await slow.route('**/pixels/manifest.json', async r => { await slowGate; await r.continue(); });
  await slow.goto(url, { waitUntil: 'domcontentloaded' });
  await slow.waitForFunction(() => window.stickerApp);
  await slow.evaluate(() => stickerApp.scene.stop());
  await slow.evaluate(() => stickerApp.ready); // Real eight-second optional-resource deadline.
  await slow.waitForSelector('#siteLoader', { state: 'detached' });
  assert(await slow.locator('#btnSample').isVisible());
  releaseSlow();
  await slow.waitForSelector('button[data-tab="pixel"]', { state: 'attached' });
  assert(!await slow.locator('#siteLoader').count(), 'late resources do not reopen loading');
  await slow.close();
  console.log('PASS stalled optional resource releases the editor and updates the catalog when it arrives');

  const broken = await openPage();
  await broken.addInitScript(() => localStorage.setItem('sticker-shader-editor:locale', 'zh-TW'));
  await broken.route('**/js/app.js', r => r.abort());
  await broken.goto(url);
  assert(await broken.locator('#loadingRetry').isVisible());
  assert(await broken.locator('#loadingError [data-loading-zh]').isVisible());
  await broken.screenshot({ path: path.join(OUT, 'loading-retry-zh.png') });
  await broken.unroute('**/js/app.js');
  await Promise.all([broken.waitForNavigation(), broken.locator('#loadingRetry').click()]);
  await broken.waitForFunction(() => window.stickerApp?.ready);
  await broken.evaluate(() => stickerApp.ready);
  await broken.waitForSelector('#siteLoader', { state: 'detached' });
  await broken.close();
  const noJS = await openPage({ javaScriptEnabled: false });
  await noJS.goto(url);
  assert(!await noJS.locator('#siteLoader').isVisible());
  assert(await noJS.locator('.brand-name').isVisible());
  await noJS.close();
  console.log('PASS Chinese startup, missing script reload recovery, and no JavaScript does not leave a loading curtain');
} finally { await browser?.close(); server.close(); }
