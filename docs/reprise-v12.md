# Revue du 20 octobre — lisibilité, continuité et jeu de piste

## Changements demandés

- Les sept musiques vont au bout ; plus d’extrait de 25 s, plus de coupe trois secondes avant la fin.
  Le suivant est préchargé, puis démarre après une courte respiration. Fondu manuel à puissance égale.
- Le chien quitte entièrement le papier. Une nouvelle illustration frontale reste assise sur la table
  et ouvre le guide de cinq cachettes. Progression conservée, découverte dans l’ordre, relecture et reset.
- Les lunettes au clic disparaissent. Une seule piste de chaussures humaines, espacées, sans superposition
  de traces canines ni de deux promenades sur la même page.
- « Douce Cécile » joue sur le contraste scorpion ascendant Scorpion. Le serment de gourmandise ajoute
  la référence au Maraudeur sur l’ex-libris. Terrible Cécile, Fée du logis et Cordon bleu restent présents.
  La phrase de la poêle est retirée pour plus tard ; aucune anecdote n’est inventée.
- Titres des albums reformulés : « Le goût des bonnes choses » et « Cécile, côté cuisine ».
- Kalam dessine les caractères exacts des huit recettes : prénoms, quantités et notes compris. Les textes
  sources sont conservés. Puces, sections Ingrédients/Préparation, numéros attachés aux étapes, citation Lise.
  Les cartes de révélation et de magie utilisent les masques des glyphes, les tuiles gardent leur alignement.
- Huit illustrations au sommaire. Frontispice gâteaux lié aux recettes du chapitre. Atelier œuf/bol/fouet
  sur les crêpes plutôt que trois images isolées avec une tasse qui change de nombre.
- Les théâtres gardent leurs acteurs au repos et en action, y compris sur une feuille qui tourne et en mode
  doux : tasse unique, service avec deux tasses fixes, carotte de même taille, citron unique chez Pierrette,
  gâteau sans apparition de deux cupcakes supplémentaires. Trois nouvelles scènes font interagir les
  éléments séparés (œuf, vanille, framboises/spéculoos). Sources et cadrages versionnés en série v12.

## Preuves

- Audio : 26 contrôles purs et 13 contrôles WebAudio réels ; une fixture 30,25 s garde un signal audible
  dans ses dernières secondes. Rapports `verification/out/musique-entiers/`.
- Animation : 14 contrats de continuité/distribution/interactions ; 3 contrôles de raccords C1 ;
  30 captures SVG isolées examinables dans `verification/out/coherence-v12/`.
- Recettes : contrôles de pagination intégrale, masques de glyphes, tuiles et progression d’écriture,
  puis inspection visuelle des rendus. Rapports dans `verification/out/lisibilite-v12/`.
- Les contrôles d’intégration et la publication sont consignés après la cuisson complète, ci-dessous.

## Limites à conserver

Les dessins sans acteurs séparés (par exemple certaines tartes) gardent leurs gestes d’ensemble.
Les scènes réutilisent des sprites et des trajectoires : ce ne sont pas des vidéos générées. La lisibilité
prend priorité sur la variation neuronale de la graphie, avec des encres et poses de mots encore variées.
Les anecdotes des albums demandent les souvenirs des proches. Aucun nouveau récit biographique n’a été ajouté.
Les vrais portraits et clips des invités ne sont toujours pas fournis. Les monogrammes restent provisoires.
Le navigateur de test est Chromium Linux ; pas de mesure de cadence sur la TV HDMI ni Safari/Mac physique.

Le sommaire utilise aussi Kalam ; titres courts pour la table des matières, titres complets conservés dans les recettes. Vérification finale : huit vignettes, lien Laura et lien de fin présents ; aucun débordement dans les 34 pages du manifeste. Les petits fruits du frontispice gâteaux évitent désormais les traits du cadre.
