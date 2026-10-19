# Lumiere

## Surfaces réelles

L'éclairage Cycles de la **table vide** reste fixe sous le livre, avec les variations du feu et de la
bougie. Les silhouettes Cycles figées du livre ne sont plus affichées : elles ne pouvaient suivre ni
la couverture qui bascule, ni le recul de caméra, et laissaient des zones d'ombre et de lumière fantômes.
Les ombres du livre sont ses propres éléments et suivent ses mouvements.

`LumierePapier` est montée dans chaque `Livre/Face`, y compris les copies découpées d'une feuille en
rotation. La pénombre et la lueur ambrée éclairent le papier **avant l'encre**, les tuiles haute définition,
la plume WebGL et les objets collés. Le contraste de l'écriture n'est pas délavé par un voile blanc.
La lueur est plus forte près de la bougie et décroît vers le pli et la page droite. Sa variation
utilise `flammeBougie`, la valeur même de la flamme WebGL ; les modes réduit et feu désactivé la figent.
Aucun filtre, mélange de pixels, changement de géométrie ou rendu React n'est ajouté pendant un geste.

Vérification :

```sh
GC_CHROME=/usr/bin/chromium node scripts/verify-lumiere-v8.mjs --site dist/site
```

Le script ouvre et referme réellement le carnet au clavier aux trois crans, avec WebGL. Le Clock
Playwright avance les vrais rAF de Motion pour examiner la levée, la bascule, la descente et l'état
ouvert. Il compare ensuite l'effet avec/sans bougie sur le même papier et la même encre, vérifie le
vacillement synchronisé à la flamme et les modes figés. Il ne mesure pas les FPS de la TV physique.

Les anciennes images Cycles et leur compositeur restent disponibles pour une future cuisson physique
des surfaces ; la lumière du papier actuelle est une composition locale, sans nouvelle cuisson.

## Dégradés CSS (repli sans images Cycles)

La lumière d'un feu de cheminée hors champ, **à gauche** de la table (plan v4, lot L). Calques de dégradés statiques, peints une fois ; le feu (`src/lib/feu.ts`) ne change que leur opacité et leur translation (MotionValues, aucun rendu React).

| Composant | Où | Contenu | Vivant |
|---|---|---|---|
| `LumiereTable` | sous le contenu (`Stage`) | lueur indirecte orangée côté feu (une seule nappe, très douce), ombre portée générique du livre au repos (cachée livre fermé, pendant l'arrivée, ou si `OmbreFeu` est monté) | opacité + translation (1 calque) |
| `LumiereLivre` | au-dessus du contenu (`Stage`) | ambiance du soir (bandes de bord ou vignettage, pénombre loin du feu), voile chaud plus fort côté feu | voile : opacité (1 calque) ; ambiance statique |
| `OmbreFeu` | **montée dans `Livre`** (`.gc-livre__corps`, avant les cartons, v5) | ombre portée du livre vers la droite, au bord du carton ; elle suit la source (dx, dy) et l'intensité | opacité + translation |

Couleurs : `--gc-feu-flamme`, `--gc-feu-braise`, `--gc-feu-nuit` (mélanges de tokens ; nuit = encre + encre noire) ; source `--gc-feu-x`, `--gc-feu-y` (px de scène).

Vacillement (v5) : l'intensité de `feu.ts` va de 0,6 à 1,6 ; chaque calque la traduit en opacité par `reglage()` (bain 0,2 → 1, ombre 0,2 → 1, voile 0,25 → 1). La table est sombre sur ses bords et au loin (vignettage et nuit, `Stage.css`) ; le livre reste le point le plus clair.

Lisibilité : le voile reste ≤ 4,2 % sur la colonne de texte gauche au plus fort d'une flambée ; la pénombre ≤ 6 % à droite. L'encre garde ≥ 90 % de son contraste (`scripts/verify-lumiere.mjs`).
