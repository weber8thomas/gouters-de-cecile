// Doubles pages de la démo du carnet, partagées par la carte DemoCarnet (TV), l'application (Carnet),
// la carte Formats et la carte AvantApres : la double page de Julie (cloche vidéo + recette), puis
// trois doubles pages écrites par d'autres invités, chacun de sa main.
//
// Chaque page est une PAGE CUITE (<PageCuite>, scripts/bake-pages.mjs) : vrai papier ancien scanné +
// écriture générée trait par trait, l'encre cuite dans le papier. Seul l'écrin vidéo de Julie reste
// vivant, posé dans la zone que sa page lui réserve.
//
// La lecture simulée de Julie (12 s, la tasse se remplit) vit dans un contexte (<LectureJulie>) : la
// liste des doubles pages reste stable, et l'avancement ne rend que la page de Julie affichée (jamais
// le livre ni ses copies statiques, même pendant un tourne-page).
import React from 'react';
import { PageCuite } from '../../components/PageCuite';
import { TasseProgression } from '../../components/TasseProgression';
import { assetUrl } from '../../lib/assets';
import { ECRINS } from '../../generated/ecrins.gen';
import type { RenderMode, SpreadSpec } from '../../lib/spread';
// Classes de la cloche cuite (gc-sj-cloche…), partagées avec le spécimen de Julie.
import '../SpecimenJulie/SpecimenJulie.css';
import './DemoCarnet.css';

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** Étiquette collée sur le plat de couverture. */
export const COUVERTURE = (
  <div className="gc-demo-couverture">
    <p className="gc-hand-caption gc-demo-couverture__sur">carnet de recettes</p>
    <p className="gc-recipe-title gc-demo-couverture__titre">Les goûters</p>
    <p className="gc-section-label gc-demo-couverture__de">de Cécile</p>
  </div>
);

// ---- La cloche de Julie (écrin vivant) ------------------------------------------------------

/**
 * La cloche cuite : calques empilés au même cadrage, vidéo (scène figée ou couleur) masquée par
 * mask-soft. Même construction que `ClocheCuite` du spécimen de Julie (non exportée) : elle
 * remplit la zone « ecrin » que la page cuite lui réserve (même proportion que le viewBox).
 */
export function ClocheJulie({ playing, progress }: { playing: boolean; progress: number }) {
  const man = ECRINS.cloche.manifest;
  const [W, H] = man.viewBox;
  const a = man.aperture as { cx: number; cy: number; r: number };
  const lift = man.lift!;
  const cup = man.cup!;
  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  const lifted: Vars = {
    transformOrigin: `${pct(a.cx, W)} ${pct(a.cy, H)}`,
    transform: playing ? `translate(${pct(lift.dx, W)}, ${pct(lift.dy, H)}) rotate(${lift.rotate}deg)` : 'none',
  };
  const img = (part: string, style?: React.CSSProperties) => (
    <img className="gc-sj-calque" src={assetUrl(`ecrins/cloche/a/${part}`)} alt="" style={style} draggable={false} />
  );
  return (
    <div className="gc-sj-cloche" style={{ aspectRatio: `${W} / ${H}` }} data-state={playing ? 'playing' : 'idle'}>
      {img('back')}
      {img('domeBack', lifted)}
      <div className="gc-sj-media" style={{ '--gc-sj-mask': `url("${assetUrl('ecrins/cloche/a/mask-soft')}")` } as Vars}>
        <div className="gc-sj-slot" style={{ left: pct(a.cx - a.r, W), top: pct(a.cy - a.r, H), width: pct(2 * a.r, W), height: pct(2 * a.r, H) }}>
          <img src={assetUrl('scenes/julie/sepia')} alt="" className="gc-sj-scene gc-sj-scene--sepia" />
          <img src={assetUrl('scenes/julie/couleur')} alt="" className="gc-sj-scene gc-sj-scene--couleur" />
        </div>
      </div>
      {img('front')}
      {img('dome', lifted)}
      {img('glint', { ...lifted, opacity: playing ? 1 : 0.6 })}
      <div className="gc-sj-tasse" style={{ left: pct(cup.x, W), top: pct(cup.y, H) }}>
        <TasseProgression progress={playing ? progress : 0} liquid="the" />
      </div>
    </div>
  );
}

