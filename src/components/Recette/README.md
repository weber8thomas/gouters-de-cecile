# Recette

La recette manuscrite d'un invité, telle qu'on la lit en haut de la page de droite d'une page vidéo : titre en serif souligné d'une vague à la plume, temps et parts avec leurs petits pictogrammes, ingrédients sur deux colonnes, étapes numérotées dans des cercles tracés à la main.

## Quand l'utiliser

- Sur la page de droite d'une page vidéo (TV 1920×1080) : la recette occupe le haut de la zone de texte (760 px de large) et le `PetitMot` se pose dessous, en bas de page.
- Partout où une recette du carnet doit être lue à 3 m.
- Pas pour l'impression A5 : ce composant utilise les styles TV (`gc-hand-body`, `gc-recipe-title`…), pas les styles `gc-a5-…`.

## Ce que fournit le consommateur

| Prop | Valeurs | Rôle |
|---|---|---|
| `recipe` | `Recipe` (`src/content/types.ts`) : `title`, `prep`, `cook?`, `rest?`, `servings`, `ingredients[]`, `steps[]` | Tout le texte affiché vient d'ici. Le composant n'ajoute que les intitulés « Ingrédients » et « Préparation » et les libellés accessibles des pictogrammes. |
| `density` | `'normal'` (par défaut) ou `'compact'` | `normal` : ingrédients et étapes en `gc-hand-body` (44 px). `compact` : `gc-hand-compact` (40 px) et respirations resserrées, pour une recette longue ou une double page à deux recettes. |
| `className` | chaîne | Classe ajoutée à la racine `.gc-recette` (placement dans la page). |

Les titres sont en Playfair Display : `useTitleClass('recipe-title')` et `useTitleClass('section-label')` donnent les styles `gc-recipe-title` (72 px) et `gc-section-label` (36 px, italique).

## Règles d'usage

- **Titre** : `gc-recipe-title`, couleur `--gc-ink-title`, sur une seule ligne. Dessous, une vague à la plume en `--gc-terracotta-500`, calée environ 12 px sous la ligne de base.
- **Méta** (préparation, cuisson, repos, parts) : `gc-hand-meta` en `--gc-chocolate`. Chaque valeur est précédée d'un pictogramme dessiné (horloge, flamme, sablier, part de gâteau) au trait de 3 unités en `--gc-chocolate` ; seule la fraise sur la part a une touche de `--gc-terracotta-300`. Les valeurs absentes (`cook`, `rest`) disparaissent avec leur pictogramme.
- **Intitulés** : `gc-section-label`, en `--gc-chocolate`, prolongés par un filet tracé à la main en `--gc-terracotta-300`.
- **Ingrédients** : deux colonnes lues de haut en bas, `--gc-ink`, chaque ligne précédée d'une feuille de sauge (`--gc-sage-300`, nervure et contour `--gc-sage-700`). Les colonnes sont égales tant que le contenu le permet ; sinon la colonne de gauche s'élargit et celle de droite prend le reste.
- **Étapes** : chiffre Caveat `gc-hand-meta` en `--gc-chocolate` dans un cercle tracé d'un geste en `--gc-terracotta-500` (le raccord du cercle tourne d'une étape à l'autre) ; texte en `--gc-ink`.
- **Espacements** : `--gc-space-5` entre l'en-tête et chaque section, `--gc-space-4` entre le numéro et le texte, `--gc-space-1` entre deux étapes.
- **Garde de débordement** : la racine porte `data-gc-fit="ok"` ou `"overflow"`. En cas de débordement elle reçoit aussi `gc-recette--overflow` (contour pointillé `--gc-jam`). La garde compare des boîtes de mise en page, recalculées par un `ResizeObserver` et au chargement des polices :
  1. le contenu de la recette sort de sa propre boîte ;
  2. ou la pile des enfants en flux de son **parent direct** (recette, puis petit mot) dépasse la zone de contenu de ce parent.

  Placez donc `Recette` directement dans la zone de texte de la page (colonne flex de hauteur fixe).

## À faire

- Poser `Recette` puis `PetitMot` dans un conteneur `display: flex; flex-direction: column` de la hauteur de la zone de texte, et donner `margin-top: auto` au `PetitMot` (via `className`).
- Raccourcir le texte quand `data-gc-fit="overflow"` apparaît.
- Passer en `density="compact"` pour une recette longue, en gardant à l'esprit que ce n'est pas un rattrapage illimité (voir le budget).

## À éviter

- Réduire une taille de texte pour « faire tenir » : on raccourcit le texte, jamais la taille (planchers : Caveat 38 px, Cormorant 36 px, Playfair 27 px).
- Ajouter du texte qui ne vient pas de `recipe`.
- Envelopper la recette dans un conteneur de hauteur automatique : la garde ne verrait plus la limite de la page.
- Poser la recette sur une couleur de décor : elle se lit sur `--gc-paper`, `--gc-paper-lace` ou `--gc-linen` seulement.

## Budget de contenu

Mesures réelles dans une zone de texte de 760 × 888 px, recette de Julie avec son petit mot en bas, densité normale :

| | Recette | Petit mot | Pile | Marge restante |
|---|---|---|---|---|
| Cormorant | 690 px | 141 px | 831 px | 57 px |
| Playfair | 671 px | 141 px | 812 px | 76 px |

Coût de chaque ligne supplémentaire :
- ligne de titre : +88 px en Cormorant, +76 px en Playfair (environ 23 caractères par ligne) ;
- ligne d'étape : +49 px en normal, +45 px en compact (environ 45 caractères par ligne) ;
- rangée de deux ingrédients : +49 px en normal, +45 px en compact (jusqu'à 22 caractères par ingrédient tiennent en deux colonnes) ;
- ligne du petit mot : +53 px.

Ce qui tient sur une page vidéo, en densité normale :

| Contenu | Cormorant | Playfair |
|---|---|---|
| Titre sur 1 ligne, 8 ingrédients, étapes sur 5 lignes, mot sur 2 lignes | 880 px, tient | 861 px, tient |
| Titre sur 2 lignes, 8 ingrédients, 4 étapes d'une ligne, mot sur 2 lignes | 919 px, déborde | 888 px, tient tout juste |

Un budget plus large (titre de 28 caractères, 220 caractères d'étapes, mot de 120 caractères) **ne tient pas**, même en compact : il faut 1 169 px en Cormorant et 1 138 px en Playfair (1 088 et 1 056 px en compact) pour 888 disponibles. D'où le budget de `CONTRACT.md` pour une page vidéo :
- titre de 23 caractères au plus ;
- 8 ingrédients de 22 caractères au plus ;
- 4 étapes sur 5 lignes au plus (environ 180 caractères) ;
- petit mot de 90 caractères au plus.
