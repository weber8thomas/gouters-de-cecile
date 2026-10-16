// Point d'entrée du bundle : tout ce qui est exporté ici devient window.GoutersDeCecile.
// Les composants et artboards sont ajoutés automatiquement (scripts/gen-entry.mjs).
export * from './generated/components.gen';
export { ECRINS } from './generated/ecrins.gen';
export { ILLUSTRATIONS } from './generated/illustrations.gen';
export { chapters, guests, getGuest, getChapter, guestsOf } from './content';
export { DEFAULT_SETTINGS, DISTANCES, SettingsContext, useSettings, useTitleClass } from './lib/settings';
export { assetUrl, assetInfo, cssUrl, setAssetResolver, assetNames } from './lib/assets';
export { CameraProvider, useCamera } from './lib/camera';
export { handStyle, handText, HANDS, INKS } from './lib/hands';
export const version = '0.1.0';
