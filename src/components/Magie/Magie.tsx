// La magie du carnet (piste « magie ») : une seule toile WebGL par livre, posée dans la caméra au-dessus
// du livre (elle suit le zoom et l'ouverture), qui ne capte jamais le pointeur. Le moteur (moteur.ts) fait
// tout hors React : aucun rendu pendant un geste. Sans WebGL, ou si le contexte est perdu : pas de magie,
// le livre reste le même.
import React from 'react';
import { useReducedMotion } from '../../lib/motion';
import { demarrerMagie, type LiensMagie, type GeoMagie } from './moteur';
import './Magie.css';

export type { TourMagie, RabatMagie, GeoMagie } from './moteur';

export interface MagieProps {
  /** La MotionValue du tourne-page (0 = feuille à droite, 1 = à gauche). */
  p: LiensMagie['p'];
  /** Le tour en cours (null au repos). */
  tour: LiensMagie['tour'];
  /** Les rabats du coin qui suit le doigt (px de page, depuis la reliure). */
  rabats: LiensMagie['rabats'];
  /** La racine du livre (.gc-livre) : gestes, touchers, pages visibles. */
  livre: LiensMagie['livre'];
  /** Zoom de la caméra (recul de l'ouverture). */
  zoom: LiensMagie['zoom'];
  /** Géométrie du cran (px de scène). */
  geo: GeoMagie | null;
}

export function Magie({ p, tour, rabats, livre, zoom, geo }: MagieProps) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const reduit = useReducedMotion();
  const vivant = React.useRef({ geo, reduit });
  vivant.current = { geo, reduit };
  const [perdue, setPerdue] = React.useState(false);

  React.useEffect(() => {
    const toile = ref.current;
    if (!toile || perdue) return undefined;
    const moteur = demarrerMagie(toile, { p, tour, rabats, livre, zoom, geo: () => vivant.current.geo, reduit: () => vivant.current.reduit });
    if (!moteur) {
      setPerdue(true);
      return undefined;
    }
    const perte = (e: Event) => {
      e.preventDefault();
      moteur.arreter();
      setPerdue(true);
    };
    toile.addEventListener('webglcontextlost', perte);
    return () => {
      toile.removeEventListener('webglcontextlost', perte);
      moteur.arreter();
    };
  }, [p, tour, rabats, livre, zoom, perdue]);

  if (perdue) return null;
  return <canvas ref={ref} className="gc-magie" aria-hidden="true" />;
}
