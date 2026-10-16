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
  /** Identifiant de la vidéo dans src/content/videos.json (fichiers, affiche, tirage sépia, crédit). */
  id?: string;
  caption: string; // « Julie, depuis Lyon »
  duration?: number; // secondes
  /** @deprecated écrins illustrés retirés (plan v3) ; champs supprimés par le nettoyage. */
  ecrin?: EcrinId;
  variant?: string;
  liquid?: Liquid;
  scene?: string;
}

export interface Guest {
  slug: string;
  firstName: string;
  city: string;
  chapter: ChapterId;
  /** @deprecated personnages illustrés retirés (plan v3). */
  look?: Look;
  video?: Video;
  recipe?: Recipe; // rempli par le contenu (invites.ts)
  note?: string; // petit mot pour Cécile, ≤ 90 caractères
  signature?: string;
  ink?: Ink;
  style?: GuestStyle; // main, encre, mise en page (src/content/mains.ts)
  annotations?: Annotation[];
}

// ---- Recettes reçues (plan v3) -------------------------------------------------------------
// Le texte reçu est gardé tel quel dans src/content/recettes/<slug>.txt ; sa version structurée
// (<slug>.json) suit ce type et alimente la cuisson des pages (scripts/pages/recette.py).
// Balisage dans les textes : ~~a~~>{b} rature + correction, __x__ souligné, ^{x} insertion avec ‸.

/** Main de l'écriture générée (tools/ecriture/styles.py). */
export type MainId = 'mamie' | 'ecole' | 'soignee' | 'ado' | 'papa' | 'pressee' | 'cecile';
/** Encre de l'écriture générée (tools/ecriture/encre.py). */
export type EncreId = 'plume' | 'brune' | 'noire' | 'bic' | 'rouge' | 'crayon' | 'feutre' | 'chocolat';

export interface LigneRecette {
  texte: string;
  /** Croquis en guise de puce pour cette ligne (null = pas de puce même si le groupe en a une). */
  puce?: string | null;
}

export interface GroupeRecette {
  titre?: string;
  /** Croquis en guise de puce pour toutes les lignes (« carotte » pour les 🥕 de Lisa). */
  puce?: string | null;
  lignes?: LigneRecette[];
  paragraphes?: string[];
}

export interface RecetteRecue {
  slug: string;
  /** Chemin du texte reçu, gardé mot pour mot. */
  source: string;
  /** Ce qui a été adapté pour le carnet, et pourquoi. */
  adaptations?: string[];
  style: { main: MainId; encre: EncreId; graine: number };
  /** Identifiant dans src/content/videos.json. */
  video?: string;
  titre: string;
  titreSouligne?: 'trait' | 'double' | 'aucun';
  notesMarge?: { texte: string; pres?: string; main?: MainId; encre?: EncreId }[];
  ingredients: GroupeRecette[];
  etapes: { titre?: string; texte: string }[];
  /** Paragraphes après les étapes (« Laisse le gâteau dans le moule… »). */
  apres?: string[];
  /** Options, glaçage, variantes. */
  extras?: GroupeRecette[];
  /** Le mot de la fin, avec ses croquis (😎 → « lunettes-soleil »). */
  fin?: { texte: string; croquis?: string[] };
  /** Petit(s) dessin(s) de la recette, en marge. */
  croquis?: string[];
  /** Petit mot pour Cécile (pas encore reçu : null). */
  mot?: string | null;
  signature?: string;
}
