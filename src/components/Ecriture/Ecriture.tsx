import React from 'react';
import type { HandId, InkId } from '../../content/types';
import { handStyle, handText, inkVar, type HandRole } from '../../lib/hands';
import { frTypo } from '../../lib/typo';
import { assetInfo, cssUrl } from '../../lib/assets';
import { parseMarkup, type Segment } from './markup';
import { hashSeed, rng, r2, type Rng } from './rng';
import { Rature } from './Rature';
import { Souligne, type SouligneVariant } from './Souligne';
import './Ecriture.css';



export interface EcritureProps {
  /** Main de l'invité (police + métriques : la taille découle du rôle et du cran de distance). */
  hand: HandId;
  /** Encre ; sans encre, `gc-ink` (encre chocolat de Cécile). */
  ink?: InkId;
  /** Rôle typographique : fixe la hauteur d'x visée (`gc-x-<rôle>`, selon le cran). */
  role: HandRole;
  /** Texte, avec balisage facultatif : `~~150 g~~>120 g` (rature + correction), `__mot__` (souligné). */
  children: string;
  /** Graine de l'irrégularité (mêmes graine et texte → même écriture). Par défaut : dérivée du texte. */
  seed?: number;
  /** Pente des lignes en degrés : négatif = la ligne monte (−1,5 à 0,5). */
  slant?: number;
  as?: 'p' | 'span' | 'h2' | 'h3' | 'li' | 'div';
  className?: string;
  /** Encre des soulignés `__…__` (par défaut celle du texte). */
  markInk?: InkId;
  /** Encre des corrections `~~…~~>…` (par défaut `rouge`). */
  fixInk?: InkId;
  /** Place des corrections : `dessus` (dans l'interligne, par défaut) ou `apres` (à la suite du mot raturé). */
  fixPlace?: 'dessus' | 'apres';
  /** Souligne tout le texte (titres, intitulés d'une ligne). */
  souligne?: SouligneVariant;
  /** Encre du souligné global (par défaut celle du texte). */
  souligneInk?: InkId;
  /** Grain d'encre (tuile cuite `ink/grain`, en masque). Activé par défaut. */
  grain?: boolean;
  /**
   * Dérive de la marge (0 à 1) : la ligne ne commence jamais exactement au même endroit
   * (retrait de 0 à 0,16 em, écart vertical de −0,02 à 0,06 em, selon la graine). Blocs seulement.
   */
  drift?: number;
  style?: React.CSSProperties;
}

// --- Caractère de chaque main et de chaque encre -------------------------------------------

/** Nervosité de la main : amplitude relative des écarts (1 = ±1,5 px et ±1° au rôle courant). */
const NERF: Record<HandId, number> = {
  mamie: 0.8, // main ancienne, régulière mais un peu tremblée
  ecole: 0.55, // cursive d'écolier, sage
  soignee: 0.7,
  feutre: 1,
  capitales: 0.85,
  pressee: 1,
  cecile: 0.9,
};

/** Épaisseur relative des traits dessinés (soulignés, ratures, flèches) selon l'outil. */
export const TRAIT_K: Record<InkId | 'ink', number> = {
  plume: 1.05,
  brune: 1.1,
  bic: 0.85,
  crayon: 0.9,
  noire: 1,
  feutre: 1.45,
  rouge: 0.95,
  ink: 1,
};

/** Part du grain neutralisée selon l'outil : le feutre couvre uniformément, le crayon accroche. */
const GRAIN_LIFT: Record<InkId | 'ink', string> = {
  plume: '35%',
  brune: '20%',
  bic: '35%',
  crayon: '0%',
  noire: '35%',
  feutre: '70%',
  rouge: '35%',
  ink: '30%',
};

/** Sur les gros traits (titre, signature), le grain fait « tampon usé » : on l'atténue. */
const grainLift = (ink: InkId | undefined, role: HandRole): string => {
  const base = parseFloat(GRAIN_LIFT[ink ?? 'ink']);
  return `${role === 'title' || role === 'signature' ? Math.max(base, 72) : base}%`;
};

