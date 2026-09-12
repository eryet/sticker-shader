// Import the complete local goodies collections without executing their page scripts.
// Usage: node scripts/import-goodies.mjs /path/to/cinnamoroll
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const source = process.argv[2] && path.resolve(process.argv[2]);
if (!source) throw new Error('Usage: node scripts/import-goodies.mjs /path/to/cinnamoroll');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const categories = { pixels: 'Pixel gifs', tiny: 'Tiny', stamps: 'Stamps', blinkies: 'Blinkies', dividers: 'Dividers & banners', buttons: 'Site buttons', cursor: 'Cursors', bg: 'Backgrounds', halloween: 'Halloween', banners: 'Banners', badges: 'Badges', counters: 'Counter digits', seasonal: 'Seasonal', stationery: 'Note cards' };
const groups = [], copies = [], credits = [];

for (const [folder, collection] of [['', 'Cinnamoroll'], ['kuromi', 'Kuromi'], ['keroppi', 'Keroppi'], ['hello-kitty', 'Hello Kitty']]) {
  const base = path.join(source, folder), parsed = new Map();
  const previews = new Set();
  const add = (category, original) => {
    if (!Object.hasOwn(categories, category)) throw new Error('Unknown category: ' + category);
    const item = Object.fromEntries(['src', 'w', 'h', 'anim', 'credit', 'link'].filter(key => original[key] != null).map(key => [key, original[key]]));
    if (!item.src?.startsWith(`img/${category}/`) || !Number.isInteger(item.w) || item.w <= 0 || !Number.isInteger(item.h) || item.h <= 0) throw new Error('Invalid item: ' + JSON.stringify(original));
    const input = path.resolve(base, item.src);
    if (!input.startsWith(path.resolve(base, 'img', category) + path.sep)) throw new Error('Asset outside category');
    if (original.sha256 && original.sha256 !== digest(input)) throw new Error('Source checksum mismatch: ' + input);
    item.src = ['pixels', folder, item.src.slice(4)].filter(Boolean).join('/');
    copies.push({ input, output: path.join(root, item.src) });
    if (!parsed.has(category)) parsed.set(category, []);
    parsed.get(category).push(item);
  };
  const manifestFile = path.join(base, 'manifest.json');
  if (fs.existsSync(manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (manifest.character !== collection || !Array.isArray(manifest.items) || manifest.items.length !== manifest.count) throw new Error('Invalid source manifest: ' + manifestFile);
    for (const item of manifest.items) {
      add(item.category, item);
      // The editor plays the original GIFs; gallery-only still previews are not bundled.
      if (item.still) {
        const preview = path.resolve(base, item.still);
        if (!preview.startsWith(path.resolve(base, 'img/previews') + path.sep)) throw new Error('Preview outside preview folder');
        previews.add(preview);
      }
    }
  } else {
    let category;
    for (const line of fs.readFileSync(path.join(base, 'js/collection.js'), 'utf8').split(/\r?\n/)) {
      const heading = /^  (\w+): \[$/.exec(line);
      if (heading) { category = heading[1]; continue; }
      if (!/^\s*\{ src:/.test(line)) continue;
      const item = {};
      for (const match of line.matchAll(/\b(src|w|h|anim|credit|link):\s*(?:'((?:\\.|[^'\\])*)'|(\d+))/g)) {
        item[match[1]] = match[2] === undefined ? Number(match[3]) : match[2].replace(/\\(['\\])/g, '$1');
      }
      add(category, item);
    }
  }
  for (const category of Object.keys(categories)) {
    const items = parsed.get(category); if (!items?.length) continue;
    groups.push({ id: folder ? `${folder}-${category}` : category, title: categories[category], collection, category, items });
  }
  const listed = new Set(copies.filter(c => c.input.startsWith(path.resolve(base, 'img') + path.sep)).map(c => c.input));
  for (const relative of fs.readdirSync(path.join(base, 'img'), { recursive: true })) {
    const input = path.resolve(base, 'img', relative);
    if (/\.(gif|png|webp|jpe?g|svg|avif)$/i.test(relative) && !listed.has(input) && !previews.has(input)) throw new Error('Unlisted source asset: ' + relative);
  }
  credits.push(`${collection}\n${'-'.repeat(collection.length)}\n\n` + fs.readFileSync(path.join(base, 'img/CREDITS.txt'), 'utf8').replace(/^img\//gm, folder ? `pixels/${folder}/` : 'pixels/'));
}
if (new Set(copies.map(c => c.output)).size !== copies.length) throw new Error('Duplicate destination paths');
// Validate existing artwork before copying or updating the catalog.
for (const c of copies) if (fs.existsSync(c.output) && digest(c.input) !== digest(c.output)) throw new Error('Existing artwork differs: ' + c.output);
let added = 0;
for (const c of copies) {
  if (fs.existsSync(c.output)) continue;
  fs.mkdirSync(path.dirname(c.output), { recursive: true }); fs.copyFileSync(c.input, c.output); added++;
}
fs.writeFileSync(path.join(root, 'pixels/manifest.json'), JSON.stringify({ v: 1, credits: 'pixels/CREDITS.txt', groups }, null, 1) + '\n');
fs.writeFileSync(path.join(root, 'pixels/CREDITS.txt'), 'Pixel goodies — original source and artist credits\n\nAsset paths below refer to this editor. Original credit text is retained.\n\n' + credits.join('\n\n').trimEnd() + '\n');
console.log(`Imported ${added} new files; ${copies.length} total goodies across ${groups.length} groups.`);
