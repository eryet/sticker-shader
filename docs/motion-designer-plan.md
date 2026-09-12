# Motion designer implementation plan

Status: implemented locally on 2026-09-12; originally planned against `349ea44`.

Implementation notes: scene integration is isolated in `js/motion-scene.js` and
styling in `motion.css`. Endpoint holds use fractions of the total duration.
During a draft, Apply/Cancel finishes the edit before other controls can change
the artwork. Settings/camera are frozen for lazy export, and offscreen rendering
restores GPU state even on failure. See `README.md` for the shipped controls and
`test/motion-sampling.mjs` / `test/motion-designer.mjs` for verification.
The UI refinement uses a separately scrolling form with persistent Apply/Cancel,
selected recipe states, Preview/Start/End controls, and a readable phase legend.
`test/motion-ui.mjs` verifies dropdown Escape, stable focus, contextual controls,
touch targets, and the footer at desktop and phone sizes.

The first version lets users author a short animation for one sticker or its
attached group by setting two poses, adjusting timing, and directing a light
sweep. It lives in Properties > Motion and uses the existing pastel controls,
custom selects, raised buttons, and English / Traditional Chinese translations.

1. User experience

- Add a **Design motion** button in Motion. Open a focused authoring panel beside
  the current canvas, with a compact transport bar at the bottom of the canvas.
  On mobile, show the controls in a bottom sheet with the preview still visible.
- Start with four editable recipes: **Slide & shine**, **Float & turn**,
  **Pop & settle**, and **Light sweep**. All use the same timeline model.
- Select **Start** or **End**, then drag the artwork to set that pose. Offer
  numerical controls for position, rotation, scale, opacity, and two-axis tilt.
  Motion-edit guides appear only in this mode; they do not change the user's
  ordinary Show resize handles preference.
- Display a faint start/end outline and connecting line while editing. The line
  previews a straight path in v1; it is not a new curved-path editor.
- Provide Play, Pause, Restart, a keyboard-accessible scrubber, elapsed time,
  travel duration, endpoint holds, easing, and Once / Loop.
- Light options: Keep current light, Left to right, Right to left, Diagonal,
  and Orbit. Let the user choose the sweep's start/end timing on the same bar.
- **Apply** commits the draft as one undoable edit. **Cancel** or Escape restores
  the previous clip, pose, selection, lighting, and playback state. Scrubbing and
  playback do not create undo entries. Edits inside the draft get local undo.
- Reopening a clip starts paused. With reduced motion enabled, opening the
  designer never autoplays; manual scrubbing remains available. An explicit Play
  action can preview the clip, and export remains available.

An example four-second Loop recipe:

| Time | Artwork | Lighting |
| --- | --- | --- |
| 0.0-1.0 s | Slide and fade from Start to End | Move toward the first light position |
| 1.0-2.5 s | Hold the End pose | Sweep across the foil |
| 2.5-3.5 s | Return smoothly to Start | Return toward the initial light |
| 3.5-4.0 s | Hold Start | Hold the initial light |

Loop includes the return transition rather than jumping between different
endpoint poses. Once plays Start to End, holds, and stops. All generated recipes
must close their lighting, opacity, texture, and surface-effect cycles as well
as their position cycle. Linear easing can have an intentional speed change at
an endpoint; the default Smooth easing must settle with continuous velocity.

2. Findings that determine the implementation

- `js/scene.js` already has a pure `animOffsets()` evaluator, but live rendering
  uses spring state in `_updateOne()` / `_pose()`, while `animationFrames()`
  constructs export poses separately and adds a prescribed tilt and light orbit.
- `record()` supplies another scripted sweep based on wall-clock time. It must
  not override an authored clip with that sweep.
- Attached icons already share a parent plane for peel and assembly. Ordinary
  live attachments and export attachments take different paths, so a new clip
  needs a shared group-pose calculation to avoid repeating the earlier drift bug.
- Lenticular live interaction has a damped, stateful blend; export already has a
  deterministic blend option. Seeking must use the latter kind of evaluation.
- `commitSettings()` and settings diffing currently expect mostly scalar values.
  A nested clip should not be inserted into that machinery without explicit
  cloning, comparison, and validation.
- `animatedSvg()` already embeds rendered frames for surface effects. The same
  route can represent custom motion and its lighting accurately.

