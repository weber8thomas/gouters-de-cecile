# PageCuite

Une page du carnet **cuite au build** : un vrai feuillet ancien scanné (domaine public) et l'écriture de l'invité, générée trait par trait, dont l'encre a été **composée avec ce papier exactement dessous** (absorption : l'encre prend la teinte et le grain du papier, ses bords sont bus par les fibres). Les **croquis** à l'aquarelle (puces d'ingrédients, petit dessin de la recette) sont cuits de la même façon. À l'exécution, deux `<img>` alignées au pixel, sans filtre ni mélange ; seul ce qui doit vivre est posé par-dessus, dans la zone que la page lui a réservée : la **photo collée** de la vidéo de l'invité (`photo`) et le **coin du feuillet volant** qui dépasse de la page droite (`volant`).

```tsx
import { PageCuite, PAGES_CUITES } from '…/components/PageCuite';

<PageCuite page="lisa-gauche" slots={{ photo: <PhotoCollee video="lisa" /> }} />
<PageCuite page="lisa-droite" slots={{ volant: <FeuilletVolant page="lisa-droite" /> }} />
// le feuillet soulevé, à sa propre taille (≈ 0,82 × 0,88 de la page) :
<PageCuite page="lisa-feuillet-recto" cadre="propre" />
```

Par défaut, `PageCuite` remplit son parent positionné (`position: absolute; inset: 0`) : dans une `<Page>` (faces du `Livre`, `DoublePage`), elle couvre toute la feuille, marges comprises. Les crans de distance ne font que mettre la page à l'échelle (même proportion 850 × 960 aux trois crans). Avec `cadre="propre"`, elle se met dans le flux à la proportion de sa page (feuillet volant soulevé, aperçus).

## Props

| Prop | Type | Rôle |
|---|---|---|
| `page` | `string` | Identifiant de la page cuite (clé de `src/content/pages/manifeste.json`), par ex. `lisa-gauche`, `lisa-feuillet-recto`. |
| `slots` | `{ photo?, volant?, [nom]? }` (ReactNode) | Éléments vivants, placés dans les zones `vivants` de la page (fractions de la page). Une zone sans élément reste du papier. Le contenu peut dépasser de la zone et de la page (`overflow: visible`) : le coin du feuillet sort du bord. |
| `cadre` | `'parent' \| 'propre'` | `parent` (défaut) : plein cadre du parent. `propre` : largeur du parent, hauteur selon la proportion de la page (`taille`). |
| `className` | `string` | Classe ajoutée à `.gc-page-cuite`. |

