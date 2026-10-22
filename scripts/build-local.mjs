// Version LOCALE du carnet (TV / iPad depuis le Mac) : le même build que `npm run build:site`, mais les vraies photos
// et vidéos de prive/baked (npm run medias:local) se superposent aux placeholders. Sortie : dist/local (ignoré par git).
//
//   npm run build:local        puis  npm run preview:local   (vite preview --outDir dist/local --host)
//   GC_PRIVE=<dossier>         autre dossier que prive/ (essais)
//
// GC_LOCAL=1 est lu par scripts/gen-entry.mjs (inventaire des images : noms « local/… » ajoutés) et par vite.config.ts
// (videos.json et photos-cecile.json complétés, médias copiés dans dist/local/prive-baked/). Sans média cuit, le build
// local est identique au site public (placeholders). Ne jamais publier dist/local (publish-pages.mjs le refuse).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, BAKED_LOCAL } from './lib/prive.mjs';

const node = process.execPath;
const etape = (titre, argv, env = {}) => {
  console.log(`■ ${titre}`);
  const r = spawnSync(node, argv, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) { console.error(`build:local : « ${titre} » a échoué.`); process.exit(r.status ?? 1); }
};
const sansLocal = { ...process.env };
delete sansLocal.GC_LOCAL;

const lire = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const videos = Object.keys(lire(join(BAKED_LOCAL, 'videos.json'), {}));
const photos = lire(join(BAKED_LOCAL, 'photos-cecile.json'), []);
console.log(`médias locaux (${BAKED_LOCAL}) : ${videos.length} vidéo(s) [${videos.join(', ')}], ${photos.length} emplacement(s) de l'album de Cécile`);
if (!videos.length && !photos.length) console.log('  (aucun média cuit : npm run medias:local ; ce build garde les placeholders)');

const L = { GC_LOCAL: '1' };
etape('jetons', ['scripts/build-tokens.mjs'], L);
etape('entrées (images + médias locaux)', ['scripts/gen-entry.mjs', '--target', 'site'], L);
etape('tsc', ['node_modules/typescript/bin/tsc', '--noEmit'], L);
etape('vite build → dist/local', ['node_modules/vite/bin/vite.js', 'build'], L);
// src/generated (ignoré par git) redevient celui du site public : `npm run dev` ou `build:site` ne verront rien de local.
spawnSync(node, ['scripts/gen-entry.mjs', '--target', 'site'], { cwd: ROOT, stdio: 'ignore', env: sansLocal });
console.log('dist/local prêt : npm run preview:local (puis ouvrir l\'adresse « Network » sur la TV ou l\'iPad).');
