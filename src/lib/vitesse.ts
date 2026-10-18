// Vitesses réglables en pourcentage (menu ⚙, réglages vitesseEcriture et vitesseAnimations) : un facteur
// pour chacune, 1 = normal (100 %), lu à chaque départ d'animation, plus un abonnement pour celles qui
// doivent suivre le réglage en cours de route.
//   - facteurEcriture()   : l'encre qui s'écrit sur les pages (25 à 400 %) : durée ÷ facteur ;
//   - facteurAnimations() : les animations du carnet (25 à 200 %) : le tour de page (ressort « paper », réglé
//     par src/lib/motion.ts), et ce que les autres lots voudront bien en lire (aquarelles vivantes,
//     étincelles) : durée ÷ facteur, ou cadence × facteur.
// Le mouvement réduit (système ou réglage) n'y change rien : il coupe les animations, il ne les ralentit pas.
import { abonnerReglages, getReglages } from './reglages';

/** Facteur de la vitesse d'écriture de l'encre (1 = normal). */
export const facteurEcriture = (): number => getReglages().vitesseEcriture;

/** Facteur de la vitesse des animations (1 = normal). */
export const facteurAnimations = (): number => getReglages().vitesseAnimations;

/** Appelle `f` quand l'un des deux facteurs change. Renvoie la fonction de désabonnement. */
export function abonnerVitesse(f: () => void): () => void {
  let e = facteurEcriture();
  let a = facteurAnimations();
  return abonnerReglages(() => {
    if (e === facteurEcriture() && a === facteurAnimations()) return;
    e = facteurEcriture();
    a = facteurAnimations();
    f();
  });
}
