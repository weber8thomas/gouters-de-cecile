// Sons du livre (plan v4, lot S) : pages, feuilletage, couverture, feuillet volant, photo, coin ; et
// l'ambiance : la boucle du feu de cheminée et des bruits de cuisine délicats.
//
//   node scripts/bake-sons.mjs [--synthese] [--only page,coin,ambiance] [--sans-ecoute]
//
// Entrées
//   design-system/sources/sons/licences.json      sources CC0 ou domaine public vérifiées (page Freesound,
//                                                  OpenGameArt ou Wikimedia Commons, auteur, sha256)
//   design-system/sources/sons/freesound-<id>.mp3  aperçus HQ téléchargés tels quels ; s'il manque, il est
//                                                  retéléchargé (curl) et son sha256 vérifié ; sinon : synthèse
//   design-system/sources/sons/oga-<auteur>-<nom>.* OpenGameArt (CC0) et Wikimedia Commons (domaine public) : le
//   design-system/sources/sons/commons-<nom>.*     fichier téléchargé tel quel (« url »), ou, quand l'original est
//                                                  une longue prise ou dans une archive, l'extrait gardé ici
//                                                  (FLAC 16 bits mono) ou le fichier sorti de l'archive : leur
//                                                  « origine » (url, sha256, découpe) est dans licences.json
// Sorties (noms logiques d'assetUrl() entre crochets)
//   design-system/baked/sons/<nom>[-k].mp3         [sons/<nom>[-k]]  mono, 44,1 kHz, MP3 96 kb/s, ≤ 30 Ko,
//                                                  crête à −3 dBFS
//   design-system/baked/sons/banque.json           { v, sons: { <nom>: [{ f, g, d, a }] } } : fichiers de chaque
//                                                  son (variantes), gain de mixage g (≤ 1), durée d (s), instant
//                                                  du choc a (s, trame la plus forte : pour caler un `delai`).
//                                                  « ambiance » : { feu: { f, g, d, boucle, fondu, onsets,
//                                                  forces }, cuisine: { <nom>: [{ f, g, d }] } } (src/lib/ambiance.ts)
//   design-system/baked/sons/ambiance-feu.mp3      [sons/ambiance-feu]  boucle du feu, mono 96 kb/s : jouée en
//                                                  fondu croisé (boucle + fondu s, la fin sur le début suivant)
//   design-system/baked/sons/cuisine-<nom>[-k].mp3 cuillère, tasse, bouilloire au loin, thé, boîte à biscuits, puis
//                                                  couteau sur la planche, assiette, sel, minuteur, chat, horloge,
//                                                  paquet de biscuits, chaise, tiroir, verre (AMBIANCE.cuisine).
//                                                  Lu par src/lib/son.ts (importé, donc dans le bundle).
//   design-system/sources/sons/licences.json       « fichiers » : chaque son cuit → sa source et son extrait,
//                                                  ou { "source": "synthese" }
//   verification/out/v4-s/sons.mp3 (+ sons.txt)    fichier d'écoute : tous les sons, puis une petite scène
//   verification/out/v4-s/sons-synthese.mp3        la banque de repli (synthèse), pour comparer
//   verification/out/v4-s/ambiance.mp3 (+ .txt)    30 s d'ambiance (stéréo) : le feu en boucle (une couture
//                                                  à 14 s), les bruits de cuisine à gauche et à droite, deux
//                                                  pages tournées pour juger le niveau
//   verification/out/v4-s/cuisine.mp3 (+ .txt)     tous les bruits de cuisine, un toutes les 6 s, sur le feu,
//                                                  au gain du moteur (banque × GAIN_CUISINE)
//
// Chaîne : extrait (ffmpeg, -ss/-to) → mono 44,1 kHz → passe-haut (et débruitage léger des prises
// calmes) → fondus en cosinus → crête à −3 dBFS → MP3 96 kb/s (LAME, bitexact). Le gain de mixage g
// ramène chaque variante à sa sonie cible (RMS des trames actives) : les fichiers gardent toute leur
// résolution, l'équilibre entre les sons est dans banque.json.
//
// Repli (--synthese, ou source introuvable) : synthèse procédurale déterministe (bruit filtré, enveloppes
// de froissement, « tchok » de carton pour la couverture), marquée « synthese » dans licences.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT } from './lib/serve.mjs';
import { rng } from './lib/prng.mjs';

const FFMPEG = 'ffmpeg';
const SR = 44100;
const CRETE_DB = -3;
const MAX_OCTETS = 30 * 1024;
/** Ambiance : environ 96 kb/s (12 Ko/s), boucle du feu comprise. */
const octetsMax = (d) => Math.ceil(d * 12.5 * 1024 + 4096);
const DEBIT = '96k';
const SOURCES = join(ROOT, 'design-system/sources/sons');
const LICENCES = join(SOURCES, 'licences.json');
const BAKED = join(ROOT, 'design-system/baked/sons');
const ECOUTE = join(ROOT, 'verification/out/v4-s');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const forcerSynthese = args.includes('--synthese');
const seuls = opt('only')?.split(',').filter(Boolean);
const sansEcoute = args.includes('--sans-ecoute');

