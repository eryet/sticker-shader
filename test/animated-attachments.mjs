/* Animated exports must include the selected sticker's attached decorations. */
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
  const ids = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#2040ef'; ctx.fillRect(0, 0, c.width, c.height);
    const root = await stickerApp.addSticker(await new Promise(r => c.toBlob(r)), 'Decorated photo', { imageMode: 'whole' });
    const red = stickerApp.addIcon('heart'), green = stickerApp.addIcon('star'), detached = stickerApp.addIcon('bow');
    return { root: root.id, red: red.id, green: green.id, detached: detached.id };
  });
  await page.waitForFunction(ids => Object.values(ids).every(id => stickerApp.scene.get(id)?.tex), ids);
  const report = await page.evaluate(async ids => {
    const { scene, renderer } = stickerApp; scene.stop();
    const root = scene.get(ids.root), red = scene.get(ids.red), green = scene.get(ids.green), detached = scene.get(ids.detached);
    for (const e of [root, red, green, detached]) Object.assign(e.settings, { lightStrength: 0, inkBrightness: 1, inkSaturation: 1, diffuse: 0, grain: 0, bevel: 0, borderWidth: 0, anim: 'none', baseRotation: 0, idleSway: 0, shadowOpacity: 0, stickerScale: e === root ? .7 : .3 });
    scene.relayout(); scene.attach(red, root); scene.attach(green, root); scene.detach(detached);
    red.offset = { u: .56, v: -.3 }; green.offset = { u: -.55, v: .35 };
    const tint = (canvas, colour) => {
      const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
      const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = colour; ctx.fillRect(0, 0, c.width, c.height); return c;
    };
    scene.setAtlas(red.id, { ...red.atlas, canvas: tint(red.atlas.canvas, '#ef2020'), blink: null,
      frames: [{ canvas: tint(red.atlas.canvas, '#ef20ef') }], durations: [200, 200] });
    scene.setAtlas(green.id, { ...green.atlas, canvas: tint(green.atlas.canvas, '#20ef40'), blink: tint(green.atlas.canvas, '#20efef') });
    scene.setAtlas(detached.id, { ...detached.atlas, canvas: tint(detached.atlas.canvas, '#efef20'), blink: null });
    green.blinkPhase = 0; green.settings.anim = 'orbit'; green.settings.animAmount = 2; green.settings.animSpeed = 1.4;
    red.settings.baseRotation = 23; red.settings.flipX = true;
    root.settings.anim = 'spin'; root.settings.baseRotation = 37; root.settings.animAmount = 2;
    const before = JSON.stringify(scene.stickers.map(e => [e.id, e.x, e.y, e.parent?.id, e.offset, e.settings]));
    const calls = [], draw = renderer.drawSticker;
    renderer.drawSticker = function(tex, pose, settings, opts) {
      calls.push({ id: scene.stickers.find(e => e.settings === settings)?.id, pose: { ...pose, rotation: [...pose.rotation] } });
      return draw.call(this, tex, pose, settings, opts);
    };
    let anim;
    try { anim = scene.animationFrames(root, { size: 144, fps: 6, tilt: true }); }
    finally { renderer.drawSticker = draw; }
    const after = JSON.stringify(scene.stickers.map(e => [e.id, e.x, e.y, e.parent?.id, e.offset, e.settings]));
    const colours = canvas => {
      const { width: w, height: h } = canvas, d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      const count = { blue: 0, red: 0, magenta: 0, green: 0, cyan: 0, yellow: 0, edges: 0 };
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b, a] = d.subarray(i, i + 4); if (a < 180) continue;
        if (r < 100 && g < 120 && b > 180) count.blue++;
        if (r > 180 && g < 90 && b < 100) count.red++;
        if (r > 180 && g < 90 && b > 180) count.magenta++;
        if (r < 100 && g > 170 && b < 140) count.green++;
        if (r < 100 && g > 170 && b > 170) count.cyan++;
        if (r > 180 && g > 170 && b < 100) count.yellow++;
        const x = i / 4 % w, y = Math.floor(i / 4 / w); if (x === 0 || y === 0 || x === w - 1 || y === h - 1) count.edges++;
      }
      return count;
    };
    const poses = [];
    for (let i = 0; i < calls.length; i += 3) {
      const [p, r, g] = calls.slice(i, i + 3), m = p.pose.rotation, dx = red.offset.u * p.pose.width, dy = -red.offset.v * p.pose.height;
      const base = -root.settings.baseRotation * Math.PI / 180, x = Math.cos(base) * dx + Math.sin(base) * dy, y = -Math.sin(base) * dx + Math.cos(base) * dy;
      poses.push({ order: [p.id, r.id, g.id], error: Math.hypot(r.pose.x - p.pose.x - m[0] * x - m[3] * y, r.pose.y - p.pose.y - m[1] * x - m[4] * y, r.pose.z - p.pose.z - m[2] * x - m[5] * y) });
    }
    const decode = async blob => {
      const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type === 'image/apng' ? 'image/png' : blob.type }); await decoder.tracks.ready;
      const frames = [], c = document.createElement('canvas'); c.width = c.height = 144;
      for (let i = 0; i < decoder.tracks.selectedTrack.frameCount; i++) {
        const { image } = await decoder.decode({ frameIndex: i }); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 144, 144); ctx.drawImage(image, 0, 0); image.close(); frames.push(colours(c));
      }
      decoder.close(); return frames;
    };
    const gif = StickerAnim.encodeGIF(anim.frames, anim.fps), apng = await StickerAnim.encodeAPNG(anim.frames, anim.fps);
    const encoded = await Promise.all([decode(gif), decode(apng)]);
    // Still parents must still animate their attached GIF and blinking faces.
    root.settings.anim = 'none'; green.settings.anim = 'none';
    const still = scene.animationFrames(root, { size: 144, fps: 10, tilt: false });
    const stillColours = still.frames.map(colours);
    // With both icons at the same spot, the later layer stays above the earlier one.
    red.offset = green.offset = { u: .58, v: .2 }; green.settings.stickerScale = .5; scene.relayout(green);
    const overlap = scene.animationFrames(root, { size: 144, fps: 2, tilt: false }).frames.map(colours);
    // A frame uses exactly the same export path as a photo.
    const fr = stickerApp.addFrame({ settings: { anim: 'pop', animAmount: 2, baseRotation: 90, lightStrength: 0 } });
    const frame = scene.get(fr.id); scene.attach(red, frame); scene.attach(green, frame);
    red.offset = { u: .55, v: -.4 }; green.offset = { u: -.55, v: .4 };
    const frameColours = scene.animationFrames(frame, { size: 144, fps: 4 }).frames.map(colours);
    const dataUrl = await new Promise(r => { const reader = new FileReader(); reader.onload = () => r(reader.result); reader.readAsDataURL(gif); });
    const sheet = document.createElement('canvas'); sheet.width = 576; sheet.height = 144;
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#edf3fa'; ctx.fillRect(0, 0, 576, 144);
    for (let i = 0; i < 4; i++) ctx.drawImage(anim.frames[Math.floor(i / 4 * anim.frames.length)], i * 144, 0);
    return { raw: anim.frames.map(colours), encoded, poses, unchanged: before === after, stillColours, overlap, frameColours, gif: dataUrl, preview: sheet.toDataURL() };
  }, ids);
  const present = c => c.red + c.magenta > 4 && c.green + c.cyan > 4 && c.edges === 0 && c.yellow === 0;
  assert(report.raw.every(c => present(c) && c.blue > 100), JSON.stringify(report.raw));
  for (const frames of report.encoded) { assert.equal(frames.length, report.raw.length); assert(frames.every(c => present(c) && c.blue > 100), JSON.stringify(frames)); }
  assert(report.poses.every(p => p.error < .001 && p.order.join() === [ids.root, ids.red, ids.green].join()), JSON.stringify(report.poses));
  assert(report.unchanged, 'export must not alter the canvas or attachments');
  assert(report.stillColours.some(c => c.red > 4) && report.stillColours.some(c => c.magenta > 4), 'attached animated textures advance');
  assert(report.stillColours.some(c => c.green > 4) && report.stillColours.some(c => c.cyan > 4), 'attached faces blink on the export clock');
  assert(report.overlap.every(c => c.green + c.cyan > 4), 'topmost attached icon remains visible');
  assert(report.frameColours.every(c => c.red + c.magenta > 4 && c.green + c.cyan > 4 && c.edges === 0), JSON.stringify(report.frameColours));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'animated-attachments.gif'), Buffer.from(report.gif.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'animated-attachments-poses.png'), Buffer.from(report.preview.split(',')[1], 'base64'));
  assert.deepEqual(errors, []);
  console.log('PASS photo/frame attachments in decoded GIF and APNG, layer order, shared 3D transforms, animated textures, blinking, unclipped bounds, detached exclusion and unchanged scene');
} finally { await browser?.close(); server.close(); }
