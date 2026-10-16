// Mesure dans Chromium la hauteur d'x et la hauteur de capitale réelles de chaque police
// (fraction de la taille du corps) → design-system/metrics.json, utilisé par la vérification
// des tailles minimales (hauteur d'x ≥ 14 px pour le texte courant sur la TV).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, ROOT } from './lib/serve.mjs';
import { launch } from './lib/browser.mjs';

const FAMILIES = [['Caveat', 500], ['Cormorant Garamond', 600], ['Playfair Display', 600]];
const srv = await serve();
const browser = await launch();
const page = await browser.newPage();
await page.goto(`${srv.url}/harness/card.html?c=harness/smoke.html`);
await page.waitForFunction(() => window.__gcReady === true);
const metrics = await page.evaluate(async (fams) => {
  const out = {};
  for (const [family, weight] of fams) {
    await document.fonts.load(`${weight} 100px "${family}"`);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${weight} 1000px "${family}"`;
    const x = ctx.measureText('x').actualBoundingBoxAscent / 1000;
    const cap = ctx.measureText('H').actualBoundingBoxAscent / 1000;
    const avg = ctx.measureText('Le cake de Julie, 200 g de farine').width / 1000 / 33;
    out[family] = { xHeight: +x.toFixed(3), capHeight: +cap.toFixed(3), avgCharWidth: +avg.toFixed(3), loaded: document.fonts.check(`${weight} 20px "${family}"`) };
  }
  return out;
}, FAMILIES);
await browser.close();
await srv.close();
writeFileSync(join(ROOT, 'design-system/metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
for (const [k, v] of Object.entries(metrics)) {
  console.log(`${k.padEnd(20)} x ${v.xHeight}  cap ${v.capHeight}  → corps minimal pour 14 px d'x : ${Math.ceil(14 / v.xHeight)} px`);
}
