// Lance le Chromium préinstallé (jamais de « playwright install »).
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

export async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    const fallback = '/opt/pw-browsers/chromium';
    if (existsSync(fallback)) return chromium.launch({ executablePath: fallback });
    throw e;
  }
}

// Ouvre une carte (preview.html) dans le banc d'essai et attend fonts + rendu.
export async function openCard(browser, baseUrl, cardPath, { width = 1920, height = 1080, dpr = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${baseUrl}/harness/card.html?c=${encodeURIComponent(cardPath)}`);
  await page.waitForFunction(() => window.__gcReady === true, null, { timeout: 30000 });
  const harnessError = await page.evaluate(() => window.__gcError);
  if (harnessError) errors.push(harnessError);
  await page.waitForTimeout(150);
  return { page, errors };
}
