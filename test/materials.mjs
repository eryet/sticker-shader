/* Real shader rendering and editor integration for the material collection. */
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
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); }); await page.route('https://**', r => r.abort());
  await page.addInitScript(() => localStorage.setItem('sticker-shader-editor:locale', 'en'));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => window.stickerApp);
  const id = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
    ctx.fillStyle = '#88b9dd'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#fbc6d8'; ctx.beginPath(); ctx.arc(128, 110, 80, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#382e42'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('hello', 128, 125);
    return (await stickerApp.addSticker(await new Promise(r => c.toBlob(r)), 'material-review.png', { imageMode: 'whole' })).id;
  });
  await page.selectOption('#ctl-material', 'glass');
  assert.equal(await page.locator('#ctl-materialOpacity').inputValue(), '0.18');
  await page.selectOption('#ctl-materialFinish', 'pearl');
  await page.selectOption('#ctl-material', 'paper');
  assert.equal(await page.locator('#ctl-materialFinish').inputValue(), 'pearl');
  assert(!await page.locator('#ctl-materialOpacity').isVisible());
  await page.evaluate(() => stickerApp.undo());
  assert.equal(await page.locator('#ctl-material').inputValue(), 'glass');
  await page.evaluate(() => stickerApp.redo());
  assert.equal(await page.locator('#ctl-material').inputValue(), 'paper');
  await page.selectOption('#presetSelect', 'Holographic');
  assert.equal(await page.locator('#ctl-material').inputValue(), 'paper');
  assert.equal(await page.locator('#ctl-materialFinish').inputValue(), 'custom');
  await page.evaluate(() => stickerApp.duplicateSelected());
  assert.equal(await page.locator('#ctl-material').inputValue(), 'paper');
  await page.selectOption('#ctl-material', 'embroidery');
  await page.selectOption('#ctl-materialFinish', 'natural');
  await page.evaluate(() => I18N.setLocale('zh-TW'));
  assert.equal(await page.locator('label[for="ctl-material"]').textContent(), '材質');
  await page.evaluate(() => I18N.setLocale('en'));
  const report = await page.evaluate(() => {
    const r = stickerApp.scene.renderer, size = 320;
    const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
    ctx.fillStyle = '#8cbcd9'; ctx.beginPath(); ctx.arc(160, 160, 113, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5bacd'; ctx.beginPath(); ctx.arc(160, 142, 76, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#342c40'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('hello', 160, 153);
    ctx.font = '13px sans-serif'; ctx.fillText('MAKE SOMETHING YOURS', 160, 210);
    const sdf = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) sdf[y * size + x] = 113 - Math.hypot(x + .5 - 160, y + .5 - 160);
    const tex = r.createTextures({ canvas: c, sdf, w: size, h: size });
    const render = (s, light = [-140, 190, 500]) => r.renderToCanvas({ width: size, height: size, draw() {
      r.beginFrame({ stageW: size, stageH: size, camDist: 6400, light, time: 0 });
      r.drawSticker(tex, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, width: size, height: size }, s);
    } });
    const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const sheet = document.createElement('canvas'); sheet.width = 1020; sheet.height = 1160; const out = sheet.getContext('2d');
    out.fillStyle = '#f8f3ed'; out.fillRect(0, 0, sheet.width, sheet.height);
    out.fillStyle = '#352c40'; out.font = 'bold 28px sans-serif'; out.fillText('Pick your material', 28, 40);
    out.font = '15px sans-serif'; out.fillText('Same artwork · Natural finish · Real editor renders', 28, 68);
    const results = [];
    Object.entries(StickerUI.MATERIALS).forEach(([key, m], i) => {
      const s = { ...StickerUI.DEFAULTS, borderWidth: 20, shadowOpacity: 0 }; StickerUI.applyMaterial(s, key);
      const image = render(s), data = pixels(image), changed = pixels(render(s, [240, -150, 300]));
      const sample = (x, y) => data[(y * size + x) * 4 + 3];
      let signature = 0; for (let j = 0; j < data.length; j += 4) signature += data[j] + data[j + 1] * 3 + data[j + 2] * 7;
      const off = pixels(render({ ...s, lightStrength: 0 }));
      const matteOff = pixels(render({ ...s, materialFinish: 'matte', lightStrength: 0 }));
      const zeroShine = off.every((v, j) => Math.abs(v - matteOff[j]) <= 1);
      results.push({ key, signature, corner: sample(0, 0), ink: sample(160, 165), rim: sample(160, 35), responds: data.some((v, j) => Math.abs(v - changed[j]) > 2), zeroShine });
      const x = i % 3 * 340, y = 92 + Math.floor(i / 3) * 350;
      out.fillStyle = '#e0e9f0'; out.fillRect(x + 10, y, 320, 320);
      out.strokeStyle = '#becfdd'; out.lineWidth = 1;
      for (let p = 0; p < 320; p += 24) { out.beginPath(); out.moveTo(x + 10 + p, y); out.lineTo(x + 10 + p, y + 320); out.stroke(); out.beginPath(); out.moveTo(x + 10, y + p); out.lineTo(x + 330, y + p); out.stroke(); }
      out.drawImage(image, x + 10, y);
      out.fillStyle = '#352c40'; out.font = 'bold 18px sans-serif'; out.fillText(m.label, x + 22, y + 342);
    });
    const glass = { ...StickerUI.DEFAULTS, borderWidth: 20 }; StickerUI.applyMaterial(glass, 'glass');
    const alphaAt = (s, x, y) => pixels(render({ ...s, lightStrength: 0 }))[(y * size + x) * 4 + 3];
    const separate = [alphaAt(glass, 160, 35), alphaAt({ ...glass, artworkOpacity: 0 }, 160, 35), alphaAt(glass, 160, 165), alphaAt({ ...glass, artworkOpacity: 0 }, 160, 165)];
    const finishes = ['natural', 'matte', 'gloss', 'holographic', 'pearl', 'glitter'].map(materialFinish => {
      const data = pixels(render({ ...glass, materialFinish })); return data.reduce((n, v, i) => n + (i % 4 === 3 ? 0 : v), 0);
    });
    r.deleteTextures(tex); return { png: sheet.toDataURL(), results, separate, finishes };
  });
  assert.equal(new Set(report.results.map(r => r.signature)).size, 9);
  assert(report.results.every(r => r.corner === 0 && r.ink > 0 && r.responds && r.zeroShine), JSON.stringify(report.results));
  assert(report.results.filter(r => ['glass', 'frosted', 'acrylic'].includes(r.key)).every(r => r.rim < 240));
  assert.equal(report.separate[0], report.separate[1], 'print opacity leaves clear rim unchanged');
  assert(report.separate[2] > report.separate[3] + 70, 'print opacity controls artwork independently');
  assert.equal(new Set(report.finishes).size, 6);
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'materials-comparison.png'), Buffer.from(report.png.split(',')[1], 'base64'));
  const saved = await page.evaluate(async () => {
    const rec = stickerApp.addIcon('cinnamoroll', { settings: { material: 'resin', materialFinish: 'pearl', materialDepth: .73 } });
    const entry = stickerApp.scene.get(rec.id), frame = stickerApp.scene.animationFrames(entry, { size: 128, fps: 2, shadow: false });
    const blob = StickerAnim.encodeGIF(frame.frames, 2), png = stickerApp.scene.snapshot(entry, { scale: .3 });
    const { url } = await stickerApp.shareLink(); const before = new Set(stickerApp.records.keys()); await stickerApp.loadSharedScene(new URL(url).hash);
    const restored = [...stickerApp.records.values()].find(r => !before.has(r.id) && r.kind === 'icon');
    return { material: restored.settings.material, finish: restored.settings.materialFinish, depth: restored.settings.materialDepth, gif: blob.size, png: png.width };
  });
  assert.equal(saved.material, 'resin'); assert.equal(saved.finish, 'pearl'); assert.equal(saved.depth, .73); assert(saved.gif > 100 && saved.png > 0);
  await page.evaluate(id => { stickerApp.scene.select(stickerApp.scene.get(id)); }, id);
  await page.selectOption('#ctl-material', 'frosted');
  await page.locator('[data-group="material"]').screenshot({ path: path.join(OUT, 'materials-controls.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-group="material"]').scrollIntoViewIfNeeded();
  const bounds = await page.locator('[data-group="material"]').boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await page.locator('[data-group="material"]').screenshot({ path: path.join(OUT, 'materials-mobile.png') });
  assert.deepEqual(errors, []);
  console.log('PASS nine distinct materials, six finishes, light response, transparency, import controls, undo/redo, duplication, preset independence, sharing, GIF/PNG, localization and mobile layout');
  console.log(JSON.stringify(report.results));
} finally { await browser?.close(); server.close(); }
