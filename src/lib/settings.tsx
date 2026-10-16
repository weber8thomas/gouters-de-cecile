// Réglages globaux d'une scène, fournis par <Stage> et lus par les composants.
// Décisions de la planche comparative (design-system/decisions.json) : titres en Playfair Display,
// table en bois pour les pages vidéo et nappe pour les recettes et intercalaires, sépia avant lecture.
import React from 'react';

export type TableKind = 'bois' | 'nappe';
export type IdleLook = 'aquarelle' | 'sepia';

export interface Settings {
  table: TableKind;
  idle: IdleLook;
}

export const DEFAULT_SETTINGS: Settings = { table: 'bois', idle: 'sepia' };
export const SettingsContext = React.createContext<Settings>(DEFAULT_SETTINGS);
export const useSettings = () => React.useContext(SettingsContext);

// Les titres utilisent les styles typographiques des tokens (Playfair Display).
export type TitleRole = 'cover-title' | 'chapter-title' | 'recipe-title' | 'section-label' | 'folio';
export const useTitleClass = (role: TitleRole): string => `gc-${role}`;

// Attributs de données posés sur la racine d'une scène, pour que le CSS suive les réglages.
export const settingsAttrs = (s: Settings) => ({ 'data-gc-table': s.table, 'data-gc-idle': s.idle });
