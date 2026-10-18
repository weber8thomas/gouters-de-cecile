// Photos vivantes : les tirages de Cécile et les photos collées des invités respirent (un zoom très lent
// dans leur cadre, un peu de parallaxe sous la main), un reflet passe sur le papier photo ; la photo d'un
// invité qui a une vidéo la joue en boucle, muette, dans son cadre, virée au ton du tirage (comme une
// photo de la Gazette du sorcier). Rien n'est inventé : seule l'image existante bouge.
//
// La toile ne touche pas au DOM : elle pose sur la zone photo du tirage (mesurée au repos, inclinaison
// comprise) la même image, zoomée, et redessine par-dessus les coins (et le ▶) qui la chevauchent. Une
// seule vidéo à la fois, seulement sur la page visible, jamais pendant un geste.

import videosJson from '../../content/videos.json';
import { urlMedia } from '../Soulever/media';
import { texture } from './gl';

type Fr = [number, number, number, number];
interface Geo { taille?: [number, number]; papier?: Fr; photo: Fr; cadreVideo?: Fr }
const VIDEOS = videosJson as unknown as Record<string, { video?: string; geometrie?: Geo }>;

/** Zone photo des tirages de l'album de Cécile (scripts/bake-photos-cecile.py : 1080 × 720 dans 1400 × 1040). */
const PHOTO_CECILE: Fr = [158 / 1400, 156 / 1040, 1080 / 1400, 720 / 1040];
/** Côté des textures de photo (puissance de deux : mipmaps). */
const COTE = 512;

/** Une photo posée sur une page visible, mesurée au repos (px de scène, repère de la toile). */
export interface Vivante {
  cle: string;
  el: HTMLElement;
  souffle: HTMLElement | null;
  video: string | null;
  /** Coins de l'image du tirage (px de scène) : haut gauche, haut droit, bas gauche, bas droit. */
  q: number[];
  /** Zone photo dans l'image (fractions). */
  photo: Fr;
  /** Taille de la zone photo à l'écran (px de toile) : anticrénelage du bord. */
  zone: [number, number];
  /** Le ▶ (photo d'invité), ses coins et son opacité. */
  lire: HTMLImageElement | null;
  qLire: number[] | null;
  opLire: number;
  srcs: { tirage: string; coins: string | null; lire: string | null };
}

interface Etat {
  tex: WebGLTexture | null;
  coins: WebGLTexture | null;
  lire: WebGLTexture | null;
  ton: [number, number, number];
  niv: [number, number];
  pret: boolean;
  /** Fondu de la photo vivante (0 à 1), puis ampleur de la respiration (0 à 1). */
  op: number;
  ampleur: number;
  phase: number;
  /** Prochain reflet (horloge) et position du reflet en cours. */
  reflet: number;
  prochain: number;
}

const charger = (src: string): Promise<HTMLImageElement> =>
  new Promise((ok, ko) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = ko;
    im.src = src;
  });

/** Matrice 2D d'un transform calculé : l'angle (rad). */
function angleDe(el: Element): number {
  const t = getComputedStyle(el).transform;
  const m = /matrix\(([^)]+)\)/.exec(t);
  if (!m) return 0;
  const [a, b] = m[1].split(',').map(Number);
  return Math.atan2(b, a);
}

/** Boîte d'un descendant dans le repère de mise en page d'un ancêtre (sans les transforms). */
function boiteDans(e: HTMLElement, anc: HTMLElement): [number, number, number, number] {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = e;
  while (n && n !== anc) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  if (n !== anc) return [0, 0, anc.offsetWidth, anc.offsetHeight];
  return [x, y, e.offsetWidth, e.offsetHeight];
}

/**
 * Mesure une photo (élément du tirage, incliné) : les coins de son image en px de scène. `versScene` :
 * point d'écran → px de scène ; `q` : px d'écran par px de scène ; `k` : px de toile par px de scène.
 */
