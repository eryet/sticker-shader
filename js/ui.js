/*
 * ui.js — control schema, presets and the knob panel.
 * Every control maps 1:1 to a key in the shared settings object. Controls
 * flagged `rebuild` need the cutout to be recomputed on the CPU; everything
 * else is a live shader/physics uniform.
 */
window.StickerUI = (() => {
  'use strict';

  const D = window.StickerDecor;
  const tr = (s, p) => window.I18N.t(s, p);
  const ANIMATIONS = StickerScene.ANIMATION_OPTIONS;
  const BORDER_PALETTES = {
    candy: { label: 'Candy', borderStyle: 'linear', borderColor: '#ff8fbd', borderColor2: '#d5b2ff', borderColor3: '#8bdcff', borderAngle: 25 },
    ice: { label: 'Ice', borderStyle: 'linear', borderColor: '#287bff', borderColor2: '#73e4ff', borderColor3: '#e5ffff', borderAngle: 135 },
    sunset: { label: 'Sunset', borderStyle: 'linear', borderColor: '#ff9a48', borderColor2: '#ff5f9e', borderColor3: '#9764ff', borderAngle: 35 },
    aurora: { label: 'Aurora', borderStyle: 'conic', borderColor: '#69f5c6', borderColor2: '#56b8ff', borderColor3: '#b28bff', borderAngle: 0 },
    neon: { label: 'Neon RGB', borderStyle: 'conic', borderColor: '#00e5ff', borderColor2: '#ff39d4', borderColor3: '#c3ff36', borderAngle: 0 },
    rainbow: { label: 'Rainbow', borderStyle: 'rainbow', borderColor: '#ff8fbd', borderColor2: '#d5b2ff', borderColor3: '#8bdcff', borderAngle: 0 },
  };
  const BORDER_COLOUR_KEYS = ['borderStyle', 'borderPalette', 'borderColor', 'borderColor2', 'borderColor3', 'borderAngle'];

  /*
   * Groups with a `kind` only show for that kind of sticker: 'sticker' is a
   * photo cutout, 'frame' a portrait frame, 'icon' a decoration. Their keys
   * are "compose" keys: they live in the sticker's settings like everything
   * else but are not part of the look that new stickers inherit.
   */
  const MATERIALS = {
    vinyl: { label: 'Printed vinyl', depth: .3, texture: .2, opacity: 1, artwork: 1, tint: '#ffffff' },
    glass: { label: 'Clear glass', depth: .65, texture: .1, opacity: .18, artwork: .65, tint: '#bfe7f5' },
    frosted: { label: 'Frosted glass', depth: .4, texture: .65, opacity: .58, artwork: .8, tint: '#e4edf4' },
    acrylic: { label: 'Acrylic charm', depth: .85, texture: .15, opacity: .25, artwork: 1, tint: '#d6efff' },
    resin: { label: 'Domed resin', depth: .8, texture: .1, opacity: 1, artwork: 1, tint: '#ffffff' },
    puffy: { label: 'Puffy vinyl', depth: .9, texture: .25, opacity: 1, artwork: 1, tint: '#ffffff' },
    embroidery: { label: 'Embroidered patch', depth: .55, texture: .8, opacity: 1, artwork: 1, tint: '#f4e9d6' },
    metal: { label: 'Brushed metal', depth: .4, texture: .7, opacity: 1, artwork: .78, tint: '#c6ced9' },
    paper: { label: 'Textured paper', depth: .15, texture: .65, opacity: 1, artwork: 1, tint: '#fff2d9' },
    iridescent: { label: 'Iridescent film', depth: .2, texture: .55, opacity: .42, artwork: .82, tint: '#dbd5ff' },
    jelly: { label: 'Candy jelly', depth: .85, texture: .45, opacity: .48, artwork: .78, tint: '#ff9ec7' },
    ceramic: { label: 'Glazed ceramic', depth: .65, texture: .5, opacity: 1, artwork: .92, tint: '#fff2df' },
    velvet: { label: 'Velvet', depth: .4, texture: .7, opacity: 1, artwork: .86, tint: '#ab85c4' },
    carbon: { label: 'Carbon fiber', depth: .4, texture: .8, opacity: 1, artwork: .7, tint: '#647082' },
  };
  const MATERIAL_KEYS = ['material', 'materialDepth', 'materialTexture', 'materialScale', 'materialOpacity', 'artworkOpacity', 'materialTint'];
  function applyMaterial(settings, name) {
    const m = MATERIALS[name]; if (!m) return false;
    Object.assign(settings, { material: name, materialDepth: m.depth, materialTexture: m.texture, materialScale: 1, materialOpacity: m.opacity, artworkOpacity: m.artwork, materialTint: m.tint });
    return true;
  }
  const SCHEMA = [
    {
      id: 'material', title: 'Material', icon: 'macaron', controls: [
        { key: 'material', label: 'Material', type: 'select', options: Object.entries(MATERIALS).map(([id, m]) => [id, m.label]), hint: 'Change the surface of this sticker. Your original image stays editable.' },
        { key: 'materialFinish', label: 'Finish', type: 'select', options: [['natural', 'Natural'], ['matte', 'Matte'], ['gloss', 'Gloss'], ['holographic', 'Holographic'], ['pearl', 'Pearlescent'], ['glitter', 'Glitter'], ['custom', 'Custom / preset']], hint: 'Layer a finish over any material. Custom uses the foil and surface controls below.' },
        { key: 'materialDepth', label: 'Raised depth', type: 'range', min: 0, max: 1, step: .01, materials: ['glass', 'frosted', 'acrylic', 'resin', 'puffy', 'embroidery', 'metal', 'iridescent', 'jelly', 'ceramic', 'velvet', 'carbon'] },
        { key: 'materialTexture', label: 'Texture strength', type: 'range', min: 0, max: 1, step: .01, materials: ['frosted', 'embroidery', 'metal', 'paper', 'puffy', 'iridescent', 'jelly', 'ceramic', 'velvet', 'carbon'] },
        { key: 'materialScale', label: 'Texture size', type: 'range', min: .5, max: 3, step: .05, materials: ['frosted', 'embroidery', 'metal', 'paper', 'puffy', 'iridescent', 'jelly', 'ceramic', 'velvet', 'carbon'] },
        { key: 'materialTint', label: 'Material tint', type: 'color', materials: ['glass', 'frosted', 'acrylic', 'metal', 'paper', 'embroidery', 'iridescent', 'jelly', 'ceramic', 'velvet', 'carbon'] },
        { key: 'materialOpacity', label: 'Base opacity', type: 'range', min: 0, max: 1, step: .01, materials: ['glass', 'frosted', 'acrylic', 'iridescent', 'jelly'], hint: 'Opacity of the material beneath the artwork. Frosting adds a milky texture; it does not blur the scene behind it.' },
        { key: 'artworkOpacity', label: 'Artwork opacity', type: 'range', min: 0, max: 1, step: .01, materials: Object.keys(MATERIALS).filter(k => k !== 'vinyl'), hint: 'Fade the printed image independently of its material.' },
      ],
    },
    {
      id: 'pass', title: 'Conference pass', icon: 'ticket', kind: 'frame', designs: ['conference'], controls: [
        { key: 'passEvent', label: 'Event name', type: 'text', rebuild: 'compose' },
        { key: 'passName', label: 'Attendee name', type: 'text', rebuild: 'compose' },
        { key: 'passOrganization', label: 'Organization', type: 'text', rebuild: 'compose' },
        { key: 'passRole', label: 'Pass type / role', type: 'text', rebuild: 'compose', placeholder: 'Attendee, speaker, VIP…' },
        { key: 'passDate', label: 'Date / location', type: 'text', rebuild: 'compose' },
      ],
    },
    {
      id: 'lanyard', title: 'Lanyard', icon: 'tag', kind: 'frame', controls: [
        { key: 'frameLanyard', label: 'Lanyard style', type: 'select', options: [['none', 'None'], ['solid', 'Plain ribbon'], ['striped', 'Center stripe']], rebuild: 'compose', hint: 'Add a lanyard to this frame. It moves and exports with the pass, including imported artwork.' },
        { key: 'frameLanyardColor', label: 'Lanyard colour', type: 'color', rebuild: 'compose', lanyardDetail: true },
        { key: 'frameLanyardText', label: 'Lanyard text', type: 'text', rebuild: 'compose', lanyardDetail: true, placeholder: 'Event or sponsor name' },
        { key: 'frameLanyardTextColor', label: 'Print / stripe colour', type: 'color', rebuild: 'compose', lanyardDetail: true },
        { key: 'frameLanyardLength', label: 'Lanyard length', type: 'range', min: .25, max: 1.25, step: .05, rebuild: 'compose', lanyardDetail: true },
      ],
    },
    {
      id: 'frame', title: 'Portrait frame', icon: 'letter', kind: 'frame', controls: [
        { key: 'framePhoto', label: 'Photo', type: 'select', options: [['', 'none — drop a sticker on the frame']], dynamic: true, hint: 'Which sticker sits in the frame. You can also drag a sticker onto the frame window.' },
        { key: 'framePreset', label: 'Style', type: 'select', options: [['', 'Custom']].concat(Object.keys(D.FRAME_PRESETS).map((k) => [k, k])), hint: 'One-click frame look. Keeps your caption and photo.' },
        { key: 'framePreset', label: 'Discover frames', type: 'frame-gallery' },
        { key: 'frameDesign', label: 'Design', type: 'select', options: D.DESIGN_OPTIONS, rebuild: 'compose', hint: 'The overall shape. Proportions, edge and window shape below apply to the classic card (and where a design has room for them).' },
        { key: 'stickerScale', label: 'Size', type: 'range', min: 0.1, max: 1.4, step: 0.01, layout: true, hint: 'Mouse wheel over the frame also resizes it.' },
        { key: 'baseRotation', label: 'Rotation', type: 'range', min: -360, max: 360, step: 1, unit: '°', hint: 'Shift + mouse wheel over the frame also rotates it.' },
        { key: 'anim', label: 'Animation', type: 'select', options: ANIMATIONS, discrete: true },
        { key: 'animSpeed', label: 'Animation speed', type: 'range', min: 0.2, max: 3, step: 0.05 },
        { key: 'animAmount', label: 'Animation amount', type: 'range', min: 0, max: 2, step: 0.05 },
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
        { key: 'frameOpening', label: 'Photo opening', type: 'select', options: [['auto', 'Transparent opening'], ['rectangle', 'Adjustable rectangle']], rebuild: 'compose', importedOnly: true, hint: 'Uses the largest enclosed transparent area. Choose a rectangle to create or reposition the opening.' },
        { key: 'frameOpeningX', label: 'Opening left', type: 'range', min: 0, max: 99, step: 1, unit: '%', rebuild: 'compose', importedOnly: true },
        { key: 'frameOpeningY', label: 'Opening top', type: 'range', min: 0, max: 99, step: 1, unit: '%', rebuild: 'compose', importedOnly: true },
        { key: 'frameOpeningW', label: 'Opening width', type: 'range', min: 1, max: 100, step: 1, unit: '%', rebuild: 'compose', importedOnly: true },
        { key: 'frameOpeningH', label: 'Opening height', type: 'range', min: 1, max: 100, step: 1, unit: '%', rebuild: 'compose', importedOnly: true },
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
        { key: 'baseRotation', label: 'Rotation', type: 'range', min: -360, max: 360, step: 1, unit: '°', hint: 'Shift + mouse wheel over the icon also rotates it.' },
        { key: 'anim', label: 'Animation', type: 'select', options: ANIMATIONS, discrete: true },
        { key: 'animSpeed', label: 'Animation speed', type: 'range', min: 0.2, max: 3, step: 0.05 },
        { key: 'animAmount', label: 'Animation amount', type: 'range', min: 0, max: 2, step: 0.05 },
        { key: 'iconFace', label: 'Kawaii face', type: 'select', options: [['auto', 'Where it belongs'], ['on', 'On everything that can'], ['off', 'None']], rebuild: 'compose' },
        { key: 'iconBlink', label: 'Blink', type: 'toggle', rebuild: 'compose', hint: 'Faces blink now and then.' },
        { key: 'iconStick', label: 'Stick to sticker or frame', type: 'toggle', hint: 'Drop an icon on a photo sticker or frame to move them together. Drag it away to detach.' },
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
      id: 'lighting', title: 'Lighting', icon: 'sparkle', controls: [
        { key: 'lightStrength', label: 'Shine strength', type: 'range', min: 0, max: 100, step: 1, unit: '%', hint: 'Controls foil, glitter and reflections together. Lower it for a softer finish; 0% removes shine without darkening the artwork.' },
        { key: 'softHighlights', label: 'Gentle highlights', type: 'toggle', hint: 'Softens bright peaks and protects printed details when reflections overlap.' },
        { key: 'lightFollow', label: 'Light follows cursor', type: 'range', min: 0, max: 1, step: 0.01, hint: 'Lower this to keep the light steadier as you move the cursor.' },
      ],
    },
    {
      id: 'border', title: 'Die-cut border', icon: 'cloud', controls: [
        { key: 'borderWidth', label: 'Border width', type: 'range', min: 0, max: 48, step: 0.5, unit: 'px' },
        { key: 'borderStyle', label: 'Colour style', type: 'select', options: [['solid', 'Solid'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient'], ['conic', 'Conic gradient'], ['rainbow', 'Rainbow RGB']] },
        { key: 'borderPalette', label: 'Colour sets', type: 'palette' },
        { key: 'borderColor', label: 'Border colour', type: 'color' },
        { key: 'borderColor2', label: 'Middle colour', type: 'color', borderStyles: ['linear', 'radial', 'conic'] },
        { key: 'borderColor3', label: 'End colour', type: 'color', borderStyles: ['linear', 'radial', 'conic'] },
        { key: 'borderAngle', label: 'Colour angle', type: 'range', min: 0, max: 360, step: 1, unit: '°', borderStyles: ['linear', 'conic', 'rainbow'] },
        { key: 'borderHolo', label: 'Foil on border', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'bevel', label: 'Edge bevel', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'bevelWidth', label: 'Bevel width', type: 'range', min: 1, max: 40, step: 0.5, unit: 'px' },
      ],
    },
    {
      id: 'foil', title: 'Holographic foil', icon: 'rainbow', controls: [
        { key: 'holoIntensity', label: 'Intensity', type: 'range', min: 0, max: 2, step: 0.01 },
        { key: 'pattern', label: 'Texture', type: 'select', options: [['none', 'Plain foil'], ['linear', 'Rainbow bands'], ['radial', 'Radial rings'], ['prism', 'Prism diamonds'], ['crosshatch', 'Cross-hatch'], ['lens', 'Lenticular dots'], ['facets', 'Mosaic facets'], ['waves', 'Waves'], ['pinwheel', 'Pinwheel'], ['shards', 'Prismatic shards'], ['aurora', 'Aurora ribbons'], ['ice', 'Cracked ice'], ['stars', 'Star confetti'], ['diffraction', 'Diffraction rings']] },
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
        { key: 'baseRotation', label: 'Rotation', type: 'range', min: -360, max: 360, step: 1, unit: '°', hint: 'Resting tilt of the sticker on the page. Shift + mouse wheel over a sticker also rotates it.' },
        { key: 'anim', label: 'Animation', type: 'select', options: ANIMATIONS, discrete: true, hint: 'A looping idle animation on top of the physics.' },
        { key: 'animSpeed', label: 'Animation speed', type: 'range', min: 0.2, max: 3, step: 0.05 },
        { key: 'animAmount', label: 'Animation amount', type: 'range', min: 0, max: 2, step: 0.05 },
        { key: 'hoverTilt', label: 'Hover tilt', type: 'range', min: 0, max: 45, step: 1, unit: '°' },
        { key: 'grabTilt', label: 'Grab lift', type: 'range', min: 0, max: 45, step: 1, unit: '°' },
        { key: 'dragLean', label: 'Drag lean', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'stiffness', label: 'Spring', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'damping', label: 'Damping', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'idleSway', label: 'Idle sway', type: 'range', min: 0, max: 15, step: 0.5, unit: '°' },
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
    material: 'vinyl', materialFinish: 'natural', materialDepth: .3, materialTexture: .2, materialScale: 1, materialOpacity: 1, artworkOpacity: 1, materialTint: '#ffffff',
    workingRes: '1024', edgeRefine: true, refineRadius: 8, feather: 0.5, outlineSmooth: 3, outlineOffset: 0, fillHoles: true, keepLargest: true,
    borderWidth: 14, borderColor: '#ffffff', borderHolo: 0.12, bevel: 0.25, bevelWidth: 8,
    borderStyle: 'solid', borderPalette: '', borderColor2: '#ffb7d5', borderColor3: '#8bdcff', borderAngle: 0,
    holoIntensity: 0.16, pattern: 'linear', bandScale: 1.2, patternAngle: 35, holoSpread: 1.4, hueShift: 0, saturation: 0.3, metallic: 0.03, inkFoil: 0.7, flake: 0.1, shimmer: 0,
    glitter: 0, glitterScale: 4.5, glitterDensity: 0.25, glitterSharp: 0.55,
    lightStrength: 65, softHighlights: true,
    gloss: 0.65, specular: 0.32, fresnel: 0.06, grain: 0.05, diffuse: 0.25, inkBrightness: 1, inkSaturation: 1,
    shadowOpacity: 0.4, shadowBlur: 14, shadowSpread: 2, shadowLift: 22,
    stickerScale: 0.9, baseRotation: 0, flipX: false, anim: 'none', animSpeed: 1, animAmount: 1, hoverTilt: 18, grabTilt: 16, dragLean: 0.6, stiffness: 0.55, damping: 0.5, idleSway: 4, lightFollow: 0.65, snapBack: false,
    background: '#a3cbee', checker: false, sceneTheme: 'Sky', bgPattern: 'grid', bgPatternColor: '#ffffff', bgPatternScale: 1.2,
    // portrait frame
    framePhoto: '', framePreset: 'Cinnamon café', frameDesign: 'classic', frameCaption: 'CUTE', frameSubtitle: '', frameFont: 'marker', frameCaps: true, captionColor: '#2b2a33',
    frameOpening: 'auto', frameOpeningX: 15, frameOpeningY: 15, frameOpeningW: 70, frameOpeningH: 65,
    passEvent: 'CREATIVE SUMMIT', passName: 'YOUR NAME', passOrganization: 'DESIGN · BUILD · CONNECT', passRole: 'ATTENDEE', passDate: '2026',
    frameLanyard: 'none', frameLanyardColor: '#7655d5', frameLanyardText: '', frameLanyardTextColor: '#ffffff', frameLanyardLength: .65,
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
  // Foil choices layer over the current substrate without changing its tint,
  // opacity, border, shadows, cutout, or the user's lighting comfort settings.
  const creativeFoil = o => ({ holoIntensity: 1, holoSpread: 2.2, hueShift: 0, saturation: .95, metallic: .22, inkFoil: .8, flake: .05, shimmer: .08, glitter: 0, gloss: .7, specular: .5, fresnel: .16, ...o });
  const FOIL_LOOKS = {
    shards: { label: 'Prismatic shards', settings: creativeFoil({ pattern: 'shards', bandScale: 9, patternAngle: 20, holoIntensity: 1.15, holoSpread: 2.5 }) },
    aurora: { label: 'Aurora ribbons', settings: creativeFoil({ pattern: 'aurora', bandScale: 3.8, patternAngle: -20, saturation: .72, hueShift: .15, shimmer: .12, metallic: .16 }) },
    ice: { label: 'Cracked ice', settings: creativeFoil({ pattern: 'ice', bandScale: 9, patternAngle: 0, saturation: .6, hueShift: .5, holoIntensity: 1.2, holoSpread: 2.8 }) },
    stars: { label: 'Star confetti', settings: creativeFoil({ pattern: 'stars', bandScale: 8, patternAngle: 15, holoIntensity: 1.2, saturation: .85, hueShift: .88, metallic: .12 }) },
    diffraction: { label: 'Diffraction rings', settings: creativeFoil({ pattern: 'diffraction', bandScale: 12, patternAngle: 25, holoSpread: 3, holoIntensity: .95, metallic: .3 }) },
  };
  function comparisonVariants() {
    return [...Object.entries(MATERIALS).map(([id, m]) => ({ id, material: id, label: m.label })),
      { id: 'holographic', material: 'vinyl', finish: 'holographic', label: 'Holographic' },
      ...Object.entries(FOIL_LOOKS).map(([id, f]) => ({ id: 'foil-' + id, foil: id, label: f.label, description: 'Foil finish · keeps your material' }))];
  }
  function applyComparison(settings, variant) {
    if (!variant) return false;
    if (variant.foil) { const look = FOIL_LOOKS[variant.foil]; if (!look) return false; Object.assign(settings, look.settings, { materialFinish: 'custom' }); return true; }
    if (!applyMaterial(settings, variant.material)) return false;
    if (variant.finish) settings.materialFinish = variant.finish;
    return true;
  }
  function comparisonId(settings) {
    if (settings.materialFinish === 'custom' && FOIL_LOOKS[settings.pattern]) return 'foil-' + settings.pattern;
    return settings.material === 'vinyl' && settings.materialFinish === 'holographic' ? 'holographic' : settings.material;
  }

  const PRESETS = {
    // the quiet default: printed vinyl with a soft moving highlight
    'Minimal': {},
    // pearl finish: one broad pastel sweep that follows the highlight
    'Soft gloss': { holoIntensity: 0.55, pattern: 'linear', bandScale: 0.9, patternAngle: 30, holoSpread: 2.2, saturation: 0.45, metallic: 0.1, inkFoil: 0.85, flake: 0.05, shimmer: 0, glitter: 0, specular: 0.55, gloss: 0.62, fresnel: 0.14, grain: 0.03, borderHolo: 0.25, bevel: 0.35 },
    // classic rainbow bands
    'Holographic': foil({}),
    ...Object.fromEntries(Object.values(FOIL_LOOKS).map(f => [f.label, f.settings])),
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
  SCHEMA.forEach((g) => g.controls.forEach((c) => { if (c.type !== 'frame-gallery') controlsByKey[c.key] = c; }));

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
  const MOTION_KEYS = [...SCHEMA.find((g) => g.id === 'motion').controls.map((c) => c.key), 'lightFollow'];

  // Let the browser mirror the selected option into a truncatable label.
  // The select still owns focus, keyboard navigation, options, and change events.
  function enhanceSelect(input) {
    if (!CSS.supports('appearance', 'base-select') || input.querySelector('button')) return;
    const button = document.createElement('button'); button.type = 'button';
    button.appendChild(document.createElement('selectedcontent'));
    const options = document.createElement('div'); options.className = 'select-options';
    options.append(...input.children);
    input.append(button, options);
  }

  /* A full-turn dial and exact degree field share one settings value. */
  function buildRotationControl(c, id, label, getTarget, onValue) {
    const card = document.createElement('div'); card.className = 'rotation-control';
    const turnIcon = '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 6a6 6 0 1 1-1 7M5 2v4h4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    card.innerHTML = `<div class="rotation-head"><button type="button" class="rotation-reset">${turnIcon}<span>${tr('Reset')}</span></button></div>
      <div class="rotation-body"><button type="button" class="rotation-dial" role="slider" aria-label="${tr('Rotation dial')}" aria-valuemin="${c.min}" aria-valuemax="${c.max}" aria-describedby="${id}-hint">
        <svg viewBox="0 0 88 88" aria-hidden="true"><circle class="rotation-disc" cx="44" cy="44" r="32"/>${Array.from({ length: 24 }, (_, i) => `<path class="rotation-tick${i % 6 === 0 ? ' major' : ''}" d="M44 3v${i % 6 === 0 ? 6 : 3}" transform="rotate(${i * 15} 44 44)"/>`).join('')}<g class="rotation-needle"><path d="M44 44V22"/><circle cx="44" cy="21" r="4"/></g><circle class="rotation-pivot" cx="44" cy="44" r="4"/></svg>
      </button><div class="rotation-values"><div class="rotation-stepper"><button type="button" data-nudge="-1" aria-label="${tr('Rotate counterclockwise 1°')}">−</button><label class="rotation-degree"><input id="${id}" type="number" min="${c.min}" max="${c.max}" step="1" inputmode="decimal" aria-label="${tr('Rotation in degrees')}"><span aria-hidden="true">°</span></label><button type="button" data-nudge="1" aria-label="${tr('Rotate clockwise 1°')}">+</button></div>
      <div class="rotation-turns"><button type="button" data-turn="-90" aria-label="${tr('Rotate counterclockwise 90°')}">${turnIcon}<span>90°</span></button><button type="button" data-turn="90" aria-label="${tr('Rotate clockwise 90°')}">${turnIcon}<span>90°</span></button></div></div></div>
      <p class="rotation-hint" id="${id}-hint"><span class="rotation-pointer-hint">${tr('Drag dial · Shift snaps to 15°')}</span><span class="rotation-touch-hint">${tr('Drag dial · Use ± for 1° steps')}</span></p>`;
    card.querySelector('.rotation-head').prepend(label);
    const input = card.querySelector('input'), dial = card.querySelector('.rotation-dial'), needle = card.querySelector('.rotation-needle');
    for (const button of card.querySelectorAll('[aria-label]')) button.title = button.getAttribute('aria-label');
    card.querySelector('.rotation-reset').setAttribute('aria-label', tr('Reset rotation to 0°'));
    let value = 0, drag = null, numberEdited = false;
    function stop() {
      const id = drag?.id; drag = null; card.classList.remove('dragging');
      if (id != null && dial.hasPointerCapture(id)) dial.releasePointerCapture(id);
    }
    function set(next) {
      if (drag && drag.owner !== getTarget()) stop();
      value = Number.isFinite(+next) ? +next : 0; input.value = value; input.removeAttribute('aria-invalid');
      input.style.setProperty('--degree-width', Math.max(2, String(value).length) + 'ch');
      needle.setAttribute('transform', `rotate(${value} 44 44)`);
      dial.setAttribute('aria-valuenow', value); dial.setAttribute('aria-valuetext', value + '°');
    }
    function apply(next, discrete = false) {
      if (!getTarget()) return;
      const v = StickerScene.wrapRotation(Math.round(next)), changed = v !== value;
      set(v); if (changed) onValue(v, discrete);
    }
    input.addEventListener('focus', () => { numberEdited = false; });
    input.addEventListener('input', () => {
      if (input.value !== '' && input.validity.valid) { apply(input.valueAsNumber, !numberEdited); numberEdited = true; }
      else input.setAttribute('aria-invalid', 'true');
    });
    const finishNumber = () => {
      if (!getTarget()) return;
      if (Number.isFinite(input.valueAsNumber)) apply(Math.max(c.min, Math.min(c.max, input.valueAsNumber)), !numberEdited);
      else set(value);
    };
    input.addEventListener('change', finishNumber); input.addEventListener('blur', finishNumber);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finishNumber(); input.select(); }
      if (e.key === 'Escape') { e.preventDefault(); set(value); input.blur(); }
    });
    const angleAt = e => { const r = dial.getBoundingClientRect(); return Math.atan2(e.clientX - r.left - r.width / 2, -(e.clientY - r.top - r.height / 2)) * 180 / Math.PI; };
    const difference = (a, b) => { const d = (a - b) * Math.PI / 180; return Math.atan2(Math.sin(d), Math.cos(d)) * 180 / Math.PI; };
    dial.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !getTarget() || drag) return;
      e.preventDefault(); dial.focus();
      const r = dial.getBoundingClientRect();
      if (Math.hypot(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2) < 8) return;
      const a = angleAt(e), angle = value + difference(a, value);
      drag = { id: e.pointerId, owner: getTarget(), last: a, angle, start: value };
      dial.setPointerCapture(e.pointerId); card.classList.add('dragging');
      apply(e.shiftKey ? Math.round(angle / 15) * 15 : angle, true);
    });
    dial.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      if (drag.owner !== getTarget()) { stop(); return; }
      const a = angleAt(e); drag.angle += difference(a, drag.last); drag.last = a;
      apply(e.shiftKey ? Math.round(drag.angle / 15) * 15 : drag.angle);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) dial.addEventListener(event, e => { if (e.pointerId === drag?.id) stop(); });
    dial.addEventListener('dblclick', () => apply(0, true));
    dial.addEventListener('keydown', e => {
      const step = e.shiftKey ? 15 : 1;
      const changes = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 90, PageDown: -90 };
      if (e.key in changes) apply(value + changes[e.key], true);
      else if (e.key === 'Home') apply(0, true); else if (e.key === 'End') apply(360, true);
      else if (e.key === 'Escape' && drag) { const start = drag.start; stop(); apply(start); }
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    for (const b of card.querySelectorAll('[data-nudge], [data-turn]')) b.addEventListener('click', () => apply(value + +(b.dataset.nudge || b.dataset.turn), true));
    card.querySelector('.rotation-reset').addEventListener('click', () => apply(0, true));
    return { element: card, input, set, setDisabled(disabled) {
      if (disabled) stop(); card.classList.toggle('disabled', disabled);
      for (const el of card.querySelectorAll('button, input')) el.disabled = disabled;
    } };
  }

  /*
   * Build the panel. Inputs write into whichever settings object is currently
   * bound: `bind(look, scene)` points the look controls at one sticker's
   * settings (or null when nothing is selected, which disables them) and the
   * Scene group at the global scene settings. onChange(key, value, control)
   * fires for every edit.
   */
  // Dedicated UI glyphs: clear at small sizes, independent of artwork thumbnails.
  function sectionIcon(id) {
    const shapes = {
      material: '<path fill="#bce4ee" d="m5 19 11-5 11 5-11 6z"/><path fill="#d7c9f4" d="m5 14 11-5 11 5-11 6z"/><path fill="#ffd2e2" d="m5 9 11-5 11 5-11 6z"/><path class="icon-accent" stroke="white" d="m11 9 5-2 4 2"/>',
      cutout: '<path fill="#cceaf2" stroke-dasharray="2 3" d="M17 5h8v20H9v-8"/><g class="icon-accent"><g class="scissor-blade"><circle fill="#ffd1df" cx="8" cy="21" r="3"/><path d="M10 19 23 6"/></g><g class="scissor-blade"><circle fill="#ffd1df" cx="8" cy="11" r="3"/><path d="m10 13 13 10"/></g><circle cx="14" cy="16" r="1" fill="#514352" stroke="none"/></g>',
      lighting: '<g class="icon-accent" stroke="#c79943"><path d="M16 3v3m0 20v3M3 16h3m20 0h3M7 7l2 2m14 14 2 2M7 25l2-2M23 9l2-2"/></g><circle fill="#ffe3a1" cx="16" cy="16" r="7"/><path stroke="white" d="M12 14q1-3 4-3"/>',
      border: '<path fill="#bde3ee" d="M10 5h12l5 5v12l-5 5H10l-5-5V10z"/><rect x="10" y="10" width="12" height="12" rx="4" fill="#fff8fc"/><path class="icon-accent" stroke="white" d="M8 12V9l3-1"/>',
      foil: '<path fill="#d9c7f5" d="M8 5h17v17l-5 5H8z"/><path stroke="none" fill="#b7e6ed" d="M9 6h7l-7 15z"/><path stroke="none" fill="#ffd0df" d="m16 6 8 0-9 20H9z"/><path fill="#fff7cf" d="M20 27v-7h5"/><path class="icon-accent" stroke="white" d="M20 8v6m-3-3h6"/>',
      sparkle: '<path fill="#ffe2a1" d="m13 7 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><g class="icon-accent"><path fill="#e3cff8" d="m24 3 1.5 4.5L30 9l-4.5 1.5L24 15l-1.5-4.5L18 9l4.5-1.5z"/><circle stroke="none" fill="#e7a6c3" cx="25" cy="24" r="2"/></g>',
      surface: '<rect fill="#f6cddd" x="5" y="6" width="22" height="21" rx="7"/><path fill="#e7d8f7" d="M5 19q5-7 11-1t11-1v3q0 7-7 7h-8q-7 0-7-7z"/><path class="icon-accent" stroke="white" stroke-width="2.3" d="M10 13q0-3 4-3m4 0h2"/><path stroke="#ad8eac" stroke-dasharray=".5 3" d="M10 23h12"/>',
      shadow: '<ellipse fill="#d1c4e3" stroke="none" cx="19" cy="25" rx="11" ry="4"/><rect fill="#fff4d3" x="5" y="5" width="18" height="17" rx="5" transform="rotate(-10 14 14)"/><path class="icon-accent" stroke="white" d="m9 10 7-1"/>',
      motion: '<path stroke="#b49acb" d="M3 14h5m-6 5h5m-2 5h6"/><g class="icon-accent"><path fill="#ffcbdc" d="M25 5q5 3 2 10l-5 9-10-4 3-10q3-7 10-5z"/><path fill="#d4e9f6" d="m12 20-3 6 7-4"/><circle fill="#fff9f2" cx="22" cy="11" r="3"/><path stroke="#d2a147" d="m17 25-2 4"/></g>',
      scene: '<rect fill="#c9e7f5" x="4" y="6" width="24" height="21" rx="5"/><circle class="icon-accent" fill="#ffe5a7" cx="21" cy="12" r="3"/><path fill="#c6decf" d="m4 23 7-10 8 11 4-6 5 5v1q0 3-5 3H9q-5 0-5-4z"/>',
      frame: '<rect fill="#ffd0df" x="5" y="4" width="22" height="25" rx="4"/><rect fill="#cae5f0" x="9" y="8" width="14" height="14" rx="2"/><path fill="#c9dfcf" d="m9 20 5-6 4 5 3-3 2 4v2H9z"/><path class="icon-accent" stroke="white" d="M13 25h6"/>',
      icon: '<path fill="#ffe2a1" d="m16 3 4 8 9 2-6 6 1 10-8-5-8 5 1-10-6-6 9-2z"/><g class="icon-accent"><path d="M12 15v1m8-1v1m-6 3q2 2 4 0"/><path stroke="#e4a6ba" d="M9 19h1m12 0h1"/></g>',
      pass: '<path fill="#dacbf2" d="m12 3 4 8 4-8"/><rect fill="#ffe4ed" x="6" y="10" width="20" height="19" rx="4"/><path d="M13 13h6"/><circle fill="#b8ddea" cx="12" cy="20" r="3"/><path class="icon-accent" d="M18 19h4m-4 4h3"/>',
      lanyard: '<path fill="#d6c6f1" d="M11 3 6 6l7 16h6L26 6l-5-3-5 13z"/><path class="icon-accent" stroke="white" d="m10 7 5 12m7-12-4 10"/><rect fill="#ffe1a8" x="13" y="22" width="6" height="7" rx="2"/>',
    };
    const holder = document.createElement('div');
    holder.innerHTML = `<svg class="section-icon" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#594c60" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><g class="section-icon-body">${shapes[id] || shapes.icon}</g></svg>`;
    return holder.firstElementChild;
  }

  const sectionMotionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  sectionMotionPreference.addEventListener('change', e => {
    if (e.matches) document.querySelectorAll('.section-icon').forEach(icon => icon.getAnimations({ subtree: true }).forEach(a => a.cancel()));
  });
  function playSectionMotion(icon, id) {
    if (sectionMotionPreference.matches) return;
    const body = icon.firstElementChild, parts = [...body.children], all = [icon, body, ...body.querySelectorAll('*')];
    const current = new Map(all.map(el => [el, getComputedStyle(el).transform]));
    icon.getAnimations({ subtree: true }).forEach(a => a.cancel());
    const ease = 'cubic-bezier(.22,1,.36,1)';
    const move = (el, poses, delay = 0, duration = 1000) => {
      if (!el) return;
      const rest = getComputedStyle(el).transform;
      el.animate([
        { transform: current.get(el), offset: 0, easing: ease },
        ...poses.map(([offset, transform]) => ({ offset, transform, easing: ease })),
        { transform: rest, offset: 1 },
      ], { duration, delay, fill: 'backwards' });
    };
    const effect = (el, frames, delay = 0) => el?.animate(frames, { duration: 1000, delay, easing: 'ease-in-out' });
    const pulse = (el, delay = 0) => move(el, [[.28, 'scale(1.25)'], [.6, 'scale(.9)'], [.82, 'scale(1.04)']], delay);
    // Individual components do the storytelling; the shared lift keeps the set cohesive.
    move(icon, [[.2, 'translateY(-1.5px) scale(1.08)'], [.72, 'scale(1.03)']]);
    switch (id) {
      case 'material':
        move(parts[0], [[.3, 'translateY(4px) rotate(5deg)'], [.62, 'translateY(4px) rotate(5deg)'], [.84, 'translateY(-.5px)']]);
        pulse(parts[1], 40);
        for (const p of [parts[2], parts[3]]) move(p, [[.3, 'translateY(-3px) rotate(-7deg)'], [.62, 'translateY(-3px) rotate(-7deg)'], [.84, 'translateY(.5px)']], 70);
        break;
      case 'cutout':
        body.querySelectorAll('.scissor-blade').forEach((p, i) => move(p, [[.2, `rotate(${i ? -16 : 16}deg)`], [.35, 'rotate(0deg)'], [.52, `rotate(${i ? -16 : 16}deg)`], [.68, 'rotate(0deg)']]));
        effect(parts[0], [{ strokeDashoffset: 0 }, { strokeDashoffset: -15 }]);
        break;
      case 'lighting':
        move(parts[0], [[.4, 'rotate(75deg) scale(1.07)'], [.75, 'rotate(-12deg)']]); pulse(parts[1], 50);
        effect(parts[1], [{ fill: '#ffe3a1' }, { fill: '#ffbd59', offset: .45 }, { fill: '#ffe3a1' }]);
        break;
      case 'border':
        pulse(parts[0]); move(parts[1], [[.35, 'scale(.75)'], [.7, 'scale(1.06)']], 50);
        effect(parts[0], [{ strokeDasharray: '5 0', strokeDashoffset: 0 }, { strokeDasharray: '5 3', strokeDashoffset: -20, offset: .55 }, { strokeDasharray: '5 0', strokeDashoffset: -30 }]);
        break;
      case 'foil':
        move(body, [[.3, 'rotate(-12deg) scale(1.08)'], [.68, 'rotate(9deg)']]);
        effect(parts[2], [{ fill: '#ffd0df' }, { fill: '#a7eaf0', offset: .3 }, { fill: '#ffe3a1', offset: .65 }, { fill: '#ffd0df' }]);
        move(parts[4], [[.3, 'translate(-4px,3px) scale(1.4)'], [.68, 'translate(1px,-1px) scale(.8)']], 70);
        break;
      case 'sparkle':
        move(parts[0], [[.25, 'scale(.7) rotate(-15deg)'], [.55, 'scale(1.22) rotate(12deg)'], [.82, 'scale(.98)']]);
        pulse(parts[1].children[0], 140); move(parts[1].children[1], [[.4, 'translate(2px,-4px) scale(1.7)'], [.75, 'translateY(1px)']], 180);
        break;
      case 'surface':
        move(body, [[.28, 'scale(1.12,.88)'], [.58, 'scale(.94,1.08)'], [.82, 'scale(1.02,.98)']]);
        move(parts[2], [[.35, 'translate(5px,1px)'], [.7, 'translate(-1px,0)']], 60);
        effect(parts[0], [{ fill: '#f6cddd' }, { fill: '#efd5fb', offset: .5 }, { fill: '#f6cddd' }]);
        break;
      case 'shadow':
        move(parts[1], [[.3, 'translateY(-5px) rotate(7deg)'], [.62, 'translateY(-5px) rotate(7deg)'], [.83, 'translateY(1px) rotate(-12deg)']]);
        move(parts[2], [[.3, 'translateY(-5px)'], [.62, 'translateY(-5px)']]);
        move(parts[0], [[.35, 'translate(2px,1px) scale(1.2,.75)'], [.68, 'translate(2px,1px) scale(1.2,.75)']]);
        effect(parts[0], [{ opacity: 1 }, { opacity: .4, offset: .4 }, { opacity: 1 }]);
        break;
      case 'motion':
        move(parts[1], [[.15, 'translate(-2px,2px) rotate(-8deg)'], [.48, 'translate(4px,-5px) rotate(9deg)'], [.78, 'translate(-.5px,.5px)']]);
        effect(parts[0], [{ opacity: 1, strokeDasharray: '5 0' }, { opacity: .3, strokeDasharray: '2 3', strokeDashoffset: -12, offset: .5 }, { opacity: 1, strokeDasharray: '5 0' }]);
        break;
      case 'scene':
        move(parts[1], [[.2, 'translate(-6px,6px) scale(.7)'], [.55, 'translate(-3px,-2px) scale(1.15)'], [.8, 'translate(1px,0)']]);
        move(parts[2], [[.4, 'scale(1.05,.86)'], [.75, 'scale(1,1.03)']]);
        effect(parts[0], [{ fill: '#c9e7f5' }, { fill: '#efd7f3', offset: .3 }, { fill: '#ffe5c3', offset: .6 }, { fill: '#c9e7f5' }]);
        break;
      case 'frame':
        move(body, [[.25, 'rotate(-12deg)'], [.56, 'rotate(9deg)'], [.8, 'rotate(-2deg)']]);
        effect(parts[1], [{ fill: '#cae5f0' }, { fill: '#ffffff', offset: .4 }, { fill: '#cae5f0' }]);
        move(parts[3], [[.4, 'scaleX(1.5)'], [.7, 'scaleX(.8)']], 70);
        break;
      case 'icon':
        move(body, [[.25, 'rotate(-16deg) scale(.9)'], [.52, 'rotate(15deg) scale(1.12)'], [.8, 'rotate(-3deg)']]);
        move(parts[1], [[.35, 'scaleY(.12)'], [.45, 'scaleY(1)'], [.6, 'translateY(-1px)']], 50);
        break;
      case 'pass':
        move(body, [[.25, 'rotate(-14deg)'], [.52, 'rotate(10deg)'], [.78, 'rotate(-3deg)']]); pulse(parts[3], 120);
        effect(parts[4], [{ strokeDasharray: '12 0' }, { strokeDasharray: '2 10', strokeDashoffset: -12, offset: .4 }, { strokeDasharray: '12 0' }]);
        break;
      case 'lanyard':
        move(body, [[.22, 'rotate(16deg)'], [.5, 'rotate(-12deg)'], [.76, 'rotate(4deg)']]);
        move(parts[2], [[.27, 'rotate(-25deg) translateY(1px)'], [.56, 'rotate(18deg)'], [.8, 'rotate(-5deg)']], 70);
        break;
    }
  }

  function buildPanel(container, onChange) {
    StickerColorPicker.close();
    container.innerHTML = '';
    const inputs = {};   // key → [binding]; a key may appear in several groups (e.g. Size in Motion and in Icon)
    const targets = { look: null, scene: null, imageMode: 'cutout' };
    const target = (c) => (c.scene ? targets.scene : targets.imageMode !== 'cutout' && c.rebuild === 'cutout' ? null : targets.look);
    const bindingsOf = (key) => inputs[key] || [];
    /* keep every other control bound to the same key in step */
    const syncOthers = (key, me, v) => { for (const b of bindingsOf(key)) if (b !== me) b.set(v); };
    for (const group of SCHEMA) {
      const sec = document.createElement('section');
      sec.className = 'group';
      sec.dataset.group = group.id;
      const head = document.createElement('button');
      head.type = 'button'; head.className = 'group-head'; head.setAttribute('aria-expanded', 'true');
      head.innerHTML = `<span>${tr(group.title)}</span><svg class="group-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const icon = sectionIcon(group.id); head.prepend(icon);
      const body = document.createElement('div'); body.className = 'group-body';
      const play = () => playSectionMotion(icon, group.id);
      head.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') { head.dataset.iconActive = ''; play(); } });
      head.addEventListener('pointerleave', () => { delete head.dataset.iconActive; });
      head.addEventListener('focus', () => { if (head.matches(':focus-visible')) play(); });
      head.addEventListener('click', () => {
        const collapsed = sec.classList.toggle('collapsed'); head.setAttribute('aria-expanded', String(!collapsed));
        play();
      });
      sec.appendChild(head); sec.appendChild(body);
      if (group.id === 'cutout') {
        const note = document.createElement('p'); note.className = 'whole-image-note';
        note.textContent = tr('Your full image is kept. Remove the background or use Edit cutout to enable edge cleanup.');
        body.appendChild(note);
      }
      for (const c of group.controls) {
        const row = document.createElement('div'); row.className = 'control control-' + c.type;
        if (c.rebuild) row.dataset.rebuild = c.rebuild;
        // the copy in a kind-specific group gets a suffixed id; the general one keeps ctl-<key>
        const shared = group.kind && SCHEMA.some((g) => !g.kind && g.controls.some((x) => x.key === c.key));
        const id = 'ctl-' + c.key + (c.type === 'frame-gallery' ? '-gallery' : shared ? '-' + group.id : '');
        const label = document.createElement('label'); label.htmlFor = id; label.textContent = tr(c.label);
        if (c.hint) label.title = tr(c.hint);
        row.appendChild(label);
        let input, out;
        const b = { control: c, group: group.id, input: null, set: null, row, label };
        if (c.type === 'range' && c.key === 'baseRotation') {
          row.className = 'control control-rotation';
          const rotation = buildRotationControl(c, id, label, () => target(c), (v, discrete) => {
            const t = target(c); if (!t) return;
            t[c.key] = v; syncOthers(c.key, b, v); onChange(c.key, v, discrete ? { ...c, discrete: true } : c);
          });
          input = rotation.input; b.set = rotation.set; b.setDisabled = rotation.setDisabled;
          row.replaceChildren(rotation.element);
        } else if (c.type === 'range') {
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
          for (const [val, text] of c.options) { const o = document.createElement('option'); o.value = val; o.textContent = tr(text); input.appendChild(o); }
          enhanceSelect(input);
          input.addEventListener('change', () => { const t = target(c); if (!t) return; t[c.key] = input.value; syncOthers(c.key, b, input.value); onChange(c.key, input.value, c); });
          row.appendChild(input);
          b.set = (v) => { input.value = v; };
        } else if (c.type === 'frame-gallery') {
          input = document.createElement('input'); input.type = 'hidden'; input.id = id;
          const details = document.createElement('details'); details.className = 'frame-collection'; details.open = true;
          const summary = document.createElement('summary'); summary.textContent = tr(c.label); summary.id = id + '-label';
          const grid = document.createElement('div'); grid.className = 'frame-gallery'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-labelledby', summary.id);
          for (const [name, title] of D.FRAME_COLLECTION) {
            const button = document.createElement('button'); button.type = 'button'; button.dataset.framePreset = name;
            button.title = tr(name); button.setAttribute('aria-pressed', 'false');
            const preview = D.frameThumbnail(name); preview.setAttribute('aria-hidden', 'true');
            const caption = document.createElement('span'); caption.textContent = tr(title); button.append(preview, caption);
            button.addEventListener('click', () => { const t = target(c); if (!t) return; t[c.key] = name; syncOthers(c.key, b, name); onChange(c.key, name, c); });
            grid.appendChild(button);
          }
          details.append(summary, grid); row.replaceChildren(details, input);
          b.set = value => { input.value = value || ''; for (const button of grid.children) button.setAttribute('aria-pressed', String(button.dataset.framePreset === value)); };
          b.setDisabled = disabled => { for (const button of grid.children) button.disabled = disabled; };
        } else if (c.type === 'palette') {
          input = document.createElement('input'); input.type = 'hidden'; input.id = id;
          label.removeAttribute('for'); label.id = id + '-label';
          const grid = document.createElement('div'); grid.className = 'border-palettes'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-labelledby', label.id);
          for (const [key, p] of Object.entries(BORDER_PALETTES)) {
            const button = document.createElement('button'); button.type = 'button'; button.dataset.borderPalette = key; button.setAttribute('aria-pressed', 'false');
            const swatch = document.createElement('span'); swatch.className = 'border-palette-swatch'; swatch.setAttribute('aria-hidden', 'true');
            swatch.style.background = p.borderStyle === 'rainbow' ? 'linear-gradient(90deg,#ff4050,#ffe34d,#61ec65,#55c7ff,#bd65ff,#ff4050)'
              : `linear-gradient(90deg,${p.borderColor},${p.borderColor2},${p.borderColor3})`;
            const name = document.createElement('span'); name.textContent = tr(p.label); button.append(swatch, name);
            button.addEventListener('click', () => { if (!target(c)) return; input.value = key; input.dispatchEvent(new Event('change')); }); grid.appendChild(button);
          }
          input.addEventListener('change', () => { const t = target(c); if (!t) return; t[c.key] = input.value; onChange(c.key, input.value, c); });
          row.append(grid, input);
          b.set = value => { input.value = value || ''; for (const button of grid.children) button.setAttribute('aria-pressed', String(button.dataset.borderPalette === value)); };
          b.setDisabled = disabled => { for (const button of grid.children) button.disabled = disabled; };
        } else if (c.type === 'color') {
          const wrap = document.createElement('button'); wrap.type = 'button'; wrap.className = 'field colour'; wrap.id = id + '-picker';
          label.htmlFor = wrap.id; wrap.setAttribute('aria-haspopup', 'dialog'); wrap.setAttribute('aria-expanded', 'false'); wrap.setAttribute('aria-controls', 'colourPicker');
          wrap.setAttribute('aria-label', tr(c.label));
          const chip = document.createElement('span'); chip.className = 'chip';
          input = document.createElement('input'); input.type = 'color'; input.id = id; input.hidden = true;
          out = document.createElement('code');
          const show = (v) => { input.value = v; out.textContent = v; chip.style.setProperty('--c', v); wrap.setAttribute('aria-label', label.textContent); StickerColorPicker.sync(wrap, v, !target(c)); };
          input.addEventListener('input', () => { const t = target(c); if (!t) return; t[c.key] = input.value; show(input.value); syncOthers(c.key, b, input.value); onChange(c.key, input.value, c); });
          wrap.addEventListener('click', () => {
            if (!target(c)) return;
            if (!HTMLElement.prototype.showPopover) { input.click(); return; }
            StickerColorPicker.open({ trigger: wrap, label: label.textContent, value: input.value, onChange: value => { if (!target(c)) return; input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); } });
          });
          const dots = document.createElement('span'); dots.className = 'colour-trigger-dots'; dots.textContent = '···'; dots.setAttribute('aria-hidden', 'true');
          wrap.append(chip, out, dots); row.append(wrap, input);
          b.setDisabled = disabled => { wrap.disabled = disabled; StickerColorPicker.sync(wrap, input.value, disabled); };
          b.set = show;
        } else if (c.type === 'toggle') {
          input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.className = 'switch';
          input.addEventListener('change', () => { const t = target(c); if (!t) return; t[c.key] = input.checked; syncOthers(c.key, b, input.checked); onChange(c.key, input.checked, c); });
          row.appendChild(input);
          b.set = (v) => { input.checked = !!v; };
        } else if (c.type === 'text') {
          input = document.createElement('input'); input.type = 'text'; input.id = id; input.autocomplete = 'off'; input.spellcheck = false;
          if (c.placeholder) input.placeholder = tr(c.placeholder);
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
        for (const sec of groups) {
          const g = SCHEMA.find(g => g.id === sec.dataset.group);
          sec.hidden = !!(g.kind && g.kind !== (targets.kind || 'sticker')) || !!(g.designs && (targets.artwork || !g.designs.includes(targets.look?.frameDesign)));
        }
        for (const key in inputs) {
          for (const b of inputs[key]) {
            const t = target(b.control);
            const style = targets.look?.borderStyle || 'solid';
            const customFrameControls = /^(framePhoto|frameOpening.*|stickerScale|baseRotation|anim.*|photo.*|windowFill|windowPattern.*)$/;
            const customIconControls = /^(stickerScale|baseRotation|anim.*|iconStick|iconFlip|iconLine|iconOutline)$/;
            const customHidden = targets.artwork && ((b.control.importedOnly && key !== 'frameOpening' && targets.look?.frameOpening === 'auto') ||
              (targets.kind === 'frame' && b.group === 'frame' && !customFrameControls.test(key)) ||
              (targets.kind === 'icon' && b.group === 'icon' && !customIconControls.test(key)));
            const conference = !targets.artwork && targets.look?.frameDesign === 'conference';
            const passHidden = conference && b.group === 'frame' && /^(frameCaption|frameSubtitle|frameFont|frameCaps|frameStyle|frameEdge|windowShape|frameDecor|frameRadius|frameTape)$/.test(key);
            b.row.hidden = !!(b.control.borderStyles && !b.control.borderStyles.includes(style)) || (key === 'borderColor' && style === 'rainbow') ||
              (!!b.control.importedOnly && !targets.artwork) || customHidden || passHidden ||
              (!!b.control.lanyardDetail && (!targets.look || targets.look.frameLanyard === 'none')) ||
              (!!b.control.materials && !b.control.materials.includes(targets.look?.material || 'vinyl'));
            if (key === 'borderColor') b.label.textContent = tr(style === 'solid' ? 'Border colour' : 'Start colour');
            if (key === 'tapeColor') b.label.textContent = tr(conference ? 'Pass accent' : D.FRAME_COLLECTION.some(([name]) => D.FRAME_PRESETS[name].frameDesign === targets.look?.frameDesign) ? 'Detail colour' : b.control.label);
            if (key === 'captionColor') b.label.textContent = tr(conference ? 'Pass text colour' : b.control.label);
            b.set(t ? t[key] : DEFAULTS[key]);
            b.input.disabled = !t;
            if (b.setDisabled) b.setDisabled(!t);
          }
        }
      },
      /* kind: 'sticker' | 'frame' | 'icon' | null — shows the groups that apply */
      bind(look, scene, kind, imageMode, artwork) {
        if (targets.look !== look || (scene && targets.scene !== scene)) StickerColorPicker.close();
        targets.look = look || null; targets.scene = scene || targets.scene;
        targets.artwork = !!artwork; targets.kind = kind;
        targets.imageMode = kind === 'sticker' && ['whole', 'manual'].includes(imageMode) ? imageMode : 'cutout';
        container.classList.toggle('idle', !targets.look);
        const k = kind || 'sticker';
        container.dataset.kind = k;
        for (const sec of groups) {
          const g = SCHEMA.find((x) => x.id === sec.dataset.group); sec.hidden = !!(g.kind && g.kind !== k);
          sec.classList.toggle('whole-image', g.id === 'cutout' && targets.imageMode !== 'cutout');
          if (g.id === 'cutout') sec.querySelector('.whole-image-note').textContent = tr(targets.imageMode === 'manual'
            ? 'Your manual edges are preserved. Use brush hardness or lasso feather to soften them. Reset cutout restores the starting mask.'
            : 'Your full image is kept. Remove the background or use Edit cutout to start trimming.');
        }
        api.refresh();
      },
      /* replace the options of a dynamic select, keeping the bound value */
      setOptions(key, options) {
        for (const b of bindingsOf(key)) {
          if (b.input.tagName !== 'SELECT') continue;
          b.input.innerHTML = '';
          for (const [val, text] of options) { const o = document.createElement('option'); o.value = val; o.textContent = tr(text); b.input.appendChild(o); }
          enhanceSelect(b.input);
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
    const creative = Object.entries(FOIL_LOOKS).find(([, f]) => f.label === name);
    if (creative) return applyComparison(settings, { foil: creative[0] });
    // Keep the chosen lighting comfort level when switching material finishes.
    const keep = new Set(['flipX', 'lightStrength', 'softHighlights', ...MATERIAL_KEYS, ...CUTOUT_KEYS, ...MOTION_KEYS, ...SCENE_KEYS, ...COMPOSE_KEYS]);
    for (const key of BORDER_COLOUR_KEYS) if (key !== 'borderColor' || (settings.borderStyle && settings.borderStyle !== 'solid')) keep.add(key);
    for (const key in DEFAULTS) {
      if (keep.has(key)) continue;
      settings[key] = key in p ? p[key] : DEFAULTS[key];
    }
    settings.materialFinish = 'custom';
    return true;
  }

  return { SCHEMA, DEFAULTS, PRESETS, MATERIALS, MATERIAL_KEYS, applyMaterial, FOIL_LOOKS, comparisonVariants, applyComparison, comparisonId, BORDER_PALETTES, BORDER_COLOUR_KEYS, SCENE_KEYS, COMPOSE_KEYS, CUTOUT_KEYS, MOTION_KEYS, buildPanel, buildRotationControl, applyPreset, controlsByKey, enhanceSelect };
})();
