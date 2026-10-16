// Cloche à gâteau — écrin PILOTE : référence de style et de contrat pour les six autres écrins.
//
//   node scripts/gen-svg.mjs ecrins/cloche   →   ecrin.json + <v>/{back,front,mask,dome}.svg
//
// Organisation (à reprendre telle quelle pour un nouvel écrin) :
//   1. GÉOMÉTRIE  viewBox, échelle d'affichage, épaisseurs d'encre et L'OUVERTURE, définie une seule fois :
//                 toutes les autres cotes (anneau, plateau, dôme, pied) en dérivent.
//   2. VARIANTES  table de paramètres (couleurs, graine, petits décors) ; ajouter b ou c = ajouter une ligne.
//   3. OUTILS     couleurs tirées des tokens, ids préfixés, arcs « faits main », ombres en formes, hachures.
//   4. PIÈCES     une fonction par objet dessiné (ombres, pied, plateau, anneau, dôme…) → balisage SVG.
//   5. FICHIERS   assemble back / front / mask / dome, vérifie les invariants du contrat, écrit le manifeste.
//
// Ordre d'empilement dans l'écrin (composant Ecrin) :
//   back.svg → vidéo (masquée par mask.svg) → front.svg → dome.svg → tasse → légende
// Le groupe .gc-anim-lift de back.svg (arrière du bord du dôme) suit le dôme quand il se soulève :
// même transformation CSS que le calque du dôme (manifest.lift, pivot = centre de l'ouverture).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { c } from '../../../scripts/lib/tokens.mjs';
import { blob, f, smoothPath, softNoise, svgDoc, wobblyEllipse } from '../../../scripts/lib/organic.mjs';
import { rng } from '../../../scripts/lib/prng.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID = 'cloche';
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

// ───────────────────────────── 1. GÉOMÉTRIE ─────────────────────────────
const W = 800;
const H = 1000;
// Échelle d'affichage visée : l'écrin fait ≈ 860 px de haut sur la page TV (1000 unités).
// Les épaisseurs d'encre du contrat (3 px, 1,5 px pour les détails) sont converties en unités.
const DISPLAY = 0.86;
const INK = 3 / DISPLAY; // 3,49 u
const INK_FINE = 1.5 / DISPLAY; // 1,74 u
const GLASS_INK = INK * 0.78; // contour « fin » du verre
// Vue légèrement plongeante : rapport ry / rx de toute ellipse posée à plat (plateau, bord du dôme, pied).
const K = 0.09;

// L'OUVERTURE — seule définition. Masque, anneau et manifeste la réutilisent.
const APERTURE = { shape: 'circle', cx: 400, cy: 470, r: 220 };
const BLEED = 4;
const FOCUS = [0.5, 0.42];
const A = APERTURE;

// Anneau (front.svg) : recouvre la bande de débord [r, r + BLEED] avec de la marge des deux côtés.
const RING = { inner: A.r - 2, outer: A.r + 10, filet: A.r + 4.5 };
// Plateau : la vidéo est posée dessus comme un gâteau ; son bas plonge de 14 u sous la ligne médiane du plateau.
const PLATE = { cx: A.cx, cy: A.cy + A.r - 14, rx: A.r + 90, band: 15, festoons: 40, festoonDepth: 5 };
PLATE.ry = PLATE.rx * K;
const BAND_BOTTOM = PLATE.cy + PLATE.ry + PLATE.band; // bas du chant du plateau, à l'avant
// Bord avant du plateau qui passe devant la base de la vidéo (front.svg) : arc bas de cette ellipse.
const CUT = { cx: A.cx, cy: PLATE.cy - 8, rx: RING.outer + 6, ry: 10 };
// Dôme : calotte super-elliptique concentrique à la vidéo, parois presque droites, léger évasement au bord.
const DOME = { cx: A.cx, cy: A.cy, R: RING.outer + 28, n: 2.25, flare: 6 };
DOME.top = DOME.cy - DOME.R;
DOME.rim = { cx: A.cx, cy: PLATE.cy, rx: DOME.R + DOME.flare, ry: (DOME.R + DOME.flare) * K };
DOME.lip = 4; // hauteur visible du bourrelet de verre au bord
const KNOB = { cx: A.cx, neckTop: DOME.top - 12, ballCy: DOME.top - 35, rx: 27, ry: 23 };
// Pied du présentoir : profil (demi-largeur, y) du haut (caché sous le chant) jusqu'au bord du pied.
const FOOT = { cx: A.cx, cy: BAND_BOTTOM + 100, rx: 118, band: 9 };
FOOT.ry = FOOT.rx * K;
const Y0 = BAND_BOTTOM;
const PEDESTAL = [
  [76, Y0 - 9], [64, Y0 + 2], [41, Y0 + 14], [26, Y0 + 27], // évasement sous le plateau, col
  [31, Y0 + 38], [31, Y0 + 44], [24, Y0 + 54], // bague (nœud)
  [19, Y0 + 66], [26, Y0 + 79], [54, FOOT.cy - 5], [94, FOOT.cy + 1], [FOOT.rx, FOOT.cy + 6], // pied évasé
];
const KNOP = { top: Y0 + 37, bottom: Y0 + 45, hw: 31 };
// Tasse (centre du bas de la soucoupe), posée sur la table en bas à droite ; légende sous l'écrin.
const CUP = { x: 690, y: 906 };
const CAPTION = { x: 96, y: 878, w: 470, rotate: -2 };
// Dôme soulevé : pivote de `rotate` degrés autour du centre de l'ouverture, puis se déplace de (dx, dy).
// Petit soulèvement penché : le bord passe sous le visage (bas de la vidéo), le côté gauche s'ouvre vers la lumière.
const LIFT = { dx: 22, dy: -132, rotate: 8 };

