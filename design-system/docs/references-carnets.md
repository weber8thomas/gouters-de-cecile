# Références : vrais carnets de recettes manuscrits

Livrable de l'agent N1 « Références », 16 octobre 2026. C'est la vérité terrain pour l'équipe qui génère l'écriture trait par trait et cuit l'encre dans le papier, et pour le moteur de mise en page.

- **Images de travail** (non versionnées, usage interne) : `verification/out/refs/NN-*.jpg` (30 pages, ≤ 2000 px) et la planche contact numérotée `verification/out/refs/planche.jpg`.
- **Papiers réutilisables** (domaine public, versionnables) : `design-system/sources/papier/*.jpg` et leurs `*.licence.md` (§ 7).

Toutes les mesures sont faites sur les images : couleurs = médianes de pixels (le papier sur ses 60 % de pixels les plus clairs, l'encre sur ses traits). Les proportions sont en % de la **page** (largeur ou hauteur), les millimètres seulement quand l'institution donne la taille physique. Elles sont reproductibles à ± 1 % (géométrie) et ± 4 niveaux sur 255 (couleurs). Elles sont moins fiables pour :

- les **photos d'objets** (n° 20 à 24 et 28) : dominante grise de l'éclairage ;
- les pages d'Aveize (n° 01 à 04) : le PDF d'origine a blanchi le papier.

On peut lire leurs dispositions, pas leurs couleurs absolues.

---

## 0. Ce qu'il faut retenir (en 12 lignes)

1. **Le papier n'est jamais blanc ni « crème uniforme »** : la médiane du corpus est `#eee1bf`, ce qui est plus jaune que notre `gc-paper` (`#f4ebda`). Les bords sont plus sombres de 3 à 10 niveaux et les papiers de bois du XXe s. roussissent jusqu'à `#c79b6c`.
2. **L'encre prend la couleur du papier** : un trait fin n'est pas « l'encre » mais un mélange encre-papier de 35 à 60 %. Le crayon est **clair** (`#8d836a` au cœur, et non `#46423e`).
3. **La page est pleine et déborde à droite** : marge droite de 0 à 3 %. Les mots se tassent en fin de ligne. 44 % des pages commencent ou finissent au milieu d'une recette.
4. **Plusieurs recettes par page** (64 %), enchaînées sans blanc, parfois séparées par un **filet court centré**.
5. **Les titres ne sont pas « en haut à gauche, en gros »** : ils sont 1,1 à 1,4 fois plus grands que le corps. Ils sont centrés de travers (32 %), décalés vers la gauche (28 %) ou au fer à gauche (32 %), et soulignés dans 40 % des cas.
6. **Les ingrédients sont dans le texte** dans 54 % des pages (75 % avant 1920). Les listes en colonne, ou en deux colonnes séparées d'un trait, apparaissent surtout après 1930.
7. **La préparation n'est jamais numérotée** : 1 page sur 25, une fiche imprimée de la fin du XXe s. C'est un paragraphe continu.
8. **Les ajouts d'une autre encre ou d'une autre main sont la norme** (40 %), comme les sources entre parenthèses (« (Bridget) fine », 32 %) et les ratures (40 %).
9. **Interligne** de 7,5 à 9 mm (3,4 à 4,2 % de la hauteur). La hauteur d'x vaut environ 30 % de l'interligne. Les dernières lignes d'une page pleine se **resserrent** de 15 à 40 %.
10. **Les lignes ne sont pas droites** : ± 0,4° de pente, jusqu'à ± 1,5°. La marge gauche flotte de ± 1 % et l'alinéa, quand il existe, fait 3 à 7 %.
11. Les **taches touchent parfois le texte** (n° 10 et 16), à rebours de la règle actuelle du contrat (§ 6). La **transparence du verso** est visible sur une page sur quatre.
12. Le meilleur papier ouvert trouvé est un **feuillet blanc d'un carnet de recettes du XVIIIe s.** (Wellcome MS.4489, Public Domain Mark, 3383 × 5283 px), recommandé pour le carnet (§ 7).

---

## 1. Le corpus (30 références)

Recherche faite le 16 octobre 2026 sur Europeana (API), Finna (API), DigitaltMuseum (API), Wellcome Collection (API et IIIF), Library of Congress (API et IIIF), Internet Archive, Wikimedia Commons, Biblioteka Jagiellońska et kimnet.ch. Le n° est celui de la planche `verification/out/refs/planche.jpg` et du fichier `verification/out/refs/NN-*.jpg`.

| N° | Fichier | Objet | Date | Institution | Licence exacte | Ce qu'elle montre |
|---|---|---|---|---|---|---|
| 01 | `01-aveize-p15-violet.jpg` | Cahier de recettes de cuisine (Aveize, Rhône), p. 15 : fin d'un gâteau, « Fare (flan breton) », « Merveilles » | après 1907, probablement 1910-1950 (cahier souvenir « Classe 1903 – Campagnes de Tunisie 1905-1907 » réutilisé) | Archives du Rhône et de la métropole de Lyon, fonds communal d'Aveize EDEPOT14, via Wikimedia Commons | Public Domain Mark 1.0 (étiquette Commons, contestable pour un texte du XXe s. : rester en usage interne) | **La page française type** : encre violette, cahier réglé à marge rouge à 17 %, titres centrés sous un filet, ingrédients dans le texte puis en deux colonnes séparées d'une barre verticale, recette qui continue |
| 02 | `02-aveize-p40-deux-encres.jpg` | id., p. 40 : « Brioche instantanée » et « Brioche bordelaise » | id. | id. | id. | Deux recettes, **deux encres** (turquoise puis bleu-violet), filets entre les recettes, 25 % de blanc en bas, rousseurs aux bords |
| 03 | `03-aveize-p3-crayon.jpg` | id., p. 3 : « Gâteaux », « Gâteau alsacien » | id. | id. | id. | **Au crayon**, rubrique centrée, titre au fer à gauche terminé par « – », surcharges |
| 04 | `04-aveize-p10-comptes-barres.jpg` | id., p. 10 : comptes de ménage barrés d'une grande croix | id. | id. | id. | Le carnet sert aussi à autre chose : colonnes de chiffres barrées |
| 05 | `05-legrand-1920-seyes.jpg` | « Cahier de devoirs du jour » de Suzanne Legrand (FRAD087_063) | 1919-1920 | Europeana 1914-1918 (collecte des AD de la Haute-Vienne) | CC BY-SA 3.0 | **Seyès 8 mm** à marge rouge, encre violette d'école, titres en ronde centrés, corrections du maître à l'encre rouge, transparence du verso |
| 06 | `06-krespin-1915-poesie.jpg` | Cahier de poésie de Renée Krespin, « La cigale et la fourmi » | 1915 | Europeana 1914-1918 | CC BY-SA 3.0 | Écriture **droite** (3°) et pâlie couleur sépia, titre entre deux filets, papier bruni aux bords, empreinte de pouce en bas à droite |
| 07 | `07-gastaud-1915-annotation.jpg` | Cahier d'écolière de Marie-Thérèse Gastaud, 8 ans | 1915-1916, note de la fin du XXe s. | Europeana 1914-1918 (AD Alpes-Maritimes) | CC BY-SA 3.0 | Seyès quadrillé, pâtés d'encre violette, **note ajoutée des décennies plus tard par sa fille**, en petites capitales à la bille noire dans la marge |
| 08 | `08-recueil-cuisine-office-soupes.jpg` | « Recueil de recettes pour la cuisine et l'office », p. 5 : « Soupes de différentes façons » | [1750-1875] | Biblioteka Jagiellońska, Cracovie (Berol. Ms. Gall. Qu. 146) | Domaine public (« Domena publiczna » dans les métadonnées JBC ; Public Domain Mark sur Europeana) | Manuscrit **français** : titres des recettes **dans la marge gauche**, corps en paragraphe plein, petits filets centrés entre recettes, ratures, folio d'une autre encre |
| 09 | `09-holmes-1866-soups.jpg` | « Receipts for French cooking », Amelia Jackson Holmes, « Lobster Soup (Bridget) fine » | 1866 et ajouts | Library of Congress, Rare Book & Special Collections (TX719 .H56 1866) | Domaine public (autrice morte en 1888 ; LoC : « not aware of any U.S. copyright or any other restrictions ») | Rubrique centrée, titre au fer **souligné mot à mot**, source entre parenthèses et appréciation « fine », **ratures et insertions ‸**, filet de fin, 29 % de blanc, transparence |
| 10 | `10-holmes-1866-desserts-serres.jpg` | id., « Desserts » : trois sorbets | 1866 et après | id. | id. | 3 recettes, trois lignes barrées, encre plus claire pour la dernière, **page qui se resserre en bas** (interligne de 4,3 % à 2,6 %), goutte brune sur le titre |
| 11 | `11-holmes-1866-page-courte.jpg` | id., « Meats » : « Pilaf (C. Dabney) » | id. | id. | id. | Recette courte : le corps commence à **45 %** de la ligne sous le titre, 60 % de blanc, tache grasse, transparence nette |
| 12 | `12-wellcome-ms4489-filets.jpg` | Recipe book MS.4489, image IIIF n° 9 | fin XVIIIe s. | Wellcome Collection (MS.4489) | Public Domain Mark 1.0 | Sept recettes courtes séparées par des **filets pleine largeur**, titres posés sur le filet, tirets de remplissage en fin de ligne |
| 13 | `13-loviisa-kinuski-entete.jpg` | « Tschinuschki-kaka » sur papier à en-tête, plié en quatre (LM-14731-11) | vers 1900-1915 | Loviisan kaupunginmuseo (Finlande), via Finna | CC BY 4.0 (la fiche Finna précise « luovutettu vapaaseen käyttöön (Public Domain) », mention de la source demandée) | « Ingrédients : 6 œufs, ½ livre… » **en ligne**, alinéas, papier réglé pâle ignoré, plis, en-tête imprimé (une marque de 1900 : référence seulement) |
| 14 | `14-loviisa-deux-recettes.jpg` | « Mandelbröd » et « Citronkakor » (LM-14731-10, 13,5 × 21,5 cm) | vers 1900-1915 | id. | id. | **Deux recettes** : la 1re en paragraphe, la 2e en liste avec fractions empilées ; papier froissé, taches jaunes en bas à gauche, coin déchiré |
| 15 | `15-loviisa-feuillet-use.jpg` | Feuillet d'un cahier sans couverture (LM-14731-4, 17,8 × 21,9 cm) | vers 1900-1915 | id. | id. | Écrit **une ligne sur deux**, 3 recettes dont la 3e n'a que son **titre en bas de page**, petite signature « Vivi R… », bord déchiré, bande de reliure bleue |
| 16 | `16-loviisa-taches-ajout.jpg` | Petit cahier de 4 pages (LM-14731-1) | vers 1900-1915 | id. | id. | La 3e recette est d'une **plume plus noire**, soulignée et signée « (K. Öhman) » ; **taches brunes sur le texte** |
| 17 | `17-loviisa-bande-dechiree.jpg` | « Pepparkakor », bande de papier (LM-14731-3, 22 × 10,6 cm) | vers 1900-1915 | id. | id. | Fiche déchirée, titre à paraphe, ingrédients en ligne, **note au crayon d'une autre main**, traits de crayon rouge |
| 18 | `18-loviisa-crayon-quadrille.jpg` | « Berliner bröd » et « Mörkakor » (LM-14731-9) | vers 1900-1920 | id. | id. | **Crayon** sur papier **quadrillé** 5 mm, ingrédients en **deux colonnes**, insertion au-dessus de la ligne avec ‸ |
| 19 | `19-kochrezepte-1916-registre.jpg` | « Kochrezepte », carnet-registre | 1916 | Europeana 1914-1918 (contribution n° 785, Allemagne) | CC BY-SA 3.0 | Écriture Kurrent **droite**, colonnes rouges du registre ignorées, 3 recettes par page séparées d'un tiret centré, papier de bois très bruni |
| 20 | `20-kochheft-1940-accolades.jpg` | Cahier du cours de cuisine d'Alice Sigrist | 1940 | Museum Bürgerhaus Pratteln (Suisse), via kimnet.ch | CC BY-SA 4.0 | Style « école ménagère » : liste à gauche, **accolades** et action à droite (« = schaumig rühren »), séance datée et doublement soulignée, page de gauche à 70 % vide |
| 21 | `21-heden-carnet-dense.jpg` | Receptsamling de Nelly Hedén, double page | vers 1910 | Alingsås museum (Suède), AMA 2579, via DigitaltMuseum | Licence non précisée (consultation seulement) | Carnet réglé dense, titres soulignés d'un **trait plus long que le mot**, sous-titre « Beredning », coupures de mots en fin de ligne, recettes à cheval sur les pages, doigts sales |
| 22 | `22-heden-petit-mot-1910.jpg` | Billet glissé dans le carnet Hedén | 1910 | id. | id. | **Petit mot** : feuille pliée écrite en travers de la réglure, lieu, date et signature en bas à droite |
| 23 | `23-westerbo-coupures-gravures.jpg` | « Opskrifts-bok for Elisabeth Westerbø » | 1914-1931 | Stiftelsen Kvinnemuseet – Kongsvinger museum (Norvège), KMR.03746, via DigitaltMuseum | CC BY-SA 4.0 | **Coupures de journal et gravures collées** de biais, deux encres, recette en deux colonnes (ingrédients ǀ méthode) séparées d'un trait, « godt » souligné, source « (Mala Bjørn) » |
| 24 | `24-risum-1944-index.jpg` | Carnet à onglets A-Ø (école ménagère de Risum) et recettes volantes | 1944 et après | Sverresborg Trøndelag Folkemuseum (Norvège), FTT.59254, via DigitaltMuseum | Licence non précisée (consultation seulement) | Ingrédients **sans méthode**, guillemets de répétition « ″ », accolade, rendement « c. 40 stk. » à droite, crayon et bille, prospectus glissés |
| 25 | `25-bille-bleue-1963.jpg` | Receptbok de confiseur | 1963 (daté « 5.7.63 ») | Länsmuseet Gävleborg (Suède), XLM.46436, via DigitaltMuseum | CC BY-SA 4.0 | **Stylo bille bleu**, chiffres alignés à droite, date en bas à droite, forte transparence du verso, bloc réglé bleu |
| 26 | `26-schooner-1923-papier-brun.jpg` | Recipe Book from Schooner A. Ernest Mills : « Squash pie », « Cranberry pie » | 1923-1924 | Maine Maritime Museum, via Internet Archive (93.049) | Licence non précisée (consultation seulement) | Papier de bloc **très roussi** (`#c79b6c`), titres au fil du texte, croix « XX » au crayon (essayée), dernier mot centré, coins arrondis |
| 27 | `27-elliott-1959-scotch.jpg` | 1959 Elliott Recipe Book (Ruby Lane Elliott) | 1959 | Clatsop County Historical Society, via Internet Archive | Licence non précisée (consultation seulement) | Deux feuillets de bloc **scotchés** de travers dans un album (scotch jauni), bille bleu-violet, liste puis « – Method – », note finale |
| 28 | `28-fiches-cuisine-pedagogique.jpg` | Boîte de fiches-recettes d'une cuisine pédagogique (VA3187a) | 1re moitié du XXe s. | Suomen kansallismuseo / Museovirasto (Finlande), via Finna | CC BY 4.0 | **Fiches cartonnées** de 12 à 12,5 × 16 à 18 cm, de tons différents (blanc, crème, kraft), titre souligné, deux colonnes, coche ✓ |
| 29 | `29-fiche-cheese-soup-bavures.jpg` | « Favorite Recipe for: Cheese Soup » | fiche de la fin du XXe s., photo de 2006 | Brian Kelley (Flickr), via Wikimedia Commons | CC BY-SA 2.0 | Fiche imprimée, encre bleue **diluée par des gouttes d'eau** (halos), ajout « 1 carrot » d'une autre encre, la seule préparation numérotée, « Don't Boil » doublement souligné |
| 30 | `30-fiche-apple-cake-1950.jpg` | « Apple Cake (M Wittmann) », fiche 3 × 5 pouces recto-verso | vers 1950 | SJW / Jengod, boîte à recettes familiale (Michigan), via Wikimedia Commons | CC BY-SA 4.0 | Source à droite du titre, **accolades** « } sift together », la suite au verso ; le verso jauni en **cadre** (partie exposée à l'air) |

Liens (page source, puis image téléchargée) :

- 01-04 : https://commons.wikimedia.org/wiki/File:Cahier_de_recettes_de_cuisine.pdf · `https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Cahier_de_recettes_de_cuisine.pdf/page{15,40,3,10}-960px-Cahier_de_recettes_de_cuisine.pdf.jpg`
- 05 : https://www.europeana.eu/item/2020601/https___1914_1918_europeana_eu_contributions_10386 · `https://rhus-209.man.poznan.pl/fcgi-bin/iipsrv.fcgi?IIIF=11/5//2020601/https___1914_1918_europeana_eu_contributions_10386/10386.104171.original.tif/full/1600,/0/default.jpg`
- 06 : https://www.europeana.eu/item/2020601/https___1914_1918_europeana_eu_contributions_9432_attachments_88874 · `…/9432_attachments_88874/9432.88874.original_Page0000.tif/full/1600,/0/default.jpg` (même serveur IIIF)
- 07 : https://www.europeana.eu/item/2020601/https___1914_1918_europeana_eu_contributions_12351_attachments_126582 · `…/12351_attachments_126582/12351.126582.original.tif/full/1600,/0/default.jpg`
- 08 : https://jbc.bj.uj.edu.pl/dlibra/publication/edition/195134 · https://jbc.bj.uj.edu.pl/Content/195134/PDF/NDIGORP001042.pdf (page 5 du PDF, image extraite telle quelle)
- 09-11 : https://www.loc.gov/item/2025296150/ · `https://tile.loc.gov/image-services/iiif/public:rbc:2026holmes2025296150:{0020,0089,0041}/full/pct:50/0/default.jpg`
- 12 : https://wellcomecollection.org/works/v9rwh9fz · `https://iiif.wellcomecollection.org/image/b18424181_MS_4489_0009.JP2/full/1200,/0/default.jpg`
- 13-18 : `https://finna.fi/Record/loviisakm.<id>` · `https://finna.fi/Cover/Show?source=Solr&id=loviisakm.<id>&index=0&size=master`. Identifiants dans l'ordre 13, 14, 15, 16, 17, 18 : 4d6d567b-8c0a-4910-b7e8-2e5aab1a8787, 1c5aedda-ed54-42d1-8050-4657a55a8a4e, 723f84fb-289e-4669-a234-ce867e5b4d4d, e14d87e1-dbf0-4681-8d24-78fb181a3f49, a0ee90a9-6785-45a8-b602-2192b1f69b4a, a1c114e5-2b75-4806-8570-9a6de52fbca7.
- 19 : https://www.europeana.eu/item/2020601/https___1914_1918_europeana_eu_contributions_785 · `…/785/785.3146.original.tif/full/1600,/0/default.jpg`
- 20 : https://www.kimnet.ch/objects/0d776c87-51cf-4117-8f85-13f75f709395 · https://api.kimnet.ch/media/kimch/_previews_/0d776c87-51cf-4117-8f85-13f75f709395_002.jpg
- 21-22 : https://digitaltmuseum.org/0210214232836 · https://mm.dimu.org/image/019EGKCqRBFo4?dimension=2000x2000 et https://mm.dimu.org/image/019EGKCqRBFie?dimension=2000x2000
- 23 : https://digitaltmuseum.org/0210213958855 · https://mm.dimu.org/image/019EE6iyXeN9B?dimension=2000x2000
- 24 : https://digitaltmuseum.org/0210210636902 · https://mm.dimu.org/image/0138Ytw9SVJ6?dimension=2000x2000
- 25 : https://digitaltmuseum.org/0210214835535 · https://mm.dimu.org/image/019EGJiQYdMWX?dimension=2000x2000
- 26 : https://archive.org/details/93.049 · https://archive.org/download/93.049/page/n3_w1200.jpg
- 27 : https://archive.org/details/18.067.021.Elliot.Recipe.Book · https://archive.org/download/18.067.021.Elliot.Recipe.Book/page/n15_w1200.jpg
- 28 : https://finna.fi/Record/museovirasto.70622703-2C29-4F02-9E2C-7DA86326A100 · `https://finna.fi/Cover/Show?source=Solr&id=museovirasto.70622703-2C29-4F02-9E2C-7DA86326A100&index=1&size=master`
- 29 : https://commons.wikimedia.org/wiki/File:Cheese_Soup_Recipe.jpg · https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Cheese_Soup_Recipe.jpg/1280px-Cheese_Soup_Recipe.jpg
- 30 : https://commons.wikimedia.org/wiki/File:Apple_cake_recipe_card_-_Michigan_circa_1950.jpg · https://upload.wikimedia.org/wikipedia/commons/1/16/Apple_cake_recipe_card_-_Michigan_circa_1950.jpg (converti de Display P3 vers sRGB)

**Statut** : ces 30 images restent dans `verification/out/refs/`. Elles servent de référence privée et ne sont pas distribuées. Celles marquées « licence non précisée » ou CC BY-SA ne doivent **jamais** être copiées dans le dépôt ni décalquées. On en tire des **mesures et des règles**, pas des formes.

---

## 2. Le papier

### 2.1 Couleurs mesurées

Le « centre » est la médiane du carré central (40 % × 40 %), le « bord » celle de la bande extérieure (4 % du petit côté).

| N° | Papier | Centre | Bord | Remarque |
|---|---|---|---|---|
| 09 | vélin 1866 | `#eee4c7` | `#efe1bc` | la page la plus « propre » |
| 11 | id. | `#f1e9d0` | `#f2e5c2` | |
| 10 | id. | `#ebe3cb` | `#ecdcb6` | |
| 12 | vergé fin XVIIIe | `#e0d2b5` | `#decda6` | |
| 08 | vergé 1750-1875 | `#d6c8b3` | `#d1c0a7` | plus froid, légèrement rosé |
| 13 | papier à lettre vers 1900 | `#f1e1b5` | `#f4e4b9` | jaune clair |
| 14 | id. | `#e4d4b5` | `#e4d4b3` | |
| 15 | cahier vers 1900 | `#f0dfbc` | `#ead7b0` | |
| 16 | id. | `#dfcdac` | `#e1ceab` | |
| 17 | id. | `#ebd5b1` | `#ecd7b0` | |
| 18 | quadrillé | `#f5e8cd` | `#f5e4c3` | |
| 05 | cahier Seyès 1920 | `#f5e7d6` | `#eeddc2` | rose-crème |
| 06 | cahier 1915 | `#ecdcb8` | `#e8cfa1` | bords roussis |
| 19 | registre 1916, papier de bois | `#cbb291` | `#bb9c77` | très bruni (acide) |
| 26 | bloc 1923, papier de bois | `#c79e71` | `#c69764` | le plus brun |
| 27 | feuillets 1959 / page d'album | `#ddd0bf` / `#d0c0a3` | | |
| 25 | bloc 1963 | `#f8ebd6` | `#f2e1c6` | |
| 24 | carnet 1944 | `#f4e8da` | | |
| 30 | fiche vers 1950, recto | `#f9f1db` | `#f7e9d2` | |

- **Médiane du corpus** (17 scans fiables) : **`#eee1bf`**. Fourchette `#f9f1db` à `#c79b6c`.
  - La teinte est stable : jaune-orangé, avec un écart rouge-bleu de 30 à 90 (47 pour la médiane).
  - Seuls la luminosité et la saturation varient. Plus le papier est vieux et acide, plus il est sombre **et** saturé.
- **Comparaison avec nos tokens** :
  - `gc-paper` (`#f4ebda`, B = 218) est nettement moins jaune que le vrai papier (B ≈ 190).
  - `gc-paper-aged` (`#e8d8b8`) est proche de la médiane des vrais carnets, un peu plus sombre.
  - `gc-paper-foxed` (`#d9c29a`) correspond aux auréoles mesurées (`#d6be91`).
  - Proposition au lead : papier de base vers `#eee1bf`, bord vers `#e2cfa8`.
- **Bords** : plus sombres que le centre de 3 à 10 niveaux de luminance sur les carnets reliés. Ils montent à 15 à 25 niveaux sur les feuilles volantes et les papiers de bois (06, 19).
  - Le roussissement suit les bords exposés à l'air et forme un **cadre** (fiche 30 au verso, auréoles de l'image 61 du MS.4489, papier P3) plutôt qu'un dégradé radial régulier.

