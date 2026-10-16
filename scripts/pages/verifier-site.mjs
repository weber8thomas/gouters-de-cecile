// Vérifie le site construit (vite build) avec les pages cuites : iPhone 13 portrait et ordinateur
// 1440 × 900, liens profonds #julie et #rose ; aucune erreur de page, aucune requête en échec (404),
// toutes les images des pages cuites décodées. Captures dans <out>/site-*.png.
//
//   node scripts/gen-entry.mjs --target site && npx vite build --outDir /tmp/n3-site --emptyOutDir
//   node scripts/pages/verifier-site.mjs /tmp/n3-site [--out verification/out/n3]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { devices } from 'playwright';
import { serve, ROOT } from '../lib/serve.mjs';
import { launch } from '../lib/browser.mjs';

const args = process.argv.slice(2);
const racine = resolve(args.find((a) => !a.startsWith('--')) ?? '/tmp/n3-site');
const oi = args.indexOf('--out');
const out = resolve(ROOT, oi >= 0 ? args[oi + 1] : 'verification/out/n3');
mkdirSync(out, { recursive: true });

const ECRANS = {
  'iphone13-portrait': { ...devices['iPhone 13'], defaultBrowserType: undefined },
  'ordi-1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const LIENS = ['julie', 'rose'];

const srv = await serve(racine);
const browser = await launch();
let echecs = 0;
for (const [nom, ecran] of Object.entries(ECRANS)) {
  const { defaultBrowserType, ...ctxOpts } = ecran;
  const ctx = await browser.newContext(ctxOpts);
  for (const lien of LIENS) {
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(`erreur : ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`console : ${m.text()}`); });
    page.on('response', (r) => { if (r.status() >= 400) erreurs.push(`${r.status()} ${r.url()}`); });
    page.on('requestfailed', (r) => erreurs.push(`échec ${r.url()} ${r.failure()?.errorText ?? ''}`));
    await page.goto(`${srv.url}/index.html#${lien}`);
    await page.waitForSelector('.gc-page-cuite', { timeout: 20000, state: 'attached' });
    await page.waitForTimeout(1200);
    // images des pages cuites visibles : chargées et décodées
    const imgs = await page.evaluate(async () => {
      const els = [...document.querySelectorAll('.gc-page-cuite img')];
      await Promise.all(els.map((i) => (i.decode ? i.decode().catch(() => null) : null)));
      return els.map((i) => ({ src: i.src.split('/').pop(), ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth }));
    });
    const ko = imgs.filter((i) => !i.ok);
    const fichier = join(out, `site-${nom}-${lien}.png`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: fichier });
    const pages = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-gc-page-cuite]')].map((e) => e.getAttribute('data-gc-page-cuite')))]);
    const bilan = erreurs.length || ko.length ? '✗' : '✓';
    if (bilan === '✗') echecs++;
    console.log(`${bilan} ${nom} #${lien} : ${imgs.length} images de pages cuites (${pages.join(', ')}) → ${fichier}`);
    for (const e of erreurs) console.log(`    ${e}`);
    for (const i of ko) console.log(`    image non décodée : ${i.src}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
await srv.close();
process.exit(echecs ? 1 : 0);
