// Recettes de filtres SVG du papier ancien (cuisson seulement : jamais à l'exécution).
// Chaque fonction renvoie un <filter> complet (chaîne) ; bake-paper.mjs les assemble en documents
// SVG et les fait cuire par Chromium (scripts/lib/bake.mjs). Couleurs : toujours c('gc-…').
//
//   import { paperBase, ageMottle, cockle, soften, foxSpots, tideMark } from './lib/fx-papier.mjs';
//
// Conventions
//   - Région du filtre en unités utilisateur (filterUnits = primitiveUnits = userSpaceOnUse).
//   - color-interpolation-filters="sRGB" : les gains et seuils se lisent en valeurs sRGB.
//   - Bruits raccordables : stitchTiles="stitch" et fréquences multiples de 1/taille (per()).
//   - Relief : un champ de hauteur (bruit → alpha) éclairé par feDiffuseLighting, lumière en haut
//     à gauche (azimut 225°). L'écart à la valeur d'une surface plane (sin(élévation)) donne deux
//     calques alpha : un clair (crème) là où la pente regarde la lumière, un brun là où elle s'en
//     détourne. Ils se posent l'un sur l'autre sans mix-blend-mode.
import { PNG } from 'pngjs';
import { c } from './tokens.mjs';
import { f } from './organic.mjs';
import { rng } from './prng.mjs';

/** Fréquence raccordable : k périodes sur `size` px. */
export const per = (k, size) => +(Math.max(1, Math.round(k)) / size).toFixed(6);
const freqOf = (freq) => (Array.isArray(freq) ? freq.map((v) => +v.toFixed(6)).join(' ') : freq);

let uid = 0;
const nid = (p = 'p') => `${p}${++uid}`;

const head = (id, [x, y, w, h]) =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB">`;

const turbulence = ({ freq, octaves = 3, seed = 1, type = 'fractalNoise', stitch = true }, result) =>
  `<feTurbulence type="${type}" baseFrequency="${freqOf(freq)}" numOctaves="${octaves}" seed="${seed}"${stitch ? ' stitchTiles="stitch"' : ''} result="${result}"/>`;

// Alpha = gain × R + bias, sur une couleur unie (opacité facultative).
function tint(src, { color, gain, bias, opacity = 1 }) {
  const n = nid('t');
  return {
    prims:
      `<feColorMatrix in="${src}" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${f(gain)} 0 0 0 ${+bias.toFixed(4)}" result="${n}a"/>` +
      `<feFlood flood-color="${color}" flood-opacity="${f(opacity)}" result="${n}c"/>` +
      `<feComposite in="${n}c" in2="${n}a" operator="in" result="${n}"/>`,
    out: n,
  };
}

/**
 * Bruit teinté : un calque de couleur dont l'alpha suit un bruit (nuages, marbrures, épair).
 * @returns {{prims: string, out: string}}
 */
export function noiseTint({ freq, octaves = 3, seed = 1, type = 'fractalNoise', stitch = true, color, gain, bias, opacity = 1 }) {
  const n = nid('n');
  const t = tint(n, { color, gain, bias, opacity });
  return { prims: turbulence({ freq, octaves, seed, type, stitch }, n) + t.prims, out: t.out };
}

/**
 * Relief éclairé d'un champ de hauteur `height` (nom d'un résultat dont l'alpha est la hauteur).
 * Renvoie les primitives et les deux calques : `light` (pente vers la lumière) et `shade`.
 */
export function litRelief(height, { surfaceScale = 2, elevation = 45, azimuth = 225, light, shade }) {
  const n = nid('l');
  const flat = Math.sin((elevation * Math.PI) / 180);
  let prims =
    `<feDiffuseLighting in="${height}" surfaceScale="${f(surfaceScale)}" diffuseConstant="1" lighting-color="#ffffff" result="${n}">` +
    `<feDistantLight azimuth="${azimuth}" elevation="${elevation}"/></feDiffuseLighting>`;
  const out = {};
  if (light) {
    const t = tint(n, { color: light.color, gain: light.gain, bias: -light.gain * flat, opacity: light.opacity ?? 1 });
    prims += t.prims;
    out.light = t.out;
  }
  if (shade) {
    const t = tint(n, { color: shade.color, gain: -shade.gain, bias: shade.gain * flat, opacity: shade.opacity ?? 1 });
    prims += t.prims;
    out.shade = t.out;
  }
  return { prims, ...out };
}

