// Garde-fou de la version partagée : rien de lisible ne doit rester dans dist/partage hors du chargeur.
//
//   node scripts/garde-partage.mjs [dist/partage]
//
// Échoue (code 1) si :
//   - un fichier hors chargeur n'a pas un nom masqué (43 caractères base64url), ou si un nom d'origine apparaît ;
//   - un fichier chiffré a une entropie trop basse, une signature JPEG / PNG / WebP / MP4 / HTML au début, ou contient
//     un « témoin » : mots du carnet (« Cécile », « goûters »), noms d'invités, légendes de prive/cecile/choix.json,
//     extraits des textes de src/content, extraits du JS/CSS construits, chemins des médias cuits ;
//   - le chargeur (index.html, ouvrir.js, sw.js, verrou.json…) contient un témoin (quelle que soit sa longueur), un chemin
//     de prive/, la phrase de passe ou la clé ;
//   - verrou.json contient autre chose que {v, sel, iterations, cleEnveloppee, iv}.
// Les témoins sont cherchés tels quels dans les octets (≥ 6 octets : une coïncidence au hasard sur ~120 Mo est de l'ordre
// de 10⁻⁷ par témoin).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { ROOT, PRIVE, tousLesFichiers } from './lib/prive.mjs';
import { lireSecret } from './partage/secret.mjs';

export const CHARGEUR = ['index.html', 'ouvrir.js', 'sw.js', 'favicon.svg', 'police.woff2', 'verrou.json', 'robots.txt', '_headers', '404.html'];
const NOM_MASQUE = /^[A-Za-z0-9_-]{43}$/;
const enc = new TextEncoder();
const sansAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Entropie de Shannon en bits par octet. */
export function entropie(buf) {
  const n = new Array(256).fill(0);
  for (const b of buf) n[b]++;
  let h = 0;
  for (const c of n) if (c) { const p = c / buf.length; h -= p * Math.log2(p); }
  return h;
}

/** Premier témoin trouvé dans buf (recherche par premier octet : un seul passage, même sur plusieurs Mo). */
export function chercher(buf, temoins) {
  const parOctet = new Map();
  for (const t of temoins) {
    const o = Buffer.from(t.valeur);
    if (!parOctet.has(o[0])) parOctet.set(o[0], []);
    parOctet.get(o[0]).push({ ...t, o });
  }
  for (let i = 0; i < buf.length; i++) {
    const cands = parOctet.get(buf[i]);
    if (!cands) continue;
    for (const c of cands) {
      if (i + c.o.length > buf.length) continue;
      let ok = true;
      for (let j = 1; j < c.o.length; j++) if (buf[i + j] !== c.o[j]) { ok = false; break; }
      if (ok) return c;
    }
  }
  return null;
}

const SIGNATURES_DEBUT = [
  ['JPEG', [0xff, 0xd8, 0xff]], ['PNG', [0x89, 0x50, 0x4e, 0x47]], ['GIF', [0x47, 0x49, 0x46, 0x38]],
  ['RIFF (WebP, WAV)', [0x52, 0x49, 0x46, 0x46]], ['ID3 (MP3)', [0x49, 0x44, 0x33]], ['Ogg', [0x4f, 0x67, 0x67, 0x53]],
  ['wOF2 (police)', [0x77, 0x4f, 0x46, 0x32]], ['HTML', [...enc.encode('<!do')]], ['JSON', [...enc.encode('{"')]],
];
const SIGNATURES_PARTOUT = ['\x89PNG\r\n\x1a\n', 'JFIF\0', 'Exif\0\0', 'WEBPVP8', 'ftypisom', 'ftypmp42', 'ftypM4V', 'ftypiso', 'ftypqt  ', '<!doctype', '<!DOCTYPE', '<html lang', 'function(', 'sourceMappingURL'];

function debutEgal(buf, decalage, sig) {
  return sig.every((b, i) => buf[decalage + i] === b);
}

/** Valeurs textuelles d'un JSON (chaînes), pour fabriquer des témoins. */
function chaines(valeur, sortie = []) {
  if (typeof valeur === 'string') sortie.push(valeur);
  else if (Array.isArray(valeur)) valeur.forEach((v) => chaines(v, sortie));
  else if (valeur && typeof valeur === 'object') Object.values(valeur).forEach((v) => chaines(v, sortie));
  return sortie;
}

