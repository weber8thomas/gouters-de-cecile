// Envoi direct de dist/partage sur Cloudflare Pages (wrangler, sans git).
//
//   PARTAGE_PROJET=<nom du projet Pages> npm run deploy:partage
//
// Prérequis (faits par Thomas, une fois) : `npx wrangler login`, et le projet créé (npx wrangler pages project create <nom>
// --production-branch main) ou créé au premier envoi. Ce script relance le garde-fou avant d'envoyer, et ne fait rien d'autre.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/prive.mjs';

const projet = process.env.PARTAGE_PROJET;
if (!projet) {
  console.error('deploy:partage : définir PARTAGE_PROJET=<nom du projet Cloudflare Pages> (ex. PARTAGE_PROJET=gouters-de-cecile npm run deploy:partage).');
  process.exit(1);
}
if (!existsSync(join(ROOT, 'dist/partage/verrou.json'))) { console.error('deploy:partage : dist/partage est absent (npm run build:partage).'); process.exit(1); }
const garde = spawnSync(process.execPath, ['scripts/garde-partage.mjs', 'dist/partage'], { cwd: ROOT, stdio: 'inherit' });
if (garde.status !== 0) process.exit(1);
const r = spawnSync('npx', ['wrangler', 'pages', 'deploy', 'dist/partage', '--project-name', projet, '--branch', 'main', '--commit-dirty=true'], { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status ?? 1);
