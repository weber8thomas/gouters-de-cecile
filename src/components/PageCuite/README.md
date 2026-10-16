# PageCuite

Une page du carnet **cuite au build** : un vrai feuillet ancien scanné (domaine public) et l'écriture de l'invité, générée trait par trait, dont l'encre a été **composée avec ce papier exactement dessous** (absorption : l'encre prend la teinte et le grain du papier, ses bords sont bus par les fibres). À l'exécution, deux `<img>` alignées au pixel, sans filtre ni mélange ; seul ce qui doit vivre (écrin vidéo) est posé par-dessus, dans la zone que la page lui a réservée.

```tsx
import { PageCuite } from '…/components/PageCuite';

<PageCuite page="julie-droite" />
<PageCuite page="julie-gauche" slots={{ ecrin: <ClocheJulie playing={playing} progress={p} /> }} />
```

`PageCuite` remplit son parent positionné (`position: absolute; inset: 0`) : dans une `<Page>` (faces du `Livre`, `DoublePage`), elle couvre toute la feuille, marges comprises. Les crans de distance ne font que mettre la page à l'échelle (même proportion 850 × 960 aux trois crans).

## Props

| Prop | Type | Rôle |
|---|---|---|
| `page` | `string` | Identifiant de la page cuite (clé de `src/content/pages/manifeste.json`), par ex. `julie-droite`. |
| `slots` | `Partial<Record<string, ReactNode>>` | Éléments vivants, placés dans les zones `vivants` de la page (en fractions de la page). Une zone sans élément reste du papier. |
| `className` | `string` | Classe ajoutée à `.gc-page-cuite`. |

Exporte aussi `PAGES_CUITES` (le manifeste) et les types `PageCuiteProps`, `PageCuiteInfo`, `PageCuiteManifeste`, `RectPage`.

## Anatomie

```
.gc-page-cuite                 position absolue, plein cadre, lang="fr"
├─ img.gc-page-cuite__papier   papier du FEUILLET (partagé), opaque ; --miroir au verso (scaleX(-1))
├─ img.gc-page-cuite__encre    encre de la page (WebP RGBA), même cadre
│                              (srcset : 1× 850 × 960 sur un écran de densité 1, 2× 1700 × 1920 ailleurs)
├─ .gc-page-cuite__texte       le texte réel de la page, masqué visuellement (lecteurs d'écran)
└─ .gc-page-cuite__vivant      une boîte par élément vivant (left/top/width/height en %)
```

- **Papier par feuillet** : un feuillet porte deux pages, le recto (folio impair, page de droite) et le verso (folio pair suivant, page de gauche de la double page suivante). Les deux montrent la même image, le verso retourné : les rousseurs traversent la feuille, le bord extérieur reste le même bord, et la feuille qui tourne a la même pâte des deux côtés. Cinq images pour les huit pages de la démo.
- **Encre** : couleur stockée = composition exacte « over » qui reproduit papier × encre (alpha sans perte, couleur prolongée sous les pixels vides : aucun liseré). Elle contient aussi la **transparence du verso** (la page au dos en miroir, floutée par l'épaisseur du papier, 2 à 3,5 % d'assombrissement au plus) et la **lumière** de fin d'après-midi venue du haut à gauche de la double page.
- Les deux images sont décodables (`decode()`) : le `Livre` les pré-décode avant un tourne-page. Elles sont peintes décodées (`decoding="sync"`) : une page n'apparaît jamais sans son encre. Taille intrinsèque donnée d'avance (`width`/`height`) : le chargement d'une copie du feuillet ne relance aucune mise en page. Aucun `will-change`, aucun `view-transition-name`, aucune animation.
- **Deux résolutions** : 2× (1700 × 1920 : téléphone, tablette, TV 4K) et 1× (850 × 960 : TV 1080p, ordinateur), choisies par le navigateur (`srcset` en densités). L'encre 1× est la même composition réduite (transmittance moyennée), résolue sur le papier 1× décodé : 4 fois moins de pixels à décoder et à rastériser pendant un tourne-page sur la TV.
- **Poids** (démo, 8 pages) : papier partagé 1,15 Mo en 2× + 0,16 Mo en 1× (5 feuillets) ; encre 13 à 249 Ko par page en 2×, 4 à 79 Ko en 1×.

## Fabriquer ou modifier une page

