import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SHAKER_TEST_OUTPUT || path.join(ROOT, 'test/.out');
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
  browser = await chromium.launch({headless:true, args:['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**', route => route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sticker-shader-editor:locale','en'); } catch {} });
  const base = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(base);
  await page.waitForFunction(() => window.stickerApp && document.querySelector('[data-tab="piknik"]'));
  await page.locator('#iconMenuWrap summary').click();
  await page.locator('#btnShaker').click();
  await page.evaluate(() => stickerApp.scene.stop());
  await page.locator('[data-shaker-collection="taiwan"]').click();
  await page.locator('[data-design="tw-pineapple"]').click();
  const slider = async (id, value) => page.locator('#'+id).evaluate((el,value) => {el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},String(value));
  await slider('shakerPieceSize',8);
  await page.evaluate(() => { for(let i=0;i<12;i++) stickerApp.addIcon(['heart','star','flower'][i%3]); });
  const measure = () => page.evaluate(() => {
    const a=stickerApp,e=a.scene.get(a.selected.id);
    return {scale:e.settings.stickerScale,ref:e.settings.shakerContentScale,count:e.shaker.bodies.length,limit:StickerShaker.capacity(e.settings),
      shell:a.scene.size(e).h,pieces:e.shaker.bodies.map(b=>b.size*e.work.w*e.s/100),fitted:e.shaker.fitted};
  });
  const close = (actual,expected,label) => { assert.equal(actual.length,expected.length,label);actual.forEach((n,i)=>assert(Math.abs(n-expected[i])<.001,`${label}: ${n} vs ${expected[i]}`)); };
  const before = await measure();
  assert.equal(before.limit,12);assert.equal(before.count,12);assert.equal(before.ref,.8);
  assert(await page.locator('#shakerAdd').isDisabled());
  const preview = () => page.evaluate(() => {
    const a=stickerApp,e=a.scene.get(a.selected.id);
    return a.scene.snapshot(e,{scale:e.s}).toDataURL();
  });
  const beforePng = await preview();
  await slider('shakerSize',1.4);
  const grown = await measure(), grownPng = await preview();
  assert(Math.abs(grown.shell/before.shell-1.75)<.001);
  close(grown.pieces,before.pieces,'growing the shell keeps the icons at their original on-screen size');
  assert.equal(grown.limit,36);assert(await page.locator('#shakerAdd').isEnabled());
  assert.match(await page.locator('#shakerCount').textContent(),/12 \/ 36/);
  await page.evaluate(()=>stickerApp.undo());close((await measure()).pieces,before.pieces,'undo preserves icon size');assert.equal((await measure()).scale,.8);
  await page.evaluate(()=>stickerApp.redo());close((await measure()).pieces,before.pieces,'redo preserves icon size');
  await page.evaluate(()=>stickerApp.addIcon('heart'));
  assert.equal((await measure()).count,13,'a larger shell accepts more than 12 pieces');
  assert(Math.abs((await measure()).pieces[12]-before.pieces[0])<.001,'new icons use the same size as existing icons');
  const thirteen = await measure();
  const shrinkHistory=await page.evaluate(()=>stickerApp.history.undo.length);
  await slider('shakerSize',.3);
  assert.equal((await measure()).count,13,'shrinking does not discard contents');
  assert.equal((await measure()).scale,1.4,'an impossible shrink is rejected');
  assert.equal(await page.evaluate(()=>stickerApp.history.undo.length),shrinkHistory);
  assert.match(await page.locator('#shakerSpaceHint').textContent(),/More room/);
  close((await measure()).pieces,thirteen.pieces,'a rejected shrink preserves icon sizes');

  // Real wheel and keyboard-handle resizing use the same independent sizing rule.
  const point=await page.evaluate(()=>{const a=stickerApp,e=a.scene.get(a.selected.id);e.rotX=e.rotY=e.rotZ=0;e.settings.baseRotation=0;e.x=e.restX=a.scene.stageW/2;e.y=e.restY=a.scene.stageH/2;const box=document.querySelector('#glCanvas').getBoundingClientRect();a.scene.render();return{x:box.x+e.x,y:box.y+e.y};});
  await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-120);
  await page.waitForFunction(()=>stickerApp.selected.settings.stickerScale>1.4);
  close((await measure()).pieces,thirteen.pieces,'wheel keeps icon size');
  await page.evaluate(()=>stickerApp.undo());
  await page.locator('#showResizeHandles').check();
  await page.locator('.resize-handle[data-corner="2"]').focus();await page.keyboard.press('ArrowUp');
  assert((await measure()).scale>1.4);close((await measure()).pieces,thirteen.pieces,'resize handle keeps icon size');
  await page.evaluate(()=>stickerApp.undo());
  const resize=await page.evaluate(()=>{const a=stickerApp,e=a.scene.get(a.selected.id),s=a.scene.captureResize(e);a.scene.scaleFrom(s,1.6);a.scene.onResize(s,'pinch');return e.settings.stickerScale;});
  assert.equal(resize,1.6);close((await measure()).pieces,thirteen.pieces,'pinch scaling keeps icon size');
  await page.evaluate(()=>stickerApp.undo());
  await slider('shakerPieceSize',10);
  const enlargedPieces=await measure();assert(Math.abs(enlargedPieces.pieces[0]/thirteen.pieces[0]-10/8)<.001);
  await page.locator('.shaker-piece').first().click();await slider('shakerSelectedSize',.7);
  const smallPiece=await measure();assert(Math.abs(smallPiece.pieces[0]/enlargedPieces.pieces[0]-.7)<.001);close(smallPiece.pieces.slice(1),enlargedPieces.pieces.slice(1),'other pieces keep their size');
  await page.evaluate(()=>{stickerApp.undo();stickerApp.undo();});

  const shared=await page.evaluate(async()=>{
    const a=stickerApp,r=a.selected,e=a.scene.get(r.id),dup=a.duplicateSelected();
    const duplicated=dup.shakerItems.length===13&&dup.settings.shakerContentScale===.8;
    a.undo();a.scene.select(e);
    const frames=a.scene.animationFrames(e,{size:96,fps:2,tilt:false});
    const gif=StickerAnim.encodeGIF(frames.frames,frames.fps),apng=await StickerAnim.encodeAPNG(frames.frames,frames.fps);
    return {...await a.shareLink(),duplicated,gif:gif.size,apng:apng.size,exportCount:e.shakerExport.items.length,exportSizes:e.shakerExport.bodies.map(b=>b.size)};
  });
  assert(shared.duplicated&&shared.gif>100&&shared.apng>100);assert.equal(shared.exportCount,13);
  await page.goto('about:blank');await page.goto(shared.url);
  await page.waitForFunction(()=>window.stickerApp&&stickerApp.scene.stickers.some(e=>e.shaker));
  await page.evaluate(()=>{stickerApp.scene.stop();stickerApp.scene.select(stickerApp.scene.stickers.find(e=>e.shaker));});
  assert.equal((await measure()).count,13,'sharing keeps pieces beyond the old 12-piece limit');
  close((await measure()).pieces,thirteen.pieces,'share reload preserves independent size');
  close(await page.evaluate(()=>stickerApp.scene.get(stickerApp.selected.id).shaker.bodies.map(b=>b.size)),shared.exportSizes,'animation uses the live icon size');
  await page.evaluate(()=>{window.capacityOldAtlas=stickerApp.selected.atlas;stickerApp.composeRecord(stickerApp.selected);});
  await page.waitForFunction(()=>stickerApp.selected.atlas!==window.capacityOldAtlas);
  close((await measure()).pieces,thirteen.pieces,'worker composition preserves icon size');

  // Maximum-size scenes still retain every piece through shrinking, serialization and reload.
  const maxed=await page.evaluate(async()=>{
    const a=stickerApp,r=a.selected;
    const big=a.addIcon('shaker',{quiet:true,settings:{...r.settings,stickerScale:2.5},shakerItems:Array.from({length:48},(_,i)=>({...r.shakerItems[i%r.shakerItems.length]}))});
    const e=a.scene.get(big.id);a.scene.select(e);
    const length=big.shakerItems.length,cap=StickerShaker.capacity(big.settings),undo=a.history.undo.length;a.addIcon('star');
    const bounded=[];const times=[];const tex=e.tex.img;
    for(let i=0;i<180;i++){const t=performance.now();e.x=e.restX+Math.sin(i/7)*22;a.scene._updateShaker(e,1/60);times.push(performance.now()-t);bounded.push(e.shaker.bodies.every(b=>StickerShaker.contact(e.shaker,b).d>=-.05));}
    times.sort((a,b)=>a-b);
    return {length,cap,blocked:big.shakerItems.length===48&&a.history.undo.length===undo,bounded:bounded.every(Boolean),reuse:tex===e.tex.img,p95:times[171]};
  });
  assert(maxed.length===48&&maxed.cap===48&&maxed.blocked&&maxed.bounded&&maxed.reuse,JSON.stringify(maxed));
  console.log('48-piece live shaker',JSON.stringify(maxed));
  await slider('shakerSize',.8);assert.equal((await measure()).count,48);
  const fullUrl=await page.evaluate(async()=>(await stickerApp.shareLink()).url);
  await page.goto('about:blank');await page.goto(fullUrl);
  await page.waitForFunction(()=>window.stickerApp&&stickerApp.scene.stickers.some(e=>e.shaker?.bodies.length===48));
  await page.evaluate(()=>{stickerApp.scene.stop();stickerApp.scene.select(stickerApp.scene.stickers.find(e=>e.shaker?.bodies.length===48));});
  assert.equal((await measure()).count,48);assert(await page.locator('#shakerAdd').isDisabled());
  await page.evaluate(()=>I18N.setLocale('zh-TW'));
  assert.match(await page.locator('#shakerSpaceHint').textContent(),/48/);
  await page.setViewportSize({width:390,height:844});await page.locator('#shakerSize').scrollIntoViewIfNeeded();
  await slider('shakerSize',1.6);assert.equal((await measure()).limit,48);assert.equal((await measure()).count,48);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

  // A legacy share has no content-scale anchor. Preserve its original visual proportions.
  const legacy=structuredClone(shared.data);legacy.items=legacy.items.slice(0,1);legacy.items[0].s.stickerScale=1.41;delete legacy.items[0].s.shakerContentScale;legacy.items[0].q=legacy.items[0].q.slice(0,3);
  await page.setViewportSize({width:1440,height:1000});await page.goto('about:blank');await page.goto(base+'#s=j'+Buffer.from(JSON.stringify(legacy)).toString('base64url'));
  await page.waitForFunction(()=>window.stickerApp&&stickerApp.scene.stickers.some(e=>e.shaker));
  await page.evaluate(()=>{stickerApp.scene.stop();stickerApp.scene.select(stickerApp.scene.stickers.find(e=>e.shaker));});
  const old=await measure();assert.equal(old.ref,1.41);
  close(await page.evaluate(()=>stickerApp.scene.get(stickerApp.selected.id).shaker.bodies.map(b=>b.size)),[8,8,8],'legacy proportions stay unchanged');
  await slider('shakerSize',1.8);close((await measure()).pieces,old.pieces,'legacy shaker gains independent sizing');
  fs.mkdirSync(OUT,{recursive:true});
  const gallery=await browser.newPage({viewport:{width:1800,height:1060}});
  await gallery.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;padding:30px;background:#fff3f6;color:#795b62;font:18px system-ui}h1{margin:0 0 8px;font-size:30px}p{margin:0 0 24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{height:910px;border:1px solid #f2c7d6;border-radius:24px;background:#fffdf7;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:22px;gap:12px}img{display:block}h2{margin:0;font-size:22px}</style><h1>More room, same little icons</h1><p>The same 12 pieces at 80% and 140% shaker size. Enlarging the shell now also allows more additions.</p><div class="grid"><article><img src="${beforePng}"><h2>80% shaker · up to 12 pieces</h2></article><article><img src="${grownPng}"><h2>140% shaker · up to 36 pieces</h2></article></div></html>`);
  await gallery.screenshot({path:path.join(OUT,'shaker-size-and-spacing.png')});await gallery.close();
  assert.deepEqual(errors,[]);
  console.log('PASS independent slider/wheel/handle/pinch sizing, increased capacity, preserved contents, individual sizes, undo, duplication, exports, worker, legacy and 48-piece sharing, Chinese and mobile');
} finally {if(browser)await browser.close();server.close();}