/** Page de gauche de Julie, cuite, avec sa cloche (figée ou en lecture). */
export function JulieGaucheCuite({ playing = false, progress = 0 }: { playing?: boolean; progress?: number }) {
  return <PageCuite page="julie-gauche" slots={{ ecrin: <ClocheJulie playing={playing} progress={progress} /> }} />;
}

/** Page de droite de Julie, cuite : recette, petit mot, signature, annotation de Cécile. */
export function JulieDroiteCuite() {
  return <PageCuite page="julie-droite" />;
}

// ---- Lecture simulée de Julie ---------------------------------------------------------------

interface Lecture {
  playing: boolean;
  progress: number;
}
const LectureContext = React.createContext<Lecture>({ playing: false, progress: 0 });

export interface LectureApi {
  /** Lecture / pause (Entrée, Espace, ou toucher de la cloche). */
  basculer: () => void;
}

/** Durée de la lecture simulée (ms). */
const DUREE = 12000;

export interface LectureJulieProps {
  /** La double page de Julie est affichée : Entrée / Espace lancent la lecture ; sinon elle s'arrête. */
  actif: boolean;
  /** Reçoit { basculer } (toucher de la cloche). */
  apiRef?: React.MutableRefObject<LectureApi | null>;
  children?: React.ReactNode;
}

export function LectureJulie({ actif, apiRef, children }: LectureJulieProps) {
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const actifRef = React.useRef(actif);
  actifRef.current = actif;

  // Entrée / Espace sur la page de Julie : lecture simulée de 12 s (la tasse se remplit).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!actif || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actif]);
  React.useEffect(() => {
    if (!playing) return;
    const t0 = performance.now() - progress * DUREE;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / DUREE);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  React.useEffect(() => { if (!actif) setPlaying(false); }, [actif]);

  if (apiRef) apiRef.current = { basculer: () => { if (actifRef.current) setPlaying((p) => !p); } };
  const value = React.useMemo(() => ({ playing, progress }), [playing, progress]);
  return <LectureContext.Provider value={value}>{children}</LectureContext.Provider>;
}

/** Page de gauche de Julie dans le livre : vivante (lecture) ou figée (copies du tourne-page). */
function JulieGaucheLivre({ mode }: { mode: RenderMode }) {
  if (mode === 'static') return <JulieGaucheCuite />;
  return <JulieGaucheVivante />;
}
function JulieGaucheVivante() {
  const { playing, progress } = React.useContext(LectureContext);
  return <JulieGaucheCuite playing={playing} progress={progress} />;
}

/** Toucher la cloche de Julie : comme Entrée (lecture / pause). Renvoie true si le toucher est pris. */
export function toucherCloche(t: { spreadId: string; side: 'left' | 'right'; cible: Element }, api: LectureApi | null): boolean {
  if (t.spreadId !== 'julie' || t.side !== 'left' || !t.cible.closest('.gc-sj-cloche')) return false;
  api?.basculer();
  return true;
}

// ---- Les doubles pages ----------------------------------------------------------------------

export const JULIE: SpreadSpec = {
  id: 'julie', kind: 'video', table: 'bois', folios: [12, 13], seed: 4127,
  render: (mode) => ({ left: <JulieGaucheLivre mode={mode} />, right: <JulieDroiteCuite /> }),
};

const ROSE: SpreadSpec = {
  id: 'rose', kind: 'recette', table: 'nappe', folios: [14, 15], seed: 811,
  render: () => ({ left: <PageCuite page="rose-gauche" />, right: <PageCuite page="rose-droite" /> }),
};

const MATHIS: SpreadSpec = {
  id: 'mathis', kind: 'deux-recettes', table: 'bois', folios: [16, 17], seed: 905,
  render: () => ({ left: <PageCuite page="mathis-gauche" />, right: <PageCuite page="mathis-droite" /> }),
};

const FIN: SpreadSpec = {
  id: 'fin', kind: 'finale', table: 'nappe', folios: [18, 19], seed: 1201,
  render: () => ({ left: <PageCuite page="fin-gauche" />, right: <PageCuite page="fin-droite" /> }),
};

/** Les doubles pages de la démo, dans l'ordre (liste stable : mêmes objets à chaque rendu). */
export const SPREADS_DEMO: SpreadSpec[] = [JULIE, ROSE, MATHIS, FIN];
