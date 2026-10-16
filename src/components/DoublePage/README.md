# DoublePage

Le carnet ouvert posé sur la table : couverture entoilée, tranche de feuillets, deux pages de papier crème vieilli, reliure ombrée au centre, avec coins cornés, taches discrètes et folios en option.

## Props

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `left` | `ReactNode` | — | Contenu de la page de gauche, placé dans une `<Page side="left">`. |
| `right` | `ReactNode` | — | Contenu de la page de droite, placé dans une `<Page side="right">`. |
| `folios` | `[number \| null, number \| null]` | — | Numéros de page [gauche, droite] ; `null` pour ne rien afficher. |
| `dogEars` | `Array<'tl' \| 'tr' \| 'bl' \| 'br'>` | `[]` | Coins cornés, toujours côté extérieur : `tl`/`bl` sur la page de gauche, `tr`/`br` sur celle de droite. |
| `stains` | `Stain[]` | `[]` | Taches de thé ou de confiture. |
| `className` | `string` | — | Classe ajoutée à la racine `.gc-book`. |

```ts
interface Stain {
  page: 'left' | 'right';
  kind: 'the' | 'confiture';
  x: number; y: number;   // centre, en px depuis le coin haut gauche de la page (896 × 1000)
  r: number;              // rayon en px : thé 60–110, confiture 20–45
  seed?: number;          // graine du tracé (sinon dérivée de x, y, r)
}
```

Exporte `DoublePageProps` et `Stain`.

## Anatomie

- Livre à `var(--gc-book-x)` / `var(--gc-book-y)`, deux pages `var(--gc-page-w)` × `var(--gc-page-h)`.
- **Ombre** du livre : `var(--gc-sh-book)`, vers le bas à droite.
- **Couverture** : cartons un peu plus grands que le bloc de pages, toile `cover-fabric.webp` teintée lin écru (`gc-linen-shade`, `gc-kraft`), épaisseur éclairée côté fenêtre.
- **Tranche** : 4 feuillets décalés vers l'extérieur et vers le bas, de `gc-paper` à `gc-paper-edge`, liserés `gc-chocolate` ; leur bord bas remonte vers la reliure.
- **Papier** : `paper-grain.webp` (la couleur `gc-paper` elle-même, sans mélange), zone éclairée `gc-paper-lit` en haut à gauche, vignette très douce et liseré vers `gc-paper-edge`. Le bord haut plonge de 6 px vers le pli.
- **Reliure** : ombre de pli dégradée sur `var(--gc-gutter-shadow)` de chaque côté — large à gauche (la pente tourne le dos à la fenêtre), étroite à droite avec un reflet `gc-paper-lace` —, courbure douce vers le pli, filet central `gc-chocolate`. Ces ombres passent au-dessus de l'encre, comme la vraie lumière.
- **Coins cornés** : découpe `clip-path` en biais (jamais un carré), rabat SVG en dégradé (revers jauni, arrondi du pli éclairé), petite ombre aux valeurs de `--gc-sh-lift`. La découpe laisse voir le feuillet suivant. La pointe du rabat reste dans la marge et ne touche pas le folio.
- **Taches** : SVG en ligne tracé côté client (`organic.ts`, mêmes algorithmes que `scripts/lib/organic.mjs`). Thé : cerne interrompu au bord plus dense, second passage décalé, lavis pâle, en `var(--gc-stain-tea)`. Confiture : goutte au bord séché, cœur plus épais, gouttelettes, en `var(--gc-stain-jam)`.
- **Folios** : en bas, côté extérieur, alignés sur la marge `--gc-page-pad-outer`, classe `useTitleClass('folio')` (`gc-folio` ou `gc-pf-folio`), couleur `var(--gc-chocolate)`, chiffres alignés pour la lecture à 3 m.

## Règles d'usage

- À placer dans une `Stage` (le livre est positionné en absolu sur la scène).
- Le contenu passe par `left` / `right` : `Page` applique les marges et signale tout débordement (`data-gc-fit="overflow"`).
- **Les taches ne vont jamais sous le texte** : c'est à l'appelant de choisir `x`, `y`, `r` dans les marges ou dans une zone vide de la page. Une tache par double page suffit, deux au maximum.
- Un ou deux coins cornés par double page au plus ; plutôt en haut (`tl`, `tr`). Les coins du bas sont plus petits pour laisser la place au folio.
- Le titre du livre et les décors (washi, fleurs séchées) sont posés par les gabarits, pas par ce composant.

## À faire

- Varier `seed` d'une double page à l'autre pour que les taches ne se ressemblent pas.
- Garder le texte dans la zone utile de `Page` (760 × 888) : la reliure et les bords restent libres.

## À éviter

- Mettre une tache sous une ligne de recette ou dans la reliure.
- Changer la taille du livre ou des pages : tout vient des tokens `gc-book-*` et `gc-page-*`.
- Ajouter une ombre noire : les ombres restent brun chaud (`gc-chocolate`, `gc-ink`, `--gc-sh-*`).
