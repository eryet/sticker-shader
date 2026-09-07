/* Compare every blinkie frame with its source, through loading, composition and PNG rendering.
 * Uses an isolated browser and the local collection; no model or font downloads.
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
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gif': 'image/gif', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', route => route.abort());
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => window.stickerApp);
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'pixels/manifest.json'))).groups.find(g => g.id === 'blinkies').items;
  await page.evaluate(() => { stickerApp.scene.stop(); window.blinkieAudit = { previews: [], records: [] }; });
  const reports = [];
  for (const item of items) {
    const result = await page.evaluate(async src => {
      const pixels = image => {
        const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const blob = await (await fetch(src)).blob();
      const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: src.endsWith('.webp') ? 'image/webp' : 'image/gif' });
      await decoder.tracks.ready; await decoder.completed;
      const count = decoder.tracks.selectedTrack.frameCount;
      const rec = await stickerApp.addPixel(src, { quiet: true, settings: { baseRotation: 0, anim: 'none' } });
      if (!rec) throw new Error('Failed to add ' + src);
      const frames = rec.frames || [rec.image], entry = stickerApp.scene.get(rec.id);
      const atlasFrames = [rec.atlas.canvas, ...(rec.atlas.frames || []).map(f => f.canvas)];
      const results = []; let elapsed = 0;
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i });
        const source = await createImageBitmap(image), duration = Math.max(20, image.duration ? image.duration / 1000 : 100); image.close();
        const a = pixels(source), b = frames[i] ? pixels(frames[i]) : [];
        let changed = Math.abs(a.length - b.length);
        for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) changed++;
        const expected = StickerDecor.drawIcon('pixel', 512, { ...StickerDecor.iconStyleOf(rec.settings), image: source });
        const reference = pixels(expected), atlas = pixels(atlasFrames[i]);
        const tex = stickerApp.scene._texAt(entry, (elapsed + duration / 2) / 1000);
        const png = stickerApp.scene.snapshot(entry, { shadow: false, tex });
        const rendered = pixels(png);
        let whites = 0, badAtlas = 0, badRender = 0;
        for (let y = 2; y < 510; y++) for (let x = 2; x < 510; x++) {
          const j = (y * 512 + x) * 4;
          // Sample solid white interiors, away from antialiasing and bevel edges.
          const white = p => reference[p + 3] === 255 && Math.min(reference[p], reference[p + 1], reference[p + 2]) > 240;
          if (!white(j) || !white(j - 8) || !white(j + 8) || !white(j - 4096) || !white(j + 4096)) continue;
          const k = ((y - rec.atlas.y0) * rec.atlas.w + x - rec.atlas.x0) * 4;
          whites++;
          if (atlas[k + 3] < 250 || Math.min(atlas[k], atlas[k + 1], atlas[k + 2]) < 230) badAtlas++;
          if (rendered[k + 3] < 250 || Math.min(rendered[k], rendered[k + 1], rendered[k + 2]) < 180) badRender++;
        }
        results.push({ frame: i, changed, whites, badAtlas, badRender, duration });
        blinkieAudit.previews.push({ name: src.split('/').pop() + ' · frame ' + (i + 1), source, png, x: -rec.atlas.x0, y: -rec.atlas.y0 });
        elapsed += duration;
      }
      decoder.close();
      // The background-preserving frames must also reach the composition worker unchanged.
      const worker = new Worker('js/compose-worker.js');
      const out = await new Promise((resolve, reject) => {
        worker.onerror = e => reject(new Error(e.message));
        worker.onmessage = e => e.data.type === 'error' ? reject(new Error(e.data.message)) : resolve(e.data.out);
        worker.postMessage({ type: 'compose', id: 'audit', seq: 1, spec: { kind: 'icon', icon: 'pixel', settings: rec.settings, image: rec.image, frames: rec.frames, durations: rec.durations, workingRes: rec.settings.workingRes } });
      });
      worker.terminate();
      const workerFrames = [out.atlas.image, ...(out.atlas.frames || [])];
      let workerDiff = 0;
      for (let i = 0; i < atlasFrames.length; i++) {
        const fr = workerFrames[i], c = document.createElement('canvas'); c.width = fr.w; c.height = fr.h;
        c.getContext('2d').putImageData(new ImageData(fr.data, fr.w, fr.h), 0, 0);
        const a = pixels(atlasFrames[i]), b = pixels(c);
        for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) workerDiff++;
      }
      blinkieAudit.records.push(rec.id);
      return { src, count, loaded: frames.length, period: entry.tex.period, expectedPeriod: elapsed, workerDiff, results };
    }, item.src);
    assert.equal(result.loaded, result.count, item.src + ': all source frames loaded');
    assert.equal(result.period, result.expectedPeriod, item.src + ': original timing retained');
    assert.equal(result.workerDiff, 0, item.src + ': worker matches main-thread composition');
    for (const frame of result.results) {
      assert.equal(frame.changed, 0, `${item.src} frame ${frame.frame}: source RGBA preserved`);
      assert(frame.whites > 0, item.src + ': has white artwork to check');
      assert.equal(frame.badAtlas, 0, `${item.src} frame ${frame.frame}: white survives composition`);
      assert.equal(frame.badRender, 0, `${item.src} frame ${frame.frame}: white survives PNG rendering`);
    }
    reports.push(result); console.log(`PASS ${item.src}: ${result.count} frames, exact source pixels, white artwork, timing and worker rendering`);
  }

  const sheets = await page.evaluate(() => {
    const sheets = [];
    for (let offset = 0; offset < blinkieAudit.previews.length; offset += 8) {
      const rows = blinkieAudit.previews.slice(offset, offset + 8), c = document.createElement('canvas'); c.width = 1160; c.height = 50 + rows.length * 170;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#e5ebf2'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#2b2a33'; ctx.font = 'bold 17px Arial'; ctx.fillText('Original artwork', 230, 28); ctx.fillText('Rendered sticker', 750, 28);
      for (const [i, row] of rows.entries()) {
        ctx.fillStyle = '#2b2a33'; ctx.font = '13px Arial'; ctx.fillText(row.name, 16, 72 + i * 170);
        const scale = Math.min(480 / row.source.width, 84 / row.source.height), w = row.source.width * scale, h = row.source.height * scale;
        const y = 100 + i * 170 + (84 - h) / 2;
        ctx.imageSmoothingEnabled = false; ctx.drawImage(row.source, 30 + (480 - w) / 2, y, w, h);
        const tileScale = 512 * .84 / Math.max(row.source.width, row.source.height), tw = row.source.width * tileScale, th = row.source.height * tileScale;
        const pad = 28, displayScale = w / tw;
        ctx.drawImage(row.png, 256 + row.x - tw / 2 - pad, 256 + row.y - th / 2 - pad, tw + pad * 2, th + pad * 2, 630 + (480 - w) / 2 - pad * displayScale, y - pad * displayScale, (tw + pad * 2) * displayScale, (th + pad * 2) * displayScale);
      }
      sheets.push(c.toDataURL());
    }
    return sheets;
  });
  fs.mkdirSync(OUT, { recursive: true });
  sheets.forEach((s, i) => fs.writeFileSync(path.join(OUT, `blinkies-checked-${i + 1}.png`), Buffer.from(s.split(',')[1], 'base64')));
  fs.writeFileSync(path.join(OUT, 'blinkies-audit.json'), JSON.stringify(reports, null, 2));

  // A restored share link must use the same asset loading path.
  const shared = await page.evaluate(async () => {
    const before = new Set(stickerApp.records.keys()), { url } = await stickerApp.shareLink();
    await stickerApp.loadSharedScene(new URL(url).hash);
    const copies = [...stickerApp.records.values()].filter(r => !before.has(r.id));
    return copies.map(r => ({ src: r.settings.iconText, count: r.frames?.length || 1 }));
  });
  assert.equal(shared.length, items.length);
  assert(shared.every(s => s.count === reports.find(r => r.src === s.src).count));
  console.log('PASS all blinkies restore with their animation frames through share links');

  // Browsers without ImageDecoder preserve the first-frame artwork too.
  const fallback = await browser.newPage(); await fallback.route('https://**', r => r.abort());
  fallback.on('pageerror', e => errors.push(e.message));
  await fallback.addInitScript(() => { window.ImageDecoder = undefined; });
  await fallback.goto(url); await fallback.waitForFunction(() => window.stickerApp);
  for (const item of items) {
    assert(await fallback.evaluate(async src => {
      const rec = await stickerApp.addPixel(src, { quiet: true });
      const original = await createImageBitmap(await (await fetch(src)).blob());
      const read = image => { const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; };
      const a = read(original), b = read(rec.image); original.close();
      return !rec.frames && a.length === b.length && a.every((v, i) => v === b[i]);
    }, item.src), item.src + ': static fallback preserves original colors and alpha');
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${items.length} blinkies / ${reports.reduce((n, r) => n + r.count, 0)} animation frames, static fallback and no browser errors`);
} finally { if (browser) await browser.close(); server.close(); }
