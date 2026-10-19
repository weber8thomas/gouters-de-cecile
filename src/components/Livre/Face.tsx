import React from 'react';
import { Page } from '../Page';
import { LumierePapier } from '../Lumiere';
import { RenderModeContext, type RenderMode, type SpreadSpec } from '../../lib/spread';

export type Cote = 'left' | 'right';

export interface FaceProps {
  spread: SpreadSpec;
  side: Cote;
  mode: RenderMode;
}

// Une face de papier : la même pour un emplacement fixe et pour chaque tranche du feuillet qui
// tourne (le feuillet en montre des copies découpées). Spécimen : surface var(--gc-paper) simple ;
// le vrai papier ancien (autre chantier) se branchera ici, sur .gc-livre-face. Pas de folio : le
// numéro de page est écrit à la main dans les pages cuites.
// Mémoïsée : un changement de caméra ou d'état du livre ne la rend jamais à nouveau.
export const Face = React.memo(function Face({ spread, side, mode }: FaceProps) {
  const content = spread.render(mode)[side];
  return (
    <RenderModeContext.Provider value={mode}>
      <div className={`gc-livre-face gc-livre-face--${side}`} data-gc-spread={spread.id}>
        <Page side={side}>{content}</Page>
        <LumierePapier side={side} />
        <div className="gc-livre-face__pli" aria-hidden="true" />
      </div>
    </RenderModeContext.Provider>
  );
});
