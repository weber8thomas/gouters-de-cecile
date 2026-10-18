// La cire qui coule. De temps en temps (une fois toutes les 20 à 40 s, sur l'une des trois coulures
// relevées, jamais deux fois de suite la même), la cire liquide du puits déborde par l'encoche d'une
// coulure : elle gonfle sur la lèvre, bascule, puis une goutte descend lentement le long de la coulure
// figée. Elle accélère un peu puis ralentit en refroidissant, s'étire quand elle va vite, s'alourdit en
// bas (une tête bombée au bout d'un col). Un filet luisant la relie à l'encoche tant que le puits
// l'alimente, puis s'amincit et se fige d'abord en haut ; la goutte se fige ensuite elle-même au bout
// de la coulure (dans la flaque, ou juste au-dessus de la goutte figée qui la termine) : plus opaque,
// plus mate, elle se fond dans la cire cuite.
//
// Rendu : dans la toile WebGL de la flamme (même contexte, même calque), avant la flamme. Pour chaque
// pixel d'un rectangle (scissor) autour de la cire liquide, le rayon de la caméra de la scène est lancé
// dans le repère de la bougie telle que Blender l'a rendue (scripts/bougie3d/scene.py ; la bougie a
// ensuite été réduite et déplacée en 2D par scripts/bake-bougie.py : la même similitude est appliquée à
// l'envers), et marche (sphere tracing) jusqu'à la surface du liquide :
//   - le filet, posé sur la crête de la coulure figée (chemin relevé sur le maillage, geometrie.json :
//     coulees), en tronçons : section en lentille, épaisseur et largeur variables le long du chemin ;
//   - la goutte : un cône arrondi (tête bombée en bas, col en haut), aplati contre la paroi, fondu au
//     filet par un minimum doux.
// Ce qui serait sous la cire figée (le bas de la lentille, noyé dans la crête) est laissé à la cire
// cuite. Matière : la cire liquide est claire, un peu ambrée ; on voit au travers la cire figée,
// réfractée (les calques cuits, cire et cire vive, servent de texture : la goutte prend exactement leur
// lumière, celle de la flamme et de la cheminée), teintée selon l'épaisseur traversée ; elle reflète
// (Fresnel) la table et la paroi éclairée, ce qui assombrit le filet vu de biais sur le flanc ; reflet
// net de la flamme (l'axe de la flamme rendue, qui bouge avec elle) et reflet large et chaud de la
// cheminée. En se figeant, la cire devient opaque (la cire cuite, ombrée selon la normale de la goutte)
// et mate, puis s'efface dans la cire cuite.
//
// Aucun coût hors des coulées : ni marche ni tirage tant que rien ne coule.
import geo from './geometrie.json';
import { assetUrl } from '../../lib/assets';
import type { EtatFlamme, GeoFlamme } from './flamme';

const PXCM = 39;
const HCAM = 80;
const CENTRE: [number, number] = [960, 540];
const G = geo.coulees;
/** Nœuds du film (le premier est au col de la goutte). */
const NB = 10;
/** Pas de la marche du rayon. */
const NB_PAS = 96;
/** Épaisseur du filet qui relie la goutte au puits, en part du rayon de la goutte. */
const FILET = 0.38;
/** Épaisseur du film qu'il laisse en s'amincissant (cm). */
const FILM = 0.012;
/** Moment où le puits cesse d'alimenter la coulée (part de la descente). */
const ARRET_DEBIT = 0.3;

/** Le chemin d'une coulure (repère de la bougie, cm, axes de Blender : x à droite, y vers le haut de l'écran, z vers le haut). */
interface Chemin {
  n: number;
  q: Float32Array;
  nor: Float32Array;
  larg: Float32Array;
  /** Effort cumulé (∫ ds / pente) : la cire va plus vite sur le flanc que sur la lèvre ou dans la flaque. */
  effort: Float32Array;
  long: number;
  levre: number;
  pied: number;
  auPied: boolean;
  /** Où s'arrête une coulée qui ne va pas jusqu'à la flaque : sur le flanc, juste au-dessus de la goutte
   *  figée qui termine la coulure (son bombé cacherait mal la goutte liquide). */
  bout: number;
}

const CHEMINS: Chemin[] = G.coulures.map((c) => {
  const n = c.largeur.length;
  const q = new Float32Array(c.q);
  const nor = new Float32Array(c.n);
  const effort = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const pente = (k: number) => 0.3 + 0.7 * Math.hypot(nor[3 * k], nor[3 * k + 1]);
    effort[i] = effort[i - 1] + G.pas / (0.5 * (pente(i) + pente(i - 1)));
  }
  const long = (n - 1) * G.pas;
  let bout = long - 0.3;
  for (let i = Math.ceil((c.levre + 0.5) / G.pas); i < n; i++) {
    if (nor[3 * i + 2] > 0.15) {
      bout = Math.max(c.levre + 0.8, i * G.pas - 0.1);
      break;
    }
  }
  return { n, q, nor, larg: new Float32Array(c.largeur), effort, long, levre: c.levre, pied: c.pied, auPied: c.auPied, bout };
});

