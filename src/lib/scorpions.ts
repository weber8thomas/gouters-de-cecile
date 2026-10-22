// Les huit scorpions cachés : leur liste vient de src/content/scorpions.json, les trouvés sont mémorisés ici
// (une clé à eux, remise à zéro avec les autres découvertes). Un scorpion trouvé ne réapparaît plus.
import config from '../content/scorpions.json';

export type VueScorpion = 'a' | 'b' | 'c';
export interface DefScorpion {
  id: string; page: string; x: number; y: number; vue: VueScorpion; angle: number; fuite: number;
  taille?: number; coupe?: string;
}
export const SCORPIONS = config.scorpions as unknown as DefScorpion[];
export const MESSAGE_SCORPIONS = config.message;

export const CLE_SCORPIONS = 'gc:scorpions:v1';
/** Annonce la dernière trouvaille : la carte finale s'ouvre quand la fuite est finie. */
export const SCORPIONS_COMPLET_EVENT = 'gc-scorpions-complet';
export const SCORPIONS_CARTE_EVENT = 'gc-scorpions-carte';

export interface EtatScorpions { trouves: string[] }
export const SCORPIONS_INITIAL: EtatScorpions = { trouves: [] };

/** Stockage abîmé ou ancien : on ne garde que les identifiants connus, sans doublon. */
export function lireEtatScorpions(valeur: string | null): EtatScorpions {
  try {
    const v = JSON.parse(valeur ?? 'null');
    if (v && Array.isArray(v.trouves)) {
      const connus = new Set(SCORPIONS.map((s) => s.id));
      return { trouves: [...new Set<string>(v.trouves.filter((i: unknown): i is string => typeof i === 'string' && connus.has(i)))] };
    }
  } catch { /* repartir de zéro */ }
  return SCORPIONS_INITIAL;
}

let etat: EtatScorpions | undefined;
const abonnes = new Set<() => void>();
export function etatScorpions(): EtatScorpions {
  if (!etat) {
    try { etat = lireEtatScorpions(localStorage.getItem(CLE_SCORPIONS)); }
    catch { etat = SCORPIONS_INITIAL; }
  }
  return etat;
}
function stockage(e: StorageEvent) {
  if (e.key !== CLE_SCORPIONS && e.key !== null) return;
  etat = lireEtatScorpions(e.key === null ? null : e.newValue);
  abonnes.forEach((f) => f());
}
export function abonnerScorpions(f: () => void): () => void {
  abonnes.add(f);
  if (abonnes.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', stockage);
  return () => {
    abonnes.delete(f);
    if (!abonnes.size && typeof window !== 'undefined') window.removeEventListener('storage', stockage);
  };
}
function ecrire(suivant: EtatScorpions) {
  etat = suivant;
  try { localStorage.setItem(CLE_SCORPIONS, JSON.stringify(etat)); }
  catch { /* la chasse reste jouable en mémoire sans stockage */ }
  abonnes.forEach((f) => f());
}
/** Marque un scorpion comme trouvé ; renvoie true si c'était le dernier. */
export function trouverScorpion(id: string): boolean {
  const actuel = etatScorpions();
  if (actuel.trouves.includes(id) || !SCORPIONS.some((s) => s.id === id)) return false;
  ecrire({ trouves: [...actuel.trouves, id] });
  return etatScorpions().trouves.length === SCORPIONS.length;
}
/** « Recommencer les découvertes » : tous les scorpions reviennent à leur place. */
export function rejouerScorpions(): void {
  if (!etatScorpions().trouves.length) return;
  ecrire(SCORPIONS_INITIAL);
}
