import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.join(ROOT,'test/.out');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=http.createServer((req,res)=>{
  const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  await page.route('https://**',r=>r.abort());page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('sticker-shader-editor:locale','en'));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.stickerApp?.ready);await page.evaluate(()=>stickerApp.ready);
  const id=await page.evaluate(()=>{
    const a=stickerApp;a.scene.stop();const r=a.addFrame({settings:{...StickerLanyard.DEFAULTS}});a.scene.update(1/60);a.scene.render();return r.id;
  });
  assert(await page.locator('#ctl-badgeFabric').isVisible());assert(!await page.locator('#ctl-badgeTextSize').isVisible());
  assert(!await page.locator('#ctl-badgePatternScale').isVisible());
  await page.locator('#ctl-frameLanyard').selectOption('checker');assert(await page.locator('#ctl-badgePatternScale').isVisible());
  await page.locator('#ctl-frameLanyardText').fill('OPEN SYSTEMS');assert(await page.locator('#ctl-badgeTextSize').isVisible());
  await page.locator('#ctl-badgeFabric').selectOption('satin');await page.locator('#ctl-badgeTextDirection').selectOption('up');
  await page.locator('#ctl-badgeMetal').selectOption('rose');await page.locator('#ctl-badgeCorners').selectOption('soft');
  await page.locator('#ctl-badgeFace').selectOption('back');await page.locator('#ctl-badgeBackTitle').fill('F');
  const back=await page.evaluate(id=>{
    const a=stickerApp,r=a.records.get(id),e=a.scene.get(id);clearTimeout(r.composeTimer);a.composeRecord(r,{sync:true});a.scene.update(1/60);a.scene.render();
    const c=a.scene.snapshot(e,{scale:.5}),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,ink=[];
    for(let y=Math.floor(c.height*.47);y<c.height*.84;y++)for(let x=Math.floor(c.width*.3);x<c.width*.7;x++){
      const i=(y*c.width+x)*4;if(d[i]<120&&d[i+1]<120&&d[i+2]<120&&d[i+3]>245)ink.push([x,y]);
    }
    const min=Math.min(...ink.map(p=>p[0])),max=Math.max(...ink.map(p=>p[0])),width=max-min;
    return{yaw:e.rotY,ink:ink.length,left:ink.filter(p=>p[0]<min+width/3).length,right:ink.filter(p=>p[0]>max-width/3).length,png:c.toDataURL()};
  },id);
  assert(Math.abs(back.yaw-Math.PI)<.01);assert(back.ink>15&&back.left>back.right*1.25,JSON.stringify({...back,png:undefined}));
  const beforeHistory=await page.evaluate(()=>stickerApp.history.undo.length);await page.locator('#ctl-badgeBackTitle').fill('OPEN SYSTEMS 2026');
  const history=await page.evaluate(()=>{const a=stickerApp,count=a.history.undo.length;a.undo();const before=a.selected.settings.badgeBackTitle;a.redo();return{count,before,after:a.selected.settings.badgeBackTitle};});
  // Adjacent title edits intentionally coalesce into one history entry.
  assert(history.count<=beforeHistory+1&&history.before!=='OPEN SYSTEMS 2026'&&history.after==='OPEN SYSTEMS 2026');
  await page.locator('#ctl-badgeBackText').fill('Made of good ideas and great memories.');await page.locator('#ctl-badgeBackStyle').selectOption('band');
  const render=await page.evaluate(async id=>{
    const a=stickerApp,r=a.records.get(id),e=a.scene.get(id),p=r.settings;clearTimeout(r.composeTimer);a.composeRecord(r,{sync:true});a.scene.update(1/60);
    const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
    const ribbon=settings=>{const c=canvas(100,620);StickerLanyard.drawRibbon(c.getContext('2d'),[[50,0],[50,200],[50,400],[50,620]],64,settings.frameLanyardColor,settings);return c;};
    const styles=['solid','striped','edged','checker','dots','diagonal'],fabrics=['woven','ribbed','satin'];
    const ribbons=styles.map(frameLanyard=>ribbon({...p,frameLanyard})),weaves=fabrics.map(badgeFabric=>ribbon({...p,frameLanyard:'solid',badgeFabric}));
    const prints=[{badgeTextSize:.6},{badgeTextSize:1.8},{badgeTextSpacing:.65},{badgeTextSpacing:1.7},{badgeTextDirection:'down'},{badgeTextDirection:'up'}].map(change=>ribbon({...p,...change}).toDataURL());
    const sourceBefore=StickerLanyard.compose(p,null).canvas,changed=StickerLanyard.compose({...p,badgeBackTitle:'OTHER',badgeBackColor:'#114422',badgeBackStyle:'grid'},null).canvas;
    const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data,original=pixels(sourceBefore),fresh=pixels(changed);
    const frontPreserved=original.every((v,i)=>v===fresh[i]);
    const variants=[
      {frameLanyard:'checker',badgeFabric:'woven',frameLanyardColor:'#314365',badgeBackStyle:'band',badgeMetal:'silver'},
      {frameLanyard:'dots',badgeFabric:'satin',frameLanyardColor:'#986674',badgeBackStyle:'grid',badgeBackColor:'#f8e5e8',badgeMetal:'rose'},
      {frameLanyard:'diagonal',badgeFabric:'ribbed',frameLanyardColor:'#316557',badgeBackStyle:'band',badgeBackColor:'#eaf2dd',badgeMetal:'gunmetal'}
    ];
    const sheet=canvas(1440,660),ctx=sheet.getContext('2d');ctx.fillStyle='#e9eeeb';ctx.fillRect(0,0,1440,660);
    const saved={...p};
    for(let i=0;i<variants.length;i++){
      Object.assign(p,saved,variants[i],{badgeFace:'back',badgeFlip:false});a.composeRecord(r,{sync:true});const pic=a.scene.snapshot(e,{scale:.4});
      ctx.drawImage(pic,i*480-60,0,600,600);ctx.fillStyle='#283542';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.fillText(`${variants[i].frameLanyard} / ${variants[i].badgeFabric} / ${variants[i].badgeMetal}`,i*480+240,630);
    }
    Object.assign(p,saved);a.composeRecord(r,{sync:true});
    const spec={kind:'frame',settings:{...p,badgeBackTitle:'開放原始碼 OPEN SYSTEMS 2026',badgeBackText:'把今天的靈感留在這裡。'.repeat(12)},workingRes:'384'},main=StickerDecor.buildComposed(spec),worker=new Worker('js/compose-worker.js');let offscreen;
    try{offscreen=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker timeout')),20000);worker.onmessage=({data})=>{clearTimeout(timer);data.type==='error'?reject(Error(data.message)):resolve(data.out);};worker.postMessage({type:'compose',id:'custom',seq:1,spec});});}finally{worker.terminate();}
    const difference=key=>main.atlas[key].data.reduce((n,v,i)=>n+Math.abs(v-offscreen.atlas[key].data[i]),0)/main.atlas[key].data.length;
    p.badgeFlip=true;const cycle=a.scene.animationFrames(e,{size:192,fps:4});p.badgeFlip=saved.badgeFlip;
    const gif=StickerAnim.encodeGIF(cycle.frames,cycle.fps,{loop:cycle.loop}),png=await StickerAnim.encodeAPNG(cycle.frames,cycle.fps,{loop:cycle.loop});const decoded=[];
    for(const blob of [gif,png]){const decoder=new ImageDecoder({data:await blob.arrayBuffer(),type:blob.type==='image/apng'?'image/png':blob.type});await decoder.tracks.ready;const {image}=await decoder.decode({frameIndex:0});decoded.push(image.displayWidth===192&&decoder.tracks.selectedTrack.frameCount===16);image.close();decoder.close();}
    const patternSheet=canvas(900,670),px=patternSheet.getContext('2d');px.fillStyle='#edf0ed';px.fillRect(0,0,900,670);[...ribbons,...weaves].forEach((c,i)=>px.drawImage(c,i*100,0));
    const otherFrames=styles.slice(2).map(frameLanyard=>StickerDecor.composeFrame({...StickerUI.DEFAULTS,frameDesign:'conference',frameLanyard},null).canvas.toDataURL());
    return{styles:new Set(ribbons.map(c=>c.toDataURL())).size,weaves:new Set(weaves.map(c=>c.toDataURL())).size,prints:new Set(prints).size,otherFrames:new Set(otherFrames).size,frontPreserved,main: difference('image'),back:difference('back'),decoded,sheet:sheet.toDataURL(),patterns:patternSheet.toDataURL()};
  },id);
  assert.equal(render.styles,6);assert.equal(render.weaves,3);assert.equal(render.prints,6);assert.equal(render.otherFrames,4);assert(render.frontPreserved&&render.main<.05&&render.back<.05&&render.decoded.every(Boolean),JSON.stringify({...render,sheet:undefined,patterns:undefined}));
  fs.mkdirSync(OUT,{recursive:true});for(const [name,url] of [['backs',render.sheet],['straps',render.patterns],['readable-back',back.png]])fs.writeFileSync(path.join(OUT,`lanyard-custom-${name}.png`),Buffer.from(url.split(',')[1],'base64'));
  const persistence=await page.evaluate(async id=>{
    const a=stickerApp,r=a.records.get(id);a.scene.select(a.scene.get(id));a.duplicateSelected();const duplicate=a.selected;
    const keys=['frameLanyard','badgeFabric','badgeTextDirection','badgeMetal','badgeCorners','badgeFace','badgeBackTitle','badgeBackText','badgeBackStyle'];
    const copied=keys.every(k=>duplicate.settings[k]===r.settings[k]),before=new Set(a.records.keys()),{url}=await a.shareLink();await a.loadSharedScene(new URL(url).hash);
    const restored=[...a.records.values()].find(rec=>rec.settings.badgeBackTitle===r.settings.badgeBackTitle&&!before.has(rec.id));
    a.scene.select(a.scene.get(restored.id));return{copied,shared:keys.every(k=>restored.settings[k]===r.settings[k])};
  },id);
  assert(persistence.copied&&persistence.shared);
  await page.locator('#ctl-badgeStrapView').selectOption('loop');assert(!await page.locator('#ctl-badgeBackTitle').isVisible());
  await page.locator('#ctl-badgeStrapView').selectOption('hanging');await page.waitForFunction(()=>!!stickerApp.selected.atlas.cord);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>I18N.setLocale('zh-TW'));
  assert.equal(await page.locator('label[for="ctl-badgeBackTitle"]').textContent(),'背面標題');assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
  await page.locator('#ctl-badgeBackTitle').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(OUT,'lanyard-custom-mobile.png')});
  assert.deepEqual(errors,[]);console.log('PASS strap patterns/fabrics/print cache, back editing/readable text, front preservation, worker parity, exports, history, duplication, sharing and localized mobile controls');
}finally{await browser?.close();server.close();}
