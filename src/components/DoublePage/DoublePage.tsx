import React from 'react';
import { useTitleClass } from '../../lib/settings';
import { Page } from '../Page';
import { jamStain, teaStain } from './organic';
import './DoublePage.css';

type Side = 'left' | 'right';
type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface Stain {
  /** Page qui porte la tache. */
  page: Side;
  /** 'the' : cerne de tasse ; 'confiture' : goutte et gouttelettes. */
  kind: 'the' | 'confiture';
  /** Centre de la tache, en px depuis le coin haut gauche de la page (896 × 1000). À placer dans les marges. */
  x: number;
  y: number;
  /** Rayon en px (cerne de thé : 60 à 110 ; confiture : 20 à 45). */
  r: number;
  /** Graine du tracé ; par défaut dérivée de x, y, r. */
  seed?: number;
}

export interface DoublePageProps {
  /** Contenu de la page de gauche (placé dans une <Page side="left">). */
  left?: React.ReactNode;
  /** Contenu de la page de droite. */
  right?: React.ReactNode;
  /** Numéros de page [gauche, droite] ; null pour ne rien afficher. */
  folios?: [number | null, number | null];
  /** Coins cornés, côté extérieur : tl/bl sur la page de gauche, tr/br sur celle de droite. */
  dogEars?: Corner[];
  /** Taches discrètes, toujours dans les marges. */
  stains?: Stain[];
  className?: string;
}

const SIDES: Side[] = ['left', 'right'];
const LEAVES = [4, 3, 2, 1];
const LEAF_DY = 2; // débord vertical de chaque feuillet de la tranche (px), cf. DoublePage.css

// Coins cornés : le pli coupe le coin à h px le long du bord haut/bas et à v px le long du bord
// extérieur. Un pli légèrement de biais (h ≠ v) fait un rabat crédible, jamais un carré collé.
const EARS: Record<Corner, { h: number; v: number }> = {
  // la pointe du rabat reste dans la marge : hors de la zone utile et à gauche/droite du folio
  tl: { h: 80, v: 58 },
  tr: { h: 84, v: 60 },
  bl: { h: 52, v: 66 },
  br: { h: 48, v: 64 },
};
const px = (n: number) => `${+n.toFixed(2)}px`;

// Contour d'une feuille : bord haut qui plonge légèrement vers le pli, coins extérieurs coupés
// quand ils sont cornés, bord bas qui remonte vers la reliure de « taper » px (feuillets de la tranche).
// Coordonnées relatives : la taille de page reste celle des tokens.
function sheetClip(side: Side, { top, bottom, taper = 0 }: { top?: Corner; bottom?: Corner; taper?: number } = {}): string {
  const outer = (v: string) => (side === 'left' ? v : `calc(100% - ${v})`);
  const spine = (v: string) => (side === 'left' ? `calc(100% - ${v})` : v);
  const pts: string[] = [];
  if (top) pts.push(`${outer('0px')} ${px(EARS[top].v)}`, `${outer(px(EARS[top].h))} 0px`);
  else pts.push(`${outer('0px')} 0px`);
  // plongée du bord haut vers le pli (≈ 6 px), en douceur
  for (const [s, y] of [[170, 0], [120, 0.5], [80, 1.5], [46, 3], [20, 4.6], [6, 5.6], [0, 6]] as const) pts.push(`${spine(px(s))} ${px(y)}`);
  if (taper) for (const [s, k] of [[0, 1], [14, 0.8], [34, 0.5], [60, 0.22], [96, 0]] as const) pts.push(`${spine(px(s))} calc(100% - ${px(taper * k)})`);
  else pts.push(`${spine('0px')} 100%`);
  if (bottom) pts.push(`${outer(px(EARS[bottom].h))} 100%`, `${outer('0px')} calc(100% - ${px(EARS[bottom].v)})`);
  else pts.push(`${outer('0px')} 100%`);
  return `polygon(${pts.join(', ')})`;
}

