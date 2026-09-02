/*
 * Headless smoke test for the sticker editor.
 *
 *   node test/e2e.mjs [--image path/to/photo.jpg]
 *
 * Needs Playwright with Chromium. Set PLAYWRIGHT_MODULE to the path of a global
 * install if `import('playwright')` cannot resolve it.
 *
 * The MediaPipe package and the two models are downloaded once into
 * test/.cache/ and served to the page in place of the CDN so the run is
 * deterministic and works where the CDN is blocked.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CACHE = path.join(HERE, '.cache');
const OUT = path.join(HERE, '.out');
const VERSION = '1.0.1';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELS = {
  'deeplab_v3.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite',
  'magic_touch.tflite': 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite',
};
const argImage = process.argv.includes('--image') ? path.resolve(process.argv[process.argv.indexOf('--image') + 1]) : null;

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function download(url, dest) {
  if (fs.existsSync(dest)) return;
  console.log('downloading', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function prepareAssets() {
  const pkgDir = path.join(CACHE, 'pkg');
  if (!fs.existsSync(path.join(pkgDir, 'package', 'vision_bundle.mjs'))) {
    const tgz = path.join(CACHE, `tasks-vision-${VERSION}.tgz`);
    await download(`https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-${VERSION}.tgz`, tgz);
    fs.mkdirSync(pkgDir, { recursive: true });
    execSync(`tar xzf "${tgz}" -C "${pkgDir}"`);
  }
  for (const [name, url] of Object.entries(MODELS)) await download(url, path.join(CACHE, 'models', name));
  return { pkg: path.join(pkgDir, 'package'), models: path.join(CACHE, 'models') };
}

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(dir, url === '/' ? 'index.html' : url);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

async function newPage(browser, assets, opts = {}) {
  const page = await browser.newPage({ viewport: opts.viewport || { width: 1400, height: 900 } });
  page.on('pageerror', (e) => { console.log('[pageerror]', e.message); process.exitCode = 1; });
  await page.route(`${CDN}/**`, (route) => {
    if (opts.offline) return route.abort();
    const rel = new URL(route.request().url()).pathname.replace(`/npm/@mediapipe/tasks-vision@${VERSION}`, '');
    const f = path.join(assets.pkg, rel);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404 });
    const ct = rel.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(rel) ? 'text/javascript' : 'application/octet-stream';
    route.fulfill({ path: f, contentType: ct, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.route('https://storage.googleapis.com/**', (route) => {
    if (opts.offline) return route.abort();
    const name = Object.keys(MODELS).find((n) => route.request().url().endsWith(n));
    if (!name) return route.fulfill({ status: 404 });
    route.fulfill({ path: path.join(assets.models, name), contentType: 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto(opts.url);
  await page.waitForFunction(() => window.stickerApp, null, { timeout: 15000 });
  return page;
}

const coverage = (page) => page.evaluate(() => { const s = window.stickerApp.selected; let a = 0; for (const v of s.mask) if (v > 0.5) a++; return +(a / s.mask.length).toFixed(4); });
const statusText = (page) => page.evaluate(() => document.querySelector('#statusText').textContent);
const count = (page) => page.evaluate(() => window.stickerApp.scene.stickers.length);
const phases = (page) => page.evaluate(() => window.stickerApp.scene.stickers.map((e) => e.phase));
const waitReady = (page, n) => page.waitForFunction((n) => { const s = window.stickerApp.scene.stickers; return s.length === n && s.every((e) => e.phase === 'ready'); }, n, { timeout: 240000 });
function check(cond, msg) { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; }

const assets = await prepareAssets();
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await serve(ROOT);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'] });

try {
  // 1. main flow with the ML models: two stickers, reveal, selection, delete
  {
    const page = await newPage(browser, assets, { url });
    await page.evaluate(() => { window.stickerApp.scene.revealDuration = 4.5; });
    check(await page.evaluate(() => !!window.stickerApp.scene), 'page booted');
    if (argImage) await page.setInputFiles('#fileInput', argImage); else await page.click('#btnSample');
    await page.waitForFunction(() => window.stickerApp.scene.stickers.length === 1, null, { timeout: 15000 });
    check((await phases(page))[0] === 'processing', 'placeholder card appears immediately while extracting');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, '0-processing.png') });
    await page.waitForFunction(() => window.stickerApp.scene.stickers[0].phase !== 'processing', null, { timeout: 240000 });
    check((await phases(page))[0] === 'revealing', 'reveal animation starts once the mask is ready');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '1a-reveal-early.png') });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(OUT, '1b-reveal-late.png') });
    await waitReady(page, 1);
    await page.evaluate(() => { window.stickerApp.scene.revealDuration = 2.6; });
    const cov = await coverage(page);
    check(cov > 0.01 && cov < 0.9, `extraction produced a plausible mask (coverage ${cov}) — ${await statusText(page)}`);
    check((await page.evaluate(() => window.stickerApp.state.mlStatus)) === 'ready', 'MediaPipe runtime loaded');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, '1-sticker.png') });

    // second sticker
    await page.click('#btnSample');
    await waitReady(page, 2);
    check((await count(page)) === 2, 'second upload adds a sticker instead of replacing');
    const selName = await page.evaluate(() => window.stickerApp.selected && window.stickerApp.selected.name);
    check(selName === 'sample-robot.png', `new sticker becomes the selection (${selName})`);
    check((await page.evaluate(() => document.querySelector('#panelName').textContent)) === selName, 'panel header names the selected sticker');
    check(!(await page.evaluate(() => document.querySelector('#btnDelete').hidden)), 'delete button shown for the selection');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, '2-two-stickers.png') });

    // knob edits go to the selected sticker only
    await page.evaluate(() => { const i = document.querySelector('#ctl-borderWidth'); i.value = 30; i.dispatchEvent(new Event('input')); });
    const widths = await page.evaluate(() => window.stickerApp.scene.stickers.map((e) => e.settings.borderWidth));
    check(widths[1] === 30 && widths[0] !== 30, `knob edits only the selected sticker (${widths.join(' / ')})`);

    // deselect by clicking empty stage, reselect by clicking a sticker
    const box = await page.locator('#glCanvas').boundingBox();
    await page.mouse.click(box.x + 20, box.y + box.height - 20);
    await page.waitForTimeout(150);
    check((await page.evaluate(() => window.stickerApp.selected)) === null, 'clicking empty canvas deselects');
    check(await page.evaluate(() => document.querySelector('#panel').classList.contains('idle')), 'panel greys out with no selection');
    check(await page.evaluate(() => document.querySelector('#ctl-holoIntensity').disabled), 'look controls disabled with no selection');
    check(!(await page.evaluate(() => document.querySelector('#ctl-background').disabled)), 'scene controls stay active');
    await page.screenshot({ path: path.join(OUT, '2b-deselected.png') });
    const first = await page.evaluate(() => { const e = window.stickerApp.scene.stickers[0]; return { x: e.x, y: e.y }; });
    await page.mouse.click(box.x + first.x, box.y + first.y);
    await page.waitForTimeout(150);
    check((await page.evaluate(() => window.stickerApp.selected && window.stickerApp.selected.name)) === 'sample-cat.png', 'clicking a sticker selects it');

    // drag
    const cur = await page.evaluate(() => { const e = window.stickerApp.scene.selected; return { x: e.x, y: e.y }; });
    await page.mouse.move(box.x + cur.x, box.y + cur.y); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(box.x + cur.x - i * 20, box.y + cur.y - i * 8); await page.waitForTimeout(16); }
    check(await page.evaluate(() => Math.abs(window.stickerApp.scene.selected.rotY) > 0.01), 'sticker tilts while dragged');
    await page.screenshot({ path: path.join(OUT, '3-drag.png') });
    await page.mouse.up(); await page.waitForTimeout(700);

    for (const preset of Object.keys(await page.evaluate(() => StickerUI.PRESETS))) {
      await page.selectOption('#presetSelect', preset); await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, `4-preset-${preset.replace(/\s+/g, '-').toLowerCase()}.png`) });
    }
    check(true, 'all presets rendered');

    for (const kind of ['png', 'png2x', 'posed', 'cutout', 'canvas', 'clip']) {
      const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await page.click('#exportMenuWrap summary'); await page.click(`#exportMenu button[data-export="${kind}"]`);
      const d = await dl;
      if (d) { const p = path.join(OUT, `5-export-${d.suggestedFilename()}`); await d.saveAs(p); check(fs.statSync(p).size > 1000, `export ${kind} → ${d.suggestedFilename()}`); }
      else check(false, `export ${kind} produced no download (${await statusText(page)})`);
    }

    // editor: brush add then undo (on the selected sticker)
    await page.click('#btnEdit'); await page.waitForTimeout(200);
    const before = await coverage(page);
    const eb = await page.locator('#editCanvas').boundingBox();
    await page.click('#editTools button[data-tool="brushAdd"]');
    await page.mouse.move(eb.x + eb.width * 0.3, eb.y + eb.height * 0.5); await page.mouse.down();
    for (let i = 0; i < 15; i++) await page.mouse.move(eb.x + eb.width * (0.3 + i * 0.02), eb.y + eb.height * 0.5);
    await page.mouse.up(); await page.waitForTimeout(200);
    const after = await coverage(page);
    check(after > before, `brush add grows the mask (${before} → ${after})`);
    await page.click('#btnUndo'); await page.waitForTimeout(150);
    check((await coverage(page)) === before, 'undo restores the mask');
    await page.screenshot({ path: path.join(OUT, '6-editor.png') });
    await page.click('#btnDone'); await page.waitForTimeout(300);

    // delete via the icon button, then via keyboard
    await page.click('#btnDelete'); await page.waitForTimeout(200);
    check((await count(page)) === 1, 'delete button removes the selected sticker');
    check((await page.evaluate(() => window.stickerApp.selected)) === null, 'nothing selected after deleting');
    const rest = await page.evaluate(() => { const e = window.stickerApp.scene.stickers[0]; return { x: e.x, y: e.y }; });
    await page.mouse.click(box.x + rest.x, box.y + rest.y); await page.waitForTimeout(150);
    await page.keyboard.press('Delete'); await page.waitForTimeout(200);
    check((await count(page)) === 0, 'Delete key removes the selected sticker');
    check(!(await page.evaluate(() => document.querySelector('#dropzone').classList.contains('hidden'))), 'empty state returns when the canvas is empty');
    await page.close();
  }

  // 2. offline fallback (CDN and models blocked)
  {
    const page = await newPage(browser, assets, { url, offline: true });
    await page.click('#btnSample');
    await waitReady(page, 1);
    check((await page.evaluate(() => window.stickerApp.state.mlStatus)) === 'unavailable', 'runtime reported unavailable when blocked');
    const cov = await coverage(page);
    check(cov > 0.01 && cov < 0.9, `colour-key fallback produced a mask (coverage ${cov})`);
    await page.screenshot({ path: path.join(OUT, '7-offline.png') });
    await page.close();
  }

  // 3. narrow viewport
  {
    const page = await newPage(browser, assets, { url, viewport: { width: 420, height: 860 } });
    await page.click('#btnSample'); await waitReady(page, 1); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '8-mobile.png'), fullPage: true });
    check(true, 'mobile layout rendered');
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(process.exitCode ? 'FAILED' : 'PASSED', '— screenshots in', OUT);
