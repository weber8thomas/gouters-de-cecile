// Chargeur de la version partagée : demande la phrase de passe (ou lit #cle=… dans l'adresse), ouvre le verrou,
// range la clé dans IndexedDB (non extractable), puis recharge la page : le service worker sert alors le carnet.
import { deB64u, importerCles, nomMasque, dechiffrerFichier, ouvrirVerrou } from '../coeur.mjs';
import { oublierCles, rangerCles } from '../stockage.mjs';

const $ = (id) => document.getElementById(id);
const message = (texte, ok = false) => { const m = $('message'); m.textContent = texte; m.className = ok ? 'ok' : ''; };

/** La clé ouvre-t-elle vraiment ce déploiement ? On déchiffre la page du carnet (quelques Ko). */
async function verifier({ cle, noms }) {
  const r = await fetch(`./${await nomMasque(noms, 'index.html')}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('carnet introuvable');
  await dechiffrerFichier(cle, 'index.html', new Uint8Array(await r.arrayBuffer()));
}

async function attendreServiceWorker() {
  const attente = new Promise((_, ko) => setTimeout(() => ko(new Error('service worker')), 15000));
  await Promise.race([navigator.serviceWorker.ready, attente]);
}

async function ouvrirAvec(k, persistant) {
  const cles = await importerCles(k);
  await verifier(cles);
  await rangerCles({ ...cles, persistant });
  await attendreServiceWorker();
  location.reload(); // le fragment (#julie…) reste ; le service worker sert maintenant le carnet
}

function pris(erreur) {
  console.error(erreur);
  message(erreur.message === 'service worker'
    ? 'Ce navigateur ne peut pas démarrer le carnet (navigation privée ?). Essaie une fenêtre normale.'
    : 'Le carnet est introuvable ou a changé. Redemande le lien ou la phrase de passe.');
}

async function demarrer() {
  if (!window.isSecureContext || !globalThis.crypto?.subtle || !('serviceWorker' in navigator) || !window.indexedDB) {
    $('forme').hidden = true;
    message('Ce navigateur est trop ancien (ou la connexion n\'est pas sécurisée) pour ouvrir le carnet.');
    return;
  }
  const params = new URLSearchParams(location.search);
  if (params.has('oublier')) {
    await oublierCles();
    history.replaceState(null, '', location.pathname);
    message('Carnet oublié sur cet appareil.', true);
  }
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => message('Le service worker n\'a pas pu démarrer.'));

  // Lien secret : la clé est dans le fragment, qui ne part jamais au serveur. On l'efface tout de suite de l'adresse.
  const lien = /^#cle=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (lien) {
    history.replaceState(null, '', location.pathname + location.search);
    $('forme').hidden = true;
    message('Ouverture…', true);
    try { await ouvrirAvec(deB64u(lien[1]), true); } catch (e) { $('forme').hidden = false; pris(e); }
    return;
  }

  $('voir').addEventListener('click', () => {
    const champ = $('mdp');
    const visible = champ.type === 'password';
    champ.type = visible ? 'text' : 'password';
    $('voir').textContent = visible ? 'cacher' : 'voir';
    $('voir').setAttribute('aria-pressed', String(visible));
  });
  $('forme').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const mdp = $('mdp').value;
    if (!mdp.trim()) return;
    $('ouvrir').disabled = true;
    message('Ouverture…', true);
    try {
      const verrou = await (await fetch('./verrou.json', { cache: 'no-store' })).json();
      let k;
      try { k = await ouvrirVerrou(verrou, mdp); } catch { message('Ce n\'est pas la bonne phrase de passe.'); $('mdp').select(); return; }
      await ouvrirAvec(k, $('souvenir').checked);
    } catch (e) {
      pris(e);
    } finally {
      $('ouvrir').disabled = false;
    }
  });
  $('mdp').focus();
}
demarrer();
