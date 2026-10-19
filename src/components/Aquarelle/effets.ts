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
  theiere: {
    vapeur: [[.193, .225, .045], [.31, .64, .115], [.695, .64, .11]],
    repos: 'theiere', scenes: ['service-the', 'bouillir', 'tinte'],
  },
  // La tasse et sa soucoupe se déplacent ensemble, sans découpe des pigments.
  'tasse-2': {
    vapeur: [[.49, .28, .18]], ondes: [.49, .28, .24],
    gerbe: [.49, .27, .18, -.36, .28, .49, .28],
    repos: 'tasse', scenes: ['levitation', 'tinte', 'deborde', 'bouillir'],
  },
  'tasse-coeur': {
    vapeur: [[.36, .14, .18]], ondes: [.36, .15, .24],
    repos: 'tasse-coeur', scenes: ['levitation', 'bat', 'tinte', 'bouillir'],
  },
  gateau: {
    gerbe: [.40, .30, .16, -.30, .72, .40, .26], confettis: [.48, .28, .45],
    repos: 'gateau', scenes: ['gateau-enchante', 'souffle-rallume', 'rebond', 'salut', 'balance'],
  },
  'tarte-pommes': {
    vapeur: [[.38, .22, .24], [.64, .26, .22]], repos: 'tarte', scenes: ['fume', 'tournoie'],
  },
  // La framboise reste peinte sur la crème : c'est tout le cupcake qui joue.
  cupcake: { confettis: [.5, .25, .45], repos: 'cupcake', scenes: ['gateau-enchante', 'rebond', 'salut', 'balance', 'veille'] },
  'cupcake-bougie': {
    flammes: [[.4624, .0946, .03]], confettis: [.5, .3, .5],
    repos: 'cupcake', scenes: ['gateau-enchante', 'allume', 'rebond', 'bougies', 'souffle', 'salut'],
  },
  'gateau-bougies': {
    ...bougies([[.2676, .2228], [.3525, .185], [.4926, .1472], [.6328, .1904], [.7287, .2228]], .023),
    confettis: [.5, .35, .65], repos: 'gateau', scenes: ['gateau-enchante', 'bougies', 'souffle', 'allume'],
  },
  guirlande: { fanions: [.15, .33, .315, .68], repos: 'guirlande', scenes: ['brise', 'fete', 'veille'], confettis: [.5, .32, .35] },
  // Quatre sprites entiers alignés, des miettes discrètes et une repousse, sans lapin.
  carotte: { repos: 'fanes', scenes: ['carotte-grignote'] },
  ble: { vent: 1.25, repos: 'brise', scenes: ['rafale', 'balance'] },
  vanille: { vent: .55, repos: 'brise', scenes: ['rafale', 'salut'] },
  cannelle: { vent: .45, repos: 'brise', scenes: ['rafale', 'dandine'] },
  cookies: { gerbe: [.29, .58, .12, -.32, .86, .25, .55], repos: 'biscuits', scenes: ['casse', 'pepites', 'veille', 'balance'] },
  'sables-etoiles': { gerbe: [.52, .55, .20, -.26, .82, .50, .50], repos: 'etoiles', scenes: ['tournoie', 'salut', 'balance'] },
  citron: { rigide: true, gerbe: [.5, .53, .28, -.42, .88, .5, .35], scenes: ['coupe-citron', 'duo-citron', 'roule'] },
  'citron-2': { rigide: true, gerbe: [.48, .53, .28, -.42, .90, .48, .32], scenes: ['coupe-citron', 'rondelle', 'roule'] },
  pomme: { repos: 'fruits', gerbe: [.5, .52, .26, -.38, .88, .5, .32], scenes: ['saut-pomme', 'duo-citron'] },
  'pomme-2': { repos: 'fruits', scenes: ['saut', 'frisson', 'roule'] },
  orange: { gerbe: [.65, .60, .24, -.38, .92, .35, .5], pied: [.48, .72], repos: 'agrumes', scenes: ['toupie', 'saut', 'frisson'] },
  'orange-2': { vent: .65, repos: 'fruits', scenes: ['saut', 'frisson', 'rafale'] },
  oeufs: { pied: [.5, .78], repos: 'oeufs', scenes: ['dandine', 'frisson', 'saut'] },
  noix: { repos: 'noix', scenes: ['domino', 'frisson', 'saut'] },
  // Les quatre illustrations des vraies recettes restent des aquarelles entières.
  'fondant-chocolat': { repos: 'gateau', scenes: ['salut', 'balance', 'frisson'] },
  'framboises-speculoos': { repos: 'biscuits', scenes: ['balance', 'frisson'] },
  'tarte-myrtilles': { repos: 'tarte', scenes: ['salut', 'balance'] },
  'crepes-banane': { scenes: ['balance', 'salut', 'frisson'] },
};

/** Les actions de la page et les tableaux utilisent la même horloge. */
export const SCENES_PAGE: Record<string, Record<string, string[]>> = {
  'fin-droite': { 'cupcake-bougie': ['gateau-enchante', 'souffle', 'bougies', 'rebond'] },
  'gateaux-gauche': { oeufs: ['toc-casse', 'dandine'], 'tasse-coeur': ['levitation', 'bat', 'tinte'] },
  'julie-droite': { citron: ['coupe-citron', 'duo-citron'], 'citron-2': ['coupe-citron', 'rondelle'] },
  'pierrette-droite': { citron: ['coupe-citron', 'duo-citron'], 'citron-2': ['coupe-citron', 'rondelle'] },
};

/** Les compagnons et leurs bulles françaises Caveat sont gérés par SecretsDuCarnet. */
export const CREATURES: Record<string, string[]> = {};