3. Timeline and data model

Add `js/motion.js` as a pure module. Its main operations are
`normalizeClip(data)`, `duration(clip)`, `sample(clip, time)`, and
`sampleGroup(root, time, context)`. They return pose deltas, opacity, light
parameters, and texture/effect phases without modifying artwork or reading
`performance.now()`, pointer state, or previous frames.

Store one optional, versioned `motionClip` on the artwork record and expose it
to its scene entry. It contains enabled state, Start / End poses, travel and hold
durations, Once / Loop, easing, light settings, and surface timing. Default is
absent, so existing designs continue through their current animation path.

Position offsets use a single reference length: the selected root's unanimated
long side, excluding export fitting. Store angles in degrees and scale as a
multiplier. Moving or resizing the base artwork therefore carries the animation
with it, and changing export resolution does not change the path. Copying motion
to another sticker scales the path to that sticker's size.

Initial limits: 1-8 seconds total, strictly positive travel time and scale,
nonnegative holds, bounded position/tilt, and a maximum of one Start / End pair.
Rotation interpolates the signed authored delta, so an explicit 360-degree turn
works. Validate finite numbers and enum values on every import and restore;
unknown clip versions are ignored with a clear status message.

Use an immutable `setMotionClip()` command with deep-cloned before/after values.
Wire it into duplication, reset, deletion undo, cutout/frame rebuilds, copied
settings, and optional clip data in existing scene links. Old links remain valid.
Existing photo/imported-artwork exclusions from share links continue to apply.
Do not inherit a previous sticker's clip automatically through `lastLook`.

4. Composition and playback rules

- A custom clip owns the root group's positional motion while enabled. Preserve
  the root's existing movement preset for when custom motion is disabled.
- Parent motion transforms the entire attached subtree, including scale,
  rotation, tilt, and opacity, exactly once. Nested icons keep their local anchors.
  Locked children still follow their parent's animation; their own data is not
  being edited. A locked target cannot be authored.
- Existing child presets and surface effects remain available, sampled from the
  same clip time. Normalize complete effect cycles to the authored duration to
  avoid seams. Root-authored playback takes precedence over any child custom
  clips; preserve those clips for independent playback after detaching.
- Suspend pointer tilt, spring lag, and pointer-driven lenticular changes for the
  group while its timeline owns playback. Surface effects such as peel or ripple
  use deterministic phases; lenticular uses a deterministic A/B blend. Imported
  animated artwork is sampled against a complete cycle within the clip.
- Compute attachment transforms, bend contexts, and shadow poses together. Fade
  shadows with artwork opacity; keep fold occlusion and layer ordering intact.
- Add a per-group light override to the rendering options and use the same light
  for shadow projection. It must not change lighting on unrelated stickers, and
  it must restore uniforms after peel depth passes and each draw.
- The playback controller supplies elapsed time from the animation-frame
  timestamp. Pause/resume and seeking update this clock, not the saved poses.
  Pause on a hidden tab to avoid returning midway through an unexpected jump.
- Normal dragging or resizing pauses the selected group's clip at its neutral
  base pose before editing; play resumes from Restart explicitly. Pose-authoring
  gestures edit the selected draft endpoint instead of the base layout.
- Finish or cancel an authoring session before selection changes, compare mode,
  cutout editing, deletion, or resizing can change its target. Preserve draft
  changes on a normal target switch; show Apply / Discard / Keep editing only
  when that target is actually being left. Escape always cancels the session.

5. Preview and export use the same sampling path

Both the authoring preview and custom-motion exports call `sampleGroup()` at an
explicit time. They share camera/projection and lighting conventions; output
resolution only changes viewport scale. Use the same sampled pose for picking
and editing guides so controls follow the artwork seen by the user.

Compute one fixed export crop for the whole clip from the transformed subtree,
including tilt, scale overshoot, opacity transitions, peel, and shadows. Combine
conservative transform limits with samples at endpoints, easing extrema, phase
boundaries, and export times. Do not refit each frame, which would make the
sticker appear to zoom. Show this framing in an Export preview option.

- GIF and APNG include the authored timing, group motion, and light sweep.
- Animated SVG uses rendered frames for custom clips, as it already does for
  shader effects. Keep the existing lighter SVG path for unaffected presets.
