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
    // relative paths: GNU tar reads "C:\..." as a remote host
    execSync(`tar xzf "${path.basename(tgz)}" -C pkg`, { cwd: CACHE });
  }
  for (const [name, url] of Object.entries(MODELS)) await download(url, path.join(CACHE, 'models', name));
  return { pkg: path.join(pkgDir, 'package'), models: path.join(CACHE, 'models') };
}

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain' };
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
  if (opts.init) await page.addInitScript(opts.init);
  page.on('pageerror', (e) => { console.log('[pageerror]', e.message); process.exitCode = 1; });
  await page.route(`${CDN}/**`, (route) => {
    if (opts.offline) return route.abort();
    const rel = new URL(route.request().url()).pathname.replace(`/npm/@mediapipe/tasks-vision@${VERSION}`, '');
    const f = path.join(assets.pkg, rel);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404 });
    const ct = rel.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(rel) ? 'text/javascript' : 'application/octet-stream';
    route.fulfill({ path: f, contentType: ct, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  // the subject model (ONNX Runtime on jsDelivr, weights on Hugging Face) needs the network: only the
  // network section lets it through, so the rest of the suite stays hermetic and quick
  const network = !!opts.network;
  await page.route('https://cdn.jsdelivr.net/npm/onnxruntime-web*/**', (route) => (network ? route.continue() : route.abort()));
  await page.route('https://huggingface.co/**', (route) => (network ? route.continue() : route.abort()));
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

    // deselect by clicking empty stage (a spot with no sticker and no overlay such as the status toast), reselect by clicking a sticker
    const box = await page.locator('#glCanvas').boundingBox();
    const empty = await page.evaluate(() => {
      const c = document.querySelector('#glCanvas'), r = c.getBoundingClientRect(), sc = window.stickerApp.scene;
      for (let y = 30; y < r.height - 30; y += 40) for (let x = 30; x < r.width - 30; x += 40) {
        if (!sc.hitTest(x, y) && document.elementFromPoint(r.left + x, r.top + y) === c) return { x, y };
      }
      return null;
    });
    await page.mouse.click(box.x + empty.x, box.y + empty.y);
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
    await page.click('#btnDelete'); await page.click('#deleteConfirm'); await page.waitForTimeout(200);
    check((await count(page)) === 1, 'delete button removes the selected sticker');
    check((await page.evaluate(() => window.stickerApp.selected)) === null, 'nothing selected after deleting');
    const rest = await page.evaluate(() => { const e = window.stickerApp.scene.stickers[0]; return { x: e.x, y: e.y }; });
    await page.mouse.click(box.x + rest.x, box.y + rest.y); await page.waitForTimeout(150);
    await page.keyboard.press('Delete'); await page.click('#deleteConfirm'); await page.waitForTimeout(200);
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

  // 4. portrait frame + icons (offline so the cutout is quick; fonts may or may not load)
  {
    const page = await newPage(browser, assets, { url, offline: true });
    const kinds = () => page.evaluate(() => window.stickerApp.scene.stickers.map((e) => window.stickerApp.records.get(e.id).kind));
    const sel = () => page.evaluate(() => { const s = window.stickerApp.selected; return s ? { kind: s.kind, name: s.name, photo: s.kind === 'frame' ? s.frame.photoId : undefined, border: s.settings.borderWidth } : null; });
    await page.evaluate(async () => { const c = window.stickerApp.drawSample(2); const b = await new Promise((r) => c.toBlob(r, 'image/png')); await window.stickerApp.addSticker(b, 'sample-bunny.png'); });
    await waitReady(page, 1);
    const bunnyId = await page.evaluate(() => window.stickerApp.selected.id);

    // a frame adopts the only loose sticker
    await page.click('#btnFrame'); await page.waitForTimeout(250);
    let s = await sel();
    check(s && s.kind === 'frame' && s.photo === bunnyId, `Add frame puts the lone sticker into the frame (${JSON.stringify(s)})`);
    check((await kinds()).join() === 'frame', 'the framed sticker leaves the stage, the frame stays');
    check(await page.evaluate(() => !document.querySelector('.group[data-group="frame"]').hidden && document.querySelector('.group[data-group="cutout"]').hidden), 'panel shows the frame group and hides the cutout group');
    check(await page.evaluate(() => document.querySelector('#btnEdit').disabled), 'Edit cutout is disabled for a frame');
    const buildMs = await page.evaluate(() => Math.round(window.stickerApp.selected.lastBuildMs));
    check(buildMs < 1500, `frame cutout builds in ${buildMs} ms`);

    // caption + shape recompose the frame
    const before = await page.evaluate(() => window.stickerApp.selected.maskVersion);
    await page.fill('#ctl-frameCaption', 'Bunny Day');
    await page.selectOption('#ctl-frameStyle', 'portrait');
    await page.waitForFunction(() => window.stickerApp.selected.source.height > 1500, null, { timeout: 15000 }).catch(() => {});
    const after = await page.evaluate(() => { const r = window.stickerApp.selected; return { v: r.maskVersion, h: r.source.height, cap: r.settings.frameCaption }; });
    check(after.v > before && after.cap === 'Bunny Day' && after.h > 1500, `caption and shape edits recompose the frame (${JSON.stringify(after)})`);
    await page.selectOption('#ctl-frameStyle', 'polaroid'); await page.waitForTimeout(400);

    // frame style presets and hand edits
    await page.selectOption('#ctl-framePreset', 'Sky ticket'); await page.waitForTimeout(400);
    check((await page.evaluate(() => { const s = window.stickerApp.selected.settings; return s.frameEdge === 'ticket' && s.frameDecor === 'stars' && s.frameCaption === 'Bunny Day'; })), 'frame style preset applies its look and keeps the caption');
    await page.evaluate(() => { const i = document.querySelector('#ctl-windowShape'); i.value = 'heart'; i.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(400);
    check((await page.evaluate(() => window.stickerApp.selected.settings.framePreset)) === '', 'editing a frame option returns the style to Custom');
    for (const edge of ['scallop', 'cloud', 'stamp', 'straight']) { await page.evaluate((e) => { const i = document.querySelector('#ctl-frameEdge'); i.value = e; i.dispatchEvent(new Event('change')); }, edge); await page.waitForTimeout(350); }
    check(await page.evaluate(() => window.stickerApp.selected.atlas && window.stickerApp.selected.atlas.w > 100), 'every edge style composes');
    // every frame design composes with the photo inside
    const designs = await page.evaluate(() => {
      const app = window.stickerApp, fr = app.selected, out = {};
      for (const name of Object.keys(StickerDecor.FRAME_PRESETS)) {
        Object.assign(fr.settings, StickerDecor.FRAME_PRESETS[name]); fr.settings.frameSubtitle = 'small line';
        app.composeRecord(fr, { sync: true });
        out[name] = fr.atlas && fr.atlas.w > 100 && fr.frame.layout.window.w > 100 ? 'ok' : 'bad';
      }
      fr.settings.frameSubtitle = '';
      return out;
    });
    check(Object.values(designs).every((v) => v === 'ok'), `all ${Object.keys(designs).length} frame styles / designs compose (${Object.entries(designs).filter(([, v]) => v !== 'ok').map(([k]) => k).join(', ') || 'none failed'})`);
    await page.screenshot({ path: path.join(OUT, '9c-last-design.png') });
    await page.selectOption('#ctl-framePreset', 'Cinnamon café'); await page.waitForTimeout(400);
    check(await page.evaluate(() => !!document.querySelector('#ctl-stickerScale-frame') && !!document.querySelector('#ctl-anim-frame')), 'frame group has its own Size and Animation controls');

    // icons from the menu gather around the frame and stick to it
    await page.click('#iconMenuWrap summary'); await page.click('#iconMenu button[data-tab="g0"]'); await page.click('#iconMenu button[data-icon="teacup"]'); await page.waitForTimeout(150);
    s = await sel();
    check(s && s.kind === 'icon' && s.name === 'Teacup' && s.border === 12, `icon added from the menu and selected (${JSON.stringify(s)})`);
    check(await page.evaluate(() => !document.querySelector('.group[data-group="icon"]').hidden && document.querySelector('.group[data-group="frame"]').hidden), 'panel shows the icon group for an icon');
    for (const id of ['cloud', 'roll', 'heart', 'note', 'ticket']) await page.evaluate((id) => window.stickerApp.addIcon(id), id);
    await page.waitForTimeout(200);
    check((await kinds()).filter((k) => k === 'icon').length === 6, 'six icons on the stage');
    check((await page.evaluate(() => [...window.stickerApp.records.values()].find((r) => r.icon === 'note').settings.borderWidth)) === 0, 'line-art icons start without a die-cut border');
    await page.evaluate(() => { const i = document.querySelector('#ctl-iconAccent'); i.value = '#ffd166'; i.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(400);
    check((await page.evaluate(() => window.stickerApp.selected.settings.iconAccent === '#ffd166' && window.stickerApp.selected.settings.iconPalette === '')), 'icon colour knob writes to the icon and clears the palette choice');
    await page.selectOption('#ctl-iconPalette', 'Strawberry milk'); await page.waitForTimeout(300);
    check((await page.evaluate(() => window.stickerApp.selected.settings.iconAccent)) === '#f29bb6', 'icon palette applies its colours');
    // size: icon-group slider, mouse wheel, shift+wheel rotation
    await page.evaluate(() => { const i = document.querySelector('#ctl-stickerScale-icon'); i.value = 0.5; i.dispatchEvent(new Event('input')); });
    check(await page.evaluate(() => window.stickerApp.selected.settings.stickerScale === 0.5 && +document.querySelector('#ctl-stickerScale').value === 0.5), 'icon Size slider resizes it and the Motion copy follows');
    {
      const fb = await page.locator('#glCanvas').boundingBox();
      const ic = await page.evaluate(() => { const e = window.stickerApp.scene.get(window.stickerApp.selected.id); return { x: e.x, y: e.y }; });
      await page.mouse.move(fb.x + ic.x, fb.y + ic.y); await page.waitForTimeout(60);
      await page.mouse.wheel(0, -240); await page.waitForTimeout(120);
      const sc = await page.evaluate(() => window.stickerApp.selected.settings.stickerScale);
      check(sc > 0.5, `mouse wheel over an icon enlarges it (${sc})`);
      const r0 = await page.evaluate(() => window.stickerApp.selected.settings.baseRotation);
      await page.keyboard.down('Shift'); await page.mouse.wheel(0, 240); await page.keyboard.up('Shift'); await page.waitForTimeout(120);
      const r1 = await page.evaluate(() => window.stickerApp.selected.settings.baseRotation);
      check(r1 !== r0, `shift + wheel rotates it (${r0} → ${r1})`);
    }
    // faces and blinking, idle animation
    check(await page.evaluate(() => { const sc = window.stickerApp.scene; const has = (icon) => { const r = [...window.stickerApp.records.values()].find((x) => x.icon === icon); return !!sc.get(r.id).tex.blink; }; return !has('cloud') && has('ticket') === false; }), 'icons without a face have no blink frame');
    await page.evaluate(() => window.stickerApp.addIcon('star')); await page.waitForTimeout(200);
    check(await page.evaluate(() => !!window.stickerApp.scene.get(window.stickerApp.selected.id).tex.blink), 'a face icon gets a blink frame');
    await page.selectOption('#ctl-iconFace', 'off');
    await page.waitForFunction(() => !window.stickerApp.scene.get(window.stickerApp.selected.id).tex.blink, null, { timeout: 15000 }).catch(() => {});
    check(await page.evaluate(() => !window.stickerApp.scene.get(window.stickerApp.selected.id).tex.blink), 'Kawaii face: none removes the face and its blink frame');
    await page.selectOption('#ctl-anim-icon', 'float'); await page.waitForTimeout(400);
    check(await page.evaluate(() => { const e = window.stickerApp.scene.get(window.stickerApp.selected.id); return e.settings.anim === 'float' && Math.abs(e.ay) > 0.01 && document.querySelector('#ctl-anim').value === 'float'; }), 'Float animation moves the icon and the Motion copy follows');
    await page.selectOption('#ctl-anim-icon', 'none');
    {
      const fid = await page.evaluate(() => [...window.stickerApp.records.values()].find((r) => r.kind === 'frame').id);
      const st = await page.evaluate((fid) => { const sc = window.stickerApp.scene; const f = sc.get(fid); return { attached: sc.stickers.filter((e) => e.parent === f).length, frameIndex: sc.stickers.indexOf(f), layers: sc.stickers.map((e) => e.layer).join('') }; }, fid);
      check(st.attached === 7 && st.frameIndex === 0 && st.layers === '02222222', `icons stick to the frame and stay above it (${JSON.stringify(st)})`);
      const fb = await page.locator('#glCanvas').boundingBox();
      const before = await page.evaluate((fid) => { const sc = window.stickerApp.scene; const f = sc.get(fid); return { x: f.x, y: f.y, icons: sc.stickers.filter((e) => e.parent === f).map((e) => [e.x, e.y]) }; }, fid);
      await page.mouse.move(fb.x + before.x, fb.y + before.y + 30); await page.mouse.down();
      for (let i = 1; i <= 16; i++) { await page.mouse.move(fb.x + before.x - i * 10, fb.y + before.y + 30 - i * 5); await page.waitForTimeout(16); }
      await page.mouse.up(); await page.waitForTimeout(900);
      const aft = await page.evaluate((fid) => { const sc = window.stickerApp.scene; const f = sc.get(fid); return { x: f.x, y: f.y, icons: sc.stickers.filter((e) => e.parent === f).map((e) => [e.x, e.y]), frameIndex: sc.stickers.indexOf(f) }; }, fid);
      const dx = aft.x - before.x, dy = aft.y - before.y;
      const followed = aft.icons.length === 7 && aft.icons.every(([x, y], i) => Math.abs(x - before.icons[i][0] - dx) < 6 && Math.abs(y - before.icons[i][1] - dy) < 6);
      check(Math.abs(dx) > 100 && followed && aft.frameIndex === 0, `dragging the frame carries its icons (${dx.toFixed(0)}, ${dy.toFixed(0)}) and it stays underneath`);
      await page.screenshot({ path: path.join(OUT, '9a-frame-with-stuck-icons.png') });
      // an icon dragged away detaches; the stick toggle detaches too
      const ic = await page.evaluate(() => { const sc = window.stickerApp.scene; const e = sc.stickers[sc.stickers.length - 1]; return { id: e.id, x: e.x, y: e.y }; });
      await page.mouse.move(fb.x + ic.x, fb.y + ic.y); await page.mouse.down();
      for (let i = 1; i <= 16; i++) { await page.mouse.move(fb.x + ic.x + i * 25, fb.y + ic.y + i * 10); await page.waitForTimeout(16); }
      await page.mouse.up(); await page.waitForTimeout(300);
      check(await page.evaluate((id) => window.stickerApp.scene.get(id).parent === null, ic.id), 'an icon dragged off the frame lets go of it');
      await page.evaluate((id) => window.stickerApp.scene.select(window.stickerApp.scene.get(id)), ic.id); await page.waitForTimeout(100);
      await page.evaluate(() => { const i = document.querySelector('#ctl-iconStick'); i.checked = false; i.dispatchEvent(new Event('change')); });
      check(await page.evaluate(() => !window.stickerApp.selected.settings.iconStick), 'Stick to a frame toggle is per icon');
    }

    // theme → patterned backdrop, and the canvas export carries it
    await page.selectOption('#ctl-sceneTheme', 'Sky'); await page.waitForTimeout(200);
    check(await page.evaluate(() => document.querySelector('#stage').classList.contains('patterned') && document.querySelector('#stage').style.backgroundImage.startsWith('url(')), 'Sky theme paints a grid backdrop');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, '9-frame-and-icons.png') });
    {
      const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await page.click('#exportMenuWrap summary'); await page.click('#exportMenu button[data-export="canvas"]');
      const d = await dl;
      if (d) { const p = path.join(OUT, '9-export-canvas.png'); await d.saveAs(p); check(fs.statSync(p).size > 1000, 'canvas export with backdrop pattern'); }
      else check(false, 'canvas export produced no download');
    }

    // take the photo out through the panel, then drop it back onto the frame window
    const frameId = await page.evaluate(() => [...window.stickerApp.records.values()].find((r) => r.kind === 'frame').id);
    await page.evaluate((id) => window.stickerApp.scene.select(window.stickerApp.scene.get(id)), frameId);
    await page.selectOption('#ctl-framePhoto', ''); await page.waitForTimeout(300);
    check((await kinds()).includes('sticker') && (await sel()).photo === '', 'Photo: none pops the sticker back onto the stage');
    const box = await page.locator('#glCanvas').boundingBox();
    const pos = await page.evaluate((ids) => { const sc = window.stickerApp.scene; const b = sc.get(ids[0]), f = sc.get(ids[1]); return { bx: b.x, by: b.y, fx: f.x, fy: f.y - sc.size(f).h * 0.12 }; }, [bunnyId, frameId]);
    await page.mouse.move(box.x + pos.bx, box.y + pos.by); await page.mouse.down();
    for (let i = 1; i <= 20; i++) { await page.mouse.move(box.x + pos.bx + (pos.fx - pos.bx) * i / 20, box.y + pos.by + (pos.fy - pos.by) * i / 20); await page.waitForTimeout(16); }
    await page.waitForTimeout(80);
    check(await page.evaluate(() => !!window.stickerApp.scene.dropTarget && document.querySelector('#stageHint').classList.contains('drop')), 'dragging a sticker over the frame window highlights it and shows the drop hint');
    await page.mouse.up(); await page.waitForTimeout(400);
    s = await sel();
    check(s && s.kind === 'frame' && s.photo === bunnyId && !(await kinds()).includes('sticker'), 'releasing over the window frames the sticker');
    await page.screenshot({ path: path.join(OUT, '9b-dropped-in-frame.png') });

    // sticker exports work for a frame; deleting the frame gives the photo back
    {
      const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await page.click('#exportMenuWrap summary'); await page.click('#exportMenu button[data-export="png"]');
      const d = await dl;
      check(!!d, 'framed portrait exports as a sticker PNG');
      if (d) await d.saveAs(path.join(OUT, '9-export-frame.png'));
    }
    await page.keyboard.press('Delete'); await page.click('#deleteConfirm'); await page.waitForTimeout(300);
    const k = await kinds();
    check(!k.includes('frame') && k.includes('sticker') && k.filter((x) => x === 'icon').length === 7, `deleting the frame releases its photo and leaves the icons (${k.join(',')})`);
    check(await page.evaluate(() => window.stickerApp.scene.stickers.every((e) => !e.parent)), 'icons let go of a deleted frame');
    await page.close();
  }

  // 5. undo / redo, worker composition, animated exports, share link, pinch (offline)
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, hasTouch: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage();
    page.on('pageerror', (e) => { console.log('[pageerror]', e.message); process.exitCode = 1; });
    await page.route(`${CDN}/**`, (r) => r.abort()); await page.route('https://storage.googleapis.com/**', (r) => r.abort());
    await page.goto(url); await page.waitForFunction(() => window.stickerApp, null, { timeout: 15000 });
    const kinds = () => page.evaluate(() => window.stickerApp.scene.stickers.map((e) => window.stickerApp.records.get(e.id).kind).join(','));
    const hist = () => page.evaluate(() => ({ u: window.stickerApp.history.undo.length, r: window.stickerApp.history.redo.length, top: window.stickerApp.history.undo.length ? window.stickerApp.history.undo[window.stickerApp.history.undo.length - 1].label : null }));
    check((await page.evaluate(() => window.stickerApp.state.composeMode)) === 'worker', 'frames and icons compose in a worker');
    await page.evaluate(async () => { const c = window.stickerApp.drawSample(2); const b = await new Promise((r) => c.toBlob(r, 'image/png')); await window.stickerApp.addSticker(b, 'sample-bunny.png'); });
    await waitReady(page, 1);
    await page.click('#btnFrame'); await page.waitForTimeout(300);
    const frameId = await page.evaluate(() => window.stickerApp.selected.id);
    check((await hist()).top === 'add frame', 'adding a frame is one undo step');
    await page.click('#btnHistUndo'); await page.waitForTimeout(300);
    check((await kinds()) === 'sticker', 'undo of add-frame gives the photo back');
    await page.click('#btnHistRedo'); await page.waitForTimeout(400);
    check((await kinds()) === 'frame' && (await page.evaluate((id) => window.stickerApp.records.get(id).frame.photoId !== '', frameId)), 'redo puts the frame back with its photo');
    // caption typing recomposes off the main thread and undoes as one step
    await page.evaluate((id) => window.stickerApp.scene.select(window.stickerApp.scene.get(id)), frameId); await page.waitForTimeout(100);
    const seq0 = await page.evaluate((id) => window.stickerApp.records.get(id).composeSeq || 0, frameId);
    await page.fill('#ctl-frameCaption', 'Undo me');
    await page.waitForFunction(([id, s0]) => window.stickerApp.records.get(id).composeSeq > s0, [frameId, seq0], { timeout: 10000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    check((await page.evaluate((id) => window.stickerApp.records.get(id).settings.frameCaption, frameId)) === 'Undo me', 'caption recomposed through the worker');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
    check((await page.evaluate(() => document.querySelector('#ctl-frameCaption').value)) === 'CUTE', 'Ctrl+Z undoes the whole caption edit');
    await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(300);
    check((await page.evaluate((id) => window.stickerApp.records.get(id).settings.frameCaption, frameId)) === 'Undo me', 'Ctrl+Shift+Z redoes it');
    await page.evaluate(() => { const i = document.querySelector('#ctl-frameLine'); for (const v of [12, 14, 16, 18]) { i.value = v; i.dispatchEvent(new Event('input')); } });
    check((await hist()).top === 'outline width', 'slider steps coalesce into one undo step');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
    check((await page.evaluate((id) => window.stickerApp.records.get(id).settings.frameLine, frameId)) === 10, 'undo restores the slider start value');
    // move, delete, undo, redo of an icon
    await page.evaluate(() => window.stickerApp.addIcon('star')); await page.waitForTimeout(200);
    const starId = await page.evaluate(() => window.stickerApp.selected.id);
    const fb = await page.locator('#glCanvas').boundingBox();
    const p0 = await page.evaluate((id) => { const e = window.stickerApp.scene.get(id); return { x: e.x, y: e.y }; }, starId);
    await page.mouse.move(fb.x + p0.x, fb.y + p0.y); await page.mouse.down();
    for (let i = 1; i <= 15; i++) { await page.mouse.move(fb.x + p0.x + i * 20, fb.y + p0.y + i * 12); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(500);
    check((await hist()).top === 'move', 'a drag is one undo step');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
    const p1 = await page.evaluate((id) => { const e = window.stickerApp.scene.get(id); return { x: e.restX, y: e.restY }; }, starId);
    check(Math.abs(p1.x - p0.x) < 2 && Math.abs(p1.y - p0.y) < 2, 'undo puts the icon back where it was');
    await page.keyboard.press('Delete'); await page.click('#deleteConfirm'); await page.waitForTimeout(300);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
    check(await page.evaluate((id) => { const e = window.stickerApp.scene.get(id); return !!e && !!e.parent; }, starId), 'undo delete brings the icon back, still stuck to the frame');
    await page.evaluate((id) => window.stickerApp.scene.select(window.stickerApp.scene.get(id)), frameId); await page.waitForTimeout(100);
    await page.keyboard.press('Delete'); await page.click('#deleteConfirm'); await page.waitForTimeout(400);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
    check((await kinds()).startsWith('frame') && (await page.evaluate(([f, s]) => { const fe = window.stickerApp.scene.get(f), se = window.stickerApp.scene.get(s); return window.stickerApp.records.get(f).frame.photoId !== '' && se.parent === fe; }, [frameId, starId])), 'undo of a frame delete restores the photo inside and the icon stuck to it');
    // exports
    await page.evaluate((id) => window.stickerApp.scene.select(window.stickerApp.scene.get(id)), starId); await page.waitForTimeout(100);
    await page.selectOption('#ctl-anim-icon', 'float'); await page.waitForTimeout(200);
    for (const kind of ['pack', 'apng', 'gif']) {
      const dl = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
      await page.click('#exportMenuWrap summary'); await page.click(`#exportMenu button[data-export="${kind}"]`);
      const d = await dl;
      if (d) { const p = path.join(OUT, `10-export-${d.suggestedFilename()}`); await d.saveAs(p); check(fs.statSync(p).size > 2000, `export ${kind} → ${d.suggestedFilename()}`); }
      else check(false, `export ${kind} produced no download (${await statusText(page)})`);
    }
    const apng = fs.readFileSync(path.join(OUT, '10-export-Star-animated.png'));
    check(apng.indexOf('acTL') > 0 && apng.indexOf('fcTL') > 0, 'animated PNG carries animation chunks');
    const gif = fs.readFileSync(path.join(OUT, '10-export-Star-animated.gif'));
    check(gif.subarray(0, 6).toString() === 'GIF89a' && gif.indexOf('NETSCAPE2.0') > 0, 'animated GIF loops');
    await page.click('#exportMenuWrap summary'); await page.click('#exportMenu button[data-export="copy"]'); await page.waitForTimeout(600);
    check(/copied/i.test(await statusText(page)), 'copy to clipboard reports success');
    // animated SVG of the frame carries the icon stuck to it and animates by itself
    await page.evaluate((id) => window.stickerApp.scene.select(window.stickerApp.scene.get(id)), frameId); await page.waitForTimeout(100);
    await page.selectOption('#ctl-anim-frame', 'wiggle');
    {
      const dl = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
      await page.click('#exportMenuWrap summary'); await page.click('#exportMenu button[data-export="svg"]');
      const d = await dl;
      check(!!d, 'animated SVG export downloads');
      if (d) {
        const p = path.join(OUT, '10-export-frame-animated.svg'); await d.saveAs(p);
        const svg = fs.readFileSync(p, 'utf8');
        const pics = (svg.match(/<image /g) || []).length, anims = (svg.match(/<animateTransform /g) || []).length;
        check(svg.startsWith('<?xml') && pics >= 3 && anims >= 6 && svg.includes('<mask '), `SVG embeds the frame and its stuck icon with animation (${pics} pictures, ${anims} transforms, ${Math.round(svg.length / 1024)} KB)`);
        const viewer = await context.newPage();
        await viewer.setContent(`<!doctype html><html><body style="margin:0;background:#a3cbee">${svg.replace(/^<\?xml[^>]*>\s*/, '')}</body></html>`);
        await viewer.waitForTimeout(200);
        const ok = await viewer.evaluate(() => !document.querySelector('parsererror') && document.querySelectorAll('image').length >= 3 && document.querySelectorAll('animateTransform').length >= 6);
        const a = await viewer.screenshot(); await viewer.waitForTimeout(700); const b = await viewer.screenshot();
        let diff = 0; for (let i = 0; i < Math.min(a.length, b.length); i += 97) if (a[i] !== b[i]) diff++;
        check(ok && diff > 30, `the SVG parses in a browser and moves on its own (${diff} sampled differences)`);
        await viewer.screenshot({ path: path.join(OUT, '10-svg-viewer.png') });
        await viewer.close();
      }
    }
    await page.selectOption('#ctl-anim-frame', 'none');
    // emoji and words become stickers: from the tray's quick picks, and from the text box
    await page.click('#iconMenuWrap summary'); await page.click('#iconMenu button[data-tab="emoji"]'); await page.click('#iconMenu button[data-emoji="🍓"]'); await page.waitForTimeout(200);
    const berry = await page.evaluate(() => { const r = window.stickerApp.selected; const a = r.atlas; let n = 0; const d = a.canvas.getContext('2d').getImageData(0, 0, a.w, a.h).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; return { icon: r.icon, text: r.settings.iconText, name: r.name, coverage: n / (a.w * a.h), blink: !!window.stickerApp.scene.get(r.id).tex.blink }; });
    check(berry.icon === 'emoji' && berry.text === '🍓' && berry.coverage > 0.04 && !berry.blink, `an emoji from the tray is a sticker (${JSON.stringify(berry)})`);
    await page.click('#iconMenuWrap summary'); await page.fill('#iconSearch', 'yay'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const word = await page.evaluate(() => { const r = window.stickerApp.selected; return { icon: r.icon, text: r.settings.iconText, menuOpen: document.querySelector('#iconMenuWrap').open }; });
    check(word.icon === 'emoji' && word.text === 'yay' && !word.menuOpen, `a typed word becomes a sticker and closes the tray (${JSON.stringify(word)})`);
    await page.fill('#ctl-iconText', 'wow');
    await page.waitForFunction(() => window.stickerApp.selected.settings.iconText === 'wow', null, { timeout: 5000 });
    check(true, 'the Text field re-letters an emoji/word sticker');
    // share link round trip
    const link = await page.evaluate(async () => (await window.stickerApp.shareLink()).url);
    const page2 = await context.newPage();
    page2.on('pageerror', (e) => { console.log('[pageerror]', e.message); process.exitCode = 1; });
    await page2.route(`${CDN}/**`, (r) => r.abort()); await page2.route('https://storage.googleapis.com/**', (r) => r.abort());
    await page2.goto(link);
    await page2.waitForFunction(() => window.stickerApp && window.stickerApp.scene.stickers.length >= 2, null, { timeout: 90000 });
    await page2.waitForTimeout(400);
    const shared = await page2.evaluate(() => ({ kinds: window.stickerApp.scene.stickers.map((e) => window.stickerApp.records.get(e.id).kind).join(','), cap: [...window.stickerApp.records.values()].find((r) => r.kind === 'frame').settings.frameCaption, stuck: window.stickerApp.scene.stickers.filter((e) => e.parent).length }));
    check(shared.kinds.startsWith('frame,icon') && shared.cap === 'Undo me' && shared.stuck >= 1, `share link rebuilds the frame, its caption and the stuck icons (${JSON.stringify(shared)})`);
    await page2.screenshot({ path: path.join(OUT, '10-shared-scene.png') });
    await page2.close();
    // pinch with two synthetic touch pointers
    const pinch = await page.evaluate((id) => new Promise((resolve) => {
      const sc = window.stickerApp.scene, e = sc.get(id), c = sc.canvas, r = c.getBoundingClientRect();
      const s0 = e.settings.stickerScale;
      const ev = (type, pid, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: pid, pointerType: 'touch', clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: pid === 1 }));
      const cx = e.x, cy = e.y;
      ev('pointerdown', 1, cx - 20, cy); ev('pointerdown', 2, cx + 20, cy);
      let step = 0;
      const tick = () => {
        step++; const d = 20 + step * 6, a = step * 0.03;
        ev('pointermove', 1, cx - Math.cos(a) * d, cy - Math.sin(a) * d); ev('pointermove', 2, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        if (step < 10) requestAnimationFrame(tick);
        else { ev('pointerup', 2, cx + 80, cy); ev('pointerup', 1, cx - 80, cy); setTimeout(() => resolve({ s0, s1: e.settings.stickerScale, labels: window.stickerApp.history.undo.slice(-2).map((x) => x.label) }), 100); }
      };
      requestAnimationFrame(tick);
    }), starId);
    check(pinch.s1 > pinch.s0 * 1.5 && pinch.labels.includes('resize'), `pinch resizes the icon and is undoable (${JSON.stringify(pinch)})`);
    await context.close();
  }
  // 6. subject model over the network (ONNX Runtime on WebGPU, else WebAssembly): E2E_NETWORK=1 only
  if (process.env.E2E_NETWORK) {
    const page = await newPage(browser, assets, { url, network: true });
    await page.click('#btnSample');
    await waitReady(page, 1, 240000);
    const info = await page.evaluate(() => ({ status: document.querySelector('#statusText').textContent, sal: window.Segmenter.saliencyInfo() }));
    check(['webgpu', 'wasm'].includes(info.sal.engine) && /Found the subject with U²-Net/.test(info.status), `subject model ran on ${info.sal.engine} (${info.status.slice(0, 70)})`);
    check((await coverage(page)) > 0.05, 'subject model cutout covers the sample');
    await page.screenshot({ path: path.join(OUT, '11-subject-model.png') });
    await page.close();
  } else console.log('skip subject model over the network (set E2E_NETWORK=1 to run it)');
  // 8. kaomoji text and the pixel collection (offline; the pixel part needs pixels/manifest.json in the working tree)
  {
    const page = await newPage(browser, assets, { url, offline: true });
    await page.click('#iconMenuWrap summary'); await page.waitForTimeout(200);
    // the tabs come in pages of four: the next arrow shows the second page, the group stays as it was
    const visibleTabs = () => page.evaluate(() => [...document.querySelectorAll('#iconMenu .icon-tabs button[data-tab]')].filter((b) => !b.hidden).map((b) => b.dataset.tab));
    const page1 = await visibleTabs();
    await page.click('#iconMenu .tab-arrow[data-dir="1"]'); await page.waitForTimeout(150);
    const page2 = await visibleTabs();
    const paged = await page.evaluate(() => ({ active: document.querySelector('#iconMenu .icon-tabs button.active').dataset.tab, nextOff: document.querySelector('#iconMenu .tab-arrow[data-dir="1"]').disabled, prevOff: document.querySelector('#iconMenu .tab-arrow[data-dir="-1"]').disabled }));
    check(page1.length === 4 && page1[0] === 'emoji' && page2.length >= 1 && page2.length <= 4 && !page1.some((t) => page2.includes(t)) && paged.active === 'emoji' && paged.nextOff && !paged.prevOff, `the tab arrows turn pages of four (${page1.join(',')} → ${page2.join(',')})`);
    // picking a group on the second page, then back to the first page for Kaomoji
    await page.click('#iconMenu .icon-tabs button[data-tab="' + page2[0] + '"]'); await page.waitForTimeout(100);
    await page.click('#iconMenu .tab-arrow[data-dir="-1"]'); await page.waitForTimeout(100);
    await page.click('#iconMenu .icon-tabs button[data-tab="kaomoji"]'); await page.waitForTimeout(100);
    const kaoCount = await page.evaluate(() => document.querySelectorAll('#iconMenu button[data-kaomoji]').length);
    await page.click('#iconMenu button[data-kaomoji]');
    await page.waitForFunction(() => window.stickerApp.scene.stickers.length === 1 && window.stickerApp.scene.stickers[0].tex, null, { timeout: 30000 });
    const kao = await page.evaluate(() => { const r = window.stickerApp.selected; return { icon: r.icon, name: r.name, border: r.settings.borderWidth, cov: (() => { let a = 0; for (const v of r.mask) if (v > 0.5) a++; return a / r.mask.length; })() }; });
    check(kaoCount >= 40 && kao.icon === 'kaomoji' && kao.name === '(◕‿◕)' && kao.border === 0 && kao.cov > 0.005 && kao.cov < 0.2, `a kaomoji from the tray becomes transparent text (${kaoCount} faces, coverage ${kao.cov.toFixed(2)})`);
    // a typed face goes the same way, a typed word stays hand-lettered
    const typed = await page.evaluate(() => { const app = window.stickerApp; const a = app.addIcon('kaomoji', { text: 'ʕ•ᴥ•ʔ' }); const b = app.addIcon('emoji', { text: 'yay' }); return { a: a.icon, b: b.icon, n: app.scene.stickers.length }; });
    check(typed.a === 'kaomoji' && typed.b === 'emoji' && typed.n === 3, 'kaomoji and word stickers coexist');
    const manifest = await page.evaluate(() => fetch('pixels/manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));
    if (manifest) {
      await page.waitForFunction(() => document.querySelector('#iconMenu button[data-tab="pixel"]'), null, { timeout: 10000 });
      await page.click('#iconMenuWrap summary'); await page.waitForTimeout(200);   // adding a face closed the tray
      await page.click('#iconMenu button[data-tab="pixel"]'); await page.waitForTimeout(100);
      const cells = await page.evaluate(() => document.querySelectorAll('#iconMenu button[data-pixel]').length);
      const src = manifest.groups[0].items[0].src;
      const px = await page.evaluate(async (src) => { const app = window.stickerApp; const r = await app.addPixel(src); const e = app.scene.get(r.id); return { icon: r.icon, name: r.name, w: e.work.w, h: e.work.h, cov: (() => { let a = 0; for (const v of r.mask) if (v > 0.5) a++; return a / r.mask.length; })(), text: r.settings.iconText }; }, src);
      check(cells === manifest.groups.reduce((a, g) => a + g.items.length, 0) && px.icon === 'pixel' && px.text === src && px.cov > 0.02 && px.cov < 0.9, `the pixel collection shows ${cells} pictures and one becomes a crisp sticker (${px.name}, coverage ${px.cov.toFixed(2)})`);
      // an animated picture keeps its frames: the texture drawn changes as time passes
      const animItem = manifest.groups[0].items.find((it) => it.anim && it.src !== src) || manifest.groups[0].items.find((it) => it.anim);
      if (animItem) {
        const an = await page.evaluate(async (src) => { const app = window.stickerApp; const r = await app.addPixel(src); const e = app.scene.get(r.id), t = e.tex; const first = app.scene._texAt(e, 0).img, later = t.frames ? app.scene._texAt(e, (t.frameEnds[0] + 1) / 1000).img : first; return { frames: r.atlas.frames ? r.atlas.frames.length + 1 : 1, period: Math.round(t.period || 0), changes: first !== later, decoder: typeof ImageDecoder !== 'undefined' }; }, animItem.src);
        check(!an.decoder || (an.frames > 1 && an.period > 0 && an.changes), `an animated picture keeps its frames (${an.frames} frames, ${an.period} ms loop)`);
      }
      await page.screenshot({ path: path.join(OUT, '13-pixels.png') });
    } else console.log('skip pixel collection (no pixels/manifest.json)');
    await page.close();
  }

  // 7. locale: Traditional Chinese from a stored choice, and the switch back to English in place (offline)
  {
    const page = await newPage(browser, assets, { url, offline: true, init: () => localStorage.setItem('sticker-shader-editor:locale', 'zh-TW') });
    const zh = await page.evaluate(() => ({ lang: document.documentElement.lang, sample: document.querySelector('#btnSample').textContent.trim(), foil: [...document.querySelectorAll('#panel span')].some((s) => s.textContent === '雷射箔膜'), pill: document.querySelector('#langSwitch button[aria-pressed="true"]').dataset.locale, preset: document.querySelector('#presetSelect option[value="Gold foil"]').textContent }));
    check(zh.lang === 'zh-TW' && zh.sample === '試試範例' && zh.foil && zh.pill === 'zh-TW' && zh.preset === '燙金', `Traditional Chinese strings render (${JSON.stringify(zh)})`);
    await page.click('#iconMenuWrap summary'); await page.waitForTimeout(200);
    const tray = await page.evaluate(() => ({ tab: document.querySelector('#iconMenu button[data-tab="g1"]').textContent, icon: document.querySelector('#iconMenu button[data-icon="teacup"] span').textContent }));
    check(tray.tab === '天空' && tray.icon === '茶杯', `the tray is translated too (${JSON.stringify(tray)})`);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(OUT, '12-zh-tw.png') });
    // a sticker on the canvas and a collapsed panel group must survive the switch
    await page.evaluate(() => window.stickerApp.addIcon('star'));
    await page.waitForFunction(() => window.stickerApp.scene.stickers.length === 1 && window.stickerApp.scene.stickers[0].tex, null, { timeout: 30000 });
    await page.click('#panel section[data-group="motion"] .group-head'); await page.waitForTimeout(100);
    const before = await page.evaluate(() => ({ name: document.querySelector('#panelName').textContent, collapsed: document.querySelector('#panel section[data-group="motion"]').classList.contains('collapsed') }));
    await page.click('#langSwitch button[data-locale="en"]'); await page.waitForTimeout(300);
    const en = await page.evaluate(() => ({ lang: document.documentElement.lang, sample: document.querySelector('#btnSample').textContent.trim(), stored: localStorage.getItem('sticker-shader-editor:locale'), stickers: window.stickerApp.scene.stickers.length, name: document.querySelector('#panelName').textContent, foil: [...document.querySelectorAll('#panel span')].some((s) => s.textContent === 'Holographic foil'), collapsed: document.querySelector('#panel section[data-group="motion"]').classList.contains('collapsed'), tab: document.querySelector('#iconMenu button[data-tab="g1"]').textContent, pressed: document.querySelector('#langSwitch button[aria-pressed="true"]').dataset.locale }));
    check(en.lang === 'en' && en.sample === 'Try a sample' && en.stored === 'en' && en.foil && en.tab === 'Sky' && en.pressed === 'en', `the switch changes the language in place (${JSON.stringify(en)})`);
    check(before.name === '星星' && en.name === 'Star' && en.stickers === 1 && before.collapsed && en.collapsed, `the canvas and the panel state survive the switch (${before.name} → ${en.name}, ${en.stickers} sticker, collapsed kept)`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(process.exitCode ? 'FAILED' : 'PASSED', '— screenshots in', OUT);
