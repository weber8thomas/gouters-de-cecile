// Textures pré-rendues du carnet : papier, bois, toile de couverture (la nappe en lin est retirée, plan v3).
//   node scripts/bake-textures.mjs            (npm run textures)
//
// Chaque texture est décrite ici en SVG (feTurbulence + feColorMatrix + feComponentTransfer),
// avec des couleurs tirées des tokens (c('gc-…')). La source est écrite dans
// design-system/textures/src/<nom>.svg, puis rendue par Chromium dans un canvas et exportée
// en WebP (toDataURL('image/webp', 0.85)) dans design-system/textures/<nom>.webp.
// Les bruits répétés sont raccordables (stitchTiles="stitch", fréquences multiples de 1/taille)
// et les tracés qui touchent un bord sont recopiés de l'autre côté : chaque texture se répète
// sans couture. Rien n'est animé ni filtré en direct dans les composants.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { c } from './lib/tokens.mjs';
import { rng } from './lib/prng.mjs';
import { f } from './lib/organic.mjs';
import { launch } from './lib/browser.mjs';
import { ROOT } from './lib/serve.mjs';

const OUT = join(ROOT, 'design-system/textures');
const SRC = join(OUT, 'src');
mkdirSync(SRC, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Briques SVG

// Fréquence raccordable : k périodes sur la taille de la tuile.
const per = (k, size) => +(k / size).toFixed(6);

// Un calque de bruit coloré : alpha = gain × R + bias (R = bruit, éventuellement passé par une table),
// couleur unie d'un token. Renvoie les primitives à placer dans un <filter> et le nom du résultat.
let uid = 0;
function layer({ freq, octaves = 3, seed = 1, type = 'fractalNoise', color, gain, bias, opacity = 1, table, stitch = true }) {
  const n = `n${++uid}`;
  let s = `<feTurbulence type="${type}" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"${stitch ? ' stitchTiles="stitch"' : ''} result="${n}"/>`;
  let src = n;
  if (table) {
    s += `<feComponentTransfer in="${n}" result="${n}t"><feFuncR type="table" tableValues="${table}"/></feComponentTransfer>`;
    src = `${n}t`;
  }
  s += `<feColorMatrix in="${src}" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${gain} 0 0 0 ${bias}" result="${n}a"/>`;
  s += `<feFlood flood-color="${color}" flood-opacity="${opacity}" result="${n}c"/>`;
  s += `<feComposite in="${n}c" in2="${n}a" operator="in" result="${n}l"/>`;
  return { prims: s, out: `${n}l` };
}

// Un filtre complet : fond uni (facultatif) + calques fusionnés, sur une région en unités utilisateur.
// base : une couleur, ou une liste [couleur, opacité] d'aplats superposés.
function filter(id, [x, y, w, h], layers, base) {
  const ls = layers.map(layer);
  const floods = base == null ? [] : (Array.isArray(base) ? base : [[base, 1]]);
  const merge = [...floods.map((_, i) => `b${i}`), ...ls.map((l) => l.out)].map((r) => `<feMergeNode in="${r}"/>`).join('');
  return (
    `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB">` +
    floods.map(([col, op], i) => `<feFlood flood-color="${col}" flood-opacity="${f(op)}" result="b${i}"/>`).join('') +
    ls.map((l) => l.prims).join('') +
    `<feMerge>${merge}</feMerge></filter>`
  );
}

// Table en dents de scie (0 1 0 1 …) : transforme un bruit lisse en courbes de niveau.
const saw = (n, phase) => Array.from({ length: n }, (_, i) => ((i + phase) % 2 ? 1 : 0)).join(' ');

// Recopie un élément de part et d'autre de la tuile s'il en touche un bord (marge m).
function wrap(el, [x0, y0, x1, y1], W, H) {
  let s = '';
  for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
    if (x1 + dx < 0 || x0 + dx > W || y1 + dy < 0 || y0 + dy > H) continue;
    s += dx || dy ? `<g transform="translate(${dx} ${dy})">${el}</g>` : el;
  }
  return s;
}

