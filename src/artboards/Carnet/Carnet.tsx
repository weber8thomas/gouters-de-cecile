// Le carnet, tel que les invités l'ouvrent : sur téléphone, tablette, ordinateur ou TV (CONTRACT
// §§ 11–12). MotionConfig (moins d'animations) › CameraProvider › Ecran (plein écran, cadrage « double »
// ou « page ») › SoulevementProvider (photo-vidéo et feuillet volant soulevés au-dessus du livre) ›
// Livre, avec le menu de réglages dans l'Ecran. Racine de l'application (index.html → src/app/main.tsx)
// et de la page autonome (harness/devices.html : React UMD + bundle.js, Artboards.Carnet).
import React from 'react';
import { Ecran } from '../../components/Ecran';
import { Livre } from '../../components/Livre';
import { Reglages, CREDITS_REGLAGES } from '../../components/Reglages';
import { SoulevementProvider, souleverObjet, useSoulevement } from '../../components/Soulever';
import { CameraProvider } from '../../lib/camera';
import { MotionConfig } from '../../lib/motion';
import { useReglages } from '../../lib/reglages';
import { ViewportOverride, type ViewportForce } from '../../lib/viewport';
import { COUVERTURE, CREDITS_VIDEOS, SPREADS_DEMO, videoDe } from '../DemoCarnet/spreads';
import { indexDuLien, useLienProfond } from './liens';

export interface CarnetProps {
  /**
   * Écran imposé (ViewportOverride) : { w, h } pour un écran simulé (cartes), ou seulement { insets }
   * pour simuler des encoches sur la vraie fenêtre (tests).
   */
  ecran?: ViewportForce;
  /** Liens profonds : #<id> ouvre la double page, l'URL suit la page affichée. */
  liens?: boolean;
  /** Double page de départ sans lien (−1 : couverture, défaut). */
  depart?: number;
  /** Cadrage « page » : page de départ (défaut : gauche, la vidéo). */
  coteInitial?: 'gauche' | 'droite';
}

const CLE_CAMERA = 'gc:camera:v1';

/** Sur un écran tactile, le cran par défaut est « proche » (s'il n'a jamais été réglé). */
function cranTactileParDefaut(tactile: boolean): void {
  if (!tactile) return;
  try {
    if (!localStorage.getItem(CLE_CAMERA)) localStorage.setItem(CLE_CAMERA, JSON.stringify({ distance: 'proche', zoom: 1 }));
  } catch { /* stockage indisponible : cran par défaut du fournisseur */ }
}

export function Carnet({ ecran, liens = false, depart = -1, coteInitial }: CarnetProps) {
  const spreads = SPREADS_DEMO;
  const simule = !!ecran && ecran.w != null && ecran.h != null;
  const [index, setIndex] = React.useState(() => {
    if (!simule) {
      const tactile = ecran?.tactile ?? (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
      cranTactileParDefaut(tactile);
    }
    if (liens && typeof location !== 'undefined') {
      const i = indexDuLien(spreads, location.hash);
      if (i >= 0 || location.hash) return i; // id inconnu : couverture
    }
    return depart;
  });
  useLienProfond(liens, spreads, index, setIndex);
  const [reglages] = useReglages();
  // « Moins d'animations » : crochet CSS sur la racine (data-gc-mouvement="reduit"), en plus de MotionConfig.
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-gc-mouvement', reglages.mouvementReduit ? 'reduit' : 'normal');
  }, [reglages.mouvementReduit]);

  const carnet = (
    <MotionConfig reducedMotion={reglages.mouvementReduit ? 'always' : 'user'}>
      <CameraProvider keyboard persist={!simule} fixed={simule && ecran?.tactile ? { distance: 'proche' } : undefined}>
        <Ecran pleinEcran>
          <SoulevementProvider>
            <CarnetLivre index={index} setIndex={setIndex} coteInitial={coteInitial} />
          </SoulevementProvider>
        </Ecran>
      </CameraProvider>
    </MotionConfig>
  );
  return ecran ? <ViewportOverride.Provider value={ecran}>{carnet}</ViewportOverride.Provider> : carnet;
}

const CREDITS = (
  <>
    <p>{CREDITS_REGLAGES}</p>
    <ul>
      {CREDITS_VIDEOS.map((c) => (
        <li key={c.titre}>{c.titre} : {c.auteur} ({c.licence})</li>
      ))}
    </ul>
  </>
);

/** Le livre, ses touches (Entrée : vidéo, ↑ : feuillet), la vidéo préparée à chaque page, le menu. */
function CarnetLivre({ index, setIndex, coteInitial }: { index: number; setIndex: (i: number) => void; coteInitial?: 'gauche' | 'droite' }) {
  const spreads = SPREADS_DEMO;
  const { preparer, reposer } = useSoulevement();
  const [reglages] = useReglages();
  const lectureAuto = React.useRef(reglages.lectureAuto);
  lectureAuto.current = reglages.lectureAuto;

  // La vidéo de la double page affichée est préparée à l'atterrissage (jamais pendant un geste).
  React.useEffect(() => {
    preparer(index >= 0 ? videoDe(spreads[index]) : null);
  }, [index, preparer, spreads]);

  const changer = React.useCallback((i: number) => {
    setIndex(i);
    if (i >= 0 && lectureAuto.current && videoDe(spreads[i])) {
      // Lecture automatique : la photo se soulève une fois la page posée (sans le son si le
      // navigateur le refuse hors d'un geste ; le premier toucher le rend).
      requestAnimationFrame(() => requestAnimationFrame(() => souleverObjet('photo')));
    }
  }, [setIndex, spreads]);

  // Entrée / Espace : la vidéo de la double page ; ↑ : le feuillet volant. Appelé DANS le keydown.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || index < 0) return;
      const cible = e.target as HTMLElement | null;
      if (cible && cible.closest('button, a, input, select, textarea, [role="slider"]')) return;
      let fait = false;
      if (e.key === 'Enter' || e.key === ' ') fait = souleverObjet('photo');
      else if (e.key === 'ArrowUp') fait = souleverObjet('feuillet');
      if (fait) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index]);

  const invites = React.useMemo(() => spreads.map((s, i) => ({ index: i, titre: s.titre ?? s.id })), [spreads]);
  const aller = React.useCallback((i: number) => { reposer(); setIndex(i); }, [reposer, setIndex]);

  return (
    <>
      <Livre spreads={spreads} index={index} onIndexChange={changer} keyboard cover={COUVERTURE} coteInitial={coteInitial} />
      <Reglages invites={invites} onAller={aller} credits={CREDITS} />
    </>
  );
}

export default Carnet;
