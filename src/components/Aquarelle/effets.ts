// Ce qui vit dans chaque aquarelle (aquarelles vivantes, vivante.ts). Positions en fractions de l'image
// (design-system/baked/aquarelles/<nom>.webp), y vers le bas. Les illustrations de la série harmonisée
// restent entières : vapeur, bougies et quelques gestes rigides doux, sans masque des anciennes images.

export interface Effets {
  /** Sources de vapeur : [x, y, largeur] (y : le haut du liquide). Quatre au plus. */
  vapeur?: [number, number, number][];
  /** Bougies qui vacillent : flammes peintes, [x, y, rayon] (x, y : le cœur de la flamme, la mèche est
   *  1,2 rayon plus bas ; la flamme monte jusqu'à 2,8 rayons au-dessus ; rayon en fraction de la hauteur).
   *  Elles vacillent et se penchent pendant leurs scènes. Cinq au plus. Scènes : « souffle »
   *  (elles s'éteignent une à une, fument, se rallument), « allume » (éteintes d'un souffle, rallumées une à
   *  une, confettis), « souffle-rallume » (une bougie, le gâteau gonfle). */
  flammes?: [number, number, number][];
  /** Fanions qui ondulent : [y de la ficelle aux deux bouts, creux de la ficelle au milieu] (fractions de
   *  l'image ; la ficelle va d'un bord à l'autre). Ils ondulent toujours un peu. Scènes : « brise »,
   *  « fete » (avec des confettis). */
  fanions?: [number, number, number?, number?];
  /** Vent : amplitude (1 = un brin de blé), le pied reste fixe. Scène « rafale ». */
  vent?: number;
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
  /** Le fruit reste rigide : ni rotation du groupe, ni respiration par changement d'échelle. */
  rigide?: boolean;
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
  // Théière et deux tasses : la verseuse se soulève, penche son bec et verse un jet de thé ambré ; les tasses trinquent.
  theiere: {
    vapeur: [[0.193, 0.225, 0.045], [0.31, 0.64, 0.115], [0.695, 0.64, 0.11]],
    repos: 'theiere',
    scenes: ['bouillir', 'tinte'],
  },
  // La tasse sur sa soucoupe : elle se soulève nettement de la soucoupe, penche pour boire / trinquer et fume.
  'tasse-2': {
    vapeur: [[0.49, 0.28, 0.18]],
    ondes: [0.49, 0.28, 0.24],
    gerbe: [0.49, 0.27, 0.18, -0.36, 0.28, 0.49, 0.28],
    repos: 'tasse',
    scenes: ['tinte', 'deborde', 'bouillir'],
  },
  // La grande tasse au cœur et ses sablés : la tasse se soulève et s'incline, le cœur bat fort, les biscuits sautillent.
  'tasse-coeur': {
    vapeur: [[0.36, 0.14, 0.18]],
    ondes: [0.36, 0.15, 0.24],
    repos: 'tasse-coeur',
    scenes: ['bat', 'tinte', 'bouillir'],
  },
  // La part de gâteau et sa bougie : la framboise rebondit, le gâteau gonfle et salue joyeusement.
  gateau: {
    gerbe: [0.40, 0.30, 0.16, -0.30, 0.72, 0.40, 0.26],
    confettis: [0.48, 0.28, 0.45],
    repos: 'gateau',
    scenes: ['souffle-rallume', 'rebond', 'salut', 'balance'],
  },
  // La tarte sort du four en fumant et tourne gaiement.
  'tarte-pommes': {
    vapeur: [[0.38, 0.22, 0.24], [0.64, 0.26, 0.22]],
    repos: 'tarte',
    scenes: ['fume', 'tournoie'],
  },
  // Le cupcake : la framboise saute haut sur la crème et tournoie en l'air.
  cupcake: {
    confettis: [0.5, 0.25, 0.45],
    repos: 'cupcake',
    scenes: ['rebond', 'salut', 'balance', 'veille'],
  },
  // Le cupcake d'anniversaire : sa bougie vacille, s'éteint dans un filet de fumée et se rallume sous les confettis.
  'cupcake-bougie': {
    flammes: [[0.4624, 0.0946, 0.03]],
    confettis: [0.5, 0.3, 0.5],
    repos: 'cupcake',
    scenes: ['allume', 'rebond', 'bougies', 'souffle', 'salut'],
  },
  // Le gâteau d'anniversaire et ses cinq bougies.
  'gateau-bougies': {
    ...bougies([[0.2676, 0.2228], [0.3525, 0.185], [0.4926, 0.1472], [0.6328, 0.1904], [0.7287, 0.2228]], 0.023),
    confettis: [0.5, 0.35, 0.65],
    repos: 'gateau',
  },
  // La guirlande de fanions ondule au vent et lâche ses confettis.
  guirlande: { fanions: [0.15, 0.33, 0.315, 0.68], repos: 'guirlande', scenes: ['brise', 'fete', 'veille'], confettis: [0.5, 0.32, 0.35] },
  // La carotte : un lapin anglais s'approche et la grignote en 5 bouchées jusqu'aux fanes, puis elle repousse !
  carotte: {
    gerbe: [0.50, 0.56, 0.16, -0.36, 0.85, 0.50, 0.52],
    confettis: [0.50, 0.48, 0.32],
    repos: 'fanes',
    scenes: ['secoue', 'grignote'],
  },
  // Le blé ploie au vent ; la vanille et la cannelle se balancent et dansent.
  ble: { vent: 1.25, repos: 'brise', scenes: ['rafale', 'balance'] },
  vanille: { vent: 0.55, repos: 'brise', scenes: ['rafale', 'salut'] },
  cannelle: { vent: 0.45, repos: 'brise', scenes: ['rafale', 'dandine'] },
  // Le cookie de devant se casse en deux (miettes) et les pépites de chocolat sautillent.
  cookies: {
    gerbe: [0.29, 0.58, 0.12, -0.32, 0.86, 0.25, 0.55],
    repos: 'biscuits',
    scenes: ['casse', 'pepites', 'veille', 'balance'],
  },
  // Les sablés étoiles bondissent et tournent sur eux-mêmes comme des toupies.
  'sables-etoiles': {
    gerbe: [0.52, 0.55, 0.20, -0.26, 0.82, 0.50, 0.50],
    repos: 'etoiles',
    scenes: ['tournoie', 'salut', 'balance'],
  },
  // Les citrons : un éclair de lame les tranche en deux dans une gerbe de gouttes dorées, puis les moitiés roulent.
  citron: {
    gerbe: [0.50, 0.53, 0.28, -0.42, 0.88, 0.50, 0.35],
    repos: 'agrumes',
    scenes: ['duo-citron', 'roule'],
  },
  'citron-2': {
    gerbe: [0.48, 0.53, 0.28, -0.42, 0.90, 0.48, 0.32],
    repos: 'agrumes',
    scenes: ['duo-citron', 'rondelle', 'roule'],
  },
  // Les pommes bondissent, se tranchent et roulent.
  pomme: {
    gerbe: [0.50, 0.52, 0.26, -0.38, 0.88, 0.50, 0.32],
    repos: 'fruits',
    scenes: ['saut-pomme', 'duo-citron'],
  },
  'pomme-2': {
    repos: 'fruits',
    scenes: ['saut', 'frisson', 'roule'],
  },
  // L'orange et sa rondelle : la rondelle tourne comme une toupie pendant que l'orange bondit.
  orange: {
    gerbe: [0.65, 0.60, 0.24, -0.38, 0.92, 0.35, 0.50],
    pied: [0.48, 0.72],
    repos: 'agrumes',
    scenes: ['toupie', 'saut', 'frisson'],
  },
  'orange-2': {
    vent: 0.65,
    repos: 'fruits',
    scenes: ['saut', 'frisson', 'rafale'],
  },
  // Les œufs se dandinent et la coquille cassée sautille.
  oeufs: { pied: [0.5, 0.78], repos: 'oeufs', scenes: ['dandine', 'frisson', 'saut'] },
  // Les trois noix jonglent et sautent l'une après l'autre.
  noix: { repos: 'noix', scenes: ['domino', 'frisson', 'saut'] },
};