### 2.2 Grain, fibres, structure

Mesures sur les papiers vierges du § 7. Le grain est l'écart-type de la luminance après retrait du flou à 64 px. Les points sont les pixels plus sombres que leur voisinage de plus de 25 niveaux.

- **Vergé ancien** (MS.4489, 08) :
  - grain 3,7 à 6,1 niveaux, 0,07 à 0,4 % de points (fibres, poussières) ;
  - trame horizontale régulière d'environ 1,8 mm détectée par autocorrélation (vergeures).
  - Le vergé « respire » : des marbrures de basse fréquence de 16 à 27 niveaux d'amplitude sur la page.
- **Vélin du XIXe** (Holmes) : grain 2,4, très peu de points (0,03 %), marbrures de 18 niveaux.
- **Papier de bois du XXe** (06, 19, 26) : grain fin, mais **roussissement inégal par plages** et bords cassants.
- **Fibres visibles** : de petits traits clairs ou sombres de 0,5 à 2 mm, quelques-uns colorés (rouge, bleu) dans le vergé. Ils sont nombreux sur l'image 51 du MS.4489 (papier P1).

### 2.3 Transparence (le verso qui se devine)

Visible sur 8 références sur 30 (05, 06, 08, 09, 10, 11, 25, et les images 43 à 49 du MS.4489).

