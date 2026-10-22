# Mission Codex : aquarelles v22 (branche `codex/aquarelles-v22`)

Carnet de recettes « Les goûters de Cécile ». Tu ne fais **que** les illustrations ci-dessous.
Réponds et commente en français.

## Économie de quota (impératif)
- **2 générations d'image au total** : une planche pour les 4 indispensables, une pour les 4 optionnelles.
  Au plus **1 retouche par planche**, seulement si un sujet est raté (rogné, texte, fond sale).
- **Interdit** : `npm install`, `npm run build*`, `bake-pages`, cuisson, tests, navigateur, serveurs.
- Ne lis que les fichiers cités ici. Ne modifie rien hors de la liste « Livrables ».

## Style (reprendre exactement la série anglaise v16)
Référence visuelle : `design-system/sources/illustrations/v16/desserts.png` (regarde-la avant de générer).
Fiche de style à mettre dans chaque prompt d'image :

> Aquarelle anglaise de livre de recettes, dessin au crayon brun fin et irrégulier, lavis d'aquarelle
> mats et transparents, couleurs douces et chaudes, légères auréoles de pigment, papier non visible.
> Chaque sujet isolé, vue de trois quarts légèrement plongeante, ombre portée très légère ou absente.
> Fond **transparent** (sinon blanc pur #FFFFFF uni, sans texture ni vignettage).
> Aucun texte, aucune lettre, aucun chiffre, aucune signature, aucun cadre.
> Planche 1536×1024, sujets bien séparés par au moins 60 px de vide, aucun sujet coupé par le bord.

## Sujets
Planche `v22/desserts.png` (indispensables, 2×2) :
1. `tiramisu` : part de tiramisu en couches (biscuits imbibés de café, crème mascarpone), cacao en poudre dessus, sur petite assiette.
2. `crumble-pommes` : crumble aux pommes dans un plat à gratin rond en céramique, pâte sablée dorée, quelques morceaux de pomme visibles.
3. `tarte-poire-chocolat` : tarte poire-chocolat entière, demi-poires pochées en étoile dans une crème chocolat, pâte dorée.
4. `roules-cannelle` : cinnamon rolls (6 ou 7 roulés spiralés, glaçage blanc coulant) dans un moule rond.

Planche `v22/accessoires.png` (optionnels, 2×2) :
5. `boudoirs` : quelques biscuits boudoirs sucrés. 6. `tasse-cafe` : tasse de café noir en porcelaine sur soucoupe.
7. `pot-mascarpone` : pot de mascarpone ouvert, cuillère. 8. `pate-roulee` : rouleau de pâte crue tartinée de beurre-cannelle, roulé à moitié.

## Livrables (seuls fichiers à créer ou modifier)
- `design-system/sources/illustrations/v22/desserts.png` et `accessoires.png` (RGBA 1536×1024).
  Si l'image sort sur fond blanc : détoure-la (blanc → alpha, comme `scripts/aquarelles.py` › `traiter`)
  avec un petit script `design-system/sources/illustrations/v22/detourer.py`, puis remplace le PNG.
- `design-system/sources/illustrations/v22/manifeste.json`, même format que `v16/manifeste.json` :
  `"serie": "anglaise-v22"`, une entrée par sujet, `cellule` mesurée sur l'alpha réel (pas devinée),
  `taille` `[600, 600]`, plus `acteurs/<nom>` pour les 4 indispensables (comme v16).
- Export : `python3 scripts/bake-illustrations-v9.py --source design-system/sources/illustrations/v22 --catalogue catalogue-v22.json`
  (dépendances : `pillow numpy scipy`). Cela écrit `design-system/aquarelles/<nom>.png`,
  `design-system/aquarelles/acteurs/<nom>.png` et `catalogue-v22.json` ; `roules-cannelle.png` est remplacé, c'est voulu.
- `design-system/sources/illustrations/v22/planche-controle.png` : les 8 PNG exportés posés côte à côte, avec leur nom.

**Ne branche pas** les nouvelles aquarelles dans les recettes (`src/content/**`, `manifeste.json` des pages) :
cela déclenche une recuisson faite ailleurs.

## Fin
Un seul commit (`Aquarelles v22 : tiramisu, crumble, tarte poire-chocolat, cinnamon rolls (+4 accessoires)`),
pas de push. Termine par un compte rendu : sujets réussis, retouches faites, nombre de générations utilisées.
