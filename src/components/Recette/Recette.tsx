import React from 'react';
import type { Recipe } from '../../content/types';
import { useTitleClass } from '../../lib/settings';
import './Recette.css';

export interface RecetteProps {
  /** Recette à afficher (titre, temps, parts, ingrédients, étapes) : aucun autre texte n'est ajouté. */
  recipe: Recipe;
  /** `normal` (gc-hand-body, 44 px) ou `compact` (gc-hand-compact, 40 px) pour une recette longue. */
  density?: 'normal' | 'compact';
  className?: string;
}

// --- Petits dessins à la plume (tracés à la main, couleurs posées par le CSS) ---------------

/** Soulignement ondulé sous le titre : un trait plein, appuyé au départ et effilé à la fin, comme à la plume. */
const Underline = () => (
  <svg className="gc-recette__underline" viewBox="0 3 240 16" aria-hidden="true" focusable="false">
    <path d="M2.9 11.2L5.3 12.7 7.9 13.9 10.5 14.9 13.2 15.7 15.9 16.3 18.6 16.6 21.3 16.6 24.1 16.3 26.8 15.8 29.5 15.2 32.2 14.4 34.8 13.5 37.4 12.6 40 11.8 42.6 11.1 45.1 10.4 47.6 9.9 50 9.6 52.5 9.5 54.9 9.5 57.3 9.8 59.8 10.2 62.2 10.7 64.7 11.5 67.2 12.4 69.8 13.3 72.4 14.4 75 15.4 77.7 16.3 80.5 17.1 83.3 17.7 86.1 18 89 17.9 91.8 17.5 94.6 16.8 97.4 15.9 100.1 14.7 102.7 13.5 105.3 12.3 107.9 11.2 110.3 10.2 112.8 9.4 115.2 8.8 117.6 8.4 120 8.3 122.4 8.5 124.8 8.9 127.3 9.4 129.8 10.2 132.3 11 134.9 11.9 137.6 12.9 140.2 13.7 142.9 14.5 145.6 15.2 148.3 15.7 151.1 16 153.8 16 156.6 15.8 159.3 15.4 162 14.7 164.7 13.8 167.3 12.8 169.9 11.7 172.5 10.5 175.1 9.4 177.6 8.3 180.1 7.5 182.6 6.8 185.1 6.3 187.6 6.2 190.1 6.2 192.6 6.6 195.2 7.2 197.8 7.9 200.4 8.8 203 9.8 205.7 10.6 208.3 11.5 210.9 12.3 213.6 13 216.2 13.4 218.8 13.6 221.4 13.5 224 13.1 226.7 12.6 229.3 11.8 231.9 10.9 234.5 9.8 237.1 8.7 236.9 8.3 234.3 9.4 231.7 10.4 229.1 11.3 226.5 12.1 224 12.6 221.4 13 218.8 13.1 216.2 12.9 213.6 12.5 211.1 11.9 208.5 11 205.9 10 203.4 8.8 200.8 7.7 198.2 6.6 195.6 5.7 193 4.9 190.3 4.4 187.6 4.2 184.9 4.2 182.2 4.6 179.5 5.2 176.8 6 174.1 7 171.5 8.1 168.9 9.1 166.3 10.1 163.7 11 161.2 11.8 158.7 12.3 156.2 12.6 153.8 12.7 151.3 12.6 148.9 12.3 146.4 11.7 143.9 11 141.4 10.2 138.8 9.3 136.3 8.3 133.7 7.3 131 6.4 128.3 5.5 125.6 4.9 122.8 4.4 120 4.1 117.2 4.2 114.4 4.5 111.6 5.2 108.9 6 106.1 7.1 103.5 8.3 100.9 9.5 98.3 10.6 95.8 11.6 93.4 12.4 91 13 88.6 13.3 86.3 13.4 83.9 13.1 81.5 12.7 79.1 12 76.6 11.1 74 10.1 71.4 9.1 68.8 8.1 66.1 7.2 63.4 6.4 60.6 5.8 57.9 5.4 55.1 5.2 52.3 5.2 49.6 5.5 46.8 5.9 44.1 6.5 41.4 7.3 38.8 8.1 36.2 9.1 33.6 10.1 31 11 28.5 11.9 26 12.6 23.5 13.2 21.1 13.6 18.6 13.8 16.1 13.7 13.6 13.4 11.1 12.9 8.5 12.2 5.9 11.4 3.1 10.8Z" />
  </svg>
);

/** Filet tracé à la main qui prolonge un intitulé jusqu'au bord de la colonne. */
const Rule = () => (
  <svg className="gc-recette__rule" viewBox="0 0 400 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path vectorEffect="non-scaling-stroke" d="M2 6.2C48 4.6 96 6.8 148 5.4S252 4.2 300 5.8S372 6.2 398 4.6" />
  </svg>
);

