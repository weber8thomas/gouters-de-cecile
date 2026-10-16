import React from 'react';
import { ILLUSTRATIONS } from '../../generated/illustrations.gen';
import { useSettings } from '../../lib/settings';
import './SceneVideo.css';

// Scène vidéo factice : une illustration de design-system/illustrations/scenes/<scene>.svg,
// insérée deux fois — une copie « avant lecture » figée et traitée (aquarelle ou sépia),
// une copie « en lecture » en couleur et animée (classes gc-anim-*). Fondu entre les deux.

export type SceneVideoLook = 'aquarelle' | 'sepia';
export type SceneVideoState = 'idle' | 'playing';

export interface SceneVideoProps {
  /** Slug de la scène : ILLUSTRATIONS['scenes/<scene>'], ex. « julie ». */
  scene: string;
  /** Traitement de l'image figée avant lecture. Par défaut : useSettings().idle. */
  look?: SceneVideoLook;
  /** Si fourni, commande l'état ; sinon l'état suit l'ancêtre `.gc-ecrin[data-state]`. */
  state?: SceneVideoState;
  className?: string;
}

/** Préfixe tous les ids d'une copie de SVG : `id="…"`, `url(#…)`, `href="#…"` (et `xlink:href`). */
function scopeSvgIds(svg: string, prefix: string): string {
  const ids = new Set<string>();
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  if (!ids.size) return svg;
  return svg
    .replace(/(\s)id="([^"]+)"/g, (_m, sp: string, id: string) => `${sp}id="${prefix}${id}"`)
    .replace(/url\(\s*#([^)\s]+)\s*\)/g, (m, id: string) => (ids.has(id) ? `url(#${prefix}${id})` : m))
    .replace(/(\s(?:xlink:)?href=")#([^"]+)"/g, (m, attr: string, id: string) => (ids.has(id) ? `${attr}#${prefix}${id}"` : m));
}

const viewBoxOf = (svg: string): number[] => {
  const m = /viewBox="([^"]+)"/.exec(svg);
  const v = m ? m[1].trim().split(/[\s,]+/).map(Number) : [];
  return v.length === 4 && v.every((n) => Number.isFinite(n)) ? v : [0, 0, 1600, 900];
};

// Filtres « avant lecture » (unités de la scène). Couleurs de papier tirées des tokens via
// flood-color: var(--gc-…). Aucun n'est animé : ils ne s'appliquent qu'à la copie figée.
const OPAQUE_GRAY = '1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1';
const LUMA_ALPHA = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.3 0.59 0.11 0 0';

function aquarelle(id: string, region: string): string {
  return `<filter id="${id}" ${region}>`
    // lavis : couleurs sans les traits fins (dilatation), qui bavent et débordent un peu des contours
    + '<feMorphology in="SourceGraphic" operator="dilate" radius="1.6" result="open"/>'
    + '<feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="4" result="n"/>'
    + '<feDisplacementMap in="open" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G" result="d"/>'
    + '<feGaussianBlur in="d" stdDeviation="1.1" result="d2"/>'
    + '<feComposite in="d2" in2="SourceGraphic" operator="over" result="bled"/>'
    // pigment accumulé au bord des zones : |luminance − luminance floutée| → liseré plus foncé
    + '<feGaussianBlur in="bled" stdDeviation="3.5" result="soft"/>'
    + `<feColorMatrix in="bled" type="matrix" values="${LUMA_ALPHA}" result="lb"/>`
    + `<feColorMatrix in="soft" type="matrix" values="${LUMA_ALPHA}" result="ls"/>`
    + '<feComposite in="lb" in2="ls" operator="arithmetic" k2="1" k3="-1" result="e1"/>'
    + '<feComposite in="ls" in2="lb" operator="arithmetic" k2="1" k3="-1" result="e2"/>'
    + '<feComposite in="e1" in2="e2" operator="arithmetic" k2="3" k3="3" result="edge"/>'
    + '<feComponentTransfer in="bled" result="pig"><feFuncR type="linear" slope="0.76"/><feFuncG type="linear" slope="0.72"/><feFuncB type="linear" slope="0.72"/></feComponentTransfer>'
    + '<feComposite in="pig" in2="edge" operator="in" result="rim"/>'
    + '<feMerge result="wet"><feMergeNode in="bled"/><feMergeNode in="rim"/></feMerge>'
    // couleurs pastel tirées vers le papier
    + '<feColorMatrix in="wet" type="saturate" values="0.85" result="ds"/>'
    + '<feFlood style="flood-color: var(--gc-paper)" result="paper"/>'
    + '<feComposite in="ds" in2="paper" operator="arithmetic" k2="0.8" k3="0.2" result="pastel"/>'
    // trait à l'encre par-dessus, à peine tremblé (les tons les plus sombres de l'image)
    + '<feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="8" result="n2"/>'
    + '<feMorphology in="SourceGraphic" operator="erode" radius="1.1" result="thick"/>'
    + '<feDisplacementMap in="thick" in2="n2" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="inkD"/>'
    + '<feColorMatrix in="inkD" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1.35 -2.66 -0.5 0 2.25" result="ink"/>'
    + '<feComposite in="ink" in2="pastel" operator="over" result="art"/>'
    // lavis inégal + grain du papier (multiplication)
    + '<feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="9" result="w0"/>'
    + `<feColorMatrix in="w0" type="matrix" values="${OPAQUE_GRAY}" result="wash"/>`
    + '<feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="2" result="g0"/>'
    + `<feColorMatrix in="g0" type="matrix" values="${OPAQUE_GRAY}" result="grain"/>`
    + '<feComposite in="wash" in2="grain" operator="arithmetic" k2="0.26" k3="0.05" k4="0.85" result="map"/>'
    + '<feComposite in="art" in2="map" operator="arithmetic" k1="1"/>'
    + '</filter>';
}

// Carte de dégradé sépia : la luminance est répartie sur les cinq tons gc-sepia-4 (ombres) → gc-sepia-0 (papier).
const SEPIA_STOPS = ['--gc-sepia-4', '--gc-sepia-3', '--gc-sepia-2', '--gc-sepia-1', '--gc-sepia-0'];
const RGB = (inner: string) => `<feFuncR ${inner}/><feFuncG ${inner}/><feFuncB ${inner}/>`;

function sepia(id: string, region: string): string {
  const n = SEPIA_STOPS.length;
  let map = '';
  SEPIA_STOPS.forEach((token, i) => {
    const table = Array.from({ length: n }, (_, k) => (k === i ? 1 : 0)).join(' ');
    map += `<feComponentTransfer in="L" result="w${i}">${RGB(`type="table" tableValues="${table}"`)}</feComponentTransfer>`
      + `<feFlood style="flood-color: var(${token})" result="c${i}"/>`
      + `<feComposite in="w${i}" in2="c${i}" operator="arithmetic" k1="1" result="p${i}"/>`
      + (i ? `<feComposite in="${i === 1 ? 'p0' : `s${i - 1}`}" in2="p${i}" operator="arithmetic" k2="1" k3="1" result="s${i}"/>` : '');
  });
  return `<filter id="${id}" ${region}>`
    // très léger tremblé de crayon
    + '<feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="11" result="n"/>'
    + '<feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="d"/>'
    + '<feComposite in="d" in2="SourceGraphic" operator="over" result="src"/>'
    // luminance + contraste, puis carte sépia
    + '<feColorMatrix in="src" type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 0 1" result="L0"/>'
    + `<feComponentTransfer in="L0" result="L">${RGB('type="linear" slope="1.24" intercept="-0.1"')}</feComponentTransfer>`
    + map
    // grain de graphite : le papier transparaît par points dans les zones sombres
    + '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="5" result="g"/>'
    + '<feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.4 0 0 0 -1.15" result="specks"/>'
    + '<feColorMatrix in="L" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1 0 0 0 1" result="dark"/>'
    + '<feComposite in="specks" in2="dark" operator="arithmetic" k1="0.8" result="m"/>'
    + `<feComposite in="c${n - 1}" in2="m" operator="in" result="sp"/>`
    + `<feMerge result="pencil"><feMergeNode in="s${n - 1}"/><feMergeNode in="sp"/></feMerge>`
    // grain du papier
    + '<feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="3" result="p0n"/>'
    + `<feColorMatrix in="p0n" type="matrix" values="${OPAQUE_GRAY}" result="pg"/>`
    + '<feComposite in="pencil" in2="pg" operator="arithmetic" k1="0.12" k2="0.94"/>'
    + '</filter>';
}

/** Copie d'un SVG de scène : ids préfixés, remplit son conteneur (slice), filtre éventuel. */
function prepareCopy(svg: string, prefix: string, treat?: { look: SceneVideoLook; filterId: string }): string {
  const scoped = scopeSvgIds(svg, prefix);
  const open = scoped.indexOf('<svg');
  const end = scoped.indexOf('>', open);
  const close = scoped.lastIndexOf('</svg>');
  if (open < 0 || end < 0 || close < 0) return '';
  const tag = scoped.slice(open, end).replace(/\s(width|height|preserveAspectRatio|class|style)="[^"]*"/g, '');
  let body = scoped.slice(end + 1, close);
  if (treat) {
    const [x, y, w, h] = viewBoxOf(svg);
    // région un peu plus grande que le cadre : flou et déplacement ne « mordent » pas sur les bords
    const m = Math.round(Math.max(w, h) * 0.03);
    const region = `x="${x - m}" y="${y - m}" width="${w + 2 * m}" height="${h + 2 * m}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"`;
    const filter = treat.look === 'sepia' ? sepia(treat.filterId, region) : aquarelle(treat.filterId, region);
    body = `<defs>${filter}</defs><g filter="url(#${treat.filterId})">${body}</g>`;
  }
  return `${tag} class="gc-scene-video__svg" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">${body}</svg>`;
}

export function SceneVideo({ scene, look, state, className }: SceneVideoProps) {
  const settings = useSettings();
  const lk: SceneVideoLook = look ?? settings.idle;
  const base = `gcsv-${React.useId().replace(/:/g, '')}`;
  const source = ILLUSTRATIONS[`scenes/${scene}`];

  const copies = React.useMemo(() => {
    if (!source) return null;
    return {
      still: prepareCopy(source, `${base}-s-`, { look: lk, filterId: `${base}-filter` }),
      live: prepareCopy(source, `${base}-l-`),
    };
  }, [source, base, lk]);

  const classes = ['gc-scene-video', className].filter(Boolean).join(' ');
  return (
    <div className={classes} data-state={state} data-look={lk} data-scene={scene} aria-hidden="true">
      {copies && (
        <>
          <div className="gc-scene-video__layer gc-scene-video__live" dangerouslySetInnerHTML={{ __html: copies.live }} />
          <div className="gc-scene-video__layer gc-scene-video__still" dangerouslySetInnerHTML={{ __html: copies.still }} />
        </>
      )}
    </div>
  );
}
