// Géométrie du tourne-page : fonctions pures (aucun React, aucun DOM), appelées à chaque image
// par les useTransform du feuillet et des ombres portées. Tout dérive d'un seul nombre p :
//   p = 0 → le feuillet est à plat sur la page de droite ; p = 1 → à plat sur la page de gauche.

/** Bornes des 3 segments emboîtés du feuillet, en fraction de la largeur de page (depuis la reliure). */
export const BORNES = [0, 0.2, 0.55, 1] as const;
/** Largeur relative de chaque segment. */
export const LARGEURS = [0.2, 0.35, 0.45] as const;
/** Flexion maximale du papier (degrés), atteinte à mi-geste. */
export const KAPPA = 28;
/**
 * Part de la flexion portée par chaque segment (angle absolu = base + poids × flexion).
 * Le segment collé à la reliure est un peu en retard, l'extérieur est en avance : la feuille
 * s'enroule comme un papier épais tiré par son bord, sans jamais se casser.
 */
const POIDS = [-0.2, 0.3, 1] as const;

/** Direction de la lumière (fenêtre en haut à gauche, un peu en avant), dans le plan x/z. */
const LX = -0.6;
const LZ = 0.8;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const RAD = Math.PI / 180;

/**
 * Angles absolus (degrés, rotateY autour de la reliure) des 3 segments pour une avancée p.
 * sens = −1 quand on avance (le bord extérieur mène vers la gauche), +1 quand on recule.
 * Le dépassement du ressort (p un peu au-delà de 0 ou 1) soulève légèrement le bord : la feuille
 * se pose sur un coussin d'air au lieu de traverser la page.
 */
export function angles(p: number, sens: 1 | -1): [number, number, number] {
  const base = -180 * clamp(p, 0, 1);
  const flex = sens * KAPPA * Math.sin(Math.PI * p);
  return [
    clamp(base + POIDS[0] * flex, -180, 0),
    clamp(base + POIDS[1] * flex, -180, 0),
    clamp(base + POIDS[2] * flex, -180, 0),
  ];
}

/** Angle de la couverture (carton rigide : aucune flexion). */
export const angleCouverture = (p: number): number => -180 * clamp(p, 0, 1);

/** Éclairement relatif (Lambert) du recto pour un angle a : 1 = page à plat. */
export const eclairementRecto = (a: number): number => (LX * Math.sin(a * RAD) + LZ * Math.cos(a * RAD)) / LZ;
/** Éclairement relatif du verso (normale opposée). */
export const eclairementVerso = (a: number): number => -eclairementRecto(a);

/** Voiles d’ombrage : au plus 30 % de blanc porcelaine sur un recto, 38 % d’ombre chaude sur un verso
 *  (la perspective douce aplatit la courbure : l’ombrage porte le relief). */
export const LUMIERE_MAX = 0.3;
export const OMBRE_MAX = 0.38;

/**
 * Opacité plancher des voiles et des ombres : à 0, le navigateur ne rastérise pas un calque, qui
 * le serait alors au premier instant du geste. À 0,002, il est prêt d'avance et reste invisible.
 */
export const PLANCHER = 0.002;
/** Opacité d'une face qui tourne le dos : le plancher (à 0, ses tuiles ne seraient pas prêtes). */
export const CACHEE = PLANCHER;
/** Voile d'une face : ombrage × visibilité, jamais sous le plancher. */
export const voile = (ombrage: number, visibilite: number): number => Math.max(PLANCHER, ombrage * visibilite);
const plancher = (v: number) => (v < PLANCHER ? PLANCHER : v);

/**
 * Visibilité d'une face selon l'angle de son segment. On n'utilise pas backface-visibility : une
 * face cachée n'est pas rastérisée par le navigateur, elle le serait en plein geste au passage des
 * 90°. Ici les deux faces restent « visibles » (plancher 0,002, imperceptible) et prêtes d'avance.
 */
export const rectoVisible = (a: number): number => (a > -90 ? 1 : CACHEE);
export const versoVisible = (a: number): number => (a > -90 ? CACHEE : 1);

/** Opacité du voile clair d'un recto : la face qui se tourne vers la fenêtre s'éclaire. */
export const lumiereRecto = (a: number): number => plancher(LUMIERE_MAX * clamp((eclairementRecto(a) - 1) / 0.25, 0, 1));
/** Opacité du voile sombre d'un verso : la face qui tourne le dos à la fenêtre s'assombrit. */
export const ombreVerso = (a: number): number => plancher(OMBRE_MAX * Math.pow(clamp(1 - Math.max(0, eclairementVerso(a)), 0, 1), 1.2));

