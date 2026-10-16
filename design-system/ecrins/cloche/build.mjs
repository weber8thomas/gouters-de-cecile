// Cloche à gâteau — écrin PILOTE, dessiné au crayon et à l'aquarelle (CONTRACT § 6 et 7).
//
//   node scripts/gen-svg.mjs ecrins/cloche   →   ecrin.json + <v>/{back,front,mask,dome}.svg
//   node scripts/bake-ecrins.mjs              →   design-system/baked/ecrins/cloche/<v>/{back,front,dome,domeBack,glint,mask-soft}.webp
//
// Les SVG écrits ici sont VECTORIELS ET PROPRES (aucun filtre) : c'est l'export SVG et la géométrie de référence.
// Ils portent la géométrie « dessinée » (traits de crayon en deux passages, lavis décalés, glacis) dans des
// groupes <g data-fx="pencil|wash" data-fx-seed>, que la cuisson (scripts/lib/fx-dessin.mjs) filtre.
// Les calques cuits se découpent dans ces fichiers par l'attribut data-part :
//   back.svg  = back + [data-part=domeBack] (arrière du bord du dôme, classe gc-anim-lift : suit le dôme)
//   dome.svg  = dome + [data-part=glint]    (reflet qui balaie le verre, animé à part)
//
// Organisation (à reprendre pour un nouvel écrin) :
//   1. GÉOMÉTRIE  viewBox, échelle d'affichage, crayons, L'OUVERTURE (définie une seule fois), pose soulevée.
//   2. VARIANTES  une ligne par variante (couleurs, graine, petits décors).
//   3. OUTILS     couleurs des tokens (lavis plafonnés à 68 % de saturation), crayon, lavis, filets, corps opaques.
//   4. PIÈCES     une fonction par objet dessiné.
//   5. FICHIERS   assemble back / front / mask / dome, vérifie les invariants du contrat, écrit le manifeste.
//
// Empilement (composant Ecrin) : back → domeBack → vidéo (masque) → front → dome → glint → tasse → légende.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { c } from '../../../scripts/lib/tokens.mjs';
import { f, smoothPath, softNoise, svgDoc } from '../../../scripts/lib/organic.mjs';
import { rng } from '../../../scripts/lib/prng.mjs';
import { atelier, fxGroup, smooth } from '../../../scripts/lib/fx-dessin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID = 'cloche';
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

// ───────────────────────────── 1. GÉOMÉTRIE ─────────────────────────────
// Le viewBox est agrandi de EXT vers le haut : c'est la place du dôme soulevé (au-dessus du visage).
// Au repos, cette bande reste vide (transparente) : la mise en page peut la faire mordre sur la marge.
const W = 800;
const EXT = 230;
const H = 1000 + EXT;
const Y0 = EXT; // décalage de toutes les cotes historiques (viewBox 800 × 1000)
// Échelle d'affichage visée : écrin ≈ 700 px de large sur la TV → PX px par unité. Les réglages du crayon
// et des lavis sont en px d'affichage ; la cuisson se fait à 1,25 × (scripts/bake-ecrins.mjs).
const PX = 700 / W;
const PEN = 2.5; // crayon des contours (px)
const PEN_FINE = 1.6; // détails
const PEN_GLASS = 2.3; // verre, plus léger
const K = 0.09; // vue légèrement plongeante : ry / rx des ellipses posées à plat

// L'OUVERTURE — seule définition. Masque, anneau et manifeste la réutilisent.
const APERTURE = { shape: 'circle', cx: 400, cy: Y0 + 470, r: 220 };
const BLEED = 4;
const FOCUS = [0.5, 0.42];
const A = APERTURE;

