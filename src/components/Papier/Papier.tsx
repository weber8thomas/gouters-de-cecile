import React from 'react';
import { assetInfo, assetNames, cssUrl } from '../../lib/assets';
import './Papier.css';

/** Rectangle en px de page (origine : coin haut gauche de la page). */
export interface PapierRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PapierProps {
  /** Graine de la double page : passer la même aux deux pages (rousseurs et auréole se répartissent entre elles). */
  seed: number;
  /** Âge du papier : 0 bien conservé · 1 (défaut) · 2 · 3 très jauni. */
  age?: 0 | 1 | 2 | 3;
  /** Côté de la double page : fixe le bord extérieur (plus usé) et la reliure. */
  side?: 'left' | 'right';
  /** Zones à garder propres (texte, illustrations), en px de page. Par défaut : la zone utile de <Page>. */
  keepOut?: PapierRect[];
  /** Rousseurs : 0 aucune · 1 (défaut) le tirage de la graine (3 amas au plus par double page). */
  foxing?: number;
  /** Intensité du gondolage : 0 à 1,5 (défaut 1). */
  cockle?: number;
  className?: string;
  children?: React.ReactNode;
}

type Side = 'left' | 'right';
type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

// Taille de référence d'une page (cran « proche ») ; tout se met à l'échelle de la page mesurée.
const REF = { w: 896, h: 1000, outer: 72, spine: 64, top: 52, bottom: 60 };
type Box = typeof REF;
// Les couches cuites le sont à 1,25 × leur taille affichée (CONTRACT § 6).
const BAKE = 1.25;
// Bande de reliure où l'on ne pose jamais de tache (px de page à l'échelle de référence).
const SPINE_BAND = 96;

