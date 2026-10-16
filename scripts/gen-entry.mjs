// Génère les points d'entrée TypeScript à partir des dossiers, pour que les sous-agents
// n'aient jamais à modifier un fichier partagé :
//   components.gen.ts    — export * de chaque src/components/<Comp>/index.ts
//                          + Artboards { <Nom>: composant } depuis src/artboards/<Nom>/index.ts
//   ecrins.gen.ts        — tous les écrins (ecrin.json + SVG par variante)
//   illustrations.gen.ts — tous les SVG de design-system/illustrations/**, clé = chemin sans .svg
//   assets.gen.ts        — URL des images cuites (design-system/baked/**) selon la cible :
//                          artifact → /_blob/<id> (design-system/assets.lock.json) · harness → /design-system/baked/…
//                          · site → ./design-system/baked/…
// Par défaut dans src/generated/ ; generate({ outDir, components, artboards, target }) pour un build isolé.
//   node scripts/gen-entry.mjs [--target harness|site|artifact]
import { readdirSync, existsSync, writeFileSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventory } from './assets.mjs';

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

  // Écrins
  const ecrinRoot = join(ROOT, 'design-system/ecrins');
  let e = HEAD + `import type { EcrinEntry } from '${rel(join(ROOT, 'src/lib/ecrin-types'))}';\n`;
  const entries = [];
  let k = 0;
  for (const id of dirs(ecrinRoot)) {
    const man = join(ecrinRoot, id, 'ecrin.json');
    if (!existsSync(man)) continue;
    const mv = `m${k++}`;
    e += `import ${mv} from '${rel(man)}';\n`;
    const variants = [];
    for (const v of dirs(join(ecrinRoot, id))) {
      const files = {};
      for (const part of ['back', 'front', 'mask', 'dome']) {
        const f = join(ecrinRoot, id, v, `${part}.svg`);
        if (existsSync(f)) { const iv = `s${k++}`; e += `import ${iv} from '${rel(f)}';\n`; files[part] = iv; }
      }
      if (files.mask && (files.back || files.front)) variants.push(`${JSON.stringify(v)}: { ${Object.entries(files).map(([p, iv]) => `${p}: ${iv}`).join(', ')} }`);
    }
    entries.push(`  ${JSON.stringify(id)}: { manifest: ${mv} as unknown as EcrinEntry['manifest'], variants: { ${variants.join(', ')} } }`);
  }
  e += `export const ECRINS: Record<string, EcrinEntry> = {\n${entries.join(',\n')}\n};\n`;
  write('ecrins.gen.ts', e);

  // Illustrations
  const illRoot = join(ROOT, 'design-system/illustrations');
  const svgs = [];
  const walk = (p) => { if (!existsSync(p)) return; for (const n of readdirSync(p).sort()) { const f = join(p, n); if (statSync(f).isDirectory()) walk(f); else if (n.endsWith('.svg')) svgs.push(f); } };
  walk(illRoot);
  let il = HEAD;
  svgs.forEach((f, i) => (il += `import i${i} from '${rel(f)}';\n`));
  il += `export const ILLUSTRATIONS: Record<string, string> = {\n${svgs.map((f, i) => `  ${JSON.stringify(relative(illRoot, f).replace(/\.svg$/, '').split('\\').join('/'))}: i${i}`).join(',\n')}\n};\n`;
  write('illustrations.gen.ts', il);

  // Images cuites
  const inv = inventory();
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
  const entriesA = Object.entries(inv).map(([n, a]) => `  ${JSON.stringify(n)}: { u: ${JSON.stringify(url(a))}, w: ${a.w}, h: ${a.h} }`);
  write('assets.gen.ts', `${HEAD}// Cible : ${target}\nexport const ASSETS: Record<string, { u: string; w: number; h: number }> = {\n${entriesA.join(',\n')}\n};\n`);
  if (missing.length) throw new Error(`Assets non téléversés (cible artifact) :\n  ${missing.join('\n  ')}`);

  return { comps, boards, ecrins: entries.length, illustrations: svgs.length, assets: entriesA.length, target };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ti = process.argv.indexOf('--target');
  const r = generate({ target: ti > 0 ? process.argv[ti + 1] : 'harness' });
  console.log(`entrées (${r.target}) : ${r.comps.length} composants, ${r.boards.length} artboards, ${r.ecrins} écrins, ${r.illustrations} illustrations, ${r.assets} images`);
}
