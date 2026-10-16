// Recettes et petits mots des invités (fictifs). Respecter le budget de contenu :
// page vidéo → titre ≤ 28 car., ≤ 8 ingrédients de ≤ 22 car., ≤ 4 étapes et ≤ 220 car. au total,
// petit mot ≤ 120 car. Vocabulaire de cuisine français : « th. 6 (180 °C) », « 1 c. à s. ».
import type { Guest } from './types';

export type GuestText = Pick<Guest, 'recipe' | 'note' | 'signature' | 'ink'>;

export const TEXTS: Record<string, GuestText> = {
  julie: {
    recipe: {
      title: 'Le cake citron de Julie',
      prep: '15 min',
      cook: '45 min',
      servings: '8 parts',
      ingredients: [
        '3 œufs',
        '150 g de sucre',
        '2 citrons non traités',
        '180 g de farine',
        '½ sachet de levure',
        '125 g de beurre fondu',
        '1 c. à s. de pavot',
        '1 pincée de sel',
      ],
      steps: [
        'Four à 180 °C (th. 6).',
        'Fouette œufs, sucre, zestes et jus de citron.',
        'Ajoute farine, levure, sel, pavot, beurre fondu.',
        'Moule à cake beurré, 45 min au four.',
      ],
    },
    note: 'Pour toutes nos pauses goûter à refaire le monde. Joyeux anniversaire ma Cécile !',
    signature: 'Julie',
    ink: 'night',
  },
};
