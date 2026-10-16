// Gabarit « page vidéo » : à gauche la vidéo de l'invité dans l'écrin de son chapitre,
// à droite sa recette manuscrite puis son petit mot pour Cécile.
import React from 'react';
import { Stage } from '../../components/Stage';
import { DoublePage, type Stain } from '../../components/DoublePage';
import { Ecrin } from '../../components/Ecrin';
import { SceneVideo } from '../../components/SceneVideo';
import { Recette } from '../../components/Recette';
import { PetitMot } from '../../components/PetitMot';
import { getGuest } from '../../content';
import type { IdleLook, TableKind } from '../../lib/settings';
import './PageVideo.css';

export interface PageVideoProps {
  guest?: string; // slug d'un invité qui a une vidéo
  table?: TableKind;
  idle?: IdleLook;
  state?: 'idle' | 'playing';
  progress?: number; // 0–1, en lecture
  folios?: [number | null, number | null];
  stains?: Stain[];
  fit?: boolean;
}

export function PageVideo({
  guest = 'julie',
  table,
  idle,
  state = 'idle',
  progress = 0.6,
  folios = [12, 13],
  stains = [{ page: 'left', kind: 'the', x: 120, y: 900, r: 70, seed: 3 }],
  fit,
}: PageVideoProps) {
  const g = getGuest(guest);
  if (!g.video || !g.recipe) throw new Error(`${guest} n'a pas de vidéo ou de recette`);
  const v = g.video;
  return (
    <Stage table={table} idle={idle} fit={fit}>
      <DoublePage
        folios={folios}
        dogEars={['br']}
        stains={stains}
        left={
          <div className="gc-page-video__left">
            <Ecrin
              className="gc-page-video__ecrin"
              type={v.ecrin!}
              variant={v.variant!}
              state={state}
              progress={state === 'playing' ? progress : 0}
              liquid={v.liquid}
              caption={v.caption}
              media={<SceneVideo scene={v.scene!} />}
            />
          </div>
        }
        right={
          <div className="gc-page-video__right">
            <Recette recipe={g.recipe} />
            {g.note && <PetitMot className="gc-page-video__mot" note={g.note} signature={g.signature ?? g.firstName} ink={g.ink} />}
          </div>
        }
      />
    </Stage>
  );
}

export default PageVideo;
