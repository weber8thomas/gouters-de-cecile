// Horloge commune de la lumière : 12 paliers par seconde, partagés par TOUTES les animations qui vivent au repos
// (la flamme de la bougie, la cire qu'elle éclaire, les lueurs de lumière.tsx via vacille.ts).
//
// Au repos, l'écran n'est recomposé que lorsqu'une valeur animée change. Quand chaque animation avait sa cadence et son
// départ (flamme 15 i/s, lueurs 7,5 Hz, chacune lancée à son instant), les changements tombaient à des instants
// différents : ≈ 33 recompositions par seconde. Ici :
//   - les durées sont des multiples EXACTS de 1/12 s ;
//   - les décalages de phase sont des nombres entiers de paliers ;
//   - toutes les animations prennent le même `startTime` (l'origine de document.timeline) : un palier commence au
//     même instant partout, et le changement de la flamme, celui de la cire et celui des lueurs tiennent dans la
//     même image composée → ≈ 12 images par seconde (tuiles rastérisées : 0, rAF JS : 0).
export const HORLOGE_HZ = 12;
/** Un palier, en secondes et en millisecondes. */
export const PALIER_S = 1 / HORLOGE_HZ;
export const PALIER_MS = 1000 / HORLOGE_HZ;

/** Durée (ms) de `n` paliers. */
export const dureePaliers = (n: number): number => n * PALIER_MS;

/** Décalage (ms) de `fraction` d'un cycle de `paliers` paliers, arrondi à un palier entier (négatif : en avance). */
export const avancePaliers = (fraction: number, paliers: number): number => -Math.round(fraction * paliers) * PALIER_MS;

/** Cale l'animation sur l'horloge commune (origine de la ligne de temps du document). */
export function caler(a: Animation): Animation {
  try {
    a.startTime = 0;
  } catch {
    /* ligne de temps indisponible : l'animation garde son départ, à un palier près */
  }
  return a;
}
