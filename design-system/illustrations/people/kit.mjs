// Kit de personnages du carnet « Les goûters de Cécile ».
// Dessine n'importe quel invité du roster à partir de son `look` (src/content/types.ts) :
// carnation, cheveux (couleur + coiffure), haut, lunettes, barbe/moustache, âge, et une pose de bras
// par côté. Déterministe (aléatoire à graine), couleurs via c('gc-…'), contours faits main.
//
// Repère canonique d'un personnage : origine au centre du visage, tête ≈ 172 × 200 unités,
// y vers le bas. Le bord de table est à y = 297 (tableY). On place le personnage dans une scène
// avec { x, y, scale } (translation + échelle d'un groupe) : les animations CSS (gc-anim-*)
// sont exprimées dans ce repère, elles restent donc valables quelle que soit la scène.
//
//   const ctx = createCtx('gc-scene-julie');
//   const julie = person(ctx, look, { x: 800, y: 318, pose: { left: 'fourchette', right: 'tasse' } });
//   svg = … décor … + julie.back + table + accessoires + julie.front …
import {
  c, f, TAU, STROKE, shape, stroke, ellipsePts, fillPath, inkPath, solidPath, drawShape, shadeIn, clip, g, sym, mirrorX, move,
  pivotBox, rotatePts,
} from './core.mjs';
import { teacup, fork as forkProp, steam } from './props.mjs';


export * from './core.mjs';
export * from './props.mjs';
export * from './decor.mjs';

// ---------- palette du personnage ----------
export const SKIN = (n) => c(`gc-skin-${n}`);
export const SKIN_SHADE = (n) => (n >= 5 ? c('gc-ink', 0.24) : n >= 3 ? c('gc-terracotta-700', 0.17) : c('gc-terracotta-700', 0.13));
export const HAIR = (n) => c(`gc-hair-${n}`);
const HAIR_SHADE = (n) => (n === 6 ? c('gc-chocolate', 0.24) : n >= 3 ? c('gc-chocolate', 0.3) : c('gc-ink', 0.38));
const HAIR_LIGHT = (n) => (n <= 2 ? c('gc-honey-300', 0.42) : c('gc-paper-lace', 0.55));
const BROW = (n) => (n === 6 ? c('gc-sepia-3') : n === 4 ? c('gc-hair-3') : HAIR(n));
const TOP_SHADE = () => c('gc-chocolate', 0.2);
// Joues : rose poudré (pink-100 / pink-300) ; sur les carnations foncées, un rose plus soutenu et plus discret.
const CHEEKS = (n) => (n >= 5 ? [c('gc-pink-500', 0.42), c('gc-pink-500', 0.2)] : n === 4 ? [c('gc-pink-300', 0.75), c('gc-pink-500', 0.25)] : [c('gc-pink-300', 0.95), c('gc-pink-500', 0.16)]);
// Foulard : couleur assortie au haut si rien n'est précisé.
const SCARF_FOR = { pink: 'gc-sage-300', sage: 'gc-pink-300', terracotta: 'gc-honey-300', honey: 'gc-terracotta-300' };
const family = (tok) => (tok.match(/^gc-([a-z]+)-/) ?? [])[1];

// ---------- proportions ----------
const BODY = {
  adulte: { sh: 160, nb: 117, neckW: 31, head: [86, 100] },
  aine: { sh: 164, nb: 119, neckW: 32, head: [87, 100] },
  enfant: { sh: 124, nb: 112, neckW: 26, head: [90, 92] },
};
export const TABLE_Y = 297;
// Pose « tasse » (côté droit de l'image, repère canonique) : bord de la tasse, paume (pivot de gc-anim-sip).
export const CUP_POSE = { rim: [62, 214], palm: [134, 244] };
// Pose « toast » : tasse levée à côté du visage.
export const TOAST_POSE = { rim: [150, -36], palm: [214, -6], elbow: [228, 150] };

function headPts([rx, ry], kid) {
  const n = 30;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU - Math.PI / 2;
    const s = Math.sin(a);
    const jaw = s > 0 ? 1 - (kid ? 0.07 : 0.15) * s ** 3 : 1;
    return [rx * Math.cos(a) * jaw, ry * s];
  });
}

