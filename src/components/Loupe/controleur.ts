// Contrôleur de la loupe (plan v4, CONTRACT § 13, lot B) : un vrai zoom de 1× à 3× sur le calque
// .gc-ecran__loupe de l'Ecran (translate3d + scale de trois MotionValues, origine 0 0). Aucun rendu
// React pendant un geste : on écrit les MotionValues, et l'état au repos (src/lib/loupe.ts) n'est
// publié qu'à la fin.
//
// Gestes (écoute en capture, avant le livre) :
//   - pincer à deux doigts : z = z0 · d / d0 (élastique 0,9 – 3,3), le foyer reste sous les doigts ;
//   - un doigt (ou la souris) quand on est zoomé : déplacement, élan au lâcher (INERTIE), puis ressort
//     « camera » pour revenir dans les bornes ; le livre ne voit pas ces déplacements (il ne tourne
//     donc jamais la page) ;
//   - double toucher dans l'intérieur d'une page (hors marges, objets, contrôles, couverture fermée) :
//     1× ↔ 2× au point touché ; le simple toucher reste au livre (photo, marges) ;
//   - ctrl + molette (et pincement du pavé tactile) : zoom au curseur ; molette seule zoomé : déplacement ;
//   - Safari : gesturestart / gesturechange / gestureend (pavé tactile du Mac) ;
//   - clavier zoomé : flèches = déplacement de 20 % (← → passent au livre au bord), Échap = 1×.
// Bornes : le contenu zoomé couvre la zone sûre (jamais de texte coincé sous l'encoche).
// Désactivée tant que le navigateur est zoomé (visualViewport.scale > 1,01). Rien n'est mémorisé ; à la
// rotation de l'écran, la loupe garde son facteur et le point du texte qu'elle montrait au centre.
//
// Les fonctions pures (zoomFoyer, pincer, bornesPan, bornerPan, ancrerHaut, zElastique) sont
// exportées pour les tests.
import { animate, INERTIE, SPRINGS, prefersReducedMotion, type MotionValue } from '../../lib/motion';
import {
  LOUPE_DOUBLE, LOUPE_MAX, LOUPE_MIN, LOUPE_ZOOME, getLoupe, majLoupe, signalerGesteLoupe,
  type ControleurLoupe, type EtatLoupe, type RectLoupe,
} from '../../lib/loupe';
import { auPixel, zoneSure, type Viewport } from '../../lib/viewport';
import { clavierModalActif } from '../../lib/clavier';
import { emettre } from '../Livre/evenements';
import { MARGE_TOUCHER, SEUIL_GLISSER, TOUCHER_MAX_MS, elastique } from '../Livre/doigt';

// ---- Géométrie pure ----------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

/** Vue de la loupe : translation (px d'écran) puis échelle, origine en haut à gauche de l'écran. */
export interface Vue {
  x: number;
  y: number;
  z: number;
}

export const VUE_REPOS: Vue = { x: 0, y: 0, z: 1 };

/** Élastique de z au doigt : libre de 1 à 3, amorti jusqu'à 0,9 et 3,3. */
export function zElastique(z: number): number {
  if (z < LOUPE_MIN) return LOUPE_MIN - elastique(LOUPE_MIN - z, 0.1);
  if (z > LOUPE_MAX) return LOUPE_MAX + elastique(z - LOUPE_MAX, 0.3);
  return z;
}

/** Change le facteur en gardant immobile le point `foyer` de l'écran. */
export function zoomFoyer(v: Vue, z: number, foyer: Point): Vue {
  const k = z / v.z;
  return { x: foyer.x - (foyer.x - v.x) * k, y: foyer.y - (foyer.y - v.y) * k, z };
}

/**
 * Pincement : z = z0 · d / d0 (élastique), pan = m − (m0 − pan0) · z / z0. Le point du contenu qui
 * était sous le milieu des doigts au départ (m0) reste sous leur milieu actuel (m).
 */
export function pincer(v0: Vue, m0: Point, d0: number, m: Point, d: number): Vue {
  const z = zElastique((v0.z * d) / Math.max(1, d0));
  const k = z / v0.z;
  return { x: m.x - (m0.x - v0.x) * k, y: m.y - (m0.y - v0.y) * k, z };
}

/**
 * Bornes de la translation sur un axe, pour un contenu [c0, c0 + cw] (à z = 1) et une zone [s0, s0 + sw] :
 *   - le contenu zoomé est plus grand que la zone : il la couvre (aucun vide, aucun bord à l'intérieur) ;
 *   - sinon, il reste dans la zone (ou là où il était à 1×) : z = 1 laisse toujours la translation 0.
 * Les deux cas se rejoignent au facteur où le contenu remplit juste la zone (aucun saut).
 */
export function bornesAxe(z: number, c0: number, cw: number, s0: number, sw: number): [number, number] {
  if (z * cw >= sw) return [s0 + sw - z * (c0 + cw), s0 - z * c0];
  const a0 = Math.min(s0, c0);
  const a1 = Math.max(s0 + sw, c0 + cw);
  return [a0 - z * c0, a1 - z * (c0 + cw)];
}

export interface Bornes {
  x: [number, number];
  y: [number, number];
}

export function bornesPan(z: number, contenu: RectLoupe, zone: RectLoupe): Bornes {
  if (z <= 1 + 1e-4) return { x: [0, 0], y: [0, 0] };
  return { x: bornesAxe(z, contenu.x, contenu.w, zone.x, zone.w), y: bornesAxe(z, contenu.y, contenu.h, zone.y, zone.h) };
}

const borne = (v: number, [a, b]: [number, number]) => Math.min(b, Math.max(a, v));

