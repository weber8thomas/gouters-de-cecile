import React from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Stage } from '../Stage';
import { OmbreFeu } from '../Lumiere';
import { useEcran } from '../Ecran/contexte';
import { useCamera } from '../../lib/camera';
import type { Distance } from '../../lib/settings';
import type { RenderMode, SpreadSpec } from '../../lib/spread';
import { LazyMotion, SPRINGS, STAGGER, animate, domMax, m, useMotionValue, useReducedMotion, useTransform, type MotionValue } from '../../lib/motion';
import { LOUPE_EVENT, ancrerLoupe, getLoupe, publierContenuLoupe, useLoupe, type LoupeDetail } from '../../lib/loupe';
import { jouerSon } from '../../lib/son';
import { cadrerDouble, cadrerPage, centrePage, debordNecessaire, partScene, translationMonde, type CadreCamera, type GeometrieLivre } from '../../lib/viewport';
import { Camera } from './Camera';
import { Coin } from './CoinRabat';
import { Face, type Cote } from './Face';
import { Feuillet, FeuilletCouverture, Portees } from './Feuillet';
import { FeuilletLeger } from './FeuilletLeger';
import { Fleches } from './Fleches';
import { PointsPage } from './PointsPage';
import { RepereDistance } from './RepereDistance';
import { TOUCHER_EVENT, cadenceStable, emettre, pret, type GesteType, type ToucherPage } from './evenements';
import { CARTON, PLANCHER, clamp, lisse, r3, reculCouverture } from './geometrie';
import { MARGE_TOUCHER, SEUIL_AMORCE, SEUIL_GLISSER, SEUIL_P, TOUCHER_MAX_MS, VIF, elastique, entreElastique, garder, pElastique, vitesse, type Echantillon } from './doigt';
import { RELAIS_COIN, angleSaisi, leve, pRelais, plier, zoneCoin, type Coin as AngleCoin } from './coin';
import { traineeDoree } from './etincelles';
import './Livre.css';

export type { ToucherPage };

/**
 * Coin qui suit le doigt : rabat plat en transformations (true), ou repli (false) : le coin se lève
 * sur le feuillet 3D (p = 0,03) et seul le suivi horizontal reste. Repli à prendre si le rabat dépasse
 * le budget (repeinture sous WebKit, plus de 40 calques).
 */
export const COIN_2D = true;
/** Le rabat n'est monté qu'une fois la page posée depuis ce délai (ms). */
const COIN_DELAI = 500;
/** Le rabat s'efface en ce temps (s) quand le tourne-page 3D prend le relais. */
const COIN_FONDU = 0.12;
/** Levée du coin en repli (p du feuillet 3D). */
const COIN_P_REPLI = 0.03;
/** Ouverture lestée : petite levée (p, durée en s), puis le ressort « cover » part avec cette vitesse. */
const LEVEE_COUV = { p: 0.015, duree: 0.09, vitesse: 0.5 };
/** Tassement du livre quand la couverture se pose (px de scène). */
const TASSEMENT = 2.5;
/** Arrivée : sautée si la page a mis plus que ça à se charger (ms depuis la navigation). */
const ARRIVEE_MAX_CHARGEMENT = 1500;
/** Lien profond : la couverture part à ce moment de l'arrivée (ms), le feuilletage à cette ouverture. */
const LIEN_COUVERTURE_MS = 450;
const LIEN_RIFFLE_P = 0.6;
/**
 * Lien profond : la couverture est lancée plus fort (p/s). Le ressort « cover » est presque critique
 * (ω ≈ 3,7 rad/s) : parti du repos, il met ≈ 1,8 s à se poser ; lancé à une vitesse proche de ω, son
 * approche devient une simple exponentielle (≈ 1,4 s) et la séquence tient en 2,1 s.
 */
const LIEN_VITESSE = 3;
/**
 * Feuilletage multi-feuilles (feuilles légères, puis la feuille finale) pour les sauts d'au moins 2 doubles
 * pages. Reporté après validation du prototype : désactivé, un saut tourne un seul feuillet (comme avant),
 * et le lien profond enchaîne arrivée, ouverture et ce feuillet. Le code reste prêt (true pour l'essayer).
 */
export const FEUILLETAGE = false;
/** Feuilletage : au-delà de cet écart (doubles pages), plusieurs feuilles ; au plus ce nombre de légères. */
const RIFFLE_ECART = 2;
const RIFFLE_MAX = 3;

/** Page cadrée d'une double page, en cadrage « page » (téléphone, tablette debout). */
export type CotePage = 'gauche' | 'droite';

export interface LivrePose {
  /** Double page visée (index dans spreads, −1 = couverture fermée). */
  vers: number;
  /** Avancée du geste, de 0 (départ) à 1 (arrivée). */
  p: number;
  /** Feuilletage figé (saut d'au moins 2 doubles pages) : avancée des feuilles légères. Défaut : p. */
  r?: number;
  /** Arrivée figée : 0 (en bas de la table) à 1 (posé). */
  arrivee?: number;
  /** Coin figé (avec vers = la double page affichée) : doigt en fractions de page, repère normalisé (0 = reliure). */
  coin?: { cote: CotePage; angle: AngleCoin; x: number; y: number };
}

/** Commandes impératives : le sommaire cliquable, « Aller à… », les tests. */
export interface LivreApi {
  /** Va à la double page i (côté c en cadrage « page ») : un tourne-page, ou un feuilletage dès 2 doubles pages d'écart. */
  aller(i: number, c?: CotePage): void;
  /** Termine tout de suite l'arrivée et le lien profond en cours (fondu de 150 ms). */
  sauter(): void;
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
  /**
   * Arrivée au chargement : le livre glisse sur la table et se pose (true). Avec `vers` (lien profond),
   * il s'ouvre ensuite et feuillette jusqu'à cette double page (≈ 2,1 s ; un toucher ou une touche
   * saute à la fin). Sautée en mouvement réduit, onglet caché, ou chargement de plus de 1,5 s.
   */
  arrivee?: true | { vers: number; cote?: CotePage };
  /**
   * Invitation à ouvrir (lot S : <InvitationOuvrir opacite={…} />), posée sur le tiers bas de la
   * couverture fermée. Le livre en pilote l'opacité : arrivée finie × (1 − lisse(0, 0,06, p)).
   */
  invitation?: (opacite: MotionValue<number>) => React.ReactNode;
  /** Couverture cuite (lot C) : variables CSS (couvertureVars()) posées sur le livre. */
  couverture?: React.CSSProperties;
  /**
   * Plat arrière : la dernière double page est le colophon et la garde arrière ; tourner sa page (→,
   * glisser, marge) referme le livre sur son plat arrière (index = spreads.length). ← le rouvre ;
   * « Aller à… » ou un lien le rouvrent et feuillettent. true : la toile seule (--gc-couv-arriere) ;
   * un nœud : ce qui est posé sur le plat.
   */
  couvertureArriere?: React.ReactNode;
  /** Reçoit les commandes impératives (aller, sauter). */
  apiRef?: React.MutableRefObject<LivreApi | null>;
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
  /** Feuilletage : doubles pages intermédiaires des feuilles légères, dans l'ordre où elles tournent. */
  feuilles?: number[];
  /** Tour né d'un coin : le rabat reste monté jusqu'à l'atterrissage. */
  coin?: CotePage;
  /** Cadrage « page », tour né d'un coin : la caméra ne suit la feuille qu'à partir de cette avancée. */
  pCam?: number;
  /** Ne part pas seul : la séquence du lien profond le lance. */
  differe?: boolean;
  /** Ouverture lestée déjà faite. */
  leve?: boolean;
  /** Le plat arrière (lo = dernière double page, hi = livre refermé derrière). */
  arriere?: boolean;
}

/** Un tour de carton (couverture devant, ou plat arrière) : carton rigide, ressort « cover ». */
const carton = (T: Pick<Tour, 'couverture' | 'arriere'>) => T.couverture || !!T.arriere;

/** Un pointeur posé sur le livre (doigt, stylet, souris). */
interface Doigt {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  etat: 'attente' | 'tour' | 'glisse' | 'rebond' | 'coin' | 'ignore';
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
  /** La loupe est zoomée : aucun glisser ne tourne la page (les touchers d'objets restent). */
  zoome: boolean;
  /** Coin saisi (zone d'angle) : côté, angle, doigt au début du suivi (repère normalisé). */
  coin: { cote: CotePage; angle: AngleCoin; fx0: number; fy0: number; xc: number; yc: number; relais: boolean } | null;
}

/** Le rabat d'un côté : doigt (repère normalisé), angle saisi, opacité d'ensemble. */
interface Rabat {
  fx: MotionValue<number>;
  fy: MotionValue<number>;
  haut: MotionValue<number>;
  op: MotionValue<number>;
  anim: { stop(): void }[];
}

