// Les scènes des aquarelles vivantes : de vrais gestes de marionnette et de petits contes visuels,
// joués régulièrement et au toucher (vivante.ts). Une scène écrit, à l'instant s (secondes depuis son
// début), des écarts à la pose de repos : de toute l'image (corps) et de ses parties mobiles (parties.json),
// en unités de l'image (la hauteur de l'image vaut 1, y vers le bas, angles en radians dans le sens des
// aiguilles d'une montre), et la force de ses effets (vapeur, flammes, gerbe, coupe, carotte croquée…).
// Elle commence et finit au repos : rien ne saute à la fin.

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
  /** Filet de thé doré versé par la théière dans la tasse (0 à 1). */
  jet: number;
  /** Éclair de lame qui tranche le citron ou la pomme (0 à 1, négatif : aucun). */
  coupe: number;
  /** Part de la carotte déjà croquée de la pointe vers les fanes (0 : intacte, 1 : tout croqué). */
  croque: number;
  /** Âge (s) de la dernière bouchée de carotte (pour faire sauter les éclats orange). */
  morsure: number;
  /** Scintillement doré de la repousse magique de la carotte (0 à 1). */
  repousse: number;
  /** Présence et saut du petit lapin d'aquarelle venu grignoter la carotte (0 à 1). */
  lapin: number;
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
export const lisse = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (10 + x * (-15 + 6 * x)));
export const cloche = (s: number, a: number, b: number) =>
  s <= a || s >= b ? 0 : Math.sin((Math.PI * (s - a)) / (b - a)) ** 2;

/** Trajet avec poses d'arrêt : C2 jusque sur les raccords et au retour à zéro. */
export function trajet(s: number, cles: readonly (readonly [number, number])[]): number {
  if (s <= cles[0][0]) return cles[0][1];
  for (let i = 1; i < cles.length; i++) {
    const [b, y] = cles[i];
    const [a, x] = cles[i - 1];
    if (s <= b) return x + (y - x) * lisse((s - a) / (b - a));
  }
  return cles[cles.length - 1][1];
}

/** Oscillation après l'arrêt, amortie et raccordée sans impulsion de vitesse. */
const amorti = (s: number, a: number, b: number, force: number) => {
  if (s <= a || s >= b) return 0;
  const t = s - a;
  return (
    force *
    (1 - Math.exp(-9 * t)) ** 2 *
    Math.exp(-2.6 * t) *
    Math.sin(t * 10.5) *
    (1 - lisse((s - (b - 0.45)) / 0.45))
  );
};

// ---- Agrumes : coup de lame vif, gouttes de jus et quartiers qui roulent ----------------------------
const duoCitron: Scene = {
  duree: 6,
  jouer({ s, corps, partie, rayon, appui, fx }) {
    const f = partie('fruit'), r = partie('tranche');
    if (s >= 0.06 && s <= 0.44) fx.coupe = (s - 0.06) / 0.38;
    if (s >= 0.28) fx.gerbe = s - 0.28;
    corps.tx += 0.003 * Math.sin(s * 32) * cloche(s, 0, 0.35);
    f.tx = trajet(s, [[0, 0], [1.8, 0.02], [2.4, 0.02], [4.5, -0.012], [6, 0]]);
    r.tx = trajet(s, [[0, 0], [0.65, 0], [2.5, -0.014], [3.1, -0.014], [4.8, 0.009], [6, 0]]);
    f.a = f.tx / Math.max(0.12, rayon('fruit')) + amorti(s, 1.8, 3.4, 0.012);
    r.a = r.tx / Math.max(0.12, rayon('tranche')) + amorti(s, 2.5, 4, -0.012);
    f.ty = appui('fruit', f.a);
    r.ty = appui('tranche', r.a);
  },
};

const roule: Scene = {
  duree: 5.8,
  jouer(ctx) {
    duoCitron.jouer(ctx);
    const { s, corps } = ctx;
    corps.a += 0.045 * cloche(s, 0.2, 5.4) * Math.sin(s * 2.4);
  },
};

const rondelle: Scene = {
  duree: 5.4,
  jouer({ s, corps, partie, rayon, appui, fx }) {
    const r = partie('rondelle');
    if (s >= 0.08 && s <= 0.42) fx.coupe = (s - 0.08) / 0.34;
    if (s >= 0.3) fx.gerbe = s - 0.3;
    corps.a += trajet(s, [
      [0, 0],
      [0.4, -0.02],
      [1.5, -0.055],
      [3.2, 0.03],
      [5.4, 0],
    ]);
    corps.tx += trajet(s, [
      [0, 0],
      [1.5, -0.018],
      [3.2, 0.008],
      [5.4, 0],
    ]);
    r.tx = trajet(s, [
      [0, 0],
      [0.3, 0],
      [1.7, 0.082],
      [2.5, 0.076],
      [4.1, -0.022],
      [5.4, 0],
    ]);
    r.a = r.tx / Math.max(0.125, rayon('rondelle')) + amorti(s, 1.7, 3.6, 0.07);
    r.ty = appui('rondelle', r.a) - 0.018 * cloche(s, 0.25, 1.15);
  },
};

