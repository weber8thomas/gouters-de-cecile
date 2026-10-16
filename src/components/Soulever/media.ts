// Vidéo d'un invité, vue comme une photo collée (CONTRACT § 12.3) : noms logiques des images cuites
// (assetUrl) et géométrie du tirage. Partagé par Soulever (le tirage soulevé) et PhotoCollee (le
// tirage posé dans la page).
import { assetInfo, assetUrl } from '../../lib/assets';

/** Rectangle en fractions : [x, y, largeur, hauteur]. */
export type Fractions = [number, number, number, number];

/** Une vidéo d'invité (src/content/videos.json, lot V) : noms logiques d'assetUrl() ou URL directes. */
export interface VideoInfo {
  id: string;
  titre: string;
  /** mp4 H.264 720p (« videos/<id> »). */
  video: string;
  /** Première image, en couleur (« videos/<id>-affiche »). */
  affiche: string;
  /** Tirage sépia à bord blanc, droit (« photos/<id>/tirage »). */
  tirage: string;
  /** Coins photo ou scotch, fond transparent, même échelle de pixels que le tirage et centrés sur lui (« photos/<id>/coins »). */
  coins: string;
  /** Inclinaison du tirage collé (degrés ; sinon tirée de la graine). */
  angle?: number;
  /** Durée (s), pour information. */
  duree?: number;
  /** Zone de l'image dans le tirage (fractions du tirage). Défaut : CADRE_TIRAGE. */
  cadre?: Fractions;
  /** Proportion du tirage (largeur / hauteur). Défaut : taille de l'image cuite, sinon PROPORTION_TIRAGE. */
  proportion?: number;
  /** Débord des coins hors du tirage, de chaque côté, en fractions [de la largeur, de la hauteur]. Défaut : d'après les tailles cuites. */
  debordCoins?: [number, number];
  /**
   * Géométrie cuite (lot V, src/content/videos.json) : l'image du tirage a une marge transparente (ombre
   * de contact, scotch qui déborde) ; en fractions de cette image, le papier, la photo, et la zone du
   * cadre vidéo (16:9) que montre la photo. Les coins ont le même cadre que le tirage. Prioritaire sur
   * cadre / proportion / debordCoins.
   */
  geometrie?: { taille: [number, number]; papier: Fractions; photo: Fractions; cadreVideo: Fractions };
}

/** Géométrie d'un tirage, rapportée au PAPIER (la boîte mesurée et soulevée). */
export interface GeoTirage {
  /** Largeur / hauteur du papier. */
  proportion: number;
  /** Image du tirage, en fractions du papier (débord de la marge transparente compris). */
  image: Fractions;
  /** Image des coins, en fractions du papier. */
  coins: Fractions;
  /** Zone de la photo (sépia, puis couleur, puis vidéo), en fractions du papier. */
  photo: Fractions;
  /** Cadre vidéo entier (16:9), en fractions de la zone de la photo (la photo peut n'en montrer qu'une partie). */
  video: Fractions;
  /** Débord visible à prévoir autour du papier (coins, scotch), de chaque côté, en fractions du papier. */
  debord: [number, number];
  /** L'ombre de contact est cuite dans l'image (pas d'ombre CSS). */
  ombreCuite: boolean;
}

// Tirage par défaut : image 16:9, bord blanc de 4,5 % de la largeur en haut et sur les côtés, 13 % en
// bas (la marge où le crayon trace l'avancement de la vidéo).
const BORD = 0.045;
const BAS = 0.13;
const IMAGE = 9 / 16;
const HAUTEUR = BORD + (1 - 2 * BORD) * IMAGE + BAS;

/** Proportion (largeur / hauteur) du tirage par défaut : ≈ 1,456. */
export const PROPORTION_TIRAGE = 1 / HAUTEUR;
/** Zone de l'image dans le tirage par défaut. */
export const CADRE_TIRAGE: Fractions = [BORD, BORD / HAUTEUR, 1 - 2 * BORD, ((1 - 2 * BORD) * IMAGE) / HAUTEUR];

