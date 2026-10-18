// Grains de lumière : étincelles, étoiles qui scintillent, braises, poussière d'or. Un tableau par champ,
// recyclé (aucune allocation par image) ; chaque grain s'écrit dans le tampon des points (gl.ts : POINT).

import { GENRE, POINT } from './gl';

export type Rvb = readonly [number, number, number];

/** Les ors de la magie : vieil or, or chaud, or pâle, presque blanc, cuivre. */
export const ORS: readonly Rvb[] = [[1, 0.82, 0.46], [1, 0.74, 0.34], [1, 0.9, 0.62], [1, 0.96, 0.84], [0.98, 0.64, 0.28]];
export const unOr = (h = Math.random()): Rvb => ORS[Math.min(ORS.length - 1, Math.floor(h * ORS.length))];

export interface Grain {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Durée de vie (s). */
  vie: number;
  /** Taille (px de scène). */
  taille: number;
  couleur?: Rvb;
  /** Éclat (multiplie la couleur). */
  lum?: number;
  /** Pesanteur (px/s², + vers le bas) et freinage (1/s). */
  grav?: number;
  frein?: number;
  etoile?: boolean;
  /** Enveloppe : 0 = s'éteint peu à peu, 1 = s'allume puis s'éteint (scintillement). */
  enveloppe?: 0 | 1;
  /** Traînée : deux reflets en arrière sur la vitesse. */
  trainee?: boolean;
  /** Ondoiement latéral (px/s) : la braise qui monte, la paillette qui tombe en feuille morte. */
  ondule?: number;
}

export class Grains {
  readonly max: number;
  n = 0;
  /** Grossissement à l'écran (petit écran : la scène est réduite, les grains le sont moins). */
  grossir = 1;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private age: Float32Array;
  private vie: Float32Array;
  private taille: Float32Array;
  private r: Float32Array;
  private g: Float32Array;
  private b: Float32Array;
  private lum: Float32Array;
  private grav: Float32Array;
  private frein: Float32Array;
  private ondule: Float32Array;
  private phase: Float32Array;
  private drap: Uint8Array; // 1 étoile, 2 enveloppe, 4 traînée

  constructor(max: number) {
    this.max = max;
    const f = () => new Float32Array(max);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f(); this.age = f(); this.vie = f(); this.taille = f();
    this.r = f(); this.g = f(); this.b = f(); this.lum = f(); this.grav = f(); this.frein = f(); this.ondule = f(); this.phase = f();
    this.drap = new Uint8Array(max);
  }

  ajouter(o: Grain): void {
    let i = this.n;
    if (i >= this.max) {
      // plein : on remplace le plus vieux (relatif à sa vie)
      i = 0;
      let pire = -1;
      for (let k = 0; k < this.n; k += 7) {
        const u = this.age[k] / this.vie[k];
        if (u > pire) { pire = u; i = k; }
      }
    } else this.n++;
    const c = o.couleur ?? unOr();
    this.x[i] = o.x; this.y[i] = o.y; this.vx[i] = o.vx ?? 0; this.vy[i] = o.vy ?? 0;
    this.age[i] = 0; this.vie[i] = Math.max(0.05, o.vie); this.taille[i] = o.taille;
    const l = o.lum ?? 1;
    this.r[i] = c[0] * l; this.g[i] = c[1] * l; this.b[i] = c[2] * l; this.lum[i] = l;
    this.grav[i] = o.grav ?? 0; this.frein[i] = o.frein ?? 1.2; this.ondule[i] = o.ondule ?? 0;
    this.phase[i] = Math.random() * 6.283;
    this.drap[i] = (o.etoile ? 1 : 0) | (o.enveloppe ? 2 : 0) | (o.trainee ? 4 : 0);
  }

  /** Avance tout le monde de dt (s) ; les grains morts sont remplacés par le dernier. */
  avancer(dt: number): void {
    let i = 0;
    while (i < this.n) {
      const a = this.age[i] + dt;
      if (a >= this.vie[i]) {
        this.copier(this.n - 1, i);
        this.n--;
        continue;
      }
      this.age[i] = a;
      const k = Math.exp(-this.frein[i] * dt);
      this.vx[i] *= k;
      this.vy[i] = this.vy[i] * k + this.grav[i] * dt;
      const o = this.ondule[i];
      this.x[i] += (this.vx[i] + (o ? o * Math.sin(this.phase[i] + a * 5.3) : 0)) * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  private copier(de: number, a: number): void {
    if (de === a) return;
    this.x[a] = this.x[de]; this.y[a] = this.y[de]; this.vx[a] = this.vx[de]; this.vy[a] = this.vy[de];
    this.age[a] = this.age[de]; this.vie[a] = this.vie[de]; this.taille[a] = this.taille[de];
    this.r[a] = this.r[de]; this.g[a] = this.g[de]; this.b[a] = this.b[de]; this.lum[a] = this.lum[de];
    this.grav[a] = this.grav[de]; this.frein[a] = this.frein[de]; this.ondule[a] = this.ondule[de];
    this.phase[a] = this.phase[de]; this.drap[a] = this.drap[de];
  }

  /** Écrit les grains dans le tampon des points, à partir du point `o` ; renvoie le nouveau compte. */
  ecrire(buf: Float32Array, o: number, t: number, attenuation = 1): number {
    const cap = buf.length / POINT;
    for (let i = 0; i < this.n && o < cap; i++) {
      const u = this.age[i] / this.vie[i];
      const d = this.drap[i];
      // allumage très bref, puis extinction ; ou cloche (scintillement)
      let e = d & 2 ? Math.sin(Math.PI * u) : Math.min(1, u * 12) * Math.pow(1 - u, 1.4);
      e *= (0.78 + 0.22 * Math.sin(this.phase[i] + t * 17)) * attenuation;
      const etoile = d & 1;
      const s = this.taille[i] * this.grossir * (etoile ? 0.55 + 0.45 * e : 1);
      o = point(buf, o, this.x[i], this.y[i], s, etoile ? GENRE.etoile : GENRE.halo, this.r[i] * e, this.g[i] * e, this.b[i] * e, 0, 0);
      if (d & 4 && o < cap - 1) {
        const vx = this.vx[i];
        const vy = this.vy[i];
        if (vx * vx + vy * vy > 3600) {
          o = point(buf, o, this.x[i] - vx * 0.014, this.y[i] - vy * 0.014, s * 0.8, GENRE.halo, this.r[i] * e * 0.5, this.g[i] * e * 0.5, this.b[i] * e * 0.5, 0, 0);
          o = point(buf, o, this.x[i] - vx * 0.03, this.y[i] - vy * 0.03, s * 0.62, GENRE.halo, this.r[i] * e * 0.24, this.g[i] * e * 0.24, this.b[i] * e * 0.24, 0, 0);
        }
      }
    }
    return o;
  }
}

/** Écrit un point (prémultiplié) dans le tampon ; renvoie l'indice suivant. */
export function point(buf: Float32Array, i: number, x: number, y: number, taille: number, genre: number, r: number, g: number, b: number, a: number, rot: number): number {
  const k = i * POINT;
  if (k + POINT > buf.length) return i;
  buf[k] = x; buf[k + 1] = y; buf[k + 2] = taille; buf[k + 3] = genre;
  buf[k + 4] = r; buf[k + 5] = g; buf[k + 6] = b; buf[k + 7] = a; buf[k + 8] = rot;
  return i + 1;
}
