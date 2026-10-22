// Vacillement de la lumière du feu, SUR LE COMPOSITEUR : une animation Web (WAAPI) d'opacité par calque, lancée une
// fois, qui tourne sans une ligne de JS ni repeinture (le calque est promu par `will-change: opacity`, son
// dégradé est peint une seule fois). Remplace l'ancienne horloge rAF (src/lib/feu.ts) qui réécrivait l'opacité de
// calques pleine page à chaque image (≈ 800 tuiles rastérisées par seconde, GPU saturé sur iPad).
//
// La courbe est précalculée : une somme de sinusoïdes de périodes non multiples les unes des autres (≈ 2,4 s, 3,4 s,
// 4,8 s, 8 s, 12 s), qui se raccorde sur un cycle de 24 s, plus trois flambées (montée rapide, descente lente).
// Écart type ≈ 0,5 ; flambées jusqu'à ≈ +1 (même loi que feu.ts : intensité ≈ 1 + 0,23 × k).
//
//   useVacille(ref, { base, amplitude, phase? })
//     base       opacité moyenne du calque (celle de la lumière fixe) ;
//     amplitude  variation relative : opacité = base × (1 + amplitude × k) ; négative pour un voile sombre qui
//                s'éclaircit quand le feu flambe ;
//     phase      0 à 1 : décalage dans le cycle (les calques ne vacillent pas en bloc).
//   « Animations : réduites » ou réglage feu: false : aucune animation (l'opacité de base reste, chaude et fixe) ;
//   mouvement doux (préférence du système) : demi-amplitude.
//
// PALIERS (easing step-end) et non interpolation : une opacité qui change à chaque vsync fait recomposer l'écran à
// 120 images/s (≈ 40 % de GPU mesuré, tuiles = 0 pourtant) ; en paliers de 1/12 s, d'écart < 2 % entre deux (invisible),
// Chrome ne recompose que lorsque la valeur change. Les paliers sont ceux de l'HORLOGE COMMUNE (src/lib/horloge.ts) :
// cycle de 288 paliers (24 s), phases en paliers entiers, même origine de temps que la flamme de la bougie → les
// changements de toutes les lueurs et de la flamme tombent sur les mêmes images (≈ 12 images composées par seconde).
import React from 'react';
import { avancePaliers, caler, dureePaliers, PALIER_S } from './horloge';
import { mouvementDoux, prefersReducedMotion } from './motion';
import { abonnerReglages, getReglages } from './reglages';

const CYCLE = 24; // s
const PAS = PALIER_S; // s entre deux images clés : paliers de 12 par seconde (horloge commune)
const COMPOSANTES: [number, number, number][] = [ // [nombre de périodes dans le cycle, amplitude, phase (tours)]
  [10, 0.35, 0.13], [7, 0.35, 0.71], [5, 0.35, 0.42], [3, 0.25, 0.9], [2, 0.2, 0.31],
];
const FLAMBEES: [number, number][] = [[4.5, 0.9], [13, 0.6], [19.5, 1]]; // [instant (s), force]

const lisse = (x: number) => x * x * (3 - 2 * x);
function courbe(): number[] {
  const n = Math.round(CYCLE / PAS);
  const k: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i % n) * PAS;
    let v = 0;
    for (const [f, a, p] of COMPOSANTES) v += a * Math.sin(2 * Math.PI * (f * (t / CYCLE) + p));
    for (const [t0, force] of FLAMBEES) {
      const u = (((t - t0) % CYCLE) + CYCLE) % CYCLE;
      v += u < 0.35 ? force * lisse(u / 0.35) : force * Math.exp(-(u - 0.35) / 1.8);
    }
    k.push(v);
  }
  return k;
}
let COURBE: number[] | null = null;

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Vrai quand la lumière doit vivre (ni « Animations : réduites », ni feu: false). */
export function vacillementActif(): boolean {
  const r = getReglages() as unknown as { feu?: unknown };
  return r.feu !== false && !prefersReducedMotion();
}

/** Lance l'animation de vacillement sur `el` ; renvoie son arrêt. Sans WAAPI, ne fait rien (opacité de base). */
export function vacillerOpacite(el: HTMLElement, base: number, amplitude: number, phase = 0): () => void {
  if (typeof el.animate !== 'function' || !vacillementActif()) return () => {};
  COURBE ??= courbe();
  const amp = amplitude * (mouvementDoux() ? 0.5 : 1);
  const images = COURBE.map((k, i) => ({ opacity: borne(base * (1 + amp * k), 0, 1), offset: i / (COURBE!.length - 1), easing: 'step-end' }));
  const n = images.length - 1; // paliers du cycle : 24 s × 12 = 288
  const a = caler(el.animate(images, { duration: dureePaliers(n), iterations: Infinity, delay: avancePaliers(phase, n) }));
  return () => a.cancel();
}

/** Hook : fait vaciller l'opacité du calque `ref` autour de `base` (voir l'en-tête). */
export function useVacille(ref: React.RefObject<HTMLElement | null>, base: number, amplitude: number, phase = 0): void {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let arret = vacillerOpacite(el, base, amplitude, phase);
    // un changement de réglage (animations, feu) relance ou coupe l'animation
    const relire = () => { arret(); arret = vacillerOpacite(el, base, amplitude, phase); };
    const desabonner = abonnerReglages(relire);
    return () => { arret(); desabonner(); };
  }, [ref, base, amplitude, phase]);
}
