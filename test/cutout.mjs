/* Cutout editor interaction regression. No AI models needed.
 * node test/cutout.mjs (PLAYWRIGHT_MODULE / PLAYWRIGHT_EXECUTABLE_PATH are optional)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]), file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const errors = [];
  const setup = async options => {
    const page = await browser.newPage(options);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.stickerApp);
    await page.evaluate(async () => {
      Segmenter.autoDetect = async canvas => {
        const w = canvas.width, h = canvas.height;
        const mask = Float32Array.from({ length: w * h }, (_, i) => Math.hypot((i % w) - w / 2, Math.floor(i / w) - h / 2) < h * .36 ? 1 : 0);
        return { mask, labels: ['test subject'] };
      };
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#cee8ef'; ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = '#ee86aa'; ctx.beginPath(); ctx.arc(160, 120, 86, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a2a35'; for (const x of [137, 183]) { ctx.beginPath(); ctx.arc(x, 110, 5, 0, Math.PI * 2); ctx.fill(); }
      const blob = await new Promise(r => canvas.toBlob(r)); await stickerApp.addSticker(blob, 'Portrait test');
    });
    await page.waitForFunction(() => stickerApp.selected?.mask);
    await page.click('#btnEdit'); await page.waitForTimeout(150);
    return page;
  };
  const signature = page => page.evaluate(() => {
    const r = stickerApp.selected; let sum = 0, weighted = 0, soft = 0;
    r.mask.forEach((v, i) => { sum += v; weighted += v * (i % 997); if (v > 0 && v < 1) soft++; });
    return { sum, weighted, soft };
  });
  const centre = page => page.evaluate(() => {
    const c = document.querySelector('#editCanvas').getBoundingClientRect(), t = document.querySelector('.edit-toolbar').getBoundingClientRect(), f = document.querySelector('.edit-footer').getBoundingClientRect();
    return { x: c.x + c.width / 2, y: (t.bottom + f.top) / 2 };
  });
  const shot = async (page, name) => { fs.mkdirSync(path.join(ROOT, 'test/.out'), { recursive: true }); await page.screenshot({ path: path.join(ROOT, 'test/.out', name + '.png') }); };
  const page = await setup({ viewport: { width: 1400, height: 1000 } });
  const initial = await signature(page), p = await centre(page);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(150);
  const erased = await signature(page); assert(erased.sum < initial.sum && erased.soft > 0, 'erase uses a feathered brush');
  await page.click('#btnUndo'); assert.deepEqual(await signature(page), initial);
  await page.click('#btnRedoMask'); assert.deepEqual(await signature(page), erased);
  await page.locator('#editCanvas').focus(); await page.keyboard.press('Control+z'); assert.deepEqual(await signature(page), initial);
  await page.keyboard.press('Control+Shift+z'); assert.deepEqual(await signature(page), erased);
  await page.keyboard.press('Control+z');
  await page.locator('#brushHardness').fill('100');
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(100);
  assert.equal((await signature(page)).soft, 0, '100% hardness paints a crisp mask');
  assert(await page.locator('#btnRedoMask').isDisabled(), 'new stroke clears redo');
  await page.keyboard.down('Alt'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Alt');
  assert.deepEqual(await signature(page), initial, 'Alt temporarily restores with the eraser selected');
  console.log('PASS erase/restore, adjustable hardness, Alt, undo/redo and redo invalidation');

  await page.click('#editZoomIn'); assert.equal(await page.locator('#editZoomValue').textContent(), '140%');
  await page.click('#editZoomIn');
  const zoomed = await signature(page); assert.deepEqual(zoomed, initial, 'zoom never paints');
  const target = await centre(page);
  await page.mouse.move(target.x, target.y); await page.mouse.wheel(0, -100); await page.waitForTimeout(100);
  assert(parseInt(await page.locator('#editZoomValue').textContent()) > 196);
  await page.locator('#editCanvas').focus(); await page.keyboard.down('Space');
  await page.mouse.move(target.x, target.y); await page.mouse.down(); await page.mouse.move(target.x + 60, target.y + 30, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Space');
  assert.deepEqual(await signature(page), initial, 'Space drag pans without changing the mask');
  await page.mouse.click(target.x + 60, target.y + 30); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => { const r = stickerApp.selected; return r.mask[Math.floor(r.work.height / 2) * r.work.width + Math.floor(r.work.width / 2)]; }), 0, 'painting after zoom/pan hits the intended source pixel');
  await page.click('#btnUndo'); await page.click('#editFit'); assert.equal(await page.locator('#editZoomValue').textContent(), '100%');
  console.log('PASS cursor-centred zoom, Space pan, Fit, and brush coordinate accuracy');

  const images = [];
  for (const mode of ['overlay', 'cutout', 'white', 'black', 'mask', 'original']) {
    await page.locator(`[data-preview="${mode}"]`).click();
    images.push(await page.locator('#editCanvas').evaluate(c => c.toDataURL()));
  }
  assert.equal(new Set(images).size, 6, 'all six previews render distinct views');
  await page.mouse.click(target.x, target.y); assert.deepEqual(await signature(page), initial, 'original preview does not edit');
  await page.locator('[data-preview="overlay"]').click();
  await page.click('#btnClear'); assert.equal((await signature(page)).sum, 0);
  await page.click('#btnAuto'); await page.waitForFunction(() => document.querySelector('#editBusy').hidden);
  assert.deepEqual(await signature(page), initial);
  await page.click('#btnUndo'); assert.equal((await signature(page)).sum, 0, 'auto detection is undoable');
  await page.click('#btnRedoMask'); assert.deepEqual(await signature(page), initial);
  await page.click('#btnInvert'); assert((await signature(page)).sum > initial.sum);
  await page.click('#btnReset'); assert.deepEqual(await signature(page), initial);
  await page.click('#btnUndo'); assert((await signature(page)).sum > initial.sum);
  await page.click('#btnRedoMask'); assert.deepEqual(await signature(page), initial);
  await page.evaluate(() => {
    const detect = Segmenter.autoDetect;
    Segmenter.autoDetect = async canvas => {
      await new Promise(r => setTimeout(r, 150));
      return detect(canvas);
    };
  });
  assert.equal(await page.locator('[data-tool^="tap"]').count(), 0, 'tap plus/minus tools are removed');
  await page.click('#btnAuto');
  await page.waitForFunction(() => !document.querySelector('#editBusy').hidden);
  assert(await page.locator('#btnUndo').isDisabled(), 'pending model work blocks conflicting undo');
  await page.waitForFunction(() => document.querySelector('#editBusy').hidden);
  assert.deepEqual(await signature(page), initial);
  await page.locator('[data-tool="key"]').click();
  const keyPoint = await centre(page); await page.mouse.click(keyPoint.x, keyPoint.y);
  assert((await signature(page)).sum < initial.sum, 'colour key still removes the connected colour');
  await page.click('#btnUndo'); assert.deepEqual(await signature(page), initial);
  await page.locator('[data-tool="brushRemove"]').click();
  const historyBeforeCancel = await page.evaluate(() => stickerApp.selected.history.length);
  await page.evaluate(() => {
    const c = document.querySelector('#editCanvas'), r = c.getBoundingClientRect(), t = document.querySelector('.edit-toolbar').getBoundingClientRect(), f = document.querySelector('.edit-footer').getBoundingClientRect();
    const capture = c.setPointerCapture, release = c.releasePointerCapture, has = c.hasPointerCapture;
    c.setPointerCapture = () => {}; c.releasePointerCapture = () => {}; c.hasPointerCapture = () => false;
    try {
      const args = { pointerId: 19, pointerType: 'pen', clientX: r.x + r.width / 2, clientY: (t.bottom + f.top) / 2, bubbles: true, button: 0 };
      c.dispatchEvent(new PointerEvent('pointerdown', args)); c.dispatchEvent(new PointerEvent('pointercancel', args));
    } finally { c.setPointerCapture = capture; c.releasePointerCapture = release; c.hasPointerCapture = has; }
  });
  assert.deepEqual(await signature(page), initial, 'cancelled stroke leaves no mark');
  assert.equal(await page.evaluate(() => stickerApp.selected.history.length), historyBeforeCancel, 'cancelled stroke leaves no history entry');
  await page.locator('#editCanvas').focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('+');
  assert.equal(await page.locator('#editZoomValue').textContent(), '800%');
  await page.keyboard.press('0');
  console.log('PASS no tap tools, auto detection busy state, colour key, stroke cancellation and zoom limits');

  // Strength applies once per stroke, even when the path crosses itself.
  await page.locator('[data-brush-preset="soft"]').click();
  assert.equal(await page.locator('#brushStrength').inputValue(), '40');
  await page.locator('[data-brush-preset="detail"]').click();
  assert.equal(await page.locator('#brushSizeValue').textContent(), '8 px');
  await page.locator('#brushStrength').fill('25');
  const brushPoint = await centre(page);
  await page.mouse.move(brushPoint.x, brushPoint.y); await page.mouse.down();
  await page.mouse.move(brushPoint.x + 20, brushPoint.y, { steps: 10 });
  await page.mouse.move(brushPoint.x, brushPoint.y, { steps: 10 }); await page.mouse.up();
  const maskPixel = (x, y) => page.evaluate(([x, y]) => stickerApp.selected.mask[y * stickerApp.selected.work.width + x], [x, y]);
  assert.equal(await maskPixel(160, 120), .75);
  await page.mouse.click(brushPoint.x, brushPoint.y); assert.equal(await maskPixel(160, 120), .5625);
  const alphaPixel = (x, y) => page.evaluate(([x, y]) => {
    const r = stickerApp.selected, border = r.settings.borderWidth; r.settings.borderWidth = 0;
    stickerApp.rebuildCutout(r); const c = stickerApp.scene.snapshot(stickerApp.scene.selected, { shadow: false });
    const alpha = c.getContext('2d').getImageData(x - r.atlas.x0, y - r.atlas.y0, 1, 1).data[3];
    r.settings.borderWidth = border; return alpha;
  }, [x, y]);
  assert(Math.abs(await alphaPixel(160, 120) - 143) <= 1, 'manual softness survives the real WebGL export');
  const downloadReady = page.waitForEvent('download');
  await page.locator('[data-export="cutout"]').evaluate(b => b.click());
  const download = await downloadReady, png = fs.readFileSync(await download.path()).toString('base64');
  const exported = await page.evaluate(async png => {
    const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob());
    const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; const ctx = c.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    const r = stickerApp.selected; return [...ctx.getImageData(160 - r.atlas.x0, 120 - r.atlas.y0, 1, 1).data];
  }, png);
  [238, 134, 170, 143].forEach((v, i) => assert(Math.abs(exported[i] - v) <= 2, 'plain PNG preserves source colour and soft alpha: ' + exported));
  await page.click('#btnUndo'); await page.click('#btnUndo'); assert.deepEqual(await signature(page), initial);
  await page.locator('#brushStrength').fill('100');
  await page.mouse.click(brushPoint.x, brushPoint.y);
  assert.equal(await alphaPixel(160, 120), 0, 'automatic hole filling cannot undo an erased hole');
  await page.click('#btnUndo');

  // Work coordinates at fitted zoom, independent of the tool options' height.
  const pointAt = (x, y) => page.evaluate(([x, y]) => {
    const r = stickerApp.selected, c = document.querySelector('#editCanvas').getBoundingClientRect();
    const t = document.querySelector('.edit-toolbar').getBoundingClientRect(), f = document.querySelector('.edit-footer').getBoundingClientRect();
    const top = t.bottom + 14, height = f.top - 14 - top, width = c.width - 36;
    const scale = Math.min(width / r.work.width, height / r.work.height);
    return { x: c.x + c.width / 2 + (x - r.work.width / 2) * scale, y: top + height / 2 + (y - r.work.height / 2) * scale };
  }, [x, y]);
  await page.locator('[data-tool="brushAdd"]').click();
  const detailPoint = await pointAt(35, 120); await page.mouse.click(detailPoint.x, detailPoint.y);
  assert.equal(await alphaPixel(35, 120), 255, 'a small restored island survives fragment cleanup');
  const beforeResolution = await signature(page);
  await page.selectOption('#ctl-workingRes', '1536');
  assert.deepEqual(await signature(page), beforeResolution, 'resolution changes preserve manual work instead of rerunning AI');
  await page.click('#btnUndo'); assert.deepEqual(await signature(page), initial);
  await page.locator('button[data-tool="brushRemove"]').click();
  const historyBeforeEmptyStroke = await page.evaluate(() => stickerApp.selected.history.length);
  const emptyPoint = await pointAt(35, 120); await page.mouse.click(emptyPoint.x, emptyPoint.y);
  assert.deepEqual(await signature(page), initial);
  assert.equal(await page.evaluate(() => stickerApp.selected.history.length), historyBeforeEmptyStroke, 'erasing an already empty area does not consume undo');
  console.log('PASS brush presets, per-stroke strength, real render alpha, erased holes, tiny restored details and resolution changes');

  const loop = async () => {
    await page.locator('button[data-tool="lasso"]').click();
    for (const [i, xy] of [[140, 95], [180, 95], [180, 145], [140, 145], [140, 95]].entries()) {
      const p = await pointAt(...xy); await page.mouse.move(p.x, p.y, { steps: i ? 6 : 1 }); if (!i) await page.mouse.down();
    }
    await page.mouse.up();
  };
  await loop(); assert.deepEqual(await signature(page), initial, 'drawing the lasso only previews a selection');
  assert(await page.locator('[data-selection="erase"]').isEnabled());
  await shot(page, 'cutout-lasso');
  await page.click('#editZoomIn');
  await page.locator('[data-selection="erase"]').click();
  assert.equal(await maskPixel(160, 120), 0); assert.equal(await maskPixel(110, 120), 1);
  await page.click('#btnUndo'); assert.deepEqual(await signature(page), initial);
  await page.click('#editFit'); await loop(); await page.locator('[data-selection="keep"]').click();
  assert.equal(await maskPixel(160, 120), 1); assert.equal(await maskPixel(110, 120), 0);
  await page.click('#btnUndo'); assert.deepEqual(await signature(page), initial);
  await page.click('#btnClear'); await loop(); await page.locator('[data-selection="restore"]').click();
  assert.equal(await maskPixel(160, 120), 1); assert.equal(await maskPixel(110, 120), 0);
  await page.click('#btnUndo'); assert.equal((await signature(page)).sum, 0);
  await page.click('#btnUndo'); assert.deepEqual(await signature(page), initial);
  await loop(); await page.locator('#lassoFeather').fill('3'); await page.locator('[data-selection="erase"]').click();
  assert((await signature(page)).soft > 0, 'lasso feather makes soft edges');
  await page.click('#btnUndo'); assert.deepEqual(await signature(page), initial);
  await loop(); await page.keyboard.press('Escape');
  assert(await page.locator('#editor').isVisible()); assert(await page.locator('[data-selection="erase"]').isDisabled());
  assert.deepEqual(await signature(page), initial, 'Escape cancels selection without changing the mask or leaving the editor');
  const cancelPoint = await pointAt(160, 120);
  await page.mouse.move(cancelPoint.x, cancelPoint.y); await page.mouse.down();
  await page.mouse.move(cancelPoint.x + 30, cancelPoint.y + 20, { steps: 5 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert(await page.locator('[data-selection="erase"]').isDisabled()); assert.deepEqual(await signature(page), initial);
  await page.locator('[data-tool="brushRemove"]').click();
  console.log('PASS lasso preview, erase/restore/keep, undo, feather, selection coordinates after zoom and cancel');
  await shot(page, 'cutout-desktop');
  await page.click('#btnDone'); await page.click('#btnEdit');
  assert(await page.locator('#btnUndo').isEnabled(), 'history persists across editor sessions');
  console.log('PASS preview modes, original comparison, undoable Auto detect, Clear, Invert and Reset');

  const mobile = await setup({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.locator('#editor').scrollIntoViewIfNeeded();
  const mobileBefore = await signature(mobile);
  const pinch = () => mobile.evaluate(() => {
    const c = document.querySelector('#editCanvas'), r = c.getBoundingClientRect(), t = document.querySelector('.edit-toolbar').getBoundingClientRect(), f = document.querySelector('.edit-footer').getBoundingClientRect();
    const x = r.x + r.width / 2, y = (t.bottom + f.top) / 2;
    const send = (type, id, dx) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x + dx, clientY: y, bubbles: true, button: 0 }));
    // The capture API requires actual active pointers; synthetic dispatch is used only for gesture math.
    c.setPointerCapture = () => {}; c.releasePointerCapture = () => {}; c.hasPointerCapture = () => false;
    send('pointerdown', 11, -20); send('pointerdown', 12, 20);
    send('pointermove', 11, -45); send('pointermove', 12, 45);
    send('pointerup', 11, -45); send('pointerup', 12, 45);
  });
  await pinch();
  assert.deepEqual(await signature(mobile), mobileBefore, 'pinch rolls back the first finger brush mark');
  assert(parseInt(await mobile.locator('#editZoomValue').textContent()) > 100);
  await mobile.locator('#editFit').tap();
  await mobile.locator('button[data-tool="lasso"]').tap(); await pinch();
  assert.deepEqual(await signature(mobile), mobileBefore, 'pinch cancels an unfinished lasso without painting');
  assert(await mobile.locator('[data-selection="erase"]').isDisabled());
  await mobile.locator('#editFit').tap(); await shot(mobile, 'cutout-lasso-mobile');
  await mobile.locator('button[data-tool="brushRemove"]').tap();
  const layout = await mobile.evaluate(() => {
    const t = document.querySelector('.edit-toolbar').getBoundingClientRect(), f = document.querySelector('.edit-footer').getBoundingClientRect();
    return { space: f.top - t.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert(layout.space > 150 && !layout.overflow, 'mobile keeps a usable canvas and no horizontal overflow');
  await shot(mobile, 'cutout-mobile');
  await mobile.click('#langSwitch button[data-locale="zh-TW"]'); await mobile.locator('#editor').scrollIntoViewIfNeeded();
  assert(await mobile.getByText('微調去背', { exact: true }).isVisible());
  await shot(mobile, 'cutout-mobile-zh');
  assert.deepEqual(errors, []);
  console.log('PASS touch pinch, mobile layout, Chinese labels and no browser errors');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
