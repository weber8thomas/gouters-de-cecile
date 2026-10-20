// Les huit recettes complètes vivent dans recettes/*.json et sont cuites par scripts/pages/recette.py.
// Aucun ancien texte fictif de démonstration n'est injecté par le catalogue historique.
import type { Guest } from './types';
export type GuestText = Pick<Guest, 'recipe' | 'note' | 'signature'>;
export const TEXTS: Record<string, GuestText> = {};
