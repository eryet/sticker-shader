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

## Feature walkthrough

**Guide** in the top bar opens a spotlight tour of importing, manual cutouts,
frames, icons and attachments, presets, colour and lighting, animations, layers,
scene settings, undo, and every export format. Use Back / Next, the arrow keys, or
the feature dropdown to jump directly to a topic. Escape or the close button exits;
Guide is always available to reopen it.

First-time visitors get a dismissible **Take a tour** invitation on the empty canvas.
The walkthrough works without adding sample artwork, leaves settings and undo history
alone, and restores the previous panel tab, collapsed sections, menus and scroll
positions on exit. It supports English / Traditional Chinese, small screens,
keyboard focus containment, and a still animation preview with reduced motion enabled.

## Starter scenes and material comparison

**Motion → Surface animation** adds **Holographic reveal** (a travelling rainbow
highlight, foil detail, and trailing glints) or **Peel & stick** (a curled corner,
warm paper backing, and a shadow projected from the bent surface). These effects
layer over the existing movement presets. Choose Loop, On hover, or On tap;
adjust Effect speed and Effect intensity, or use Preview effect to replay once.
Touch screens play hover effects on tap. A drag does not count as a tap.
Attached icons bend across the same sheet as their parent, including nested
decorations. The folded paper hides artwork underneath it; attached icons share
the parent's cast shadow. Hovering or tapping an attached icon can trigger the
parent's peel, and moving between decorations does not restart the effect.

Three more surface effects extend this collection:
- **Glass ripple** refracts the artwork and reflected light from the point you
  touch. The wave fades out without changing the sticker's silhouette or holes.
- **Lenticular flip** changes between the original and a second image. Choose
  **Follow pointer**, or use Loop, On hover, On tap, and Preview effect. Upload a
  second image (up to 20 MB), try the sample, replace it, or remove it. It fills
  the current sticker shape; transparent areas in the second image use white.
  Undo, duplication, and cutout changes keep the second picture. It stays in the
  current browser session like imported photos, and share links never include it.
  The flip eases continuously across the full gesture, including transparent
  gaps and attached decorations. Lens ribs are filtered at small sizes. Preview
  and pointer control blend smoothly; Lenticular GIF, APNG, and SVG exports use
  25 fps when a second image is present.
- **Sticker assembly** lands the frame first, fades its photo into place, then
  brings attached decorations in with a staggered spring. Select the parent to
  preview or export the group. It also works on a single sticker.

Surface effects default to Off. Changes support undo/redo, copied settings, and
shared scenes. Reduced motion keeps these effects still in the live editor.
Flat sticker PNGs stay flat; posed PNGs and Canvas PNG capture the current effect.
GIF, APNG, and animated SVG sample the real renderer, including attached icons.
Each export loop contains one complete surface-effect cycle, including effects
set to hover or tap. When combined with an idle movement, that movement determines
the export duration and the surface effect fits into it. Animated SVGs with a
surface effect embed raster frames, so they are larger than ordinary SVG exports.
Recorded clips play one surface cycle across the recording (unless reduced motion
is enabled). Choosing another material or foil keeps the surface animation.

Choose **Start with a scene** on the welcome card, or **Scene → Starter scenes**
while editing. Pet portrait, Birthday wishes, Travel memory, and Collectible card
each add a sample photo, styled frame, and two attached decorations. Existing
artwork stays on the canvas. The complete addition is one undoable action.

Select a frame and choose **Replace photo** in Properties to import a whole image
into its photo window. Replacing a starter sample removes that placeholder; replacing
an ordinary photo returns the old photo to the canvas. Undo restores the previous
photo and ownership. Photo zoom and position controls fit the replacement.

**Material → Compare materials** opens a draggable before/after divider directly
over the editor canvas. The original and preview share the same frozen pose and
lighting, with accurate transparency, shadows, and layer order. Choose from fourteen
materials plus holographic vinyl; **Browse previews** opens the thumbnail gallery.
Previews keep the current finish except for the dedicated holographic option.
**Apply material** commits one undoable change; **Cancel** or Escape leaves the
artwork untouched. Exports always use committed settings. Locked items cannot be
changed. The divider supports touch, arrow keys (Shift for larger steps), Home/End,
and a reset centered on the selected artwork. Both languages and reduced motion
are supported.

