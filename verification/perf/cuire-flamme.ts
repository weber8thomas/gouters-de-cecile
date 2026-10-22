// Cuit la flamme de la bougie (le rendu WebGL de src/components/Bougie/flamme.ts, reflet dans le puits compris) en une
// feuille de sprites bouclée : N images à FPS i/s, en grille COLS × LIGNES, raccord par fondu des dernières images.
// Lancé par verification/perf/cuire-flamme.mjs (page servie par vite) ; résultat dans window.__resultat.
import geo from '../../src/components/Bougie/geometrie.json';
import { avancerBruit, creerRenduFlamme, etatFlamme, etatRepos } from '../../src/components/Bougie/flamme';
import { creerRenduCire } from '../../src/components/Bougie/cire';

const FLAMME = geo.flamme;
const N = 40, FPS = 15, COLS = 8, DPR = 2, ECLAT = 0.6 + 0.4 * 2; // éclat de la bougie par défaut (réglages : 2)
const FONDU = 14; // images du raccord
const fw = Math.round(FLAMME.w * DPR), fh = Math.round(FLAMME.h * DPR);
const lignes = Math.ceil(N / COLS);
const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lueurCire = (l: number) => borne(0.45 + 1.6 * (l - 1), 0.15, 0.85);

const toile = document.getElementById('c') as HTMLCanvasElement;
const gl = creerRenduFlamme(toile, FLAMME)!;
gl.taille(fw, fh);
const ctx = gl.contexte()!;
const cire = creerRenduCire(ctx.gl, FLAMME, ctx.triangle)!;
const etat = etatRepos();

// l'état de la flamme au repos à l'instant t (même chose que Bougie.tsx, sans vent ni saut)
function a(t: number) {
  const e = etatRepos();
  e.tn = ((14 * t) % 289 + 289) % 289;
  etatFlamme(e, t, [0, 0], 0, 0);
  e.eclat *= ECLAT;
  return e;
}
void avancerBruit; void etat;
const copie = () => { const c = document.createElement('canvas'); c.width = fw; c.height = fh; c.getContext('2d')!.drawImage(toile, 0, 0); return c; };
function rendre(t: number) {
  const e = a(t);
  gl.dessiner(e, () => cire.dessiner(null, e, lueurCire(e.eclat * e.long)));
  return { c: copie(), lumiere: e.eclat * e.long };
}

const T = N / FPS;
const feuille = document.createElement('canvas');
feuille.width = COLS * fw; feuille.height = lignes * fh;
const g = feuille.getContext('2d')!;
const lumieres: number[] = [];
for (let i = 0; i < N; i++) {
  const t = 5 + i / FPS; // (t > 0 : on évite le tout début du bruit)
  const A = rendre(t);
  const u = i >= N - FONDU ? (i - (N - FONDU) + 1) / FONDU : 0; // à i = N − 1, u → 1 : l'image suivante (i = 0) est celle de t − T
  let c = A.c, lum = A.lumiere;
  if (u > 0) {
    const B = rendre(t - T);
    const m = document.createElement('canvas'); m.width = fw; m.height = fh;
    const mg = m.getContext('2d')!;
    mg.globalAlpha = 1 - u; mg.drawImage(A.c, 0, 0);
    mg.globalCompositeOperation = 'lighter'; mg.globalAlpha = u; mg.drawImage(B.c, 0, 0);
    c = m; lum = (1 - u) * A.lumiere + u * B.lumiere;
  }
  lumieres.push(+lum.toFixed(3));
  g.drawImage(c, (i % COLS) * fw, Math.floor(i / COLS) * fh);
}
(window as unknown as { __resultat: unknown }).__resultat = {
  n: N, fps: FPS, cols: COLS, lignes, fw, fh, dpr: DPR, lumieres, png: feuille.toDataURL('image/png'),
};
document.title = 'fini';
