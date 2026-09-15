/* PIKNIK catalog, picker, transparent rendering, attachments and shared scenes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.PIKNIK_TEST_OUTPUT || path.join(ROOT, 'test/.out');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/piknik/manifest.json')));
const items = manifest.groups.flatMap(g => g.items);
assert.equal(new Set(items.map(it => it.src)).size, items.length);
assert.equal(new Set(manifest.groups.map(g => g.id)).size, manifest.groups.length);
for (const it of items) {
  for (const src of [it.src, it.thumb]) assert(fs.existsSync(path.join(ROOT, src)), src);
  assert(it.w > 48 && it.h > 48, it.src + ': enlarged dimensions');
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', r => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sticker-shader-editor:locale', 'en'); } catch (_) { /* about:blank has no storage */ } });
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  await page.waitForFunction(() => window.stickerApp && document.querySelector('button[data-tab="piknik"]'));
  await page.locator('#iconMenuWrap summary').click();
  await page.locator('#btnBrowseIcons').click();
  await page.locator('button[data-tab="piknik"]').click();
  assert.equal(await page.locator('button[data-piknik]').count(), items.length);
  await page.selectOption('#piknikCollection', 'pandas');
  assert.equal(await page.locator('button[data-piknik]:visible').count(), 12);
  await page.locator('#iconSearch').fill('水果');
  assert.equal(await page.locator('button[data-piknik]:visible').count(), 12);
  await page.locator('#iconSearch').fill('this-does-not-exist');
  assert.equal(await page.locator('button[data-piknik]:visible').count(), 0);
  await page.locator('#iconSearch').fill('');
  assert.equal(await page.locator('button[data-piknik]:visible').count(), 12);
  await page.locator('button[data-piknik]:visible').first().click({ modifiers: ['Shift'] });
  await page.waitForFunction(() => stickerApp.selected?.icon === 'piknik');
  assert(await page.locator('#iconMenuWrap').evaluate(el => el.open));
  assert(!await page.locator('#ctl-iconPalette').isVisible(), 'hide recoloring controls for original artwork');
  const original = await page.evaluate(() => {
    const a = stickerApp, id = a.selected.id;
    a.undo(); const removed = !a.records.has(id); a.redo();
    const restored = a.records.get(id); a.scene.select(a.scene.get(id)); const copy = a.duplicateSelected();
    return { removed, restored: !!restored?.image, sameImage: copy.image === restored.image };
  });
  assert(original.removed && original.restored && original.sameImage);
  console.log('PASS collection picker, bilingual search, shift-click, undo/redo, duplicate');

  await page.evaluate(() => stickerApp.scene.stop());
  const decode = await page.evaluate(async items => {
    let count = 0;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true });
    for (const it of items) {
      const bmp = await createImageBitmap(await (await fetch(it.src)).blob());
      if (bmp.width !== it.w || bmp.height !== it.h) throw new Error(it.src + ': size mismatch');
      c.width = bmp.width; c.height = bmp.height; ctx.drawImage(bmp, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      if (data[3] !== 0 || !data.some((v, i) => i % 4 === 3 && v > 200)) throw new Error(it.src + ': alpha/visibility');
      bmp.close(); count++;
    }
    return count;
  }, items);
  assert.equal(decode, items.length);
  console.log(`PASS all ${decode} enlarged PNGs decode with transparent backgrounds`);

  const samples = await page.evaluate(async groups => {
    const a = stickerApp; a.scene.stop();
    const c = document.createElement('canvas'); c.width = 1200; c.height = Math.ceil(groups.length/6)*160;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#eee5f3'; ctx.fillRect(0,0,c.width,c.height);
    for (const [index, group] of groups.entries()) {
      const rec = await a.addPiknik(group.items[0].src, { quiet: true, settings: { workingRes: '256', anim: 'none', baseRotation: 0 } });
      if (!rec?.atlas) throw new Error(group.id + ': composition failed');
      const snapshot = a.scene.snapshot(a.scene.get(rec.id), { shadow: false });
      const rgba = snapshot.getContext('2d').getImageData(0,0,snapshot.width,snapshot.height).data;
      if (!rgba.some((v,i) => i%4 === 3 && v > 200)) throw new Error(group.id + ': empty render');
      const k = Math.min(135/snapshot.width,125/snapshot.height), x=index%6*200, y=Math.floor(index/6)*160;
      ctx.drawImage(snapshot,x+(200-snapshot.width*k)/2,y+5,snapshot.width*k,snapshot.height*k);
      ctx.font='12px Arial';ctx.fillStyle='#332d3d';ctx.fillText(group.title,x+8,y+150);
      a.scene.remove(rec.id); a.records.delete(rec.id);
    }
    return c.toDataURL();
  }, manifest.groups);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'piknik-rendered.png'), Buffer.from(samples.split(',')[1], 'base64'));
  console.log(`PASS transparent shader rendering for ${manifest.groups.length} collections`);

  const share = await page.evaluate(async src => {
    const a = stickerApp;
    const frame = a.addFrame({ settings: { workingRes: '256' } });
    const icon = await a.addPiknik(src, { settings: { workingRes: '256', anim: 'float' } });
    const attached = a.scene.get(icon.id).parent?.id === frame.id;
    const { url } = await a.shareLink();
    const shot = a.scene.snapshot(a.scene.get(frame.id));
    const animation = a.scene.animationFrames(a.scene.get(frame.id), { size: 128, fps: 3, tilt: false });
    const png = await new Promise(r => shot.toBlob(r));
    const apng = await StickerAnim.encodeAPNG(animation.frames, animation.fps);
    const gif = StickerAnim.encodeGIF(animation.frames, animation.fps);
    return { attached, url, name: icon.name, png: png.size, apng: apng.size, gif: gif.size };
  }, manifest.groups.find(g => g.id === 'fruit').items[0].src);
  assert(share.attached && share.png > 100 && share.apng > 100 && share.gif > 100);
  await page.goto('about:blank');
  await page.goto(share.url);
  await page.waitForFunction(() => window.stickerApp && [...stickerApp.records.values()].some(r => r.icon === 'piknik' && stickerApp.scene.get(r.id)?.parent));
  assert(await page.evaluate(name => [...stickerApp.records.values()].some(r => r.icon === 'piknik' && r.name === name && r.image && r.atlas), share.name));
  console.log('PASS frame attachment, PNG/APNG/GIF export and share-link reload');

  await page.evaluate(() => { stickerApp.scene.stop(); I18N.setLocale('zh-TW'); });
  if (!await page.locator('#iconMenuWrap').evaluate(el => el.open)) { await page.locator('#iconMenuWrap summary').click(); await page.locator('#btnBrowseIcons').click(); }
  await page.locator('button[data-tab="piknik"]').click();
  await page.selectOption('#piknikCollection', 'fruit');
  assert.match(await page.locator('#piknikCollection').textContent(), /水果/);
  await page.screenshot({ path: path.join(OUT, 'piknik-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(OUT, 'piknik-mobile.png') });
  const bounds = await page.locator('#iconMenu').boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'mobile tray fits viewport');
  assert(await page.locator('.icon-tabs').evaluate(el => el.scrollWidth <= el.clientWidth), 'mobile tab labels fit without clipping');
  assert.deepEqual(errors, []);
  console.log('PASS Traditional Chinese, desktop/mobile layout, no browser errors');
} finally { if (browser) await browser.close(); server.close(); }
