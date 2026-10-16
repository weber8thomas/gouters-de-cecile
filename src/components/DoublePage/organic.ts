// Petite version TypeScript des formes organiques de scripts/lib/organic.mjs et de l'aléatoire
// à graine de scripts/lib/prng.mjs, pour tracer les taches côté client (mêmes algorithmes).

const TAU = Math.PI * 2;
const f = (n: number) => +n.toFixed(2);
type Pt = [number, number];

export interface Rng {
  next: () => number;
  range: (min: number, max: number) => number;
}

// mulberry32, identique à prng.mjs
export function rng(seed: number | string = 1): Rng {
  let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (min, max) => min + (max - min) * next() };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Bruit doux périodique (somme de sinusoïdes), valeur dans [-1, 1].
export function softNoise(seed: number, octaves = 3): (t: number) => number {
  const r = rng(seed);
  const waves = Array.from({ length: octaves }, (_, i) => ({ k: i + 2 + Math.floor(r.range(0, 3)), p: r.range(0, TAU), w: 1 / (i + 1) }));
  const norm = waves.reduce((s, w) => s + w.w, 0);
  return (t) => waves.reduce((s, w) => s + w.w * Math.sin(w.k * t + w.p), 0) / norm;
}

// Catmull-Rom → Bézier cubiques passant par tous les points.
export function smoothPath(points: Pt[], closed = true, tension = 1): string {
  const n = points.length;
  if (n < 2) return '';
  const p = (i: number) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

// Ellipse tracée à la main : rayon modulé par un bruit doux (amp = fraction du rayon).
export function wobblyEllipse(cx: number, cy: number, rx: number, ry: number, { seed = 1, amp = 0.012, n = 32, rotate = 0 } = {}): string {
  const noise = softNoise(seed);
  const pts = Array.from({ length: n }, (_, i): Pt => {
    const a = (i / n) * TAU;
    const k = 1 + amp * noise(a);
    const x = rx * k * Math.cos(a), y = ry * k * Math.sin(a);
    return [cx + x * Math.cos(rotate) - y * Math.sin(rotate), cy + x * Math.sin(rotate) + y * Math.cos(rotate)];
  });
  return smoothPath(pts, true);
}
export const wobblyCircle = (cx: number, cy: number, r: number, opts?: { seed?: number; amp?: number; n?: number }) => wobblyEllipse(cx, cy, r, r, opts);

// Tache organique à n lobes.
export function blob(cx: number, cy: number, r: number, { seed = 1, irregularity = 0.25, n = 9 } = {}): string {
  const R = rng(seed);
  const pts = Array.from({ length: n }, (_, i): Pt => {
    const a = (i / n) * TAU + R.range(-0.15, 0.15);
    const rr = r * (1 + R.range(-irregularity, irregularity));
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
  return smoothPath(pts, true);
}

// Arc d'anneau irrégulier entre les angles a0 et a1, effilé aux deux bouts :
// bord extérieur ondulé, épaisseur variable (dépôt plus marqué d'un côté, comme un vrai cerne).
export function ringArc(cx: number, cy: number, r: number, a0: number, a1: number, { seed = 1, width = 0.07, amp = 0.035, taper = 0.18 } = {}): string {
  const outerN = softNoise(seed, 3);
  const widthN = softNoise(seed + 5, 2);
  const steps = Math.max(8, Math.round(((a1 - a0) / TAU) * 48));
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const ro = r * (1 + amp * outerN(a));
    const ends = Math.min(1, t / taper, (1 - t) / taper); // effilement
    const w = r * width * (0.65 + 0.55 * (widthN(a) + 1) / 2) * Math.max(0.08, Math.sin((ends * Math.PI) / 2));
    outer.push([cx + ro * Math.cos(a), cy + ro * Math.sin(a)]);
    inner.push([cx + (ro - w) * Math.cos(a), cy + (ro - w) * Math.sin(a)]);
  }
  return smoothPath([...outer, ...inner.reverse()], true, 0.9);
}

// Cerne de tasse de thé : un anneau principal interrompu une fois, au bord extérieur plus dense
// (le thé sèche sur le pourtour) et qui s'estompe vers l'intérieur ; un second anneau partiel
// décalé (la tasse reposée) ; un lavis très pâle et irrégulier à l'intérieur.
export interface TeaStain { wash: string; soft: string[]; rings: string[] }
export function teaStain(r: number, seed = 1): TeaStain {
  const R = rng(seed * 7919 + 13);
  const c = r * 1.5; // centre dans une boîte de 3r
  const start = R.range(0, TAU);
  const gap = R.range(0.35, 0.65);
  const a = start, e = start + TAU - gap;
  const soft = [
    ringArc(c, c, r, a, e, { seed, width: 0.13, amp: 0.03, taper: 0.08 }),
  ];
  const rings = [
    ringArc(c, c, r, a + 0.05, e - 0.05, { seed, width: 0.05, amp: 0.03, taper: 0.1 }),
    ringArc(c, c, r * 1.002, a + 0.3, a + 0.3 + (e - a) * R.range(0.45, 0.6), { seed: seed + 2, width: 0.02, amp: 0.03, taper: 0.25 }),
  ];
  // second passage de la tasse : arc court, décalé vers le bas à droite
  const ox = r * R.range(0.14, 0.22), oy = r * R.range(0.08, 0.16);
  const s2 = start + R.range(0.8, 1.6);
  soft.push(ringArc(c + ox, c + oy, r * 0.99, s2, s2 + R.range(1.4, 2.1), { seed: seed + 17, width: 0.06, amp: 0.03, taper: 0.35 }));
  const wash = blob(c + r * 0.02, c - r * 0.01, r * 0.9, { seed: seed + 23, irregularity: 0.06, n: 12 });
  return { wash, soft, rings };
}

// Tache de confiture : une goutte aux contours doux, un bord plus dense (la confiture sèche
// sur le pourtour), un cœur plus épais, et quelques gouttelettes projetées dans une direction.
export interface JamStain { body: string; rim: string; core: string; drops: string[] }
export function jamStain(r: number, seed = 1): JamStain {
  const R = rng(seed * 104729 + 7);
  const c = r * 1.5;
  const rot = R.range(0, TAU);
  const [rx, ry] = [r * 0.82, r * R.range(0.62, 0.74)];
  const body = wobblyEllipse(c, c, rx, ry, { seed: seed + 1, amp: 0.16, n: 36, rotate: rot });
  // liseré : bande entre la goutte et sa copie réduite (même bruit) — à remplir en evenodd
  const rim = `${body} ${wobblyEllipse(c, c, rx * 0.86, ry * 0.84, { seed: seed + 1, amp: 0.16, n: 36, rotate: rot })}`;
  const dir = R.range(0, TAU);
  const core = wobblyEllipse(c - Math.cos(dir) * r * 0.12, c - Math.sin(dir) * r * 0.12, rx * 0.5, ry * 0.46, { seed: seed + 2, amp: 0.2, n: 24, rotate: rot });
  const drops: string[] = [];
  const count = 2 + Math.floor(R.range(0, 3));
  for (let i = 0; i < count; i++) {
    const a = dir + R.range(-0.45, 0.45);
    const d = r * R.range(1.05, 1.4);
    const rr = r * R.range(0.06, 0.12) * (1.5 - (d / r - 1));
    drops.push(wobblyCircle(c + d * Math.cos(a), c + d * Math.sin(a), Math.max(r * 0.045, rr), { seed: seed + 30 + i, amp: 0.08, n: 18 }));
  }
  return { body, rim, core, drops };
}