// Bruit → alpha (hauteur), éventuellement multiplié par l'alpha de la source (modulation d'amplitude).
function heightField(noise, { modulate = false } = {}) {
  const n = nid('h');
  let s = turbulence(noise, `${n}n`) + `<feColorMatrix in="${n}n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0" result="${n}"/>`;
  if (modulate) s += `<feComposite in="${n}" in2="SourceAlpha" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="${n}m"/>`;
  return { prims: s, out: modulate ? `${n}m` : n };
}

const merge = (nodes) => `<feMerge>${nodes.map((r) => `<feMergeNode in="${r}"/>`).join('')}</feMerge>`;

// ---------------------------------------------------------------------------------------------
// Tuile de base (opaque, raccordable) : crème gc-paper, marbrures très douces, épair, dent et
// relief fin d'un papier épais. Les fibres et inclusions sont des tracés posés par-dessus.
export function paperBase(id, S, { seed = 1, relief = 1 } = {}) {
  const L = [
    // marbrures : grandes plages un peu plus vieillies…
    noiseTint({ freq: per(2, S), octaves: 4, seed: seed + 1, color: c('gc-paper-aged'), gain: 1.6, bias: -0.62, opacity: 0.18 }),
    // …et un peu plus claires
    noiseTint({ freq: per(3, S), octaves: 4, seed: seed + 2, color: c('gc-paper-lace'), gain: 1.7, bias: -0.68, opacity: 0.32 }),
    // épair : nuages de formation de la feuille, à peine marqués
    noiseTint({ freq: per(22, S), octaves: 3, seed: seed + 3, color: c('gc-paper-edge'), gain: 1.9, bias: -0.78, opacity: 0.32 }),
    noiseTint({ freq: per(14, S), octaves: 3, seed: seed + 4, color: c('gc-paper-lace'), gain: 1.9, bias: -0.8, opacity: 0.4 }),
  ];
  // feutre : relief moyen (empreinte du feutre de séchage), très faible
  const felt = heightField({ freq: per(150, S), octaves: 2, seed: seed + 5 });
  const feltLit = litRelief(felt.out, {
    surfaceScale: 1.15 * relief, elevation: 52,
    light: { color: c('gc-paper-lace'), gain: 1.2 },
    shade: { color: c('gc-sepia-2'), gain: 0.42 },
  });
  // grain : relief fin du papier épais (~0,7 cycle/px)
  const grain = heightField({ freq: per(0.7 * S, S), octaves: 2, seed: seed + 6 });
  const grainLit = litRelief(grain.out, {
    surfaceScale: 1.3 * relief, elevation: 56,
    light: { color: c('gc-paper-lace'), gain: 1.1 },
    shade: { color: c('gc-sepia-2'), gain: 0.4 },
  });
  return (
    head(id, [0, 0, S, S]) +
    `<feFlood flood-color="${c('gc-paper')}" result="${id}b"/>` +
    L.map((l) => l.prims).join('') +
    felt.prims + feltLit.prims + grain.prims + grainLit.prims +
    merge([`${id}b`, ...L.map((l) => l.out), feltLit.shade, feltLit.light, grainLit.shade, grainLit.light]) +
    `</filter>`
  );
}

