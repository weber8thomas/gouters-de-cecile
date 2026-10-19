// Playlist du carnet : rotation « toutes » de 25 s, ou lecture/enchaînement des morceaux choisis.
// Déverrouillée par le premier geste, fondus croisés, pause pendant les vidéos et reprise à la même place.
// Deux tampons au maximum (morceau courant et suivant), réseau et décodage bornés ; crédits au menu.
import React from 'react';
import banqueJson from '../../design-system/baked/musique/banque.json';
import { assetInfo, assetUrl } from './assets';
import { abonnerReglages, getReglages, setReglages } from './reglages';
import { abonnerAudio, abonnerVideo, besoinAudio, contexteAudio, videoEnLecture } from './son';

export interface Morceau {
  id: string; titre: string; auteur: string; licence: string; licenceUrl: string; url: string;
  credit: string; f: string; d: number;
}
export const MORCEAUX: readonly Morceau[] = (banqueJson as { morceaux: Morceau[] }).morceaux;
export const NIVEAU_MUSIQUE = 0.2;
export const SOURDINE_VIDEO_MUSIQUE = 0;
const FONDU_ENTREE = 4;
const FONDU_CHANGEMENT = 3;
const DUREE_EXTRAIT_ROTATION = 25;
const tampons = new Map<string, AudioBuffer>();
const chargements = new Map<string, Promise<AudioBuffer | null>>();
const echecs = new Set<string>();
const abonnes = new Set<() => void>();
interface Voix {
  id: string; src: AudioBufferSourceNode; gain: GainNode; debut: number; offset: number; duree: number;
  rotationEcoulee: number; rotationDepuis: number;
}
let voix: Voix | null = null;
let reprise: { id: string; offset: number; rotation: number } | null = null;
let indexRotation = 0;
let rotationDemandee = false;
let maitre: GainNode | null = null;
let maitreDe: AudioContext | null = null;
let chargeId: string | null = null;
let erreur: string | null = null;
export interface EtatMusique {
  morceau: string | null; titre: string; joue: boolean; niveau: number; cible: number; muet: boolean;
  statut: 'arretee' | 'attend-geste' | 'chargement' | 'lecture' | 'pause-video' | 'pause-onglet' | 'indisponible';
  enchaine: boolean; decodes: number;
}
let snapshot: EtatMusique = { morceau: null, titre: '', joue: false, niveau: 0, cible: 0, muet: false, statut: 'arretee', enchaine: true, decodes: 0 };
const enRotation = () => { const r = getReglages(); return r.musiqueActive && r.musique === 'toutes' && r.musiqueEnchaine; };
function demande(): Morceau | null {
  const r = getReglages();
  if (!r.musiqueActive) return null;
  return r.musique === 'toutes' ? MORCEAUX[indexRotation % MORCEAUX.length] ?? null : MORCEAUX.find(m => m.id === r.musique) ?? null;
}
function adresse(m: Morceau): string {
  if (assetInfo(m.f)) return assetUrl(m.f);
  const temoin = MORCEAUX.find(x => assetInfo(x.f));
  if (!temoin) return '';
  const url = assetUrl(temoin.f);
  return url.includes(`${temoin.id}.mp3`) ? url.replace(`${temoin.id}.mp3`, `${m.id}.mp3`) : '';
}
const voulue = () => !!demande() && !!adresse(demande()!);
export function niveauMusique(): number {
  const r = getReglages();
  return r.muet || videoEnLecture() ? 0 : Math.max(0, Math.min(1, r.volumeMusique)) * NIVEAU_MUSIQUE;
}
function prevenir(): void {
  const r = getReglages(), m = demande(), c = contexteAudio();
  const statut: EtatMusique['statut'] = !m ? 'arretee' : erreur === m.id ? 'indisponible'
    : videoEnLecture() ? 'pause-video' : !c ? 'attend-geste' : document.hidden ? 'pause-onglet'
    : chargeId === m.id ? 'chargement' : voix ? 'lecture' : 'attend-geste';
  const x: EtatMusique = { morceau: voix?.id ?? m?.id ?? null, titre: m?.titre ?? '', joue: !!voix && c?.state === 'running' && !document.hidden && !videoEnLecture(),
    niveau: maitre?.gain.value ?? 0, cible: niveauMusique(), muet: r.muet, statut, enchaine: r.musiqueEnchaine, decodes: tampons.size };
  if (JSON.stringify(snapshot) === JSON.stringify(x)) return;
  snapshot = x; abonnes.forEach(f => f());
}
export const etatMusique = (): EtatMusique => snapshot;
export function useEtatMusique(): EtatMusique {
  return React.useSyncExternalStore(f => { abonnes.add(f); return () => abonnes.delete(f); }, etatMusique, etatMusique);
}
function voisin(id: string, direction = 1): Morceau | null {
  if (!MORCEAUX.length) return null;
  const i = MORCEAUX.findIndex(m => m.id === id);
  if (i < 0) return MORCEAUX[direction < 0 ? MORCEAUX.length - 1 : 0] ?? null;
  return MORCEAUX[(i + direction + MORCEAUX.length) % MORCEAUX.length] ?? null;
}
/** Les boutons suivant/précédent démarrent la musique, même si elle était en pause. */
export function changerMorceau(direction: -1 | 1): void {
  const r = getReglages();
  const courant = r.musique === 'toutes' ? MORCEAUX[indexRotation]?.id : r.musique;
  const m = voisin(courant ?? '', direction);
  if (!m) return;
  echecs.delete(m.id); erreur = null; reprise = null;
  if (r.musique === 'toutes') {
    indexRotation = MORCEAUX.findIndex(x => x.id === m.id);
    setReglages({ musiqueActive: true });
    suivre();
  } else setReglages({ musique: m.id, musiqueActive: true });
}
function elaguer(): void {
  const actuel = demande();
  const prochain = actuel && getReglages().musiqueEnchaine ? voisin(actuel.id) : null;
  for (const id of tampons.keys()) if (id !== actuel?.id && id !== prochain?.id && id !== voix?.id) tampons.delete(id);
  // Une ancienne voix en fondu possède déjà sa référence AudioBuffer : pas besoin de la garder dans la banque.
  while (tampons.size > 2) { const id = [...tampons.keys()].find(k => k !== actuel?.id && k !== prochain?.id); if (!id) break; tampons.delete(id); }
}
function decoder(m: Morceau, c: AudioContext): Promise<AudioBuffer | null> {
  if (tampons.has(m.id)) return Promise.resolve(tampons.get(m.id)!);
  if (echecs.has(m.id)) return Promise.resolve(null);
  let p = chargements.get(m.id);
  if (p) return p;
  p = (async () => {
    const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const url = adresse(m); if (!url) throw new Error('asset absent');
      const r = await fetch(url, { signal: abort.signal }); if (!r.ok) throw new Error('réseau');
      const octets = await r.arrayBuffer();
      const b = await new Promise<AudioBuffer>((resolve, reject) => {
        const delai = setTimeout(() => reject(new Error('décodage trop long')), 12000);
        try {
          const x = c.decodeAudioData(octets, b => { clearTimeout(delai); resolve(b); }, e => { clearTimeout(delai); reject(e); });
          x?.catch(e => { clearTimeout(delai); reject(e); });
        } catch (e) { clearTimeout(delai); reject(e); }
      });
      tampons.set(m.id, b); elaguer(); return b;
    } catch { echecs.add(m.id); return null; }
    finally { clearTimeout(timeout); chargements.delete(m.id); }
  })();
  chargements.set(m.id, p); return p;
}
function regler(duree = 0.2): void {
  const c = contexteAudio(); if (!c || !maitre) return;
  const g = maitre.gain, t = c.currentTime;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(niveauMusique(), t + duree);
}
function taire(v: Voix, c: AudioContext, duree: number): void {
  const t = c.currentTime; v.src.onended = () => { v.src.disconnect(); v.gain.disconnect(); };
  v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.linearRampToValueAtTime(0, t + duree);
  try { v.src.stop(t + duree + 0.02); } catch { /* déjà terminée */ }
}
function arreter(garder = true): void {
  const c = contexteAudio(); if (!voix || !c) return;
  if (garder) reprise = {
    id: voix.id, offset: Math.min(voix.duree, voix.offset + Math.max(0, c.currentTime - voix.debut)),
    rotation: voix.rotationEcoulee + Math.max(0, c.currentTime - voix.rotationDepuis),
  };
  else reprise = null;
  taire(voix, c, 0.25); voix = null;
}
function avancerAutomatiquement(): void {
  const r = getReglages();
  const actuel = demande();
  if (!actuel) return;
  const m = r.musiqueEnchaine ? voisin(actuel.id) : actuel;
  if (!m) return;
  reprise = null;
  if (r.musique === 'toutes') indexRotation = MORCEAUX.findIndex(x => x.id === m.id);
  if (m.id === actuel.id) {
    const c = contexteAudio(), b = tampons.get(m.id);
    if (c && b && c.state === 'running') lancer(m, c, b); else { voix = null; suivre(); }
  }
  else if (r.musique === 'toutes') suivre();
  else setReglages({ musique: m.id });
}
function lancer(m: Morceau, c: AudioContext, b: AudioBuffer): void {
  if (!maitre || maitreDe !== c) { maitre = c.createGain(); maitre.gain.value = niveauMusique(); maitre.connect(c.destination); maitreDe = c; }
  const precedente = voix, t = c.currentTime + 0.03;
  let offset = reprise?.id === m.id ? reprise.offset : 0;
  let rotationEcoulee = reprise?.id === m.id ? reprise.rotation : 0;
  if (offset >= b.duration - 0.1) { offset = 0; rotationEcoulee = 0; }
  reprise = null;
  if (precedente) taire(precedente, c, FONDU_CHANGEMENT);
  const src = c.createBufferSource(), gain = c.createGain(); src.buffer = b; src.loop = false;
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(1, t + (precedente ? FONDU_CHANGEMENT : FONDU_ENTREE));
  src.connect(gain); gain.connect(maitre); src.start(t, offset);
  const v: Voix = { id: m.id, src, gain, debut: t, offset, duree: b.duration, rotationEcoulee, rotationDepuis: t }; voix = v;
  src.onended = () => { src.disconnect(); gain.disconnect(); if (voix !== v) return; voix = null; if (demande()?.id !== v.id) suivre(); else avancerAutomatiquement(); };
  erreur = null; elaguer(); prevenir();
}
function suivre(): void {
  regler();
  const rotation = enRotation();
  if (rotation !== rotationDemandee) {
    rotationDemandee = rotation;
    if (rotation && voix) {
      const index = MORCEAUX.findIndex(m => m.id === voix?.id);
      if (index >= 0) indexRotation = index;
    }
    // Commencer l'extrait au changement de mode ; une pause vidéo ne change pas ce mode.
    if (voix) { voix.rotationEcoulee = 0; voix.rotationDepuis = contexteAudio()?.currentTime ?? voix.debut; }
    if (reprise) reprise.rotation = 0;
  }
  const m = demande(), c = contexteAudio();
  if (!m || videoEnLecture()) { arreter(); chargeId = null; prevenir(); return; }
  if (!c || c.state !== 'running' || document.hidden) { prevenir(); return; }
  if (voix?.id === m.id) { prevenir(); return; }
  if (echecs.has(m.id)) {
    erreur = m.id; chargeId = null;
    // Un fichier indisponible ne condamne pas toute la playlist. Aucun nouvel essai infini.
    if (getReglages().musiqueEnchaine) {
      let prochain = voisin(m.id);
      for (let i = 0; prochain && i < MORCEAUX.length; i++, prochain = voisin(prochain.id)) {
        if (!echecs.has(prochain.id)) {
          if (getReglages().musique === 'toutes') {
            indexRotation = MORCEAUX.findIndex(x => x.id === prochain!.id);
            suivre();
          } else setReglages({ musique: prochain.id });
          return;
        }
      }
    }
    arreter(false); prevenir(); return;
  }
  const b = tampons.get(m.id);
  if (b) { chargeId = null; lancer(m, c, b); return; }
  if (chargeId === m.id) return;
  chargeId = m.id; prevenir();
  void decoder(m, c).then(() => { if (chargeId === m.id) chargeId = null; suivre(); });
}
// L'horloge du contexte s'arrête dans un onglet caché ; aucune progression artificielle de playlist.
function verifierFin(): void {
  const c = contexteAudio(), v = voix, r = getReglages();
  if (!c || c.state !== 'running' || !v || document.hidden || videoEnLecture()) return;
  const reste = v.duree - v.offset - (c.currentTime - v.debut);
  const ecouteRotation = v.rotationEcoulee + Math.max(0, c.currentTime - v.rotationDepuis);
  const m = r.musiqueEnchaine ? voisin(v.id) : MORCEAUX.find(x => x.id === v.id);
  if (!m || echecs.has(m.id)) return;
  const delai = enRotation() ? Math.min(reste - FONDU_CHANGEMENT, DUREE_EXTRAIT_ROTATION - ecouteRotation) : reste - FONDU_CHANGEMENT;
  if (delai < 20) void decoder(m, c);
  if (delai <= 0 && tampons.has(m.id)) avancerAutomatiquement();
}
if (typeof window !== 'undefined') {
  besoinAudio(voulue); abonnerAudio(suivre); abonnerReglages(suivre);
  abonnerVideo(suivre); document.addEventListener('visibilitychange', () => { suivre(); prevenir(); });
  window.setInterval(verifierFin, 400); prevenir();
}
