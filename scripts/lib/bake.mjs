// Cuisson d'images : un SVG (avec ses filtres crayon, aquarelle, papier…) est rendu une fois par
// Chromium puis exporté en WebP ou PNG (transparence conservée) dans design-system/baked/**.
// À l'exécution, aucun filtre : seulement des images. Cache par empreinte (SVG + options + version de
// Chromium) dans design-system/baked/.bake-cache.json : relancer ne refait que ce qui a changé.
//
//   import { createBaker } from '../../scripts/lib/bake.mjs';
//   const baker = await createBaker();
//   await baker.bake({ svg, out: 'paper/base.webp', width: 1024, height: 1024, scale: 1, quality: 0.86 });
//   await baker.close();
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { launch } from './browser.mjs';
import { ROOT } from './serve.mjs';

export const BAKED = join(ROOT, 'design-system/baked');
const CACHE = join(BAKED, '.bake-cache.json');

export async function createBaker({ force = false } = {}) {
  const browser = await launch();
  const version = browser.version();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  let made = 0, kept = 0;

  /**
   * @param {object} o
   * @param {string} o.svg      document SVG complet (viewBox ; width/height facultatifs)
   * @param {string} o.out      chemin sous design-system/baked/ (extension .webp ou .png)
   * @param {number} o.width    largeur de sortie en px (avant scale)
   * @param {number} o.height   hauteur de sortie en px (avant scale)
   * @param {number} [o.scale]  facteur de rendu (1,25 pour la TV, 2 pour les exports)
   * @param {number} [o.quality] qualité WebP (0–1), 0,86 par défaut
   * @param {string} [o.background] couleur de fond (sinon transparent)
   */
  async function bake({ svg, out, width, height, scale = 1, quality = 0.86, background }) {
    const file = join(BAKED, out);
    const key = createHash('sha256').update(JSON.stringify({ svg, width, height, scale, quality, background, version })).digest('hex');
    if (!force && cache[out] === key && existsSync(file)) { kept++; return file; }
    const type = out.endsWith('.png') ? 'image/png' : 'image/webp';
    const dataUrl = await page.evaluate(async ({ svg, W, H, type, quality, background }) => {
      const img = new Image();
      img.decoding = 'sync';
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, W, H); }
      ctx.drawImage(img, 0, 0, W, H);
      return cv.toDataURL(type, quality);
    }, { svg, W: Math.round(width * scale), H: Math.round(height * scale), type, quality, background });
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    cache[out] = key;
    made++;
    return file;
  }

  async function close() {
    mkdirSync(BAKED, { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');
    await browser.close();
    return { made, kept };
  }

  return { bake, close, page };
}
