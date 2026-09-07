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

Choose **Style → Cinnamoroll café** for the white card with a blue polka-dot window,
oversized teacup, cloud and frosted-roll corner stickers from the reference. The photo
window starts empty, with no characters. The untouched “CUTE” caption becomes
“CINNAMOROLL” in the reference's handwriting; custom captions and photos are preserved.
The matching **Cinnamoroll café** icon group
contains Cinnamoroll, a duo, the teacup, cloud and frosted roll as individual stickers.
Search “Cinnamoroll” to find the whole set. The characters support faces and blinking,
and each icon attaches to photos and frames. The decorations reuse the original artwork in
`reference/4b50b771996bfdfbc32bf74cd2861190.png`; Cinnamoroll © Sanrio.

**Icons** opens a tray of 66 decorations drawn in the same thick-outline pastel style,
grouped as café & sweets (cinnamon roll, teacup, latte mug with heart, cupcake,
macaron, pancakes, donut, cinnamon sticks, soft serve, cookie, milk carton, candy,
strawberry, cherries), sky (cloud, sleepy cloud, rainbow, star, sparkles, moon,
raindrop, umbrella, balloon), cute (heart, bow, flower, crown, paw, ghost, love
letter, music notes) and four with editable text (ticket stub, speech bubble, name
tag, café sign). The collection also includes bubble tea, butter toast, caramel pudding,
peach, a ringed planet and flying saucer, plus three more groups: **Animals** (bunny,
kitten, teddy bear, frog, baby chick, little whale), **Garden** (tulip, sprout,
mushroom, potted cactus, butterfly, lucky clover) and **Everyday** (retro camera,
headphones, game controller, open book, gift box, pencil).
Each icon is its own sticker; the *Icon* group has size and rotation
(the mouse wheel over any sticker resizes it, Shift + wheel rotates it), an idle
animation with
speed and amount, a kawaii face switch (where it belongs / on everything that can / none)
and blinking, colour palettes (Cinnamon sky, Strawberry milk, Mint cream, Lavender, Ink &
paper, Night glow), the individual colours, outline weight, mirror and text. The usual
border / foil / motion knobs apply too, and the same animations are in the Motion group
for photo stickers and frames (an animated frame carries its stuck icons along).

There are **19 moving animations**, plus Still: Float, Breathing, Drift, Orbit,
Figure eight, Swing, Nod, Wiggle, Jelly, Bounce, Hop, Heartbeat, Pulse, Pop, Tada,
Shake, Twinkle, Dance and Spin. Breathing and Drift are gentle; Orbit and Figure
eight follow a path; Jelly, Hop, Shake, Nod, Pop and Tada have playful bursts with
brief rests. Speed controls the pace and Amount controls the movement. Frames
also have these controls directly beneath Animation. The same motion formulas
drive the canvas, SVG, GIF and animated PNG exports; raster exports allow room
for the full motion so bigger hops and pops keep their edges.

Faces blink by swapping a second drawing with closed eyes that shares the cutout, so it
costs one extra texture and no extra geometry. Animations are offsets layered on top of
the physics, so hit-testing, dragging and the clip recording all follow them.

The tray has a search box and category tabs, with arrows to browse more groups, over
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

Icons **stick to photo stickers and frames**: select a photo sticker or frame before
adding an icon, or drag an existing icon onto it. The icon moves with its parent and
keeps its relative position when the parent is resized. Adding more icons while an
attached icon is selected decorates the same parent. Drag an icon away to let it go,
or switch off *Stick to sticker or frame* in the Icon group. Photo attachment follows
the cutout, so empty transparent corners do not attract icons. Putting a decorated
photo in a frame transfers its icons to the frame; undo restores the photo and its
attachments. Icons always draw above frames and photo stickers, and
frames stay underneath even when selected, so the decorations never disappear behind
the frame.

