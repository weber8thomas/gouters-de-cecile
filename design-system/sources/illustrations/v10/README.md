# Scènes et secrets — série anglaise v10

Les planches originales `actions.png`, `chiens.png`, `details.png` et `bulles.png` ont été créées
avec génération d’images et direction artistique commune : crayon fin, aquarelle mate, porcelaine
anglaise crème à fleurs, palette sauge/rose/ocre. `details-intact.png` est une modification de la
carotte de la même planche, avant la première morsure. Les anciennes bulles anglaises de `bulles.png`
restent archivées comme sources ; le carnet utilise `bulles-vierges.png`, avec les phrases françaises
validées composées en Caveat : « Une part pour le chien ? » et « Ça sent le beurre d’ici ! ».
Le citron entier est isolé de la série v9 en conservant ses pixels. Ces sources sont conservées
pour ce projet ; aucune nouvelle génération ni connexion distante ne sert à l’exécution du site.

`manifeste.json` fixe les cellules, dimensions et exceptions de cadrage. Les quatre carottes
conservent un canevas commun ; les points d’attache mesurés dans `Aquarelle/tableaux.ts` alignent
leurs fanes pendant les morsures successives et la repousse. Le lapin a été retiré des scènes. Les sujets proches
sont isolés par leur composante alpha. Les corps gardent leurs proportions pendant l’animation.

Reconstruction depuis les sources versionnées :

```sh
tools/ecriture/.venv/bin/python scripts/bake-scenes-v10.py
node scripts/assets.mjs
npm run build:site
```

Les dépendances Python sont dans `scripts/illustrations-requirements.txt`. Les PNG exportés vont
dans `design-system/aquarelles/`, les WebP transparents dans `design-system/baked/aquarelles/`.
Le catalogue `catalogue-v10.json` garde la provenance de chaque image, y compris les sprites
du sous-dossier `scenes/`. `--only scenes/citron-entier` limite la recuisson WebP à un sujet.

Les sprites servent à cinq tableaux : lévitation des tasses, service du thé dans deux tasses,
coupe puis réunion du citron, carotte grignotée en quatre états, envol des gâteaux. Le même
moteur des aquarelles pilote ces tableaux. Les poses de Jack Russell, accessoires et bulles
servent aux douze surprises de `SecretsDuCarnet`, sans recouvrir le texte ni les photos.

Vérifications ciblées :

```sh
node scripts/verify-dessins.mjs --suites tableaux-courbes
GC_CHROME=/usr/bin/chromium node scripts/verify-dessins.mjs --site dist/site --suites tableaux
GC_CHROME=/usr/bin/chromium node scripts/verify-secrets.mjs --site dist/site
```
