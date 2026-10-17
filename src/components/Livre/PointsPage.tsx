import React from 'react';

export interface PointsPageProps {
  /** Page cadrée de la double page (cadrage « page »). */
  cote: 'gauche' | 'droite';
  onChoisir: (cote: 'gauche' | 'droite') => void;
}

// Deux petits ronds tracés à la main, sous la page : lequel des deux côtés de la double page est à
// l'écran (cadrage « page »). Plein : la page affichée ; cerclé : l'autre. Chaque rond est un bouton
// (cible de 44 px au doigt) qui y fait glisser la caméra.
const ROND = {
  gauche: 'M12.1 6.4c3.2-.3 5.9 2.4 5.8 5.7-.1 3.1-2.7 5.7-5.9 5.6-3.1-.1-5.6-2.6-5.5-5.8.1-2.9 2.6-5.3 5.6-5.5z',
  droite: 'M11.6 6.2c3.4 0 6.2 2.5 6 5.9-.2 3-2.9 5.6-6 5.5-3.2-.2-5.5-2.9-5.3-6 .2-3 2.4-5.4 5.3-5.4z',
};

export function PointsPage({ cote, onChoisir }: PointsPageProps) {
  return (
    <div className="gc-livre-points" role="group" aria-label="Page de la double page">
      {(['gauche', 'droite'] as const).map((c) => (
        <button
          key={c}
          type="button"
          className={`gc-livre-points__point${c === cote ? ' gc-livre-points__point--actif' : ''}`}
          aria-label={c === 'gauche' ? 'Page de gauche' : 'Page de droite'}
          aria-current={c === cote ? 'page' : undefined}
          onClick={() => onChoisir(c)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path className="gc-livre-points__ombre" d={ROND[c]} />
            <path className="gc-livre-points__rond" d={ROND[c]} />
          </svg>
        </button>
      ))}
    </div>
  );
}
