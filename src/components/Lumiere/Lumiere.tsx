import React from 'react';
import { LazyMotion, domMax, m, useTransform } from '../../lib/motion';
import { flammeBougie, useFeu } from '../../lib/feu';
import { assetInfo, cssUrl } from '../../lib/assets';
import { useSettings } from '../../lib/settings';
import tracee from './tracee.json';
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
  return LUMIERE_TRACEE ? null : <LumiereTableCss />;
}

function LumiereTableCss() {
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
  return LUMIERE_TRACEE ? <LumiereTracee /> : <LumiereLivreCss />;
}

function LumiereLivreCss() {
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
export function OmbreFeu(props: OmbreFeuProps) {
  return LUMIERE_TRACEE ? null : <OmbreFeuCss {...props} />;
}

function OmbreFeuCss({ className }: OmbreFeuProps) {
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

// ---- Éclairage tracé (scripts/lumiere3d : Cycles) ------------------------------------------------
// La table, le livre et les trois lumières (bougie, cheminée, pénombre de la pièce) rendus par lancer de
// rayons, pour chaque cran de distance et chaque état du livre ; les calques remplacent alors le bain, le
// voile, l'ambiance, la pénombre de la table et les ombres génériques du livre. Par état : un calque
// statique (la lumière au plus fort : il assombrit, teinte, éclaircit le bois près de la bougie) et deux
// voiles noirs dont l'opacité suit la flamme de la bougie et le feu. Le CSS montre l'état courant du
// livre (fondu à l'ouverture, à la fermeture, à l'arrivée sur la table vide).

/** Vrai quand les calques tracés sont cuits (design-system/baked/lumiere/). */
export const LUMIERE_TRACEE = !!assetInfo('lumiere/vide');

const ETATS = ['vide', 'couverture', 'arriere', 'ouvert'] as const;

function LumiereTracee() {
  const { distance } = useSettings();
  const { intensite } = useFeu();
  // feu : part de la cheminée 0,8 + 0,5 (i − 1), entre 0,6 et 1 ; le voile noir vaut sa baisse à 0,6
  const feuOp = useTransform(intensite, (i) => r4(borne((0.2 - 0.5 * (i - 1)) / 0.4, 0, 1)));
  // bougie : son éclat (éclat × étirement × luminosité de l'image, ≈ 0,85 à 1,07) ; le voile noir vaut sa baisse à la moitié
  const bougieOp = useTransform(flammeBougie, (v) => r4(borne((1.06 - v) / 0.5, 0, 1)));
  const { marge, w, h, bords } = tracee as { marge: number; w: number; h: number; bords: Record<string, number[]> };
  const boite = { left: -marge, top: -marge, width: w, height: h };
  return (
    <LazyMotion features={domMax}>
      <div className="gc-lumiere gc-lumiere--tracee" aria-hidden="true">
        {ETATS.map((e) => {
          const nom = e === 'vide' ? 'vide' : `${distance}-${e}`;
          if (!assetInfo(`lumiere/${nom}`)) return null;
          const [r, g, b, a] = bords[nom] ?? [0, 0, 0, 0];
          const bord = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
          return (
            <div key={e} className="gc-lumiere-tracee" data-gc-lumiere-etat={e}>
              {/* au-delà des calques (téléphone, tablette) : la couleur de leur bord */}
              <div className="gc-lumiere-tracee__fond" style={{ ...boite, backgroundImage: cssUrl(`lumiere/${nom}`), boxShadow: `0 0 0 4000px ${bord}` }} />
              <m.div className="gc-lumiere-tracee__voile" data-gc-lumiere="feu" style={{ ...boite, backgroundImage: cssUrl(`lumiere/${nom}-feu`), opacity: feuOp }} />
              <m.div className="gc-lumiere-tracee__voile" data-gc-lumiere="bougie" style={{ ...boite, backgroundImage: cssUrl(`lumiere/${nom}-bougie`), opacity: bougieOp }} />
            </div>
          );
        })}
      </div>
    </LazyMotion>
  );
}
