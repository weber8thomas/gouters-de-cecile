import React from 'react';
import './PetitMot.css';

export interface PetitMotProps {
  /** Le petit mot pour Cécile (≤ 120 caractères). */
  note: string;
  /** Prénom ou signature de l'invité, ex. « Julie ». */
  signature: string;
  /** Encre du stylo : `night` (bleu nuit, par défaut) ou `chocolat`. */
  ink?: 'night' | 'chocolat';
  className?: string;
}

/** Trois points posés à la plume, en séparation au-dessus du mot. */
const Dots = () => (
  <svg className="gc-petitmot__dots" viewBox="0 2 96 12" aria-hidden="true" focusable="false">
    <path d="M13.6 4.4C16.4 4.2 18.6 6.4 18.4 8.8C18.2 11.4 15.8 12.8 13.4 12.4C10.8 12 9.4 9.6 10 7.4C10.4 5.8 11.8 4.6 13.6 4.4Z" />
    <path d="M48.4 3.4C51.4 3.4 53.8 5.8 53.6 8.6C53.4 11.6 50.8 13.2 48 12.8C45.2 12.4 43.6 10 44.2 7.4C44.6 5.4 46.2 3.6 48.4 3.4Z" />
    <path d="M82.2 4.8C85 4.8 86.8 7 86.4 9.4C86 11.8 83.6 12.8 81.4 12.2C79.2 11.6 78.2 9.4 78.8 7.4C79.4 5.8 80.6 4.8 82.2 4.8Z" />
  </svg>
);

/** Petit cœur tracé d'un geste, avec un lavis rose légèrement décalé. */
const Heart = () => (
  <svg className="gc-petitmot__heart" viewBox="0 0 44 40" aria-hidden="true" focusable="false">
    <path className="gc-petitmot__heart-wash" d="M22.6 35.4C14.6 30 6.6 23.8 7.2 15.4C7.6 9.4 13.4 6.6 18 9.2C20.4 10.6 21.8 12.6 22.6 14.6C23.6 12 25.6 9.6 29 8.8C34 7.6 38.2 11.2 37.6 16.6C36.8 24.4 29 30 22.6 35.4Z" />
    <path className="gc-petitmot__heart-line" d="M20.8 33.6C12.8 28.2 4.6 21.6 5.2 13.4C5.6 7.6 11.2 4.6 15.8 7.2C18.4 8.6 19.8 10.8 20.6 12.8C21.6 10.2 23.6 7.6 27.2 6.6C32.2 5.4 36.6 8.8 36.2 14.4C35.6 22.2 27.6 28 21.4 34.4C20.6 35.2 19.8 36 19 36.8" />
  </svg>
);

export function PetitMot({ note, signature, ink = 'night', className }: PetitMotProps) {
  const classes = ['gc-petitmot', `gc-petitmot--${ink}`, className].filter(Boolean).join(' ');
  return (
    <figure className={classes}>
      <Dots />
      {/* La signature flotte à droite à la suite du texte : elle se pose au bout de la dernière
          ligne quand il y reste de la place, sinon elle passe dessous, toujours alignée à droite. */}
      <blockquote className="gc-petitmot__note gc-hand-note">
        <p className="gc-petitmot__text">
          {note}
          <span className="gc-petitmot__signature">
            <span className="gc-petitmot__name gc-hand-signature">{signature}</span>
            <Heart />
          </span>
        </p>
      </blockquote>
    </figure>
  );
}