/** Témoins : { valeur, origine }. */
export function fabriquerTemoins({ dossierLocal = join(ROOT, 'dist/local') } = {}) {
  const t = new Map();
  const ajout = (valeur, origine) => { if (valeur && !t.has(valeur)) t.set(valeur, origine); };
  for (const m of ['Cécile', 'Les goûters', 'goûters', 'Goûters', 'cecile', 'Cecile', 'gouters', 'prive-baked', 'photos-cecile', 'Mamie']) ajout(m, 'mot du carnet');

  // invités : dossiers de prive/ et roster
  if (existsSync(PRIVE)) {
    for (const e of readdirSync(PRIVE, { withFileTypes: true })) {
      if (!e.isDirectory() || ['baked', 'partage', 'cecile'].includes(e.name)) continue;
      ajout(e.name, 'dossier d\'invité'); ajout(e.name.charAt(0).toUpperCase() + e.name.slice(1), 'dossier d\'invité');
    }
  }
  const roster = join(ROOT, 'src/content/roster.json');
  if (existsSync(roster)) for (const s of chaines(JSON.parse(readFileSync(roster, 'utf8')))) if (s.length >= 4 && s.length <= 40) ajout(s, 'nom d\'invité (roster)');

  // légendes et dates de l'album, noms des fichiers d'origine
  const choix = join(PRIVE, 'cecile/choix.json');
  if (existsSync(choix)) {
    for (const e of Object.values(JSON.parse(readFileSync(choix, 'utf8')))) {
      for (const k of ['legende', 'date', 'fichier']) if (typeof e?.[k] === 'string') ajout(e[k], `choix.json (${k})`);
    }
  }

  // extraits des textes du carnet (recettes, petits mots…)
  const textes = [];
  const marcher = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) marcher(f);
      else if (e.name.endsWith('.json')) textes.push(...chaines(JSON.parse(readFileSync(f, 'utf8'))).filter((s) => s.length >= 24).map((s) => s.slice(0, 24)));
    }
  };
  marcher(join(ROOT, 'src/content'));
  const pas = Math.max(1, Math.floor(textes.length / 100));
  textes.filter((_, i) => i % pas === 0).forEach((s) => ajout(s, 'extrait de src/content'));

  // extraits du JS/CSS/HTML construits et chemins des médias cuits
  if (existsSync(dossierLocal)) {
    for (const f of tousLesFichiers(dossierLocal)) {
      const rel = relative(dossierLocal, f).split('\\').join('/');
      if (rel.startsWith('prive-baked/')) ajout(rel, 'chemin d\'un média cuit');
      if (!['.js', '.css', '.json'].includes(extname(f))) continue;
      const texte = readFileSync(f, 'latin1');
      for (let i = 1; i <= 5; i++) {
        const morceau = texte.slice(Math.floor((texte.length * i) / 6), Math.floor((texte.length * i) / 6) + 24);
        if (/^[\x20-\x7e]{24}$/.test(morceau)) ajout(morceau, `extrait de ${rel}`);
      }
    }
  }
  return [...t].map(([valeur, origine]) => ({ valeur, origine }));
}

