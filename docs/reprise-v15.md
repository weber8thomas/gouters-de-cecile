# Recettes et découvertes — passe 15

Cette passe ajoute cinq recettes aux huit déjà reçues : Laura Geyer (orange et amandes), Marie (fondant de Maman Sylvie Cattelin), Sarah (brioche), Léa (pommes), Coralie (fondant à l’huile). Les crêpes restent attribuées à Laura Gramegna, avec leur identifiant `laura` pour préserver les liens existants.

La source initiale est conservée dans les TXT et dans `docs/sources/recettes-recueillies-2026-10-20-v15.md`. La cuisson de Léa est affichée à 180 °C, correction confirmée par Thomas. Quatre petits mots portent explicitement « Lorem ipsum — message à venir » ; seul le nouveau message de Coralie est authentique à ce stade. Le sommaire répartit ses treize entrées sur deux pages, avec les dessins et la dédicace.

Les 70 étapes disposent d’une séquence illustrée, dans l’ordre des préparations. La vitesse de démonstration ne remplace pas les temps de cuisson ou de repos imprimés dans la recette. Les outils partagent une horloge et des acteurs d’aquarelle ; les ingrédients arrivent successivement au-dessus du récipient. Le résultat reste visible en fin de recette.

Les commandes restent à la même place : Précédente / numéro / Suivante, puis Pas à pas (ou Lecture auto) / Rejouer. Une navigation explicite rejoue le geste sélectionné en avant. Rejouer reprend cette étape en mode manuel, et toute la recette en mode automatique. Lecture auto reprend à la position courante du mode manuel. Les extrémités désactivent la navigation correspondante.

La farine se dégage localement, par gestes répétés. Un clic ou une pression sur Entrée effectue seulement un petit balayage. La découverte nécessite plusieurs gestes ; une progression déjà effectuée reste visible. Les cachettes varient entre farine, enveloppe, pli et tache, avec le rabat latéral et les notes retrouvées conservés.

Vérifications ciblées : `verify-recettes-v15.mjs`, `verify-recette-horloge-v15.mjs`, `verify-notes-v15.mjs`, pagination et glyphes dans `test_police_lisible`, puis construction et contrôles du site produit sur TV et mobile. Les captures et rapports sont placés sous `verification/out/`.

La génération complète produit 48 faces (46 pages principales et les deux faces du feuillet Sarah), sans débordement. Les quatre contrôles de pagination/glyphes passent pour les treize recettes. Les 70 scènes sont capturées pendant le geste et en fin d’étape ; le contrôle des pâtons vérifie aussi leur visibilité réelle dans le moule. Huit contrôles couvrent les notes, la farine progressive, le clavier et le tactile. Le site construit passe 66 contrôles sur TV et 34 sur mobile, sans 404 ni erreur navigateur ; les vidéos réelles restent en attente, comme demandé.

Le feuillet porte désormais le même repère d’objet actif que les photos. Le contrôle de retournement attend explicitement la fin du vol et de la rotation : son ancienne limite silencieuse de huit secondes pouvait mesurer un rectangle encore en mouvement sur le rendu logiciel lent du cloud. Les seuils de comparaison visuelle restent inchangés. `verify-recette-livre-v15.mjs` couvre aussi les vrais boutons et le maintien de la double page, dans le carnet complet.

Ces vérifications utilisent Chromium Linux et des écrans émulés ; elles ne mesurent pas les performances de la TV physique en HDMI. Les actifs cuits et sources sont versionnés ; les rapports/captures sont conservés dans `verification/out/`.

Livraison : build `20261021T044655`, aperçu `essais/coherence-v15/`. Contrôle final du feuillet : 30 OK, zéro échec, sur TV et iPhone paysage ; recto/verso, clavier, toucher, glisser, fermeture et retour en place. Les vrais boutons de Marie et Sarah gardent leurs positions et leur double page (indices 10 et 19), avec passage à l’étape suivante puis retour au clavier. Aucun échec navigateur dans ces contrôles.
