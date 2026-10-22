// Géométrie de l'envol (FLIP) : pose de départ mesurée sur l'objet posé dans la page, pose d'arrivée
// centrée dans la zone sûre, et transformation intermédiaire pour une avancée p (0 = posé, 1 = soulevé).
// Tout est pur sauf mesurerPose / versLocal (lecture du DOM, jamais pendant le mouvement).
import { zoneSure, type Insets } from '../../lib/viewport';

/** Pose d'un objet : centre, taille (non tournée) et inclinaison (degrés). */
export interface Pose {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}

/** Part de la plus petite dimension utile occupée par l'objet soulevé. */
export const PART_CIBLE = 0.82;

const RAD = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lisse = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
};

/**
 * Pose à l'écran (px CSS de la fenêtre) d'un élément, rotation propre comprise : le centre de sa boîte
 * englobante est celui du rectangle tourné, sa taille vient de offsetWidth/Height mis à l'échelle de
 * l'écran (ancêtres compris). `angle` remplace l'inclinaison lue (sa propre rotation, en degrés).
 */
export function mesurerPose(el: HTMLElement, angle?: number): Pose {
  const r = el.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let reel = 0;
  let k0 = 1;
  const tr = typeof getComputedStyle !== 'undefined' ? getComputedStyle(el).transform : 'none';
  if (tr && tr !== 'none' && typeof DOMMatrixReadOnly !== 'undefined') {
    const m = new DOMMatrixReadOnly(tr);
    reel = Math.atan2(m.b, m.a) / RAD;
    k0 = Math.hypot(m.a, m.b) || 1;
  }
  const c = Math.abs(Math.cos(reel * RAD));
  const s = Math.abs(Math.sin(reel * RAD));
  const base = (w * c + h * s) * k0;
  const k = base > 0 ? r.width / base : 1;
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: w * k0 * k, h: h * k0 * k, angle: angle ?? reel };
}

/** Passe d'une pose en px de fenêtre aux px locaux d'un calque (qui peut être mis à l'échelle). */
export function versLocal(p: Pose, calque: HTMLElement): Pose {
  const r = calque.getBoundingClientRect();
  const k = calque.offsetWidth > 0 ? r.width / calque.offsetWidth : 1;
  const q = k > 0 ? k : 1;
  return { cx: (p.cx - r.left) / q, cy: (p.cy - r.top) / q, w: p.w / q, h: p.h / q, angle: p.angle };
}

/**
 * Pose d'arrivée : centrée dans la zone sûre, à la proportion de l'objet, au plus 82 % de la largeur
 * et de la hauteur utiles (la hauteur, sur un écran couché) ; sur un écran debout (téléphone), presque
 * toute la largeur. Droite (angle 0).
 */
export function poseCible(vp: { w: number; h: number; insets: Insets }, proportion: number): Pose {
  const z = zoneSure(vp);
  const debout = z.h > z.w;
  const gouttiere = Math.min(24, Math.max(10, z.w * 0.03));
  const maxW = debout ? z.w - 2 * gouttiere : z.w * PART_CIBLE;
  const maxH = z.h * PART_CIBLE;
  const a = proportion > 0 ? proportion : 1;
  let w = maxW;
  let h = w / a;
  if (h > maxH) {
    h = maxH;
    w = h * a;
  }
  return { cx: z.x + z.w / 2, cy: z.y + z.h / 2, w, h, angle: 0 };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Inclinaison maximale (degrés) du décollement du coin, atteinte en cours de vol (nulle posé et soulevé). */
export const DECOLLEMENT = 7;

/** Élévation du décollement pour l'avancée p : 0 posé, un sommet en cours de vol, 0 à plat face à l'écran. */
export const decollement = (p: number): number => Math.sin(Math.PI * clamp01(p));

/**
 * Transformation de l'objet soulevé (mis en page à sa pose d'arrivée T) pour l'avancée p : centre, taille et
 * inclinaison interpolés depuis la pose de départ S, tout droit (pas d'arc, p reste dans 0..1 : l'animation ne
 * rebondit pas). Un coin se décolle d'abord (le bas à droite se lève, la photo pivote autour de son coin haut gauche, en
 * perspective), puis la photo se pose à plat, face à l'écran : à p = 0 et à p = 1 il n'y a plus d'inclinaison.
 */
export function transformDe(S: Pose, T: Pose, p: number, decoller = true): string {
  const q = clamp01(p);
  const cx = S.cx + (T.cx - S.cx) * q;
  const cy = S.cy + (T.cy - S.cy) * q;
  const sx = (S.w + (T.w - S.w) * q) / (T.w || 1);
  const sy = (S.h + (T.h - S.h) * q) / (T.h || 1);
  const a = S.angle + (T.angle - S.angle) * q;
  const base = `translate3d(${r2(cx - T.cx)}px, ${r2(cy - T.cy)}px, 0) rotate(${r2(a * 100) / 100}deg) scale(${r4(sx)}, ${r4(sy)})`;
  const d = decollement(q);
  if (!decoller || d < 0.005) return base;
  // pivot : le coin haut gauche (repère de la carte à sa taille d'arrivée, centre = origine) ; axe : la diagonale qui
  // monte vers la droite, de sorte que le coin bas droit vienne vers le regard
  const px = -T.w / 2;
  const py = -T.h / 2;
  const persp = Math.round(Math.max(T.w, T.h) * 3.2);
  return `${base} translate(${r2(px)}px, ${r2(py)}px) perspective(${persp}px) rotate3d(1, -1, 0, ${r2(DECOLLEMENT * d)}deg) translate(${r2(-px)}px, ${r2(-py)}px)`;
}

/** Bouton « Fermer » : au-dessus du coin haut droit de l'objet, sinon à sa droite, sinon dedans. */
export function placeBouton(T: Pose, vp: { w: number; h: number; insets: Insets }, taille: number): { x: number; y: number } {
  const z = zoneSure(vp);
  const g = Math.max(6, taille * 0.18);
  const droite = T.cx + T.w / 2;
  const haut = T.cy - T.h / 2;
  if (haut - taille - g >= z.y + 4) return { x: Math.min(droite - taille, z.x + z.w - taille - 4), y: haut - taille - g };
  if (droite + g + taille <= z.x + z.w - 4) return { x: droite + g, y: Math.max(z.y + 4, haut) };
  return { x: droite - taille - g, y: haut + g };
}
