import React from 'react';
import { SettingsContext, settingsAttrs, useSettings, type IdleLook, type Settings, type TableKind } from '../../lib/settings';
import './Stage.css';

export interface StageProps {
  /** Fond de scène : table en bois ('bois') ou nappe en lin à carreaux vichy ('nappe'). */
  table?: TableKind;
  /** Aspect des écrins avant lecture. */
  idle?: IdleLook;
  /** Met la scène 1920×1080 à l'échelle de la largeur du parent. */
  fit?: boolean;
  children?: React.ReactNode;
  /** Calque au-dessus de tout, lumière comprise (navigation). */
  overlay?: React.ReactNode;
  className?: string;
}

// Scène fixe 1920×1080 : la table (bois ou nappe), le contenu (le livre ouvert), la lumière dorée
// de fin d'après-midi venant d'en haut à gauche, puis un calque libre. Fournit les réglages.
export function Stage({ table, idle, fit = false, children, overlay, className }: StageProps) {
  const parent = useSettings();
  const settings: Settings = React.useMemo(
    () => ({ table: table ?? parent.table, idle: idle ?? parent.idle }),
    [table, idle, parent.table, parent.idle],
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

  const cls = ['gc-stage', `gc-stage--${settings.table}`, className].filter(Boolean).join(' ');
  const stage = (
    <div
      ref={stageRef}
      className={cls}
      {...settingsAttrs(settings)}
      style={fit ? { transform: `scale(${scale})`, transformOrigin: '0 0' } : undefined}
    >
      <div className="gc-stage__table" aria-hidden="true">
        <div className="gc-stage__surface" />
        {settings.table === 'nappe' && <div className="gc-stage__folds" />}
        <div className="gc-stage__falloff" />
      </div>
      <div className="gc-stage__content">{children}</div>
      <div className="gc-stage__light" aria-hidden="true">
        <div className="gc-stage__window" />
        <div className="gc-stage__glow" />
      </div>
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
