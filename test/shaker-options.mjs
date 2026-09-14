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
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', r => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sticker-shader-editor:locale', 'en'); } catch {} });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.stickerApp && document.querySelector('[data-tab="piknik"]'));
  await page.locator('#btnShaker').click();
  await page.waitForFunction(() => stickerApp.selected?.icon === 'shaker');
  assert(await page.locator('#shakerControls').isVisible());
  await page.evaluate(() => stickerApp.scene.stop());
  const id = await page.evaluate(() => stickerApp.selected.id);


  await page.evaluate(()=>{ stickerApp.addIcon('heart'); stickerApp.addIcon('star'); stickerApp.addIcon('flower'); });
  const slider=async(id,value)=>page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},String(value));
  const before=await page.evaluate(()=>({size:stickerApp.scene.size(stickerApp.scene.get(stickerApp.selected.id)).w,scale:stickerApp.selected.settings.stickerScale}));
  await slider('shakerSize',1.2);
  const enlarged=await page.evaluate(()=>stickerApp.scene.size(stickerApp.scene.get(stickerApp.selected.id)).w);
  assert(Math.abs(enlarged/before.size-1.2/before.scale)<.001,'shell size updates immediately');
  await slider('shakerPieceSize',18);
  await page.locator('.shaker-piece').first().click();
  await slider('shakerSelectedSize',.7);
  const sizes=await page.evaluate(()=>{const e=stickerApp.scene.get(stickerApp.selected.id);return e.shaker.bodies.map(b=>+(b.size*e.settings.stickerScale/e.settings.shakerContentScale).toFixed(6));});
  assert.deepEqual(sizes,[12.6,18,18],'selected piece resizes independently');
  await page.evaluate(()=>stickerApp.undo());
  assert.equal(await page.evaluate(()=>{const e=stickerApp.scene.get(stickerApp.selected.id);return +(e.shaker.bodies[0].size*e.settings.stickerScale/e.settings.shakerContentScale).toFixed(6);}),18);
  await page.evaluate(()=>stickerApp.redo());
  await slider('shakerBounce',.8);
  await page.locator('#shakerMode').selectOption('flat');
  assert.equal(await page.evaluate(()=>stickerApp.scene.get(stickerApp.selected.id).shaker.mode),'flat');
  const duplicate=await page.evaluate(()=>{const a=stickerApp,r=a.duplicateSelected();const v={settings:r.settings,scale:r.shakerItems[0].scale};a.undo();a.scene.select(a.scene.stickers.find(e=>e.settings.shaker));return v;});
  assert.equal(duplicate.settings.shakerMode,'flat');assert.equal(duplicate.scale,.7);
  const report=await page.evaluate(()=>{
    const items=stickerApp.selected.shakerItems;
    const result=[];
    for(const [design] of StickerShaker.DESIGNS){
      const state=StickerShaker.create(items,{shakerDesign:design,shakerMode:'flat',shakerPieceSize:18});
      const times=[];let min=Infinity;
      for(let i=0;i<480;i++){
        const t=performance.now();StickerShaker.advance(state,1/60,{x:Math.sin(i/19)*1400,y:Math.cos(i/17)*1400});times.push(performance.now()-t);
        min=Math.min(min,...state.bodies.map(b=>StickerShaker.contact(state,b).d));
      }
      times.sort((a,b)=>a-b);
      result.push({design,min,p95:times[Math.floor(times.length*.95)],hull:state.art.map(a=>a.support.length)});
    }


    const stress=[];
    for(const [design] of StickerShaker.DESIGNS){
      const contents=Array.from({length:12},(_,i)=>({...items[i%items.length],scale:1.5}));
      const state=StickerShaker.create(contents,{shakerMode:'flat',shakerDesign:design,shakerPieceSize:24});
      const times=[];let min=Infinity;
      for(let i=0;i<120;i++){
        const t=performance.now();StickerShaker.advance(state,1/60,{x:Math.sin(i/11)*1400,y:Math.cos(i/13)*1400});times.push(performance.now()-t);
        min=Math.min(min,...state.bodies.map(b=>StickerShaker.contact(state,b).d));
      }
      times.sort((a,b)=>a-b);stress.push({design,min,p95:times[114]});
    }
    const state=StickerShaker.create([{...items[1],scale:1}],{shakerMode:'flat',shakerPieceSize:6});
    Object.assign(state.bodies[0],{x:0,y:-10,vx:0,vy:0});
    for(let i=0;i<120;i++)StickerShaker.advance(state,1/60);
    const flatY=state.bodies[0].y;
    StickerShaker.configure(state,{shakerMode:'gravity',shakerPieceSize:6});
    for(let i=0;i<120;i++)StickerShaker.advance(state,1/60);
    const gravityY=state.bodies[0].y;
    // Actual corners must be reachable; the old invisible circular wall blocked these.
    StickerShaker.configure(state,{shakerDesign:'square',shakerMode:'flat',shakerPieceSize:6});
    Object.assign(state.bodies[0],{x:0,y:0,vx:0,vy:0});
    for(let i=0;i<120;i++)StickerShaker.advance(state,1/60,{x:400,y:400});
    const corner={x:state.bodies[0].x,y:state.bodies[0].y,d:StickerShaker.contact(state,state.bodies[0]).d};


    const artworkCorners=[];
    for(const [sx,sy] of [[1,1],[-1,1],[-1,-1],[1,-1]]){
      const s=StickerShaker.create([items[1]],{shakerDesign:'square',shakerMode:'flat'});
      for(let i=0;i<180;i++)StickerShaker.advance(s,1/60,{x:sx*350,y:sy*350});
      const b=s.bodies[0];artworkCorners.push({x:b.x*sx,y:b.y*sy,d:StickerShaker.contact(s,b).d});
    }
    const rebound=bounce=>{
      const s=StickerShaker.create([{...items[1],scale:1}],{shakerMode:'flat',shakerBounce:bounce,shakerPieceSize:6});
      Object.assign(s.bodies[0],{x:24,y:0,vx:120,vy:0});
      for(let i=0;i<12;i++)StickerShaker.advance(s,1/120);
      return Math.abs(s.bodies[0].vx);
    };
    return {result,stress,flatY,gravityY,corner,artworkCorners,soft:rebound(.1),bouncy:rebound(.9)};
  });
  console.log('Physics across designs',JSON.stringify(report));
  for(const shape of [...report.result,...report.stress]) assert(shape.min>=-.051,`${shape.design} crosses wall: ${shape.min}`);
  assert(report.artworkCorners.every(p=>p.x>19&&p.y>19&&p.d>=-.05),'artwork reaches all four corners');
  assert(report.bouncy>report.soft*4,'bounciness changes the actual rebound');
  assert.equal(report.flatY,-10);assert(report.gravityY>20);
  assert(report.corner.x>25&&report.corner.y>25&&report.corner.d>=-.05);
  fs.mkdirSync(OUT,{recursive:true});
  for(const [design] of await page.evaluate(()=>StickerShaker.DESIGNS)){
    const collection=await page.locator(`[data-design="${design}"]`).getAttribute("data-collection");
    await page.locator(`[data-shaker-collection="${collection}"]`).click();
    await page.locator(`[data-design="${design}"]`).click();
    assert.equal(await page.evaluate(()=>stickerApp.scene.get(stickerApp.selected.id).shaker.geometry.name),design);
    const preview=await page.evaluate(()=>{const e=stickerApp.scene.get(stickerApp.selected.id);return stickerApp.scene.snapshot(e).toDataURL();});
    fs.writeFileSync(path.join(OUT,`design-${design}.png`),Buffer.from(preview.split(',')[1],'base64'));
  }

  await page.locator('[data-shaker-collection="classic"]').click();
  await page.locator('[data-design="heart"]').click();
  await slider('shakerPieceSize',24);
  await slider('shakerSelectedSize',1.5);
  const shrinkHistory=await page.evaluate(()=>stickerApp.history.undo.length);
  await slider('shakerSize',.5);
  assert.equal(await page.locator('#shakerSize').inputValue(),'1.2','a shrink that would overlap icons is rejected');
  assert.equal(await page.evaluate(()=>stickerApp.history.undo.length),shrinkHistory);
  assert.match(await page.locator('#shakerSpaceHint').textContent(),/More room/);
  assert(await page.evaluate(()=>StickerShaker.validLayout(stickerApp.scene.get(stickerApp.selected.id).shaker)));
  await slider('shakerSize',1.2);
  await slider('shakerPieceSize',18);
  await slider('shakerSelectedSize',.7);
  await page.locator('#shakerSelectedSize').dblclick();
  assert.equal(await page.locator('#shakerSelectedSize').inputValue(),'1');
  await page.evaluate(()=>stickerApp.undo());
  assert.equal(await page.locator('#shakerSelectedSize').inputValue(),'0.7');
  await page.locator('[data-design="square"]').click();
  await page.locator('#shakerMode').selectOption('gravity');
  const url=await page.evaluate(async()=>(await stickerApp.shareLink()).url);
  await page.evaluate(()=>stickerApp.scene.render());
  await page.screenshot({path:path.join(OUT,'shaker-new-controls.png')});
  await page.goto('about:blank');await page.goto(url);
  await page.waitForFunction(()=>window.stickerApp&&stickerApp.scene.stickers.some(e=>e.shaker));
  const saved=await page.evaluate(()=>{const a=stickerApp,e=a.scene.stickers.find(e=>e.shaker);a.scene.stop();a.scene.select(e);return{settings:e.settings,sizes:e.shaker.bodies.map(b=>+(b.size*e.settings.stickerScale/e.settings.shakerContentScale).toFixed(6)),design:e.shaker.geometry.name};});
  assert.equal(saved.design,'square');assert.equal(saved.settings.shakerMode,'gravity');assert.equal(saved.settings.shakerBounce,.8);assert.equal(saved.settings.stickerScale,1.2);
  assert.deepEqual(saved.sizes,[12.6,18,18]);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#shakerSelectedSize').scrollIntoViewIfNeeded();
  await slider('shakerSelectedSize',1.2);
  await page.screenshot({path:path.join(OUT,'shaker-new-controls-mobile.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS independent sizes, undo/redo, duplicate, both movement modes, all designs and corners, share persistence and mobile controls');
} finally {if(browser)await browser.close();server.close();}
