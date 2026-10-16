import React from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Stage } from '../Stage';
import { useEcran } from '../Ecran/contexte';
import { useCamera } from '../../lib/camera';
import type { Distance } from '../../lib/settings';
import type { RenderMode, SpreadSpec } from '../../lib/spread';
import { LazyMotion, SPRINGS, animate, domMax, m, useMotionValue, useReducedMotion, useTransform } from '../../lib/motion';
import { cadrerDouble, cadrerPage, centrePage, debordNecessaire, partScene, translationMonde, type CadreCamera, type GeometrieLivre } from '../../lib/viewport';
import { Camera } from './Camera';
import { Face, type Cote } from './Face';
import { Feuillet, FeuilletCouverture, Portees } from './Feuillet';
import { Fleches } from './Fleches';
import { PointsPage } from './PointsPage';
import { RepereDistance } from './RepereDistance';
import { TOUCHER_EVENT, cadenceStable, emettre, pret, type GesteType, type ToucherPage } from './evenements';
import { CARTON, PLANCHER, clamp, lisse, r3, reculCouverture } from './geometrie';
import { MARGE_TOUCHER, SEUIL_AMORCE, SEUIL_GLISSER, SEUIL_P, TOUCHER_MAX_MS, VIF, elastique, entreElastique, garder, pElastique, vitesse, type Echantillon } from './doigt';
import './Livre.css';

export type { ToucherPage };

/** Page cadrée d'une double page, en cadrage « page » (téléphone, tablette debout). */
export type CotePage = 'gauche' | 'droite';

export interface LivrePose {
  /** Double page visée (index dans spreads, −1 = couverture fermée). */
  vers: number;
  /** Avancée du geste, de 0 (départ) à 1 (arrivée). */
  p: number;
}

export interface LivreProps {
  /** Les doubles pages, dans l'ordre. */
  spreads: SpreadSpec[];
  /** Double page affichée (0 = la première). Avec `cover`, −1 = livre fermé sur sa couverture. */
  index: number;
  /** Appelé quand une double page est atteinte (à la fin du geste). */
  onIndexChange?: (i: number) => void;
  /** Écoute ←/→, PageUp/PageDown (télécommandes de présentation), Début/Fin. */
  keyboard?: boolean;
  /** Plat de couverture : le livre s'ouvre depuis lui (index −1). */
  cover?: React.ReactNode;
  className?: string;
  /** Fige un tourne-page (aperçus, captures à mi-geste) : aucun mouvement, aucun clavier. */
  pose?: LivrePose;
  /** Cadrage « page » (dans un <Ecran> en portrait) : page cadrée au départ. Défaut : gauche. */
  coteInitial?: CotePage;
  /**
   * Toucher (ou clic) sur une page, sans glisser (lecture / pause d'une vidéo…). Renvoyer true consomme
   * le toucher (pas de navigation par la marge). Appelé dans le geste : play() y est permis (iOS).
   */
  onToucherPage?: (t: ToucherPage) => boolean | void;
  /** Gestes au pointeur : glisser pour tourner, toucher les marges. Défaut : true. */
  gestes?: boolean;
}

interface Tour {
  id: number;
  /** Double page « basse » (recto du feuillet = sa page de droite). −1 = couverture. */
  lo: number;
  /** Double page « haute » (verso du feuillet = sa page de gauche). */
  hi: number;
  /** Cible du ressort : 0 = revenir sur lo, 1 = arriver sur hi. */
  but: 0 | 1;
  /** −1 en avançant, +1 en reculant (sens de la flexion, fixé pour le feuillet). */
  sens: 1 | -1;
  couverture: boolean;
  /** Le ressort est parti (pré-rendu terminé), ou le doigt a lâché la feuille. */
  lance: boolean;
  /** Cadrage « page » : page cadrée quand la feuille est posée sur lo (p = 0) / sur hi (p = 1). */
  coteLo: CotePage;
  coteHi: CotePage;
  /** Le doigt tient la feuille : il pilote p, aucun ressort. */
  doigt: boolean;
}

/** Un pointeur posé sur le livre (doigt, stylet, souris). */
interface Doigt {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  etat: 'attente' | 'tour' | 'glisse' | 'rebond' | 'ignore';
  /** Ce que fera le glisser, décidé dès SEUIL_AMORCE (le feuillet est monté à ce moment). */
  intention: 'tour' | 'glisse' | 'rebond' | 'pas' | null;
  /** Sens du glisser : −1 vers la gauche (avancer), +1 vers la droite (reculer). */
  dir: 0 | 1 | -1;
  /** Largeur d'une page à l'écran (px) et px d'écran par px de scène. */
  L: number;
  k: number;
  p0: number;
  g0: number;
  r0: number;
  /** Le doigt rattrape un mouvement déjà lancé (clavier, ou glisser précédent). */
  reprise: boolean;
  /** Feuillet monté par ce doigt et pas encore lâché. */
  amorce: Tour | null;
  coteDepart: CotePage;
  pts: Echantillon[];
}

/** Lance une transition de vue (repli : application immédiate) et l'annonce comme un geste. */
function transitionDeVue(type: GesteType, maj: () => void, livre: HTMLElement | null, nommer: boolean): void {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    maj();
    return;
  }
  const root = document.documentElement;
  root.setAttribute('data-gc-livre-vt', type);
  if (nommer && livre) livre.setAttribute('data-gc-vt', '');
  emettre(livre, 'prepa', type);
  const vt = document.startViewTransition(maj);
  // Le mouvement commence quand les captures sont prêtes (avant, l'écran est figé sur l'ancien état).
  vt.ready.then(() => emettre(livre, 'debut', type), () => emettre(livre, 'debut', type));
  vt.finished.finally(() => {
    if (root.getAttribute('data-gc-livre-vt') === type) root.removeAttribute('data-gc-livre-vt');
    if (nommer && livre) livre.removeAttribute('data-gc-vt');
    emettre(livre, 'fin', type);
  });
}

