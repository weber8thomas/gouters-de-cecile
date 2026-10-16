export { Livre } from './Livre';
export type { LivreProps, LivrePose, CotePage, ToucherPage } from './Livre';
export { GESTE_EVENT, TOUCHER_EVENT } from './evenements';
// La caméra (src/lib/camera.tsx) n'est pas exposée par src/index.ts : on la ré-exporte ici pour
// les cartes et l'application (même liaison, aucun doublon si un autre composant fait de même).
export { CameraProvider, useCamera } from '../../lib/camera';
export type { CameraProviderProps } from '../../lib/camera';
