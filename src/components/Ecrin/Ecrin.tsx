import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ECRINS } from '../../generated/ecrins.gen';
import type { Aperture, EcrinManifest } from '../../lib/ecrin-types';
import type { EcrinId, Liquid } from '../../content/types';
import { useSettings } from '../../lib/settings';
import { TasseProgression, TASSE_ANCHOR } from '../TasseProgression/TasseProgression';
import './Ecrin.css';

// Écrin vidéo : cadre décoratif (fichiers SVG du design system) autour d'une vidéo ronde, ovale ou
// rectangulaire. Calques empilés, tous au même viewBox : back → média masqué → front → dôme → tasse → légende.

export type EcrinState = 'idle' | 'playing';

export interface EcrinProps {
  /** Écrin du chapitre (clé de ECRINS). */
  type: EcrinId;
  /** Variante (« a », « b », « c ») ; par défaut la première du manifeste. */
  variant?: string;
  /** idle = avant lecture (image figée traitée comme dessinée) ; playing = en lecture (couleur, tasse). */
  state: EcrinState;
  /** Contenu du slot (ex. <SceneVideo/>) : il remplit le slot et gère ses deux rendus selon .gc-ecrin[data-state]. */
  media?: ReactNode;
  /** Vraie vidéo : poster traité en sépia/aquarelle avant lecture, vidéo en couleur en lecture. */
  video?: { src: string; poster?: string };
  /** Avancement de la lecture, 0–1 → tasse (ignoré avant lecture : la tasse est vide). */
  progress?: number;
  /** Contenu de la tasse-progression. */
  liquid?: Liquid;
  /** Légende manuscrite sous l'écrin, ex. « Julie, depuis Lyon ». */
  caption?: string;
  /** Affiche la tasse-progression (défaut : oui, si le manifeste prévoit sa place). */
  showCup?: boolean;
  /** Dôme soulevé (cloche) ; par défaut soulevé en lecture. */
  lifted?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accès à l'élément <video> (utilisé par EcrinLecteur pour synchroniser l'horloge). */
  videoRef?: React.Ref<HTMLVideoElement>;
}

const pct = (v: number, of: number) => `${+((v / of) * 100).toFixed(4)}%`;

/** Boîte englobante de l'ouverture (unités du viewBox) ; un rectangle tourné garde sa boîte propre et tourne autour de son centre. */
export function apertureBox(a: Aperture) {
  if (a.shape === 'circle') return { x: a.cx - a.r, y: a.cy - a.r, w: 2 * a.r, h: 2 * a.r, rotate: 0 };
  if (a.shape === 'ellipse') return { x: a.cx - a.rx, y: a.cy - a.ry, w: 2 * a.rx, h: 2 * a.ry, rotate: 0 };
  return { x: a.x, y: a.y, w: a.w, h: a.h, rotate: a.rotate ?? 0 };
}
/** Centre de l'ouverture : pivot du dôme soulevé. */
export function apertureCenter(a: Aperture) {
  if (a.shape === 'rect') return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  return { x: a.cx, y: a.cy };
}

const maskCache = new Map<string, string>();
function maskUrl(svg: string) {
  let url = maskCache.get(svg);
  if (!url) {
    url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
    maskCache.set(svg, url);
  }
  return url;
}

/** Rend les ids d'un SVG uniques par instance (plusieurs écrins identiques sur une même page). */
function scopeIds(svg: string, scope: string) {
  const ids = new Set<string>();
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  let out = svg;
  for (const id of ids) {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(id="|#)${safe}(?=["')])`, 'g'), `$1${id}-${scope}`);
  }
  return out;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as React.MutableRefObject<T | null>).current = value;
}

/** Enfant du slot pour une vraie vidéo : poster traité avant lecture, vidéo en couleur en lecture. */
function EcrinVideo({ src, poster, state, videoRef }: { src: string; poster?: string; state: EcrinState; videoRef?: React.Ref<HTMLVideoElement> }) {
  const local = React.useRef<HTMLVideoElement | null>(null);
  const setRef = React.useCallback(
    (el: HTMLVideoElement | null) => {
      local.current = el;
      assignRef(videoRef, el);
    },
    [videoRef],
  );
  // Lecture pilotée par les transitions d'état seulement (une pause en cours de lecture reste au parent).
  React.useEffect(() => {
    const el = local.current;
    if (!el) return;
    if (state === 'playing') void el.play().catch(() => undefined);
    else {
      el.pause();
      if (el.currentTime > 0) el.currentTime = 0;
    }
  }, [state]);
  return (
    <div className={`gc-ecrin__video${poster ? '' : ' gc-ecrin__video--no-poster'}`}>
      <video ref={setRef} className="gc-ecrin__live" src={src} poster={poster} playsInline preload="metadata" />
      {poster ? <img className="gc-ecrin__still" src={poster} alt="" draggable={false} /> : null}
      <div className="gc-ecrin__wash" aria-hidden="true" />
    </div>
  );
}

