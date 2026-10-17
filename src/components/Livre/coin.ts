// Le coin qui suit le doigt (plan v4) : géométrie PURE du rabat plat « façon turn.js » (aucun React,
// aucun DOM), appelée à chaque image par les useTransform de <Coin>.
//
// Repère normalisé : la page qu'on plie, la reliure à gauche (x = 0), le bord libre à droite (x = W),
// y vers le bas. La page de droite y est telle quelle ; la page de gauche y est vue en miroir (Coin
// pose un scaleX(−1) fixe sur sa racine). A = l'angle saisi, (W, 0) en haut ou (W, H) en bas ; F = le
// doigt (l'endroit où l'angle replié se pose).
//   - le pli est la médiatrice de AF ; ce qui est du côté de A (le « dessous » découvert) est replié,
//     par symétrie, du côté de F (le « rabat ») ;
//   - anti-déchirure : |F − dos| ≤ W (dos = l'angle de la reliure du même bord que A) et
//     |F − dos opposé| ≤ √(W² + H²) ; F reste dans la page (on ne plie pas vers l'extérieur) ;
//   - plus le pli s'enfonce (profondeur λ = (W − Fx) / 2W), plus il se redresse : son angle tend vers 0
//     (pli vertical) entre λ = 0,15 et 0,3, pour passer la main sans à-coup au tourne-page 3D, dont la
//     feuille se courbe autour de droites verticales.
// Les transformations sont des matrices 2D CSS (a, b, c, d, e, f) : x' = a·x + c·y + e, y' = b·x + d·y + f.
import { angles, bordProjete, clamp, lisse } from './geometrie';

/** Zone d'angle qui saisit le coin : 14 % de la largeur × 14 % de la hauteur de la page. */
export const ZONE_COIN = 0.14;
/** Levée du coin au survol ou au doigt posé : 2,5 % de la largeur, vers l'intérieur. */
export const LEVEE_COIN = 0.025;
/** Profondeur à laquelle le tourne-page 3D prend le relais. */
export const RELAIS_COIN = 0.28;
/** Le pli se redresse (angle → 0) entre ces deux profondeurs. */
export const REDRESSE: readonly [number, number] = [0.15, 0.3];
/** Largeur des dégradés de pli et d'ombre, en fraction de la largeur de page. */
export const LARGEUR_PLI = 0.16;
export const LARGEUR_OMBRE = 0.12;

export type Mat = readonly [number, number, number, number, number, number];
export type Coin = 'haut' | 'bas';

const ID: Mat = [1, 0, 0, 1, 0, 0];
/** a ∘ b (b d'abord). */
export function compose(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
const T = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const R = (t: number): Mat => [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0];
/** Miroir x → W − x (une page vue de l'autre côté de la feuille). */
export const miroir = (W: number): Mat => [-1, 0, 0, 1, W, 0];
export const appliquer = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const n5 = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e5) / 1e5);
const n2 = (v: number) => Math.round(v * 100) / 100;
/** Chaîne CSS d'une matrice (les translations au centième de px suffisent). */
export const css = (m: Mat): string => `matrix(${n5(m[0])}, ${n5(m[1])}, ${n5(m[2])}, ${n5(m[3])}, ${n2(m[4])}, ${n2(m[5])})`;

/** Angle saisi, dans le repère normalisé. */
export const angleSaisi = (coin: Coin, W: number, H: number): [number, number] => [W, coin === 'haut' ? 0 : H];

/** Position levée (survol, doigt posé) : 2,5 % de W vers l'intérieur, un peu plus en largeur qu'en hauteur. */
export function leve(coin: Coin, W: number, H: number, k = 1): [number, number] {
  const [ax, ay] = angleSaisi(coin, W, H);
  return [ax - LEVEE_COIN * W * k, ay + (coin === 'haut' ? 1 : -1) * LEVEE_COIN * 0.8 * W * k];
}

/**
 * Contraint le doigt : dans la page (on ne plie ni vers l'extérieur ni au-delà du bord de l'angle
 * saisi), puis anti-déchirure (le bord de la feuille ne s'étire jamais au-delà de sa longueur).
 */
export function contraindre(coin: Coin, fx: number, fy: number, W: number, H: number): [number, number] {
  let x = Math.min(fx, W);
  let y = coin === 'haut' ? Math.max(fy, 0) : Math.min(fy, H);
  y = clamp(y, -H, 2 * H);
  const dos: [number, number] = [0, coin === 'haut' ? 0 : H];
  const oppose: [number, number] = [0, coin === 'haut' ? H : 0];
  const d1 = Math.hypot(x - dos[0], y - dos[1]);
  if (d1 > W) {
    x = dos[0] + ((x - dos[0]) * W) / d1;
    y = dos[1] + ((y - dos[1]) * W) / d1;
  }
  const diag = Math.hypot(W, H);
  const d2 = Math.hypot(x - oppose[0], y - oppose[1]);
  if (d2 > diag) {
    x = oppose[0] + ((x - oppose[0]) * diag) / d2;
    y = oppose[1] + ((y - oppose[1]) * diag) / d2;
  }
  return [x, y];
}

