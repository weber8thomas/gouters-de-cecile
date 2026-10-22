// Secret de la version partagée : prive/partage/secret.json (ignoré par git, jamais copié ailleurs).
//   { v, motDePasse, cle (K en base64url), verrou: {v, sel, iterations, cleEnveloppee, iv}, cree }
// Le verrou est calculé une fois : un rebuild garde le même mot de passe, la même clé et le même verrou.json.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVE } from '../lib/prive.mjs';
import { b64u, envelopper, nouvelleCle } from './coeur.mjs';

export const DOSSIER_SECRET = join(PRIVE, 'partage');
export const FICHIER_SECRET = join(DOSSIER_SECRET, 'secret.json');
export const NB_MOTS = 5;

export const lireMots = () => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mots.txt'), 'utf8').split('\n').map((m) => m.trim()).filter(Boolean);

/** Phrase de passe de NB_MOTS mots tirés au hasard (crypto.randomInt, sans biais). */
export function phraseDePasse(mots = lireMots(), n = NB_MOTS) {
  return Array.from({ length: n }, () => mots[randomInt(mots.length)]).join(' ');
}
export const entropieBits = (mots = lireMots(), n = NB_MOTS) => n * Math.log2(mots.length);

export const lireSecret = () => (existsSync(FICHIER_SECRET) ? JSON.parse(readFileSync(FICHIER_SECRET, 'utf8')) : null);

export async function creerSecret({ motDePasse = phraseDePasse() } = {}) {
  const k = nouvelleCle();
  const secret = { v: 1, motDePasse, cle: b64u(k), verrou: await envelopper(k, motDePasse), cree: new Date().toISOString() };
  mkdirSync(DOSSIER_SECRET, { recursive: true });
  writeFileSync(FICHIER_SECRET, JSON.stringify(secret, null, 2) + '\n', { mode: 0o600 });
  chmodSync(FICHIER_SECRET, 0o600);
  return secret;
}

/** Adresse de la version partagée : PARTAGE_URL, sinon https://<PARTAGE_PROJET>.pages.dev. */
export const PROJET_DEFAUT = 'gouters-de-cecile';
export function adressePartage() {
  if (process.env.PARTAGE_URL) return process.env.PARTAGE_URL.replace(/\/+$/, '');
  return `https://${process.env.PARTAGE_PROJET || PROJET_DEFAUT}.pages.dev`;
}
export const lienSecret = (secret) => `${adressePartage()}/#cle=${secret.cle}`;