- **Écriture du verso, en miroir**. Contraste mesuré sur la page 11 : ΔL de 5 à 9 sur 255, soit 2 à 3,5 %. Couleur `#e7dfc7` sur papier `#f1e9cd`. Encre ferrogallique sur papier fin.
- Au stylo bille sur papier de bloc (25), le contraste monte à 15 à 30 niveaux. La bille marque aussi le papier en relief.
- Elle se voit surtout dans les **zones blanches** (bas de page, interlignes). On ne la remarque plus sous un texte dense.

### 2.4 Réglure

| Type | Réf. | Pas | Couleur sur le papier |
|---|---|---|---|
| Cahier d'écolier français, réglure simple et marge rouge | 01-03, 06 | 3,5-3,6 % de la hauteur (≈ 8 mm), marge rouge à **16-18 %** de la largeur | lignes bleu-gris très pâles (`#dedcda` à `#f8eaee`) ; marge saumon `#e9bc95` |
| **Seyès** (8 mm, 4 interlignes de 2 mm, carreaux verticaux) | 05, 07 | ligne forte tous les 3,6 % | violet passé `#e5ced7` ; marge rouge à 24 % de la largeur, `#ddbaa1` |
| Papier à lettre réglé | 13-16 | ≈ 7,3 mm ; écrit une ligne sur deux en 15 et 16 | quasi invisible `#f3ebcb` (ΔL ≈ 3) |
| Quadrillé 5 mm | 18 | 2,3 % | `#e2e1cf` |
| Registre à colonnes | 19 | lignes bleues et colonnes rouges | rouge `#c58b71` |
| Bloc et fiche (XXe s.) | 25-27, 30 | 4,1 % | bleu-gris `#e2e1d3` ; marge ou ligne d'en-tête rouge `#c88a64` à `#f3d3c2` |
| Vélin avec réglure fantôme | papier n° 4 du § 7 | 7,3 mm | ΔL 2 à 4 |
| Uni | 08, 09-11, 12, 17 | | |

- La réglure ne garde **jamais son bleu franc** : elle tire au gris-mauve pâle, à 5 à 20 niveaux sous le papier.
- La marge rouge vire au **saumon ou au brique**.
- L'écriture **suit** la réglure à ± 0,3 hauteur d'x sur les cahiers d'école.
  - Elle l'**ignore** souvent sur le papier à lettre (13), le registre (19) ou les colonnes (19 et 20).

### 2.5 Usure, accidents, collages

- **Plis** :
  - feuille pliée en quatre (13) : un pli vertical à 50 %, un horizontal vers 60 % ;
  - papier froissé, avec un réseau de plis diagonaux (14) ;
  - pli central d'un billet (22).
  - Le pli est une ligne claire et une ligne sombre côte à côte, chacune de 1 à 3 px, de 5 à 15 niveaux.
