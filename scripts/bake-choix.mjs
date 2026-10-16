// Planche « Choix · Aquarelle » : les mêmes dessins re-cuits à deux autres intensités, pour comparer.
//
//   node scripts/bake-choix.mjs [--force] [--only leger,intense] [--temoin <dossier>]
//
// Rien n'est redessiné : on reprend les générateurs existants (sans les modifier) et on ne change que
// les réglages de cuisson :
//   · lavis : opacité des groupes data-fx="wash" (les reflets clairs restent tels quels), densité
//     (washFilter.density), saturation des couleurs (plafonnée à 70 %, CONTRACT § 6) ;
//   · crayon : couverture du grain (pencilFilter.tooth) et opacité des groupes data-fx="pencil".
// Sorties (même taille et même grille de pixels que les originaux, mêmes graines) :
//   design-system/baked/choix/<look>/illustrations/essai/cake-citron.webp
//   design-system/baked/choix/<look>/illustrations/portraits/julie.webp
//   design-system/baked/choix/<look>/ecrins/cloche/a/{back,domeBack,front,dome,glint}.webp
//   design-system/baked/choix/<look>/scenes/julie/sepia.webp
// Le masque (ecrins/cloche/a/mask-soft) ne change pas : la carte réutilise l'original.
// Cache par empreinte dans design-system/baked/choix/.cache.json (le cache partagé .fx-cache.json
// n'est pas touché : ce script ne passe pas par bakeFx, il en recopie le rendu).
// --temoin <dossier> : cuit aussi le réglage « actuel » hors de baked/ et le compare pixel à pixel aux
// images en place (preuve que la chaîne recopiée ici est la même que celle des générateurs).
//
// Recopié (non importable sans lancer leur propre cuisson) :
//   · design-system/illustrations/people/bake.mjs : sepiaSvg, onPaper, vignette, sized ;
//   · scripts/bake-ecrins.mjs : contrôle de l'anneau de débord du front ;
//   · scripts/lib/fx-dessin.mjs : le rendu de bakeFx (matte, fond, couleur des réserves).
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { launch } from './lib/browser.mjs';
import { ROOT } from './lib/serve.mjs';
import { c } from './lib/tokens.mjs';
import { applyFx, dessiner, splitPart, readPixels, withKnockColor, paperGrainFilter, FX_VERSION } from './lib/fx-dessin.mjs';
import { cakeCitron, SIZE as CAKE_SIZE } from '../design-system/illustrations/essai/cake-citron.mjs';
import { PORTRAITS, PORTRAIT_SIZE } from '../design-system/illustrations/people/portraits.mjs';
import { SCENES, SCENE_SIZE } from '../design-system/illustrations/people/scenes.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const force = args.includes('--force');
const only = opt('only')?.split(',').filter(Boolean);
const temoin = opt('temoin');

const BAKED = join(ROOT, 'design-system/baked');
const OUT = join(BAKED, 'choix');
const CACHE = join(OUT, '.cache.json');
const ASSETS = JSON.parse(readFileSync(join(ROOT, 'design-system/assets.json'), 'utf8'));

// ── Les réglages ─────────────────────────────────────────────────────────────────────────────
// wash   : facteur sur l'opacité des lavis (0,78 par défaut → 0,45 en « léger »)
// sat    : facteur sur la saturation HSL des couleurs de lavis (plafond 0,70)
// density: [pente, décalage] du bruit de densité (défaut [1,15 ; 0,24] → couvrance moyenne ≈ 0,82)
// tooth  : [pente, décalage] du grain du crayon (défaut [2,5 ; −0,02]) : plus haut = trait plus plein
// pencil : opacité des groupes de crayon
// ink    : couleur du crayon des dessins convertis (portrait), défaut #46423e
export const LOOKS = {
  actuel: { wash: 1, sat: 1, density: [1.15, 0.24], tooth: [2.5, -0.02], pencil: 1 },
  leger: { wash: 0.6, sat: 0.9, density: [1.15, 0.1], tooth: [3.4, 0.16], pencil: 1, ink: '#3c3834' },
  intense: { wash: 1.22, sat: 1.2, density: [1.2, 0.46], tooth: [2.2, -0.1], pencil: 0.84 },
};
const SAT_MAX = 0.7;

