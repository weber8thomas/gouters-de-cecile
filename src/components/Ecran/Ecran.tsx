import React from 'react';
import { ViewportOverride, useViewport } from '../../lib/viewport';
import type { TableKind } from '../../lib/settings';
import { EcranContext, type EcranInfo } from './contexte';
import './Ecran.css';

export interface EcranProps {
  /** Le carnet (un <Livre>, qui rend sa propre scène 1920 × 1080). */
  children?: React.ReactNode;
  className?: string;
  /** Bouton plein écran, en haut à droite (masqué si l'API manque, par exemple sur iPhone). Défaut : true. */
  pleinEcran?: boolean;
}

/** Taille de la scène logique (tokens --gc-stage-w / --gc-stage-h). */
const SCENE = { w: 1920, h: 1080 };

type Vars = React.CSSProperties & Record<`--${string}`, string>;

type DocPlein = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type ElPlein = HTMLElement & { webkitRequestFullscreen?: () => void };
const elementPlein = (): Element | null => {
  const d = document as DocPlein;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
};

// Coins tracés à la main (même encre que les flèches du livre) : vers l'extérieur pour entrer en plein
// écran, vers l'intérieur pour en sortir.
const OUVRIR = {
  trait: ['M7.4 15.2c-.2-2.6-.1-5.1.3-7.6 2.5-.3 5.2-.5 7.9-.4', 'M24.6 7.3c2.7-.1 5.3 0 7.8.4.3 2.6.4 5.1.2 7.7', 'M32.6 24.9c.2 2.5.1 5-.3 7.5-2.6.4-5.2.4-7.8.3', 'M15.3 32.7c-2.6.2-5.2.1-7.7-.3-.3-2.5-.4-5-.3-7.6'],
  repasse: ['M8.3 14.1c-.1-2 0-4 .3-5.9 2-.2 4-.3 6-.3', 'M25.9 8.2c2 0 3.9.1 5.7.3.2 1.9.3 3.8.2 5.8', 'M31.8 26.1c.1 1.9 0 3.8-.3 5.6-1.9.3-3.9.3-5.8.2', 'M14.1 31.9c-1.9.1-3.9 0-5.8-.3-.2-1.9-.3-3.8-.2-5.8'],
};
const FERMER = {
  trait: ['M7.6 14.8c2.5.2 5 .1 7.4-.2.3-2.4.4-4.9.3-7.5', 'M24.7 7.2c-.1 2.6 0 5.1.3 7.6 2.5.3 5 .3 7.6.1', 'M32.5 25.2c-2.6-.1-5.1 0-7.6.3-.2 2.4-.3 4.9-.2 7.4', 'M15.2 32.6c.1-2.5 0-5-.3-7.4-2.5-.3-5-.3-7.5-.2'],
  repasse: ['M8.6 15.6c2 .1 4 0 5.9-.2', 'M25.6 15.5c1.9.2 3.9.2 5.9.1', 'M31.4 24.4c-1.9 0-3.9.1-5.8.3', 'M14.5 24.5c-1.9-.2-3.9-.2-5.9-.1'],
};

function Coins({ d }: { d: typeof OUVRIR }) {
  return (
    <svg className="gc-ecran__trace" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <g className="gc-ecran__ombre">{d.trait.map((t) => <path key={t} d={t} />)}</g>
      <g className="gc-ecran__encre">
        {d.trait.map((t) => <path key={t} d={t} />)}
        {d.repasse.map((t) => <path key={t} className="gc-ecran__repasse" d={t} />)}
      </g>
    </svg>
  );
}

function BoutonPleinEcran() {
  const [actif, setActif] = React.useState(false);
  React.useEffect(() => {
    const maj = () => setActif(!!elementPlein());
    maj();
    document.addEventListener('fullscreenchange', maj);
    document.addEventListener('webkitfullscreenchange', maj);
    return () => {
      document.removeEventListener('fullscreenchange', maj);
      document.removeEventListener('webkitfullscreenchange', maj);
    };
  }, []);
  const basculer = () => {
    const d = document as DocPlein;
    if (elementPlein()) {
      if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined);
      else d.webkitExitFullscreen?.();
      return;
    }
    const el = document.documentElement as ElPlein;
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  };
  return (
    <button type="button" className="gc-ecran__plein" data-gc-controle="plein-ecran" aria-label={actif ? 'Quitter le plein écran' : 'Plein écran'} aria-pressed={actif} onClick={basculer}>
      <Coins d={actif ? FERMER : OUVRIR} />
    </button>
  );
}

// Coque plein écran du carnet : occupe toute la fenêtre (100dvh, zones sûres), donne au livre la
// fenêtre d'affichage et son cadrage (contexte), et porte le calque des contrôles en px d'écran
// (flèches, points de page, repère de distance : posés par le livre ; plein écran : ici).
// Sous un ViewportOverride (cartes, tests), l'écran est une boîte de la taille imposée.
export function Ecran({ children, className, pleinEcran = true }: EcranProps) {
  const vp = useViewport();
  const force = React.useContext(ViewportOverride);
  const simule = !!force && force.w != null && force.h != null;
  const [controles, setControles] = React.useState<HTMLDivElement | null>(null);
  const [table, setTable] = React.useState<TableKind | null>(null);
  const info = React.useMemo<EcranInfo>(() => ({ vp, controles, simule, setTable }), [vp, controles, simule]);

  const u = Math.min(vp.w / SCENE.w, vp.h / SCENE.h);
  const style: Vars = {
    '--gc-ecran-w': `${vp.w}px`,
    '--gc-ecran-h': `${vp.h}px`,
    '--gc-ecran-u': u.toFixed(4),
    '--gc-ecran-haut': `${vp.insets.top}px`,
    '--gc-ecran-droite': `${vp.insets.right}px`,
    '--gc-ecran-bas': `${vp.insets.bottom}px`,
    '--gc-ecran-gauche': `${vp.insets.left}px`,
  };
  const cls = ['gc-ecran', simule && 'gc-ecran--simule', className].filter(Boolean).join(' ');
  return (
    <EcranContext.Provider value={info}>
      <div className={cls} data-gc-cadrage={vp.cadrage} data-gc-tactile={vp.tactile ? '' : undefined} data-gc-table={table ?? undefined} style={style}>
        {children}
        <div ref={setControles} className="gc-ecran__controles">
          {pleinEcran && vp.pleinEcran && <BoutonPleinEcran />}
        </div>
      </div>
    </EcranContext.Provider>
  );
}
