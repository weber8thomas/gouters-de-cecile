// Poussière d'or dans la lumière de la bougie : des grains qui flottent au-dessus du livre et de la table,
// plus nombreux et plus clairs près de la flamme (coin bas gauche), qui montent dans sa chaleur. La main
// qui passe les fait tourbillonner ; une flambée du feu les avive et les soulève.

import { GENRE } from './gl';
import { point } from './particules';

/** Rayon de la lumière de la bougie (px de scène) : au-delà, un grain n'est presque plus éclairé. */
const PORTEE = 430;

export interface Pointeur {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Fraîcheur (1 : vient de bouger, 0 : immobile depuis longtemps). */
  frais: number;
}

export class Poussiere {
  private n: number;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private taille: Float32Array;
  private phase: Float32Array;
  private age: Float32Array;
  private vie: Float32Array;
  private flou: Uint8Array;
  /** Flamme (px de scène, dans le repère de la toile). */
  fx = 90;
  fy = 800;
  /** Éclat d'une flambée (0 à 1), qui retombe. */
  eclat = 0;
  /** Grossissement à l'écran (comme Grains.grossir). */
  grossir = 1;

  constructor(n: number) {
    this.n = n;
    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f(); this.taille = f(); this.phase = f(); this.age = f(); this.vie = f();
    this.flou = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.naitre(i, true);
  }

  /** Un grain naît dans la lumière : surtout près de la flamme, au-dessus et à droite d'elle. */
  private naitre(i: number, partout: boolean): void {
    const r = PORTEE * Math.pow(Math.random(), 0.75);
    // quart de disque tourné vers le livre : au-dessus de la flamme et à sa droite (coin bas gauche)
    const a = -Math.PI * 0.35 + (Math.random() - 0.5) * Math.PI * 0.86;
    this.x[i] = this.fx + Math.cos(a) * r + 30;
    this.y[i] = this.fy + Math.sin(a) * r * 0.9 - 20;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.flou[i] = Math.random() < 0.12 ? 1 : 0;
    this.taille[i] = this.flou[i] ? 10 + Math.random() * 9 : 4.6 + Math.random() * 5;
    this.phase[i] = Math.random() * 6.283;
    this.vie[i] = 14 + Math.random() * 22;
    this.age[i] = partout ? Math.random() * this.vie[i] : 0;
  }

  /**
   * dt (s), t (horloge), intensité du feu (≈ 0,6 à 1,6), pointeur (px de scène) ou null, lent : mouvement
   * réduit (dérive très lente, pas de tourbillon).
   */
  avancer(dt: number, t: number, p: Pointeur | null, lent: boolean): void {
    this.eclat = Math.max(0, this.eclat - dt * 0.9);
    const k = lent ? 0.3 : 1;
    const frein = Math.exp(-1.6 * dt);
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.vie[i]) { this.naitre(i, false); continue; }
      const x = this.x[i];
      const y = this.y[i];
      const dx = x - this.fx;
      const dy = y - this.fy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const pres = Math.max(0, 1 - d / PORTEE);
      // dérive : un petit champ tournant (sans divergence), et la chaleur qui monte près de la flamme
      const ph = this.phase[i];
      let ax = Math.sin(y * 0.011 + t * 0.21 + ph) * 7 + Math.cos(y * 0.005 - t * 0.13) * 4;
      let ay = Math.cos(x * 0.012 - t * 0.17 + ph) * 6 - (6 + 26 * pres * pres) - 30 * this.eclat * pres;
      if (p && p.frais > 0 && !lent) {
        const qx = x - p.x;
        const qy = y - p.y;
        const q2 = qx * qx + qy * qy;
        if (q2 < 160 * 160) {
          // tourbillon autour de la main, entraîné par sa vitesse
          const v = Math.min(1600, Math.hypot(p.vx, p.vy));
          const f = (1 - Math.sqrt(q2) / 160) * p.frais;
          const qn = Math.sqrt(q2) + 1;
          ax += (-qy / qn) * v * 0.9 * f + p.vx * 0.5 * f;
          ay += (qx / qn) * v * 0.9 * f + p.vy * 0.5 * f;
        }
      }
      this.vx[i] = this.vx[i] * frein + ax * dt * 1.6;
      this.vy[i] = this.vy[i] * frein + ay * dt * 1.6;
      this.x[i] += this.vx[i] * dt * k;
      this.y[i] += this.vy[i] * dt * k;
      if (d > PORTEE * 1.35) this.age[i] = Math.max(this.age[i], this.vie[i] - 1.2);
    }
  }

  /** Écrit la poussière éclairée dans le tampon des points. */
  ecrire(buf: Float32Array, o: number, t: number, intensite: number, attenuation: number): number {
    // au calme déjà, la poussière se voit dans la lumière (sur la table comme sur la page) ; une flambée l'avive
    const feu = Math.max(0.5, intensite) * (1.7 + 1.1 * this.eclat) * attenuation;
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - this.fx;
      const dy = this.y[i] - this.fy;
      const l = Math.exp(-(dx * dx + dy * dy) / (2 * 190 * 190)) * 0.85 + 0.12 * Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / PORTEE);
      const u = this.age[i] / this.vie[i];
      const vie = Math.min(1, u * 5, (1 - u) * 5);
      // un grain tourne sur lui-même : il accroche la lumière par éclairs
      const sc = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(t * (1.3 + (i % 7) * 0.31) + this.phase[i]), 3);
      let e = Math.min(1.3, l * vie * sc * feu);
      if (this.flou[i]) e *= 0.22;
      if (e < 0.012) continue;
      o = point(buf, o, this.x[i], this.y[i], this.taille[i] * this.grossir, GENRE.halo, e, 0.8 * e, 0.5 * e, 0, 0);
    }
    return o;
  }
}
