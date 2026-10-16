// Génère les points d'entrée TypeScript à partir des dossiers, pour que les sous-agents
// n'aient jamais à modifier un fichier partagé :
//   src/generated/components.gen.ts    — export * de chaque src/components/<Comp>/index.ts
//                                        + Artboards { <Nom>: composant } depuis src/artboards/<Nom>/index.ts
//   src/generated/ecrins.gen.ts        — tous les écrins (ecrin.json + SVG par variante)
//   src/generated/illustrations.gen.ts — tous les SVG de design-system/illustrations/**, clé = chemin sans .svg
import { readdirSync, existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gen = join(root, 'src/generated');
mkdirSync(gen, { recursive: true });
const dirs = (p) => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);
const rel = (p) => relative(gen, p).split('\\').join('/');
const HEAD = '// Fichier généré par scripts/gen-entry.mjs — ne pas modifier.\n';

// Composants et artboards
const comps = dirs(join(root, 'src/components')).filter((n) => existsSync(join(root, 'src/components', n, 'index.ts')));
const boards = dirs(join(root, 'src/artboards')).filter((n) => existsSync(join(root, 'src/artboards', n, 'index.ts')));
let out = HEAD;
for (const n of comps) out += `export * from '${rel(join(root, 'src/components', n))}';\n`;
boards.forEach((n, i) => (out += `import B${i} from '${rel(join(root, 'src/artboards', n))}';\n`));
out += `export const Artboards = {${boards.map((n, i) => ` ${n}: B${i}`).join(',')} };\n`;
writeFileSync(join(gen, 'components.gen.ts'), out);

// Écrins
const ecrinRoot = join(root, 'design-system/ecrins');
let e = HEAD + "import type { EcrinEntry } from '../lib/ecrin-types';\n";
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
    if (files.back || files.front) variants.push(`${JSON.stringify(v)}: { ${Object.entries(files).map(([p, iv]) => `${p}: ${iv}`).join(', ')} }`);
  }
  entries.push(`  ${JSON.stringify(id)}: { manifest: ${mv} as EcrinEntry['manifest'], variants: { ${variants.join(', ')} } }`);
}
e += `export const ECRINS: Record<string, EcrinEntry> = {\n${entries.join(',\n')}\n};\n`;
writeFileSync(join(gen, 'ecrins.gen.ts'), e);

// Illustrations
const illRoot = join(root, 'design-system/illustrations');
const svgs = [];
const walk = (p) => { if (!existsSync(p)) return; for (const n of readdirSync(p).sort()) { const f = join(p, n); if (statSync(f).isDirectory()) walk(f); else if (n.endsWith('.svg')) svgs.push(f); } };
walk(illRoot);
let il = HEAD;
svgs.forEach((f, i) => (il += `import i${i} from '${rel(f)}';\n`));
il += `export const ILLUSTRATIONS: Record<string, string> = {\n${svgs.map((f, i) => `  ${JSON.stringify(relative(illRoot, f).replace(/\.svg$/, '').split('\\').join('/'))}: i${i}`).join(',\n')}\n};\n`;
writeFileSync(join(gen, 'illustrations.gen.ts'), il);

console.log(`entrées : ${comps.length} composants, ${boards.length} artboards, ${entries.length} écrins, ${svgs.length} illustrations`);
