// Réglages de la personne qui regarde le carnet (menu ⚙) : un petit magasin de module, sans provider,
// lu par useSyncExternalStore. Mémorisé dans le navigateur (clé gc:reglages:v1), relu champ par champ :
// une valeur abîmée ou inconnue retombe sur sa valeur par défaut. Le cran et le zoom restent dans la
// caméra (src/lib/camera.tsx, clé gc:camera:v1).
import React from 'react';

export type Vitesse = 'vive' | 'normale' | 'lente';
export const VITESSES: Vitesse[] = ['vive', 'normale', 'lente'];

export interface Reglages {
  v: 1;
  /** Son des vidéos. */
  son: boolean;
  /** Volume des vidéos, 0 à 1 (sans effet là où il est en lecture seule, comme sur iPhone). */
  volume: number;
  /** Lancer la vidéo en arrivant sur la double page d'un invité. */
  lectureAuto: boolean;
  /** Vitesse des pages qui tournent (ressort « paper »). */
  vitesse: Vitesse;
  /** Moins d'animations (en plus de la préférence du système). */
  mouvementReduit: boolean;
  /**
   * Sons du livre (pages, couverture, feuillet, photo), distincts du son des vidéos.
   * null = automatique : coupés sur téléphone, actifs ailleurs (voir sonsLivreEffectif, src/lib/son.ts).
   */
  sonsLivre: boolean | null;
  /**
   * Ambiance sonore : le feu de cheminée et de rares bruits de cuisine (src/lib/ambiance.ts).
   * null = automatique : active sur TV et ordinateur, coupée sur téléphone (voir ambianceEffective).
   */
  ambiance: boolean | null;
  /** La lumière du feu vacille (lot L, src/lib/feu.ts) ; false : lumière chaude mais immobile. */
  feu: boolean;
}

export const REGLAGES_DEFAUT: Reglages = {
  v: 1,
  son: true,
  volume: 1,
  lectureAuto: false,
  vitesse: 'normale',
  mouvementReduit: false,
  sonsLivre: null,
  ambiance: null,
  feu: true,
};
const CLE = 'gc:reglages:v1';

function valider(x: unknown): Reglages {
  const r = { ...REGLAGES_DEFAUT };
  if (!x || typeof x !== 'object') return r;
  const o = x as Record<string, unknown>;
  if (typeof o.son === 'boolean') r.son = o.son;
  if (typeof o.volume === 'number' && Number.isFinite(o.volume)) r.volume = Math.min(1, Math.max(0, o.volume));
  if (typeof o.lectureAuto === 'boolean') r.lectureAuto = o.lectureAuto;
  if (typeof o.vitesse === 'string' && (VITESSES as string[]).includes(o.vitesse)) r.vitesse = o.vitesse as Vitesse;
  if (typeof o.mouvementReduit === 'boolean') r.mouvementReduit = o.mouvementReduit;
  if (typeof o.sonsLivre === 'boolean' || o.sonsLivre === null) r.sonsLivre = o.sonsLivre;
  if (typeof o.ambiance === 'boolean' || o.ambiance === null) r.ambiance = o.ambiance;
  if (typeof o.feu === 'boolean') r.feu = o.feu;
  return r;
}

function charger(): Reglages {
  try {
    const brut = typeof localStorage !== 'undefined' ? localStorage.getItem(CLE) : null;
    return brut ? valider(JSON.parse(brut)) : { ...REGLAGES_DEFAUT };
  } catch {
    return { ...REGLAGES_DEFAUT };
  }
}

let etat: Reglages = charger();
const abonnes = new Set<() => void>();

export const getReglages = (): Reglages => etat;

/** Change un ou plusieurs réglages (objet partiel ou fonction), mémorise et prévient les abonnés. */
export function setReglages(maj: Partial<Reglages> | ((r: Reglages) => Partial<Reglages>)): void {
  const partiel = typeof maj === 'function' ? maj(etat) : maj;
  const suivant = valider({ ...etat, ...partiel });
  if (JSON.stringify(suivant) === JSON.stringify(etat)) return;
  etat = suivant;
  try {
    localStorage.setItem(CLE, JSON.stringify(etat));
  } catch {
    /* stockage indisponible (aperçu, navigation privée) : le réglage reste en mémoire */
  }
  abonnes.forEach((f) => f());
}

export const resetReglages = (): void => setReglages({ ...REGLAGES_DEFAUT });

/** S'abonne aux changements (hors React). Renvoie la fonction de désabonnement. */
export function abonnerReglages(f: () => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** Les réglages courants, et la fonction pour les changer. */
export function useReglages(): [Reglages, typeof setReglages] {
  const r = React.useSyncExternalStore(abonnerReglages, getReglages, getReglages);
  return [r, setReglages];
}