/** Profondeur du pli (0 : l'angle est en place ; 0,5 : le bord libre est sur la reliure). */
export const profondeur = (fx: number, W: number): number => clamp((W - fx) / (2 * W), 0, 1);

export interface Pli {
  /** Doigt contraint. */
  fx: number;
  fy: number;
  /** Angle replié (après redressement) : où se pose l'angle saisi. */
  ex: number;
  ey: number;
  lambda: number;
  /** Direction de A vers l'angle replié (radians) : la normale du pli. */
  theta: number;
  /** Milieu de la corde du pli dans la page (repère normalisé) et sa longueur (0 : pli hors page). */
  cx: number;
  cy: number;
  corde: number;
  /** Profondeur du rabat, perpendiculaire au pli : |A − angle replié| / 2. */
  demi: number;
}

/** Corde de la droite {X : (X − M)·u = 0} dans le rectangle [0, W] × [0, H] (Liang–Barsky). */
function corde(mx: number, my: number, ux: number, uy: number, W: number, H: number): { cx: number; cy: number; l: number } {
  const vx = -uy;
  const vy = ux;
  let t0 = -1e7;
  let t1 = 1e7;
  const borner = (p: number, q: number) => {
    // contrainte p·t ≤ q
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p > 0) t1 = Math.min(t1, r);
    else t0 = Math.max(t0, r);
    return true;
  };
  const ok = borner(-vx, mx) && borner(vx, W - mx) && borner(-vy, my) && borner(vy, H - my);
  if (!ok || t1 <= t0) return { cx: mx, cy: my, l: 0 };
  const tm = (t0 + t1) / 2;
  return { cx: mx + tm * vx, cy: my + tm * vy, l: t1 - t0 };
}

/** Le pli pour l'angle saisi `coin` et le doigt (fx, fy), page W × H. */
export function plier(coin: Coin, fx0: number, fy0: number, W: number, H: number): Pli {
  const [ax, ay] = angleSaisi(coin, W, H);
  const [fx, fy] = contraindre(coin, fx0, fy0, W, H);
  const lambda = profondeur(fx, W);
  // Redressement : l'angle replié remonte (ou descend) vers le bord de l'angle saisi.
  const k = 1 - lisse(REDRESSE[0], REDRESSE[1], lambda);
  let ex = fx;
  let ey = ay + (fy - ay) * k;
  // Jamais dégénéré (A = F n'a pas de pli) : un quart de pixel vers l'intérieur.
  if (Math.hypot(ex - ax, ey - ay) < 0.25) {
    ex = ax - 0.25;
    ey = ay + (coin === 'haut' ? 0.05 : -0.05);
  }
  const dx = ex - ax;
  const dy = ey - ay;
  const n = Math.hypot(dx, dy);
  const ux = dx / n;
  const uy = dy / n;
  const c = corde((ax + ex) / 2, (ay + ey) / 2, ux, uy, W, H);
  return { fx, fy, ex, ey, lambda, theta: Math.atan2(uy, ux), cx: c.cx, cy: c.cy, corde: c.l, demi: n / 2 };
}

/** Réflexion par rapport au pli (droite passant par (cx, cy), de normale θ). */
export function reflexion(p: Pick<Pli, 'theta' | 'cx' | 'cy'>): Mat {
  const c2 = Math.cos(2 * p.theta);
  const s2 = Math.sin(2 * p.theta);
  // X' = X − 2((X − C)·u)u  ⇔  matrice [[−cos2θ, −sin2θ], [−sin2θ, cos2θ]] autour de C
  const m: Mat = [-c2, -s2, -s2, c2, 0, 0];
  return compose(T(p.cx, p.cy), compose(m, T(-p.cx, -p.cy)));
}

/**
 * Taille d'un demi-plan : il couvre la page de part et d'autre du pli depuis n'importe quel point de la
 * corde (profondeur = diagonale, longueur = 2 diagonales) ; le plus petit possible (passe hors écran).
 */
export const tailleDemi = (W: number, H: number): { w: number; h: number } => {
  const d = Math.hypot(W, H);
  return { w: Math.ceil(1.04 * d), h: Math.ceil(2.08 * d) };
};