// Anneau (front) : corps opaque de RING.inner (< r) à RING.outer (> r + BLEED), filet doré au milieu.
const RING = { inner: A.r - 2, outer: A.r + 11, filet: A.r + 4.5 };
// Plateau : la vidéo est posée dessus comme un gâteau ; son bas plonge de 14 u sous la ligne médiane du plateau.
const PLATE = { cx: A.cx, cy: A.cy + A.r - 14, rx: A.r + 90, band: 15, festoons: 40, festoonDepth: 5 };
PLATE.ry = PLATE.rx * K;
const BAND_BOTTOM = PLATE.cy + PLATE.ry + PLATE.band;
// Bord avant du plateau qui passe devant la base de la vidéo (front) : arc bas de cette ellipse.
const CUT = { cx: A.cx, cy: PLATE.cy - 8, rx: RING.outer + 6, ry: 10 };
// Dôme : calotte super-elliptique concentrique à la vidéo, parois presque droites, léger évasement au bord.
const DOME = { cx: A.cx, cy: A.cy, R: RING.outer + 27, n: 2.25, flare: 6 };
DOME.top = DOME.cy - DOME.R;
DOME.rim = { cx: A.cx, cy: PLATE.cy, rx: DOME.R + DOME.flare, ry: (DOME.R + DOME.flare) * K };
DOME.lip = 4;
const KNOB = { cx: A.cx, neckTop: DOME.top - 11, ballCy: DOME.top - 31, rx: 25, ry: 20 };
// Pied du présentoir : profil (demi-largeur, y) du haut (caché sous le chant) jusqu'au bord du pied.
const FOOT = { cx: A.cx, cy: BAND_BOTTOM + 100, rx: 118, band: 9 };
FOOT.ry = FOOT.rx * K;
const YB = BAND_BOTTOM;
const PEDESTAL = [
  [76, YB - 9], [64, YB + 2], [41, YB + 14], [26, YB + 27],
  [31, YB + 38], [31, YB + 44], [24, YB + 54],
  [19, YB + 66], [26, YB + 79], [54, FOOT.cy - 5], [94, FOOT.cy + 1], [FOOT.rx, FOOT.cy + 6],
];
const KNOP = { top: YB + 37, bottom: YB + 45, hw: 31 };
// Tasse (centre du bas de la soucoupe) et légende, sous l'écrin.
const CUP = { x: 690, y: Y0 + 906 };
const CAPTION = { x: 96, y: Y0 + 878, w: 470, rotate: -2 };
// Dôme soulevé : pivote de `rotate` degrés autour du centre de l'ouverture, puis se déplace de (dx, dy).
// Il monte franchement au-dessus du visage, penché, un peu vers la droite (comme soulevé d'une main) :
// son bord avant ne traverse jamais la zone visage + mains + tasse (ZONE, vérifiée plus bas).
const LIFT = { dx: 28, dy: -378, rotate: -4 };
// Zone à dégager en lecture (scènes centrées : visage, tasse et mains dans la colonne centrale).
const ZONE = { x0: A.cx - 0.56 * A.r, x1: A.cx + 0.56 * A.r, y0: A.cy - 0.6 * A.r, y1: A.cy + 0.78 * A.r };

// ───────────────────────────── 2. VARIANTES ─────────────────────────────
const VARIANTS = [
  {
    id: 'a',
    label: 'Porcelaine et filet doré',
    seed: 11,
    filet: 'gc-honey-500', // filet doré peint (plateau, pied, anneau, bague du bouton)
    ribbon: ['gc-terracotta-300', 'gc-terracotta-500'], // nœud au bouton : lavis, glacis (null = sans nœud)
    shade: 'gc-sage-300', // ombre froide de la porcelaine
    crumbs: true,
    sparkle: true,
  },
  // { id: 'b', label: 'Ruban sauge', seed: 23, filet: 'gc-honey-500', ribbon: ['gc-sage-300', 'gc-sage-500'], shade: 'gc-pink-300', crumbs: false, sparkle: true },
  // { id: 'c', label: 'Liseré rose', seed: 37, filet: 'gc-pink-500', ribbon: ['gc-pink-300', 'gc-pink-500'], shade: 'gc-sage-300', crumbs: true, sparkle: false },
];

// ───────────────────────────── 3. OUTILS ─────────────────────────────
// L'atelier (scripts/lib/fx-dessin.mjs) : crayon en deux passages, lavis décalés, glacis, filets, hachures,
// tous en px d'affichage (PX) et balisés data-fx pour la cuisson.
const ART = atelier({ px: PX, seed: 1 });
const { pen, lav, glz, filet } = ART;
const hatchIn = ART.hatch;
const hex = (name) => c(name);
const path = ART.path;
// Corps opaque de porcelaine (papier blanc) : rien ne transparaît dessous.
const BODY = 'gc-paper-lace';
const body = (d, o = 1, extra = '') => ART.body(d, BODY, o, extra);

// Ids uniques dans tout le bundle : gc-cloche-<variante>-<fichier>-<partie>.
const idOf = (v, file) => (part) => `gc-${ID}-${v.id}-${file}-${part}`;