const lisse = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Point du chemin à l'abscisse s (cm) : crête, normale (unitaire), demi-largeur de la coulure figée. */
function point(c: Chemin, s: number, q: number[], n: number[]): number {
  const x = borne(s / G.pas, 0, c.n - 1);
  const i = Math.min(c.n - 2, Math.floor(x));
  const f = x - i;
  for (let k = 0; k < 3; k++) {
    q[k] = c.q[3 * i + k] * (1 - f) + c.q[3 * i + 3 + k] * f;
    n[k] = c.nor[3 * i + k] * (1 - f) + c.nor[3 * i + 3 + k] * f;
  }
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  n[0] /= l;
  n[1] /= l;
  n[2] /= l;
  return c.larg[i] * (1 - f) + c.larg[i + 1] * f;
}

/** Abscisse de l'effort e (inverse de Chemin.effort). */
function abscisse(c: Chemin, e: number): number {
  const E = c.effort;
  if (e <= 0) return 0;
  if (e >= E[c.n - 1]) return c.long;
  let a = 0;
  let b = c.n - 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (E[m] < e) a = m;
    else b = m;
  }
  return (a + (e - E[a]) / (E[b] - E[a])) * G.pas;
}
const effortA = (c: Chemin, s: number) => {
  const x = borne(s / G.pas, 0, c.n - 1);
  const i = Math.min(c.n - 2, Math.floor(x));
  return c.effort[i] + (x - i) * (c.effort[i + 1] - c.effort[i]);
};

// ---- Une coulée ---------------------------------------------------------------------------------------
const NB_V = 64;

/** Une coulée en cours : ses durées (s), sa taille, et sa loi d'avancée (tirées au hasard à son départ). */
interface Coulee {
  k: number;
  t: number;
  /** gonflement sur la lèvre, descente, prise */
  tg: number;
  td: number;
  tf: number;
  r0: number;
  /** avancée cumulée (0 → 1) en fonction du temps de descente, et vitesse relative (max 1) */
  avance: Float32Array;
  vitesse: Float32Array;
  sDebut: number;
  sFin: number;
}

function nouvelleCoulee(k: number, alea: () => number): Coulee {
  const c = CHEMINS[k];
  // vitesse ∝ u^a (1 − u)^b : départ assez vif, puis la goutte ralentit longuement en refroidissant
  const a = 0.6 + 0.4 * alea();
  const b = 1.5 + 0.8 * alea();
  const v = new Float32Array(NB_V + 1);
  const av = new Float32Array(NB_V + 1);
  let vmax = 0;
  for (let i = 0; i <= NB_V; i++) {
    const u = i / NB_V;
    // une petite hésitation au hasard (la goutte bute sur un bourrelet, puis repart)
    v[i] = u ** a * (1 - u) ** b;
    vmax = Math.max(vmax, v[i]);
  }
  const bute = 0.3 + 0.4 * alea();
  for (let i = 0; i <= NB_V; i++) v[i] *= 1 - 0.35 * Math.exp(-(((i / NB_V - bute) / 0.06) ** 2));
  for (let i = 1; i <= NB_V; i++) av[i] = av[i - 1] + 0.5 * (v[i] + v[i - 1]);
  for (let i = 0; i <= NB_V; i++) {
    av[i] /= av[NB_V];
    v[i] /= vmax;
  }
  const r0 = (0.12 + 0.03 * alea()) * (c.auPied ? 1 : 0.9);
  return {
    k, t: 0,
    tg: 1.2 + 0.8 * alea(),
    td: c.auPied ? 6 + 2.5 * alea() : 4.2 + 1.5 * alea(),
    tf: 3 + alea(),
    r0,
    avance: av,
    vitesse: v,
    sDebut: c.levre - 0.02,
    // dans la flaque, un peu au-delà du pied ; sinon sur le flanc, au-dessus de la goutte figée qui
    // termine la coulure
    sFin: c.auPied ? Math.min(c.long - 0.05, c.pied + 0.22) : c.bout,
  };
}

const table = (t: Float32Array, u: number) => {
  const x = borne(u, 0, 1) * NB_V;
  const i = Math.min(NB_V - 1, Math.floor(x));
  return t[i] + (x - i) * (t[i + 1] - t[i]);
};

/** Ce que le shader reçoit : la cire liquide à un instant (repère de la bougie, cm). */
export interface Liquide {
  /** nœuds du film : crête (xyz) + épaisseur ; normale (xyz) + demi-largeur ; prise (0 liquide → 1 figé) */
  q: Float32Array;
  n: Float32Array;
  e: Float32Array;
  /** la goutte : A (xyz, r1), B (xyz pré-étiré, r2), normale (xyz, aplatissement), crête sous la tête
   *  (xyz, prise) et sa normale, crête sous le col et sa normale */
  ta: Float32Array;
  tb: Float32Array;
  tn: Float32Array;
  tq: Float32Array;
  tp: Float32Array;
  tc: Float32Array;
  tm: Float32Array;
  /** boîte englobante */
  min: Float32Array;
  max: Float32Array;
  fondu: number;
}

export interface EtatCoulee {
  coulure: number;
  phase: 'repos' | 'gonfle' | 'coule' | 'fige';
  t: number;
  s: number;
  vitesse: number;
  prise: number;
  prochaine: number;
}

