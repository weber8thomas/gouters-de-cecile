# Lumiere

La lumière d'un feu de cheminée hors champ, **à gauche** de la table (plan v4, lot L). Calques de dégradés statiques, peints une fois ; le feu (`src/lib/feu.ts`) ne change que leur opacité et leur translation (MotionValues, aucun rendu React).

| Composant | Où | Contenu | Vivant |
|---|---|---|---|
| `LumiereTable` | sous le contenu (`Stage`) | lueur indirecte orangée côté feu (une seule nappe, très douce), ombre portée générique du livre au repos (cachée livre fermé, pendant l'arrivée, ou si `OmbreFeu` est monté) | opacité + translation (1 calque) |
| `LumiereLivre` | au-dessus du contenu (`Stage`) | ambiance du soir (bandes de bord ou vignettage, pénombre loin du feu), voile chaud plus fort côté feu | voile : opacité (1 calque) ; ambiance statique |
| `OmbreFeu` | **montée dans `Livre`** (`.gc-livre__corps`, avant les cartons, v5) | ombre portée du livre vers la droite, au bord du carton ; elle suit la source (dx, dy) et l'intensité | opacité + translation |

Couleurs : `--gc-feu-flamme`, `--gc-feu-braise`, `--gc-feu-nuit` (mélanges de tokens ; nuit = encre + encre noire) ; source `--gc-feu-x`, `--gc-feu-y` (px de scène).

Vacillement (v5) : l'intensité de `feu.ts` va de 0,6 à 1,6 ; chaque calque la traduit en opacité par `reglage()` (bain 0,2 → 1, ombre 0,2 → 1, voile 0,25 → 1). La table est sombre sur ses bords et au loin (vignettage et nuit, `Stage.css`) ; le livre reste le point le plus clair.

Lisibilité : le voile reste ≤ 4,2 % sur la colonne de texte gauche au plus fort d'une flambée ; la pénombre ≤ 6 % à droite. L'encre garde ≥ 90 % de son contraste (`scripts/verify-lumiere.mjs`).
