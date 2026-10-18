# Plan v4 — Invités en évidence, couverture fidèle, zoom réel, livre vivant, A5 + QR, gabarits

## Contexte
**Plan v3 terminé** (bois seul, réglages, photo-vidéo, croquis, feuillet volant, recette de Lisa) : sur la branche `feat/epic-wright-58442e`, PR weber8thomas/gouters-de-cecile#1, en ligne sur GitHub Pages.

**Retours de l'utilisatrice (17/10) et ses réponses :**
1. **Lisa** : main « ado » gardée, **autre encre** pour la distinguer de Mathis (lui aussi en « ado » + feutre).
2. **Vraies vidéos des invités** : la question de l'hébergement est **reportée**. Aucune vraie vidéo n'est mise en ligne d'ici là.
3. **Finitions** :
   - « 4C min » ;
   - trou en bas de la page gauche de Lisa ;
   - « Joyeux » sur la page de Julie.
4. **Gabarits restants** (liste d'origine) : couverture, sommaire, intercalaires, **A5 + QR**. Les écrins sont abandonnés ; le reste existe déjà.
5. **Couverture « pas du tout fidèle au reste »** : elle est en CSS avec une police web, alors que les pages sont cuites.
6. **Pages d'invités claires**, choix « **Bandeau + mot encadré** » :
   - la double page actuelle est gardée ;
   - le **prénom est écrit en grand en haut à gauche**, près de la photo ;
   - le **mot pour Cécile** va dans un **cadre tracé à la main**, à part de la recette.
7. **Jamais de lettre manquante sur un mot important** : unités (exemple : `180^{g}`), nombres, noms, ingrédients.
8. **Photos et vidéos = des gens qui souhaitent bon anniversaire**, pas des recettes. La photo et le nom doivent rendre la personne identifiable d'un coup d'œil.
9. **Papier** encore améliorable.
10. **Zoom vraiment réglable**, téléphone compris. Aujourd'hui il est figé sur téléphone et limité à 0,85–1,15 ailleurs.
11. **Animation** : les 4 propositions sont retenues :
    - arrivée et ouverture ;
    - coin qui suit le doigt ;
    - sons de papier ;
    - indices de toucher sans texte.

**But.** Une démo en ligne cohérente de bout en bout : couverture → garde et titre → sommaire cliquable → intercalaires → invités → fin. Les invités sont identifiables, l'écriture est fiable, le zoom est réel, le livre est vivant. S'y ajoute un PDF A5 imprimable avec QR.

## Décisions par défaut (sans GATE)
- **Encre de Lisa : nouvelle encre `bille-bleue`.**
  - Stylo bille bleu-noir, plus bleu que `bic` (l'encre de Julie), réaliste.
  - Définie dans `tools/ecriture/encre.py` et ajoutée à `EncreId`.
  - Les tracés en cache restent valides : la forme ne dépend pas de l'encre (`ecrire.py:725`).
- **Lisa : `180 g` écrit d'un trait.**
  - Corrections gardées : `~~carrières~~>{carottes}` (vient de son message, le mot juste se lit) et l'ajout de Rose « et 1 de cannelle », qui est une phrase et non une lettre.
- **Source unique de l'ordre : `src/content/carnet.json`.**
  - Contient les doubles pages, leur type, les `invites[]` et le chapitre.
  - Les folios sont calculés à partir de ce fichier.
  - Il alimente à la fois la cuisson (folios, sommaire) et l'application (`SPREADS_DEMO`).
- **Ordre de la démo :**
  1. couverture ;
  2. garde et titre ;
  3. sommaire ;
  4. intercalaire Gâteaux : Lisa, Julie ;
  5. intercalaire Biscuits : Rose (sablés ; son chapitre passe de « boissons » à « biscuits » dans le roster), Mathis et Bernard ;
  6. fin.
- **Main « du carnet » `soignee` + `plume`** : étiquette de couverture, page de titre, sommaire, intercalaires.
- **Titre courant au crayon** en tête de la page droite : rappel du prénom. En mode page par page, on sait toujours chez qui on est.
- **Liens profonds** : `#bernard` et `#cecile` ouvrent la bonne page (`liens.ts` lit `invites[]`). L'URL de base des QR est dans `src/content/site.json` (GitHub Pages pour l'instant, à changer avant impression).
- **Touches** :
  - **+ / −** : loupe (paliers 1 · 1,5 · 2 · 3) ;
  - **0** : remise à zéro ;
  - **Alt ±** : zoom fin ;
  - les crans « taille du livre » passent dans le menu ;
  - **Entrée** : ouvre le livre quand il est fermé (sinon : vidéo, comme avant).

## GATE A — planches envoyées à l'utilisatrice (images via SendUserFile + AskUserQuestion) avant la production
1. **Couverture**, 3 variantes cuites, chacune fermée puis ouverte sur la garde et le titre :
   - toile de reliure (scan du domaine public) avec une étiquette papier manuscrite et un croquis ;
   - carton marbré avec une étiquette ;
   - toile avec le titre écrit à la main dessus.
2. **Page de Julie**, avant / après, avec 2 styles de cadre pour le mot :
   - double trait ;
   - trait ondulé avec un petit cœur.
3. **Papier**, actuel contre amélioré, en 2 dosages :
   - piqûres de rousseur ;
   - usure au pouce ;
   - taches de cuisine ;
   - ombre de reliure.
4. **Vœux vidéo** : planche contact avec 2 clips candidats par invité, en accord avec le prénom (Lisa jeune femme, Julie femme, Mamie Rose dame âgée, Mathis enfant ou ado, Bernard homme âgé). Chaque clip montre le visage, le tirage sépia et le prénom.

## Lots (sous-agents, chemins exclusifs, réseau autorisé pour V, C, Pa, S)

### L0 — Lead, avant tout
- **Contenu et types :**
  - `carnet.json` et `site.json` ;
  - types `Recette.mot`, `nom`/`sousTitre`, `SpreadSpec.invites[]` ;
  - `lisa.json` (encre `bille-bleue`, `180 g`) ;
  - roster ;
  - `liens.ts` ;
  - `DemoCarnet/spreads.tsx` lit `carnet.json`.
- **Stubs qui compilent dès le premier jour :**
  - `src/lib/loupe.ts` : `getLoupe`, `loupeOccupee`, `demanderLoupe(z, foyer?)`, `ancrerLoupe('haut')`, `publierContenuLoupe(rect, cote)`, événement `gc-loupe` début/fin ;
  - `src/lib/son.ts` : `jouerSon(nom, {vitesse, gain, delai})`, qui ne lève jamais d'erreur ;
  - `sonsLivre: boolean | null` dans `reglages.ts` (`null` = automatique) ;
  - `GesteType` reçoit `'loupe' | 'coin' | 'arrivee' | 'riffle'` (`evenements.ts:9`).
- **`motion.json`** :
  - ressorts `arrivee` (environ 0,8 s, rebond 0,14) et `riffle` (environ 0,55 s) ;
  - `inertie`.
- **`CONTRACT.md` § 13 (v4)** :
  - règle des mots importants ;
  - blocs `bandeau`, `cadre`, `courant`, `sommaire`, `chapitre` ;
  - zones `vivants.qr` et `liens`, champ `encre4x` (tuiles 2×2 avec 4 px de recouvrement) ;
  - API loupe et son.
- **Amendements du contrat :**
  - § 11:177 : le pincement natif du navigateur est remplacé par la loupe, avec `touch-action: none` ;
  - § 12.1 : nouvelles touches ;
  - § 5:84 : le survol passe par `pointermove` en JS + `cursor`, et les ombres ne s'animent que par opacité ;
  - § 3:50 : réseau autorisé pour les lots qui en ont besoin.

### Contenu et cuisson
| Lot | Mission | Chemins exclusifs |
|---|---|---|
| **E** Écriture fiable | **Repérer les mots importants** : `important(token)` = chiffres, unités (`UNITES`, `mise_en_page.py:75`), °, noms du roster, ingrédients.<br><br>**Les écrire sans faute** :<br>• tolérance zéro : aucun jeton manqué autorisé, y compris les jetons courts ; test « lettre en moins » à toute longueur ; variantes d'unités (`250g`) ; 8 graines puis réécriture du bloc (`ecriture.py:260-333`) ;<br>• **pas de saut de bille sur les glyphes importants** (`encre.py:168-182`, cause probable du « 4C ») ;<br>• **relecture finale de l'encre rendue**, `relire_rendu()`, appelée par P2.<br><br>**Divers** :<br>• « x » final de « Joyeux » (`texte.py:110-124`) ;<br>• validateur : aucune insertion `^{}` ni rature à l'intérieur d'un mot important ;<br>• encre `bille-bleue` ;<br>• tests, chemin TrOCR compris. | `tools/ecriture/**`, `scripts/pages/{ecriture,importants}.py`, `scripts/pages/tests/test_importants.py` |
| **P1** Mise en page | **Nouveaux blocs** :<br>• **`bandeau`** : prénom en grand, dans la main et l'encre de l'invité, souligné à la main, avec un sous-titre au crayon (« depuis Lyon ») près de la zone photo ;<br>• **`cadre`** : zone réservée en bas de la page droite, posée **avant** la recette, qui coule autour. Le cadre est tracé avec `gestes.py`, titré « Pour Cécile », signature à l'intérieur ;<br>• **`courant`** ;<br>• **`sommaire`** : points de conduite, folios, rectangles `liens` dans le manifeste ;<br>• **`chapitre`** : titre et croquis.<br><br>**Trou de pagination** : si plus de 1,5 ligne reste libre, essayer dans l'ordre `serrage` 2, un interligne local −4 %, puis la marge du folio (`plage`, `mise_en_page.py:571-597`).<br><br>**Contenus** : page de titre, sommaire, intercalaires (Gâteaux, Biscuits), pages invités mises à jour, mots d'exemple (Mathis). | `scripts/pages/{mise_en_page,recette,gestes}.py`, `scripts/pages/tests/test_pages.py`, `src/content/{pages,recettes}/**` |
| **P2** Cuisson et résolution | **`ECHELLE` et géométrie paramétrables** dans `cuire.py:55` et `rendu_encre.py:83,177,200,227` ; nouveau `formats.py` (`ecran`, `a5`).<br><br>**Passe ×4** : tuiles d'encre 2×2 `pages/4x/<id>-<rc>.webp`, manifeste `encre4x`.<br><br>**Format A5** : `--format a5`, 300 dpi.<br><br>**Contrôles** : appelle `relire_rendu` (E) ; un `douteux` sur un mot important fait **sortir avec le code 1** (`cuire.py:433`).<br><br>**Recuisson** de toutes les pages avec le papier choisi. | `scripts/pages/{cuire,rendu_encre,formats}.py`, `scripts/bake-pages.mjs`, `design-system/baked/pages/**` |
| **Pa** Papier | Planche pour le GATE, puis :<br>• piqûres de rousseur procédurales ;<br>• usure au pouce des coins extérieurs ;<br>• 1 à 2 taches de cuisine (reprise du lavis des croquis) ;<br>• ombre de reliure cuite (optionnelle à l'écran, obligatoire en A5) ;<br>• léger décalque d'encre ;<br>• papier de garde. | `scripts/pages/feuillets.py`, `src/content/pages/papiers.json`, `design-system/sources/papier/**` |
| **C** Couverture | **Matière** : toile ou carton scanné, domaine public, licence vérifiée.<br><br>**`couverture.py`** cuit :<br>• plats avant et arrière, dos, tranche ;<br>• étiquette manuscrite + croquis ;<br>• contre-plat et garde ;<br>• étiquettes « touchez / cliquez / Entrée pour ouvrir » au crayon (`baked/indices/**`).<br><br>**Composant `Couverture`** : fournit les images et les variables CSS consommées par Livre (branché par A).<br><br>Planche pour le GATE. | `scripts/pages/couverture.py`, `design-system/{sources,baked}/couverture/**`, `design-system/baked/indices/**`, `src/components/Couverture/**` |
| **V** Vœux vidéo | **Clips** : Pexels, Pixabay ou Mixkit, **personnes face caméra qui souhaitent bon anniversaire** (salut, bisou, verre levé, bougies). Paysage, 10 à 15 s, licence vérifiée, `notre_usage` documenté (exemple fictif).<br><br>**`bake-videos.mjs`** :<br>• **son d'origine conservé** (retirer `anullsrc`, lignes 221-226) ;<br>• cadrage sur le visage, `x/y/z` vérifiés sur image ;<br>• licence lue dans `credits.licences` ;<br>• plafond 3 Mo (`verify-all.mjs:164`, `verify-site.mjs:68`) ;<br>• tirage sépia centré sur le visage.<br><br>Planche contact pour le GATE. | `scripts/bake-videos.mjs`, `design-system/{sources/videos,baked/videos,baked/photos}/**`, `src/content/videos.json` |
| **Pr** A5 + QR | **`scripts/print/a5.mjs`** (`pdf-lib` et `qrcode` déjà installés).<br><br>**Une feuille A5 recto-verso par invité**, cuite par P2 :<br>• recto : bandeau, photo fixe, début de la recette ;<br>• verso : suite de la recette, mot encadré, **QR vectoriel** dans `vivants.qr` sous l'étiquette « Scanne-moi pour voir ma vidéo » (`gc-a5-qr` 26 mm) ;<br>• des pages en plus si la recette est longue.<br><br>Fond perdu de 3 mm, un seul PDF.<br><br>**`verify-a5.mjs`** : rendu PNG, `jsqr` doit renvoyer `site.json.url#slug` ; vérifier 154 × 216 mm. | `scripts/print/**`, `scripts/verify-a5.mjs`, `design-system/baked/a5/**` |

### Interaction (conception validée par l'agent Plan)
| Lot | Mission | Chemins exclusifs |
|---|---|---|
| **A** Livre | **Coin qui suit le doigt** : hybride.<br>• `Livre/coin.ts` (pur) : le pli est la médiatrice entre le coin saisi et le doigt, avec des contraintes anti-déchirure.<br>• `Livre/Coin.tsx` : rabat plat « façon turn.js », uniquement en transforms (dessous et rabat dans des demi-plans tournés `overflow: hidden`, plus 2 dégradés, soit environ 6 calques).<br>• Intention `coin` dans les zones d'angle (14 % × 14 %), avec `fx`/`fy` qui suivent x et y.<br>• **Relais vers le tourne-page 3D** quand la profondeur dépasse 0,28 ou sur un lancer : `p` est résolu par `bordProjete` (`geometrie.ts:112`), puis `piloter` (`Livre.tsx:673`) prend la suite et le rabat s'efface en 120 ms.<br>• **Levée du coin** de 2,5 % au survol ou au doigt posé (`settle`). Curseurs par `data-gc-curseur`.<br>• Repli si besoin : `COIN_2D = false`.<br><br>**Arrivée** : prop `arrivee`. Le livre glisse et se pose (+70 %, 5° → 0, ressort `arrivee`), sauf en mouvement réduit ou si le chargement dépasse 1,5 s.<br><br>**Étiquette « ouvrir »** : `InvitationOuvrir` (lot S), placée sur le tiers bas de la couverture.<br><br>**Ouverture lestée** : petite levée, puis ressort `cover` lancé, tassement de 2,5 px, son.<br><br>**Feuilletage** quand le saut fait au moins 2 doubles pages (Aller à…, Début/Fin, hash, sommaire) : jusqu'à 3 `FeuilletLeger` (2 calques, images 1×) en décalé, puis le `Feuillet` final.<br><br>**Lien profond** : arrivée, ouverture et feuilletage enchaînés en 2,1 s environ ; un toucher ou une touche saute à la fin.<br><br>**Branchements** :<br>• loupe : publier le rectangle du contenu au repos ; pas de glisser quand on est zoomé ; abandon du geste sur `gc-loupe` ; `pousser` zoomé → fondu + `ancrerLoupe('haut')` ; `will-change` re-promu au z de repos ; les `Fleches` (style papier) servent de ‹ › quand on est zoomé ;<br>• Couverture (C) branchée ;<br>• `jouerSon` aux bons moments ;<br>• `touch-action: none` (`Livre.css:693`). | `src/components/Livre/**`, `src/artboards/Carnet/**`, `harness/motion.html`, `scripts/fps.mjs`, `scripts/verify-devices.mjs`, `scripts/lib/verif.mjs` |
| **B** Loupe | **Calque `m.div.gc-ecran__loupe`** dans `Ecran.tsx:104` : `translate3d + scale` (MotionValues). Les contrôles, Soulever et Réglages restent hors du calque.<br><br>**Contrôleur** (`components/Loupe/controleur.ts`, écoute en capture) :<br>• pincement ancré au foyer, de 1 à 3 avec élastique ;<br>• à 1 doigt quand on est zoomé : déplacement avec inertie, bornes gardées dans `zoneSure` ;<br>• double toucher dans l'intérieur de la page (hors marges, objets et couverture fermée) : 1× ↔ 2× ;<br>• ctrl + molette ou pincement du pavé tactile ; molette seule = déplacement ;<br>• Safari : `gesture*` ;<br>• clavier : + / − paliers ; flèches = déplacement quand on est zoomé, transmises au livre au bord ; Échap = retour à 1×. Rien de tout ça quand `clavierModalActif()`.<br><br>**Interface** : `BoutonLoupe` en haut à droite (≥ 44 px, affiche « 150 % », toucher = 1× ↔ 2×). Ligne « Loupe » (100 à 300 %) dans Réglages **sur tous les écrans**, hors de la condition `!cameraFixe` (`Reglages.tsx:541-567`).<br><br>**Encre nette** : `PageCuite` charge les tuiles `encre4x` visibles (`IntersectionObserver`) quand `hd` (z ≥ 1,5) est actif, en fondu, et les retire sous 1,25. Tuiles ×4 réservées au site, pas à l'artifact (`assets.mjs`, `build-artifact.mjs`).<br><br>**Remise à zéro** à la rotation ; loupe désactivée tant que `visualViewport.scale > 1.01`. | `src/lib/{loupe.ts,camera.tsx}`, `src/components/{Ecran,Loupe,Reglages,PageCuite}/**`, `scripts/{assets,build-artifact}.mjs`, `scripts/verify-{loupe,reglages,site}.mjs` |
| **S** Sons et indices | **`son.ts`** :<br>• AudioContext paresseux, déverrouillé au premier `pointerup`/`click`/`keydown` en capture, avec un tampon muet ;<br>• `audioSession.type = 'ambient'` (respecte le mode silencieux iOS), reprise après interruption ;<br>• variantes jamais répétées deux fois de suite ; la vitesse du geste règle le débit et le gain ; ×0,3 pendant une vidéo.<br><br>**Banque de sons** :<br>• `page` ×5, `riffle`, `couverture-ouvrir/poser/fermer`, `feuillet`, `photo-lever/poser`, `coin` ;<br>• sources CC0 vérifiées, avec `licences.json` ;<br>• `bake-sons.mjs` : MP3 mono ≤ 30 Ko, crête −3 dBFS ;<br>• synthèse en repli.<br><br>**Réglage `sonsLivre`** : automatique = désactivé sur téléphone ; ligne « Sons du livre » ajoutée par B.<br><br>**Indices** (`indices.ts`) : un indice toutes les 6 à 9 s, en pause pendant un geste, la loupe, le menu ou un objet soulevé, coupé en mouvement réduit, mémorisé par objet (`gc:indices:v1`).<br>• Photo : respiration 1 → 1,025 et ombre qui s'opacifie.<br>• ▶ : pulsation.<br>• Feuillet : frémissement de ±1,5°.<br><br>**Composant `Invitation`** et `modalite.ts` (toucher / cliquer / Entrée). Sons branchés dans Soulever. | `src/lib/{son,reglages,indices,modalite}.ts`, `src/components/{Soulever,PhotoCollee,FeuilletVolant,Invitation}/**`, `design-system/{sources,baked}/sons/**`, `scripts/bake-sons.mjs`, `scripts/verify-{soulever,sons}.mjs` |

### I — Intégration (lead)
- `carnet.json` alimente `SPREADS_DEMO`.
- Liens du sommaire : boutons transparents dans les contrôles, d'après les rectangles `liens`, qui déclenchent le feuilletage.
- Annonce aux lecteurs d'écran : « Lisa — Carrot cake, double page 4 sur 10 ».
- `verify-all.mjs` intègre les nouvelles suites (loupe, sons, a5, cuisson stricte).
- Cartes du design system : Couverture, Sommaire, Intercalaire, Loupe, A5.

## Ordre
1. L0 (lead).
2. En parallèle : E, P1, P2 (paramétrage + ×4 + a5), Pa, C, V, A, B, S. Les planches pour le GATE viennent de C, P1, Pa et V.
3. **GATE A**.
4. Production :
   - C finalise ;
   - Pa règle ;
   - P1/P2 recuisent tout (titre, sommaire, intercalaires, invités, ×4) ;
   - V cuit ;
   - A branche la Couverture.
5. Pr (format a5 de P2 prêt).
6. I.
7. Tout exécuter, revue de direction artistique sur les captures (TV, ordinateur, tablette, téléphone).
8. Lead :
   - GitHub Pages ;
   - artifact v8 (sans mp4 ni tuiles ×4) ;
   - commits ;
   - mise à jour de la PR ;
   - **aucune vraie vidéo d'invité**.

## Vérification
- **Code** : `npx tsc --noEmit -p .`, `npm run build:site`, `node scripts/verify-all.mjs --build` au vert.
- **Cuisson** :
  - tests `unittest` passent ;
  - `bake-pages.mjs` : **0 douteux sur un mot important** ;
  - deux cuissons donnent les mêmes octets ;
  - Lisa : aucun mot perdu, aucun trou de plus de 1,5 ligne ;
  - « 4 °C / 40 min » relus justes sur l'encre rendue.
- **Loupe** (iPhone 13 en DPR 3, Pixel 7, iPad, 1440, TV) :
  - pincement : dérive du foyer ≤ 4 px et `visualViewport.scale === 1` ;
  - double toucher : intérieur, marge et photo ;
  - un déplacement ne tourne jamais la page ;
  - ‹ › gardent le zoom, haut de page sous les zones sûres ;
  - seules les tuiles visibles sont chargées ;
  - 0 Layout et ≤ 2 Paint pendant le geste (CPU ×4).
- **Livre** (`fps.mjs`) : scénarios `coin` (diagonale), `survol`, `riffle`, `arrivee`, `lien` (`#bernard` en ≤ 2,2 s ; un toucher à 0,5 s atterrit en ≤ 300 ms). Seuils : 0 Layout, ≤ 2 Paint, ≤ 40 calques.
- **Sons** : espion d'AudioContext.
  - Suspendu avant le premier geste, actif après.
  - Un geste rapide donne un débit plus élevé.
  - Coupé par défaut sur iPhone, volume appliqué.
  - Un 404 ne casse rien.
  - Licences présentes.
- **Indices** : ≤ 9 s, arrêt après usage, jamais en mouvement réduit.
- **Liens et A5** :
  - `#lisa`, `#bernard`, `#cecile` et chaque lien du sommaire mènent à la bonne page ;
  - les QR de l'A5 se décodent vers la bonne URL ;
  - fond perdu présent.
- **Publication** :
  - version en ligne vérifiée ;
  - à cocher sur un vrai iPhone : H.264 et sons.

## Risques
| Risque | Parade |
|---|---|
| Clips de vœux libres de droits rares | Pixabay et Mixkit ; clips muets acceptés ; nouvelle planche au GATE |
| Personne de banque d'images présentée comme un invité | Usage « exemple » documenté ; remplacée par les vraies vidéos |
| Le rabat tourné provoque des Paint (WebKit) ou dépasse le budget de calques | `COIN_2D = false` (levée 3D simple) |
| Feuilletage au-delà de 40 calques | 2 feuilles intermédiaires |
| Mémoire et flou à 3× en DPR 3 | Tuiles + re-promotion ; plafond à 2,5× si besoin |
| Perte du pincement natif (accessibilité) | Loupe 3×, touches, ligne dans le menu ; désactivée si zoom navigateur > 1 |
| Relecture stricte lente | Mots importants seulement ; cache par graine |
| Sons sous licence floue | CC0 vérifié uniquement, sinon synthèse |
