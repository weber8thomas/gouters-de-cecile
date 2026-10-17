import React from 'react';
import { LazyMotion, domMax, m, useMotionValue, useTransform, useReducedMotion, type MotionValue } from '../../lib/motion';
import { flammeBougie, useFeu } from '../../lib/feu';
import { LUMIERE_TRACEE } from '../Lumiere';
import { useReglages } from '../../lib/reglages';
import { cssUrl } from '../../lib/assets';
import { ecouterPointeur } from '../../lib/pointeur';
import geo from './geometrie.json';
import { avancerBruit, creerRenduFlamme, etatFlamme, etatRepos, type RenduFlamme } from './flamme';
import './Bougie.css';

export interface BougieProps {
  className?: string;
}

// Une bougie de cire crème à moitié consumée, posée sur la table dans le coin bas gauche, à gauche du livre.
// La scène est une table vue d'en haut : la bougie est verticale et on la voit presque du dessus, un peu en
// fuite vers le coin de l'écran. On voit son puits de cire liquide, sa mèche, son flanc couvert de coulures
// et la flaque de cire figée à son pied. Modélisée et rendue dans Blender avec la caméra de la scène
// (scripts/bougie3d/scene.py), cuite en calques par scripts/bake-bougie.py, qui écrit leur géométrie en px
// de scène 1920 × 1080 dans geometrie.json.
//
// Calques, de bas en haut : l'ombre portée par la cheminée sur la table, la lueur de la flamme sur la table,
// la cire (flamme basse), la cire éclairée (flamme haute, fondue au rythme de la flamme : la cire vit avec
// elle), les gouttes de cire liquide qui coulent le long de deux coulures, la flamme. La lueur, la cire
// éclairée et l'ombre passent par transform et opacity et suivent le feu (src/lib/feu.ts) ; les gouttes
// sont des planches d'images qu'une animation Web (transform, par paliers) fait défiler. Aucun filtre à
// l'exécution.
//
// La flamme est une petite toile WebGL : un volume émissif rendu en temps réel, vu sous l'angle exact de
// la caméra de la scène (flamme.ts). Elle bouge comme une flamme calme (balancement qui monte de la base
// vers la pointe, respiration, frémissement de la pointe, petits sauts au hasard), et répond à la main :
// un passage rapide près d'elle la couche dans le sens du mouvement, elle vacille puis se redresse (un
// ressort amorti, poussé par la vitesse du pointeur). La lumière tracée et la lueur sur la table suivent
// l'état rendu (même formule). La toile ne se dessine que visible (onglet affiché, à l'écran). Sans WebGL,
// ou contexte perdu : l'ancienne image fixe de la flamme, animée par transform et opacity.
//
// Mouvement réduit (système ou réglage) ou réglage feu: false : tout est immobile (une seule image de la
// flamme, aucune goutte). Rien ne capte le pointeur : on écoute seulement ses mouvements
// (src/lib/pointeur.ts). Sur téléphone en portrait, le CSS ne garde que la lueur.

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;
const r2 = (v: number) => Math.round(v * 1e2) / 1e2;

// L'image de secours (sans WebGL) part de la mèche (pivot) vers le bas à gauche de l'écran : la direction
// dans laquelle une rotation positive (sens horaire à l'écran) déplace sa pointe.
const NORMALE = [-0.49, -0.87];
const RAIDEUR = 60; // ressort de l'inclinaison (≈ 1,2 oscillation par seconde)
const AMORTI = 6;
const POUSSEE = 2.6; // (°/s²) par px/s de vent, au contact : un passage à 1000 px/s la couche d'environ 20°
const PENCHE_MAX = 35;

const FLAMME = geo.flamme;
const FIXE = geo.flammeFixe;
// Le milieu de la flamme vue d'en haut, un peu au-delà de la mèche vers le coin de l'écran (px de scène),
// et la portée du souffle de la main autour de lui.
const MILIEU_FLAMME = (() => {
  const [x, y] = FLAMME.meche;
  const n = Math.hypot(x - 960, y - 540);
  return [x + (12 * (x - 960)) / n, y + (12 * (y - 540)) / n];
})();
const PORTEE = 280;