/**
 * Angles aux 4 jointures du feuillet (reliure, 20 %, 55 %, bord libre) : la normale d'une jointure
 * est la bissectrice des deux segments voisins. Chaque face reçoit deux voiles en dégradé dont les
 * opacités valent l'ombrage de ses deux jointures : l'ombrage est continu, sans facettes.
 */
export const jointures = (a: readonly number[]): [number, number, number, number] => [a[0], (a[0] + a[1]) / 2, (a[1] + a[2]) / 2, a[2]];

/** Perspective du tourne-page, en largeurs de page (≈ 8 500 px au cran moyen) : à mi-geste, le
 *  bord libre ne grandit que de 11 % (10 / 9). Même valeur que --gc-livre-perspective. */
export const PERSPECTIVE = 10;
/** Perspective de la couverture (carton rigide), plus plate : même valeur que
 *  --gc-livre-perspective-couverture. */
export const PERSPECTIVE_COUVERTURE = 20;
/** Épaisseur du carton et débords de la couverture (px) : mêmes valeurs que Livre.css. */
export const CARTON = { epaisseur: 10, out: 18, haut: 6, bas: 16 };

/**
 * Recul de caméra pendant l'ouverture : quand la couverture se dresse vers la caméra, la perspective
 * l'agrandit ; on recule juste assez pour que le carton ne dépasse jamais sa taille au repos, ni le
 * bord de l'écran (demi-hauteur de scène). W, H : taille de page (px) du cran ; zoom : zoom fin.
 */
export function reculCouverture(p: number, W: number, H: number, zoom: number, demiScene = 540): number {
  if (!(W > 0 && H > 0)) return 1;
  const t = clamp(p, 0, 1);
  const z = (W + CARTON.out) * Math.sin(Math.PI * t) + CARTON.epaisseur * (1 - t); // hauteur du bord libre
  const k = PERSPECTIVE_COUVERTURE / (PERSPECTIVE_COUVERTURE - z / W); // grossissement apparent du bord
  const d = (H / 2 + CARTON.bas) * zoom; // demi-hauteur au repos, depuis le point de fuite
  const plafond = Math.max(d, demiScene - 2);
  return Math.min(1, plafond / (d * k));
}
/** Décalage de l'ombre portée par unité de hauteur (fenêtre haute, à gauche). */
const PORTEE = 0.4;

/** Projection du bord libre du feuillet sur le plan des pages (fraction de largeur, + = vers la droite). */
export function bordProjete(a: readonly number[]): number {
  return LARGEURS[0] * Math.cos(a[0] * RAD) + LARGEURS[1] * Math.cos(a[1] * RAD) + LARGEURS[2] * Math.cos(a[2] * RAD);
}

/** Hauteur du bord libre au-dessus des pages (fraction de largeur, ≥ 0). */
export function hauteurBord(a: readonly number[]): number {
  return LARGEURS[0] * Math.sin(-a[0] * RAD) + LARGEURS[1] * Math.sin(-a[1] * RAD) + LARGEURS[2] * Math.sin(-a[2] * RAD);
}

/** Abscisse apparente (perspective, point de fuite sur la reliure) d'un point de hauteur h. */
export const projete = (x: number, h: number, K = PERSPECTIVE): number => (x * K) / (K - Math.min(h, K - 0.5));

/**
 * Ombre portée sur la page de droite : elle naît sous le bord apparent du feuillet ; plus le bord
 * est haut, plus la lumière rasante la pousse vers la droite. Fraction de largeur (translation
 * seule : une échelle changerait la zone de découpe du calque et forcerait une repeinture).
 */
export function porteeDroite(a: readonly number[], K = PERSPECTIVE): number {
  const x = bordProjete(a);
  const h = hauteurBord(a);
  return Math.max(projete(x, h, K), x + PORTEE * h - 0.35);
}

/** Pénombre sur la page de gauche que le feuillet va recouvrir : elle borde son bord apparent. */
export function porteeGauche(a: readonly number[], K = PERSPECTIVE): number {
  const x = bordProjete(a);
  const h = hauteurBord(a);
  return Math.min(0, projete(x, h, K));
}

/** Lissage d'Hermite entre deux seuils. */
export function lisse(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Arrondi court pour les chaînes de transformation (évite les écritures inutiles). */
export const r3 = (v: number): string => (Math.round(v * 1000) / 1000).toString();
