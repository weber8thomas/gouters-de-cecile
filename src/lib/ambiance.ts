// Ambiance sonore (plan v4, lot S) : un feu de cheminée derrière le carnet, et de temps en temps un petit
// bruit de cuisine — cuillère dans la tasse, tasse posée sur sa soucoupe, bouilloire qui frémit au loin,
// thé qu'on verse, couvercle de la boîte à biscuits. Un fond, jamais au premier plan.
//
//   - Réglage « ambiance » (reglages.ambiance, null = automatique : active sur TV et ordinateur, coupée
//     sur téléphone) ; volume des réglages ;
//   - démarre en fondu (3 s) quand le premier geste déverrouille l'audio (src/lib/son.ts : même
//     contexte, même déverrouillage) ; en sourdine (× 0,15) pendant qu'une vidéo joue ; en pause quand
//     l'onglet est caché (le contexte est suspendu) ;
//   - le feu : une boucle de `boucle` s jouée en fondu croisé à puissance constante (`fondu` s : la fin
//     d'un passage se mêle au début du suivant), deux sources à la fois au plus ;
//   - la cuisine : un bruit au hasard toutes les 8 à 25 s, jamais le même deux fois de suite, un peu à
//     gauche ou à droite (StereoPanner), jamais pendant une vidéo ; relevé de GAIN_CUISINE (× 2, + 6 dB)
//     pour passer par-dessus le feu, sans être au premier plan ;
//   - « muet » (bouton haut-parleur, reglages.muet) : le gain maître de l'ambiance va à 0 ; le feu continue
//     en silence (la lumière suit toujours ses crépitements) ;
//   - la lumière du feu (lot L, src/lib/feu.ts) suit les crépitements : voir publierFeu().
// Branché par useAmbiance() (monté dans le SoulevementProvider : le carnet, la carte Soulever).
// Banque : design-system/baked/sons/banque.json, clé « ambiance » (scripts/bake-sons.mjs).
import React from 'react';
import banqueJson from '../../design-system/baked/sons/banque.json';
import {
  abonnerAudio, abonnerVideo, besoinAudio, contexteAudio, decoderSon, estTelephone, prechargerSon, urlSon, videoEnLecture,
} from './son';
import { abonnerReglages, getReglages, type Reglages } from './reglages';

export type NomCuisine = 'cuisine-cuillere' | 'cuisine-tasse' | 'cuisine-bouilloire' | 'cuisine-the' | 'cuisine-boite';

interface FeuBanque {
  f: string;
  g: number;
  d: number;
  boucle: number;
  fondu: number;
  onsets: number[];
  forces: number[];
}
interface Ambiance {
  feu: FeuBanque;
  cuisine: Record<string, { f: string; g: number; d: number }[]>;
}
const AMBIANCE = (banqueJson as unknown as { ambiance?: Ambiance }).ambiance ?? null;

/** Ambiance active pour ces réglages (automatique : coupée sur un téléphone). */
export function ambianceEffective(r: Pick<Reglages, 'ambiance'>): boolean {
  if (r.ambiance !== null && r.ambiance !== undefined) return r.ambiance;
  return !estTelephone();
}

export const FONDU_ENTREE = 3;
export const SOURDINE_VIDEO = 0.15;
export const CUISINE_MIN_S = 8;
export const CUISINE_MAX_S = 25;
/** Relevé des bruits de cuisine (multiplie le gain de la banque) : le feu est à −36 dB RMS en sortie. */
export const GAIN_CUISINE = 2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- État ----------------------------------------------------------------------------------------
let branchements = 0;
let enMarche = false;
let demarrage: Promise<void> | null = null;
let maitre: GainNode | null = null;
let busFeu: GainNode | null = null;
let busCuisine: GainNode | null = null;
let tampon: AudioBuffer | null = null;
let prochain = 0;
const passages: { src: AudioBufferSourceNode; t0: number }[] = [];
let minuterieBoucle: ReturnType<typeof setInterval> | null = null;
let minuterieCuisine: ReturnType<typeof setTimeout> | null = null;
let prochaineCuisine = 0;
let derniereCuisine: string | null = null;
let journalCuisine: { nom: string; pan: number; t: number }[] = [];

/** L'ambiance doit jouer : branchée, voulue par les réglages, et sa banque est joignable. */
function voulue(): boolean {
  return branchements > 0 && !!AMBIANCE && ambianceEffective(getReglages()) && !!urlSon(AMBIANCE.feu.f);
}

function niveau(): number {
  const r = getReglages();
  if (r.muet) return 0;
  return clamp01(r.volume) * (videoEnLecture() ? SOURDINE_VIDEO : 1);
}

let derniereRegle = 0;
/** Va vers le niveau voulu en `duree` s. Chaque réglage a son instant, strictement après le précédent. */
function regler(duree: number): void {
  const c = contexteAudio();
  if (!c || !maitre) return;
  const t = Math.max(c.currentTime, derniereRegle + 0.005);
  derniereRegle = t;
  const g = maitre.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(enMarche ? niveau() : 0, t + Math.max(0.02, duree));
}

