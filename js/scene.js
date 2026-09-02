/*
 * scene.js — the interactive stage with many stickers.
 *
 * Each sticker entity has its own physics (drag spring, velocity lean, grab
 * lift, hover tilt, idle sway), its own look settings and its own textures.
 * The array order is the z-order; the selected / dragged sticker is brought
 * to the top. A sticker goes through three phases:
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
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let nextId = 1;

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
      this._bind();
      this.resize();
    }

    /* ---------------------------------------------------------------- */
    /* Entities                                                           */
    /* ---------------------------------------------------------------- */

    /*
     * Add a sticker in the processing phase. { id, full: canvas (working image),
     * settings }. Returns the entry.
     */
    add(spec) {
      const W = this.stageW, H = this.stageH;
      const probe = { settings: spec.settings, work: { w: spec.full.width, h: spec.full.height } };
      const s0 = this._scaleFor(probe);
      const spot = this._openSpot({ w: probe.work.w * s0, h: probe.work.h * s0 });
      const entry = {
        id: spec.id || 's' + nextId++,
        settings: spec.settings,
        work: { w: spec.full.width, h: spec.full.height },
        fullTex: this.renderer.createImageTexture(spec.full),
        tex: null, atlas: null,
        phase: 'processing',
        reveal: null,
        cropCenter: { x: spec.full.width / 2, y: spec.full.height / 2 },
        x: spot.x, y: spot.y,
        vx: 0, vy: 0, rotX: 0, rotY: 0, rotZ: 0, wx: 0, wy: 0, wz: 0,
        restX: 0, restY: 0, s: 1, born: this.time,
      };
      entry.restX = entry.x; entry.restY = entry.y;
      entry.s = this._scaleFor(entry);
      this.stickers.push(entry);
      this.select(entry);
      return entry;
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
      if (this.drag && this.drag.entry === e) this.drag = null;
      if (this.hovered === e) this.hovered = null;
      if (this.selected === e) this.select(null);
      this.render();
    }

    get(id) { return this.stickers.find((e) => e.id === id) || null; }

    select(entry) {
      if (this.selected === entry) return;
      this.selected = entry;
      if (this.onSelect) this.onSelect(entry);
    }

    bringToFront(entry) {
      const i = this.stickers.indexOf(entry);
      if (i >= 0 && i !== this.stickers.length - 1) { this.stickers.splice(i, 1); this.stickers.push(entry); }
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
      return { x: e.x - sz.w / 2 + inset, y: e.y - sz.h / 2 + inset, w: sz.w - 2 * inset, h: sz.h - 2 * inset, cx: e.x, cy: e.y };
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
      c.addEventListener('pointerleave', () => { this.pointer.inside = false; if (!this.drag) this._cursor('default'); });
      c.addEventListener('pointerenter', () => { this.pointer.inside = true; });
    }

    _local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    _cursor(v) { if (this.canvas.style.cursor !== v) this.canvas.style.cursor = v; }

    /* Topmost sticker under a stage point, or null. */
    hitTest(px, py) {
      for (let i = this.stickers.length - 1; i >= 0; i--) {
        const e = this.stickers[i];
        const sz = this.size(e);
        const u = (px - e.x) / sz.w + 0.5, v = (py - e.y) / sz.h + 0.5;
        if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
        if (!e.atlas) return e; // processing card: rectangular
        const ax = Math.floor(u * e.atlas.w), ay = Math.floor(v * e.atlas.h);
        const sdf = e.atlas.sdf[ay * e.atlas.w + ax];
        if (sdf + e.settings.borderWidth > -4 / e.s) return e;
      }
      return null;
    }

    _down(e) {
      const p = this._local(e);
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.inside = true; this.pointer.lastMove = this.time;
      const hit = this.hitTest(p.x, p.y);
      if (!hit) { this.select(null); return; }
      this.select(hit);
      this.bringToFront(hit);
      this.canvas.setPointerCapture(e.pointerId);
      this.drag = { entry: hit, dx: p.x - hit.x, dy: p.y - hit.y, id: e.pointerId };
      this._cursor('grabbing');
      e.preventDefault();
    }

    _move(e) {
      const p = this._local(e);
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.inside = true; this.pointer.lastMove = this.time;
      if (this.drag) { e.preventDefault(); return; }
      const hit = this.hitTest(p.x, p.y);
      this._cursor(hit ? 'grab' : 'default');
      if (hit !== this.hovered) { this.hovered = hit; if (this.onHover) this.onHover(hit); }
    }

    _up(e) {
      if (!this.drag) return;
      try { this.canvas.releasePointerCapture(this.drag.id); } catch (err) { /* ignore */ }
      const s = this.drag.entry, sz = this.size(s);
      if (s.settings.snapBack) { s.restX = this.stageW / 2; s.restY = this.stageH / 2; }
      else {
        s.restX = clamp(s.x, sz.w * 0.2, this.stageW - sz.w * 0.2);
        s.restY = clamp(s.y, sz.h * 0.2, this.stageH - sz.h * 0.2);
      }
      this.drag = null;
      this._cursor(this.hitTest(this.pointer.x, this.pointer.y) ? 'grab' : 'default');
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
      const ak = 140 + cfg.stiffness * 260, ad = 2 * Math.sqrt(ak) * (0.5 + cfg.damping * 0.6);
      s.wx += ((rx - s.rotX) * ak - s.wx * ad) * dt; s.rotX += s.wx * dt;
      s.wy += ((ry - s.rotY) * ak - s.wy * ad) * dt; s.rotY += s.wy * dt;
      s.wz += ((rz - s.rotZ) * ak - s.wz * ad) * dt; s.rotZ += s.wz * dt;
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
      const dragging = this.drag && this.drag.entry === e;
      return {
        x: e.x - W / 2, y: -(e.y - H / 2), z: dragging ? 30 : 0,
        rotX: e.rotX, rotY: e.rotY, rotZ: e.rotZ, width: sz.w, height: sz.h,
      };
    }

    _shadow(e, lift) {
      return { dx: -Math.sin(e.rotY) * lift * 0.6 + lift * 0.25, dy: -Math.sin(e.rotX) * lift * 0.6 - lift * 0.35, scale: 1 + lift * 0.0008 };
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

    _drawAll(W, H, includeSelection) {
      for (const e of this.stickers) {
        const rs = this._revealState(e);
        const pose = this._pose(e, W, H);
        const lift = e.settings.shadowLift;
        if (rs && e.fullTex) {
          const off = e.atlas
            ? [(e.work.w / 2 - e.cropCenter.x) * e.s, -(e.work.h / 2 - e.cropCenter.y) * e.s]
            : [0, 0];
          const fullPose = Object.assign({}, pose, { width: e.work.w * e.s, height: e.work.h * e.s, offset: off });
          this.renderer.drawFullLayer(e.fullTex, e.tex, fullPose, {
            atlasRect: e.atlas ? [e.atlas.x0, e.atlas.y0, e.atlas.w, e.atlas.h] : null,
            front: rs.front, processing: rs.processing, alpha: rs.fullAlpha,
            borderWidth: e.settings.borderWidth * rs.borderT,
            shadow: Object.assign(this._shadow(e, lift), { opacity: e.settings.shadowOpacity * rs.fullShadow, blur: e.settings.shadowBlur, spread: e.settings.shadowSpread }),
          });
        }
        if (e.tex) {
          this.renderer.drawSticker(e.tex, pose, this._effective(e, rs), {
            selected: includeSelection && e === this.selected,
            shadow: this._shadow(e, lift),
          });
        }
      }
    }

    render() {
      const view = this._view();
      this.renderer.clearColor = this.background;
      this.renderer.beginFrame(view, true);
      this._drawAll(this.stageW, this.stageH, true);
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
        this.lastFrame = now; this.time += dt;
        this.update(dt);
        this.render();
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
          const lift = e.settings.shadowLift * scale;
          const shadow = opts.shadow ? (opts.posed ? this._shadow(e, lift) : { dx: lift * 0.25, dy: -lift * 0.35, scale: 1 }) : null;
          this.renderer.drawSticker(e.tex, pose, e.settings, { selected: false, shadow });
        },
      });
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

  return Scene;
})();
