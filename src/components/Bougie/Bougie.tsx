import React from 'react';
import { LazyMotion, domMax, m, useMotionValue, useTransform, useReducedMotion } from '../../lib/motion';
import { useFeu } from '../../lib/feu';
import { useReglages } from '../../lib/reglages';
import { cssUrl } from '../../lib/assets';
import { ecouterPointeur } from '../../lib/pointeur';
import geo from './geometrie.json';
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
// elle), les gouttes de cire liquide qui coulent le long de deux coulures, la flamme. Tout passe par
// transform et opacity : la flamme, la lueur, la cire éclairée et l'ombre suivent le feu (src/lib/feu.ts) ;
// les gouttes sont des planches d'images qu'une animation Web (transform, par paliers) fait défiler. Aucun
// filtre à l'exécution.
//
// La flamme vit en plus par elle-même (balancement lent, étirements, petits sauts au hasard) et répond à la
// main : un passage rapide près d'elle la couche dans le sens du mouvement, elle vacille puis se redresse
// (un ressort amorti, poussé par la vitesse du pointeur projetée sur la normale de la flamme).
//
// Mouvement réduit (système ou réglage) ou réglage feu: false : tout est immobile (flamme fixe, aucune goutte).
// Rien ne capte le pointeur : on écoute seulement ses mouvements (src/lib/pointeur.ts). Sur téléphone en
// portrait, le CSS ne garde que la lueur.

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;
const r2 = (v: number) => Math.round(v * 1e2) / 1e2;

// La flamme part de la mèche (pivot) vers le bas à gauche de l'écran : son axe et la direction dans laquelle
// une rotation positive (sens horaire à l'écran) déplace sa pointe.
const AXE = [-0.87, 0.49];
const NORMALE = [-AXE[1], AXE[0]];
const RAIDEUR = 60; // ressort de l'inclinaison (≈ 1,2 oscillation par seconde)
const AMORTI = 6;
const POUSSEE = 2.6; // (°/s²) par px/s de vent, au contact : un passage à 1000 px/s la couche d'environ 20°
const PENCHE_MAX = 35;

