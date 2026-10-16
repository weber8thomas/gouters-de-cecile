// Liens profonds du carnet : « #julie » ouvre la double page de Julie (le QR de la version papier
// pointe là). L'URL suit la page affichée par history.replaceState, sans empiler l'historique.
import React from 'react';
import type { SpreadSpec } from '../../lib/spread';

/** Index de la double page nommée par un lien (#<id>, ou #<invité> pour un id « p04-julie »), −1 sinon. */
export function indexDuLien(spreads: SpreadSpec[], hash: string): number {
  let id = hash.replace(/^#/, '');
  try { id = decodeURIComponent(id); } catch { /* lien mal encodé : tel quel */ }
  id = id.trim().toLowerCase();
  if (!id) return -1;
  const exact = spreads.findIndex((s) => s.id.toLowerCase() === id);
  if (exact >= 0) return exact;
  return spreads.findIndex((s) => s.id.toLowerCase().endsWith(`-${id}`));
}

/** Fragment d'URL de la double page i (vide : couverture). */
export const lienDe = (spreads: SpreadSpec[], i: number): string => (i >= 0 && spreads[i] ? `#${encodeURIComponent(spreads[i].id)}` : '');

/**
 * Tient l'URL et la double page affichée d'accord : l'URL suit la page (replaceState) ; un nouveau lien
 * (fragment modifié, QR scanné sur un carnet déjà ouvert) y mène.
 */
export function useLienProfond(actif: boolean, spreads: SpreadSpec[], index: number, setIndex: (i: number) => void): void {
  React.useEffect(() => {
    if (!actif || typeof location === 'undefined') return;
    const voulu = lienDe(spreads, index);
    if (location.hash === voulu || (!voulu && !location.hash)) return;
    try {
      history.replaceState(history.state, '', `${location.pathname}${location.search}${voulu}`);
    } catch { /* document sans historique (aperçu) */ }
  }, [actif, spreads, index]);

  React.useEffect(() => {
    if (!actif) return;
    const onHash = () => setIndex(indexDuLien(spreads, location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [actif, spreads, setIndex]);
}
