# Reprise — état au 19 octobre 2026

## Décisions et sauvegarde

- Démo vendredi 23 octobre : ordinateur en HDMI sur TV 1920×1080, navigation clavier.
- Couverture f avec cachet de cire « 30 » ; médias de démonstration uniquement.
- Dernière priorité donnée : harmoniser tous les dessins, remplacer les papillons par des chiens avec
  un Jack Russell en vedette, corriger couverture/ouverture et éclairage du papier, gâteau et citrons.
- Direction confirmée par l'utilisateur : style anglais ancien et doux, **avec beaucoup d'animations**.
  Les citrons doivent bouger de manière naturelle et fluide ; un frémissement à peine visible ne suffit pas.
- Modifications, sous-agents, Git et publication autorisés. Limiter les agents et les contrôles longs
  pour économiser le quota. Cette reprise a utilisé deux agents spécialisés existants.
- Branche de sauvegarde : `codex/reprise-v8`. `main` reste au commit initial ; ne pas y chercher le site.
- Aperçu : https://weber8thomas.github.io/gouters-de-cecile/essais/reprise-v8/
- Aucun redémarrage automatique après épuisement du quota n'est programmé ; la reprise nécessite un
  nouveau message de l'utilisateur. Ces documents et GitHub permettent de reprendre sans réaudit.

## Travail intégré

Base : `feat/epic-wright-58442e` 2a47969, puis dessins et anniversaire fusionnés. Historique initial
et bilan fourni : [bilan de Claude](bilan-claude-2026-10-18.md). Stratégie : [plan v8](plan-v8.md).

### Série graphique anglaise

Les 23 illustrations employées dans le livre ont été remplacées ensemble, plus un Jack Russell :
crayon fin et aquarelle mate, porcelaine florale crème, couleurs douces. Cookies, fruits, gâteaux et
vaisselle partagent maintenant la même direction. Originaux et cadrages sont versionnés ; aucun
appel de génération requis au build. Voir [sources et reconstruction](../design-system/sources/illustrations/v9/README.md).

Les anciens masques de parties et leurs fonds sont retirés et ne peuvent plus être recréés sur la
nouvelle série. Deux nouveaux masques sont construits sur les composantes alpha réelles de chaque
citron : fruit avec sa feuille, et tranche, avec toutes leurs franges. Leur fond est transparent et
leur recomposition évite les doubles contours. Les autres dessins restent entiers. Après le retour
utilisateur, la cadence et la variété des scènes sont renforcées : accélération et arrêt progressifs,
roulement borné des citrons sur leur appui, vapeur et flammes plus présentes, gestes des pâtisseries.
Le grand gâteau a cinq bougies. La part de gâteau a une bougie éteinte, sans fausse flamme.
Le gâteau et les deux guirlandes de l'introduction, jusque-là incorporés à l'encre, ont aussi été
remplacés. Migration des encres 1×/2×/4× avec conservation exacte de tous les pixels hors des dessins ;
originaux archivés et descriptions source actualisées, sans régénérer le texte.

Le Jack Russell remplace les papillons et la coccinelle actifs. Son trajet terrestre réserve une zone
libre d'encre, d'objets et de photos pour le chien et sa bulle anglaise. Pas de route sûre : pas de
chien. Une seule pose source pour l'instant, pas encore une collection de poses variées ni le lapin.

### Ouverture et lumière

L'ancien rendu Cycles projetait une silhouette fixe du livre, décalée durant l'ouverture. Il ne sert
plus qu'à éclairer la table vide. La lumière du papier est montée dans les faces réelles, sous
l'encre ; elle suit leurs rotations et leurs zooms. Les ombres physiques du livre sont rétablies.
La bougie éclaire davantage le bas gauche et son vacillement pilote cette contribution. Le mode
réduit et l'arrêt du feu restent fixes. Aucun nouveau rendu Blender coûteux n'a été lancé.

### Publication

Le workflow officiel Pages et `scripts/publish-pages.mjs` conservent l'historique et les essais, sans
push forcé. Ce script publie la racine du site : ne pas l'utiliser pour une simple mise à jour de
l'aperçu. Celui-ci est publié sous `essais/reprise-v8/` seulement, en conservant les autres chemins.
Commande d'aperçu : `python3 scripts/publish-preview.py` après validation ; les vérifications
comparent les arbres Git, le préfixe modifié et le commit distant après push.

## Vérifications

- Dépendances installées avec versions verrouillées ; build Vite et TypeScript passent.
- Lumière : vraie ouverture et fermeture au clavier aux trois distances, aucune silhouette figée ;
  contribution sur papier +31,3 niveaux RGB médians, contraste de la même encre 4,59 → 6,01:1.
  Vacillement natif confirmé : variation d'opacité papier 0,1717 en 2,2 s. Modes réduit/feu désactivé OK.
