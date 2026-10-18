// Les créatures du carnet : papillons et coccinelles peints (planches anciennes du domaine public, détourées
// comme les aquarelles), qui vivent sur une double page. Elles arrivent du bord après la peinture, se posent
// sur une aquarelle ou sur le papier là où rien n'est écrit, s'envolent au passage de la main, au toucher ou
// d'elles-mêmes, et passent d'une page à l'autre par-dessus la reliure. La coccinelle marche, ouvre ses
// élytres et s'envole. Leur état vit ici, une fois par double page (essaimDe) ; chaque page dessine celles
// qui la survolent (vivante.ts). Coordonnées de la double page en unités de la hauteur d'une page :
// x de 0 à 2 × (largeur / hauteur), y de 0 à 1, vers le bas.

import { CREATURES } from './effets';

export interface Espece {
  genre: 'papillon' | 'coccinelle';
  /** Hauteur du dessin, en hauteur de page. */
  taille: number;
  /** Papillon : demi-largeur du corps (fraction de la largeur de l'image), qui ne se raccourcit pas. */
  corps?: number;
  /** Coccinelle : y de la jointure des élytres (fraction de la hauteur de l'image, la tête en haut). */
  epaules?: number;
}

/** Les espèces (aquarelles cuites du même nom, la tête vers le haut). */
export const ESPECES: Record<string, Espece> = {
  'papillon-paon': { genre: 'papillon', taille: 0.068, corps: 0.03 },
  'papillon-vulcain': { genre: 'papillon', taille: 0.074, corps: 0.03 },
  'papillon-bleu': { genre: 'papillon', taille: 0.08, corps: 0.045 },
  coccinelle: { genre: 'coccinelle', taille: 0.042, epaules: 0.3 },
};

type Cote = 'gauche' | 'droite';
type P = [number, number];

export interface Creature {
  espece: string;
  genre: Espece['genre'];
  taille: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Cap : 0 = la tête vers le haut, sens des aiguilles d'une montre (radians). */
  cap: number;
  /** Altitude : 0 posée, 1 en vol. */
  alt: number;
  etat: 'attente' | 'pose' | 'marche' | 'vol';
  /** Ouverture des ailes (papillon) ou des élytres (coccinelle), 0 à 1. */
  ouv: number;
  /** Phase du battement d'ailes (radians). */
  phase: number;
  minuteur: number;
  cible: P | null;
  /** Coccinelle : le coin où elle se promène. */
  maison: P;
  errance: number;
}

const hasard = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angleVers = (d: number) => Math.atan2(Math.sin(d), Math.cos(d));

export class Essaim {
  readonly especes: string[];
  creatures: Creature[] = [];
  /** La page qui fait avancer l'essaim (l'autre ne fait que dessiner). */
  maitre: Cote | null = null;
  private A = 0.885;
  private pages: Partial<Record<Cote, { perchoirs: P[]; libres: P[] }>> = {};
  private pointeur: { x: number; y: number; v: number; t: number } | null = null;
  private t = 0;

  constructor(especes: string[]) {
    this.especes = especes.filter((e) => ESPECES[e]);
    for (const e of this.especes) {
      const esp = ESPECES[e];
      this.creatures.push({
        espece: e,
        genre: esp.genre,
        taille: esp.taille,
        x: -1,
        y: 0.5,
        vx: 0,
        vy: 0,
        cap: 0,
        alt: 1,
        etat: 'attente',
        ouv: 0,
        phase: Math.random() * 6,
        // elles arrivent quand la page a fini de se peindre
        minuteur: hasard(6.5, 10) + this.creatures.length * 2.5,
        cible: null,
        maison: [0, 0],
        errance: Math.random() * 10,
      });
    }
  }

  /** Une page de la double page s'inscrit : ses perchoirs (fractions de la page) et ses cases libres. */
  attacher(cote: Cote, perchoirs: P[], encre: string | undefined, zones: [number, number, number, number][], A: number) {
    this.A = A;
    const dx = cote === 'droite' ? 1 : 0;
    const vers = ([x, y]: P): P => [(x + dx) * A, y];
    this.pages[cote] = { perchoirs: perchoirs.map(vers), libres: [] };
    if (!this.maitre) this.maitre = cote;
    if (encre) {
      casesLibres(encre, zones)
        .then((l) => {
          const p = this.pages[cote];
          if (p) p.libres = l.map(vers);
        })
        .catch(() => undefined);
    }
  }

