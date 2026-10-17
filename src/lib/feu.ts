// Horloge du feu de cheminée (plan v4, lot L) : UN moteur requestAnimationFrame pour toute
// l'application, qui fait vivre trois MotionValues lues par les calques de lumière (Stage, Lumiere).
// Aucun rendu React : les calques lisent les MotionValues (useTransform) et n'animent que
// opacity / transform de calques précalculés (CONTRACT §§ 4, 5, 13).
//
//   intensite  entre 0,6 et 1,6, autour de 1 : bruits lissés (≈ 0,3 à 3 Hz) + flambées occasionnelles
//              (montée rapide, descente lente, jusqu'à ≈ 1,6) + « pops » brefs (crépitements) ;
//   dx, dy     déplacement lent de la source, en px de scène (1920 × 1080) : ≈ ± 22 px en x, ± 10 px en y
//              (la flamme monte un peu quand elle flambe : dy < 0).
//
// Modes :
//   vivant     le moteur tourne tant qu'au moins un calque écoute (useFeu monté) et que l'onglet est visible ;
//   statique   mouvement réduit (système ou réglage) ou réglage `feu: false` : intensite = 1 (la moyenne),
//              dx = dy = 0, aucun rAF ; la lumière reste chaude, simplement immobile ;
//   pause      onglet caché (visibilitychange) : plus aucun rAF ; reprise sans saut au retour.
//
// API :
//   useFeu()              → { intensite, dx, dy } (MotionValues partagées ; le hook ne provoque aucun rendu)
//   abonnerFlambee(f)     → f({ type: 'flambee' | 'pop', force, synchro }) au début de chaque flambée ou pop ;
//                           renvoie la fonction de désabonnement
//   synchroniserFeu(s)    → (facultatif, lot S) les crépitements de la boucle sonore déclenchent les pops :
//                           s = { onsets, horloge, duree, forces?, flambees? } ; renvoie la fonction d'arrêt.
//                           Sans appel, rien ne change : les pops restent tirés au hasard.
//   getFeu()              → instantané { intensite, dx, dy, mode, images } (tests, débogage)
//   figerFeu(v | null)    → fige la lumière sur des valeurs données (captures, vérifications) ; null relâche
//
// Pour les vérifications (scripts/verify-lumiere.mjs) et l'ambiance sonore sans import (lot S) :
// window.__gcFeu = { etat, figer, flamber, synchroniserFeu } ; état publié window.__gcFeuSync, « gc-feu-sync ».
import React from 'react';
import { motionValue } from 'motion/react'; // (fabrique hors React : à réexporter par src/lib/motion.ts, demande au lead)
import { prefersReducedMotion, type MotionValue } from './motion';
import { abonnerReglages, getReglages } from './reglages';

export type ModeFeu = 'vivant' | 'statique' | 'pause';

export interface Feu {
  /** Intensité de la lumière du feu, entre 0,6 et 1,6 (autour de 1). */
  intensite: MotionValue<number>;
  /** Déplacement horizontal de la source (px de scène, ≈ ± 22). */
  dx: MotionValue<number>;
  /** Déplacement vertical de la source (px de scène, ≈ ± 10 ; négatif quand la flamme monte). */
  dy: MotionValue<number>;
}

export interface EvenementFeu {
  type: 'flambee' | 'pop';
  /** Force relative, 0 à 1. */
  force: number;
  /** true si l'événement vient de la boucle sonore (synchroniserFeu). */
  synchro: boolean;
}

/**
 * Synchronisation avec la boucle sonore du feu (lot S). Toutes les durées en secondes.
 * - `onsets` : instants des crépitements dans la boucle, depuis son début (précalculés à la cuisson) ;
 * - `horloge()` : position de lecture courante, par exemple `ctx.currentTime - debutBoucle` ;
 *   elle est prise modulo `duree` ; une exception ou une valeur non finie est ignorée ;
 * - `duree` : durée de la boucle ;
 * - `forces` (facultatif) : force 0–1 de chaque crépitement, même ordre que `onsets` (défaut 0,6) ;
 * - `flambees` (facultatif) : instants de « souffle » de la boucle qui déclenchent une flambée.
 */
export interface SyncFeu {
  onsets: number[];
  horloge: () => number;
  duree: number;
  forces?: number[];
  flambees?: number[];
}