- **Coins et bords** :
  - coins arrondis par l'usage (26, 25) ;
  - coin déchiré (14, en haut à droite) ;
  - bord bas en lambeaux et bord droit effrité (15) ;
  - bande déchirée en biais (17) ;
  - trou d'encre ou de ver (15, en haut).
- **Taches** (couleurs mesurées) :
  - café ou graisse **sur le texte** : cœur `#a87f45`, halo `#d3ba8e` (16) ;
  - goutte sur un titre : `#a58662` (10) ;
  - tache grasse claire et translucide (11) : l'auréole est plus claire que le papier ;
  - taches jaunes de bord : `#dbc399` (14).
  - Couverture : 0,4 à 2 % de la page (hors brunissement des bords).
- **Rousseurs** :
  - petits points de 0,5 à 2 mm, `#d1bc91` à `#c9b186` (sur papier `#e8d8bb`) ;
  - sur le cahier d'Aveize, alignés le long des bords et du bas : 10 à 40 par page ;
  - sur le MS.4489, une dizaine éparse ;
  - quelques rousseurs « en étoile » avec un cœur foncé (MS.4489 image 55, papier P2).
- **Auréoles d'humidité** : larges plages `#d6be91` le long d'un bord, limite plus foncée et nette (MS.4489 image 61, papier P3).
- **Traces de doigts** : empreinte de pouce (06, en bas à droite) ; frottis gris de mine de plomb ou de doigts sales sur un carnet très utilisé (21).
- **Scotch** : bandes de 1,5 à 2,5 cm posées en biais (± 10 à 30°) aux coins (27). Couleur `#d2bb93`, plus foncée sur ses bords, la colle a jauni. Elles débordent sur la page d'album `#d0c0a3`.
- **Collages** (23, et une autre page du même album Elliott que 27, l'image n25 de l'Internet Archive) :
  - coupures de journal découpées aux ciseaux, bords pas tout à fait droits ;
  - gravures découpées au contour, posées de biais (− 4° à + 6°) ;
  - tons de papier journal très différents entre eux (crème, tan, un bleu) ;
  - feuillets volants glissés dans le carnet (22, 24 ; un autre carnet du Judiska museet, JUD01279, en contient une liasse : crayon, carbone dactylographié, papiers de tons différents).

---

## 3. La disposition

### 3.1 Relevé page par page (25 pages de recettes)

