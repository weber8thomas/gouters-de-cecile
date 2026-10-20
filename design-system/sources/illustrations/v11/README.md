# Illustrations des recettes reçues

`recettes.png` est la planche originale générée pour les recettes d’Emeline, Clémence, Anatole et Laura.
Direction commune avec la série anglaise v10 : crayon fin, aquarelle mate et palette douce sur papier
crème. Aucun portrait d’invité n’a été généré. Les quatre cellules de 768 × 512 pixels représentent
le fondant au chocolat, le cheesecake spéculoos/framboises, la tarte aux myrtilles et les crêpes banane.

Reconstruction depuis cette source, sans nouvelle génération :

```sh
tools/ecriture/.venv/bin/python scripts/bake-illustrations-v9.py --source design-system/sources/illustrations/v11 --catalogue catalogue-v11.json
tools/ecriture/.venv/bin/python scripts/bake-aquarelles.py --only fondant-chocolat,framboises-speculoos,tarte-myrtilles,crepes-banane
tools/ecriture/.venv/bin/python scripts/bake-trace-aquarelles.py fondant-chocolat,framboises-speculoos,tarte-myrtilles,crepes-banane
```

Les cadrages et exports transparents sont décrits dans `design-system/aquarelles/catalogue-v11.json`.
Le carnet anime chaque illustration entière pour préserver les contours peints et éviter les découpes
rectangulaires visibles. Les PNG originaux sont conservés ; aucun service d’images n’est appelé par le site.
