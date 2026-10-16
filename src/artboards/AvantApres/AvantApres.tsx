// Avant / maintenant : la double page de Julie telle qu'elle était (polices posées sur un papier
// généré, SpecimenJulie) et telle qu'elle est maintenant (pages cuites : vrai papier ancien scanné,
// écriture générée trait par trait, encre bue par le papier). Même cran, même table, même échelle.
import React from 'react';
import { Stage } from '../../components/Stage';
import { DoublePage } from '../../components/DoublePage';
import type { Distance } from '../../lib/settings';
import { SpecimenJulie } from '../SpecimenJulie/SpecimenJulie';
import { JulieDroiteCuite, JulieGaucheCuite } from '../DemoCarnet/spreads';
import './AvantApres.css';

/** La double page de Julie cuite, posée sur la table (cloche figée). */
export function JulieCuiteSurTable({ distance = 'moyenne', playing = false, progress = 0 }: { distance?: Distance; playing?: boolean; progress?: number }) {
  return (
    <Stage table="bois" distance={distance}>
      <DoublePage folios={[12, 13]} dogEars={['br']} left={<JulieGaucheCuite playing={playing} progress={progress} />} right={<JulieDroiteCuite />} />
    </Stage>
  );
}

export interface AvantApresProps {
  /** Une seule des deux scènes, en 1920 × 1080 (cartes, captures). */
  seul?: 'avant' | 'maintenant';
  distance?: Distance;
}

export function AvantApres({ seul, distance = 'moyenne' }: AvantApresProps) {
  if (seul === 'maintenant') return <JulieCuiteSurTable distance={distance} />;
  if (seul === 'avant') return <SpecimenJulie distance={distance} playing={false} progress={0} />;
  return (
    <div className="gc-avap">
      <figure className="gc-avap__col">
        <figcaption className="gc-recipe-title gc-avap__etiquette">Avant</figcaption>
        <div className="gc-avap__cadre">
          <div className="gc-avap__echelle">
            <SpecimenJulie distance={distance} playing={false} progress={0} />
          </div>
        </div>
      </figure>
      <figure className="gc-avap__col">
        <figcaption className="gc-recipe-title gc-avap__etiquette gc-avap__etiquette--maintenant">Maintenant</figcaption>
        <div className="gc-avap__cadre">
          <div className="gc-avap__echelle">
            <JulieCuiteSurTable distance={distance} />
          </div>
        </div>
      </figure>
    </div>
  );
}

export default AvantApres;
