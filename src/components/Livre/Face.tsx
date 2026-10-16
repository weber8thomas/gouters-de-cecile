import React from 'react';
import { Page } from '../Page';
import { useTitleClass } from '../../lib/settings';
import { RenderModeContext, type RenderMode, type SpreadSpec } from '../../lib/spread';

export type Cote = 'left' | 'right';

export interface FaceProps {
  spread: SpreadSpec;
  side: Cote;
  mode: RenderMode;
}

// Une face de papier : la même pour un emplacement fixe et pour chaque tranche du feuillet qui
// tourne (le feuillet en montre des copies découpées). Spécimen : surface var(--gc-paper) simple ;
// le vrai papier ancien (autre chantier) se branchera ici, sur .gc-livre-face.
// Mémoïsée : un changement de caméra ou d'état du livre ne la rend jamais à nouveau.
export const Face = React.memo(function Face({ spread, side, mode }: FaceProps) {
  const folioClass = useTitleClass('folio');
  const content = spread.render(mode)[side];
  const folio = spread.folios?.[side === 'left' ? 0 : 1];
  return (
    <RenderModeContext.Provider value={mode}>
      <div className={`gc-livre-face gc-livre-face--${side}`} data-gc-spread={spread.id}>
        <Page side={side}>{content}</Page>
        {folio != null && <div className={`gc-livre-face__folio gc-livre-face__folio--${side} ${folioClass}`}>{folio}</div>}
        <div className="gc-livre-face__pli" aria-hidden="true" />
      </div>
    </RenderModeContext.Provider>
  );
});
