// Outils de dessin partagés par le kit de personnages, les accessoires et les décors.
// Style du carnet : contour encre gc-ink irrégulier, aplat + UN ton d'ombre (en bas à droite,
// la lumière vient d'en haut à gauche), hachures à 45° seulement dans les ombres.
import { c } from '../../../scripts/lib/tokens.mjs';
import { rng } from '../../../scripts/lib/prng.mjs';
import { f } from '../../../scripts/lib/organic.mjs';

export { c, rng, f };

// Nombres à une décimale (sous le pixel à l'affichage) : fichiers plus légers.
const r1 = (n) => { const v = Math.round(n * 10) / 10; return Object.is(v, -0) ? 0 : v; };
// Catmull-Rom → Bézier cubiques passant par tous les points (comme organic.smoothPath, à 0,1 près).
export function smoothPath(points, closed = true, tension = 1) {
  const n = points.length;
  if (n < 2) return '';
  const p = (i) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return (closed ? d + 'Z' : d).replace(/ -/g, '-');
}
export const TAU = Math.PI * 2;

// Épaisseurs d'encre à l'échelle d'affichage (unités du viewBox de la scène, échelle 1).
export const STROKE = { main: 3.6, detail: 1.8 };

// Contexte d'un document : préfixe d'ids, définitions (<defs>) partagées, aléatoire à graine.
//   const ctx = createCtx('gc-scene-julie');
//   ctx.id('cup-grad') → 'gc-scene-julie-cup-grad' ; ctx.uid('clip') → 'gc-scene-julie-clip3'
export function createCtx(prefix, { seed = prefix } = {}) {
  const defs = new Map();
  const counters = {};
  return {
    prefix,
    id: (part) => `${prefix}-${part}`,
    uid(part) {
      counters[part] = (counters[part] ?? 0) + 1;
      return `${prefix}-${part}${counters[part]}`;
    },
    rng: (s) => rng(`${seed}:${s}`),
    def(id, markup) {
      if (!defs.has(id)) defs.set(id, markup);
      return `url(#${id})`;
    },
    defs: () => (defs.size ? `<defs>${[...defs.values()].join('')}</defs>` : ''),
  };
}

// ---------- géométrie ----------
export const mirrorX = (pts) => pts.map(([x, y]) => [-x, y]);
export const move = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
export const scalePts = (pts, k, [cx, cy] = [0, 0]) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
export const rotatePts = (pts, deg, [cx, cy] = [0, 0]) => {
  const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * co - (y - cy) * si, cy + (x - cx) * si + (y - cy) * co]);
};
export const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
// Contour symétrique à partir de la moitié droite (du haut vers le bas).
export const sym = (half) => [...half, ...mirrorX(half).reverse()];
export const ellipsePts = (cx, cy, rx, ry, n = 20, rot = 0) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * TAU;
  const x = rx * Math.cos(a), y = ry * Math.sin(a);
  return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
});

// Forme « faite main » : points légèrement bougés, courbe lisse passant par tous les points.
export function shape(pts, R, amp = 1.2, tension = 1) {
  const p = amp && R ? pts.map(([x, y]) => [x + R.range(-amp, amp), y + R.range(-amp, amp)]) : pts;
  return { pts: p, d: smoothPath(p, true, tension) };
}
export function stroke(pts, R, amp = 0.8, tension = 1) {
  const n = pts.length;
  const p = amp && R ? pts.map(([x, y], i) => (i === 0 || i === n - 1 ? [x, y] : [x + R.range(-amp, amp), y + R.range(-amp, amp)])) : pts;
  return smoothPath(p, false, tension);
}

// ---------- tracés ----------
const INK = () => c('gc-ink');
export const inkAttrs = (w, color = INK()) => `stroke="${color}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"`;
export const fillPath = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
export const inkPath = (d, w, extra = '', color) => `<path d="${d}" fill="none" ${inkAttrs(w, color)}${extra}/>`;
export const solidPath = (d, fill, w, extra = '') => `<path d="${d}" fill="${fill}" ${inkAttrs(w)}${extra}/>`;
export const g = (body, attrs = '') => (body ? `<g${attrs ? ' ' + attrs : ''}>${body}</g>` : '');

// Motif de hachures à 45° (pas de 6, gc-chocolate à 30 %), réservé aux ombres.
export function hatch(ctx) {
  const id = ctx.id('hatch');
  return ctx.def(id, `<pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><path d="M3 -1V7" stroke="${c('gc-chocolate', 0.3)}" stroke-width="1.1"/></pattern>`);
}

