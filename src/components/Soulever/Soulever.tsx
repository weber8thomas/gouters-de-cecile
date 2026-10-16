// Soulever : la photo d'une vidéo ou le feuillet volant se soulève de la page, grandit au-dessus du
// livre (FLIP sur une seule MotionValue, ressort SPRINGS.lift), puis redescend à sa place.
//
//   <Ecran>
//     <SoulevementProvider>      ← calque dessiné en portail dans useEcran().controles (px d'écran)
//       <Livre … />
//     </SoulevementProvider>
//   </Ecran>
//
// La vidéo unique (<video data-gc-video>) est toujours montée dans le calque : preparer(video) pose sa
// source à l'atterrissage d'un tourne-page, soulever({ type: 'photo' }) la lance DANS le geste.
import React from 'react';
import { createPortal } from 'react-dom';
import { useEcran } from '../Ecran/contexte';
import { PageCuite } from '../PageCuite';
import { LazyMotion, SPRINGS, animate, domMax, m, useMotionValue, useReducedMotion, useTransform } from '../../lib/motion';
import { getReglages } from '../../lib/reglages';
import { useClavierModal } from '../../lib/clavier';
import { AUCUNE_MARGE, type Insets } from '../../lib/viewport';
import { ActionsContext, EtatContext, type EtatSoulevement, type ObjetSoulevable, type SoulevementActions } from './contexte';
import { geometrieDe, urlMedia, type Fractions, type VideoInfo } from './media';
import { lisse, mesurerPose, placeBouton, poseCible, transformDe, versLocal, type Pose } from './geometrie';
import './Soulever.css';

export interface SoulevementProviderProps {
  children?: React.ReactNode;
}

type Vars = React.CSSProperties & Record<`--${string}`, string>;
type Arret = { stop: () => void };

/** Feuillet : avancée à partir de laquelle la feuille entière est opaque (et le coin caché dans la page). */
const SEUIL_FEUILLET = 0.2;
const POSE_NULLE: Pose = { cx: 0, cy: 0, w: 0, h: 0, angle: 0 };
const FONDU = { duration: 0.25, ease: 'linear' } as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const pc = (v: number) => `${+(v * 100).toFixed(4)}%`;

/** Deux images : ce qui vient d'être monté est rastérisé avant le mouvement. */
const deuxImages = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Décode les images d'un sous-arbre, au plus maxMs. */
function decoder(el: Element | null, maxMs: number): Promise<void> {
  const imgs = el ? Array.from(el.querySelectorAll('img')) : [];
  const taches = imgs.map((i) => (i.decode ? i.decode().catch(() => undefined) : Promise.resolve()));
  return Promise.race([Promise.all(taches).then(() => undefined), new Promise<void>((r) => setTimeout(r, maxMs))]);
}

const memeVideo = (a: VideoInfo, b: VideoInfo) => a.id === b.id && a.video === b.video && a.tirage === b.tirage && a.affiche === b.affiche;

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
/** Ce qui reste actif pendant qu'un objet est soulevé : le menu de réglages (src/components/Reglages). */
const RESTE_ACTIF = '[data-gc-reglages]';

// Croix tracée à la main (même encre que les contrôles de l'Ecran).
const CROIX = {
  trait: ['M11.6 11.2c5.4 5.6 11.1 11.5 16.9 17.6', 'M28.4 11.5c-5.8 5.5-11.5 11.3-16.8 17.4'],
  repasse: ['M12.9 12.1c4.9 5 9.9 10.3 15 15.6', 'M27.2 12.4c-5.1 4.9-10.1 10-14.9 15.3'],
};

function Croix() {
  return (
    <svg className="gc-soulever__croix" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <g className="gc-soulever__croix-ombre">{CROIX.trait.map((t) => <path key={t} d={t} />)}</g>
      <g className="gc-soulever__croix-encre">
        {CROIX.trait.map((t) => <path key={t} d={t} />)}
        {CROIX.repasse.map((t) => <path key={t} className="gc-soulever__croix-repasse" d={t} />)}
      </g>
    </svg>
  );
}

