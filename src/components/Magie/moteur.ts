// Le moteur de la magie : une seule toile WebGL par livre, dans le repère de la caméra (elle suit le zoom,
// l'ouverture, le glissement d'une page à l'autre), une seule boucle, un seul pas de temps.
//
//   gerbe d'or      — à chaque tour de page (doigt, clic, flèches, clavier, sommaire, Début / Fin,
//                     couverture) : des étincelles naissent le long du bord libre de la feuille, à la
//                     mesure de sa vitesse, avec un trait de lumière sur le bord ; au coin saisi, sous la
//                     main ; une bouffée quand la feuille se pose ; un petit feu d'artifice d'or quand la
//                     couverture s'ouvre ;
//   poussière d'or  — dans la lumière de la bougie (poussiere.ts) ;
//   titres          — un reflet doré passe de temps en temps sur l'encre des titres ; un paraphe d'or se
//                     dessine sous le titre qu'on touche ou qu'on survole ;
//   encre magique   — frises et ornements d'angle qui s'écrivent seuls quand la page a fini de s'écrire,
//                     puis restent ; les pas du maraudeur qui se promènent dans les marges (encre.ts) ;
//   plume           — des paillettes suivent la pointe qui écrit la page, une bouffée quand elle a fini ;
//   photos vivantes — photos.ts.
//
// Rien ne se mesure pendant un geste (le DOM est lu au repos). En pause : onglet caché, loupe. Mouvement
// réduit : pas de trajectoires rapides (scintillements sur place, poussière lente, ornements en fondu,
// ni pas, ni reflets, ni photos qui bougent). Contexte WebGL perdu : la toile s'efface (Magie.tsx).

import type { MotionValue } from '../../lib/motion';
import { getLoupe, loupeOccupee, abonnerLoupe, LOUPE_EVENT } from '../../lib/loupe';
import { ecouterPointeur, lirePointeur } from '../../lib/pointeur';
import { abonnerFlambee, feu } from '../../lib/feu';
import { assetUrl } from '../../lib/assets';
import { angles, bordProjete, hauteurBord, reculCouverture, clamp, CARTON, PERSPECTIVE, PERSPECTIVE_COUVERTURE } from '../Livre/geometrie';
import { GESTE_EVENT, TOUCHER_EVENT, type GesteDetail, type ToucherPage } from '../Livre/evenements';
import { PAGES_CUITES } from '../PageCuite';
import { abonnerEcriture, ecouterPlume, plumeOccupee, type EvenementPlume } from '../PageCuite/encreVivante';
import bougieJson from '../Bougie/geometrie.json';
import { GENRE, IMAGE, POINT, SCENE_H, SCENE_W, TRAIT, delier, lier, programmes, texture } from './gl';
import { Grains, ORS, point, unOr, type Rvb } from './particules';
import { Poussiere, type Pointeur } from './poussiere';
import { CARTE, PAGE_W, encreDe, grille, ornementsDe, paraphe, pointes, promenade, trianguler, type CartePage, type Chemin, type Grille, type Ornement, type Pas, type TitreCarte } from './encre';
import { Photos, mesurerPhoto, type Vivante } from './photos';

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

/** Vitesse des animations (1 = normale). Point d'accroche du réglage « vitesse des animations » : à la
 *  fusion, `facteurAnimations()` de lib/vitesse. Elle ne touche que le pas de temps (image()). */
const vitesseAnimations = (): number => 1;

/** Où brille la flamme de la bougie (px de scène de la scène, pas de la caméra). */
const FLAMME = { x: bougieJson.flamme.meche[0], y: bougieJson.flamme.meche[1] - 28 };
/** Les gestes qui font tourner une feuille (ou la remplacent) : la toile cache ce qui est posé sur la page. */
const TOURNE = new Set(['page', 'couverture', 'coin', 'riffle', 'fondu']);
const OR_TRAIT: Rvb = [1, 0.8, 0.42];
const OR_PARAPHE: [number, number, number] = [0.6, 0.4, 0.1];

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

interface EtatPage {
  grille: Grille | null;
  ornements: Ornement[] | null;
  tampon: WebGLBuffer | null;
  /** Premier sommet et nombre de sommets de chaque ornement dans le tampon. */
  plages: [number, number][];
  /** Début du tracé (horloge), ou null s'il n'a pas commencé ; fini : déjà tracé une fois (on le repose). */
  debut: number | null;
  fini: boolean;
  prochainReflet: number;
  reflets: Map<string, { tex: WebGLTexture | null; r: [number, number, number, number] } | 'charge'>;
}