// ── Couleurs ─────────────────────────────────────────────────────────────────────────────────
const hexRgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = (mx + mn) / 2;
  if (mx === mn) return [0, 0, L];
  const d = mx - mn, S = d / (1 - Math.abs(2 * L - 1));
  let H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  H *= 60; if (H < 0) H += 360;
  return [H, S, L];
}
function fromHsl([H, S, L]) {
  const C = (1 - Math.abs(2 * L - 1)) * S, X = C * (1 - Math.abs(((H / 60) % 2) - 1)), M = L - C / 2;
  const [r, g, b] = H < 60 ? [C, X, 0] : H < 120 ? [X, C, 0] : H < 180 ? [0, C, X] : H < 240 ? [0, X, C] : H < 300 ? [X, 0, C] : [C, 0, X];
  return [(r + M) * 255, (g + M) * 255, (b + M) * 255];
}
/** Saturation × k (plafond 70 %), clarté conservée. Les gris, les très clairs et les très sombres ne bougent pas. */
function saturer(rgb, k) {
  if (k === 1) return rgb;
  const L0 = lum(rgb);
  if (L0 > 0.84 || L0 < 0.3) return rgb;
  const [H, S, L] = toHsl(rgb);
  if (S < 0.04) return rgb;
  const S2 = k < 1 ? S * k : Math.max(S, Math.min(SAT_MAX, S * k));
  return fromHsl([H, S2, L]);
}
/** Toutes les couleurs littérales d'un fragment SVG (hex et rgb[a]) passent par saturer(). */
function saturerSvg(svg, k) {
  if (k === 1) return svg;
  return svg
    .replace(/#([0-9a-fA-F]{6})\b/g, (m, h) => rgbHex(saturer(hexRgb(h), k)))
    .replace(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)\s*)?\)/g, (m, r, g, b, a) => {
      const [R, G, B] = saturer([+r, +g, +b], k).map(Math.round);
      return a == null ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${a})`;
    });
}

// ── Groupes data-fx d'un SVG balisé (atelier) ────────────────────────────────────────────────
function finDuGroupe(svg, i) {
  const re = /<g\b[^>]*?(\/?)>|<\/g>/g;
  re.lastIndex = i;
  let depth = 0, m;
  while ((m = re.exec(svg))) {
    if (m[0] === '</g>') { depth--; if (depth === 0) return re.lastIndex; }
    else if (m[1] !== '/') depth++;
  }
  return svg.length;
}
const fmt = (v) => String(+v.toFixed(3));
/** Pose (ou multiplie) l'attribut opacity d'une balise ouvrante <g …>. */
function opacite(tag, k) {
  const m = /\sopacity="([\d.]+)"/.exec(tag);
  const v = Math.min(1, (m ? +m[1] : 1) * k);
  if (m) return tag.replace(m[0], v >= 0.999 ? '' : ` opacity="${fmt(v)}"`);
  return v >= 0.999 ? tag : tag.replace(/^<g\b/, `<g opacity="${fmt(v)}"`);
}
/**
 * Règle l'intensité d'un SVG balisé : opacité et saturation des lavis (sauf reflets : couleur très claire),
 * opacité du crayon. Les groupes data-fx ne s'emboîtent pas (atelier) : on les traite un par un.
 */
function intensite(svg, L) {
  const re = /<g\b[^>]*\sdata-fx="(pencil|wash)"[^>]*>/g;
  let out = '', last = 0, m;
  while ((m = re.exec(svg))) {
    const start = m.index, end = finDuGroupe(svg, start);
    const kind = m[1];
    let tag = m[0];
    let body = svg.slice(start + tag.length, end);
    if (kind === 'wash') {
      const f = /fill="#([0-9a-fA-F]{6})"/.exec(body);
      const clair = f && lum(hexRgb(f[1])) > 0.86;
      if (!clair) {
        tag = opacite(tag, L.wash);
        body = saturerSvg(body, L.sat);
      }
    } else if (L.pencil !== 1) tag = opacite(tag, L.pencil);
    out += svg.slice(last, start) + tag + body;
    last = end;
    re.lastIndex = end;
  }
  return out + svg.slice(last);
}
const overrides = (L) => ({ wash: { density: L.density }, pencil: { tooth: L.tooth } });

/** Même réglage sur un SVG déjà filtré (dessiner) : densité des lavis, grain et opacité du crayon. */
function filtresConvertis(svg, L) {
  const M = (a, b) => `0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${a} 0 0 0 ${b}`;
  let s = svg
    .split(`values="${M(1.15, 0.24)}" result="dens"`).join(`values="${M(...L.density)}" result="dens"`)
    .split(`values="${M(2.5, -0.02)}" result="gm"`).join(`values="${M(...L.tooth)}" result="gm"`);
  if (L.pencil !== 1) s = s.replace(/<g\b[^>]*\sdata-fx="pencil"[^>]*>/g, (tag) => opacite(tag, L.pencil));
  return s;
}

// ── Recopié de design-system/illustrations/people/bake.mjs (non importable : il cuit à l'import) ──
const RAMP = ['gc-sepia-4', 'gc-sepia-3', 'gc-sepia-2', 'gc-sepia-1', 'gc-sepia-0', 'gc-paper-lace'].map((n) => {
  const rgb = hexRgb(c(n).replace('#', ''));
  return { rgb, L: lum(rgb) };
});
function sepiaOf([r, g, b]) {
  const L = Math.min(1, ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) ** 0.82);
  let i = 0;
  while (i < RAMP.length - 2 && L > RAMP[i + 1].L) i++;
  const a = RAMP[i], z = RAMP[i + 1];
  const t = Math.max(0, Math.min(1, (L - a.L) / (z.L - a.L || 1)));
  return a.rgb.map((v, k) => Math.round(v + (z.rgb[k] - v) * t));
}
function sepiaSvg(svg) {
  return svg
    .replace(/#([0-9a-fA-F]{6})\b/g, (m, h) => rgbHex(sepiaOf(hexRgb(h))))
    .replace(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)\s*)?\)/g, (m, r, g, b, a) => { const [R, G, B] = sepiaOf([+r, +g, +b]); return a == null ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${a})`; });
}
function onPaper(svg, [W, H], { w, h, paper, fiber, seed = 5 }) {
  const px = w / W;
  const grain = paperGrainFilter('gc-fx-paper-grain', { seed, px, color: fiber, alpha: 0.24, region: { x: -10, y: -10, w: W + 20, h: H + 20 } });
  return svg
    .replace(/<svg\b([^>]*)>/, (a, b) => `<svg${b.replace(/\s(width|height|color)="[^"]*"/g, '')} width="${w}" height="${h}" color="${paper}"><rect x="-80" y="-80" width="${W + 160}" height="${H + 160}" fill="${paper}"/>`)
    .replace(/<\/svg>\s*$/, `<defs>${grain}</defs><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="#000" filter="url(#gc-fx-paper-grain)"/></svg>\n`);
}
function vignette(svg, [W, H], { from = 0.6, to = 0.9, seed = 9, px = 1 } = {}) {
  const mask = `<defs><linearGradient id="gc-fx-vig-g" x1="0" y1="0" x2="0" y2="1"><stop offset="${from}" stop-color="#fff"/><stop offset="${to}" stop-color="#000"/></linearGradient>`
    + `<filter id="gc-fx-vig-f" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${W + 40}" height="${H + 40}"><feTurbulence type="fractalNoise" baseFrequency="${(0.018 / px).toFixed(5)}" numOctaves="3" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${(46 / px).toFixed(3)}" xChannelSelector="R" yChannelSelector="G"/></filter>`
    + `<mask id="gc-fx-vig" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${W + 40}" height="${H + 40}"><rect x="-20" y="-20" width="${W + 40}" height="${H + 40}" fill="url(#gc-fx-vig-g)" filter="url(#gc-fx-vig-f)"/></mask></defs>`;
  return svg.replace(/(<svg\b[^>]*>)/, `$1${mask}<g mask="url(#gc-fx-vig)">`).replace(/<\/svg>\s*$/, '</g></svg>\n');
}
const sized = (svg, w, h) => svg.replace(/<svg\b([^>]*)>/, (a, b) => `<svg${b.replace(/\s(width|height)="[^"]*"/g, '')} width="${w}" height="${h}">`);

