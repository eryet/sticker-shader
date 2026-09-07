/* A GIF with two transparent interior pixels must not flash its opaque outer matte.
 * Also protects already-transparent artwork, worker composition and share restoration.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test/.out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gif': 'image/gif' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', r => r.abort());
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => window.stickerApp);
  const report = await page.evaluate(async () => {
    stickerApp.scene.stop();
    const read = img => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const inspect = img => {
      const d = read(img), w = img.width, h = img.height;
      const border = [...Array(w).keys()].flatMap(x => [x, (h - 1) * w + x]);
      for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
      return { opaqueEdges: border.filter(i => d[i * 4 + 3] > 0).length,
        transparent: d.filter((v, i) => i % 4 === 3 && v === 0).length,
        face: [...d.slice((50 * w + 100) * 4, (50 * w + 100) * 4 + 4)] };
    };
    const rec = await stickerApp.addPixel('pixels/pixels/cp_cn5.gif', { quiet: true, settings: { baseRotation: 0, anim: 'none' } });
    const entry = stickerApp.scene.get(rec.id), frames = rec.frames.map(inspect), pngCorners = [], previews = [];
    let elapsed = 0;
    for (const duration of rec.durations) {
      const png = stickerApp.scene.snapshot(entry, { shadow: false, tex: stickerApp.scene._texAt(entry, (elapsed + duration / 2) / 1000) });
      const d = read(png), scale = 512 * .84 / rec.image.width;
      const x = Math.round(256 - rec.image.width * scale / 2 + 4 * scale - rec.atlas.x0);
      const y = Math.round(256 - rec.image.height * scale / 2 + 4 * scale - rec.atlas.y0);
      pngCorners.push(d[(y * png.width + x) * 4 + 3]); previews.push(png); elapsed += duration;
    }
    const worker = new Worker('js/compose-worker.js');
    const out = await new Promise((resolve, reject) => {
      worker.onerror = e => reject(new Error(e.message));
      worker.onmessage = e => e.data.type === 'error' ? reject(new Error(e.data.message)) : resolve(e.data.out);
      worker.postMessage({ type: 'compose', id: 'matte', seq: 1, spec: { kind: 'icon', icon: 'pixel', settings: rec.settings, image: rec.image, frames: rec.frames, durations: rec.durations, workingRes: rec.settings.workingRes } });
    });
    worker.terminate();
    let workerDiff = 0;
    const mainFrames = [rec.atlas.canvas, ...rec.atlas.frames.map(f => f.canvas)];
    for (const [i, f] of [out.atlas.image, ...out.atlas.frames].entries()) {
      const c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
      c.getContext('2d').putImageData(new ImageData(f.data, f.w, f.h), 0, 0);
      const a = read(mainFrames[i]), b = read(c); workerDiff += a.filter((v, j) => v !== b[j]).length;
    }
    let transparentDiff = 0;
    // Keep transparent exteriors and the illustrated frame with interior holes intact.
    for (const src of ['pixels/pixels/cp_miscc-8.gif', 'pixels/pixels/cp_type1-28.gif']) {
      const clear = await stickerApp.addPixel(src, { quiet: true });
      const decoder = new ImageDecoder({ data: await (await fetch(src)).arrayBuffer(), type: 'image/gif' });
      await decoder.tracks.ready; await decoder.completed;
      for (let i = 0; i < clear.frames.length; i++) {
        const { image } = await decoder.decode({ frameIndex: i }), bmp = await createImageBitmap(image);
        const a = read(bmp), b = read(clear.frames[i]); transparentDiff += a.filter((v, j) => v !== b[j]).length;
        bmp.close(); image.close();
      }
      decoder.close();
    }
    const before = new Set(stickerApp.records.keys()), shared = await stickerApp.shareLink();
    await stickerApp.loadSharedScene(new URL(shared.url).hash);
    const restored = [...stickerApp.records.values()].find(r => !before.has(r.id) && r.settings.iconText === rec.settings.iconText);
    const c = document.createElement('canvas'); c.width = 1080; c.height = 340;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#a4cde9'; ctx.fillRect(0, 0, c.width, c.height);
    for (const [i, png] of previews.entries()) {
      ctx.fillStyle = '#2b2a33'; ctx.font = '16px Arial'; ctx.fillText('Frame ' + (i + 1), i * 360 + 20, 28);
      const s = Math.min(330 / png.width, 290 / png.height); ctx.drawImage(png, i * 360 + 15, 42, png.width * s, png.height * s);
    }
    return { frames, pngCorners, durations: rec.durations, period: entry.tex.period, workerDiff, transparentDiff,
      restored: restored.frames.map(inspect), sheet: c.toDataURL() };
  });
  for (const f of [...report.frames, ...report.restored]) {
    assert.equal(f.opaqueEdges, 0, 'no opaque rectangle in any animation frame');
    assert(f.transparent > 9000, 'outer matte removed');
    assert.equal(f.face[3], 255, 'white character remains opaque');
    assert(f.face.slice(0, 3).every(v => v >= 250), 'white character colors preserved');
  }
  assert.deepEqual(report.pngCorners, [0, 0, 0], 'no rectangle in any exported frame');
  assert.deepEqual(report.durations, [100, 100, 100]); assert.equal(report.period, 300);
  assert.equal(report.workerDiff, 0); assert.equal(report.transparentDiff, 0);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'pixel-background-fixed.png'), Buffer.from(report.sheet.split(',')[1], 'base64'));
  // Static fallback uses the same edge-based cleanup.
  await page.addInitScript(() => { window.ImageDecoder = undefined; });
  await page.reload(); await page.waitForFunction(() => window.stickerApp);
  const fallback = await page.evaluate(async () => {
    const rec = await stickerApp.addPixel('pixels/pixels/cp_cn5.gif', { quiet: true });
    const c = document.createElement('canvas'); c.width = rec.image.width; c.height = rec.image.height;
    const ctx = c.getContext('2d'); ctx.drawImage(rec.image, 0, 0);
    return { animated: !!rec.frames, cornerAlpha: ctx.getImageData(0, 0, 1, 1).data[3] };
  });
  assert.deepEqual(fallback, { animated: false, cornerAlpha: 0 });
  assert.deepEqual(errors, []);
  console.log('PASS all 3 frames: transparent exterior, white artwork, PNG output, timing, worker parity, share restore and static fallback; existing transparent art unchanged');
} finally { if (browser) await browser.close(); server.close(); }