interface Paraphe { page: string; tampon: WebGLBuffer | null; n: number; chemins: Chemin[]; t0: number; duree: number; cle: string }
interface Promenade { page: string; pas: (Pas & { t: number })[]; couleur: [number, number, number] }
interface Reflet { page: string; tex: WebGLTexture; r: [number, number, number, number]; t0: number; duree: number; etoiles: number }

export function demarrerMagie(toile: HTMLCanvasElement, L: LiensMagie): { arreter(): void } | null {
  const gl = toile.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const P = programmes(gl);
  if (!P) return null;
  const tactile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  // ---- Tampons --------------------------------------------------------------------------------------
  const MAX_POINTS = tactile ? 1400 : 2600;
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

  const grains = new Grains(tactile ? 520 : 1100);
  const poussiere = new Poussiere(tactile ? 46 : 90);
  const photos = new Photos(gl);

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
  let opPose = 0; // opacité de ce qui est posé sur les pages (ornements, pas, paraphes)
  let poussiereVue = true;
  let cachee = false; // loupe
  let plume: (EvenementPlume & { derniere?: { x: number; y: number } }) | null = null;
  let paraphes: Paraphe[] = [];
  let promenadeEnCours: Promenade | null = null;
  let prochainsPas = 18 + Math.random() * 14;
  let reflet: Reflet | null = null;
  const aFaire: { t: number; f: () => void }[] = [];
  let ptr: Pointeur | null = null;
  let survolTitre: string | null = null;
  let mesureDue = 0.3;
  let vide = false;
  let endormi = false;
  const bouge = new Map<string, number>(); // gestes de caméra (arrivée, zoom…) : on ne mesure pas pendant

  const versScene = (x: number, y: number): [number, number] => [(x - cr.left) / q, (y - cr.top) / q];
  const reduit = () => L.reduit();
  const plusTard = (dans: number, f: () => void) => aFaire.push({ t: horloge + dans, f });

  // ---- Mesures (au repos seulement) ------------------------------------------------------------------
  function mesurer(): void {
    const r = toile.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    q = r.width / SCENE_W;
    cr = { left: r.left, top: r.top };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const budget = tactile ? 1.6e6 : 2.4e6;
    k = Math.min(q * dpr, Math.sqrt(budget / (SCENE_W * SCENE_H)));
    const w = Math.max(1, Math.round(SCENE_W * k));
    const h = Math.max(1, Math.round(SCENE_H * k));
    if (Math.abs(toile.width - w) > 2 || Math.abs(toile.height - h) > 2) { toile.width = w; toile.height = h; }
    k = toile.width / SCENE_W;
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
      poussiereVue = ex + R > 0 && ex - R < innerWidth && ey + R > 0 && ey - R < innerHeight;
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
      e = { grille: null, ornements: null, tampon: null, plages: [], debut: null, fini: false, prochainReflet: 0, reflets: new Map() };
      etats.set(id, e);
    }
    return e;
  }

  /** Une page visible et écrite : ses ornements se préparent, puis s'écrivent (une fois par page). */
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
    }
    if (v.ecrite && e.debut == null && e.ornements.length) {
      // déjà tracés à une visite précédente : ils sont là ; sinon, ils s'écrivent un peu après la page
      e.debut = e.fini || reduit() ? -1e3 : horloge + 0.7 + (v.cote === 'droite' ? 0.4 : 0);
    }
    if (v.ecrite && !e.prochainReflet) {
      e.prochainReflet = horloge + 3 + Math.random() * 5;
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
    const etoile = Math.random() < 0.08;
    grains.ajouter({
      x, y, vx, vy,
      vie: 0.6 + Math.random() * 0.9,
      taille: (etoile ? 12 + Math.random() * 10 : 2.6 + Math.random() * 5.2) * gros,
      grav: 38, frein: 2.1, etoile, trainee: !etoile && Math.random() < 0.55,
      ondule: Math.random() < 0.3 ? 16 : 0, lum: 0.7 + Math.random() * 0.55,
    });
  }

  function gerbeDuBord(b: { x: number; y0: number; y1: number }, avant_: { x: number }, dt: number): void {
    const dx = b.x - avant_.x;
    const ad = Math.abs(dx);
    lueur = Math.min(1, Math.max(lueur, ad / Math.max(1e-3, dt) / 1500));
    lueurBord = b;
    if (ad < 0.3) return;
    const dens = (tactile ? 0.17 : 0.27) * (ouverture ? 2.3 : 1);
    reste += ad * dens;
    const n = Math.min(tactile ? 22 : 40, Math.floor(reste));
    reste -= Math.floor(reste);
    const v = dx / Math.max(1e-3, dt);
    for (let i = 0; i < n; i++) {
      // un peu partout sur la hauteur du bord, plus dense vers le milieu
      const u = 0.5 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.62;
      const y = b.y0 + (b.y1 - b.y0) * clamp(u, 0, 1);
      const x = avant_.x + dx * Math.random();
      etincelle(x, y, v * (0.06 + 0.14 * Math.random()) + (Math.random() - 0.5) * 60, (Math.random() - 0.62) * 80, ouverture ? 1.15 : 1);
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
        vie: 0.5 + Math.random() * 0.7, taille: 2.4 + Math.random() * 3.6, frein: 2.6, grav: 20, trainee: true, lum: 0.8,
      });
    }
  }

  /** Un petit feu d'artifice d'or, sobre : trois gerbes en étoile au-dessus du livre qui s'ouvre. */
  function feuDArtifice(g: GeoMagie): void {
    const centres: [number, number, number][] = [
      [g.bookX + g.W * 0.55, g.bookY + g.H * 0.3, 0],
      [g.bookX + g.W * 1.45, g.bookY + g.H * 0.26, 0.3],
      [g.bookX + g.W, g.bookY + g.H * 0.12, 0.58],
    ];
    for (const [cx, cy, quand] of centres) {
      plusTard(quand, () => {
        if (reduit()) return;
        grains.ajouter({ x: cx, y: cy, vie: 0.4, taille: 70, couleur: ORS[3], lum: 0.55, frein: 0 });
        const n = tactile ? 34 : 60;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
          const v = 150 + Math.random() * 110;
          grains.ajouter({
            x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30,
            vie: 1.1 + Math.random() * 0.7, taille: 2.8 + Math.random() * 3, grav: 110, frein: 1.7, trainee: true,
            couleur: unOr(Math.random() * 0.8), lum: 0.95,
          });
        }
        // crépitement : des étoiles qui s'allument là où la gerbe retombe
        plusTard(0.75, () => {
          for (let i = 0; i < (tactile ? 7 : 12); i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 70 + Math.random() * 110;
            grains.ajouter({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r + 40, vy: 18, vie: 0.45 + Math.random() * 0.4, taille: 10 + Math.random() * 8, etoile: true, enveloppe: 1, frein: 1, lum: 0.9 });
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
      grains.ajouter({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, vie: 0.45 + Math.random() * 0.5, taille: 2.4 + Math.random() * 3.4, frein: 3, grav: 15, lum: 0.9 });
    }
    grains.ajouter({ x, y, vie: 0.6, taille: 18 + 6 * force, etoile: true, enveloppe: 1, frein: 0, lum: 0.9 });
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
    const tri = trianguler(chemins, 2.2);
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
    // le plus grand titre, ou un autre de temps en temps
    const prets = (v.carte?.titres ?? []).filter((t) => { const r = e.reflets.get(t.bloc); return r && r !== 'charge' && r.tex; });
    if (!prets.length) return null;
    prets.sort((a, b) => (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]) - (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]));
    const t = !auHasard || Math.random() < 0.65 ? prets[0] : prets[Math.floor(Math.random() * prets.length)];
    const r = e.reflets.get(t.bloc) as { tex: WebGLTexture; r: [number, number, number, number] };
    reflet = { page: v.id, tex: r.tex, r: r.r, t0: horloge, duree: 1.7, etoiles: 0 };
    return t;
  }

  // ---- Le maraudeur --------------------------------------------------------------------------------
  function lancerPromenade(): boolean {
    const candidates = pages.filter((v) => v.carte && v.ecrite && pageALEcran(v));
    if (!candidates.length) return false;
    const v = candidates[Math.floor(Math.random() * candidates.length)];
    const e = etatDe(v.id);
    if (!e.grille) return false;
    const pas = promenade(e.grille);
    if (!pas) return false;
    promenadeEnCours = { page: v.id, pas: pas.map((p, i) => ({ ...p, t: horloge + i * 0.4 })), couleur: encreDe(v.carte!) };
    return true;
  }

  function pageALEcran(v: PageVue): boolean {
    const x0 = cr.left + v.x * q;
    const x1 = x0 + v.w * q;
    const y0 = cr.top + v.y * q;
    const y1 = y0 + v.h * q;
    return Math.min(x1, innerWidth) - Math.max(x0, 0) > 0.4 * (x1 - x0) && Math.min(y1, innerHeight) - Math.max(y0, 0) > 0.4 * (y1 - y0);
  }

  // ---- Écouteurs -----------------------------------------------------------------------------------
  const livre = L.livre.current;
  const onGeste = (ev: Event) => {
    const d = (ev as CustomEvent<GesteDetail>).detail;
    if (!d) return;
    reveiller();
    const g = L.geo();
    if (d.phase === 'debut' || d.phase === 'prepa') {
      if (TOURNE.has(d.type)) types.set(d.type, horloge);
      else bouge.set(d.type, horloge);
      if (d.phase === 'debut' && d.type === 'couverture') {
        const T = L.tour.current;
        ouverture = !!T && T.couverture && T.but === 1;
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
      if (d.type === 'couverture' && dernierTour.couverture && pv > 0.97) feuDArtifice(g);
    } else if (d.type === 'couverture' && g && reduit() && L.p.get() > 0.97) scintillement(g, tactile ? 12 : 20);
    if (d.type === 'couverture') ouverture = false;
    mesureDue = Math.min(mesureDue, 0.08);
  };
  const onToucher = (ev: Event) => {
    if (ev.defaultPrevented || cachee) return;
    const d = (ev as CustomEvent<ToucherPage>).detail;
    const v = d && pages.find((x) => x.cote === (d.side === 'left' ? 'gauche' : 'droite'));
    const e = lirePointeur();
    let x: number;
    let y: number;
    if (v) [x, y] = [v.x + d.x * v.w, v.y + d.y * v.h];
    else if (e) [x, y] = versScene(e.x, e.y);
    else return;
    reveiller();
    if (reduit()) grains.ajouter({ x, y, vie: 0.9, taille: 18, etoile: true, enveloppe: 1, frein: 0, lum: 0.8 });
    else bouffee(x, y, tactile ? 10 : 14);
    const ti = titreSous(x, y);
    if (ti) lancerParaphe(ti.v, ti.t);
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
    if (e.type === 'mouse' && !enGeste && calme > 0.5) {
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
        // des braises montent de la flamme
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
    const c = getLoupe().zoome || loupeOccupee();
    if (c === cachee) return;
    cachee = c;
    toile.style.visibility = c ? 'hidden' : '';
    if (c) { photos.eteindre(); grains.n = 0; } else mesureDue = 0.1;
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
    const vif = mouvement || grains.n > 0 || !!plume || paraphes.length > 0 || !!reflet || !!promenadeEnCours || aFaire.length > 0 || ornementEnTrace();
    // 60 images/s quand ça bouge, 30 au calme (poussière, photos)
    if (!vif && brut < 1 / 31) { raf = requestAnimationFrame(image); return; }
    // Le pas de temps de toute la magie, à un seul endroit : borné, pour qu'un retour d'onglet ou une
    // image lente ne fasse rien sauter, puis multiplié par la vitesse des animations.
    const dt = Math.min(endormi ? 0.3 : 0.05, Math.max(0, brut)) * vitesseAnimations();
    endormi = false;
    avant = now;
    horloge += dt;
    if (cachee) return;

    // gestes : sécurité, un type sans « fin » ne reste pas éternellement
    for (const [t, depuis] of types) if (horloge - depuis > 6) types.delete(t);
    for (const [t, depuis] of bouge) if (horloge - depuis > 6) bouge.delete(t);
    if (mouvement) {
      if (!enGeste) { photos.eteindre(); reflet = null; promenadeEnCours = null; }
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
    if (g && !lent) {
      if (T) {
        dernierTour = { sens: T.sens, couverture: T.couverture, arriere: T.arriere, but: T.but };
        const b = bordLibre(T, L.p.get(), g);
        if (bordAvant) gerbeDuBord(b, bordAvant, dt);
        bordAvant = b;
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
          if (Math.random() < (tactile ? 0.45 : 0.8)) {
            grains.ajouter({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, vie: 0.5 + Math.random() * 0.5, taille: 2.2 + Math.random() * 2.6, frein: 1.5, grav: -6, ondule: 10, lum: 0.85 });
          }
          if (Math.random() < 0.05) grains.ajouter({ x, y, vie: 0.5, taille: 11 + Math.random() * 6, etoile: true, enveloppe: 1, frein: 0, lum: 0.8 });
        }
      }
    }

    // ce qui est posé sur les pages s'efface pendant un geste, revient au repos
    opPose = mouvement ? Math.max(0, opPose - dt * 9) : Math.min(1, opPose + dt * 2.2);

    // le maraudeur et les reflets, au calme
    if (!mouvement && !lent && calme > 4 && !plume && !plumeOccupee() && horloge > prochainsPas && !promenadeEnCours) {
      prochainsPas = horloge + 25 + Math.random() * 20;
      lancerPromenade();
    }
    if (promenadeEnCours) {
      const der = promenadeEnCours.pas[promenadeEnCours.pas.length - 1];
      if (horloge > der.t + 4.2) promenadeEnCours = null;
    }
    if (!mouvement && !lent && calme > 1.5 && !reflet && !plume) {
      for (const v of pages) {
        const e = etats.get(v.id);
        if (v.ecrite && e?.prochainReflet && horloge > e.prochainReflet && v.carte?.titres.length) {
          e.prochainReflet = horloge + 8 + Math.random() * 8;
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

    // poussière, grains, photos
    if (ptr) ptr.frais = Math.max(0, ptr.frais - dt * 1.6);
    if (poussiereVue) poussiere.avancer(dt, horloge, ptr, lent);
    grains.avancer(dt);
    const photosVivantes = photos.avancer(dt, horloge, calme, lent, cachee || mouvement);

    // ---- dessin ----
    const ornementsVus = opPose > 0 && pages.some((v) => etats.get(v.id)?.debut != null && horloge >= (etats.get(v.id)!.debut ?? 0));
    const rien = !poussiereVue && grains.n === 0 && !photosVivantes && !ornementsVus && !paraphes.length && !promenadeEnCours && !reflet && lueur <= 0;
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
    veille = window.setTimeout(() => { veille = 0; if (!raf) raf = requestAnimationFrame(image); }, 250);
  }

  function ornementEnTrace(): boolean {
    for (const v of pages) {
      const e = etats.get(v.id);
      if (!e || e.debut == null || e.fini) continue;
      return true;
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

    // 2. ornements à la plume, paraphes
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
          const u = e.fini || reduit() ? 1 + 10 / o.duree : t / o.duree;
          if (u < 1 + 3 / o.duree) tous = false;
          // la pointe d'or : quelques paillettes là où la plume trace
          if (!e.fini && u > 0 && u < 1 && !reduit() && Math.random() < 0.6) {
            for (const p of pointes(o.chemins, u)) {
              const [x, y] = sceneDe(v, p.x, p.y);
              grains.ajouter({ x, y, vx: (Math.random() - 0.5) * 24, vy: -12 - Math.random() * 22, vie: 0.4 + Math.random() * 0.4, taille: 2 + Math.random() * 2.4, frein: 1.5, lum: 0.75 });
            }
          }
          c.uniform1f(R.unif.u_t, Math.max(0, u));
          c.uniform1f(R.unif.u_dur, o.duree);
          c.uniform1f(R.unif.u_sec, 1);
          c.uniform1f(R.unif.u_op, opPose * (e.fini || !reduit() ? 1 : clamp(t / 1.2, 0, 1)) * 0.85);
          c.uniform3f(R.unif.u_encre, o.couleur[0], o.couleur[1], o.couleur[2]);
          c.drawArrays(c.TRIANGLES, e.plages[i][0], e.plages[i][1]);
        });
        if (tous && !e.fini) e.fini = true;
      }
    }
    for (const p of paraphes) {
      const v = pages.find((x) => x.id === p.page);
      if (!v || !p.tampon) continue;
      const t = horloge - p.t0;
      const u = t / p.duree;
      if (u > 0 && u < 1 && !reduit()) {
        for (const pt of pointes(p.chemins, u)) {
          const [x, y] = sceneDe(v, pt.x, pt.y);
          for (let i = 0; i < 2; i++) etincelle(x, y, (Math.random() - 0.5) * 50, -20 - Math.random() * 40, 0.8);
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
      c.uniform1f(R.unif.u_op, lueur * (ouverture ? 0.42 : 0.3));
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
        c.uniform3f(I.unif.u_zoom, ratio, 2.6, 0);
        c.uniform1f(I.unif.u_op, Math.sin(Math.PI * clamp(u, 0, 1)) * opPose);
        c.uniform3f(I.unif.u_or, 1.05, 0.8, 0.38);
        c.uniform2f(I.unif.u_px, 1.6 / Math.max(8, r[2] - r[0]), 1.6 / Math.max(8, r[3] - r[1]));
        const [x0, y0] = sceneDe(v, r[0], r[1]);
        const [x1, y1] = sceneDe(v, r[2], r[3]);
        quad([x0, y0, x1, y0, x0, y1, x1, y1]);
        delier(c, I);
        // des étoiles s'allument sur le passage du reflet
        if (reflet.etoiles < 4 && Math.random() < 0.12 && u > 0.1 && u < 0.9) {
          reflet.etoiles++;
          const xr = x0 + (x1 - x0) * clamp(-0.25 + u * 1.5, 0, 1);
          grains.ajouter({ x: xr, y: y0 + (y1 - y0) * (0.2 + Math.random() * 0.5), vie: 0.55, taille: 12 + Math.random() * 8, etoile: true, enveloppe: 1, frein: 0, lum: 0.9 });
        }
      }
    }

    // 5. points : pas du maraudeur (encre), puis la lumière (poussière, étincelles)
    let n = 0;
    if (promenadeEnCours && opPose > 0) {
      const pr = promenadeEnCours;
      const v = pages.find((x) => x.id === pr.page);
      if (v) {
        for (const p of pr.pas) {
          const a = horloge - p.t;
          if (a < 0) break;
          // le pas apparaît (un éclat d'or), reste, puis s'efface
          const op = Math.min(1, a / 0.18) * clamp(1 - (a - 2.4) / 1.5, 0, 1) * opPose * 0.62;
          if (op <= 0) continue;
          const or = Math.max(0, 1 - a / 0.5);
          const [x, y] = sceneDe(v, p.x, p.y);
          const col = pr.couleur;
          const r_ = col[0] * (1 - or) + 0.85 * or;
          const g_ = col[1] * (1 - or) + 0.6 * or;
          const b_ = col[2] * (1 - or) + 0.2 * or;
          n = point(points, n, x, y, 21 * v.s, GENRE.pas, r_ * op, g_ * op, b_ * op, op, p.cap + Math.PI / 2);
          if (a < 0.05 && Math.random() < 0.5) grains.ajouter({ x, y, vie: 0.5, taille: 6, lum: 0.6, frein: 0 });
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
    etat: () => ({ k, q, pages: pages.map((v) => ({ id: v.id, ecrite: v.ecrite, orn: etats.get(v.id)?.ornements?.length ?? 0, fini: etats.get(v.id)?.fini })), grains: grains.n, photos: photos.vivantes.length, calme, enGeste, horloge, flamme: [poussiere.fx, poussiere.fy], poussiereVue, toile: [toile.width, toile.height] }),
    feuDArtifice: () => { const g = L.geo(); if (g) feuDArtifice(g); reveiller(); },
    pas: () => { const ok = lancerPromenade(); reveiller(); return ok; },
    // reflet() et paraphe() : sur le plus grand titre de la première page qui en a un ; rendent son rectangle
    reflet: () => { for (const v of pages) { const t = lancerReflet(v, etatDe(v.id), false); if (t) { reveiller(); return ecranDe(v, t); } } return null; },
    paraphe: () => { const v = pages.find((x) => x.carte?.titres.length); if (!v) return null; const t = v.carte!.titres[v.carte!.titres.length - 1]; lancerParaphe(v, t); reveiller(); return ecranDe(v, t); },
    titres: () => pages.flatMap((v) => (v.carte?.titres ?? []).map((t) => ecranDe(v, t))),
    ornements: () => { for (const v of pages) { const e = etatDe(v.id); e.fini = false; e.debut = horloge + 0.2; } reveiller(); },
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
      const w = window as unknown as { __gcMagie?: typeof debug };
      if (w.__gcMagie === debug) delete w.__gcMagie;
    },
  };
}
