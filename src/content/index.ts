// Contenu du carnet : chapitres et invités (liste figée dans roster.json + textes dans invites.ts).
// Les textes passent par frTypo (espaces insécables du français) avant d'être affichés.
import roster from './roster.json';
import { TEXTS, type GuestText } from './invites';
import { frTypo } from '../lib/typo';
import type { Chapter, ChapterId, Guest, Recipe } from './types';

export * from './types';

const typoRecipe = (r: Recipe): Recipe => ({
  ...r,
  title: frTypo(r.title),
  ingredients: r.ingredients.map(frTypo),
  steps: r.steps.map(frTypo),
});
const typoText = (t: GuestText | undefined): Partial<GuestText> =>
  t ? { ...t, recipe: t.recipe && typoRecipe(t.recipe), note: t.note && frTypo(t.note) } : {};

export const chapters = roster.chapters as Chapter[];
export const guests: Guest[] = (roster.guests as Guest[]).map((g) => ({
  ...g,
  video: g.video && { ...g.video, caption: frTypo(g.video.caption) },
  ...typoText(TEXTS[g.slug]),
}));

export function getGuest(slug: string): Guest {
  const g = guests.find((x) => x.slug === slug);
  if (!g) throw new Error(`Invité inconnu : ${slug}`);
  return g;
}
export const getChapter = (id: ChapterId): Chapter => chapters.find((c) => c.id === id)!;
export const guestsOf = (id: ChapterId): Guest[] => guests.filter((g) => g.chapter === id);