// ---- L'heure du thé : la théière verse dans la tasse, les tasses tintent et fument ------------------
const bouillir: Scene = {
  duree: 6.2,
  jouer({ s, corps, partie, fx }) {
    const k = cloche(s, 0, 6.2);
    fx.vap = fx.vap.map((_, i) => 1 + k * (1.85 + 0.45 * Math.sin(s * 4.2 + i * 1.7)));
    const v = partie('verseuse');
    const tg = partie('tasse-g');
    const td = partie('tasse-d');
    // Frémissement d'ébullition puis inclinaison de la théière pour servir le thé à droite
    const fremit = cloche(s, 0, 1.25);
    v.tx =
      0.006 * fremit * Math.sin(s * 32) +
      trajet(s, [
        [0, 0],
        [0.85, -0.008],
        [1.65, 0.032],
        [3.85, 0.028],
        [5.1, -0.005],
        [6.2, 0],
      ]);
    v.ty = trajet(s, [
      [0, 0],
      [0.85, 0.01],
      [1.65, -0.072],
      [3.85, -0.062],
      [5.0, 0.007],
      [6.2, 0],
    ]);
    v.a =
      0.022 * fremit * Math.sin(s * 26) +
      trajet(s, [
        [0, 0],
        [0.85, -0.06],
        [1.7, 0.34],
        [3.8, 0.31],
        [5.0, -0.035],
        [6.2, 0],
      ]);
    // Filet de thé ambré du bec vers la tasse de droite
    fx.jet = cloche(s, 1.35, 4.25);
    if (s >= 1.45) {
      fx.ondes = s - 1.45;
      fx.gerbe = s - 1.55;
    }
    const remplit = cloche(s, 1.45, 4.45);
    td.ty = 0.009 * remplit * Math.sin(s * 16);
    td.a = 0.055 * remplit * Math.sin(s * 10) + amorti(s, 4.0, 5.6, 0.04);
    tg.a = -0.045 * cloche(s, 1.9, 4.8) * Math.sin(s * 7.5);
    tg.ty = -0.012 * cloche(s, 2.1, 3.6);
    // Si l'aquarelle n'a pas de partie 'verseuse' (ex. tasse seule), le corps entier frémit
    corps.a += 0.022 * k * Math.sin(s * 5.2);
    corps.tx += 0.004 * k * Math.sin(s * 8.5);
  },
};

const fume: Scene = {
  duree: 5.2,
  jouer({ s, corps, partie, fx }) {
    const k = cloche(s, 0, 5.2);
    fx.vap = fx.vap.map((_, i) => 1 + k * (2.0 + 0.45 * Math.sin(s * 3.8 + i * 1.6)));
    corps.sy = 1 + 0.026 * k * Math.sin(s * 3.6);
    corps.sx = 1 - 0.018 * k * Math.sin(s * 3.6);
    corps.a += 0.038 * k * Math.sin(s * 2.8);
    const v = partie('verseuse');
    v.a += 0.045 * k * Math.sin(s * 8.5);
    v.ty -= 0.015 * cloche(s, 0.8, 4.2);
    const t = partie('tasse');
    t.a += 0.05 * k * Math.sin(s * 4.2);
    t.ty -= 0.02 * cloche(s, 0.8, 4.2);
    if (s >= 0.5) fx.ondes = s - 0.5;
  },
};

const tinte: Scene = {
  duree: 5.0,
  jouer({ s, corps, partie, fx }) {
    const k = cloche(s, 0, 5.0);
    fx.vap = fx.vap.map((_, i) => 1 + (1.35 + 0.25 * Math.sin(s * 4 + i)) * k);
    if (s >= 0.3) fx.ondes = s - 0.3;
    if (s >= 0.95) fx.gerbe = s - 0.95;
    // Sur tasse-2 et tasse-coeur, la tasse se soulève de sa soucoupe et tinte joyeusement
    const t = partie('tasse');
    t.ty = trajet(s, [
      [0, 0],
      [0.4, 0.01],
      [1.15, -0.078],
      [2.35, -0.068],
      [3.25, 0.008],
      [3.75, -0.022],
      [4.3, 0],
      [5.0, 0],
    ]);
    t.tx = trajet(s, [
      [0, 0],
      [1.15, 0.018],
      [2.35, -0.016],
      [3.25, 0],
      [5.0, 0],
    ]);
    t.a =
      trajet(s, [
        [0, 0],
        [0.45, -0.05],
        [1.2, 0.22],
        [2.25, -0.18],
        [3.25, 0.05],
        [4.1, 0],
        [5.0, 0],
      ]) + amorti(s, 3.2, 4.8, 0.065);
    // Sur la théière, les deux tasses trinquent ensemble
    const tg = partie('tasse-g');
    const td = partie('tasse-d');
    tg.tx = trajet(s, [[0, 0], [1.1, 0.025], [2.2, 0], [5.0, 0]]);
    tg.ty = -0.035 * cloche(s, 0.4, 2.8);
    tg.a = 0.16 * cloche(s, 0.4, 2.8) + amorti(s, 1.3, 3.5, -0.06);
    td.tx = trajet(s, [[0, 0], [1.1, -0.025], [2.2, 0], [5.0, 0]]);
    td.ty = -0.035 * cloche(s, 0.4, 2.8);
    td.a = -0.16 * cloche(s, 0.4, 2.8) + amorti(s, 1.3, 3.5, 0.06);
    corps.a += 0.055 * k * Math.sin(s * 5.4);
    corps.ty += -0.015 * cloche(s, 0.4, 2.6);
  },
};

