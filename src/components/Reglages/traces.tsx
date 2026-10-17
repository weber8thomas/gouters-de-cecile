// Tracés faits main du menu de réglages : engrenage à l'encre, cercles de crayon autour du choix actif,
// flèche de marge, croix, signes − et +, réglette. Tous statiques (SVG en ligne, aucun filtre) : un
// trait principal un peu tremblé et, comme un crayon repassé, un second passage plus fin.
import React from 'react';

// Engrenage tracé d'un seul trait (8 dents inégales, le trait revient un peu sur son départ) et son
// moyeu ; le second passage ne reprend qu'un tiers du contour.
const ENGRENAGE = {
  trait: 'M13.5 11.1C13.5 10.7 13.3 9.1 13.5 8.5C13.7 8.0 14.4 8.1 14.8 7.9C15.3 7.7 15.7 7.1 16.2 7.5C16.8 7.8 17.7 9.6 18.2 10.0C18.7 10.4 18.9 9.9 19.3 9.9C19.7 9.9 20.0 10.0 20.4 9.9C20.8 9.8 21.2 9.8 21.7 9.3C22.2 8.8 23.1 7.2 23.6 6.9C24.2 6.5 24.6 7.1 25.1 7.3C25.5 7.5 26.3 7.3 26.5 8.0C26.6 8.7 25.8 10.9 25.8 11.6C25.8 12.3 26.4 12.1 26.7 12.3C27.0 12.5 27.2 12.9 27.6 13.1C27.9 13.3 28.1 13.5 28.8 13.6C29.4 13.7 30.9 13.3 31.4 13.5C32.0 13.7 31.9 14.4 32.1 14.8C32.3 15.2 33.0 15.6 32.7 16.2C32.4 16.7 30.7 17.6 30.3 18.1C30.0 18.6 30.5 18.9 30.5 19.3C30.5 19.7 30.4 20.1 30.5 20.5C30.6 20.9 30.6 21.2 31.1 21.7C31.6 22.3 33.1 23.1 33.4 23.7C33.7 24.3 33.1 24.7 32.9 25.2C32.7 25.6 32.9 26.4 32.2 26.6C31.5 26.7 29.4 25.9 28.6 26.0C27.9 26.0 28.2 26.6 27.9 26.9C27.7 27.2 27.3 27.4 27.1 27.8C26.9 28.1 26.6 28.4 26.6 29.1C26.5 29.8 27.0 31.4 26.8 32.0C26.6 32.6 25.9 32.5 25.5 32.7C25.0 33.0 24.6 33.7 24.0 33.4C23.4 33.0 22.5 31.1 22.0 30.7C21.4 30.3 21.2 30.9 20.7 30.9C20.3 31.0 19.9 30.9 19.5 31.0C19.1 31.1 18.7 31.1 18.2 31.5C17.7 31.9 16.9 33.1 16.3 33.4C15.8 33.6 15.3 33.1 14.9 32.9C14.4 32.7 13.6 32.8 13.5 32.2C13.3 31.5 13.9 29.7 13.8 29.0C13.6 28.4 13.1 28.5 12.8 28.2C12.5 28.0 12.3 27.6 12.0 27.4C11.6 27.1 11.4 26.8 10.7 26.8C10.0 26.7 8.3 27.2 7.7 27.0C7.1 26.8 7.2 26.1 7.0 25.6C6.8 25.1 6.0 24.7 6.4 24.1C6.8 23.5 8.8 22.5 9.3 22.0C9.7 21.4 9.1 21.1 9.1 20.7C9.1 20.3 9.2 19.9 9.1 19.5C9.0 19.1 9.0 18.7 8.7 18.2C8.3 17.7 7.0 16.9 6.8 16.4C6.6 15.8 7.2 15.4 7.4 14.9C7.6 14.5 7.4 13.8 8.1 13.6C8.7 13.4 10.6 14.0 11.2 13.9C11.9 13.8 11.7 13.3 12.0 13.0C12.3 12.8 12.7 12.6 12.9 12.3C13.2 11.9 13.5 11.8 13.5 11.1C13.6 10.5 13.2 9.0 13.4 8.4C13.6 7.8 14.3 7.9 14.7 7.7C15.2 7.5 15.6 6.8 16.1 7.1C16.7 7.4 17.8 9.1 18.1 9.5',
  repasse: 'M33.3 15.9C32.9 16.2 31.4 17.4 31.0 17.9C30.7 18.5 31.1 18.7 31.1 19.2C31.2 19.6 31.1 20.0 31.2 20.4C31.2 20.8 31.0 21.2 31.4 21.7C31.9 22.3 33.5 23.1 33.8 23.7C34.1 24.3 33.5 24.7 33.3 25.2C33.1 25.7 33.3 26.5 32.6 26.6C31.9 26.8 29.8 26.1 29.1 26.2C28.4 26.3 28.6 26.9 28.3 27.2C28.1 27.5 27.7 27.7 27.5 28.0C27.2 28.3 26.8 28.4 26.7 29.1C26.6 29.7 27.1 31.4 26.9 32.0C26.7 32.6 26.0 32.4 25.5 32.6C25.1 32.8 24.7 33.5 24.1 33.2C23.5 32.8 22.6 31.0 22.0 30.6C21.5 30.2 21.2 30.8 20.8 30.8C20.4 30.8 20.0 30.8 19.6 30.8C19.2 30.9 18.9 30.7 18.3 31.1C17.8 31.4 17.1 32.8 16.5 33.1C16.0 33.3 15.5 32.8 15.1 32.6C14.6 32.4 13.9 32.6 13.7 32.0C13.5 31.4 14.0 29.6 13.9 29.0C13.8 28.4 13.2 28.5 12.9 28.2C12.7 27.9 12.3 27.5 12.1 27.3',
  moyeu: 'M22.1 16.8C22.4 17.2 23.3 18.3 23.5 19.1C23.7 19.8 23.7 20.7 23.4 21.4C23.1 22.1 22.4 23.0 21.6 23.3C20.8 23.6 19.7 23.7 18.8 23.5C18.0 23.3 17.1 22.7 16.6 22.0C16.2 21.3 15.9 20.2 16.0 19.3C16.2 18.5 16.7 17.4 17.4 16.9C18.1 16.3 19.2 15.7 20.1 15.8C21.1 15.8 22.3 16.4 22.9 17.1C23.6 17.7 23.8 19.2 24.0 19.6',
  moyeuRepasse: 'M18.6 23.6C18.4 23.4 17.4 22.9 17.0 22.4C16.7 21.9 16.4 21.3 16.4 20.6C16.3 20.0 16.4 19.3 16.6 18.7C16.9 18.1 17.3 17.4 17.8 17.0C18.3 16.6 19.0 16.2 19.7 16.1C20.4 16.0 21.2 16.1 21.9 16.4C22.6 16.6 23.4 17.4 23.7 17.6',
};