// ───────────────────────────── 2. VARIANTES ─────────────────────────────
// Une ligne par variante. Seule « a » est fabriquée pour l'instant ; exemples prêts à décommenter.
const VARIANTS = [
  {
    id: 'a',
    label: 'Porcelaine et filet doré',
    seed: 11,
    porcelain: ['gc-porcelain', 'gc-porcelain-shade'], // présentoir, anneau, bouton : clair, ombre propre
    filet: 'gc-honey-500', // filet doré (plateau, pied, anneau, bague du bouton)
    ribbon: ['gc-terracotta-500', 'gc-terracotta-700'], // nœud au bouton du dôme : aplat, ombre (null = sans nœud)
    crumbs: true, // miettes sur le plateau (visibles quand le dôme se soulève)
    sparkle: true, // petit éclat sur le verre
  },
  // { id: 'b', label: 'Ruban sauge', seed: 23, porcelain: ['gc-porcelain', 'gc-porcelain-shade'], filet: 'gc-honey-500', ribbon: ['gc-sage-500', 'gc-sage-700'], crumbs: false, sparkle: true },
  // { id: 'c', label: 'Liseré rose', seed: 37, porcelain: ['gc-porcelain', 'gc-porcelain-shade'], filet: 'gc-pink-500', ribbon: ['gc-pink-300', 'gc-pink-500'], crumbs: true, sparkle: false },
];

// ───────────────────────────── 3. OUTILS ─────────────────────────────
// Couleur d'un token séparée en couleur + opacité : les attributs rgba() passent mal dans les logiciels de montage.
function paint(name, alpha = 1) {
  const v = c(name);
  const m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (!m) return { color: v, opacity: alpha };
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  return { color: hex, opacity: +(a * alpha).toFixed(3) };
}
const op = (attr, o) => (o < 1 ? ` ${attr}="${+o.toFixed(3)}"` : '');
const fill = (name, alpha = 1) => { const p = paint(name, alpha); return `fill="${p.color}"${op('fill-opacity', p.opacity)}`; };
const ink = (w, name = 'gc-ink', alpha = 1) => {
  const p = paint(name, alpha);
  return `fill="none" stroke="${p.color}" stroke-width="${f(w)}"${op('stroke-opacity', p.opacity)} stroke-linecap="round" stroke-linejoin="round"`;
};
const stop = (offset, name, alpha = 1) => { const p = paint(name, alpha); return `<stop offset="${offset}" stop-color="${p.color}"${op('stop-opacity', p.opacity)}/>`; };
const path = (d, attrs) => `<path d="${d}" ${attrs}/>`;

// Ids uniques dans tout le bundle : gc-cloche-<variante>-<fichier>-<partie>.
const idOf = (v, file) => (part) => `gc-${ID}-${v.id}-${file}-${part}`;

// Tracés : points d'ellipse « faits main » (bruit doux fonction de l'angle → arcs avant / arrière raccord).
const wob = (seed, amp) => { const n = softNoise(seed); return (a) => amp * n(a); };
const ellPt = (e, a, w) => { const k = 1 + (w ? w(a) : 0); return [e.cx + e.rx * k * Math.cos(a), e.cy + e.ry * k * Math.sin(a)]; };
const arcPts = (e, a0, a1, n, w) => Array.from({ length: n + 1 }, (_, i) => ellPt(e, lerp(a0, a1, i / n), w));
const ellPath = (e, w, n = 48) => smoothPath(arcPts(e, 0, TAU, n, w).slice(0, -1), true);
const open = (pts) => smoothPath(pts, false);
// Enchaîne des tracés ouverts en un seul (les « M » suivants deviennent des « L »).
const chain = (...ds) => ds.map((d, i) => (i ? d.replace(/^M/, 'L') : d)).join('');
// Bruit qui s'annule aux angles 0 et π (raccord exact entre arc avant, arc arrière et parois).
const rimWob = (seed, amp) => { const n = softNoise(seed); return (a) => amp * n(a) * Math.abs(Math.sin(a)); };

