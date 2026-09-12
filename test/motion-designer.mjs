/* Authored motion: transactions, time sampling, groups and real editor controls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'test/.out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' }), errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR', e.message); });
  await page.route('https://**', r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.stickerApp);
  const ids = await page.evaluate(() => {
    const settings = { anim: 'none', idleSway: 0, hoverTilt: 0, surfaceEffect: 'none', workingRes: '512', baseRotation: 0 };
    const frame = stickerApp.addFrame({ settings: { ...settings, stickerScale: .55, frameDecor: 'none' } });
    const icon = stickerApp.addIcon('star', { settings: { ...settings, stickerScale: .18, iconBlink: false } });
    const nested = stickerApp.addIcon('heart', { settings: { ...settings, stickerScale: .09, iconBlink: false } });
    const other = stickerApp.addIcon('cloud', { settings: { ...settings, stickerScale: .18, iconStick: false } });
    return { frame: frame.id, icon: icon.id, nested: nested.id, other: other.id };
  });
  await page.waitForFunction(ids => Object.values(ids).every(id => stickerApp.scene.get(id)?.tex), ids);
  await page.evaluate(ids => {
    const sc = stickerApp.scene, root = sc.get(ids.frame); sc.time += 5;
    for (const e of sc.stickers) e.spawn = 0;
    root.x = root.restX = 490; root.y = root.restY = 390;
    sc.attach(sc.get(ids.icon), root); sc.get(ids.icon).offset = { u: .18, v: -.17 };
    sc.attach(sc.get(ids.nested), sc.get(ids.icon)); sc.get(ids.nested).offset = { u: .3, v: .2 };
    const other = sc.get(ids.other); sc.detach(other); other.x = other.restX = 90; other.y = other.restY = 150;
    sc.select(root); sc.render();
  }, ids);
  const group = page.locator('[data-group="motion"]');
  if (await group.evaluate(el => el.classList.contains('collapsed'))) await group.locator('.group-head').click();
  await page.locator('#btnDesignMotion').click();
  await page.locator('[data-endpoint="end"]').click();
  await page.screenshot({ path: path.join(OUT, 'motion-desktop.png') });
  assert(await page.locator('#motionDesigner').isVisible());
  assert.equal(await page.locator('.motion-grip:visible').count(), 3);
  const initialHistory = await page.evaluate(() => stickerApp.history.undo.length);
  await page.locator('#motion-x').fill('30'); await page.locator('#motion-x').press('Tab');
  assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clip.end.x), .3);
  await page.locator('#motion-duration').fill('3'); await page.locator('#motion-duration').press('Tab');
  await page.locator('#motionUndo').click();
  assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clip.duration), 4);
  await page.locator('#motionRedo').click();
  assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clip.duration), 3);
  assert.equal(await page.evaluate(() => stickerApp.history.undo.length), initialHistory);
  await page.locator('#motionApply').click();
  assert.equal(await page.evaluate(() => stickerApp.history.undo.length), initialHistory + 1);
  assert.equal(await page.evaluate(() => stickerApp.selected.motionClip.end.x), .3);
  await page.evaluate(() => stickerApp.undo());
  assert.equal(await page.evaluate(() => stickerApp.selected.motionClip), null);
  await page.evaluate(() => stickerApp.redo());
  assert.equal(await page.evaluate(() => stickerApp.selected.motionClip.duration), 3);
  console.log('PASS authoring controls, draft undo/redo, single Apply transaction');
  await page.evaluate(() => { stickerApp.scene.stop(); stickerApp.scene.render(); });
  const beforeCancel = await page.evaluate(() => ({ clip: stickerApp.selected.motionClip, clock: stickerApp.scene.selected.motionClock, history: stickerApp.history.undo.length }));
  await page.locator('#btnDesignMotion').click();
  assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clock.playing), false, 'existing motion opens paused');
  await page.locator('[data-endpoint="end"]').click(); await page.evaluate(() => stickerApp.scene.render());
  const grip = page.locator('.motion-grip.move'), box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 4 }); await page.mouse.up();
  assert(await page.evaluate(() => stickerApp.motionDesigner.draft.clip.end.x > .4));
  await page.locator('.motion-grip.rotate').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clip.end.rotation), 1);
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(() => ({ clip: stickerApp.selected.motionClip, clock: stickerApp.scene.selected.motionClock, history: stickerApp.history.undo.length })), beforeCancel);
  console.log('PASS direct drag, keyboard rotation, paused reopen and exact Cancel restoration');
  const math = await page.evaluate(ids => {
    const sc = stickerApp.scene, root = sc.get(ids.frame), clip = StickerMotion.recipe('float');
    clip.start.opacity = .4; clip.end.opacity = .7; clip.light = 'orbit';
    stickerApp.setMotionClip(stickerApp.records.get(root.id), clip);
    const group = sc.motionGroup(root, 1.2), out = {};
    out.opacities = [...group.values()].map(f => f.pose.opacity);
    out.owners = [root, sc.get(ids.icon), sc.get(ids.nested)].map(e => sc.motionOwner(e).id);
    out.independent = !sc.motionOwner(sc.get(ids.other));
    const a = group.get(root).pose, b = group.get(sc.get(ids.icon)).pose;
    out.distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const size = sc.size(root); out.expectedDistance = Math.hypot(.18 * size.w, .17 * size.h) * a.scale;
    const first = JSON.stringify([...sc.motionGroup(root, 3).values()].map(f => f.pose)); sc.motionGroup(root, 1);
    out.seek = first === JSON.stringify([...sc.motionGroup(root, 3).values()].map(f => f.pose));
    out.rates = [30, 60, 120].map(hz => { sc.resetMotion(root, true); for (let i = 0; i < hz * 2; i++) sc.advanceMotion(1 / hz); return root.motionClock.time; });
    sc.resetMotion(root, true); sc.advanceMotion(2); out.skipped = root.motionClock.time;
    root.motionClock.playing = false; sc.advanceMotion(5); out.paused = root.motionClock.time;
    const before = root.motionClock.time; sc.comparison = {}; root.motionClock.playing = true; sc.advanceMotion(1); sc.comparison = null; out.compareFrozen = root.motionClock.time === before;
    root.motionClock.time = 1.2; root.motionClock.playing = false; root.motionClock.neutral = false; sc.render();
    out.hit = sc.localPoint(root, sc.stageW / 2 + a.x, sc.stageH / 2 - a.y).u;
    return out;
  }, ids);
  assert(math.seek && math.independent && math.compareFrozen); math.rates.forEach(t => assert(Math.abs(t - 2) < 1e-8)); assert.equal(math.skipped, 2); assert.equal(math.paused, 2);
  math.opacities.forEach(a => assert(Math.abs(a - math.opacities[0]) < 1e-8, 'parent opacity applied once'));
  assert(Math.abs(math.distance - math.expectedDistance) < .001); assert(math.owners.every(id => id === ids.frame)); assert(Math.abs(math.hit - .5) < .02);
  console.log('PASS nested rigid transforms, opacity once, projected picking, frame-rate independence, pause and comparison freeze');
  const output = await page.evaluate(async ids => {
    const { scene: sc, renderer } = stickerApp, root = sc.get(ids.frame), rec = stickerApp.records.get(root.id);
    const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const equal = (a, b) => a.every((v, i) => v === b[i]);
    const result = { loops: [], decoded: [], clipping: [] };
    for (const [id] of StickerMotion.RECIPES) {
      const clip = StickerMotion.recipe(id); clip.duration = 1;
      stickerApp.setMotionClip(rec, clip);
      const bounds = sc.motionBounds(root, clip), opts = { size: 96, clip, bounds };
      const first = pixels(sc.renderMotionFrame(root, 0, opts)), last = pixels(sc.renderMotionFrame(root, 1, opts));
      result.loops.push(equal(first, last));
      const mid = pixels(sc.renderMotionFrame(root, .4, opts)); sc.renderMotionFrame(root, .1, opts); result.loops.push(equal(mid, pixels(sc.renderMotionFrame(root, .4, opts))));
      let edge = 0, coverage = 0;
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) { const alpha = mid[(y * 96 + x) * 4 + 3]; if (alpha > 32) coverage++; if (x < 2 || y < 2 || x > 93 || y > 93) edge = Math.max(edge, alpha); }
      result.clipping.push({ edge, coverage });
    }
    stickerApp.setMotionClip(rec, { ...StickerMotion.recipe('slide'), mode: 'once', duration: 1 });
    const cycle = sc.animationFrames(root, { size: 96, fps: 25, lazy: true });
    const expected = Array.from(cycle.frames, frame => pixels(frame).slice());
    const apng = await StickerAnim.encodeAPNG(cycle.frames, cycle.fps, { loop: cycle.loop });
    const gif = StickerAnim.encodeGIF(cycle.frames, cycle.fps, { highQuality: true, loop: cycle.loop });
    const apngBytes = new Uint8Array(await apng.arrayBuffer()), gifBytes = new Uint8Array(await gif.arrayBuffer());
    result.once = !new TextDecoder().decode(gifBytes).includes('NETSCAPE2.0');
    const control = new TextDecoder('latin1').decode(apngBytes).indexOf('acTL');
    result.apngPlays = new DataView(apngBytes.buffer).getUint32(control + 8);
    const svg = StickerAnim.encodeFrameSVG(cycle.frames, cycle.seconds, { loop: false }); result.svgOnce = svg.includes('repeatCount="1" fill="freeze"') && !svg.includes('indefinite');
    for (const blob of [apng, gif]) {
      const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type === 'image/apng' ? 'image/png' : blob.type }); await decoder.tracks.ready;
      const check = { count: decoder.tracks.selectedTrack.frameCount, durations: [], errors: [] };
      for (const index of [0, 10, 24]) {
        const { image } = await decoder.decode({ frameIndex: index }); check.durations.push(image.duration);
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96; canvas.getContext('2d').drawImage(image, 0, 0); image.close();
        const rgba = pixels(canvas), source = expected[index]; let error = 0, count = 0;
        for (let i = 0; i < rgba.length; i += 4) if (source[i + 3] > 240) { for (let k = 0; k < 3; k++) error += Math.abs(source[i + k] - rgba[i + k]); count += 3; }
        check.errors.push(error / Math.max(1, count));
      }
      decoder.close(); result.decoded.push(check);
    }
    const frozen = sc.animationFrames(root, { size: 64, fps: 4, lazy: true });
    const before = Array.from(frozen.frames, f => Array.from(pixels(f)));
    root.x += 100; root.settings.baseRotation += 45;
    const after = Array.from(frozen.frames, f => Array.from(pixels(f))); result.frozen = before.every((f, i) => equal(f, after[i]));
    root.x -= 100; root.settings.baseRotation -= 45;
    const previousView = renderer.view; let threw = false;
    try { renderer.renderToCanvas({ width: 8, height: 8, draw: () => { throw new Error('test failure'); } }); } catch { threw = true; }
    result.cleanup = threw && renderer.view === previousView && !renderer.gl.getParameter(renderer.gl.FRAMEBUFFER_BINDING); sc.render();
    return result;
  }, ids);
  assert(output.loops.every(Boolean), 'pixel-identical loop seams and arbitrary seeking');
  for (const { edge, coverage } of output.clipping) { assert.equal(edge, 0); assert(coverage > 100); }
  assert(output.once && output.svgOnce && output.frozen && output.cleanup); assert.equal(output.apngPlays, 1);
  for (const result of output.decoded) { assert.equal(result.count, 25); result.durations.forEach(d => assert.equal(d, 40000)); result.errors.forEach(e => assert(e < 14, `decoded color error ${e}`)); }
  console.log('PASS all recipe pixels/seams, fixed export bounds, decoded GIF/APNG frames + timing, Once metadata, SVG freeze, immutable lazy export and render failure cleanup');
  const lifecycle = await page.evaluate(async ids => {
    const app = stickerApp, sc = app.scene, root = sc.get(ids.frame), source = app.records.get(ids.frame);
    sc.select(root); const initial = JSON.stringify(source.motionClip), history = app.history.undo.length;
    const copy = app.duplicateSelected(), copied = sc.get(copy.id), members = sc._assemblyMembers(copied);
    const data = app.serializeScene();
    const result = { copied: JSON.stringify(copy.motionClip) === initial, count: members.length, history: app.history.undo.length - history,
      clipInLink: data.items.some(it => it.m?.v === 1) };
    copy.motionClip.start.x = 1.1; result.independent = JSON.stringify(source.motionClip) === initial; copy.motionClip.start.x = source.motionClip.start.x;
    const link = await app.shareLink(), beforeIds = new Set(sc.stickers.map(e => e.id));
    await app.loadSharedScene(link.url.slice(link.url.indexOf('#')));
    const restored = sc.stickers.find(e => !beforeIds.has(e.id) && e.layer === 0 && e.motionClip);
    result.roundtrip = JSON.stringify(restored.motionClip) === initial && sc._assemblyMembers(restored).length === 3;
    sc.select(root);
    const oldAnim = source.settings.anim; app.setMotionClip(source, { ...source.motionClip, enabled: false }); result.disabled = !sc.motionOwner(root) && source.settings.anim === oldAnim;
    app.undo(); result.enabled = sc.motionOwner(root) === root;
    app.setMotionClip(source, { ...source.motionClip, duration: 1, mode: 'once' });
    sc.resetMotion(root, false); sc.render();
    const before = JSON.stringify(root.motionClock), background = sc.background.slice(); sc.start();
    const blob = await sc.record(1, '#bad9f4'); sc.stop();
    result.recording = blob.size > 100 && blob.type.startsWith('video/') && !sc.motionRecording && JSON.stringify(root.motionClock) === before && JSON.stringify(sc.background) === JSON.stringify(background) && sc.selected === root;
    result.recordDetails = { size: blob.size, type: blob.type, before, after: JSON.stringify(root.motionClock), bg: sc.background, background, selected: sc.selected?.id, root: root.id };
    const Original = window.MediaRecorder;
    window.MediaRecorder = class { static isTypeSupported() { return true; } constructor() { throw new Error('test recorder setup failure'); } };
    try { await sc.record(1, '#fff'); result.failure = false; } catch { result.failure = !sc.motionRecording && sc.selected === root && JSON.stringify(root.motionClock) === before; } finally { window.MediaRecorder = Original; }
    const hidden = sc.record(1, '#fff'); Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    try { await hidden; result.hidden = false; } catch { result.hidden = !sc.motionRecording && JSON.stringify(root.motionClock) === before; } finally { delete document.hidden; }
    return result;
  }, ids);
  assert(lifecycle.copied && lifecycle.independent && lifecycle.clipInLink && lifecycle.roundtrip && lifecycle.disabled && lifecycle.enabled);
  assert.equal(lifecycle.count, 3); assert.equal(lifecycle.history, 1);
  assert(lifecycle.recording && lifecycle.failure && lifecycle.hidden, JSON.stringify(lifecycle));
  console.log('PASS deep duplication, nested share round trip, original-motion toggle, video capture, recorder failure + hidden-tab cleanup');
  // Use the actual export menu, including its asynchronous download click.
  const download = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('#exportMenuWrap > summary').click();
  await page.locator('[data-export="apng"]').click();
  const artifact = await download; assert(artifact.suggestedFilename().endsWith('-animated.png'));
  assert.equal(await page.evaluate(() => stickerApp.scene.motionExporting), false);
  console.log('PASS real export menu download');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.motionCopiedSettings = text; } } }));
  await page.locator('#btnCopySettings').click(); await page.waitForFunction(() => window.motionCopiedSettings);
  const copyPaste = await page.evaluate(ids => {
    const app = stickerApp, target = app.records.get(ids.other), copied = JSON.parse(window.motionCopiedSettings);
    app.scene.select(app.scene.get(target.id)); const before = app.history.undo.length;
    const prompt = window.prompt; window.prompt = () => window.motionCopiedSettings;
    try { document.getElementById('btnPasteSettings').click(); } finally { window.prompt = prompt; delete navigator.clipboard; }
    const result = { pasted: JSON.stringify(target.motionClip) === JSON.stringify(copied.motionClip), pasteUndo: app.history.undo.length - before };
    const h = app.history.undo.length; document.getElementById('btnResetSettings').click(); result.cleared = target.motionClip === null; result.resetUndo = app.history.undo.length - h;
    app.undo(); result.restored = JSON.stringify(target.motionClip) === JSON.stringify(copied.motionClip);
    const fresh = app.addIcon('bow'); result.newImport = !fresh.motionClip; app.undo();
    app.scene.select(app.scene.get(ids.frame));
    return result;
  }, ids);
  assert(copyPaste.pasted && copyPaste.cleared && copyPaste.restored && copyPaste.newImport); assert.equal(copyPaste.pasteUndo, 1); assert.equal(copyPaste.resetUndo, 1);
  await page.locator('#layersTab').click(); await page.locator('#motionTransportEdit').click();
  assert.equal(await page.locator('#propertiesTab').getAttribute('aria-selected'), 'true'); await page.locator('#motionCancel').click();
  assert.equal(await page.locator('#layersTab').getAttribute('aria-selected'), 'true'); await page.locator('#propertiesTab').click();
  console.log('PASS settings copy/paste/reset transactions, fresh imports and opening from Layers');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { I18N.setLocale('zh-TW'); stickerApp.motionDesigner.open(); });
  assert.equal(await page.locator('#motionTitle').textContent(), '動態設計');
  assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clock.playing), false);
  await page.locator('[data-recipe="float"]').click(); assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clock.playing), false);
  await page.locator('#motionPlay').click(); assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clock.playing), true, 'explicit play permits reduced-motion preview');
  await page.locator('[data-endpoint="start"]').click();
  await page.evaluate(() => stickerApp.scene.render());
  await page.screenshot({ path: path.join(OUT, 'motion-zh.png') });
  await page.evaluate(() => stickerApp.motionDesigner.cancel());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => stickerApp.motionDesigner.open());
  await page.locator('[data-endpoint="end"]').click(); await page.evaluate(() => stickerApp.scene.render());
  await page.screenshot({ path: path.join(OUT, 'motion-mobile.png') });
  const layout = await page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect(), pane = document.querySelector('.panel-wrap').getBoundingClientRect(), bar = document.getElementById('motionTransport').getBoundingClientRect();
    return { stageBottom: stage.bottom, paneTop: pane.top, paneBottom: pane.bottom, width: document.documentElement.scrollWidth, barBottom: bar.bottom, barRight: bar.right, apply: document.getElementById('motionApply').getBoundingClientRect().bottom };
  });
  assert(layout.stageBottom <= layout.paneTop + 3 && layout.barBottom < layout.paneTop && layout.barRight <= 390 && layout.width <= 390 && layout.paneBottom <= 845 && layout.apply <= 844, JSON.stringify(layout));
  await page.locator('.motion-grip.scale').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clip.end.scale), 1.01);
  const touch = await page.context().newCDPSession(page), handle = await page.locator('.motion-grip.move').boundingBox(), touchStart = await page.evaluate(() => stickerApp.motionDesigner.draft.clip.end.x);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: handle.x + handle.width / 2 + 24, y: handle.y + handle.height / 2 }] });
  assert(await page.evaluate(x => stickerApp.motionDesigner.draft.clip.end.x > x, touchStart));
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await touch.detach();
  assert.equal(await page.evaluate(() => stickerApp.motionDesigner.draft.clip.end.x), touchStart, 'touch cancellation restores draft pose');
  await page.locator('#motionCancel').click(); assert.equal(await page.evaluate(() => !!stickerApp.scene.motionEditing), false);
  console.log('PASS Traditional Chinese, reduced-motion playback, mobile preview + bottom sheet and accessible handles');
  assert.deepEqual(errors, []);
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
