/* A read-only feature tour: reveal existing UI, then restore its layout on exit. */
window.StickerTour = (() => {
  'use strict';
  const KEY = 'sticker-shader-editor:tour:v1';
  const STEPS = [
    { id: 'welcome', chapter: 'Welcome', title: 'Your little sticker studio', preview: 'frames',
      text: 'Turn a photo into a sticker, dress it up, and make it move. This guide shows what you can create and where to find every tool.',
      points: ['Follow the highlights, or jump straight to a feature.', 'Your artwork stays as it is. Close the guide whenever you want.'] },
    { id: 'import', chapter: 'Start with an image', title: 'Drop it in. Make it yours.', targets: ['.image-start'],
      text: 'Add images, drag files onto the canvas, or paste from your clipboard. You can import several images together.',
      points: ['Auto cutout is the default: it removes the background.', 'Whole image keeps the full picture and its transparency.', 'Try a sample lets you explore without choosing a file.'] },
    { id: 'canvas', chapter: 'Arrange your stickers', title: 'Everything lives on the canvas', targets: ['#stage'],
      text: 'Select a sticker to edit it, then drag it into place. The floating toolbar gives you Duplicate, Rotate, Flip, and Delete.',
      points: ['Scroll over a sticker to resize; Shift + scroll rotates.', 'On touch screens, pinch to resize and twist to rotate.', 'The rotation dial supports full turns and exact degree entry.'] },
    { id: 'cutout', chapter: 'Shape your image', title: 'Keep exactly the parts you love', targets: ['#editTools', '#btnEdit'], preview: 'tools',
      text: 'Select a photo and open Edit cutout to refine its silhouette by hand.',
      points: ['Erase and Restore have brush presets, size, hardness, and strength.', 'Lasso an area to erase, restore, or keep only that area. Feather softens its edge.', 'Colour key removes a connected colour. Zoom, pan, preview the mask, and undo each edit.'] },
    { id: 'edges', chapter: 'Shape your image', title: 'Clean edges, or keep the original', group: 'cutout', targets: ['[data-group="cutout"]', '#btnEdit'],
      text: 'The Cutout section controls automatic edge cleanup: working resolution, edge snapping, feathering, smoothing, and growing or shrinking the outline.',
      points: ['Fill holes or remove small fragments from an automatic cutout.', 'Manual edits keep the edges you draw.', 'Restore original keeps the whole image; Remove background starts a cutout again.'] },
    { id: 'frames', chapter: 'Decorate', title: 'Give your picture a new home', group: 'frame', details: '.frame-collection', targets: ['.frame-gallery', '#btnFrame'], preview: 'frames',
      text: 'Add a frame, then use Discover frames or Style to browse cards, suitcases, capsules, arcades, snow globes, and more.',
      points: ['Style applies a coordinated look; Design changes the shape.', 'Drop a sticker into its window, or choose one under Photo.', 'Edit the caption, small line, lettering, colours, patterns, and photo zoom or position.'], tab: 'propertiesTab' },
    { id: 'starters', chapter: 'Decorate', title: 'Begin with a ready-made scene', group: 'scene', targets: ['#btnStarters', '#btnStarterScenes'],
      text: 'Choose Start with a scene on the welcome card, or Starter scenes in the Scene section, to browse four complete compositions.',
      points: ['Each scene adds a sample photo, frame, and matching decorations. Your other artwork stays on the canvas.', 'Select the frame and use Replace photo in Properties to add your own image.', 'Undo removes the whole starter scene in one step.'] },
    { id: 'pass', chapter: 'Decorate', title: 'Make a conference pass', group: 'pass', targets: ['[data-group="pass"]', '#ctl-frameDesign', '#btnFrame'],
      text: 'Add a built-in frame, then choose Conference pass under Design in Properties.',
      points: ['The Conference pass section edits the event, attendee, organization, role, and date or location.', 'Use the frame controls for the photo, colours, and patterns.'] },
    { id: 'artwork', chapter: 'Decorate', title: 'Bring your own artwork', targets: ['#btnArtwork'],
      text: 'Open My artwork, then choose Import icons or Import frames. PNG, WebP, JPG, and GIF files are supported, up to 20 MB each.',
      points: ['Imported icons keep their animation; imported frames use the first image.', 'Click a library thumbnail to add another copy. Removing it from the library keeps copies already on the canvas.', 'The library is saved in this browser when storage is available; otherwise, imports last for this session.'] },
    { id: 'custom-frame', chapter: 'Decorate', title: 'Fit a photo into your own frame', group: 'frame', targets: ['#ctl-frameOpening', '[data-group="frame"]', '#btnArtwork'],
      text: 'Select an imported frame and open Properties. Photo opening uses its largest enclosed transparent area.',
      points: ['Choose Adjustable rectangle to create an opening or change its position and size.', 'Drop a photo sticker into the window, or choose it under Photo. Adjust Photo zoom and Photo shift X / Y to fit.', 'Your imported drawing stays as supplied; built-in frame captions, designs, and palettes do not edit it.'] },
    { id: 'icons', chapter: 'Decorate', title: 'A whole drawer of little goodies', menu: 'iconMenuWrap', targets: ['#iconMenu'], preview: 'icons',
      text: 'Open Icons to search the collections or browse their category tabs.',
      points: ['Add drawn icons, pixel art, blinkies, and animated goodies.', 'Type an emoji or a short word to turn it into a sticker.', 'Kaomoji are text-only faces, ready to place anywhere.'] },
    { id: 'icon-style', chapter: 'Decorate', title: 'Make each icon your own', group: 'icon', targets: ['[data-group="icon"]', '#iconMenuWrap summary'],
      text: 'Select an icon and open Properties. Built-in drawn icons have palette, colour, and outline controls; all icons have size, rotation, and motion controls.',
      points: ['Text-based icons have editable text.', 'Supported faces can blink or change their expression settings.', 'Each icon can have its own animation, speed, and amount.'] },
    { id: 'attach', chapter: 'Decorate', title: 'Keep decorations together', targets: ['#objectToolbar', '#iconMenuWrap summary'],
      text: 'Select a photo or frame before adding icons to stick them together. You can also drag an icon onto its parent.',
      points: ['Attached icons follow the parent when it moves or changes size.', 'Use Attach / Detach, or drag the icon away, to separate it.', 'Animated exports include the selected item’s attached icons.'] },
    { id: 'material', chapter: 'Colour & finish', title: 'Choose what your sticker is made of', group: 'material', targets: ['[data-group="material"]'],
      text: 'Select an item, open Properties, then expand Material. Choose printed vinyl, clear or frosted glass, acrylic, resin, puffy vinyl, embroidery, brushed metal, or textured paper.',
      points: ['Compare materials opens a divider over your canvas. Drag it to compare the original with a preview, then Apply material or Cancel.', 'Try iridescent film, candy jelly, glazed ceramic, velvet, and carbon fiber. Adjust Texture strength, Texture size, and Material tint to make each look your own.', 'Base opacity changes the material; Artwork opacity fades the printed image. Frosted glass adds a milky texture without blurring the backdrop.', 'Finish layers Natural, Matte, Gloss, Holographic, Pearlescent, or Glitter over your material.'] },
    { id: 'presets', chapter: 'Colour & finish', title: 'Try a finish in one click', targets: ['.preset:has(#presetSelect)'],
      text: 'The top Preset menu applies a ready-made look, such as Soft gloss, Holographic, Chrome, or Paper cute. It keeps the base material chosen in Properties.',
      points: ['Start with a preset, then fine-tune it in Properties.', 'Material presets keep your chosen lighting comfort and gradient border colours.'] },
    { id: 'border', chapter: 'Colour & finish', title: 'A border with personality', group: 'border', targets: ['[data-group="border"]'], preview: 'palette',
      text: 'Choose a classic solid border, a linear or radial gradient, a conic colour ring, or Rainbow RGB.',
      points: ['Colour sets give you Candy, Ice, Sunset, Aurora, Neon RGB, and Rainbow.', 'Adjust the width, custom colour stops, and gradient angle.', 'Foil and bevel controls add a finish to the edge.'] },
    { id: 'colour', chapter: 'Colour & finish', title: 'Pick the exact colour', group: 'border', targets: ['#ctl-borderColor-picker', '#ctl-borderColor2-picker', '[data-group="border"]'], preview: 'palette',
      text: 'Click any colour swatch to open the colour picker. Choose visually, enter an exact hex or RGB value, or reuse a recent colour.',
      points: ['The palette and recent swatches make matching colours quick.', 'Use the eyedropper to sample your screen when your browser supports it.', 'Colours update live; the original swatch restores the opening colour.'] },
    { id: 'lighting', chapter: 'Colour & finish', title: 'Keep the shine comfortable', group: 'lighting', targets: ['[data-group="lighting"]'],
      text: 'Shine strength adjusts foil, glitter, and reflections together. Lower it for a softer look; 0% removes the shine.',
      points: ['Gentle highlights soften bright peaks and keep printed details readable.', 'Light follows cursor controls how much the light moves with your pointer.'] },
    { id: 'finish', chapter: 'Colour & finish', title: 'Foil, sparkle, paper, and shadow', group: 'foil', targets: ['[data-group="foil"]'],
      text: 'Fine-tune Holographic foil, Glitter, and Surface below the border. Adjusting foil, glitter, gloss, rim glow, or paper grain switches Finish to Custom / preset.',
      points: ['Explore holographic foils compares prismatic shards, aurora ribbons, cracked ice, star confetti, and diffraction rings on your canvas. They keep your current material.', 'Fine-tune the foil texture, scale, angle, colour spread, and shimmer, or choose a ready-made foil from Preset.', 'Glitter and Surface: flakes, gloss, rim glow, paper grain, and printed colour.', 'Shadow: opacity, softness, spread, and lift from the canvas.'] },
    { id: 'animation', chapter: 'Bring it to life', title: 'Let your stickers move', group: 'motion', targets: ['.control:has(#ctl-anim)'], preview: 'motion',
      text: 'Choose from {count} animations plus Still, from gentle breathing to cartwheels and peekaboo. Photos, frames, and icons share the same choices.',
      points: ['Speed changes the pace; Amount changes how much it moves.', 'Hover tilt, grab lift, spring, and damping change how it feels to drag.', 'The same motions are used in animated exports.'] },
    { id: 'layers', chapter: 'Organize & reuse', title: 'Find every layer', tab: 'layersTab', targets: ['#layersPane'],
      text: 'Layers lists your stickers, frames, and icons, including which icons are attached to which parent.',
      points: ['Select an item even when another sticker covers it.', 'Lock finished items; locking a parent also protects its attached icons.', 'Move backward or forward within the same kind. Icons stay above photos and frames.'] },
    { id: 'scene', chapter: 'Organize & reuse', title: 'Set the scene', group: 'scene', targets: ['[data-group="scene"]'],
      text: 'The Scene section changes the canvas backdrop: choose a theme, colour, pattern, and pattern scale.',
      points: ['Discover backgrounds shows visual previews of the themes. Choose one, then customize its colours and pattern size.', 'The transparency grid helps you inspect transparent areas.', 'Canvas PNG includes the pattern; recorded clips use the backdrop colour.', 'Sticker PNG exports keep a transparent background.'] },
    { id: 'reuse', chapter: 'Organize & reuse', title: 'Experiment, reuse, and undo', tab: 'propertiesTab', targets: ['.panel-foot'],
      text: 'Copy settings to reuse a look on another item. Paste applies it. Reset all restores the selected item’s controls and the scene backdrop to their defaults.',
      points: ['Double-click a slider to reset just that value.', 'Undo / Redo covers movement, edits, styles, frames, and attachments.', 'Delete asks for confirmation. Cancel keeps the item; Undo brings a deletion back.'] },
    { id: 'export', chapter: 'Export & share', title: 'Choose the right download', menu: 'exportMenuWrap', targets: ['#exportMenu'],
      text: 'Export offers separate choices for the selected sticker, an animation, or the whole canvas.',
      points: ['PNG: transparent sticker, double resolution, posed image, cutout only, or a 512 × 512 sticker pack.', 'GIF, animated PNG, and animated SVG include attached icons.', 'Canvas PNG includes the backdrop. Record a 4-second WebM clip for canvas motion.'] },
    { id: 'gif-quality', chapter: 'Export & share', title: 'Give your GIF more detail', menu: 'exportMenuWrap', targets: ['#exportMenu [data-export="gif-hq"]'],
      text: 'Select the sticker, frame, or icon you want to export, then choose GIF · High quality in Export.',
      points: ['High quality renders at 1024 px and 25 fps, with a more detailed colour palette.', 'Animated GIF uses 512 px and 16 fps for a smaller download. High quality takes longer and creates larger files.', 'Both choices export a loop of the selected item with its attached icons. Use Record 4 s clip for the whole canvas.'] },
    { id: 'share', chapter: 'Export & share', title: 'Share a layout, keep photos local', menu: 'exportMenuWrap', targets: ['#exportMenu [data-export="link"]'],
      text: 'Copy share link saves built-in frames and icons, their settings, and the scene in a link. Photos and imported artwork are not included.',
      points: ['Someone opening the link can drop their own photo into the frame.', 'Use a PNG or animation when you want to share the finished photo artwork.', 'Copy to clipboard is handy for pasting a sticker into another app.'] },
    { id: 'done', chapter: 'Ready to create', title: 'Your next sticker starts here', preview: 'icons',
      text: 'Start with an image, a sample, or a frame. Add a few goodies, choose a finish, then export something you love.',
      points: ['Reopen Guide at any time to revisit a feature.', 'The EN / 中文 switch changes the editor and this walkthrough.'] },
  ];

  function create(app) {
    const $ = s => document.querySelector(s), tr = (s, p) => I18N.t(s, p);
    const dialog = $('#walkthrough'), card = $('#tourCard'), spot = $('#tourSpotlight'), jump = $('#tourJump');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0, saved = null, target = null, raf = 0, previewRaf = 0, generation = 0;
    const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const writeSeen = value => { try { localStorage.setItem(KEY, value); } catch (_) { /* Optional preference. */ } $('#tourInvite').hidden = true; };
    try { $('#tourInvite').hidden = !!localStorage.getItem(KEY); } catch (_) { $('#tourInvite').hidden = false; }

    function saveView() {
      return { tab: $('.panel-tabs [aria-selected="true"]')?.id, focus: document.activeElement, x: scrollX, y: scrollY,
        groups: [...document.querySelectorAll('.group')].map(el => [el.dataset.group, el.classList.contains('collapsed')]),
        details: [...document.querySelectorAll('details')].filter(el => !dialog.contains(el)).map(el => ({ el, id: el.id, group: el.closest('[data-group]')?.dataset.group,
          index: el.closest('[data-group]') ? [...el.closest('[data-group]').querySelectorAll('details')].indexOf(el) : -1, open: el.open })),
        scrolls: [...document.querySelectorAll('.panel, .layer-list, .menu-list, .icon-menu-body')].map(el => [el, el.scrollLeft, el.scrollTop]) };
    }
    function restoreView() {
      if (!saved) return;
      for (const [id, collapsed] of saved.groups) {
        const el = $(`[data-group="${id}"]`); if (!el) continue;
        el.classList.toggle('collapsed', collapsed); el.querySelector('.group-head')?.setAttribute('aria-expanded', String(!collapsed));
      }
      for (const d of saved.details) {
        const el = d.el.isConnected ? d.el : d.id ? $('#' + d.id) : d.group ? $(`[data-group="${d.group}"]`)?.querySelectorAll('details')[d.index] : null;
        if (el) el.open = d.open;
      }
      if (saved.tab) $('#' + saved.tab)?.click();
      for (const [el, x, y] of saved.scrolls) if (el.isConnected) el.scrollTo(x, y);
      window.scrollTo(saved.x, saved.y);
      const focus = visible(saved.focus) && !saved.focus.disabled ? saved.focus : $('#btnGuide');
      focus?.focus({ preventScroll: true }); saved = null;
    }
    function stopPreview() { cancelAnimationFrame(previewRaf); previewRaf = 0; }
    function preview(kind) {
      stopPreview(); const host = $('#tourPreview'); host.replaceChildren(); host.hidden = !kind;
      host.dataset.kind = kind || '';
      if (kind === 'frames') for (const name of ['Starlight rare', 'Bon voyage', 'Lucky capsule']) host.append(StickerDecor.frameThumbnail(name));
      if (kind === 'icons') for (const name of ['cloudface', 'bow', 'star', 'heart', 'roll']) host.append(StickerDecor.thumbnail(name, 48));
      if (kind === 'tools') for (const name of ['Erase', 'Restore', 'Lasso', 'Colour key']) { const el = document.createElement('span'); el.className = 'tour-tool'; el.textContent = tr(name); host.append(el); }
      if (kind === 'palette') { const el = document.createElement('span'); el.className = 'tour-colours'; host.append(el); }
      if (kind === 'motion') {
        const c = document.createElement('canvas'); c.width = 660; c.height = 144; c.className = 'tour-motion'; host.append(c);
        const ctx = c.getContext('2d'), sprite = StickerDecor.thumbnail('star', 100), start = performance.now();
        const draw = now => {
          ctx.clearRect(0, 0, c.width, c.height);
          ['flutter', 'boomerang', 'peekaboo'].forEach((anim, i) => {
            const t = reducedMotion.matches ? .8 : (now - start) / 1000;
            const o = StickerScene.animOffsets({ anim, animAmount: 1 }, { w: 100, h: 100 }, t);
            ctx.save(); ctx.translate(110 + i * 220 + o.ax, 72 + o.ay); ctx.rotate(-o.arot); ctx.scale(o.ascale, o.ascale); ctx.drawImage(sprite, -50, -50, 100, 100); ctx.restore();
          });
          if (dialog.open && !reducedMotion.matches) previewRaf = requestAnimationFrame(draw);
        }; draw(start);
      }
    }
    function fillJump() {
      jump.replaceChildren();
      STEPS.forEach((step, i) => { const opt = document.createElement('option'); opt.value = i; opt.textContent = `${i + 1}. ${tr(step.title)}`; jump.append(opt); });
      jump.value = index;
      StickerUI.enhanceSelect(jump);
    }
    function chooseTarget(step) { return (step.targets || []).map(selector => $(selector)).find(visible) || null; }
    function prepare(step) {
      for (const id of ['iconMenuWrap', 'exportMenuWrap']) $('#' + id).open = step.menu === id;
      if (step.group || step.tab) $('#' + (step.tab || 'propertiesTab'))?.click();
      if (step.group) { const group = $(`[data-group="${step.group}"]`); group?.classList.remove('collapsed'); group?.querySelector('.group-head')?.setAttribute('aria-expanded', 'true'); }
      if (step.details && $(step.details)) $(step.details).open = true;
      target = chooseTarget(step);
      if (target) {
        const group = target.closest('.group'); group?.classList.remove('collapsed'); group?.querySelector('.group-head')?.setAttribute('aria-expanded', 'true');
      }
    }
    function clippedRect(el) {
      const r = el.getBoundingClientRect(); let left = Math.max(8, r.left), top = Math.max(8, r.top), right = Math.min(innerWidth - 8, r.right), bottom = Math.min(innerHeight - 8, r.bottom);
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const css = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { left = Math.max(left, b.left); right = Math.min(right, b.right); }
        if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
      }
      return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    }
    function position(reveal = false) {
      if (!dialog.open) return;
      const small = innerWidth <= 960, pad = 12, gap = 18, step = STEPS[index];
      card.style.width = Math.min(380, innerWidth - pad * 2) + 'px';
      const height = card.offsetHeight;
      document.body.style.setProperty('--tour-card-height', height + 'px');
      document.body.style.setProperty('--tour-room', Math.max(100, innerHeight - height - 44) + 'px');
      if (!target?.isConnected || !visible(target)) target = chooseTarget(step);
      if (reveal && target) {
        target.scrollIntoView({ block: small ? 'start' : 'center', inline: 'nearest', behavior: 'instant' });
        if (small && !target.closest('.menu-list')) window.scrollBy(0, target.getBoundingClientRect().top - 24);
      }
      let r = target ? clippedRect(target) : null;
      let width = card.offsetWidth, x = (innerWidth - width) / 2, y = (innerHeight - height) / 2;
      if (r && small) {
        y = innerHeight - height - pad;
        r.bottom = Math.min(r.bottom, y - gap); r.height = Math.max(0, r.bottom - r.top);
      } else if (r) {
        const candidates = [
          [r.left - width - gap, r.top], [r.right + gap, r.top],
          [r.left + (r.width - width) / 2, r.bottom + gap], [r.left + (r.width - width) / 2, r.top - height - gap],
        ].map(([cx, cy]) => [Math.max(pad, Math.min(innerWidth - width - pad, cx)), Math.max(pad, Math.min(innerHeight - height - pad, cy))]);
        const overlap = ([cx, cy]) => Math.max(0, Math.min(cx + width, r.right) - Math.max(cx, r.left)) * Math.max(0, Math.min(cy + height, r.bottom) - Math.max(cy, r.top));
        [x, y] = candidates.sort((a, b) => overlap(a) - overlap(b))[0];
      }
      card.style.left = Math.round(x) + 'px'; card.style.top = Math.max(pad, Math.round(y)) + 'px';
      const showing = !!(r && r.width > 5 && r.height > 5);
      spot.hidden = !showing; dialog.classList.toggle('tour-centered', !showing);
      if (showing) Object.assign(spot.style, { left: Math.max(3, r.left - 5) + 'px', top: Math.max(3, r.top - 5) + 'px', width: (r.width + 10) + 'px', height: (r.height + 10) + 'px' });
    }
    function schedule(reveal = false) { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => position(reveal)); }
    function go(next) {
      if (!dialog.open) return;
      index = Math.max(0, Math.min(STEPS.length - 1, next)); const step = STEPS[index], token = ++generation;
      dialog.dataset.step = step.id; prepare(step);
      $('#tourChapter').textContent = tr(step.chapter); $('#tourTitle').textContent = tr(step.title);
      const count = tr('Step {n} of {total}', { n: index + 1, total: STEPS.length }); $('#tourCount').textContent = count;
      $('#tourProgressFill').style.width = ((index + 1) / STEPS.length * 100) + '%'; jump.value = index;
      const body = $('#tourBody'); body.replaceChildren(); const text = document.createElement('p');
      text.textContent = tr(step.text, { count: StickerScene.ANIMATION_OPTIONS.length - 1 }); body.append(text);
      if (step.points) { const list = document.createElement('ul'); for (const s of step.points) { const li = document.createElement('li'); li.textContent = tr(s); list.append(li); } body.append(list); }
      const context = $('#tourContext'); context.hidden = !step.group || !!app.selected || step.group === 'scene';
      context.textContent = tr('Select a photo, frame, or icon to enable its editing controls.');
      $('#tourBack').disabled = index === 0; $('#tourNext').textContent = tr(index === STEPS.length - 1 ? 'Start creating' : index === 0 ? 'Show me around' : 'Next');
      preview(step.preview); $('#tourContent').scrollTop = 0;
      $('#tourAnnounce').textContent = `${count}. ${tr(step.title)}`;
      requestAnimationFrame(() => { if (dialog.open && token === generation) position(true); });
    }
    function start() {
      if (dialog.open || document.querySelector('dialog[open]')) return;
      saved = saveView(); StickerColorPicker.close(); writeSeen('started');
      document.body.classList.add('tour-running'); fillJump(); dialog.showModal(); go(0); $('#tourTitle').focus({ preventScroll: true });
    }
    function close(completed = false) {
      if (!dialog.open) return;
      ++generation; stopPreview(); cancelAnimationFrame(raf); dialog.close();
      document.body.classList.remove('tour-running'); document.body.style.removeProperty('--tour-card-height'); document.body.style.removeProperty('--tour-room');
      writeSeen(completed ? 'completed' : 'dismissed'); restoreView();
    }
    const guideButton = $('#btnGuide'), compass = guideButton.querySelector('.guide-compass');
    function animateCompass() {
      if (reducedMotion.matches) return;
      const needle = compass.querySelector('.guide-compass-needle'), ring = compass.querySelector('.guide-compass-ring');
      const needlePose = getComputedStyle(needle).transform, ringPose = getComputedStyle(ring).transform;
      compass.getAnimations({ subtree: true }).forEach(a => a.cancel());
      const pose = (transform, offset) => ({ transform, offset, easing: 'cubic-bezier(.22,1,.36,1)' });
      needle.animate([
        pose(needlePose, 0), pose('rotate(-35deg)', .16), pose('rotate(195deg)', .55), pose('rotate(375deg)', .82), pose('rotate(360deg)', 1),
      ], { duration: 1050 });
      ring.animate([pose(ringPose, 0), pose('scale(1.13)', .3), pose('scale(.97)', .7), pose('scale(1)', 1)], { duration: 850 });
    }
    guideButton.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') animateCompass(); });
    guideButton.addEventListener('focus', () => { if (guideButton.matches(':focus-visible')) animateCompass(); });
    guideButton.addEventListener('click', () => { animateCompass(); start(); }); $('#tourInviteStart').addEventListener('click', start);
    $('#tourInviteDismiss').addEventListener('click', () => writeSeen('dismissed'));
    $('#tourClose').addEventListener('click', () => close());
    $('#tourBack').addEventListener('click', () => go(index - 1));
    $('#tourNext').addEventListener('click', () => index === STEPS.length - 1 ? close(true) : go(index + 1));
    jump.addEventListener('change', () => go(Number(jump.value)));
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        const controls = [...card.querySelectorAll('button:not(:disabled), select')].filter(el => !el.parentElement.closest('select')), i = controls.indexOf(document.activeElement);
        e.preventDefault(); controls[i < 0 ? (e.shiftKey ? controls.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
      } else if (!e.target.closest('select') && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); go(index + (e.key === 'ArrowLeft' ? -1 : 1)); }
    });
    window.addEventListener('resize', () => schedule(true)); window.addEventListener('scroll', () => schedule(), true);
    const resize = new ResizeObserver(() => schedule()); resize.observe(card);
    I18N.onChange(() => { if (dialog.open) { fillJump(); go(index); } });
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) compass.getAnimations({ subtree: true }).forEach(a => a.cancel());
      if (dialog.open) preview(STEPS[index].preview);
    });
    return { start, close, go, get active() { return dialog.open; }, get step() { return STEPS[index].id; } };
  }
  return { create, STEPS, KEY };
})();