Pages retenues : 01-03, 08-21, 23-30. On exclut 04 (comptes), 05-07 (cahiers d'école) et 22 (billet).

| N° | Titre | Souligné ou filet | Ingrédients | Préparation | Recettes sur la page | Déborde | Ajout d'une autre encre ou main | Ratures | Source ou appréciation |
|---|---|---|---|---|---|---|---|---|---|
| 01 | centré (−4 %) | filet avant | texte, puis 2 col. | § | 3 | oui (avant et après) | – | oui | – |
| 02 | centré (−8 %) | filets entre | texte | § | 2 | – | **oui** (2 encres) | légères | – |
| 03 | au fer (rubrique centrée) | – | texte | § | 2 | oui | – | surcharges | – |
| 08 | dans la marge | filets courts | texte | § | 3 | oui | – | oui | « + » en marge |
| 09 | au fer | mot à mot | texte | § | 1 | – | insertions | **oui** | (Bridget) fine |
| 10 | au fer | oui | texte | § | 3 | oui | **oui** | **oui** | (Eliza Boyle) fine |
| 11 | au fer | oui | texte | § | 1 | – | – | – | (C. Dabney) |
| 12 | centré sur filet | filets pleine largeur | (sans objet) | 1-3 lignes | 7 | – | – | 1 | – |
| 13 | décalé à gauche | – | texte (« Ingredienser: ») | 2 § avec alinéa | 1 | – | – | – | – |
| 14 | décalé à gauche | oui | texte, puis liste 1 col. | § puis 2 lignes | 2 | – | – | – | – |
| 15 | décalé à gauche | – | texte | § | 3 | oui (titre orphelin) | – | – | « Vivi R. » |
| 16 | centré | la 3e | texte | § | 3 | oui | **oui** | – | (K. Öhman) |
| 17 | décalé, paraphe | – | texte | § | 1 | – | **oui** (crayon) | – | – |
| 18 | centré | oui | 2 col. | § | 2 | oui | – | insertion ‸ | – |
| 19 | centré | tiret court entre | texte | § | 3 | oui | – | – | – |
| 20 | au fer | oui (et date doublement soulignée) | liste et accolades | actions à droite | 1-2 | – | – | – | « für 4 Personen » |
| 21 | au fer | trait long | 2 col. | § « Beredning » | 3 | oui (des 2 côtés) | – | – | – |
| 23 | centré | oui | 2 col. (ingr. ǀ méthode) | à droite | 2 et coupures | oui | **oui** | oui | (Mala Bjørn), « godt » |
| 24 | décalé à gauche | – | liste et « ″ » | absente | 2 | – | **oui** | – | « T.V. (Gole.) » |
| 25 | décalé à gauche | – | liste (chiffres à droite) | absente | 1 | – | – | – | date « 5.7.63 » |
| 26 | au fil du texte | – | texte | § | 2 | – | **oui** (XX au crayon) | – | XX |
| 27 | au fer | – | liste 1 col. | § après « – Method – » | 2 | – | **oui** (stylo changé) | oui | – |
| 28 | centré | oui | 2 col. | § | 1 par fiche | – | **oui** (✓) | – | ✓ |
| 29 | imprimé | emphase | liste et accolade | **numérotée** | 1 | – | **oui** | oui | « Don't Boil » |
| 30 | décalé à gauche, source à droite | – | liste et accolades | § | 1 (recto puis verso) | oui | – | – | (M Wittmann) |

Totaux :

- **Titre** :
  - centré 32 % (8/25), mais jamais au centre exact : 3 à 12 % à gauche du centre du bloc ;
  - décalé à gauche, avec un début à 20-30 % de la largeur : 28 % ;
  - au fer à gauche : 32 % ;
  - dans la marge : 4 % ; imprimé : 4 %.
- **Soulignement** :
  - titre souligné : 40 %, d'un trait, mot à mot ou d'un trait plus long que le mot ;
  - filets séparateurs : 24 %.
- **Ingrédients** (24 pages) : dans le texte 54 %, liste en 1 colonne 25 %, 2 colonnes ou accolades 17 %, mixte 4 %.
  - Avant 1920 : 75 % dans le texte. Après 1930 : 100 % en liste.
- **Préparation** : en paragraphe dans 88 % des cas, absente dans 8 %, **numérotée dans 4 %** (1 cas).
- **Recettes par page** : 2 ou plus dans 64 % des pages (jusqu'à 7 recettes courtes).
- **Débordement** : 44 % des pages commencent ou finissent au milieu d'une recette.
- **Annotations** :
  - ajouts d'une autre encre ou d'une autre main : 40 % ;
  - ratures et surcharges : 40 % ;
  - source nommée : 32 % ;
  - appréciation (« fine », XX, ✓, souligné double) : 24 % ;
  - date sur une page de recette : 8 %.
- **Blanc** : 24 % des pages gardent 25 % ou plus de blanc en bas. Les autres vont jusqu'au bord.

### 3.2 Marges réelles (en % de la page)

- **Gauche** :
  - papier d'écolier : **la marge imprimée**, 16 à 18 % (01-03, 06), 24 % (05). Le texte démarre de 0,5 à 2 % à droite du filet rouge. Il l'enjambe parfois : une ligne de 05 commence 1 % avant ;
  - papier uni ou réglé sans marge : 1 à 3 % (09-11, 26, 15) ;
  - feuilles à lettre : 8 à 13 % (13, 14) ;
  - manuscrit ancien : colonne de 14 % pour les titres, puis corps à 16 % (08).
- **Droite** : 0 à 3 % partout.
  - On écrit **jusqu'au bord**. Le dernier mot se **tasse** (approche réduite, lettres plus étroites) ou monte au-dessus de la ligne (« allongée » en 01).
  - Il est parfois coupé par un trait d'union (21, et 14 « blan-das ») ou déborde du papier (13 « blandningen »).
- **Haut** : 6 à 12 % avant la première ligne de texte. Il descend à 35 % sous un en-tête imprimé (13).
- **Bas** : 0 à 5 % quand la page est pleine. Sinon blanc libre : 25 à 60 % dans un quart des pages.

### 3.3 Interlignage et densité

| Réf. | Pas en % de la hauteur | Pas en mm | Lignes de texte quand la page est pleine |
|---|---|---|---|
| Aveize (01-03) | 3,5-3,6 | ≈ 8 (réglure) | ≈ 25 |
| Holmes (09-11) | 3,4-3,65 | 7,8-8 | 26 |
| MS.4489 (12) | 3,3 | 6,1 | ≈ 24 |
| Recueil (08) | 4,1 | | 21 |
| Loviisa lettre (13) | 3,75 | 10,6 | 13 sous l'en-tête |
| Loviisa (14, 18) | 4,0-4,1 | 8,6-8,8 | 18-21 |
| Loviisa, une ligne sur deux (15, 16) | 6,7-6,8 | 14,8 | 12-13 |
| Kochrezepte (19) | 4,7 | | 19 |
| Hedén (21) | 4,2 | | 21 |
| Schooner (26) | 4,25 | | 20 |
| Elliott (27) | 3,7 | | 22 par feuillet |

- **Pas typique : 3,4 à 4,2 % de la hauteur de page (7,5 à 9 mm)**. Les pages aérées montent à 6,8 % (écriture une ligne sur deux).
- Variation d'une ligne à l'autre : ± 6 % sur papier uni, ± 2 % sur papier réglé.
- **Resserrement de fin de page** : sur 10, le pas passe de 4,3 % à 2,6 % sur les 6 dernières lignes, et l'écriture rapetisse d'environ 15 %. On le voit aussi sur 01, 08 et 21.
- Encre sur la page : 2 à 15 % des pixels (page pleine à la plume : 10 à 15 % ; crayon ou page aérée : 2 à 4 %).

### 3.4 Pente des lignes et dérive

Mesure par régression sur chaque ligne détectée ; une valeur positive descend vers la droite.

- **Pente** :
  - médiane par page entre − 0,55° et + 0,55° (en général sur papier uni, la page entière « tombe » ou « monte » légèrement) ;
  - écart-type à l'intérieur d'une page de 0,1° (réglé) à 0,65° (uni) ;
  - extrêmes : − 1,5° à + 1,7° (14, 15, 18).
- **Début de ligne** :
  - dérive de la marge gauche d'écart-type 0,6 à 1 % de la largeur ;
  - **alinéa** de 3 à 7 % dans environ 30 % des paragraphes (13, 14, 15) ;
  - dernière ligne courte parfois centrée (26 « slowly. », 14) ;
  - corps commencé à 40-55 % de la largeur quand il suit le titre sans retour (11).

### 3.5 Titres, rubriques, séparateurs

- **Rubrique de chapitre** (« Soups. », « Desserts », « Gâteaux ») : centrée à ± 6 % du milieu de page, à 6-8 % du haut, un peu plus petite ou de même taille que les titres. Elle ne figure que sur la première page du chapitre.
- **Titre de recette** : 1,1 à 1,4 fois la hauteur du corps.
  - Il est souvent d'une **écriture plus posée** (ronde en 05, paraphe en 17) et ponctué : « Gâteau alsacien. – », « Mandelbröd. ».
- **Soulignement** :
  - un trait légèrement courbe, de 100 à 130 % de la longueur du mot (21 : trait jusqu'à 60 % de la largeur) ;
  - ou un trait par mot (09) ;
  - doublé pour l'emphase (20, 29).
- **Filets séparateurs** :
  - 10 à 45 % de la largeur, centrés sur le bloc, posés avant le titre (01) ou après la fin de la recette (02, 09) ;
  - pleine largeur dans les recueils anciens (12) ;
  - parfois un simple tiret « — » centré (19).
- **Espace** : 0 à 1 ligne blanche entre la fin d'une recette et le titre suivant (14 : aucune). Un titre isolé tout en bas, dont la recette continue au verso, est courant (15).

### 3.6 Ingrédients et quantités

- **Dans le texte** : « Mélanger 250 grs de farine, 100 grs de beurre, 3 œufs, 2 cuillerées de sucre en poudre… ». Les quantités sont collées au nom, séparées par des virgules, sans retour à la ligne.
- **Liste en colonne** :
  - quantités alignées à gauche (pas de puces) ;
  - le nom commence à 6-10 % du bord du bloc ;
  - « dito », « id. » ou guillemets « ″ » pour répéter l'unité (14, 24).
- **Deux colonnes** :
  - séparées d'un trait vertical à main levée (01, 23) ou simplement juxtaposées (18, 28) ;
  - en 01, colonne gauche 18-52 %, barre à 54 %, colonne droite 61-92 %.
- **Accolade et action** : « 1½ c. flour / 1 T. baking powder } sift together » (20, 29, 30). L'accolade fait 2 à 4 lignes de haut.
- **Abréviations et symboles** : « grs », « c. à s. », « ℔ », « T. », « tsp. », « st. », « °C » rare ; fractions **empilées** (½ ¼ ⅔ écrits avec une barre horizontale) dans 70 % des cas, sinon « 1/2 ».

### 3.7 Préparation

- Paragraphe continu, à l'infinitif ou à l'impératif (« Mélangez », « Battre », « Mettez »), phrases courtes séparées par des points.
- Les étapes ne sont pas numérotées (une seule fiche imprimée moderne numérote).
- Une **note finale** isolée et soulignée est fréquente : « Ne pas faire bouillir », « Coconut frosting », « Garnir de fruits confits dès qu'elle sort du four ».
- Les sous-titres (« Beredning », « – Method – », « Pour démouler : ») s'intercalent dans le paragraphe.

### 3.8 Ce qui s'ajoute plus tard

- **Autre encre ou autre outil** :
  - recette entière d'une autre plume (16) ;
  - deux recettes, deux encres (02, 23) ;
  - ajout au crayon par-dessus (17, 26 « XX ») ;
  - correction d'une encre différente (29 « 1 carrot ») ;
  - **note bien plus tardive** au stylo moderne dans la marge (07).
- **Ratures** : un trait horizontal simple sur le mot. Le mot de remplacement est écrit au-dessus, en plus petit (60-70 %), avec un ‸ en dessous (09, 18). Il arrive qu'on barre trois lignes entières puis qu'on recommence la recette juste après (10).
- **Sources** : « (Bridget) », « (Eliza Boyle) », « (K. Öhman) », « (M Wittmann) » entre parenthèses après le titre, ou en petit à droite à la fin (15 : « Vivi R. »).
- **Appréciations** : « fine », « bon », « XX », « ✓ », mot souligné deux fois.
- **Hors-sujet** : comptes de ménage (04), écrits puis barrés d'une grande croix.

---

## 4. L'écriture

### 4.1 Taille

Hauteur d'x estimée par la largeur à mi-hauteur du profil de chaque ligne, puis contrôlée à l'œil.

| Réf. | Hauteur d'x (% largeur de page) | En mm | Hauteur d'x / interligne |
|---|---|---|---|
| 01 Aveize | 1,5 | ≈ 2,6 | 0,33 |
| 02 Aveize | 1,8 | | 0,36 |
| 05 Seyès | 1,4 | ≈ 2,3 | 0,30 |
| 06 Krespin | 1,3 | | 0,28 |
| 08 Recueil | 1,45 | | 0,33 |
| 09-11 Holmes | 1,6-2,0 | 3,0-3,7 | 0,38-0,46 |
| 12 MS.4489 | 2,0 | 2,5 | 0,39 |
| 13 Kinuski | 1,3 | 2,9 | 0,28 |
| 14 Mandelbröd | 1,7 | 2,3 | 0,27 |
| 15-16 Loviisa | 1,3-1,4 | 2,3-2,5 | 0,15-0,16 (une ligne sur deux) |
| 18 crayon | 1,8 | 2,5 | 0,28 |
| 19 Kurrent | (photo) | | 0,45 |
| 26 Schooner | 2,1 | | 0,30 |
| 27 Elliott | 2,9 (du feuillet) | | 0,41 |

- **Hauteur d'x : 1,3 à 2,0 % de la largeur de page, soit 2,3 à 3,7 mm** à l'échelle réelle.
- **Rapport hauteur d'x / interligne : 0,27 à 0,46, médiane ≈ 0,33**, donc un interligne d'environ 3 hauteurs d'x. Les pages « une ligne sur deux » descendent à 0,15.
  - Les mains américaines de 1950-1960 à la bille (27, 30) sont grandes en valeur absolue (≈ 2,9 % de la largeur du feuillet) mais gardent ce rapport, car l'interligne du bloc est large.
- **Hampes et jambages** : 1,5 à 2,5 fois la hauteur d'x (boucles de l, f, g, j). Ils entrent souvent dans la ligne voisine sans la toucher sur papier réglé, et la touchent sur papier uni dense (09, 10).
- **Pour le projet** : à l'échelle d'un vrai carnet, une page A5 ferait tenir 22 à 26 lignes. À 3 m sur la TV, nos hauteurs d'x sont forcément plus grandes, donc il y aura moins de lignes (12 à 16). Ce qu'il faut garder, ce sont les **proportions** : interligne ≈ 2,5 à 3,5 × hauteur d'x (3 en médiane), et marge droite quasi nulle.

### 4.2 Pente des lettres

Mesure par cisaillement : l'angle qui rend les hampes verticales. Cette mesure surestime de 5 à 10° à cause des liaisons, donc les valeurs ci-dessous sont corrigées à l'œil.

- **Anglaise ou Spencer du XIXe** (09, 10, 12) : 35 à 40° depuis la verticale, la plus penchée.
- **Mains finnoises et françaises vers 1900-1940** (13-16, 01, 05) : 25 à 35°.
- **Mains plus modernes ou scolaires suédoises** (21, 02) : 15 à 20°.
- **Mains droites** : 06 (3°), Kurrent 19 (1 à 5°), titres en ronde (05).
- **Variation** : ± 3 à 5° à l'intérieur d'une page. Les majuscules et les boucles sont souvent plus penchées que les minuscules, et les chiffres plus droits.

### 4.3 Régularité, pression, épaisseur

- **Plume métallique et encre ferrogallique** (08-16) :
  - pleins (descendants) 2 à 3 fois plus épais que les déliés (montants) ;
  - dépôt plus foncé en fin de trait et dans les boucles ;
  - la plume rechargée donne des mots plus foncés suivis d'un pâlissement progressif sur 5 à 15 mots, à reproduire.
- **Encre violette d'école** (01, 05, 07) : peu de contraste plein / délié (plume plus large), tons irréguliers, **pâtés** violets (07).
- **Crayon** (03, 18, 24) : trait gris granuleux, sans plein ni délié, plus foncé dans les boucles appuyées. Il est **clair** (cœur `#8d836a` à `#a69b82`).
- **Stylo bille** (25, 27) :
  - trait d'épaisseur constante ;
  - petites **surépaisseurs** (« pâtés » de bille) et blancs de saut dans les courbes rapides ;
  - le stylo qui change en cours de texte se voit (27 : bleu plus soutenu à partir de « Chunk of Butter »).
- **Feutre ou plume et eau** (29) : halos bleus de 3 à 8 mm autour des traits mouillés. Le trait reste lisible.
- **Régularité** :
  - hauteur d'x variable de ± 10 % dans une ligne ;
  - mots plus petits et plus serrés en fin de ligne et en fin de page ;
  - espacement entre les mots de 0,6 à 1,5 hauteur d'x, très irrégulier.

### 4.4 Couleurs des encres sur le papier

Mesurées : « cœur » = 20 % des pixels de trait les plus sombres, « milieu » = médiane des traits, « fin » = traits fins et bords des traits, c'est-à-dire le mélange avec le papier.

| Encre | Réf. | Papier | Cœur | Milieu | Fin |
|---|---|---|---|---|---|
| Violette d'école | 01 | (blanchi) | `#50375c` | `#9d8b9c` | `#decfd8` |
| Violette d'école | 05 | `#f6e7d5` | `#674d5c` | `#988087` | `#d2bcbc` |
| Rouge du maître | 05 | `#f6e6d1` | `#7f5043` | `#a37b6d` | `#ddc2b5` |
| Turquoise | 02 | (blanchi) | `#538a82` | `#a6b8a8` | `#d1e0ce` |
| Ferrogallique noire-brune | 08 | `#d6c7b1` | `#352921` | `#65584b` | `#aea08b` |
| Ferrogallique brune | 09 | `#f0e5c6` | `#60533f` | `#887a60` | `#c8baa0` |
| Ferrogallique brune, plus claire | 10 (bas) | `#eadebf` | `#6d5e45` | `#928366` | `#c2b396` |
| Brune ancienne | 12 | `#e1d3b5` | `#755c40` | `#927a5a` | `#bda887` |
| Sépia pâlie | 06 | `#eddcb7` | `#857450` | `#a5936f` | `#cebc97` |
| Noire vers 1900 | 13 | `#f2e1b5` | `#070000` | `#1f1408` | `#beb190` |
| Noire brunie | 16 (haut) | `#e1cdab` | `#1d0b00` | `#5e492b` | `#b19e7f` |
| Kurrent sur papier bruni | 19 | `#cab08f` | `#65492f` | `#806147` | `#a98b6e` |
| Encre brune sur papier roussi | 26 | `#c79c6f` | `#63482c` | `#785737` | `#a88159` |
| Crayon | 18 | `#f5e6ca` | `#8d836a` | `#a99e85` | `#d7cbb1` |
| Crayon | 24 | `#ece1d4` | `#999085` | `#b6aca1` | `#d5c9bb` |
| Bille bleue 1963 | 25 | `#f8ebd4` | `#2e2e49` | `#797887` | `#cdccbe` |
| Bille bleu-violet 1959 | 27 | `#ded3c3` | `#5f545f` | `#847a81` | `#b7adab` |
| Feutre ou plume bleue | 29 | `#ffffff` | `#797ba0` | `#8f91b3` | `#c6cee2` |
| Halo de bavure | 29 | | | `#9fa1c0` | `#f1f3fc` |
| Plume bleu-gris pâlie | 30 | `#faf0d8` | `#7b7b82` | `#919198` | `#a9a8ab` |

Ce que cela implique pour la cuisson :

- Aucune encre ancienne n'est un noir neutre ou un bleu pur. Elles sont toutes **tirées vers le papier** :
  - noir → brun (ferrogallique) ;
  - violet → mauve gris ;
  - bleu → bleu-gris.
- Les traits fins prennent 40 à 60 % de la couleur du papier. **Un rendu par multiplication sur le papier, avec une opacité qui dépend de l'épaisseur du trait**, est plus juste qu'une couleur unie.
- Écart avec nos tokens :
  - `gc-ink-crayon` (`#46423e`) est bien plus foncé que le vrai crayon : viser `#8d836a` à `#a69b82` au cœur ;
  - `gc-ink-bic` (`#35446b`) est plausible, la vraie bille est plus sourde (`#2e2e49` à `#5f545f`) ;
  - `gc-ink-brune` (`#5b3920`) est un peu trop rouge-saturé face à la ferrogallique (`#60533f`, `#6d5e45`).

### 4.5 Liaisons, majuscules, chiffres

- **Cursive liée** partout, sauf les chiffres et souvent la lettre qui suit une majuscule. Les liaisons sont des déliés montants à environ 45°.
- **Majuscules** : 2 à 3 fois la hauteur d'x. Elles ont des boucles d'attaque (« M », « L ») et dépassent à gauche de la marge de 0,5 à 1 %.
- **Chiffres** :
  - droits, de la hauteur d'une majuscule réduite (1,3 à 1,6 hauteur d'x) ;
  - « 1 » avec attaque, « 7 » barré dans les mains continentales ;
  - fractions empilées ½ avec une barre horizontale courte.
- **Ponctuation** : point final suivi d'un tiret « . — » ou « – » pour remplir la fin de ligne (12, 03). Tiret de fin de titre.

---

## 5. Dix règles de composition (pour le moteur de mise en page)

Les valeurs sont en % de la page (L = largeur, H = hauteur). « Tirer » signifie tirer au sort avec une graine par page.

1. **Marges asymétriques, droite mangée**.
   - Marge gauche : papier d'écolier = filet de marge imprimé à 16-18 % L, texte à + 0,5 à 2 % du filet ; papier uni = 1 à 3 % L ; feuille volante = 6 à 12 % L.
   - Marge droite : 0 à 3 % L. Le dernier mot se tasse (approche − 10 à − 25 %, largeur − 5 à − 10 %) au lieu de passer à la ligne si ça tient. Sinon, une coupure avec trait d'union dans au plus 10 % des lignes.
   - Haut : 6 à 12 % H avant la première ligne. Bas : 0 à 5 % H si la page est pleine.
2. **Interligne d'environ 3 × hauteur d'x, qui se resserre en fin de page**.
   - Pas de base : 3,4 à 4,2 % H (ou 6,7 % H pour une page « une ligne sur deux »).
   - Variation par ligne : ± 6 % sur papier uni, ± 2 % sur papier réglé.
   - Si le texte ne tient pas, les 3 à 6 dernières lignes se resserrent jusqu'à − 30 % de pas et − 15 % de taille, **avant** tout débordement sur la page suivante.
3. **Lignes jamais horizontales**.
   - Biais de page tiré dans ± 0,5°, puis pente de chaque ligne = biais ± 0,4° (écart-type), bornée à ± 1,5°.
   - Sur papier réglé, la ligne de base reste à ± 0,3 hauteur d'x du filet et la pente sous 0,3°.
   - Pas de sinusoïde régulière : une marche aléatoire de la ligne de base, d'amplitude au plus 0,15 hauteur d'x, le long de la ligne.
4. **Marge gauche qui flotte**.
   - Début de chaque ligne = marge + bruit d'écart-type 0,8 % L (borné entre 0 et 3 %).
   - Alinéa de 3 à 7 % L sur la première ligne de 30 % des paragraphes.
   - La dernière ligne d'une recette peut être centrée si elle fait moins de 25 % L (probabilité 0,15).
   - Le corps peut commencer à 40-55 % L sur la ligne du titre si le titre est court (probabilité 0,1).
5. **Titres de travers, pas en haut à gauche**.
   - Position : centré sur le bloc avec un décalage de − 3 à − 12 % L (35 %), début à 20-30 % L (25 %), au fer à gauche (35 %), dans une colonne de marge (5 %).
   - Taille : 1,1 à 1,4 × le corps, même encre, écriture plus posée. Jamais en capitales.
   - Soulignement dans 40 % des cas : un trait de 100 à 130 % du titre, ou un trait par mot, légèrement arqué, épaisseur du corps. Double seulement pour l'emphase.
   - Ponctuation de fin (« . », « . – ») dans 50 % des cas. Source entre parenthèses ou appréciation après le titre dans 30 % des cas.
6. **Séparer par un filet court ou ne pas séparer**.
   - Entre deux recettes : rien, ou 0 à 1 ligne blanche (55 %) ; un filet centré de 10 à 45 % L avant le titre ou après la fin (35 %) ; un tiret « — » centré (10 %).
   - La rubrique de chapitre n'apparaît que sur la première page du chapitre, centrée à ± 6 %, à 6-8 % H.
7. **Ingrédients selon l'époque de la main**.
   - Main « ancienne » (avant 1920) : ingrédients dans le texte dans 75 % des cas, quantités collées au nom, séparés par des virgules.
   - Main « moderne » (après 1930) : liste. Une colonne, quantités alignées à gauche (60 %), ou deux colonnes avec une barre verticale tremblée, ou une accolade « } » suivie d'une action (40 %).
   - Jamais de puces. Fractions empilées (½) dans 70 % des cas. Guillemets de répétition « ″ » ou « id. » pour les unités répétées.
   - Pour notre budget de 8 ingrédients sur deux colonnes : barre verticale entre les colonnes, colonne droite qui commence 5 à 10 % L après la barre, pas d'alignement strict des lignes entre les deux colonnes (± 0,2 interligne).