// ---- Recettes ----------------------------------------------------------------------------------
// cible : sonie visée (dB RMS des trames actives, avant volume et vitesse). extrait : [début, fin] en s
// dans la source. fondu : [entrée, sortie] en s. filtre : chaîne ffmpeg (passe-haut, débruitage).
// limite : dB retirés aux crêtes isolées (claquement final) avant la normalisation, pour que la crête à
// −3 dBFS ne laisse pas le reste du son trop bas.
const PAPIER = 'highpass=f=160:p=2';
const CALME = `${PAPIER},afftdn=nr=10:nf=-62`; // prises très calmes (crête vers −27 dB) : souffle remonté
export const RECETTES = {
  page: {
    cible: -26, filtre: CALME, fondu: [0.015, 0.11],
    variantes: [[0.66, 1.45], [2.19, 2.98], [3.91, 4.62], [9.10, 9.88], [12.42, 13.13]].map((e) => ({ source: 'freesound-164806', extrait: e })),
  },
  riffle: { cible: -25, filtre: PAPIER, fondu: [0.02, 0.1], limite: 4, variantes: [{ source: 'freesound-523948', extrait: [0.2, 1.13] }] },
  'couverture-ouvrir': { cible: -27, filtre: 'highpass=f=70:p=2', fondu: [0.03, 0.22], limite: 10, variantes: [{ source: 'freesound-393844', extrait: [0.38, 1.62] }] },
  'couverture-poser': { cible: -25, filtre: 'highpass=f=45:p=2', fondu: [0.004, 0.08], variantes: [{ source: 'freesound-195795', extrait: [1.43, 1.85] }] },
  'couverture-fermer': { cible: -24, filtre: 'highpass=f=45:p=2', fondu: [0.012, 0.09], variantes: [{ source: 'freesound-256472', extrait: [0.0, 0.95] }] },
  feuillet: {
    cible: -28, filtre: PAPIER, fondu: [0.006, 0.12],
    variantes: [{ source: 'freesound-509878', extrait: [0.04, 0.52] }, { source: 'freesound-509878', extrait: [0.76, 1.17] }],
  },
  'photo-lever': { cible: -29, filtre: `${PAPIER},afftdn=nr=8:nf=-60`, fondu: [0.01, 0.07], variantes: [{ source: 'freesound-470189', extrait: [0.0, 0.37] }] },
  'photo-poser': { cible: -28, filtre: 'highpass=f=90:p=2', fondu: [0.003, 0.03], variantes: [{ source: 'freesound-19244', extrait: [0.29, 0.385] }] },
  coin: {
    cible: -36, filtre: CALME, fondu: [0.05, 0.16],
    variantes: [{ source: 'freesound-164806', extrait: [20.66, 21.02] }, { source: 'freesound-164806', extrait: [10.80, 11.12] }],
  },
};
export const NOMS = Object.keys(RECETTES);

// Ambiance (src/lib/ambiance.ts) : le feu (boucle de `boucle` s, fondu croisé de `fondu` s : l'extrait dure
// boucle + fondu) et la cuisine (joués au hasard toutes les 5 à 15 s, un peu à gauche ou à droite).
export const AMBIANCE = {
  // Deux couches : les crépitements doux (florianreichelt) et, plus bas, le souffle grave des bûches (giddster).
  feu: {
    boucle: 42, fondu: 2.5, cible: -36, limite: 4,
    couches: [
      { source: 'freesound-563766', extrait: [3.0, 47.5], filtre: 'highpass=f=45:p=2,lowpass=f=12000', gain: 1 },
      { source: 'freesound-414482', extrait: [10.0, 54.5], filtre: 'highpass=f=35:p=2,lowpass=f=900', gain: 0.55 },
    ],
  },
  cuisine: {
    'cuisine-cuillere': { cible: -37, filtre: 'highpass=f=250:p=2', fondu: [0.02, 0.4], variantes: [{ source: 'freesound-444892', extrait: [6.15, 9.35] }] },
    'cuisine-tasse': {
      cible: -36, filtre: 'highpass=f=200:p=2', fondu: [0.003, 0.15],
      variantes: [{ source: 'freesound-568758', extrait: [0.02, 0.7] }, { source: 'freesound-460242', extrait: [2.45, 3.6] }],
    },
    'cuisine-bouilloire': { cible: -42, filtre: 'highpass=f=150:p=2,lowpass=f=2400:p=2', fondu: [1.8, 2.4], variantes: [{ source: 'freesound-740168', extrait: [0.4, 8.4] }] },
    'cuisine-the': { cible: -39, filtre: 'highpass=f=200:p=2', fondu: [0.25, 0.45], variantes: [{ source: 'freesound-457276', extrait: [1.82, 3.8] }] },
    'cuisine-boite': { cible: -38, filtre: 'highpass=f=150:p=2', fondu: [0.02, 0.3], variantes: [{ source: 'freesound-387967', extrait: [1.18, 2.95] }] },
    // Plus de bruits de goûter (OpenGameArt CC0, une pièce de Wikimedia Commons en domaine public). L'extrait est
    // relatif au fichier gardé dans design-system/sources/sons (une découpe de l'original quand il est long).
    'cuisine-couteau': { cible: -38, filtre: 'highpass=f=120:p=2', fondu: [0.01, 0.5], variantes: [{ source: 'oga-bretbernhoft-kitchencuttingboard01', extrait: [1.0, 5.1] }] },
    'cuisine-assiette': { cible: -38, filtre: 'highpass=f=250:p=2', fondu: [0.01, 0.35], variantes: [{ source: 'oga-bretbernhoft-forkonplate01', extrait: [0.15, 2.05] }] },
    'cuisine-sel': { cible: -41, filtre: 'highpass=f=300:p=2', fondu: [0.25, 0.7], variantes: [{ source: 'oga-tinyworlds-adding_salt_01', extrait: [0.0, 3.1] }] },
    'cuisine-minuteur': { cible: -38, filtre: 'highpass=f=500:p=2', fondu: [0.002, 0.6], variantes: [{ source: 'oga-laleksic-bell', extrait: [0.0, 1.9] }] },
    'cuisine-chat': {
      cible: -38, filtre: 'highpass=f=150:p=2', fondu: [0.06, 0.3],
      variantes: [{ source: 'oga-kerzoven-cat_softmew', extrait: [0.15, 2.4] }, { source: 'oga-kerzoven-cat_mewfood', extrait: [0.0, 1.13] }],
    },
    'cuisine-horloge': { cible: -40, filtre: 'highpass=f=300:p=2,lowpass=f=3500:p=2', fondu: [0.3, 0.8], variantes: [{ source: 'oga-bart-ticking_clock', extrait: [0.0, 4.0] }] },
    'cuisine-paquet': {
      cible: -40, filtre: 'highpass=f=400:p=2', fondu: [0.05, 0.3],
      variantes: [{ source: 'oga-jumbosizedfish-opening_0', extrait: [0.0, 2.06] }, { source: 'oga-jumbosizedfish-grabbing2_0', extrait: [0.0, 1.27] }],
    },
    'cuisine-chaise': { cible: -40, filtre: 'highpass=f=200:p=2', fondu: [0.2, 0.5], variantes: [{ source: 'commons-creaky_wooden_swivel_chair', extrait: [2.55, 5.0] }] },
    'cuisine-tiroir': {
      cible: -38, filtre: 'highpass=f=120:p=2', fondu: [0.01, 0.15],
      variantes: [{ source: 'oga-laleksic-drawer_open', extrait: [0.0, 0.88] }, { source: 'oga-laleksic-drawer_close', extrait: [0.0, 0.69] }],
    },
    'cuisine-verre': { cible: -37, filtre: 'highpass=f=500:p=2', fondu: [0.003, 0.2], variantes: [{ source: 'oga-laleksic-clang_glass', extrait: [0.0, 0.87] }] },
  },
};

