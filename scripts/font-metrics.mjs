// Mesure dans Chromium la hauteur d'x et la hauteur de capitale réelles de chaque police
// (fraction de la taille du corps), et vérifie la couverture des glyphes du français
// (table cmap lue avec opentype.js sur les fichiers .woff de Fontsource).
// → design-system/metrics.json, utilisé pour dimensionner les mains et par la vérification
//   des tailles minimales (hauteur d'x ≥ 14 px pour le texte courant sur la TV).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';
import { serve, ROOT } from './lib/serve.mjs';
import { launch } from './lib/browser.mjs';

// [famille CSS, graisse mesurée, fichier .woff (couverture des glyphes)]
const FAMILIES = [
  ['Caveat', 500, '@fontsource/caveat/files/caveat-latin-500-normal.woff'],
  ['Playfair Display', 600, '@fontsource/playfair-display/files/playfair-display-latin-600-normal.woff'],
  ['Playwrite FR Trad', 400, '@fontsource/playwrite-fr-trad/files/playwrite-fr-trad-latin-400-normal.woff'],
  ['Playwrite FR Moderne', 400, '@fontsource/playwrite-fr-moderne/files/playwrite-fr-moderne-latin-400-normal.woff'],
  ['Kalam', 400, '@fontsource/kalam/files/kalam-latin-400-normal.woff'],
  ['Shantell Sans', 500, '@fontsource-variable/shantell-sans/files/shantell-sans-latin-full-normal.woff2'],
  ['Patrick Hand SC', 400, '@fontsource/patrick-hand-sc/files/patrick-hand-sc-latin-400-normal.woff'],
  ['La Belle Aurore', 400, '@fontsource/la-belle-aurore/files/la-belle-aurore-latin-400-normal.woff'],
];
// Glyphes indispensables au carnet
export const FR_GLYPHS = 'éèêëàâäùûüçîïôöœŒæÉÈÊÀÂÇÎÔÙ«»’‘“”…–—°½¼¾·×€ ';

function coverage(woff) {
  const file = join(ROOT, 'node_modules', woff);
  if (!existsSync(file) || woff.endsWith('.woff2')) return null; // opentype.js ne lit pas le woff2
  const buf = readFileSync(file);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return [...FR_GLYPHS].filter((ch) => !font.charToGlyphIndex(ch)).join('');
}

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
    const m = (t) => ctx.measureText(t);
    // Hauteur d'x : médiane des lettres basses n, o, u (le « x » seul trompe : celui de La Belle
    // Aurore est bien plus haut que ses autres lettres basses)
    // Mesure au pixel (rendu à 400 px, seuil d'encre à 50 %) : le canvas arrondit au 1/64 d'em.
    const inkTop = (ch) => {
      const S = 400, cv = document.createElement('canvas');
      cv.width = 600; cv.height = 900;
      const c2 = cv.getContext('2d');
      c2.font = `${weight} ${S}px "${family}"`;
      c2.textBaseline = 'alphabetic';
      c2.fillText(ch, 100, 600);
      const d = c2.getImageData(0, 0, 600, 600).data;
      for (let y = 0; y < 600; y++) for (let x = 0; x < 600; x++) if (d[(y * 600 + x) * 4 + 3] > 127) return (600 - y) / S;
      return 0;
    };
    const lows = ['n', 'o', 'u'].map(inkTop).sort((a, b) => a - b);
    const x = lows[1];
    const stems = Math.max(...['b', 'd', 'f', 'h', 'k', 'l', 't', '0', '1', '4', '7', '8'].map((t) => m(t).actualBoundingBoxAscent / 1000));
    const cap = m('H').actualBoundingBoxAscent / 1000;
    const asc = m('dbklhf').actualBoundingBoxAscent / 1000;
    const desc = m('gjpqy').actualBoundingBoxDescent / 1000;
    const avg = m('Le cake citron de Julie, 200 g de farine').width / 1000 / 40;
    out[family] = {
      xHeight: +x.toFixed(3), capHeight: +cap.toFixed(3), ascender: +asc.toFixed(3), descender: +desc.toFixed(3), stems: +stems.toFixed(3),
      avgCharWidth: +avg.toFixed(3), loaded: document.fonts.check(`${weight} 20px "${family}"`),
    };
  }
  return out;
}, FAMILIES);
await browser.close();
await srv.close();
for (const [family, , woff] of FAMILIES) metrics[family].missing = coverage(woff);
writeFileSync(join(ROOT, 'design-system/metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
for (const [k, v] of Object.entries(metrics)) {
  console.log(`${k.padEnd(22)} x ${v.xHeight}  cap ${v.capHeight}  asc ${v.ascender}  desc ${v.descender}  car ${v.avgCharWidth}  ${v.loaded ? 'chargée' : 'NON CHARGÉE'}  manque « ${v.missing ?? '?'} »  → 14 px d'x : ${Math.ceil(14 / v.xHeight)} px`);
}
