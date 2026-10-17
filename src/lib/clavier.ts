// Clavier « modal » : quand un menu ou un objet soulevé est ouvert, il reçoit les touches et le livre
// et la caméra (qui écoutent window en phase de bulle) n'en voient plus aucune.
//   - window, phase de capture : le gestionnaire du dessus de la pile reçoit chaque keydown ; s'il
//     renvoie true, la touche est consommée (preventDefault + arrêt de la propagation) ;
//   - document, phase de bulle : sinon, la touche va normalement à sa cible (boutons du menu, React),
//     puis est arrêtée avant d'atteindre les écouteurs de window.
import React from 'react';

export type GestionnaireClavier = (e: KeyboardEvent) => boolean | void;

const pile: { id: number; gerer: React.MutableRefObject<GestionnaireClavier> }[] = [];
let installe = false;
let suivant = 0;

function installer() {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  window.addEventListener('keydown', (e) => {
    const haut = pile[pile.length - 1];
    if (!haut) return;
    if (haut.gerer.current(e) === true) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (pile.length) e.stopPropagation();
  });
}

/** true si un menu ou un objet soulevé tient le clavier. */
export const clavierModalActif = (): boolean => pile.length > 0;

/** Tant que `actif`, `gerer` reçoit toutes les touches avant le reste de l'application. */
export function useClavierModal(actif: boolean, gerer: GestionnaireClavier): void {
  const ref = React.useRef(gerer);
  ref.current = gerer;
  React.useEffect(() => {
    if (!actif) return;
    installer();
    const entree = { id: ++suivant, gerer: ref };
    pile.push(entree);
    return () => {
      const i = pile.findIndex((p) => p.id === entree.id);
      if (i >= 0) pile.splice(i, 1);
    };
  }, [actif]);
}
