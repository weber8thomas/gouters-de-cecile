// Réglages de la personne qui regarde le carnet (menu ⚙) : un petit magasin de module, sans provider,
// lu par useSyncExternalStore. Mémorisé dans le navigateur (clé gc:reglages:v3), relu champ par champ :
// une valeur abîmée ou inconnue retombe sur sa valeur par défaut. Le cran et le zoom restent dans la
// caméra (src/lib/camera.tsx, clé gc:camera:v1).
// Clé v3 : la musique est coupée par défaut (musiqueActive, absent de la clé v2 : coupée). Les réglages
// v2 sont repris tels quels, sauf la musique ; la clé v2 sert de repli, puis la v1 (son « automatique »
// ramené au défaut, comme avant).
import React from 'react';
import banqueMusique from '../../design-system/baked/musique/banque.json';

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
   * Défaut : actifs, téléphone compris. null = automatique : coupés sur téléphone, actifs ailleurs
   * (voir sonsLivreEffectif, src/lib/son.ts).
   */
  sonsLivre: boolean | null;
  /**
   * Ambiance sonore : le feu de cheminée et de rares bruits de cuisine (src/lib/ambiance.ts).
   * Défaut : active, téléphone compris. null = automatique : active sur TV et ordinateur, coupée sur
   * téléphone (voir ambianceEffective).
   */
  ambiance: boolean | null;
  /** La lumière du feu vacille (lot L, src/lib/feu.ts) ; false : lumière chaude mais immobile. */
  feu: boolean;
  /**
   * Tous les sons coupés d'un coup (bouton haut-parleur, src/components/Haut-parleur) : sons du livre
   * et ambiance à 0 (src/lib/son.ts, src/lib/ambiance.ts). La lumière du feu, elle, continue.
   */
  muet: boolean;
  /**
   * Morceau de musique de fond (src/lib/musique.ts) : l'identifiant d'un morceau de la banque
   * (design-system/baked/musique/banque.json), ou « aucune » (le bouton musique joue alors le premier).
   * Défaut : le premier morceau, qui ne joue pas tant que musiqueActive est faux.
   */
  musique: string;
  /**
   * La musique joue (bouton musique, src/components/Haut-parleur/BoutonMusique.tsx). Défaut : coupée.
   * Éteindre le bouton garde le morceau choisi ; le rallumer le reprend.
   */
  musiqueActive: boolean;
}

/** Identifiants des morceaux de musique de fond (la banque cuite par scripts/bake-musique.mjs). */
export const MUSIQUES_IDS: readonly string[] = (banqueMusique as { morceaux: { id: string }[] }).morceaux.map((m) => m.id);

export const REGLAGES_DEFAUT: Reglages = {
  v: 1,
  son: true,
  volume: 1,
  lectureAuto: false,
  vitesse: 'normale',
  mouvementReduit: false,
  sonsLivre: true,
  ambiance: true,
  feu: true,
  muet: false,
  musique: MUSIQUES_IDS[0] ?? 'aucune',
  musiqueActive: false,
};
const CLE = 'gc:reglages:v3';
const CLE_V2 = 'gc:reglages:v2';
const CLE_V1 = 'gc:reglages:v1';

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
  if (typeof o.muet === 'boolean') r.muet = o.muet;
  if (typeof o.musique === 'string' && (o.musique === 'aucune' || MUSIQUES_IDS.includes(o.musique))) r.musique = o.musique;
  if (typeof o.musiqueActive === 'boolean') r.musiqueActive = o.musiqueActive;
  // « aucune » ne joue pas : le bouton musique repart du premier morceau.
  if (r.musique === 'aucune') r.musiqueActive = false;
  return r;
}

function charger(): Reglages {
  try {
    const lire = (cle: string): string | null => (typeof localStorage !== 'undefined' ? localStorage.getItem(cle) : null);
    const brut = lire(CLE);
    if (brut) return valider(JSON.parse(brut));
    // Première visite de cette version : on reprend la clé v2 (sans musiqueActive : la musique reste
    // coupée), puis la v1, sauf les « automatique » (null) de sonsLivre et d'ambiance, qui retombent
    // sur le défaut (actif).
    const v2 = lire(CLE_V2);
    if (v2) return valider(JSON.parse(v2));
    const ancien = lire(CLE_V1);
    if (ancien) {
      const o = { ...(JSON.parse(ancien) as Record<string, unknown>) };
      if (o.sonsLivre === null) delete o.sonsLivre;
      if (o.ambiance === null) delete o.ambiance;
      return valider(o);
    }
    return { ...REGLAGES_DEFAUT };
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