type RenduVu = 'toile' | 'image';

declare global {
  interface Window {
    /** Vérifications : l'état de la flamme rendue (scripts/verify-lumiere.mjs, captures). */
    __gcFlamme?: { etat: () => { rendu: RenduVu; lumiere: number; long: number; eclat: number; images: number; ms: number; cadence: number } };
  }
}

/**
 * La flamme vivante : la physique du souffle de la main, l'état de la flamme (flamme.ts), et son rendu dans
 * la toile WebGL, ou, à défaut, l'ancienne image fixe (balancement, étirement et opacité par transform).
 */
function useFlammeVivante(fixe: boolean, dxFeu: MotionValue<number>) {
  const toile = React.useRef<HTMLCanvasElement>(null);
  const cadre = React.useRef<HTMLDivElement>(null);
  const [rendu, setRendu] = React.useState<RenduVu>(() => (typeof window !== 'undefined' && 'WebGLRenderingContext' in window ? 'toile' : 'image'));
  const penche = useMotionValue(0);
  const etire = useMotionValue(1);
  const eclat = useMotionValue(1);
  const hauteur = useMotionValue(1);
  React.useEffect(() => {
    const el: HTMLElement | null = rendu === 'toile' ? toile.current : cadre.current;
    if (!el) return;
    const etat = etatRepos();
    let gl: RenduFlamme | null = null;
    let fini = false;
    const th = [0, 0]; // inclinaison due au vent (°, vecteur à l'écran)
    const om = [0, 0]; // sa vitesse (°/s)
    let trouble = 0; // 0..1 : la flamme dérangée vacille vite et baisse
    let saut = 0; // petit saut de flamme au hasard
    let prochainSaut = performance.now() + 1500 + Math.random() * 3000;
    let boite: DOMRect | null = null;
    let lue = 0;
    let vu = 0;
    let avant = 0;
    let dessinee = 0; // dernière image dessinée (ms)
    let lent = 1 / 60; // intervalle moyen entre deux images (s)
    let raf = 0;
    let visible = typeof document === 'undefined' || !document.hidden;
    let dedans = typeof IntersectionObserver === 'undefined';

    // l'état courant : la toile, ou l'image de secours ; la lumière de la bougie et la lueur sur la table
    const montrer = (t: number) => {
      if (gl) gl.dessiner(etat);
      else if (rendu === 'image') {
        const balance = fixe ? 0 : 0.6 * Math.sin(1.3 * t) + 0.3 * Math.sin(2.9 * t + 1);
        const vacille = trouble * (5 * Math.sin(23 * t) + 3 * Math.sin(37 * t + 1));
        penche.set(r2(balance + th[0] * NORMALE[0] + th[1] * NORMALE[1] + vacille));
        etire.set(r3(etat.long));
      }
      eclat.set(r3(etat.eclat));
      hauteur.set(r3(etat.long));
      flammeBougie.set(r3(etat.eclat * etat.long));
    };
    // la toile : tampon à la taille affichée (DPR plafonné à 2)
    const mesurer = () => {
      if (!gl || !toile.current) return;
      const r = toile.current.getBoundingClientRect();
      const k = Math.min(2, window.devicePixelRatio || 1);
      gl.taille(Math.max(1, Math.round(r.width * k)), Math.max(1, Math.round(r.height * k)));
    };
    const perdu = () => {
      fini = true;
      cancelAnimationFrame(raf);
      setRendu('image');
    };
    const demarrer = () => {
      if (rendu === 'toile' && !gl) {
        gl = toile.current ? creerRenduFlamme(toile.current, FLAMME) : null;
        if (!gl) return perdu();
        toile.current!.addEventListener('webglcontextlost', perdu);
        mesurer();
      }
      if (fixe) {
        Object.assign(etat, etatRepos());
        montrer(0);
        return;
      }
      avant = dessinee = performance.now();
      if (!raf) raf = requestAnimationFrame(pas);
    };
    const pas = (now: number) => {
      raf = requestAnimationFrame(pas);
      const dt = Math.min(0.05, Math.max(0, (now - avant) / 1000));
      avant = now;
      lent += 0.05 * (dt - lent);
      for (let k = 0; k < 2; k++) {
        om[k] += (-RAIDEUR * th[k] - AMORTI * om[k]) * dt;
        th[k] += om[k] * dt;
      }
      const n = Math.hypot(th[0], th[1]);
      if (n > PENCHE_MAX) {
        th[0] *= PENCHE_MAX / n;
        th[1] *= PENCHE_MAX / n;
      }
      trouble *= Math.exp(-2.5 * dt);
      saut *= Math.exp(-14 * dt);
      if (now > prochainSaut) {
        saut = 0.03 + Math.random() * 0.03;
        prochainSaut = now + 1800 + Math.random() * 4500;
      }
      etat.tn = avancerBruit(etat.tn, dt, trouble);
      // cadence : 60 i/s au plus (écrans à 120 Hz compris) ; 30 i/s quand l'appareil peine
      if (now - dessinee < (lent > 0.024 ? 1000 / 30 : 1000 / 60) - 4) return;
      dessinee = now;
      const t = now / 1000;
      // un léger courant d'air de la pièce, qui suit la source du feu
      const air = borne(0.09 * dxFeu.get(), -2, 2);
      etatFlamme(etat, t, [th[0] + air, th[1]], trouble, saut);
      montrer(t);
    };
    const majBoucle = () => {
      if (fini) return;
      if (visible && dedans) demarrer();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const desab = fixe ? () => {} : ecouterPointeur((p) => {
      if (!boite || p.t - lue > 500) {
        boite = el.getBoundingClientRect();
        lue = p.t;
      }
      if (!boite.width) return;
      // le milieu de la flamme à l'écran ; le souffle porte à PORTEE px de scène
      const g = rendu === 'toile' ? FLAMME : FIXE;
      const k = boite.width / g.w;
      const cx = boite.left + (MILIEU_FLAMME[0] - g.x) * k;
      const cy = boite.top + (MILIEU_FLAMME[1] - g.y) * k;
      const prox = borne(1 - Math.hypot(p.x - cx, p.y - cy) / (PORTEE * k), 0, 1);
      if (!prox) return;
      // le vent pousse la flamme dans le sens du mouvement, plus fort tout près ; la flamme se trouble
      const dt = borne((p.t - vu) / 1000, 0.004, 1 / 30);
      vu = p.t;
      om[0] += POUSSEE * prox * prox * p.vx * dt;
      om[1] += POUSSEE * prox * prox * p.vy * dt;
      trouble = Math.min(1, trouble + 3 * prox * ((p.vx * p.vx + p.vy * p.vy) / 1e6) * dt);
    });
    const surVisibilite = () => {
      visible = !document.hidden;
      majBoucle();
    };
    let redim = 0;
    const surRedim = () => {
      cancelAnimationFrame(redim);
      redim = requestAnimationFrame(() => {
        boite = null;
        mesurer();
        if (fixe && gl) montrer(0); // un tampon redimensionné est vidé
      });
    };
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((es) => {
      dedans = es[es.length - 1].isIntersecting;
      majBoucle();
    });
    io?.observe(el);
    document.addEventListener('visibilitychange', surVisibilite);
    window.addEventListener('resize', surRedim);
    window.__gcFlamme = {
      etat: () => ({
        rendu, lumiere: flammeBougie.get(), long: etat.long, eclat: etat.eclat,
        images: gl?.mesure().images ?? 0, ms: gl?.mesure().ms ?? 0, cadence: lent > 0.024 ? 30 : 60,
      }),
    };
    if (fixe) {
      penche.set(0);
      etire.set(1);
      eclat.set(1);
      hauteur.set(1);
      flammeBougie.set(1);
    }
    majBoucle();
    return () => {
      fini = true;
      desab();
      cancelAnimationFrame(raf);
      cancelAnimationFrame(redim);
      io?.disconnect();
      document.removeEventListener('visibilitychange', surVisibilite);
      window.removeEventListener('resize', surRedim);
      toile.current?.removeEventListener('webglcontextlost', perdu);
      gl?.detruire();
    };
  }, [fixe, rendu, dxFeu, penche, etire, eclat, hauteur]);
  return { rendu, toile, cadre, penche, etire, eclat, hauteur };
}

type Boite = { x: number; y: number; w: number; h: number };
const place = (b: Boite): React.CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h });

