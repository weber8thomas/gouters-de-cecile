# TODO — Les goûters de Cécile

État au 22/10/2026. Suivi détaillé par personne : `prive/suivi-invites.xlsx` (hors git).
Les vrais médias vont dans `prive/` (hors git, jamais publiés) : `prive/<slug>/photos|videos/`, `prive/cecile/photos/`.

## 1. Relecture (assouplie le 22/10 : 116 → 39 mots signalés sur 24 pages)
- [x] Relecture assouplie (accents, ponctuation, 1/l, œ, g/9, mots lus à l'identique).
- [ ] 39 restants : la plupart lisibles (« beurre » lu « bcurre », « Cécile, » lu « Cceik ») → les garder en avertissement
      sans faire échouer la cuisson ? Vrais à vérifier : « 16 » (dédicace), « 60g » (Coralie), « 1 » (Clémence, Laura, Léa). : 116 mots signalés sur 44 pages, ~114 sont lisibles
      (accents/ponctuation, « 1. » lu « l », « œ » lu « ce », mots lus à l'identique mais signalés).
      Assouplir `relire_rendu` / `_lire_image` (scripts/pages/ecriture.py), puis vérifier à l'œil :
      « 2026. » (fin-droite), « 4. » (elise-droite), « 8. » / « 9. » (elise-feuillet-recto).

## 2. Contenu à recevoir
- [ ] **Photos de Cécile** pour l'album d'intro (doubles cecile-1 et cecile-2) : 10 photos + leur âge
      (légendes « Cécile, … ans » encore en pointillés). Aujourd'hui : photos Pexels de remplacement.
      Mode d'emploi : `prive/cecile/LISEZMOI.md`.
- [ ] **Petits mots** : 9 sur 22 encore « Lorem ipsum » — Lisa Allienne, Emeline, Pierrette, Anatole, Alba, Maël & Marc,
      Laura Gramegna, Marie, Lily, Shannen, Olivia, Nathan & Martin (reçus : Coralie, Antoine, Suzanne, Elise, Margot,
      Sarah, Laura Geyer, Léa, Lisa De Paris, Clémence, Julien, Lise, Marine). Lise : mot intégré (🫶🏻 → 🫶) ;
      Marine, Guillaume & Théo : mot intégré (🎂 → croquis gâteau à bougies, ♥️ → ❤️).
- [x] **Marine, Guillaume & Théo** : recette (Tiramisu) et petit mot reçus le 22/10, intégrés.
- [ ] **Aquarelle tiramisu** (dessert final, vignette, mode cuisine) : `fondant-chocolat` provisoire ; tasse de café et boudoirs
      à dessiner (le mode cuisine réutilise `biscuit-sable`, `fromage-blanc`, `pichet-lait`, `torchon`, `tamis`).
- [ ] **Photos / vidéos des invités** : aucune reçue (`src/content/videos.json` vide ; clips Pexels en démo).
- [ ] **Noms** : confirmer « Julien & Mila » (écrit « Julia & Mila ») et « Margot & Flo » (écrit « Margo & Flo »).
- [ ] **Recettes pas encore reçues** (10 personnes du groupe) : voir le tableau Excel.

## 3. Vrais médias — VERSION LOCALE SEULEMENT (décision du 22/10)
Les vraies photos/vidéos ne sont jamais publiées : le site GitHub Pages garde les placeholders.
- [ ] *(en cours)* `npm run medias:local` (cuisson depuis `prive/` vers `prive/baked/`), `npm run medias:planche`
      (planche contact des photos de Cécile), `npm run build:local` + `npm run preview:local` (dist/local, TV/iPad le jour J).
- [ ] Garde-fou : `build:site` échoue si un fichier de `prive/` se retrouve dans dist/site.
- [ ] Mode « photo seule » pour un invité sans vidéo (lent zoom de 12 s sur sa photo).
- [ ] Choisir les photos de l'album (10, ou 15 avec une 3e double page) + leur âge → `prive/cecile/choix.json`.

## 4. Nouvelles recettes et corrections (non commitées)
### 22/10
- [x] Julien ↔ Clémence : Julien = cheesecake (Gâteaux, folios 16–17), Clémence = cookies (Biscuits).
- [x] 7 petits mots intégrés (emojis dessinés au trait : cœur, sourire) ; aquarelle de Margot réduite pour son mot.
- [x] Mot de Lise intégré (cadre sans titre provisoire) ; à recuire : `--only lise`.
### Shannen, Olivia, Nathan & Martin — Tarte poire « chocolat » (Tartes & crumbles, folios 44–45)
- [x] Recette telle quelle, roster, carnet, plan, sommaire, mode cuisine (5 étapes).
- [ ] Aquarelle tarte poire-chocolat : `flaugnarde-poires` provisoire.

### Lily — Cinnamon rolls (Brioches, folios 56–57 + feuillet volant)
- [x] Recette (texte reçu tel quel), roster, carnet, plan de pages, sommaire (suite), mode cuisine (9 étapes).
- [ ] Aquarelle « cinnamon roll » (dessert final + vignette) : `brioche` / `cannelle` provisoires.
- [x] Pages cuites (22/10).

### Marine, Guillaume & Théo — Tiramisu (Gâteaux & cakes, en fin de chapitre, folios 34–35)
- [x] Recette telle quelle (TXT brut), roster, carnet, plan de pages, sommaire, mode cuisine (6 étapes). Signature et nom « Marine, Guillaume & Théo », mot intégré.
- [x] Insertion après Margot : tout ce qui suit est décalé de 2 folios (Tartes & crumbles dès le folio 36, Le mot de la fin 64–65).
- [ ] À recuire : `node scripts/bake-pages.mjs --only marine,julien,gateaux,sommaire,tartes,anatole,lise,alba,shannen,biscuits,clemence,lisa-de-paris,brioches,sarah,lily,crepes,laura,elise,fin`
      (+ `bake-temps-encre`, `bake-magie`, inventaire). Vérifier sur l'aperçu que le sommaire (page droite) tient avec la ligne en plus.
- [ ] Aquarelle tiramisu : `fondant-chocolat` provisoire.
- [x] Noms affichés (nom, signature, roster, carnet, sommaire) : Sarah & Maxime, Marine, Guillaume & Théo, Shannen, Olivia, Nathan & Martin,
      Alba, Maël & Marc, Clémence & Mila, Julien & Mila. Tartes : liste des invités sur une colonne (nom de Shannen trop long pour deux) ;
      bandeau de Shannen réduit (2,0 au lieu de 2,2) ; sommaire : « Shannen, Olivia, Nathan & Martin — Tarte poire » (titre raccourci).
- [x] Noms (22/10, suite) : Margot & Flo, Elise & Lucas, Sarah, Gabriel & Maxime (remplace Sarah & Maxime), Lise & Maxime ; bandeaux `pente: 0.3`
      (Sarah aussi `taille` 2,0) ; Emma & Arthur dans l'Excel seulement.

### Alba, Maël & Marc — Crumble aux pommes
- [x] Recette, roster, carnet (folios 42–43), plan de pages, sommaire, chapitre « Tartes & crumbles », mode cuisine.
- [ ] Aquarelle « crumble » (dessert final + vignette) : `tarte-pommes` / `pomme-2` provisoires.
- [x] Pages cuites (22/10), pages décalées et sommaire recuits.

## 5. Cuisson et publication
- [x] 22/10 : carnet recuit complet (72 pages, ×4 compris), temps d'encre, magie, inventaire, `npm run build:site` OK.
- [ ] Vérifier en local (`npx vite preview --host`) : TV, mobile, iPad ; puis commit + push.
- [ ] Nettoyer les vieilles tuiles ×4 des pages qui n'existent plus dans `design-system/baked/pages/4x/`.

## 6. Qualité / appareils (tests du 22/10 : verification/out/v22/)
- [x] Hauteur d'x iPad portrait : OK (3,007 mrad, seuil 2,917, ~3 % de marge). iPad paysage, TV : OK.
- [ ] iPhone paysage : hauteur d'x 2,885 mrad, ~1 % sous le seuil → viser ~5 % de marge partout.
- [ ] Scripts de test périmés : `#julie`, `#rose`, `#mathis` n'ouvrent plus le livre à froid (couverture) → faux KO en cascade
      (photo, coin, double page). Aligner verify-devices / verify-mobile / fps sur le site actuel ; `fps.mjs` doit lire `GC_CHROME`.
- [ ] Bouton Réglages signalé « invisible » partout (seuls Sommaire / Rechercher visibles) : vérifier à la main.
- [ ] FPS : mesures inexploitables (Mac saturé par la cuisson, rendu logiciel). Refaire sur machine calme, idéalement sur un vrai iPad
      (Safari + Web Inspector). Cible : p95 < 25 ms sur tourne-page, ouverture, coin.
- [ ] GPU : ombre du livre `--gc-sh-book` (blur 64 px, tokens.css:75) → plus légère ou ombre pré-cuite (traite aussi la bande d'ombre du 18/10) ;
      coin : 49 calques (plafond 44), `drop-shadow` double (DoublePage.css:170) ; `will-change` statiques dans Livre.css.
- [ ] Machine : `playwright install chromium` absent ; `~/.pnp.cjs` (Yarn PnP) casse `build-bundle.mjs`.

## 7. Temps de cuisson
- [x] `npm run pages:rapide` (aperçu ~1 min) / `npm run pages:complet` (HD + ×4, 8 processus) ; cache ×4 séparé ; empreinte restreinte.
      Carnet complet du 22/10 : 72 pages en 7 min 14 s (dont pagination des nouvelles recettes) au lieu de 17 min.
- [ ] `bake-temps-encre.py` (2 min 38 s) et `bake-magie.py` (59 s) restent séquentiels : à paralléliser.
- [ ] Supprimer `scripts/bake-pages-parallele.py` (simple redirection) et mettre à jour `docs/reprise-v17.md`.

## 8. Mise en page à revoir (aperçus du 22/10)
- [ ] Lily droite : l'étape 8 s'écrit en colonne étroite (« Préchauffer le / four à 180 degrés / … »).
- [ ] Margot gauche : son mot prend la place, seuls 2 ingrédients restent à gauche ; signature en double (« Gros bisous 🥰 Margot » + « Margot & Flo »).
- [ ] Tests unitaires : 10 échecs anciens (folios, sommaire, feuillets longs, fixtures julie).

## 9. Sommaire
- [x] « Lisa Allienne — Carrot cake » ; « Lisa De Paris — Gâteaux de Noël » (à recuire avec le sommaire).

## 10. Retours du 22/10 soir (ordre : performance d'abord)
- [ ] **Performance iPad** : GPU à 100 % au repos. Mesure en cours effet par effet (scripts dans `verification/perf/`). Ensuite, tout ce qui est coûteux devient précalculé ou fixe au repos.
- [ ] **Réactivité** : un toucher coupe net l'animation en cours et agit tout de suite (fermer la photo, tourner la page…).
- [ ] **Ouverture d'une photo** : trop lente, mouvement pas naturel.
- [ ] **Photos** : supprimer le mouvement superflu et le reflet brillant toutes les 15 s, passer le tirage en mat.
- [ ] **Sépia** : couleur à l'ouverture d'une photo, avec une option « garder le sépia » dans Réglages.
- [ ] **Effet farine** : à supprimer.
- [ ] **Légendes de l'album** : brouillon dans `prive/cecile/choix.json` (`legende`, `date` au mois près), à faire valider puis afficher (local seulement).
- [ ] **Photo → vidéo** : retrouver les originaux des Motion Photos dans Google Photos (vidéo intégrée perdue à l'export), essayer « Photo en vidéo » de Google Photos, tester une parallaxe 2,5D locale.
- [ ] **Recettes avec variantes** : centrer verticalement les illustrations.
- [ ] **Cinnamon rolls (Lily)** : ce n'est pas la bonne illustration.
- [ ] **Sommaire et Rechercher** : boutons visibles seulement au survol (toucher sur le bord sur iPad).
- [ ] **Scorpions cachés** à ajouter dans le carnet.
- [ ] **Parallaxe sur les vignettes de l'album seulement** (pas sur la photo ouverte) : visages et personnes en calques rigides, puis génération des 25 photos ; test sur une double complète après la mesure GPU.
- [ ] **Photos des invités** (reçues le 22/10 à 16 h 27, copiées dans `prive/<slug>/photos/`) : Laura Geyer, Sarah, Léa, Marine, Shannen, Margot, Suzanne, Elise, Anatole, plus les vidéos de Lise et d'Alba. Lancer `npm run medias:local -- --sans-cecile` quand la machine est calme, puis vérifier.
- [ ] **Date (mois année) sous chaque photo** : EXIF quand il existe (Cécile : `choix.json` ; invités : `prive/dates-photos.json`), sinon demander à Thomas. L'afficher en local.
