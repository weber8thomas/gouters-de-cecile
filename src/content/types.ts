// Types du contenu du carnet. Toute donnée affichée passe par ces types.

export type ChapterId = 'gateaux' | 'biscuits' | 'tartes' | 'boissons' | 'crepes';
export type EcrinId = 'cloche' | 'napperon' | 'etiquette' | 'assiette' | 'polaroid' | 'vitrine' | 'tambour';
export type Liquid = 'the' | 'chocolat' | 'cafe-au-lait';
export type Ink = 'night' | 'chocolat';

export interface Chapter {
  id: ChapterId;
  title: string; // « Gâteaux & cakes »
  ecrin: EcrinId; // écrin du chapitre
}

export interface Recipe {
  title: string; // ≤ 28 caractères, ex. « Le cake citron de Julie »
  prep: string; // « 15 min »
  cook?: string; // « 45 min »
  rest?: string; // « 1 h »
  servings: string; // « 8 parts »
  ingredients: string[]; // ≤ 8 (page vidéo), ≤ 22 caractères chacun
  steps: string[]; // ≤ 4 (page vidéo), ≤ 220 caractères au total
}

export interface Look {
  skin: 1 | 2 | 3 | 4 | 5 | 6; // gc-skin-N
  hair: 1 | 2 | 3 | 4 | 5 | 6; // gc-hair-N
  hairStyle: 'court' | 'boucle-court' | 'carre' | 'long' | 'long-boucle' | 'queue' | 'chignon' | 'tresse' | 'frange' | 'foulard' | 'degarni';
  top: string; // nom de token couleur, ex. « gc-sage-500 »
  glasses?: boolean;
  beard?: 'barbe' | 'moustache';
  age?: 'enfant' | 'adulte' | 'aine';
}

export interface Video {
  ecrin: EcrinId;
  variant: string; // « a », « b », « c »
  caption: string; // « Julie, depuis Lyon »
  duration: number; // secondes
  liquid: Liquid; // contenu de la tasse-progression
  scene: string; // slug de la scène illustrée de remplacement
}

export interface Guest {
  slug: string;
  firstName: string;
  city: string;
  chapter: ChapterId;
  look: Look;
  video?: Video;
  recipe?: Recipe; // rempli par le contenu (invites.ts)
  note?: string; // petit mot pour Cécile, ≤ 120 caractères
  signature?: string;
  ink?: Ink;
}
