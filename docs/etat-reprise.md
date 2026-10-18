# Reprise du 18 octobre 2026

## Décisions confirmées

- Livraison vendredi 23 octobre : ordinateur en HDMI sur TV 1920×1080, navigation clavier.
- Couverture **f**, cachet de cire « 30 », retenue et cuite.
- Continuer avec les médias de démonstration ; aucun nouveau média réel ni animation IA autorisée à publier pour le moment.
- Priorité : consolider, corriger bordure/lumière puis aquarelle, avant chiens et surprises.
- L’utilisateur autorise sous-agents, modifications du code, Git et publication ; cela supplante les interdits historiques correspondants de CONTRACT.md.
- Le quota descend rapidement : ne pas multiplier les agents, finir les contrôles pertinents puis sauvegarder. Une reprise nécessite un nouveau message de l’utilisateur ; aucune relance automatique n’est programmée.

Sauvegarde GitHub : branche `codex/reprise-v8`. Le bilan fourni est archivé dans [bilan-claude-2026-10-18.md](bilan-claude-2026-10-18.md).

## Sources et intégration

Le cloud ne récupérait que main, restée au commit initial aa52e4f. Les sources étaient bien sur GitHub.
Base récupérée : feat/epic-wright-58442e, commit 2a47969 (finitions, mobile2, magie, lumière et sons déjà fusionnés).

- essai/dessins d4b93b2 intégré par 952b2f1 ; vitesse commune conservée au lieu du facteur constant.
- essai/anniversaire f69703f intégré par c1784c1 ; blocs ornement et cartouche conservés ensemble.
- Inventaire des actifs régénéré ; couverture f et correction des lumières précalculées incluses.
- API vitesse commune : src/lib/vitesse.ts ; Magie et Aquarelle la lisent.

## Défauts identifiés et travail effectué

- Les images Cycles dessinaient un biseau virtuel décalé du livre réel. Le compositeur corrige l’anneau des cartons en conservant l’ombre de table, et étend la contribution de la bougie sur le papier.
- Les calques sources de cette correction sont sauvegardés dans scripts/lumiere3d/calques-cycles-v1.zip ; retouche reproductible et idempotente avec composer.py --retoucher-cuisson, sans les anciens rendus de 332 Mo.
- Aquarelle : retrait de la déformation au pointeur et de la brillance artificielle, révélation du pigment d’origine plus progressive, scènes autonomes et vitesse commune conservées. Vérifier le rapport final avant de déclarer ce lot validé.
- Folio 8 = dedicace, gauche du sommaire : la fleur bleue a disparu avec anniversaire. Folio 10 = gateaux-gauche : frontispice décoré avec dessins. Captures inspectées ; aucun chevauchement du titre.
- Le grand gâteau rose de la dédicace reste trop plat et saturé : prochaine retouche graphique utile.
- Le workflow initial écrasait gh-pages et supprimait les essais. Nouveau publish-pages.mjs : parent/historique et essais conservés, push sans force, refus des courses concurrentes. Quatre tests d’intégration passent.
- Faux échec verify-site : Vite déduplique les tuiles sans encre identiques. Le contrôle vérifie désormais SHA-256 plutôt que le nom de chaque copie.

## Vérification et reprise