  detacher(cote: Cote) {
    delete this.pages[cote];
    if (this.maitre === cote) this.maitre = this.pages.gauche ? 'gauche' : this.pages.droite ? 'droite' : null;
  }

  /** La main sur la page (fractions de la page), sa vitesse (hauteurs de page par seconde). */
  main(cote: Cote, px: number, py: number, vx: number, vy: number, type: string) {
    if (px < -0.05 || px > 1.05 || py < -0.05 || py > 1.05) return;
    void type;
    this.pointeur = { x: (px + (cote === 'droite' ? 1 : 0)) * this.A, y: py, v: Math.hypot(vx, vy), t: performance.now() };
  }

  /** Un toucher sur la page : la créature touchée s'envole (true). */
  toucher(cote: Cote, px: number, py: number): boolean {
    const p: P = [(px + (cote === 'droite' ? 1 : 0)) * this.A, py];
    for (const c of this.creatures) {
      if (c.etat === 'attente') continue;
      if (dist([c.x, c.y], p) < Math.max(0.05, c.taille * 0.8)) {
        this.envol(c, p);
        return true;
      }
    }
    return false;
  }

  /** Une aquarelle se met à bouger : ce qui est posé dessus s'envole. */
  effrayer(cote: Cote, px: number, py: number, r: number) {
    const p: P = [(px + (cote === 'droite' ? 1 : 0)) * this.A, py];
    for (const c of this.creatures) if ((c.etat === 'pose' || c.etat === 'marche') && dist([c.x, c.y], p) < r) this.envol(c, p);
  }

  private perchoirs(c: Creature): { p: P; poids: number }[] {
    const l: { p: P; poids: number }[] = [];
    for (const page of Object.values(this.pages)) {
      if (!page) continue;
      // la coccinelle préfère les aquarelles ; le papillon aussi, un peu moins
      for (const p of page.perchoirs) l.push({ p, poids: c.genre === 'coccinelle' ? 3 : 2 });
      for (const p of page.libres) l.push({ p, poids: 1 });
    }
    // pas deux créatures au même endroit
    return l.filter(({ p }) => this.creatures.every((o) => o === c || dist(p, o.cible ?? [o.x, o.y]) > 0.06));
  }

  private choisir(c: Creature, fuite?: P): P {
    let l = this.perchoirs(c).filter(({ p }) => dist(p, [c.x, c.y]) > 0.22);
    if (fuite) {
      const loin = l.filter(({ p }) => (p[0] - c.x) * (c.x - fuite[0]) + (p[1] - c.y) * (c.y - fuite[1]) > 0);
      if (loin.length) l = loin;
    }
    if (!l.length) return [hasard(0.15, 2 * this.A - 0.15), hasard(0.15, 0.85)];
    let total = l.reduce((s, x) => s + x.poids, 0) * Math.random();
    for (const x of l) if ((total -= x.poids) <= 0) return x.p;
    return l[l.length - 1].p;
  }

  private envol(c: Creature, fuite?: P) {
    if (c.etat === 'attente') return;
    c.cible = this.choisir(c, fuite);
    c.etat = 'vol';
    c.minuteur = 0;
    if (fuite) {
      // un bond pour s'écarter de la main
      const d = Math.max(0.01, dist([c.x, c.y], fuite));
      c.vx += ((c.x - fuite[0]) / d) * 0.25;
      c.vy += ((c.y - fuite[1]) / d) * 0.25 - 0.1;
    }
  }