/** La translation ramenée dans ses bornes (à 1× : aucune translation). */
export function bornerPan(pan: Point, z: number, contenu: RectLoupe, zone: RectLoupe): Point {
  const b = bornesPan(z, contenu, zone);
  return { x: borne(pan.x, b.x), y: borne(pan.y, b.y) };
}

/** Vue bornée : z dans [1, 3], translation dans ses bornes (et nulle à 1×). */
export function bornerVue(v: Vue, contenu: RectLoupe, zone: RectLoupe): Vue {
  const z = Math.min(LOUPE_MAX, Math.max(LOUPE_MIN, v.z));
  if (z <= 1 + 1e-4) return { ...VUE_REPOS };
  return { ...bornerPan(v, z, contenu, zone), z };
}

/**
 * Haut d'une page (rect à z = 1) en haut de la zone sûre ; horizontalement, la page centrée si elle
 * tient, sinon son bord gauche au bord de la zone (début des lignes). Puis bornée.
 */
export function ancrerHaut(page: RectLoupe, z: number, zone: RectLoupe, contenu: RectLoupe): Point {
  const x = z * page.w <= zone.w ? zone.x + (zone.w - z * page.w) / 2 - z * page.x : zone.x - z * page.x;
  const y = zone.y - z * page.y;
  return bornerPan({ x, y }, z, contenu, zone);
}

/** Valeur amortie au-delà de ses bornes (déplacement au doigt). */
export function entreBornes(v: number, [a, b]: [number, number], r: number): number {
  if (v < a) return a - elastique(a - v, r);
  if (v > b) return b + elastique(v - b, r);
  return v;
}

/** Transformation CSS du calque : rien du tout au repos à 1× (aucun calque composité de plus). */
export function transformLoupe(x: number, y: number, z: number): string {
  if (Math.abs(z - 1) < 1e-4 && Math.abs(x) < 0.01 && Math.abs(y) < 0.01) return 'none';
  return `translate3d(${x}px, ${y}px, 0) scale(${z})`;
}

// ---- Contrôleur -----------------------------------------------------------------------------------

/** Ce sur quoi un toucher ne fait pas de double toucher (le contenu gère son propre toucher). */
const SUR_OBJET = '[data-gc-objet], [data-gc-controle], button, a, input, select, textarea, [role="button"], [role="slider"]';
/** Double toucher : deux touchers à moins de 300 ms et 24 px. */
export const DOUBLE_MS = 300;
export const DOUBLE_PX = 24;
/** Pas des flèches : 20 % de la zone sûre. */
export const PAS_CLAVIER = 0.2;
/** Fin d'une suite de crans de molette (ms sans nouveau cran). */
const FIN_ROUE_MS = 160;
/** Fenêtre de mesure de la vitesse au lâcher (ms). */
const FENETRE_MS = 90;

interface Echantillon {
  t: number;
  x: number;
  y: number;
}

interface Pointeur {
  id: number;
  type: string;
  x0: number;
  y0: number;
  t0: number;
  x: number;
  y: number;
  cible: Element | null;
  pts: Echantillon[];
  /** A pris part à un pincement : son lâcher n'est jamais un toucher. */
  pince: boolean;
}

export interface OptionsControleur {
  /** .gc-ecran : origine des coordonnées, attributs de geste, événements gc-livre-geste. */
  racine: HTMLElement;
  /** .gc-ecran__loupe : le calque zoomé (écoute des gestes). */
  calque: HTMLElement;
  lx: MotionValue<number>;
  ly: MotionValue<number>;
  lz: MotionValue<number>;
  vp: Viewport;
  /**
   * Loupe de la page (écran réel) : clavier, événement gc-loupe, état partagé (src/lib/loupe.ts).
   * false pour un écran simulé (cartes) : gestes et bouton seulement, état local.
   */
  globale: boolean;
  /** État au repos d'un écran simulé (globale = false). */
  onRepos?: (e: { z: number; cote: EtatLoupe['cote'] }) => void;
}