function Missing({ type, className, style }: Pick<EcrinProps, 'type' | 'className' | 'style'>) {
  return <div className={['gc-ecrin', 'gc-ecrin--missing', className].filter(Boolean).join(' ')} data-ecrin={type} data-missing="true" style={style} />;
}

export function Ecrin(props: EcrinProps) {
  const { type, variant, state, media, video, progress = 0, liquid = 'the', caption, showCup = true, lifted, className, style, videoRef } = props;
  const { idle } = useSettings();
  const scope = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const entry = ECRINS[type];
  const manifest: EcrinManifest | undefined = entry?.manifest;
  const variantId = entry ? (variant && entry.variants[variant] ? variant : manifest?.variants.find((v) => entry.variants[v.id])?.id ?? Object.keys(entry.variants)[0]) : undefined;
  const files = entry && variantId ? entry.variants[variantId] : undefined;

  const layers = React.useMemo(
    () => ({
      back: files?.back ? { __html: scopeIds(files.back, scope) } : undefined,
      front: files?.front ? { __html: scopeIds(files.front, scope) } : undefined,
      dome: files?.dome ? { __html: scopeIds(files.dome, scope) } : undefined,
      mask: files ? maskUrl(files.mask) : undefined,
    }),
    [files, scope],
  );

  if (!manifest || !files) return <Missing type={type} className={className} style={style} />;

  const [W, H] = manifest.viewBox;
  const box = apertureBox(manifest.aperture);
  const pivot = apertureCenter(manifest.aperture);
  const lift = manifest.lift;
  const isLifted = Boolean(lift && layers.dome) && (lifted ?? state === 'playing');
  const rootStyle = {
    aspectRatio: `${W} / ${H}`,
    '--gc-ecrin-focus': `${manifest.focus[0] * 100}% ${manifest.focus[1] * 100}%`,
    '--gc-ecrin-pivot': `${pct(pivot.x, W)} ${pct(pivot.y, H)}`,
    '--gc-ecrin-pivot-u': `${pivot.x}px ${pivot.y}px`,
    '--gc-ecrin-lift': lift ? `translate(${pct(lift.dx, W)}, ${pct(lift.dy, H)}) rotate(${lift.rotate}deg)` : 'none',
    '--gc-ecrin-lift-u': lift ? `translate(${lift.dx}px, ${lift.dy}px) rotate(${lift.rotate}deg)` : 'none',
    ...style,
  } as CSSProperties;
  const slotStyle: CSSProperties = {
    left: pct(box.x, W),
    top: pct(box.y, H),
    width: pct(box.w, W),
    height: pct(box.h, H),
    transform: box.rotate ? `rotate(${box.rotate}deg)` : undefined,
  };
  const cup = showCup && manifest.cup ? manifest.cup : null;
  const cap = caption && manifest.caption ? manifest.caption : null;

  return (
    <div
      className={['gc-ecrin', `gc-ecrin--${type}`, className].filter(Boolean).join(' ')}
      data-ecrin={type}
      data-variant={variantId}
      data-state={state}
      data-lifted={isLifted ? 'true' : 'false'}
      data-idle={idle}
      style={rootStyle}
    >
      {layers.back ? <div className="gc-ecrin__layer gc-ecrin__back" aria-hidden="true" dangerouslySetInnerHTML={layers.back} /> : null}
      <div className="gc-ecrin__layer gc-ecrin__media" style={{ maskImage: layers.mask, WebkitMaskImage: layers.mask }}>
        <div className="gc-ecrin__slot" style={slotStyle}>
          {media ?? (video ? <EcrinVideo src={video.src} poster={video.poster} state={state} videoRef={videoRef} /> : null)}
        </div>
      </div>
      {layers.front ? <div className="gc-ecrin__layer gc-ecrin__front" aria-hidden="true" dangerouslySetInnerHTML={layers.front} /> : null}
      {layers.dome ? <div className="gc-ecrin__layer gc-ecrin__dome" aria-hidden="true" dangerouslySetInnerHTML={layers.dome} /> : null}
      {cup ? (
        <div className="gc-ecrin__cup" style={{ left: pct(cup.x, W), top: pct(cup.y, H), transform: `translate(${-TASSE_ANCHOR.x * 100}%, ${-TASSE_ANCHOR.y * 100}%)` }}>
          <TasseProgression progress={state === 'playing' ? progress : 0} liquid={liquid} />
        </div>
      ) : null}
      {cap ? (
        <p
          className="gc-ecrin__caption gc-hand-caption"
          style={{ left: pct(cap.x, W), top: pct(cap.y, H), width: pct(cap.w, W), transform: cap.rotate ? `rotate(${cap.rotate}deg)` : undefined }}
        >
          {caption}
        </p>
      ) : null}
    </div>
  );
}