// Ombre portée dessinée : ellipses empilées à faible opacité (flou simulé), brun chaud jamais noir.
function softShadow(cx, cy, rx, ry, { layers = 5, spread = 1.5, alpha = 0.05, seed = 1, rotate = 0 } = {}) {
  let s = '';
  for (let i = 0; i < layers; i++) {
    const k = lerp(spread, 1, layers === 1 ? 1 : i / (layers - 1));
    s += path(wobblyEllipse(cx, cy, rx * k, ry * Math.sqrt(k), { seed: seed + i, amp: 0.025, rotate, n: 18 }), fill('gc-ink', alpha));
  }
  return s;
}
// Hachures à 45°, pas de 6, gc-chocolate à 30 % : uniquement dans les ombres.
const hatchDef = (id) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">${path('M3 -1V7', ink(1.2, 'gc-chocolate', 0.3))}</pattern>`;

// Profil du dôme : u ∈ [-1, 1], 0 = sommet, ±1 = extrémités du bord. Calotte super-elliptique puis parois.
const U_CAP = 0.6;
function domeXY(u) {
  const s = u < 0 ? -1 : 1;
  const a = Math.min(1, Math.abs(u));
  let x, y;
  if (a <= U_CAP) {
    const th = (Math.PI / 2) * (1 - a / U_CAP);
    x = DOME.R * Math.cos(th) ** (2 / DOME.n);
    y = DOME.cy - DOME.R * Math.sin(th) ** (2 / DOME.n);
  } else {
    const t = (a - U_CAP) / (1 - U_CAP);
    x = DOME.R + DOME.flare * t ** 3;
    y = DOME.cy + t * (DOME.rim.cy - DOME.cy);
  }
  return [DOME.cx + s * x, y];
}
function domeNormal(u) {
  const e = 1e-3;
  const [x0, y0] = domeXY(u - e);
  const [x1, y1] = domeXY(u + e);
  let nx = y1 - y0, ny = -(x1 - x0);
  const L = Math.hypot(nx, ny) || 1;
  nx /= L; ny /= L;
  const [x, y] = domeXY(u);
  if (nx * (x - DOME.cx) + ny * (y - Math.max(y, DOME.cy)) < 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}
const domeInset = (u, d) => { const [x, y] = domeXY(u); const [nx, ny] = domeNormal(u); return [x - nx * d, y - ny * d]; };
// Bande effilée qui suit la paroi, à la distance d (bord extérieur) et de largeur max w : reflets du verre.
function strip(u0, u1, d, w, { n = 16, taper = 0.8 } = {}) {
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = lerp(u0, u1, t);
    outer.push(domeInset(u, d));
    inner.push(domeInset(u, d + w * Math.sin(Math.PI * t) ** taper));
  }
  return { d: smoothPath([...outer, ...inner.reverse().slice(1, -1)], true), pts: [...outer, ...inner] };
}
// Paroi du dôme, de l'extrémité gauche du bord au sommet puis à l'extrémité droite, au trait légèrement irrégulier.
function domeWallPts(seed) {
  const noise = softNoise(seed);
  const us = [];
  for (let i = 0; i <= 14; i++) us.push((i / 14) * U_CAP);
  for (let i = 1; i <= 5; i++) us.push(U_CAP + (i / 5) * (1 - U_CAP));
  const right = us.map((u) => {
    const [x, y] = domeXY(u);
    const [nx, ny] = domeNormal(u);
    const k = 1.1 * noise(u * Math.PI) * (1 - u ** 6);
    return [x + nx * k, y + ny * k];
  });
  const left = us.map((u) => {
    const [x, y] = domeXY(-u);
    const [nx, ny] = domeNormal(-u);
    const k = 1.1 * noise(-u * Math.PI - 1.3) * (1 - u ** 6);
    return [x + nx * k, y + ny * k];
  });
  return [...left.reverse(), ...right.slice(1)];
}

// Dôme soulevé : rotation autour du centre de l'ouverture, puis translation (même chose qu'en CSS).
function lifted([x, y]) {
  const a = (LIFT.rotate * Math.PI) / 180;
  const dx = x - A.cx, dy = y - A.cy;
  return [A.cx + dx * Math.cos(a) - dy * Math.sin(a) + LIFT.dx, A.cy + dx * Math.sin(a) + dy * Math.cos(a) + LIFT.dy];
}
const distToCenter = ([x, y]) => Math.hypot(x - A.cx, y - A.cy);
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

// ───────────────────────────── 4. PIÈCES ─────────────────────────────

// Ombres sur la table : lumière de fin d'après-midi en haut à gauche → longues ombres vers la droite.
function tableShadows(v) {
  const yb = FOOT.cy + FOOT.ry + 6 + FOOT.band;
  return `<g>${softShadow(A.cx + 118, yb + 2, 175, 14, { layers: 6, spread: 1.35, alpha: 0.04, seed: v.seed + 40, rotate: 0.02 })}${softShadow(A.cx + 10, yb - 2, FOOT.rx + 6, FOOT.ry + 4, { layers: 4, spread: 1.25, alpha: 0.07, seed: v.seed + 50 })}</g>`;
}

