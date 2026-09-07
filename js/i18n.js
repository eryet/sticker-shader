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
    'Guide': '導覽', 'Open feature walkthrough': '開啟功能導覽', 'New here?': '第一次來嗎？', 'Take a tour': '看看功能導覽',
    'Dismiss tour invitation': '關閉導覽邀請', 'Skip walkthrough': '離開導覽', 'Jump to a feature': '跳至指定功能',
    'Back': '上一步', 'Next': '下一步', 'Show me around': '開始導覽', 'Start creating': '開始創作', 'Step {n} of {total}': '第 {n} / {total} 步',
    'Select a photo, frame, or icon to enable its editing controls.': '選取照片、相框或圖示後，即可使用對應的編輯控制項。',
    'Welcome': '歡迎', 'Start with an image': '從圖片開始', 'Arrange your stickers': '排列貼紙', 'Shape your image': '修整圖片',
    'Decorate': '加入裝飾', 'Colour & finish': '色彩與材質', 'Bring it to life': '讓貼紙動起來', 'Organize & reuse': '整理與重複使用',
    'Export & share': '匯出與分享', 'Ready to create': '準備創作',
    'Your little sticker studio': '你的迷你貼紙工作室',
    'Turn a photo into a sticker, dress it up, and make it move. This guide shows what you can create and where to find every tool.': '將照片變成貼紙，加上裝飾，再讓它動起來。這份導覽會介紹你能做的作品，以及各個工具的位置。',
    'Follow the highlights, or jump straight to a feature.': '跟著亮框逐步探索，也可以直接跳至想看的功能。',
    'Your artwork stays as it is. Close the guide whenever you want.': '導覽不會更動你的作品，隨時都能關閉。',
    'Drop it in. Make it yours.': '放入圖片，開始創作',
    'Add images, drag files onto the canvas, or paste from your clipboard. You can import several images together.': '按「加入圖片」、拖曳檔案到畫布，或從剪貼簿貼上。也可以一次匯入多張圖片。',
    'Auto cutout is the default: it removes the background.': '預設使用「自動去背」，會移除圖片背景。',
    'Whole image keeps the full picture and its transparency.': '「完整圖片」保留全圖與原本的透明區域。',
    'Try a sample lets you explore without choosing a file.': '按「試試範例」，不用準備圖片也能體驗。',
    'Everything lives on the canvas': '在畫布上自由排列',
    'Select a sticker to edit it, then drag it into place. The floating toolbar gives you Duplicate, Rotate, Flip, and Delete.': '選取貼紙即可編輯，拖曳就能移動。浮動工具列提供複製、旋轉、翻轉與刪除。',
    'Scroll over a sticker to resize; Shift + scroll rotates.': '在貼紙上滾動滾輪可縮放；按住 Shift 滾動可旋轉。',
    'On touch screens, pinch to resize and twist to rotate.': '觸控螢幕可用雙指縮放與旋轉。',
    'The rotation dial supports full turns and exact degree entry.': '旋轉角度盤支援完整旋轉，也能輸入精確角度。',
    'Keep exactly the parts you love': '留下你想要的部分',
    'Select a photo and open Edit cutout to refine its silhouette by hand.': '選取照片並開啟「編輯去背」，即可手動修整輪廓。',
    'Erase and Restore have brush presets, size, hardness, and strength.': '擦除與還原工具提供筆刷預設、大小、硬度與力度。',
    'Lasso an area to erase, restore, or keep only that area. Feather softens its edge.': '用套索圈選範圍，再選擇擦除、還原或只留圈內；羽化可柔化邊緣。',
    'Colour key removes a connected colour. Zoom, pan, preview the mask, and undo each edit.': '色鍵可移除相連的同色區域。也能縮放、平移、預覽遮罩與復原每次編輯。',
    'Clean edges, or keep the original': '整理邊緣，或保留原圖',
    'The Cutout section controls automatic edge cleanup: working resolution, edge snapping, feathering, smoothing, and growing or shrinking the outline.': '「去背」區塊可調整自動邊緣處理，包括工作解析度、邊緣吸附、羽化、平滑，以及輪廓的擴張或收縮。',
    'Fill holes or remove small fragments from an automatic cutout.': '自動去背後，可填補孔洞或移除細小碎片。',
    'Manual edits keep the edges you draw.': '手動編輯會保留你畫出的邊緣。',
    'Restore original keeps the whole image; Remove background starts a cutout again.': '「還原原圖」保留全圖；「移除背景」可重新開始去背。',
    'Give your picture a new home': '幫照片挑一個新家',
    'Add a frame, then use Discover frames or Style to browse cards, suitcases, capsules, arcades, snow globes, and more.': '加入相框，再透過「探索新相框」或「樣式」，挑選收藏卡、旅行箱、扭蛋、街機、水晶雪球等造型。',
    'Style applies a coordinated look; Design changes the shape.': '「樣式」套用整組搭配；「設計」更換框體造型。',
    'Drop a sticker into its window, or choose one under Photo.': '將貼紙拖進相框視窗，或在「照片」選項中指定。',
    'Edit the caption, small line, lettering, colours, patterns, and photo zoom or position.': '可編輯標題、小字、字體、顏色、圖案，以及照片縮放與位置。',
    'A whole drawer of little goodies': '滿滿一抽屜的小裝飾',
    'Open Icons to search the collections or browse their category tabs.': '開啟「圖示」，搜尋素材或依分類分頁瀏覽。',
    'Add drawn icons, pixel art, blinkies, and animated goodies.': '加入手繪圖示、像素圖、閃動小標籤與動畫素材。',
    'Type an emoji or a short word to turn it into a sticker.': '輸入 emoji 或短文字，就能製作文字貼紙。',
    'Kaomoji are text-only faces, ready to place anywhere.': '顏文字以純文字呈現，可以自由擺放。',
    'Make each icon your own': '打造專屬圖示',
    'Select an icon to reveal its own Properties section. Change its palette, individual colours, outline, size, and rotation.': '選取圖示後，「屬性」會顯示專屬設定，可調整配色、各部位顏色、外框、大小與旋轉。',
    'Text-based icons have editable text.': '文字類圖示可直接修改文字。',
    'Supported faces can blink or change their expression settings.': '支援表情的圖示可眨眼或調整臉部設定。',
    'Each icon can have its own animation, speed, and amount.': '每個圖示都能設定自己的動畫、速度與幅度。',
    'Keep decorations together': '讓裝飾跟著作品走',
    'Select a photo or frame before adding icons to stick them together. You can also drag an icon onto its parent.': '先選取照片或相框再加入圖示，就能讓圖示黏上。也可以將圖示拖到想黏附的物件上。',
    'Attached icons follow the parent when it moves or changes size.': '黏附的圖示會跟著主體移動與縮放。',
    'Use Attach / Detach, or drag the icon away, to separate it.': '使用「黏上／分離」，或將圖示拖開即可分開。',
    'Animated exports include the selected item’s attached icons.': '匯出動畫時，也會包含黏在所選物件上的圖示。',
    'Try a finish in one click': '一鍵換上新材質',
    'The top Preset menu changes the sticker’s material: soft gloss, holographic foil, prism, chrome, glitter, paper, and other finishes.': '頂端「預設」選單可更換貼紙材質，包括柔亮、全像箔膜、稜鏡、鉻金屬、亮粉、紙張等。',
    'Start with a preset, then fine-tune it in Properties.': '先套用預設，再到「屬性」微調。',
    'Material presets keep your chosen lighting comfort and gradient border colours.': '材質預設會保留你調整的柔和光線與漸層邊框配色。',
    'A border with personality': '讓邊框也有個性',
    'Choose a classic solid border, a linear or radial gradient, a conic colour ring, or Rainbow RGB.': '選擇經典單色、線性或放射漸層、環繞漸層，或 RGB 彩虹邊框。',
    'Colour sets give you Candy, Ice, Sunset, Aurora, Neon RGB, and Rainbow.': '配色組合提供糖果、冰藍、夕陽、極光、霓虹 RGB 與彩虹。',
    'Adjust the width, custom colour stops, and gradient angle.': '可調整寬度、自訂漸層顏色與角度。',
    'Foil and bevel controls add a finish to the edge.': '用箔膜與倒角控制項增添邊緣質感。',
    'Pick the exact colour': '選出剛剛好的顏色',
    'Click any colour swatch to open the colour picker. Choose visually, enter an exact hex or RGB value, or reuse a recent colour.': '點擊色塊即可開啟選色器。可以直覺選色、輸入精確 HEX 或 RGB 數值，或重用最近的顏色。',
    'The palette and recent swatches make matching colours quick.': '用色票盤與最近使用的顏色，快速統一配色。',
    'Use the eyedropper to sample your screen when your browser supports it.': '瀏覽器支援時，可用滴管擷取螢幕上的顏色。',
    'Colours update live; the original swatch restores the opening colour.': '色彩即時更新；點原始色塊可還原開啟時的顏色。',
    'Keep the shine comfortable': '讓光澤更柔和',
    'Shine strength adjusts foil, glitter, and reflections together. Lower it for a softer look; 0% removes the shine.': '「光澤強度」一起調整箔膜、亮粉與反光。調低會更柔和；0% 可關閉光澤。',
    'Gentle highlights soften bright peaks and keep printed details readable.': '「柔和反光」可柔化過亮區域，保留圖案細節。',
    'Light follows cursor controls how much the light moves with your pointer.': '「光線跟隨游標」控制光線隨滑鼠移動的程度。',
    'Foil, sparkle, paper, and shadow': '箔膜、亮粉、紙感與陰影',
    'Explore the finish sections below the border to build your own material.': '探索邊框下方的各個材質區塊，調出自己的風格。',
    'Holographic foil: texture, colour spread, metallic tint, and shimmer.': '全像箔膜：紋理、色彩變化、金屬染色與流光。',
    'Glitter and Surface: flakes, gloss, rim glow, paper grain, and printed colour.': '亮粉與表面：亮片、光澤、邊緣發光、紙張顆粒與印刷色彩。',
    'Shadow: opacity, softness, spread, and lift from the canvas.': '陰影：不透明度、柔和度、擴散，以及離開畫布的高度。',
    'Let your stickers move': '讓貼紙動起來',
    'Choose from {count} animations plus Still, from gentle breathing to cartwheels and peekaboo. Photos, frames, and icons share the same choices.': '共有 {count} 種動畫與靜止選項，從輕柔呼吸到側手翻、躲貓貓都有。照片、相框與圖示都能使用。',
    'Speed changes the pace; Amount changes how much it moves.': '速度調整節奏；幅度調整動作大小。',
    'Hover tilt, grab lift, spring, and damping change how it feels to drag.': '懸停傾斜、抓起高度、彈力與阻尼可改變拖曳手感。',
    'The same motions are used in animated exports.': '匯出的動畫也會使用相同動作。',
    'Find every layer': '每個圖層都找得到',
    'Layers lists your stickers, frames, and icons, including which icons are attached to which parent.': '「圖層」列出貼紙、相框與圖示，也會顯示圖示黏在哪個物件上。',
    'Select an item even when another sticker covers it.': '即使物件被其他貼紙蓋住，也能直接選取。',
    'Lock finished items; locking a parent also protects its attached icons.': '完成後可鎖定物件；鎖定主體也會保護黏附的圖示。',
    'Move backward or forward within the same kind. Icons stay above photos and frames.': '同類物件可向後或向前排列；圖示會保持在照片與相框上方。',
    'Set the scene': '布置整個場景',
    'The Scene section changes the canvas backdrop: choose a theme, colour, pattern, and pattern scale.': '「場景」區塊可更換畫布背景，選擇主題、顏色、圖案與圖案大小。',
    'The transparency grid helps you inspect transparent areas.': '透明格線方便檢查透明區域。',
    'Canvas PNG and the recorded clip include the backdrop.': '畫布 PNG 與錄製的短片會包含背景。',
    'Sticker PNG exports keep a transparent background.': '貼紙 PNG 匯出會保留透明背景。',
    'Experiment, reuse, and undo': '放心嘗試，重用喜歡的設定',
    'Copy settings to reuse a look on another item. Paste applies it. Reset all restores the selected item’s controls and the scene backdrop to their defaults.': '用「複製設定」將風格套到其他物件，再按「貼上」套用。「全部重設」會將所選物件的控制項與場景背景還原為預設值。',
    'Double-click a slider to reset just that value.': '雙擊滑桿即可重設該項數值。',
    'Undo / Redo covers movement, edits, styles, frames, and attachments.': '「復原／重做」支援移動、編輯、樣式、相框與黏附操作。',
    'Delete asks for confirmation. Cancel keeps the item; Undo brings a deletion back.': '刪除前會先確認。取消可保留物件，刪除後也能按「復原」找回。',
    'Choose the right download': '選擇適合的匯出方式',
    'Export offers separate choices for the selected sticker, an animation, or the whole canvas.': '「匯出」提供所選貼紙、動畫與整張畫布的不同下載方式。',
    'PNG: transparent sticker, double resolution, posed image, cutout only, or a 512 × 512 sticker pack.': 'PNG：透明貼紙、雙倍解析度、目前姿態、僅去背圖，或 512 × 512 貼圖包。',
    'GIF, animated PNG, and animated SVG include attached icons.': 'GIF、動畫 PNG 與動畫 SVG 都會包含黏附的圖示。',
    'Canvas PNG includes the backdrop. Record a 4-second WebM clip for canvas motion.': '畫布 PNG 包含背景。也可錄製 4 秒 WebM 短片，記錄畫布動態。',
    'Share a layout, keep photos local': '分享版型，照片留在本機',
    'Copy share link saves frames, icons, their settings, and the scene in a link. Uploaded photos are not included.': '「複製分享連結」會將相框、圖示、設定與場景存入連結，不會包含上傳的照片。',
    'Someone opening the link can drop their own photo into the frame.': '開啟連結的人可以放入自己的照片。',
    'Use a PNG or animation when you want to share the finished photo artwork.': '要分享含照片的完成作品，請匯出 PNG 或動畫。',
    'Copy to clipboard is handy for pasting a sticker into another app.': '用「複製到剪貼簿」，就能將貼紙貼到其他應用程式。',
    'Your next sticker starts here': '開始製作下一張貼紙',
    'Start with an image, a sample, or a frame. Add a few goodies, choose a finish, then export something you love.': '從圖片、範例或相框開始，加點裝飾、挑選材質，再匯出喜歡的作品。',
    'Reopen Guide at any time to revisit a feature.': '隨時開啟「導覽」，重新查看任何功能。',
    'The EN / 中文 switch changes the editor and this walkthrough.': 'EN／中文切換會同步更換編輯器與導覽的語言。',
    'Delete this frame?': '要刪除這個相框嗎？', 'Delete this icon?': '要刪除這個圖示嗎？', 'Delete this sticker?': '要刪除這張貼紙嗎？',
    'You can bring it back with Undo.': '刪除後仍可按「復原」找回。',
    'Your photo will return to the canvas.': '相框裡的照片會回到畫布。', 'Attached icons will stay on the canvas.': '黏上的圖示會保留在畫布上。',
    'Flutter': '輕拍翅膀', 'Falling leaf': '落葉飄搖', 'Boomerang': '迴旋飛返', 'Spiral': '螺旋漂移',
    'Skate': '溜冰滑行', 'Cartwheel': '側手翻', 'Scoot': '左右蹦移', 'Peekaboo': '躲貓貓',
    'Discover frames': '探索新相框', 'Detail colour': '細節顏色',
    'Rare collector card': '稀有收藏卡', 'Travel suitcase': '旅行箱', 'Toy capsule': '驚喜扭蛋',
    'Mini arcade': '迷你街機', 'Snow globe': '水晶雪球', 'Potion bottle': '魔法藥水瓶',
    'Starlight rare': '星光稀有卡', 'Bon voyage': '旅途愉快', 'Lucky capsule': '幸運扭蛋',
    'Player one': '一號玩家', 'Snow day': '下雪日', 'Love potion': '戀愛魔法',
    'Rare card': '稀有卡', 'Suitcase': '旅行箱', 'Capsule': '扭蛋', 'Arcade': '街機', 'Potion': '藥水瓶',
    'Colour style': '色彩樣式', 'Colour sets': '配色組合', 'Solid': '單色',
    'Linear gradient': '線性漸層', 'Radial gradient': '放射漸層', 'Conic gradient': '環繞漸層', 'Rainbow RGB': 'RGB 彩虹',
    'Start colour': '起始顏色', 'Middle colour': '中間顏色', 'End colour': '結尾顏色', 'Colour angle': '色彩角度',
    'Ice': '冰藍', 'Sunset': '夕陽', 'Aurora': '極光', 'Neon RGB': '霓虹 RGB', 'border colours': '邊框配色',
    'Lasso': '套索', 'Draw a selection (L)': '圈選範圍（L）', 'Apply selection': '套用選取範圍',
    'Brush presets': '筆刷預設', 'Detail': '細節', 'Soft edge': '柔邊', 'Broad': '大範圍', 'Strength': '力度',
    'Erase inside': '擦除圈內', 'Restore inside': '還原圈內', 'Keep only': '只留圈內', 'Cancel': '取消',
    'Mask': '黑白遮罩', 'Reset cutout': '重設去背', 'Return to the starting cutout or whole image': '回到原本的去背結果或完整圖片',
    'Erased selected area': '已擦除選取範圍', 'Restored selected area': '已還原選取範圍', 'Kept only selected area': '已只保留選取範圍',
    'Selection ready · erase, restore or keep only this area · Esc cancels': '已選取範圍 · 可擦除、還原或只保留圈內 · Esc 取消',
    'Draw a loop around an area, then choose what to keep or erase.': '拖曳圈選範圍，再選擇要保留或擦除的部分。',
    'Your manual edges are preserved. Use brush hardness or lasso feather to soften them. Reset cutout restores the starting mask.': '已保留手動修整的邊緣。可用筆刷硬度或套索羽化柔化邊緣。「重設去背」會回到原本的結果。',
    'Your full image is kept. Remove the background or use Edit cutout to start trimming.': '已保留完整圖片。移除背景或使用「編輯去背」開始修整。',
    'Import as': '匯入方式', 'Auto cutout': '自動去背', 'Whole image': '完整圖片',
    'Applies to uploads, drops and pasted images': '適用於上傳、拖入與貼上的圖片',
    'Drop to add whole images': '放開以加入完整圖片', 'Drop to cut out stickers': '放開以自動去背製作貼紙',
    'Remove background': '移除背景', 'Restore original': '還原原圖', 'Removing background…': '正在移除背景…',
    'Original image restored': '已還原完整原圖', 'Whole image · background kept': '完整圖片 · 已保留背景',
    'Your full image is kept. Remove the background or use Edit cutout to enable edge cleanup.': '已保留完整圖片。移除背景或使用「編輯去背」後，就能調整邊緣。',
    '{name}: whole image added · Remove background is available on the sticker toolbar': '{name}：已加入完整圖片 · 可在貼紙工具列選擇「移除背景」',
    'Each image becomes its own sticker. Auto cutout removes the background; choose Whole image beside Add images to keep the full picture. Drag stickers around, tune their foil, add a portrait frame and scatter some cute icons around.': '每張圖片都會成為一張貼紙。「自動去背」會移除背景；在「加入圖片」旁選擇「完整圖片」，就能保留全圖。自由拖曳貼紙、調整箔膜效果，還能加入相框與可愛圖示。',
    'Breathing': '呼吸', 'Drift': '輕飄', 'Orbit': '繞圈', 'Figure eight': '八字漂浮', 'Jelly': '果凍彈動',
    'Hop': '連跳', 'Shake': '抖動', 'Nod': '點頭', 'Pop': '啵啵彈出', 'Tada': '驚喜搖擺',
    'Lighting': '光線', 'Shine strength': '光澤強度', 'Gentle highlights': '柔和反光',
    'Controls foil, glitter and reflections together. Lower it for a softer finish; 0% removes shine without darkening the artwork.': '一起調整箔膜、亮粉與反光。調低會更柔和；0% 關閉光澤，不會將圖案變暗。',
    'Softens bright peaks and protects printed details when reflections overlap.': '柔化過亮的反光，避免多重光澤蓋過圖案細節。',
    'Lower this to keep the light steadier as you move the cursor.': '調低後，移動游標時光線會更穩定。',
    'Rotation dial': '旋轉角度盤', 'Rotation in degrees': '旋轉角度', 'Reset rotation to 0°': '將旋轉重設為 0°',
    'Adjust rotation': '調整旋轉角度',
    'Rotate counterclockwise 1°': '逆時針旋轉 1°', 'Rotate clockwise 1°': '順時針旋轉 1°',
    'Rotate counterclockwise 90°': '逆時針旋轉 90°', 'Rotate clockwise 90°': '順時針旋轉 90°',
    'Drag dial · Shift snaps to 15°': '拖曳角度盤 · 按住 Shift 以 15° 調整',
    'Drag dial · Use ± for 1° steps': '拖曳角度盤 · 使用 ± 微調 1°',
    'Close colour picker': '關閉選色器', 'Saturation and brightness': '飽和度與明亮度', 'Hue': '色相',
    'Restore opening colour': '還原開啟時的顏色', 'Hex colour': '十六進位色碼', 'Pick a colour from your screen': '從螢幕擷取顏色',
    'Red': '紅', 'Green': '綠', 'Blue': '藍', 'Studio palette': '常用色盤', 'Recently used': '最近使用',
    'Colours update live': '即時預覽顏色', 'Use colour {hex}': '使用顏色 {hex}',
    '{s}% saturation, {v}% brightness': '飽和度 {s}%，明亮度 {v}%',
    'Enter 3 or 6 hex digits, like #F7C6D4.': '請輸入 3 或 6 位色碼，例如 #F7C6D4。',
    'Screen colour picking is unavailable. Use the shade area or hex field.': '目前無法擷取螢幕顏色，請使用選色區或輸入色碼。',
    'Properties': '屬性', 'Layers': '圖層', '{n} layers': '{n} 個圖層', 'Editor panels': '編輯面板', 'Sticker actions': '貼紙操作',
    'Your sticker stack': '你的貼紙圖層', 'Select any item, even when it is covered.': '即使被遮住，也能直接選取。',
    'Canvas layers': '畫布圖層', 'Add a photo, frame or icon. They will appear here.': '加入照片、相框或圖示後，就會顯示在這裡。',
    'Layer order': '圖層順序', 'Move backward': '往後移', 'Move forward': '往前移',
    'Icons stay above photos and frames. Reorder within each kind.': '圖示保持在照片和相框上方，可調整同類型的前後順序。',
    'Duplicate': '複製', 'Rotate': '旋轉', 'Flip': '翻轉', 'Attach': '黏上', 'Detach': '分離', 'Delete': '刪除',
    'Rotate 15°': '旋轉 15°', 'Duplicate with attached icons (Ctrl+D)': '連同黏附圖示一起複製（Ctrl+D）', 'Flip horizontally': '水平翻轉',
    'Attached to {name}': '黏在 {name}', 'Photo: {name}': '照片：{name}', 'Photo sticker': '照片貼紙',
    'Parent locked': '所屬貼紙已鎖定', 'Locked': '已鎖定', 'Unlock the parent first': '請先解鎖所屬貼紙',
    'Unlock {name}': '解鎖 {name}', 'Lock {name}': '鎖定 {name}', 'Locked · unlock in Layers to edit': '已鎖定 · 請在圖層面板解鎖後編輯',
    '{name} copy': '{name} 副本', 'duplicate {name}': '複製 {name}',
    'Duplicated {name} with its attached icons': '已複製 {name} 及黏附圖示',
    'lock {name}': '鎖定 {name}', 'unlock {name}': '解鎖 {name}', 'move forward': '往前移', 'move backward': '往後移',
    'attach icon': '黏上圖示', 'detach icon': '分離圖示', 'flip sticker': '翻轉貼紙', 'rotate sticker': '旋轉貼紙',
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
    'Animated': '動畫', 'Animated SVG': 'SVG 動畫', 'with stuck icons': '含黏附的圖示', 'Animated PNG': 'PNG 動畫', 'lossless loop': '無損循環',
    'Animated GIF': 'GIF 動畫', 'for chats': '適合聊天分享', 'Whole canvas': '整個畫布', 'Canvas PNG': '畫布 PNG', 'with backdrop': '含背景',
    'Record 4 s clip': '錄製 4 秒短片', 'Share': '分享', 'Copy share link': '複製分享連結', 'frames, icons and scene': '相框、圖示與場景',
    /* ---- stage ---- */
    'Sticker preview': '貼紙預覽', 'drag me': '拖曳我', 'release to put it in the frame': '放開就放進相框',
    'release to stick it here': '放開就黏在這裡',
    'Remove sticker': '移除貼紙', 'Remove sticker (Delete)': '移除貼紙（Delete 鍵）',
    'Drop images to make stickers': '拖入圖片，做成貼紙',
    'Each image becomes its own sticker: the main characters are cut out automatically, then you can drag the stickers around, pick one to tune its foil, and remove the ones you don\'t want. Add a portrait frame, drop a sticker into it, write a caption and scatter some cute icons around.':
      '每張圖片都會變成一張貼紙：主角會自動去背，接著可以拖曳貼紙、選一張來調整箔膜效果，不要的就移除。還可以加一個相框，把貼紙放進去、寫上標題，再撒一些可愛的圖示。',
    'Choose files': '選擇檔案', 'Add a frame': '加一個相框',
    'Or paste from the clipboard. Everything runs in your browser; nothing is uploaded.': '也可以直接貼上剪貼簿裡的圖片。所有處理都在瀏覽器裡完成，不會上傳任何東西。',
    'WebGL2 is required': '需要 WebGL2',
    /* ---- cutout editor ---- */
    'Cutout editing canvas': '去背編輯畫布', 'Refine cutout': '微調去背', 'Keep the good bits. Brush away the rest.': '留下喜歡的部分，把多餘的擦掉。',
    'Restore': '還原', 'Erase': '擦除', 'Pan': '平移', 'Brush size': '筆刷大小', 'Hardness': '硬度',
    'Paint to add (B)': '塗抹來還原（B）', 'Paint to erase (E)': '塗抹來擦除（E）', 'Pan (H), or hold Space and drag': '平移（H），或按住空白鍵拖曳',
    'Cutout preview': '去背預覽', 'Overlay': '遮罩', 'White': '白底', 'Black': '黑底', 'Original': '原圖',
    'Zoom controls': '縮放控制', 'Zoom out': '縮小', 'Zoom in': '放大', 'Fit': '適合畫面', 'Finding edges…': '正在尋找邊緣…',
    'Restore with the brush · Alt switches to erase · [ ] resize · Space + drag pans': '用筆刷還原 · Alt 切換擦除 · [ ] 調整大小 · 空白鍵＋拖曳可平移',
    'Erase with the brush · Alt switches to restore · [ ] resize · Space + drag pans': '用筆刷擦除 · Alt 切換還原 · [ ] 調整大小 · 空白鍵＋拖曳可平移',
    'Drag to move the image · scroll or pinch to zoom · Fit resets the view': '拖曳移動畫面 · 滾輪或雙指縮放 ·「適合畫面」重設視角',
    'Original image · choose another preview to resume editing': '原圖檢視 · 選擇其他預覽即可繼續編輯',
    'Keyed out the clicked colour': '已移除點選的顏色',
    'Cutout tools': '去背工具',
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
    'Blink': '眨眼', 'Faces blink now and then.': '表情會偶爾眨眼。', 'Stick to sticker or frame': '黏在貼紙或相框上',
    'Drop an icon on a photo sticker or frame to move them together. Drag it away to detach.': '把圖示拖到照片貼紙或相框上，就能一起移動。拖離即可分開。',
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
    'Bubble tea': '珍珠奶茶', 'Butter toast': '奶油吐司', 'Caramel pudding': '焦糖布丁', 'Peach': '水蜜桃',
    'Ringed planet': '星環行星', 'Flying saucer': '飛碟',
    'Bunny': '小兔子', 'Kitten': '小貓咪', 'Teddy bear': '泰迪熊', 'Frog': '青蛙', 'Baby chick': '小雞', 'Little whale': '小鯨魚',
    'Tulip': '鬱金香', 'Sprout': '嫩芽', 'Mushroom': '蘑菇', 'Potted cactus': '仙人掌盆栽', 'Butterfly': '蝴蝶', 'Lucky clover': '幸運草',
    'Retro camera': '復古相機', 'Headphones': '耳機', 'Game controller': '遊戲手把', 'Open book': '翻開的書', 'Gift box': '禮物盒', 'Pencil': '鉛筆',
    'Animals': '動物', 'Garden': '花園', 'Everyday': '日常小物',
    'Café & sweets': '咖啡甜點', 'Sky': '天空', 'Cute': '可愛', 'With text': '文字', 'Kaomoji': '顏文字', 'Pixel': '像素', 'Pixel art': '像素圖', 'Previous group': '上一組', 'Next group': '下一組',
    'Pixel gifs': '像素動圖', 'Tiny': '迷你', 'Stamps': '郵票', 'Blinkies': '閃閃貼',
    'Tap a face to add it as plain text · type your own in the search box': '點一下即可加入純文字顏文字 · 也可以在搜尋框輸入自己的',
    'Collection': '收藏', 'Type': '類型', 'All goodies': '全部素材', 'All types': '全部類型', 'Kuromi': '酷洛米',
    'Dividers & banners': '分隔線與橫幅', 'Site buttons': '站台按鈕', 'Cursors': '游標', 'Backgrounds': '背景', 'Halloween': '萬聖節',
    'No goodies in this collection and type.': '這個收藏目前沒有此類素材。',
    'Cinnamoroll & Kuromi © Sanrio · original artist credits in pixels/CREDITS.txt': '大耳狗與酷洛米 © Sanrio · 原作者來源見 pixels/CREDITS.txt',
    'Cinnamon sky': '肉桂天空', 'Strawberry milk': '草莓牛奶', 'Mint cream': '薄荷奶油', 'Lavender': '薰衣草', 'Ink & paper': '墨與紙', 'Night glow': '夜光',
    'Cloudy sky': '多雲天空', 'Blossom': '櫻花粉', 'Mint': '薄荷', 'Lemon': '檸檬', 'Café latte': '咖啡拿鐵', 'Notebook': '筆記本', 'Night': '夜晚',
    'Cinnamon café': '肉桂咖啡館', 'Cloud nine': '飄飄雲', 'Sky ticket': '天空票券', 'Sweet pink': '甜甜粉', 'Bakery': '麵包坊', 'Lace doily': '蕾絲墊',
    'Cinnamoroll café': '大耳狗咖啡館', 'Cinnamoroll card': '大耳狗卡片', 'Cinnamoroll': '大耳狗喜拿', 'Cinnamoroll duo': '大耳狗好朋友',
    'Café teacup': '咖啡館茶杯', 'Café cloud': '咖啡館雲朵', 'Frosted cinnamon roll': '糖霜肉桂捲',
    'Classic polaroid': '經典拍立得', 'Night sky': '夜空', 'Photo booth': '大頭貼',
    /* ---- tray ---- */
    'Search, or type an emoji / word': '搜尋，或輸入表情符號／文字', 'Search icons, or type an emoji or word to add': '搜尋圖示，或輸入表情符號、文字來加入',
    'Add {emoji}': '加入 {emoji}', 'Add “{text}”': '加入「{text}」', 'Add': '加入',
    'Any emoji works — type or paste one above and press Enter. A short word becomes a hand-lettered sticker.': '任何表情符號都可以 — 在上方輸入或貼上，再按 Enter。短短的文字會變成手寫貼紙。',
    'Click to add · shift-click keeps the tray open · new icons stick to the selected sticker or frame': '點一下加入 · 按住 Shift 點選可保持貼紙盤開啟 · 新圖示會黏在選取的貼紙或相框上',
    '{n} matches · Enter adds the first, or add the text itself': '找到 {n} 個 · Enter 加入第一個，或加入文字本身',
    '1 match · Enter adds the first, or add the text itself': '找到 1 個 · Enter 加入它，或加入文字本身',
    'No icon by that name · Enter adds it as an emoji / word sticker': '沒有這個名稱的圖示 · 按 Enter 會把它變成表情符號／文字貼紙',
    /* ---- status messages ---- */
    '{name} is in the frame · set Photo to "none" in the panel to take it out': '{name} 已放進相框 · 想拿出來，把面板裡的「照片」設為「無」',
    'Could not decode image': '無法解讀圖片', 'That file is not an image.': '這個檔案不是圖片。', 'Could not load image: {error}': '無法載入圖片：{error}',
    'Added {what} · it sticks and moves with its sticker or frame': '已加入{what} · 它會黏在貼紙或相框上，跟著一起移動', 'Added {what} · drag it anywhere': '已加入{what} · 可以拖到任何地方',
    '{name} placed in the frame · type a caption in the panel': '{name} 已放進相框 · 在面板裡輸入標題',
    'Drop a sticker onto the frame window, or pick one under Photo in the panel': '把貼紙拖到相框窗口，或在面板的「照片」裡選一張',
    'Found the subject with {model} on {engine}': '以 {model}（{engine}）找到主體', 'Found {labels}': '找到 {labels}',
    'person': '人物', 'cat': '貓', 'dog': '狗', 'bird': '鳥', 'horse': '馬', 'cow': '牛', 'sheep': '羊', 'foreground': '前景', 'subject': '主體',
    'No people or animals found — trying the centre of the image…': '沒找到人物或動物 — 改試圖片中央…', 'Selected the subject at the centre': '選取了圖片中央的主體',
    'AI models unavailable — used colour keying': 'AI 模型無法使用 — 改用色彩去背', 'Keying out the background colour…': '正在去除背景顏色…', 'Keyed out the background colour': '已去除背景顏色',
    '{name}: {how} · drag the sticker · Edit cutout to refine': '{name}：{how} · 拖曳貼紙 · 用「編輯去背」微調',
    'The cutout is empty — use Edit cutout to select the subject.': '去背結果是空的 — 請用「編輯去背」選取主體。',
    'Undo · {label}': '復原 · {label}', 'Redo · {label}': '重做 · {label}', 'Undo {label} (Ctrl+Z)': '復原「{label}」（Ctrl+Z）', 'Redo {label} (Ctrl+Shift+Z)': '重做「{label}」（Ctrl+Shift+Z）',
    'move': '移動', 'resize': '調整大小', 'frame style': '相框風格', 'palette': '配色', 'stick to sticker or frame': '黏在貼紙或相框上', 'preset {name}': '預設「{name}」',
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
