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
  await page.locator('#iconMenuWrap summary').click();
  await page.locator('#btnShaker').click();
  await page.waitForFunction(() => stickerApp.selected?.icon === 'shaker');
  assert(await page.locator('#shakerControls').isVisible());
  await page.evaluate(() => stickerApp.scene.stop());
  await page.locator('[data-shaker-collection="taiwan"]').click();
  assert.equal(await page.locator('#shakerDesigns button:visible').count(),7);
  assert.equal(await page.evaluate(()=>stickerApp.selected.settings.shakerDesign),'round','browsing does not change the design');
  const originalFinish = await page.evaluate(() => Object.fromEntries(Object.keys(StickerShaker.ILLUSTRATED_FINISH).map(key => [key, stickerApp.selected.settings[key]])));
  const gallery=[];
  for(const [design,label] of await page.evaluate(()=>StickerShaker.COLLECTIONS.taiwan)){
    await page.locator(`[data-design="${design}"]`).click();
    const state=await page.evaluate(()=>{const e=stickerApp.scene.get(stickerApp.selected.id);return{design:e.shaker.geometry.name,color:e.settings.shakerColor,bodies:e.shaker.bodies.length,png:stickerApp.scene.snapshot(e).toDataURL()};});
    assert.equal(state.design,design);assert.equal(state.bodies,0,'no default floating objects');
    const clipped = await page.evaluate(design => {
      const c = StickerShaker.render([], StickerShaker.COLORS[design], {shakerDesign:design})[0];
      const rgba = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const alpha = (x, y) => rgba[(y * c.width + x) * 4 + 3];
      return Array.from({length:c.width}, (_, i) => Math.max(alpha(i, 0), alpha(i, c.height - 1), alpha(0, i), alpha(c.width - 1, i))).some(a => a > 40);
    }, design);
    assert.equal(clipped, false, `${design}: hardware, flowers and tassels fit inside the artwork`);
    assert.equal(state.color,await page.evaluate(id=>StickerShaker.COLORS[id],design));
    gallery.push({design,label,png:state.png});
    assert(await page.evaluate(() => Object.entries(StickerShaker.ILLUSTRATED_FINISH).every(([key, value]) => stickerApp.selected.settings[key] === value)), 'soft finish is applied with the design');
    if (design === 'tw-boba') {
      await page.evaluate(() => stickerApp.undo());
      assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.keys(StickerShaker.ILLUSTRATED_FINISH).map(key => [key, stickerApp.selected.settings[key]]))), originalFinish, 'undo restores the original finish');
      await page.evaluate(() => stickerApp.redo());
    }
  }
  const before=await page.evaluate(()=>({design:stickerApp.selected.settings.shakerDesign,color:stickerApp.selected.settings.shakerColor}));
  await page.locator('[data-design="tw-street"]').click();
  await page.evaluate(()=>stickerApp.undo());
  assert.deepEqual(await page.evaluate(()=>({design:stickerApp.selected.settings.shakerDesign,color:stickerApp.selected.settings.shakerColor})),before);
  await page.evaluate(()=>stickerApp.redo());
  await page.evaluate(async () => {
    await stickerApp.addPiknik('assets/piknik/flowers/01-red-flower.png');
    await stickerApp.addPiknik('assets/piknik/taiwan-wildlife/01-leopard-cat-face.png');
    await stickerApp.addPiknik('assets/piknik/taiwan-everyday/01-taiwan-market-bag.png');
  });
  await page.locator('#shakerMode').selectOption('flat');
  await page.locator('#shakerShake').click();
  const movement=await page.evaluate(()=>{
    const e=stickerApp.scene.get(stickerApp.selected.id),before=e.shaker.bodies.map(b=>({...b}));
    for(let i=0;i<120;i++)stickerApp.scene._updateShaker(e,1/60);
    return{changed:e.shaker.bodies.some((b,i)=>Math.hypot(b.x-before[i].x,b.y-before[i].y)>1),bounded:e.shaker.bodies.every(b=>StickerShaker.contact(e.shaker,b).d>=-.05),count:e.shaker.bodies.length};
  });
  assert(movement.changed&&movement.bounded&&movement.count===3,JSON.stringify(movement));
  const exportResult=await page.evaluate(async()=>{
    const a=stickerApp,e=a.scene.get(a.selected.id),dup=a.duplicateSelected();
    const duplicate=dup.settings.shakerDesign==='tw-street'&&dup.shakerItems.length===3;
    a.undo();a.scene.select(e);
    const animation=a.scene.animationFrames(e,{size:128,fps:4,tilt:false});
    const gif=StickerAnim.encodeGIF(animation.frames,animation.fps),apng=await StickerAnim.encodeAPNG(animation.frames,animation.fps);
    return{duplicate,gif:gif.size,apng:apng.size,url:(await a.shareLink()).url};
  });
  assert(exportResult.duplicate&&exportResult.gif>100&&exportResult.apng>100);
  fs.mkdirSync(OUT,{recursive:true});
  for(const item of gallery)fs.writeFileSync(path.join(OUT,item.design+'.png'),Buffer.from(item.png.split(',')[1],'base64'));
  const filled = [];
  for (const { design, label } of gallery) {
    await page.locator(`[data-design="${design}"]`).click();
    const png = await page.evaluate(() => {
      const e = stickerApp.scene.get(stickerApp.selected.id);
      e.shaker.bodies.forEach((body, i) => { body.x = [-8, 9, -1][i]; body.y = [-7, -2, 11][i]; body.a = [-.2, .15, -.08][i]; });
      StickerShaker.constrain(e.shaker); stickerApp.scene._paintShaker(e, e.shaker);
      return stickerApp.scene.snapshot(e).toDataURL();
    });
    filled.push({design, label, png});
  }
  const showcase = await browser.newPage({viewport:{width:1400,height:890}});
  for (const [items, filename, subtitle] of [
    [gallery, 'taiwan-collection.png', 'Soft painted borders · seven empty shells'],
    [filled, 'taiwan-refined-collection.png', 'Preview with PIKNIK icons added · choose your own pieces in the editor'],
  ]) {
    await showcase.setContent(`<html><head><style>body{margin:0;padding:28px;background:#fff4f0;color:#795c58;font:16px system-ui}h1{margin:0 0 6px;font-size:26px}p{margin:0 0 24px;color:#a77c79}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}article{background:#fffdf6;border:1px solid #eacfc7;border-radius:20px;text-align:center;padding:12px}img{width:100%;height:285px;object-fit:contain}h2{font-size:14px;margin:6px 0}</style></head><body><h1>A little Taiwan · 台灣小日子</h1><p>${subtitle}</p><div class="grid">${items.map(x=>`<article><img src="${x.png}"><h2>${x.label}</h2></article>`).join('')}</div></body></html>`);
    await showcase.screenshot({path:path.join(OUT, filename)});
  }
  await showcase.close();
  await page.goto('about:blank');await page.goto(exportResult.url);
  await page.waitForFunction(()=>window.stickerApp&&stickerApp.scene.stickers.some(e=>e.shaker));
  const saved=await page.evaluate(()=>{const a=stickerApp,e=a.scene.stickers.find(e=>e.shaker);a.scene.stop();a.scene.select(e);return{design:e.settings.shakerDesign,count:e.shaker.bodies.length,mode:e.shaker.mode,piknik:e.shaker.items.every(item=>item.icon==='piknik'),finish:e.settings.materialDepth};});
  assert.deepEqual(saved,{design:'tw-street',count:3,mode:'flat',piknik:true,finish:.28});
  assert.equal(await page.locator('[data-shaker-collection="taiwan"]').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>{I18N.setLocale('zh-TW');document.querySelector('#propertiesScroll').scrollTop=0;stickerApp.scene.render();});
  assert.match(await page.locator('[data-design="tw-boba"]').textContent(),/珍珠奶茶/);
  assert.match(await page.locator('[data-design="tw-charm"]').textContent(),/平安/);
  await page.screenshot({path:path.join(OUT,'taiwan-picker-desktop.png')});
  const box=await page.locator('#propertiesScroll').boundingBox();await page.mouse.move(box.x+40,box.y+60);await page.mouse.wheel(0,50000);
  await page.waitForFunction(()=>{const s=document.querySelector('#propertiesScroll');return s.scrollTop+s.clientHeight>=s.scrollHeight-2;});
  await page.setViewportSize({width:390,height:844});await page.locator('#shakerDesigns').scrollIntoViewIfNeeded();
  await page.locator('[data-design="tw-boba"]').click();assert.equal(await page.evaluate(()=>stickerApp.selected.settings.shakerDesign),'tw-boba');
  await page.screenshot({path:path.join(OUT,'taiwan-picker-mobile.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS seven empty Taiwan shells, collection browsing, default palettes and undo, live pieces, duplicate, PNG/GIF/APNG, share reload, Chinese and mobile scrolling');
} finally {if(browser)await browser.close();server.close();}