/**
 * Matrices d'un pli, pour un demi-plan D.w × D.h (origine de transformation 0 0) :
 *   - dessous : demi-plan du côté de A (bord droit du carré sur le pli, centré sur la corde) ;
 *   - rabat : demi-plan du côté de F (bord gauche du carré sur le pli) ;
 *   - contenu de chacun : la page (W × H, posée en 0 0 dans le carré) ramenée dans le repère de la page,
 *     au travers de la contre-rotation du carré. `contenuDessous` et `contenuRabat` donnent l'image d'un
 *     point du contenu dans le repère normalisé (miroir pour une page de gauche, réflexion pour le rabat).
 */
export function matrices(p: Pli, D: { w: number; h: number }, contenuDessous: Mat, contenuRabat: Mat): { dessous: Mat; rabat: Mat; pageDessous: Mat; pageRabat: Mat } {
  const rot = R(p.theta);
  const dessous = compose(T(p.cx, p.cy), compose(rot, T(-D.w, -D.h / 2)));
  const rabat = compose(T(p.cx, p.cy), compose(rot, T(0, -D.h / 2)));
  const inv = (box: Mat): Mat => {
    // inverse d'une isométrie directe (rotation + translation)
    const [a, b, c, d, e, f] = box;
    return [a, c, b, d, -(a * e + b * f), -(c * e + d * f)];
  };
  return {
    dessous,
    rabat,
    pageDessous: compose(inv(dessous), contenuDessous),
    pageRabat: compose(inv(rabat), compose(reflexion(p), contenuRabat)),
  };
}

/**
 * Bande du pli, DANS le contenu du rabat (repère de la page montrée au verso) : une bande de largeur 2g
 * et de longueur L, centrée sur le pli, son axe x selon la normale du pli (la moitié gauche est la face
 * visible du rabat ; la droite, de l'autre côté du pli, est coupée par le demi-plan). Rotation et
 * translation seulement : aucune mise à l'échelle (qui ferait repeindre le calque sous une découpe).
 * `contenuRabat` est la matrice de `contenus()` (identité ou miroir) : le pli y est son image.
 */
export function matricePli(p: Pick<Pli, 'theta' | 'cx' | 'cy'>, contenuRabat: Mat, g: number, L: number): Mat {
  const ux = Math.cos(p.theta);
  const uy = Math.sin(p.theta);
  // K (miroir ou identité) appliqué aux directions et au centre ; K = K⁻¹.
  const k = contenuRabat;
  const nx = k[0] * ux + k[2] * uy;
  const ny = k[1] * ux + k[3] * uy;
  const ax = k[0] * -uy + k[2] * ux;
  const ay = k[1] * -uy + k[3] * ux;
  const [cx, cy] = appliquer(k, p.cx, p.cy);
  // Point local (x, y) ↦ C + (x − g)·n + (y − L/2)·a
  return [nx, ny, ax, ay, cx - g * nx - (L / 2) * ax, cy - g * ny - (L / 2) * ay];
}

/** Contenus d'un côté : la page de droite se plie vers l'avant, celle de gauche (vue en miroir) vers l'arrière. */
export function contenus(cote: 'gauche' | 'droite', W: number): { dessous: Mat; rabat: Mat } {
  // Page de droite : le dessous (page suivante, de droite) tel quel ; le rabat montre le verso de la
  // feuille (page de gauche suivante), vu de dos : miroir. Page de gauche (repère en miroir) : l'inverse.
  return cote === 'droite' ? { dessous: ID, rabat: miroir(W) } : { dessous: miroir(W), rabat: ID };
}

/** Avancée p du tourne-page 3D dont le bord libre projeté est à e (fraction de W, + à droite). */
export function pDuBord(e: number, sens: 1 | -1): number {
  // bordProjete(angles(p)) décroît de 1 (p = 0) à −1 (p = 1) : dichotomie.
  let a = 0;
  let b = 1;
  const cible = clamp(e, -1, 1);
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (bordProjete(angles(m, sens)) > cible) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** Relais vers le tourne-page 3D : avancée p qui place le bord libre là où est l'angle replié. */
export function pRelais(p: Pick<Pli, 'ex'>, cote: 'gauche' | 'droite', W: number): number {
  const e = p.ex / W;
  return cote === 'droite' ? pDuBord(e, -1) : pDuBord(-e, 1);
}

/** Zone du pointeur sur une page (fractions de page, repère normalisé : 0 = reliure). */
export function zoneCoin(xn: number, yn: number, deborde = 0.04): Coin | null {
  if (xn < 1 - ZONE_COIN || xn > 1 + deborde) return null;
  if (yn >= -deborde && yn <= ZONE_COIN) return 'haut';
  if (yn >= 1 - ZONE_COIN && yn <= 1 + deborde) return 'bas';
  return null;
}
