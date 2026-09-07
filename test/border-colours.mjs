/* Border gradients: real shader pixels, controls, persistence and exports. */
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
  const pixels = await page.evaluate(() => {
    const r = stickerApp.renderer, size = 128, c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#565a60'; ctx.fillRect(30, 36, 68, 56);
    const mask = Uint8Array.from({ length: size * size }, (_, i) => i % size >= 30 && i % size < 98 && Math.floor(i / size) >= 36 && Math.floor(i / size) < 92 ? 1 : 0);
    const atlas = { canvas: c, sdf: MaskOps.signedDistance(mask, size, size), w: size, h: size };
    const settings = { ...StickerUI.DEFAULTS, borderWidth: 14, borderColor: '#ff0000', borderColor2: '#00ff00', borderColor3: '#0000ff', borderAngle: 0, lightStrength: 0, diffuse: 0, grain: 0, bevel: 0 };
    const reports = [];
    for (const preserveAlpha of [false, true]) {
      const tex = r.createTextures({ ...atlas, preserveAlpha });
      const draw = (style, angle = 0) => r.renderToCanvas({ width: size, height: size, draw() {
        r.beginFrame({ stageW: size, stageH: size, camDist: size * 10, light: [0, 0, size * 10], time: 0 });
        r.drawSticker(tex, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, width: size, height: size }, { ...settings, borderStyle: style, borderAngle: angle });
      } });
      const alpha = canvas => [...canvas.getContext('2d').getImageData(0, 0, size, size).data].filter((v, i) => i % 4 === 3).join();
      const pixel = (canvas, x, y) => [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
      const solid = draw('solid'), styles = ['solid', 'linear', 'radial', 'conic', 'rainbow'];
      const images = styles.map(s => draw(s)), line = images[1], turned = draw('linear', 90), conic = images[3];
      reports.push({ preserveAlpha, unchangedAlpha: images.every(c => alpha(c) === alpha(solid)), artwork: images.map(c => pixel(c, 64, 64)),
        solid: [pixel(solid, 23, 64), pixel(solid, 104, 64)], left: pixel(line, 23, 64), right: pixel(line, 104, 64),
        top: pixel(turned, 64, 29), bottom: pixel(turned, 64, 98), seam: [pixel(conic, 23, 63), pixel(conic, 23, 64)], distinct: new Set(images.map(c => c.toDataURL())).size });
      r.deleteTextures(tex);
    }
    return reports;
  });
  for (const p of pixels) {
    assert(p.unchangedAlpha && p.distinct === 5, JSON.stringify(p));
    for (const c of p.artwork) assert.deepEqual(c, [86, 90, 96, 255]);
    p.solid.forEach(c => assert.deepEqual(c, [255, 0, 0, 255]));
    assert(p.left[0] > p.left[2] + 100 && p.right[2] > p.right[0] + 100, JSON.stringify(p));
    assert(p.top[0] > p.top[2] + 100 && p.bottom[2] > p.bottom[0] + 100, JSON.stringify(p));
    assert(p.seam[0].slice(0, 3).every((v, i) => Math.abs(v - p.seam[1][i]) < 12), 'conic seam is continuous');
  }
  console.log('PASS five distinct border styles, unchanged artwork/alpha, solid compatibility, custom colours, angle and conic seam on standard and manual masks');

  const id = await page.evaluate(() => stickerApp.addIcon('heart', { settings: { borderWidth: 0, lightStrength: 0, diffuse: 0, baseRotation: 0, anim: 'none', iconBlink: false } }).id);
  await page.waitForFunction(id => !!stickerApp.scene.get(id)?.tex, id);
  assert.equal(await page.locator('#ctl-borderStyle').inputValue(), 'solid');
  assert(await page.locator('#ctl-borderColor2-picker').isHidden());
  const palette = name => page.locator(`[data-border-palette="${name}"]`).click();
  await palette('neon');
  assert.equal(await page.locator('#ctl-borderStyle').inputValue(), 'conic');
  assert.equal(await page.locator('#ctl-borderWidth').inputValue(), '14');
  assert(await page.locator('#ctl-borderColor2-picker').isVisible());
  await page.evaluate(() => stickerApp.undo()); assert.equal(await page.locator('#ctl-borderStyle').inputValue(), 'solid'); assert.equal(await page.locator('#ctl-borderWidth').inputValue(), '0');
  await page.evaluate(() => stickerApp.redo()); assert.equal(await page.locator('#ctl-borderColor').inputValue(), '#00e5ff');
  await page.selectOption('#presetSelect', 'Chrome'); assert.equal(await page.locator('#ctl-borderStyle').inputValue(), 'conic'); assert.equal(await page.locator('#ctl-borderColor').inputValue(), '#00e5ff');
  await page.locator('#ctl-borderColor2').evaluate(el => { el.value = '#fe22aa'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.locator('[data-border-palette="neon"]').getAttribute('aria-pressed'), 'false');
  await page.evaluate(() => stickerApp.undo()); assert.equal(await page.locator('[data-border-palette="neon"]').getAttribute('aria-pressed'), 'true');
  await page.selectOption('#ctl-borderStyle', 'radial'); assert(await page.locator('#ctl-borderAngle').isHidden());
  await palette('rainbow'); assert(await page.locator('#ctl-borderColor-picker').isHidden()); assert(await page.locator('#ctl-borderAngle').isVisible());
  await page.evaluate(id => stickerApp.lockObject(id), id); assert(await page.locator('[data-border-palette="ice"]').isDisabled());
  await page.evaluate(id => stickerApp.lockObject(id), id);
  const shared = await page.evaluate(async () => {
    const before = new Set(stickerApp.records.keys()), { url } = await stickerApp.shareLink(); await stickerApp.loadSharedScene(new URL(url).hash);
    return [...stickerApp.records.values()].filter(r => !before.has(r.id)).map(r => r.settings.borderStyle);
  });
  assert(shared.includes('rainbow'));
  await page.evaluate(id => stickerApp.scene.select(stickerApp.scene.get(id)), id);
  await palette('ice'); await page.locator('#ctl-borderColor2-picker').click();
  await page.locator('.colour-hex').fill('#aabbff'); await page.locator('.colour-hex').press('Enter');
  assert.equal(await page.locator('#ctl-borderColor2').inputValue(), '#aabbff');
  assert(await page.locator('#colourPicker').isVisible(), 'editing a gradient stop keeps the picker open');
  assert.equal(await page.locator('[data-border-palette="ice"]').getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ctl-borderColor-picker').getAttribute('aria-label'), 'Start colour');
  console.log('PASS palettes, border activation, one-step undo/redo, custom colour picker, material preservation, visibility, locks and shared settings');

  const exported = await page.evaluate(async id => {
    const { scene } = stickerApp; scene.stop(); const e = scene.get(id);
    Object.assign(e.settings, { borderWidth: 38, lightStrength: 0, diffuse: 0, anim: 'none', baseRotation: 0, borderHolo: 0 });
    const variants = [];
    for (const [key, p] of Object.entries(StickerUI.BORDER_PALETTES)) {
      for (const k of StickerUI.BORDER_COLOUR_KEYS) if (k in p) e.settings[k] = p[k];
      variants.push({ key, image: scene.snapshot(e, { scale: .3, shadow: false }) });
    }
    const anim = scene.animationFrames(e, { size: 144, fps: 3, tilt: false });
    const outputs = [StickerAnim.encodeGIF(anim.frames, anim.fps), await StickerAnim.encodeAPNG(anim.frames, anim.fps)];
    const frames = [];
    for (const blob of outputs) {
      const d = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type === 'image/apng' ? 'image/png' : blob.type }); await d.tracks.ready;
      const { image } = await d.decode({ frameIndex: 0 }); const c = document.createElement('canvas'); c.width = c.height = 144; c.getContext('2d').drawImage(image, 0, 0); image.close();
      const data = c.getContext('2d').getImageData(0, 0, 144, 144).data, colours = new Set();
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200 && Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 100) colours.add([data[i] >> 5, data[i + 1] >> 5, data[i + 2] >> 5].join());
      frames.push({ count: d.tracks.selectedTrack.frameCount, colours: colours.size }); d.close();
    }
    const svg = stickerApp.animatedSvg(e), doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const sheet = document.createElement('canvas'); sheet.width = 780; sheet.height = 440;
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#edf3fa'; ctx.fillRect(0, 0, 780, 440);
    variants.forEach((v, i) => { const x = i % 3 * 260, y = Math.floor(i / 3) * 220; ctx.drawImage(v.image, x + (260 - v.image.width) / 2, y + 25); ctx.fillStyle = '#3a2a35'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(StickerUI.BORDER_PALETTES[v.key].label, x + 130, y + 207); });
    return { frames, validSvg: !doc.querySelector('parsererror') && !!doc.querySelector('image'), preview: sheet.toDataURL() };
  }, id);
  assert(exported.frames.every(f => f.count > 1 && f.colours >= 10), JSON.stringify(exported.frames)); assert(exported.validSvg);
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'border-colour-presets.png'), Buffer.from(exported.preview.split(',')[1], 'base64'));
  await page.evaluate(() => { stickerApp.scene.start(); document.querySelector('[data-group="border"]').scrollIntoView({ block: 'start' }); });
  await palette('neon'); await page.screenshot({ path: path.join(OUT, 'border-colours-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-locale="zh-TW"]').click();
  await page.locator('[data-group="border"]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#ctl-borderStyle option[value="conic"]').textContent(), '環繞漸層');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(OUT, 'border-colours-mobile.png') });
  assert.deepEqual(errors, []);
  console.log('PASS PNG palette renders, decoded multicolour GIF/APNG, SVG, Traditional Chinese and mobile layout');
} finally { await browser?.close(); server.close(); }