const doc = (W, H, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>\n`;

// Fibre : courte courbe légèrement arquée.
function fiber(R, W, H, { len = [8, 34], width = [0.5, 1.1], color, opacity = [0.2, 0.4] }) {
  const x = R.range(0, W), y = R.range(0, H), a = R.range(0, Math.PI * 2), L = R.range(...len);
  const bend = R.range(-0.5, 0.5) * L * 0.35;
  const [x2, y2] = [x + Math.cos(a) * L, y + Math.sin(a) * L];
  const [mx, my] = [(x + x2) / 2 - Math.sin(a) * bend, (y + y2) / 2 + Math.cos(a) * bend];
  const el = `<path d="M${f(x)} ${f(y)}Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}" fill="none" stroke="${color}" stroke-width="${f(R.range(...width))}" stroke-linecap="round" opacity="${f(R.range(...opacity))}"/>`;
  return wrap(el, [Math.min(x, x2, mx) - 2, Math.min(y, y2, my) - 2, Math.max(x, x2, mx) + 2, Math.max(y, y2, my) + 2], W, H);
}

// ---------------------------------------------------------------------------------------------
// Papier : la couleur gc-paper elle-même, avec marbrures, dent, grain fin et quelques fibres.
function paper() {
  const S = 512;
  const R = rng('gc-paper-grain');
  const defs = filter('gc-tex-paper', [0, 0, S, S], [
    // nuages très doux : zones un peu plus vieillies…
    { freq: per(2, S), octaves: 5, seed: 11, color: c('gc-paper-edge'), gain: 1.8, bias: -0.62, opacity: 0.6 },
    // …et zones un peu plus claires
    { freq: per(3, S), octaves: 4, seed: 23, color: c('gc-paper-lace'), gain: 1.8, bias: -0.7, opacity: 0.7 },
    // épair (formation de la feuille), à peine marqué
    { freq: per(16, S), octaves: 3, seed: 5, color: c('gc-paper-edge'), gain: 1.6, bias: -0.6, opacity: 0.35 },
    // dent du papier
    { freq: per(120, S), octaves: 2, seed: 31, color: c('gc-paper-edge'), gain: 2.2, bias: -0.9, opacity: 0.45 },
    // grain fin, sombre et clair
    { freq: per(300, S), octaves: 1, seed: 7, color: c('gc-sepia-2'), gain: 2.4, bias: -1.25, opacity: 0.18 },
    { freq: per(280, S), octaves: 1, seed: 9, color: c('gc-paper-lace'), gain: 2.4, bias: -1.1, opacity: 0.5 },
  ], c('gc-paper'));
  let body = `<rect width="${S}" height="${S}" filter="url(#gc-tex-paper)"/>`;
  for (let i = 0; i < 60; i++) body += fiber(R, S, S, { color: c('gc-sepia-1'), opacity: [0.16, 0.34], len: [10, 42] });
  for (let i = 0; i < 30; i++) body += fiber(R, S, S, { color: c('gc-paper-lace'), opacity: [0.5, 0.9], width: [0.6, 1.3], len: [10, 40] });
  for (let i = 0; i < 9; i++) body += fiber(R, S, S, { color: c('gc-sepia-2'), opacity: [0.14, 0.24], len: [3, 9], width: [0.6, 1] });
  // quelques inclusions minuscules
  for (let i = 0; i < 10; i++) {
    const x = R.range(4, S - 4), y = R.range(4, S - 4);
    body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R.range(0.5, 1.1))}" fill="${c('gc-sepia-3')}" opacity="${f(R.range(0.12, 0.22))}"/>`;
  }
  return { name: 'paper-grain', W: S, H: S, svg: doc(S, S, defs, body) };
}

