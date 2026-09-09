/*
 * scene.js — the interactive stage with many stickers.
 *
 * Each sticker entity has its own physics (drag spring, velocity lean, grab
 * lift, hover tilt, idle sway), its own look settings and its own textures.
 * The array order is the z-order; selection preserves the stack. A sticker
 * goes through three phases:
 *
 *   processing → the full photo is shown as a card with a scanning shimmer
 *   revealing  → the background dissolves inward, border and foil fade in
 *   ready      → normal sticker
 *
 * DOM pixel space (y down) is used for positions; the renderer's world space
 * (y up, origin at the stage centre) is derived when drawing.
 */
window.StickerScene = (() => {
  'use strict';

  const DEG = Math.PI / 180;
  const LIFT_Z = 36;                // how far (stage px, toward the camera) a picked-up sticker rises
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wrapRotation = angle => Math.abs(angle) > 360 ? angle % 360 : angle;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let nextId = 1;

  /*
   * Idle animations as a pure function of phase T (seconds × speed). Every
   * animation repeats exactly every ANIM_PERIOD[name] units of T, so an export
   * of one period loops seamlessly.
   */
  const TAU = Math.PI * 2;
  // Shared with every animation dropdown so icons, frames and photos stay in sync.
  const ANIMATION_OPTIONS = [
    ['none', 'Still'], ['float', 'Float'], ['breathe', 'Breathing'], ['drift', 'Drift'],
    ['orbit', 'Orbit'], ['figure8', 'Figure eight'], ['swing', 'Swing'], ['nod', 'Nod'],
    ['wiggle', 'Wiggle'], ['jelly', 'Jelly'], ['bounce', 'Bounce'], ['hop', 'Hop'],
    ['heartbeat', 'Heartbeat'], ['pulse', 'Pulse'], ['pop', 'Pop'], ['tada', 'Tada'],
    ['shake', 'Shake'], ['twinkle', 'Twinkle'], ['dance', 'Dance'], ['spin', 'Spin'],
    ['flutter', 'Flutter'], ['leaf', 'Falling leaf'], ['boomerang', 'Boomerang'], ['spiral', 'Spiral'],
    ['skate', 'Skate'], ['cartwheel', 'Cartwheel'], ['scoot', 'Scoot'], ['peekaboo', 'Peekaboo'],
  ];
  const ANIM_PERIOD = {
    none: TAU, float: TAU / 0.8, wiggle: TAU / 5, heartbeat: 1 / 0.9, pulse: TAU / 2.5,
    spin: TAU / 1.4, swing: TAU / 2, bounce: Math.PI / 2.4, twinkle: TAU / 1.3, dance: TAU / 2.2,
    breathe: 4.8, drift: 5.6, orbit: 4.2, figure8: 4.8, jelly: 2.4, hop: 2.2, shake: 2.6, nod: 3, pop: 2.8, tada: 3.2,
    flutter: 3.6, leaf: 5.4, boomerang: 3.8, spiral: 4.6, skate: 3.4, cartwheel: 4.4, scoot: 3.2, peekaboo: 3.6,
  };
  function animOffsets(cfg, sz, T) {
    const o = { ax: 0, ay: 0, arot: 0, ascale: 1 };
    const an = cfg.anim || 'none', A = cfg.animAmount == null ? 1 : cfg.animAmount;
    if (an === 'none' || A <= 0) return o;
    const u = Math.min(sz.w, sz.h);
    const phase = ((T / (ANIM_PERIOD[an] || TAU)) % 1 + 1) % 1, p = phase * TAU;
    // A raised-cosine burst eases into and out of the resting part of a loop.
    const burst = (start, end) => phase <= start || phase >= end ? 0 : Math.sin(Math.PI * (phase - start) / (end - start)) ** 2;
    switch (an) {
      case 'float': o.ay = Math.sin(T * 1.6) * u * 0.06 * A; o.arot = Math.sin(T * 0.8) * 0.04 * A; break;
      case 'wiggle': o.arot = Math.sin(T * 5) * 0.14 * A; break;
      case 'heartbeat': {
        const f = ((T * 0.9) % 1 + 1) % 1;
        const g = (c) => { const z = (f - c) / 0.07; return Math.exp(-(z * z)); };
        o.ascale = 1 + (g(0.12) + 0.65 * g(0.34)) * 0.14 * A; break;
      }
      case 'pulse': o.ascale = 1 + Math.sin(T * 2.5) * 0.06 * A; break;
      case 'spin': o.arot = T * 1.4; break;
      case 'swing': o.arot = Math.sin(T * 2) * 0.25 * A; o.ax = Math.sin(T * 2) * u * 0.08 * A; break;
      case 'bounce': { const b = Math.abs(Math.sin(T * 2.4)); o.ay = -b * u * 0.12 * A; o.ascale = 1 - (1 - b) * 0.05 * A; break; }
      case 'twinkle': o.ascale = 1 + Math.sin(T * 3.9) * 0.14 * A; o.arot = Math.sin(T * 1.3) * 0.18 * A; break;
      case 'dance': o.ax = Math.sin(T * 2.2) * u * 0.07 * A; o.arot = Math.sin(T * 2.2) * 0.12 * A; o.ay = -Math.abs(Math.sin(T * 4.4)) * u * 0.04 * A; break;
      case 'breathe': { const b = (1 - Math.cos(p)) * .5; o.ascale = 1 + b * .05 * A; o.ay = -b * u * .015 * A; break; }
      case 'drift': o.ax = Math.sin(p) * u * .075 * A; o.ay = Math.sin(p * 2) * u * .025 * A; o.arot = Math.sin(p + .4) * .035 * A; break;
      case 'orbit': o.ax = Math.cos(p) * u * .085 * A; o.ay = Math.sin(p) * u * .06 * A; break;
      case 'figure8': o.ax = Math.sin(p) * u * .1 * A; o.ay = Math.sin(p * 2) * u * .055 * A; o.arot = Math.cos(p) * .06 * A; break;
      case 'jelly': { const b = burst(.05, .7); o.ascale = 1 + Math.sin(p * 3) * b * .1 * A; o.arot = Math.sin(p * 4) * b * .12 * A; break; }
      case 'hop': { const b = burst(.06, .39) + .65 * burst(.46, .74); o.ay = -b * u * .12 * A; o.arot = Math.sin(p) * b * .075 * A; o.ascale = 1 + b * .035 * A; break; }
      case 'shake': { const b = burst(.08, .6); o.ax = Math.sin(p * 5) * b * u * .06 * A; o.arot = Math.sin(p * 5) * b * .055 * A; break; }
      case 'nod': { const b = burst(.1, .4) + .7 * burst(.48, .76); o.ay = b * u * .04 * A; o.arot = -b * .12 * A; break; }
      case 'pop': o.ascale = 1 + (-.045 * burst(.04, .17) + .16 * burst(.17, .48) - .025 * burst(.48, .64)) * A; break;
      case 'tada': { const b = burst(.1, .72); o.ascale = 1 + b * .09 * A; o.arot = Math.sin(p * 5) * b * .16 * A; break; }
      case 'flutter': o.ax = Math.sin(p) * u * .05 * A; o.ay = -(Math.sin(p) ** 2) * u * .04 * A; o.arot = Math.sin(p * 4) * .17 * A; o.ascale = 1 + Math.sin(p * 8) * .035 * A; break;
      case 'leaf': o.ax = Math.sin(p) * u * .15 * A; o.ay = Math.sin(p * 2 + .5) * u * .055 * A; o.arot = Math.sin(p + .7) * .24 * A; break;
      case 'boomerang': { const b = (1 - Math.cos(p)) * .5; o.ax = Math.sin(p) * u * .2 * A; o.ay = -b * u * .15 * A; o.arot = Math.sin(p) * .45 * A; o.ascale = 1 - b * .22 * A; break; }
      case 'spiral': { const r = (1 - Math.cos(p)) * u * .055 * A; o.ax = Math.sin(p * 2) * r; o.ay = Math.cos(p * 2) * r; o.arot = Math.sin(p) * .1 * A; o.ascale = 1 + Math.sin(p) * .045 * A; break; }
      case 'skate': o.ax = Math.sin(p) * u * .2 * A; o.ay = -(Math.abs(Math.sin(p)) ** 3) * u * .025 * A; o.arot = -Math.sin(p * 2) * .13 * A; break;
      // Roll out and back: the angle returns to zero so SVG and raster loops share a smooth seam at any amount.
      case 'cartwheel': { const b = (1 - Math.cos(p)) * .5; o.ax = b * u * .18 * A; o.ay = -(Math.sin(p) ** 2) * u * .16 * A; o.arot = TAU * b * A; break; }
      case 'scoot': { const a = burst(.08, .43), b = burst(.54, .89); o.ax = (a - b) * u * .15 * A; o.ay = -(a + b) * u * .035 * A; o.arot = (b - a) * .12 * A; break; }
      case 'peekaboo': { const hide = burst(.04, .45), peek = burst(.5, .8); o.ascale = 1 + (-.3 * hide + .1 * peek) * A; o.ay = (hide * .14 - peek * .035) * u * A; o.arot = Math.sin(p * 3) * peek * .08 * A; break; }
      default: break;
    }
    return o;
  }

  /* Space for the full motion, including diagonal rotation and maximum amount. */
  function animationBounds(cfg, sz) {
    let x = 0, y = 0, radius = 0;
    const period = ANIM_PERIOD[cfg.anim] || TAU;
    for (let i = 0; i <= 180; i++) {
      const o = animOffsets(cfg, sz, i / 180 * period), a = -(cfg.baseRotation || 0) * DEG + o.arot;
      const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      x = Math.max(x, Math.abs(o.ax) + (sz.w * c + sz.h * s) * o.ascale / 2);
      y = Math.max(y, Math.abs(o.ay) + (sz.w * s + sz.h * c) * o.ascale / 2);
      radius = Math.max(radius, Math.hypot(o.ax, o.ay) + Math.hypot(sz.w, sz.h) * o.ascale / 2);
    }
    return { width: x * 2, height: y * 2, radius };
  }

  class Scene {
    constructor(canvas, renderer) {
      this.canvas = canvas;
      this.renderer = renderer;
      this.stickers = [];
      this.selected = null;
      this.hovered = null;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.stageW = 1; this.stageH = 1;
      this.pointer = { x: 0, y: 0, inside: false, lastMove: -1e9 };
      this.drag = null;
      this.time = 0;
      this.lastFrame = 0;
      this.running = false;
      this.scripted = null;
      this.background = [0, 0, 0, 0];
      this.revealDuration = 2.6;
      this.onSelect = null;   // (entry|null) => void
      this.onHover = null;    // (entry|null) => void
      this.onFrame = null;    // () => void, after each render
      this.onPhase = null;    // (entry) => void, when a reveal finishes
      this.dropTargetFor = null; // (dragged, {x,y}) => entry|null, asked while dragging
      this.onDropTarget = null;  // (entry|null) => void, when that answer changes
      this.onDrop = null;        // (dragged, target) => bool, true if the drop was consumed
      this.onDragEnd = null;     // (entry) => void, after a drag that was not consumed
      this.onTweak = null;       // (entry) => void, after the mouse wheel or a pinch changed a sticker's size or rotation
      this.onDragStart = null;   // (entry) => void, when a drag begins (the app snapshots the position for undo)
      this.dropTarget = null;
      this.pointers = new Map(); // active pointers (touch) → {x, y}
      this.pinch = null;         // two-finger resize / rotate in progress
      this._bind();
      this.resize();
    }

    /* ---------------------------------------------------------------- */
    /* Entities                                                           */
    /* ---------------------------------------------------------------- */

    /*
     * Add a sticker. { id, full: canvas (working image), settings } starts it in
     * the processing phase with the photo card. With `instant: true` (frames,
     * icons, stickers popping back out of a frame) it is ready at once and
     * pops in; `full` may then be omitted if `work: {w, h}` is given. `at`
     * places it at a stage point, `near` on a ring around another entry,
     * `select: false` leaves the selection alone. Returns the entry.
     */
    add(spec) {
      const work = spec.work ? { w: spec.work.w, h: spec.work.h } : { w: spec.full.width, h: spec.full.height };
      const probe = { settings: spec.settings, work };
      const s0 = this._scaleFor(probe);
      const size = { w: work.w * s0, h: work.h * s0 };
      const spot = spec.at ? { x: spec.at.x, y: spec.at.y } : spec.near ? this._aroundSpot(spec.near, size) : this._openSpot(size);
      const instant = !!spec.instant;
      const entry = {
        id: spec.id || 's' + nextId++,
        settings: spec.settings,
        layer: spec.layer == null ? 1 : spec.layer,   // 0 frames, 1 photo stickers, 2 icons — higher layers always draw on top
        parent: null, offset: null,                   // an icon follows its photo sticker or frame
        work,
        fullTex: !instant && spec.full ? this.renderer.createImageTexture(spec.full) : null,
        tex: null, atlas: null,
        phase: instant ? 'ready' : 'processing',
        reveal: null,
        spawn: instant ? this.time : 0,
        cropCenter: { x: work.w / 2, y: work.h / 2 },
        x: spot.x, y: spot.y,
        vx: 0, vy: 0, rotX: 0, rotY: 0, rotZ: 0, wx: 0, wy: 0, wz: 0,
        ax: 0, ay: 0, arot: 0, ascale: 1,             // idle-animation offsets on top of the physics
        lift: 0,                                        // 0 resting on the page → 1 picked up (eased)
        blinkPhase: Math.random(),
        restX: 0, restY: 0, s: 1, born: this.time,
      };
      entry.restX = entry.x; entry.restY = entry.y;
      entry.s = this._scaleFor(entry);
      this.stickers.splice(this._layerTop(entry.layer), 0, entry);
      if (spec.select !== false) this.select(entry);
      return entry;
    }

    /* index just above the last entry of this layer (array is kept sorted by layer) */
    _layerTop(layer) {
      let i = this.stickers.length;
      while (i > 0 && this.stickers[i - 1].layer > layer) i--;
      return i;
    }

    /* Make `child` follow `parent`, keeping its current position (offset is stored relative to the parent's size). */
    attach(child, parent) {
      if (!child || !parent || child === parent) return;
      const sz = this.size(parent);
      child.parent = parent;
      child.offset = { u: (child.x - parent.x) / sz.w, v: (child.y - parent.y) / sz.h };
      child.restX = child.x; child.restY = child.y;
    }
    detach(child) {
      if (!child || !child.parent) return;
      child.parent = null; child.offset = null;
      child.restX = child.x; child.restY = child.y;
    }
    children(parent) { return this.stickers.filter((e) => e.parent === parent); }

    /* A spot on a ring around `near` (decorations gather around their parent). */
    _aroundSpot(near, size) {
      const b = this.size(near);
      const n = this.stickers.filter((e) => e !== near).length;
      const a = -0.9 + n * 2.39996;                       // golden angle spacing
      const rx = b.w * 0.5 + size.w * 0.12, ry = b.h * 0.5 + size.h * 0.12;
      const x = near.x + Math.cos(a) * rx, y = near.y + Math.sin(a) * ry;
      const mx = clamp(size.w * 0.4, 16, this.stageW / 2), my = clamp(size.h * 0.4, 16, this.stageH / 2);
      return { x: clamp(x, mx, this.stageW - mx), y: clamp(y, my, this.stageH - my) };
    }

    /* The stage position farthest from every existing sticker (centre when empty). */
    _openSpot(size) {
      const W = this.stageW, H = this.stageH;
      if (!this.stickers.length) return { x: W / 2, y: H / 2 };
      const mx = clamp(size.w * 0.5 + 12, 24, W / 2), my = clamp(size.h * 0.5 + 12, 24, H / 2);
      let best = null, bestD = -1;
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 7; gx++) {
        const x = mx + (W - 2 * mx) * gx / 6, y = my + (H - 2 * my) * gy / 4;
        let d = Infinity;
        for (const e of this.stickers) d = Math.min(d, Math.hypot(e.x - x, e.y - y));
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
      return best;
    }

    /* Install (or replace) the cutout atlas of a sticker. The first atlas starts the reveal. */
    setAtlas(id, atlas) {
      const e = this.get(id); if (!e) return;
      if (e.tex) this.renderer.deleteTextures(e.tex);
      e.tex = this.renderer.createTextures(atlas);
      e.atlas = atlas;
      // keep the artwork where it is: shift the anchor by the change in crop centre
      const cc = { x: atlas.x0 + atlas.w / 2, y: atlas.y0 + atlas.h / 2 };
      const dx = (cc.x - e.cropCenter.x) * e.s, dy = (cc.y - e.cropCenter.y) * e.s;
      e.x += dx; e.y += dy; e.restX += dx; e.restY += dy;
      e.cropCenter = cc;
      if (e.phase === 'processing') {
        // how far (in work px) the farthest photo corner is from the cutout's box:
        // the dissolve front starts there so the whole sweep is visible
        const pad = Math.round(120 * (atlas.scale || 1));
        const bx0 = atlas.x0 + pad, by0 = atlas.y0 + pad, bx1 = atlas.x0 + atlas.w - pad, by1 = atlas.y0 + atlas.h - pad;
        let maxD = 0;
        for (const [cx, cy] of [[0, 0], [e.work.w, 0], [0, e.work.h], [e.work.w, e.work.h]]) {
          const dx = Math.max(bx0 - cx, 0, cx - bx1), dy = Math.max(by0 - cy, 0, cy - by1);
          maxD = Math.max(maxD, Math.hypot(dx, dy));
        }
        e.phase = 'revealing'; e.reveal = { t0: this.time, maxD: maxD + 40 };
      }
    }

    remove(id) {
      const i = this.stickers.findIndex((e) => e.id === id);
      if (i < 0) return;
      const e = this.stickers[i];
      this.renderer.deleteTextures(e.tex);
      this.renderer.deleteImageTexture(e.fullTex);
      this.stickers.splice(i, 1);
      for (const c of this.children(e)) this.detach(c);
      if (this.drag && this.drag.entry === e) this.drag = null;
      if (this.hovered === e) this.hovered = null;
      if (this.dropTarget === e) this._setDropTarget(null);
      if (this.selected === e) this.select(null);
      this.render();
    }

    get(id) { return this.stickers.find((e) => e.id === id) || null; }

    isLocked(entry) {
      let remaining = this.stickers.length + 1;
      for (let e = entry; e; e = e.parent) { if (e.locked || --remaining < 0) return true; }
      return false;
    }

    select(entry) {
      if (this.selected === entry) return;
      this.selected = entry;
      if (this.onSelect) this.onSelect(entry);
    }

    /* to the top of its own layer: a frame never rises above the icons stuck on it */
    bringToFront(entry) {
      const i = this.stickers.indexOf(entry);
      if (i < 0) return;
      this.stickers.splice(i, 1);
      this.stickers.splice(this._layerTop(entry.layer), 0, entry);
    }

    /* stage px per working-image px */
    _scaleFor(e) {
      return Math.min(this.stageW, this.stageH) * 0.62 * e.settings.stickerScale / Math.max(e.work.w, e.work.h);
    }

    relayout(entry) { const list = entry ? [entry] : this.stickers; for (const e of list) e.s = this._scaleFor(e); }

    /* size of the primary quad (sticker if cut out, else the full photo) in stage px */
    size(e) {
      if (e.atlas) return { w: e.atlas.w * e.s, h: e.atlas.h * e.s };
      return { w: e.work.w * e.s, h: e.work.h * e.s };
    }

    /* Visible bounds of a sticker in stage px (unrotated; atlas padding excluded). */
    bounds(e) {
      e = e || this.selected; if (!e) return null;
      const sz = this.size(e);
      let inset = 0;
      if (e.atlas) inset = Math.max(0, (e.atlas.pad || 0) - e.settings.borderWidth - 6) * e.s;
      const cx = e.x + (e.ax || 0), cy = e.y + (e.ay || 0);
      return { x: cx - sz.w / 2 + inset, y: cy - sz.h / 2 + inset, w: sz.w - 2 * inset, h: sz.h - 2 * inset, cx, cy };
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
      const rx = this.stageW > 1 ? w / this.stageW : 1, ry = this.stageH > 1 ? h / this.stageH : 1;
      this.stageW = w; this.stageH = h;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.renderer.resize(Math.round(w * this.dpr), Math.round(h * this.dpr));
      for (const e of this.stickers) { e.x *= rx; e.y *= ry; e.restX *= rx; e.restY *= ry; }
      this.relayout();
      this.render();
    }

    /* ---------------------------------------------------------------- */
    /* Pointer handling                                                   */
    /* ---------------------------------------------------------------- */
    _bind() {
      const c = this.canvas;
      c.style.touchAction = 'none';
      c.addEventListener('pointerdown', (e) => this._down(e));
      c.addEventListener('pointermove', (e) => this._move(e));
      c.addEventListener('pointerup', (e) => this._up(e));
      c.addEventListener('pointercancel', (e) => this._up(e));
      c.addEventListener('pointerleave', () => {
        this.pointer.inside = false;
        if (!this.drag) {
          this._cursor('default');
          if (this.hovered) { this.hovered = null; if (this.onHover) this.onHover(null); }
        }
      });
      c.addEventListener('pointerenter', () => { this.pointer.inside = true; });
      c.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    }

    /* mouse wheel over a sticker: resize it; with Shift (or Alt) held: rotate it */
    _wheel(e) {
      const p = this._local(e);
      const hit = this.hitTest(p.x, p.y);
      if (!hit) return;
      e.preventDefault();
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta) return;
      const dir = delta > 0 ? -1 : 1;
      const s = hit.settings;
      if (e.shiftKey || e.altKey) {
        s.baseRotation = wrapRotation(Math.round((s.baseRotation || 0) + dir * 3));
      } else {
        s.stickerScale = clamp(+(s.stickerScale * (dir > 0 ? 1.06 : 1 / 1.06)).toFixed(3), 0.1, 1.4);
        this.relayout(hit);
      }
      if (this.onTweak) this.onTweak(hit);
    }

    _local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    _cursor(v) { if (this.canvas.style.cursor !== v) this.canvas.style.cursor = v; }

    /* Stage point → a sticker's quad coordinates (0..1 across the atlas), undoing its spin. */
    localPoint(e, px, py) {
      const sz = this.size(e), k = e.ascale || 1;
      const a = e.rotZ + (e.arot || 0), ca = Math.cos(a), sa = Math.sin(a);
      const dx = px - (e.x + (e.ax || 0)), dy = py - (e.y + (e.ay || 0));
      const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
      const u = lx / (sz.w * k) + 0.5;
      return { u: e.settings.flipX ? 1 - u : u, v: ly / (sz.h * k) + 0.5 };
    }

    /* Topmost sticker under a stage point, or null. */
    hitTest(px, py) {
      for (let i = this.stickers.length - 1; i >= 0; i--) {
        const e = this.stickers[i];
        if (this.isLocked(e)) continue;
        const { u, v } = this.localPoint(e, px, py);
        if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
        if (!e.atlas) return e; // processing card: rectangular
        const ax = Math.floor(u * e.atlas.w), ay = Math.floor(v * e.atlas.h);
        const sdf = e.atlas.sdf[ay * e.atlas.w + ax];
        if (sdf + e.settings.borderWidth > -4 / e.s) return e;
      }
      return null;
    }

    _setDropTarget(t) {
      if (this.dropTarget === t) return;
      this.dropTarget = t;
      if (this.onDropTarget) this.onDropTarget(t);
    }

    _capture(id) { try { this.canvas.setPointerCapture(id); } catch (err) { /* synthetic or already gone */ } }

    /* two fingers on the dragged sticker: pinch to resize, twist to rotate; the sticker follows the midpoint */
    _pinchGeom() {
      const [a, b] = [...this.pointers.values()];
      return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }

    _down(e) {
      const p = this._local(e);
      this.pointers.set(e.pointerId, p);
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.inside = true; this.pointer.lastMove = this.time;
      if (this.drag && this.pointers.size === 2) {
        const g = this._pinchGeom(), s = this.drag.entry.settings;
        this.pinch = { entry: this.drag.entry, d0: Math.max(1, g.d), angle: g.a, scale0: s.stickerScale, rotation: s.baseRotation || 0 };
        this.drag.dx = g.mx - this.drag.entry.x; this.drag.dy = g.my - this.drag.entry.y;
        this._capture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (this.drag) return;   // a third finger: ignore
      const hit = this.hitTest(p.x, p.y);
      if (!hit) { this.select(null); return; }
      this.select(hit);
      this._capture(e.pointerId);
      this.drag = { entry: hit, dx: p.x - hit.x, dy: p.y - hit.y, id: e.pointerId };
      if (this.onDragStart) this.onDragStart(hit);
      this._cursor('grabbing');
      e.preventDefault();
    }

    _move(e) {
      const p = this._local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size >= 2) {
        e.preventDefault();
        const g = this._pinchGeom(), s = this.pinch.entry.settings;
        s.stickerScale = clamp(+(this.pinch.scale0 * g.d / this.pinch.d0).toFixed(3), 0.1, 1.4);
        const delta = g.a - this.pinch.angle;
        this.pinch.rotation += Math.atan2(Math.sin(delta), Math.cos(delta)) / DEG;
        this.pinch.angle = g.a;
        s.baseRotation = wrapRotation(Math.round(this.pinch.rotation));
        this.relayout(this.pinch.entry);
        this.pointer.x = g.mx; this.pointer.y = g.my; this.pointer.inside = true; this.pointer.lastMove = this.time;
        return;
      }
      if (this.drag && e.pointerId !== this.drag.id) return;
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.inside = true; this.pointer.lastMove = this.time;
      if (this.drag) {
        e.preventDefault();
        // Highlight an eligible attachment surface or photo window.
        this._setDropTarget(this.dropTargetFor ? this.dropTargetFor(this.drag.entry, p) : null);
        return;
      }
      const hit = this.hitTest(p.x, p.y);
      this._cursor(hit ? 'grab' : 'default');
      if (hit !== this.hovered) { this.hovered = hit; if (this.onHover) this.onHover(hit); }
    }

    _up(e) {
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size >= 2) return;
        const entry = this.pinch.entry; this.pinch = null;
        if (this.onTweak) this.onTweak(entry);
        if (this.pointers.size === 1 && this.drag) {
          // one finger left: keep dragging with it
          const [id, p] = [...this.pointers.entries()][0];
          this.drag.id = id; this.drag.dx = p.x - entry.x; this.drag.dy = p.y - entry.y;
          this.pointer.x = p.x; this.pointer.y = p.y;
          return;
        }
      }
      if (!this.drag) return;
      if (this.pointers.size && e.pointerId !== this.drag.id) return;
      try { this.canvas.releasePointerCapture(this.drag.id); } catch (err) { /* ignore */ }
      const s = this.drag.entry, sz = this.size(s);
      const target = this.dropTarget;
      this._setDropTarget(null);
      if (target && this.onDrop && this.onDrop(s, target)) {
        // the app consumed the drop (the sticker moved into the frame)
        this.drag = null;
        this._cursor(this.hitTest(this.pointer.x, this.pointer.y) ? 'grab' : 'default');
        return;
      }
      if (s.settings.snapBack && !s.parent) { s.restX = this.stageW / 2; s.restY = this.stageH / 2; }
      else {
        s.restX = clamp(s.x, sz.w * 0.2, this.stageW - sz.w * 0.2);
        s.restY = clamp(s.y, sz.h * 0.2, this.stageH - sz.h * 0.2);
      }
      if (s.parent) this.attach(s, s.parent);   // refresh the offset after moving an attached icon
      this.drag = null;
      this._cursor(this.hitTest(this.pointer.x, this.pointer.y) ? 'grab' : 'default');
      if (this.onDragEnd) this.onDragEnd(s);
    }

    /* ---------------------------------------------------------------- */
    /* Simulation                                                         */
    /* ---------------------------------------------------------------- */
    update(dt) {
      const pt = this.pointer;
      if (!this.drag && pt.inside) this.hovered = this.hitTest(pt.x, pt.y);
      else if (!pt.inside) this.hovered = null;
      for (const s of this.stickers) this._updateOne(s, dt);
    }

    _updateOne(s, dt) {
      const cfg = s.settings, pt = this.pointer;
      const sz = this.size(s), halfW = sz.w / 2, halfH = sz.h / 2;
      const dragging = this.drag && this.drag.entry === s;
      if (s.parent && !dragging) {
        // The rest position rides with the photo/frame, including its idle animation.
        const psz = this.size(s.parent), pa = s.parent;
        s.restX = pa.x + (pa.ax || 0) + s.offset.u * psz.w; s.restY = pa.y + (pa.ay || 0) + s.offset.v * psz.h;
      }
      let tx = s.restX, ty = s.restY;
      if (dragging) { tx = pt.x - this.drag.dx; ty = pt.y - this.drag.dy; }
      const k = 40 + cfg.stiffness * 360;
      const d = 2 * Math.sqrt(k) * (0.35 + cfg.damping * 0.9);
      s.vx += ((tx - s.x) * k - s.vx * d) * dt;
      s.vy += ((ty - s.y) * k - s.vy * d) * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;

      let rx = 0, ry = 0, rz = 0;
      const maxTilt = 55 * DEG;
      if (this.scripted) {
        const t = (performance.now() - this.scripted.t0) / 1000;
        const a = this.scripted.amp * DEG;
        const ph = (t / this.scripted.period) * Math.PI * 2 + (s.born || 0) * 0.7;
        rx = Math.sin(ph) * a; ry = Math.cos(ph) * a * 1.15;
      } else {
        if (dragging) {
          const lean = cfg.dragLean * 0.0018;
          ry += clamp(s.vx * lean, -0.8, 0.8);
          rx += clamp(s.vy * lean, -0.8, 0.8);
          const gx = clamp(this.drag.dx / halfW, -1, 1), gy = clamp(this.drag.dy / halfH, -1, 1);
          ry += -gx * cfg.grabTilt * DEG;
          rx += -gy * cfg.grabTilt * DEG;
          rz += clamp((s.vx * gy - s.vy * gx) * 0.0006 * cfg.dragLean, -0.35, 0.35);
        } else if (this.hovered === s) {
          const hx = clamp((pt.x - s.x) / halfW, -1.4, 1.4), hy = clamp((pt.y - s.y) / halfH, -1.4, 1.4);
          ry += hx * cfg.hoverTilt * DEG;
          rx += hy * cfg.hoverTilt * DEG;
        }
        const idle = this.time - pt.lastMove;
        if (!dragging && idle > 1.5 && cfg.idleSway > 0) {
          const fade = clamp((idle - 1.5) / 2, 0, 1);
          const a = cfg.idleSway * DEG * fade;
          const ph = (s.born || 0) * 1.3;
          rx += Math.sin(this.time * 0.9 + ph) * a;
          ry += Math.cos(this.time * 0.65 + ph) * a * 1.2;
        }
      }
      rx = clamp(rx, -maxTilt, maxTilt); ry = clamp(ry, -maxTilt, maxTilt);
      rz -= (cfg.baseRotation || 0) * DEG;   // resting spin (positive = clockwise on screen)
      const ak = 140 + cfg.stiffness * 260, ad = 2 * Math.sqrt(ak) * (0.5 + cfg.damping * 0.6);
      s.wx += ((rx - s.rotX) * ak - s.wx * ad) * dt; s.rotX += s.wx * dt;
      s.wy += ((ry - s.rotY) * ak - s.wy * ad) * dt; s.rotY += s.wy * dt;
      // Follow the nearest equivalent angle when controls wrap past a full turn.
      const spinDelta = Math.atan2(Math.sin(rz - s.rotZ), Math.cos(rz - s.rotZ));
      s.wz += (spinDelta * ak - s.wz * ad) * dt; s.rotZ += s.wz * dt;
      // picked up: the sticker rises off the page (perspective and shadow) and settles back when let go
      const liftTo = dragging ? 1 : this.hovered === s ? 0.12 : 0;
      s.lift += (liftTo - s.lift) * (1 - Math.exp(-dt * (liftTo > s.lift ? 18 : 9)));
      this._animate(s, sz);
    }

    /* Looping idle animation: offsets layered on top of the physics, never touching the true position. */
    _animate(s, sz) {
      const cfg = s.settings;
      const o = animOffsets(cfg, sz, this.time * (cfg.animSpeed || 1) + (s.born || 0) * 1.7);
      s.ax = o.ax; s.ay = o.ay; s.arot = o.arot; s.ascale = o.ascale;
    }

    /* faces blink every few seconds, sometimes twice */
    _blinking(e, time = this.time) {
      const u = (time + e.blinkPhase * 9.7) % 3.6;
      return u < 0.14 || (e.blinkPhase > 0.6 && u > 0.3 && u < 0.42);
    }

    /* the texture set to draw at `time`: the animation frame due, else the closed-eyes drawing while blinking, else the picture itself */
    _texAt(e, time) {
      const t = e.tex;
      if (t.frames) {
        const ms = ((time * 1000) % t.period + t.period) % t.period;
        let k = 0;
        while (k < t.frameEnds.length - 1 && ms >= t.frameEnds[k]) k++;
        if (k === 0) return t;
        const fr = t.frames[k - 1];
        return Object.assign({}, t, { img: fr.img, sdf: fr.sdf || t.sdf });
      }
      return t.blink && this._blinking(e, time) ? Object.assign({}, t, { img: t.blink }) : t;
    }

    /* ---------------------------------------------------------------- */
    /* Rendering                                                          */
    /* ---------------------------------------------------------------- */
    _view(W, H) {
      W = W || this.stageW; H = H || this.stageH;
      const camDist = Math.max(W, H) * 1.7;
      let lx = -W * 0.35, ly = H * 0.45, lz = camDist * 0.55;
      if (this.scripted) {
        const t = (performance.now() - this.scripted.t0) / 1000;
        const ph = (t / this.scripted.period) * Math.PI * 2;
        lx = Math.cos(ph) * W * 0.4; ly = Math.sin(ph) * H * 0.4;
      } else if (this.pointer.inside || this.drag) {
        const follow = this.selected ? this.selected.settings.lightFollow : 0.5;
        const px = this.pointer.x - W / 2, py = -(this.pointer.y - H / 2);
        lx += (px - lx) * follow; ly += (py - ly) * follow;
      }
      return { stageW: W, stageH: H, camDist, time: this.time, light: [lx, ly, lz] };
    }

    _pose(e, W, H) {
      const sz = this.size(e);
      let k = 1;
      if (e.spawn) {
        // pop in with a little overshoot
        const t = (this.time - e.spawn) / 0.55;
        if (t >= 1) e.spawn = 0;
        else { const u = clamp(t, 0, 1) - 1; k = 1 + 2.70158 * u * u * u + 1.70158 * u * u; }
      }
      k *= e.ascale || 1;
      return {
        x: e.x + (e.ax || 0) - W / 2, y: -(e.y + (e.ay || 0) - H / 2), z: (e.lift || 0) * LIFT_Z,
        rotX: e.rotX, rotY: e.rotY, rotZ: e.rotZ + (e.arot || 0), width: sz.w * k, height: sz.h * k,
      };
    }

    /*
     * How a sticker's shadow falls (see renderer._shadowPass): the page shift per px of
     * height and the height of the sticker's centre, which is the Lift setting plus
     * however far it has been picked up. Half the direction is a fixed key light so the
     * shadow always sits down-right; the other half comes from the frame's light, so
     * it slides with the highlight when the light follows the cursor. `k` scales the
     * heights for exports rendered at another px size.
     */
    _shadow(e, pose, view, k) {
      k = k || 1;
      const ref = Math.max(0, e.settings.shadowLift) * k;
      const L = view.light, lz = Math.max(1, L[2] - pose.z);
      let dx = (pose.x - L[0]) / lz, dy = (pose.y - L[1]) / lz;
      const m = Math.hypot(dx, dy);
      if (m > 0.75) { dx *= 0.75 / m; dy *= 0.75 / m; }
      const h0 = ref + pose.z;
      return { dir: [dx * 0.5 + 0.125, dy * 0.5 - 0.175], h0, ref, scale: 1 + h0 * 0.0012 / k };
    }

    /* Reveal timeline → per-frame factors. */
    _revealState(e) {
      if (e.phase === 'ready') return null;
      if (e.phase === 'processing') return { r: 0, front: 1e6, processing: 1, fullAlpha: 1, fullShadow: 1, matT: 0, borderT: 0, stickerShadow: 0 };
      const r = clamp((this.time - e.reveal.t0) / this.revealDuration, 0, 1);
      const maxD = e.reveal.maxD || Math.max(e.work.w, e.work.h) * 0.85;
      const frontT = smooth(0.04, 0.7, r);
      return {
        r,
        front: maxD * (1 - frontT) - 18 * frontT,
        processing: 1 - smooth(0.0, 0.2, r),
        fullAlpha: 1 - smooth(0.9, 1.0, r),
        fullShadow: 1 - smooth(0.02, 0.3, r),
        matT: smooth(0.55, 1.0, r),
        borderT: smooth(0.62, 0.92, r),
        stickerShadow: smooth(0.1, 0.45, r),
      };
    }

    /* Material settings scaled by the reveal progress (plain photo → foil sticker). */
    _effective(e, rs) {
      const s = e.settings;
      if (!rs) return s;
      const m = rs.matT, b = rs.borderT;
      return Object.assign({}, s, {
        borderWidth: s.borderWidth * b, bevel: s.bevel * b, borderHolo: s.borderHolo * m,
        holoIntensity: s.holoIntensity * m, metallic: s.metallic * m, glitter: s.glitter * m,
        specular: s.specular * m, fresnel: s.fresnel * m, grain: s.grain * m, diffuse: s.diffuse * m,
        shadowOpacity: s.shadowOpacity * rs.stickerShadow,
        inkBrightness: 1 + (s.inkBrightness - 1) * m, inkSaturation: 1 + (s.inkSaturation - 1) * m,
      });
    }

    _drawAll(W, H, includeSelection, comparisonSettings) {
      const view = this.renderer.view;
      for (const original of this.stickers) {
        const e = comparisonSettings && original.id === this.comparison?.id ? { ...original, settings: comparisonSettings } : original;
        const rs = this._revealState(e);
        const pose = this._pose(e, W, H);
        if (rs && e.fullTex) {
          const off = e.atlas
            ? [(e.work.w / 2 - e.cropCenter.x) * e.s, -(e.work.h / 2 - e.cropCenter.y) * e.s]
            : [0, 0];
          const fullPose = Object.assign({}, pose, { width: e.work.w * e.s, height: e.work.h * e.s, offset: off });
          this.renderer.drawFullLayer(e.fullTex, e.tex, fullPose, {
            atlasRect: e.atlas ? [e.atlas.x0, e.atlas.y0, e.atlas.w, e.atlas.h] : null,
            front: rs.front, processing: rs.processing, alpha: rs.fullAlpha,
            borderWidth: e.settings.borderWidth * rs.borderT,
            shadow: Object.assign(this._shadow(e, pose, view), { opacity: e.settings.shadowOpacity * rs.fullShadow, blur: e.settings.shadowBlur, spread: e.settings.shadowSpread }),
          });
        }
        if (e.tex) {
          const tex = this._texAt(e, this.time);
          this.renderer.drawSticker(tex, pose, this._effective(e, rs), {
            selected: includeSelection && (e === this.selected || e === this.dropTarget),
            shadow: this._shadow(e, pose, view),
          });
        }
      }
    }

    render() {
      const view = this.comparison ? { ...this._view(), light: this.comparison.light } : this._view();
      this.renderer.clearColor = this.background;
      this.renderer.beginFrame(view, true);
      if (this.comparison) {
        // Two complete, non-overlapping passes preserve transparency and stack order.
        // Scissoring only affects the live canvas; exports always use committed settings.
        const gl = this.renderer.gl, width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        const split = Math.round(width * this.comparison.split);
        gl.enable(gl.SCISSOR_TEST);
        try {
          gl.scissor(0, 0, split, height);
          this._drawAll(this.stageW, this.stageH, false, this.comparison.before);
          gl.scissor(split, 0, width - split, height);
          this._drawAll(this.stageW, this.stageH, false, this.comparison.after);
        } finally { gl.disable(gl.SCISSOR_TEST); }
      } else this._drawAll(this.stageW, this.stageH, true);
      // finish reveals
      for (const e of this.stickers) {
        if (e.phase === 'revealing' && this.time - e.reveal.t0 >= this.revealDuration) {
          e.phase = 'ready';
          this.renderer.deleteImageTexture(e.fullTex); e.fullTex = null;
          if (this.onPhase) this.onPhase(e);
        }
      }
      if (this.onFrame) this.onFrame();
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastFrame = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
        this.lastFrame = now;
        // A frozen comparison redraws on divider/material changes and resize only.
        if (!this.comparison) { this.time += dt; this.update(dt); this.render(); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    stop() { this.running = false; }

    /* ---------------------------------------------------------------- */
    /* Output                                                             */
    /* ---------------------------------------------------------------- */

    /* One sticker on a transparent (or coloured) background. opts: { scale, posed, shadow, background } */
    snapshot(e, opts) {
      opts = opts || {};
      if (!e || !e.tex) return null;
      const scale = opts.scale || 1;
      const margin = opts.posed ? 1.12 : 1;
      const W = e.atlas.w * scale * margin, H = e.atlas.h * scale * margin;
      const size = Math.max(W, H);
      return this.renderer.renderToCanvas({
        width: W, height: H, background: opts.background || null,
        draw: (v) => {
          const view = { stageW: W, stageH: H, camDist: size * 2.2, time: this.time, light: [-size * 0.35, size * 0.45, size * 1.1] };
          this.renderer.beginFrame(view, true);
          const pose = { x: 0, y: 0, z: 0, rotX: opts.posed ? e.rotX : 0, rotY: opts.posed ? e.rotY : 0, rotZ: opts.posed ? e.rotZ : 0, width: e.atlas.w * scale, height: e.atlas.h * scale };
          const shadow = opts.shadow ? this._shadow(e, pose, view, scale) : null;
          this.renderer.drawSticker(opts.tex || e.tex, pose, e.settings, { selected: false, shadow });
        },
      });
    }

    /*
     * Frames of the selected sticker and its attached decorations, with a
     * shared light sweep and tilt. Child transforms live in their parent's
     * plane, while each decoration keeps its own motion and animated texture.
     * opts: { size, fps, shadow, lazy } → { frames, fps, seconds }
     * Lazy frames are a repeatable iterable, releasing each canvas after use.
     * Consume synchronously so scene edits cannot change the export between passes.
     */
    animationFrames(e, opts) {
      opts = opts || {};
      if (!e || !e.tex) return null;
      const size = opts.size || 512, fps = opts.fps || 16, cfg = e.settings;
      const an = cfg.anim || 'none', speed = cfg.animSpeed || 1;
      const periodT = ANIM_PERIOD[an] || TAU;
      const nodes = [], seen = new Set();
      const collect = (entry, parent) => {
        if (!entry.tex || !entry.atlas || seen.has(entry)) return null;
        seen.add(entry);
        const k = (entry.s || 1) / (e.s || 1);
        const node = { entry, parent, w: entry.atlas.w * k, h: entry.atlas.h * k, children: [] };
        nodes.push(node);
        for (const child of this.children(entry)) if (child.offset) {
          const n = collect(child, node); if (n) node.children.push(n);
        }
        return node;
      };
      const root = collect(e, null);
      const drawOrder = nodes.slice().sort((a, b) => this.stickers.indexOf(a.entry) - this.stickers.indexOf(b.entry));
      // an animated picture with no idle animation loops on its own period, so its export loops cleanly too
      const attachedPeriods = nodes.slice(1).flatMap(({ entry }) => {
        const s = entry.settings, periods = [];
        if (entry.tex.period) periods.push(entry.tex.period / 1000);
        if (s.anim && s.anim !== 'none' && s.animAmount !== 0) periods.push((ANIM_PERIOD[s.anim] || TAU) / (s.animSpeed || 1));
        if (entry.tex.blink) periods.push(3.6);
        return periods;
      });
      const seconds = an === 'none' ? clamp(e.tex.period ? e.tex.period / 1000 : attachedPeriods.length ? Math.max(...attachedPeriods) : 2.4, 0.4, 8) : clamp(periodT / speed, 0.6, 8);
      const n = Math.max(2, Math.round(seconds * fps));
      const extent = animationBounds(cfg, { w: e.atlas.w, h: e.atlas.h });
      // A sphere around each subtree covers every combination of child and
      // parent rotations/scales, even when their animation periods differ.
      const reach = node => {
        let radius = Math.hypot(node.w, node.h) / 2;
        for (const child of node.children) radius = Math.max(radius, Math.hypot(child.entry.offset.u * node.w, child.entry.offset.v * node.h) + reach(child));
        const s = node.entry.settings, period = ANIM_PERIOD[s.anim] || TAU;
        let total = radius;
        for (let i = 0; i <= 180; i++) {
          const o = animOffsets(s, node, i / 180 * period);
          total = Math.max(total, Math.hypot(o.ax, o.ay) + radius * o.ascale);
        }
        return total;
      };
      const span = nodes.length > 1 ? reach(root) * 2 : Math.max(extent.width, extent.height);
      const fit = size / Math.max(Math.max(e.atlas.w, e.atlas.h) * 1.28, span * 1.12);
      const renderFrames = function* () {
        for (let i = 0; i < n; i++) {
          const t = i / n, ph = t * TAU;
          const poses = new Map();
          for (const node of nodes) {
            const entry = node.entry, s = entry.settings;
            const o = animOffsets(s, node, node.parent ? t * seconds * (s.animSpeed || 1) : t * periodT);
            const rz = -(s.baseRotation || 0) * DEG + o.arot;
            let pose;
            if (!node.parent) {
              const rx = opts.tilt === false ? 0 : Math.sin(ph) * 0.16, ry = opts.tilt === false ? 0 : Math.cos(ph) * 0.2;
              pose = { x: o.ax * fit, y: -o.ay * fit, z: 0, rotation: StickerRenderer.rotationMatrix(rx, ry, rz), scale: o.ascale };
            } else {
              // Attachment offsets and resting rotations are stored in stage
              // coordinates. Convert them to the parent's plane without adding
              // its resting angle a second time to the user's arrangement.
              const parent = poses.get(node.parent), m = parent.rotation, base = -(node.parent.entry.settings.baseRotation || 0) * DEG;
              const c = Math.cos(rz - base), sn = Math.sin(rz - base), cb = Math.cos(base), sb = Math.sin(base);
              const dx = (entry.offset.u * node.parent.w + o.ax) * fit * parent.scale;
              const dy = (-entry.offset.v * node.parent.h - o.ay) * fit * parent.scale;
              const x = cb * dx + sb * dy, y = -sb * dx + cb * dy;
              const rotation = new Float32Array(9);
              for (let j = 0; j < 3; j++) { rotation[j] = m[j] * c + m[3 + j] * sn; rotation[3 + j] = -m[j] * sn + m[3 + j] * c; rotation[6 + j] = m[6 + j]; }
              pose = { x: parent.x + m[0] * x + m[3] * y, y: parent.y + m[1] * x + m[4] * y, z: parent.z + m[2] * x + m[5] * y, rotation, scale: parent.scale * o.ascale };
            }
            pose.width = node.w * fit * pose.scale; pose.height = node.h * fit * pose.scale;
            poses.set(node, pose);
          }
          const frame = this.renderer.renderToCanvas({
            width: size, height: size, background: null,
            draw: () => {
              const view = { stageW: size, stageH: size, camDist: size * 2.2, time: 0, light: [Math.cos(ph) * size * 0.55, Math.sin(ph) * size * 0.55, size * 1.1] };
              this.renderer.beginFrame(view, true);
              for (const node of drawOrder) {
                const entry = node.entry, pose = poses.get(node);
                const shadow = opts.shadow ? this._shadow(entry, pose, view, fit * (entry.s || 1) / (e.s || 1)) : null;
                this.renderer.drawSticker(this._texAt(entry, t * seconds), pose, entry.settings, { selected: false, shadow });
              }
            },
          });
          try { yield frame; }
          finally { if (opts.lazy) frame.width = frame.height = 1; }
        }
      }.bind(this);
      const frames = opts.lazy ? { width: size, height: size, length: n, [Symbol.iterator]: renderFrames } : Array.from(renderFrames());
      return { frames, fps, seconds: n / fps };
    }

    /* The whole stage as it looks now (all stickers, current poses), with the backdrop colour. */
    snapshotCanvas(opts) {
      opts = opts || {};
      const scale = opts.scale || this.dpr;
      const W = this.stageW * scale, H = this.stageH * scale;
      return this.renderer.renderToCanvas({
        width: W, height: H, background: opts.background || null,
        draw: () => {
          const view = this._view();
          view.stageW = this.stageW; view.stageH = this.stageH; // world units stay in stage px; viewport scales
          this.renderer.beginFrame(view, true);
          this._drawAll(this.stageW, this.stageH, false);
        },
      });
    }

    /* Record a WebM clip of a scripted sweep of every sticker. */
    record(seconds, background) {
      return new Promise((resolve, reject) => {
        if (typeof MediaRecorder === 'undefined' || !this.canvas.captureStream) return reject(new Error('Recording is not supported in this browser.'));
        const stream = this.canvas.captureStream(60);
        const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
        const mime = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : undefined);
        const chunks = [];
        const prevBg = this.background, prevSel = this.selected;
        rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        rec.onerror = (ev) => reject(ev.error || new Error('Recording failed'));
        rec.onstop = () => { this.scripted = null; this.background = prevBg; this.select(prevSel); resolve(new Blob(chunks, { type: mime || 'video/webm' })); };
        const c = StickerRenderer.hexToRgb(background);
        this.background = [c[0], c[1], c[2], 1];
        this.select(null);
        const amp = Math.max(12, ...this.stickers.map((e) => e.settings.hoverTilt));
        this.scripted = { t0: performance.now(), amp, period: seconds };
        rec.start(100);
        setTimeout(() => rec.stop(), seconds * 1000);
      });
    }
  }

  Scene.animOffsets = animOffsets;
  Scene.wrapRotation = wrapRotation;
  Scene.ANIM_PERIOD = ANIM_PERIOD;
  Scene.ANIMATION_OPTIONS = ANIMATION_OPTIONS;
  Scene.animationBounds = animationBounds;
  return Scene;
})();
