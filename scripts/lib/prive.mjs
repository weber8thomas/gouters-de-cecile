// Dossier des vrais médias (photos de Cécile, photos et vidéos des invités) : `prive/`, ignoré par git.
// Ces médias ne servent qu'à une VERSION LOCALE montrée depuis le Mac (npm run medias:local puis
// npm run build:local) ; ils ne doivent jamais se retrouver dans dist/site, ni dans le dépôt.
//
//   GC_PRIVE=<dossier>   pointe ailleurs que prive/ (tests avec un faux dossier, hors du dépôt)
//
// Sorties cuites : prive/baked/ (jamais design-system/baked ni src/content, suivis par git) :
//   videos/<slug>.mp4, videos/<slug>-affiche.webp, photos/<slug>/{tirage,coins}.webp   (invités)
//   photos/cecile-N/{tirage,coins}.webp                                                (album de Cécile)
//   videos.json, photos-cecile.json     équivalents locaux de src/content/videos.json et photos-cecile.json
//   planche-cecile*.png                 planches contact (npm run medias:planche)
// Les noms logiques d'images cuites de la version locale sont préfixés « local/ » (local/videos/lisa,
// local/photos/cecile-3/tirage…) : ils ne recouvrent jamais ceux du design system.
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PRIVE = process.env.GC_PRIVE ? resolve(process.env.GC_PRIVE) : join(ROOT, 'prive');
export const BAKED_LOCAL = join(PRIVE, 'baked');
/** Dossier où la version locale publie les médias cuits (dans dist/local). */
export const DOSSIER_PUBLIE = 'prive-baked';
/** Préfixe des noms logiques des images et vidéos de la version locale. */
export const PREFIXE_LOCAL = 'local/';

export const EXT_PHOTOS = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.tif', '.tiff'];
export const EXT_VIDEOS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'];

/** sha256 d'un fichier, lu par blocs (les vidéos d'origine pèsent plusieurs centaines de Mo). */
export function sha256Fichier(chemin) {
  const h = createHash('sha256');
  const fd = openSync(chemin, 'r');
  try {
    const buf = Buffer.allocUnsafe(8 << 20);
    for (let n; (n = readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n));
  } finally {
    closeSync(fd);
  }
  return h.digest('hex');
}

/** Liste triée des fichiers d'un dossier ayant l'une des extensions, sans les fichiers cachés (.DS_Store, ._x). */
export function listerMedias(dossier, extensions) {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((n) => !n.startsWith('.') && extensions.includes(n.slice(n.lastIndexOf('.')).toLowerCase()) && statSync(join(dossier, n)).isFile())
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}

/** Tous les fichiers d'une arborescence (chemins absolus). */
export function tousLesFichiers(racine) {
  const out = [];
  const marcher = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) marcher(f);
      else if (e.isFile()) out.push(f);
    }
  };
  if (existsSync(racine)) marcher(racine);
  return out;
}