// ---------------------------------------------------------------------------------------------
// Bois : planches horizontales (gc-wood-1/2/3), veinage étiré, joints et aboutements.
// 1024 × 1152 : la hauteur diffère assez de celle de la scène pour que les bandes de table
// visibles en haut et en bas ne montrent pas la même planche.
function wood() {
  const W = 1024, H = 1152;
  const R = rng('gc-wood');
  const rows = [224, 236, 228, 240, 224];
  const seams = [[312], [708], [], [190, 858], [640]];
  let defs = '', body = '';
  let y = 0, k = 0;
  // ombre douce le long des chants de chaque planche (bois un peu bombé, usé)
  defs += `<linearGradient id="gc-tex-wood-edge" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${c('gc-wood-3')}" stop-opacity="0.32"/><stop offset="0.12" stop-color="${c('gc-wood-3')}" stop-opacity="0"/>` +
    `<stop offset="0.85" stop-color="${c('gc-wood-3')}" stop-opacity="0"/><stop offset="1" stop-color="${c('gc-wood-3')}" stop-opacity="0.38"/></linearGradient>`;
  rows.forEach((h, ri) => {
    const cuts = seams[ri].length ? seams[ri] : [0];
    const jointed = seams[ri].length > 0;
    cuts.forEach((x0, bi) => {
      const x1 = bi + 1 < cuts.length ? cuts[bi + 1] : cuts[0] + W;
      const id = `gc-tex-wood-${++k}`;
      const s = 100 + k * 17;
      const tone = R.range(0.0, 0.7); // part de gc-wood-1 posée sur gc-wood-2 : chaque planche a son ton
      const rings = `0.0009 ${R.range(0.0055, 0.008).toFixed(4)}`;
      defs += filter(id, [x0, y, x1 - x0, h], [
        // larges zones claires (bois de printemps)
        { freq: `${R.range(0.0012, 0.002).toFixed(4)} ${R.range(0.014, 0.02).toFixed(4)}`, octaves: 3, seed: s + 1, color: c('gc-wood-1'), gain: 2.6, bias: -1.05, opacity: 0.85 },
        // veines sombres étirées
        { freq: `0.0011 ${R.range(0.03, 0.042).toFixed(4)}`, octaves: 4, seed: s + 2, color: c('gc-wood-3'), gain: 3.4, bias: -1.75, opacity: 0.75 },
        // dessin des cernes : courbes de niveau du bruit (table en dents de scie), lignes fines
        { freq: rings, octaves: 2, seed: s + 3, color: c('gc-wood-3'), gain: 5, bias: -4.1, opacity: 0.5, table: saw(45, 1) },
        { freq: rings, octaves: 2, seed: s + 3, color: c('gc-wood-1'), gain: 1.1, bias: -0.35, opacity: 0.45, table: saw(45, 0) },
        // pores et fibres fines
        { freq: '0.004 0.55', octaves: 1, seed: s + 4, color: c('gc-wood-3'), gain: 3.4, bias: -1.95, opacity: 0.55 },
        { freq: '0.005 0.42', octaves: 1, seed: s + 5, color: c('gc-wood-1'), gain: 3.2, bias: -1.85, opacity: 0.5 },
      ], [[c('gc-wood-2'), 1], [c('gc-wood-1'), tone]]);
      const rect = `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" filter="url(#${id})"/>`;
      body += rect + (x1 > W ? `<g transform="translate(${-W} 0)">${rect}</g>` : '');
      // aboutement : rainure sombre, arête claire à droite (lumière venant de la gauche)
      if (jointed) for (const dx of [0, -W, W]) {
        const sx = x0 + dx;
        if (sx < -4 || sx > W + 4) continue;
        body += `<rect x="${sx - 1.2}" y="${y}" width="2.4" height="${h}" fill="${c('gc-wood-3')}" opacity="0.85"/>`;
        body += `<rect x="${sx + 1.2}" y="${y}" width="1.2" height="${h}" fill="${c('gc-kraft')}" opacity="0.22"/>`;
        body += `<rect x="${sx - 5}" y="${y}" width="3.8" height="${h}" fill="${c('gc-wood-3')}" opacity="0.18"/>`;
      }
    });
    body += `<rect x="0" y="${y}" width="${W}" height="${h}" fill="url(#gc-tex-wood-edge)"/>`;
    y += h;
  });
  // joints entre rangées : rainure, ombre sous l'arête du haut, arête éclairée de la planche du bas
  y = 0;
  for (const h of [0, ...rows]) {
    y += h;
    for (const yy of y >= H ? [H] : y === 0 ? [0, H] : [y]) {
      body += `<rect x="0" y="${yy - 4.5}" width="${W}" height="3" fill="${c('gc-wood-3')}" opacity="0.22"/>`;
      body += `<rect x="0" y="${yy - 1.6}" width="${W}" height="3.2" fill="${c('gc-wood-3')}" opacity="0.92"/>`;
      body += `<rect x="0" y="${yy + 1.6}" width="${W}" height="1.4" fill="${c('gc-kraft')}" opacity="0.3"/>`;
    }
    if (y >= H) break;
  }
  return { name: 'wood', W, H, svg: doc(W, H, defs, body) };
}

