// Le trajet d'un scorpion qui détale : une ligne brisée en zigzag, calculée une seule fois au clic.
// Les mêmes points servent à l'animation (WAAPI : transform et opacity) et à la trace d'encre (SVG statique).
import type { VueScorpion } from '../../lib/scorpions';

export interface Trajet {
  /** Points d'arrivée, en px relatifs au point de départ (le premier est [0, 0]). */
  points: [number, number][];
  /** Cap du scorpion sur chaque tronçon (degrés CSS, déjà ramenés au plus près du précédent). */
  caps: number[];
  /** Instants des images clés (0 à 1) : vitesse constante, après un petit demi-tour au départ. */
  instants: number[];
}

/** Le dessin regarde vers la gauche (a, de profil) ou vers le haut (b, c, de dessus) : angle à ajouter au cap pour le tourner dans le bon sens. */
export const decalageCap = (vue: VueScorpion): number => (vue === 'a' ? -180 : 90);

/** Ramène a au plus près de ref (modulo 360), pour que deux poses voisines ne fassent jamais un tour complet. */
const procheDe = (a: number, ref: number): number => a + 360 * Math.round((ref - a) / 360);

export function calculerTrajet(fuite: number, vue: VueScorpion, longueur: number, repos: number, graine: number): Trajet {
  const th = (fuite * Math.PI) / 180, u = [Math.cos(th), Math.sin(th)], n = [-u[1], u[0]];
  const f = [0, .18, .38, .58, .8, 1], l = [0, 1, -1, .9, -.8, 0], s = graine % 2 ? 1 : -1, amp = longueur * .12;
  const points = f.map((fi, i): [number, number] => [u[0] * longueur * fi + n[0] * s * amp * l[i], u[1] * longueur * fi + n[1] * s * amp * l[i]]);
  const caps: number[] = [];
  let ref = repos;
  for (let i = 0; i < points.length - 1; i++) {
    const cap = (Math.atan2(points[i + 1][1] - points[i][1], points[i + 1][0] - points[i][0]) * 180) / Math.PI + decalageCap(vue);
    ref = procheDe(cap, ref);
    caps.push(ref);
  }
  const cumul = [0];
  for (let i = 1; i < points.length; i++) cumul.push(cumul[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const instants = cumul.map((c) => .07 + (.93 * c) / cumul[cumul.length - 1]);
  return { points, caps, instants };
}

/** Ligne brisée décalée de d px sur le côté (les deux rangées de pas). */
export function ligneDecalee(points: [number, number][], d: number, ox: number, oy: number): string {
  return points.map(([x, y], i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const t = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return `${i ? 'L' : 'M'}${(ox + x - Math.sin(t) * d).toFixed(1)} ${(oy + y + Math.cos(t) * d).toFixed(1)}`;
  }).join('');
}