// ---- Les trois valeurs partagées -------------------------------------------------------------
const FEU: Feu = {
  intensite: motionValue(1),
  dx: motionValue(0),
  dy: motionValue(0),
};

/**
 * La flamme de la bougie (éclat × étirement × luminosité de l'image, ≈ 0,85 à 1,07 ; 1 au repos), posée à chaque image par
 * Bougie.tsx : l'éclairage tracé (Lumiere.tsx) y règle la lumière de la bougie sur le livre.
 */
export const flammeBougie: MotionValue<number> = motionValue(1);

// ---- Bruit lissé : une valeur au hasard par nœud, interpolation de Catmull-Rom entre les nœuds ----
// Chaque octave avance à sa fréquence (Hz) ; amplitude en unités d'intensité (ou de px pour dx, dy).
class Octave {
  private v: [number, number, number, number];
  private phase = Math.random();
  constructor(private f: number, private amp: number) {
    this.v = [this.tirer(), this.tirer(), this.tirer(), this.tirer()];
  }
  private tirer() { return Math.random() * 2 - 1; }
  avancer(dt: number, vitesse = 1): number {
    this.phase += dt * this.f * vitesse;
    while (this.phase >= 1) {
      this.phase -= 1;
      this.v = [this.v[1], this.v[2], this.v[3], this.tirer()];
    }
    const [p0, p1, p2, p3] = this.v;
    const t = this.phase;
    const t2 = t * t;
    const t3 = t2 * t;
    const c = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    return c * this.amp;
  }
}

/** Somme d'octaves (bruit « fractal » lent). */
const bruit = (octaves: [number, number][]) => octaves.map(([f, a]) => new Octave(f, a));
const somme = (os: Octave[], dt: number, vitesse = 1) => os.reduce((s, o) => s + o.avancer(dt, vitesse), 0);

// Intensité : souffle lent et respiration douce ; écart type ≈ 0,11 (une lueur calme qui vacille, sans à-coups).
const BRUIT_I = bruit([[0.2, 0.17], [0.47, 0.12], [1.0, 0.07], [2.2, 0.03]]);
// Source : la flamme penche et revient très lentement (plus de dix secondes), et frémit à peine.
const BRUIT_X = bruit([[0.08, 22], [0.2, 7], [0.6, 1.5]]);
const BRUIT_Y = bruit([[0.1, 10], [0.27, 3], [0.8, 0.8]]);

// ---- Événements : flambées (montée 0,25–0,45 s, descente 1,6–3,2 s) et pops (≈ 40 ms / 160 ms) ----
interface Bouffee { t: number; montee: number; descente: number; amp: number }
let bouffees: Bouffee[] = [];
let horlogeInterne = 0; // s, n'avance que quand le feu est vivant
let prochaineFlambee = 4 + Math.random() * 6;
let prochainPop = 1.5 + Math.random() * 3;

const enveloppe = (b: Bouffee, t: number): number => {
  const u = t - b.t;
  if (u < 0) return 0;
  if (u < b.montee) {
    const x = u / b.montee;
    return b.amp * x * x * (3 - 2 * x);
  }
  return b.amp * Math.exp(-(u - b.montee) / b.descente);
};

const abonnesFlambee = new Set<(e: EvenementFeu) => void>();
function annoncer(e: EvenementFeu) {
  abonnesFlambee.forEach((f) => {
    try { f(e); } catch { /* un abonné fautif ne casse pas le feu */ }
  });
}

function flamber(force: number, synchro = false) {
  const f = Math.min(1, Math.max(0, force));
  bouffees.push({ t: horlogeInterne, montee: 0.4 + 0.3 * Math.random(), descente: 2.2 + 2 * Math.random(), amp: 0.15 + 0.2 * f });
  annoncer({ type: 'flambee', force: f, synchro });
}

function popper(force: number, synchro = false) {
  const f = Math.min(1, Math.max(0, force));
  bouffees.push({ t: horlogeInterne, montee: 0.035 + 0.02 * Math.random(), descente: 0.13 + 0.08 * Math.random(), amp: 0.05 + 0.08 * f });
  annoncer({ type: 'pop', force: f, synchro });
}

