// Les mains du carnet : une écriture par invité, toujours aussi lisible quelle que soit la police.
// Taille = hauteur d'x visée du rôle (gc-x-<rôle>, fixée par le cran de distance)
//          ÷ hauteur d'x mesurée de la main (gc-xh-<main>) × majoration (gc-boost-<main>).
import type React from 'react';
import type { HandId, InkId } from '../content/types';

export type { HandId, InkId };
export type HandRole = 'title' | 'body' | 'note' | 'meta' | 'signature' | 'annotation';

export const HANDS: Record<HandId, { family: string; label: string; cursive: boolean; missing: string }> = {
  cecile: { family: 'hand', label: 'Cécile (Caveat)', cursive: false, missing: '' },
  mamie: { family: 'mamie', label: 'Mamie (Playwrite FR Trad)', cursive: true, missing: '½¼¾' },
  ecole: { family: 'ecole', label: 'École (Playwrite FR Moderne)', cursive: true, missing: '½¼¾' },
  soignee: { family: 'soignee', label: 'Soignée (Kalam)', cursive: false, missing: '' },
  feutre: { family: 'feutre', label: 'Feutre (Shantell Sans)', cursive: false, missing: '' },
  capitales: { family: 'capitales', label: 'Capitales (Patrick Hand SC)', cursive: false, missing: '' },
  pressee: { family: 'pressee', label: 'Pressée (La Belle Aurore)', cursive: true, missing: '' },
};

export const INKS: InkId[] = ['plume', 'bic', 'crayon', 'brune', 'noire', 'feutre', 'rouge'];
export const inkVar = (ink: InkId): string => `var(--gc-ink-${ink})`;

/** Style CSS d'un texte écrit dans une main donnée, pour un rôle donné. */
export function handStyle(hand: HandId, role: HandRole, ink?: InkId): React.CSSProperties {
  const s: React.CSSProperties = {
    fontFamily: `var(--font-${HANDS[hand].family})`,
    fontSize: `calc(var(--gc-x-${role}) / var(--gc-xh-${hand}) * var(--gc-boost-${hand}))`,
    lineHeight: `var(--gc-lh-${hand})`,
    fontWeight: hand === 'cecile' ? (role === 'signature' || role === 'title' ? 700 : 500) : hand === 'soignee' && role === 'title' ? 700 : 400,
  };
  if (ink) s.color = inkVar(ink);
  if (hand === 'feutre') s.fontVariationSettings = '"BNCE" 30, "INFM" 70';
  // Traits fins : un léger épaississement pour la lecture à 3 m
  if (hand === 'mamie' || hand === 'capitales' || hand === 'pressee') (s as Record<string, string>).WebkitTextStroke = '0.4px currentColor';
  return s;
}

/** Remplace les glyphes absents de la police de la main (½ → « 1/2 » pour les cursives Playwrite). */
export function handText(text: string, hand: HandId): string {
  if (!HANDS[hand].missing) return text;
  return text.replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/¾/g, '3/4');
}
