# Lumiere

La lumière d'un feu de cheminée hors champ, **à gauche** de la table (plan v4, lot L). Calques de dégradés statiques, peints une fois ; le feu (`src/lib/feu.ts`) ne change que leur opacité et leur translation (MotionValues, aucun rendu React).

| Composant | Où | Contenu | Vivant |
|---|---|---|---|
| `LumiereTable` | sous le contenu (`Stage`) | bain orangé côté feu, reflet chaud sur le vernis, ombre portée générique du livre au repos (cachée livre fermé, pendant l'arrivée, ou si `OmbreFeu` est monté) | opacité + translation (1 calque) |
| `LumiereLivre` | au-dessus du contenu (`Stage`) | ambiance du soir (bandes de bord ou vignettage, pénombre loin du feu), voile chaud plus fort côté feu | voile : opacité (1 calque) ; ambiance statique |
| `OmbreFeu` | **pour le livre (lot A)**, dans `.gc-livre__corps`, avant les cartons | ombre portée par le feu au bord droit du carton | opacité + translation |

Couleurs : `--gc-feu-flamme`, `--gc-feu-braise`, `--gc-feu-nuit` (mélanges de tokens) ; source `--gc-feu-x`, `--gc-feu-y` (px de scène).

Lisibilité : le voile reste ≤ 4,2 % sur la colonne de texte gauche au plus fort d'une flambée ; la pénombre ≤ 6 % à droite. L'encre garde ≥ 90 % de son contraste (`scripts/verify-lumiere.mjs`).