// ── Rendu (recopié de bakeFx, avec un cache propre à ce dossier) ──────────────────────────────
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
async function rendre(page, version, { svg, file, key: ck, width, height, quality = 0.86, matte = false, background, knockColor }) {
  const key = createHash('sha256').update(JSON.stringify({ svg, width, height, quality, matte, background, knockColor, version, FX_VERSION })).digest('hex');
  if (!force && ck && cache[ck] === key && existsSync(file)) return { file, cached: true };
  const type = file.endsWith('.png') ? 'image/png' : 'image/webp';
  const svgs = matte ? [withKnockColor(svg, '#ffffff'), withKnockColor(svg, '#000000')] : [knockColor ? withKnockColor(svg, knockColor) : svg];
  const dataUrl = await page.evaluate(async ({ svgs, W, H, type, quality, matte, background }) => {
    const draw = async (svg, bg) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
      ctx.drawImage(img, 0, 0, W, H);
      return cv;
    };
    let cv;
    if (matte) {
      const A = await draw(svgs[0], '#ffffff'), B = await draw(svgs[1], '#000000');
      const a = A.getContext('2d').getImageData(0, 0, W, H), b = B.getContext('2d').getImageData(0, 0, W, H);
      const o = new ImageData(W, H);
      for (let i = 0; i < a.data.length; i += 4) {
        const al = 255 - ((a.data[i] - b.data[i]) + (a.data[i + 1] - b.data[i + 1]) + (a.data[i + 2] - b.data[i + 2])) / 3;
        const al2 = Math.max(0, Math.min(255, al));
        o.data[i + 3] = Math.round(al2);
        if (al2 > 0.5) for (let k = 0; k < 3; k++) o.data[i + k] = Math.max(0, Math.min(255, Math.round((b.data[i + k] * 255) / al2)));
      }
      cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      cv.getContext('2d').putImageData(o, 0, 0);
      if (background) { const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const x = c2.getContext('2d'); x.fillStyle = background; x.fillRect(0, 0, W, H); x.drawImage(cv, 0, 0); cv = c2; }
    } else cv = await draw(svgs[0], background);
    return cv.toDataURL(type, quality);
  }, { svgs, W: Math.round(width), H: Math.round(height), type, quality, matte, background });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  if (ck) cache[ck] = key;
  return { file, cached: false };
}