// Pied du présentoir : col, bague dorée, pied évasé, chant du pied.
function pedestal(v, id) {
  const R = rng(v.seed + 60);
  const prof = PEDESTAL.map(([dx, y], i) => [dx + (i && i < PEDESTAL.length - 1 ? R.range(-0.7, 0.7) : 0), y]);
  const right = prof.map(([dx, y]) => [A.cx + dx, y]);
  const left = prof.map(([dx, y]) => [A.cx - dx, y]).reverse();
  const footTop = { cx: FOOT.cx, cy: FOOT.cy + 6, rx: FOOT.rx, ry: FOOT.ry };
  const footBot = { ...footTop, cy: footTop.cy + FOOT.band };
  const w = rimWob(v.seed + 61, 0.006);
  const outline = chain(open(right), open(arcPts(footBot, 0, Math.PI, 20, w)), open(left)) + 'Z';
  // Ombre propre (côté droit) : du tiers de la demi-largeur jusqu'au bord ; hachures sur le bord extrême.
  const side = (k) => {
    const outer = prof.map(([dx, y]) => [A.cx + dx, y]);
    const inner = prof.map(([dx, y]) => [A.cx + dx * k, y]).reverse();
    const arcR = arcPts(footBot, 0, Math.acos(k), 8, w);
    return chain(open(outer), open(arcR), open(inner)) + 'Z';
  };
  const [light, shade] = v.porcelain;
  return `<defs>
<linearGradient id="${id('ped-shade')}" x1="0" y1="0" x2="1" y2="0">${stop(0, shade, 0)}${stop(0.35, shade)}${stop(1, shade)}</linearGradient>
<clipPath id="${id('ped-clip')}">${path(outline, '')}</clipPath>
</defs>
${path(outline, fill(light))}
${path(side(0.18), `fill="url(#${id('ped-shade')})"`)}
${path(side(0.62), `fill="url(#${id('hatch')})"`)}
<g clip-path="url(#${id('ped-clip')})">${softShadow(A.cx + 8, Y0 + 3, 80, 9, { layers: 3, spread: 1.3, alpha: 0.09, seed: v.seed + 62 })}</g>
${path(chain(open(arcPts({ cx: A.cx, cy: KNOP.top, rx: KNOP.hw, ry: KNOP.hw * K }, 0, Math.PI, 8)), open(arcPts({ cx: A.cx, cy: KNOP.bottom, rx: KNOP.hw - 1, ry: (KNOP.hw - 1) * K }, Math.PI, 0, 8))) + 'Z', fill(v.filet))}
${path(open(arcPts({ cx: A.cx, cy: KNOP.top, rx: KNOP.hw, ry: KNOP.hw * K }, 0.15, Math.PI - 0.15, 8)), ink(INK_FINE))}
${path(open(arcPts({ cx: A.cx, cy: KNOP.bottom, rx: KNOP.hw - 1, ry: (KNOP.hw - 1) * K }, 0.15, Math.PI - 0.15, 8)), ink(INK_FINE))}
${path(open(arcPts({ ...footTop, cy: footTop.cy + FOOT.band * 0.5 }, 0.04, Math.PI - 0.04, 20, w)), ink(2.2, v.filet))}
${path(open(arcPts(footTop, 0.02, Math.PI - 0.02, 20, w)), ink(INK_FINE))}
${path(outline, ink(INK))}`;
}

// Plateau : chant (avec filet doré), dessus en porcelaine (avec filet), ombre du gâteau, miettes.
// Dessiné entier dans back.svg et recopié, découpé, dans front.svg (devant la base de la vidéo) :
// toutes les formes translucides y reposent sur un aplat opaque, la copie est donc invisible.
// Bord inférieur festonné du chant : petits arcs qui pendent entre des pointes (N festons sur le tour complet).
function festoonPts(e, a0, a1, w) {
  const n = Math.round((Math.abs(a1 - a0) / TAU) * PLATE.festoons * 6);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = lerp(a0, a1, i / n);
    const [x, y] = ellPt(e, a, w);
    return [x, y - PLATE.festoonDepth * (1 - Math.abs(Math.sin((PLATE.festoons * a) / 2)))];
  });
}

