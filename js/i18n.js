/*
 * i18n.js — user-facing text in English and Traditional Chinese (Taiwan).
 *
 * Strings are looked up by their English text, so `t('Add images')` returns the
 * translation for the current locale or the English text itself. Unknown text
 * (file names, captions, user input) passes through untouched. `{name}` style
 * placeholders are filled from the params object. The locale comes from
 * localStorage, then the browser's languages; `setLocale()` switches in place
 * (and stores the choice) and tells `onChange` listeners, so the app can rebuild
 * what it built with `t()`.
 *
 * Static markup is translated by `apply()`: elements with `data-i18n` have their
 * own text nodes translated, and `data-i18n-attr="title,aria-label"` names the
 * attributes to translate on that element. The English originals are remembered,
 * so `apply()` can run again after every switch.
 */
window.I18N = (() => {
  'use strict';

  const KEY = 'sticker-shader-editor:locale';
  const LOCALES = { en: 'English', 'zh-TW': '繁體中文' };
  const SHORT = { en: 'EN', 'zh-TW': '中文' };

  const ZH_TW = {
    /* ---- top bar ---- */
    'cute holographic sticker lab ♡': '可愛雷射貼紙實驗室 ♡',
    'Undo': '復原', 'Redo': '重做', 'Nothing to undo': '沒有可復原的動作', 'Nothing to redo': '沒有可重做的動作',
    'Add images': '加入圖片', 'Try a sample': '試試範例', 'Add frame': '加相框',
    'Add a Polaroid-style portrait frame; drop a sticker on it': '加入拍立得風格的相框，再把貼紙放進去',
    'Icons': '圖示', 'Add cute decorations': '加入可愛裝飾', 'Sticker tray': '貼紙盤',
    'Edit cutout': '編輯去背', 'Preset': '預設', 'Custom': '自訂', 'Export': '匯出', 'Language': '語言',
    'Selected sticker': '選取的貼紙', 'Sticker PNG': '貼紙 PNG', 'flat, transparent': '平面、透明背景',
    'Sticker PNG @2x': '貼紙 PNG @2x', 'double size': '兩倍大小', 'Posed PNG': '帶姿勢 PNG', 'current tilt + shadow': '目前的傾斜與陰影',
    'Cutout only': '只要去背圖', 'no effects': '不含特效', 'Sticker pack PNG': '貼圖包 PNG', 'Copy to clipboard': '複製到剪貼簿',
    'Animated': '動畫', 'Animated SVG': 'SVG 動畫', 'frame + stuck icons': '相框＋黏附的圖示', 'Animated PNG': 'PNG 動畫', 'lossless loop': '無損循環',
    'Animated GIF': 'GIF 動畫', 'for chats': '適合聊天分享', 'Whole canvas': '整個畫布', 'Canvas PNG': '畫布 PNG', 'with backdrop': '含背景',
    'Record 4 s clip': '錄製 4 秒短片', 'Share': '分享', 'Copy share link': '複製分享連結', 'frames, icons and scene': '相框、圖示與場景',
    /* ---- stage ---- */
    'Sticker preview': '貼紙預覽', 'drag me': '拖曳我', 'release to put it in the frame': '放開就放進相框',
    'Remove sticker': '移除貼紙', 'Remove sticker (Delete)': '移除貼紙（Delete 鍵）',
    'Drop images to make stickers': '拖入圖片，做成貼紙',
    'Each image becomes its own sticker: the main characters are cut out automatically, then you can drag the stickers around, pick one to tune its foil, and remove the ones you don\'t want. Add a portrait frame, drop a sticker into it, write a caption and scatter some cute icons around.':
      '每張圖片都會變成一張貼紙：主角會自動去背，接著可以拖曳貼紙、選一張來調整箔膜效果，不要的就移除。還可以加一個相框，把貼紙放進去、寫上標題，再撒一些可愛的圖示。',
    'Choose files': '選擇檔案', 'Add a frame': '加一個相框',
    'Or paste from the clipboard. Everything runs in your browser; nothing is uploaded.': '也可以直接貼上剪貼簿裡的圖片。所有處理都在瀏覽器裡完成，不會上傳任何東西。',
    'WebGL2 is required': '需要 WebGL2',
    /* ---- cutout editor ---- */
    'Cutout tools': '去背工具', 'Tap to add a subject': '點一下加入主體', 'Tap +': '點選 +', 'Tap to remove': '點一下移除', 'Tap −': '點選 −',
    'Paint to add': '塗抹加入', 'Brush +': '筆刷 +', 'Paint to erase': '塗抹擦除', 'Brush −': '筆刷 −', 'Key out a colour': '去除某個顏色', 'Colour key': '色彩去背',
    'Brush': '筆刷', 'Tolerance': '容許度', 'Auto detect': '自動偵測', 'Invert': '反轉', 'Clear': '清除', 'Reset': '重設', 'Done': '完成',
    'Added region': '已加入區域', 'Removed region': '已移除區域', 'Selection failed: {error}': '選取失敗：{error}',
    'Tap a colour region to add it (AI model unavailable).': '點一下顏色區塊就能加入（AI 模型無法使用）。',
    'Tap the thing you want on the sticker. Hold Alt to remove.': '點一下你想留在貼紙上的東西。按住 Alt 則是移除。',
    'Tap a colour region to remove it (AI model unavailable).': '點一下顏色區塊就能移除（AI 模型無法使用）。',
    'Tap something to remove it from the sticker.': '點一下要從貼紙上移除的東西。',
    'Paint to add. [ and ] change the brush size.': '塗抹來加入。[ 和 ] 可調整筆刷大小。',
    'Paint to erase. [ and ] change the brush size.': '塗抹來擦除。[ 和 ] 可調整筆刷大小。',
    'Click a background colour to key out everything connected to it.': '點一下背景顏色，就會去除所有相連的同色區域。',
    /* ---- panel ---- */
    'Knobs': '調整', 'select a sticker on the canvas': '在畫布上選一張貼紙', 'double-click a slider to reset it': '連按兩下滑桿即可重設',
    'Copy settings': '複製設定', 'Paste': '貼上', 'Reset all': '全部重設',
    'editing this frame': '正在編輯這個相框', 'drop a sticker on the frame window': '把貼紙拖到相框窗口', 'editing this icon': '正在編輯這個圖示',
    'editing this sticker': '正在編輯這張貼紙', 'cutting out…': '去背中…', 'add an image to start': '先加入一張圖片',
    'Settings copied to clipboard': '設定已複製到剪貼簿', 'Imported {n} settings': '已匯入 {n} 項設定', 'That was not valid JSON': '這不是有效的 JSON',
    /* ---- schema: groups ---- */
    'Portrait frame': '相框', 'Icon': '圖示', 'Cutout': '去背', 'Die-cut border': '裁切白邊', 'Holographic foil': '雷射箔膜', 'Glitter': '亮粉',
    'Surface': '表面', 'Shadow': '陰影', 'Motion': '動態', 'Scene': '場景',
    /* ---- schema: frame ---- */
    'Photo': '照片', 'none — drop a sticker on the frame': '無 — 把貼紙拖到相框上',
    'Which sticker sits in the frame. You can also drag a sticker onto the frame window.': '相框裡放哪張貼紙。也可以直接把貼紙拖到相框的窗口上。',
    'Style': '風格', 'One-click frame look. Keeps your caption and photo.': '一鍵套用相框外觀，標題和照片會保留。',
    'Design': '款式', 'The overall shape. Proportions, edge and window shape below apply to the classic card (and where a design has room for them).': '整體造型。下方的比例、邊緣與窗口形狀適用於經典卡片（以及有空間套用的款式）。',
    'Size': '大小', 'Mouse wheel over the frame also resizes it.': '在相框上滾動滑鼠滾輪也能調整大小。',
    'Rotation': '旋轉', 'Shift + mouse wheel over the frame also rotates it.': '按住 Shift 並在相框上滾動滾輪也能旋轉。',
    'Animation': '動畫', 'Still': '靜止', 'Float': '漂浮', 'Wiggle': '搖擺', 'Heartbeat': '心跳', 'Pulse': '脈動', 'Spin': '轉圈', 'Swing': '擺盪', 'Bounce': '彈跳', 'Twinkle': '閃爍', 'Dance': '跳舞',
    'Caption': '標題', 'write something cute': '寫點可愛的話', 'Small line': '小字', 'a date, a place…': '日期、地點…', 'Lettering': '字體', 'All caps': '全部大寫',
    'Caption colour': '標題顏色', 'Proportions': '比例', 'Edge': '邊緣', 'Window shape': '窗口形狀', 'Decorations': '裝飾', 'Little stickers on the corners of the frame.': '相框角落的小貼紙。',
    'Frame colour': '相框顏色', 'Outline colour': '外框線顏色', 'Outline width': '外框線粗細', 'Corner radius': '圓角', 'Frame pattern': '相框花紋', 'Frame pattern colour': '相框花紋顏色',
    'Window colour': '窗口顏色', 'Window pattern': '窗口花紋', 'Pattern colour': '花紋顏色', 'Pattern size': '花紋大小',
    'Photo zoom': '照片縮放', 'Photo shift X': '照片水平位移', 'Photo shift Y': '照片垂直位移', 'Photo border': '照片白邊',
    'A sticker-style outline around the photo inside the window.': '窗口內照片周圍的貼紙式白邊。', 'Photo border colour': '照片白邊顏色', 'Washi tape': '紙膠帶', 'Tape colour': '紙膠帶顏色',
    /* ---- schema: icon ---- */
    'Mouse wheel over the icon also resizes it.': '在圖示上滾動滾輪也能調整大小。', 'Shift + mouse wheel over the icon also rotates it.': '按住 Shift 並在圖示上滾動滾輪也能旋轉。',
    'Animation speed': '動畫速度', 'Animation amount': '動畫幅度', 'Kawaii face': '可愛表情', 'Where it belongs': '適合的才有', 'On everything that can': '能加的都加', 'None': '無',
    'Blink': '眨眼', 'Faces blink now and then.': '表情會偶爾眨眼。', 'Stick to a frame': '黏在相框上', 'Icons resting on or beside a frame move with it.': '放在相框上或旁邊的圖示會跟著相框移動。',
    'Text': '文字', 'ticket, tag, bubble, sign…': '票券、名牌、對話框、招牌…', 'Palette': '配色', 'Main colour': '主色', 'Pink accent': '粉紅點綴', 'Sky blue': '天空藍',
    'Butter yellow': '奶油黃', 'Cinnamon': '肉桂色', 'Leaf green': '葉綠', 'Outline weight': '線條粗細', 'Mirror': '鏡像',
    /* ---- schema: cutout / border ---- */
    'Working resolution': '處理解析度', 'Longest side of the processed image. Higher is sharper and slower.': '處理影像的長邊像素。越高越清晰，也越慢。',
    'Snap edges to image': '邊緣貼合影像', 'Guided filter that fits the mask to real edges and recovers soft hair/fur.': '以導向濾波讓遮罩貼合真實邊緣，並找回柔軟的毛髮。',
    'Snap radius': '貼合半徑', 'Feather': '羽化', 'Outline smoothing': '輪廓平滑', 'Rounds the die-cut line.': '讓裁切線更圓滑。', 'Grow / shrink': '外擴／內縮',
    'Fill holes': '填滿孔洞', 'Drop small fragments': '去除小碎片',
    'Border width': '白邊寬度', 'Border colour': '白邊顏色', 'Foil on border': '白邊的箔膜', 'Edge bevel': '邊緣斜角', 'Bevel width': '斜角寬度',
    /* ---- schema: foil / glitter / surface / shadow ---- */
    'Intensity': '強度', 'Texture': '紋理', 'Plain foil': '素面箔膜', 'Rainbow bands': '彩虹條紋', 'Radial rings': '放射圓環', 'Prism diamonds': '稜鏡菱格',
    'Cross-hatch': '交叉線', 'Lenticular dots': '光柵圓點', 'Mosaic facets': '馬賽克切面', 'Waves': '波浪', 'Pinwheel': '風車',
    'Texture scale': '紋理大小', 'Texture angle': '紋理角度', 'Angle sensitivity': '角度靈敏度', 'How fast the colours sweep as the sticker tilts.': '貼紙傾斜時顏色掃過的速度。',
    'Hue offset': '色相偏移', 'Saturation': '飽和度', 'Metallic tint': '金屬色調', 'Lets the rainbow colour the artwork itself, like a foil print.': '讓彩虹色也染上圖案本身，就像燙箔印刷。',
    'Ink blocks foil': '油墨遮蔽箔膜', 'How much dark printed areas hide the foil underneath.': '深色印刷區域遮住底下箔膜的程度。', 'Flake grain': '碎箔顆粒',
    'Shimmer drift': '流光漂移', 'Slow colour drift over time.': '顏色隨時間緩慢流動。',
    'Amount': '份量', 'Flake size': '亮片大小', 'Density': '密度', 'Sharpness': '銳利度',
    'Gloss': '光澤', 'Highlight': '高光', 'Rim glow': '邊緣光暈', 'Paper grain': '紙張紋理', 'Shading': '明暗', 'Ink brightness': '油墨亮度', 'Ink saturation': '油墨飽和度',
    'Opacity': '不透明度', 'Softness': '柔和度', 'Spread': '擴散', 'Lift': '抬升',
    /* ---- schema: motion / scene ---- */
    'Resting tilt of the sticker on the page. Shift + mouse wheel over a sticker also rotates it.': '貼紙靜止時在頁面上的傾斜角度。按住 Shift 並在貼紙上滾動滾輪也能旋轉。',
    'A looping idle animation on top of the physics.': '在物理效果之上再加一段循環的閒置動畫。',
    'Hover tilt': '懸停傾斜', 'Grab lift': '抓取抬起', 'Drag lean': '拖曳傾身', 'Spring': '彈簧', 'Damping': '阻尼', 'Idle sway': '閒置搖晃',
    'Light follows cursor': '光源跟隨游標', 'Snap back to centre': '放開回到中央',
    'Theme': '主題', 'One-click backdrop colour and pattern.': '一鍵套用背景顏色與花紋。', 'Backdrop': '背景', 'Pattern': '花紋', 'Transparency grid': '透明格紋',
    /* ---- foil presets ---- */
    'Minimal': '極簡', 'Soft gloss': '柔光', 'Holographic': '雷射全息', 'Prism foil': '稜鏡箔', 'Glitter bomb': '亮粉炸彈', 'Chrome': '鉻銀', 'Oil slick': '油光',
    'Pastel dream': '粉彩夢境', 'Gold foil': '燙金', 'Matte vinyl': '霧面膠膜', 'Paper cute': '可愛紙感', 'Candy gloss': '糖果光澤', 'Lenticular': '光柵',
    /* ---- decor option lists ---- */
    'Hand lettered': '手寫', 'Rounded': '圓體', 'Typewriter': '打字機', 'Clean sans': '簡潔無襯線',
    'Polka dots': '圓點', 'Grid paper': '方格紙', 'Ruled lines': '橫線', 'Diagonal stripes': '斜紋', 'Tiny hearts': '小愛心', 'Sparkles': '閃光', 'Little clouds': '小雲朵',
    'Gingham checks': '格紋', 'Scallops': '扇形波浪',
    'Polaroid': '拍立得', 'Portrait': '直式', 'Landscape': '橫式', 'Wide': '寬幅', 'Square (no caption)': '正方形（無標題）',
    'Straight': '直邊', 'Scalloped': '波浪邊', 'Puffy cloud': '蓬鬆雲朵', 'Ticket stub': '票根', 'Postage stamp': '郵票',
    'Rounded corners': '圓角', 'Square': '正方形', 'Circle': '圓形', 'Arch': '拱形', 'Heart': '愛心', 'Cloud': '雲朵',
    'Classic card': '經典卡片', 'Film strip': '底片', 'Photo booth strip': '大頭貼條', 'Round badge': '圓形徽章', 'Love letter': '情書', 'Retro TV': '復古電視',
    'Bookmark': '書籤', 'Notebook page': '筆記本頁', 'Speech bubble': '對話框', 'Coffee cup': '咖啡杯',
    'Clouds': '雲朵', 'Hearts': '愛心', 'Stars': '星星', 'Bows': '蝴蝶結', 'Cinnamon rolls': '肉桂捲', 'Café mix': '咖啡館綜合', 'Sky mix': '天空綜合',
    'One strip on top': '上方一條', 'Two corners': '兩個角落', 'Left and right': '左右各一',
    /* ---- icons, groups, palettes, themes, frame styles ---- */
    'Cinnamon roll': '肉桂捲', 'Teacup': '茶杯', 'Latte mug': '拿鐵馬克杯', 'Cupcake': '杯子蛋糕', 'Macaron': '馬卡龍', 'Pancakes': '鬆餅', 'Donut': '甜甜圈',
    'Cinnamon sticks': '肉桂棒', 'Soft serve': '霜淇淋', 'Cookie': '餅乾', 'Milk carton': '牛奶盒', 'Candy': '糖果', 'Strawberry': '草莓', 'Cherries': '櫻桃',
    'Sleepy cloud': '瞌睡雲', 'Rainbow': '彩虹', 'Star': '星星', 'Sparkle': '亮晶晶', 'Moon': '月亮', 'Raindrop': '雨滴', 'Umbrella': '雨傘', 'Balloon': '氣球',
    'Bow': '蝴蝶結', 'Flower': '花', 'Crown': '皇冠', 'Paw print': '腳印', 'Ghost': '小幽靈', 'Music note': '音符', 'Two notes': '雙音符',
    'Ticket': '票券', 'Name tag': '名牌', 'Café sign': '咖啡館招牌', 'Emoji': '表情符號',
    'Café & sweets': '咖啡甜點', 'Sky': '天空', 'Cute': '可愛', 'With text': '文字', 'Kaomoji': '顏文字', 'Pixel': '像素', 'Pixel art': '像素圖', 'Previous group': '上一組', 'Next group': '下一組',
    'Pixel gifs': '像素動圖', 'Tiny': '迷你', 'Stamps': '郵票', 'Blinkies': '閃閃貼',
    'Tap a face to add it as a little tag · type your own in the search box': '點一下顏文字，它會變成小標籤 · 也可以在搜尋框輸入自己的',
    'Fan-collected pixel art, first frame only · credits in pixels/CREDITS.txt · Cinnamoroll © Sanrio': '粉絲收集的像素圖，只取第一格 · 來源見 pixels/CREDITS.txt · Cinnamoroll © Sanrio',
    'Cinnamon sky': '肉桂天空', 'Strawberry milk': '草莓牛奶', 'Mint cream': '薄荷奶油', 'Lavender': '薰衣草', 'Ink & paper': '墨與紙', 'Night glow': '夜光',
    'Cloudy sky': '多雲天空', 'Blossom': '櫻花粉', 'Mint': '薄荷', 'Lemon': '檸檬', 'Café latte': '咖啡拿鐵', 'Notebook': '筆記本', 'Night': '夜晚',
    'Cinnamon café': '肉桂咖啡館', 'Cloud nine': '飄飄雲', 'Sky ticket': '天空票券', 'Sweet pink': '甜甜粉', 'Bakery': '麵包坊', 'Lace doily': '蕾絲墊',
    'Classic polaroid': '經典拍立得', 'Night sky': '夜空', 'Photo booth': '大頭貼',
    /* ---- tray ---- */
    'Search, or type an emoji / word': '搜尋，或輸入表情符號／文字', 'Search icons, or type an emoji or word to add': '搜尋圖示，或輸入表情符號、文字來加入',
    'Add {emoji}': '加入 {emoji}', 'Add “{text}”': '加入「{text}」', 'Add': '加入',
    'Any emoji works — type or paste one above and press Enter. A short word becomes a hand-lettered sticker.': '任何表情符號都可以 — 在上方輸入或貼上，再按 Enter。短短的文字會變成手寫貼紙。',
    'Click to add · shift-click keeps the tray open · new icons stick to the selected frame': '點一下加入 · 按住 Shift 點選可保持貼紙盤開啟 · 新圖示會黏在選取的相框上',
    '{n} matches · Enter adds the first, or add the text itself': '找到 {n} 個 · Enter 加入第一個，或加入文字本身',
    '1 match · Enter adds the first, or add the text itself': '找到 1 個 · Enter 加入它，或加入文字本身',
    'No icon by that name · Enter adds it as an emoji / word sticker': '沒有這個名稱的圖示 · 按 Enter 會把它變成表情符號／文字貼紙',
    /* ---- status messages ---- */
    '{name} is in the frame · set Photo to "none" in the panel to take it out': '{name} 已放進相框 · 想拿出來，把面板裡的「照片」設為「無」',
    'Could not decode image': '無法解讀圖片', 'That file is not an image.': '這個檔案不是圖片。', 'Could not load image: {error}': '無法載入圖片：{error}',
    'Added {what} · it sticks to the frame and moves with it': '已加入{what} · 它會黏在相框上，跟著一起移動', 'Added {what} · drag it anywhere': '已加入{what} · 可以拖到任何地方',
    '{name} placed in the frame · type a caption in the panel': '{name} 已放進相框 · 在面板裡輸入標題',
    'Drop a sticker onto the frame window, or pick one under Photo in the panel': '把貼紙拖到相框窗口，或在面板的「照片」裡選一張',
    'Found the subject with {model} on {engine}': '以 {model}（{engine}）找到主體', 'Found {labels}': '找到 {labels}',
    'person': '人物', 'cat': '貓', 'dog': '狗', 'bird': '鳥', 'horse': '馬', 'cow': '牛', 'sheep': '羊', 'foreground': '前景', 'subject': '主體',
    'No people or animals found — trying the centre of the image…': '沒找到人物或動物 — 改試圖片中央…', 'Selected the subject at the centre': '選取了圖片中央的主體',
    'AI models unavailable — used colour keying': 'AI 模型無法使用 — 改用色彩去背', 'Keying out the background colour…': '正在去除背景顏色…', 'Keyed out the background colour': '已去除背景顏色',
    '{name}: {how} · drag the sticker · Edit cutout to refine': '{name}：{how} · 拖曳貼紙 · 用「編輯去背」微調',
    'The cutout is empty — use Edit cutout to select the subject.': '去背結果是空的 — 請用「編輯去背」選取主體。',
    'Undo · {label}': '復原 · {label}', 'Redo · {label}': '重做 · {label}', 'Undo {label} (Ctrl+Z)': '復原「{label}」（Ctrl+Z）', 'Redo {label} (Ctrl+Shift+Z)': '重做「{label}」（Ctrl+Shift+Z）',
    'move': '移動', 'resize': '調整大小', 'frame style': '相框風格', 'palette': '配色', 'stick to frame': '黏在相框上', 'preset {name}': '預設「{name}」',
    'paste settings': '貼上設定', 'reset': '重設', 'scene': '場景', 'add {what}': '加入{what}', 'add frame': '加入相框', 'delete {name}': '刪除 {name}',
    'Removed {name}': '已移除 {name}',
    'Recording a 4 second clip…': '正在錄製 4 秒短片…', 'Clip ready': '短片完成', 'Building the SVG…': '正在產生 SVG…',
    'Animated SVG ready · {kb} KB': 'SVG 動畫完成 · {kb} KB', ' · {n} stuck icons included': ' · 包含 {n} 個黏附的圖示', ' · 1 stuck icon included': ' · 包含 1 個黏附的圖示',
    'Rendering the animation…': '正在算繪動畫…', 'Encoding {n} frames…': '正在編碼 {n} 個影格…', 'Animated {fmt} ready · {sec} s loop · {kb} KB': '{fmt} 動畫完成 · 循環 {sec} 秒 · {kb} KB',
    'Export failed: {error}': '匯出失敗：{error}', 'This browser cannot put images on the clipboard': '這個瀏覽器無法把圖片放進剪貼簿',
    '{name} copied · paste it anywhere that takes images': '已複製 {name} · 可貼到任何接受圖片的地方', 'Copy failed: {error}': '複製失敗：{error}',
    'Add a frame or some icons first · photos are never part of a share link': '請先加入相框或圖示 · 分享連結不會包含照片',
    'Share link copied · {n} items, {kb} KB · photos stay on your machine': '分享連結已複製 · {n} 個項目，{kb} KB · 照片只留在你的電腦上',
    'That share link could not be read': '無法讀取這個分享連結',
    'Copy your settings:': '複製你的設定：', 'Paste settings JSON:': '貼上設定 JSON：', 'Copy your share link:': '複製你的分享連結：', 'Opened a shared scene · {n} items · drop your own photo onto the frame': '已開啟分享的場景 · {n} 個項目 · 把你的照片拖到相框上',
    /* ---- model progress ---- */
    'Cutting out character {k} of {n}…': '正在去背第 {k}／{n} 個主體…', 'Downloading model ({got} MB / {total} MB)…': '正在下載模型（{got} MB／{total} MB）…',
    'Downloading model ({got} MB)…': '正在下載模型（{got} MB）…', 'Finding the subject ({model} on {engine})…': '正在尋找主體（{model}，{engine}）…',
    'Finding characters…': '正在尋找人物…', 'Initialising detector…': '正在初始化偵測器…', 'Initialising subject model…': '正在初始化主體模型…',
    'Initialising tap-to-select…': '正在初始化點選工具…', 'Loading cached model…': '正在載入快取的模型…', 'Loading segmentation runtime…': '正在載入去背引擎…',
    'Loading WebGPU runtime…': '正在載入 WebGPU 引擎…', 'Segmenting selection…': '正在分割選取範圍…',
  };

  const DICT = { 'zh-TW': ZH_TW };

  function detect() {
    try { const saved = localStorage.getItem(KEY); if (saved && LOCALES[saved]) return saved; } catch (e) { /* storage blocked */ }
    const langs = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
    for (const l of langs) {
      const x = String(l || '').toLowerCase();
      if (x.startsWith('zh')) return 'zh-TW';   // every Chinese variant gets the Traditional text we have
      if (x.startsWith('en')) return 'en';
    }
    return 'en';
  }

  let locale = detect();
  let table = DICT[locale] || null;
  const listeners = [];

  /* Translate `str` (an English string, possibly with {placeholders}) and fill in `params`. */
  function t(str, params) {
    let s = table && Object.prototype.hasOwnProperty.call(table, str) ? table[str] : str;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m));
    return s;
  }

  /* Switch the locale in place: stores the choice, re-translates the markup and notifies listeners. */
  function setLocale(l) {
    if (!LOCALES[l] || l === locale) return;
    locale = l; table = DICT[l] || null;
    try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ }
    apply(document);
    for (const fn of listeners) fn(l);
  }
  function onChange(fn) { listeners.push(fn); }

  // the English originals of translated text nodes and attributes, so apply() can run again
  const srcText = new WeakMap(), srcAttr = new WeakMap();

  /* Translate the static markup under `root` in place (see the file comment). */
  function apply(root) {
    root = root || document;
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
    for (const el of root.querySelectorAll('[data-i18n]')) {
      for (const node of el.childNodes) {
        if (node.nodeType !== 3) continue;
        const text = node.nodeValue, key = text.trim();
        if (!key) continue;
        let src = srcText.get(node);
        if (src === undefined) { src = key; srcText.set(node, src); }
        node.nodeValue = text.replace(key, t(src));
      }
    }
    for (const el of root.querySelectorAll('[data-i18n-attr]')) {
      let saved = srcAttr.get(el);
      if (!saved) { saved = {}; srcAttr.set(el, saved); }
      for (const attr of el.getAttribute('data-i18n-attr').split(',')) {
        const a = attr.trim();
        if (saved[a] === undefined) saved[a] = el.getAttribute(a) || '';
        if (saved[a]) el.setAttribute(a, t(saved[a]));
      }
    }
  }

  const api = { t, apply, setLocale, onChange, LOCALES, SHORT, KEY };
  Object.defineProperty(api, 'locale', { get: () => locale, enumerable: true });
  return api;
})();
