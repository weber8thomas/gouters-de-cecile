// Relecture OCR (TrOCR) de l'encre rendue des pages déjà cuites, sans les recuire, à la demande :
//   npm run pages:relire [-- --only coralie,lise]
// → verification/out/relecture.md (et .json) : mots importants douteux par page, nombres et quantités en tête.
// Un mot douteux ne donne jamais un code de sortie ≠ 0 (2 seulement si le lecteur TrOCR est introuvable).
// Détails : scripts/pages/relecture.py.
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
  else {
    console.error(`option inconnue : ${args[i]} (seul --only est accepté)`);
    process.exit(2);
  }
}
const r = spawnSync(python, [join(ROOT, 'scripts/pages/relecture.py'), ...passe], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? '2' } });
process.exit(r.status ?? 2);
