import React from 'react';
import type { HandId, InkId } from '../../content/types';
import { handStyle, handText, inkVar } from '../../lib/hands';
import { chevron, rature as traceRature, ratureDe, RATURE_VIEW, type RatureStyle } from './traits';
import { metriques } from './metriques';
import { hashSeed, rng, r2 } from './rng';
import './Ecriture.css';

export type { RatureStyle };

export interface RatureProps {
  /** Texte raturé (déjà écrit, puis barré). */
  children: string;
  /** Correction, écrite au-dessus du mot raturé ou juste après (voir `fixPlace`). */
  correction?: string;
  /** Main de l'invité (la correction est de la même main). */
  hand: HandId;
  /** Encre de l'auteur : la rature est toujours tracée avec. Sans encre, la couleur du texte. */
  ink?: InkId;
  /**
   * Encre de la correction : par défaut celle de l'auteur (on se corrige avec son propre stylo).
   * `rouge` seulement si quelqu'un d'autre corrige (Cécile, par exemple).
   */
  fixInk?: InkId;
  /** Main de qui corrige, si ce n'est pas l'auteur (Cécile qui corrige au stylo rouge). */
  fixHand?: HandId;
  /** `auto` (par défaut, selon la graine et la main), `dessus` (dans l'interligne) ou `apres` (à la suite). */
  fixPlace?: 'auto' | 'dessus' | 'apres';
  /** Façon de raturer : `trait` (≈ 70 %), `zigzag` (≈ 25 %), `noirci` (≈ 5 %, un mot court). Par défaut selon la graine. */
  rature?: RatureStyle;
  /** Épaisseur relative de l'outil (voir TRAIT_K dans Ecriture). */
  k?: number;
  seed?: number;
}

/** Une correction au-dessus d'une cursive à grandes hampes coûterait presque une ligne : on l'écrit après. */
const HAMPES_HAUTES = 1;

/**
 * Où écrire la correction : au-dessus 72 % du temps, sinon juste après ; toujours après pour
 * les mains dont les hampes dépassent 1 em (Playwrite), sauf demande expresse.
 */
export function placeDe(seed: number, hand: HandId): 'dessus' | 'apres' {
  if (metriques(hand).stems > HAMPES_HAUTES) return 'apres';
  return rng(seed ^ 0x1b873593).next() < 0.72 ? 'dessus' : 'apres';
}

/**
 * Correction au-dessus : sa ligne de base se pose juste au-dessus des minuscules raturées
 * (max(x + 0,2 em, hampes − 0,06 em) ; le haut des chiffres barrés peut l'effleurer). La rature
 * réserve en haut (reach − interlignage) em, reach = haut de la correction (plus petite : ~0,92 ×
 * ses hampes) + 0,28 em : elle reste sous les jambages de la ligne d'au-dessus. Interlignage lu en CSS.
 */
export function placeCorrection(hand: HandId, fixHand: HandId = hand): { lift: number; reach: number } {
  const m = metriques(hand);
  const lift = Math.max(m.xh + 0.2, m.stems - 0.06);
  return { lift: r2(lift), reach: r2(lift + 0.92 * metriques(fixHand).stems + 0.28) };
}

/**
 * Mot raturé comme le font les vrais gens (trait qui dépasse, zigzag ou noirci), dans l'encre de
 * l'auteur, avec sa correction plus petite et un peu penchée, au-dessus (parfois avec un chevron
 * d'insertion) ou juste après. <Ecriture> le génère depuis « ~~150 g~~>120 g ».
 *
 * Pas de <ruby> : Chromium réserve au-dessus d'un <rt> près d'une ligne entière (+40 px mesurés).
 */
