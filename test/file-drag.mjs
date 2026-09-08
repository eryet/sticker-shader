/* File-drag highlight exits cleanly, including canceled external OS drags. */
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
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => window.stickerApp);
  await page.goto(url); await page.waitForFunction(() => window.stickerApp);
  await page.evaluate(() => {
    window.dragFile = new DataTransfer(); dragFile.items.add(new File(['test'], 'test.png', { type: 'image/png' }));
    window.dragEvent = (type, selector = '#glCanvas', related = null, transfer = dragFile) => document.querySelector(selector).dispatchEvent(new DragEvent(type, {
      bubbles: true, cancelable: true, dataTransfer: transfer, relatedTarget: related ? document.querySelector(related) : null, clientX: 200, clientY: 250
    }));
  });
  const active = () => page.locator('#stage').evaluate(el => el.classList.contains('dragover'));
  await page.evaluate(() => { dragEvent('dragenter', '#stage'); dragEvent('dragenter', '#glCanvas'); dragEvent('dragleave', '#stage', '#glCanvas'); });
  assert(await active(), 'crossing child elements keeps the file highlight');
  await page.evaluate(() => dragEvent('dragleave'));
  assert(!await active(), 'leaving from a child element clears the highlight without a drop');
  assert.equal(await page.evaluate(() => stickerApp.records.size), 0, 'passing over does not import anything');
  for (const finish of ['escape', 'dragend', 'blur', 'pointer']) {
    await page.evaluate(() => dragEvent('dragenter'));
    assert(await active());
    await page.evaluate(finish => {
      if (finish === 'escape') document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (finish === 'dragend') dragEvent('dragend');
      if (finish === 'blur') window.dispatchEvent(new Event('blur'));
      if (finish === 'pointer') document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    }, finish);
    assert(!await active(), `${finish} clears the highlight`);
  }
  await page.evaluate(() => dragEvent('dragenter'));
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(700); await page.evaluate(() => dragEvent('dragover')); assert(await active(), 'ongoing drag stays highlighted');
  }
  await page.waitForFunction(() => !document.querySelector('#stage').classList.contains('dragover'), { }, { timeout: 4000 });
  await page.evaluate(() => { const text = new DataTransfer(); text.setData('text/plain', 'hello'); dragEvent('dragenter', '#glCanvas', null, text); });
  assert(!await active(), 'text and internal drags do not enable file intake');
  await page.locator('#btnGuide').click();
  await page.evaluate(() => dragEvent('dragenter')); assert(!await active(), 'guide blocks file drag highlight');
  await page.locator('#tourClose').click();
  await page.selectOption('#importMode', 'whole');
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 24; c.getContext('2d').fillRect(0, 0, 24, 24);
    const data = new DataTransfer(); data.items.add(new File([await new Promise(r => c.toBlob(r))], 'dropped.png', { type: 'image/png' }));
    dragEvent('dragenter', '#glCanvas', null, data); dragEvent('drop', '#glCanvas', null, data);
  });
  assert(!await active(), 'successful drop clears the highlight immediately');
  await page.waitForFunction(() => stickerApp.selected?.atlas && stickerApp.records.size === 1);
  assert.equal(await page.evaluate(() => stickerApp.selected.name), 'dropped.png');
  assert.deepEqual(errors, []);
  console.log('PASS file pass-through, nested targets, cancellation, missing leave fallback, active drag, modal guard and real file drop');
} finally { await browser?.close(); server.close(); }
