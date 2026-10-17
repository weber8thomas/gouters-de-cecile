// Loupe du carnet (plan v4, CONTRACT § 13) : un vrai zoom, de 1× à 3×, sur tous les écrans (pincer,
// double toucher, ctrl + molette, + / −, bouton loupe, menu). Elle vit dans <Ecran> (calque
// .gc-ecran__loupe : translate + scale de MotionValues) ; ce module n'en garde que l'état AU REPOS et
// les commandes, pour le livre, les pages cuites (encre ×4) et le menu. Rien n'est mémorisé : la loupe
// revient à 1× au rechargement et à la rotation.
//
// Pendant un geste de loupe, l'état ne change pas (aucun rendu React) : `loupeOccupee()` dit qu'un
// geste est en cours ; l'événement « gc-loupe » (sur window) en marque le début et la fin.
import React from 'react';

export const LOUPE_MIN = 1;
export const LOUPE_MAX = 3;
/** Paliers de + / − et du bouton loupe. */
export const LOUPE_PALIERS = [1, 1.5, 2, 3] as const;
/** Au-delà, les pages cuites chargent l'encre ×4 (tuiles) de la page visible. */
export const LOUPE_HD = 1.5;
/** En deçà, les tuiles d'encre ×4 sont retirées (hystérésis avec LOUPE_HD). */
export const LOUPE_HD_SORTIE = 1.25;
/** Facteur du double toucher et du bouton loupe. */
export const LOUPE_DOUBLE = 2;
/** En deçà, on considère le livre comme non zoomé (le glisser tourne les pages). */
export const LOUPE_ZOOME = 1.02;

export const LOUPE_EVENT = 'gc-loupe';
export interface LoupeDetail {
  phase: 'debut' | 'fin';
}

export interface RectLoupe {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EtatLoupe {
  /** Facteur au repos (1 à 3). */
  z: number;
  /** z > LOUPE_ZOOME : le glisser déplace la vue au lieu de tourner les pages. */
  zoome: boolean;
  /** z ≥ LOUPE_HD : encre ×4 pour la page visible. */
  hd: boolean;
  /** Page vue quand on est zoomé : la page affichée (cadrage « page »), celle du centre (« double ») ; null à 1×. */
  cote: 'gauche' | 'droite' | null;
  /** Rectangle du contenu du livre (px d'écran, à z = 1), publié par le livre au repos. */
  contenu: RectLoupe | null;
}

const ETAT_INITIAL: EtatLoupe = { z: 1, zoome: false, hd: false, cote: null, contenu: null };
let etat: EtatLoupe = ETAT_INITIAL;
let occupee = false;
const abonnes = new Set<() => void>();

export const getLoupe = (): EtatLoupe => etat;
/** Un geste de loupe est en cours (pincer, déplacer, ressort) : ne pas rendre React. */
export const loupeOccupee = (): boolean => occupee;

export function abonnerLoupe(f: () => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

export function useLoupe(): EtatLoupe {
  return React.useSyncExternalStore(abonnerLoupe, getLoupe, getLoupe);
}

/** Met à jour l'état au repos (contrôleur de loupe et livre seulement). */
export function majLoupe(partiel: Partial<EtatLoupe>): void {
  const suivant = { ...etat, ...partiel };
  suivant.zoome = suivant.z > LOUPE_ZOOME;
  suivant.hd = suivant.z >= LOUPE_HD;
  if (!suivant.zoome) suivant.cote = null;
  if (
    suivant.z === etat.z &&
    suivant.cote === etat.cote &&
    suivant.contenu?.x === etat.contenu?.x &&
    suivant.contenu?.y === etat.contenu?.y &&
    suivant.contenu?.w === etat.contenu?.w &&
    suivant.contenu?.h === etat.contenu?.h
  )
    return;
  etat = suivant;
  abonnes.forEach((f) => f());
}

/** Début / fin d'un geste de loupe (contrôleur seulement) : prévient le livre et les pages. */
export function signalerGesteLoupe(phase: LoupeDetail['phase']): void {
  occupee = phase === 'debut';
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<LoupeDetail>(LOUPE_EVENT, { detail: { phase } }));
}

// ---- Commandes : exécutées par le contrôleur branché dans <Ecran> (sans contrôleur : sans effet) ----

export interface ControleurLoupe {
  /** Va au facteur z (borné), autour du foyer (px d'écran ; défaut : centre de la vue). */
  demander(z: number, foyer?: { x: number; y: number }): void;
  /** Recadre la vue zoomée sur le haut de la page visible (après un tourne-page à la loupe). */
  ancrer(ou: 'haut'): void;
  /** Facteur visé : celui de l'animation en cours, sinon le facteur affiché. */
  vise?(): number;
}

let controleur: ControleurLoupe | null = null;

/** Branche le contrôleur (un seul à la fois). Renvoie la fonction pour le débrancher. */
export function brancherLoupe(c: ControleurLoupe): () => void {
  controleur = c;
  return () => {
    if (controleur === c) controleur = null;
  };
}

export function demanderLoupe(z: number, foyer?: { x: number; y: number }): void {
  controleur?.demander(Math.min(LOUPE_MAX, Math.max(LOUPE_MIN, z)), foyer);
}

export function ancrerLoupe(ou: 'haut'): void {
  controleur?.ancrer(ou);
}

/** Facteur visé (animation en cours comprise) : base des paliers + / − pressés coup sur coup. */
export function loupeVisee(): number {
  return controleur?.vise?.() ?? etat.z;
}

/** Le livre publie, au repos, le rectangle de son contenu et la page visible (bornes du déplacement). */
export function publierContenuLoupe(rect: RectLoupe | null, cote: EtatLoupe['cote'] = etat.cote): void {
  majLoupe({ contenu: rect, cote });
}

/** Palier suivant (+1) ou précédent (−1) à partir de z. */
export function palierVoisin(z: number, sens: 1 | -1): number {
  const p = LOUPE_PALIERS as readonly number[];
  if (sens > 0) return p.find((v) => v > z + 0.01) ?? LOUPE_MAX;
  return [...p].reverse().find((v) => v < z - 0.01) ?? LOUPE_MIN;
}
