// La vidéo d'un invité, posée dans la page comme une photo collée (CONTRACT § 12) : un tirage sépia à
// bord blanc, un peu de travers, tenu par des coins photo ou du scotch jauni, avec un ▶ discret à
// l'encre sur sa marge. Rien que des <img>, identiques en mode vivant et statique.
//
// Elle se soulève (SoulevementProvider) au toucher — événement « gc-livre-toucher » du Livre, émis
// DANS le geste —, à Entrée quand elle a le focus (mode vivant), ou sur demande (souleverObjet).
//
// Indice sans texte (src/lib/indices.ts) : tant qu'on ne l'a ni touchée ni soulevée, elle « respire »
// de temps en temps (enveloppeur interne : échelle 1 → 1,025 → 1, calque d'ombre statique qui
// s'opacifie, ▶ qui passe de 0,72 à 1 et grandit de 12 %). Un animate ponctuel, transform et opacity
// seulement, will-change le temps de la pulsation.
import React from 'react';
import { animate } from '../../lib/motion';
import { indiceUtilise, useIndice, type Pulsation } from '../../lib/indices';
import { useRenderMode } from '../../lib/spread';
import { useSoulevementActions, EVENEMENT_SOULEVER } from '../Soulever/contexte';
import { angleDe, geometrieDe, jeton, urlMedia, type VideoInfo } from '../Soulever/media';
import './PhotoCollee.css';

export interface PhotoColleeProps {
  video: VideoInfo;
  /** Graine de l'inclinaison (si la vidéo n'a pas d'angle). */
  graine?: number;
  /**
   * Remplace le soulèvement par défaut (soulever({ type: 'photo', video, source })) ; appelé dans le
   * geste, avec l'élément posé.
   */
  onSoulever?: (source: HTMLElement) => void;
}

/** Événement du Livre : toucher (ou clic) d'une page sans glisser (src/components/Livre/evenements.ts). */
const TOUCHER_LIVRE = 'gc-livre-toucher';

type Vars = React.CSSProperties & Record<`--${string}`, string>;
const pc = (v: number) => `${+(v * 100).toFixed(4)}%`;

// ▶ tracé à la plume : deux passages qui ne se recouvrent pas tout à fait, une pointe de lavis.
const LIRE = [
  'M13.1 9.6c.5 6.9.4 13.8-.4 20.9 5.9-3.1 11.8-6.4 17.6-10-5.6-3.8-11.3-7.4-17.2-10.9z',
  'M14.3 11.2c.2 5.8.1 11.6-.5 17.6',
];
const imagesLire = new Map<string, string>();
function imageLire(): string {
  const encre = jeton('--gc-ink');
  if (!encre) return '';
  const deja = imagesLire.get(encre);
  if (deja) return deja;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${encre}" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${LIRE[0]}" fill="${encre}" fill-opacity="0.12" stroke-width="2.8"/>` +
    `<path d="${LIRE[1]}" stroke-width="1.3" stroke-opacity="0.55"/></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  imagesLire.set(encre, url);
  return url;
}