/** Une goutte toutes les CYCLE_GOUTTE secondes sur chaque coulure, en décalé. */
const CYCLE_GOUTTE = 14;

function Goutte({ g, rang, fixe }: { g: (typeof geo.gouttes)[number]; rang: number; fixe: boolean }) {
  const feuille = React.useRef<HTMLDivElement>(null);
  const derniere = g.images - 1; // image vide : la goutte au repos
  const position = (i: number) => `translate(${-(i % g.colonnes) * g.w}px, ${-Math.floor(i / g.colonnes) * g.h}px)`;
  React.useEffect(() => {
    const el = feuille.current;
    if (fixe || !el || typeof el.animate !== 'function') return;
    const cycle = CYCLE_GOUTTE * 1000;
    const images: Keyframe[] = [];
    for (let i = 0; i < g.images; i++) {
      images.push({ offset: (i * 1000) / g.parSeconde / cycle, transform: position(i), easing: 'steps(1, end)' });
    }
    images.push({ offset: 1, transform: position(derniere) });
    const a = el.animate(images, {
      duration: cycle,
      iterations: Infinity,
      delay: 2500 + rang * (cycle / 2),
      fill: 'backwards',
    });
    return () => a.cancel();
    // la géométrie est fixe (geometrie.json)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixe]);
  return (
    <div className="gc-bougie__goutte" data-gc-bougie="goutte" style={place(g)}>
      <div
        ref={feuille}
        className="gc-bougie__feuille"
        style={{
          width: g.w * g.colonnes,
          height: g.h * g.lignes,
          backgroundImage: cssUrl(g.nom),
          transform: position(derniere),
        }}
      />
    </div>
  );
}

export function Bougie({ className }: BougieProps) {
  const feu = useFeu();
  const [reglages] = useReglages();
  const mouvementReduit = useReducedMotion();
  // Figé : le moteur du feu sert déjà l'intensité 1 et dx 0 ; la lecture ci-dessous les neutralise
  // aussi côté calque, sans dépendre de l'ordre des abonnements.
  const fixe = !!mouvementReduit || reglages.feu === false;
  const fixeRef = React.useRef(false);
  fixeRef.current = fixe;
  const dxFeu = useTransform(feu.dx, (v) => (fixeRef.current ? 0 : v));
  const vive = useFlammeVivante(fixe, dxFeu);

  const intensite = useTransform(feu.intensite, (i) => (fixeRef.current ? 1 : i));
  const dx = dxFeu;
  const dy = useTransform(feu.dy, (v) => (fixeRef.current ? 0 : v));

  // Image de secours de la flamme : l'échelle reste dans 0,96 à 1,04, l'opacité dans 0,7 à 1, la rotation dans ± 2° autour de la mèche.
  const echelleFlamme = useTransform(intensite, (i) => r3(borne(1 + 0.08 * (i - 1), 0.96, 1.04)));
  const opaciteFlamme = useTransform(intensite, (i) => r3(borne(0.88 + 0.24 * (i - 1), 0.7, 1)));
  const rotationFlamme = useTransform([dx, vive.penche], ([v, p]: number[]) => r2(borne(0.09 * v, -2, 2) + p));
  const etirementFlamme = useTransform([echelleFlamme, vive.etire], ([a, b]: number[]) => r3(a * b));
  const eclatFlamme = useTransform([opaciteFlamme, vive.eclat], ([a, b]: number[]) => r3(a * b));
  // La cire s'éclaire quand la flamme monte (fondu entre la cire à flamme basse et à flamme haute).
  const opaciteVive = useTransform(intensite, (i) => r3(borne(0.45 + 0.55 * (i - 1), 0.12, 0.9)));
  // Lueur sur la table : elle suit l'intensité et l'éclat de la flamme, grandit un peu avec sa longueur et glisse à peine avec la source.
  const opaciteHalo = useTransform([intensite, vive.eclat], ([i, e]: number[]) => r3(borne(0.8 + 0.4 * (i - 1), 0.5, 1.15) * (0.55 + 0.45 * e)));
  const echelleHalo = useTransform([intensite, vive.hauteur], ([i, h]: number[]) => r3(borne(1 + 0.05 * (i - 1), 0.96, 1.04) * (1 + 0.5 * (h - 1))));
  const glisseX = useTransform(dx, (v) => r2(borne(0.4 * v, -9, 9)));
  // Ombre de la cheminée : plus dense quand le feu flambe, elle bouge à l'opposé de la source.
  const opaciteOmbre = useTransform(intensite, (i) => r3(borne(0.34 + 0.22 * (i - 1), 0.2, 0.5)));
  const ombreX = useTransform(dx, (v) => r2(borne(-0.35 * v, -8, 8)));
  const ombreY = useTransform(dy, (v) => r2(borne(-0.35 * v, -4, 4)));

  return (
    <LazyMotion features={domMax}>
      <div className={['gc-bougie', className].filter(Boolean).join(' ')} data-gc-bougie="bougie" aria-hidden="true">
        <m.div
          className="gc-bougie__ombre gc-bougie__pose"
          data-gc-bougie="ombre"
          style={{ ...place(geo.ombre), backgroundImage: cssUrl('bougie/ombre'), opacity: opaciteOmbre, x: ombreX, y: ombreY }}
        />
        {!LUMIERE_TRACEE && <m.div
          className="gc-bougie__halo"
          data-gc-bougie="halo"
          style={{ ...place(geo.halo), backgroundImage: cssUrl('bougie/halo'), opacity: opaciteHalo, scale: echelleHalo, x: glisseX }}
        />}
        <div
          className="gc-bougie__cire gc-bougie__pose"
          data-gc-bougie="cire"
          style={{ ...place(geo.cire), backgroundImage: cssUrl('bougie/cire') }}
        />
        <m.div
          className="gc-bougie__cire gc-bougie__pose"
          data-gc-bougie="vive"
          style={{ ...place(geo.cire), backgroundImage: cssUrl('bougie/cire-vive'), opacity: fixe ? 0.45 : opaciteVive }}
        />
        {!fixe && geo.gouttes.map((g, k) => <Goutte key={g.nom} g={g} rang={k} fixe={fixe} />)}
        {vive.rendu === 'toile' ? (
          <canvas ref={vive.toile} className="gc-bougie__flamme gc-bougie__pose" data-gc-bougie="flamme" style={place(FLAMME)} />
        ) : (
          <m.div
            ref={vive.cadre}
            className="gc-bougie__flamme gc-bougie__flamme--image gc-bougie__pose"
            data-gc-bougie="flamme"
            style={{
              ...place(FIXE),
              backgroundImage: cssUrl('bougie/flamme-fixe'),
              transformOrigin: `${FIXE.pivot[0]}% ${FIXE.pivot[1]}%`,
              opacity: eclatFlamme,
              scale: etirementFlamme,
              rotate: rotationFlamme,
            }}
          />
        )}
      </div>
    </LazyMotion>
  );
}
