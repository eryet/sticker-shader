/* Authored motion is sampled from time, never integrated from previous frames. */
window.StickerMotion = (() => {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const number = (v, fallback, a, b) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : fallback;
  const pick = (v, values, fallback) => values.includes(v) ? v : fallback;
  const identity = () => ({ x: 0, y: 0, rotation: 0, tiltX: 0, tiltY: 0, scale: 1, opacity: 1 });
  function pose(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    return { x: number(value.x, 0, -1.5, 1.5), y: number(value.y, 0, -1.5, 1.5),
      rotation: number(value.rotation, 0, -720, 720), tiltX: number(value.tiltX, 0, -40, 40), tiltY: number(value.tiltY, 0, -40, 40),
      scale: number(value.scale, 1, .1, 2), opacity: number(value.opacity, 1, 0, 1) };
  }
  function normalizeClip(value) {
    if (!value || typeof value !== 'object' || value.v !== 1) return null;
    const clip = { v: 1, enabled: value.enabled !== false, duration: number(value.duration, 4, 1, 8),
      mode: pick(value.mode, ['loop', 'once'], 'loop'), easing: pick(value.easing, ['smooth', 'soft', 'pop', 'linear'], 'smooth'),
      // Fractions keep the total duration stable while users adjust the holds.
      holdEnd: number(value.holdEnd, .375, 0, .6), holdStart: number(value.holdStart, .125, 0, .2),
      start: pose(value.start), end: pose(value.end),
      light: pick(value.light, ['keep', 'right', 'left', 'diagonal', 'orbit'], 'right'),
      lightStart: number(value.lightStart, .25, 0, .85), lightEnd: number(value.lightEnd, .625, .1, 1) };
    clip.lightEnd = clamp(clip.lightEnd, clip.lightStart + .05, clip.mode === 'loop' ? .9 : 1);
    return clip;
  }
  function ease(t, name) {
    t = clamp(t, 0, 1);
    if (name === 'linear') return t;
    if (name === 'soft') return (1 - Math.cos(t * Math.PI)) / 2;
    const smooth = t * t * t * (t * (t * 6 - 15) + 10);
    // A bounded anticipation/overshoot with zero velocity at both endpoints.
    return name === 'pop' ? smooth + .13 * Math.sin(t * Math.PI * 2) * Math.sin(t * Math.PI) ** 2 : smooth;
  }
  function timing(clip) {
    const loop = clip.mode === 'loop', travel = (1 - clip.holdEnd - (loop ? clip.holdStart : 0)) / (loop ? 2 : 1);
    return { travel, endHold: travel + clip.holdEnd, returnEnd: loop ? travel * 2 + clip.holdEnd : 1 };
  }
  function sample(clip, seconds, options = {}) {
    if (options.neutral) return { ...identity(), phase: 0, progress: 0, light: null };
    const q = clamp(Number.isFinite(seconds) ? seconds / clip.duration : 0, 0, 1), times = timing(clip);
    let p = q < times.travel ? q / times.travel : q <= times.endHold ? 1 : clip.mode === 'loop' && q < times.returnEnd ? 1 - (q - times.endHold) / times.travel : clip.mode === 'loop' ? 0 : 1;
    p = ease(p, clip.easing);
    const result = {};
    for (const key of Object.keys(identity())) result[key] = clip.start[key] + (clip.end[key] - clip.start[key]) * p;
    result.opacity = clamp(result.opacity, 0, 1); result.scale = Math.max(.08, result.scale);
    if (options.endpoint) Object.assign(result, clip[options.endpoint]);
    let light = null;
    if (clip.light !== 'keep') {
      const a = clip.lightStart, b = Math.max(a + .05, clip.lightEnd), end = Math.min(clip.mode === 'loop' ? .9 : 1, b);
      let sweep = q <= a ? 0 : q <= end ? ease((q - a) / (end - a), 'smooth') : 1;
      if (clip.mode === 'loop' && q > end) sweep = 1 - ease((q - end) / Math.max(.001, 1 - end), 'smooth');
      // At an exact loop boundary reset all light coordinates, including orbit.
      if (clip.mode === 'loop' && q === 1) sweep = 0;
      light = clip.light === 'orbit' ? [Math.cos(sweep * Math.PI * 2) * .8, Math.sin(sweep * Math.PI * 2) * .8, 2] :
        [(-.8 + 1.6 * sweep) * (clip.light === 'left' ? -1 : 1), clip.light === 'diagonal' ? .7 - 1.4 * sweep : .55, 2];
    }
    return { ...result, phase: q, progress: p, light };
  }
  const RECIPES = [['slide', 'Slide & shine', 'Arrive softly, then catch the light.'], ['float', 'Float & turn', 'A gentle lift with a little tilt.'],
    ['pop', 'Pop & settle', 'Small to bold, with a soft landing.'], ['light', 'Light sweep', 'Let the foil do the moving.']];
  function recipe(id = 'slide') {
    const clip = normalizeClip({ v: 1, start: { x: -.4, y: .08, rotation: -12, tiltY: -12, scale: .85, opacity: 0 } });
    if (id === 'float') Object.assign(clip, { start: { ...identity(), y: .12, rotation: -8, tiltY: -14 }, end: { ...identity(), y: -.12, rotation: 8, tiltY: 14 }, easing: 'soft', holdEnd: .1, holdStart: .1, light: 'diagonal' });
    if (id === 'pop') Object.assign(clip, { start: { ...identity(), scale: .3, opacity: 0, rotation: -14 }, easing: 'pop' });
    if (id === 'light') Object.assign(clip, { start: identity(), end: identity(), lightStart: 0, lightEnd: .65 });
    return normalizeClip(clip);
  }
  return { normalizeClip, identity, sample, timing, ease, recipe, RECIPES, duration: clip => clip.duration };
})();
