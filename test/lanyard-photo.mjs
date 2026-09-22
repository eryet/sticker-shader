import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.join(ROOT,'test/.out');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=http.createServer((req,res)=>{
  const file=path.join(ROOT,req.url.split('?')[0]==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
  fs.mkdirSync(OUT,{recursive:true});browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.abort());
  await page.addInitScript(()=>localStorage.setItem('sticker-shader-editor:locale','en'));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.stickerApp?.ready);await page.evaluate(()=>stickerApp.ready);
  const fixture=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=600;c.height=800;const ctx=c.getContext('2d');ctx.fillStyle='#9b948b';ctx.fillRect(0,0,600,800);
    ctx.fillStyle='#fffdf6';ctx.fillRect(80,70,440,640);ctx.fillStyle='#bdff63';ctx.fillRect(80,70,440,190);
    ctx.fillStyle='#152927';ctx.font='bold 52px sans-serif';ctx.fillText('OPEN',110,135);ctx.fillText('SYSTEMS',110,192);ctx.font='20px sans-serif';ctx.fillText('TAIPEI / 2026',112,235);
    ctx.font='bold 56px sans-serif';ctx.fillText('TAYLOR',110,410);ctx.fillText('CHEN',110,474);ctx.font='19px sans-serif';ctx.fillStyle='#66766d';ctx.fillText('MAKE SOMETHING MEANINGFUL.',110,521);
    ctx.fillStyle='#152927';ctx.fillRect(110,582,380,76);ctx.font='bold 25px sans-serif';ctx.fillStyle='#bdff63';ctx.fillText('BUILDER PASS',143,630);
    return c.toDataURL();
  });
  const file=path.join(OUT,'pass-photo-input.png');fs.writeFileSync(file,Buffer.from(fixture.split(',')[1],'base64'));
  await page.locator('#iconMenuWrap summary').click();await page.locator('#btnLanyard').click();
  assert(await page.locator('#lanyardDialog').isVisible());assert(await page.locator('#lanyardEmpty').isVisible());
  await page.locator('#lanyardPhotoInput').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('bad image')});
  await page.waitForFunction(()=>document.querySelector('#lanyardImportError').textContent.includes('Could not'));
  assert.equal(await page.evaluate(()=>stickerApp.records.size),0,'a rejected file creates no records');
  await page.locator('#lanyardPhotoInput').setInputFiles(file);await page.locator('#lanyardCropArea').waitFor({state:'visible'});
  for(const [i,[x,y]] of [[80/600,70/800],[520/600,70/800],[520/600,710/800],[80/600,710/800]].entries()) {
    const rect=await page.locator('#lanyardCropStage').boundingBox(),handle=await page.locator(`#lanyardCropStage [data-corner="${i}"]`).boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(rect.x+x*rect.width,rect.y+y*rect.height,{steps:8});await page.mouse.up();
  }
  await page.locator('#lanyardImportText').fill('OPEN SYSTEMS 2026');await page.locator('#lanyardImportColor').fill('#285bc1');
  await page.screenshot({path:path.join(OUT,'lanyard-import-desktop.png')});
  const before=await page.evaluate(()=>stickerApp.history.undo.length);
  await page.locator('#lanyardCreate').click();await page.locator('#lanyardDialog').waitFor({state:'hidden'});
  const created=await page.evaluate(()=>({id:stickerApp.selected.id,ratio:stickerApp.selected.settings.badgeRatio,photo:stickerApp.selected.frame.photoId,count:stickerApp.records.size,history:stickerApp.history.undo.length}));
  assert.equal(created.count,2);assert(created.photo);assert(Math.abs(created.ratio-440/640)<.04,JSON.stringify(created));assert.equal(created.history,before+1);
  assert(await page.locator('#ctl-badgeHolder').isVisible());assert(!await page.locator('#ctl-frameCaption').isVisible());
  await page.evaluate(()=>stickerApp.undo());assert.equal(await page.evaluate(()=>stickerApp.records.size),0);
  await page.evaluate(()=>stickerApp.redo());await page.evaluate(id=>stickerApp.scene.select(stickerApp.scene.get(id)),created.id);
  assert.equal(await page.evaluate(()=>stickerApp.selected.frame.photoId),created.photo);
  const checks=await page.evaluate(async()=>{
    const app=stickerApp,rec=app.selected,photo=app.records.get(rec.frame.photoId),p=rec.settings;
    app.scene.stop();
    const icon=app.addIcon('star'),attached=app.scene.get(icon.id).parent?.id===rec.id;
    app.scene.select(app.scene.get(rec.id));const dup=app.duplicateSelected();
    const copied=!!dup.frame.photoId&&dup.frame.photoId!==rec.frame.photoId&&app.records.get(dup.frame.photoId).source.toDataURL()===photo.source.toDataURL();app.undo();app.scene.select(app.scene.get(rec.id));
    const q=[[.12,.07],[.91,.16],[.84,.93],[.08,.8]],map=StickerLanyard.projection(q),coords=[[0,0],[1,0],[1,1],[0,1]];
    const corners=coords.every(([u,v],i)=>map(u,v).every((n,j)=>Math.abs(n-q[i][j])<1e-8));
    let rejects=false;try{StickerLanyard.rectify(photo.source,[[0,0],[1,1],[1,0],[0,1]]);}catch{rejects=true;}
    const pic={canvas:photo.source,w:photo.source.width,h:photo.source.height,pad:0},draw=(ctx,pic,_,r)=>ctx.drawImage(pic.canvas,r.x,r.y,r.w,r.h);
    const first=StickerLanyard.compose(p,pic,draw),second=StickerLanyard.compose({...p,frameLanyardColor:'#ae3434'},pic,draw),r=first.layout.window;
    const pixels=c=>c.getContext('2d').getImageData(r.x,r.y,r.w,r.h).data,pa=pixels(first.canvas),pb=pixels(second.canvas);
    const preserved=pa.every((v,i)=>v===pb[i]);
    const sheet=document.createElement('canvas');sheet.width=1500;sheet.height=1100;const ctx=sheet.getContext('2d');ctx.fillStyle='#eeeee8';ctx.fillRect(0,0,1500,1100);
    for(const [i,color] of ['#285bc1','#294c40','#b75036'].entries()) {
      const c=StickerLanyard.compose({...p,frameLanyardColor:color,badgeMetal:i===2?'gold':'silver'},pic,draw).canvas,scale=Math.min(450/c.width,1030/c.height);ctx.drawImage(c,500*i+(500-c.width*scale)/2,25,c.width*scale,c.height*scale);
    }
    const a=photo.atlas,spec={kind:'frame',settings:{...p},photo:{data:a.canvas.getContext('2d').getImageData(0,0,a.w,a.h).data,sdf:a.sdf,w:a.w,h:a.h,pad:a.pad},workingRes:'384'};
    const main=StickerDecor.buildComposed(spec),worker=new Worker('js/compose-worker.js');let offscreen;
    try{offscreen=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('worker timeout')),20000);worker.onmessage=({data})=>{clearTimeout(timer);data.type==='error'?reject(new Error(data.message)):resolve(data.out);};worker.postMessage({type:'compose',id:'test',seq:1,spec});});}finally{worker.terminate();}
    const frames=app.scene.animationFrames(app.scene.get(rec.id),{size:192,fps:3,tilt:true}),gif=StickerAnim.encodeGIF(frames.frames,frames.fps),apng=await StickerAnim.encodeAPNG(frames.frames,frames.fps);
    const decoded=[];
    for(const blob of [gif,apng]) {
      const decoder=new ImageDecoder({data:await blob.arrayBuffer(),type:blob.type==='image/apng'?'image/png':blob.type});await decoder.tracks.ready;
      const count=decoder.tracks.selectedTrack.frameCount,samples=[];
      for(const index of [0,count-1]) {
        const {image}=await decoder.decode({frameIndex:index}),c=document.createElement('canvas');c.width=c.height=192;
        const ctx=c.getContext('2d');ctx.drawImage(image,0,0);image.close();const data=ctx.getImageData(0,0,192,192).data;let green=0,clear=0;
        for(let i=0;i<data.length;i+=4){if(data[i]>90&&data[i+1]>180&&data[i+2]<150&&data[i+3]>200)green++;if(data[i+3]===0)clear++;}
        samples.push(green>20&&clear>1000);
      }
      decoded.push(count>1&&samples.every(Boolean));decoder.close();
    }
    const workerDelta=main.mask.reduce((max,v,i)=>Math.max(max,Math.abs(v-offscreen.mask[i])),0);
    const workerMean=main.mask.reduce((sum,v,i)=>sum+Math.abs(v-offscreen.mask[i]),0)/main.mask.length;
    // Canvas and OffscreenCanvas round translucent shadows slightly differently.
    return{attached,copied,corners,rejects,preserved,decoded,worker:JSON.stringify(main.layout)===JSON.stringify(offscreen.layout)&&workerDelta<.035&&workerMean<.0002,workerDelta,workerMean,alpha:main.mask.some(v=>v>.02&&v<.9),png:app.scene.snapshot(app.scene.get(rec.id)).toDataURL(),sheet:sheet.toDataURL(),gif:gif.size,apng:apng.size,svg:!new DOMParser().parseFromString(app.animatedSvg(app.scene.get(rec.id)),'image/svg+xml').querySelector('parsererror')};
  });
  assert(checks.attached&&checks.copied&&checks.corners&&checks.rejects&&checks.preserved&&checks.worker&&checks.alpha&&checks.svg,JSON.stringify({...checks,png:undefined,sheet:undefined}));
  assert(checks.decoded.every(Boolean),'animated exports retain the photographed pass and transparent surroundings');
  assert(checks.gif>100&&checks.apng>100);fs.writeFileSync(path.join(OUT,'lanyard-variants.png'),Buffer.from(checks.sheet.split(',')[1],'base64'));fs.writeFileSync(path.join(OUT,'lanyard-export.png'),Buffer.from(checks.png.split(',')[1],'base64'));
  await page.locator('#ctl-badgeMetal').selectOption('gold');await page.evaluate(()=>stickerApp.undo());assert.equal(await page.evaluate(()=>stickerApp.selected.settings.badgeMetal),'silver');await page.evaluate(()=>stickerApp.redo());
  await page.locator('#btnReplacePhoto').click();assert(await page.locator('#lanyardCreate').isDisabled());await page.locator('#lanyardPhotoInput').setInputFiles(file);await page.locator('#lanyardCropArea').waitFor({state:'visible'});
  await page.locator('#lanyardRotatePhoto').click();await page.locator('#lanyardCreate').click();await page.locator('#lanyardDialog').waitFor({state:'hidden'});
  assert(await page.evaluate(()=>stickerApp.selected.settings.badgeRatio>1));assert.equal(await page.evaluate(()=>stickerApp.selected.settings.badgeMetal),'gold','replacing a pass keeps the holder style');
  await page.evaluate(()=>stickerApp.undo());assert.equal(await page.evaluate(()=>stickerApp.selected.frame.photoId),created.photo);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>I18N.setLocale('zh-TW'));
  await page.locator('#btnReplacePhoto').click();await page.locator('#lanyardPhotoInput').setInputFiles(file);await page.locator('#lanyardCropArea').waitFor({state:'visible'});
  await page.locator('#lanyardCropStage [data-corner="0"]').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>parseFloat(document.querySelector('#lanyardCropStage [data-corner="0"]').style.top)>0);
  assert(await page.locator('#lanyardCropStage [data-corner="0"]').evaluate(el=>parseFloat(el.style.left)>0&&parseFloat(el.style.top)>0));
  assert(await page.locator('#lanyardDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.screenshot({path:path.join(OUT,'lanyard-import-mobile.png')});await page.keyboard.press('Escape');assert(!await page.locator('#lanyardDialog').isVisible());
  const shared=await page.evaluate(async()=>{
    const before=new Set(stickerApp.records.keys()),{url}=await stickerApp.shareLink();await stickerApp.loadSharedScene(new URL(url).hash);
    const rec=[...stickerApp.records.values()].find(r=>!before.has(r.id)&&r.settings.frameDesign==='lanyard');
    return !!rec&&rec.settings.badgeMetal==='gold'&&rec.settings.frameLanyardText==='OPEN SYSTEMS 2026'&&!rec.frame.photoId;
  });
  assert(shared,'share links retain lanyard settings while keeping the uploaded photo local');
  assert.deepEqual(errors,[]);console.log('PASS photo crop, perspective mapping, invalid files, original print, strap variants, transparency, worker parity, atomic undo/redo, duplication, icon attachments, replacement, exports and mobile keyboard controls');
}finally{await browser?.close();server.close();}
