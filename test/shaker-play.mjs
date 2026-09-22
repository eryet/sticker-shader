import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SHAKER_TEST_OUTPUT || path.join(ROOT, 'test/.out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.stickerApp?.ready);
  await page.evaluate(() => stickerApp.ready);
  await page.evaluate(() => { stickerApp.addIcon('shaker'); stickerApp.scene.stop(); });
  assert(await page.locator('#shakerLiquidOptions').isHidden());
  assert(await page.locator('#shakerMagnetOptions').isHidden());
  await page.locator('#shakerLiquid').check();
  assert(await page.locator('#shakerShake').isEnabled(), 'empty liquid shaker can swirl glitter');
  await page.evaluate(() => { stickerApp.addIcon('heart'); stickerApp.addIcon('star'); stickerApp.addIcon('flower'); });
  const slider = async (id, value) => page.locator('#' + id).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }, String(value));
  await slider('shakerLiquidLevel', .8);
  await slider('shakerViscosity', .7);
  await slider('shakerGlitter', .85);
  await page.locator('#shakerLiquidColor').fill('#dfb1ec');
  await page.locator('#shakerLiquidColor').dispatchEvent('change');
  await page.locator('#shakerMagnet').selectOption('attract');
  await slider('shakerMagnetStrength', .8);
  await page.evaluate(() => stickerApp.undo());
  assert.equal(await page.locator('#shakerMagnetStrength').inputValue(), '0.65');
  await page.evaluate(() => stickerApp.redo());
  assert.equal(await page.locator('#shakerMagnetStrength').inputValue(), '0.8');

  const physics = await page.evaluate(() => {
    const S = StickerShaker, items = stickerApp.selected.shakerItems;
    const magnet = mode => {
      const s = S.create([items[0]], { shakerMode: 'flat', shakerMagnet: mode, shakerPieceSize: 6 });
      Object.assign(s.bodies[0], { x: -10, y: 0, vx: 0, vy: 0 });
      for (let i = 0; i < 90; i++) S.advance(s, 1 / 120, { magnet: { x: 12, y: 0 } });
      return s.bodies[0].x;
    };
    const travel = viscosity => {
      const s = S.create([items[0]], { shakerMode: 'flat', shakerLiquid: true, shakerLiquidLevel: .95, shakerViscosity: viscosity, shakerPieceSize: 6 });
      Object.assign(s.bodies[0], { x: -15, y: 10, vx: 35, vy: 0 });
      for (let i = 0; i < 60; i++) S.advance(s, 1 / 120);
      return s.bodies[0].x + 15;
    };
    const designs = [];
    for (const [design] of S.DESIGNS) {
      const s = S.create(items, { ...stickerApp.selected.settings, shakerDesign: design });
      let valid = true;
      for (let i = 0; i < 180; i++) {
        const a = i / 24;
        S.advance(s, 1 / 60, { gx: Math.sin(a) * 105, gy: Math.cos(a) * 105, x: Math.sin(a * 3) * 300, preview: true });
        valid &&= S.validLayout(s) && Number.isFinite(s.fluid.angle) && s.dust.every(p => Number.isFinite(p.x + p.y));
      }
      const energy = s.fluid.energy;
      for (let i = 0; i < 360; i++) S.advance(s, 1 / 120);
      designs.push({ design, valid, energy, settled: s.fluid.energy });
    }
    const settings = { ...stickerApp.selected.settings };
    const a = S.create(items, settings), b = S.create(items, settings);
    for (let i = 0; i < 120; i++) { S.advance(a, 1 / 120, { preview: true }); S.advance(b, 1 / 120, { preview: true }); }
    const deterministic = JSON.stringify(a.bodies.map(p => [p.x, p.y])) === JSON.stringify(b.bodies.map(p => [p.x, p.y]));
    return { attract: magnet('attract'), repel: magnet('repel'), off: magnet('off'), water: travel(0), syrup: travel(1), designs, deterministic };
  });
  assert(physics.attract > 0 && physics.repel < -15 && physics.off === -10, JSON.stringify(physics));
  assert(physics.water > physics.syrup * 1.5, JSON.stringify(physics));
  assert(physics.designs.every(d => d.valid && d.settled < d.energy * .01), JSON.stringify(physics.designs));
  assert(physics.deterministic);
  console.log('PASS attract/repel, viscosity, slosh settling, deterministic playback and containment in all 12 shells');

  // Pointer coordinates include atlas padding. Hold the shell still while testing the glass and rim.
  const points = await page.evaluate(() => {
    const a = stickerApp, e = a.scene.get(a.selected.id), scene = a.scene;
    Object.assign(e.settings, { anim: 'none', baseRotation: 0, hoverTilt: 0, idleSway: 0 });
    Object.assign(e, { spawn: 0, lift: 0, rotX: 0, rotY: 0, rotZ: 0, arot: 0, ax: 0, ay: 0, ascale: 1, x: scene.stageW / 2, y: scene.stageH / 2 });
    e.restX = e.x; e.restY = e.y; scene.render();
    const size = scene.size(e), rect = scene.canvas.getBoundingClientRect();
    const point = (x, y) => ({ x: rect.x + e.x + (((x / 100 + .5) * e.work.w - e.atlas.x0) / e.atlas.w - .5) * size.w,
      y: rect.y + e.y + (((y / 100 + .63) * e.work.h - e.atlas.y0) / e.atlas.h - .5) * size.h });
    return { glass: point(10, -5), rim: point(31.5, 0), history: a.history.undo.length, x: e.x, y: e.y };
  });
  await page.mouse.move(points.glass.x, points.glass.y); await page.mouse.down();
  assert(await page.evaluate(() => !!stickerApp.scene.magnetGesture && !stickerApp.scene.drag), 'glass engages magnet');
  await page.mouse.move(points.glass.x + 15, points.glass.y - 10);
  const held = await page.evaluate(() => {
    const a = stickerApp, e = a.scene.get(a.selected.id);
    const before = e.shaker.bodies.map(b => [b.x, b.y]);
    for (let i = 0; i < 90; i++) a.scene._updateShaker(e, 1 / 120);
    return { x: e.x, y: e.y, moved: e.shaker.bodies.some((b, i) => Math.hypot(b.x - before[i][0], b.y - before[i][1]) > 1), magnet: !!e.shaker.magnet };
  });
  assert(held.moved && held.magnet && held.x === points.x && held.y === points.y);
  await page.mouse.up();
  assert(await page.evaluate(() => !stickerApp.scene.magnetGesture && !stickerApp.scene.get(stickerApp.selected.id).shaker.magnet));
  assert.equal(await page.evaluate(() => stickerApp.history.undo.length), points.history, 'play does not add editing history');
  await page.mouse.move(points.rim.x, points.rim.y); await page.mouse.down();
  assert(await page.evaluate(() => !!stickerApp.scene.drag && !stickerApp.scene.magnetGesture), 'rim still drags');
  await page.mouse.up();
  await page.mouse.move(points.glass.x, points.glass.y); await page.mouse.down();
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert(await page.evaluate(() => !stickerApp.scene.magnetGesture));
  const cancel = await page.evaluate(({ x, y }) => {
    const scene = stickerApp.scene, canvas = scene.canvas;
    const send = (type, id = 77) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 77, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    send('pointerdown'); const touch = !!scene.magnetGesture;
    send('pointerdown', 78); const single = scene.magnetGesture?.id === 77 && !scene.pinch;
    send('pointercancel'); const cancelled = !scene.magnetGesture && scene.pointers.size === 0;
    send('pointerdown'); send('lostpointercapture'); const lost = !scene.magnetGesture;
    send('pointerdown'); scene.select(null); const deselected = !scene.magnetGesture;
    return { touch, single, cancelled, lost, deselected };
  }, points.glass);
  assert(Object.values(cancel).every(Boolean), JSON.stringify(cancel));
  await page.evaluate(() => { const a = stickerApp; a.scene.select(a.scene.stickers.find(e => e.shaker)); });
  const projection = await page.evaluate(() => {
    const scene = stickerApp.scene, e = scene.selected, R = StickerRenderer;
    const results = [];
    for (const flip of [false, true]) for (const angle of [-1.1, 0, .7]) {
      e.rotZ = angle; e.rotX = .2; e.rotY = -.25; e.settings.flipX = flip;
      const u = ((.5 + .1) * e.work.w - e.atlas.x0) / e.atlas.w, v = ((.63 - .07) * e.work.h - e.atlas.y0) / e.atlas.h;
      const pose = scene._pose(e, scene.stageW, scene.stageH), p = R.surfaceVertex(pose, flip ? 1 - u : u, v, 0, R.peelInset(e.tex, e.settings));
      const cam = scene._view().camDist, screen = { x: scene.stageW / 2 + p.x * cam / (cam - p.z), y: scene.stageH / 2 - p.y * cam / (cam - p.z) };
      const local = scene.shakerPoint(e, screen);
      results.push(Math.hypot(local.x - 10, local.y + 7));
    }
    e.rotX = e.rotY = e.rotZ = 0; e.settings.flipX = false;
    return results;
  });
  assert(projection.every(error => error < .001), JSON.stringify(projection));
  await page.locator('#shakerMagnetPreview').click();
  assert(await page.evaluate(() => stickerApp.scene.get(stickerApp.selected.id).shaker.previewRemaining > 0));
  const reduced = await page.evaluate(() => {
    const a = stickerApp, scene = a.scene, e = scene.get(a.selected.id), original = scene.surfaceMotionPreference;
    scene.surfaceMotionPreference = { matches: true }; e.shaker.previewRemaining = 0; e.shaker.burst = 0;
    const before = e.shaker.elapsed; scene._updateShaker(e, 1 / 60); const frozen = before === e.shaker.elapsed;
    e.shaker.previewRemaining = 1; scene._updateShaker(e, 1 / 60); const explicit = e.shaker.elapsed > before;
    e.locked = true; scene._updateShaker(e, 1 / 60); const locked = !e.shaker.magnet;
    e.locked = false; scene.surfaceMotionPreference = original;
    return { frozen, explicit, locked };
  });
  assert(reduced.frozen && reduced.explicit && reduced.locked);
  console.log('PASS mouse/touch gestures, cancellation, rotated/mirrored picking, preview, locks and reduced motion');

  const exported = await page.evaluate(async () => {
    const a = stickerApp, r = a.selected, e = a.scene.get(r.id);
    const saved = JSON.stringify(e.shaker.bodies.map(b => [b.x, b.y]));
    const animation = a.scene.animationFrames(e, { size: 256, fps: 8, tilt: false });
    const gif = StickerAnim.encodeGIF(animation.frames, animation.fps);
    const apng = await StickerAnim.encodeAPNG(animation.frames, animation.fps);
    const gifDecoder = new ImageDecoder({ data: await gif.arrayBuffer(), type: 'image/gif' });
    const decoded = await gifDecoder.decode({ frameIndex: 1 }); decoded.image.close(); gifDecoder.close();
    const bitmap = await createImageBitmap(apng); const size = [bitmap.width, bitmap.height]; bitmap.close();
    const png = a.scene.snapshot(e).toDataURL();
    const svg = a.animatedSvg(e), svgFrames = (svg.match(/data:image\/png;base64/g) || []).length;
    const different = animation.frames[2].toDataURL() !== animation.frames[12].toDataURL();
    const unchanged = saved === JSON.stringify(e.shaker.bodies.map(b => [b.x, b.y]));
    const dup = a.duplicateSelected(); const copied = dup.settings.shakerLiquid && dup.settings.shakerMagnet === 'attract';
    a.undo(); a.scene.select(e);
    const { url } = await a.shareLink();
    return { png, svgFrames, frame: animation.frames[8].toDataURL(), gif: Array.from(new Uint8Array(await gif.arrayBuffer())), apng: apng.size, size, different, unchanged, copied, url };
  });
  assert(exported.different && exported.unchanged && exported.copied && exported.apng > 500 && exported.size.every(n => n > 0));
  assert(exported.svgFrames > 2, 'SVG contains rendered liquid and magnet frames');
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, data] of [['liquid-shaker.png', exported.png], ['liquid-shaker-moving.png', exported.frame]]) fs.writeFileSync(path.join(OUT, name), Buffer.from(data.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'liquid-shaker.gif'), Buffer.from(exported.gif));
  fs.writeFileSync(path.join(OUT, 'shaker-play-demo-url.txt'), exported.url.replace(new URL(exported.url).origin, 'http://127.0.0.1:8000'));
  await page.screenshot({ path: path.join(OUT, 'shaker-play-desktop.png') });
  await page.goto(exported.url);
  await page.reload(); await page.waitForFunction(() => window.stickerApp?.ready); await page.evaluate(() => stickerApp.ready);
  const shared = await page.evaluate(() => {
    const a = stickerApp, r = [...a.records.values()].find(r => r.icon === 'shaker'); a.scene.select(a.scene.get(r.id)); a.scene.stop();
    return { settings: r.settings, count: r.shakerItems.length };
  });
  assert.equal(shared.count, 3); assert.equal(shared.settings.shakerLiquidColor, '#dfb1ec');
  assert.equal(shared.settings.shakerLiquidLevel, .8); assert.equal(shared.settings.shakerMagnetStrength, .8);
  assert.equal(shared.settings.shakerMagnet, 'attract'); assert.equal(shared.settings.shakerGlitter, .85);
  console.log('PASS decoded GIF/APNG, varying animation frames, live-state preservation, duplication and share reload');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => I18N.setLocale('zh-TW'));
  await page.locator('#shakerMagnetSection').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#shakerMagnetSection summary').innerText(), '磁鐵遊戲');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#shakerMagnet').selectOption('repel');
  await page.locator('#shakerMagnetPreview').focus(); await page.keyboard.press('Enter');
  assert(await page.evaluate(() => stickerApp.scene.get(stickerApp.selected.id).shaker.previewRemaining > 0));
  await page.screenshot({ path: path.join(OUT, 'shaker-play-mobile-zh.png') });
  await page.locator('#shakerLiquidSection').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'shaker-liquid-mobile-zh.png') });
  assert.deepEqual(errors, []);
  console.log('PASS mobile controls, keyboard preview and Traditional Chinese');
} finally { if (browser) await browser.close(); server.close(); }
