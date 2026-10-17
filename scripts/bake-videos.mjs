// Vidéos exemples des invités (lot V) : un montage de 12 s par invité de la démo, son affiche
// couleur, son tirage photo sépia et ses coins photo ou son scotch jauni.
//
//   node scripts/bake-videos.mjs [--force] [--only lisa,julie] [--sans-planche] [--planche-seule]
//
// Entrées
//   design-system/sources/videos/credits.json   clips (page, fichier, sha256, auteur, licence)
//   originaux : design-system/sources/videos/originaux/ puis verification/out/v/originaux/ ;
//               s'il manque, le fichier est retéléchargé (curl) depuis credits.json et son sha256 vérifié.
//
// Sorties (noms logiques d'assetUrl() entre crochets)
//   design-system/baked/videos/<id>.mp4              [videos/<id>]          12 s, 1280×720, H.264 High,
//                                                     CRF 27 (relevé si besoin), maxrate 1,4M, AAC 96k muet, ≤ 2 Mo
//   design-system/baked/videos/<id>-affiche.webp     [videos/<id>-affiche]  1re image de la vidéo, en couleur
//   design-system/baked/photos/<id>/tirage.webp      [photos/<id>/tirage]   tirage sépia à bord blanc (alpha)
//   design-system/baked/photos/<id>/coins.webp       [photos/<id>/coins]    coins photo ou scotch (alpha),
//                                                     même cadre que le tirage : ils se superposent exactement
//   src/content/videos.json                          entrées CONTRACT § 12.3 (+ « geometrie », « sources »)
//   verification/out/v/planche.png                    planche de contrôle (tirages posés + images couleur)
//
// Le tirage reprend exactement la 1re image de la vidéo (cadre 3:2 pris dans le 16:9) : quand la photo
// se soulève, sépia → couleur → vidéo s'enchaînent sans saut. « geometrie » donne, en fractions de
// l'image du tirage, le papier, la photo, et la zone du cadre vidéo qu'elle montre.
//
// Tout est cuit ici (ffmpeg + calcul en Node + Chromium pour les coins) : aucun effet à l'exécution.
// Déterministe : graines fixes, x264 à 4 fils, conteneur « bitexact ». Cache local
// (verification/out/v/cache.json) par sha256 des originaux + paramètres + source des fonctions de rendu.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT } from './lib/serve.mjs';
import { launch } from './lib/browser.mjs';
import { rng, hash } from './lib/prng.mjs';
import { gradientNoise, fbm } from './lib/fx-papier.mjs';
import { tornEdge } from './lib/organic.mjs';
import { c } from './lib/tokens.mjs';

const FFMPEG = '/usr/bin/ffmpeg';
const SRC = join(ROOT, 'design-system/sources/videos');
const OUT = join(ROOT, 'verification/out/v');
const DOSSIERS_ORIGINAUX = [join(SRC, 'originaux'), join(OUT, 'originaux')];
const BAKED = join(ROOT, 'design-system/baked');
const CACHE = join(OUT, 'cache.json');
const CONTENU = join(ROOT, 'src/content/videos.json');

/** Vidéo : 720p 25 i/s, 12 s, fondus enchaînés de 0,6 s entre plans. */
const V = { w: 1280, h: 720, fps: 25, duree: 12, fondu: 0.6, crf: 27, crfMax: 33, plafond: 2_000_000 };

/**
 * Tirage : photo 3:2 de 1080×720 px (à 1:1 avec le cadre 720p), bord blanc cassé ≈ 5 à 7,6 %
 * (un peu décentré, comme un vrai tirage d'agrandisseur), coins arrondis de 9 px, et une marge
 * transparente de 100 px tout autour pour l'ombre de contact, les coins photo et le scotch qui déborde.
 */
const T = { pw: 1080, ph: 720, bord: { g: 58, d: 62, h: 56, b: 64 }, marge: 100, rayon: 9 };
T.w = T.pw + T.bord.g + T.bord.d; // 1200 : largeur du papier
T.h = T.ph + T.bord.h + T.bord.b; // 840
T.cw = T.w + 2 * T.marge; // 1400 : largeur de l'image
T.ch = T.h + 2 * T.marge; // 1040

// ---------------------------------------------------------------------------------------------
// Les invités de la démo. Segments : [de, a] en secondes dans l'original ; x, y : position du cadre
// 16:9 dans l'original (0 à 1) ; z : zoom (≥ 1). tirage.x : position du cadre 3:2 dans le cadre 16:9.
// lenteur (optionnel, défaut 1) : étire le plan (1,1 = 10 % plus lent) quand la source est trop courte pour 12 s.

const INVITES = {
  lisa: {
    titre: 'Le carrot cake de Lisa',
    angle: -2.4,
    segments: [{ clip: 'pexels-4492700', de: 0.0, a: 10.26, lenteur: 1.17 }], // salue de la main, bisou des deux mains, face caméra
    couleur: { saturation: 0.94, u: -1, v: 1 },
    tirage: { x: 0.5, lift: 0.1, cap: 0.94, contraste: 0.42, vignette: 0.3, grain: 0.034, chaleur: 1, trace: { type: 'pli', coin: 'bd' } },
    maintien: {
      type: 'scotch',
      age: 0.7,
      bandes: [
        { coin: 'hg', angle: -42, long: 250, large: 86, rentre: 38 },
        { coin: 'hd', angle: 47, long: 236, large: 86, rentre: 34 },
      ],
    },
  },
  julie: {
    titre: 'Le cake au citron de Julie',
    angle: 1.8,
    segments: [{ clip: 'pexels-7157237', de: 0.0, a: 11.2, lenteur: 1.08 }], // chapeau de fête, beignet à bougie tendu à la caméra
    couleur: { saturation: 0.9, u: -3, v: 2, gamma: 0.97 },
    tirage: { x: 0.0, lift: 0.1, cap: 0.92, contraste: 0.62, vignette: 0.34, grain: 0.032, chaleur: 0.92, halo: { seuil: 0.82, force: 0.25 }, trace: { type: 'tache', ou: [0.64, 0.962] } },
    maintien: { type: 'coins', papier: 'noir', jeu: 1 },
  },
  rose: {
    titre: 'Les sablés de Rose',
    angle: -1.3,
    segments: [{ clip: 'pexels-6248328', de: 0.0, a: 10.84, lenteur: 1.11 }], // grand-mère qui salue et parle face caméra
    couleur: { saturation: 0.96, u: -1, v: 1 },
    tirage: { x: 0.55, lift: 0.14, cap: 0.92, contraste: 0.34, vignette: 0.36, grain: 0.038, chaleur: 1.08, papier: 0.8, trace: { type: 'rayure' } },
    maintien: { type: 'coins', papier: 'kraft', jeu: 1.4 },
  },
  mathis: {
    titre: 'Les cookies de Mathis',
    angle: 3.1,
    segments: [{ clip: 'pexels-8899920', de: 1.0, a: 13.2 }], // garçon au chapeau de fête, sourit à la caméra
    couleur: { saturation: 0.95, u: -1, v: 1 },
    tirage: { x: 0.5, lift: 0.09, cap: 0.95, contraste: 0.46, vignette: 0.24, grain: 0.032, chaleur: 0.95, trace: { type: 'aucune' } },
    maintien: {
      type: 'scotch',
      age: 0.45,
      bandes: [
        { bord: 'h', t: 0.3, angle: 84, long: 188, large: 82, rentre: 26 },
        { coin: 'bd', angle: -38, long: 244, large: 82, rentre: 40 },
      ],
    },
  },
  bernard: {
    titre: 'La tarte aux pommes de Bernard',
    angle: -3.4,
    segments: [
      { clip: 'pexels-6949566', de: 0.6, a: 7.1 }, // lève son verre de vin rouge, face caméra
      { clip: 'pexels-6949558', de: 0.4, a: 7.1 }, // même tournage, second plan
    ],
    couleur: { saturation: 0.95, u: 0, v: 0 },
    tirage: { x: 0.52, lift: 0.11, cap: 0.94, contraste: 0.4, vignette: 0.32, grain: 0.036, chaleur: 1, papier: 0.4, trace: { type: 'pli', coin: 'bg', long: 1.9 } },
    maintien: { type: 'coins', papier: 'noir', jeu: 2.2, decolle: 'bd' },
  },
};

