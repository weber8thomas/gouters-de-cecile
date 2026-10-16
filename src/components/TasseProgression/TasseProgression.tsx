import React from 'react';
import type { Liquid } from '../../content/types';
import './TasseProgression.css';

// Tasse-progression : une tasse en porcelaine sur sa soucoupe, qui se remplit au fil de la vidéo
// (à la place d'une barre de lecture). Pleine, elle fume.

export interface TasseProgressionProps {
  /** Avancement de 0 à 1 (borné). */
  progress: number;
  /** Contenu de la tasse : thé (défaut), chocolat ou café au lait. */
  liquid?: Liquid;
  /** Largeur affichée en px ; par défaut var(--gc-cup-size). */
  size?: number;
  className?: string;
}

/** Ancre de la tasse dans sa boîte : centre du bas de la soucoupe (fractions de largeur et de hauteur). */
export const TASSE_ANCHOR = { x: 0.5, y: 0.96 } as const;
/** À partir de ce niveau la tasse est « pleine » : la vapeur apparaît. */
export const TASSE_FULL = 0.98;

// ─── Géométrie (viewBox 120 × 100). Corps en bol super-elliptique : demi-largeur hw·(1 − tᴱ)^(1/E). ───
const VB = '0 0 120 100';
const E = 2.4;
const CUP = { cx: 57, top: 40, bottom: 79, hw: 34 };
const WALL = 3;
const OPEN = { cx: CUP.cx, cy: CUP.top, rx: CUP.hw, ry: 7.5 };
const OPEN_IN = { cx: CUP.cx, cy: CUP.top + 0.6, rx: CUP.hw - 2.6, ry: 6.1 };
const INNER = { top: OPEN_IN.cy, bottom: CUP.bottom - WALL, hw: CUP.hw - WALL };
const SAUCER = { cx: 60, cy: 84, rx: 51, ry: 8.4, thick: 4.4 };
const LEVEL = { full: INNER.top, empty: INNER.bottom }; // y du ménisque : pleine → vide

type Pt = [number, number];
const r2 = (n: number) => Math.round(n * 100) / 100;

