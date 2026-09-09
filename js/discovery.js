/* Starter compositions and isolated, on-demand material previews. */
window.StickerDiscovery = (() => {
  'use strict';
  const STARTERS = [
    { id: 'pet', name: 'Pet portrait', description: 'A little frame for your favorite face.', sample: 0, preset: 'Sweet pink', material: 'resin', settings: { frameCaption: 'MY LITTLE JOY', frameSubtitle: 'made of love', frameDecor: 'none', anim: 'breathing', animAmount: .3 }, icons: [['paw', -.36, .35], ['heart', .36, -.35]] },
    { id: 'birthday', name: 'Birthday wishes', description: 'A cheerful card, ready for someone special.', sample: 2, preset: 'Sweet pink', material: 'paper', settings: { frameCaption: 'MAKE A WISH', frameSubtitle: 'a little birthday magic', frameColor: '#fff0bf', frameBodyPattern: 'dots', frameDecor: 'none', anim: 'float', animAmount: .3 }, icons: [['gift', -.36, .35], ['balloon', .38, -.3]] },
    { id: 'travel', name: 'Travel memory', description: 'Turn a favorite trip into a keepsake.', sample: 0, preset: 'Bon voyage', material: 'paper', settings: { frameCaption: 'GOOD TIMES', frameSubtitle: 'somewhere wonderful', anim: 'swing', animAmount: .2 }, icons: [['camera', -.36, .3], ['star', .38, -.3]] },
    { id: 'collector', name: 'Collectible card', description: 'Give your photo a rare holographic finish.', sample: 1, preset: 'Starlight rare', material: 'vinyl', finish: 'holographic', settings: { frameCaption: 'ONE OF A KIND', frameSubtitle: 'SPECIAL EDITION', anim: 'breathing', animAmount: .3 }, icons: [['star', -.38, .34], ['sparkle', .4, -.32]] },
  ];
  function settings(recipe) {
    const s = { ...StickerUI.DEFAULTS, ...StickerDecor.FRAME_PRESETS[recipe.preset], ...recipe.settings, framePreset: '', baseRotation: 0, stickerScale: .64, frameLanyard: 'none' };
    StickerUI.applyMaterial(s, recipe.material); s.materialFinish = recipe.finish || 'natural';
    s.frameCaption = I18N.t(s.frameCaption); s.frameSubtitle = I18N.t(s.frameSubtitle); return s;
  }
  function create(api) {
    const $ = s => document.querySelector(s), tr = s => I18N.t(s);
    const dialog = $('#discoveryDialog'), grid = $('#discoveryGrid'), status = $('#discoveryStatus');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let mode = '', selectedId = null, generation = 0, busy = false, raf = 0, hovered = null, previousFocus = null;
    const variants = () => StickerUI.comparisonVariants();
    const stop = () => { cancelAnimationFrame(raf); raf = 0; hovered = null; };
    function drawMaterial(button, variant, time = 0) {
      const preview = api.renderMaterial(selectedId, variant, time); if (!preview) return;
      const canvas = button.querySelector('canvas'), ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const pixels = preview.getContext('2d').getImageData(0, 0, preview.width, preview.height).data;
      let left = preview.width, top = preview.height, right = 0, bottom = 0;
      for (let y = 0; y < preview.height; y++) for (let x = 0; x < preview.width; x++) if (pixels[(y * preview.width + x) * 4 + 3] > 2) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1); }
      if (right <= left || bottom <= top) return;
      const w = right - left, h = bottom - top, fit = Math.min((canvas.width - 32) / w, (canvas.height - 32) / h);
      ctx.drawImage(preview, left, top, w, h, (canvas.width - w * fit) / 2, (canvas.height - h * fit) / 2, w * fit, h * fit);
    }
    function play(button, variant) {
      stop(); if (reduced.matches || busy) return;
      hovered = button; let last = 0; const start = performance.now();
      const tick = now => {
        if (!dialog.open || document.hidden || hovered !== button) { stop(); return; }
        if (now - last > 65) { drawMaterial(button, variant, (now - start) / 1000); last = now; }
        raf = requestAnimationFrame(tick);
      }; raf = requestAnimationFrame(tick);
    }
    function updateSelected() {
      const chosen = api.currentMaterial(selectedId);
      for (const b of grid.querySelectorAll('[data-material-preview]')) b.setAttribute('aria-pressed', String(b.dataset.materialPreview === chosen));
    }
    function tile(title, description) {
      const b = document.createElement('button'); b.className = 'discovery-tile'; b.type = 'button';
      const canvas = document.createElement('canvas'); canvas.width = 260; canvas.height = 200; canvas.setAttribute('aria-hidden', 'true');
      const label = document.createElement('strong'); label.textContent = tr(title); b.append(canvas, label);
      if (description) { const p = document.createElement('span'); p.textContent = tr(description); b.append(p); }
      grid.append(b); return b;
    }
    async function render() {
      stop(); const token = ++generation; grid.replaceChildren(); status.textContent = '';
      dialog.dataset.mode = mode;
      $('#discoveryEyebrow').textContent = tr(mode === 'starters' ? 'A little inspiration' : 'Your artwork, different textures');
      $('#discoveryTitle').textContent = tr(mode === 'starters' ? 'Start with a scene' : 'Compare materials');
      $('#discoveryDescription').textContent = tr(mode === 'starters' ? 'Pick a complete composition, then replace the sample photo. Your current artwork stays on the canvas.' : 'Choose a material to compare over your canvas before applying it.');
      $('#compareOnCanvas').hidden = mode !== 'materials';
      for (const item of mode === 'starters' ? STARTERS : variants()) {
        if (!dialog.open || token !== generation) return;
        const b = tile(item.name || item.label, item.description);
        if (mode === 'starters') {
          b.dataset.starter = item.id;
          api.drawStarter(b.querySelector('canvas'), item, settings(item));
          b.addEventListener('click', async () => {
            if (busy) return;
            busy = true; stop(); dialog.setAttribute('aria-busy', 'true');
            grid.querySelectorAll('button').forEach(el => { el.disabled = true; }); $('#closeDiscovery').disabled = true;
            status.textContent = tr('Preparing your scene…');
            let created = false;
            try { await api.createStarter(item, settings(item)); created = true; }
            catch (e) { status.textContent = I18N.t('Could not create the scene: {error}', { error: e.message }); }
            finally { busy = false; dialog.removeAttribute('aria-busy'); $('#closeDiscovery').disabled = false; grid.querySelectorAll('button').forEach(el => { el.disabled = false; }); }
            if (created) { previousFocus = null; dialog.close(); api.focusPhoto(); }
          });
        } else {
          b.dataset.materialPreview = item.id; b.setAttribute('aria-pressed', 'false'); drawMaterial(b, item);
          b.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') play(b, item); });
          b.addEventListener('focus', () => play(b, item));
          const rest = () => { if (hovered === b) stop(); drawMaterial(b, item); };
          b.addEventListener('pointerleave', rest); b.addEventListener('blur', rest);
          b.addEventListener('click', () => {
            previousFocus = null; dialog.close(); stop(); api.compare(item);
          });
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      if (mode === 'materials') updateSelected();
    }
    function open(next) {
      if (document.querySelector('dialog[open]')) return;
      if (next === 'materials') { api.compare(); return; }
      if (next === 'gallery') next = 'materials';
      selectedId = api.selectedId(); if (next === 'materials' && !api.canCompare(selectedId)) return;
      mode = next; previousFocus = document.activeElement; dialog.showModal(); render(); $('#closeDiscovery').focus();
    }
    $('#btnStarters').addEventListener('click', () => open('starters'));
    $('#compareOnCanvas').addEventListener('click', () => { previousFocus = null; dialog.close(); stop(); api.compare(); });
    $('#closeDiscovery').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => { if (dialog.open) return; ++generation; stop(); if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true }); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    reduced.addEventListener('change', stop);
    I18N.onChange(() => { if (dialog.open && !busy) render(); });
    return { open, get active() { return dialog.open; } };
  }
  return { create, STARTERS, settings };
})();
