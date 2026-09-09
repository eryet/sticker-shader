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
  await page.evaluate(() => {
    I18N.setLocale('en');
    const a = stickerApp.addFrame({settings:{material:'metal', stickerScale:.7}});
    const b = stickerApp.addFrame({settings:{material:'paper', stickerScale:.7, anim:'none'}});
    const s = stickerApp.scene, e = s.get(b.id); e.x = s.stageW / 2; e.y = s.stageH * .43;
    const back = s.get(a.id); back.x=e.x-70; back.y=e.y+35;
    const icon = stickerApp.addIcon('star'); const child=s.get(icon.id); s.attach(child,e); child.offset={u:.35,v:-.3};
    s.select(e);
  });
  await page.waitForTimeout(700);
  const frozen = () => page.evaluate(() => ({ records:[...stickerApp.records].map(([id,r])=>({id,settings:{...r.settings},photo:r.frame?.photoId})), history:stickerApp.history.undo.length, selection:stickerApp.selected.id }));
  const original = await frozen(), dialog = page.locator('#materialCompare'), handle=page.locator('#compareHandle');
  await page.locator('#btnCompareMaterials').click(); await dialog.waitFor({state:'visible'});
  assert.equal(await page.locator('#compareMaterial').inputValue(),'glass');
  assert.deepEqual(await frozen(),original);
  const initial = await page.evaluate(()=>({time:stickerApp.scene.time,poses:stickerApp.scene.stickers.map(e=>[e.x,e.y,e.rotX,e.rotY,e.rotZ])}));
  await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(()=>({time:stickerApp.scene.time,poses:stickerApp.scene.stickers.map(e=>[e.x,e.y,e.rotX,e.rotY,e.rotZ])})),initial,'both views keep a stable pose');
  assert.equal(await page.evaluate(async()=>{
    const s=stickerApp.scene, render=s.render; let draws=0;
    s.render=function(...args){draws++;return render.apply(this,args);};
    await new Promise(r=>setTimeout(r,200));s.render=render;return draws;
  }),0,'an idle comparison does not continually redraw the scene');
  const pixels = await page.evaluate(()=>{
    const s=stickerApp.scene, gl=s.renderer.gl, w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    function render(split){s.comparison.split=split;s.render();const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
    const before=render(1),after=render(0),mixed=render(.5);let changed=0,mismatches=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++) {const i=(y*w+x)*4+c;if(before[i]!==after[i])changed++;if(mixed[i] !== (x<Math.round(w*.5)?before[i]:after[i]))mismatches++;}
    const exportA=s.snapshotCanvas({scale:.25}).toDataURL();s.comparison.after.material='metal';const exportB=s.snapshotCanvas({scale:.25}).toDataURL();s.comparison.after.material='glass';s.render();
    return {changed,mismatches,exportStable:exportA===exportB,scissor:gl.isEnabled(gl.SCISSOR_TEST),error:gl.getError()};
  });
  assert(pixels.changed>1000,'preview changes actual rendered material');assert.equal(pixels.mismatches,0,'each half exactly matches its own complete render');assert(pixels.exportStable);assert(!pixels.scissor);assert.equal(pixels.error,0);
  await handle.focus(); await page.keyboard.press('Home'); assert.equal(await handle.getAttribute('aria-valuenow'),'0');
  await page.keyboard.press('End');assert.equal(await handle.getAttribute('aria-valuenow'),'100');
  await page.keyboard.press('Shift+ArrowLeft');assert.equal(await handle.getAttribute('aria-valuenow'),'90');
  const surface=await page.locator('#compareSurface').boundingBox();
  await page.mouse.move(surface.x+surface.width*.9,surface.y+surface.height*.55);await page.mouse.down();await page.mouse.move(surface.x+surface.width*.24,surface.y+surface.height*.55,{steps:8});await page.mouse.up();
  assert.equal(await handle.getAttribute('aria-valuenow'),'24');
  await page.keyboard.press('Delete'); await page.keyboard.press('Control+z'); assert.deepEqual(await frozen(),original,'editor shortcuts cannot edit underneath comparison');
  await page.locator('#compareMaterial').selectOption('holographic');assert.deepEqual(await frozen(),original);
  await page.locator('#compareReset').click();
  await page.screenshot({path:path.join(OUT,'compare-desktop.png')});
  await page.keyboard.press('Escape'); assert(!await dialog.isVisible()); assert.deepEqual(await frozen(),original);assert.equal(await page.evaluate(()=>stickerApp.scene.comparison),null);
  await page.locator('#btnCompareMaterials').click();await page.locator('#compareMaterial').selectOption('metal');await page.locator('#compareApply').click();
  assert.equal(await page.evaluate(()=>stickerApp.selected.settings.material),'metal');assert.equal(await page.evaluate(()=>stickerApp.history.undo.length),original.history+1);
  await page.evaluate(()=>stickerApp.undo());assert.deepEqual(await frozen(),original);
  await page.evaluate(()=>stickerApp.discovery.open('materials'));await page.locator('#compareBrowse').click();
  await page.locator('[data-material-preview="resin"]').click();assert(await dialog.isVisible());assert.equal(await page.locator('#compareMaterial').inputValue(),'resin');assert.deepEqual(await frozen(),original);await page.locator('#compareCancel').click();
  assert(await page.locator('#btnCompareMaterials').evaluate(el=>el===document.activeElement),'closing a gallery preview restores editor focus');
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});await page.evaluate(()=>I18N.setLocale('zh-TW'));
    await page.locator('#btnCompareMaterials').click();
    const b=await dialog.boundingBox();assert(b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=844);
    assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth));assert.equal(await page.locator('#compareTitle').innerText(),'比較材質');
    const cdp=await page.context().newCDPSession(page), r=await page.locator('#compareSurface').boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.5,y:r.y+r.height*.6}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*.75,y:r.y+r.height*.6}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    assert.equal(await handle.getAttribute('aria-valuenow'),'75');
    await page.emulateMedia({reducedMotion:'reduce'});await page.screenshot({path:path.join(OUT,`compare-zh-${width}.png`)});
    await page.locator('#compareCancel').click();
  }
  assert.deepEqual(await frozen(),original);
  assert.deepEqual(errors,[]);console.log('PASS canvas pixel split/transparency, preview isolation, exports, frozen pose, pointer/keyboard/touch, apply/undo/cancel, gallery, localization and mobile');
} finally { await browser?.close(); server.close(); }
