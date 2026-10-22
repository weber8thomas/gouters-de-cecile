// Contexte du soulèvement : les actions (stables, pour les objets posés dans la page, qui ne doivent
// jamais être rendus à nouveau quand l'objet s'envole) et l'état (pour le reste de l'application).
import React from 'react';
import type { VideoInfo } from './media';

/** Phase du soulèvement : fermé, en vol vers le haut, ouvert (posé au-dessus du livre), en vol vers la page. */
export type EtatSoulevement = 'ferme' | 'envol' | 'ouvert' | 'retour';

/** Un objet qu'on soulève : la photo d'une vidéo, un tirage sans vidéo, ou le feuillet volant (pages cuites recto / verso). */
export type ObjetSoulevable =
  | {
    type: 'photo';
    video: VideoInfo;
    /** L'élément posé dans la page (celui qui porte data-gc-objet="photo", tourné ou non). */
    source: HTMLElement;
    /** Inclinaison de départ (degrés). Défaut : la rotation propre de `source`. */
    angle?: number;
  }
  | {
    type: 'tirage';
    /** La photo fixe (nom logique d'assetUrl() ou URL) : un tirage à bord blanc, sans vidéo. */
    tirage: string;
    /** Ses coins, même cadre que le tirage (facultatifs). */
    coins?: string | null;
    /** Légende au crayon, sous la photo soulevée (facultative). */
    legende?: string | null;
    /** Date (« mois année », facultative), sous la légende. */
    date?: string | null;
    /** La même photo en couleurs, sans bord (version locale) : elle remplace le tirage à l'ouverture (réglage « Photos ouvertes »). */
    couleur?: string | null;
    /** Zone de la photo dans l'image du tirage (fractions) : celle où se pose `couleur`. */
    zonePhoto?: [number, number, number, number];
    /** Proportion (largeur / hauteur) de l'image. Défaut : celle de l'image cuite, sinon 3 / 2. */
    proportion?: number;
    /** L'élément posé dans la page (tourné ou non) : sa proportion est celle de l'image. */
    source: HTMLElement;
    angle?: number;
  }
  | {
    type: 'feuillet';
    /** Ids des pages cuites (src/content/pages/manifeste.json). */
    recto: string;
    verso?: string | null;
    /** La feuille entière, posée (et découpée) dans la page. */
    source: HTMLElement;
    angle?: number;
    /** Cadre qui découpe la feuille au repos : le reste de la feuille apparaît en fondu au départ. */
    fenetre?: HTMLElement | null;
  };

export interface SoulevementActions {
  /**
   * Soulève l'objet. À appeler DANS le geste (toucher, clic, touche) : pour une photo, la vidéo est
   * lancée de façon synchrone (son et volume des réglages, currentTime = 0, play()) avant tout rendu.
   * Renvoie false si un autre objet est déjà soulevé.
   */
  soulever: (objet: ObjetSoulevable) => boolean;
  /** Repose l'objet soulevé à sa place (re-mesurée). */
  reposer: () => void;
  /** Pose la source de la vidéo unique (à l'atterrissage d'un tourne-page) ; null la vide. */
  preparer: (video: VideoInfo | null) => void;
  /** Feuillet : retourne la feuille (sans argument : bascule). */
  retourner: (face?: 'recto' | 'verso') => void;
  /** La vidéo unique (toujours montée dans le calque). */
  video: () => HTMLVideoElement | null;
}

export interface Soulevement extends SoulevementActions {
  etat: EtatSoulevement;
  objet: ObjetSoulevable | null;
  /** Feuillet : face visible. */
  face: 'recto' | 'verso';
}

const AUCUNE: SoulevementActions = {
  soulever: () => false,
  reposer: () => undefined,
  preparer: () => undefined,
  retourner: () => undefined,
  video: () => null,
};

export const ActionsContext = React.createContext<SoulevementActions | null>(null);
export const EtatContext = React.createContext<{ etat: EtatSoulevement; objet: ObjetSoulevable | null; face: 'recto' | 'verso' }>({
  etat: 'ferme',
  objet: null,
  face: 'recto',
});

/** Actions seules (stables) : ne rend jamais à nouveau quand l'objet s'envole. null hors d'un SoulevementProvider. */
export const useSoulevementActions = (): SoulevementActions | null => React.useContext(ActionsContext);

/** { etat, objet, face, soulever, reposer, preparer, retourner, video }. Hors d'un provider : fermé, actions sans effet. */
export function useSoulevement(): Soulevement {
  const a = React.useContext(ActionsContext) ?? AUCUNE;
  const e = React.useContext(EtatContext);
  return React.useMemo(() => ({ ...a, ...e }), [a, e]);
}

/** Événement envoyé à un objet posé pour qu'il se soulève lui-même (souleverObjet). */
export const EVENEMENT_SOULEVER = 'gc-soulever';

/**
 * Soulève la photo ou le feuillet vivant de la double page affichée (touches Entrée et ↑ du lead) :
 * trouve l'objet vivant (mode live) le plus visible et lui demande de se soulever, de façon synchrone
 * (play() reste dans le geste). Renvoie true si un objet a répondu.
 */
export function souleverObjet(type: 'photo' | 'feuillet', racine: ParentNode = document): boolean {
  const els = Array.from(racine.querySelectorAll<HTMLElement>(`[data-gc-objet="${type}"][data-gc-objet-mode="live"]`));
  if (!els.length) return false;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const visible = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return w * h;
  };
  const el = els.length === 1 ? els[0] : els.reduce((a, b) => (visible(b) > visible(a) ? b : a));
  return !el.dispatchEvent(new CustomEvent(EVENEMENT_SOULEVER, { cancelable: true }));
}
