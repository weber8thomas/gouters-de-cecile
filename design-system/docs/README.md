Le carnet numérique de recettes de goûter offert à Cécile pour son anniversaire. Il est projeté sur une TV 16:9, sur une scène fixe de 1920×1080 vue à 3 m, puis imprimé en A5. Chaque écran est un livre ouvert posé sur une table : papier crème, encre chocolat, lumière dorée de fin d'après-midi. Tout ce qui est décrit ici sert ce seul but : qu'une vingtaine de proches se reconnaissent, à distance, dans un objet tendre et fait main.

## Contenu et ton

- Écris en français, au tutoiement, comme entre proches. Phrases courtes et chaleureuses, sans emphase ni point d'exclamation en rafale.
- Recettes : vocabulaire de cuisine français réel. Exemples : « Four à 180 °C (th. 6). », « 1 c. à s. de pavot », « moule à manqué 24 cm », « une pincée de fleur de sel ». Une étape commence par un verbe à l'impératif (« Fouette », « Ajoute »).
- Titres de recette : « Le cake citron de Julie », « Les sablés de Léa ». Article, plat, prénom. Pas de majuscules décoratives.
- Petits mots : la voix de l'invité, signés de son prénom. 120 caractères au plus.
- Légendes de vidéo : « Prénom, depuis Ville » (« Julie, depuis Lyon »).
- Typographie française : espace insécable avant « : », espace fine insécable avant « ; ! ? », guillemets « » avec espaces insécables. Une quantité reste collée à son unité (« 200 g », « 180 °C »). Le contenu passe par `frTypo` (dans `src/lib/typo.ts`).
- Pas d'emoji, pas de logo, pas de marque.

### Budget d'une page vidéo

Le texte doit tenir sans jamais réduire les tailles :

- titre de 28 caractères au plus ;
- 8 ingrédients au plus, de 22 caractères chacun au plus, sur deux colonnes ;
- 4 étapes au plus, 220 caractères au total ;
- un petit mot de 120 caractères au plus, plus la signature.

Si le texte déborde, raccourcis-le. Ne descends jamais sous les tailles de la grille.

## Fondations visuelles

### Couleur

- Le fond de page est toujours `gc-paper`. Les objets en papier blanc cassé (napperon, Polaroid, cartes) utilisent `gc-paper-lace`, les tissus `gc-linen`.
- **Recettes**
  - Texte manuscrit en `gc-ink`, à 12,5:1 sur `gc-paper`.
  - Méta (temps, parts), légendes et folios en `gc-chocolate`.
  - Petits mots et signatures en `gc-ink-night`, l'encre « personnelle » de l'invité.
- **Titres** : titres serif en `gc-ink-title` (terracotta profond, 7,4:1 sur `gc-paper`).
- **Couleurs de décor** : `gc-terracotta-500`, `gc-pink-300`, `gc-sage-500` et `gc-honey-500` habillent le décor (vichy, washi, rubans, feuillage, dorures). Elles ne portent **jamais** de texte. Leurs variantes `-700` servent aux accents de 48 px et plus.
- **Lumière** : `gc-glow` est la lumière de fin d'après-midi, en voile très léger, venant d'en haut à gauche.
- **Taches** : `gc-stain-tea` et `gc-stain-jam` restent dans les marges, jamais sous du texte.
- **Avant lecture** : la gamme `gc-sepia-0` à `gc-sepia-4` sert aux images figées traitées en sépia.
- **Personnages** : uniquement `gc-skin-1…6` et `gc-hair-1…6`. Les vêtements prennent les couleurs du décor.

### Typographie

- **Caveat** porte tout ce qui est écrit à la main.
  - Ingrédients et étapes en `gc-hand-body`, 44 px (`gc-hand-compact`, 40 px, pour les recettes longues).
  - Petit mot en `gc-hand-note`, signature en `gc-hand-signature`.
  - Méta en `gc-hand-meta`, légendes et sommaire en `gc-hand-caption`.