// ── Contrôles (recopiés de scripts/bake-ecrins.mjs) ───────────────────────────────────────────
function anneauFront(img, ap, bleed, px) {
  const alphaAt = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= img.w || yi >= img.h) return 0;
    return img.data[(yi * img.w + xi) * 4 + 3] / 255;
  };
  let min = 1, below = 0, n = 0;
  const r0 = ap.r * px, r1 = (ap.r + bleed) * px, steps = Math.ceil(Math.PI * 2 * r1 * 2);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    for (let r = r0; r <= r1 + 1e-6; r += 0.5) {
      const v = alphaAt(ap.cx * px + r * Math.cos(a) - 0.5, ap.cy * px + r * Math.sin(a) - 0.5);
      n++; if (v < min) min = v; if (v < 0.98) below++;
    }
  }
  return { min: +min.toFixed(4), below, samples: n, ok: min >= 0.98 };
}
/** Écart moyen et max (0–255, RVB prémultiplié par l'alpha) entre deux images de même taille. */
function ecart(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { meme: false };
  let s = 0, mx = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const d = Math.abs((a.data[i + k] * a.data[i + 3]) / 255 - (b.data[i + k] * b.data[i + 3]) / 255);
      s += d; if (d > mx) mx = d;
    }
    const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
    s += da; if (da > mx) mx = da;
  }
  return { meme: true, moyen: +(s / (a.data.length)).toFixed(3), max: Math.round(mx) };
}

// ── Les dessins ──────────────────────────────────────────────────────────────────────────────
const taille = (name) => { const a = ASSETS[name]; if (!a) throw new Error(`original introuvable : ${name}`); return [a.w, a.h]; };

