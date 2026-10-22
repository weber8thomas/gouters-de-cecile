// Quand un objet posé sur une page (note cachée, scorpion) est-il utilisable ? Un observateur partagé, sans horloge :
// rien ne change tout seul pendant la lecture. Page visible, livre ouvert, aucun geste ni loupe en cours.
import { loupeOccupee, LOUPE_EVENT } from '../../lib/loupe';
import { GESTE_EVENT } from '../Livre/evenements';

export type Inscription = { el: HTMLElement; actif: (oui: boolean) => void; table?: boolean; placer?: () => void };
const inscrits = new Set<Inscription>();
let observateur: MutationObserver | null = null;
function verifier() {
  for (const i of inscrits) {
    const feuille = i.el.closest('.gc-livre__page');
    const livre = i.el.closest('.gc-livre') ?? i.el.closest('.gc-ecran')?.querySelector('.gc-livre');
    i.actif(!document.hidden && !loupeOccupee() && (i.table || !!feuille?.classList.contains('gc-livre__page--visible')) === true &&
      livre?.getAttribute('data-gc-etat') === 'ouvert' && !livre.hasAttribute('data-gc-geste'));
    i.placer?.();
  }
}
export function inscrire(i: Inscription): () => void {
  inscrits.add(i);
  if (!observateur) {
    observateur = new MutationObserver(verifier);
    const ecran = i.el.closest('.gc-ecran') ?? i.el.closest('.gc-livre');
    if (ecran) observateur.observe(ecran, { attributes: true, subtree: true, attributeFilter: ['class', 'data-gc-etat', 'data-gc-geste'] });
    document.addEventListener('visibilitychange', verifier);
    document.addEventListener(GESTE_EVENT, verifier);
    window.addEventListener(LOUPE_EVENT, verifier);
    window.addEventListener('resize', verifier);
  }
  verifier();
  return () => {
    inscrits.delete(i);
    if (inscrits.size) return;
    observateur?.disconnect(); observateur = null;
    document.removeEventListener('visibilitychange', verifier);
    document.removeEventListener(GESTE_EVENT, verifier);
    window.removeEventListener(LOUPE_EVENT, verifier);
    window.removeEventListener('resize', verifier);
  };
}

