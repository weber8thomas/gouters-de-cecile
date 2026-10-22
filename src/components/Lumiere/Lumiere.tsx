import React from 'react';
import { useVacille } from '../../lib/vacille';
import { useReglages } from '../../lib/reglages';
import { assetInfo, cssUrl } from '../../lib/assets';
import tracee from './tracee.json';
import './Lumiere.css';

// Lumière du soir au coin du feu (plan v4, lot L). Une cheminée hors champ, à GAUCHE de la table (un
// peu au-dessus du milieu de la scène) éclaire la table et le livre d'une lumière chaude qui vacille.
// Même côté partout : bain sur la table à gauche, ombres portées vers la droite (et un peu vers le
// bas), voile plus fort côté gauche — cohérent avec les ombres du livre (lot A : vers le bas à droite).
//
// Tous les calques sont des dégradés CSS statiques, peints une fois. Le vacillement du feu n'est PLUS calculé en
// JavaScript à chaque image : chaque calque vivant reçoit une animation d'opacité sur le compositeur
// (src/lib/vacille.ts : courbe lente et irrégulière précalculée, calque promu par will-change), sans repeinture.
// Deux calques vivants : le bain (+ ombre portée générique) sous le livre, le voile au-dessus ;
// l'ambiance (vignettage) est statique.
// Rien ne capte le pointeur.

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
// Opacité d'un calque selon l'intensité du feu (entre 0,6 et 1,6) : `base` pour un feu moyen (1), qui varie de
// `pente` par unité d'intensité, bornée à [min, max]. La lumière fixe est celle du feu moyen (i = 1).
const reglage = (i: number, base: number, pente: number, min: number, max: number) => r4(borne(base + pente * (i - 1), min, max));

const calculOpacitePapier = (lum: number, eclat: number) => {
  // Flamme et feu moyens. À 200 % (eclat = 2), ≈ 0,76 : de la marge au-dessus pour les flambées sans écrêter à 1.
  return r4(borne(Math.min(0.86, 0.46 * Math.pow(eclat, 0.72) * (0.88 + 0.08 * lum)), 0.08, 1));
};

/**
 * Sous le contenu (sur la table) : la lueur indirecte, orangée, côté feu, et l'ombre portée générique du
 * livre au repos, côté opposé : un calque dont l'opacité vacille.
 */
export function LumiereTable() {
  return LUMIERE_TRACEE ? <LumiereTracee /> : <LumiereTableCss />;
}

function LumiereTableCss() {
  const [reglages] = useReglages();
  const lum = reglages.luminosite ?? 1.5;
  const bain = React.useRef<HTMLDivElement>(null);
  const base = reglage(1, 0.55 * lum, 1.2 * lum, 0.2, 1);
  useVacille(bain, base, 0.3, 0);
  // Un seul calque vivant sous le livre (budget de calques) : l'ombre portée générique y est peinte et
  // vacille avec lui.
  return (
    <div className="gc-lumiere gc-lumiere--table" aria-hidden="true">
      <div ref={bain} className="gc-lumiere__bain" data-gc-lumiere="bain" style={{ opacity: base }}>
        <div className="gc-lumiere__ombre" data-gc-lumiere="ombre" />
      </div>
    </div>
  );
}

/**
 * Au-dessus du contenu (sous les contrôles, la loupe les laisse hors du calque) : l'ambiance du soir
 * (vignettage chaud des bords et des coins, pénombre côté opposé au feu, statique), puis le voile chaud
 * sur le livre, plus fort côté feu, à très faible opacité, qui vacille (l'encre garde au moins 90 % de
 * son contraste : scripts/verify-lumiere.mjs).
 */
export function LumiereLivre() {
  // Le transport du livre ne peut pas être projeté sur un rectangle d'écran : la couverture et les
  // feuilles se déplacent. Leur lumière est maintenant dans leurs surfaces (LumierePapier).
  return LUMIERE_TRACEE ? null : <LumiereLivreCss />;
}

/** Lumière reçue par le papier, SOUS l'encre et les objets collés. Chaque copie de la face tournée
 * emporte le même éclairage : aucun rectangle de lumière ne peut rester sur la table découverte.
 * La chaleur vient d'une lumière ambrée sur le papier, jamais d'un voile clair sur les glyphes.
 */
export function LumierePapier({ side }: { side: 'left' | 'right' }) {
  const [reglages] = useReglages();
  const luminosite = reglages.luminosite ?? 1.5;
  const eclatBougie = reglages.eclatBougie ?? 2;
  // Une pénombre douce modulée par la luminosité générale ; au-delà de 150 %, un voile crème éclaircit encore le papier.
  const penombreOp = r4(borne(0.22 - 0.4 * (luminosite - 1), 0, 0.55));
  const clarteOp = r4(borne((luminosite - 1.5) * 0.28, 0, 0.45));
  const base = calculOpacitePapier(luminosite, eclatBougie);
  const bougie = React.useRef<HTMLDivElement>(null);
  // chaque face vacille à sa phase : la gauche (près de la bougie) plus ample
  useVacille(bougie, base, side === 'left' ? 0.12 : 0.09, side === 'left' ? 0.1 : 0.55);
  return (
    <div className={`gc-lumiere-papier gc-lumiere-papier--${side}`} data-gc-lumiere-surface="papier" aria-hidden="true">
      <div className="gc-lumiere-papier__penombre" style={{ opacity: penombreOp }} />
      {clarteOp > 0 && <div className="gc-lumiere-papier__clarte" style={{ opacity: clarteOp }} />}
      <div ref={bougie} className="gc-lumiere-papier__bougie" data-gc-lumiere="papier-bougie" style={{ opacity: base }} />
    </div>
  );
}

