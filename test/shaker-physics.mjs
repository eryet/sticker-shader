import assert from 'node:assert/strict';
import '../js/shaker.js';

const S = globalThis.StickerShaker;
const box = (x, y, w = 4, h = 3, velocity = {}) => {
  const area = w * h, mass = area * 1.22 / 50;
  const collider = [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
  return { x,y,a:0,vx:0,vy:0,va:0,cx:0,cy:0,size:Math.max(w,h),r:Math.hypot(w,h)/2,
    collider,hull:collider,area,density:1.22,mass,invMass:1/mass,invInertia:12/(mass*(w*w+h*h)),...velocity };
};
const state = (bodies = [], settings = {}) => Object.assign(S.create([], { shakerDesign:'square', shakerMode:'flat', ...settings }, { settle:false }), { bodies });
const kinetic = b => .5*b.mass*(b.vx*b.vx+b.vy*b.vy)+.5*b.va*b.va/b.invInertia;
const run = (s, seconds, force = {}) => {
  for (let i=0;i<Math.round(seconds/S.STEP);i++) {
    S.advance(s,S.STEP,force);
    assert(S.validLayout(s),'every simulated step stays inside the chamber without overlaps');
    assert(s.bodies.every(b=>Number.isFinite(b.x+b.y+b.a+b.vx+b.vy+b.va)));
  }
};

// A glancing collision must create spin, transfer momentum, and dissipate energy.
{
  const a=box(-6,1.2,4,3,{vx:30}),b=box(0,0),s=state([a,b]);
  const before=kinetic(a)+kinetic(b);let maxSpin=0,maxEnergy=0;
  for(let i=0;i<35;i++) { S.advance(s,S.STEP);maxSpin=Math.max(maxSpin,Math.abs(a.va),Math.abs(b.va));maxEnergy=Math.max(maxEnergy,kinetic(a)+kinetic(b));assert(S.validLayout(s)); }
  assert(maxSpin>1,`glancing impact generates spin: ${maxSpin}`);
  assert(b.vx>2,'the struck charm receives momentum');
  assert(maxEnergy<=before+1e-6,'contacts do not add kinetic energy');
  console.log('PASS off-centre collisions transfer spin and momentum without adding energy');
}

// Same impact, different mass: the smaller incoming charm should rebound from a larger one.
{
  const impact = large => {
    const a=box(-7,0,4,4,{vx:30}),b=box(0,0,large?8:4,large?8:4),s=state([a,b]);
    run(s,.2);return { a:a.vx,b:b.vx };
  };
  const equal=impact(false),heavy=impact(true);
  assert(heavy.a<0 && equal.a>0,JSON.stringify({equal,heavy}));
  assert(heavy.b<equal.b*.65,'a larger charm accelerates less on impact');
  const b=box(0,24,8,3,{a:.35,vy:25}),s=state([b]);const before=kinetic(b);
  let spin=0;
  for(let i=0;i<35;i++) { S.advance(s,S.STEP);spin=Math.max(spin,Math.abs(b.va));assert(kinetic(b)<=before+1e-6);assert(S.validLayout(s)); }
  assert(spin>1,'an angled wall landing tips the charm');
  console.log('PASS size-dependent mass and angular wall contacts');
}

// Submergence is measured from area, with a buoyant torque at the displaced water's centre.
{
  const partial=box(0,0,10,4,{a:.6}),s=state([partial],{shakerMode:'gravity',shakerLiquid:true,shakerLiquidLevel:.5});
  S.advance(s,S.STEP);
  assert(Math.abs(partial.wet-.5)<.01);
  assert(partial.va<-.01,'partial immersion rights a tilted rectangular charm');
  const sink = (liquid,viscosity,size) => {
    const b=box(0,4,size,size),s=state([b],{shakerMode:'gravity',shakerLiquid:liquid,shakerLiquidLevel:.95,shakerViscosity:viscosity});
    run(s,.5);return b.y-4;
  };
  const dry=sink(false,0,6),water=sink(true,0,6),syrup=sink(true,1,6),large=sink(true,1,12);
  assert(dry>water*3 && water>syrup*1.5 && syrup>.3 && large>syrup*1.25,JSON.stringify({dry,water,syrup,large}));
  const b=box(0,8),flow=state([b],{shakerLiquid:true,shakerLiquidLevel:.95});
  run(flow,.25,{x:180});const flowingSpeed=flow.fluid.vx;
  b.vx=b.vy=0;S.advance(flow,S.STEP);
  assert(flowingSpeed>1 && b.vx>0,'liquid continues to carry a stopped charm after the driving force ends');
  run(flow,6);
  assert(Math.hypot(flow.fluid.vx,flow.fluid.vy)<.05,'bulk flow settles without perpetual stirring');
  console.log('PASS partial buoyancy, sinking, viscosity, size-dependent drag and decaying liquid flow');
}

// Independent area sampling verifies that a tilted irregular chamber keeps its fill volume.
{
  let worst=0;
  for(const [design] of S.DESIGNS) {
    const samples=[];
    for(let x=-31;x<31;x+=.5) for(let y=-34;y<33;y+=.5) if(S.distance(S.geometry(design),x,y).d>0) samples.push([x,y]);
    for(const fill of [.2,.65,.9]) for(const angle of [0,.7,Math.PI/2,Math.PI,4.1]) {
      const s=state([],{shakerDesign:design,shakerLiquid:true,shakerLiquidLevel:fill,baseRotation:angle*180/Math.PI});
      const f=s.fluid,actual=samples.filter(([x,y])=>x*f.nx+y*f.ny>=f.height).length/samples.length;
      worst=Math.max(worst,Math.abs(actual-fill));
      assert(Math.abs(actual-fill)<.014,JSON.stringify({design,angle,fill,actual}));
    }
  }
  const side=state([],{shakerLiquid:true,shakerMode:'gravity'});run(side,5,{gx:105,gy:0});
  assert(Math.abs(side.fluid.nx-1)<.001 && Math.abs(side.fluid.ny)<.01,'sideways gravity has no phantom downward component');
  console.log(`PASS volume conservation in all 12 shells, including sideways and inverted (sampling error ${(worst*100).toFixed(2)}%)`);
}

// Identical physical time produces identical motion even with display-frame jitter.
{
  const simulate = schedule => {
    const s=state([box(-8,0),box(3,4,6,5)],{shakerLiquid:true,shakerMagnet:'attract'});
    s.burst=.6;
    for(const dt of schedule) S.advance(s,dt,{preview:true});
    return [s.elapsed,s.fluid.angle,s.fluid.height,...s.bodies.flatMap(b=>[b.x,b.y,b.a,b.vx,b.vy,b.va]),...s.dust.flatMap(p=>[p.x,p.y])];
  };
  const reference=simulate(Array(240).fill(1/120));
  const schedules=[30,60,144].map(fps=>Array(fps*2).fill(1/fps));
  schedules.push(Array.from({length:60},()=>[1/480,15/480]).flat());
  for(const schedule of schedules) {
    const actual=simulate(schedule);
    assert(actual.every((n,i)=>Math.abs(n-reference[i])<1e-8),'render frame rate must not change physics or procedural shake timing');
  }
  const s=state([box(9,0)],{shakerMode:'gravity'});
  S.advance(s,S.STEP,{gx:0,gy:0,omega:1,alpha:60});
  assert(s.bodies[0].va<-.3 && s.bodies[0].vy<0,'charms lag when the casing turns');
  console.log('PASS deterministic 30/60/120/144 Hz and irregular frames, plus rotational inertia');
}