/** Géométrie du cran affiché, lue sur le livre (avant un geste, jamais pendant). */
function lireGeometrie(el: HTMLElement): GeometrieLivre {
  const cs = getComputedStyle(el);
  const v = (k: string, d = 0) => parseFloat(cs.getPropertyValue(k)) || d;
  return {
    W: v('--gc-page-w'),
    H: v('--gc-page-h'),
    bookX: v('--gc-book-x'),
    bookY: v('--gc-book-y'),
    stageW: v('--gc-stage-w', 1920),
    stageH: v('--gc-stage-h', 1080),
    carton: { out: CARTON.out, haut: CARTON.haut, bas: CARTON.bas },
  };
}
const memeGeo = (a: GeometrieLivre | null, b: GeometrieLivre) =>
  !!a && a.W === b.W && a.H === b.H && a.bookX === b.bookX && a.bookY === b.bookY && a.stageW === b.stageW && a.stageH === b.stageH;

const SUR_CONTROLE = 'button, a, input, select, textarea, [role="button"], [data-gc-controle]';
const surControle = (t: EventTarget | null) => t instanceof Element && !!t.closest(SUR_CONTROLE);

/** Une page posée dans un emplacement fixe : toujours montée, visible ou non. */
const Emplacement = React.memo(function Emplacement({ spread, side, mode, visible }: { spread: SpreadSpec; side: Cote; mode: RenderMode; visible: boolean }) {
  return (
    <div className={`gc-livre__page${visible ? ' gc-livre__page--visible' : ''}`} aria-hidden={visible ? undefined : true}>
      <Face spread={spread} side={side} mode={mode} />
    </div>
  );
});

function Tranche({ side, n }: { side: 'gauche' | 'droite'; n: number }) {
  return (
    <div className={`gc-livre__tranche gc-livre__tranche--${side}`} aria-hidden="true">
      {[4, 3, 2, 1].map((k) => (
        <div key={k} className={`gc-livre__feuille gc-livre__feuille--${k}${k <= n ? '' : ' gc-livre__feuille--absente'}`} />
      ))}
    </div>
  );
}