export function PhotoCollee({ video, graine = 1, onSoulever }: PhotoColleeProps) {
  const mode = useRenderMode();
  const vivant = mode === 'live';
  const actions = useSoulevementActions();
  const ref = React.useRef<HTMLDivElement>(null);
  const souffleRef = React.useRef<HTMLDivElement>(null);
  const ombreRef = React.useRef<HTMLDivElement>(null);
  const lireRef = React.useRef<HTMLImageElement>(null);
  const objet = `photo:${video.id}`;

  const angle = angleDe(video.angle, graine);
  const geo = geometrieDe(video);
  const A = geo.proportion;
  const [dx, dy] = geo.debord;
  const [cx, cy, cw, ch] = geo.photo;

  // Taille : le plus grand tirage (coins compris, une fois tourné) qui tient dans la zone.
  const t = (angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  const largeurBoite = (1 + 2 * dx) * c + ((1 + 2 * dy) * s) / A;
  const hauteurBoite = (1 + 2 * dx) * s + ((1 + 2 * dy) * c) / A;
  const marge = 0.97;
  const style: Vars = {
    '--gc-pc-angle': `${angle.toFixed(2)}deg`,
    '--gc-pc-l': `${((100 * marge) / largeurBoite).toFixed(3)}cqw`,
    '--gc-pc-h': `${((100 * marge) / hauteurBoite).toFixed(3)}cqh`,
    aspectRatio: `${A.toFixed(5)}`,
  };

  // Le ▶ : sur la marge blanche du bas, vers la droite (hors des coins).
  const bas = cy + ch;
  const margeBas = 1 - bas;
  const lireH = margeBas * 0.8;
  const lire: React.CSSProperties = {
    top: pc(bas + (margeBas - lireH) / 2),
    height: pc(lireH),
    right: pc(1 - (cx + cw) + 0.1),
    aspectRatio: '1',
  };
  const srcLire = imageLire();

  const souleverRef = React.useRef<() => boolean>(() => false);
  souleverRef.current = () => {
    const el = ref.current;
    if (!el) return false;
    if (onSoulever) {
      indiceUtilise(objet);
      onSoulever(el);
      return true;
    }
    const ok = !!actions?.soulever({ type: 'photo', video, source: el });
    if (ok) indiceUtilise(objet);
    return ok;
  };

  // L'indice : une respiration (1,5 s), puis tout revient au repos (styles en ligne retirés).
  useIndice(vivant ? objet : null, ref, () => respirer(souffleRef.current, ombreRef.current, lireRef.current));

  // Toucher dans le livre (dans le geste) et demande de soulèvement (Entrée du lead).
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !vivant) return undefined;
    const prendre = (e: Event) => {
      if (souleverRef.current()) e.preventDefault();
    };
    el.addEventListener(TOUCHER_LIVRE, prendre);
    el.addEventListener(EVENEMENT_SOULEVER, prendre);
    return () => {
      el.removeEventListener(TOUCHER_LIVRE, prendre);
      el.removeEventListener(EVENEMENT_SOULEVER, prendre);
    };
  }, [vivant]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (souleverRef.current()) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const img = (cls: string, src: string, extra?: React.CSSProperties, imgRef?: React.Ref<HTMLImageElement>) =>
    src ? <img ref={imgRef} className={cls} src={src} alt="" draggable={false} decoding="sync" style={extra} /> : null;
  const cadre = ([x, y, w, h]: [number, number, number, number]): React.CSSProperties => ({ left: pc(x), top: pc(y), width: pc(w), height: pc(h) });

  return (
    <div className="gc-photo-collee">
      <div
        ref={ref}
        className={`gc-photo-collee__photo${geo.ombreCuite ? ' gc-photo-collee__photo--ombre-cuite' : ''}`}
        style={style}
        data-gc-objet="photo"
        data-gc-objet-mode={mode}
        data-gc-video-id={video.id}
        tabIndex={vivant ? 0 : undefined}
        role={vivant ? 'img' : undefined}
        aria-label={vivant ? `Photo : ${video.titre}. Entrée pour regarder la vidéo.` : undefined}
        aria-hidden={vivant ? undefined : true}
        onKeyDown={vivant ? onKeyDown : undefined}
        onPointerDown={vivant ? () => indiceUtilise(objet) : undefined}
      >
        <div ref={souffleRef} className="gc-photo-collee__souffle">
          {vivant && <div ref={ombreRef} className="gc-photo-collee__ombre-indice" aria-hidden="true" />}
          {img('gc-photo-collee__tirage', urlMedia(video.tirage), cadre(geo.image))}
          {img('gc-photo-collee__lire', srcLire, lire, lireRef)}
          {img('gc-photo-collee__coins', urlMedia(video.coins), cadre(geo.coins))}
        </div>
      </div>
    </div>
  );
}

/** Durée d'une respiration (s) ; le sommet tombe à 42 %. */
export const DUREE_RESPIRATION = 1.5;

/** Respiration de l'indice : enveloppeur, calque d'ombre et ▶ (transform et opacity seulement). */
function respirer(souffle: HTMLElement | null, ombre: HTMLElement | null, lire: HTMLElement | null): Pulsation | null {
  if (!souffle) return null;
  const opts = { duration: DUREE_RESPIRATION, ease: 'easeInOut' as const, times: [0, 0.42, 1] };
  const els = [souffle, ombre, lire].filter((e): e is HTMLElement => !!e);
  souffle.style.willChange = 'transform';
  if (ombre) ombre.style.willChange = 'opacity';
  if (lire) lire.style.willChange = 'transform, opacity';
  const anims = [
    animate(souffle, { transform: ['scale(1)', 'scale(1.025)', 'scale(1)'] }, opts),
    ...(ombre ? [animate(ombre, { opacity: [0, 1, 0] }, opts)] : []),
    ...(lire ? [animate(lire, { opacity: [0.72, 1, 0.72], transform: ['scale(1)', 'scale(1.12)', 'scale(1)'] }, { ...opts, delay: 0.06 })] : []),
  ];
  // Au repos, rien en ligne : les règles CSS reprennent la main (▶ caché quand la photo est soulevée).
  const repos = () => {
    for (const el of els) {
      el.style.removeProperty('will-change');
      el.style.removeProperty('transform');
      el.style.removeProperty('opacity');
    }
  };
  let fini = false;
  const fin = Promise.all(anims.map((a) => a.finished)).then(() => {
    if (!fini) { fini = true; repos(); }
  });
  return {
    fin,
    stop: () => {
      if (fini) return;
      fini = true;
      for (const a of anims) {
        try { a.cancel(); } catch { a.stop(); }
      }
      repos();
    },
  };
}

export default PhotoCollee;
