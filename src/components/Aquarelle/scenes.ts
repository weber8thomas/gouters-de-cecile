// Les scènes des aquarelles vivantes : de petits gestes de marionnette, joués toutes les 6 à 15 s et au
// toucher (vivante.ts). Une scène écrit, à l'instant s (secondes depuis son début), des écarts à la pose de
// repos : de toute l'image (corps) et de ses parties mobiles (parties.json), en unités de l'image (la hauteur
// de l'image vaut 1, y vers le bas, angles en radians dans le sens des aiguilles d'une montre), et la force de
// ses effets (vapeur, flammes, gerbe…). Elle commence et finit au repos : rien ne saute à la fin.
// Les noms viennent d'effets.ts (`scenes`, `repos`).

export interface PoseP {
  /** Translation. */
  tx: number;
  ty: number;
  /** Rotation autour du pivot. */
  a: number;
  /** Écrasement / étirement (1 : aucun), dans les axes de l'image. */
  sx: number;
  sy: number;
  /** Ploiement : rotation de plus en plus forte en s'éloignant du pivot (radians par unité). */
  flex: number;
}

export interface Fx {
  /** Force de chaque source de vapeur (1 : au repos ; 3 : un jet). */
  vap: number[];
  /** Intensité de chaque flamme (1 : allumée, 0 : éteinte ; un peu plus : elle s'embrase). */
  fl: number[];
  /** Fumée au-dessus de chaque mèche (0 à 1). */
  fumee: number[];
  /** Âge (s) de la gerbe de miettes ou de gouttes ; négatif : aucune. */
  gerbe: number;
  /** Âge des ronds dans le liquide ; négatif : aucun. */
  ondes: number;
  /** Âge des confettis ; négatif : aucun. */
  confettis: number;
  /** Force du vent (1 : au repos). */
  vent: number;
  /** Force de l'ondulation des fanions (1 : au repos). */
  fanions: number;
  /** Les flammes se couchent toutes ensemble (−1 : à gauche, 1 : à droite ; 0 : au repos). */
  penche: number;
}

export interface Ctx {
  /** Secondes depuis le début de la scène (temps de repos : depuis l'arrivée sur la page). */
  s: number;
  corps: PoseP;
  /** La pose d'une partie (une pose sans effet si l'aquarelle n'a pas cette partie). */
  partie(nom: string): PoseP;
  /** Rayon d'une partie (pour rouler sans glisser). */
  rayon(nom: string): number;
  fx: Fx;
  /** Tirage au sort fait au début de la scène (0 à 1) : jamais deux fois tout à fait la même. */
  h: number;
}

export interface Scene {
  /** Durée (s). */
  duree: number;
  jouer(c: Ctx): void;
}

export const poseNeutre = (): PoseP => ({ tx: 0, ty: 0, a: 0, sx: 1, sy: 1, flex: 0 });

// Les nouvelles illustrations sont des ensembles indivisibles. Aucun masque des anciennes planches,
// aucun saut ni écrasement : des gestes rigides très courts et les éléments atmosphériques seulement.
const cloche = (s: number, a: number, b: number) => s <= a || s >= b ? 0 : Math.sin(Math.PI * (s - a) / (b - a));
const lisse = (x: number) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const veille: Scene = {
  duree: 3.4,
  jouer({ s, corps }) { corps.a += 0.007 * Math.sin(s * 2.2) * cloche(s, 0, 3.4); },
};
const frisson: Scene = {
  duree: 3.8,
  // Le fruit et sa coupe gardent intégralement leurs contours : translation de 0,25 % au plus.
  jouer({ s, corps }) { corps.tx += 0.0025 * Math.sin(s * 2.1) * cloche(s, 0, 3.8); },
};
const bouillir: Scene = {
  duree: 4.4,
  jouer({ s, fx }) { fx.vap = fx.vap.map((_, k) => 1 + 0.65 * cloche(s, 0.2 + k * 0.12, 4.2)); },
};
const bougies: Scene = {
  duree: 3.8,
  jouer({ s, fx, h }) {
    const k = cloche(s, 0, 3.8);
    fx.penche = 0.22 * k * Math.sin(s * 2.4 + h);
    fx.fl = fx.fl.map((_, i) => 1 + 0.1 * k * Math.sin(s * 4.1 + i * 1.7));
  },
};
const souffle: Scene = {
  duree: 5.8,
  jouer({ s, fx }) {
    fx.penche = 0.22 * cloche(s, 0, 0.6);
    fx.fl = fx.fl.map((_, k) => 1 - lisse((s - 0.2 - k * 0.13) / 0.28) + lisse((s - 3.3 - k * 0.2) / 0.35));
    fx.fumee = fx.fumee.map((_, k) => 0.7 * cloche(s, 0.3 + k * 0.13, 3.7 + k * 0.2));
  },
};
const brise: Scene = { duree: 4, jouer({ s, fx }) { fx.fanions = 1 + 0.45 * cloche(s, 0, 4); } };
const rafale: Scene = { duree: 4, jouer({ s, fx }) { fx.vent = 1 + 0.4 * cloche(s, 0, 4); } };
export const SCENES: Record<string, Scene> = {
  veille, frisson, bouillir, bougies, souffle, brise, rafale,
  fume: bouillir, deborde: bouillir, bat: veille,
  allume: bougies, 'souffle-rallume': souffle,
  // Identifiants historiques acceptés par les liens et outils de capture : aucun ancien découpage.
  rebond: veille, secoue: veille, casse: veille, pepites: veille, tournoie: veille,
  roule: frisson, rondelle: frisson, 'saut-pomme': frisson, saut: frisson,
  toupie: frisson, dandine: frisson, domino: frisson,
  fete: { duree: 4.6, jouer({ s, fx }) { fx.fanions = 1 + 0.5 * cloche(s, 0, 4); fx.confettis = s - 0.5; } },
};
export const REPOS: Record<string, (c: Ctx) => void> = {};
