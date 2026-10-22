// Garde-fou : rien de prive/ (vrais médias, jamais publiés) ne doit se retrouver dans le site public.
//
//   node scripts/garde-prive.mjs --avant        refuse de continuer si GC_LOCAL=1 (variable de la version locale)
//   node scripts/garde-prive.mjs [dist/site]    inspecte le build ; sort en erreur (code 1) si l'un de ces cas se présente :
//     - un fichier du build a le même sha256 qu'un fichier de prive/ (GC_PRIVE=<dossier> pour un autre dossier) ;
//     - un chemin du build contient un dossier « prive » ou « prive-baked » ;
//     - un texte du build (js, css, html, json) cite « prive-baked » ou un nom logique « local/videos/… », « local/photos/… »
//       (la version locale les utilise : ils trahiraient un build fait avec GC_LOCAL=1).
// Les coins cuits (prive/baked/photos/*/coins.webp : décor sans photo, identique aux placeholders) sont ignorés par le sha256.
// Lancé en tête et en fin de `npm run build:site`. Les fichiers de prive/ trop petits pour être des médias (< 1 octet)
// sont ignorés ; un fichier de prive/ identique par hasard à un fichier public déclencherait aussi l'alerte.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, extname } from 'node:path';
import { ROOT, PRIVE, tousLesFichiers, sha256Fichier } from './lib/prive.mjs';

if (process.argv.includes('--avant')) {
  if (process.env.GC_LOCAL === '1') {
    console.error('build:site refusé : GC_LOCAL=1 est défini (version locale). Le site public ne doit pas contenir de médias de prive/.\n  → unset GC_LOCAL, ou npm run build:local pour la version locale.');
    process.exit(1);
  }
  process.exit(0);
}

const dossier = resolve(ROOT, process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'dist/site');
if (!existsSync(dossier)) {
  console.error(`garde-prive : ${dossier} introuvable (construire le site d'abord).`);
  process.exit(1);
}
const rel = (f) => relative(dossier, f);
const fichiers = tousLesFichiers(dossier);
const problemes = [];

// 1. chemins
for (const f of fichiers) {
  if (rel(f).split(/[\\/]/).some((seg) => seg === 'prive' || seg === 'prive-baked')) problemes.push(`chemin privé : ${rel(f)}`);
}

// 2. empreintes (on ne calcule que pour les tailles communes)
const privesParTaille = new Map();
for (const f of tousLesFichiers(PRIVE)) {
  const taille = statSync(f).size;
  // Les coins photo / scotch cuits (baked/photos/*/coins.webp) ne montrent aucune photo et sont déterministes : un
  // placeholder public peut en être octet pour octet identique. Ils restent couverts par les contrôles de chemin et de texte.
  if (/[\\/]baked[\\/]photos[\\/][^\\/]+[\\/]coins\.webp$/.test(f)) continue;
  if (taille > 0) privesParTaille.set(taille, [...(privesParTaille.get(taille) ?? []), f]);
}
let comparés = 0;
for (const f of fichiers) {
  const candidats = privesParTaille.get(statSync(f).size);
  if (!candidats) continue;
  const sha = sha256Fichier(f);
  comparés++;
  const pareil = candidats.find((p) => sha256Fichier(p) === sha);
  if (pareil) problemes.push(`contenu identique à un fichier privé : ${rel(f)} = ${relative(ROOT, pareil)}`);
}

// 3. références dans les textes
const MARQUEURS = ['prive-baked', 'local/videos/', 'local/photos/'];
for (const f of fichiers) {
  if (!['.js', '.mjs', '.css', '.html', '.json', '.map'].includes(extname(f).toLowerCase())) continue;
  const texte = readFileSync(f, 'utf8');
  const m = MARQUEURS.find((x) => texte.includes(x));
  if (m) problemes.push(`référence « ${m} » dans ${rel(f)}`);
}

if (problemes.length) {
  console.error(`garde-prive : ${dossier} contient des traces de prive/ :\n  - ${problemes.slice(0, 20).join('\n  - ')}${problemes.length > 20 ? `\n  … et ${problemes.length - 20} autres` : ''}`);
  process.exit(1);
}
console.log(`garde-prive : ${rel(dossier) || dossier} propre (${fichiers.length} fichiers, ${comparés} comparé(s) par sha256 à prive/).`);
