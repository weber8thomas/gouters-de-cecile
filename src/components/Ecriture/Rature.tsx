import React from 'react';
import type { HandId, InkId } from '../../content/types';
import { handStyle, handText, inkVar } from '../../lib/hands';
import { gribouillis, SCRIBBLE_VIEW } from './traits';
import { hashSeed, rng, r2 } from './rng';
import './Ecriture.css';

export interface RatureProps {
  /** Texte raturé (déjà écrit, puis barré d'un gribouillis). */
  children: string;
  /** Correction, écrite au-dessus du mot raturé (ou juste après, voir `fixPlace`). */
  correction?: string;
  /** Main de l'invité (la correction est de la même main). */
  hand: HandId;
  /** Encre du gribouillis : celle de l'invité (par défaut, la couleur du texte). */
  ink?: InkId;
  /** Encre de la correction : `rouge` par défaut (CONTRACT § 8). */
  fixInk?: InkId;
  /** `dessus` (par défaut) : dans l'interligne, au-dessus du mot ; `apres` : à la suite, sur la ligne. */
  fixPlace?: 'dessus' | 'apres';
  seed?: number;
}

/**
 * Hauteur à dégager au-dessus de la ligne de base, en em du texte raturé : la plus haute des
 * hampes et des chiffres de la main (« Hd », « 150 », mesurés à l'encre, au pixel, par
 * verification/out/s2/xheight-ink.mjs) + 0,05 em d'air. Les cursives Playwrite ont des chiffres
 * et des hampes très hauts (1,32 em pour FR Trad, 2,4 × la hauteur d'x).
 */
const HAMPE: Record<HandId, number> = {
  mamie: 1.32,
  ecole: 1.135,
  soignee: 0.775,
  feutre: 0.77,
  capitales: 0.695,
  pressee: 0.755,
  cecile: 0.79,
};
/**
 * Correction posée au-dessus : sa ligne de base monte de HAMPE + 0,05 em (elle ne touche pas les
 * chiffres raturés). La rature réserve en haut (reach − interlignage) em, où reach = hauteur
 * atteinte par le haut de la correction + 0,1 em : la correction ne franchit pas la ligne de base
 * de la ligne d'au-dessus (seuls ses jambages peuvent la croiser, comme sur une vraie page).
 * L'interlignage est lu en CSS (--gc-lh-<main>) : la réserve suit les tokens.
 */
export function placeCorrection(hand: HandId): { lift: number; reach: number } {
  const lift = HAMPE[hand] + 0.05;
  return { lift: r2(lift), reach: r2(lift + HAMPE[hand] + 0.1) };
}

/**
 * Mot raturé d'un gribouillis tracé à la main, correction écrite au-dessus (ou à la suite).
 * S'utilise dans un texte manuscrit (<Ecriture> le génère depuis « ~~150 g~~>120 g »).
 *
 * Pourquoi pas <ruby> : Chromium réserve au-dessus d'un <rt> près d'une ligne entière, quels que
 * soient la taille et l'interligne de l'annotation (+40 px mesurés pour Kalam à 32 px). Ici la
 * correction est posée sur la ligne de base du mot raturé puis remontée (placeCorrection), et la
 * rature réserve en haut la hauteur nécessaire : l'interligne en tient compte, sans plus.
 */
export function Rature({ children, correction, hand, ink, fixInk = 'rouge', fixPlace = 'dessus', seed }: RatureProps) {
  const s = seed ?? hashSeed(`${hand}|${children}|${correction ?? ''}`);
  const paths = React.useMemo(() => gribouillis(s, [...children].length), [s, children]);
  const R = rng(s ^ 0x5bd1e995);
  const dessus = fixPlace === 'dessus';
  const { lift, reach } = placeCorrection(hand);
  // la correction est jetée un peu de travers, légèrement décalée vers la droite
  const fixStyle = {
    ...handStyle(hand, 'annotation', fixInk),
    // interligne nul : la ligne de base de la correction tombe sur celle du mot raturé
    ...(dessus ? { lineHeight: 0 } : null),
    '--gc-rot': `${r2(dessus ? R.range(-4, 1.5) : R.range(-3, 2))}deg`,
    '--gc-dx': `${r2(dessus ? R.range(0, 0.25) : 0)}em`,
  } as React.CSSProperties;
  const rootStyle =
    dessus && correction
      ? ({ '--gc-rature-reach': reach, '--gc-rature-lh': `var(--gc-lh-${hand})`, '--gc-rature-lift': `${lift}em` } as React.CSSProperties)
      : undefined;
  return (
    <span className={`gc-rature gc-rature--${correction ? fixPlace : 'seule'}`} style={rootStyle}>
      <span className="gc-rature__base">
        <span className="gc-ancre" aria-hidden="true">
          <svg
            className="gc-rature__gribouillis"
            viewBox={`0 0 ${SCRIBBLE_VIEW.w} ${SCRIBBLE_VIEW.h}`}
            preserveAspectRatio="none"
            focusable="false"
            style={ink ? { color: inkVar(ink) } : undefined}
          >
            {paths.map((d, i) => (
              <path key={i} className={i ? 'gc-rature__retour' : 'gc-rature__boucles'} d={d} />
            ))}
          </svg>
        </span>
        <del className="gc-rature__barre">{handText(children, hand)}</del>
      </span>
      {correction ? (
        <span className="gc-rature__place">
          <ins className="gc-rature__correction" style={fixStyle}>
            {handText(correction, hand)}
          </ins>
        </span>
      ) : null}
    </span>
  );
}
