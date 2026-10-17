export { BoutonLoupe, textePourcent } from './BoutonLoupe';
export type { BoutonLoupeProps } from './BoutonLoupe';
export {
  creerControleur, zoomFoyer, pincer, bornesAxe, bornesPan, bornerPan, bornerVue, ancrerHaut, zElastique, entreBornes,
  transformLoupe, VUE_REPOS, DOUBLE_MS, DOUBLE_PX, PAS_CLAVIER,
} from './controleur';
export type { Vue, Point, Bornes, ControleurEcran, OptionsControleur } from './controleur';
// L'état de la loupe (src/lib/loupe.ts) n'est pas exposé par src/index.ts : on le ré-exporte ici pour
// l'application, les cartes et les vérifications (window.GoutersDeCecile).
export {
  getLoupe, useLoupe, abonnerLoupe, loupeOccupee, demanderLoupe, ancrerLoupe, publierContenuLoupe, palierVoisin, loupeVisee,
  LOUPE_MIN, LOUPE_MAX, LOUPE_HD, LOUPE_HD_SORTIE, LOUPE_DOUBLE, LOUPE_PALIERS, LOUPE_ZOOME, LOUPE_EVENT,
} from '../../lib/loupe';
export type { EtatLoupe, RectLoupe, LoupeDetail } from '../../lib/loupe';