// Catmull-Rom → Bézier (même tracé « fait main » que scripts/lib/organic.mjs).
function smooth(points: Pt[], closed = false): string {
  const n = points.length;
  const p = (i: number) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${r2(points[0][0])} ${r2(points[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    d += `C${r2(p1[0] + (p2[0] - p0[0]) / 6)} ${r2(p1[1] + (p2[1] - p0[1]) / 6)} ${r2(p2[0] - (p3[0] - p1[0]) / 6)} ${r2(p2[1] - (p3[1] - p1[1]) / 6)} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}
const ellipsePts = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 16): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(2 * rx)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-2 * rx)} 0Z`;

/** Demi-largeur du bol à la hauteur y (0 hors du bol). */
const bowlHW = (hw: number, top: number, bottom: number, y: number) => {
  const t = Math.min(1, Math.max(0, (y - top) / (bottom - top)));
  return hw * Math.pow(1 - Math.pow(t, E), 1 / E);
};
/** Côté du bol, du haut vers le fond, paramétré pour resserrer les points dans l'arrondi. */
function bowlSide(hw: number, top: number, bottom: number, sign: 1 | -1, n = 12): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const th = ((Math.PI / 2) * i) / n;
    return [CUP.cx + sign * hw * Math.pow(Math.cos(th), 2 / E), top + (bottom - top) * Math.pow(Math.sin(th), 2 / E)];
  });
}
const outerL = bowlSide(CUP.hw, CUP.top, CUP.bottom, -1);
const outerR = bowlSide(CUP.hw, CUP.top, CUP.bottom, 1);
const innerL = bowlSide(INNER.hw, INNER.top, INNER.bottom, -1);
const innerR = bowlSide(INNER.hw, INNER.top, INNER.bottom, 1);
const front = ellipsePts(OPEN.cx, OPEN.cy, OPEN.rx, OPEN.ry, 0, Math.PI); // arc avant du bord, droite → gauche

const PATHS = {
  tableShadow: ellipse(SAUCER.cx + 7, 94.6, 50, 4.2),
  saucerBand: `${smooth(ellipsePts(SAUCER.cx, SAUCER.cy, SAUCER.rx, SAUCER.ry, 0, Math.PI))}L${smooth(ellipsePts(SAUCER.cx, SAUCER.cy + SAUCER.thick, SAUCER.rx - 1.5, SAUCER.ry - 0.4, Math.PI, 0)).slice(1)}Z`,
  saucerBottom: smooth(ellipsePts(SAUCER.cx, SAUCER.cy + SAUCER.thick, SAUCER.rx - 1.5, SAUCER.ry - 0.4, 0.05, Math.PI - 0.05)),
  saucerTop: ellipse(SAUCER.cx, SAUCER.cy, SAUCER.rx, SAUCER.ry),
  saucerWell: ellipse(SAUCER.cx, SAUCER.cy - 0.4, 26, 4.4),
  saucerFilet: ellipse(SAUCER.cx, SAUCER.cy, SAUCER.rx - 6, SAUCER.ry - 1.1),
  cupShadow: ellipse(CUP.cx + 7, SAUCER.cy - 1, 23, 4.2),
  foot: `M${CUP.cx - 13} ${CUP.bottom - 3}L${CUP.cx - 15.5} ${CUP.bottom + 4.2}Q${CUP.cx} ${CUP.bottom + 7.4} ${CUP.cx + 15.5} ${CUP.bottom + 4.2}L${CUP.cx + 13} ${CUP.bottom - 3}Z`,
  handle: `${smooth([[CUP.cx + 30, 47], [CUP.cx + 42, 45.5], [CUP.cx + 50, 51], [CUP.cx + 49, 60], [CUP.cx + 39, 67.5], [CUP.cx + 24, 70]])}L${smooth([[CUP.cx + 27, 63.5], [CUP.cx + 37, 61.5], [CUP.cx + 42.5, 57.5], [CUP.cx + 42, 53], [CUP.cx + 37.5, 51.2], [CUP.cx + 31.5, 52.5]]).slice(1)}Z`,
  body: `${smooth([...outerL, ...[...outerR].reverse().slice(1)])}L${smooth(front).slice(1)}Z`,
  bowl: smooth([...outerL, ...[...outerR].reverse().slice(1)]),
  openOuter: ellipse(OPEN.cx, OPEN.cy, OPEN.rx, OPEN.ry),
  openInner: ellipse(OPEN_IN.cx, OPEN_IN.cy, OPEN_IN.rx, OPEN_IN.ry),
  interior: `${smooth([...innerL, ...[...innerR].reverse().slice(1)])}Z`,
  shade: (() => {
    const o = bowlSide(CUP.hw, CUP.top, CUP.bottom, 1).slice(1, 11);
    const i = o.map(([x, y]) => [CUP.cx + (x - CUP.cx) * 0.58, y] as Pt).reverse();
    return smooth([...o, ...i], true);
  })(),
  gloss: (() => {
    const ys = [50, 55, 60, 65, 69];
    const o = ys.map((y) => [CUP.cx - bowlHW(CUP.hw, CUP.top, CUP.bottom, y) * 0.8, y] as Pt);
    const i = ys.map((y, k) => [CUP.cx - bowlHW(CUP.hw, CUP.top, CUP.bottom, y) * (0.8 - 0.13 * Math.sin((Math.PI * k) / 4)), y] as Pt).reverse();
    return smooth([...o, ...i.slice(1, -1)], true);
  })(),
  bodyFilet: smooth(ellipsePts(CUP.cx, CUP.top + 5, bowlHW(CUP.hw, CUP.top, CUP.bottom, CUP.top + 5) - 0.3, OPEN.ry - 0.3, 0.06, Math.PI - 0.06)),
  surfaceGloss: smooth(ellipsePts(OPEN_IN.cx - 3, OPEN_IN.cy, OPEN_IN.rx - 7, OPEN_IN.ry - 2.2, Math.PI * 1.08, Math.PI * 1.5, 8)),
  steam: ['M44 31c-5.5-5 4.5-9.5 0-15s-5.5-9 0-14', 'M57.5 29c-5.5-5.5 5.5-10.5 0-16s-5.5-9.5 0-14', 'M71 31c-5.5-5 4.5-9.5 0-15s-5.5-8.5 0-13'],
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function TasseProgression({ progress, liquid = 'the', size, className }: TasseProgressionProps) {
  const p = clamp01(progress);
  const full = p >= TASSE_FULL;
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part: string) => `gc-tasse-${uid}-${part}`;
  // Le ménisque suit le niveau : translation verticale + échelle = largeur intérieure du bol à ce niveau.
  const levelY = LEVEL.empty - p * (LEVEL.empty - LEVEL.full);
  const scale = bowlHW(INNER.hw, INNER.top, INNER.bottom, levelY) / INNER.hw;
  const style = {
    '--p': p,
    '--gc-tasse-s': r2(scale),
    '--gc-tasse-drop': `${r2(LEVEL.empty - LEVEL.full)}px`,
    '--gc-tasse-origin': `${CUP.cx}px ${LEVEL.empty}px`,
    '--gc-tasse-surface-origin': `${OPEN_IN.cx}px ${OPEN_IN.cy}px`,
    ...(size ? { width: `${size}px` } : null),
  } as React.CSSProperties;

  return (
    <div
      className={['gc-tasse', `gc-tasse--${liquid}`, className].filter(Boolean).join(' ')}
      data-liquid={liquid}
      data-full={full ? 'true' : 'false'}
      role="progressbar"
      aria-label="Progression de la vidéo"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      style={style}
    >
      <svg viewBox={VB} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={id('porcelain')} cx="0.35" cy="0.3" r="0.85">
            <stop offset="0" className="gc-tasse__stop-light" />
            <stop offset="0.55" className="gc-tasse__stop-light" />
            <stop offset="1" className="gc-tasse__stop-shade" />
          </radialGradient>
          <linearGradient id={id('body')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className="gc-tasse__stop-shade" />
            <stop offset="0.22" className="gc-tasse__stop-light" />
            <stop offset="0.55" className="gc-tasse__stop-light" />
            <stop offset="1" className="gc-tasse__stop-shade" />
          </linearGradient>
          <clipPath id={id('inside')}>
            <path d={PATHS.interior} />
            <path d={PATHS.openInner} />
          </clipPath>
        </defs>

        <path className="gc-tasse__shadow" d={PATHS.tableShadow} />
        <path className="gc-tasse__shade" d={PATHS.saucerBand} />
        <path d={PATHS.saucerTop} fill={`url(#${id('porcelain')})`} />
        <path className="gc-tasse__well" d={PATHS.saucerWell} />
        <path className="gc-tasse__filet" d={PATHS.saucerFilet} />
        <path className="gc-tasse__ink" d={PATHS.saucerBottom} />
        <path className="gc-tasse__ink" d={PATHS.saucerTop} />
        <path className="gc-tasse__shadow" d={PATHS.cupShadow} />

        <path className="gc-tasse__porcelain gc-tasse__ink" d={PATHS.foot} />
        <path className="gc-tasse__porcelain gc-tasse__ink" d={PATHS.handle} fillRule="evenodd" />
        <path d={PATHS.body} fill={`url(#${id('body')})`} />
        <path className="gc-tasse__shade" d={PATHS.openOuter} />

        <g clipPath={`url(#${id('inside')})`}>
          <rect className="gc-tasse__liquid gc-tasse__column" x={CUP.cx - 40} y={LEVEL.full} width={80} height={LEVEL.empty - LEVEL.full + 2} />
          <g className="gc-tasse__level">
            <g className="gc-tasse__wave">
              <path className="gc-tasse__surface" d={PATHS.openInner} />
              <path className="gc-tasse__surface-gloss" d={PATHS.surfaceGloss} />
            </g>
          </g>
        </g>

        <path className="gc-tasse__porcelain" d={`${PATHS.openOuter} ${PATHS.openInner}`} fillRule="evenodd" />
        <path className="gc-tasse__body-shade" d={PATHS.shade} />
        <path className="gc-tasse__gloss" d={PATHS.gloss} />
        <path className="gc-tasse__filet gc-tasse__filet--body" d={PATHS.bodyFilet} />
        <path className="gc-tasse__ink" d={PATHS.bowl} />
        <path className="gc-tasse__ink gc-tasse__ink--fine" d={PATHS.openInner} />
        <path className="gc-tasse__ink" d={PATHS.openOuter} />

        {full ? (
          <g className="gc-tasse__steam">
            {PATHS.steam.map((d, i) => (
              <path key={i} className={`gc-tasse__volute gc-tasse__volute--${i + 1}`} d={d} pathLength={100} />
            ))}
          </g>
        ) : null}
      </svg>
    </div>
  );
}
