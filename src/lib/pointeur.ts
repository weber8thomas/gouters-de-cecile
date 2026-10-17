// Le pointeur (souris, stylet, doigt) pour ce qui veut y réagir sans écouter soi-même : la flamme de la
// bougie qui se couche au passage de la main, les dessins qui s'animent sous le curseur. Un seul écouteur
// pointermove sur la fenêtre (passif), posé au premier abonné et retiré au dernier. Position et vitesse en
// px d'écran (vitesse lissée, px/s).

export interface EtatPointeur {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Instant de l'échantillon (ms, même horloge que performance.now). */
  t: number;
  type: string;
}

type Ecouteur = (e: EtatPointeur) => void;

const ecouteurs = new Set<Ecouteur>();
let dernier: EtatPointeur | null = null;

function surMouvement(e: PointerEvent) {
  const t = e.timeStamp;
  let vx = 0;
  let vy = 0;
  if (dernier && t > dernier.t && t - dernier.t < 120) {
    const dt = Math.max(8, t - dernier.t) / 1000;
    vx = 0.4 * dernier.vx + (0.6 * (e.clientX - dernier.x)) / dt;
    vy = 0.4 * dernier.vy + (0.6 * (e.clientY - dernier.y)) / dt;
  }
  dernier = { x: e.clientX, y: e.clientY, vx, vy, t, type: e.pointerType };
  ecouteurs.forEach((f) => f(dernier!));
}

/** Appelle `f` à chaque mouvement du pointeur ; renvoie la fonction de désabonnement. */
export function ecouterPointeur(f: Ecouteur): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!ecouteurs.size) window.addEventListener('pointermove', surMouvement, { passive: true });
  ecouteurs.add(f);
  return () => {
    ecouteurs.delete(f);
    if (!ecouteurs.size) window.removeEventListener('pointermove', surMouvement);
  };
}

/** Le dernier état connu du pointeur (null avant le premier mouvement). */
export const lirePointeur = (): EtatPointeur | null => dernier;
