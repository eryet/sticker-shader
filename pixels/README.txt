pixels/ — the Pixel tab of the sticker tray.

manifest.json lists 1,068 goodies: 496 Cinnamoroll, 110 Kuromi, 141 Keroppi and 321 Hello Kitty, across 37 groups.
Each group has a collection, category and title; entries are { src, w, h, anim?, credit?, link? }.
Add a picture by dropping it in a group folder and adding a line to the manifest,
or import the complete local fan-site collection (including kuromi/, keroppi/ and hello-kitty/):
  node scripts/import-goodies.mjs /path/to/cinnamoroll
The importer preserves existing files and the original artist credits. Kuromi,
Keroppi and Hello Kitty assets live in their own subfolders so existing paths and share
links keep working. Keroppi and Hello Kitty use source manifest.json files and verify source hashes;
only original artwork is bundled, without the research gallery, still previews or ZIP.
Animated GIFs and WebPs keep their animation on the canvas (up to 16 frames).
The Pixel tab filters by collection and type; search works in English and Chinese.
Blinkies, stamps, dividers, banners, badges, counter digits, note cards, seasonal art, site buttons
and backgrounds preserve their source colors and transparency. Fine dividers, cursors,
buttons, badges, counter digits, note cards and backgrounds start without an
extra outline or border. Background tiles and cursor graphics are added as decorations.

Hello Kitty includes 286 animated GIFs and 56 note-card pieces. Note cards are printed
decorations, not editable photo-window frames. Its original artwork totals 4,463,704 bytes.

These are fan-collected Cinnamoroll, Kuromi, Keroppi and Hello Kitty graphics (sources in CREDITS.txt);
characters are © Sanrio Co., Ltd. Personal, non-commercial use only. The Keroppi and
Hello Kitty 90s / early-web label describes the style; individual creation dates remain unverified.
Source and creator credits are retained; archival availability is not a reuse license.