// Ellipses « faites main » (bruit doux fonction de l'angle → arcs avant / arrière raccord).
const wob = (seed, amp) => { const n = softNoise(seed); return (a) => amp * n(a); };
const ellPt = (e, a, w) => { const k = 1 + (w ? w(a) : 0); return [e.cx + e.rx * k * Math.cos(a), e.cy + e.ry * k * Math.sin(a)]; };
const arcPts = (e, a0, a1, n, w) => Array.from({ length: n + 1 }, (_, i) => ellPt(e, lerp(a0, a1, i / n), w));
const ellLoop = (e, w, n = 64) => arcPts(e, 0, TAU, n, w).slice(0, -1);
const rimWob = (seed, amp) => { const n = softNoise(seed); return (a) => amp * n(a) * Math.abs(Math.sin(a)); };
const dOf = (pts, closed = true) => smooth(pts, closed);

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
// Bande effilée qui suit la paroi, à la distance d et de largeur max w (reflets, voiles).
function strip(u0, u1, d, w, { n = 18, taper = 0.8 } = {}) {
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = lerp(u0, u1, t);
    outer.push(domeInset(u, d));
    inner.push(domeInset(u, d + w * Math.sin(Math.PI * t) ** taper));
  }
  return [...outer, ...inner.reverse().slice(1, -1)];
}
function domeWallPts(seed) {
  const noise = softNoise(seed);
  const us = [];
  for (let i = 0; i <= 16; i++) us.push((i / 16) * U_CAP);
  for (let i = 1; i <= 6; i++) us.push(U_CAP + (i / 6) * (1 - U_CAP));
  const side = (sgn, ph) => us.map((u) => {
    const [x, y] = domeXY(sgn * u);
    const [nx, ny] = domeNormal(sgn * u);
    const k = 1.4 * noise(sgn * u * Math.PI + ph) * (1 - u ** 6);
    return [x + nx * k, y + ny * k];
  });
  return [...side(-1, -1.3).reverse(), ...side(1, 0).slice(1)];
}

function lifted([x, y]) {
  const a = (LIFT.rotate * Math.PI) / 180;
  const dx = x - A.cx, dy = y - A.cy;
  return [A.cx + dx * Math.cos(a) - dy * Math.sin(a) + LIFT.dx, A.cy + dx * Math.sin(a) + dy * Math.cos(a) + LIFT.dy];
}
const distToCenter = ([x, y]) => Math.hypot(x - A.cx, y - A.cy);
const inZone = ([x, y], pad = 0) => x > ZONE.x0 - pad && x < ZONE.x1 + pad && y > ZONE.y0 - pad && y < ZONE.y1 + pad;
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

// ───────────────────────────── 4. PIÈCES ─────────────────────────────

// Ombres sur la table (lumière de fin d'après-midi en haut à gauche → ombres longues vers la droite) :
// deux lavis chocolat très dilués et quelques hachures sous le pied.
function tableShadows(v) {
  const yb = FOOT.cy + FOOT.ry + 6 + FOOT.band;
  const long = ellLoop({ cx: A.cx + 128, cy: yb + 1, rx: 182, ry: 13 }, wob(v.seed + 40, 0.06), 28);
  const core = ellLoop({ cx: A.cx + 18, cy: yb - 2, rx: FOOT.rx + 10, ry: FOOT.ry + 5 }, wob(v.seed + 41, 0.05), 28);
  return lav(long, 'gc-chocolate', { alpha: 0.5, fx: { opacity: 0.26, wet: 14, holes: 0.03 }, shrink: [0, 2] })
    + lav(core, 'gc-chocolate', { alpha: 0.6, fx: { opacity: 0.32, holes: 0.02 }, shrink: [0, 2] })
    + hatchIn(ellLoop({ cx: A.cx + 70, cy: yb + 1, rx: 120, ry: 9 }, null, 20), { spacing: 4.5, angle: -55, keep: 0.7, alpha: 0.35 });
}

// Pied du présentoir : col, bague dorée, pied évasé ; ombre froide à droite, hachures au bord.
function pedestal(v) {
  const R = rng(v.seed + 60);
  const prof = PEDESTAL.map(([dx, y], i) => [dx + (i && i < PEDESTAL.length - 1 ? R.range(-0.8, 0.8) : 0), y]);
  const footTop = { cx: FOOT.cx, cy: FOOT.cy + 6, rx: FOOT.rx, ry: FOOT.ry };
  const footBot = { ...footTop, cy: footTop.cy + FOOT.band };
  const w = rimWob(v.seed + 61, 0.006);
  const right = prof.map(([dx, y]) => [A.cx + dx, y]);
  const left = prof.map(([dx, y]) => [A.cx - dx, y]).reverse();
  const outline = [...right, ...arcPts(footBot, 0.04, Math.PI - 0.04, 24, w), ...left];
  const sideR = [...right, ...arcPts(footBot, 0.04, Math.acos(0.3), 8, w), ...prof.map(([dx, y]) => [A.cx + dx * 0.3, y]).reverse()];
  const knop = [...arcPts({ cx: A.cx, cy: KNOP.top, rx: KNOP.hw, ry: KNOP.hw * K }, 0, Math.PI, 10), ...arcPts({ cx: A.cx, cy: KNOP.bottom, rx: KNOP.hw - 1, ry: (KNOP.hw - 1) * K }, Math.PI, 0, 10)];
  // hachures dans l'ombre du pied (côté droit, de l'évasement jusqu'au bord)
  const footR = [...prof.slice(8).map(([dx, y]) => [A.cx + dx, y]), ...arcPts(footBot, 0.06, 0.9, 8, w), ...prof.slice(8).reverse().map(([dx, y]) => [A.cx + dx * 0.55, y])];
  return body(dOf(outline))
    + lav(sideR, v.shade, { alpha: 0.85, shrink: [1, 3] })
    + lav(knop, v.filet, { alpha: 0.9, shrink: [0, 1], offset: [1, 2] })
    + hatchIn(footR, { spacing: 4.4, angle: -62, alpha: 0.4, keep: 0.8 })
    + filet(arcPts({ ...footTop, cy: footTop.cy + FOOT.band * 0.5 }, 0.08, Math.PI - 0.08, 24, w), v.filet, { w: 2.6 })
    + pen(arcPts({ cx: A.cx, cy: KNOP.top, rx: KNOP.hw, ry: KNOP.hw * K }, 0.1, Math.PI - 0.1, 10), { w: PEN_FINE })
    + pen(arcPts({ cx: A.cx, cy: KNOP.bottom, rx: KNOP.hw - 1, ry: (KNOP.hw - 1) * K }, 0.1, Math.PI - 0.1, 10), { w: PEN_FINE })
    + pen(arcPts(footTop, 0.02, Math.PI - 0.02, 24, w), { w: PEN_FINE })
    + pen(outline);
}

