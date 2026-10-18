// Vitesse des animations du carnet (réglage « Vitesse des animations », en %). Version minimale : le
// réglage arrive avec la piste « finitions » ; d'ici là, le facteur vaut 1. Les dessins vivants
// (src/components/Aquarelle) multiplient leur pas de temps par ce facteur, à un seul endroit.

/** Facteur de vitesse des animations : 1 = normal, 0,5 = deux fois plus lent. */
export const facteurAnimations = (): number => 1;
