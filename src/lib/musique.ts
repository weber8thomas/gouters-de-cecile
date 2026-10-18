// Musique de fond du carnet (lot M) : un morceau en boucle, libre de droits (Kevin MacLeod, incompetech.com,
// CC BY 4.0 ; crédits au menu ⚙ et dans design-system/sources/musique/licences.json), joué sur le même
// AudioContext que les sons du livre (src/lib/son.ts) et l'ambiance (src/lib/ambiance.ts).
//   - réglages « musique » (morceau choisi au menu) et « musiqueActive » (bouton musique) : coupée par défaut ;
//   - le premier geste déverrouille l'audio pour elle aussi (besoinAudio, comme l'ambiance) ;
//   - démarre en fondu de 4 s ; changer de morceau : fondu croisé de 2 s ;
//   - niveau : 0,1 × le volume de la musique (reglages.volumeMusique, sous le feu, src/lib/ambiance.ts), × 0,2
//     pendant une vidéo soulevée ; réglable musique coupée, le niveau suit alors sans jouer ;
//   - « muet » (bouton haut-parleur, reglages.muet) : le gain va à 0 et la boucle continue, comme le feu ;
//   - en pause quand l'onglet est caché : son.ts suspend le contexte partagé, donc l'horloge audio s'arrête ;
//   - banque : design-system/baked/musique/banque.json (scripts/bake-musique.mjs), fichiers musique/<id>.mp3,
//     joignables seulement sur le site (scripts/assets.mjs : audio = site seulement, jamais l'artifact).
// Branché à l'import (comme son.ts) : le menu (src/components/Reglages) importe ce module pour ses noms.
import banqueJson from '../../design-system/baked/musique/banque.json';
import { assetInfo, assetUrl } from './assets';
import { abonnerReglages, getReglages } from './reglages';
import { abonnerAudio, abonnerVideo, besoinAudio, contexteAudio, videoEnLecture } from './son';

export interface Morceau {
  id: string;
  titre: string;
  auteur: string;
  licence: string;
  /** Lien de la licence (creativecommons.org) et page du morceau au catalogue (crédits du menu). */
  licenceUrl: string;
  url: string;
  /** Texte de crédit à reproduire (titre, auteur, licence, lien). */
  credit: string;
  /** Nom logique de l'asset (« musique/<id> »). */
  f: string;
  /** Durée de la boucle (s). */
  d: number;
}

/** Les morceaux de la banque, dans l'ordre du menu (le premier est celui par défaut). */
export const MORCEAUX: readonly Morceau[] = (banqueJson as { morceaux: Morceau[] }).morceaux;

const FONDU_ENTREE = 4;
const FONDU_CHANGEMENT = 2;
/** Niveau de la musique, en fraction du volume des réglages : un fond, sous le feu (0,248) et le livre. */
export const NIVEAU_MUSIQUE = 0.1;
export const SOURDINE_VIDEO_MUSIQUE = 0.2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
type Ctor = new (o?: AudioContextOptions) => AudioContext;

function constructeur(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return !!(w.AudioContext ?? w.webkitAudioContext);
}

/** Le bouton haut-parleur a coupé les sons ? Lu de façon défensive. */
const muet = (): boolean => (getReglages() as unknown as { muet?: unknown }).muet === true;

/** Le morceau demandé par les réglages ; null si la musique est coupée, « aucune » ou inconnu. */
function demande(): Morceau | null {
  const r = getReglages() as unknown as { musique: string; musiqueActive?: unknown };
  if (r.musiqueActive !== true) return null;
  return MORCEAUX.find((m) => m.id === r.musique) ?? null;
}

/** Adresse de la boucle ; vide si l'inventaire ne la connaît pas (artifact : pas de musique). */
function adresse(m: Morceau): string {
  return assetInfo(m.f) ? assetUrl(m.f) : '';
}

/** La musique doit jouer : un morceau est demandé et sa boucle est joignable. */
function voulue(): boolean {
  const m = demande();
  return !!m && constructeur() && !!adresse(m);
}

// ---- Chargement -----------------------------------------------------------------------------------
const octets = new Map<string, Promise<ArrayBuffer | null>>();
const decodages = new Map<string, Promise<AudioBuffer | null>>();
const tampons = new Map<string, AudioBuffer>();

/** Octets de la boucle (une seule requête ; 404 ou réseau coupé : null, sans nouvel essai). */
function telecharger(m: Morceau): Promise<ArrayBuffer | null> {
  let p = octets.get(m.id);
  if (!p) {
    const url = adresse(m);
    p = !url || typeof fetch === 'undefined'
      ? Promise.resolve(null)
      : fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    octets.set(m.id, p);
  }
  return p;
}

