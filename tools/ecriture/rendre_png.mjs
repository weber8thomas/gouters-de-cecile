// Rend un SVG en PNG avec le Chromium préinstallé (scripts/lib/browser.mjs).
// Usage : node tools/ecriture/rendre_png.mjs entree.svg sortie.png [largeur_px] [--zone x,y,l,h]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from '../../scripts/lib/browser.mjs';

const args = process.argv.slice(2);
const zi = args.indexOf('--zone');
const zone = zi >= 0 ? args.splice(zi, 2)[1].split(',').map(Number) : null;
const [entree, sortie, largeurArg] = args;
const svg = readFileSync(resolve(entree), 'utf8');
const m = svg.match(/viewBox="([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
const vw = m ? parseFloat(m[3]) : 1200;
const vh = m ? parseFloat(m[4]) : 800;
const largeur = Math.round(parseFloat(largeurArg || vw));
const hauteur = Math.round((largeur * vh) / vw);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: Math.min(largeur, 4000), height: Math.min(hauteur, 4000) }, deviceScaleFactor: 1 });
const html = `<!doctype html><html><body style="margin:0;background:#fff">${svg
  .replace(/<\?xml[^>]*>/, '')
  .replace(/<svg ([^>]*?)width="[\d.]+" height="[\d.]+"/, '<svg $1')
  .replace('<svg ', `<svg width="${largeur}" height="${hauteur}" `)}</body></html>`;
await page.setContent(html);
const clip = zone ? { x: zone[0], y: zone[1], width: zone[2], height: zone[3] } : { x: 0, y: 0, width: largeur, height: hauteur };
await page.screenshot({ path: resolve(sortie), clip, fullPage: true });
await browser.close();
console.log(`${sortie} ${clip.width}×${clip.height}`);
