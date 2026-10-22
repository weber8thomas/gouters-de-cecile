// Version PARTAGÉE du carnet : les vraies données de dist/local, entièrement chiffrées, prêtes pour Cloudflare Pages.
//
//   npm run build:partage                  build:local, puis chiffrement → dist/partage, puis garde-partage
//   npm run build:partage -- --sans-build  réutilise dist/local tel quel (essais ; pas de nouveau build:local)
//
// Le secret (prive/partage/secret.json) est créé au premier passage et réutilisé ensuite : un rebuild ne change ni le mot de
// passe ni la clé (npm run partage:cle -- --nouveau pour révoquer). Voir docs/partage.md.
//
// dist/partage :
//   <43 caractères>   un fichier chiffré par fichier de dist/local (IV ‖ AES-256-GCM), nom = HMAC(Kn, chemin)
//   index.html, ouvrir.js, sw.js, favicon.svg, police.woff2, verrou.json   le chargeur, seul contenu en clair
//   _headers, robots.txt, 404.html                                         Cloudflare Pages
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { ROOT, tousLesFichiers } from './lib/prive.mjs';
import { typeDe } from './lib/serve.mjs';
import { chiffrerFichier, cheminCanonique, deB64u, importerCles, nomMasque } from './partage/coeur.mjs';
import { ENTETES_PAGE } from './partage/entetes.mjs';
import { creerSecret, lireSecret } from './partage/secret.mjs';
import { CHARGEUR } from './garde-partage.mjs';

const SOURCE = join(ROOT, 'dist/local');
const SORTIE = join(ROOT, 'dist/partage');
const CHARGEUR_SRC = join(ROOT, 'scripts/partage/chargeur');
const node = process.execPath;

if (!process.argv.includes('--sans-build')) {
  console.log('■ build:local');
  const r = spawnSync(node, ['scripts/build-local.mjs'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.error('build:partage : build:local a échoué.'); process.exit(r.status ?? 1); }
}
if (!existsSync(join(SOURCE, 'index.html'))) { console.error('build:partage : dist/local est absent (npm run build:local).'); process.exit(1); }

let secret = lireSecret();
if (!secret) {
  secret = await creerSecret();
  console.log(`■ secret créé dans prive/partage/secret.json — phrase de passe : ${secret.motDePasse}\n  (npm run partage:cle pour le lien et le QR code)`);
}
const cles = await importerCles(deB64u(secret.cle), { ecriture: true });

// ---- fichiers chiffrés ---------------------------------------------------------------------------------------------------
console.log('■ chiffrement');
rmSync(SORTIE, { recursive: true, force: true });
mkdirSync(SORTIE, { recursive: true });
const debut = performance.now();
const vus = new Map();
let octets = 0;
const sources = tousLesFichiers(SOURCE);
for (const f of sources) {
  const chemin = cheminCanonique(relative(SOURCE, f));
  if (chemin !== 'index.html' && CHARGEUR.includes(chemin)) throw new Error(`build:partage : « ${chemin} » entre en collision avec un fichier du chargeur.`);
  const nom = await nomMasque(cles.noms, chemin);
  if (vus.has(nom)) throw new Error(`build:partage : collision de noms masqués (${chemin} / ${vus.get(nom)}).`);
  vus.set(nom, chemin);
  const contenu = readFileSync(f);
  if (contenu.length > 25 * 1024 * 1024 - 64) throw new Error(`build:partage : ${chemin} dépasse 25 Mio (limite de Cloudflare Pages).`);
  const chiffre = await chiffrerFichier(cles.cle, chemin, typeDe(f), contenu);
  writeFileSync(join(SORTIE, nom), chiffre);
  octets += chiffre.length;
}
console.log(`  ${sources.length} fichiers, ${(octets / 1048576).toFixed(1)} Mo, ${Math.round(performance.now() - debut)} ms`);

// ---- chargeur (le seul contenu en clair) -----------------------------------------------------------------------------------
console.log('■ chargeur');
for (const entree of ['ouvrir', 'sw']) {
  await build({
    entryPoints: [join(CHARGEUR_SRC, `${entree}.js`)], outfile: join(SORTIE, `${entree}.js`),
    bundle: true, format: 'iife', minify: true, target: 'es2020', legalComments: 'none', logLevel: 'warning',
  });
}
for (const [src, dest] of [[join(CHARGEUR_SRC, 'index.html'), 'index.html'], [join(CHARGEUR_SRC, 'favicon.svg'), 'favicon.svg'],
  [join(ROOT, 'node_modules/@fontsource/caveat/files/caveat-latin-700-normal.woff2'), 'police.woff2']]) copyFileSync(src, join(SORTIE, dest));
writeFileSync(join(SORTIE, 'verrou.json'), JSON.stringify(secret.verrou) + '\n');
writeFileSync(join(SORTIE, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
// 404.html : sans lui, Cloudflare Pages répond au fichier inconnu par index.html (mode « application monopage »).
writeFileSync(join(SORTIE, '404.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Introuvable</title><p>Introuvable.</p>\n');

// ---- en-têtes Cloudflare Pages ---------------------------------------------------------------------------------------------
const lignes = (h) => Object.entries(h).map(([k, v]) => `  ${k}: ${v}`).join('\n');
writeFileSync(join(SORTIE, '_headers'), [
  '# Cloudflare Pages : en-têtes de la version partagée (voir scripts/partage/entetes.mjs).',
  '/*',
  lignes(ENTETES_PAGE),
  '# Cache-Control : celui de Cloudflare Pages par défaut (max-age=0, must-revalidate) convient aux fichiers chiffrés.',
  '/sw.js',
  '  Cache-Control: no-cache',
  '/verrou.json',
  '  Cache-Control: no-store',
  '/police.woff2',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
].join('\n'));

// ---- garde-fou ------------------------------------------------------------------------------------------------------------
console.log('■ garde-partage');
const g = spawnSync(node, ['scripts/garde-partage.mjs', 'dist/partage'], { cwd: ROOT, stdio: 'inherit' });
if (g.status !== 0) { rmSync(SORTIE, { recursive: true, force: true }); console.error('build:partage : garde-partage a refusé le build (dist/partage supprimé).'); process.exit(1); }
console.log('dist/partage prêt : npm run preview:partage pour l\'essayer ; npm run deploy:partage pour l\'envoyer (voir docs/partage.md).');