// Plateau : chant festonné (filet doré), dessus en porcelaine (filet intérieur), lumière dorée, ombre du gâteau, miettes.
// Dessiné entier dans back.svg et recopié, découpé, dans front.svg (devant la base de la vidéo) : mêmes graines,
// mêmes coordonnées → la copie se superpose exactement.
function festoonPts(e, a0, a1, w) {
  const n = Math.round((Math.abs(a1 - a0) / TAU) * PLATE.festoons * 6);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = lerp(a0, a1, i / n);
    const [x, y] = ellPt(e, a, w);
    return [x, y - PLATE.festoonDepth * (1 - Math.abs(Math.sin((PLATE.festoons * a) / 2)))];
  });
}
function plate(v) {
  ART.reset(v.seed * 1000 + 70); // graines fixes : la copie de front.svg est identique
  const top = { cx: PLATE.cx, cy: PLATE.cy, rx: PLATE.rx, ry: PLATE.ry };
  const bot = { ...top, cy: PLATE.cy + PLATE.band };
  const w = rimWob(v.seed + 70, 0.004);
  const topLoop = ellLoop(top, w, 72);
  const band = [...arcPts(top, 0, Math.PI, 36, w), ...festoonPts(bot, Math.PI, 0, w)];
  const bandShade = [...arcPts(top, 0, Math.PI * 0.42, 14, w), ...festoonPts(bot, Math.PI * 0.42, 0, w)];
  const bandShadeL = [...arcPts(top, Math.PI * 0.86, Math.PI, 6, w), ...festoonPts(bot, Math.PI, Math.PI * 0.86, w)];
  const R = rng(v.seed + 71);
  const crumbs = v.crumbs
    ? [[A.cx + 176, PLATE.cy + 8, 6], [A.cx + 196, PLATE.cy + 15, 4.2], [A.cx + 161, PLATE.cy + 17, 3.4], [A.cx - 196, PLATE.cy + 10, 4.6]].map(([x, y, r], i) => {
        const pts = Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * TAU + R.range(-0.2, 0.2); const rr = r * R.range(0.75, 1.25); return [x + rr * Math.cos(a), y + rr * 0.8 * Math.sin(a)]; });
        return lav(pts, 'gc-crust', { offset: [0.6, 1.2], shrink: [0, 0.4], fx: { wet: 2, holes: 0 } }) + pen(pts, { w: 1.2, closed: true, color: 'gc-graphite', seed: v.seed + 80 + i });
      }).join('')
    : '';
  const inner = ellLoop({ ...top, rx: top.rx - 14, ry: (top.rx - 14) * K }, w, 72);
  return body(dOf(band)) + body(dOf(topLoop))
    + lav(bandShade, v.shade, { shrink: [0.5, 2], offset: [1, 2.5] })
    + lav(bandShadeL, v.shade, { alpha: 0.6, shrink: [0.5, 1.5], offset: [1, 2] })
    // dessus : voile froid au fond, lumière dorée à gauche, ombre portée du gâteau à droite
    + lav(ellLoop({ cx: A.cx + 60, cy: PLATE.cy - 9, rx: PLATE.rx - 70, ry: PLATE.ry * 0.4 }, wob(v.seed + 72, 0.08), 32), v.shade, { alpha: 0.45, fx: { opacity: 0.5 } })
    + lav(ellLoop({ cx: A.cx - 175, cy: PLATE.cy + 1, rx: 100, ry: 11 }, wob(v.seed + 73, 0.1), 24), 'gc-honey-100', { fx: { opacity: 0.7, holes: 0.01 } })
    + lav(ellLoop({ cx: A.cx + 92, cy: PLATE.cy + 6, rx: 150, ry: 8.5 }, wob(v.seed + 74, 0.1), 28), 'gc-chocolate', { alpha: 0.5, fx: { opacity: 0.3 } })
    + filet(arcPts({ ...top, cy: PLATE.cy + PLATE.band * 0.4 }, 0.05, Math.PI - 0.05, 40, w), v.filet, { w: 3 })
    + filet(inner, v.filet, { w: 2.1, closed: true })
    + crumbs
    + pen(festoonPts(bot, 0.01, Math.PI - 0.01, w), { w: PEN_FINE + 0.2 })
    + pen([[top.cx + top.rx, top.cy - 1], [top.cx + top.rx + 0.5, bot.cy - PLATE.festoonDepth + 1]], { w: PEN_FINE })
    + pen([[top.cx - top.rx, top.cy - 1], [top.cx - top.rx - 0.5, bot.cy - PLATE.festoonDepth + 1]], { w: PEN_FINE })
    + pen(topLoop, { closed: true });
}

