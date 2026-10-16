import React from 'react';
import { flushSync } from 'react-dom';
import { Stage } from '../Stage';
import { useCamera } from '../../lib/camera';
import type { Distance, TableKind } from '../../lib/settings';
import type { RenderMode, SpreadSpec } from '../../lib/spread';
import { LazyMotion, SPRINGS, animate, domMax, m, useMotionValue, useReducedMotion, useTransform } from '../../lib/motion';
import { Camera } from './Camera';
import { Face, type Cote } from './Face';
import { Feuillet, FeuilletCouverture, Portees } from './Feuillet';
import { Fleches } from './Fleches';
import { RepereDistance } from './RepereDistance';
import { cadenceStable, emettre, pret, type GesteType } from './evenements';
import { PLANCHER, clamp, lisse, r3, reculCouverture } from './geometrie';
import './Livre.css';

export interface LivrePose {
  /** Double page visée (index dans spreads, −1 = couverture fermée). */
  vers: number;
  /** Avancée du geste, de 0 (départ) à 1 (arrivée). */
  p: number;
}

export interface LivreProps {
  /** Les doubles pages, dans l'ordre. */
  spreads: SpreadSpec[];
  /** Double page affichée (0 = la première). Avec `cover`, −1 = livre fermé sur sa couverture. */
  index: number;
  /** Appelé quand une double page est atteinte (à la fin du geste). */
  onIndexChange?: (i: number) => void;
  /** Écoute ←/→, PageUp/PageDown (télécommandes de présentation), Début/Fin. */
  keyboard?: boolean;
  /** Plat de couverture : le livre s'ouvre depuis lui (index −1). */
  cover?: React.ReactNode;
  className?: string;
  /** Fige un tourne-page (aperçus, captures à mi-geste) : aucun mouvement, aucun clavier. */
  pose?: LivrePose;
}

interface Tour {
  id: number;
  /** Double page « basse » (recto du feuillet = sa page de droite). −1 = couverture. */
  lo: number;
  /** Double page « haute » (verso du feuillet = sa page de gauche). */
  hi: number;
  /** Cible du ressort : 0 = revenir sur lo, 1 = arriver sur hi. */
  but: 0 | 1;
  /** −1 en avançant, +1 en reculant (sens de la flexion, fixé pour le feuillet). */
  sens: 1 | -1;
  couverture: boolean;
  /** Le ressort est parti (pré-rendu terminé). */
  lance: boolean;
}

const tableDe = (spreads: SpreadSpec[], i: number): TableKind => (i >= 0 ? spreads[i]?.table : spreads[0]?.table) ?? 'bois';

/** Lance une transition de vue (repli : application immédiate) et l'annonce comme un geste. */
function transitionDeVue(type: GesteType, maj: () => void, livre: HTMLElement | null, nommer: boolean): void {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    maj();
    return;
  }
  const root = document.documentElement;
  root.setAttribute('data-gc-livre-vt', type);
  if (nommer && livre) livre.setAttribute('data-gc-vt', '');
  emettre(livre, 'prepa', type);
  const vt = document.startViewTransition(maj);
  // Le mouvement commence quand les captures sont prêtes (avant, l'écran est figé sur l'ancien état).
  vt.ready.then(() => emettre(livre, 'debut', type), () => emettre(livre, 'debut', type));
  vt.finished.finally(() => {
    if (root.getAttribute('data-gc-livre-vt') === type) root.removeAttribute('data-gc-livre-vt');
    if (nommer && livre) livre.removeAttribute('data-gc-vt');
    emettre(livre, 'fin', type);
  });
}

/** Une page posée dans un emplacement fixe : toujours montée, visible ou non. */
const Emplacement = React.memo(function Emplacement({ spread, side, mode, visible }: { spread: SpreadSpec; side: Cote; mode: RenderMode; visible: boolean }) {
  return (
    <div className={`gc-livre__page${visible ? ' gc-livre__page--visible' : ''}`} aria-hidden={visible ? undefined : true}>
      <Face spread={spread} side={side} mode={mode} />
    </div>
  );
});

