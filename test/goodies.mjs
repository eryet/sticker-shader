/* Check every catalog entry through decoding, composition and PNG rendering.
 * Run with the same PLAYWRIGHT_MODULE / PLAYWRIGHT_EXECUTABLE_PATH as objects.mjs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test/.out');
const { groups } = JSON.parse(fs.readFileSync(path.join(ROOT, 'pixels/manifest.json')));
const paths = groups.flatMap(g => g.items.map(i => i.src));
assert.equal(new Set(paths).size, paths.length, 'unique catalog paths');
for (const src of paths) assert(fs.existsSync(path.join(ROOT, src)), src + ': bundled file exists');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gif': 'image/gif', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const errors = [], reports = [];
  fs.mkdirSync(OUT, { recursive: true });
  for (const group of groups) {
    // Release decoded bitmaps and GPU resources between groups.
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.text().startsWith('animation decode failed')) errors.push(m.text()); });
    await page.route('https://**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.stickerApp);
    await page.evaluate(() => { stickerApp.scene.stop(); window.goodiePreviews = []; });
    for (const [index, item] of group.items.entries()) {
      const result = await page.evaluate(async ({ src, category, preview }) => {
        const read = image => {
          const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
          const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, c.width, c.height).data;
        };
        const rec = await stickerApp.addPixel(src, { quiet: true, settings: { workingRes: '256', baseRotation: 0, anim: 'none' } });
        if (!rec?.atlas) throw new Error('Failed to compose ' + src);
        const frames = rec.frames || [rec.image], entry = stickerApp.scene.get(rec.id);
        const blob = await (await fetch(src)).blob(), data = await blob.arrayBuffer(), h = new Uint8Array(data);
        const type = h[0] === 0x47 ? 'image/gif' : h[0] === 0x52 ? 'image/webp' : h[0] === 0x89 ? 'image/png' : 'image/jpeg';
        const decoder = new ImageDecoder({ data, type });
        await decoder.tracks.ready; await decoder.completed;
        const count = decoder.tracks.selectedTrack.frameCount, keep = Math.min(count, 16);
        const preserve = ['blinkies', 'stamps', 'dividers', 'buttons', 'bg'].includes(category);
        let elapsed = 0, duration = 0, slot = 0, changed = 0, empty = 0;
        for (let i = 0; i < count; i++) {
          const { image } = await decoder.decode({ frameIndex: i });
          duration += Math.max(20, image.duration ? image.duration / 1000 : 100);
          const want = Math.floor((i + 1) * keep / count);
          if (want > slot) {
            // Static images use the browser's bitmap decoder (JPEG decoder APIs may round differently).
            const original = await createImageBitmap(count === 1 ? blob : image), a = read(original), b = read(frames[slot]);
            if (preserve) {
              changed += Math.abs(a.length - b.length);
              for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) changed++;
            }
            const tex = stickerApp.scene._texAt(entry, (elapsed + duration / 2) / 1000);
            const png = stickerApp.scene.snapshot(entry, { shadow: false, tex });
            const pixels = read(png);
            const hasAlpha = d => d.some((v, j) => j % 4 === 3 && v > 20);
            if (hasAlpha(b) && !hasAlpha(pixels)) empty++;
            if (preview && slot === 0) goodiePreviews.push({ src, original, png }); else original.close();
            elapsed += duration; duration = 0; slot = want;
          }
          image.close();
        }
        decoder.close();
        const result = { src, count, loaded: frames.length, changed, empty, expectedPeriod: elapsed, period: entry.tex.period };
        stickerApp.scene.remove(rec.id); stickerApp.records.delete(rec.id);
        return result;
      }, { src: item.src, category: group.category, preview: index === 0 || index === group.items.length - 1 });
      assert.equal(result.loaded, Math.min(result.count, 16), item.src + ': animation frames loaded');
      if (result.count > 1) assert.equal(result.period, result.expectedPeriod, item.src + ': animation timing retained');
      assert.equal(result.changed, 0, item.src + ': complete design retains exact source RGBA');
      assert.equal(result.empty, 0, item.src + ': artwork visible in rendered PNG');
      reports.push(result);
    }
    const sheet = await page.evaluate(title => {
      const c = document.createElement('canvas'); c.width = 1000; c.height = 50 + goodiePreviews.length * 300;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#e5ebf2'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#2b2a33'; ctx.font = 'bold 18px Arial'; ctx.fillText(title + ' — original / rendered', 20, 30);
      for (const [i, row] of goodiePreviews.entries()) {
        ctx.font = '13px Arial'; ctx.fillText(row.src, 20, 75 + i * 300);
        for (const [column, img] of [row.original, row.png].entries()) {
          const s = Math.min(440 / img.width, 230 / img.height);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 30 + column * 500 + (440 - img.width * s) / 2, 95 + i * 300 + (230 - img.height * s) / 2, img.width * s, img.height * s);
        }
      }
      return c.toDataURL();
    }, group.collection + ' · ' + group.title);
    fs.writeFileSync(path.join(OUT, `goodies-render-${group.id}.png`), Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(`PASS ${group.id}: ${group.items.length} assets, all retained frames render, source backgrounds and timing preserved`);
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'goodies-render-audit.json'), JSON.stringify(reports, null, 2));
  assert.deepEqual(errors, []);
  console.log(`PASS ${reports.length} goodies / ${reports.reduce((n, r) => n + r.loaded, 0)} retained frames, no browser errors`);
} finally { if (browser) await browser.close(); server.close(); }
