// Le menu de réglages du carnet (CONTRACT § 12) : un petit engrenage à l'encre en haut à gauche de
// l'écran, et une fiche bristol glissée par-dessus le livre, écrite de la main de Cécile, où l'on
// entoure ses choix au crayon. Sur la TV et l'ordinateur, la fiche est posée à droite, un peu de
// travers ; sur un téléphone debout, elle monte du bas sur toute la largeur.
//
// Vit dans le calque des contrôles de l'Ecran (px d'écran, portail) ; hors d'un Ecran, rendu en place.
// Clavier : M ou « , » ouvrent ; ↑ ↓ changent de ligne, ← → changent la valeur, Entrée active,
// Échap (ou Retour arrière, ou M) ferme. Tant que la fiche est ouverte, le livre et la caméra ne
// reçoivent plus aucune touche (useClavierModal) et le focus reste dans la fiche.
import React from 'react';
import { createPortal } from 'react-dom';
import { useEcran } from '../Ecran';
import { partScene, useViewport, type Viewport } from '../../lib/viewport';
import { CAMERA_DEFAULT, useCamera, zoomBornes, ZOOM_STEP } from '../../lib/camera';
import type { Distance } from '../../lib/settings';
import { resetReglages, useReglages, type Reglages as ReglagesValeurs, type Vitesse } from '../../lib/reglages';
import * as son from '../../lib/son';
import { MORCEAUX } from '../../lib/musique';
import { LOUPE_MAX, LOUPE_MIN, demanderLoupe, useLoupe } from '../../lib/loupe';
import { useClavierModal } from '../../lib/clavier';
import { LazyMotion, SPRINGS, animate, domMax, m, useMotionValue, useReducedMotion, useTransform } from '../../lib/motion';
import { assetInfo, cssUrl } from '../../lib/assets';
import { Chevron, Croix, Engrenage, Entoure, FlecheMarge, Signe, TraitCrayon } from './traces';
import { Reglette, auPas } from './Reglette';
import './Reglages.css';

export interface ReglagesInvite {
  /** Index de la double page dans le livre. */
  index: number;
  /** Nom affiché (« Lisa — Carrot cake »). */
  titre: string;
}

export interface ReglagesProps {
  /** Les invités de « Aller à… » (ligne masquée si la liste est vide). */
  invites?: ReglagesInvite[];
  /** Aller à la double page d'un invité (le menu se referme). */
  onAller?: (index: number) => void;
  /** Texte des crédits (remplace CREDITS_REGLAGES, le texte par défaut). */
  credits?: React.ReactNode;
  /**
   * Caméra fixe : masque « Taille du livre » et « Ajuster ». Par défaut, déduit de l'écran comme le
   * fait le livre (cadrage « page », ou petit écran couché que le livre remplit déjà).
   */
  cameraFixe?: boolean;
  /** Fiche ouverte dès le premier rendu, sans prendre le focus (cartes, captures). */
  ouvertAuDepart?: boolean;
}

/** Texte des crédits par défaut. */
export const CREDITS_REGLAGES =
  'Écriture générée (modèles libres MIT, données IAM-OnDB), papiers anciens du domaine public, croquis Quick, Draw! (Google, CC BY 4.0), vidéos d’exemple (voir crédits).';

type Vars = React.CSSProperties & Record<`--${string}`, string>;
type Etat = 'ferme' | 'ouvert' | 'fermeture';

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/** Hauteur d'une fiche complète, en corps de texte (titre + 15 lignes réglées, section comprise, + marges). */
const HAUTEUR_EM = 26;
/** Corps du texte sur la TV 1080p (Caveat : hauteur d'x 0,37 → 14 px, le plancher de lecture à 3 m). */
const CORPS_TV = 38;
/** Angle de la fiche posée sur la TV (degrés). */
const ANGLE = -1.2;

// ---- Mise en place selon l'écran ----------------------------------------------------------------

interface Mise {
  /** Téléphone debout : feuille qui monte du bas, pleine largeur. Sinon, fiche posée à droite. */
  feuille: boolean;
  /** Corps du texte (px d'écran). */
  fs: number;
  style: Vars;
}

