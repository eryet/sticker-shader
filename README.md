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
"Holographic", "Prism foil", "Glitter bomb", "Chrome", "Paper cute", …) layer stronger
foils on top, and every knob can be pushed further from there.

The editor itself wears a pastel look to match: a blush background with tiny dots,
white cards with pink borders, rounded "sticker" buttons with a dark outline and a
dropped shadow, candy sliders, pink toggles, a hand-lettered accent font and a little
drawn icon on every panel group. The canvas starts on the Sky backdrop (pastel blue
with a white grid); the Scene group's *Night* theme brings the dark stage back.

## Portrait frames and cute icons

**Add frame** drops a Polaroid-style portrait frame on the canvas: a white body with a
dark outline, a patterned photo window and a hand-lettered caption. Drag any cut-out
sticker onto the window (it highlights and the hint says "release to put it in the
frame") or pick it under *Photo* in the panel. If there is exactly one loose sticker
when you add a frame it jumps in by itself. The frame is a sticker like any other, so
it tilts, gets a die-cut border and foil if you want them, and exports as one PNG.

The *Portrait frame* group starts with one-click styles that never touch your caption
or photo. Nine dress up the classic card (Cinnamon café, Cloud nine, Sky ticket, Sweet
pink, Bakery, Postage stamp, Lace doily, Classic polaroid, Night sky) and ten are
different objects altogether: a film strip with see-through sprocket holes, a photo
booth strip with three shots, a heart with a ribbon banner, a round badge, a love
letter with the photo peeking out of the envelope, a retro TV with knobs and antenna,
a bookmark with a bow on its string, a spiral notebook page, a speech bubble and a
takeaway coffee cup whose sleeve carries the caption. Below that, every part on its
own: design, size and rotation, an idle animation, caption and a small second line (a
date, a place), lettering style (hand lettered, rounded, typewriter, clean), and for
the classic card its proportions (Polaroid, portrait, landscape, wide, square), edge
(straight, scalloped, puffy cloud, ticket stub with a perforation, postage stamp) and
window shape (rounded, square, circle, arch, heart, cloud); little decorations stuck on
the corners (clouds, hearts, stars, sparkles, bows, cinnamon rolls, a café or sky mix),
colours, a pattern on the frame body and in the window, photo zoom and position, an
optional sticker-style border around the photo and washi tape. Set *Photo* back to
"none" or delete the frame to get the sticker back exactly as it was.

**Icons** opens a tray of decorations drawn in the same thick-outline pastel style,
grouped as café & sweets (cinnamon roll, teacup, latte mug with heart, cupcake,
macaron, pancakes, donut, cinnamon sticks, soft serve, cookie, milk carton, candy,
strawberry, cherries), sky (cloud, sleepy cloud, rainbow, star, sparkles, moon,
raindrop, umbrella, balloon), cute (heart, bow, flower, crown, paw, ghost, love
letter, music notes) and four with editable text (ticket stub, speech bubble, name
tag, café sign). Each icon is its own sticker; the *Icon* group has size and rotation
(the mouse wheel over any sticker resizes it, Shift + wheel rotates it), an idle
animation (float, wiggle, heartbeat, pulse, spin, swing, bounce, twinkle, dance) with
speed and amount, a kawaii face switch (where it belongs / on everything that can / none)
and blinking, colour palettes (Cinnamon sky, Strawberry milk, Mint cream, Lavender, Ink &
paper, Night glow), the individual colours, outline weight, mirror and text. The usual
border / foil / motion knobs apply too, and the same animations are in the Motion group
for photo stickers and frames (an animated frame carries its stuck icons along).

Faces blink by swapping a second drawing with closed eyes that shares the cutout, so it
costs one extra texture and no extra geometry. Animations are offsets layered on top of
the physics, so hit-testing, dragging and the clip recording all follow them.

The tray has a search box and tabs (Emoji, Café & sweets, Sky, Cute, With text) over
one scrolling body; on small screens it opens as a bottom sheet, as does the Export
menu, which is grouped into selected sticker / animated / whole canvas / share. Typing
in the box filters every group by name, Enter adds the first match, and whatever you
typed can always be added as an **emoji or word sticker** instead: type or paste any
emoji (or a short word) and press Enter, or tap one of the favourites on the Emoji tab.
It is drawn with your system's emoji font,
given a dark outline grown from its own silhouette so it matches the drawn icons, and
then treated like any other icon: die-cut border, foil, animation, blink-free but
happy to stick to a frame, and part of every export and share link. The *Text* field
in the Icon group re-letters it; *Outline colour* and *Outline weight* apply; words
use the hand-lettered font in the pink accent colour.

Icons **stick to frames**: an icon added while a frame is selected, or dropped on or
right beside a frame, moves with that frame when you drag it, and keeps its place if
the frame changes shape or size. Drag an icon away to let it go, or switch off *Stick
to a frame* in the Icon group. Icons always draw above frames and photo stickers, and
frames stay underneath even when selected, so the decorations never disappear behind
the frame.

*Rotation* in the Motion group sets a resting tilt for any sticker, and the Scene
group has one-click backdrop themes (Sky, Blossom, Mint, Lemon, Lavender, Notebook,
Night) plus a tiling pattern with its own colour and size. The pattern is included in
the Canvas PNG export.

## Undo, sharing and touch

Everything on the canvas is undoable: moves, adds, deletes, putting a photo in a frame
or taking it out, sticking icons, every knob, preset, palette and frame style. A slider
drag or a run of typing folds into one step. Use the ↶ ↷ buttons in the top bar,
Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y). The cutout editor keeps its own undo
while it is open.