8. **Préparation en paragraphe, pas en liste numérotée**.
   - Un seul paragraphe, ou deux avec alinéa. Phrases à l'impératif. Le texte coule jusqu'au bord droit.
   - Une note finale (« Ne pas faire bouillir. ») sur sa propre ligne, soulignée dans la moitié des cas.
   - Le budget de « 4 étapes » du README devrait devenir 4 **phrases** dans un même paragraphe, sans numéros (au plus « 1. » à « 4. » au fil du texte, dans 5 % des pages).
9. **Densité réelle : pages pleines, recettes qui s'enchaînent ou débordent**.
   - 2 recettes ou plus par page dans 2 cas sur 3 quand le contenu le permet. 44 % des pages finissent ou commencent au milieu d'une recette (y compris un titre orphelin en bas de page).
   - Une page sur quatre seulement garde 25 à 60 % de blanc en bas. C'est le cas de la page « courte » ; on n'y centre **pas** le texte verticalement.
   - Encre sur la page : 4 à 15 % des pixels.
10. **Ajouts tardifs et traces de main** (environ 40 % des pages).
    - Tirer 0 à 2 ajouts par page :
      - un mot réécrit au-dessus d'une rature (trait simple, mot à 60-70 % de la taille, ‸) ;
      - une ligne barrée ;
      - une source « (Prénom) » ;
      - une appréciation (« bon ! », « XX », ✓) ;
      - une note dans la marge ou en bas d'une **autre encre** (crayon, bille) et d'une autre pente (± 2 à 4°), à 75-90 % de la taille ;
      - pour les pages vidéo : le petit mot de l'invité joue ce rôle.
    - Les ajouts s'écrivent **par-dessus l'espace disponible** (interligne, marge, fin de ligne) sans décaler le texte d'origine.