function plate(v, id) {
  const top = { cx: PLATE.cx, cy: PLATE.cy, rx: PLATE.rx, ry: PLATE.ry };
  const bot = { ...top, cy: PLATE.cy + PLATE.band };
  const w = rimWob(v.seed + 70, 0.004);
  const band = chain(open(arcPts(top, 0, Math.PI, 28, w)), open(festoonPts(bot, Math.PI, 0, w))) + 'Z';
  const R = rng(v.seed + 71);
  const crumbs = v.crumbs
    ? [[A.cx + 176, PLATE.cy + 8, 6], [A.cx + 196, PLATE.cy + 15, 4.2], [A.cx + 161, PLATE.cy + 17, 3.4], [A.cx - 196, PLATE.cy + 10, 4.6]]
        .map(([x, y, r], i) => path(blob(x, y, r, { seed: v.seed + 80 + i, irregularity: 0.28, n: 6 }), `${fill('gc-crust')} stroke="${c('gc-ink')}" stroke-width="${f(INK_FINE * 0.8)}" stroke-linejoin="round"`))
        .join('')
    : '';
  const [light, shade] = v.porcelain;
  return `<defs>
<radialGradient id="${id('plate-top')}" cx="0.36" cy="0.3" r="0.78">${stop(0, light)}${stop(0.55, light)}${stop(1, shade)}</radialGradient>
<linearGradient id="${id('plate-band')}" x1="0" y1="0" x2="1" y2="0">${stop(0, shade)}${stop(0.18, light)}${stop(0.5, light)}${stop(0.92, shade)}</linearGradient>
</defs>
${path(band, `fill="url(#${id('plate-band')})"`)}
${path(open(arcPts({ ...top, cy: PLATE.cy + PLATE.band * 0.36 }, 0.03, Math.PI - 0.03, 28, w)), ink(2.8, v.filet))}
${path(open(festoonPts(bot, 0, Math.PI, w)), ink(INK))}
${path(`M${f(top.cx + top.rx)} ${f(top.cy)}V${f(bot.cy - PLATE.festoonDepth)}M${f(top.cx - top.rx)} ${f(top.cy)}V${f(bot.cy - PLATE.festoonDepth)}`, ink(INK))}
${path(ellPath(top, w, 56), `fill="url(#${id('plate-top')})"`)}
${path(wobblyEllipse(A.cx - 165, PLATE.cy - 4, 118, 13, { seed: v.seed + 73, amp: 0.04 }), fill('gc-glow', 0.22))}
${path(ellPath({ ...top, rx: top.rx - 13, ry: (top.rx - 13) * K }, w, 56), ink(1.7, v.filet))}
${softShadow(A.cx + 70, PLATE.cy + 4, 150, 9, { layers: 3, spread: 1.25, alpha: 0.05, seed: v.seed + 72, rotate: R.range(-0.01, 0.01) })}
${crumbs}
${path(ellPath(top, w, 56), ink(INK))}`;
}

// Arrière du dôme (back.svg, groupe .gc-anim-lift) : voile de la paroi du fond et bord arrière, derrière la vidéo.
function domeBack(v) {
  const walls = domeWallPts(v.seed + 90);
  const w = rimWob(v.seed + 91, 0.004);
  const back = arcPts(DOME.rim, TAU, Math.PI, 24, w);
  const backLip = arcPts({ ...DOME.rim, cy: DOME.rim.cy - DOME.lip }, TAU, Math.PI, 24, w);
  const silhouette = chain(open(walls), open(back)) + 'Z';
  return `<g class="gc-anim-lift">
${path(silhouette, fill('gc-glass-tint', 0.45))}
${path(chain(open(back), open([...backLip].reverse())) + 'Z', fill('gc-glass-highlight', 0.35))}
${path(open(backLip), ink(INK_FINE * 0.8, 'gc-ink', 0.35))}
${path(open(back), ink(GLASS_INK * 0.85, 'gc-ink', 0.6))}
</g>`;
}

// Anneau autour de l'ouverture (front.svg) : biseau de porcelaine, filet doré, contour encre.
// Rempli de RING.inner (< r) à RING.outer (> r + BLEED) : couvre toute la bande de débord du masque.
function ring(v, id) {
  const circ = (r, seed, amp) => ({ e: { cx: A.cx, cy: A.cy, rx: r, ry: r }, w: wob(seed, amp / r) });
  const out = circ(RING.outer, v.seed + 100, 0.9);
  const inn = circ(RING.inner, v.seed + 101, 0.5);
  const fil = circ(RING.filet, v.seed + 102, 0.5);
  const outPts = arcPts(out.e, 0, TAU, 72, out.w).slice(0, -1);
  const inPts = arcPts(inn.e, 0, TAU, 72, inn.w).slice(0, -1);
  check(Math.min(...outPts.map(distToCenter)) > A.r + BLEED + 3, 'anneau : le bord extérieur ne couvre pas tout le débord');
  check(Math.max(...inPts.map(distToCenter)) < A.r - 0.8, 'anneau : le bord intérieur ne mord pas sur l’ouverture');
  // Ombre du biseau sur la vidéo, en haut à gauche (croissant fin).
  const sh = [], si = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const a = lerp(Math.PI * 0.86, Math.PI * 1.62, t);
    const r0 = RING.inner + 0.5, r1 = RING.inner - 7 * Math.sin(Math.PI * t) ** 0.7;
    sh.push([A.cx + r0 * Math.cos(a), A.cy + r0 * Math.sin(a)]);
    si.push([A.cx + r1 * Math.cos(a), A.cy + r1 * Math.sin(a)]);
  }
  const [light, shade] = v.porcelain;
  return `<defs><linearGradient id="${id('ring')}" x1="0.15" y1="0.1" x2="0.85" y2="0.95">${stop(0, light)}${stop(0.45, light)}${stop(1, shade)}</linearGradient></defs>
${path(smoothPath([...sh, ...si.reverse().slice(1, -1)], true), fill('gc-ink', 0.16))}
${path(`${smoothPath(outPts, true)} ${smoothPath(inPts, true)}`, `fill="url(#${id('ring')})" fill-rule="evenodd"`)}
${path(ellPath(fil.e, fil.w, 72), ink(2.3, v.filet))}
${path(smoothPath(inPts, true), ink(INK_FINE))}
${path(smoothPath(outPts, true), ink(INK))}`;
}

