import React from 'react';
import type { HandId, InkId } from '../../content/types';
import { handStyle, handText, inkVar, type HandRole } from '../../lib/hands';
import { frTypo } from '../../lib/typo';
import { assetInfo, cssUrl } from '../../lib/assets';
import { parseMarkup, type Segment } from './markup';
import { hashSeed, rng, r2, type Rng } from './rng';
import { Rature } from './Rature';
import { Souligne, type SouligneVariant } from './Souligne';
import { puce as tracePuce, type PuceDessin, type RatureStyle } from './traits';
import { LETTRES, metriques } from './metriques';
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
  /** Encre des corrections : par défaut celle de l'auteur ; `rouge` quand quelqu'un d'autre corrige. */
  fixInk?: InkId;
  /** Main de qui corrige, si ce n'est pas l'auteur (ex. `cecile` avec `fixInk="rouge"`). */
  fixHand?: HandId;
  /** Place des corrections : `auto` (selon la graine et la main), `dessus` ou `apres`. */
  fixPlace?: 'auto' | 'dessus' | 'apres';
  /** Façon de raturer : `trait`, `zigzag` ou `noirci`. Par défaut selon la graine de chaque rature. */
  rature?: RatureStyle;
  /** Souligne tout le texte (titres, intitulés d'une ligne). */
  souligne?: SouligneVariant;
  /** Encre du souligné global (par défaut celle du texte). */
  souligneInk?: InkId;
  /** Puce tracée à la main en tête du texte (`tiret`, `point`, `case`, `fleche`). Les numéros s'écrivent dans le texte. */
  puce?: PuceDessin;
  /** Grain d'encre (tuile cuite `ink/grain`, en masque). Activé par défaut. */
  grain?: boolean;
  /**
   * Dérive de la marge du bloc (0 à 1) : retrait de 0 à 0,16 em et écart vertical de −0,02 à
   * 0,06 em selon la graine. Blocs seulement (une liste n'est jamais alignée au pixel).
   */
  drift?: number;
  /**
   * Vie de l'écriture, de 0 (la police telle quelle) à 1,5 ; 1 par défaut : lettres et mots qui
   * bougent, espaces inégales, lignes en arc, fin de ligne serrée, interligne et marge qui dérivent.
   */
  wobble?: number;
  style?: React.CSSProperties;
}

// --- Caractère de chaque main et de chaque encre -------------------------------------------