- Rapports lumière : `verification/out/lumiere-v9/` ; illustrations :
  `verification/out/harmonisation-v9/serie.png` et `verification/out/dessins-v9/`.
- Site TV sur Julie, Biscuits et Sommaire : **36 OK, 0 KO**, aucune ressource en erreur.
- Chien : trajet terrestre, déplacement, arrêt/bulle spontanés et réponse au toucher vérifiés.
  Taille portée à 9 % de hauteur de page ; réserve de 17 % (chien+bulle 16,05 %), deux pistes sûres
  conservées sur l'encre réelle de Biscuits.
- Nouveau mouvement des citrons : masques chargés en vrai ; 86 poses WebGL rendues sur un cycle de
  6,02 s. Séquence et planche inspectées, aucun double contour ni morceau coupé. Angle maximal 5,90°,
  déplacement ≤2 % de hauteur d'image, ligne de sol conservée. Continuité des scènes et raccords
  vérifiée ; écart numérique de dérivée maximal 1,25e-5. Le premier test « zéro parties » était devenu
  obsolète avec la demande d'animation naturelle et a été remplacé par des contrôles d'appui et de rigidité.
- Lumière : 15 contrôles d'ouverture/fermeture, 4 contrôles papier/réduit/arrêt du feu, un contrôle de
  vacillement natif. Les deux anciens critères erronés (RGB d'une encre translucide et horloge du
  simulateur) ont été corrigés ; nouveaux rapports ciblés sans échec.
- Introduction harmonisée vérifiée dans le build final : deux toiles prêtes, guirlandes et gâteau
  à cinq bougies en scène réelle, aucune erreur ni ressource manquante. Capture :
  `verification/out/harmonisation-v9/final-titre.png`. Captures réduites Sommaire/Biscuits également
  inspectées ; le gâteau de « Joyeux anniversaire » est accordé à la théière et au cupcake.
- `verify-site` exige désormais une photo seulement si cette page dispose d'un clip publié. Le
  calque Soulever est global et ne prouve pas qu'un frontispice doit avoir une photo.
- Rapports actuels : `verification/out/harmonisation-v9/site-final/site.json`,
  `verification/out/harmonisation-v9/lumiere/lumiere-surfaces-suite.json`,
  `verification/out/lumiere-v9/lumiere-surfaces-suite.json` (vacillement),
  `verification/out/dessins-v9/dessins.json` (chien), `verification/out/citron-final/dessins.json`.
  Film déterministe : `verification/out/citron-vivant/citron-continu.webp` ; il montre les poses du
  moteur, pas une mesure de FPS sur le matériel de présentation.

Contrôles précédents : site TV 34 OK, dessins autonomie/iPhone 10 OK, publication 4 tests OK.
Deux cas de la longue suite réglages restent à isoler, sans lien démontré avec les défauts visuels :
1. Mesure de vitesse après une longue navigation du menu : aucun tour ne démarre. Le tour après une
   simple ouverture/fermeture du menu fonctionne (Julie → Biscuits).
2. Migration v3 « lente » attend 70 %, mais le scénario affiche 100 % ; l'injection v4 du test peut primer.
Ne pas prétendre que cette suite est entièrement verte. Vitesse stockée mesurée : 150 %=960 ms,
100 %=1313 ms, 70 %=1698 ms. Autres curseurs, focus, zoom, son et persistance passent.

## Reprendre

Partir de `codex/reprise-v8`, lire ce document, puis regarder l'aperçu avant de relancer du travail.
Ne pas régénérer les illustrations ni relancer un audit complet sans nouvelle raison.

```sh
npm ci
npm run build:site
GC_CHROME=/usr/bin/chromium node scripts/verify-site.mjs --site dist/site --only tv-1080
GC_CHROME=/usr/bin/chromium node scripts/verify-dessins.mjs --site dist/site --suites citron,creature --out verification/out/dessins-v9
GC_CHROME=/usr/bin/chromium node scripts/verify-lumiere-v8.mjs --site dist/site
```

Éviter les mesures de fluidité en parallèle : Chromium utilise le rendu logiciel sur quatre cœurs.
Les captures ne prouvent ni la fluidité de la TV réelle ni la lisibilité à trois mètres. Essai physique
HDMI et Safari/iPhone toujours utiles. Budget de 44 calques à revalider si d'autres effets sont ajoutés.
Le proxy cloud refuse actuellement GitHub Pages (CONNECT 403) : le build et le sous-chemin sont
contrôlés localement, la publication vérifiée dans Git, sans prétendre avoir vu le site public.

Le brouillon réseau prévoit Pages et Hugging Face, mais n'est appliqué qu'après enregistrement et
publication de l'environnement. Les modèles d'écriture manquants ne bloquent pas le carnet déjà cuit.
À suivre : variations de poses du chien, surprise lapin-carotte, écoute audio, vrais clips après collecte
et accords. Pour impression, préciser le choix entre le carnet écran 17×24 et l'export A5 séparé.