// ---------------------------------------------------------------------------------------------
// Outils

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const oi = args.indexOf('--only');
const ONLY = oi >= 0 ? args[oi + 1].split(',') : null;
const PLANCHE = !args.includes('--sans-planche');
const PLANCHE_SEULE = args.includes('--planche-seule');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const empreinte = (o) => sha256(JSON.stringify(o));
const rel = (p) => p.slice(ROOT.length + 1);
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => smooth(clamp((x - a) / (b - a)));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const f2 = (n) => +n.toFixed(2);
const f5 = (n) => +n.toFixed(5);

function ffmpeg(argv, { input } = {}) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', ...argv], { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg a échoué (${r.status}) :\n${r.stderr}\n${argv.join(' ')}`);
  return r.stdout;
}
const VERSION_FFMPEG = execFileSync(FFMPEG, ['-version']).toString().split('\n')[0];

const credits = JSON.parse(readFileSync(join(SRC, 'credits.json'), 'utf8'));
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

/** Chemin local d'un original (vérifié par sha256), retéléchargé si absent. */
const verifies = new Map();
function original(id) {
  if (verifies.has(id)) return verifies.get(id);
  const clip = credits.clips[id];
  if (!clip) throw new Error(`clip inconnu dans credits.json : ${id}`);
  const { nom, url, sha256: attendu } = clip.fichier;
  let chemin = DOSSIERS_ORIGINAUX.map((d) => join(d, nom)).find((p) => existsSync(p));
  if (!chemin) {
    chemin = join(OUT, 'originaux', nom);
    mkdirSync(dirname(chemin), { recursive: true });
    console.log(`  téléchargement ${url}`);
    execFileSync('curl', ['-sS', '-f', '-L', '-m', '600', '-o', chemin + '.part', url], { stdio: 'inherit' });
    renameSync(chemin + '.part', chemin);
  }
  const s = sha256(readFileSync(chemin));
  if (s !== attendu) throw new Error(`sha256 inattendu pour ${chemin} : ${s} (attendu ${attendu})`);
  verifies.set(id, chemin);
  return chemin;
}

// ---------------------------------------------------------------------------------------------
// Vidéo

/** Chaîne de filtres d'un plan : cadre 16:9, 25 i/s, couleur commune à l'invité. */
function filtrePlan(i, seg, couleur) {
  const z = seg.z ?? 1;
  const [x, y] = [seg.x ?? 0.5, seg.y ?? 0.5];
  const sw = Math.round(V.w * z), sh = Math.round(V.h * z);
  const { saturation = 1, gamma = 1, contraste = 1, u = 0, v = 0 } = couleur ?? {};
  return (
    `[${i}:v]fps=${V.fps},scale=${sw}:${sh}:force_original_aspect_ratio=increase:flags=lanczos,` +
    `crop=${V.w}:${V.h}:(iw-${V.w})*${x}:(ih-${V.h})*${y},setsar=1,format=yuv420p,` +
    `eq=saturation=${saturation}:gamma=${gamma}:contrast=${contraste},lutyuv=u=val${u >= 0 ? '+' : ''}${u}:v=val${v >= 0 ? '+' : ''}${v},` +
    `settb=1/${V.fps},setpts=(PTS-STARTPTS)*${seg.lenteur ?? 1}`
  );
}

function entreesPlans(inv) {
  return inv.segments.flatMap((s) => ['-ss', s.de.toFixed(3), '-t', (s.a - s.de).toFixed(3), '-i', original(s.clip)]);
}

function encoderVideo(id, inv, sortie) {
  const segs = inv.segments;
  const durees = segs.map((s) => (s.a - s.de) * (s.lenteur ?? 1));
  const total = durees.reduce((a, b) => a + b, 0) - V.fondu * (segs.length - 1);
  if (total < V.duree - 1e-6) throw new Error(`${id} : montage trop court (${total.toFixed(2)} s)`);
  let fc = segs.map((s, i) => filtrePlan(i, s, inv.couleur) + `[s${i}]`).join(';');
  let dernier = 's0', acc = durees[0];
  for (let i = 1; i < segs.length; i++) {
    const out = `x${i}`;
    fc += `;[${dernier}][s${i}]xfade=transition=fade:duration=${V.fondu}:offset=${(acc - V.fondu).toFixed(3)}[${out}]`;
    acc += durees[i] - V.fondu;
    dernier = out;
  }
  fc += `;[${dernier}]null[v]`;
  const nA = segs.length;
  const tmp = sortie + '.tmp.mp4';
  for (let crf = V.crf; crf <= V.crfMax; crf++) {
    ffmpeg([
      '-y', ...entreesPlans(inv),
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-filter_complex', fc, '-map', '[v]', '-map', `${nA}:a`, '-t', String(V.duree),
      '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '3.1', '-crf', String(crf),
      '-maxrate', '1.4M', '-bufsize', '2.8M', '-pix_fmt', 'yuv420p', '-g', String(2 * V.fps), '-threads', '4',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '48000',
      '-movflags', '+faststart', '-map_metadata', '-1', '-map_chapters', '-1',
      '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', tmp,
    ]);
    const octets = statSync(tmp).size;
    if (octets <= V.plafond) {
      renameSync(tmp, sortie);
      return { crf, octets };
    }
    console.log(`  ${id} : ${(octets / 1e6).toFixed(2)} Mo à CRF ${crf}, on relève`);
  }
  throw new Error(`${id} : impossible de passer sous ${V.plafond} octets`);
}

/** Première image du montage (avant compression), RGB 8 bits 1280×720, matrice bt709. */
function premiereImage(inv) {
  const s = inv.segments[0];
  return ffmpeg([
    '-ss', s.de.toFixed(3), '-t', '1', '-i', original(s.clip),
    '-filter_complex', filtrePlan(0, s, inv.couleur) + ',scale=in_color_matrix=bt709:in_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=rgb24[v]',
    '-map', '[v]', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ]);
}

function webp(raw, w, h, fmt, sortie, qualite) {
  mkdirSync(dirname(sortie), { recursive: true });
  ffmpeg(['-y', '-f', 'rawvideo', '-pix_fmt', fmt, '-s', `${w}x${h}`, '-i', 'pipe:0',
    '-c:v', 'libwebp', '-quality', String(qualite), '-compression_level', '6', '-preset', 'photo',
    '-pix_fmt', fmt === 'rgba' ? 'yuva420p' : 'yuv420p', '-fflags', '+bitexact', '-map_metadata', '-1', sortie], { input: raw });
}

// ---------------------------------------------------------------------------------------------
// Calcul en flottant : flous, bruit, tampons

