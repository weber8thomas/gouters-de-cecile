// Contrat d'un écrin vidéo (voir CONTRACT.md § Écrins). Les coordonnées sont en unités du viewBox.

export type Aperture =
  | { shape: 'circle'; cx: number; cy: number; r: number }
  | { shape: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { shape: 'rect'; x: number; y: number; w: number; h: number; rotate?: number };

export interface EcrinManifest {
  id: string;
  label: string; // « Cloche à gâteau »
  chapter: string | null; // id de chapitre, null pour les jokers
  viewBox: [number, number]; // largeur, hauteur (origine 0 0)
  aperture: Aperture; // ouverture vidéo, définie une seule fois
  bleed: number; // débord du masque au-delà de l'ouverture (4)
  focus: [number, number]; // point focal du recadrage (0–1), ex. [0.5, 0.42]
  cup: { x: number; y: number } | null; // centre du bas de la soucoupe de la tasse-progression (taille fixe : --gc-cup-size)
  caption: { x: number; y: number; w: number; rotate?: number } | null; // légende manuscrite : coin haut-gauche + largeur (unités du viewBox)
  lift?: { dx: number; dy: number; rotate: number }; // cloche : dôme soulevé (translation puis rotation en degrés, pivot = centre de l'ouverture)
  variants: { id: string; label: string }[];
}

export interface EcrinFiles {
  back?: string; // SVG derrière la vidéo
  front?: string; // SVG devant la vidéo (couvre la bande de débord)
  mask: string; // SVG du masque : ouverture + débord en blanc sur transparent
  dome?: string; // cloche uniquement
}

export interface EcrinEntry {
  manifest: EcrinManifest;
  variants: Record<string, EcrinFiles>;
}
