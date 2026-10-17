# Croquis du carnet : licences et attributions

Les croquis de `design-system/croquis/<nom>/<variante>.json` viennent de deux sources.

## 1. Quick, Draw! (Google) — CC BY 4.0

Les variantes `a`, `b`, `c`, `d` sont de **vrais dessins de joueurs** du jeu *Quick, Draw!*, tirés du
jeu de données public **The Quick, Draw! Dataset** de Google Creative Lab :

- source : https://github.com/googlecreativelab/quickdraw-dataset (fichiers « raw »,
  `https://storage.googleapis.com/quickdraw_dataset/full/raw/<catégorie>.ndjson`) ;
- licence : **Creative Commons Attribution 4.0 International (CC BY 4.0)**,
  https://creativecommons.org/licenses/by/4.0/ — « This data made available by Google, Inc. under the
  Creative Commons Attribution 4.0 International license. » ;
- attribution à faire figurer (crédits du site et du carnet) : *Croquis d'après The Quick, Draw!
  Dataset, Google Creative Lab, CC BY 4.0.*

**Modifications** (indiquées comme le demande CC BY 4.0) : coordonnées ramenées à [0, 1] (proportions
conservées), temps en secondes depuis le premier point, simplification Ramer-Douglas-Peucker de 0,6 %
du plus grand côté ; à l'emploi (`scripts/pages/croquis.py`) : légère déformation, rotation, lissage,
tremblé, pression et encre ajoutés, touches d'aquarelle. Chaque fichier garde `key_id`, `categorie`,
`pays`, `date`, `licence` et `attribution`. Seuls les dessins retenus sont versionnés ; les extraits
téléchargés restent dans `verification/out/c/quickdraw/` (non versionné). Choix :
`scripts/croquis/selection.json` (planches contact `verification/out/c/quickdraw/planches/`).

| Fichier | Catégorie | key_id | Pays | Date | Usage |
|---|---|---|---|---|---|
| `banane/a.json` | banana | `6140782786379776` | KR | 2017-01-20 | tous |
| `banane/b.json` | banana | `5601709738950656` | JP | 2017-01-14 | tous |
| `banane/c.json` | banana | `5626953006579712` | US | 2017-01-12 | dessin |
| `bougie/a.json` | candle | `5494167822139392` | FI | 2017-03-14 | tous |
| `bougie/b.json` | candle | `6217371360428032` | GB | 2017-03-24 | tous |
| `carotte/a.json` | carrot | `6278957420773376` | US | 2017-01-27 | dessin |
| `carotte/b.json` | carrot | `4913010361499648` | IN | 2017-03-21 | tous |
| `carotte/c.json` | carrot | `5372508230385664` | IN | 2017-01-24 | tous |
| `carotte/d.json` | carrot | `6232722970247168` | RU | 2017-01-28 | dessin |
| `cookie/a.json` | cookie | `5506785462976512` | DE | 2017-03-26 | tous |
| `cookie/b.json` | cookie | `6364629951315968` | US | 2017-03-24 | tous |
| `cookie/c.json` | cookie | `4742037108686848` | GB | 2017-03-21 | dessin |
| `cuillere/a.json` | spoon | `5642297720963072` | US | 2017-03-28 | tous |
| `cuillere/b.json` | spoon | `6147516284272640` | GB | 2017-03-01 | tous |
| `donut/a.json` | donut | `4591677102620672` | DE | 2017-01-26 | tous |
| `donut/b.json` | donut | `5502726182010880` | ID | 2017-03-27 | tous |
| `donut/c.json` | donut | `6330402136391680` | FR | 2017-01-29 | dessin |
| `fleur/a.json` | flower | `6523622111838208` | US | 2017-01-29 | tous |
| `fleur/b.json` | flower | `5259202127724544` | AE | 2017-01-29 | tous |
| `fleur/c.json` | flower | `5908275771998208` | BR | 2017-01-30 | tous |
| `four/a.json` | oven | `5826587373076480` | US | 2017-01-30 | tous |
| `four/b.json` | oven | `6427840461406208` | TR | 2017-03-26 | tous |
| `fraise/a.json` | strawberry | `4602413715554304` | CA | 2017-01-27 | tous |
| `fraise/b.json` | strawberry | `6606069759475712` | DE | 2017-03-19 | tous |
| `fraise/c.json` | strawberry | `5137318534971392` | GB | 2017-03-12 | dessin |
| `gateau/a.json` | birthday cake | `5493520506814464` | GB | 2017-03-08 | tous |
| `gateau/b.json` | birthday cake | `4887446330277888` | CA | 2017-03-08 | dessin |
| `gateau/c.json` | cake | `5213245033938944` | FI | 2017-03-04 | tous |
| `glace/a.json` | ice cream | `5465068667928576` | DE | 2017-01-23 | tous |
| `glace/b.json` | ice cream | `6145025018691584` | US | 2017-03-16 | tous |
| `glace/c.json` | ice cream | `4636874515677184` | US | 2017-03-10 | tous |
| `lunettes-soleil/a.json` | eyeglasses | `5041342595989504` | US | 2017-01-26 | tous |
| `lunettes-soleil/b.json` | eyeglasses | `5997117233430528` | US | 2017-03-10 | dessin |
| `poire/a.json` | pear | `5380269232095232` | IT | 2017-03-01 | tous |
| `poire/b.json` | pear | `5615532826951680` | US | 2017-03-29 | tous |
| `poire/c.json` | pear | `6721046457614336` | US | 2017-01-26 | tous |
| `pomme/a.json` | apple | `6296667697446912` | TH | 2017-03-17 | tous |
| `pomme/b.json` | apple | `6689681800429568` | US | 2017-03-24 | tous |
| `pomme/c.json` | apple | `4569178218430464` | US | 2017-01-23 | dessin |
| `sourire/a.json` | smiley face | `5639940287234048` | US | 2017-03-21 | tous |
| `sourire/b.json` | smiley face | `5983039978995712` | US | 2017-01-23 | tous |
| `sourire/c.json` | smiley face | `5473438128930816` | PT | 2017-03-29 | tous |
| `tasse/a.json` | cup | `4950214643286016` | FR | 2017-03-17 | tous |
| `tasse/b.json` | coffee cup | `5491758681030656` | DK | 2017-03-19 | tous |
| `tasse/c.json` | coffee cup | `4929168116547584` | US | 2017-01-24 | dessin |
| `theiere/a.json` | teapot | `6550949709479936` | US | 2017-03-15 | tous |
| `theiere/b.json` | teapot | `4935028796555264` | GB | 2017-03-13 | dessin |
| `theiere/c.json` | teapot | `4955924047331328` | US | 2017-03-03 | tous |