export function verifier(dossier, { temoins = fabriquerTemoins(), secret = lireSecret(), dossierLocal = join(ROOT, 'dist/local') } = {}) {
  const problemes = [];
  const fichiers = tousLesFichiers(dossier);
  const rel = (f) => relative(dossier, f).split('\\').join('/');
  const octets = temoins.filter((t) => Buffer.byteLength(t.valeur) >= 6);
  const noms = new Set(); // noms d'origine
  if (existsSync(dossierLocal)) for (const f of tousLesFichiers(dossierLocal)) { noms.add(basename(f)); noms.add(relative(dossierLocal, f).split('\\').join('/')); }
  let chiffres = 0;

  for (const f of fichiers) {
    const r = rel(f);
    const buf = readFileSync(f);
    if (CHARGEUR.includes(r)) {
      // chargeur : lisible, mais sans aucune donnée privée (recherche insensible à la casse et aux accents, toutes longueurs)
      if (['police.woff2'].includes(r)) continue;
      const texte = sansAccents(buf.toString('utf8')).toLowerCase();
      for (const t of temoins) {
        const v = sansAccents(t.valeur).toLowerCase();
        if (v.length < 3) continue;
        // un nom court (lea, lise…) ne compte que comme mot entier : « clear » n'est pas Léa
        const trouve = v.length >= 6 || !/^[a-z0-9]+$/.test(v) ? texte.includes(v) : new RegExp(`(^|[^a-z0-9])${v}($|[^a-z0-9])`).test(texte);
        if (trouve) problemes.push(`chargeur : « ${t.valeur} » (${t.origine}) dans ${r}`);
      }
      if (/prive[\\/]|prive-baked/.test(texte)) problemes.push(`chargeur : chemin de prive/ dans ${r}`);
      if (secret) {
        if (buf.includes(secret.cle)) problemes.push(`chargeur : la clé K apparaît dans ${r}`);
        if (sansAccents(buf.toString('utf8')).toLowerCase().includes(sansAccents(secret.motDePasse).toLowerCase())) problemes.push(`chargeur : la phrase de passe apparaît dans ${r}`);
      }
      if (r === 'verrou.json') {
        const cles = Object.keys(JSON.parse(buf.toString('utf8'))).sort().join(',');
        if (cles !== 'cleEnveloppee,iterations,iv,sel,v') problemes.push(`verrou.json : clés inattendues (${cles})`);
      }
      continue;
    }
    chiffres++;
    if (!NOM_MASQUE.test(r)) { problemes.push(`nom non masqué : ${r}`); continue; }
    if (buf.length < 12 + 16 + 1) problemes.push(`${r} : trop court pour un fichier chiffré`);
    const h = entropie(buf);
    if ((buf.length >= 4096 && h < 7.9) || (buf.length >= 512 && h < 7.0)) problemes.push(`${r} : entropie ${h.toFixed(3)} bits/octet (lisible ?)`);
    for (const decalage of [0, 12]) {
      const s = SIGNATURES_DEBUT.find(([, sig]) => debutEgal(buf, decalage, sig));
      if (s) problemes.push(`${r} : signature ${s[0]} à l'octet ${decalage}`);
    }
    for (const sig of SIGNATURES_PARTOUT) if (buf.includes(Buffer.from(sig, 'latin1'))) problemes.push(`${r} : signature « ${sig.replace(/[^\x20-\x7e]/g, '·')} » lisible`);
    const trouve = chercher(buf, octets);
    if (trouve) problemes.push(`${r} : « ${trouve.valeur} » (${trouve.origine}) lisible`);
  }
  for (const n of noms) for (const f of fichiers) if (!CHARGEUR.includes(rel(f)) && rel(f).includes(n)) problemes.push(`nom d'origine « ${n} » dans le nom ${rel(f)}`);
  for (const attendu of CHARGEUR) if (!fichiers.some((f) => rel(f) === attendu)) problemes.push(`fichier du chargeur manquant : ${attendu}`);
  if (!chiffres) problemes.push('aucun fichier chiffré');
  return { problemes, chiffres, fichiers: fichiers.length, temoins: temoins.length, octets: fichiers.reduce((a, f) => a + statSync(f).size, 0) };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const dossier = resolve(ROOT, process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'dist/partage');
  if (!existsSync(dossier)) { console.error(`garde-partage : ${dossier} introuvable (npm run build:partage).`); process.exit(1); }
  const r = verifier(dossier);
  if (r.problemes.length) {
    console.error(`garde-partage : ${relative(ROOT, dossier)} laisse du lisible :\n  - ${r.problemes.slice(0, 25).join('\n  - ')}${r.problemes.length > 25 ? `\n  … et ${r.problemes.length - 25} autres` : ''}`);
    process.exit(1);
  }
  console.log(`garde-partage : ${relative(ROOT, dossier)} opaque (${r.chiffres} fichiers chiffrés, ${(r.octets / 1048576).toFixed(0)} Mo, ${r.temoins} témoins cherchés, chargeur propre).`);
}
