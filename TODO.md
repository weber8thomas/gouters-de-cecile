# TODO — Les goûters de Cécile

État au 22/10/2026 au soir (commits 4585046 et ba942fd, **non poussés**).
Suivi par personne : `prive/suivi-invites.xlsx` (hors git).
Vrais médias : `prive/` seulement (hors git, jamais publiés), visibles uniquement dans le build local
(`npm run build:local && npm run preview:local`).

## 1. À recevoir des invités
- [ ] **Recettes** (10 personnes) : Emma & Arthur, Julia Kieffer, Malo Scheuer-Boistelle, Manoir Chaste, Max Amr,
      Théophile Sb, Victoria Jung, Madina Lapeyre-Nigmatullaeva, Manon Shw, Margaux Prng.
- [ ] **Petits mots** (9 encore « Lorem ipsum ») : Lisa Allienne, Emeline, Pierrette, Anatole, Alba, Maël & Marc,
      Laura Gramegna, Marie, Lily, Shannen, Olivia, Nathan & Martin.
- [ ] **Photos ou vidéos** (11 sans rien) : Lisa Allienne, Emeline, Clémence & Mila, Pierrette, Julien & Mila,
      Laura Gramegna, Marie, Coralie, Lisa De Paris, Antoine, Lily.
      Reçues : Anatole, Elise, Laura Geyer, Léa, Margot, Marine, Sarah, Shannen, Suzanne (photos) ; Lise, Alba (vidéos).
- [ ] **Dates (mois année)** des médias sans métadonnées → `prive/dates-photos.json` : Laura Geyer, Léa, Margot,
      Marine, Sarah, Shannen, Suzanne, vidéos de Lise et d'Alba.

## 2. Aquarelles à créer (provisoires aujourd'hui)
- [ ] Tiramisu (Marine) : `fondant-chocolat` provisoire.
- [ ] Crumble (Alba) : `tarte-pommes` provisoire.
- [ ] Tarte poire-chocolat (Shannen) : `flaugnarde-poires` provisoire.
- [ ] Cinnamon rolls (Lily) : `roules-cannelle`, composée par script, trop schématique → à générer comme les autres aquarelles.

## 3. Album de Cécile et photos (version locale)
- [x] Légendes absentes sous les vignettes vidéo (cecile-10, 17, 18).
- [x] Légende sous la photo ouverte trop près du bord bas (~40 px).
- [ ] Valider les 28 légendes (`prive/cecile/choix.json`) ; n° 2 et 6 déjà corrigés.
- [x] Documenter `legende`, `date`, la parallaxe et `dates-photos.json` dans `prive/cecile/LISEZMOI.md`.
- [ ] Brancher les dates des invités dès qu'elles sont connues (section 1).

## 4. Performance
- [ ] Horloge commune : la flamme (15 Hz) et les lueurs (7,5 Hz) changent à des instants différents → ~33 images
      composées par seconde. Les caler sur une même horloge à ~12 Hz (environ 12 images/s), sans perte visible.
- [ ] iPhone : pas de profil léger (Thomas veut garder les animations) ; plafonner le dpr à 2 sur les écrans 3×,
      et surveiller la mémoire de Safari (tuiles ×4 décodées), qui pose plus de risque que la bande passante.
- [x] Repos sur une recette : GPU 71 % → 8,5 % (lumière en paliers compositeur, flamme en sprites, Magie endormie).
- [x] Doubles de l'album avec vidéos (`#cecile-3`) : encore ~40 % de GPU, à cause d'une boucle de ~68 rAF/s
      (lumière / `redessins`) qui tourne en plus des vidéos → trouver avec `verification/perf/sonder.mjs`.
- [ ] Tester sur le **vrai iPad** (Safari + Web Inspector) : fluidité, lecture automatique des vidéos (mode économie d'énergie).
- [ ] iPhone paysage : hauteur d'x 1 % sous le seuil → viser ~5 % de marge.

## 5. Mise en page
- [x] Recuire `--only emeline,marie,coralie,suzanne,lily,margot-chapuzy` (illustrations recentrées, aquarelle de Lily, mention de Margot).
- [x] Zones d'aquarelle trop basses : Antoine, Anatole, Lise, Alba, Laura (même correction que les variantes).
- [x] Lily droite : l'étape 8 s'écrit en colonne étroite.
- [x] Margot gauche : signature en double (« … Margot » + « Margot & Flo ») ; seulement 2 ingrédients à gauche.
- [ ] Papiers f35 à f65 absents de `papiers.json` (repli sur f21) depuis le décalage des folios : à vérifier à l'œil.

## 6. Relecture automatique (OCR)
- [x] Décision de Thomas (22/10) : plus de relecture à chaque cuisson, trop lourde. Faite : `--mode complet` ne relit plus
      (`--relire` pour l'ajouter après la cuisson), `npm run pages:relire [-- --only coralie,lise]` relit les pages déjà
      cuites sans les recuire → `verification/out/relecture.md` (nombres et quantités en tête) ; un mot douteux ne donne
      plus jamais un code de sortie ≠ 0. Cache intact : `scripts/pages/relecture.py` est hors empreinte, l'empreinte du moteur
      ignore commentaires et docstrings, `scripts/pages/empreintes_equivalentes.json` garde valides les pages déjà cuites.
- [ ] 17 pages sur 80 sont périmées par rapport à leurs sources (cecile-2/3/4/5, biscuits-droite, crepes-gauche, fin-gauche,
      titre, et les gauches de lisa, julien, pierrette, shannen, lea, lisa-de-paris, elise, marine), indépendamment de ce
      chantier : `node scripts/bake-pages.mjs --mode complet --simuler` les liste ; à recuire avant de relire ces pages.
- [ ] Vrais cas à vérifier à l'œil : « 60g » (Coralie), « 1 » (Clémence, Laura, Léa).

## 7. Nouveautés demandées
- [x] **Scorpions cachés** : 8 scorpions dessinés à l'encre (`src/content/scorpions.json`, `src/components/Scorpions/`), fuite en zigzag avec une trace d'encre, compteur et carte finale.
- [ ] Texte de la carte finale des scorpions (message de Thomas) → `src/content/scorpions.json` › `message`.

## 8. Outillage
- [~] Scripts de vérification périmés (adaptés : flamme et farine sautées ; `verify-*-v16`, `verify-devices` restent à faire) : `verify-lumiere*`, `verify-mobile`, `verify-luminosite-v10` (lisent `__gcFlamme`),
      `verify-loupe`, `verify-reglages`, `verify-aquarelle-mobile-artefacts` (`__gcFeu.figer`), `verify-notes-v14/v15`,
      `verify-reset-v16` (farine), `verify-*-v16` (ignorent les encarts), `verify-devices` (`#julie`, `#rose`…).
- [ ] 10 tests unitaires en échec depuis longtemps (folios, sommaire, feuillets longs, fixtures julie).
- [ ] Paralléliser `bake-temps-encre.py` et `bake-magie.py`.
- [x] Supprimer `scripts/bake-pages-parallele.py` et mettre à jour `docs/reprise-v17.md`.
- [x] Nettoyer les vieilles tuiles ×4 (aucune orpheline : 320 tuiles = 80 pages) de `design-system/baked/pages/4x/`.
- [x] Ligne périmée à la ligne 56 du README de `SecretsDuCarnet` (farine supprimée).

## 9. Avant le jour J
- [ ] `git push origin claude/reprise-v18`.
- [ ] Recuisson complète puis `npm run build:site` (site public) et `npm run build:local` (TV/iPad).
- [ ] Répétition générale sur la TV et l'iPad depuis le Mac (`preview:local`, adresse réseau).
