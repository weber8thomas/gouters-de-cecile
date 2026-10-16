// Réglages globaux d'une scène, fournis par <Stage> et lus par les composants.
// Ils restent ouverts tant que la planche comparative n'a pas tranché (serif, fond, avant lecture).
import React from 'react';

export type Serif = 'cormorant' | 'playfair';
export type TableKind = 'bois' | 'nappe';
export type IdleLook = 'aquarelle' | 'sepia';

export interface Settings {
  serif: Serif;
  table: TableKind;
  idle: IdleLook;
}

export const DEFAULT_SETTINGS: Settings = { serif: 'cormorant', table: 'bois', idle: 'aquarelle' };
export const SettingsContext = React.createContext<Settings>(DEFAULT_SETTINGS);
export const useSettings = () => React.useContext(SettingsContext);

// Les titres utilisent les styles typographiques des tokens : gc-recipe-title (Cormorant)
// ou gc-pf-recipe-title (Playfair) selon la serif retenue.
export type TitleRole = 'cover-title' | 'chapter-title' | 'recipe-title' | 'section-label' | 'folio';
export function useTitleClass(role: TitleRole): string {
  const { serif } = useSettings();
  return serif === 'playfair' ? `gc-pf-${role}` : `gc-${role}`;
}

// Attributs de données posés sur la racine d'une scène, pour que le CSS suive les réglages.
export const settingsAttrs = (s: Settings) => ({ 'data-gc-serif': s.serif, 'data-gc-table': s.table, 'data-gc-idle': s.idle });