// ---- Outils audio --------------------------------------------------------------------------------
const db = (v) => 20 * Math.log10(v + 1e-12);
const lin = (d) => 10 ** (d / 20);

function crete(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
  return m;
}

/** Instant (s) de la trame de 10 ms la plus forte : le choc du son (page qui retombe, carton). */
function attaque(x) {
  const n = Math.floor(SR * 0.01);
  let best = 0;
  let at = 0;
  for (let i = 0; i + n <= x.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += x[j] * x[j];
    if (s > best) { best = s; at = i; }
  }
  return at / SR;
}

/** Sonie : RMS des trames de 10 ms qui sont à moins de 30 dB de la plus forte (dB). */
function sonie(x) {
  const n = Math.floor(SR * 0.01);
  const trames = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += x[j] * x[j];
    trames.push(s / n);
  }
  if (!trames.length) return -120;
  const max = Math.max(...trames);
  const actives = trames.filter((t) => t >= max * 1e-3);
  return 10 * Math.log10(actives.reduce((a, b) => a + b, 0) / actives.length + 1e-24);
}

/**
 * Limiteur à anticipation (1,5 ms) : les crêtes au-delà de (crête − dB) sont ramenées au seuil, le gain
 * descend en douceur avant la crête (moyenne glissante d'un minimum glissant) et remonte en 60 ms.
 */
function limiter(x, dbRetires) {
  if (!dbRetires) return x;
  const T = crete(x) * lin(-dbRetires);
  const L = Math.round(0.0015 * SR);
  const n = x.length;
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); req[i] = a > T ? T / a : 1; }
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = 1; for (let j = i; j <= i + L && j < n; j++) if (req[j] < v) v = req[j]; m[i] = v; }
  const rel = 1 - Math.exp(-1 / (0.06 * SR));
  let somme = L; // fenêtre [i − L + 1, i], des 1 avant le début
  let g = 1;
  for (let i = 0; i < n; i++) {
    somme += m[i] - (i >= L ? m[i - L] : 1);
    const moy = somme / L;
    g = Math.min(moy, g + (1 - g) * rel);
    x[i] *= g;
  }
  return x;
}

/** Fondus en cosinus (entrée, sortie), en place. */
function fondre(x, [fe, fs]) {
  const ne = Math.min(x.length, Math.round(fe * SR));
  const ns = Math.min(x.length, Math.round(fs * SR));
  for (let i = 0; i < ne; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / ne);
  for (let i = 0; i < ns; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / ns);
  return x;
}

function pcm(buf) {
  const b = Buffer.from(buf);
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)).slice();
}

/** Extrait [a, b] d'un fichier, mono 44,1 kHz, filtré. */
function extraire(fichier, [a, b], filtre) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(a), '-to', String(b), '-i', fichier, '-ac', '1', '-ar', String(SR), ...(filtre ? ['-af', filtre] : []), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg (extrait ${fichier}) : ${r.stderr}`);
  return pcm(r.stdout);
}

function decoder(fichier) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', fichier, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg (décodage ${fichier}) : ${r.stderr}`);
  return pcm(r.stdout);
}

