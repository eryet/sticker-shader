"""Import individual PIKNIK illustrations from locally supplied artwork sheets.

First enlarge the source sheets with waifu2x (4x, cunet, noise 1), then pass
their directory with --upscaled. Original product photography is never bundled.
Requires Pillow, numpy, scipy. See assets/piknik/README.md for reproduction.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
# Catalog order matches the supplied source manifest. Repeated shoe-buckle
# artwork (19, 20) is already represented by the original illustrated sets.
COLLECTIONS = [
    (1, 'palace-museum', 'Palace Museum', '故宮聯名', 10),
    (2, 'pandas', 'Pandas', '熊貓', 12),
    (3, 'flowers', 'Flowers', '花卉', 12),
    (4, 'taiwan-signs', 'Taiwan shop signs', '台灣招牌', 27),
    (5, 'fat-cats', 'Fat cats', '胖貓姿態', 12),
    (6, 'cat-friends', 'Cat friends', '貓咪與小物', 12),
    (7, 'forest-animals', 'Forest animals', '森林動物', 12),
    (8, 'zodiac-animals', 'Zodiac animals', '十二生肖', 12),
    (9, 'dinosaurs', 'Dinosaurs', '奇幻恐龍', 12),
    (10, 'hakka', 'Hakka culture', '客家文化', 12),
    (11, 'snack-time', 'Snack time', '零食派對', 14),
    (12, 'christmas', 'Christmas', '聖誕節', 12),
    (13, 'yilan', 'Yilan treats', '宜蘭美食', 12),
    (14, 'fruit', 'Fruit', '水果', 12),
    (15, 'dragon-boat', 'Dragon Boat Festival', '端午節', 12),
    (16, 'sleeping-cats', 'Sleeping cats', '睡覺丸貓', 6),
    (17, 'box-cats', 'Cats in boxes', '箱子貓', 12),
    (18, 'taiwan-wildlife', 'Taiwan wildlife', '台灣石虎與黑熊', 4),
    (21, 'taiwan-everyday', 'Everyday Taiwan', '台灣日常', 12),
    (22, 'sauces', 'Sauces', '台式醬料', 6),
    (23, 'wheel-cakes', 'Wheel cakes', '車輪餅', 4),
    (24, 'japan-festival', 'Japanese festival', '日本祭典', 12),
    (25, 'jiangshi', 'Jiangshi', '殭屍', 9),
    (26, 'lunar-new-year', 'Lunar New Year', '過年春福', 12),
    (27, 'new-year-treats', 'New Year treats', '過年喜慶', 8),
    (28, 'horror-night', 'Horror night', '恐怖電影', 12),
    (29, 'yokai', 'Japanese yokai', '日本妖怪', 9),
    (30, 'halloween', 'Halloween', '萬聖節', 9),
    (31, 'dogs', 'Dogs', '狗狗', 9),
    (32, 'japan', 'Little Japan', '日本小物', 9),
    (33, 'cat-faces', 'Cat faces', '貓咪臉', 8),
    (34, 'picnic', 'Picnic food', '野餐美食', 10),
    (35, 'planets', 'Rainbow planets', '彩虹星球', 9),
    (36, 'sushi', 'Sushi', '壽司', 8),
    (37, 'rice-cookers', 'Rice cookers & mailboxes', '電鍋與郵筒', 4),
    (38, 'eggs-and-meat', 'Eggs & meat', '蛋與肉', 4),
    (39, 'bees', 'Bees', '蜜蜂', 2),
    (40, 'traffic', 'Traffic', '交通號誌', 2),
    (41, 'capsule-machines', 'Capsule machines', '扭蛋機', 2),
]
NAMES = {
    'palace-museum': 'Jade cabbage|Meat shaped stone|Bronze cauldron|Tree sculpture|Chicken cup|Inkstone|Paired figures|Bronze ox|Blue vase|Jade dragon',
    'pandas': 'Panda and cub|Rolling panda|Tree climbing panda|Sitting panda|Upside down panda|Bamboo snack panda|Panda carrying cub|Relaxing panda|Tree nap panda|Panda back|Looking back panda|Panda pair',
    'flowers': 'Red flower|Blue flower|Purple crocus|Blue iris|Pink tulip|Orchid|Sunflower|Cherry blossom|Forget me not|Orchid branch|Lily of the valley|Pansy',
    'fruit': 'Dragon fruit|Dragon fruit half|Bananas|Grapes|Strawberry|Pineapple|Lychee|Passion fruit|Durian|Yellow watermelon|Persimmon|Bitten apple',
    'forest-animals': 'Wild boar|Raccoon|Raccoon tail|Bear|Alpaca|Hedgehog|Red panda|Mandrill|Panda face|Panda bottom|Koala|Leopard',
    'zodiac-animals': 'Rat|Ox|Tiger|Rabbit|Dragon|Snake|Horse|Sheep|Monkey|Rooster|Dog|Pig',
    'dogs': 'Shiba inu|Poodle|Schnauzer|Maltese|French bulldog|Corgi|Dachshund|Golden retriever|Husky',
    'sauces': 'Soy sauce|Pepper shaker|Sauce bowl|Mustard|Ketchup|Sweet chili sauce',
    'wheel-cakes': 'Peanut wheel cake|Red bean wheel cake|Custard wheel cake|Taro wheel cake',
    'rice-cookers': 'Green rice cooker|Orange rice cooker|Red mailbox|Green mailbox',
    'bees': 'Bee|Beehive',
    'traffic': 'Traffic light|Traffic cone',
    'capsule-machines': 'Pink capsule machine|Rainbow capsule machine',
    'sushi': 'Salmon roe sushi|Corn sushi|Salmon sushi|Tuna sushi|Egg sushi|Shrimp sushi|Rice ball|Miso soup',
    'taiwan-signs': 'Breakfast shop sign|Little eatery sign|Night market steak sign|Danzai noodles sign|Fried chicken sign|Intestine noodles sign|Papaya milk sign|Retro ice cream sign|Pepper bun sign|Oyster omelet sign|Beef noodles sign|Gua bao soup sign|Frog milk tea sign|Turkey rice sign|Taro balls sign|Noodle shop menu|Braised pork rice sign|Ginger duck sign|Gua bao box sign|Popcorn chicken sign|Mutton hot pot sign|Oyster noodles sign|Soup dumplings sign|Pink order pad|Tall noodle shop sign|Bubble tea sign|Yellow order pad',
    'fat-cats': 'Tabby grooming|Orange cat sitting|Calico cat sitting|Calico cat waving|Calico cat rolling|Tabby stretching|Orange cat loaf|Orange cat belly|Orange cat sleeping|Calico cat loaf|Tabby curled up|Tabby sleeping',
    'cat-friends': 'White cat pink ruff|White paw|Gray cat blue scarf|Cat food tin|Cat yellow collar|Cat grass|Black cat purple ruff|Black paw|Tabby pink scarf|Pink yarn|Calico red bow|Orange cat yellow collar',
    'dinosaurs': 'Green stegosaurus|Pink dinosaur egg|Red triceratops|Blue fossil egg|Orange spinosaurus|Dinosaur fossil|Volcano|Meteor|Purple dinosaur egg|Blue flying dinosaur|Green tyrannosaurus|Blue long neck dinosaur',
    'hakka': 'Tung blossom|Lei cha bowl|Red floral pouch|Blue floral pouch|Kumquat sauce|Floral shirt|Pickled greens|Lucky rice packet|Red rice cake|Blue Hakka shirt|Layer cake|Mugwort rice cake',
    'snack-time': 'Red wafer wrapper|Chocolate wafer|Blue cookie wrapper|Chocolate cookie|Gummy bear bag|Red gummy bear|Green gummy bear|Yellow gummy bear|Corn snack|Twisted corn snack|Chocolate bar wrapper|Potato chips|Instant noodles|Chocolate bar',
    'christmas': 'Santa|Chimney|Sleigh|Christmas tree|Gold star|Snow globe|Ornament|Snowman|Stocking|Reindeer|Wrapped present|Gingerbread man',
    'yilan': 'Scallion pancake|Scallions|Ice cream roll|Ox tongue cracker|Duck snack packet|Sliced duck|Long cracker|Kumquats|Spring roll|Fried snacks|Peanut candy|Steamed bun',
    'dragon-boat': 'Dragon boat head|Dragon boat tail|Green rice dumpling|Red spice bottle|Open rice dumpling|Festive bottle|Brown rice dumpling|Chili sauce|Sachet|Red pouch|Leaf rice dumpling|Lucky tassel',
    'sleeping-cats': 'Sleeping tabby|Sleeping black and white cat|Sleeping white cat|Sleeping orange cat|Sleeping black cat|Sleeping calico',
    'box-cats': 'Orange cat in flat box|Tall orange cat|Cat peeking from box|Cat under box lid|Calico curled in box|Calico loaf|Orange cat hiding|Orange cat in square box|Calico in open box|Orange cat in open box|Calico sitting|Cat inside closed box',
    'taiwan-wildlife': 'Leopard cat face|Leopard cat back|Taiwan black bear|Taiwan black bear back',
    'taiwan-everyday': 'Taiwan market bag|Striped shopping bag|Soup dumpling basket|Bubble tea|Blue slipper|Guava|Betel nut packet|Fried chicken bag|Rice wine|Seasoning tin|Taiwan beer|Apple soda',
    'japan-festival': 'Goldfish bag|Goldfish scoop|Sakura petal|Sakura blossom|Festival mallet|Red ball|Sumo wrestler|Festival curtain|Purple ninja|Ninja star|Flower kamaboko|Lucky bag',
    'jiangshi': 'Purple jiangshi|Mahjong cube|Blue jiangshi|Yellow talisman purse|Jiangshi with talisman|Bagua|Green jiangshi|Coffin|Yellow talisman',
    'lunar-new-year': 'Spring blessing|Fortune blessing|Green dragon mahjong|Red dragon mahjong|Prosperity blessing|Wealth blessing|God of wealth|Lucky money bag|Wealth charm|Winning streak charm|Lucky radish|Lucky pineapple',
    'new-year-treats': 'Lion dance head|Lion dance ball|Red lantern|Spring fortune lanterns|Red envelope|Gold ingot|Mandarin orange|Mandarin segments',
    'horror-night': 'Horror clown|Red balloon|Haunted doll|Haunted picture|Nightmare man|Claw glove|Ghost mask|Bloody knife|Puppet mask|Saw|Red devil|Pitchfork',
    'yokai': 'Kappa|Ghost|Red lantern yokai|Tanuki|Long haired ghost|Haunted well|Umbrella yokai|Red oni|Blue oni',
    'halloween': 'Pumpkin bucket|Wrapped candy|Spotted mushroom|Spooky finger|Eyeball|Vampire lips|Skull candle|Cauldron|Werewolf',
    'japan': 'Shiba face|Shiba bottom|Shiba tail|Daruma|Mount Fuji|Red octopus|Shaved ice sign|Lucky cat|Gold coin',
    'cat-faces': 'Orange cat face|Brown cat face|Tuxedo cat face|Black cat face|White cat face|Tabby cat face|Calico cat face|Gray cat face',
    'picnic': 'Bread basket|Burger|Picnic basket|Picnic mustard|Picnic ketchup|Milk carton|Sandwich|Popcorn|Bento lunch|Jam jar',
    'planets': 'Purple spotted planet|Pink striped planet|Mint planet|Green planet|Pastel pink planet|Multicolor dark planet|Lavender planet|Blue orange planet|Turquoise planet',
    'eggs-and-meat': 'Meat roll|Meat on bone|Sunny side egg|Fried egg',
}


def boxes_for(image, index):
    """Find separated designs, keeping detached details with their illustration."""
    # Coordinates below are normalized to a 1000 x 1000 sheet, including the
    # non-square sign sheet. Detection uses the already-upscaled source.
    small = np.asarray(image.resize((1000, 1000), Image.Resampling.LANCZOS))
    mask = np.min(small, axis=2) < 245
    allowed = np.zeros((1000, 1000), dtype=bool)
    if index == 4:
        for left, right in [(172, 335), (508, 645), (842, 975)]:
            allowed[115:980, left:right] = True
        allowed[875:, 172:245] = False  # rounded caption beside the tall sign
    elif index in (1, 10, 12, 13, 15):
        allowed[115:890, 115:895] = True
        if index == 1:
            allowed[585:, 550:] = False
    else:
        allowed[25:975, 25:975] = True
    mask &= allowed
    grown = ndi.binary_dilation(mask, iterations=1 if index == 34 else 3)
    labels, _ = ndi.label(grown)
    found = []
    for label, sl in enumerate(ndi.find_objects(labels), 1):
        if sl is None:
            continue
        area = np.count_nonzero(mask[sl] & (labels[sl] == label))
        y, x = sl
        if area < 100 or x.stop-x.start < 15 or y.stop-y.start < 15:
            continue
        found.append([x.start, y.start, x.stop, y.stop])
    # Group into visual rows before sorting left to right. Tall icons can start
    # above adjacent small ones, so compare center points instead of top edges.
    rows = []
    for box in sorted(found, key=lambda b: (b[1]+b[3])/2):
        center = (box[1]+box[3])/2
        if not rows or center - rows[-1][0] > 70:
            rows.append([center, [box]])
        else:
            rows[-1][1].append(box)
    return [b for _, row in rows for b in sorted(row)]


def cutout(image, box):
    sx, sy = image.width/1000, image.height/1000
    bounds = (max(0, int((box[0]-4)*sx)), max(0, int((box[1]-4)*sy)),
              min(image.width, int((box[2]+4)*sx)), min(image.height, int((box[3]+4)*sy)))
    rgb = np.array(image.crop(bounds))
    distance = 255 - rgb.min(axis=2).astype(np.int16)
    # Flood from the outside: white paint inside a panda, flower or rice ball
    # remains opaque. Only the sheet's connected white background disappears.
    candidate = distance < 16
    seed = np.zeros(candidate.shape, dtype=bool)
    seed[0, :] = candidate[0, :]; seed[-1, :] = candidate[-1, :]
    seed[:, 0] = candidate[:, 0]; seed[:, -1] = candidate[:, -1]
    background = ndi.binary_propagation(seed, mask=candidate)
    alpha = np.full(candidate.shape, 255, dtype=np.uint8)
    alpha[background] = 0
    # A narrow transition retains anti-aliasing along the upscaled contours.
    edge = ndi.binary_dilation(background) & ~background & (distance < 40)
    alpha[edge] = np.clip((distance[edge]-15)*255/25, 0, 255).astype(np.uint8)
    # Bounding rectangles can overlap a neighboring illustration at a corner.
    # Keep the target's connected cluster (including its nearby detached details)
    # and discard any clipped fragments from adjacent designs.
    clusters, count = ndi.label(ndi.binary_dilation(alpha > 0, iterations=max(1, round(3*min(sx,sy)))))
    if count > 1:
        weights = np.bincount(clusters[alpha > 0].ravel())
        weights[0] = 0
        primary = weights.argmax()
        clipped = np.unique(np.concatenate([clusters[0], clusters[-1], clusters[:,0], clusters[:,-1]]))
        for fragment in clipped:
            if fragment and fragment != primary:
                alpha[clusters == fragment] = 0
    rgba = np.dstack([rgb, alpha])
    rgba[alpha == 0, :3] = 0
    result = Image.fromarray(rgba)
    visible = result.getbbox()
    if not visible:
        raise ValueError('Empty cutout')
    result = result.crop(visible)
    padded = Image.new('RGBA', (result.width+24, result.height+24))
    padded.paste(result, (12, 12))
    return padded, list(bounds)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--upscaled', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--write', action='store_true', help='Write validated assets and catalog')
    args = parser.parse_args()
    sources = json.loads((args.source/'manifest.json').read_text(encoding='utf-8'))
    args.audit.mkdir(parents=True, exist_ok=True)
    groups, planned, errors, audit = [], [], [], []
    for index, slug, title, zh, expected in COLLECTIONS:
        source = sources[index-1]
        source_file = '03.jpg' if index == 4 else '01.jpg'
        folder = unquote(source['url'].rsplit('/', 1)[-1])
        original = args.source/folder/source_file
        enlarged = args.upscaled/f'{index:02}{"_signs" if index == 4 else ""}_waifu2x_4x.png'
        if not enlarged.exists():
            errors.append(f'{slug}: missing enlarged sheet'); continue
        image = Image.open(enlarged).convert('RGB')
        with Image.open(original) as before:
            if image.size != (before.width*4, before.height*4):
                raise ValueError(f'{slug}: expected exactly 4x source dimensions')
        boxes = boxes_for(image, index)
        if len(boxes) != expected:
            errors.append(f'{slug}: expected {expected} designs, found {len(boxes)}')
        preview = image.copy(); preview.thumbnail((1000, 1000)); draw = ImageDraw.Draw(preview)
        for number, box in enumerate(boxes, 1):
            rect = [box[0]*preview.width/1000, box[1]*preview.height/1000, box[2]*preview.width/1000, box[3]*preview.height/1000]
            draw.rectangle(rect, outline='#f02080', width=2); draw.text((rect[0],rect[1]),str(number),fill='#ff0080',stroke_width=1,stroke_fill='white')
        preview.save(args.audit/f'{index:02}-{slug}-boxes.jpg')
        names = NAMES.get(slug, '').split('|')
        group = {'id': slug, 'title': title, 'titleZh': zh, 'source': source['url'], 'items': []}
        for number, box in enumerate(boxes, 1):
            item_image, bounds = cutout(image, box)
            name = names[number-1] if len(names) == len(boxes) else f'{title} {number:02}'
            stem = f'{number:02}-' + re.sub('[^a-z0-9]+', '-', name.lower()).strip('-')
            src = f'assets/piknik/{slug}/{stem}.png'
            thumb = f'assets/piknik/{slug}/{stem}.webp'
            item = {'src': src, 'thumb': thumb, 'name': name, 'nameZh': f'{zh} {number:02}', 'w': item_image.width, 'h': item_image.height}
            group['items'].append(item)
            planned.append((item, item_image))
            audit.append({'src': src, 'sourceFile': f'{folder}/{source_file}', 'sourceSha256': hashlib.sha256(original.read_bytes()).hexdigest(), 'boundsAt4x': bounds})
        groups.append(group)
        print(f'{slug}: {len(boxes)} icons', flush=True)
    (args.audit/'extraction-report.json').write_text(json.dumps({'items': audit, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
    if errors:
        raise SystemExit('\n'.join(errors))
    if not args.write:
        print(f'Audit passed: {len(planned)} icons across {len(groups)} collections. Use --write to import.'); return
    for item, image in planned:
        output = ROOT/item['src']; output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists() and (ROOT/item['thumb']).exists():
            with Image.open(output) as previous:
                if previous.size == image.size and previous.convert('RGBA').tobytes() == image.tobytes():
                    continue
        image.save(output, optimize=True)
        thumbnail = image.copy(); thumbnail.thumbnail((128,128), Image.Resampling.LANCZOS)
        thumbnail.save(ROOT/item['thumb'], lossless=True, method=6)
    manifest = {'v': 1, 'credit': 'PIKNIK / 日日野餐', 'processing': {'scale': 4, 'upscaler': 'waifu2x-ncnn-vulkan', 'model': 'cunet', 'noise': 1}, 'groups': groups}
    (ROOT/'assets/piknik/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (ROOT/'assets/piknik/provenance.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Imported {len(planned)} icons in {len(groups)} collections.')


if __name__ == '__main__':
    main()
