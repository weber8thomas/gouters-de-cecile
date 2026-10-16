// Décors de scène : mur, fenêtre à la lumière de fin d'après-midi, étagère, nappe, rais de lumière.
// Coordonnées en unités de la scène (viewBox), lumière toujours en haut à gauche.
import {
  c, f, STROKE, shape, stroke, ellipsePts, fillPath, inkPath, solidPath, drawShape, castShadow, clip,
} from './core.mjs';
import { jamJar, teacup } from './props.mjs';

const S = STROKE.main, s = STROKE.detail;

// Verre de fenêtre (dégradé autorisé : verre).
function windowGlassGrad(ctx) {
  const id = ctx.id('window-glass');
  return ctx.def(id, `<linearGradient id="${id}" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="${c('gc-glow')}"/><stop offset="0.45" stop-color="${c('gc-honey-100')}"/><stop offset="1" stop-color="${c('gc-paper-lit')}"/></linearGradient>`);
}

// Mur uni + petit motif de brins fleuris (répété par <use>) + un ton d'ombre côté droit.
export function wall(ctx, { w, h, color = 'gc-sage-100', motif = true, shadeX = 0.66, R = ctx.rng('wall') }) {
  let out = `<rect x="-60" y="-60" width="${w + 120}" height="${h + 120}" fill="${c(color)}"/>`;
  if (motif) {
    // papier peint à brins fleuris : un motif de 4 brins (demi-décalage), légèrement bougés
    const id = ctx.id('sprigs');
    const leaf = (x, y, a) => `M${f(x)} ${f(y)}q${f(7 * Math.cos(a - 0.5))} ${f(7 * Math.sin(a - 0.5))} ${f(12 * Math.cos(a))} ${f(12 * Math.sin(a))}q${f(7 * Math.cos(a + 0.5) - 12 * Math.cos(a))} ${f(7 * Math.sin(a + 0.5) - 12 * Math.sin(a))} ${f(-12 * Math.cos(a))} ${f(-12 * Math.sin(a))}Z`;
    const spots = [[20, 40], [116, 40], [68, 132], [164, 132]].map(([x, y]) => [x + R.range(-4, 4), y + R.range(-4, 4), R.range(-0.3, 0.3)]);
    const leaves = spots.map(([x, y, a]) => leaf(x, y, -2.2 + a) + leaf(x, y, -0.9 + a)).join('');
    const dots = spots.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y - 3)}" r="3.4"/><circle cx="${f(x - 6)}" cy="${f(y + 5)}" r="2.2"/>`).join('');
    ctx.def(id, `<pattern id="${id}" patternUnits="userSpaceOnUse" width="192" height="184"><g opacity="0.45"><path d="${leaves}" fill="${c('gc-sage-300')}"/><g fill="${c('gc-pink-300')}">${dots}</g></g></pattern>`);
    out += `<rect x="-60" y="-60" width="${w + 120}" height="${h + 120}" fill="url(#${id})"/>`;
  }
  // ombre douce côté droit (loin de la fenêtre)
  const x0 = w * shadeX;
  const sh = shape([[x0, -20], [w + 20, -20], [w + 20, h + 20], [x0 + 240, h + 20], [x0 + 120, h * 0.5]], R, 3, 0.3);
  out += fillPath(sh.d, c('gc-sage-300', 0.3));
  return out;
}