/** Lance une transition de vue (repli : application immédiate) et l'annonce comme un geste. */
function transitionDeVue(type: GesteType, maj: () => void, livre: HTMLElement | null, nommer: boolean, racine: string = type): void {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    maj();
    return;
  }
  const root = document.documentElement;
  root.setAttribute('data-gc-livre-vt', racine);
  if (nommer && livre) livre.setAttribute('data-gc-vt', '');
  emettre(livre, 'prepa', type);
  const vt = document.startViewTransition(maj);
  // Le mouvement commence quand les captures sont prêtes (avant, l'écran est figé sur l'ancien état).
  vt.ready.then(() => emettre(livre, 'debut', type), () => emettre(livre, 'debut', type));
  vt.finished.finally(() => {
    if (root.getAttribute('data-gc-livre-vt') === racine) root.removeAttribute('data-gc-livre-vt');
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
const surObjet = (t: EventTarget | null) => t instanceof Element && !!t.closest('[data-gc-objet]');

/** Doubles pages intermédiaires d'un saut de `de` à `vers` (au plus RIFFLE_MAX, réparties). */
function intermediaires(de: number, vers: number, max = RIFFLE_MAX): number[] {
  const ecart = Math.abs(vers - de);
  const k = Math.min(max, ecart - 1);
  const s = Math.sign(vers - de);
  const out: number[] = [];
  for (let i = 1; i <= k; i++) {
    const x = de + s * Math.round((i * ecart) / (k + 1));
    if (x !== de && x !== vers && !out.includes(x)) out.push(x);
  }
  return out;
}

/** Étalement des feuilles légères sur la course de r (même rythme que STAGGER.sommaire). */
function etalement(n: number): { s: number; w: number } {
  const s = STAGGER.sommaire / Math.max(0.2, SPRINGS.riffle.visualDuration);
  return { s, w: Math.max(0.45, 1 - (n - 1) * s) };
}
const qFeuille = (r: number, j: number, n: number) => {
  const { s, w } = etalement(n);
  return clamp((r - j * s) / w, 0, 1);
};

/** Une page posée dans un emplacement fixe : toujours montée, visible ou non. */
const Emplacement = React.memo(function Emplacement({ spread, side, mode, visible }: { spread: SpreadSpec; side: Cote; mode: RenderMode; visible: boolean }) {
  return (
    <div className={`gc-livre__page${visible ? ' gc-livre__page--visible' : ''}`} aria-hidden={visible ? undefined : true}>
      <Face spread={spread} side={side} mode={mode} />
    </div>
  );
});

/** Feuilles de la tranche d'un côté : 1 = la plus proche de la page, FEUILLES = la plus extérieure. */
const FEUILLES = 8;

function Tranche({ side, n }: { side: 'gauche' | 'droite'; n: number }) {
  return (
    <div className={`gc-livre__tranche gc-livre__tranche--${side}`} aria-hidden="true">
      {Array.from({ length: FEUILLES }, (_, i) => FEUILLES - i).map((k) => (
        <div key={k} className={`gc-livre__feuille gc-livre__feuille--${k}${k <= n ? '' : ' gc-livre__feuille--absente'}`} />
      ))}
    </div>
  );
}

/**
 * Feuille légère j (sur n) du feuilletage : sa position dérive de r ; elle s'efface quand la suivante
 * (feuille légère, ou la feuille finale pilotée par p) se pose dessus.
 */
function FeuilleDuRiffle({ r, p, j, n, sens, finale, recto, verso }: {
  r: MotionValue<number>; p: MotionValue<number>; j: number; n: number; sens: 1 | -1; finale: boolean; recto: React.ReactNode; verso: React.ReactNode;
}) {
  const q = useTransform(r, (v) => { const x = qFeuille(v, j, n); return sens < 0 ? x : 1 - x; });
  const fondu = useTransform([r, p], ([rv, pv]: number[]) => {
    if (finale) return 1;
    const suivante = j < n - 1 ? qFeuille(rv, j + 1, n) : sens < 0 ? pv : 1 - pv;
    return 1 - lisse(0.88, 1, suivante);
  });
  return <FeuilletLeger q={q} fondu={fondu} recto={recto} verso={verso} />;
}

// Le carnet qui se feuillette : emplacements fixes gauche/droite, un feuillet 3D qui tourne,
// une couverture qui s'ouvre, une caméra (cran de distance + zoom fin) et deux flèches.
// Plan v4 : le coin suit le doigt (rabat plat, relais vers le feuillet 3D), le livre arrive sur la
// table, s'ouvre lesté, feuillette les grands sauts, joue ses sons de papier ; branché sur la loupe.
// Dans un <Ecran> : la scène est mise à l'échelle de l'écran (cadrage « double » ou « page »), la
// caméra glisse d'une page à l'autre et suit la feuille qui tourne, les contrôles passent en px d'écran.
export function Livre({
  spreads, index, onIndexChange, keyboard = false, cover, className, pose, coteInitial = 'gauche', onToucherPage, gestes = true,
  arrivee, invitation, couverture, apiRef, couvertureArriere,
}: LivreProps) {
  const camera = useCamera();
  const ecran = useEcran();
  const vp = ecran?.vp ?? null;
  const enEcran = !!ecran;
  const modePage = !!vp && vp.cadrage === 'page';
  const reduced = !!useReducedMotion();
  const loupe = useLoupe();
  const zoome = loupe.zoome;
  const n = spreads.length;
  const min = cover != null ? -1 : 0;
  /** Plat arrière : l'index n est le livre refermé derrière. */
  const dos = couvertureArriere != null && couvertureArriere !== false && n > 0;
  const max = dos ? n : Math.max(min, n - 1);
  /** Dernière double page ouverte (Fin, coin). */
  const maxOuvert = Math.max(min, n - 1);
  const dosRef = React.useRef({ dos, n });
  dosRef.current = { dos, n };
  /** Livre refermé (devant ou derrière). */
  const ferme = (i: number) => i === -1 || (dosRef.current.dos && i >= dosRef.current.n);
  const borne = React.useCallback((i: number) => Math.round(clamp(i, min, max)), [min, max]);

  // Arrivée (une seule fois, au montage) : sa cible pour un lien profond.
  const arriveeRef = React.useRef<{
    /** lien : l'arrivée est finie, le moteur ordinaire ouvre le livre et va à la page du lien. */
    phase: 'attente' | 'prepa' | 'en-cours' | 'lien' | 'fini';
    vers: number | null;
    cote: CotePage;
    timers: number[];
    anims: { stop(): void }[];
    actifs: Set<GesteType>;
    tour: Tour | null;
    arriveeFinie: boolean;
  } | null>(null);
  if (arriveeRef.current === null && arrivee && !pose) {
    const vers = arrivee === true ? null : Math.round(clamp(arrivee.vers, min, max));
    arriveeRef.current = {
      phase: 'attente', vers: vers != null && vers >= 0 && cover != null ? vers : null, cote: (arrivee !== true && arrivee.cote) || 'gauche',
      timers: [], anims: [], actifs: new Set(), tour: null, arriveeFinie: false,
    };
  }
  const enArrivee = () => !!arriveeRef.current && arriveeRef.current.phase !== 'fini' && arriveeRef.current.phase !== 'lien';

  const [affiche, setAffiche] = React.useState(() => (arriveeRef.current?.vers != null ? -1 : borne(index)));
  const [tour, setTour] = React.useState<Tour | null>(null);
  // Quand la page (cadrage « page ») ou le livre (petit écran couché) remplit l'écran, la caméra ne
  // peut plus avancer : le cran ne change plus le cadrage, seulement la mise en page. On prend alors la
  // mise en page « loin », dont la hauteur d'x est la plus grande par rapport à la page (15/750 contre
  // 15/896 au cran proche : +19 % à l'écran). Les crans ne servent qu'en cadrage « double » sur un
  // grand écran (la composition de la TV).
  const cameraFixe = !!vp && (modePage || partScene(vp) < 1);
  const cranVoulu: Distance = cameraFixe ? 'loin' : camera.distance;
  const [distance, setDistance] = React.useState<Distance>(cranVoulu);
  const [cote, setCote] = React.useState<CotePage>(arriveeRef.current?.vers != null ? arriveeRef.current.cote : coteInitial);
  const [geo, setGeo] = React.useState<GeometrieLivre | null>(null);
  /** Rabats montés (500 ms après que la page s'est posée). */
  const [coinPret, setCoinPret] = React.useState(false);
  /** Pendant un geste de coin : le seul côté monté. */
  const [coinActif, setCoinActif] = React.useState<CotePage | null>(null);

  // LA MotionValue du geste : 0 = feuillet à plat à droite, 1 = à plat à gauche.
  const p = useMotionValue(0);
  /** Feuilletage : avancée des feuilles légères (0 → 1, SPRINGS.riffle). */
  const r = useMotionValue(0);
  const fondu = useMotionValue(1);
  /** Cadrage « page », au repos : abscisse (scène) du centre de la caméra. */
  const glisse = useMotionValue(0);
  /** Butée au doigt : le livre résiste (px de scène). */
  const rebond = useMotionValue(0);
  /** Arrivée : 0 en bas de la table, 1 posé ; présence de la caméra (0,002 avant l'entrée). */
  const arr = useMotionValue(arriveeRef.current ? 0 : 1);
  const present = useMotionValue(arriveeRef.current ? PLANCHER : 1);
  /** Arrivée finie (invitation à ouvrir) : 0 → 1. */
  const arrFin = useMotionValue(arriveeRef.current ? 0 : 1);
  /** Ouverture lestée : tassement du livre (px) et pulsation de l'ombre gauche. */
  const tasse = useMotionValue(0);
  const pouls = useMotionValue(PLANCHER);
  const rabatG: Rabat = { fx: useMotionValue(0), fy: useMotionValue(0), haut: useMotionValue(0), op: useMotionValue(1), anim: [] };
  const rabatD: Rabat = { fx: useMotionValue(0), fy: useMotionValue(0), haut: useMotionValue(0), op: useMotionValue(1), anim: [] };
  const rabats = React.useRef({ gauche: rabatG, droite: rabatD });
  const livreRef = React.useRef<HTMLDivElement>(null);
  const espaceRef = React.useRef<HTMLDivElement>(null);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const mondeRef = React.useRef<HTMLDivElement>(null);
  const afficheRef = React.useRef(affiche);
  const cibleRef = React.useRef(affiche);
  const coteRef = React.useRef<CotePage>(cote);
  const coteCibleRef = React.useRef<CotePage>(cote);
  const tourRef = React.useRef<Tour | null>(null);
  const animRef = React.useRef<{ stop(): void } | null>(null);
  const animSeq = React.useRef(0);
  const riffleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const tassement = React.useRef<Promise<void> | null>(null);
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
  const vivant = React.useRef({ reduced, onIndexChange, onToucherPage, spreads });
  vivant.current = { reduced, onIndexChange, onToucherPage, spreads };
  if (arriveeRef.current?.vers != null && cibleRef.current === -1 && arriveeRef.current.phase === 'attente') cibleRef.current = arriveeRef.current.vers;

  React.useLayoutEffect(() => { afficheRef.current = affiche; }, [affiche]);
  React.useEffect(() => () => {
    animSeq.current++; animRef.current?.stop(); riffleAnim.current?.stop(); glisseSeq.current++; glisseAnim.current?.stop();
    const A = arriveeRef.current;
    if (A) { A.timers.forEach((t) => clearTimeout(t)); A.anims.forEach((a) => a.stop()); }
  }, []);

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
    return g ? centrePage(g, ferme(i) ? 'couverture' : c) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Le doigt quitte un coin sans tourner : le rabat revient à plat (settle) : un pli de taille nulle. */
  const reposerRabat = React.useCallback((c: CotePage, ensuite?: () => void) => {
    const R = rabats.current[c];
    R.anim.forEach((a) => a.stop());
    const g = geoRef.current;
    if (!g) { ensuite?.(); return; }
    const [ax, ay] = angleSaisi(R.haut.get() >= 0.5 ? 'haut' : 'bas', g.W, g.H);
    let reste = 2;
    const fini = () => {
      if (--reste) return;
      ensuite?.();
    };
    R.anim = [
      animate(R.fx, ax, { ...SPRINGS.settle, onComplete: fini }),
      animate(R.fy, ay, { ...SPRINGS.settle, onComplete: fini }),
    ];
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
    if (el) { el.removeAttribute('data-gc-geste'); el.removeAttribute('data-gc-coin'); }
    emettre(el, 'fin', T.feuilles && !T.couverture ? 'riffle' : carton(T) ? 'couverture' : 'page');
    const A = arriveeRef.current;
    if (A && A.tour === T) {
      A.actifs.delete('couverture');
      A.tour = null;
      if (A.arriveeFinie) {
        A.phase = 'fini';
        el?.setAttribute('data-gc-arrivee', 'fini');
      }
    }
    // Lien profond (sans feuilletage) : fini quand le moteur a atteint sa cible (la page du lien).
    if (A && A.phase === 'lien' && nouvel === cibleRef.current) {
      A.phase = 'fini';
      el?.setAttribute('data-gc-arrivee', 'fini');
    }
    // La double page logique change tout de suite : la mise à jour d'une transition de vue est
    // asynchrone, et le parent peut renvoyer l'index (onIndexChange) avant qu'elle ne s'applique.
    afficheRef.current = nouvel;
    coteRef.current = coteNouveau;
    glisse.set(X(nouvel, coteNouveau));
    r.set(0);
    if (T.coin) { const R = rabats.current[T.coin]; R.anim.forEach((a) => a.stop()); }
    setAffiche(nouvel);
    setTour(null);
    setCote(coteNouveau);
    setCoinActif(null);
    const cb = vivant.current.onIndexChange;
    if (nouvel !== avant) { echo.current = nouvel; cb?.(nouvel); }
  }, [glisse, X, r]);

  /**
   * Un carton se pose : le son ; à l'ouverture et quand le livre se referme, tassement de 2,5 px ; quand
   * il se pose à gauche (ouverture, plat arrière refermé), pulsation de l'ombre gauche.
   */
  const poser = React.useCallback((son: 'couverture-poser' | 'couverture-fermer', o: { tasser: boolean; pouls: boolean }) => {
    jouerSon(son);
    if (!o.tasser || vivant.current.reduced) return;
    if (o.pouls) animate(pouls, [PLANCHER, 0.55, PLANCHER], { duration: 0.55, times: [0, 0.22, 1], ease: 'easeOut' });
    tassement.current = new Promise<void>((fin) => {
      animate(tasse, TASSEMENT, {
        duration: 0.07,
        ease: 'easeOut',
        onComplete: () => { animate(tasse, 0, { ...SPRINGS.settle, onComplete: () => { tassement.current = null; fin(); } }); },
      });
    });
  }, [pouls, tasse]);

  /** Feuilletage : les feuilles légères partent (r : 0 → 1, SPRINGS.riffle). */
  const lancerRiffle = React.useCallback((T: Tour) => {
    const el = livreRef.current;
    riffleAnim.current?.stop();
    jouerSon('riffle');
    const A = arriveeRef.current;
    if (T.couverture) { emettre(el, 'debut', 'riffle'); A?.actifs.add('riffle'); }
    const a = animate(r, 1, {
      ...SPRINGS.riffle,
      onComplete: () => {
        if (riffleAnim.current === a) riffleAnim.current = null;
        if (T.couverture) { emettre(el, 'fin', 'riffle'); A?.actifs.delete('riffle'); }
      },
    });
    riffleAnim.current = a;
  }, [r]);
  // ---- Ressort : lancé, ou relancé vers une nouvelle cible (vitesse conservée) --------------
  const lancer = React.useCallback((T: Tour, velocity?: number, delai?: number) => {
    animRef.current?.stop();
    const id = ++animSeq.current;
    const lien = !!(T.couverture && T.feuilles);
    // Ouverture (et fermeture par le plat arrière) lestée : une petite levée d'abord, puis le carton
    // part avec de la vitesse.
    if (carton(T) && T.but === 1 && velocity == null && !T.leve && p.get() < 0.005 && !vivant.current.reduced) {
      T.leve = true;
      if (T.couverture) jouerSon('couverture-ouvrir');
      animRef.current = animate(p, LEVEE_COUV.p, {
        duration: LEVEE_COUV.duree,
        ease: 'easeIn',
        onComplete: () => { if (animSeq.current === id) lancer(T, lien ? LIEN_VITESSE : LEVEE_COUV.vitesse); },
      });
      return;
    }
    let posee = false;
    const ressort = carton(T) ? SPRINGS.cover : T.feuilles ? SPRINGS.riffle : SPRINGS.paper;
    if (T.arriere && T.but === 0 && velocity == null) jouerSon('couverture-ouvrir');
    // Le carton se pose : ouverture (avant, p → 1), fermeture (avant, p → 0 ; arrière, p → 1),
    // réouverture par l'arrière (p → 0).
    const pose_ = (v: number): boolean => (T.but === 1 ? v >= 0.985 : v <= 0.015);
    const quand: Parameters<typeof poser> | null = !carton(T) ? null
      : T.couverture
        ? (T.but === 1 ? ['couverture-poser', { tasser: !lien, pouls: true }] : ['couverture-fermer', { tasser: true, pouls: false }])
        : (T.but === 1 ? ['couverture-fermer', { tasser: true, pouls: true }] : ['couverture-poser', { tasser: false, pouls: false }]);
    animRef.current = animate(p, T.but, {
      ...ressort,
      ...(velocity != null ? { velocity } : null),
      ...(delai ? { delay: delai } : null),
      onUpdate: quand ? (v: number) => {
        if (!posee && pose_(v)) { posee = true; poser(...quand); }
        if (lien && !riffleAnim.current && v >= LIEN_RIFFLE_P && r.get() === 0) lancerRiffle(T);
      } : undefined,
      onComplete: () => {
        if (animSeq.current !== id) return;
        const attendre: Promise<unknown>[] = [];
        if (tassement.current) attendre.push(tassement.current);
        if (riffleAnim.current) attendre.push(riffleAnim.current.then(() => undefined));
        if (attendre.length) Promise.all(attendre).then(() => { if (animSeq.current === id) atterrir(T); });
        else atterrir(T);
      },
    });
  }, [p, r, atterrir, poser, lancerRiffle]);

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
    if (enArrivee()) return; // l'arrivée (et son lien profond) mène
    const T = tourRef.current;
    const cible = cibleRef.current;
    if (T) {
      if (T.doigt || T.feuilles) return; // le doigt tient la feuille ; un feuilletage va au bout
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
      if (modePageRef.current && de >= 0 && !ferme(de) && coteRef.current !== coteCibleRef.current) glisser(coteCibleRef.current);
      return;
    }
    const coteCible = coteCibleRef.current;
    const zoomeMaintenant = getLoupe().zoome;
    if (vivant.current.reduced || zoomeMaintenant) {
      // Moins de mouvement, ou loupe zoomée : fondu court, sans courbure. La double page logique change
      // tout de suite (la mise à jour de la transition de vue est asynchrone). Sous la loupe, la vue
      // revient en haut de la nouvelle page, dans la même mise à jour.
      afficheRef.current = cible;
      const c: CotePage = modePageRef.current ? coteCible : 'gauche';
      coteRef.current = c;
      const appliquer = () => {
        setAffiche(cible); setCote(c); glisse.set(X(cible, c));
        if (zoomeMaintenant) ancrerLoupe('haut');
      };
      transitionDeVue('fondu', () => flushSync(appliquer), livreRef.current, false);
      if (!vivant.current.reduced) jouerSon('page', { vitesse: 0.3, gain: 0.7 });
      echo.current = cible;
      vivant.current.onIndexChange?.(cible);
      return;
    }
    // La couverture s'ouvre toujours sur la première double page (et s'y referme) ; le plat arrière
    // sur la dernière.
    const { dos: avecDos, n: nb } = dosRef.current;
    let vers = cible;
    if (de === -1) vers = 0;
    else if (avecDos && de === nb) vers = nb - 1;
    else if (cible === -1 && de > 0) vers = 0;
    else if (avecDos && cible === nb && de < nb - 1) vers = nb - 1;
    const avance = vers > de;
    const lo = Math.min(de, vers);
    const hi = Math.max(de, vers);
    const actuel = coteRef.current;
    const arrivee_: CotePage = modePageRef.current && vers === cible ? coteCible : 'gauche';
    const nouveau: Tour = {
      id: ++seq.current, lo, hi, but: avance ? 1 : 0, sens: avance ? -1 : 1, couverture: lo === -1, lance: false,
      coteLo: avance ? actuel : arrivee_, coteHi: avance ? arrivee_ : actuel, doigt: false, arriere: avecDos && hi === nb,
    };
    if (FEUILLETAGE && lo >= 0 && !nouveau.arriere && Math.abs(vers - de) >= RIFFLE_ECART) nouveau.feuilles = intermediaires(de, vers);
    tourRef.current = nouveau;
    p.set(avance ? 0 : 1);
    r.set(0);
    setTour(nouveau);
  }, [lancer, p, r, glisser, glisse, X]);
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
  // pilote p tout de suite, le ressort ne partira qu'au lâcher. Un tour différé attend sa séquence.
  React.useLayoutEffect(() => {
    const T = tour;
    if (!T || T.lance || pose) return;
    let annule = false;
    const el = livreRef.current;
    if (el) {
      el.setAttribute('data-gc-geste', carton(T) ? 'couverture' : 'page');
      if (carton(T)) mesurer();
    }
    if (T.differe) return;
    pret(espaceRef.current)
      .then(() => (T.doigt ? undefined : cadenceStable()))
      .then(() => {
        if (annule || tourRef.current !== T || T.lance || T.doigt) return;
        T.lance = true;
        const type: GesteType = T.feuilles ? 'riffle' : carton(T) ? 'couverture' : 'page';
        emettre(el, 'debut', type);
        if (T.feuilles) {
          lancerRiffle(T);
          lancer(T, undefined, T.feuilles.length * STAGGER.sommaire);
        } else {
          if (!carton(T)) jouerSon('page', { vitesse: 0.45 });
          lancer(T);
        }
      });
    return () => {
      annule = true;
      // Geste abandonné avant d'avoir commencé : rien ne doit rester « en cours ».
      if (!T.lance && !T.differe) {
        if (tourRef.current === T) tourRef.current = null;
        el?.removeAttribute('data-gc-geste');
      }
    };
  }, [tour, lancer, lancerRiffle, pose, mesurer]);

  // Enchaînement : un geste fini, on repart si la cible a encore bougé.
  React.useEffect(() => { if (!tour && !pose) pousser(); }, [tour, affiche, cote, pousser, pose]);

  // Index imposé par le parent (sauf l'écho de ce que le livre vient d'annoncer).
  React.useEffect(() => {
    if (pose) return;
    if (echo.current !== null && index === echo.current) return;
    echo.current = null;
    aller(index);
  }, [index, aller, pose]);

  // Livre fermé au repos : la couverture est à plat (p = 0) ; refermé derrière, le plat arrière est
  // posé à gauche (p = 1).
  React.useLayoutEffect(() => {
    if (tour || pose) return;
    if (affiche === -1) p.set(0);
    else if (dos && affiche === n) p.set(1);
  }, [tour, affiche, pose, p, dos, n]);

  // ---- Arrivée : le livre glisse sur la table et se pose ; lien profond : ouverture et feuilletage -----
  const finirArrivee = React.useCallback(() => {
    const A = arriveeRef.current;
    const el = livreRef.current;
    if (!A) return;
    A.arriveeFinie = true;
    const cam = el?.parentElement;
    if (cam) cam.style.willChange = '';
    if (A.tour) return; // le lien profond (feuilletage) finit à l'atterrissage
    if (A.vers != null && afficheRef.current !== A.vers) {
      // Lien profond : le livre s'ouvre (ouverture lestée) puis va à la page, par le moteur ordinaire.
      A.phase = 'lien';
      cibleRef.current = A.vers;
      coteCibleRef.current = A.cote;
      pousserRef.current();
      return;
    }
    A.phase = 'fini';
    el?.setAttribute('data-gc-arrivee', 'fini');
    if (afficheRef.current === -1) A.anims.push(animate(arrFin, 1, SPRINGS.settle));
    else arrFin.set(1);
    pousserRef.current();
  }, [arrFin]);

  /** Saute à la fin de l'arrivée et du lien profond (fondu de 150 ms ; rien si l'onglet est caché). */
  const sauter = React.useCallback((sansFondu = false) => {
    const A = arriveeRef.current;
    if (!A || A.phase === 'fini' || A.phase === 'attente') return;
    const el = livreRef.current;
    A.timers.forEach((t) => clearTimeout(t));
    A.anims.forEach((a) => a.stop());
    A.timers = [];
    A.anims = [];
    animSeq.current++;
    animRef.current?.stop();
    animRef.current = null;
    riffleAnim.current?.stop();
    riffleAnim.current = null;
    if (tourRef.current && !A.tour) emettre(el, 'fin', carton(tourRef.current) ? 'couverture' : 'page');
    const vers = A.vers ?? afficheRef.current;
    const c: CotePage = A.vers != null ? A.cote : coteRef.current;
    const actifs = [...A.actifs];
    A.actifs.clear();
    A.tour = null;
    A.arriveeFinie = true;
    A.phase = 'fini';
    const appliquer = () => {
      arr.set(1);
      present.set(1);
      arrFin.set(vers === -1 ? 1 : 0);
      p.set(0);
      r.set(0);
      tourRef.current = null;
      afficheRef.current = vers;
      coteRef.current = c;
      cibleRef.current = A.vers != null ? vers : cibleRef.current;
      coteCibleRef.current = c;
      setTour(null);
      setAffiche(vers);
      setCote(c);
      glisse.set(X(vers, c));
      if (el) {
        el.removeAttribute('data-gc-geste');
        el.setAttribute('data-gc-arrivee', 'fini');
        const cam = el.parentElement;
        if (cam) cam.style.willChange = '';
      }
    };
    for (const t of actifs) emettre(el, 'fin', t);
    const hors = typeof document !== 'undefined' && document.hidden;
    if (sansFondu || hors || vivant.current.reduced) { appliquer(); pousserRef.current(); return; }
    transitionDeVue('fondu', () => flushSync(appliquer), el, false, 'saut');
    if (A.vers != null) { echo.current = vers; vivant.current.onIndexChange?.(vers); }
  }, [arr, present, arrFin, p, r, glisse, X]);

  React.useEffect(() => {
    const A = arriveeRef.current;
    if (!A || A.phase !== 'attente' || pose) return;
    if (!geo || (enEcran && !vp)) return;
    const el = livreRef.current;
    const cam = el?.parentElement ?? null;
    if (!el) return;
    A.phase = 'prepa';
    el.setAttribute('data-gc-arrivee', 'en-cours');
    const force = typeof window !== 'undefined' && (window as unknown as { __gcArriveeToujours?: boolean }).__gcArriveeToujours === true;
    const tard = typeof performance !== 'undefined' && performance.now() > ARRIVEE_MAX_CHARGEMENT && !force;
    const cache = typeof document !== 'undefined' && document.hidden;
    if (vivant.current.reduced || tard || cache) {
      // Pas d'arrivée : le livre est là, ouvert sur sa double page s'il y a un lien.
      A.phase = 'fini';
      el.setAttribute('data-gc-arrivee', 'fini');
      arr.set(1);
      present.set(1);
      if (A.vers != null) {
        const v = A.vers;
        afficheRef.current = v;
        coteRef.current = A.cote;
        cibleRef.current = v;
        coteCibleRef.current = A.cote;
        setAffiche(v);
        setCote(A.cote);
        glisse.set(X(v, A.cote));
      } else arrFin.set(1);
      return;
    }
    // Lien profond (avec feuilletage) : la couverture et les feuilles sont montées (et peintes) AVANT que
    // rien ne bouge. Sans feuilletage : l'arrivée seule, puis le moteur ordinaire (finirArrivee).
    if (FEUILLETAGE && A.vers != null) {
      const v = A.vers;
      // (pour le lien, la feuille finale est légère elle aussi : la chaîne va de 0 à v)
      const T: Tour = {
        id: ++seq.current, lo: -1, hi: v, but: 1, sens: -1, couverture: true, lance: false,
        coteLo: 'gauche', coteHi: A.cote, doigt: false, differe: true, feuilles: v > 0 ? intermediaires(0, v, RIFFLE_MAX) : undefined,
      };
      A.tour = T;
      tourRef.current = T;
      p.set(0);
      r.set(0);
      setTour(T);
    }
    if (cam) cam.style.willChange = 'transform';
    let annule = false;
    (async () => {
      await new Promise<void>((ok) => requestAnimationFrame(() => ok()));
      await pret(el, 300);
      await cadenceStable();
      if (annule || A.phase !== 'prepa') return;
      A.phase = 'en-cours';
      present.set(1);
      A.actifs.add('arrivee');
      emettre(el, 'debut', 'arrivee');
      A.anims.push(animate(arr, 1, {
        ...SPRINGS.arrivee,
        onComplete: () => {
          if (!A.actifs.has('arrivee')) return;
          A.actifs.delete('arrivee');
          emettre(el, 'fin', 'arrivee');
          finirArrivee();
        },
      }));
      const T = A.tour;
      if (T) {
        A.timers.push(window.setTimeout(() => {
          if (A.tour !== T || tourRef.current !== T) return;
          T.lance = true;
          T.differe = false;
          A.actifs.add('couverture');
          emettre(el, 'debut', 'couverture');
          lancer(T);
        }, LIEN_COUVERTURE_MS));
      }
    })();
    return () => { annule = true; };
    // (une seule fois : dès que la géométrie et l'écran sont connus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, vp, enEcran, pose]);

  // Pendant l'arrivée : un toucher ou une touche saute à la fin ; un onglet caché saute tout.
  React.useEffect(() => {
    const A = arriveeRef.current;
    if (!A || A.phase === 'fini' || pose) return;
    let gardeClic = -1e9;
    const lien = A.vers != null;
    const onSaut = (e: Event) => {
      if (A.phase !== 'en-cours' && A.phase !== 'prepa' && A.phase !== 'lien') return;
      if (e.type === 'keydown') {
        const k = e as KeyboardEvent;
        if (k.repeat || k.key === 'Tab' || k.key === 'Shift' || k.key === 'Alt' || k.key === 'Control' || k.key === 'Meta') return;
      }
      if (lien) {
        // Lien profond : le geste ne sert qu'à sauter (aucune page ne tourne, aucune photo ne se lève).
        e.preventDefault();
        e.stopImmediatePropagation();
        gardeClic = performance.now();
      }
      sauter();
    };
    const onClic = (e: MouseEvent) => { if (performance.now() - gardeClic < 600) { e.preventDefault(); e.stopImmediatePropagation(); } };
    const onVisible = () => { if (document.hidden) sauter(true); };
    window.addEventListener('pointerdown', onSaut, true);
    window.addEventListener('keydown', onSaut, true);
    window.addEventListener('click', onClic, true);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pointerdown', onSaut, true);
      window.removeEventListener('keydown', onSaut, true);
      window.removeEventListener('click', onClic, true);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sauter, pose]);

  // Commandes impératives.
  React.useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      aller: (i, c) => (c ? allerA(i, c) : aller(i)),
      sauter: () => sauter(),
    };
    return () => { apiRef.current = null; };
  }, [apiRef, aller, allerA, sauter]);

  // ---- Clavier ---------------------------------------------------------------------------
  /** La main invisible (gestes au pointeur) : vrai si elle tourne la page, sinon le clavier fait un pas. */
  const mainRef = React.useRef<((dir: 1 | -1) => boolean) | null>(null);
  React.useEffect(() => {
    if (!keyboard || pose) return;
    const onKey = (e: KeyboardEvent) => {
      // Déjà consommée (loupe zoomée qui déplace la vue, menu…) : rien.
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': e.preventDefault(); if (!mainRef.current?.(1)) pas(1); break;
        case 'ArrowLeft': case 'PageUp': e.preventDefault(); if (!mainRef.current?.(-1)) pas(-1); break;
        case 'Home': e.preventDefault(); allerA(min, 'gauche'); break;
        case 'End': e.preventDefault(); allerA(maxOuvert, 'gauche'); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, pose, pas, allerA, min, maxOuvert]);

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
  const poseCoin = pose?.coin;
  const tourPose = React.useMemo<Tour | null>(() => {
    if (poseVers == null || poseCoin) return null;
    const de = affiche;
    let vers = borne(poseVers);
    if (vers === de) return null;
    if (de === -1) vers = 0;
    else if (dos && de === n) vers = n - 1;
    else if (vers === -1 && de > 0) vers = 0;
    else if (dos && vers === n && de < n - 1) vers = n - 1;
    const avance = vers > de;
    const lo = Math.min(de, vers);
    const hi = Math.max(de, vers);
    const c = coteRef.current;
    const t: Tour = {
      id: -1, lo, hi, but: avance ? 1 : 0, sens: avance ? -1 : 1, couverture: lo === -1, lance: true,
      coteLo: avance ? c : 'droite', coteHi: avance ? 'gauche' : c, doigt: false, arriere: dos && hi === n,
    };
    if (FEUILLETAGE && lo >= 0 && !t.arriere && Math.abs(vers - de) >= RIFFLE_ECART) t.feuilles = intermediaires(de, vers);
    return t;
  }, [poseVers, poseCoin, affiche, borne, dos, n]);
  const poseP = pose?.p;
  const poseR = pose?.r;
  const poseArrivee = pose?.arrivee;

  // ---- Ce qui est monté --------------------------------------------------------------------
  const T = pose ? tourPose : tour;
  const couv = T ? T.couverture : affiche === -1;
  /** Plat arrière en jeu : il se lève, ou le livre est refermé derrière. */
  const arr_ = T ? !!T.arriere : dos && affiche === n;
  const feuille: (Pick<Tour, 'id' | 'lo' | 'hi' | 'sens' | 'couverture' | 'feuilles' | 'arriere'>) | null = T
    ?? (affiche === -1 ? { id: 0, lo: -1, hi: 0, sens: -1, couverture: true }
      : arr_ ? { id: 0, lo: n - 1, hi: n, sens: -1, couverture: false, arriere: true } : null);

  // Mouvement de caméra de l'ouverture : livre fermé centré → cadrage ouvert ; la caméra recule juste
  // ce qu'il faut quand la couverture se dresse (elle ne dépasse jamais sa taille au repos). Quand la
  // couverture se pose, le livre se tasse de 2,5 px.
  // Plat arrière : symétrique (le livre refermé derrière est centré sur sa moitié gauche).
  const livreT = useTransform([p, tasse], ([v, ts]: number[]) => {
    if (!couv && !arr_) return 'none';
    const t = clamp(v, 0, 1);
    const g = geoRef.current;
    const x = couv ? -25 * (1 - t) : 25 * t;
    return `translateX(${r3(x)}%) translateY(${r3(ts)}px) scale(${r3(reculCouverture(v, g?.W ?? 0, g?.H ?? 0, zoomRef.current))})`;
  });
  // (plancher : un calque à opacité nulle ne serait peint et rastérisé qu'en plein geste)
  const ombreGauche = useTransform(p, (v) => (couv ? Math.max(PLANCHER, lisse(0.55, 1, v)) : 1));
  // Plat arrière : la moitié droite se vide quand il se lève (l'ombre du carton s'en va avec lui).
  const ombreDroite = useTransform(p, (v) => (arr_ ? Math.max(PLANCHER, 1 - lisse(0, 0.45, v)) : 1));
  // Livre fermé : il est épais, son ombre est plus dense ; elle s'allège quand la couverture se lève
  // (devant, à droite) ; elle naît quand le plat arrière se pose (à gauche).
  const ombreEpaisseur = useTransform(p, (v) => (couv ? 1 - lisse(0, 0.45, v) : arr_ ? Math.max(PLANCHER, lisse(0.55, 1, v)) : 0));
  // Invitation à ouvrir : arrivée finie × couverture encore à plat.
  const invitOp = useTransform([arrFin, p], ([a, v]: number[]) => Math.max(PLANCHER, a * (1 - lisse(0, 0.06, v))));

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
  // quittée à la page d'arrivée). Tour né d'un coin : elle ne part qu'au relais (aucun saut).
  const camX = useTransform([p, glisse], ([pv, gv]: number[]) => {
    if (!cadre) return 0;
    if (!modePage) return cadre.cx;
    if (T && geoRef.current) {
      const x0 = X(T.lo, T.coteLo);
      const x1 = X(T.hi, T.coteHi);
      let c = clamp(pv, 0, 1);
      if (T.pCam != null) c = T.sens < 0 ? clamp((c - T.pCam) / (1 - T.pCam), 0, 1) : clamp(c / T.pCam, 0, 1);
      else if (T.coin) c = T.sens < 0 ? 0 : 1; // coin pas encore relayé : la caméra reste sur la page
      return x0 + ((x1 - x0) * (1 - Math.cos(Math.PI * c))) / 2;
    }
    return gv;
  });
  const transformMonde = React.useCallback((x: number) => {
    if (!cadre) return 'none';
    const { tx, ty } = translationMonde(cadre, x, dpr);
    return `translate(${tx}px, ${ty}px) scale(${cadre.s})`;
  }, [cadre, dpr]);
  const mondeT = useTransform(camX, transformMonde);

  // Rotation vers le cadrage « page », loupe zoomée : la page affichée est celle que la loupe lisait.
  const modeAvant = React.useRef(modePage);
  React.useLayoutEffect(() => {
    if (modeAvant.current === modePage) return;
    modeAvant.current = modePage;
    const L = getLoupe();
    if (!modePage || !L.zoome || !L.cote || L.cote === coteRef.current || afficheRef.current < 0 || tourRef.current) return;
    coteRef.current = L.cote;
    coteCibleRef.current = L.cote;
    glisse.set(X(afficheRef.current, L.cote));
    setCote(L.cote);
  }, [modePage, glisse, X]);

  // Au repos (et à chaque changement d'écran) : la caméra se pose sur la page affichée, écrite tout de
  // suite (le prochain passage de Motion n'aurait lieu qu'après la première image). La loupe reçoit le
  // rectangle du contenu (px d'écran, à z = 1) et la page visible.
  React.useLayoutEffect(() => {
    if (!enEcran || !cadre) return;
    if (tourRef.current || glisseAnim.current) return;
    const d = doigtRef.current;
    if (d && d.etat !== 'attente' && d.etat !== 'ignore') return;
    const x = modePage ? X(affiche, cote) : cadre.cx;
    glisse.set(X(affiche, cote));
    if (mondeRef.current) mondeRef.current.style.transform = transformMonde(x);
    const g = geoRef.current;
    const origine = surfaceRef.current?.closest('.gc-ecran')?.getBoundingClientRect();
    if (g && origine) {
      const { tx, ty } = translationMonde(cadre, x);
      const z = zoomRef.current;
      const cxs = g.stageW / 2;
      const cys = g.stageH / 2;
      const vers = (sx: number, sy: number) => [origine.left + tx + (cxs + z * (sx - cxs)) * cadre.s, origine.top + ty + (cys + z * (sy - cys)) * cadre.s];
      let x0 = g.bookX;
      let x1 = g.bookX + 2 * g.W;
      if (affiche === -1) { x0 = g.bookX + g.W / 2; x1 = x0 + g.W; } // couverture fermée, centrée
      else if (modePage) { x0 = g.bookX + (cote === 'gauche' ? 0 : g.W); x1 = x0 + g.W; }
      const [ax, ay] = vers(x0, g.bookY);
      const [bx, by] = vers(x1, g.bookY + g.H);
      publierContenuLoupe({ x: Math.round(ax), y: Math.round(ay), w: Math.round(bx - ax), h: Math.round(by - ay) }, modePage && affiche >= 0 ? cote : null);
    }
  }, [enEcran, cadre, affiche, cote, modePage, glisse, X, transformMonde]);

  // Cadrage « page » : la caméra se déplace à chaque page ; le monde est un calque composité, rastérisé
  // à l'échelle de l'écran (rendu net). À chaque changement d'échelle (rotation, loupe posée à un autre
  // facteur), on le laisse se repeindre puis on le promeut de nouveau (sinon il garderait sa trame
  // d'avant, floue).
  React.useLayoutEffect(() => {
    const el = mondeRef.current;
    if (!el || !modePage || !cadre) return;
    el.style.willChange = '';
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => { el.style.willChange = 'transform'; }); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); el.style.willChange = ''; };
  }, [modePage, cadre?.s, loupe.z]);

  // Pose figée : posée après les useTransform ci-dessus (abonnés dans leurs propres effets).
  React.useLayoutEffect(() => {
    if (tourPose && poseP != null) {
      p.set(tourPose.but === 1 ? poseP : 1 - poseP);
      r.set(poseR ?? poseP);
    }
    if (poseArrivee != null) { arr.set(poseArrivee); present.set(1); }
  }, [tourPose, poseP, poseR, poseArrivee, p, r, arr, present]);
  React.useLayoutEffect(() => {
    if (!poseCoin || !geo) return;
    const R = rabats.current[poseCoin.cote];
    R.haut.set(poseCoin.angle === 'haut' ? 1 : 0);
    R.fx.set(poseCoin.x * geo.W);
    R.fy.set(poseCoin.y * geo.H);
    R.op.set(1);
  }, [poseCoin, geo]);

  // ---- Coin : rabats montés 500 ms après que la page s'est posée ------------------------------
  const coinPossible = COIN_2D && !reduced && !zoome && affiche >= 0 && affiche <= maxOuvert && !!geo;
  React.useEffect(() => {
    setCoinPret(false);
    if (pose || tour || !coinPossible) return;
    const t = window.setTimeout(() => {
      // Au repos : le rabat est à plat sur l'angle du bas (pli de taille nulle : rien ne se voit).
      const g = geoRef.current;
      if (g) {
        for (const c of ['gauche', 'droite'] as const) {
          const R = rabats.current[c];
          const [ax, ay] = angleSaisi('bas', g.W, g.H);
          R.haut.set(0); R.fx.set(ax); R.fy.set(ay); R.op.set(1);
        }
      }
      setCoinPret(true);
    }, COIN_DELAI);
    return () => clearTimeout(t);
  }, [affiche, cote, tour, pose, coinPossible, modePage]);

  /** Le côté peut-il se saisir par le coin (au repos) ? */
  const coteSaisissable = React.useCallback((c: CotePage): boolean => {
    const a = afficheRef.current;
    if (a < 0) return false;
    if (modePageRef.current && coteRef.current !== c) return false;
    return c === 'droite' ? a + 1 <= maxOuvert : a - 1 >= 0;
  }, [maxOuvert]);

  // ---- Gestes au pointeur (doigt, stylet, souris) ---------------------------------------------
  const actions = React.useRef({ pas, glisser, lancer, reposerRabat, coteSaisissable });
  actions.current = { pas, glisser, lancer, reposerRabat, coteSaisissable };
  const coinMonte = React.useRef<{ gauche: boolean; droite: boolean }>({ gauche: false, droite: false });
  React.useEffect(() => {
    if (!gestes || pose) return;
    const surface = enEcran ? surfaceRef.current : (livreRef.current?.closest('.gc-stage') as HTMLElement | null);
    if (!surface) return;
    let gardeClic = -1e9;
    let dernierType = 'mouse';
    let curseur: string | null = null;
    /** Survol à la souris : le coin levé (côté et angle), ou rien. */
    let survol: { cote: CotePage; angle: AngleCoin } | null = null;

    const poserCurseur = (c: string | null) => {
      if (c === curseur) return;
      curseur = c;
      if (c) surface.setAttribute('data-gc-curseur', c);
      else surface.removeAttribute('data-gc-curseur');
    };

    const pageAEcran = () => {
      const slot = livreRef.current?.querySelector('.gc-livre__emplacement--droite');
      return slot ? slot.getBoundingClientRect().width : 0;
    };

    /** Ce qu'il y a sous le pointeur : un coin, une marge qui tourne la page, la couverture, ou rien. */
    type Zone = { type: 'coin'; cote: CotePage; angle: AngleCoin } | { type: 'marge' | 'couverture' } | null;
    const zoneSous = (x: number, y: number, cible: EventTarget | null): Zone => {
      const lv = livreRef.current;
      if (!lv || surControle(cible)) return null;
      const g = lv.querySelector('.gc-livre__emplacement--gauche')?.getBoundingClientRect();
      const dr = lv.querySelector('.gc-livre__emplacement--droite')?.getBoundingClientRect();
      if (!g || !dr) return null;
      if (ferme(afficheRef.current)) {
        const c = lv.querySelector('.gc-livre-couv')?.getBoundingClientRect() ?? dr;
        return x >= c.left && x <= c.right && y >= c.top && y <= c.bottom ? { type: 'couverture' } : null;
      }
      if (surObjet(cible)) return null;
      const page = modePageRef.current;
      const visibles: CotePage[] = page ? [coteRef.current] : ['gauche', 'droite'];
      for (const c of visibles) {
        const rc = c === 'gauche' ? g : dr;
        const xn = c === 'droite' ? (x - rc.left) / rc.width : (rc.right - x) / rc.width;
        const yn = (y - rc.top) / rc.height;
        const angle = zoneCoin(xn, yn);
        if (angle && actions.current.coteSaisissable(c)) return { type: 'coin', cote: c, angle };
      }
      // Marges extérieures (mêmes règles que le toucher).
      const pg = page ? (coteRef.current === 'gauche' ? g : dr) : null;
      const gauche = pg ? pg.left : g.left;
      const droite = pg ? pg.right : dr.right;
      const haut = Math.min(g.top, dr.top);
      const bas = Math.max(g.bottom, dr.bottom);
      const marge = MARGE_TOUCHER * dr.width;
      if (y < haut - 0.05 * (bas - haut) || y > bas + 0.05 * (bas - haut)) return null;
      const a = afficheRef.current;
      if (x >= gauche - marge * 0.3 && x < gauche + marge && (a > min || (page && coteRef.current === 'droite'))) return { type: 'marge' };
      if (x > droite - marge && x <= droite + marge * 0.3 && (a < max || (page && coteRef.current === 'gauche'))) return { type: 'marge' };
      return null;
    };

    /** Lève le coin (survol ou doigt posé) : le rabat apparaît et se soulève de 2,5 % (settle). */
    const leverCoin = (c: CotePage, angle: AngleCoin) => {
      const g = geoRef.current;
      const R = rabats.current[c];
      if (!g) return;
      R.anim.forEach((a) => a.stop());
      const [ax, ay] = angleSaisi(angle, g.W, g.H);
      const [lx, ly] = leve(angle, g.W, g.H);
      R.haut.set(angle === 'haut' ? 1 : 0);
      R.fx.set(ax);
      R.fy.set(ay);
      R.op.set(1);
      R.anim = [animate(R.fx, lx, SPRINGS.settle), animate(R.fy, ly, SPRINGS.settle)];
      jouerSon('coin', { gain: 0.35, vitesse: 0.2 });
    };

    // Survol à la souris (aucune règle :hover) : curseur, et levée du coin.
    const finirSurvol = () => {
      if (!survol) return;
      const s = survol;
      survol = null;
      const el = livreRef.current;
      actions.current.reposerRabat(s.cote, () => { if (!survol) emettre(el, 'fin', 'coin'); });
    };
    const survoler = (e: PointerEvent) => {
      if (tourRef.current || glisseAnim.current || enArrivee() || getLoupe().zoome) { poserCurseur(null); finirSurvol(); return; }
      const z = zoneSous(e.clientX, e.clientY, e.target);
      poserCurseur(z?.type === 'coin' ? 'grab' : z ? 'pointer' : null);
      const coinOk = z?.type === 'coin' && COIN_2D && coinMonte.current[z.cote];
      if (coinOk && z?.type === 'coin') {
        if (survol && survol.cote === z.cote && survol.angle === z.angle) return;
        if (survol) finirSurvol();
        survol = { cote: z.cote, angle: z.angle };
        emettre(livreRef.current, 'debut', 'coin');
        leverCoin(z.cote, z.angle);
      } else finirSurvol();
    };

    // Le feuillet est monté dès que le sens du glisser se dessine (comme la préparation clavier) :
    // il est prêt quand le glisser est décidé. Rien n'est monté pour un simple toucher.
    const amorcer = (d: Doigt) => {
      const T0 = tourRef.current;
      if (T0) {
        if (T0.feuilles || T0.differe || enArrivee()) { d.intention = null; d.etat = 'ignore'; return; }
        d.reprise = true; d.intention = 'tour'; return;
      }
      if (glisseAnim.current) { d.reprise = true; d.intention = 'glisse'; return; }
      if (vivant.current.reduced) { d.intention = 'pas'; return; }
      const a = afficheRef.current;
      const page = modePageRef.current;
      const c = coteRef.current;
      if (page && a >= 0 && !ferme(a) && ((d.dir < 0 && c === 'gauche') || (d.dir > 0 && c === 'droite'))) { d.intention = 'glisse'; return; }
      const vers = d.dir < 0 ? a + 1 : a - 1;
      if (vers < min || vers > max) { d.intention = 'rebond'; return; }
      d.amorce = monterTour(a, vers, true);
      d.intention = 'tour';
    };

    /** Monte le feuillet d'un tour tenu au doigt, de a vers `vers` (voisine). */
    const monterTour = (a: number, vers: number, doigt: boolean, coin?: CotePage): Tour => {
      const page = modePageRef.current;
      const c = coteRef.current;
      const avance = vers > a;
      const lo = Math.min(a, vers);
      const arrivee_: CotePage = page && !avance ? 'droite' : 'gauche';
      const hi = Math.max(a, vers);
      const nouveau: Tour = {
        id: ++seq.current, lo, hi, but: avance ? 1 : 0, sens: avance ? -1 : 1, couverture: lo === -1, lance: false,
        coteLo: avance ? c : arrivee_, coteHi: avance ? arrivee_ : c, doigt, ...(coin ? { coin } : null),
        arriere: dosRef.current.dos && hi === dosRef.current.n,
      };
      tourRef.current = nouveau;
      p.set(avance ? 0 : 1);
      r.set(0);
      setTour(nouveau);
      return nouveau;
    };

    const annulerAmorce = (d: Doigt) => {
      const T0 = d.amorce;
      d.amorce = null;
      d.intention = null;
      d.reprise = false;
      if (!T0 || T0.lance) return;
      if (tourRef.current === T0) tourRef.current = null;
      livreRef.current?.removeAttribute('data-gc-geste');
      livreRef.current?.removeAttribute('data-gc-coin');
      setTour(null);
      setCoinActif(null);
    };

    // ---- Coin saisi --------------------------------------------------------------------------
    /** Doigt posé dans une zone d'angle : le coin se lève, le feuillet (et un seul rabat) est monté. */
    const saisirCoin = (d: Doigt, c: CotePage, angle: AngleCoin) => {
      const a = afficheRef.current;
      const vers = c === 'droite' ? a + 1 : a - 1;
      const el = livreRef.current;
      if (!COIN_2D) {
        // Repli : le coin se lève sur le feuillet 3D (p = 0,03) ; ensuite, suivi horizontal seulement.
        d.dir = c === 'droite' ? -1 : 1;
        d.amorce = monterTour(a, vers, true);
        d.intention = 'tour';
        animate(p, c === 'droite' ? COIN_P_REPLI : 1 - COIN_P_REPLI, SPRINGS.settle);
        jouerSon('coin', { gain: 0.35, vitesse: 0.2 });
        return;
      }
      const R = rabats.current[c];
      d.coin = { cote: c, angle, fx0: 0, fy0: 0, xc: 0, yc: 0, relais: false };
      d.amorce = monterTour(a, vers, true, c);
      setCoinActif(c);
      el?.setAttribute('data-gc-coin', c);
      if (survol && survol.cote === c && survol.angle === angle) { survol = null; emettre(el, 'fin', 'coin'); return; } // déjà levé au survol
      if (survol) finirSurvol();
      leverCoin(c, angle);
      void R;
    };

    /** Le doigt quitte le coin sans tourner la page : le rabat retombe, le feuillet est démonté. */
    const lacherCoin = (d: Doigt, annoncer: boolean, immediat = false) => {
      const co = d.coin;
      if (!co) return;
      const el = livreRef.current;
      const T0 = d.amorce;
      d.coin = null;
      if (immediat) {
        // Un autre geste commence : le feuillet du coin est démonté tout de suite (pli remis à plat).
        const R = rabats.current[co.cote];
        R.anim.forEach((a) => a.stop());
        const g = geoRef.current;
        if (g) { const [ax, ay] = angleSaisi(co.angle, g.W, g.H); R.fx.set(ax); R.fy.set(ay); }
        d.amorce = null;
        if (T0 && !T0.lance && tourRef.current === T0) {
          tourRef.current = null;
          el?.removeAttribute('data-gc-geste');
          el?.removeAttribute('data-gc-coin');
          setTour(null);
          setCoinActif(null);
        }
        return;
      }
      actions.current.reposerRabat(co.cote, () => {
        if (annoncer) emettre(el, 'fin', 'coin');
        if (T0 && !T0.lance && tourRef.current === T0) {
          tourRef.current = null;
          el?.removeAttribute('data-gc-geste');
          el?.removeAttribute('data-gc-coin');
          setTour(null);
          setCoinActif(null);
        }
      });
      d.amorce = null;
    };

    /** Le coin suit le doigt ; au-delà de la profondeur de relais, le tourne-page 3D prend la main. */
    const piloterCoin = (d: Doigt, e: PointerEvent) => {
      const co = d.coin;
      const g = geoRef.current;
      if (!co || !g) return;
      const R = rabats.current[co.cote];
      const sx = co.cote === 'droite' ? 1 : -1;
      const fx = co.fx0 + (sx * (e.clientX - co.xc)) / d.k;
      const fy = co.fy0 + (e.clientY - co.yc) / d.k;
      R.fx.set(fx);
      R.fy.set(fy);
      const pl = plier(co.angle, fx, fy, g.W, g.H);
      if (pl.lambda > RELAIS_COIN) relayer(d, e.clientX, pl.ex);
    };

    /** Relais : p est résolu pour que le bord du feuillet 3D soit là où est l'angle replié. */
    const relayer = (d: Doigt, clientX: number, ex: number) => {
      const co = d.coin;
      const T0 = tourRef.current;
      const g = geoRef.current;
      if (!co || !T0 || !g || co.relais) return;
      co.relais = true;
      const el = livreRef.current;
      const pr = pRelais({ ex }, co.cote, g.W);
      p.set(pr);
      T0.pCam = pr;
      d.p0 = pr + (clientX - d.x0) / d.L;
      d.etat = 'tour';
      d.reprise = false;
      emettre(el, 'debut', 'page');
      const R = rabats.current[co.cote];
      R.anim.forEach((a) => a.stop());
      R.anim = [animate(R.op, 0, { duration: COIN_FONDU, ease: 'easeOut', onComplete: () => emettre(el, 'fin', 'coin') })];
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
        if (!deja) emettre(el, 'debut', carton(T0) ? 'couverture' : 'page');
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
      const vp_ = -v / d.L; // largeurs de page par seconde, + vers hi
      let but: 0 | 1;
      if (Math.abs(vp_) >= VIF) but = vp_ > 0 ? 1 : 0;
      else if (d.reprise) but = pv >= 0.5 ? 1 : 0;
      else if (d.p0 <= 0.5) but = pv >= SEUIL_P ? 1 : 0;
      else but = pv <= 1 - SEUIL_P ? 0 : 1;
      T0.but = but;
      T0.doigt = false;
      T0.lance = true;
      cibleRef.current = but ? T0.hi : T0.lo;
      coteCibleRef.current = but ? T0.coteHi : T0.coteLo;
      // Le son du papier suit la vitesse du geste.
      jouerSon('page', { vitesse: clamp(Math.abs(vp_) / 3, 0, 1) });
      actions.current.lancer(T0, vp_);
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

    /** Abandonne le doigt en cours (la loupe prend la main) : la feuille retombe, rien ne tourne. */
    const abandonner = () => {
      const d = doigtRef.current;
      if (!d) return;
      doigtRef.current = null;
      try { if (surface.hasPointerCapture(d.id)) surface.releasePointerCapture(d.id); } catch { /* rien */ }
      if (d.etat === 'coin') { lacherCoin(d, true); return; }
      if (d.coin && !d.coin.relais && d.etat === 'attente') { lacherCoin(d, false); return; }
      if (d.etat === 'tour') relacherTour(d, 0);
      else if (d.etat === 'glisse') relacherGlisse(d, 0);
      else if (d.etat === 'rebond') relacherRebond();
      else annulerAmorce(d);
    };
    const onLoupe = (e: Event) => { if ((e as CustomEvent<LoupeDetail>).detail?.phase === 'debut') abandonner(); };

    // Toucher : la couverture s'ouvre ; une page peut le prendre (vidéo) ; sinon, la marge extérieure
    // tourne la page (pas sous la loupe : seuls les objets répondent).
    const toucher = (e: PointerEvent, zoomeAuDebut: boolean) => {
      const cible = e.target instanceof Element ? e.target : null;
      if (!cible || surControle(cible)) return; // le contenu gère son propre clic
      // Livre fermé : toucher la couverture l'ouvre (devant), toucher le plat arrière le rouvre.
      if (ferme(afficheRef.current) && !tourRef.current) { actions.current.pas(afficheRef.current === -1 ? 1 : -1); return; }
      const face = cible.closest('.gc-livre-face');
      if (face && livreRef.current?.contains(face)) {
        const rf = face.getBoundingClientRect();
        const t: ToucherPage = {
          spreadId: face.getAttribute('data-gc-spread') ?? '',
          side: face.classList.contains('gc-livre-face--left') ? 'left' : 'right',
          x: (e.clientX - rf.left) / (rf.width || 1),
          y: (e.clientY - rf.top) / (rf.height || 1),
          cible,
        };
        const libre = cible.dispatchEvent(new CustomEvent<ToucherPage>(TOUCHER_EVENT, { bubbles: true, cancelable: true, detail: t }));
        const pris = vivant.current.onToucherPage?.(t) === true;
        if (pris || !libre) return;
      }
      if (zoomeAuDebut || getLoupe().zoome) return;
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
      const zoomeAuDebut = getLoupe().zoome;
      const d: Doigt = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, etat: 'attente', intention: null, dir: 0,
        L, k: L / g.W, p0: 0, g0: 0, r0: 0, reprise: false, amorce: null, coteDepart: coteRef.current,
        pts: [{ t: e.timeStamp, x: e.clientX }], zoome: zoomeAuDebut, coin: null,
      };
      doigtRef.current = d;
      if (zoomeAuDebut) return; // sous la loupe : aucun glisser ne tourne la page
      // Zone d'angle : le coin se lève tout de suite, le feuillet est préparé pendant ce temps.
      if (!tourRef.current && !glisseAnim.current && !enArrivee() && !vivant.current.reduced) {
        const z = zoneSous(e.clientX, e.clientY, e.target);
        if (z?.type === 'coin' && (!COIN_2D || coinMonte.current[z.cote])) {
          saisirCoin(d, z.cote, z.angle);
          poserCurseur('grabbing');
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      const d = doigtRef.current;
      if (!d) {
        if (e.pointerType === 'mouse' && e.buttons === 0) survoler(e);
        return;
      }
      if (e.pointerId !== d.id) return;
      d.pts.push({ t: e.timeStamp, x: e.clientX });
      garder(d.pts, e.timeStamp);
      if (d.etat === 'ignore') return;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (d.zoome) { if (Math.hypot(dx, dy) >= SEUIL_GLISSER) d.etat = 'ignore'; return; }
      if (d.coin && d.etat === 'attente') {
        if (Math.hypot(dx, dy) < SEUIL_GLISSER) return;
        // Vers l'intérieur de la page (ou le long de son bord, vers l'intérieur) : le coin suit le doigt.
        const sx = d.coin.cote === 'droite' ? 1 : -1;
        const dxn = sx * dx;
        const dedans = dxn < 0 || (d.coin.angle === 'haut' ? dy > Math.abs(dx) : -dy > Math.abs(dx));
        if (dedans) {
          const R = rabats.current[d.coin.cote];
          R.anim.forEach((a) => a.stop());
          R.anim = [];
          d.coin.fx0 = R.fx.get();
          d.coin.fy0 = R.fy.get();
          d.coin.xc = e.clientX;
          d.coin.yc = e.clientY;
          d.etat = 'coin';
          try { surface.setPointerCapture(d.id); } catch { /* pointeur déjà relâché */ }
          poserCurseur('grabbing');
          emettre(livreRef.current, 'debut', 'coin');
          piloterCoin(d, e);
          return;
        }
        // Vers l'extérieur : ce n'est pas un coin ; le geste ordinaire décide.
        lacherCoin(d, false, true);
      }
      if (d.etat === 'coin') { piloterCoin(d, e); return; }
      if (d.etat === 'attente') {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (ay >= SEUIL_GLISSER && ay > ax) { d.etat = 'ignore'; annulerAmorce(d); return; }
        if (ax < SEUIL_AMORCE || ax <= ay) return;
        const dir = dx < 0 ? -1 : 1;
        if (d.dir !== dir) { annulerAmorce(d); d.dir = dir; amorcer(d); }
        if (ax < SEUIL_GLISSER) return;
        demarrer(d);
        if ((d.etat as Doigt['etat']) === 'ignore') return;
        try { surface.setPointerCapture(d.id); } catch { /* pointeur déjà relâché */ }
        poserCurseur('grabbing');
      }
      piloter(d, dx);
    };

    const onUp = (e: PointerEvent) => {
      const d = doigtRef.current;
      if (!d || e.pointerId !== d.id) return;
      doigtRef.current = null;
      const annule = e.type === 'pointercancel';
      try { if (surface.hasPointerCapture(d.id)) surface.releasePointerCapture(d.id); } catch { /* rien */ }
      if (dernierType === 'mouse' && !annule) {
        const z = zoneSous(e.clientX, e.clientY, e.target);
        poserCurseur(z?.type === 'coin' ? 'grab' : z ? 'pointer' : null);
      } else poserCurseur(null);
      if (d.etat === 'coin') {
        // Lâché avant le relais : un lancer vers l'intérieur tourne la page, sinon le rabat retombe.
        gardeClic = e.timeStamp;
        const v = annule ? 0 : vitesse(d.pts, e.timeStamp);
        const sx = d.coin?.cote === 'droite' ? 1 : -1;
        const g = geoRef.current;
        if (!annule && d.coin && g && -sx * v / d.L >= VIF) {
          const R = rabats.current[d.coin.cote];
          const pl = plier(d.coin.angle, R.fx.get(), R.fy.get(), g.W, g.H);
          relayer(d, e.clientX, pl.ex);
          relacherTour(d, v);
        } else lacherCoin(d, true);
        return;
      }
      if (d.coin && !d.coin.relais && d.etat === 'attente') {
        // Simple toucher d'un coin : il se lève et retombe, la page ne tourne pas.
        lacherCoin(d, false);
        return;
      }
      if (d.etat === 'attente' || d.etat === 'ignore') {
        const etat = d.etat;
        annulerAmorce(d);
        const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
        if (!annule && etat === 'attente' && dist < SEUIL_GLISSER && e.timeStamp - d.t0 < TOUCHER_MAX_MS) toucher(e, d.zoome);
        return;
      }
      gardeClic = e.timeStamp;
      const v = annule ? 0 : vitesse(d.pts, e.timeStamp);
      if (d.etat === 'tour') relacherTour(d, v);
      else if (d.etat === 'glisse') relacherGlisse(d, v);
      else relacherRebond();
    };

    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || doigtRef.current) return;
      poserCurseur(null);
      finirSurvol();
    };

    // Après un glisser, le clic qui suit (souris, ou clic fantôme du toucher) ne doit rien déclencher.
    const onClick = (e: MouseEvent) => {
      if (e.timeStamp - gardeClic < 500 && !surControle(e.target)) { e.stopPropagation(); e.preventDefault(); }
    };
    const onDragStart = (e: Event) => e.preventDefault();
    const onMenu = (e: Event) => { if (dernierType !== 'mouse') e.preventDefault(); };

    // ---- Main invisible (clavier) ------------------------------------------------------------
    // → ou ← : une main invisible tourne la page par le même chemin qu'un doigt (coin saisi, rabat, relais
    // au feuillet 3D, lancer) : le coin bas se soulève, suit un arc en accélérant, puis la page part sur
    // son élan. Une traînée d'étincelles dorées suit la main. Faux si elle ne peut pas (fermé, cadrage
    // « page », mouvement réduit, bout du livre…) : le clavier fait alors un pas ordinaire.
    let main = 0;
    const mainInvisible = (dir: 1 | -1): boolean => {
      if (main) return true; // une main tourne déjà la page : la touche est bue
      if (doigtRef.current || tourRef.current || glisseAnim.current || enArrivee() || getLoupe().zoome) return false;
      if (!COIN_2D || vivant.current.reduced || modePageRef.current || ferme(afficheRef.current)) return false;
      const c: CotePage = dir > 0 ? 'droite' : 'gauche';
      const vers = afficheRef.current + dir;
      if (vers < min || vers > max || !coinMonte.current[c] || !actions.current.coteSaisissable(c)) return false;
      const g = geoRef.current;
      const L = pageAEcran();
      const rc = livreRef.current?.querySelector(`.gc-livre__emplacement--${c}`)?.getBoundingClientRect();
      if (!g || !rc || !(L > 0)) return false;
      const sx = c === 'droite' ? 1 : -1;
      const x0 = c === 'droite' ? rc.right - 0.03 * rc.width : rc.left + 0.03 * rc.width;
      const y0 = rc.bottom - 0.03 * rc.height;
      const t0 = performance.now();
      const d: Doigt = {
        id: -1, x0, y0, t0, etat: 'attente', intention: null, dir: 0, L, k: L / g.W, p0: 0, g0: 0, r0: 0,
        reprise: false, amorce: null, coteDepart: coteRef.current, pts: [{ t: t0, x: x0 }], zoome: false, coin: null,
      };
      doigtRef.current = d;
      saisirCoin(d, c, 'bas');
      if (!d.coin) { annulerAmorce(d); doigtRef.current = null; return false; }
      const trainee = traineeDoree();
      const LEVER = 170; // ms : le coin se soulève sous la main
      const TIRER = 520; // ms : la main tire le coin en arc
      const D = 0.8 * L; // course de la main vers le dos du livre
      const H = 0.14 * rc.height; // hauteur de l'arc
      const image = () => {
        main = 0;
        const now = performance.now();
        if (doigtRef.current !== d) { trainee.finir(); return; } // abandonnée (la loupe a pris la main)
        const ecoule = now - t0;
        if (ecoule < LEVER) {
          trainee.ajouter(x0, y0, ecoule / LEVER / 2);
          main = requestAnimationFrame(image);
          return;
        }
        const co = d.coin;
        if (d.etat === 'attente' && co) {
          const R = rabats.current[c];
          R.anim.forEach((a) => a.stop());
          R.anim = [];
          co.fx0 = R.fx.get();
          co.fy0 = R.fy.get();
          co.xc = x0;
          co.yc = y0;
          d.etat = 'coin';
          emettre(livreRef.current, 'debut', 'coin');
        }
        const u = Math.min(1, (ecoule - LEVER) / TIRER);
        // part doucement, accélère : la page s'en va sur l'élan, comme lancée d'un geste
        const x = x0 - sx * D * u * u * (1.6 - 0.6 * u);
        const y = y0 - H * Math.sin(Math.PI * Math.min(1, u * 1.15));
        d.pts.push({ t: now, x });
        garder(d.pts, now);
        if (d.etat === 'coin') piloterCoin(d, { clientX: x, clientY: y } as PointerEvent);
        else if (d.etat === 'tour') piloter(d, x - d.x0);
        trainee.ajouter(x, y, 1);
        if (u < 1) {
          main = requestAnimationFrame(image);
          return;
        }
        doigtRef.current = null;
        if (d.etat === 'coin' && d.coin) {
          const R = rabats.current[c];
          relayer(d, x, plier(d.coin.angle, R.fx.get(), R.fy.get(), g.W, g.H).ex);
        }
        relacherTour(d, vitesse(d.pts, now));
        trainee.finir();
      };
      main = requestAnimationFrame(image);
      return true;
    };
    mainRef.current = mainInvisible;

    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener(LOUPE_EVENT, onLoupe);
    surface.addEventListener('click', onClick, true);
    surface.addEventListener('dragstart', onDragStart);
    surface.addEventListener('contextmenu', onMenu);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener(LOUPE_EVENT, onLoupe);
      surface.removeEventListener('click', onClick, true);
      surface.removeEventListener('dragstart', onDragStart);
      surface.removeEventListener('contextmenu', onMenu);
      surface.removeAttribute('data-gc-curseur');
      cancelAnimationFrame(main);
      mainRef.current = null;
      doigtRef.current = null;
    };
  }, [gestes, pose, enEcran, min, max, p, r, glisse, rebond, X]);

  // Pré-rendu : la double page affichée et ses voisines (−1, +1) restent montées ; seules les
  // pages du geste en cours sont visibles. Aucune n'est créée ni retirée pendant un geste.
  const montes = new Set<number>([affiche - 1, affiche, affiche + 1]);
  if (T) { montes.add(T.lo); montes.add(T.hi); }
  const liste = Array.from(montes).filter((k) => k >= 0 && k < n).sort((a, b) => a - b);
  const visibleG = (k: number) => (T ? k === T.lo : k === affiche);
  const visibleD = (k: number) => (T ? k === T.hi : k === affiche);
  const modeDe = (k: number): RenderMode => (k === affiche ? 'live' : 'static');

  const frac = n > 1 ? clamp(affiche, 0, n - 1) / (n - 1) : 0;
  const nG = affiche <= 0 ? 0 : Math.max(1, Math.round(FEUILLES * frac));
  const nD = affiche >= n - 1 ? 0 : Math.max(1, Math.round(FEUILLES * (1 - frac)));

  const faceD = (k: number) => (spreads[k] ? <Face spread={spreads[k]} side="right" mode="static" /> : null);
  const faceG = (k: number) => (spreads[k] ? <Face spread={spreads[k]} side="left" mode="static" /> : null);

  // Feuilletage : la chaîne des doubles pages traversées, les feuilles légères et la feuille finale.
  let legeres: { recto: number; verso: number }[] = [];
  let finaleRecto = feuille && !feuille.couverture ? feuille.lo : 0;
  let finaleVerso = feuille && !feuille.couverture ? feuille.hi : 0;
  if (feuille?.feuilles) {
    if (feuille.couverture) {
      const ch = [0, ...feuille.feuilles, feuille.hi];
      legeres = ch.slice(0, -1).map((x, j) => ({ recto: x, verso: ch[j + 1] }));
    } else if (feuille.sens < 0) {
      const ch = [feuille.lo, ...feuille.feuilles];
      legeres = ch.slice(0, -1).map((x, j) => ({ recto: x, verso: ch[j + 1] }));
      finaleRecto = ch[ch.length - 1];
    } else {
      const ch = [feuille.hi, ...feuille.feuilles];
      legeres = ch.slice(0, -1).map((x, j) => ({ recto: ch[j + 1], verso: x }));
      finaleVerso = ch[ch.length - 1];
    }
  }
  const lien = !!feuille?.couverture && legeres.length > 0;
  // Le contreplat de la couverture s'efface quand la première feuille du lien se pose dessus.
  const fonduCouv = useTransform(r, (v) => (lien ? 1 - lisse(0.88, 1, qFeuille(v, 0, Math.max(1, legeres.length))) : 1));
  const riffle = legeres.length
    ? legeres.map((f, j) => (
      <FeuilleDuRiffle
        key={`leger-${j}-${f.recto}-${f.verso}`}
        r={r}
        p={p}
        j={j}
        n={legeres.length}
        sens={feuille!.sens}
        finale={lien && j === legeres.length - 1}
        recto={faceD(f.recto)}
        verso={faceG(f.verso)}
      />
    )).reverse() // la première à tourner est peinte au-dessus
    : null;

  let leaf: React.ReactNode = null;
  if (feuille && feuille.arriere) {
    leaf = (
      <FeuilletCouverture
        key="arriere"
        p={p}
        arriere
        recto={faceD(n - 1)}
        verso={couvertureArriere === true ? null : couvertureArriere}
      />
    );
  } else if (feuille && feuille.couverture) {
    leaf = (
      <>
        {riffle}
        <FeuilletCouverture
          key="couverture"
          p={p}
          recto={cover}
          verso={spreads[0] ? <Face spread={spreads[0]} side="left" mode="static" /> : null}
          fondu={lien ? fonduCouv : undefined}
        />
      </>
    );
  } else if (feuille && spreads[finaleRecto] && spreads[finaleVerso]) {
    leaf = (
      <>
        <Feuillet
          key={feuille.id}
          p={p}
          sens={feuille.sens}
          recto={faceD(finaleRecto)}
          verso={faceG(finaleVerso)}
        />
        {riffle}
      </>
    );
  }

  // Rabats montés : pendant un geste de coin, le seul côté saisi ; au repos, les côtés saisissables.
  const g0 = geo;
  let cotesCoin: CotePage[] = [];
  if (COIN_2D && g0 && affiche >= 0 && affiche <= maxOuvert) {
    if (pose) cotesCoin = poseCoin ? [poseCoin.cote] : [];
    else if (T) cotesCoin = T.coin ? [T.coin] : [];
    else if (coinPret && coinPossible) {
      const sides: CotePage[] = coinActif ? [coinActif] : modePage ? [cote] : ['gauche', 'droite'];
      cotesCoin = sides.filter((c) => (c === 'droite' ? affiche + 1 <= maxOuvert : affiche - 1 >= 0));
    }
  }
  coinMonte.current = { gauche: cotesCoin.includes('gauche'), droite: cotesCoin.includes('droite') };
  const coins = g0 ? cotesCoin.map((c) => {
    const k = c === 'droite' ? affiche + 1 : affiche - 1;
    const sp = spreads[k];
    if (!sp) return null;
    const R = c === 'droite' ? rabatD : rabatG;
    return (
      <Coin
        key={`coin-${c}-${sp.id}`}
        cote={c}
        dessous={c === 'droite' ? faceD(k) : faceG(k)}
        rabat={c === 'droite' ? faceG(k) : faceD(k)}
        fx={R.fx}
        fy={R.fy}
        haut={R.haut}
        opacite={R.op}
        W={g0.W}
        H={g0.H}
      />
    );
  }) : null;

  const titre = affiche >= 0 ? spreads[affiche]?.titre : undefined;
  const annonce = affiche === -1
    ? 'Carnet fermé'
    : dos && affiche === n
      ? 'Carnet refermé sur son plat arrière'
      : `${titre ? `${titre}, double page` : 'Double page'} ${affiche + 1} sur ${n}${modePage ? `, page de ${cote}` : ''}`;

  // Bornes des flèches : en cadrage « page », on compte les pages.
  const debut = modePage ? affiche <= min && (affiche === -1 || cote === 'gauche') : affiche <= min;
  const fin = modePage ? affiche >= max && cote === 'droite' : affiche >= max;

  // Flèches à l'écran : groupées en bas à droite, comme sur la TV ; sur un téléphone couché (le livre
  // remplit la hauteur), une de chaque côté du livre, sur la table. Sous la loupe, elles passent sur le
  // papier (à l'encre) : ce sont les ‹ › de la page zoomée.
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
  const surPapier = placeFleches.papier || (zoome && enEcran);

  const fleches = (
    <Fleches
      onPrecedente={() => pas(-1)}
      onSuivante={() => pas(1)}
      debut={debut}
      fin={fin}
      place={enEcran ? (zoome ? 'coin' : placeFleches.place) : 'scene'}
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
      <Camera zoom={cameraFixe ? 1 : camera.zoom} fondu={fondu} x={rebond} arrivee={arriveeRef.current || poseArrivee != null ? arr : undefined} present={arriveeRef.current ? present : undefined}>
        <div ref={livreRef} className="gc-livre" data-gc-etat={couv ? 'couverture' : arr_ ? 'arriere' : 'ouvert'} style={couverture}>
          {/* Mouvement de caméra de l'ouverture : appliqué au corps et à l'espace 3D séparément
              (transformer leur parent commun obligerait à aplatir tout le livre à chaque image). */}
          <m.div className="gc-livre__corps" style={{ transform: livreT }}>
            <OmbreFeu />
            <m.div className="gc-livre__ombre gc-livre__ombre--gauche" style={{ opacity: ombreGauche }} aria-hidden="true" />
            <m.div className="gc-livre__ombre gc-livre__ombre--droite" style={{ opacity: ombreDroite }} aria-hidden="true" />
            {(couv || arr_) && <m.div className={`gc-livre__ombre gc-livre__ombre--epaisseur${arr_ ? ' gc-livre__ombre--epaisseur-gauche' : ''}`} style={{ opacity: ombreEpaisseur }} aria-hidden="true" />}
            {(couv || arr_) && <m.div className="gc-livre__ombre gc-livre__ombre--pouls" style={{ opacity: pouls }} aria-hidden="true" />}
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
            {T && <Portees key={T.id} p={p} sens={T.sens} couverture={carton(T)} />}
          </m.div>
          <m.div ref={espaceRef} className="gc-livre__espace" style={{ transform: livreT }}>
            {leaf}
            {coins}
            {couv && !lien && (
              // Invitation à ouvrir (lot S) sur le tiers bas de la couverture ; sans elle, un emplacement
              // vide et invisible (le livre en pilote déjà l'opacité).
              <div className="gc-livre__invitation" aria-hidden={invitation ? undefined : true}>
                {invitation ? invitation(invitOp) : <m.div className="gc-livre__invitation-repli" style={{ opacity: invitOp }} />}
              </div>
            )}
          </m.div>
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
        data-gc-sur={surPapier ? 'papier' : undefined}
        style={placeFleches.place === 'cotes' && !zoome ? ({ '--gc-livre-bande': `${Math.round(placeFleches.bande)}px` } as React.CSSProperties) : undefined}
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
