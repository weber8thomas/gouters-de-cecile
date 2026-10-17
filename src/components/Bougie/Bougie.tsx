import React from 'react';
import { LazyMotion, domMax, m, useTransform, useReducedMotion } from '../../lib/motion';
import { useFeu } from '../../lib/feu';
import { useReglages } from '../../lib/reglages';
import { cssUrl } from '../../lib/assets';
import './Bougie.css';

export interface BougieProps {
  className?: string;
}

// Une vraie bougie de cire crème, allumée, dans le coin bas gauche de l'écran, au premier plan et hors du
// plan de netteté : une photo (Pexels, voir design-system/sources/bougie/credits.json) détourée puis floutée
// et assombrie par scripts/bake-bougie.py. On la devine plus qu'on ne la voit : le corps est sombre et flou,
// la flamme est le seul point vif, et sa lueur chaude éclaire la table et le bord du livre. Elle dépasse du
// cadre à gauche et en bas ; elle ne recouvre jamais le texte du livre (Bougie.css).
//
// Trois calques cuits, sur la même grille de pixels : la cire (bougie.webp, fixe), la flamme (flamme.webp,
// animée), la lueur (halo.webp, qui suit l'intensité). Ils ne bougent qu'en transformation et en opacité,
// pilotés par le feu (src/lib/feu.ts) : l'intensité règle l'échelle (0,96 à 1,04) et l'opacité de la flamme,
// et l'opacité de la lueur ; dx donne une petite rotation de la flamme (au plus 1,5°), autour de la mèche.
// Aucun filtre à l'exécution.
//
// Mouvement réduit (système ou réglage) ou réglage feu: false : la flamme reste fixe (intensité 1, dx 0) ; le
// moteur du feu s'arrête de lui-même dans ce cas. Rien ne capte le pointeur. Sur téléphone en portrait, le CSS
// cache la bougie et garde la lueur seule.

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;
const r2 = (v: number) => Math.round(v * 1e2) / 1e2;

export function Bougie({ className }: BougieProps) {
  const feu = useFeu();
  const [reglages] = useReglages();
  const mouvementReduit = useReducedMotion();
  // Figé : le moteur du feu sert déjà l'intensité 1 et dx 0 ; la lecture ci-dessous les neutralise
  // aussi côté calque, sans dépendre de l'ordre des abonnements.
  const fixeRef = React.useRef(false);
  fixeRef.current = mouvementReduit || reglages.feu === false;

  const intensite = useTransform(feu.intensite, (i) => (fixeRef.current ? 1 : i));
  const dx = useTransform(feu.dx, (v) => (fixeRef.current ? 0 : v));

  // Flamme : l'échelle reste dans 0,96 à 1,04, l'opacité dans 0,7 à 1, la rotation dans ± 1,5°.
  const echelleFlamme = useTransform(intensite, (i) => r3(borne(1 + 0.08 * (i - 1), 0.96, 1.04)));
  const opaciteFlamme = useTransform(intensite, (i) => r3(borne(0.88 + 0.24 * (i - 1), 0.7, 1)));
  const rotationFlamme = useTransform(dx, (v) => r2(borne(0.07 * v, -1.5, 1.5)));

  // Lueur : elle suit l'intensité (opacité, un peu d'échelle) et glisse à peine avec la source.
  const opaciteHalo = useTransform(intensite, (i) => r3(borne(0.8 + 0.4 * (i - 1), 0.5, 1.15)));
  const echelleHalo = useTransform(intensite, (i) => r3(borne(1 + 0.05 * (i - 1), 0.96, 1.04)));
  const glisseX = useTransform(dx, (v) => r2(borne(0.4 * v, -9, 9)));

  const vars = {
    '--gc-bougie-cire': cssUrl('bougie/bougie'),
    '--gc-bougie-flamme': cssUrl('bougie/flamme'),
    '--gc-bougie-halo': cssUrl('bougie/halo'),
  } as React.CSSProperties;

  return (
    <LazyMotion features={domMax}>
      <div
        className={['gc-bougie', className].filter(Boolean).join(' ')}
        data-gc-bougie="bougie"
        aria-hidden="true"
        style={vars}
      >
        <m.div
          className="gc-bougie__halo"
          data-gc-bougie="halo"
          style={{ opacity: opaciteHalo, scale: echelleHalo, x: glisseX }}
        />
        <div className="gc-bougie__pose" data-gc-bougie="pose">
          <div className="gc-bougie__cire" data-gc-bougie="cire" />
          <m.div
            className="gc-bougie__flamme"
            data-gc-bougie="flamme"
            style={{ opacity: opaciteFlamme, scale: echelleFlamme, rotate: rotationFlamme }}
          />
        </div>
      </div>
    </LazyMotion>
  );
}
