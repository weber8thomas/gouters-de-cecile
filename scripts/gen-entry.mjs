// Génère les points d'entrée TypeScript à partir des dossiers, pour que les sous-agents
// n'aient jamais à modifier un fichier partagé :
//   components.gen.ts    — export * de chaque src/components/<Comp>/index.ts
//                          + Artboards { <Nom>: composant } depuis src/artboards/<Nom>/index.ts
//   assets.gen.ts        — URL des images cuites (design-system/baked/**) selon la cible :
//                          artifact → /_blob/<id> (design-system/assets.lock.json) · harness → /design-system/baked/…
//                          · site → ./design-system/baked/…
// Par défaut dans src/generated/ ; generate({ outDir, components, artboards, target }) pour un build isolé.
//                        · GC_LOCAL=1 (version locale, npm run build:local) : superpose à ces images celles de
//                          prive/baked (vraies photos et vidéos, jamais publiées), sous les noms « local/… » et à
//                          l'adresse ./prive-baked/… (copiées dans dist/local par vite.config.ts). Cible « site » seulement.
//   node scripts/gen-entry.mjs [--target harness|site|artifact]
import { readdirSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventory } from './assets.mjs';
import { BAKED_LOCAL, DOSSIER_PUBLIE, PREFIXE_LOCAL } from './lib/prive.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = (p) => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);
const HEAD = '// Fichier généré par scripts/gen-entry.mjs — ne pas modifier.\n';

export function generate({ outDir = join(ROOT, 'src/generated'), components, artboards, target = 'harness' } = {}) {
  mkdirSync(outDir, { recursive: true });
  const rel = (p) => { const r = relative(outDir, p).split('\\').join('/'); return r.startsWith('.') ? r : `./${r}`; };
  const write = (name, text) => writeFileSync(join(outDir, name), text);

  // Composants et artboards
  let comps = dirs(join(ROOT, 'src/components')).filter((n) => existsSync(join(ROOT, 'src/components', n, 'index.ts')));
  let boards = dirs(join(ROOT, 'src/artboards')).filter((n) => existsSync(join(ROOT, 'src/artboards', n, 'index.ts')));
  if (components) comps = comps.filter((n) => components.includes(n));
  if (artboards) boards = boards.filter((n) => artboards.includes(n));
  let out = HEAD;
  for (const n of comps) out += `export * from '${rel(join(ROOT, 'src/components', n))}';\n`;
  boards.forEach((n, i) => (out += `import B${i} from '${rel(join(ROOT, 'src/artboards', n))}';\n`));
  out += `export const Artboards = {${boards.map((n, i) => ` ${n}: B${i}`).join(',')} };\n`;
  write('components.gen.ts', out);

  // Images cuites
  const inv = inventory({ cible: target });
  const lockFile = join(ROOT, 'design-system/assets.lock.json');
  const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : {};
  const missing = [];
  const url = (a) => {
    if (target === 'artifact') {
      const id = lock[a.sha];
      if (!id) { missing.push(a.file); return ''; }
      return `/_blob/${id}`;
    }
    return target === 'site' ? `./design-system/${a.file}` : `/design-system/${a.file}`;
  };
  // Les vidéos et les sons ne vont pas dans l'artifact du design system (CONTRACT § 12.3) : seulement sur le site.
  const garder = ([, a]) => !(target === 'artifact' && /^(video|audio)\//.test(String(a.type || '')));
  const entriesA = Object.entries(inv).filter(garder).map(([n, a]) => `  ${JSON.stringify(n)}: { u: ${JSON.stringify(url(a))}, w: ${a.w}, h: ${a.h} }`);
  // Version locale : les médias cuits de prive/baked s'ajoutent (noms « local/… » : aucun recouvrement du design system).
  // L'empreinte ?v= évite qu'un navigateur (iPad) garde une ancienne vidéo du même nom.
  let locaux = 0;
  if (process.env.GC_LOCAL === '1') {
    if (target !== 'site') throw new Error('GC_LOCAL=1 : cible « site » seulement');
    for (const [n, a] of Object.entries(inventory({ cible: target, dossier: BAKED_LOCAL, prefixe: PREFIXE_LOCAL, sous: ['videos', 'photos'] }))) {
      entriesA.push(`  ${JSON.stringify(n)}: { u: ${JSON.stringify(`./${DOSSIER_PUBLIE}/${a.file}?v=${a.sha.slice(0, 12)}`)}, w: ${a.w}, h: ${a.h} }`);
      locaux++;
    }
  }
  write('assets.gen.ts', `${HEAD}// Cible : ${target}\nexport const ASSETS: Record<string, { u: string; w: number; h: number }> = {\n${entriesA.join(',\n')}\n};\n`);
  if (missing.length) throw new Error(`Assets non téléversés (cible artifact) :\n  ${missing.join('\n  ')}`);

  return { comps, boards, assets: entriesA.length, target, locaux };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ti = process.argv.indexOf('--target');
  const r = generate({ target: ti > 0 ? process.argv[ti + 1] : 'harness' });
  console.log(`entrées (${r.target}) : ${r.comps.length} composants, ${r.boards.length} artboards, ${r.assets} images${process.env.GC_LOCAL === '1' ? ` (dont ${r.locaux} médias locaux de prive/baked)` : ''}`);
}