const deborde: Scene = {
  duree: 5.2,
  jouer({ s, corps, partie, fx }) {
    const k = cloche(s, 0, 5.2);
    fx.vap = fx.vap.map(() => 1 + 1.65 * k);
    if (s >= 0.2) fx.ondes = s - 0.2;
    if (s >= 0.5) fx.gerbe = s - 0.5;
    corps.a += trajet(s, [
      [0, 0],
      [0.65, -0.095],
      [1.55, 0.125],
      [2.5, -0.085],
      [3.5, 0.045],
      [5.2, 0],
    ]);
    corps.ty += -0.022 * cloche(s, 0.3, 3.8) * Math.abs(Math.sin(s * 4.2));
    const t = partie('tasse');
    t.a = 0.14 * cloche(s, 0, 4.6) * Math.sin(s * 5.8);
    t.ty = -0.042 * cloche(s, 0.35, 3.6);
    const b = partie('biscuits');
    b.ty = -0.03 * cloche(s, 0.6, 3.8) * Math.abs(Math.sin(s * 5.5));
    b.a = -0.1 * cloche(s, 0.6, 3.8) * Math.sin(s * 5.5);
  },
};

const bat: Scene = {
  duree: 5.4,
  jouer({ s, corps, partie, fx }) {
    const k = cloche(s, 0, 5.4);
    fx.vap = fx.vap.map(() => 1 + 1.25 * k);
    if (s >= 0.35) fx.ondes = s - 0.35;
    if (s >= 0.75) fx.gerbe = s - 0.75;
    // Le cœur floral bat (« boum-boum ») et s'élève légèrement au-dessus de la tasse
    const c = partie('coeur');
    const battement =
      Math.max(0, Math.sin(s * 7.2)) ** 3 + 0.65 * Math.max(0, Math.sin(s * 7.2 - 1.15)) ** 3;
    const force = battement * cloche(s, 0.15, 5.1);
    c.sx = 1 + 0.15 * force;
    c.sy = 1 + 0.15 * force;
    c.ty = -0.055 * cloche(s, 0.25, 4.9) - 0.018 * force;
    c.a = 0.09 * Math.sin(s * 3.4) * k;
    const t = partie('tasse');
    t.a = 0.065 * Math.sin(s * 2.6) * k;
    t.ty = -0.018 * cloche(s, 0.4, 4.6);
    const b = partie('biscuits');
    b.ty = -0.036 * Math.abs(Math.sin(s * 4.8)) * cloche(s, 0.4, 4.6);
    b.a = -0.11 * Math.sin(s * 4.8) * cloche(s, 0.4, 4.6);
    corps.a += 0.03 * Math.sin(s * 2.6) * k;
  },
};

// ---- Le lapin et la carotte : 5 bouchées croustillantes jusqu'aux fanes, puis repousse magique ------
const grignote: Scene = {
  duree: 7.2,
  jouer({ s, corps, partie, fx }) {
    const f = partie('fanes');
    // Le petit lapin d'aquarelle bondit près de la carotte, grignote 5 fois, puis repart ravi
    fx.lapin = lisse(s / 0.7) * (1 - lisse((s - 5.05) / 0.85));
    const bouches = [0.85, 1.58, 2.31, 3.04, 3.77] as const;
    let croque = 0;
    let derniereMorsure = -1;
    for (const tb of bouches) {
      croque += 0.2 * lisse((s - tb) / 0.18);
      if (s >= tb && s <= tb + 0.65) {
        derniereMorsure = s - tb;
        const secousse = cloche(s, tb, tb + 0.34);
        corps.tx += 0.018 * Math.sin((s - tb) * 38) * secousse;
        corps.ty += -0.012 * secousse;
        corps.a += 0.075 * Math.sin((s - tb) * 28) * secousse;
        f.a += 0.24 * Math.sin((s - tb) * 26) * cloche(s, tb, tb + 0.46);
        f.flex += 0.38 * Math.sin((s - tb) * 22) * cloche(s, tb, tb + 0.46);
      }
    }
    if (s >= 0.85 && s <= 4.6) fx.gerbe = (s - 0.85) % 0.73;
    // À partir de 4,95 s, la carotte repousse dans un scintillement doré
    const repousse = lisse((s - 4.95) / 1.25);
    fx.croque = Math.max(0, Math.min(1, croque * (1 - repousse)));
    fx.morsure = derniereMorsure;
    fx.repousse = cloche(s, 4.8, 6.65);
    // Frémissement étonné des fanes quand il ne reste qu'elles, puis petit rebond joyeux à la repousse
    f.a += 0.09 * Math.sin(s * 16) * cloche(s, 3.9, 5.1);
    f.ty += -0.025 * cloche(s, 5.1, 6.4);
    const pop = cloche(s, 5.5, 6.7);
    corps.sx = 1 + 0.065 * pop * Math.sin((s - 5.5) * 8);
    corps.sy = 1 - 0.055 * pop * Math.sin((s - 5.5) * 8);
  },
};

