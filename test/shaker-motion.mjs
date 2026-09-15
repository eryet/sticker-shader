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
  const id = await page.evaluate(() => stickerApp.selected.id);

  await page.evaluate(()=>{stickerApp.addIcon('heart');stickerApp.addIcon('star');});
  const physics = await page.evaluate(()=>{
    const a=stickerApp,e=a.scene.get(a.selected.id),start=e.x;
    e.settings.shakerLoop=false;e.rotZ=e.arot=0;
    const run=(direction)=>{
      e.shaker=StickerShaker.create(a.selected.shakerItems);e.x=start;e.ax=e.ay=0;
      a.scene._updateShaker(e,1/60);
      const before=e.shaker.bodies.map(b=>({...b}));
      e.x+=direction*8;a.scene._updateShaker(e,1/60);
      return {vx:e.shaker.bodies[0].vx,positions:e.shaker.bodies.map(b=>({...b})),before};
    };
    const right=run(1),left=run(-1);
    e.x=start;e.shaker=StickerShaker.create(a.selected.shakerItems);
    const tex=e.tex.img, atlas=e.atlas, samples=new Set(),times=[];
    for(let i=0;i<120;i++){
      const t=performance.now();e.x=start+Math.sin(i/10)*40;a.scene._updateShaker(e,1/60);times.push(performance.now()-t);
      samples.add(e.shaker.bodies.map(b=>b.x.toFixed(2)+','+b.y.toFixed(2)).join('/'));
    }
    const afterDrag=e.shaker.bodies.map(b=>({...b}));
    for(let i=0;i<600;i++)a.scene._updateShaker(e,1/60);
    const atRest=e.shaker.bodies.map(b=>({...b}));
    for(let i=0;i<60;i++)a.scene._updateShaker(e,1/60);
    const settling=Math.max(...e.shaker.bodies.map((b,i)=>Math.hypot(b.x-atRest[i].x,b.y-atRest[i].y)));
    times.sort((a,b)=>a-b);
    const confined=e.shaker.bodies.every(b=>Number.isFinite(b.x)&&StickerShaker.contact(e.shaker,b).d>=-.15);
    // Tilt changes local gravity without resetting the pieces.
    const body=e.shaker.bodies[0];e.rotZ=Math.PI/2;
    for(let i=0;i<180;i++)a.scene._updateShaker(e,1/60);
    return {right:right.vx,left:left.vx,samples:samples.size,settling,confined,
      p95:times[Math.floor(times.length*.95)],reuse:tex===e.tex.img&&atlas===e.atlas,
      tilt:e.shaker.bodies[0].x,continuous:afterDrag.some((b,i)=>Math.hypot(b.x-atRest[i].x,b.y-atRest[i].y)>1)};
  });
  assert(physics.right<0&&physics.left>0,JSON.stringify(physics));
  assert(physics.samples>100 && physics.reuse && physics.confined && physics.continuous,JSON.stringify(physics));
  assert(physics.settling<1 && physics.tilt<0,JSON.stringify(physics));
  console.log('PASS direction-sensitive inertia, continuous updates, settling, tilt and reused texture',JSON.stringify(physics));
  const point=await page.evaluate(()=>{
    const a=stickerApp,e=a.scene.get(a.selected.id);e.rotZ=0;e.settings.baseRotation=0;e.x=e.restX=a.scene.stageW/2;e.y=e.restY=a.scene.stageH/2;e.vx=e.vy=0;
    e.shaker=StickerShaker.create(a.selected.shakerItems);a.scene.start();
    const box=document.querySelector('#glCanvas').getBoundingClientRect();return{x:box.x+e.x,y:box.y+e.y};
  });
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  assert(await page.evaluate(()=>!!stickerApp.scene.drag?.entry.shaker));
  const poses=[];
  for(let i=0;i<40;i++){
    await page.mouse.move(point.x+Math.sin(i/4)*100,point.y+Math.cos(i/5)*45);
    await page.waitForTimeout(16);
    poses.push(await page.evaluate(()=>stickerApp.scene.drag.entry.shaker.bodies[0].x));
  }
  await page.mouse.up();
  const release=await page.evaluate(()=>{const e=stickerApp.scene.get(stickerApp.selected.id);return{elapsed:e.shaker.elapsed,burst:e.shaker.burst};});
  assert.equal(release.burst,0,'dragging never starts a canned shake');
  assert(new Set(poses.map(x=>x.toFixed(1))).size>25);
  await page.waitForTimeout(500);
  assert(await page.evaluate(t=>stickerApp.scene.get(stickerApp.selected.id).shaker.elapsed>t,release.elapsed));
  fs.mkdirSync(OUT,{recursive:true});
  await page.screenshot({path:path.join(OUT,'shaker-live-drag.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS real mouse drag/reversal/release with persistent live bodies');
} finally { if(browser)await browser.close();server.close(); }
