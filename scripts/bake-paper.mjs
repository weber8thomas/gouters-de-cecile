// Papier ancien du carnet : couches cuites partagées, composées par <Papier> selon une graine.
//   node scripts/bake-paper.mjs [--force] [--only base,age,cockle,fox,tide] [--src]
//
// Produit dans design-system/baked/paper/ :
//   base.webp               tuile opaque 1024² raccordable : crème gc-paper, relief de papier épais,
//                           fibres de coton, marbrures très douces (affichée à 1/1,25)
//   age.webp                tuile alpha 256² raccordable : plages de jaunissement (gc-paper-aged,
//                           gc-paper-foxed), opacité réglée en CSS selon l'âge, masquée vers les bords
//   cockle-N-shade/-light   N = 1..6 : gondolage en deux couches alpha (brun / crème), 448×500,
//                           agrandies à la page
//   fox-N                   N = 1..12 : amas de rousseurs, alpha, 128² affichés (cuits à 1,25×)
//   tide-N                  N = 1..5 : auréoles (cernes de liquide séché), alpha, 280² affichés
//
// --src écrit aussi les SVG sources dans verification/out/s1/src (contrôle).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBaker } from './lib/bake.mjs';
import { c } from './lib/tokens.mjs';
import { rng } from './lib/prng.mjs';
import { f, smoothPath, wobblyCircle, blob } from './lib/organic.mjs';
import { ROOT } from './lib/serve.mjs';
import { paperBase, soften, foxSpots, foxHalo, tideMark, cockleField, ageField, alphaPng } from './lib/fx-papier.mjs';

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? args[oi + 1].split(',') : null;
const want = (k) => !only || only.includes(k);
const SRC = join(ROOT, 'verification/out/s1/src');
if (args.includes('--src')) mkdirSync(SRC, { recursive: true });

const TAU = Math.PI * 2;
/** Échelle de cuisson des petites couches (taches) : 1,25 × la taille affichée. */
const BAKE = 1.25;

const doc = (W, H, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>\n`;

// Recopie un élément de part et d'autre de la tuile s'il en touche un bord (raccord).
function wrap(el, [x0, y0, x1, y1], W, H) {
  let s = '';
  for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
    if (x1 + dx < 0 || x0 + dx > W || y1 + dy < 0 || y0 + dy > H) continue;
    s += dx || dy ? `<g transform="translate(${dx} ${dy})">${el}</g>` : el;
  }
  return s;
}

// Fibre de coton : longue courbe qui serpente doucement (4 à 6 points), épaisseur et opacité faibles.
function fiber(R, W, H, { len, width, color, opacity }) {
  const n = R.int(3, 5);
  const L = R.range(...len);
  let a = R.range(0, TAU);
  let [x, y] = [R.range(0, W), R.range(0, H)];
  const pts = [[x, y]];
  for (let i = 0; i < n; i++) {
    a += R.range(-0.55, 0.55);
    x += (Math.cos(a) * L) / n;
    y += (Math.sin(a) * L) / n;
    pts.push([x, y]);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const el = `<path d="${smoothPath(pts, false)}" fill="none" stroke="${color}" stroke-width="${f(R.range(...width))}" stroke-linecap="round" opacity="${f(R.range(...opacity))}"/>`;
  return wrap(el, [Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3], W, H);
}

// ---------------------------------------------------------------------------------------------
// paper/base
function base() {
  const S = 1024;
  const R = rng('gc-papier-base');
  const defs = paperBase('gc-paper-base', S, { seed: 40 }) + soften('gc-paper-soft', [-12, -12, S + 24, S + 24], 0.42);
  let fibers = '';
  // fibres claires (translucides) : la plupart, longues
  for (let i = 0; i < 120; i++) fibers += fiber(R, S, S, { len: [24, 96], width: [0.55, 1.15], color: c('gc-paper-lace'), opacity: [0.35, 0.8] });
  // fibres sombres, rares et pâles
  for (let i = 0; i < 46; i++) fibers += fiber(R, S, S, { len: [16, 70], width: [0.45, 0.9], color: c('gc-sepia-2'), opacity: [0.1, 0.24] });
  // quelques fibres plus présentes
  for (let i = 0; i < 8; i++) fibers += fiber(R, S, S, { len: [60, 130], width: [0.8, 1.3], color: c('gc-sepia-1'), opacity: [0.28, 0.42] });
  // inclusions : poussières d'écorce, minuscules
  let specks = '';
  for (let i = 0; i < 26; i++) {
    const x = R.range(3, S - 3), y = R.range(3, S - 3);
    specks += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R.range(0.35, 0.9))}" fill="${c('gc-sepia-3')}" opacity="${f(R.range(0.18, 0.4))}"/>`;
  }
  for (let i = 0; i < 6; i++) {
    const x = R.range(6, S - 6), y = R.range(6, S - 6), a = R.range(0, TAU), l = R.range(2, 5);
    specks += `<path d="M${f(x)} ${f(y)}l${f(Math.cos(a) * l)} ${f(Math.sin(a) * l)}" stroke="${c('gc-sepia-3')}" stroke-width="0.7" stroke-linecap="round" opacity="${f(R.range(0.18, 0.3))}"/>`;
  }
  const body =
    `<rect width="${S}" height="${S}" filter="url(#gc-paper-base)"/>` +
    `<g filter="url(#gc-paper-soft)">${fibers}${specks}</g>`;
  return [{ out: 'paper/base.webp', W: S, H: S, svg: doc(S, S, defs, body), quality: 0.88, background: c('gc-paper') }];
}