// Fenêtre à petits carreaux avec vue (toits, arbres, soleil bas), rebord et rideaux noués.
export function windowView(ctx, { x0, y0, x1, y1, R = ctx.rng('window'), curtains = true }) {
  const gw = x1 - x0, gh = y1 - y0;
  let out = '';
  // embrasure (ombre du mur autour de la fenêtre)
  out += fillPath(shape([[x0 - 30, y0 - 30], [x1 + 30, y0 - 30], [x1 + 30, y1 + 26], [x0 - 30, y1 + 26]], R, 2, 0.4).d, c('gc-paper-edge'));
  // vitre + paysage
  const glass = shape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], R, 0.8, 0.3);
  let view = fillPath(glass.d, windowGlassGrad(ctx));
  // soleil bas, voilé
  view += fillPath(shape(ellipsePts(x0 + gw * 0.26, y0 + gh * 0.34, 62, 62, 18), R, 1.5).d, c('gc-glow', 0.55));
  view += fillPath(shape(ellipsePts(x0 + gw * 0.26, y0 + gh * 0.34, 30, 30, 14), R, 0.8).d, c('gc-paper-lace', 0.9));
  // collines et arbres sauge
  view += fillPath(shape([[x0 - 10, y0 + gh * 0.66], [x0 + gw * 0.3, y0 + gh * 0.58], [x0 + gw * 0.7, y0 + gh * 0.62], [x1 + 10, y0 + gh * 0.56], [x1 + 10, y1 + 10], [x0 - 10, y1 + 10]], R, 3).d, c('gc-sage-300', 0.75));
  for (const [tx, ty, tr] of [[x0 + gw * 0.12, y0 + gh * 0.6, 46], [x0 + gw * 0.88, y0 + gh * 0.52, 58], [x0 + gw * 0.66, y0 + gh * 0.6, 34]]) {
    view += fillPath(shape(ellipsePts(tx, ty, tr, tr * 1.1, 14), R, tr * 0.12).d, c('gc-sage-500', 0.8));
    view += fillPath(shape(ellipsePts(tx - tr * 0.3, ty - tr * 0.35, tr * 0.5, tr * 0.45, 12), R, tr * 0.08).d, c('gc-sage-300', 0.9));
  }
  // toits de tuiles (Lyon) au loin
  const roofs = [[0.02, 0.78, 0.3], [0.28, 0.74, 0.26], [0.5, 0.8, 0.3], [0.76, 0.72, 0.28]];
  for (const [rx, ry, rw] of roofs) {
    const bx = x0 + gw * rx, by = y0 + gh * ry, bw = gw * rw;
    view += fillPath(shape([[bx, by + 30], [bx, by + 120], [bx + bw, by + 120], [bx + bw, by + 30]], R, 1, 0.3).d, c('gc-paper-lace'));
    view += fillPath(shape([[bx - 8, by + 34], [bx + bw * 0.5, by - 6], [bx + bw + 8, by + 34]], R, 1.2, 0.3).d, c('gc-terracotta-300'));
    view += fillPath(shape([[bx + bw * 0.72, by + 10], [bx + bw * 0.72, by - 20], [bx + bw * 0.84, by - 20], [bx + bw * 0.84, by + 18]], R, 0.6, 0.3).d, c('gc-terracotta-500', 0.85));
    for (let k = 0; k < 3; k++) view += `<rect x="${f(bx + bw * (0.18 + k * 0.28))}" y="${f(by + 52)}" width="${f(bw * 0.12)}" height="18" fill="${c('gc-sage-500', 0.5)}"/>`;
  }
  // voile de lumière + reflets du verre
  view += fillPath(glass.d, c('gc-paper-lace', 0.28));
  out += `<g ${clip(ctx, glass.d)}>${view}</g>`;
  out += inkPath(stroke([[x0 + gw * 0.56, y0 + 26], [x0 + gw * 0.36, y0 + gh * 0.36]], R, 1), 7, '', c('gc-glass-highlight'));
  out += inkPath(stroke([[x0 + gw * 0.66, y0 + 30], [x0 + gw * 0.5, y0 + gh * 0.26]], R, 1), 3.5, '', c('gc-glass-highlight'));
  out += inkPath(glass.d, S);
  // croisillons
  const bar = (pts) => drawShape(ctx, shape(pts, R, 0.6, 0.3), { fill: c('gc-paper-lace'), shade: c('gc-porcelain-shade'), light: [-4, -4], w: s * 1.4 });
  const mx = x0 + gw / 2;
  out += bar([[mx - 9, y0], [mx + 9, y0], [mx + 9, y1], [mx - 9, y1]]);
  for (const t of [1 / 3, 2 / 3]) {
    const yy = y0 + gh * t;
    out += bar([[x0, yy - 7], [x1, yy - 7], [x1, yy + 7], [x0, yy + 7]]);
  }
  // cadre
  const frame = `M${f(x0 - 22)} ${f(y0 - 22)}H${f(x1 + 22)}V${f(y1 + 6)}H${f(x0 - 22)}Z`;
  const inner = `M${f(x0)} ${f(y0)}V${f(y1)}H${f(x1)}V${f(y0)}Z`;
  out += `<path d="${frame}${inner}" fill="${c('gc-paper-lace')}" fill-rule="evenodd"/>`;
  out += inkPath(shape([[x0 - 22, y0 - 22], [x1 + 22, y0 - 22], [x1 + 22, y1 + 6], [x0 - 22, y1 + 6]], R, 1, 0.3).d, S);
  out += fillPath(shape([[x1 + 4, y0 - 4], [x1 + 22, y0 - 22], [x1 + 22, y1 + 6], [x1 + 4, y1]], R, 0.5, 0.3).d, c('gc-chocolate', 0.08));
  // rebord
  const sill = shape([[x0 - 44, y1 + 4], [x1 + 44, y1 + 4], [x1 + 50, y1 + 28], [x0 - 50, y1 + 28]], R, 0.8, 0.3);
  out += drawShape(ctx, sill, { fill: c('gc-paper-lace'), shade: c('gc-porcelain-shade'), light: [-6, -8], w: S });
  out += fillPath(shape([[x0 - 46, y1 + 30], [x1 + 46, y1 + 30], [x1 + 30, y1 + 44], [x0 - 20, y1 + 44]], R, 1, 0.5).d, c('gc-chocolate', 0.1));
  if (curtains) out += drapes(ctx, { x0, y0, x1, y1, R });
  return out;
}

