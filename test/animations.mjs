/* New idle motions: seamless loops, shared controls, attachments and exports. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'test/.out');
const ADDED = ['breathe', 'drift', 'orbit', 'figure8', 'jelly', 'hop', 'shake', 'nod', 'pop', 'tada'];
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
  const math = await page.evaluate(added => added.map(anim => {
    const S = StickerScene, period = S.ANIM_PERIOD[anim], size = { w: 360, h: 440 }, cfg = { anim, animAmount: 2, baseRotation: 37 };
    const at = t => S.animOffsets(cfg, size, t);
    const samples = Array.from({ length: 361 }, (_, i) => at(i / 360 * period));
    const bounds = S.animationBounds(cfg, size);
    let fits = true;
    for (const o of samples) {
      const a = -37 * Math.PI / 180 + o.arot, c = Math.cos(a), s = Math.sin(a);
      for (const x of [-180, 180]) for (const y of [-220, 220]) {
        fits &&= Math.abs(o.ax + (x * c - y * s) * o.ascale) <= bounds.width / 2 + .3;
        fits &&= Math.abs(o.ay + (x * s + y * c) * o.ascale) <= bounds.height / 2 + .3;
      }
    }
    const seam = Object.keys(at(0)).map(k => Math.abs(at(period - 1e-6)[k] - at(1e-6)[k]));
    return { anim, seam, fits, zero: S.animOffsets({ anim, animAmount: 0 }, size, period * .3),
      finite: samples.every(o => Object.values(o).every(Number.isFinite) && o.ascale > 0),
      moving: samples.some(o => Math.abs(o.ax) + Math.abs(o.ay) + Math.abs(o.arot) + Math.abs(o.ascale - 1) > .01),
      repeat: Object.keys(at(.71)).every(k => Math.abs(at(.71)[k] - at(.71 + period * 9)[k]) < 1e-8) };
  }), ADDED);
  for (const r of math) {
    assert(r.finite && r.moving && r.repeat && r.fits && r.seam.every(d => d < .001), JSON.stringify(r));
    assert.deepEqual(r.zero, { ax: 0, ay: 0, arot: 0, ascale: 1 });
  }
  console.log('PASS all 10 new motions: continuous loop seams, positive scales, zero amount, repeated cycles and export bounds');

  const ids = await page.evaluate(() => {
    const frame = stickerApp.addFrame({ settings: { frameDesign: 'cinnamoroll', baseRotation: -6, idleSway: 0, hoverTilt: 0 } });
    const icon = stickerApp.addIcon('cinnamoroll', { settings: { iconBlink: false, anim: 'none', stickerScale: .3 } });
    return { frame: frame.id, icon: icon.id };
  });
  const menus = await page.locator('select[id^="ctl-anim"]').evaluateAll(els => els.map(el => [...el.options].map(o => o.value)));
  assert.equal(menus.length, 3); assert(menus.every(m => m.length === 20 && ADDED.every(a => m.includes(a))));
  for (const anim of ADDED) {
    await page.selectOption('#ctl-anim-icon', anim); assert.equal(await page.locator('#ctl-anim').inputValue(), anim);
    assert.equal(await page.evaluate(() => stickerApp.selected.settings.anim), anim);
  }
  await page.evaluate(() => stickerApp.undo()); assert.equal(await page.locator('#ctl-anim-icon').inputValue(), 'pop');
  await page.evaluate(() => stickerApp.redo()); assert.equal(await page.locator('#ctl-anim-icon').inputValue(), 'tada');
  await page.evaluate(id => stickerApp.scene.select(stickerApp.scene.get(id)), ids.frame);
  await page.selectOption('#ctl-anim-frame', 'hop');
  await page.locator('#ctl-animSpeed-frame').evaluate(el => { el.value = 1.4; el.dispatchEvent(new Event('input')); });
  await page.locator('#ctl-animAmount-frame').evaluate(el => { el.value = 1.6; el.dispatchEvent(new Event('input')); });
  assert.equal(await page.locator('#ctl-animSpeed').inputValue(), '1.4'); assert.equal(await page.locator('#ctl-animAmount').inputValue(), '1.6');
  const restored = await page.evaluate(async () => {
    const before = new Set(stickerApp.records.keys()), { url } = await stickerApp.shareLink(); await stickerApp.loadSharedScene(new URL(url).hash);
    return [...stickerApp.records.values()].filter(r => !before.has(r.id)).map(r => [r.kind, r.settings.anim, r.settings.animSpeed, r.settings.animAmount]);
  });
  assert(restored.some(r => r[0] === 'frame' && r[1] === 'hop' && r[2] === 1.4 && r[3] === 1.6));
  assert(restored.some(r => r[0] === 'icon' && r[1] === 'tada'));
  console.log('PASS all dropdowns, immediate selection, frame speed/amount, shared controls, undo/redo and share restoration');

  const exported = await page.evaluate(async ({ ids, added }) => {
    const app = stickerApp, scene = app.scene; scene.stop();
    const reports = [], previews = [], labels = Object.fromEntries(StickerScene.ANIMATION_OPTIONS);
    for (const id of [ids.icon, ids.frame]) {
      const rec = app.records.get(id), entry = scene.get(id);
      Object.assign(rec.settings, { animAmount: 2, animSpeed: 1, baseRotation: 37, idleSway: 0, iconBlink: false, lightStrength: 0 });
      for (const anim of added) {
        rec.settings.anim = anim;
        const result = scene.animationFrames(entry, { size: 96, fps: 5, shadow: false }), hashes = new Set();
        let edges = 0, opaque = 0;
        for (const frame of result.frames) {
          const d = frame.getContext('2d').getImageData(0, 0, 96, 96).data; let hash = 0;
          for (let i = 0; i < d.length; i += 4) { hash = ((hash * 31) ^ (d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11)) | 0; if (d[i + 3] > 250) opaque++; }
          hashes.add(hash);
          for (let x = 0; x < 96; x++) for (const p of [x, 95 * 96 + x, x * 96, x * 96 + 95]) if (d[p * 4 + 3] > 0) edges++;
        }
        const svg = app.animatedSvg(entry), doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const transforms = [...doc.querySelectorAll('animateTransform')].filter(n => n.hasAttribute('values'));
        reports.push({ kind: rec.kind, anim, edges, opaque, moving: hashes.size > 1, svgValid: !doc.querySelector('parsererror'), transforms: transforms.length,
          noFoil: !doc.querySelector('linearGradient'), looped: transforms.every(n => { const v = n.getAttribute('values').split(';'); return v[0] === v.at(-1); }) });
        if (id === ids.icon) previews.push({ label: labels[anim], frames: result.frames });
      }
    }
    // Encode a real loop in both download formats, then decode to verify frame counts.
    const frames = previews.find(p => p.label === 'Hop').frames;
    const apng = await StickerAnim.encodeAPNG(frames, 5), gif = StickerAnim.encodeGIF(frames, 5);
    const decode = async blob => {
      const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type === 'image/apng' ? 'image/png' : blob.type }); await decoder.tracks.ready;
      const count = decoder.tracks.selectedTrack.frameCount; const { image } = await decoder.decode({ frameIndex: count - 1 }); image.close(); decoder.close(); return count;
    };
    const decoded = [await decode(apng), await decode(gif)];
    // Preview sheet with three poses of each motion.
    const sheet = document.createElement('canvas'); sheet.width = 900; sheet.height = 620;
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#e8f1fa'; ctx.fillRect(0, 0, 900, 620);
    previews.forEach((p, i) => {
      const x = i % 3 * 300, y = Math.floor(i / 3) * 155;
      ctx.fillStyle = '#2b2a33'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(p.label, x + 12, y + 22);
      for (const [j, t] of [.1, .3, .6].entries()) ctx.drawImage(p.frames[Math.floor(p.frames.length * t)], x + j * 100 + 2, y + 34);
    });
    return { reports, decoded, encodedFrames: frames.length, preview: sheet.toDataURL(), apng: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(apng); }) };
  }, { ids, added: ADDED });
  for (const r of exported.reports) assert(r.edges === 0 && r.opaque > 0 && r.moving && r.svgValid && r.transforms >= 3 && r.noFoil && r.looped, JSON.stringify(r));
  assert.deepEqual(exported.decoded, [exported.encodedFrames, exported.encodedFrames]);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'animation-poses.png'), Buffer.from(exported.preview.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'animation-hop.png'), Buffer.from(exported.apng.split(',')[1], 'base64'));
  console.log('PASS 20 frame/icon export loops: no clipped edges at maximum amount, SVG transforms, zero-shine SVG, APNG and GIF decoding');
  await page.evaluate(id => { stickerApp.scene.select(stickerApp.scene.get(id)); stickerApp.scene.start(); }, ids.icon);
  await page.locator('[data-locale="zh-TW"]').click();
  assert.equal(await page.locator('#ctl-anim-icon option[value="jelly"]').textContent(), '果凍彈動');
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#ctl-anim-icon').scrollIntoViewIfNeeded();
  await page.locator('#ctl-anim-icon').click();
  await page.screenshot({ path: path.join(OUT, 'animations-menu-mobile.png') });
  await page.keyboard.press('Escape'); await page.selectOption('#ctl-anim-icon', 'figure8');
  assert.equal(await page.evaluate(() => stickerApp.selected.settings.anim), 'figure8');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('PASS Traditional Chinese, mobile dropdown and no browser errors');
} finally { await browser?.close(); server.close(); }
