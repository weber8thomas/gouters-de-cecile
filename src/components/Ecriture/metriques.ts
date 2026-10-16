// Métriques des mains, lues dans design-system/metrics.json (npm run metrics, mesures au pixel) :
// hauteur d'x, hampes et chiffres (« stems »), chasse moyenne. Une seule source.
import type { HandId } from '../../content/types';
import metrics from '../../../design-system/metrics.json';

/** Police de chaque main (familles des tokens, type.families). */
const FONT: Record<HandId, keyof typeof metrics> = {
  cecile: 'Caveat',
  mamie: 'Playwrite FR Trad',
  ecole: 'Playwrite FR Moderne',
  soignee: 'Kalam',
  feutre: 'Shantell Sans',
  capitales: 'Patrick Hand SC',
  pressee: 'La Belle Aurore',
};

export interface MainMetriques {
  /** Hauteur d'x (em). */
  xh: number;
  /** Hauteur des hampes et des chiffres (em). */
  stems: number;
  /** Chasse moyenne d'un caractère (em). */
  car: number;
}

export function metriques(hand: HandId): MainMetriques {
  const m = metrics[FONT[hand]] as { xHeight: number; stems?: number; ascender: number; avgCharWidth: number };
  return { xh: m.xHeight, stems: m.stems ?? m.ascender, car: m.avgCharWidth };
}

/** Mains écrites lettre par lettre (non liées) : on peut varier chaque lettre sans casser de liaison. */
export const LETTRES: Record<HandId, boolean> = {
  soignee: true,
  feutre: true,
  capitales: true,
  cecile: true,
  mamie: false,
  ecole: false,
  pressee: false,
};
