// Fenêtre d'affichage du carnet (CONTRACT § 11) : taille de la fenêtre visuelle, densité, tactile,
// zones sûres et cadrage choisi selon la forme de l'écran.
//
//   double : écran plus large que haut → la double page entière, à l'échelle « contain » ;
//   page   : portrait (téléphone, tablette debout) → une page à la fois, la plus grande possible.
//
// Tout ce qui suit le hook est pur (aucun React, aucun DOM) et testable : échelle « contain »,
// zone sûre, cadres de caméra (double et page), débord de table nécessaire, arrondis au pixel.
import React from 'react';

export type Cadrage = 'double' | 'page';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Viewport {
  /** Largeur de la fenêtre visuelle (px CSS). */
  w: number;
  /** Hauteur de la fenêtre visuelle (px CSS). */
  h: number;
  /** Densité de pixels (devicePixelRatio). */
  dpr: number;
  /** Pointeur principal grossier (doigt) : cibles ≥ 44 px, cran par défaut « proche ». */
  tactile: boolean;
  /** Zones sûres (env(safe-area-inset-*)), px CSS. */
  insets: Insets;
  /** Cadrage de la caméra, selon la forme de l'écran (avec hystérésis). */
  cadrage: Cadrage;
  /** L'API plein écran est disponible (absente sur iPhone). */
  pleinEcran: boolean;
}

/** Fenêtre imposée (cartes, tests) : chaque champ présent remplace la mesure. */
export type ViewportForce = Partial<Omit<Viewport, 'insets'>> & { insets?: Partial<Insets> };

/** Impose une fenêtre (cartes « Formats », tests) : `<ViewportOverride.Provider value={{ w: 390, h: 844, tactile: true }}>`. */
export const ViewportOverride = React.createContext<ViewportForce | null>(null);

export const AUCUNE_MARGE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Hystérésis du cadrage : on ne bascule qu'au-delà de 6 % d'écart entre les côtés. */
export const HYSTERESIS = 0.06;

/**
 * Cadrage selon la forme : « page » quand la fenêtre est plus haute que large. Près du carré, on garde
 * le cadrage précédent (une rotation passe par des tailles intermédiaires : pas de clignotement).
 */
export function cadrageDe(w: number, h: number, avant?: Cadrage | null): Cadrage {
  if (!(w > 0 && h > 0)) return avant ?? 'double';
  if (avant === 'page') return w > h * (1 + HYSTERESIS) ? 'double' : 'page';
  if (avant === 'double') return h > w * (1 + HYSTERESIS) ? 'page' : 'double';
  return h > w ? 'page' : 'double';
}

/** Échelle « contain » : le cadre entier tient dans la zone. */
export function echelleContain(cadre: { w: number; h: number }, zone: { w: number; h: number }): number {
  if (!(cadre.w > 0 && cadre.h > 0 && zone.w > 0 && zone.h > 0)) return 1;
  return Math.min(zone.w / cadre.w, zone.h / cadre.h);
}

/** Arrondi au pixel physique (évite les bords flous au repos). */
export const auPixel = (v: number, dpr = 1): number => Math.round(v * dpr) / dpr;

