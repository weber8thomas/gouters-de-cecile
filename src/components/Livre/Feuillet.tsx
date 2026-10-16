import React from 'react';
import { m, useTransform, type MotionValue } from '../../lib/motion';
import {
  angleCouverture,
  angles,
  clamp,
  jointures,
  lisse,
  lumiereRecto,
  PLANCHER,
  ombreVerso,
  PERSPECTIVE,
  PERSPECTIVE_COUVERTURE,
  porteeDroite,
  porteeGauche,
  r3,
  rectoVisible,
  versoVisible,
  voile,
} from './geometrie';

// Le feuillet qui tourne. Une seule MotionValue p (0 → à plat à droite, 1 → à plat à gauche)
// pilote, via useTransform, chaque rotation, chaque voile d'ombrage et chaque ombre portée :
// aucun rendu React pendant le geste, aucune propriété de mise en page touchée.

export interface FeuilletProps {
  p: MotionValue<number>;
  /** Recto : la page de droite de la double page « basse » (celle que l'on quitte en avançant). */
  recto: React.ReactNode;
  /** Verso : la page de gauche de la double page « haute ». */
  verso: React.ReactNode;
  /** −1 en avançant (le bord extérieur mène), +1 en reculant. Fixé pour toute la vie du feuillet. */
  sens: 1 | -1;
}

const rot = (deg: number) => `rotateY(${r3(deg)}deg)`;

type Paire = { a: MotionValue<number>; b: MotionValue<number> };

// Une tranche du feuillet : recto et verso de la même bande de papier, et leurs voiles d'ombrage.
// Les voiles ne sont PAS enfants des faces : ce sont des quads frères, coplanaires, dans le même
// contexte 3D. Une face à opacité variable qui contiendrait des calques forcerait une passe hors
// écran (render surface) à chaque image ; ainsi, chaque image ne fait que composer des quads.
// Chaque face porte deux voiles en dégradé (côté reliure « a », côté bord libre « b ») dont les
// opacités suivent l'ombrage des deux jointures qui la bordent (et sa visibilité).
function Tranche({ k, recto, verso, vue, lumiere, ombre }: {
  k: 0 | 1 | 2;
  recto: React.ReactNode;
  verso: React.ReactNode;
  /** Opacités du recto (a) et du verso (b) selon l'angle du segment. */
  vue: Paire;
  lumiere: Paire;
  ombre: Paire;
}) {
  return (
    <>
      <m.div className="gc-livre-feuillet__face gc-livre-feuillet__face--recto" style={{ opacity: vue.a }}>
        <div className={`gc-livre-feuillet__decoupe gc-livre-feuillet__decoupe--r${k}`}>{recto}</div>
      </m.div>
      <m.div className="gc-livre-feuillet__voile gc-livre-feuillet__voile--lumiere-a" style={{ opacity: lumiere.a }} />
      <m.div className="gc-livre-feuillet__voile gc-livre-feuillet__voile--lumiere-b" style={{ opacity: lumiere.b }} />
      <m.div className="gc-livre-feuillet__face gc-livre-feuillet__face--verso" style={{ opacity: vue.b }}>
        <div className={`gc-livre-feuillet__decoupe gc-livre-feuillet__decoupe--v${k}`}>{verso}</div>
      </m.div>
      <m.div className={`gc-livre-feuillet__voile gc-livre-feuillet__voile--verso gc-livre-feuillet__voile--ombre-a${k === 0 ? ' gc-livre-feuillet__voile--charniere' : ''}`} style={{ opacity: ombre.a }} />
      <m.div className="gc-livre-feuillet__voile gc-livre-feuillet__voile--verso gc-livre-feuillet__voile--ombre-b" style={{ opacity: ombre.b }} />
    </>
  );
}

/**
 * Feuillet de papier : 3 segments emboîtés (0–20 %, 20–55 %, 55–100 % de la largeur), chacun
 * tourné par rapport au précédent ; chaque segment ré-affiche la même page, découpée.
 */
export function Feuillet({ p, recto, verso, sens }: FeuilletProps) {
  const A = (v: number) => angles(v, sens);
  const J = (v: number) => jointures(A(v));
  const t1 = useTransform(p, (v) => rot(A(v)[0]));
  const t2 = useTransform(p, (v) => { const a = A(v); return rot(a[1] - a[0]); });
  const t3 = useTransform(p, (v) => { const a = A(v); return rot(a[2] - a[1]); });
  // visibilité des faces (segment k) et ombrage aux jointures k (côté reliure) et k + 1
  const r0 = useTransform(p, (v) => rectoVisible(A(v)[0]));
  const r1 = useTransform(p, (v) => rectoVisible(A(v)[1]));
  const r2 = useTransform(p, (v) => rectoVisible(A(v)[2]));
  const w0 = useTransform(p, (v) => versoVisible(A(v)[0]));
  const w1 = useTransform(p, (v) => versoVisible(A(v)[1]));
  const w2 = useTransform(p, (v) => versoVisible(A(v)[2]));
  const L = (k: number, j: number) => (v: number) => voile(lumiereRecto(J(v)[j]), rectoVisible(A(v)[k]));
  const O = (k: number, j: number) => (v: number) => voile(ombreVerso(J(v)[j]), versoVisible(A(v)[k]));
  const l0a = useTransform(p, L(0, 0)); const l0b = useTransform(p, L(0, 1));
  const l1a = useTransform(p, L(1, 1)); const l1b = useTransform(p, L(1, 2));
  const l2a = useTransform(p, L(2, 2)); const l2b = useTransform(p, L(2, 3));
  const o0a = useTransform(p, O(0, 0)); const o0b = useTransform(p, O(0, 1));
  const o1a = useTransform(p, O(1, 1)); const o1b = useTransform(p, O(1, 2));
  const o2a = useTransform(p, O(2, 2)); const o2b = useTransform(p, O(2, 3));
  return (
    <div className="gc-livre-feuillet" aria-hidden="true">
      <m.div className="gc-livre-feuillet__seg gc-livre-feuillet__seg--1" style={{ transform: t1 }}>
        <Tranche k={0} recto={recto} verso={verso} vue={{ a: r0, b: w0 }} lumiere={{ a: l0a, b: l0b }} ombre={{ a: o0a, b: o0b }} />
        <m.div className="gc-livre-feuillet__seg gc-livre-feuillet__seg--2" style={{ transform: t2 }}>
          <Tranche k={1} recto={recto} verso={verso} vue={{ a: r1, b: w1 }} lumiere={{ a: l1a, b: l1b }} ombre={{ a: o1a, b: o1b }} />
          <m.div className="gc-livre-feuillet__seg gc-livre-feuillet__seg--3" style={{ transform: t3 }}>
            <Tranche k={2} recto={recto} verso={verso} vue={{ a: r2, b: w2 }} lumiere={{ a: l2a, b: l2b }} ombre={{ a: o2a, b: o2b }} />
          </m.div>
        </m.div>
      </m.div>
    </div>
  );
}

