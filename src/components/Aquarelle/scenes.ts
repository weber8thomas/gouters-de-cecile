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
  /** Correction verticale du support elliptique : garde la ligne de sol pendant une rotation rigide. */
  appui(nom: string, angle: number): number;
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

// Courbes à vitesse et accélération nulles aux bornes : les objets démarrent et s'arrêtent sans saut.
export const lisse = (x: number) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (10 + x * (-15 + 6 * x));
export const cloche = (s: number, a: number, b: number) => s <= a || s >= b ? 0 : Math.sin(Math.PI * (s - a) / (b - a)) ** 2;
/** Trajet avec poses d'arrêt : C2 jusque sur les raccords et au retour à zéro. */
export function trajet(s: number, cles: readonly (readonly [number, number])[]): number {
  if (s <= cles[0][0]) return cles[0][1];
  for (let i = 1; i < cles.length; i++) {
    const [b, y] = cles[i], [a, x] = cles[i - 1];
    if (s <= b) return x + (y - x) * lisse((s - a) / (b - a));
  }
  return cles[cles.length - 1][1];
}
/** Oscillation après l'arrêt, amortie et raccordée sans impulsion de vitesse. */
const amorti = (s: number, a: number, b: number, force: number) => {
  if (s <= a || s >= b) return 0;
  const t = s - a;
  return force * (1 - Math.exp(-9 * t)) ** 2 * Math.exp(-2.8 * t) * Math.sin(t * 10) * (1 - lisse((s - (b - 0.4)) / 0.4));
};
const duoCitron: Scene = {
  duree: 6,
  jouer({ s, partie, rayon, appui }) {
    const f = partie('fruit'), r = partie('tranche');
    f.tx = trajet(s, [[0, 0], [1.8, 0.02], [2.4, 0.02], [4.5, -0.012], [6, 0]]);
    r.tx = trajet(s, [[0, 0], [0.65, 0], [2.5, -0.014], [3.1, -0.014], [4.8, 0.009], [6, 0]]);
    f.a = f.tx / Math.max(0.12, rayon('fruit')) + amorti(s, 1.8, 3.4, 0.012);
    r.a = r.tx / Math.max(0.12, rayon('tranche')) + amorti(s, 2.5, 4, -0.012);
    f.ty = appui('fruit', f.a); r.ty = appui('tranche', r.a);
  },
};
const balance: Scene = {
  duree: 4.8,
  jouer({ s, corps }) {
    corps.a += trajet(s, [[0, 0], [0.8, -0.015], [2, 0.055], [3.2, -0.03], [4.8, 0]]);
    corps.tx += 0.008 * cloche(s, 0, 4.8) * Math.sin(s * 2.4);
  },
};
const salut: Scene = {
  duree: 4.2,
  jouer({ s, corps }) {
    corps.a += trajet(s, [[0, 0], [1.1, -0.045], [2.1, 0.035], [3, -0.016], [4.2, 0]]);
    corps.a += amorti(s, 3, 4.2, 0.025);
  },
};
const frisson: Scene = { duree: 4.4, jouer({ s, corps }) { corps.tx += 0.012 * Math.sin(s * 2) * cloche(s, 0, 4.4); } };
const bouillir: Scene = {
  duree: 5.2,
  jouer({ s, corps, fx }) {
    const k = cloche(s, 0, 5.2);
    fx.vap = fx.vap.map((_, i) => 1 + k * (1.15 + 0.25 * Math.sin(s * 3.2 + i * 1.7)));
    corps.a += 0.012 * k * Math.sin(s * 4.5);
    corps.tx += 0.003 * k * Math.sin(s * 7);
  },
};
const tinte: Scene = {
  duree: 4.4,
  jouer({ s, corps, fx }) {
    const k = cloche(s, 0, 4.4);
    corps.a += 0.025 * k * Math.sin(s * 5.2);
    fx.vap = fx.vap.map(() => 1 + 0.85 * k); fx.ondes = s;
  },
};
const bougies: Scene = {
  duree: 4.6,
  jouer({ s, fx, h }) {
    const k = cloche(s, 0, 4.6);
    fx.penche = 0.4 * k * Math.sin(s * 2.4 + h);
    fx.fl = fx.fl.map((_, i) => 1 + 0.18 * k * Math.sin(s * 5.1 + i * 1.7));
  },
};
const souffle: Scene = {
  duree: 6.2,
  jouer({ s, fx }) {
    fx.penche = 0.35 * cloche(s, 0, 0.9);
    fx.fl = fx.fl.map((_, k) => 1 - lisse((s - 0.2 - k * 0.13) / 0.38) + lisse((s - 3.3 - k * 0.25) / 0.45));
    fx.fumee = fx.fumee.map((_, k) => 0.85 * cloche(s, 0.3 + k * 0.13, 3.9 + k * 0.25));
  },
};
const allume: Scene = {
  duree: 5.8,
  jouer({ s, fx }) {
    fx.fl = fx.fl.map((_, k) => 1 - lisse((s - 0.1) / 0.35) + lisse((s - 1.3 - k * 0.35) / 0.45));
    fx.fumee = fx.fumee.map((_, k) => 0.6 * cloche(s, 0.2, 2 + k * 0.35));
  },
};
const brise: Scene = { duree: 4.6, jouer({ s, fx }) { fx.fanions = 1 + 1.2 * cloche(s, 0, 4.6); } };
const rafale: Scene = { duree: 4.4, jouer({ s, fx }) { fx.vent = 1 + 1.2 * cloche(s, 0, 4.4); } };
export const SCENES: Record<string, Scene> = {
  'duo-citron': duoCitron, balance, salut, veille: balance, frisson, bouillir, tinte, bougies, souffle, allume, brise, rafale,
  fume: bouillir, deborde: tinte, bat: tinte, 'souffle-rallume': souffle,
  rebond: salut, secoue: balance, casse: salut, pepites: balance, tournoie: balance,
  roule: duoCitron, rondelle: duoCitron, 'saut-pomme': frisson, saut: frisson,
  toupie: frisson, dandine: balance, domino: balance,
  fete: { duree: 4.6, jouer({ s, fx }) { fx.fanions = 1 + 1.1 * cloche(s, 0, 4.6); fx.confettis = s - 0.6; } },
};
export const REPOS: Record<string, (c: Ctx) => void> = {};
