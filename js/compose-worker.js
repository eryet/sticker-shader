/*
 * compose-worker.js — draws frames and icons and runs their die-cut pipeline
 * off the main thread, so typing a caption never stalls the page. The page
 * falls back to composing on the main thread if the worker cannot start.
 */
importScripts('maskops.js', 'decor.js');

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Patrick+Hand&family=Varela+Round&display=swap';

/* the lettering fonts, loaded into the worker's own font set (falls back to system fonts) */
const fontsReady = (async () => {
  if (typeof FontFace === 'undefined' || !self.fonts) return false;
  try {
    const css = await (await fetch(FONT_CSS)).text();
    const re = /@font-face\s*\{([^}]*)\}/g;
    const loads = [];
    let m;
    while ((m = re.exec(css))) {
      const block = m[1];
      const fam = /font-family:\s*'([^']+)'/.exec(block), url = /url\(([^)]+)\)/.exec(block), range = /unicode-range:\s*([^;]+);/.exec(block);
      if (!fam || !url) continue;
      const face = new FontFace(fam[1], `url(${url[1]})`, range ? { unicodeRange: range[1].trim() } : {});
      loads.push(face.load().then((f) => self.fonts.add(f)).catch(() => {}));
    }
    await Promise.all(loads);
    return loads.length > 0;
  } catch (err) { return false; }
})();

self.onmessage = async (ev) => {
  const m = ev.data;
  if (!m || m.type !== 'compose') return;
  await Promise.all([fontsReady, StickerDecor.referenceReady]);
  try {
    const out = StickerDecor.buildComposed(m.spec);
    const transfer = [out.atlas.image.data.buffer, out.atlas.sdf.buffer, out.mask.buffer];
    if (out.atlas.blink) transfer.push(out.atlas.blink.data.buffer);
    if (out.atlas.assemblyBase) transfer.push(out.atlas.assemblyBase.data.buffer);
    if (out.atlas.frames) for (const f of out.atlas.frames) { transfer.push(f.data.buffer); if (f.sdf) transfer.push(f.sdf.buffer); }
    self.postMessage({ type: 'composed', id: m.id, seq: m.seq, out }, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, seq: m.seq, message: String((err && err.message) || err) });
  }
};