/** Les coulées : leur calendrier et l'état de la cire liquide. */
export interface Coulees {
  /** Avance l'horloge (s) ; lance une coulée quand vient son heure. */
  avancer(dt: number): void;
  /** La cire liquide à l'instant présent, ou null si rien ne coule. */
  liquide(): Liquide | null;
  /** Lance une coulée tout de suite (vérifications) : sur la coulure k, ou la suivante ; `t` : à cet
   *  instant de la coulée (s), figée là si `fige` (celle qui coule déjà sur k, s'il y en a une). */
  couler(k?: number, t?: number, fige?: boolean): void;
  etat(): EtatCoulee;
}

export function creerCoulees(alea: () => number = Math.random): Coulees {
  let horloge = 0;
  let prochaine = 7 + 6 * alea();
  let derniere = -1;
  let en: Coulee | null = null;
  let figee = false;
  const L: Liquide = {
    q: new Float32Array(4 * NB), n: new Float32Array(4 * NB), e: new Float32Array(4 * NB),
    ta: new Float32Array(4), tb: new Float32Array(4), tn: new Float32Array(4), tq: new Float32Array(4),
    tp: new Float32Array(3), tc: new Float32Array(3), tm: new Float32Array(3),
    min: new Float32Array(3), max: new Float32Array(3), fondu: 1,
  };
  const q = [0, 0, 0];
  const n = [0, 0, 0];
  const q2 = [0, 0, 0];
  const n2 = [0, 0, 0];
  const abscisses: number[] = new Array(NB).fill(0);
  let sTete = 0;
  let vTete = 0;
  let priseTete = 0;

  const lancer = (k?: number) => {
    let i = k ?? Math.floor(alea() * CHEMINS.length);
    if (k === undefined && i === derniere) i = (i + 1 + Math.floor(alea() * (CHEMINS.length - 1))) % CHEMINS.length;
    i = ((i % CHEMINS.length) + CHEMINS.length) % CHEMINS.length;
    derniere = i;
    en = nouvelleCoulee(i, alea);
  };
  const fin = (c: Coulee) => c.tg + c.td + c.tf;

  // le temps où le front de la goutte a passé l'abscisse s (pendant la descente)
  const passage = (c: Coulee, ch: Chemin, s: number) => {
    const e0 = effortA(ch, c.sDebut);
    const e1 = effortA(ch, c.sFin);
    const p = borne((effortA(ch, s) - e0) / (e1 - e0), 0, 1);
    let a = 0;
    let b = NB_V;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (c.avance[m] < p) a = m;
      else b = m;
    }
    const u = (a + (p - c.avance[a]) / Math.max(1e-6, c.avance[b] - c.avance[a])) / NB_V;
    return c.tg + borne(u, 0, 1) * c.td;
  };

  const calculer = (c: Coulee): Liquide => {
    const ch = CHEMINS[c.k];
    const t = c.t;
    // ---- la goutte : front sF, rayon de la tête r1, longueur (tête → col) lg, rayon du col r2, aplatissement ka
    let sF: number;
    let r1: number;
    let lg: number;
    let r2: number;
    let ka = 0.8;
    let v = 0;
    let p = 0;
    let etale = 0;
    if (t < c.tg) {
      // la cire monte dans l'encoche et gonfle sur la lèvre
      const g = t / c.tg;
      sF = c.sDebut - 0.04 + 0.08 * lisse(0, 1, g);
      r1 = c.r0 * (0.3 + 0.7 * Math.sqrt(g));
      lg = r1 * (1.3 - 0.7 * g);
      r2 = 0.85 * r1;
      ka = 0.45 + 0.3 * g;
    } else {
      const u = (t - c.tg) / c.td;
      p = table(c.avance, u);
      v = u < 1 ? table(c.vitesse, u) : 0;
      const e0 = effortA(ch, c.sDebut);
      const e1 = effortA(ch, c.sFin);
      sF = abscisse(ch, e0 + (e1 - e0) * p);
      // elle ramasse la cire du film en tête (elle s'alourdit en bas) et s'étire quand elle va vite
      r1 = c.r0 * (1 + 0.22 * p);
      lg = r1 * (1.0 + 1.6 * v + 0.5 * p);
      r2 = r1 * (0.62 - 0.12 * v);
      if (ch.auPied) {
        // arrivée dans la flaque : elle s'étale
        etale = lisse(ch.pied - 0.15, c.sFin, sF);
        ka -= 0.45 * etale;
        r1 *= 1 + 0.5 * etale;
        lg *= 1 - 0.8 * etale;
      }
    }
    sTete = sF;
    vTete = v;
    // elle refroidit en descendant, puis se fige au bout
    const tArr = c.tg + c.td;
    const prise = borne(0.25 * p * p + 0.75 * lisse(tArr - 0.6, tArr + 0.75 * c.tf, t), 0, 1);
    priseTete = prise;
    L.fondu = 1 - lisse(tArr + 0.45 * c.tf, tArr + c.tf, t);

    const sB = sF - r1; // centre de la tête
    const sC = Math.max(0, sB - lg); // centre du col
    point(ch, sB, q, n);
    point(ch, sC, q2, n2);
    // la normale de la goutte (son aplatissement) : celle de la tête, avec celle du col tant qu'elle coule
    const nh = [n[0] + (1 - etale) * n2[0], n[1] + (1 - etale) * n2[1], n[2] + (1 - etale) * n2[2]];
    const l = Math.hypot(nh[0], nh[1], nh[2]) || 1;
    for (let k = 0; k < 3; k++) nh[k] /= l;
    const A = [0, 0, 0];
    const B = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      A[k] = q[k] + n[k] * 0.35 * r1 * ka;
      B[k] = q2[k] + n2[k] * 0.35 * r2 * ka;
    }
    // B étiré le long de la normale (le shader aplatit autour de A)
    const dBn = (B[0] - A[0]) * nh[0] + (B[1] - A[1]) * nh[1] + (B[2] - A[2]) * nh[2];
    const Bp = [0, 1, 2].map((k) => B[k] + nh[k] * dBn * (1 / ka - 1));
    const dist = Math.hypot(Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]);
    if (dist < 0.004) {
      // tête ronde : un cône arrondi dégénéré, tiré d'un rien vers le haut du chemin
      Bp[0] = A[0] + 0.004;
      r2 = Math.min(r2, r1 - 0.0045);
    } else if (Math.abs(r1 - r2) > 0.95 * dist) r2 = r1 - 0.95 * dist;
    L.ta.set([A[0], A[1], A[2], r1]);
    L.tb.set([Bp[0], Bp[1], Bp[2], Math.max(0.002, r2)]);
    L.tn.set([nh[0], nh[1], nh[2], ka]);
    L.tq.set([q[0], q[1], q[2], prise]);
    L.tp.set(n);
    // (dans la flaque, la goutte étalée n'est plus cachée que par la flaque elle-même)
    const nm = [0, 1, 2].map((k) => n2[k] + (n[k] - n2[k]) * etale);
    const lm = Math.hypot(nm[0], nm[1], nm[2]) || 1;
    L.tc.set([0, 1, 2].map((k) => q2[k] + (q[k] - q2[k]) * etale));
    L.tm.set(nm.map((x) => x / lm));
    const mn = [A[0] - r1, A[1] - r1, A[2] - r1];
    const mx = [A[0] + r1, A[1] + r1, A[2] + r1];
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], B[k] - r2);
      mx[k] = Math.max(mx[k], B[k] + r2);
    }

    // ---- le film, du puits au col : nœuds serrés près de la goutte, et au coin de la lèvre
    const tIn = c.tg + ARRET_DEBIT * c.td; // le puits alimente la coulée jusque-là
    const sL = ch.levre;
    if (sC > sL + 0.35) {
      for (let k = 0; k < 5; k++) abscisses[k] = sC - (sC - sL - 0.15) * (k / 5) ** 1.5;
      abscisses.splice(5, 5, sL + 0.15, sL, sL - 0.15, sL - 0.3, 0);
    } else for (let i = 0; i < NB; i++) abscisses[i] = sC * (1 - (i / (NB - 1)) ** 1.5);
    for (let i = 0; i < NB; i++) {
      const s = abscisses[i];
      const larg = point(ch, s, q, n);
      const depuis = s >= c.sDebut - 0.1 ? Math.max(passage(c, ch, s), tIn) : tIn;
      const age = Math.max(0, t - depuis);
      // le col : la goutte s'effile vers le haut en un filet épais (pas pendant qu'elle gonfle sur la lèvre)
      const col = sC > 0.02 ? Math.exp(-(sC - s) / 0.35) * lisse(c.tg - 0.3, c.tg + 0.6, t) : 0;
      // un filet bombé tant que le puits l'alimente, qui s'amincit ensuite (la cire file dans la goutte)
      const filet = (FILET * c.r0) / (1 + age / 1.2);
      let h = Math.max(filet, FILM) + Math.max(0, 0.9 * r2 * ka - filet) * col;
      // dans le puits, la cire liquide est la nappe elle-même (de niveau) : pas de film
      if (sC <= 0.02 || (s < sL && q[2] < G.niveau + 0.01)) h = 0;
      let w = borne(Math.max(0.55 * c.r0, 0.25 * larg), 0.05, 0.11);
      w += (Math.max(w, 1.1 * r2) - w) * col;
      // (le col se fige avec la goutte, le reste du film d'abord, en haut)
      const priseFilm = lisse(0.8, 3.6, age) + (prise - lisse(0.8, 3.6, age)) * col;
      L.q.set([q[0], q[1], q[2], h], 4 * i);
      L.n.set([n[0], n[1], n[2], w], 4 * i);
      L.e.set([priseFilm, 0, 0, 0], 4 * i);
      if (h > 0) {
        for (let k = 0; k < 3; k++) {
          mn[k] = Math.min(mn[k], q[k] - w - h);
          mx[k] = Math.max(mx[k], q[k] + w + h);
        }
      }
    }
    for (let k = 0; k < 3; k++) {
      L.min[k] = mn[k] - 0.02;
      L.max[k] = mx[k] + 0.02;
    }
    return L;
  };

  return {
    avancer(dt) {
      horloge += dt;
      if (en) {
        if (!figee) en.t += dt;
        if (en.t > fin(en)) {
          en = null;
          prochaine = horloge + 20 + 20 * alea();
        }
      } else if (horloge >= prochaine) lancer();
    },
    liquide: () => (en ? calculer(en) : null),
    couler(k, t, fige) {
      // un instant donné d'une coulée en cours sur la même coulure : la même coulée (mêmes tirages)
      if (t === undefined || !en || en.k !== k) lancer(k);
      if (en && t) en.t = t;
      figee = !!fige;
    },
    etat() {
      const c = en;
      if (c) calculer(c);
      return {
        coulure: c ? c.k : -1,
        phase: !c ? 'repos' : c.t < c.tg ? 'gonfle' : c.t < c.tg + c.td ? 'coule' : 'fige',
        t: c ? Math.round(c.t * 100) / 100 : 0,
        s: c ? Math.round(sTete * 1000) / 1000 : 0,
        vitesse: c ? Math.round(vTete * 100) / 100 : 0,
        prise: c ? Math.round(priseTete * 100) / 100 : 0,
        prochaine: Math.round((prochaine - horloge) * 10) / 10,
      };
    },
  };
}

