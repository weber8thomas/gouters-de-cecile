// Bouton loupe (plan v4, lot B) : en haut à droite de l'écran, à gauche du plein écran. À 1×, une
// loupe tracée à l'encre (même facture que le plein écran et l'engrenage) ; zoomé, une étiquette de
// papier où le facteur est écrit à la main (« 150 % »), lisible sur le papier comme sur le bois.
// Un toucher bascule 1× ↔ 2×.
import React from 'react';
import { LOUPE_ZOOME } from '../../lib/loupe';
import './Loupe.css';

export interface BoutonLoupeProps {
  /** Facteur au repos (1 à 3). */
  z: number;
  /** Toucher, clic, Entrée : 1× ↔ 2×. */
  onBasculer: () => void;
  className?: string;
}

// Lentille d'un seul trait qui dépasse un peu son départ, manche doublé, reflet au crayon.
const LOUPE = {
  lentille: 'M16.4 7.1c5.4-.4 9.9 3.6 10.1 9.1.2 5.3-3.9 9.8-9.3 10-5.3.2-9.6-3.8-9.9-9.1-.3-5.1 3.3-9.4 8.2-10 1.1-.1 2-.1 3.1.1',
  manche: ['M24.4 24.2c2.6 2.4 5.1 4.9 7.5 7.6', 'M25.7 23.1c2.5 2.6 5 5.1 7.4 7.5'],
  repasse: ['M9.1 12.6c1.4-2.6 3.9-4.5 6.9-5', 'M24.9 23.4c2.7 2.7 5.4 5.3 7.9 7.9'],
  reflet: 'M12.4 14.2c.5-1.6 1.7-2.8 3.3-3.3',
};

/** Facteur écrit comme en français : « 150 % » (espace fine insécable). */
export const textePourcent = (z: number): string => `${Math.round(z * 100)} %`;

export function BoutonLoupe({ z, onBasculer, className }: BoutonLoupeProps) {
  const zoome = z > LOUPE_ZOOME;
  const cls = ['gc-loupe-bouton', zoome && 'gc-loupe-bouton--zoome', className].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={cls}
      data-gc-loupe-bouton={zoome ? 'zoome' : 'repos'}
      data-gc-controle="loupe"
      aria-label={zoome ? `Loupe à ${textePourcent(z)} : revenir à 100 %` : 'Loupe : agrandir'}
      aria-pressed={zoome}
      onClick={onBasculer}
    >
      {zoome ? (
        <span className="gc-loupe-bouton__etiquette" aria-hidden="true">{textePourcent(z)}</span>
      ) : (
        <svg className="gc-loupe-bouton__trace" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
          <g className="gc-loupe-bouton__ombre">
            <path d={LOUPE.lentille} />
            {LOUPE.manche.map((d) => <path key={d} d={d} />)}
          </g>
          <g className="gc-loupe-bouton__encre">
            <path d={LOUPE.lentille} />
            {LOUPE.manche.map((d) => <path key={d} d={d} />)}
            {LOUPE.repasse.map((d) => <path key={d} className="gc-loupe-bouton__repasse" d={d} />)}
            <path className="gc-loupe-bouton__reflet" d={LOUPE.reflet} />
          </g>
        </svg>
      )}
    </button>
  );
}

export default BoutonLoupe;