  /** Avance l'essaim de dt secondes (le pas de temps vient de la page maîtresse, vivante.ts). */
  avancer(dt: number, douce: boolean) {
    if (dt <= 0) return;
    this.t += dt;
    const A2 = 2 * this.A;
    const p = this.pointeur && performance.now() - this.pointeur.t < 160 ? this.pointeur : null;
    for (const c of this.creatures) {
      if (c.etat === 'attente') {
        c.minuteur -= dt;
        if (c.minuteur > 0 || !this.maitre) continue;
        if (douce) {
          // version douce : elle est déjà là, posée
          const [x, y] = this.choisir(c);
          Object.assign(c, { x, y, alt: 0, etat: 'pose', minuteur: Infinity, cap: hasard(-0.6, 0.6) });
          continue;
        }
        // elle arrive par le bord de la page affichée
        const gauche = this.maitre === 'gauche';
        c.x = gauche ? -0.08 : A2 + 0.08;
        c.y = hasard(0.2, 0.8);
        c.vx = gauche ? 0.2 : -0.2;
        c.etat = 'vol';
        c.cible = this.choisir(c);
        continue;
      }
      if (c.genre === 'papillon') this.papillon(c, dt, p, douce);
      else this.coccinelle(c, dt, p, douce);
      c.x = Math.max(-0.1, Math.min(A2 + 0.1, c.x));
      c.y = Math.max(0.02, Math.min(0.98, c.y));
    }
  }

  private voler(c: Creature, dt: number, vitesse: number, errance: number) {
    const cible = c.cible ?? (c.cible = this.choisir(c));
    const dx = cible[0] - c.x;
    const dy = cible[1] - c.y;
    const d = Math.hypot(dx, dy);
    // elle ralentit en approchant, et zigzague en route (moins près du but)
    const v = vitesse * Math.min(1, Math.max(0.25, d / 0.14));
    const zig = errance * (0.7 * Math.sin(this.t * 1.3 + c.errance) + 0.35 * Math.sin(this.t * 3.7 + c.errance * 2)) * Math.min(1, d / 0.1);
    const ang = Math.atan2(dy, dx) + zig;
    const k = Math.min(1, dt * 3.2);
    c.vx += (Math.cos(ang) * v - c.vx) * k;
    c.vy += (Math.sin(ang) * v - c.vy) * k;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    // le cap suit la direction du vol
    if (Math.hypot(c.vx, c.vy) > 0.02) c.cap += angleVers(Math.atan2(c.vx, -c.vy) - c.cap) * Math.min(1, dt * 7);
    return d;
  }

  private papillon(c: Creature, dt: number, p: { x: number; y: number; v: number } | null, douce: boolean) {
    if (c.etat === 'vol') {
      const d = this.voler(c, dt, 0.32, 0.55);
      c.phase += dt * Math.PI * 2 * 7;
      c.ouv = 0.1 + 0.9 * (0.5 + 0.5 * Math.cos(c.phase));
      c.y += Math.cos(c.phase) * 0.05 * dt; // le vol sautillant
      c.alt = Math.min(1, c.alt + dt * 3);
      if (d < 0.012) {
        c.etat = 'pose';
        c.vx = c.vy = 0;
        c.minuteur = douce ? Infinity : hasard(5, 16);
        c.phase = 0;
      }
      return;
    }
    // posé : les ailes s'ouvrent et se ferment lentement, se referment parfois tout à fait
    c.alt = Math.max(0, c.alt - dt * 3);
    c.phase += dt * Math.PI * 2 * (douce ? 0.12 : 0.3);
    const lent = 0.5 + 0.5 * Math.cos(c.phase * 0.31);
    c.ouv = 0.55 + 0.45 * Math.cos(c.phase) * (0.4 + 0.6 * lent);
    c.minuteur -= dt;
    if (c.minuteur <= 0) this.envol(c);
    else if (!douce && p && p.v > 0.12 && dist([c.x, c.y], [p.x, p.y]) < 0.1) this.envol(c, [p.x, p.y]);
  }

