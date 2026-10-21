// Index du carnet réellement disponible : aucun auteur ni numéro de page codé en dur.
// Le texte du manifeste comprend aussi les feuilles de suite et les ingrédients qu'elles portent.
import manifeste from '../../content/pages/manifeste.json';
import roster from '../../content/roster.json';
import type { SpreadSpec } from '../../lib/spread';

export const normaliserRecherche = (texte: string): string => texte.toLocaleLowerCase('fr')
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
export interface EntreeCarnet {
  index: number; id: string; titre: string; auteurs: string; folio: number | null;
  texte: string; lignes: string[];
}
export function indexerCarnet(spreads: SpreadSpec[]): EntreeCarnet[] {
  return spreads.flatMap((s, index) => {
    if (!['recette', 'deux-recettes', 'video'].includes(s.kind)) return [];
    const invites = s.invites ?? (s.invite ? [s.invite] : []);
    const auteurs = invites.map(id => roster.guests.find(g => g.slug === id)?.firstName ?? id).join(' & ');
    const pages = Object.values(manifeste.pages).filter(p => p.double === s.id);
    const lignes = pages.flatMap(p => p.texte.split('\n')).filter(Boolean);
    const titre = s.titre ?? s.id;
    const folio = s.folios?.find(f => f != null) ?? null;
    return [{ index, id: s.id, titre, auteurs, folio, lignes, texte: normaliserRecherche([titre, auteurs, ...lignes].join(' ')) }];
  });
}
export function rechercherCarnet(index: EntreeCarnet[], requete: string): EntreeCarnet[] {
  const mots = normaliserRecherche(requete).split(' ').filter(Boolean);
  return index.filter(e => mots.every(mot => e.texte.includes(mot)));
}
export function extraitRecherche(entree: EntreeCarnet, requete: string): string {
  const mots = normaliserRecherche(requete).split(' ').filter(Boolean);
  if (!mots.length) return '';
  return entree.lignes.find(l => mots.some(m => normaliserRecherche(l).includes(m))
    && !normaliserRecherche(entree.titre).includes(normaliserRecherche(l))) ?? '';
}