// Arrière du dôme (domeBack, suit le dôme) : bord arrière et lèvre, voile pâle de la paroi du fond.
function domeBack(v) {
  ART.reset(v.seed * 1000 + 90);
  const w = rimWob(v.seed + 91, 0.004);
  const back = arcPts(DOME.rim, TAU, Math.PI, 30, w);
  const backLip = arcPts({ ...DOME.rim, cy: DOME.rim.cy - DOME.lip }, TAU, Math.PI, 30, w);
  return `<g class="gc-anim-lift" data-part="domeBack">`
    + lav([...back, ...backLip.slice().reverse()], 'gc-sage-100', { offset: [0.5, 1], shrink: [0, 0.3], fx: { opacity: 0.55, wet: 3 } })
    + pen(backLip, { w: 1.1, color: 'gc-graphite', alpha: 0.4 })
    + pen(back, { w: PEN_GLASS * 0.85, color: 'gc-graphite', alpha: 0.65 })
    + '</g>';
}

// Anneau autour de l'ouverture (front) : corps de porcelaine opaque (couvre tout le débord), filet doré peint,
// ombre froide en bas à droite, lumière dorée en haut à gauche, ombre du biseau sur la vidéo, contours au crayon.
function ring(v) {
  ART.reset(v.seed * 1000 + 100);
  const circ = (r, seed, amp, n = 96) => ellLoop({ cx: A.cx, cy: A.cy, rx: r, ry: r }, wob(seed, amp / r), n);
  const outPts = circ(RING.outer, v.seed + 100, 0.9);
  const inPts = circ(RING.inner, v.seed + 101, 0.5);
  check(Math.min(...outPts.map(distToCenter)) > A.r + BLEED + 3, 'anneau : le bord extérieur ne couvre pas tout le débord');
  check(Math.max(...inPts.map(distToCenter)) < A.r - 0.8, 'anneau : le bord intérieur ne mord pas sur l’ouverture');
  const band = (r0, r1, a0, a1, n = 28) => {
    const o = [], i = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, a = lerp(a0, a1, t), s = Math.sin(Math.PI * t) ** 0.6;
      o.push([A.cx + r1 * Math.cos(a), A.cy + r1 * Math.sin(a)]);
      i.push([A.cx + lerp(r1, r0, s) * Math.cos(a), A.cy + lerp(r1, r0, s) * Math.sin(a)]);
    }
    return [...o, ...i.reverse().slice(1, -1)];
  };
  // ombre du biseau sur la vidéo (haut-gauche), lavis chocolat très dilué
  const bevel = band(RING.inner - 9, RING.inner + 1, Math.PI * 0.88, Math.PI * 1.62);
  return path(`${dOf(outPts)} ${dOf(inPts)}`, hex(BODY), 1, ' fill-rule="evenodd"')
    + lav(bevel, 'gc-chocolate', { offset: [0.5, 1.5], shrink: [0, 1], fx: { opacity: 0.3, holes: 0 } })
    + lav(band(RING.inner + 2, RING.outer - 1, -0.45, Math.PI * 0.62), v.shade, { offset: [0.5, 1.5], shrink: [0, 1], fx: { wet: 5 } })
    + lav(band(RING.inner + 3, RING.outer - 2, Math.PI * 1.02, Math.PI * 1.45), 'gc-honey-100', { offset: [0.5, 1], shrink: [0, 0.5], fx: { wet: 4, opacity: 0.7 } })
    + filet(circ(RING.filet, v.seed + 102, 0.5, 120), v.filet, { w: 2.8, closed: true })
    + pen(inPts, { w: PEN_FINE, closed: true })
    + pen(outPts, { closed: true });
}

