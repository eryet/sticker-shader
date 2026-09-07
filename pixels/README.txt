pixels/ — the Pixel tab of the sticker tray.

manifest.json lists 606 goodies: 496 Cinnamoroll and 110 Kuromi, across 17 groups.
Each group has a collection, category and title; entries are { src, w, h, anim?, credit?, link? }.
Add a picture by dropping it in a group folder and adding a line to the manifest,
or import the complete local fan-site collection:
  node scripts/import-goodies.mjs /path/to/cinnamoroll
The importer preserves existing files and the original artist credits. Kuromi assets
live in pixels/kuromi/ so existing Cinnamoroll paths and share links keep working.
Animated GIFs and WebPs keep their animation on the canvas (up to 16 frames).
The Pixel tab filters by collection and type; search works in English and Chinese.
Blinkies, stamps, dividers, site buttons and backgrounds preserve their source colors
and transparency. Fine dividers, cursors, buttons and backgrounds start without an
extra outline or border. Background tiles and cursor graphics are added as decorations.

These are fan-collected 2000s Cinnamoroll and Kuromi graphics (sources in CREDITS.txt);
characters are © Sanrio Co., Ltd. Personal, non-commercial use only.