const secoue: Scene = {
  duree: 7.2,
  jouer(ctx) {
    grignote.jouer(ctx);
  },
};

// ---- Biscuits & petits fours : cookies qui se cassent, pépites sauteuses, étoiles qui dansent -------
const casse: Scene = {
  duree: 5.6,
  jouer({ s, corps, partie, fx }) {
    const mg = partie('moitie-g');
    const md = partie('moitie-d');
    if (s >= 0.48) fx.gerbe = s - 0.48;
    // Tremblement d'amorce avant la cassure
    corps.tx += 0.007 * Math.sin(s * 36) * cloche(s, 0, 0.45);
    mg.tx = trajet(s, [
      [0, 0],
      [0.42, 0.006],
      [1.15, -0.058],
      [2.85, -0.05],
      [4.35, 0.006],
      [5.6, 0],
    ]);
    mg.ty = trajet(s, [
      [0, 0],
      [1.15, -0.028],
      [2.85, -0.02],
      [4.35, 0],
      [5.6, 0],
    ]);
    mg.a =
      trajet(s, [
        [0, 0],
        [0.42, 0.035],
        [1.15, -0.25],
        [2.85, -0.21],
        [4.35, 0.035],
        [5.6, 0],
      ]) + amorti(s, 4.2, 5.5, -0.045);
    md.tx = trajet(s, [
      [0, 0],
      [0.42, -0.006],
      [1.15, 0.062],
      [2.85, 0.052],
      [4.35, -0.006],
      [5.6, 0],
    ]);
    md.ty = trajet(s, [
      [0, 0],
      [1.15, -0.024],
      [2.85, -0.018],
      [4.35, 0],
      [5.6, 0],
    ]);
    md.a =
      trajet(s, [
        [0, 0],
        [0.42, -0.035],
        [1.15, 0.27],
        [2.85, 0.22],
        [4.35, -0.035],
        [5.6, 0],
      ]) + amorti(s, 4.2, 5.5, 0.045);
    // Les pépites de chocolat sautent dans l'entrebâillement
    (['pepite-1', 'pepite-2', 'pepite-3'] as const).forEach((nom, i) => {
      const p = partie(nom);
      const c = cloche(s, 0.45 + i * 0.14, 3.9 + i * 0.15);
      p.ty = -0.072 * c * Math.abs(Math.sin((s - 0.45) * 3.2 + i * 0.7));
      p.tx = (i - 1) * 0.024 * c;
      p.a = (i % 2 === 0 ? 1 : -1) * 0.48 * c;
    });
  },
};

const pepites: Scene = {
  duree: 5.0,
  jouer({ s, corps, partie, fx }) {
    if (s >= 0.35) fx.gerbe = s - 0.35;
    const mg = partie('moitie-g');
    const md = partie('moitie-d');
    const k = cloche(s, 0, 5.0);
    mg.a = -0.11 * cloche(s, 0.2, 4.4) * Math.sin(s * 3.2);
    mg.tx = -0.025 * cloche(s, 0.3, 4.2);
    md.a = 0.11 * cloche(s, 0.2, 4.4) * Math.sin(s * 3.2);
    md.tx = 0.025 * cloche(s, 0.3, 4.2);
    (['pepite-1', 'pepite-2', 'pepite-3'] as const).forEach((nom, i) => {
      const p = partie(nom);
      const t0 = 0.25 + i * 0.38;
      const c = cloche(s, t0, t0 + 2.8);
      p.ty = -0.088 * c * Math.abs(Math.sin((s - t0) * 3.4));
      p.tx = (i - 1) * 0.022 * c;
      p.a = (i === 1 ? -0.58 : 0.58) * c;
    });
    corps.a += 0.035 * k * Math.sin(s * 4);
  },
};

const tournoie: Scene = {
  duree: 5.4,
  jouer({ s, corps, partie, fx }) {
    if (s >= 0.45) fx.gerbe = s - 0.45;
    const e1 = partie('etoile-1');
    const e2 = partie('etoile-2');
    // Les deux sablés étoiles se soulèvent et tournoient en sens inverse
    e1.tx = trajet(s, [[0, 0], [1.5, -0.048], [3.5, -0.032], [5.4, 0]]);
    e1.ty = trajet(s, [[0, 0], [1.3, -0.052], [3.4, -0.028], [5.4, 0]]);
    e1.a =
      trajet(s, [
        [0, 0],
        [0.45, 0.14],
        [1.85, -0.95],
        [3.65, 0.38],
        [4.7, -0.06],
        [5.4, 0],
      ]) + amorti(s, 4.4, 5.4, 0.05);
    e2.tx = trajet(s, [[0, 0], [1.6, 0.052], [3.6, 0.036], [5.4, 0]]);
    e2.ty = trajet(s, [[0, 0], [1.5, -0.062], [3.6, -0.032], [5.4, 0]]);
    e2.a =
      trajet(s, [
        [0, 0],
        [0.5, -0.14],
        [2.0, 1.08],
        [3.8, -0.42],
        [4.8, 0.06],
        [5.4, 0],
      ]) + amorti(s, 4.5, 5.4, -0.05);
    corps.a += 0.04 * cloche(s, 0, 5.4) * Math.sin(s * 2.8);
  },
};

