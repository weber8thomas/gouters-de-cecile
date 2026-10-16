// Types du contenu du carnet. Toute donnée affichée passe par ces types.

export type ChapterId = 'gateaux' | 'biscuits' | 'tartes' | 'boissons' | 'crepes';
export type EcrinId = 'cloche' | 'napperon' | 'etiquette' | 'assiette' | 'polaroid' | 'vitrine' | 'tambour';
export type Liquid = 'the' | 'chocolat' | 'cafe-au-lait';
export type Ink = 'night' | 'chocolat'; // ancien réglage du PetitMot (remplacé par InkId)

// Une main par invité (voir design-system/tokens.json, familles « mains » et type.families)
export type HandId = 'cecile' | 'mamie' | 'ecole' | 'soignee' | 'feutre' | 'capitales' | 'pressee';
export type InkId = 'plume' | 'bic' | 'crayon' | 'brune' | 'noire' | 'feutre' | 'rouge';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Comment un invité écrit sa page : sa main, son encre, ses habitudes. */
export interface GuestStyle {
  hand: HandId;
  ink: InkId;
  titleInk?: InkId; // encre du titre (rouge seulement si le titre fait ≥ 48 px)
  underline: 'regle' | 'double' | 'vague' | 'aucun'; // soulignement du titre
  list: 'tiret' | 'point' | 'numero' | 'case' | 'fleche' | 'aucun'; // puces des ingrédients
  steps?: 'numero' | 'lettre' | 'tiret' | 'phrase'; // façon de numéroter les étapes
  layout?: 'classique' | 'titre-centre' | 'colonnes' | 'note-bas';
  slant?: number; // inclinaison des lignes en degrés (−1,5 à 0,5)
  seed: number; // graine : ondulation des mots, papier, taches
  paper?: { age: 0 | 1 | 2 | 3; foxing: number; cockle: number; dogEars?: Corner[] };
}

/** Une note ajoutée à la main dans la page (par l'invité ou par Cécile). */
export interface Annotation {
  text: string;
  at: 'title' | 'meta' | 'note' | `ingredient:${number}` | `step:${number}`;
  place: 'fin-de-ligne' | 'dessus' | 'a-cote' | 'dessous';
  ink?: InkId;
  by?: 'invite' | 'cecile';
  arrow?: 'courbe' | 'droite';
  tilt?: number; // degrés
}

export interface Chapter {
  id: ChapterId;
  title: string; // « Gâteaux & cakes »
  ecrin: EcrinId; // écrin du chapitre
}

export interface Recipe {
  title: string; // ≤ 23 caractères, ex. « Le cake citron de Julie »
  prep: string; // « 15 min »
  cook?: string; // « 45 min »
  rest?: string; // « 1 h »
  servings: string; // « 8 parts »
  ingredients: string[]; // ≤ 8 (page vidéo), ≤ 22 caractères chacun
  steps: string[]; // ≤ 4 (page vidéo), ≤ 5 lignes, ≤ 180 caractères au total
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
  note?: string; // petit mot pour Cécile, ≤ 90 caractères
  signature?: string;
  ink?: Ink;
  style?: GuestStyle; // main, encre, mise en page (src/content/mains.ts)
  annotations?: Annotation[];
}
