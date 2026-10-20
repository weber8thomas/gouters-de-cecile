/** Une quête courte, dans l'ordre du carnet. Aucun récit biographique n'est inventé. */
export const CACHETTES = [
  {
    id: 'serment', page: 'garde', double: 'titre', dessin: 'cle-ancienne',
    titre: 'Le serment gourmand', pageTitre: 'Ce carnet appartient à Cécile', chercher: 'la petite clé', lieu: 'la page « Ce carnet appartient à Cécile »',
    appel: 'Ouvre le début du carnet. Une petite clé t’attend sur la page qui appartient à Cécile.',
    indice: 'Certains mots n’apparaissent qu’une fois la poussière écartée…',
    amorce: 'Un carnet bien gardé…',
    revelation: 'Je jure solennellement que mes intentions sont gourmandes',
    suite: 'Premier indice : tourne vers le premier album « Le goût des bonnes choses ». Cherche une enveloppe entre les photos.',
  },
  {
    id: 'album', page: 'cecile-1-droite', double: 'cecile-1', dessin: 'enveloppe',
    titre: 'Terrible Cécile ?', pageTitre: 'Le goût des bonnes choses', chercher: 'la petite enveloppe', lieu: 'le premier album « Le goût des bonnes choses »',
    appel: 'Dans le premier album, cherche la petite enveloppe entre les photos.',
    indice: 'Les souvenirs se glissent parfois entre deux images.',
    amorce: 'Terrible Cécile ? Regardons l’album…',
    revelation: 'Alors, qui reconnaît Cécile sur ces photos ?',
    question: 'Et toi, Cécile : quel souvenir te revient ?',
    suite: 'La piste continue dans l’album « Cécile, côté cuisine ». Une carte des étoiles t’y attend.',
  },
  {
    id: 'douce', page: 'cecile-2-droite', double: 'cecile-2', dessin: 'carte-etoiles',
    titre: 'Douce Cécile…', pageTitre: 'Cécile, côté cuisine', chercher: 'la carte des étoiles', lieu: 'l’album « Cécile, côté cuisine »',
    appel: 'Dans la suite de l’album, cherche la carte des étoiles entre les photos.',
    indice: 'Une apparence paisible… les étoiles auraient-elles autre chose à dire ?',
    amorce: 'Oh, Cécile est si calme et douce…',
    revelation: 'Scorpion ascendant Scorpion. Les proches savent.',
    question: 'Qui ose commenter les photos, maintenant ?',
    suite: 'Prochaine escale : « Gâteaux & cakes », après le sommaire. Cordon bleu a laissé une petite surprise près du gâteau.',
  },
  {
    id: 'cordon-bleu', page: 'gateaux-droite', double: 'gateaux', dessin: 'oeufs',
    titre: 'Le tour de main de Cordon bleu', pageTitre: 'Gâteaux & cakes', chercher: 'les petits œufs', lieu: 'l’intercalaire « Gâteaux & cakes »',
    appel: 'Va à « Gâteaux & cakes », après le sommaire. Cherche les petits œufs près du gâteau.',
    indice: 'Il reste peut-être un petit quelque chose sur le plan de travail.',
    amorce: 'Fée du logis ou Cordon bleu ? L’indice est en cuisine.',
    revelation: 'Le secret est dans les recettes : huit proches ont confié les leurs à ce carnet.',
    suite: 'À toi de les feuilleter. La dernière cachette est tout au bout, sur la page « À suivre… ». Cherche la bougie.',
  },
  {
    id: 'anniversaire', page: 'fin-gauche', double: 'fin', dessin: 'cupcake-bougie',
    titre: 'Encore un petit vœu ?', pageTitre: 'À suivre…', chercher: 'la petite bougie', lieu: 'la dernière double page « À suivre… »',
    appel: 'Tout au bout du carnet, une bougie t’attend sur la page « À suivre… ».',
    indice: 'Il faut bien garder un vœu pour la fin.',
    amorce: 'Trente ans… et la suite ?',
    revelation: '30 ans, huit recettes, et encore beaucoup de goûters à partager.',
    suite: 'Les cinq cachettes sont retrouvées. Joyeux anniversaire, Cécile !',
  },
] as const;

export const CLE_QUETE = 'gc:quete:v1';
export const QUETE_OUVRIR_EVENT = 'gc-quete-ouvrir';
export interface EtatQuete { trouves: number; revele: boolean }
export const QUETE_INITIALE: EtatQuete = { trouves: 0, revele: false };
export type ActionQuete = { type: 'reveler' | 'valider'; index: number } | { type: 'rejouer' };

export function lireEtatQuete(valeur: string | null): EtatQuete {
  try {
    const v = JSON.parse(valeur ?? 'null');
    if (v && Number.isInteger(v.trouves) && v.trouves >= 0 && v.trouves <= CACHETTES.length) {
      return { trouves: v.trouves, revele: v.trouves < CACHETTES.length && v.revele === true };
    }
  } catch { /* Stockage abîmé : repartir de la première cachette. */ }
  return QUETE_INITIALE;
}

/** Une cachette future ne peut ni se révéler, ni se valider avant la précédente. */
export function avancerQuete(etat: EtatQuete, action: ActionQuete): EtatQuete {
  if (action.type === 'rejouer') return QUETE_INITIALE;
  if (action.index !== etat.trouves || etat.trouves >= CACHETTES.length) return etat;
  if (action.type === 'reveler') return etat.revele ? etat : { ...etat, revele: true };
  return etat.revele ? { trouves: etat.trouves + 1, revele: false } : etat;
}

let etat: EtatQuete | undefined;
const abonnes = new Set<() => void>();
export function etatQuete(): EtatQuete {
  if (!etat) {
    try { etat = lireEtatQuete(localStorage.getItem(CLE_QUETE)); }
    catch { etat = QUETE_INITIALE; }
  }
  return etat;
}
export function abonnerQuete(f: () => void): () => void {
  abonnes.add(f);
  if (abonnes.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', stockage);
  return () => {
    abonnes.delete(f);
    if (!abonnes.size && typeof window !== 'undefined') window.removeEventListener('storage', stockage);
  };
}
function stockage(e: StorageEvent) {
  if (e.key !== CLE_QUETE && e.key !== null) return;
  etat = lireEtatQuete(e.key === null ? null : e.newValue);
  abonnes.forEach((f) => f());
}
export function agirQuete(action: ActionQuete): void {
  const suivant = avancerQuete(etatQuete(), action);
  if (suivant === etat) return;
  etat = suivant;
  try { localStorage.setItem(CLE_QUETE, JSON.stringify(etat)); }
  catch { /* La quête reste jouable en mémoire sans stockage. */ }
  abonnes.forEach((f) => f());
}