/** L'engrenage du bouton ⚙, à l'encre (même facture que les flèches et le plein écran). */
export function Engrenage() {
  return (
    <svg className="gc-reglages__engrenage" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <g className="gc-reglages__ombre">
        <path d={ENGRENAGE.trait} />
        <path d={ENGRENAGE.moyeu} />
      </g>
      <g className="gc-reglages__encre">
        <path d={ENGRENAGE.trait} />
        <path className="gc-reglages__repasse" d={ENGRENAGE.repasse} />
        <path d={ENGRENAGE.moyeu} />
        <path className="gc-reglages__repasse" d={ENGRENAGE.moyeuRepasse} />
      </g>
    </svg>
  );
}

// Trois boucles de crayon (viewBox 120 × 48, étirées sur le mot) : le trait part à l'intérieur, fait
// le tour et dépasse son départ en sortant, comme une main qui entoure un mot sans lever le crayon.
const RONDS = [
  'M17.8 18.2C18.7 17.6 21.2 15.5 23.5 14.3C25.7 13.2 28.2 12.2 31.4 11.2C34.5 10.3 36.9 9.5 42.3 8.7C47.8 7.9 57.2 7.0 63.9 6.5C70.5 6.0 76.8 5.6 82.2 5.6C87.6 5.6 92.1 5.9 96.3 6.5C100.4 7.0 104.1 7.9 107.1 9.1C110.1 10.2 112.5 11.5 114.3 13.4C116.0 15.3 117.2 17.8 117.7 20.5C118.2 23.1 118.1 26.9 117.2 29.3C116.4 31.7 114.8 33.1 112.5 34.8C110.2 36.4 107.3 37.8 103.5 39.1C99.7 40.3 95.4 41.4 89.9 42.3C84.5 43.2 78.5 43.8 70.5 44.4C62.6 44.9 49.5 45.5 42.2 45.5C34.8 45.6 30.9 45.3 26.3 44.8C21.8 44.2 18.1 43.5 15.0 42.4C11.8 41.3 9.3 40.1 7.6 38.4C5.8 36.7 4.7 35.1 4.2 32.4C3.8 29.6 4.0 24.9 4.8 22.1C5.6 19.4 7.2 17.8 9.2 16.0C11.1 14.2 13.6 12.8 16.5 11.4C19.4 10.0 22.6 8.8 26.7 7.8C30.8 6.7 38.7 5.4 41.1 4.9',
  'M10.9 19.0C11.4 18.0 12.4 14.8 13.9 13.2C15.5 11.5 17.5 10.3 20.1 9.1C22.8 8.0 25.8 7.1 29.6 6.4C33.5 5.7 36.8 5.2 43.3 5.1C49.8 5.0 61.4 5.3 68.5 5.7C75.7 6.1 81.3 6.7 86.4 7.5C91.5 8.3 95.4 9.3 99.0 10.5C102.6 11.6 105.6 12.9 108.1 14.5C110.5 16.0 112.6 17.3 113.9 19.6C115.2 22.0 116.1 26.0 116.1 28.6C116.1 31.2 115.5 33.5 114.0 35.4C112.6 37.3 110.3 38.6 107.4 39.8C104.4 41.0 100.7 41.8 96.3 42.5C92.0 43.1 88.0 43.5 81.5 43.6C75.0 43.8 65.0 43.6 57.4 43.3C49.8 43.1 41.9 42.7 35.9 42.1C29.9 41.6 25.7 41.0 21.4 40.1C17.1 39.2 13.3 38.1 10.3 36.7C7.3 35.3 4.8 33.8 3.2 31.6C1.6 29.3 0.8 26.4 0.7 23.4C0.7 20.4 1.4 16.1 2.8 13.6C4.1 11.0 6.1 9.5 8.7 8.0C11.3 6.4 14.4 5.1 18.4 4.1C22.4 3.0 30.1 2.2 32.4 1.8',
  'M23.7 13.2C24.9 12.7 27.8 11.0 30.8 10.1C33.8 9.2 36.4 8.4 41.7 7.8C47.0 7.2 56.1 6.7 62.7 6.5C69.2 6.3 75.8 6.3 81.1 6.5C86.4 6.7 90.5 7.1 94.5 7.8C98.5 8.5 102.0 9.3 105.1 10.4C108.1 11.5 110.8 12.8 112.8 14.4C114.8 16.1 116.3 18.0 117.0 20.6C117.8 23.1 117.9 27.4 117.3 29.8C116.6 32.3 115.2 33.6 113.2 35.2C111.2 36.8 108.4 38.2 105.0 39.4C101.7 40.6 97.8 41.6 93.0 42.4C88.2 43.2 83.8 43.9 76.2 44.4C68.6 44.9 55.2 45.3 47.4 45.3C39.7 45.4 34.7 45.1 29.7 44.6C24.7 44.1 20.8 43.3 17.5 42.2C14.2 41.2 11.8 39.9 10.0 38.3C8.2 36.8 7.2 35.4 6.5 33.0C5.9 30.6 5.9 26.7 6.3 24.0C6.6 21.3 7.4 19.0 8.6 16.9C9.8 14.9 11.3 13.4 13.4 11.9C15.5 10.4 18.0 9.0 21.3 7.9C24.6 6.7 28.1 5.6 33.3 4.8C38.4 4.0 48.9 3.3 52.0 3.0',
];