// ---------------------------------------------------------------------------------------------
// paper/age
const img = (W, H, href) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image width="${W}" height="${H}" href="${href}"/></svg>\n`;
function age() {
  // très lisse : 256² suffit, la tuile est toujours affichée agrandie (≈ 600 à 1 300 px)
  const S = 256;
  const a = ageField({ S, seed: 70 });
  return [{ out: 'paper/age.webp', W: S, H: S, svg: img(S, S, alphaPng(S, S, c('gc-paper-foxed'), a)), quality: 0.82 }];
}

// ---------------------------------------------------------------------------------------------
// paper/cockle-N-{shade,light}
// cells : nombre d'ondulations sur la largeur et la hauteur (plus longues dans le sens de la reliure)
const COCKLES = [
  { seed: 101, cells: [1.9, 1.4], octaves: 2 },
  { seed: 117, cells: [2.2, 1.5], octaves: 2 },
  { seed: 131, cells: [1.7, 1.6], octaves: 2 },
  { seed: 149, cells: [2.4, 1.6], octaves: 2 },
  { seed: 163, cells: [1.8, 1.3], octaves: 3 },
  { seed: 181, cells: [2.1, 1.8], octaves: 2 },
];
function cockles() {
  const W = 448, H = 500;
  const out = [];
  COCKLES.forEach((k, i) => {
    const m = cockleField({ W, H, ...k });
    // l'ombre (α ≤ 0,1, peu de niveaux) se comprime mieux sans perte ; le reflet, avec perte
    out.push({ out: `paper/cockle-${i + 1}-shade.webp`, W, H, svg: img(W, H, alphaPng(W, H, c('gc-sepia-3'), m.shade)), quality: 1 });
    out.push({ out: `paper/cockle-${i + 1}-light.webp`, W, H, svg: img(W, H, alphaPng(W, H, c('gc-paper-lace'), m.light)), quality: 0.84 });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// paper/fox-N : amas de rousseurs (coordonnées en px affichés, cuits à 1,25×)
const FOX = 128;
// Une rousseur : cœur sombre (r 1–3, α ≈ 0,5) et halo de rouille (r × 3, α ≈ 0,12), posés dans deux
// groupes : les cœurs à peine floutés, les halos fondus dans les fibres.
function spot(R, x, y, r, { core = 0.5, halo = 0.12, k = 3 } = {}) {
  const hx = x + R.range(-0.5, 0.5) * r, hy = y + R.range(-0.5, 0.5) * r;
  return {
    // le flou du halo en dilue l'opacité : on la double au dessin pour garder ≈ 0,12 au centre
    halo: `<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="${f(r * k * R.range(0.85, 1.2))}" ry="${f(r * k * R.range(0.75, 1.1))}" fill="${c('gc-tea')}" opacity="${f(Math.min(0.3, halo * 2))}"/>`,
    core: `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c('gc-sepia-3')}" opacity="${f(core)}"/>`,
  };
}
function foxCluster(i) {
  const R = rng(`gc-papier-fox-${i}`);
  const kinds = ['point', 'semis', 'tache', 'trainee'];
  const kind = kinds[i % kinds.length];
  const cx = FOX / 2 + R.range(-6, 6), cy = FOX / 2 + R.range(-6, 6);
  let cores = '', halos = '';
  const add = (sp) => { cores += sp.core; halos += sp.halo; };
  const sat = (n, spread, rr) => {
    for (let j = 0; j < n; j++) {
      const a = R.range(0, TAU), d = spread * Math.sqrt(R.next());
      add(spot(R, cx + Math.cos(a) * d, cy + Math.sin(a) * d * R.range(0.6, 1), R.range(...rr), { core: R.range(0.3, 0.5), halo: R.range(0.06, 0.12) }));
    }
  };
  if (kind === 'point') {
    add(spot(R, cx, cy, R.range(2.4, 3.2), { core: 0.52, halo: 0.13 }));
    sat(R.int(4, 9), R.range(14, 26), [0.6, 1.5]);
  } else if (kind === 'semis') {
    const a = R.range(0, Math.PI);
    for (let j = 0; j < R.int(12, 22); j++) {
      const u = R.range(-1, 1) * R.range(18, 40), v = R.range(-1, 1) * R.range(6, 14);
      add(spot(R, cx + Math.cos(a) * u - Math.sin(a) * v, cy + Math.sin(a) * u + Math.cos(a) * v, R.range(0.5, 1.4), { core: R.range(0.3, 0.5), halo: R.range(0.05, 0.1) }));
    }
  } else if (kind === 'tache') {
    // halo commun plus large, quelques cœurs décentrés
    halos += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(R.range(11, 16))}" ry="${f(R.range(8, 13))}" fill="${c('gc-tea')}" opacity="0.1" transform="rotate(${f(R.range(0, 180))} ${f(cx)} ${f(cy)})"/>`;
    for (let j = 0; j < R.int(2, 4); j++) add(spot(R, cx + R.range(-7, 7), cy + R.range(-6, 6), R.range(1.2, 2.6), { core: R.range(0.38, 0.5), halo: 0.11 }));
    sat(R.int(3, 7), R.range(18, 30), [0.5, 1.2]);
  } else {
    // traînée : le champignon suit une fibre
    const a = R.range(0, Math.PI), L = R.range(36, 56);
    for (let j = 0; j < R.int(7, 12); j++) {
      const t = R.range(-0.5, 0.5) * L, w = R.range(-3, 3);
      add(spot(R, cx + Math.cos(a) * t - Math.sin(a) * w, cy + Math.sin(a) * t + Math.cos(a) * w, R.range(0.6, 2), { core: R.range(0.32, 0.5), halo: R.range(0.07, 0.12) }));
    }
  }
  const id = `gc-paper-fox${i}`;
  const defs =
    foxSpots(id, [0, 0, FOX, FOX], { seed: 300 + i, displace: R.range(3, 5), freq: R.range(0.08, 0.14), blur: R.range(0.4, 0.65) }) +
    foxHalo(`${id}h`, [0, 0, FOX, FOX], { seed: 340 + i, displace: R.range(6, 10), blur: R.range(1.8, 2.8) });
  return { out: `paper/fox-${i}.webp`, W: FOX, H: FOX, scale: BAKE, svg: doc(FOX, FOX, defs, `<g filter="url(#${id}h)">${halos}</g><g filter="url(#${id})">${cores}</g>`), quality: 0.86 };
}
const foxes = () => Array.from({ length: 12 }, (_, i) => foxCluster(i + 1));