/** Balancement, étirement et opacité propres de la flamme, et sa réponse au vent de la main. */
function useFlammeVivante(el: React.RefObject<HTMLElement | null>, fixe: boolean) {
  const penche = useMotionValue(0);
  const etire = useMotionValue(1);
  const eclat = useMotionValue(1);
  React.useEffect(() => {
    if (fixe) {
      penche.set(0);
      etire.set(1);
      eclat.set(1);
      return;
    }
    let th = 0; // inclinaison due au vent (°)
    let om = 0; // sa vitesse (°/s)
    let trouble = 0; // 0..1 : la flamme dérangée vacille vite et baisse
    let saut = 0; // petit saut de flamme au hasard
    let prochainSaut = performance.now() + 1500 + Math.random() * 3000;
    let boite: DOMRect | null = null;
    let lue = 0;
    let vu = 0;
    let avant = performance.now();
    let raf = 0;
    const desab = ecouterPointeur((p) => {
      const node = el.current;
      if (!node) return;
      if (!boite || p.t - lue > 500) {
        boite = node.getBoundingClientRect();
        lue = p.t;
      }
      if (!boite.width) return;
      // centre de la flamme (milieu entre la mèche et la pointe)
      const cx = boite.left + 0.5 * boite.width;
      const cy = boite.top + 0.5 * boite.height;
      const R = 3.5 * boite.width;
      const prox = borne(1 - Math.hypot(p.x - cx, p.y - cy) / R, 0, 1);
      if (!prox) return;
      // le vent pousse la pointe dans le sens du mouvement, plus fort tout près ; la flamme se trouble
      const dt = borne((p.t - vu) / 1000, 0.004, 1 / 30);
      vu = p.t;
      om += POUSSEE * prox * prox * (p.vx * NORMALE[0] + p.vy * NORMALE[1]) * dt;
      trouble = Math.min(1, trouble + 3 * prox * ((p.vx * p.vx + p.vy * p.vy) / 1e6) * dt);
    });
    const image = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - avant) / 1000);
      avant = now;
      om += (-RAIDEUR * th - AMORTI * om) * dt;
      th = borne(th + om * dt, -PENCHE_MAX, PENCHE_MAX);
      trouble *= Math.exp(-2.5 * dt);
      saut *= Math.exp(-14 * dt);
      if (now > prochainSaut) {
        saut = 0.07 + Math.random() * 0.07;
        prochainSaut = now + 1800 + Math.random() * 4500;
      }
      const t = now / 1000;
      const balance = 2.6 * Math.sin(1.3 * t) + 1.5 * Math.sin(2.9 * t + 1) + 0.7 * Math.sin(7.1 * t + 2);
      const vacille = trouble * (5 * Math.sin(23 * t) + 3 * Math.sin(37 * t + 1));
      penche.set(r2(balance + th + vacille));
      etire.set(r3(1 + 0.045 * Math.sin(3.7 * t) + 0.025 * Math.sin(9.3 * t + 0.5) - saut - 0.16 * trouble + 0.05 * trouble * Math.sin(29 * t)));
      eclat.set(r3(1 - 0.5 * saut - 0.28 * trouble * (0.6 + 0.4 * Math.sin(31 * t))));
      raf = requestAnimationFrame(image);
    };
    raf = requestAnimationFrame(image);
    return () => {
      desab();
      cancelAnimationFrame(raf);
    };
  }, [el, fixe, penche, etire, eclat]);
  return { penche, etire, eclat };
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
  const flamme = React.useRef<HTMLDivElement>(null);
  const vive = useFlammeVivante(flamme, fixe);

  const intensite = useTransform(feu.intensite, (i) => (fixeRef.current ? 1 : i));
  const dx = useTransform(feu.dx, (v) => (fixeRef.current ? 0 : v));
  const dy = useTransform(feu.dy, (v) => (fixeRef.current ? 0 : v));

  // Flamme : l'échelle reste dans 0,96 à 1,04, l'opacité dans 0,7 à 1, la rotation dans ± 2° autour de la mèche.
  const echelleFlamme = useTransform(intensite, (i) => r3(borne(1 + 0.08 * (i - 1), 0.96, 1.04)));
  const opaciteFlamme = useTransform(intensite, (i) => r3(borne(0.88 + 0.24 * (i - 1), 0.7, 1)));
  const rotationFlamme = useTransform([dx, vive.penche], ([v, p]: number[]) => r2(borne(0.09 * v, -2, 2) + p));
  const etirementFlamme = useTransform([echelleFlamme, vive.etire], ([a, b]: number[]) => r3(a * b));
  const eclatFlamme = useTransform([opaciteFlamme, vive.eclat], ([a, b]: number[]) => r3(a * b));
  // La cire s'éclaire quand la flamme monte (fondu entre la cire à flamme basse et à flamme haute).
  const opaciteVive = useTransform(intensite, (i) => r3(borne(0.45 + 0.55 * (i - 1), 0.12, 0.9)));
  // Lueur sur la table : elle suit l'intensité et glisse à peine avec la source.
  const opaciteHalo = useTransform([intensite, vive.eclat], ([i, e]: number[]) => r3(borne(0.8 + 0.4 * (i - 1), 0.5, 1.15) * (0.55 + 0.45 * e)));
  const echelleHalo = useTransform(intensite, (i) => r3(borne(1 + 0.05 * (i - 1), 0.96, 1.04)));
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
        <m.div
          className="gc-bougie__halo"
          data-gc-bougie="halo"
          style={{ ...place(geo.halo), backgroundImage: cssUrl('bougie/halo'), opacity: opaciteHalo, scale: echelleHalo, x: glisseX }}
        />
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
        <m.div
          ref={flamme}
          className="gc-bougie__flamme gc-bougie__pose"
          data-gc-bougie="flamme"
          style={{
            ...place(geo.flamme),
            backgroundImage: cssUrl('bougie/flamme'),
            transformOrigin: `${geo.flamme.pivot[0]}% ${geo.flamme.pivot[1]}%`,
            opacity: eclatFlamme,
            scale: etirementFlamme,
            rotate: rotationFlamme,
          }}
        />
      </div>
    </LazyMotion>
  );
}
