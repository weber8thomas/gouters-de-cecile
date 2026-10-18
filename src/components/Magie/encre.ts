// L'encre magique : ornements qui s'écrivent seuls autour des titres de chapitre et dans les coins libres
// des pages, paraphe d'or sous un titre qu'on touche ou survole, pas du maraudeur qui se promènent dans
// les marges. Tout se construit en px de page (850 × 1200, comme la mise en page) depuis la carte cuite
// (scripts/bake-magie.py → carte.json) et le manifeste des pages (zones vivantes, croquis) ; la toile
// les pose sur la page à l'écran (u_page).

import carteJson from './carte.json';
import { TRAIT } from './gl';
import type { PageCuiteInfo } from '../PageCuite';

export type Rect = [number, number, number, number];
export interface TitreCarte { type: 'titre' | 'bandeau' | 'chapitre'; bloc: string; r: Rect; a: number; c?: [number, number, number] | null }
export interface CartePage { titres: TitreCarte[]; libre: string[]; plume: number[]; encre: [number, number, number] | null }
interface Carte { version: number; W: number; H: number; case: number; pages: Record<string, CartePage> }

export const CARTE = carteJson as unknown as Carte;
export const PAGE_W = CARTE.W;
export const PAGE_H = CARTE.H;

/** Un point de trait : position (px de page), instant d'écriture (0 à 1 de l'ornement), pression (0 à 1). */
export interface PointTrait { x: number; y: number; t: number; p: number }
export type Chemin = PointTrait[];

// ---- Le papier libre --------------------------------------------------------------------------------

export interface Grille { nx: number; ny: number; c: number; occ: Uint8Array }

