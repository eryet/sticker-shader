/* Render the editable Prism Pop artwork to a crawler-friendly PNG. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(root, 'assets/social-preview.svg')).href);
  await page.evaluate(() => document.fonts.ready);
  const output = path.join(root, 'assets/social-preview.png');
  await page.screenshot({ path: output });
  console.log(`Rendered 1200 x 630 social preview (${(await fs.stat(output)).size} bytes): ${output}`);
} finally {
  await browser.close();
}
