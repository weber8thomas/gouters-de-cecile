// Cuisson des pages du carnet : vrai papier ancien + écriture générée trait par trait + croquis à
// l'aquarelle, l'encre cuite dans le papier (design-system/baked/pages/**), manifeste lu par <PageCuite>
// (src/content/pages/manifeste.json), puis inventaire des images (scripts/assets.mjs).
//
//   node scripts/bake-pages.mjs [--only lisa,julie] [--force] [--apercus] [--format ecran|a5] [--sans-4x]
//
// Pages : les descriptions écrites à la main (src/content/pages/<id>.json) et les recettes reçues du plan
// src/content/pages/recettes.json (src/content/recettes/<slug>.json → pagination automatique :
// <slug>-gauche, <slug>-droite, et si besoin <slug>-feuillet-recto / -verso, le feuillet volant).
// --only : doubles pages (lisa, julie…) ou pages (julie-droite…) à recuire ; --force : ignore le cache ;
// --apercus : écrit aussi la composition finale (100 %, 2×) et la description de chaque page dans
// verification/out/b/pages/. --format a5 : feuille A5 recto-verso par invité (148 × 210 mm + 3 mm de fond perdu,
// 300 dpi) dans design-system/baked/a5/ (manifeste design-system/baked/a5/manifeste.json) ; --sans-4x : sans la passe
// d'encre ×4 de la loupe (tuiles design-system/baked/pages/4x/<id>-<r><c>.webp, manifeste `encre4x`).
// Ordre, folios, sommaire et intercalaires : src/content/carnet.json.
// Code de sortie 1 si un mot ne tient pas, si une correction tombe dans un mot important ou si un mot
// important (nombre, unité, nom, ingrédient) se relit mal sur l'encre rendue : rien n'est perdu ni faux en silence.
// Le moteur est en Python (scripts/pages/, environnement de l'outil d'écriture tools/ecriture/.venv) :
// pagination, mise en page naturelle, croquis, rastérisation, composition encre × papier, WebP.
// Tests : tools/ecriture/.venv/bin/python -m unittest discover -s scripts/pages/tests -v
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './assets.mjs';

const args = process.argv.slice(2);
const python = join(ROOT, 'tools/ecriture/.venv/bin/python');
if (!existsSync(python)) {
  console.error(`Environnement Python de l'écriture introuvable (${python}) : bash tools/ecriture/telecharger.sh`);
  process.exit(2);
}
const passe = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--only') passe.push('--only', args[++i] ?? '');
  else if (args[i].startsWith('--only=')) passe.push('--only', args[i].slice(7));
  else if (args[i] === '--force' || args[i] === '--apercus' || args[i] === '--sans-4x') passe.push(args[i]);
  else if (args[i] === '--format') passe.push('--format', args[++i] ?? '');
  else if (args[i].startsWith('--format=')) passe.push('--format', args[i].slice(9));
  else {
    console.error(`option inconnue : ${args[i]}`);
    process.exit(2);
  }
}
const r = spawnSync(python, [join(ROOT, 'scripts/pages/cuire.py'), ...passe], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? '1' } });
if (r.status !== 0 && r.status !== 1) process.exit(r.status ?? 2);
const inv = spawnSync(process.execPath, [join(ROOT, 'scripts/assets.mjs')], { stdio: 'inherit', cwd: ROOT });
process.exit(r.status || inv.status || 0);