Creative materials include **Iridescent film** (shifting interference colors),
**Candy jelly** (tinted volume and suspended bubbles), **Glazed ceramic** (speckled
glaze), **Velvet** (soft directional fibers), and **Carbon fiber** (diagonal woven
bundles). Each has depth, texture strength/size, tint, and artwork opacity controls;
film and jelly also have independent base opacity. They use the same live shaders
for canvas previews, image exports, and animated exports, with no extra asset downloads.

**Holographic foil → Explore holographic foils** adds five finishes on top of the
current material: **Prismatic shards**, **Aurora ribbons**, **Cracked ice**,
**Star confetti**, and **Diffraction rings**. They also appear in the comparison
picker/gallery and the top Preset menu. The new foil presets preserve the substrate,
opacity, border, shadows, and lighting comfort settings. Adjust the pattern's scale,
angle, hue, angle sensitivity, intensity, and shimmer in Holographic foil. Applying
a foil is undoable; sharing and image/animation exports preserve its pattern.

**Scene → Discover backgrounds** offers visual previews of all 17 themes, with
eight new choices first: Dreamy aurora, Scrapbook desk, Peach terrazzo, Daisy meadow,
Cosmic postcard, Retro soda, Love letters, and Birthday frosting. Theme selection
turns off the transparency grid and is undoable. Backdrop color, pattern color,
and pattern size remain editable; sharing preserves them. Canvas PNG includes
the patterned background. Recorded clips currently use the solid backdrop color.

## Your own artwork

Open **My artwork** in the toolbar, then choose **Import icons** or **Import frames**.
Select one or more PNG, WebP, JPG or GIF files (up to 20 MB each). Imported assets
are added to the canvas and saved in this browser's artwork library; click a thumbnail
to add another copy later. Removing a library entry keeps its existing canvas copies.
If browser storage is unavailable or full, the library reports that new imports are
available only for the current session.

Custom icons retain their colours and transparency, attach to the selected sticker
or frame, and support the usual transforms, materials, animation and exports.
Animated icons preserve their loop through the browser's ImageDecoder (up to 16
sampled frames); browsers without it use the first image. Frame artwork uses a still
image. Artwork is fitted within 1536 pixels on its longest side for editing.

Custom frames detect the largest enclosed transparent opening, including curved or
irregular shapes, while keeping transparent outside margins. Put a photo in through
the existing **Photo** control or drag it onto the frame. Use **Photo opening →
Adjustable rectangle** to create or reposition the opening with left/top/width/height
controls; images without an enclosed opening start in this mode. Photo zoom and
position controls remain available. Built-in illustration controls are hidden for
custom artwork, whose original colours and drawing are preserved.

Imported artwork supports undo/redo, duplication, attached icons and PNG, GIF,
animated PNG and SVG exports. Files stay local to this browser and are omitted from
share links; clearing this site's browser data also clears the saved artwork library.

## Portrait frames and cute icons

