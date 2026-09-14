# PIKNIK icons

**Icons → PIKNIK** offers 377 transparent illustrations in 39 collections.
Filter by collection, or search in English / Traditional Chinese. Click to add;
Shift-click keeps the tray open. Icons attach to selected stickers and frames,
support undo/redo and duplication, and are included in image/animation exports
and shared scenes. Original colors are preserved; use materials, borders,
rotation, scale, and animation to style the result.

Artwork: **PIKNIK / 日日野餐**. Product source links are retained for each collection
in `manifest.json`. The source images were supplied locally from the user's
`piknik-day/new-arrival` collection. Original characters, lettering, and designs
remain the work of their respective artists and rights holders.

The illustrated sheets were enlarged **4× using waifu2x-ncnn-vulkan**, with
`models-cunet` and noise level `1`, before separating the designs and removing
the connected white background. Pale details and enclosed white artwork remain
opaque. This enlarges the supplied raster art; it does not turn it into vectors.

Full-size transparent PNGs are used for the canvas and exports. Lossless WebP
thumbnails (up to 128 px) keep the picker lightweight. `provenance.json` records
the original relative file path, original SHA-256, and crop bounds at 4× for every
PNG. Original sheets and product photography are not required by the website.

The two shoe-buckle folders repeat illustrations in the everyday Taiwan and
Lunar New Year sets, so those designs share the existing collections. The
27 shop signs use their complete illustrated index (`03.jpg`); the other sets
use the unobscured illustrations in `01.jpg`.

## Reproduce the import

1. Read the local source `manifest.json` in its original order. Copy the first
   artwork sheet for each collection into a separate working directory, naming
   it `01.jpg` through `41.jpg`. For collection 4 also copy `03.jpg` as
   `04_signs.jpg`.
2. Enlarge the sheets with waifu2x, preserving the source copies:

   ```text
   waifu2x-ncnn-vulkan -i 02.jpg -o 02_waifu2x_4x.png -s 4 -n 1 -m models-cunet -f png -t 0
   ```

   The enlarged sign sheet must be named `04_signs_waifu2x_4x.png`.
3. With Pillow, numpy, and scipy installed, run the importer to check dimensions,
   collection counts, and extraction bounds before it writes any bundled assets:

   ```text
   python scripts/import-piknik.py <new-arrival-folder> --upscaled <enlarged-folder> --audit <review-folder>
   ```

4. Inspect the numbered bounding-box previews. Repeat with `--write` to generate
   the PNGs, thumbnails, catalog, and provenance. This writes inside this repo;
   it never modifies the supplied source collection.

`node test/piknik.mjs` checks every asset's transparency and dimensions, rendering
across all collections, search/filter interaction, history, attachments,
PNG/APNG/GIF export, shared scenes, and desktop/mobile Chinese layouts.
Use the same `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH` overrides as
the other browser tests if Playwright is not on the default module path.
