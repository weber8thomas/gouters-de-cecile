// Cœur cryptographique de la « version partagée » : WebCrypto uniquement (navigateur, service worker et Node 20+).
//
//   mot de passe ──PBKDF2-SHA-256 (600 000 tours, sel de 16 octets)──▶ clé d'enveloppe ──AES-GCM──▶ cleEnveloppee (= K)
//   K (AES-256-GCM, aléatoire) chiffre chaque fichier ; Kn = HKDF(K, info « noms ») masque les noms de fichiers.
//
// Fichier chiffré : IV (12 octets) ‖ AES-GCM( [longueur du type MIME (1 octet)] [type MIME] [contenu] ) + tag.
// Le chemin d'origine est lié au chiffré (données authentifiées additionnelles) : un fichier échangé contre un autre
// par l'hébergeur ne se déchiffre plus. Nom publié = base64url(HMAC-SHA-256(Kn, chemin)).
const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const VERSION = 1;
export const ITERATIONS = 600_000;
const AAD_VERROU = enc.encode('gc-verrou-1');

/** base64url sans remplissage. */
export function b64u(octets) {
  const u = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function deB64u(texte) {
  const s = atob(String(texte).replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/** Forme canonique d'une phrase de passe : sans accents ni casse (œ → oe), tout séparateur (espace, tiret, tiret long…) ramené à un espace. */
export function normaliserMotDePasse(texte) {
  return String(texte)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Chemin canonique d'un fichier : relatif, « / », NFC, sans « ./ » ni « / » initial. */
export function cheminCanonique(chemin) {
  return String(chemin).normalize('NFC').split('\\').join('/').replace(/^\.?\/+/, '');
}

async function cleDEnveloppe(motDePasse, sel, iterations) {
  const base = await subtle.importKey('raw', enc.encode(normaliserMotDePasse(motDePasse)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Nouvelle clé de contenu K (32 octets aléatoires). */
export const nouvelleCle = () => globalThis.crypto.getRandomValues(new Uint8Array(32));

/** Enveloppe K avec le mot de passe → contenu public de verrou.json. */
export async function envelopper(k, motDePasse, { iterations = ITERATIONS, sel, iv } = {}) {
  sel ??= globalThis.crypto.getRandomValues(new Uint8Array(16));
  iv ??= globalThis.crypto.getRandomValues(new Uint8Array(12));
  const kek = await cleDEnveloppe(motDePasse, sel, iterations);
  const chiffre = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD_VERROU }, kek, k);
  return { v: VERSION, sel: b64u(sel), iterations, cleEnveloppee: b64u(chiffre), iv: b64u(iv) };
}

/** Ouvre le verrou : renvoie K (32 octets) ou lève « mauvais mot de passe ». */
export async function ouvrirVerrou(verrou, motDePasse) {
  if (!verrou || verrou.v !== VERSION) throw new Error('verrou illisible');
  const kek = await cleDEnveloppe(motDePasse, deB64u(verrou.sel), verrou.iterations);
  try {
    const k = await subtle.decrypt({ name: 'AES-GCM', iv: deB64u(verrou.iv), additionalData: AAD_VERROU }, kek, deB64u(verrou.cleEnveloppee));
    return new Uint8Array(k);
  } catch {
    throw new Error('mauvais mot de passe');
  }
}

/**
 * Clés de travail à partir de K. Non extractables : `cle` (AES-GCM) et `noms` (HMAC) se rangent telles quelles dans
 * IndexedDB. `ecriture: true` (build) ajoute l'usage « encrypt » ; le navigateur ne déchiffre que.
 */
export async function importerCles(k, { ecriture = false } = {}) {
  const cle = await subtle.importKey('raw', k, 'AES-GCM', false, ecriture ? ['encrypt', 'decrypt'] : ['decrypt']);
  const hkdf = await subtle.importKey('raw', k, 'HKDF', false, ['deriveKey']);
  const noms = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('noms') },
    hkdf,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
  return { cle, noms };
}

/** Nom publié d'un fichier : base64url(HMAC-SHA-256(Kn, chemin)), 43 caractères. */
export async function nomMasque(noms, chemin) {
  return b64u(await subtle.sign('HMAC', noms, enc.encode(cheminCanonique(chemin))));
}

/** IV ‖ chiffré+tag. */
export async function chiffrerFichier(cle, chemin, mime, contenu) {
  const m = enc.encode(mime);
  if (m.length > 255) throw new Error('type MIME trop long');
  const clair = new Uint8Array(1 + m.length + contenu.length);
  clair[0] = m.length;
  clair.set(m, 1);
  clair.set(contenu, 1 + m.length);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(cheminCanonique(chemin)) }, cle, clair));
  const sortie = new Uint8Array(12 + c.length);
  sortie.set(iv);
  sortie.set(c, 12);
  return sortie;
}

/** → { mime, donnees } ; lève si la clé, le chemin ou le contenu ne correspondent pas. */
export async function dechiffrerFichier(cle, chemin, octets) {
  if (octets.length < 12 + 16 + 1) throw new Error('fichier trop court');
  const clair = new Uint8Array(await subtle.decrypt(
    { name: 'AES-GCM', iv: octets.subarray(0, 12), additionalData: enc.encode(cheminCanonique(chemin)) },
    cle,
    octets.subarray(12),
  ));
  const n = clair[0];
  return { mime: dec.decode(clair.subarray(1, 1 + n)), donnees: clair.subarray(1 + n) };
}