**Réglages de matière associés** (pour la cuisson) :

- Papier de base tiré dans `#eee1bf` ± (ΔL 6, Δb 6), bords plus sombres de 4 à 10 niveaux.
- Transparence d'un texte en miroir à ΔL 2 à 3,5 % sur 1 page sur 4.
- Rousseurs : 0 à 40 points de 0,5 à 2 mm, concentrés près des bords.
- Au plus une tache par page (0,5 à 2 % de surface). Elle peut mordre sur 1 à 3 mots, ce qui va contre le contrat actuel : à arbitrer par le lead.
- Encre rendue par multiplication, mélange encre / papier de 40 à 60 % pour les traits fins, cœur foncé dans les pleins.

---

## 6. Cinq gabarits de pages typiques

Les schémas sont dessinés pour une page portrait de proportion A5 (L = 100, H = 141). Les cotes sont en % de L ou de H. `~~~` = ligne d'écriture, `═══` = soulignement, `───` = filet, `ǀ` = barre tracée à la main.

### Gabarit A : recette et petit mot

Inspiré de 09, 15, 22 et 30. La recette occupe le haut, le mot est ajouté plus tard, d'une autre encre.

```
 0 ┌────────────────────────────────────────────────┐
 7 │                 Goûters                        │ rubrique facultative, centre à 44-50 % L
10 │ Le cake citron de Julie.  (essayé, bon !)      │ titre au fer à 2-4 % L ; mots soulignés
   │ ══ ════ ══════ ══ ═════                        │ un à un ; appréciation après, autre encre
16 │ Bats 3 œufs avec 150 g de sucre, ajoute le     │ corps à 2-3 % L, va jusqu'à 98-100 % L
   │ zeste d'un citron, 1 yaourt, 200 g de farine   │ ingrédients dans le texte
   │ et ½ sachet de levure. Verse dans le moule ~~~~│ pas 3,6 % H, 10-14 lignes
   │ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│
58 │ ~~~~~~~~~~~ Ne pas trop cuire.                 │ note finale soulignée (50 %)
62 │                 ─────────                      │ filet de fin 20-30 % L, centre à 45 % L
   │                                                │ 6-12 % H de blanc
72 │      Fais-le la veille, il est encore          │ PETIT MOT : autre encre, 80-90 % de la taille,
   │      meilleur le lendemain.                    │ retrait 12-25 % L, pente propre −3°…+3°,
82 │                                   Julie        │ signature à 55-90 % L, plus penchée (+5°)
   │                                                │ 10-15 % H de blanc en bas
95 │                                          14    │ folio au crayon, petit, à 90 % L
   └────────────────────────────────────────────────┘
```

Variante, inspirée de 22 : le mot est sur un **billet glissé**. C'est un papier différent (ΔL ± 10, ton plus blanc ou plus jaune), posé de biais (− 8 à + 8°), qui dépasse de 3 à 10 % du bord de page, réglé dans l'autre sens et plié en deux (pli à 50 %).

### Gabarit B : deux courtes recettes

Inspiré de 14, 02 et 16. Les recettes s'enchaînent, la seconde est parfois d'une autre encre.

```
 0 ┌────────────────────────────────────────────────┐
 8 │        Les sablés de Léa.                      │ titre 1 : début à 20-26 % L, souligné
   │        ══════════════════                      │ (trait 100-120 %)
14 │   Mélange 250 g de farine, 125 g de beurre     │ alinéa 4-7 % L à la 1re ligne
   │ mou, 1 œuf et 100 g de sucre ; ajoute ~~~~~~~~~│ corps 2-8 % L → 100 % L
   │ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│ 5-8 lignes
44 │ ~~~~~~~~~~~~~~~~~~ Four à 180 °C. —            │ fin de ligne remplie d'un tiret
47 │           Les palets bretons.                  │ titre 2 : SANS ligne blanche (50 %) ou après
   │           ═══════════════════                  │ un filet court de 25-35 % L centré (50 %)
53 │ 2 jaunes d'œufs        ǀ   1 pincée de sel     │ liste 2 colonnes, barre à 50-55 % L,
   │ 80 g de sucre          ǀ   80 g de beurre      │ colonne droite 6-10 % L après la barre,
   │ 120 g de farine        ǀ   ½ sachet de levure  │ lignes pas strictement alignées
68 │   Fouette les jaunes et le sucre, ~~~~~~~~~~~~~│ 2-4 lignes de préparation
   │ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~             │
78 │              ─────────                         │ filet de fin facultatif
   │                                                │ 15-25 % H de blanc en bas
   └────────────────────────────────────────────────┘
```

La seconde recette a une **autre encre** dans 1 cas sur 2 (turquoise puis violet en 02, noir puis noir plus dense en 16), avec une taille et une pente qui changent un peu (± 5 %, ± 3°).

### Gabarit C : page avec une illustration ou une photo collée

Inspiré de 23 et 27. Une image ou une coupure collée de biais entre dans la page, le texte s'organise autour.

```
 0 ┌────────────────────────────────────────────────┐
 4 │   ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲  ▨                 │ IMAGE COLLÉE : 40-55 % L, rotation −4…+6°,
   │  │   photo / gravure /      │                  │ en haut, décalée à gauche ou à droite ;
   │  │   aquarelle collée       │   Le gâteau de   │ coins scotchés (2-4 bandes ▨ de 4-7 % L,
   │  │                          │   l'anniversaire │ à ±10-30°, scotch jauni #d2bb93)
26 │   ╲_______________________╱    de mamie 1987  │ légende manuscrite à côté (petite, −2°)
   │ ▨                                              │
32 │          La charlotte aux fraises (Anne)       │ titre centré −5 % L, souligné
   │          ═══════════════════════════           │
38 │ 1 boîte de boudoirs   ǀ  Trempe les boudoirs   │ DEUX COLONNES ingrédients ǀ méthode,
   │ 500 g de fraises      ǀ  dans le sirop, tapisse│ barre tracée à 40-48 % L sur la hauteur
   │ 3 œufs                ǀ  le moule, ~~~~~~~~~~~~│ de la liste ; la méthode continue
   │ 100 g de sucre        ǀ  ~~~~~~~~~~~~~~~~~~~~~~│ ensuite en pleine largeur
56 │ 25 cl de crème        ǀ  ~~~~~~~~~~~~~~~~~~~~~~│
   │ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│ suite en pleine largeur, 4-6 lignes
76 │ ~~~~~~~~~~~~~~~ Se garde 1 jour. Très bon !    │ appréciation soulignée deux fois
   │                                     ════       │
   └────────────────────────────────────────────────┘
```

Règles de collage :

- L'image n'est jamais alignée sur la page : rotation et décalage de 2 à 6 % L par rapport aux bords.
- Elle a son propre papier et sa propre ombre de collage : ombre fine de 1 à 2 px de 8 à 12 % d'opacité, plus de traces de colle ou de scotch.
- Le texte ne passe jamais **dessous**. Il démarre sous l'image, ou dans la colonne libre à côté (« légende », source).

### Gabarit D : page pleine qui continue

Inspiré de 10, 01 et 21. La page commence par la fin de la recette précédente et finit au milieu d'une autre. C'est la page « vraie » la plus courante.

```
 0 ┌────────────────────────────────────────────────┐
 5 │ ~~~~~~~~~~~~~~~~~~ (suite de la page précédente│ 2-6 lignes SANS titre, dès le haut,
   │ ~~~~~~~~~~~~~~ laisse refroidir dans le moule. │ alignées sur la marge
14 │                 ─────────────                  │ filet 25-40 % L avant le titre
17 │              Le far breton                     │ titre centré −4 à −10 % L
   │                                                │ 0-1 ligne blanche
22 │ Mélange 6 cuillerées de farine, 2 œufs, du     │ corps : pas 3,5-3,7 % H,
   │ sucre ; ajoute petit à petit un litre de lait  │ 9-12 lignes
   │ et des pruneaux ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│
58 │                 ─────────────                  │
61 │              Les merveilles.                   │ 3e titre aux 2/3 de la page
66 │ 2 œufs entiers         ǀ  1 pincée de sel      │ liste 2 colonnes, barre à 54 % L
   │ ½ livre de farine      ǀ  30 g de beurre       │
76 │ Pétris, étale finement, découpe en losanges ~~ │ À PARTIR D'ICI LE PAS SE RESSERRE :
   │ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ │ 3,6 → 3,0 → 2,7 % H, taille −10 à −15 %,
   │ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ │ mots tassés en bout de ligne
97 │ ~~~~~~~~~~~~~~~~~~~ et sers tiède avec du sucre│ dernière ligne à 1-3 % H du bas,
   └────────────────────────────────────────────────┘ suite au verso (ou titre orphelin en bas)
```