function miseEnPlace(vp: Viewport, papier: string | null): Mise {
  const i = vp.insets;
  const cible = vp.tactile ? 44 : 32;
  const feuille = vp.cadrage === 'page' && vp.w < 600;
  let fs: number;
  let place: { haut: number; bas: number; gauche: number; droite: number };
  if (feuille) {
    fs = borne(vp.w * 0.056, 20, 28);
    // On garde une bande du livre visible en haut : la toucher referme la feuille.
    place = { haut: i.top + Math.max(48, vp.h * 0.08), bas: 0, gauche: 0, droite: 0 };
  } else {
    const u = Math.min(vp.w / 1920, vp.h / 1080);
    const marge = Math.max(12, Math.round(32 * u));
    const dispo = vp.h - i.top - i.bottom - 2 * marge;
    // Au doigt (tablette, téléphone couché), jamais sous 21 px ni sous 2,8 % du petit côté.
    const plancher = vp.tactile ? Math.max(21, Math.min(vp.w, vp.h) * 0.028) : 17;
    fs = borne(Math.min(CORPS_TV * u, dispo / HAUTEUR_EM), plancher, 80);
    place = { haut: i.top + marge, bas: i.bottom + marge, gauche: i.left + marge, droite: i.right + marge };
  }
  const pas = Math.max(1.5 * fs, cible);
  const style: Vars = {
    '--gc-reglages-fs': px(fs),
    '--gc-reglages-pas': px(pas),
    '--gc-reglages-cible': px(cible),
    '--gc-reglages-haut': px(place.haut),
    '--gc-reglages-bas': px(place.bas),
    '--gc-reglages-gauche': px(place.gauche),
    '--gc-reglages-droite': px(place.droite),
    '--gc-reglages-encoche-bas': px(feuille ? i.bottom : 0),
    '--gc-reglages-encoche-cotes': px(feuille ? Math.max(i.left, i.right) : 0),
  };
  if (papier) style['--gc-reglages-papier'] = papier;
  return { feuille, fs, style };
}

// ---- Plein écran (même logique que le bouton de l'Ecran) -----------------------------------------

type DocPlein = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type ElPlein = HTMLElement & { webkitRequestFullscreen?: () => void };
const elementPlein = (): Element | null => {
  if (typeof document === 'undefined') return null;
  const d = document as DocPlein;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
};

function usePleinEcran(): [boolean, (oui: boolean) => void] {
  const [actif, setActif] = React.useState(() => !!elementPlein());
  React.useEffect(() => {
    const maj = () => setActif(!!elementPlein());
    maj();
    document.addEventListener('fullscreenchange', maj);
    document.addEventListener('webkitfullscreenchange', maj);
    return () => {
      document.removeEventListener('fullscreenchange', maj);
      document.removeEventListener('webkitfullscreenchange', maj);
    };
  }, []);
  // Appelé dans le geste (clic, touche) : c'est ce qu'exige l'API.
  const regler = React.useCallback((oui: boolean) => {
    const d = document as DocPlein;
    if (!oui) {
      if (!elementPlein()) return;
      if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined);
      else d.webkitExitFullscreen?.();
      return;
    }
    if (elementPlein()) return;
    const el = document.documentElement as ElPlein;
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  }, []);
  return [actif, regler];
}

// ---- Volume : en lecture seule sur iPhone et iPad (le volume y est celui de l'appareil) -----------

let volumeEcrivable: boolean | null = null;
/** true si le volume d'un élément média peut être réglé (faux sur iOS : on écrit, on relit). */
export function volumeReglable(): boolean {
  if (volumeEcrivable != null) return volumeEcrivable;
  if (typeof document === 'undefined') return true;
  try {
    const a = document.createElement('audio');
    a.volume = 0.5;
    volumeEcrivable = Math.abs(a.volume - 0.5) < 0.01;
  } catch {
    volumeEcrivable = false;
  }
  return volumeEcrivable;
}

// ---- Clavier : lignes, valeurs, focus piégé ------------------------------------------------------

const SEL_LIGNE = '[data-gc-reglages-ligne]';
const SEL_ITEM = 'button, [role="slider"]';

