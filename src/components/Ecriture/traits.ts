// Tracés « à la main » des écritures : rature (gribouillis), soulignés (à la règle, double,
// vague, à main levée) et flèches d'annotation. Fonctions pures et déterministes (graine) :
// elles renvoient des attributs `d` de chemins SVG.
import { rng, r2 } from './rng';

type Pt = [number, number];

/** Catmull-Rom → Bézier cubiques passant par tous les points (tracé ouvert). */
export function smooth(points: Pt[], tension = 1): string {
  const n = points.length;
  if (n < 2) return '';
  const p = (i: number) => points[Math.max(0, Math.min(n - 1, i))];
  let d = `M${r2(points[0][0])} ${r2(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += `C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d;
}

// ---------------------------------------------------------------------------------------------
// Soulignés : viewBox 0 0 1000 H, étirés à la largeur du texte (preserveAspectRatio="none",
// trait à épaisseur constante grâce à vector-effect: non-scaling-stroke).

export const UL_VIEW = { w: 1000, h: 12 };

export interface TraitPaths {
  /** Trait principal. */
  main: string[];
  /** Surépaisseur au départ (la plume se pose). */
  heavy: string[];
}

/** Un trait à la règle : droit, une infime flèche au milieu, un départ appuyé, une fin qui se lève. */
function ruler(R: ReturnType<typeof rng>, y: number, x0: number, x1: number): { main: string; heavy: string } {
  const tilt = R.jitter(0.9); // la règle n'est jamais tout à fait parallèle au texte
  const yAt = (x: number) => y + tilt * ((x - x0) / (x1 - x0) - 0.5);
  const sag = R.jitter(0.25);
  const mid = (x0 + x1) / 2 + R.jitter(80);
  const lift = R.range(0.2, 0.7); // la plume se relève en fin de trait
  const main =
    `M${r2(x0)} ${r2(yAt(x0))}` +
    `L${r2(mid)} ${r2(yAt(mid) + sag)}` +
    `L${r2(x1 - 14)} ${r2(yAt(x1 - 14))}` +
    `L${r2(x1)} ${r2(yAt(x1) - lift)}`;
  const len = R.range(10, 22);
  const heavy = `M${r2(x0 + 0.5)} ${r2(yAt(x0) + 0.15)}L${r2(x0 + len)} ${r2(yAt(x0 + len) + 0.05)}`;
  return { main, heavy };
}

export function ulRegle(seed: number): TraitPaths {
  const R = rng(seed);
  const t = ruler(R, 6 + R.jitter(0.4), R.range(0, 6), 1000 - R.range(0, 10));
  return { main: [t.main], heavy: [t.heavy] };
}

export function ulDouble(seed: number): TraitPaths {
  const R = rng(seed);
  const a = ruler(R, 3.6 + R.jitter(0.3), R.range(0, 6), 1000 - R.range(0, 10));
  const b = ruler(R, 9.2 + R.jitter(0.3), R.range(8, 30), 1000 - R.range(10, 50));
  return { main: [a.main, b.main], heavy: [a.heavy, b.heavy] };
}

/** Vague tracée à main levée : ondes un peu inégales. */
export function ulVague(seed: number): TraitPaths {
  const R = rng(seed);
  const waves = 5 + Math.floor(R.next() * 3);
  const pts: Pt[] = [];
  const steps = waves * 4;
  const amp = R.range(2.6, 3.4);
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 990 + 4 + R.jitter(4);
    const phase = (i / 4) * Math.PI * 2;
    const a = amp * (1 + R.jitter(0.18)) * (i === 0 || i === steps ? 0.6 : 1);
    pts.push([x, 6 + Math.sin(phase) * a + R.jitter(0.25)]);
  }
  const main = smooth(pts);
  const heavy = smooth(pts.slice(0, 3));
  return { main: [main], heavy: [heavy] };
}

/** Souligné à main levée sous un mot : léger arc, départ appuyé, fin qui remonte. */
export function ulMain(seed: number): TraitPaths {
  const R = rng(seed);
  const y = 5 + R.jitter(0.5);
  const bow = R.range(0.8, 1.8); // l'arc se creuse au milieu
  const pts: Pt[] = [
    [R.range(0, 20), y + R.jitter(0.4)],
    [250 + R.jitter(30), y + bow * 0.7],
    [520 + R.jitter(40), y + bow],
    [800 + R.jitter(30), y + bow * 0.5 + R.jitter(0.3)],
    [1000 - R.range(0, 20), y - R.range(0.6, 1.8)],
  ];
  return { main: [smooth(pts)], heavy: [smooth(pts.slice(0, 2))] };
}

