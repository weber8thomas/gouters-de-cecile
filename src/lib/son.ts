// Sons du livre (plan v4, CONTRACT § 13.3) : pages, feuilletage, couverture, feuillet, photo, coin.
// Distincts du son des vidéos ; réglage « Sons du livre » (reglages.sonsLivre, null = automatique :
// coupés sur téléphone). Banque : design-system/baked/sons (scripts/bake-sons.mjs, sources CC0 dans
// design-system/sources/sons/licences.json).
//
// Moteur Web Audio, branché tout seul à l'import du module (rien à monter) :
//   - AudioContext créé au besoin (latencyHint « interactive »), seulement si les sons sont actifs ;
//   - déverrouillé au premier pointerup / touchend / click / keydown de confiance, écoutés en capture
//     sur window (avant l'application) : resume() + un tampon muet d'un échantillon, DANS le geste.
//     Un pointerdown tactile ne compte pas comme geste sur iOS : il n'est pas écouté ;
//   - navigator.audioSession.type = 'ambient' (Safari) : le mode silencieux d'iOS est respecté et la
//     musique de la personne continue ; reprise après « interrupted » (geste suivant) et au retour sur
//     l'onglet (suspendu quand l'onglet est caché) ;
//   - banque chargée paresseusement (octets dès que le navigateur est libre, décodage après le
//     déverrouillage), par assetUrl('sons/<fichier>') ;
//   - jouerSon() ne lève jamais d'erreur : son inconnu, fichier introuvable (404), contexte bloqué,
//     sons coupés → rien ;
//   - « muet » (bouton haut-parleur, reglages.muet) : rien de nouveau ne se joue, et le gain maître des
//     sons (maitreSons) va à 0, y compris pour un son déjà commencé. L'ambiance coupe son propre gain
//     maître (src/lib/ambiance.ts).
import banqueJson from '../../design-system/baked/sons/banque.json';
import { assetInfo, assetNames, assetUrl } from './assets';
import { abonnerReglages, getReglages, useReglages, type Reglages } from './reglages';

export type NomSon =
  | 'page'
  | 'riffle'
  | 'couverture-ouvrir'
  | 'couverture-poser'
  | 'couverture-fermer'
  | 'feuillet'
  | 'photo-lever'
  | 'photo-poser'
  | 'coin';

export const NOMS_SONS: readonly NomSon[] = [
  'page', 'riffle', 'couverture-ouvrir', 'couverture-poser', 'couverture-fermer', 'feuillet', 'photo-lever', 'photo-poser', 'coin',
];

export interface OptionsSon {
  /** Vitesse du geste, 0 (lent) à 1 (vif) : règle le débit et le gain. Défaut : 0,5. */
  vitesse?: number;
  /** Gain supplémentaire (multiplié par le volume des réglages). Défaut : 1. */
  gain?: number;
  /** Délai avant de jouer, en secondes. */
  delai?: number;
}

/** Une variante de la banque : fichier (sons/<f>), gain de mixage g, durée d (s), instant du choc a (s). */
export interface VarianteSon {
  f: string;
  g: number;
  d: number;
  a?: number;
}
export const BANQUE_SONS = (banqueJson as { sons: Partial<Record<NomSon, VarianteSon[]>> }).sons;

/** Un téléphone (écran tactile, petit côté < 600 px) : sons et ambiance coupés en réglage automatique. */
export function estTelephone(): boolean {
  if (typeof window === 'undefined' || typeof matchMedia === 'undefined') return false;
  return matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 600;
}

/** Sons du livre actifs pour ces réglages (automatique : coupés sur un téléphone). */
export function sonsLivreEffectif(r: Pick<Reglages, 'sonsLivre'>): boolean {
  if (r.sonsLivre !== null) return r.sonsLivre;
  return !estTelephone();
}

/** Sons du livre actifs (réglages + type d'écran), pour l'affichage. */
export function useSonsLivre(): boolean {
  const [r] = useReglages();
  return sonsLivreEffectif(r);
}

// ---- Adresses -------------------------------------------------------------------------------------
// Les MP3 sont des noms logiques d'assetUrl() dès que l'inventaire les liste (scripts/assets.mjs). En
// attendant, sur le banc d'essai (URL absolues « /…/design-system/baked/… »), on les cherche dans le
// même dossier que les images cuites ; ailleurs (site, artifact), pas de son plutôt qu'une 404.
let resolveur: ((fichier: string) => string) | null = null;
let baseCuite: string | null | undefined;

/** Remplace la résolution des adresses des sons (autre hébergement, tests). null : par défaut. */
export function setSonResolver(fn: ((fichier: string) => string) | null): void {
  resolveur = fn;
}

