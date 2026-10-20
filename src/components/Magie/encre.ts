// L'encre magique : ornements qui s'écrivent seuls autour des titres de chapitre et dans les coins libres
// des pages, paraphe d'or sous un titre qu'on touche ou survole, pas du maraudeur et petites pattes de
// Jack Russell qui se promènent dans les marges, et cachettes secrètes (lunettes et éclair, tasse magique,
// couronne 30 ans, baguette étoilée, mots doux cursifs). Tout se construit en px de page (850 × 1200,
// comme la mise en page) depuis la carte cuite (scripts/bake-magie.py → carte.json) et le manifeste des
// pages (zones vivantes, croquis, liens) ; la toile les pose sur la page à l'écran (u_page).

import carteJson from './carte.json';
import { TRAIT } from './gl';
import type { PageCuiteInfo } from '../PageCuite';
import type { RedessinCarte } from './redessins';

export type Rect = [number, number, number, number];
export interface TitreCarte { type: 'titre' | 'bandeau' | 'chapitre'; bloc: string; r: Rect; a: number; c?: [number, number, number] | null }
export interface CartePage { titres: TitreCarte[]; libre: string[]; plume: number[]; encre: [number, number, number] | null; redessins?: RedessinCarte[] }
interface Carte { version: number; W: number; H: number; case: number; pages: Record<string, CartePage> }

export const CARTE = carteJson as unknown as Carte;
export const PAGE_W = CARTE.W;
export const PAGE_H = CARTE.H;

// Réalignement du chemin de plume du sommaire (les lignes de table des matières vont jusqu'à y ≈ 876 px).
(() => {
  const som = CARTE.pages.sommaire;
  if (!som?.plume?.length) return;
  for (let i = 0; i < som.plume.length; i += 3) {
    const y = som.plume[i + 1];
    if (y >= 170 && y <= 560) {
      som.plume[i + 1] = Math.round(176 + ((y - 176) * (876 - 176)) / (543 - 176));
    }
  }
})();

/** Un point de trait : position (px de page), instant d'écriture (0 à 1 de l'ornement), pression (0 à 1). */
export interface PointTrait { x: number; y: number; t: number; p: number }
export type Chemin = PointTrait[];

// ---- Le papier libre --------------------------------------------------------------------------------

export interface Grille { nx: number; ny: number; c: number; occ: Uint8Array }

/** Grille des cases occupées : l'encre (cuite) + les photos, aquarelles, croquis, liens et titres. */
export function grille(cp: CartePage, info: PageCuiteInfo | undefined): Grille {
  const c = CARTE.case;
  const nx = Math.ceil(PAGE_W / c);
  const ny = Math.ceil(PAGE_H / c);
  const occ = new Uint8Array(nx * ny);
  cp.libre.forEach((hex, j) => {
    const bits = parseInt(hex, 16);
    for (let i = 0; i < nx; i++) if (Math.floor(bits / 2 ** i) % 2) occ[j * nx + i] = 1;
  });
  const marquer = ([x, y, w, h]: number[], M = 16) => {
    const i0 = Math.max(0, Math.floor((x * PAGE_W - M) / c));
    const i1 = Math.min(nx - 1, Math.floor(((x + w) * PAGE_W + M) / c));
    const j0 = Math.max(0, Math.floor((y * PAGE_H - M) / c));
    const j1 = Math.min(ny - 1, Math.floor(((y + h) * PAGE_H + M) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) occ[j * nx + i] = 1;
  };
  Object.values(info?.vivants ?? {}).forEach((r) => r && marquer(r));
  info?.croquis?.forEach((k) => marquer(k.boite));
  info?.liens?.forEach((l) => marquer(l.rect, 22));
  if (info?.liens?.length) {
    // Sur le sommaire, tout le bloc des lignes de table des matières (jusqu'à « Le mot de la fin ....... 24 »)
    // ainsi que la frise végétale cuite au bas de la page sont strictement réservés.
    marquer([0.09, 0.135, 0.85, 0.62], 16);
    marquer([0.14, 0.825, 0.72, 0.045], 14);
  }
  for (const t of cp.titres) {
    marquer([t.r[0] / PAGE_W, t.r[1] / PAGE_H, (t.r[2] - t.r[0]) / PAGE_W, (t.r[3] - t.r[1]) / PAGE_H], 10);
  }
  return { nx, ny, c, occ };
}

/** Copie d'une grille pour réserver localement des zones déjà prises (ornements de coin, cachettes). */
export function clonerGrille(g: Grille): Grille {
  return { nx: g.nx, ny: g.ny, c: g.c, occ: new Uint8Array(g.occ) };
}

export function occuperRect(g: Grille, [x0, y0, x1, y1]: Rect, M = 8): void {
  const i0 = Math.max(0, Math.floor((x0 - M) / g.c));
  const i1 = Math.min(g.nx - 1, Math.floor((x1 + M) / g.c));
  const j0 = Math.max(0, Math.floor((y0 - M) / g.c));
  const j1 = Math.min(g.ny - 1, Math.floor((y1 + M) / g.c));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g.occ[j * g.nx + i] = 1;
}

/** Le rectangle (px de page) ne touche aucune case occupée, et reste dans la page. */
export function libre(g: Grille, [x0, y0, x1, y1]: Rect): boolean {
  if (x0 < 8 || y0 < 8 || x1 > PAGE_W - 8 || y1 > PAGE_H - 8) return false;
  for (let j = Math.floor(y0 / g.c); j <= Math.floor(y1 / g.c); j++) {
    for (let i = Math.floor(x0 / g.c); i <= Math.floor(x1 / g.c); i++) if (g.occ[j * g.nx + i]) return false;
  }
  return true;
}

/** Boîte englobante exacte d'un ensemble de chemins (px de page). */
export function boiteChemins(chemins: Chemin[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of chemins) {
    for (const p of c) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }
  if (!Number.isFinite(x0)) return [0, 0, 0, 0];
  return [x0, y0, x1, y1];
}

/** Vérifie strictement que tous les points et la boîte englobante des chemins tombent dans des cases libres. */
export function cheminsLibres(g: Grille, chemins: Chemin[], marge = 8): boolean {
  const [x0, y0, x1, y1] = boiteChemins(chemins);
  if (!Number.isFinite(x0)) return false;
  if (!libre(g, [x0 - marge, y0 - marge, x1 + marge, y1 + marge])) return false;
  for (const c of chemins) {
    for (const p of c) {
      const i = Math.floor(p.x / g.c);
      const j = Math.floor(p.y / g.c);
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny || g.occ[j * g.nx + i]) return false;
    }
  }
  return true;
}

