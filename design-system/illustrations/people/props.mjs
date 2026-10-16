// Accessoires de goûter réutilisables : tasse, soucoupe, assiette, part de cake, théière,
// pot de confiture, assiette de biscuits, pile de crêpes, chocolat chaud, citron, vapeur…
// Chaque fonction reçoit le contexte (ctx) et { x, y, scale } : (x, y) = point de pose
// (bas-centre de l'objet), dimensions canoniques à l'échelle 1. Renvoie du balisage SVG.
// Dégradés : uniquement porcelaine, verre et liquides (ids préfixés par le contexte).
import {
  c, f, STROKE, shape, stroke, ellipsePts, fillPath, inkPath, solidPath, drawShape, shadeIn, castShadow,
} from './core.mjs';
import { scallops } from '../../../scripts/lib/organic.mjs';

const W = (scale) => ({ S: STROKE.main / scale, s: STROKE.detail / scale });
const place = (x, y, scale, rot = 0) => `transform="translate(${f(x)} ${f(y)})${rot ? ` rotate(${f(rot)})` : ''}${scale !== 1 ? ` scale(${f(scale)})` : ''}"`;

// ---------- dégradés ----------
export function porcelainGrad(ctx) {
  const id = ctx.id('porcelain');
  return ctx.def(id, `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.25"><stop offset="0" stop-color="${c('gc-honey-100')}"/><stop offset="0.28" stop-color="${c('gc-porcelain')}"/><stop offset="0.62" stop-color="${c('gc-porcelain')}"/><stop offset="1" stop-color="${c('gc-porcelain-shade')}"/></linearGradient>`);
}
export function porcelainInnerGrad(ctx) {
  const id = ctx.id('porcelain-in');
  return ctx.def(id, `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c('gc-porcelain-shade')}"/><stop offset="0.7" stop-color="${c('gc-porcelain')}"/><stop offset="1" stop-color="${c('gc-honey-100')}"/></linearGradient>`);
}
const LIQUIDS = {
  the: ['gc-honey-300', 'gc-tea', 'gc-honey-700'],
  'cafe-au-lait': ['gc-crumb', 'gc-cafe-au-lait', 'gc-chocolate'],
  chocolat: ['gc-cafe-au-lait', 'gc-chocolate', 'gc-ink'],
  confiture: ['gc-pink-500', 'gc-jam', 'gc-pink-700'],
};
export function liquidGrad(ctx, liquid = 'the') {
  const id = ctx.id(`liquid-${liquid}`);
  const [a, b, d] = LIQUIDS[liquid] ?? LIQUIDS.the;
  return ctx.def(id, `<radialGradient id="${id}" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="${c(a)}"/><stop offset="0.5" stop-color="${c(b)}"/><stop offset="1" stop-color="${c(d)}"/></radialGradient>`);
}
export function glassGrad(ctx) {
  const id = ctx.id('glass');
  return ctx.def(id, `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="${c('gc-paper-lace')}" stop-opacity="0.75"/><stop offset="0.35" stop-color="${c('gc-sage-100')}" stop-opacity="0.35"/><stop offset="1" stop-color="${c('gc-sage-300')}" stop-opacity="0.45"/></linearGradient>`);
}

// ---------- petits motifs ----------
// Petite rose de porcelaine (décor de tasse, théière).
export function rosette(x, y, r, R, s) {
  const petal = shape(ellipsePts(x, y, r, r * 0.86, 7), R, r * 0.08);
  const leafL = shape([[x - r * 0.7, y + r * 0.5], [x - r * 1.9, y + r * 0.7], [x - r * 1.2, y + r * 1.1]], R, 0);
  const leafR = shape([[x + r * 0.7, y + r * 0.55], [x + r * 1.8, y + r * 0.5], [x + r * 1.25, y + r * 1.05]], R, 0);
  return fillPath(leafL.d, c('gc-sage-500')) + fillPath(leafR.d, c('gc-sage-500'))
    + fillPath(petal.d, c('gc-pink-300'))
    + inkPath(stroke([[x - r * 0.35, y + r * 0.1], [x, y - r * 0.4], [x + r * 0.4, y], [x, y + r * 0.35], [x - r * 0.15, y]], R, 0), s * 0.8, '', c('gc-pink-500'));
}

