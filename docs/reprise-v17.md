# Revue v17 — navigation, sommaire et cuisine

Corrections de cette passe : préparation des tours bornée, tour clavier direct conservant la feuille animée ; accès Sommaire et Rechercher en tête du menu latéral et signets visibles. Le mode cuisine s’ouvre en pas à pas et le montre explicitement ; passer au plein écran arrête la lecture automatique. Ses trois acteurs principaux (bol, casserole, chocolat) ont des sources restaurées natives de 1254 × 1254, distinctes des petites images du livre.

Les récipients gardent leur échelle en versant. Les morceaux de chocolat tombent dans la casserole ; la porte du four suit sa charnière oblique. Margot utilise la scène à gauche et toute la préparation à droite.

Mises en page demandées : sommaire sur 8–10, familles de fondants et gâteaux aux pommes, vignettes agrandies et finale mieux placée ; noms réagencés dans les chapitres, Lisa Allienne en une ligne, ingrédients de Margot en deux colonnes et étapes réunies page 33 ; scène d’Antoine agrandie. Génération des 14 faces ciblées en cours au premier point de sauvegarde, sans refaire les 62 pages ni les tuiles 4×.

Validations déjà effectuées : mode cuisine TV/mobile, étapes manuelles sans passage automatique, commandes et focus ; 18 contrats de recettes ; captures ciblées Emeline/Marie et four inspectées ; préflight des pages ciblées sans débordement. Le build et la publication définitifs attendent la fin des faces et cartes actualisées. Rapports locaux non versionnés sous verification/out/v17-*.log et verification/out/coherence-v17/.

## Sauvegarde immédiate demandée

À la demande « push tout mtn », le travail est sauvegardé avant la fin de la génération ciblée des pages. Ne pas présenter les nouvelles mises en page comme publiées : certaines faces et leurs cartes attendent encore l’assemblage. Les sources, les dessins HD et les correctifs de navigation/cuisine sont versionnés. Le dernier aperçu public complet reste `essais/coherence-v16/` tant qu’un nouvel aperçu n’a pas été publié. Éviter de recuire toutes les pages pour reprendre ; cibler les 14 faces modifiées et leur contexte. Les sorties de calcul temporaires sous `verification/out/` ne remplacent pas les sources versionnées.

TypeScript final et le contrôle d’attente de navigation passent. Le mode cuisine TV/mobile a passé son contrôle de fonctionnement avant le dernier export HD ; la seconde passe a vérifié la source native HD et produit la capture TV, puis a été interrompue pour libérer le processeur aux pages. Ne pas annoncer une mesure de fluidité sur TV physique.

## Reprise v18 (branche `claude/reprise-v18`)

Constats au départ de `e2f24e5` : `design-system/baked/pages/papier/f47.webp` est tronqué (illisible) et aucune entrée de `.cuisson.json` ne correspond aux sources actuelles. « Sommaire (suite) » (`gateaux-gauche`, folio 10) reçoit `"police": "kalam"` comme les folios 8–9, au lieu de l’écriture neuronale. La cuisson complète sans 4× se fait en local, sur l’installation qui a produit la v16 :

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 node scripts/bake-pages.mjs --sans-4x
# ou, en parallèle (reprendre avec les mêmes options et --resume après une interruption) :
tools/ecriture/.venv/bin/python scripts/bake-pages-parallele.py --jobs 6 --sans-4x --out verification/out/v18-parallele
tools/ecriture/.venv/bin/python scripts/bake-temps-encre.py
tools/ecriture/.venv/bin/python scripts/bake-magie.py
node scripts/assets.mjs
npm run build:site
```