/** Pictogrammes de la ligne méta (viewBox 40 × 40, trait de 3 unités). */
const Clock = () => (
  <>
    <path d="M21.2 5.6C29.8 5.8 35.4 12.4 35 20.9C34.6 29.2 28.2 35 19.8 34.6C11.6 34.2 5.6 28 6 19.7C6.4 11.6 12.4 5.8 20.6 6.1C23.6 6.2 26 7 28.2 8.4" />
    <path d="M20.4 11.6L20.6 20.6L26.4 24.2" />
    <path className="gc-recette__pict-detail" d="M20.6 7.8V9.4M33 20.6H31.4M20.4 33V31.4M8 20.4H9.6" />
  </>
);
const Flame = () => (
  <>
    <path d="M20.2 4.6C21.4 10.2 29.6 14 29.4 23.4C29.2 30 24.8 35 19.6 35C13.8 35 10 30.6 10.4 24.6C10.8 19.4 14 17 15.4 12.6C17.2 15 17.8 17.8 17.4 20.6C19.4 17.2 20.6 11.2 20.2 4.6Z" />
    <path className="gc-recette__pict-detail" d="M19.8 32.6C16.8 32.2 15.4 29.4 16.4 26.8C17.4 24.4 19.6 23.6 20.2 21.2C22.6 23.6 24 26.4 23.2 29.4C22.8 31.2 21.6 32.4 19.8 32.6Z" />
  </>
);
const Hourglass = () => (
  <>
    <path d="M10.4 5.8C16.8 5.4 23.4 5.6 29.8 6M10.2 34.4C16.8 34.8 23.2 34.6 29.6 34.2" />
    <path d="M12.8 6.4C12.6 13.4 18.6 15.8 19.4 20.2C18.6 24.6 12.6 26.8 12.8 33.8M27.4 6.4C27.6 13.4 21.6 15.8 20.8 20.2C21.6 24.6 27.6 26.8 27.4 33.8" />
    <path className="gc-recette__pict-detail" d="M15.4 32.4C17 29.2 18.6 27.8 20.2 27.6C21.8 27.8 23.4 29.2 24.8 32.4M17.2 12.2C19 13 21.2 13 23 12.2" />
  </>
);
const Slice = () => (
  <>
    <path d="M5.4 22.4L27.6 11.2L35 17.2L5.4 22.4Z" />
    <path d="M5.4 22.4L5.2 30.6L34.8 25.8L35 17.2" />
    <path className="gc-recette__pict-detail" d="M5.6 26.4C14.6 25 24.4 23.4 34.6 21.6" />
    <path className="gc-recette__pict-berry" d="M27.6 4.6C30.2 4.4 31.8 6.4 31.4 8.6C31 10.6 28.8 11.6 26.8 10.8C24.8 10 24.4 7.6 25.6 6C26.2 5.2 26.8 4.8 27.6 4.6Z" />
  </>
);

const PICTS = {
  prep: { label: 'Préparation', draw: Clock },
  cook: { label: 'Cuisson', draw: Flame },
  rest: { label: 'Repos', draw: Hourglass },
  servings: { label: 'Parts', draw: Slice },
} as const;
type MetaKey = keyof typeof PICTS;

/** Petite feuille de sauge en guise de puce ; l'angle varie d'une ligne à l'autre. */
const LEAF_TILT = [-14, 6, -4, 12, -10, 2, -16, 8];
const Leaf = ({ i }: { i: number }) => (
  <svg className="gc-recette__leaf" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
    {/* Rotation interne au dessin : la boîte de mise en page reste carrée (pas de faux débordement). */}
    <g transform={`rotate(${LEAF_TILT[i % LEAF_TILT.length]} 14 14)`}>
      <path className="gc-recette__leaf-blade" d="M5.2 21.6C5.6 12.6 12.4 5.2 23.8 4.2C23.8 14.6 17.4 21.8 6.8 22.4Z" />
      <path className="gc-recette__leaf-vein" d="M3 25.2C8.6 18.2 13.6 12.6 19.6 8" />
    </g>
  </svg>
);

/** Cercle tracé d'un seul geste autour du numéro d'étape (le raccord tourne d'une étape à l'autre). */
const RING_TURN = [-24, 58, 148, 212, 300, 20];
const Ring = ({ i }: { i: number }) => (
  <svg className="gc-recette__ring" viewBox="4 4 48 48" aria-hidden="true" focusable="false">
    <path
      transform={`rotate(${RING_TURN[i % RING_TURN.length]} 28 28)`}
      d="M30.4 6.6C42.2 7 50.4 15.8 49.8 28.4C49.2 40.4 40.4 49.4 27.8 49.2C15.6 49 6.8 40.2 7.2 27.6C7.6 15.8 15.8 7.2 27.4 7C31.8 6.9 35.8 8.2 38.6 10"
    />
  </svg>
);

// --- Garde de débordement ----------------------------------------------------------------------
// On compare des boîtes de mise en page, pas scrollHeight : l'interligne serré des styles des tokens
// (Caveat 1,12 ; serif 1,05) fait toujours dépasser l'encre des glyphes de quelques pixels.

