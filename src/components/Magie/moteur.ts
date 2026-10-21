// Le moteur de la magie : une seule toile WebGL par livre, dans le repère de la caméra (elle suit le zoom,
// l'ouverture, le glissement d'une page à l'autre), une seule boucle, un seul pas de temps.
//
//   gerbe d'or      — à chaque tour de page (doigt, clic, flèches, clavier, sommaire, Début / Fin,
//                     couverture) : des étincelles naissent le long du bord libre de la feuille, à la
//                     mesure de sa vitesse, avec un trait de lumière sur le bord ; au coin saisi, sous la
//                     main ; une bouffée quand la feuille se pose ; un petit feu d'artifice d'or quand la
//                     couverture s'ouvre ;
//   poussière d'or  — dans la lumière de la bougie (poussiere.ts) ;
//   titres          — un reflet doré passe régulièrement sur l'encre des titres ; un paraphe d'or se
//                     dessine sous le titre qu'on touche ou qu'on survole ;
//   encre magique   — frises et ornements d'angle qui s'écrivent seuls quand la page a fini de s'écrire,
//                     puis restent et s'illuminent d'or de temps en temps ; les pas du maraudeur et les
//                     petites pattes de Jack Russell qui se promènent dans les marges ; les cachettes
//                     secrètes (lunettes & éclair, tasse magique, couronne 30 ans, baguette, mots doux
//                     cursifs) qui scintillent discrètement et s'écrivent toutes seules (encre.ts) ;
//   plume           — des paillettes suivent la pointe qui écrit la page, une bouffée quand elle a fini ;
//   photos vivantes — photos.ts.
//
// Rien ne se mesure pendant un geste (le DOM est lu au repos). En pause : onglet caché, geste de loupe. Mouvement
// réduit : pas de trajectoires rapides (scintillements sur place, poussière lente, ornements en fondu,
// ni pas, ni reflets, ni photos qui bougent). Contexte WebGL perdu : la toile s'efface (Magie.tsx).

import type { MotionValue } from '../../lib/motion';
import { loupeOccupee, abonnerLoupe, LOUPE_EVENT } from '../../lib/loupe';
import { ecouterPointeur, lirePointeur } from '../../lib/pointeur';
import { abonnerFlambee, feu } from '../../lib/feu';
import { assetUrl } from '../../lib/assets';
import { angles, bordProjete, hauteurBord, reculCouverture, clamp, CARTON, PERSPECTIVE, PERSPECTIVE_COUVERTURE } from '../Livre/geometrie';
import { GESTE_EVENT, TOUCHER_EVENT, type GesteDetail, type ToucherPage } from '../Livre/evenements';
import { PAGES_CUITES } from '../PageCuite';
import { abonnerEcriture, ecouterPlume, plumeOccupee, type EvenementPlume } from '../PageCuite/encreVivante';
import { facteurAnimations } from '../../lib/vitesse';
import bougieJson from '../Bougie/geometrie.json';
import { GENRE, IMAGE, POINT, SCENE_H, SCENE_W, TRAIT, delier, lier, programmes, texture } from './gl';
import { Grains, ORS, point, unOr, type Rvb } from './particules';
import { Poussiere, type Pointeur } from './poussiere';
import {
  CARTE,
  GENRES_SECRETS,
  PAGE_H,
  PAGE_W,
  cachettesDe,
  encreDe,
  grille,
  grilleMaraudeurRecette,
  delaiMaraudeur,
  ornementsDe,
  paraphe,
  pointes,
  promenade,
  secretDe,
  secretSousPoint,
  trianguler,
  type Cachette,
  type CartePage,
  type Chemin,
  type GenreSecret,
  type Grille,
  type Ornement,
  type Pas,
  type SecretMarge,
  type TitreCarte,
} from './encre';
import { Photos, mesurerPhoto, type Vivante } from './photos';
import { Redessins } from './redessins';

export interface TourMagie { sens: 1 | -1; couverture: boolean; arriere?: boolean; but: 0 | 1 }
export interface RabatMagie { fx: MotionValue<number>; fy: MotionValue<number> }
export interface GeoMagie { W: number; H: number; bookX: number; bookY: number; stageW: number; stageH: number }

export interface LiensMagie {
  p: MotionValue<number>;
  tour: { readonly current: TourMagie | null };
  rabats: { readonly current: { gauche: RabatMagie; droite: RabatMagie } };
  livre: { readonly current: HTMLElement | null };
  zoom: { readonly current: number };
  geo: () => GeoMagie | null;
  reduit: () => boolean;
}

/** Vitesse des animations (1 = normale), réglée au menu. Elle ne touche que le pas de temps (image()). */
const vitesseAnimations = facteurAnimations;

/** Où brille la flamme de la bougie (px de scène de la scène, pas de la caméra). */
const FLAMME = { x: bougieJson.flamme.meche[0], y: bougieJson.flamme.meche[1] - 28 };
/** Les gestes qui font tourner une feuille (ou la remplacent) : la toile cache ce qui est posé sur la page. */
const TOURNE = new Set(['page', 'couverture', 'coin', 'riffle', 'fondu']);
const OR_TRAIT: Rvb = [1, 0.82, 0.44];
const OR_PARAPHE: [number, number, number] = [0.62, 0.42, 0.1];

interface PageVue {
  id: string;
  el: HTMLElement;
  x: number;
  y: number;
  w: number;
  h: number;
  /** px de scène par px de page. */
  s: number;
  cote: 'gauche' | 'droite';
  carte: CartePage | null;
  ecrite: boolean;
}

interface CachetteEtat extends Cachette {
  prochainIndice: number;
  prochainAuto: number;
  ouvertes: number;
}

interface EtatPage {
  grille: Grille | null;
  ornements: Ornement[] | null;
  tampon: WebGLBuffer | null;
  /** Premier sommet et nombre de sommets de chaque ornement dans le tampon. */
  plages: [number, number][];
  /** Début du tracé (horloge), ou null s'il n'a pas commencé ; fini : déjà tracé une fois (on le repose). */
  debut: number | null;
  fini: boolean;
  /** Réveil doré périodique des arabesques de coin (toutes les 5 à 10 s). */
  prochainEclatOrnement: number;
  eclatOrnement: { idx: number; t0: number; duree: number } | null;
  prochainReflet: number;
  reflets: Map<string, { tex: WebGLTexture | null; r: [number, number, number, number] } | 'charge'>;
  /** Cachettes secrètes dans les marges libres de la page. */
  cachettes: CachetteEtat[];
}

interface Paraphe { page: string; tampon: WebGLBuffer | null; n: number; chemins: Chemin[]; t0: number; duree: number; cle: string }
interface SecretActif {
  page: string;
  genre: GenreSecret;
  tampon: WebGLBuffer | null;
  n: number;
  chemins: Chemin[];
  t0: number;
  duree: number;
  maintien: number;
  couleur: [number, number, number];
  cle: string;
  x: number;
  y: number;
  salue: boolean;
}
interface Promenade { page: string; pas: (Pas & { t: number })[]; couleur: [number, number, number] }
interface Reflet { page: string; tex: WebGLTexture; r: [number, number, number, number]; t0: number; duree: number; etoiles: number }