function trouverBase(): string | null {
  for (const n of assetNames()) {
    const u = assetInfo(n)?.u ?? '';
    const i = u.lastIndexOf(`baked/${n}.`);
    if (i > 0 && u.startsWith('/')) return u.slice(0, i + 'baked/'.length);
  }
  return null;
}

/** Adresse d'un fichier de la banque (« page-1 »), '' si elle n'est pas connue. */
export function urlSon(fichier: string): string {
  if (resolveur) return resolveur(fichier);
  const nom = `sons/${fichier}`;
  if (assetInfo(nom)) return assetUrl(nom);
  if (baseCuite === undefined) baseCuite = trouverBase();
  return baseCuite ? `${baseCuite}sons/${fichier}.mp3` : '';
}

// ---- Moteur -----------------------------------------------------------------------------------------
type Ctx = AudioContext;
type AudioSession = { type?: string };
const GESTES = ['pointerup', 'touchend', 'click', 'keydown'] as const;
const VOIX_MAX = 8;
/** Un son demandé pendant le décodage de sa banque : joué s'il arrive dans ce délai, oublié sinon. */
const RETARD_MAX = 0.3;
const PREMIER_DELAI_MS = 2500;

let ctx: Ctx | null = null;
/** Gain maître des sons du livre (vers la sortie) : 0 quand « muet ». */
let maitreSons: GainNode | null = null;
/** Autres besoins d'audio (l'ambiance, src/lib/ambiance.ts) : le contexte se déverrouille aussi pour eux. */
const besoins = new Set<() => boolean>();
const abonnesAudio = new Set<() => void>();
const abonnesVideo = new Set<() => void>();
/** Le premier déverrouillage du contexte (resume + tampon muet, même s'il se dit déjà « running »). */
let premierGeste = true;
let suspenduCache = false;
let voix = 0;
let videoEnCours = false;
const octets = new Map<string, Promise<ArrayBuffer | null>>();
const decodages = new Map<string, Promise<AudioBuffer | null>>();
const tampons = new Map<string, AudioBuffer | null>();
const derniere = new Map<NomSon, number>();

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function constructeur(): (new (o?: AudioContextOptions) => Ctx) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: new (o?: AudioContextOptions) => Ctx; webkitAudioContext?: new (o?: AudioContextOptions) => Ctx };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Sons demandés ET jouables ici (Web Audio présent, banque joignable). */
function actifs(): boolean {
  if (!sonsLivreEffectif(getReglages()) || !constructeur()) return false;
  const premier = BANQUE_SONS.page?.[0]?.f;
  return !!premier && !!urlSon(premier);
}

/** Le contexte audio sert à quelqu'un (sons du livre ou ambiance). */
function audioUtile(): boolean {
  if (!constructeur()) return false;
  if (actifs()) return true;
  for (const f of besoins) if (f()) return true;
  return false;
}

const prevenir = (abonnes: Set<() => void>) => abonnes.forEach((f) => { try { f(); } catch { /* rien */ } });

function contexte(): Ctx | null {
  if (ctx) return ctx;
  const C = constructeur();
  if (!C) return null;
  try {
    // Avant tout son : session « ambiante » (Safari 16.4+), qui respecte le bouton silence de l'iPhone.
    const session = (navigator as unknown as { audioSession?: AudioSession }).audioSession;
    if (session && 'type' in session) session.type = 'ambient';
  } catch { /* pas de session audio */ }
  try {
    ctx = new C({ latencyHint: 'interactive' });
  } catch {
    try { ctx = new C(); } catch { return null; }
  }
  const c = ctx;
  try {
    maitreSons = c.createGain();
    maitreSons.gain.value = getReglages().muet ? 0 : 1;
    maitreSons.connect(c.destination);
  } catch {
    maitreSons = null; // pas de gain maître : les sons vont directement à la sortie
  }
  c.onstatechange = () => {
    if (c.state === 'running') charger();
    prevenir(abonnesAudio);
  };
  prevenir(abonnesAudio);
  return c;
}

/**
 * Coupe ou rétablit tous les sons du livre (réglage « muet ») : gain maître posé à 0 ou à 1, d'un coup.
 * Pas de rampe ici : une rampe (ou une setTargetAtTime) sur ce gain ne prenait pas effet de façon fiable
 * dans les essais (horloge audio par paliers, deux réglages dans la même tick) ; le gain ne porte donc
 * aucune automatisation, et sa valeur suit le réglage à chaque fois.
 */
function appliquerMuet(): void {
  if (!maitreSons) return;
  try {
    maitreSons.gain.value = getReglages().muet ? 0 : 1;
  } catch { /* rien */ }
}

/** Tampon muet d'un échantillon : achève le déverrouillage sur iOS. */
function muet(c: Ctx): void {
  try {
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, c.sampleRate || 44100);
    s.connect(c.destination);
    s.start(0);
  } catch { /* rien */ }
}