const toupie: Scene = {
  duree: 4.8,
  jouer({ s, corps, fx }) {
    if (s >= 0.45) fx.gerbe = s - 0.45;
    corps.ty += trajet(s, [
      [0, 0],
      [0.35, 0.015],
      [1.05, -0.068],
      [1.85, 0.008],
      [2.5, -0.036],
      [3.2, 0.004],
      [3.9, 0],
      [4.8, 0],
    ]);
    corps.a +=
      trajet(s, [
        [0, 0],
        [0.35, -0.08],
        [1.15, 0.28],
        [2.2, -0.22],
        [3.1, 0.1],
        [4.0, -0.02],
        [4.8, 0],
      ]) + amorti(s, 3.6, 4.8, 0.04);
    const k = cloche(s, 0, 4.2);
    corps.sx = 1 + 0.065 * k * Math.sin(s * 7.5);
    corps.sy = 1 - 0.055 * k * Math.sin(s * 7.5);
  },
};

// ---- Gâteaux, tartes et cupcakes : framboise qui rebondit, bougies soufflées et rallumées ------------
const rebond: Scene = {
  duree: 5.0,
  jouer({ s, corps, partie, fx }) {
    if (s >= 0.4) fx.gerbe = s - 0.4;
    // Le cupcake prend son élan et fait sauter sa framboise bien haut
    corps.ty += trajet(s, [
      [0, 0],
      [0.35, 0.016],
      [0.95, -0.052],
      [1.55, 0.008],
      [2.1, -0.022],
      [2.7, 0],
      [5.0, 0],
    ]);
    corps.sy = 1 - 0.075 * cloche(s, 0, 0.48) + 0.06 * cloche(s, 0.48, 1.15);
    corps.sx = 1 + 0.065 * cloche(s, 0, 0.48) - 0.045 * cloche(s, 0.48, 1.15);
    corps.a += 0.05 * cloche(s, 0.3, 4.2) * Math.sin(s * 4.5);
    const fr = partie('framboise');
    fr.ty = trajet(s, [
      [0, 0],
      [0.32, 0.01],
      [1.05, -0.145],
      [1.8, 0.006],
      [2.35, -0.062],
      [2.9, 0.004],
      [3.35, -0.02],
      [3.85, 0],
      [5.0, 0],
    ]);
    fr.tx = trajet(s, [[0, 0], [1.05, 0.018], [2.35, -0.012], [3.85, 0], [5.0, 0]]);
    fr.a =
      trajet(s, [
        [0, 0],
        [1.05, 0.42],
        [1.8, -0.14],
        [2.35, -0.28],
        [2.9, 0.08],
        [3.85, 0],
        [5.0, 0],
      ]) + amorti(s, 3.6, 4.9, 0.06);
  },
};

const bougies: Scene = {
  duree: 4.8,
  jouer({ s, corps, partie, fx, h }) {
    const k = cloche(s, 0, 4.8);
    fx.penche = 0.55 * k * Math.sin(s * 2.6 + h);
    fx.fl = fx.fl.map((_, i) => 1 + 0.28 * k * Math.sin(s * 5.8 + i * 1.7));
    const b = partie('bougie');
    b.a = 0.075 * k * Math.sin(s * 3.4);
    const fr = partie('framboise');
    fr.ty = -0.032 * cloche(s, 0.6, 4.0) * Math.abs(Math.sin(s * 4.2));
    fr.a = 0.14 * k * Math.sin(s * 4.2);
    corps.a += 0.025 * k * Math.sin(s * 2.4);
  },
};

const souffle: Scene = {
  duree: 6.2,
  jouer({ s, corps, partie, fx }) {
    fx.penche = 0.68 * cloche(s, 0, 0.95);
    fx.fl = fx.fl.map(
      (_, k) => 1 - lisse((s - 0.18 - k * 0.12) / 0.35) + lisse((s - 3.25 - k * 0.22) / 0.42),
    );
    fx.fumee = fx.fumee.map((_, k) => 0.95 * cloche(s, 0.28 + k * 0.12, 3.95 + k * 0.22));
    // Au rallumage des bougies, le gâteau sursaute de joie avec des confettis
    if (s >= 3.25) {
      fx.confettis = s - 3.25;
      fx.gerbe = s - 3.35;
    }
    const b = partie('bougie');
    b.a =
      trajet(s, [
        [0, 0],
        [0.45, 0.12],
        [1.2, -0.04],
        [3.2, 0],
        [3.65, -0.09],
        [4.3, 0.04],
        [6.2, 0],
      ]);
    const fr = partie('framboise');
    fr.ty = -0.075 * cloche(s, 3.2, 4.8) * Math.abs(Math.sin((s - 3.2) * 4));
    fr.a = 0.26 * cloche(s, 3.2, 4.8) * Math.sin((s - 3.2) * 5);
    corps.ty += -0.022 * cloche(s, 3.2, 4.4);
    corps.a += 0.03 * cloche(s, 0, 1.2) - 0.025 * cloche(s, 3.2, 4.6);
  },
};

