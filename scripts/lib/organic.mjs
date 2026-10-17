// Formes « faites main » générées : contours légèrement irréguliers, festons, bords déchirés.
// Toutes les fonctions renvoient des données de tracé SVG (attribut d) ou des listes de points.
// Usage : import { wobblyCircle, scallops, smoothPath } from '../../../scripts/lib/organic.mjs';
import { rng } from './prng.mjs';

export const f = (n) => +n.toFixed(2);
export const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const TAU = Math.PI * 2;

// Bruit doux périodique (somme de sinusoïdes à phases aléatoires), valeur dans [-1, 1].
export function softNoise(seed, octaves = 3) {
  const r = rng(seed);
  const waves = Array.from({ length: octaves }, (_, i) => ({ k: i + 2 + r.int(0, 2), p: r.range(0, TAU), w: 1 / (i + 1) }));
  const norm = waves.reduce((s, w) => s + w.w, 0);
  return (t) => waves.reduce((s, w) => s + w.w * Math.sin(w.k * t + w.p), 0) / norm;
}

// Catmull-Rom → courbes de Bézier cubiques passant par tous les points.
export function smoothPath(points, closed = true, tension = 1) {
  const n = points.length;
  if (n < 2) return '';
  const p = (i) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
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

// Ellipse ou cercle tracé à la main : rayon modulé par un bruit doux (amp = fraction du rayon).
export function wobblyEllipse(cx, cy, rx, ry, { seed = 1, amp = 0.012, n = 32, rotate = 0 } = {}) {
  const noise = softNoise(seed);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const k = 1 + amp * noise(a);
    const x = rx * k * Math.cos(a), y = ry * k * Math.sin(a);
    return [cx + x * Math.cos(rotate) - y * Math.sin(rotate), cy + x * Math.sin(rotate) + y * Math.cos(rotate)];
  });
  return smoothPath(pts, true);
}
export const wobblyCircle = (cx, cy, r, opts) => wobblyEllipse(cx, cy, r, r, opts);

// Contour festonné (étiquette, napperon) : n festons bombés vers l'extérieur de « depth ».
export function scallops(cx, cy, rx, ry, n, depth, { rotate = 0 } = {}) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = rotate + (i / n) * TAU, a1 = rotate + ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
    const [x0, y0] = [cx + rx * Math.cos(a0), cy + ry * Math.sin(a0)];
    const [x1, y1] = [cx + rx * Math.cos(a1), cy + ry * Math.sin(a1)];
    // point de contrôle poussé vers l'extérieur pour une demi-lune
    const [qx, qy] = [cx + (rx + depth * 2) * Math.cos(am), cy + (ry + depth * 2) * Math.sin(am)];
    d += (i === 0 ? `M${f(x0)} ${f(y0)}` : '') + `Q${f(qx)} ${f(qy)} ${f(x1)} ${f(y1)}`;
  }
  return d + 'Z';
}

// Tache organique (blob) à n lobes.
export function blob(cx, cy, r, { seed = 1, irregularity = 0.25, n = 9 } = {}) {
  const R = rng(seed);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU + R.range(-0.15, 0.15);
    return polar(cx, cy, r * (1 + R.range(-irregularity, irregularity)), a);
  });
  return smoothPath(pts, true);
}

// Trait tracé à la main entre deux points (légère ondulation perpendiculaire).
export function wobblyLine(x1, y1, x2, y2, { seed = 1, amp = 1.2, segments = 6 } = {}) {
  const R = rng(seed);
  const [dx, dy] = [x2 - x1, y2 - y1];
  const len = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / len, dx / len];
  const pts = Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const o = i === 0 || i === segments ? 0 : R.range(-amp, amp);
    return [x1 + dx * t + nx * o, y1 + dy * t + ny * o];
  });
  return smoothPath(pts, false);
}

// Rectangle tracé à la main.
export function wobblyRect(x, y, w, h, { seed = 1, amp = 1.5 } = {}) {
  const R = rng(seed);
  const j = () => R.range(-amp, amp);
  const pts = [[x + j(), y + j()], [x + w / 2, y + j()], [x + w + j(), y + j()], [x + w + j(), y + h / 2], [x + w + j(), y + h + j()], [x + w / 2, y + h + j()], [x + j(), y + h + j()], [x + j(), y + h / 2]];
  return smoothPath(pts, true, 0.35);
}

// Bord déchiré (bout de washi) : liste de points en dents irrégulières entre deux coins.
export function tornEdge(x1, y1, x2, y2, { seed = 1, amp = 3, step = 5 } = {}) {
  const R = rng(seed);
  const [dx, dy] = [x2 - x1, y2 - y1];
  const len = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / len, dx / len];
  const n = Math.max(2, Math.round(len / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const o = i === 0 || i === n ? 0 : R.range(-amp, amp);
    return [f(x1 + dx * t + nx * o), f(y1 + dy * t + ny * o)];
  });
}

// Bande de washi : rectangle dont les deux petits côtés sont déchirés.
export function washiStrip(w, h, { seed = 1, amp = 2.5 } = {}) {
  const left = tornEdge(0, h, 0, 0, { seed, amp, step: 4 });
  const right = tornEdge(w, 0, w, h, { seed: seed + 7, amp, step: 4 });
  const pts = [...left, ...right];
  return 'M' + pts.map((p) => p.join(' ')).join('L') + 'Z';
}

// Anneau de tache de thé : anneau irrégulier, interrompu par endroits (evenodd).
export function teaRing(cx, cy, r, { seed = 1, width = 0.08 } = {}) {
  const outer = wobblyCircle(cx, cy, r, { seed, amp: 0.05, n: 28 });
  const inner = wobblyCircle(cx + r * 0.02, cy - r * 0.01, r * (1 - width), { seed: seed + 3, amp: 0.06, n: 28 });
  return `${outer} ${inner}`; // à remplir avec fill-rule="evenodd"
}

// Document SVG autonome : viewBox à l'origine, sans largeur ni hauteur fixes, sans commentaire.
export function svgDoc([w, h], body, { id } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${id ? ` id="${id}"` : ''}>${body}</svg>\n`;
}