/** Dans un geste de confiance : crée ou relance le contexte (resume + tampon muet). */
function deverrouiller(): void {
  if (!audioUtile() || (typeof document !== 'undefined' && document.hidden)) return;
  const c = contexte();
  if (!c) return;
  suspenduCache = false;
  if (premierGeste || c.state !== 'running') {
    premierGeste = false;
    try { c.resume().catch(() => undefined); } catch { /* rien */ }
    muet(c);
  }
  charger();
}

function surGeste(e: Event): void {
  if (!e.isTrusted) return;
  if (ctx && ctx.state === 'running' && !premierGeste) return;
  deverrouiller();
}

/** Octets d'un fichier (une seule requête ; 404 ou réseau coupé : null, sans nouvel essai). */
function telecharger(f: string): Promise<ArrayBuffer | null> {
  let p = octets.get(f);
  if (!p) {
    const url = urlSon(f);
    p = !url || typeof fetch === 'undefined'
      ? Promise.resolve(null)
      : fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    octets.set(f, p);
  }
  return p;
}

function decoder(f: string): Promise<AudioBuffer | null> {
  let p = decodages.get(f);
  if (p) return p;
  const c = contexte();
  if (!c) return Promise.resolve(null);
  p = telecharger(f).then((ab) => new Promise<AudioBuffer | null>((resolve) => {
    if (!ab) return resolve(null);
    try {
      // Forme à rappels (anciens Safari) ; la promesse rendue par les navigateurs récents est absorbée.
      const r = c.decodeAudioData(ab, (b) => resolve(b), () => resolve(null)) as unknown as Promise<AudioBuffer> | undefined;
      r?.catch?.(() => resolve(null));
    } catch {
      resolve(null);
    }
  })).then((b) => {
    tampons.set(f, b);
    return b;
  });
  decodages.set(f, p);
  return p;
}

let chargee = false;
/** Décode toute la banque (après le déverrouillage). */
function charger(): void {
  if (chargee || !ctx || !actifs()) return;
  chargee = true;
  // Les sons les plus fréquents d'abord.
  for (const nom of NOMS_SONS) for (const v of BANQUE_SONS[nom] ?? []) void decoder(v.f);
}

/** Octets seuls, quand le navigateur est libre (le décodage attend le premier geste). */
function precharger(): void {
  if (!actifs()) return;
  for (const nom of NOMS_SONS) for (const v of BANQUE_SONS[nom] ?? []) void telecharger(v.f);
}

/** Variante au hasard, jamais la même deux fois de suite ; les variantes déjà décodées d'abord. */
function choisir(nom: NomSon, n: number): number {
  const prec = derniere.get(nom);
  const toutes = Array.from({ length: n }, (_, i) => i).filter((i) => n === 1 || i !== prec);
  const pretes = toutes.filter((i) => tampons.get(BANQUE_SONS[nom]![i].f));
  const parmi = pretes.length ? pretes : toutes;
  const k = parmi[Math.floor(Math.random() * parmi.length)] ?? 0;
  derniere.set(nom, k);
  return k;
}

function demarrer(c: Ctx, b: AudioBuffer, debit: number, gain: number, delai: number): void {
  if (voix >= VOIX_MAX) return;
  const src = c.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = debit;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(maitreSons ?? c.destination);
  voix++;
  src.onended = () => {
    voix = Math.max(0, voix - 1);
    try { src.disconnect(); g.disconnect(); } catch { /* déjà débranché */ }
  };
  src.start(c.currentTime + Math.max(0, delai));
}

/** Le moteur par défaut : variante, débit et gain d'après la vitesse du geste, le volume et la vidéo. */
function moteur(nom: NomSon, o?: OptionsSon): void {
  const variantes = BANQUE_SONS[nom];
  if (!variantes?.length || !actifs() || getReglages().muet) return;
  const c = ctx;
  if (!c || c.state !== 'running') {
    precharger();
    return;
  }
  if (voix >= VOIX_MAX) return; // assez de feuilles qui bruissent déjà
  const v = clamp01(Number.isFinite(o?.vitesse) ? (o!.vitesse as number) : 0.5);
  const debit = (0.9 + 0.25 * v) * (1 + (Math.random() * 2 - 1) * 0.03);
  const r = getReglages();
  let gain = clamp01(r.volume) * (0.35 + 0.65 * v) * Math.max(0, Number.isFinite(o?.gain) ? (o!.gain as number) : 1);
  if (videoEnCours) gain *= 0.3;
  const k = choisir(nom, variantes.length);
  gain *= variantes[k].g;
  if (gain < 1e-4) return;
  const delai = Math.max(0, Number.isFinite(o?.delai) ? (o!.delai as number) : 0);
  const f = variantes[k].f;
  const b = tampons.get(f);
  if (b) return demarrer(c, b, debit, gain, delai);
  if (b === null) return; // introuvable ou illisible : silence
  const t0 = c.currentTime;
  void decoder(f).then((x) => {
    const retard = (ctx?.currentTime ?? t0) - t0;
    if (x && ctx === c && c.state === 'running' && retard < RETARD_MAX) demarrer(c, x, debit, gain, Math.max(0, delai - retard));
  });
}