*Rotation* supports −360° to +360° for photos, frames and icons. The rotate button,
Shift + wheel and touch twist wrap smoothly through full turns. Its panel control
has a draggable angle dial, editable degree field, 1° nudges, 90° turn buttons and
a reset to 0°. Hold Shift while dragging for 15° snapping; the dial also supports
arrow keys (Shift for 15°), Page Up/Down for 90° and Home to reset. The Scene
group has one-click backdrop themes (Sky, Blossom, Mint, Lemon, Lavender, Notebook,
Night) plus a tiling pattern with its own colour and size. The pattern is included in
the Canvas PNG export.

Click any colour chip for a matching **colour picker** with a saturation/brightness
area, full-spectrum hue slider, editable hex and RGB values, a studio palette and
six recently used colours saved in this browser. Changes preview live; the left half
of the preview restores the colour from when you opened the picker. Screen sampling
is available when the browser supports EyeDropper. Use arrow keys in the shade area
(Shift for larger steps), Escape to close, and the usual undo/redo for colour edits.
On small screens the picker fits above the keyboard; older browsers retain their
native colour dialog.

## Softer lighting

The **Lighting** group has one **Shine strength** slider for foil, glitter,
metallic tint and reflections. It starts at 65%; try 30–45% for a quieter finish.
At 0%, shine is off while the artwork's brightness and shading stay as set.
**Gentle highlights** is on by default: overlapping reflections blend smoothly
and respect the ink's foil blocking, keeping dark outlines and pastel details
readable. Turn it off and set strength to 100% for the previous brighter response.
**Light follows cursor** is here too; lower it to keep the lighting steadier.
Lighting choices stay in place when switching finish presets and carry through
PNG/animation exports, copied settings, undo/redo and shared scenes.

## Undo, sharing and touch

Select a sticker to show its **floating toolbar**: Duplicate, Rotate, Flip
horizontally, Attach / Detach for icons, and Delete. Rotate displays the current
angle and opens a full-turn dial with exact degree entry, 1° nudges, quarter turns,
and reset. The expanded toolbar stays still while adjusting the angle and keeps
the sidebar in sync. Escape or clicking outside closes the dial.
The toolbar stays inside the canvas on small screens and hides
while dragging or editing a cutout. Duplicate (Ctrl/Cmd+D) copies a photo or frame
with its attached icons in one undoable step, preserving the edited cutout. A copied
frame gets its own photo record, so editing or removing it does not take the
original frame's photo. Explicitly detached icons stay detached until reattached.

The sidebar's **Layers** tab lists thumbnails in front-to-back order, with the
selected item highlighted and each attached icon's parent named underneath. Click
a row to select a covered sticker; the lock button protects a finished item from
dragging, resizing, deletion and property changes. Locking a photo or frame also
protects its attached icons. Unlock it in Layers to resume editing. Move backward /
forward changes the order within the same kind: icons remain above photos and
frames. Selection keeps the stack order intact. Locks and ordering are undoable;
shared frames and icons retain their locks. Both panels and the toolbar support
English and Traditional Chinese.

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
faces blink through a second closed-eyes picture, and every icon stuck to the selected
photo or frame is nested inside so the group moves together. Pictures are
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

The tray has two more tabs. **Kaomoji** adds a face such as (◕‿◕) as plain text on a
transparent background, with no tag, border, shine or shadow by default. Typing a face into the
search box does the same, while a plain word still becomes hand lettering.
**Pixel** lists whatever `pixels/manifest.json` describes:
groups of pictures (`{ src, w, h, anim?, credit?, link? }`) that become stickers
with hard pixel edges, a dark outline and the usual die-cut border. The full collection
has **606 goodies**: 496 Cinnamoroll and 110 Kuromi, with collection/type filters and
English/Chinese search. It includes pixel graphics, tiny icons, stamps, blinkies,
dividers, banners, site buttons, cursors, backgrounds and Kuromi Halloween art.
Long decorations get wider previews; cursors and backgrounds are added as decorations.
Opaque cutout pictures have their background keyed out from the edges. Blinkies,
stamps, dividers, buttons and backgrounds preserve their original colors and transparency
in every frame. Fine dividers, cursors, buttons and backgrounds start without an extra
outline or border. An animated GIF or WebP keeps its
animation: the browser's ImageDecoder splits it into frames (up to 16, an even
selection of a longer loop), every frame goes through the same outline and die-cut
pipeline with its own cut shape, and the renderer swaps the frame's picture and
distance field together on time, so the border, bevel and shadow follow the
movement and transparent areas stay transparent. Browsers without ImageDecoder show the first frame. The
still exports use the first frame; the animated PNG and GIF exports follow the
loop. The folder is optional: without it the tab is not shown. The bundled collection is fan-collected Cinnamoroll and Kuromi pixel art from 2000s
fan sites (sources in `pixels/CREDITS.txt`, characters © Sanrio), for personal,
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

