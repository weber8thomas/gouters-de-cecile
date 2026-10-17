# Couverture

La couverture du carnet, **cuite comme les pages** (plan v4, lot C) : une vraie toile de reliure ancienne scannée (vert sauge, 1899, domaine public), une **étiquette en vrai papier ancien collée** dessus (cadre imprimé terracotta, coin bas décollé, ombre cuite), le titre « Les goûters de Cécile » **écrit à la plume trait par trait** dans la main du carnet (`soignee` + `plume`) et une **théière** au crayon et à l'aquarelle, l'encre bue par le papier. Coins arrondis et frottés, bords pâlis et usés jusqu'à la trame, une légère auréole sur le plat avant, l'anneau d'une tasse de thé sur le plat arrière. Aucun texte en police web, aucun dégradé CSS : des images cuites, posées par variables CSS.

Générateur : `tools/ecriture/.venv/bin/python scripts/pages/couverture.py [--variantes a,b,c] [--indices] [--planche]` (voir son en-tête). Sources et licences : `design-system/sources/couverture/*.licence.md`.

## Choix de la variante

Trois variantes ont été cuites et comparées (`verification/out/v4-c/couvertures.png`) :

| | Variante | |
|---|---|---|
| **A** | **toile vert sauge + étiquette collée** | **retenue** (`couverture.json` → `active: "a"`) |
| B | carton marbré (papier peigné de 1843), dos et coins toilés, étiquette | écartée |
| C | toile bleu passé, titre au feutre peinture crème | écartée |

A est retenue : l'étiquette est faite du même papier ancien et de la même encre à la plume que les pages (la couverture annonce le carnet), l'encre sombre sur papier crème est la plus lisible à 3 m, et la toile sauge s'accorde au bois et à la palette (`gc-sage`). Seule A est cuite dans `design-system/baked/` ; B et C restent dans `verification/out/v4-c/variantes/` (ni site, ni artifact).

## API

```tsx
import { couvertureVars, EtiquetteCouverture, Couverture, IndiceOuvrir, INDICES_OUVRIR } from '…/components/Couverture';

<Livre … couverture={couvertureVars()} cover={<EtiquetteCouverture />} />
```

| Export | Rôle |
|---|---|
| `couvertureVars(variante?, densite?)` | `React.CSSProperties` : les variables `--gc-couv-*` ci-dessous, à poser **en style en ligne sur `.gc-livre`** (le Livre les transmet à tous ses éléments). `variante` : défaut la retenue (`VARIANTE_COUVERTURE`). `densite` : `1`, `2` ou `'auto'` (défaut : 1× si `devicePixelRatio < 1,5`, comme `PageCuite`). Renvoie `{}` si les images ne sont pas cuites : les replis de `Livre.css` s'appliquent. |
| `<EtiquetteCouverture variante? />` | Le contenu du plat : l'étiquette cuite en `<img>` (1×/2× par `srcSet`), à sa place sur le plat (rectangle du manifeste, ombre et rotation comprises), + le titre réel pour les lecteurs d'écran. Remplit son parent positionné : `.gc-livre-couv__contenu`. **Remplace `COUVERTURE` (HTML) de `DemoCarnet/spreads.tsx`.** |
| `<Couverture face="avant" \| "arriere" \| "contreplat" \| "contreplat-arriere" />` | Une face seule, à la proportion du plat (largeur du parent) : cartes, pages qui montrent le carnet fermé. |
| `INDICES_OUVRIR` | `{ toucher: 'indices/toucher', cliquer: 'indices/cliquer', entree: 'indices/entree' }` : noms logiques (`assetUrl`) des étiquettes « touchez / cliquez / appuyez sur Entrée pour ouvrir ». |
| `INDICES_OUVRIR_CRAYON` | Les mêmes au crayon seul (`indices/<m>-crayon`), pour un fond de papier clair. |
| `<IndiceOuvrir modalite crayon? />`, `TEXTES_OUVRIR` | Une étiquette en `<img>` (avec son `alt`), et les textes. |
| `COUVERTURE_CUITE`, `VARIANTE_COUVERTURE`, `nomCouverture(partie, variante?, densite?)` | Le manifeste (`couverture.json`), la variante retenue, le nom logique d'une partie. |

