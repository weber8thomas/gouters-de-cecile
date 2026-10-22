// Densité de pixels des dessins en canvas / WebGL : jamais plus de 2×. Un iPhone est en 3× : une toile à 3× coûte
// 2,25 fois plus de mémoire et de remplissage qu'à 2× pour un gain invisible (le trait est déjà fin à 2×).
// Ne concerne pas les images cuites (le navigateur les réduit tout seul).
export const DPR_MAX = 2;

/** devicePixelRatio, plafonné à 2. */
export const dprDessin = (): number => Math.min(DPR_MAX, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

/** Facteur à appliquer à une toile qui se dessinait à 1 px par px de l'image source : 1 jusqu'à 2×, 2/dpr au-delà. */
export const facteurDpr = (): number => {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return dpr > DPR_MAX ? DPR_MAX / dpr : 1;
};
