// Sons du livre (plan v4, CONTRACT § 13) : pages, couverture, feuillet, photo. Distincts du son des
// vidéos ; réglage « Sons du livre » (reglages.sonsLivre, null = automatique : coupés sur téléphone).
// Web Audio, déverrouillé dans le premier geste ; ne lève jamais d'erreur. Banque de sons :
// design-system/baked/sons (scripts/bake-sons.mjs, sources CC0 dans design-system/sources/sons).
import type { Reglages } from './reglages';

export type NomSon =
  | 'page'
  | 'riffle'
  | 'couverture-ouvrir'
  | 'couverture-poser'
  | 'couverture-fermer'
  | 'feuillet'
  | 'photo-lever'
  | 'photo-poser'
  | 'coin';

export interface OptionsSon {
  /** Vitesse du geste, 0 (lent) à 1 (vif) : règle le débit et le gain. */
  vitesse?: number;
  /** Gain supplémentaire (multiplié par le volume des réglages). */
  gain?: number;
  /** Délai avant de jouer, en secondes. */
  delai?: number;
}

/** Sons du livre actifs pour ces réglages (automatique : coupés sur un téléphone). */
export function sonsLivreEffectif(r: Pick<Reglages, 'sonsLivre'>): boolean {
  if (r.sonsLivre !== null) return r.sonsLivre;
  if (typeof window === 'undefined' || typeof matchMedia === 'undefined') return true;
  const telephone = matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 600;
  return !telephone;
}

type Lecteur = (nom: NomSon, o?: OptionsSon) => void;
let lecteur: Lecteur | null = null;

/** Branche le moteur audio (lot S). Sans moteur, jouerSon ne fait rien. */
export function brancherSons(l: Lecteur): () => void {
  lecteur = l;
  return () => {
    if (lecteur === l) lecteur = null;
  };
}

/** Joue un son du livre (variante au hasard). Silencieux si coupé, non chargé ou indisponible. */
export function jouerSon(nom: NomSon, o?: OptionsSon): void {
  try {
    lecteur?.(nom, o);
  } catch {
    /* jamais d'erreur pour un son */
  }
}