/** Flou gaussien séparable (noyau exact jusqu'à σ = 2,5, trois boîtes au-delà), bords répétés. */
function flou(a, W, H, sigma) {
  if (sigma <= 0) return Float32Array.from(a);
  if (sigma <= 2.5) {
    const r = Math.ceil(sigma * 3);
    const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
    const s = k.reduce((x, y) => x + y, 0);
    const kn = Float32Array.from(k.map((x) => x / s));
    const t = new Float32Array(a.length), o = new Float32Array(a.length);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let j = -r; j <= r; j++) acc += kn[j + r] * a[row + clampI(x + j, W)];
        t[row + x] = acc;
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let j = -r; j <= r; j++) acc += kn[j + r] * t[clampI(y + j, H) * W + x];
        o[y * W + x] = acc;
      }
    }
    return o;
  }
  let s = Float32Array.from(a);
  const t = new Float32Array(a.length);
  for (const b of boites(sigma)) {
    const r = (b - 1) / 2;
    boiteH(s, t, W, H, r);
    boiteV(t, s, W, H, r);
  }
  return s;
}
const clampI = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);
function boites(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wl + 2));
}
function boiteH(src, dst, W, H, r) {
  const P = new Float64Array(W + 1);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) P[x + 1] = P[x] + src[row + x];
    for (let x = 0; x < W; x++) {
      const a = Math.max(0, x - r), b = Math.min(W, x + r + 1);
      dst[row + x] = (P[b] - P[a]) / (b - a);
    }
  }
}
function boiteV(src, dst, W, H, r) {
  const P = new Float64Array(H + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) P[y + 1] = P[y] + src[y * W + x];
    for (let y = 0; y < H; y++) {
      const a = Math.max(0, y - r), b = Math.min(H, y + r + 1);
      dst[y * W + x] = (P[b] - P[a]) / (b - a);
    }
  }
}

/** Bruit blanc ≈ gaussien (somme de trois uniformes), écart type 1. */
function bruit(R, n) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = (R.next() + R.next() + R.next() - 1.5) * 2;
  return a;
}
function normaliser(a) {
  let m = 0, v = 0;
  for (const x of a) m += x;
  m /= a.length;
  for (const x of a) v += (x - m) ** 2;
  const s = Math.sqrt(v / a.length) || 1;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - m) / s;
  return a;
}
function centile(a, p) {
  const s = Float32Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
}

/** Champ basse fréquence (fbm de Perlin) échantillonné sur W×H, valeurs ≈ [−0,5 ; 0,5]. */
function champ(seed, W, H, cells, octaves = 3, pas = 4) {
  const n = fbm(gradientNoise(seed), { cells, octaves, W, H });
  const gw = Math.ceil(W / pas) + 2, gh = Math.ceil(H / pas) + 2;
  const g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = n(i * pas, j * pas);
  const o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = y / pas, j = Math.floor(fy), ty = fy - j;
    for (let x = 0; x < W; x++) {
      const fx = x / pas, i = Math.floor(fx), tx = fx - i;
      const a = g[j * gw + i], b = g[j * gw + i + 1], cc = g[(j + 1) * gw + i], d = g[(j + 1) * gw + i + 1];
      o[y * W + x] = lerp(lerp(a, b, tx), lerp(cc, d, tx), ty);
    }
  }
  return o;
}

/** Couverture (0–1) d'un trait polyligne d'épaisseur `ep`, cumulée au maximum (pas de surépaisseur). */
function trait(masque, W, H, pts, ep, force = 1) {
  const r = ep / 2;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
    const L = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.ceil(L / 0.5));
    for (let s = 0; s <= n; s++) {
      const cx = x1 + ((x2 - x1) * s) / n, cy = y1 + ((y2 - y1) * s) / n;
      tampon(masque, W, H, cx, cy, r, force);
    }
  }
}
function tampon(masque, W, H, cx, cy, r, force = 1) {
  const R = Math.ceil(r + 1.5);
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const w = clamp(r + 0.5 - d) * force;
      const i = y * W + x;
      if (w > masque[i]) masque[i] = w;
    }
  }
}
/** Courbe douce (Catmull-Rom) passant par des points, échantillonnée. */
function courbe(pts, n = 12) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tirage sépia

/**
 * Virage sépia d'un tirage argentique ancien, à partir de la 1re image (RGB 1280×720).
 * Densité D (1 = blanc du papier) : luminance un peu orthochromatique, douceur d'objectif et léger halo
 * des hautes lumières, niveaux, courbe en S, noirs relevés et blancs bridés, densité inégale, vignetage,
 * grain argentique (plus fort dans les demi-teintes), poussières, cheveu, et la « trace » de l'invité.
 * Puis virage par une table de couleurs chaudes (gc-sepia-*), bord blanc cassé jauni vers l'extérieur,
 * texture du papier, usure des coins, coins arrondis et ombre de contact. Renvoie RGBA T.cw × T.ch.
 */
