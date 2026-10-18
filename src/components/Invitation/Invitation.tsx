// L'invitation à ouvrir le carnet (plan v4, CONTRACT § 13.4) : sur le tiers bas de la couverture fermée,
// une étiquette écrite au crayon qui dit comment ouvrir — « touchez / cliquez / appuyez sur Entrée pour
// ouvrir » — selon la façon dont la personne touche le carnet (useModalite). Les trois étiquettes sont
// cuites par le lot C (design-system/baked/indices/{toucher,cliquer,entree}.webp) : rien que des <img>,
// aucun texte en police web. Tant qu'elles n'existent pas, rien n'est affiché.
//
// Tant que le livre est fermé, l'étiquette « respire » très légèrement (opacité seule, un animate en
// boucle, will-change le temps de la boucle) ; arrêtée quand `opacite` tombe à 0 (le Livre la fond en
// ouvrant la couverture) et coupée en mouvement réduit.
import React from 'react';
import { assetInfo, assetUrl } from '../../lib/assets';
import { LazyMotion, animate, domMax, m, useReducedMotion, type MotionValue } from '../../lib/motion';
import { useModalite, type Modalite } from '../../lib/modalite';
import './Invitation.css';

export type { Modalite };

export interface InvitationOuvrirProps {
  /** Opacité d'ensemble, menée par le Livre (1 : couverture fermée, 0 : ouverte). Défaut : 1. */
  opacite?: MotionValue<number>;
  /** Impose la modalité (cartes, tests). Défaut : useModalite(). */
  modalite?: Modalite;
  /** Remplace les images cuites (URL), en attendant le lot C ou pour une carte. */
  etiquettes?: Partial<Record<Modalite, string>>;
  className?: string;
}

const MODALITES: Modalite[] = ['toucher', 'cliquer', 'entree'];
/** Respiration : opacité de l'étiquette entre ces deux valeurs, une demi-période en RESPIRATION_S. */
export const RESPIRATION = [0.64, 0.94] as const;
export const RESPIRATION_S = 2.6;

const nomCuit = (mo: Modalite) => `indices/${mo}`;

function etiquette(mo: Modalite, autres?: Partial<Record<Modalite, string>>): { src: string; ratio: number | null } | null {
  const force = autres?.[mo];
  if (force) return { src: force, ratio: null };
  const info = assetInfo(nomCuit(mo));
  if (!info) return null;
  const src = assetUrl(nomCuit(mo));
  return src ? { src, ratio: info.w > 0 && info.h > 0 ? info.w / info.h : null } : null;
}

export function InvitationOuvrir({ opacite, modalite, etiquettes, className }: InvitationOuvrirProps) {
  const vue = useModalite();
  const mo = modalite ?? vue;
  const reduit = !!useReducedMotion();
  const imgRef = React.useRef<HTMLImageElement>(null);
  const e = etiquette(mo, etiquettes);

  // Les deux autres étiquettes, décodées d'avance : changer de modalité ne fait pas clignoter.
  React.useEffect(() => {
    if (typeof Image === 'undefined') return;
    for (const autre of MODALITES) {
      const x = autre !== mo ? etiquette(autre, etiquettes) : null;
      if (!x) continue;
      const i = new Image();
      i.src = x.src;
      i.decode?.().catch(() => undefined);
    }
  }, [mo, etiquettes]);

  // Respiration, tant que l'étiquette se voit (opacite > 0) et hors mouvement réduit.
  const src = e?.src ?? '';
  React.useEffect(() => {
    const el = imgRef.current;
    if (!el || reduit || !src) return undefined;
    let anim: ReturnType<typeof animate> | null = null;
    const demarrer = () => {
      if (anim) return;
      el.style.willChange = 'opacity';
      // Boucle 0,94 → 0,64 → 0,94 (pas de « mirror », que WAAPI ne sait pas faire : le compositeur la
      // joue seul, sans le fil principal).
      anim = animate(el, { opacity: [RESPIRATION[1], RESPIRATION[0], RESPIRATION[1]] }, { duration: 2 * RESPIRATION_S, ease: 'easeInOut', repeat: Infinity });
    };
    const arreter = () => {
      if (!anim) return;
      try { anim.cancel(); } catch { anim.stop(); }
      anim = null;
      el.style.removeProperty('will-change');
      el.style.removeProperty('opacity');
    };
    const suivre = (v: number) => (v > 0.01 ? demarrer() : arreter());
    suivre(opacite ? opacite.get() : 1);
    const off = opacite?.on('change', suivre);
    return () => {
      off?.();
      arreter();
    };
  }, [opacite, reduit, src]);

  if (!e) return null;
  return (
    <LazyMotion features={domMax}>
      <m.div
        className={`gc-invitation${className ? ` ${className}` : ''}`}
        data-gc-invitation={mo}
        data-gc-reduit={reduit ? '' : undefined}
        style={opacite ? { opacity: opacite } : undefined}
        aria-hidden="true"
      >
        <img
          ref={imgRef}
          className="gc-invitation__etiquette"
          src={e.src}
          alt=""
          draggable={false}
          style={e.ratio ? { aspectRatio: `${e.ratio}` } : undefined}
        />
      </m.div>
    </LazyMotion>
  );
}

export default InvitationOuvrir;
