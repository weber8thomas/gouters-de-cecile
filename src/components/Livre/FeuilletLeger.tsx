import React from 'react';
import { m, useTransform, type MotionValue } from '../../lib/motion';
import { CACHEE, clamp, r3 } from './geometrie';

// Feuille légère du feuilletage (plan v4) : un saut de plusieurs doubles pages fait défiler jusqu'à trois
// feuilles intermédiaires avant la feuille finale (le Feuillet, piloté par p). Un plan rigide, sans
// courbure ni voile : DEUX calques (recto, verso), chacun tourné autour de la reliure ; la face qui
// tourne le dos passe au plancher d'opacité au passage des 90° (pas de backface-visibility : elle reste
// rastérisée d'avance). Les pages sont les copies statiques (images cuites 1×).

export interface FeuilletLegerProps {
  /** Position de la feuille : 0 = à plat à droite, 1 = à plat à gauche. */
  q: MotionValue<number>;
  /** Fondu à l'atterrissage (la feuille suivante se pose dessus) : 1 → 0. */
  fondu: MotionValue<number>;
  /** Recto : une page de droite. */
  recto: React.ReactNode;
  /** Verso : une page de gauche. */
  verso: React.ReactNode;
}

const angle = (v: number) => -180 * clamp(v, 0, 1);

export function FeuilletLeger({ q, fondu, recto, verso }: FeuilletLegerProps) {
  const tr = useTransform(q, (v) => `rotateY(${r3(angle(v))}deg)`);
  // Verso : retourné sur lui-même (autour de son centre), puis tourné autour de la reliure.
  const tv = useTransform(q, (v) => `rotateY(${r3(angle(v))}deg) translateX(calc(var(--gc-page-w) / 2)) rotateY(180deg) translateX(calc(var(--gc-page-w) / -2))`);
  const or = useTransform([q, fondu], ([v, f]: number[]) => Math.max(CACHEE, (angle(v) > -90 ? 1 : CACHEE) * f));
  const ov = useTransform([q, fondu], ([v, f]: number[]) => Math.max(CACHEE, (angle(v) > -90 ? CACHEE : 1) * f));
  return (
    <>
      <m.div className="gc-livre-leger gc-livre-leger--recto" style={{ transform: tr, opacity: or }} aria-hidden="true">
        {recto}
        <div className="gc-livre-leger__voile" />
      </m.div>
      <m.div className="gc-livre-leger gc-livre-leger--verso" style={{ transform: tv, opacity: ov }} aria-hidden="true">
        {verso}
        <div className="gc-livre-leger__voile" />
      </m.div>
    </>
  );
}