// ---- Synchronisation sonore (facultative) -----------------------------------------------------
let sync: SyncFeu | null = null;
/** L'objet reçu tel quel (le pont « gc-feu-sync » ne rebranche pas deux fois la même boucle). */
let syncSource: SyncFeu | null = null;
let syncPos: number | null = null;
/** Horloge interne de la dernière avance de la boucle sonore (audio suspendu : elle n'avance pas). */
let syncVu = -Infinity;

function lireSync() {
  const s = sync;
  if (!s || !(s.duree > 0)) return;
  let brut: number;
  try { brut = s.horloge(); } catch { return; }
  if (!Number.isFinite(brut)) return;
  const pos = ((brut % s.duree) + s.duree) % s.duree;
  const prec = syncPos;
  syncPos = pos;
  if (prec == null) return;
  // Écart d'une image : (prec, pos], en tenant compte du retour au début de la boucle.
  const ecart = pos >= prec ? pos - prec : pos + s.duree - prec;
  if (ecart > 0) syncVu = horlogeInterne;
  if (ecart <= 0 || ecart > 0.5) return; // saut (pause, recalage) : on ne rattrape pas
  const dedans = (t: number) => (pos >= prec ? t > prec && t <= pos : t > prec || t <= pos);
  s.onsets.forEach((t, i) => { if (dedans(t)) popper(s.forces?.[i] ?? 0.6, true); });
  s.flambees?.forEach((t) => { if (dedans(t)) flamber(0.7, true); });
}

/**
 * Branche (ou débranche avec null) la boucle sonore du feu : ses crépitements déclenchent des pops de
 * lumière synchrones ; tant qu'elle est branchée, les pops au hasard s'arrêtent (les flambées
 * continuent). Renvoie la fonction d'arrêt. Sans effet en mode statique (mouvement réduit, feu: false).
 */
export function synchroniserFeu(s: SyncFeu | null): () => void {
  syncSource = s;
  sync = s && Array.isArray(s.onsets) && typeof s.horloge === 'function' && s.duree > 0
    ? { ...s, onsets: [...s.onsets].sort((a, b) => a - b) }
    : null;
  syncPos = null;
  syncVu = -Infinity;
  const moi = sync;
  return () => {
    if (sync === moi) { sync = null; syncSource = null; syncPos = null; }
  };
}

/** S'abonne aux flambées et aux pops (début de chaque événement). Renvoie la fonction de désabonnement. */
export function abonnerFlambee(f: (e: EvenementFeu) => void): () => void {
  abonnesFlambee.add(f);
  return () => { abonnesFlambee.delete(f); };
}

// ---- Le moteur -----------------------------------------------------------------------------------
let ecoutes = 0;
let raf = 0;
let dernier = 0;
let images = 0;
let fige: { intensite: number; dx: number; dy: number } | null = null;

const arrondi = (v: number, p = 1e4) => Math.round(v * p) / p;

function pas(t: number) {
  raf = 0;
  const dt = dernier ? Math.min(0.1, Math.max(0, (t - dernier) / 1000)) : 1 / 60;
  dernier = t;
  horlogeInterne += dt;
  images++;

  // Événements au hasard (les pops seulement sans boucle sonore).
  if (horlogeInterne >= prochaineFlambee) {
    flamber(Math.random());
    prochaineFlambee = horlogeInterne + 6 + Math.random() * 10;
  }
  if (sync) lireSync();
  // Pops au hasard sans boucle sonore, ou quand elle ne joue pas (audio pas encore déverrouillé, suspendu).
  const sonore = !!sync && horlogeInterne - syncVu < 0.6;
  if (!sonore && horlogeInterne >= prochainPop) {
    popper(Math.random());
    prochainPop = horlogeInterne + (Math.random() < 0.3 ? 0.25 + Math.random() * 0.4 : 1.4 + Math.random() * 3.6);
  }

  let bouffee = 0;
  let flambee = 0;
  for (const b of bouffees) {
    const v = enveloppe(b, horlogeInterne);
    bouffee += v;
    if (b.montee > 0.2) flambee += v;
  }
  bouffees = bouffees.filter((b) => horlogeInterne - b.t < b.montee + b.descente * 6);

  // Pendant une flambée, la flamme est plus turbulente : le bruit rapide s'accélère un peu.
  const turbulence = 1 + 1.2 * flambee;
  const i = 1 + somme(BRUIT_I, dt, turbulence) + bouffee;
  const x = somme(BRUIT_X, dt, turbulence);
  const y = somme(BRUIT_Y, dt, turbulence) - 18 * flambee;

  FEU.intensite.set(arrondi(Math.min(1.6, Math.max(0.6, i))));
  FEU.dx.set(arrondi(x, 100));
  FEU.dy.set(arrondi(y, 100));
  raf = requestAnimationFrame(pas);
}