- **La serif** porte les titres : `gc-recipe-title`, `gc-chapter-title`, `gc-cover-title`, intitulés en `gc-section-label` (italique), folios en `gc-folio`.
- **Planchers sur TV** (hauteur d'x de 14 px au moins, mesurée dans `metrics.json`) : Caveat 38 px, Cormorant Garamond 36 px (32 px pour un folio isolé), Playfair Display 27 px. Rien de plus petit ne s'affiche sur la TV.
- **Impression A5** : utilise les styles `gc-a5-…` (corps manuscrit 13 pt, plancher 11 pt).
- Utilise toujours les classes de style des tokens, jamais une taille écrite en dur.

### Scène, livre et espacements

- **Scène** : 1920×1080 (`gc-stage-w`, `gc-stage-h`), mise à l'échelle sur la TV sans jamais réorganiser la mise en page.
- **Livre ouvert** : il commence en (`gc-book-x`, `gc-book-y`). Chaque page mesure `gc-page-w`×`gc-page-h`, avec les marges `gc-page-pad-outer`, `gc-page-pad-spine`, `gc-page-pad-top` et `gc-page-pad-bottom`, soit une zone utile de 760×888.
- **Zone de sécurité titre** : tout texte reste à l'intérieur de `gc-safe-x` × `gc-safe-y`, pour survivre au surbalayage des TV.
- **Espacements** : sur le pas de 4 px, de `gc-space-1` à `gc-space-10`.

### Matières, ombres et coins

- Papier crème texturé, coins cornés (un ou deux par double page au plus), tranche de feuillets, ombre de reliure de `gc-gutter-shadow` de chaque côté.
- La lumière vient d'en haut à gauche ; les ombres tombent vers le bas à droite, toujours en brun chaud :
  - `gc-sh-contact` pour ce qui est collé ;
  - `gc-sh-lift` pour le washi, les Polaroid et les étiquettes ;
  - `gc-sh-object` pour les écrins et la tasse ;
  - `gc-sh-book` pour le livre.
- Rayons : `gc-radius-paper` pour les pages, `gc-radius-photo` pour les tirages, `gc-radius-tag` pour les étiquettes et cartes, `gc-radius-round` pour les vidéos rondes.

### Images et illustrations

- Style unique de carnet illustré :
  - contour à l'encre `gc-ink` légèrement irrégulier ;
  - aplats plus un seul ton d'ombre ;
  - hachures seulement dans les ombres ;
  - dégradés réservés au verre, à la porcelaine et aux liquides.
- Pas de photoréalisme, pas de clip-art.
- **Vidéos** : elles vivent dans un écrin (voir la section Écrins). Avant lecture, l'image figée est traitée comme dessinée dans le carnet. En lecture, elle passe en couleur et une tasse se remplit à la place d'une barre de progression.

### Mouvement

- Lent et doux :
  - changement de page en `gc-dur-page` ;
  - passage avant lecture → en lecture en `gc-dur-state` ;
  - soulèvement de la cloche en `gc-dur-dome` ;
  - le tout avec la courbe `gc-ease`.
- On n'anime que la position et l'opacité. Tout s'arrête avec `prefers-reduced-motion`.

### Interaction

- La scène est projetée : aucun état au survol, aucune interface visible hormis deux flèches discrètes en bas à droite, sur la table (`gc-nav-size`, opacité `gc-nav-alpha`).
- Pilotage au clavier ou à la télécommande : flèches et PageUp/PageDown pour tourner les pages, Entrée pour lancer la vidéo.
- Le focus clavier est un anneau plein `gc-honey-500` de 3 px.

## Iconographie

- Pas de jeu d'icônes ni d'emoji : les rares pictogrammes (horloge, four, part de gâteau, caméra du sommaire) sont dessinés à la main à l'encre `gc-chocolate`, au même trait que les illustrations.
