// Un compagnon terrestre par double page : il trottine dans un espace libre de la marge basse,
// s'arrête, dit quelques mots, puis repart. Aucun vol, perchoir ni passage au-dessus du contenu.
// Les coordonnées x/y sont en hauteurs de page ; y désigne le sol sous ses pattes.
import { CREATURES } from './effets';

type Cote = 'gauche' | 'droite';
type Zone = [number, number, number, number];
export interface Espece { genre: 'chien'; taille: number }
export const ESPECES: Record<string, Espece> = { 'jack-russell': { genre: 'chien', taille: 0.09 } };
export const PAROLES = ['Tea time!', 'Jolly good!'] as const;

export interface PisteLibre { x0: number; x1: number; sol: number }
interface Piste extends PisteLibre { cote: Cote }
export interface Creature {
  espece: string;
  genre: 'chien';
  taille: number;
  x: number;
  y: number;
  etat: 'attente' | 'pose' | 'marche';
  direction: 1 | -1;
  phase: number;
  minuteur: number;
  parole: string | null;
  bulle: number;
  opacite: number;
  piste: Piste | null;
}

/** Réserve le chien ET sa bulle. Une route entière doit rester libre, pas seulement ses extrémités. */
export function trouverPistes(alpha: Uint8ClampedArray, W: number, H: number, zones: Zone[], A: number): PisteLibre[] {
  const integral = new Uint32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y + 1) * (W + 1) + x + 1;
    integral[i] = Number(alpha[(y * W + x) * 4 + 3] > 10) + integral[i - 1] + integral[i - W - 1] - integral[i - W - 2];
  }
  const libre = (x: number, sol: number) => {
    const demi = 0.112 / A; // bulle de 0,20 hauteur de page, avec marge
    const x0 = x - demi, x1 = x + demi, y0 = sol - 0.17, y1 = sol + 0.006;
    if (x0 < 0.035 || x1 > 0.965 || y0 < 0 || y1 > 0.975) return false;
    if (zones.some(([zx, zy, zw, zh]) => x1 > zx - 0.012 && x0 < zx + zw + 0.012 && y1 > zy - 0.012 && y0 < zy + zh + 0.012)) return false;
    const a = Math.max(0, Math.floor(x0 * W)), b = Math.min(W, Math.ceil(x1 * W));
    const c = Math.max(0, Math.floor(y0 * H)), d = Math.min(H, Math.ceil(y1 * H));
    return integral[d * (W + 1) + b] - integral[d * (W + 1) + a] - integral[c * (W + 1) + b] + integral[c * (W + 1) + a] === 0;
  };
  const pistes: PisteLibre[] = [];
  for (const sol of [0.955, 0.915]) {
    let debut: number | null = null;
    let fin = 0;
    const finir = () => {
      if (debut !== null && fin - debut >= 0.12) pistes.push({ x0: debut, x1: fin, sol });
      debut = null;
    };
    for (let k = 0; k <= 50; k++) {
      const x = k / 50;
      if (libre(x, sol)) { if (debut === null) debut = x; fin = x; }
      else finir();
    }
    finir();
  }
  return pistes.sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
}

async function lirePistes(encre: string, zones: Zone[], A: number) {
  const im = new Image(); im.src = encre; await im.decode();
  const cv = document.createElement('canvas'); cv.width = 120; cv.height = 160;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(im, 0, 0, cv.width, cv.height);
  return trouverPistes(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, zones, A);
}

export class Promenade {
  readonly especes: string[];
  readonly creatures: Creature[];
  maitre: Cote | null = null;
  private A = 0.885;
  private pages: Partial<Record<Cote, { actif: boolean; pistes: Piste[] }>> = {};
  private phrase = 0;