/** Scènes propres à une page : elles remplacent celles de l'aquarelle sur cette page. */
export const SCENES_PAGE: Record<string, Record<string, string[]>> = {
  // la dernière page : on souffle la bougie du cupcake (un filet de fumée), puis elle se rallume
  'fin-droite': { 'cupcake-bougie': ['souffle', 'bougies', 'rebond'] },
  // gateaux-gauche : dialogue entre l'oeuf qui roule et tape, et la tasse au coeur qui tinte
  'gateaux-gauche': {
    oeufs: ['toc-casse', 'dandine'],
    'tasse-coeur': ['bat', 'tinte'],
  },
  // julie-droite : découpe nette et rotation des deux citrons sans agitation superflue
  'julie-droite': {
    citron: ['duo-citron'],
    'citron-2': ['rondelle'],
  },
};

/** Les Jack Russells animent chaque double page du carnet avec leurs bulles calligraphiées à la plume. */
export const CREATURES: Record<string, string[]> = {
  garde: ['jack-russell'],
  titre: ['jack-russell', 'jack-russell'],
  dedicace: ['jack-russell'],
  sommaire: ['jack-russell', 'jack-russell'],
  gateaux: ['jack-russell', 'jack-russell'],
  lisa: ['jack-russell', 'jack-russell'],
  julie: ['jack-russell', 'jack-russell'],
  biscuits: ['jack-russell', 'jack-russell'],
  rose: ['jack-russell', 'jack-russell'],
  mathis: ['jack-russell', 'jack-russell'],
  bernard: ['jack-russell', 'jack-russell'],
  'cecile-1': ['jack-russell', 'jack-russell'],
  'cecile-2': ['jack-russell', 'jack-russell'],
  fin: ['jack-russell', 'jack-russell'],
};
