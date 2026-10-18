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

// ---- petits outils --------------------------------------------------------------------------------
const PI2 = Math.PI * 2;
/** 0 avant 0, 1 après 1, doux entre les deux. */
const lisse = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Une bosse douce entre a et b (0 ailleurs, 1 au milieu). */
const cloche = (s: number, a: number, b: number) => (s <= a || s >= b ? 0 : Math.sin((Math.PI * (s - a)) / (b - a)));
/** Arc d'un saut de durée d commencé en a : 0 → 1 → 0 (parabole). */
const arc = (s: number, a: number, d: number) => {
  const x = (s - a) / d;
  return x <= 0 || x >= 1 ? 0 : 4 * x * (1 - x);
};
/** Oscillation amortie qui part de 0 à l'instant a (fréquence f, amortissement k). */
const amorti = (s: number, a: number, f: number, k: number) => (s < a ? 0 : Math.sin(PI2 * f * (s - a)) * Math.exp(-k * (s - a)));
/** Écrasement à l'atterrissage (à l'instant a) : négatif d'abord (écrasé), puis un petit rebond. */
const reception = (s: number, a: number, force: number) => -force * amorti(s, a, 3.2, 6) * (s < a ? 0 : 1);

/** Un saut de hauteur h (fraction de la hauteur de l'image) sur la pose p, de a à a + d, réception comprise. */
function saut(p: PoseP, s: number, a: number, d: number, h: number, ecrase = 0.12) {
  const z = arc(s, a, d);
  p.ty -= h * z;
  // étiré en montant, écrasé en touchant le sol
  const e = s > a && s < a + d ? 0.06 * z * (1 - z) * 4 * (ecrase / 0.12) : reception(s, a + d, ecrase);
  p.sy *= 1 + e;
  p.sx *= 1 - e * 0.6;
}

/** Va et vient en roulant sur la distance D (+ : vers la droite), sans glisser. */
function roule(p: PoseP, s: number, a: number, d: number, D: number, r: number) {
  const x = D * Math.sin(Math.PI * lisse((s - a) / d));
  p.tx += x;
  p.a += x / Math.max(0.02, r);
}

