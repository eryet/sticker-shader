import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.join(ROOT,'test/.out');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=http.createServer((req,res)=>{
  const file=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:900},locale:'en-US'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.stickerApp);await page.evaluate(()=>stickerApp.ready);await page.locator('#siteLoader').waitFor({state:'hidden'});
  const setup=await page.evaluate(()=>{
    const a=stickerApp,s=a.scene;s.stop();
    const rec=a.addFrame({settings:{...StickerLanyard.DEFAULTS,workingRes:'384',badgeFace:'back',badgeBackTitle:'MEMORIES'}}),e=s.get(rec.id);s.update(1/60);s.render();
    const png=s.snapshot(e),plain=png.toDataURL();
    a.setMotionClip(rec,{v:1,enabled:true,duration:1,mode:'loop',start:{},end:{x:.12,rotation:12}});
    const withMotion=s.snapshot(e),double=s.snapshot(e,{scale:2});e.motionClock.time=.5;e.motionClock.neutral=false;
    const posed=s.snapshot(e,{posed:true}),top=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,1).data.filter((v,i)=>i%4===3&&v>100).length;
    const result={id:e.id,plain:plain===withMotion.toDataURL(),double:double.width===png.width*2&&double.height===png.height*2,top:top(withMotion),posed:posed.toDataURL()!==plain&&top(posed)>0};
    a.undo();rec.settings.badgeFace='front';s.update(1/60);return result;
  });
  assert(setup.plain&&setup.double&&setup.top>4&&setup.posed,JSON.stringify(setup));
  console.log('PASS flat PNG/@2x retain the cord and resting back with Motion designer; posed PNG keeps the motion pose');
  const animation=await page.evaluate(id=>{
    const a=stickerApp,s=a.scene,e=s.get(id);
    const add=(parent,anim,scale,u,v)=>{const rec=a.addIcon('star',{quiet:true,settings:{workingRes:'256',stickerScale:scale,baseRotation:0,iconBlink:false,anim,animAmount:1,idleSway:0}}),c=s.get(rec.id);c.spawn=0;c.x=parent.x+u*s.size(parent).w;c.y=parent.y+v*s.size(parent).h;s.attach(c,parent);return c;};
    const child=add(e,'spin',.22,.15,.16),nested=add(child,'bounce',.1,.3,.3);
    const run=()=>s.animationFrames(e,{size:160,fps:6}),urls=cycle=>cycle.frames.map(c=>c.toDataURL());
    const before=JSON.stringify(e.lanyard),first=run(),moving=urls(first);child.settings.anim='none';nested.settings.anim='none';const still=urls(run());
    nested.settings.anim='bounce';const nestedOnly=urls(run());nested.settings.anim='none';
    child.settings.anim='spin';nested.settings.anim='bounce';child.settings.animAmount=nested.settings.animAmount=0;const zero=urls(run());child.settings.animAmount=nested.settings.animAmount=1;
    child.settings.animSpeed=2;const fast=urls(run());child.settings.animSpeed=1;
    const lazy=s.animationFrames(e,{size:160,fps:6,lazy:true});let same=true,i=0;for(const frame of lazy.frames)same&&=frame.toDataURL()===moving[i++];
    // Capture the actual draw poses to ensure both nested movement and scaling
    // survive export, rather than counting the parent's swing as icon animation.
    child.settings.anim='pulse';const poses=[],draw=s.renderer.drawSticker;
    s.renderer.drawSticker=function(tex,pose,...rest){if(tex.img===child.tex.img||tex.img===nested.tex.img)poses.push({child:tex.img===child.tex.img,width:pose.width,x:pose.x,y:pose.y});return draw.call(this,tex,pose,...rest);};
    try{run();}finally{s.renderer.drawSticker=draw;}
    const widths=poses.filter(p=>p.child).map(p=>p.width),nestedPositions=poses.filter(p=>!p.child).map(p=>[p.x,p.y]);
    const output={differs:moving.filter((url,i)=>url!==still[i]).length,nestedDiffers:nestedOnly.filter((url,i)=>url!==still[i]).length,zero:zero.every((url,i)=>url===still[i]),speed:fast.some((url,i)=>url!==moving[i]),lazy:same,untouched:before===JSON.stringify(e.lanyard),pulse:Math.max(...widths)-Math.min(...widths),nested:new Set(nestedPositions.map(JSON.stringify)).size};
    s.remove(nested.id);s.remove(child.id);s.select(e);return output;
  },setup.id);
  assert(animation.differs>10&&animation.nestedDiffers>10&&animation.zero&&animation.speed&&animation.lazy&&animation.untouched&&animation.pulse>1&&animation.nested>10,JSON.stringify(animation));
  console.log('PASS spinning, pulsing and nested bouncing attachments, amount/speed, lazy repeatability and isolated live physics');
  const clipping=await page.evaluate(id=>{
    const a=stickerApp,s=a.scene,e=s.get(id),rec=a.records.get(id);
    const icon=a.addIcon('star',{quiet:true,settings:{workingRes:'256',stickerScale:.65,baseRotation:0,iconBlink:false,anim:'spin',idleSway:0}}),c=s.get(icon.id);c.spawn=0;
    c.x=e.x+s.size(e).w*.34;c.y=e.y+s.size(e).h*.42;s.attach(c,e);
    const edges=canvas=>{const {width:w,height:h}=canvas,d=canvas.getContext('2d').getImageData(0,0,w,h).data;let opaque=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((x<2||x>=w-2||y>=h-2)&&d[(y*w+x)*4+3]>120)opaque++;return opaque;};
    const results=[];let png;
    for(const ratio of [.75,1.6])for(const flip of [false,true]){
      rec.settings.badgeRatio=ratio;rec.settings.badgeFlip=flip;a.composeRecord(rec,{sync:true});s.update(1/60);
      const views=[],draw=s.renderer.drawSticker;
      s.renderer.drawSticker=function(tex,pose,...rest){views.push(JSON.stringify([this.view.stageW,this.view.viewportOffset]));return draw.call(this,tex,pose,...rest);};
      let cycle;try{cycle=s.animationFrames(e,{size:192,fps:8});}finally{s.renderer.drawSticker=draw;}
      results.push({ratio,flip,edges:Math.max(...cycle.frames.map(edges)),fixedView:new Set(views).size===1,stillEdges:edges(s.snapshot(e,{scale:.5}))});
      if(ratio===.75&&!flip)png=cycle.frames[8].toDataURL();
    }
    const gif=StickerAnim.encodeGIF(s.animationFrames(e,{size:128,fps:4}).frames,4);s.remove(c.id);s.select(e);
    return{results,png,gif:gif.size};
  },setup.id);
  assert(clipping.results.every(r=>r.edges===0&&r.stillEdges===0&&r.fixedView),JSON.stringify(clipping.results));assert(clipping.gif>100);
  fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'lanyard-export-fitted.png'),Buffer.from(clipping.png.split(',')[1],'base64'));
  console.log('PASS fixed framing contains large animated attachments in portrait/landscape PNGs and swinging/flipping exports');
  await page.evaluate(id=>{stickerApp.scene.select(stickerApp.scene.get(id));stickerApp.scene.start();},setup.id);
  const rotate=page.locator('#objectToolbar [data-action="rotate"]');await rotate.waitFor({state:'hidden'});
  assert(!await page.locator('#ctl-baseRotation').isVisible());
  const unchanged=await page.evaluate(()=>{const a=stickerApp,before=a.selected.settings.baseRotation,history=a.history.undo.length;a.objectAction('rotate');return a.selected.settings.baseRotation===before&&a.history.undo.length===history;});assert(unchanged);
  await page.locator('#ctl-badgeStrapView').selectOption('loop');await rotate.waitFor({state:'visible'});await rotate.click();
  await page.locator('#objectRotationAngle').fill('45');await page.locator('#objectRotationAngle').press('Enter');assert.equal(await page.evaluate(()=>stickerApp.selected.settings.baseRotation),45);
  await page.locator('#ctl-badgeStrapView').selectOption('hanging');await rotate.waitFor({state:'hidden'});assert(await page.locator('#objectRotation').isHidden());
  await page.evaluate(()=>stickerApp.addIcon('star'));await rotate.waitFor({state:'visible'});assert(await rotate.isEnabled());
  assert.deepEqual(errors,[]);console.log('PASS hanging rotation controls/action disabled, full-loop rotation restored, panel closes on view change and regular icons still rotate');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
