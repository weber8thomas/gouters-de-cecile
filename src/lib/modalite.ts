// Modalité d'entrée (plan v4, CONTRACT § 13.4) : comment la personne touche le carnet, pour lui parler
// avec les bons mots (« touchez / cliquez / appuyez sur Entrée pour ouvrir », étiquettes cuites du
// lot C) :
//   'toucher' : doigt ou stylet (pointerdown tactile) ;
//   'cliquer' : souris ;
//   'entree'  : clavier ou télécommande (keydown d'une touche, hors raccourcis et modificateurs seuls).
// Valeur de départ, avant toute entrée : (pointer: coarse) → 'toucher', (pointer: fine) → 'cliquer',
// aucun pointeur (TV et sa télécommande) → 'entree'. Puis la dernière entrée l'emporte. Un petit magasin
// de module (useSyncExternalStore) : un rendu seulement quand la modalité change.
import React from 'react';

export type Modalite = 'toucher' | 'cliquer' | 'entree';

function depart(): Modalite {
  if (typeof matchMedia === 'undefined') return 'cliquer';
  if (matchMedia('(pointer: coarse)').matches) return 'toucher';
  if (matchMedia('(pointer: fine)').matches) return 'cliquer';
  return 'entree';
}

let etat: Modalite | null = null;
const abonnes = new Set<() => void>();
const MODIFICATEURS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn', 'OS']);

function changer(m: Modalite): void {
  if (m === etat) return;
  etat = m;
  abonnes.forEach((f) => f());
}

let installe = false;
function installer(): void {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') changer('toucher');
    else if (e.pointerType === 'mouse') changer('cliquer');
  }, { capture: true, passive: true });
  window.addEventListener('keydown', (e) => {
    if (MODIFICATEURS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    changer('entree');
  }, { capture: true, passive: true });
}

export function getModalite(): Modalite {
  installer();
  if (etat === null) etat = depart();
  return etat;
}

export function abonnerModalite(f: () => void): () => void {
  installer();
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** 'toucher' | 'cliquer' | 'entree' : la dernière façon d'entrer de la personne. */
export function useModalite(): Modalite {
  return React.useSyncExternalStore(abonnerModalite, getModalite, () => 'cliquer');
}
