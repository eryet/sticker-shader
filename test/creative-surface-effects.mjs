/* Behaviour and rendered-image checks for ripple, lenticular artwork and assembly. */
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
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.route('https://**', r => r.abort());
  await page.addInitScript(() => localStorage.setItem('sticker-shader-editor:locale', 'en'));
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.stickerApp); fs.mkdirSync(OUT, { recursive: true });
  const pixels = await page.evaluate(() => {
    stickerApp.scene.stop();
    const r = stickerApp.renderer, R = StickerRenderer;
    const make = colour => { const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d'); ctx.fillStyle = colour; ctx.fillRect(0, 0, 128, 128); return c; };
    const primary = make('#ed568c'), second = make('#398ece'), ctx = primary.getContext('2d');
    ctx.fillStyle = '#fff'; for (let x = 20; x < 110; x += 12) ctx.fillRect(x, 0, 3, 128);
    const sdf = new Float32Array(128 * 128); for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) sdf[y * 128 + x] = Math.min(x - 8, y - 8, 119 - x, 119 - y, Math.hypot(x - 64, y - 64) - 10);
    const tex = r.createTextures({ canvas: primary, second, sdf, w: 128, h: 128 });
    const s = { ...StickerUI.DEFAULTS, surfaceAmount: 1, surfaceTrigger: 'loop', lightStrength: 0, diffuse: 0, grain: 0, borderWidth: 0, shadowOpacity: 0 };
    const render = (effect, phase, opts = {}) => r.renderToCanvas({ width: 180, height: 180, draw() { r.beginFrame({ stageW: 180, stageH: 180, camDist: 500, time: 0, light: [0, 0, 400] }); r.drawSticker(tex, { x: 0, y: 0, z: 0, width: 150, height: 150, rotX: 0, rotY: 0, rotZ: 0 }, { ...s, surfaceEffect: effect, ...(opts.settings || {}) }, { surfacePhase: phase, ...opts }); } });
    const data = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const distance = (a, b) => { const A = data(a), B = data(b); return A.reduce((sum, v, i) => sum + Math.abs(v - B[i]), 0); };
    const base = render('none', 0), ripple = render('ripple', .24), shifted = render('ripple', .24, { surfaceOrigin: [.2, .2] });
    const A = render('lenticular', 0), B = render('lenticular', .5, { settings: { surfaceAmount: .8 } }), mid = render('lenticular', .25);
    const at = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data];
    const sheet = document.createElement('canvas'); sheet.width = 1080; sheet.height = 240; const out = sheet.getContext('2d'); out.fillStyle = '#e8effa'; out.fillRect(0, 0, 1080, 240); out.font = '16px sans-serif'; out.fillStyle = '#402d41';
    for (const [i, [c, label]] of [[base, 'Original'], [ripple, 'Glass ripple'], [shifted, 'Touch at corner'], [A, 'Lenticular A'], [mid, 'Lens transition'], [B, 'Lenticular B']].entries()) { out.drawImage(c, i * 180, 35); out.fillText(label, i * 180 + 8, 25); }
    const report = { ripple: distance(base, ripple), origin: distance(ripple, shifted), rippleSeam: distance(render('ripple', 0), render('ripple', 1)), off: distance(base, render('ripple', .24, { settings: { surfaceAmount: 0 } })), flipA: distance(base, A), flipSeam: distance(A, render('lenticular', 1)), flipB: at(B, 50, 60), flipOff: distance(base, render('lenticular', .5, { settings: { surfaceAmount: 0 } })), holes: [base, ripple, B].map(c => at(c, 90, 90)[3]), png: sheet.toDataURL(), file: second.toDataURL(), gl: r.gl.getError() };
    r.deleteTextures(tex); return report;
  });
  fs.writeFileSync(path.join(OUT, 'creative-surfaces-review.png'), Buffer.from(pixels.png.split(',')[1], 'base64'));
  assert(pixels.ripple > 1000 && pixels.origin > 1000, JSON.stringify(pixels));
  // Allow at most four one-level raster rounding differences across the image.
  for (const key of ['rippleSeam', 'off', 'flipA', 'flipSeam', 'flipOff']) assert(pixels[key] <= 4, key + ': ' + pixels[key]);
  assert(pixels.flipB[2] > pixels.flipB[0] + 80); assert(pixels.holes.every(a => a === 0)); assert.equal(pixels.gl, 0);
  await page.evaluate(() => {
    stickerApp.addIcon('heart', { settings: { ...StickerUI.DEFAULTS, workingRes: '512', anim: 'none', surfaceEffect: 'none' } });
    const group = document.querySelector('[data-group="motion"]'); group.classList.remove('collapsed'); group.querySelector('.group-head').setAttribute('aria-expanded', 'true');
  });
  await page.locator('[data-surface-effect="lenticular"]').click();
  assert.equal(await page.locator('#ctl-surfaceTrigger').inputValue(), 'pointer');
  assert(await page.locator('#btnFlipImage').isVisible());
  await page.locator('#btnSampleFlipImage').click();
  assert(await page.evaluate(() => !!stickerApp.scene.selected.tex.second));
  await page.evaluate(() => stickerApp.undo()); assert.equal(await page.evaluate(() => !!stickerApp.scene.selected.tex.second), false);
  await page.evaluate(() => stickerApp.redo()); assert(await page.evaluate(() => !!stickerApp.scene.selected.tex.second));
  // The actual upload input captures its target before decoding.
  const chooser = page.waitForEvent('filechooser'); await page.locator('#btnFlipImage').click();
  await (await chooser).setFiles({ name: 'second-blue.png', mimeType: 'image/png', buffer: Buffer.from(pixels.file.split(',')[1], 'base64') });
  await page.waitForFunction(() => stickerApp.selected.secondImage?.name === 'second-blue.png');
  const gestures = await page.evaluate(() => {
    const sc = stickerApp.scene, e = sc.selected, rect = sc.canvas.getBoundingClientRect();
    e.x = e.restX = sc.stageW / 2; e.y = e.restY = sc.stageH / 2; e.spawn = 0; e.rotX = e.rotY = e.rotZ = e.ax = e.ay = e.arot = e.lift = 0; e.ascale = 1; e.surfaceStarted = undefined;
    Object.assign(e.settings, { baseRotation: 0, hoverTilt: 0, idleSway: 0, surfaceTrigger: 'pointer' });
    const point = (type, u, pointerType = 'mouse') => new PointerEvent(type, { pointerId: 9, pointerType, clientX: rect.left + e.x + (u - .5) * sc.size(e).w, clientY: rect.top + e.y, bubbles: true });
    sc._move(point('pointermove', .65)); for (let i = 0; i < 40; i++) sc.update(.016); const right = sc._surfaceOptions(e).surfaceMix;
    sc._move(point('pointermove', .35)); for (let i = 0; i < 40; i++) sc.update(.016); const left = sc._surfaceOptions(e).surfaceMix;
    sc._down(point('pointerdown', .5, 'touch')); sc._up(point('pointerup', .5, 'touch')); const touch = e.surfaceStarted === sc.time;
    e.settings.surfaceEffect = 'ripple'; e.settings.surfaceTrigger = 'tap'; e.surfaceStarted = undefined;
    sc._down(point('pointerdown', .65)); sc._up(point('pointerup', .65)); const origin = e.surfaceOrigin[0] > .6;
    return { left, right, touch, origin };
  });
  assert(gestures.left < .4 && gestures.right > .6 && gestures.touch && gestures.origin, JSON.stringify(gestures));
  const effectExports = await page.evaluate(() => {
    const sc = stickerApp.scene, entry = sc.selected, settings = { ...entry.settings };
    const counts = ['ripple', 'lenticular'].map(surfaceEffect => {
      Object.assign(entry.settings, { surfaceEffect, surfaceTrigger: 'pointer', lightStrength: 0, diffuse: 0, grain: 0, anim: 'none', surfaceAmount: 1 });
      const cycle = sc.animationFrames(entry, { size: 96, fps: 2, tilt: false });
      const data = cycle.frames.map(c => c.getContext('2d').getImageData(0, 0, 96, 96).data);
      return data.filter(d => d.reduce((n, v, i) => n + Math.abs(v - data[0][i]), 0) > 1000).length;
    }); Object.assign(entry.settings, settings); return counts;
  });
  assert(effectExports.every(n => n >= 2), JSON.stringify(effectExports));
  const assembly = await page.evaluate(async () => {
    const app = stickerApp, sc = app.scene;
    const c = document.createElement('canvas'); c.width = c.height = 160; const ctx = c.getContext('2d'); ctx.fillStyle = '#266bd3'; ctx.fillRect(0, 0, 160, 160); ctx.fillStyle = '#fff'; ctx.fillRect(45, 45, 70, 70);
    const blob = await new Promise(resolve => c.toBlob(resolve));
    const photo = await app.addSticker(blob, 'photo.png', { quiet: true, imageMode: 'whole', settings: { ...StickerUI.DEFAULTS, workingRes: '512', borderWidth: 0 } });
    const frame = app.addFrame({ quiet: true, settings: { ...StickerUI.DEFAULTS, workingRes: '512', surfaceEffect: 'assembly', surfaceAmount: 1, surfaceTrigger: 'tap', anim: 'none', baseRotation: 0, frameDecor: 'none', frameTape: 'none' } });
    app.setFramePhoto(frame, photo.id, { sync: true }); const root = sc.get(frame.id);
    for (const [id, u] of [['heart', -.3], ['star', .3]]) { const icon = app.addIcon(id, { quiet: true, settings: { ...StickerUI.DEFAULTS, workingRes: '512', stickerScale: .16, surfaceEffect: 'none' } }); const child = sc.get(icon.id); sc.attach(child, root); child.offset = { u, v: .3 }; child.spawn = 0; }
    root.spawn = 0; sc.select(root); root.surfaceStarted = 0;
    const states = [.05, .25, .45, .68, 1].map(t => { sc.time = t * StickerRenderer.surfacePeriod(root.settings); return [root, ...sc.children(root)].map(e => sc._pose(e, sc.stageW, sc.stageH).opacity); });
    const save = JSON.stringify(sc.stickers.map(e => [e.x, e.y, e.offset, e.settings]));
    const cycle = sc.animationFrames(root, { size: 128, fps: 4, tilt: false });
    const gif = StickerAnim.encodeGIF(cycle.frames, cycle.fps), apng = await StickerAnim.encodeAPNG(cycle.frames, cycle.fps), svg = app.animatedSvg(root);
    const intact = save === JSON.stringify(sc.stickers.map(e => [e.x, e.y, e.offset, e.settings]));
    const sheet = document.createElement('canvas'); sheet.width = 640; sheet.height = 128; const out = sheet.getContext('2d'); out.fillStyle = '#e8effa'; out.fillRect(0, 0, 640, 128); [1, 4, 6, 9, 12].forEach((n, i) => out.drawImage(cycle.frames[n], i * 128, 0));
    return { base: !!root.tex.assemblyBase, states, intact, gif: gif.size, apng: apng.size, svg: typeof svg === 'string' ? svg.includes('calcMode="discrete"') : svg.size > 100, png: sheet.toDataURL(), gl: sc.renderer.gl.getError() };
  });
  fs.writeFileSync(path.join(OUT, 'assembly-review.png'), Buffer.from(assembly.png.split(',')[1], 'base64'));
  assert(assembly.base && assembly.intact && assembly.gif > 100 && assembly.apng > 100 && assembly.svg, JSON.stringify(assembly));
  assert(assembly.states[1][0] > .99 && assembly.states[1][1] < .05 && assembly.states[1][2] < .05, JSON.stringify(assembly.states));
  assert(assembly.states[3].every(n => n > .99)); assert.equal(assembly.gl, 0);
  await page.locator('[data-surface-effect="lenticular"]').click(); await page.locator('#btnSampleFlipImage').click();
  const lifecycle = await page.evaluate(() => {
    const app = stickerApp, original = app.selected; const copy = app.duplicateSelected();
    const independent = copy.secondImage === original.secondImage && app.scene.get(copy.id).tex.second !== app.scene.get(original.id).tex.second;
    app.composeRecord(copy, { sync: true }); const rebuilt = !!app.scene.get(copy.id).tex.second;
    const share = JSON.stringify(app.serializeScene()); const privateImage = !share.includes('data:image') && !share.includes('secondImage');
    return { independent, rebuilt, privateImage };
  });
  assert(Object.values(lifecycle).every(Boolean), JSON.stringify(lifecycle));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForFunction(() => document.querySelector('#btnPreviewSurface').disabled);
  assert.equal(await page.evaluate(() => stickerApp.scene._surfaceOptions(stickerApp.scene.selected).surfaceMix), undefined);
  await page.evaluate(() => I18N.setLocale('zh-TW')); await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-surface-effect="lenticular"]').scrollIntoViewIfNeeded();
  assert((await page.locator('[data-surface-effect="ripple"]').innerText()).includes('玻璃漣漪'));
  assert((await page.locator('#btnFlipImage').innerText()).includes('第二張圖片'));
  assert.equal(await page.locator('.surface-effects').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
  await page.screenshot({ path: path.join(OUT, 'creative-surfaces-mobile.png') });
  await page.evaluate(() => stickerApp.lockObject(stickerApp.selected.id)); assert(await page.locator('#btnFlipImage').isDisabled());
  assert.deepEqual(errors, []);
  console.log('PASS ripple origin/silhouette, real A/B images, upload/undo/duplicate/rebuild, pointer/touch, assembly sequence/photo layer, GIF/APNG/SVG, private share data, Chinese/mobile/reduced motion and locks');
} finally { await browser?.close(); server.close(); }
