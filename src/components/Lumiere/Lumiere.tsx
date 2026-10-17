import React from 'react';
import { LazyMotion, domMax, m, useTransform } from '../../lib/motion';
import { useFeu } from '../../lib/feu';
import './Lumiere.css';

// Lumière du soir au coin du feu (plan v4, lot L). Une cheminée hors champ, à GAUCHE de la table (un
// peu au-dessus du milieu de la scène) éclaire la table et le livre d'une lumière chaude qui vacille.
// Même côté partout : bain sur la table à gauche, ombres portées vers la droite (et un peu vers le
// bas), voile plus fort côté gauche — cohérent avec les ombres du livre (lot A : vers le bas à droite).
//
// Tous les calques sont des dégradés CSS statiques, peints une fois ; le feu (src/lib/feu.ts) ne
// change que leur opacité et leur transformation (MotionValues, aucun rendu React, aucun Paint).
// Deux calques vivants : le bain (+ ombre portée générique) sous le livre, le voile au-dessus ;
// l'ambiance (vignettage) est statique.
// Rien ne capte le pointeur.

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
// Opacité d'un calque selon l'intensité du feu (src/lib/feu.ts, entre 0,6 et 1,6) : `base` pour un feu moyen
// (1), qui varie de `pente` par unité d'intensité, bornée à [min, max].
const reglage = (i: number, base: number, pente: number, min: number, max: number) => r4(borne(base + pente * (i - 1), min, max));

/**
 * Sous le contenu (sur la table) : la lueur indirecte, orangée, côté feu, et l'ombre portée générique du
 * livre au repos, côté opposé : un calque, opacité + translation, qui suit la flamme.
 */
export function LumiereTable() {
  const { intensite, dx, dy } = useFeu();
  const bainOp = useTransform(intensite, (i) => reglage(i, 0.55, 1.2, 0.2, 1));
  // Un seul calque vivant sous le livre (budget de calques) : l'ombre portée générique y est peinte et
  // vacille avec lui (plus marquée quand le feu flambe).
  return (
    <LazyMotion features={domMax}>
      <div className="gc-lumiere gc-lumiere--table" aria-hidden="true">
        <m.div className="gc-lumiere__bain" data-gc-lumiere="bain" style={{ opacity: bainOp, x: dx, y: dy }}>
          <div className="gc-lumiere__ombre" data-gc-lumiere="ombre" />
        </m.div>
      </div>
    </LazyMotion>
  );
}

/**
 * Au-dessus du contenu (sous les contrôles, la loupe les laisse hors du calque) : l'ambiance du soir
 * (vignettage chaud des bords et des coins, pénombre côté opposé au feu, statique), puis le voile chaud
 * sur le livre, plus fort côté feu, à très faible opacité, qui vacille (l'encre garde au moins 90 % de
 * son contraste : scripts/verify-lumiere.mjs).
 */
export function LumiereLivre() {
  const { intensite } = useFeu();
  const voileOp = useTransform(intensite, (i) => reglage(i, 0.6, 0.5, 0.25, 1));
  return (
    <LazyMotion features={domMax}>
      <div className="gc-lumiere gc-lumiere--livre" aria-hidden="true">
        <div className="gc-lumiere__ambiance" data-gc-lumiere="ambiance" />
        <m.div className="gc-lumiere__voile" data-gc-lumiere="voile" style={{ opacity: voileOp }} />
      </div>
    </LazyMotion>
  );
}

export interface OmbreFeuProps {
  className?: string;
}

/**
 * Ombre portée du livre par le feu, pour le livre lui-même (branchement proposé au lot A) : à poser dans
 * `.gc-livre__corps`, AVANT les cartons (elle passe dessous), pour qu'elle suive le livre (fermé,
 * ouvert, arrivée, zoom fin). Elle part du bord droit du carton, côté opposé au feu. Quand elle est
 * montée, l'ombre générique de la scène (calée sur le livre ouvert au repos) s'efface d'elle-même.
 */
export function OmbreFeu({ className }: OmbreFeuProps) {
  const { intensite, dx, dy } = useFeu();
  const op = useTransform(intensite, (i) => reglage(i, 0.6, 0.9, 0.2, 1));
  const x = useTransform(dx, (v) => r4(-0.6 * v));
  const y = useTransform(dy, (v) => r4(-0.35 * v));
  return (
    <LazyMotion features={domMax}>
      <m.div
        className={['gc-ombre-feu', className].filter(Boolean).join(' ')}
        data-gc-lumiere="ombre-livre"
        aria-hidden="true"
        style={{ opacity: op, x, y }}
      />
    </LazyMotion>
  );
}
