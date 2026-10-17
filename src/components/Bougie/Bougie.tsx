import React from 'react';
import { LazyMotion, domMax, m, useTransform, useReducedMotion } from '../../lib/motion';
import { useFeu } from '../../lib/feu';
import { useReglages } from '../../lib/reglages';
import { cssUrl } from '../../lib/assets';
import './Bougie.css';

export interface BougieProps {
  className?: string;
}

// Une petite source de lumière chaude, presque hors champ (lot L, plan v4) : une bougie coupée par le bord
// bas de l'écran, dans le coin droit de la table, sombre et peu détaillée. On voit surtout sa flamme et
// sa lueur, qui dansent sur la table et le bas de la page droite. La flamme est faite de deux calques
// cuits (scripts/bake-bougie.py) : le cœur bleu-blanc et la flamme orangée ; le halo est un dégradé radial
// CSS, doux et diffus. Ils ne bougent qu'en opacité et en transformation, pilotés par le feu
// (src/lib/feu.ts) : intensité → échelle et opacité ; dx → balancement très léger.
//
// Mouvement réduit (système ou réglage) ou réglage feu: false : la flamme reste fixe (intensité 1, pas
// de balancement) ; le moteur du feu s'arrête de lui-même dans ce cas. Rien ne capte le pointeur. Sur
// téléphone en portrait, le CSS cache la bougie et garde la lueur seule.
//
// Le composant se monte dans Stage, au-dessus de la table et du livre, sous les contrôles. Sa position est
// fixe dans la scène (Bougie.css) : elle ne recouvre jamais le texte du livre.

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

  // Flamme : échelle et opacité suivent l'intensité ; le balancement (degrés) suit le déplacement de la
  // source, lent (0,2 à 0,5 Hz, ≈ ± 3°).
  const echelleCorps = useTransform(intensite, (i) => r3(borne(1 + 0.5 * (i - 1), 0.8, 1.25)));
  const echelleCoeur = useTransform(intensite, (i) => r3(borne(1 + 0.25 * (i - 1), 0.9, 1.12)));
  const opaciteCorps = useTransform(intensite, (i) => r3(borne(0.85 + 0.9 * (i - 1), 0.55, 1)));
  const opaciteCoeur = useTransform(intensite, (i) => r3(borne(0.88 + 0.9 * (i - 1), 0.62, 1)));
  const balancementCorps = useTransform(dx, (v) => r2(borne(0.22 * v, -3, 3)));
  const balancementCoeur = useTransform(dx, (v) => r2(borne(0.1 * v, -1.2, 1.2)));

  // Halo : lueur large et diffuse, centrée sur la flamme ; son opacité suit l'intensité, il glisse à peine.
  const opaciteHalo = useTransform(intensite, (i) => r3(borne(0.72 + 0.55 * (i - 1), 0.42, 1)));
  const echelleHalo = useTransform(intensite, (i) => r3(borne(1 + 0.16 * (i - 1), 0.86, 1.22)));
  const glisseX = useTransform(dx, (v) => r2(0.6 * v));

  const vars = {
    '--gc-bougie-bougie': cssUrl('bougie/bougie'),
    '--gc-bougie-corps': cssUrl('bougie/flamme-corps'),
    '--gc-bougie-coeur': cssUrl('bougie/flamme-coeur'),
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
        <div className="gc-bougie__pose">
          <div className="gc-bougie__bougie" data-gc-bougie="cire" />
          <m.div
            className="gc-bougie__flamme gc-bougie__flamme--corps"
            data-gc-bougie="flamme"
            style={{ opacity: opaciteCorps, scale: echelleCorps, rotate: balancementCorps }}
          />
          <m.div
            className="gc-bougie__flamme gc-bougie__flamme--coeur"
            data-gc-bougie="coeur"
            style={{ opacity: opaciteCoeur, scale: echelleCoeur, rotate: balancementCoeur }}
          />
        </div>
      </div>
    </LazyMotion>
  );
}
