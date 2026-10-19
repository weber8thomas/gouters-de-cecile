// Boutons qui s'effacent (CONTRACT § 11) : les contrôles à l'écran (barre du haut, engrenage, flèches,
// points de page) s'effacent d'eux-mêmes après 3 s sans activité et reviennent dès que la souris bouge,
// qu'on touche l'écran, qu'on appuie sur une touche, qu'on tourne la molette ou qu'un contrôle prend le
// focus. Un réglage les garde toujours visibles (reglages.boutonsToujoursVisibles). Le carnet n'a aucune
// règle :hover : ce petit magasin de module (useSyncExternalStore) remplace le survol, et l'Ecran pose
// data-gc-controles="caches" sur sa racine (le fondu est en CSS, opacité seulement : Ecran.css).
//
// Ils ne s'effacent jamais tant que : la fiche Réglages ou un objet soulevé tient le clavier modal, la
// loupe est zoomée ou en geste, un doigt est posé, ou le focus est au clavier dans un contrôle (le focus
// laissé par un clic à la souris, lui, n'empêche rien : :focus-visible). Les contrôles ne sont ni
// display:none, ni visibility:hidden, ni inert : Tab les atteint toujours (et les réaffiche).
//
// Au doigt (ou au stylet), un contrôle effacé ne s'active pas : le premier toucher à sa place ne fait que
// rappeler les boutons (le clic qui suit est avalé). Un toucher ailleurs fait son action et les rappelle.
// Les contrôles concernés portent data-gc-effacable.
import React from 'react';
import { clavierModalActif } from './clavier';
import { getLoupe, loupeOccupee } from './loupe';
import { abonnerReglages, getReglages } from './reglages';

/** Sans activité depuis ce délai, les boutons s'effacent. */
export const CONTROLES_DELAI_MS = 3000;
/** Attribut des contrôles qui s'effacent (barre, engrenage, flèches, points) : fondu en CSS, toucher ici. */
export const SEL_EFFACABLE = '[data-gc-effacable]';
/** Un doigt posé sans « fin » au-delà de ce délai est tenu pour levé. */
const APPUI_MAX_MS = 20000;
/** Le clic qui suit un toucher « de rappel » doit venir dans ce délai pour être avalé. */
const AVALE_MS = 1500;

/** État brut : vrai par défaut (seul le survol de la zone dédiée ou le réglage « toujours visibles » affiche les boutons). */
let efface = true;
let derniere = 0;
let minuterie: ReturnType<typeof setTimeout> | null = null;
let installe = false;
let avaleDepuis = -1e9;
const pointeurs = new Map<number, number>();
const abonnes = new Set<() => void>();

const toujours = (): boolean => getReglages().boutonsToujoursVisibles;
const surEffacable = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest(SEL_EFFACABLE);
/** L'élément est un contrôle actuellement effacé à l'écran (l'attribut de l'Ecran dit vrai : un écran simulé n'a rien d'effacé). */
const surEfface = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest(`[data-gc-controles="caches"] ${SEL_EFFACABLE}`);

/** true si les contrôles sont effacés à l'écran. */
export const getControlesCaches = (): boolean => efface && !toujours();

export function abonnerControles(f: () => void): () => void {
  installer();
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** true quand les boutons sont effacés (data-gc-controles="caches" sur l'Ecran). */
export function useControlesCaches(): boolean {
  return React.useSyncExternalStore(abonnerControles, getControlesCaches, () => false);
}

function changer(e: boolean): void {
  if (e === efface) return;
  efface = e;
  abonnes.forEach((f) => f());
}

/** Le focus est au clavier dans un contrôle (le focus d'un clic à la souris ne compte pas). */
function focusAuClavier(): boolean {
  const a = document.activeElement;
  if (!surEffacable(a)) return false;
  try { return (a as Element).matches(':focus-visible'); } catch { return true; }
}

function bloque(): boolean {
  const t = performance.now();
  pointeurs.forEach((t0, k) => { if (t - t0 > APPUI_MAX_MS) pointeurs.delete(k); });
  if (pointeurs.size) return true;
  if (clavierModalActif()) return true;
  if (getLoupe().zoome || loupeOccupee()) return true;
  return focusAuClavier();
}

function echeance(): void {
  minuterie = null;
  if (toujours()) return;
  const reste = CONTROLES_DELAI_MS - (performance.now() - derniere);
  if (reste > 30) return planifier();
  if (bloque()) {
    derniere = performance.now();
    return planifier();
  }
  changer(true);
}

function planifier(): void {
  if (minuterie) return;
  minuterie = setTimeout(echeance, Math.max(0, CONTROLES_DELAI_MS - (performance.now() - derniere)));
}

/** Rappelle les boutons et relance le compte à rebours. */
export function reveillerControles(): void {
  derniere = performance.now();
  changer(false);
  planifier();
}

function installer(): void {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  const opt = { capture: true, passive: true } as const;
  // Sur écran tactile uniquement, toucher la zone d'un contrôle effacé le révèle.
  // À la souris ou au clavier (flèches), seul le survol (:hover) de la zone dédiée révèle ce contrôle.
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (surEffacable(e.target)) {
      pointeurs.set(e.pointerId, performance.now());
      if (surEfface(e.target)) avaleDepuis = performance.now();
      reveillerControles();
    }
  }, opt);
  const relache = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    if (pointeurs.delete(e.pointerId)) reveillerControles();
  };
  window.addEventListener('pointerup', relache, opt);
  window.addEventListener('pointercancel', relache, opt);
  // Le clic qui suit le toucher de rappel n'appartient pas au bouton : il ne l'active pas.
  window.addEventListener('click', (e) => {
    if (performance.now() - avaleDepuis > AVALE_MS) return;
    avaleDepuis = -1e9;
    if (!surEffacable(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  // Passer de « s'effacent » à « toujours visibles » met à jour l'affichage.
  let avant = toujours();
  abonnerReglages(() => {
    const t = toujours();
    if (t !== avant) {
      avant = t;
      if (t) reveillerControles();
      else changer(true);
    }
    abonnes.forEach((f) => f());
  });
}
