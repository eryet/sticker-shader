import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync(new URL('../js/motion.js', import.meta.url), 'utf8'), sandbox);
const M = sandbox.window.StickerMotion;
const near = (a, b, tolerance = 1e-8) => assert(Math.abs(a - b) < tolerance, `${a} != ${b}`);
for (const [id] of M.RECIPES) for (const light of ['keep', 'right', 'left', 'diagonal', 'orbit']) for (const easing of ['smooth', 'soft', 'pop', 'linear']) {
  const clip = M.normalizeClip({ ...M.recipe(id), light, easing, lightStart: .85, lightEnd: .1 });
  const a = M.sample(clip, 0), b = M.sample(clip, clip.duration);
  for (const key of Object.keys(M.identity())) near(a[key], b[key]);
  if (a.light) a.light.forEach((v, i) => near(v, b.light[i]));
  for (let i = 0; i <= 100; i++) {
    const t = i * clip.duration / 100, value = M.sample(clip, t);
    assert(Number.isFinite(value.scale) && value.scale > 0); assert(value.opacity >= 0 && value.opacity <= 1);
    const repeat = JSON.stringify(M.sample(clip, t)); M.sample(clip, clip.duration - t); assert.equal(JSON.stringify(M.sample(clip, t)), repeat);
  }
  const once = M.normalizeClip({ ...clip, mode: 'once' }), end = M.sample(once, once.duration);
  for (const key of Object.keys(M.identity())) near(end[key], once.end[key]);
}
assert.equal(M.normalizeClip({ v: 99 }), null);
assert.equal(M.normalizeClip(null), null);
const hostile = M.normalizeClip({ v: 1, duration: Infinity, holdEnd: 300, holdStart: 200, mode: '<script>', start: { scale: -8, x: 999, opacity: 'bad' }, lightStart: .85, lightEnd: 0 });
assert.equal(hostile.duration, 4); assert.equal(hostile.mode, 'loop'); assert.equal(hostile.start.scale, .1); assert.equal(hostile.start.x, 1.5); assert.equal(hostile.start.opacity, 1);
assert(M.timing(hostile).travel >= .09); near(hostile.lightEnd, .9);
const source = { v: 1, start: { x: .2 } }, copy = M.normalizeClip(source); copy.start.x = .7; assert.equal(source.start.x, .2);
console.log('PASS four recipes, all light/easing combinations, arbitrary seeking, closed loops, Once endpoints, bounded validation and independent copies');