  private coccinelle(c: Creature, dt: number, p: { x: number; y: number; v: number } | null, douce: boolean) {
    if (c.etat === 'vol') {
      // les élytres s'ouvrent d'abord, puis elle part tout droit, assez lourdement
      c.ouv = Math.min(1, c.ouv + dt * 3);
      c.alt = Math.min(1, c.alt + dt * 2.5);
      c.phase += dt * Math.PI * 2 * 15;
      if (c.ouv < 0.8) return;
      const d = this.voler(c, dt, 0.2, 0.18);
      if (d < 0.01) {
        c.etat = 'pose';
        c.vx = c.vy = 0;
        c.maison = [c.x, c.y];
        c.minuteur = hasard(1, 2.5);
      }
      return;
    }
    c.alt = Math.max(0, c.alt - dt * 3);
    c.ouv = Math.max(0, c.ouv - dt * 2.5);
    if (c.ouv > 0) return;
    c.minuteur -= dt;
    if (c.etat === 'marche') {
      // elle marche à petits pas, change de direction, revient vers son coin
      c.errance += dt;
      c.cap += (0.9 * Math.sin(c.errance * 0.9) + 0.5 * Math.sin(c.errance * 2.3)) * dt;
      const vers = Math.atan2(c.maison[0] - c.x, -(c.maison[1] - c.y));
      if (dist([c.x, c.y], c.maison) > 0.05) c.cap += angleVers(vers - c.cap) * Math.min(1, dt * 1.5);
      const v = douce ? 0.008 : 0.018;
      c.x += Math.sin(c.cap) * v * dt;
      c.y -= Math.cos(c.cap) * v * dt;
      if (c.minuteur <= 0) {
        c.etat = 'pose';
        c.minuteur = hasard(1.5, 4);
      }
    } else if (c.minuteur <= 0) {
      // repartir à pied, ou (parfois) s'envoler ailleurs
      if (!douce && Math.random() < 0.18) this.envol(c);
      else {
        c.etat = 'marche';
        c.minuteur = hasard(3, 8);
      }
    }
    if (!douce && p && p.v > 0.12 && dist([c.x, c.y], [p.x, p.y]) < 0.07) this.envol(c, [p.x, p.y]);
  }
}

const essaims = new Map<string, Essaim>();

/** L'essaim d'une double page (null : aucune créature sur cette double page). */
export function essaimDe(double: string): Essaim | null {
  const e = CREATURES[double];
  if (!e?.length) return null;
  let s = essaims.get(double);
  if (!s) essaims.set(double, (s = new Essaim(e)));
  return s;
}

/**
 * Les cases de papier libres d'une page (fractions de la page) : rien d'écrit autour, hors des zones
 * vivantes et des marges. Une douzaine, bien réparties.
 */
async function casesLibres(encre: string, zones: [number, number, number, number][]): Promise<P[]> {
  const im = new Image();
  im.decoding = 'async';
  im.src = encre;
  await im.decode();
  const W = 48;
  const H = 54;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  if (!cx) return [];
  cx.drawImage(im, 0, 0, W, H);
  const a = cx.getImageData(0, 0, W, H).data;
  const plein = (i: number, j: number) => i < 0 || j < 0 || i >= W || j >= H || a[(j * W + i) * 4 + 3] > 12;
  const libres: P[] = [];
  for (let j = 4; j < H - 4; j++) {
    for (let i = 3; i < W - 3; i++) {
      let ok = true;
      for (let dj = -2; dj <= 2 && ok; dj++) for (let di = -2; di <= 2 && ok; di++) if (plein(i + di, j + dj)) ok = false;
      if (!ok) continue;
      const x = (i + 0.5) / W;
      const y = (j + 0.5) / H;
      if (zones.some(([zx, zy, zw, zh]) => x > zx - 0.04 && x < zx + zw + 0.04 && y > zy - 0.04 && y < zy + zh + 0.04)) continue;
      libres.push([x, y]);
    }
  }
  // une douzaine, bien réparties (le plus loin des déjà choisies)
  const choisies: P[] = [];
  while (libres.length && choisies.length < 12) {
    let meilleur = 0;
    let dmax = -1;
    libres.forEach((p, k) => {
      const d = choisies.length ? Math.min(...choisies.map((q) => dist(p, q))) : Math.random();
      if (d > dmax) {
        dmax = d;
        meilleur = k;
      }
    });
    choisies.push(libres.splice(meilleur, 1)[0]);
  }
  return choisies;
}
