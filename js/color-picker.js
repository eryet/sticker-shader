/* Shared colour popover. Values stay opaque #rrggbb throughout the editor. */
window.StickerColorPicker = (() => {
  'use strict';
  const tr = (s, p) => I18N.t(s, p);
  const KEY = 'sticker-shader-editor:recent-colours';
  const PALETTE = ['#ffffff', '#fff4f8', '#f7c6d4', '#ff8fb8', '#f5a777', '#f6dc9a', '#bfe8de', '#9fdcbd', '#bcd9f6', '#a3cbee', '#ccb9ed', '#2b2a33'];
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const normalize = value => {
    let hex = String(value || '').trim().replace(/^#/, '');
    if (/^[\da-f]{3}$/i.test(hex)) hex = [...hex].map(c => c + c).join('');
    return /^[\da-f]{6}$/i.test(hex) ? '#' + hex.toLowerCase() : null;
  };
  const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const hexOf = rgb => '#' + rgb.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  function hsvOf(hex, previousHue = 0) {
    const [r, g, b] = rgbOf(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = previousHue;
    if (d) h = ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
    return { h, s: max ? d / max : 0, v: max };
  }
  function hexFromHSV({ h, s, v }) {
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    const channels = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return hexOf(channels.map(n => (n + m) * 255));
  }
  let recent = [];
  try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(saved)) recent = [...new Set(saved.map(normalize).filter(Boolean))].slice(0, 6); } catch (e) { /* storage is optional */ }
  let popup, active = null, hsv, current, opening, publishing = false, drag = null, sampler = null;
  let title, sv, handle, hue, hex, rgb, preview, original, palette, recentRow, recentLabel, error, eye;

  function remember(value) {
    recent = [value, ...recent.filter(c => c !== value)].slice(0, 6);
    try { localStorage.setItem(KEY, JSON.stringify(recent)); } catch (e) { /* private browsing */ }
  }
  function finish(returnFocus = false) {
    if (!active) return;
    const owner = active; active = null;
    if (current !== opening) remember(current);
    sampler?.abort(); sampler = null; drag = null;
    owner.trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus && owner.trigger.isConnected) owner.trigger.focus({ preventScroll: true });
  }
  function close(returnFocus = false) {
    if (!active) return;
    finish(returnFocus);
    if (popup.matches(':popover-open')) popup.hidePopover();
  }
  function swatches(container, colours) {
    container.replaceChildren();
    for (const colour of colours) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'colour-swatch';
      b.style.setProperty('--swatch', colour); b.dataset.colour = colour; b.title = colour.toUpperCase();
      b.setAttribute('aria-label', tr('Use colour {hex}', { hex: colour.toUpperCase() }));
      b.addEventListener('click', () => choose(colour)); container.appendChild(b);
    }
  }
  function paint() {
    sv.style.setProperty('--hue', `hsl(${hsv.h} 100% 50%)`);
    handle.style.left = hsv.s * 100 + '%'; handle.style.top = (1 - hsv.v) * 100 + '%';
    handle.style.background = current;
    sv.setAttribute('aria-valuenow', String(Math.round(hsv.v * 100)));
    sv.setAttribute('aria-valuetext', tr('{s}% saturation, {v}% brightness', { s: Math.round(hsv.s * 100), v: Math.round(hsv.v * 100) }));
    hue.value = hsv.h; hue.setAttribute('aria-valuetext', Math.round(hsv.h) + '°');
    preview.style.background = current;
    hex.value = current.toUpperCase(); hex.removeAttribute('aria-invalid'); error.hidden = true;
    rgbOf(current).forEach((v, i) => { rgb[i].value = v; rgb[i].removeAttribute('aria-invalid'); });
    for (const b of popup.querySelectorAll('.colour-swatch')) b.setAttribute('aria-pressed', String(b.dataset.colour === current));
  }
  function publish() {
    if (!active) return;
    current = hexFromHSV(hsv); paint();
    publishing = true;
    try { active.onChange(current); } finally { publishing = false; }
  }
  function choose(value) {
    const normalized = normalize(value); if (!normalized || !active) return;
    hsv = hsvOf(normalized, hsv.h); publish();
  }
  function position() {
    if (!active) return;
    const viewport = window.visualViewport, width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    popup.style.maxHeight = Math.max(100, height - 24) + 'px';
    const r = active.trigger.getBoundingClientRect(), w = popup.offsetWidth, h = popup.offsetHeight;
    if (!active.trigger.isConnected || (!popup.contains(document.activeElement) && (r.bottom < top || r.top > top + height))) { close(); return; }
    const mobile = width <= 600;
    const x = mobile ? left + (width - w) / 2 : r.left - left >= w + 24 ? r.left - w - 12 : r.right - w;
    const y = mobile ? top + height - h - 12 : r.top - 10;
    popup.style.left = clamp(x, left + 12, left + Math.max(12, width - w - 12)) + 'px';
    popup.style.top = clamp(y, top + 12, top + Math.max(12, height - h - 12)) + 'px';
    const focused = document.activeElement;
    if (popup.contains(focused) && focused.tagName === 'INPUT') {
      const field = focused.getBoundingClientRect(), panel = popup.getBoundingClientRect();
      if (field.bottom > panel.bottom - 16) popup.scrollTop += field.bottom - panel.bottom + 16;
      else if (field.top < panel.top + 16) popup.scrollTop -= panel.top + 16 - field.top;
    }
  }
  function init() {
    if (popup) return;
    popup = document.createElement('div'); popup.id = 'colourPicker'; popup.className = 'colour-picker'; popup.popover = 'auto';
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-labelledby', 'colourPickerTitle');
    popup.innerHTML = `
      <div class="colour-picker-head"><span class="colour-picker-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><h2 id="colourPickerTitle"></h2><button type="button" class="colour-close" data-label="Close colour picker">×</button></div>
      <div class="colour-sv" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" data-label="Saturation and brightness"><span class="colour-handle"></span></div>
      <div class="colour-hue-row"><span data-text="Hue"></span><input class="colour-hue" type="range" min="0" max="359" step="1" data-label="Hue"></div>
      <div class="colour-value-row"><div class="colour-comparison"><button type="button" class="colour-original" data-label="Restore opening colour"></button><span class="colour-preview" aria-hidden="true"></span></div><label class="colour-hex-label"><span>HEX</span><input class="colour-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" data-label="Hex colour" aria-describedby="colourPickerError"></label><button type="button" class="colour-eyedropper" data-label="Pick a colour from your screen"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m11 5 4 4M3 13l7-7 4 4-7 7H3v-4ZM12 4l2-2a2.1 2.1 0 0 1 3 3l-2 2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      <p class="colour-error" id="colourPickerError" role="status" hidden></p>
      <div class="colour-rgb">${['R', 'G', 'B'].map((c, i) => `<label><span>${c}</span><input type="number" min="0" max="255" step="1" inputmode="numeric" data-label="${['Red', 'Green', 'Blue'][i]}"></label>`).join('')}</div>
      <div class="colour-section-label" data-text="Studio palette"></div><div class="colour-swatches colour-palette"></div>
      <div class="colour-section-label colour-recent-label" data-text="Recently used"></div><div class="colour-swatches colour-recent"></div>
      <div class="colour-picker-foot"><span data-text="Colours update live"></span><button type="button" class="btn small primary colour-done" data-text="Done"></button></div>`;
    document.body.appendChild(popup);
    title = popup.querySelector('h2'); sv = popup.querySelector('.colour-sv'); handle = popup.querySelector('.colour-handle'); hue = popup.querySelector('.colour-hue');
    hex = popup.querySelector('.colour-hex'); rgb = [...popup.querySelectorAll('.colour-rgb input')]; preview = popup.querySelector('.colour-preview'); original = popup.querySelector('.colour-original');
    palette = popup.querySelector('.colour-palette'); recentRow = popup.querySelector('.colour-recent'); recentLabel = popup.querySelector('.colour-recent-label'); error = popup.querySelector('.colour-error'); eye = popup.querySelector('.colour-eyedropper');
    const move = e => {
      const r = sv.getBoundingClientRect(); hsv.s = clamp((e.clientX - r.left) / r.width); hsv.v = 1 - clamp((e.clientY - r.top) / r.height); publish();
    };
    sv.addEventListener('pointerdown', e => { if (e.button !== 0 || drag !== null) return; e.preventDefault(); sv.focus(); drag = e.pointerId; sv.setPointerCapture(e.pointerId); move(e); });
    sv.addEventListener('pointermove', e => { if (active && e.pointerId === drag) move(e); });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) sv.addEventListener(event, () => { drag = null; });
    sv.addEventListener('keydown', e => {
      const step = e.shiftKey ? .1 : .01;
      if (e.key === 'ArrowRight') hsv.s = clamp(hsv.s + step); else if (e.key === 'ArrowLeft') hsv.s = clamp(hsv.s - step);
      else if (e.key === 'ArrowUp') hsv.v = clamp(hsv.v + step); else if (e.key === 'ArrowDown') hsv.v = clamp(hsv.v - step); else return;
      e.preventDefault(); publish();
    });
    hue.addEventListener('input', () => { hsv.h = +hue.value; publish(); });
    const applyHex = () => {
      const value = normalize(hex.value);
      if (value) choose(value); else { hex.setAttribute('aria-invalid', 'true'); error.textContent = tr('Enter 3 or 6 hex digits, like #F7C6D4.'); error.hidden = false; }
    };
    hex.addEventListener('change', applyHex);
    hex.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } });
    rgb.forEach(input => input.addEventListener('input', () => {
      const valid = rgb.every(i => i.value !== '' && i.validity.valid);
      input.setAttribute('aria-invalid', String(input.value === '' || !input.validity.valid));
      if (valid) choose(hexOf(rgb.map(i => +i.value)));
    }));
    original.addEventListener('click', () => choose(opening));
    popup.querySelector('.colour-close').addEventListener('click', () => close(true));
    popup.querySelector('.colour-done').addEventListener('click', () => close(true));
    popup.addEventListener('keydown', e => {
      // Keep canvas shortcuts from deleting or moving a sticker while editing colour.
      if (e.key === 'Escape') { e.preventDefault(); close(true); } e.stopPropagation();
    });
    popup.addEventListener('focusout', e => { if (active && !sampler && e.relatedTarget && !popup.contains(e.relatedTarget) && e.relatedTarget !== active.trigger) close(); });
    popup.addEventListener('beforetoggle', e => { if (e.newState === 'closed') finish(); });
    eye.addEventListener('click', async () => {
      if (!active || !window.EyeDropper) return;
      const owner = active, controller = new AbortController(); sampler = controller; eye.disabled = true;
      try { const result = await new EyeDropper().open({ signal: controller.signal }); if (active === owner) choose(result.sRGBHex); }
      catch (e) { if (e.name !== 'AbortError' && active === owner) { error.textContent = tr('Screen colour picking is unavailable. Use the shade area or hex field.'); error.hidden = false; } }
      finally { if (sampler === controller) sampler = null; eye.disabled = false; if (active === owner) eye.focus(); }
    });
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    document.addEventListener('scroll', e => { if (active && !popup.contains(e.target)) position(); }, { capture: true, passive: true });
  }
  function open(options) {
    init();
    if (active?.trigger === options.trigger) { close(true); return; }
    close(); active = options; current = opening = normalize(options.value) || '#ffffff'; hsv = hsvOf(current);
    title.textContent = options.label;
    for (const el of popup.querySelectorAll('[data-text]')) el.textContent = tr(el.dataset.text);
    for (const el of popup.querySelectorAll('[data-label]')) { el.setAttribute('aria-label', tr(el.dataset.label)); el.title = tr(el.dataset.label); }
    original.style.background = opening; eye.hidden = !window.EyeDropper; eye.disabled = false;
    swatches(palette, PALETTE); swatches(recentRow, recent); recentRow.hidden = recentLabel.hidden = !recent.length;
    paint(); popup.scrollTop = 0; options.trigger.setAttribute('aria-expanded', 'true');
    popup.showPopover(); position(); sv.focus({ preventScroll: true });
  }
  function sync(trigger, value, disabled) {
    if (active?.trigger !== trigger) return;
    if (disabled || !trigger.isConnected) { close(); return; }
    const normalized = normalize(value);
    if (!publishing && normalized && normalized !== current) { current = normalized; hsv = hsvOf(current, hsv.h); paint(); }
  }
  return { open, close, sync };
})();
