# Revue v13 — dessins, cuisine et guide

Retour du 20 octobre : illustrations plus grandes, pages 15/29 plus remplies, guide compréhensible,
chien stable, carotte un peu plus rapide et gestes de cuisine réutilisables. L’utilisateur souhaite
les deux modes : séquences automatiques et gestes successifs au clic.

## Composition

- Garde, titre, dédicace et chapitre Gâteaux agrandis dans leurs réserves, sans étendre les dessins
  sur l’écriture. Les acteurs isolés (tasse, citron, gâteau) ont aussi un cadrage interne plus serré,
  identique au repos, en action et pendant le tour de page.
- Prénoms de Gâteaux agrandis de 35 %, en Kalam chocolat. Le titre garde sa main originale.
- Fondant d’Emeline (folio 15) et cookies de Julien (29) occupent une bande illustrée plus généreuse.
  Le paginateur contourne cette réserve ; les mots sources et les quantités restent intégralement présents.
- Les six conseils personnels sont encadrés de guillemets, dont « À préparer la veille, c’est encore meilleur ».
  Les sources JSON/TXT restent intactes.

## Cuisine et écriture

`gestesCuisine.ts` partage les actions œuf/coquilles/jaune, versement, fouet et fruit en arche.
Le chapitre Crêpes montre œuf → farine → lait → pâte mélangée, avec le même bol pendant toute la scène.
Le pichet et le sac viennent d’une nouvelle planche accordée à la vaisselle v12, conservée avec son
manifeste dans `design-system/sources/illustrations/v13`. Pas de génération distante à l’exécution.
Ce sont des gestes illustrés simplifiés, pas encore la réalisation complète de chaque recette.

Les petites commandes proposent « Rejouer » et « Pas à pas ». En manuel, « Suivant » joue un geste
jusqu’à son repère puis attend ; « Auto » revient à la séquence continue. Tout utilise l’horloge existante,
qui s’arrête hors vue. Le mode moins d’animations conserve les images fixes.

Les framboises se posent sur l’intérieur visible du bol, dessiné avant elles. Deux trajectoires
échelonnées remplacent le passage derrière sa paroi opaque. La carotte passe de 11 à 9,6 secondes,
sans modifier ses dimensions ni les ancrages des fanes.

La carte d’écriture interpole désormais le temps sur toute la longueur des segments. Un soulignement
à deux points se trace progressivement au lieu d’apparaître d’un seul coup. Les pixels de croisement
conservent le temps du premier trait. Les cartes de temps sont recalculées sans recuire toutes les pages.

## Guide

Objectif de cinq cachettes, page/folio, dessin à repérer, et action explicite « Aller à… ». Une cachette
se révèle avec « Découvrir », puis « Continuer vers… » guide vers la suivante. S ouvre le guide sans
révéler automatiquement. En vue une page, le texte indique le côté à atteindre.

Le chien reste assis ; seul un bref hochement de tête répond au clic. Le corps et les pattes sont fixes.
Le mouvement réduit coupe le geste. Aucun faux son de chien n’a été ajouté.

## Vérification et publication

Preuves ciblées à compléter dans `verification/out/coherence-v13/`, `verification/out/quete-v13/`
et journaux `verification/out/v13-*`. Les scripts de quête historiques nommés v12 suivent désormais
le parcours v13. Ils coupent le websocket HMR pendant le test, sans changer le site public.

Aperçu prévu : `essais/coherence-v13/`, en préservant la racine et les essais précédents.

Livraison construite : `20261020T150901`. Contrôles de cette passe :

- 18 contrats de distribution, gestes, repos/fin et repères manuels ; 3 contrôles de courbes/C1.
- 33 captures du théâtre SVG ; vrais boutons Auto/Pas à pas/Suivant/Rejouer et attente testés
  avec la vraie horloge WebGL. 6 contrôles sur la scène framboises dans le livre réel.
- 3 régressions de carte d’écriture ; 3 tests du moteur de texte (huit recettes intégrales, loupe,
  révélation). Le rendu final contient 34 pages, sans débordement.
- 8 contrôles de quête et bornes mobile/TV ; hochement de tête isolé, corps fixe.
- Construction TypeScript/Vite réussie. Site de production : 14 contrôles TV et 14 mobile réussis,
  aucun échec, aucune 404/exception sur les parcours ciblés. Ces parcours de composition emploient
  explicitement le mode moins d’animations ; la cuisine animée est vérifiée séparément ci-dessus.

Les vrais clips manquent encore (attente déclarée). Chromium Linux et l’émulation mobile ne mesurent
pas la fluidité du matériel HDMI ni Safari. Les autres anciennes limites sont conservées dans l’état de reprise.
