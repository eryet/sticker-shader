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
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  await page.route('https://**',r=>r.abort());page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('sticker-shader-editor:locale','en'));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.stickerApp?.ready);await page.evaluate(()=>stickerApp.ready);
  const initial=await page.evaluate(()=>{
    const a=stickerApp,s=a.scene;s.stop();const r=a.addFrame({settings:{...StickerLanyard.DEFAULTS,frameLanyardText:'OPEN SYSTEMS 2026'}}),e=s.get(r.id);
    s.update(1/60);const icon=a.addIcon('star',{settings:{stickerScale:.11,baseRotation:0,iconFill:'#ff00aa'}}),c=s.get(icon.id);
    c.spawn=0;c.x=e.x+20;c.y=e.y+50;s.attach(c,e);s.select(e);s.update(1/60);s.render();
    return{id:e.id,child:c.id,history:a.history.undo.length,hasBack:!!e.tex.back};
  });
  assert(initial.hasBack);assert(await page.locator('#ctl-badgeFlip').isVisible());
  assert(!await page.locator('#ctl-badgeFlipSpeed').isVisible());await page.locator('#ctl-badgeFlip').check();
  assert(await page.locator('#ctl-badgeFlipSpeed').isVisible());
  const motion=await page.evaluate(({id,child,history})=>{
    const a=stickerApp,s=a.scene,e=s.get(id),c=s.get(child);let max=0;
    for(let i=0;i<240;i++){s.update(1/120);max=Math.max(max,e.rotY);}
    s.render();const pose=s._pose(c,s.stageW,s.stageH),cam=s._view().camDist;
    const p={x:s.stageW/2+pose.x*cam/(cam-pose.z),y:s.stageH/2-pose.y*cam/(cam-pose.z)};
    const hidden=s.localPoint(c,p.x,p.y).u<0,hit=s.hitTest(p.x,p.y)?.id;
    a.undo();const undone=!e.settings.badgeFlip;a.redo();const redone=e.settings.badgeFlip;
    return{max,hidden,hit,undone,redone,history:a.history.undo.length-history};
  },initial);
  assert(motion.max>3.1&&motion.hidden&&motion.hit===initial.id,JSON.stringify(motion));
  assert(motion.undone&&motion.redone&&motion.history===1,'the toggle is one undoable edit');
  const results=await page.evaluate(async({id,child})=>{
    const a=stickerApp,s=a.scene,e=s.get(id),c=s.get(child);s.update(1/60);
    const before=JSON.stringify(e.lanyard),cycle=s.animationFrames(e,{size:224,fps:10}),repeat=s.animationFrames(e,{size:224,fps:10,lazy:true});
    const frames=cycle.frames,urls=frames.map(f=>f.toDataURL());let equal=true,index=0;
    for(const frame of repeat.frames)equal&&=frame.toDataURL()===urls[index++];
    const untouched=before===JSON.stringify(e.lanyard),mid=Math.floor(frames.length/2);
    // Decorations must contribute to the front image, and no pixels to the back.
    c.parent=null;const bare=s.animationFrames(e,{size:224,fps:10});c.parent=e;
    const frontIcon=urls[0]!==bare.frames[0].toDataURL(),backClean=urls[mid]===bare.frames[mid].toDataURL();
    const blank=c=>{const d=c.getContext('2d').getImageData(94,130,36,35).data;let cream=0;for(let i=0;i<d.length;i+=4)if(d[i]>180&&d[i+1]>180&&d[i+2]>170&&d[i+3]>240)cream++;return cream/d.length*4;};
    // Decode real animation files, not just the source canvases.
    const gif=StickerAnim.encodeGIF(frames,cycle.fps,{loop:cycle.loop}),apng=await StickerAnim.encodeAPNG(frames,cycle.fps,{loop:cycle.loop}),decoded=[];
    for(const blob of [gif,apng]){
      const dec=new ImageDecoder({data:await blob.arrayBuffer(),type:blob.type==='image/apng'?'image/png':blob.type});await dec.tracks.ready;
      const {image}=await dec.decode({frameIndex:mid}),out=document.createElement('canvas');out.width=out.height=224;out.getContext('2d').drawImage(image,0,0);image.close();
      decoded.push({count:dec.tracks.selectedTrack.frameCount,blank:blank(out)});dec.close();
    }
    const sheet=document.createElement('canvas');sheet.width=1120;sheet.height=260;const ctx=sheet.getContext('2d');ctx.fillStyle='#edf0ee';ctx.fillRect(0,0,sheet.width,sheet.height);
    [0,9,11,15,20].forEach((j,k)=>ctx.drawImage(frames[j],k*224,18));
    e.settings.badgeFlipSpeed=2;const fast=s.animationFrames(e,{size:96,fps:4,lazy:true});e.settings.badgeFlipSpeed=1;
    return{equal,untouched,frontIcon,backClean,loop:cycle.loop,seconds:cycle.seconds,seam:urls[0]===urls.at(-1),different:new Set(urls).size,decoded,fast:fast.seconds,sheet:sheet.toDataURL(),front:urls[0],back:urls[mid],gif:await new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(gif);})};
  },initial);
  assert(results.equal&&results.untouched&&results.frontIcon&&results.backClean&&results.loop&&results.seam,JSON.stringify({...results,sheet:undefined,front:undefined,back:undefined,gif:undefined}));
  assert.equal(results.seconds,4);assert.equal(results.fast,2);assert(results.different>12);
  assert(results.decoded.every(d=>d.count===40&&d.blank>.95),JSON.stringify(results.decoded));
  fs.mkdirSync(OUT,{recursive:true});for(const name of ['sheet','front','back','gif'])fs.writeFileSync(path.join(OUT,`lanyard-flip-${name}.${name==='gif'?'gif':'png'}`),Buffer.from(results[name].split(',')[1],'base64'));
  const safety=await page.evaluate(({id})=>{
    const a=stickerApp,s=a.scene,e=s.get(id);for(let i=0;i<230;i++)s.update(1/120);
    const rect=s.canvas.getBoundingClientRect(),before=e.lanyard.flipAngle;
    s.canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:91,pointerType:'mouse',clientX:rect.x+e.x,clientY:rect.y+e.y}));
    const caught=s.drag?.entry===e;for(let i=0;i<60;i++)s.update(1/120);const paused=e.lanyard.flipAngle===before;
    s.canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:91,pointerType:'mouse',clientX:rect.x+e.x,clientY:rect.y+e.y}));
    for(let i=0;i<120;i++)s.update(1/120);const resumed=e.lanyard.flipAngle!==before;
    a.lockObject(id);const locked=e.lanyard.flipAngle;s.update(.05);const stable=e.lanyard.flipAngle===locked;a.lockObject(id);
    const pref=s.surfaceMotionPreference;s.surfaceMotionPreference={matches:true};s.update(.05);const reduced=e.lanyard.flipAngle===0;s.surfaceMotionPreference=pref;
    e.lanyard.flipPhase=.5;s.update(1/120);e.settings.badgeFlip=false;for(let i=0;i<240;i++)s.update(1/120);const returned=Math.abs(e.rotY)<.001;
    e.settings.badgeFlip=true;
    return{caught,paused,resumed,stable,reduced,returned};
  },initial);
  assert(Object.values(safety).every(Boolean),JSON.stringify(safety));
  const worker=await page.evaluate(async id=>{
    const a=stickerApp,e=a.scene.get(id),spec={kind:'frame',settings:{...e.settings},workingRes:'384'},main=StickerDecor.buildComposed(spec),w=new Worker('js/compose-worker.js');
    let out;try{out=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker timeout')),20000);w.onmessage=({data})=>{clearTimeout(timer);data.type==='error'?reject(Error(data.message)):resolve(data.out);};w.postMessage({type:'compose',id:'flip',seq:1,spec});});}finally{w.terminate();}
    const delta=main.atlas.back.data.reduce((sum,v,i)=>sum+Math.abs(v-out.atlas.back.data[i]),0)/main.atlas.back.data.length;
    const tex=e.tex.back;a.composeRecord(a.records.get(id),{sync:true});const disposed=!a.scene.renderer.gl.isTexture(tex);
    const {url}=await a.shareLink();await a.loadSharedScene(new URL(url).hash);
    const restored=[...a.records.values()].find(r=>r.settings.frameDesign==='lanyard'&&r.settings.badgeFlip&&r.settings.badgeFlipSpeed===1);
    const saved=!!restored;if(restored)a.scene.select(a.scene.get(restored.id));
    return{delta,disposed,saved};
  },initial.id);
  assert(worker.delta<.05&&worker.disposed&&worker.saved,JSON.stringify(worker));
  await page.locator('#ctl-badgeStrapView').selectOption('loop');assert(!await page.locator('#ctl-badgeFlip').isVisible());
  await page.locator('#ctl-badgeStrapView').selectOption('hanging');await page.waitForFunction(()=>!!stickerApp.selected.atlas.cord);
  await page.setViewportSize({width:390,height:844});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
  assert.deepEqual(errors,[]);console.log('PASS flip controls/history, opaque back, hidden front decorations/picking, seamless deterministic GIF/APNG, speed, drag pause, reduced motion, lock, return to front, worker parity, texture cleanup, sharing and mobile');
}finally{await browser?.close();server.close();}
