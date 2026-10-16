import React from 'react';
import type { InkId } from '../../content/types';
import { inkVar } from '../../lib/hands';
import { ulDouble, ulMain, ulRegle, ulVague, UL_VIEW, type TraitPaths } from './traits';
import { rng, r2 } from './rng';
import './Ecriture.css';

export type SouligneVariant = 'regle' | 'double' | 'vague' | 'main';

export interface SouligneProps {
  /** `regle` (trait à la règle), `double` (deux traits à la règle), `vague` (à main levée, ondulé), `main` (à main levée, léger arc). */
  variant?: SouligneVariant;
  /** Encre du trait ; sans encre, le trait prend la couleur du texte (currentColor). */
  ink?: InkId;
  /** Graine : même graine, même trait. */
  seed?: number;
  /** Inclinaison du trait en degrés (suivre la pente de la ligne écrite). */
  slant?: number;
  /**
   * `bloc` : trait autonome, pleine largeur de son conteneur (par défaut).
   * `ancre` : posé sous la ligne de base du texte qui le précède (usage interne d'<Ecriture>).
   */
  mode?: 'bloc' | 'ancre';
  className?: string;
}

const GEN: Record<SouligneVariant, (seed: number) => TraitPaths> = {
  regle: ulRegle,
  double: ulDouble,
  vague: ulVague,
  main: ulMain,
};

/** Souligné tracé à la main : à la règle (droit mais pas parfait, départ appuyé), double, vague ou libre. */
export function Souligne({ variant = 'regle', ink, seed = 1, slant = 0, mode = 'bloc', className }: SouligneProps) {
  const paths = React.useMemo(() => GEN[variant](seed), [variant, seed]);
  const classes = ['gc-souligne', `gc-souligne--${variant}`, `gc-souligne--${mode}`, className].filter(Boolean).join(' ');
  // Sous un texte, le trait n'a jamais exactement la longueur du mot : il part un peu avant ou
  // après, et s'arrête court ou déborde (la règle déborde plus volontiers qu'un trait à main levée).
  let longueur: React.CSSProperties | null = null;
  if (mode === 'ancre') {
    const L = rng(seed ^ 0x6a09e667);
    const regle = variant === 'regle' || variant === 'double';
    const debut = regle ? L.range(-0.3, 0.06) : L.range(-0.12, 0.12);
    const fin = regle ? L.range(-0.15, 0.6) : L.range(-0.28, 0.3);
    longueur = { insetInlineStart: `${r2(debut)}em`, inlineSize: `calc(100% + ${r2(fin - debut)}em)` };
  }
  const style = {
    ...(ink ? { color: inkVar(ink) } : null),
    ...(slant ? { '--gc-souligne-rot': `${slant}deg` } : null),
    ...longueur,
  } as React.CSSProperties;
  return (
    <svg
      className={classes}
      viewBox={`0 0 ${UL_VIEW.w} ${UL_VIEW.h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      style={style}
      data-ink={ink}
    >
      {paths.main.map((d, i) => (
        <path key={`m${i}`} className="gc-souligne__trait" d={d} />
      ))}
      {paths.heavy.map((d, i) => (
        <path key={`h${i}`} className="gc-souligne__appui" d={d} />
      ))}
    </svg>
  );
}
