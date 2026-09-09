/* A reversible material preview, split directly across the editor canvas. */
window.StickerCompare = (() => {
  function create(api) {
    const $ = s => document.querySelector(s), tr = s => I18N.t(s);
    const dialog = $('#materialCompare'), stage = $('#stage'), surface = $('#compareSurface');
    const handle = $('#compareHandle'), picker = $('#compareMaterial');
    let session = null, fraction = .5, pointer = null, previousFocus = null;
    const variants = () => StickerUI.comparisonVariants();
    const chosen = () => variants().find(v => v.id === picker.value);
    function position() {
      if (!dialog.open) return;
      const r = stage.getBoundingClientRect();
      const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      Object.assign(dialog.style, { left: `${r.left}px`, top: `${top}px`, width: `${r.width}px`, height: `${Math.max(0, bottom - top)}px` });
    }
    function divide(value) {
      fraction = Math.max(0, Math.min(1, value));
      dialog.style.setProperty('--compare-split', `${fraction * 100}%`);
      const percent = Math.round(fraction * 100);
      handle.setAttribute('aria-valuenow', percent);
      handle.setAttribute('aria-valuetext', I18N.t('{before}% before, {after}% after', { before: percent, after: 100 - percent }));
      api.split(fraction);
    }
    function preview() {
      if (!session) return;
      api.preview(chosen());
      $('#compareAfterName').textContent = tr(chosen().label);
      $('#compareApply').textContent = tr(chosen().foil ? 'Apply foil' : 'Apply material');
      $('#compareApply').disabled = !api.changed();
    }
    function labels() {
      const value = picker.value;
      const materials = document.createElement('optgroup'), foils = document.createElement('optgroup');
      materials.label = tr('Materials'); foils.label = tr('Holographic foils');
      for (const v of variants()) (v.foil ? foils : materials).append(new Option(tr(v.label), v.id));
      picker.replaceChildren(materials, foils);
      picker.value = value || session?.variant;
      StickerUI.enhanceSelect(picker);
      if (session) { $('#compareBeforeName').textContent = tr(session.label); preview(); divide(fraction); }
    }
    function release() {
      const id = pointer; pointer = null; surface.classList.remove('dragging');
      if (id != null && surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
    }
    function cleanup() {
      release(); api.end(); session = null; document.body.classList.remove('comparing-material');
    }
    function close(restore = true) {
      cleanup(); dialog.close();
      if (restore) {
        const target = previousFocus?.isConnected && previousFocus.getClientRects().length ? previousFocus : $('#btnCompareMaterials');
        target?.focus({ preventScroll: true });
      }
    }
    function open(variant) {
      if (document.querySelector('dialog[open]')) return;
      session = api.begin(variant); if (!session) return;
      previousFocus = document.activeElement; labels(); picker.value = variant?.id || session.variant; preview();
      const r = stage.getBoundingClientRect();
      if (Math.min(innerHeight, r.bottom) - Math.max(0, r.top) < 260) stage.scrollIntoView({ block: 'start', behavior: 'instant' });
      document.body.classList.add('comparing-material'); dialog.showModal(); position(); divide(session.split); handle.focus({ preventScroll: true });
    }
    const atPointer = e => { const r = surface.getBoundingClientRect(); divide((e.clientX - r.left) / r.width); };
    surface.addEventListener('pointerdown', e => {
      if (e.button !== 0 || pointer != null) return;
      e.preventDefault(); pointer = e.pointerId; surface.setPointerCapture(pointer); surface.classList.add('dragging');
      handle.focus({ preventScroll: true }); atPointer(e);
    });
    surface.addEventListener('pointermove', e => { if (e.pointerId === pointer) atPointer(e); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(name, e => { if (e.pointerId === pointer) release(); });
    handle.addEventListener('keydown', e => {
      const step = e.shiftKey ? .1 : .01;
      const keys = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -.1, PageUp: .1 };
      if (e.key in keys) divide(fraction + keys[e.key]);
      else if (e.key === 'Home') divide(0); else if (e.key === 'End') divide(1);
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    surface.addEventListener('dblclick', () => divide(session?.split ?? .5));
    $('#compareReset').addEventListener('click', () => divide(session?.split ?? .5));
    picker.addEventListener('change', preview);
    // The stylable picker scrolls inside its own shell. Keep the selected foil
    // visible even when it belongs to the second group in the longer list.
    const revealChoice = () => requestAnimationFrame(() => {
      const list = picker.querySelector('.select-options'), option = picker.selectedOptions[0];
      if (!list || !option || !picker.matches(':open')) return;
      const a = option.getBoundingClientRect(), b = list.getBoundingClientRect();
      list.scrollTo({ top: list.scrollTop + a.top - b.top - (b.height - a.height) / 2, behavior: 'instant' });
    });
    picker.addEventListener('click', e => { if (!e.target.closest('.select-options')) revealChoice(); });
    picker.addEventListener('keydown', () => { if (!picker.matches(':open')) revealChoice(); });
    $('#compareCancel').addEventListener('click', () => close());
    $('#compareApply').addEventListener('click', () => { if (api.apply(chosen())) close(); });
    $('#compareBrowse').addEventListener('click', () => { close(false); api.browse(); });
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (!dialog.open) cleanup(); });
    new ResizeObserver(position).observe(stage);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    I18N.onChange(labels);
    return { open, close, get active() { return dialog.open; } };
  }
  return { create };
})();