export interface FeuilletCouvertureProps {
  p: MotionValue<number>;
  /** Le plat de couverture (contenu fourni par la prop cover du livre). */
  recto: React.ReactNode;
  /** Le contreplat : la page de gauche de la première double page, collée au carton. */
  verso: React.ReactNode;
}

/**
 * Couverture : carton rigide, épais, même moteur. Le carton est UN plan aplati (recto, verso et
 * leurs voiles mis à plat dedans) : aucun tri 3D entre faces. Il passe du dessus du carton (fermé)
 * à son dessous (ouvert) : le contreplat se pose exactement au niveau des pages. Le chant de 10 px,
 * qu'on voit quand la couverture se dresse, est un plan frère qui suit la même rotation.
 */
export function FeuilletCouverture({ p, recto, verso }: FeuilletCouvertureProps) {
  const t = useTransform(p, (v) => `${rot(angleCouverture(v))} translateZ(calc(var(--gc-livre-epaisseur) * ${r3(1 - clamp(v, 0, 1))}))`);
  const chant = useTransform(p, (v) => `${rot(angleCouverture(v))} translateX(calc(var(--gc-page-w) + var(--gc-livre-carton-out))) rotateY(-90deg)`);
  const vr = useTransform(p, (v) => rectoVisible(angleCouverture(v)));
  const vv = useTransform(p, (v) => versoVisible(angleCouverture(v)));
  const l = useTransform(p, (v) => voile(lumiereRecto(angleCouverture(v)), rectoVisible(angleCouverture(v))));
  const o = useTransform(p, (v) => voile(ombreVerso(angleCouverture(v)), versoVisible(angleCouverture(v))));
  return (
    <>
      <m.div className="gc-livre-couv" style={{ transform: t }}>
        <m.div className="gc-livre-couv__verso" style={{ opacity: vv }} aria-hidden="true">
          <div className="gc-livre-couv__carton gc-livre__carton-bord--gauche gc-livre__carton-toile" />
          <div className="gc-livre-couv__contreplat">{verso}</div>
        </m.div>
        <m.div className="gc-livre-couv__ombre" style={{ opacity: o }} aria-hidden="true" />
        <m.div className="gc-livre-couv__recto" style={{ opacity: vr }}>
          <div className="gc-livre-couv__plat gc-livre__carton-toile" />
          <div className="gc-livre-couv__contenu">{recto}</div>
        </m.div>
        <m.div className="gc-livre-couv__lumiere" style={{ opacity: l }} aria-hidden="true" />
      </m.div>
      <m.div className="gc-livre-couv-chant" style={{ transform: chant }} aria-hidden="true" />
    </>
  );
}

export interface PorteesProps {
  p: MotionValue<number>;
  sens: 1 | -1;
  couverture: boolean;
}

/**
 * Ombres portées du feuillet : sur la page découverte (bord projeté x = W·cos θ, opacité
 * sin(πp)·0,35) et, en seconde moitié, sur la page qu'il va recouvrir. Translation, échelle et
 * opacité seulement : aucune repeinture.
 */
export function Portees({ p, sens, couverture }: PorteesProps) {
  const A = (v: number): readonly number[] => {
    if (!couverture) return angles(v, sens);
    const c = angleCouverture(v);
    return [c, c, c];
  };
  const K = couverture ? PERSPECTIVE_COUVERTURE : PERSPECTIVE;
  const droite = useTransform(p, (v) => `translateX(${r3(clamp(porteeDroite(A(v), K), -1, 1) * 100)}%)`);
  const droiteOp = useTransform(p, (v) => Math.max(PLANCHER, 0.35 * Math.sin(Math.PI * clamp(v, 0, 1))));
  const gauche = useTransform(p, (v) => `translateX(${r3(clamp(porteeGauche(A(v), K), -1, 0) * 100)}%)`);
  const gaucheOp = useTransform(p, (v) => (couverture ? 0 : Math.max(PLANCHER, 0.35 * Math.sin(Math.PI * clamp(v, 0, 1)) * lisse(0.42, 0.62, v))));
  return (
    <>
      <div className="gc-livre__portee gc-livre__portee--droite" aria-hidden="true">
        <m.div className="gc-livre__portee-ombre" style={{ transform: droite, opacity: droiteOp }} />
      </div>
      <div className="gc-livre__portee gc-livre__portee--gauche" aria-hidden="true">
        <m.div className="gc-livre__portee-ombre" style={{ transform: gauche, opacity: gaucheOp }} />
      </div>
    </>
  );
}
