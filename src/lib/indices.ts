// Indices sans texte (plan v4, CONTRACT § 13.4) : de temps en temps, un objet vivant de la page fait un
// petit signe pour dire « on peut me toucher » — la photo collée respire, le coin du feuillet volant
// frémit. Aucun texte à l'écran.
//
// Un seul ordonnanceur pour tout le carnet :
//   - un indice toutes les 6 à 9 s (décalage au hasard), compté depuis la dernière activité (appui,
//     touche, molette) ou la fin du dernier geste : on ne fait signe qu'à quelqu'un qui regarde ;
//   - un seul objet à la fois : le moins récemment montré parmi les objets visibles à l'écran (page
//     vivante affichée, rien par-dessus, pas soulevé) ;
//   - en pause pendant un geste du livre (« gc-livre-geste », tourne-page compris), un doigt posé, la
//     loupe zoomée ou en geste, un menu ou un objet soulevé (clavier modal), un onglet caché ; un indice
//     en cours s'arrête net au début d'un geste ;
//   - coupé en mouvement réduit (système ou réglage) ;
//   - un objet déjà utilisé (soulevé ou touché : indiceUtilise) n'a plus d'indice, même après un
//     rechargement : localStorage « gc:indices:v1 » = { v: 1, utilises: ['photo:julie', …] }.
//     { "v": 1, "coupe": true } (ou utilises: ['*']) coupe tous les indices : fps.mjs peut le
//     prérégler pour que ses mesures n'en voient aucun.
// Pendant un indice, l'objet porte data-gc-indice="<objet>" (tests).
import React from 'react';
import { clavierModalActif } from './clavier';
import { abonnerLoupe, getLoupe, loupeOccupee, LOUPE_EVENT, type LoupeDetail } from './loupe';
import { mouvementDoux } from './motion';
import { abonnerReglages } from './reglages';

export const CLE_INDICES = 'gc:indices:v1';
export const INDICE_MIN_MS = 6000;
export const INDICE_MAX_MS = 9000;
/** Événement des gestes du livre (src/components/Livre/evenements.ts : GESTE_EVENT). */
const GESTE_LIVRE = 'gc-livre-geste';

/** Une pulsation en cours : stop() la coupe et rend l'objet à son état de repos. */
export interface Pulsation {
  stop: () => void;
  /** Résolue à la fin naturelle de la pulsation. */
  fin: Promise<unknown>;
}

export interface CibleIndice {
  /** Identifiant stable de l'objet (« photo:julie », « feuillet:lisa-feuillet-recto »). */
  objet: string;
  /** Élément posé dans la page (visibilité, attribut data-gc-indice). */
  el: HTMLElement;
  /** Lance la pulsation (animate ponctuel, transform et opacity seulement). */
  jouer: () => Pulsation | null;
}

// ---- Mémoire --------------------------------------------------------------------------------------
interface Memoire {
  v: 1;
  utilises: string[];
  coupe?: boolean;
}

function lireMemoire(): Memoire {
  try {
    const brut = typeof localStorage !== 'undefined' ? localStorage.getItem(CLE_INDICES) : null;
    const o = brut ? (JSON.parse(brut) as Partial<Memoire>) : null;
    return {
      v: 1,
      utilises: Array.isArray(o?.utilises) ? o!.utilises.filter((x): x is string => typeof x === 'string') : [],
      coupe: o?.coupe === true,
    };
  } catch {
    return { v: 1, utilises: [] };
  }
}

let memoire: Memoire = lireMemoire();

const coupes = () => memoire.coupe === true || memoire.utilises.includes('*');
export const indiceDejaUtilise = (objet: string): boolean => coupes() || memoire.utilises.includes(objet);

/** L'objet a été utilisé (soulevé ou touché) : plus d'indice pour lui. */
export function indiceUtilise(objet: string): void {
  if (memoire.utilises.includes(objet)) return;
  memoire = { ...memoire, utilises: [...memoire.utilises, objet] };
  try {
    localStorage.setItem(CLE_INDICES, JSON.stringify(memoire));
  } catch { /* stockage indisponible : mémorisé pour cette visite */ }
  if (enCours?.cible.objet === objet) arreter();
}

/** Oublie les objets utilisés (tests, « tout revoir »). */
export function oublierIndices(): void {
  memoire = { v: 1, utilises: [] };
  try { localStorage.removeItem(CLE_INDICES); } catch { /* rien */ }
  planifier();
}

// ---- Ordonnanceur ---------------------------------------------------------------------------------
const cibles = new Set<CibleIndice>();
const montre = new Map<string, number>();
const gestes = new Map<string, number>();
const pointeurs = new Map<number, number>();
let minuterie: ReturnType<typeof setTimeout> | null = null;
let enCours: { cible: CibleIndice; pulsation: Pulsation } | null = null;
/** Un geste du livre sans « fin » au-delà de ce délai est tenu pour terminé. */
const GESTE_MAX_MS = 20000;

function bloque(): string | null {
  if (coupes()) return 'coupes';
  if (mouvementDoux()) return 'mouvement-reduit'; // (préférence du système comprise : un indice n'est pas un effet)
  if (typeof document !== 'undefined' && document.hidden) return 'onglet-cache';
  const t = typeof performance !== 'undefined' ? performance.now() : 0;
  gestes.forEach((t0, k) => { if (t - t0 > GESTE_MAX_MS) gestes.delete(k); });
  if (gestes.size) return 'geste';
  pointeurs.forEach((t0, k) => { if (t - t0 > GESTE_MAX_MS) pointeurs.delete(k); });
  if (pointeurs.size) return 'appui';
  const l = getLoupe();
  if (l.zoome || loupeOccupee()) return 'loupe';
  if (clavierModalActif()) return 'modal';
  return null;
}