/** Décode la boucle une seule fois, sur le contexte partagé. */
function decoder(m: Morceau, c: AudioContext): Promise<AudioBuffer | null> {
  let p = decodages.get(m.id);
  if (!p) {
    p = telecharger(m).then((ab) => new Promise<AudioBuffer | null>((resolve) => {
      if (!ab) return resolve(null);
      try {
        // Forme à rappels (anciens Safari) ; la promesse rendue par les navigateurs récents est absorbée.
        const r = c.decodeAudioData(ab, (b) => resolve(b), () => resolve(null)) as unknown as Promise<AudioBuffer> | undefined;
        r?.catch?.(() => resolve(null));
      } catch {
        resolve(null);
      }
    })).then((b) => {
      if (b) tampons.set(m.id, b);
      return b;
    });
    decodages.set(m.id, p);
  }
  return p;
}

// ---- Moteur ---------------------------------------------------------------------------------------
interface Voix {
  id: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
}
let maitre: GainNode | null = null;
let maitreDe: AudioContext | null = null;
let voix: Voix | null = null;

/** Niveau voulu : 0 en muet ; sinon volume de la musique × 0,1, et × 0,2 pendant une vidéo. */
export function niveauMusique(): number {
  if (muet()) return 0;
  return clamp01(getReglages().volumeMusique) * NIVEAU_MUSIQUE * (videoEnLecture() ? SOURDINE_VIDEO_MUSIQUE : 1);
}

/** Va vers le niveau voulu en `duree` s. */
function regler(duree: number): void {
  const c = contexteAudio();
  if (!c || !maitre) return;
  const t = c.currentTime;
  const g = maitre.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(niveauMusique(), t + Math.max(0.02, duree));
}

/** Fait taire une voix en `duree` s, puis la libère. */
function taire(v: Voix, c: AudioContext, duree: number): void {
  const t = c.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.linearRampToValueAtTime(0, t + duree);
  try { v.src.stop(t + duree + 0.05); } catch { /* déjà arrêtée */ }
  v.src.onended = () => {
    try { v.src.disconnect(); v.gain.disconnect(); } catch { /* déjà débranchée */ }
  };
}

/** Lance la boucle : fondu d'entrée, ou fondu croisé avec le morceau qui jouait. */
function lancer(m: Morceau, c: AudioContext, b: AudioBuffer): void {
  if (!maitre || maitreDe !== c) {
    maitre = c.createGain();
    maitre.gain.value = niveauMusique();
    maitre.connect(c.destination);
    maitreDe = c;
  }
  const t = c.currentTime + 0.05;
  const precedente = voix;
  if (precedente) taire(precedente, c, FONDU_CHANGEMENT);
  const src = c.createBufferSource();
  src.buffer = b;
  src.loop = true;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + (precedente ? FONDU_CHANGEMENT : FONDU_ENTREE));
  src.connect(gain);
  gain.connect(maitre);
  src.start(t);
  voix = { id: m.id, src, gain };
}

function arreter(duree = 1.2): void {
  const c = contexteAudio();
  if (!voix || !c) {
    voix = null;
    return;
  }
  taire(voix, c, duree);
  voix = null;
}

/** Joue ce que les réglages demandent. Sans contexte, sans boucle ou sans décodage : attend, sans erreur. */
function suivre(): void {
  // Le niveau suit le réglage, morceau joué ou non : un départ repart déjà au bon volume.
  regler(0.15);
  const m = demande();
  if (!m || !voulue()) {
    arreter();
    return;
  }
  const c = contexteAudio();
  if (!c) {
    void telecharger(m);
    return;
  }
  if (voix?.id === m.id) return;
  const b = tampons.get(m.id);
  if (!b) {
    void decoder(m, c).then((x) => { if (x && contexteAudio() === c) suivre(); });
    return;
  }
  if (c.state !== 'running') return; // joué dès que le contexte tourne (abonnerAudio)
  lancer(m, c, b);
}

// ---- Installation (à l'import, dans un navigateur) -------------------------------------------------
let installe = false;
function installer(): void {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  besoinAudio(voulue);
  abonnerAudio(suivre);
  abonnerVideo(() => regler(videoEnLecture() ? 0.8 : 2));
  abonnerReglages(suivre);
  // Les octets de la boucle, une fois la page chargée (le décodage attend le premier geste).
  const plusTard = () => {
    const m = demande();
    if (m && voulue()) void telecharger(m);
  };
  if (document.readyState === 'complete') setTimeout(plusTard, 3000);
  else window.addEventListener('load', () => setTimeout(plusTard, 3000), { once: true });
}

installer();

/** État, pour les tests et le débogage. */
export function etatMusique(): { morceau: string | null; joue: boolean; niveau: number; cible: number; muet: boolean } {
  return {
    morceau: voix?.id ?? null,
    joue: !!voix,
    niveau: maitre ? maitre.gain.value : 0,
    cible: niveauMusique(),
    muet: muet(),
  };
}
