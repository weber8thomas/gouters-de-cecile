// Le feuillet volant (CONTRACT § 12) : la suite d'une recette trop longue, écrite sur une feuille de
// cahier glissée dans le carnet. Dans la page, on n'en voit que le coin qui dépasse : la page cuite du
// recto, à l'échelle de la page, de travers, découpée par la zone « volant » (overflow: hidden).
//
// Il gère lui-même son toucher (data-gc-controle : le livre ne s'en occupe pas) : un toucher ou un
// glisser vers le haut le soulève (SoulevementProvider) ; Entrée, Espace ou ↑ aussi quand il a le
// focus ; souleverObjet('feuillet') pour la touche ↑ du livre.
//
// Indice sans texte (src/lib/indices.ts) : tant qu'on ne l'a ni touché ni soulevé, le coin frémit de
// temps en temps (± 1,5°, deux fois, autour du centre de la feuille : le coin visible bouge, la partie
// glissée dans le carnet reste en place). Un animate ponctuel sur un enveloppeur interne (la feuille
// mesurée par Soulever n'est jamais animée), will-change le temps du frisson.
import React from 'react';
import { animate } from '../../lib/motion';
import { indiceUtilise, useIndice, type Pulsation } from '../../lib/indices';
import { useRenderMode } from '../../lib/spread';
import { PageCuite, PAGES_CUITES } from '../PageCuite';
import { useSoulevementActions, EVENEMENT_SOULEVER } from '../Soulever/contexte';
import { hasard } from '../Soulever/media';
import './FeuilletVolant.css';

export interface FeuilletVolantProps {
  /** Page cuite du recto (« lisa-feuillet-recto »). */
  recto: string;
  /** Page cuite du verso, s'il y en a un. */
  verso?: string | null;
  /** Inclinaison de la feuille (degrés). Défaut : tirée de la graine, 3,5° à 6,5°. */
  angle?: number;
  /** Coin haut gauche de la feuille dans la zone, en fractions de la zone. Défaut : [0.1, 0.16]. */
  coin?: [number, number];
  graine?: number;
}

type Vars = React.CSSProperties & Record<`--${string}`, string>;

/** Glisser vers le haut : seuil (px d'écran) au-delà duquel la feuille se soulève. */
export const SEUIL_GLISSER_HAUT = 30;
/** Un toucher : moins de 10 px et moins de 600 ms. */
const TOUCHER_PX = 10;
const TOUCHER_MS = 600;

/** Taille de la feuille, en fractions de la page (manifeste : `taille`, sinon celle d'une page). */
function tailleFeuille(id: string): [number, number] {
  const info = PAGES_CUITES.pages[id] as unknown as { taille?: [number, number] } | undefined;
  const t = info?.taille;
  if (t && t[0] > 0 && t[1] > 0) return [t[0] / PAGES_CUITES.largeur, t[1] / PAGES_CUITES.hauteur];
  return [1, 1];
}

