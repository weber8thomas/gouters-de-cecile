// L'invitation à tourner le téléphone : téléphone tenu debout, le carnet reste fermé sur la table (on ne
// lit pas une page seule) et, sous le livre, un petit téléphone dessiné à la craie pivote d'un quart de
// tour, au-dessus de deux lignes de la main de Cécile : « Tournez le téléphone / pour ouvrir le carnet ».
//
// Le Livre la pose dans ses commandes (px d'écran), sur le bas de la zone sûre (`part`, la part que
// cadrerTourner laisse sous le livre) et en mène l'opacité (comme l'invitation à ouvrir). Le pivot est
// une boucle WAAPI de transform seul (le compositeur la joue), lancée tant que l'invitation se voit ;
// en mouvement réduit, le téléphone est simplement penché.
import React from 'react';
import { LazyMotion, animate, domMax, m, useReducedMotion, type MotionValue } from '../../lib/motion';
import './Invitation.css';

export interface InvitationTournerProps {
  /** Opacité d'ensemble, menée par le Livre. Défaut : 1. */
  opacite?: MotionValue<number>;
  /** Part du bas de la zone sûre qu'elle occupe (0–1). */
  part: number;
  className?: string;
}

/** Un tour de la boucle : debout, on tourne, couché, on revient (s). */
export const TOURNER_S = 4.2;

export function InvitationTourner({ opacite, part, className }: InvitationTournerProps) {
  const reduit = !!useReducedMotion();
  const telRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const el = telRef.current;
    if (!el || reduit) return undefined;
    let anim: ReturnType<typeof animate> | null = null;
    const demarrer = () => {
      if (anim) return;
      el.style.willChange = 'transform';
      anim = animate(
        el,
        { transform: ['rotate(0deg)', 'rotate(0deg)', 'rotate(90deg)', 'rotate(90deg)', 'rotate(0deg)'] },
        { duration: TOURNER_S, times: [0, 0.22, 0.5, 0.82, 1], ease: 'easeInOut', repeat: Infinity },
      );
    };
    const arreter = () => {
      if (!anim) return;
      try { anim.cancel(); } catch { anim.stop(); }
      anim = null;
      el.style.removeProperty('will-change');
      el.style.removeProperty('transform');
    };
    const suivre = (v: number) => (v > 0.01 ? demarrer() : arreter());
    suivre(opacite ? opacite.get() : 1);
    const off = opacite?.on('change', suivre);
    return () => {
      off?.();
      arreter();
    };
  }, [opacite, reduit]);

  return (
    <LazyMotion features={domMax}>
      <m.div
        className={`gc-tourner${className ? ` ${className}` : ''}`}
        data-gc-tourner=""
        data-gc-reduit={reduit ? '' : undefined}
        style={{ ...(opacite ? { opacity: opacite } : null), '--gc-tourner-part': part } as React.ComponentProps<typeof m.div>['style']}
        aria-hidden="true"
      >
        <span className="gc-tourner__dessin">
          {/* la flèche du quart de tour, fixe */}
          <svg className="gc-tourner__fleche" viewBox="-60 -60 120 120" focusable="false">
            <path d="M 30 -44 C 46 -34 52 -16 50 2" />
            <path d="M 43 -4 L 50 4 L 56 -5" />
          </svg>
          {/* un téléphone tracé à main levée (le cadre, l'écran, le bouton) : c'est lui qui pivote */}
          <span ref={telRef} className="gc-tourner__telephone">
            <svg viewBox="-60 -60 120 120" focusable="false">
              <path d="M -17 -33 Q -19 -35 -15 -35.5 L 15 -35 Q 19 -34.5 18.6 -30 L 18 31 Q 18.2 35 14 35.2 L -14.5 35 Q -18.4 34.6 -18 30.5 Z" />
              <path className="gc-tourner__fin" d="M -12 -27 L 12.5 -27.4 L 12 24 L -12.3 24.3 Z" />
              <path className="gc-tourner__fin" d="M -3 29.6 Q 0 28.6 3 29.7" />
            </svg>
          </span>
        </span>
        <p className="gc-tourner__texte">
          <span>Tournez le téléphone</span>
          <span>pour ouvrir le carnet</span>
        </p>
      </m.div>
    </LazyMotion>
  );
}

export default InvitationTourner;