/** Nervosité de la main : amplitude relative des écarts (1 = ±1,5 px et ±1° au rôle courant). */
const NERF: Record<HandId, number> = {
  mamie: 0.8, // main ancienne, régulière mais un peu tremblée
  ecole: 0.55, // cursive d'écolier, sage
  soignee: 0.8,
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

// --- Effets de ligne (mesurés une fois, transformations seulement) -------------------------
// La position de chaque mot dans sa ligne donne : la pente (--gc-lift), un arc doux, un léger
// décalage vertical et horizontal propre à chaque ligne (interligne ±4 %, marge qui dérive),
// la fin de ligne serrée (on manque de place) et le début plus ample. La mise en page ne bouge pas.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function useLignes(ref: React.RefObject<HTMLElement>, slant: number, vie: number, seed: number, key: string) {
  React.useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const words = Array.from(root.querySelectorAll<HTMLElement>('.gc-ecriture__mot')).filter(
      (w) => w.closest('.gc-ecriture') === root,
    );
    const props = ['--gc-lift', '--gc-lx', '--gc-ls'];
    if (!slant && !vie) {
      for (const w of words) for (const p of props) w.style.removeProperty(p);
      return undefined;
    }
    const tan = Math.tan((slant * Math.PI) / 180);
    const apply = () => {
      const cs = getComputedStyle(root);
      const fs = parseFloat(cs.fontSize) || 16;
      const lh = (parseFloat(cs.lineHeight) || fs * 1.3) / fs;
      let avail = root.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      if (avail <= 0) avail = root.parentElement?.clientWidth || 600;
      let line = -1, lineStart = 0, prev = Infinity;
      let arc = 0, offY = 0, offX = 0;
      words.forEach((w, i) => {
        const left = w.offsetLeft;
        if (i === 0 || left < prev - 1) {
          line++;
          lineStart = left;
          const L = rng((seed + 7349 * (line + 1)) >>> 0);
          arc = L.range(-0.035, 0.055); // arc doux : bombé le plus souvent, parfois creusé
          offY = L.jitter(0.04 * lh); // interligne ±4 %
          offX = L.range(-0.05, 0.17); // marge qui dérive (≈ −2 à +6 px)
        }
        prev = left;
        const x = left + w.offsetWidth / 2 - lineStart;
        const p = clamp(x / avail, 0, 1);
        let ls = 1, lx = 0;
        if (p > 0.7) {
          const q = (p - 0.7) / 0.3; // fin de ligne : les derniers mots se serrent
          ls = 1 - 0.015 * q;
          lx = -0.1 * Math.pow(q, 1.3);
        } else if (p < 0.2) {
          ls = 1.025 - 0.125 * p; // début de ligne un peu plus ample
        }
        const lift = x * tan + (-arc * 4 * p * (1 - p) + offY) * fs * vie;
        w.style.setProperty('--gc-lift', `${r2(lift)}px`);
        w.style.setProperty('--gc-lx', `${r2((lx + offX) * fs * vie)}px`);
        w.style.setProperty('--gc-ls', `${Math.round((1 + (ls - 1) * vie) * 1000) / 1000}`);
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
  }, [slant, vie, seed, key]);
}

// --- Composant -------------------------------------------------------------------------------

/**
 * Texte écrit à la main : lettres (mains non liées) et mots légèrement décalés, tournés et mis à
 * l'échelle, espaces inégales, lignes qui montent en arc, encre qui faiblit, ratures, soulignés
 * et puces tracés à la main. Tout est statique et déterministe (graine).
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
  fixInk,
  fixHand,
  fixPlace = 'auto',
  rature,
  souligne,
  souligneInk,
  puce,
  grain = true,
  drift = 0,
  wobble = 1,
  style,
}: EcritureProps) {
  const ref = React.useRef<HTMLElement>(null);
  const text = React.useMemo(() => handText(frTypo(children), hand), [children, hand]);
  const baseSeed = seed ?? hashSeed(`${hand}|${role}|${text}`);
  const units = React.useMemo(() => toUnits(parseMarkup(text)), [text]);
  const vie = clamp(wobble, 0, 1.5);
  useLignes(ref, slant, vie, baseSeed, `${text}|${hand}|${role}`);

  const words = units.filter((u) => u.kind === 'mot').length;
  const R = rng(baseSeed);
  const RL = rng(baseSeed ^ 0x3c6ef372); // lettres
  const flow = inkFlow(ink, words, rng(baseSeed ^ 0x9e3779b9));
  const nerf = NERF[hand] * vie;
  const lettres = LETTRES[hand] && vie > 0;
  const k = TRAIT_K[ink ?? 'ink'];

  /** Une lettre : rotation ±1,5°, ligne de base ±0,04 em, échelle 1–1,05 (jamais sous la hauteur d'x visée). */
  const lettre = (ch: string, key: number) => (
    <span
      key={key}
      className="gc-ecriture__l"
      style={
        {
          '--gc-lr': `${r2(RL.jitter(1.5) * nerf)}deg`,
          '--gc-ly': `${r2(RL.jitter(0.04) * nerf * 100) / 100}em`,
          '--gc-lsc': `${Math.round((1 + RL.range(0, 0.05) * Math.min(1, vie)) * 1000) / 1000}`,
          opacity: RL.next() < 0.25 ? r2(RL.range(0.92, 0.98)) : undefined,
        } as React.CSSProperties
      }
    >
      {ch}
    </span>
  );
  const ecrire = (str: string) => (lettres ? Array.from(str).map((ch, i) => lettre(ch, i)) : str);

  let w = 0;
  const nodes: React.ReactNode[] = units.map((u, i) => {
    if (u.kind === 'espace') return ' ';
    if (u.kind === 'ligne') return <br key={i} />;
    const kw = w++;
    const special = u.parts.some((p) => typeof p !== 'string');
    const hasFix = u.parts.some((p) => typeof p !== 'string' && p.kind === 'rature');
    const wordStyle = {
      '--gc-jy': `${r2(R.jitter(0.046) * nerf * 100) / 100}em`,
      '--gc-rot': `${r2(R.jitter(1) * nerf + slant)}deg`,
      // mains liées : la variation se fait au mot (échelle 0,985–1,025, jamais sous la hauteur d'x visée)
      '--gc-ws': lettres ? 1 : Math.round((1 + R.range(-0.015, 0.025) * Math.min(1, vie)) * 1000) / 1000,
      marginInlineEnd: `${r2(R.jitter(0.08) * nerf * 100) / 100}em`,
      opacity: hasFix ? undefined : flow[kw],
      ...(hand === 'feutre' ? { fontVariationSettings: `"BNCE" 40, "INFM" ${Math.round(R.range(80, 100))}` } : null),
    } as React.CSSProperties;
    return (
      <span key={i} className={`gc-ecriture__mot${special ? ' gc-ecriture__mot--trace' : ''}`} style={wordStyle}>
        {u.parts.map((p, j) => {
          if (typeof p === 'string') return <React.Fragment key={j}>{ecrire(p)}</React.Fragment>;
          const s = (baseSeed + 7919 * (kw + 1) + j) >>> 0;
          if (p.kind === 'rature')
            return (
              <Rature key={j} hand={hand} ink={ink} fixInk={fixInk} fixHand={fixHand} fixPlace={fixPlace} rature={rature} k={k} correction={p.correction} seed={s}>
                {p.text}
              </Rature>
            );
          return (
            <span key={j} className="gc-ecriture__souligne">
              {ecrire(p.text)}
              <span className="gc-ancre" aria-hidden="true">
                <Souligne variant="main" ink={markInk ?? ink} seed={s} mode="ancre" />
              </span>
            </span>
          );
        })}
      </span>
    );
  });

  if (puce) {
    const P = tracePuce(puce, baseSeed ^ 0x2f1);
    const { xh } = metriques(hand);
    nodes.unshift(
      <span
        key="puce"
        className="gc-ecriture__mot gc-ecriture__puce"
        style={{ '--gc-jy': `${r2(R.jitter(0.05))}em`, '--gc-rot': `${r2(R.jitter(6))}deg`, marginInlineEnd: `${r2(R.range(-0.02, 0.14))}em` } as React.CSSProperties}
        aria-hidden="true"
      >
        <svg
          className={`gc-puce gc-puce--${puce}`}
          viewBox="0 0 40 20"
          focusable="false"
          style={{ verticalAlign: puce === 'case' ? '-0.02em' : `${r2(xh * 0.5 - 0.175)}em` }}
        >
          {P.fills.map((d, n) => (
            <path key={`f${n}`} className="gc-puce__plein" d={d} />
          ))}
          {P.strokes.map((d, n) => (
            <path key={`s${n}`} className="gc-puce__trait" d={d} />
          ))}
        </svg>
      </span>,
      ' ',
    );
  }

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
    ...(hand === 'feutre' ? { fontVariationSettings: '"BNCE" 40, "INFM" 90' } : null),
    '--gc-trait-k': k,
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