The **Edit cutout** mode opens a dedicated workspace for fixing the selected photo
sticker. Its toolbar and preview controls stay outside the editable image area,
including on small screens:

- **Tap +** / **Tap −** select or remove whatever you click on (Alt-click removes).
- **Restore** / **Erase** paint the mask by hand. The brush has an actual-pixel size
  readout and adjustable hardness, with outer and inner cursor rings showing its
  reach and falloff. `B` selects Restore, `E` selects Erase, `[` / `]` change the
  size, and Alt temporarily reverses the brush. Cursor movement does not redraw
  the whole mask; strokes are drawn at most once per animation frame.
- **Colour key** removes everything connected to the colour you click.
- **Zoom and pan:** scroll to zoom around the pointer, use the + / − buttons, or
  pinch with two fingers, up to 800% of the fitted view. `H` selects Pan; holding
  Space and dragging also pans. Fit (or `0`) resets the view. A pinch cancels the
  first finger's brush mark before zooming.
- **Preview:** Overlay shows removed areas and the pink cut line; Cutout shows the
  editable mask on a checkerboard; White and Black help inspect edges; Original
  shows the source for comparison and allows panning without editing the mask.
- **Undo / Redo:** up to 12 steps per photo, including complete strokes, taps,
  colour key, Invert, Clear, Reset and rerunning Auto detect. Use Ctrl/Cmd+Z,
  Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y. History survives closing and reopening the editor;
  a new edit clears redo. Auto detect shows a busy state while it runs.

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
layers (frames, photo stickers, icons), with explicit ordering within each layer; an
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
js/objects.js     floating sticker toolbar, layer thumbnails, selection and lock controls
js/app.js         image intake, cutout pipeline, frames and icons, history, exports, share links, editor tools
test/e2e.mjs      Playwright smoke test (see below)
test/sticking.mjs Focused photo/frame icon attachment regression (no model downloads)
test/cutout.mjs   Cutout editor interaction regression (no model downloads)
test/objects.mjs  Toolbar, duplication, layers, locking and export regression
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

Run `node test/sticking.mjs` for the focused icon attachment checks: selecting a
photo, adding decorations, dragging to attach/detach, movement and resize following,
undo/redo, the stick toggle, deleting/restoring the parent, transparent-corner hit
testing, framing a decorated photo, and animated SVG export. It uses a synthetic
photo mask and does not download AI models. As with the smoke test,
`PLAYWRIGHT_MODULE` can point to a Playwright installation; optionally set
`PLAYWRIGHT_EXECUTABLE_PATH` to an installed Chromium browser.

`node test/cutout.mjs` checks brush hardness, temporary restore/erase, undo/redo,
zoom and pan coordinate accuracy, preview modes, undoable Auto detect, touch pinch,
and the mobile English / Traditional Chinese layout. It uses a deterministic
synthetic mask to test editor behaviour independently of the AI models.

`node test/objects.mjs` checks attachment actions, decorated-photo and frame
duplication, independent cutout/photo ownership, locks and inherited locks,
selection and ordering, undo/redo, mirrored hit testing and export, and mobile /
Traditional Chinese panel layout. It also uses deterministic masks.