export function demarrerMagie(toile: HTMLCanvasElement, L: LiensMagie): { arreter(): void } | null {
  const gl = toile.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const P = programmes(gl);
  if (!P) return null;
  const tactile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  // ---- Tampons --------------------------------------------------------------------------------------
  const MAX_POINTS = tactile ? 2600 : 5200;
  const points = new Float32Array(MAX_POINTS * POINT);
  const bPoints = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bPoints);
  gl.bufferData(gl.ARRAY_BUFFER, points.byteLength, gl.DYNAMIC_DRAW);
  const traitDyn = new Float32Array(6 * TRAIT * 2);
  const bTrait = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bTrait);
  gl.bufferData(gl.ARRAY_BUFFER, traitDyn.byteLength, gl.DYNAMIC_DRAW);
  const quadBuf = new Float32Array(6 * IMAGE);
  const bImage = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bImage);
  gl.bufferData(gl.ARRAY_BUFFER, quadBuf.byteLength, gl.DYNAMIC_DRAW);

  const grains = new Grains(tactile ? 620 : 1300);
  const poussiere = new Poussiere(tactile ? 55 : 120);
  const photos = new Photos(gl);
  const redessins = new Redessins(CARTE.pages, PAGE_W, PAGE_H);

  // ---- État -----------------------------------------------------------------------------------------
  let arrete = false;
  let raf = 0;
  let veille = 0;
  let avant = performance.now();
  let horloge = 0;
  let k = 1; // px de toile par px de scène
  let q = 1; // px d'écran par px de scène
  let cr = { left: 0, top: 0 };
  let pages: PageVue[] = [];
  const etats = new Map<string, EtatPage>();
  let calme = 0; // s depuis la fin du dernier geste
  let enGeste = false;
  const types = new Map<string, number>(); // gestes en cours (type → horloge du début)
  let dernierTour: TourMagie | null = null;
  let bordAvant: { x: number; y0: number; y1: number } | null = null;
  let reste = 0;
  let lueur = 0;
  let lueurBord: { x: number; y0: number; y1: number } | null = null;
  const apex: Record<'gauche' | 'droite', { x: number; y: number } | null> = { gauche: null, droite: null };
  let ouverture = false; // la couverture s'ouvre : gerbe plus généreuse
  let feuParti = false; // le feu d'artifice de cette ouverture est parti
  let opPose = 0; // opacité de ce qui est posé sur les pages (ornements, pas, paraphes, secrets)
  let poussiereVue = true;
  let cachee = false; // moteur en pause pendant le geste de loupe ; la toile reste visible
  let plume: (EvenementPlume & { derniere?: { x: number; y: number } }) | null = null;
  let paraphes: Paraphe[] = [];
  let secrets: SecretActif[] = [];
  let promenades: Promenade[] = [];
  // Délai initial court (2,5 à 5 s) pour la démo télé, puis répétition toutes les 7 à 13 s
  let prochainsPas = 2.5 + Math.random() * 2.5;
  let pagesDesPas = '';
  // Dessins secrets autonomes dans les marges toutes les 6 à 11 s
  let compteurSecret = 0;
  let reflet: Reflet | null = null;
  const aFaire: { t: number; f: () => void }[] = [];
  let ptr: Pointeur | null = null;
  let survolTitre: string | null = null;
  let mesureDue = 0.3;
  let vide = false;
  let endormi = false;
  const bouge = new Map<string, number>(); // gestes de caméra (arrivée, zoom…) : on ne mesure pas pendant
  const compte = { etincelles: 0, bords: 0, secrets: 0, pas: 0 }; // débogage

  const versScene = (x: number, y: number): [number, number] => [(x - cr.left) / q, (y - cr.top) / q];
  const reduit = () => L.reduit();
  const plusTard = (dans: number, f: () => void) => aFaire.push({ t: horloge + dans, f });
  // getBoundingClientRect et les pointeurs utilisent les px CSS du viewport de mise en page.
  // Un pincement natif n'en change pas la projection : il recadre cette surface via visualViewport.
  const cadreVisible = () => {
    const v = window.visualViewport;
    return v ? { x: v.offsetLeft, y: v.offsetTop, w: v.width, h: v.height }
      : { x: 0, y: 0, w: innerWidth, h: innerHeight };
  };

  // ---- Mesures (au repos seulement) ------------------------------------------------------------------
  function mesurer(): void {
    const r = toile.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    q = r.width / SCENE_W;
    cr = { left: r.left, top: r.top };
    const dpr = Math.min(2, (window.devicePixelRatio || 1) * (window.visualViewport?.scale || 1));
    const budget = tactile ? 1.6e6 : 2.4e6;
    k = Math.min(q * dpr, Math.sqrt(budget / (SCENE_W * SCENE_H)));
    const w = Math.max(1, Math.round(SCENE_W * k));
    const h = Math.max(1, Math.round(SCENE_H * k));
    if (Math.abs(toile.width - w) > 2 || Math.abs(toile.height - h) > 2) { toile.width = w; toile.height = h; }
    k = toile.width / SCENE_W;
    // sur un petit écran la scène est très réduite (téléphone couché : q ≈ 0,36) : l'or l'est moins ; une
    // télévision se regarde de loin : l'or y est un peu grossi aussi
    grains.grossir = poussiere.grossir = clamp((0.98 / q) ** 0.7, 1.32, 2.2);
    // la flamme : dans la scène (hors caméra), ramenée dans le repère de la toile
    const scene = toile.closest('.gc-stage') as HTMLElement | null;
    if (scene && scene.offsetWidth > 0) {
      const sr = scene.getBoundingClientRect();
      const [fx, fy] = versScene(sr.left + (FLAMME.x * sr.width) / scene.offsetWidth, sr.top + (FLAMME.y * sr.height) / scene.offsetHeight);
      poussiere.fx = fx;
      poussiere.fy = fy;
      // la lumière de la bougie est-elle à l'écran ?
      const ex = sr.left + (FLAMME.x * sr.width) / scene.offsetWidth;
      const ey = sr.top + (FLAMME.y * sr.height) / scene.offsetHeight;
      const R = 430 * q;
      const cadre = cadreVisible();
      poussiereVue = ex + R > cadre.x && ex - R < cadre.x + cadre.w && ey + R > cadre.y && ey - R < cadre.y + cadre.h;
    }
    const livre = L.livre.current;
    if (!livre) return;
    const vues: PageVue[] = [];
    livre.querySelectorAll<HTMLElement>('.gc-livre__emplacement .gc-livre__page--visible [data-gc-page-cuite]').forEach((el) => {
      if (el.getAttribute('data-gc-page-type') === 'feuillet') return;
      const id = el.getAttribute('data-gc-page-cuite') || '';
      const b = el.getBoundingClientRect();
      if (!(b.width > 0)) return;
      const [x, y] = versScene(b.left, b.top);
      const wv = b.width / q;
      vues.push({
        id, el, x, y, w: wv, h: b.height / q, s: wv / PAGE_W,
        cote: el.closest('.gc-livre__emplacement--gauche') ? 'gauche' : 'droite',
        carte: CARTE.pages[id] ?? null,
        ecrite: el.getAttribute('data-gc-ecrit') !== 'a-ecrire',
      });
    });
    pages = vues;
    const pagesActuelles = vues.map((v) => v.id).join('|');
    if (pagesActuelles !== pagesDesPas) {
      pagesDesPas = pagesActuelles;
      // Chaque nouvelle recette accueille sa propre promenade, sans attendre le délai de la précédente.
      prochainsPas = horloge + 2.5 + Math.random() * 1.5;
    }
    for (const v of vues) preparerPage(v);
    const vivantes: Vivante[] = [];
    livre.querySelectorAll<HTMLElement>('.gc-livre__emplacement .gc-livre__page--visible [data-gc-objet="tirage"], .gc-livre__emplacement .gc-livre__page--visible [data-gc-objet="photo"]').forEach((el) => {
      const v = mesurerPhoto(el, versScene, q, k);
      if (v) vivantes.push(v);
    });
    photos.poser(vivantes);
  }

  function etatDe(id: string): EtatPage {
    let e = etats.get(id);
    if (!e) {
      e = {
        grille: null,
        ornements: null,
        tampon: null,
        plages: [],
        debut: null,
        fini: false,
        prochainEclatOrnement: 0,
        eclatOrnement: null,
        prochainReflet: 0,
        reflets: new Map(),
        cachettes: [],
      };
      etats.set(id, e);
    }
    return e;
  }

  /** Une page visible et écrite : ses ornements et ses cachettes secrètes se préparent. */
  function preparerPage(v: PageVue): void {
    if (!v.carte) return;
    const e = etatDe(v.id);
    if (!e.grille) e.grille = grille(v.carte, PAGES_CUITES.pages[v.id]);
    if (!e.ornements) {
      e.ornements = ornementsDe(v.id, v.carte, e.grille, v.cote);
      const parts = e.ornements.map((o) => trianguler(o.chemins, o.largeur));
      const tout = new Float32Array(parts.reduce((s, a) => s + a.length, 0));
      let o = 0;
      e.plages = parts.map((a) => {
        tout.set(a, o);
        const pl: [number, number] = [o / TRAIT, a.length / TRAIT];
        o += a.length;
        return pl;
      });
      if (tout.length) {
        e.tampon = gl!.createBuffer();
        gl!.bindBuffer(gl!.ARRAY_BUFFER, e.tampon);
        gl!.bufferData(gl!.ARRAY_BUFFER, tout, gl!.STATIC_DRAW);
      }
      e.cachettes = cachettesDe(v.id, v.carte, e.grille, v.cote, e.ornements).map((c, idx) => ({
        ...c,
        prochainIndice: horloge + 0.9 + idx * 0.85 + Math.random() * 0.9,
        prochainAuto: horloge + 10 + idx * 2.2 + Math.random() * 4.5,
        ouvertes: 0,
      }));
    }
    if (v.ecrite && e.debut == null && e.ornements.length) {
      // déjà tracés à une visite précédente : ils sont là ; sinon, ils s'écrivent peu après la page
      e.debut = e.fini || reduit() ? -1e3 : horloge + 0.55 + (v.cote === 'droite' ? 0.35 : 0);
      e.prochainEclatOrnement = horloge + 5 + Math.random() * 4.5;
    }
    if (v.ecrite && !e.prochainReflet) {
      e.prochainReflet = horloge + 1.8 + Math.random() * 2.5;
      for (const t of v.carte.titres) chargerReflet(v.id, e, t);
    }
  }

  // ---- Géométrie du geste ----------------------------------------------------------------------------
  /** Le bord libre de la feuille (ou du carton) qui tourne, projeté : x et étendue verticale (px de scène). */
  function bordLibre(T: TourMagie, pv: number, g: GeoMagie): { x: number; y0: number; y1: number } {
    const cx = g.stageW / 2;
    const cy = g.stageH / 2;
    const dos = g.bookX + g.W;
    if (T.couverture || T.arriere) {
      const t = clamp(pv, 0, 1);
      const a = -Math.PI * t;
      const Lc = g.W + CARTON.out;
      const X = dos + Lc * Math.cos(a);
      const Z = Lc * Math.sin(-a) + CARTON.epaisseur * (1 - t);
      const D = PERSPECTIVE_COUVERTURE * g.W;
      const f = D / (D - Math.min(Z, D * 0.9));
      const x = cx + (X - cx) * f;
      const y0 = cy + (g.bookY - CARTON.haut - cy) * f;
      const y1 = cy + (g.bookY + g.H + CARTON.bas - cy) * f;
      // mouvement de caméra de l'ouverture (Livre : livreT), autour du centre du livre
      const dx = (T.couverture ? -0.25 * (1 - t) : 0.25 * t) * 2 * g.W;
      const kz = reculCouverture(pv, g.W, g.H, L.zoom.current);
      const ox = g.bookX + g.W;
      const oy = g.bookY + g.H / 2;
      return { x: ox + dx + kz * (x - ox), y0: oy + kz * (y0 - oy), y1: oy + kz * (y1 - oy) };
    }
    const a = angles(pv, T.sens);
    const X = dos + bordProjete(a) * g.W;
    const Z = hauteurBord(a) * g.W;
    const D = PERSPECTIVE * g.W;
    const f = D / (D - Math.min(Z, D * 0.9));
    return { x: cx + (X - cx) * f, y0: cy + (g.bookY - cy) * f, y1: cy + (g.bookY + g.H - cy) * f };
  }

  // ---- Les gerbes ------------------------------------------------------------------------------------
  function etincelle(x: number, y: number, vx: number, vy: number, gros = 1): void {
    compte.etincelles++;
    const etoile = Math.random() < 0.14;
    grains.ajouter({
      x, y, vx, vy,
      vie: 0.72 + Math.random() * 1.0,
      taille: (etoile ? 17 + Math.random() * 14 : 4.5 + Math.random() * 7) * gros,
      grav: 38, frein: 2.1, etoile, trainee: !etoile && Math.random() < 0.55,
      ondule: Math.random() < 0.3 ? 16 : 0, lum: 0.8 + Math.random() * 0.5,
    });
  }

  function gerbeDuBord(b: { x: number; y0: number; y1: number }, avant_: { x: number }, dt: number): void {
    compte.bords++;
    const dx = b.x - avant_.x;
    const ad = Math.abs(dx);
    lueur = Math.min(1, Math.max(lueur, ad / Math.max(1e-3, dt) / 1500));
    lueurBord = b;
    if (ad < 0.3) return;
    const dens = (tactile ? 0.22 : 0.34) * (ouverture ? 2.1 : 1);
    reste += ad * dens;
    const n = Math.min(tactile ? 26 : 48, Math.floor(reste));
    reste -= Math.floor(reste);
    const v = dx / Math.max(1e-3, dt);
    for (let i = 0; i < n; i++) {
      // un peu partout sur la hauteur du bord, plus dense vers le milieu
      const u = 0.5 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.62;
      const y = b.y0 + (b.y1 - b.y0) * clamp(u, 0, 1);
      const x = avant_.x + dx * Math.random();
      etincelle(x, y, v * (0.06 + 0.14 * Math.random()) + (Math.random() - 0.5) * 60, (Math.random() - 0.62) * 80, ouverture ? 1.15 : 1);
    }
    // le sillage : une poussière d'or fine qui reste un instant en l'air derrière le bord, et ondoie
    const nd = Math.min(tactile ? 12 : 24, Math.round(ad * (tactile ? 0.13 : 0.2) * (ouverture ? 1.6 : 1)));
    for (let i = 0; i < nd; i++) {
      grains.ajouter({
        x: avant_.x + dx * Math.random(), y: b.y0 + (b.y1 - b.y0) * Math.random(),
        vx: v * 0.03 + (Math.random() - 0.5) * 24, vy: -8 - Math.random() * 22,
        vie: 0.9 + Math.random() * 1.1, taille: 2.6 + Math.random() * 2.6, frein: 2.4, grav: -5, ondule: 9, lum: 0.5 + Math.random() * 0.35,
      });
    }
  }

  function gerbeDuCoin(g: GeoMagie, dt: number): void {
    for (const c of ['gauche', 'droite'] as const) {
      const R = L.rabats.current[c];
      const fx = R.fx.get();
      const fy = R.fy.get();
      if (!(fx > 0 || fy > 0)) { apex[c] = null; continue; }
      const x = c === 'droite' ? g.bookX + g.W + fx : g.bookX + g.W - fx;
      const y = g.bookY + fy;
      const a = apex[c];
      apex[c] = { x, y };
      if (!a) continue;
      const d = Math.hypot(x - a.x, y - a.y);
      if (d < 0.25 || d > g.W * 0.25) continue;
      const n = Math.min(14, Math.round(d * (tactile ? 0.2 : 0.32) + Math.random()));
      const vx = (x - a.x) / Math.max(1e-3, dt);
      const vy = (y - a.y) / Math.max(1e-3, dt);
      for (let i = 0; i < n; i++) {
        etincelle(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, vx * 0.12 + (Math.random() - 0.5) * 70, vy * 0.12 + (Math.random() - 0.7) * 70, 0.9);
      }
    }
  }

  /** La feuille se pose : une bouffée de poussière d'or s'échappe de dessous, vers l'extérieur. */
  function bouffeeDePose(b: { x: number; y0: number; y1: number }, g: GeoMagie): void {
    const sens = b.x < g.bookX + g.W ? -1 : 1;
    const n = tactile ? 16 : 28;
    for (let i = 0; i < n; i++) {
      const y = b.y0 + (b.y1 - b.y0) * Math.random();
      grains.ajouter({
        x: b.x + sens * Math.random() * 6, y,
        vx: sens * (50 + Math.random() * 140), vy: -15 - Math.random() * 35,
        vie: 0.5 + Math.random() * 0.7, taille: 3.4 + Math.random() * 4.2, frein: 2.6, grav: 20, trainee: true, lum: 0.85,
      });
    }
  }

  /** Un petit feu d'artifice d'or, sobre : trois fusées montent du livre qui s'ouvre et éclatent en étoile au-dessus. */
  function feuDArtifice(g: GeoMagie): void {
    feuParti = true;
    const centres: [number, number, number][] = [
      [g.bookX + g.W * 0.55, g.bookY + g.H * 0.3, 0],
      [g.bookX + g.W * 1.45, g.bookY + g.H * 0.26, 0.32],
      [g.bookX + g.W, g.bookY + g.H * 0.12, 0.62],
    ];
    const MONTEE = 0.38; // s : la fusée monte du pli du livre
    for (const [cx, cy, quand] of centres) {
      const x0 = g.bookX + g.W + (cx - g.bookX - g.W) * 0.25;
      const y0 = g.bookY + g.H * 0.78;
      const pas = tactile ? 7 : 11;
      for (let j = 0; j <= pas; j++) {
        const u = j / pas;
        const e = 1 - (1 - u) * (1 - u);
        plusTard(quand + u * MONTEE, () => {
          if (reduit()) return;
          const x = x0 + (cx - x0) * e;
          const y = y0 + (cy - y0) * e;
          grains.ajouter({ x, y, vie: 0.22, taille: 12, couleur: ORS[3], lum: 0.9, frein: 0 });
          grains.ajouter({ x: x + (Math.random() - 0.5) * 4, y, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 30, vie: 0.5 + Math.random() * 0.4, taille: 3.5 + Math.random() * 2.5, grav: 60, frein: 2, lum: 0.85 });
        });
      }
      plusTard(quand + MONTEE, () => {
        if (reduit()) return;
        grains.ajouter({ x: cx, y: cy, vie: 0.5, taille: 150, couleur: ORS[3], lum: 0.7, frein: 0 });
        grains.ajouter({ x: cx, y: cy, vie: 0.8, taille: 60, etoile: true, enveloppe: 1, couleur: ORS[3], frein: 0, lum: 1 });
        const n = tactile ? 44 : 80;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.15;
          const v = 260 + Math.random() * 190;
          grains.ajouter({
            x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30,
            vie: 1.6 + Math.random() * 0.9, taille: 6 + Math.random() * 5, grav: 80, frein: 1.3, trainee: true,
            couleur: unOr(Math.random() * 0.8), lum: 1.1,
          });
        }
        plusTard(0.55, () => {
          for (let i = 0; i < (tactile ? 14 : 26); i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * 170;
            grains.ajouter({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.8 + 30, vy: 22 + Math.random() * 18, vie: 1.5 + Math.random() * 1.1, taille: 3.5 + Math.random() * 3, grav: 10, frein: 1, ondule: 20, lum: 0.9 });
          }
        });
        plusTard(0.8, () => {
          for (let i = 0; i < (tactile ? 8 : 15); i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 90 + Math.random() * 140;
            grains.ajouter({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r + 50, vy: 18, vie: 0.45 + Math.random() * 0.45, taille: 14 + Math.random() * 10, etoile: true, enveloppe: 1, frein: 1, lum: 0.95 });
          }
        });
      });
    }
  }

  /** Mouvement réduit : quelques étoiles qui s'allument et s'éteignent sur place, sur le livre. */
  function scintillement(g: GeoMagie, n: number): void {
    for (let i = 0; i < n; i++) {
      grains.ajouter({
        x: g.bookX + Math.random() * g.W * 2, y: g.bookY + Math.random() * g.H,
        vie: 1.2 + Math.random() * 1.2, taille: 9 + Math.random() * 9, etoile: true, enveloppe: 1, frein: 0, lum: 0.7,
      });
    }
  }

  function bouffee(x: number, y: number, n: number, force = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (35 + Math.random() * 85) * force;
      grains.ajouter({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, vie: 0.45 + Math.random() * 0.5, taille: 3.6 + Math.random() * 4.2, frein: 3, grav: 15, lum: 0.92 });
    }
    grains.ajouter({ x, y, vie: 0.65, taille: 20 + 7 * force, etoile: true, enveloppe: 1, frein: 0, lum: 0.95 });
  }

  /** Gerbe d'or vive quand une cachette secrète s'ouvre. */
  function gerbeCachette(x: number, y: number): void {
    if (reduit()) {
      grains.ajouter({ x, y, vie: 1.0, taille: 22, etoile: true, enveloppe: 1, frein: 0, lum: 0.9 });
      return;
    }
    const n = tactile ? 16 : 26;
    grains.ajouter({ x, y, vie: 0.42, taille: 70, couleur: ORS[3], lum: 0.55, frein: 0 });
    grains.ajouter({ x, y, vie: 0.75, taille: 32, etoile: true, enveloppe: 1, couleur: ORS[3], frein: 0, lum: 1.0 });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const v = 55 + Math.random() * 135;
      grains.ajouter({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 28,
        vie: 0.65 + Math.random() * 0.65,
        taille: 4 + Math.random() * 4.5,
        grav: 45,
        frein: 2.2,
        etoile: i % 4 === 0,
        trainee: i % 2 === 0,
        couleur: unOr(),
        lum: 1.0,
      });
    }
  }

  // ---- Les titres : paraphe et reflet --------------------------------------------------------------
  const sceneDe = (v: PageVue, x: number, y: number): [number, number] => [v.x + x * v.s, v.y + y * v.s];

  function titreSous(x: number, y: number): { v: PageVue; t: TitreCarte } | null {
    for (const v of pages) {
      if (!v.carte || !v.ecrite) continue;
      for (const t of v.carte.titres) {
        const [a, b] = sceneDe(v, t.r[0] - 6, t.r[1] - 6);
        const [c, d] = sceneDe(v, t.r[2] + 6, t.r[3] + 6);
        if (x >= a && x <= c && y >= b && y <= d) return { v, t };
      }
    }
    return null;
  }

  function lancerParaphe(v: PageVue, t: TitreCarte): void {
    const cle = `${v.id}|${t.bloc}`;
    if (paraphes.some((p) => p.cle === cle)) return;
    const chemins = paraphe(t.r, Math.floor(horloge * 10) % 97 + 1);
    const tri = trianguler(chemins, 2.4);
    const tampon = gl!.createBuffer();
    gl!.bindBuffer(gl!.ARRAY_BUFFER, tampon);
    gl!.bufferData(gl!.ARRAY_BUFFER, tri, gl!.STATIC_DRAW);
    paraphes.push({ page: v.id, tampon, n: tri.length / TRAIT, chemins, t0: horloge, duree: reduit() ? 0.01 : 0.95, cle });
  }

  /** L'encre d'un titre (encre 1×, recadrée) : le masque de son reflet doré. */
  function chargerReflet(id: string, e: EtatPage, t: TitreCarte): void {
    if (e.reflets.has(t.bloc)) return;
    const nom = PAGES_CUITES.pages[id]?.encre1x ?? PAGES_CUITES.pages[id]?.encre;
    if (!nom) return;
    e.reflets.set(t.bloc, 'charge');
    const im = new Image();
    im.onload = () => {
      if (arrete) return;
      const sx = im.naturalWidth / PAGE_W;
      const r: [number, number, number, number] = [t.r[0] - 8, t.r[1] - 8, t.r[2] + 8, t.r[3] + 8];
      const c = document.createElement('canvas');
      c.width = Math.max(4, Math.round(r[2] - r[0]));
      c.height = Math.max(4, Math.round(r[3] - r[1]));
      c.getContext('2d')?.drawImage(im, r[0] * sx, r[1] * sx, (r[2] - r[0]) * sx, (r[3] - r[1]) * sx, 0, 0, c.width, c.height);
      e.reflets.set(t.bloc, { tex: texture(gl!, c), r });
    };
    im.onerror = () => e.reflets.delete(t.bloc);
    im.src = assetUrl(nom);
  }

  function lancerReflet(v: PageVue, e: EtatPage, auHasard = true): TitreCarte | null {
    const prets = (v.carte?.titres ?? []).filter((t) => { const r = e.reflets.get(t.bloc); return r && r !== 'charge' && r.tex; });
    if (!prets.length) return null;
    prets.sort((a, b) => (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]) - (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]));
    const t = !auHasard || Math.random() < 0.65 ? prets[0] : prets[Math.floor(Math.random() * prets.length)];
    const r = e.reflets.get(t.bloc) as { tex: WebGLTexture; r: [number, number, number, number] };
    reflet = { page: v.id, tex: r.tex, r: r.r, t0: horloge, duree: 1.85, etoiles: 0 };
    return t;
  }

  // ---- Les cachettes secrètes & clins d'œil dans les marges ----------------------------------------
  function genreSecretSuivant(): GenreSecret {
    const g = GENRES_SECRETS[compteurSecret % GENRES_SECRETS.length];
    compteurSecret++;
    return g;
  }

  function activerSecret(v: PageVue, sec: SecretMarge, cle: string): boolean {
    if (secrets.some((s) => s.cle === cle || (s.page === v.id && Math.hypot(s.x - sec.x, s.y - sec.y) < 90))) return false;
    const tri = trianguler(sec.chemins, sec.largeur);
    if (!tri.length) return false;
    const tampon = gl!.createBuffer();
    gl!.bindBuffer(gl!.ARRAY_BUFFER, tampon);
    gl!.bufferData(gl!.ARRAY_BUFFER, tri, gl!.STATIC_DRAW);
    compte.secrets++;
    secrets.push({
      page: v.id,
      genre: sec.genre,
      tampon,
      n: tri.length / TRAIT,
      chemins: sec.chemins,
      t0: horloge,
      duree: reduit() ? 0.05 : sec.duree,
      maintien: 3.8,
      couleur: sec.couleur,
      cle,
      x: sec.x,
      y: sec.y,
      salue: false,
    });
    return true;
  }

  /** Ouvre une cachette : gerbe d'or, tracé du dessin/mot secret à la plume d'or, et départ de petits pas/pattes ! */
  function ouvrirCachette(v: PageVue, c: CachetteEtat, genreForce?: GenreSecret): boolean {
    if (!v.carte) return false;
    const genre = genreForce ?? GENRES_SECRETS[(GENRES_SECRETS.indexOf(c.genre) + c.ouvertes) % GENRES_SECRETS.length];
    const sec = secretDe(genre, c.x, c.y, c.echelle, v.carte);
    if (!activerSecret(v, sec, `${c.id}|${c.ouvertes}`)) return false;
    c.ouvertes++;
    c.prochainAuto = horloge + 11 + Math.random() * 4;
    c.prochainIndice = horloge + 6.5 + Math.random() * 2;
    const [sx, sy] = sceneDe(v, c.x, c.y);
    gerbeCachette(sx, sy);
    lancerPromenade(v, { x: c.x, y: c.y, pattesSeules: c.ouvertes % 2 === 1 });
    return true;
  }

  /** Lance un clin d'œil autonome sur l'une des pages ouvertes (cachette non touchée ou marge libre). */
  function lancerSecretAutonome(genreForce?: GenreSecret): SecretActif | null {
    const candidates = pages.filter((v) => v.carte && v.ecrite && pageALEcran(v));
    if (!candidates.length) return null;
    // Priorité aux cachettes qui attendent depuis 10–15 s
    for (const v of candidates) {
      const e = etatDe(v.id);
      for (const c of e.cachettes) {
        if (horloge >= c.prochainAuto || genreForce) {
          if (ouvrirCachette(v, c, genreForce)) return secrets[secrets.length - 1] ?? null;
        }
      }
    }
    // Sinon, choisit une cachette libre sur une page visible
    const v = candidates[Math.floor(Math.random() * candidates.length)];
    const e = etatDe(v.id);
    if (e.cachettes.length) {
      const c = e.cachettes[compteurSecret % e.cachettes.length];
      if (ouvrirCachette(v, c, genreForce)) return secrets[secrets.length - 1] ?? null;
    }
    if (e.grille && v.carte) {
      const genre = genreForce ?? genreSecretSuivant();
      const sec = secretSousPoint(v.carte, e.grille, v.cote === 'gauche' ? 75 : PAGE_W - 75, 42, genre, e.ornements ?? []);
      if (sec && activerSecret(v, sec, `${v.id}|auto|${compteurSecret}`)) {
        const [sx, sy] = sceneDe(v, sec.x, sec.y);
        gerbeCachette(sx, sy);
        return secrets[secrets.length - 1] ?? null;
      }
    }
    return null;
  }

  // ---- Le maraudeur & les petites pattes -----------------------------------------------------------
  function lancerPromenade(vCible?: PageVue, depart?: { x: number; y: number; pattesSeules?: boolean }): boolean {
    const candidates = vCible ? [vCible] : pages.filter((v) => v.carte && v.ecrite && pageALEcran(v));
    if (!candidates.length) return false;
    const ordonnees = [...candidates].sort(() => Math.random() - 0.5);
    for (const v of ordonnees) {
      if (!v.carte) continue;
      const e = etatDe(v.id);
      if (!e.grille || promenades.some((p) => p.page === v.id)) continue;
      const papier = PAGES_CUITES.pages[v.id]?.recette ? grilleMaraudeurRecette(e.grille) : e.grille;
      const pas = promenade(papier, Math.random, depart);
      if (!pas) continue;
      compte.pas += pas.length;
      promenades.push({
        page: v.id,
        pas: pas.map((p, i) => ({ ...p, t: horloge + (p.dt ?? i * 0.34) })),
        couleur: encreDe(v.carte),
      });
      if (promenades.length > 3) promenades.shift();
      return true;
    }
    return false;
  }

  function pageALEcran(v: PageVue): boolean {
    const x0 = cr.left + v.x * q;
    const x1 = x0 + v.w * q;
    const y0 = cr.top + v.y * q;
    const y1 = y0 + v.h * q;
    const cadre = cadreVisible();
    return Math.min(x1, cadre.x + cadre.w) - Math.max(x0, cadre.x) > 0.35 * Math.min(x1 - x0, cadre.w)
      && Math.min(y1, cadre.y + cadre.h) - Math.max(y0, cadre.y) > 0.35 * Math.min(y1 - y0, cadre.h);
  }

  // ---- Écouteurs -----------------------------------------------------------------------------------
  const livre = L.livre.current;
  const onGeste = (ev: Event) => {
    const d = (ev as CustomEvent<GesteDetail>).detail;
    if (!d) return;
    reveiller();
    const g = L.geo();
    if (d.phase === 'debut' || d.phase === 'prepa') {
      redessins.suspendre();
      if (TOURNE.has(d.type)) types.set(d.type, horloge);
      else bouge.set(d.type, horloge);
      if (d.phase === 'debut' && d.type === 'couverture') {
        const T = L.tour.current;
        ouverture = !!T && T.couverture && T.but === 1;
        feuParti = false;
      }
      if (d.phase === 'debut' && d.type === 'fondu' && g && reduit()) scintillement(g, tactile ? 10 : 16);
      return;
    }
    // fin
    types.delete(d.type);
    bouge.delete(d.type);
    if ((d.type === 'page' || d.type === 'couverture') && g && dernierTour && !reduit()) {
      const pv = L.p.get();
      bouffeeDePose(bordLibre(dernierTour, pv, g), g);
      if (d.type === 'couverture' && dernierTour.couverture && pv > 0.97 && !feuParti) feuDArtifice(g);
    } else if (d.type === 'couverture' && g && reduit() && L.p.get() > 0.97) scintillement(g, tactile ? 12 : 20);
    if (d.type === 'couverture') ouverture = false;
    mesureDue = Math.min(mesureDue, 0.08);
  };
  const onToucher = (ev: Event) => {
    if (ev.defaultPrevented || cachee) return;
    const d = (ev as CustomEvent<ToucherPage>).detail;
    let v = d ? pages.find((x) => x.cote === (d.side === 'left' ? 'gauche' : 'droite')) : undefined;
    const ePtr = lirePointeur();
    let x: number;
    let y: number;
    if (v && d) [x, y] = [v.x + d.x * v.w, v.y + d.y * v.h];
    else if (ePtr) {
      [x, y] = versScene(ePtr.x, ePtr.y);
      v = pages.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
    } else return;
    reveiller();
    if (reduit()) grains.ajouter({ x, y, vie: 0.9, taille: 18, etoile: true, enveloppe: 1, frein: 0, lum: 0.8 });
    else bouffee(x, y, tactile ? 12 : 16);
    const ti = titreSous(x, y);
    if (ti) {
      lancerParaphe(ti.v, ti.t);
      return;
    }
    // Les découvertes appartiennent à la quête guidée : toucher le papier ne crée plus de motifs aléatoires.

  };
  const ecoutes: (() => void)[] = [];
  if (livre) {
    livre.addEventListener(GESTE_EVENT, onGeste);
    livre.addEventListener(TOUCHER_EVENT, onToucher);
    ecoutes.push(() => { livre.removeEventListener(GESTE_EVENT, onGeste); livre.removeEventListener(TOUCHER_EVENT, onToucher); });
  }
  ecoutes.push(ecouterPointeur((e) => {
    if (cachee) return;
    const [x, y] = versScene(e.x, e.y);
    ptr = { x, y, vx: e.vx / q, vy: e.vy / q, frais: 1 };
    if (poussiereVue) reveiller();
    // survol d'un titre (souris) : un paraphe d'or, une fois par passage
    if (e.type === 'mouse' && !enGeste && calme > 0.4) {
      const ti = titreSous(x, y);
      const cle = ti ? `${ti.v.id}|${ti.t.bloc}` : null;
      if (cle && cle !== survolTitre) { lancerParaphe(ti!.v, ti!.t); reveiller(); }
      survolTitre = cle;
    }
  }));
  ecoutes.push(abonnerFlambee((e) => {
    if (cachee) return;
    if (e.type === 'flambee') {
      poussiere.eclat = Math.max(poussiere.eclat, 0.4 + 0.6 * e.force);
      if (!reduit() && poussiereVue) {
        for (let i = 0; i < (tactile ? 4 : 8) * (0.5 + e.force); i++) {
          grains.ajouter({
            x: poussiere.fx + (Math.random() - 0.5) * 16, y: poussiere.fy - 10, vx: (Math.random() - 0.3) * 30, vy: -60 - Math.random() * 70,
            vie: 1.2 + Math.random() * 1.2, taille: 2.4 + Math.random() * 2.4, couleur: ORS[4], frein: 0.6, grav: -8, ondule: 22, lum: 0.9,
          });
        }
      }
    } else if (poussiereVue) {
      for (let i = 0; i < 3; i++) {
        grains.ajouter({ x: poussiere.fx + (Math.random() - 0.3) * 160, y: poussiere.fy - Math.random() * 200, vie: 0.5 + Math.random() * 0.4, taille: 9 + Math.random() * 7, etoile: true, enveloppe: 1, frein: 0, lum: 0.75 * (0.5 + e.force) });
      }
    }
    reveiller();
  }));
  ecoutes.push(ecouterPlume((e) => {
    if (e.phase === 'debut') { plume = { ...e }; reveiller(); return; }
    const fini = performance.now() - e.t0 >= e.duree * 0.97;
    const der = plume?.page === e.page ? plume.derniere : undefined;
    plume = null;
    if (fini && der && !reduit() && !cachee) bouffee(der.x, der.y, tactile ? 12 : 20, 0.8);
    mesureDue = Math.min(mesureDue, 0.15);
    reveiller();
  }));
  ecoutes.push(abonnerEcriture(() => { mesureDue = Math.min(mesureDue, 0.12); reveiller(); }));
  const surLoupe = () => {
    // La toile suit déjà la transformation CSS du livre. La cacher tant que z > 1 faisait
    // disparaître durablement l'encre et les pas après un zoom trackpad. Garder sa dernière image
    // pendant le geste, puis reprendre le moteur dans le repère remesuré.
    const c = loupeOccupee();
    if (c === cachee) return;
    cachee = c;
    if (c) { photos.eteindre(); grains.n = 0; redessins.suspendre(); }
    else { mesureDue = 0; avant = performance.now(); }
    reveiller();
  };
  ecoutes.push(abonnerLoupe(surLoupe));
  window.addEventListener(LOUPE_EVENT, surLoupe);
  ecoutes.push(() => window.removeEventListener(LOUPE_EVENT, surLoupe));
  const surVisibilite = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; clearTimeout(veille); photos.couperVideo(); } else { avant = performance.now(); reveiller(); }
  };
  document.addEventListener('visibilitychange', surVisibilite);
  ecoutes.push(() => document.removeEventListener('visibilitychange', surVisibilite));
  const surTaille = () => { mesureDue = Math.min(mesureDue, 0.2); reveiller(); };
  window.addEventListener('resize', surTaille);
  ecoutes.push(() => window.removeEventListener('resize', surTaille));
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', surTaille);
  viewport?.addEventListener('scroll', surTaille);
  ecoutes.push(() => { viewport?.removeEventListener('resize', surTaille); viewport?.removeEventListener('scroll', surTaille); });
  // Zoom navigateur et passage d'un écran Retina à un autre : le DPR peut changer sans resize.
  let mediaDpr: MediaQueryList | null = null;
  const surDpr = () => { surveillerDpr(); surTaille(); };
  function surveillerDpr(): void {
    mediaDpr?.removeEventListener('change', surDpr);
    mediaDpr = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mediaDpr.addEventListener('change', surDpr);
  }
  surveillerDpr();
  ecoutes.push(() => mediaDpr?.removeEventListener('change', surDpr));

  // ---- La boucle -----------------------------------------------------------------------------------
  function reveiller(): void {
    if (arrete || raf || document.hidden) return;
    clearTimeout(veille);
    veille = 0;
    raf = requestAnimationFrame(image);
  }

  function image(now: number): void {
    raf = 0;
    if (arrete || document.hidden) return;
    const T = L.tour.current;
    const livreEl = L.livre.current;
    const mouvement = !!T || !!livreEl?.hasAttribute('data-gc-geste') || types.size > 0;
    const brut = (now - avant) / 1000;
    const vif =
      mouvement ||
      grains.n > 0 ||
      !!plume ||
      paraphes.length > 0 ||
      secrets.length > 0 ||
      !!reflet ||
      promenades.length > 0 ||
      aFaire.length > 0 ||
      redessins.actif() ||
      ornementEnTrace();
    // 60 images/s quand ça bouge, 30 au calme (poussière, photos)
    if (!vif && brut < 1 / 31) { raf = requestAnimationFrame(image); return; }
    const dt = Math.min(endormi ? 0.3 : 0.05, Math.max(0, brut)) * vitesseAnimations();
    endormi = false;
    avant = now;
    horloge += dt;
    if (cachee) return;

    // gestes : sécurité, un type sans « fin » ne reste pas éternellement
    for (const [t, depuis] of types) if (horloge - depuis > 6) types.delete(t);
    for (const [t, depuis] of bouge) if (horloge - depuis > 6) bouge.delete(t);
    if (mouvement) {
      if (!enGeste) { photos.eteindre(); reflet = null; promenades = []; }
      enGeste = true;
      calme = 0;
    } else {
      if (enGeste) mesureDue = Math.min(mesureDue, 0.08);
      enGeste = false;
      calme += dt;
    }
    for (let i = aFaire.length - 1; i >= 0; i--) if (aFaire[i].t <= horloge) { const f = aFaire[i].f; aFaire.splice(i, 1); f(); }
    if (!mouvement && !bouge.size) {
      mesureDue -= dt;
      if (mesureDue <= 0) { mesurer(); mesureDue = 1.5; }
    }

    const g = L.geo();
    const lent = reduit();
    redessins.avancer(dt, pages.filter(pageALEcran), { repos: !mouvement && !plume && !plumeOccupee(), reduit: lent });
    if (g && !lent) {
      if (T) {
        dernierTour = { sens: T.sens, couverture: T.couverture, arriere: T.arriere, but: T.but };
        const pv = L.p.get();
        const b = bordLibre(T, pv, g);
        if (bordAvant) gerbeDuBord(b, bordAvant, dt);
        bordAvant = b;
        if (ouverture && !feuParti && T.couverture && pv > 0.82) { feuParti = true; feuDArtifice(g); }
      } else bordAvant = null;
      gerbeDuCoin(g, dt);
    }
    lueur = Math.max(0, lueur - dt * 3.5);
    if (!T) lueur = Math.max(0, lueur - dt * 6);

    // la plume qui écrit la page : des paillettes suivent sa pointe
    if (plume && !mouvement && !lent) {
      const v = pages.find((x) => x.id === plume!.page);
      const ch = v?.carte?.plume;
      if (v && ch && ch.length >= 6) {
        const tau = ((performance.now() - plume.t0) / plume.duree / 0.85) * 1000;
        let i = 3;
        while (i < ch.length - 3 && ch[i + 2] < tau) i += 3;
        const a = i - 3;
        const u = ch[i + 2] > ch[a + 2] ? clamp((tau - ch[a + 2]) / (ch[i + 2] - ch[a + 2]), 0, 1) : 0;
        if (tau <= 1000) {
          const [x, y] = sceneDe(v, ch[a] + (ch[i] - ch[a]) * u, ch[a + 1] + (ch[i + 1] - ch[a + 1]) * u);
          plume.derniere = { x, y };
          if (Math.random() < (tactile ? 0.5 : 0.85)) {
            grains.ajouter({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, vie: 0.5 + Math.random() * 0.5, taille: 2.4 + Math.random() * 2.8, frein: 1.5, grav: -6, ondule: 10, lum: 0.9 });
          }
          if (Math.random() < 0.07) grains.ajouter({ x, y, vie: 0.55, taille: 12 + Math.random() * 7, etoile: true, enveloppe: 1, frein: 0, lum: 0.85 });
        }
      }
    }

    // ce qui est posé sur les pages s'efface pendant un geste, revient au repos
    opPose = mouvement ? Math.max(0, opPose - dt * 9) : Math.min(1, opPose + dt * 2.2);

    // 1. Une piste humaine à la fois, plus régulière dans les marges des recettes.
    if (!mouvement && !lent && calme > 1.2 && !plume && !plumeOccupee() && horloge > prochainsPas && promenades.length === 0) {
      prochainsPas = horloge + delaiMaraudeur(pages.some((v) => !!PAGES_CUITES.pages[v.id]?.recette));
      lancerPromenade();
    }
    promenades = promenades.filter((pr) => {
      const der = pr.pas[pr.pas.length - 1];
      return der && horloge <= der.t + 4.5 && pages.some((v) => v.id === pr.page);
    });

    // 2. Étoiles d'indice sur les cachettes secrètes & déclenchement autonome (toutes les 6–11 s)
    if (!mouvement && !lent && calme > 1.0 && !plume && !plumeOccupee()) {
      for (const v of pages) {
        if (!v.ecrite) continue;
        const e = etats.get(v.id);
        if (!e) continue;
        // Réveil doré périodique des ornements de coin (toutes les 5 à 10 s)
        if (e.fini && e.ornements?.length && !e.eclatOrnement && horloge >= e.prochainEclatOrnement) {
          e.eclatOrnement = { idx: Math.floor(Math.random() * e.ornements.length), t0: horloge, duree: 2.0 };
          e.prochainEclatOrnement = horloge + 5 + Math.random() * 5;
        }
        if (e.eclatOrnement && horloge > e.eclatOrnement.t0 + e.eclatOrnement.duree) {
          e.eclatOrnement = null;
        }
      }
    }

    // 3. Reflets dorés sur les titres : toutes les 5 à 10 s
    if (!mouvement && !lent && calme > 1.0 && !reflet && !plume) {
      for (const v of pages) {
        const e = etats.get(v.id);
        if (v.ecrite && e?.prochainReflet && horloge > e.prochainReflet && v.carte?.titres.length) {
          e.prochainReflet = horloge + 5 + Math.random() * 5;
          lancerReflet(v, e);
          break;
        }
      }
    }
    if (reflet && horloge > reflet.t0 + reflet.duree) reflet = null;
    paraphes = paraphes.filter((p) => {
      const fin = horloge > p.t0 + 3.4 || !pages.some((v) => v.id === p.page);
      if (fin && p.tampon) gl!.deleteBuffer(p.tampon);
      return !fin;
    });
    secrets = secrets.filter((s) => {
      const fin = horloge > s.t0 + s.duree + s.maintien + 1.4 || !pages.some((v) => v.id === s.page);
      if (fin && s.tampon) gl!.deleteBuffer(s.tampon);
      return !fin;
    });

    // poussière, grains, photos
    if (ptr) ptr.frais = Math.max(0, ptr.frais - dt * 1.6);
    if (poussiereVue) poussiere.avancer(dt, horloge, ptr, lent);
    grains.avancer(dt);
    const photosVivantes = photos.avancer(dt, horloge, calme, lent, cachee || mouvement);

    // ---- dessin ----
    const ornementsVus = opPose > 0 && pages.some((v) => etats.get(v.id)?.debut != null && horloge >= (etats.get(v.id)!.debut ?? 0));
    const rien = !poussiereVue && grains.n === 0 && !photosVivantes && !ornementsVus && !paraphes.length && !secrets.length && !promenades.length && !reflet && lueur <= 0;
    if (rien && vide) { endormir(mouvement); return; }
    dessiner();
    vide = rien;

    const continuer = vif || poussiereVue || photosVivantes || mouvement;
    if (continuer) raf = requestAnimationFrame(image);
    else endormir(false);
  }

  /** Rien ne bouge : un coup d'œil tous les quarts de seconde (minuteries, mesures), sans dessiner. */
  function endormir(mouvement: boolean): void {
    if (mouvement) { raf = requestAnimationFrame(image); return; }
    endormi = true;
    clearTimeout(veille);
    veille = 0;
    veille = window.setTimeout(() => { veille = 0; if (!raf) raf = requestAnimationFrame(image); }, 250);
  }

  function ornementEnTrace(): boolean {
    for (const v of pages) {
      const e = etats.get(v.id);
      if (!e || e.debut == null) continue;
      if (!e.fini || e.eclatOrnement) return true;
    }
    return false;
  }

  // ---- Dessin --------------------------------------------------------------------------------------
  const quad = (c: number[], uv: number[] = [0, 0, 1, 0, 0, 1, 1, 1]) => {
    const idx = [0, 1, 2, 1, 3, 2];
    let o = 0;
    for (const i of idx) {
      quadBuf[o++] = c[i * 2]; quadBuf[o++] = c[i * 2 + 1]; quadBuf[o++] = uv[i * 2]; quadBuf[o++] = uv[i * 2 + 1];
    }
    gl!.bindBuffer(gl!.ARRAY_BUFFER, bImage);
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, quadBuf);
    gl!.drawArrays(gl!.TRIANGLES, 0, 6);
  };

  /** Ajoute une empreinte de patte de Jack Russell (coussinet bilobé + 4 petits doigts griffus) dans `points`. */
  function dessinerPatte(
    buf: Float32Array,
    o: number,
    x: number,
    y: number,
    s: number,
    cap: number,
    r: number,
    g: number,
    b: number,
    op: number,
  ): number {
    const ca = Math.cos(cap);
    const sa = Math.sin(cap);
    const nx = -sa;
    const ny = ca;
    const poser = (df: number, dl: number, taille: number, rot: number) => {
      o = point(buf, o, x + (ca * df + nx * dl) * s, y + (sa * df + ny * dl) * s, taille * s, GENRE.pas, r, g, b, op, rot);
    };
    // Coussinet central bilobé
    poser(-4.2, -1.9, 16.5, cap + Math.PI / 2 + 0.55);
    poser(-4.2, 1.9, 16.5, cap + Math.PI / 2 - 0.55);
    // Quatre petits doigts en éventail à l'avant (orientés pointe en avant)
    poser(1.8, -6.6, 13.0, cap - Math.PI / 2 - 0.44);
    poser(5.2, -2.4, 13.8, cap - Math.PI / 2 - 0.14);
    poser(5.2, 2.4, 13.8, cap - Math.PI / 2 + 0.14);
    poser(1.8, 6.6, 13.0, cap - Math.PI / 2 + 0.44);
    return o;
  }

  function dessiner(): void {
    const c = gl!;
    c.viewport(0, 0, toile.width, toile.height);
    c.clearColor(0, 0, 0, 0);
    c.clear(c.COLOR_BUFFER_BIT);
    c.enable(c.BLEND);
    c.blendFunc(c.ONE, c.ONE_MINUS_SRC_ALPHA);

    // 1. photos vivantes
    if (photos.vivantes.length) {
      const I = P!.images;
      c.useProgram(I.prog);
      c.uniform2f(I.unif.u_scene, SCENE_W, SCENE_H);
      c.uniform1i(I.unif.u_tex0, 0);
      c.uniform1i(I.unif.u_tex1, 1);
      c.uniform1i(I.unif.u_tex2, 2);
      lier(c, I, bImage, [['a_p', 2], ['a_uv', 2]]);
      photos.dessiner(horloge, I.unif, quad, ptr && ptr.frais > 0 ? ptr : null);
      delier(c, I);
    }

    // 2. ornements à la plume, paraphes et dessins secrets des marges
    const R = P!.traits;
    c.useProgram(R.prog);
    c.uniform2f(R.unif.u_scene, SCENE_W, SCENE_H);
    c.uniform1f(R.unif.u_k, k);
    c.uniform3f(R.unif.u_or, OR_TRAIT[0], OR_TRAIT[1], OR_TRAIT[2]);
    c.uniform1f(R.unif.u_lum, 0);
    if (opPose > 0) {
      for (const v of pages) {
        const e = etats.get(v.id);
        if (!e?.tampon || e.debut == null || !e.ornements) continue;
        const t = horloge - e.debut;
        if (t < 0) continue;
        c.uniform3f(R.unif.u_page, v.x, v.y, v.s);
        lier(c, R, e.tampon, [['a_p', 2], ['a_d', 3]]);
        let tous = true;
        e.ornements.forEach((o, i) => {
          const eo = e.eclatOrnement && e.eclatOrnement.idx === i ? e.eclatOrnement : null;
          const uEclat = eo ? (horloge - eo.t0) / eo.duree : -1;
          const u = e.fini || reduit() ? 1 + 10 / o.duree : t / o.duree;
          if (u < 1 + 3 / o.duree) tous = false;
          // la pointe d'or : des paillettes là où la plume trace (ou lors d'un réveil doré)
          const uPointe = !e.fini && u > 0 && u < 1 ? u : uEclat > 0 && uEclat < 1 ? uEclat : -1;
          if (uPointe > 0 && !reduit() && Math.random() < 0.78) {
            for (const p of pointes(o.chemins, uPointe)) {
              const [x, y] = sceneDe(v, p.x, p.y);
              grains.ajouter({
                x, y,
                vx: (Math.random() - 0.5) * 28,
                vy: -14 - Math.random() * 26,
                vie: 0.45 + Math.random() * 0.45,
                taille: 2.4 + Math.random() * 2.8,
                etoile: Math.random() < 0.18,
                enveloppe: 1,
                frein: 1.5,
                lum: 0.85,
              });
            }
          }
          c.uniform1f(R.unif.u_t, Math.max(0, u));
          c.uniform1f(R.unif.u_dur, o.duree);
          // Lors d'un réveil doré périodique, l'arabesque se teinte brièvement d'or chaud
          const orReveil = uEclat >= 0 && uEclat <= 1 ? Math.sin(Math.PI * uEclat) * 0.55 : 0;
          c.uniform1f(R.unif.u_sec, 1 - orReveil);
          c.uniform1f(R.unif.u_op, opPose * (e.fini || !reduit() ? 1 : clamp(t / 1.2, 0, 1)) * 0.9);
          c.uniform3f(R.unif.u_encre, o.couleur[0], o.couleur[1], o.couleur[2]);
          c.drawArrays(c.TRIANGLES, e.plages[i][0], e.plages[i][1]);
        });
        if (tous && !e.fini) e.fini = true;
      }
    }
    // Paraphes d'or sous les titres
    for (const p of paraphes) {
      const v = pages.find((x) => x.id === p.page);
      if (!v || !p.tampon) continue;
      const t = horloge - p.t0;
      const u = t / p.duree;
      if (u > 0 && u < 1 && !reduit()) {
        for (const pt of pointes(p.chemins, u)) {
          const [x, y] = sceneDe(v, pt.x, pt.y);
          for (let i = 0; i < 2; i++) etincelle(x, y, (Math.random() - 0.5) * 50, -20 - Math.random() * 40, 0.85);
        }
      }
      c.uniform3f(R.unif.u_page, v.x, v.y, v.s);
      lier(c, R, p.tampon, [['a_p', 2], ['a_d', 3]]);
      c.uniform1f(R.unif.u_t, u);
      c.uniform1f(R.unif.u_dur, p.duree);
      c.uniform1f(R.unif.u_sec, 1);
      const fondu = reduit() ? clamp(t / 0.6, 0, 1) : 1;
      c.uniform1f(R.unif.u_op, opPose * fondu * clamp((3.4 - t) / 1.2, 0, 1) * 0.95);
      c.uniform3f(R.unif.u_encre, OR_PARAPHE[0], OR_PARAPHE[1], OR_PARAPHE[2]);
      c.drawArrays(c.TRIANGLES, 0, p.n);
    }
    // Dessins et mots cursifs secrets dans les marges (plume d'or → sèche en encre brune → s'efface)
    for (const s of secrets) {
      const v = pages.find((x) => x.id === s.page);
      if (!v || !s.tampon) continue;
      const t = horloge - s.t0;
      const u = t / s.duree;
      if (u > 0 && u < 1 && !reduit()) {
        for (const pt of pointes(s.chemins, u)) {
          const [x, y] = sceneDe(v, pt.x, pt.y);
          if (Math.random() < 0.85) {
            grains.ajouter({
              x: x + (Math.random() - 0.5) * 5,
              y: y + (Math.random() - 0.5) * 5,
              vx: (Math.random() - 0.5) * 36,
              vy: -16 - Math.random() * 34,
              vie: 0.45 + Math.random() * 0.45,
              taille: 2.8 + Math.random() * 3.2,
              etoile: Math.random() < 0.22,
              enveloppe: 1,
              frein: 1.8,
              lum: 0.95,
            });
          }
        }
      } else if (u >= 1 && !s.salue) {
        s.salue = true;
        if (!reduit()) {
          const [sx, sy] = sceneDe(v, s.x, s.y);
          bouffee(sx, sy, tactile ? 8 : 12, 0.7);
        }
      }
      c.uniform3f(R.unif.u_page, v.x, v.y, v.s);
      lier(c, R, s.tampon, [['a_p', 2], ['a_d', 3]]);
      c.uniform1f(R.unif.u_t, Math.max(0, u));
      c.uniform1f(R.unif.u_dur, s.duree);
      c.uniform1f(R.unif.u_sec, 1);
      const fonduEntree = reduit() ? clamp(t / 0.5, 0, 1) : 1;
      const fonduSortie = clamp((s.duree + s.maintien + 1.4 - t) / 1.4, 0, 1);
      c.uniform1f(R.unif.u_op, opPose * fonduEntree * fonduSortie * 0.94);
      c.uniform3f(R.unif.u_encre, s.couleur[0], s.couleur[1], s.couleur[2]);
      c.drawArrays(c.TRIANGLES, 0, s.n);
    }

    // 3. lumière du bord libre (trait additif)
    if (lueur > 0.02 && lueurBord) {
      const b = lueurBord;
      const w = 7;
      const d = traitDyn;
      let o = 0;
      const v = (x: number, y: number, tr: number) => { d[o++] = x; d[o++] = y; d[o++] = tr; d[o++] = 0; d[o++] = w; };
      v(b.x - w, b.y0, -1); v(b.x + w, b.y0, 1); v(b.x - w, b.y1, -1);
      v(b.x + w, b.y0, 1); v(b.x + w, b.y1, 1); v(b.x - w, b.y1, -1);
      c.uniform3f(R.unif.u_page, 0, 0, 1);
      c.bindBuffer(c.ARRAY_BUFFER, bTrait);
      c.bufferSubData(c.ARRAY_BUFFER, 0, d.subarray(0, o));
      lier(c, R, bTrait, [['a_p', 2], ['a_d', 3]]);
      c.uniform1f(R.unif.u_lum, 1);
      c.uniform1f(R.unif.u_t, 1);
      c.uniform1f(R.unif.u_op, lueur * (ouverture ? 0.6 : 0.45));
      c.drawArrays(c.TRIANGLES, 0, 6);
      c.uniform1f(R.unif.u_lum, 0);
    }
    delier(c, R);

    // 4. reflet doré d'un titre (sur l'encre seule)
    if (reflet) {
      const v = pages.find((x) => x.id === reflet!.page);
      if (v) {
        const I = P!.images;
        c.useProgram(I.prog);
        c.uniform2f(I.unif.u_scene, SCENE_W, SCENE_H);
        c.uniform1i(I.unif.u_tex0, 0);
        lier(c, I, bImage, [['a_p', 2], ['a_uv', 2]]);
        c.activeTexture(c.TEXTURE0);
        c.bindTexture(c.TEXTURE_2D, reflet.tex);
        const r = reflet.r;
        const u = (horloge - reflet.t0) / reflet.duree;
        const ratio = (r[2] - r[0]) / Math.max(1, r[3] - r[1]);
        c.uniform1f(I.unif.u_mode, 2);
        c.uniform1f(I.unif.u_reflet, -0.25 + u * 1.5);
        c.uniform3f(I.unif.u_zoom, ratio, 2.3, 0);
        c.uniform1f(I.unif.u_op, Math.sin(Math.PI * clamp(u, 0, 1)) * opPose);
        c.uniform3f(I.unif.u_or, 1.15, 0.86, 0.42);
        c.uniform2f(I.unif.u_px, 1.8 / Math.max(8, r[2] - r[0]), 1.8 / Math.max(8, r[3] - r[1]));
        const [x0, y0] = sceneDe(v, r[0], r[1]);
        const [x1, y1] = sceneDe(v, r[2], r[3]);
        quad([x0, y0, x1, y0, x0, y1, x1, y1]);
        delier(c, I);
        // des étoiles plus généreuses s'allument sur le passage du reflet (lisibles à 3 m sur TV)
        if (reflet.etoiles < 8 && Math.random() < 0.28 && u > 0.08 && u < 0.92) {
          reflet.etoiles++;
          const xr = x0 + (x1 - x0) * clamp(-0.25 + u * 1.5, 0, 1);
          const yr = y0 + (y1 - y0) * (0.18 + Math.random() * 0.64);
          grains.ajouter({ x: xr, y: yr, vie: 0.65, taille: 15 + Math.random() * 10, etoile: true, enveloppe: 1, frein: 0, lum: 0.96 });
          grains.ajouter({ x: xr + (Math.random() - 0.5) * 12, y: yr, vx: (Math.random() - 0.5) * 20, vy: -14 - Math.random() * 20, vie: 0.55, taille: 3.2 + Math.random() * 2.5, frein: 1.6, lum: 0.85 });
        }
      }
    }

    // 5. points : pas du maraudeur & pattes de Jack Russell (encre), puis la lumière (poussière, étincelles)
    let n = 0;
    if (promenades.length && opPose > 0) {
      for (const pr of promenades) {
        const v = pages.find((x) => x.id === pr.page);
        if (!v) continue;
        for (const p of pr.pas) {
          const a = horloge - p.t;
          if (a < 0) continue;
          // le pas (ou la petite patte) apparaît dans un éclat d'or, reste bien lisible à 3 m, puis s'efface
          const op = Math.min(1, a / 0.16) * clamp(1 - (a - 2.8) / 1.6, 0, 1) * opPose * 0.88;
          if (op <= 0) continue;
          const or = Math.max(0, 1 - a / 0.52);
          const [x, y] = sceneDe(v, p.x, p.y);
          const col = pr.couleur;
          const r_ = col[0] * (1 - or) + 0.88 * or;
          const g_ = col[1] * (1 - or) + 0.64 * or;
          const b_ = col[2] * (1 - or) + 0.22 * or;
          if (p.patte) {
            n = dessinerPatte(points, n, x, y, v.s, p.cap, r_ * op, g_ * op, b_ * op, op);
          } else {
            n = point(points, n, x, y, 34 * v.s, GENRE.pas, r_ * op, g_ * op, b_ * op, op, p.cap + Math.PI / 2);
          }
          if (a < 0.05 && Math.random() < 0.55) grains.ajouter({ x, y, vie: 0.5, taille: 6.5, lum: 0.7, frein: 0 });
        }
      }
    }
    if (poussiereVue) n = poussiere.ecrire(points, n, horloge, feu().intensite.get(), 1);
    n = grains.ecrire(points, n, horloge);
    if (n > 0) {
      const Pp = P!.points;
      c.useProgram(Pp.prog);
      c.uniform2f(Pp.unif.u_scene, SCENE_W, SCENE_H);
      c.uniform1f(Pp.unif.u_k, k);
      c.uniform1f(Pp.unif.u_max, P!.maxPoint);
      c.bindBuffer(c.ARRAY_BUFFER, bPoints);
      c.bufferSubData(c.ARRAY_BUFFER, 0, points.subarray(0, n * POINT));
      lier(c, Pp, bPoints, [['a_p', 2], ['a_t', 1], ['a_g', 1], ['a_c', 4], ['a_r', 1]]);
      c.drawArrays(c.POINTS, 0, n);
      delier(c, Pp);
    }
  }

  // ---- Débogage (captures de vérification) ----------------------------------------------------------
  const ecranDe = (v: PageVue, t: TitreCarte) => {
    const [a, b] = sceneDe(v, t.r[0], t.r[1]);
    const [c, d] = sceneDe(v, t.r[2], t.r[3]);
    return { page: v.id, bloc: t.bloc, x: cr.left + a * q, y: cr.top + b * q, w: (c - a) * q, h: (d - b) * q };
  };
  const debug = {
    etat: () => ({
      k,
      q,
      pauseLoupe: cachee,
      dpr: window.devicePixelRatio,
      viewport: cadreVisible(),
      pages: pages.map((v) => ({
        id: v.id,
        ecrite: v.ecrite,
        orn: etats.get(v.id)?.ornements?.length ?? 0,
        cachettes: etats.get(v.id)?.cachettes.length ?? 0,
        fini: etats.get(v.id)?.fini,
      })),
      grains: grains.n,
      photos: photos.vivantes.length,
      redessins: redessins.etat(),
      secrets: secrets.map((s) => ({ page: s.page, genre: s.genre, x: s.x, y: s.y })),
      promenades: promenades.length,
      compte,
      bord: bordAvant,
      calme,
      enGeste,
      horloge,
      flamme: [poussiere.fx, poussiere.fy],
      poussiereVue,
      toile: [toile.width, toile.height],
    }),
    feuDArtifice: () => { const g = L.geo(); if (g) feuDArtifice(g); reveiller(); },
    pas: () => { const ok = lancerPromenade(); reveiller(); return ok; },
    pattes: () => { const ok = lancerPromenade(undefined, { x: PAGE_W / 2, y: PAGE_H / 2, pattesSeules: true }); reveiller(); return ok; },
    secret: (genre?: GenreSecret) => { const s = lancerSecretAutonome(genre); reveiller(); return s ? { page: s.page, genre: s.genre, x: s.x, y: s.y } : null; },
    cachettes: () => pages.flatMap((v) => (etats.get(v.id)?.cachettes ?? []).map((c) => {
      const [sx, sy] = sceneDe(v, c.x, c.y);
      return { page: v.id, id: c.id, genre: c.genre, x: cr.left + sx * q, y: cr.top + sy * q };
    })),
    // reflet() et paraphe() : sur le plus grand titre de la première page qui en a un ; rendent son rectangle
    reflet: () => { for (const v of pages) { const t = lancerReflet(v, etatDe(v.id), false); if (t) { reveiller(); return ecranDe(v, t); } } return null; },
    paraphe: () => { const v = pages.find((x) => x.carte?.titres.length); if (!v) return null; const t = v.carte!.titres[v.carte!.titres.length - 1]; lancerParaphe(v, t); reveiller(); return ecranDe(v, t); },
    titres: () => pages.flatMap((v) => (v.carte?.titres ?? []).map((t) => ecranDe(v, t))),
    ornements: () => { for (const v of pages) { const e = etatDe(v.id); e.fini = false; e.debut = horloge + 0.2; } reveiller(); },
    redessiner: () => { if (!reduit()) redessins.relancer(pages.filter(pageALEcran)); reveiller(); },
    mesurer: () => { mesurer(); reveiller(); },
  };
  (window as unknown as { __gcMagie?: typeof debug }).__gcMagie = debug;

  mesurer();
  mesureDue = 0.3;
  reveiller();

  return {
    arreter() {
      arrete = true;
      cancelAnimationFrame(raf);
      clearTimeout(veille);
      ecoutes.forEach((f) => f());
      photos.detruire();
      redessins.detruire();
      const w = window as unknown as { __gcMagie?: typeof debug };
      if (w.__gcMagie === debug) delete w.__gcMagie;
    },
  };
}