/** Grille des cases occupées : l'encre (cuite) + les photos, aquarelles, croquis et feuillet (manifeste). */
export function grille(cp: CartePage, info: PageCuiteInfo | undefined): Grille {
  const c = CARTE.case;
  const nx = Math.ceil(PAGE_W / c);
  const ny = Math.ceil(PAGE_H / c);
  const occ = new Uint8Array(nx * ny);
  cp.libre.forEach((hex, j) => {
    const bits = parseInt(hex, 16);
    for (let i = 0; i < nx; i++) if (Math.floor(bits / 2 ** i) % 2) occ[j * nx + i] = 1;
  });
  const marquer = ([x, y, w, h]: number[]) => {
    const M = 15;
    const i0 = Math.max(0, Math.floor((x * PAGE_W - M) / c));
    const i1 = Math.min(nx - 1, Math.floor(((x + w) * PAGE_W + M) / c));
    const j0 = Math.max(0, Math.floor((y * PAGE_H - M) / c));
    const j1 = Math.min(ny - 1, Math.floor(((y + h) * PAGE_H + M) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) occ[j * nx + i] = 1;
  };
  Object.values(info?.vivants ?? {}).forEach((r) => r && marquer(r));
  info?.croquis?.forEach((k) => marquer(k.boite));
  return { nx, ny, c, occ };
}

/** Le rectangle (px de page) ne touche aucune case occupée, et reste dans la page. */
export function libre(g: Grille, [x0, y0, x1, y1]: Rect): boolean {
  if (x0 < 8 || y0 < 8 || x1 > PAGE_W - 8 || y1 > PAGE_H - 8) return false;
  for (let j = Math.floor(y0 / g.c); j <= Math.floor(y1 / g.c); j++) {
    for (let i = Math.floor(x0 / g.c); i <= Math.floor(x1 / g.c); i++) if (g.occ[j * g.nx + i]) return false;
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
    const L: number[] = [0];
    for (let i = 1; i < this.pts.length; i++) L.push(L[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y));
    const tot = L[L.length - 1] || 1;
    return this.pts.map((q, i) => {
      const u = L[i] / tot;
      const p = (0.3 + 0.7 * Math.min(1, u / 0.12)) * (1 - 0.6 * Math.max(0, (u - 0.7) / 0.3)) * appui;
      return { x: q.x, y: q.y, t: t0 + (t1 - t0) * u, p };
    });
  }
}

const miroirX = (c: Chemin, cx: number): Chemin => c.map((q) => ({ ...q, x: 2 * cx - q.x }));

/** Un petit point d'encre (goutte posée par la plume) : un trait minuscule. */
function goutte(x: number, y: number, t: number, r = 2.2): Chemin {
  return new Plume(x - r * 0.4, y, 0).arc(r * 2.6, Math.PI * 2, 0.6).chemin(t, t + 0.02, 1.1);
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
 * place est libre ; et un ou deux coins libres (de préférence les coins extérieurs, en haut d'abord).
 */
export function ornementsDe(id: string, cp: CartePage, g: Grille, cote: 'gauche' | 'droite'): Ornement[] {
  const out: Ornement[] = [];
  const encre = enRvb(cp.encre, ENCRE_REPLI);
  // frise : sous le dernier titre d'un chapitre ; sous le titre du sommaire, du titre, de l'album
  const chap = cp.titres.filter((t) => t.type === 'chapitre');
  const cible = chap.length ? chap : cp.titres.filter((t) => t.type === 'titre' && !/-/.test(t.bloc) && (t.r[2] - t.r[0]) > 150);
  if (cible.length && (chap.length || ['sommaire', 'titre', 'cecile-1-gauche', 'fin-gauche'].includes(id))) {
    const x0 = Math.min(...cible.map((t) => t.r[0]));
    const x1 = Math.max(...cible.map((t) => t.r[2]));
    const y0 = Math.min(...cible.map((t) => t.r[1]));
    const y1 = Math.max(...cible.map((t) => t.r[3]));
    const cx = (x0 + x1) / 2;
    const d = Math.min(175, Math.max(110, (x1 - x0) * 0.62));
    const essais: [number, number][] = [[y1 + 34, 1], [y1 + 52, 1], [y0 - 30, 1]];
    for (const [cy] of essais) {
      if (libre(g, [cx - d - 12, cy - 22, cx + d + 12, cy + 22])) {
        const coul = enRvb(cible[cible.length - 1].c, encre);
        out.push({ chemins: frise(cx, cy, d), duree: 2.6, couleur: coul, largeur: 3 });
        break;
      }
    }
  }
  // coins : extérieurs d'abord (gauche : x = 0 ; droite : x = W), le haut avant le bas
  const M = 34;
  const T = 120;
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
    const r: Rect = [Math.min(cx, cx + ex * T), Math.min(cy, cy + ey * T), Math.max(cx, cx + ex * T), Math.max(cy, cy + ey * T)];
    r[0] = Math.max(9, r[0]); r[1] = Math.max(9, r[1]); r[2] = Math.min(PAGE_W - 9, r[2]); r[3] = Math.min(PAGE_H - 9, r[3]);
    if (!libre(g, r)) continue;
    out.push({ chemins: coin(cx, cy, ex, ey, T), duree: 2.2, couleur: encre, largeur: 2.6 });
    n++;
  }
  return out;
}

/** Couleur d'encre d'un titre (repli : celle de la page). */
export const encreDe = (cp: CartePage, t?: TitreCarte): [number, number, number] => enRvb(t?.c ?? cp.encre, ENCRE_REPLI);

// ---- Le maraudeur ----------------------------------------------------------------------------------

export interface Pas { x: number; y: number; cap: number; gauche: boolean }

/**
 * Une promenade dans le papier libre : une marche au hasard de case libre en case libre (elle préfère
 * aller droit), lissée, puis des pas alternés tous les 24 px de page. null si la page n'a pas la place.
 */
export function promenade(g: Grille, alea: () => number = Math.random): Pas[] | null {
  const ok = (i: number, j: number) => i >= 0 && j >= 0 && i < g.nx && j < g.ny && !g.occ[j * g.nx + i];
  const libres: [number, number][] = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (ok(i, j)) libres.push([i, j]);
  if (libres.length < 6) return null;
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let meilleur: [number, number][] = [];
  for (let essai = 0; essai < 24 && meilleur.length < 7; essai++) {
    const [i0, j0] = libres[Math.floor(alea() * libres.length)];
    let d = Math.floor(alea() * 8);
    const vu = new Set<number>([j0 * g.nx + i0]);
    const ch: [number, number][] = [[i0, j0]];
    let [i, j] = [i0, j0];
    for (let k = 0; k < 10; k++) {
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
  if (meilleur.length < 4) return null;
  // centres des cases, lissés deux fois (Chaikin)
  let pts = meilleur.map(([i, j]) => ({ x: (i + 0.5) * g.c + (alea() - 0.5) * 14, y: (j + 0.5) * g.c + (alea() - 0.5) * 14 }));
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
  const out: Pas[] = [];
  const FOULEE = 24;
  let reste = 0;
  let gauche = alea() < 0.5;
  for (let q = 0; q < pts.length - 1; q++) {
    const a = pts[q];
    const b = pts[q + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const cap = Math.atan2(b.y - a.y, b.x - a.x);
    let s = reste;
    while (s < l) {
      const u = s / l;
      const nx = -Math.sin(cap);
      const ny = Math.cos(cap);
      const e = gauche ? -5.5 : 5.5;
      out.push({ x: a.x + (b.x - a.x) * u + nx * e, y: a.y + (b.y - a.y) * u + ny * e, cap: cap + (gauche ? -0.1 : 0.1), gauche });
      gauche = !gauche;
      s += FOULEE;
    }
    reste = s - l;
  }
  return out.length >= 5 ? out : null;
}