/** Débit d'encre mot après mot (opacité 0,88–1). */
function inkFlow(ink: InkId | undefined, n: number, R: Rng): number[] {
  const out: number[] = [];
  let level = 1;
  for (let i = 0; i < n; i++) {
    let v: number;
    switch (ink) {
      case 'brune': // vieille plume trempée : se vide mot après mot, puis on retrempe
        v = level;
        level -= R.range(0.012, 0.028);
        if (level < 0.885 || R.next() < 0.05) level = 1;
        break;
      case 'plume': // stylo plume : débit régulier, un mot plus chargé de temps en temps
        v = R.next() < 0.15 ? 1 : R.range(0.93, 0.99);
        break;
      case 'feutre': // le feutre sèche doucement au fil du texte
        v = 1 - 0.08 * (n > 1 ? i / (n - 1) : 0) + R.jitter(0.012);
        break;
      case 'crayon': // pression de la mine
        v = R.range(0.88, 1);
        break;
      default: // bille, encre noire, rouge : quelques mots où la bille accroche moins
        v = R.next() < 0.1 ? R.range(0.885, 0.92) : R.range(0.94, 1);
    }
    out.push(Math.max(0.88, Math.min(1, v)));
  }
  return out;
}

// --- Découpe en mots ---------------------------------------------------------------------------

type Part = string | Exclude<Segment, { kind: 'texte' }>;
type Unit = { kind: 'mot'; parts: Part[] } | { kind: 'espace' } | { kind: 'ligne' };

/** Mots (inline-block) et séparateurs ; la ponctuation collée à une rature reste avec elle. */
function toUnits(segments: Segment[]): Unit[] {
  const units: Unit[] = [];
  let cur: Part[] | null = null;
  const close = () => {
    if (cur && cur.length) units.push({ kind: 'mot', parts: cur });
    cur = null;
  };
  for (const seg of segments) {
    if (seg.kind !== 'texte') {
      (cur ??= []).push(seg);
      continue;
    }
    for (const tok of seg.text.split(/( +|\n)/)) {
      if (!tok) continue;
      if (tok === '\n') {
        close();
        units.push({ kind: 'ligne' });
      } else if (/^ +$/.test(tok)) {
        close();
        units.push({ kind: 'espace' });
      } else {
        (cur ??= []).push(tok);
      }
    }
  }
  close();
  return units;
}

// --- Pente des lignes : chaque ligne part de la marge et monte un peu ------------------------
// Mesure unique (après les polices) : la position de chaque mot dans sa ligne donne son
// soulèvement (--gc-lift). Transformations seulement : la mise en page ne bouge pas.

function useSlant(ref: React.RefObject<HTMLElement>, slant: number, key: string) {
  React.useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const words = Array.from(root.querySelectorAll<HTMLElement>('.gc-ecriture__mot')).filter(
      (w) => w.closest('.gc-ecriture') === root,
    );
    if (!slant) {
      for (const w of words) w.style.removeProperty('--gc-lift');
      return undefined;
    }
    const tan = Math.tan((slant * Math.PI) / 180);
    const apply = () => {
      let lineStart = 0;
      let prev = Infinity;
      words.forEach((w, i) => {
        const left = w.offsetLeft;
        if (i === 0 || left < prev - 1) lineStart = left; // retour à la ligne
        prev = left;
        const cx = left + w.offsetWidth / 2 - lineStart;
        w.style.setProperty('--gc-lift', `${r2(cx * tan)}px`);
      });
    };
    apply();
    let alive = true;
    document.fonts?.ready.then(() => alive && apply());
    if (typeof ResizeObserver === 'undefined') return () => void (alive = false);
    const ro = new ResizeObserver(() => apply());
    ro.observe(root);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [slant, key]);
}

// --- Composant -------------------------------------------------------------------------------

/**
 * Texte écrit à la main : chaque mot légèrement décalé et tourné (graine), la ligne qui monte,
 * l'encre qui faiblit, ratures et soulignés dessinés.
 */
