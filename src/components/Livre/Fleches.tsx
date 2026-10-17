import React from 'react';

export interface FlechesProps {
  onPrecedente: () => void;
  onSuivante: () => void;
  debut: boolean;
  fin: boolean;
  /**
   * Où vivent les flèches : sur la table de la scène (TV, défaut), ou dans le calque de contrôles d'un
   * <Ecran> (px d'écran) : groupées en bas à droite (« coin ») ou une de chaque côté du livre (« cotes »,
   * téléphone couché : la table n'a de place qu'à gauche et à droite).
   */
  place?: 'scene' | 'coin' | 'cotes';
}

// Deux flèches tracées à la main, posées sur la table en bas à droite : un trait principal un peu
// tremblé et un second passage décalé, comme un crayon repassé. Jamais symétriques entre elles.
const GAUCHE = {
  trait: 'M37.6 21.4c-4.1-.5-9.3-.2-14.2.1-3.6.2-7.4.4-11.9.1',
  repasse: 'M36.4 22.3c-5.2-.2-10.6 0-16.1.2-2.8.1-5.6 0-8.4-.3',
  pointe: 'M18.2 13.6c-2.6 2.4-5.1 4.6-7.3 7.9 2.2 2.1 4.9 4.6 7.9 7.6',
};
const DROITE = {
  trait: 'M6.3 20.6c4.6.4 9.4.1 14.1-.3 3.9-.3 7.6-.2 11.6.3',
  repasse: 'M7.4 21.7c5.1.1 10.1-.2 15.4-.4 2.9-.1 5.9.1 8.8.5',
  pointe: 'M25.4 12.9c2.9 2.6 5.4 5 7.6 7.9-2.5 2.3-5.1 4.8-8.1 8',
};

function Trace({ d }: { d: typeof GAUCHE }) {
  return (
    <svg className="gc-livre-nav__trace" viewBox="0 0 44 40" aria-hidden="true" focusable="false">
      <g className="gc-livre-nav__ombre">
        <path d={d.trait} />
        <path d={d.pointe} />
      </g>
      <g className="gc-livre-nav__encre">
        <path d={d.trait} />
        <path className="gc-livre-nav__repasse" d={d.repasse} />
        <path d={d.pointe} />
      </g>
    </svg>
  );
}

export function Fleches({ onPrecedente, onSuivante, debut, fin, place = 'scene' }: FlechesProps) {
  const cls = place === 'scene' ? 'gc-livre-nav' : `gc-livre-nav gc-livre-nav--ecran gc-livre-nav--${place}`;
  return (
    <nav className={cls} aria-label="Feuilleter le carnet">
      <button type="button" className="gc-livre-nav__fleche gc-livre-nav__fleche--prec" aria-label="Page précédente" aria-disabled={debut || undefined} onClick={onPrecedente}>
        <Trace d={GAUCHE} />
      </button>
      <button type="button" className="gc-livre-nav__fleche gc-livre-nav__fleche--suiv" aria-label="Page suivante" aria-disabled={fin || undefined} onClick={onSuivante}>
        <Trace d={DROITE} />
      </button>
    </nav>
  );
}
