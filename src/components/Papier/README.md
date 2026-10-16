# Papier

La surface d'**une page** de vieux carnet de recettes : papier uni crème, épais, jauni selon l'âge, bords brunis par l'air, léger gondolage, quelques rousseurs et parfois un cerne de tasse. Chaque double page est différente : tout est tiré d'une **graine**, à partir de couches cuites partagées (`design-system/baked/paper/`). Une double page de plus ne coûte aucun octet d'image.

Le composant remplit son parent (`position: absolute; inset: 0`) et pose ses enfants par-dessus le papier.

## Props

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `seed` | `number` | — | Graine de la **double page**. Passer la même aux deux pages : rousseurs et auréole se répartissent entre elles, et chaque page reçoit une carte de gondolage différente. |
| `age` | `0 \| 1 \| 2 \| 3` | `1` | 0 bien conservé · 1 un peu jauni · 2 jauni · 3 très jauni (teinte tirée vers `gc-paper-foxed`, usure plus large). |
| `side` | `'left' \| 'right'` | `'right'` | Côté de la double page : le bord extérieur est plus usé, la reliure reste propre et légèrement courbée. |
| `keepOut` | `Array<{ x, y, w, h }>` | zone utile de `<Page>` | Rectangles à garder propres (texte, illustrations), en **px de page** depuis le coin haut gauche. Aucune rousseur ni auréole ne les touche. `[]` = page entièrement libre. |
| `foxing` | `number` | `1` | Rousseurs : `0` aucune, `1` le tirage de la graine (0 à 3 amas par double page). Les valeurs intermédiaires en retirent. |
| `cockle` | `number` | `1` | Intensité du gondolage, de `0` (feuille plate) à `1,5`. |
| `className` | `string` | — | Classe ajoutée à `.gc-papier`. |
| `children` | `ReactNode` | — | Contenu posé sur la page (par exemple `<Page>`), dans `.gc-papier__content` (`position: absolute; inset: 0`). |

Exporte `PapierProps` et `PapierRect`.

```tsx
<div className="gc-book__sheet gc-book__sheet--left">
  <Papier seed={spread.seed ?? 1} age={2} side="left" keepOut={[{ x: 72, y: 52, w: 760, h: 520 }]}>
    <Page side="left">{left}</Page>
  </Papier>
</div>
```

## Anatomie (de bas en haut)

1. **Tuile de papier** `paper/base` (1024², opaque, raccordable) affichée à 1/1,25 (≈ 820 px à l'échelle de la page) avec un décalage tiré de la graine : crème `gc-paper`, relief fin de papier épais (bruit ≈ 0,7 cycle/px éclairé en haut à gauche), longues fibres de coton, épair et marbrures très douces. Une **teinte d'âge** (`color-mix` de `gc-paper-aged`, puis de `gc-paper-foxed` à l'âge 3) est posée par-dessus en dégradé uni.
2. **Jaunissement en plages** `paper/age` (256², alpha, raccordable, très lisse), agrandi vers 1 200 px, opacité selon l'âge, masqué vers le centre : le cœur de la feuille jaunit moins que ses bords.
3. **Usure des bords** : les mêmes plages, plus serrées et plus fortes, masquées sur la tranche (extérieur, haut, bas). Le bord intérieur de l'usure suit les plages, jamais une vignette lisse.
4. **Liserés jaunis** (dégradés de tokens `gc-sepia-1/2`) : extérieur plus marqué, tête un peu plus que le pied, reliure à peine ; trace des doigts au coin bas extérieur.
5. **Auréole** `paper/tide-N` (0 ou 1 par double page) : cerne de tasse, cerne interrompu, goutte d'eau, auréole d'humidité, éclaboussure. Souvent près d'un bord, parfois coupée par la tranche.
6. **Rousseurs** `paper/fox-N` (0 à 3 amas par double page) : cœurs brun rouille et halos fondus, tournés et retournés selon la graine.
7. **Gondolage** `paper/cockle-N-shade` + `-light` (448×500, agrandis à la page) : une ombre brune et un reflet crème, sans `mix-blend-mode`. Les deux pages d'une double page ont des cartes différentes ; une rotation d'un demi-tour (creux ↔ bosse) garde la lumière en haut à gauche.
8. **Courbure vers la reliure**, très légère, sous l'encre (l'ombre du pli reste au livre).
9. Le contenu.

Images passées en propriétés personnalisées en ligne (`cssUrl()`), jamais dans le CSS. Aucun filtre, aucun mélange, aucune animation à l'exécution. Les dimensions et marges sont mesurées sur la page (elles suivent le cran de distance) ; tout se met à l'échelle de la largeur de page.

## Règles de retenue

- **3 amas de rousseurs au plus par double page**, **une auréole au plus** ; certaines doubles pages n'en ont aucune.
- **Jamais de tache sous le texte** ni dans la bande de reliure (96 px) : déclarez toute zone de texte ou d'illustration dans `keepOut`. Sans `keepOut`, les taches restent dans les marges de `<Page>`.
- Pas de « faux vieux » : pas de bords déchirés, pas de brûlures, pas de taches au centre de la page, pas d'âge 3 partout. Variez l'âge d'une double page à l'autre (1 et 2 la plupart du temps).
- Ne pas rajouter de vignette, d'ombre ou de texture par-dessus : la lumière de la scène et l'ombre du pli appartiennent à `Stage` et `DoublePage`.

## Lisibilité (mesurée)

`node verification/out/s1/measure.mjs` : 8 graines par âge, papier moyenné par blocs de 6 px dans la zone utile, contraste WCAG sur les 0,5 % les plus sombres.

| Âge | plume | crayon | rouge |
|---|---|---|---|
| 0 | 8,5:1 | 7,5:1 | 4,9:1 |
| 1 | 8,2:1 | 7,2:1 | 4,7:1 |
| 2 | 7,8:1 | 6,9:1 | 4,5:1 |
| 3 | 7,3:1 | 6,5:1 | 4,2:1 (médiane 4,8:1) |

Le rouge reste au-dessus de 3:1 (texte ≥ 24 px) partout ; à l'âge 3, le garder pour les titres, corrections et soulignés, comme le veut le contrat.

## Ajouter une couche

1. Décrire l'image dans `scripts/bake-paper.mjs` (géométrie, couleurs `c('gc-…')`) avec une recette de `scripts/lib/fx-papier.mjs` (filtres SVG, ou champ calculé en flottant pour les très basses fréquences éclairées).
2. Pour une **variante** de rousseur, d'auréole ou de gondolage : la nommer à la suite (`paper/fox-13`, `paper/tide-6`, `paper/cockle-7-shade` + `-light`). `Papier` découvre les variantes numérotées dans l'inventaire : rien à changer dans le composant (les tirages des graines existantes changent alors).
3. Pour une **nouvelle sorte** de couche : ajouter un calque dans `Papier.tsx` (image via `cssUrl()` dans une propriété en ligne) et son style dans `Papier.css`, à sa place dans l'ordre ci-dessus.
4. `node scripts/bake-paper.mjs` puis `node scripts/assets.mjs`. Les petites couches se cuisent à 1,25 × leur taille affichée ; visez < 150 Ko pour une tuile opaque, quelques Ko pour une tache.

## Cuisson

`node scripts/bake-paper.mjs [--force] [--only base,age,cockle,fox,tide] [--src]` → `design-system/baked/paper/` (31 images, ≈ 415 Ko en tout, cache par empreinte). Le gondolage et le jaunissement sont calculés en double précision dans Node (un `feDiffuseLighting` sur un champ 8 bits dessinait des courbes de niveau), puis réencodés en WebP par Chromium comme le reste.
