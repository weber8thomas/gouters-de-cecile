// Clé de contenu rangée dans IndexedDB, partagée entre le chargeur (page) et le service worker.
// Un CryptoKey non extractable se stocke tel quel : le JavaScript de la page ne peut pas relire K.
//   enregistrement : { cle, noms, persistant, le }
//   persistant = false (« session ») : le service worker oublie la clé quand plus aucun onglet du carnet n'est ouvert.
const BASE = 'gc-verrou';
const MAGASIN = 'cles';
const ENTREE = 'carnet';

function ouvrir() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function transaction(mode, action) {
  const bd = await ouvrir();
  try {
    return await new Promise((ok, ko) => {
      const t = bd.transaction(MAGASIN, mode);
      const req = action(t.objectStore(MAGASIN));
      t.oncomplete = () => ok(req.result);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    });
  } finally {
    bd.close();
  }
}

export const lireCles = () => transaction('readonly', (s) => s.get(ENTREE)).then((v) => v ?? null, () => null);
export const rangerCles = (enregistrement) => transaction('readwrite', (s) => s.put({ ...enregistrement, le: Date.now() }, ENTREE));
export const oublierCles = () => transaction('readwrite', (s) => s.delete(ENTREE)).catch(() => undefined);
