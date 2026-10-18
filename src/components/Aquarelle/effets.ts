// Ce qui vit dans chaque aquarelle (aquarelles vivantes, vivante.ts). Positions en fractions de l'image
// (design-system/baked/aquarelles/<nom>.webp), y vers le bas. Les parties mobiles (couvercle, framboise,
// moitiés de cookie…) sont cuites par scripts/bake-parties-aquarelles.py (parties.json) ; les scènes qui les
// font bouger sont dans scenes.ts. Toutes les aquarelles se peignent, respirent et se balancent un peu.

export interface Effets {
  /** Sources de vapeur : [x, y, largeur] (y : le haut du liquide). Quatre au plus. */
  vapeur?: [number, number, number][];
  /** Bougies qui vacillent : flammes peintes, [x, y, rayon] (x, y : le cœur de la flamme, la mèche est
   *  1,2 rayon plus bas ; la flamme monte jusqu'à 2,8 rayons au-dessus ; rayon en fraction de la hauteur).
   *  Elles vacillent toujours, rayonnent, se penchent sous la main. Cinq au plus. Scènes : « souffle »
   *  (elles s'éteignent une à une, fument, se rallument), « allume » (éteintes d'un souffle, rallumées une à
   *  une, confettis), « souffle-rallume » (une bougie, le gâteau gonfle). */
  flammes?: [number, number, number][];
  /** Fanions qui ondulent : [y de la ficelle aux deux bouts, creux de la ficelle au milieu] (fractions de
   *  l'image ; la ficelle va d'un bord à l'autre). Ils ondulent toujours un peu. Scènes : « brise »,
   *  « fete » (avec des confettis). */
  fanions?: [number, number];
  /** Vent : amplitude (1 = un brin de blé), le pied reste fixe. Scène « rafale ». */
  vent?: number;
  /** Reflet qui glisse sur un fruit (0 à 1). */
  reflet?: number;
  /** Gerbe (miettes, gouttes) : [x, y, largeur, élan vertical (négatif : vers le haut), sol (y où elles
   *  retombent), x, y de la couleur à prendre dans l'image]. */
  gerbe?: [number, number, number, number, number, number, number];
  /** Ronds dans un liquide : [x, y, rayon] (rayon en fraction de la largeur). */
  ondes?: [number, number, number];
  /** Confettis d'aquarelle : [x, y, largeur] d'où ils partent. */
  confettis?: [number, number, number];
  /** Pivot du balancement et des sauts de toute l'image (défaut : le milieu du bas). */
  pied?: [number, number];
  /** Scènes jouées tour à tour, toutes les 6 à 15 s et au toucher (scenes.ts, SCENES). */
  scenes?: string[];
  /** Mouvement de repos propre (scenes.ts, REPOS), en plus du balancement. */
  repos?: string;
  /** Où une créature peut se poser sur l'aquarelle. */
  perchoirs?: [number, number][];
}

/**
 * Bougies qui vacillent, à brancher sur n'importe quelle aquarelle : le cœur de chaque flamme peinte
 * [x, y] (fractions de l'image), leur rayon (fraction de la hauteur de l'image). Cinq au plus. Scènes :
 * « bougies » (un courant d'air, elles vacillent), « souffle » (soufflées une à une, un filet de fumée,
 * rallumées), « allume » (éteintes d'un souffle, rallumées une à une ; confettis si l'aquarelle en a).
 */
export const bougies = (centres: [number, number][], rayon: number): Effets => ({
  flammes: centres.slice(0, 5).map(([x, y]) => [x, y, rayon]),
  scenes: ['bougies', 'souffle', 'allume'],
});

/**
 * Fanions qui ondulent, à brancher sur une guirlande peinte : y de la ficelle à ses deux bouts, creux de la
 * ficelle au milieu (fractions de l'image ; la ficelle va d'un bord à l'autre). Scènes : « brise »,
 * « fete » (confettis si l'aquarelle en a).
 */
export const fanions = (y: number, creux: number): Effets => ({ fanions: [y, creux], scenes: ['brise', 'fete'] });