// ---------------------------------------------------------------------------------------------
// Jaunissement (alpha, raccordable) : plages irrégulières gc-paper-aged et gc-paper-foxed.
// Posé en CSS avec une opacité qui dépend de l'âge de la page ; masqué vers les bords pour l'usure.
export function ageMottle(id, S, { seed = 1 } = {}) {
  const L = [
    noiseTint({ freq: per(2, S), octaves: 4, seed: seed + 1, color: c('gc-paper-aged'), gain: 2.1, bias: -0.62 }),
    noiseTint({ freq: per(4, S), octaves: 5, seed: seed + 2, color: c('gc-paper-foxed'), gain: 2.2, bias: -0.95, opacity: 0.7 }),
    // petites plages plus nettes (eau, doigts) : bruit plus fin passé par un seuil doux
    noiseTint({ freq: per(9, S), octaves: 4, seed: seed + 3, color: c('gc-paper-foxed'), gain: 3.4, bias: -1.95, opacity: 0.55 }),
  ];
  return head(id, [0, 0, S, S]) + L.map((l) => l.prims).join('') + merge(L.map((l) => l.out)) + `</filter>`;
}

// ---------------------------------------------------------------------------------------------
// Gondolage : champ de hauteur très basse fréquence, plus long dans le sens de la reliure, éclairé
// en haut à gauche. part = 'shade' (brun chaud) ou 'light' (crème). L'alpha de la source module
// l'amplitude (plus marquée vers les bords de la feuille, où l'humidité entre).
export function cockle(id, [W, H], { seed = 1, freq = [0.0048, 0.0029], octaves = 3, part, surfaceScale = 46, elevation = 38, gain }) {
  const hf = heightField({ freq, octaves, seed, stitch: false }, { modulate: true });
  const lit = litRelief(hf.out, {
    surfaceScale, elevation,
    ...(part === 'light'
      ? { light: { color: c('gc-paper-lace'), gain: gain ?? 2.6 } }
      : { shade: { color: c('gc-sepia-3'), gain: gain ?? 1.1 } }),
  });
  return head(id, [0, 0, W, H]) + hf.prims + lit.prims + merge([part === 'light' ? lit.light : lit.shade]) + `</filter>`;
}

// ---------------------------------------------------------------------------------------------
// Adoucissement (fibres prises dans la pâte).
export function soften(id, region, std = 0.4) {
  return head(id, region) + `<feGaussianBlur stdDeviation="${std}"/></filter>`;
}

// ---------------------------------------------------------------------------------------------
// Rousseurs : les taches (cœurs et halos) sont des cercles ; ce filtre les déforme (bord
// irrégulier, champignon qui s'étend dans les fibres) puis les floute très légèrement.
export function foxSpots(id, region, { seed = 1, displace = 4, freq = 0.09, blur = 0.6 } = {}) {
  return (
    head(id, region) +
    turbulence({ freq, octaves: 3, seed, stitch: false }, `${id}n`) +
    `<feDisplacementMap in="SourceGraphic" in2="${id}n" scale="${f(displace)}" xChannelSelector="R" yChannelSelector="G" result="${id}d"/>` +
    `<feGaussianBlur in="${id}d" stdDeviation="${f(blur)}"/>` +
    `</filter>`
  );
}

// Halo des rousseurs : la tache de rouille diffuse dans les fibres, sans bord.
export function foxHalo(id, region, { seed = 1, displace = 8, freq = 0.06, blur = 2.4 } = {}) {
  return (
    head(id, region) +
    turbulence({ freq, octaves: 2, seed, stitch: false }, `${id}n`) +
    `<feDisplacementMap in="SourceGraphic" in2="${id}n" scale="${f(displace)}" xChannelSelector="R" yChannelSelector="G" result="${id}d"/>` +
    `<feGaussianBlur in="${id}d" stdDeviation="${f(blur)}"/>` +
    `</filter>`
  );
}