// Rabat d'un coin corné : réflexion du coin par rapport au pli. Dessiné dans un repère local
// (origine = coin, X vers l'intérieur de la page, Y vers l'intérieur depuis le bord haut ou bas).
function DogEar({ corner }: { corner: Corner }) {
  const gid = 'gc-book-ear-' + React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { h, v } = EARS[corner];
  const n2 = 1 / (h * h) + 1 / (v * v);
  const P: [number, number] = [2 / h / n2, 2 / v / n2]; // pointe du rabat
  const F: [number, number] = [P[0] / 2, P[1] / 2]; // pied de la pointe sur le pli
  const S = Math.ceil(Math.max(h, v, P[0], P[1]) + 16);
  const right = corner === 'tr' || corner === 'br';
  const bottom = corner === 'bl' || corner === 'br';
  const m = ([x, y]: [number, number]) => `${+(right ? S - x : x).toFixed(2)} ${+(bottom ? S - y : y).toFixed(2)}`;
  const [A, B] = [m([h, 0]), m([0, v])];
  const [p, f] = [m(P), m(F)].map((q) => q.split(' ').map(Number));
  return (
    <svg className={`gc-book__ear gc-book__ear--${corner}`} width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={p[0]} y1={p[1]} x2={f[0]} y2={f[1]}>
          <stop offset="0" className="gc-book__ear-tip" />
          <stop offset="0.55" className="gc-book__ear-mid" />
          <stop offset="0.86" className="gc-book__ear-lit" />
          <stop offset="1" className="gc-book__ear-fold" />
        </linearGradient>
      </defs>
      <path className="gc-book__ear-flap" d={`M${A} L${m(P)} L${B} Z`} fill={`url(#${gid})`} />
      <path className="gc-book__ear-edge" d={`M${A} L${m(P)} L${B}`} />
    </svg>
  );
}

function StainMark({ stain }: { stain: Stain }) {
  const { kind, x, y, r } = stain;
  const seed = stain.seed ?? Math.round(x * 7 + y * 13 + r * 3);
  const box = r * 3;
  const paths = React.useMemo(() => {
    if (kind === 'the') {
      const t = teaStain(r, seed);
      return [
        <path key="w" className="gc-book__stain-wash" d={t.wash} />,
        ...t.soft.map((d, i) => <path key={`s${i}`} className="gc-book__stain-soft" d={d} />),
        ...t.rings.map((d, i) => <path key={`r${i}`} d={d} />),
      ];
    }
    const j = jamStain(r, seed);
    return [<path key="b" d={j.body} />, <path key="e" d={j.rim} fillRule="evenodd" />, <path key="c" className="gc-book__stain-soft" d={j.core} />, ...j.drops.map((d, i) => <path key={`d${i}`} d={d} />)];
  }, [kind, r, seed]);
  return (
    <svg
      className={`gc-book__stain gc-book__stain--${kind}`}
      style={{ left: x - box / 2, top: y - box / 2, width: box, height: box }}
      viewBox={`0 0 ${box} ${box}`}
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
}

// Le livre ouvert posé sur la table : couverture, tranche, deux pages de papier, reliure.
export function DoublePage({ left, right, folios, dogEars = [], stains = [], className }: DoublePageProps) {
  const folioClass = useTitleClass('folio');
  const ears = new Set(dogEars);
  const content = { left, right };
  return (
    <div className={['gc-book', className].filter(Boolean).join(' ')}>
      <div className="gc-book__shadow" aria-hidden="true" />
      <div className="gc-book__board gc-book__board--left" aria-hidden="true" />
      <div className="gc-book__board gc-book__board--right" aria-hidden="true" />
      {SIDES.map((side) => {
        const tc: Corner = side === 'left' ? 'tl' : 'tr';
        const bc: Corner = side === 'left' ? 'bl' : 'br';
        const top = ears.has(tc) ? tc : undefined;
        const bottom = ears.has(bc) ? bc : undefined;
        const folio = folios?.[side === 'left' ? 0 : 1];
        return (
          <div key={side} className={`gc-book__half gc-book__half--${side}`}>
            {LEAVES.map((k) => (
              <div key={k} className={`gc-book__leaf gc-book__leaf--${k}`} style={{ clipPath: sheetClip(side, { taper: k * LEAF_DY }) }} aria-hidden="true" />
            ))}
            <div className={`gc-book__sheet gc-book__sheet--${side}`} style={{ clipPath: sheetClip(side, { top, bottom }) }}>
              {stains.filter((s) => s.page === side).map((s, i) => (
                <StainMark key={i} stain={s} />
              ))}
              <Page side={side}>{content[side]}</Page>
              {folio != null && <div className={`gc-book__folio gc-book__folio--${side} ${folioClass}`}>{folio}</div>}
              <div className="gc-book__shade" aria-hidden="true" />
              {top && <DogEar corner={top} />}
              {bottom && <DogEar corner={bottom} />}
            </div>
          </div>
        );
      })}
      <div className="gc-book__spine" aria-hidden="true" />
    </div>
  );
}