function tirageSepia(id, frame, p) {
  const { pw, ph } = T;
  const R = rng(hash(`tirage:${id}`));
  const n = pw * ph;
  const [sx0, sy0, sw] = cadreTirage(p);
  const k = sw / pw; // px du cadre vidéo par px du tirage (1 sans zoom)
  // 1. Luminance (un peu orthochromatique : le rouge sort plus sombre, comme sur les vieilles émulsions)
  let Y = new Float32Array(n);
  const lum0 = new Float32Array(V.w * V.h);
  for (let i = 0; i < V.w * V.h; i++) {
    const [r, g, b] = [frame[3 * i] / 255, frame[3 * i + 1] / 255, frame[3 * i + 2] / 255];
    lum0[i] = 0.82 * (0.299 * r + 0.587 * g + 0.114 * b) + 0.18 * (0.12 * r + 0.58 * g + 0.3 * b);
  }
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) Y[y * pw + x] = echant(lum0, V.w, V.h, sx0 + (x + 0.5) * k - 0.5, sy0 + (y + 0.5) * k - 0.5);
  // 2. Douceur de l'objectif et de l'agrandisseur, halo des hautes lumières
  const Ys = flou(Y, pw, ph, 1.1 / k);
  const haut = new Float32Array(n);
  const seuil = p.halo?.seuil ?? 0.7, forceHalo = p.halo?.force ?? 0.55;
  for (let i = 0; i < n; i++) { Y[i] = 0.4 * Y[i] + 0.6 * Ys[i]; haut[i] = Math.max(0, Y[i] - seuil); }
  const halo = flou(haut, pw, ph, 9);
  for (let i = 0; i < n; i++) Y[i] += forceHalo * halo[i];
  // 3. Niveaux (0,4 % et 99,6 %), courbe en S, noirs relevés et blancs bridés (tirage passé)
  // Le tireur charge davantage un négatif clair : la densité médiane est ramenée vers p.densite.
  const lo = centile(Y, 0.004), hi = centile(Y, 0.996);
  const med = clamp((centile(Y, 0.5) - lo) / (hi - lo || 1), 0.05, 0.95);
  const gamma = clamp(Math.log(p.densite ?? 0.48) / Math.log(med), 0.9, 1.7);
  const D = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = clamp((Y[i] - lo) / (hi - lo || 1));
    v = Math.pow(v, gamma);
    v = v + p.contraste * (smooth(v) - v);
    D[i] = p.lift + (p.cap - p.lift) * v;
  }
  // 4. Densité inégale (développement, vieillissement) et vignetage, un côté un peu plus clair
  const m = champ(hash(`mottle:${id}`), pw, ph, [3, 2], 3);
  const [gx, gy] = [R.range(-1, 1), R.range(-1, 1)];
  for (let y = 0; y < ph; y++) {
    const ry = (y - ph / 2) / (ph / 2);
    for (let x = 0; x < pw; x++) {
      const rx = (x - pw / 2) / (pw / 2);
      const r2 = (rx * rx * 0.85 + ry * ry) / 1.85;
      const i = y * pw + x;
      D[i] *= (1 - p.vignette * Math.pow(r2, 1.25)) * (1 + 0.05 * m[i]) * (1 + 0.025 * (gx * rx + gy * ry));
    }
  }
  // 5. Grain argentique : fin + amas, plus présent dans les demi-teintes
  const g1 = normaliser(flou(bruit(R, n), pw, ph, 0.6));
  const g2 = normaliser(flou(bruit(R, n), pw, ph, 1.6));
  for (let i = 0; i < n; i++) {
    const d = clamp(D[i]);
    const a = p.grain * (0.3 + 0.7 * 4 * d * (1 - d));
    D[i] += a * (0.85 * g1[i] + 0.45 * g2[i]);
  }
  // 6. Poussières du négatif (points clairs), quelques points sombres, un cheveu, une rayure
  const clair = new Float32Array(n), sombre = new Float32Array(n);
  for (let k = 0, N = R.int(10, 18); k < N; k++) tampon(clair, pw, ph, R.range(0, pw), R.range(0, ph), R.range(0.5, 1.9), R.range(0.35, 0.85));
  for (let k = 0, N = R.int(4, 8); k < N; k++) tampon(sombre, pw, ph, R.range(0, pw), R.range(0, ph), R.range(0.4, 1.1), R.range(0.3, 0.7));
  {
    const [x0, y0] = [R.range(80, pw - 80), R.range(60, ph - 60)];
    let a = R.range(0, Math.PI * 2);
    const pts = [[x0, y0]];
    for (let k = 0; k < 5; k++) { a += R.range(-0.9, 0.9); const l = R.range(8, 20); pts.push([pts[k][0] + Math.cos(a) * l, pts[k][1] + Math.sin(a) * l]); }
    trait(clair, pw, ph, courbe(pts), 0.9, 0.55);
  }
  if (p.trace?.type === 'rayure' || R.next() < 0.5) {
    const x0 = R.range(pw * 0.15, pw * 0.85), y0 = R.range(-20, ph * 0.3), y1 = R.range(ph * 0.6, ph + 20);
    const pts = [0, 1, 2, 3, 4].map((k) => [x0 + R.range(-3, 3) + k * R.range(-2, 2), lerp(y0, y1, k / 4)]);
    trait(clair, pw, ph, courbe(pts), 0.7, p.trace?.type === 'rayure' ? 0.45 : 0.22);
  }
  for (let i = 0; i < n; i++) D[i] = lerp(lerp(D[i], 0.97, clair[i]), 0.12, sombre[i]);

  // 7. Virage : table de couleurs (ombres brun chocolat, demi-teintes cuivrées, blancs crème)
  const stops = [
    [0.0, '#1e130c'], [0.16, '#3e2a1c'], [0.34, c('gc-sepia-4')], [0.52, c('gc-sepia-3')],
    [0.7, c('gc-sepia-2')], [0.86, c('gc-sepia-1')], [1.0, '#f2e7cf'],
  ].map(([t, h]) => [t, hex(h)]);
  const LUT = new Float32Array(1024 * 3);
  for (let k = 0; k < 1024; k++) {
    const t = k / 1023;
    let j = 0;
    while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
    const [t0, c0] = stops[j], [t1, c1] = stops[j + 1];
    const u = clamp((t - t0) / (t1 - t0));
    const col = [0, 1, 2].map((q) => lerp(c0[q], c1[q], u));
    const lum = 0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2];
    for (let q = 0; q < 3; q++) LUT[k * 3 + q] = clamp(lerp(lum, col[q], p.chaleur));
  }

  // 8. Papier : bord blanc cassé, texture, jaunissement vers l'extérieur, usure des coins, trace
  const { w: PW, h: PH, cw: CW, ch: CH, marge: M } = T;
  const bx = T.bord.g, by = T.bord.h;
  const pn = PW * PH;
  const fibre = normaliser(flou(bruit(R, pn), PW, PH, 0.7));
  const nappe = champ(hash(`papier:${id}`), PW, PH, [6, 4], 3);
  const jauni = hex('#dccaa6');
  const blanc = hex('#f1e9d8').map((v, q) => lerp(v, jauni[q], 0.3 * (p.papier ?? 0)));
  const lum = new Float32Array(pn).fill(1); // assombrissement du papier (trace, pli)
  const teinte = new Float32Array(pn); // tache brune
  const pliClair = new Float32Array(pn);
  const tr = p.trace ?? {};
  if (tr.type === 'pli') {
    // Pli en travers d'un coin : l'émulsion casse (ligne claire), une ombre la longe, le coin plié fonce un peu.
    const lg = tr.long ?? 1; // 1 : environ 140 px depuis le coin ; plus long pour dépasser d'un coin photo
    const [ax, ay, bx2, by2, ox, oy] =
      tr.coin === 'hg' ? [R.range(110, 170) * lg, 0, 0, R.range(90, 140) * lg, -1, -1] :
      tr.coin === 'hd' ? [PW - R.range(110, 170) * lg, 0, PW, R.range(90, 140) * lg, 1, -1] :
      tr.coin === 'bg' ? [0, PH - R.range(90, 140) * lg, R.range(110, 170) * lg, PH, -1, 1] :
      [PW, PH - R.range(100, 150) * lg, PW - R.range(120, 180) * lg, PH, 1, 1];
    const pts = [0, 1, 2, 3, 4, 5].map((k) => {
      const t = k / 5;
      return [lerp(ax, bx2, t) + R.range(-1.5, 1.5), lerp(ay, by2, t) + R.range(-1.5, 1.5)];
    });
    const fin = courbe(pts, 16);
    trait(pliClair, PW, PH, fin, 1.2, 0.75);
    const ombre = new Float32Array(pn);
    trait(ombre, PW, PH, fin.map(([x, y]) => [x + ox * 1.4, y + oy * 1.4]), 1.6, 1);
    const flouOmbre = flou(ombre, PW, PH, 0.8);
    // côté du coin : produit vectoriel par rapport à la ligne du pli
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const i = y * PW + x;
      const cote = (bx2 - ax) * (y - ay) - (by2 - ay) * (x - ax);
      const versCoin = (bx2 - ax) * (oy * 1e4 - ay) - (by2 - ay) * (ox * 1e4 - ax);
      if (Math.sign(cote) === Math.sign(versCoin)) lum[i] *= 0.965;
      lum[i] *= 1 - 0.16 * flouOmbre[i];
    }
  } else if (tr.type === 'tache') {
    // Petite auréole de thé, surtout sur le bord blanc, près d'un coin.
    const [cx, cy] = tr.ou ? [tr.ou[0] * PW, tr.ou[1] * PH] : [tr.coin === 'hd' ? PW - R.range(30, 60) : R.range(30, 60), R.range(24, 44)];
    const rr = R.range(24, 32);
    const forme = gradientNoise(hash(`tache-forme:${id}`)), grain = champ(hash(`tache:${id}`), PW, PH, [40, 30], 2, 2);
    const a0 = R.range(0, Math.PI * 2);
    for (let y = Math.max(0, Math.floor(cy - rr * 1.5)); y < Math.min(PH, cy + rr * 1.5); y++) {
      for (let x = Math.max(0, Math.floor(cx - rr * 1.5)); x < Math.min(PW, cx + rr * 1.5); x++) {
        const i = y * PW + x;
        const ang = Math.atan2(y - cy, x - cx);
        // contour irrégulier (bruit sur l'angle), anneau interrompu par endroits, plus marqué d'un côté
        const deform = 1 + 0.16 * forme(Math.cos(ang) * 1.6 + 3.1, Math.sin(ang) * 1.6 + 7.3) + 0.05 * grain[i];
        const d = Math.hypot(x - cx, y - cy) / deform;
        const anneau = Math.exp(-(((d - rr) / (1.6 + 1.4 * (grain[i] + 0.5))) ** 2));
        const coupe = smoothstep(-0.25, 0.35, forme(Math.cos(ang) * 2.4 + 11, Math.sin(ang) * 2.4 + 5));
        const cote = 0.55 + 0.45 * Math.cos(ang - a0);
        const dedans = d < rr ? 0.1 * (1 - d / rr) + 0.06 : 0;
        teinte[i] = clamp(0.72 * anneau * coupe * cote + dedans) * (0.75 + 0.5 * (grain[i] + 0.5));
      }
    }
  }

  // 9. Composition RGBA : papier + photo, coins arrondis, ombre de contact
  const forme = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) forme[y * CW + x] = couverture(x - M, y - M);
  const o1 = flou(forme, CW, CH, 2.6), o2 = flou(forme, CW, CH, 9);
  const out = Buffer.alloc(CW * CH * 4);
  const ombreCol = hex('#2a1b10');
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const k = y * CW + x;
      const a = forme[k];
      const s1 = 0.3 * echant(o1, CW, CH, x - 1.4, y - 2.4), s2 = 0.12 * echant(o2, CW, CH, x - 3, y - 6);
      const sa = 1 - (1 - s1) * (1 - s2);
      let col = [0, 0, 0];
      if (a > 0) {
        const px = x - M, py = y - M;
        const i = clampI(py, PH) * PW + clampI(px, PW);
        const qx = px - bx, qy = py - by;
        const dansPhoto = qx >= 0 && qy >= 0 && qx < pw && qy < ph;
        if (dansPhoto) {
          const d = clamp(D[qy * pw + qx]);
          const l = Math.round(d * 1023) * 3;
          col = [LUT[l], LUT[l + 1], LUT[l + 2]];
          // bord de la photo : une demi-ligne fondue avec le papier (cadre de l'agrandisseur)
          const e = Math.min(qx, qy, pw - 1 - qx, ph - 1 - qy);
          if (e === 0) col = col.map((v, q) => lerp(v, blanc[q] * 0.97, 0.35));
        } else {
          const dBord = Math.min(px, py, PW - 1 - px, PH - 1 - py);
          const j = 0.6 * (1 - smoothstep(0, 34, dBord)) + 0.18 * (nappe[i] + 0.5);
          col = blanc.map((v, q) => lerp(v, jauni[q], clamp(j)));
        }
        // texture du papier, lumière rasante (haut gauche plus clair), usure des coins
        const nx = (px - PW / 2) / (PW / 2), ny = (py - PH / 2) / (PH / 2);
        let f = (1 + 0.011 * fibre[i] + 0.016 * nappe[i]) * (1 - 0.018 * (nx + ny)) * lum[i];
        const dc = Math.min(Math.hypot(px, py), Math.hypot(PW - px, py), Math.hypot(px, PH - py), Math.hypot(PW - px, PH - py));
        f *= 1 - 0.07 * (1 - smoothstep(0, 22, dc));
        col = col.map((v) => v * f);
        if (pliClair[i] > 0) col = col.map((v, q) => lerp(v, [0.96, 0.93, 0.86][q], pliClair[i]));
        if (teinte[i] > 0) col = col.map((v, q) => v * lerp(1, [0.9, 0.8, 0.64][q], teinte[i]));
      }
      const A = a + sa * (1 - a);
      const o = k * 4;
      if (A <= 0) continue;
      for (let q = 0; q < 3; q++) out[o + q] = Math.round(255 * clamp((col[q] * a + ombreCol[q] * sa * (1 - a)) / A));
      out[o + 3] = Math.round(255 * A);
    }
  }
  return out;
}