// ---------------------------------------------------------------------------------------------
// Auréole (cerne de liquide séché) : la forme pleine (alpha de la source) est rendue irrégulière,
// puis on garde son lavis très pâle et un liseré plus foncé à l'intérieur du bord : le bord
// extérieur reste net, le liseré se fond vers l'intérieur (effet « tache de café »).
export function tideMark(id, region, { seed = 1, displace = 6, freq = 0.035, rim = 3.2, rimBlur = 1.6, wash, edge, washOpacity = 0.07, edgeOpacity = 0.32, breakup = 0.6 }) {
  const n = id;
  return (
    head(id, region) +
    turbulence({ freq, octaves: 3, seed, stitch: false }, `${n}n`) +
    `<feDisplacementMap in="SourceAlpha" in2="${n}n" scale="${f(displace)}" xChannelSelector="R" yChannelSelector="G" result="${n}s"/>` +
    `<feGaussianBlur in="${n}s" stdDeviation="0.45" result="${n}S"/>` +
    // liseré : forme moins sa version érodée, adouci vers l'intérieur, recoupé par la forme
    `<feMorphology in="${n}S" operator="erode" radius="${f(rim)}" result="${n}e"/>` +
    `<feComposite in="${n}S" in2="${n}e" operator="out" result="${n}r"/>` +
    `<feGaussianBlur in="${n}r" stdDeviation="${f(rimBlur)}" result="${n}rb"/>` +
    `<feComposite in="${n}rb" in2="${n}S" operator="in" result="${n}R0"/>` +
    // le liseré n'est pas régulier : plus dense ici, presque effacé là (bruit lent)
    turbulence({ freq: 0.018, octaves: 2, seed: seed + 50, stitch: false }, `${n}k`) +
    `<feColorMatrix in="${n}k" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${f(2.6 * breakup)} 0 0 0 ${f(1 - 1.3 * breakup)}" result="${n}ka"/>` +
    `<feComposite in="${n}R0" in2="${n}ka" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="${n}R"/>` +
    // le lavis aussi est inégal
    `<feComposite in="${n}S" in2="${n}ka" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="${n}Sw"/>` +
    `<feFlood flood-color="${edge}" flood-opacity="${f(edgeOpacity)}" result="${n}ec"/>` +
    `<feComposite in="${n}ec" in2="${n}R" operator="in" result="${n}E"/>` +
    `<feFlood flood-color="${wash}" flood-opacity="${f(washOpacity)}" result="${n}wc"/>` +
    `<feComposite in="${n}wc" in2="${n}Sw" operator="in" result="${n}W"/>` +
    merge([`${n}W`, `${n}E`]) +
    `</filter>`
  );
}

// =============================================================================================
// Champs calculés en flottant (Node) : les très basses fréquences éclairées ne passent pas par
// feDiffuseLighting, dont le champ de hauteur 8 bits dessine des courbes de niveau en escalier.
// On calcule hauteur, pente et éclairage en double précision, puis on livre une image PNG (data URI)
// que la cuisson Chromium place dans un <image> et réencode en WebP.

/** Bruit de gradient 2D (Perlin amélioré) à graine ; périodique si `period` est donné (en cellules). */
export function gradientNoise(seed) {
  const R = rng(seed);
  const P = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(R.next() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  const G = P.map(() => { const a = R.next() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; });
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const mod = (a, n) => ((a % n) + n) % n;
  return (x, y, px = 256, py = 256) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const g = (i, j) => G[P[(P[mod(i, px) & 255] + mod(j, py)) & 255]];
    const dot = (i, j, dx, dy) => { const v = g(i, j); return v[0] * dx + v[1] * dy; };
    const u = fade(xf), v = fade(yf);
    const a = dot(xi, yi, xf, yf), b = dot(xi + 1, yi, xf - 1, yf);
    const cc = dot(xi, yi + 1, xf, yf - 1), d = dot(xi + 1, yi + 1, xf - 1, yf - 1);
    return (a + u * (b - a) + v * (cc + u * (d - cc) - a - u * (b - a))) * 1.41;
  };
}

