// Tracés « à la main » des écritures : ratures (trait, zigzag, noirci), chevrons d'insertion,
// soulignés (à la règle, double, vague, à main levée), puces et flèches d'annotation. Fonctions pures et déterministes (graine) :
// elles renvoient des attributs `d` de chemins SVG.
import { rng, r2 } from './rng';

type Pt = [number, number];

/** Catmull-Rom → Bézier cubiques passant par tous les points (tracé ouvert). */
export function smooth(points: Pt[], tension = 1): string {
  if (points.length < 2) return '';
  return `M${r2(points[0][0])} ${r2(points[0][1])}` + curveSegs(points, tension);
}

/** Segments « C » d'un tracé lisse partant du premier point (sans le « M »). */
function curveSegs(points: Pt[], tension = 1): string {
  const n = points.length;
  const p = (i: number) => points[Math.max(0, Math.min(n - 1, i))];
  let d = '';
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
// Ratures, comme les font les vrais gens. viewBox 0 0 1000 40 étiré sur le mot (x) ; en y,
// 1 unité = 0,025 em, la ligne de base est à y = 36 (le SVG va de 0,9 em au-dessus de la ligne de
// base à 0,1 em dessous). Les dépassements aux deux bouts sont en px (posés par le composant).
//   trait   (≈ 70 %) : 1 ou 2 traits presque horizontaux, ondulés, qui dépassent le mot ;
//                      pression variable (épais au milieu, fins aux bouts), parfois un crochet de
//                      départ. Le mot reste lisible dessous.
//   zigzag  (≈ 25 %) : 5 à 9 allers-retours serrés, penchés (montée ~60°, descente plus raide).
//   noirci  (≈ 5 %)  : hachures croisées denses, un seul mot court ; illisible.

export const RATURE_VIEW = { w: 1000, h: 40 };
export type RatureStyle = 'trait' | 'zigzag' | 'noirci';

export interface RatureGeo {
  /** Formes pleines (trait à pression variable). */
  fills: string[];
  /** Traits à épaisseur constante (zigzag, hachures, crochet). */
  strokes: string[];
  /** Inclinaison de l'ensemble, en degrés (appliquée en CSS : angle exact quelle que soit la largeur). */
  tilt: number;
  /** Dépassement à gauche et à droite, en px. */
  over: [number, number];
}

const Y = (em: number) => 36 - em * 40; // em au-dessus de la ligne de base → unité y
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Style de rature d'une graine : trait 70 %, zigzag 25 %, noirci 5 % (un seul mot court). */
export function ratureDe(seed: number, text = ''): RatureStyle {
  const r = rng(seed ^ 0x7f4a7c15).next();
  const court = !/[ \u00a0\u202f]/.test(text.trim()) && [...text].length <= 6;
  if (r < 0.7) return 'trait';
  if (r < 0.95 || !court) return 'zigzag';
  return 'noirci';
}

/**
 * @param wEm   largeur estimée du mot raturé (em) : sert à garder les angles réels malgré l'étirement
 * @param xh    hauteur d'x de la main (em)
 * @param k     épaisseur relative de l'outil (TRAIT_K)
 * @param corps hauteur du corps du mot (em) : xh pour des minuscules, hauteur des hampes pour des
 *              chiffres ou des majuscules (on barre au milieu de ce qu'on voit)
 */
export function rature(style: RatureStyle, seed: number, wEm: number, xh: number, k = 1, corps = xh): RatureGeo {
  const R = rng(seed);
  const haut = corps > xh * 1.2;
  const unitX = Math.max(0.5, wEm) / 1000; // em par unité x (approché)
  if (style === 'trait') {
    const fills: string[] = [];
    const strokes: string[] = [];
    const two = R.next() < 0.42;
    const yc = (haut ? 0.46 * corps + 0.02 : 0.52 * xh + 0.04) + R.jitter(0.03);
    // la pente reste sur le mot : au plus 0,2 em de montée d'un bout à l'autre
    const tiltMax = clamp((Math.atan(0.2 / Math.max(0.5, wEm)) * 180) / Math.PI, 1, 4);
    const tilt = R.jitter(tiltMax);
    for (let t = 0; t < (two ? 2 : 1); t++) {
      const y0 = yc + (t ? (R.next() < 0.5 ? -1 : 1) * R.range(0.07, 0.12) : 0);
      const dTheta = t ? (R.jitter(1.6) * Math.PI) / 180 : 0;
      const x0 = t ? R.range(0, 70) : 0;
      const x1 = t ? 1000 - R.range(0, 90) : 1000;
      const f = R.range(0.5, 1.5), ph = R.range(0, Math.PI * 2), amp = R.range(0.01, 0.026);
      const w0 = R.range(0.034, 0.044) * k * (t ? 0.85 : 1);
      const N = 26;
      const up: Pt[] = [], lo: Pt[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const x = x0 + (x1 - x0) * u;
        const y = y0 + amp * Math.sin(Math.PI * 2 * f * u + ph) + (u - 0.5) * wEm * Math.tan(dTheta) + R.jitter(0.003);
        // pression : fine aux bouts, pleine au milieu, un peu plus d'appui au départ
        const w = w0 * (0.26 + 0.74 * Math.pow(Math.sin(Math.PI * u), 0.6)) * (1 + 0.12 * (1 - u)) * (1 + R.jitter(0.06));
        up.push([x, Y(y + w)]);
        lo.push([x, Y(y - w)]);
      }
      const capS = (w0 * 0.3) / unitX, capE = (w0 * 0.26) / unitX;
      const e = up.length - 1;
      const yEnd = (up[e][1] + lo[e][1]) / 2, ySt = (up[0][1] + lo[0][1]) / 2;
      fills.push(
        smooth(up) +
          `Q${r2(x1 + capE)} ${r2(yEnd)} ${r2(lo[e][0])} ${r2(lo[e][1])}` +
          curveSegs(lo.slice().reverse()) +
          `Q${r2(x0 - capS)} ${r2(ySt)} ${r2(up[0][0])} ${r2(up[0][1])}Z`,
      );
      // crochet de départ : la plume se pose un peu plus bas et remonte dans le trait
      if (t === 0 && R.next() < 0.4) {
        const hx = 0.07 / unitX;
        strokes.push(smooth([[x0 + hx * 0.2, Y(y0 - R.range(0.07, 0.12))], [x0 - hx * 0.25, Y(y0 - 0.02)], [x0 + hx, Y(y0 + 0.004)]], 0.8));
      }
    }
    return { fills, strokes, tilt, over: [r2(R.range(3, 10)), r2(R.range(3, 10))] };
  }

  if (style === 'zigzag') {
    const n = clamp(Math.round(4 + wEm * 1.1), 5, 9);
    const a = 1000 / n;
    const top = (haut ? corps * 0.9 : xh) + R.range(0.06, 0.14), bot = R.range(-0.04, 0.03);
    const pts: Pt[] = [[R.range(0, 20), Y(bot + R.jitter(0.04))]];
    for (let i = 0; i < n; i++) {
      const tired = 1 - 0.18 * (i / n); // la main se fatigue : amplitude un peu moindre à la fin
      pts.push([clamp(i * a + a * R.range(0.6, 0.8), 0, 1000), Y(bot + (top - bot) * tired + R.jitter(0.07))]);
      pts.push([clamp((i + 1) * a + a * R.jitter(0.12), 0, 1000), Y(bot + R.jitter(0.05))]);
    }
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])} ${r2(p[1])}`).join('');
    return { fills: [], strokes: [d], tilt: R.jitter(2.5), over: [r2(R.range(2, 6)), r2(R.range(2, 7))] };
  }

  // noirci : deux passes de hachures croisées + une vague qui repasse au milieu
  const strokes: string[] = [];
  const top = (haut ? corps * 0.92 : xh) + R.range(0.14, 0.22), bot = R.range(-0.1, -0.04);
  for (const dir of [1, -1]) {
    const n = Math.max(8, Math.round(wEm * 4.2));
    const a = 1000 / n;
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const x = dir > 0 ? i * a : 1000 - i * a;
      const lean = (dir > 0 ? 1 : -1) * a * 0.45;
      pts.push([clamp(x + R.jitter(a * 0.15), 0, 1000), Y(bot + R.jitter(0.04))]);
      pts.push([clamp(x + lean + R.jitter(a * 0.15), 0, 1000), Y(top + R.jitter(0.05))]);
    }
    strokes.push(pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])} ${r2(p[1])}`).join(''));
  }
  const mid: Pt[] = [];
  for (let i = 0; i <= 6; i++) mid.push([i % 2 ? 1000 - R.range(0, 40) : R.range(0, 40), Y(bot + (top - bot) * (0.25 + 0.1 * i) + R.jitter(0.03))]);
  strokes.push(mid.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])} ${r2(p[1])}`).join(''));
  return { fills: [], strokes, tilt: R.jitter(2), over: [r2(R.range(2, 5)), r2(R.range(2, 5))] };
}

/** Chevron d'insertion tracé d'un geste (viewBox 0 0 20 16) : « ^ » sous la ligne, « v » au-dessus. */
export function chevron(seed: number, kind: '^' | 'v'): string {
  const R = rng(seed);
  const p: Pt[] = kind === '^'
    ? [[2 + R.jitter(1), 14 + R.jitter(1)], [10 + R.jitter(1.2), 2 + R.jitter(1)], [18 + R.jitter(1), 13 + R.jitter(1.5)]]
    : [[2 + R.jitter(1), 2 + R.jitter(1)], [10 + R.jitter(1.2), 14 + R.jitter(1)], [18 + R.jitter(1), 3 + R.jitter(1.5)]];
  return `M${r2(p[0][0])} ${r2(p[0][1])}L${r2(p[1][0])} ${r2(p[1][1])}L${r2(p[2][0])} ${r2(p[2][1])}`;
}

// ---------------------------------------------------------------------------------------------
// Puces tracées à la main (viewBox 0 0 40 20, posées à mi-hauteur d'x).

export type PuceDessin = 'tiret' | 'point' | 'case' | 'fleche';

export function puce(kind: PuceDessin, seed: number): { fills: string[]; strokes: string[] } {
  const R = rng(seed);
  if (kind === 'tiret') {
    // tiret court à pression variable, jamais tout à fait horizontal
    const y0 = 10 + R.jitter(1.2), y1 = 10 + R.jitter(1.6), x0 = R.range(3, 8), x1 = R.range(31, 38);
    const w = R.range(3.4, 4.4);
    const mid = (x0 + x1) / 2 + R.jitter(3);
    const ym = (y0 + y1) / 2 + R.jitter(0.6);
    return {
      fills: [
        `M${r2(x0)} ${r2(y0 - w * 0.45)}Q${r2(mid)} ${r2(ym - w * 1.15)} ${r2(x1)} ${r2(y1 - w * 0.3)}` +
          `Q${r2(x1 + 1.4)} ${r2(y1)} ${r2(x1)} ${r2(y1 + w * 0.3)}Q${r2(mid)} ${r2(ym + w * 0.9)} ${r2(x0)} ${r2(y0 + w * 0.5)}` +
          `Q${r2(x0 - 1.6)} ${r2(y0)} ${r2(x0)} ${r2(y0 - w * 0.45)}Z`,
      ],
      strokes: [],
    };
  }
  if (kind === 'point') {
    const cx = 20 + R.jitter(2), cy = 10 + R.jitter(1), r = R.range(2.6, 3.3);
    const pts: Pt[] = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      const k = 1 + R.jitter(0.18);
      return [cx + Math.cos(a) * r * k * 1.1, cy + Math.sin(a) * r * k];
    });
    return { fills: [smooth([...pts, pts[0], pts[1]]) + 'Z'], strokes: [] };
  }
  if (kind === 'case') {
    // petite case : quatre côtés d'un geste, les coins qui dépassent
    const x0 = 7 + R.jitter(1), x1 = 31 + R.jitter(1), y0 = -6 + R.jitter(1), y1 = 17 + R.jitter(1);
    const d =
      `M${r2(x0 + 1)} ${r2(y0 - 1)}L${r2(x1 + 1.5)} ${r2(y0 + R.jitter(0.8))}` +
      `L${r2(x1 + R.jitter(0.8))} ${r2(y1 + 1)}L${r2(x0 - 1)} ${r2(y1 + R.jitter(0.8))}L${r2(x0 + R.jitter(0.6))} ${r2(y0 + 2.5)}`;
    return { fills: [], strokes: [d] };
  }
  // flèche : hampe légèrement arquée, pointe d'un geste
  const yy = 10 + R.jitter(1);
  const shaft = smooth([[3, yy + R.jitter(1)], [18, yy - R.range(0.4, 1.4)], [33, yy + R.jitter(0.6)]]);
  const head = `M${r2(26 + R.jitter(1))} ${r2(yy - 6 + R.jitter(1))}L${r2(34)} ${r2(yy + R.jitter(0.5))}L${r2(25 + R.jitter(1))} ${r2(yy + 6 + R.jitter(1))}`;
  return { fills: [], strokes: [shaft, head] };
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
