/*
 * ui.js — control schema, presets and the knob panel.
 * Every control maps 1:1 to a key in the shared settings object. Controls
 * flagged `rebuild` need the cutout to be recomputed on the CPU; everything
 * else is a live shader/physics uniform.
 */
window.StickerUI = (() => {
  'use strict';

  const SCHEMA = [
    {
      id: 'cutout', title: 'Cutout', controls: [
        { key: 'workingRes', label: 'Working resolution', type: 'select', options: [['768', '768 px'], ['1024', '1024 px'], ['1536', '1536 px'], ['2048', '2048 px']], rebuild: 'image', hint: 'Longest side of the processed image. Higher is sharper and slower.' },
        { key: 'edgeRefine', label: 'Snap edges to image', type: 'toggle', rebuild: 'cutout', hint: 'Guided filter that fits the mask to real edges and recovers soft hair/fur.' },
        { key: 'refineRadius', label: 'Snap radius', type: 'range', min: 2, max: 24, step: 1, unit: 'px', rebuild: 'cutout' },
        { key: 'feather', label: 'Feather', type: 'range', min: 0, max: 10, step: 0.5, unit: 'px', rebuild: 'cutout' },
        { key: 'outlineSmooth', label: 'Outline smoothing', type: 'range', min: 0, max: 16, step: 0.5, unit: 'px', rebuild: 'cutout', hint: 'Rounds the die-cut line.' },
        { key: 'outlineOffset', label: 'Grow / shrink', type: 'range', min: -24, max: 24, step: 1, unit: 'px', rebuild: 'cutout' },
        { key: 'fillHoles', label: 'Fill holes', type: 'toggle', rebuild: 'cutout' },
        { key: 'keepLargest', label: 'Drop small fragments', type: 'toggle', rebuild: 'cutout' },
      ],
    },
    {
      id: 'border', title: 'Die-cut border', controls: [
        { key: 'borderWidth', label: 'Border width', type: 'range', min: 0, max: 48, step: 0.5, unit: 'px' },
        { key: 'borderColor', label: 'Border colour', type: 'color' },
        { key: 'borderHolo', label: 'Foil on border', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'bevel', label: 'Edge bevel', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'bevelWidth', label: 'Bevel width', type: 'range', min: 1, max: 40, step: 0.5, unit: 'px' },
      ],
    },
    {
      id: 'foil', title: 'Holographic foil', controls: [
        { key: 'holoIntensity', label: 'Intensity', type: 'range', min: 0, max: 2, step: 0.01 },
        { key: 'pattern', label: 'Texture', type: 'select', options: [['none', 'Plain foil'], ['linear', 'Rainbow bands'], ['radial', 'Radial rings'], ['prism', 'Prism diamonds'], ['crosshatch', 'Cross-hatch'], ['lens', 'Lenticular dots'], ['facets', 'Mosaic facets'], ['waves', 'Waves'], ['pinwheel', 'Pinwheel']] },
        { key: 'bandScale', label: 'Texture scale', type: 'range', min: 0.5, max: 30, step: 0.1 },
        { key: 'patternAngle', label: 'Texture angle', type: 'range', min: -180, max: 180, step: 1, unit: '°' },
        { key: 'holoSpread', label: 'Angle sensitivity', type: 'range', min: 0, max: 6, step: 0.05, hint: 'How fast the colours sweep as the sticker tilts.' },
        { key: 'hueShift', label: 'Hue offset', type: 'range', min: 0, max: 1, step: 0.005 },
        { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 1.5, step: 0.01 },
        { key: 'metallic', label: 'Metallic tint', type: 'range', min: 0, max: 1, step: 0.01, hint: 'Lets the rainbow colour the artwork itself, like a foil print.' },
        { key: 'inkFoil', label: 'Ink blocks foil', type: 'range', min: 0, max: 1, step: 0.01, hint: 'How much dark printed areas hide the foil underneath.' },
        { key: 'flake', label: 'Flake grain', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'shimmer', label: 'Shimmer drift', type: 'range', min: 0, max: 2, step: 0.01, hint: 'Slow colour drift over time.' },
      ],
    },
    {
      id: 'sparkle', title: 'Glitter', controls: [
        { key: 'glitter', label: 'Amount', type: 'range', min: 0, max: 2, step: 0.01 },
        { key: 'glitterScale', label: 'Flake size', type: 'range', min: 2, max: 24, step: 0.5, unit: 'px' },
        { key: 'glitterDensity', label: 'Density', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'glitterSharp', label: 'Sharpness', type: 'range', min: 0, max: 1, step: 0.01 },
      ],
    },
    {
      id: 'surface', title: 'Surface', controls: [
        { key: 'gloss', label: 'Gloss', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'specular', label: 'Highlight', type: 'range', min: 0, max: 2, step: 0.01 },
        { key: 'fresnel', label: 'Rim glow', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'grain', label: 'Paper grain', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'diffuse', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'inkBrightness', label: 'Ink brightness', type: 'range', min: 0.4, max: 1.6, step: 0.01 },
        { key: 'inkSaturation', label: 'Ink saturation', type: 'range', min: 0, max: 2, step: 0.01 },
      ],
    },
    {
      id: 'shadow', title: 'Shadow', controls: [
        { key: 'shadowOpacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'shadowBlur', label: 'Softness', type: 'range', min: 1, max: 40, step: 0.5, unit: 'px' },
        { key: 'shadowSpread', label: 'Spread', type: 'range', min: -12, max: 24, step: 0.5, unit: 'px' },
        { key: 'shadowLift', label: 'Lift', type: 'range', min: 0, max: 80, step: 1, unit: 'px' },
      ],
    },
    {
      id: 'motion', title: 'Motion', controls: [
        { key: 'stickerScale', label: 'Size', type: 'range', min: 0.3, max: 1.4, step: 0.01, layout: true },
        { key: 'hoverTilt', label: 'Hover tilt', type: 'range', min: 0, max: 45, step: 1, unit: '°' },
        { key: 'grabTilt', label: 'Grab lift', type: 'range', min: 0, max: 45, step: 1, unit: '°' },
        { key: 'dragLean', label: 'Drag lean', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'stiffness', label: 'Spring', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'damping', label: 'Damping', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'idleSway', label: 'Idle sway', type: 'range', min: 0, max: 15, step: 0.5, unit: '°' },
        { key: 'lightFollow', label: 'Light follows cursor', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'snapBack', label: 'Snap back to centre', type: 'toggle' },
      ],
    },
    {
      id: 'scene', title: 'Scene', controls: [
        { key: 'background', label: 'Backdrop', type: 'color', scene: true },
        { key: 'checker', label: 'Transparency grid', type: 'toggle', scene: true },
      ],
    },
  ];

  /*
   * Defaults are deliberately quiet: a printed vinyl sticker with a soft moving
   * highlight and the faintest tint shift, so the artwork stays the point.
   * Presets layer the louder foils on top.
   */
  const DEFAULTS = {
    workingRes: '1024', edgeRefine: true, refineRadius: 8, feather: 0.5, outlineSmooth: 3, outlineOffset: 0, fillHoles: true, keepLargest: true,
    borderWidth: 14, borderColor: '#ffffff', borderHolo: 0.12, bevel: 0.25, bevelWidth: 8,
    holoIntensity: 0.16, pattern: 'linear', bandScale: 1.2, patternAngle: 35, holoSpread: 1.4, hueShift: 0, saturation: 0.3, metallic: 0.03, inkFoil: 0.7, flake: 0.1, shimmer: 0,
    glitter: 0, glitterScale: 4.5, glitterDensity: 0.25, glitterSharp: 0.55,
    gloss: 0.65, specular: 0.32, fresnel: 0.06, grain: 0.05, diffuse: 0.25, inkBrightness: 1, inkSaturation: 1,
    shadowOpacity: 0.4, shadowBlur: 14, shadowSpread: 2, shadowLift: 22,
    stickerScale: 0.9, hoverTilt: 18, grabTilt: 16, dragLean: 0.6, stiffness: 0.55, damping: 0.5, idleSway: 4, lightFollow: 0.65, snapBack: false,
    background: '#1c1d22', checker: false,
  };

  /* The full holographic foil that the louder presets build on. */
  const FOIL = {
    borderHolo: 0.35, bevel: 0.45, bevelWidth: 10,
    holoIntensity: 0.75, pattern: 'linear', bandScale: 3, patternAngle: 35, holoSpread: 2.2, hueShift: 0, saturation: 1, metallic: 0.2, inkFoil: 0.6, flake: 0.35, shimmer: 0.15,
    glitter: 0.6, glitterScale: 4.5, glitterDensity: 0.3, glitterSharp: 0.55,
    gloss: 0.55, specular: 0.5, fresnel: 0.25, grain: 0.12, diffuse: 0.35,
    shadowOpacity: 0.45, shadowBlur: 14, shadowSpread: 2, shadowLift: 26,
  };
  const foil = (o) => Object.assign({}, FOIL, o);

  const PRESETS = {
    'Minimal': {},
    'Soft gloss': { holoIntensity: 0.28, saturation: 0.45, holoSpread: 1.8, specular: 0.5, gloss: 0.7, fresnel: 0.12, borderHolo: 0.2, bevel: 0.35, flake: 0.05 },
    'Holographic': foil({}),
    'Prism foil': foil({ pattern: 'prism', bandScale: 9, holoIntensity: 1.1, holoSpread: 3, metallic: 0.35, glitter: 0.3, gloss: 0.7, borderHolo: 0.6, flake: 0.2 }),
    'Glitter bomb': foil({ pattern: 'facets', bandScale: 90, holoIntensity: 0.55, holoSpread: 1.4, glitter: 1.6, glitterScale: 3.5, glitterDensity: 0.7, glitterSharp: 0.4, metallic: 0.2, flake: 0.6, borderHolo: 0.8, inkFoil: 0.4 }),
    'Chrome': foil({ pattern: 'none', holoIntensity: 0.5, saturation: 0.12, metallic: 0.55, inkFoil: 0.35, gloss: 0.9, specular: 1.3, fresnel: 0.6, glitter: 0.15, flake: 0.15, inkBrightness: 0.9, inkSaturation: 0.7, borderColor: '#e9e9ee', borderHolo: 1 }),
    'Oil slick': foil({ pattern: 'waves', bandScale: 6, patternAngle: -20, holoIntensity: 1.0, holoSpread: 4, saturation: 1.2, metallic: 0.5, inkFoil: 0.35, glitter: 0, flake: 0.5, gloss: 0.8, borderColor: '#0d0d10', borderHolo: 0.9, inkBrightness: 0.9 }),
    'Pastel dream': foil({ pattern: 'radial', bandScale: 2, holoIntensity: 0.55, holoSpread: 1.2, saturation: 0.6, metallic: 0.08, glitter: 0.35, glitterScale: 7, glitterSharp: 0.3, gloss: 0.35, specular: 0.25, borderColor: '#fff6fb', borderHolo: 0.5, background: '#f3eef6' }),
    'Gold foil': foil({ pattern: 'none', holoIntensity: 0.35, hueShift: 0.12, holoSpread: 0.6, saturation: 0.55, metallic: 0.85, gloss: 0.85, specular: 1.2, glitter: 0.25, glitterScale: 3, flake: 0.7, borderColor: '#f3d36b', borderHolo: 1 }),
    'Matte vinyl': { holoIntensity: 0, glitter: 0, metallic: 0, inkFoil: 0, specular: 0.15, gloss: 0.2, fresnel: 0, grain: 0.35, flake: 0, bevel: 0.35, diffuse: 0.5, borderHolo: 0, shadowOpacity: 0.55 },
    'Lenticular': foil({ pattern: 'lens', bandScale: 14, holoIntensity: 1, holoSpread: 2.6, metallic: 0.3, glitter: 0.15, gloss: 0.6, borderHolo: 0.4 }),
    'Pinwheel': foil({ pattern: 'pinwheel', bandScale: 5, holoIntensity: 1.2, holoSpread: 1.5, metallic: 0.4, glitter: 0.4, borderHolo: 0.7 }),
  };

  const controlsByKey = {};
  SCHEMA.forEach((g) => g.controls.forEach((c) => { controlsByKey[c.key] = c; }));

  function fmt(v, c) {
    if (c.type !== 'range') return String(v);
    const digits = c.step >= 1 ? 0 : c.step >= 0.1 ? 1 : 2;
    return Number(v).toFixed(digits) + (c.unit ? (c.unit === '°' ? '°' : ' ' + c.unit) : '');
  }

  const SCENE_KEYS = SCHEMA.find((g) => g.id === 'scene').controls.map((c) => c.key);

  /*
   * Build the panel. Inputs write into whichever settings object is currently
   * bound: `bind(look, scene)` points the look controls at one sticker's
   * settings (or null when nothing is selected, which disables them) and the
   * Scene group at the global scene settings. onChange(key, value, control)
   * fires for every edit.
   */
  function buildPanel(container, onChange) {
    container.innerHTML = '';
    const inputs = {};
    const targets = { look: null, scene: null };
    const target = (c) => (c.scene ? targets.scene : targets.look);
    for (const group of SCHEMA) {
      const sec = document.createElement('section');
      sec.className = 'group';
      sec.dataset.group = group.id;
      const head = document.createElement('button');
      head.type = 'button'; head.className = 'group-head'; head.setAttribute('aria-expanded', 'true');
      head.innerHTML = `<span>${group.title}</span><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
      const body = document.createElement('div'); body.className = 'group-body';
      head.addEventListener('click', () => { const open = sec.classList.toggle('collapsed'); head.setAttribute('aria-expanded', String(!open)); });
      sec.appendChild(head); sec.appendChild(body);
      for (const c of group.controls) {
        const row = document.createElement('div'); row.className = 'control control-' + c.type;
        const id = 'ctl-' + c.key;
        const label = document.createElement('label'); label.htmlFor = id; label.textContent = c.label;
        if (c.hint) label.title = c.hint;
        row.appendChild(label);
        let input, out;
        const value = () => { const t = target(c); return t ? t[c.key] : DEFAULTS[c.key]; };
        if (c.type === 'range') {
          input = document.createElement('input'); input.type = 'range'; input.id = id;
          input.min = c.min; input.max = c.max; input.step = c.step; input.value = DEFAULTS[c.key];
          out = document.createElement('output'); out.htmlFor = id;
          const sync = () => { const t = (input.value - c.min) / (c.max - c.min); input.style.setProperty('--t', t.toFixed(4)); out.textContent = fmt(input.value, c); };
          input.addEventListener('input', () => { const t = target(c); if (!t) return; const v = parseFloat(input.value); t[c.key] = v; sync(); onChange(c.key, v, c); });
          input.addEventListener('dblclick', () => { input.value = DEFAULTS[c.key]; input.dispatchEvent(new Event('input')); });
          row.appendChild(input); row.appendChild(out);
          inputs[c.key] = { input, set: (v) => { input.value = v; sync(); } };
        } else if (c.type === 'select') {
          input = document.createElement('select'); input.id = id;
          for (const [val, text] of c.options) { const o = document.createElement('option'); o.value = val; o.textContent = text; input.appendChild(o); }
          input.addEventListener('change', () => { const t = target(c); if (!t) return; t[c.key] = input.value; onChange(c.key, input.value, c); });
          row.appendChild(input);
          inputs[c.key] = { input, set: (v) => { input.value = v; } };
        } else if (c.type === 'color') {
          const wrap = document.createElement('span'); wrap.className = 'swatch';
          input = document.createElement('input'); input.type = 'color'; input.id = id;
          out = document.createElement('code');
          const show = (v) => { input.value = v; out.textContent = v; wrap.style.setProperty('--c', v); };
          input.addEventListener('input', () => { const t = target(c); if (!t) return; t[c.key] = input.value; show(input.value); onChange(c.key, input.value, c); });
          wrap.appendChild(input); row.appendChild(wrap); row.appendChild(out);
          inputs[c.key] = { input, set: show };
        } else if (c.type === 'toggle') {
          input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.className = 'switch';
          input.addEventListener('change', () => { const t = target(c); if (!t) return; t[c.key] = input.checked; onChange(c.key, input.checked, c); });
          row.appendChild(input);
          inputs[c.key] = { input, set: (v) => { input.checked = !!v; } };
        }
        inputs[c.key].value = value;
        body.appendChild(row);
      }
      container.appendChild(sec);
    }
    const api = {
      refresh() {
        for (const key in inputs) {
          const c = controlsByKey[key], el = inputs[key];
          const t = target(c);
          el.set(t ? t[key] : DEFAULTS[key]);
          el.input.disabled = !t;
        }
      },
      bind(look, scene) {
        targets.look = look || null; targets.scene = scene || targets.scene;
        container.classList.toggle('idle', !targets.look);
        api.refresh();
      },
    };
    return api;
  }

  function applyPreset(settings, name) {
    const p = PRESETS[name];
    if (!p) return false;
    // presets only touch the look, never the cutout or motion feel
    const keep = ['workingRes', 'edgeRefine', 'refineRadius', 'feather', 'outlineSmooth', 'outlineOffset', 'fillHoles', 'keepLargest', 'stickerScale', 'hoverTilt', 'grabTilt', 'dragLean', 'stiffness', 'damping', 'idleSway', 'lightFollow', 'snapBack', 'checker'];
    for (const key in DEFAULTS) {
      if (keep.includes(key)) continue;
      settings[key] = key in p ? p[key] : DEFAULTS[key];
    }
    return true;
  }

  return { SCHEMA, DEFAULTS, PRESETS, SCENE_KEYS, buildPanel, applyPreset, controlsByKey };
})();