const allume: Scene = {
  duree: 5.8,
  jouer({ s, corps, partie, fx }) {
    fx.fl = fx.fl.map(
      (_, k) =>
        1 -
        lisse((s - 0.1) / 0.32) +
        1.25 * lisse((s - 1.2 - k * 0.3) / 0.4) -
        0.25 * lisse((s - 2.4 - k * 0.3) / 0.6),
    );
    fx.fumee = fx.fumee.map((_, k) => 0.75 * cloche(s, 0.18, 1.9 + k * 0.3));
    if (s >= 1.25) fx.confettis = s - 1.25;
    const b = partie('bougie');
    b.a = 0.08 * cloche(s, 1.0, 4.8) * Math.sin(s * 4.2);
    const fr = partie('framboise');
    fr.ty = -0.055 * cloche(s, 1.2, 4.2) * Math.abs(Math.sin(s * 4.5));
    corps.ty += -0.018 * cloche(s, 1.2, 2.8);
  },
};

// ---- Fruits, œufs et noix : pomme tranchée qui bondit, coquille qui dandine, domino de noix ---------
const sautPomme: Scene = {
  duree: 5.4,
  jouer({ s, corps, partie, appui, fx }) {
    const p = partie('pomme');
    const m = partie('moitie');
    if (s >= 0.08 && s <= 0.42) fx.coupe = (s - 0.08) / 0.34;
    if (s >= 0.3) fx.gerbe = s - 0.3;
    p.tx = trajet(s, [
      [0, 0],
      [0.35, 0.005],
      [1.35, -0.042],
      [3.1, -0.036],
      [4.5, 0.006],
      [5.4, 0],
    ]);
    p.ty = trajet(s, [
      [0, 0],
      [0.32, 0.012],
      [0.95, -0.065],
      [1.65, 0],
      [2.25, -0.025],
      [2.85, 0],
      [5.4, 0],
    ]);
    p.a =
      trajet(s, [
        [0, 0],
        [1.35, -0.18],
        [3.1, -0.14],
        [4.5, 0.03],
        [5.4, 0],
      ]) + amorti(s, 1.65, 3.2, -0.045);
    m.tx = trajet(s, [
      [0, 0],
      [0.35, -0.005],
      [1.5, 0.058],
      [3.2, 0.048],
      [4.6, -0.008],
      [5.4, 0],
    ]);
    m.a =
      trajet(s, [
        [0, 0],
        [0.35, -0.04],
        [1.5, 0.32],
        [2.4, 0.16],
        [3.2, 0.26],
        [4.6, -0.04],
        [5.4, 0],
      ]) + amorti(s, 2.0, 4.2, 0.065);
    m.ty = appui('moitie', m.a) - 0.035 * cloche(s, 0.32, 1.35);
    corps.a += 0.025 * cloche(s, 0, 5.4) * Math.sin(s * 3.2);
  },
};

const saut: Scene = {
  duree: 4.6,
  jouer({ s, corps, fx }) {
    if (s >= 0.38) fx.gerbe = s - 0.38;
    corps.ty += trajet(s, [
      [0, 0],
      [0.32, 0.016],
      [0.92, -0.072],
      [1.55, 0.01],
      [2.15, -0.038],
      [2.75, 0.004],
      [3.4, 0],
      [4.6, 0],
    ]);
    corps.a +=
      trajet(s, [
        [0, 0],
        [0.32, -0.06],
        [0.95, 0.18],
        [1.6, -0.12],
        [2.2, 0.08],
        [3.1, 0],
        [4.6, 0],
      ]) + amorti(s, 2.75, 4.3, 0.045);
    corps.sy = 1 - 0.08 * cloche(s, 0, 0.42) + 0.065 * cloche(s, 0.42, 1.05);
    corps.sx = 1 + 0.07 * cloche(s, 0, 0.42) - 0.05 * cloche(s, 0.42, 1.05);
  },
};

