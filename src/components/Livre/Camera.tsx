import React from 'react';
import { animate, m, useMotionValue, useNiveauMouvement, useTransform, SPRINGS, type MotionValue } from '../../lib/motion';
import { zoomLivre } from '../../lib/camera';
import { cadenceStable, emettre } from './evenements';
import { r3 } from './geometrie';

export interface CameraProps {
  /** Zoom fin (0,95–1,05) : pure transformation, aucune mise en page. */
  zoom: number;
  /** Opacité du contenu (repli du changement de cran sans View Transitions). */
  fondu?: MotionValue<number>;
  /** Décalage horizontal (px de scène) : le livre résiste en butée quand on le glisse au doigt. */
  x?: MotionValue<number>;
  /**
   * Arrivée (plan v4) : 0 = le livre est encore en bas de la table (+70 % de la scène, tourné de 5°),
   * 1 = posé. Ressort SPRINGS.arrivee, piloté par le livre.
   */
  arrivee?: MotionValue<number>;
  /** Le livre est-il déjà là (1) ou pas encore entré (0,002 : calque prêt, invisible) ? */
  present?: MotionValue<number>;
  children?: React.ReactNode;
}

/** Arrivée : décalage vertical (fraction de la scène) et inclinaison de départ. */
export const ARRIVEE_Y = 0.7;
export const ARRIVEE_ANGLE = 5;

// Caméra du livre : porte la perspective du tourne-page (--gc-livre-perspective) et applique le
// zoom fin par un scale animé sur SPRINGS.camera. will-change n'est posé que pendant le mouvement
// (posé avant, et l'on attend une cadence stable : la promotion du calque ne tombe pas dans le geste).
export function Camera({ zoom, fondu, x, arrivee, present, children }: CameraProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const z = useMotionValue(zoom);
  // (mouvement doux ou réduit : pas de mouvement de caméra, le zoom est immédiat)
  const reduced = useNiveauMouvement() !== 'complet';
  const anim = React.useRef<ReturnType<typeof animate> | null>(null);
  const alive = React.useRef(true);
  const un = useMotionValue(1);
  const a = arrivee ?? un;
  const y = useTransform(a, (v) => `${r3(ARRIVEE_Y * 100 * (1 - v))}%`);
  const rotate = useTransform(a, (v) => ARRIVEE_ANGLE * (1 - v));
  const opacity = useTransform([fondu ?? un, present ?? un], ([f, pr]: number[]) => f * pr);

  React.useEffect(() => () => { alive.current = false; anim.current?.stop(); }, []);
  // le zoom à l'écran, pour les calques tracés du livre (src/lib/camera.tsx, zoomLivre)
  React.useEffect(() => {
    zoomLivre.set(z.get());
    const off = z.on('change', (v) => zoomLivre.set(v));
    return () => { off(); zoomLivre.set(1); };
  }, [z]);

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

  const anime = !!(arrivee || present || fondu);
  return (
    <m.div ref={ref} className="gc-livre-camera" style={{ scale: z, y, rotate, ...(x ? { x } : null), ...(anime ? { opacity } : null) }}>
      {children}
    </m.div>
  );
}