1. Décrire la page dans `src/content/pages/<id>.json` (voir ci-dessous) ; le papier des feuillets est dans `src/content/pages/papiers.json`.
2. `node scripts/bake-pages.mjs --only <double page ou page> [--apercus]` : mise en page naturelle, écriture (outil `tools/ecriture`, agent N2), rastérisation, composition, WebP dans `design-system/baked/pages/**`, manifeste `src/content/pages/manifeste.json`, inventaire `design-system/assets.json`. Cache par empreinte (description, page au dos, papier, versions de l'outil d'écriture et du moteur).
3. Un **débordement** est signalé (`deborde` du manifeste, code de sortie 1) : on raccourcit ou on continue la recette page suivante, on ne rapetisse jamais l'écriture.

### Description d'une page

| Champ | Rôle |
|---|---|
| `id`, `double`, `cote` (`gauche`/`droite`), `folio` | Identité ; le folio donne le feuillet (papier) et la page au dos (transparence). |
| `graine` | Tous les tirages de la page (marges, pentes, espaces, tracés). |
| `main`, `encre`, `outil` | Main de l'invité (`soignee`, `mamie`, `ecole`, `feutre`, `capitales`, `pressee`, `cecile`) et son encre par défaut. |
| `gabarit` | Gabarit des références (A–E), pour mémoire. |
| `marges` | `{ haut, bas, gauche, droite }` en fractions, si on veut forcer. |
| `vivants` | `[{ nom, rect: [x, y, w, h] }]` : zones réservées (aucune encre dessous). |
| `blocs` | Dans l'ordre d'écriture : `titre` (`position` fer/decale/centre, `souligne` trait/double/mot-a-mot/aucun), `ingredients` (`disposition` texte/colonne/deux-colonnes, `lignes`, `intro`), `paragraphe`, `note`, `filet`, `mot` (petit mot : `retrait`, `pente`), `signature` (`x`, `pente`), `espace`, `annotation` et `legende` (posées après coup dans l'espace libre : `places`, `pente`, `fleche`). Chaque bloc peut changer `main`, `encre`, `outil`, `role`, `avant` (lignes sautées). |

Balisage des textes (CONTRACT § 9) : `~~150 g~~>{120 g}` rature + correction au-dessus (de la main et de l'encre de `correction: { main, encre }`), `__mot__` souligné, `^{ajout}` insertion au-dessus avec ‸ (de `insertion: { main, encre }`).

## Règles de mise en page (moteur `scripts/pages/mise_en_page.py`)

Tirées de `design-system/docs/references-carnets.md` § 5, avec la contrainte de lisibilité du projet : **hauteur d'x ≥ 1,8 % de la largeur de page** (14 px à l'écran au cran « loin »). Corps 1,9 %, petit mot 1,94 %, titre 1,36 × le corps, signature 1,32 ×, annotations et corrections ≥ 1,81 %.

- Marges réelles : extérieur 5 à 7 %, côté reliure 6 à 9 % (l'ombre du pli), droite mangée sur la page de droite (2 à 3 %) ; haut 6 à 8 %.
- Lignes jamais horizontales : biais de page ± 0,5°, pente par ligne ± 0,2 à 0,4° (bornée à ± 1,5°), ligne de base en marche aléatoire (≤ 0,15 hauteur d'x). Marge gauche qui dérive (≤ 3 %), alinéa sur un paragraphe sur trois.
- Interligne de la main (2,9 à 3,6 hauteurs d'x) ± 3,5 %, qui se resserre sur les dernières lignes d'une page pleine (jusqu'à − 28 %).
- Fin de ligne : le dernier mot se tasse (espace − 35 %, largeur − 8 %) plutôt que de passer à la ligne ; aucune césure dans un mot ; groupes insécables (« 120 g », « th. 6 », « ! »).
- Ingrédients dans le texte (mains anciennes) ou en colonne / deux colonnes séparées d'une barre tremblée (mains modernes), jamais de puces ; préparation en paragraphe.
- Ratures, soulignés, filets, barres, accolades, flèches, ‸ : tracés à la main (`scripts/pages/gestes.py`) et encrés par le modèle d'encre de l'outil d'écriture, avec l'encre de qui les a faits. Une ligne qui porte une correction s'écarte de la précédente pour lui faire place.
- Annotations (autre main, autre encre, autre pente) posées après coup dans un blanc libre, sans décaler le texte.
- Le folio imprimé du livre (bas, côté extérieur) est une zone réservée.

## À éviter

- Poser du texte vivant par-dessus une page cuite (il ne serait pas « bu » par le papier) : tout texte de page passe par la cuisson.
- Modifier les images à la main, ou changer la taille d'une page cuite : tout vient de la description.
- Mettre un écrin hors de sa zone `vivants` (il y aurait de l'encre dessous).