/** Tolérance pour les arrondis sous-pixel ; un vrai débordement vaut au moins une ligne. */
const SLACK = 2;

const inFlow = (c: Element) => {
  const pos = getComputedStyle(c).position;
  return pos !== 'absolute' && pos !== 'fixed';
};

/** Bas et droite des boîtes des enfants en flux (le texte réellement posé). */
function extent(box: Element) {
  let bottom = -Infinity;
  let right = -Infinity;
  for (const c of Array.from(box.children)) {
    if (!inFlow(c)) continue;
    const r = c.getBoundingClientRect();
    bottom = Math.max(bottom, r.bottom);
    right = Math.max(right, r.right);
  }
  return { bottom, right };
}

function overflows(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  const own = extent(el);
  // 1. Le contenu de la recette sort de sa propre boîte (hauteur imposée par le parent).
  if (own.bottom > box.bottom + SLACK || own.right > box.right + SLACK) return true;
  const parent = el.parentElement;
  if (!parent) return false;
  // 2. La pile du parent (recette, puis petit mot en bas) sort de sa zone de contenu.
  const cs = getComputedStyle(parent);
  const p = parent.getBoundingClientRect();
  const limitBottom = p.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth);
  const limitRight = p.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  const stack = extent(parent);
  return Math.max(stack.bottom, box.bottom) > limitBottom + SLACK || Math.max(stack.right, box.right) > limitRight + SLACK;
}

function useOverflowGuard(ref: React.RefObject<HTMLElement>, deps: unknown[]): boolean {
  const [over, setOver] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setOver(overflows(el));
    measure();
    let alive = true;
    // Les polices arrivent parfois après le premier rendu.
    document.fonts?.ready.then(() => alive && measure());
    if (typeof ResizeObserver === 'undefined') return () => void (alive = false);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    const parent = el.parentElement;
    if (parent) {
      ro.observe(parent);
      for (const sibling of Array.from(parent.children)) if (sibling !== el) ro.observe(sibling);
    }
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, deps);
  return over;
}

// --- Composant -------------------------------------------------------------------------------

export function Recette({ recipe, density = 'normal', className }: RecetteProps) {
  const titleClass = useTitleClass('recipe-title');
  const labelClass = useTitleClass('section-label');
  const ref = React.useRef<HTMLElement>(null);
  const over = useOverflowGuard(ref, [recipe, density, titleClass]);
  const handClass = density === 'compact' ? 'gc-hand-compact' : 'gc-hand-body';

  const meta = (['prep', 'cook', 'rest', 'servings'] as MetaKey[])
    .map((key) => ({ key, value: recipe[key] }))
    .filter((m): m is { key: MetaKey; value: string } => Boolean(m.value));

  const classes = ['gc-recette', `gc-recette--${density}`, over && 'gc-recette--overflow', className]
    .filter(Boolean)
    .join(' ');

  return (
    <article ref={ref} className={classes} data-gc-fit={over ? 'overflow' : 'ok'}>
      <header className="gc-recette__head">
        <h2 className={`gc-recette__title ${titleClass}`}>{recipe.title}</h2>
        <Underline />
        <ul className="gc-recette__meta gc-hand-meta">
          {meta.map(({ key, value }) => {
            const Draw = PICTS[key].draw;
            return (
              <li key={key} className={`gc-recette__meta-item gc-recette__meta-item--${key}`}>
                <svg className="gc-recette__pict" viewBox="0 0 40 40" role="img" aria-label={PICTS[key].label} focusable="false">
                  <Draw />
                </svg>
                <span className="gc-recette__meta-value">{value}</span>
              </li>
            );
          })}
        </ul>
      </header>

      <section className="gc-recette__section gc-recette__section--ingredients">
        <div className="gc-recette__label-row">
          <h3 className={`gc-recette__label ${labelClass}`}>Ingrédients</h3>
          <Rule />
        </div>
        <ul
          className={`gc-recette__ingredients ${handClass}`}
          style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil(recipe.ingredients.length / 2))}, auto)` }}
        >
          {recipe.ingredients.map((item, i) => (
            <li key={i} className="gc-recette__ingredient">
              <Leaf i={i} />
              <span className="gc-recette__ingredient-text">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="gc-recette__section gc-recette__section--steps">
        <div className="gc-recette__label-row">
          <h3 className={`gc-recette__label ${labelClass}`}>Préparation</h3>
          <Rule />
        </div>
        <ol className="gc-recette__steps">
          {recipe.steps.map((step, i) => (
            <li key={i} className="gc-recette__step">
              <span className="gc-recette__num" aria-hidden="true">
                <Ring i={i} />
                <span className="gc-recette__num-digit gc-hand-meta">{i + 1}</span>
              </span>
              <p className={`gc-recette__step-text ${handClass}`}>{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
