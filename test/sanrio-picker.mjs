/* Character/type filtering must never display a mismatched or empty collection. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SANRIO_TEST_OUTPUT || path.join(ROOT, 'test/.out');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'pixels/manifest.json')));
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
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', r => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sticker-shader-editor:locale', 'en'); } catch (_) {} });
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  await page.waitForFunction(() => window.stickerApp && document.querySelector('[data-tab="piknik"]') && document.querySelector('#pixelCategory'));
  await page.evaluate(() => stickerApp.scene.stop());
  await page.locator('#iconMenuWrap summary').click();
  await page.locator('#btnBrowseIcons').click();
  await page.locator('button[data-tab="pixel"]').click();
  assert.equal(await page.locator('button[data-tab="pixel"]').textContent(), 'Sanrio');
  const check = async (collection, category = '') => {
    const expected = manifest.groups.filter(g => (!collection || g.collection === collection) && (!category || g.category === category));
    const actual = await page.locator('section[data-tab="pixel"] .pixel-group:not([hidden])').evaluateAll(els => els.map(el => `${el.dataset.collection}/${el.dataset.category}`));
    assert.deepEqual(actual, expected.map(g => `${g.collection}/${g.category}`));
    assert.equal(await page.locator('section[data-tab="pixel"] .pixel-group:not([hidden]) button[data-pixel]:not([hidden])').count(), expected.reduce((n,g) => n+g.items.length, 0));
    assert.equal(await page.locator('#pixelCollection').inputValue(), collection);
    assert.equal(await page.locator('#pixelCategory').inputValue(), category);
  };
  for (const collection of new Set(manifest.groups.map(g => g.collection))) {
    await page.selectOption('#pixelCategory', '');
    await page.selectOption('#pixelCollection', collection);
    const types = [...new Set(manifest.groups.filter(g => g.collection === collection && g.items.length).map(g => g.category))];
    assert.deepEqual(await page.locator('#pixelCategory option').evaluateAll(els => els.map(el => el.value)), ['', ...types]);
    for (const type of ['', ...types]) {
      await page.selectOption('#pixelCategory', type); await check(collection, type);
      const collections = [...new Set(manifest.groups.filter(g => g.items.length && (!type || g.category === type)).map(g => g.collection))];
      assert.deepEqual(await page.locator('#pixelCollection option').evaluateAll(els => els.map(el => el.value)), ['', ...collections]);
    }
  }
  console.log('PASS all character/type combinations show only matching assets, available types and characters');
  await page.selectOption('#pixelCategory', '');
  await page.selectOption('#pixelCollection', 'Kuromi'); await page.selectOption('#pixelCategory', 'halloween');
  assert.deepEqual(await page.locator('#pixelCollection option').evaluateAll(els => els.map(el => el.value)), ['', 'Kuromi']);
  await page.selectOption('#pixelCollection', ''); await check('', 'halloween');
  await page.selectOption('#pixelCategory', '');
  await page.selectOption('#pixelCollection', 'Hello Kitty'); await check('Hello Kitty');
  assert.equal(await page.locator('#pixelCategory option[value="halloween"]').count(), 0);
  await page.selectOption('#pixelCategory', 'tiny');
  await page.selectOption('#pixelCollection', 'Cinnamoroll'); await check('Cinnamoroll', 'tiny');
  // Some customizable selects emit input before committing change on dismissal.
  await page.locator('#pixelCollection').evaluate(el => { el.value = 'Hello Kitty'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await check('Hello Kitty', 'tiny');
  await page.locator('#iconSearch').fill('panda'); await page.locator('#iconSearch').fill('');
  await check('Hello Kitty', 'tiny');
  await page.evaluate(() => I18N.setLocale('zh-TW')); await check('Hello Kitty', 'tiny');
  assert.equal(await page.locator('button[data-tab="pixel"]').textContent(), '三麗鷗');
  await page.evaluate(() => I18N.setLocale('en')); await check('Hello Kitty', 'tiny');
  console.log('PASS Halloween excludes empty characters, All types restores them, valid type preserved, immediate selection, search and language rebuild');
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'sanrio-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(OUT, 'sanrio-mobile.png') });
  assert(await page.locator('.icon-tabs').evaluate(el => el.scrollWidth <= el.clientWidth), 'mobile tabs fit');
  const bounds = await page.locator('#iconMenu').boundingBox(); assert(bounds.x >= 0 && bounds.x+bounds.width <= 391);
  const purinGroups = manifest.groups.filter(g => g.collection === 'Pompompurin');
  assert(purinGroups.length > 0, 'Pompompurin collection exists');
  const purinItems = purinGroups.flatMap(g => g.items);
  await page.selectOption('#pixelCategory', '');
  await page.selectOption('#pixelCollection', 'Pompompurin'); await check('Pompompurin');
  await page.evaluate(() => I18N.setLocale('zh-TW'));
  assert.match(await page.locator('#pixelCollection option:checked').textContent(), /布丁狗/);
  for (const query of ['布丁狗', 'Pompompurin']) {
    await page.locator('#iconSearch').fill(query);
    assert.equal(await page.locator('button[data-pixel]:visible').count(), purinItems.length);
  }
  await page.locator('#iconSearch').fill('');
  await page.evaluate(() => I18N.setLocale('en'));
  await page.screenshot({ path: path.join(OUT, 'pompompurin-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(OUT, 'pompompurin-desktop.png') });
  await page.locator('button[data-pixel]:visible').first().click({ modifiers: ['Shift'] });
  await page.waitForFunction(() => stickerApp.selected?.icon === 'pixel' && stickerApp.selected.settings.iconText.includes('/pompompurin/'));
  const rendered = await page.evaluate(async groups => {
    const a = stickerApp; a.scene.stop();
    for (const item of groups.flatMap(g => g.items)) {
      const img = new Image(); img.src = item.src; await img.decode();
      if (img.naturalWidth !== item.w || img.naturalHeight !== item.h) throw Error('Dimensions: ' + item.src);
    }
    const canvas = document.createElement('canvas'); canvas.width = 1050; canvas.height = 320;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff7d9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [i, group] of groups.entries()) {
      const item = group.items.find(it => it.anim) || group.items[0];
      const rec = await a.addPixel(item.src, { quiet: true, settings: { workingRes: '256', anim: 'none', baseRotation: 0 } });
      if (!rec?.atlas || (item.anim && rec.frames.length < 2)) throw Error('Artwork or animation missing: ' + item.src);
      const shot = a.scene.snapshot(a.scene.get(rec.id), { shadow: false });
      const rgba = shot.getContext('2d').getImageData(0, 0, shot.width, shot.height).data;
      if (!rgba.some((v, j) => j % 4 === 3 && v > 200)) throw Error('Empty render: ' + item.src);
      const k = Math.min(140 / shot.width, 230 / shot.height);
      ctx.drawImage(shot, i * 150 + (150 - shot.width * k) / 2, 20 + (230 - shot.height * k) / 2, shot.width * k, shot.height * k);
      ctx.font = '13px Arial'; ctx.fillStyle = '#604d23'; ctx.fillText(group.title, i * 150 + 5, 280);
      a.scene.remove(rec.id); a.records.delete(rec.id);
    }
    return canvas.toDataURL();
  }, purinGroups);
  fs.writeFileSync(path.join(OUT, 'pompompurin-rendered.png'), Buffer.from(rendered.split(',')[1], 'base64'));
  console.log(`PASS ${purinItems.length} Pompompurin images decode, bilingual search, click to add, seven category renders and original animations`);
  const pochaccoItems = manifest.groups.filter(g => g.collection === 'Pochacco').flatMap(g => g.items);
  assert.equal(pochaccoItems.length, 7);
  await page.selectOption('#pixelCategory', '');
  await page.selectOption('#pixelCollection', 'Pochacco'); await check('Pochacco');
  await page.evaluate(() => I18N.setLocale('zh-TW'));
  assert.equal(await page.locator('#pixelCollection option:checked').textContent(), '帕恰狗');
  for (const query of ['帕恰狗', 'Pochacco']) {
    await page.locator('#iconSearch').fill(query);
    assert.equal(await page.locator('button[data-pixel]:visible').count(), pochaccoItems.length);
  }
  await page.locator('#iconSearch').fill('');
  await page.evaluate(() => I18N.setLocale('en'));
  await page.screenshot({ path: path.join(OUT, 'pochacco-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(OUT, 'pochacco-mobile.png') });
  await page.locator('button[data-pixel]:visible').first().click({ modifiers: ['Shift'] });
  await page.waitForFunction(() => stickerApp.selected?.settings.iconText.includes('/pochacco/'));
  const pochaccoRendered = await page.evaluate(async items => {
    const a = stickerApp; a.scene.stop();
    const canvas = document.createElement('canvas'); canvas.width = 1050; canvas.height = 220;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff0f6'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [i, item] of items.entries()) {
      const img = new Image(); img.src = item.src; await img.decode();
      if (img.naturalWidth !== item.w || img.naturalHeight !== item.h) throw Error('Dimensions: ' + item.src);
      const rec = await a.addPixel(item.src, { quiet: true, settings: { workingRes: '256', anim: 'none', baseRotation: 0 } });
      if (!rec?.atlas || rec.frames.length < 2) throw Error('Animation missing: ' + item.src);
      const shot = a.scene.snapshot(a.scene.get(rec.id), { shadow: false });
      const rgba = shot.getContext('2d').getImageData(0, 0, shot.width, shot.height).data;
      if (!rgba.some((v, j) => j % 4 === 3 && v > 200)) throw Error('Empty render: ' + item.src);
      const k = Math.min(140 / shot.width, 180 / shot.height);
      ctx.drawImage(shot, i * 150 + (150 - shot.width * k) / 2, (220 - shot.height * k) / 2, shot.width * k, shot.height * k);
      a.scene.remove(rec.id); a.records.delete(rec.id);
      const shaker = a.addIcon('shaker', { settings: { workingRes: '256', baseRotation: 0 } });
      const added = await a.addPixel(item.src);
      if (added !== shaker || shaker.shakerItems.length !== 1 || shaker.shakerItems[0].frames.length < 2) throw Error('Shaker animation missing: ' + item.src);
      a.scene.remove(shaker.id); a.records.delete(shaker.id);
    }
    return canvas.toDataURL();
  }, pochaccoItems);
  fs.writeFileSync(path.join(OUT, 'pochacco-rendered.png'), Buffer.from(pochaccoRendered.split(',')[1], 'base64'));
  console.log('PASS seven Pochacco images decode, bilingual search, picker click, sticker renders and animated shaker pieces');
  // A future character with a single type should not show a redundant selector.
  await page.route('**/pixels/manifest.json', route => route.fulfill({ json: { ...manifest, groups: [...manifest.groups.filter(g => g.collection !== 'Hello Kitty' || g.category === 'tiny'), { id: 'empty', collection: 'Empty character', category: 'tiny', title: 'Tiny', items: [] }] } }));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#pixelCollection') && document.querySelector('button[data-tab="piknik"]'));
  await page.evaluate(() => stickerApp.scene.stop());
  if (!await page.locator('#iconMenuWrap').evaluate(el => el.open)) {
    await page.locator('#iconMenuWrap summary').click();
    await page.locator('#btnBrowseIcons').click();
  }
  await page.locator('button[data-tab="pixel"]').click();
  assert.equal(await page.locator('#pixelCollection option[value="Empty character"]').count(), 0);
  await page.selectOption('#pixelCollection', 'Hello Kitty');
  assert(await page.locator('#pixelCategory').evaluate(el => el.closest('label').hidden));
  assert.equal(await page.locator('section[data-tab="pixel"] .pixel-group:not([hidden])').count(), 1);
  await page.selectOption('#pixelCollection', '');
  assert(!await page.locator('#pixelCategory').evaluate(el => el.closest('label').hidden));
  assert.deepEqual(errors, []);
  console.log('PASS mobile layout, single-type selector hidden, all-character types restored, no browser errors');
} finally { if (browser) await browser.close(); server.close(); }