const tocCasse: Scene = {
  duree: 6.0,
  jouer({ s, corps, partie, appui, fx }) {
    const c = partie('coquille');
    // L'œuf roule vers la gauche, toque contre le bord/tasse (« toc-toc ! »), puis se fissure
    c.tx = trajet(s, [
      [0, 0],
      [0.35, -0.015],
      [0.9, -0.075],
      [1.05, -0.068],
      [1.22, -0.082],
      [1.4, -0.065],
      [2.5, -0.055],
      [4.2, -0.012],
      [6.0, 0],
    ]);
    c.a =
      trajet(s, [
        [0, 0],
        [0.35, -0.1],
        [0.9, -0.42],
        [1.05, -0.32],
        [1.22, -0.48],
        [1.4, 0.36],
        [2.0, -0.2],
        [2.8, 0.16],
        [3.6, -0.08],
        [4.8, 0.03],
        [6.0, 0],
      ]) + amorti(s, 3.8, 5.8, 0.05);
    if (s >= 1.25) fx.gerbe = s - 1.25;
    c.ty = appui('coquille', c.a) - 0.028 * cloche(s, 1.2, 2.2);
    corps.a += 0.04 * cloche(s, 0.9, 1.6) * Math.sin(s * 18);
    corps.tx += 0.008 * cloche(s, 0.9, 1.6) * Math.sin(s * 18);
  },
};

const dandine: Scene = {
  duree: 5.2,
  jouer({ s, corps, partie, appui, fx }) {
    const c = partie('coquille');
    if (s >= 0.5) fx.gerbe = s - 0.5;
    c.a =
      trajet(s, [
        [0, 0],
        [0.55, -0.24],
        [1.25, 0.28],
        [1.95, -0.25],
        [2.65, 0.22],
        [3.4, -0.14],
        [4.2, 0.05],
        [5.2, 0],
      ]) + amorti(s, 3.8, 5.1, 0.05);
    c.tx = 0.028 * Math.sin(s * 2.8) * cloche(s, 0.15, 4.6);
    c.ty = appui('coquille', c.a) - 0.028 * Math.abs(Math.sin(s * 4.5)) * cloche(s, 0.25, 4.2);
    corps.a += 0.048 * cloche(s, 0, 5.2) * Math.sin(s * 3.4);
    corps.tx += 0.012 * cloche(s, 0, 5.2) * Math.sin(s * 3.4);
  },
};

const domino: Scene = {
  duree: 5.6,
  jouer({ s, corps, partie, rayon, appui, fx }) {
    const n1 = partie('noix-1');
    const n2 = partie('noix-2');
    const n3 = partie('noix-3');
    if (s >= 0.65) fx.gerbe = s - 0.65;
    // La noix de gauche roule et toque celle du milieu, qui fait sauter celle de droite
    n1.tx = trajet(s, [
      [0, 0],
      [0.65, 0.036],
      [1.4, -0.028],
      [3.2, -0.022],
      [4.6, 0],
      [5.6, 0],
    ]);
    n1.a = n1.tx / Math.max(0.11, rayon('noix-1')) + amorti(s, 1.4, 3.2, -0.06);
    n1.ty = appui('noix-1', n1.a) - 0.02 * cloche(s, 0.2, 0.85);

    n2.tx = trajet(s, [
      [0, 0],
      [0.55, 0],
      [1.15, 0.038],
      [2.1, -0.025],
      [3.6, 0.012],
      [4.8, 0],
      [5.6, 0],
    ]);
    n2.a = n2.tx / Math.max(0.11, rayon('noix-2')) + amorti(s, 2.1, 4.2, 0.065);
    n2.ty = appui('noix-2', n2.a) - 0.028 * cloche(s, 0.6, 1.45);

    n3.tx = trajet(s, [
      [0, 0],
      [1.0, 0],
      [1.85, 0.052],
      [3.1, 0.042],
      [4.5, -0.01],
      [5.6, 0],
    ]);
    n3.a = n3.tx / Math.max(0.11, rayon('noix-3')) + amorti(s, 1.85, 4.0, 0.075);
    n3.ty = appui('noix-3', n3.a) - 0.032 * cloche(s, 1.05, 1.95);
    corps.a += 0.02 * cloche(s, 0, 5.6) * Math.sin(s * 3.0);
  },
};

// ---- Botanique, guirlande et gestes d'ensemble ------------------------------------------------------
const balance: Scene = {
  duree: 4.8,
  jouer({ s, corps, fx }) {
    const k = cloche(s, 0, 4.8);
    fx.vent = 1 + 0.85 * k;
    corps.a += trajet(s, [
      [0, 0],
      [0.8, -0.045],
      [2.0, 0.085],
      [3.3, -0.05],
      [4.8, 0],
    ]);
    corps.flex += 0.09 * k * Math.sin(s * 2.6);
    corps.tx += 0.014 * k * Math.sin(s * 2.4);
  },
};

const salut: Scene = {
  duree: 4.4,
  jouer({ s, corps, fx }) {
    if (s >= 0.5) fx.gerbe = s - 0.5;
    corps.a +=
      trajet(s, [
        [0, 0],
        [1.0, -0.075],
        [2.1, 0.065],
        [3.1, -0.03],
        [4.4, 0],
      ]) + amorti(s, 3.0, 4.4, 0.045);
    corps.ty += -0.024 * cloche(s, 0.4, 2.4);
  },
};