// Rideaux noués de part et d'autre + tringle.
function drapes(ctx, { x0, y0, x1, y1, R }) {
  let out = '';
  const fold = c('gc-pink-500', 0.45);
  const curtain = (side) => {
    const x = side < 0 ? x0 - 40 : x1 + 40;
    const k = side;
    const pts = [[x - 50 * k, y0 - 60], [x + 46 * k, y0 - 60], [x + 50 * k, y0 + 60], [x + 16 * k, y0 + (y1 - y0) * 0.5], [x + 42 * k, y1 - 20], [x + 58 * k, y1 + 70], [x - 40 * k, y1 + 76], [x - 46 * k, y1 - 30], [x - 60 * k, y0 + (y1 - y0) * 0.45], [x - 56 * k, y0 + 40]];
    const sh = shape(pts, R, 1.5, 0.9);
    let o = drawShape(ctx, sh, { fill: c('gc-pink-100'), shade: c('gc-pink-300', 0.8), light: [-14, -6], hatched: false, w: S });
    for (const t of [-0.5, -0.05, 0.4]) o += inkPath(stroke([[x + t * 70 * k, y0 - 50], [x + t * 30 * k + 6 * k, y0 + (y1 - y0) * 0.5], [x + t * 60 * k + 10 * k, y1 + 64]], R, 2), s, '', fold);
    // embrasse
    const tie = shape([[x - 44 * k, y0 + (y1 - y0) * 0.47], [x + 24 * k, y0 + (y1 - y0) * 0.5], [x + 24 * k, y0 + (y1 - y0) * 0.56], [x - 46 * k, y0 + (y1 - y0) * 0.54]], R, 1, 0.5);
    o += drawShape(ctx, tie, { fill: c('gc-terracotta-500'), w: s * 1.4 });
    // liseré festonné bas
    o += inkPath(stroke([[x - 40 * k, y1 + 70], [x, y1 + 76], [x + 56 * k, y1 + 66]], R, 1), 5, '', c('gc-terracotta-300'));
    return o;
  };
  out += curtain(-1) + curtain(1);
  // tringle
  out += inkPath(stroke([[x0 - 120, y0 - 58], [x1 + 120, y0 - 58]], R, 0.8), 10, '', c('gc-wood-2'));
  for (const xx of [x0 - 124, x1 + 124]) out += solidPath(shape(ellipsePts(xx, y0 - 58, 11, 11, 10), R, 0.5).d, c('gc-honey-500'), s * 1.2);
  return out;
}

// Plante en pot (terre cuite), feuillage sauge, éventuellement retombant.
export function pottedPlant(ctx, { x, y, scale = 1, trailing = false, R = ctx.rng(`plant${x}${y}`) }) {
  let out = '';
  const leaves = trailing
    ? [[-40, 20], [-56, 60], [-50, 104], [-62, 150], [40, 30], [54, 76], [60, 122], [-20, -20], [10, -34], [34, -16]]
    : [[-30, -40], [-8, -66], [16, -58], [34, -34], [-44, -14], [44, -10], [0, -40]];
  for (const [lx, ly] of leaves) {
    const a = Math.atan2(ly + 10, lx);
    const lf = shape([[0, -6], [lx * 0.5 + Math.cos(a + 1.2) * 10, ly * 0.5 + Math.sin(a + 1.2) * 10], [lx, ly], [lx * 0.5 + Math.cos(a - 1.2) * 10, ly * 0.5 + Math.sin(a - 1.2) * 10]], R, 1);
    if (trailing) out += inkPath(stroke([[0, -4], [lx * 0.6, ly * 0.4], [lx, ly]], R, 2), s, '', c('gc-sage-700'));
    out += drawShape(ctx, lf, { fill: c(R.next() > 0.4 ? 'gc-sage-500' : 'gc-sage-300'), w: s * 1.2 });
  }
  const pot = shape([[-34, -8], [34, -8], [28, 40], [-28, 40]], R, 0.8, 0.5);
  out += drawShape(ctx, pot, { fill: c('gc-terracotta-500'), shade: c('gc-chocolate', 0.22), light: [-10, -4], hatched: true, w: S });
  out += drawShape(ctx, shape([[-38, -14], [38, -14], [37, 0], [-37, 0]], R, 0.6, 0.4), { fill: c('gc-terracotta-300'), w: S * 0.9 });
  return `<g transform="translate(${f(x)} ${f(y)})${scale !== 1 ? ` scale(${f(scale)})` : ''}">${out}</g>`;
}

