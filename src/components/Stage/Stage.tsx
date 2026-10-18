import React from 'react';
import { SettingsContext, settingsAttrs, useSettings, type Distance, type IdleLook, type Settings } from '../../lib/settings';
import { LumiereLivre, LumiereTable, PenombreTable, LUMIERE_TRACEE } from '../Lumiere';
import { Bougie } from '../Bougie';
import './Stage.css';

export interface StageProps {
  /** Aspect des images figées avant lecture. */
  idle?: IdleLook;
  /** Cran de distance de la caméra (géométrie du livre et tailles de texte). */
  distance?: Distance;
  /** Met la scène 1920×1080 à l'échelle de la largeur du parent. */
  fit?: boolean;
  children?: React.ReactNode;
  /** Calque au-dessus de tout, lumière comprise (navigation) : la lumière passe dessous. */
  overlay?: React.ReactNode;
  className?: string;
  /**
   * Débord de la table (px de scène, des quatre côtés) : la table et la lumière se prolongent hors
   * de la scène 1920 × 1080, pour un écran d'une autre forme (composant Ecran). 0 par défaut.
   */
  debord?: number;
}

// Scène fixe 1920×1080, un soir au coin du feu (plan v4) : la table en bois, la lumière du feu sur la
// table (bain, reflet, ombre portée), le contenu (le livre ouvert), l'ambiance et le voile chaud sur le
// livre, puis un calque libre. La cheminée est hors champ à gauche ; sa lumière vacille en direct
// (src/lib/feu.ts : opacité et transformation de calques précalculés). Fournit les réglages.
export function Stage({ idle, distance, fit = false, children, overlay, className, debord = 0 }: StageProps) {
  const parent = useSettings();
  const settings: Settings = React.useMemo(
    () => ({ idle: idle ?? parent.idle, distance: distance ?? parent.distance }),
    [idle, distance, parent.idle, parent.distance],
  );

  const outerRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(() => {
    const outer = outerRef.current, stage = stageRef.current;
    if (!fit || !outer || !stage) return;
    const update = () => {
      const s = outer.clientWidth / (stage.offsetWidth || 1);
      if (s > 0) setScale((prev) => (Math.abs(prev - s) < 1e-4 ? prev : s));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [fit]);

  const cls = ['gc-stage', debord > 0 && 'gc-stage--debord', LUMIERE_TRACEE && 'gc-stage--tracee', className].filter(Boolean).join(' ');
  const style: React.CSSProperties & Record<string, string> = {};
  if (fit) Object.assign(style, { transform: `scale(${scale})`, transformOrigin: '0 0' });
  if (debord > 0) style['--gc-stage-debord'] = `${debord}px`;
  const stage = (
    <div
      ref={stageRef}
      className={cls}
      {...settingsAttrs(settings)}
      style={fit || debord > 0 ? style : undefined}
    >
      <div className="gc-stage__table" aria-hidden="true">
        <div className="gc-stage__surface" />
        {/* éclairage tracé : la pénombre de la table est dans ses calques */}
        {!LUMIERE_TRACEE && <div className="gc-stage__falloff" />}
        {debord > 0 && <PenombreTable />}
      </div>
      <LumiereTable />
      <div className="gc-stage__content">{children}</div>
      <div className="gc-stage__light" aria-hidden="true">
        <LumiereLivre />
      </div>
      <Bougie />
      {overlay != null && <div className="gc-stage__overlay">{overlay}</div>}
    </div>
  );

  return (
    <SettingsContext.Provider value={settings}>
      {fit ? (
        <div ref={outerRef} className="gc-stage-fit" style={{ height: `calc(var(--gc-stage-h) * ${scale})` }}>
          {stage}
        </div>
      ) : (
        stage
      )}
    </SettingsContext.Provider>
  );
}
