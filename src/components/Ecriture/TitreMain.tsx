import React from 'react';
import type { HandId, InkId } from '../../content/types';
import { Ecriture } from './Ecriture';
import './Ecriture.css';

export interface TitreMainProps {
  /** Titre de la recette (≤ 23 caractères, une ligne). */
  children: string;
  hand: HandId;
  /** Encre du titre ; `rouge` permis (le rôle `title` dépasse 48 px de corps). */
  ink?: InkId;
  /** Souligné : `regle` (à la règle), `double`, `vague` (à main levée) ou `aucun`. */
  underline?: 'regle' | 'double' | 'vague' | 'aucun';
  /** Encre du souligné (par défaut celle du titre) : le rouge à la règle sous un titre bleu, à l'école. */
  underlineInk?: InkId;
  seed?: number;
  /** Pente de la ligne en degrés (−1,5 à 0,5) ; le souligné la suit. */
  slant?: number;
  as?: 'h2' | 'h3' | 'p' | 'div';
  className?: string;
  style?: React.CSSProperties;
}

/** Titre de recette écrit à la main (rôle `title`), souligné dans l'encre choisie. */
export function TitreMain({ children, hand, ink, underline = 'regle', underlineInk, seed, slant = 0, as = 'h2', className, style }: TitreMainProps) {
  return (
    <Ecriture
      as={as}
      hand={hand}
      ink={ink}
      role="title"
      seed={seed}
      slant={slant}
      souligne={underline === 'aucun' ? undefined : underline}
      souligneInk={underlineInk}
      className={['gc-titremain', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </Ecriture>
  );
}