// Étagère en bois avec pots de confiture, tasse et plante retombante.
export function shelf(ctx, { x0, x1, y, R = ctx.rng('shelf') }) {
  let out = '';
  // objets posés
  out += castShadow(ctx, x0 + 92, y - 2, 46, 8, { R, alpha: 0.12, hatched: false });
  out += jamJar(ctx, { x: x0 + 76, y: y - 2, scale: 0.95, cloth: 'gc-terracotta-100' });
  out += jamJar(ctx, { x: x0 + 150, y: y - 2, scale: 0.78, liquid: 'the', cloth: 'gc-sage-100', label: false });
  out += teacup(ctx, { x: x0 + 236, y: y - 44, scale: 0.72, decor: 'pois', liquid: 'the' });
  out += pottedPlant(ctx, { x: x0 + 340, y: y - 42, trailing: true, scale: 0.95 });
  // planche
  const plank = shape([[x0, y - 2], [x1 + 30, y - 2], [x1 + 30, y + 18], [x0, y + 18]], R, 0.8, 0.3);
  out += drawShape(ctx, plank, { fill: c('gc-wood-1'), shade: c('gc-wood-3', 0.45), light: [0, -8], w: S });
  out += inkPath(stroke([[x0 + 20, y + 6], [x0 + 140, y + 8], [x0 + 260, y + 5]], R, 0.8), s, ' opacity="0.45"');
  for (const bx of [x0 + 50, x0 + 300]) {
    const br = shape([[bx, y + 18], [bx + 14, y + 18], [bx + 14, y + 40], [bx + 4, y + 70], [bx, y + 70]], R, 0.5, 0.5);
    out += drawShape(ctx, br, { fill: c('gc-wood-2'), w: S * 0.9 });
  }
  out += fillPath(shape([[x0 + 4, y + 20], [x1 + 30, y + 20], [x1 + 30, y + 46], [x0 + 40, y + 40]], R, 2, 0.5).d, c('gc-chocolate', 0.08));
  return out;
}

// Nappe vichy en perspective (bord du fond à y), ou lin uni.
export function tablecloth(ctx, { y, w, h, kind = 'vichy', color = 'gc-terracotta-300', alpha = 0.3, R = ctx.rng('cloth') }) {
  const top = shape([[-60, y], [w * 0.25, y + R.range(-1, 1)], [w * 0.5, y], [w * 0.75, y + R.range(-1, 1)], [w + 60, y], [w + 60, h + 60], [-60, h + 60]], R, 0.8, 0.4);
  let out = fillPath(top.d, c(kind === 'vichy' ? 'gc-paper-lace' : 'gc-linen'));
  if (kind === 'vichy') {
    const vx = w / 2, vy = -1300, pitch = 56;
    const fy = h + 60;
    const k = (fy - vy) / (y - vy);
    let bands = '';
    for (let xb = -60 - pitch * 3; xb < w + pitch * 3; xb += pitch) {
      const a = xb, b = xb + pitch / 2;
      bands += `M${f(a)} ${y}L${f(b)} ${y}L${f(vx + (b - vx) * k)} ${fy}L${f(vx + (a - vx) * k)} ${fy}Z`;
    }
    let rows = '';
    let yy = y, step = 26;
    for (let i = 0; yy < fy; i++) {
      const y2 = yy + step;
      if (i % 2 === 0) rows += `M-80 ${f(yy)}H${w + 80}V${f(y2)}H-80Z`;
      yy = y2;
      step *= 1.085;
    }
    out += `<g ${clip(ctx, top.d)}><path d="${bands}" fill="${c(color, alpha)}"/><path d="${rows}" fill="${c(color, alpha)}"/></g>`;
  }
  out += inkPath(stroke([[-60, y], [w * 0.3, y + 1], [w * 0.6, y - 1], [w + 60, y]], R, 0.6), S);
  return out;
}