const frisson: Scene = {
  duree: 4.4,
  jouer({ s, corps, fx }) {
    const k = cloche(s, 0, 4.4);
    if (s >= 0.4) fx.gerbe = s - 0.4;
    corps.tx += 0.018 * Math.sin(s * 4.5) * k;
    corps.a += 0.055 * Math.sin(s * 5.5) * k;
    corps.flex += 0.08 * Math.sin(s * 6.0) * k;
  },
};

const brise: Scene = {
  duree: 4.8,
  jouer({ s, corps, fx }) {
    const k = cloche(s, 0, 4.8);
    fx.fanions = 1 + 2.2 * k;
    fx.vent = 1 + 1.1 * k;
    corps.a += 0.032 * k * Math.sin(s * 3.0);
  },
};

const rafale: Scene = {
  duree: 4.8,
  jouer({ s, corps, fx }) {
    const k = cloche(s, 0, 4.8);
    fx.vent = 1 + 2.4 * k;
    if (s >= 0.55) fx.gerbe = s - 0.55;
    corps.flex += 0.14 * k * Math.sin(s * 3.2);
    corps.a += 0.068 * k * Math.sin(s * 2.5);
  },
};

const fete: Scene = {
  duree: 5.2,
  jouer({ s, corps, fx }) {
    const k = cloche(s, 0, 5.2);
    fx.fanions = 1 + 2.4 * k;
    fx.confettis = s - 0.25;
    corps.ty += -0.018 * k * Math.abs(Math.sin(s * 3.6));
  },
};

export const SCENES: Record<string, Scene> = {
  'duo-citron': duoCitron,
  roule,
  rondelle,
  balance,
  salut,
  veille: balance,
  frisson,
  bouillir,
  fume,
  tinte,
  deborde,
  bat,
  bougies,
  souffle,
  'souffle-rallume': souffle,
  allume,
  rebond,
  secoue,
  grignote,
  casse,
  pepites,
  tournoie,
  toupie,
  'saut-pomme': sautPomme,
  saut,
  dandine,
  'toc-casse': tocCasse,
  domino,
  brise,
  rafale,
  fete,
};

// ---- Vie de repos continue : chaque aquarelle respire doucement même entre deux scènes --------------
export const REPOS: Record<string, (c: Ctx) => void> = {
  theiere({ s, corps, partie }) {
    corps.sy = 1 + 0.008 * Math.sin(s * 1.9);
    corps.sx = 1 - 0.005 * Math.sin(s * 1.9);
    const v = partie('verseuse');
    v.a += 0.008 * Math.sin(s * 1.4);
  },
  tasse({ s, corps, partie }) {
    corps.a += 0.007 * Math.sin(s * 1.3);
    const t = partie('tasse');
    t.a += 0.009 * Math.sin(s * 1.6);
  },
  'tasse-coeur'({ s, corps, partie }) {
    corps.a += 0.007 * Math.sin(s * 1.2);
    const c = partie('coeur');
    const p = 0.032 * Math.max(0, Math.sin(s * 2.8)) ** 2;
    c.sx = 1 + p;
    c.sy = 1 + p;
    c.ty = -0.008 * Math.sin(s * 1.4);
  },
  gateau({ s, corps, partie }) {
    corps.sy = 1 + 0.006 * Math.sin(s * 1.5);
    partie('bougie').a += 0.012 * Math.sin(s * 1.8);
  },
  tarte({ s, corps }) {
    corps.sy = 1 + 0.006 * Math.sin(s * 1.4);
  },
  cupcake({ s, corps, partie }) {
    corps.sy = 1 + 0.007 * Math.sin(s * 1.7);
    partie('framboise').ty = -0.006 * Math.abs(Math.sin(s * 1.7));
  },
  guirlande({ s, fx }) {
    fx.fanions = 1 + 0.35 * Math.sin(s * 1.4);
  },
  fanes({ s, corps, partie }) {
    corps.a += 0.006 * Math.sin(s * 1.1);
    const f = partie('fanes');
    f.a += 0.032 * Math.sin(s * 1.6);
    f.flex += 0.055 * Math.sin(s * 1.3);
  },
  brise({ s, corps, fx }) {
    fx.vent = 1 + 0.35 * Math.sin(s * 1.2);
    corps.flex += 0.022 * Math.sin(s * 1.1);
  },
  biscuits({ s, corps }) {
    corps.a += 0.007 * Math.sin(s * 1.2);
  },
  etoiles({ s, partie }) {
    partie('etoile-1').a += 0.018 * Math.sin(s * 1.3);
    partie('etoile-2').a -= 0.018 * Math.sin(s * 1.3 + 0.8);
  },
  agrumes({ s, corps }) {
    corps.a += 0.008 * Math.sin(s * 1.25);
  },
  fruits({ s, corps }) {
    corps.a += 0.008 * Math.sin(s * 1.35);
    corps.sy = 1 + 0.006 * Math.sin(s * 1.8);
  },
  oeufs({ s, partie }) {
    partie('coquille').a += 0.022 * Math.sin(s * 1.7);
  },
  noix({ s, partie }) {
    partie('noix-2').a += 0.014 * Math.sin(s * 1.4);
  },
};