/** Zone du cadre vidéo 1280×720 montrée par la photo du tirage : [x, y, largeur, hauteur] en px. */
function cadreTirage(p) {
  const z = p.z ?? 1;
  const sw = T.pw / z, sh = T.ph / z;
  return [(V.w - sw) * p.x, (V.h - sh) * (p.y ?? 0.5), sw, sh];
}

/** Couverture (anticrénelée) du papier du tirage, coins arrondis de T.rayon. */
function couverture(px, py) {
  const { w: PW, h: PH, rayon: r } = T;
  const cx = px + 0.5, cy = py + 0.5;
  if (cx < -1 || cy < -1 || cx > PW + 1 || cy > PH + 1) return 0;
  let d = Math.min(cx, cy, PW - cx, PH - cy) + 0.5;
  const kx = cx < r ? r - cx : cx > PW - r ? cx - (PW - r) : 0;
  const ky = cy < r ? r - cy : cy > PH - r ? cy - (PH - r) : 0;
  if (kx > 0 && ky > 0) d = r - Math.hypot(kx, ky) + 0.5;
  return clamp(d);
}
function echant(a, W, H, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const g = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : a[j * W + i]);
  return lerp(lerp(g(x0, y0), g(x0 + 1, y0), tx), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), tx), ty);
}

// ---------------------------------------------------------------------------------------------
// Coins photo et scotch jauni (SVG cuit par Chromium)

const coinsTirage = () => {
  const { marge: M, w: PW, h: PH } = T;
  return { hg: [M, M, 0], hd: [M + PW, M, 90], bd: [M + PW, M + PH, 180], bg: [M, M + PH, 270] };
};

