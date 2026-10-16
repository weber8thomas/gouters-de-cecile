import React from 'react';
import { animate, m, useMotionValue, useReducedMotion, SPRINGS, type MotionValue } from '../../lib/motion';
import { cadenceStable, emettre } from './evenements';

export interface CameraProps {
  /** Zoom fin (0,95–1,05) : pure transformation, aucune mise en page. */
  zoom: number;
  /** Opacité du contenu (repli du changement de cran sans View Transitions). */
  fondu?: MotionValue<number>;
  children?: React.ReactNode;
}

// Caméra du livre : porte la perspective du tourne-page (--gc-livre-perspective) et applique le
// zoom fin par un scale animé sur SPRINGS.camera. will-change n'est posé que pendant le mouvement
// (posé avant, et l'on attend une cadence stable : la promotion du calque ne tombe pas dans le geste).
export function Camera({ zoom, fondu, children }: CameraProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const z = useMotionValue(zoom);
  const reduced = useReducedMotion();
  const anim = React.useRef<ReturnType<typeof animate> | null>(null);
  const alive = React.useRef(true);

  React.useEffect(() => () => { alive.current = false; anim.current?.stop(); }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || z.get() === zoom) return;
    if (reduced) {
      anim.current?.stop();
      anim.current = null;
      z.set(zoom);
      return;
    }
    const start = () => {
      anim.current = animate(z, zoom, {
        ...SPRINGS.camera,
        onComplete: () => {
          anim.current = null;
          el.style.willChange = '';
          emettre(el, 'fin', 'zoom');
        },
      });
    };
    if (anim.current) {
      // Appui pendant le mouvement : on relance le ressort vers la nouvelle cible (vitesse conservée).
      anim.current.stop();
      start();
      return;
    }
    el.style.willChange = 'transform';
    let cancelled = false;
    cadenceStable().then(() => {
      if (cancelled || !alive.current) return;
      emettre(el, 'debut', 'zoom');
      start();
    });
    return () => { cancelled = true; };
  }, [zoom, reduced, z]);

  return (
    <m.div ref={ref} className="gc-livre-camera" style={fondu ? { scale: z, opacity: fondu } : { scale: z }}>
      {children}
    </m.div>
  );
}