// ---- Le rendu -----------------------------------------------------------------------------------------
const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform vec4 uBoite;    // la toile en px de scène
uniform vec4 uSim;      // la similitude de la cuisson : pied (px de scène du rendu), taille
uniform vec2 uDec;      // et le décalage (px de scène)
uniform vec2 uBase;     // le pied de la bougie (cm de table, depuis l'aplomb de la caméra, axes de Blender)
uniform vec4 uCire;     // le calque de la cire (px de scène)
uniform sampler2D uBas;
uniform sampler2D uVif;
uniform float uVive;    // opacité du calque de la cire vive
uniform float uPx;      // taille d'un pixel de la toile sur la bougie (cm)
uniform vec3 uMin;
uniform vec3 uMax;
uniform vec4 uQ[${NB}];
uniform vec4 uN[${NB}];
uniform vec4 uE[${NB}];
uniform vec4 uTa;
uniform vec4 uTb;
uniform vec4 uTn;
uniform vec4 uTq;       // la crête sous la tête (xyz) et la prise de la goutte
uniform vec3 uTp;       // la normale de la crête sous la tête
uniform vec3 uTc;       // la crête sous le col
uniform vec3 uTm;       // et sa normale
uniform vec4 uF0;       // l'axe de la flamme (bas, haut) ; uF0.w : sa lumière
uniform vec3 uF1;
uniform float uFondu;

