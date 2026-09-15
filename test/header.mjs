/* The compact header keeps creation, contextual editing and secondary tools discoverable. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.HEADER_TEST_OUTPUT || path.join(ROOT, 'test/.out/header');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
fs.mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.stickerApp);
  await page.evaluate(() => stickerApp.ready);
  await page.locator('#siteLoader').waitFor({ state: 'hidden' });
  const decorate = page.locator('#iconMenuWrap > summary');
  const guide = page.locator('#btnGuide');
  const ready = () => page.waitForFunction(() => stickerApp.selected?.atlas && stickerApp.scene.selected?.phase === 'ready');
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const insideViewport = async selector => {
    const box = await page.locator(selector).boundingBox(), viewport = page.viewportSize();
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${selector}: ${JSON.stringify(box)}`);
  };
  for (const id of ['btnFrame', 'btnShaker', 'btnBrowseIcons', 'btnEdit']) assert(await page.locator('#' + id).isHidden(), id);
  assert(await guide.isVisible()); assert(await page.locator('#langSwitch').isVisible());
  assert.equal(await page.locator('#moreMenuWrap').count(), 0);
  assert.equal(await page.locator('.topbar #presetSelect, .topbar #btnSample, .topbar #btnEdit').count(), 0);
  assert(await page.locator('#presetSelect').isDisabled());
  await page.screenshot({ path: path.join(OUT, 'header-desktop.png') });
  await decorate.click(); assert(await page.locator('#decorateChoices').isVisible());
  await page.screenshot({ path: path.join(OUT, 'decorate-desktop.png') });
  await page.locator('#btnFrame').click(); await ready();
  assert.equal(await page.evaluate(() => stickerApp.selected.kind), 'frame');
  assert(await page.locator('#decorateChoices').isHidden()); assert(await page.locator('#btnEdit').isHidden());
  await page.evaluate(() => stickerApp.undo());
  await decorate.click(); await page.locator('#btnShaker').click(); await ready();
  assert.equal(await page.evaluate(() => stickerApp.selected.icon), 'shaker');
  await page.locator('#shakerAdd').click(); assert(await page.locator('#iconMenu').isVisible());
  assert(await page.locator('#iconSearch').evaluate(e => e === document.activeElement));
  await page.locator('#iconSearch').fill('star');
  await page.locator('#iconMenu button[data-icon="star"]').click();
  await page.waitForFunction(() => stickerApp.selected.shakerItems.length === 1);
  assert(await page.locator('#iconMenu').isVisible(), 'shaker tray stays open for another piece');
  await page.locator('#decorateBack').click(); assert(await page.locator('#decorateChoices').isVisible());
  await page.keyboard.press('Escape'); assert(await decorate.evaluate(e => e === document.activeElement));
  await decorate.click(); await page.locator('#btnBrowseIcons').click(); await page.locator('#iconSearch').fill('star');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#iconSearch').inputValue(), '');
  await page.keyboard.press('Escape'); assert(await decorate.evaluate(e => e === document.activeElement), 'Escape works from search');
  await page.evaluate(() => stickerApp.undo()); // remove the piece
  await page.evaluate(() => stickerApp.undo()); // remove the shaker
  console.log('PASS decoration choices, frame/shaker creation, direct Add pieces, back, search and Escape');

  await page.locator('#importMenuWrap summary').click();
  await page.locator('[data-import-mode="whole"]').click();
  assert(await page.locator('.import-menu').isHidden());
  assert(await page.locator('#importMenuWrap summary').evaluate(e => e === document.activeElement));
  assert.equal(await page.locator('#importModeGlyph').getAttribute('href'), '#importWholeGlyph');
  assert.match(await page.locator('#importMenuWrap summary').getAttribute('aria-label'), /Whole image/);
  for (const target of ['#btnAddImages', '#importMenuWrap summary']) {
    await page.locator(target).hover();
    const aligned = await page.locator('.image-intake').evaluate(el => {
      const main = el.querySelector('#btnAddImages').getBoundingClientRect();
      const toggle = el.querySelector('summary').getBoundingClientRect();
      const arrow = el.querySelector('.import-chevron').getBoundingClientRect();
      return Math.abs(main.right - toggle.left) < 1 && Math.abs(main.height - toggle.height) < 1 && Math.abs(arrow.y + arrow.height / 2 - toggle.y - toggle.height / 2) < 1;
    });
    assert(aligned, `split button seam and arrow stay aligned while hovering ${target}`);
  }
  await page.locator('#importMenuWrap summary').focus(); await page.keyboard.press('Enter');
  await page.locator('[data-import-mode="cutout"]').focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('#importModeGlyph').getAttribute('href'), '#importCutoutGlyph');
  assert(await page.locator('.import-menu').isHidden());
  await page.evaluate(() => { Segmenter.autoDetect = async c => ({ mask: new Float32Array(c.width * c.height).fill(1), labels: [] }); });
  await page.locator('#btnSample').click(); await ready();
  assert(await page.locator('#btnEdit').isVisible()); assert(await page.locator('#btnEdit').isEnabled());
  assert.equal(await page.locator('#objectToolbar #btnEdit').count(), 1);
  await page.locator('#btnEdit').hover();
  const toolbarPosition = await page.locator('#objectToolbar').boundingBox();
  await page.evaluate(() => stickerApp.scene.translateResize(stickerApp.scene.selected, 20, 0)); await frames();
  assert.deepEqual(await page.locator('#objectToolbar').boundingBox(), toolbarPosition, 'photo tools stay still while hovered');
  await page.locator('#btnEdit').click(); assert.equal(await page.evaluate(() => stickerApp.state.mode), 'edit');
  await page.locator('#btnDone').click();
  await page.selectOption('#presetSelect', 'Soft gloss');
  assert.equal(await page.evaluate(() => stickerApp.selected.settings.holoIntensity), .55);
  const photo = await page.evaluate(() => stickerApp.selected.id);
  await page.evaluate(id => stickerApp.lockObject(id), photo); await frames();
  assert(await page.locator('#btnEdit').isDisabled()); assert(await page.locator('#presetSelect').isDisabled());
  await page.evaluate(id => stickerApp.lockObject(id), photo);
  await page.screenshot({ path: path.join(OUT, 'photo-tools.png') });
  console.log('PASS import options, welcome sample, contextual cutout editing, presets and locked photo');

  await page.locator('#langSwitch [data-locale="zh-TW"]').click();
  assert.equal(await page.evaluate(() => stickerApp.selected.id), photo, 'language switching keeps the selected photo');
  assert.equal(await decorate.locator('span').textContent(), '加入裝飾');
  assert.equal(await page.locator('.style-presets > span').textContent(), '風格預設');
  await page.locator('#btnGuide').click(); assert(await page.locator('#walkthrough').isVisible());
  await page.keyboard.press('Escape'); assert(await guide.evaluate(e => e === document.activeElement));
  await page.locator('#langSwitch [data-locale="en"]').click();
  assert.equal(await page.evaluate(() => stickerApp.selected.id), photo);
  await decorate.click(); await page.locator('#exportMenuWrap summary').click();
  assert(await page.locator('#decorateChoices').isHidden());
  await page.locator('.brand').click(); assert(await page.locator('#exportMenu').isHidden());
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddImages').focus(); await page.keyboard.press('Enter'); await chooser;
  console.log('PASS language, Guide, one menu at a time, outside click and keyboard upload');

  for (const width of [1024, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page fits ${width}`);
    await decorate.click(); await frames(); await insideViewport('#decorateMenu');
    await page.screenshot({ path: path.join(OUT, `decorate-${width}.png`) });
    await page.locator('#btnBrowseIcons').click(); await page.locator('#iconSearch').fill(''); await frames(); await insideViewport('#decorateMenu');
    await page.locator('#iconMenu button[data-tab="pixel"]').click();
    const scrolling = await page.locator('.icon-body').evaluate(e => { e.scrollTop = 160; return e.scrollTop; });
    assert(scrolling > 0, `tray scrolls at ${width}`);
    await page.keyboard.press('Escape');
    await page.locator('#importMenuWrap summary').click(); await insideViewport('.import-menu');
    await page.screenshot({ path: path.join(OUT, `import-${width}.png`) });
    await page.keyboard.press('Escape');
    await insideViewport('.header-help');
    await guide.focus(); await page.keyboard.press('Enter'); assert(await page.locator('#walkthrough').isVisible());
    await page.keyboard.press('Escape'); assert(await guide.evaluate(e => e === document.activeElement));
    for (const locale of ['zh-TW', 'en']) {
      await page.locator(`#langSwitch [data-locale="${locale}"]`).click(); await insideViewport('.header-help');
      assert.equal(await page.evaluate(() => stickerApp.selected.id), photo);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS desktop/tablet/mobile bounds, scrollable icon tray and zero runtime errors');
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
