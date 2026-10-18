// Démo du carnet sur la TV (carte du design system, 1920 × 1080) : le carnet complet de l'application
// (artboard Carnet) sur un écran de TV simulé — couverture qui s'ouvre, Lisa (feuillet volant), Julie,
// Mamie Rose, Mathis et Bernard, le mot de la fin ; photos-vidéos collées, menu de réglages (M).
// Clavier : ← → pages, Entrée vidéo, ↑ feuillet, + / − distance, Alt + / − zoom fin, M réglages.
import React from 'react';
import { Carnet } from '../Carnet/Carnet';

export function DemoCarnet() {
  return <Carnet ecran={{ w: 1920, h: 1080, tactile: false }} />;
}

export default DemoCarnet;
