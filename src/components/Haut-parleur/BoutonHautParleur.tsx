// Bouton haut-parleur : coupe ou rétablit tous les sons du carnet d'un coup (réglage « muet », src/lib/
// reglages.ts ; effet dans src/lib/son.ts et src/lib/ambiance.ts). Posé par l'Ecran dans sa barre du haut,
// à côté de la loupe et du plein écran. Encre tracée à la main : deux ondes quand le son passe, une croix
// quand il est coupé. aria-pressed : vrai quand les sons sont coupés (le libellé ne change pas).
import React from 'react';
import { useReglages } from '../../lib/reglages';
import './BoutonHautParleur.css';

// Un haut-parleur (cône et aimant), deux ondes ; la croix remplace les ondes quand le son est coupé.
const HAUT_PARLEUR = {
  cone: 'M8.2 16.1c1.5-.1 3-.1 4.4 0 1.9-1.8 3.7-3.4 5.5-4.9.1 7.5.1 15 0 22.4-1.9-1.5-3.7-3.1-5.5-4.9-1.4 0-2.9.1-4.4 0-.1-4.2-.1-8.3 0-12.5z',
  repasse: 'M18.4 12.6c.2 3.2.2 6.5 0 9.9',
  ondes: ['M23.2 15.2c1.9 1.7 2.9 3.6 2.9 5.1s-1 3.4-2.9 5.1', 'M27.6 11.4c2.9 2.6 4.4 5.4 4.4 8.8s-1.5 6.2-4.4 8.8'],
  croix: ['M24.6 15.4l9 10.6', 'M33.6 15.4l-9 10.6'],
};

export function BoutonHautParleur() {
  const [r, changer] = useReglages();
  const coupes = r.muet;
  const signe = coupes ? HAUT_PARLEUR.croix : HAUT_PARLEUR.ondes;
  return (
    <button
      type="button"
      className="gc-haut-parleur"
      data-gc-controle="haut-parleur"
      aria-label="Couper tous les sons"
      aria-pressed={coupes}
      onClick={() => changer((x) => ({ muet: !x.muet }))}
    >
      <svg className="gc-haut-parleur__trace" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <g className="gc-haut-parleur__ombre">
          <path d={HAUT_PARLEUR.cone} />
          {signe.map((d) => <path key={d} d={d} />)}
        </g>
        <g className="gc-haut-parleur__encre">
          <path d={HAUT_PARLEUR.cone} />
          <path className="gc-haut-parleur__repasse" d={HAUT_PARLEUR.repasse} />
          {signe.map((d) => <path key={d} d={d} />)}
        </g>
      </svg>
    </button>
  );
}

export default BoutonHautParleur;