// Trait de crayon de l'avancement : tremblé, deux passages ; étiré sans grossir (non-scaling-stroke).
const TRAIT = 'M3 12.6C70 11.4 140 13.6 214 12.9S352 11.2 431 12.4 566 13.9 642 12.7 781 11.3 858 12.5 952 13.4 997 12.2';
const TRAIT_REPASSE = 'M6 13.4C88 12.6 170 14.1 251 13.3S409 12.1 497 13.2 650 14 731 13.1 870 12.4 994 13.1';

function Trait({ guide = false }: { guide?: boolean }) {
  return (
    <svg viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true" focusable="false" className={guide ? 'gc-soulever__trait-guide' : undefined}>
      <path d={TRAIT} />
      {!guide && <path className="gc-soulever__trait-repasse" d={TRAIT_REPASSE} />}
    </svg>
  );
}

/** Taille des cibles (même formule que --gc-ecran-cible). */
const tailleBouton = (vp: { w: number; h: number; tactile?: boolean }) => {
  const base = 56 * Math.min(vp.w / 1920, vp.h / 1080);
  return Math.max(vp.tactile ? 44 : 32, base);
};

export function SoulevementProvider({ children }: SoulevementProviderProps) {
  const ecran = useEcran();
  const vp = ecran?.vp ?? null;
  const reduit = !!useReducedMotion();

  const [phase, setPhase] = React.useState<EtatSoulevement>('ferme');
  const [objet, setObjet] = React.useState<ObjetSoulevable | null>(null);
  const [face, setFace] = React.useState<'recto' | 'verso'>('recto');
  const [videoCarte, setVideoCarte] = React.useState<VideoInfo | null>(null);
  const [cible, setCible] = React.useState<{ T: Pose; bouton: { x: number; y: number } } | null>(null);
  const [videoEl, setVideoEl] = React.useState<HTMLVideoElement | null>(null);

  const phaseRef = React.useRef<EtatSoulevement>('ferme');
  const objetRef = React.useRef<ObjetSoulevable | null>(null);
  const faceRef = React.useRef<'recto' | 'verso'>('recto');
  const geoRef = React.useRef<{ S: Pose; T: Pose; fondu: boolean }>({ S: POSE_NULLE, T: POSE_NULLE, fondu: false });
  const calqueRef = React.useRef<HTMLDivElement>(null);
  const cartePhotoRef = React.useRef<HTMLDivElement>(null);
  const carteFeuilletRef = React.useRef<HTMLDivElement>(null);
  const retourneRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const boutonRef = React.useRef<HTMLButtonElement>(null);
  const animRef = React.useRef<Arret | null>(null);
  /** Jeton de l'animation du vol en cours (une animation remplacée ne termine rien). */
  const jetonAnim = React.useRef<object | null>(null);
  const seqRef = React.useRef(0);
  const sourceCachee = React.useRef<HTMLElement | null>(null);
  const attenteCache = React.useRef(false);
  const focusAvant = React.useRef<Element | null>(null);
  const appui = React.useRef<{ x: number; y: number } | null>(null);
  const appuiClavier = React.useRef(false);
  const sansSon = React.useRef(false);
  const reduitRef = React.useRef(reduit);
  reduitRef.current = reduit;
  const vpRef = React.useRef(vp);
  vpRef.current = vp;

  // ---- Une seule MotionValue pour le vol : p (0 = posé dans la page, 1 = soulevé) ---------------
  const p = useMotionValue(0);
  /** 0 : la carte est montée à sa pose d'arrivée, presque invisible (rastérisée à pleine taille). 1 : en jeu. */
  const pret = useMotionValue(0);
  /** La vidéo est visible (événement « playing »). */
  const vu = useMotionValue(0);
  /** Avancement de la lecture, 0 à 1 (lu à chaque image, sans rendu React). */
  const avance = useMotionValue(0);
  /** Feuillet : 0 recto, 1 verso. */
  const tourne = useMotionValue(0);

  const opaciteCarte = (v: number, r: number) => {
    if (r < 0.5) return 0.002;
    const o = objetRef.current;
    if (reduitRef.current || geoRef.current.fondu) return clamp01(v);
    if (o?.type === 'feuillet' && o.fenetre) return lisse(0, SEUIL_FEUILLET, v);
    return 1;
  };
  const carteT = useTransform(p, (v) => (reduitRef.current ? 'none' : transformDe(geoRef.current.S, geoRef.current.T, v)));
  const carteO = useTransform([p, pret], ([v, r]: number[]) => opaciteCarte(v, r));
  // L'ombre portée s'efface quand la feuille passe par la tranche (retournement) : elle ne laisse
  // jamais le contour d'une feuille qui n'est plus là.
  const ombreO = useTransform([p, pret, tourne], ([v, r, f]: number[]) =>
    (r < 0.5 ? 0.002 : Math.max(0.002, lisse(0.04, 0.85, v) * opaciteCarte(v, r) * Math.max(0, 1 - 1.6 * Math.sin(Math.PI * clamp01(f))))));
  const voileO = useTransform([p, pret], ([v, r]: number[]) => (r < 0.5 ? 0.002 : clamp01(v)));
  const couleur = useTransform(p, (v) => lisse(0.28, 0.88, v));
  const videoO = useTransform([vu, couleur], ([a, b]: number[]) => a * b);
  const traitFenetre = useTransform(avance, (t) => `translateX(${((clamp01(t) - 1) * 100).toFixed(3)}%)`);
  const traitEncre = useTransform(avance, (t) => `translateX(${((1 - clamp01(t)) * 100).toFixed(3)}%)`);
  const tourneT = useTransform(tourne, (f) => (reduitRef.current ? 'none' : `rotateY(${(-180 * f).toFixed(3)}deg)`));
  const rectoO = useTransform(tourne, (f) => (reduitRef.current ? clamp01(1 - f) : 1));
  const versoO = useTransform(tourne, (f) => (reduitRef.current ? clamp01(f) : 1));

  const changerPhase = React.useCallback((ph: EtatSoulevement) => {
    phaseRef.current = ph;
    setPhase(ph);
  }, []);

  // ---- L'objet dans la page : masqué pendant qu'il est soulevé ---------------------------------
  // Cacher : à l'image suivante (jamais avant que la carte soit peinte) ; montrer : tout de suite
  // (jamais après que la carte a disparu). Au pire, une image où les deux se superposent exactement.
  const montrerSource = React.useCallback(() => {
    const s = sourceCachee.current;
    if (s) s.removeAttribute('data-gc-souleve');
    sourceCachee.current = null;
  }, []);
  const doitCacher = React.useCallback(() => {
    const o = objetRef.current;
    if (!o || phaseRef.current === 'ferme' || pret.get() < 0.5) return false;
    if (o.type === 'photo' || reduitRef.current || geoRef.current.fondu || !o.fenetre) return true;
    return p.get() >= SEUIL_FEUILLET;
  }, [p, pret]);
  const majSource = React.useCallback(() => {
    const cacher = doitCacher();
    if (!cacher) {
      if (sourceCachee.current) montrerSource();
      return;
    }
    if (sourceCachee.current || attenteCache.current) return;
    attenteCache.current = true;
    requestAnimationFrame(() => {
      attenteCache.current = false;
      const o = objetRef.current;
      if (!o || sourceCachee.current || !doitCacher()) return;
      o.source.setAttribute('data-gc-souleve', '');
      sourceCachee.current = o.source;
    });
  }, [doitCacher, montrerSource]);
  React.useEffect(() => {
    const a = p.on('change', majSource);
    const b = pret.on('change', majSource);
    return () => { a(); b(); };
  }, [p, pret, majSource]);

  // ---- Vidéo unique ------------------------------------------------------------------------
  /** Dernière vidéo préparée : appliquée aussi quand l'élément arrive après coup (portail monté tard). */
  const attenteRef = React.useRef<VideoInfo | null>(null);
  const brancherVideo = React.useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
    const info = attenteRef.current;
    const url = info ? urlMedia(info.video) : null;
    if (el && url && el.getAttribute('src') !== url) el.setAttribute('src', url); // preload="auto"
  }, []);

  /** Synchrone : à appeler dans le geste, avant tout rendu ou attente. */
  const lancerVideo = React.useCallback((info: VideoInfo, depuisDebut: boolean) => {
    const el = videoRef.current;
    if (!el) return;
    const url = urlMedia(info.video);
    if (url && el.getAttribute('src') !== url) el.setAttribute('src', url);
    const r = getReglages();
    try {
      el.muted = !r.son;
      el.volume = clamp01(r.volume);
    } catch { /* volume en lecture seule (iOS) */ }
    sansSon.current = false;
    if (depuisDebut) {
      try { el.currentTime = 0; } catch { /* pas encore de métadonnées */ }
    }
    let promesse: Promise<void> | undefined;
    try { promesse = el.play(); } catch { promesse = undefined; }
    promesse?.catch((err: unknown) => {
      // Geste non reconnu (lecture automatique) : on relance sans le son ; un toucher le rendra.
      if ((err as { name?: string } | null)?.name === 'NotAllowedError' && !el.muted && objetRef.current?.type === 'photo') {
        el.muted = true;
        sansSon.current = true;
        el.play().catch(() => undefined);
      }
    });
  }, []);

  // ---- Fin du vol --------------------------------------------------------------------------
  const finir = React.useCallback(() => {
    montrerSource();
    jetonAnim.current = null;
    animRef.current?.stop();
    animRef.current = null;
    pret.set(0);
    vu.set(0);
    avance.set(0);
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
    objetRef.current = null;
    geoRef.current = { ...geoRef.current, fondu: false };
    changerPhase('ferme');
    setObjet(null);
  }, [montrerSource, pret, vu, avance, changerPhase]);

  const lancer = React.useCallback((but: 0 | 1) => {
    animRef.current?.stop();
    const jeton = {};
    jetonAnim.current = jeton;
    const fin = () => {
      if (jetonAnim.current !== jeton) return;
      jetonAnim.current = null;
      animRef.current = null;
      if (but === 1) changerPhase('ouvert');
      else finir();
    };
    const a: Arret = reduitRef.current
      ? animate(p, but, { ...FONDU, onComplete: fin })
      : animate(p, but, { ...SPRINGS.lift, restDelta: 0.0005, restSpeed: 0.01, onComplete: fin });
    if (jetonAnim.current === jeton) animRef.current = a;
  }, [p, changerPhase, finir]);

  const fermerTout = React.useCallback(() => {
    if (phaseRef.current === 'ferme') return;
    seqRef.current++;
    animRef.current?.stop();
    animRef.current = null;
    p.set(0);
    finir();
  }, [p, finir]);

  // ---- Actions -----------------------------------------------------------------------------
  const soulever = React.useCallback((o: ObjetSoulevable): boolean => {
    const ph = phaseRef.current;
    const cur = objetRef.current;
    if (ph !== 'ferme') {
      if (!cur || cur.source !== o.source) return false;
      // Le même objet : nouveau geste (relance la lecture si elle n'a pas pris), ou on le rattrape.
      if (o.type === 'photo') {
        const v = videoRef.current;
        if (v && (v.paused || v.ended)) lancerVideo(o.video, ph === 'retour' || v.ended);
      }
      if (ph === 'retour') {
        changerPhase('envol');
        lancer(1);
      }
      return true;
    }
    // Dans le geste, avant tout rendu : son, volume, début, play().
    if (o.type === 'photo') lancerVideo(o.video, true);
    const calque = calqueRef.current;
    if (!calque || !o.source.isConnected) {
      if (o.type === 'photo') videoRef.current?.pause();
      return false;
    }
    const v0 = vpRef.current ?? { w: window.innerWidth, h: window.innerHeight, insets: AUCUNE_MARGE as Insets, tactile: false };
    const S = versLocal(mesurerPose(o.source, o.angle), calque);
    const T = poseCible(v0, S.w / (S.h || 1));
    geoRef.current = { S, T, fondu: false };
    objetRef.current = o;
    seqRef.current++;
    animRef.current?.stop();
    animRef.current = null;
    // Préparation : la carte est montée à sa pose d'arrivée (rastérisée à pleine taille), presque
    // invisible ; le vol part deux images plus tard, depuis la pose de départ.
    p.set(1);
    pret.set(0);
    vu.set(0);
    avance.set(0);
    tourne.set(0);
    faceRef.current = 'recto';
    focusAvant.current = typeof document !== 'undefined' ? document.activeElement : null;
    appui.current = null;
    appuiClavier.current = false;
    setCible({ T, bouton: placeBouton(T, v0, tailleBouton(v0)) });
    setFace('recto');
    if (o.type === 'photo') setVideoCarte((v) => (v && memeVideo(v, o.video) ? v : o.video));
    setObjet(o);
    changerPhase('envol');
    return true;
  }, [lancerVideo, changerPhase, lancer, p, pret, vu, avance, tourne]);

  const reposer = React.useCallback(() => {
    const ph = phaseRef.current;
    const o = objetRef.current;
    if (ph === 'ferme' || ph === 'retour' || !o) return;
    if (o.type === 'photo') {
      videoRef.current?.pause();
      animate(vu, 0, { duration: 0.2, ease: 'easeOut' });
    }
    if (pret.get() < 0.5) {
      // Pas encore parti : rien n'a bougé.
      seqRef.current++;
      finir();
      return;
    }
    const calque = calqueRef.current;
    if (calque && o.source.isConnected) {
      geoRef.current = { ...geoRef.current, S: versLocal(mesurerPose(o.source, o.angle), calque), fondu: false };
    } else {
      // L'objet a quitté la page : fondu sur place.
      geoRef.current = { ...geoRef.current, S: { ...geoRef.current.T }, fondu: true };
    }
    changerPhase('retour');
    lancer(0);
  }, [vu, pret, finir, changerPhase, lancer]);

  const preparer = React.useCallback((info: VideoInfo | null) => {
    attenteRef.current = info;
    const el = videoRef.current;
    const occupe = phaseRef.current !== 'ferme' && objetRef.current?.type === 'photo';
    if (occupe) return; // jamais pendant que la photo est soulevée
    if (!info) {
      if (el && el.hasAttribute('src')) {
        el.removeAttribute('src');
        try { el.load(); } catch { /* rien */ }
      }
      setVideoCarte(null);
      return;
    }
    const url = urlMedia(info.video);
    if (el && url && el.getAttribute('src') !== url) el.setAttribute('src', url); // preload="auto"
    setVideoCarte((v) => (v && memeVideo(v, info) ? v : info));
    // Les images du tirage soulevé, décodées d'avance.
    for (const nom of [info.tirage, info.affiche]) {
      const u = urlMedia(nom);
      if (!u || typeof Image === 'undefined') continue;
      const i = new Image();
      i.src = u;
      i.decode?.().catch(() => undefined);
    }
  }, []);

  const retourner = React.useCallback((voulue?: 'recto' | 'verso') => {
    const o = objetRef.current;
    const ph = phaseRef.current;
    if (!o || o.type !== 'feuillet' || !o.verso || ph === 'ferme' || ph === 'retour') return;
    const f = voulue ?? (faceRef.current === 'recto' ? 'verso' : 'recto');
    if (f === faceRef.current) return;
    faceRef.current = f;
    setFace(f);
    const el = retourneRef.current;
    if (el && !reduitRef.current) el.style.willChange = 'transform';
    const fin = () => { if (el) el.style.willChange = ''; };
    animate(tourne, f === 'verso' ? 1 : 0, reduitRef.current ? { ...FONDU, onComplete: fin } : { ...SPRINGS.lift, onComplete: fin });
  }, [tourne]);

  const reposerRef = React.useRef(reposer);
  reposerRef.current = reposer;

  // ---- Départ du vol, deux images après le montage de la carte ------------------------------
  React.useEffect(() => {
    if (phase !== 'envol' || pret.get() > 0.5) return undefined;
    const id = seqRef.current;
    let annule = false;
    // Ce qui se voit au départ : le tirage (photo), le recto (feuillet). Le verso se décode pendant le vol.
    const carte = objet?.type === 'feuillet' ? carteFeuilletRef.current?.querySelector('.gc-soulever__face--recto') ?? null : cartePhotoRef.current;
    void (async () => {
      await deuxImages();
      await decoder(carte, 250);
      if (annule || seqRef.current !== id || phaseRef.current !== 'envol') return;
      p.set(0);
      pret.set(1);
      // Une image entière à la pose de départ (exactement sur l'objet posé), puis le ressort.
      requestAnimationFrame(() => {
        if (!annule && seqRef.current === id && phaseRef.current === 'envol') lancer(1);
      });
    })();
    return () => { annule = true; };
  }, [phase, objet, p, pret, lancer]);

  // ---- Vidéo : visible à « playing », avancement lu à chaque image, fin = on repose ---------
  React.useEffect(() => {
    const el = videoEl;
    if (!el) return undefined;
    el.setAttribute('webkit-playsinline', '');
    el.setAttribute('disablepictureinpicture', '');
    el.setAttribute('disableremoteplayback', '');
    let raf = 0;
    const carte = () => cartePhotoRef.current;
    const lire = () => {
      const d = el.duration;
      avance.set(d > 0 && Number.isFinite(d) ? el.currentTime / d : 0);
    };
    const tick = () => {
      lire();
      raf = requestAnimationFrame(tick);
    };
    const onPlaying = () => {
      const ph = phaseRef.current;
      if (ph === 'ferme' || ph === 'retour' || objetRef.current?.type !== 'photo') return;
      animate(vu, 1, { ...SPRINGS.settle });
      carte()?.setAttribute('data-gc-lecture', '');
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onStop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      carte()?.removeAttribute('data-gc-lecture');
    };
    const onEnded = () => {
      onStop();
      avance.set(1);
      if (objetRef.current?.type === 'photo') reposerRef.current();
    };
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onStop);
    el.addEventListener('emptied', onStop);
    el.addEventListener('ended', onEnded);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onStop);
      el.removeEventListener('emptied', onStop);
      el.removeEventListener('ended', onEnded);
    };
  }, [videoEl, avance, vu]);

  // ---- Ouvert : le livre devient inert, le focus va au bouton, et revient à l'objet ensuite --
  const ouvert = phase !== 'ferme';
  React.useEffect(() => {
    const calque = calqueRef.current;
    if (!calque) return undefined;
    calque.inert = !ouvert;
    if (!ouvert) return undefined;
    const o = objetRef.current;
    const conteneur = calque.parentElement;
    const racine = ecran?.controles?.parentElement ?? null;
    const poses: Element[] = [];
    const freres = (parent: Element | null) => (parent ? Array.from(parent.children).filter((c) => c !== calque && !c.contains(calque)) : []);
    for (const el of [...freres(racine), ...freres(conteneur)]) {
      // Le menu de réglages reste utilisable : il s'ouvre par-dessus l'objet soulevé.
      if (el.hasAttribute('inert') || el.matches(RESTE_ACTIF) || el.querySelector(RESTE_ACTIF)) continue;
      el.setAttribute('inert', '');
      poses.push(el);
    }
    racine?.setAttribute('data-gc-souleve', '');
    boutonRef.current?.focus({ preventScroll: true });
    return () => {
      for (const el of poses) el.removeAttribute('inert');
      racine?.removeAttribute('data-gc-souleve');
      const actif = document.activeElement;
      if (actif && actif !== document.body && !calque.contains(actif)) return;
      const candidats: (Element | null | undefined)[] = [o?.source, o?.source.closest('[tabindex]'), o?.type === 'feuillet' ? o.fenetre : null, focusAvant.current];
      const retour = candidats.find((c): c is HTMLElement => !!c && c instanceof HTMLElement && c.isConnected && c.matches(FOCUSABLE));
      retour?.focus({ preventScroll: true });
    };
  }, [ouvert, ecran?.controles]);

  // ---- Fermetures : URL, orientation, taille de l'écran -------------------------------------
  React.useEffect(() => {
    if (!ouvert) return undefined;
    const onHash = () => reposerRef.current();
    const onOrientation = () => fermerTout();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('orientationchange', onOrientation);
    const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
    so?.addEventListener?.('change', onOrientation);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('orientationchange', onOrientation);
      so?.removeEventListener?.('change', onOrientation);
    };
  }, [ouvert, fermerTout]);
  const cleVp = vp ? `${vp.w}x${vp.h}:${vp.cadrage}` : '';
  const cleVpAvant = React.useRef(cleVp);
  React.useEffect(() => {
    if (cleVpAvant.current === cleVp) return;
    cleVpAvant.current = cleVp;
    fermerTout();
  }, [cleVp, fermerTout]);

  // Démontage : rien ne reste caché dans la page.
  React.useEffect(() => () => {
    seqRef.current++;
    animRef.current?.stop();
    montrerSource();
    videoRef.current?.pause();
  }, [montrerSource]);

  // ---- Clavier modal ------------------------------------------------------------------------
  useClavierModal(ouvert, (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const o = objetRef.current;
    switch (e.key) {
      case 'Escape':
      case 'Backspace':
      case 'ArrowDown':
        reposer();
        return true;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (o?.type === 'feuillet') retourner(e.key === 'ArrowRight' ? 'verso' : 'recto');
        return true;
      case 'ArrowUp':
      case 'PageUp':
      case 'PageDown':
      case 'Home':
      case 'End':
        return true;
      case 'Tab':
        boutonRef.current?.focus({ preventScroll: true });
        return true;
      case 'm':
      case 'M':
      case ',': {
        // Le menu s'ouvre par-dessus l'objet soulevé (son clavier modal passe alors devant le nôtre).
        const reglages = (calqueRef.current?.parentElement ?? document).querySelector<HTMLElement>('[data-gc-reglages="bouton"]');
        reglages?.click();
        return true;
      }
      case 'Enter':
      case ' ':
        if (e.repeat) return true;
        if (document.activeElement === boutonRef.current) {
          appuiClavier.current = true;
          return false; // le bouton s'en charge (clic)
        }
        if (o?.type === 'feuillet' && o.verso) retourner();
        else reposer();
        return true;
      default:
        return false;
    }
  });

  // ---- Toucher --------------------------------------------------------------------------
  // Un toucher ne compte que s'il a commencé sur le calque ouvert (le clic qui suit le toucher qui a
  // soulevé l'objet ne le repose pas).
  const onAppui = (e: React.PointerEvent) => {
    if (phaseRef.current === 'ferme') return;
    appui.current = e.isPrimary ? { x: e.clientX, y: e.clientY } : appui.current;
  };
  const appuiValide = (e: React.MouseEvent) => {
    const a = appui.current;
    appui.current = null;
    return !!a && Math.hypot(e.clientX - a.x, e.clientY - a.y) < 14;
  };
  const toucherVoile = (e: React.MouseEvent) => {
    if (!appuiValide(e)) return;
    reposer();
  };
  const toucherPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!appuiValide(e)) return;
    const v = videoRef.current;
    if (v && sansSon.current && getReglages().son) {
      v.muted = false; // lecture partie sans le son : ce toucher le rend
      sansSon.current = false;
      return;
    }
    reposer();
  };
  const toucherFeuillet = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!appuiValide(e)) return;
    const o = objetRef.current;
    if (o?.type === 'feuillet' && o.verso) retourner();
    else reposer();
  };
  const toucherBouton = (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = e.detail === 0 ? appuiClavier.current : appuiValide(e);
    appuiClavier.current = false;
    if (ok) reposer();
  };

  // ---- Contexte -------------------------------------------------------------------------
  const actions = React.useMemo<SoulevementActions>(
    () => ({ soulever, reposer, preparer, retourner, video: () => videoRef.current }),
    [soulever, reposer, preparer, retourner],
  );
  const etat = React.useMemo(() => ({ etat: phase, objet, face }), [phase, objet, face]);

  // ---- Calque ---------------------------------------------------------------------------
  const T = cible?.T ?? POSE_NULLE;
  const boite: Vars = {
    left: `${T.cx - T.w / 2}px`,
    top: `${T.cy - T.h / 2}px`,
    width: `${T.w}px`,
    height: `${T.h}px`,
    '--gc-sl-w': `${T.w}px`,
    '--gc-sl-h': `${T.h}px`,
  };
  const enVol = phase === 'envol' || phase === 'retour';
  const wc = enVol && !reduit ? 'transform, opacity' : enVol ? 'opacity' : undefined;
  // Géométrie du tirage, rapportée au papier (la carte) : image (débord de la marge transparente
  // compris), zone de la photo, cadre vidéo dans cette zone.
  const geoT = videoCarte ? geometrieDe(videoCarte) : null;
  const [cx, cy, cw, ch] = geoT?.photo ?? [0, 0, 1, 1];
  const basImage = cy + ch;
  const marge = 1 - basImage;
  const place = (r: Fractions | undefined): React.CSSProperties => (r ? { left: pc(r[0]), top: pc(r[1]), width: pc(r[2]), height: pc(r[3]) } : {});
  const photo = objet?.type === 'photo';
  const feuillet = objet?.type === 'feuillet' ? objet : null;
  const libelle = photo && objet?.type === 'photo' ? `Vidéo : ${objet.video.titre}` : feuillet ? `Feuillet volant, ${face}` : undefined;
  const conteneur = ecran?.controles ?? (typeof document !== 'undefined' ? document.body : null);

  const calque = (
    <LazyMotion features={domMax}>
      <div
        ref={calqueRef}
        className={`gc-soulever${ecran?.controles ? '' : ' gc-soulever--fenetre'}`}
        data-gc-soulever={ouvert ? 'ouvert' : 'ferme'}
        data-gc-phase={phase}
        data-gc-type={objet?.type}
        data-gc-reduit={reduit ? '' : undefined}
        role={ouvert ? 'dialog' : undefined}
        aria-modal={ouvert ? true : undefined}
        aria-label={libelle}
        aria-hidden={ouvert ? undefined : true}
        onPointerDownCapture={onAppui}
      >
        <m.div className="gc-soulever__voile" style={{ opacity: voileO, willChange: enVol ? 'opacity' : undefined }} onClick={toucherVoile} />
        <m.div className="gc-soulever__ombre" style={{ ...boite, transform: carteT, opacity: ombreO, willChange: wc }} aria-hidden="true" />
        <m.div
          ref={cartePhotoRef}
          className="gc-soulever__carte gc-soulever__carte--photo"
          data-gc-actif={photo ? '' : undefined}
          data-gc-ombre-cuite={geoT?.ombreCuite ? '' : undefined}
          style={{ ...boite, transform: carteT, opacity: carteO, willChange: photo ? wc : undefined }}
          onClick={toucherPhoto}
        >
          <img className="gc-soulever__tirage" src={urlMedia(videoCarte?.tirage) || undefined} alt="" draggable={false} style={place(geoT?.image)} />
          <div className="gc-soulever__image" style={{ left: pc(cx), top: pc(cy), width: pc(cw), height: pc(ch) }}>
            <m.img className="gc-soulever__affiche" src={urlMedia(videoCarte?.affiche) || undefined} alt="" draggable={false} style={{ ...place(geoT?.video), opacity: couleur }} />
            <m.video
              ref={brancherVideo}
              className="gc-soulever__video"
              data-gc-video=""
              playsInline
              preload="auto"
              style={{ ...place(geoT?.video), opacity: videoO }}
            />
          </div>
          <div className="gc-soulever__trait" style={{ left: pc(cx + 0.02), width: pc(cw - 0.04), top: pc(basImage + marge * 0.36), height: pc(marge * 0.26) }} aria-hidden="true">
            <Trait guide />
            <m.div className="gc-soulever__trait-fenetre" style={{ transform: traitFenetre }}>
              <m.div className="gc-soulever__trait-encre" style={{ transform: traitEncre }}>
                <Trait />
              </m.div>
            </m.div>
          </div>
        </m.div>
        {feuillet && (
          <m.div
            ref={carteFeuilletRef}
            className="gc-soulever__carte gc-soulever__carte--feuillet"
            data-gc-face={face}
            style={{ ...boite, transform: carteT, opacity: carteO, willChange: wc }}
            onClick={toucherFeuillet}
          >
            <m.div ref={retourneRef} className="gc-soulever__retourne" style={{ transform: tourneT }}>
              <m.div className="gc-soulever__face gc-soulever__face--recto" style={{ opacity: rectoO }} aria-hidden={face === 'recto' ? undefined : true}>
                <PageCuite page={feuillet.recto} />
              </m.div>
              {feuillet.verso && (
                <m.div className="gc-soulever__face gc-soulever__face--verso" style={{ opacity: versoO }} aria-hidden={face === 'verso' ? undefined : true}>
                  <PageCuite page={feuillet.verso} />
                </m.div>
              )}
            </m.div>
          </m.div>
        )}
        {ouvert && cible && (
          <button
            ref={boutonRef}
            type="button"
            className="gc-soulever__fermer"
            data-gc-soulever-fermer=""
            aria-label="Fermer"
            style={{ left: `${cible.bouton.x}px`, top: `${cible.bouton.y}px` }}
            onClick={toucherBouton}
          >
            <Croix />
          </button>
        )}
      </div>
    </LazyMotion>
  );

  return (
    <ActionsContext.Provider value={actions}>
      <EtatContext.Provider value={etat}>
        {children}
        {conteneur ? createPortal(calque, conteneur) : null}
      </EtatContext.Provider>
    </ActionsContext.Provider>
  );
}

export default SoulevementProvider;
