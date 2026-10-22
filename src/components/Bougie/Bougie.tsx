import React from 'react';
import { useNiveauMouvement } from '../../lib/motion';
import { LUMIERE_TRACEE } from '../Lumiere';
import { useReglages } from '../../lib/reglages';
import { caler, dureePaliers } from '../../lib/horloge';
import { useVacille } from '../../lib/vacille';
import { cssUrl } from '../../lib/assets';
import geo from './geometrie.json';
import sprites from './flamme-sprites.webp';
import feuille from './flamme-sprites.json';
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
// la cire (flamme basse), la cire éclairée (flamme haute, fondue au rythme de la flamme), la flamme.
//
// La flamme n'est plus calculée à l'exécution : c'est le MÊME rendu (le volume émissif WebGL de flamme.ts, reflet dans
// le puits compris) cuit une fois en une boucle de 32 images à 12 i/s (flamme-sprites.webp, 8 × 4 images de 380 × 312 ;
// verification/perf/cuire-flamme.mjs). Elle joue par une animation de transform en marches d'escalier (steps), sur le
// compositeur : ni JavaScript, ni WebGL, ni repeinture. Sa cadence est celle de l'horloge commune de la lumière
// (src/lib/horloge.ts : 12 paliers par seconde, même origine de temps que les lueurs de vacille.ts), pour que tous les
// changements tombent sur les mêmes images composées. La cire éclairée suit la lumière de la flamme cuite (opacité,
// même cycle). Le souffle de la main sur la flamme et les coulées de cire (qui exigeaient la toile WebGL vivante) ont
// disparu. « Animations : réduites » ou feu: false : une seule image de la flamme, immobile. Téléphone debout
// (cadrage « tourner »), le CSS ne garde que la lueur. Rien ne capte le pointeur.

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;
/** La cire éclairée (flamme haute) suit la lumière de la flamme (éclat × longueur). */
const lueurCire = (lumiere: number) => r3(borne(0.45 + 1.6 * (lumiere - 1), 0.15, 0.85));

const FLAMME = geo.flamme;

type Boite = { x: number; y: number; w: number; h: number };
const place = (b: Boite): React.CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h });

/** Lance la boucle cuite : la feuille de sprites saute d'image en image (transform, steps) ; la cire vive suit la lumière. */
function jouerFlamme(feuilleEl: HTMLElement, cireVive: HTMLElement | null): () => void {
  if (typeof feuilleEl.animate !== 'function') return () => {};
  const { n, cols, lignes, lumieres } = feuille; // n images à 12 i/s : n paliers de l'horloge commune
  const duree = dureePaliers(n);
  const pos = (i: number) => `translate(${r3((-(i % cols) / cols) * 100)}%, ${r3((-Math.floor(i / cols) / lignes) * 100)}%)`;
  const images: Keyframe[] = Array.from({ length: n }, (_, i) => ({ offset: i / n, transform: pos(i), easing: 'step-end' }));
  images.push({ offset: 1, transform: pos(0) });
  const a = [caler(feuilleEl.animate(images, { duration: duree, iterations: Infinity }))];
  if (cireVive) {
    const op: Keyframe[] = lumieres.map((l, i) => ({ offset: i / n, opacity: lueurCire(l), easing: 'step-end' })); // paliers : même cadence que la flamme
    op.push({ offset: 1, opacity: lueurCire(lumieres[0]) });
    a.push(caler(cireVive.animate(op, { duration: duree, iterations: Infinity })));
  }
  return () => a.forEach((x) => x.cancel());
}

export function Bougie({ className }: BougieProps) {
  const [reglages] = useReglages();
  const fixe = useNiveauMouvement() === 'reduit' || reglages.feu === false;
  const eclatBougie = reglages.eclatBougie ?? 2;
  const feuilleRef = React.useRef<HTMLDivElement>(null);
  const cireViveRef = React.useRef<HTMLDivElement>(null);
  const haloRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (fixe || !feuilleRef.current) return;
    return jouerFlamme(feuilleRef.current, cireViveRef.current);
  }, [fixe]);
  // Lueur sur la table : suit l'éclat de la flamme (feu moyen), vacille doucement.
  const opaciteHalo = r3(borne(0.8 * (0.55 + 0.45 * (0.6 + 0.4 * eclatBougie)), 0.5, 1));
  useVacille(haloRef, opaciteHalo, 0.08, 0.4);

  return (
    <div className={['gc-bougie', className].filter(Boolean).join(' ')} data-gc-bougie="bougie" aria-hidden="true">
      <div
        className="gc-bougie__ombre gc-bougie__pose"
        data-gc-bougie="ombre"
        style={{ ...place(geo.ombre), backgroundImage: cssUrl('bougie/ombre'), opacity: 0.34 }}
      />
      {!LUMIERE_TRACEE && <div
        ref={haloRef}
        className="gc-bougie__halo"
        data-gc-bougie="halo"
        style={{ ...place(geo.halo), backgroundImage: cssUrl('bougie/halo'), opacity: opaciteHalo }}
      />}
      <div
        className="gc-bougie__cire gc-bougie__pose"
        data-gc-bougie="cire"
        style={{ ...place(geo.cire), backgroundImage: cssUrl('bougie/cire') }}
      />
      <div
        ref={cireViveRef}
        className="gc-bougie__cire gc-bougie__pose"
        data-gc-bougie="vive"
        style={{ ...place(geo.cire), backgroundImage: cssUrl('bougie/cire-vive'), opacity: 0.45 }}
      />
      <div className="gc-bougie__flamme gc-bougie__pose" data-gc-bougie="flamme" style={place(FLAMME)}>
        <div
          ref={feuilleRef}
          className="gc-bougie__feuille"
          style={{ width: `${feuille.cols * 100}%`, height: `${feuille.lignes * 100}%`, backgroundImage: `url(${sprites})` }}
        />
      </div>
    </div>
  );
}
