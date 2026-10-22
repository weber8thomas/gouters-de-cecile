import React from 'react';

// Horloge de lecture au même contrat qu'une HTMLVideoElement (currentTime, duration, paused, ended,
// play(), pause()). Sans élément média, elle simule la lecture (requestAnimationFrame) ; avec un
// élément <video>/<audio>, elle le reflète et lui délègue play() / pause().

export interface MediaClock {
  readonly currentTime: number; // secondes
  readonly duration: number; // secondes
  readonly paused: boolean;
  readonly ended: boolean;
  /** currentTime / duration, borné à 0–1. */
  readonly progress: number;
  /** Lance la lecture ; repart de 0 si la lecture était finie. */
  play(): Promise<void>;
  pause(): void;
}

export interface MediaClockOptions {
  /** Démarre dès le montage. */
  autoPlay?: boolean;
  /** Élément média réel à refléter (sinon horloge simulée). */
  media?: HTMLMediaElement | null;
}

interface Snapshot {
  t: number;
  d: number;
  paused: boolean;
  ended: boolean;
}

const EVENTS = ['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'seeked'] as const;

export function useMediaClock(duration = 30, { autoPlay = false, media = null }: MediaClockOptions = {}): MediaClock {
  const fallback = duration > 0 ? duration : 30;
  const [snap, setSnap] = React.useState<Snapshot>({ t: 0, d: fallback, paused: !autoPlay, ended: false });

  // Horloge simulée : la durée suit la prop.
  React.useEffect(() => {
    if (!media) setSnap((s) => (s.d === fallback ? s : { ...s, d: fallback, t: Math.min(s.t, fallback) }));
  }, [fallback, media]);

  // Horloge simulée : avance tant qu'elle n'est pas en pause.
  React.useEffect(() => {
    if (media || snap.paused) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      setSnap((s) => {
        if (s.paused) return s;
        const t = Math.min(s.d, s.t + dt);
        return t >= s.d ? { ...s, t: s.d, paused: true, ended: true } : { ...s, t };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [media, snap.paused]);

  // Élément réel : on reflète ses événements (et on lit currentTime à chaque image pendant la lecture).
  React.useEffect(() => {
    if (!media) return undefined;
    const read = () =>
      setSnap({
        t: media.currentTime,
        d: Number.isFinite(media.duration) && media.duration > 0 ? media.duration : fallback,
        paused: media.paused,
        ended: media.ended,
      });
    EVENTS.forEach((e) => media.addEventListener(e, read));
    // la boucle ne tourne que pendant la lecture (en pause : aucun rAF)
    let raf = 0;
    const loop = () => {
      raf = 0;
      if (media.paused) return;
      read();
      raf = requestAnimationFrame(loop);
    };
    const demarrer = () => { if (!raf && !media.paused) raf = requestAnimationFrame(loop); };
    media.addEventListener('play', demarrer);
    media.addEventListener('playing', demarrer);
    demarrer();
    read();
    if (autoPlay) void media.play().catch(() => undefined);
    return () => {
      EVENTS.forEach((e) => media.removeEventListener(e, read));
      media.removeEventListener('play', demarrer);
      media.removeEventListener('playing', demarrer);
      cancelAnimationFrame(raf);
    };
    // autoPlay ne compte qu'au branchement de l'élément : il n'est pas une dépendance.
  }, [media, fallback]);

  const play = React.useCallback((): Promise<void> => {
    if (media) {
      if (media.ended) media.currentTime = 0;
      return media.play().catch(() => undefined);
    }
    setSnap((s) => ({ ...s, t: s.ended || s.t >= s.d ? 0 : s.t, paused: false, ended: false }));
    return Promise.resolve();
  }, [media]);

  const pause = React.useCallback(() => {
    if (media) media.pause();
    else setSnap((s) => (s.paused ? s : { ...s, paused: true }));
  }, [media]);

  return React.useMemo<MediaClock>(
    () => ({
      currentTime: snap.t,
      duration: snap.d,
      paused: snap.paused,
      ended: snap.ended,
      progress: snap.d > 0 ? Math.min(1, Math.max(0, snap.t / snap.d)) : 0,
      play,
      pause,
    }),
    [snap, play, pause],
  );
}
