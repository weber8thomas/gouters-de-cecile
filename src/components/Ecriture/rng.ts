// Aléa déterministe (mulberry32) : une même graine donne toujours la même écriture,
// à chaque rendu, sur chaque machine (captures, cuisson et TV identiques).

export interface Rng {
  next: () => number;
  /** Valeur dans [min, max). */
  range: (min: number, max: number) => number;
  /** Valeur dans [-amp, amp]. */
  jitter: (amp: number) => number;
}

/** Empreinte FNV-1a d'une chaîne (graine stable dérivée d'un texte). */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    jitter: (amp) => (next() * 2 - 1) * amp,
  };
}

/** Arrondi court pour les attributs SVG et les styles en ligne. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;