// Clip sur une forme. Si la forme a déjà été dessinée avec un id (sh.id), le clip la référence
// par <use> au lieu de recopier sa géométrie ; un même clip sert plusieurs fois (sh.clipId).
export function clip(ctx, shOrD) {
  if (typeof shOrD === 'object' && shOrD.clipId) return `clip-path="url(#${shOrD.clipId})"`;
  const id = ctx.uid('c');
  const inner = typeof shOrD === 'object' && shOrD.id ? `<use href="#${shOrD.id}"/>` : `<path d="${typeof shOrD === 'object' ? shOrD.d : shOrD}"/>`;
  ctx.def(id, `<clipPath id="${id}">${inner}</clipPath>`);
  if (typeof shOrD === 'object') shOrD.clipId = id;
  return `clip-path="url(#${id})"`;
}

// Ombre propre : la forme moins sa copie décalée vers la lumière (haut-gauche) → croissant en bas à droite.
//   light = [dx, dy] décalage de la zone éclairée ; k = réduction de la zone éclairée.
export function shadeIn(ctx, sh, { color, light = [-9, -7], k = 1, hatched = false, center, exclude } = {}) {
  const [cx, cy] = center ?? centroid(sh.pts);
  const lit = smoothPath(sh.pts.map(([x, y]) => [cx + (x - cx) * k + light[0], cy + (y - cy) * k + light[1]]), true);
  const big = `M${f(cx - 3000)} ${f(cy - 3000)}H${f(cx + 3000)}V${f(cy + 3000)}H${f(cx - 3000)}Z`;
  let body = `<path d="${big}${lit}" fill="${color}" fill-rule="evenodd"/>`;
  if (hatched) body += `<path d="${big}${lit}" fill="${hatch(ctx)}" fill-rule="evenodd"/>`;
  if (exclude) body = `<g ${clipOut(ctx, exclude)}>${body}</g>`;
  return `<g ${clip(ctx, sh)}>${body}</g>`;
}

// Clip « tout sauf cette forme » (evenodd), mis en cache sur la forme.
export function clipOut(ctx, sh) {
  if (!sh.clipOutId) {
    sh.clipOutId = ctx.uid('x');
    ctx.def(sh.clipOutId, `<clipPath id="${sh.clipOutId}"><path d="M-3000 -3000H3000V3000H-3000Z${sh.d}" clip-rule="evenodd"/></clipPath>`);
  }
  return `clip-path="url(#${sh.clipOutId})"`;
}

// Lumière dorée rasante : liseré clair en haut à gauche de la forme (inverse de l'ombre propre).
export const rimLight = (ctx, sh, { color = c('gc-glow', 0.55), width = 9, exclude } = {}) => shadeIn(ctx, sh, { color, light: [width, width * 0.8], exclude });

// Forme complète : aplat + contour encre (un seul tracé, avec id si une ombre doit s'y découper),
// puis ombre propre par-dessus (découpée dans la forme) et éventuel liseré de lumière.
export function drawShape(ctx, sh, { fill, shade, light, k, hatched, w = STROKE.main, center, inkColor, rim } = {}) {
  const needsId = shade || rim;
  if (needsId && !sh.id) sh.id = ctx.uid('s');
  let out = `<path${needsId ? ` id="${sh.id}"` : ''} d="${sh.d}" fill="${fill}"${w ? ' ' + inkAttrs(w, inkColor) : ''}/>`;
  if (shade) out += shadeIn(ctx, sh, { color: shade, light, k, hatched, center });
  if (rim) out += rimLight(ctx, sh, rim === true ? {} : rim);
  return out;
}

// Ombre portée dessinée (jamais de filtre) : ellipses concentriques à faible opacité, décalées
// vers le bas à droite, + hachures au cœur.
export function castShadow(ctx, cx, cy, rx, ry, { alpha = 0.16, hatched = true, R, rot = 0 } = {}) {
  const col = (a) => c('gc-chocolate', a);
  const r = R ?? rng(`${cx}:${cy}`);
  let out = '';
  [[1.12, alpha * 0.35], [1, alpha * 0.45], [0.86, alpha * 0.6]].forEach(([k, a], i) => {
    const sh = shape(ellipsePts(cx, cy, rx * k, ry * k, 12, rot), r, 1.5);
    out += fillPath(sh.d, col(f(a)));
    if (i === 2 && hatched) out += fillPath(sh.d, hatch(ctx), ' opacity="0.7"');
  });
  return out;
}

// Groupe pivot : un rectangle sans fond centré sur le pivot fixe la boîte englobante
// (transform-box: fill-box ; transform-origin: 50% 50% tombe exactement sur le pivot).
export const pivotBox = ([px, py], half = 700) => `<rect x="${f(px - half)}" y="${f(py - half)}" width="${2 * half}" height="${2 * half}" fill="none"/>`;
