// Capture une ou plusieurs cartes du design system dans le banc d'essai.
//   node scripts/shot.mjs src/components/Ecrin/preview.html [autre.html…] [--w 1920] [--h 1080] [--dpr 1] [--out verification/out]
//     [--bundle dist/ds-f3/components]  (bundle isolé construit avec build-bundle.mjs --tag f3) [--full]
// Chaque capture est écrite dans <out>/<Dossier>.png ; les erreurs de la page sont affichées.
import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { serve, ROOT } from './lib/serve.mjs';
import { launch, openCard } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : d; };
const width = Number(opt('w', 1920)), height = Number(opt('h', 1080)), dpr = Number(opt('dpr', 1));
const outDir = join(ROOT, opt('out', 'verification/out'));
const bundle = opt('bundle');
const full = args.includes('--full'); const cards = args.filter((a) => !a.startsWith('--'));
mkdirSync(outDir, { recursive: true });

const srv = await serve();
const browser = await launch();
let failed = 0;
for (const card of cards) {
  const { page, errors } = await openCard(browser, srv.url, card, { width, height, dpr, bundle });
  const name = card.endsWith('preview.html') ? basename(dirname(card)) : basename(card).replace(/\.html$/, '');
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  console.log(`${errors.length ? '✗' : '✓'} ${file}`);
  for (const e of errors) console.log(`    ${e}`);
  if (errors.length) failed++;
  await page.close();
}
await browser.close();
await srv.close();
process.exit(failed ? 1 : 0);