export function Rature({ children, correction, hand, ink, fixInk, fixHand, fixPlace = 'auto', rature, k = 1, seed }: RatureProps) {
  const s = seed ?? hashSeed(`${hand}|${children}|${correction ?? ''}`);
  const style = rature ?? ratureDe(s, children);
  const m = metriques(hand);
  const chars = [...children].length;
  // chiffres, majuscules et hampes : on barre au milieu de leur hauteur, pas des minuscules
  const lettres = children.replace(/[\s\u00a0\u202f]/g, '');
  const hauts = (lettres.match(/[0-9A-ZÀ-ÖØ-Þbdfhklt]/g) || []).length;
  const corps = lettres && hauts / lettres.length >= 0.5 ? m.stems : m.xh;
  const geo = React.useMemo(() => traceRature(style, s, chars * m.car, m.xh, k, corps), [style, s, chars, m.car, m.xh, k, corps]);
  const R = rng(s ^ 0x5bd1e995);
  const place = correction ? (fixPlace === 'auto' ? placeDe(s, hand) : fixPlace) : 'seule';
  const dessus = place === 'dessus';
  const encreFix = fixInk ?? ink;
  // la correction : plus petite (rôle annotation), un peu penchée, décalée
  const fixStyle = {
    ...handStyle(fixHand ?? hand, 'annotation', encreFix),
    ...(dessus ? { lineHeight: 0 } : null),
    '--gc-rot': `${r2(dessus ? R.range(-7, -1.5) : R.range(-4, 1))}deg`,
    '--gc-dx': `${r2(dessus ? R.range(0.08, 0.45) : 0)}em`,
  } as React.CSSProperties;
  // chevron d'insertion : « ^ » sous le mot, ou « v » au-dessus, une fois sur trois
  const r = R.next();
  const chev: '^' | 'v' | null = dessus && r < 0.34 ? (r < 0.2 ? '^' : 'v') : null;
  const { lift, reach } = placeCorrection(hand, fixHand);
  const rootStyle =
    dessus
      ? ({ '--gc-rature-reach': reach, '--gc-rature-lh': `var(--gc-lh-${hand})`, '--gc-rature-lift': `${lift}em` } as React.CSSProperties)
      : undefined;
  // on rature avec le stylo de qui corrige : l'auteur, ou l'autre (Cécile au rouge)
  const traceInk = fixHand && fixHand !== hand ? encreFix : ink;
  const traceStyle = {
    insetInlineStart: `${-geo.over[0]}px`,
    inlineSize: `calc(100% + ${r2(geo.over[0] + geo.over[1])}px)`,
    '--gc-rature-rot': `${r2(geo.tilt)}deg`,
    ...(traceInk ? { color: inkVar(traceInk) } : null),
  } as React.CSSProperties;
  return (
    <span className={`gc-rature gc-rature--${place} gc-rature--${style}`} style={rootStyle}>
      <span className="gc-rature__base">
        <span className="gc-ancre" aria-hidden="true">
          <svg
            className="gc-rature__trace"
            viewBox={`0 0 ${RATURE_VIEW.w} ${RATURE_VIEW.h}`}
            preserveAspectRatio="none"
            focusable="false"
            style={traceStyle}
          >
            {geo.fills.map((d, i) => (
              <path key={`f${i}`} className="gc-rature__plein" d={d} />
            ))}
            {geo.strokes.map((d, i) => (
              <path key={`s${i}`} className={`gc-rature__trait gc-rature__trait--${style}`} d={d} />
            ))}
          </svg>
        </span>
        <del className="gc-rature__barre">{handText(children, hand)}</del>
        {chev ? (
          <span className="gc-ancre" aria-hidden="true">
            <svg
              className={`gc-rature__chevron gc-rature__chevron--${chev === '^' ? 'dessous' : 'dessus'}`}
              viewBox="0 0 20 16"
              focusable="false"
              style={{
                insetInlineStart: `${r2(R.range(18, 48))}%`,
                // « v » : entre la correction et le mot, juste au-dessus des minuscules
                ...(chev === 'v' ? { marginBlockStart: `${r2(-(m.xh + 0.42))}em` } : null),
                ...(encreFix ? { color: inkVar(encreFix) } : null),
              }}
            >
              <path d={chevron(s, chev)} />
            </svg>
          </span>
        ) : null}
      </span>
      {correction ? (
        <span className="gc-rature__place">
          <ins className="gc-rature__correction" style={fixStyle}>
            {handText(correction, fixHand ?? hand)}
          </ins>
        </span>
      ) : null}
    </span>
  );
}
