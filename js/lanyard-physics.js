/* One flexible, almost inextensible ribbon carrying a rigid badge.
 * Distances are in canvas pixels, time in seconds. Fixed steps keep throws
 * consistent on 30/60/120 Hz displays; exports get their own solver.
 * Pitch and twist are bounded spring responses, not a second 3D simulation. */
globalThis.StickerCord = (() => {
  const STEP = 1 / 120, SEGMENTS = 16;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function hook(s) {
    return { x: s.body.x + Math.sin(s.body.angle) * s.arm, y: s.body.y - Math.cos(s.body.angle) * s.arm };
  }
  function create({ x, y, width, height, arm, top = -24, slack = 1.002, angle = 0 }) {
    const s = { body: { x, y, vx: 0, vy: 0, angle, omega: 0, pitch: 0, yaw: 0, pitchVelocity: 0, yawVelocity: 0 }, width, height, arm,
      inertia: 12 / (width * width + height * height), gravity: height * 5.5,
      anchors: [{ x, y: top }], ropes: [], lengths: [], time: 0, remainder: 0 };
    const end = hook(s);
    for (const anchor of s.anchors) {
      s.lengths.push(Math.hypot(end.x - anchor.x, end.y - anchor.y) * slack / SEGMENTS);
      s.ropes.push(Array.from({ length: SEGMENTS }, (_, i) => {
        const t = i / SEGMENTS;
        return { x: anchor.x + (end.x - anchor.x) * t, y: anchor.y + (end.y - anchor.y) * t, vx: 0, vy: 0 };
      }));
    }
    return s;
  }
  function step(s, input) {
    const b = s.body, old = { x: b.x, y: b.y, angle: b.angle }, drag = input.target;
    const decay = Math.exp(-STEP * (input.damping ?? 1.4));
    if (drag) {
      // A finite spring lets the fabric resist a pull instead of teleporting.
      const max = s.height * 18, k = 150, damp = 21;
      b.vx += clamp((drag.x - b.x) * k - b.vx * damp, -max, max) * STEP;
      b.vy += clamp((drag.y - b.y) * k - b.vy * damp, -max, max) * STEP;
      b.omega += clamp((drag.x - b.x) * (input.gripY || 0) / (s.height * s.height) * 35, -5, 5) * STEP;
    }
    b.vy += s.gravity * STEP;
    b.vx *= decay; b.vy *= decay; b.omega *= Math.exp(-STEP * 1.8);
    b.x += b.vx * STEP; b.y += b.vy * STEP; b.angle += b.omega * STEP;
    for (const rope of s.ropes) for (let i = 1; i < rope.length; i++) {
      const p = rope[i]; p.ox = p.x; p.oy = p.y;
      p.vx *= Math.exp(-STEP * 2); p.vy = p.vy * Math.exp(-STEP * 2) + s.gravity * STEP;
      p.x += p.vx * STEP; p.y += p.vy * STEP;
    }
    for (let iteration = 0; iteration < 22; iteration++) {
      for (let side = 0; side < s.ropes.length; side++) {
        const rope = s.ropes[side], rest = s.lengths[side];
        Object.assign(rope[0], s.anchors[side]);
        // Alternate directions so the end nearest the badge gets equal priority.
        for (let j = 0; j < SEGMENTS; j++) {
          const i = iteration % 2 ? SEGMENTS - 1 - j : j;
          const a = rope[i], endpoint = i === SEGMENTS - 1, z = endpoint ? hook(s) : rope[i + 1];
          let dx = z.x - a.x, dy = z.y - a.y, len = Math.hypot(dx, dy) || 1;
          dx /= len; dy /= len;
          const wa = i ? 22 : 0, torque = endpoint ? s.arm * (dx * Math.cos(b.angle) + dy * Math.sin(b.angle)) : 0;
          const wb = endpoint ? 1 + s.inertia * torque * torque : 22;
          const correction = (len - rest) / (wa + wb);
          a.x += dx * correction * wa; a.y += dy * correction * wa;
          if (endpoint) {
            b.x -= dx * correction; b.y -= dy * correction; b.angle -= s.inertia * torque * correction;
          } else { z.x -= dx * correction * wb; z.y -= dy * correction * wb; }
        }
        // Very weak bending resistance removes sharp kinks without making a rod.
        for (let i = 1; i < rope.length - 1; i++) {
          const p = rope[i], a = rope[i - 1], z = rope[i + 1];
          p.x += ((a.x + z.x) * .5 - p.x) * .012;
          p.y += ((a.y + z.y) * .5 - p.y) * .012;
        }
      }
    }
    const maxSpeed = s.height * 7;
    b.vx = clamp((b.x - old.x) / STEP, -maxSpeed, maxSpeed);
    b.vy = clamp((b.y - old.y) / STEP, -maxSpeed, maxSpeed);
    b.omega = clamp((b.angle - old.angle) / STEP, -9, 9);
    // Inertia tilts the printed plane, while a gentle restoring torque keeps
    // the front readable. Off-centre grabs add twist; release can overshoot.
    const yawTarget = drag ? clamp((drag.x-b.x)/s.width*1.3+(input.gripX||0)/s.width*.65+b.vx/s.height*.12,-.65,.65) : clamp(b.omega*.045,-.12,.12);
    const pitchTarget = drag ? clamp(.14-(drag.y-b.y)/s.height*.9+(input.gripY||0)/s.height*.2,-.36,.42) : clamp(-b.vy/s.height*.08,-.12,.12);
    for(const [axis,target,limit] of [['yaw',yawTarget,.72],['pitch',pitchTarget,.48]]){
      const velocity=axis+'Velocity';
      if(input.depthMotion===false){b[axis]=b[velocity]=0;continue;}
      b[velocity]+=((target-b[axis])*34-b[velocity]*(3.3+(input.damping??1.4)))*STEP;
      b[axis]+=b[velocity]*STEP;
      if(Math.abs(b[axis])>limit){b[axis]=clamp(b[axis],-limit,limit);b[velocity]*=-.15;}
    }
    for (const rope of s.ropes) for (let i = 1; i < rope.length; i++) {
      const p = rope[i]; p.vx = clamp((p.x - p.ox) / STEP, -maxSpeed, maxSpeed); p.vy = clamp((p.y - p.oy) / STEP, -maxSpeed, maxSpeed);
    }
    s.time += STEP;
  }
  function advance(s, dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return s;
    s.remainder += Math.min(dt, .1);
    while (s.remainder + 1e-10 >= STEP) { step(s, input); s.remainder -= STEP; }
    return s;
  }
  function points(s, side) { return [...s.ropes[side].map(p => ({ x: p.x, y: p.y })), hook(s)]; }
  function settle(s) { for (let i = 0; i < 180; i++) step(s, { damping: 12 }); s.body.vx = s.body.vy = s.body.omega = s.body.pitch = s.body.yaw = s.body.pitchVelocity = s.body.yawVelocity = 0; for (const r of s.ropes) for (const p of r) p.vx = p.vy = 0; s.time = s.remainder = 0; return s; }
  return { create, advance, points, hook, settle, STEP };
})();