// Vapeur : volutes animables (classe gc-anim-steam sur chaque volute).
export function steam(ctx, { x, y, scale = 1, n = 3, h = 86, anim = true }) {
  const R = ctx.rng(`steam${x}${y}`);
  let out = '';
  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * 18 + R.range(-3, 3);
    const hh = h * (i === 1 ? 1 : 0.78);
    const sgn = i % 2 ? 1 : -1;
    const pts = [[ox, 0], [ox + sgn * 8, -hh * 0.25], [ox - sgn * 7, -hh * 0.52], [ox + sgn * 6, -hh * 0.78], [ox - sgn * 2, -hh]];
    const d = stroke(pts, R, 1.2);
    out += `<g${anim ? ' class="gc-anim-steam"' : ''}><path d="${d}" fill="none" stroke="${c('gc-paper-lace', 0.85)}" stroke-width="7" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${c('gc-porcelain')}" stroke-width="2.6" stroke-linecap="round" opacity="0.9"/></g>`;
  }
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// ---------- tasse à thé ----------
// (x, y) = centre du bord de la tasse. handle : 'right' | 'left'. tilt : rotation (degrés).
export function teacup(ctx, { x, y, scale = 1, liquid = 'the', handle = 'right', rotate = 0, decor = 'roses', band = 'gc-honey-500' }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`cup${x}${y}`);
  const hs = handle === 'left' ? -1 : 1;
  const rx = 44, ry = 12, h = 56;
  // anse : tube encré
  const hd = stroke([[hs * 38, 8], [hs * 62, 6], [hs * 66, 24], [hs * 54, 40], [hs * 32, 42]], R, 0.6);
  let out = `<path d="${hd}" fill="none" ${`stroke="${c('gc-ink')}" stroke-width="${f(10 + 2 * S)}" stroke-linecap="round"`}/>`;
  out += `<path d="${hd}" fill="none" stroke="${c('gc-porcelain')}" stroke-width="10" stroke-linecap="round"/>`;
  // corps
  const body = shape([[-rx, 0], [-rx + 1, 16], [-rx + 9, 36], [-22, h - 4], [0, h], [22, h - 4], [rx - 9, 36], [rx - 1, 16], [rx, 0], [24, -ry + 1], [0, -ry], [-24, -ry + 1]], R, 0.6, 0.9);
  out += drawShape(ctx, body, { fill: porcelainGrad(ctx), w: S });
  // pied
  out += solidPath(shape(ellipsePts(0, h + 1, 22, 5, 10), R, 0.4).d, c('gc-porcelain-shade'), s);
  // décor
  if (decor === 'roses') out += rosette(-18, 24, 6.5, R, s) + rosette(8, 27, 7.5, R, s) + rosette(30, 22, 5, R, s);
  else if (decor === 'pois') for (const [dx, dy] of [[-24, 18], [-4, 26], [16, 22], [30, 34], [-14, 40], [6, 42]]) out += fillPath(shape(ellipsePts(dx, dy, 3.4, 3.4, 6), R, 0.3).d, c('gc-pink-300'));
  // reflet en haut à gauche
  out += inkPath(stroke([[-34, 8], [-32, 22], [-26, 34]], R, 0.4), 4, '', c('gc-paper-lace', 0.95));
  // ouverture + liquide
  const rim = shape(ellipsePts(0, 0, rx, ry, 22), R, 0.4);
  out += fillPath(rim.d, porcelainInnerGrad(ctx));
  out += fillPath(shape(ellipsePts(0, 2.5, rx - 6, ry - 3.5, 18), R, 0.3).d, liquidGrad(ctx, liquid));
  out += inkPath(shape(ellipsePts(-12, 1.5, 9, 2, 10), R, 0.2).d, 2, ' opacity="0.7"', c('gc-honey-100'));
  out += inkPath(rim.d, S);
  out += inkPath(stroke(ellipsePts(0, 0, rx - 3, ry - 2.2, 24).slice(2, 11), R, 0.2), 2.2, '', c(band));
  return `<g ${place(x, y, scale, rotate)}>${out}</g>`;
}

