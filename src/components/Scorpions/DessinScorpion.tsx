import React from 'react';
import { VUES_SCORPION, type NomVue } from './dessins';

/** Un griffonnage à la plume : lavis d'ocre décalé (comme une aquarelle mal calée), puis trait d'encre irrégulier. */
export function DessinScorpion({ vue, pose, className }: { vue: NomVue; pose: 0 | 1 | 2; className?: string }) {
  const v = VUES_SCORPION[vue], p = v.poses[pose];
  return <svg className={className} viewBox={v.viewBox} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <g fill="#c47a3a" fillOpacity=".4" stroke="none" transform="translate(1 1.2)">
      {p.lavis.map((d, i) => <path key={i} d={d}/>)}
    </g>
    {p.traits.map(([d, w], i) => <path key={i} d={d} strokeWidth={w}/>)}
    {p.points.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="currentColor" stroke="none"/>)}
  </svg>;
}