// mulberry32 (identique à scripts/lib/prng.mjs)
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (min: number, max: number) => min + (max - min) * next(), int: (min: number, max: number) => Math.floor(min + (max - min + 1) * next()) };
}
const mix = (seed: number, salt: number) => (Math.imul((seed | 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;

// Variantes cuites disponibles (« paper/fox-1 », « paper/fox-2 »…), découvertes dans l'inventaire.
let variants: { fox: string[]; tide: string[]; cockle: string[] } | null = null;
function getVariants() {
  if (variants) return variants;
  const names = assetNames();
  const numbered = (prefix: string, suffix = '') =>
    names
      .filter((n) => n.startsWith(prefix) && n.endsWith(suffix) && /^\d+$/.test(n.slice(prefix.length, n.length - suffix.length)))
      .sort((a, b) => parseInt(a.slice(prefix.length), 10) - parseInt(b.slice(prefix.length), 10));
  variants = {
    fox: numbered('paper/fox-'),
    tide: numbered('paper/tide-'),
    cockle: numbered('paper/cockle-', '-shade').map((n) => n.slice(0, -'-shade'.length)),
  };
  return variants;
}

// Réglages par âge : teinte posée sur la tuile, jaunissement en plages, usure des bords, gondolage.
// tint : % de la teinte d'âge posée sur la tuile ; foxed : part de gc-paper-foxed dans cette teinte ;
// reach : largeur de l'usure des bords (× tirage de la graine).
const AGE = [
  { tint: 0, foxed: 0, mottle: 0.08, wear: 0.4, edge: 0.45, reach: 0.7, cockle: 0.5, thumb: 0.3 },
  { tint: 12, foxed: 0, mottle: 0.15, wear: 0.65, edge: 0.7, reach: 0.85, cockle: 0.6, thumb: 0.6 },
  { tint: 23, foxed: 15, mottle: 0.24, wear: 0.85, edge: 0.86, reach: 1, cockle: 0.65, thumb: 0.8 },
  { tint: 35, foxed: 40, mottle: 0.34, wear: 1, edge: 1, reach: 1.25, cockle: 0.7, thumb: 1 },
] as const;

interface Spot {
  name: string;
  x: number; // centre, px de page
  y: number;
  d: number; // côté affiché
  rot: number;
  flip: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
// Distance d'un point à un rectangle (0 à l'intérieur).
const distToRect = (x: number, y: number, r: PapierRect) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

// Tirage de la double page : nombre d'amas de rousseurs de chaque côté (3 au plus en tout), auréole
// (une au plus, d'un seul côté), carte de gondolage et retournement de chaque page.
function drawSpread(seed: number) {
  const R = rng(mix(seed, 1));
  const u = R.next();
  const fox = u < 0.18 ? 0 : u < 0.52 ? 1 : u < 0.84 ? 2 : 3;
  const foxSide = { left: 0, right: 0 };
  for (let i = 0; i < fox; i++) foxSide[R.next() < 0.5 ? 'left' : 'right']++;
  const tide: Side | null = R.next() < 0.42 ? (R.next() < 0.5 ? 'left' : 'right') : null;
  const ck = R.next();
  const ckStep = R.next();
  const turned = { left: R.next() < 0.5, right: R.next() < 0.5 };
  return { foxSide, tide, ck, ckStep, turned };
}

function placeSpots(seed: number, side: Side, box: Box, keepOut: PapierRect[], count: number, tide: boolean) {
  const v = getVariants();
  const R = rng(mix(seed, side === 'left' ? 11 : 12));
  const k = box.w / REF.w;
  const spineBand = SPINE_BAND * k;
  const spots: Spot[] = [];
  const taken: Array<{ x: number; y: number; r: number }> = [];
  const free = (x: number, y: number, r: number, pad: number) =>
    keepOut.every((rect) => distToRect(x, y, rect) > r + pad) && taken.every((t) => Math.hypot(t.x - x, t.y - y) > t.r + r + 12 * k);
  const inSpine = (x: number, r: number) => (side === 'left' ? x + r > box.w - spineBand : x - r < spineBand);

  // Toutes les positions valides sur une grille, puis un tirage parmi elles : la place est trouvée
  // dès qu'elle existe, même dans un coin ou une marge étroite.
  const pick = (x0: number, x1: number, y0: number, y1: number, ok: (x: number, y: number) => boolean) => {
    const step = 8 * k;
    const found: Array<[number, number]> = [];
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) if (ok(x, y)) found.push([x, y]);
    if (!found.length) return null;
    const [x, y] = found[Math.floor(R.next() * found.length)];
    return { x: x + R.range(-step / 2, step / 2) * 0.9, y: y + R.range(-step / 2, step / 2) * 0.9 };
  };

  // Auréole : n'importe où hors du texte ; le centre reste (presque) sur la feuille, si bien qu'un
  // cerne coupé par la tranche en montre au moins un quart, jamais un simple éclat d'arc.
  let tideSpot: Spot | null = null;
  if (tide && v.tide.length) {
    const name = v.tide[R.int(0, v.tide.length - 1)];
    const info = assetInfo(name);
    const d = ((info?.w ?? 350) / BAKE) * k * R.range(0.82, 1.12);
    const r = d * 0.38; // rayon visible du cerne
    const at = pick(-0.05 * d, box.w + 0.05 * d, -0.05 * d, box.h + 0.05 * d, (x, y) => !inSpine(x, r) && free(x, y, r, 8 * k));
    if (at) {
      tideSpot = { name, x: at.x, y: at.y, d, rot: R.range(0, 360), flip: R.next() < 0.5 };
      taken.push({ x: at.x, y: at.y, r });
    }
  }

  // Rousseurs : dans les marges et les zones libres, jamais sous le texte ni dans la reliure ;
  // un amas trop grand pour la place disponible est réduit (deux fois au plus) avant d'être abandonné.
  for (let n = 0; n < count && v.fox.length; n++) {
    const name = v.fox[R.int(0, v.fox.length - 1)];
    const info = assetInfo(name);
    let d = ((info?.w ?? 160) / BAKE) * k * R.range(0.82, 1.12);
    const m = 8 * k;
    for (let tries = 0; tries < 3; tries++, d *= 0.8) {
      const r = d * 0.27; // rayon du contenu de l'amas
      const at = pick(m + r, box.w - m - r, m + r, box.h - m - r, (x, y) => !inSpine(x, r) && free(x, y, r, 6 * k));
      if (!at) continue;
      spots.push({ name, x: at.x, y: at.y, d, rot: R.range(0, 360), flip: R.next() < 0.5 });
      taken.push({ x: at.x, y: at.y, r });
      break;
    }
  }
  return { tide: tideSpot, fox: spots };
}

// Mesure la page (taille et marges des tokens, qui suivent le cran de distance).
function usePageBox(ref: React.RefObject<HTMLDivElement>): Box {
  const [box, setBox] = React.useState<Box>(REF);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const cs = getComputedStyle(el);
      const px = (name: string, d: number) => {
        const n = parseFloat(cs.getPropertyValue(name));
        return Number.isFinite(n) ? n : d;
      };
      const next: Box = {
        w: el.offsetWidth || REF.w,
        h: el.offsetHeight || REF.h,
        outer: px('--gc-page-pad-outer', REF.outer),
        spine: px('--gc-page-pad-spine', REF.spine),
        top: px('--gc-page-pad-top', REF.top),
        bottom: px('--gc-page-pad-bottom', REF.bottom),
      };
      setBox((b) => ((Object.keys(next) as Array<keyof Box>).every((key) => Math.abs(b[key] - next[key]) < 0.5) ? b : next));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

const px = (n: number) => `${+n.toFixed(1)}px`;

// La surface d'une page de carnet ancien : papier crème épais, jauni selon l'âge, bords usés,
// gondolage, rousseurs et auréole tirés de la graine. Aucune image n'est propre à la page :
// tout est composé à partir des couches cuites partagées (design-system/baked/paper/).
export function Papier({ seed, age = 1, side = 'right', keepOut, foxing = 1, cockle = 1, className, children }: PapierProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const box = usePageBox(ref);
  const a = AGE[clamp(Math.round(age), 0, 3)];
  const k = box.w / REF.w;

  // Zone utile de <Page> par défaut : le texte n'a jamais de tache dessous.
  const zones = React.useMemo<PapierRect[]>(() => {
    if (keepOut) return keepOut;
    const left = side === 'left' ? box.outer : box.spine;
    return [{ x: left, y: box.top, w: box.w - box.outer - box.spine, h: box.h - box.top - box.bottom }];
  }, [keepOut, side, box]);
  const zonesKey = JSON.stringify(zones);

  const reach = a.reach;
  const layout = React.useMemo(() => {
    const spread = drawSpread(seed);
    const R = rng(mix(seed, side === 'left' ? 21 : 22));
    const v = getVariants();
    const n = v.cockle.length;
    // deux cartes différentes pour les deux pages d'une même double page
    const iL = Math.floor(spread.ck * n);
    const iR = n > 1 ? (iL + 1 + Math.floor(spread.ckStep * (n - 1))) % n : iL;
    const count = Math.round(spread.foxSide[side] * clamp(foxing, 0, 1));
    const spots = placeSpots(seed, side, box, JSON.parse(zonesKey) as PapierRect[], count, spread.tide === side);
    const tile = (1024 / BAKE) * k;
    return {
      cockle: n ? v.cockle[side === 'left' ? iL : iR] : null,
      turned: spread.turned[side],
      spots,
      vars: {
        '--gc-papier-tile': px(tile),
        '--gc-papier-bx': px(-R.range(0, tile)),
        '--gc-papier-by': px(-R.range(0, tile)),
        '--gc-papier-mx': px(-R.range(0, 1200 * k)),
        '--gc-papier-my': px(-R.range(0, 1200 * k)),
        '--gc-papier-wx': px(-R.range(0, 600 * k)),
        '--gc-papier-wy': px(-R.range(0, 600 * k)),
        '--gc-papier-mottle-size': px(R.range(1100, 1300) * k),
        '--gc-papier-wear-size': px(R.range(520, 640) * k),
        '--gc-papier-out-w': px(R.range(64, 92) * k * reach),
        '--gc-papier-top-w': px(R.range(30, 52) * k * reach),
        '--gc-papier-bottom-w': px(R.range(26, 44) * k * reach),
        '--gc-papier-wear-out': px(R.range(120, 170) * k * reach),
        '--gc-papier-wear-top': px(R.range(70, 110) * k * reach),
        '--gc-papier-wear-bottom': px(R.range(60, 100) * k * reach),
        '--gc-papier-thumb-x': px(R.range(60, 110) * k),
        '--gc-papier-thumb-rx': px(R.range(120, 170) * k),
        '--gc-papier-thumb-ry': px(R.range(90, 130) * k),
      } as Vars,
    };
  }, [seed, side, box, k, reach, foxing, zonesKey]);

  const style: Vars = {
    ...layout.vars,
    '--gc-papier-base': cssUrl('paper/base'),
    '--gc-papier-age': cssUrl('paper/age'),
    '--gc-papier-tint': `${a.tint}%`,
    '--gc-papier-tint-foxed': `${a.foxed}%`,
    '--gc-papier-mottle-o': a.mottle,
    '--gc-papier-wear-o': a.wear,
    '--gc-papier-edge-o': a.edge,
    '--gc-papier-thumb-o': a.thumb,
  };
  const cockleStyle: Vars | undefined = layout.cockle
    ? {
        '--gc-papier-ck-shade': cssUrl(`${layout.cockle}-shade`),
        '--gc-papier-ck-light': cssUrl(`${layout.cockle}-light`),
        opacity: clamp(a.cockle * cockle, 0, 1.5),
      }
    : undefined;

  const spot = (s: Spot, kind: 'tide' | 'fox', key?: number) => (
    <div
      key={key}
      className={`gc-papier__spot gc-papier__spot--${kind}`}
      style={{
        left: px(s.x - s.d / 2),
        top: px(s.y - s.d / 2),
        width: px(s.d),
        height: px(s.d),
        transform: `rotate(${s.rot.toFixed(1)}deg)${s.flip ? ' scaleX(-1)' : ''}`,
        '--gc-papier-img': cssUrl(s.name),
      } as Vars}
    />
  );

  const cls = ['gc-papier', `gc-papier--${side}`, `gc-papier--age-${clamp(Math.round(age), 0, 3)}`, className].filter(Boolean).join(' ');
  return (
    <div ref={ref} className={cls} style={style} data-gc-seed={seed}>
      <div className="gc-papier__paper" aria-hidden="true">
        <div className="gc-papier__base" />
        <div className="gc-papier__mottle" />
        <div className="gc-papier__wear" />
        <div className="gc-papier__edge" />
        {layout.spots.tide && spot(layout.spots.tide, 'tide')}
        {layout.spots.fox.map((s, i) => spot(s, 'fox', i))}
        {cockleStyle && <div className={`gc-papier__cockle${layout.turned ? ' gc-papier__cockle--turned' : ''}`} style={cockleStyle} />}
        <div className="gc-papier__curve" />
      </div>
      {children != null && <div className="gc-papier__content">{children}</div>}
    </div>
  );
}
