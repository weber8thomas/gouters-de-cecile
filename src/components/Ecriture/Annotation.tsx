import React from 'react';
import type { HandId, InkId } from '../../content/types';
import type { HandRole } from '../../lib/hands';
import { Ecriture, TRAIT_K, encre } from './Ecriture';
import { fleche } from './traits';
import { hashSeed, r2 } from './rng';
import './Ecriture.css';

export interface AnnotationProps {
  /** Petit mot écrit dans un blanc de la page (balisage permis). */
  text: string;
  hand: HandId;
  /** Encre ; sans encre, `gc-ink`. */
  ink?: InkId;
  /** Flèche tracée à la main vers ce qui est annoté. */
  arrow?: 'courbe' | 'droite';
  /** Inclinaison du mot en degrés (de −8 à 8 : on écrit de biais dans la marge). */
  tilt?: number;
  /**
   * Pointe de la flèche, en px, depuis le point de départ : bord gauche ou droit du texte
   * (à mi-hauteur) si |x| domine, sinon bord haut ou bas (au milieu). Défaut : { x: -56, y: 14 }.
   */
  to?: { x: number; y: number };
  /** Rôle (hauteur d'x visée) : `annotation` par défaut. */
  role?: HandRole;
  seed?: number;
  className?: string;
  /** Placement par le parent (position absolue, left/top…). */
  style?: React.CSSProperties;
}

type Side = 'gauche' | 'droite' | 'haut' | 'bas';

/** Petit mot dans un blanc de la page, avec une flèche tracée à la main. */
export function Annotation({ text, hand, ink, arrow, tilt = 0, to, role = 'annotation', seed, className, style }: AnnotationProps) {
  const s = seed ?? hashSeed(`annotation|${hand}|${text}`);
  const target = to ?? { x: -56, y: 14 };
  const side: Side =
    Math.abs(target.x) >= Math.abs(target.y) * 0.6 ? (target.x < 0 ? 'gauche' : 'droite') : target.y < 0 ? 'haut' : 'bas';
  // La flèche est tracée dans le repère du mot incliné : on contre-tourne la cible pour
  // que la pointe tombe bien sur `to` une fois le mot incliné.
  const a = (-tilt * Math.PI) / 180;
  const local = { x: target.x * Math.cos(a) - target.y * Math.sin(a), y: target.x * Math.sin(a) + target.y * Math.cos(a) };
  const path = React.useMemo(
    () => (arrow ? fleche(s, local, arrow, 10) : null),
    [arrow, s, r2(local.x), r2(local.y)],
  );
  const classes = ['gc-annotation', className].filter(Boolean).join(' ');
  return (
    <span className={classes} style={style}>
      <span className="gc-annotation__corps" style={tilt ? ({ '--gc-tilt': `${tilt}deg` } as React.CSSProperties) : undefined}>
        <Ecriture as="span" hand={hand} ink={ink} role={role} seed={s}>
          {text}
        </Ecriture>
        {path ? (
          <span className={`gc-annotation__depart gc-annotation__depart--${side}`} aria-hidden="true">
            <svg
              className="gc-annotation__fleche"
              width="1"
              height="1"
              focusable="false"
              style={{ color: encre(ink), '--gc-trait-k': TRAIT_K[ink ?? 'ink'] } as React.CSSProperties}
            >
              <path d={path.shaft} />
              <path d={path.head} />
            </svg>
          </span>
        ) : null}
      </span>
    </span>
  );
}