export function FeuilletVolant({ recto, verso = null, angle, coin = [0.1, 0.16], graine = 3 }: FeuilletVolantProps) {
  const mode = useRenderMode();
  const vivant = mode === 'live';
  const actions = useSoulevementActions();
  const racineRef = React.useRef<HTMLDivElement>(null);
  const feuilleRef = React.useRef<HTMLDivElement>(null);
  const frissonRef = React.useRef<HTMLDivElement>(null);
  const objet = `feuillet:${recto}`;
  const appui = React.useRef<{ id: number; x: number; y: number; t: number } | null>(null);

  const a = React.useMemo(() => {
    if (typeof angle === 'number' && Number.isFinite(angle)) return angle;
    const r = hasard(graine * 104729 + 7);
    const v = 3.5 + 3 * r();
    return r() < 0.35 ? -v : v;
  }, [angle, graine]);
  const [fw, fh] = tailleFeuille(recto);
  const style: Vars = {
    left: `${(coin[0] * 100).toFixed(3)}%`,
    top: `${(coin[1] * 100).toFixed(3)}%`,
    width: `calc(var(--gc-page-w) * ${fw.toFixed(5)})`,
    height: `calc(var(--gc-page-h) * ${fh.toFixed(5)})`,
    transform: `rotate(${a.toFixed(2)}deg)`,
  };

  const leverRef = React.useRef<() => boolean>(() => false);
  leverRef.current = () => {
    const feuille = feuilleRef.current;
    if (!feuille || !actions) return false;
    const ok = actions.soulever({ type: 'feuillet', recto, verso, source: feuille, angle: a, fenetre: racineRef.current });
    if (ok) indiceUtilise(objet);
    return ok;
  };

  useIndice(vivant ? objet : null, racineRef, () => fremir(frissonRef.current));

  // Demande de soulèvement (touche ↑ du livre, via souleverObjet).
  React.useEffect(() => {
    const el = racineRef.current;
    if (!el || !vivant) return undefined;
    const prendre = (e: Event) => {
      if (leverRef.current()) e.preventDefault();
    };
    el.addEventListener(EVENEMENT_SOULEVER, prendre);
    return () => el.removeEventListener(EVENEMENT_SOULEVER, prendre);
  }, [vivant]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    indiceUtilise(objet);
    appui.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = appui.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (-dy >= SEUIL_GLISSER_HAUT && -dy > Math.abs(dx)) {
      appui.current = null;
      leverRef.current(); // dans le geste (pointermove)
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = appui.current;
    appui.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < TOUCHER_PX && e.timeStamp - d.t < TOUCHER_MS) leverRef.current();
  };
  const onPointerCancel = () => {
    appui.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowUp') return;
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (leverRef.current()) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={racineRef}
      className="gc-feuillet-volant"
      data-gc-objet="feuillet"
      data-gc-controle="feuillet"
      data-gc-objet-mode={mode}
      tabIndex={vivant ? 0 : undefined}
      role={vivant ? 'button' : undefined}
      aria-label={vivant ? `Feuillet volant : la suite de la recette${verso ? ', recto et verso' : ''}. Entrée ou flèche haut pour le lire.` : undefined}
      aria-hidden={vivant ? undefined : true}
      onPointerDown={vivant ? onPointerDown : undefined}
      onPointerMove={vivant ? onPointerMove : undefined}
      onPointerUp={vivant ? onPointerUp : undefined}
      onPointerCancel={vivant ? onPointerCancel : undefined}
      onKeyDown={vivant ? onKeyDown : undefined}
    >
      <div ref={feuilleRef} className="gc-feuillet-volant__feuille" style={style} aria-hidden="true">
        <div ref={frissonRef} className="gc-feuillet-volant__frisson">
          <PageCuite page={recto} />
        </div>
      </div>
    </div>
  );
}

/** Durée du frisson (s) : deux petits battements. */
export const DUREE_FRISSON = 1.3;

/** Frisson de l'indice : ± 1,5°, deux fois, autour du centre de la feuille (transform seulement). */
function fremir(el: HTMLElement | null): Pulsation | null {
  if (!el) return null;
  el.style.willChange = 'transform';
  const angles = [0, 1.5, -1.1, 0.45, 0, 0, 1.5, -1.2, 0.35, 0];
  const a = animate(el, { transform: angles.map((d) => `rotate(${d}deg)`) }, {
    duration: DUREE_FRISSON,
    ease: 'easeInOut',
    times: [0, 0.1, 0.21, 0.31, 0.4, 0.52, 0.62, 0.73, 0.83, 1],
  });
  const repos = () => {
    el.style.removeProperty('will-change');
    el.style.removeProperty('transform');
  };
  let fini = false;
  const fin = a.finished.then(() => {
    if (!fini) { fini = true; repos(); }
  });
  return {
    fin,
    stop: () => {
      if (fini) return;
      fini = true;
      try { a.cancel(); } catch { a.stop(); }
      repos();
    },
  };
}

export default FeuilletVolant;