// Soucoupe. (x, y) = centre.
export function saucer(ctx, { x, y, scale = 1, shadow = true, spoon = false }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`saucer${x}${y}`);
  let out = shadow ? castShadow(ctx, 14, 12, 82, 20, { R }) : '';
  const under = shape([[-74, 2], [-60, 14], [-30, 20], [0, 21], [30, 20], [60, 14], [74, 2], [60, -6], [0, -9], [-60, -6]], R, 0.5);
  out += drawShape(ctx, under, { fill: c('gc-porcelain-shade'), w: S });
  const top = shape(ellipsePts(0, -2, 74, 18, 24), R, 0.5);
  out += drawShape(ctx, top, { fill: porcelainGrad(ctx), w: S });
  out += inkPath(shape(ellipsePts(0, -1, 38, 9, 18), R, 0.3).d, s, ' opacity="0.8"');
  out += inkPath(shape(ellipsePts(0, -2, 66, 14.5, 24), R, 0.3).d, 2.2, '', c('gc-honey-500'));
  if (spoon) out += teaspoon(ctx, { x: 20, y: -2, scale: 1, rotate: -12 });
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// Petite cuillère. (x, y) = centre du cuilleron.
export function teaspoon(ctx, { x, y, scale = 1, rotate = 0 }) {
  const { s } = W(scale);
  const R = ctx.rng(`spoon${x}${y}`);
  const bowl = shape(ellipsePts(0, 0, 12, 6.5, 12), R, 0.3);
  const handle = shape([[10, -2], [60, -6], [70, -7], [72, -3], [62, -2], [10, 3]], R, 0.3);
  return `<g ${place(x, y, scale, rotate)}>${solidPath(handle.d, c('gc-porcelain-shade'), s)}${solidPath(bowl.d, c('gc-porcelain-shade'), s)}${inkPath(stroke([[-6, -2], [2, -3.5]], R, 0), 2, '', c('gc-paper-lace'))}</g>`;
}

// Fourchette à dessert, pointes vers +x. (x, y) = bout du manche.
export function fork(ctx, { x, y, scale = 1, rotate = 0 }) {
  const { s } = W(scale);
  const R = ctx.rng(`fork${x}${y}`);
  const handle = shape([[0, -3], [52, -4], [62, -6], [70, -7], [70, 7], [62, 6], [52, 4], [0, 4]], R, 0.3, 0.6);
  let out = solidPath(handle.d, c('gc-porcelain-shade'), s);
  for (const ty of [-5, 0, 5]) out += solidPath(shape([[68, ty - 1.6], [96, ty - 1.2], [96, ty + 1.2], [68, ty + 1.6]], R, 0.2, 0.4).d, c('gc-porcelain-shade'), s * 0.8);
  out += inkPath(stroke([[6, -1], [44, -2]], R, 0), 1.6, '', c('gc-paper-lace'));
  return `<g ${place(x, y, scale, rotate)}>${out}</g>`;
}

