// Réglages globaux d'une scène, fournis par <Stage> et lus par les composants.
// Décisions (design-system/decisions.json) : Playfair Display pour l'« imprimé », table en bois pour
// les pages vidéo et nappe pour les recettes et intercalaires, sépia avant lecture.
// Distance de caméra : trois crans validés (voir src/lib/camera.tsx et la famille « distance » des tokens).
import React from 'react';
import './distance.css';

export type TableKind = 'bois' | 'nappe';
export type IdleLook = 'aquarelle' | 'sepia';
export type Distance = 'proche' | 'moyenne' | 'loin';
export const DISTANCES: Distance[] = ['proche', 'moyenne', 'loin'];

export interface Settings {
  table: TableKind;
  idle: IdleLook;
  distance: Distance;
}

export const DEFAULT_SETTINGS: Settings = { table: 'bois', idle: 'sepia', distance: 'moyenne' };
export const SettingsContext = React.createContext<Settings>(DEFAULT_SETTINGS);
export const useSettings = () => React.useContext(SettingsContext);

// Les titres « imprimés » utilisent les styles typographiques des tokens (Playfair Display).
export type TitleRole = 'cover-title' | 'chapter-title' | 'recipe-title' | 'section-label' | 'folio';
export const useTitleClass = (role: TitleRole): string => `gc-${role}`;

// Attributs posés sur la racine d'une scène : le CSS suit les réglages (distance.css recopie la
// géométrie et les hauteurs d'x du cran actif).
export const settingsAttrs = (s: Settings) => ({ 'data-gc-table': s.table, 'data-gc-idle': s.idle, 'data-gc-distance': s.distance });