// Guirlande de fanions en tissu (anniversaire) suspendue entre deux points, avec un creux `sag`.
export function bunting(ctx, { from, to, sag = 60, n = 9, colors = ['gc-terracotta-300', 'gc-paper-lace', 'gc-sage-300', 'gc-pink-300', 'gc-honey-300'], R = ctx.rng('bunting') }) {
  const at = (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t + sag * 4 * t * (1 - t)];
  const pts = Array.from({ length: 13 }, (_, i) => at(i / 12));
  let flags = '';
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const [x, y] = at(t);
    const [x2, y2] = at(t + 0.001);
    const ang = Math.atan2(y2 - y, x2 - x);
    const half = 21, len = 50;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const p1 = [x - ux * half, y - uy * half], p2 = [x + ux * half, y + uy * half], tip = [x - uy * -len + R.range(-3, 3), y + ux * len];
    const col = colors[i % colors.length];
    const sh = shape([p1, [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], p2, tip], R, 0.6, 0.25);
    flags += drawShape(ctx, sh, { fill: c(col), shade: c('gc-chocolate', 0.12), light: [-5, -4], w: s * 1.3 });
    if (col === 'gc-paper-lace' || col === 'gc-honey-300') for (const k of [0.3, 0.55]) flags += `<circle cx="${f(x - uy * -len * k + R.range(-4, 4))}" cy="${f(y + ux * len * k)}" r="2.6" fill="${c(col === 'gc-paper-lace' ? 'gc-terracotta-300' : 'gc-paper-lace')}"/>`;
  }
  return inkPath(stroke(pts, R, 0.4), 2.6, '', c('gc-kraft')) + flags;
}

// Tambour à broder accroché au mur (cerclage bois, lin, broderie de citron). (x, y) = centre.
export function hoop(ctx, { x, y, r = 60, R = ctx.rng(`hoop${x}${y}`) }) {
  let out = inkPath(stroke([[x, y - r - 2], [x - 10, y - r - 40], [x + 10, y - r - 40], [x, y - r - 2]], R, 0.5), 2, '', c('gc-kraft'));
  out += `<circle cx="${x}" cy="${y - r - 40}" r="4" fill="${c('gc-wood-2')}"/>`;
  out += castShadow(ctx, x + 10, y + 12, r * 1.02, r * 1.02, { R, alpha: 0.12, hatched: false });
  const ring = shape(ellipsePts(x, y, r + 7, r + 7, 20), R, 0.8);
  out += drawShape(ctx, ring, { fill: c('gc-wood-2'), w: S });
  const cloth = shape(ellipsePts(x, y, r - 2, r - 2, 20), R, 0.6);
  out += drawShape(ctx, cloth, { fill: c('gc-linen'), shade: c('gc-linen-shade'), light: [-8, -8], w: s });
  // citron brodé + deux feuilles, points de croix
  const lem = shape([[x - 26, y + 4], [x - 18, y - 12], [x + 2, y - 18], [x + 20, y - 10], [x + 30, y + 2], [x + 20, y + 14], [x - 2, y + 18], [x - 20, y + 14]], R, 0.8);
  out += drawShape(ctx, lem, { fill: c('gc-honey-300'), w: s * 1.2 });
  for (const [lx, ly, a] of [[x - 6, y - 22, -2.4], [x + 10, y - 24, -0.8]]) {
    const lf = shape([[lx, ly + 4], [lx + 16 * Math.cos(a - 0.4), ly + 16 * Math.sin(a - 0.4)], [lx + 22 * Math.cos(a), ly + 22 * Math.sin(a)], [lx + 16 * Math.cos(a + 0.4), ly + 16 * Math.sin(a + 0.4)]], R, 0.5);
    out += drawShape(ctx, lf, { fill: c('gc-sage-500'), w: s });
  }
  out += inkPath(stroke(ellipsePts(x, y, r - 12, r - 12, 24).slice(13, 22), R, 0.4), 2, ' stroke-dasharray="4 6"', c('gc-terracotta-500'));
  // vis de serrage
  out += solidPath(shape([[x - 6, y - r - 12], [x + 6, y - r - 12], [x + 6, y - r + 2], [x - 6, y - r + 2]], R, 0.4, 0.4).d, c('gc-honey-500'), s);
  return out;
}

// Taches de lumière dorée (fenêtre projetée) sur la table.
export function lightPatches(ctx, { patches, R = ctx.rng('patches') }) {
  return patches.map((pts) => fillPath(shape(pts, R, 2, 0.5).d, c('gc-glow', 0.34))).join('');
}

// Rais de lumière de fin d'après-midi : voile très léger gc-glow (0,18 à 0,24) en diagonale.
export function glowBeams(ctx, { beams, alpha = 0.2, R = ctx.rng('beams') }) {
  return `<g opacity="${alpha}">${beams.map((pts) => fillPath(shape(pts, R, 3, 0.4).d, c('gc-glow'))).join('')}</g>`;
}

