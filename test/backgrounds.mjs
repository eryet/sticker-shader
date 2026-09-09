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
  fs.mkdirSync(OUT,{recursive:true});
  await page.evaluate(()=>{I18N.setLocale('en');const g=document.querySelector('[data-group="scene"]');g.classList.remove('collapsed');g.querySelector('.group-head').setAttribute('aria-expanded','true');document.querySelector('.background-collection').open=true;});
  const themes=await page.evaluate(()=>Object.keys(StickerDecor.THEMES).slice(9));assert.equal(themes.length,8);assert.equal(await page.locator('[data-background-theme]').count(),17);
  const state=()=>page.evaluate(()=>({...stickerApp.sceneSettings}));
  const sheet=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=1000;c.height=720;const ctx=c.getContext('2d');ctx.fillStyle='#fff5fa';ctx.fillRect(0,0,1000,720);ctx.fillStyle='#3a2a35';ctx.font='bold 25px sans-serif';ctx.fillText('A little world for your stickers',24,38);
    const results=[];
    Object.entries(StickerDecor.THEMES).slice(9).forEach(([name,t],i)=>{
      const x=16+i%4*246,y=68+Math.floor(i/4)*320;ctx.fillStyle=t.background;ctx.fillRect(x,y,230,264);StickerDecor.fillPattern(ctx,x,y,230,264,t.bgPattern,t.bgPatternColor,t.bgPatternScale*.65);ctx.fillStyle='#3a2a35';ctx.font='bold 16px sans-serif';ctx.fillText(name,x+5,y+288);
      const a=StickerDecor.patternTile(t.bgPattern,t.bgPatternColor,1,2),b=StickerDecor.patternTile(t.bgPattern,t.bgPatternColor,1,2),changed=StickerDecor.patternTile(t.bgPattern,'#33aa99',1,2);
      results.push({stable:a.toDataURL()===b.toDataURL(),tint:a.toDataURL()!==changed.toDataURL(),width:a.width,height:a.height});
    });return {png:c.toDataURL(),results};
  });assert(sheet.results.every(r=>r.stable&&r.tint&&r.width>0&&r.height>0));fs.writeFileSync(path.join(OUT,'background-collection.png'),Buffer.from(sheet.png.split(',')[1],'base64'));
  for(const name of themes){
    const before=await state(), history=await page.evaluate(()=>stickerApp.history.undo.length);
    await page.locator(`[data-background-theme="${name}"]`).click();
    assert.equal((await state()).sceneTheme,name);assert.equal(await page.locator(`[data-background-theme="${name}"]`).getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>stickerApp.history.undo.length),history+1);
    const exportCheck=await page.evaluate(()=>{
      const s=stickerApp.sceneSettings,c=stickerApp.canvasWithBackdrop(),ctx=c.getContext('2d'),ref=document.createElement('canvas');ref.width=c.width;ref.height=c.height;const r=ref.getContext('2d');r.fillStyle=s.background;r.fillRect(0,0,c.width,c.height);StickerDecor.fillPattern(r,0,0,c.width,c.height,s.bgPattern,s.bgPatternColor,s.bgPatternScale*c.width/stickerApp.scene.stageW);
      return {matches:c.toDataURL()===ref.toDataURL(),pattern:document.querySelector('#stage').classList.contains('patterned')};
    });assert(exportCheck.matches&&exportCheck.pattern, name+' matches Canvas PNG');
    await page.evaluate(()=>stickerApp.undo());assert.deepEqual(await state(),before);await page.evaluate(()=>stickerApp.redo());assert.equal((await state()).sceneTheme,name);
  }
  await page.locator('#ctl-checker').click();assert((await state()).checker);await page.locator('[data-background-theme="Dreamy aurora"]').click();assert(!(await state()).checker);await page.evaluate(()=>stickerApp.undo());assert((await state()).checker);
  await page.locator('[data-background-theme="Cosmic postcard"]').click();
  const saved=await page.evaluate(async()=>{const original={...stickerApp.sceneSettings},{url}=await stickerApp.shareLink();stickerApp.applyTheme('Sky');await stickerApp.loadSharedScene(new URL(url).hash);return {original,current:stickerApp.sceneSettings};});assert.deepEqual(saved.current,saved.original);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.evaluate(()=>{I18N.setLocale('zh-TW');const g=document.querySelector('[data-group="scene"]');g.classList.remove('collapsed');document.querySelector('.background-collection').open=true;});await page.locator('.background-collection').scrollIntoViewIfNeeded();assert(await page.locator('.background-gallery').evaluate(e=>e.scrollWidth<=e.clientWidth));assert.equal(await page.locator('[data-background-theme="Dreamy aurora"] span').innerText(),'夢幻極光');}
  await page.locator('.background-collection').screenshot({path:path.join(OUT,'background-gallery-mobile.png')});
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-background-theme="Dreamy aurora"]').hover();assert.equal(await page.locator('[data-background-theme="Dreamy aurora"]').evaluate(e=>getComputedStyle(e).transform),'none');
  assert.deepEqual(errors,[]);console.log('PASS eight deterministic backgrounds, tint, visual gallery, canvas export parity, undo/redo, checker override, sharing, localization and mobile');
}finally{await browser?.close();server.close();}