**Add frame** drops a Polaroid-style portrait frame on the canvas: a white body with a
dark outline, a patterned photo window and a hand-lettered caption. Drag any cut-out
sticker onto the window (it highlights and the hint says "release to put it in the
frame") or pick it under *Photo* in the panel. If there is exactly one loose sticker
when you add a frame it jumps in by itself. The frame is a sticker like any other, so
it tilts, gets a die-cut border and foil if you want them, and exports as one PNG.

The *Portrait frame* group starts with one-click styles that never touch your caption
or photo. **Discover frames** offers seven illustrated thumbnail choices:

- **Starlight rare** — a collector card with a metallic rim, clipped corners, an SSR
  badge, stars, and a numbered edition.
- **Bon voyage** — a mint suitcase with stitched straps, buckles, wheels, a luggage
  label, and an air-mail stamp.
- **Lucky capsule** — a round toy capsule with a glass dome, pink shell, and heart latch.
- **Player one** — a miniature arcade cabinet with a photo screen, directional pad,
  pastel buttons, and a player marquee.
- **Snow day** — a snow globe with glass highlights, snow, and an engraved base.
- **Love potion** — a rounded bottle with a stopper, hanging star charm, and label.
- **Conference pass** — an editable event badge with a photo and a printed lanyard.

Choose **Conference pass** in **Style** or **Discover frames** to edit the event name,
attendee name, organization, role (attendee, speaker, VIP, etc.), and date/location.
The existing Photo control supplies the portrait. Card, accent, and text colours
are separate from the **Lanyard** controls, which change the ribbon colour, printed
text, print/stripe colour, length, and plain/striped style. Select **None** to remove
the lanyard. Lanyards can also be added to other built-in and imported frames; imported
art keeps its original printed text. The complete pass moves and exports as one
sticker, with any attached icons. Built-in pass details and lanyard settings support
undo/redo, duplication, copied settings, and share links.

Each starts with an empty patterned photo window. Pick one from the thumbnails or
the **Style** dropdown; **Design** changes just the shape while keeping your colours.
**Detail colour** customizes the trim, straps, shell, controls, base, or bottle accents.
The new frames support the same attached icons, photo positioning, effects, undo,
shared scenes, and PNG / GIF / animated PNG / SVG export as the existing frames.

Existing styles dress up the classic card (Cinnamon café, Cloud nine, Sky ticket, Sweet
pink, Bakery, Postage stamp, Lace doily, Classic polaroid, Night sky), or turn it into
different objects: a film strip with see-through sprocket holes, a photo
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

There are **27 moving animations**, plus Still: Float, Breathing, Drift, Orbit,
Figure eight, Swing, Nod, Wiggle, Jelly, Bounce, Hop, Heartbeat, Pulse, Pop, Tada,
Shake, Twinkle, Dance, Spin, Flutter, Falling leaf, Boomerang, Spiral, Skate,
Cartwheel, Scoot and Peekaboo. The newest set adds fluttering turns, a swaying leaf,
a shrinking fly-out and return, a spiral path, skating, a rolling cartwheel out and
back, little sideways hops, and a shrink-and-pop surprise. Breathing and Drift are gentle; Orbit and Figure
eight follow a path; Jelly, Hop, Shake, Nod, Pop and Tada have playful bursts with
brief rests. Speed controls the pace and Amount controls the movement. Frames
also have these controls directly beneath Animation. The same motion formulas
drive the canvas, SVG, GIF and animated PNG exports; raster exports allow room
for the full motion so bigger hops and pops keep their edges.

Animated GIF and animated PNG include the selected photo or frame's attached
icons, with their relative sizes, layer order, motion, blinking and animated
artwork. The export fits the whole decorated sticker, including icons hanging
over its edges. Detached icons remain separate.

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

## Import whole images or cutouts

**Auto cutout** remains the default. The picker beside **Add images** also offers
**Whole image**, which skips segmentation and preserves the full picture, aspect
ratio, transparent areas and small details. Your choice is remembered for future
uploads, drops and pasted images; a batch uses the mode selected when it starts.
The drop hint shows which mode will be used. Try a sample still demonstrates cutout.

A photo's floating toolbar offers **Remove background** for a whole image or
**Restore original** for a cutout. Both actions support undo/redo and keep the
original source available. Whole images can still use sticker effects and the
cutout editor. Manual edits preserve the edges you draw; Reset cutout returns to
the starting cutout or whole image.

## Border colours

The **Die-cut border** group offers **Solid**, **Linear gradient**, **Radial
gradient**, **Conic gradient**, and **Rainbow RGB**. Pick a colour set — Candy,
Ice, Sunset, Aurora, Neon RGB, or Rainbow — or choose three custom colour stops.
Use Colour angle to turn linear, conic, and rainbow borders. Colour sets also
turn on a 14 px border when its width was zero; the width remains adjustable.

Gradients colour the border while keeping the opaque artwork intact. Your custom
gradient survives material preset changes and is included in PNG, GIF, animated
PNG, and SVG exports. Border colours support undo/redo, copied settings, and
shared scenes. Solid white remains the default.

## Materials

Select an image, frame or icon and open **Material** at the top of its controls.
Alongside the original printed vinyl, there are eight surfaces: clear glass,
frosted glass, acrylic charm, domed resin, puffy vinyl, embroidered patch, brushed
metal and textured paper. Depth, texture strength, texture size and tint appear
where they apply. Increase **Border → Width** for a wider clear acrylic/glass rim.

**Finish** independently adds matte, gloss, holographic, pearlescent or glitter
effects. Natural uses the material's own surface; Custom / preset uses the
existing foil and surface controls. Choosing a top-bar preset preserves the
material and its adjustments, and selects Custom / preset. Adjusting individual
foil, glitter or reflection controls also selects Custom automatically.

**Base opacity** controls the transparent substrate of glass/acrylic, while
**Artwork opacity** separately fades the printed image. Glass is simulated with
translucency, tint and moving highlights; frosted glass adds a milky texture,
without blurring or refracting the backdrop. Raised materials use shader shading,
not extruded geometry. Materials use the same renderer for live editing and
exports; PNG and APNG preserve partial transparency, while GIF quantizes it.

`node test/materials.mjs` verifies distinct rendered surfaces and finishes, light
response, independent opacity, imported-image controls, history, duplication,
preset preservation, sharing, PNG/GIF rendering, mobile layout and translation.
It produces `test/.out/materials-comparison.png` for visual review.

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

Turn on **Show resize handles** at the top of **Properties** to show the selected
artwork's resize border and four **pink corner handles**. This view option starts
off each session; turning it off hides the border and handles immediately. The
Size slider, mouse wheel, and pinch resizing remain available either way.
Drag a corner to resize proportionally,
keeping the opposite corner in place; the artwork's motion pauses during the drag.
Escape or a cancelled touch restores the entire resize, and a completed corner drag
is one Undo step. Handles remain reachable when artwork extends beyond the canvas.
Focus a handle and use arrow keys for 0.01 size steps (Shift for 0.10), or Home / End
for the available limits. Size ranges from 0.10 to 2.50.

For decorated artwork, **Resize together** appears in the floating toolbar and starts
enabled. It scales all attached icons, including nested attachments, with the selected
item. It applies to handles, the Size slider, scrolling, and pinching. Switch it off
to retain the icons' individual sizes. The group stops at the first member's size
limit so its proportions stay intact. Unlock attached icons before resizing the group.
Both the control and the guide support English and Traditional Chinese.

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

**Delete** (toolbar, Delete key, or Backspace) opens a confirmation with the item's
thumbnail and name. Cancel has initial focus; Cancel, Escape, or clicking the dimmed
backdrop leaves the scene and undo history unchanged. The dialog explains when a
frame's photo will return to the canvas and when attached icons will remain there.
Confirming deletes only the shown item, and one Undo restores the deletion together
with its photo and attachments. Locked items remain protected.

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

Choose **GIF · High quality** for a 1024 × 1024 loop at 25 fps, with a palette
that preserves a wider range of colours. The regular GIF stays at 512 × 512 and
16 fps. High quality includes the same attached icons and transparent background;
it takes longer to export and produces larger files. Frames are rendered in two
passes to avoid keeping the full uncompressed animation in memory. GIF still has
255 visible colours and hard-edged transparency; animated PNG preserves full alpha
and lossless colour.

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

- **Erase** / **Restore** paint the mask by hand, with **Detail**, **Soft edge** and
  **Broad** presets. Brush size uses image pixels (1–300 px). Hardness controls
  falloff and Strength controls how much one stroke changes the mask, with no
  repeated buildup within the same stroke. Outer and inner cursor rings show its
  reach and falloff. `B` selects Restore, `E` selects Erase, `[` / `]` change the
  size, and Alt temporarily reverses the brush. Cursor movement does not redraw
  the whole mask; strokes are drawn at most once per animation frame.
- **Lasso** (`L`) lets you draw a loop, preview the selected area, then choose
  **Erase inside**, **Restore inside** or **Keep only**. Feather softens the selection
  edge. Cancel or Escape clears the selection without changing the image. Selections
  follow zoom and pan; a second finger cancels an unfinished loop before pinching.
- **Colour key** removes everything connected to the colour you click.
- Manual edits use the drawn mask directly: automatic hole filling and fragment
  cleanup cannot undo your work. Soft alpha and tiny restored details survive
  rendering and export. Changing working resolution preserves the manual mask.
- **Zoom and pan:** scroll to zoom around the pointer, use the + / − buttons, or
  pinch with two fingers, up to 800% of the fitted view. `H` selects Pan; holding
  Space and dragging also pans. Fit (or `0`) resets the view. A pinch cancels the
  first finger's brush mark before zooming.
- **Preview:** Overlay shows removed areas and the pink cut line; Cutout shows the
  editable mask on a checkerboard; White and Black help inspect edges; **Mask**
  shows kept pixels in white and erased pixels in black; Original
  shows the source for comparison and allows panning without editing the mask.
- **Undo / Redo:** up to 12 steps per photo, including complete strokes, lasso edits,
  colour key, Invert, Clear, Reset cutout and rerunning Auto detect. Use Ctrl/Cmd+Z,
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
js/transform.js   corner resize grips, pointer capture, cancellation and keyboard sizing
js/app.js         image intake, cutout pipeline, frames and icons, history, exports, share links, editor tools
test/e2e.mjs      Playwright smoke test (see below)
test/sticking.mjs Focused photo/frame icon attachment regression (no model downloads)
test/cutout.mjs   Cutout editor interaction regression (no model downloads)
test/objects.mjs  Toolbar, duplication, layers, locking and export regression
```

## Testing

`node test/resize.mjs` checks rotated corner anchors, nested group proportions,
individual sizing, Undo / Redo, cancellation, locks, size limits, animation exports,
motion pausing, English / Chinese labels, and mobile touch targets.

`node test/conference-pass.mjs` verifies editable pass details, independent lanyard
colours, unclipped silhouettes and animations, shifted photo windows, imported-frame
lanyards, worker composition, history, duplication, sharing, decoded GIF/APNG and
SVG output, and mobile controls. It also saves a three-colour preview.

`node test/custom-artwork.mjs` exercises file imports, automatic and adjustable
photo openings, animated icons, attachment, worker composition, duplication and
undo/redo, GIF/APNG/SVG output, persistent library reuse and removal, failed imports,
and the mobile library in Traditional Chinese.

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

`node test/cutout.mjs` checks brush presets, hardness and strength, temporary
restore/erase, lasso erase/restore/keep with feather, undo/redo, real render and PNG
alpha/colour, zoom and pan coordinates, preview modes, undoable Auto detect, touch
pinch, and the mobile English / Traditional Chinese layout. It uses a deterministic
synthetic mask to test editor behaviour independently of the AI models.

`node test/animated-attachments.mjs` decodes real GIF and APNG exports to check
attached icons, layer order, parent transforms, animated artwork, blinking and
unclipped edges on photos and frames. It also checks that detached icons are
excluded and exporting leaves the scene unchanged.

`node test/gif-quality.mjs` checks colour accuracy and transparency, repeatable
frame rendering with bounded memory, standard and high-quality GIF downloads,
decoded dimensions and frame timing, infinite looping, and the mobile export menu.

`node test/border-colours.mjs` checks all five border styles with real shader pixels,
unchanged artwork and alpha, palette selection, custom stops and angle, undo/redo,
material presets, locks and shared settings. It decodes GIF/APNG exports and checks
PNG renders, SVG structure, and desktop / Traditional Chinese mobile controls.

`node test/frame-collection.mjs` checks the gallery frame drawings, photo
clipping, editable accents, gallery / dropdown synchronization, caption and photo
retention, undo/redo, locks, shared frames, and mobile Chinese controls. It renders
every existing frame style and decodes real GIF/APNG exports for every gallery design.

`node test/objects.mjs` checks attachment actions, decorated-photo and frame
duplication, independent cutout/photo ownership, locks and inherited locks,
selection and ordering, undo/redo, mirrored hit testing and export, and mobile /
Traditional Chinese panel layout. It also uses deterministic masks.

`node test/delete-confirmation.mjs` checks toolbar and keyboard deletion, cancel /
Escape / backdrop dismissal, focus, modal keyboard isolation, captured targets,
locks, photo and icon retention, undo/redo, and the Chinese mobile dialog.

`node test/animations.mjs` checks seamless motion loops, zero amount, export bounds,
shared controls, undo/redo, saved scenes, all added frame/icon SVG and raster loops,
and decoded GIF/APNG exports for the eight newest animations.

`node test/walkthrough.mjs` checks every guide step on empty and populated canvases,
artwork/history isolation, restored panel state, keyboard navigation and modal guards,
first-visit preferences, Chinese translations, desktop/mobile spotlight positioning,
short screens, reduced motion, and browsers with storage disabled.
