# Écriture — le texte écrit à la main

Chaque invité écrit sa page **de sa main**, dans **son encre** : `Ecriture` pose un texte dans une
des sept mains du carnet (`HANDS`, `src/lib/hands.ts`) et le rend vivant sans l'abîmer. Chaque mot
est un peu décalé et tourné (graine), la ligne monte légèrement, l'encre faiblit d'un mot à l'autre
comme une plume qui se vide, et le grain du papier transparaît. Les ratures, les soulignés, les
flèches d'annotation et le souligné du titre sont **tracés à la main** (SVG en ligne, à l'encre de
l'invité). L'irrégularité reste discrète : on doit croire à une vraie écriture, pas à un effet.

Taille : toujours `handStyle(main, rôle, encre)` → hauteur d'x visée du cran (`gc-x-<rôle>`) ÷
hauteur d'x de la main (`gc-xh-<main>`) × majoration (`gc-boost-<main>`). Aucune `font-size` ici.

## Composants

### `<Ecriture>`

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `hand` | `HandId` | — | main de l'invité |
| `ink` | `InkId` | `gc-ink` (chocolat, Cécile) | encre |
| `role` | `'title' \| 'body' \| 'note' \| 'meta' \| 'signature' \| 'annotation'` | — | hauteur d'x visée |
| `children` | `string` | — | texte, balisage permis (ci-dessous) |
| `seed` | `number` | dérivée du texte | même graine → même écriture |
| `slant` | `number` (°) | `0` | pente des lignes : négatif = la ligne monte (−1,5 à 0,5) |
| `as` | `'p' \| 'span' \| 'h2' \| 'h3' \| 'li' \| 'div'` | `'p'` | élément |
| `markInk` | `InkId` | encre du texte | encre des soulignés `__…__` |
| `fixInk` | `InkId` | `'rouge'` | encre des corrections |
| `fixPlace` | `'dessus' \| 'apres'` | `'dessus'` | correction dans l'interligne ou à la suite du mot raturé |
| `souligne` | `'regle' \| 'double' \| 'vague' \| 'main'` | — | souligne tout le texte (une ligne : titre, intitulé) |
| `souligneInk` | `InkId` | encre du texte | encre de ce souligné |
| `grain` | `boolean` | `true` | grain d'encre (tuile cuite `ink/grain`) |
| `drift` | `number` (0–1) | `0` | dérive de la marge : retrait 0–0,16 em et écart vertical −0,02–0,06 em à graine (blocs) — pour qu'aucune liste ne soit alignée au pixel |
| `className`, `style` | | | placement par le parent |

Le texte passe par `frTypo` (insécables : « 120 g », « 180 °C », « ! ») puis `handText` (glyphes
absents : ½ → 1/2 pour les Playwrite). Attributs posés : `data-gc-hand`, `data-gc-role`, `data-gc-ink`.

### `<TitreMain>`

Titre de recette écrit à la main (rôle `title`), souligné au choix dans l'encre du titre ou une autre.

```tsx
<TitreMain hand="soignee" ink="bic" underline="regle" underlineInk="rouge" slant={-0.7}>
  Le cake citron de Julie
</TitreMain>
```

`underline` : `regle` (à la règle : droit mais pas parfait, départ appuyé, la règle un peu de biais),
`double`, `vague` (à main levée), `aucun`. Le souligné suit la pente (`slant`).

### `<Annotation>`

Petit mot dans un blanc de la page, avec une flèche tracée à la main.

| Prop | Type | Défaut | |
|---|---|---|---|
| `text` | `string` | — | balisage permis |
| `hand`, `ink` | | | la main de qui annote (`cecile` pour Cécile) |
| `arrow` | `'courbe' \| 'droite'` | aucune | |
| `tilt` | `number` (°) | `0` | de −8 à 8 : on écrit de biais dans la marge |
| `to` | `{ x, y }` (px) | `{ x: -56, y: 14 }` | pointe de la flèche, depuis le bord du mot le plus proche de la cible (gauche/droite à mi-hauteur, ou haut/bas au milieu) |
| `role` | `HandRole` | `'annotation'` | |
| `seed`, `className`, `style` | | | `style` pour la placer (position absolue…) |

La pointe tombe sur `to` même quand le mot est incliné (la flèche est contre-tournée).

### `<Souligne>` et `<Rature>`

Les tracés seuls, si une mise en page en a besoin hors d'un texte : `<Souligne variant ink seed slant />`
(pleine largeur de son conteneur) et `<Rature hand ink correction fixInk fixPlace>150 g</Rature>`.

### `parseMarkup(s)`