// Assiette à dessert festonnée, filet or. (x, y) = centre.
export function plate(ctx, { x, y, scale = 1, rx = 120, ry = 36, shadow = true }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`plate${x}${y}`);
  let out = shadow ? castShadow(ctx, 18, 14, rx * 1.04, ry * 1.1, { R }) : '';
  const under = shape([[-rx, 2], [-rx * 0.8, ry * 0.55], [-rx * 0.4, ry * 0.85], [0, ry * 0.92], [rx * 0.4, ry * 0.85], [rx * 0.8, ry * 0.55], [rx, 2], [0, -ry * 0.5]], R, 0.5);
  out += drawShape(ctx, under, { fill: c('gc-porcelain-shade'), w: S });
  const edge = { d: scallops(0, -3, rx - 3, ry - 3, 28, 1.6), pts: ellipsePts(0, -3, rx, ry, 24) };
  out += fillPath(edge.d, porcelainGrad(ctx)) + inkPath(edge.d, S);
  out += inkPath(shape(ellipsePts(0, -2, rx * 0.66, ry * 0.6, 22), R, 0.4).d, s, ' opacity="0.75"');
  out += inkPath(shape(ellipsePts(0, -3, rx * 0.88, ry * 0.8, 26), R, 0.3).d, 2.2, '', c('gc-honey-500'));
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// Part de cake debout, face coupée vers nous. kind : 'citron' (glaçage + zestes + pavot), 'marbre', 'chocolat'.
// (x, y) = milieu de la base.
export function cakeSlice(ctx, { x, y, scale = 1, kind = 'citron' }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`cake${x}${y}${kind}`);
  const crumb = kind === 'chocolat' ? c('gc-chocolate') : c('gc-crumb');
  const crust = kind === 'chocolat' ? c('gc-ink') : c('gc-crust');
  let out = '';
  // côté (profondeur), dans l'ombre, à droite
  const side = shape([[64, -2], [92, -16], [94, -70], [84, -92], [62, -84]], R, 0.6, 0.7);
  out += drawShape(ctx, side, { fill: crust, shade: c('gc-chocolate', 0.28), light: [-30, 0], hatched: true, w: S });
  // dessus (dôme vu d'en haut)
  const top = shape([[-60, -84], [-30, -100], [10, -104], [50, -98], [66, -86], [88, -94], [64, -110], [24, -118], [-18, -114], [-48, -100]], R, 0.6);
  out += drawShape(ctx, top, { fill: crust, w: S });
  // face coupée : croûte puis mie en retrait
  const faceOuter = shape([[-68, 0], [-71, -36], [-66, -76], [-38, -96], [6, -102], [46, -94], [66, -80], [70, -38], [68, 0]], R, 0.6);
  out += fillPath(faceOuter.d, crust);
  const faceIn = shape([[-60, -5], [-62, -36], [-58, -70], [-34, -86], [6, -91], [42, -85], [58, -72], [61, -38], [59, -5]], R, 0.8);
  out += fillPath(faceIn.d, crumb);
  if (kind === 'marbre') out += fillPath(shape([[-50, -20], [-20, -50], [10, -40], [40, -70], [50, -50], [10, -20], [-20, -30]], R, 1.5).d, c('gc-chocolate', 0.85));
  // alvéoles et graines de pavot
  let holes = '';
  for (let i = 0; i < 24; i++) holes += `<ellipse cx="${R.range(-54, 54).toFixed(0)}" cy="${R.range(-80, -10).toFixed(0)}" rx="${R.range(1.4, 3.2).toFixed(1)}" ry="${R.range(1, 2.2).toFixed(1)}"/>`;
  out += `<g fill="${c('gc-crust', 0.55)}">${holes}</g>`;
  if (kind === 'citron') {
    let seeds = '';
    for (let i = 0; i < 30; i++) seeds += `<circle cx="${R.range(-55, 55).toFixed(0)}" cy="${R.range(-82, -8).toFixed(0)}" r="1.3"/>`;
    out += `<g fill="${c('gc-ink', 0.8)}">${seeds}</g>`;
  }
  out += shadeIn(ctx, faceOuter, { color: c('gc-chocolate', 0.12), light: [-14, -10] });
  out += inkPath(faceOuter.d, S);
  // glaçage citron qui coule
  if (kind === 'citron') {
    const glaze = shape([[-70, -74], [-62, -60], [-58, -66], [-52, -50], [-44, -48], [-40, -70], [-16, -86], [-8, -66], [0, -62], [6, -84], [30, -88], [38, -72], [44, -76], [50, -88], [66, -78], [74, -82], [90, -90], [92, -98], [68, -114], [24, -122], [-20, -118], [-56, -104], [-70, -90]], R, 0.8, 0.85);
    out += drawShape(ctx, glaze, { fill: c('gc-paper-lace'), shade: c('gc-honey-300', 0.35), light: [-6, -6], w: s * 1.3 });
    let zest = ['', ''];
    for (let i = 0; i < 16; i++) {
      const px = R.range(-50, 70), py = R.range(-112, -92);
      zest[i % 2] += `M${px.toFixed(0)} ${py.toFixed(0)}l${R.range(2, 5).toFixed(1)} ${R.range(-2, 2).toFixed(1)}`;
    }
    out += `<path d="${zest[0]}" ${`stroke="${c('gc-honey-500')}"`} stroke-width="2.4" stroke-linecap="round"/><path d="${zest[1]}" stroke="${c('gc-honey-300')}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// Rondelle et demi-citron. (x, y) = centre.
export function lemon(ctx, { x, y, scale = 1, kind = 'entier', rotate = 0 }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`lemon${x}${y}${kind}`);
  let out = '';
  if (kind === 'entier') {
    const sh = shape([[-40, 0], [-34, -16], [-12, -26], [14, -26], [34, -16], [42, -2], [50, 0], [42, 4], [34, 16], [12, 24], [-14, 24], [-34, 14], [-44, 2]], R, 0.6);
    out += drawShape(ctx, sh, { fill: c('gc-honey-300'), shade: c('gc-honey-700', 0.3), light: [-8, -8], w: S });
    out += inkPath(stroke([[-22, -14], [-6, -19]], R, 0), 3.5, '', c('gc-honey-100'));
    for (let i = 0; i < 8; i++) out += `<circle cx="${f(R.range(-26, 30))}" cy="${f(R.range(-14, 16))}" r="0.9" fill="${c('gc-honey-700', 0.5)}"/>`;
    out += solidPath(shape([[-46, 0], [-52, -3], [-52, 3]], R, 0.2).d, c('gc-sage-500'), s);
  } else {
    // rondelle vue de face (tranche)
    const rind = shape(ellipsePts(0, 0, 30, 30, 20), R, 0.5);
    out += drawShape(ctx, rind, { fill: c('gc-honey-500'), w: S });
    out += fillPath(shape(ellipsePts(0, 0, 25, 25, 18), R, 0.3).d, c('gc-paper-lace'));
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 + 0.06, a1 = ((i + 1) / 8) * Math.PI * 2 - 0.06;
      const pts = [[0, 0], [22 * Math.cos(a0), 22 * Math.sin(a0)], [23 * Math.cos((a0 + a1) / 2), 23 * Math.sin((a0 + a1) / 2)], [22 * Math.cos(a1), 22 * Math.sin(a1)]];
      out += fillPath(shape(pts, R, 0.3, 0.6).d, c('gc-honey-300'));
    }
    out += shadeIn(ctx, rind, { color: c('gc-honey-700', 0.25), light: [-6, -6] });
  }
  return `<g ${place(x, y, scale, rotate)}>${out}</g>`;
}

// Théière ronde fleurie. (x, y) = milieu de la base.
export function teapot(ctx, { x, y, scale = 1, shadow = true, decor = 'roses' }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`teapot${x}${y}`);
  let out = shadow ? castShadow(ctx, 30, 2, 128, 26, { R }) : '';
  // anse
  const hd = stroke([[90, -118], [134, -128], [158, -100], [146, -58], [100, -44]], R, 0.8);
  out += `<path d="${hd}" fill="none" stroke="${c('gc-ink')}" stroke-width="${f(16 + 2 * S)}" stroke-linecap="round"/><path d="${hd}" fill="none" stroke="${c('gc-porcelain-shade')}" stroke-width="16" stroke-linecap="round"/>`;
  // bec
  const spout = shape([[-92, -52], [-118, -70], [-140, -104], [-156, -134], [-172, -144], [-166, -130], [-150, -96], [-128, -54], [-100, -24]], R, 0.6, 0.8);
  out += drawShape(ctx, spout, { fill: porcelainGrad(ctx), w: S });
  // corps
  const body = shape([[-88, -6], [-106, -46], [-104, -96], [-82, -128], [-40, -146], [0, -150], [40, -146], [82, -128], [104, -96], [106, -46], [88, -6], [50, 4], [0, 6], [-50, 4]], R, 0.8);
  out += drawShape(ctx, body, { fill: porcelainGrad(ctx), shade: c('gc-chocolate', 0.08), light: [-16, -10], w: S });
  out += inkPath(stroke([[-84, -96], [-74, -118], [-52, -134]], R, 0.4), 6, '', c('gc-paper-lace', 0.95));
  // décor : couronne de roses + filet or
  if (decor === 'roses') {
    out += inkPath(stroke([[-98, -60], [-50, -48], [0, -45], [50, -48], [98, -60]], R, 1), 2.4, '', c('gc-sage-500'));
    for (const [rx_, ry_, rr] of [[-62, -56, 10], [-22, -50, 13], [20, -50, 11], [60, -56, 9]]) out += rosette(rx_, ry_, rr, R, s);
  }
  out += inkPath(stroke([[-80, -126], [-40, -140], [0, -143], [40, -140], [80, -126]], R, 0.5), 2.6, '', c('gc-honey-500'));
  // couvercle
  const lid = shape([[-58, -138], [-44, -160], [-14, -172], [14, -172], [44, -160], [58, -138], [0, -132]], R, 0.6);
  out += drawShape(ctx, lid, { fill: porcelainGrad(ctx), shade: c('gc-chocolate', 0.08), light: [-10, -6], w: S });
  const knob = shape(ellipsePts(0, -182, 13, 12, 14), R, 0.5);
  out += drawShape(ctx, knob, { fill: porcelainGrad(ctx), w: S });
  out += inkPath(stroke([[-6, -186], [-3, -190]], R, 0), 3, '', c('gc-paper-lace'));
  out += inkPath(stroke([[-48, -150], [0, -158], [48, -150]], R, 0.4), 2.2, '', c('gc-honey-500'));
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// Pot de confiture en verre, couvercle tissu vichy. (x, y) = milieu de la base.
export function jamJar(ctx, { x, y, scale = 1, liquid = 'confiture', cloth = 'gc-terracotta-100', label = true }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`jar${x}${y}`);
  let out = '';
  const jar = shape([[-34, 0], [-38, -20], [-38, -62], [-32, -72], [32, -72], [38, -62], [38, -20], [34, 0], [0, 3]], R, 0.6, 0.8);
  const jam = shape([[-32, -3], [-35, -20], [-35, -58], [35, -58], [35, -20], [32, -3], [0, 0]], R, 0.5, 0.8);
  out += fillPath(jam.d, liquidGrad(ctx, liquid));
  out += fillPath(jar.d, glassGrad(ctx)) + inkPath(jar.d, S);
  out += inkPath(stroke([[-28, -56], [-29, -30], [-26, -12]], R, 0.4), 4, '', c('gc-paper-lace', 0.85));
  if (label) {
    const lab = shape([[-22, -40], [22, -42], [23, -22], [-21, -20]], R, 0.6, 0.5);
    out += solidPath(lab.d, c('gc-paper-lace'), s);
    out += inkPath(stroke([[-14, -31], [14, -32]], R, 0.5), 1.6, ' opacity="0.7"');
  }
  // tissu
  const cl = shape([[-44, -64], [-48, -80], [-30, -94], [0, -98], [30, -94], [48, -80], [44, -64], [30, -58], [16, -64], [0, -58], [-16, -64], [-30, -58]], R, 0.8);
  out += drawShape(ctx, cl, { fill: c(cloth), shade: c('gc-chocolate', 0.14), light: [-8, -6], w: S });
  for (const vx of [-30, -10, 10, 30]) out += inkPath(stroke([[vx, -94], [vx * 1.1, -62]], R, 0.6), 4, '', c('gc-terracotta-300', 0.6));
  out += inkPath(stroke([[-44, -72], [0, -66], [44, -72]], R, 0.6), 2.4, '', c('gc-kraft'));
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// Assiette de biscuits (sablés festonnés et cookies). (x, y) = centre de l'assiette.
export function biscuitPlate(ctx, { x, y, scale = 1 }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`bisc${x}${y}`);
  let out = plate(ctx, { x: 0, y: 0, scale: 1, rx: 110, ry: 32 });
  const items = [[-48, -10, 'sable'], [10, -14, 'cookie'], [56, -6, 'sable'], [-14, -2, 'cookie'], [30, 2, 'sable']];
  for (const [bx, by, kind] of items) {
    if (kind === 'sable') {
      const sh = { d: scallops(bx, by - 8, 26, 12, 12, 1.4), pts: ellipsePts(bx, by - 8, 27, 13, 16) };
      out += fillPath(sh.d, c('gc-crust')) + inkPath(sh.d, s * 1.4);
      out += fillPath(shape(ellipsePts(bx, by - 9, 9, 4, 10), R, 0.3).d, c('gc-jam'));
    } else {
      const sh = shape(ellipsePts(bx, by - 8, 26, 12, 14), R, 1.2);
      out += drawShape(ctx, sh, { fill: c('gc-crust'), shade: c('gc-chocolate', 0.18), light: [-4, -3], w: s * 1.4 });
      for (let i = 0; i < 5; i++) out += fillPath(shape(ellipsePts(bx + R.range(-16, 16), by - 8 + R.range(-6, 6), 3, 2, 6), R, 0.3).d, c('gc-chocolate'));
    }
  }
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// Pile de crêpes pliées en quatre, coulis et sucre. (x, y) = centre de l'assiette.
export function crepeStack(ctx, { x, y, scale = 1, topping = 'confiture' }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`crepe${x}${y}`);
  let out = plate(ctx, { x: 0, y: 0, scale: 1, rx: 116, ry: 34 });
  for (let i = 0; i < 4; i++) {
    const yy = -8 - i * 9;
    const sh = shape([[-80, yy + 4], [-74, yy - 14], [-30, yy - 26], [30, yy - 26], [76, yy - 14], [82, yy + 4], [40, yy + 10], [-40, yy + 10]], R, 1.6);
    out += drawShape(ctx, sh, { fill: c('gc-crumb'), shade: c('gc-crust', 0.6), light: [-6, -5], w: s * 1.5 });
    for (let k = 0; k < 4; k++) out += fillPath(shape(ellipsePts(R.range(-60, 60), yy - R.range(4, 18), 4, 2, 6), R, 0.4).d, c('gc-crust', 0.7));
  }
  if (topping === 'confiture') {
    const drip = shape([[-40, -46], [-10, -54], [30, -50], [44, -40], [40, -24], [34, -30], [28, -18], [18, -34], [-4, -38], [-14, -26], [-22, -40]], R, 1);
    out += drawShape(ctx, drip, { fill: liquidGrad(ctx, 'confiture'), w: s * 1.4 });
  }
  for (let i = 0; i < 18; i++) out += `<circle cx="${f(R.range(-60, 60))}" cy="${f(R.range(-60, -40))}" r="1.3" fill="${c('gc-porcelain')}"/>`;
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// Chocolat chaud dans un gros bol/mug, chantilly et guimauves. (x, y) = centre du bord.
export function mug(ctx, { x, y, scale = 1, liquid = 'chocolat', color = 'gc-sage-500', cream = true, handle = 'right' }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`mug${x}${y}`);
  const hs = handle === 'left' ? -1 : 1;
  const rx = 46, ry = 13, h = 84;
  const hd = stroke([[hs * 42, 16], [hs * 70, 18], [hs * 72, 50], [hs * 44, 62]], R, 0.6);
  let out = `<path d="${hd}" fill="none" stroke="${c('gc-ink')}" stroke-width="${f(12 + 2 * S)}" stroke-linecap="round"/><path d="${hd}" fill="none" stroke="${c(color)}" stroke-width="12" stroke-linecap="round"/>`;
  const body = shape([[-rx, 0], [-rx, 40], [-rx + 4, h - 10], [-30, h], [0, h + 2], [30, h], [rx - 4, h - 10], [rx, 40], [rx, 0], [0, -ry]], R, 0.6, 0.8);
  out += drawShape(ctx, body, { fill: c(color), shade: c('gc-chocolate', 0.2), light: [-14, -4], hatched: true, w: S });
  out += inkPath(stroke([[-36, 12], [-36, 44]], R, 0.4), 5, '', c('gc-paper-lace', 0.6));
  const rim = shape(ellipsePts(0, 0, rx, ry, 22), R, 0.4);
  out += fillPath(rim.d, porcelainInnerGrad(ctx));
  out += fillPath(shape(ellipsePts(0, 3, rx - 6, ry - 4, 18), R, 0.3).d, liquidGrad(ctx, liquid));
  out += inkPath(rim.d, S);
  if (cream) {
    const cr = shape([[-34, 2], [-38, -12], [-22, -26], [-6, -24], [2, -40], [16, -30], [30, -26], [38, -8], [32, 4], [0, 8]], R, 1);
    out += drawShape(ctx, cr, { fill: c('gc-paper-lace'), shade: c('gc-porcelain-shade'), light: [-6, -6], w: s * 1.4 });
    out += inkPath(stroke([[-20, -10], [-4, -18], [12, -12]], R, 0.5), s, ' opacity="0.6"');
    for (const [mx, my, col] of [[-26, -2, 'gc-pink-300'], [22, -4, 'gc-paper-lace'], [8, 2, 'gc-pink-100']]) out += solidPath(shape([[mx - 8, my - 6], [mx + 8, my - 7], [mx + 9, my + 5], [mx - 8, my + 6]], R, 0.6, 0.5).d, c(col), s);
  }
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// Petit vase en verre avec un bouquet (tiges sauge, fleurs rose poudré). (x, y) = milieu de la base.
export function posy(ctx, { x, y, scale = 1 }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`posy${x}${y}`);
  let out = castShadow(ctx, 22, 2, 46, 12, { R });
  const stems = [[-30, -150], [-12, -170], [8, -162], [26, -146], [-40, -120], [36, -120], [0, -140]];
  for (const [sx, sy] of stems) out += inkPath(stroke([[0, -40], [sx * 0.4, (sy - 40) / 2], [sx, sy]], R, 2), 2.4, '', c('gc-sage-700'));
  for (const [sx, sy] of stems) {
    const lf = shape([[sx * 0.55, (sy - 40) * 0.55], [sx * 0.55 + 16, (sy - 40) * 0.55 - 10], [sx * 0.55 + 4, (sy - 40) * 0.55 + 2]], R, 0.5);
    out += fillPath(lf.d, c('gc-sage-500'));
  }
  stems.forEach(([sx, sy], i) => {
    const col = i % 3 === 0 ? 'gc-paper-lace' : i % 3 === 1 ? 'gc-pink-300' : 'gc-pink-500';
    let petals = '';
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + i;
      petals += `<circle cx="${(sx + 7 * Math.cos(a)).toFixed(1)}" cy="${(sy + 7 * Math.sin(a)).toFixed(1)}" r="${R.range(5.4, 6.4).toFixed(1)}"/>`;
    }
    out += `<g fill="${c(col)}" stroke="${c('gc-ink', 0.5)}" stroke-width="0.8">${petals}</g><circle cx="${f(sx)}" cy="${f(sy)}" r="3.4" fill="${c('gc-honey-500')}"/>`;
  });
  const v = shape([[-22, 0], [-28, -24], [-22, -44], [-14, -54], [14, -54], [22, -44], [28, -24], [22, 0], [0, 2]], R, 0.5);
  out += fillPath(shape([[-24, -2], [-26, -24], [-20, -36], [20, -36], [26, -24], [24, -2]], R, 0.5).d, c('gc-sage-100', 0.8));
  out += fillPath(v.d, glassGrad(ctx)) + inkPath(v.d, S);
  out += inkPath(stroke([[-18, -40], [-20, -16]], R, 0.3), 3.5, '', c('gc-paper-lace', 0.9));
  return `<g ${place(x, y, scale)}>${out}</g>`;
}

// Miettes (petits éclats de croûte).
export function crumbs(ctx, { x, y, n = 8, spread = 40 }) {
  const R = ctx.rng(`crumbs${x}${y}`);
  let out = '';
  for (let i = 0; i < n; i++) {
    const px = x + R.range(-spread, spread), py = y + R.range(-spread * 0.3, spread * 0.3);
    out += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${R.range(1.6, 3.4).toFixed(1)}" ry="${R.range(1.2, 2.4).toFixed(1)}" fill="${c(R.next() > 0.4 ? 'gc-crust' : 'gc-crumb')}"/>`;
  }
  return out;
}

// Serviette de lin pliée, liseré terracotta. (x, y) = centre.
export function napkin(ctx, { x, y, scale = 1, rotate = -8, stripe = 'gc-terracotta-500' }) {
  const { S, s } = W(scale);
  const R = ctx.rng(`napkin${x}${y}`);
  const sh = shape([[-80, -24], [70, -30], [86, 22], [-70, 28]], R, 1.2, 0.35);
  let out = castShadow(ctx, 10, 8, 86, 30, { R, alpha: 0.1, hatched: false });
  out += drawShape(ctx, sh, { fill: c('gc-linen'), shade: c('gc-linen-shade'), light: [-6, -5], w: S });
  out += inkPath(stroke([[-72, -14], [72, -20]], R, 0.6), 4, '', c(stripe, 0.75));
  out += inkPath(stroke([[-70, -6], [74, -12]], R, 0.6), 1.6, '', c(stripe, 0.6));
  out += inkPath(stroke([[-10, -26], [-6, 26]], R, 1), s, ' opacity="0.45"');
  return `<g ${place(x, y, scale, rotate)}>${out}</g>`;
}