/** Arrondi d'une échelle (4 décimales : une écriture de style de moins, aucun flou visible). */
export const arrondiEchelle = (s: number): number => Math.round(s * 10000) / 10000;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Zone sûre pour le contenu : la fenêtre moins les encoches. Le bas peut être ignoré (barre d'accueil
 * translucide de l'iPhone : le papier peut passer dessous, pas un contrôle).
 */
export function zoneSure(vp: Pick<Viewport, 'w' | 'h' | 'insets'>, ignorerBas = false): Rect {
  const i = vp.insets;
  const bas = ignorerBas ? 0 : i.bottom;
  return { x: i.left, y: i.top, w: Math.max(1, vp.w - i.left - i.right), h: Math.max(1, vp.h - i.top - bas) };
}

/** Géométrie du livre au cran affiché (px de scène 1920 × 1080). */
export interface GeometrieLivre {
  /** Largeur et hauteur d'une page. */
  W: number;
  H: number;
  /** Coin haut gauche du bloc de pages. */
  bookX: number;
  bookY: number;
  /** Taille de la scène. */
  stageW: number;
  stageH: number;
  /** Débords des cartons autour du bloc de pages (extérieur, haut, bas). */
  carton: { out: number; haut: number; bas: number };
}

/** Cadre de caméra : le point (cx, cy) de la scène s'affiche en (ox, oy) de l'écran, à l'échelle s. */
export interface CadreCamera {
  s: number;
  cx: number;
  cy: number;
  ox: number;
  oy: number;
}

/** Abscisse (scène) du centre de la page cadrée : couverture fermée, page gauche ou droite. */
export function centrePage(geo: GeometrieLivre, cote: 'gauche' | 'droite' | 'couverture'): number {
  if (cote === 'couverture') return geo.bookX + geo.W; // livre fermé centré sur la reliure
  return geo.bookX + geo.W * (cote === 'gauche' ? 0.5 : 1.5);
}

/** Petite marge autour de la page en cadrage « page » (fraction de la largeur de page) : on voit le
 *  carton, un peu de table et le bord de la page voisine. */
export const MARGE_PAGE = 0.03;

/**
 * Cadrage « page » : une page (W × H + petite marge), à la plus grande échelle possible dans la zone
 * sûre. Le centre horizontal de la caméra est donné à part (il glisse d'une page à l'autre).
 */
export function cadrerPage(vp: Pick<Viewport, 'w' | 'h' | 'insets'>, geo: GeometrieLivre): CadreCamera {
  const z = zoneSure(vp);
  const m = geo.W * MARGE_PAGE;
  const s = arrondiEchelle(echelleContain({ w: geo.W + 2 * m, h: geo.H + 2 * m }, z));
  return { s, cx: geo.bookX + geo.W * 0.5, cy: geo.bookY + geo.H / 2, ox: z.x + z.w / 2, oy: z.y + z.h / 2 };
}

/**
 * Part de la composition du cran gardée en cadrage « double » : 1 sur un grand écran (la scène
 * 1920 × 1080 entière, telle que validée sur la TV), 0 sur un téléphone couché (le livre remplit
 * l'écran, chaque pixel compte pour la lecture).
 */
export function partScene(vp: Pick<Viewport, 'w' | 'h'>): number {
  const court = Math.min(vp.w, vp.h);
  return Math.min(1, Math.max(0, (court - 480) / (720 - 480)));
}

/** Marge d'écran (px CSS) autour du livre quand il remplit un petit écran. */
export const MARGE_ECRAN = 4;

/**
 * Cadrage « double » : la scène du cran (livre entier + la table voulue par le cran), « contain » ;
 * sur un petit écran, on se rapproche jusqu'au livre seul (cartons compris) avec une marge de 4 px.
 */
export function cadrerDouble(vp: Pick<Viewport, 'w' | 'h' | 'insets'>, geo: GeometrieLivre): CadreCamera {
  // Le livre peut passer sous la barre d'accueil (bas), jamais sous une encoche (côtés, haut).
  const z = zoneSure(vp, true);
  const k = partScene(vp);
  const c = geo.carton;
  const livre = { x: geo.bookX - c.out, y: geo.bookY - c.haut, w: 2 * geo.W + 2 * c.out, h: geo.H + c.haut + c.bas };
  const sScene = echelleContain({ w: geo.stageW, h: geo.stageH }, z);
  const sLivre = echelleContain(livre, { w: z.w - 2 * MARGE_ECRAN, h: z.h - 2 * MARGE_ECRAN });
  const s = arrondiEchelle(k * sScene + (1 - k) * Math.max(sScene, sLivre));
  const cx = k * (geo.stageW / 2) + (1 - k) * (livre.x + livre.w / 2);
  const cy = k * (geo.stageH / 2) + (1 - k) * (livre.y + livre.h / 2);
  return { s, cx, cy, ox: z.x + z.w / 2, oy: z.y + z.h / 2 };
}

/**
 * Débord de table nécessaire (px de scène, le même des quatre côtés) pour que la table couvre tout
 * l'écran, pour chacune des abscisses de caméra possibles. Multiple de 48 px : le vichy de la nappe
 * (cellule de 48 px) garde sa phase.
 */
export function debordNecessaire(vp: Pick<Viewport, 'w' | 'h'>, cadre: CadreCamera, xs: number[], geo: Pick<GeometrieLivre, 'stageW' | 'stageH'>, marge = 64): number {
  if (!(cadre.s > 0)) return 0;
  let d = 0;
  for (const x of xs.length ? xs : [cadre.cx]) {
    const gauche = x - cadre.ox / cadre.s;
    const droite = x + (vp.w - cadre.ox) / cadre.s;
    d = Math.max(d, -gauche, droite - geo.stageW);
  }
  const haut = cadre.cy - cadre.oy / cadre.s;
  const bas = cadre.cy + (vp.h - cadre.oy) / cadre.s;
  d = Math.max(d, -haut, bas - geo.stageH);
  if (d <= 0) return 0;
  return Math.ceil((d + marge) / 48) * 48;
}

/** Translation (px d'écran) qui pose le point (x, cy) de la scène en (ox, oy). */
export function translationMonde(cadre: CadreCamera, x: number, dpr?: number): { tx: number; ty: number } {
  const tx = cadre.ox - x * cadre.s;
  const ty = cadre.oy - cadre.cy * cadre.s;
  return dpr ? { tx: auPixel(tx, dpr), ty: auPixel(ty, dpr) } : { tx, ty };
}

// ---- Hook ---------------------------------------------------------------------------------------

const lireInsets = (sonde: HTMLElement | null): Insets => {
  if (!sonde) return AUCUNE_MARGE;
  const cs = getComputedStyle(sonde);
  const v = (k: string) => parseFloat(cs.getPropertyValue(k)) || 0;
  return { top: v('padding-top'), right: v('padding-right'), bottom: v('padding-bottom'), left: v('padding-left') };
};

const pleinEcranDisponible = (): boolean => {
  if (typeof document === 'undefined') return false;
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
};

const tactileMedia = (): MediaQueryList | null =>
  typeof matchMedia === 'undefined' ? null : matchMedia('(pointer: coarse)');

interface Mesure {
  w: number;
  h: number;
  dpr: number;
  tactile: boolean;
  insets: Insets;
  pleinEcran: boolean;
}

function mesurer(sonde: HTMLElement | null, avant: Mesure | null): Mesure {
  if (typeof window === 'undefined') return avant ?? { w: 1920, h: 1080, dpr: 1, tactile: false, insets: AUCUNE_MARGE, pleinEcran: false };
  const vv = window.visualViewport;
  // Pincement en cours (zoom du navigateur, permis pour l'accessibilité) : on garde la mesure d'avant,
  // sinon la mise en page suivrait le zoom et l'annulerait.
  if (vv && vv.scale > 1.01 && avant) return avant;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  return {
    w: Math.round(w),
    h: Math.round(h),
    dpr: window.devicePixelRatio || 1,
    tactile: !!tactileMedia()?.matches,
    insets: lireInsets(sonde),
    pleinEcran: pleinEcranDisponible(),
  };
}

const memeMesure = (a: Mesure, b: Mesure) =>
  a.w === b.w && a.h === b.h && a.dpr === b.dpr && a.tactile === b.tactile && a.pleinEcran === b.pleinEcran &&
  a.insets.top === b.insets.top && a.insets.right === b.insets.right && a.insets.bottom === b.insets.bottom && a.insets.left === b.insets.left;

/**
 * La fenêtre d'affichage, mise à jour au redimensionnement et à la rotation (une fois par image au
 * plus). Sous un `ViewportOverride`, les champs imposés remplacent la mesure (le cadrage est recalculé
 * depuis la taille imposée, sauf s'il est imposé lui aussi).
 */
export function useViewport(): Viewport {
  const force = React.useContext(ViewportOverride);
  const sondeRef = React.useRef<HTMLElement | null>(null);
  const [m, setM] = React.useState<Mesure>(() => mesurer(null, null));
  const cadrageRef = React.useRef<Cadrage | null>(null);
  const toutImpose = !!force && force.w != null && force.h != null;

  React.useLayoutEffect(() => {
    if (typeof document === 'undefined' || toutImpose) return;
    // Sonde des zones sûres : env() n'est lisible que par une propriété calculée.
    // Elle couvre la fenêtre : un ResizeObserver la suit (certains navigateurs n'émettent pas toujours
    // « resize » au retour d'une rotation), et sa boîte de contenu change aussi avec les zones sûres.
    const sonde = document.createElement('div');
    sonde.setAttribute('aria-hidden', 'true');
    sonde.style.cssText = 'position:fixed;inset:0;box-sizing:border-box;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(sonde);
    sondeRef.current = sonde;
    let raf = 0;
    const maj = () => {
      raf = 0;
      setM((avant) => {
        const n = mesurer(sonde, avant);
        return memeMesure(avant, n) ? avant : n;
      });
    };
    const planifier = () => { if (!raf) raf = requestAnimationFrame(maj); };
    maj();
    window.addEventListener('resize', planifier);
    window.addEventListener('orientationchange', planifier);
    window.visualViewport?.addEventListener('resize', planifier);
    document.addEventListener('fullscreenchange', planifier);
    const mq = tactileMedia();
    mq?.addEventListener?.('change', planifier);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(planifier) : null;
    ro?.observe(sonde);
    return () => {
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', planifier);
      window.removeEventListener('orientationchange', planifier);
      window.visualViewport?.removeEventListener('resize', planifier);
      document.removeEventListener('fullscreenchange', planifier);
      mq?.removeEventListener?.('change', planifier);
      sonde.remove();
      sondeRef.current = null;
    };
  }, [toutImpose]);

  const w = force?.w ?? m.w;
  const h = force?.h ?? m.h;
  const cadrage = force?.cadrage ?? cadrageDe(w, h, cadrageRef.current);
  cadrageRef.current = cadrage;
  const insets: Insets = force?.insets ? { ...AUCUNE_MARGE, ...(toutImpose ? {} : m.insets), ...force.insets } : toutImpose ? AUCUNE_MARGE : m.insets;
  const dpr = force?.dpr ?? m.dpr;
  const tactile = force?.tactile ?? m.tactile;
  const pleinEcran = force?.pleinEcran ?? (toutImpose ? false : m.pleinEcran);
  return React.useMemo<Viewport>(
    () => ({ w, h, dpr, tactile, insets, cadrage, pleinEcran }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, h, dpr, tactile, cadrage, pleinEcran, insets.top, insets.right, insets.bottom, insets.left],
  );
}