// ---------------------------------------------------------------------------------------------
// Rature : viewBox 0 0 100 20, étirée sur le mot barré. Une spirale serrée tracée d'un geste
// (boucles d'amplitude inégale), suivie d'un retour en vague qui finit de barrer.

export const SCRIBBLE_VIEW = { w: 100, h: 20 };

export function gribouillis(seed: number, chars: number): string[] {
  const R = rng(seed);
  // 1. Spirale serrée, boucles qui se chevauchent largement, amplitude inégale d'une boucle à l'autre
  const loops = Math.max(4, Math.round(chars * 1.35));
  const per = 14; // points par boucle
  // la spirale tient de 0 à 100 : boucles de rayon 1,45 pas aux deux bouts
  const step = 100 / (loops + 2.9);
  const cy = 11 + R.jitter(0.5);
  const slope = R.jitter(1.4);
  // amplitude inégale, plus petite aux deux bouts : le gribouillis n'a pas de bords nets
  const amp = Array.from({ length: loops + 1 }, (_, k) => R.range(5.4, 8.6) * (k === 0 || k === loops ? 0.62 : 1));
  const pts: Pt[] = [];
  for (let i = 0; i <= loops * per; i++) {
    const t = i / per;
    const k = Math.min(loops, Math.floor(t));
    const f = t - Math.floor(t);
    const ry = amp[k] * (1 - f) + amp[Math.min(loops, k + 1)] * f;
    const a = f * Math.PI * 2;
    const x = step * 1.45 + t * step - Math.sin(a) * step * 1.45;
    const y = cy + slope * (t / loops - 0.5) - Math.cos(a) * ry + R.jitter(0.35);
    pts.push([x, y]);
  }
  // 2. Retour en zigzag, de droite à gauche, pour finir de noircir
  const back: Pt[] = [];
  const n = Math.max(3, Math.round(loops * 0.7));
  for (let i = 0; i <= n * 2; i++) {
    const x = 99 - (i / (n * 2)) * 96 + R.jitter(1);
    back.push([x, cy + (i % 2 ? -5.6 : 5.2) + R.jitter(1)]);
  }
  return [smooth(pts, 0.9), smooth(back, 0.6)];
}

// ---------------------------------------------------------------------------------------------
// Flèche d'annotation, en pixels, depuis l'origine (0, 0) jusqu'à `to`.

export function fleche(seed: number, to: { x: number; y: number }, kind: 'courbe' | 'droite', head = 9): { shaft: string; head: string } {
  const R = rng(seed);
  const len = Math.hypot(to.x, to.y) || 1;
  const ux = to.x / len, uy = to.y / len; // direction
  const nx = -uy, ny = ux; // normale
  // la flèche part un peu à côté du texte et s'arrête juste avant la cible
  const s: Pt = [ux * 3, uy * 3];
  const e: Pt = [to.x - ux * 2, to.y - uy * 2];
  // bombé : vers le haut de la page de préférence (comme une main qui contourne)
  const side = ny < 0 ? 1 : ny > 0 ? -1 : R.next() < 0.5 ? 1 : -1;
  const bulge = kind === 'courbe' ? len * R.range(0.22, 0.32) * side : len * R.range(0.02, 0.05) * side;
  const pts: Pt[] = [];
  const N = kind === 'courbe' ? 7 : 4;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const b = Math.sin(Math.PI * t) * bulge * (kind === 'courbe' ? 1 - 0.25 * t : 1);
    const tremor = i === 0 || i === N ? 0 : R.jitter(0.6);
    pts.push([s[0] + (e[0] - s[0]) * t + nx * (b + tremor), s[1] + (e[1] - s[1]) * t + ny * (b + tremor)]);
  }
  const shaft = smooth(pts);
  // direction d'arrivée = tangente finale
  const [px, py] = pts[pts.length - 2];
  let dx = e[0] - px, dy = e[1] - py;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  // barbe : vecteur opposé à la direction d'arrivée, tourné de « deg »
  const barb = (deg: number, l: number): Pt => {
    const a = (deg * Math.PI) / 180;
    const bx = -dx * Math.cos(a) + dy * Math.sin(a);
    const by = -dx * Math.sin(a) - dy * Math.cos(a);
    return [e[0] + bx * l, e[1] + by * l];
  };
  const b1 = barb(26 + R.jitter(4), head * R.range(0.9, 1.1));
  const b2 = barb(-(28 + R.jitter(4)), head * R.range(0.8, 1.05));
  // la pointe en un seul geste : barbe, pointe, barbe
  const headPath = `M${r2(b1[0])} ${r2(b1[1])}L${r2(e[0])} ${r2(e[1])}L${r2(b2[0])} ${r2(b2[1])}`;
  return { shaft, head: headPath };
}