### Gabarit E : fiche ou feuillet scotché sur la page

Inspiré de 27, 30, 28 et 29. Une fiche cartonnée ou un feuillet de bloc, avec sa propre réglure, est fixé sur la page du carnet.

```
 0 ┌────────────────────────────────────────────────┐ page du carnet (papier du carnet)
 6 │   ▨                                    ▨       │ scotch jauni 2-4 bandes, à ±10-30°
 9 │  ┌──────────────────────────────────────────┐  │ FICHE : 80-95 % L (fiche 3×5″ : rapport 5:3)
   │  │ Pain d'épices         (de Mamie Jeanne)  │  │ ou feuillet 45-48 % L × 55-70 % H (bloc),
   │  │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│  │ rotation −2…+2°, décalage 2-5 % L ;
   │  │ 250 g de miel     ⎫                      │  │ ligne d'en-tête rouge-brique,
   │  │ 250 g de farine   ⎬ mélange à chaud      │  │ lignes bleu-gris pâles tous les 4 % H ;
   │  │ 1 c. à c. d'anis  ⎭                      │  │ liste à gauche, accolades « } » + action,
   │  │ Verse dans un moule beurré, 1 h à 160 °C.│  │ texte jusqu'au bord de la fiche
40 │  └──────────────────────────────────────────┘  │ (tons : blanc #f9f1db, crème, kraft)
   │   ▨                                    ▨       │
46 │      verso → « laisser rassir 2 jours »        │ suite éventuelle sur une 2e fiche
   │                                                │ ou au verso (jaunie en cadre)
   │  ┌───────────────────┐                         │ 2e fiche ou coupure (facultatif),
   │  │  ...              │ ▨                       │ qui chevauche la 1re de 2-6 %
   │  └───────────────────┘                         │
82 │          essayée le 3/12, très bon             │ note au crayon SUR LA PAGE, hors fiche
   └────────────────────────────────────────────────┘
```

La fiche a sa propre couleur de papier : 10 à 20 niveaux plus claire ou plus foncée que la page. Sa réglure est imprimée, et son encre peut différer de celle des notes sur la page (bille contre crayon).

---

## 7. Papiers utilisables tels quels (domaine public)

Cinq scans de feuillets **vierges**, tous dans le domaine public. On les a recadrés sur le papier seul, sans aucune retouche de couleur. Les fichiers sont dans `design-system/sources/papier/`, chacun accompagné de son `.licence.md` (source, URL, licence, institution, date, boîte de recadrage). Les originaux non recadrés sont dans `verification/out/refs/papier-originaux/`.

| N° | Fichier | Taille | Moyenne | Centre | Bord | Grain | Défauts | Usage |
|---|---|---|---|---|---|---|---|---|
| P1 | `wellcome-ms4489-i51-verge-creme.jpg` | 3383 × 5283 | `#e6d7b7` | `#e7d8ba` | `#e2d2b0` | vergé, trame ≈ 1,8 mm, fibres | une dizaine de rousseurs isolées, légère ombre vers le pli à gauche (1-2 %), marbrures douces de 21 niveaux | **Recommandé : base des pages du carnet** |
| P2 | `wellcome-ms4489-i55-rousseur.jpg` | 3392 × 5276 | `#ebdbbc` | `#ebdcbf` | `#e8d8b7` | id. | une rousseur nette à 30 % H, une traînée diagonale claire à droite, points | variante (tirer une page sur trois), rotation 180° possible |
| P3 | `wellcome-ms4489-i61-aureoles.jpg` | 3528 × 5368 | `#e0cea9` | `#e5d6b6` | `#d7be90` | id. | auréoles d'humidité en L (gauche et haut), taches vert-brun, rousseurs | gardes, sommaire, intercalaires ; pas sous un texte long |
| P4 | `loc-holmes1866-p66-reglure-fantome.jpg` | 2555 × 3097 | `#eee4c7` | `#ede6d0` | `#ecdebb` | vélin lisse (grain 2,4), presque sans points | **réglure fantôme** tous les 117 px (≈ 7,3 mm, 3,8 % H), à ΔL 2-4 ; éclaircissement léger côté gauche | l'option « avec réglure discrète », plus claire et plus lisse |
| P5 | `jagiellonne-gallqu146-p38-verge-gris.jpg` | 1871 × 2388 | `#dccebb` | `#ded2c0` | `#d8c9b2` | vergé, fibres et points noirs | gondolage en bandes horizontales sur la gauche, ton froid légèrement rosé | double page « plus ancienne », intercalaires |

Licences :

- **P1 à P3** : Wellcome Collection, « Recipe book » MS.4489, fin du XVIIIe s. Public Domain Mark 1.0 (licence `pdm` de l'image numérisée). https://wellcomecollection.org/works/v9rwh9fz
- **P4** : Library of Congress, « Receipts for French cooking », Amelia Jackson Holmes, 1866. Domaine public (autrice morte en 1888, « not aware of any U.S. copyright or any other restrictions »). https://www.loc.gov/item/2025296150/
- **P5** : Biblioteka Jagiellońska, « Recueil de recettes pour la cuisine et l'office », Berol. Ms. Gall. Qu. 146, [1750-1875]. « Domena publiczna (public domain) » ; Public Domain Mark sur Europeana. https://jbc.bj.uj.edu.pl/dlibra/publication/edition/195134
- Téléchargés le 16 octobre 2026.

**Recommandation : P1** (`wellcome-ms4489-i51-verge-creme.jpg`) comme papier de base.

- C'est un vrai feuillet de **carnet de recettes**, vierge, très grand. Une page de 1920 px de haut n'en utilise que 36 %, donc plusieurs découpes et rotations donnent des pages toutes différentes.
- Sa couleur moyenne (`#e6d7b7`) est un peu plus sombre que la médiane des vrais carnets (`#eee1bf`) et quasi identique à `gc-paper-aged` (`#e8d8b8`). Les rousseurs sont rares et peu marquées, faciles à éviter sous le texte.
- Mode d'emploi proposé :
  - découper par page un rectangle au hasard, avec rotation de 0° ou 180° et symétrie horizontale ;
  - ajuster la teinte de ± 4 niveaux pour que deux pages voisines diffèrent ;
  - ajouter P2 ou P3 seulement pour 1 page sur 4 ;
  - réserver P4 aux pages « cahier » qui veulent une réglure discrète.

**Ce qui n'a pas été trouvé** :

- aucun papier **Seyès** ou cahier d'écolier vierge en CC0 ou domaine public. Les Seyès vus (05, 07) sont en CC BY-SA, référence seulement ;
- aucune feuille du XXe s. en papier de bois roussi en domaine public. Les textures ambientCG (CC0) sont du kraft et du papier blanc moderne, pas du papier ancien, et n'ont pas été retenues.

Si une réglure Seyès est voulue, il vaut mieux la **générer** (pas 8 mm, interlignes 2 mm, ligne forte bleu-mauve `#e5ced7` à ΔL ≈ 10-15, lignes fines ΔL ≈ 5, marge `#ddbaa1` à 16-24 % L) et la cuire sur P1.

---

## 8. Index de la planche contact

`verification/out/refs/planche.jpg` (6 colonnes × 5 rangs, numéros en haut à gauche) : les numéros 01 à 30 sont ceux du tableau du § 1. Repères rapides :

- **Français** : 01-08.
- **Mains du XIXe** : 08-12.
- **Feuilles volantes vers 1900** : 13-18.
- **Carnets du XXe** : 19-21, 23-27.
- **Petit mot** : 22.
- **Fiches** : 28-30.
- **Gabarits** : A ← 09, 15, 22, 30 ; B ← 14, 02, 16 ; C ← 23, 27 ; D ← 10, 01, 21 ; E ← 27, 30, 28, 29.

---

## 9. Difficultés et limites

- **Gallica (BnF)** renvoie 403 (Cloudflare) aux requêtes automatiques, y compris IIIF. Les cahiers de recettes français numérisés par la BnF n'ont donc pas pu être consultés.
- **Wikimedia Commons** :
  - le serveur d'images limite fortement le débit (HTTP 429). Une partie des fichiers a été récupérée par un autre canal ;
  - le cahier d'Aveize (01-04) n'existe qu'en PDF de 993 px de large, contrasté et blanchi. Sa disposition est fiable, pas ses couleurs.
- **Smithsonian, Museums Victoria, DigitaltMuseum** : la clé de démonstration du Smithsonian est épuisée ; Museums Victoria est derrière un défi Cloudflare ; DigitaltMuseum ne livre que 1200 px pour certaines photos.
- **Cahiers français du XXe s. sous licence ouverte : très rares.**
  - Les manuscrits privés restent protégés et les archives départementales les mettent rarement en ligne sous licence ouverte.
  - Le corpus compense par des cahiers d'école français (05-07, même papier et mêmes encres que les cahiers de recettes de l'époque) et par des carnets nordiques, allemands, suisses et américains dont la composition est très proche.
- **Mesures automatiques** :
  - la hauteur d'x et la pente des lettres sont des estimations. La pente mesurée par cisaillement est biaisée vers le haut par les liaisons et a été corrigée à l'œil ;
  - sur les photos d'objets, la perspective fausse la géométrie : on n'en a pas tiré de mesures de marges.
- **Licences** :
  - les références « licence non précisée » (21, 22, 24, 26, 27) et CC BY-SA ne doivent pas quitter `verification/out/` ;
  - l'étiquette « domaine public » du cahier d'Aveize sur Commons est probablement abusive pour un texte du XXe s. : traiter comme référence privée ;
  - seuls les cinq papiers du § 7 sont réutilisables.