// ---- Le feu : passages en fondu croisé -----------------------------------------------------------
const courbe = (entree: boolean) => {
  const n = 64;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    a[i] = entree ? Math.sin((Math.PI / 2) * x) : Math.cos((Math.PI / 2) * x);
  }
  return a;
};
const ENTREE = courbe(true);
const SORTIE = courbe(false);

function passage(c: AudioContext, t0: number, premier: boolean): void {
  if (!tampon || !busFeu || !AMBIANCE) return;
  const { boucle: P, fondu: F } = AMBIANCE.feu;
  const src = c.createBufferSource();
  src.buffer = tampon;
  const g = c.createGain();
  if (premier) g.gain.setValueAtTime(1, t0);
  else g.gain.setValueCurveAtTime(ENTREE, t0, F);
  g.gain.setValueCurveAtTime(SORTIE, t0 + P, F);
  src.connect(g);
  g.connect(busFeu);
  src.onended = () => {
    const i = passages.findIndex((p) => p.src === src);
    if (i >= 0) passages.splice(i, 1);
    try { src.disconnect(); g.disconnect(); } catch { /* rien */ }
  };
  src.start(t0, 0, P + F);
  passages.push({ src, t0 });
}

/** Garde toujours le passage suivant programmé (horloge audio : rien ne bouge quand l'onglet est caché). */
function entretenir(): void {
  const c = contexteAudio();
  if (!c || !enMarche || !AMBIANCE) return;
  while (prochain - c.currentTime < 4) {
    passage(c, prochain, false);
    prochain += AMBIANCE.feu.boucle;
  }
}

/** Position (s) dans le passage en cours : l'horloge des crépitements. */
function position(): number {
  const c = contexteAudio();
  if (!c || !passages.length) return 0;
  const t = c.currentTime;
  let t0 = -Infinity;
  for (const p of passages) if (p.t0 <= t && p.t0 > t0) t0 = p.t0;
  return Number.isFinite(t0) ? Math.max(0, t - t0) : 0;
}

/** Synchronisation avec la lumière du feu (lot L, src/lib/feu.ts : synchroniserFeu). */
export interface SynchroFeu {
  /** Instants des crépitements (s), dans [0, duree). */
  onsets: number[];
  /** Force de chaque crépitement (0–1). */
  forces: number[];
  /** Position (s) dans la boucle, lue sur l'horloge audio (immobile quand l'audio est suspendu). */
  horloge: () => number;
  /** Durée de la boucle (s). */
  duree: number;
}

/**
 * Prévient la lumière du feu (null : le feu sonore s'est tu). Tant que src/lib/feu.ts n'existe pas, sans
 * import : window.__gcFeu.synchroniserFeu(sync) s'il est branché, window.__gcFeuSync (dernier état) et
 * l'événement « gc-feu-sync » (detail : sync) sur window.
 */
function publierFeu(actif: boolean): void {
  if (typeof window === 'undefined' || !AMBIANCE) return;
  const sync: SynchroFeu | null = actif
    ? { onsets: AMBIANCE.feu.onsets, forces: AMBIANCE.feu.forces, horloge: position, duree: AMBIANCE.feu.boucle }
    : null;
  const w = window as unknown as { __gcFeuSync?: SynchroFeu | null; __gcFeu?: { synchroniserFeu?: (s: SynchroFeu | null) => void } };
  w.__gcFeuSync = sync;
  try { w.__gcFeu?.synchroniserFeu?.(sync); } catch { /* la lumière ne casse jamais le son */ }
  window.dispatchEvent(new CustomEvent<SynchroFeu | null>('gc-feu-sync', { detail: sync }));
}

// ---- La cuisine -------------------------------------------------------------------------------------
function planifierCuisine(): void {
  if (minuterieCuisine) clearTimeout(minuterieCuisine);
  minuterieCuisine = null;
  if (!enMarche) return;
  const s = CUISINE_MIN_S + Math.random() * (CUISINE_MAX_S - CUISINE_MIN_S);
  prochaineCuisine = Date.now() + s * 1000;
  minuterieCuisine = setTimeout(() => {
    const c = contexteAudio();
    if (c && c.state === 'running' && !document.hidden && !videoEnLecture()) jouerCuisine();
    planifierCuisine();
  }, s * 1000);
}

