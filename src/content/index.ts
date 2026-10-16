// Contenu du carnet : chapitres et invités (liste figée dans roster.json + textes dans invites.ts).
import roster from './roster.json';
import { TEXTS } from './invites';
import type { Chapter, ChapterId, Guest } from './types';

export * from './types';

export const chapters = roster.chapters as Chapter[];
export const guests: Guest[] = (roster.guests as Guest[]).map((g) => ({ ...g, ...TEXTS[g.slug] }));

export function getGuest(slug: string): Guest {
  const g = guests.find((x) => x.slug === slug);
  if (!g) throw new Error(`Invité inconnu : ${slug}`);
  return g;
}
export const getChapter = (id: ChapterId): Chapter => chapters.find((c) => c.id === id)!;
export const guestsOf = (id: ChapterId): Guest[] => guests.filter((g) => g.chapter === id);
