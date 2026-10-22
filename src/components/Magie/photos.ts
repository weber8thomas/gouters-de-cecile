// Photos vivantes : les vignettes posées dans la page. Une vignette qui a une boucle (la vraie vidéo d'un invité ou de
// l'album, ou, version locale, sa boucle de PARALLAXE de 4 s au ratio de la photo : data-gc-parallaxe) la joue en
// continu, muette, dans son cadre, virée au ton du tirage (comme une photo de la Gazette du sorcier), dès que la double page
// est posée et visible ; elle s'arrête avec la page (geste, page tournée, photo soulevée, onglet caché, mouvement réduit).
// Rien n'est inventé : seule l'image existante bouge. La vignette n'a ni respiration, ni reflet, ni parallaxe sous la main :
// la photo OUVERTE est la vraie photo fixe (Soulever).
//
// La toile ne touche pas au DOM : elle pose sur la zone photo du tirage (mesurée au repos, inclinaison
// comprise) la même image, et redessine par-dessus les coins (et le ▶) qui la chevauchent. Une
// vidéo par vignette, seulement sur la double page visible, jamais pendant un geste.
//
// Coût : aucune image n'est demandée au navigateur (pas de rAF) tant que rien ne se fond : chaque nouvelle image vidéo
// (requestVideoFrameCallback) réveille le moteur, qui redessine au plus 30 fois par seconde et n'envoie à la carte
// graphique que les textures dont l'image a changé.

import videosJson from '../../content/videos.json';
import { urlMedia } from '../Soulever/media';
import { texture } from './gl';

type Fr = [number, number, number, number];
interface Geo { taille?: [number, number]; papier?: Fr; photo: Fr; cadreVideo?: Fr }
const VIDEOS = videosJson as unknown as Record<string, { video?: string; parallaxe?: string; geometrie?: Geo }>;

/**
 * Zone photo d'un tirage de l'album de Cécile (scripts/bake-photos-cecile.py : photo de pw × ph px, ratio d'origine, dans une
 * image de (pw + 320) × (ph + 320) px : marge 100, bords du papier 58 / 62 en largeur et 56 / 64 en hauteur), en fractions
 * de l'image.
 */
const photoCecile = (w: number, h: number): Fr => [158 / w, 156 / h, (w - 320) / w, (h - 320) / h];
/** Côté des textures de photo (puissance de deux : mipmaps). */
const COTE = 512;

/** Une photo posée sur une page visible, mesurée au repos (px de scène, repère de la toile). */
export interface Vivante {
  cle: string;
  el: HTMLElement;
  souffle: HTMLElement | null;
  /** Nom logique du mp4 que joue la vignette (vraie vidéo ou parallaxe), ou null : vignette fixe. */
  video: string | null;
  /** Zone du mp4 que montre la photo (fractions du cadre vidéo). */
  cadre: Fr;
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
  /** Fondu de la photo vivante (0 à 1). */
  op: number;
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
  const idVideo = el.getAttribute('data-gc-video-id');
  const info = idVideo ? VIDEOS[idVideo] : null;
  const g = info?.geometrie ?? null;
  if (idVideo && !g?.photo) return null;
  // La boucle de la vignette : sa parallaxe (version locale ; la photo ouverte reste fixe), sinon la vraie vidéo.
  const parallaxe = el.getAttribute('data-gc-parallaxe');
  const video = parallaxe || info?.video || null;
  const photo: Fr = g?.photo ?? photoCecile(tirage.naturalWidth, tirage.naturalHeight);
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
    cadre: (parallaxe ? null : g?.cadreVideo) ?? [0, 0, 1, 1],
    q: coinsDe(bi),
    photo,
    zone: [bi[2] * photo[2] * s * k, bi[3] * photo[3] * s * k],
    lire: lire?.currentSrc ? lire : null,
    qLire: bl && lire?.currentSrc ? coinsDe(bl) : null,
    opLire: lire ? Number(getComputedStyle(lire).opacity) || 0 : 0,
    srcs: { tirage: tirage.currentSrc, coins: coins?.currentSrc || null, lire: lire?.currentSrc || null },
  };
}

/** Une boucle vidéo dans son cadre : chargement, lecture en continu, fondu d'entrée. */
interface Boucle {
  cle: string;
  v: HTMLVideoElement;
  tex: WebGLTexture | null;
  /** 'charge' → 'joue' : mix : part de la vidéo (0 à 1). */
  etat: 'charge' | 'joue';
  mix: number;
  /** Une image vidéo neuve attend d'être envoyée à la carte graphique. */
  neuve: boolean;
  /** Dimensions de la texture déjà allouée (texSubImage2D ensuite). */
  dims: [number, number];
  /** Cadence de secours (navigateur sans requestVideoFrameCallback). */
  minuterie: number;
  cadre: Fr;
}