// Avant du plateau devant la base de la vidéo (front.svg) : copie du plateau découpée sous l'arc CUT,
// plus le trait de contact du gâteau sur le plateau (limité à la largeur de l'anneau).
function plateFront(v, id) {
  const lower = arcPts(CUT, Math.PI, 0, 32); // de gauche à droite en passant par le bas
  const clip = `${open(lower)}L${f(CUT.cx + CUT.rx)} ${f(H)}L${f(CUT.cx - CUT.rx)} ${f(H)}Z`;
  const contact = lower.filter((p) => distToCenter(p) <= RING.outer + 1);
  return `<defs><clipPath id="${id('cut')}">${path(clip, '')}</clipPath></defs>
<g clip-path="url(#${id('cut')})">${plate(v, id)}</g>
${path(open(contact), ink(INK_FINE * 1.1, 'gc-ink', 0.85))}`;
}

// Nœud de ruban noué au col du bouton : deux boucles, deux pans à queue d'aronde, un nœud central.
// Coordonnées relatives au centre du nœud ; aplat + un ton d'ombre, contour encre fin.
const BOW = { cx: A.cx, cy: DOME.top - 9 };
const BOW_PARTS = {
  tails: ['M-3 3Q-12 13-29 18L-23 22L-28 28Q-10 21 2 6Z', 'M3 3Q13 14 28 19L22 22L26 29Q8 22-2 6Z'],
  loops: ['M-5-3C-14-17-35-21-35-6C-35 6-17 8-5 3Z', 'M5-3C14-18 36-19 36-4C36 8 17 8 5 3Z'],
  folds: ['M-6-1C-14-9-26-10-28-4C-21-2-13 1-6 2Z', 'M6-1C14-10 27-10 29-3C22-1 14 1 6 2Z'],
  knot: 'M-6-5C-2-8 3-8 6-5C8-1 7 4 5 6C1 8-3 8-6 6C-8 3-8-2-6-5Z',
};
function bow(v) {
  if (!v.ribbon) return '';
  const [base, shade] = v.ribbon;
  const line = `stroke="${c('gc-ink')}" stroke-width="${f(INK_FINE * 1.1)}" stroke-linejoin="round" stroke-linecap="round"`;
  const tailTips = [[-29, 18], [-28, 28], [28, 19], [26, 29]].map(([x, y]) => [BOW.cx + x, BOW.cy + y]);
  check(Math.min(...tailTips.map(distToCenter)) > RING.outer + INK + 4, 'nœud : les pans touchent l’anneau');
  return `<g transform="translate(${f(BOW.cx)} ${f(BOW.cy)})">
${BOW_PARTS.tails.map((d) => path(d, `${fill(base)} ${line}`)).join('')}
${BOW_PARTS.loops.map((d) => path(d, `${fill(base)} ${line}`)).join('')}
${BOW_PARTS.folds.map((d) => path(d, fill(shade))).join('')}
${path(BOW_PARTS.knot, `${fill(shade)} ${line}`)}
</g>`;
}

