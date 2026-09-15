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
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**',r=>r.abort());
  await page.addInitScript(()=>{try{localStorage.setItem('sticker-shader-editor:locale','en');}catch{}});
  const base=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(base);await page.waitForFunction(()=>window.stickerApp&&document.querySelector('[data-tab="piknik"]'));
  await page.locator('#iconMenuWrap summary').click();
  await page.locator('#btnShaker').click();await page.evaluate(()=>stickerApp.scene.stop());
  await page.locator('[data-shaker-collection="taiwan"]').click();await page.locator('[data-design="tw-pineapple"]').click();
  const slider=async(id,value)=>page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},String(value));
  await page.evaluate(()=>{
    // Independently test the original artwork hulls, not the physics engine's contact function.
    window.artOverlap=state=>{
      const polys=state.bodies.map((b,i)=>state.art[i].outline.map(([x,y])=>[b.x+b.size*(x*Math.cos(b.a)-y*Math.sin(b.a)),b.y+b.size*(x*Math.sin(b.a)+y*Math.cos(b.a))]));
      for(let i=0;i<polys.length;i++)for(let j=i+1;j<polys.length;j++){
        const a=polys[i],b=polys[j],ba=state.bodies[i],bb=state.bodies[j];
        if(Math.hypot(ba.x-bb.x,ba.y-bb.y)>ba.r+bb.r)continue;
        let apart=false;
        for(const p of [a,b]){for(let k=0;k<p.length;k++){
          const q=p[(k+1)%p.length],dx=q[0]-p[k][0],dy=q[1]-p[k][1],len=Math.hypot(dx,dy);if(len<1e-7)continue;
          const project=v=>v[0]*(-dy/len)+v[1]*(dx/len),pa=a.map(project),pb=b.map(project);
          if(Math.max(...pa)<=Math.min(...pb)+.005||Math.max(...pb)<=Math.min(...pa)+.005){apart=true;break;}
        }if(apart)break;}
        if(!apart)return true;
      }
      return false;
    };
  });
  const intake=await page.evaluate(()=>{
    const a=stickerApp,history=a.history.undo.length;
    let accepted=0;for(let i=0;i<20;i++){if(!a.addIcon(['heart','star','flower'][i%3]))break;accepted++;}
    const e=a.scene.get(a.selected.id);return{accepted,count:e.shaker.bodies.length,overlap:artOverlap(e.shaker),history:a.history.undo.length-history};
  });
  assert(intake.accepted>=3&&intake.accepted<=12);assert.equal(intake.count,intake.accepted);assert.equal(intake.history,intake.accepted);assert(!intake.overlap);
  console.log('Physical intake',JSON.stringify(intake));
  const baseline=await page.evaluate(()=>{const e=stickerApp.scene.get(stickerApp.selected.id);return{scale:e.settings.stickerScale,count:e.shaker.bodies.length,sizes:e.shaker.bodies.map(b=>b.size*e.settings.stickerScale)};});
  await slider('shakerSize',1.4);
  const grown=await page.evaluate(()=>{const a=stickerApp,e=a.scene.get(a.selected.id),sizes=e.shaker.bodies.map(b=>b.size*e.settings.stickerScale);const added=!!a.addIcon('heart');return{sizes,added,overlap:artOverlap(e.shaker)};});
  assert(grown.added&&!grown.overlap);grown.sizes.forEach((v,i)=>assert(Math.abs(v-baseline.sizes[i])<.001));
  const previousScale=await page.evaluate(()=>stickerApp.selected.settings.stickerScale);
  const beforeShrink=await page.evaluate(()=>({count:stickerApp.selected.shakerItems.length,history:stickerApp.history.undo.length}));
  await slider('shakerSize',.1);
  assert.equal(await page.evaluate(()=>stickerApp.selected.settings.stickerScale),previousScale,'an impossible shrink is rejected');
  assert.equal(await page.evaluate(()=>stickerApp.selected.shakerItems.length),beforeShrink.count);
  assert.equal(await page.evaluate(()=>stickerApp.history.undo.length),beforeShrink.history,'a rejected edit adds no undo command');
  assert.match(await page.locator('#shakerSpaceHint').textContent(),/More room/);
  // A rejected drag must leave the original icon on the canvas.
  const blockedDrop=await page.evaluate(()=>{
    const a=stickerApp,e=a.scene.get(a.selected.id),r=a.selected;
    while(a.addIcon('flower')){}
    const icon=a.addIcon('flower',{quiet:true}),loose=a.scene.get(icon.id),count=r.shakerItems.length;
    const accepted=a.scene.onDrop(loose,e);
    return{accepted,kept:a.records.has(icon.id),unchanged:r.shakerItems.length===count};
  });
  assert(!blockedDrop.accepted&&blockedDrop.kept&&blockedDrop.unchanged);
  // Make a reusable set with thin, round and irregular pieces.
  await page.evaluate(async()=>{
    const a=stickerApp;
    window.testPieces=[a.addIcon('heart',{quiet:true}),a.addIcon('star',{quiet:true}),a.addIcon('flower',{quiet:true})].map(r=>({icon:r.icon,settings:r.settings}));
    const r=await a.addPiknik('assets/piknik/taiwan-everyday/01-taiwan-market-bag.png',{quiet:true});
    testPieces.push({icon:r.icon,settings:r.settings,image:r.image});
  });
  for(const [design] of await page.evaluate(()=>StickerShaker.DESIGNS)){
    const report=await page.evaluate(design=>{
      let overlap=false,outside=false,minMove=Infinity,fit=1;const times=[];
      for(const mode of ['flat','gravity']){
        const state=StickerShaker.create(Array.from({length:12},(_,i)=>testPieces[i%4]),{shakerDesign:design,shakerMode:mode,shakerPieceSize:18});
        fit=Math.min(fit,state.fitScale);overlap ||= artOverlap(state);
        const start=state.bodies.map(b=>[b.x,b.y]);
        for(let i=0;i<150;i++){
          const t=performance.now();StickerShaker.advance(state,1/60,{x:Math.sin(i/12)*1000,y:Math.cos(i/15)*800});times.push(performance.now()-t);
          overlap ||= artOverlap(state);outside ||= state.bodies.some(b=>StickerShaker.contact(state,b).d<-.02);
        }
        minMove=Math.min(minMove,Math.max(...state.bodies.map((b,i)=>Math.hypot(b.x-start[i][0],b.y-start[i][1]))));
      }
      times.sort((a,b)=>a-b);return{design,overlap,outside,minMove,fit,p95:times[Math.floor(times.length*.95)]};
    },design);
    console.log('No-overlap physics',JSON.stringify(report));
    assert(!report.overlap&&!report.outside,JSON.stringify(report));assert(report.minMove>1,'packed pieces can still move');
  }
  const dense=await page.evaluate(()=>{
    const state=StickerShaker.create(Array.from({length:48},(_,i)=>testPieces[i%4]),{shakerDesign:'tw-pineapple',stickerScale:2.5,shakerContentScale:.8,shakerMode:'flat'});
    let overlap=artOverlap(state);const times=[];
    for(let i=0;i<120;i++){const t=performance.now();StickerShaker.advance(state,1/60,{x:Math.sin(i/9)*1000,y:Math.cos(i/11)*900});times.push(performance.now()-t);overlap ||= artOverlap(state);}
    times.sort((a,b)=>a-b);return{count:state.bodies.length,overlap,fit:state.fitScale,p95:times[114]};
  });
  console.log('48-piece collision load',JSON.stringify(dense));assert.equal(dense.count,48);assert(!dense.overlap);
  // Old overcrowded scenes retain every piece, with a visible fitting explanation.
  const shared=await page.evaluate(async()=>{
    const a=stickerApp,r=a.addIcon('shaker',{quiet:true,settings:{shakerDesign:'tw-pineapple',shakerColor:StickerShaker.COLORS['tw-pineapple'],shakerContentScale:.8,stickerScale:.8,shakerMode:'flat',...StickerShaker.ILLUSTRATED_FINISH},shakerItems:Array.from({length:18},(_,i)=>testPieces[i%4])});
    const e=a.scene.get(r.id);a.scene.select(e);
    const fit=e.shaker.crowded,count=e.shaker.bodies.length,overlap=artOverlap(e.shaker),png=a.scene.snapshot(e).toDataURL();
    const dup=a.duplicateSelected();const duplicated=dup.shakerItems.length===18&&!artOverlap(a.scene.get(dup.id).shaker);a.undo();a.scene.select(e);
    const animation=a.scene.animationFrames(e,{size:160,fps:3,tilt:false});
    const exported=!artOverlap(e.shakerExport),gif=StickerAnim.encodeGIF(animation.frames,animation.fps),apng=await StickerAnim.encodeAPNG(animation.frames,animation.fps);
    return{fit,count,overlap,duplicated,exported,gif:gif.size,apng:apng.size,png,url:(await a.shareLink()).url};
  });
  assert(shared.fit&&shared.count===18&&!shared.overlap&&shared.duplicated&&shared.exported&&shared.gif>100&&shared.apng>100);
  assert.match(await page.locator('#shakerFitHint').textContent(),/none overlap/);
  fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'shaker-no-overlap.png'),Buffer.from(shared.png.split(',')[1],'base64'));
  await page.goto('about:blank');await page.goto(shared.url);
  await page.waitForFunction(()=>window.stickerApp&&stickerApp.scene.stickers.some(e=>e.shaker?.bodies.length===18));
  await page.evaluate(()=>{stickerApp.scene.stop();stickerApp.scene.select(stickerApp.scene.stickers.find(e=>e.shaker?.bodies.length===18));I18N.setLocale('zh-TW');});
  assert.match(await page.locator('#shakerFitHint').textContent(),/避免重疊/);
  assert(await page.evaluate(()=>StickerShaker.validLayout(stickerApp.scene.get(stickerApp.selected.id).shaker)));
  await page.setViewportSize({width:390,height:844});await page.locator('#shakerFitHint').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(OUT,'shaker-no-overlap-mobile.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('PASS real free-space admission, blocked resize/drop without data loss, non-overlapping artwork in every shape and mode, 48 pieces, legacy fitting, duplication/export/share, Chinese and mobile');
} finally {if(browser)await browser.close();server.close();}
