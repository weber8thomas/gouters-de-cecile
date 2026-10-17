export { Ecran } from './Ecran';
export type { EcranProps } from './Ecran';
export { useEcran } from './contexte';
export type { EcranInfo } from './contexte';
// La fenêtre d'affichage (src/lib/viewport.ts) n'est pas exposée par src/index.ts : on la ré-exporte
// ici pour l'application et les cartes (ViewportOverride : écrans simulés).
export { useViewport, ViewportOverride, cadrageDe, echelleContain, cadrerDouble, cadrerPage } from '../../lib/viewport';
export type { Viewport, ViewportForce, Cadrage, Insets } from '../../lib/viewport';
