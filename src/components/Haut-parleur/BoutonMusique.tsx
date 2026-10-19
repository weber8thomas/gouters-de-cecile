// Bouton musique : allume ou éteint la musique de fond (réglage « musiqueActive », src/lib/musique.ts). Il
// ne touche pas aux autres sons, que le haut-parleur coupe d'un coup. Posé par l'Ecran dans sa barre du haut,
// à côté du haut-parleur. Une note tracée à la main ; une barre la traverse quand la musique est éteinte.
// aria-pressed : vrai quand la musique joue. Allumer rejoue le choix du menu, ou toute la liste en
// rotation (« toutes ») si aucun n'a été choisi (« aucune »).
import React from 'react';
import { useReglages } from '../../lib/reglages';
import './BoutonMusique.css';

// Une note double (deux têtes, deux hampes et un ruban), avec un second passage au crayon ; la barre
// n'est tracée que quand la musique est éteinte.
const NOTE = {
  tetes: ['M9 26.8c0-1.9 1.8-3.1 4.2-3.1s4.2 1.2 4.2 3.1s-1.8 3.1-4.2 3.1s-4.2-1.2-4.2-3.1z', 'M20.2 22.9c0-1.9 1.8-3.1 4.2-3.1s4.2 1.2 4.2 3.1s-1.8 3.1-4.2 3.1s-4.2-1.2-4.2-3.1z'],
  hampes: ['M17.2 26.6c.1-4.4.1-8.9.1-13.2', 'M28.4 22.8c.1-3.6.1-7.2.1-10.8'],
  ruban: 'M17.3 13.4c3.6.9 7.4.9 11.2-1.4',
  repasse: ['M10.4 25.4c.9-.9 2.2-1.3 3.5-1.1', 'M21.6 21.5c.9-.9 2.2-1.3 3.5-1.1'],
  barre: 'M9.4 9.6c6.9 7.3 13.9 14.8 21 22.4',
};

export function BoutonMusique() {
  const [r, changer] = useReglages();
  const jouee = r.musiqueActive;
  return (
    <button
      type="button"
      className="gc-musique"
      data-gc-controle="musique"
      aria-label="Musique"
      aria-pressed={jouee}
      onClick={() => changer((x) => (x.musiqueActive
        ? { musiqueActive: false }
        : { musiqueActive: true, musique: x.musique === 'aucune' ? 'toutes' : x.musique }))}
    >
      <svg className="gc-musique__trace" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <g className="gc-musique__ombre">
          {NOTE.tetes.map((d) => <path key={d} d={d} />)}
          {NOTE.hampes.map((d) => <path key={d} d={d} />)}
          <path d={NOTE.ruban} />
          {!jouee && <path d={NOTE.barre} />}
        </g>
        <g className="gc-musique__encre">
          {NOTE.tetes.map((d) => <path key={d} d={d} />)}
          {NOTE.hampes.map((d) => <path key={d} d={d} />)}
          <path d={NOTE.ruban} />
          {NOTE.repasse.map((d) => <path key={d} className="gc-musique__repasse" d={d} />)}
          {!jouee && <path className="gc-musique__barre" d={NOTE.barre} />}
        </g>
      </svg>
    </button>
  );
}

export default BoutonMusique;
