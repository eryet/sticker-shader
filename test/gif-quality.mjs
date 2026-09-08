/* Decode real downloads and measure colour loss against the source pixels. */
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
  assert(await page.locator('[data-export="gif-hq"]').isDisabled());
  const colour = await page.evaluate(async () => {
    const source = document.createElement('canvas'); source.width = 256; source.height = 128;
    const ctx = source.getContext('2d'), data = ctx.createImageData(256, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      // Frequent blues plus a smaller, varied warm region.
      data.data.set(y < 96 ? [x, y * 2, 230, 255] : [255, x, (y - 96) * 8, 255], i);
      if (x < 4) data.data[i + 3] = x * 60;
    }
    ctx.putImageData(data, 0, 0);
    const measure = async highQuality => {
      const gif = StickerAnim.encodeGIF([source, source], 25, { highQuality });
      const decoder = new ImageDecoder({ data: await gif.arrayBuffer(), type: 'image/gif' }); await decoder.tracks.ready;
      let error = 0, alphaErrors = 0;
      const { image } = await decoder.decode({ frameIndex: 1 });
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; c.getContext('2d').drawImage(image, 0, 0);
      const decoded = c.getContext('2d').getImageData(0, 0, 256, 128).data;
      for (let i = 0; i < decoded.length; i += 4) {
        if (decoded[i + 3] !== (data.data[i + 3] < 128 ? 0 : 255)) alphaErrors++;
        if (data.data[i + 3] >= 128) for (let j = 0; j < 3; j++) error += (data.data[i + j] - decoded[i + j]) ** 2;
      }
      image.close(); decoder.close(); return { error, alphaErrors };
    };
    const regular = await measure(false), high = await measure(true);
    ctx.clearRect(0, 0, 256, 128);
    const empty = StickerAnim.encodeGIF([source], 25, { highQuality: true });
    const decoder = new ImageDecoder({ data: await empty.arrayBuffer(), type: 'image/gif' });
    const { image } = await decoder.decode({ frameIndex: 0 }); ctx.drawImage(image, 0, 0); image.close(); decoder.close();
    return { regular, high, empty: ctx.getImageData(0, 0, 256, 128).data.every(v => v === 0) };
  });
  assert(colour.high.error < colour.regular.error * .5, JSON.stringify(colour));
  assert.equal(colour.high.alphaErrors, 0); assert.equal(colour.regular.alphaErrors, 0); assert(colour.empty);
  await page.evaluate(() => {
    const rec = stickerApp.addFrame({ settings: { anim: 'spin', animSpeed: 10 } });
    stickerApp.addIcon('heart');
    stickerApp.scene.select(stickerApp.scene.get(rec.id));
  });
  await page.waitForFunction(() => stickerApp.scene.stickers.every(e => e.tex));
  const lazy = await page.evaluate(() => {
    const scene = stickerApp.scene, e = scene.stickers.find(e => e.kind === 'frame') || scene.stickers[0]; scene.stop();
    const before = JSON.stringify(scene.stickers.map(e => [e.x, e.y, e.settings, e.offset]));
    const eager = scene.animationFrames(e, { size: 64, fps: 5 });
    const lazy = scene.animationFrames(e, { size: 64, fps: 5, lazy: true });
    const urls = eager.frames.map(c => c.toDataURL());
    const first = Array.from(lazy.frames, c => c.toDataURL()), second = Array.from(lazy.frames, c => c.toDataURL());
    const iterator = lazy.frames[Symbol.iterator](), frame = iterator.next().value; iterator.return();
    return { equal: JSON.stringify(urls) === JSON.stringify(first) && JSON.stringify(first) === JSON.stringify(second), released: frame.width === 1,
      unchanged: before === JSON.stringify(scene.stickers.map(e => [e.x, e.y, e.settings, e.offset])) };
  });
  assert(lazy.equal && lazy.released && lazy.unchanged, JSON.stringify(lazy));
  fs.mkdirSync(OUT, { recursive: true });
  const downloads = [];
  for (const [kind, size, delay] of [['gif', 512, 60000], ['gif-hq', 1024, 40000]]) {
    await page.locator('#exportMenuWrap > summary').click();
    const started = Date.now();
    const downloaded = page.waitForEvent('download', { timeout: 120000 });
    await page.locator(`[data-export="${kind}"]`).click({ timeout: 120000 });
    const download = await downloaded, dest = path.join(OUT, `quality-${kind}.gif`); await download.saveAs(dest);
    assert(download.suggestedFilename().endsWith(kind === 'gif-hq' ? '-animated-hq.gif' : '-animated.gif'));
    const decoded = await page.evaluate(async bytes => {
      const decoder = new ImageDecoder({ data: Uint8Array.from(bytes), type: 'image/gif' }); await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack, durations = [], pictures = [];
      let width, height, transparent = true, visible = true;
      for (let i = 0; i < track.frameCount; i++) {
        const { image } = await decoder.decode({ frameIndex: i }); width = image.displayWidth; height = image.displayHeight; durations.push(image.duration);
        const c = document.createElement('canvas'); c.width = width; c.height = height; c.getContext('2d').drawImage(image, 0, 0); image.close();
        const d = c.getContext('2d').getImageData(0, 0, width, height).data;
        transparent &&= d[3] === 0; visible &&= d.some((v, j) => j % 4 === 3 && v === 255);
        if (i === 0 || i === Math.floor(track.frameCount / 2)) pictures.push(c.toDataURL());
      }
      const result = { width, height, count: track.frameCount, loop: track.repetitionCount === Infinity, durations, transparent, visible, moves: pictures[0] !== pictures[1] };
      decoder.close(); return result;
    }, [...fs.readFileSync(dest)]);
    assert.equal(decoded.width, size); assert.equal(decoded.height, size); assert(decoded.loop && decoded.transparent && decoded.visible && decoded.moves, JSON.stringify(decoded));
    assert(decoded.durations.every(d => d === delay), JSON.stringify(decoded));
    downloads.push({ kind, frames: decoded.count, ms: Date.now() - started, bytes: fs.statSync(dest).size });
  }
  assert(downloads[1].frames > downloads[0].frames);
  await page.locator('#exportMenuWrap > summary').click();
  await page.screenshot({ path: path.join(OUT, 'gif-quality-menu.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ['en', 'zh-TW']) {
    await page.evaluate(locale => I18N.setLocale(locale), locale);
    assert(await page.locator('[data-export="gif-hq"]').isVisible());
    assert(await page.locator('#exportMenu').evaluate(e => e.scrollWidth <= e.clientWidth), 'menu fits mobile width');
  }
  await page.screenshot({ path: path.join(OUT, 'gif-quality-mobile.png') });
  assert.deepEqual(errors, []);
  console.log('PASS GIF palette accuracy, transparent frames, repeatable bounded rendering, real standard/HQ downloads, looping, timing, motion and mobile menu', { colour, downloads });
} finally { await browser?.close(); server.close(); }
