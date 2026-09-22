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
  const initial=await page.evaluate(()=>{
    const app=stickerApp,scene=app.scene;scene.stop();const rec=app.addFrame({settings:{...StickerLanyard.DEFAULTS,frameLanyardText:'OPEN SYSTEMS 2026'}}),e=scene.get(rec.id);
    scene.update(1/60);const icon=app.addIcon('star',{settings:{stickerScale:.1,baseRotation:0}}),child=scene.get(icon.id);child.spawn=0;child.x=e.x+25;child.y=e.y+55;scene.attach(child,e);scene.select(e);scene.update(1/60);scene.render();
    return{id:e.id,child:child.id,x:e.x,y:e.y,restX:e.restX,restY:e.restY,crop:e.lanyard.cropTop,anchors:e.lanyard.anchors,history:app.history.undo.length};
  });
  fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,'lanyard-hanging-desktop.png')});
  const box=await page.locator('#glCanvas').boundingBox();await page.mouse.move(box.x+initial.x,box.y+initial.y);await page.mouse.down();
  for(let i=1;i<=20;i++){
    await page.mouse.move(box.x+initial.x+i*6,box.y+initial.y-i*5);
    await page.evaluate(()=>{for(let j=0;j<3;j++)stickerApp.scene.update(1/120);stickerApp.scene.render();});
  }
  const pulled=await page.evaluate(({id,child})=>{
    const s=stickerApp.scene,e=s.get(id),c=s.get(child),p=s._pose(c,s.stageW,s.stageH),pa=s._pose(e,s.stageW,s.stageH),m=StickerRenderer.rotationMatrix(pa.rotX,pa.rotY,pa.rotZ),size=s.size(e);
    const expected={x:pa.x+m[0]*c.offset.u*size.w-m[3]*c.offset.v*size.h,y:pa.y+m[1]*c.offset.u*size.w-m[4]*c.offset.v*size.h,z:pa.z+m[2]*c.offset.u*size.w-m[5]*c.offset.v*size.h};
    const cam=s._view().camDist,point=StickerRenderer.surfaceVertex(pa,.26,.62,0,0),factor=cam/(cam-point.z),uv=s.localPoint(e,s.stageW/2+point.x*factor,s.stageH/2-point.y*factor);
    const cord=e.atlas.cord,k=e.work.w/cord.sourceW,hook=StickerRenderer.surfaceVertex(pa,(cord.x*k-e.atlas.x0)/e.atlas.w,(cord.y*k-e.atlas.y0)/e.atlas.h,0,0),physical=StickerCord.hook(e.lanyard);
    // Reattach an icon while the card is tilted. Its projected centre must stay
    // at the drop point, and its depth must match the badge plane.
    const iconFactor=cam/(cam-p.z),drop={x:s.stageW/2+p.x*iconFactor,y:s.stageH/2-p.y*iconFactor};c.x=drop.x;c.y=drop.y;s.attach(c,e);
    const reattached=s._pose(c,s.stageW,s.stageH),f=cam/(cam-reattached.z);
    return{x:e.x,y:e.y,anchors:e.lanyard.anchors,attachedError:Math.hypot(expected.x-p.x,expected.y-p.y,expected.z-p.z),angle:e.rotZ,pitch:e.rotX,yaw:e.rotY,
      hitError:Math.hypot(uv.u-.26,uv.v-.62),hookError:Math.hypot(hook.x+s.stageW/2-physical.x,s.stageH/2-hook.y-physical.y,hook.z),reattachError:Math.hypot(s.stageW/2+reattached.x*f-drop.x,s.stageH/2-reattached.y*f-drop.y)};
  },initial);
  assert(pulled.x>initial.x+30&&pulled.y<initial.y-20,JSON.stringify({initial,pulled}));
  pulled.anchors.forEach((p,i)=>assert(Math.hypot(p.x-initial.anchors[i].x-120,p.y-initial.anchors[i].y+100)<.01,'the support moves with the lanyard'));
  assert(pulled.attachedError<.01,'icons follow the rotating badge plane');
  assert(Math.abs(pulled.pitch)>.03&&Math.abs(pulled.yaw)>.03,'dragging gives the badge visible pitch and twist');
  assert(pulled.hitError<.001&&pulled.hookError<.001&&pulled.reattachError<.01,JSON.stringify(pulled));
  assert.equal(initial.anchors.length,1,'a single ribbon enters from above');
  await page.screenshot({path:path.join(OUT,'lanyard-hanging-pulled.png')});await page.mouse.up();
  const after=await page.evaluate(id=>{
    const s=stickerApp.scene,e=s.get(id);for(let i=0;i<35;i++)s.update(1/120);s.render();return{x:e.x,y:e.y,history:stickerApp.history.undo.length};
  },initial.id);
  assert(Math.hypot(after.x-pulled.x,after.y-pulled.y)>5,'release continues swinging');assert.equal(after.history,initial.history+1,'a drag adds exactly one layout edit');
  const movement=await page.evaluate(({id,restX,restY})=>{
    const a=stickerApp,s=a.scene,e=s.get(id),pos=()=>[e.restX,e.restY];
    const drop=pos();a.undo();s.update(1/120);const undo=pos(),undoBody=[e.x,e.y];a.redo();s.update(1/120);const redo=pos();
    return{drop,undo,undoBody,redo};
  },initial);
  assert(Math.hypot(movement.drop[0]-initial.restX-120,movement.drop[1]-initial.restY+100)<.001);assert.deepEqual(movement.undo,[initial.restX,initial.restY]);assert.deepEqual(movement.redo,movement.drop);
  assert(Math.hypot(movement.undoBody[0]-initial.restX,movement.undoBody[1]-initial.restY)<2,'undo restores the complete hanging assembly');
  const output=await page.evaluate(({id})=>{
    const s=stickerApp.scene,e=s.get(id);for(let i=0;i<1800;i++)s.update(1/120);s.render();
    const still=s.snapshot(e,{scale:.35}),before=JSON.stringify(e.lanyard),cycle=s.animationFrames(e,{size:192,fps:6}),repeat=s.animationFrames(e,{size:192,fps:6});
    const top=c=>{const a=c.getContext('2d').getImageData(0,0,c.width,1).data;return a.filter((v,i)=>i%4===3&&v>100).length;};
    return{settled:Math.hypot(e.x-e.restX,e.y-e.restY),still:still.toDataURL(),top:top(still),moving:new Set(cycle.frames.map(c=>c.toDataURL())).size>5,repeat:cycle.frames.every((c,i)=>c.toDataURL()===repeat.frames[i].toDataURL()),untouched:before===JSON.stringify(e.lanyard),frame:cycle.frames[4].toDataURL(),finite:Object.values(e.lanyard.body).every(Number.isFinite)};
  },initial);
  assert(output.top>4&&output.moving&&output.repeat&&output.untouched&&output.finite,JSON.stringify({...output,still:undefined,frame:undefined}));
  assert(output.settled<4,'live badge settles at the new drop position');
  fs.writeFileSync(path.join(OUT,'lanyard-hanging-export.png'),Buffer.from(output.still.split(',')[1],'base64'));fs.writeFileSync(path.join(OUT,'lanyard-hanging-swing.png'),Buffer.from(output.frame.split(',')[1],'base64'));
  const downward=await page.evaluate(id=>{
    const a=stickerApp,s=a.scene,e=s.get(id),rect=s.canvas.getBoundingClientRect();
    const before={x:e.restX,y:e.restY,crop:e.lanyard.cropTop,history:a.history.undo.length},start={x:e.x,y:e.y};
    const send=(type,dx,dy)=>s.canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:22,pointerType:'touch',clientX:rect.x+start.x+dx,clientY:rect.y+start.y+dy}));
    // A fast touch drag must commit even without an animation frame before up.
    send('pointerdown',0,0);send('pointermove',-60,220);send('pointerup',-60,220);
    for(let i=0;i<1800;i++)s.update(1/120);s.render();
    const moved={x:e.restX,y:e.restY,crop:e.lanyard.cropTop,body:[e.x,e.y],history:a.history.undo.length};
    const pixels=s.cordCanvas.getContext('2d').getImageData(0,0,s.cordCanvas.width,s.cordCanvas.height).data,scale=s.cordCanvas.height/s.stageH;
    let above=0,below=0;
    for(let y=0;y<s.cordCanvas.height;y++)for(let x=0;x<s.cordCanvas.width;x++){const alpha=pixels[(y*s.cordCanvas.width+x)*4+3];if(y<(moved.crop-1)*scale)above+=alpha;else below+=alpha;}
    return{before,moved,above,below};
  },initial.id);
  assert(Math.hypot(downward.moved.x-downward.before.x+60,downward.moved.y-downward.before.y-220)<.001);assert.equal(downward.moved.history,downward.before.history+1);
  assert(Math.abs(downward.moved.crop-downward.before.crop-220)<.01);assert(Math.hypot(downward.moved.body[0]-downward.moved.x,downward.moved.body[1]-downward.moved.y)<4);
  await page.screenshot({path:path.join(OUT,'lanyard-moved-down.png')});
  assert(downward.moved.crop>0&&downward.above===0&&downward.below>0,JSON.stringify(downward));
  const canceled=await page.evaluate(id=>{
    const a=stickerApp,s=a.scene,e=s.get(id),rect=s.canvas.getBoundingClientRect(),before=[e.restX,e.restY,a.history.undo.length],start={x:e.x,y:e.y};
    const send=(type,dx,dy)=>s.canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:23,pointerType:'touch',clientX:rect.x+start.x+dx,clientY:rect.y+start.y+dy}));
    send('pointerdown',0,0);send('pointermove',40,-70);s.update(1/60);send('pointercancel',40,-70);s.update(1/60);
    return{before,after:[e.restX,e.restY,a.history.undo.length],drag:s.drag};
  },initial.id);
  assert.deepEqual(canceled.after,canceled.before,'a canceled touch restores placement without an edit');assert.equal(canceled.drag,null);
  const safeguards=await page.evaluate(id=>{
    const app=stickerApp,s=app.scene,e=s.get(id),before=JSON.stringify(e.lanyard.body);app.lockObject(id);s.update(1/30);const locked=before===JSON.stringify(e.lanyard.body);app.lockObject(id);
    const preference=s.surfaceMotionPreference;s.surfaceMotionPreference={matches:true};const frozen=JSON.stringify(e.lanyard.body);s.update(1/30);const reduced=frozen===JSON.stringify(e.lanyard.body);s.surfaceMotionPreference=preference;
    app.setMotionClip(app.records.get(id),{v:1,enabled:true,duration:1,mode:'loop',start:{},end:{x:.12,rotation:12}});
    const cycle=s.animationFrames(e,{size:144,fps:3});const top=cycle.frames.every(c=>c.getContext('2d').getImageData(0,0,c.width,1).data.some((v,i)=>i%4===3&&v>100));app.undo();
    return{locked,reduced,motion:cycle.frames.length>1&&top};
  },initial.id);
  assert(safeguards.locked&&safeguards.reduced&&safeguards.motion,JSON.stringify(safeguards));
  await page.locator('#ctl-badgeStrapView').selectOption('loop');await page.waitForFunction(()=>!stickerApp.selected.atlas.cord);await page.locator('#ctl-badgeStrapView').selectOption('hanging');await page.waitForFunction(()=>!!stickerApp.selected.atlas.cord);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{stickerApp.scene.update(1/60);stickerApp.scene.render();});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.screenshot({path:path.join(OUT,'lanyard-hanging-mobile.png')});
  assert.deepEqual(errors,[]);console.log('PASS 2.5D tilt/twist, single ribbon, hook alignment, perspective picking and attachments, mouse/touch drops, undo/redo, cancellation, cropped PNG, independent animation exports, view switching and mobile');
}finally{await browser?.close();server.close();}
