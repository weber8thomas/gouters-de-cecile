// Inventaire des images cuites (design-system/baked/**) → design-system/assets.json
//   { "<nom logique>": { "file": "baked/…", "sha": "<sha256>", "w": 1024, "h": 1024, "bytes": 12345, "type": "image/webp" } }
// Le nom logique est le chemin sous baked/ sans extension : « paper/base », « pages/julie-gauche ».
// Utilisé par build-bundle (manifeste d'URL par cible) et par le téléversement vers l'artifact.
//
// Les sons du livre (lot S, baked/sons/*.mp3 → noms logiques « sons/<fichier> ») sont inventoriés aussi.
//
// Site seulement (« site": true ») : les vidéos (CONTRACT § 12.3), les sons et l'encre ×4 de la loupe
// (pages/4x/**, § 13.4). Elles vont sur le site, jamais dans l'artifact du design system :
// inventory({ cible: 'artifact' }) les laisse de côté. Sans cible explicite, la cible est lue sur la
// ligne de commande (--target artifact, comme gen-entry et build-bundle la reçoivent).
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BAKED = join(ROOT, 'design-system/baked');
const TYPES = {
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
};

function size(buf, ext) {
  if (ext === '.png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (ext === '.webp') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
    if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  return { w: 0, h: 0 };
}

/** Asset réservé au site (jamais téléversé dans l'artifact) : vidéos, sons, encre ×4 de la loupe. */
export const siteSeulement = (nom, type = '') => /^(video|audio)\//.test(String(type)) || /^pages\/4x\//.test(nom);

/** Cible lue sur la ligne de commande (« --target artifact »), à défaut d'option. */
function cibleDeLaCommande() {
  const i = process.argv.indexOf('--target');
  return i > 0 ? process.argv[i + 1] : undefined;
}

export function inventory({ cible = cibleDeLaCommande() } = {}) {
  const out = {};
  const walk = (p) => {
    if (!existsSync(p)) return;
    for (const n of readdirSync(p).sort()) {
      const f = join(p, n);
      if (statSync(f).isDirectory()) { walk(f); continue; }
      const ext = extname(n).toLowerCase();
      if (!TYPES[ext]) continue;
      const buf = readFileSync(f);
      const name = relative(BAKED, f).split('\\').join('/').replace(/\.[^.]+$/, '');
      if (out[name]) throw new Error(`nom d'asset en double : ${name}`);
      const site = siteSeulement(name, TYPES[ext]);
      if (site && cible === 'artifact') continue;
      out[name] = { file: `baked/${relative(BAKED, f).split('\\').join('/')}`, sha: createHash('sha256').update(buf).digest('hex'), ...size(buf, ext), bytes: buf.length, type: TYPES[ext], ...(site ? { site: true } : {}) };
    }
  };
  walk(BAKED);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inv = inventory();
  writeFileSync(join(ROOT, 'design-system/assets.json'), JSON.stringify(inv, null, 2) + '\n');
  const total = Object.values(inv).reduce((s, a) => s + a.bytes, 0);
  const site = Object.values(inv).filter((a) => a.site);
  console.log(`assets.json : ${Object.keys(inv).length} images, ${(total / 1048576).toFixed(2)} Mo (dont ${site.length} pour le site seulement : vidéos, sons, encre ×4)`);
}
