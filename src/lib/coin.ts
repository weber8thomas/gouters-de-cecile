// Boutons du coin haut gauche (Réglages ⚙, Sommaire, Rechercher) : cachés au repos, ils apparaissent quand
// la souris approche du coin, puis s'effacent 1,5 s après qu'elle l'a quitté. Au doigt (iPad, sans survol),
// un toucher près du coin ou sur le bord haut les montre pendant 3 s.
//
// Aucune boucle ni minuterie au repos : trois écouteurs passifs, une minuterie posée seulement quand les
// boutons sont visibles, et un seul attribut sur la racine de l'Ecran (data-gc-coin-visible) que le CSS lit. Le
// fondu est une transition d'opacité en CSS (Ecran.css). Les boutons marquent data-gc-coin ; ils restent
// visibles tant que leur panneau est ouvert (data-gc-ouvert) ou qu'ils ont le focus clavier (:focus-visible),
// en CSS, sans passer par ici. Le réglage « boutons toujours visibles » les garde affichés.
//
// Le reste des contrôles (barre du haut à droite, flèches, points) garde src/lib/controles.ts.
import { abonnerReglages, getReglages } from './reglages';

/** Délai avant de cacher, la souris sortie de la zone. */
export const COIN_DELAI_SOURIS_MS = 1500;
/** Durée d'affichage après un toucher. */
export const COIN_DELAI_TOUCHER_MS = 3000;
/** Zone de détection : au moins ce carré (px) dans le coin, ou la boîte des boutons élargie de la marge. */
const COIN_MIN = 120;
const MARGE_DROITE = 48;
const MARGE_BAS = 64;
/** Bande du bord haut où un toucher réveille les boutons. */
const BORD_HAUT = 56;
/** Le clic qui suit un toucher « de réveil » est avalé dans ce délai. */
const AVALE_MS = 1500;
/** La boîte des boutons est relue au plus toutes les 1 s (et à chaque redimensionnement). */
const MESURE_MS = 1000;

const SEL = '[data-gc-coin]';
/** Posé sur la racine de l'Ecran tant que les boutons du coin sont montrés (le CSS le lit). */
const ATTR = 'data-gc-coin-visible';

interface Zone { droite: number; bas: number }

/** Branche le coin sur la racine d'un Ecran ; renvoie la fonction qui débranche. */
export function brancherCoin(racine: HTMLElement): () => void {
  let visible = false;
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  let zone: Zone = { droite: COIN_MIN, bas: COIN_MIN };
  let mesureA = -1e9;
  let avaleDepuis = -1e9;

  const poser = (v: boolean): void => {
    if (v === visible) return;
    visible = v;
    racine.toggleAttribute(ATTR, v);
    if (v) mesureA = -1e9;
  };
  const annuler = (): void => {
    if (minuterie) clearTimeout(minuterie);
    minuterie = null;
  };
  const montrer = (duree: number | null): void => {
    annuler();
    poser(true);
    if (duree != null) minuterie = setTimeout(() => { minuterie = null; poser(toujours()); }, duree);
  };
  const laisser = (duree: number): void => {
    if (!visible || minuterie) return;
    minuterie = setTimeout(() => { minuterie = null; poser(toujours()); }, duree);
  };
  const toujours = (): boolean => getReglages().boutonsToujoursVisibles;

  // Boîte des boutons du coin (px d'écran), élargie vers la droite et le bas. Mise en cache : pas de lecture
  // de géométrie à chaque mouvement.
  const mesurer = (): void => {
    const t = performance.now();
    if (t - mesureA < MESURE_MS) return;
    mesureA = t;
    let droite = 0, bas = 0;
    racine.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) { droite = Math.max(droite, r.right); bas = Math.max(bas, r.bottom); }
    });
    zone = { droite: Math.max(COIN_MIN, droite + MARGE_DROITE), bas: Math.max(COIN_MIN, bas + MARGE_BAS) };
  };
  const dansZone = (x: number, y: number): boolean => {
    // Rejet rapide, sans mesure : loin du coin.
    if (x > 900 || y > 500) return false;
    mesurer();
    return x <= zone.droite && y <= zone.bas;
  };

  // Souris (ou stylet en survol) : la zone montre, la sortie laisse 1,5 s.
  const bouge = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || toujours()) return;
    if (dansZone(e.clientX, e.clientY)) {
      if (!visible || minuterie) montrer(null);
    } else laisser(COIN_DELAI_SOURIS_MS);
  };
  // Doigt : un toucher près du coin ou sur le bord haut montre 3 s ; si les boutons étaient cachés, le
  // toucher ne fait que les montrer (le clic qui suit, tombé sur un bouton encore invisible, est avalé).
  const pose = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' || toujours()) return;
    if (!dansZone(e.clientX, e.clientY) && e.clientY > BORD_HAUT) return;
    if (!visible && e.target instanceof Element && e.target.closest(SEL)) avaleDepuis = performance.now();
    montrer(COIN_DELAI_TOUCHER_MS);
  };
  const clic = (e: MouseEvent): void => {
    if (performance.now() - avaleDepuis > AVALE_MS) return;
    avaleDepuis = -1e9;
    if (!(e.target instanceof Element) || !e.target.closest(SEL)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  // La souris quitte la fenêtre : comme une sortie de zone.
  const sort = (e: PointerEvent): void => { if (e.pointerType !== 'touch') laisser(COIN_DELAI_SOURIS_MS); };
  const redim = (): void => { mesureA = -1e9; };

  const opt = { capture: true, passive: true } as const;
  window.addEventListener('pointermove', bouge, opt);
  window.addEventListener('pointerdown', pose, opt);
  window.addEventListener('click', clic, true);
  document.documentElement.addEventListener('pointerleave', sort);
  window.addEventListener('resize', redim);
  // « Toujours visibles » : affiché en permanence ; sinon retour au repos.
  const surReglages = (): void => { if (toujours()) montrer(null); else if (visible && !minuterie) laisser(COIN_DELAI_SOURIS_MS); };
  const desabonner = abonnerReglages(surReglages);
  surReglages();
  return () => {
    annuler();
    window.removeEventListener('pointermove', bouge, opt);
    window.removeEventListener('pointerdown', pose, opt);
    window.removeEventListener('click', clic, true);
    document.documentElement.removeEventListener('pointerleave', sort);
    window.removeEventListener('resize', redim);
    desabonner();
    racine.removeAttribute(ATTR);
  };
}
