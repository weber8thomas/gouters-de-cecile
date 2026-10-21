# Illustrations v15

Dessins originaux générés pour les recettes reçues le 20 octobre 2026, dans le style des acteurs v14 (crayon brun fin, aquarelle mate, céramique fleurie crème à filet bleu).

Deux planches transparentes de six sujets : ingrédients et desserts. Une troisième planche ajoute un moule rectangulaire, un torchon et du papier sulfurisé. Une bouteille d’huile supplémentaire, corrigée par génération pour retirer le bouchon séparé avant utilisation en animation. Le premier original est conservé, mais ne figure pas au catalogue. Les cadrages du manifeste sont des exports techniques; la génération ne se rejoue jamais pendant le build. Le filtrage de composante sur les deux desserts proches retire uniquement les fragments du sujet voisin de leur cellule.

Le lot contient 17 acteurs (dont un pâton seul issu de la boule de pâte entière, à une échelle distincte des six boules) et trois exports de desserts à la racine, identiques à leurs acteurs, pour les aquarelles des pages. Aucun contenu source des recettes n’a été modifié.

Reproduire les exports :

```sh
tools/ecriture/.venv/bin/python scripts/bake-illustrations-v9.py --source design-system/sources/illustrations/v15 --catalogue catalogue-v15.json
```

Puis cuire les aquarelles ciblées et les traces des trois desserts racine. Les originaux PNG restent dans ce dossier avec le manifeste de provenance.
