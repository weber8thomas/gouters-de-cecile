// Point d'entrée du bundle : tout ce qui est exporté ici devient window.GoutersDeCecile.
// Les composants et artboards sont ajoutés automatiquement (scripts/gen-entry.mjs).
export * from './generated/components.gen';
export { ECRINS } from './generated/ecrins.gen';
export { ILLUSTRATIONS } from './generated/illustrations.gen';
export { chapters, guests, getGuest, getChapter, guestsOf } from './content';
export { DEFAULT_SETTINGS, SettingsContext, useSettings, useTitleClass } from './lib/settings';
export const version = '0.1.0';