### Variables (`couvertureVars()`)

| Variable | Image (px de référence, cuite à 2× + `1x/`) | Orientation |
|---|---|---|
| `--gc-couv-plat` | `couverture/a/plat` — 868 × 982 | plat avant vu de dessus, mors à gauche ; coins libres usés **en transparence** |
| `--gc-couv-arriere` | `couverture/a/arriere` — 868 × 982 | plat arrière vu de l'extérieur, **mors à droite** (le livre refermé à la fin, posé sur son plat avant) |
| `--gc-couv-contreplat` | `couverture/a/contreplat` — 868 × 982 | intérieur du plat avant, livre ouvert (à gauche) : **bord extérieur à gauche, mors à droite** ; remplis de toile 18 / 6 / 16 px autour, garde collée en `(18, 6)` |
| `--gc-couv-contreplat-arriere` | `couverture/a/contreplat-arriere` — 868 × 982 | intérieur du plat arrière, livre ouvert (à droite) : **mors à gauche, bord extérieur à droite** ; garde en `(0, 6)` |
| `--gc-couv-dos` | `couverture/a/dos` — 71 × 982 | dos arrondi, tête en haut |
| `--gc-couv-chant` | `couverture/a/chant` — 10 × 982 | tranche du carton (toile repliée, la plus usée) |
| `--gc-couv-tranche` | `couverture/a/tranche` — 40 × 960 | gouttière : l'épaisseur des pages vue de côté (feuillets inégaux, cahiers) |
| `--gc-couv-tranche-pied` | `couverture/a/tranche-pied` — 850 × 40 | la même vue d'en bas (le plat est en haut) |
| `--gc-couv-plat-taille` | `100% 100%` | `background-size` de toutes ces images |
| `--gc-couv-fond` | `transparent` | `background-color` (les coins usés laissent voir dessous) |
| `--gc-couv-biseau` | `none` | `box-shadow` : arêtes, usure et lumière sont cuites dans les images |
| `--gc-couv-teinte`, `--gc-couv-teinte-garde` | `#6d866a`, `#cdd1b8` | couleurs médianes (replis, chant pendant le chargement) |

La garde des contre-plats est le papier `garde-uni` de `papiers.json` (lot Pa), en miroir à l'avant comme la page `garde` (P). Les pages `garde` et `garde-arriere` se posent par-dessus, à la place de la page : seuls les remplis de toile (les marges du carton) restent visibles.

## Branchement dans `Livre.css` (lot A)

`couvertureVars()` sur `.gc-livre` (prop `couverture`, déjà prévue). Puis, élément par élément — chaque règle garde son dégradé actuel en repli :