  constructor(especes: string[]) {
    this.especes = especes.filter((e) => ESPECES[e]).slice(0, 1);
    this.creatures = this.especes.map((e) => ({
      espece: e, genre: 'chien', taille: ESPECES[e].taille, x: -1, y: 0.955,
      etat: 'attente', direction: 1, phase: 0, minuteur: 5, parole: null, bulle: 0, opacite: 0, piste: null,
    }));
  }

  attacher(cote: Cote, encre: string | undefined, zones: Zone[], A: number) {
    this.A = A;
    const page = { actif: false, pistes: [] as Piste[] };
    this.pages[cote] = page;
    // Sans carte fiable, on ne fait pas marcher le chien sur un contenu inconnu.
    if (!encre) return;
    lirePistes(encre, zones, A).then((pistes) => {
      if (this.pages[cote] !== page) return;
      const dx = cote === 'droite' ? A : 0;
      page.pistes = pistes.map((p) => ({ x0: p.x0 * A + dx, x1: p.x1 * A + dx, sol: p.sol, cote }));
    }).catch(() => undefined);
  }

  activer(cote: Cote, oui: boolean) {
    const p = this.pages[cote]; if (p) p.actif = oui;
    this.maitre = this.pages.gauche?.actif ? 'gauche' : this.pages.droite?.actif ? 'droite' : null;
  }

  detacher(cote: Cote) { delete this.pages[cote]; this.activer(cote, false); }

  private parler(c: Creature) {
    c.etat = 'pose'; c.minuteur = 3.8; c.parole = PAROLES[this.phrase++ % PAROLES.length]; c.bulle = 2.8;
  }

  toucher(cote: Cote, px: number, py: number): boolean {
    const x = (px + (cote === 'droite' ? 1 : 0)) * this.A;
    for (const c of this.creatures) {
      if (c.etat === 'attente' || Math.abs(c.x - x) > c.taille || py < c.y - c.taille - 0.02 || py > c.y + 0.02) continue;
      this.parler(c); return true;
    }
    return false;
  }

  avancer(dt: number, douce: boolean) {
    if (dt <= 0 || !this.maitre) return;
    for (const c of this.creatures) {
      if (c.piste && !this.pages[c.piste.cote]?.actif) {
        c.etat = 'attente'; c.piste = null; c.minuteur = 1.5; c.parole = null; c.opacite = 0;
      }
      if (c.etat === 'attente') {
        c.minuteur -= dt;
        if (c.minuteur > 0) continue;
        const pistes = Object.values(this.pages).flatMap((p) => p?.actif ? p.pistes : []);
        const piste = pistes.sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
        if (!piste) continue;
        c.piste = piste; c.x = piste.x0; c.y = piste.sol; c.direction = 1;
        c.etat = douce ? 'pose' : 'marche'; c.minuteur = douce ? Infinity : 0;
      }
      c.opacite = Math.min(1, c.opacite + dt * 2.5);
      c.bulle = Math.max(0, c.bulle - dt);
      if (c.bulle === 0) c.parole = null;
      if (douce) continue;
      if (c.etat === 'pose') {
        c.minuteur -= dt;
        if (c.minuteur <= 0) { c.direction = c.direction === 1 ? -1 : 1; c.etat = 'marche'; c.parole = null; }
      } else if (c.piste) {
        c.phase += dt * Math.PI * 2 * 2.2;
        c.x += c.direction * 0.052 * dt;
        if (c.x >= c.piste.x1 || c.x <= c.piste.x0) {
          c.x = Math.max(c.piste.x0, Math.min(c.piste.x1, c.x)); this.parler(c);
        }
      }
    }
  }
}

// Nom conservé pour l'interface des toiles ; le moteur est exclusivement terrestre.
export { Promenade as Essaim };
const promenades = new Map<string, Promenade>();
export function essaimDe(double: string): Promenade | null {
  const e = CREATURES[double]; if (!e?.length) return null;
  let p = promenades.get(double);
  if (!p) { p = new Promenade(e); promenades.set(double, p); }
  return p;
}
