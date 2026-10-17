// Gestes au pointeur (doigt, stylet, souris) : seuils, élasticité aux bornes, vitesse du lâcher.
// Fonctions pures, appelées dans les écouteurs pointermove / pointerup (aucun React).

/** Au-delà de ce déplacement (px d'écran), ce n'est plus un toucher mais un glisser. */
export const SEUIL_GLISSER = 8;
/** Dès ce déplacement horizontal, on monte le feuillet (avant que le glisser ne soit décidé). */
export const SEUIL_AMORCE = 4;
/** Un toucher dure moins que ça (ms) ; au-delà, c'est un appui long (ignoré). */
export const TOUCHER_MAX_MS = 600;
/** Part de p à franchir pour que la page tourne au lâcher (sans geste vif). */
export const SEUIL_P = 0.35;
/** Geste vif : vitesse (largeurs de page par seconde) au-delà de laquelle le sens du lâcher décide. */
export const VIF = 1;
/** Marge extérieure qui tourne la page quand on la touche (fraction de la largeur de page). */
export const MARGE_TOUCHER = 0.12;
/** Fenêtre de mesure de la vitesse au lâcher (ms). */
const FENETRE_MS = 90;

/** Résistance : au-delà de la borne, le déplacement est amorti (tanh, asymptote r). */
export const elastique = (v: number, r: number): number => r * Math.tanh(v / r);

/** p suivi au doigt : libre entre 0 et 1, amorti au-delà (le papier résiste, puis se soulève). */
export function pElastique(v: number, r = 0.12): number {
  if (v < 0) return -elastique(-v, r);
  if (v > 1) return 1 + elastique(v - 1, r);
  return v;
}

/** Valeur bornée entre a et b, amortie au-delà. */
export function entreElastique(v: number, a: number, b: number, r: number): number {
  if (v < a) return a - elastique(a - v, r);
  if (v > b) return b + elastique(v - b, r);
  return v;
}

export interface Echantillon {
  t: number;
  x: number;
}

/** Garde les échantillons récents (fenêtre de mesure de la vitesse). */
export function garder(pts: Echantillon[], t: number): void {
  while (pts.length > 2 && t - pts[0].t > FENETRE_MS * 2) pts.shift();
}

/**
 * Vitesse horizontale au lâcher (px/s, + vers la droite) : pente entre le premier échantillon de la
 * fenêtre et le dernier. Un doigt immobile avant le lâcher donne 0.
 */
export function vitesse(pts: Echantillon[], tFin: number): number {
  if (pts.length < 2) return 0;
  const der = pts[pts.length - 1];
  if (tFin - der.t > 60) return 0; // arrêté avant de lâcher
  let i = pts.length - 1;
  while (i > 0 && der.t - pts[i - 1].t <= FENETRE_MS) i--;
  const prem = pts[i === pts.length - 1 ? Math.max(0, i - 1) : i];
  const dt = der.t - prem.t;
  return dt > 4 ? ((der.x - prem.x) / dt) * 1000 : 0;
}