npm ci et dépendances Python épinglées installés. Le build:site fusionné puis corrigé passe (TypeScript inclus).
Avant les corrections visuelles, verify-site a validé 57 contrôles et signalé le faux échec de déduplication décrit ci-dessus ; aucun échec réseau ou JavaScript sur iPhone couché, ordinateur et TV.
Contrôles finaux terminés : site TV 34 OK / 0 KO ; lumière 31 OK / 0 KO ; aquarelle (autonomie et iPhone) 10 OK / 0 KO ; publication 4 tests OK. Serveur de développement : HTTP 200, un livre rendu, aucune exception ni ressource en erreur.
Réglages TV : 55 OK, 2 KO, 2 INFO (code 1), exécutés en repli --sans-webgl ; effets WebGL vérifiés séparément. Deux cas restent à isoler, sans conclure encore à un défaut de l’application plutôt que du scénario :
1. Après la longue séquence du menu, aucun geste page ne démarre dans la mesure de vitesse ; état constaté double=0, hash=#titre. Le feuilletage après une simple ouverture/fermeture du menu fonctionne (Julie → Biscuits).
2. Le scénario de migration v3 « lente » attend 70 % mais le menu affiche 100 %. Examiner l’injection par ouvrirPage/initReglages : un v4 de test peut primer sur l’ancienne clé avant migration.
La vitesse stockée est vérifiée : 150 % = 960 ms ; 100 % = 1313 ms ; 70 % = 1698 ms. Les curseurs, focus, zoom, son, persistance et résistance à localStorage indisponible passent.
Le run initial avec WebGL logiciel a été interrompu pour lenteur. Le runner --sans-webgl n’exige pas 30 i/s pour démarrer sa mesure fonctionnelle et échoue immédiatement si un geste n’a pas démarré/terminé, au lieu d’enchaîner des délais inutiles.
La version publique et main ne sont pas remplacées : résoudre ces deux échecs puis relancer la validation avant publication.
Rapports : verification/out/v8/site-final/site.json, verification/out/lumiere-v8/lumiere-v8.json, verification/out/dessins-v8-final/dessins.json. Les captures ne prouvent ni la lisibilité à 3 m ni la fluidité de la TV réelle.

Commandes : npm run dev ; npm run build:site ; GC_CHROME=/usr/bin/chromium node scripts/verify-site.mjs --site dist/site --only tv-1080 ; node --test scripts/tests/publish-pages.test.mjs.
Ne pas lancer de mesures de fluidité en parallèle. Le cloud a quatre cœurs CPU effectifs et utilise Chromium logiciel.

## Reprendre maintenant

1. Partir de codex/reprise-v8 et lire le présent document ainsi que le bilan archivé.
2. Isoler les deux cas de verify-reglages, en enregistrant page, focus et état du menu avant/après Home/End et avant ArrowRight ; distinguer erreur du test et défaut réel.
3. Relancer avec un dossier de résultat et un journal uniques : GC_CHROME=/usr/bin/chromium node scripts/verify-reglages.mjs --site dist/site --only tv-1080 --sans-webgl --out verification/out/v8/reglages-reprise.
4. Une fois validé, pousser la consolidation vers main puis publier selon les instructions ci-dessous. Ne pas recréer les fonctionnalités déjà intégrées ni relancer tous les agents.

## Publication et limites

Publication locale : node scripts/publish-pages.mjs, après build et validation. La commande conserve les essais existants.
Automatisation officielle : Settings → Pages → Source → GitHub Actions ; autoriser main si l’environnement github-pages limite les branches. L’API Pages n’est pas accessible avec l’authentification injectée actuelle ; aucun nouveau jeton n’a été demandé.

Le proxy cloud bloque actuellement l’URL GitHub Pages et Hugging Face. Les contrôles du site sont locaux ; ne pas prétendre avoir vérifié le déploiement public. Le brouillon réseau prévoit les domaines requis, à enregistrer dans les réglages de l’environnement pour les appliquer.
Les modèles d’écriture ne sont pas tous téléchargés à cause de ce blocage. Cela ne bloque pas l’application ni la couverture aux tracés figés, mais la génération de nouveaux textes doit être réessayée après ouverture réseau : bash tools/ecriture/telecharger.sh.

Restent au plan v8 : dessins anglais/Jack Russell, surprise lapin-carotte, vrais clips après collecte et accords, gâteau de dédicace, écoute audio, essai physique TV et Safari/iPhone. Le budget de 44 calques n’est pas encore revalidé. Papier : format écran 17×24 et export A5 existent séparément ; confirmer le choix avant impression.
