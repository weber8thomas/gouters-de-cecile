// Images cuites (crayon, aquarelle, papier…) : jamais en data URI dans le bundle, toujours par URL.
// Le manifeste généré (src/generated/assets.gen.ts) dépend de la cible du build :
//   artifact → /_blob/<id> (asset téléversé) · harness → /design-system/baked/… · site → ./design-system/baked/…
import { ASSETS } from '../generated/assets.gen';

export interface AssetInfo {
  u: string; // URL
  w: number; // largeur en px
  h: number; // hauteur en px
}

let resolver: ((name: string, info: AssetInfo) => string) | null = null;

/** Remplace la résolution des URL (autre hébergement, tests). */
export function setAssetResolver(fn: ((name: string, info: AssetInfo) => string) | null): void {
  resolver = fn;
}

export function assetInfo(name: string): AssetInfo | undefined {
  return ASSETS[name];
}

/** URL d'une image cuite par son nom logique (« paper/base », « ecrins/cloche/a/front »). */
export function assetUrl(name: string): string {
  const info = ASSETS[name];
  if (!info) {
    if (typeof console !== 'undefined') console.warn(`Asset inconnu : ${name}`);
    return '';
  }
  return resolver ? resolver(name, info) : info.u;
}

/** Valeur CSS url(...) pour une propriété personnalisée (bundle.css ne contient aucune URL). */
export const cssUrl = (name: string): string => {
  const u = assetUrl(name);
  return u ? `url("${u}")` : 'none';
};

export const assetNames = (): string[] => Object.keys(ASSETS);
