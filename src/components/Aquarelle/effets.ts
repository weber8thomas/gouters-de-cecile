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
  // Théière et deux tasses de la série harmonisée : vapeur légère aux trois ouvertures.
  theiere: {
    vapeur: [[0.193, 0.225, 0.038], [0.31, 0.64, 0.115], [0.695, 0.64, 0.11]],
    scenes: ['bouillir', 'tinte'],
  },
  // La tasse : une vapeur légère au-dessus du liquide.
  'tasse-2': {
    vapeur: [[0.49, 0.28, 0.17]],
    ondes: [0.49, 0.28, 0.24],
    scenes: ['tinte', 'bouillir'],
  },
  // La tasse reste entière et le thé fume doucement.
  'tasse-coeur': {
    vapeur: [[0.36, 0.14, 0.17]],
    ondes: [0.36, 0.15, 0.24],
    scenes: ['tinte', 'bouillir'],
  },
  // La nouvelle part de gâteau a une mèche sans flamme peinte ; le dessin reste entier.
  gateau: {
    scenes: ['balance', 'salut'],
  },
  // la tarte sort du four
  'tarte-pommes': {
    vapeur: [[0.38, 0.22, 0.24], [0.64, 0.26, 0.22]],
    scenes: ['fume'],
  },
  // Le cupcake reste entier, avec un balancement rigide léger.
  cupcake: { scenes: ['salut', 'balance'] },
  // La bougie vacille, puis se rallume après un souffle ; le gâteau ne se déforme pas.
  'cupcake-bougie': {
    flammes: [[0.4624, 0.0946, 0.03]],
    scenes: ['bougies', 'souffle', 'salut', 'allume'],
  },
  // le gâteau d'anniversaire et ses cinq bougies (piste anniversaire : titre et dédicace ; l'aquarelle
  // arrive à la fusion, design-system/aquarelles/gateau-bougies.png)
  'gateau-bougies': {
    ...bougies([[0.2676, 0.2228], [0.3525, 0.185], [0.4926, 0.1472], [0.6328, 0.1904], [0.7287, 0.2228]], 0.023),
  },
  // La nouvelle guirlande et ses nœuds restent intacts.
  guirlande: { fanions: [0.15, 0.33, 0.315, 0.68], scenes: ['brise', 'fete'], confettis: [0.5, 0.32, 0.35] },
  // les fanes frémissent, et se secouent
  carotte: { scenes: ['secoue'], repos: 'fanes' },
  // le blé ploie au vent ; les plantes à peine, une rafale de temps en temps
  ble: { vent: 1, scenes: ['rafale'] },
  vanille: { vent: 0.3, scenes: ['rafale'] },
  cannelle: { vent: 0.25, scenes: ['rafale'] },
  // Les biscuits restent entiers : aucun découpage de la nouvelle peinture.
  cookies: {
    scenes: ['balance', 'salut'],
  },
  // Même geste doux pour les sablés.
  'sables-etoiles': { scenes: ['salut', 'balance'] },
  // Les fruits et leurs coupes gardent leur forme et leur orientation.
  citron: { rigide: true, scenes: ['duo-citron'] },
  'citron-2': { rigide: true, scenes: ['duo-citron'] },
  pomme: { rigide: true, scenes: ['frisson'] },
  'pomme-2': { rigide: true, scenes: ['frisson'] },
  orange: { rigide: true, scenes: ['frisson'] },
  'orange-2': { rigide: true, scenes: ['frisson'] },
  // l'œuf se dandine
  oeufs: { rigide: true, pied: [0.5, 0.78], scenes: ['frisson'] },
  // les noix sautent l'une après l'autre
  noix: { rigide: true, scenes: ['frisson'] },
};

/** Scènes propres à une page : elles remplacent celles de l'aquarelle sur cette page. */
export const SCENES_PAGE: Record<string, Record<string, string[]>> = {
  // la dernière page : on souffle la bougie du cupcake (un filet de fumée), puis elle se rallume
  'fin-droite': { 'cupcake-bougie': ['souffle', 'bougies'] },
};

/** Un Jack Russell par double page, uniquement dans les marges dont le passage est libre. */
export const CREATURES: Record<string, string[]> = {
  gateaux: ['jack-russell'], lisa: ['jack-russell'], julie: ['jack-russell'],
  biscuits: ['jack-russell'], rose: ['jack-russell'], mathis: ['jack-russell'],
  bernard: ['jack-russell'], fin: ['jack-russell'],
};