Analyseur du balisage → `MarkupSegment[]` (`texte`, `souligne`, `rature` + `correction`).

## Balisage (CONTRACT § 9)

| Écrit | Rendu |
|---|---|
| `~~150 g~~>120 g de sucre` | « 150 g » barré d'un gribouillis à l'encre de l'invité, « 120 g » écrit au-dessus en rouge |
| `~~oups~~` | rature sans correction |
| `~~beurre~~>{huile d'olive}` | correction de plusieurs mots : entre accolades |
| `__à ne pas oublier__` | souligné à main levée |

Sans accolades, la correction compte **autant de mots que le texte raturé** (« 120 g » passé par
`frTypo` est un seul mot) ; la ponctuation qui suit reste dans le texte.

**Correction au-dessus** : elle n'est pas dans un `<rt>` — Chromium réserve au-dessus d'un `<rt>`
près d'une ligne entière quels que soient sa taille et son interligne (+40 px mesurés). Elle est
posée sur la ligne de base du mot raturé puis remontée de la hauteur des hampes et chiffres de la
main ; la rature réserve en haut juste ce qu'il faut (formule lue sur `--gc-lh-<main>`), donc
l'interligne s'ouvre d'un tiers de ligne (Kalam) à une demi-ligne (Playwrite FR Trad). Sémantique :
`<del>` / `<ins>`.

## Mains et encres : règles d'usage

| Main | Police | Caractère | À savoir |
|---|---|---|---|
| `mamie` | Playwrite FR Trad | cursive ancienne d'école, régulière | hampes et chiffres à 2,4 × la hauteur d'x : très gourmande en place ; corrections plutôt `fixPlace="apres"` sur une page chargée |
| `ecole` | Playwrite FR Moderne | cursive scolaire sage | même remarque, un peu moins haute |
| `soignee` | Kalam | adulte, stylo bille, nette | la plus économe, la plus lisible |
| `feutre` | Shantell Sans | ronde, ado | large : ingrédients longs → une colonne |
| `capitales` | Patrick Hand SC | petites capitales de papa | compacte |
| `pressee` | La Belle Aurore | cursive pressée, penchée | très large et très haute : textes courts (mot, annotation, signature) |
| `cecile` | Caveat | la main de Cécile | légendes, sommaire, repères, annotations « testé le… » |

- **Encres** : `plume`, `bic`, `crayon`, `brune`, `noire`, `feutre`, `rouge`. Le grain suit l'outil
  (feutre presque uni, bille légère, plume brune et crayon plus marqués) et s'efface sur les titres
  et signatures (sinon « tampon usé »).
- **Rouge** : corrections, soulignés, titres (le rôle `title` dépasse 48 px de corps) — jamais un
  paragraphe.
- **Pente** : −1,5 à 0,5°. Une page = une pente de base (style de l'invité), ± 0,3° d'un bloc à
  l'autre. Les mots sont tournés d'au plus ±1° × nervosité de la main (école 0,55 … pressée 1).

## À faire / à éviter

- ✅ Une graine par bloc (titre, chaque ingrédient, chaque étape) dérivée de la graine de l'invité
  (`seed + i`) : la page est stable d'un rendu à l'autre et deux lignes ne se ressemblent jamais.
- ✅ Mesurer l'encombrement à chaque cran : une main cursive demande 1,5 à 1,9 × la hauteur d'une
  main d'imprimerie pour le même texte (voir `verification/out/s2/mesures.json`). On raccourcit.
- ✅ `souligne` pour un titre ou un intitulé d'une ligne ; `__…__` dans un texte courant.
- ❌ Pas de `font-size`, `letter-spacing` ou `transform: scale` pour faire tenir un texte.
- ❌ Pas de `slant` au-delà de −1,5° : au-delà, on ne lit plus une main, on lit un effet.
- ❌ Pas d'annotation qui recouvre du texte : la flèche part d'un blanc et s'arrête avant le mot.
- ❌ Pas de rouge pour un texte courant ; pas de grain désactivé « pour faire propre ».

## Fichiers

`Ecriture.tsx` (texte vivant), `TitreMain.tsx`, `Annotation.tsx`, `Souligne.tsx`, `Rature.tsx`,
`markup.ts` (balisage), `traits.ts` (tracés à la main, déterministes), `rng.ts` (aléa à graine),
`Ecriture.css`. Grain : `scripts/bake-ink.mjs` → `design-system/baked/ink/grain.webp` (masque
alpha 256 px, raccordable). Cartes : `preview.html` (recette de Julie ; paramètres de vérification
`?main=&encre=&cran=`) et `src/artboards/SpecimenMains/preview.html`.
