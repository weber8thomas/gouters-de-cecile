# Série anglaise — 19 octobre 2026

Les quatre PNG sont les originaux transparents de la nouvelle série : 23 illustrations du carnet et
un Jack Russell. Ils ont été créés pour ce projet avec l'outil de génération d'images, sous une
direction commune : carnet de recettes anglais ancien, crayon fin gris chaud, aquarelle mate,
porcelaine crème à petites roses et feuilles sauge, pigments doux. Les planches 2 à 4 prennent la
première en référence. Aucun de ces dessins ne provient des anciens catalogues externes.

Le manifeste conserve les cellules et les dimensions de sortie. Le script d'export isole les dessins
avec leur canal alpha d'origine et les redimensionne sans les étirer. Pour l'orange et la carotte,
deux cellules proches se chevauchent : seule leur composante principale est retenue pour exclure les
fragments du sujet voisin. Aucun dessin n'est reconstruit par du code.

## Reconstruction des actifs

Installer les dépendances épinglées de `scripts/illustrations-requirements.txt` dans un environnement
Python, puis depuis la racine :

```sh
tools/ecriture/.venv/bin/python scripts/bake-illustrations-v9.py
tools/ecriture/.venv/bin/python scripts/bake-aquarelles.py
tools/ecriture/.venv/bin/python scripts/bake-trace-aquarelles.py
tools/ecriture/.venv/bin/python scripts/bake-parties-aquarelles.py
node scripts/assets.mjs
npm run build:site
```

Les images prêtes pour le navigateur et leurs cartes de révélation sont versionnées : le build normal
ne lance ni génération d'images ni traitement Python. `catalogue-v9.json` précise leur provenance et
prime sur les catalogues historiques pour ces noms. Les anciens masques de parties ne doivent jamais
être appliqués à cette série ; le script correspondant les supprime au lieu de les recalculer.

## Mouvement

Les fruits gardent leur silhouette entière, sans rotation ni changement d'échelle ; leur léger geste
est une translation bornée. Les pâtisseries ont le même balancement discret. La vapeur et les flammes
suivent les ouvertures et les mèches des nouveaux dessins. Le gâteau d'anniversaire a cinq bougies ;
la part de gâteau porte une bougie éteinte et ne reçoit pas de flamme artificielle.

Le Jack Russell remplace les papillons et la coccinelle dans les pages actives. Il marche au bas des
pages, dans une zone vérifiée libre d'encre, de photos et d'objets, s'arrête et dit « Tea time! » ou
« Jolly good! ». Si aucune route sûre n'existe, il reste absent. Les bulles ne se retournent pas avec
le chien. Les promenades du chien sont suspendues en mouvement réduit ; les illustrations restent fixes.

## Introduction déjà cuite

Trois anciens croquis restaient intégrés à l'encre : le gâteau de la page de titre et deux guirlandes.
Ils sont remplacés par les mêmes aquarelles vivantes. Les encres originales 1×, 2× et tuiles 4× sont
archivées dans `encres-introduction-avant-v9.zip`, avec leurs descriptions et rectangles.

La migration historique `scripts/migrate-introduction-v9.py` efface uniquement ces rectangles des
calques transparents puis réserve leurs nouvelles zones. Elle vérifie pixel par pixel que le reste
est identique ; la sauvegarde WebP sans perte évite de recompresser l'écriture. Les descriptions
source produiront cette disposition lors d'une future cuisson normale. Ce script n'est pas requis
au build ; il refuse de restaurer les anciennes encres si les blocs de texte ont changé depuis.