function encoder(x, sortie, debit = DEBIT) {
  const entree = Buffer.from(x.buffer, x.byteOffset, x.byteLength);
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-',
    '-c:a', 'libmp3lame', '-b:a', debit, '-ac', '1', '-ar', String(SR), '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', sortie], { input: entree, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg (encodage ${sortie}) : ${r.stderr}`);
}

const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// ---- Sources ---------------------------------------------------------------------------------------
const licences = JSON.parse(readFileSync(LICENCES, 'utf8'));

/** Chemin de la source (retéléchargée si elle manque) ou null (→ synthèse). */
function source(cle) {
  const s = licences.sources?.[cle];
  if (!s || !/^(CC0|Domaine public)/.test(s.licence ?? '')) return null;
  const f = join(SOURCES, s.fichier.nom);
  if (!existsSync(f)) {
    if (!s.fichier.url) return null; // extrait ou fichier d'archive : pas de téléchargement direct (voir « origine »)
    try {
      console.log(`  ↓ ${s.fichier.url}`);
      execFileSync('curl', ['-sS', '-L', '--retry', '3', '-o', f, s.fichier.url]);
    } catch {
      return null;
    }
  }
  if (sha256(f) !== s.fichier.sha256) {
    console.warn(`  ! ${s.fichier.nom} : sha256 inattendu, source écartée (synthèse)`);
    return null;
  }
  return f;
}

// ---- Synthèse (repli) ------------------------------------------------------------------------------
// Bruit filtré (biquads RBJ), enveloppes de froissement (bruit lent qui module l'amplitude), petits
// claquements de papier, et un « tchok » de carton (sinus grave qui retombe + souffle bref).
function biquad(type, f, q = 0.707) {
  const w = (2 * Math.PI * f) / SR;
  const cw = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'passe-bas') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  else if (type === 'passe-haut') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; } // passe-bande
  const a0 = 1 + al;
  const a1 = -2 * cw;
  const a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function froissement(r, x, t0, duree, { bas = 1800, haut = 7000, grain = 28, force = 1, attaque = 0.06 } = {}) {
  const hp = biquad('passe-haut', bas);
  const lp = biquad('passe-bas', haut);
  const lent = biquad('passe-bas', grain);
  const i0 = Math.round(t0 * SR);
  const n = Math.round(duree * SR);
  for (let i = 0; i < n && i0 + i < x.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / attaque) * Math.max(0, 1 - t / duree) ** 1.6;
    const mod = 0.55 + 4 * Math.abs(lent(r.next() * 2 - 1));
    x[i0 + i] += force * env * mod * lp(hp(r.next() * 2 - 1));
  }
}

function claquement(r, x, t0, force = 0.6, duree = 0.012, couleur = 3500) {
  const bp = biquad('passe-bande', couleur, 1.2);
  const i0 = Math.round(t0 * SR);
  const n = Math.round(duree * SR);
  for (let i = 0; i < n && i0 + i < x.length; i++) x[i0 + i] += force * Math.exp(-i / (n / 4)) * bp(r.next() * 2 - 1) * 3;
}

function tchok(r, x, t0, force = 1) {
  const i0 = Math.round(t0 * SR);
  const n = Math.round(0.22 * SR);
  const bp = biquad('passe-bande', 900, 0.9);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < x.length; i++) {
    const t = i / SR;
    const f = 70 + 70 * Math.exp(-t / 0.025);
    ph += (2 * Math.PI * f) / SR;
    const corps = Math.sin(ph) * Math.exp(-t / 0.05);
    const souffle = bp(r.next() * 2 - 1) * Math.exp(-t / 0.018) * 2.2;
    x[i0 + i] += force * (0.9 * corps + souffle);
  }
}

export function synthese(nom, k = 0) {
  const r = rng(`gc-son-${nom}-${k}`);
  const duree = { page: 0.62, riffle: 1.2, 'couverture-ouvrir': 1.1, 'couverture-poser': 0.3, 'couverture-fermer': 0.7, feuillet: 0.55, 'photo-lever': 0.32, 'photo-poser': 0.26, coin: 0.32 }[nom] ?? 0.5;
  const x = new Float32Array(Math.round(duree * SR));
  switch (nom) {
    case 'page':
      froissement(r, x, 0.01, 0.42 + 0.06 * r.next(), { bas: 1400 + 400 * r.next(), haut: 7500, grain: 22 + 10 * r.next() });
      claquement(r, x, 0.44 + 0.04 * r.next(), 0.35);
      claquement(r, x, 0.5 + 0.05 * r.next(), 0.22, 0.01, 2600);
      break;
    case 'riffle': {
      let t = 0.02;
      for (let i = 0; i < 18; i++) {
        const pas = 0.035 + 0.04 * Math.abs(i - 9) / 9;
        froissement(r, x, t, 0.06, { bas: 1600, haut: 8000, grain: 60, force: 0.8, attaque: 0.006 });
        claquement(r, x, t + 0.045, 0.25 + 0.15 * r.next());
        t += pas;
      }
      break;
    }
    case 'couverture-ouvrir':
      froissement(r, x, 0.0, 0.9, { bas: 300, haut: 2500, grain: 12, force: 0.7, attaque: 0.25 });
      froissement(r, x, 0.25, 0.6, { bas: 2000, haut: 6000, grain: 30, force: 0.35 });
      break;
    case 'couverture-poser':
      tchok(r, x, 0.005, 1);
      break;
    case 'couverture-fermer':
      froissement(r, x, 0.0, 0.42, { bas: 400, haut: 3000, grain: 14, force: 0.6, attaque: 0.3 });
      tchok(r, x, 0.4, 1.1);
      break;
    case 'feuillet':
      claquement(r, x, 0.01, 0.4, 0.01, 4200);
      froissement(r, x, 0.05, 0.45, { bas: 2500, haut: 9000, grain: 35, force: 0.8 });
      break;
    case 'photo-lever':
      claquement(r, x, 0.005, 0.3, 0.008, 5000);
      froissement(r, x, 0.02, 0.28, { bas: 3000, haut: 9000, grain: 40, force: 0.6, attaque: 0.03 });
      break;
    case 'photo-poser':
      claquement(r, x, 0.01, 0.35, 0.008, 4500);
      tchok(r, x, 0.06, 0.45);
      break;
    case 'coin':
      froissement(r, x, 0.0, 0.3, { bas: 2200, haut: 7000, grain: 18, force: 0.5, attaque: 0.09 });
      break;
    default:
      froissement(r, x, 0, duree);
  }
  return x;
}

/** Tintement (tasse, cuillère, métal) : quelques partiels qui s'éteignent. */
function tinter(x, t0, partiels, force = 0.5, tenue = 0.25) {
  const i0 = Math.round(t0 * SR);
  const n = Math.round(tenue * 4 * SR);
  for (let i = 0; i < n && i0 + i < x.length; i++) {
    const t = i / SR;
    let v = 0;
    partiels.forEach((f, k) => { v += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (tenue / (1 + 0.6 * k))) / (1 + k); });
    x[i0 + i] += force * v * Math.min(1, t / 0.002);
  }
}

/** Repli de l'ambiance : feu (souffle grave qui respire + crépitements), cuisine (tintements, bruits filtrés). */
export function syntheseAmbiance(nom, k = 0) {
  const r = rng(`gc-ambiance-${nom}-${k}`);
  if (nom === 'ambiance-feu') {
    const d = AMBIANCE.feu.boucle + AMBIANCE.feu.fondu;
    const x = new Float32Array(Math.round(d * SR));
    const lp = biquad('passe-bas', 520);
    const lent = biquad('passe-bas', 0.7);
    for (let i = 0; i < x.length; i++) x[i] = 0.25 * lp(r.next() * 2 - 1) * (0.7 + 6 * Math.abs(lent(r.next() * 2 - 1)));
    for (let t = 0.05; t < d - 0.05; t += -Math.log(1 - r.next()) / 3) claquement(r, x, t, 0.1 + 0.5 * r.next() ** 2, 0.004 + 0.01 * r.next(), 1800 + 5000 * r.next());
    return x;
  }
  const duree = {
    'cuisine-cuillere': 3, 'cuisine-tasse': 0.8, 'cuisine-bouilloire': 7, 'cuisine-the': 2, 'cuisine-boite': 1.6,
    'cuisine-couteau': 4, 'cuisine-assiette': 1.9, 'cuisine-sel': 3, 'cuisine-minuteur': 1.9, 'cuisine-chat': 2, 'cuisine-horloge': 4,
    'cuisine-paquet': 1.6, 'cuisine-chaise': 2.4, 'cuisine-tiroir': 0.8, 'cuisine-verre': 0.9,
  }[nom] ?? 1;
  const x = new Float32Array(Math.round(duree * SR));
  switch (nom) {
    case 'cuisine-cuillere':
      for (let i = 0; i < 4; i++) tinter(x, 0.15 + 0.62 * i + 0.08 * r.next(), [2650, 4170, 6230], 0.25 + 0.1 * r.next(), 0.12);
      break;
    case 'cuisine-tasse':
      tinter(x, 0.02, [1830, 3240, 5200], 0.5, 0.18);
      tinter(x, 0.11, [1860, 3300], 0.2, 0.1);
      break;
    case 'cuisine-bouilloire':
      froissement(r, x, 0, duree, { bas: 180, haut: 1400, grain: 9, force: 0.4, attaque: 1.5 });
      for (let t = 0.5; t < duree - 0.5; t += 0.04 + 0.12 * r.next()) claquement(r, x, t, 0.05 * r.next(), 0.006, 700 + 600 * r.next());
      break;
    case 'cuisine-the':
      froissement(r, x, 0, duree, { bas: 900, haut: 4200, grain: 7, force: 0.5, attaque: 0.2 });
      break;
    case 'cuisine-boite':
      tinter(x, 0.05, [920, 1530, 2710], 0.4, 0.09);
      tinter(x, 0.62, [910, 1500, 2690, 3900], 0.55, 0.14);
      break;
    default:
      froissement(r, x, 0, duree);
  }
  return x;
}

/** Instants des crépitements (s) dans [0, fin), et leur force (0–1) : pour la lumière du feu (lot L). */
function crepitements(y, fin) {
  const hp = biquad('passe-haut', 1500);
  const z = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) z[i] = hp(y[i]);
  const n = Math.floor(SR * 0.01);
  const env = [];
  for (let i = 0; i + n <= z.length; i += n) {
    let m = 0;
    for (let j = i; j < i + n; j++) { const a = Math.abs(z[j]); if (a > m) m = a; }
    env.push(m);
  }
  const med = [...env].sort((a, b) => a - b)[Math.floor(env.length / 2)] || 1e-9;
  const onsets = [];
  const forces = [];
  let dernier = -1e9;
  for (let i = 1; i < env.length - 1; i++) {
    const t = i * 0.01;
    if (t >= fin) break;
    if (env[i] < 5 * med || env[i] < env[i - 1] || env[i] < env[i + 1] || t - dernier < 0.1) continue;
    onsets.push(+t.toFixed(3));
    forces.push(+Math.max(0.1, Math.min(1, db(env[i] / (5 * med)) / 20)).toFixed(2));
    dernier = t;
  }
  return { onsets, forces };
}

// ---- Cuisson --------------------------------------------------------------------------------------
function cuire(nom, k, x, { fondu, cible, limite, maxOctets = MAX_OCTETS }) {
  fondre(x, fondu);
  limiter(x, limite);
  const c0 = crete(x);
  if (c0 <= 0) throw new Error(`${nom} : extrait silencieux`);
  const g = lin(CRETE_DB) / c0;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  const f = `${nom}${k}`;
  const sortie = join(BAKED, `${f}.mp3`);
  // L'encodeur MP3 peut dépasser la crête de quelques dixièmes de dB : on relit et on corrige.
  let y;
  for (let essai = 0; essai < 4; essai++) {
    encoder(x, sortie);
    y = decoder(sortie);
    const exces = db(crete(y)) - CRETE_DB;
    if (exces <= 0) break;
    const k2 = lin(-exces - 0.05);
    for (let i = 0; i < x.length; i++) x[i] *= k2;
  }
  const octets = statSync(sortie).size;
  const cr = db(crete(y));
  const so = sonie(y);
  const mix = Math.min(1, lin(cible - so));
  const d = y.length / SR;
  if (octets > maxOctets) throw new Error(`${f}.mp3 : ${octets} o > ${maxOctets}`);
  if (cr > CRETE_DB + 0.01) throw new Error(`${f}.mp3 : crête ${cr.toFixed(2)} dBFS > ${CRETE_DB}`);
  console.log(`  ✓ ${f}.mp3  ${(octets / 1024).toFixed(1)} Ko · ${d.toFixed(2)} s · crête ${cr.toFixed(1)} dBFS · sonie ${so.toFixed(1)} dB → g ${mix.toFixed(3)}`);
  return { f, g: +mix.toFixed(3), d: +d.toFixed(3), a: +attaque(y).toFixed(3), octets, sha256: sha256(sortie), y };
}

mkdirSync(BAKED, { recursive: true });
const banqueFichier = join(BAKED, 'banque.json');
const banque = existsSync(banqueFichier) ? JSON.parse(readFileSync(banqueFichier, 'utf8')) : { v: 1, sons: {} };
banque.v = 1;
banque.sons ??= {};
licences.fichiers ??= {};

for (const nom of NOMS) {
  if (seuls && !seuls.includes(nom)) continue;
  const R = RECETTES[nom];
  console.log(`■ ${nom}`);
  const entrees = [];
  R.variantes.forEach((v, i) => {
    const k = R.variantes.length > 1 ? `-${i + 1}` : '';
    const src = forcerSynthese ? null : source(v.source);
    let x;
    let prov;
    if (src) {
      x = extraire(src, v.extrait, R.filtre);
      prov = { source: v.source, extrait: v.extrait, filtre: R.filtre };
    } else {
      x = synthese(nom, i);
      prov = { source: 'synthese', graine: `gc-son-${nom}-${i}` };
    }
    const e = cuire(nom, k, x, R);
    licences.fichiers[e.f] = { ...prov, octets: e.octets, sha256: e.sha256 };
    entrees.push({ f: e.f, g: e.g, d: e.d, a: e.a });
  });
  banque.sons[nom] = entrees;
}
// ---- Ambiance : le feu (boucle), la cuisine ----
if (!seuls || seuls.includes('ambiance')) {
  console.log('■ ambiance');
  const A = AMBIANCE.feu;
  const srcs = forcerSynthese ? [] : A.couches.map((c) => source(c.source));
  let xFeu;
  let prov;
  if (srcs.length && srcs.every(Boolean)) {
    // Les couches mêlées à leur gain (même longueur : boucle + fondu).
    const n = Math.round((A.boucle + A.fondu) * SR);
    xFeu = new Float32Array(n);
    A.couches.forEach((c, i) => {
      const y = extraire(srcs[i], c.extrait, c.filtre);
      for (let j = 0; j < n && j < y.length; j++) xFeu[j] += c.gain * y[j];
    });
    prov = { source: A.couches[0].source, couches: A.couches.map((c) => ({ source: c.source, extrait: c.extrait, filtre: c.filtre, gain: c.gain })) };
  } else {
    xFeu = syntheseAmbiance('ambiance-feu');
    prov = { source: 'synthese', graine: 'gc-ambiance-ambiance-feu-0' };
  }
  const eFeu = cuire('ambiance-feu', '', xFeu, { fondu: [0.004, 0.004], cible: A.cible, limite: A.limite, maxOctets: octetsMax(A.boucle + A.fondu) });
  licences.fichiers[eFeu.f] = { ...prov, octets: eFeu.octets, sha256: eFeu.sha256 };
  const { onsets, forces } = crepitements(eFeu.y, A.boucle);
  console.log(`    ${onsets.length} crépitements sur ${A.boucle} s (${(onsets.length / A.boucle).toFixed(1)} /s)`);
  const cuisine = {};
  for (const [nom, R] of Object.entries(AMBIANCE.cuisine)) {
    cuisine[nom] = R.variantes.map((v, i) => {
      const k = R.variantes.length > 1 ? `-${i + 1}` : '';
      const src = forcerSynthese ? null : source(v.source);
      const x = src ? extraire(src, v.extrait, R.filtre) : syntheseAmbiance(nom, i);
      const e = cuire(nom, k, x, { ...R, maxOctets: octetsMax(v.extrait[1] - v.extrait[0]) });
      licences.fichiers[e.f] = { ...(src ? { source: v.source, extrait: v.extrait, filtre: R.filtre } : { source: 'synthese', graine: `gc-ambiance-${nom}-${i}` }), octets: e.octets, sha256: e.sha256 };
      return { f: e.f, g: e.g, d: e.d };
    });
  }
  banque.ambiance = { feu: { f: eFeu.f, g: eFeu.g, d: eFeu.d, boucle: A.boucle, fondu: A.fondu, onsets, forces }, cuisine };
}

// Ordre stable des clés (diff lisible).
banque.sons = Object.fromEntries(NOMS.filter((n) => banque.sons[n]).map((n) => [n, banque.sons[n]]));
licences.fichiers = Object.fromEntries(Object.keys(licences.fichiers).sort().map((k) => [k, licences.fichiers[k]]));
// Une ligne par variante et par liste d'instants : banque.json reste lisible.
const json = JSON.stringify(banque, null, 2)
  .replace(/\{\s+"f": ([^{}\[\]]+?)\s+\}/g, (m, c) => `{ "f": ${c.replace(/\s*\n\s*/g, ' ')} }`)
  .replace(/\[\s+([-\d.,\s]+?)\s+\]/g, (m, c) => `[${c.replace(/\s*\n\s*/g, ' ')}]`);
writeFileSync(banqueFichier, json + '\n');
writeFileSync(LICENCES, JSON.stringify(licences, null, 2) + '\n');
const total = Object.values(banque.sons).flat().reduce((s, e) => s + statSync(join(BAKED, `${e.f}.mp3`)).size, 0);
console.log(`banque.json : ${Object.keys(banque.sons).length} sons, ${Object.values(banque.sons).flat().length} fichiers, ${(total / 1024).toFixed(0)} Ko`);
if (banque.ambiance) {
  const fa = [banque.ambiance.feu, ...Object.values(banque.ambiance.cuisine).flat()];
  console.log(`ambiance : ${fa.length} fichiers, ${(fa.reduce((s, e) => s + statSync(join(BAKED, `${e.f}.mp3`)).size, 0) / 1024).toFixed(0)} Ko`);
}

// ---- Fichier d'écoute -------------------------------------------------------------------------------
// Chaque son à son gain de mixage, séparés par des silences, puis une petite scène (le livre s'ouvre,
// on tourne trois pages, on feuillette, la photo se lève et se repose, le feuillet, le coin, on ferme).
function ecoute(sons, sortie, titre) {
  const morceaux = [];
  const notes = [];
  let t = 0.4;
  const poser = (x, a) => { morceaux.push([Math.round(a * SR), x]); };
  const lire = (e) => { const y = decoder(e.chemin ?? join(BAKED, `${e.f}.mp3`)); for (let i = 0; i < y.length; i++) y[i] *= e.g; return y; };
  const pistes = sons;
  for (const nom of NOMS) {
    for (const e of pistes[nom] ?? []) {
      const y = lire(e);
      poser(y, t);
      notes.push(`${t.toFixed(2)} s  ${e.f}`);
      t += y.length / SR + 0.75;
    }
  }
  t += 1.2;
  notes.push(`${t.toFixed(2)} s  scène`);
  const un = (nom, i = 0) => pistes[nom][i % pistes[nom].length];
  const scene = [
    ['couverture-ouvrir', 0, 0], ['couverture-poser', 0, 0.78], ['page', 0, 1.9], ['page', 2, 3.0], ['page', 4, 4.0],
    ['riffle', 0, 5.2], ['page', 1, 6.25], ['coin', 0, 7.4], ['page', 3, 8.1], ['photo-lever', 0, 9.3], ['photo-poser', 0, 11.4],
    ['feuillet', 0, 12.6], ['feuillet', 1, 13.5], ['feuillet', 0, 14.6], ['couverture-fermer', 0, 16.0],
  ];
  for (const [nom, i, a] of scene) {
    const e = un(nom, i);
    poser(lire(e), t + a);
  }
  t += 17.2;
  const x = new Float32Array(Math.round(t * SR));
  for (const [a, y] of morceaux) for (let i = 0; i < y.length && a + i < x.length; i++) x[a + i] += y[i];
  const c = crete(x);
  if (c > 0.97) for (let i = 0; i < x.length; i++) x[i] *= 0.97 / c;
  encoder(x, sortie, '128k');
  writeFileSync(sortie.replace(/\.mp3$/, '.txt'), `${titre}\n\n${notes.join('\n')}\n`);
  console.log(`écoute : ${sortie.replace(ROOT + '/', '')} (${t.toFixed(1)} s)`);
}

/** Relevé des bruits de cuisine par le moteur (src/lib/ambiance.ts, GAIN_CUISINE) : le fichier d'écoute le reprend. */
const GAIN_CUISINE = 2;
const EVENEMENTS = [[5, 'cuisine-cuillere', -0.5], [11, 'cuisine-tasse', 0.45], [16, 'cuisine-bouilloire', -0.6], [23, 'cuisine-the', 0.5], [28.3, 'cuisine-boite', -0.35]];
// Ambiance : 32 s en stéréo, comme le moteur la joue (src/lib/ambiance.ts) : fondu d'entrée de 3 s, le feu
// en fondu croisé (couture à 14 s), la cuisine un peu à gauche ou à droite, deux pages pour le niveau.
function ecouteAmbiance(sortie, { D = 32, evenements = EVENEMENTS, pages = [[8.5, 0], [20, 2]], titre = 'Ambiance — le feu et la cuisine, au niveau du carnet (volume 1).' } = {}) {
  const A = banque.ambiance;
  if (!A) return;
  const N = Math.round(D * SR);
  const G = new Float32Array(N);
  const Dr = new Float32Array(N);
  const poser = (y, t0, g, pan = 0, poids = null) => {
    const a = Math.cos(((pan + 1) * Math.PI) / 4);
    const b = Math.sin(((pan + 1) * Math.PI) / 4);
    const i0 = Math.round(t0 * SR);
    for (let j = 0; j < y.length; j++) {
      const i = i0 + j;
      if (i < 0 || i >= N) continue;
      const v = y[j] * g * (poids ? poids(j / SR) : 1);
      G[i] += a * v;
      Dr[i] += b * v;
    }
  };
  const feu = decoder(join(BAKED, `${A.feu.f}.mp3`));
  const P = A.feu.boucle;
  const F = A.feu.fondu;
  const notes = ['0.00 s  fondu d\'entrée (3 s)', `14.00 s  couture de la boucle du feu (fondu croisé de ${F} s)`];
  for (let k = -1; 14 + k * P < D; k++) {
    poser(feu.subarray(0, Math.round((P + F) * SR)), 14 + k * P, A.feu.g, 0, (t) => (t < F ? Math.sin((Math.PI / 2) * (t / F)) : t > P ? Math.cos((Math.PI / 2) * ((t - P) / F)) : 1));
  }
  for (const [t, nom, pan, k = 0] of evenements) {
    const e = A.cuisine[nom]?.[k];
    if (!e) continue;
    poser(decoder(join(BAKED, `${e.f}.mp3`)), t, e.g * GAIN_CUISINE, pan);
    notes.push(`${t.toFixed(2)} s  ${e.f} (${pan < 0 ? 'à gauche' : 'à droite'})`);
  }
  for (const [t, i] of pages) {
    const e = banque.sons.page?.[i];
    if (!e) continue;
    poser(decoder(join(BAKED, `${e.f}.mp3`)), t, e.g * 0.675);
    notes.push(`${t.toFixed(2)} s  ${e.f} (un tourne-page, pour le niveau)`);
  }
  for (let i = 0; i < Math.min(N, 3 * SR); i++) { const w = i / (3 * SR); G[i] *= w; Dr[i] *= w; }
  const x = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) { x[2 * i] = G[i]; x[2 * i + 1] = Dr[i]; }
  const entree = Buffer.from(x.buffer, x.byteOffset, x.byteLength);
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '160k', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', sortie], { input: entree, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg (ambiance) : ${r.stderr}`);
  writeFileSync(sortie.replace(/\.mp3$/, '.txt'), `${titre}\n\n${notes.join('\n')}\n`);
  console.log(`écoute : ${sortie.replace(ROOT + '/', '')} (${D} s, stéréo)`);
}

