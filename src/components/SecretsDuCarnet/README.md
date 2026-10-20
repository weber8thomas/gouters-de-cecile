# Les secrets du carnet

Une petite quête accompagne la lecture : clé de garde → premier album → second album →
intercalaire Gâteaux & cakes → dernière double page. Chaque secret doit être révélé puis confirmé
pour débloquer le suivant. Le guide donne le nom de la page, son folio, son côté et le dessin à chercher. Un lien « Aller »
ouvre la double page demandée seulement après activation du lecteur. Sur écran à une page,
le guide précise si la cachette se trouve sur l’autre côté : les flèches du carnet y conduisent.
Les cachettes déjà trouvées se relisent ; le guide peut recommencer ou rejouer la quête.

`<SecretsDuCarnet page="garde" />` se monte dans `PageCuite.dessus` et ne dessine qu’une cachette
accessible. Son rectangle est contrôlé contre l’alpha de l’encre (aux proportions réelles de la
page), les zones vivantes et les liens. Aucun chien n’apparaît dans les pages. Si aucune boîte ne
convient, **S** permet tout de même de révéler le secret sur sa page via le guide.

`<CompagnonDuCarnet />`, monté une fois sous Ecran, porte le guide dans le calque des contrôles.
Le chien est extérieur au livre et évite la bougie. Il reste assis ; un bref hochement de tête au clic utilise deux découpes SVG de la même
image, sans déplacer le corps ni les pattes. Il n’y a pas de boucle ni d’alternance de poses : `jack-russell-guide`, avec repli sur `jack-russell-assis`. Sans espace vérifié, seul le
bouton des secrets demeure. Le panneau prend une marge de table assez large ; sinon, il s’ouvre
comme une carte de lecture sur demande. Il se ferme avec Échap et ne bloque pas les flèches.

**S** ouvre le guide sans révéler le secret. Le dessin sur la page ou le bouton « Découvrir »
révèle la cachette ; « Continuer » débloque la suivante. Aucune seconde déclaration
« J’ai trouvé » n’est demandée. La progression compte aussi le secret actuellement découvert.
Les coches permettent de relire les découvertes précédentes. **Entrée/Espace** active le
bouton choisi. Les menus, objets soulevés, gestes et loupes gardent la priorité. Une seule
observation DOM suit la visibilité ; aucune horloge ne fait changer les scènes.
Le mouvement réduit coupe le hochement et l’ouverture brève de l’indice cuisine.

`src/lib/quete.ts` définit les cinq étapes et les transitions. `gc:quete:v1` conserve la progression
et l’indice révélé ; une valeur abîmée repart du début et le jeu reste possible sans stockage.
Une étape future ne peut ni se révéler ni se valider. Les albums invitent les proches à raconter leurs souvenirs sans inventer d’anecdote.
La révélation de Douce Cécile conserve l’ironie
et le Scorpion ascendant Scorpion fournis par l’utilisateur.

Le script historique `scripts/verify-secrets.mjs` décrit les douze surprises et quatre poses
supprimées. Il ne correspond plus à cette direction. Les preuves actuelles sont dans `verification/out/quete-v13/`
(transitions, clavier, persistance, géométrie, hochement isolé et captures TV/mobile).

Le banc ciblé peut viser le build ou l’URL finale (sans serveur Vite ni rechargement HMR) :
`GC_CHROME=/usr/bin/chromium node verification/out/quete-v12/verify.mjs --site dist/site`
ou `--url https://weber8thomas.github.io/gouters-de-cecile/essais/coherence-v12/`.
Il attend la fin de l’écriture avant les captures. Le premier relevé `tv-04-gateaux-pendant-ouverture.png`
a capturé le début de l’ancienne transition ; le texte cuisine est désormais visible dès l’ouverture.

Vérification durable : `GC_CHROME=/usr/bin/chromium node scripts/verify-quete-v12.mjs --site dist/site`.

Revue v13 : les deux scripts durables acceptent aussi `--url http://localhost:5173`.
`verify-quete-v12.mjs` vérifie désormais le parcours explicite Découvrir → Continuer ;
`verify-quete-affichage-v12.mjs` vérifie les bornes mobile/TV et isole le vrai SVG du chien
pour mesurer un hochement de 1,4° avec corps fixe et désactivation en mouvement réduit.
