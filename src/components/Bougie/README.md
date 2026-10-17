# Bougie

Une vraie bougie de cire crème, allumée, dans le coin bas gauche de l'écran, au premier plan et hors du plan de netteté. On la devine plus qu'on ne la voit : le corps est sombre et flou, la flamme est le seul point vif, et sa lueur chaude éclaire la table et le bord du livre. Elle sort du cadre à gauche et en bas. Montée dans `Stage`, sous les contrôles. Elle ne recouvre jamais le texte du livre.

La photo est un original Pexels (Numan Gilgil) ; sa licence et son choix sont dans `design-system/sources/bougie/credits.json`.

## Props

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `className` | `string` | — | Classe ajoutée à la racine `.gc-bougie`. |

## Position et taille

Repère : scène 1920 × 1080, fixe. La pose (bougie et flamme, 200 × 412 px de scène) a son bord gauche à x = −57 px : une partie de la cire sort du cadre à gauche. Son bas dépasse de 7 px sous le bord de la scène. La flamme monte jusqu'à y ≈ 690 px, soit environ 36 % de la hauteur de l'écran. La lueur est centrée sur la flamme, à (41 px, 811 px), et mesure 800 × 900 px.

Les valeurs sont celles qu'imprime `scripts/bake-bougie.py` : `--gc-bougie-ks` (0,142 px de scène par px de la photo), `--gc-bougie-k` (0,8 px par px cuit, soit 1 / 1,25), le pivot de la flamme (49,15 % 61,55 %, la mèche). Le livre (x ≥ 297 px) reste à droite de la bougie ; les contrôles du haut et les flèches du bas à droite ne sont pas touchés.

## Calques

| Calque | Source | Animation |
|---|---|---|
| Lueur | `halo.webp` (lueur chaude, dessinée par le script, très douce) | opacité (`intensite`), échelle 0,96 à 1,04, glisse ≤ 9 px (`dx`) |
| Cire | `bougie.webp` (photo détourée, floue de 11 px de scène, assombrie de 10 %, désaturée de 30 %) | aucune |
| Flamme | `flamme.webp` (photo détourée par seuil de luminance, floue de 8 px de scène) | échelle 0,96 à 1,04, opacité 0,7 à 1 (`intensite`), rotation ≤ 1,5° autour de la mèche (`dx`) |

Les trois calques sont sur la même grille de pixels (`bougie.webp` et `flamme.webp` ont la même taille, 250 × 515 px cuits). Toutes les animations passent par `transform` et `opacity`. Aucun filtre (CSS ou SVG) ni `mix-blend-mode` à l'exécution : le flou est cuit.

Pour recuire : placer la photo d'origine dans `verification/out/v5-bougie2/originaux/pexels-9299394.jpeg` (non versionné, sha256 vérifié par le script), puis lancer `tools/ecriture/.venv/bin/python -I scripts/bake-bougie.py`, puis `npm run assets`.

## Mouvement réduit et téléphone

- Mouvement réduit (système ou réglage du carnet) ou réglage `feu: false` : la flamme reste fixe (intensité 1, pas de rotation) ; le moteur du feu s'arrête dans ce cas.
- Téléphone en portrait (`orientation: portrait` et largeur ≤ 760 px) : la bougie est masquée, on ne garde que la lueur.

## À éviter

- Rendre la cire plus claire ou plus nette, ou agrandir la pose : elle doit rester devinée, hors du plan de netteté.
- Animer un `filter` ou un `box-shadow` : le flou est cuit, et le budget de calques de la scène est compté (`scripts/verify-lumiere.mjs`).
- Déplacer la bougie sur le livre : elle doit rester à gauche du carton, hors du texte.