The Export menu also has **sticker pack PNG** (the flat sticker fitted into 512 × 512,
the size Telegram and WhatsApp packs use), **copy to clipboard** (or Ctrl+C with a
sticker selected), and three animated exports of the selected sticker.

**Animated SVG** is the richest: the sticker's rendered die-cut picture is embedded and
everything else is plain SVG animation (SMIL, no script), so it plays in any browser and
wherever SVG animates. The idle animation is sampled from the same formulas as on the
canvas, a rainbow band masked by the sticker's own shape slides across it for the foil,
faces blink through a second closed-eyes picture, and when the selected sticker is a
frame every icon stuck to it is nested inside so the group moves together. Pictures are
kept to about 1200 px on the long side and shared between the visible copy and the foil
mask, so a frame with a few icons is a few megabytes.

The other two are raster: **animated PNG**
(lossless with full alpha, so files are large) and **animated GIF** (smaller, for
chats, with hard-edged transparency). Both loop seamlessly: one period of the idle animation is rendered
while the light sweeps once around the sticker and it tilts gently, so the foil moves
even for a still sticker. The encoders are in `js/anim.js` and need no library.

**Copy share link** packs the frames, icons and scene settings into the URL (only what
differs from the defaults, compressed). Opening the link rebuilds the scene with empty
frames ready for a photo. Photos never leave your machine and are never part of a link.

On touch screens, pinch a sticker to resize it and twist to rotate it; on a desktop the
mouse wheel does the same. Frames and icons are redrawn in a Web Worker
(`js/compose-worker.js`), so typing a caption or dragging a colour never stalls the
page; browsers without workers fall back to the same code on the main thread.

When an image lands it first appears as a flat photo card with a scanning shimmer while
the models run. Once the mask is ready the background dissolves inward behind an
iridescent front, then the die-cut border grows and the foil fades in, leaving the
sticker.

## Running it

It is a static page. Open `index.html` directly, or serve the folder:

```sh
npx serve sticker-shader-editor
```

Everything runs client side. Images never leave the browser. The only network
requests are for the segmentation runtime and its two models, which are fetched on
first use from a pinned CDN build and cached with the Cache API so later visits work
offline, plus two Google Fonts (Patrick Hand, Varela Round) for the frame captions
and icon text; if they cannot load, the captions fall back to a system handwriting
font.

## Kaomoji and pixel art

The tray has two more tabs. **Kaomoji** letters a face such as (◕‿◕) onto a little
tag; typing a face into the search box does the same, while a plain word still
becomes hand lettering. **Pixel** lists whatever `pixels/manifest.json` describes:
groups of pictures (`{ src, w, h, anim?, credit?, link? }`) that become stickers
with hard pixel edges, a dark outline and the usual die-cut border. Opaque pictures
have their background keyed out from the edges. An animated GIF or WebP keeps its
animation: the browser's ImageDecoder splits it into frames (up to 16, an even
selection of a longer loop), every frame goes through the same outline and die-cut
pipeline with its own cut shape, and the renderer swaps the frame's picture and
distance field together on time, so the border, bevel and shadow follow the
movement and transparent areas stay transparent. Browsers without ImageDecoder show the first frame. The
still exports use the first frame; the animated PNG and GIF exports follow the
loop. The folder is optional: without it the tab is not shown. The bundled collection is fan-collected Cinnamoroll pixel art from 2000s
fan sites (sources in `pixels/CREDITS.txt`, Cinnamoroll © Sanrio), for personal,
non-commercial use.

## Languages

The interface is in English and Traditional Chinese (繁體中文). The first visit
follows the browser's language; the EN | 中文 switch in the top bar changes it in
place, keeps everything on the canvas, and remembers the choice. Strings live in `js/i18n.js`, keyed by their English text,
so anything without a translation (file names, captions, your own words) shows
as is.

## How the cutout works

