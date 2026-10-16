import React from 'react';
import { Ecrin } from './Ecrin';
import type { EcrinProps } from './Ecrin';
import { useMediaClock } from './useMediaClock';

// Écrin + horloge de lecture : Entrée, Espace ou clic lance / met en pause ; la progression remplit la tasse.
// Avant la première lecture : état « idle ». Ensuite : « playing » (même en pause) ; à la fin, la tasse
// reste pleine et fume. Avec `video`, l'horloge reflète la vraie vidéo ; sinon elle simule `duration`.

export interface EcrinLecteurProps extends Omit<EcrinProps, 'state' | 'progress' | 'videoRef'> {
  /** Durée simulée en secondes (sans vraie vidéo). */
  duration?: number;
  /** Démarre la lecture au montage. */
  autoPlay?: boolean;
}

export function EcrinLecteur({ duration = 30, autoPlay = false, className, style, ...ecrin }: EcrinLecteurProps) {
  const [videoEl, setVideoEl] = React.useState<HTMLVideoElement | null>(null);
  const clock = useMediaClock(duration, { autoPlay, media: ecrin.video ? videoEl : null });
  const started = !clock.paused || clock.currentTime > 0;

  const toggle = () => {
    if (clock.paused) void clock.play();
    else clock.pause();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };
  const who = ecrin.caption ? ` : ${ecrin.caption}` : '';

  return (
    <div
      className={['gc-ecrin-lecteur', className].filter(Boolean).join(' ')}
      style={style}
      role="button"
      tabIndex={0}
      aria-pressed={!clock.paused}
      aria-label={`${clock.paused ? 'Lire' : 'Mettre en pause'} la vidéo${who}`}
      data-paused={clock.paused ? 'true' : 'false'}
      data-ended={clock.ended ? 'true' : 'false'}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      <Ecrin {...ecrin} state={started ? 'playing' : 'idle'} progress={clock.progress} videoRef={ecrin.video ? setVideoEl : undefined} />
    </div>
  );
}