// ---- Installation (à l'import, dans un navigateur) ---------------------------------------------
let installe = false;
function installer(): void {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  for (const t of GESTES) window.addEventListener(t, surGeste, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    const c = ctx;
    if (!c) return;
    if (document.hidden) {
      if (c.state === 'running') {
        suspenduCache = true;
        c.suspend().catch(() => undefined);
      }
    } else if (suspenduCache || (c.state as string) === 'interrupted') {
      suspenduCache = false;
      c.resume().catch(() => undefined); // sinon : au prochain geste
    }
  });
  abonnerReglages(appliquerMuet);
  // « Sons du livre » ou « Ambiance » activés dans le menu : le clic du menu est encore un geste.
  abonnerReglages(() => {
    if (!audioUtile()) return;
    const ua = (navigator as unknown as { userActivation?: { isActive: boolean } }).userActivation;
    if (ua?.isActive) deverrouiller();
    else precharger();
  });
  const plusTard = () => {
    const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(precharger, { timeout: 4000 });
    else setTimeout(precharger, 200);
  };
  if (document.readyState === 'complete') setTimeout(plusTard, PREMIER_DELAI_MS);
  else window.addEventListener('load', () => setTimeout(plusTard, PREMIER_DELAI_MS), { once: true });
}

// ---- API publique ---------------------------------------------------------------------------------
type Lecteur = (nom: NomSon, o?: OptionsSon) => void;
let lecteur: Lecteur = moteur;

/** Remplace le moteur (tests, autre lecteur). Renvoie la fonction qui remet le moteur par défaut. */
export function brancherSons(l: Lecteur): () => void {
  lecteur = l;
  return () => {
    if (lecteur === l) lecteur = moteur;
  };
}

/** Joue un son du livre (variante au hasard). Silencieux si coupé, non chargé ou indisponible. */
export function jouerSon(nom: NomSon, o?: OptionsSon): void {
  try {
    lecteur(nom, o);
  } catch {
    /* jamais d'erreur pour un son */
  }
}

/** Une vidéo joue (SoulevementProvider) : les sons du livre passent à 30 %, l'ambiance à 15 %. */
export function marquerVideo(enLecture: boolean): void {
  if (videoEnCours === enLecture) return;
  videoEnCours = enLecture;
  prevenir(abonnesVideo);
}

// ---- Pour l'ambiance (src/lib/ambiance.ts) --------------------------------------------------------
/** Le contexte audio s'il existe (jamais créé ici : seulement dans un geste). */
export const contexteAudio = (): AudioContext | null => ctx;
/** Une vidéo joue. */
export const videoEnLecture = (): boolean => videoEnCours;
/** Prévenu à la création du contexte et à chacun de ses changements d'état. */
export function abonnerAudio(f: () => void): () => void {
  abonnesAudio.add(f);
  return () => abonnesAudio.delete(f);
}
/** Prévenu quand une vidéo commence ou s'arrête. */
export function abonnerVideo(f: () => void): () => void {
  abonnesVideo.add(f);
  return () => abonnesVideo.delete(f);
}
/** Déclare un besoin d'audio : le premier geste déverrouille aussi pour lui. */
export function besoinAudio(f: () => boolean): () => void {
  besoins.add(f);
  return () => besoins.delete(f);
}
/** Décode un fichier de la banque (sons/<f>), une seule fois ; null s'il est introuvable. */
export const decoderSon = (f: string): Promise<AudioBuffer | null> => (ctx ? decoder(f) : Promise.resolve(null));
/** Télécharge les octets d'un fichier d'avance (décodé plus tard). */
export const prechargerSon = (f: string): void => { void telecharger(f); };

/** État du moteur, pour les tests et le débogage. */
export function etatSons(): {
  actifs: boolean; contexte: string; decodes: number; total: number; voix: number; video: boolean; muet: boolean; maitre: number | null;
} {
  let decodes = 0;
  tampons.forEach((b) => { if (b) decodes++; });
  const total = NOMS_SONS.reduce((s, n) => s + (BANQUE_SONS[n]?.length ?? 0), 0);
  return {
    actifs: actifs(), contexte: ctx ? ctx.state : 'aucun', decodes, total, voix, video: videoEnCours,
    muet: getReglages().muet, maitre: maitreSons ? maitreSons.gain.value : null,
  };
}

installer();
