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


  assert.equal(await page.evaluate(()=>stickerApp.scene.get(stickerApp.selected.id).shaker.bodies.length),0,'new shaker has no unchosen decorations');
  assert(await page.locator('#shakerEmpty').isVisible());assert(await page.locator('#shakerShake').isDisabled());
  fs.mkdirSync(OUT,{recursive:true});
  const empty=await page.evaluate(()=>stickerApp.scene.snapshot(stickerApp.scene.get(stickerApp.selected.id)).toDataURL());
  fs.writeFileSync(path.join(OUT,'shaker-empty.png'),Buffer.from(empty.split(',')[1],'base64'));
  await page.evaluate(()=>{stickerApp.addIcon('heart');stickerApp.addIcon('star');});
  assert.equal(await page.evaluate(()=>stickerApp.scene.get(stickerApp.selected.id).shaker.bodies.length),2);
  assert(await page.locator('#shakerEmpty').isHidden());
  const scroller=page.locator('#propertiesScroll');
  for(const viewport of [{width:1440,height:900},{width:1280,height:650},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    await scroller.evaluate(el=>el.scrollTo({top:0,behavior:"instant"}));
    await page.waitForTimeout(250);
    const p=await page.locator('#shakerAdd').boundingBox();
    const scale=await page.evaluate(()=>stickerApp.selected.settings.stickerScale);
    await page.mouse.move(p.x+p.width/2,p.y+p.height/2);
    await page.mouse.wheel(0,560);
    await page.waitForFunction(()=>document.querySelector('#propertiesScroll').scrollTop>200);
    await page.mouse.wheel(0,50000);
    await page.waitForFunction(()=>{const el=document.querySelector('#propertiesScroll');return el.scrollTop+el.clientHeight>=el.scrollHeight-2;},null,{timeout:10000});
    const bounds=await page.evaluate(()=>{
      const scroll=document.querySelector('#propertiesScroll').getBoundingClientRect(),foot=document.querySelector('.panel-foot').getBoundingClientRect();
      const last=[...document.querySelectorAll('#panel button, #panel input, #panel select')].reverse().find(el=>el.getClientRects().length)?.getBoundingClientRect();
      return {footVisible:foot.top>=0&&foot.bottom<=innerHeight,lastVisible:last&&last.top>=scroll.top&&last.bottom<=scroll.bottom+.5,bodyScroll:scrollY,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert(bounds.footVisible&&bounds.lastVisible&&!bounds.overflow,JSON.stringify({viewport,bounds}));
    assert.equal(bounds.bodyScroll,0);assert.equal(await page.evaluate(()=>stickerApp.selected.settings.stickerScale),scale);
    await scroller.evaluate(el=>el.scrollTo({top:0,behavior:"instant"}));
    await page.waitForTimeout(250);await scroller.focus();await page.keyboard.press('PageDown');
    await page.waitForFunction(()=>document.querySelector('#propertiesScroll').scrollTop>100);
    await page.waitForTimeout(300);
    console.log('PASS wheel and keyboard reach all properties',JSON.stringify(viewport));
  }
  await page.setViewportSize({width:1440,height:900});await scroller.evaluate(el=>el.scrollTop=0);
  const section=page.locator('.shaker-section').first();const openHeight=await section.evaluate(el=>el.offsetHeight);
  await section.locator('summary').click();assert(await section.evaluate(el=>!el.open&&el.offsetHeight<80));
  await section.locator('summary').click();assert.equal(await section.evaluate(el=>el.offsetHeight),openHeight);
  await page.locator('.shaker-piece-remove').first().click();
  assert.equal(await page.evaluate(()=>stickerApp.scene.get(stickerApp.selected.id).shaker.bodies.length),1);
  await page.evaluate(()=>stickerApp.undo());
  assert.equal(await page.evaluate(()=>stickerApp.scene.get(stickerApp.selected.id).shaker.bodies.length),2);
  await scroller.evaluate(el=>el.scrollTop=0);await page.evaluate(()=>stickerApp.scene.render());
  await page.screenshot({path:path.join(OUT,'shaker-sidebar-desktop.png')});
  // Selecting a regular icon keeps the same complete property scroll area.
  await page.evaluate(()=>{const r=stickerApp.addIcon('flower',{quiet:true});stickerApp.scene.select(stickerApp.scene.get(r.id));});
  assert(await page.locator('#shakerControls').isHidden());
  await scroller.evaluate(el=>el.scrollTop=0);const box=await scroller.boundingBox();
  await page.mouse.move(box.x+30,box.y+60);await page.mouse.wheel(0,600);
  await page.waitForFunction(()=>document.querySelector('#propertiesScroll').scrollTop>100);
  await page.evaluate(id=>stickerApp.scene.select(stickerApp.scene.get(id)),id);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#shakerAdd').scrollIntoViewIfNeeded();
  const mobile=await page.evaluate(()=>({overflow:getComputedStyle(document.querySelector('#propertiesScroll')).overflowY,pageCanScroll:document.documentElement.scrollHeight>innerHeight}));
  assert.equal(mobile.overflow,'visible');assert(mobile.pageCanScroll);
  await page.locator('#shakerLoop').scrollIntoViewIfNeeded();await page.locator('#shakerLoop').check();
  await page.locator('#btnResetSettings').scrollIntoViewIfNeeded();assert(await page.locator('#btnResetSettings').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;}));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#shakerPiecesSection').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(OUT,'shaker-sidebar-mobile.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS no default beads, exact item count after remove/undo, collapsible groups, normal-icon sidebar and mobile properties');
} finally {if(browser)await browser.close();server.close();}