export function Ecriture({
  hand,
  ink,
  role,
  children,
  seed,
  slant = 0,
  as = 'p',
  className,
  markInk,
  fixInk = 'rouge',
  fixPlace = 'dessus',
  souligne,
  souligneInk,
  grain = true,
  drift = 0,
  style,
}: EcritureProps) {
  const ref = React.useRef<HTMLElement>(null);
  const text = React.useMemo(() => handText(frTypo(children), hand), [children, hand]);
  const baseSeed = seed ?? hashSeed(`${hand}|${role}|${text}`);
  const units = React.useMemo(() => toUnits(parseMarkup(text)), [text]);
  useSlant(ref, slant, `${text}|${hand}|${role}`);

  const words = units.filter((u) => u.kind === 'mot').length;
  const R = rng(baseSeed);
  const flow = inkFlow(ink, words, rng(baseSeed ^ 0x9e3779b9));
  const nerf = NERF[hand];

  let w = 0;
  const nodes = units.map((u, i) => {
    if (u.kind === 'espace') return ' ';
    if (u.kind === 'ligne') return <br key={i} />;
    const k = w++;
    const special = u.parts.some((p) => typeof p !== 'string');
    const hasFix = u.parts.some((p) => typeof p !== 'string' && p.kind === 'rature');
    const wordStyle = {
      '--gc-jy': `${r2(R.jitter(0.046) * nerf)}em`,
      '--gc-rot': `${r2(R.jitter(1) * nerf + slant)}deg`,
      marginInlineEnd: `${r2(R.jitter(0.035))}em`,
      opacity: hasFix ? undefined : flow[k],
    } as React.CSSProperties;
    return (
      <span key={i} className={`gc-ecriture__mot${special ? ' gc-ecriture__mot--trace' : ''}`} style={wordStyle}>
        {u.parts.map((p, j) => {
          if (typeof p === 'string') return p;
          const s = (baseSeed + 7919 * (k + 1) + j) >>> 0;
          if (p.kind === 'rature')
            return (
              <Rature key={j} hand={hand} ink={ink} fixInk={fixInk} fixPlace={fixPlace} correction={p.correction} seed={s}>
                {p.text}
              </Rature>
            );
          return (
            <span key={j} className="gc-ecriture__souligne">
              {p.text}
              <span className="gc-ancre" aria-hidden="true">
                <Souligne variant="main" ink={markInk ?? ink} seed={s} mode="ancre" />
              </span>
            </span>
          );
        })}
      </span>
    );
  });

  const grainOn = grain && Boolean(assetInfo('ink/grain'));
  const D = rng(baseSeed ^ 0x51ed27);
  const driftStyle =
    drift && as !== 'span'
      ? { marginInlineStart: `${r2(D.range(0, 0.16) * drift)}em`, marginBlockStart: `${r2(D.range(-0.02, 0.06) * drift)}em` }
      : null;
  const rootStyle = {
    ...handStyle(hand, role, ink),
    ...driftStyle,
    ...(ink ? null : { color: 'var(--gc-ink)' }),
    '--gc-trait-k': TRAIT_K[ink ?? 'ink'],
    ...(grainOn ? { '--gc-ink-grain': cssUrl('ink/grain'), '--gc-grain-lift': grainLift(ink, role) } : null),
    ...style,
  } as React.CSSProperties;

  const classes = ['gc-ecriture', `gc-ecriture--${hand}`, `gc-ecriture--${role}`, grainOn && 'gc-ecriture--grain', className]
    .filter(Boolean)
    .join(' ');
  const Tag = as as 'p';
  return (
    <Tag
      ref={ref as React.RefObject<HTMLParagraphElement>}
      className={classes}
      style={rootStyle}
      data-gc-hand={hand}
      data-gc-role={role}
      data-gc-ink={ink ?? 'ink'}
    >
      {souligne ? (
        <span className="gc-ecriture__ligne">
          {nodes}
          <span className="gc-ancre" aria-hidden="true">
            <Souligne
              variant={souligne}
              ink={souligneInk ?? ink}
              seed={baseSeed ^ 0x2545f491}
              slant={slant}
              mode="ancre"
              className="gc-ecriture__trait-titre"
            />
          </span>
        </span>
      ) : (
        nodes
      )}
    </Tag>
  );
}

/** Couleur CSS d'une encre (ou de l'encre de Cécile sans encre). */
export const encre = (ink?: InkId): string => (ink ? inkVar(ink) : 'var(--gc-ink)');
