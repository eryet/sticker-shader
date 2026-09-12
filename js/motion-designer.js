/* A transactional editor: the draft owns preview, Apply owns history. */
window.StickerMotionDesigner = (() => {
  'use strict';
  const M = StickerMotion, R = StickerRenderer, tr = (s, p) => I18N.t(s, p);
  const clone = x => JSON.parse(JSON.stringify(x));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const icon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 5 9 7-9 7z" fill="#ffc3dc"/><path d="M4 7h2M2 12h4M4 17h2"/></svg>';
  function create(api) {
    const { scene, records } = api, stage = document.getElementById('stage');
    let card, draft = null, undoStack = [], redoStack = [], gesture = null, opener = null;
    const overlay = document.createElement('div'); overlay.id = 'motionOverlay'; overlay.hidden = true;
    overlay.innerHTML = '<svg class="motion-guides" aria-hidden="true"><path class="motion-trail"/><polygon class="motion-ghost start"/><polygon class="motion-ghost end"/><polygon class="motion-current"/><path class="motion-rotate-stem"/></svg><button type="button" class="motion-grip move" data-handle="move">✥</button><button type="button" class="motion-grip rotate" data-handle="rotate">↻</button><button type="button" class="motion-grip scale" data-handle="scale">↗</button><span class="motion-end-label start"></span><span class="motion-end-label end"></span>';
    stage.append(overlay);
    const transport = document.createElement('div'); transport.id = 'motionTransport'; transport.hidden = true;
    transport.setAttribute('role', 'group'); stage.append(transport);
    const rootForSelection = () => {
      let e = scene.selected;
      const seen = new Set(); while (e?.parent && !seen.has(e)) { seen.add(e); e = e.parent; }
      return e;
    };
    const activeState = () => draft || (scene.motionOwner(scene.selected) ? scene.motionState(scene.motionOwner(scene.selected)) : null);
    const physicalKeys = ['x', 'y', 'restX', 'restY', 'vx', 'vy', 'rotX', 'rotY', 'rotZ', 'wx', 'wy', 'wz', 'ax', 'ay', 'arot', 'ascale', 'lift', 'spawn'];
    function button(label, action, classes = '') {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + classes; b.textContent = tr(label); b.addEventListener('click', action); return b;
    }
    function mount() {
      document.getElementById('motionEntry')?.remove();
      const body = document.querySelector('[data-group="motion"] .group-body'); if (!body) return;
      card = document.createElement('div'); card.id = 'motionEntry'; body.prepend(card);
      card.addEventListener('keydown', event => event.stopPropagation());
      refresh();
    }
    function refresh() {
      if (!card?.isConnected) return;
      if (draft && (!scene.get(draft.root.id) || !records.has(draft.root.id))) { close(false); return; }
      card.replaceChildren();
      if (draft) buildEditor();
      else {
        const root = rootForSelection(), rec = root && records.get(root.id), clip = root?.motionClip;
        const heading = document.createElement('div'); heading.className = 'motion-entry-heading';
        heading.innerHTML = icon;
        const text = document.createElement('div'), title = document.createElement('strong'), sub = document.createElement('p');
        title.textContent = tr('Motion designer'); sub.textContent = tr(clip?.enabled ? 'Your motion is ready. Preview it below.' : 'Give your sticker a little choreography.'); text.append(title, sub); heading.append(text); card.append(heading);
        const b = button(clip ? 'Edit motion' : 'Design motion', open, 'primary'); b.id = 'btnDesignMotion';
        b.disabled = !root?.tex || root.phase !== 'ready' || scene.isLocked(root) || !!rec?.imageBusy; card.append(b);
        if (clip) {
          const toggle = button(clip.enabled ? 'Use original motion' : 'Use designed motion', () => { api.setMotionClip(rec, { ...clip, enabled: !clip.enabled }); refresh(); });
          toggle.id = 'motionToggle'; toggle.disabled = b.disabled; toggle.setAttribute('aria-pressed', String(clip.enabled)); card.append(toggle);
          const hint = document.createElement('p'); hint.className = 'motion-fineprint'; hint.textContent = tr('Your original animation settings are kept.'); card.append(hint);
        }
      }
      buildTransport(); tick();
    }
    function open() {
      const root = rootForSelection(), rec = root && records.get(root.id);
      if (draft || !root?.tex || root.phase !== 'ready' || scene.isLocked(root) || rec?.imageBusy || scene.comparison) return false;
      opener = document.activeElement;
      const previousSelection = scene.selected;
      const previousTab = document.querySelector('.panel-tabs [aria-selected="true"]')?.id;
      document.getElementById('propertiesTab').click();
      scene.select(root);
      const clip = M.normalizeClip(root.motionClip) || M.recipe(); clip.enabled = true;
      const physical = scene._assemblyMembers(root).map(e => [e, Object.fromEntries(physicalKeys.map(k => [k, e[k]]))]);
      draft = { root, clip, clock: { time: root.motionClock?.time ?? (scene.surfaceMotionPreference.matches ? M.timing(clip).travel * clip.duration : 0), playing: !root.motionClip && !scene.surfaceMotionPreference.matches, neutral: false, light: root.motionClock?.light?.slice() || [...scene._view().light] }, endpoint: null, physical,
        previousSelection, previousTab, viewport: { w: scene.stageW, h: scene.stageH } };
      scene.motionDraft = draft; scene.motionEditing = true; scene.drag = null;
      undoStack = []; redoStack = []; document.body.classList.add('designing-motion');
      scene.resize();
      const group = card.closest('.group'); group.classList.remove('collapsed'); group.querySelector('.group-head').setAttribute('aria-expanded', 'true');
      refresh(); card.querySelector('#motionClose').focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
      return true;
    }
    function close(apply) {
      if (!draft) return;
      finishGesture(!apply);
      const previous = draft, rec = records.get(previous.root.id);
      draft = null; scene.motionDraft = null; scene.motionEditing = false;
      document.body.classList.remove('designing-motion'); overlay.hidden = true;
      scene.resize();
      for (const [entry, state] of previous.physical) {
        const restore = { ...state };
        for (const key of ['x', 'restX']) restore[key] *= scene.stageW / previous.viewport.w;
        for (const key of ['y', 'restY']) restore[key] *= scene.stageH / previous.viewport.h;
        Object.assign(entry, restore);
      }
      if (!apply && scene.get(previous.previousSelection?.id)) scene.select(previous.previousSelection);
      if (!apply && previous.previousTab) document.getElementById(previous.previousTab)?.click();
      if (apply && rec && scene.get(rec.id)) {
        api.setMotionClip(rec, previous.clip);
        previous.root.motionClock = { ...previous.clock, neutral: false, playing: previous.endpoint ? false : previous.clock.playing };
        api.status(tr('Motion applied. Your attached icons move with it.'), false, { ttl: 3000 });
      }
      refresh(); const target = opener?.isConnected ? opener : document.getElementById('btnDesignMotion'); target?.focus({ preventScroll: true });
    }
    function checkpoint() {
      const json = JSON.stringify(draft.clip);
      if (undoStack.at(-1) !== json) undoStack.push(json);
      if (undoStack.length > 80) undoStack.shift(); redoStack = [];
    }
    function travelHistory(from, to) {
      if (!draft || !from.length) return;
      finishGesture(); if (!from.length) return;
      to.push(JSON.stringify(draft.clip)); draft.clip = JSON.parse(from.pop());
      draft.clock.time = Math.min(draft.clock.time, draft.clip.duration); syncFields(); tick();
    }
    function change(fn) {
      const next = clone(draft.clip); fn(next);
      const normalized = M.normalizeClip(next);
      if (JSON.stringify(normalized) !== JSON.stringify(draft.clip)) { checkpoint(); draft.clip = normalized; }
      draft.clock.time = Math.min(draft.clock.time, draft.clip.duration);
      syncFields(); tick();
    }
    function chooseEndpoint(which) {
      finishGesture(); draft.clock.playing = false; draft.clock.neutral = false; draft.endpoint = which;
      draft.clock.time = which === 'start' ? 0 : M.timing(draft.clip).travel * draft.clip.duration;
      syncFields(); tick();
    }
    function play(restart = false) {
      const state = activeState(); if (!state) return;
      if (state === draft) { finishGesture(); draft.endpoint = null; }
      if (restart || state.clock.neutral || state.clock.time >= state.clip.duration) state.clock.time = 0;
      state.clock.neutral = false; state.clock.playing = restart || !state.clock.playing;
      if (draft) syncFields(); tick();
    }
    function buildTransport() {
      transport.replaceChildren(); transport.setAttribute('aria-label', tr('Motion playback'));
      const restart = button('Restart', () => play(true)); restart.id = 'motionRestart';
      const playButton = button('Play', () => play(), 'primary'); playButton.id = 'motionPlay';
      const range = document.createElement('input'); range.id = 'motionScrub'; range.type = 'range'; range.min = 0; range.max = 1000; range.step = 1; range.setAttribute('aria-label', tr('Motion timeline'));
      range.addEventListener('input', () => { const s = activeState(); if (!s) return; s.clock.playing = false; s.clock.neutral = false; s.clock.time = +range.value / 1000 * s.clip.duration; if (s === draft) { draft.endpoint = null; syncFields(); } tick(); });
      const time = document.createElement('output'); time.id = 'motionTime'; time.setAttribute('for', 'motionScrub');
      const edit = button('Edit motion', open); edit.id = 'motionTransportEdit';
      transport.append(restart, playButton, range, time, edit);
    }
    function field(label, key, min, max, step, suffix = '', pose = false) {
      const row = document.createElement('label'); row.className = 'motion-field';
      const title = document.createElement('span'); title.textContent = tr(label);
      const value = document.createElement('span'); value.className = 'motion-field-value';
      const input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max; input.step = step; input.dataset.field = key; input.dataset.pose = pose ? 'yes' : ''; input.id = 'motion-' + key;
      input.inputMode = 'decimal';
      const unit = document.createElement('span'); unit.textContent = suffix; unit.setAttribute('aria-hidden', 'true'); value.append(input, unit); row.append(title, value);
      input.addEventListener('change', () => {
        if (!draft || !Number.isFinite(input.valueAsNumber)) { syncFields(); return; }
        const n = clamp(input.valueAsNumber, min, max);
        change(clip => {
          const percent = ['x', 'y', 'scale', 'opacity', 'holdStart', 'holdEnd', 'lightStart', 'lightEnd'].includes(key);
          (pose ? clip[draft.endpoint || 'end'] : clip)[key] = n / (percent ? 100 : 1);
          if (pose) { draft.clock.playing = false; draft.endpoint = draft.endpoint || 'end'; }
        });
      });
      return row;
    }
    function select(label, key, options) {
      const row = document.createElement('label'); row.className = 'motion-field select-field';
      const title = document.createElement('span'); title.textContent = tr(label);
      const input = document.createElement('select'); input.dataset.field = key; input.id = 'motion-' + key;
      for (const [value, label] of options) { const o = document.createElement('option'); o.value = value; o.textContent = tr(label); input.append(o); }
      StickerUI.enhanceSelect(input); row.append(title, input);
      input.addEventListener('change', () => change(clip => { clip[key] = input.value; })); return row;
    }
    function buildEditor() {
      const editor = document.createElement('section'); editor.id = 'motionDesigner'; editor.setAttribute('aria-labelledby', 'motionTitle'); card.append(editor);
      const heading = document.createElement('div'); heading.className = 'motion-heading';
      const titles = document.createElement('div'); const eyebrow = document.createElement('span'); eyebrow.className = 'motion-eyebrow'; eyebrow.textContent = tr('MAKE A LITTLE MAGIC');
      const title = document.createElement('h3'); title.id = 'motionTitle'; title.textContent = tr('Motion designer');
      const name = document.createElement('p'); name.textContent = api.name(records.get(draft.root.id)); titles.append(eyebrow, title, name);
      const closeButton = button('×', () => close(false)); closeButton.id = 'motionClose'; closeButton.setAttribute('aria-label', tr('Cancel motion editing')); heading.append(titles, closeButton);
      const history = document.createElement('div'); history.className = 'motion-history'; history.setAttribute('role', 'group'); history.setAttribute('aria-label', tr('Motion history'));
      const undo = button('Undo', () => travelHistory(undoStack, redoStack)); undo.id = 'motionUndo';
      const redo = button('Redo', () => travelHistory(redoStack, undoStack)); redo.id = 'motionRedo';
      const notice = document.createElement('span'); notice.textContent = tr('Preview before applying'); history.append(undo, redo, notice);
      editor.append(heading, history);
      const content = document.createElement('div'); content.className = 'motion-scroll'; editor.append(content);
      const section = (number, label) => {
        const box = document.createElement('section'); box.className = 'motion-section';
        const heading = document.createElement('h4'); heading.className = 'motion-section-title';
        const step = document.createElement('span'); step.className = 'motion-step'; step.textContent = number; step.setAttribute('aria-hidden', 'true');
        heading.append(step, document.createTextNode(tr(label))); box.append(heading); content.append(box); return box;
      };
      const styles = section('1', 'Motion style');
      const styleStatus = document.createElement('span'); styleStatus.className = 'motion-style-status'; styles.querySelector('h4').append(styleStatus);
      const recipes = document.createElement('div'); recipes.className = 'motion-recipes';
      for (const [id, title, hint] of M.RECIPES) {
        const recipe = button('', () => change(clip => { Object.assign(clip, M.recipe(id)); draft.endpoint = null; draft.clock.time = 0; draft.clock.neutral = false; draft.clock.playing = !scene.surfaceMotionPreference.matches; }));
        recipe.className = 'motion-recipe'; recipe.dataset.recipe = id; recipe.title = tr(hint);
        const thumb = document.createElement('span'); thumb.className = 'motion-recipe-art'; thumb.setAttribute('aria-hidden', 'true');
        const trail = { slide: 'M10 24h21m-7-5 7 5-7 5M74 24h16', float: 'M13 30q10-29 24-11m26 7q14 17 24-8', pop: 'M24 7l6 7m-13 9h10m48-16-6 7m14 9H73', light: 'M22 10v8m-4-4h8m49 14v10m-5-5h10' }[id];
        const fill = { slide: '#ffc3dc', float: '#ddcff7', pop: '#ffe3a4', light: '#c4e6f5' }[id];
        thumb.innerHTML = `<svg viewBox="0 0 100 44"><path class="recipe-path" d="${trail}" fill="none" stroke="#ab95be" stroke-width="2" stroke-linecap="round"/><g class="recipe-sticker"><path d="m50 6 6 10 12 2-9 9 2 11-11-5-11 5 2-11-9-9 12-2z" fill="${fill}" stroke="#3b2b38" stroke-width="2.4"/><path d="M47 22h0m6 0h0" stroke="#3b2b38" stroke-width="3" stroke-linecap="round"/><path class="recipe-shine" d="m43 12 13 22" stroke="white" stroke-width="5" opacity=".8"/></g></svg>`;
        const label = document.createElement('span'); label.className = 'motion-recipe-label'; label.textContent = tr(title);
        recipe.append(thumb, label); recipes.append(recipe);
      }
      styles.append(recipes);
      const poses = section('2', 'Edit poses');
      const tabs = document.createElement('div'); tabs.className = 'motion-endpoints'; tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', tr('Edit an endpoint'));
      for (const [id, label] of [['preview', 'Preview'], ['start', 'Start pose'], ['end', 'End pose']]) { const b = button(label, () => id === 'preview' ? play(true) : chooseEndpoint(id)); b.dataset.endpoint = id; tabs.append(b); }
      poses.append(tabs);
      const help = document.createElement('p'); help.className = 'motion-hint'; help.id = 'motionPoseHint'; poses.append(help);
      const poseFields = document.createElement('fieldset'); poseFields.id = 'motionPoseFields'; poseFields.className = 'motion-fields';
      const legend = document.createElement('legend'); legend.textContent = tr('Pose'); poseFields.append(legend);
      for (const args of [['Across', 'x', -150, 150, 1, '%'], ['Down', 'y', -150, 150, 1, '%'], ['Size', 'scale', 10, 200, 1, '%'], ['Opacity', 'opacity', 0, 100, 1, '%'], ['Turn', 'rotation', -720, 720, 1, '°'], ['Tilt up / down', 'tiltX', -40, 40, 1, '°'], ['Tilt left / right', 'tiltY', -40, 40, 1, '°']]) poseFields.append(field(...args, true));
      const reset = button('Reset pose', () => { if (draft.endpoint) change(clip => { clip[draft.endpoint] = M.identity(); }); }); reset.classList.add('motion-reset-pose'); poseFields.append(reset); poses.append(poseFields);
      const poseNote = document.createElement('p'); poseNote.className = 'motion-fineprint'; poseNote.id = 'motionPoseNote'; poseNote.textContent = tr('Position is measured against the sticker’s longest side.'); poses.append(poseNote);
      const timingSection = section('3', 'Timing');
      const timing = document.createElement('div'); timing.className = 'motion-settings';
      timing.append(field('Duration', 'duration', 1, 8, .2, 's'), select('Playback', 'mode', [['loop', 'Loop'], ['once', 'Play once']]),
        select('Easing', 'easing', [['smooth', 'Smooth'], ['soft', 'Soft'], ['pop', 'Pop'], ['linear', 'Linear']]));
      const strip = document.createElement('div'); strip.className = 'motion-timing-strip'; strip.setAttribute('aria-hidden', 'true');
      const timingLegend = document.createElement('div'); timingLegend.className = 'motion-timing-legend';
      for (const name of ['Move', 'Hold', 'Return', 'Rest']) {
        const segment = document.createElement('span'); strip.append(segment);
        const label = document.createElement('span'), swatch = document.createElement('i'), value = document.createElement('b'); swatch.setAttribute('aria-hidden', 'true');
        label.append(swatch, document.createTextNode(tr(name)), value); timingLegend.append(label);
      }
      timing.append(strip, timingLegend);
      const holds = document.createElement('div'); holds.className = 'motion-fields'; holds.append(field('Hold at end', 'holdEnd', 0, 60, 1, '%'), field('Rest at start', 'holdStart', 0, 20, 1, '%')); timing.append(holds);
      timingSection.append(timing);
      const lights = document.createElement('details'); lights.className = 'motion-light'; lights.open = true;
      const summary = document.createElement('summary'); summary.textContent = tr('Choreograph the light'); lights.append(summary);
      lights.append(select('Light path', 'light', [['keep', 'Keep current light'], ['right', 'Left to right'], ['left', 'Right to left'], ['diagonal', 'Diagonal sweep'], ['orbit', 'Orbit']]));
      const sweep = document.createElement('div'); sweep.className = 'motion-fields motion-sweep-fields'; sweep.append(field('Sweep starts', 'lightStart', 0, 85, 1, '%'), field('Sweep ends', 'lightEnd', 10, draft.clip.mode === 'loop' ? 90 : 100, 1, '%')); lights.append(sweep); content.append(lights);
      const hint = document.createElement('p'); hint.className = 'motion-fineprint'; hint.textContent = tr('Attached icons move with your sticker. Your changes save when you apply.'); content.append(hint);
      const actions = document.createElement('div'); actions.className = 'motion-actions';
      const cancel = button('Cancel', () => close(false)); cancel.id = 'motionCancel';
      const apply = button('Apply motion', () => close(true), 'primary'); apply.id = 'motionApply';
      actions.append(cancel, apply); editor.append(actions); syncFields();
    }
    function syncFields() {
      if (!draft || !card?.isConnected) return;
      for (const input of card.querySelectorAll('[data-field]')) {
        const key = input.dataset.field, obj = input.dataset.pose ? draft.clip[draft.endpoint || 'end'] : draft.clip;
        const percent = ['x', 'y', 'scale', 'opacity', 'holdStart', 'holdEnd', 'lightStart', 'lightEnd'].includes(key);
        input.value = typeof obj[key] === 'number' ? +(obj[key] * (percent ? 100 : 1)).toFixed(2) : obj[key];
        if (key === 'holdStart') { input.disabled = draft.clip.mode === 'once'; input.closest('label').hidden = input.disabled; }
        if (key === 'lightEnd') input.max = draft.clip.mode === 'loop' ? 90 : 100;
        if (key.startsWith('light') && key !== 'light') input.disabled = draft.clip.light === 'keep';
      }
      for (const tab of card.querySelectorAll('[data-endpoint]')) tab.setAttribute('aria-pressed', String(tab.dataset.endpoint === (draft.endpoint || 'preview')));
      const poseFields = card.querySelector('#motionPoseFields'); poseFields.disabled = !draft.endpoint; poseFields.hidden = !draft.endpoint;
      poseFields.querySelector('legend').textContent = tr(draft.endpoint === 'start' ? 'Start pose' : 'End pose');
      card.querySelector('#motionPoseNote').hidden = !draft.endpoint;
      card.querySelector('#motionPoseHint').textContent = tr(draft.endpoint ? 'Drag on the canvas to move, resize or turn. Fine-tune the values below.' : 'Choose Start pose or End pose to change where your sticker begins and finishes.');
      const clipJSON = JSON.stringify(draft.clip);
      let selectedStyle = false;
      for (const recipe of card.querySelectorAll('[data-recipe]')) { const selected = clipJSON === JSON.stringify(M.recipe(recipe.dataset.recipe)); recipe.setAttribute('aria-pressed', String(selected)); selectedStyle ||= selected; }
      card.querySelector('.motion-style-status').textContent = selectedStyle ? '' : tr('Custom motion');
      card.querySelector('.motion-sweep-fields').hidden = draft.clip.light === 'keep';
      card.querySelector('#motionUndo').disabled = !undoStack.length; card.querySelector('#motionRedo').disabled = !redoStack.length;
      const t = M.timing(draft.clip), loop = draft.clip.mode === 'loop';
      const segments = [t.travel, draft.clip.holdEnd, loop ? t.travel : 0, loop ? draft.clip.holdStart : 0];
      card.querySelectorAll('.motion-timing-strip span').forEach((el, i) => { el.style.flex = segments[i]; el.hidden = segments[i] < .001; });
      card.querySelectorAll('.motion-timing-legend > span').forEach((el, i) => { el.hidden = segments[i] < .001; el.querySelector('b').textContent = (segments[i] * draft.clip.duration).toFixed(1) + 's'; });
      overlay.hidden = !draft.endpoint;
    }
    function projected(pose) {
      const cam = scene._view().camDist;
      return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
        const p = R.surfaceVertex(pose, u, v, 0, 0), scale = cam / (cam - p.z);
        return { x: scene.stageW / 2 + p.x * scale, y: scene.stageH / 2 - p.y * scale };
      });
    }
    function endpointGeometry(which) {
      return projected(scene.motionGroup(draft.root, 0, { endpoint: which }).get(draft.root).pose);
    }
    const centerOf = points => ({ x: points.reduce((n, p) => n + p.x, 0) / 4, y: points.reduce((n, p) => n + p.y, 0) / 4 });
    function tick() {
      if (draft && (!scene.get(draft.root.id) || scene.selected !== draft.root || scene.isLocked(draft.root))) { close(false); return; }
      const s = activeState(); transport.hidden = !s || !!scene.comparison || !!scene.motionRecording;
      if (s && transport.firstChild) {
        const progress = s.clock.time / s.clip.duration;
        const playButton = transport.querySelector('#motionPlay'); playButton.textContent = tr(s.clock.playing ? 'Pause' : 'Play'); playButton.setAttribute('aria-pressed', String(s.clock.playing));
        const scrub = transport.querySelector('#motionScrub'); if (document.activeElement !== scrub) scrub.value = progress * 1000;
        scrub.setAttribute('aria-valuetext', tr('{time} of {duration} seconds', { time: s.clock.time.toFixed(1), duration: s.clip.duration }));
        transport.querySelector('#motionTime').textContent = s.clock.neutral ? tr('Base pose') : `${s.clock.time.toFixed(1)} / ${s.clip.duration.toFixed(1)}s`;
        transport.querySelector('#motionTransportEdit').hidden = !!draft;
      }
      if (!draft?.endpoint || overlay.hidden) return;
      const start = endpointGeometry('start'), end = endpointGeometry('end'), a = centerOf(start), b = centerOf(end);
      const points = draft.endpoint === 'start' ? start : end, c = centerOf(points), top = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const len = Math.max(1, Math.hypot(top.x - c.x, top.y - c.y)), rot = { x: top.x + (top.x - c.x) / len * 32, y: top.y + (top.y - c.y) / len * 32 };
      const coords = list => list.map(p => `${p.x},${p.y}`).join(' ');
      overlay.querySelector('.motion-ghost.start').setAttribute('points', coords(start)); overlay.querySelector('.motion-ghost.end').setAttribute('points', coords(end)); overlay.querySelector('.motion-current').setAttribute('points', coords(points));
      overlay.querySelector('.motion-trail').setAttribute('d', `M${a.x} ${a.y} L${b.x} ${b.y}`);
      overlay.querySelector('.motion-rotate-stem').setAttribute('d', `M${top.x} ${top.y} L${rot.x} ${rot.y}`);
      const handleBottom = Math.max(44, scene.stageH - (transport.hidden ? 24 : transport.offsetHeight + 40));
      for (const [which, pos] of [['move', c], ['rotate', rot], ['scale', points[2]]]) {
        const handle = overlay.querySelector(`[data-handle="${which}"]`); handle.style.left = clamp(pos.x, 24, scene.stageW - 24) + 'px'; handle.style.top = clamp(pos.y, 24, handleBottom) + 'px';
        handle.setAttribute('aria-label', tr({ move: 'Move endpoint', rotate: 'Rotate endpoint', scale: 'Resize endpoint' }[which]));
      }
      for (const [which, p] of [['start', start[0]], ['end', end[0]]]) {
        const label = overlay.querySelector('.motion-end-label.' + which); label.textContent = tr(which === 'start' ? 'Start' : 'End'); label.style.left = clamp(p.x, 12, scene.stageW - 70) + 'px'; label.style.top = clamp(p.y - 28, 6, scene.stageH - 80) + 'px';
      }
    }
    overlay.addEventListener('pointerdown', event => {
      if (!draft?.endpoint || event.button !== 0 || gesture) return;
      const handle = event.target.closest('[data-handle]'); if (!handle && !event.target.classList.contains('motion-current')) return;
      const target = handle || overlay;
      const historyDepth = undoStack.length, previousRedo = redoStack.slice();
      event.preventDefault(); checkpoint(); handle?.focus(); target.setPointerCapture(event.pointerId);
      const rect = stage.getBoundingClientRect(), center = centerOf(endpointGeometry(draft.endpoint));
      gesture = { id: event.pointerId, target, historyDepth, previousRedo, kind: handle?.dataset.handle || 'move', x: event.clientX, y: event.clientY, center: { x: center.x + rect.left, y: center.y + rect.top }, before: clone(draft.clip) };
    });
    overlay.addEventListener('pointermove', event => {
      if (!gesture || gesture.id !== event.pointerId || !draft) return;
      const g = gesture, pose = draft.clip[draft.endpoint], before = g.before[draft.endpoint], unit = Math.max(draft.root.work.w, draft.root.work.h) * draft.root.s;
      if (g.kind === 'move') { pose.x = before.x + (event.clientX - g.x) / unit; pose.y = before.y + (event.clientY - g.y) / unit; }
      if (g.kind === 'scale') pose.scale = before.scale * Math.hypot(event.clientX - g.center.x, event.clientY - g.center.y) / Math.max(20, Math.hypot(g.x - g.center.x, g.y - g.center.y));
      if (g.kind === 'rotate') {
        const angle = Math.atan2(event.clientY - g.center.y, event.clientX - g.center.x) - Math.atan2(g.y - g.center.y, g.x - g.center.x);
        pose.rotation = before.rotation + Math.atan2(Math.sin(angle), Math.cos(angle)) * 180 / Math.PI;
        if (event.shiftKey) pose.rotation = Math.round(pose.rotation / 15) * 15;
      }
      draft.clip = M.normalizeClip(draft.clip); syncFields(); tick();
    });
    function finishGesture(cancel = false) {
      if (!gesture) return; const g = gesture; gesture = null;
      if (draft && (cancel || JSON.stringify(draft.clip) === JSON.stringify(g.before))) { draft.clip = g.before; undoStack.length = g.historyDepth; redoStack.splice(0, redoStack.length, ...g.previousRedo); syncFields(); }
      if (g.target.hasPointerCapture(g.id)) g.target.releasePointerCapture(g.id);
    }
    overlay.addEventListener('pointerup', () => finishGesture());
    overlay.addEventListener('pointercancel', () => finishGesture(true));
    overlay.addEventListener('lostpointercapture', () => finishGesture(true));
    overlay.addEventListener('keydown', event => {
      if (!draft?.endpoint) return;
      const handle = event.target.closest('[data-handle]'), dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!handle || !dir) return; event.preventDefault(); event.stopPropagation();
      change(clip => { const p = clip[draft.endpoint], n = dir * (event.shiftKey ? 10 : 1);
        if (handle.dataset.handle === 'move') p[['ArrowUp', 'ArrowDown'].includes(event.key) ? 'y' : 'x'] += n / 100;
        else if (handle.dataset.handle === 'rotate') p.rotation += n; else p.scale += n / 100;
      });
    });
    const allowed = target => target instanceof Element && !!target.closest('#motionDesigner, #motionTransport, #motionOverlay');
    // Draft controls own keyboard and pointer actions until Apply/Cancel. This
    // prevents unrelated canvas/history mutations without changing saved artwork.
    for (const type of ['pointerdown', 'click', 'dblclick', 'drop', 'paste', 'wheel']) document.addEventListener(type, event => {
      if (type === 'click' && event.target.matches?.('a[download]') && event.target.href.startsWith('blob:')) return;
      if (scene.motionExporting || scene.motionRecording) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (!draft || allowed(event.target)) return;
      if (type === 'wheel' && event.target.closest('.panel')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (type === 'click') api.status(tr('Apply or cancel motion before editing other controls.'), false, { ttl: 2200 });
    }, { capture: true, passive: false });
    document.addEventListener('keydown', event => {
      if (scene.motionExporting || scene.motionRecording) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (!draft) return;
      // A picker owns Escape and Tab until it closes. Do not discard the draft.
      const pickerOpen = CSS.supports('selector(select:open)') && card.querySelector('select:open');
      if (pickerOpen && (event.key === 'Escape' || event.key === 'Tab')) { event.stopPropagation(); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (gesture) finishGesture(true); else close(false); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopImmediatePropagation(); travelHistory(event.shiftKey ? redoStack : undoStack, event.shiftKey ? undoStack : redoStack); return; }
      if (event.key === 'Tab') {
        const list = [...card.querySelectorAll('button, input, select, summary'), ...transport.querySelectorAll('button, input'), ...overlay.querySelectorAll('button')].filter(el => !el.matches(':disabled') && !el.closest('[hidden]') && (!el.closest('select') || el.tagName === 'SELECT') && el.getClientRects().length);
        const index = list.indexOf(document.activeElement), next = (index + (event.shiftKey ? -1 : 1) + list.length) % list.length;
        event.preventDefault(); event.stopImmediatePropagation(); list[next]?.focus(); return;
      }
      if (!allowed(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    // Inputs must not bubble editor shortcuts (delete, arrows, space) to the app.
    for (const element of [card, transport, overlay].filter(Boolean)) element.addEventListener('keydown', event => event.stopPropagation());
    document.addEventListener('keydown', event => { if (draft && allowed(event.target)) event.stopPropagation(); });
    window.addEventListener('blur', () => finishGesture(true));
    document.addEventListener('visibilitychange', () => { scene.lastFrame = performance.now(); if (document.hidden) finishGesture(true); });
    scene.surfaceMotionPreference.addEventListener('change', event => {
      if (!event.matches) return;
      for (const root of scene.stickers) if (scene.motionOwner(root) === root) { const s = scene.motionState(root); s.clock.playing = false; s.clock.neutral = true; }
    });
    mount();
    return { mount, refresh, tick, open, cancel: () => close(false), apply: () => close(true), undo: () => travelHistory(undoStack, redoStack), redo: () => travelHistory(redoStack, undoStack), get draft() { return draft; } };
  }
  return { create };
})();
