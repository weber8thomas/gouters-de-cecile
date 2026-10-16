# Écriture — le texte écrit à la main

Chaque invité écrit sa page **de sa main**, dans **son encre** : `Ecriture` pose un texte dans une
des sept mains du carnet (`HANDS`, `src/lib/hands.ts`) et le rend vivant sans l'abîmer :
- pour les mains non liées (soignée, feutre, capitales, Cécile), **chaque lettre** varie un peu
  (±1,5°, ±0,04 em, échelle 1 à 1,05) : deux « e » ne sont jamais identiques ;
- pour les cursives (mamie, école, pressée), on varie **au mot**, sans casser les liaisons ;
- espaces inégales (±0,08 em), lignes qui montent **en arc doux**, interligne (±4 %) et marge qui
  dérivent d'une ligne à l'autre, **fin de ligne serrée** (on manque de place), début plus ample ;
- l'encre faiblit d'un mot à l'autre (plume qui se vide), le grain du papier transparaît ;
  Shantell Sans prend ses axes (INFM 80–100 par mot, BNCE 40). Les ratures, les soulignés, les
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
| `fixInk` | `InkId` | encre de l'auteur | encre des corrections : `rouge` seulement quand quelqu'un d'autre corrige |
| `fixHand` | `HandId` | main de l'auteur | main de qui corrige (ex. `cecile` + `fixInk="rouge"`) : rature et correction à son stylo |
| `fixPlace` | `'auto' \| 'dessus' \| 'apres'` | `'auto'` | au-dessus (72 %) ou à la suite ; toujours à la suite pour les cursives à hampes > 1 em |
| `rature` | `'trait' \| 'zigzag' \| 'noirci'` | selon la graine (70/25/5 %) | façon de raturer ; `ratureDe(seedInvité)` pour qu'un invité rature toujours pareil |
| `puce` | `'tiret' \| 'point' \| 'case' \| 'fleche'` | — | puce tracée à la main ; les numéros (« 1) », « 2. », « a. ») s'écrivent dans le texte |
| `wobble` | `number` (0–1,5) | `1` | vie de l'écriture (0 = la police telle quelle) |
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
`double`, `vague` (à main levée), `aucun`. Le souligné suit la pente (`slant`) et n'a jamais
exactement la longueur du mot (il part un peu avant ou après, s'arrête court ou déborde).

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
| `~~150 g~~>120 g de sucre` | « 150 g » raturé à l'encre de l'invité, « 120 g » écrit au-dessus (ou juste après), plus petit, un peu penché, de son propre stylo |
| `~~150~~>{120} g de sucre` | on ne rature que le nombre |
| `~~oups~~` | rature sans correction |
| `~~beurre~~>{huile d'olive}` | correction de plusieurs mots : entre accolades |
| `__à ne pas oublier__` | souligné à main levée |

Sans accolades, la correction compte **autant de mots que le texte raturé** (« 120 g » passé par
`frTypo` est un seul mot) ; la ponctuation qui suit reste dans le texte.

**Ratures**, comme les font les vrais gens (`traits.ts`, déterministes) :
- `trait` (≈ 70 %) : 1 ou 2 traits presque horizontaux, légèrement ondulés, pente −4 à +4° (bornée
  pour rester sur le mot), qui dépassent de 3 à 10 px à chaque bout ; pression variable (épais au
  milieu, fins aux bouts), parfois un crochet de départ. Le mot reste lisible.
- `zigzag` (≈ 25 %) : 5 à 9 allers-retours serrés et irréguliers, montée ~60°, descente plus raide.
- `noirci` (≈ 5 %, un seul mot court) : hachures croisées denses, illisible.
- On barre au milieu de ce qu'on voit : mi-hauteur d'x pour des minuscules, mi-hauteur des
  chiffres et majuscules (`stems` de `metrics.json`) pour « 150 » ou « SUCRE ».
- Au-dessus, une fois sur trois, un chevron d'insertion « ^ » sous la ligne ou « v » au-dessus du mot.

**Correction au-dessus** : elle n'est pas dans un `<rt>` — Chromium réserve au-dessus d'un `<rt>`
près d'une ligne entière quels que soient sa taille et son interligne (+40 px mesurés). Elle est
posée sur la ligne de base du mot raturé puis remontée juste au-dessus des minuscules
(max(x + 0,2 em, stems − 0,06 em)) ; la rature réserve en haut juste ce qu'il faut pour que la
correction reste sous les jambages de la ligne d'au-dessus (formule lue sur `--gc-lh-<main>` et
`stems`) : environ un tiers de ligne en Kalam. Sémantique : `<del>` / `<ins>`.

## Mains et encres : règles d'usage

| Main | Police | Caractère | À savoir |
|---|---|---|---|
| `mamie` | Playwrite FR Trad | cursive ancienne d'école, régulière | hampes et chiffres à 2,8 × la hauteur d'x : gourmande en place ; corrections écrites après (auto) |
| `ecole` | Playwrite FR Moderne | cursive scolaire sage | même remarque, un peu moins haute |
| `soignee` | Kalam | adulte, stylo bille, nette | la plus économe, la plus lisible |
| `feutre` | Shantell Sans | ronde, ado | large : ingrédients longs → une colonne |
| `capitales` | Patrick Hand SC | petites capitales de papa | compacte |
| `pressee` | La Belle Aurore | cursive pressée, penchée | corps de 50 px au cran proche (x 0,355) : textes courts seulement (mot, annotation, signature) |
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
- ❌ Pas d'alternance de graisse (Kalam 300/400 essayé : le 300 est bien plus fin, on croit à des
  mots en gras au hasard — un effet, pas une main).
- ❌ Pas de `wobble` au-delà de 1,5 ; l'échelle des lettres et des mots ne descend jamais sous 0,985
  (la hauteur d'x visée reste garantie au zoom 0,95).

## Fichiers

`Ecriture.tsx` (texte vivant), `TitreMain.tsx`, `Annotation.tsx`, `Souligne.tsx`, `Rature.tsx`,
`markup.ts` (balisage), `traits.ts` (ratures, chevrons, soulignés, puces, flèches : tracés
déterministes), `metriques.ts` (lecture de `metrics.json`), `rng.ts` (aléa à graine),
`Ecriture.css`. Grain : `scripts/bake-ink.mjs` → `design-system/baked/ink/grain.webp` (masque
alpha 256 px, raccordable). Cartes : `preview.html` (recette de Julie ; paramètres de vérification
`?main=&encre=&cran=`) et `src/artboards/SpecimenMains/preview.html`.