// Avant du plateau devant la base de la vidéo (front) : copie du plateau découpée sous l'arc CUT + trait de contact.
function plateFront(v, id) {
  const lower = arcPts(CUT, Math.PI, 0, 32);
  const clip = `${smoothPath(lower, false)}L${f(CUT.cx + CUT.rx)} ${f(H)}L${f(CUT.cx - CUT.rx)} ${f(H)}Z`;
  const contact = lower.filter((p) => distToCenter(p) <= RING.outer + 1);
  ART.reset(v.seed * 1000 + 120);
  return `<defs><clipPath id="${id('cut')}"><path d="${clip}"/></clipPath></defs>`
    + `<g clip-path="url(#${id('cut')})">${plate(v)}</g>`
    + pen(contact, { w: PEN_FINE, alpha: 0.85, seed: v.seed + 121 });
}

// Nœud de ruban au col du bouton : deux boucles, deux pans à queue d'aronde, un nœud central.
const BOW = { cx: A.cx, cy: DOME.top - 10 };
const BOW_PARTS = {
  tails: [[[-3, 3], [-12, 12], [-29, 18], [-23, 22], [-28, 28], [-10, 21], [2, 6]], [[3, 3], [13, 13], [28, 19], [22, 22], [26, 29], [8, 22], [-2, 6]]],
  loops: [[[-5, -3], [-14, -16], [-30, -20], [-36, -8], [-30, 3], [-17, 6], [-5, 3]], [[5, -3], [14, -17], [31, -19], [37, -5], [31, 5], [17, 7], [5, 3]]],
  knot: [[-6, -5], [0, -7.5], [6, -5], [7, 1], [5, 6], [0, 7.5], [-6, 6], [-7.5, 0]],
};
function bow(v) {
  if (!v.ribbon) return '';
  const [base, shade] = v.ribbon;
  const T = (pts) => pts.map(([x, y]) => [BOW.cx + x, BOW.cy + y]);
  const tailTips = [[-29, 18], [-28, 28], [28, 19], [26, 29]].map(([x, y]) => [BOW.cx + x, BOW.cy + y]);
  check(Math.min(...tailTips.map(distToCenter)) > RING.outer + 8, 'nœud : les pans touchent l’anneau');
  let s = '';
  for (const p of [...BOW_PARTS.tails, ...BOW_PARTS.loops]) s += body(dOf(T(p))) + lav(T(p), base, { offset: [1, 2], shrink: [0, 1.2] });
  for (const p of BOW_PARTS.loops) s += glz(T(p), shade, { k: 0.5, light: [0, -1] });
  s += body(dOf(T(BOW_PARTS.knot))) + lav(T(BOW_PARTS.knot), shade, { offset: [0.5, 1], shrink: [0, 0.5], fx: { wet: 3 } });
  for (const p of [...BOW_PARTS.tails, ...BOW_PARTS.loops]) s += pen(T(p), { w: 1.3, closed: true, corner: 50, passes: 1 });
  s += pen(T(BOW_PARTS.knot), { w: 1.3, closed: true, passes: 1 });
  return s;
}

// Reflets du verre (blanc, comme une touche de gouache) : jamais sur la vidéo, ni en place ni soulevés.
const HL = [
  { u0: -0.42, u1: -0.12, d: 6, w: 20, name: 'calotte', alpha: 0.85 },
  { u0: -0.52, u1: -0.46, d: 7, w: 8, name: 'calotte (tiret)', alpha: 0.85 },
  { u0: -0.66, u1: -0.93, d: 5, w: 11, name: 'paroi gauche', alpha: 0.8 },
  { u0: 0.62, u1: 0.88, d: 5, w: 6, name: 'paroi droite', alpha: 0.55 },
];

