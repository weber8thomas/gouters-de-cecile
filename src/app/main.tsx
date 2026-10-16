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
