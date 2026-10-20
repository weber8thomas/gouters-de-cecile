# Recettes lisibles — v12

Les huit recettes utilisent désormais les glyphes exacts de Kalam, la fonte manuscrite déjà fournie
dans le dépôt. Les prénoms, les accents, les chiffres et les unités ne sont plus réinventés par le
réseau d'écriture. Les couleurs d'encre, le papier, les cadres et la pagination du carnet sont conservés.

- Rubriques « Ingrédients » et « Préparation » distinctes, points de liste réels et un ingrédient par
  puce, y compris les listes regroupées de Clémence et Pierrette.
- Chaque numéro reste sur la même ligne que le premier mot de son étape.
- L'introduction personnelle de Lise est présentée entre guillemets.
- Les huit fichiers TXT reçus restent inchangés. Dans les JSON des recettes, seul le choix de fonte a
  été ajouté : ingrédients, quantités, étapes, mots, notes et signatures restent intégralement conservés.
- Pierrette dispose d'une seule scène citron, sans seconde illustration superposée ; Clémence dispose
  d'une zone plus grande pour sa scène framboises/spéculoos. Ces zones sont réservées par le paginateur.

Le masque de chaque mot suit les mêmes métriques et rotations que la mise en page. Il est intégré au
modèle d'encre du papier et aux tuiles de la loupe. La carte des temps révèle réellement ses pixels de
gauche à droite ; la plume magique suit les mots plutôt que leurs rectangles de mesure.

Prototype inspecté : `verification/out/lisibilite-v12/clemence.png`. Les dessins vivants ne sont pas
inclus dans cet aperçu statique ; leur emplacement reste réservé.

Validation : `PYTHONPATH=scripts/pages/tests:scripts/pages tools/ecriture/.venv/bin/python -m unittest test_police_lisible -v`.
Les trois tests passent : huit recettes paginées sans atome perdu, numéros en tête de paragraphe,
continuité des glyphes dans les tuiles de loupe et couverture progressive de leurs pixels dans la carte
des temps. Cela ne constitue pas une validation OCR ni une mesure de lecture à trois mètres.

Les cinq échecs relevés dans les anciens contrats ciblés ont également été reproduits avec les fichiers
du moteur présents dans `HEAD` : quatre attentes de pagination des anciennes fixtures et l'attente
« Lisa n'a pas encore de mot ». Ils sont antérieurs à cette modification ; ces assertions n'ont pas été
désactivées ni assouplies.
