/* Pass details and lanyards are independent, editable parts of frame composition. */
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.route('https://**', r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.stickerApp);
  const raw = await page.evaluate(() => {
    const p = { ...StickerUI.DEFAULTS, ...StickerDecor.FRAME_PRESETS['Conference pass'], passName: 'ALEX CHEN', passRole: 'SPEAKER', passOrganization: 'STUDIO NORTH', passDate: '20–21 SEPTEMBER · DESIGN & TECHNOLOGY' };
    const photo = document.createElement('canvas'); photo.width = photo.height = 320;
    const f = photo.getContext('2d'); f.fillStyle = '#e2ecf7'; f.fillRect(0, 0, 320, 320);
    f.fillStyle = '#416482'; f.beginPath(); f.ellipse(160, 296, 114, 103, 0, 0, Math.PI * 2); f.fill();
    f.fillStyle = '#edc5a4'; f.beginPath(); f.ellipse(160, 133, 62, 76, 0, 0, Math.PI * 2); f.fill();
    f.fillStyle = '#38333e'; f.beginPath(); f.ellipse(158, 78, 64, 37, -.12, Math.PI, Math.PI * 2); f.fill();
    const pic = { canvas: photo, w: 320, h: 320, pad: 0 }, a = StickerDecor.composeFrame(p, pic);
    const b = StickerDecor.composeFrame({ ...p, frameLanyardColor: '#df5647' }, pic);
    const bare = StickerDecor.composeFrame({ ...p, frameLanyard: 'none' }, pic);
    const ad = a.canvas.getContext('2d').getImageData(0, 0, a.canvas.width, a.canvas.height).data;
    const bd = b.canvas.getContext('2d').getImageData(0, 0, b.canvas.width, b.canvas.height).data;
    let changed = 0, badgeChanges = 0, clipped = 0;
    const bodyTop = a.layout.hanger.y - 34;
    for (let i = 0; i < ad.length; i += 4) {
      const x = i / 4 % a.canvas.width, y = Math.floor(i / 4 / a.canvas.width);
      if (ad[i] !== bd[i] || ad[i + 1] !== bd[i + 1] || ad[i + 2] !== bd[i + 2]) { changed++; if (y >= bodyTop) badgeChanges++; }
      if (ad[i + 3] && (x < 8 || y < 8 || x > a.canvas.width - 9 || y > a.canvas.height - 9)) clipped++;
    }
    const text = ['passEvent', 'passName', 'passRole', 'passOrganization', 'passDate', 'frameLanyardText'].map(key => StickerDecor.composeFrame({ ...p, [key]: 'EDITED EXAMPLE' }, pic).canvas.toDataURL() !== a.canvas.toDataURL());
    const sheet = document.createElement('canvas'); sheet.width = 1200; sheet.height = 860;
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#f5f1eb'; ctx.fillRect(0, 0, 1200, 860);
    ctx.fillStyle = '#302b43'; ctx.font = 'bold 27px sans-serif'; ctx.fillText('ONE PASS. YOUR COLOURS.', 42, 52);
    ctx.font = '16px sans-serif'; ctx.fillStyle = '#756d7c'; ctx.fillText('Editable details · interchangeable lanyards', 42, 80);
    const variants = [['Violet / plain', '#7655d5', 'solid'], ['Coral / plain', '#df5647', 'solid'], ['Teal / stripe', '#187c78', 'striped']];
    variants.forEach(([label, color, style], i) => {
      const c = StickerDecor.composeFrame({ ...p, frameLanyardColor: color, frameLanyard: style }, pic).canvas;
      const scale = Math.min(355 / c.width, 685 / c.height);
      ctx.drawImage(c, i * 400 + (400 - c.width * scale) / 2, 106, c.width * scale, c.height * scale);
      ctx.fillStyle = '#302b43'; ctx.textAlign = 'center'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(label, i * 400 + 200, 819);
    });
    return { changed, badgeChanges, clipped, text, offset: a.layout.window.y - bare.layout.window.y, height: a.canvas.height - bare.canvas.height, preview: sheet.toDataURL() };
  });
  assert(raw.changed > 10000 && raw.badgeChanges === 0 && raw.clipped === 0, JSON.stringify({ ...raw, preview: undefined }));
  assert(raw.text.every(Boolean)); assert.equal(raw.offset, raw.height); assert(raw.height > 300);
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'conference-pass-variants.png'), Buffer.from(raw.preview.split(',')[1], 'base64'));
  await page.locator('#btnFrame').click(); await page.locator('[data-frame-preset="Conference pass"]').click();
  await page.waitForFunction(() => stickerApp.selected?.settings.frameDesign === 'conference' && stickerApp.selected.frame.layout.hanger.y > 200);
  assert(await page.locator('#ctl-passEvent').isVisible()); assert(await page.locator('#ctl-frameLanyardColor-picker').isVisible());
  assert(!await page.locator('#ctl-frameCaption').isVisible());
  const version = await page.evaluate(() => stickerApp.selected.maskVersion);
  await page.locator('#ctl-passName').fill('JAMIE RIVERA');
  await page.waitForFunction(v => stickerApp.selected.maskVersion > v, version);
  await page.locator('#ctl-frameLanyardColor-picker').click(); await page.locator('.colour-hex').fill('#e85d75'); await page.locator('.colour-hex').press('Enter'); await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => stickerApp.selected.settings.frameLanyardColor), '#e85d75');
  await page.evaluate(() => stickerApp.undo()); assert.equal(await page.evaluate(() => stickerApp.selected.settings.frameLanyardColor), '#7655d5');
  await page.evaluate(() => stickerApp.redo()); assert.equal(await page.locator('#ctl-passName').inputValue(), 'JAMIE RIVERA');
  const result = await page.evaluate(async () => {
    const app = stickerApp, rec = app.selected; app.composeRecord(rec, { sync: true });
    const copy = app.duplicateSelected();
    const shared = await app.shareLink(), before = new Set(app.records.keys()); await app.loadSharedScene(new URL(shared.url).hash);
    const restored = [...app.records.values()].find(r => !before.has(r.id) && r.settings.frameDesign === 'conference');
    app.scene.select(app.scene.get(rec.id));
    Object.assign(rec.settings, { anim: 'swing', animSpeed: 3, animAmount: 2, frameLanyardLength: 1.25, frameLanyard: 'striped', lightStrength: 0, diffuse: 0 });
    app.composeRecord(rec, { sync: true });
    const icon = app.addIcon('heart'); app.scene.stop();
    const anim = app.scene.animationFrames(app.scene.get(rec.id), { size: 192, fps: 4 });
    const decoded = [];
    for (const blob of [StickerAnim.encodeGIF(anim.frames, anim.fps, { highQuality: true }), await StickerAnim.encodeAPNG(anim.frames, anim.fps)]) {
      const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type === 'image/apng' ? 'image/png' : blob.type }); await decoder.tracks.ready;
      let clipped = 0, visible = 0;
      for (let i = 0; i < decoder.tracks.selectedTrack.frameCount; i++) {
        const { image } = await decoder.decode({ frameIndex: i }); const c = document.createElement('canvas'); c.width = c.height = 192; c.getContext('2d').drawImage(image, 0, 0); image.close();
        const d = c.getContext('2d').getImageData(0, 0, 192, 192).data;
        for (let j = 0; j < d.length; j += 4) if (d[j + 3] > 128) { visible++; const x = j / 4 % 192, y = Math.floor(j / 4 / 192); if (x === 0 || y === 0 || x === 191 || y === 191) clipped++; }
      }
      decoded.push({ clipped, visible, count: decoder.tracks.selectedTrack.frameCount }); decoder.close();
    }
    const image = document.createElement('canvas'); image.width = 240; image.height = 200;
    const ctx = image.getContext('2d'); ctx.fillStyle = '#24b7d1'; ctx.fillRect(20, 20, 200, 160); ctx.clearRect(50, 50, 140, 100);
    const bitmap = await createImageBitmap(image), opening = await StickerArtwork.findOpening(bitmap);
    const imported = app.addFrame({ image: bitmap, artworkId: 'test-import', frameArtwork: opening,
      settings: { frameOpening: 'auto', frameLanyard: 'solid', frameLanyardColor: '#20ee40', frameLanyardLength: .8 } });
    const spec = { kind: 'frame', image: bitmap, frameArtwork: opening, settings: { ...imported.settings }, workingRes: '384' };
    const main = StickerDecor.buildComposed(spec), worker = new Worker('js/compose-worker.js');
    let offscreen;
    try { offscreen = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('worker timeout')), 15000); worker.onmessage = ({ data }) => { clearTimeout(timer); data.type === 'error' ? reject(new Error(data.message)) : resolve(data.out); }; worker.onerror = e => { clearTimeout(timer); reject(new Error(e.message)); }; worker.postMessage({ type: 'compose', id: 'custom', seq: 1, spec }); }); }
    finally { worker.terminate(); }
    return { copied: copy.settings.passName === rec.settings.passName && copy.settings.frameLanyardColor === '#e85d75',
      restored: restored?.settings.passName === 'JAMIE RIVERA' && restored.settings.frameLanyardColor === '#e85d75', decoded,
      attached: app.scene.get(icon.id).parent?.id === rec.id, imported: imported.frame.layout.window.y > opening.window.y,
      worker: JSON.stringify(main.layout) === JSON.stringify(offscreen.layout) && main.mask.every((v, i) => v === offscreen.mask[i]),
      svg: !new DOMParser().parseFromString(app.animatedSvg(app.scene.get(rec.id)), 'image/svg+xml').querySelector('parsererror') };
  });
  assert(result.copied && result.restored && result.attached && result.imported && result.worker && result.svg, JSON.stringify(result));
  assert(result.decoded.every(r => r.count > 1 && r.visible > 1000 && !r.clipped), JSON.stringify(result));
  assert(await page.locator('#ctl-frameLanyard').isVisible()); assert(!await page.locator('#ctl-passEvent').isVisible(), 'imported pass keeps its printed artwork');
  await page.selectOption('#ctl-frameLanyard', 'none'); assert(!await page.locator('#ctl-frameLanyardColor-picker').isVisible());
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => { I18N.setLocale('zh-TW'); const rec = [...stickerApp.records.values()].find(r => r.settings.frameDesign === 'conference'); stickerApp.scene.select(stickerApp.scene.get(rec.id)); });
  await page.locator('[data-group="pass"]').scrollIntoViewIfNeeded();
  assert(await page.locator('[data-group="pass"] .group-head').innerText() === '會議識別證');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(OUT, 'conference-pass-mobile.png') });
  assert.deepEqual(errors, []);
  console.log('PASS editable conference details, independent lanyard colours, no clipping, worker composition, imported-frame lanyards, undo/redo, duplicates, share links, GIF/APNG/SVG and mobile controls');
} finally { await browser?.close(); server.close(); }
