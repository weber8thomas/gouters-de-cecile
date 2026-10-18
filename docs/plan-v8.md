# Plan v8 — un carnet vivant, lisible sur la télé

Reprise du 18 octobre 2026. Livraison vendredi 23 octobre. Ce plan poursuit le
bilan fourni : préserver le carnet existant, consolider les essais, puis améliorer
les effets qui se voient réellement à 3 mètres. La démo TV prime sur les ajouts. Décisions confirmées : ordinateur HDMI au clavier, couverture f au cachet « 30 », médias de démonstration conservés.

## 1. Consolider avant d'ajouter

Les sources ont été retrouvées dans les branches distantes. `origin/main` était
resté au squelette initial ; ce n'était pas une disparition du projet.
La base `origin/feat/epic-wright-58442e` contient déjà les fusions finitions,
mobile2 et magie, ainsi que les travaux lumière/sons. Intégrer dessins et
anniversaire, conserver les modifications utiles des deux côtés, puis publier
une version de référence reconstruisible. Voir [l'état de reprise](etat-reprise.md).

- Garder une seule API de vitesse dans `src/lib/vitesse.ts` ; les moteurs magie
  et aquarelle importent déjà `facteurAnimations()`. Vérifier leur comportement
  avec les réglages fusionnés, sans réintroduire le facteur constant de l'essai dessins.
- Recuire les seules pages et cartes réellement affectées, régénérer l'inventaire
  des actifs, puis vérifier TypeScript, le site et les réglages intégrés.
- Sauvegarder chaque étape validée sur GitHub. Associer les captures et le
  déploiement au commit ; ne plus dépendre d'un conteneur unique.

Sortie attendue : un site intégré qui s'ouvre, se feuillette et conserve ses
réglages, avec sources et actifs sauvegardés. Aucun conflit de fusion résiduel.

## 2. Bordure et lumière : première amélioration visible

Examiner ensemble les ombres de `Livre`, `Camera` et `Lumiere`, les cartons,
les textures précalculées et leur cadrage. Chercher la cause de la bande claire
en bas à gauche et de la bande sombre à droite avant d'ajouter une correction.
Les calques de lumière doivent suivre le même repère que le livre à tous les zooms.

La bougie reste discrète ; son éclairage doit être nettement visible sur le papier,
avec une teinte chaude et un vacillement crédible. Garder une direction de lumière
cohérente, sans voile uniforme qui ternit le texte. Réutiliser les rendus existants
avant d'en lancer de nouveaux ; pas de calcul Blender coûteux sans diagnostic.

Acceptation : captures 1920×1080, livre ouvert et fermé, trois distances et zooms
0,95/1,05, plus contrôle pendant le tour de page. Aucune bande parasite ni lumière
décalée. Comparaison lumière activée/désactivée à état d'encre identique ; contraste
conservé à au moins 90 % de la référence selon le contrat. Vérification visuelle
sur la TV à 3 m indispensable : un pourcentage de luminosité seul ne suffit pas.

## 3. Aquarelle, pages 8/10 et mouvement autonome

Repérer d'abord les pages demandées par capture et ID de manifeste : un numéro
d'écran n'est pas nécessairement un folio. Remplacer la fleur bleue ratée et
composer une page 10 plus riche, sans empiéter sur la lecture ni répéter les mêmes décors.

Les scènes autonomes existent déjà dans `Aquarelle/vivante.ts` et `scenes.ts`.
Renforcer leur lisibilité et leur cadence de démonstration ; supprimer la déformation
des dessins au passage du pointeur. Conserver le toucher comme découverte facultative.
Revoir la diffusion du lavis : grain du papier, zones inégales, bords humides et
pigment qui sèche. Retirer la brillance artificielle si elle dégrade l'illustration.

Acceptation : chaque page visée est convaincante en capture fixe et joue une scène
sans souris dans une fenêtre d'observation de 20 s après son écriture. Les coins
animés et les pas d'encre sont perceptibles à 3 m. Les animations ne masquent pas
le texte, s'interrompent pendant les gestes et hors écran, et respectent le réglage
réduit ainsi que la préférence système selon le comportement documenté.

## 4. Chiens et surprises, en petit nombre mais aboutis

Ajouter quelques illustrations anglaises anciennes, avec le Jack Russell en vedette
sur plusieurs pages. Bulles courtes en anglais : « Tea time! », « Jolly good! ».
Varier les poses plutôt que disperser la même image partout.

Livrer une surprise complète : le lapin rejoint la carotte, la grignote puis repart.
Réutiliser l'ordonnanceur et les zones libres existants ; éviter un nouveau moteur.
Une seconde surprise reste facultative jusqu'à validation des priorités précédentes.

Acceptation : dessin lisible sur TV, pas de texte recouvert, comportement rejouable,
navigation intacte au clavier et au toucher. Une version statique reste disponible
si WebGL échoue ou si les animations sont réduites.

## 5. Vidéos à la Gazette

Réutiliser la vidéo dans le cadre et la lecture soulevée déjà présentes dans
`Magie/photos.ts` et `Soulever`. Intégrer d'abord un clip autorisé de 3 à 5 secondes,
muet en boucle dans son cadre ; la lecture agrandie reste distincte.
Une simple respiration ou un zoom de photo ne remplace pas une vidéo.

Les clips réels, les Live Photos et l'image vers vidéo par IA nécessitent les médias
et les accords des personnes concernées. L'autorisation de pousser le code et le site
ne fournit pas ces accords. Clarifier aussi l'hébergement public ou privé des médias
personnels avant d'en ajouter ; garder les exemples actuels pendant cette collecte.

Acceptation : affiche de repli, H.264 compatible et démarrage vérifié dans le navigateur
de présentation ; aucune vidéo cachée ne continue à décoder ; lecture arrêtée pendant
le tour de page et onglet masqué. Aucun écran noir si la lecture automatique est refusée.
L'animation IA reste facultative pour vendredi, selon outils, médias et accords disponibles.

## 6. Vérifier et répéter

Exécuter les commandes depuis la racine avec les dépendances verrouillées et les
actifs récupérés. Les rapports historiques ne remplacent pas une exécution actuelle.

```sh
npm run typecheck
npm run build:site
node scripts/verify-all.mjs --site dist/site --cible-site --sans-precedents
node scripts/verify-mobile.mjs --site dist/site
node scripts/verify-dessins.mjs --site dist/site
```

Compléter par `verify-lumiere.mjs` sur un bundle fraîchement construit et par les
scénarios de `fps.mjs` correspondant aux effets modifiés. L'agrégateur n'exécute pas
à lui seul tous les contrôles spécialisés. Ne pas prendre les mesures d'un banc
factice pour la performance du carnet complet.

Exigences du contrat : absence de débordement ; texte dans les zones sûres ; gestes
sans recalcul de mise en page ; objectif de 44 calques pendant un tour de page.
Le bilan rapporte 50–56 calques et un test de contraste faussé par l'écriture :
reproduire, diagnostiquer et corriger sans relever les seuils pour obtenir du vert.
En cloud sans GPU, les images/s absolues ne prouvent pas les 60 i/s du matériel réel.

Écouter réellement les bruitages et le mixage ; vérifier l'audio au premier geste,
les volumes, le retour après une vidéo et l'absence de son agressif ou trop fréquent.
Rejouer ouverture, sommaire, recettes, vidéo, retour arrière et fermeture sur la TV.
Sur vrai iPhone, contrôler le premier toucher et la barre Safari si l'appareil est disponible.

## 7. Cadence et décisions

- Dimanche–lundi : consolidation, référence publiée, bordure et lumière.
- Mardi–mercredi : aquarelle, pages ciblées, scènes autonomes, chiens et lapin.
- Jeudi 22 : répétition TV, corrections bloquantes, gel technique et copie locale.
- Vendredi 23 : contributions finales et contrôle du parcours de fête.

À confirmer sans bloquer les travaux indépendants : ordinateur HDMI ou navigateur
TV et moyen de pilotage ; couverture gâteau (d) ou cachet « 30 » (f) ; mixage souhaité ;
accords et hébergement des médias. `formats.py` prévoit déjà le livre écran 17×24
et un export A5 distinct : confirmer le format papier avant de préparer l'impression.
