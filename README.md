# Sticker Shader Editor

Turn any image into a holographic die-cut sticker, in the browser, with no build step.

Drop in photos or illustrations and the main characters are cut out automatically.
Each image becomes its own sticker with a white die-cut border on a shared canvas:
drag them around, and they tilt as they move while a foil material with rainbow
interference bands, metallic tint, glitter facets, paper grain and a bevelled rim
reacts to the angle. Click a sticker to select it; the knob panel edits that sticker
only, and the × button (or the Delete key) removes it. With nothing selected the panel
greys out except for the Scene group.

The default look is deliberately quiet: a printed vinyl sticker with a soft highlight
that moves as it tilts and only a faint tint shift. The presets ("Soft gloss",
"Holographic", "Prism foil", "Glitter bomb", "Chrome", …) layer stronger foils on top,
and every knob can be pushed further from there.

When an image lands it first appears as a flat photo card with a scanning shimmer while
the models run. Once the mask is ready the background dissolves inward behind an
iridescent front, then the die-cut border grows and the foil fades in, leaving the
sticker.

## Running it

It is a static page. Open `index.html` directly, or serve the folder:

```
npx serve sticker-shader-editor
```

Everything runs client side. Images never leave the browser. The only network
requests are for the segmentation runtime and its two models, which are fetched on
first use from a pinned CDN build and cached with the Cache API so later visits work
offline.

## How the cutout works

1. **Find the characters.** MediaPipe's DeepLab v3 image segmenter (2.8 MB) labels
   people and animals. If it finds none, the centre of the image is used as a guess.
2. **Cut them out properly.** Each region found is tapped with MediaPipe's
   interactive "magic touch" segmenter (6 MB), which returns a much cleaner,
   object-level mask. The results are unioned.
3. **Snap to the image.** A guided filter fits the mask to real edges and recovers
   soft detail such as hair and fur. The die-cut outline is derived from a smoothed
   binary mask and turned into a signed distance field for the shader.
4. **Fallback.** If the runtime or models cannot be loaded (offline, blocked CDN),
   a pure JavaScript colour-key extractor takes over: it models the background from
   the image border in CIELAB and floods inward.

The **Edit cutout** mode lets you fix the selected sticker:

- **Tap +** / **Tap −** select or remove whatever you click on (Alt-click removes).
- **Brush +** / **Brush −** paint the mask by hand. `[` and `]` change the size.
- **Colour key** removes everything connected to the colour you click.
- Auto detect, Invert, Clear, Reset and Undo (Ctrl/Cmd-Z) are in the toolbar.

## The shader

`js/renderer.js` renders the sticker as a perspective-tilted quad in WebGL2. The
fragment shader samples the premultiplied cutout and a signed distance field and
builds the material from:

- **Die-cut border**: width, colour, how much foil shows on it, a bevelled rim whose
  normal comes from the distance-field gradient.
- **Holographic foil**: the hue is a function of the reflection vector (so it sweeps
  as the sticker tilts) plus a texture pattern: rainbow bands, radial rings, prism
  diamonds, cross-hatch, lenticular dots, mosaic facets, waves or a pinwheel. The
  amount of foil can be gated by ink darkness so printed areas hide it.
- **Glitter**: hashed facets with random normals that flash when they align with
  the half vector.
- **Surface**: gloss, specular highlight, rim glow, paper grain and shading.
- **Shadow**: a soft drop shadow drawn from the same distance field that shifts with
  the lift of the sticker.

A second shader mode draws the full photo during extraction: it samples the
sticker's distance field to erode the background from the far corners inward, with a
noise-jittered, rainbow-lit front, while the sticker's own material parameters ramp
from a plain print to the full foil.

`js/scene.js` owns the list of stickers (array order is z-order), hit-testing against
each one's distance field, selection, the reveal timeline, and the physics: a position
spring while dragging, velocity-based lean, a lift on the grabbed corner, hover tilt,
idle sway and a key light that follows the cursor.

## Export

The Export menu writes the selected sticker as a flat transparent PNG (1x or 2x), a
posed PNG with the current tilt and shadow, or the raw cutout; it can also save the
whole canvas as a PNG or record a four-second WebM clip of every sticker sweeping
through the light. Settings can be copied as JSON and pasted back. New stickers start
from the look you edited last.

## Files

```
index.html        page shell
styles.css        layout and controls
js/maskops.js     box blur, guided filter, distance transforms, components, colour key
js/segmenter.js   MediaPipe loader, model cache, auto-detect, tap select, fallback
js/renderer.js    WebGL2 renderer and the foil shader
js/scene.js       drag physics, pointer handling, render loop, snapshots, recording
js/ui.js          control schema, presets, panel builder
js/app.js         image intake, cutout pipeline, editor tools, export wiring
test/e2e.mjs      Playwright smoke test (see below)
```

## Testing

`test/e2e.mjs` drives the page in headless Chromium: it adds two procedural samples,
checks the placeholder card and the reveal phases, selection and per-sticker knobs,
drags a sticker, cycles presets, exercises the editor tools, exports every format,
deletes stickers with the button and the keyboard, and checks the offline fallback. It downloads the
MediaPipe package and models into `test/.cache/` and serves them to the page in
place of the CDN, so it also runs in sandboxes without CDN access.

```
npm i -g playwright && npx playwright install chromium   # once
node sticker-shader-editor/test/e2e.mjs
```

Screenshots land in `test/.out/`.
