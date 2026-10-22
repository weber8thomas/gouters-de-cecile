// Service worker de la version partagée : sert le carnet chiffré comme s'il était en clair.
//   requête → nom masqué (HMAC) → fichier chiffré du serveur → déchiffrement → réponse avec le bon Content-Type.
// Sans clé (ou clé invalide), il ne fait rien : le serveur renvoie le chargeur. Les vidéos (Range → 206) se
// découpent dans le clair déchiffré, gardé dans un petit cache mémoire LRU.
import { cheminCanonique, dechiffrerFichier, nomMasque } from '../coeur.mjs';
import { ENTETES_PAGE } from '../entetes.mjs';
import { lireCles, oublierCles } from '../stockage.mjs';

// Fichiers en clair du chargeur : jamais interceptés.
const PUBLICS = new Set(['ouvrir.js', 'sw.js', 'verrou.json', 'favicon.svg', 'police.woff2', 'robots.txt', '404.html']);
const LRU_OCTETS = 96 * 1024 * 1024;
const LRU_ENTREES = 32;
const VIE_CLES_MS = 5000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ---- clés (relues dans IndexedDB, mémoire courte pour ne pas l'interroger à chaque image) ---------------------------
let clesMemoire = null;
let clesLues = 0;
async function cles() {
  if (clesMemoire && Date.now() - clesLues < VIE_CLES_MS) return clesMemoire;
  clesMemoire = await lireCles();
  clesLues = Date.now();
  return clesMemoire;
}
async function oublier() {
  clesMemoire = null;
  lru.clear();
  await oublierCles();
}

// ---- cache LRU du clair déchiffré : nom masqué → { p: Promise<{mime, donnees}>, taille } ------------------------------
const lru = new Map();
function lruPoser(nom, entree) {
  lru.delete(nom);
  lru.set(nom, entree);
  let total = 0;
  for (const e of lru.values()) total += e.taille;
  for (const [n, e] of lru) {
    if (lru.size <= LRU_ENTREES && total <= LRU_OCTETS) break;
    if (n === nom) continue;
    total -= e.taille;
    lru.delete(n);
  }
}
function charger(nom, chemin, k) {
  const connu = lru.get(nom);
  if (connu) { lru.delete(nom); lru.set(nom, connu); return connu.p; }
  const entree = { taille: 0, p: null };
  entree.p = (async () => {
    const r = await fetch(new URL(nom, self.registration.scope), { credentials: 'omit' });
    if (!r.ok) throw Object.assign(new Error('absent'), { statut: 404 });
    const clair = await dechiffrerFichier(k.cle, chemin, new Uint8Array(await r.arrayBuffer())).catch(() => {
      throw Object.assign(new Error('illisible'), { statut: 404, dechiffrement: true });
    });
    entree.taille = clair.donnees.byteLength;
    if (entree.taille > LRU_OCTETS) lru.delete(nom);
    return clair;
  })();
  entree.p.catch(() => { if (lru.get(nom) === entree) lru.delete(nom); });
  lruPoser(nom, entree);
  return entree.p;
}

// ---- réponses ---------------------------------------------------------------------------------------------------------
/** Intervalle d'un en-tête Range : null (réponse complète), { debut, fin } ou 'impossible'. */
function intervalle(range, total) {
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(range ?? '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let debut;
  let fin;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'impossible';
    debut = Math.max(0, total - n);
    fin = total - 1;
  } else {
    debut = Number(m[1]);
    fin = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
  }
  return debut >= total || fin < debut ? 'impossible' : { debut, fin };
}

function reponse(req, { mime, donnees }, navigation) {
  const total = donnees.byteLength;
  const h = new Headers({ 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' });
  if (navigation) for (const [k, v] of Object.entries(ENTETES_PAGE)) h.set(k, v);
  const iv = intervalle(req.headers.get('range'), total);
  if (iv === 'impossible') {
    h.set('Content-Range', `bytes */${total}`);
    return new Response(null, { status: 416, headers: h });
  }
  const corps = req.method === 'HEAD' ? null : undefined;
  if (iv) {
    h.set('Content-Range', `bytes ${iv.debut}-${iv.fin}/${total}`);
    h.set('Content-Length', String(iv.fin - iv.debut + 1));
    return new Response(corps === null ? null : donnees.subarray(iv.debut, iv.fin + 1), { status: 206, headers: h });
  }
  h.set('Content-Length', String(total));
  return new Response(corps === null ? null : donnees, { status: 200, headers: h });
}

const erreur = (statut) => new Response(null, { status: statut, headers: { 'Cache-Control': 'no-store' } });

async function traiter(e) {
  const req = e.request;
  const url = new URL(req.url);
  const base = new URL(self.registration.scope).pathname;
  const chemin = cheminCanonique(decodeURIComponent(url.pathname).slice(base.length));
  const navigation = req.mode === 'navigate';

  if (navigation && url.searchParams.has('oublier')) { await oublier(); return fetch(req); }

  let k = await cles();
  if (!k) return fetch(req); // pas de clé : le serveur répond (chargeur)

  // Mode « session » : à l'ouverture d'un nouvel onglet sans autre onglet du carnet, on oublie la clé.
  if (navigation && !k.persistant && (await self.clients.matchAll({ type: 'window' })).length === 0) {
    await oublier();
    return fetch(req);
  }

  const nom = await nomMasque(k.noms, chemin || 'index.html');
  try {
    if (navigation) {
      if (chemin !== '' && chemin !== 'index.html') return fetch(req); // 404.html du serveur
      return reponse(req, await charger(await nomMasque(k.noms, 'index.html'), 'index.html', k), true);
    }
    return reponse(req, await charger(nom, chemin, k), false);
  } catch (err) {
    if (navigation && err.dechiffrement) { await oublier(); return fetch(req); } // clé révoquée : retour au chargeur
    if (err.statut) return erreur(err.statut);
    return erreur(504); // hors ligne
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if ((req.method !== 'GET' && req.method !== 'HEAD') || new URL(req.url).origin !== self.location.origin) return;
  const base = new URL(self.registration.scope).pathname;
  const chemin = decodeURIComponent(new URL(req.url).pathname).slice(base.length);
  if (PUBLICS.has(chemin)) return;
  e.respondWith(traiter(e).catch(() => erreur(500)));
});
