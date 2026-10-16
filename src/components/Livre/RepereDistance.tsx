import React from 'react';
import { animate, m, useMotionValue, useReducedMotion, SPRINGS } from '../../lib/motion';
import type { Distance } from '../../lib/settings';

export interface RepereDistanceProps {
  distance: Distance;
  zoom: number;
  /** Horodatage du dernier réglage (useCamera().changedAt) ; 0 = rien à montrer. */
  changedAt: number;
}

/** Durée de vie du repère : il apparaît au réglage et s'efface en 1,5 s. */
const VIE = 1.5;

// Petite étiquette manuscrite posée sur la table, en bas à gauche : « loin · 97 % ».
// Toujours montée (opacité 0 au repos) : un réglage ne crée ni ne retire aucun nœud.
export function RepereDistance({ distance, zoom, changedAt }: RepereDistanceProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const op = useMotionValue(0);
  const y = useMotionValue(10);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    const el = ref.current;
    if (!changedAt || !el) return;
    el.style.willChange = 'opacity, transform';
    const fin = () => { el.style.willChange = ''; };
    const from = op.get();
    if (from < 0.05) y.set(reduced ? 0 : 10);
    const a = animate(op, [from, 1, 1, 0], { duration: VIE, times: [0, 0.16, 0.55, 1], ease: ['easeOut', 'linear', 'easeIn'], onComplete: fin });
    const b = reduced ? null : animate(y, 0, SPRINGS.settle);
    return () => { a.stop(); b?.stop(); };
  }, [changedAt, op, y, reduced]);

  const pct = Math.round(zoom * 100);
  return (
    <m.div ref={ref} className="gc-livre-repere gc-hand-caption" style={{ opacity: op, y, rotate: -1.6 }} role="status" aria-live="polite">
      {distance} · {pct}{' '}%
    </m.div>
  );
}
