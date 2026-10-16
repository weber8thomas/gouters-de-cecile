// La double page de Julie cuite, posée sur la table en bois (vrai papier ancien scanné, écriture
// générée trait par trait, encre bue par le papier).
//
// La carte « Avant / maintenant » est retirée (plan v3 : l'« avant », SpecimenJulie, n'existe plus).
// Ce module reste seulement parce que la carte PageCuite (src/components/PageCuite/preview.html)
// rend Artboards.AvantApres avec { seul: 'maintenant' } : il n'a plus de carte à lui. À supprimer
// quand cette carte rendra sa propre scène.
import React from 'react';
import { Stage } from '../../components/Stage';
import { DoublePage } from '../../components/DoublePage';
import type { Distance } from '../../lib/settings';
import { JulieDroiteCuite, JulieGaucheCuite } from '../DemoCarnet/spreads';

/** La double page de Julie cuite, posée sur la table. */
export function JulieCuiteSurTable({ distance = 'moyenne' }: { distance?: Distance }) {
  return (
    <Stage distance={distance}>
      <DoublePage folios={[12, 13]} dogEars={['br']} left={<JulieGaucheCuite />} right={<JulieDroiteCuite />} />
    </Stage>
  );
}

export interface AvantApresProps {
  /** Ancien choix de scène : seul « maintenant » existe encore (valeur acceptée, sans effet). */
  seul?: 'maintenant';
  distance?: Distance;
}

export function AvantApres({ distance = 'moyenne' }: AvantApresProps) {
  return <JulieCuiteSurTable distance={distance} />;
}

export default AvantApres;
