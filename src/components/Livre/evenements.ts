// Événements de geste du livre : « gc-livre-geste » (bulle jusqu'au document), émis au début et à
// la fin de chaque mouvement. Le banc d'essai (harness/motion.html) s'en sert pour borner ses
// mesures (performance.mark) ; l'application peut s'en servir pour suspendre un travail coûteux.

export const GESTE_EVENT = 'gc-livre-geste';
/** prepa : appui pris en compte (captures d'une transition de vue) ; debut / fin : le mouvement visible. */
export type GestePhase = 'prepa' | 'debut' | 'fin';
export type GesteType = 'page' | 'couverture' | 'zoom' | 'distance' | 'table' | 'fondu';
export interface GesteDetail {
  phase: GestePhase;
  type: GesteType;
  t: number;
}

export function emettre(el: Element | null, phase: GestePhase, type: GesteType): void {
  const target: EventTarget | null = el ?? (typeof document !== 'undefined' ? document : null);
  if (!target) return;
  const detail: GesteDetail = { phase, type, t: performance.now() };
  target.dispatchEvent(new CustomEvent<GesteDetail>(GESTE_EVENT, { bubbles: true, detail }));
}

/** Attend deux images : ce qui vient d'être monté est peint avant que le geste ne commence. */
export const deuxImages = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * Attend que la cadence redevienne régulière : tant que les calques qui viennent d'être montés ne
 * sont pas rastérisés, le navigateur retient les images suivantes (contre-pression du pipeline,
 * visible à la 2ᵉ ou 3ᵉ image). On attend donc au moins 5 images, dont les 3 derniers intervalles
 * sous 34 ms (au plus maxMs). Sur un vrai GPU : 5 images (≈ 80 ms) ; sans GPU : le temps de
 * rastériser le feuillet.
 */
export function cadenceStable(maxMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let prev = 0;
    let n = 0;
    let bons = 0;
    const tick = (t: number) => {
      if (prev) bons = t - prev < 34 ? bons + 1 : 0;
      prev = t;
      n++;
      if ((n >= 5 && bons >= 3) || t - t0 > maxMs) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Attend que les images d'un sous-arbre soient décodées et que les polices soient prêtes,
 * 300 ms au plus : un geste ne démarre jamais sur une page à moitié peinte.
 */
export function pret(el: Element | null, maxMs = 300): Promise<void> {
  const imgs = el ? Array.from(el.querySelectorAll('img')) : [];
  const taches: Promise<unknown>[] = imgs.map((i) => (i.decode ? i.decode().catch(() => undefined) : Promise.resolve()));
  if (typeof document !== 'undefined' && document.fonts) taches.push(document.fonts.ready);
  return Promise.race([Promise.all(taches).then(() => undefined), new Promise<void>((r) => setTimeout(r, maxMs))]);
}