/** Somme d'octaves ; `cells` = nombre de cellules sur la largeur/hauteur à l'octave 0 (entier si périodique). */
export function fbm(noise, { cells: [cx, cy], octaves = 3, gain = 0.5, periodic = false, W, H }) {
  return (x, y) => {
    let s = 0, amp = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const k = 2 ** o;
      const px = cx * k, py = cy * k;
      s += amp * noise((x / W) * px + o * 17.3, (y / H) * py + o * 9.1, periodic ? px : 256, periodic ? py : 256);
      norm += amp;
      amp *= gain;
    }
    return s / norm;
  };
}

/** PNG RGBA (data URI) à partir d'une couleur unie et d'un alpha flottant [0, 1]. */
export function alphaPng(W, H, color, alpha) {
  const png = new PNG({ width: W, height: H });
  const hex = color.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < W * H; i++) {
    png.data[i * 4] = r; png.data[i * 4 + 1] = g; png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(alpha[i] * 255)));
  }
  return 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
}

const percentile = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 1; };

/**
 * Gondolage : champ de hauteur très basse fréquence (plus long dans le sens de la reliure),
 * amplitude plus forte le long des deux bords verticaux, éclairé en haut à gauche.
 * Renvoie deux alphas flottants : `shade` (pente qui tourne le dos à la lumière) et `light`,
 * normalisés pour que leur 99e centile vaille `peak.shade` / `peak.light`.
 */
export function cockleField({ W, H, seed, cells = [2.2, 1.4], octaves = 2, gain = 0.32, slope = 0.22, elevation = 40, peak = { shade: 0.1, light: 0.62 } }) {
  const n = fbm(gradientNoise(seed), { cells, octaves, gain, W, H });
  const amp = (x) => { const u = Math.abs((2 * x) / W - 1); return 0.5 + 0.5 * u ** 1.6; };
  const h = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = n(x, y) * amp(x);
  const e = (elevation * Math.PI) / 180;
  const L = [-Math.cos(e) * Math.SQRT1_2, -Math.cos(e) * Math.SQRT1_2, Math.sin(e)]; // vers la lumière (haut gauche)
  const flat = L[2];
  const k = (slope * W) / 4; // pente typique ≈ `slope` (le bruit varie d'environ 1 par cellule)
  const d = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xl = Math.max(0, x - 1), xr = Math.min(W - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1);
    const gx = ((h[y * W + xr] - h[y * W + xl]) / (xr - xl)) * k;
    const gy = ((h[yd * W + x] - h[yu * W + x]) / (yd - yu)) * k;
    const len = Math.hypot(gx, gy, 1);
    d[y * W + x] = (-gx * L[0] - gy * L[1] + L[2]) / len - flat;
  }
  const pos = [], neg = [];
  for (const v of d) (v > 0 ? pos : neg).push(Math.abs(v));
  const sp = percentile(neg, 0.99), lp = percentile(pos, 0.99);
  const shade = new Float64Array(W * H), light = new Float64Array(W * H);
  for (let i = 0; i < d.length; i++) {
    if (d[i] < 0) shade[i] = Math.min(1, (-d[i] / sp) * peak.shade);
    else light[i] = Math.min(1, (d[i] / lp) * peak.light);
  }
  return { shade, light };
}

/**
 * Jaunissement raccordable : alpha flottant [0, 1] en plages irrégulières (deux échelles), sans
 * l'aspect « nuages » générique : seuil doux, la plupart de la feuille reste calme.
 */
export function ageField({ S, seed, cells = 3, octaves = 4 }) {
  const big = fbm(gradientNoise(seed), { cells: [cells, cells], octaves, gain: 0.5, periodic: true, W: S, H: S });
  const mid = fbm(gradientNoise(seed + 1), { cells: [cells * 3, cells * 3], octaves: 3, gain: 0.5, periodic: true, W: S, H: S });
  const a = new Float64Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const b = big(x, y), m = mid(x, y);
    // valeur moyenne autour de 0,45, écarts doux ; aucune plage à bord net
    const v = 0.5 + 1.0 * b + 0.45 * m;
    a[y * S + x] = Math.max(0, Math.min(1, v)) ** 1.1;
  }
  return a;
}
