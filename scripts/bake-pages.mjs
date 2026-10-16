// Cuisson des pages du carnet : vrai papier ancien + écriture générée trait par trait, l'encre cuite
// dans le papier (design-system/baked/pages/**), manifeste lu par <PageCuite>
// (src/content/pages/manifeste.json), puis inventaire des images (scripts/assets.mjs).
//
//   node scripts/bake-pages.mjs [--only julie,rose] [--force] [--apercus]
//
// --only : doubles pages (julie, rose…) ou pages (julie-droite…) à recuire ; --force : ignore le cache ;
// --apercus : écrit aussi la composition finale de chaque page dans verification/out/n3/pages/<id>.png.
// Le moteur est en Python (scripts/pages/, environnement de l'outil d'écriture tools/ecriture/.venv) :
// mise en page naturelle, rastérisation des traits, composition encre × papier, WebP.
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
  else if (args[i] === '--force' || args[i] === '--apercus') passe.push(args[i]);
  else {
    console.error(`option inconnue : ${args[i]}`);
    process.exit(2);
  }
}
const r = spawnSync(python, [join(ROOT, 'scripts/pages/cuire.py'), ...passe], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? '1' } });
if (r.status !== 0 && r.status !== 1) process.exit(r.status ?? 2);
const inv = spawnSync(process.execPath, [join(ROOT, 'scripts/assets.mjs')], { stdio: 'inherit', cwd: ROOT });
process.exit(r.status || inv.status || 0);
