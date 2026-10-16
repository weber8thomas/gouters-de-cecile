// Démo du carnet animé : couverture qui s'ouvre, double page de Julie (Entrée lance la vidéo :
// le dôme se soulève, la couleur revient, la tasse se remplit), puis trois doubles pages écrites par
// d'autres invités, chacun de sa main, sur papier ancien. Clavier : ← → pour tourner, + / − pour la
// distance, ↑ ↓ pour le zoom fin, 0 pour revenir à 100 %. Au doigt ou à la souris : glisser pour
// tourner, toucher la cloche de Julie pour la lecture, toucher une marge pour la page voisine.
// Les doubles pages sont partagées avec l'application (artboard Carnet) : ./spreads.tsx.
import React from 'react';
import { Livre } from '../../components/Livre';
import { CameraProvider } from '../../lib/camera';
import { COUVERTURE, LectureJulie, SPREADS_DEMO, toucherCloche, type LectureApi } from './spreads';

export function DemoCarnet() {
  const [index, setIndex] = React.useState(-1);
  const lecture = React.useRef<LectureApi | null>(null);
  return (
    <LectureJulie actif={index === 0} apiRef={lecture}>
      <CameraProvider keyboard persist={false}>
        <Livre
          spreads={SPREADS_DEMO}
          index={index}
          onIndexChange={setIndex}
          keyboard
          cover={COUVERTURE}
          onToucherPage={(t) => toucherCloche(t, lecture.current)}
        />
      </CameraProvider>
    </LectureJulie>
  );
}

export default DemoCarnet;