const float PXCM = ${PXCM.toFixed(1)};
const float HCAM = ${HCAM.toFixed(1)};
const vec2 CENTRE = vec2(${CENTRE[0].toFixed(1)}, ${CENTRE[1].toFixed(1)});
const vec3 FEU = vec3(-0.74, 0.22, 0.63);      // vers la cheminée (hors champ à gauche, scene.py)
const vec3 MOUILLE = vec3(0.9, 0.86, 0.79);   // la cire figée sous un film liquide
const vec3 AMBRE = vec3(0.94, 0.86, 0.72);     // sous une goutte épaisse (≥ 0,25 cm traversés)
const vec3 LUEUR = vec3(0.13, 0.07, 0.02);     // la lumière de la flamme diffusée dans la goutte
const vec3 PAROI = vec3(0.85, 0.68, 0.45);     // la paroi éclairée, vue en reflet
const vec3 TABLE = vec3(0.55, 0.3, 0.13);      // la table au pied de la bougie, vue en reflet
const int NB_PAS = ${NB_PAS};

// point de la bougie → px de scène (la caméra, puis la similitude de la cuisson)
vec2 ecran(vec3 x) {
  vec2 w = x.xy + uBase;
  vec2 o = CENTRE + vec2(w.x, -w.y) * (PXCM * HCAM / (HCAM - x.z));
  return uSim.xy + (o - uSim.xy) * uSim.z + uDec;
}
// la cire cuite vue en ce point (les deux calques, fondus comme à l'écran) ; alpha : sur la bougie
vec4 cuite(vec3 x) {
  vec2 uv = (ecran(x) - uCire.xy) / uCire.zw;
  return mix(texture2D(uBas, uv), texture2D(uVif, uv), uVive);
}

float rondCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// la goutte, aplatie contre la paroi (autour de A, le long de la normale)
float tete(vec3 p) {
  vec3 n = uTn.xyz;
  vec3 ps = p + n * dot(p - uTa.xyz, n) * (1.0 / uTn.w - 1.0);
  return rondCone(ps, uTa.xyz, uTb.xyz, uTa.w, uTb.w) * uTn.w;
}

