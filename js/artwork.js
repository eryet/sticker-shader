/* Local artwork library. Blobs stay in IndexedDB; scene records own decoded art. */
window.StickerArtwork = (() => {
  'use strict';
  const tr = (s, p) => I18N.t(s, p), items = new Map();
  let db, onAdd, importKind = 'icon', busy = false;
  const urls = [];
  const $ = s => document.querySelector(s);
  function transaction(mode, action) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('artwork', mode), request = action(tx.objectStore('artwork'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage unavailable'));
    });
  }
  const ready = (async () => {
    try {
      db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('sticker-shader-artwork', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('artwork', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      const saved = await transaction('readonly', s => s.getAll());
      for (const item of saved.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) items.set(item.id, item);
    } catch (e) { db = null; }
  })();
  function status(text) { $('#artworkStatus').textContent = text; }
  function render() {
    for (const url of urls) URL.revokeObjectURL(url); urls.length = 0;
    const library = $('#artworkLibrary'); library.replaceChildren();
    if (!items.size) {
      const empty = document.createElement('p'); empty.className = 'artwork-note'; empty.textContent = tr('Your imported artwork will appear here.'); library.appendChild(empty);
    }
    for (const item of items.values()) {
      const card = document.createElement('div'); card.className = 'artwork-card';
      const add = document.createElement('button'); add.type = 'button'; add.className = 'artwork-add'; add.dataset.artwork = item.id;
      add.setAttribute('aria-label', tr('Add {name}', { name: item.name }));
      const img = document.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(item.preview || item.blob); urls.push(img.src);
      const name = document.createElement('span'); name.textContent = item.name; name.title = item.name;
      const kind = document.createElement('small'); kind.textContent = tr(item.kind === 'frame' ? 'Custom frame' : 'Custom icon');
      add.append(img, name, kind); add.disabled = busy;
      add.addEventListener('click', async () => {
        if (busy) return;
        setBusy(true); status(tr('Adding artwork…'));
        try { await onAdd(item); $('#artworkDialog').close(); }
        catch (e) { status(tr('Could not import {name}: {error}', { name: item.name, error: e.message })); }
        finally { setBusy(false); }
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn small'; remove.textContent = tr('Remove'); remove.disabled = busy;
      remove.setAttribute('aria-label', tr('Remove {name} from library', { name: item.name }));
      remove.addEventListener('click', async () => {
        if (busy) return;
        setBusy(true);
        try { if (db) await transaction('readwrite', s => s.delete(item.id)); items.delete(item.id); render(); status(tr('Removed from library. Copies on the canvas are kept.')); }
        catch (e) { status(tr('Could not import {name}: {error}', { name: item.name, error: e.message })); }
        finally { setBusy(false); }
      });
      card.append(add, remove); library.appendChild(card);
    }
  }
  function setBusy(value) {
    busy = value;
    $('#artworkDialog').setAttribute('aria-busy', String(value));
    $('#artworkDialog').querySelectorAll('button:not(#closeArtwork)').forEach(b => { b.disabled = value; });
  }
  async function open() {
    await ready; render();
    status(db ? '' : tr('Browser storage is unavailable. Imports will last only for this session.'));
    if (!$('#artworkDialog').open) $('#artworkDialog').showModal();
  }
  function init(add) {
    onAdd = add;
    $('#btnArtwork').addEventListener('click', open);
    $('#closeArtwork').addEventListener('click', () => $('#artworkDialog').close());
    for (const kind of ['Icon', 'Frame']) $('#import' + kind).addEventListener('click', () => { importKind = kind.toLowerCase(); $('#artworkFiles').click(); });
    $('#artworkFiles').addEventListener('change', async e => {
      const files = [...e.target.files], kind = importKind; e.target.value = '';
      if (!files.length || busy) return;
      setBusy(true); const failures = []; let added = 0, saved = true;
      for (const blob of files) {
        status(tr('Importing {name}…', { name: blob.name }));
        try {
          if (blob.size > 20 * 1024 * 1024) throw new Error(tr('Choose a file smaller than 20 MB.'));
          if (!/\.(png|webp|jpe?g|gif)$/i.test(blob.name)) throw new Error(tr('Choose a PNG, WebP, JPG or GIF image.'));
          const item = { id: crypto.randomUUID(), kind, name: blob.name, blob, createdAt: Date.now() };
          // Decode and compose successfully before committing the upload to storage.
          await onAdd(item);
          items.set(item.id, item); added++;
          try { if (db) await transaction('readwrite', s => s.put(item)); else saved = false; }
          catch (e) { saved = false; }
        } catch (e) { failures.push(tr('Could not import {name}: {error}', { name: blob.name, error: e.message })); }
      }
      render(); setBusy(false);
      status([added ? tr('Added {n} items. Click a thumbnail to add another copy.', { n: added }) : '',
        !saved ? tr('Browser storage is unavailable. Imports will last only for this session.') : '', ...failures].filter(Boolean).join(' '));
    });
    I18N.onChange(() => { if ($('#artworkDialog').open) { render(); if (!busy) status(db ? '' : tr('Browser storage is unavailable. Imports will last only for this session.')); } });
  }
  /* Only enclosed transparency is a photo opening. Transparent canvas margins
   * must stay transparent. Keep the largest enclosed region as the aperture. */
  async function findOpening(image) {
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
    const { width: w, height: h } = c, data = ctx.getImageData(0, 0, w, h).data, n = w * h;
    const seen = new Uint8Array(n), queue = new Uint32Array(n);
    const flood = start => {
      let head = 0, tail = 1; queue[0] = start; seen[start] = 1;
      const add = i => { if (!seen[i] && data[i * 4 + 3] < 128) { seen[i] = 1; queue[tail++] = i; } };
      while (head < tail) {
        const i = queue[head++], x = i % w;
        if (x) add(i - 1); if (x + 1 < w) add(i + 1);
        if (i >= w) add(i - w); if (i + w < n) add(i + w);
      }
      return tail;
    };
    const visit = i => { if (!seen[i] && data[i * 4 + 3] < 128) flood(i); };
    for (let x = 0; x < w; x++) { visit(x); visit(n - w + x); }
    for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
    let largest = new Uint32Array(0);
    for (let i = 0; i < n; i++) if (!seen[i] && data[i * 4 + 3] < 128) {
      const count = flood(i); if (count > largest.length) largest = queue.slice(0, count);
    }
    if (largest.length < Math.max(4, n * .002)) return null;
    const mask = ctx.createImageData(w, h); let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (const i of largest) {
      mask.data.fill(255, i * 4, i * 4 + 4);
      const x = i % w, y = Math.floor(i / w); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    ctx.putImageData(mask, 0, 0);
    return { mask: await createImageBitmap(c), window: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
  }
  return { init, open, findOpening };
})();
