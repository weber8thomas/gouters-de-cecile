// Doubles pages de la démo du carnet, partagées par la carte DemoCarnet (TV), l'application (Carnet),
// la carte Formats et la carte de la page cuite (AvantApres) : la double page de Julie, puis trois
// doubles pages écrites par d'autres invités, chacun de sa main. Toutes sur la table en bois.
//
// Chaque page est une PAGE CUITE (<PageCuite>, scripts/bake-pages.mjs) : vrai papier ancien scanné +
// écriture générée trait par trait, l'encre cuite dans le papier.
//
// Provisoire (plan v3) : la page gauche de Julie est sa page cuite seule ; la photo-vidéo collée
// (PhotoCollee, dans la zone que la page réserve) sera branchée par l'intégration.
import React from 'react';
import { PageCuite } from '../../components/PageCuite';
import type { SpreadSpec } from '../../lib/spread';
import './DemoCarnet.css';

/** Étiquette collée sur le plat de couverture. */
export const COUVERTURE = (
  <div className="gc-demo-couverture">
    <p className="gc-hand-caption gc-demo-couverture__sur">carnet de recettes</p>
    <p className="gc-recipe-title gc-demo-couverture__titre">Les goûters</p>
    <p className="gc-section-label gc-demo-couverture__de">de Cécile</p>
  </div>
);

/** Page de gauche de Julie, cuite. */
export function JulieGaucheCuite() {
  return <PageCuite page="julie-gauche" />;
}

/** Page de droite de Julie, cuite : recette, petit mot, signature, annotation de Cécile. */
export function JulieDroiteCuite() {
  return <PageCuite page="julie-droite" />;
}

// ---- Les doubles pages ----------------------------------------------------------------------

export const JULIE: SpreadSpec = {
  id: 'julie', kind: 'video', folios: [12, 13], seed: 4127,
  render: () => ({ left: <JulieGaucheCuite />, right: <JulieDroiteCuite /> }),
};

const ROSE: SpreadSpec = {
  id: 'rose', kind: 'recette', folios: [14, 15], seed: 811,
  render: () => ({ left: <PageCuite page="rose-gauche" />, right: <PageCuite page="rose-droite" /> }),
};

const MATHIS: SpreadSpec = {
  id: 'mathis', kind: 'deux-recettes', folios: [16, 17], seed: 905,
  render: () => ({ left: <PageCuite page="mathis-gauche" />, right: <PageCuite page="mathis-droite" /> }),
};

const FIN: SpreadSpec = {
  id: 'fin', kind: 'finale', folios: [18, 19], seed: 1201,
  render: () => ({ left: <PageCuite page="fin-gauche" />, right: <PageCuite page="fin-droite" /> }),
};

/** Les doubles pages de la démo, dans l'ordre (liste stable : mêmes objets à chaque rendu). */
export const SPREADS_DEMO: SpreadSpec[] = [JULIE, ROSE, MATHIS, FIN];
