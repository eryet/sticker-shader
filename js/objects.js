/* Contextual sticker actions and a selectable, accessible layer stack. */
window.StickerObjects = (() => {
  'use strict';
  const tr = (s, p) => I18N.t(s, p);
  const glyphs = {
    duplicate: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M12 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h2"/>',
    rotate: '<circle cx="10" cy="10" r="7.5"/><path class="object-angle-needle" d="M10 10V5"/><circle cx="10" cy="10" r="1" fill="currentColor"/>',
    flip: '<path d="M10 2v16M7 5 2 15h5ZM13 5l5 10h-5Z"/>',
    attach: '<path d="m7 12 6-6M7 8l-3 3a4 4 0 0 0 6 6l3-3M7 6l3-3a4 4 0 0 1 6 6l-3 3"/>',
    lock: '<rect x="4" y="9" width="12" height="9" rx="2"/><path d="M6 9V6a4 4 0 0 1 8 0v3M10 12v3"/>',
    unlock: '<rect x="4" y="9" width="12" height="9" rx="2"/><path d="M6 9V6a4 4 0 0 1 8 0M10 12v3"/>',
    delete: '<path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6m4-6v6"/>',
    image: '<rect x="2.5" y="3" width="15" height="14" rx="2"/><path d="m3 14 4-4 3 3 3-4 4 5"/><circle cx="7" cy="7" r="1"/>',
  };
  const svg = key => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[key]}</svg>`;

  function create(api) {
    const { scene, records } = api;
    const transformUI = StickerTransform.create(api);
    const toolbar = document.getElementById('objectToolbar');
    const list = document.getElementById('layerList');
    const pane = document.getElementById('layersPane');
    const tabs = [...document.querySelectorAll('.panel-tabs [role="tab"]')];
    const tabMotionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    tabMotionPreference.addEventListener('change', e => {
      if (!e.matches) return;
      for (const tab of tabs) {
        tab.querySelector('.panel-tab-icon').getAnimations({ subtree: true }).forEach(a => a.cancel());
        document.getElementById(tab.getAttribute('aria-controls')).getAnimations().forEach(a => a.cancel());
      }
    });
    const rows = new Map(), thumbs = new WeakMap();
    let signature = '', thumbId = 0, transform = '', lastAngle = '';
    let rotationOwner = null, rotationControl = null, rotationLocale = '', pinned = null, position = { x: 8, y: 8 };
    const actions = document.createElement('div'); actions.className = 'object-actions'; toolbar.appendChild(actions);
    const buttons = {};
    for (const [action, label] of [['duplicate', 'Duplicate'], ['rotate', 'Rotate'], ['flip', 'Flip'], ['attach', 'Attach']]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'object-action'; b.dataset.action = action;
      b.innerHTML = (action === 'rotate' ? '<span class="object-angle-readout">' + svg(action) + '<strong class="object-angle-value">0°</strong></span>' : svg(action)) + '<span class="object-action-label"></span>';
      b.lastElementChild.textContent = tr(label);
      b.addEventListener('click', () => action === 'rotate' ? toggleRotation() : api.action(action)); actions.appendChild(b); buttons[action] = b;
    }
    const del = document.getElementById('btnDelete');
    del.className = 'object-action object-delete'; del.style.transform = '';
    del.innerHTML = svg('delete');
    del.appendChild(document.createElement('span')); actions.appendChild(del);
    const imageAction = document.createElement('button'); imageAction.type = 'button'; imageAction.className = 'object-image-action'; imageAction.dataset.action = 'image'; imageAction.hidden = true;
    imageAction.innerHTML = svg('image') + '<span></span>'; imageAction.addEventListener('click', () => api.action('image')); toolbar.appendChild(imageAction);
    const resizeTogether = document.createElement('button'); resizeTogether.type = 'button'; resizeTogether.className = 'object-resize-together'; resizeTogether.dataset.action = 'resizeTogether'; resizeTogether.hidden = true;
    resizeTogether.innerHTML = svg('attach') + '<span></span><i aria-hidden="true"></i>';
    resizeTogether.addEventListener('click', () => api.action('resizeTogether')); toolbar.appendChild(resizeTogether);
    const rotationPanel = document.createElement('div'); rotationPanel.id = 'objectRotation'; rotationPanel.className = 'object-rotation'; rotationPanel.hidden = true;
    rotationPanel.setAttribute('role', 'group'); toolbar.appendChild(rotationPanel);
    buttons.rotate.setAttribute('aria-controls', rotationPanel.id); buttons.rotate.setAttribute('aria-expanded', 'false');

    function closeRotation(focus = false) {
      if (rotationPanel.hidden) return;
      rotationControl?.setDisabled(true); rotationOwner = null; pinned = null;
      rotationPanel.hidden = true; toolbar.classList.remove('rotation-open'); buttons.rotate.setAttribute('aria-expanded', 'false');
      if (focus && !buttons.rotate.disabled) buttons.rotate.focus({ preventScroll: true });
    }
    function toggleRotation() {
      if (!rotationPanel.hidden) { closeRotation(true); tick(); return; }
      const rec = scene.selected && records.get(scene.selected.id);
      if (!rec?.atlas || scene.isLocked(scene.selected) || api.editing()) return;
      rotationOwner = rec.id; rotationLocale = I18N.locale; pinned = null;
      const label = document.createElement('label'); label.htmlFor = 'objectRotationAngle'; label.textContent = tr('Rotation');
      const target = () => rotationOwner === rec.id && scene.selected?.id === rec.id && !scene.isLocked(scene.selected) && !api.editing() ? rec.settings : null;
      rotationControl = StickerUI.buildRotationControl(StickerUI.controlsByKey.baseRotation, label.htmlFor, label, target, (value, discrete) => api.rotate(rec.id, value, discrete));
      rotationControl.set(rec.settings.baseRotation || 0); rotationControl.setDisabled(false);
      rotationPanel.replaceChildren(rotationControl.element); rotationPanel.setAttribute('aria-label', tr('Rotation'));
      rotationPanel.hidden = false; toolbar.classList.add('rotation-open'); buttons.rotate.setAttribute('aria-expanded', 'true');
      tick(); pinned = { ...position }; rotationControl.element.querySelector('.rotation-dial').focus({ preventScroll: true });
    }
    for (const event of ['pointerdown', 'focusin']) document.addEventListener(event, e => { if (!toolbar.contains(e.target)) closeRotation(); }, true);
    toolbar.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !rotationPanel.hidden) { e.preventDefault(); e.stopPropagation(); closeRotation(true); tick(); }
    });
    actions.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const available = [...actions.querySelectorAll('button')].filter(b => !b.hidden && !b.disabled), i = available.indexOf(document.activeElement);
      if (i < 0) return;
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? available.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
      e.preventDefault(); e.stopPropagation(); available[j].focus();
    });

    function playTabMotion(tab) {
      const icon = tab.querySelector('.panel-tab-icon');
      if (tabMotionPreference.matches) return;
      // Capture the current pose before cancelling, so an interrupted hover or
      // rapid click begins where the drawing is rather than snapping to rest.
      const parts = [icon, ...icon.children];
      const poses = new Map(parts.map(el => [el, getComputedStyle(el).transform]));
      icon.getAnimations({ subtree: true }).forEach(a => a.cancel());
      const animate = (el, frames, duration = 900, delay = 0) => {
        if (!el) return;
        el.animate([{ transform: poses.get(el) || 'none', offset: 0, easing: 'cubic-bezier(.16,1,.3,1)' }, ...frames, { transform: 'none', offset: 1 }], {
          duration, delay, easing: 'linear', fill: 'backwards',
        });
      };
      const pose = (transform, offset) => ({ transform, offset, easing: 'cubic-bezier(.22,1,.36,1)' });
      if (tab.id === 'propertiesTab') {
        animate(icon, [pose('translateY(-.75px) scale(1.05) rotate(-1.5deg)', .3), pose('scale(1.015)', .65)], 800);
        animate(icon.querySelector('.tab-slider-top'), [pose('translateX(5px)', .32), pose('translateX(-.5px)', .72)], 800);
        animate(icon.querySelector('.tab-slider-bottom'), [pose('translateX(-5px)', .34), pose('translateX(.5px)', .74)], 800, 70);
        icon.querySelector('rect').animate([
          { fill: '#fff8fc', stroke: '#594c60' }, { fill: '#ffe3ef', stroke: '#b56a92', offset: .38 }, { fill: '#fff8fc', stroke: '#594c60' },
        ], { duration: 1000, easing: 'ease-in-out' });
      } else {
        animate(icon, [pose('translateY(-2px) scale(1.15) rotate(-5deg)', .23), pose('translateY(-1px) scale(1.08) rotate(3deg)', .6), pose('scale(.985)', .82)]);
        animate(icon.querySelector('.tab-layer-front'), [pose('translate(-3px,-4px) rotate(-18deg)', .3), pose('translate(-3px,-4px) rotate(-18deg)', .52), pose('translate(1px,1px) rotate(3deg)', .82)], 920);
        animate(icon.querySelector('.tab-layer-middle'), [pose('translate(0,-2px) rotate(5deg)', .3), pose('translate(0,-2px) rotate(5deg)', .52), pose('translateY(.5px) rotate(-2deg)', .82)], 920, 60);
        animate(icon.querySelector('.tab-layer-back'), [pose('translate(2px,3px) rotate(16deg)', .3), pose('translate(2px,3px) rotate(16deg)', .52), pose('translate(-.5px,-.5px) rotate(-2deg)', .82)], 920, 120);
      }
    }

    function openTab(tab) {
      const changed = tab.getAttribute('aria-selected') !== 'true';
      for (const t of tabs) {
        const active = t === tab;
        t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1;
        const content = document.getElementById(t.getAttribute('aria-controls'));
        content.getAnimations().forEach(a => a.cancel());
        content.hidden = !active;
      }
      playTabMotion(tab);
      if (changed && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.getElementById(tab.getAttribute('aria-controls')).animate([
          { opacity: .8, transform: 'translateY(2px)' }, { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 160, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') { tab.dataset.iconActive = ''; playTabMotion(tab); } });
      tab.addEventListener('pointerleave', () => { delete tab.dataset.iconActive; });
      tab.addEventListener('focus', () => { if (tab.matches(':focus-visible')) playTabMotion(tab); });
      tab.addEventListener('click', () => openTab(tab));
      tab.addEventListener('keydown', e => {
        const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : -1;
        if (j < 0) return;
        e.preventDefault(); openTab(tabs[j]); tabs[j].focus();
      });
    });
    document.querySelectorAll('[data-order]').forEach(b => b.addEventListener('click', () => api.action('order', Number(b.dataset.order))));

    function thumbKey(rec) {
      const source = rec.atlas?.canvas || rec.work;
      if (!source || typeof source.getContext !== 'function') return 'empty';
      if (!thumbs.has(source)) thumbs.set(source, ++thumbId);
      return thumbs.get(source) + ':' + !!rec.settings.flipX;
    }
    function paintThumb(canvas, rec) {
      const source = rec.atlas?.canvas || rec.work;
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 96, 96);
      if (!source || typeof source.getContext !== 'function') return;
      const inset = rec.atlas ? Math.max(0, rec.atlas.pad - rec.settings.borderWidth - 4) : 0;
      const w = Math.max(1, source.width - inset * 2), h = Math.max(1, source.height - inset * 2), scale = Math.min(84 / w, 84 / h);
      ctx.save(); ctx.translate(48, 48); if (rec.settings.flipX) ctx.scale(-1, 1);
      ctx.drawImage(source, inset, inset, w, h, -w * scale / 2, -h * scale / 2, w * scale, h * scale); ctx.restore();
    }
    function rowFor(entry) {
      let row = rows.get(entry.id); if (row) return row;
      row = document.createElement('li'); row.className = 'layer-row'; row.dataset.id = entry.id;
      const select = document.createElement('button'); select.type = 'button'; select.className = 'layer-select';
      const thumb = document.createElement('canvas'); thumb.width = thumb.height = 96; thumb.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span'); text.className = 'layer-text';
      text.append(document.createElement('strong'), document.createElement('small'));
      select.append(thumb, text); select.addEventListener('click', () => api.select(entry.id));
      const lock = document.createElement('button'); lock.type = 'button'; lock.className = 'layer-lock';
      lock.addEventListener('click', () => api.lock(entry.id));
      row.append(select, lock); rows.set(entry.id, row); return row;
    }
    function refresh() {
      const entries = scene.stickers.slice().reverse(), chosen = scene.selected, editing = api.editing();
      const rec = chosen && records.get(chosen.id), locked = scene.isLocked(chosen);
      const ready = !!(rec?.atlas && chosen.phase === 'ready' && !rec.imageBusy);
      const attached = !!chosen?.parent;
      for (const [action, label] of [['duplicate', 'Duplicate'], ['rotate', 'Rotate'], ['flip', 'Flip'], ['attach', attached ? 'Detach' : 'Attach']]) {
        const b = buttons[action]; b.lastElementChild.textContent = tr(label);
        b.title = tr(action === 'rotate' ? 'Adjust rotation' : action === 'duplicate' ? 'Duplicate with attached icons (Ctrl+D)' : action === 'flip' ? 'Flip horizontally' : label);
        b.disabled = !ready || editing || (action !== 'duplicate' && locked);
      }
      buttons.flip.setAttribute('aria-pressed', String(!!rec?.settings[rec.kind === 'icon' ? 'iconFlip' : 'flipX']));
      buttons.attach.hidden = rec?.kind !== 'icon';
      buttons.attach.disabled ||= !attached && !api.attachment(chosen);
      buttons.attach.setAttribute('aria-pressed', String(attached));
      imageAction.hidden = rec?.kind !== 'sticker'; imageAction.disabled = !ready || editing || locked;
      imageAction.lastElementChild.textContent = tr(rec?.imageBusy ? 'Removing background…' : rec?.imageMode === 'whole' ? 'Remove background' : 'Restore original');
      imageAction.setAttribute('aria-busy', String(!!rec?.imageBusy));
      del.lastElementChild.textContent = tr('Delete'); del.disabled = !chosen || locked || editing;
      del.hidden = !chosen;
      resizeTogether.hidden = !chosen || !scene.children(chosen).length;
      resizeTogether.disabled = !ready || editing || locked;
      resizeTogether.setAttribute('aria-pressed', String(rec?.settings.resizeTogether !== false));
      resizeTogether.querySelector('span').textContent = tr('Resize together');
      resizeTogether.title = tr('Scale attached icons with this item. Applies to corner handles, Size, scrolling, and pinching.');
      const count = document.getElementById('layerCount');
      count.textContent = entries.length.toLocaleString(I18N.locale);
      count.dataset.empty = String(entries.length === 0);
      count.title = tr('{n} layers', { n: entries.length });
      document.getElementById('layersEmpty').hidden = !!entries.length;
      const activeIds = new Set(entries.map(e => e.id));
      for (const [id, row] of rows) if (!activeIds.has(id)) { row.remove(); rows.delete(id); }
      entries.forEach((entry, index) => {
        const rec = records.get(entry.id); if (!rec) return;
        const row = rowFor(entry), [select, lock] = row.children;
        const name = api.name(rec), inherited = !!entry.parent && scene.isLocked(entry.parent), isLocked = scene.isLocked(entry);
        row.classList.toggle('selected', entry === chosen); row.classList.toggle('locked', isLocked);
        row.classList.toggle('attached', !!entry.parent);
        select.setAttribute('aria-pressed', String(entry === chosen)); select.disabled = editing;
        select.querySelector('strong').textContent = name;
        const parent = entry.parent && records.get(entry.parent.id);
        const photo = rec.frame?.photoId && records.get(rec.frame.photoId);
        let subtitle = parent ? tr('Attached to {name}', { name: api.name(parent) }) : photo ? tr('Photo: {name}', { name: api.name(photo) }) : tr({ icon: 'Icon', frame: 'Portrait frame', sticker: 'Photo sticker' }[rec.kind]);
        if (isLocked) subtitle += ' · ' + tr(inherited ? 'Parent locked' : 'Locked');
        select.querySelector('small').textContent = subtitle;
        select.title = name + ' · ' + subtitle;
        const lockGlyph = isLocked ? 'lock' : 'unlock';
        if (lock.dataset.glyph !== lockGlyph) { lock.innerHTML = svg(lockGlyph); lock.dataset.glyph = lockGlyph; }
        lock.title = inherited ? tr('Unlock the parent first') : tr(isLocked ? 'Unlock {name}' : 'Lock {name}', { name });
        lock.setAttribute('aria-label', lock.title); lock.setAttribute('aria-pressed', String(isLocked)); lock.disabled = inherited || editing;
        const key = thumbKey(rec) + ':' + rec.settings.borderWidth;
        if (row.dataset.thumb !== key) { paintThumb(select.firstChild, rec); row.dataset.thumb = key; }
        if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
      });
      document.querySelectorAll('[data-order]').forEach(b => {
        b.disabled = editing || !chosen || locked || !api.canOrder(chosen, Number(b.dataset.order));
      });
      pane.setAttribute('aria-busy', String(editing));
    }
    function tick() {
      transformUI.tick();
      const candidate = scene.selected && !scene.selected.parent && records.get(scene.selected.id)?.kind === 'icon' ? api.attachment(scene.selected)?.id : '';
      const next = I18N.locale + '|' + scene.selected?.id + '|' + candidate + '|' + api.editing() + '|' + scene.stickers.map(e => {
        const r = records.get(e.id);
        return [e.id, e.parent?.id, e.locked, e.phase, r && api.name(r), r?.frame?.photoId, r && thumbKey(r), r?.settings.iconFlip, r?.settings.resizeTogether, r?.settings.borderWidth, r?.imageMode, r?.imageBusy].join(':');
      }).join('|');
      if (next !== signature) { signature = next; refresh(); }
      const corners = scene.resizeGeometry()?.points;
      const b = corners ? { cx: corners.reduce((n, p) => n + p.x / 4, 0), y: Math.min(...corners.map(p => p.y)),
        h: Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y)) } : scene.bounds();
      toolbar.hidden = !b || api.editing() || !!scene.drag || !!scene.resizing;
      if (toolbar.hidden) { closeRotation(); return; }
      if (rotationOwner && (scene.selected?.id !== rotationOwner || scene.isLocked(scene.selected) || rotationLocale !== I18N.locale)) closeRotation();
      const angle = Math.round(scene.selected.settings.baseRotation || 0), key = scene.selected.id + ':' + angle;
      if (key !== lastAngle) {
        lastAngle = key; buttons.rotate.querySelector('.object-angle-value').textContent = angle + '°';
        buttons.rotate.style.setProperty('--object-angle', angle + 'deg');
        if (!rotationPanel.hidden) rotationControl.set(angle);
      }
      const w = toolbar.offsetWidth, h = toolbar.offsetHeight;
      const x = Math.max(8, Math.min(scene.stageW - w - 8, pinned ? pinned.x : b.cx - w / 2));
      const above = b.y - h - 26;
      const y = Math.max(8, Math.min(scene.stageH - h - 8, pinned ? pinned.y : above >= 8 ? above : b.y + b.h + 26));
      position = { x, y };
      const tf = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      if (tf !== transform) { toolbar.style.transform = tf; transform = tf; }
    }
    return { tick, refresh: () => { signature = ''; tick(); } };
  }
  return { create };
})();