/** Un bruit de cuisine (au hasard, ou celui-ci), un peu à gauche ou à droite. Sans effet si l'ambiance dort. */
export function jouerCuisine(nom?: NomCuisine): void {
  try {
    const c = contexteAudio();
    if (!c || c.state !== 'running' || !enMarche || !busCuisine || !AMBIANCE || getReglages().muet) return;
    const noms = Object.keys(AMBIANCE.cuisine).filter((n) => AMBIANCE.cuisine[n]?.length);
    const choix = nom && noms.includes(nom) ? nom : noms.filter((n) => n !== derniereCuisine)[Math.floor(Math.random() * Math.max(1, noms.length - 1))];
    if (!choix) return;
    derniereCuisine = choix;
    const vs = AMBIANCE.cuisine[choix];
    const v = vs[Math.floor(Math.random() * vs.length)];
    const pan = (Math.random() < 0.5 ? -1 : 1) * (0.25 + 0.45 * Math.random());
    const bus = busCuisine;
    void decoderSon(v.f).then((b) => {
      if (!b || !enMarche || contexteAudio() !== c) return;
      const src = c.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.03;
      const g = c.createGain();
      g.gain.value = v.g * GAIN_CUISINE;
      src.connect(g);
      let fin: AudioNode = g;
      if (typeof c.createStereoPanner === 'function') {
        const p = c.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        fin = p;
      }
      fin.connect(bus);
      src.onended = () => { try { src.disconnect(); g.disconnect(); fin.disconnect(); } catch { /* rien */ } };
      src.start();
      journalCuisine = [...journalCuisine.slice(-19), { nom: choix, pan, t: c.currentTime }];
    });
  } catch { /* jamais d'erreur pour un son */ }
}

// ---- Marche / arrêt -------------------------------------------------------------------------------
function demarrer(): void {
  const c = contexteAudio();
  if (enMarche || demarrage || !voulue() || !c || c.state !== 'running' || !AMBIANCE) return;
  demarrage = decoderSon(AMBIANCE.feu.f).then((b) => {
    demarrage = null;
    if (!b || enMarche || !voulue() || contexteAudio() !== c) return;
    tampon = b;
    if (!maitre) {
      maitre = c.createGain();
      maitre.gain.value = 0;
      maitre.connect(c.destination);
      busFeu = c.createGain();
      busFeu.gain.value = AMBIANCE.feu.g;
      busFeu.connect(maitre);
      busCuisine = c.createGain();
      busCuisine.connect(maitre);
    }
    enMarche = true;
    const t0 = c.currentTime + 0.05;
    passage(c, t0, true);
    prochain = t0 + AMBIANCE.feu.boucle;
    regler(FONDU_ENTREE);
    if (!minuterieBoucle) minuterieBoucle = setInterval(entretenir, 1000);
    planifierCuisine();
    for (const vs of Object.values(AMBIANCE.cuisine)) for (const v of vs) void decoderSon(v.f);
    publierFeu(true);
  });
}

function arreter(duree = 1.2): void {
  if (!enMarche) return;
  enMarche = false;
  regler(duree);
  const c = contexteAudio();
  const fin = (c?.currentTime ?? 0) + duree + 0.05;
  for (const p of passages) { try { p.src.stop(fin); } catch { /* déjà arrêtée */ } }
  if (minuterieBoucle) clearInterval(minuterieBoucle);
  minuterieBoucle = null;
  if (minuterieCuisine) clearTimeout(minuterieCuisine);
  minuterieCuisine = null;
  publierFeu(false);
}

function suivre(): void {
  if (voulue()) {
    if (enMarche) regler(0.6);
    else demarrer();
  } else arreter();
}

let installe = false;
function installer(): void {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  besoinAudio(voulue);
  abonnerAudio(() => { if (contexteAudio()?.state === 'running') demarrer(); });
  abonnerVideo(() => regler(videoEnLecture() ? 0.8 : 2));
  abonnerReglages(suivre);
}

/** Branche l'ambiance (un compteur : plusieurs branchements, un seul feu). Renvoie de quoi la débrancher. */
export function brancherAmbiance(): () => void {
  installer();
  branchements++;
  if (voulue() && AMBIANCE) {
    const plusTard = () => { if (voulue()) prechargerSon(AMBIANCE.feu.f); };
    if (document.readyState === 'complete') setTimeout(plusTard, 2500);
    else window.addEventListener('load', () => setTimeout(plusTard, 2500), { once: true });
  }
  demarrer();
  let fait = false;
  return () => {
    if (fait) return;
    fait = true;
    branchements = Math.max(0, branchements - 1);
    if (!branchements) arreter();
  };
}

/** L'ambiance tant que le composant est monté (SoulevementProvider). */
export function useAmbiance(): void {
  React.useEffect(() => brancherAmbiance(), []);
}

/** État, pour les tests et le débogage. */
export function etatAmbiance(): {
  voulue: boolean; enMarche: boolean; niveau: number | null; cible: number; passages: number; prochaineCuisineS: number | null;
  derniereCuisine: string | null; cuisine: { nom: string; pan: number; t: number }[]; position: number;
} {
  return {
    voulue: voulue(),
    enMarche,
    niveau: maitre ? maitre.gain.value : null,
    cible: enMarche ? niveau() : 0,
    passages: passages.length,
    prochaineCuisineS: minuterieCuisine ? Math.max(0, (prochaineCuisine - Date.now()) / 1000) : null,
    derniereCuisine,
    cuisine: journalCuisine,
    position: position(),
  };
}