// Ondulation d'un contour (cheveux bouclés) : subdivise et décale le long de la normale.
function wavy(pts, amp, R, closed = true) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = dy / len, ny = -dx / len;
    out.push([x0, y0]);
    const k = Math.max(1, Math.round(len / 22));
    for (let j = 1; j <= k; j++) {
      const t = j / (k + 1), o = (j % 2 ? 1 : -0.4) * amp * R.range(0.7, 1.2);
      out.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// ---------- coiffures ----------
// Chaque coiffure renvoie : back (derrière la tête et le buste), front (devant le visage),
// over (par-dessus le buste : mèches, tresse), strands (mèches à l'encre), lights (reflets),
// ears (oreilles visibles), fringe (ombre portée sur le front).
const HAIRSTYLES = {
  court: () => ({
    front: [[-94, 16], [-97, -26], [-88, -72], [-60, -108], [-16, -124], [30, -122], [70, -104], [95, -70], [100, -24], [96, 16], [86, 18], [84, -16], [74, -44], [46, -60], [14, -64], [-14, -72], [-40, -62], [-66, -48], [-80, -20], [-84, 16]],
    strands: [[[-14, -114], [28, -92], [66, -64]], [[-46, -102], [-70, -72]], [[12, -120], [56, -98], [82, -72]]],
    lights: [[[-74, -86], [-44, -108]]],
    ears: true, fringe: true,
  }),
  'boucle-court': () => ({ curly: true, ears: true, fringe: true }),
  carre: () => ({
    back: [[-118, 86], [-119, 20], [-108, -60], [-70, -112], [0, -130], [70, -112], [108, -60], [119, 20], [122, 88], [60, 92], [0, 94], [-60, 92]],
    front: [[-116, 82], [-116, 30], [-110, -30], [-98, -78], [-66, -112], [-18, -126], [34, -122], [78, -102], [104, -66], [114, -14], [117, 40], [121, 84], [104, 90], [90, 84], [84, 40], [82, -6], [74, -34], [50, -50], [20, -58], [-4, -64], [-20, -76], [-34, -62], [-58, -48], [-76, -20], [-82, 20], [-88, 60], [-96, 86], [-108, 90]],
    strands: [[[-22, -112], [24, -96], [70, -62], [96, 0]], [[-40, -104], [-82, -52], [-98, 20]], [[-4, -120], [52, -104], [92, -50]], [[100, 30], [104, 76]], [[-102, 40], [-104, 78]]],
    lights: [[[-84, -78], [-56, -104], [-28, -114]], [[-100, -30], [-96, -56]]],
    ears: false, fringe: true,
  }),
  long: () => ({
    back: [[-118, 0], [-112, -64], [-74, -112], [0, -130], [74, -112], [112, -64], [120, 0], [132, 120], [146, 240], [150, 320], [-150, 320], [-146, 240], [-130, 120]],
    front: [[-104, 196], [-118, 120], [-118, 50], [-112, -20], [-98, -76], [-62, -112], [-10, -126], [40, -120], [82, -98], [106, -56], [116, 0], [120, 70], [118, 140], [104, 200], [94, 150], [88, 80], [83, 20], [76, -26], [54, -52], [10, -64], [-20, -78], [-40, -58], [-66, -40], [-80, -4], [-86, 60], [-92, 130]],
    strands: [[[-20, -112], [40, -96], [86, -40], [104, 60], [106, 150]], [[-46, -100], [-90, -40], [-104, 60], [-104, 160]], [[0, -122], [62, -100]]],
    lights: [[[-86, -76], [-56, -104], [-26, -116]], [[-108, 20], [-106, -20]]],
    ears: false, fringe: true,
  }),
  'long-boucle': () => ({ ...HAIRSTYLES.long(), curly: true, wavyAmp: 7 }),
  queue: () => ({
    front: [[-90, 8], [-95, -36], [-84, -78], [-54, -110], [-8, -122], [40, -116], [76, -96], [94, -56], [97, -10], [92, 10], [84, 6], [82, -26], [70, -54], [36, -70], [0, -74], [-36, -70], [-68, -54], [-82, -26], [-84, 6]],
    tail: [[66, -92], [104, -100], [132, -72], [146, -16], [148, 50], [138, 108], [122, 140], [114, 100], [112, 40], [102, -16], [80, -60]],
    tie: [80, -88],
    strands: [[[-60, -96], [-10, -112], [50, -104]], [[-74, -70], [-30, -96]], [[120, -40], [132, 40], [128, 100]]],
    lights: [[[-80, -82], [-50, -106]]],
    ears: true, fringe: false,
  }),
  chignon: () => ({
    front: [[-90, 6], [-96, -36], [-86, -80], [-56, -112], [-6, -124], [44, -116], [78, -94], [95, -54], [97, -10], [92, 8], [84, 4], [80, -28], [62, -56], [26, -70], [0, -84], [-26, -70], [-62, -56], [-80, -28], [-84, 4]],
    bun: [0, -134, 40],
    strands: [[[0, -84], [-40, -108], [-78, -86]], [[0, -84], [44, -108], [80, -84]], [[-86, -6], [-92, 22]]],
    lights: [[[-78, -84], [-48, -108]]],
    ears: true, fringe: false,
  }),
  tresse: () => ({
    front: [[-92, 10], [-97, -34], [-86, -78], [-56, -112], [-6, -124], [44, -116], [78, -94], [96, -52], [103, 0], [106, 56], [100, 88], [86, 74], [82, 24], [82, -22], [64, -54], [24, -70], [-4, -84], [-26, -70], [-62, -56], [-80, -28], [-86, 10]],
    braid: { from: [94, 80], to: [126, 262], n: 8 },
    strands: [[[-4, -84], [-46, -106], [-80, -80]], [[-4, -84], [42, -106], [84, -74]]],
    lights: [[[-80, -84], [-48, -108]]],
    ears: true, fringe: false,
  }),
  frange: () => ({
    back: [[-116, 140], [-114, 0], [-104, -70], [-62, -114], [0, -128], [62, -114], [104, -70], [114, 0], [118, 140], [0, 150]],
    front: [[-118, 134], [-118, 30], [-110, -40], [-90, -92], [-46, -122], [10, -128], [60, -118], [96, -86], [114, -36], [118, 30], [120, 132], [106, 146], [94, 116], [88, 60], [84, 0], [82, -30], [64, -33], [48, -29], [30, -35], [12, -31], [-6, -36], [-24, -31], [-42, -36], [-62, -31], [-82, -32], [-84, 0], [-88, 60], [-96, 120], [-106, 146]],
    strands: [[[-60, -110], [-58, -50]], [[-20, -122], [-18, -46]], [[24, -122], [24, -46]], [[64, -112], [62, -48]], [[100, 40], [104, 120]], [[-102, 40], [-106, 120]]],
    lights: [[[-86, -88], [-52, -112]]],
    ears: false, fringe: true,
  }),
  foulard: () => ({ scarf: true, ears: false, fringe: false }),
  degarni: () => ({
    back: [[-96, -36], [-102, 0], [-96, 34], [-80, 50], [80, 50], [96, 34], [102, 0], [96, -36], [70, -30], [-70, -30]],
    front: null,
    tufts: [[[-84, 22], [-98, -6], [-96, -40], [-84, -56], [-80, -34], [-80, -6]], [[84, 22], [98, -6], [96, -40], [84, -56], [80, -34], [80, -6]]],
    strands: [[[-20, -96], [4, -104], [26, -98]]],
    lights: [],
    bald: true, ears: true, fringe: false,
  }),
};

const RIM = { color: c('gc-glow', 0.5), width: 8 };
function hairFill(ctx, sh, n, S, opts = {}) {
  return drawShape(ctx, sh, { fill: HAIR(n), shade: HAIR_SHADE(n), light: opts.light ?? [-12, -10], k: opts.k ?? 0.98, w: S, rim: opts.rim === false ? null : { ...RIM, exclude: opts.exclude } });
}
function hairDetails(spec, n, R, s) {
  let out = '';
  for (const pts of spec.strands ?? []) out += inkPath(stroke(pts, R, 1.2), s * 0.9, ' opacity="0.55"');
  for (const pts of spec.lights ?? []) out += inkPath(stroke(pts, R, 1), 5, '', HAIR_LIGHT(n));
  return out;
}

// ---------- visage ----------
function faceFeatures(ctx, look, R, { S, s, kid, old, expression, eyes, lashes, sipEyes, anim = true }) {
  const sk = look.skin;
  const ey = kid ? 22 : 18, ex = kid ? 31 : 33;
  const [erx, ery] = kid ? [7.8, 9.8] : [7.2, 9.2];
  let out = '';
  // joues
  const [ch, halo] = CHEEKS(sk);
  for (const sx of [-1, 1]) {
    out += fillPath(shape(ellipsePts(sx * 52, kid ? 50 : 46, 21, 13, 12), R, 0.8).d, halo);
    out += fillPath(shape(ellipsePts(sx * 52, kid ? 50 : 46, 14, 8.5, 10), R, 0.6).d, ch);
  }
  // yeux
  let eyesM = '';
  if (eyes === 'rieurs') {
    for (const sx of [-1, 1]) eyesM += inkPath(stroke([[sx * ex - 9, ey + 2], [sx * ex, ey - 6], [sx * ex + 9, ey + 2]], R, 0.4), S * 0.85);
    out += eyesM;
  } else {
    for (const sx of [-1, 1]) {
      if (sk >= 5) eyesM += fillPath(shape(ellipsePts(sx * ex, ey, erx + 2.6, ery + 2.4, 12), R, 0.3).d, c('gc-paper-lace', 0.55));
      eyesM += fillPath(shape(ellipsePts(sx * ex, ey, erx, ery, 12), R, 0.4).d, c('gc-ink'));
      eyesM += `<circle cx="${f(sx * ex - 2.2)}" cy="${f(ey - 3)}" r="${kid ? 2.6 : 2.2}" fill="${c('gc-paper-lace')}"/>`;
      if (lashes) eyesM += inkPath(stroke([[sx * (ex + erx - 1), ey - ery * 0.5], [sx * (ex + erx + 6), ey - ery * 0.9]], R, 0), s * 1.1);
    }
    if (!anim) out += `<g>${eyesM}</g>`;
    else out += sipEyes ? `<g class="gc-anim-sip-eyes"><g class="gc-anim-blink">${eyesM}</g></g>` : `<g class="gc-anim-blink">${eyesM}</g>`;
  }
  // sourcils
  const by = kid ? 0 : -10;
  for (const sx of [-1, 1]) out += inkPath(stroke([[sx * (ex - 12), by + 1], [sx * (ex - 1), by - 4], [sx * (ex + 12), by + 2]], R, 0.4), look.age === 'aine' ? 4.6 : 3.8, '', BROW(look.hair));
  // nez : petite virgule côté ombre
  out += inkPath(stroke([[3, kid ? 34 : 32], [9, kid ? 42 : 41], [1, kid ? 45 : 45]], R, 0.4), s * 1.1, ' opacity="0.85"');
  // rides d'expression
  if (old) for (const sx of [-1, 1]) {
    out += inkPath(stroke([[sx * (ex + 14), ey - 4], [sx * (ex + 19), ey + 2]], R, 0.3), s * 0.8, ' opacity="0.6"');
    out += inkPath(stroke([[sx * (ex + 13), ey + 4], [sx * (ex + 18), ey + 9]], R, 0.3), s * 0.8, ' opacity="0.5"');
    out += inkPath(stroke([[sx * 26, 44], [sx * 30, 56], [sx * 26, 64]], R, 0.4), s * 0.9, ' opacity="0.45"');
  }
  // barbe / moustache (avant la bouche)
  if (look.beard === 'barbe') {
    const b = shape([[-86, -6], [-89, 40], [-72, 90], [-36, 120], [0, 128], [36, 120], [72, 90], [89, 40], [86, -6], [76, 0], [66, 32], [46, 50], [22, 46], [0, 44], [-22, 46], [-46, 50], [-66, 32], [-76, 0]], R, 0.8);
    out += hairFill(ctx, b, look.hair, S, { light: [-8, -12] });
    for (let i = 0; i < 14; i++) {
      const px = R.range(-60, 60), py = R.range(66, 108);
      out += inkPath(stroke([[px, py], [px + R.range(-2, 2), py + 5]], null, 0), s * 0.8, ' opacity="0.4"');
    }
  }
  const my = kid ? 66 : 63;
  if (look.beard === 'barbe') out += solidPath(shape([[-18, my - 4], [18, my - 4], [12, my + 9], [0, my + 11], [-12, my + 9]], R, 0.5).d, SKIN(sk), s);
  if (look.beard) {
    const m = shape([[-34, my - 2], [-24, my - 14], [-8, my - 18], [0, my - 14], [8, my - 18], [24, my - 14], [34, my - 2], [20, my - 6], [0, my - 7], [-20, my - 6]], R, 0.6);
    out += hairFill(ctx, m, look.hair, s * 1.2, { light: [-3, -4] });
  }
  // bouche
  if (expression === 'rire') {
    const m = shape([[-17, my - 4], [17, my - 4], [10, my + 9], [0, my + 12], [-10, my + 9]], R, 0.5);
    out += solidPath(m.d, c('gc-terracotta-700'), s * 1.2);
    out += fillPath(shape([[-7, my + 7], [7, my + 7], [0, my + 10.5]], R, 0.3).d, c('gc-pink-500'));
  } else {
    const wdt = expression === 'doux' ? 11 : 15;
    out += inkPath(stroke([[-wdt, my - 1], [-wdt * 0.45, my + 6], [wdt * 0.45, my + 6], [wdt, my - 1]], R, 0.4), S * 0.78);
  }
  // lunettes
  if (look.glasses) {
    const col = look.age === 'aine' ? c('gc-honey-700') : c('gc-ink');
    for (const sx of [-1, 1]) {
      const lens = shape(ellipsePts(sx * 34, ey - 1, 25, 23, 18), R, 0.5);
      out += fillPath(lens.d, c('gc-paper-lace', 0.2));
      out += inkPath(lens.d, S * 0.75, '', col);
      out += inkPath(stroke([[sx * 34 - 14, ey - 12], [sx * 34 - 6, ey - 17]], R, 0), 2.4, '', c('gc-paper-lace', 0.9));
      out += inkPath(stroke([[sx * 59, ey - 4], [sx * 82, ey - 8]], R, 0.3), S * 0.7, '', col);
    }
    out += inkPath(stroke([[-9, ey - 2], [0, ey - 6], [9, ey - 2]], R, 0.3), S * 0.7, '', col);
  }
  return out;
}

// ---------- mains ----------
// Main simplifiée (moufle douce). kind : 'grip' (tient une anse), 'flat' (posée), 'fist' (tient un manche).
function hand(ctx, look, { x, y, kind = 'flat', rot = 0, s, S, R, flip = 1 }) {
  const sk = look.skin;
  let pts, extra = '';
  if (kind === 'grip') {
    pts = [[-10, -22], [10, -24], [24, -10], [24, 12], [12, 26], [-6, 26], [-16, 12]];
    const fingers = shape([[-6, -12], [-22, -14], [-29, -4], [-27, 8], [-29, 19], [-21, 27], [-4, 24]], R, 0.4);
    const thumb = shape([[-4, -20], [-22, -29], [-30, -25], [-20, -14]], R, 0.4);
    extra = drawShape(ctx, fingers, { fill: SKIN(sk), w: s * 1.2 }) + drawShape(ctx, thumb, { fill: SKIN(sk), w: s * 1.2 });
    for (const k of [2, 14]) extra += inkPath(stroke([[-28, k], [-17, k + 1]], null, 0), s * 0.9, ' opacity="0.75"');
  } else if (kind === 'fist') {
    pts = [[-18, -14], [6, -20], [22, -10], [22, 10], [8, 20], [-14, 18], [-22, 4]];
    const thumb = shape([[-6, -16], [16, -24], [24, -20], [10, -10]], R, 0.4);
    extra = drawShape(ctx, thumb, { fill: SKIN(sk), w: s });
    for (const k of [-6, 2, 10]) extra += inkPath(stroke([[-20, k], [-12, k + 1]], R, 0), s * 0.8, ' opacity="0.7"');
  } else {
    pts = [[-34, -6], [-24, -16], [4, -16], [22, -10], [26, 4], [16, 14], [-12, 16], [-30, 10]];
    const thumb = shape([[-6, -14], [-20, -24], [-28, -20], [-18, -10]], R, 0.4);
    extra = drawShape(ctx, thumb, { fill: SKIN(sk), w: s });
    for (const k of [-4, 4]) extra += inkPath(stroke([[-34, k], [-24, k]], R, 0), s * 0.8, ' opacity="0.7"');
  }
  const palm = shape(pts, R, 0.6);
  const body = drawShape(ctx, palm, { fill: SKIN(sk), shade: SKIN_SHADE(sk), light: [-6, -6], w: S * 0.85 }) + extra;
  return `<g transform="translate(${f(x)} ${f(y)})${rot ? ` rotate(${f(rot)})` : ''}${flip === -1 ? ' scale(-1 1)' : ''}">${body}</g>`;
}

// Manche (bande épaisse) entre deux points, largeurs w0 → w1, avec poignet côtelé au bout « a ».
function sleeve(ctx, look, a, b, w0, w1, { S, s, R, cuff = true, bulge = 1.08 }) {
  const [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const m = [(ax + bx) / 2, (ay + by) / 2], wm = ((w0 + w1) / 2) * bulge;
  const pts = [[ax + nx * w0, ay + ny * w0], [m[0] + nx * wm, m[1] + ny * wm], [bx + nx * w1, by + ny * w1], [bx - nx * w1, by - ny * w1], [m[0] - nx * wm, m[1] - ny * wm], [ax - nx * w0, ay - ny * w0]];
  const sh = shape(pts, R, 0.8, 0.8);
  let out = drawShape(ctx, sh, { fill: c(look.top), shade: TOP_SHADE(), light: [-12, -8], hatched: true, w: S });
  if (cuff) {
    const ux = dx / len, uy = dy / len, cw = w0 * 1.06;
    const cpts = [[ax + nx * cw, ay + ny * cw], [ax + nx * cw + ux * 16, ay + ny * cw + uy * 16], [ax - nx * cw + ux * 16, ay - ny * cw + uy * 16], [ax - nx * cw, ay - ny * cw]];
    const cs = shape(cpts, R, 0.5, 0.5);
    out += drawShape(ctx, cs, { fill: c(look.top), shade: TOP_SHADE(), light: [-4, -4], w: S * 0.9 });
    for (let i = -2; i <= 2; i++) {
      const t = i / 2.6;
      out += inkPath(stroke([[ax + nx * cw * t + ux * 2, ay + ny * cw * t + uy * 2], [ax + nx * cw * t + ux * 14, ay + ny * cw * t + uy * 14]], null, 0), s * 0.7, ' opacity="0.5"');
    }
  }
  return out;
}

// ---------- personnage ----------
// pose : { left, right } (côtés de l'IMAGE) parmi 'repos' | 'tasse' | 'toast' | 'fourchette' | 'cache'.
//   'tasse' (un seul côté) : tient une tasse à hauteur de poitrine, animable (gc-anim-sip / gc-anim-sip-left).
//   'toast' : lève sa tasse à côté du visage (mosaïque « tasse levée »), animable (gc-anim-toast).
//   'fourchette' : avant-bras posé sur la table, fourchette vers `forkTo`.
//   'repos' : avant-bras posé sur la table, main à plat. 'cache' : bras le long du corps (sous la table).
// Renvoie { back, front } : back = derrière la table (buste, tête, bras levés), front = sur la table.
export function person(ctx, look, opts = {}) {
  const {
    x = 0, y = 0, scale = 1, pose = { left: 'repos', right: 'repos' }, tilt = 0, neckline = 'rond',
    expression = 'sourire', eyes = 'ouverts', lashes = false, liquid = 'the', cupDecor = 'roses', steaming = true,
    forkTo = null, accessory = null, scarf = null, anim = true, slug = 'p', tableY = TABLE_Y,
  } = opts;
  const age = look.age ?? 'adulte';
  const kid = age === 'enfant', old = age === 'aine';
  const B = BODY[age];
  const S = STROKE.main / scale, s = STROKE.detail / scale;
  const R = ctx.rng(`person:${slug}`);
  const W = { S, s, R };
  const hs = (HAIRSTYLES[look.hairStyle] ?? HAIRSTYLES.court)();
  const sk = look.skin;
  const nb = B.nb, w = B.sh;
  const cls = (name) => (anim ? ` class="${name}"` : '');

  // --- cheveux derrière + ombre portée sur le mur gérée par la scène ---
  let headBack = '';
  if (hs.curly && !hs.back) {
    headBack += hairFill(ctx, { d: scallopsHair(0, -42, 108, 84, 22, 4.5), pts: ellipsePts(0, -42, 112, 88, 22) }, look.hair, S);
  }
  if (hs.back) {
    const pts = hs.curly ? wavy(hs.back, hs.wavyAmp ?? 6, R) : hs.back;
    headBack += hairFill(ctx, shape(pts, R, 1.2), look.hair, S, { light: [-14, -10] });
  }
  if (hs.tail) {
    const t = shape(hs.tail, R, 1);
    headBack += hairFill(ctx, t, look.hair, S, { light: [-10, -6] });
    headBack += inkPath(stroke([[110, -60], [128, 0], [128, 80]], R, 1), s, ' opacity="0.5"');
  }
  if (hs.bun) {
    const [bx, by, br] = hs.bun;
    const bun = shape(ellipsePts(bx, by, br * 1.15, br, 18), R, 1.2);
    headBack += hairFill(ctx, bun, look.hair, S, { light: [-8, -8] });
    headBack += inkPath(stroke([[bx - 22, by + 6], [bx - 10, by - 18], [bx + 16, by - 16], [bx + 20, by + 4], [bx + 2, by + 8]], R, 1), s, ' opacity="0.55"');
    headBack += inkPath(stroke([[bx - 26, by - 12], [bx - 10, by - 28]], R, 0.6), 5, '', HAIR_LIGHT(look.hair));
  }
  if (hs.scarf) {
    const sc = scarf ?? SCARF_FOR[family(look.top)] ?? 'gc-sage-300';
    const back = shape([[-150, 250], [-146, 170], [-124, 110], [-116, 40], [116, 40], [124, 110], [146, 170], [150, 250]], R, 1);
    headBack += drawShape(ctx, back, { fill: c(sc), shade: TOP_SHADE(), w: S });
  }

  // --- cou ---
  const neck = shape([[-B.neckW, 40], [B.neckW, 40], [B.neckW + 3, nb + 16], [-B.neckW - 3, nb + 16]], R, 0.8, 0.6);
  let body = drawShape(ctx, neck, { fill: SKIN(sk), shade: SKIN_SHADE(sk), light: [-10, 26], k: 1, w: S });

  // --- buste ---
  const torsoPts = [[-38, nb - 4], [-92, nb + 8], [-(w - 22), nb + 26], [-(w - 2), nb + 52], [-(w + 6), nb + 100], [-(w + 8), nb + 190], [-(w + 10), 480], [w + 10, 480], [w + 8, nb + 190], [w + 6, nb + 100], [w - 2, nb + 52], [w - 22, nb + 26], [92, nb + 8], [38, nb - 4], [20, nb + 16], [0, nb + 22], [-20, nb + 16]];
  const torso = shape(torsoPts, R, 1, 0.9);
  body += drawShape(ctx, torso, { fill: c(look.top), shade: TOP_SHADE(), light: [-26, -6], hatched: true, w: S, rim: RIM });
  // tricot : quelques mailles
  for (let i = 0; i < 16; i++) {
    const px = R.range(-w + 30, w - 40), py = R.range(nb + 50, tableY - 10);
    if (Math.abs(px) < 50 && py < nb + 70) continue;
    body += inkPath(stroke([[px - 3.5, py - 3], [px, py + 2], [px + 3.5, py - 3]], null, 0), s * 0.8, ' opacity="0.28"');
  }
  // encolure
  if (neckline === 'claudine') {
    for (const sx of [-1, 1]) {
      const pet = shape(sx === 1 ? mirrorX(collarPts(nb)) : collarPts(nb), R, 0.6);
      body += drawShape(ctx, pet, { fill: c('gc-paper-lace'), shade: c('gc-porcelain-shade'), light: [-5, -5], w: S * 0.85 });
    }
    body += solidPath(shape(ellipsePts(0, nb + 64, 5, 5, 8), R, 0.3).d, c('gc-paper-lace'), s);
    body += solidPath(shape(ellipsePts(0, nb + 100, 5, 5, 8), R, 0.3).d, c('gc-paper-lace'), s);
  } else if (neckline === 'v') {
    const v = shape([[-36, nb - 2], [0, nb + 66], [36, nb - 2], [20, nb + 16], [0, nb + 22], [-20, nb + 16]], R, 0.5, 0.6);
    body += drawShape(ctx, v, { fill: c('gc-paper-lace'), w: S * 0.8 });
    body += inkPath(stroke([[-46, nb + 2], [0, nb + 80], [46, nb + 2]], R, 0.6, 0.6), S * 0.8);
  } else if (neckline === 'roule') {
    const tn = shape([[-34, 70], [34, 70], [40, nb + 20], [0, nb + 30], [-40, nb + 20]], R, 0.8, 0.7);
    body += drawShape(ctx, tn, { fill: c(look.top), shade: TOP_SHADE(), light: [-10, -4], w: S });
    for (const k of [-24, -10, 4, 18, 30]) body += inkPath(stroke([[k, 76], [k * 1.1, nb + 20]], R, 0.5), s * 0.8, ' opacity="0.4"');
  } else {
    const band = shape([[-40, nb - 5], [-20, nb + 15], [0, nb + 21], [20, nb + 15], [40, nb - 5], [48, nb + 4], [22, nb + 29], [0, nb + 35], [-22, nb + 29], [-48, nb + 4]], R, 0.5);
    body += drawShape(ctx, band, { fill: c(look.top), shade: TOP_SHADE(), light: [-4, -6], w: S * 0.85 });
    for (let i = -4; i <= 4; i++) body += inkPath(stroke([[i * 9, nb + 18 - Math.abs(i) * 3.4], [i * 9.6, nb + 30 - Math.abs(i) * 3.6]], null, 0), s * 0.7, ' opacity="0.45"');
  }

  // --- bras supérieurs (pendants), côté par côté ---
  const upper = (sx) => {
    const pts = [[w - 30, nb + 22], [w - 4, nb + 40], [w + 18, nb + 90], [w + 26, nb + 170], [w + 30, 480], [w - 36, 480], [w - 36, nb + 170], [w - 34, nb + 100], [w - 36, nb + 50]];
    const sh = shape(sx === 1 ? pts : mirrorX(pts), R, 1);
    return drawShape(ctx, sh, { fill: c(look.top), shade: TOP_SHADE(), light: [-16, -6], hatched: true, w: S, rim: sx < 0 ? RIM : null });
  };
  const sides = { left: pose.left ?? 'repos', right: pose.right ?? 'repos' };
  for (const [side, p] of Object.entries(sides)) if (p !== 'toast') body += upper(side === 'right' ? 1 : -1);

  // --- tête (inclinée autour du menton) ---
  const tiltT = tilt ? ` transform="rotate(${f(tilt)} 0 96)"` : '';
  let head = '';
  const hp = shape(headPts(B.head, kid), R, 0.9);
  if (hs.ears) for (const sx of [-1, 1]) {
    const ear = shape(ellipsePts(sx * (B.head[0] - 2), 14, 13, 19, 12), R, 0.6);
    head += drawShape(ctx, ear, { fill: SKIN(sk), shade: SKIN_SHADE(sk), light: [-4, -4], w: S });
    head += inkPath(stroke([[sx * (B.head[0] + 3), 6], [sx * (B.head[0] - 2), 12], [sx * (B.head[0] + 2), 22]], R, 0.3), s, ' opacity="0.7"');
  }
  head += drawShape(ctx, hp, { fill: SKIN(sk), shade: SKIN_SHADE(sk), light: [-13, -8], k: 0.97, w: S, rim: { color: c('gc-glow', 0.35), width: 7 } });
  if (hs.bald) head += inkPath(stroke([[-56, -74], [-34, -88]], R, 0.5), 7, '', c('gc-paper-lace', 0.5));
  // ombre de la frange sur le front
  if (hs.fringe && hs.front) {
    const fr = shape(move(hs.front, 7, 10), R, 0);
    head += `<g ${clip(ctx, hp)}>${fillPath(fr.d, SKIN_SHADE(sk))}</g>`;
  }
  if (hs.curly && !hs.back) head += `<g ${clip(ctx, hp)}>${fillPath(scallopsHair(7, -78, 86, 40, 16, 3), SKIN_SHADE(sk))}</g>`;
  const sipping = anim && (sides.left === 'tasse' || sides.right === 'tasse');
  head += faceFeatures(ctx, look, R, { S, s, kid, old, expression, eyes, lashes, sipEyes: sipping, anim });
  // cheveux devant
  if (hs.curly && !hs.back) {
    const cap = { d: scallopsHair(0, -86, 88, 40, 16, 3), pts: ellipsePts(0, -86, 92, 44, 16) };
    head += hairFill(ctx, cap, look.hair, S, { light: [-8, -6] });
    for (let i = 0; i < 9; i++) {
      const px = R.range(-80, 80), py = R.range(-120, -60);
      head += inkPath(stroke([[px - 5, py + 2], [px, py - 4], [px + 5, py + 1]], R, 0.3), s, ' opacity="0.5"');
    }
    head += inkPath(stroke([[-84, -96], [-62, -114]], R, 0.5), 5, '', HAIR_LIGHT(look.hair));
  } else if (hs.front) {
    const pts = hs.curly ? wavy(hs.front, hs.wavyAmp ?? 6, R) : hs.front;
    head += hairFill(ctx, shape(pts, R, 1), look.hair, S, { exclude: hp });
    head += hairDetails(hs, look.hair, R, s);
  }
  if (hs.tufts) for (const t of hs.tufts) head += hairFill(ctx, shape(t, R, 0.8), look.hair, S * 0.9, { light: [-4, -4] }) + hairDetails(hs, look.hair, R, s);
  if (hs.tie) head += drawShape(ctx, shape(ellipsePts(hs.tie[0], hs.tie[1], 14, 10, 12, -0.5), R, 0.6), { fill: c('gc-terracotta-500'), w: S * 0.85 });
  if (hs.scarf) {
    const sc = scarf ?? SCARF_FOR[family(look.top)] ?? 'gc-sage-300';
    const outer = [[-150, 250], [-146, 172], [-122, 112], [-112, 40], [-112, -30], [-100, -86], [-64, -122], [0, -134], [64, -122], [100, -86], [112, -30], [112, 40], [122, 112], [146, 172], [150, 250], [60, 268], [0, 272], [-60, 268]];
    const so = shape(outer, R, 1);
    const inner = shape(ellipsePts(0, 8, 76, 96, 24), R, 0.8);
    const d = `${so.d}${inner.d}`;
    head += `<path d="${d}" fill="${c(sc)}" fill-rule="evenodd"/>`;
    head += shadeIn(ctx, so, { color: TOP_SHADE(), light: [-18, -8] });
    head += `<path d="${d}" fill="none" ${`stroke="${c('gc-ink')}" stroke-width="${f(S)}" stroke-linejoin="round"`}/>`;
    for (const pts of [[[-96, 120], [-60, 150], [-20, 176]], [[96, 120], [70, 160], [40, 190]], [[-104, -40], [-96, 30]], [[0, 106], [8, 150]]]) head += inkPath(stroke(pts, R, 1), s, ' opacity="0.5"');
    for (let i = 0; i < 18; i++) head += `<circle cx="${f(R.range(-130, 130))}" cy="${f(R.range(130, 250))}" r="2.2" fill="${c('gc-paper-lace', 0.6)}"/>`;
    head += solidPath(shape(ellipsePts(-62, 112, 6, 6, 8), R, 0.3).d, c('gc-honey-500'), s);
  }
  if (accessory === 'barrette') head += solidPath(shape([[-78, -60], [-54, -76], [-50, -70], [-74, -54]], R, 0.4, 0.5).d, c('gc-honey-500'), s * 1.2);
  if (accessory === 'boucles' && hs.ears !== true) for (const sx of [-1, 1]) head += solidPath(shape(ellipsePts(sx * 86, 70, 5, 5, 8), R, 0.3).d, c('gc-honey-500'), s);
  if (accessory === 'boucles' && hs.ears) for (const sx of [-1, 1]) head += solidPath(shape(ellipsePts(sx * 84, 36, 5, 5, 8), R, 0.3).d, c('gc-honey-500'), s);

  // --- mèches et tresse par-dessus le buste ---
  let over = '';
  if (hs.braid) {
    const { from: [fx, fy], to: [tx, ty], n } = hs.braid;
    // natte : maillons en chevrons qui se chevauchent, du haut vers le bas
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const cx = fx + (tx - fx) * t, cy = fy + (ty - fy) * t, r = 25 - t * 7;
      const sd = i % 2 ? 1 : -1;
      const lobe = shape([[cx - sd * r * 0.95, cy - r * 0.7], [cx + sd * r * 0.2, cy - r * 0.35], [cx + sd * r * 0.9, cy + r * 0.25], [cx + sd * r * 0.3, cy + r * 0.85], [cx - sd * r * 0.7, cy + r * 0.3]], R, 0.5, 0.95);
      over += hairFill(ctx, lobe, look.hair, s * 1.5, { light: [-4, -4], rim: false });
    }
    over += solidPath(shape(ellipsePts(tx + 2, ty + 18, 9, 7, 10), R, 0.4).d, c('gc-terracotta-500'), s);
    over += hairFill(ctx, shape([[tx - 8, ty + 24], [tx + 12, ty + 24], [tx + 16, ty + 52], [tx + 2, ty + 44], [tx - 10, ty + 52]], R, 0.6), look.hair, s * 1.4, { light: [-3, -3] });
  }

  // --- bras actifs ---
  let raised = '';
  let front = '';
  for (const [side, p] of Object.entries(sides)) {
    const sx = side === 'right' ? 1 : -1;
    const X = (pt) => [sx * pt[0], pt[1]];
    if (p === 'tasse') {
      const [rx, ry] = CUP_POSE.rim, [px, py] = CUP_POSE.palm;
      let grp = pivotBox(X([px, py]), 760);
      grp += sleeve(ctx, look, X([150, 268]), X([262, 620]), 24, 32, W);
      grp += teacup(ctx, { x: sx * rx, y: ry, liquid, handle: sx === 1 ? 'right' : 'left', decor: cupDecor, scale: 1 });
      if (steaming) grp += `<g${cls('gc-anim-steam-sip')}>${steam(ctx, { x: sx * rx, y: ry - 14, anim })}</g>`;
      grp += hand(ctx, look, { x: sx * px, y: py, kind: 'grip', flip: sx, ...W });
      raised += `<g${cls(sx === 1 ? 'gc-anim-sip' : 'gc-anim-sip-left')}>${grp}</g>`;
    } else if (p === 'toast') {
      const [rx, ry] = TOAST_POSE.rim, [px, py] = TOAST_POSE.palm, [ex, ey] = TOAST_POSE.elbow;
      const up = sleeve(ctx, look, X([w - 10, nb + 40]), X([ex, ey]), 34, 30, { ...W, cuff: false });
      let grp = pivotBox(X([ex, ey]), 760);
      grp += sleeve(ctx, look, X([px + 6, py + 26]), X([ex, ey + 10]), 24, 30, W);
      grp += teacup(ctx, { x: sx * rx, y: ry, liquid, handle: sx === 1 ? 'right' : 'left', decor: cupDecor, rotate: -sx * 6 });
      grp += hand(ctx, look, { x: sx * px, y: py, kind: 'grip', flip: sx, rot: -sx * 6, ...W });
      raised += up + `<g${cls(sx === 1 ? 'gc-anim-toast' : 'gc-anim-toast-left')}>${grp}</g>`;
    } else if (p === 'repos' || p === 'fourchette') {
      const elbow = X([w - 4, tableY - 22]);
      const wrist = p === 'repos' ? X([86, tableY + 62]) : X([w - 40, tableY + 60]);
      let arm = '';
      if (p === 'fourchette') {
        const fist = X([w - 58, tableY + 76]);
        const to = forkTo ?? X([w - 160, tableY + 100]);
        const ang = (Math.atan2(to[1] - fist[1], to[0] - fist[0]) * 180) / Math.PI;
        arm += forkProp(ctx, { x: fist[0] - 36 * Math.cos((ang * Math.PI) / 180), y: fist[1] - 36 * Math.sin((ang * Math.PI) / 180), rotate: ang, scale: 1.3 });
        arm += sleeve(ctx, look, wrist, elbow, 23, 30, { ...W, bulge: 1.02 });
        arm += hand(ctx, look, { x: fist[0], y: fist[1], kind: 'fist', rot: sx === 1 ? ang - 180 : ang, flip: sx === 1 ? -1 : 1, ...W });
      } else {
        arm += sleeve(ctx, look, wrist, elbow, 22, 29, { ...W, bulge: 1.02 });
        arm += hand(ctx, look, { x: sx * 56, y: tableY + 70, kind: 'flat', flip: sx === 1 ? 1 : -1, rot: sx * -8, ...W });
      }
      front += arm;
    }
  }

  const headGroup = `<g${tiltT}>${headBack}</g>`;
  const headFront = `<g${tiltT}>${head}</g>`;
  const bust = pivotBox([0, 420], 760) + headGroup + body + over + headFront + raised;
  const T = `transform="translate(${f(x)} ${f(y)})${scale !== 1 ? ` scale(${f(scale)})` : ''}"`;
  return {
    back: `<g ${T}><g${cls('gc-anim-breathe')}>${bust}</g></g>`,
    front: front ? `<g ${T}>${front}</g>` : '',
    // Silhouette (tête + buste) pour l'ombre portée sur le mur, dans le repère du personnage.
    silhouette: `<g ${T}><g${tiltT}><path d="${shape(hs.back ?? ellipsePts(0, -20, 116, 120, 16), R, 0).d}"/><path d="${hp.d}"/></g><path d="${torso.d}"/></g>`,
  };
}

// Petit col Claudine (moitié gauche).
function collarPts(nb) {
  return [[-4, nb + 22], [-24, nb + 14], [-40, nb - 3], [-58, nb + 6], [-62, nb + 26], [-48, nb + 42], [-22, nb + 44], [-6, nb + 34]];
}

// Contour bouclé (festons) pour les cheveux frisés courts.
function scallopsHair(cx, cy, rx, ry, n, depth) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
    const [x0, y0] = [cx + rx * Math.cos(a0), cy + ry * Math.sin(a0)];
    const [x1, y1] = [cx + rx * Math.cos(a1), cy + ry * Math.sin(a1)];
    const k = 1 + (depth * 2.2) / Math.max(rx, ry);
    const [qx, qy] = [cx + rx * k * Math.cos(am), cy + ry * k * Math.sin(am)];
    d += (i === 0 ? `M${f(x0)} ${f(y0)}` : '') + `Q${f(qx)} ${f(qy)} ${f(x1)} ${f(y1)}`;
  }
  return d + 'Z';
}

// ---------- assemblage ----------
// Document SVG d'une scène : defs du contexte + calques. Pas de <style>, <text>, <filter>, ni commentaire.
//   precision : décimales gardées dans les tracés (0 pour une scène à l'échelle 1 : erreur < 0,6 px à 1920).
export function sceneDoc(ctx, [w, h], layers, { precision = 1 } = {}) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${ctx.defs()}${layers.join('')}</svg>\n`;
  if (precision === 0) {
    // un « -0,4 » arrondi à « 0 » perd son signe, qui servait de séparateur : on remet une espace
    const round = (n) => { const r = String(Math.round(+n)); return n[0] === '-' && r[0] !== '-' ? ` ${r}` : r; };
    svg = svg.replace(/ d="([^"]+)"/g, (_m, d) => ` d="${d.replace(/-?\d*\.\d+/g, round).replace(/([A-Za-z]) /g, '$1').replace(/ -/g, '-')}"`);
  }
  return svg;
}
