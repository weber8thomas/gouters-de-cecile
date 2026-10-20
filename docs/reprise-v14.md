# Revue v14 — mains, recettes et notes en marge

Retour du 20 octobre : les recettes avaient perdu leurs mains propres au profit de Kalam. Les mouvements
restaient génériques ; l’utilisateur souhaite les vraies opérations dans l’ordre des recettes. Les secrets
deviennent moins explicites et une petite zone de farine se balaie pour découvrir une note.

## Écriture et ouverture

Les mots restent dessinés exactement par les fontes locales, dans le paginateur, l’encre et la loupe
existants. Les mains retrouvent leurs différences : Lisa Caveat appuyé, Emeline Kalam, Clémence Playwrite
moderne, Pierrette La Belle Aurore, Anatole Patrick Hand SC, Lise Caveat, Julien Shantell, Laura Playwrite
traditionnel. Les hauteurs optiques des fontes cursives sont calibrées ; aucun jitter ne déforme les glyphes.
Les styles et encres propres aux invités sont conservés. Tous les textes, quantités et notes sources restent intacts.

« Ex-libris » signifie que le carnet appartient à Cécile. Cette mention est maintenant manuscrite mais nette,
comme l’inscription principale. Une plume remplace la carotte de la première page. « Par celles et ceux qui
l’aiment » est plus grand et utilise de vrais caractères manuscrits lisibles.

## Recettes illustrées

`recettesAnimees.ts` associe les huit pages à 39 séquences, exactement une par étape source. Les gestes sont
simplifiés : chocolat cassé en deux parties du même dessin, beurre qui fond, sucre qui tombe, fouet, farine,
fruits coupés/ajoutés, pâte dans le moule, four et résultat. Crêpe qui se retourne, banane découpée, biscuits
émiettés et boules de cookies complètent les opérations. Les légendes résument l’étape ; les instructions
complètes et les températures restent dans la recette manuscrite.

Auto déroule la recette puis conserve le résultat. Rejouer recommence. Pas à pas attend après chaque opération ;
Suivant poursuit vers la suivante. Les huit scènes emploient la même horloge que les aquarelles, sans minuteur
par acteur. Les courtes transitions entre étapes masquent les distributions au changement de décor.
Les lèvres avant des bols, casseroles et moules suivent une découpe courbe, évitant une coupure horizontale.
Les originaux des trois planches et leurs recadrages reproductibles sont dans `design-system/sources/illustrations/v14`.

La bougie de la part de gâteau du chapitre manquait de repère de flamme : le repère est maintenant défini sur
la mèche. Les infobulles natives des illustrations sont supprimées ; les noms accessibles sont conservés.

## Encre et secrets

Le moteur exporte uniquement les véritables tracés décoratifs des soulignements (`Trace.decor`). Un masque
vectoriel sur l’encre les efface puis les retrace, sans repeindre un deuxième trait et sans toucher les lettres.
Le cycle partage l’horloge de Magie. Gestes, page masquée, loupe haute définition et mouvement réduit rendent
l’encre originale fixe. Une comparaison de captures montre 1 470 pixels effacés, 699 restant à retracer à
mi-parcours, puis zéro différence avec l’original. Les changements restent dans la boîte du soulignement de Lisa.

Le chien propose « Psst… » ; S ouvre une petite note latérale, sans compteur ni page indiquée d’emblée.
Une piste douce, puis une aide plus précise, sont disponibles à la demande. Les découvertes se gardent dans
les notes retrouvées. Le sens des cinq secrets et leurs citations, dont Scorpion ascendant Scorpion, restent inchangés.
La petite clé initiale est sous de la farine à balayer ; clic, toucher simple ou Entrée proposent aussi l’accès.
Le grattage ne dessine qu’au montage et pendant le geste, sans boucle permanente.

## Vérification

- Polices/pagination : trois tests de mots intégraux, loupe et révélation, plus accents/chiffres et huit mains
  distinctes. Logs `v14-font-tests.log` et `v14-font-glyphs-tests.log`.
- Cuisson ciblée de 18 pages, 34 cartes de temps et magie ; manifeste de 34 pages, zéro débordement.
- `verify-recettes-v14.mjs` : 39 captures SVG, frontières des étapes en fondu, actifs présents, poses valides,
  nombre d’étapes exact, chocolat, beurre et repère de flamme.
- `verify-recette-horloge-v14.mjs` : vrais boutons et vraie horloge WebGL ; attente, clavier, Auto, résultat conservé,
  Rejouer. Captures du chocolat cassé et fondu, œufs/sucre puis résultat.
- `verify-redessins-v14.mjs` et comparaison de pixels : le trait se retrace, les lettres et l’état final sont inchangés,
  le masque est retiré en mouvement réduit.
- Construction TypeScript/Vite réussie (`20261020T193702`). Parcours des huit recettes sur TV : 38 contrôles réussis,
  zéro erreur, 561 requêtes et aucune 404. Le mode réduit de ces captures vérifie la composition ; les séquences
  animées sont contrôlées séparément ci-dessus.

Preuves : `verification/out/recettes-v14`, `redessins-v14`, `notes-v14`, `site-v14-tv` et journaux `v14-*`.
Les anciens scénarios de quête v12 ne décrivent plus cette interface : utiliser `verify-notes-v14.mjs`.
Les vrais clips manquent encore ; les monogrammes restent en place. Les captures Linux/émulations ne mesurent
pas la fluidité du matériel HDMI ou Safari physique.

Aperçu dédié : `essais/coherence-v14/`, publié avec le script préservant la racine et les autres essais.

Version construite contrôlée : `20261020T193702`. Le parcours de notes sur cette version de production passe
sur TV et mobile : sept contrôles, cinq révélations, archives, rejeu, balayage, alternative clavier et toucher.
Le contrôle mobile de l’ouverture, d’Emeline et de Gâteaux passe aussi : 18 contrôles, aucune 404 ni exception.
La comparaison JSON avec v13 confirme que les huit recettes restent strictement identiques hors `style.police`.