// le film : section en lentille au-dessus de la crête ; dn : hauteur au-dessus de la crête, nc : sa
// normale, nf : la normale de la lentille (analytique : continue d'un tronçon à l'autre)
float film(vec3 p, out float dn, out vec3 nc, out vec3 nf, out float prise) {
  float d = 1e3;
  dn = 1.0;
  nc = vec3(0.0, 0.0, 1.0);
  nf = nc;
  prise = 1.0;
  for (int i = 0; i < ${NB - 1}; i++) {
    vec3 a = uQ[i].xyz;
    vec3 e = uQ[i + 1].xyz - a;
    float t = clamp(dot(p - a, e) / (dot(e, e) + 1e-6), 0.0, 1.0);
    vec3 r = p - a - e * t;
    vec3 n = normalize(mix(uN[i].xyz, uN[i + 1].xyz, t));
    float h = mix(uQ[i].w, uQ[i + 1].w, t);
    float w = mix(uN[i].w, uN[i + 1].w, t);
    float z = dot(r, n);
    // en travers : sans la part le long du tronçon (aux bouts, le film continue un peu sur le suivant)
    vec3 eu = e * inversesqrt(dot(e, e) + 1e-8);
    float le = dot(r, eu);
    vec3 lat = r - n * z - eu * le;
    float b = length(lat);
    float H = h * (1.0 - min(b * b / (w * w), 1.0));
    float di = h < 0.002 ? 1e3 : max(max((z - H) * 0.8, b - w), abs(le) - 0.03);
    if (di < d) {
      d = di;
      dn = z;
      nc = n;
      nf = normalize(n + lat * (2.0 * h / (w * w)) * step(b, w));
      prise = mix(uE[i].x, uE[i + 1].x, t);
    }
  }
  return d;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float champ(vec3 p) {
  float dn, pr;
  vec3 nc, nf;
  return smin(film(p, dn, nc, nf, pr), tete(p), 0.03);
}

// rayon (o + t d) et segment [a, b] : distance la plus courte, et t
vec2 croise(vec3 o, vec3 d, vec3 a, vec3 b) {
  vec3 e = b - a;
  vec3 w = o - a;
  float A = dot(d, d), B = dot(d, e), C = dot(e, e), D = dot(d, w), E = dot(e, w);
  float u = clamp((A * E - B * D) / max(A * C - B * B, 1e-6), 0.0, 1.0);
  float t = (B * u - D) / A;
  return vec2(length(o + t * d - a - u * e), t);
}

// éclairement (la cire diffuse beaucoup : un fond large), pour ombrer la goutte comme la cire cuite
float eclaire(vec3 n, vec3 lf) {
  return 0.6 + 0.4 * max(dot(n, lf), 0.0) + 0.15 * max(dot(n, FEU), 0.0);
}

void main() {
  vec2 P = uBoite.xy + vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y) * uBoite.zw;
  // le px de scène du rendu Blender, puis le rayon de la caméra (repère de la bougie)
  vec2 O = uSim.xy + (P - uSim.xy - uDec) / uSim.z;
  vec3 C = vec3(-uBase, HCAM);
  vec3 T = vec3((O.x - CENTRE.x) / PXCM - uBase.x, -(O.y - CENTRE.y) / PXCM - uBase.y, 0.0);
  vec3 d = normalize(T - C);
  vec3 inv = 1.0 / (d + vec3(1e-7));
  vec3 t0 = (uMin - C) * inv;
  vec3 t1 = (uMax - C) * inv;
  vec3 tn = min(t0, t1);
  vec3 tx = max(t0, t1);
  float ta = max(max(tn.x, tn.y), tn.z);
  float tb = min(min(tx.x, tx.y), tx.z);
  if (tb < ta) { gl_FragColor = vec4(0.0); return; }

  float t = ta;
  float dmin = 1e3;
  float tm = ta;
  bool touche = false;
  for (int i = 0; i < NB_PAS; i++) {
    float s = champ(C + d * t);
    if (s < dmin) { dmin = s; tm = t; }
    if (s < 0.1 * uPx) { touche = true; break; }
    t += max(s, 0.2 * uPx);
    if (t > tb) break;
  }
  // bord adouci : un rayon qui frôle la surface la couvre en partie
  float cov = touche ? 1.0 : 0.7 * clamp(1.0 - dmin / uPx, 0.0, 1.0);
  if (cov <= 0.0) { gl_FragColor = vec4(0.0); return; }
  if (!touche) t = tm;
  vec3 p = C + d * t;

  float dnF, priseF;
  vec3 nF, nL;
  float dF = film(p, dnF, nF, nL, priseF);
  float dT = tete(p);
  float wT = clamp(0.5 + 0.5 * (dF - dT) / 0.03, 0.0, 1.0);   // part de la goutte (le reste : film)
  // la crête sous la goutte : de la tête au col (la goutte peut passer le coin de la lèvre)
  vec3 tc = uTc - uTq.xyz;
  float ht = clamp(dot(p - uTq.xyz, tc) / (dot(tc, tc) + 1e-6), 0.0, 1.0);
  vec3 nT = normalize(mix(uTp, uTm, ht));
  float dnT = dot(p - mix(uTq.xyz, uTc, ht), nT);
  float dn = mix(dnF, dnT, wT);              // hauteur au-dessus de la cire figée
  vec3 npl = normalize(mix(nF, nT, wT));
  float prise = mix(priseF, uTq.w, wT);
  // sous la cire figée : c'est elle qu'on voit (la cire cuite)
  float vis = smoothstep(-0.5 * uPx, 0.3 * uPx, dn);
  if (vis <= 0.0) { gl_FragColor = vec4(0.0); return; }

  const vec2 k = vec2(1.0, -1.0);
  const float eps = 0.0025;
  vec3 N = normalize(k.xyy * champ(p + k.xyy * eps) + k.yyx * champ(p + k.yyx * eps)
    + k.yxy * champ(p + k.yxy * eps) + k.xxx * champ(p + k.xxx * eps));
  // sur le film, la normale de la lentille (le gradient du champ casse aux jointures des tronçons)
  N = normalize(mix(nL, N, smoothstep(0.1, 0.6, wT)));
  vec3 V = -d;
  vec3 lf = normalize(mix(uF0.xyz, uF1, 0.35) - p);

  // la cire cuite juste sous le liquide (un peu déviée par la réfraction), ombrée selon la normale du
  // liquide : figée, la goutte est cette cire-là
  float ep = max(dn, 0.0);
  vec3 dessous = p - npl * ep;
  vec4 U0 = cuite(dessous);
  vec3 rr = refract(d, N, 1.0 / 1.44);
  vec4 U1 = cuite(dessous + (rr - npl * dot(rr, npl)) * min(1.5 * ep, 0.05));
  // (figée, elle est opaque : plus de réfraction)
  vec3 U = mix(U0.rgb, U1.rgb, step(0.6, U1.a) * (1.0 - prise));
  float haut = max(dot(N, lf), 0.0);
  // la cire cuite porte déjà sa lumière : la normale de la goutte n'y ajoute qu'un relief doux
  vec3 fige = U * clamp(eclaire(N, lf) / eclaire(npl, lf), 0.8, 1.25);
  // liquide : la cire « mouillée » (plus saturée et un peu plus sombre : sa surface ne diffuse plus),
  // teintée par l'épaisseur traversée ; une goutte épaisse, éclairée par le haut, luit un peu
  float trav = clamp(ep / max(dot(V, npl), 0.25), 0.0, 0.5);
  float epais = clamp(trav / 0.25, 0.0, 1.0);
  float lumF = dot(fige, vec3(0.2126, 0.7152, 0.0722));
  vec3 liquide = max(mix(vec3(lumF), fige, 1.2), 0.0) * mix(MOUILLE, AMBRE, epais) + LUEUR * (haut * epais * uF0.w);
  // ce que reflète le liquide : la table éclairée par la bougie (vers le bas), la paroi qui luit (vers
  // le haut) ; vu de biais (le flanc, le bord de la goutte), il en reflète une bonne part (Fresnel) et
  // laisse moins voir la cire : un filet plus sombre et luisant, sans liseré dessiné
  float cv = max(dot(N, V), 0.0);
  float F = 0.033 + 0.967 * pow(1.0 - cv, 5.0);
  vec3 R = reflect(d, N);
  vec3 env = mix(TABLE, PAROI, smoothstep(-0.1, 0.8, R.z)) * uF0.w;
  liquide = mix(liquide, env, F);
  vec3 col = mix(liquide, fige, prise);

  // reflets nets : la flamme (son cœur, net, et sa lueur, large), la cheminée (large, chaud) ; ils
  // s'élargissent et s'éteignent en se figeant
  vec2 kf = croise(p, R, uF0.xyz, uF1);
  float ang = kf.x / max(kf.y, 0.5);
  float rug = 1.0 + 1.5 * prise;
  float spot = kf.y > 0.0 ? exp(-ang * ang / (0.02 * rug * rug)) + 0.12 * exp(-ang * ang / (0.15 * rug)) : 0.0;
  vec3 spec = vec3(1.0, 0.84, 0.58) * (40.0 * uF0.w * F * spot / (1.0 + 20.0 * prise * prise));
  spec += vec3(0.95, 0.45, 0.16) * (1.4 * F * pow(max(dot(R, FEU), 0.0), 10.0) * (1.0 - 0.8 * prise));

  // le film figé est la cire cuite : il s'efface ; la goutte, au bout, se fond dans la cire cuite
  float a = cov * vis * uFondu * mix(1.0 - smoothstep(0.5, 1.0, priseF), 1.0, max(wT, clamp(1.0 - dT / 0.04, 0.0, 1.0)));
  gl_FragColor = vec4((col + spec) * a, a);
}`;

const VS = `attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