Exporte aussi `PAGES_CUITES` (le manifeste), `pageCuite(id)` (son entrée), `taillePage(id)` (`[850, 960]` ou la `taille` d'un feuillet, en px de la page de référence) et les types `PageCuiteProps`, `PageCuiteInfo`, `PageCuiteManifeste`, `RectPage`, `ZonesVivantes`, `VolantInfo`, `CroquisPage`.

## Pages produites (démo)

| Double page | Folios | Pages | Zones vivantes |
|---|---|---|---|
| `lisa` (carrot cake, recette reçue) | 10–11 | `lisa-gauche`, `lisa-droite` | `photo` à gauche (en haut, tirage de travers) ; `volant` à droite (bord extérieur, bas) |
| | — | `lisa-feuillet-recto`, `lisa-feuillet-verso` | feuille de cahier (`type: feuillet`, `taille: [697, 845]`) |
| `julie` | 12–13 | `julie-gauche` (photo + « Julie, depuis Lyon » au crayon + dessin), `julie-droite` | `photo` à gauche |
| `rose` | 14–15 | `rose-gauche`, `rose-droite` | `photo` à gauche (en haut, côté reliure) |
| `mathis` (Mathis et Bernard) | 16–17 | `mathis-gauche` (cookies de Mathis), `mathis-droite` (tarte de Bernard) | `photo` sur chaque page, en haut à droite, à côté de la liste / du titre |
| `fin` | 18–19 | `fin-gauche`, `fin-droite` | — |

## Manifeste (`src/content/pages/manifeste.json`, version 2)

```jsonc
{
  "version": 2, "largeur": 850, "hauteur": 960, "echelle": 2,
  "pages": {
    "lisa-droite": {
      "double": "lisa", "cote": "droite", "folio": 11,
      "papier": "pages/papier/f11", "miroir": false, "encre": "pages/lisa-droite",
      "papier1x": "…", "encre1x": "…",
      "texte": "…",                                   // texte réel, une ligne par bloc (lecteurs d'écran)
      "vivants": { "volant": [0.83, 0.66, 0.17, 0.215] },   // [x, y, l, h] en fractions de la page
      "volant": { "recto": "lisa-feuillet-recto", "verso": "lisa-feuillet-verso", "angle": -7,
                  "rect": [0.85, 0.685, 0.82, 0.88] },      // feuillet entier, coin haut-gauche avant rotation
      "suite": "lisa-feuillet-recto",                 // où le texte continue
      "croquis": [{ "nom": "carotte", "role": "puce", "dessine": true, "boite": [x, y, l, h] }, …],
      "deborde": [], "lignes": 14
    },
    "lisa-feuillet-recto": {
      "type": "feuillet", "taille": [697, 845], "face": "recto", "dos": "lisa-feuillet-verso",
      "papier": "pages/papier/c-lisa-recto", "miroir": false, "suite": "lisa-feuillet-verso", …
    }
  }
}
```

- `vivants.photo` : la boîte du **tirage tourné** (proportion du tirage bord compris, angle, place des coins / du scotch) ; aucune encre dessous, ni croquis. Le tirage lui-même et son angle viennent de `src/content/videos.json` (lot V).
- `vivants.volant` : la partie de la page droite où l'on voit le coin du feuillet ; `volant.rect` dit où serait la feuille entière (avant rotation de `angle` autour de son coin haut-gauche) : seul ce qui tombe dans la zone est sur la page, le reste dépasse du bord.
- Pages de feuillet : `type: 'feuillet'`, `taille` en px de la page de référence, un papier par face (pas de miroir : la réglure et la marge sont imprimées à gauche sur les deux faces), le verso vu par transparence au recto et inversement.

## Anatomie

```
.gc-page-cuite                 position absolue, plein cadre (ou --propre : dans le flux), lang="fr"
├─ img.gc-page-cuite__papier   papier du FEUILLET (partagé), opaque ; --miroir au verso (scaleX(-1))
├─ img.gc-page-cuite__encre    encre + croquis de la page (WebP RGBA), même cadre
│                              (srcset : 1× 850 × 960 sur un écran de densité 1, 2× 1700 × 1920 ailleurs)
├─ .gc-page-cuite__texte       le texte réel de la page, masqué visuellement (lecteurs d'écran)
└─ .gc-page-cuite__vivant--<nom>  une boîte par élément vivant (left/top/width/height en %), data-gc-vivant
```

- **Papier par feuillet** : un feuillet du carnet porte deux pages, le recto (folio impair, page de droite) et le verso (folio pair suivant, page de gauche de la double page suivante). Les deux montrent la même image, le verso retourné : les rousseurs traversent la feuille, le bord extérieur reste le même bord, et la feuille qui tourne a la même pâte des deux côtés.
- **Feuillet volant** (feuille de cahier glissée dans le carnet) : papier plus clair et plus lisse que le carnet, **petits carreaux** imprimés un peu de travers et pâlis par endroits, marge saumon à gauche, pli de la feuille pliée en deux, réglure du dos devinée par transparence. L'écriture se pose sur la réglure, une ligne tous les deux carreaux, un peu plus petite que dans le carnet (au plancher de lisibilité).
- **Encre** : couleur stockée = composition exacte « over » qui reproduit papier × encre × lavis (alpha sans perte, couleur prolongée sous les pixels vides : aucun liseré). Elle contient aussi la **transparence du verso** (la page au dos en miroir, floutée par l'épaisseur du papier, aquarelle comprise) et la **lumière** de fin d'après-midi venue du haut à gauche de la double page.
- Les deux images sont décodables (`decode()`) : le `Livre` les pré-décode avant un tourne-page. Elles sont peintes décodées (`decoding="sync"`). Taille intrinsèque donnée d'avance : le chargement d'une copie du feuillet ne relance aucune mise en page. Aucun `will-change`, aucune animation.
- **Poids** (démo, 12 pages) : papier partagé ≈ 1,5 Mo en 2× + 0,24 Mo en 1× (6 feuillets + 2 faces de cahier) ; encre 32 à 245 Ko par page en 2× (au-delà de 245 Ko, la cuisson baisse un peu la qualité de cette page seulement), 10 à 85 Ko en 1×.

## Fabriquer ou modifier une page

### Une recette reçue (pagination automatique)

1. Le texte de l'invité reste mot pour mot dans `src/content/recettes/<slug>.txt` ; sa version structurée `<slug>.json` (`RecetteRecue`, `src/content/types.ts`) ; son plan de cuisson dans `src/content/pages/recettes.json` : double page, folios, `photo` (largeur et proportion du tirage, position, angle), `volant` (zone du coin, angle, bande de la note « suite sur la feuille »), `feuillet` (papier `cahiers` de `papiers.json`, taille, hauteur d'x), `etapes` (`ligne`, `tete` ou `auto`), `croquis` (pages où poser le petit dessin, noms de repli, `alias` : 😎 « lunettes-soleil » → `sourire-lunettes`), `graines` (voir plus bas).
2. `scripts/pages/recette.py` découpe la recette en **atomes** — titre, ligne d'ingrédient, titre d'option, phrase (coupée aussi après ses virgules quand elle est longue), « Étape n » collé à sa première phrase, mot de la fin, signature — avec **une graine stable par atome** (`hash(slug, id)`) : un atome écrit sur une page garde la même écriture s'il passe sur une autre.
3. Coulage **gauche → droite → feuillet recto → verso** : pour chaque page, plus long préfixe qui tient (recherche dichotomique sur la composition, sans rastériser ; resserrage léger permis), puis recul jusqu'à une coupure permise (ni titre en bas, ni ingrédient seul de son groupe en haut ou en bas, ni signature séparée). Si la droite ne suffit pas, elle est recomposée avec la zone `volant` et « suite sur la feuille » (crayon de Cécile, flèche vers le coin) ; le recto commence par « (suite) ». Les étapes sont « Étape n » sur sa ligne quand tout tient ainsi, sinon en tête de paragraphe. S'il reste du texte après le verso : **code de sortie 1**.
4. Le petit dessin de la recette va dans le premier blanc assez grand des pages du plan (à côté de la photo, puis la fin).

### Une page décrite à la main

`src/content/pages/<id>.json` (voir ci-dessous) ; le papier des feuillets est dans `src/content/pages/papiers.json`.

### Cuire

`node scripts/bake-pages.mjs [--only lisa,julie] [--force] [--apercus]` : pagination des recettes, mise en page naturelle, écriture (outil `tools/ecriture`), croquis (lot C, `scripts/pages/croquis.py`), rastérisation, composition, WebP dans `design-system/baked/pages/**`, manifeste, inventaire `design-system/assets.json`. `--apercus` écrit la composition finale de chaque page (100 %, 2×) et sa description dans `verification/out/b/pages/`. Cache par empreinte (description, page au dos, papier, croquis utilisés, versions de l'outil d'écriture et du moteur) : changer un croquis recuit les pages qui l'utilisent. Déterministe (deux cuissons donnent les mêmes octets). Un mot qui ne tient pas, une annotation non placée ou une recette trop longue : **code de sortie 1**, on ne réduit jamais l'écriture.

**Relecture** : chaque mot écrit est relu (relecteur de l'outil d'écriture ; les chiffres sont comparés à leurs variantes à un chiffre près et aux lettres qui leur ressemblent : « 300g » écrit « 3ccg » est réécrit). Les mots encore douteux sont listés à la fin de la cuisson et dans le manifeste (`douteux`). Pour un mot qui se relit mal à l'œil, imposer une autre graine à son atome dans le plan (`graines`, choisie sur une planche de candidats).

**Tests** : `tools/ecriture/.venv/bin/python -m unittest discover -s scripts/pages/tests -v` (pagination courte / longue / très longue / trop longue, coupures, graines stables, réglure, zones vivantes, puces, déterminisme, cache des croquis, code de sortie).

### Description d'une page

| Champ | Rôle |
|---|---|
| `id`, `double`, `cote` (`gauche`/`droite`), `folio` | Identité ; le folio donne le feuillet (papier) et la page au dos (transparence). |
| `type`, `taille`, `papier`, `face`, `dos`, `grille`, `xh_facteur` | Page de feuillet volant : sa taille (px de la page de référence), son papier de cahier (`cahiers` de `papiers.json`) et sa face, la page au dos, la réglure que suit l'écriture, la hauteur d'x. |
| `graine` | Tous les tirages de la page (marges, pentes, espaces, tracés). |
| `main`, `encre`, `outil` | Main de l'invité et son encre par défaut. |
| `marges` | `{ haut, bas, gauche, droite }` en fractions, si on veut forcer. |
| `vivants` | `[{ nom, rect: [x, y, w, h] }]` : zones réservées (aucune encre dessous) ; `vivant: false` : zone réservée sans objet vivant (place d'une note). |
| `volant`, `suite` | Recopiés dans le manifeste (page droite qui porte le feuillet). |
| `blocs` | Dans l'ordre d'écriture : `titre`, `ingredients` (`disposition` texte / colonne / deux-colonnes / **puces** : `lignes: [{ texte, graine, puce }]`), `etape` (`titre`, `segments`, `disposition` ligne/tete), `paragraphe`, `note`, `filet`, `mot`, `signature`, `espace`, `annotation` et `legende` (posées après coup dans l'espace libre : `places`, `dans` une zone, `pente`, `fleche` vers un bloc ou une zone), **`croquis`** (petit dessin dans un blanc : `nom` ou variantes, `taille`, `pres`). Chaque bloc peut changer `main`, `encre`, `outil`, `role`, `avant` ; `segments: [{ texte, graine }]` écrit chaque morceau à part ; **`icones: [{ mot, nom, place: marge \| fin }]`** pose 2 ou 3 petits croquis à côté d'ingrédients clés. |

Balisage des textes (CONTRACT § 9) : `~~150 g~~>{120 g}` rature + correction au-dessus, `__mot__` souligné, `^{ajout}` insertion au-dessus avec ‸, **`:nom:`** croquis à la place d'un emoji (en ligne, collé au mot qui précède ; dans une liste en colonnes, en bout de ligne). Une barre de fraction entre deux chiffres (« 5/6 ») est tracée à la main.

## Règles de mise en page (moteur `scripts/pages/mise_en_page.py`)

Tirées de `design-system/docs/references-carnets.md` § 5, avec la contrainte de lisibilité du projet : **hauteur d'x ≥ 1,8 % de la largeur de la page de référence** (14 px à l'écran au cran « loin ») ; même sur le feuillet volant.

- Marges réelles : extérieur 5 à 7 %, côté reliure 6 à 9 %, droite mangée sur la page de droite ; sur le cahier, la marge imprimée.
- Lignes jamais horizontales, ligne de base en marche aléatoire, marge gauche qui dérive ; sur le cahier, l'écriture suit la réglure (± 0,3 hauteur d'x).
- Interligne de la main ± 3,5 %, qui se resserre sur les dernières lignes d'une page pleine.
- Fin de ligne tassée plutôt que coupée ; groupes insécables (« 120 g », « th. 6 », « 1 c. à s. », « 4 œufs », « ! », emoji après son mot).
- **Zones réservées** (photo, coin du feuillet, note, folio imprimé) : une ligne qui les croise est raccourcie à droite, ou sautée si son début serait décalé ; un mot ou un croquis qui toucherait une zone vivante est un débordement.
- **Puces-croquis** (recettes où l'invité avait mis des emojis) : un croquis à la place du tiret, ≈ 1,3 hauteur d'x, posé sur la ligne de base, la même variante sur toute la liste, les lignes qui continuent rentrées sous le texte. **Icônes discrètes** (recettes sans emoji) : 2 ou 3 petits croquis (≈ 1,75 hauteur d'x) dans la marge ou au bout de la ligne d'un ingrédient clé, jamais en puce. **Un petit dessin par recette** dans un blanc.
- Ratures, soulignés, filets, barres, flèches, ‸, barres de fraction : tracés à la main (`scripts/pages/gestes.py`) et encrés par le modèle d'encre de l'outil d'écriture.

## À éviter

- Poser du texte vivant par-dessus une page cuite (il ne serait pas « bu » par le papier) : tout texte de page passe par la cuisson.
- Modifier les images à la main, ou changer la taille d'une page cuite : tout vient de la description.
- Mettre un objet vivant hors de sa zone `vivants` (il y aurait de l'encre dessous).