const visible = (el: HTMLElement) => el.getClientRects().length > 0;
/** Éléments atteints par Tab, dans l'ordre du document. */
const tabulables = (racine: HTMLElement) =>
  Array.from(racine.querySelectorAll<HTMLElement>(`${SEL_ITEM}, [tabindex]`)).filter((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled') && visible(el));

/** L'élément qui prend le focus quand on arrive sur une ligne (↑ ↓). */
function cibleDeLigne(ligne: HTMLElement): HTMLElement | null {
  return (
    ligne.querySelector<HTMLElement>('[data-gc-principal]') ??
    ligne.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
    tabulables(ligne)[0] ??
    ligne.querySelector<HTMLElement>(SEL_ITEM)
  );
}

function changerLigne(panneau: HTMLElement, actif: HTMLElement | null, dir: 1 | -1) {
  const lignes = Array.from(panneau.querySelectorAll<HTMLElement>(SEL_LIGNE));
  if (!lignes.length) return;
  const cur = actif?.closest<HTMLElement>(SEL_LIGNE) ?? null;
  const i = cur ? lignes.indexOf(cur) : -1;
  const j = i < 0 ? (dir > 0 ? 0 : lignes.length - 1) : borne(i + dir, 0, lignes.length - 1);
  if (j === i) return;
  cibleDeLigne(lignes[j])?.focus();
}

function tabuler(panneau: HTMLElement, actif: HTMLElement | null, dir: 1 | -1) {
  const items = tabulables(panneau);
  const n = items.length;
  if (!n) return;
  const i = actif ? items.indexOf(actif) : -1;
  let j: number;
  if (i >= 0) j = (i + dir + n) % n;
  else if (actif) {
    // Élément hors de l'ordre de tabulation (choix non coché, nom de la liste) : on part de sa place.
    const apres = items.findIndex((el) => !!(actif.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    j = dir > 0 ? (apres < 0 ? 0 : apres) : ((apres < 0 ? n : apres) - 1 + n) % n;
  } else j = dir > 0 ? 0 : n - 1;
  items[j].focus();
}

/** ← → : choisir la valeur voisine (choix), pousser la réglette, ou passer au bouton voisin. */
function changerValeur(actif: HTMLElement, dir: 1 | -1, actions: Record<string, (dir: 1 | -1) => void>) {
  const ligne = actif.closest<HTMLElement>(SEL_LIGNE);
  if (!ligne) return;
  const action = actions[ligne.dataset.gcReglagesLigne ?? ''];
  if (action) {
    action(dir);
    return;
  }
  const radios = Array.from(ligne.querySelectorAll<HTMLElement>('[role="radio"]'));
  if (radios.length) {
    let i = radios.indexOf(actif);
    if (i < 0) i = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
    const j = borne(i + dir, 0, radios.length - 1);
    if (j !== i) {
      radios[j].focus();
      radios[j].click(); // même chemin qu'au doigt (et, pour le plein écran, toujours dans le geste)
    }
    return;
  }
  const items = Array.from(ligne.querySelectorAll<HTMLElement>(SEL_ITEM)).filter(visible);
  const i = items.indexOf(actif);
  const j = borne(i + dir, 0, items.length - 1);
  if (i >= 0 && j !== i) items[j].focus();
}

// ---- Morceaux de la fiche ------------------------------------------------------------------------

interface LigneProps {
  id: string;
  libelle?: React.ReactNode;
  /** role de la zone des valeurs (« radiogroup » pour un choix). */
  role?: string;
  attenuee?: boolean;
  large?: boolean;
  children: React.ReactNode;
}

function Ligne({ id, libelle, role, attenuee, large, children }: LigneProps) {
  const lid = `${React.useId()}-l`;
  const cls = ['gc-reglages__ligne', large && 'gc-reglages__ligne--large', attenuee && 'gc-reglages__ligne--attenuee'].filter(Boolean).join(' ');
  return (
    <div className={cls} data-gc-reglages-ligne={id}>
      <FlecheMarge />
      {libelle != null && <span className="gc-reglages__libelle" id={lid}>{libelle}</span>}
      <div className="gc-reglages__valeurs" role={role} aria-labelledby={libelle != null && role ? lid : undefined}>
        {children}
      </div>
    </div>
  );
}

interface Option<T> {
  v: T;
  texte: string;
}

function Choix<T extends string | boolean>({ options, valeur, onChoisir, graine }: { options: Option<T>[]; valeur: T; onChoisir: (v: T) => void; graine: number }) {
  const aucun = !options.some((o) => o.v === valeur);
  return (
    <>
      {options.map((o, i) => {
        const actif = o.v === valeur;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={actif}
            tabIndex={actif || (aucun && i === 0) ? 0 : -1}
            className={`gc-reglages__option${actif ? ' gc-reglages__option--actif' : ''}`}
            onClick={() => onChoisir(o.v)}
          >
            {o.texte}
            {actif && <Entoure n={graine + i} />}
          </button>
        );
      })}
    </>
  );
}

const OUI_NON: Option<boolean>[] = [{ v: false, texte: 'non' }, { v: true, texte: 'oui' }];
const SON: Option<boolean>[] = [{ v: false, texte: 'coupé' }, { v: true, texte: 'avec son' }];
const TAILLES: Option<Distance>[] = [{ v: 'proche', texte: 'proche' }, { v: 'moyenne', texte: 'moyenne' }, { v: 'loin', texte: 'loin' }];
/** Boutons à l'écran : ils s'effacent seuls après quelques secondes, ou restent toujours là (src/lib/controles.ts). */
const BOUTONS: Option<boolean>[] = [{ v: false, texte: 's’effacent' }, { v: true, texte: 'toujours visibles' }];
/** Feuille du téléphone : « visibles », pour que les deux choix tiennent sur une ligne. */
const BOUTONS_COURT: Option<boolean>[] = [{ v: false, texte: 's’effacent' }, { v: true, texte: 'visibles' }];
const VITESSES_TEXTE: Option<Vitesse>[] = [{ v: 'vive', texte: 'vive' }, { v: 'normale', texte: 'normale' }, { v: 'lente', texte: 'lente' }];
type ChoixAuto = 'auto' | 'oui' | 'non';
const AUTO_OUI_NON: Option<ChoixAuto>[] = [{ v: 'auto', texte: 'automatique' }, { v: 'oui', texte: 'oui' }, { v: 'non', texte: 'non' }];
/** Feuille du téléphone : « auto », pour que les trois choix tiennent sur une ligne. */
const AUTO_OUI_NON_COURT: Option<ChoixAuto>[] = [{ v: 'auto', texte: 'auto' }, { v: 'oui', texte: 'oui' }, { v: 'non', texte: 'non' }];
const versChoixAuto = (v: boolean | null): ChoixAuto => (v === null ? 'auto' : v ? 'oui' : 'non');
const deChoixAuto = (c: ChoixAuto): boolean | null => (c === 'auto' ? null : c === 'oui');
/** Musique de fond (src/lib/musique.ts) : « aucune », puis chaque morceau de la banque par son titre. */
const OPTIONS_MUSIQUE: Option<string>[] = [{ v: 'aucune', texte: 'aucune' }, ...MORCEAUX.map((m) => ({ v: m.id, texte: m.titre }))];

// ---- Ambiance (lots L et S) : lue de façon défensive tant que reglages.ts n'a pas ses champs ----------
/** Champs de l'ambiance : `ambiance` (feu de cheminée et cuisine, null = automatique) et `feu` (la lumière vacille). */
type ChampsAmbiance = { ambiance?: boolean | null; feu?: boolean };
const ambianceDe = (r: ReglagesValeurs): boolean | null => {
  const v = (r as ReglagesValeurs & ChampsAmbiance).ambiance;
  return typeof v === 'boolean' ? v : null;
};
const feuDe = (r: ReglagesValeurs): boolean => (r as ReglagesValeurs & ChampsAmbiance).feu !== false;
/** Écrit des champs que reglages.ts ne déclare peut-être pas encore (ignorés par lui jusque-là). */
const partielAmbiance = (c: ChampsAmbiance) => c as unknown as Partial<ReglagesValeurs>;
/** Nom de la fonction que le lot S pourra exporter de src/lib/son.ts (lue par clé : pas d'import manquant). */
const AMBIANCE_EFFECTIVE = 'ambianceEffective';
/** Ambiance active : celle de src/lib/son.ts si elle existe ; sinon automatique = coupée sur téléphone. */
function ambianceActive(r: ReglagesValeurs): boolean {
  const f = (son as unknown as Record<string, unknown>)[AMBIANCE_EFFECTIVE] as ((r: ReglagesValeurs) => boolean) | undefined;
  if (typeof f === 'function') return f(r);
  const v = ambianceDe(r);
  if (v !== null) return v;
  if (typeof window === 'undefined' || typeof matchMedia === 'undefined') return true;
  return !(matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 600);
}
const VOLUME_PAS = 0.05;
/** Pas de la loupe dans le menu (100 à 300 %). */
const LOUPE_PAS = 0.25;
const pourcent = (v: number) => `${Math.round(v * 100)} %`;

// ---- Le menu ---------------------------------------------------------------------------------------

/** Le bouton ⚙ et sa fiche. Dans un Ecran : en portail dans le calque des contrôles ; sinon, en place. */
export function Reglages(props: ReglagesProps) {
  const ecran = useEcran();
  if (ecran) return ecran.controles ? <Menu {...props} vp={ecran.vp} cible={ecran.controles} enPlace={false} /> : null;
  return <MenuSeul {...props} />;
}

function MenuSeul(props: ReglagesProps) {
  const vp = useViewport();
  return <Menu {...props} vp={vp} cible={null} enPlace />;
}

interface MenuProps extends ReglagesProps {
  vp: Viewport;
  cible: HTMLElement | null;
  enPlace: boolean;
}

function Menu({ vp, cible, enPlace, invites = [], onAller, credits, cameraFixe: cameraFixeImpose, ouvertAuDepart = false }: MenuProps) {
  const camera = useCamera();
  const [r, setR] = useReglages();
  const reduit = useReducedMotion();
  const reduitRef = React.useRef(reduit);
  reduitRef.current = reduit;
  const [plein, setPlein] = usePleinEcran();
  const [etat, setEtat] = React.useState<Etat>(ouvertAuDepart ? 'ouvert' : 'ferme');
  const etatRef = React.useRef(etat);
  etatRef.current = etat;
  const [liste, setListe] = React.useState(false);
  const [voirCredits, setVoirCredits] = React.useState(false);
  const [remis, setRemis] = React.useState(false);
  const boutonRef = React.useRef<HTMLButtonElement>(null);
  const panneauRef = React.useRef<HTMLDivElement>(null);
  const focusAuDepart = React.useRef(false);
  const titreId = `${React.useId()}-titre`;
  const listeId = `${React.useId()}-liste`;
  const creditsId = `${React.useId()}-credits`;

  // Comme le livre : quand la page (ou le livre) remplit déjà l'écran, les crans ne servent plus.
  const cameraFixe = cameraFixeImpose ?? (!enPlace && (vp.cadrage === 'page' || partScene(vp) < 1));
  const papier = assetInfo('paper/base') ? cssUrl('paper/base') : null;
  const mise = React.useMemo(() => miseEnPlace(vp, papier), [vp, papier]);
  // Volumes indépendants : celui des vidéos (en lecture seule sur iPhone : sa ligne disparaît alors), puis
  // ceux des bruitages (sons du livre, feu, cuisine) et de la musique, réglables partout (Web Audio, iPhone compris).
  const sonsLivre = son.sonsLivreEffectif(r);
  const ambiance = ambianceActive(r);
  const musique = r.musiqueActive;
  const bruitages = sonsLivre || ambiance;
  const avecVolume = volumeReglable();
  const volumeActif = r.son;

  // Loupe : l'état au repos ; pendant qu'elle s'anime vers la valeur choisie, la réglette montre déjà
  // cette valeur (le pâté suit le doigt).
  const loupe = useLoupe();
  const [loupeVisee, setLoupeVisee] = React.useState<number | null>(null);
  React.useEffect(() => { setLoupeVisee(null); }, [loupe.z]);
  const loupeAffichee = loupeVisee ?? Math.round(loupe.z * 100) / 100;
  const reglerLoupe = React.useCallback((v: number) => {
    const z = auPas(v, LOUPE_MIN, LOUPE_MAX, LOUPE_PAS);
    setLoupeVisee(z);
    demanderLoupe(z);
  }, []);
  const loupeRef = React.useRef(loupeAffichee);
  loupeRef.current = loupeAffichee;

  // ---- Ouvrir, fermer (une seule MotionValue : 0 = rangée, 1 = posée) ----
  const t = useMotionValue(ouvertAuDepart ? 1 : 0);
  const voileOpacite = t;
  const ficheX = useTransform(t, (v) => (1 - v) * mise.fs * 1.6);
  const ficheRot = useTransform(t, (v) => ANGLE + (1 - v) * 0.9);
  const ficheOpacite = useTransform(t, [0, 0.55], [0, 1]);
  const feuilleY = useTransform(t, (v) => `${((1 - v) * 104).toFixed(2)}%`);

  const ouvrir = React.useCallback(() => {
    if (etatRef.current === 'ouvert') return;
    setListe(false);
    setVoirCredits(false);
    setRemis(false);
    focusAuDepart.current = true;
    setEtat('ouvert');
  }, []);

  const fermer = React.useCallback(() => {
    if (etatRef.current !== 'ouvert') return;
    boutonRef.current?.focus({ preventScroll: true });
    if (reduitRef.current) {
      t.set(0);
      setEtat('ferme');
    } else setEtat('fermeture');
  }, [t]);

  React.useEffect(() => {
    if (etat === 'ferme') return;
    const el = panneauRef.current;
    const but = etat === 'ouvert' ? 1 : 0;
    if (reduitRef.current) {
      t.set(but);
      if (!but) setEtat('ferme');
      return;
    }
    if (t.get() === but) return;
    if (el) el.style.willChange = 'transform, opacity';
    const a = animate(t, but, {
      ...SPRINGS.settle,
      onComplete: () => {
        if (el) el.style.willChange = '';
        if (!but) setEtat('ferme');
      },
    });
    return () => {
      a.stop();
      if (el) el.style.willChange = '';
    };
  }, [etat, t]);

  // Le focus entre dans la fiche à l'ouverture (sauf fiche ouverte d'office, dans une carte).
  React.useEffect(() => {
    if (etat !== 'ouvert' || !focusAuDepart.current) return;
    focusAuDepart.current = false;
    const p = panneauRef.current;
    const premiere = p?.querySelector<HTMLElement>(SEL_LIGNE);
    (premiere ? cibleDeLigne(premiere) : p)?.focus({ preventScroll: true });
  }, [etat]);

  // Une liste qui se déplie (invités, crédits) vient se montrer si la fiche défile.
  const montrer = (sel: string) => {
    const el = panneauRef.current?.querySelector<HTMLElement>(sel);
    el?.scrollIntoView?.({ block: 'nearest', behavior: reduitRef.current ? 'auto' : 'smooth' });
  };
  React.useEffect(() => { if (liste) montrer('.gc-reglages__invites-boite'); }, [liste]);
  React.useEffect(() => { if (voirCredits) montrer('.gc-reglages__credits'); }, [voirCredits]);

  // « c'est fait » s'efface tout seul.
  React.useEffect(() => {
    if (!remis) return;
    const id = window.setTimeout(() => setRemis(false), 2600);
    return () => window.clearTimeout(id);
  }, [remis]);

  // M ou « , » ouvrent la fiche (écoute en bulle : un objet soulevé, qui tient le clavier, l'emporte).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.key !== 'm' && e.key !== 'M' && e.key !== ',') return;
      const c = e.target;
      if (c instanceof Element && c.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (etatRef.current !== 'ferme') return;
      e.preventDefault();
      ouvrir();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ouvrir]);

  // ---- Actions des lignes (← →) ----
  const [zMin, zMax] = zoomBornes(camera.distance);
  const actions: Record<string, (dir: 1 | -1) => void> = {
    zoom: (dir) => camera.stepZoom(dir),
    loupe: (dir) => reglerLoupe(loupeRef.current + dir * LOUPE_PAS),
    volume: (dir) => setR((x) => ({ volume: auPas(x.volume + dir * VOLUME_PAS, 0, 1, VOLUME_PAS) })),
    volumeBruitages: (dir) => setR((x) => ({ volumeBruitages: auPas(x.volumeBruitages + dir * VOLUME_PAS, 0, 1, VOLUME_PAS) })),
    volumeMusique: (dir) => setR((x) => ({ volumeMusique: auPas(x.volumeMusique + dir * VOLUME_PAS, 0, 1, VOLUME_PAS) })),
  };
  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;

  useClavierModal(etat === 'ouvert', (e) => {
    const p = panneauRef.current;
    if (!p || e.ctrlKey || e.metaKey) return false;
    const k = e.key;
    if (k === 'Escape' || k === 'Backspace' || (!e.altKey && (k === 'm' || k === 'M' || k === ','))) {
      fermer();
      return true;
    }
    const a = document.activeElement;
    const actif = a instanceof HTMLElement && p.contains(a) && a !== p ? a : null;
    if (k === 'Tab') {
      tabuler(p, actif, e.shiftKey ? -1 : 1);
      return true;
    }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      changerLigne(p, actif, k === 'ArrowUp' ? -1 : 1);
      return true;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (actif) changerValeur(actif, k === 'ArrowLeft' ? -1 : 1, actionsRef.current);
      else changerLigne(p, null, 1);
      return true;
    }
    if ((k === 'Home' || k === 'End') && actif?.matches('[data-gc-reglette]')) {
      const id = actif.closest<HTMLElement>(SEL_LIGNE)?.dataset.gcReglagesLigne;
      if (id === 'zoom') camera.setZoom(k === 'Home' ? zMin : zMax);
      if (id === 'loupe') reglerLoupe(k === 'Home' ? LOUPE_MIN : LOUPE_MAX);
      if (id === 'volume') setR({ volume: k === 'Home' ? 0 : 1 });
      if (id === 'volumeBruitages') setR({ volumeBruitages: k === 'Home' ? 0 : 1 });
      if (id === 'volumeMusique') setR({ volumeMusique: k === 'Home' ? 0 : 1 });
      return true;
    }
    if ((k === 'Enter' || k === ' ') && !actif) {
      changerLigne(p, null, 1);
      return true;
    }
    // Entrée, Espace : le bouton qui a le focus (comportement natif). Le reste ne va pas plus loin.
    return false;
  });

  const remettre = () => {
    resetReglages();
    // Comme le carnet : au doigt, le cran par défaut est « proche ».
    camera.setDistance(vp.tactile ? 'proche' : 'moyenne');
    camera.setZoom(CAMERA_DEFAULT.zoom);
    reglerLoupe(1);
    setRemis(true);
  };

  const aller = (index: number) => {
    onAller?.(index);
    fermer();
  };

  // ---- Rendu ----
  const ouvert = etat !== 'ferme';
  const ficheStyle = mise.feuille ? { y: feuilleY } : { x: ficheX, rotate: ficheRot, opacity: ficheOpacite };
  const racineCls = ['gc-reglages', mise.feuille ? 'gc-reglages--feuille' : 'gc-reglages--fiche', enPlace && 'gc-reglages--en-place'].filter(Boolean).join(' ');
  let graine = 0;
  const g = () => (graine += 3);

  const contenu = (
    <LazyMotion features={domMax}>
      <div className={racineCls} style={mise.style} data-gc-reglages-etat={etat}>
        <button
          ref={boutonRef}
          type="button"
          className="gc-reglages__bouton"
          data-gc-reglages="bouton"
          data-gc-controle="reglages"
          data-gc-effacable={enPlace ? undefined : ''}
          aria-haspopup="dialog"
          aria-expanded={etat === 'ouvert'}
          aria-label="Réglages"
          onClick={ouvrir}
        >
          <Engrenage />
        </button>
        {ouvert && (
          <>
            <m.div className="gc-reglages__voile" style={{ opacity: voileOpacite }} onClick={fermer} aria-hidden="true" />
            <div className="gc-reglages__place">
              <m.div
                ref={panneauRef}
                className="gc-reglages__fiche"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titreId}
                tabIndex={-1}
                data-gc-reglages="panneau"
                style={ficheStyle}
              >
                <div className="gc-reglages__tete">
                  <h2 className="gc-reglages__titre" id={titreId}>
                    Réglages
                    <TraitCrayon className="gc-reglages__souligne" />
                  </h2>
                  <button type="button" className="gc-reglages__fermer" aria-label="Fermer les réglages" onClick={fermer}>
                    <Croix />
                  </button>
                </div>

                <div className="gc-reglages__corps">
                  {!cameraFixe && (
                    <Ligne id="taille" libelle="Taille du livre" role="radiogroup">
                      <Choix options={TAILLES} valeur={camera.distance} onChoisir={camera.setDistance} graine={g()} />
                    </Ligne>
                  )}
                  {!cameraFixe && (
                    <Ligne id="zoom" libelle="Ajuster">
                      <button type="button" className="gc-reglages__pas" aria-label="Un peu plus loin" aria-disabled={camera.zoom <= zMin || undefined} onClick={() => camera.stepZoom(-1)}>
                        <Signe />
                      </button>
                      <Reglette
                        valeur={camera.zoom}
                        min={zMin}
                        max={zMax}
                        pas={ZOOM_STEP}
                        repere={1}
                        principal
                        libelle="Ajuster la taille"
                        texte={pourcent(camera.zoom)}
                        onChange={camera.setZoom}
                      />
                      <button type="button" className="gc-reglages__pas" aria-label="Un peu plus près" aria-disabled={camera.zoom >= zMax || undefined} onClick={() => camera.stepZoom(1)}>
                        <Signe plus />
                      </button>
                      <span className="gc-reglages__nombre" aria-hidden="true">{pourcent(camera.zoom)}</span>
                    </Ligne>
                  )}
                  <Ligne id="loupe" libelle="Loupe">
                    <button type="button" className="gc-reglages__pas" aria-label="Loupe : moins grand" aria-disabled={loupeAffichee <= LOUPE_MIN || undefined} onClick={() => reglerLoupe(loupeAffichee - LOUPE_PAS)}>
                      <Signe />
                    </button>
                    <Reglette
                      valeur={loupeAffichee}
                      min={LOUPE_MIN}
                      max={LOUPE_MAX}
                      pas={LOUPE_PAS}
                      repere={1}
                      principal
                      libelle="Loupe"
                      texte={pourcent(loupeAffichee)}
                      onChange={reglerLoupe}
                    />
                    <button type="button" className="gc-reglages__pas" aria-label="Loupe : plus grand" aria-disabled={loupeAffichee >= LOUPE_MAX || undefined} onClick={() => reglerLoupe(loupeAffichee + LOUPE_PAS)}>
                      <Signe plus />
                    </button>
                    <span className="gc-reglages__nombre" aria-hidden="true">{pourcent(loupeAffichee)}</span>
                  </Ligne>
                  {vp.pleinEcran && (
                    <Ligne id="plein" libelle="Plein écran" role="radiogroup">
                      <Choix options={OUI_NON} valeur={plein} onChoisir={setPlein} graine={g()} />
                    </Ligne>
                  )}
                  <Ligne id="son" libelle="Son des vidéos" role="radiogroup">
                    <Choix options={SON} valeur={r.son} onChoisir={(son) => setR({ son })} graine={g()} />
                  </Ligne>
                  {avecVolume && (
                    <Ligne id="volume" libelle="Volume des vidéos" attenuee={!volumeActif}>
                      <Reglette
                        valeur={r.volume}
                        min={0}
                        max={1}
                        pas={VOLUME_PAS}
                        principal
                        attenuee={!volumeActif}
                        libelle="Volume des vidéos"
                        texte={pourcent(r.volume)}
                        onChange={(volume) => setR({ volume })}
                      />
                      <span className="gc-reglages__nombre" aria-hidden="true">{pourcent(r.volume)}</span>
                    </Ligne>
                  )}
                  <Ligne id="auto" libelle="Lancer la vidéo en arrivant sur la page" role="radiogroup">
                    <Choix options={OUI_NON} valeur={r.lectureAuto} onChoisir={(lectureAuto) => setR({ lectureAuto })} graine={g()} />
                  </Ligne>
                  <Ligne id="vitesse" libelle="Vitesse des pages" role="radiogroup">
                    <Choix options={VITESSES_TEXTE} valeur={r.vitesse} onChoisir={(vitesse) => setR({ vitesse })} graine={g()} />
                  </Ligne>
                  <Ligne id="mouvement" libelle="Moins d’animations" role="radiogroup">
                    <Choix options={OUI_NON} valeur={r.mouvementReduit} onChoisir={(mouvementReduit) => setR({ mouvementReduit })} graine={g()} />
                  </Ligne>
                  <Ligne id="boutons" libelle="Boutons" role="radiogroup">
                    <Choix options={mise.feuille ? BOUTONS_COURT : BOUTONS} valeur={r.boutonsToujoursVisibles} onChoisir={(boutonsToujoursVisibles) => setR({ boutonsToujoursVisibles })} graine={g()} />
                  </Ligne>
                  <h3 className="gc-reglages__section" data-gc-reglages-section="ambiance">
                    Ambiance
                    <TraitCrayon className="gc-reglages__souligne gc-reglages__souligne--section" />
                  </h3>
                  <Ligne id="sonsLivre" libelle="Sons du livre" role="radiogroup">
                    <Choix options={mise.feuille ? AUTO_OUI_NON_COURT : AUTO_OUI_NON} valeur={versChoixAuto(r.sonsLivre)} onChoisir={(c) => setR({ sonsLivre: deChoixAuto(c) })} graine={g()} />
                  </Ligne>
                  <Ligne id="ambiance" libelle="Feu de cheminée et cuisine" role="radiogroup">
                    <Choix options={mise.feuille ? AUTO_OUI_NON_COURT : AUTO_OUI_NON} valeur={versChoixAuto(ambianceDe(r))} onChoisir={(c) => setR(partielAmbiance({ ambiance: deChoixAuto(c) }))} graine={g()} />
                  </Ligne>
                  <Ligne id="feu" libelle="Lumière du feu" role="radiogroup">
                    <Choix options={OUI_NON} valeur={feuDe(r)} onChoisir={(feu) => setR(partielAmbiance({ feu }))} graine={g()} />
                  </Ligne>
                  <Ligne id="volumeBruitages" libelle="Bruitages" attenuee={!bruitages}>
                    <Reglette
                      valeur={r.volumeBruitages}
                      min={0}
                      max={1}
                      pas={VOLUME_PAS}
                      principal
                      attenuee={!bruitages}
                      libelle="Bruitages"
                      texte={pourcent(r.volumeBruitages)}
                      onChange={(volumeBruitages) => setR({ volumeBruitages })}
                    />
                    <span className="gc-reglages__nombre" aria-hidden="true">{pourcent(r.volumeBruitages)}</span>
                  </Ligne>
                  <Ligne id="musique" libelle="Morceau" role="radiogroup" large>
                    {/* « aucune » coupe la musique ; un morceau la joue (le bouton musique la rallume). */}
                    <Choix
                      options={OPTIONS_MUSIQUE}
                      valeur={r.musiqueActive ? r.musique : 'aucune'}
                      onChoisir={(m) => setR(m === 'aucune' ? { musique: 'aucune', musiqueActive: false } : { musique: m, musiqueActive: true })}
                      graine={g()}
                    />
                  </Ligne>
                  {/* Réglable musique coupée (atténuée) : le niveau attend le prochain départ. */}
                  <Ligne id="volumeMusique" libelle="Musique" attenuee={!musique}>
                    <Reglette
                      valeur={r.volumeMusique}
                      min={0}
                      max={1}
                      pas={VOLUME_PAS}
                      principal
                      attenuee={!musique}
                      libelle="Musique"
                      texte={pourcent(r.volumeMusique)}
                      onChange={(volumeMusique) => setR({ volumeMusique })}
                    />
                    <span className="gc-reglages__nombre" aria-hidden="true">{pourcent(r.volumeMusique)}</span>
                  </Ligne>
                  {invites.length > 0 && (
                    <Ligne id="aller" libelle="Aller à…">
                      <button
                        type="button"
                        className="gc-reglages__deplier"
                        aria-expanded={liste}
                        aria-controls={listeId}
                        onClick={() => setListe((x) => !x)}
                      >
                        {liste ? 'la liste des invités' : 'choisir un invité'}
                        <Chevron />
                      </button>
                    </Ligne>
                  )}
                  {invites.length > 0 && liste && (
                    <div id={listeId} className="gc-reglages__invites-boite">
                      <Ligne id="invites" large>
                        {invites.map((inv, k) => (
                          <button key={inv.index} type="button" className="gc-reglages__invite" tabIndex={k === 0 ? 0 : -1} onClick={() => aller(inv.index)}>
                            {inv.titre}
                          </button>
                        ))}
                      </Ligne>
                    </div>
                  )}
                  <Ligne id="fin" large>
                    <button type="button" className="gc-reglages__lien" onClick={remettre}>
                      remettre les réglages par défaut
                      <TraitCrayon className="gc-reglages__souligne gc-reglages__souligne--lien" />
                    </button>
                    <span className="gc-reglages__fait" role="status">{remis ? '— c’est fait' : ''}</span>
                    <span className="gc-reglages__point" aria-hidden="true">·</span>
                    <button type="button" className="gc-reglages__lien" aria-expanded={voirCredits} aria-controls={creditsId} onClick={() => setVoirCredits((x) => !x)}>
                      crédits
                      <TraitCrayon className="gc-reglages__souligne gc-reglages__souligne--lien" />
                    </button>
                  </Ligne>
                  {voirCredits && (
                    <div id={creditsId} className="gc-reglages__credits">
                      {credits ?? <p>{CREDITS_REGLAGES}</p>}
                      <p>Musique de fond (Kevin MacLeod, incompetech.com), sous licence Creative Commons Attribution 4.0 :</p>
                      <ul>
                        {MORCEAUX.map((m) => (
                          <li key={m.id}>
                            « <a href={m.url} target="_blank" rel="noopener noreferrer">{m.titre}</a> » : {m.auteur}, <a href={m.licenceUrl} target="_blank" rel="noopener noreferrer">{m.licence}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </m.div>
            </div>
          </>
        )}
      </div>
    </LazyMotion>
  );

  return cible ? createPortal(contenu, cible) : contenu;
}
