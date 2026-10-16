# Page

Boîte de contenu d'une page du carnet : elle applique les marges des tokens (côté reliure selon le côté), range le contenu en colonne et signale tout débordement.

## Props

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `side` | `'left' \| 'right'` | — | Côté de la double page : fixe où se trouve la marge de reliure. |
| `children` | `ReactNode` | — | Contenu de la page (titre, ingrédients, étapes, petit mot…). |
| `pad` | `'normal' \| 'none'` | `'normal'` | `'normal'` : marges du carnet ; `'none'` : pleine page (photo, illustration). |
| `className` | `string` | — | Classe ajoutée à `.gc-page`. |

Exporte `PageProps`.

## Ce que fait la page

- Remplit la feuille (`position: absolute; inset: 0`) en `display: flex; flex-direction: column`.
- Marges : haut `var(--gc-page-pad-top)`, bas `var(--gc-page-pad-bottom)`, extérieur `var(--gc-page-pad-outer)`, reliure `var(--gc-page-pad-spine)` (à droite pour `side="left"`, à gauche pour `side="right"`). Zone utile : **760 × 888** sur la scène TV.
- **Garde de débordement** : l'attribut `data-gc-fit` vaut `ok` ou `overflow`. En cas de débordement, la classe `gc-page--overflow` dessine un contour pointillé `var(--gc-jam)`. La mesure se fait dans un `useLayoutEffect`, puis à chaque changement de taille de la page ou de ses enfants (`ResizeObserver`) et une fois les polices chargées.

## Règles d'usage

- `DoublePage` crée lui-même ses deux `Page` à partir de `left` / `right` ; n'utiliser `Page` à la main que pour un gabarit qui dessine sa propre feuille.
- Le texte utilise les classes de style des tokens (`gc-hand-body`, `gc-recipe-title`…) : jamais de `font-size`.
- Un débordement est une erreur de contenu : **on raccourcit le texte, on ne réduit jamais la taille**. Les vérifications automatiques peuvent chercher `[data-gc-fit="overflow"]`.

## À faire

- Répartir l'espace avec `gap: var(--gc-space-…)` et `margin-top: auto` pour caler un petit mot en bas.
- Utiliser `pad="none"` pour une photo pleine page.

## À éviter

- Masquer le débordement avec `overflow: hidden` ou une police plus petite.
- Ajouter des marges en px en dur : elles viennent des tokens `gc-page-pad-*`.
