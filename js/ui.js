/*
 * ui.js — control schema, presets and the knob panel.
 * Every control maps 1:1 to a key in the shared settings object. Controls
 * flagged `rebuild` need the cutout to be recomputed on the CPU; everything
 * else is a live shader/physics uniform.
 */
window.StickerUI = (() => {
  'use strict';

  const D = window.StickerDecor;

  /*
   * Groups with a `kind` only show for that kind of sticker: 'sticker' is a
   * photo cutout, 'frame' a portrait frame, 'icon' a decoration. Their keys
   * are "compose" keys: they live in the sticker's settings like everything
   * else but are not part of the look that new stickers inherit.
   */
  const SCHEMA = [
    {
      id: 'frame', title: 'Portrait frame', icon: 'letter', kind: 'frame', controls: [
        { key: 'framePhoto', label: 'Photo', type: 'select', options: [['', 'none — drop a sticker on the frame']], dynamic: true, hint: 'Which sticker sits in the frame. You can also drag a sticker onto the frame window.' },
        { key: 'framePreset', label: 'Style', type: 'select', options: [['', 'Custom']].concat(Object.keys(D.FRAME_PRESETS).map((k) => [k, k])), hint: 'One-click frame look. Keeps your caption and photo.' },
        { key: 'frameDesign', label: 'Design', type: 'select', options: D.DESIGN_OPTIONS, rebuild: 'compose', hint: 'The overall shape. Proportions, edge and window shape below apply to the classic card (and where a design has room for them).' },
        { key: 'stickerScale', label: 'Size', type: 'range', min: 0.1, max: 1.4, step: 0.01, layout: true, hint: 'Mouse wheel over the frame also resizes it.' },
        { key: 'baseRotation', label: 'Rotation', type: 'range', min: -45, max: 45, step: 1, unit: '°', hint: 'Shift + mouse wheel over the frame also rotates it.' },
        { key: 'anim', label: 'Animation', type: 'select', options: [['none', 'Still'], ['float', 'Float'], ['wiggle', 'Wiggle'], ['heartbeat', 'Heartbeat'], ['pulse', 'Pulse'], ['spin', 'Spin'], ['swing', 'Swing'], ['bounce', 'Bounce'], ['twinkle', 'Twinkle'], ['dance', 'Dance']] },
        { key: 'frameCaption', label: 'Caption', type: 'text', placeholder: 'write something cute', rebuild: 'compose' },
        { key: 'frameSubtitle', label: 'Small line', type: 'text', placeholder: 'a date, a place…', rebuild: 'compose' },
        { key: 'frameFont', label: 'Lettering', type: 'select', options: D.FONT_OPTIONS, rebuild: 'compose' },
        { key: 'frameCaps', label: 'All caps', type: 'toggle', rebuild: 'compose' },
        { key: 'captionColor', label: 'Caption colour', type: 'color', rebuild: 'compose' },
        { key: 'frameStyle', label: 'Proportions', type: 'select', options: D.FRAME_STYLE_OPTIONS, rebuild: 'compose' },
        { key: 'frameEdge', label: 'Edge', type: 'select', options: D.EDGE_OPTIONS, rebuild: 'compose' },
        { key: 'windowShape', label: 'Window shape', type: 'select', options: D.WINDOW_OPTIONS, rebuild: 'compose' },
        { key: 'frameDecor', label: 'Decorations', type: 'select', options: D.DECOR_OPTIONS, rebuild: 'compose', hint: 'Little stickers on the corners of the frame.' },
        { key: 'frameColor', label: 'Frame colour', type: 'color', rebuild: 'compose' },
        { key: 'frameOutline', label: 'Outline colour', type: 'color', rebuild: 'compose' },
        { key: 'frameLine', label: 'Outline width', type: 'range', min: 0, max: 24, step: 1, unit: 'px', rebuild: 'compose' },
        { key: 'frameRadius', label: 'Corner radius', type: 'range', min: 0, max: 80, step: 1, unit: 'px', rebuild: 'compose' },
        { key: 'frameBodyPattern', label: 'Frame pattern', type: 'select', options: D.PATTERN_OPTIONS, rebuild: 'compose' },
        { key: 'frameBodyPatternColor', label: 'Frame pattern colour', type: 'color', rebuild: 'compose' },
        { key: 'windowFill', label: 'Window colour', type: 'color', rebuild: 'compose' },
        { key: 'windowPattern', label: 'Window pattern', type: 'select', options: D.PATTERN_OPTIONS, rebuild: 'compose' },
        { key: 'windowPatternColor', label: 'Pattern colour', type: 'color', rebuild: 'compose' },
        { key: 'windowPatternScale', label: 'Pattern size', type: 'range', min: 0.4, max: 3, step: 0.05, rebuild: 'compose' },
        { key: 'photoZoom', label: 'Photo zoom', type: 'range', min: 0.3, max: 3, step: 0.01, rebuild: 'compose' },
        { key: 'photoX', label: 'Photo shift X', type: 'range', min: -1, max: 1, step: 0.01, rebuild: 'compose' },
        { key: 'photoY', label: 'Photo shift Y', type: 'range', min: -1, max: 1, step: 0.01, rebuild: 'compose' },
        { key: 'photoBorder', label: 'Photo border', type: 'range', min: 0, max: 40, step: 1, unit: 'px', rebuild: 'compose', hint: 'A sticker-style outline around the photo inside the window.' },
        { key: 'photoBorderColor', label: 'Photo border colour', type: 'color', rebuild: 'compose' },
        { key: 'frameTape', label: 'Washi tape', type: 'select', options: D.TAPE_OPTIONS, rebuild: 'compose' },
        { key: 'tapeColor', label: 'Tape colour', type: 'color', rebuild: 'compose' },
      ],
    },
    {
      id: 'icon', title: 'Icon', icon: 'star', kind: 'icon', controls: [
        { key: 'stickerScale', label: 'Size', type: 'range', min: 0.1, max: 1.4, step: 0.01, layout: true, hint: 'Mouse wheel over the icon also resizes it.' },
        { key: 'baseRotation', label: 'Rotation', type: 'range', min: -45, max: 45, step: 1, unit: '°', hint: 'Shift + mouse wheel over the icon also rotates it.' },
        { key: 'anim', label: 'Animation', type: 'select', options: [['none', 'Still'], ['float', 'Float'], ['wiggle', 'Wiggle'], ['heartbeat', 'Heartbeat'], ['pulse', 'Pulse'], ['spin', 'Spin'], ['swing', 'Swing'], ['bounce', 'Bounce'], ['twinkle', 'Twinkle'], ['dance', 'Dance']] },
        { key: 'animSpeed', label: 'Animation speed', type: 'range', min: 0.2, max: 3, step: 0.05 },
        { key: 'animAmount', label: 'Animation amount', type: 'range', min: 0, max: 2, step: 0.05 },
        { key: 'iconFace', label: 'Kawaii face', type: 'select', options: [['auto', 'Where it belongs'], ['on', 'On everything that can'], ['off', 'None']], rebuild: 'compose' },
        { key: 'iconBlink', label: 'Blink', type: 'toggle', rebuild: 'compose', hint: 'Faces blink now and then.' },
        { key: 'iconStick', label: 'Stick to a frame', type: 'toggle', hint: 'Icons resting on or beside a frame move with it.' },
        { key: 'iconText', label: 'Text', type: 'text', placeholder: 'ticket, tag, bubble, sign…', rebuild: 'compose' },
        { key: 'iconPalette', label: 'Palette', type: 'select', options: [['', 'Custom']].concat(Object.keys(D.ICON_PALETTES).map((k) => [k, k])) },
        { key: 'iconFill', label: 'Main colour', type: 'color', rebuild: 'compose' },
        { key: 'iconAccent', label: 'Pink accent', type: 'color', rebuild: 'compose' },
        { key: 'iconExtra', label: 'Sky blue', type: 'color', rebuild: 'compose' },
        { key: 'iconWarm', label: 'Butter yellow', type: 'color', rebuild: 'compose' },
        { key: 'iconBrown', label: 'Cinnamon', type: 'color', rebuild: 'compose' },
        { key: 'iconMint', label: 'Leaf green', type: 'color', rebuild: 'compose' },
        { key: 'iconOutline', label: 'Outline colour', type: 'color', rebuild: 'compose' },
        { key: 'iconLine', label: 'Outline weight', type: 'range', min: 0, max: 2, step: 0.05, rebuild: 'compose' },
        { key: 'iconFlip', label: 'Mirror', type: 'toggle', rebuild: 'compose' },
      ],
    },
    {
      id: 'cutout', title: 'Cutout', icon: 'sparkle', kind: 'sticker', controls: [
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
      id: 'border', title: 'Die-cut border', icon: 'cloud', controls: [
        { key: 'borderWidth', label: 'Border width', type: 'range', min: 0, max: 48, step: 0.5, unit: 'px' },
        { key: 'borderColor', label: 'Border colour', type: 'color' },
        { key: 'borderHolo', label: 'Foil on border', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'bevel', label: 'Edge bevel', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'bevelWidth', label: 'Bevel width', type: 'range', min: 1, max: 40, step: 0.5, unit: 'px' },
      ],
    },
    {
      id: 'foil', title: 'Holographic foil', icon: 'rainbow', controls: [
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
      id: 'sparkle', title: 'Glitter', icon: 'sparkles', controls: [
        { key: 'glitter', label: 'Amount', type: 'range', min: 0, max: 2, step: 0.01 },
        { key: 'glitterScale', label: 'Flake size', type: 'range', min: 2, max: 24, step: 0.5, unit: 'px' },
        { key: 'glitterDensity', label: 'Density', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'glitterSharp', label: 'Sharpness', type: 'range', min: 0, max: 1, step: 0.01 },
      ],
    },
    {
      id: 'surface', title: 'Surface', icon: 'macaron', controls: [
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
      id: 'shadow', title: 'Shadow', icon: 'moon', controls: [
        { key: 'shadowOpacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'shadowBlur', label: 'Softness', type: 'range', min: 1, max: 40, step: 0.5, unit: 'px' },
        { key: 'shadowSpread', label: 'Spread', type: 'range', min: -12, max: 24, step: 0.5, unit: 'px' },
        { key: 'shadowLift', label: 'Lift', type: 'range', min: 0, max: 80, step: 1, unit: 'px' },
      ],
    },
    {
      id: 'motion', title: 'Motion', icon: 'balloon', controls: [
        { key: 'stickerScale', label: 'Size', type: 'range', min: 0.1, max: 1.4, step: 0.01, layout: true },
        { key: 'baseRotation', label: 'Rotation', type: 'range', min: -45, max: 45, step: 1, unit: '°', hint: 'Resting tilt of the sticker on the page. Shift + mouse wheel over a sticker also rotates it.' },
        { key: 'anim', label: 'Animation', type: 'select', options: [['none', 'Still'], ['float', 'Float'], ['wiggle', 'Wiggle'], ['heartbeat', 'Heartbeat'], ['pulse', 'Pulse'], ['spin', 'Spin'], ['swing', 'Swing'], ['bounce', 'Bounce'], ['twinkle', 'Twinkle'], ['dance', 'Dance']], hint: 'A looping idle animation on top of the physics.' },
        { key: 'animSpeed', label: 'Animation speed', type: 'range', min: 0.2, max: 3, step: 0.05 },
        { key: 'animAmount', label: 'Animation amount', type: 'range', min: 0, max: 2, step: 0.05 },
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
      id: 'scene', title: 'Scene', icon: 'cloudface', controls: [
        { key: 'sceneTheme', label: 'Theme', type: 'select', options: [['', 'Custom']].concat(Object.keys(D.THEMES).map((k) => [k, k])), scene: true, hint: 'One-click backdrop colour and pattern.' },
        { key: 'background', label: 'Backdrop', type: 'color', scene: true },
        { key: 'bgPattern', label: 'Pattern', type: 'select', options: D.PATTERN_OPTIONS, scene: true },
        { key: 'bgPatternColor', label: 'Pattern colour', type: 'color', scene: true },
        { key: 'bgPatternScale', label: 'Pattern size', type: 'range', min: 0.4, max: 3, step: 0.05, scene: true },
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
    stickerScale: 0.9, baseRotation: 0, anim: 'none', animSpeed: 1, animAmount: 1, hoverTilt: 18, grabTilt: 16, dragLean: 0.6, stiffness: 0.55, damping: 0.5, idleSway: 4, lightFollow: 0.65, snapBack: false,
    background: '#a3cbee', checker: false, sceneTheme: 'Sky', bgPattern: 'grid', bgPatternColor: '#ffffff', bgPatternScale: 1.2,
    // portrait frame
    framePhoto: '', framePreset: 'Cinnamon café', frameDesign: 'classic', frameCaption: 'CUTE', frameSubtitle: '', frameFont: 'marker', frameCaps: true, captionColor: '#2b2a33',
    frameStyle: 'polaroid', frameEdge: 'straight', windowShape: 'rounded', frameDecor: 'clouds',
    frameColor: '#ffffff', frameOutline: '#2b2a33', frameLine: 10, frameRadius: 28, frameBodyPattern: 'none', frameBodyPatternColor: '#f3f3f6',
    windowFill: '#dbe8fb', windowPattern: 'dots', windowPatternColor: '#ffffff', windowPatternScale: 1,
    photoZoom: 1, photoX: 0, photoY: 0, photoBorder: 0, photoBorderColor: '#ffffff', frameTape: 'none', tapeColor: '#f7c6d4',
    // icons
    iconStick: true, iconFace: 'auto', iconBlink: true, iconText: '', iconPalette: 'Cinnamon sky',
    iconFill: '#ffffff', iconAccent: '#f7c6d4', iconExtra: '#bcd9f6', iconWarm: '#f6dc9a', iconBrown: '#dcae7c', iconMint: '#bfe8d0', iconOutline: '#2b2a33', iconLine: 1, iconFlip: false,
  };

  /*
   * The full holographic foil that the louder presets build on. Tuned on flat
   * line art as well as photos: `inkFoil` keeps dark outlines readable under
   * the foil, and flake/grain stay low so white areas do not look dusty.
   */
  const FOIL = {
    borderHolo: 0.35, bevel: 0.45, bevelWidth: 10,
    holoIntensity: 0.75, pattern: 'linear', bandScale: 2.6, patternAngle: 35, holoSpread: 2.2, hueShift: 0, saturation: 0.95, metallic: 0.18, inkFoil: 0.72, flake: 0.22, shimmer: 0.12,
    glitter: 0.5, glitterScale: 4.5, glitterDensity: 0.3, glitterSharp: 0.55,
    gloss: 0.6, specular: 0.55, fresnel: 0.22, grain: 0.07, diffuse: 0.3,
    shadowOpacity: 0.45, shadowBlur: 14, shadowSpread: 2, shadowLift: 26,
  };
  const foil = (o) => Object.assign({}, FOIL, o);

  const PRESETS = {
    // the quiet default: printed vinyl with a soft moving highlight
    'Minimal': {},
    // pearl finish: one broad pastel sweep that follows the highlight
    'Soft gloss': { holoIntensity: 0.55, pattern: 'linear', bandScale: 0.9, patternAngle: 30, holoSpread: 2.2, saturation: 0.45, metallic: 0.1, inkFoil: 0.85, flake: 0.05, shimmer: 0, glitter: 0, specular: 0.55, gloss: 0.62, fresnel: 0.14, grain: 0.03, borderHolo: 0.25, bevel: 0.35 },
    // classic rainbow bands
    'Holographic': foil({}),
    // small prism diamonds, sparkly but the artwork stays readable
    'Prism foil': foil({ pattern: 'prism', bandScale: 14, holoIntensity: 0.85, holoSpread: 2.4, saturation: 0.85, metallic: 0.22, inkFoil: 0.75, glitter: 0.3, gloss: 0.72, borderHolo: 0.6, flake: 0.15 }),
    // dense sparkle over a coarse mosaic, toned down so the face is still there
    'Glitter bomb': foil({ pattern: 'facets', bandScale: 60, holoIntensity: 0.45, holoSpread: 1.4, saturation: 0.9, metallic: 0.12, inkFoil: 0.75, glitter: 1.15, glitterScale: 4, glitterDensity: 0.45, glitterSharp: 0.55, flake: 0.3, borderHolo: 0.8, gloss: 0.5, specular: 0.45 }),
    // mirror silver: sharp sweep, near-grey rainbow, crisp ink, no dust
    'Chrome': foil({ pattern: 'none', holoIntensity: 0.6, holoSpread: 3.2, saturation: 0.08, metallic: 0.55, inkFoil: 0.9, shimmer: 0, gloss: 0.85, specular: 0.7, fresnel: 0.35, glitter: 0.08, glitterSharp: 0.8, flake: 0.06, grain: 0.02, diffuse: 0.45, inkBrightness: 0.96, inkSaturation: 0.75, borderColor: '#e9e9ee', borderHolo: 1, bevel: 0.6, bevelWidth: 12 }),
    // broad iridescent swirls on a dark border
    'Oil slick': foil({ pattern: 'waves', bandScale: 4.5, patternAngle: -20, holoIntensity: 0.85, holoSpread: 3.6, saturation: 1.05, metallic: 0.45, inkFoil: 0.72, glitter: 0, flake: 0.4, gloss: 0.8, specular: 0.7, borderColor: '#0d0d10', borderHolo: 0.9, inkBrightness: 1 }),
    // soft pink / mint / lavender tint with big lazy glitter
    'Pastel dream': foil({ pattern: 'radial', bandScale: 1.2, holoIntensity: 0.85, holoSpread: 1.3, hueShift: 0.85, saturation: 0.55, metallic: 0.28, inkFoil: 0.8, shimmer: 0.2, glitter: 0.4, glitterScale: 7, glitterDensity: 0.25, glitterSharp: 0.3, gloss: 0.5, specular: 0.45, fresnel: 0.15, flake: 0.12, grain: 0.04, borderColor: '#fff6fb', borderHolo: 0.5 }),
    // warm gold that stays gold as it tilts (tiny angle sensitivity, no drift)
    'Gold foil': foil({ pattern: 'none', holoIntensity: 0.45, hueShift: 0.165, holoSpread: 0.18, saturation: 0.68, metallic: 0.82, inkFoil: 0.65, shimmer: 0, gloss: 0.85, specular: 0.7, fresnel: 0.2, glitter: 0.22, glitterScale: 3, glitterSharp: 0.7, flake: 0.5, grain: 0.05, inkBrightness: 1.02, borderColor: '#f3d36b', borderHolo: 1, bevel: 0.55 }),
    // flat print, a little paper texture
    'Matte vinyl': { holoIntensity: 0, glitter: 0, metallic: 0, inkFoil: 0, specular: 0.14, gloss: 0.2, fresnel: 0, grain: 0.22, flake: 0, bevel: 0.35, diffuse: 0.5, borderHolo: 0, shadowOpacity: 0.55 },
    // paper sticker: soft, warm, light shadow
    'Paper cute': { holoIntensity: 0.05, saturation: 0.3, metallic: 0, glitter: 0, inkFoil: 0.9, specular: 0.14, gloss: 0.3, fresnel: 0, grain: 0.18, flake: 0, bevel: 0.18, bevelWidth: 6, diffuse: 0.3, borderHolo: 0, shadowOpacity: 0.3, shadowBlur: 10, shadowSpread: 1, shadowLift: 14 },
    // wet candy shell with a pink / blue tint
    'Candy gloss': { holoIntensity: 0.34, pattern: 'radial', bandScale: 1.6, holoSpread: 1.2, hueShift: 0.88, saturation: 0.7, metallic: 0.12, inkFoil: 0.8, flake: 0.05, gloss: 0.85, specular: 0.6, fresnel: 0.14, borderHolo: 0.3, bevel: 0.4, bevelWidth: 9, glitter: 0.2, glitterScale: 6, glitterSharp: 0.3, shadowOpacity: 0.35, shadowLift: 20 },
    // lenticular dots, softer and less busy
    'Lenticular': foil({ pattern: 'lens', bandScale: 10, holoIntensity: 0.6, holoSpread: 2.6, saturation: 0.72, metallic: 0.18, inkFoil: 0.75, glitter: 0.12, gloss: 0.62, borderHolo: 0.4, flake: 0.1 }),
    // smaller pinwheels, calmer colours
    'Pinwheel': foil({ pattern: 'pinwheel', bandScale: 8, holoIntensity: 0.8, holoSpread: 1.6, saturation: 0.9, metallic: 0.24, inkFoil: 0.75, glitter: 0.3, borderHolo: 0.7, flake: 0.12 }),
  };

  const controlsByKey = {};
  SCHEMA.forEach((g) => g.controls.forEach((c) => { controlsByKey[c.key] = c; }));

  function fmt(v, c) {
    if (c.type !== 'range') return String(v);
    const digits = c.step >= 1 ? 0 : c.step >= 0.1 ? 1 : 2;
    return Number(v).toFixed(digits) + (c.unit ? (c.unit === '°' ? '°' : ' ' + c.unit) : '');
  }

  const SCENE_KEYS = SCHEMA.find((g) => g.id === 'scene').controls.map((c) => c.key);
  // keys that only exist in the frame / icon groups (a key shared with a general group, like Size, is part of the look)
  const GENERAL_KEYS = new Set(SCHEMA.filter((g) => !g.kind).flatMap((g) => g.controls.map((c) => c.key)));
  const COMPOSE_KEYS = [...new Set(SCHEMA.filter((g) => g.kind && g.kind !== 'sticker').flatMap((g) => g.controls.map((c) => c.key)).filter((k) => !GENERAL_KEYS.has(k)))];
  const CUTOUT_KEYS = SCHEMA.find((g) => g.id === 'cutout').controls.map((c) => c.key);
  const MOTION_KEYS = SCHEMA.find((g) => g.id === 'motion').controls.map((c) => c.key);

  /*
   * Build the panel. Inputs write into whichever settings object is currently
   * bound: `bind(look, scene)` points the look controls at one sticker's
   * settings (or null when nothing is selected, which disables them) and the
   * Scene group at the global scene settings. onChange(key, value, control)
   * fires for every edit.
   */
  function buildPanel(container, onChange) {
    container.innerHTML = '';
    const inputs = {};   // key → [binding]; a key may appear in several groups (e.g. Size in Motion and in Icon)
    const targets = { look: null, scene: null };
    const target = (c) => (c.scene ? targets.scene : targets.look);
    const bindingsOf = (key) => inputs[key] || [];
    /* keep every other control bound to the same key in step */
    const syncOthers = (key, me, v) => { for (const b of bindingsOf(key)) if (b !== me) b.set(v); };
    for (const group of SCHEMA) {
      const sec = document.createElement('section');
      sec.className = 'group';
      sec.dataset.group = group.id;
      const head = document.createElement('button');
      head.type = 'button'; head.className = 'group-head'; head.setAttribute('aria-expanded', 'true');
      head.innerHTML = `<span>${group.title}</span><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      if (group.icon && D && D.thumbnail) head.prepend(D.thumbnail(group.icon, 24));
      const body = document.createElement('div'); body.className = 'group-body';
      head.addEventListener('click', () => { const open = sec.classList.toggle('collapsed'); head.setAttribute('aria-expanded', String(!open)); });
      sec.appendChild(head); sec.appendChild(body);
      for (const c of group.controls) {
        const row = document.createElement('div'); row.className = 'control control-' + c.type;
        // the copy in a kind-specific group gets a suffixed id; the general one keeps ctl-<key>
        const shared = group.kind && SCHEMA.some((g) => !g.kind && g.controls.some((x) => x.key === c.key));
        const id = 'ctl-' + c.key + (shared ? '-' + group.id : '');
        const label = document.createElement('label'); label.htmlFor = id; label.textContent = c.label;
        if (c.hint) label.title = c.hint;
        row.appendChild(label);
        let input, out;
        const b = { control: c, input: null, set: null };
        if (c.type === 'range') {
          input = document.createElement('input'); input.type = 'range'; input.id = id;
          input.min = c.min; input.max = c.max; input.step = c.step; input.value = DEFAULTS[c.key];
          out = document.createElement('output'); out.htmlFor = id;
          const sync = () => { const t = (input.value - c.min) / (c.max - c.min); input.style.setProperty('--t', t.toFixed(4)); out.textContent = fmt(input.value, c); };
          input.addEventListener('input', () => { const t = target(c); if (!t) return; const v = parseFloat(input.value); t[c.key] = v; sync(); syncOthers(c.key, b, v); onChange(c.key, v, c); });
          input.addEventListener('dblclick', () => { input.value = DEFAULTS[c.key]; input.dispatchEvent(new Event('input')); });
          const field = document.createElement('span'); field.className = 'field';
          field.appendChild(input); field.appendChild(out); row.appendChild(field);
          b.set = (v) => { input.value = v; sync(); };
        } else if (c.type === 'select') {
          input = document.createElement('select'); input.id = id;
          for (const [val, text] of c.options) { const o = document.createElement('option'); o.value = val; o.textContent = text; input.appendChild(o); }
          input.addEventListener('change', () => { const t = target(c); if (!t) return; t[c.key] = input.value; syncOthers(c.key, b, input.value); onChange(c.key, input.value, c); });
          row.appendChild(input);
          b.set = (v) => { input.value = v; };
        } else if (c.type === 'color') {
          const wrap = document.createElement('span'); wrap.className = 'field colour';
          const chip = document.createElement('span'); chip.className = 'chip';
          input = document.createElement('input'); input.type = 'color'; input.id = id;
          out = document.createElement('code');
          const show = (v) => { input.value = v; out.textContent = v; chip.style.setProperty('--c', v); };
          input.addEventListener('input', () => { const t = target(c); if (!t) return; t[c.key] = input.value; show(input.value); syncOthers(c.key, b, input.value); onChange(c.key, input.value, c); });
          wrap.appendChild(chip); wrap.appendChild(out); wrap.appendChild(input); row.appendChild(wrap);
          b.set = show;
        } else if (c.type === 'toggle') {
          input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.className = 'switch';
          input.addEventListener('change', () => { const t = target(c); if (!t) return; t[c.key] = input.checked; syncOthers(c.key, b, input.checked); onChange(c.key, input.checked, c); });
          row.appendChild(input);
          b.set = (v) => { input.checked = !!v; };
        } else if (c.type === 'text') {
          input = document.createElement('input'); input.type = 'text'; input.id = id; input.autocomplete = 'off'; input.spellcheck = false;
          if (c.placeholder) input.placeholder = c.placeholder;
          input.addEventListener('input', () => { const t = target(c); if (!t) return; t[c.key] = input.value; syncOthers(c.key, b, input.value); onChange(c.key, input.value, c); });
          row.appendChild(input);
          b.set = (v) => { const s = v == null ? '' : String(v); if (input.value !== s) input.value = s; };
        }
        b.input = input;
        (inputs[c.key] = inputs[c.key] || []).push(b);
        body.appendChild(row);
      }
      container.appendChild(sec);
    }
    const groups = [...container.querySelectorAll('.group')];
    const api = {
      refresh() {
        for (const key in inputs) {
          for (const b of inputs[key]) {
            const t = target(b.control);
            b.set(t ? t[key] : DEFAULTS[key]);
            b.input.disabled = !t;
          }
        }
      },
      /* kind: 'sticker' | 'frame' | 'icon' | null — shows the groups that apply */
      bind(look, scene, kind) {
        targets.look = look || null; targets.scene = scene || targets.scene;
        container.classList.toggle('idle', !targets.look);
        const k = kind || 'sticker';
        container.dataset.kind = k;
        for (const sec of groups) { const g = SCHEMA.find((x) => x.id === sec.dataset.group); sec.hidden = !!(g.kind && g.kind !== k); }
        api.refresh();
      },
      /* replace the options of a dynamic select, keeping the bound value */
      setOptions(key, options) {
        for (const b of bindingsOf(key)) {
          if (b.input.tagName !== 'SELECT') continue;
          b.input.innerHTML = '';
          for (const [val, text] of options) { const o = document.createElement('option'); o.value = val; o.textContent = text; b.input.appendChild(o); }
          const t = target(b.control);
          b.set(t ? t[key] : DEFAULTS[key]);
        }
      },
    };
    return api;
  }

  function applyPreset(settings, name) {
    const p = PRESETS[name];
    if (!p) return false;
    // presets only touch the look, never the cutout, motion feel, scene or frame/icon composition
    const keep = new Set([...CUTOUT_KEYS, ...MOTION_KEYS, ...SCENE_KEYS, ...COMPOSE_KEYS]);
    for (const key in DEFAULTS) {
      if (keep.has(key)) continue;
      settings[key] = key in p ? p[key] : DEFAULTS[key];
    }
    return true;
  }

  return { SCHEMA, DEFAULTS, PRESETS, SCENE_KEYS, COMPOSE_KEYS, CUTOUT_KEYS, MOTION_KEYS, buildPanel, applyPreset, controlsByKey };
})();
