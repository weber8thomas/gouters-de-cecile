// Contexte de l'écran : ce que la coque plein écran (Ecran) dit au livre qu'elle contient.
// Hors d'un <Ecran>, useEcran() renvoie null et le Livre garde son comportement de scène 1920 × 1080.
import React from 'react';
import type { Viewport } from '../../lib/viewport';

export interface EcranInfo {
  /** Fenêtre d'affichage (taille, densité, tactile, zones sûres, cadrage). */
  vp: Viewport;
  /** Calque des contrôles, en px d'écran, hors de la scène mise à l'échelle (cible de portail). */
  controles: HTMLElement | null;
  /** Écran simulé (carte, test) : une boîte de la taille imposée, pas la fenêtre du navigateur. */
  simule: boolean;
}

export const EcranContext = React.createContext<EcranInfo | null>(null);
export const useEcran = (): EcranInfo | null => React.useContext(EcranContext);