## 2. Croquis maison

Les variantes `m*` (`ma`, `mb`, `mc`) sont des dessins originaux du projet, tracés à main levée en
coordonnées par le lot C (`scripts/croquis/maison.py`) pour ce que Quick, Draw! n'a pas (œuf, citron,
farine, sucre, huile, beurre, noix, vanille, cannelle, muscade, fouet, moule, cupcake, part de carrot
cake, lunettes de soleil, sachet de levure, 😎). Licence : celle du projet.

| Fichier | Usage | Traits |
|---|---|---|
| `beurre/ma.json` | tous | 4 |
| `beurre/mb.json` | dessin | 5 |
| `cannelle/ma.json` | dessin | 13 |
| `cannelle/mb.json` | tous | 8 |
| `carrot-cake/ma.json` | tous | 9 |
| `carrot-cake/mb.json` | dessin | 8 |
| `citron/ma.json` | tous | 3 |
| `citron/mb.json` | dessin | 7 |
| `cupcake/ma.json` | tous | 8 |
| `cupcake/mb.json` | dessin | 10 |
| `cupcake/mc.json` | icone | 4 |
| `farine/ma.json` | tous | 7 |
| `farine/mb.json` | dessin | 7 |
| `fouet/ma.json` | tous | 4 |
| `fouet/mb.json` | dessin | 5 |
| `huile/ma.json` | tous | 5 |
| `huile/mb.json` | dessin | 6 |
| `levure/ma.json` | tous | 5 |
| `lunettes-soleil/ma.json` | tous | 5 |
| `lunettes-soleil/mb.json` | tous | 5 |
| `moule/ma.json` | tous | 5 |
| `muscade/ma.json` | tous | 4 |
| `muscade/mb.json` | dessin | 4 |
| `noix/ma.json` | tous | 5 |
| `noix/mb.json` | dessin | 4 |
| `oeuf/ma.json` | tous | 2 |
| `oeuf/mb.json` | tous | 2 |
| `sourire-lunettes/ma.json` | tous | 4 |
| `sucre/ma.json` | tous | 6 |
| `sucre/mb.json` | tous | 6 |
| `vanille/ma.json` | dessin | 7 |
| `vanille/mb.json` | tous | 10 |

`Usage` : `icone` (taille d'une ligne d'écriture), `dessin` (petit dessin de recette) ou `tous`.
