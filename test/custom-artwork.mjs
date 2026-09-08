/* Imported assets remain real frames/icons through composition, history and exports. */
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
  await page.addInitScript(() => localStorage.setItem('sticker-shader-editor:locale', 'en'));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => window.stickerApp); await page.evaluate(() => I18N.setLocale('en'));
  const fixtures = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 240; c.height = 200; const ctx = c.getContext('2d');
    ctx.fillStyle = '#f020b0'; ctx.fillRect(20, 20, 200, 160);
    ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(120, 100, 55, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    const frame = c.toDataURL().split(',')[1];
    ctx.fillStyle = '#30bb50'; ctx.fillRect(0, 0, 240, 200); const opaque = c.toDataURL().split(',')[1];
    ctx.clearRect(0, 0, 240, 200); ctx.fillStyle = '#20efef'; ctx.beginPath(); ctx.arc(120, 100, 70, 0, Math.PI * 2); ctx.fill(); const icon = c.toDataURL().split(',')[1];
    const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = a.height = b.height = 32;
    a.getContext('2d').fillStyle = '#ff0000'; a.getContext('2d').fillRect(4, 4, 24, 24);
    b.getContext('2d').fillStyle = '#00ff00'; b.getContext('2d').fillRect(4, 4, 24, 24);
    const gif = StickerAnim.encodeGIF([a, b], 5);
    const animated = await new Promise(r => { const reader = new FileReader(); reader.onload = () => r(reader.result.split(',')[1]); reader.readAsDataURL(gif); });
    ctx.fillStyle = '#2040ef'; ctx.fillRect(0, 0, 240, 200);
    const photo = await stickerApp.addSticker(await new Promise(r => c.toBlob(r)), 'blue-photo.png', { imageMode: 'whole' });
    return { frame, opaque, icon, animated, photo: photo.id };
  });
  const upload = async (kind, files) => {
    if (!await page.locator('#artworkDialog').evaluate(e => e.open)) await page.locator('#btnArtwork').click();
    const choosing = page.waitForEvent('filechooser'); await page.locator('#import' + kind).click();
    await (await choosing).setFiles(files);
    await page.waitForFunction(() => document.querySelector('#artworkDialog').getAttribute('aria-busy') === 'false');
  };
  const file = (name, mimeType, data) => ({ name, mimeType, buffer: Buffer.from(data, 'base64') });
  await upload('Frame', [file('my-frame.png', 'image/png', fixtures.frame)]);
  const frameId = await page.evaluate(() => stickerApp.selected.id);
  assert.equal(await page.locator('.artwork-add').count(), 1);
  await page.locator('#closeArtwork').click();
  assert(await page.locator('#ctl-frameOpening').isVisible());
  assert(!await page.locator('#ctl-framePreset').isVisible());
  assert(!await page.locator('#ctl-frameOpeningX').isVisible());
  const frame = await page.evaluate(id => {
    const rec = stickerApp.records.get(id), a = rec.atlas, data = a.canvas.getContext('2d').getImageData(0, 0, a.w, a.h).data;
    const pixel = (x, y) => [...data.slice(((y - a.y0) * a.w + x - a.x0) * 4, ((y - a.y0) * a.w + x - a.x0) * 4 + 4)];
    return { photo: rec.frame.photoId, mode: rec.settings.frameOpening, bounds: rec.frame.layout.window, outside: pixel(5, 5), corner: pixel(67, 47), inside: pixel(120, 100) };
  }, frameId);
  assert.equal(frame.photo, fixtures.photo); assert.equal(frame.mode, 'auto');
  assert(frame.bounds.w >= 108 && frame.bounds.w <= 112, JSON.stringify(frame));
  assert.equal(frame.outside[3], 0); assert(frame.inside[2] > 180 && frame.inside[0] < 100, JSON.stringify(frame));
  assert(frame.corner[0] > 180 && frame.corner[2] > 100, 'circular opening must not erase frame corners');
  await upload('Icon', [file('my-icon.png', 'image/png', fixtures.icon), file('my-motion.gif', 'image/gif', fixtures.animated)]);
  assert.equal(await page.locator('.artwork-add').count(), 3);
  await page.locator('#closeArtwork').click();
  assert(!await page.locator('#ctl-iconPalette').isVisible());
  const composition = await page.evaluate(async frameId => {
    const app = stickerApp, frame = app.records.get(frameId), icons = [...app.records.values()].filter(r => r.artworkId && r.kind === 'icon');
    const moving = icons.find(r => r.frames);
    app.scene.select(app.scene.get(moving.id)); const duplicate = app.duplicateSelected(); app.undo(); app.redo();
    const copy = app.records.get(duplicate.id);
    app.scene.select(app.scene.get(frameId));
    Object.assign(frame.settings, { frameOpening: 'rectangle', frameOpeningX: 25, frameOpeningY: 20, frameOpeningW: 50, frameOpeningH: 60, photoZoom: 1.2 });
    app.composeRecord(frame); const version = frame.maskVersion;
    await new Promise((resolve, reject) => { const started = performance.now(); const check = () => { if (frame.maskVersion > version) resolve(); else if (performance.now() - started > 10000) reject(new Error('worker compose timeout')); else setTimeout(check, 30); }; check(); });
    const worker = frame.frame.layout.window;
    app.composeRecord(frame, { sync: true });
    const same = JSON.stringify(worker) === JSON.stringify(frame.frame.layout.window);
    for (const e of app.scene.stickers) Object.assign(e.settings, { anim: 'none', lightStrength: 0, diffuse: 0, grain: 0, bevel: 0, inkBrightness: 1, inkSaturation: 1 });
    app.scene.stop();
    const anim = app.scene.animationFrames(app.scene.get(frameId), { size: 128, fps: 5, tilt: false });
    const decoded = [];
    for (const blob of [StickerAnim.encodeGIF(anim.frames, anim.fps, { highQuality: true }), await StickerAnim.encodeAPNG(anim.frames, anim.fps)]) {
      const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type === 'image/apng' ? 'image/png' : blob.type }); await decoder.tracks.ready;
      const colours = [];
      for (let i = 0; i < decoder.tracks.selectedTrack.frameCount; i++) {
        const { image } = await decoder.decode({ frameIndex: i }); const c = document.createElement('canvas'); c.width = c.height = 128; c.getContext('2d').drawImage(image, 0, 0); image.close();
        const data = c.getContext('2d').getImageData(0, 0, 128, 128).data; let red = 0, green = 0;
        for (let j = 0; j < data.length; j += 4) { if (data[j + 3] < 128) continue; if (data[j] > 170 && data[j + 1] < 90 && data[j + 2] < 90) red++; if (data[j + 1] > 170 && data[j] < 90 && data[j + 2] < 90) green++; }
        colours.push({ red, green });
      }
      decoder.close(); decoded.push(colours);
    }
    return { attached: icons.every(r => app.scene.get(r.id).parent?.id === frameId), frames: moving.atlas.frames.length,
      copy: copy.image === moving.image && copy.frames === moving.frames && copy.artworkId === moving.artworkId,
      worker, same, share: app.serializeScene(), decoded, svg: app.animatedSvg(app.scene.get(frameId)) };
  }, frameId);
  assert(composition.attached && composition.copy && composition.same); assert.equal(composition.frames, 1);
  assert.deepEqual(composition.worker, { x: 60, y: 40, w: 120, h: 120 });
  assert.equal(composition.share.items.length, 0, 'local art must not become broken or leaked share assets');
  assert(composition.svg.includes('data:image/png'));
  for (const colours of composition.decoded) assert(colours.some(c => c.red > 2) && colours.some(c => c.green > 2), JSON.stringify(colours));
  await upload('Frame', [file('opaque-frame.jpg', 'image/png', fixtures.opaque)]);
  await page.locator('#closeArtwork').click();
  assert.equal(await page.locator('#ctl-frameOpening').inputValue(), 'rectangle'); assert(await page.locator('#ctl-frameOpeningX').isVisible());
  await page.locator('#ctl-frameOpeningX').evaluate(e => { e.value = '22'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => stickerApp.selected.frame.layout.window.x === stickerApp.selected.image.width * .22);
  await page.evaluate(() => stickerApp.undo()); await page.waitForFunction(() => stickerApp.selected.settings.frameOpeningX === 15);
  await upload('Icon', [{ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }]);
  assert((await page.locator('#artworkStatus').innerText()).includes('Could not import')); assert.equal(await page.locator('.artwork-add').count(), 4);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'custom-artwork-desktop.png') });
  await page.reload(); await page.waitForFunction(() => window.stickerApp); await page.locator('#btnArtwork').click();
  assert.equal(await page.locator('.artwork-add').count(), 4, 'library survives reload');
  await page.getByRole('button', { name: 'Add my-frame.png', exact: true }).click();
  await page.waitForFunction(() => stickerApp.selected?.artworkId);
  assert.equal(await page.evaluate(() => stickerApp.selected.settings.frameOpening), 'auto');
  await page.locator('#btnArtwork').click();
  await page.getByRole('button', { name: 'Remove my-frame.png from library', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.artwork-add').length === 3);
  assert.equal(await page.evaluate(() => stickerApp.records.size), 1, 'removing library entry keeps canvas copy');
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => I18N.setLocale('zh-TW'));
  assert(await page.locator('#artworkDialog').evaluate(e => e.scrollWidth <= e.clientWidth && e.getBoundingClientRect().right <= innerWidth));
  await page.screenshot({ path: path.join(OUT, 'custom-artwork-mobile.png') });
  await page.keyboard.press('Escape'); assert(!await page.locator('#artworkDialog').evaluate(e => e.open));
  assert.deepEqual(errors, []);
  console.log('PASS custom frame/icon import, aperture clipping, animated icons, attachment, worker composition, undo/redo, duplication, GIF/APNG/SVG, persistent library, removal, invalid files and mobile/localized UI');
} finally { await browser?.close(); server.close(); }