// ---------------------------------------------------------------------------------------------
// paper/tide-N : auréoles (coordonnées en px affichés, cuits à 1,25×)
const TIDE = 280;
function annulus(cx, cy, r, w, { seed, amp = 0.02, gapFrom, gapTo } = {}) {
  const outer = wobblyCircle(cx, cy, r, { seed, amp, n: 40 });
  const inner = wobblyCircle(cx + 0.6, cy - 0.4, r - w, { seed: seed + 7, amp: amp * 1.6, n: 40 });
  let d = `${outer} ${inner}`;
  if (gapFrom != null) {
    // interruption : on retire un secteur (la tasse a été posée de travers)
    const p = (a, rr) => `${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`;
    d = { d, gap: `M${f(cx)} ${f(cy)}L${p(gapFrom, r + 20)}L${p((gapFrom + gapTo) / 2, r + 30)}L${p(gapTo, r + 20)}Z` };
  }
  return d;
}
function tides() {
  const C = TIDE / 2;
  const sets = [];
  const tide = (i, shapes, opts) => {
    const id = `gc-paper-tide${i}`;
    const region = [-10, -10, TIDE + 20, TIDE + 20];
    let defs = '', body = '';
    shapes.forEach((sh, j) => {
      const fid = `${id}-${j}`;
      defs += tideMark(fid, region, { seed: 500 + i * 10 + j, ...opts, ...sh.fx });
      if (sh.mask) {
        // interruption fondue : le secteur retiré a des bords flous, le cerne s'efface au lieu d'être coupé
        defs += `<filter id="${fid}mb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>`;
        defs += `<mask id="${fid}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${TIDE}" height="${TIDE}"><rect width="${TIDE}" height="${TIDE}" fill="#fff"/><path d="${sh.mask}" fill="#000" filter="url(#${fid}mb)"/></mask>`;
        body += `<g mask="url(#${fid}m)"><path d="${sh.d}" fill="#000" fill-rule="evenodd" filter="url(#${fid})"/></g>`;
      } else body += `<path d="${sh.d}" fill="#000" fill-rule="evenodd" filter="url(#${fid})"/>`;
    });
    sets.push({ out: `paper/tide-${i}.webp`, W: TIDE, H: TIDE, scale: BAKE, svg: doc(TIDE, TIDE, defs, body), quality: 0.86 });
  };
  const tea = { wash: c('gc-tea'), edge: c('gc-tea') };
  const coffee = { wash: c('gc-tea'), edge: c('gc-cafe-au-lait') };
  const water = { wash: c('gc-sepia-1'), edge: c('gc-sepia-2') };

  // 1. cerne de tasse complet, fin, avec un second passage plus pâle et décalé
  {
    const a = annulus(C, C, 96, 9, { seed: 11, amp: 0.018 });
    const b = annulus(C + 14, C - 9, 95, 6, { seed: 13, amp: 0.02, gapFrom: 2.2, gapTo: 4.4 });
    tide(1, [
      { d: a, fx: { rim: 2.4, rimBlur: 1.2, washOpacity: 0.1, edgeOpacity: 0.36, breakup: 0.8 } },
      { d: b.d, mask: b.gap, fx: { rim: 2, rimBlur: 1.1, washOpacity: 0.05, edgeOpacity: 0.2, breakup: 0.9 } },
    ], coffee);
  }
  // 2. cerne interrompu (tasse posée de travers sur le bord du livre)
  {
    const a = annulus(C, C, 88, 11, { seed: 21, amp: 0.025, gapFrom: -0.4, gapTo: 1.3 });
    tide(2, [{ d: a.d, mask: a.gap, fx: { rim: 2.6, rimBlur: 1.4, washOpacity: 0.1, edgeOpacity: 0.34, breakup: 0.8 } }], tea);
  }
  // 3. goutte d'eau séchée : contour net plus foncé, intérieur à peine teinté
  {
    const d = blob(C, C, 52, { seed: 31, irregularity: 0.16, n: 11 });
    tide(3, [{ d, fx: { rim: 3.6, rimBlur: 2.2, washOpacity: 0.05, edgeOpacity: 0.3, displace: 9 } }], water);
  }
  // 4. auréole d'humidité : grande plage aux lignes de séchage emboîtées, très pâle
  {
    const shapes = [];
    [[112, 0.05, 0.24, 0, 0], [76, 0.03, 0.14, 16, 12]].forEach(([r, w, e, dx, dy], j) => {
      shapes.push({ d: blob(C + dx, C + dy, r, { seed: 41 + j, irregularity: 0.14, n: 13 }), fx: { rim: 3, rimBlur: 2.4, washOpacity: w, edgeOpacity: e, displace: 12, freq: 0.03, breakup: 0.7 } });
    });
    tide(4, shapes, water);
  }
  // 5. éclaboussure : une goutte et quelques gouttelettes
  {
    const R = rng('gc-papier-tide-5');
    let d = blob(C - 10, C + 6, 30, { seed: 51, irregularity: 0.2, n: 9 });
    for (let j = 0; j < 5; j++) {
      const a = R.range(-0.9, 0.9) - 0.6, dist = R.range(42, 78);
      d += ' ' + wobblyCircle(C - 10 + Math.cos(a) * dist, C + 6 + Math.sin(a) * dist, R.range(2.5, 7), { seed: 60 + j, amp: 0.12, n: 10 });
    }
    tide(5, [{ d, fx: { rim: 2.4, rimBlur: 1.5, washOpacity: 0.09, edgeOpacity: 0.3, displace: 5 } }], tea);
  }
  return sets;
}

// ---------------------------------------------------------------------------------------------
const jobs = [
  ...(want('base') ? base() : []),
  ...(want('age') ? age() : []),
  ...(want('cockle') ? cockles() : []),
  ...(want('fox') ? foxes() : []),
  ...(want('tide') ? tides() : []),
];

const baker = await createBaker({ force: args.includes('--force') });
let total = 0;
const { statSync } = await import('node:fs');
for (const j of jobs) {
  if (args.includes('--src')) writeFileSync(join(SRC, j.out.replace(/\//g, '_').replace(/\.\w+$/, '.svg')), j.svg);
  const file = await baker.bake({ svg: j.svg, out: j.out, width: j.W, height: j.H, scale: j.scale ?? 1, quality: j.quality, background: j.background });
  const kb = statSync(file).size / 1024;
  total += kb;
  console.log(`${j.out.padEnd(28)} ${Math.round(j.W * (j.scale ?? 1))}×${Math.round(j.H * (j.scale ?? 1))}  ${kb.toFixed(1)} Ko`);
}
const r = await baker.close();
console.log(`papier : ${jobs.length} images, ${total.toFixed(0)} Ko (${r.made} cuites, ${r.kept} en cache)`);