function Tranche({ side, n }: { side: 'gauche' | 'droite'; n: number }) {
  return (
    <div className={`gc-livre__tranche gc-livre__tranche--${side}`} aria-hidden="true">
      {[4, 3, 2, 1].map((k) => (
        <div key={k} className={`gc-livre__feuille gc-livre__feuille--${k}${k <= n ? '' : ' gc-livre__feuille--absente'}`} />
      ))}
    </div>
  );
}

// Le carnet qui se feuillette : emplacements fixes gauche/droite, un feuillet 3D qui tourne,
// une couverture qui s'ouvre, une caméra (cran de distance + zoom fin) et deux flèches.
export function Livre({ spreads, index, onIndexChange, keyboard = false, cover, className, pose }: LivreProps) {
  const camera = useCamera();
  const reduced = !!useReducedMotion();
  const n = spreads.length;
  const min = cover != null ? -1 : 0;
  const max = Math.max(min, n - 1);
  const borne = React.useCallback((i: number) => Math.round(clamp(i, min, max)), [min, max]);

  const [affiche, setAffiche] = React.useState(() => borne(index));
  const [tour, setTour] = React.useState<Tour | null>(null);
  const [distance, setDistance] = React.useState<Distance>(camera.distance);

  // LA MotionValue du geste : 0 = feuillet à plat à droite, 1 = à plat à gauche.
  const p = useMotionValue(0);
  const fondu = useMotionValue(1);
  const livreRef = React.useRef<HTMLDivElement>(null);
  const espaceRef = React.useRef<HTMLDivElement>(null);
  const afficheRef = React.useRef(affiche);
  const cibleRef = React.useRef(affiche);
  const tourRef = React.useRef<Tour | null>(null);
  const animRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const animSeq = React.useRef(0);
  const seq = React.useRef(0);
  /** Dernier index annoncé au parent : son écho (prop index) ne doit pas écraser la cible. */
  const echo = React.useRef<number | null>(null);
  /** Taille de page du cran (px), lue sur le livre avant chaque geste de couverture. */
  const geoRef = React.useRef({ W: 0, H: 0 });
  const zoomRef = React.useRef(camera.zoom);
  zoomRef.current = camera.zoom;
  const vivant = React.useRef({ spreads, reduced, onIndexChange });
  vivant.current = { spreads, reduced, onIndexChange };

  React.useLayoutEffect(() => { afficheRef.current = affiche; }, [affiche]);
  React.useEffect(() => () => { animSeq.current++; animRef.current?.stop(); }, []);

  // Lecture de la géométrie du cran (avant un geste, jamais pendant).
  const mesurer = React.useCallback(() => {
    const el = livreRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    geoRef.current = { W: parseFloat(cs.getPropertyValue('--gc-page-w')) || 0, H: parseFloat(cs.getPropertyValue('--gc-page-h')) || 0 };
  }, []);
  React.useLayoutEffect(() => { mesurer(); }, [distance, mesurer]);

  // ---- Fin d'un geste : la double page atteinte devient la double page affichée -------------
  const atterrir = React.useCallback((T: Tour) => {
    if (tourRef.current !== T) return;
    animRef.current = null;
    tourRef.current = null;
    const nouvel = T.but === 1 ? T.hi : T.lo;
    const avant = afficheRef.current;
    const el = livreRef.current;
    if (el) el.removeAttribute('data-gc-geste');
    emettre(el, 'fin', T.couverture ? 'couverture' : 'page');
    // La double page logique change tout de suite : la mise à jour d'une transition de vue est
    // asynchrone, et le parent peut renvoyer l'index (onIndexChange) avant qu'elle ne s'applique.
    afficheRef.current = nouvel;
    const appliquer = () => { setAffiche(nouvel); setTour(null); };
    const { spreads: sp, reduced: rm, onIndexChange: cb } = vivant.current;
    // Nappe ↔ bois : la table change en fondu enchaîné (transition de vue sur la racine).
    if (tableDe(sp, avant) !== tableDe(sp, nouvel) && !rm) transitionDeVue('table', () => flushSync(appliquer), el, false);
    else appliquer();
    if (nouvel !== avant) { echo.current = nouvel; cb?.(nouvel); }
  }, []);

  // ---- Ressort : lancé, ou relancé vers une nouvelle cible (vitesse conservée) --------------
  const lancer = React.useCallback((T: Tour) => {
    animRef.current?.stop();
    const id = ++animSeq.current;
    animRef.current = animate(p, T.but, {
      ...(T.couverture ? SPRINGS.cover : SPRINGS.paper),
      onComplete: () => { if (animSeq.current === id) atterrir(T); },
    });
  }, [p, atterrir]);

  // ---- Moteur : rapproche la double page affichée de la cible, sans jamais empiler ----------
  const pousser = React.useCallback(() => {
    const T = tourRef.current;
    const cible = cibleRef.current;
    if (T) {
      const but: 0 | 1 = cible <= T.lo ? 0 : cible >= T.hi ? 1 : T.but;
      if (but !== T.but) {
        T.but = but;
        if (T.lance) lancer(T);
      }
      return;
    }
    const de = afficheRef.current;
    if (cible === de) return;
    if (vivant.current.reduced) {
      // Moins de mouvement : fondu court, sans courbure. La double page logique change tout de
      // suite (la mise à jour de la transition de vue est asynchrone).
      afficheRef.current = cible;
      const appliquer = () => setAffiche(cible);
      transitionDeVue('fondu', () => flushSync(appliquer), livreRef.current, false);
      echo.current = cible;
      vivant.current.onIndexChange?.(cible);
      return;
    }
    // La couverture s'ouvre toujours sur la première double page (et s'y referme).
    let vers = cible;
    if (de === -1) vers = 0;
    else if (cible === -1 && de > 0) vers = 0;
    const avance = vers > de;
    const lo = Math.min(de, vers);
    const nouveau: Tour = { id: ++seq.current, lo, hi: Math.max(de, vers), but: avance ? 1 : 0, sens: avance ? -1 : 1, couverture: lo === -1, lance: false };
    tourRef.current = nouveau;
    p.set(avance ? 0 : 1);
    setTour(nouveau);
  }, [lancer, p]);

  const aller = React.useCallback((i: number) => {
    cibleRef.current = borne(i);
    pousser();
  }, [borne, pousser]);

  // Pré-rendu terminé (images décodées, polices prêtes, 300 ms au plus ; calques rastérisés,
  // cadence revenue régulière) → le ressort part.
  React.useLayoutEffect(() => {
    const T = tour;
    if (!T || T.lance || pose) return;
    let annule = false;
    const el = livreRef.current;
    if (el) {
      el.setAttribute('data-gc-geste', T.couverture ? 'couverture' : 'page');
      if (T.couverture) mesurer();
    }
    pret(espaceRef.current)
      .then(() => cadenceStable())
      .then(() => {
        if (annule || tourRef.current !== T) return;
        T.lance = true;
        emettre(el, 'debut', T.couverture ? 'couverture' : 'page');
        lancer(T);
      });
    return () => {
      annule = true;
      // Geste abandonné avant d'avoir commencé : rien ne doit rester « en cours ».
      if (!T.lance) {
        if (tourRef.current === T) tourRef.current = null;
        el?.removeAttribute('data-gc-geste');
      }
    };
  }, [tour, lancer, pose, mesurer]);

  // Enchaînement : un geste fini, on repart si la cible a encore bougé.
  React.useEffect(() => { if (!tour && !pose) pousser(); }, [tour, affiche, pousser, pose]);

  // Index imposé par le parent (sauf l'écho de ce que le livre vient d'annoncer).
  React.useEffect(() => {
    if (pose) return;
    if (echo.current !== null && index === echo.current) return;
    echo.current = null;
    aller(index);
  }, [index, aller, pose]);

  // Livre fermé au repos : la couverture est à plat (p = 0).
  React.useLayoutEffect(() => { if (!tour && !pose && affiche === -1) p.set(0); }, [tour, affiche, pose, p]);

  // ---- Clavier ---------------------------------------------------------------------------
  React.useEffect(() => {
    if (!keyboard || pose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      let next: number;
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': next = cibleRef.current + 1; break;
        case 'ArrowLeft': case 'PageUp': next = cibleRef.current - 1; break;
        case 'Home': next = min; break;
        case 'End': next = max; break;
        default: return;
      }
      e.preventDefault();
      aller(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, pose, aller, min, max]);

  // ---- Caméra : changement de cran = vraie mise en page, en transition de vue -------------
  React.useEffect(() => {
    const next = camera.distance;
    if (next === distance) return;
    const el = livreRef.current;
    const appliquer = () => setDistance(next);
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      transitionDeVue('distance', () => flushSync(appliquer), el, !reduced);
      return;
    }
    // Repli sans View Transitions : fondu sortant, nouvelle mise en page, fondu entrant.
    emettre(el, 'debut', 'distance');
    const a = animate(fondu, 0, {
      ...SPRINGS.camera,
      onComplete: () => {
        flushSync(appliquer);
        animate(fondu, 1, { ...SPRINGS.camera, onComplete: () => emettre(el, 'fin', 'distance') });
      },
    });
    return () => a.stop();
  }, [camera.distance, distance, reduced, fondu]);

  // ---- Pose figée (aperçus, captures à mi-geste) ------------------------------------------
  const poseVers = pose?.vers;
  const tourPose = React.useMemo<Tour | null>(() => {
    if (poseVers == null) return null;
    const de = affiche;
    let vers = borne(poseVers);
    if (vers === de) return null;
    if (de === -1) vers = 0;
    else if (vers === -1 && de > 0) vers = 0;
    const avance = vers > de;
    const lo = Math.min(de, vers);
    return { id: -1, lo, hi: Math.max(de, vers), but: avance ? 1 : 0, sens: avance ? -1 : 1, couverture: lo === -1, lance: true };
  }, [poseVers, affiche, borne]);
  const poseP = pose?.p;

  // ---- Ce qui est monté --------------------------------------------------------------------
  const T = pose ? tourPose : tour;
  const couv = T ? T.couverture : affiche === -1;
  const feuille = T ?? (affiche === -1 ? { id: 0, lo: -1, hi: 0, sens: -1 as const, couverture: true } : null);

  // Mouvement de caméra de l'ouverture : livre fermé centré → cadrage ouvert ; la caméra recule juste
  // ce qu'il faut quand la couverture se dresse (elle ne dépasse jamais sa taille au repos).
  const livreT = useTransform(p, (v) => {
    if (!couv) return 'none';
    const t = clamp(v, 0, 1);
    const g = geoRef.current;
    return `translateX(${r3(-25 * (1 - t))}%) scale(${r3(reculCouverture(v, g.W, g.H, zoomRef.current))})`;
  });
  // (plancher : un calque à opacité nulle ne serait peint et rastérisé qu'en plein geste)
  const ombreGauche = useTransform(p, (v) => (couv ? Math.max(PLANCHER, lisse(0.55, 1, v)) : 1));
  // Livre fermé : il est épais, son ombre est plus dense ; elle s'allège quand la couverture se lève.
  const ombreEpaisseur = useTransform(p, (v) => (couv ? 1 - lisse(0, 0.45, v) : 0));

  // Pose figée : posée après les useTransform ci-dessus (abonnés dans leurs propres effets).
  React.useLayoutEffect(() => {
    if (tourPose && poseP != null) p.set(tourPose.but === 1 ? poseP : 1 - poseP);
  }, [tourPose, poseP, p]);

  // Pré-rendu : la double page affichée et ses voisines (−1, +1) restent montées ; seules les
  // pages du geste en cours sont visibles. Aucune n'est créée ni retirée pendant un geste.
  const montes = new Set<number>([affiche - 1, affiche, affiche + 1]);
  if (T) { montes.add(T.lo); montes.add(T.hi); }
  const liste = Array.from(montes).filter((k) => k >= 0 && k < n).sort((a, b) => a - b);
  const visibleG = (k: number) => (T ? k === T.lo : k === affiche);
  const visibleD = (k: number) => (T ? k === T.hi : k === affiche);
  const modeDe = (k: number): RenderMode => (k === affiche ? 'live' : 'static');

  const frac = n > 1 ? clamp(affiche, 0, n - 1) / (n - 1) : 0;
  const nG = affiche <= 0 ? 0 : Math.max(1, Math.round(4 * frac));
  const nD = affiche >= n - 1 ? 0 : Math.max(1, Math.round(4 * (1 - frac)));

  let leaf: React.ReactNode = null;
  if (feuille && feuille.couverture) {
    leaf = (
      <FeuilletCouverture
        key="couverture"
        p={p}
        recto={cover}
        verso={spreads[0] ? <Face spread={spreads[0]} side="left" mode="static" /> : null}
      />
    );
  } else if (feuille && spreads[feuille.lo] && spreads[feuille.hi]) {
    leaf = (
      <Feuillet
        key={feuille.id}
        p={p}
        sens={feuille.sens}
        recto={<Face spread={spreads[feuille.lo]} side="right" mode="static" />}
        verso={<Face spread={spreads[feuille.hi]} side="left" mode="static" />}
      />
    );
  }

  const table = tableDe(spreads, affiche);
  const annonce = affiche === -1 ? 'Carnet fermé' : `Double page ${affiche + 1} sur ${n}`;

  return (
    <LazyMotion features={domMax}>
      <Stage
        distance={distance}
        table={table}
        className={['gc-livre-scene', className].filter(Boolean).join(' ')}
        overlay={
          <>
            <RepereDistance distance={camera.distance} zoom={camera.zoom} changedAt={camera.changedAt} />
            <Fleches
              onPrecedente={() => aller(cibleRef.current - 1)}
              onSuivante={() => aller(cibleRef.current + 1)}
              debut={affiche <= min}
              fin={affiche >= max}
            />
          </>
        }
      >
        <Camera zoom={camera.zoom} fondu={fondu}>
          <div ref={livreRef} className="gc-livre" data-gc-etat={couv ? 'couverture' : 'ouvert'}>
            {/* Mouvement de caméra de l'ouverture : appliqué au corps et à l'espace 3D séparément
                (transformer leur parent commun obligerait à aplatir tout le livre à chaque image). */}
            <m.div className="gc-livre__corps" style={{ transform: livreT }}>
              <m.div className="gc-livre__ombre gc-livre__ombre--gauche" style={{ opacity: ombreGauche }} aria-hidden="true" />
              <div className="gc-livre__ombre gc-livre__ombre--droite" aria-hidden="true" />
              {couv && <m.div className="gc-livre__ombre gc-livre__ombre--epaisseur" style={{ opacity: ombreEpaisseur }} aria-hidden="true" />}
              <div className="gc-livre__carton gc-livre__carton--gauche gc-livre__carton-toile gc-livre__carton-bord--gauche" aria-hidden="true" />
              <div className="gc-livre__carton gc-livre__carton--droite gc-livre__carton-toile gc-livre__carton-bord--droite" aria-hidden="true" />
              <Tranche side="gauche" n={nG} />
              <Tranche side="droite" n={nD} />
              <div className="gc-livre__emplacement gc-livre__emplacement--gauche">
                {liste.map((k) => <Emplacement key={spreads[k].id} spread={spreads[k]} side="left" mode={modeDe(k)} visible={visibleG(k)} />)}
              </div>
              <div className="gc-livre__emplacement gc-livre__emplacement--droite">
                {liste.map((k) => <Emplacement key={spreads[k].id} spread={spreads[k]} side="right" mode={modeDe(k)} visible={visibleD(k)} />)}
              </div>
              <div className="gc-livre__dos" aria-hidden="true" />
              {T && <Portees key={T.id} p={p} sens={T.sens} couverture={T.couverture} />}
            </m.div>
            <m.div ref={espaceRef} className="gc-livre__espace" style={{ transform: livreT }}>{leaf}</m.div>
          </div>
        </Camera>
        <p className="gc-livre__annonce" aria-live="polite">{annonce}</p>
      </Stage>
    </LazyMotion>
  );
}
