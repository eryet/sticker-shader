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
const categories = { pixels: 'Pixel gifs', tiny: 'Tiny', stamps: 'Stamps', blinkies: 'Blinkies', dividers: 'Dividers & banners', buttons: 'Site buttons', cursor: 'Cursors', bg: 'Backgrounds', halloween: 'Halloween' };
const groups = [], copies = [], credits = [];

for (const [folder, collection] of [['', 'Cinnamoroll'], ['kuromi', 'Kuromi']]) {
  const base = path.join(source, folder), parsed = new Map();
  let category;
  for (const line of fs.readFileSync(path.join(base, 'js/collection.js'), 'utf8').split(/\r?\n/)) {
    const heading = /^  (\w+): \[$/.exec(line);
    if (heading) { category = heading[1]; parsed.set(category, []); continue; }
    if (!/^\s*\{ src:/.test(line)) continue;
    if (!categories[category]) throw new Error('Unknown category: ' + category);
    const item = {};
    for (const match of line.matchAll(/\b(src|w|h|anim|credit|link):\s*(?:'((?:\\.|[^'\\])*)'|(\d+))/g)) {
      item[match[1]] = match[2] === undefined ? Number(match[3]) : match[2].replace(/\\(['\\])/g, '$1');
    }
    if (!item.src?.startsWith(`img/${category}/`) || !item.w || !item.h) throw new Error('Invalid item: ' + line);
    const input = path.resolve(base, item.src);
    if (!input.startsWith(path.resolve(base, 'img') + path.sep)) throw new Error('Asset outside collection');
    item.src = ['pixels', folder, item.src.slice(4)].filter(Boolean).join('/');
    copies.push({ input, output: path.join(root, item.src) });
    parsed.get(category).push(item);
  }
  for (const category of Object.keys(categories)) {
    const items = parsed.get(category); if (!items?.length) continue;
    groups.push({ id: folder ? `${folder}-${category}` : category, title: categories[category], collection, category, items });
  }
  const listed = new Set(copies.filter(c => c.input.startsWith(path.resolve(base, 'img') + path.sep)).map(c => c.input));
  for (const relative of fs.readdirSync(path.join(base, 'img'), { recursive: true })) {
    if (/\.(gif|png|webp|jpe?g|svg|avif)$/i.test(relative) && !listed.has(path.resolve(base, 'img', relative))) throw new Error('Unlisted source asset: ' + relative);
  }
  credits.push(`${collection}\n${'='.repeat(collection.length)}\n\n` + fs.readFileSync(path.join(base, 'img/CREDITS.txt'), 'utf8').replace(/^img\//gm, folder ? `pixels/${folder}/` : 'pixels/'));
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
