# Cuisine, navigation et découvertes — passe 16

Le carnet comporte dix-huit recettes et 107 étapes reçues. Lisa du carrot cake est Lisa Allienne ; Lisa De Paris apporte les Spitzbuben. Antoine, Suzanne, Margot Chapuzy et Elise rejoignent également le carnet. La source publique du lot est dans `docs/sources/recettes-recueillies-2026-10-21-v16.md` ; le numéro personnel de la hotline est masqué dans les TXT, JSON et documents publiables, sur demande explicite de Thomas.

Les seuls petits mots personnels authentifiés à ce stade sont ceux de Coralie, Antoine, Suzanne et Elise. Les quatorze autres cadres portent « Lorem ipsum — message à venir ». Les recettes, conseils et citations reçus restent conservés ; les placeholders ne servent pas à inventer des souvenirs.

## Utilisation

- **S** ouvre les notes. « Recommencer les découvertes », toujours accessible au pied du rabat, remet à zéro farine, enveloppes, notes et archives. Les réglages restent conservés.
- **T**, ou le signet Sommaire, rejoint les pages 8–9 ; le titre apparaît dès la page 8. **/** ouvre la recherche par auteur, recette et ingrédient, avec ou sans accents. Les flèches sélectionnent un résultat, Entrée ouvre la recette et Échap referme la fiche.
- **Démarrer la recette**, sous son illustration, ouvre le mode cuisine sur toute la fenêtre : ingrédients à cocher, préparation puis étapes avec une grande scène. Les flèches avancent ou reviennent, les icônes permettent la lecture automatique, le pas à pas et le rejeu. L’agrandissement natif est proposé si le navigateur le permet. Le retour au carnet conserve sa page et restaure le focus.
- Les gestes illustrent la préparation en accéléré. Les temps de repos et de cuisson indiqués dans le texte restent ceux à respecter.

## Changements

La navigation conserve la dernière cible demandée pendant le coin animé au lieu de perdre les touches. La préparation d’un tour possède une véritable borne de temps, indépendante du prochain retour d’image. Les ressorts, le papier et les effets GPU ne sont pas optimisés dans cette passe, conformément à la demande de Thomas.

Le sommaire utilise des vignettes plus grandes et stables ; le gâteau orange-amandes de Laura Geyer utilise bien une orange. Les commandes des scènes sont des symboles à l’encre, sans pilules blanches. Le théâtre des recettes est agrandi et le mode cuisine offre un affichage beaucoup plus ample.

L’arrivée d’une scène de recette trace les contours de ses vrais acteurs avant de poser leur couleur. Les contours sont exportés depuis les dessins existants par `scripts/bake-contours-cuisine.py`, sans changer les sources. Les soulignements des titres dégagent leurs descendants et se retracent plus fréquemment. Des traces de chaussures humaines reviennent dans les marges des recettes ; le texte et les illustrations restent exclus de leurs routes.

Le four possède une cavité, un corps et une porte distincts, avec charnière ; la porte s’ouvre pour enfourner, se ferme puis se rouvre à la sortie. Le gaufrier est également articulé. Les apports du mélange de Laura Geyer disposent de créneaux successifs et les amandes ne sont plus cachées par un autre bol. Les étapes complexes ont une durée propre : l’application et le mode cuisine lisent les mêmes `REPERES_RECETTES`, sans supposer huit secondes partout.

Les quatre nouveaux desserts et leurs outils sont dans les sources d’illustrations v16, avec un manifeste d’export reproductible. Le paginateur garde les corps d’écriture et les textes ; Lisa De Paris, Sarah et Elise utilisent une feuille de suite native.

## Aperçu prioritaire

Thomas a demandé le 21 octobre de recevoir un rendu avant d’épuiser son usage. La cuisson haute définition a donc été interrompue ; cet aperçu utilise les pages standard disponibles, sans superposer d’anciennes tuiles de zoom. La haute définition reste à terminer dans une prochaine passe. Ce choix concerne les fichiers des pages, pas les réglages GPU ni les effets du carnet.

## Vérification et reprise

Les preuves sont conservées sous `verification/out/` (non versionné). `verify-recettes-v16.mjs --contrats` contrôle les dix-huit recettes, les acteurs, la porte et les apports des amandes. La passe navigateur du même script a capturé les 107 gestes et leurs fins d’étape. `verify-cuisine-layout-v16.mjs` vérifie ensuite les cadrages définitifs, la place réelle des commandes et la cible des ingrédients dans cinq scènes à risque. `verify-horloge-v16.mjs` vérifie la sélection et l’attente d’une étape longue avec la vraie Toile. `verify-cuisine-v16.mjs` exerce ingrédients, étapes, modes, clavier et focus sur TV/mobile. `verify-apparition-v16.mjs` compare contours, couleur partielle et résultat complet.

`src/components/SecretsDuCarnet/verify-reset-v16.mjs` couvre le vrai reset, y compris un frottage partiel sans note validée. `verify-navigation-v16.mjs --final` couvre la navigation et la recherche ; pour isoler le moteur Livre, son banc remplace seulement Bougie et Magie par des composants vides. Le produit conserve ces effets. `verify-magie-v16.mjs --carte-finale` échantillonne quarante routes par page et contrôle les exports de soulignements, sans prétendre couvrir toutes les routes possibles.

Les contrôles Chromium et écrans émulés ne mesurent pas la fluidité sur la TV physique ou Safari. Les portraits et clips réels restent absents. Utiliser le checkout existant et les actifs cuits ; ne pas refaire une cuisson complète pour une simple modification d’interface.
