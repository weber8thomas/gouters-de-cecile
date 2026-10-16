// Contrat d'une double page pour le livre animé (<Livre>, tourne-page) et l'application de la fête.
// Une double page sait se rendre en deux modes :
//   live   → la double page visible : vidéos, mouvement, ambiance ;
//   static → les voisines pré-rendues pour le tourne-page : AUCUNE vidéo, aucun mouvement,
//            images cuites seulement (le feuillet qui tourne en montre des copies).
import React from 'react';
import type { TableKind } from './settings';

export type RenderMode = 'live' | 'static';
export const RenderModeContext = React.createContext<RenderMode>('live');
export const useRenderMode = () => React.useContext(RenderModeContext);

export type SpreadKind = 'couverture' | 'sommaire' | 'intercalaire' | 'video' | 'recette' | 'deux-recettes' | 'finale';

export interface SpreadSpec {
  id: string; // « p04-julie »
  kind: SpreadKind;
  /** @deprecated la table est toujours en bois (plan v3) ; champ retiré par le nettoyage. */
  table?: TableKind;
  /** Invité de la double page (slug du contenu) : « Aller à… » du menu, liens profonds, vidéo. */
  invite?: string;
  /** Nom affiché dans « Aller à… » (« Lisa — Carrot cake »). */
  titre?: string;
  /** Rendu des deux pages (le mode est aussi disponible par useRenderMode()). */
  render: (mode: RenderMode) => { left: React.ReactNode; right: React.ReactNode };
  folios?: [number | null, number | null];
  seed?: number; // papier, taches, rousseurs propres à la double page
}