type VideoCadree = HTMLVideoElement & { requestVideoFrameCallback?: (f: () => void) => number };

export class Photos {
  private gl: WebGLRenderingContext;
  private etats = new Map<string, Etat>();
  private boucles = new Map<string, Boucle>();
  /** Lecture refusée par le navigateur : pas de nouvel essai avant cette horloge (par photo). */
  private reprise = new Map<string, number>();
  private videos = new Map<string, HTMLVideoElement>();
  private noir: WebGLTexture | null;
  vivantes: Vivante[] = [];
  /** Vrai quand quelque chose se fond (entrée, sortie, fondu de la vidéo) : la boucle du moteur doit alors tourner à plein régime. */
  transitoire = false;
  /** Appelé quand une nouvelle image vidéo (ou la fin d'un chargement) demande un redessin : réveille le moteur, sans rAF. */
  surImage: (() => void) | null = null;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    this.noir = texture(gl, c);
  }

  /**
   * Nouvelles mesures (au repos) : prépare les textures des photos qui apparaissent. Tout ce qui n'est plus sur la
   * double page visible est coupé : boucle arrêtée, texture libérée, élément vidéo relâché.
   */
  poser(vivantes: Vivante[]): void {
    this.vivantes = vivantes;
    for (const v of vivantes) if (!this.etats.has(v.cle)) this.preparer(v);
    for (const cle of [...this.boucles.keys()]) if (!vivantes.some((v) => v.cle === cle)) this.couper(cle);
    const utilisees = new Set(vivantes.map((v) => v.video).filter((n): n is string => !!n));
    for (const [nom, el] of [...this.videos]) {
      if (utilisees.has(nom)) continue;
      el.pause();
      el.removeAttribute('src');
      el.load();
      this.videos.delete(nom);
    }
  }

  private preparer(v: Vivante): void {
    const e: Etat = { tex: null, coins: null, lire: null, ton: [1.1, 0.97, 0.8], niv: [0, 1], pret: false, op: 0 };
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
        this.surImage?.();
      })
      .catch(() => { /* image indisponible : la photo reste celle du livre */ });
  }

  /**
   * dt (s), t (horloge) ; repos : aucun geste depuis `calme` s ; lent : mouvement réduit (rien ne bouge, pas de vidéo) ;
   * cachee : geste, loupe ou photo soulevée (tout s'éteint). Renvoie vrai si une photo est vivante (la toile doit
   * dessiner) ; `transitoire` dit si un fondu est en cours.
   */
  avancer(dt: number, t: number, calme: number, lent: boolean, cachee: boolean): boolean {
    let vivant = false;
    let fond = false;
    for (const v of this.vivantes) {
      const e = this.etats.get(v.cle);
      if (!e?.pret) continue;
      // photo-vidéo dont la lecture a été refusée par le navigateur : le DOM garde la main (tirage fixe et ▶, le toucher la soulève)
      const refusee = !!v.video && (this.reprise.get(v.cle) ?? 0) > t;
      // seules les vignettes qui ont une boucle vivent au repos ; la photo qui se soulève rend la main au DOM
      const ok = !!v.video && !lent && !cachee && calme > 0.5 && !v.el.hasAttribute('data-gc-souleve') && !refusee;
      const avant = e.op;
      e.op = ok ? Math.min(1, e.op + dt / 0.5) : Math.max(0, e.op - dt * 4);
      if (e.op !== avant && e.op > 0 && e.op < 1) fond = true;
      if (e.op <= 0) continue;
      vivant = true;
    }
    // les boucles vidéo : une par vignette vivante et visible, en continu (muettes, en boucle)
    for (const [cle, b] of [...this.boucles]) {
      const v = this.vivantes.find((x) => x.cle === cle);
      const e = v && this.etats.get(v.cle);
      if (!v || !e || e.op <= 0.05 || lent || cachee || calme < 0.5 || document.hidden) { this.couper(cle); continue; }
      vivant = true;
      if (b.etat === 'joue' && b.mix < 1) { b.mix = Math.min(1, b.mix + dt / 0.5); fond = true; }
    }
    if (!lent && !cachee && calme > 0.5 && !document.hidden) {
      for (const v of this.vivantes) {
        if (v.video && !this.boucles.has(v.cle) && (this.reprise.get(v.cle) ?? 0) <= t && (this.etats.get(v.cle)?.op ?? 0) > 0.2 && visibleALEcran(v.el)) this.lancerVideo(v, t);
      }
    }
    this.transitoire = fond;
    return vivant;
  }

  private lancerVideo(v: Vivante, t: number): void {
    const nom = v.video;
    if (!nom) return;
    let el = this.videos.get(nom);
    const neuve = !el;
    if (!el) {
      el = document.createElement('video');
      el.muted = true;
      el.defaultMuted = true;
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.setAttribute('muted', '');
      el.preload = 'auto';
      el.loop = true;
      el.src = urlMedia(nom);
      this.videos.set(nom, el);
    }
    const b: Boucle = { cle: v.cle, v: el, tex: null, etat: 'charge', mix: 0, neuve: false, dims: [0, 0], minuterie: 0, cadre: v.cadre };
    this.boucles.set(v.cle, b);
    const video = el as VideoCadree;
    const gl = this.gl;
    const demarrer = () => {
      if (this.boucles.get(v.cle) !== b) return;
      b.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      b.etat = 'joue';
      b.neuve = true;
      // Une image vidéo neuve réveille le moteur (sans rAF) ; sans requestVideoFrameCallback, une minuterie à 24 images/s.
      if (video.requestVideoFrameCallback) {
        const image = () => {
          if (this.boucles.get(v.cle) !== b) return;
          b.neuve = true;
          this.surImage?.();
          video.requestVideoFrameCallback?.(image);
        };
        video.requestVideoFrameCallback(image);
      } else {
        b.minuterie = window.setInterval(() => { b.neuve = true; this.surImage?.(); }, 1000 / 24);
      }
      this.surImage?.();
    };
    if (neuve) { try { video.currentTime = 0.1; } catch { /* pas encore de métadonnées */ } }
    // Muette et playsinline : la lecture sans geste est permise (Chrome, Safari iPad hors économie d'énergie) ;
    // si elle est refusée, la photo reste le tirage fixe (le toucher la soulève, avec le son).
    video.muted = true;
    video.play().then(demarrer).catch(() => {
      this.reprise.set(v.cle, t + 5);
      if (this.boucles.get(v.cle) === b) this.boucles.delete(v.cle);
    });
  }

  /** Coupe la boucle d'une photo (la vidéo est mise en pause ; elle reprendra où elle en était). */
  private couper(cle: string): void {
    const b = this.boucles.get(cle);
    if (!b) return;
    b.v.pause();
    if (b.minuterie) clearInterval(b.minuterie);
    if (b.tex) this.gl.deleteTexture(b.tex);
    this.boucles.delete(cle);
  }

  /** Coupe toutes les vidéos (onglet caché, page qui change). */
  couperVideo(): void {
    for (const cle of [...this.boucles.keys()]) this.couper(cle);
  }

  /** Coupe tout d'un coup (geste, page qui change) : le DOM reprend la main. */
  eteindre(): void {
    this.couperVideo();
    for (const e of this.etats.values()) e.op = 0;
  }

  /**
   * Dessine les photos (programme images, déjà actif ; tampon d'images lié). `quad` envoie 4 coins + uv.
   * Les textures vidéo ne sont envoyées que pour une nouvelle image.
   */
  dessiner(U: Record<string, WebGLUniformLocation | null>, quad: (q: number[], uv?: number[]) => void): void {
    const gl = this.gl;
    for (const v of this.vivantes) {
      const e = this.etats.get(v.cle);
      if (!e?.pret || e.op <= 0) continue;
      const b = this.boucles.get(v.cle);
      const vid = b?.tex ? b : null;
      if (vid && vid.neuve && vid.v.readyState >= 2) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, vid.tex);
        try {
          const w = vid.v.videoWidth;
          const h = vid.v.videoHeight;
          if (vid.dims[0] === w && vid.dims[1] === h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGB, gl.UNSIGNED_BYTE, vid.v);
          else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, vid.v); vid.dims = [w, h]; }
        } catch { /* image vidéo pas prête */ }
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
      gl.uniform3f(U.u_zoom, 1, 0, 0);
      gl.uniform1f(U.u_vid, vid && vid.dims[0] > 0 ? vid.mix : 0);
      const c = vid?.cadre ?? [0, 0, 1, 1];
      gl.uniform4f(U.u_cadre, c[0], c[1], c[2], c[3]);
      gl.uniform3f(U.u_ton, e.ton[0], e.ton[1], e.ton[2]);
      gl.uniform2f(U.u_niv, e.niv[0], e.niv[1]);
      gl.uniform2f(U.u_aa, 1.2 / Math.max(8, v.zone[0]), 1.2 / Math.max(8, v.zone[1]));
      quad(v.q);
      // le ▶ par-dessus la photo (sauf une vignette qui joue une boucle : elle bouge déjà, le ▶ n'a plus de sens)
      if (e.lire && v.qLire && v.opLire > 0.01 && !v.video) {
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
