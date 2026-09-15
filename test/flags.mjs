/* The archived flag stays intact and animated in the tray, canvas and shared shakers. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.FLAG_TEST_OUTPUT || path.join(ROOT, 'test/.out/flags');
const SRC = 'pixels/flags/taiwan-flag.gif';
assert.equal(createHash('sha256').update(fs.readFileSync(path.join(ROOT, SRC))).digest('hex'), 'a4c7aceaca52cc2b5da484fab1253edf35bfe1afa63bdfedbb3fee385e595c94');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0], file = path.join(ROOT, name === '/' ? 'index.html' : decodeURIComponent(name));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gif': 'image/gif' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
fs.mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.route('https://**', r => r.abort());
  const ready = async () => {
    await page.waitForFunction(() => window.stickerApp); await page.evaluate(() => stickerApp.ready);
    await page.locator('#siteLoader').waitFor({ state: 'hidden' }); await page.evaluate(() => stickerApp.scene.stop());
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await ready();
  await page.locator('#iconMenuWrap > summary').click(); await page.locator('#btnBrowseIcons').click();
  const flag = page.locator(`button[data-pixel="${SRC}"]`);
  await page.locator('#iconSearch').fill('Taiwan flag'); assert(await flag.isVisible());
  await page.waitForFunction(src => document.querySelector(`img[src="${src}"]`).naturalWidth === 84, SRC);
  await page.locator('#decorateMenu').screenshot({ path: path.join(OUT, 'flag-search.png') });
  await flag.click({ modifiers: ['Shift'] });
  await page.waitForFunction(src => stickerApp.selected?.settings.iconText === src && stickerApp.selected.atlas, SRC);
  const report = await page.evaluate(async src => {
    const r = stickerApp.selected, c = document.createElement('canvas'); c.width = 84; c.height = 57;
    const ctx = c.getContext('2d'), pixels = image => { ctx.clearRect(0, 0, 84, 57); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, 84, 57).data; };
    const decoder = new ImageDecoder({ data: await (await fetch(src)).arrayBuffer(), type: 'image/gif' });
    await decoder.completed; const hashes = [], preserved = [];
    for (let i = 0; i < r.frames.length; i++) {
      const { image } = await decoder.decode({ frameIndex: i }), original = pixels(image), loaded = pixels(r.frames[i]);
      preserved.push(original.every((value, at) => value === loaded[at]));
      hashes.push([...new Uint8Array(await crypto.subtle.digest('SHA-256', loaded))].join(',')); image.close();
    }
    decoder.close(); const alpha = pixels(r.image).filter((_, i) => i % 4 === 3);
    Object.assign(r.settings, { anim: 'none', surfaceEffect: 'none' });
    const animation = stickerApp.scene.animationFrames(stickerApp.scene.get(r.id), { size: 96, fps: 10 });
    const gif = StickerAnim.encodeGIF(animation.frames, animation.fps);
    window.flagTestGif = Array.from(gif);
    return { name: r.name, frames: r.frames.length, durations: r.durations, preserved, unique: new Set(hashes).size,
      transparent: alpha.some(a => a === 0), visible: alpha.some(a => a === 255), border: r.settings.borderWidth,
      exportedFrames: animation.frames.length, seconds: animation.seconds, exportedUnique: new Set(animation.frames.map(f => f.toDataURL())).size };
  }, SRC);
  assert.equal(report.name, 'Taiwan flag'); assert.equal(report.frames, 8); assert.deepEqual(report.durations, Array(8).fill(100));
  assert(report.preserved.every(Boolean) && report.unique > 1 && report.transparent && report.visible); assert.equal(report.border, 0);
  assert.equal(report.exportedFrames, 8); assert.equal(report.seconds, .8); assert(report.exportedUnique > 1);
  fs.writeFileSync(path.join(OUT, 'flag-export.gif'), Buffer.from(await page.evaluate(() => flagTestGif)));
  await page.evaluate(() => { const id = stickerApp.selected.id; stickerApp.undo(); if (stickerApp.records.has(id)) throw Error('undo failed'); stickerApp.redo(); });
  console.log('PASS exact original file and decoded pixels, bilingual-ready picker, eight-frame canvas/export animation, transparency and undo');

  await page.evaluate(() => I18N.setLocale('zh-TW')); await page.locator('#iconSearch').fill('國旗');
  assert(await flag.isVisible()); assert.equal(await flag.locator('span').textContent(), '台灣旗幟');
  await page.setViewportSize({ width: 320, height: 844 }); await page.locator('#iconSearch').fill('');
  for (let i = 0; i < 4 && !(await page.locator('button[data-tab="flags"]').isVisible()); i++) await page.locator('.icon-head .tab-arrow[data-dir="1"]').click();
  await page.locator('button[data-tab="flags"]').click(); assert(await flag.isVisible());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#decorateMenu').screenshot({ path: path.join(OUT, 'flags-mobile-zh.png') });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.keyboard.press('Escape');
  await page.evaluate(() => { I18N.setLocale('en'); stickerApp.addIcon('shaker'); });
  await page.locator('#shakerAdd').click(); await page.locator('#iconSearch').fill('Taiwan'); await flag.click();
  await page.waitForFunction(() => stickerApp.selected?.shakerItems?.length === 1);
  assert.equal(await page.evaluate(() => stickerApp.selected.shakerItems[0].frames.length), 8);
  const shared = await page.evaluate(async () => (await stickerApp.shareLink()).url);
  await page.goto(shared); await ready();
  const restored = await page.evaluate(src => {
    const records = [...stickerApp.records.values()];
    const flag = records.find(r => r.settings.iconText === src), shaker = records.find(r => r.icon === 'shaker');
    return { name: flag?.name, frames: flag?.frames?.length, inside: shaker?.shakerItems?.[0]?.frames?.length, durations: shaker?.shakerItems?.[0]?.durations };
  }, SRC);
  assert.equal(restored.name, 'Taiwan flag'); assert.equal(restored.frames, 8); assert.equal(restored.inside, 8); assert.deepEqual(restored.durations, Array(8).fill(100));
  assert.deepEqual(errors, []);
  console.log('PASS English/Chinese search, mobile Flags tab, shaker placement and animated share-link restoration');
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