export interface ControleurEcran extends ControleurLoupe {
  /** Bouton loupe : 1× ↔ 2× autour du centre de la zone sûre. */
  basculer(): void;
  /** Nouvelle fenêtre (taille, zones sûres) : remise à 1× à la rotation, bornes recalculées sinon. */
  majVp(vp: Viewport): void;
  /** Retour immédiat à 1× (sans animation). */
  reinitialiser(): void;
  detacher(): void;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const milieu = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Vitesse au lâcher (px/s) : pente sur la dernière fenêtre ; doigt arrêté avant de lâcher → 0. */
function vitesse(pts: Echantillon[], tFin: number): Point {
  if (pts.length < 2) return { x: 0, y: 0 };
  const der = pts[pts.length - 1];
  if (tFin - der.t > 60) return { x: 0, y: 0 };
  let i = pts.length - 1;
  while (i > 0 && der.t - pts[i - 1].t <= FENETRE_MS) i--;
  const prem = pts[i === pts.length - 1 ? Math.max(0, i - 1) : i];
  const dt = der.t - prem.t;
  return dt > 4 ? { x: ((der.x - prem.x) / dt) * 1000, y: ((der.y - prem.y) / dt) * 1000 } : { x: 0, y: 0 };
}

/** Delta de molette en px (lignes : 16 px ; pages : une hauteur d'écran). */
const pxRoue = (d: number, mode: number, page: number) => (mode === 1 ? d * 16 : mode === 2 ? d * page : d);

type Anim = { stop: () => void };

export function creerControleur(o: OptionsControleur): ControleurEcran {
  const { racine, calque, lx, ly, lz, globale } = o;
  let vp = o.vp;
  let actif = true;
  let origine: Point = { x: 0, y: 0 };
  /** Échelle de l'écran dans la page (1 ; moins dans une carte qui réduit un écran simulé). */
  let k = 1;
  const pointeurs = new Map<number, Pointeur>();
  /** Pointeurs dont la loupe garde les déplacements (le livre ne les voit pas). */
  const avales = new Set<number>();
  let mode: 'aucun' | 'pincer' | 'deplacer' = 'aucun';
  let pince: { v0: Vue; m0: Point; d0: number; ids: [number, number]; m: Point } | null = null;
  let depl: { id: number; v0: Vue; p0: Point } | null = null;
  let roue: number | null = null;
  let safari: { v0: Vue; foyer: Point } | null = null;
  let enGeste = false;
  /** gc-livre-geste « debut » émis (après la promotion du calque, phase prepa). */
  let debutEmis = false;
  let gesteSeq = 0;
  let anims: Anim[] = [];
  let animSeq = 0;
  /** Vue visée par l'animation en cours (demander, clavier, ancrer, retour aux bornes). */
  let visee: Vue | null = null;
  let dernierToucher: { t: number; x: number; y: number } | null = null;
  let gardeClic = -1e9;
  let geometrie: { contenu: RectLoupe; zone: RectLoupe } | null = null;
  let dernierDouble: number | null = null;
  let detache = false;
  /** Zoomé, au repos : le point du texte au centre de la zone sûre (fractions d'une page) et le facteur. */
  let ancre: { cote: 'gauche' | 'droite'; fx: number; fy: number; z: number } | null = null;

  const vue = (): Vue => ({ x: lx.get(), y: ly.get(), z: lz.get() });
  const viseeOuCourante = (): Vue => visee ?? vue();
  const zoomeMaintenant = () => lz.get() > LOUPE_ZOOME;
  const local = (cx: number, cy: number): Point => ({ x: (cx - origine.x) / k, y: (cy - origine.y) / k });
  const dpr = () => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  // ---- Lectures du DOM (au repos, jamais pendant un geste) ----
  const lireOrigine = () => {
    const r = racine.getBoundingClientRect();
    origine = { x: r.left, y: r.top };
    k = racine.offsetWidth > 0 && r.width > 0 ? r.width / racine.offsetWidth : 1;
  };
  const zone = (): RectLoupe => zoneSure(vp);
  const livreEcran = () => calque.querySelector<HTMLElement>('.gc-livre-ecran');
  const emplacement = (c: 'gauche' | 'droite') => calque.querySelector<HTMLElement>(`.gc-livre__emplacement--${c}`);
  /** Rect d'écran → rect du contenu à z = 1 (coordonnées de l'écran). */
  const aZ1 = (r: DOMRect, v: Vue): RectLoupe => ({
    x: ((r.left - origine.x) / k - v.x) / v.z, y: ((r.top - origine.y) / k - v.y) / v.z, w: r.width / k / v.z, h: r.height / k / v.z,
  });
  const union = (a: RectLoupe, b: RectLoupe): RectLoupe => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };
  /** Contenu du livre à z = 1 : publié par le livre, sinon mesuré (page visible, ou les deux pages). */
  function lireContenu(): RectLoupe {
    const pub = globale ? getLoupe().contenu : null;
    if (pub && pub.w > 0 && pub.h > 0) return { x: (pub.x - origine.x) / k, y: (pub.y - origine.y) / k, w: pub.w / k, h: pub.h / k };
    const v = vue();
    const le = livreEcran();
    const ferme = calque.querySelector('.gc-livre')?.getAttribute('data-gc-etat') === 'couverture';
    const g = emplacement('gauche')?.getBoundingClientRect();
    const d = emplacement('droite')?.getBoundingClientRect();
    if (g && d && g.width > 0 && d.width > 0) {
      if (le?.getAttribute('data-gc-cadrage') === 'page') {
        const c = ferme ? 'droite' : le.getAttribute('data-gc-cote') === 'droite' ? 'droite' : 'gauche';
        return aZ1(c === 'gauche' ? g : d, v);
      }
      return ferme ? aZ1(d, v) : union(aZ1(g, v), aZ1(d, v));
    }
    return { x: 0, y: 0, w: vp.w, h: vp.h };
  }
  /** Géométrie figée pour la durée d'un geste (lue avant son début). */
  function geo() {
    if (!geometrie) {
      lireOrigine();
      geometrie = { contenu: lireContenu(), zone: zone() };
    }
    return geometrie;
  }
  const oublierGeo = () => { geometrie = null; };

  /** Page visible à ancrer : la seule en cadrage « page » ; sinon selon le sens du dernier tour. */
  function pageAAncrer(): RectLoupe | null {
    const le = livreEcran();
    const v = vue();
    const g = emplacement('gauche')?.getBoundingClientRect();
    const d = emplacement('droite')?.getBoundingClientRect();
    if (!g || !d) return null;
    if (le?.getAttribute('data-gc-cadrage') === 'page') return aZ1(le.getAttribute('data-gc-cote') === 'droite' ? d : g, v);
    const double = Number(le?.getAttribute('data-gc-double'));
    let c: 'gauche' | 'droite' | null = null;
    if (Number.isFinite(double) && dernierDouble != null && double !== dernierDouble) c = double > dernierDouble ? 'gauche' : 'droite';
    if (Number.isFinite(double)) dernierDouble = double;
    c ??= (globale ? getLoupe().cote : null) ?? coteAuCentre();
    return aZ1(c === 'droite' ? d : g, v);
  }

