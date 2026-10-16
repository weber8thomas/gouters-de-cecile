// Application du carnet (Vite) : le carnet plein écran, ses liens profonds (#julie) et ses images.
//   npm run dev  → serveur de développement (accessible sur le réseau local : essai au téléphone)
//   vite build   → dist/site (site statique, chemins relatifs)
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../design-system/tokens.css';
import inventaire from '../../design-system/assets.json';
import { setAssetResolver } from '../lib/assets';
import Carnet from '../artboards/Carnet';

// Images cuites : Vite les publie avec le site (nom à empreinte) ; chaque nom logique est résolu vers
// son URL publiée, quelle que soit la cible du manifeste généré.
const publiees = import.meta.glob('../../design-system/baked/**/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const fichiers = inventaire as Record<string, { file: string }>;
setAssetResolver((name, info) => publiees[`../../design-system/${fichiers[name]?.file}`] ?? info.u);

const racine = document.getElementById('carnet');
if (racine) createRoot(racine).render(<Carnet liens />);

// Mise à jour : GitHub Pages laisse le navigateur garder la page 10 min. À l'ouverture et au retour
// sur l'onglet, on demande version.json sans cache ; si une version plus récente est en ligne, on
// recharge une fois (le paramètre ?v= contourne le cache ; le drapeau évite toute boucle).
async function verifierVersion(): Promise<void> {
  if (import.meta.env.DEV) return;
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { version } = (await r.json()) as { version?: string };
    if (!version || version === __GC_VERSION__) return;
    const cle = `gc:maj:${version}`;
    try {
      if (sessionStorage.getItem(cle)) return;
      sessionStorage.setItem(cle, '1');
    } catch {
      /* stockage indisponible : on recharge quand même, une fois par chargement */
    }
    const url = new URL(location.href);
    url.searchParams.set('v', version);
    location.replace(url.toString());
  } catch {
    /* hors ligne : on garde la version en cache */
  }
}
console.info(`Les goûters de Cécile · version ${__GC_VERSION__}`);
verifierVersion();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') verifierVersion();
});