/** Le rendu de la cire liquide, dans le contexte de la toile de la flamme. */
export interface RenduCire {
  /** Dessine la cire liquide (rien si null) ; vive : opacité du calque de la cire vive. */
  dessiner(l: Liquide | null, e: EtatFlamme, vive: number): void;
  detruire(): void;
}

/** La toile de la flamme : sa géométrie (px de scène), et la mèche (repère de la bougie). */
export function creerRenduCire(gl: WebGLRenderingContext, toile: GeoFlamme, triangle: WebGLBuffer): RenduCire | null {
  const prog = gl.createProgram();
  if (!prog) return null;
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      console.warn('[Bougie] shader de la cire :', gl.getShaderInfoLog(sh));
      return null;
    }
    gl.attachShader(prog, sh);
  }
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const u = (nom: string) => gl.getUniformLocation(prog, nom);
  const U = {
    res: u('uRes'), vive: u('uVive'), px: u('uPx'), min: u('uMin'), max: u('uMax'),
    q: u('uQ'), n: u('uN'), e: u('uE'), ta: u('uTa'), tb: u('uTb'), tn: u('uTn'), tq: u('uTq'),
    tp: u('uTp'), tc: u('uTc'), tm: u('uTm'),
    f0: u('uF0'), f1: u('uF1'), fondu: u('uFondu'),
  };
  gl.useProgram(prog);
  gl.uniform4f(u('uBoite'), toile.x, toile.y, toile.w, toile.h);
  gl.uniform4f(u('uSim'), G.pied[0], G.pied[1], G.taille, 0);
  gl.uniform2f(u('uDec'), G.decalage[0], G.decalage[1]);
  gl.uniform2f(u('uBase'), G.base[0], G.base[1]);
  gl.uniform4f(u('uCire'), geo.cire.x, geo.cire.y, geo.cire.w, geo.cire.h);
  gl.uniform1i(u('uBas'), 0);
  gl.uniform1i(u('uVif'), 1);

  // les deux calques de la cire, en textures (chargés à part ; rien ne coule avant)
  const textures: (WebGLTexture | null)[] = [null, null];
  let pretes = 0;
  let fini = false;
  ['bougie/cire', 'bougie/cire-vive'].forEach((nom, i) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (fini || gl.isContextLost()) return;
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      } catch {
        gl.deleteTexture(tex);
        return; // image d'une autre origine sans CORS : pas de coulée
      }
      gl.activeTexture(gl.TEXTURE0);
      textures[i] = tex;
      pretes++;
    };
    img.src = assetUrl(nom);
  });

  // la mèche (repère de la bougie) et la flamme rendue : de la base du cœur vers la pointe
  const [mx, my, mz] = G.meche;
  const r = 1 / G.taille; // la flamme est rendue à sa taille vraie à côté d'une bougie réduite : ramenée au rendu
  return {
    dessiner(l, e, vive) {
      if (!l || pretes < 2 || gl.isContextLost()) return;
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      // le rectangle de la cire liquide à l'écran (coins de sa boîte englobante)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let c = 0; c < 8; c++) {
        const x = c & 1 ? l.max[0] : l.min[0];
        const y = c & 2 ? l.max[1] : l.min[1];
        const z = c & 4 ? l.max[2] : l.min[2];
        const k = (PXCM * HCAM) / (HCAM - z);
        const ox = CENTRE[0] + (x + G.base[0]) * k;
        const oy = CENTRE[1] - (y + G.base[1]) * k;
        const px = G.pied[0] + (ox - G.pied[0]) * G.taille + G.decalage[0];
        const py = G.pied[1] + (oy - G.pied[1]) * G.taille + G.decalage[1];
        const dx = ((px - toile.x) / toile.w) * W;
        const dy = H - ((py - toile.y) / toile.h) * H;
        x0 = Math.min(x0, dx);
        x1 = Math.max(x1, dx);
        y0 = Math.min(y0, dy);
        y1 = Math.max(y1, dy);
      }
      const sx = Math.max(0, Math.floor(x0) - 2);
      const sy = Math.max(0, Math.floor(y0) - 2);
      const sw = Math.min(W, Math.ceil(x1) + 2) - sx;
      const sh = Math.min(H, Math.ceil(y1) + 2) - sy;
      if (sw <= 0 || sh <= 0) return;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.uniform2f(U.res, W, H);
      gl.uniform1f(U.vive, vive);
      gl.uniform1f(U.px, toile.w / W / (G.taille * PXCM * 1.04));
      gl.uniform3fv(U.min, l.min);
      gl.uniform3fv(U.max, l.max);
      gl.uniform4fv(U.q, l.q);
      gl.uniform4fv(U.n, l.n);
      gl.uniform4fv(U.e, l.e);
      gl.uniform4fv(U.ta, l.ta);
      gl.uniform4fv(U.tb, l.tb);
      gl.uniform4fv(U.tn, l.tn);
      gl.uniform4fv(U.tq, l.tq);
      gl.uniform3fv(U.tp, l.tp);
      gl.uniform3fv(U.tc, l.tc);
      gl.uniform3fv(U.tm, l.tm);
      gl.uniform1f(U.fondu, l.fondu);
      // l'axe de la flamme rendue (flamme.ts : axe A(h), x et y comme l'écran), dans le repère du rendu
      const a = e.axe;
      const h = 1.3 * e.long;
      const ax = h * (a[0] + h * (a[2] + h * (a[4] + h * a[6])));
      const ay = h * (a[1] + h * (a[3] + h * (a[5] + h * a[7])));
      gl.uniform4f(U.f0, mx, my, mz + 0.3 * r, e.eclat * e.long);
      gl.uniform3f(U.f1, mx + ax * r, my - ay * r, mz + h * r);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[0]);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures[1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(sx, sy, sw, sh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
    },
    detruire() {
      fini = true;
      if (gl.isContextLost()) return;
      for (const t of textures) if (t) gl.deleteTexture(t);
      gl.deleteProgram(prog);
    },
  };
}