const URL_DIRECTE = /^(\/|\.{1,2}\/|[a-z][a-z0-9+.-]*:)/i;

/** URL d'un nom logique d'image cuite ou de vidéo ; une URL (/…, ./…, http:, blob:, data:) passe telle quelle. */
export function urlMedia(nom: string | null | undefined): string {
  if (!nom) return '';
  return URL_DIRECTE.test(nom) ? nom : assetUrl(nom);
}

const infoDe = (nom: string) => (URL_DIRECTE.test(nom) ? undefined : assetInfo(nom));

export function proportionDe(v: VideoInfo): number {
  if (v.proportion && v.proportion > 0) return v.proportion;
  const i = infoDe(v.tirage);
  return i && i.w > 0 && i.h > 0 ? i.w / i.h : PROPORTION_TIRAGE;
}

export const cadreDe = (v: VideoInfo): Fractions => v.cadre ?? CADRE_TIRAGE;

export function debordCoinsDe(v: VideoInfo): [number, number] {
  if (v.debordCoins) return v.debordCoins;
  const t = infoDe(v.tirage);
  const c = infoDe(v.coins);
  if (!t || !c || !(t.w > 0 && t.h > 0)) return [0, 0];
  return [Math.max(0, (c.w / t.w - 1) / 2), Math.max(0, (c.h / t.h - 1) / 2)];
}

/** Petit générateur déterministe (mulberry32). */
export function hasard(graine: number): () => number {
  let a = (graine | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclinaison d'un objet collé : celle demandée, sinon 1,2° à 3,4° d'un côté ou de l'autre selon la graine. */
export function angleDe(angle: number | undefined, graine: number): number {
  if (typeof angle === 'number' && Number.isFinite(angle)) return angle;
  const r = hasard(graine * 7919 + 13);
  const a = 1.2 + 2.2 * r();
  return r() < 0.5 ? -a : a;
}

/** Valeur d'un jeton de couleur (lue une fois sur :root), pour les rares images dessinées à l'exécution. */
const jetons = new Map<string, string>();
export function jeton(nom: string): string {
  const deja = jetons.get(nom);
  if (deja) return deja;
  if (typeof document === 'undefined') return '';
  const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
  if (v) jetons.set(nom, v);
  return v;
}

/** Géométrie du tirage : celle cuite par le lot V si elle est là, sinon la convention par défaut. */
export function geometrieDe(v: VideoInfo): GeoTirage {
  const g = v.geometrie;
  if (g && g.papier[2] > 0 && g.papier[3] > 0 && g.taille[0] > 0 && g.taille[1] > 0) {
    const [px, py, pw, ph] = g.papier;
    const [fx, fy, fw, fh] = g.photo;
    const [vx, vy, vw, vh] = g.cadreVideo;
    const image: Fractions = [-px / pw, -py / ph, 1 / pw, 1 / ph];
    return {
      proportion: (pw * g.taille[0]) / (ph * g.taille[1]),
      image,
      coins: image,
      photo: [(fx - px) / pw, (fy - py) / ph, fw / pw, fh / ph],
      video: vw > 0 && vh > 0 ? [-vx / vw, -vy / vh, 1 / vw, 1 / vh] : [0, 0, 1, 1],
      // La moitié de la marge : le scotch déborde, l'ombre est légère.
      debord: [(1 / pw - 1) / 4, (1 / ph - 1) / 4],
      ombreCuite: true,
    };
  }
  const [dx, dy] = debordCoinsDe(v);
  return {
    proportion: proportionDe(v),
    image: [0, 0, 1, 1],
    coins: [-dx, -dy, 1 + 2 * dx, 1 + 2 * dy],
    photo: cadreDe(v),
    video: [0, 0, 1, 1],
    debord: [dx, dy],
    ombreCuite: false,
  };
}
