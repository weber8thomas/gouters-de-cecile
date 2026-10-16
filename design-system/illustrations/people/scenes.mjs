// Recettes des scènes vidéo factices (16:9, viewBox 1600×900). Une scène = un invité attablé,
// composé avec le kit : décor → ombre portée → personnage (derrière la table) → nappe → accessoires
// → bras posés sur la table → rais de lumière.
// Composition centrée : les écrins ronds recadrent au point focal [0,5 ; 0,42] ; visage et tasse
// doivent tenir dans un cercle de rayon ~380 centré en (800, 400).
import roster from '../../../src/content/roster.json' with { type: 'json' };
import {
  createCtx, person, sceneDoc, wall, windowView, shelf, bunting, hoop, tablecloth, lightPatches, glowBeams, castShadow, plate, cakeSlice, saucer,
  teapot, lemon, posy, napkin, crumbs, c,
} from './kit.mjs';

export const SCENE_SIZE = [1600, 900];
const guest = (slug) => roster.guests.find((g) => g.slug === slug);

export const SCENES = {
  julie() {
    const [W, H] = SCENE_SIZE;
    const ctx = createCtx('gc-scene-julie');
    const g = guest('julie');
    const P = { x: 800, y: 318 };
    const julie = person(ctx, g.look, {
      ...P, slug: 'julie', pose: { left: 'fourchette', right: 'tasse' }, tilt: -4, neckline: 'claudine', accessory: 'barrette',
      lashes: true, liquid: g.video.liquid === 'the' ? 'the' : g.video.liquid, forkTo: [-36, 392],
    });
    const tableY = P.y + 297;
    const layers = [
      wall(ctx, { w: W, h: tableY }),
      windowView(ctx, { x0: 196, y0: 104, x1: 516, y1: 492 }),
      shelf(ctx, { x0: 1096, x1: W, y: 262 }),
      bunting(ctx, { from: [640, 46], to: [1640, -10], sag: 62, n: 13 }),
      hoop(ctx, { x: 1452, y: 452, r: 58 }),
      // ombre portée de Julie sur le mur (lumière haut-gauche → ombre décalée bas-droite)
      `<g fill="${c('gc-chocolate')}" opacity="0.1" transform="translate(44 20)">${julie.silhouette}</g>`,
      julie.back,
      tablecloth(ctx, { y: tableY, w: W, h: H }),
      lightPatches(ctx, { patches: [
        [[150, 640], [420, 636], [560, 900], [210, 904]],
        [[452, 636], [600, 634], [790, 900], [600, 904]],
      ] }),
      posy(ctx, { x: 404, y: 716, scale: 0.92 }),
      lemon(ctx, { x: 520, y: 812, kind: 'entier', rotate: -14 }),
      lemon(ctx, { x: 600, y: 846, kind: 'tranche', scale: 0.8 }),
      teapot(ctx, { x: 1196, y: 716 }),
      saucer(ctx, { x: 1000, y: 748, spoon: true }),
      plate(ctx, { x: 792, y: 726 }),
      cakeSlice(ctx, { x: 804, y: 730, kind: 'citron', scale: 0.86 }),
      lemon(ctx, { x: 714, y: 742, kind: 'tranche', scale: 0.62, rotate: 18 }),
      crumbs(ctx, { x: 880, y: 752, n: 7, spread: 30 }),
      crumbs(ctx, { x: 690, y: 786, n: 5, spread: 26 }),
      julie.front,
      glowBeams(ctx, { alpha: 0.2, beams: [
        [[300, 150], [470, 130], [1060, 900], [700, 900]],
        [[250, 300], [330, 290], [600, 900], [430, 900]],
      ] }),
    ];
    return sceneDoc(ctx, SCENE_SIZE, layers, { precision: 0 });
  },
};