/** Document SVG des coins photo (noir ou kraft) ou des bandes de scotch, sur le cadre du tirage. */
function svgMaintien(id, mt) {
  const R = rng(hash(`maintien:${id}`));
  const { cw: CW, ch: CH } = T;
  let defs = '', corps = '';
  const seed = hash(id) % 997;
  if (mt.type === 'coins') {
    const noir = mt.papier === 'noir';
    const base = noir ? ['#110d0b', '#2b2420', '#1a1411'] : ['#a77c50', c('gc-kraft'), '#b98d5e'];
    defs +=
      `<linearGradient id="gc-photos-${id}-coin-lustre" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${base[0]}"/><stop offset=".55" stop-color="${base[2]}"/><stop offset=".78" stop-color="${base[1]}"/><stop offset="1" stop-color="${base[2]}"/></linearGradient>` +
      `<filter id="gc-photos-${id}-coin-ombre" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="2.1"/><feOffset dx="1.6" dy="2.6" result="o"/>` +
      `<feFlood flood-color="#1c120a" flood-opacity="${noir ? 0.5 : 0.42}"/><feComposite in2="o" operator="in"/></filter>` +
      `<filter id="gc-photos-${id}-coin-grain" filterUnits="userSpaceOnUse" x="-60" y="-60" width="260" height="260" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${noir ? '0.9' : '0.55 0.9'}" numOctaves="3" seed="${seed}" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${noir ? 1 : 0.3} 0 0 0 0 ${noir ? 1 : 0.2} 0 0 0 0 ${noir ? 1 : 0.1} ${noir ? 1.4 : 2.4} 0 0 0 ${noir ? -0.62 : -0.98}" result="g"/>` +
      (noir ? '' : `<feTurbulence type="fractalNoise" baseFrequency="0.04 0.6" numOctaves="2" seed="${seed + 3}" result="f"/><feColorMatrix in="f" type="matrix" values="0 0 0 0 .93 0 0 0 0 .8 0 0 0 0 .6 0 2.6 0 0 -1.45" result="fb"/><feMerge result="g2"><feMergeNode in="g"/><feMergeNode in="fb"/></feMerge>`) +
      `<feComposite in="${noir ? 'g' : 'g2'}" in2="SourceAlpha" operator="in"/></filter>` +
      `<filter id="gc-photos-${id}-coin-bord" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".45"/></filter>`;
    const coins = coinsTirage();
    let ombres = '', faces = '';
    for (const [nom, [cx, cy, rot]] of Object.entries(coins)) {
      const jeu = mt.jeu ?? 1;
      const decolle = mt.decolle === nom;
      const L = R.range(112, 124), e = R.range(3.5, 5.5);
      const a = rot + R.range(-1.2, 1.2) * jeu + (decolle ? R.range(4, 6) : 0);
      const [dx, dy] = [R.range(-1.4, 1.4) * jeu, R.range(-1.4, 1.4) * jeu];
      // Face avant : triangle (bords extérieurs pliés, hypoténuse libre ; kraft : bord cranté)
      let hyp;
      if (noir) {
        hyp = `L${f2(L)} ${f2(-e)} L${f2(-e)} ${f2(L)}`;
      } else {
        const N = 16, pts = [];
        for (let k = 0; k <= N; k++) {
          const t = k / N;
          const [x, y] = [lerp(L, -e, t), lerp(-e, L, t)];
          const cr = k % 2 ? 2.4 : 0; // crans en dents arrondies vers l'intérieur de la photo
          pts.push(`${f2(x + cr * 0.707)} ${f2(y + cr * 0.707)}`);
        }
        hyp = 'L' + pts.join(' L');
      }
      const tri = `M${f2(-e)} ${f2(-e)} ${hyp} Z`;
      const tr = `translate(${f2(cx + dx)} ${f2(cy + dy)}) rotate(${f2(a)})`;
      ombres += `<path transform="${tr}" d="${tri}" fill="#000"${decolle ? ' opacity="1"' : ''}/>`;
      faces +=
        `<g transform="${tr}">` +
        `<path d="${tri}" fill="url(#gc-photos-${id}-coin-lustre)"/>` +
        `<path d="${tri}" fill="#fff" filter="url(#gc-photos-${id}-coin-grain)" opacity="${noir ? 0.09 : 0.75}"/>` +
        // tranche du papier le long de l'hypoténuse (elle accroche la lumière), plis extérieurs plus sombres
        `<path d="M${f2(L - 1)} ${f2(-e + 1.2)} L${f2(-e + 1.2)} ${f2(L - 1)}" stroke="${noir ? '#6d625a' : '#e2c7a0'}" stroke-width="1.3" stroke-opacity="${noir ? 0.55 : 0.6}" fill="none" filter="url(#gc-photos-${id}-coin-bord)"/>` +
        `<path d="M${f2(-e + 0.6)} ${f2(L - 2)} L${f2(-e + 0.6)} ${f2(-e + 0.6)} L${f2(L - 2)} ${f2(-e + 0.6)}" stroke="${noir ? '#000' : '#7b5a37'}" stroke-width="1.1" stroke-opacity=".55" fill="none"/>` +
        (noir ? `<path d="M${f2(L * 0.62)} ${f2(-e + 3)} L${f2(-e + 3)} ${f2(L * 0.62)}" stroke="#fff" stroke-opacity=".05" stroke-width="5" filter="url(#gc-photos-${id}-coin-bord)"/>` : '') +
        `</g>`;
    }
    corps = `<g filter="url(#gc-photos-${id}-coin-ombre)">${ombres}</g>${faces}`;
  } else {
    // Scotch jauni : film translucide ambré, bords collants plus sales, plis fins, reflet, bouts déchirés.
    const coins = coinsTirage();
    const { marge: M, w: PW, h: PH } = T;
    const age = mt.age ?? 0.5;
    const film = [lerp(236, 214, age), lerp(214, 166, age), lerp(140, 66, age)].map(Math.round);
    mt.bandes.forEach((b, k) => {
      let cx, cy;
      if (b.coin) {
        const [x0, y0] = coins[b.coin];
        const sx = b.coin.includes('d') ? -1 : 1, sy = b.coin.includes('b') ? -1 : 1;
        cx = x0 + sx * b.rentre * 0.707;
        cy = y0 + sy * b.rentre * 0.707;
      } else {
        cx = M + PW * b.t;
        cy = b.bord === 'h' ? M + b.rentre : M + PH - b.rentre;
        if (b.bord === 'g' || b.bord === 'd') { cx = b.bord === 'g' ? M + b.rentre : M + PW - b.rentre; cy = M + PH * b.t; }
      }
      const L = b.long, W = b.large;
      const s = seed * 10 + k;
      // bouts : l'un coupé par la dent du dévidoir (cranté régulier), l'autre arraché à la main
      const gauche = tornEdge(-L / 2, W / 2, -L / 2, -W / 2, { seed: s, amp: 1.6, step: 3 }).map(([x, y], i) => [x + (i % 2 ? 1.4 : -1.4), y]);
      const droite = tornEdge(L / 2, -W / 2, L / 2 + R.range(-5, 5), W / 2, { seed: s + 5, amp: 3.4, step: 5 });
      const d = 'M' + [...gauche, ...droite].map(([x, y]) => `${f2(x)} ${f2(y)}`).join(' L') + ' Z';
      const fid = `gc-photos-${id}-scotch-${k}`;
      const flat = Math.sin(Math.PI / 4);
      defs +=
        `<clipPath id="${fid}-forme"><path d="${d}"/></clipPath>` +
        // plis : relief de bruit allongé dans le sens du ruban, éclairé en haut à gauche
        `<filter id="${fid}-plis" filterUnits="userSpaceOnUse" x="${-L}" y="${-W}" width="${2 * L}" height="${2 * W}" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves="2" seed="${s}" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0" result="h"/>` +
        `<feDiffuseLighting in="h" surfaceScale="1.8" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="45"/></feDiffuseLighting>` +
        `<feColorMatrix in="l" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.5 0 0 0 ${f5(-1.5 * flat)}" result="clair"/>` +
        `<feColorMatrix in="l" type="matrix" values="0 0 0 0 .42 0 0 0 0 .3 0 0 0 0 .12 -1.3 0 0 0 ${f5(1.3 * flat)}" result="fonce"/>` +
        `<feMerge><feMergeNode in="fonce"/><feMergeNode in="clair"/></feMerge></filter>` +
        // jaunissement inégal (colle qui a viré par plaques)
        `<filter id="${fid}-plaques" filterUnits="userSpaceOnUse" x="${-L}" y="${-W}" width="${2 * L}" height="${2 * W}" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.02 0.035" numOctaves="2" seed="${s + 11}" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${f5(film[0] / 255 - 0.12)} 0 0 0 0 ${f5(film[1] / 255 - 0.16)} 0 0 0 0 ${f5(film[2] / 255 - 0.14)} 1.3 0 0 0 -0.55"/></filter>` +
        `<filter id="${fid}-bulle" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
        `<filter id="${fid}-flou" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter>` +
        `<filter id="${fid}-ombre" x="-10%" y="-20%" width="120%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="1.1"/><feOffset dx=".8" dy="1.3" result="o"/><feFlood flood-color="#2a1b0e" flood-opacity=".16"/><feComposite in2="o" operator="in"/></filter>`;
      const big = `x="${-L}" y="${-W}" width="${2 * L}" height="${2 * W}"`;
      // bulles d'air : petites plages argentées
      let bulles = '';
      for (let q = 0, N = R.int(2, 4); q < N; q++) {
        bulles += `<ellipse cx="${f2(R.range(-L / 2.6, L / 2.6))}" cy="${f2(R.range(-W / 3, W / 3))}" rx="${f2(R.range(5, 12))}" ry="${f2(R.range(2.5, 5))}" fill="#fffdf6" opacity="${f2(R.range(0.12, 0.22))}" filter="url(#${fid}-bulle)"/>`;
      }
      corps +=
        `<g transform="translate(${f2(cx)} ${f2(cy)}) rotate(${f2(b.angle + R.range(-1.5, 1.5))})">` +
        `<path d="${d}" fill="#000" filter="url(#${fid}-ombre)"/>` +
        `<g clip-path="url(#${fid}-forme)">` +
        // film ambré translucide, plus jaune par plaques (la colle a viré)
        `<rect ${big} fill="rgb(${film.join(',')})" opacity="${f2(lerp(0.22, 0.34, age))}"/>` +
        `<rect ${big} fill="#fff" filter="url(#${fid}-plaques)" opacity="${f2(lerp(0.18, 0.4, age))}"/>` +
        `<rect ${big} fill="#fff" filter="url(#${fid}-plis)" opacity=".42"/>` +
        bulles +
        // bords collants : la poussière s'y est prise
        `<rect x="${-L}" y="${f2(-W / 2 - 0.6)}" width="${2 * L}" height="2" fill="rgb(${film.map((v) => Math.round(v * 0.55)).join(',')})" opacity=".3"/>` +
        `<rect x="${-L}" y="${f2(W / 2 - 1.4)}" width="${2 * L}" height="2" fill="rgb(${film.map((v) => Math.round(v * 0.55)).join(',')})" opacity=".3"/>` +
        // reflets du film (cellophane brillante)
        `<rect x="${-L}" y="${f2(-W * 0.22)}" width="${2 * L}" height="${f2(W * 0.1)}" fill="#fffdf6" opacity=".26" filter="url(#${fid}-flou)"/>` +
        `<rect x="${-L}" y="${f2(-W * 0.16)}" width="${2 * L}" height="1.4" fill="#fffdf6" opacity=".3"/>` +
        `<rect x="${-L}" y="${f2(W * 0.18)}" width="${2 * L}" height="${f2(W * 0.05)}" fill="#fffdf6" opacity=".1" filter="url(#${fid}-flou)"/>` +
        `</g>` +
        // bouts étirés : un liseré blanchi
        `<path d="M${gauche.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(' L')}" stroke="#fffaf0" stroke-opacity=".5" stroke-width="1.1" fill="none"/>` +
        `<path d="M${droite.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(' L')}" stroke="#fffaf0" stroke-opacity=".6" stroke-width="1.5" fill="none"/>` +
        `<path d="${d}" stroke="rgb(${film.map((v) => Math.round(v * 0.45)).join(',')})" stroke-opacity=".3" stroke-width=".7" fill="none"/>` +
        `</g>`;
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}"><defs>${defs}</defs>${corps}</svg>`;
}

/** Rend un SVG dans Chromium et renvoie un WebP (alpha conservé). */
async function rendreSvg(page, svg, W, H, qualite = 0.9) {
  const dataUrl = await page.evaluate(async ({ svg, W, H, qualite }) => {
    const img = new Image();
    img.decoding = 'sync';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(img, 0, 0, W, H);
    return cv.toDataURL('image/webp', qualite);
  }, { svg, W, H, qualite });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// ---------------------------------------------------------------------------------------------
// Contenu : src/content/videos.json

function entreeContenu(id, inv) {
  const clips = [...new Set(inv.segments.map((s) => s.clip))].map((k) => credits.clips[k]);
  const auteurs = [...new Set(clips.map((k) => k.auteur.nom))];
  const [sx, sy, sw, sh] = cadreTirage(inv.tirage);
  return {
    titre: inv.titre,
    duree: V.duree,
    video: `videos/${id}`,
    affiche: `videos/${id}-affiche`,
    tirage: `photos/${id}/tirage`,
    coins: `photos/${id}/coins`,
    angle: inv.angle,
    credit: { auteur: auteurs.join(', '), source: clips[0].page, licence: 'Licence Pexels (https://www.pexels.com/license/)' },
    sources: clips.map((k) => ({ auteur: k.auteur.nom, page: k.page })),
    maintien: inv.maintien.type === 'scotch' ? 'scotch' : `coins-${inv.maintien.papier}`,
    geometrie: {
      taille: [T.cw, T.ch],
      papier: [T.marge / T.cw, T.marge / T.ch, T.w / T.cw, T.h / T.ch].map(f5),
      photo: [(T.marge + T.bord.g) / T.cw, (T.marge + T.bord.h) / T.ch, T.pw / T.cw, T.ph / T.ch].map(f5),
      cadreVideo: [sx / V.w, sy / V.h, sw / V.w, sh / V.h].map(f5),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Planche de contrôle

async function planche(page, ids) {
  const b64 = (p) => readFileSync(p).toString('base64');
  const papier = `data:image/webp;base64,${b64(join(BAKED, 'paper/base.webp'))}`;
  const caveat = `data:font/woff2;base64,${b64(join(ROOT, 'design-system/fonts/caveat-latin-500-normal.woff2'))}`;
  const contenu = JSON.parse(readFileSync(CONTENU, 'utf8'));
  const Wp = 2800, Hp = 1330;
  const largeur = 530; // largeur affichée de l'image du tirage (cadre 1400 px)
  const places = [[30, 50], [575, 120], [1120, 40], [1665, 110], [2210, 55]];
  let html = `<!doctype html><html><head><style>
    @font-face { font-family: Caveat; src: url(${caveat}) format('woff2'); }
    body { margin: 0; width: ${Wp}px; height: ${Hp}px; background: #efe3c8 url(${papier}) 0 0 / 820px; position: relative; overflow: hidden; font-family: Caveat, cursive; color: #3a2216; }
    .voile { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, rgba(255,250,235,.25), rgba(120,80,40,.18)); }
    .photo { position: absolute; width: ${largeur}px; }
    .photo img { position: absolute; left: 0; top: 0; width: 100%; }
    .leg { position: absolute; font-size: 34px; transform: rotate(-1.5deg); }
    .bande { position: absolute; left: 0; right: 0; top: 820px; bottom: 0; background: #2b221c; }
    .clip { position: absolute; top: 870px; width: 520px; }
    .clip img { width: 520px; height: 292.5px; display: block; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
    .clip p { margin: 10px 0 0; color: #efe3c8; font: 15px/1.35 system-ui, sans-serif; }
    .clip b { font: 600 22px/1.2 Caveat, cursive; color: #f6ead0; }
    h1 { position: absolute; left: 40px; top: 1295px; margin: 0; color: #c9b893; font: 15px system-ui, sans-serif; font-weight: 400; }
  </style></head><body><div class="voile"></div>`;
  ids.forEach((id, k) => {
    const e = contenu[id];
    const [x, y] = places[k];
    const h = (largeur * T.ch) / T.cw;
    html += `<div class="photo" style="left:${x}px;top:${y}px;height:${h}px;transform:rotate(${e.angle}deg)">` +
      `<img src="data:image/webp;base64,${b64(join(BAKED, e.tirage + '.webp'))}">` +
      `<img src="data:image/webp;base64,${b64(join(BAKED, e.coins + '.webp'))}"></div>` +
      `<div class="leg" style="left:${x + 90}px;top:${y + h - 30}px">${e.titre}</div>`;
  });
  // photo soulevée : ce qui reste sur la page (coins ou scotch seuls)
  ids.filter((id) => ['lisa', 'bernard', 'rose'].includes(id)).forEach((id, k) => {
    const e = contenu[id];
    const x = 260 + k * 860, y = 545, l = 300, h = (l * T.ch) / T.cw;
    html += `<div class="photo" style="left:${x}px;top:${y}px;width:${l}px;height:${h}px;transform:rotate(${e.angle}deg)">` +
      `<img src="data:image/webp;base64,${b64(join(BAKED, e.coins + '.webp'))}"></div>` +
      `<div class="leg" style="left:${x + l + 10}px;top:${y + h / 2 - 20}px;font-size:26px">${id} : photo soulevée</div>`;
  });
  html += `<div class="bande"></div>`;
  ids.forEach((id, k) => {
    const e = contenu[id];
    const ko = statSync(join(BAKED, e.video + '.mp4')).size / 1e6;
    html += `<div class="clip" style="left:${40 + k * 548}px"><img src="data:image/webp;base64,${b64(join(BAKED, e.affiche + '.webp'))}">` +
      `<p><b>${id}</b> · ${e.duree} s · ${ko.toFixed(2)} Mo<br>${[...new Set(e.sources.map((s) => s.auteur))].join(' + ')} (Pexels)<br>${e.maintien}, angle ${e.angle}°</p></div>`;
  });
  html += `<h1>Planche lot V — tirages sépia posés sur papier (haut), 1re image couleur de chaque vidéo (bas). ${new Date().toISOString().slice(0, 10)}</h1></body></html>`;
  await page.setViewportSize({ width: Wp, height: Hp });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, 'planche.png') });
  // détail à 100 % : coin haut gauche de chaque tirage avec ses coins
  for (const id of ids) {
    const e = contenu[id];
    const html2 = `<!doctype html><body style="margin:0;width:900px;height:640px;background:#efe3c8 url(${papier}) 0 0/820px;position:relative">` +
      `<img style="position:absolute;left:-40px;top:-40px" src="data:image/webp;base64,${b64(join(BAKED, e.tirage + '.webp'))}">` +
      `<img style="position:absolute;left:-40px;top:-40px" src="data:image/webp;base64,${b64(join(BAKED, e.coins + '.webp'))}"></body>`;
    await page.setViewportSize({ width: 900, height: 640 });
    await page.setContent(html2, { waitUntil: 'load' });
    await page.screenshot({ path: join(OUT, `detail-${id}.png`) });
  }
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const ids = Object.keys(INVITES).filter((id) => !ONLY || ONLY.includes(id));
  let browser = null, page = null;
  const navigateur = async () => {
    if (!page) { browser = await launch(); page = await browser.newPage(); await page.setContent('<!doctype html><body style="margin:0"></body>'); }
    return page;
  };
  const contenu = existsSync(CONTENU) ? JSON.parse(readFileSync(CONTENU, 'utf8')) : {};
  const empreinteCode = {
    tirage: sha256([tirageSepia, couverture, flou, champ, trait, tampon, courbe, bruit, normaliser].map(String).join('\n')),
    coins: sha256(String(svgMaintien) + String(rendreSvg)),
  };
  try {
    if (!PLANCHE_SEULE) {
      for (const id of ids) {
        const inv = INVITES[id];
        const shas = Object.fromEntries(inv.segments.map((s) => [s.clip, credits.clips[s.clip].fichier.sha256]));
        const fVideo = join(BAKED, `videos/${id}.mp4`);
        const fAffiche = join(BAKED, `videos/${id}-affiche.webp`);
        const fTirage = join(BAKED, `photos/${id}/tirage.webp`);
        const fCoins = join(BAKED, `photos/${id}/coins.webp`);
        const c0 = cache[id] ?? {};
        const kVideo = empreinte({ v: 1, V, segments: inv.segments, couleur: inv.couleur, shas, ff: VERSION_FFMPEG, fp: String(filtrePlan) });
        const kImage = empreinte({ v: 1, V, T, s0: inv.segments[0], couleur: inv.couleur, tirage: inv.tirage, shas, ff: VERSION_FFMPEG, code: empreinteCode.tirage, fp: String(filtrePlan) });
        const kCoins = empreinte({ v: 1, T, maintien: inv.maintien, code: empreinteCode.coins });
        const fait = [];
        mkdirSync(dirname(fVideo), { recursive: true });
        mkdirSync(dirname(fTirage), { recursive: true });
        if (FORCE || c0.video !== kVideo || !existsSync(fVideo)) {
          const t0 = Date.now();
          const { crf, octets } = encoderVideo(id, inv, fVideo);
          fait.push(`vidéo ${(octets / 1e6).toFixed(2)} Mo (CRF ${crf}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
          c0.video = kVideo;
        }
        if (FORCE || c0.image !== kImage || !existsSync(fAffiche) || !existsSync(fTirage)) {
          const frame = premiereImage(inv);
          if (frame.length !== V.w * V.h * 3) throw new Error(`${id} : première image incomplète (${frame.length} octets)`);
          webp(frame, V.w, V.h, 'rgb24', fAffiche, 82);
          const t0 = Date.now();
          const rgba = tirageSepia(id, frame, inv.tirage);
          webp(rgba, T.cw, T.ch, 'rgba', fTirage, 86);
          fait.push(`affiche + tirage (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
          c0.image = kImage;
        }
        if (FORCE || c0.coins !== kCoins || !existsSync(fCoins)) {
          const p = await navigateur();
          writeFileSync(fCoins, await rendreSvg(p, svgMaintien(id, inv.maintien), T.cw, T.ch));
          fait.push(inv.maintien.type === 'scotch' ? 'scotch' : `coins ${inv.maintien.papier}`);
          c0.coins = kCoins;
        }
        cache[id] = c0;
        contenu[id] = entreeContenu(id, inv);
        const poids = [fVideo, fAffiche, fTirage, fCoins].map((f) => statSync(f).size);
        console.log(`${id.padEnd(8)} ${fait.length ? fait.join(' · ') : 'à jour'} — ${poids.map((o) => (o / 1024).toFixed(0) + ' Ko').join(' / ')}`);
      }
      // ordre stable : celui des invités
      const trie = Object.fromEntries(Object.keys(INVITES).filter((k) => contenu[k]).map((k) => [k, contenu[k]]));
      writeFileSync(CONTENU, JSON.stringify(trie, null, 2) + '\n');
      mkdirSync(OUT, { recursive: true });
      writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');
      const total = Object.keys(trie).flatMap((k) => [`${trie[k].video}.mp4`, `${trie[k].affiche}.webp`, `${trie[k].tirage}.webp`, `${trie[k].coins}.webp`])
        .reduce((s, f) => s + statSync(join(BAKED, f)).size, 0);
      console.log(`total produit : ${(total / 1048576).toFixed(2)} Mo · ${rel(CONTENU)}`);
    }
    if (PLANCHE || PLANCHE_SEULE) {
      await planche(await navigateur(), Object.keys(INVITES).filter((k) => existsSync(join(BAKED, `photos/${k}/tirage.webp`))));
      console.log(`planche : ${rel(join(OUT, 'planche.png'))}`);
    }
  } finally {
    if (browser) await browser.close();
  }
}

await main();