// ---------------------------------------------------------------------------------------------
// Toile tissée : trame fine et irrégulière (gc-linen / gc-linen-shade), fils flammés.
function weave(name, S, { pitch, thread, slub, mottle, seed }) {
  const R = rng(seed);
  const n = S / pitch;
  // masques de « flammé » : chaque fil varie lentement d'intensité sur sa longueur
  const defs =
    filter(`gc-tex-${name}-mw`, [0, 0, S, S], [{ freq: `${per(n, S)} ${per(slub, S)}`, octaves: 2, seed: seed.length + 3, color: c('gc-paper-lace'), gain: 2.6, bias: -0.75 }]) +
    filter(`gc-tex-${name}-mh`, [0, 0, S, S], [{ freq: `${per(slub, S)} ${per(n, S)}`, octaves: 2, seed: seed.length + 9, color: c('gc-paper-lace'), gain: 2.6, bias: -0.75 }]) +
    `<mask id="gc-tex-${name}-kw" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}"><rect width="${S}" height="${S}" filter="url(#gc-tex-${name}-mw)"/></mask>` +
    `<mask id="gc-tex-${name}-kh" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}"><rect width="${S}" height="${S}" filter="url(#gc-tex-${name}-mh)"/></mask>` +
    filter(`gc-tex-${name}-mot`, [0, 0, S, S], [
      { freq: per(mottle, S), octaves: 3, seed: seed.length + 21, color: c('gc-linen-shade'), gain: 2.2, bias: -0.9, opacity: 0.6 },
      { freq: per(mottle + 1, S), octaves: 3, seed: seed.length + 33, color: c('gc-paper-lace'), gain: 2.2, bias: -0.95, opacity: 0.45 },
      { freq: per(Math.round(S * 0.6), S), octaves: 1, seed: seed.length + 41, color: c('gc-linen-shade'), gain: 3, bias: -1.6, opacity: 0.6 },
    ], c('gc-linen'));
  // fils de chaîne (verticaux) et de trame (horizontaux) : creux sombres, crêtes claires
  let warp = '', weft = '';
  for (let i = 0; i < n; i++) {
    const t = thread * R.range(0.75, 1.3);
    const x = i * pitch + R.range(-0.25, 0.25) * pitch;
    warp += `<rect x="${f(x)}" y="0" width="${f(pitch - t)}" height="${S}" fill="${c('gc-linen-shade')}" opacity="${f(R.range(0.45, 0.85))}"/>`;
    warp += `<rect x="${f(x + pitch - t)}" y="0" width="${f(Math.max(0.6, t * 0.4))}" height="${S}" fill="${c('gc-paper-lace')}" opacity="${f(R.range(0.25, 0.55))}"/>`;
    const y = i * pitch + R.range(-0.25, 0.25) * pitch;
    weft += `<rect x="0" y="${f(y)}" width="${S}" height="${f(pitch - t)}" fill="${c('gc-linen-shade')}" opacity="${f(R.range(0.45, 0.85))}"/>`;
    weft += `<rect x="0" y="${f(y + pitch - t)}" width="${S}" height="${f(Math.max(0.6, t * 0.4))}" fill="${c('gc-paper-lace')}" opacity="${f(R.range(0.25, 0.55))}"/>`;
  }
  // quelques fils plus épais (flammes) qui traversent la tuile
  let slubs = '';
  for (let i = 0; i < Math.round(S / 40); i++) {
    const horiz = R.next() < 0.5;
    const p = Math.floor(R.range(0, n)) * pitch + pitch / 2;
    const a = R.range(0, S), L = R.range(S * 0.2, S * 0.6), th = thread * R.range(0.7, 1.1);
    const el = horiz
      ? `<rect x="${f(a)}" y="${f(p - th / 2)}" width="${f(L)}" height="${f(th)}" rx="${f(th / 2)}" fill="${c('gc-linen-shade')}" opacity="${f(R.range(0.35, 0.6))}"/>`
      : `<rect x="${f(p - th / 2)}" y="${f(a)}" width="${f(th)}" height="${f(L)}" rx="${f(th / 2)}" fill="${c('gc-linen-shade')}" opacity="${f(R.range(0.35, 0.6))}"/>`;
    slubs += horiz ? wrap(el, [a, p - th, a + L, p + th], S, S) : wrap(el, [p - th, a, p + th, a + L], S, S);
  }
  const body =
    `<rect width="${S}" height="${S}" filter="url(#gc-tex-${name}-mot)"/>` +
    `<g mask="url(#gc-tex-${name}-kw)">${warp}</g>` +
    `<g mask="url(#gc-tex-${name}-kh)">${weft}</g>` +
    slubs;
  return { name, W: S, H: S, svg: doc(S, S, defs, body) };
}

const coverFabric = () => weave('cover-fabric', 512, { pitch: 8, thread: 4.6, slub: 7, mottle: 3, seed: 'gc-cover-fabric' });

// ---------------------------------------------------------------------------------------------
// Rendu : Chromium dessine chaque SVG dans un canvas puis l'exporte en WebP.

const textures = [paper(), wood(), coverFabric()];
const browser = await launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
let total = 0;
for (const t of textures) {
  writeFileSync(join(SRC, `${t.name}.svg`), t.svg);
  const dataUrl = await page.evaluate(async ({ svg, W, H }) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(img, 0, 0, W, H);
    return cv.toDataURL('image/webp', 0.85);
  }, t);
  if (!dataUrl.startsWith('data:image/webp')) throw new Error(`${t.name} : export WebP refusé par le navigateur`);
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  writeFileSync(join(OUT, `${t.name}.webp`), buf);
  total += buf.length;
  console.log(`${t.name}.webp  ${t.W}×${t.H}  ${(buf.length / 1024).toFixed(0)} Ko`);
}
await browser.close();
console.log(`total ${(total / 1024).toFixed(0)} Ko (plafond 600 Ko)`);
if (total > 600 * 1024) { console.error('Textures trop lourdes : réduire le grain ou la taille.'); process.exit(1); }
