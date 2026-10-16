// Réglette du menu : un trait de crayon et un pâté d'encre qu'on fait glisser (doigt, souris), ou
// qu'on pousse au clavier (← →, Début, Fin : le menu les traduit, voir Reglages.tsx). Un vrai
// role="slider" : valeur lue par les lecteurs d'écran (aria-valuetext).
import React from 'react';
import { Pate, TraitCrayon } from './traces';

export interface RegletteProps {
  valeur: number;
  min: number;
  max: number;
  pas: number;
  onChange: (v: number) => void;
  /** Nom accessible (« Zoom fin », « Volume »). */
  libelle: string;
  /** Valeur lue (« 104 % »). */
  texte: string;
  /** Petit repère au crayon (le 100 % du zoom). */
  repere?: number;
  /** Cible des flèches ↑ ↓ du menu dans sa ligne. */
  principal?: boolean;
  /** Atténuée (le volume quand le son est coupé), toujours utilisable. */
  attenuee?: boolean;
}

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Valeur arrondie au pas, dans les bornes (évite 0.8500000001). */
export function auPas(v: number, min: number, max: number, pas: number): number {
  const n = Math.round((borne(v, min, max) - min) / pas);
  return +borne(min + n * pas, min, max).toFixed(4);
}

export function Reglette({ valeur, min, max, pas, onChange, libelle, texte, repere, principal, attenuee }: RegletteProps) {
  const pisteRef = React.useRef<HTMLSpanElement>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const fraction = max > min ? borne((valeur - min) / (max - min), 0, 1) : 0;

  // Le doigt (ou la souris) pose le pâté là où il touche, puis le traîne. Une valeur nouvelle
  // seulement quand le pas change : quelques rendus par geste, jamais un par image.
  const suivre = (e: React.PointerEvent) => {
    const piste = pisteRef.current;
    if (!piste) return;
    const r = piste.getBoundingClientRect();
    if (!(r.width > 0)) return;
    const v = auPas(min + ((e.clientX - r.left) / r.width) * (max - min), min, max, pas);
    if (v !== valeur) onChangeRef.current(v);
  };
  const appui = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    suivre(e);
  };
  const glisse = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) suivre(e);
  };

  const pc = (f: number) => `${(f * 100).toFixed(3)}%`;
  const repereF = repere != null && max > min ? borne((repere - min) / (max - min), 0, 1) : null;
  return (
    <span
      className={`gc-reglages__reglette${attenuee ? ' gc-reglages__reglette--attenuee' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={libelle}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={valeur}
      aria-valuetext={texte}
      aria-orientation="horizontal"
      data-gc-principal={principal ? '' : undefined}
      data-gc-reglette=""
      onPointerDown={appui}
      onPointerMove={glisse}
    >
      <span ref={pisteRef} className="gc-reglages__piste">
        <TraitCrayon className="gc-reglages__trait gc-reglages__trait--crayon" />
        <span className="gc-reglages__plein" style={{ clipPath: `inset(-50% ${pc(1 - fraction)} -50% 0)` }}>
          <TraitCrayon className="gc-reglages__trait gc-reglages__trait--encre" />
        </span>
        {repereF != null && <span className="gc-reglages__tic" style={{ left: pc(repereF) }} aria-hidden="true" />}
        <span className="gc-reglages__curseur" style={{ left: pc(fraction) }} aria-hidden="true">
          <Pate />
        </span>
      </span>
    </span>
  );
}
