// Mouvement du carnet : ressorts partagés (source unique : design-system/motion.json) et accès à Motion.
// Règles : on n'anime que transform et opacity ; aucun filtre animé ; tout s'arrête avec
// prefers-reduced-motion ; aucun rendu React pendant un geste (MotionValue + useTransform).
import motionSpec from '../../design-system/motion.json';

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
  useReducedMotion,
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

/** Équivalent CSS d'un ressort (easing + durée), pour les transitions CSS simples. */
export const cssSpring = (name: SpringName): string => `var(--gc-dur-spring-${name}) var(--gc-spring-${name})`;

/** true si l'utilisateur a demandé moins de mouvement (lecture directe, hors React). */
export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Règle un ressort à l'exécution (planches de choix seulement : comparer des sensations).
 * Le livre relit SPRINGS.paper / SPRINGS.cover à chaque geste ; ne pas l'utiliser ailleurs.
 */
export function regleRessort(name: SpringName, r: { visualDuration: number; bounce: number }): void {
  SPRINGS[name] = { type: 'spring', visualDuration: r.visualDuration, bounce: r.bounce };
}
