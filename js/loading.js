/* An independent startup curtain: its artwork never needs a network request. */
window.StickerLoading = (() => {
  'use strict';
  const root = document.documentElement;
  let locale;
  try { locale = localStorage.getItem('sticker-shader-editor:locale'); } catch (_) {}
  if (!['en', 'zh-TW'].includes(locale)) {
    const language = (navigator.languages || [navigator.language]).find(l => /^(en|zh)/i.test(l)) || 'en';
    locale = /^zh/i.test(language) ? 'zh-TW' : 'en';
  }
  root.dataset.loadingLocale = locale;
  root.classList.add('is-loading');
  let finished = false, failed = false, resolveStyles;
  const stylesReady = new Promise(resolve => { resolveStyles = resolve; });
  const domReady = new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  // Optional resources can finish later using the editor's existing refresh callbacks.
  const optional = (promise, ms = 8000) => new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    Promise.resolve(promise).then(done, done);
    function done(value) { clearTimeout(timer); resolve(value); }
  });
  const fontsReady = (async () => {
    await Promise.all([domReady, stylesReady]);
    if (!document.fonts) return;
    await Promise.allSettled([
      document.fonts.load('40px "Patrick Hand"'),
      document.fonts.load('40px "Varela Round"'),
    ]);
    await document.fonts.ready;
  })();

  function fail() {
    if (finished) return;
    failed = true;
    clearTimeout(watchdog);
    const loader = document.getElementById('siteLoader');
    if (!loader) { domReady.then(fail); return; }
    loader.classList.add('has-error');
    document.getElementById('loadingMessage').hidden = true;
    document.getElementById('loadingError').hidden = false;
    document.getElementById('loadingRetry').hidden = false;
  }
  const watchdog = setTimeout(fail, 20000);
  function resourceError(event) {
    const target = event.target;
    if (target?.tagName === 'SCRIPT' || event.filename?.endsWith('/js/app.js') || (target?.tagName === 'LINK' && ['styles.css', 'motion.css'].some(name => target.href.endsWith('/' + name)))) fail();
  }
  window.addEventListener('error', resourceError, true);
  async function ready(tasks) {
    await Promise.allSettled(tasks);
    if (finished) return;
    // Give final font/layout and canvas updates a paint before revealing the editor.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    finished = true;
    clearTimeout(watchdog);
    window.removeEventListener('error', resourceError, true);
    root.classList.remove('is-loading');
    root.classList.add('loading-done');
    const loader = document.getElementById('siteLoader');
    const heldFocus = loader?.contains(document.activeElement);
    loader?.setAttribute('aria-hidden', 'true');
    if (heldFocus) document.getElementById('btnAddImages')?.focus({ preventScroll: true });
    setTimeout(() => { loader?.remove(); root.classList.remove('loading-done'); delete root.dataset.loadingLocale; }, 220);
  }
  domReady.then(() => {
    if (failed) fail();
  });
  return { ready, optional, fontsReady, fontsLoaded: () => resolveStyles(), fail };
})();
