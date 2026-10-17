import type { Effets } from './vivante';

// Ce qui vit dans chaque aquarelle (aquarelles vivantes, vivante.ts). Positions en fractions de l'image
// (design-system/baked/aquarelles/<nom>.webp), y vers le bas. Les autres aquarelles se peignent et respirent.
export const EFFETS: Record<string, Effets> = {
  // théière et deux tasses : le bec verseur, puis le thé des deux tasses
  theiere: { vapeur: [[0.19, 0.2, 0.07], [0.22, 0.45, 0.16], [0.75, 0.43, 0.16]] },
  // la tasse : au-dessus du café
  'tasse-2': { vapeur: [[0.4, 0.1, 0.42]] },
  // la part de gâteau : la flamme de la bougie
  gateau: { flamme: [0.645, 0.055, 0.045] },
  // la tarte sort du four
  'tarte-pommes': { vapeur: [[0.38, 0.22, 0.24], [0.64, 0.26, 0.22]] },
  // le blé ploie au vent ; les plantes à peine
  ble: { vent: 1 },
  vanille: { vent: 0.3 },
  cannelle: { vent: 0.25 },
  // des miettes tombent du bord du cookie de devant
  cookies: { miettes: [0.467, 0.878, 0.3] },
  // un reflet glisse sur les fruits
  citron: { reflet: 1 },
  'citron-2': { reflet: 1 },
  pomme: { reflet: 0.8 },
  'pomme-2': { reflet: 0.8 },
  orange: { reflet: 1 },
  'orange-2': { reflet: 1 },
};
