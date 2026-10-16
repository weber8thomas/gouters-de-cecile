// Pièces communes des planches « Choix » (ChoixEcriture, ChoixPapier, ChoixAquarelle, ChoixMouvement) :
// des planches de comparaison très lisibles pour faire valider la direction artistique d'un coup d'œil.
// Chaque option porte une grosse lettre (Playfair, « imprimé ») dans une pastille et une phrase simple
// (Caveat, la main de Cécile), sur une étiquette de papier posée sur la table, comme l'étiquette de la
// couverture du carnet. Aucun texte directement sur la table.
import React from 'react';
import { Stage } from '../../components/Stage';
import { cssUrl } from '../../lib/assets';
import { SettingsContext, useSettings, type Distance, type TableKind } from '../../lib/settings';
import './planche.css';

export type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** Étiquette de papier collée sur la table : papier crème, double filet terracotta, posée de biais. */
export function Etiquette({ tilt = 0, className, style, children }: { tilt?: number; className?: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  return (
    <div
      className={['gc-choix-etiquette', className].filter(Boolean).join(' ')}
      style={{ '--gc-choix-tilt': `${tilt}deg`, '--gc-choix-tex': cssUrl('paper/base'), ...style } as Vars}
    >
      {children}
    </div>
  );
}

/** La grosse lettre d'une option, dans une pastille de papier cerclée de terracotta. */
export function Pastille({ lettre, grande = false }: { lettre: string; grande?: boolean }) {
  return (
    <span className={`gc-choix-pastille${grande ? ' gc-choix-pastille--grande' : ''}`} aria-hidden="true">
      <span className={`${grande ? 'gc-cover-title' : 'gc-chapter-title'} gc-choix-pastille__lettre`}>{lettre}</span>
    </span>
  );
}

export interface ChoixProps {
  lettre: string;
  /** La phrase simple qui décrit l'option. */
  children: React.ReactNode;
  /** 'ligne' : pastille à gauche, phrase à droite ; 'colonne' : pastille au-dessus (étiquette étroite). */
  sens?: 'ligne' | 'colonne';
  tilt?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Une option : grosse lettre + phrase, sur une étiquette. */
export function Choix({ lettre, children, sens = 'ligne', tilt = 0, className, style }: ChoixProps) {
  return (
    <Etiquette tilt={tilt} className={['gc-choix-option', `gc-choix-option--${sens}`, className].filter(Boolean).join(' ')} style={style}>
      <Pastille lettre={lettre} />
      <p className={`${sens === 'colonne' ? 'gc-hand-caption' : 'gc-hand-note'} gc-choix-option__phrase`}>
        <span className="gc-choix-sr">{`${lettre} : `}</span>
        {children}
      </p>
    </Etiquette>
  );
}

export interface PlancheProps {
  table: TableKind;
  /** Cran de distance de la scène (géométrie des pages et hauteurs d'x). */
  distance?: Distance;
  /** La question, en toutes lettres (en gras). */
  question: React.ReactNode;
  /** Ce qu'il faut savoir avant de répondre (sous la question). */
  detail?: React.ReactNode;
  /** Ce qu'on attend comme réponse (« Répondez A ou B »). */
  aide?: React.ReactNode;
  /**
   * Lumière de la scène (voile doré en haut à gauche, ombre dans le coin opposé). À couper quand on compare
   * des couleurs d'un bout à l'autre de la planche : sinon l'option de gauche paraît plus claire.
   */
  lumiere?: boolean;
  /** La question et l'aide sur une seule ligne (planche très remplie). */
  enLigne?: boolean;
  /** Placement de l'étiquette de la question (px de scène). */
  questionStyle?: React.CSSProperties;
  questionTilt?: number;
  children?: React.ReactNode;
  className?: string;
}

/** Une planche : la table (bois ou nappe), l'étiquette de la question, puis le contenu posé librement. */
export function Planche({ table, distance = 'moyenne', question, detail, aide, lumiere = true, enLigne = false, questionStyle, questionTilt = -0.6, children, className }: PlancheProps) {
  return (
    <Stage table={table} distance={distance} className={['gc-choix-stage', !lumiere && 'gc-choix-stage--sans-lumiere', className].filter(Boolean).join(' ')}>
      <div className="gc-choix">
        <Etiquette tilt={questionTilt} className={`gc-choix-question${enLigne ? ' gc-choix-question--ligne' : ''}`} style={questionStyle}>
          <p className="gc-hand-signature gc-choix-question__texte">{question}</p>
          {detail && <p className="gc-hand-note gc-choix-question__detail">{detail}</p>}
          {aide && <p className="gc-hand-caption gc-choix-question__aide">{aide}</p>}
        </Etiquette>
        {children}
      </div>
    </Stage>
  );
}

export interface ReductionProps {
  /** Coin haut gauche (px de scène). */
  x: number;
  y: number;
  /** Échelle (0,5 = mi-échelle). */
  s: number;
  /** Taille naturelle du contenu (longueurs CSS, par ex. 'var(--gc-page-w)'). */
  w: string;
  h: string;
  /** Cran de distance propre à ce contenu (géométrie et tailles d'écriture). */
  distance?: Distance;
  tilt?: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Un contenu à sa taille naturelle (une page, une double page), réduit à l'échelle `s` et posé en (x, y).
 * Les composants mesurent avec offsetWidth/offsetHeight : la réduction (transform) ne les trouble pas.
 */
export function Reduction({ x, y, s, w, h, distance, tilt = 0, className, children }: ReductionProps) {
  const parent = useSettings();
  const value = React.useMemo(() => (distance ? { ...parent, distance } : parent), [parent, distance]);
  return (
    <div
      className={['gc-choix-reduction', className].filter(Boolean).join(' ')}
      data-gc-distance={distance}
      style={{ left: x, top: y, width: `calc(${w} * ${s})`, height: `calc(${h} * ${s})`, '--gc-choix-tilt': `${tilt}deg` } as Vars}
    >
      <div className="gc-choix-reduction__nature" style={{ width: w, height: h, transform: `scale(${s})` }}>
        <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
      </div>
    </div>
  );
}