if (!sansEcoute && !seuls) {
  mkdirSync(ECOUTE, { recursive: true });
  ecouteAmbiance(join(ECOUTE, 'ambiance.mp3'));
  // Toute la cuisine, chaque fichier à son tour, un toutes les 6 s, tantôt à gauche tantôt à droite.
  const fichiers = Object.entries(banque.ambiance?.cuisine ?? {}).flatMap(([n, vs]) => vs.map((_, k) => [n, k]));
  ecouteAmbiance(join(ECOUTE, 'cuisine.mp3'), {
    D: 6 * fichiers.length + 4, pages: [], evenements: fichiers.map(([n, k], i) => [3 + 6 * i, n, i % 2 ? 0.45 : -0.45, k]),
    titre: `Cuisine — les ${fichiers.length} fichiers, un toutes les 6 s sur le feu, au gain du moteur (banque × ${GAIN_CUISINE}).`,
  });
  ecoute(banque.sons, join(ECOUTE, 'sons.mp3'), 'Sons du livre — chaque son à son gain de mixage, puis une petite scène.');
  // Banque de repli (synthèse) : cuite à part, dans un dossier temporaire, pour comparer à l'oreille.
  if (!forcerSynthese) {
    const tmp = join(ECOUTE, 'synthese');
    mkdirSync(tmp, { recursive: true });
    const sons = {};
    for (const nom of NOMS) {
      const R = RECETTES[nom];
      sons[nom] = R.variantes.map((_, i) => {
        const x = limiter(fondre(synthese(nom, i), R.fondu), R.limite);
        const g0 = lin(CRETE_DB) / crete(x);
        for (let j = 0; j < x.length; j++) x[j] *= g0;
        const f = `${nom}${R.variantes.length > 1 ? `-${i + 1}` : ''}`;
        encoder(x, join(tmp, `${f}.mp3`));
        return { f, chemin: join(tmp, `${f}.mp3`), g: Math.min(1, lin(R.cible - sonie(x))) };
      });
    }
    ecoute(sons, join(ECOUTE, 'sons-synthese.mp3'), 'Banque de repli (synthèse procédurale), pour comparer.');
  }
}
