import React from 'react';
import { m, useTransform, type MotionValue } from '../../lib/motion';
import { LARGEUR_OMBRE, LARGEUR_PLI, contenus, css, matricePli, matrices, plier, tailleDemi, type Pli } from './coin';

// Le coin qui suit le doigt : un rabat plat « façon turn.js », en transformations seulement (aucune
// mise en page, aucune repeinture). Six calques, tous composités d'avance :
//   1. dessous      demi-plan du côté de l'angle saisi (carré tourné, overflow: hidden) ;
//   2.   page       la page suivante, contre-tournée (elle reste à sa place) ;
//   3.   ombre      l'ombre que le rabat soulevé jette sur la page découverte, le long du pli (bande
//                   fixe dans le demi-plan : opacité seulement) ;
//   4. rabat        demi-plan du côté du doigt ;
//   5.   page       le verso de la feuille, réfléchi par rapport au pli (ombre portée fixe sur ses bords) ;
//   6.     pli      la courbure du papier le long du pli, DANS la page du rabat (découpée par elle) :
//                   rotation et translation, jamais d'échelle (une échelle sous une découpe repeint).
// Le dessous et son ombre sont aussi bornés à la page (cadre fixe, aligné : découpe sans masque).
// Une seule MotionValue dérivée (`pli`) calcule la géométrie à chaque image ; les autres en dérivent.

export interface CoinProps {
  cote: 'gauche' | 'droite';
  /** Page découverte sous l'angle : la page suivante du même côté. */
  dessous: React.ReactNode;
  /** Verso de la feuille, vu sur le rabat. */
  rabat: React.ReactNode;
  /** Doigt, dans le repère normalisé (px de scène, 0 = reliure). */
  fx: MotionValue<number>;
  fy: MotionValue<number>;
  /** Angle saisi : 1 = en haut, 0 = en bas. */
  haut: MotionValue<number>;
  /**
   * Opacité d'ensemble : 1 (au repos, le pli est de taille nulle : rien ne se voit, et aucune passe hors
   * écran ne tourne), fondu vers 0 au relais du tourne-page 3D.
   */
  opacite: MotionValue<number>;
  /** Taille de page (px de scène). */
  W: number;
  H: number;
}

type Mats = ReturnType<typeof matrices>;

export function Coin({ cote, dessous, rabat, fx, fy, haut, opacite, W, H }: CoinProps) {
  const D = React.useMemo(() => tailleDemi(W, H), [W, H]);
  const L = Math.ceil(2.2 * Math.hypot(W, H));
  const ct = React.useMemo(() => contenus(cote, W), [cote, W]);
  const gPli = LARGEUR_PLI * W;
  const gOmbre = LARGEUR_OMBRE * W;

  const pli = useTransform([fx, fy, haut], ([x, y, h]: number[]): Pli => plier(h >= 0.5 ? 'haut' : 'bas', x, y, W, H));
  const mats = useTransform(pli, (p: Pli) => matrices(p, D, ct.dessous, ct.rabat));
  const tDessous = useTransform(mats, (mm: Mats) => css(mm.dessous));
  const tPageDessous = useTransform(mats, (mm: Mats) => css(mm.pageDessous));
  const tRabat = useTransform(mats, (mm: Mats) => css(mm.rabat));
  const tPageRabat = useTransform(mats, (mm: Mats) => css(mm.pageRabat));
  const tPli = useTransform(pli, (p: Pli) => css(matricePli(p, ct.rabat, gPli, L)));
  // Le pli et l'ombre s'affirment quand le rabat grandit (un angle à peine levé reste discret).
  const oPli = useTransform(pli, (p: Pli) => Math.max(0.002, Math.min(1, 0.45 + p.lambda * 5)));
  const oOmbre = useTransform(pli, (p: Pli) => Math.max(0.002, Math.min(1, 0.4 + p.lambda * 5)));

  return (
    <m.div className={`gc-livre-coin gc-livre-coin--${cote}`} style={{ opacity: opacite }} aria-hidden="true">
      <div className="gc-livre-coin__cadre">
        <m.div className="gc-livre-coin__demi" style={{ width: D.w, height: D.h, transform: tDessous }}>
          <m.div className="gc-livre-coin__page" style={{ transform: tPageDessous }}>{dessous}</m.div>
          <m.div className="gc-livre-coin__ombre" style={{ left: D.w - gOmbre, width: gOmbre, opacity: oOmbre }} />
        </m.div>
      </div>
      <m.div className="gc-livre-coin__demi" style={{ width: D.w, height: D.h, transform: tRabat }}>
        <m.div className="gc-livre-coin__page gc-livre-coin__page--rabat" style={{ transform: tPageRabat }}>
          {rabat}
          <div className="gc-livre-coin__teinte" />
          <m.div className="gc-livre-coin__pli" style={{ width: 2 * gPli, height: L, transform: tPli, opacity: oPli }} />
        </m.div>
      </m.div>
    </m.div>
  );
}