// Dôme en place : verre presque invisible (voiles pâles le long des parois seulement), reflets blancs,
// contour au crayon clair, bord avant et lèvre, bouton de porcelaine, nœud.
function dome(v, id) {
  ART.reset(v.seed * 1000 + 140);
  const walls = domeWallPts(v.seed + 90);
  const w = rimWob(v.seed + 91, 0.004);
  const front = arcPts(DOME.rim, 0, Math.PI, 30, w);
  const frontLip = arcPts({ ...DOME.rim, cy: DOME.rim.cy - DOME.lip }, 0, Math.PI, 30, w);
  const hls = HL.map((h) => ({ ...h, pts: strip(h.u0, h.u1, h.d, h.w) }));
  // voiles du verre : bandes le long des parois (entre l'anneau et la paroi), plus marqués à droite (ombre)
  const tints = [
    { pts: strip(0.08, 0.97, 2.5, 18, { taper: 0.45 }), color: 'gc-sage-300', o: 0.55 },
    { pts: strip(-0.97, -0.6, 2.5, 15, { taper: 0.5 }), color: 'gc-honey-100', o: 0.6 },
    { pts: strip(-0.58, 0.06, 2.5, 13, { taper: 0.6 }), color: 'gc-sage-300', o: 0.32 },
  ];
  for (const h of [...hls, ...tints]) {
    check(Math.min(...h.pts.map(distToCenter)) > RING.outer + 2, `verre « ${h.name ?? h.color} » : touche l’anneau, dôme en place`);
  }
  for (const h of hls) check(Math.min(...h.pts.map((p) => distToCenter(lifted(p)))) > A.r + 2, `reflet « ${h.name} » : passe sur la vidéo, dôme soulevé`);
  const lipShine = [...arcPts({ ...DOME.rim, cy: DOME.rim.cy - DOME.lip * 0.5 }, Math.PI * 0.62, Math.PI * 0.9, 10), ...arcPts({ ...DOME.rim, cy: DOME.rim.cy - DOME.lip * 0.5, rx: DOME.rim.rx - 2, ry: DOME.rim.ry - 2.2 }, Math.PI * 0.9, Math.PI * 0.62, 10)];
  const sparkle = (() => {
    if (!v.sparkle) return '';
    const [sx, sy] = domeInset(-0.12, 15);
    const s = 9, k = 1.8;
    return `<path d="M${f(sx)} ${f(sy - s)}Q${f(sx + k)} ${f(sy - k)} ${f(sx + s)} ${f(sy)}Q${f(sx + k)} ${f(sy + k)} ${f(sx)} ${f(sy + s)}Q${f(sx - k)} ${f(sy + k)} ${f(sx - s)} ${f(sy)}Q${f(sx - k)} ${f(sy - k)} ${f(sx)} ${f(sy - s)}Z" fill="${hex('gc-porcelain')}" fill-opacity="0.95"/>`;
  })();
  // épaisseur du verre le long de la paroi droite (trait fin)
  const thick = Array.from({ length: 13 }, (_, i) => domeInset(lerp(0.3, 0.93, i / 12), 7));
  // bouton : col, bague dorée, boule en porcelaine
  const neck = [[KNOB.cx - 11, DOME.top + 4], [KNOB.cx - 9.5, DOME.top - 4], [KNOB.cx - 8.5, KNOB.neckTop], [KNOB.cx + 8.5, KNOB.neckTop], [KNOB.cx + 10, DOME.top - 4], [KNOB.cx + 11, DOME.top + 4]];
  const collar = ellLoop({ cx: KNOB.cx, cy: KNOB.neckTop, rx: 14, ry: 4.4 }, wob(v.seed + 111, 0.02), 20);
  const ball = ellLoop({ cx: KNOB.cx, cy: KNOB.ballCy, rx: KNOB.rx, ry: KNOB.ry }, wob(v.seed + 110, 0.012), 32);
  return tints.map((t) => lav(t.pts, t.color, { offset: [1, 2], shrink: [0.5, 2], fx: { opacity: t.o, holes: 0.01, wet: 6 } })).join('')
    + lav([...front, ...frontLip.slice().reverse()], 'gc-sage-100', { offset: [0.3, 0.8], shrink: [0, 0.2], fx: { opacity: 0.6, wet: 2 } })
    + hls.map((h) => fxGroup('wash', path(dOf(h.pts), hex('gc-porcelain'), h.alpha), { seed: ART.seed(), wet: 4, edge: 0.6, holes: 0.04, opacity: 0.95, grain: 0 })).join('')
    + fxGroup('wash', path(dOf(lipShine), hex('gc-porcelain'), 0.9), { seed: ART.seed(), wet: 2, edge: 0.4, holes: 0.02, opacity: 0.95, grain: 0 })
    + sparkle
    + pen(thick, { w: 1.1, color: 'gc-graphite', alpha: 0.35 })
    + pen(frontLip, { w: 1.1, color: 'gc-graphite', alpha: 0.45 })
    + pen(front, { w: PEN_GLASS, color: 'gc-graphite' })
    + pen(walls, { w: PEN_GLASS, color: 'gc-graphite', corner: 80 })
    + body(dOf(neck)) + lav(neck.slice(3), v.shade, { offset: [0.5, 1], shrink: [0, 0.5], fx: { wet: 3 } }) + pen(neck, { w: PEN_FINE, closed: true, corner: 60 })
    + body(dOf(ball))
    + lav(ball, 'gc-honey-100', { offset: [0.5, 1.5], shrink: [1, 3], fx: { opacity: 0.5 } })
    + glz(ball, v.shade, { k: 0.5, fx: { opacity: 0.6 } })
    + pen(ball, { w: PEN_FINE + 0.3, closed: true })
    + lav(collar, v.filet, { offset: [0.3, 0.8], shrink: [0, 0.3], fx: { wet: 2 } }) + pen(collar, { w: PEN_FINE, closed: true })
    + bow(v)
    + glint(v);
}