```css
/* 1. Plat avant (recto de la couverture qui tourne) */
.gc-livre-couv__plat {
  background-color: var(--gc-couv-fond, var(--gc-linen-shade));
  background-image: var(--gc-couv-plat, /* dégradés actuels */);
  background-size: var(--gc-couv-plat-taille, auto);
  box-shadow: var(--gc-couv-biseau, /* insets actuels */);
}

/* 2. Intérieur du plat avant : verso de la couverture qui tourne, puis carton gauche du livre ouvert */
.gc-livre-couv__carton,
.gc-livre__carton--gauche {
  background-color: var(--gc-couv-fond, var(--gc-linen-shade));
  background-image: var(--gc-couv-contreplat, /* dégradés de .gc-livre__carton-toile */);
  background-size: var(--gc-couv-plat-taille, auto);
  box-shadow: var(--gc-couv-biseau, /* insets de .gc-livre__carton-bord--gauche */);
}

/* 3. Intérieur du plat arrière : carton droit du livre ouvert, et recto du plat arrière qui se referme */
.gc-livre__carton--droite,
.gc-livre-couv__carton--arriere {
  background-color: var(--gc-couv-fond, var(--gc-linen-shade));
  background-image: var(--gc-couv-contreplat-arriere, /* dégradés */);
  background-size: var(--gc-couv-plat-taille, auto);
  box-shadow: var(--gc-couv-biseau, /* insets de .gc-livre__carton-bord--droite */);
}

/* 4. Plat arrière vu de l'extérieur (le livre refermé à la fin) */
.gc-livre-couv__plat--arriere {
  background-color: var(--gc-couv-fond, var(--gc-linen-shade));
  background-image: var(--gc-couv-arriere, var(--gc-couv-plat, /* dégradés */));
  background-size: var(--gc-couv-plat-taille, auto);
  box-shadow: var(--gc-couv-biseau, /* insets actuels */);
}

/* 5. Chant du carton (10 px, visible quand la couverture se dresse) : --gc-couv-chant, pas --gc-couv-tranche */
.gc-livre-couv-chant {
  background-color: var(--gc-couv-teinte, var(--gc-kraft));
  background-image: var(--gc-couv-chant, /* dégradés actuels */);
  background-size: 100% 100%;
}
```

À corriger dans l'état actuel de `Livre.css` :
- `.gc-livre__carton-toile` lit `--gc-couv-plat` : les cartons du livre **ouvert** montrent l'**intérieur** des plats (règles 2 et 3), pas le plat avant ;
- `.gc-livre__dos` (le filet de 2 px au fond de la reliure) lit `--gc-couv-dos` : c'est l'extérieur du dos, à ne pas étirer sur 2 px ; garder le filet chocolat (le dos ne se voit pas d'en haut) ;
- `.gc-livre-couv-chant` lit `--gc-couv-tranche` : c'est `--gc-couv-chant` (la tranche des **pages** est `--gc-couv-tranche`).

Les feuillets empilés sous les pages (`.gc-livre__feuille--1…4`) peuvent garder leurs couleurs ; `--gc-couv-tranche` / `--gc-couv-tranche-pied` servent aux vues en volume (arrivée du livre, aperçus).

**Étiquette** : `cover={<EtiquetteCouverture />}` (Carnet, DemoCarnet). Elle remplit `.gc-livre-couv__contenu` (`position: absolute; inset: 0`) et se place seule ; rien à centrer.

**Indices « … pour ouvrir »** : `InvitationOuvrir` (lot S) lit déjà `indices/<modalité>` = le billet au crayon, fond transparent autour, ombre cuite (429 × 86 px de référence pour « touchez », 646 × 87 pour « Entrée » ; images à 2×) ; à poser sur le **tiers bas** du plat (l'étiquette du titre occupe le tiers haut, `rect` ≈ [0,22 ; 0,18 ; 0,62 ; 0,31]), largeur ≈ 50 % du plat, légèrement de travers.

## Déclaration des images

Rien à ajouter : `scripts/assets.mjs` inventorie tout `design-system/baked/**`, donc `couverture/a/*`, `couverture/a/1x/*` et `indices/*` ont leurs noms logiques après `npm run assets` / `node scripts/gen-entry.mjs`. Pour l'artifact : téléverser ces 24 images (≈ 2,1 Mo, dont le plat et le plat arrière ≈ 480 Ko chacun à 2×) dans `assets.lock.json` comme les autres.

## Vérifier

```
tools/ecriture/.venv/bin/python scripts/pages/couverture.py --variantes a,b,c --indices --planche
node scripts/build-bundle.mjs --only Couverture,Stage --tag c
node scripts/shot.mjs src/components/Couverture/preview.html --bundle dist/ds-c/components --out verification/out/v4-c
```

Planches : `verification/out/v4-c/couvertures.png` (les trois variantes), `couverture-finale.png` (la retenue : fermée sur ses deux plats, ouverte au début et à la fin), `Couverture.png` (la carte).