/** Le choix actif entouré d'un trait de crayon (variante n, pour que deux cercles ne se ressemblent pas). */
export function Entoure({ n }: { n: number }) {
  return (
    <svg className="gc-reglages__entoure" viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={RONDS[((n % RONDS.length) + RONDS.length) % RONDS.length]} />
    </svg>
  );
}

/** Petite flèche de crayon dans la marge rouge : la ligne où l'on est. */
export function FlecheMarge() {
  return (
    <svg className="gc-reglages__marque" viewBox="0 0 44 24" aria-hidden="true" focusable="false">
      <path d="M3.5 12.8c6.4-.9 14.8-1.2 30.6-.4" />
      <path d="M26.4 5.2c3.2 2.3 6.2 4.6 9.6 7.3-3.3 2.2-6.6 4.6-9.9 7.5" />
    </svg>
  );
}

/** Croix de fermeture, deux traits qui ne se croisent pas tout à fait au milieu. */
export function Croix() {
  return (
    <svg className="gc-reglages__signe" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M8.6 8.2c4.6 4.9 9.6 10.3 15.2 15.9" />
      <path d="M23.6 7.6c-5.3 5.2-10.4 10.7-15.4 16.6" />
    </svg>
  );
}

/** Signes − et + du zoom fin. */
export function Signe({ plus }: { plus?: boolean }) {
  return (
    <svg className="gc-reglages__signe" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d={plus ? 'M7 16.4c5.8-.5 11.8-.6 18-.1' : 'M7.2 16.6c5.6-.7 11.6-.8 17.6-.2'} />
      {plus && <path d="M16.3 7.4c-.4 5.9-.3 11.7.2 17.6" />}
    </svg>
  );
}

/** Petit chevron d'une liste qui se déplie (tourné d'un quart quand elle est ouverte). */
export function Chevron() {
  return (
    <svg className="gc-reglages__chevron" viewBox="0 0 28 32" aria-hidden="true" focusable="false">
      <path d="M9.5 6.5c3.4 3 6.4 6 9.3 9.4-3 3.3-6.1 6.4-9.6 9.3" />
    </svg>
  );
}

/** Trait de crayon tiré à main levée (souligné, réglette). Étiré sur la largeur, épaisseur constante. */
export function TraitCrayon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M2 6.6c24-.8 51-.2 77-.9 27-.7 52 .3 79-.2 26-.5 54 .6 79-.3 21-.6 41-.2 61 .3" />
    </svg>
  );
}

/** Pâté d'encre du curseur de la réglette. */
export function Pate() {
  return (
    <svg className="gc-reglages__pate" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12.6 4.2c4.3.2 7.6 3.6 7.4 7.9-.2 4.4-3.8 7.9-8.2 7.7-4.2-.2-7.4-3.8-7.2-8 .2-4.1 3.6-7.8 8-7.6z" />
    </svg>
  );
}
