// Un invité de dernière minute, en une commande : enchaîne les cuissons existantes pour sa recette.
//
//   npm run invite -- <slug> [--sans-video]
//
// Avant : sa recette reçue src/content/recettes/<slug>.json (type RecetteRecue, ses mots tels quels),
// son plan dans src/content/pages/recettes.json (copier celui de Lisa), sa double page dans
// src/content/carnet.json (doubles[], type « video », invites [<slug>]) et son entrée dans
// src/content/roster.json. Sa vraie vidéo reste dans prive/ (jamais publiée) ; sans elle, le clip
// exemple de design-system/sources/videos/credits.json sert s'il y en a un.
//
// Étapes : pages (et aperçus) → si un mot important se relit mal : réparer les graines puis recuire une
// fois → carte des temps de l'encre → vidéo, affiche et tirage → inventaire des images. Puis :
// npm run build:site.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './assets.mjs';

const [slug, ...opts] = process.argv.slice(2);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('usage : npm run invite -- <slug> [--sans-video]');
  process.exit(2);
}
const PY = join(ROOT, 'tools/ecriture/.venv/bin/python');
const lire = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const manque = [];
if (!existsSync(join(ROOT, `src/content/recettes/${slug}.json`))) manque.push(`src/content/recettes/${slug}.json`);
if (!lire('src/content/pages/recettes.json').recettes[slug]) manque.push(`son plan dans src/content/pages/recettes.json`);
if (!lire('src/content/carnet.json').doubles.some((d) => d.id === slug)) manque.push(`sa double page dans src/content/carnet.json`);
if (manque.length) {
  console.error(`Il manque pour « ${slug} » :\n  - ${manque.join('\n  - ')}`);
  process.exit(2);
}

const t0 = Date.now();
const etape = (titre, cmd, args, { tolere = false } = {}) => {
  console.log(`\n▸ ${titre}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0 && !tolere) {
    console.error(`✗ ${titre} : code ${r.status}`);
    process.exit(r.status || 1);
  }
  return r.status;
};

// 1. les pages ; code 1 : un mot important se relit mal → nouvelles graines, puis une seconde cuisson
const cuire = () => etape('Pages', 'node', ['scripts/bake-pages.mjs', '--only', slug, '--apercus'], { tolere: true });
const pagesDe = () =>
  readdirSync(join(ROOT, 'design-system/baked/pages/1x'))
    .filter((f) => f.startsWith(`${slug}-`) && f.endsWith('.webp'))
    .map((f) => f.slice(0, -5));
let code = cuire();
if (code === 1) {
  etape('Réparer les mots mal relus', PY, ['scripts/pages/reparer.py', pagesDe().join(',')]);
  code = cuire();
}
if (code !== 0) console.warn('⚠ des mots restent douteux : regarder les aperçus avant de publier.');
const pages = pagesDe();

// 2. l'encre qui s'écrit, 3. vidéo, affiche et tirage, 4. inventaire
etape("Carte des temps de l'encre", PY, ['scripts/bake-temps-encre.py', pages.join(',')]);
if (!opts.includes('--sans-video')) etape('Vidéo, affiche, tirage', 'node', ['scripts/bake-videos.mjs', '--only', slug], { tolere: true });
etape('Inventaire des images', 'node', ['scripts/assets.mjs']);

console.log(`\n✓ ${slug} prêt en ${Math.round((Date.now() - t0) / 1000)} s : ${pages.join(', ')}`);
console.log(`  aperçus : ${pages.map((p) => `verification/out/b/pages/${p}.png`).join(' ')}`);
console.log('  ensuite : npm run build:site');