function visible(el: HTMLElement): boolean {
  if (!el.isConnected || el.closest('[inert], [aria-hidden="true"]') || el.hasAttribute('data-gc-souleve') || el.querySelector('[data-gc-souleve]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return false;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const x0 = Math.max(0, r.left);
  const y0 = Math.max(0, r.top);
  const x1 = Math.min(W, r.right);
  const y1 = Math.min(H, r.bottom);
  if (x1 <= x0 || y1 <= y0 || (x1 - x0) * (y1 - y0) < 0.5 * r.width * r.height) return false;
  // Rien par-dessus (couverture fermée, menu, calque) : le centre de la partie visible touche l'objet.
  const touche = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
  return !!touche && (el === touche || el.contains(touche));
}

function choisir(): CibleIndice | null {
  let best: CibleIndice | null = null;
  for (const c of cibles) {
    if (indiceDejaUtilise(c.objet) || !visible(c.el)) continue;
    if (!best || (montre.get(c.objet) ?? 0) < (montre.get(best.objet) ?? 0)) best = c;
  }
  return best;
}

function arreter(): void {
  const e = enCours;
  enCours = null;
  if (!e) return;
  e.cible.el.removeAttribute('data-gc-indice');
  try { e.pulsation.stop(); } catch { /* rien */ }
}

function annuler(): void {
  if (minuterie) clearTimeout(minuterie);
  minuterie = null;
}

/** (Re)lance le compte à rebours : un indice dans 6 à 9 s. */
function planifier(): void {
  annuler();
  if (!cibles.size || coupes()) return;
  const delai = INDICE_MIN_MS + Math.random() * (INDICE_MAX_MS - INDICE_MIN_MS);
  minuterie = setTimeout(tick, delai);
}

function tick(): void {
  minuterie = null;
  if (enCours || bloque()) return planifier();
  const c = choisir();
  if (!c) return planifier();
  let p: Pulsation | null = null;
  try { p = c.jouer(); } catch { p = null; }
  if (p) {
    const e = { cible: c, pulsation: p };
    enCours = e;
    montre.set(c.objet, performance.now());
    c.el.setAttribute('data-gc-indice', c.objet);
    p.fin.then(() => {
      if (enCours !== e) return;
      enCours = null;
      c.el.removeAttribute('data-gc-indice');
    }, () => undefined);
  }
  planifier();
}

// Pause : arrêt net de l'indice en cours et du compte à rebours ; reprise : compte à rebours neuf.
function pause(): void {
  arreter();
  annuler();
}
const activite = () => {
  if (minuterie || cibles.size) planifier();
};

let installe = false;
function installer(): void {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  document.addEventListener(GESTE_LIVRE, (e) => {
    const d = (e as CustomEvent<{ phase?: string; type?: string }>).detail;
    const type = d?.type ?? '?';
    if (d?.phase === 'fin') {
      gestes.delete(type);
      if (!gestes.size) planifier();
    } else {
      gestes.set(type, performance.now());
      pause();
    }
  }, true);
  window.addEventListener(LOUPE_EVENT, (e) => {
    if ((e as CustomEvent<LoupeDetail>).detail?.phase === 'debut') pause();
    else planifier();
  });
  abonnerLoupe(() => (getLoupe().zoome ? pause() : planifier()));
  window.addEventListener('pointerdown', (e) => {
    pointeurs.set(e.pointerId, performance.now());
    activite();
  }, { capture: true, passive: true });
  const relache = (e: PointerEvent) => {
    pointeurs.delete(e.pointerId);
    activite();
  };
  window.addEventListener('pointerup', relache, { capture: true, passive: true });
  window.addEventListener('pointercancel', relache, { capture: true, passive: true });
  window.addEventListener('keydown', activite, { capture: true, passive: true });
  window.addEventListener('wheel', activite, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : planifier()));
  const mouvement = () => (mouvementDoux() ? pause() : planifier());
  abonnerReglages(mouvement);
  try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', mouvement); } catch { /* vieux navigateurs */ }
}

/** Inscrit un objet auprès de l'ordonnanceur. Renvoie la fonction de désinscription. */
export function enregistrerIndice(c: CibleIndice): () => void {
  installer();
  cibles.add(c);
  if (!minuterie) planifier();
  return () => {
    cibles.delete(c);
    if (enCours?.cible === c) arreter();
    if (!cibles.size) annuler();
  };
}

/**
 * Inscrit l'objet `ref` (mode vivant seulement : objet null sinon) ; `jouer` lance sa pulsation.
 * L'objet utilisé (soulevé, touché) le signale par indiceUtilise(objet).
 */
export function useIndice(objet: string | null, ref: React.RefObject<HTMLElement>, jouer: () => Pulsation | null): void {
  const jouerRef = React.useRef(jouer);
  jouerRef.current = jouer;
  React.useEffect(() => {
    const el = ref.current;
    if (!objet || !el) return undefined;
    return enregistrerIndice({ objet, el, jouer: () => jouerRef.current() });
  }, [objet, ref]);
}