// ---- La plume ------------------------------------------------------------------------------------

/** Une plume « tortue » : avance, tourne, ondule, s'enroule en volute. */
class Plume {
  pts: { x: number; y: number }[] = [];
  constructor(public x: number, public y: number, public cap: number) {
    this.pts.push({ x, y });
  }

  pas(ds: number, dcap: number): this {
    this.cap += dcap;
    this.x += Math.cos(this.cap) * ds;
    this.y += Math.sin(this.cap) * ds;
    this.pts.push({ x: this.x, y: this.y });
    return this;
  }

  /** Avance de L en ondulant : le cap oscille de ±A (rad), f ondes sur la longueur. */
  onde(L: number, A: number, f: number, ds = 2): this {
    const n = Math.max(2, Math.ceil(L / ds));
    let avant = 0;
    for (let k = 1; k <= n; k++) {
      const v = A * Math.sin((2 * Math.PI * f * k) / n);
      this.pas(L / n, v - avant);
      avant = v;
    }
    return this;
  }

  /** Arc : tourne de `angle` (rad, signe = sens) sur la longueur L. */
  arc(L: number, angle: number, ds = 2): this {
    const n = Math.max(2, Math.ceil(L / ds));
    for (let k = 0; k < n; k++) this.pas(L / n, angle / n);
    return this;
  }

  /** Volute : s'enroule (sens ±1) en resserrant, de rayon R à 0,2 R, sur `tours` tours. */
  volute(R: number, tours: number, sens: number, ds = 1.5): this {
    const tot = tours * 2 * Math.PI;
    let a = 0;
    while (a < tot) {
      const r = R * (1 - (0.8 * a) / tot);
      const d = Math.min(0.5, ds / r);
      this.pas(ds, sens * d);
      a += d;
    }
    return this;
  }

  /** Le chemin, l'encre posée de t0 à t1 (à vitesse de plume constante), la pression qui s'effile aux bouts. */
  chemin(t0: number, t1: number, appui = 1): Chemin {
    return lisserTemps(this.pts, t0, t1, appui);
  }
}

function lisserTemps(pts: { x: number; y: number }[], t0: number, t1: number, appui = 1): Chemin {
  const L: number[] = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const tot = L[L.length - 1] || 1;
  return pts.map((q, i) => {
    const u = L[i] / tot;
    const p = (0.32 + 0.68 * Math.min(1, u / 0.12)) * (1 - 0.55 * Math.max(0, (u - 0.72) / 0.28)) * appui;
    return { x: q.x, y: q.y, t: t0 + (t1 - t0) * u, p };
  });
}

/** Courbe de Catmull-Rom lissée à partir de points de contrôle, tracée de t0 à t1. */
function courbe(ctrl: readonly (readonly [number, number])[], t0: number, t1: number, appui = 1, subdiv = 7): Chemin {
  if (ctrl.length < 2) return [];
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = i === ctrl.length - 2 ? subdiv : subdiv - 1;
    for (let s = 0; s <= n; s++) {
      const u = s / subdiv;
      const u2 = u * u;
      const u3 = u2 * u;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
      pts.push({ x, y });
    }
  }
  return lisserTemps(pts, t0, t1, appui);
}

/** Polyligne franche (angles vifs, ex. éclair ou couronne) redécoupée finement pour la plume. */
function brisee(ctrl: readonly (readonly [number, number])[], t0: number, t1: number, appui = 1.15): Chemin {
  if (ctrl.length < 2) return [];
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const a = ctrl[i];
    const b = ctrl[i + 1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(3, Math.ceil(d / 2));
    for (let s = 0; s < n || (i === ctrl.length - 2 && s <= n); s++) {
      const u = s / n;
      pts.push({ x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u });
    }
  }
  return lisserTemps(pts, t0, t1, appui);
}

const miroirX = (c: Chemin, cx: number): Chemin => c.map((q) => ({ ...q, x: 2 * cx - q.x }));

/** Un petit point d'encre (goutte posée par la plume) : un trait minuscule. */
function goutte(x: number, y: number, t: number, r = 2.2): Chemin {
  return new Plume(x - r * 0.4, y, 0).arc(r * 2.6, Math.PI * 2, 0.6).chemin(t, t + 0.02, 1.1);
}

/** Une petite étoile à 4 branches tracée à la plume autour de (cx, cy). */
function etoilePlume(cx: number, cy: number, r: number, t0: number, t1: number): Chemin[] {
  const tm = (t0 + t1) / 2;
  const v = brisee([[cx, cy - r], [cx, cy + r]], t0, tm, 1.05);
  const h = brisee([[cx - r * 0.85, cy], [cx + r * 0.85, cy]], tm, t1, 1.05);
  return [v, h];
}

// ---- Les ornements ---------------------------------------------------------------------------------

/**
 * Frise de chapitre, centrée en (cx, cy), de demi-largeur d : un losange, puis de chaque côté une onde
 * qui finit en volute, et une vrille qui naît sur sa crête. Les deux moitiés s'écrivent ensemble, du
 * centre vers les bouts.
 */
