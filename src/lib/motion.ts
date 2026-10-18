// Mouvement du carnet : ressorts partagés (source unique : design-system/motion.json) et accès à Motion.
// Règles : on n'anime que transform et opacity ; aucun filtre animé ; aucun rendu React pendant un geste
// (MotionValue + useTransform). Trois niveaux de mouvement (niveauMouvement) : complet ; doux quand le
// système demande moins d'animations (les effets restent, sans les grands mouvements) ; réduit quand on le
// choisit dans le menu (presque tout s'arrête).
import { useReducedMotion as useReducedMotionSysteme } from 'motion/react';
import motionSpec from '../../design-system/motion.json';
import { abonnerReglages, getReglages, useReglages, type Reglages, type Vitesse } from './reglages';

export {
  LazyMotion,
  MotionConfig,
  AnimatePresence,
  domMax,
  animate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  useSpring,
  type MotionValue,
  type Transition,
} from 'motion/react';
export * as m from 'motion/react-m';

export type SpringName = keyof typeof motionSpec.springs;

/** Ressort Motion nommé : SPRINGS.paper, SPRINGS.dome… */
export const SPRINGS = Object.fromEntries(
  Object.entries(motionSpec.springs).map(([k, v]) => [k, { type: 'spring', visualDuration: v.visualDuration, bounce: v.bounce }]),
) as Record<SpringName, { type: 'spring'; visualDuration: number; bounce: number }>;

/** Ressort du niveau de la tasse-progression. */
export const CUP_SPRING = { stiffness: motionSpec.cup.stiffness, damping: motionSpec.cup.damping };

/** Décalages (en s) des enchaînements. */
export const STAGGER = motionSpec.stagger;

/** Élan au lâcher d'un déplacement à la loupe (Motion type « inertia »). */
export const INERTIE = { power: motionSpec.inertie.power, timeConstant: motionSpec.inertie.timeConstant };

/** Équivalent CSS d'un ressort (easing + durée), pour les transitions CSS simples. */
export const cssSpring = (name: SpringName): string => `var(--gc-dur-spring-${name}) var(--gc-spring-${name})`;

/**
 * Niveau de mouvement :
 *   complet : tout bouge ;
 *   doux    : le système demande moins d'animations et le réglage « Animations » le suit (défaut). Les
 *             effets du carnet restent, en version douce : bougie, encre qui s'écrit, lueur du feu (moins
 *             ample), dessins, invitations, pages qui tournent. Les grands mouvements sont sautés :
 *             arrivée du livre, mouvements de caméra, zoom animé de la loupe ;
 *   reduit  : « Animations : réduites » dans le menu : presque tout s'arrête (fondus courts).
 */
export type NiveauMouvement = 'complet' | 'doux' | 'reduit';

const systemeReduit = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function niveauMouvement(r: Pick<Reglages, 'animations'> = getReglages(), systeme = systemeReduit()): NiveauMouvement {
  if (r.animations === 'reduites') return 'reduit';
  if (r.animations === 'completes') return 'complet';
  return systeme ? 'doux' : 'complet';
}

export function useNiveauMouvement(): NiveauMouvement {
  const systeme = useReducedMotionSysteme();
  const [r] = useReglages();
  return niveauMouvement(r, !!systeme);
}

/** true en mouvement réduit (réglage « Animations : réduites ») : seul ce niveau coupe les effets. */
export function useReducedMotion(): boolean {
  return useNiveauMouvement() === 'reduit';
}

/** Même chose, lecture directe hors React. */
export const prefersReducedMotion = (): boolean => niveauMouvement() === 'reduit';

/** Mouvement doux ou réduit : pas de grand mouvement (caméra, zoom animé), lecture directe hors React. */
export const mouvementDoux = (): boolean => niveauMouvement() !== 'complet';

/**
 * Règle un ressort à l'exécution (planches de choix seulement : comparer des sensations).
 * Le livre relit SPRINGS.paper / SPRINGS.cover à chaque geste ; ne pas l'utiliser ailleurs.
 */
export function regleRessort(name: SpringName, r: { visualDuration: number; bounce: number }): void {
  SPRINGS[name] = { type: 'spring', visualDuration: r.visualDuration, bounce: r.bounce };
}

/** Vitesses des pages du menu de réglages (design-system/motion.json, « vitesses »). */
export const VITESSES_PAGE: Record<Vitesse, { visualDuration: number; bounce: number }> = {
  vive: motionSpec.vitesses.vive,
  normale: motionSpec.vitesses.normale,
  lente: motionSpec.vitesses.lente,
};

// La vitesse choisie dans le menu règle le ressort « paper », relu par le livre à chaque geste.
const appliquerVitesse = () => regleRessort('paper', VITESSES_PAGE[getReglages().vitesse]);
appliquerVitesse();
abonnerReglages(appliquerVitesse);