export const EFFETS: Record<string, Effets> = {
  // théière et deux tasses : le couvercle se soulève et claque, le bec crache sa vapeur, la cuillère tinte
  theiere: {
    vapeur: [[0.19, 0.2, 0.07], [0.22, 0.45, 0.16], [0.75, 0.43, 0.16]],
    scenes: ['bouillir'],
    perchoirs: [[0.47, 0.03], [0.73, 0.88], [0.12, 0.42]],
  },
  // la tasse : elle tremble, le café fait des ronds, quelques gouttes sautent
  'tasse-2': {
    vapeur: [[0.4, 0.1, 0.42]],
    ondes: [0.4, 0.21, 0.3],
    gerbe: [0.42, 0.2, 0.2, -0.32, 0.22, 0.4, 0.25],
    scenes: ['deborde'],
    perchoirs: [[0.86, 0.3], [0.1, 0.12]],
  },
  // le cœur bat, les biscuits sautillent
  'tasse-coeur': {
    vapeur: [[0.45, 0.04, 0.5]],
    scenes: ['bat'],
    perchoirs: [[0.45, 0.02], [0.8, 0.7]],
  },
  // la part de gâteau : on souffle la bougie, le gâteau gonfle, la bougie se rallume
  gateau: {
    flammes: [[0.645, 0.055, 0.045]],
    scenes: ['souffle-rallume'],
    perchoirs: [[0.75, 0.3], [0.4, 0.3]],
  },
  // la tarte sort du four
  'tarte-pommes': {
    vapeur: [[0.38, 0.22, 0.24], [0.64, 0.26, 0.22]],
    scenes: ['fume'],
    perchoirs: [[0.5, 0.1], [0.25, 0.3]],
  },
  // la framboise rebondit sur la crème
  cupcake: { scenes: ['rebond'], perchoirs: [[0.5, 0.05], [0.2, 0.3]] },
  // le cupcake d'anniversaire : sa bougie vacille ; on la souffle, elle se rallume ; la framboise rebondit
  'cupcake-bougie': {
    flammes: [[0.7, 0.0765, 0.03]],
    confettis: [0.5, 0.3, 0.5],
    scenes: ['allume', 'rebond', 'bougies', 'souffle'],
    perchoirs: [[0.47, 0.28], [0.2, 0.45]],
  },
  // le gâteau d'anniversaire et ses cinq bougies (piste anniversaire : titre et dédicace ; l'aquarelle
  // arrive à la fusion, design-system/aquarelles/gateau-bougies.png)
  'gateau-bougies': {
    ...bougies([[0.215, 0.175], [0.375, 0.14], [0.567, 0.11], [0.734, 0.15], [0.858, 0.2]], 0.06),
    confettis: [0.5, 0.4, 0.7],
    perchoirs: [[0.3, 0.55], [0.7, 0.56]],
  },
  // la guirlande : les fanions ondulent, la brise les fait claquer (ficelle : scripts/aquarelles_dessins.py)
  guirlande: {
    ...fanions(0.07, 0.12),
    confettis: [0.5, 0.3, 0.8],
    perchoirs: [[0.27, 0.16], [0.71, 0.17]],
  },
  // les fanes frémissent, et se secouent
  carotte: { scenes: ['secoue'], repos: 'fanes', perchoirs: [[0.35, 0.03], [0.55, 0.5]] },
  // le blé ploie au vent ; les plantes à peine, une rafale de temps en temps
  ble: { vent: 1, scenes: ['rafale'] },
  vanille: { vent: 0.3, scenes: ['rafale'], perchoirs: [[0.5, 0.2]] },
  cannelle: { vent: 0.25, scenes: ['rafale'], perchoirs: [[0.3, 0.3], [0.7, 0.75]] },
  // le cookie de devant se casse en deux (miettes) puis se recolle ; les pépites sautillent
  cookies: {
    gerbe: [0.47, 0.6, 0.06, -0.08, 0.9, 0.4, 0.55],
    scenes: ['casse', 'pepites'],
    perchoirs: [[0.6, 0.18], [0.35, 0.5]],
  },
  // les sablés tournent sur eux-mêmes
  'sables-etoiles': { scenes: ['tournoie'], perchoirs: [[0.36, 0.24], [0.7, 0.77]] },
  // un reflet glisse sur les fruits ; ils roulent, sautent, tournent
  citron: { reflet: 1, scenes: ['roule'], perchoirs: [[0.5, 0.05], [0.5, 0.75]] },
  'citron-2': { reflet: 1, scenes: ['roule', 'rondelle'], perchoirs: [[0.55, 0.03], [0.6, 0.8]] },
  pomme: { reflet: 0.8, scenes: ['saut-pomme'], perchoirs: [[0.42, 0.1]] },
  'pomme-2': { reflet: 0.8, scenes: ['saut'], perchoirs: [[0.45, 0.2]] },
  orange: { reflet: 1, pied: [0.48, 0.5], scenes: ['toupie'], perchoirs: [[0.5, 0.5]] },
  'orange-2': { reflet: 1, scenes: ['saut'] },
  // l'œuf se dandine
  oeufs: { pied: [0.5, 0.78], scenes: ['dandine'], perchoirs: [[0.5, 0.15]] },
  // les noix sautent l'une après l'autre
  noix: { scenes: ['domino'], perchoirs: [[0.2, 0.1], [0.85, 0.1]] },
};

/** Scènes propres à une page : elles remplacent celles de l'aquarelle sur cette page. */
export const SCENES_PAGE: Record<string, Record<string, string[]>> = {
  // la dernière page : on souffle la bougie du cupcake (un filet de fumée), puis elle se rallume
  'fin-droite': { 'cupcake-bougie': ['souffle', 'bougies'] },
};

/** Créatures de chaque double page (creatures.ts) : elles traversent les deux pages, se posent, s'envolent.
 *  Une ou deux par double page, jamais sur les pages de titre, de dédicace ni de photos. */
export const CREATURES: Record<string, string[]> = {
  gateaux: ['papillon-paon'],
  lisa: ['coccinelle'],
  julie: ['papillon-bleu'],
  biscuits: ['papillon-vulcain', 'coccinelle'],
  rose: ['papillon-paon'],
  mathis: ['coccinelle'],
  bernard: ['papillon-vulcain'],
  fin: ['papillon-bleu', 'papillon-paon'],
};