// Reflet qui balaie le verre (calque glint, animé à part : opacité et léger glissement pendant le soulèvement).
// Large voile blanc diagonal sur la paroi gauche et la calotte, à l'intérieur de la silhouette du verre.
function glint(v) {
  ART.reset(v.seed * 1000 + 160);
  const pts = strip(-0.88, -0.34, 2.5, 19, { taper: 0.7, n: 24 });
  check(Math.min(...pts.map(distToCenter)) > RING.outer + 2, 'glint : touche l’anneau, dôme en place');
  return `<g data-part="glint">${fxGroup('wash', path(dOf(pts), hex('gc-porcelain'), 0.75), { seed: ART.seed(), wet: 8, edge: 0.3, holes: 0, opacity: 0.85, grain: 0 })}</g>`;
}

// ───────────────────────────── 5. FICHIERS ─────────────────────────────
const MASK_WHITE = '#fff'; // le contrat impose un masque blanc opaque (luminance et alpha), hors palette

function files(v) {
  const front = idOf(v, 'front');
  const dm = idOf(v, 'dome');
  ART.reset(v.seed * 1000);
  const back = tableShadows(v) + pedestal(v) + plate(v) + domeBack(v);
  return {
    back: svgDoc([W, H], back),
    front: svgDoc([W, H], ring(v) + plateFront(v, front)),
    mask: svgDoc([W, H], `<circle cx="${A.cx}" cy="${A.cy}" r="${A.r + BLEED}" fill="${MASK_WHITE}"/>`),
    dome: svgDoc([W, H], dome(v, dm)),
  };
}

// Invariants géométriques du contrat et de la pose soulevée.
function checkLayout() {
  const pad = 4;
  const rimFront = arcPts(DOME.rim, 0, Math.PI, 48).map(([x, y]) => [x, y + 3]);
  const domePts = [...domeWallPts(1), ...arcPts(DOME.rim, 0, TAU, 48), ...ellLoop({ cx: KNOB.cx, cy: KNOB.ballCy, rx: KNOB.rx + 2, ry: KNOB.ry + 2 }, null, 24), [BOW.cx - 37, BOW.cy - 20], [BOW.cx + 37, BOW.cy - 20]];
  for (const [label, pts] of [['en place', domePts], ['soulevé', domePts.map(lifted)]]) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    check(Math.min(...xs) > pad && Math.max(...xs) < W - pad && Math.min(...ys) > pad && Math.max(...ys) < H - pad, `dôme ${label} : sort du viewBox (${f(Math.min(...ys))})`);
  }
  // soulevé : le bord avant ne traverse ni le visage, ni les mains, ni la tasse ; les parois non plus
  const rimUp = rimFront.map(lifted);
  check(!rimUp.some((p) => inZone(p, 6)), 'dôme soulevé : le bord avant traverse la zone visage / mains');
  check(!domeWallPts(1).map(lifted).some((p) => inZone(p, 6)), 'dôme soulevé : une paroi traverse la zone visage / mains');
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

// Recherche de la pose soulevée (à relancer si la géométrie change) : CLOCHE_POSE=1 node build.mjs
// → pour chaque inclinaison, le plus petit soulèvement qui dégage ZONE, et la marge restante en haut du viewBox.
if (process.env.CLOCHE_POSE) {
  const rimFront = arcPts(DOME.rim, 0, Math.PI, 48).map(([x, y]) => [x, y + 3]);
  const walls = domeWallPts(1);
  const knobTop = KNOB.ballCy - KNOB.ry - 4;
  for (const rot of [-8, -6, -4, -2, 0]) for (const dx of [0, 16, 28, 40]) {
    for (let dy = -250; dy >= -520; dy -= 2) {
      Object.assign(LIFT, { dx, dy, rotate: rot });
      if (rimFront.map(lifted).some((p) => inZone(p, 6)) || walls.map(lifted).some((p) => inZone(p, 6))) continue;
      const top = Math.min(...[...walls, [A.cx - KNOB.rx, knobTop], [A.cx + KNOB.rx, knobTop], [BOW.cx - 37, BOW.cy - 20], [BOW.cx + 37, BOW.cy - 20]].map((p) => lifted(p)[1]));
      console.log(`rotate ${rot} dx ${dx} → dy ${dy}, haut du dôme ${f(top)} (EXT nécessaire ≥ ${f(EXT - top + 6)})`);
      break;
    }
  }
  process.exit(0);
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
const compact = (json) => json.replace(/([[{])\s+([^[\]{}]*?)\s+([\]}])/g, (_, o, inner, cl) => `${o}${o === '{' ? ' ' : ''}${inner.split(/,\s+/).join(', ')}${o === '{' ? ' ' : ''}${cl}`);
writeFileSync(join(HERE, 'ecrin.json'), compact(JSON.stringify(manifest, null, 2)) + '\n');
if (problems.length) {
  console.error(`cloche : ${problems.length} problème(s)\n  - ${[...new Set(problems)].join('\n  - ')}`);
  process.exit(1);
}