// ---- les scènes -----------------------------------------------------------------------------------
export const SCENES: Record<string, Scene> = {
  // la théière bout : le couvercle se soulève et claque, le bec crache un jet de vapeur, la cuillère tinte
  bouillir: {
    duree: 4.4,
    jouer({ s, corps, partie, fx, h }) {
      const c = partie('couvercle');
      const k = cloche(s, 0.2, 2.2);
      c.ty -= k * (0.012 + 0.028 * Math.abs(Math.sin(PI2 * (4.2 + h) * s)));
      c.a += k * 0.07 * Math.sin(PI2 * 6.5 * s + 1);
      c.tx += k * 0.006 * Math.sin(PI2 * 5.1 * s);
      fx.vap[0] = 1 + 2.4 * cloche(s, 0.6, 4.2);
      partie('cuillere').a += 0.14 * amorti(s, 0.9, 3.5, 2.6) + 0.08 * amorti(s, 1.7, 3.5, 3);
      corps.tx += 0.0025 * Math.sin(PI2 * 11 * s) * k;
    },
  },
  // la tasse tremble, le café fait des ronds, quelques gouttes sautent et retombent, la vapeur monte
  deborde: {
    duree: 3.4,
    jouer({ s, corps, fx }) {
      const k = cloche(s, 0, 1.3);
      corps.tx += 0.006 * Math.sin(PI2 * 9 * s) * k;
      corps.a += 0.012 * Math.sin(PI2 * 7 * s + 0.5) * k;
      fx.ondes = s;
      fx.gerbe = s - 0.35;
      fx.vap[0] = 1 + 1.6 * cloche(s, 0.5, 3.3);
    },
  },
  // le cœur bat (deux fois deux coups), les biscuits sautillent, la vapeur s'élève
  bat: {
    duree: 3.2,
    jouer({ s, partie, fx }) {
      const c = partie('coeur');
      let b = 0;
      for (const t of [0.15, 0.42, 1.05, 1.32]) b += Math.exp(-(((s - t) / 0.07) ** 2)) * (t === 0.42 || t === 1.32 ? 0.7 : 1);
      c.sx *= 1 + 0.09 * b;
      c.sy *= 1 + 0.09 * b;
      saut(partie('biscuits'), s, 1.8, 0.36, 0.035);
      fx.vap[0] = 1 + 1.2 * cloche(s, 0.3, 3.1);
    },
  },
  // on souffle la bougie (fumée), le gâteau gonfle, la bougie vacille et se rallume d'un coup
  'souffle-rallume': {
    duree: 5,
    jouer({ s, corps, partie, fx }) {
      const eteinte = lisse(s / 0.3) * (1 - lisse((s - 2.7) / 0.25));
      fx.fl = fx.fl.map(() => (1 - eteinte) * (1 + 0.5 * cloche(s, 2.7, 3.5)));
      fx.fumee = fx.fumee.map(() => cloche(s, 0.15, 3.0));
      const g = cloche(s, 0.9, 2.1) + 0.3 * amorti(s, 2.1, 2.5, 4);
      corps.sx *= 1 + 0.045 * g;
      corps.sy *= 1 + 0.07 * g;
      partie('bougie').a += 0.09 * amorti(s, 0, 2.2, 2.2) + 0.06 * amorti(s, 2.1, 2.6, 3);
    },
  },
  // un souffle les éteint toutes d'un coup (fumée), puis elles se rallument une à une, s'embrasent, et des
  // confettis s'envolent
  allume: {
    duree: 6.5,
    jouer({ s, corps, fx }) {
      const n = fx.fl.length;
      fx.fl = fx.fl.map((_, k) => {
        const t = 1.4 + k * 0.42;
        return s < 1.2 ? 1 - lisse((s - 0.1) / 0.2) : lisse((s - t) / 0.22) * (1 + 0.6 * cloche(s, t, t + 0.6));
      });
      fx.fumee = fx.fumee.map((_, k) => cloche(s, 0.15, 1.5 + k * 0.42));
      const t1 = 1.4 + n * 0.42 + 0.2;
      fx.confettis = s - t1;
      saut(corps, s, t1 - 0.1, 0.32, 0.025, 0.08);
    },
  },
  // bougies qui vacillent (toute aquarelle à `flammes`, effets.ts : bougies()) : un courant d'air passe,
  // les flammes se couchent d'un côté puis de l'autre, tremblent, baissent et repartent, sans s'éteindre
  bougies: {
    duree: 3.8,
    jouer({ s, fx, h }) {
      const k = cloche(s, 0, 3.8);
      fx.penche = k * (0.9 * Math.sin(PI2 * 0.55 * s + h * 3) + 0.25 * Math.sin(PI2 * 2.3 * s));
      fx.fl = fx.fl.map((_, i) => {
        const tremble = 0.22 * Math.sin(PI2 * (3.1 + i * 0.37) * s + i * 1.7 + h * 5);
        return 1 + k * tremble - 0.3 * cloche(s, 0.8 + i * 0.12, 1.9 + i * 0.12);
      });
    },
  },
  // on souffle : les flammes se couchent et s'éteignent de gauche à droite, la fumée monte, puis elles
  // se rallument une à une
  souffle: {
    duree: 6,
    jouer({ s, fx }) {
      fx.fl = fx.fl.map((_, k) => {
        const t = 0.2 + k * 0.1;
        const t2 = 3 + k * 0.4;
        return (1 - lisse((s - t) / 0.18)) + lisse((s - t2) / 0.22) * (1 + 0.5 * cloche(s, t2, t2 + 0.6));
      });
      fx.fumee = fx.fumee.map((_, k) => cloche(s, 0.25 + k * 0.1, 3.2 + k * 0.1));
    },
  },
  // la tarte fume fort et gonfle un peu, comme sortie du four
  fume: {
    duree: 3.6,
    jouer({ s, corps, fx }) {
      fx.vap = fx.vap.map((_, k) => 1 + 1.4 * cloche(s, 0.1 + k * 0.4, 3.4));
      const g = cloche(s, 0.2, 1.6) + 0.3 * amorti(s, 1.6, 2.5, 4);
      corps.sy *= 1 + 0.05 * g;
      corps.sx *= 1 + 0.02 * g;
    },
  },
  // la framboise saute sur la crème (deux rebonds, un tour sur elle-même), le gâteau s'écrase un peu
  rebond: {
    duree: 2.4,
    jouer({ s, corps, partie }) {
      const f = partie('framboise');
      saut(f, s, 0.05, 0.56, 0.16, 0.16);
      saut(f, s, 0.61, 0.32, 0.05, 0.12);
      f.a += 0.5 * Math.sin(Math.PI * lisse((s - 0.05) / 0.56)) - 0.15 * cloche(s, 0.61, 0.93);
      corps.sy *= 1 + reception(s, 0.61, 0.025) + reception(s, 0.93, 0.012);
    },
  },
  // les fanes de la carotte se secouent, la carotte fait un petit bond
  secoue: {
    duree: 2.8,
    jouer({ s, corps, partie }) {
      const f = partie('fanes');
      f.flex += 0.75 * amorti(s, 0.1, 2.6, 1.6);
      f.a += 0.12 * amorti(s, 0.1, 2.6, 1.6);
      saut(corps, s, 0, 0.42, 0.035, 0.08);
    },
  },
  // le cookie se casse en deux : les moitiés s'écartent, les miettes tombent, puis il se recolle
  casse: {
    duree: 4.2,
    jouer({ s, partie, fx }) {
      const ouvert = lisse((s - 0.25) / 0.14) - lisse((s - 2.3) / 0.45) + 0.12 * amorti(s, 2.75, 3, 5);
      const g = partie('moitie-g');
      const d = partie('moitie-d');
      g.a -= 0.11 * ouvert;
      g.tx -= 0.012 * ouvert;
      d.a += 0.06 * ouvert;
      d.tx += 0.01 * ouvert;
      fx.gerbe = s - 0.28;
      for (const [k, nom] of ['pepite-1', 'pepite-2', 'pepite-3'].entries()) saut(partie(nom), s, 0.3 + k * 0.08, 0.3, 0.025, 0.1);
    },
  },
  // les pépites de chocolat sautillent l'une après l'autre
  pepites: {
    duree: 2.6,
    jouer({ s, partie, h }) {
      ['pepite-1', 'pepite-2', 'pepite-3'].forEach((nom, k) => {
        const p = partie(nom);
        saut(p, s, 0.1 + k * 0.22, 0.42, 0.06 + 0.02 * ((k + Math.floor(h * 3)) % 3), 0.14);
        saut(p, s, 0.55 + k * 0.22, 0.28, 0.02, 0.1);
        p.a += 0.6 * cloche(s, 0.1 + k * 0.22, 0.52 + k * 0.22) * (k % 2 ? -1 : 1);
      });
    },
  },
  // les sablés étoiles tournent sur eux-mêmes, l'un après l'autre, en sautillant
  tournoie: {
    duree: 3.2,
    jouer({ s, partie, h }) {
      const sens = h < 0.5 ? 1 : -1;
      const e1 = partie('etoile-1');
      e1.a += sens * PI2 * lisse(s / 1.5);
      saut(e1, s, 0, 1.5, 0.03, 0.06);
      const e2 = partie('etoile-2');
      e2.a -= sens * PI2 * lisse((s - 0.7) / 1.6);
      saut(e2, s, 0.7, 1.6, 0.03, 0.06);
    },
  },
  // le citron roule un peu et revient ; la moitié se dandine
  roule: {
    duree: 3.4,
    jouer({ s, partie, rayon, h }) {
      roule(partie('citron'), s, 0, 2.6, (h < 0.5 ? 1 : -1) * 0.07, rayon('citron'));
      const m = partie('moitie');
      m.a += 0.07 * amorti(s, 1.2, 1.4, 1.5);
    },
  },
  // la rondelle de citron roule comme une roue
  rondelle: {
    duree: 3,
    jouer({ s, partie, rayon }) {
      roule(partie('rondelle'), s, 0, 2.8, -0.09, rayon('rondelle'));
    },
  },
  // la pomme saute (deux fois), la moitié se dandine
  'saut-pomme': {
    duree: 2.6,
    jouer({ s, partie }) {
      const p = partie('pomme');
      saut(p, s, 0.05, 0.5, 0.08);
      saut(p, s, 0.55, 0.3, 0.025);
      p.a += 0.15 * cloche(s, 0.05, 0.55);
      partie('moitie').a += 0.06 * amorti(s, 0.55, 1.6, 1.8);
    },
  },
  // toute l'image saute
  saut: {
    duree: 1.8,
    jouer({ s, corps }) {
      saut(corps, s, 0.05, 0.5, 0.06);
      saut(corps, s, 0.55, 0.28, 0.015, 0.06);
    },
  },
  // la rondelle d'orange tourne comme une toupie
  toupie: {
    duree: 3,
    jouer({ s, corps, h }) {
      corps.a += (h < 0.5 ? 1 : -1) * PI2 * lisse(s / 2.6);
    },
  },
  // l'œuf se dandine sur sa base
  dandine: {
    duree: 3.2,
    jouer({ s, corps }) {
      corps.a += 0.09 * amorti(s, 0, 1.1, 1.1);
    },
  },
  // les noix sautent l'une après l'autre, comme des dominos
  domino: {
    duree: 2.4,
    jouer({ s, partie }) {
      ['noix-1', 'noix-2', 'noix-3'].forEach((nom, k) => {
        const p = partie(nom);
        saut(p, s, 0.05 + k * 0.25, 0.4, 0.07);
        p.a += (k % 2 ? -0.25 : 0.25) * cloche(s, 0.05 + k * 0.25, 0.45 + k * 0.25);
      });
    },
  },
  // une rafale de vent
  rafale: {
    duree: 3.6,
    jouer({ s, fx }) {
      fx.vent = 1 + 2.4 * cloche(s, 0, 3.6);
    },
  },
  // un coup de brise dans les fanions
  brise: {
    duree: 3.6,
    jouer({ s, fx }) {
      fx.fanions = 1 + 1.8 * cloche(s, 0, 3.6);
    },
  },
  // la fête : les fanions claquent au vent et une volée de confettis s'en échappe
  fete: {
    duree: 4.6,
    jouer({ s, fx }) {
      fx.fanions = 1 + 2.4 * cloche(s, 0, 3.4);
      fx.confettis = s - 0.5;
    },
  },
};

/** Mouvements de repos propres à une aquarelle (en plus du balancement de toutes), au temps t (s). */
export const REPOS: Record<string, (c: Ctx) => void> = {
  // les fanes frémissent dans l'air
  fanes({ s, partie }) {
    const f = partie('fanes');
    f.flex += 0.07 * Math.sin(s * 1.3) + 0.035 * Math.sin(s * 3.1 + 1);
  },
};