function LumiereLivreCss() {
  const voile = React.useRef<HTMLDivElement>(null);
  const base = reglage(1, 0.6, 0.5, 0.25, 1);
  useVacille(voile, base, 0.1, 0.3);
  return (
    <div className="gc-lumiere gc-lumiere--livre" aria-hidden="true">
      <div className="gc-lumiere__ambiance" data-gc-lumiere="ambiance" />
      <div ref={voile} className="gc-lumiere__voile" data-gc-lumiere="voile" style={{ opacity: base }} />
    </div>
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
  const ombre = React.useRef<HTMLDivElement>(null);
  const base = reglage(1, 0.6, 0.9, 0.2, 1);
  useVacille(ombre, base, 0.15, 0.7);
  return (
    <div
      ref={ombre}
      className={['gc-ombre-feu', className].filter(Boolean).join(' ')}
      data-gc-lumiere="ombre-livre"
      aria-hidden="true"
      style={{ opacity: base }}
    />
  );
}

// ---- Table tracée (scripts/lumiere3d : Cycles) ---------------------------------------------------
// Seule la table vide est une surface immobile : son fond + ses deux variations restent sous le livre.
// Les anciennes silhouettes Cycles du livre sont conservées dans les sources mais ne sont plus
// projetées à l'écran. Le papier reçoit sa lumière dans Face, et le livre porte ses propres ombres.

/** Vrai quand les calques tracés sont cuits (design-system/baked/lumiere/). */
export const LUMIERE_TRACEE = !!assetInfo('lumiere/vide');

/**
 * Sur la table, au-delà de la marge des calques tracés (écran d'une autre forme que la scène : la table
 * déborde, Stage `debord`) : la couleur de leur bord, la pénombre de la pièce. Un cadre peint avec la
 * table : aucun calque de plus. (Une ombre d'étalement de 4000 px sur le fond tracé faisait la même chose,
 * mais gonflait le calque de la lumière à 10 720 px de côté : des centaines de Mo sur un téléphone.)
 */
export function PenombreTable() {
  if (!LUMIERE_TRACEE) return null;
  const { marge, bords } = tracee as { marge: number; bords: Record<string, number[]> };
  const [r, g, b, a] = bords.vide ?? [0, 0, 0, 0];
  const style = {
    '--gc-lumiere-marge': `${marge}px`,
    borderColor: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`,
  } as React.CSSProperties;
  return <div className="gc-lumiere-penombre" aria-hidden="true" style={style} />;
}

function LumiereTracee() {
  const [reglages] = useReglages();
  const luminosite = reglages.luminosite ?? 1.5;
  const eclatBougie = reglages.eclatBougie ?? 2;
  const k = borne(1 - 0.55 * (luminosite - 1), 0.05, 1.45); // facteur d'ombre
  // feu moyen (i = 1) : part de la cheminée 0,8 ; le voile noir vaut sa baisse à 0,6
  const feuBase = r4(borne((0.2 / 0.4) * k, 0, 1));
  // bougie à l'éclat rendu au repos (éclat de la flamme × longueur 1) ; le voile noir vaut sa baisse à la moitié
  const bougieBase = r4(borne(((1.08 - (0.6 + 0.4 * eclatBougie) * (0.75 + 0.22 * eclatBougie)) / 0.48) * k, 0, 1));
  const feu = React.useRef<HTMLDivElement>(null);
  const bougie = React.useRef<HTMLDivElement>(null);
  // un voile qui s'éclaircit quand le feu flambe : amplitude négative
  useVacille(feu, feuBase, -0.22, 0.2);
  useVacille(bougie, bougieBase, -0.2, 0.65);
  const { marge, w, h } = tracee as { marge: number; w: number; h: number };
  const boite = { left: -marge, top: -marge, width: w, height: h };
  return (
    <div className="gc-lumiere gc-lumiere--tracee" aria-hidden="true">
      {/* La table seule reste ancrée au monde ; aucun changement d'état ni zoom du livre. */}
      <div className="gc-lumiere-tracee" data-gc-lumiere-etat="vide">
        <div className="gc-lumiere-tracee__fond" style={{ ...boite, backgroundImage: cssUrl('lumiere/vide') }} />
        <div ref={feu} className="gc-lumiere-tracee__voile" data-gc-lumiere="feu" style={{ ...boite, backgroundImage: cssUrl('lumiere/vide-feu'), opacity: feuBase }} />
        {bougieBase > 0 && <div ref={bougie} className="gc-lumiere-tracee__voile" data-gc-lumiere="bougie" style={{ ...boite, backgroundImage: cssUrl('lumiere/vide-bougie'), opacity: bougieBase }} />}
      </div>
    </div>
  );
}
