/* Starter scenes, undoable photo replacement and isolated material comparison. */
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
  await page.goto(url); await page.waitForFunction(() => window.stickerApp?.discovery);
  await page.evaluate(() => I18N.setLocale('en'));
  fs.mkdirSync(OUT, {recursive:true});
  const dialog = page.locator('#discoveryDialog');
  await page.locator('#btnStarters').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-starter]').length === 4);
  await page.screenshot({path:path.join(OUT, 'discovery-starters.png')});
  assert.equal(await page.evaluate(() => stickerApp.records.size), 0, 'browsing templates is read only');
  await page.locator('#closeDiscovery').click();
  const original = await page.evaluate(() => stickerApp.addIcon('heart').id);
  for (const name of ['pet','birthday','travel','collector']) {
    const before = await page.evaluate(() => stickerApp.history.undo.length);
    await page.evaluate(() => stickerApp.discovery.open('starters'));
    await page.locator(`[data-starter="${name}"]`).click();
    await page.waitForFunction(() => !document.querySelector('#discoveryDialog').open);
    await page.waitForFunction(() => document.activeElement?.id === 'btnReplacePhoto');
    const created = await page.evaluate(() => ({id:stickerApp.selected.id, photo:stickerApp.selected.frame.photoId, count:stickerApp.records.size, history:stickerApp.history.undo.length, children:stickerApp.scene.children(stickerApp.scene.selected).length}));
    assert.equal(created.count, 5); assert.equal(created.children, 2); assert.equal(created.history, before+1);
    assert(await page.evaluate(id => stickerApp.records.has(id), original));
    await page.evaluate(() => stickerApp.undo()); assert.equal(await page.evaluate(() => stickerApp.records.size), 1);
    await page.evaluate(() => stickerApp.redo());
    assert(await page.evaluate(s => stickerApp.records.get(s.photo).framedIn === s.id && stickerApp.records.get(s.id).frame.photoId === s.photo && stickerApp.scene.children(stickerApp.scene.get(s.id)).length === 2, created));
    await page.evaluate(() => stickerApp.undo());
  }
  await page.evaluate(() => stickerApp.discovery.open('starters')); await page.locator('[data-starter="pet"]').click();
  await page.waitForFunction(() => !document.querySelector('#discoveryDialog').open);
  const frame = await page.evaluate(() => stickerApp.selected.id);
  const frozen = () => page.evaluate(() => ({ settings:{...stickerApp.selected.settings}, version:stickerApp.selected.maskVersion, history:stickerApp.history.undo.length, count:stickerApp.records.size }));
  const before = await frozen();
  await page.evaluate(() => stickerApp.discovery.open('gallery'));
  await page.waitForFunction(() => document.querySelectorAll('[data-material-preview]').length === StickerUI.comparisonVariants().length);
  await page.screenshot({path:path.join(OUT,'discovery-materials.png')});
  const prints = await page.locator('[data-material-preview] canvas').evaluateAll(cs=>cs.map(c=>c.toDataURL()));
  assert(new Set(prints).size >= 7, 'material previews are distinct');
  await page.locator('[data-material-preview="glass"]').hover(); await page.waitForTimeout(300);
  assert.deepEqual(await frozen(), before, 'preview and hover do not mutate artwork or history');
  await page.locator('[data-material-preview="glass"]').click();
  assert.deepEqual(await frozen(), before, 'choosing a gallery tile previews before applying');
  assert.equal(await page.locator('#compareMaterial').inputValue(),'glass');
  await page.locator('#compareApply').click();
  assert.equal(await page.evaluate(()=>stickerApp.selected.settings.material),'glass');
  await page.evaluate(()=>stickerApp.undo());
  assert.deepEqual(await frozen(),before);
  const input = await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=60;c.getContext('2d').fillRect(0,0,80,60);return c.toDataURL().split(',')[1];});
  const oldPhoto = await page.evaluate(()=>stickerApp.selected.frame.photoId);
  const choose = page.waitForEvent('filechooser'); await page.locator('#btnReplacePhoto').click();
  await (await choose).setFiles({name:'my-photo.png',mimeType:'image/png',buffer:Buffer.from(input,'base64')});
  await page.waitForFunction(id=>stickerApp.selected?.id===id&&stickerApp.records.get(stickerApp.selected.frame.photoId)?.name==='my-photo.png',frame);
  assert.equal(await page.evaluate(()=>stickerApp.records.size),5,'replacement removes only the starter placeholder');
  await page.evaluate(()=>stickerApp.undo()); assert.equal(await page.evaluate(()=>stickerApp.selected.frame.photoId),oldPhoto);
  await page.evaluate(()=>stickerApp.redo()); assert.equal(await page.evaluate(()=>stickerApp.records.get(stickerApp.selected.frame.photoId).name),'my-photo.png');
  await page.evaluate(id=>stickerApp.lockObject(id),frame); assert(await page.locator('#btnCompareMaterials').isDisabled()); assert(await page.locator('#btnReplacePhoto').isDisabled());
  await page.evaluate(id=>stickerApp.lockObject(id),frame);
  for(const locale of ['en','zh-TW']) for(const width of [1440,390,320]) {
    await page.evaluate(l=>I18N.setLocale(l),locale); await page.setViewportSize({width,height:844});
    for(const mode of ['starters','materials']) {
      await page.evaluate(mode=>stickerApp.discovery.open(mode === 'materials' ? 'gallery' : mode),mode);
      await page.waitForFunction(count=>document.querySelectorAll('.discovery-tile').length===count,mode==='starters'?4:20,{timeout:5000});
      const b=await dialog.boundingBox();assert(b.x>=0&&b.x+b.width<=width+1&&b.y>=0&&b.y+b.height<=844);
      assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'no dialog overflow');
      if(width===390)await page.screenshot({path:path.join(OUT,`discovery-${mode}-${locale}-mobile.png`)});
      await page.locator('#closeDiscovery').click();
    }
  }
  await page.evaluate(()=>{stickerApp.discovery.open('starters');document.querySelector('#discoveryDialog').close();stickerApp.discovery.open('gallery');});
  await page.waitForFunction(()=>document.querySelectorAll('[data-material-preview]').length===StickerUI.comparisonVariants().length, null, {timeout:5000});
  await page.locator('#closeDiscovery').click();
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>stickerApp.discovery.open('gallery'));
  await page.waitForFunction(()=>document.querySelectorAll('[data-material-preview]').length===StickerUI.comparisonVariants().length);
  const glass=page.locator('[data-material-preview="glass"]');await glass.hover();
  const still=await glass.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(200);assert.equal(await glass.locator('canvas').evaluate(c=>c.toDataURL()),still);
  assert.equal(await page.evaluate(()=>stickerApp.renderer.gl.getError()),0);
  assert.deepEqual(errors,[]);console.log('PASS starter composition, preservation, undo/redo, isolated material previews, apply/undo, photo replacement, locks, localization and mobile/reduced-motion');
} finally { await browser?.close(); server.close(); }
