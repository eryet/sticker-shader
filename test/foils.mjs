/* Real shader rendering and editor integration for the material collection. */
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
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); }); await page.route('https://**', r => r.abort());
  await page.addInitScript(() => localStorage.setItem('sticker-shader-editor:locale', 'en'));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => window.stickerApp);
  fs.mkdirSync(OUT,{recursive:true});
  await page.evaluate(()=>{
    I18N.setLocale('en');const settings={...StickerUI.DEFAULTS};StickerUI.applyMaterial(settings,'jelly');
    Object.assign(settings,{borderColor:'#ffdbea',borderWidth:16,lightStrength:47,shadowOpacity:.3,materialTint:'#a9dfff',materialOpacity:.41});
    stickerApp.addIcon('heart',{settings});
    const group=document.querySelector('[data-group="foil"]');group.classList.remove('collapsed');group.querySelector('.group-head').setAttribute('aria-expanded','true');
  });
  const baseline=()=>page.evaluate(()=>({settings:{...stickerApp.selected.settings},history:stickerApp.history.undo.length,count:stickerApp.records.size}));
  const before=await baseline();
  await page.locator('#btnCompareFoils').click();
  assert.equal(await page.locator('#compareMaterial').inputValue(),'foil-shards');
  const variants=await page.evaluate(()=>StickerUI.comparisonVariants().filter(v=>v.foil));
  assert.equal(variants.length,5);
  for(const v of variants) {
    await page.locator('#compareMaterial').selectOption(v.id);
    assert.deepEqual(await baseline(),before,'foil comparisons do not commit settings');
    const preview=await page.evaluate(()=>stickerApp.scene.comparison.after);
    for(const k of ['material','materialTint','materialOpacity','artworkOpacity','borderColor','borderWidth','shadowOpacity','lightStrength'])assert.equal(preview[k],before.settings[k],k+' preserved');
    assert.equal(preview.pattern,v.foil);assert.equal(preview.materialFinish,'custom');
  }
  await page.locator('#compareApply').click();
  assert.equal((await baseline()).history,before.history+1);assert.equal((await baseline()).settings.pattern,'diffraction');
  await page.evaluate(()=>stickerApp.undo());assert.deepEqual(await baseline(),before);
  await page.selectOption('#presetSelect','Star confetti');assert.equal((await baseline()).settings.pattern,'stars');assert.equal((await baseline()).settings.material,'jelly');assert.equal((await baseline()).settings.materialTint,before.settings.materialTint);
  await page.evaluate(()=>stickerApp.undo());assert.deepEqual(await baseline(),before);
  const report=await page.evaluate(()=>{
    const renderer=stickerApp.renderer,size=320,c=document.createElement('canvas');c.width=c.height=size;
    const ctx=c.getContext('2d');ctx.fillStyle='#fff7fb';ctx.beginPath();ctx.arc(160,160,112,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffd1e2';ctx.beginPath();ctx.arc(160,142,74,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#402d41';ctx.textAlign='center';ctx.font='bold 40px sans-serif';ctx.fillText('SHINE',160,156);ctx.font='13px sans-serif';ctx.fillText('MAKE IT YOURS',160,211);
    const sdf=new Float32Array(size*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++)sdf[y*size+x]=113-Math.hypot(x+.5-160,y+.5-160);
    const tex=renderer.createTextures({canvas:c,sdf,w:size,h:size});
    const render=(s,light=[-140,190,500])=>renderer.renderToCanvas({width:size,height:size,draw(){renderer.beginFrame({stageW:size,stageH:size,camDist:6400,light,time:0});renderer.drawSticker(tex,{x:0,y:0,z:0,rotX:0,rotY:0,rotZ:0,width:size,height:size},s);}});
    const pixels=c=>c.getContext('2d').getImageData(0,0,size,size).data;
    const signature=c=>pixels(c).reduce((n,v,i)=>n+v*(i%11+1),0);
    const sheet=document.createElement('canvas');sheet.width=1020;sheet.height=820;const out=sheet.getContext('2d');out.fillStyle='#fff5fa';out.fillRect(0,0,1020,820);out.fillStyle='#402d41';out.font='bold 28px sans-serif';out.fillText('Holographic foil collection',24,40);out.font='15px sans-serif';out.fillText('Same artwork · Five new foil finishes · Real editor renders',24,67);
    const results=Object.entries(StickerUI.FOIL_LOOKS).map(([id,f],i)=>{
      const s={...StickerUI.DEFAULTS,borderWidth:15,materialFinish:'custom',...f.settings};
      const img=render(s),data=pixels(img),moved=pixels(render(s,[240,-150,300]));
      const x=i%3*340+10,y=90+Math.floor(i/3)*360;out.fillStyle='#e2eaf5';out.fillRect(x,y,320,320);out.drawImage(img,x,y);out.fillStyle='#402d41';out.font='bold 18px sans-serif';out.fillText(f.label,x+12,y+343);
      const controls=['bandScale','patternAngle','hueShift','holoSpread'].map(k=>{const values={bandScale:[1,14],patternAngle:[-45,70],hueShift:[0,.5],holoSpread:[0,5]}[k];return signature(render({...s,[k]:values[0]}))!==signature(render({...s,[k]:values[1]}));});
      return {id,signature:signature(img),corner:data[3],moves:data.some((v,j)=>Math.abs(v-moved[j])>3),controls,zero:signature(render({...s,lightStrength:0}))===signature(render({...s,lightStrength:0,pattern:'none',metallic:0,glitter:0,holoIntensity:0}))};
    });renderer.deleteTextures(tex);return {results,png:sheet.toDataURL(),error:renderer.gl.getError()};
  });
  assert.equal(new Set(report.results.map(r=>r.signature)).size,5);assert(report.results.every(r=>r.corner===0&&r.moves&&r.controls.every(Boolean)&&r.zero),JSON.stringify(report.results));assert.equal(report.error,0);
  fs.writeFileSync(path.join(OUT,'foil-collection.png'),Buffer.from(report.png.split(',')[1],'base64'));
  const persisted=await page.evaluate(async()=>{
    const outputs=[];
    for(const [id,f] of Object.entries(StickerUI.FOIL_LOOKS)) {
      const rec=stickerApp.addIcon('star',{settings:{...StickerUI.DEFAULTS,...f.settings,materialFinish:'custom'}}), e=stickerApp.scene.get(rec.id);
      const png=stickerApp.scene.snapshot(e,{scale:.2}),frames=stickerApp.scene.animationFrames(e,{size:96,fps:2,seconds:1,shadow:false});outputs.push({id,png:png.width,gif:StickerAnim.encodeGIF(frames.frames,2).size});
    }
    const {url}=await stickerApp.shareLink(), ids=new Set(stickerApp.records.keys());await stickerApp.loadSharedScene(new URL(url).hash);
    return {outputs,restored:[...stickerApp.records.values()].filter(r=>!ids.has(r.id)).map(r=>r.settings.pattern)};
  });
  assert(persisted.outputs.every(o=>o.png>0&&o.gif>100&&persisted.restored.includes(o.id)));
  await page.evaluate(()=>{I18N.setLocale('zh-TW');stickerApp.scene.select(stickerApp.scene.stickers.at(-1));});await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{const g=document.querySelector('[data-group="foil"]');g.classList.remove('collapsed');});
  await page.locator('#btnCompareFoils').click();assert.equal(await page.locator('#compareAfterName').innerText(),'稜鏡碎片');
  await page.locator('#compareMaterial').click();
  await page.waitForFunction(()=>{const p=document.querySelector('#compareMaterial'),list=p.querySelector('.select-options');if(!list)return true;const a=p.selectedOptions[0].getBoundingClientRect(),b=list.getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom;},{},{timeout:5000});
  await page.screenshot({path:path.join(OUT,'foil-picker-mobile.png')});await page.keyboard.press('Escape');await page.locator('#compareCancel').click();
  const selected=await page.evaluate(()=>stickerApp.selected.id);await page.evaluate(id=>stickerApp.lockObject(id),selected);assert(await page.locator('#btnCompareFoils').isDisabled());
  assert.deepEqual(errors,[]);console.log('PASS five distinct foils, responsive patterns, isolated comparison, material preservation, preset/undo, sharing, PNG/GIF, translated custom picker and locks');
} finally {await browser?.close();server.close();}
