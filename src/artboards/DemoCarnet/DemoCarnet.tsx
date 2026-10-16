// Démo du carnet animé : couverture qui s'ouvre, double page de Julie, puis trois doubles pages
// écrites par d'autres invités, chacun de sa main, sur papier ancien, toutes sur la table en bois.
// Clavier : ← → pour tourner, + / − pour la distance, Alt + / − pour le zoom fin, 0 pour revenir à
// 100 %. Au doigt ou à la souris : glisser pour tourner, toucher une marge pour la page voisine.
// Les doubles pages sont partagées avec l'application (artboard Carnet) : ./spreads.tsx.
import React from 'react';
import { Livre } from '../../components/Livre';
import { CameraProvider } from '../../lib/camera';
import { COUVERTURE, SPREADS_DEMO } from './spreads';

export function DemoCarnet() {
  const [index, setIndex] = React.useState(-1);
  return (
    <CameraProvider keyboard persist={false}>
      <Livre spreads={SPREADS_DEMO} index={index} onIndexChange={setIndex} keyboard cover={COUVERTURE} />
    </CameraProvider>
  );
}

export default DemoCarnet;