export function mesurerPhoto(el: HTMLElement, versScene: (x: number, y: number) => [number, number], q: number, k: number): Vivante | null {
  const tirage = (el.querySelector('.gc-photo-collee__tirage, .gc-tirage__image') ?? el.querySelector('img')) as HTMLImageElement | null;
  if (!tirage?.currentSrc || !tirage.complete) return null;
  const imgs = Array.from(el.querySelectorAll('img'));
  const coins = (el.querySelector('.gc-photo-collee__coins') ?? imgs.find((i) => i !== tirage && !i.classList.contains('gc-photo-collee__lire'))) as HTMLImageElement | null;
  const lire = el.querySelector('.gc-photo-collee__lire') as HTMLImageElement | null;
  const video = el.getAttribute('data-gc-video-id');
  const g = video ? VIDEOS[video]?.geometrie : null;
  if (video && !g?.photo) return null;
  const photo: Fr = g?.photo ?? PHOTO_CECILE;
  const bw = el.offsetWidth;
  const bh = el.offsetHeight;
  if (!(bw > 0 && bh > 0)) return null;
  const a = angleDe(el);
  const r = el.getBoundingClientRect();
  // échelle mise en page → écran, depuis la boîte englobante de la boîte inclinée
  const ec = r.width / (bw * Math.abs(Math.cos(a)) + bh * Math.abs(Math.sin(a)));
  const s = ec / q;
  const [cx, cy] = versScene(r.left + r.width / 2, r.top + r.height / 2);
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const coinsDe = ([x, y, w, h]: [number, number, number, number]): number[] => {
    const out: number[] = [];
    for (const [u, v] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      const lx = (u - bw / 2) * s;
      const ly = (v - bh / 2) * s;
      out.push(cx + lx * c - ly * sn, cy + lx * sn + ly * c);
    }
    return out;
  };
  const bi = boiteDans(tirage, el);
  const bl = lire ? boiteDans(lire, el) : null;
  return {
    cle: `${video ?? 'tirage'}|${tirage.currentSrc}`,
    el,
    souffle: el.querySelector('.gc-photo-collee__souffle'),
    video,
    q: coinsDe(bi),
    photo,
    zone: [bi[2] * photo[2] * s * k, bi[3] * photo[3] * s * k],
    lire: lire?.currentSrc ? lire : null,
    qLire: bl && lire?.currentSrc ? coinsDe(bl) : null,
    opLire: lire ? Number(getComputedStyle(lire).opacity) || 0 : 0,
    srcs: { tirage: tirage.currentSrc, coins: coins?.currentSrc || null, lire: lire?.currentSrc || null },
  };
}

/** Une vidéo d'invité en boucle dans son cadre : chargement, lecture d'un passage, fondus. */
interface Boucle {
  cle: string;
  v: HTMLVideoElement;
  tex: WebGLTexture | null;
  /** 'charge' → 'joue' → 'fin' ; mix : part de la vidéo (0 à 1). */
  etat: 'charge' | 'joue' | 'fin';
  mix: number;
  debut: number;
  neuve: boolean;
  cadre: Fr;
}