const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

function statique(): boolean {
  const r = getReglages() as unknown as { feu?: unknown };
  return r.feu === false || prefersReducedMotion();
}

export function modeFeu(): ModeFeu {
  if (fige || statique()) return 'statique';
  if (!visible()) return 'pause';
  return 'vivant';
}

function arreter() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  dernier = 0;
}

function poser(v: { intensite: number; dx: number; dy: number }) {
  FEU.intensite.set(v.intensite);
  FEU.dx.set(v.dx);
  FEU.dy.set(v.dy);
}

/** Relit l'état (réglages, visibilité, écoutes) et démarre ou arrête le moteur. */
function majMoteur() {
  const mode = modeFeu();
  if (mode === 'statique') {
    arreter();
    poser(fige ?? { intensite: 1, dx: 0, dy: 0 });
    return;
  }
  if (mode === 'pause' || ecoutes <= 0 || typeof requestAnimationFrame === 'undefined') {
    arreter();
    return;
  }
  if (!raf) raf = requestAnimationFrame(pas);
}

let branche = false;
function brancher() {
  if (branche || typeof window === 'undefined') return;
  branche = true;
  document.addEventListener('visibilitychange', majMoteur);
  abonnerReglages(majMoteur);
  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.addEventListener) mq.addEventListener('change', majMoteur);
    else mq.addListener?.(majMoteur);
  } catch { /* matchMedia indisponible */ }
  // Poignée de vérification (scripts/verify-lumiere.mjs) : lecture, gel, flambée à la demande (vidéo),
  // et pont sans import pour l'ambiance sonore (lot S, src/lib/ambiance.ts : publierFeu) — elle appelle
  // window.__gcFeu.synchroniserFeu(sync), garde le dernier état dans window.__gcFeuSync et émet
  // « gc-feu-sync » ; on reprend l'état déjà publié, puis on écoute.
  const w = window as unknown as { __gcFeu?: unknown; __gcFeuSync?: SyncFeu | null };
  w.__gcFeu = { etat: getFeu, figer: figerFeu, flamber: () => flamber(0.9), synchroniserFeu };
  if (w.__gcFeuSync) synchroniserFeu(w.__gcFeuSync);
  window.addEventListener('gc-feu-sync', (e) => {
    const d = (e as CustomEvent<SyncFeu | null>).detail;
    if ((d ?? null) !== syncSource) synchroniserFeu(d ?? null);
  });
}

/** Les valeurs partagées du feu, hors React (le moteur ne tourne pas tant que personne n'écoute). */
export function feu(): Feu {
  return FEU;
}

/**
 * Le feu, pour un composant : les trois MotionValues partagées. Monter le hook fait tourner le moteur
 * (une seule boucle pour toute l'application) ; il s'arrête quand plus aucun calque n'écoute.
 * Le hook ne provoque jamais de rendu.
 */
export function useFeu(): Feu {
  useEcoute();
  return FEU;
}

function useEcoute() {
  React.useEffect(() => {
    brancher();
    ecoutes++;
    majMoteur();
    return () => {
      ecoutes--;
      majMoteur();
    };
  }, []);
}

/** Instantané (tests, débogage). `images` : nombre d'images calculées par le moteur depuis le chargement. */
export function getFeu(): { intensite: number; dx: number; dy: number; mode: ModeFeu; images: number; ecoutes: number; synchro: boolean } {
  return { intensite: FEU.intensite.get(), dx: FEU.dx.get(), dy: FEU.dy.get(), mode: modeFeu(), images, ecoutes, synchro: !!sync };
}

/**
 * Fige la lumière (captures, vérifications) : `figerFeu({ intensite: 1.25 })` pose une flambée,
 * `figerFeu(null)` rend la main au moteur. Valeurs absentes : la moyenne (1, 0, 0).
 */
export function figerFeu(v: Partial<{ intensite: number; dx: number; dy: number }> | null): void {
  brancher();
  fige = v ? { intensite: v.intensite ?? 1, dx: v.dx ?? 0, dy: v.dy ?? 0 } : null;
  majMoteur();
}
