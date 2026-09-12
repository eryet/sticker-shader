/* One timeline and one group transform for live motion, picking and output. */
(() => {
  'use strict';
  const P = StickerScene.prototype, M = StickerMotion, R = StickerRenderer, D = Math.PI / 180;
  const saved = Object.fromEntries(['_pose', '_updateOne', '_animate', 'surfacePhase', '_surfaceOptions', '_texAt', 'record', 'snapshot', 'animationFrames', '_down', '_wheel', 'captureResize'].map(k => [k, P[k]]));
  const mul = (a, b) => new Float32Array(Array.from({ length: 9 }, (_, i) => {
    const row = i % 3, col = Math.floor(i / 3); return a[row] * b[col * 3] + a[3 + row] * b[col * 3 + 1] + a[6 + row] * b[col * 3 + 2];
  }));
  Object.assign(P, {
    motionOwner(entry) {
      let owner = null, remaining = this.stickers.length + 1;
      for (let e = entry; e && remaining-- > 0; e = e.parent) if ((this.motionDraft?.root === e ? this.motionDraft.clip : e.motionClip)?.enabled) owner = e;
      return owner;
    },
    motionState(root) {
      if (this.motionDraft?.root === root) return this.motionDraft;
      if (!root.motionClock) this.resetMotion(root);
      return { root, clip: root.motionClip, clock: root.motionClock };
    },
    resetMotion(root, play = !this.surfaceMotionPreference.matches) {
      root.motionClock = { time: 0, playing: play, neutral: !play, light: [...this._view().light] };
    },
    neutralizeMotion(entry) {
      const root = this.motionOwner(entry); if (!root || this.motionEditing) return;
      const { clock } = this.motionState(root); clock.playing = false; clock.neutral = true;
    },
    advanceMotion(dt) {
      if (document.hidden || this.comparison || this.resizing) return;
      for (const root of this.stickers) {
        if (this.motionOwner(root) !== root) continue;
        if (this.motionDraft && this.motionDraft.root !== root) continue;
        const { clip, clock } = this.motionState(root);
        if (this.motionRecording) { clock.time = Math.min(1, (performance.now() - this.motionRecording.t0) / (this.motionRecording.seconds * 1000)) * clip.duration; clock.neutral = false; continue; }
        if (!clock.playing || !Number.isFinite(dt)) continue;
        clock.neutral = false;
        const next = clock.time + Math.max(0, dt);
        clock.time = clip.mode === 'loop' ? next % clip.duration : Math.min(next, clip.duration);
        if (clip.mode === 'once' && next >= clip.duration) clock.playing = false;
      }
    },
    motionGroup(root, seconds, options = {}) {
      const state = this.motionState(root), clip = options.clip || state.clip;
      const s = M.sample(clip, seconds, options), nodes = this._assemblyMembers(root), map = new Map();
      const unit = Math.max(root.work.w, root.work.h) * root.s, sz = this.size(root);
      const rootRotation = R.rotationMatrix(s.tiltX * D, s.tiltY * D, -((root.settings.baseRotation || 0) + s.rotation) * D);
      const light = s.light ? [s.light[0] * this.stageW * .5, s.light[1] * this.stageH * .5, this._view().camDist * .55] : [...state.clock.light];
      for (const entry of nodes) {
        if (!entry.tex) continue;
        const size = this.size(entry), parent = map.get(entry.parent), cfg = entry.settings;
        let pose;
        if (entry === root) pose = { x: root.x - this.stageW / 2 + s.x * unit, y: this.stageH / 2 - root.y - s.y * unit, z: 0,
          rotation: rootRotation, width: sz.w * s.scale, height: sz.h * s.scale, scale: s.scale, opacity: s.opacity, rotX: 0, rotY: 0, rotZ: 0 };
        else if (parent) {
          // Each child keeps a whole number of preset cycles inside the parent's duration.
          const period = StickerScene.ANIM_PERIOD[cfg.anim] || Math.PI * 2;
          const cycles = Math.max(1, Math.round(clip.duration * (cfg.animSpeed || 1) / period));
          const o = options.neutral || options.endpoint ? { ax: 0, ay: 0, arot: 0, ascale: 1 } : StickerScene.animOffsets(cfg, size, s.phase * period * cycles);
          const p = parent.pose, m = p.rotation, base = -(entry.parent.settings.baseRotation || 0) * D;
          const dx = ((entry.offset?.u || 0) * this.size(entry.parent).w + o.ax) * p.scale;
          const dy = (-(entry.offset?.v || 0) * this.size(entry.parent).h - o.ay) * p.scale;
          const x = Math.cos(base) * dx + Math.sin(base) * dy, y = -Math.sin(base) * dx + Math.cos(base) * dy;
          pose = { x: p.x + m[0] * x + m[3] * y, y: p.y + m[1] * x + m[4] * y, z: p.z + m[2] * x + m[5] * y,
            rotation: mul(m, R.rotationMatrix(0, 0, -(cfg.baseRotation || 0) * D - base + o.arot)),
            scale: p.scale * o.ascale, width: size.w * p.scale * o.ascale, height: size.h * p.scale * o.ascale, opacity: p.opacity, rotX: 0, rotY: 0, rotZ: 0 };
        } else continue;
        const effectPhase = options.neutral || options.endpoint ? -1 : s.phase;
        const assembly = this.assemblyOwner(entry);
        if (assembly && nodes.includes(assembly)) {
          const members = this._assemblyMembers(assembly), index = members.indexOf(entry);
          // Parent arrival already travels through the child plane; only apply the child's own arrival once.
          pose = R.assemblyPose(pose, R.assemblyState(effectPhase, index ? index + 1 : 0, members.length + 1, assembly.settings.surfaceAmount));
        }
        if (parent && this.peelOwner(entry.parent)) {
          const sheet = parent.pose.surface || { entry: entry.parent, pose: parent.pose, tex: parent.tex, settings: entry.parent.settings,
            phase: effectPhase, amount: R.surfaceState(entry.parent.settings, effectPhase).peel, inset: R.peelInset(entry.parent.tex, entry.parent.settings) };
          pose = R.bindSurface(pose, sheet);
        }
        const imagePeriod = entry.tex.period ? entry.tex.period / 1000 : 3.6;
        const textureTime = s.phase * imagePeriod * Math.max(1, Math.round(clip.duration / imagePeriod));
        // Shimmer travels out and back on a loop, preserving the hue at the seam.
        const shaderTime = options.neutral || options.endpoint ? 0 : clip.mode === 'loop' ? clip.duration * (1 - Math.cos(s.phase * Math.PI * 2)) / 2 : s.phase * clip.duration;
        map.set(entry, { pose, light, time: shaderTime, phase: effectPhase, tex: saved._texAt.call(this, entry, textureTime),
          options: saved._surfaceOptions.call(this, entry, effectPhase, true) });
      }
      return map;
    },
    motionFrame(entry) {
      const root = this.motionOwner(entry); if (!root) return null;
      const state = this.motionState(root), { clock } = state;
      return this.motionGroup(root, clock.time, { neutral: clock.neutral, endpoint: state.endpoint }).get(entry);
    },
    _pose(e, W, H) { return this.motionFrame(e)?.pose || saved._pose.call(this, e, W, H); },
    _updateOne(e, dt) {
      const root = this.motionOwner(e);
      if (root && !this.motionState(root).clock.neutral) {
        if (e.parent && e.offset) { const size = this.size(e.parent); e.restX = e.parent.x + e.offset.u * size.w; e.restY = e.parent.y + e.offset.v * size.h; }
        e.x = e.restX; e.y = e.restY; e.ax = e.ay = e.arot = e.vx = e.vy = e.wx = e.wy = e.wz = e.lift = 0; e.ascale = 1; return;
      }
      saved._updateOne.call(this, e, dt);
    },
    _animate(e, size) {
      if (this.motionOwner(e)) { e.ax = e.ay = e.arot = 0; e.ascale = 1; }
      else saved._animate.call(this, e, size);
    },
    surfacePhase(e) { return this.motionFrame(e)?.phase ?? saved.surfacePhase.call(this, e); },
    _surfaceOptions(e, phase, exporting) {
      if (!exporting && this.motionOwner(e)) return this.motionFrame(e).options;
      return saved._surfaceOptions.call(this, e, phase, exporting);
    },
    _down(event) {
      if (this.motionEditing || this.motionRecording) return;
      saved._down.call(this, event);
      if (this.drag) this.neutralizeMotion(this.drag.entry);
    },
    _wheel(event) { if (this.motionEditing || this.motionRecording) return; saved._wheel.call(this, event); },
    captureResize(entry) { this.neutralizeMotion(entry); return saved.captureResize.call(this, entry); },
    motionBounds(root, clip, shadow = false) {
      const cam = this._view().camDist; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      // Fixed framing samples the complete clip, including bends and invisible endpoints.
      for (let k = 0; k <= 160; k++) for (const [entry, frame] of this.motionGroup(root, k / 160 * clip.duration, { clip })) {
        const amount = R.surfaceState(entry.settings, frame.phase).peel, inset = R.peelInset(entry.tex, entry.settings);
        for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) {
          const p = R.surfaceVertex(frame.pose, i / 4, j / 4, amount, inset), f = cam / Math.max(cam * .05, cam - p.z);
          const x = p.x * f, y = p.y * f;
          const pad = shadow ? (Math.abs(p.z) + (entry.settings.shadowLift || 0) + (entry.settings.shadowBlur || 0) * 3) * 1.2 : 0;
          x0 = Math.min(x0, x - pad); x1 = Math.max(x1, x + pad); y0 = Math.min(y0, y - pad); y1 = Math.max(y1, y + pad);
        }
      }
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, span: Math.max(1, x1 - x0, y1 - y0) * 1.12 + 8 };
    },
    renderMotionFrame(root, seconds, options = {}) {
      const clip = options.clip || this.motionState(root).clip, bounds = options.bounds || this.motionBounds(root, clip, options.shadow);
      const size = options.size || 512, frames = this.motionGroup(root, seconds, { clip, neutral: options.neutral });
      return this.renderer.renderToCanvas({ width: size, height: size, background: options.background || null, draw: () => {
        const view = { ...this._view(), stageW: bounds.span, stageH: bounds.span, viewportOffset: [bounds.x, bounds.y], time: 0 };
        this.renderer.beginFrame(view, true);
        for (const entry of this.stickers) {
          const f = frames.get(entry); if (!f) continue;
          this.renderer.drawSticker(f.tex, f.pose, entry.settings, { ...f.options, light: f.light, time: f.time,
            shadow: options.shadow ? this._shadow(entry, f.pose, { ...view, light: f.light }) : null });
        }
      } });
    },
    snapshot(e, opts = {}) {
      const root = this.motionOwner(e);
      if (!root || !opts.posed) return saved.snapshot.call(this, e, opts);
      const { clock } = this.motionState(root);
      return this.renderMotionFrame(root, clock.time, { ...opts, neutral: clock.neutral, size: Math.max(root.atlas.w, root.atlas.h) * (opts.scale || 1) });
    },
    animationFrames(e, opts = {}) {
      const root = this.motionOwner(e); if (!root) return saved.animationFrames.call(this, e, opts);
      const clip = M.normalizeClip(this.motionState(root).clip), size = opts.size || 512, fps = opts.fps || 25;
      // Freeze camera, settings and attachment coordinates once. Lazy encoding
      // may yield to the browser while a window resize or another edit occurs.
      const scene = Object.assign(Object.create(P), this), copies = new Map(this.stickers.map(entry => [entry, { ...entry,
        settings: { ...entry.settings }, offset: entry.offset && { ...entry.offset }, motionClip: M.normalizeClip(entry.motionClip),
        motionClock: entry.motionClock && { ...entry.motionClock, light: entry.motionClock.light.slice() } }]));
      scene.stickers = [...copies.values()]; scene.motionDraft = null; scene.motionEditing = false; scene.scripted = null; scene.pointer = { ...this.pointer };
      for (const [entry, copy] of copies) copy.parent = copies.get(entry.parent) || null;
      const frozenRoot = copies.get(root);
      const count = Math.max(2, Math.round(clip.duration * fps)), bounds = scene.motionBounds(frozenRoot, clip, opts.shadow);
      const frames = { length: count, width: size, height: size, *[Symbol.iterator]() {
        for (let i = 0; i < count; i++) {
          const seconds = i / (clip.mode === 'once' ? count - 1 : count) * clip.duration;
          const frame = scene.renderMotionFrame(frozenRoot, seconds, { ...opts, clip, bounds, size });
          try { yield frame; } finally { if (opts.lazy) frame.width = frame.height = 1; }
        }
      } };
      return { frames: opts.lazy ? frames : Array.from(frames), seconds: count / fps, fps, loop: clip.mode === 'loop', bounds };
    },
    record(seconds, background) {
      const roots = this.stickers.filter(e => this.motionOwner(e) === e);
      if (!roots.length) return saved.record.call(this, seconds, background);
      if (this.motionEditing || this.motionRecording) return Promise.reject(new Error('Finish editing before recording.'));
      return new Promise((resolve, reject) => {
        if (typeof MediaRecorder === 'undefined' || !this.canvas.captureStream) return reject(new Error('Recording is not supported in this browser.'));
        const previous = { background: this.background, selected: this.selected, clocks: roots.map(root => [root, { ...this.motionState(root).clock }]) };
        let stream, recorder, timer, failure, finished = false;
        const chunks = [];
        const cleanup = () => {
          clearTimeout(timer); document.removeEventListener('visibilitychange', hidden);
          stream?.getTracks().forEach(track => track.stop()); this.motionRecording = null;
          this.background = previous.background;
          for (const [root, clock] of previous.clocks) root.motionClock = clock;
          this.select(this.get(previous.selected?.id));
        };
        const finish = () => {
          if (finished) return; finished = true; cleanup();
          if (failure) reject(failure);
          else if (!chunks.some(chunk => chunk.size)) reject(new Error('No video frames were recorded. Please try again.'));
          else resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
        };
        const hidden = () => {
          if (!document.hidden) return;
          failure = new Error('Recording paused because the tab was hidden. Please try again.');
          if (recorder?.state !== 'inactive') recorder.stop(); else finish();
        };
        try {
          stream = this.canvas.captureStream(60);
          const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
          recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : undefined);
          recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
          recorder.onerror = event => { failure = event.error || new Error('Recording failed'); if (recorder.state !== 'inactive') recorder.stop(); else finish(); };
          recorder.onstop = finish;
          this.background = [...R.hexToRgb(background), 1]; this.select(null);
          for (const root of roots) { const clock = this.motionState(root).clock; clock.time = 0; clock.neutral = false; }
          this.motionRecording = { t0: performance.now(), seconds };
          document.addEventListener('visibilitychange', hidden); recorder.start(100); this.render();
          stream.getVideoTracks()[0]?.requestFrame?.();
          timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, seconds * 1000);
        } catch (error) { failure = error; finish(); }
      });
    },
  });
})();
