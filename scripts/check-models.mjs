/*
 * Confirms that every AI model the editor downloads comes from a pinned address
 * and is still exactly the file we tested.
 *
 *   node scripts/check-models.mjs                   all four models (about 63 MB)
 *   node scripts/check-models.mjs --skip-optional   skip the 44 MB opt-in RMBG-1.4
 *
 * Needs Node 18 or later and nothing else. It reads the addresses from
 * js/segmenter.js, so it checks what the site actually ships. For each model it
 *   1. checks the address names a fixed version (no `latest`, no `main`),
 *   2. downloads it the way a browser would, checking at every redirect that
 *      other sites are allowed to fetch it (CORS),
 *   3. compares its size and SHA-256 fingerprint with EXPECTED below.
 * U²-Netp is also compared with the official rembg release on GitHub, because
 * the editor loads it from a personal Hugging Face mirror. The jsDelivr runtime
 * packages and the test setup (test/e2e.mjs) are checked for the same pins.
 * Exits with code 1 if anything fails.
 *
 * To change a model on purpose, update its address in js/segmenter.js and its
 * size and fingerprint here in the same commit, so reviewers see both.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_OPTIONAL = process.argv.includes('--skip-optional');
const ORIGIN = 'https://sticker-shader.example';   // any other site, as a browser would send it

const EXPECTED = {
  deeplab: {
    label: 'DeepLab v3 · backup subject finder (people and animals)',
    bytes: 2780176,
    sha256: 'ff36e24d40547fe9e645e2f4e8745d1876d6e38b332d39a82f0bf0f5d1d561b3',
  },
  interactive: {
    label: 'Magic Touch · cleans up cutout edges',
    bytes: 6227884,
    sha256: 'e24338a717c1b7ad8d159666677ef400babb7f33b8ad60c4d96db4ecf694cd25',
  },
  u2netp: {
    label: 'U²-Netp · default subject finder',
    bytes: 4574861,
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
    official: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
  },
  rmbg: {
    label: 'RMBG-1.4 · optional, off unless STICKER_CONFIG asks for it',
    bytes: 44403226,
    sha256: 'a6648479275dfd0ede0f3a8abc20aa5c437b394681b05e5af6d268250aaf40f3',
    optional: true,
  },
};

let failures = 0;
const row = (name, ok, text) => {
  if (!ok) failures++;
  console.log(`  ${name.padEnd(9)} ${ok ? 'PASS' : 'FAIL'}  ${text}`);
};
const info = (name, text) => console.log(`  ${name.padEnd(9)} ${text}`);
const isRemote = url => /^https?:\/\//.test(url);

/* Does the address name a fixed version? */
function pinStatus(url) {
  if (!isRemote(url)) return { ok: true, text: 'served from this site' };
  const { hostname, pathname } = new URL(url);
  if (hostname === 'storage.googleapis.com') {
    const version = pathname.split('/').at(-2);
    return /^\d+$/.test(version)
      ? { ok: true, text: `MediaPipe model version ${version}` }
      : { ok: false, text: `uses "${version}" instead of a version number` };
  }
  if (hostname === 'huggingface.co') {
    const ref = (pathname.match(/\/resolve\/([^/]+)\//) || [])[1];
    return /^[0-9a-f]{40}$/.test(ref)
      ? { ok: true, text: `Hugging Face commit ${ref}` }
      : { ok: false, text: `uses "${ref}" instead of a 40-character commit id` };
  }
  return { ok: false, text: `unknown host ${hostname}: add a rule to pinStatus() in this script` };
}

/* Download like a browser on another site: follow redirects by hand and check CORS at each step. */
async function download(url) {
  if (!isRemote(url)) {
    const data = fs.readFileSync(path.join(ROOT, url));
    return { bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), cors: true, hops: 0 };
  }
  let cors = true, hops = 0;
  for (;;) {
    const res = await fetch(url, { redirect: 'manual', headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(300_000) });
    const allow = res.headers.get('access-control-allow-origin');
    if (allow !== '*' && allow !== ORIGIN) cors = false;
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (++hops > 5) throw new Error('too many redirects');
      await res.body?.cancel();
      url = new URL(res.headers.get('location'), url).href;
      continue;
    }
    if (!res.ok) throw new Error(`download failed with HTTP ${res.status}`);
    const hash = crypto.createHash('sha256'); let bytes = 0;
    for await (const chunk of res.body) { hash.update(chunk); bytes += chunk.length; }
    return { bytes, sha256: hash.digest('hex'), cors, hops };
  }
}

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const segmenter = read('js/segmenter.js');
const block = (segmenter.match(/models:\s*\{([\s\S]*?)\n\s*\},/) || [])[1];
if (!block) { console.error('Could not find the `models: { ... }` list in js/segmenter.js'); process.exit(1); }
const models = Object.fromEntries([...block.matchAll(/^\s*(\w+):\s*'([^']*)'/gm)].map(m => [m[1], m[2]]));

console.log('\nModel files (js/segmenter.js)\n');
for (const [key, url] of Object.entries(models)) {
  const want = EXPECTED[key];
  console.log(`${key} · ${want ? want.label : 'not listed in this script'}`);
  info('address', url);
  if (!want) { row('expected', false, 'add its size and SHA-256 to EXPECTED in scripts/check-models.mjs'); console.log(); continue; }
  const pin = pinStatus(url);
  row('pinned', pin.ok, pin.text);
  if (want.optional && SKIP_OPTIONAL) { info('download', 'skipped (--skip-optional)'); console.log(); continue; }
  try {
    const got = await download(url);
    if (isRemote(url)) row('browser', got.cors, got.cors ? `other sites may download it (CORS)${got.hops ? `, ${got.hops} redirect${got.hops > 1 ? 's' : ''}` : ''}` : 'CORS headers missing: browsers would block this download');
    row('size', got.bytes === want.bytes, got.bytes === want.bytes ? `${got.bytes.toLocaleString('en-US')} bytes` : `${got.bytes.toLocaleString('en-US')} bytes, expected ${want.bytes.toLocaleString('en-US')}`);
    row('sha256', got.sha256 === want.sha256, got.sha256 === want.sha256 ? got.sha256 : `${got.sha256}\n                  expected ${want.sha256}`);
    if (want.official) {
      const off = await download(want.official);
      row('official', off.sha256 === want.sha256, off.sha256 === want.sha256 ? `same file as ${want.official}` : `differs from ${want.official} (${off.sha256})`);
    }
  } catch (err) {
    row('download', false, err.message);
  }
  console.log();
}
for (const key of Object.keys(EXPECTED)) {
  if (!(key in models)) { console.log(key); row('address', false, 'listed in this script but missing from js/segmenter.js'); console.log(); }
}

console.log('Runtime packages (js/segmenter.js)\n');
for (const [, key, url] of segmenter.matchAll(/^\s*(cdn|ort):\s*'([^']*)'/gm)) {
  const version = (url.match(/@(\d+\.\d+\.\d+)(?:\/|$)/) || [])[1];
  row(key, !!version, version ? `${url}  (version ${version})` : `${url}  has no exact version`);
}

console.log('\nTest setup (test/e2e.mjs)\n');
const shipped = new Set(Object.values(models));
const testUrls = [...read('test/e2e.mjs').matchAll(/'(https:\/\/(?:storage\.googleapis\.com|huggingface\.co)\/[^'*]+)'/g)].map(m => m[1]);
const stray = testUrls.filter(u => !shipped.has(u));
row('models', stray.length === 0, stray.length ? `uses addresses the site does not: ${stray.join(', ')}` : `downloads the same ${testUrls.length} addresses as the site`);

console.log(failures ? `\n${failures} check${failures > 1 ? 's' : ''} failed.\n` : '\nAll checks passed.\n');
process.exitCode = failures ? 1 : 0;