1. **Find the subject.** A saliency model runs through ONNX Runtime Web, on
   WebGPU when the browser has it and on WebAssembly otherwise. The default is
   U²-Netp (4.6 MB, Apache-2.0): it picks out whatever stands out, so plushies,
   mascots, food and drawn characters work, not only the classes a photo detector
   knows. If it cannot load or returns nothing usable, MediaPipe's DeepLab v3
   (2.8 MB) looks for people and animals; if that finds none, the centre of the
   image is used as a guess.
2. **Cut it out properly.** Each region found is tapped with MediaPipe's
   interactive "magic touch" segmenter (6 MB), which returns a much cleaner,
   object-level mask. The results are unioned.

   To trade download size for edge quality, set the subject model before the
   scripts load: `window.STICKER_CONFIG = { saliency: 'rmbg' }` picks BRIA's
   RMBG-1.4 (44 MB, non-commercial licence), whose 1024 px mask is used as is;
   `'off'` keeps DeepLab only.
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
- **Shadow**: the die-cut cast onto the page from the same distance field. The cast
  outline is the tilted sticker's quad sheared by the light direction, so a tilted
  sticker's shadow stretches away from its raised edge, and each point's height
  above the page sets its softness and darkness: a grabbed sticker rises, its shadow
  drifts, spreads and fades, then settles when it is let go. The direction half
  follows the moving light, so shadow and highlight agree. It stays one distance
  field sample per pixel and one extra draw per sticker.

A second shader mode draws the full photo during extraction: it samples the
sticker's distance field to erode the background from the far corners inward, with a
noise-jittered, rainbow-lit front, while the sticker's own material parameters ramp
from a plain print to the full foil.

`js/scene.js` owns the list of stickers (array order is z-order), hit-testing against
each one's distance field, selection, the reveal timeline, and the physics: a position
spring while dragging, velocity-based lean, a lift on the grabbed corner, hover tilt,
idle sway and a key light that follows the cursor. It also asks the app whether the
sticker being dragged is over a frame window and hands over the drop. Entries live in
layers (frames, photo stickers, icons) and only rise to the top of their own layer; an
entry can be attached to a parent so its rest position rides along with it.

`js/decor.js` draws the frames and icons with Canvas 2D. An icon is a small vector
drawing (thick rounded outline, pastel fills, a highlight); a frame is composed from
its settings plus the framed sticker's cutout, un-premultiplied and scaled into the
window. Either drawing then becomes the "photo" of a normal record: its alpha is the
mask, and the same distance-field pipeline gives it a die-cut border and the foil.

## Export

The Export menu writes the selected sticker as a flat transparent PNG (1x or 2x), a
posed PNG with the current tilt and shadow, or the raw cutout; it can also save the
whole canvas as a PNG or record a four-second WebM clip of every sticker sweeping
through the light. Settings can be copied as JSON and pasted back. New stickers start
from the look you edited last.

## Files

```text
index.html        page shell
styles.css        layout and controls
js/i18n.js        interface strings: English and Traditional Chinese, locale detection
js/maskops.js     box blur, guided filter, distance transforms, components, colour key
js/segmenter.js   ONNX Runtime + MediaPipe loaders, model cache, auto-detect, tap select, fallback
js/renderer.js    WebGL2 renderer and the foil shader
js/scene.js       drag physics, pointer handling, drop targets, render loop, snapshots, recording
js/decor.js       icon library, portrait frame composer, tiling patterns, backdrop themes, composed-record pipeline
js/compose-worker.js  runs that pipeline off the main thread
js/anim.js        animated SVG builder, APNG and GIF encoders
js/ui.js          control schema, presets, panel builder
js/app.js         image intake, cutout pipeline, frames and icons, history, exports, share links, editor tools
test/e2e.mjs      Playwright smoke test (see below)
```

## Testing

`test/e2e.mjs` drives the page in headless Chromium: it adds two procedural samples,
checks the placeholder card and the reveal phases, selection and per-sticker knobs,
drags a sticker, cycles presets, exercises the editor tools, exports every format,
deletes stickers with the button and the keyboard, checks the offline fallback, and
then adds a frame, cycles its styles and edges, frames and unframes a sticker (panel
and drag-and-drop), adds icons that stick to the frame and follow it when dragged,
applies a backdrop theme and exports. A last section covers undo/redo, worker
composition, the animated exports, clipboard copy, a share-link round trip and a
two-finger pinch. It downloads the MediaPipe package and models
into `test/.cache/` and serves them to the page in place of the CDN, so it also runs
in sandboxes without CDN access.

```sh
npm i -g playwright && npx playwright install chromium   # once
node sticker-shader-editor/test/e2e.mjs
```

Screenshots land in `test/.out/`.
