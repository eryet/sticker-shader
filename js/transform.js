/* On-canvas resize grips. The scene owns geometry; the app owns undo history. */
window.StickerTransform = (() => {
  'use strict';
  const tr = (s, p) => I18N.t(s, p);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const labels = ['Resize top-left corner', 'Resize top-right corner', 'Resize bottom-right corner', 'Resize bottom-left corner'];

  function create(api) {
    const { scene, records } = api, stage = scene.canvas.parentElement, coarse = matchMedia('(pointer: coarse)');
    const visibility = document.getElementById('showResizeHandles');
    // This is an editor view option, not a material setting or an undoable edit.
    visibility.checked = false;
    const style = (el, key, value) => { if (el.style[key] !== value) el.style[key] = value; };
    const overlay = document.createElement('div'); overlay.id = 'resizeFrame'; overlay.className = 'resize-frame'; overlay.hidden = true;
    overlay.innerHTML = '<svg class="resize-outline" aria-hidden="true"><path class="resize-outline-halo"/><path class="resize-outline-line"/></svg><span id="resizeHint" class="resize-hint"></span>';
    const halo = overlay.querySelector('.resize-outline-halo'), line = overlay.querySelector('.resize-outline-line'), hint = overlay.querySelector('.resize-hint');
    const handles = labels.map((label, corner) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'resize-handle'; button.dataset.corner = corner;
      button.innerHTML = '<span aria-hidden="true"></span>'; button.setAttribute('aria-describedby', 'resizeHint'); overlay.append(button);
      button.addEventListener('pointerdown', event => start(event, corner, button));
      button.addEventListener('pointermove', move);
      button.addEventListener('pointerup', event => { if (gesture?.pointerId === event.pointerId) finish(false); });
      button.addEventListener('pointercancel', event => { if (gesture?.pointerId === event.pointerId) finish(true); });
      button.addEventListener('lostpointercapture', event => { if (gesture?.pointerId === event.pointerId) finish(true); });
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || gesture) return;
        const entry = scene.selected; if (!available(entry)) return;
        event.preventDefault(); event.stopPropagation();
        const snapshot = scene.captureResize(entry), step = event.shiftKey ? .1 : .01;
        const value = event.key === 'Home' ? StickerScene.SIZE_MIN : event.key === 'End' ? StickerScene.SIZE_MAX :
          entry.settings.stickerScale + (['ArrowRight', 'ArrowUp'].includes(event.key) ? step : -step);
        scene.scaleFrom(snapshot, value); api.resize(snapshot, 'keyboard'); scene.render();
      });
      return button;
    });
    stage.insertBefore(overlay, document.getElementById('objectToolbar'));
    let gesture = null, locale = '', outline = '';
    visibility.addEventListener('change', () => {
      if (!visibility.checked) finish(true);
      scene.render();
    });

    function available(entry) {
      return visibility.checked && !!entry?.tex && entry.phase === 'ready' && !records.get(entry.id)?.imageBusy && !api.editing() && !scene.comparison && !scene.scripted &&
        !scene.drag && !scene.isLocked(entry) && (entry.settings.resizeTogether === false || !scene._assemblyMembers(entry).some(e => scene.isLocked(e)));
    }
    function point(event) {
      const rect = scene.canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function start(event, corner, button) {
      if (event.button !== 0 || !event.isPrimary || gesture || !available(scene.selected)) return;
      const entry = scene.selected; scene.neutralizeMotion?.(entry);
      const geometry = scene.resizeGeometry(entry); if (!geometry) return;
      const anchor = geometry.points[(corner + 2) % 4], tip = geometry.points[corner];
      if (Math.hypot(tip.x - anchor.x, tip.y - anchor.y) < 4) return;
      event.preventDefault(); event.stopPropagation();
      const snapshot = scene.captureResize(entry);
      gesture = { entry, geometry, snapshot, corner, anchor, tip, pointer: point(event), pointerId: event.pointerId, button,
        w: scene.stageW, h: scene.stageH, moved: false, cancel: () => finish(true) };
      scene.resizing = gesture; scene.hovered = null;
      button.focus({ preventScroll: true });
      try { button.setPointerCapture(event.pointerId); } catch (_) { /* Synthetic input has no active native pointer. */ }
      overlay.classList.add('is-resizing'); tick();
    }
    function move(event) {
      const g = gesture; if (!g || g.pointerId !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const p = point(event), dx = p.x - g.pointer.x, dy = p.y - g.pointer.y;
      if (!g.moved && Math.hypot(dx, dy) < 2) return;
      g.moved = true;
      const vx = g.tip.x - g.anchor.x, vy = g.tip.y - g.anchor.y;
      const distance = 1 + (dx * vx + dy * vy) / (vx * vx + vy * vy);
      // Correct for perspective so a tilted corner stays under the pointer.
      const depth = (g.geometry.world[g.corner].z - g.geometry.pose.z) / (g.geometry.cam - g.geometry.pose.z);
      const denominator = 1 - depth + distance * depth;
      const factor = denominator > .001 ? Math.max(0, distance / denominator) : StickerScene.SIZE_MAX / g.snapshot.items[0].scale;
      scene.restoreResize(g.snapshot);
      const applied = scene.scaleFrom(g.snapshot, g.snapshot.items[0].scale * factor);
      g.limited = Math.abs(applied - factor) > .0001;
      scene.translateResize(g.entry, 0, 0);
      scene.anchorResize(g.entry, (g.corner + 2) % 4, g.anchor);
      api.resizePreview(); scene.render();
    }
    function finish(cancel) {
      const g = gesture; if (!g) return;
      gesture = null; scene.resizing = null; overlay.classList.remove('is-resizing');
      if (cancel || !g.moved) { scene.restoreResize(g.snapshot); api.resizePreview(); }
      else api.resize(g.snapshot, 'handle', true);
      try { g.button.releasePointerCapture(g.pointerId); } catch (_) { /* Capture was already released. */ }
      scene.pointer.inside = false; scene.hovered = null; scene.lastFrame = performance.now();
      scene.render();
    }
    document.addEventListener('keydown', event => {
      if (!gesture) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(true); }
      // Don't let shortcuts mutate or export a half-finished resize.
      else if (event.ctrlKey || event.metaKey || ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    // End before an unrelated control changes settings, history, or selection.
    document.addEventListener('pointerdown', event => { if (gesture && !overlay.contains(event.target)) finish(true); }, true);
    document.addEventListener('focusin', event => { if (gesture && !overlay.contains(event.target)) finish(true); });
    window.addEventListener('blur', () => finish(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) finish(true); });

    function tick() {
      const entry = scene.selected;
      if (gesture && (entry !== gesture.entry || !available(entry) || scene.stageW !== gesture.w || scene.stageH !== gesture.h)) { finish(true); return; }
      const geometry = visibility.checked && entry && scene.resizeGeometry(entry);
      overlay.hidden = !geometry || api.editing() || !!scene.comparison || !!scene.scripted || !!scene.drag || scene.isLocked(entry) || !!records.get(entry?.id)?.imageBusy;
      if (overlay.hidden) return;
      const ready = available(entry), together = scene.children(entry).length > 0 && entry.settings.resizeTogether !== false;
      overlay.classList.toggle('together', together); overlay.classList.toggle('blocked', !ready);
      if (locale !== I18N.locale) {
        locale = I18N.locale;
        handles.forEach((button, i) => { button.setAttribute('aria-label', tr(labels[i])); button.title = tr('Drag a corner to resize. Arrow keys adjust size; Escape cancels a drag.'); });
      }
      const path = geometry.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
      if (outline !== path) { outline = path; halo.setAttribute('d', path); line.setAttribute('d', path); }
      const margin = coarse.matches ? 24 : 18;
      handles.forEach((button, i) => {
        const p = geometry.points[i], opposite = geometry.points[(i + 2) % 4];
        style(button, 'left', clamp(p.x, margin, Math.max(margin, scene.stageW - margin)).toFixed(1) + 'px');
        style(button, 'top', clamp(p.y, margin, Math.max(margin, scene.stageH - margin)).toFixed(1) + 'px');
        const angle = (Math.atan2(p.y - opposite.y, p.x - opposite.x) * 180 / Math.PI + 180) % 180;
        style(button, 'cursor', angle < 22.5 || angle >= 157.5 ? 'ew-resize' : angle < 67.5 ? 'nwse-resize' : angle < 112.5 ? 'ns-resize' : 'nesw-resize');
        button.disabled = !ready;
      });
      const top = Math.min(...geometry.points.map(p => p.y)), center = geometry.points.reduce((sum, p) => sum + p.x / 4, 0);
      const text = !ready ? tr('Unlock attached icons or turn off Resize together.') :
        (gesture?.limited ? tr(together ? 'Group size limit' : 'Size limit') : together ? tr('Resize together') : tr('Size')) + ' · ' + entry.settings.stickerScale.toFixed(2);
      if (hint.textContent !== text) hint.textContent = text;
      style(hint, 'left', clamp(center, 85, Math.max(85, scene.stageW - 85)).toFixed(1) + 'px');
      style(hint, 'top', clamp(top - 24, 8, Math.max(8, scene.stageH - 32)).toFixed(1) + 'px');
    }
    return { tick, cancel: () => finish(true) };
  }
  return { create };
})();
