// Exécute tous les générateurs SVG (design-system/**/build.mjs), dans l'ordre alphabétique.
// Chaque générateur est déterministe : relancer ne change rien si les sources n'ont pas bougé.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2]; // filtre optionnel, ex. « ecrins/cloche »
const found = [];
const walk = (p) => { for (const n of readdirSync(p).sort()) { const f = join(p, n); if (statSync(f).isDirectory()) walk(f); else if (n === 'build.mjs') found.push(f); } };
walk(join(root, 'design-system'));
for (const f of found) {
  const r = relative(root, f);
  if (only && !r.includes(only)) continue;
  execFileSync(process.execPath, [f], { stdio: 'inherit', cwd: root });
  console.log(`✓ ${r}`);
}
