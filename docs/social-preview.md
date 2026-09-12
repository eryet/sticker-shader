# Page metadata and link preview

The metadata lives directly in `index.html` so a link crawler can read it without
running the editor. The page title and description use the existing English and
Traditional Chinese language switch. Open Graph and X card text stays in English
to match the shared artwork; there are no separate language URLs.

- Title: **Sticker Shader Editor | Holographic Sticker Maker**
- Description: **Create holographic stickers from your images. Play with materials,
  frames and cute icons, animate your designs, and export them right in your browser.**
- Image: `assets/social-preview.png`, 1200 × 630 pixels.
- Editable artwork: `assets/social-preview.svg`, using the Prism Pop logo and
  the editor's pastel colours. The PNG contains the final rendered text.

The public HTTPS address still needs to be confirmed. Before publishing, use it
for the canonical link, `og:url`, and absolute `og:image` / `twitter:image` URLs.
The image references currently resolve relative to the page for local preview.
Publish the PNG with the page, and verify that both URLs can be fetched without a
sign-in. A password-protected page cannot provide a public link preview.

To regenerate the PNG after editing the artwork:

```sh
node scripts/render-social-preview.mjs
```

The script uses Playwright Chromium, with the same optional `PLAYWRIGHT_MODULE`
and `PLAYWRIGHT_EXECUTABLE_PATH` overrides as the browser checks. Trebuchet MS is
used when available, with Arial and sans-serif fallbacks; visually review any
render from a different system before replacing the checked-in PNG. No rendering
script or browser dependency is needed to serve the finished image.

The image type, dimensions, alternative text and page fields follow the
[Open Graph metadata specification](https://ogp.me/). After changing the artwork,
use a new image filename in both card tags if a sharing service keeps showing its
cached version.
