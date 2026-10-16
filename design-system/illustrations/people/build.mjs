// Compose les scènes vidéo factices avec le kit de personnages et les écrit dans ../scenes/<slug>.svg.
//   node scripts/gen-svg.mjs illustrations/people
// Déterministe : relancer ne change rien si les sources n'ont pas bougé.
// Attention : ce dossier ne doit contenir AUCUN .svg (tout .svg de illustrations/** devient ILLUSTRATIONS[…]).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES } from './scenes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../scenes');
mkdirSync(outDir, { recursive: true });

const FORBIDDEN = [/<style/i, /<text/i, /<filter/i, /<!--/, /<image/i, /\swidth="[^"]*"\s[^>]*viewBox/];
for (const [slug, make] of Object.entries(SCENES)) {
  const svg = make();
  for (const re of FORBIDDEN) if (re.test(svg)) throw new Error(`scène ${slug} : motif interdit ${re}`);
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const bad = ids.filter((id) => !id.startsWith(`gc-scene-${slug}-`));
  if (bad.length) throw new Error(`scène ${slug} : ids non préfixés ${bad.slice(0, 3).join(', ')}`);
  if (new Set(ids).size !== ids.length) throw new Error(`scène ${slug} : ids en double`);
  // garde-fou : chaque commande de tracé a le bon nombre d'arguments (arrondis, séparateurs)
  const ARGS = { M: 2, L: 2, C: 6, Q: 4, H: 1, V: 1, Z: 0, A: 7 };
  for (const [, d] of svg.matchAll(/ d="([^"]+)"/g)) {
    let cmd = null, n = 0;
    const check = () => { const k = cmd && ARGS[cmd.toUpperCase()]; if (k && n % k) throw new Error(`scène ${slug} : tracé mal formé ${d.slice(0, 60)}…`); };
    for (const t of d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []) if (/[A-Za-z]/.test(t)) { check(); cmd = t; n = 0; } else n++;
    check();
  }
  writeFileSync(join(outDir, `${slug}.svg`), svg);
  console.log(`scenes/${slug}.svg : ${(Buffer.byteLength(svg) / 1024).toFixed(1)} Ko, ${ids.length} ids`);
}