  /** Page vue sous la loupe : la page affichée en cadrage « page », la page au centre de la zone sûre en
   *  « double » ; null à 1× ou livre fermé. */
  function coteAuCentre(): EtatLoupe['cote'] {
    const le = livreEcran();
    if (!zoomeMaintenant() || calque.querySelector('.gc-livre')?.getAttribute('data-gc-etat') === 'couverture') return null;
    if (le?.getAttribute('data-gc-cadrage') === 'page') return le.getAttribute('data-gc-cote') === 'droite' ? 'droite' : 'gauche';
    const z = zone();
    const cx = origine.x + (z.x + z.w / 2) * k;
    const g = emplacement('gauche')?.getBoundingClientRect();
    const d = emplacement('droite')?.getBoundingClientRect();
    if (!g || !d) return null;
    const dg = cx < g.left ? g.left - cx : cx > g.right ? cx - g.right : 0;
    const dd = cx < d.left ? d.left - cx : cx > d.right ? cx - d.right : 0;
    return dd < dg ? 'droite' : 'gauche';
  }

  // ---- Début et fin d'un geste ----
  /**
   * Début d'un geste : le livre est prévenu tout de suite (gc-loupe « debut » : il lâche son doigt).
   * Le calque est promu (will-change) : passer de `transform: none` à un calque composité coûte une
   * mise en page et quelques peintures, une seule fois. C'est la préparation (gc-livre-geste « prepa »,
   * comme le feuillet que le livre monte avant de tourner) ; le mouvement mesuré (« debut ») commence
   * deux images plus tard, sur un calque déjà en place, où seules les transformations changent.
   */
  function debut(geste: 'deplacer' | 'zoom' = 'zoom') {
    if (geste === 'deplacer') racine.setAttribute('data-gc-loupe-geste', 'deplacer');
    if (enGeste) return;
    enGeste = true;
    debutEmis = false;
    const seq = ++gesteSeq;
    calque.style.willChange = 'transform';
    if (globale) signalerGesteLoupe('debut');
    emettre(racine, 'prepa', 'loupe');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!enGeste || seq !== gesteSeq || debutEmis) return;
      debutEmis = true;
      emettre(racine, 'debut', 'loupe');
    }));
  }

  /** Plus rien ne bouge et aucun doigt ne mène : fin du geste, état au repos publié. */
  function peutReposer() {
    return !anims.length && mode === 'aucun' && roue == null && !safari;
  }
  function repos() {
    if (!peutReposer()) return;
    visee = null;
    racine.removeAttribute('data-gc-loupe-geste');
    oublierGeo();
    if (enGeste) {
      enGeste = false;
      if (globale) signalerGesteLoupe('fin');
      if (!debutEmis) emettre(racine, 'debut', 'loupe'); // geste plus court que la préparation
      debutEmis = false;
      emettre(racine, 'fin', 'loupe');
      // Le calque redevient un calque ordinaire après la fin : il est rastérisé à sa nouvelle
      // échelle (net), hors du geste.
      requestAnimationFrame(() => { if (!enGeste) calque.style.willChange = ''; });
    }
    publier();
  }
  function publier() {
    if (detache) return;
    oublierGeo();
    lireOrigine();
    const z = lz.get();
    const cote = coteAuCentre();
    ancre = cote ? releverAncre(cote) : null;
    const d = Number(livreEcran()?.getAttribute('data-gc-double'));
    if (Number.isFinite(d)) dernierDouble = d;
    if (globale) majLoupe({ z, cote });
    else o.onRepos?.({ z, cote });
  }

  /** Point du contenu au centre de la zone sûre, en fractions de la page `cote` (lu au repos). */
  function releverAncre(cote: 'gauche' | 'droite') {
    const el = emplacement(cote);
    if (!el) return null;
    const v = vue();
    const p = aZ1(el.getBoundingClientRect(), v);
    if (!(p.w > 0 && p.h > 0)) return null;
    const s = zone();
    return { cote, fx: ((s.x + s.w / 2 - v.x) / v.z - p.x) / p.w, fy: ((s.y + s.h / 2 - v.y) / v.z - p.y) / p.h, z: v.z };
  }

  /**
   * Après une rotation de l'écran : même facteur, et le même point du texte au centre de la zone sûre
   * (sur une autre page que celle de l'ancre, en cadrage « page » : le haut de la page affichée). Sans
   * animation : l'écran vient de tourner.
   */
  function reprendre(a: NonNullable<typeof ancre>) {
    if (detache || !actif || enGeste) return;
    arreterAnims();
    oublierGeo();
    const { contenu, zone: s } = geo();
    const le = livreEcran();
    const el = le?.getAttribute('data-gc-cadrage') === 'page' && le.getAttribute('data-gc-cote') !== a.cote ? null : emplacement(a.cote);
    let v: Vue;
    if (el) {
      const p = aZ1(el.getBoundingClientRect(), vue());
      v = bornerVue({ x: s.x + s.w / 2 - a.z * (p.x + a.fx * p.w), y: s.y + s.h / 2 - a.z * (p.y + a.fy * p.h), z: a.z }, contenu, s);
    } else {
      const p = pageAAncrer();
      if (!p) { reinitialiser(); return; }
      v = { ...ancrerHaut(p, a.z, s, contenu), z: a.z };
    }
    lx.set(auPixel(v.x, dpr()));
    ly.set(auPixel(v.y, dpr()));
    lz.set(v.z);
    publier();
  }

  // ---- Animations ----
  function arreterAnims() {
    animSeq++;
    const a = anims;
    anims = [];
    a.forEach((x) => x.stop());
    visee = null;
  }
  /** Ressort « camera » vers une vue (bornée par l'appelant) ; immédiat en mouvement réduit. */
  function animerVers(cible: Vue, vitesseInit?: Partial<Vue>) {
    arreterAnims();
    const c = { x: auPixel(cible.x, dpr()), y: auPixel(cible.y, dpr()), z: Math.round(cible.z * 10000) / 10000 };
    if (prefersReducedMotion()) {
      lx.set(c.x);
      ly.set(c.y);
      lz.set(c.z);
      if (enGeste) repos();
      else publier();
      return;
    }
    const valeurs = [[lx, c.x, 'x'], [ly, c.y, 'y'], [lz, c.z, 'z']] as const;
    const aBouger = valeurs.filter(([mv, v, cle]) => Math.abs(mv.get() - v) >= (cle === 'z' ? 1e-4 : 0.25) || !!vitesseInit?.[cle]);
    if (!aBouger.length) {
      // Déjà là : aucun geste (pas de gc-loupe début / fin pour rien).
      valeurs.forEach(([mv, v]) => mv.set(v));
      if (enGeste) repos();
      else publier();
      return;
    }
    debut();
    visee = c;
    const seq = animSeq;
    let restant = aBouger.length;
    const fini = () => {
      if (seq !== animSeq) return;
      if (--restant > 0) return;
      anims = [];
      repos();
    };
    for (const [mv, v] of valeurs) if (!aBouger.some(([m]) => m === mv)) mv.set(v);
    for (const [mv, v, cle] of aBouger) anims.push(animate(mv, v, { ...SPRINGS.camera, velocity: vitesseInit?.[cle] ?? 0, onComplete: fini }));
  }

  /** Lâcher d'un déplacement : élan (inertie) vers une cible dans les bornes, ressort si on en sort. */
  function lancerElan(v: Point) {
    arreterAnims();
    const { contenu, zone: s } = geo();
    const z = lz.get();
    const b = bornesPan(z, contenu, s);
    if (prefersReducedMotion()) {
      const p = bornerPan(vue(), z, contenu, s);
      lx.set(p.x);
      ly.set(p.y);
      repos();
      return;
    }
    const seq = animSeq;
    let restant = 0;
    const fini = () => {
      if (seq !== animSeq) return;
      if (--restant > 0) return;
      anims = [];
      repos();
    };
    for (const [mv, vel, bb] of [[lx, v.x, b.x], [ly, v.y, b.y]] as const) {
      const cur = mv.get();
      const dedans = cur >= bb[0] - 0.5 && cur <= bb[1] + 0.5;
      if (!dedans) {
        restant++;
        anims.push(animate(mv, auPixel(borne(cur, bb), dpr()), { ...SPRINGS.camera, velocity: vel, onComplete: fini }));
      } else if (Math.abs(vel) > 30) {
        restant++;
        anims.push(animate(mv, cur, {
          type: 'inertia', velocity: vel, power: INERTIE.power, timeConstant: INERTIE.timeConstant,
          modifyTarget: (t: number) => auPixel(borne(t, bb), dpr()), onComplete: fini,
        }));
      } else mv.set(auPixel(borne(cur, bb), dpr()));
    }
    if (!restant) repos();
  }

  /** Vue bornée vers laquelle revenir après un pincement, au foyer f (px de l'écran). */
  function vueDeRepos(v: Vue, f: Point): Vue {
    const { contenu, zone: s } = geo();
    let z = Math.min(LOUPE_MAX, Math.max(LOUPE_MIN, v.z));
    if (z < 1.05) z = 1; // presque 1× : on revient à plat
    if (z === 1) return { ...VUE_REPOS };
    return bornerVue(zoomFoyer(v, z, f), contenu, s);
  }

  // ---- Le livre lâche le doigt ----
  /**
   * Le livre suit ses doigts sur window (bulle) : un pointercancel synthétique (sur window seulement)
   * lui fait abandonner son geste quand deux doigts pincent. Le livre (lot A) l'abandonne aussi sur
   * l'événement gc-loupe ; ceci couvre les écouteurs qui ne connaissent pas la loupe.
   */
  function annulerLivre(ids: number[]) {
    for (const id of ids) {
      try {
        window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, isPrimary: true, pointerType: 'touch' }));
      } catch { /* PointerEvent indisponible */ }
    }
  }

  // ---- Pincer ----
  function demarrerPince() {
    const [a, b] = [...pointeurs.values()].slice(-2);
    if (!a || !b) return;
    annulerLivre([a.id, b.id]);
    a.pince = true;
    b.pince = true;
    avales.add(a.id);
    avales.add(b.id);
    arreterAnims();
    depl = null;
    oublierGeo();
    geo();
    const mm = milieu(a, b);
    const m0 = local(mm.x, mm.y);
    pince = { v0: vue(), m0, d0: Math.max(1, distance(a, b)), ids: [a.id, b.id], m: m0 };
    mode = 'pincer';
    debut();
  }
  function majPince() {
    if (!pince) return;
    const a = pointeurs.get(pince.ids[0]);
    const b = pointeurs.get(pince.ids[1]);
    if (!a || !b) return;
    const mm = milieu(a, b);
    pince.m = local(mm.x, mm.y);
    const v = pincer(pince.v0, pince.m0, pince.d0, pince.m, distance(a, b));
    lx.set(v.x);
    ly.set(v.y);
    lz.set(v.z);
  }
  function finPince(restant: Pointeur | undefined) {
    if (!pince) return;
    const f = pince.m;
    pince = null;
    mode = 'aucun';
    const v = vue();
    // Un doigt reste posé, on est zoomé et dans les bornes de z : il continue en déplacement.
    if (restant && v.z >= 1.05 && v.z <= LOUPE_MAX) {
      depl = { id: restant.id, v0: v, p0: local(restant.x, restant.y) };
      restant.pts = [{ t: performance.now(), x: restant.x, y: restant.y }];
      mode = 'deplacer';
      return;
    }
    animerVers(vueDeRepos(v, f));
  }

  // ---- Déplacer ----
  function demarrerDeplacement(p: Pointeur) {
    arreterAnims();
    oublierGeo();
    geo();
    depl = { id: p.id, v0: vue(), p0: local(p.x, p.y) };
    mode = 'deplacer';
    debut('deplacer');
  }
  function majDeplacement(p: Pointeur) {
    if (!depl) return;
    const { contenu, zone: s } = geo();
    const b = bornesPan(lz.get(), contenu, s);
    const q = local(p.x, p.y);
    const r = Math.max(40, 0.12 * Math.min(vp.w, vp.h));
    lx.set(entreBornes(depl.v0.x + q.x - depl.p0.x, b.x, r));
    ly.set(entreBornes(depl.v0.y + q.y - depl.p0.y, b.y, r));
  }
  function finDeplacement(v: Point) {
    depl = null;
    mode = 'aucun';
    racine.setAttribute('data-gc-loupe-geste', 'elan');
    lancerElan(v);
  }

  // ---- Double toucher ----
  function dansInterieur(cible: Element | null, cx: number, cy: number): boolean {
    if (!cible || cible.closest(SUR_OBJET)) return false;
    if (!calque.contains(cible)) return false;
    const livre = cible.closest('.gc-livre');
    if (!livre || livre.getAttribute('data-gc-etat') === 'couverture') return false;
    const face = cible.closest('.gc-livre-face');
    if (!face) return false;
    const r = face.getBoundingClientRect();
    const m = MARGE_TOUCHER * r.width;
    return cx > r.left + m && cx < r.right - m && cy > r.top && cy < r.bottom;
  }
  function toucher(p: Pointeur, e: PointerEvent) {
    if (p.pince) return;
    if (!dansInterieur(p.cible, e.clientX, e.clientY)) {
      dernierToucher = null;
      return;
    }
    const d = dernierToucher;
    if (d && e.timeStamp - d.t <= DOUBLE_MS && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= DOUBLE_PX) {
      dernierToucher = null;
      basculerAu({ x: e.clientX, y: e.clientY });
      return;
    }
    dernierToucher = { t: e.timeStamp, x: e.clientX, y: e.clientY };
  }

  // ---- Commandes ----
  function demander(z: number, foyer?: Point) {
    if (!actif || detache) return;
    oublierGeo();
    const { contenu, zone: s } = geo();
    const f = foyer ? local(foyer.x, foyer.y) : { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    const zz = Math.min(LOUPE_MAX, Math.max(LOUPE_MIN, z));
    const v = viseeOuCourante();
    animerVers(zz <= 1 + 1e-4 ? { ...VUE_REPOS } : bornerVue(zoomFoyer(v, zz, f), contenu, s));
  }
  function basculerAu(foyer?: Point) {
    demander(viseeOuCourante().z > LOUPE_ZOOME ? 1 : LOUPE_DOUBLE, foyer);
  }
  function ancrer(ou: 'haut') {
    if (ou !== 'haut' || !actif || detache || mode !== 'aucun') return;
    const v = viseeOuCourante();
    if (!(v.z > LOUPE_ZOOME)) return;
    oublierGeo();
    const { contenu, zone: s } = geo();
    const page = pageAAncrer();
    if (!page) return;
    animerVers({ ...ancrerHaut(page, v.z, s, contenu), z: v.z });
  }
  function reinitialiser() {
    arreterAnims();
    pince = null;
    depl = null;
    mode = 'aucun';
    safari = null;
    if (roue != null) { clearTimeout(roue); roue = null; }
    for (const id of pointeurs.keys()) avales.add(id); // les doigts encore posés ne font plus rien
    lx.set(0);
    ly.set(0);
    lz.set(1);
    if (enGeste) repos();
    else {
      oublierGeo();
      publier();
    }
  }

  /** Oublie les pointeurs en cours ; un geste mené au doigt revient dans ses bornes. */
  function purger() {
    pointeurs.clear();
    avales.clear();
    if (mode === 'aucun') return;
    pince = null;
    depl = null;
    mode = 'aucun';
    oublierGeo();
    const { zone: s } = geo();
    animerVers(vueDeRepos(vue(), { x: s.x + s.w / 2, y: s.y + s.h / 2 }));
  }

  // ---- Écouteurs : pointeur ----
  const onDown = (e: PointerEvent) => {
    if (!actif || !e.isTrusted) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lireOrigine();
    // Un pointeur principal qui se pose : aucun autre doigt n'est encore là (un lâcher perdu ne
    // laisse pas un pincement fantôme).
    if (e.isPrimary && pointeurs.size) purger();
    const cible = e.target instanceof Element ? e.target : null;
    const p: Pointeur = {
      id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, x: e.clientX, y: e.clientY,
      cible, pts: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }], pince: false,
    };
    pointeurs.set(e.pointerId, p);
    if (pointeurs.size >= 2 && e.pointerType !== 'mouse') {
      if (mode !== 'pincer') {
        if (mode === 'deplacer') { depl = null; mode = 'aucun'; }
        demarrerPince();
      }
      return;
    }
    if (pointeurs.size !== 1) return;
    // Zoomé : le doigt (ou la souris) déplace la vue ; il rattrape une vue encore en mouvement.
    if (zoomeMaintenant() && !(cible && cible.closest('[data-gc-controle], button, a, input, select, textarea, [role="slider"]'))) {
      avales.add(e.pointerId);
      if (anims.length) {
        arreterAnims();
        oublierGeo();
      }
    }
  };

  const onMove = (e: PointerEvent) => {
    const p = pointeurs.get(e.pointerId);
    if (!p || !e.isTrusted) return;
    p.x = e.clientX;
    p.y = e.clientY;
    p.pts.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (p.pts.length > 2 && e.timeStamp - p.pts[0].t > FENETRE_MS * 2) p.pts.shift();
    if (!avales.has(e.pointerId)) return;
    // Le livre ne voit pas ce déplacement : il ne tourne jamais la page sous la loupe.
    e.stopImmediatePropagation();
    if (mode === 'pincer') majPince();
    else if (mode === 'deplacer' && depl?.id === e.pointerId) majDeplacement(p);
    else if (mode === 'aucun' && !p.pince && pointeurs.size === 1 && Math.hypot(p.x - p.x0, p.y - p.y0) >= SEUIL_GLISSER && zoomeMaintenant()) {
      demarrerDeplacement(p);
      majDeplacement(p);
    }
  };

  const onUp = (e: PointerEvent) => {
    const p = pointeurs.get(e.pointerId);
    if (!p || !e.isTrusted) return;
    pointeurs.delete(e.pointerId);
    avales.delete(e.pointerId);
    const annule = e.type === 'pointercancel';
    if (mode === 'pincer' && pince?.ids.includes(e.pointerId)) {
      gardeClic = e.timeStamp;
      const autre = pince.ids.find((i) => i !== e.pointerId);
      finPince(autre != null ? pointeurs.get(autre) : undefined);
      return;
    }
    if (mode === 'deplacer' && depl?.id === e.pointerId) {
      gardeClic = e.timeStamp;
      const v = annule ? { x: 0, y: 0 } : vitesse(p.pts, e.timeStamp);
      finDeplacement({ x: v.x / k, y: v.y / k });
      return;
    }
    if (!annule && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < SEUIL_GLISSER && e.timeStamp - p.t0 < TOUCHER_MAX_MS) toucher(p, e);
    // Une vue rattrapée au doigt puis lâchée sans glisser : elle revient dans ses bornes.
    if (enGeste && !anims.length && mode === 'aucun' && !pointeurs.size) {
      const { contenu, zone: s } = geo();
      animerVers(bornerVue(vue(), contenu, s));
    }
  };

  // Après un déplacement ou un pincement, le clic qui suit ne déclenche rien.
  const onClick = (e: MouseEvent) => {
    if (e.timeStamp - gardeClic < 400 && e.target instanceof Node && calque.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  // ---- Molette, pavé tactile ----
  const finRoue = () => {
    roue = null;
    const v = vue();
    const { contenu, zone: s } = geo();
    const b = bornerVue(v, contenu, s);
    if (Math.abs(b.x - v.x) > 0.5 || Math.abs(b.y - v.y) > 0.5 || Math.abs(b.z - v.z) > 1e-4) animerVers(b);
    else {
      lx.set(auPixel(v.x, dpr()));
      ly.set(auPixel(v.y, dpr()));
      repos();
    }
  };
  const onWheel = (e: WheelEvent) => {
    if (!actif) return;
    if (e.ctrlKey) {
      // Pincement du pavé tactile (Chrome, Firefox) ou ctrl + molette : zoom au curseur.
      e.preventDefault();
      if (safari) return;
      const dy = pxRoue(e.deltaY, e.deltaMode, vp.h);
      const f = Math.min(1.25, Math.max(0.8, Math.exp(-dy / 100)));
      const v = vue();
      const z = Math.min(LOUPE_MAX, Math.max(LOUPE_MIN, v.z * f));
      if (Math.abs(z - v.z) < 1e-4 && roue == null) return;
      if (roue == null) { arreterAnims(); oublierGeo(); }
      const { contenu, zone: s } = geo();
      const n = z <= 1 + 1e-4 ? { ...VUE_REPOS } : bornerVue(zoomFoyer(v, z, local(e.clientX, e.clientY)), contenu, s);
      debut();
      lx.set(n.x);
      ly.set(n.y);
      lz.set(n.z);
    } else if (zoomeMaintenant() && !safari) {
      // Molette seule, zoomé : déplacement (Maj : horizontal).
      e.preventDefault();
      let dx = pxRoue(e.deltaX, e.deltaMode, vp.w) / k;
      let dy = pxRoue(e.deltaY, e.deltaMode, vp.h) / k;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      if (roue == null) { arreterAnims(); oublierGeo(); }
      const { contenu, zone: s } = geo();
      const p = bornerPan({ x: lx.get() - dx, y: ly.get() - dy }, lz.get(), contenu, s);
      debut();
      lx.set(p.x);
      ly.set(p.y);
    } else return;
    if (roue != null) clearTimeout(roue);
    roue = window.setTimeout(finRoue, FIN_ROUE_MS);
  };

  // ---- Safari : pincement du pavé tactile (gesture*) ; sur iPhone, les doigts sont déjà suivis ----
  type GesteSafari = Event & { scale: number; clientX?: number; clientY?: number };
  const doigtsPoses = () => [...pointeurs.values()].some((p) => p.type === 'touch' || p.type === 'pen');
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    if (!actif || doigtsPoses()) return;
    const g = e as GesteSafari;
    lireOrigine();
    arreterAnims();
    oublierGeo();
    const { zone: s } = geo();
    const foyer = g.clientX != null && g.clientY != null ? local(g.clientX, g.clientY) : { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    safari = { v0: vue(), foyer };
    debut();
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    if (!safari) return;
    const v = zoomFoyer(safari.v0, zElastique(safari.v0.z * ((e as GesteSafari).scale || 1)), safari.foyer);
    lx.set(v.x);
    ly.set(v.y);
    lz.set(v.z);
  };
  const onGestureEnd = (e: Event) => {
    e.preventDefault();
    if (!safari) return;
    const f = safari.foyer;
    safari = null;
    animerVers(vueDeRepos(vue(), f));
  };

  // ---- Clavier (zoomé) : flèches, Échap / Retour arrière ----
  function pasClavier(dx: number, dy: number): boolean {
    oublierGeo();
    const { contenu, zone: s } = geo();
    const base = viseeOuCourante();
    const b = bornesPan(base.z, contenu, s);
    const nx = borne(base.x - dx * PAS_CLAVIER * s.w, b.x);
    const ny = borne(base.y - dy * PAS_CLAVIER * s.h, b.y);
    // Au bord, ← → ne sont pas consommées : le livre tourne la page (la loupe reste).
    if (dx && Math.abs(nx - base.x) < 1) return false;
    animerVers({ x: nx, y: ny, z: base.z });
    return true;
  }
  const onKey = (e: KeyboardEvent) => {
    if (!globale || !actif || detache || clavierModalActif()) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.getAttribute('role') === 'slider')) return;
    if (!(viseeOuCourante().z > LOUPE_ZOOME) || mode !== 'aucun') return;
    let pris = false;
    switch (e.key) {
      case 'Escape':
      case 'Backspace':
        demander(1);
        pris = true;
        break;
      case 'ArrowLeft': pris = pasClavier(-1, 0); break;
      case 'ArrowRight': pris = pasClavier(1, 0); break;
      case 'ArrowUp': pasClavier(0, -1); pris = true; break;
      case 'ArrowDown': pasClavier(0, 1); pris = true; break;
      default:
    }
    if (pris) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  // ---- Zoom du navigateur : la loupe se retire ----
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const onVV = () => {
    const zoomNavigateur = !!vv && vv.scale > 1.01;
    if (zoomNavigateur === !actif) return;
    actif = !zoomNavigateur;
    racine.toggleAttribute('data-gc-loupe-navigateur', zoomNavigateur);
    if (zoomNavigateur) reinitialiser();
  };

  // ---- Branchements ----
  const opt = { capture: true } as const;
  calque.addEventListener('pointerdown', onDown, opt);
  window.addEventListener('pointermove', onMove, opt);
  window.addEventListener('pointerup', onUp, opt);
  window.addEventListener('pointercancel', onUp, opt);
  window.addEventListener('click', onClick, opt);
  calque.addEventListener('wheel', onWheel, { passive: false });
  calque.addEventListener('gesturestart', onGestureStart, { passive: false });
  calque.addEventListener('gesturechange', onGestureChange, { passive: false });
  calque.addEventListener('gestureend', onGestureEnd, { passive: false });
  if (globale) window.addEventListener('keydown', onKey, opt);
  vv?.addEventListener('resize', onVV);
  onVV();
  // Un nouveau contrôleur part de 1× : l'état partagé le dit (un écran remonté ne reste pas « zoomé »).
  if (globale && getLoupe().z !== 1) majLoupe({ z: 1, cote: null });
  {
    const d = Number(livreEcran()?.getAttribute('data-gc-double'));
    if (Number.isFinite(d)) dernierDouble = d;
  }

  return {
    demander,
    ancrer,
    vise: () => viseeOuCourante().z,
    basculer: () => basculerAu(),
    reinitialiser,
    majVp(n: Viewport) {
      const avant = vp;
      vp = n;
      oublierGeo();
      const tourne = (avant.w > avant.h) !== (n.w > n.h) || avant.cadrage !== n.cadrage;
      if (tourne) {
        // Zoomé au repos : la loupe garde son facteur et le texte lu ; on la recale tout de suite, puis
        // deux images plus tard (le livre a pu changer de page affichée, la mise en page est posée).
        const a = !enGeste && mode === 'aucun' && zoomeMaintenant() ? ancre : null;
        if (!a) {
          reinitialiser();
          return;
        }
        reprendre(a);
        requestAnimationFrame(() => requestAnimationFrame(() => reprendre(a)));
        return;
      }
      if (enGeste || !(lz.get() > 1 + 1e-4)) return;
      // Nouvelle taille ou nouvelles zones sûres : la vue reste dans ses bornes.
      const { contenu, zone: s } = geo();
      const p = bornerPan(vue(), lz.get(), contenu, s);
      lx.set(auPixel(p.x, dpr()));
      ly.set(auPixel(p.y, dpr()));
      oublierGeo();
    },
    detacher() {
      detache = true;
      arreterAnims();
      if (roue != null) clearTimeout(roue);
      calque.removeEventListener('pointerdown', onDown, opt);
      window.removeEventListener('pointermove', onMove, opt);
      window.removeEventListener('pointerup', onUp, opt);
      window.removeEventListener('pointercancel', onUp, opt);
      window.removeEventListener('click', onClick, opt);
      calque.removeEventListener('wheel', onWheel);
      calque.removeEventListener('gesturestart', onGestureStart);
      calque.removeEventListener('gesturechange', onGestureChange);
      calque.removeEventListener('gestureend', onGestureEnd);
      if (globale) window.removeEventListener('keydown', onKey, opt);
      vv?.removeEventListener('resize', onVV);
      if (enGeste && globale) signalerGesteLoupe('fin');
      if (globale) majLoupe({ z: 1, cote: null }); // l'Ecran remet son calque à 1×
      calque.style.willChange = '';
      racine.removeAttribute('data-gc-loupe-geste');
      racine.removeAttribute('data-gc-loupe-navigateur');
    },
  };
}