export function frise(cx: number, cy: number, d: number): Chemin[] {
  const k = d / 160;
  const centre = new Plume(cx, cy - 7 * k, Math.PI * 0.25)
    .pas(7 * k * Math.SQRT2, 0).pas(7 * k * Math.SQRT2, Math.PI / 2).pas(7 * k * Math.SQRT2, Math.PI / 2).pas(7 * k * Math.SQRT2, Math.PI / 2)
    .chemin(0, 0.14, 0.8);
  const droite = new Plume(cx + 11 * k, cy, 0).onde(d * 0.66, 0.2, 1.5).arc(16 * k, -0.9).volute(13 * k, 1.2, -1).chemin(0.12, 0.92);
  const vrille = new Plume(cx + d * 0.3, cy - 3 * k, -0.5).arc(14 * k, 0.6).volute(7 * k, 1, 1).chemin(0.5, 0.86, 0.75);
  return [centre, droite, miroirX(droite, cx), vrille, miroirX(vrille, cx), goutte(cx, cy, 0.03, 2.4 * k)];
}

/**
 * Ornement d'angle, au coin (cx, cy) de la page ; (ex, ey) : vers l'intérieur de la page (±1). Deux bras
 * le long des bords, finis en volutes tournées vers l'intérieur, et un bouton sur la diagonale.
 */
export function coin(cx: number, cy: number, ex: number, ey: number, taille: number): Chemin[] {
  const k = taille / 140;
  const capX = ex > 0 ? 0 : Math.PI;
  const capY = ey > 0 ? Math.PI / 2 : -Math.PI / 2;
  const sa = ex * ey;
  const brasA = new Plume(cx + ex * 4 * k, cy, capX).onde(taille * 0.62, 0.12, 1).arc(18 * k, sa * 1.1).volute(11 * k, 1.1, sa).chemin(0.08, 0.86);
  const brasB = new Plume(cx, cy + ey * 4 * k, capY).onde(taille * 0.62, 0.12, 1).arc(18 * k, -sa * 1.1).volute(11 * k, 1.1, -sa).chemin(0.08, 0.86);
  const diag = Math.atan2(ey, ex);
  const bouton = new Plume(cx + ex * 12 * k, cy + ey * 12 * k, diag).arc(30 * k, 0.5).volute(9 * k, 1.15, 1).chemin(0.4, 0.95, 0.8);
  return [brasA, brasB, bouton, goutte(cx, cy, 0, 2.6 * k)];
}