// Dôme en place (dome.svg) : voile, épaisseur, bourrelet, reflets nets en haut à gauche, contour, bouton.
function dome(v, id) {
  const walls = domeWallPts(v.seed + 90);
  const w = rimWob(v.seed + 91, 0.004);
  const front = arcPts(DOME.rim, 0, Math.PI, 24, w);
  const frontLip = arcPts({ ...DOME.rim, cy: DOME.rim.cy - DOME.lip }, 0, Math.PI, 24, w);
  const body = chain(open(walls), open(front)) + 'Z';

  // Reflets (gc-glass-highlight) : jamais sur la vidéo, ni en place ni soulevés (vérifié plus bas).
  // Chaque reflet = un halo + un cœur plus étroit superposé (deux couches au token, sans changer sa valeur).
  const HL = [
    { u0: -0.42, u1: -0.1, d: 5, w: 25, name: 'calotte' },
    { u0: -0.535, u1: -0.46, d: 6, w: 10, name: 'calotte (tiret)' },
    { u0: -0.66, u1: -0.94, d: 4.5, w: 13, name: 'paroi gauche' },
    { u0: 0.6, u1: 0.9, d: 5, w: 8, name: 'paroi droite', soft: true },
  ];
  const hl = HL.flatMap((h) => {
    const halo = { ...strip(h.u0, h.u1, h.d, h.w), alpha: h.soft ? 0.6 : 1, name: h.name };
    if (h.soft) return [halo];
    const core = { ...strip(lerp(h.u0, h.u1, 0.1), lerp(h.u0, h.u1, 0.78), h.d + h.w * 0.15, h.w * 0.5), alpha: 1, name: `${h.name} (cœur)` };
    return [halo, core];
  });
  // Voile doré de fin d'après-midi sur la paroi gauche (gc-glow, opacité du token d'usage 0,18–0,24).
  const glow = { ...strip(-0.98, -0.6, 2.5, 22, { taper: 0.5 }), name: 'lumière dorée' };
  // Reflet du bourrelet avant, à gauche.
  const lipHl = (() => {
    const o = arcPts({ ...DOME.rim, cy: DOME.rim.cy - DOME.lip * 0.5 }, Math.PI * 0.62, Math.PI * 0.9, 10);
    const i = arcPts({ ...DOME.rim, cy: DOME.rim.cy - DOME.lip * 0.5, rx: DOME.rim.rx - 2, ry: DOME.rim.ry - 2.2 }, Math.PI * 0.9, Math.PI * 0.62, 10);
    return smoothPath([...o, ...i.slice(1, -1)], true);
  })();
  // Éclat à quatre branches au bout du grand reflet.
  const sparkle = (() => {
    if (!v.sparkle) return '';
    const [sx, sy] = domeInset(-0.1, 15);
    const s = 9, k = 2;
    return path(`M${f(sx)} ${f(sy - s)}Q${f(sx + k)} ${f(sy - k)} ${f(sx + s)} ${f(sy)}Q${f(sx + k)} ${f(sy + k)} ${f(sx)} ${f(sy + s)}Q${f(sx - k)} ${f(sy + k)} ${f(sx - s)} ${f(sy)}Q${f(sx - k)} ${f(sy - k)} ${f(sx)} ${f(sy - s)}Z`, fill('gc-glass-highlight', 1.6));
  })();
  for (const h of [...hl, glow]) {
    check(Math.min(...h.pts.map(distToCenter)) > RING.outer + INK, `reflet « ${h.name} » : touche l’anneau, dôme en place`);
    check(Math.min(...h.pts.map((p) => distToCenter(lifted(p)))) > A.r + 1, `reflet « ${h.name} » : passe sur la vidéo, dôme soulevé`);
  }
  // Épaisseur du verre le long de la paroi droite (trait fin, ombre du verre).
  const thick = [];
  for (let i = 0; i <= 12; i++) thick.push(domeInset(lerp(0.3, 0.93, i / 12), 7));

  // Bouton : col, bague dorée, boule en porcelaine.
  const [light, shade] = v.porcelain;
  const neck = `M${f(KNOB.cx - 11)} ${f(DOME.top + 4)}C${f(KNOB.cx - 10)} ${f(DOME.top - 3)} ${f(KNOB.cx - 9)} ${f(KNOB.neckTop + 2)} ${f(KNOB.cx - 8.5)} ${f(KNOB.neckTop)}L${f(KNOB.cx + 8.5)} ${f(KNOB.neckTop)}C${f(KNOB.cx + 9)} ${f(KNOB.neckTop + 2)} ${f(KNOB.cx + 10.5)} ${f(DOME.top - 3)} ${f(KNOB.cx + 11)} ${f(DOME.top + 4)}Z`;
  const collar = { cx: KNOB.cx, cy: KNOB.neckTop, rx: 15, ry: 4.6 };
  const ball = { cx: KNOB.cx, cy: KNOB.ballCy, rx: KNOB.rx, ry: KNOB.ry };
  const bw = wob(v.seed + 110, 0.012);
  const ballShade = (() => {
    const o = arcPts(ball, -0.35, Math.PI * 0.72, 12, bw);
    const i = arcPts({ ...ball, cx: ball.cx - 5, cy: ball.cy - 4.5, rx: ball.rx - 2, ry: ball.ry - 1 }, Math.PI * 0.72, -0.35, 12);
    return smoothPath([...o, ...i.slice(1, -1)], true);
  })();

  return `<defs>
<radialGradient id="${id('glass')}" gradientUnits="userSpaceOnUse" cx="${A.cx}" cy="${A.cy}" r="${f(DOME.R + 8)}">${stop(0, 'gc-glass-tint', 0.28)}${stop(0.82, 'gc-glass-tint', 0.36)}${stop(0.95, 'gc-glass-tint', 0.8)}${stop(1, 'gc-glass-tint', 1)}</radialGradient>
<radialGradient id="${id('knob')}" cx="0.36" cy="0.3" r="0.8">${stop(0, light)}${stop(0.5, light)}${stop(1, shade)}</radialGradient>
</defs>
${path(body, `fill="url(#${id('glass')})"`)}
${path(glow.d, fill('gc-glow', 0.2))}
${path(chain(open(front), open([...frontLip].reverse())) + 'Z', fill('gc-glass-highlight', 0.4))}
${path(open(thick), ink(INK_FINE * 0.8, 'gc-ink', 0.22))}
${hl.map((h) => path(h.d, fill('gc-glass-highlight', h.alpha))).join('')}
${path(lipHl, fill('gc-glass-highlight', 1.4))}
${sparkle}
${path(open(frontLip), ink(INK_FINE * 0.8, 'gc-ink', 0.4))}
${path(open(front), ink(GLASS_INK))}
${path(open(walls), ink(GLASS_INK))}
${path(neck, `${fill(light)} stroke="${c('gc-ink')}" stroke-width="${f(INK_FINE * 1.2)}" stroke-linejoin="round"`)}
${path(ellPath(ball, bw, 28), `fill="url(#${id('knob')})"`)}
${path(ballShade, fill(shade, 0.9))}
${path(ellPath(ball, bw, 28), ink(GLASS_INK))}
${path(ellPath(collar, wob(v.seed + 111, 0.02), 20), `${fill(v.filet)} stroke="${c('gc-ink')}" stroke-width="${f(INK_FINE)}" stroke-linejoin="round"`)}
${bow(v)}`;
}