- Honor Once / Loop in each encoder, including the final pose and endpoint hold.
  Existing exports retain their current default looping behavior.
- Keep the current standard / high-quality export choices. Use exact frame
  timing compatible with each format; sample loop frames without duplicating the
  endpoint. Keep a sufficient final hold for Once exports.
- Render frames lazily and release buffers. Do not cache a full high-resolution
  clip merely to scrub it. Reuse textures and render only the requested frame.
- Current-pose PNG captures the chosen playhead state; flat PNG retains its
  established flat-artwork behavior. Guides and transport never enter exports.
- Clip recording samples authored motion rather than the legacy automatic sweep.
  Capture a fixed-duration video, pause unrelated editing during capture, abort
  if the tab hides, restore state in cleanup, and match the filename to the MIME
  type actually produced. Browser recording may drop frames; deterministic
  GIF/APNG export is the first fidelity target.

Guaranteed MP4 encoding, Instagram integration, audio, editable curved paths,
additional keyframes, and a scene-wide multitrack timeline are later work. Keep
the architecture open to them without making them prerequisites for this release.

6. Delivery order

| Stage | Deliverable | Gate before proceeding |
| --- | --- | --- |
| A | Pure clip evaluator, validation, easing, and clock | Seeking to the same time always yields the same result; loop boundaries and full turns pass |
| B | Canvas preview, group transforms, and per-group light | Decorated photo/frame behaves identically at fixed times; unrelated art is unchanged |
| C | Motion panel, Start/End editing, recipes, transport, history | Apply/Cancel, local undo, keyboard/touch, locks, reduced motion, and both languages pass |
| D | Export integration, bounds, lifetime handling, data round trips | Decoded exports match sampled previews; no clipping, stale draft, or scene mutation |
| E | Visual polish, guide, and regression review | Existing animations, peel, lenticular, comparison, and resize checks remain green |

First reviewable slice: a decorated sticker with Slide & shine, two draggable
poses, a four-second scrubber, and a GIF/APNG export matching the preview. Finish
that complete slice before adding the other recipes and timing controls.

7. Expected files

- New `js/motion.js`: clip schema, pure evaluation, easing, and shared group pose.
- New `js/motion-designer.js`: draft session, timeline controls, and pose authoring.
- `js/scene.js`: playback clock, rendering integration, picking, snapshots, and exports.
- `js/renderer.js`: per-group light override and matching shadow/opacity handling.
- `js/app.js`: history, lifecycle, copying, validation, duplication, serialization.
- `js/anim.js`: Once / Loop handling and custom-motion frame exports.
- `js/ui.js`, `js/objects.js`, `js/transform.js`: entry point and gesture ownership.
- `index.html`, `styles.css`, `js/i18n.js`, `js/tour.js`, `README.md`: layout and guidance.
- New `test/motion-designer.mjs` plus pure timing tests: behavioral and pixel checks.

8. Acceptance examples

- A frame with a photo and two nested icons scales, rotates, fades, and peels as
  one group at every playhead time; no icon lag or detached shadow appears.
- Scrub 3 s > 1 s > 3 s: both 3 s renders match. Compare playback at 30, 60, and
  120 Hz using equal timestamps, including pause/resume and skipped frames.
- Start and end of Loop have matching poses, surface states, image phases,
  lighting, and opacity. Smooth easing has no visible seam or velocity snap.
- Applying is one canvas Undo step. Cancel, export failure, hidden-tab capture,
  pointer cancellation, and target deletion leave no temporary state behind.
- Moving/resizing the base artwork, duplicating it, replacing its image, copying
  its motion, and reloading an eligible share link preserve the intended clip.
- Decode real GIF/APNG outputs and compare selected frames with the normalized
  preview, allowing GIF palette loss. Verify duration, repeat behavior, coverage,
  edge clipping, soft alpha where supported, and absence of editor guides.
- Test mobile touch and keyboard controls in English and Traditional Chinese,
  including an offscreen or fully transparent endpoint that can still be recovered
  through its authoring outline and numerical pose controls.

Timing references: the stateless sampling approach follows the separation of
timing and effects described in the [W3C Web Animations timing model](https://www.w3.org/TR/web-animations-1/#timing-model).
Live playback uses timestamp-based progression, consistent with
[requestAnimationFrame guidance](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).
These are design references; the implementation remains in our WebGL renderer.