/** Paraphe d'or sous un titre (boîte r, pente a en degrés) : une boucle, un long trait ondulé, un envol. */
export function paraphe([x0, , x1, y1]: Rect, graine: number): Chemin[] {
  const h = (n: number) => {
    const s = Math.sin(graine * 12.9898 + n * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const L = Math.max(80, x1 - x0);
  const y = y1 + 9 + 5 * h(1);
  // la boucle part vers le haut à droite et se referme en repartant vers la droite, sous le titre
  const a0 = -Math.PI * (0.38 + 0.08 * h(2));
  const p = new Plume(x0 - 4, y - 2, a0)
    .arc(54, -(2 * Math.PI + a0) + (h(3) - 0.5) * 0.12)
    .onde(L * (0.9 + 0.12 * h(4)), 0.14 + 0.08 * h(5), 1 + Math.round(h(6)))
    .arc(14, -1.1)
    .volute(7 + 3 * h(7), 0.9, -1);
  return [p.chemin(0, 1, 1.15)];
}

// ---- Les cachettes et clins d'œil magiques (Harry Potter & 30 ans) --------------------------------

export type GenreSecret =
  | 'lunettes-eclair'
  | 'tasse-magique'
  | 'couronne-30'
  | 'baguette'
  | 'mischief'
  | 'lumos'
  | 'teatime'
  | 'trente-ans'
  | 'miam';

export const GENRES_SECRETS: readonly GenreSecret[] = [
  'tasse-magique',
  'couronne-30',
  'baguette',
  'mischief',
  'lumos',
  'teatime',
  'trente-ans',
  'miam',
];

export interface SecretMarge {
  genre: GenreSecret;
  x: number;
  y: number;
  r: Rect;
  chemins: Chemin[];
  duree: number;
  couleur: [number, number, number];
  largeur: number;
}

export interface Cachette {
  id: string;
  x: number;
  y: number;
  r: Rect;
  echelle: number;
  genre: GenreSecret;
}

/** 1. Lunettes rondes de sorcier et cicatrice en éclair (« lunettes-eclair »). */
function dessinLunettesEclair(cx: number, cy: number, k: number): Chemin[] {
  const cercle = (ox: number, oy: number, r: number, t0: number, t1: number): Chemin => {
    const pts: [number, number][] = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const a = -Math.PI * 0.25 + (i / N) * Math.PI * 2.05;
      pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
    return courbe(pts, t0, t1, 1.05, 5);
  };
  const g = cercle(cx - 19 * k, cy + 6 * k, 12.5 * k, 0, 0.27);
  const d = cercle(cx + 19 * k, cy + 6 * k, 12.5 * k, 0.28, 0.55);
  const pont = courbe([
    [cx - 6.5 * k, cy + 4 * k],
    [cx, cy - 1 * k],
    [cx + 6.5 * k, cy + 4 * k],
  ], 0.56, 0.64, 1);
  const brG = courbe([
    [cx - 31.5 * k, cy + 4 * k],
    [cx - 38 * k, cy - 1 * k],
    [cx - 40 * k, cy + 2 * k],
  ], 0.65, 0.71, 0.9);
  const brD = courbe([
    [cx + 31.5 * k, cy + 4 * k],
    [cx + 38 * k, cy - 1 * k],
    [cx + 40 * k, cy + 2 * k],
  ], 0.71, 0.77, 0.9);
  const eclair = brisee([
    [cx + 4.5 * k, cy - 23 * k],
    [cx - 4.5 * k, cy - 12.5 * k],
    [cx + 3 * k, cy - 12.5 * k],
    [cx - 5.5 * k, cy - 1.5 * k],
  ], 0.78, 0.94, 1.3);
  return [g, d, pont, brG, brD, eclair, ...etoilePlume(cx + 15 * k, cy - 16 * k, 4.2 * k, 0.94, 1.0)];
}

/** 2. Tasse de thé enchantée qui flotte avec une volute de vapeur en cœur (« tasse-magique »). */
function dessinTasseMagique(cx: number, cy: number, k: number): Chemin[] {
  const soucoupe = courbe([
    [cx - 24 * k, cy + 19 * k],
    [cx - 10 * k, cy + 24 * k],
    [cx + 10 * k, cy + 24 * k],
    [cx + 24 * k, cy + 19 * k],
  ], 0, 0.16, 1.05);
  const bol = courbe([
    [cx - 18 * k, cy + 3 * k],
    [cx - 15 * k, cy + 16 * k],
    [cx, cy + 21 * k],
    [cx + 15 * k, cy + 16 * k],
    [cx + 18 * k, cy + 3 * k],
  ], 0.17, 0.38, 1.1);
  const bord = courbe([
    [cx - 18 * k, cy + 3 * k],
    [cx, cy - 1 * k],
    [cx + 18 * k, cy + 3 * k],
    [cx, cy + 6.5 * k],
    [cx - 18 * k, cy + 3 * k],
  ], 0.39, 0.54, 0.95);
  const anse = courbe([
    [cx + 18 * k, cy + 5 * k],
    [cx + 27 * k, cy + 6 * k],
    [cx + 26 * k, cy + 14 * k],
    [cx + 15 * k, cy + 15 * k],
  ], 0.55, 0.66, 1.0);
  const vapeurCoeur = courbe([
    [cx - 1 * k, cy - 3 * k],
    [cx + 3 * k, cy - 8 * k],
    [cx, cy - 12 * k],
    [cx - 9.5 * k, cy - 18 * k],
    [cx - 5 * k, cy - 24 * k],
    [cx, cy - 19 * k],
    [cx + 5 * k, cy - 24 * k],
    [cx + 9.5 * k, cy - 18 * k],
    [cx, cy - 12 * k],
    [cx - 2 * k, cy - 26 * k],
  ], 0.67, 1.0, 0.95);
  return [soucoupe, bol, bord, anse, vapeurCoeur];
}

/** 3. Couronne d'anniversaire et chiffre « 30 » (« couronne-30 »). */
function dessinCouronne30(cx: number, cy: number, k: number): Chemin[] {
  const couronne = brisee([
    [cx - 22 * k, cy - 4 * k],
    [cx - 26 * k, cy - 20 * k],
    [cx - 11 * k, cy - 10 * k],
    [cx, cy - 24 * k],
    [cx + 11 * k, cy - 10 * k],
    [cx + 26 * k, cy - 20 * k],
    [cx + 22 * k, cy - 4 * k],
    [cx - 22 * k, cy - 4 * k],
  ], 0, 0.44, 1.1);
  const p1 = goutte(cx - 26 * k, cy - 22 * k, 0.45, 2 * k);
  const p2 = goutte(cx, cy - 26 * k, 0.47, 2.3 * k);
  const p3 = goutte(cx + 26 * k, cy - 22 * k, 0.49, 2 * k);
  const trois = courbe([
    [cx - 17 * k, cy + 2 * k],
    [cx - 9 * k, cy - 1 * k],
    [cx - 5 * k, cy + 4 * k],
    [cx - 12 * k, cy + 9 * k],
    [cx - 4 * k, cy + 15 * k],
    [cx - 10 * k, cy + 20 * k],
    [cx - 18 * k, cy + 17 * k],
  ], 0.52, 0.74, 1.2);
  const zero = courbe([
    [cx + 10 * k, cy + 0 * k],
    [cx + 4 * k, cy + 5 * k],
    [cx + 4 * k, cy + 15 * k],
    [cx + 10 * k, cy + 20 * k],
    [cx + 16 * k, cy + 15 * k],
    [cx + 16 * k, cy + 5 * k],
    [cx + 10 * k, cy + 0 * k],
  ], 0.75, 0.92, 1.2);
  const onde = courbe([
    [cx - 22 * k, cy + 24 * k],
    [cx, cy + 21.5 * k],
    [cx + 22 * k, cy + 24 * k],
  ], 0.93, 1.0, 0.9);
  return [couronne, p1, p2, p3, trois, zero, onde];
}

/** 4. Baguette magique lançant une spirale d'étoiles (« baguette »). */
function dessinBaguette(cx: number, cy: number, k: number): Chemin[] {
  const bois = brisee([
    [cx - 34 * k, cy + 21 * k],
    [cx + 3 * k, cy - 4 * k],
  ], 0, 0.24, 1.3);
  const garde = courbe([
    [cx - 26 * k, cy + 12 * k],
    [cx - 22 * k, cy + 18 * k],
  ], 0.25, 0.31, 1.15);
  const spirale = new Plume(cx + 3 * k, cy - 4 * k, -0.55)
    .arc(22 * k, -1.2)
    .volute(16 * k, 1.35, -1)
    .chemin(0.32, 0.74, 0.95);
  return [
    bois,
    garde,
    spirale,
    ...etoilePlume(cx + 20 * k, cy - 17 * k, 5 * k, 0.75, 0.83),
    ...etoilePlume(cx - 6 * k, cy - 18 * k, 4.4 * k, 0.83, 0.91),
    ...etoilePlume(cx + 29 * k, cy + 6 * k, 4.8 * k, 0.91, 1.0),
  ];
}

// Glyphes cursifs normalisés (x ∈ [0, w], y ∈ [-0.85, 1.65], ligne de base y = 1, hauteur d'x y = 0).
interface GlypheCursif {
  w: number;
  continu?: boolean;
  pts: readonly (readonly [number, number])[];
  extra?: readonly (readonly (readonly [number, number])[])[];
  point?: readonly [number, number];
}

const GLYPHES: Record<string, GlypheCursif> = {
  M: { w: 1.35, pts: [[0.04, 0.95], [0.22, -0.78], [0.64, 0.58], [1.04, -0.78], [1.18, 0.95], [1.35, 0.65]] },
  L: { w: 0.96, pts: [[0.16, -0.58], [0.46, -0.82], [0.24, 0.95], [0.06, 0.78], [0.36, 0.74], [0.76, 0.98], [0.96, 0.65]] },
  T: { w: 0.92, pts: [[0.46, -0.74], [0.36, 0.95], [0.16, 0.82]], extra: [[[0.04, -0.68], [0.46, -0.82], [0.9, -0.7]]] },
  '3': { w: 0.88, pts: [[0.12, -0.52], [0.5, -0.78], [0.76, -0.38], [0.34, 0.06], [0.8, 0.46], [0.48, 0.98], [0.1, 0.76]] },
  '0': { w: 0.88, pts: [[0.46, -0.76], [0.12, -0.2], [0.14, 0.78], [0.48, 0.98], [0.78, 0.74], [0.78, -0.24], [0.46, -0.76]] },
  '!': { w: 0.42, pts: [[0.26, -0.78], [0.18, 0.54]], point: [0.16, 0.95] },
  a: { w: 0.84, continu: true, pts: [[0, 0.65], [0.52, 0.06], [0.14, 0.16], [0.1, 0.86], [0.46, 0.98], [0.66, 0.18], [0.68, 0.94], [0.84, 0.65]] },
  c: { w: 0.68, continu: true, pts: [[0, 0.65], [0.48, 0.06], [0.14, 0.2], [0.12, 0.86], [0.44, 0.98], [0.68, 0.65]] },
  d: { w: 0.88, continu: true, pts: [[0, 0.65], [0.52, 0.06], [0.14, 0.2], [0.12, 0.86], [0.48, 0.98], [0.68, 0.18], [0.72, -0.82], [0.68, 0.94], [0.88, 0.65]] },
  e: { w: 0.7, continu: true, pts: [[0, 0.65], [0.56, 0.34], [0.44, 0.04], [0.14, 0.26], [0.14, 0.88], [0.46, 0.98], [0.7, 0.65]] },
  f: { w: 0.72, continu: true, pts: [[0, 0.65], [0.46, -0.18], [0.54, -0.82], [0.3, -0.72], [0.34, 1.52], [0.5, 1.38], [0.34, 0.68], [0.72, 0.65]] },
  g: { w: 0.84, continu: true, pts: [[0, 0.65], [0.52, 0.06], [0.14, 0.2], [0.12, 0.86], [0.46, 0.98], [0.66, 0.16], [0.64, 1.56], [0.28, 1.64], [0.24, 1.2], [0.84, 0.65]] },
  h: { w: 0.86, continu: true, pts: [[0, 0.65], [0.34, -0.18], [0.42, -0.82], [0.22, -0.68], [0.22, 0.98], [0.34, 0.16], [0.64, 0.1], [0.68, 0.94], [0.86, 0.65]] },
  i: { w: 0.5, continu: true, pts: [[0, 0.65], [0.25, 0.06], [0.25, 0.94], [0.5, 0.65]], point: [0.28, -0.32] },
  m: { w: 1.22, continu: true, pts: [[0, 0.65], [0.18, 0.08], [0.22, 0.96], [0.32, 0.12], [0.54, 0.1], [0.58, 0.96], [0.7, 0.12], [0.94, 0.1], [0.98, 0.94], [1.22, 0.65]] },
  n: { w: 0.88, continu: true, pts: [[0, 0.65], [0.2, 0.08], [0.24, 0.96], [0.38, 0.12], [0.64, 0.1], [0.68, 0.94], [0.88, 0.65]] },
  o: { w: 0.76, continu: true, pts: [[0, 0.65], [0.38, 0.06], [0.12, 0.36], [0.18, 0.92], [0.54, 0.94], [0.6, 0.24], [0.38, 0.08], [0.76, 0.36]] },
  s: { w: 0.7, continu: true, pts: [[0, 0.65], [0.36, 0.06], [0.6, 0.46], [0.54, 0.94], [0.18, 0.94], [0.44, 0.78], [0.7, 0.65]] },
  t: { w: 0.58, continu: true, pts: [[0, 0.65], [0.28, -0.72], [0.28, 0.94], [0.58, 0.65]], extra: [[[0.06, -0.24], [0.52, -0.28]]] },
  u: { w: 0.84, continu: true, pts: [[0, 0.65], [0.2, 0.08], [0.22, 0.92], [0.48, 0.96], [0.64, 0.08], [0.68, 0.94], [0.84, 0.65]] },
};

/** Trace une ligne de texte cursif centrée en (cx, cy) avec hauteur d'x `h`, entre les instants `t0` et `t1`. */
function tracerLigneCursive(texte: string, cx: number, cy: number, h: number, t0: number, t1: number): Chemin[] {
  let larg = 0;
  for (const ch of texte) larg += ch === ' ' ? 0.46 : (GLYPHES[ch]?.w ?? 0.6);
  const xStart = cx - (larg * h) / 2;
  const yBase = cy - h * 0.35;
  const ital = -0.16;
  const tr = (lx: number, ly: number): [number, number] => [xStart + (lx + (1 - ly) * ital) * h, yBase + ly * h];

  const blocs: { pts: [number, number][]; poids: number }[] = [];
  const Decors: { type: 'barre' | 'point'; pts: [number, number][] }[] = [];
  let xCur = 0;
  let courant: [number, number][] = [];

  const vider = () => {
    if (courant.length >= 2) blocs.push({ pts: courant, poids: Math.max(1, courant.length) });
    courant = [];
  };

  for (const ch of texte) {
    if (ch === ' ') {
      vider();
      xCur += 0.46;
      continue;
    }
    const g = GLYPHES[ch];
    if (!g) {
      xCur += 0.5;
      continue;
    }
    if (!g.continu) vider();
    for (let i = 0; i < g.pts.length; i++) {
      if (i === 0 && courant.length > 0 && g.continu) continue;
      courant.push(tr(xCur + g.pts[i][0], g.pts[i][1]));
    }
    if (g.extra) {
      for (const ex of g.extra) Decors.push({ type: 'barre', pts: ex.map(([px, py]) => tr(xCur + px, py)) });
    }
    if (g.point) {
      Decors.push({ type: 'point', pts: [tr(xCur + g.point[0], g.point[1])] });
    }
    xCur += g.w;
  }
  vider();

  const poidsTot = blocs.reduce((s, b) => s + b.poids, 0) + Decors.length * 1.5 || 1;
  const chemins: Chemin[] = [];
  let t = t0;
  for (const b of blocs) {
    const dt = ((t1 - t0) * b.poids) / poidsTot;
    chemins.push(courbe(b.pts, t, t + dt, 1.05, 5));
    t += dt;
  }
  for (const d of Decors) {
    const dt = ((t1 - t0) * 1.5) / poidsTot;
    if (d.type === 'point') chemins.push(goutte(d.pts[0][0], d.pts[0][1], t, Math.max(1.4, h * 0.14)));
    else chemins.push(courbe(d.pts, t, t + dt, 0.95, 4));
    t += dt;
  }
  return chemins;
}

/** 5. Mots doux et clins d'œil cursifs tracés trait par trait dans la marge. */
function dessinMotCursif(genre: GenreSecret, cx: number, cy: number, k: number): Chemin[] {
  if (genre === 'mischief') {
    const l1 = tracerLigneCursive('Mischief', cx, cy - 10 * k, 11 * k, 0, 0.44);
    const l2 = tracerLigneCursive('Managed', cx, cy + 8 * k, 11 * k, 0.45, 0.88);
    const para = courbe([
      [cx - 32 * k, cy + 20 * k],
      [cx, cy + 17 * k],
      [cx + 32 * k, cy + 20 * k],
      [cx + 22 * k, cy + 24 * k],
    ], 0.89, 1.0, 0.9);
    return [...l1, ...l2, para];
  }
  const texte =
    genre === 'lumos' ? 'Lumos !' :
    genre === 'teatime' ? 'Tea time!' :
    genre === 'trente-ans' ? '30 ans !' :
    'Miam !';
  const h = genre === 'teatime' ? 12.5 * k : 14 * k;
  const l = tracerLigneCursive(texte, cx, cy - 2 * k, h, 0, 0.84);
  const para = courbe([
    [cx - 28 * k, cy + 14 * k],
    [cx, cy + 11.5 * k],
    [cx + 28 * k, cy + 14 * k],
    [cx + 18 * k, cy + 18 * k],
  ], 0.85, 0.96, 0.9);
  const et = genre === 'lumos' ? etoilePlume(cx + 34 * k, cy - 12 * k, 4.8 * k, 0.94, 1.0) : [goutte(cx, cy + 17 * k, 0.97, 1.8 * k)];
  return [...l, para, ...et];
}

/** Construit un dessin ou message secret centré en (cx, cy) à l'échelle `echelle`. */
export function secretDe(genre: GenreSecret, cx: number, cy: number, echelle: number, cp: CartePage): SecretMarge {
  const k = echelle;
  const chemins =
    genre === 'lunettes-eclair' ? dessinLunettesEclair(cx, cy, k) :
    genre === 'tasse-magique' ? dessinTasseMagique(cx, cy, k) :
    genre === 'couronne-30' ? dessinCouronne30(cx, cy, k) :
    genre === 'baguette' ? dessinBaguette(cx, cy, k) :
    dessinMotCursif(genre, cx, cy, k);
  const r = boiteChemins(chemins);
  return {
    genre,
    x: cx,
    y: cy,
    r,
    chemins,
    duree: genre === 'mischief' ? 2.5 : 2.1,
    couleur: encreDe(cp),
    largeur: Math.max(2.1, 2.75 * Math.pow(k, 0.45)),
  };
}

function hachagePage(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/**
 * Place 2 à 3 cachettes secrètes par page ouverte dans les marges et coins libres de `carte.json`,
 * en vérifiant strictement qu'aucun trait ne déborde sur une case occupée ni sur un ornement existant.
 */
export function cachettesDe(id: string, cp: CartePage, g: Grille, cote: 'gauche' | 'droite', ornements: Ornement[]): Cachette[] {
  const gLibre = clonerGrille(g);
  for (const o of ornements) occuperRect(gLibre, boiteChemins(o.chemins), 12);

  const extX = cote === 'gauche' ? 68 : PAGE_W - 68;
  const intX = cote === 'gauche' ? PAGE_W - 72 : 72;
  const candidats: [number, number][] = [
    [extX, 30],
    [PAGE_W * 0.5, 28],
    [intX, 30],
    [extX, PAGE_H - 32],
    [PAGE_W * 0.46, PAGE_H - 30],
    [intX, PAGE_H - 32],
    [extX, PAGE_H * 0.28],
    [extX, PAGE_H * 0.52],
    [extX, PAGE_H * 0.74],
    [intX, PAGE_H * 0.35],
    [intX, PAGE_H * 0.68],
    [PAGE_W * 0.28, 30],
    [PAGE_W * 0.72, 30],
    [PAGE_W * 0.28, PAGE_H - 30],
    [PAGE_W * 0.68, PAGE_H - 30],
  ];
  // Ajoute aussi les centres des blocs de 2×2 cases libres dans la grille
  for (let j = 0; j < gLibre.ny - 1; j += 2) {
    for (let i = 0; i < gLibre.nx - 1; i += 2) {
      const cx = (i + 1) * gLibre.c;
      const cy = (j + 1) * gLibre.c;
      if (libre(gLibre, [cx - 48, cy - 32, cx + 48, cy + 32])) candidats.push([cx, cy]);
    }
  }

  const graine = hachagePage(id);
  const out: Cachette[] = [];
  const echelles = [0.95, 0.78, 0.56];

  for (let cIdx = 0; cIdx < candidats.length && out.length < 3; cIdx++) {
    const [cx, cy] = candidats[(cIdx + (graine % 5)) % candidats.length];
    if (out.some(( exist ) => Math.hypot(exist.x - cx, exist.y - cy) < 175)) continue;
    const genre = GENRES_SECRETS[(graine + out.length * 2) % GENRES_SECRETS.length];
    for (const ec of echelles) {
      const sec = secretDe(genre, cx, cy, ec, cp);
      if (cheminsLibres(gLibre, sec.chemins, 5)) {
        out.push({ id: `${id}-cachette-${out.length}`, x: cx, y: cy, r: sec.r, echelle: ec, genre });
        occuperRect(gLibre, sec.r, 14);
        break;
      }
    }
  }
  return out;
}

/**
 * Trouve l'emplacement libre le plus proche d'un clic/toucher `(px, py)` (marge, coin, folio, en-tête)
 * et construit le dessin ou mot cursif secret sans jamais mordre sur le texte.
 */
export function secretSousPoint(
  cp: CartePage,
  g: Grille,
  px: number,
  py: number,
  genre: GenreSecret,
  ornements: Ornement[] = [],
): SecretMarge | null {
  const gLibre = clonerGrille(g);
  for (const o of ornements) occuperRect(gLibre, boiteChemins(o.chemins), 8);

  const rayons = [0, 18, 36, 56, 80, 110, 150, 200];
  const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4];
  const echelles = [0.92, 0.74, 0.55];

  for (const ec of echelles) {
    for (const r of rayons) {
      for (const a of angles) {
        const cx = Math.max(38, Math.min(PAGE_W - 38, px + Math.cos(a) * r));
        const cy = Math.max(24, Math.min(PAGE_H - 24, py + Math.sin(a) * r));
        const sec = secretDe(genre, cx, cy, ec, cp);
        if (cheminsLibres(gLibre, sec.chemins, 4)) return sec;
        if (r === 0) break;
      }
    }
  }
  return null;
}

/** Triangule des chemins en sommets de trait (gl.ts : TRAIT), plume large inclinée. */
export function trianguler(chemins: Chemin[], largeur: number): Float32Array {
  const PLUME = -0.62;
  let n = 0;
  for (const c of chemins) n += Math.max(0, c.length - 1);
  const out = new Float32Array(n * 6 * TRAIT);
  let o = 0;
  const v = (x: number, y: number, tr: number, t: number, w: number) => {
    out[o++] = x; out[o++] = y; out[o++] = tr; out[o++] = t; out[o++] = w;
  };
  for (const c of chemins) {
    if (c.length < 2) continue;
    const L: number[][] = [];
    const R: number[][] = [];
    const W: number[] = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[Math.max(0, i - 1)];
      const b = c[Math.min(c.length - 1, i + 1)];
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const cap = Math.atan2(ty, tx);
      const w = largeur * (0.25 + 0.75 * Math.abs(Math.sin(cap - PLUME))) * c[i].p;
      W.push(Math.max(0.45, w));
      L.push([c[i].x - ty * W[i], c[i].y + tx * W[i]]);
      R.push([c[i].x + ty * W[i], c[i].y - tx * W[i]]);
    }
    for (let i = 0; i < c.length - 1; i++) {
      const t0 = c[i].t;
      const t1 = c[i + 1].t;
      v(L[i][0], L[i][1], 1, t0, W[i]); v(R[i][0], R[i][1], -1, t0, W[i]); v(L[i + 1][0], L[i + 1][1], 1, t1, W[i + 1]);
      v(R[i][0], R[i][1], -1, t0, W[i]); v(R[i + 1][0], R[i + 1][1], -1, t1, W[i + 1]); v(L[i + 1][0], L[i + 1][1], 1, t1, W[i + 1]);
    }
  }
  return out;
}

/** Position de la plume à l'instant t (0 à 1) sur des chemins (la plus avancée) : la pointe d'or. */
export function pointes(chemins: Chemin[], t: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const c of chemins) {
    if (c.length < 2 || t < c[0].t || t > c[c.length - 1].t) continue;
    let i = 1;
    while (i < c.length - 1 && c[i].t < t) i++;
    const a = c[i - 1];
    const b = c[i];
    const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out;
}

// ---- Ce qui s'écrit sur une page -------------------------------------------------------------------

export interface Ornement {
  chemins: Chemin[];
  /** Durée du tracé (s). */
  duree: number;
  couleur: [number, number, number];
  largeur: number;
}

const enRvb = (c: [number, number, number] | null | undefined, repli: [number, number, number]): [number, number, number] =>
  c ? [c[0] / 255, c[1] / 255, c[2] / 255] : repli;
export const ENCRE_REPLI: [number, number, number] = [0.1, 0.08, 0.2];

/**
 * Les ornements d'une page : la frise sous (ou sur) le titre d'un chapitre ou d'une page de titre, si la
 * place est strictement libre ; et un ou deux coins libres (de préférence les coins extérieurs, en haut d'abord).
 * Sur `#sommaire`, le soulignement et la frise du bas sont déjà cuits dans l'encre de la page : on ne rajoute
 * jamais de frise horizontale qui risquerait de croiser la table des matières.
 */
export function ornementsDe(id: string, cp: CartePage, g: Grille, cote: 'gauche' | 'droite'): Ornement[] {
  const out: Ornement[] = [];
  const encre = enRvb(cp.encre, ENCRE_REPLI);
  // frise : sous le dernier titre d'un chapitre ; sous le titre de la page de titre, de l'album ou de la fin
  const chap = cp.titres.filter((t) => t.type === 'chapitre');
  const cible = chap.length ? chap : cp.titres.filter((t) => t.type === 'titre' && !/-/.test(t.bloc) && (t.r[2] - t.r[0]) > 150);
  if (id !== 'sommaire' && cible.length && (chap.length || ['titre', 'cecile-1-gauche', 'fin-gauche'].includes(id))) {
    const x0 = Math.min(...cible.map((t) => t.r[0]));
    const x1 = Math.max(...cible.map((t) => t.r[2]));
    const y0 = Math.min(...cible.map((t) => t.r[1]));
    const y1 = Math.max(...cible.map((t) => t.r[3]));
    const cx = (x0 + x1) / 2;
    const d = Math.min(175, Math.max(110, (x1 - x0) * 0.62));
    const essais: [number, number][] = [[y1 + 36, 1], [y1 + 54, 1], [y0 - 32, 1]];
    for (const [cy] of essais) {
      const ch = frise(cx, cy, d);
      if (libre(g, [cx - d - 14, cy - 24, cx + d + 14, cy + 24]) && cheminsLibres(g, ch, 6)) {
        const coul = enRvb(cible[cible.length - 1].c, encre);
        out.push({ chemins: ch, duree: 2.4, couleur: coul, largeur: 3.2 });
        break;
      }
    }
  }
  // coins : extérieurs d'abord (gauche : x = 0 ; droite : x = W), le haut avant le bas
  const M = 28;
  const tailles = [120, 92, 68];
  const ext = cote === 'gauche' ? 1 : -1;
  const coins: [number, number, number, number][] = [
    [cote === 'gauche' ? M : PAGE_W - M, M, ext, 1],
    [cote === 'gauche' ? M : PAGE_W - M, PAGE_H - M, ext, -1],
    [cote === 'gauche' ? PAGE_W - M : M, M, -ext, 1],
    [cote === 'gauche' ? PAGE_W - M : M, PAGE_H - M, -ext, -1],
  ];
  let n = 0;
  for (const [cx, cy, ex, ey] of coins) {
    if (n >= 2) break;
    for (const T of tailles) {
      const ch = coin(cx, cy, ex, ey, T);
      if (!cheminsLibres(g, ch, 4)) continue;
      out.push({ chemins: ch, duree: 2.0, couleur: encre, largeur: 2.9 });
      n++;
      break;
    }
  }
  return out;
}

/** Couleur d'encre d'un titre (repli : celle de la page). */
export const encreDe = (cp: CartePage, t?: TitreCarte): [number, number, number] => enRvb(t?.c ?? cp.encre, ENCRE_REPLI);

// ---- Le maraudeur & les petites pattes de Jack Russell ---------------------------------------------

export interface Pas {
  x: number;
  y: number;
  cap: number;
  gauche: boolean;
  /** Vrai : empreinte de patte de petit chien (coussinet + 4 doigts) ; faux : pas de chaussure. */
  patte?: boolean;
  /** Décalage temporel (s) depuis le début de la promenade. */
  dt?: number;
}

/**
 * Une promenade dans le papier libre : marche de case libre en case libre (en partant éventuellement
 * près de la position demandée), lissée, avec une seule piste de chaussures humaines.
 * Les empreintes se réservent mutuellement une marge ; le chien reste hors du papier.
 */
export function promenade(
  g: Grille,
  alea: () => number = Math.random,
  depart?: { x: number; y: number; pattesSeules?: boolean },
): Pas[] | null {
  const ok = (i: number, j: number) => i >= 0 && j >= 0 && i < g.nx && j < g.ny && !g.occ[j * g.nx + i];
  const libres: [number, number][] = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (ok(i, j)) libres.push([i, j]);
  if (libres.length < 3) return null;
  if (depart) {
    libres.sort((a, b) =>
      Math.hypot((a[0] + 0.5) * g.c - depart.x, (a[1] + 0.5) * g.c - depart.y) -
      Math.hypot((b[0] + 0.5) * g.c - depart.x, (b[1] + 0.5) * g.c - depart.y),
    );
  }
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let meilleur: [number, number][] = [];
  for (let essai = 0; essai < 28 && meilleur.length < 8; essai++) {
    const idx = depart ? Math.min(libres.length - 1, Math.floor(alea() * Math.min(5, libres.length))) : Math.floor(alea() * libres.length);
    const [i0, j0] = libres[idx];
    let d = Math.floor(alea() * 8);
    const vu = new Set<number>([j0 * g.nx + i0]);
    const ch: [number, number][] = [[i0, j0]];
    let [i, j] = [i0, j0];
    for (let k = 0; k < 11; k++) {
      const choix = [0, 0, 0, 1, -1, 1, -1, 2, -2].map((t) => (d + t + 8) % 8);
      let suivi = false;
      for (let c = 0; c < choix.length; c++) {
        const dd = alea() < 0.75 ? choix[c] : choix[Math.floor(alea() * choix.length)];
        const [di, dj] = DIRS[dd];
        const ni = i + di;
        const nj = j + dj;
        if (ok(ni, nj) && !vu.has(nj * g.nx + ni) && (di === 0 || dj === 0 || (ok(i + di, j) && ok(i, j + dj)))) {
          i = ni; j = nj; d = dd; vu.add(nj * g.nx + ni); ch.push([i, j]); suivi = true;
          break;
        }
      }
      if (!suivi) break;
    }
    if (ch.length > meilleur.length) meilleur = ch;
  }
  if (meilleur.length < 3) return null;
  // centres des cases, lissés deux fois (Chaikin)
  let pts = meilleur.map(([i, j]) => ({ x: (i + 0.5) * g.c + (alea() - 0.5) * 12, y: (j + 0.5) * g.c + (alea() - 0.5) * 12 }));
  for (let k = 0; k < 2; k++) {
    const n: { x: number; y: number }[] = [pts[0]];
    for (let q = 0; q < pts.length - 1; q++) {
      const a = pts[q];
      const b = pts[q + 1];
      n.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    n.push(pts[pts.length - 1]);
    pts = n;
  }

  // Une seule écriture de piste : des chaussures humaines, espacées. Le compagnon reste sur la table.
  const out: Pas[] = [];
  const FOULEE = 58;
  let reste = 0;
  let gauche = alea() < .5;
  for (let q = 0; q < pts.length - 1; q++) {
    const a = pts[q], b = pts[q+1];
    const l = Math.hypot(b.x-a.x, b.y-a.y), cap = Math.atan2(b.y-a.y,b.x-a.x);
    let s = reste;
    while (s < l) {
      const u = s/l, ecart = gauche ? -12 : 12;
      const x = a.x+(b.x-a.x)*u-Math.sin(cap)*ecart;
      const y = a.y+(b.y-a.y)*u+Math.cos(cap)*ecart;
      if (libre(g,[x-10,y-10,x+10,y+10]) && out.every(p=>Math.hypot(p.x-x,p.y-y)>34)) {
        out.push({x,y,cap:cap+(gauche?-.06:.06),gauche,patte:false,dt:out.length*.52});
      }
      gauche=!gauche; s+=FOULEE;
    }
    reste=s-l;
  }

  out.sort((a, b) => (a.dt ?? 0) - (b.dt ?? 0));
  return out.length >= 3 ? out : null;
}