export class Photos {
  private gl: WebGLRenderingContext;
  private etats = new Map<string, Etat>();
  private boucle: Boucle | null = null;
  private videos = new Map<string, HTMLVideoElement>();
  /** Prochaine boucle vidéo possible (horloge). */
  private prochaineVideo = 3;
  private noir: WebGLTexture | null;
  vivantes: Vivante[] = [];

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    this.noir = texture(gl, c);
  }

  /** Nouvelles mesures (au repos) : prépare les textures des photos qui apparaissent. */
  poser(vivantes: Vivante[]): void {
    this.vivantes = vivantes;
    for (const v of vivantes) if (!this.etats.has(v.cle)) this.preparer(v);
    if (this.boucle && !vivantes.some((v) => v.cle === this.boucle!.cle)) this.couperVideo();
  }

  private preparer(v: Vivante): void {
    const e: Etat = { tex: null, coins: null, lire: null, ton: [1.1, 0.97, 0.8], niv: [0, 1], pret: false, op: 0, ampleur: 0, phase: Math.random() * 6.28, reflet: -9, prochain: 2 + Math.random() * 6 };
    this.etats.set(v.cle, e);
    const toile = (im: HTMLImageElement) => {
      const c = document.createElement('canvas');
      c.width = c.height = COTE;
      const x = c.getContext('2d');
      x?.drawImage(im, 0, 0, COTE, COTE);
      return { c, x };
    };
    Promise.all([charger(v.srcs.tirage), v.srcs.coins ? charger(v.srcs.coins) : null, v.srcs.lire ? charger(v.srcs.lire) : null])
      .then(([t, co, li]) => {
        const a = toile(t);
        e.tex = texture(this.gl, a.c, true);
        if (co) e.coins = texture(this.gl, toile(co).c, true);
        if (li) e.lire = texture(this.gl, li);
        // ton du tirage (pour la vidéo) : teinte moyenne et niveaux de la zone photo
        try {
          const [px, py, pw, ph] = v.photo;
          const d = a.x?.getImageData(Math.round(px * COTE), Math.round(py * COTE), Math.round(pw * COTE), Math.round(ph * COTE)).data;
          if (d) {
            const ls: number[] = [];
            let r = 0; let g = 0; let b = 0;
            for (let i = 0; i < d.length; i += 4 * 7) {
              r += d[i]; g += d[i + 1]; b += d[i + 2];
              ls.push((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255);
            }
            const l = (0.299 * r + 0.587 * g + 0.114 * b) || 1;
            e.ton = [r / l, g / l, b / l];
            ls.sort((m, n) => m - n);
            const bas = ls[Math.floor(ls.length * 0.03)] ?? 0;
            const haut = ls[Math.floor(ls.length * 0.97)] ?? 1;
            e.niv = [bas, Math.max(0.2, haut - bas)];
          }
        } catch { /* lecture refusée : ton par défaut */ }
        e.pret = !!e.tex;
      })
      .catch(() => { /* image indisponible : la photo reste celle du livre */ });
  }

  /**
   * dt (s), t (horloge) ; repos : aucun geste depuis `calme` s ; pointeur (px de scène) ; lent : mouvement
   * réduit (rien ne bouge, pas de vidéo). Renvoie vrai si une photo est vivante (la toile doit dessiner).
   */
  avancer(dt: number, t: number, calme: number, lent: boolean, cachee: boolean): boolean {
    let vivant = false;
    for (const v of this.vivantes) {
      const e = this.etats.get(v.cle);
      if (!e?.pret) continue;
      const indice = !!v.souffle && !!v.souffle.style.transform && v.souffle.style.transform !== 'none';
      const ok = !lent && !cachee && calme > 1.2 && !v.el.hasAttribute('data-gc-souleve') && !indice;
      if (!ok) {
        // l'indice qui respire, ou la photo qui se soulève : on rend la main en douceur au DOM
        e.ampleur = Math.max(0, e.ampleur - dt * 2.5);
        if (e.ampleur === 0) e.op = Math.max(0, e.op - dt * 4);
      } else {
        e.op = Math.min(1, e.op + dt / 0.8);
        if (e.op >= 1) e.ampleur = Math.min(1, e.ampleur + dt / 2.5);
      }
      if (e.op <= 0) continue;
      vivant = true;
      if (t > e.prochain && e.reflet < -1 && ok) { e.reflet = -0.6; e.prochain = t + 9 + Math.random() * 7; }
      if (e.reflet > -1) e.reflet += dt / 1.7 * 2.2;
      if (e.reflet > 1.7) e.reflet = -9;
    }
    // la boucle vidéo : une seule, sur une photo d'invité vivante et visible
    const b = this.boucle;
    if (b) {
      const v = this.vivantes.find((x) => x.cle === b.cle);
      const e = v && this.etats.get(v.cle);
      if (!v || !e || e.op < 1 || lent || cachee || calme < 1.2) this.couperVideo();
      else {
        vivant = true;
        if (b.etat === 'joue') {
          if (b.debut < 0) b.debut = t;
          b.mix = Math.min(1, b.mix + dt / 0.7);
          if (t - b.debut > 6.2) b.etat = 'fin';
        } else if (b.etat === 'fin') {
          b.mix = Math.max(0, b.mix - dt / 0.7);
          if (b.mix === 0) {
            b.v.pause();
            this.boucle = null;
            this.prochaineVideo = t + 7 + Math.random() * 5;
          }
        }
      }
    } else if (!lent && !cachee && calme > 2.5 && t > this.prochaineVideo) {
      const v = this.vivantes.find((x) => x.video && this.etats.get(x.cle)?.op === 1 && visibleALEcran(x.el));
      if (v) this.lancerVideo(v, t);
      else this.prochaineVideo = t + 1;
    }
    return vivant;
  }

  private lancerVideo(v: Vivante, t: number): void {
    const nom = v.video ? VIDEOS[v.video]?.video : null;
    const geo = v.video ? VIDEOS[v.video]?.geometrie : null;
    if (!nom) return;
    this.prochaineVideo = t + 30; // en attendant qu'elle démarre (ou si elle ne démarre jamais)
    let el = this.videos.get(nom);
    if (!el) {
      el = document.createElement('video');
      el.muted = true;
      el.defaultMuted = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.setAttribute('muted', '');
      el.preload = 'auto';
      el.loop = true;
      el.src = urlMedia(nom);
      this.videos.set(nom, el);
    }
    const b: Boucle = { cle: v.cle, v: el, tex: null, etat: 'charge', mix: 0, debut: t, neuve: false, cadre: geo?.cadreVideo ?? [0, 0, 1, 1] };
    this.boucle = b;
    const video = el;
    const gl = this.gl;
    const demarrer = () => {
      if (this.boucle !== b) return;
      b.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      b.etat = 'joue';
      b.neuve = true;
      b.debut = -1; // l'horloge de la toile le fixera à la première image
      const image = () => {
        if (this.boucle !== b) return;
        b.neuve = true;
        (video as HTMLVideoElement & { requestVideoFrameCallback?: (f: () => void) => number }).requestVideoFrameCallback?.(image);
      };
      image();
    };
    try { video.currentTime = 0.4 + Math.random() * 2; } catch { /* pas encore de métadonnées */ }
    video.play().then(demarrer).catch(() => { if (this.boucle === b) this.boucle = null; });
  }

  couperVideo(): void {
    const b = this.boucle;
    if (!b) return;
    b.v.pause();
    if (b.tex) this.gl.deleteTexture(b.tex);
    this.boucle = null;
  }

  /** Coupe tout d'un coup (geste, page qui change) : le DOM reprend la main. */
  eteindre(): void {
    this.couperVideo();
    for (const e of this.etats.values()) { e.op = 0; e.ampleur = 0; }
  }

  /**
   * Dessine les photos (programme images, déjà actif ; tampon d'images lié). `quad` envoie 4 coins + uv ;
   * px : pointeur (px de scène) ou null.
   */
  dessiner(t: number, U: Record<string, WebGLUniformLocation | null>, quad: (q: number[], uv?: number[]) => void, ptr: { x: number; y: number } | null): void {
    const gl = this.gl;
    const b = this.boucle;
    for (const v of this.vivantes) {
      const e = this.etats.get(v.cle);
      if (!e?.pret || e.op <= 0) continue;
      // respiration : un zoom de 1 à 1,03 sur sept secondes ; parallaxe : la photo glisse un peu vers la main
      const z = 1 + e.ampleur * (0.016 + 0.014 * Math.sin((t * 2 * Math.PI) / 7.5 + e.phase));
      let ox = 0;
      let oy = 0;
      if (ptr && e.ampleur > 0) {
        const cx = (v.q[0] + v.q[6]) / 2;
        const cy = (v.q[1] + v.q[7]) / 2;
        ox = Math.max(-1, Math.min(1, (ptr.x - cx) / 500)) * -0.008 * e.ampleur;
        oy = Math.max(-1, Math.min(1, (ptr.y - cy) / 500)) * -0.008 * e.ampleur;
      }
      const vid = b && b.cle === v.cle && b.tex ? b : null;
      if (vid && vid.neuve && vid.v.readyState >= 2) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, vid.tex);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, vid.v); } catch { /* image vidéo pas prête */ }
        vid.neuve = false;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, e.coins ?? this.noir);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, vid?.tex ?? this.noir);
      gl.uniform1f(U.u_mode, 0);
      gl.uniform1f(U.u_op, e.op);
      gl.uniform4f(U.u_photo, v.photo[0], v.photo[1], v.photo[2], v.photo[3]);
      gl.uniform3f(U.u_zoom, z, ox, oy);
      gl.uniform1f(U.u_vid, vid ? vid.mix : 0);
      const c = vid?.cadre ?? [0, 0, 1, 1];
      gl.uniform4f(U.u_cadre, c[0], c[1], c[2], c[3]);
      gl.uniform3f(U.u_ton, e.ton[0], e.ton[1], e.ton[2]);
      gl.uniform2f(U.u_niv, e.niv[0], e.niv[1]);
      gl.uniform1f(U.u_reflet, e.reflet);
      gl.uniform2f(U.u_aa, 1.2 / Math.max(8, v.zone[0]), 1.2 / Math.max(8, v.zone[1]));
      quad(v.q);
      // le ▶ par-dessus la photo vivante
      if (e.lire && v.qLire && v.opLire > 0.01) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, e.lire);
        gl.uniform1f(U.u_mode, 1);
        gl.uniform1f(U.u_op, e.op * v.opLire);
        quad(v.qLire);
      }
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  detruire(): void {
    this.couperVideo();
    for (const v of this.videos.values()) { v.removeAttribute('src'); v.load(); }
    this.videos.clear();
  }
}

/** L'élément est-il (au moins à moitié) dans la fenêtre ? */
function visibleALEcran(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return w > 0 && h > 0 && w * h >= 0.5 * r.width * r.height;
}
