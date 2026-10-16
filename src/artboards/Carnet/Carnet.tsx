// Le carnet, tel que les invités l'ouvrent : sur téléphone, tablette, ordinateur ou TV (CONTRACT § 11).
// CameraProvider + Ecran (plein écran, cadrage « double » ou « page ») + Livre + lecture simulée de
// Julie, avec les doubles pages de la démo. Racine de l'application (index.html → src/app/main.tsx)
// et de la page autonome (harness/devices.html : React UMD + bundle.js, Artboards.Carnet).
import React from 'react';
import { Ecran } from '../../components/Ecran';
import { Livre } from '../../components/Livre';
import { CameraProvider } from '../../lib/camera';
import { ViewportOverride, type ViewportForce } from '../../lib/viewport';
import { COUVERTURE, LectureJulie, SPREADS_DEMO, toucherCloche, type LectureApi } from '../DemoCarnet/spreads';
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
  const lecture = React.useRef<LectureApi | null>(null);

  const carnet = (
    <LectureJulie actif={index === 0} apiRef={lecture}>
      <CameraProvider keyboard persist={!simule} fixed={simule && ecran?.tactile ? { distance: 'proche' } : undefined}>
        <Ecran pleinEcran>
          <Livre
            spreads={spreads}
            index={index}
            onIndexChange={setIndex}
            keyboard
            cover={COUVERTURE}
            coteInitial={coteInitial}
            onToucherPage={(t) => toucherCloche(t, lecture.current)}
          />
        </Ecran>
      </CameraProvider>
    </LectureJulie>
  );
  return ecran ? <ViewportOverride.Provider value={ecran}>{carnet}</ViewportOverride.Provider> : carnet;
}

export default Carnet;
