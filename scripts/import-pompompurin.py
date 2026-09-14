"""Import original Pompompurin files; requires Pillow and BeautifulSoup4.

Run from any directory: python scripts/import-pompompurin.py
Images are saved byte-for-byte, including all original animation frames.
"""
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, NavigableString
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PAGE = 'https://sakuradreams.neocities.org/Pages/Purin'
CATEGORIES = {
    'Tiny Pixels': ('tiny', 'Tiny'),
    'Larger Pixels': ('pixels', 'Pixel gifs'),
    'Templates': ('stationery', 'Note cards'),
    'Blinkies': ('blinkies', 'Blinkies'),
    'Stamps': ('stamps', 'Stamps'),
}
TITLES = dict(CATEGORIES.values()) | {'dividers': 'Dividers & banners', 'cursor': 'Cursors'}


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'StickerShaderArtworkImport/1.0'}), timeout=30) as response:
        return response.read()


def main():
    page_bytes = fetch(PAGE)
    soup = BeautifulSoup(page_bytes, 'html.parser')
    candidates, category = [], None
    for node in soup.select_one('main').descendants:
        if isinstance(node, NavigableString):
            if node.strip() in CATEGORIES:
                category = CATEGORIES[node.strip()][0]
        elif node.name == 'img':
            url = urljoin(PAGE, node['src'])
            name = Path(urlparse(url).path).name
            if not name.startswith('Purin'):
                continue
            group = 'dividers' if 'Divider' in name else category
            if not group:
                raise ValueError(f'Unclassified image: {url}')
            anchor = node.find_parent('a')
            candidates.append({'category': group, 'source': url, 'link': urljoin(PAGE, anchor['href']) if anchor else PAGE,
                               'credit': node.get('title', '')})
    # Include the character cursor referenced by the page, excluding its generic plaid background.
    cursor = 'https://sakuradreams.neocities.org/Images/PurinCursor.png'
    if cursor in page_bytes.decode('utf-8'):
        candidates.append({'category': 'cursor', 'source': cursor, 'link': PAGE, 'credit': ''})
    if set(c['category'] for c in candidates) != set(TITLES):
        raise ValueError('Source categories changed; review the page before importing')

    def download(candidate):
        raw = fetch(candidate['source'])
        with Image.open(io.BytesIO(raw)) as image:
            w, h = image.size
            frames = getattr(image, 'n_frames', 1)
            for frame in range(frames):
                image.seek(frame)
                image.load()
        return candidate, raw, w, h, frames

    # Finish downloading and validating every image before changing the catalog.
    with ThreadPoolExecutor(max_workers=4) as pool:
        downloaded = list(pool.map(download, candidates))
    groups, provenance, seen = {}, [], set()
    for candidate, raw, w, h, frames in downloaded:
        sha = hashlib.sha256(raw).hexdigest()
        if sha in seen:
            continue
        seen.add(sha)
        category = candidate['category']
        name = Path(urlparse(candidate['source']).path).name
        src = f'pixels/pompompurin/{category}/sk_{name}'
        item = {'src': src, 'w': w, 'h': h, 'anim': int(frames > 1), 'link': candidate['link']}
        if candidate['credit']:
            item['credit'] = candidate['credit']
        groups.setdefault(category, []).append(item)
        target = ROOT / src
        if target.exists() and target.read_bytes() != raw:
            raise ValueError(f'Existing artwork differs: {src}')
        provenance.append({**candidate, 'src': src, 'sha256': sha, 'bytes': len(raw), 'frames': frames})

    for entry in provenance:
        raw = next(raw for c, raw, *_ in downloaded if c['source'] == entry['source'])
        target = ROOT / entry['src']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
    manifest_path = ROOT / 'pixels/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['groups'] = [g for g in manifest['groups'] if g['collection'] != 'Pompompurin'] + [
        {'id': f'pompompurin-{category}', 'title': TITLES[category], 'collection': 'Pompompurin', 'category': category, 'items': items}
        for category, items in groups.items()
    ]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    (ROOT / 'pixels/pompompurin/provenance.json').write_text(json.dumps({
        'collection': 'Pompompurin', 'page': PAGE, 'pageSha256': hashlib.sha256(page_bytes).hexdigest(),
        'processing': 'Original image bytes, dimensions and animation frames retained. Exact duplicates omitted.',
        'items': provenance,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    credits_path = ROOT / 'pixels/CREDITS.txt'
    marker = '\n\nPompompurin\n-----------\n'
    credits = credits_path.read_text(encoding='utf-8').split(marker)[0].rstrip()
    lines = [f'Collected via: {PAGE}', 'Pompompurin character copyright: Sanrio.',
             'Original artwork is unchanged. Artist names and links are retained where supplied by the collection.',
             'Collector attribution is not proof of authorship or a reuse license; unlisted original artists are unknown.', '']
    for entry in provenance:
        lines.extend([entry['src'], f"  Original file: {entry['source']}",
                      f"  Credit: {entry['credit'] or 'Original artist not identified by source'}",
                      f"  Credit page: {entry['link']}", ''])
    credits_path.write_text(credits + marker + '\n' + '\n'.join(lines), encoding='utf-8')
    print(json.dumps({'items': len(provenance), 'animated': sum(e['frames'] > 1 for e in provenance),
                      'bytes': sum(e['bytes'] for e in provenance), 'categories': {k: len(v) for k, v in groups.items()}}))


if __name__ == '__main__':
    main()