// ───────────────────────────── 5. FICHIERS ─────────────────────────────
const MASK_WHITE = '#fff'; // le contrat impose un masque blanc opaque (luminance et alpha), hors palette

// Allège les fichiers : coordonnées des tracés au dixième d'unité (< 0,1 px à l'écran), sauts de ligne retirés.
const slim = (svg) => svg.replace(/ d="([^"]+)"/g, (_, d) => ` d="${d.replace(/-?\d*\.\d+/g, (n) => String(+(+n).toFixed(1)))}"`).replace(/>\s+</g, '><');

function files(v) {
  const back = idOf(v, 'back');
  const front = idOf(v, 'front');
  const dm = idOf(v, 'dome');
  return {
    back: slim(svgDoc([W, H], `<defs>${hatchDef(back('hatch'))}</defs>${tableShadows(v)}${pedestal(v, back)}${plate(v, back)}${domeBack(v)}`)),
    front: slim(svgDoc([W, H], `${ring(v, front)}${plateFront(v, front)}`)),
    mask: svgDoc([W, H], `<circle cx="${A.cx}" cy="${A.cy}" r="${A.r + BLEED}" fill="${MASK_WHITE}"/>`),
    dome: slim(svgDoc([W, H], dome(v, dm))),
  };
}

// Invariants géométriques du contrat.
function checkLayout() {
  const pad = INK;
  const domePts = [...domeWallPts(1), ...arcPts(DOME.rim, 0, TAU, 32), ...arcPts({ cx: KNOB.cx, cy: KNOB.ballCy, rx: KNOB.rx, ry: KNOB.ry }, 0, TAU, 16)];
  for (const [label, pts] of [['en place', domePts], ['soulevé', domePts.map(lifted)]]) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    check(Math.min(...xs) > pad && Math.max(...xs) < W - pad && Math.min(...ys) > pad && Math.max(...ys) < H - pad, `dôme ${label} : sort du viewBox`);
  }
  check(DOME.top + 20 < A.cy - RING.outer, 'dôme : la calotte touche l’anneau');
  check(CUP.x > 0 && CUP.x < W && CUP.y > 0 && CUP.y < H, 'tasse hors du viewBox');
  check(CAPTION.x >= 0 && CAPTION.x + CAPTION.w <= W && CAPTION.y < H - 50, 'légende hors du viewBox');
  check(CUT.cy + CUT.ry < A.cy + A.r, 'plateau : l’avant ne passe pas devant la base de la vidéo');
}

// Vérifie un SVG d'écrin contre le contrat § 6.
function lint(name, svg, v) {
  const root = /^<svg[^>]*>/.exec(svg)?.[0] ?? '';
  check(/viewBox="0 0 \d+ \d+"/.test(root) && !/\s(width|height)=/.test(root), `${name} : racine sans viewBox à l'origine ou avec width/height`);
  for (const bad of ['<style', '<text', '<filter', '<image', '<!--', 'href="http', 'url(http']) check(!svg.includes(bad), `${name} : contient ${bad}`);
  for (const [, idv] of svg.matchAll(/\sid="([^"]+)"/g)) check(idv.startsWith(`gc-${ID}-${v.id}-`), `${name} : id non préfixé ${idv}`);
}

checkLayout();
const manifest = {
  id: ID,
  label: 'Cloche à gâteau',
  chapter: 'gateaux',
  viewBox: [W, H],
  aperture: APERTURE,
  bleed: BLEED,
  focus: FOCUS,
  cup: CUP,
  caption: CAPTION,
  lift: LIFT,
  variants: VARIANTS.map(({ id, label }) => ({ id, label })),
};
for (const v of VARIANTS) {
  const out = files(v);
  mkdirSync(join(HERE, v.id), { recursive: true });
  for (const [name, svg] of Object.entries(out)) {
    lint(`${v.id}/${name}.svg`, svg, v);
    writeFileSync(join(HERE, v.id, `${name}.svg`), svg);
  }
}
// JSON lisible : tableaux de valeurs et petits objets plats sur une ligne.
const compact = (json) => json.replace(/([[{])\s+([^[\]{}]*?)\s+([\]}])/g, (_, o, inner, cl) => `${o}${o === '{' ? ' ' : ''}${inner.split(/,\s+/).join(', ')}${o === '{' ? ' ' : ''}${cl}`);
writeFileSync(join(HERE, 'ecrin.json'), compact(JSON.stringify(manifest, null, 2)) + '\n');
if (problems.length) {
  console.error(`cloche : ${problems.length} problème(s)\n  - ${[...new Set(problems)].join('\n  - ')}`);
  process.exit(1);
}