// Le carnet qui se feuillette : emplacements fixes gauche/droite, un feuillet 3D qui tourne,
// une couverture qui s'ouvre, une caméra (cran de distance + zoom fin) et deux flèches.
// Dans un <Ecran> : la scène est mise à l'échelle de l'écran (cadrage « double » ou « page »), la
// caméra glisse d'une page à l'autre et suit la feuille qui tourne, les contrôles passent en px d'écran.
export function Livre({ spreads, index, onIndexChange, keyboard = false, cover, className, pose, coteInitial = 'gauche', onToucherPage, gestes = true }: LivreProps) {
  const camera = useCamera();
  const ecran = useEcran();
  const vp = ecran?.vp ?? null;
  const enEcran = !!ecran;
  const modePage = !!vp && vp.cadrage === 'page';
  const reduced = !!useReducedMotion();
  const n = spreads.length;
  const min = cover != null ? -1 : 0;
  const max = Math.max(min, n - 1);
  const borne = React.useCallback((i: number) => Math.round(clamp(i, min, max)), [min, max]);

  const [affiche, setAffiche] = React.useState(() => borne(index));
  const [tour, setTour] = React.useState<Tour | null>(null);
  // Quand la page (cadrage « page ») ou le livre (petit écran couché) remplit l'écran, la caméra ne
  // peut plus avancer : le cran ne change plus le cadrage, seulement la mise en page. On prend alors la
  // mise en page « loin », dont la hauteur d'x est la plus grande par rapport à la page (15/750 contre
  // 15/896 au cran proche : +19 % à l'écran). Les crans ne servent qu'en cadrage « double » sur un
  // grand écran (la composition de la TV).
  const cameraFixe = !!vp && (modePage || partScene(vp) < 1);
  const cranVoulu: Distance = cameraFixe ? 'loin' : camera.distance;
  const [distance, setDistance] = React.useState<Distance>(cranVoulu);
  const [cote, setCote] = React.useState<CotePage>(coteInitial);
  const [geo, setGeo] = React.useState<GeometrieLivre | null>(null);

  // LA MotionValue du geste : 0 = feuillet à plat à droite, 1 = à plat à gauche.
  const p = useMotionValue(0);
  const fondu = useMotionValue(1);
  /** Cadrage « page », au repos : abscisse (scène) du centre de la caméra. */
  const glisse = useMotionValue(0);
  /** Butée au doigt : le livre résiste (px de scène). */
  const rebond = useMotionValue(0);
  const livreRef = React.useRef<HTMLDivElement>(null);
  const espaceRef = React.useRef<HTMLDivElement>(null);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const mondeRef = React.useRef<HTMLDivElement>(null);
  const afficheRef = React.useRef(affiche);
  const cibleRef = React.useRef(affiche);
  const coteRef = React.useRef<CotePage>(coteInitial);
  const coteCibleRef = React.useRef<CotePage>(coteInitial);
  const tourRef = React.useRef<Tour | null>(null);
  const animRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const animSeq = React.useRef(0);
  const glisseAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const glisseSeq = React.useRef(0);
  const doigtRef = React.useRef<Doigt | null>(null);
  const seq = React.useRef(0);
  /** Dernier index annoncé au parent : son écho (prop index) ne doit pas écraser la cible. */
  const echo = React.useRef<number | null>(null);
  /** Géométrie du cran (px de scène), lue sur le livre avant chaque geste de couverture. */
  const geoRef = React.useRef<GeometrieLivre | null>(null);
  const zoomRef = React.useRef(camera.zoom);
  zoomRef.current = vp && (vp.cadrage === 'page' || partScene(vp) < 1) ? 1 : camera.zoom;
  const modePageRef = React.useRef(modePage);
  modePageRef.current = modePage;
  const vivant = React.useRef({ reduced, onIndexChange, onToucherPage });
  vivant.current = { reduced, onIndexChange, onToucherPage };

  React.useLayoutEffect(() => { afficheRef.current = affiche; }, [affiche]);
  React.useEffect(() => () => { animSeq.current++; animRef.current?.stop(); glisseSeq.current++; glisseAnim.current?.stop(); }, []);

  // Lecture de la géométrie du cran (avant un geste, jamais pendant).
  const mesurer = React.useCallback(() => {
    const el = livreRef.current;
    if (!el) return;
    const g = lireGeometrie(el);
    if (!memeGeo(geoRef.current, g)) {
      geoRef.current = g;
      setGeo(g);
    }
  }, []);
  React.useLayoutEffect(() => { mesurer(); }, [distance, mesurer]);

  /** Abscisse (scène) du centre de la caméra quand elle cadre la page `c` de la double page `i`. */
  const X = React.useCallback((i: number, c: CotePage): number => {
    const g = geoRef.current;
    return g ? centrePage(g, i < 0 ? 'couverture' : c) : 0;
  }, []);

  // ---- Fin d'un geste : la double page atteinte devient la double page affichée -------------
  const atterrir = React.useCallback((T: Tour) => {
    if (tourRef.current !== T) return;
    animRef.current = null;
    tourRef.current = null;
    const nouvel = T.but === 1 ? T.hi : T.lo;
    const coteNouveau = T.but === 1 ? T.coteHi : T.coteLo;
    const avant = afficheRef.current;
    const el = livreRef.current;
    if (el) el.removeAttribute('data-gc-geste');
    emettre(el, 'fin', T.couverture ? 'couverture' : 'page');
    // La double page logique change tout de suite : la mise à jour d'une transition de vue est
    // asynchrone, et le parent peut renvoyer l'index (onIndexChange) avant qu'elle ne s'applique.
    afficheRef.current = nouvel;
    coteRef.current = coteNouveau;
    glisse.set(X(nouvel, coteNouveau));
    setAffiche(nouvel);
    setTour(null);
    setCote(coteNouveau);
    const cb = vivant.current.onIndexChange;
    if (nouvel !== avant) { echo.current = nouvel; cb?.(nouvel); }
  }, [glisse, X]);

  // ---- Ressort : lancé, ou relancé vers une nouvelle cible (vitesse conservée) --------------
  const lancer = React.useCallback((T: Tour, velocity?: number) => {
    animRef.current?.stop();
    const id = ++animSeq.current;
    animRef.current = animate(p, T.but, {
      ...(T.couverture ? SPRINGS.cover : SPRINGS.paper),
      ...(velocity != null ? { velocity } : null),
      onComplete: () => { if (animSeq.current === id) atterrir(T); },
    });
  }, [p, atterrir]);

  const pousserRef = React.useRef<() => void>(() => {});

  // ---- Cadrage « page » : la caméra glisse d'une page à l'autre (SPRINGS.camera) -------------
  const glisser = React.useCallback((c: CotePage, velocity = 0, annoncer = true) => {
    const x = X(afficheRef.current, c);
    coteRef.current = c;
    setCote(c);
    glisseAnim.current?.stop();
    const id = ++glisseSeq.current;
    const el = livreRef.current;
    if (vivant.current.reduced || !modePageRef.current) {
      glisseAnim.current = null;
      glisse.set(x);
      return;
    }
    if (annoncer) emettre(el, 'debut', 'glisse');
    glisseAnim.current = animate(glisse, x, {
      ...SPRINGS.camera,
      velocity,
      onComplete: () => {
        if (glisseSeq.current !== id) return;
        glisseAnim.current = null;
        emettre(el, 'fin', 'glisse');
        pousserRef.current();
      },
    });
  }, [glisse, X]);

  // ---- Moteur : rapproche la page affichée de la cible, sans jamais empiler -------------------
  const pousser = React.useCallback(() => {
    const T = tourRef.current;
    const cible = cibleRef.current;
    if (T) {
      if (T.doigt) return; // le doigt tient la feuille
      const but: 0 | 1 = cible <= T.lo ? 0 : cible >= T.hi ? 1 : T.but;
      if (but !== T.but) {
        T.but = but;
        if (T.lance) lancer(T);
      }
      return;
    }
    const d = doigtRef.current;
    if (d && d.etat !== 'attente' && d.etat !== 'ignore') return; // le doigt mène
    const de = afficheRef.current;
    if (glisseAnim.current) {
      // Glissement en cours : on peut changer de côté ; le reste attendra la fin du glissement.
      if (cible === de && coteCibleRef.current !== coteRef.current) glisser(coteCibleRef.current);
      return;
    }
    if (cible === de) {
      if (modePageRef.current && de >= 0 && coteRef.current !== coteCibleRef.current) glisser(coteCibleRef.current);
      return;
    }
    const coteCible = coteCibleRef.current;
    if (vivant.current.reduced) {
      // Moins de mouvement : fondu court, sans courbure. La double page logique change tout de
      // suite (la mise à jour de la transition de vue est asynchrone).
      afficheRef.current = cible;
      const c: CotePage = modePageRef.current ? coteCible : 'gauche';
      coteRef.current = c;
      const appliquer = () => { setAffiche(cible); setCote(c); glisse.set(X(cible, c)); };
      transitionDeVue('fondu', () => flushSync(appliquer), livreRef.current, false);
      echo.current = cible;
      vivant.current.onIndexChange?.(cible);
      return;
    }
    // La couverture s'ouvre toujours sur la première double page (et s'y referme).
    let vers = cible;
    if (de === -1) vers = 0;
    else if (cible === -1 && de > 0) vers = 0;
    const avance = vers > de;
    const lo = Math.min(de, vers);
    const actuel = coteRef.current;
    const arrivee: CotePage = modePageRef.current && vers === cible ? coteCible : 'gauche';
    const nouveau: Tour = {
      id: ++seq.current, lo, hi: Math.max(de, vers), but: avance ? 1 : 0, sens: avance ? -1 : 1, couverture: lo === -1, lance: false,
      coteLo: avance ? actuel : arrivee, coteHi: avance ? arrivee : actuel, doigt: false,
    };
    tourRef.current = nouveau;
    p.set(avance ? 0 : 1);
    setTour(nouveau);
  }, [lancer, p, glisser, glisse, X]);
  pousserRef.current = pousser;

  /** Va à la double page i, page c (cadrage « page »). */
  const allerA = React.useCallback((i: number, c: CotePage) => {
    const d = doigtRef.current;
    if (d && d.etat !== 'attente' && d.etat !== 'ignore') return; // pas de clavier sous le doigt
    cibleRef.current = borne(i);
    coteCibleRef.current = c;
    pousser();
  }, [borne, pousser]);

  /** Va à la double page i (page de gauche si elle change ; le côté est gardé sinon). */
  const aller = React.useCallback((i: number) => {
    const b = borne(i);
    if (b === cibleRef.current) { pousser(); return; }
    allerA(b, 'gauche');
  }, [borne, allerA, pousser]);

  /** Page suivante / précédente : une double page en cadrage « double », une page en cadrage « page ». */
  const pas = React.useCallback((dir: 1 | -1) => {
    let i = cibleRef.current;
    let c = coteCibleRef.current;
    if (!modePageRef.current) { allerA(i + dir, 'gauche'); return; }
    if (i < 0) {
      if (dir < 0) return;
      i = 0; c = 'gauche';
    } else if (dir > 0) {
      if (c === 'gauche') c = 'droite';
      else if (i < max) { i += 1; c = 'gauche'; }
      else return;
    } else if (c === 'droite') c = 'gauche';
    else if (i > 0) { i -= 1; c = 'droite'; }
    else if (min < 0) i = -1;
    else return;
    allerA(i, c);
  }, [allerA, max, min]);

  // Pré-rendu terminé (images décodées, polices prêtes, 300 ms au plus ; calques rastérisés,
  // cadence revenue régulière) → le ressort part. Un feuillet tenu au doigt n'attend pas : le doigt
  // pilote p tout de suite, le ressort ne partira qu'au lâcher.
  React.useLayoutEffect(() => {
    const T = tour;
    if (!T || T.lance || pose) return;
    let annule = false;
    const el = livreRef.current;
    if (el) {
      el.setAttribute('data-gc-geste', T.couverture ? 'couverture' : 'page');
      if (T.couverture) mesurer();
    }
    pret(espaceRef.current)
      .then(() => (T.doigt ? undefined : cadenceStable()))
      .then(() => {
        if (annule || tourRef.current !== T || T.lance || T.doigt) return;
        T.lance = true;
        emettre(el, 'debut', T.couverture ? 'couverture' : 'page');
        lancer(T);
      });
    return () => {
      annule = true;
      // Geste abandonné avant d'avoir commencé : rien ne doit rester « en cours ».
      if (!T.lance) {
        if (tourRef.current === T) tourRef.current = null;
        el?.removeAttribute('data-gc-geste');
      }
    };
  }, [tour, lancer, pose, mesurer]);

  // Enchaînement : un geste fini, on repart si la cible a encore bougé.
  React.useEffect(() => { if (!tour && !pose) pousser(); }, [tour, affiche, cote, pousser, pose]);

  // Index imposé par le parent (sauf l'écho de ce que le livre vient d'annoncer).
  React.useEffect(() => {
    if (pose) return;
    if (echo.current !== null && index === echo.current) return;
    echo.current = null;
    aller(index);
  }, [index, aller, pose]);

  // Livre fermé au repos : la couverture est à plat (p = 0).
  React.useLayoutEffect(() => { if (!tour && !pose && affiche === -1) p.set(0); }, [tour, affiche, pose, p]);

  // ---- Clavier ---------------------------------------------------------------------------
  React.useEffect(() => {
    if (!keyboard || pose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': e.preventDefault(); pas(1); break;
        case 'ArrowLeft': case 'PageUp': e.preventDefault(); pas(-1); break;
        case 'Home': e.preventDefault(); allerA(min, 'gauche'); break;
        case 'End': e.preventDefault(); allerA(max, 'gauche'); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, pose, pas, allerA, min, max]);

  // ---- Caméra : changement de cran = vraie mise en page, en transition de vue -------------
  // (une rotation de l'écran change de cadrage, donc de cran : appliqué tout de suite).
  const cadragePrecedent = React.useRef(cameraFixe);
  React.useEffect(() => {
    const next = cranVoulu;
    const rotation = cadragePrecedent.current !== cameraFixe;
    cadragePrecedent.current = cameraFixe;
    if (next === distance) return;
    const el = livreRef.current;
    const appliquer = () => setDistance(next);
    if (rotation) { appliquer(); return; }
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      transitionDeVue('distance', () => flushSync(appliquer), el, !reduced);
      return;
    }
    // Repli sans View Transitions : fondu sortant, nouvelle mise en page, fondu entrant.
    emettre(el, 'debut', 'distance');
    const a = animate(fondu, 0, {
      ...SPRINGS.camera,
      onComplete: () => {
        flushSync(appliquer);
        animate(fondu, 1, { ...SPRINGS.camera, onComplete: () => emettre(el, 'fin', 'distance') });
      },
    });
    return () => a.stop();
  }, [cranVoulu, distance, reduced, fondu, cameraFixe]);

  // ---- Pose figée (aperçus, captures à mi-geste) ------------------------------------------
  const poseVers = pose?.vers;
  const tourPose = React.useMemo<Tour | null>(() => {
    if (poseVers == null) return null;
    const de = affiche;
    let vers = borne(poseVers);
    if (vers === de) return null;
    if (de === -1) vers = 0;
    else if (vers === -1 && de > 0) vers = 0;
    const avance = vers > de;
    const lo = Math.min(de, vers);
    const c = coteRef.current;
    return {
      id: -1, lo, hi: Math.max(de, vers), but: avance ? 1 : 0, sens: avance ? -1 : 1, couverture: lo === -1, lance: true,
      coteLo: avance ? c : 'droite', coteHi: avance ? 'gauche' : c, doigt: false,
    };
  }, [poseVers, affiche, borne]);
  const poseP = pose?.p;

  // ---- Ce qui est monté --------------------------------------------------------------------
  const T = pose ? tourPose : tour;
  const couv = T ? T.couverture : affiche === -1;
  const feuille = T ?? (affiche === -1 ? { id: 0, lo: -1, hi: 0, sens: -1 as const, couverture: true } : null);

  // Mouvement de caméra de l'ouverture : livre fermé centré → cadrage ouvert ; la caméra recule juste
  // ce qu'il faut quand la couverture se dresse (elle ne dépasse jamais sa taille au repos).
  const livreT = useTransform(p, (v) => {
    if (!couv) return 'none';
    const t = clamp(v, 0, 1);
    const g = geoRef.current;
    return `translateX(${r3(-25 * (1 - t))}%) scale(${r3(reculCouverture(v, g?.W ?? 0, g?.H ?? 0, zoomRef.current))})`;
  });
  // (plancher : un calque à opacité nulle ne serait peint et rastérisé qu'en plein geste)
  const ombreGauche = useTransform(p, (v) => (couv ? Math.max(PLANCHER, lisse(0.55, 1, v)) : 1));
  // Livre fermé : il est épais, son ombre est plus dense ; elle s'allège quand la couverture se lève.
  const ombreEpaisseur = useTransform(p, (v) => (couv ? 1 - lisse(0, 0.45, v) : 0));

  // ---- Écran : cadrage, table plein écran, caméra qui suit la feuille ------------------------
  const cadre = React.useMemo<CadreCamera | null>(() => {
    if (!vp || !geo) return null;
    return modePage ? cadrerPage(vp, geo) : cadrerDouble(vp, geo);
  }, [vp, geo, modePage]);
  const debord = React.useMemo(() => {
    if (!vp || !geo || !cadre) return 0;
    const xs = modePage ? [centrePage(geo, 'couverture'), centrePage(geo, 'gauche'), centrePage(geo, 'droite')] : [cadre.cx];
    return debordNecessaire(vp, cadre, xs, geo);
  }, [vp, geo, cadre, modePage]);
  const dpr = vp?.dpr ?? 1;

  // Abscisse de la caméra (scène) : au repos, la page cadrée (glisse) ; pendant un tourne-page en
  // cadrage « page », elle suit la feuille (dérivée de p : centre apparent de la feuille, de la page
  // quittée à la page d'arrivée).
  const camX = useTransform([p, glisse], ([pv, gv]: number[]) => {
    if (!cadre) return 0;
    if (!modePage) return cadre.cx;
    if (T && geoRef.current) {
      const x0 = X(T.lo, T.coteLo);
      const x1 = X(T.hi, T.coteHi);
      return x0 + ((x1 - x0) * (1 - Math.cos(Math.PI * clamp(pv, 0, 1)))) / 2;
    }
    return gv;
  });
  const transformMonde = React.useCallback((x: number) => {
    if (!cadre) return 'none';
    const { tx, ty } = translationMonde(cadre, x, dpr);
    return `translate(${tx}px, ${ty}px) scale(${cadre.s})`;
  }, [cadre, dpr]);
  const mondeT = useTransform(camX, transformMonde);

  // Au repos (et à chaque changement d'écran) : la caméra se pose sur la page affichée, écrite tout de
  // suite (le prochain passage de Motion n'aurait lieu qu'après la première image).
  React.useLayoutEffect(() => {
    if (!enEcran || !cadre) return;
    if (tourRef.current || glisseAnim.current) return;
    const d = doigtRef.current;
    if (d && d.etat !== 'attente' && d.etat !== 'ignore') return;
    const x = modePage ? X(affiche, cote) : cadre.cx;
    glisse.set(X(affiche, cote));
    if (mondeRef.current) mondeRef.current.style.transform = transformMonde(x);
  }, [enEcran, cadre, affiche, cote, modePage, glisse, X, transformMonde]);

  // Cadrage « page » : la caméra se déplace à chaque page ; le monde est un calque composité, rastérisé
  // à l'échelle de l'écran (rendu net). À chaque changement d'échelle, on le laisse se repeindre puis on
  // le promeut de nouveau (sinon il garderait sa trame d'avant, floue).
  React.useLayoutEffect(() => {
    const el = mondeRef.current;
    if (!el || !modePage || !cadre) return;
    el.style.willChange = '';
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => { el.style.willChange = 'transform'; }); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); el.style.willChange = ''; };
  }, [modePage, cadre?.s]);

  // Pose figée : posée après les useTransform ci-dessus (abonnés dans leurs propres effets).
  React.useLayoutEffect(() => {
    if (tourPose && poseP != null) p.set(tourPose.but === 1 ? poseP : 1 - poseP);
  }, [tourPose, poseP, p]);

  // ---- Gestes au pointeur (doigt, stylet, souris) ---------------------------------------------
  const actions = React.useRef({ pas, glisser, lancer });
  actions.current = { pas, glisser, lancer };
  React.useEffect(() => {
    if (!gestes || pose) return;
    const surface = enEcran ? surfaceRef.current : (livreRef.current?.closest('.gc-stage') as HTMLElement | null);
    if (!surface) return;
    let gardeClic = -1e9;
    let dernierType = 'mouse';

    const pageAEcran = () => {
      const slot = livreRef.current?.querySelector('.gc-livre__emplacement--droite');
      return slot ? slot.getBoundingClientRect().width : 0;
    };

    // Le feuillet est monté dès que le sens du glisser se dessine (comme la préparation clavier) :
    // il est prêt quand le glisser est décidé. Rien n'est monté pour un simple toucher.
    const amorcer = (d: Doigt) => {
      if (tourRef.current) { d.reprise = true; d.intention = 'tour'; return; }
      if (glisseAnim.current) { d.reprise = true; d.intention = 'glisse'; return; }
      if (vivant.current.reduced) { d.intention = 'pas'; return; }
      const a = afficheRef.current;
      const page = modePageRef.current;
      const c = coteRef.current;
      if (page && a >= 0 && ((d.dir < 0 && c === 'gauche') || (d.dir > 0 && c === 'droite'))) { d.intention = 'glisse'; return; }
      const vers = d.dir < 0 ? a + 1 : a - 1;
      if (vers < min || vers > max) { d.intention = 'rebond'; return; }
      const avance = vers > a;
      const lo = Math.min(a, vers);
      const arrivee: CotePage = page && !avance ? 'droite' : 'gauche';
      const nouveau: Tour = {
        id: ++seq.current, lo, hi: Math.max(a, vers), but: avance ? 1 : 0, sens: avance ? -1 : 1, couverture: lo === -1, lance: false,
        coteLo: avance ? c : arrivee, coteHi: avance ? arrivee : c, doigt: true,
      };
      tourRef.current = nouveau;
      p.set(avance ? 0 : 1);
      d.amorce = nouveau;
      d.intention = 'tour';
      setTour(nouveau);
    };

    const annulerAmorce = (d: Doigt) => {
      const T0 = d.amorce;
      d.amorce = null;
      d.intention = null;
      d.reprise = false;
      if (!T0 || T0.lance) return;
      if (tourRef.current === T0) tourRef.current = null;
      livreRef.current?.removeAttribute('data-gc-geste');
      setTour(null);
    };

    const demarrer = (d: Doigt) => {
      const el = livreRef.current;
      if (d.intention === 'pas') {
        d.etat = 'ignore';
        actions.current.pas(d.dir < 0 ? 1 : -1);
        return;
      }
      if (d.intention === 'tour') {
        const T0 = tourRef.current;
        if (!T0) { d.etat = 'ignore'; return; }
        // Le doigt rattrape la feuille (ressort en cours, ou feuillet en préparation) : plus de ressort.
        if (animRef.current) { animSeq.current++; animRef.current.stop(); animRef.current = null; }
        const deja = T0.lance;
        T0.doigt = true;
        d.p0 = p.get();
        d.etat = 'tour';
        if (!deja) emettre(el, 'debut', T0.couverture ? 'couverture' : 'page');
        return;
      }
      if (d.intention === 'glisse') {
        glisseSeq.current++;
        glisseAnim.current?.stop();
        glisseAnim.current = null;
        d.g0 = glisse.get();
        d.etat = 'glisse';
        emettre(el, 'debut', 'glisse');
        return;
      }
      d.etat = 'rebond';
      d.r0 = rebond.get();
      const cam = el?.parentElement;
      if (cam) cam.style.willChange = 'transform';
      emettre(el, 'debut', 'rebond');
    };

    const piloter = (d: Doigt, dx: number) => {
      if (d.etat === 'tour') p.set(pElastique(d.p0 - dx / d.L));
      else if (d.etat === 'glisse') {
        const a = afficheRef.current;
        const xg = X(a, 'gauche');
        const xd = X(a, 'droite');
        glisse.set(entreElastique(d.g0 - dx / d.k, xg, xd, (xd - xg) * 0.08));
      } else if (d.etat === 'rebond') rebond.set(d.r0 + elastique((dx / d.k) * 0.5, 40));
    };

    const relacherTour = (d: Doigt, v: number) => {
      const T0 = tourRef.current;
      if (!T0) return;
      const pv = p.get();
      const vp = -v / d.L; // largeurs de page par seconde, + vers hi
      let but: 0 | 1;
      if (Math.abs(vp) >= VIF) but = vp > 0 ? 1 : 0;
      else if (d.reprise) but = pv >= 0.5 ? 1 : 0;
      else if (d.p0 <= 0.5) but = pv >= SEUIL_P ? 1 : 0;
      else but = pv <= 1 - SEUIL_P ? 0 : 1;
      T0.but = but;
      T0.doigt = false;
      T0.lance = true;
      cibleRef.current = but ? T0.hi : T0.lo;
      coteCibleRef.current = but ? T0.coteHi : T0.coteLo;
      actions.current.lancer(T0, vp);
    };

    const relacherGlisse = (d: Doigt, v: number) => {
      const a = afficheRef.current;
      const xg = X(a, 'gauche');
      const xd = X(a, 'droite');
      const ecart = xd - xg || 1;
      const f = (glisse.get() - xg) / ecart;
      const vg = -v / d.k; // px de scène par seconde, + vers la page de droite
      let c: CotePage;
      if (Math.abs(vg / ecart) >= VIF) c = vg > 0 ? 'droite' : 'gauche';
      else if (d.reprise) c = f >= 0.5 ? 'droite' : 'gauche';
      else if (d.coteDepart === 'gauche') c = f >= SEUIL_P ? 'droite' : 'gauche';
      else c = f <= 1 - SEUIL_P ? 'gauche' : 'droite';
      cibleRef.current = a;
      coteCibleRef.current = c;
      actions.current.glisser(c, vg, false);
    };

    const relacherRebond = () => {
      const el = livreRef.current;
      animate(rebond, 0, {
        ...SPRINGS.settle,
        onComplete: () => {
          const cam = el?.parentElement;
          if (cam) cam.style.willChange = '';
          emettre(el, 'fin', 'rebond');
        },
      });
    };

    // Toucher : la couverture s'ouvre ; une page peut le prendre (vidéo) ; sinon, la marge extérieure
    // tourne la page.
    const toucher = (e: PointerEvent) => {
      const cible = e.target instanceof Element ? e.target : null;
      if (!cible || surControle(cible)) return; // le contenu gère son propre clic
      if (afficheRef.current === -1 && !tourRef.current) { actions.current.pas(1); return; }
      const face = cible.closest('.gc-livre-face');
      if (face && livreRef.current?.contains(face)) {
        const r = face.getBoundingClientRect();
        const t: ToucherPage = {
          spreadId: face.getAttribute('data-gc-spread') ?? '',
          side: face.classList.contains('gc-livre-face--left') ? 'left' : 'right',
          x: (e.clientX - r.left) / (r.width || 1),
          y: (e.clientY - r.top) / (r.height || 1),
          cible,
        };
        const libre = cible.dispatchEvent(new CustomEvent<ToucherPage>(TOUCHER_EVENT, { bubbles: true, cancelable: true, detail: t }));
        const pris = vivant.current.onToucherPage?.(t) === true;
        if (pris || !libre) return;
      }
      const lv = livreRef.current;
      const g = lv?.querySelector('.gc-livre__emplacement--gauche')?.getBoundingClientRect();
      const dr = lv?.querySelector('.gc-livre__emplacement--droite')?.getBoundingClientRect();
      if (!g || !dr) return;
      const page = modePageRef.current ? (coteRef.current === 'gauche' ? g : dr) : null;
      const gauche = page ? page.left : g.left;
      const droite = page ? page.right : dr.right;
      const haut = Math.min(g.top, dr.top);
      const bas = Math.max(g.bottom, dr.bottom);
      const marge = MARGE_TOUCHER * dr.width;
      if (e.clientY < haut - 0.05 * (bas - haut) || e.clientY > bas + 0.05 * (bas - haut)) return;
      if (e.clientX < gauche + marge) actions.current.pas(-1);
      else if (e.clientX > droite - marge) actions.current.pas(1);
    };

    const onDown = (e: PointerEvent) => {
      dernierType = e.pointerType;
      if (!e.isPrimary || doigtRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (surControle(e.target)) return;
      const L = pageAEcran();
      const g = geoRef.current;
      if (!(L > 0) || !g || !(g.W > 0)) return;
      doigtRef.current = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, etat: 'attente', intention: null, dir: 0,
        L, k: L / g.W, p0: 0, g0: 0, r0: 0, reprise: false, amorce: null, coteDepart: coteRef.current,
        pts: [{ t: e.timeStamp, x: e.clientX }],
      };
    };

    const onMove = (e: PointerEvent) => {
      const d = doigtRef.current;
      if (!d || e.pointerId !== d.id) return;
      d.pts.push({ t: e.timeStamp, x: e.clientX });
      garder(d.pts, e.timeStamp);
      if (d.etat === 'ignore') return;
      const dx = e.clientX - d.x0;
      if (d.etat === 'attente') {
        const ax = Math.abs(dx);
        const ay = Math.abs(e.clientY - d.y0);
        if (ay >= SEUIL_GLISSER && ay > ax) { d.etat = 'ignore'; annulerAmorce(d); return; }
        if (ax < SEUIL_AMORCE || ax <= ay) return;
        const dir = dx < 0 ? -1 : 1;
        if (d.dir !== dir) { annulerAmorce(d); d.dir = dir; amorcer(d); }
        if (ax < SEUIL_GLISSER) return;
        demarrer(d);
        if ((d.etat as Doigt['etat']) === 'ignore') return;
        try { surface.setPointerCapture(d.id); } catch { /* pointeur déjà relâché */ }
      }
      piloter(d, dx);
    };

    const onUp = (e: PointerEvent) => {
      const d = doigtRef.current;
      if (!d || e.pointerId !== d.id) return;
      doigtRef.current = null;
      const annule = e.type === 'pointercancel';
      try { if (surface.hasPointerCapture(d.id)) surface.releasePointerCapture(d.id); } catch { /* rien */ }
      if (d.etat === 'attente' || d.etat === 'ignore') {
        const etat = d.etat;
        annulerAmorce(d);
        const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
        if (!annule && etat === 'attente' && dist < SEUIL_GLISSER && e.timeStamp - d.t0 < TOUCHER_MAX_MS) toucher(e);
        return;
      }
      gardeClic = e.timeStamp;
      const v = annule ? 0 : vitesse(d.pts, e.timeStamp);
      if (d.etat === 'tour') relacherTour(d, v);
      else if (d.etat === 'glisse') relacherGlisse(d, v);
      else relacherRebond();
    };

    // Après un glisser, le clic qui suit (souris, ou clic fantôme du toucher) ne doit rien déclencher.
    const onClick = (e: MouseEvent) => {
      if (e.timeStamp - gardeClic < 500 && !surControle(e.target)) { e.stopPropagation(); e.preventDefault(); }
    };
    const onDragStart = (e: Event) => e.preventDefault();
    const onMenu = (e: Event) => { if (dernierType !== 'mouse') e.preventDefault(); };

    surface.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    surface.addEventListener('click', onClick, true);
    surface.addEventListener('dragstart', onDragStart);
    surface.addEventListener('contextmenu', onMenu);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      surface.removeEventListener('click', onClick, true);
      surface.removeEventListener('dragstart', onDragStart);
      surface.removeEventListener('contextmenu', onMenu);
      doigtRef.current = null;
    };
  }, [gestes, pose, enEcran, min, max, p, glisse, rebond, X]);

  // Pré-rendu : la double page affichée et ses voisines (−1, +1) restent montées ; seules les
  // pages du geste en cours sont visibles. Aucune n'est créée ni retirée pendant un geste.
  const montes = new Set<number>([affiche - 1, affiche, affiche + 1]);
  if (T) { montes.add(T.lo); montes.add(T.hi); }
  const liste = Array.from(montes).filter((k) => k >= 0 && k < n).sort((a, b) => a - b);
  const visibleG = (k: number) => (T ? k === T.lo : k === affiche);
  const visibleD = (k: number) => (T ? k === T.hi : k === affiche);
  const modeDe = (k: number): RenderMode => (k === affiche ? 'live' : 'static');

  const frac = n > 1 ? clamp(affiche, 0, n - 1) / (n - 1) : 0;
  const nG = affiche <= 0 ? 0 : Math.max(1, Math.round(4 * frac));
  const nD = affiche >= n - 1 ? 0 : Math.max(1, Math.round(4 * (1 - frac)));

  let leaf: React.ReactNode = null;
  if (feuille && feuille.couverture) {
    leaf = (
      <FeuilletCouverture
        key="couverture"
        p={p}
        recto={cover}
        verso={spreads[0] ? <Face spread={spreads[0]} side="left" mode="static" /> : null}
      />
    );
  } else if (feuille && spreads[feuille.lo] && spreads[feuille.hi]) {
    leaf = (
      <Feuillet
        key={feuille.id}
        p={p}
        sens={feuille.sens}
        recto={<Face spread={spreads[feuille.lo]} side="right" mode="static" />}
        verso={<Face spread={spreads[feuille.hi]} side="left" mode="static" />}
      />
    );
  }

  const annonce = affiche === -1
    ? 'Carnet fermé'
    : `Double page ${affiche + 1} sur ${n}${modePage ? `, page de ${cote}` : ''}`;

  // Bornes des flèches : en cadrage « page », on compte les pages.
  const debut = modePage ? affiche <= min && (affiche === -1 || cote === 'gauche') : affiche <= min;
  const fin = modePage ? affiche >= max && cote === 'droite' : affiche >= max;

  // Flèches à l'écran : groupées en bas à droite, comme sur la TV ; sur un téléphone couché (le livre
  // remplit la hauteur), une de chaque côté du livre, sur la table.
  const placeFleches = React.useMemo<{ place: 'coin' | 'cotes'; bande: number; papier: boolean }>(() => {
    const coin = { place: 'coin' as const, bande: 0, papier: false };
    // Sur un grand écran, la composition de la TV (flèches sur la table, en bas à droite).
    if (!vp || !geo || !cadre || (!modePage && partScene(vp) >= 1)) return coin;
    const c = geo.carton;
    const u = Math.min(vp.w / geo.stageW, vp.h / geo.stageH);
    const taille = Math.max(vp.tactile ? 44 : 32, 56 * u);
    const largeur = modePage ? geo.W : 2 * geo.W;
    const x0 = modePage ? cadre.cx - geo.W / 2 : geo.bookX - c.out;
    const gauche = cadre.ox + (x0 - cadre.cx) * cadre.s;
    const droite = cadre.ox + (x0 + largeur + (modePage ? 0 : 2 * c.out) - cadre.cx) * cadre.s;
    const bas = cadre.oy + (geo.bookY + geo.H + c.bas - cadre.cy) * cadre.s;
    const bandeBas = vp.h - vp.insets.bottom - bas;
    const bande = Math.min(gauche - vp.insets.left, vp.w - vp.insets.right - droite);
    if (bandeBas >= taille + 8) return coin;
    // (sur les côtés, la cible tient dans la bande de table, à 1 px près de chaque bord)
    if (!modePage && bande >= taille + 2) return { place: 'cotes', bande, papier: false };
    // Ni la table du bas ni celle des côtés n'a la place : les flèches se posent sur le papier, à l'encre.
    return { ...coin, papier: true };
  }, [vp, geo, cadre, modePage]);

  const fleches = (
    <Fleches
      onPrecedente={() => pas(-1)}
      onSuivante={() => pas(1)}
      debut={debut}
      fin={fin}
      place={enEcran ? placeFleches.place : 'scene'}
    />
  );

  const scene = (
    <Stage
      distance={distance}
      debord={enEcran ? debord : 0}
      className={['gc-livre-scene', className].filter(Boolean).join(' ')}
      overlay={enEcran ? undefined : (
        <>
          <RepereDistance distance={camera.distance} zoom={camera.zoom} changedAt={camera.changedAt} />
          {fleches}
        </>
      )}
    >
      <Camera zoom={cameraFixe ? 1 : camera.zoom} fondu={fondu} x={rebond}>
        <div ref={livreRef} className="gc-livre" data-gc-etat={couv ? 'couverture' : 'ouvert'}>
          {/* Mouvement de caméra de l'ouverture : appliqué au corps et à l'espace 3D séparément
              (transformer leur parent commun obligerait à aplatir tout le livre à chaque image). */}
          <m.div className="gc-livre__corps" style={{ transform: livreT }}>
            <m.div className="gc-livre__ombre gc-livre__ombre--gauche" style={{ opacity: ombreGauche }} aria-hidden="true" />
            <div className="gc-livre__ombre gc-livre__ombre--droite" aria-hidden="true" />
            {couv && <m.div className="gc-livre__ombre gc-livre__ombre--epaisseur" style={{ opacity: ombreEpaisseur }} aria-hidden="true" />}
            <div className="gc-livre__carton gc-livre__carton--gauche gc-livre__carton-toile gc-livre__carton-bord--gauche" aria-hidden="true" />
            <div className="gc-livre__carton gc-livre__carton--droite gc-livre__carton-toile gc-livre__carton-bord--droite" aria-hidden="true" />
            <Tranche side="gauche" n={nG} />
            <Tranche side="droite" n={nD} />
            <div className="gc-livre__emplacement gc-livre__emplacement--gauche">
              {liste.map((k) => <Emplacement key={spreads[k].id} spread={spreads[k]} side="left" mode={modeDe(k)} visible={visibleG(k)} />)}
            </div>
            <div className="gc-livre__emplacement gc-livre__emplacement--droite">
              {liste.map((k) => <Emplacement key={spreads[k].id} spread={spreads[k]} side="right" mode={modeDe(k)} visible={visibleD(k)} />)}
            </div>
            <div className="gc-livre__dos" aria-hidden="true" />
            {T && <Portees key={T.id} p={p} sens={T.sens} couverture={T.couverture} />}
          </m.div>
          <m.div ref={espaceRef} className="gc-livre__espace" style={{ transform: livreT }}>{leaf}</m.div>
        </div>
      </Camera>
      <p className="gc-livre__annonce" aria-live="polite">{annonce}</p>
    </Stage>
  );

  if (!enEcran) return <LazyMotion features={domMax}>{scene}</LazyMotion>;

  // Contrôles en px d'écran, hors de la scène mise à l'échelle (portail dans le calque de l'Ecran).
  const commandes = ecran.controles && !pose
    ? createPortal(
      <div
        className="gc-livre-commandes"
        data-gc-sur={placeFleches.papier ? 'papier' : undefined}
        style={placeFleches.place === 'cotes' ? ({ '--gc-livre-bande': `${Math.round(placeFleches.bande)}px` } as React.CSSProperties) : undefined}
      >
        {!cameraFixe && (
          <div className="gc-livre-commandes__repere">
            <RepereDistance distance={camera.distance} zoom={camera.zoom} changedAt={camera.changedAt} />
          </div>
        )}
        {modePage && affiche >= 0 && <PointsPage cote={cote} onChoisir={(c) => allerA(afficheRef.current, c)} />}
        {fleches}
      </div>,
      ecran.controles,
    )
    : null;

  return (
    <LazyMotion features={domMax}>
      <div
        ref={surfaceRef}
        className="gc-livre-ecran"
        data-gc-cadrage={modePage ? 'page' : 'double'}
        data-gc-double={affiche}
        data-gc-cote={cote}
        style={cadre ? undefined : { visibility: 'hidden' }}
      >
        <m.div ref={mondeRef} className="gc-livre-monde" style={{ transform: mondeT }}>{scene}</m.div>
      </div>
      {commandes}
    </LazyMotion>
  );
}
