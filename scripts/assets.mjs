// Inventaire des images cuites (design-system/baked/**) → design-system/assets.json
//   { "<nom logique>": { "file": "baked/…", "sha": "<sha256>", "w": 1024, "h": 1024, "bytes": 12345, "type": "image/webp" } }
// Le nom logique est le chemin sous baked/ sans extension : « paper/base », « pages/julie-gauche ».
// Utilisé par build-bundle (manifeste d'URL par cible) et par le téléversement vers l'artifact.
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BAKED = join(ROOT, 'design-system/baked');
const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm' };

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

export function inventory() {
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
      out[name] = { file: `baked/${relative(BAKED, f).split('\\').join('/')}`, sha: createHash('sha256').update(buf).digest('hex'), ...size(buf, ext), bytes: buf.length, type: TYPES[ext] };
    }
  };
  walk(BAKED);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inv = inventory();
  writeFileSync(join(ROOT, 'design-system/assets.json'), JSON.stringify(inv, null, 2) + '\n');
  const total = Object.values(inv).reduce((s, a) => s + a.bytes, 0);
  console.log(`assets.json : ${Object.keys(inv).length} images, ${(total / 1048576).toFixed(2)} Mo`);
}