/** Liste des cuissons d'un réglage : { name (nom logique d'origine), make(page) → options de rendu }. */
function travaux(L) {
  const list = [];
  // Part de cake au citron (atelier → applyFx), détourée.
  list.push({
    name: 'illustrations/essai/cake-citron',
    async make() {
      const [W, H] = CAKE_SIZE;
      const [w, h] = taille('illustrations/essai/cake-citron');
      const k = w / W;
      return { svg: applyFx(intensite(cakeCitron(), L), { px: k, width: w, height: h, overrides: overrides(L) }), width: w, height: h, matte: true };
    },
  });
  // Julie en buste (kit vectoriel → dessiner → vignette), détourée.
  list.push({
    name: 'illustrations/portraits/julie',
    async make(page) {
      const [W, H] = PORTRAIT_SIZE;
      const [w, h] = taille('illustrations/portraits/julie');
      const k = w / W;
      const { svg } = await dessiner(page, saturerSvg(PORTRAITS.julie(), L.sat), { px: k, seed: 17, washOpacity: 0.78 * L.wash, ...(L.ink ? { ink: L.ink } : null) });
      return { svg: vignette(sized(filtresConvertis(svg, L), w, h), [W, H], { px: k }), width: w, height: h, matte: true };
    },
  });
  // Scène de Julie, sépia crayonné (image figée de la cloche avant lecture), opaque sur papier.
  list.push({
    name: 'scenes/julie/sepia',
    async make(page) {
      const [W] = SCENE_SIZE;
      const [w, h] = taille('scenes/julie/sepia');
      const k = w / W;
      const paper = c('gc-sepia-0');
      const { svg } = await dessiner(page, sepiaSvg(SCENES.julie()), { px: k, seed: 23, ink: c('gc-sepia-4'), washOpacity: Math.min(0.95, 0.66 * L.wash) });
      return { svg: onPaper(filtresConvertis(svg, L), SCENE_SIZE, { w, h, paper, fiber: c('gc-sepia-3') }), width: w, height: h, knockColor: paper, background: paper, quality: 0.8 };
    },
  });
  // Calques de la cloche (variante a) : mêmes SVG que scripts/bake-ecrins.mjs, même grille de pixels.
  const dir = join(ROOT, 'design-system/ecrins/cloche/a');
  const lire = (n) => readFileSync(join(dir, `${n}.svg`), 'utf8');
  const back = splitPart(lire('back'), 'domeBack');
  const dome = splitPart(lire('dome'), 'glint');
  const calques = { back: back.without, domeBack: back.only, front: lire('front'), dome: dome.without, glint: dome.only };
  const man = JSON.parse(readFileSync(join(ROOT, 'design-system/ecrins/cloche/ecrin.json'), 'utf8'));
  for (const [part, src] of Object.entries(calques)) {
    list.push({
      name: `ecrins/cloche/a/${part}`,
      async make() {
        const [w, h] = taille(`ecrins/cloche/a/${part}`);
        const px = w / man.viewBox[0];
        return { svg: applyFx(intensite(src, L), { px, width: w, height: h, overrides: overrides(L) }), width: w, height: h };
      },
    });
  }
  return list;
}

// ── Cuisson ──────────────────────────────────────────────────────────────────────────────────
const browser = await launch();
const version = browser.version();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
const man = JSON.parse(readFileSync(join(ROOT, 'design-system/ecrins/cloche/ecrin.json'), 'utf8'));
const lignes = [];
let echecs = 0, faits = 0, gardes = 0;

const looks = (only ?? ['leger', 'intense']).filter((l) => LOOKS[l]);
for (const look of looks) {
  const L = LOOKS[look];
  for (const t of travaux(L)) {
    const o = await t.make(page);
    const ck = `choix/${look}/${t.name}`;
    const file = join(OUT, look, `${t.name}.webp`);
    const r = await rendre(page, version, { ...o, file, key: ck });
    r.cached ? gardes++ : faits++;
    const img = await readPixels(page, file);
    const [w0, h0] = taille(t.name);
    const grille = img.w === w0 && img.h === h0;
    if (!grille) echecs++;
    let note = '';
    if (t.name.endsWith('/front')) {
      const a = anneauFront(img, man.aperture, man.bleed, img.w / man.viewBox[0]);
      note = ` · anneau de débord : alpha min ${a.min} ${a.ok ? '✓' : '✗'}`;
      if (!a.ok) echecs++;
    }
    lignes.push(`${ck} : ${img.w}×${img.h}${grille ? '' : ` ✗ (original ${w0}×${h0})`}, ${(statSync(file).size / 1024).toFixed(1)} Ko${r.cached ? ' (inchangé)' : ''}${note}`);
  }
}

// Témoin : le réglage « actuel » recuit hors de baked/ doit redonner les images en place.
if (temoin) {
  const dirT = isAbsolute(temoin) ? temoin : join(ROOT, temoin);
  for (const t of travaux(LOOKS.actuel)) {
    const o = await t.make(page);
    const file = join(dirT, `${t.name.replace(/\//g, '__')}.webp`);
    await rendre(page, version, { ...o, file });
    const a = await readPixels(page, file);
    const b = await readPixels(page, join(BAKED, `${t.name}.webp`));
    const e = ecart(a, b);
    lignes.push(`témoin ${t.name} : ${e.meme ? `écart moyen ${e.moyen}, max ${e.max} (sur 255)` : 'tailles différentes ✗'}`);
  }
}

await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');
console.log(lignes.join('\n'));
console.log(`${faits} image(s) cuite(s), ${gardes} inchangée(s)${echecs ? ` — ${echecs} contrôle(s) en échec` : ' — contrôles ✓'}`);
process.exit(echecs ? 1 : 0);
