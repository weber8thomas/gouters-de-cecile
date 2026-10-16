# Contrat de fabrication — « Les goûters de Cécile » (v2)

Ce contrat lie toutes les personnes et tous les agents qui fabriquent le design system.
En cas de doute, demander au responsable (le « lead ») plutôt qu'inventer.

## 1. Le projet et sa direction

- **Le carnet**
  - Carnet de recettes de goûter sucré, projeté sur une TV 16:9 (scène fixe **1920×1080**, vue à **3 m**) pendant l'anniversaire de Cécile, puis imprimé en **A5**.
  - Chaque écran est un livre ouvert posé sur une table : bois pour les pages vidéo, nappe pour les recettes seules, les intercalaires et le sommaire.
- **Direction : un vrai livre de recettes de grand-mère**, naturel et humain, rien qui « fasse IA ».
  - Chaque invité écrit sa page **de sa main**, avec son encre, ses ratures, ses annotations et ses soulignés à la règle.
  - Papier **uni ancien** : jauni, rousseurs, fibres, léger gondolage. Chaque double page est différente.
  - Illustrations au **crayon + aquarelle** : trait vivant et imparfait, lavis qui déborde, papier qui respire. Écrins compris.
  - Playfair Display seulement pour ce qui est **imprimé** : étiquette de couverture, onglets de chapitre, folios, coupure de journal. Caveat est la main de Cécile : légendes, sommaire, repères.
  - **Ce qu'il faut fuir** : la symétrie parfaite, les aplats propres, les dégradés lisses génériques, les mêmes décors répétés, l'alignement au pixel. Varier, déborder, pencher un peu.
- **Mouvement** : doux, physique et fluide (60 i/s sur l'ordinateur relié à la TV, sur un téléphone récent aussi). Pas de survol : le clavier, le doigt (ou la souris) et deux flèches discrètes.
- **Tous les écrans** : le même carnet s'ouvre sur **téléphone, tablette, ordinateur et TV** (§ 11). Les invités le reçoivent par un lien ; le QR de la version papier ouvre directement leur page.
- **Distance de caméra** : trois crans, proche / moyenne / loin, chacun avec une mise en page vérifiée, plus un zoom fin de ±5 %, réglés au clavier.

## 2. Où vit quoi

| Chemin | Contenu |
|---|---|
| `design-system/tokens.json` | **source unique** des valeurs (format du type DS). Familles `mains` (hauteurs d'x, interlignages, majorations) et `distance` (géométrie et hauteurs d'x visées par cran). Seul le lead le modifie : demandez un token. |
| `design-system/tokens.css` | généré (`npm run tokens`) |
| `design-system/motion.json` | ressorts du carnet (source unique ; Motion et les courbes CSS `gc-spring-*` en dérivent) |
| `design-system/metrics.json` | hauteur d'x, ascendantes et glyphes manquants de chaque police (`npm run metrics`) |
| `design-system/fonts/` | woff2 + licences OFL |
| `design-system/baked/**` | **images cuites** (WebP/PNG) : papier, écrins, illustrations. Commitées, jamais modifiées à la main. |
| `design-system/assets.json` | inventaire des images cuites (`npm run assets`) |
| `design-system/ecrins/<id>/` | écrins : générateur, manifeste, SVG vectoriels (§ 7) |
| `design-system/illustrations/<zone>/` | générateurs et sources d'illustrations |
| `src/components/<Comp>/` | composant React : `<Comp>.tsx`, `<Comp>.css`, `index.ts`, `README.md`, `preview.html` |
| `src/artboards/<Nom>/` | gabarits (`index.ts` export default) et leurs cartes |
| `src/content/` | `roster.json` (figé), `invites.ts` (recettes et mots), `mains.ts` (style de chaque invité), `types.ts` |
| `src/lib/` | partagé, propriété du lead : `settings.tsx`, `camera.tsx`, `viewport.ts`, `motion.ts`, `hands.ts`, `assets.ts`, `spread.ts`, `typo.ts`, `ecrin-types.ts`, `distance.css` |
| `scripts/lib/` | partagé : `bake.mjs` (cuisson), `organic.mjs` (formes faites main), `prng.mjs`, `tokens.mjs` (`c()`), `browser.mjs`, `serve.mjs` |

Les exports sont **automatiques** (`scripts/gen-entry.mjs`) :
- `src/components/<Comp>/index.ts` → `window.GoutersDeCecile` ;
- `src/artboards/<Nom>/index.ts` → `Artboards.<Nom>` ;
- les écrins, les illustrations SVG et les images cuites → `ECRINS`, `ILLUSTRATIONS`, `assetUrl()`.

Personne ne modifie `src/index.ts`.

## 3. Règles de travail

- **Périmètre exclusif** : chaque agent n'écrit que dans ses chemins. Un besoin ailleurs se signale dans le compte rendu.
- **Interdits** : git, `npm install`, `playwright install`, réseau, suppression hors périmètre.
- **Commandes** :
  - `npm run tokens`, `npm run metrics`, `npm run gen` (générateurs puis entrées), `npm run assets`, `npm run typecheck` ;
  - `node scripts/build-bundle.mjs --only A,B --boards X --tag <vous>` : **build isolé** dans `dist/ds-<vous>/components` ;
  - `node scripts/shot.mjs <carte>/preview.html [--w --h] --bundle dist/ds-<vous>/components --out verification/out/<vous>`.
- **Regardez vos captures** (outil Read sur le PNG) et jugez-les en directeur artistique. Itérez jusqu'à ce que ce soit beau.
- **Compte rendu** : fichiers écrits, captures, sortie des commandes, points ouverts, demandes de tokens.

## 4. React, TypeScript, Motion

- React **18**, JSX classique (`import React from 'react';` en tête de chaque `.tsx`).
- `index.ts` : `export { Comp } from './Comp'; export type { CompProps } from './Comp';`. Le CSS est importé par le composant.
- **Mouvement** :
  - importer **uniquement** depuis `src/lib/motion.ts` (`m`, `LazyMotion`, `domMax`, `AnimatePresence`, `useMotionValue`, `useTransform`, `useSpring`, `animate`, `SPRINGS`, `CUP_SPRING`, `STAGGER`) ;
  - composants `m.div`, sous un `<LazyMotion features={domMax}>` ;
  - ressorts nommés de `design-system/motion.json` : `SPRINGS.paper`, `.cover`, `.dome`, `.camera`, `.toast`, `.settle`. Aucune valeur de ressort en dur ;
  - **aucun rendu React pendant un geste** : MotionValue + `useTransform` ;
  - transitions CSS simples : `transition: transform var(--gc-dur-spring-settle) var(--gc-spring-settle)` (ou `cssSpring('settle')`).
- **Réglages** :
  - `useSettings()` donne `{ table, idle, distance }` ; `useCamera()` donne `{ distance, zoom, … }` ;
  - les mises en page peuvent changer selon `distance` : par exemple, au cran « loin », le petit mot passe sous l'écrin.
- **Contenu** : `getGuest(slug)`, `chapters`, `guestsOf()` dans `src/content`.
- **Double page** : `SpreadSpec` et `useRenderMode()` dans `src/lib/spread.ts`. En mode `static`, aucune vidéo, aucun mouvement, images cuites seulement.

## 5. CSS

- Préfixe **`gc-`** en BEM. Aucun sélecteur global.
- **Couleurs** : `var(--gc-…)` uniquement ; transparence via `color-mix(in srgb, var(--gc-…) 30%, transparent)`.
- **Texte manuscrit** :
  - **toujours** `handStyle(main, rôle, encre)` (`src/lib/hands.ts`), qui calcule la taille depuis `--gc-x-<rôle>` (fixé par le cran) / `--gc-xh-<main>` × `--gc-boost-<main>` ;
  - **aucune `font-size` en dur** ; texte passé par `handText(texte, main)`.
- **Texte imprimé** : classes de style des tokens (`gc-recipe-title`, `gc-folio`, `gc-section-label`, `gc-chapter-title`, `gc-cover-title`).
- **Géométrie** : `var(--gc-page-…)`, `var(--gc-book-…)`, `var(--gc-safe-…)`, `var(--gc-space-N)`. Elles suivent le cran actif (`distance.css`).
- **Images cuites** : par propriété personnalisée en ligne, `style={{ '--gc-tex': cssUrl('paper/base') }}` puis `background-image: var(--gc-tex)`. Aucune URL dans `bundle.css`.
- **Interdits à l'exécution** : `filter:` (SVG ou CSS) sur du contenu vivant, `mix-blend-mode`, `backdrop-filter`, `box-shadow` animé, `:hover`.
- **Animations** : `transform` et `opacity` seulement. Exceptions documentées : la toile WebGL de révélation et le masque d'écriture des titres. `will-change` seulement pendant un mouvement. Tout s'arrête sous `prefers-reduced-motion`.
- **Focus** : `outline: 3px solid var(--gc-honey-500); outline-offset: 4px` sur `:focus-visible`.

## 6. Images et illustrations : crayon + aquarelle, cuites au build

- **Chaîne** : un générateur Node (`build.mjs`) produit la géométrie en SVG, avec les helpers `organic.mjs` et les couleurs via `c('gc-…')`. Les groupes à traiter portent `data-fx="pencil|wash"` et une graine. La cuisson (`scripts/lib/bake.mjs` + recettes de filtres) rend l'image dans Chromium et l'écrit dans `design-system/baked/<zone>/…`. Les composants l'affichent par `assetUrl('<zone>/…')`.
- **Rendu** :
  - pendant la cuisson : filtres SVG à volonté (turbulence, déplacement, granulation) ;
  - à l'exécution : jamais.
  - Taille de cuisson : 1,25× la taille affichée (zoom fin et inclinaison 3D compris). Les masters d'export sont à 2×.
- **Crayon** :
  - trait graphite (`gc-graphite` / `gc-ink-crayon`), double passage décalé, pression variable ;
  - débords aux angles, petits manques, grain du papier.
- **Aquarelle** :
  - lavis décalé de 3 à 6 px du trait, bords qui bavent et plus foncés, densité inégale, granulation ;
  - papier visible par endroits, reflets laissés en blanc du papier.
- **Retenue**, pour ne pas faire « faux » :
  - saturation des lavis ≤ 70 % ;
  - 3 amas de rousseurs au plus par double page, taches seulement en marge ;
  - jamais de rousseur ni de tache sous du texte.
- **Ids** des SVG sources : `gc-<zone>-<variante>-<partie>`. Pas de `<text>` ni de référence externe.
- **Poids** : visez moins de 250 Ko par calque d'écrin et moins de 120 Ko par scène figée. `bundle.js` doit rester sous 3 Mo, donc aucune image cuite en data URI.

## 7. Écrins vidéo (séparables : cadre + masque)

- **`design-system/ecrins/<id>/`** :
  - `build.mjs` et `ecrin.json` (`EcrinManifest`, `src/lib/ecrin-types.ts`) ;
  - `<v>/back.svg`, `front.svg`, `mask.svg`, `dome.svg` (cloche) : **SVG vectoriels propres**, sans filtre, au même viewBox. Ils forment l'**export SVG** et la géométrie de référence.
- **Calques cuits**, sur la même grille de pixels : `design-system/baked/ecrins/<id>/<v>/{back,front,dome,domeBack,glint,mask-soft}.webp`, noms logiques `ecrins/<id>/<v>/<partie>`.
- **Ouverture** : définie une seule fois. Le masque est l'ouverture + `bleed` (4) en blanc. Le `front` cuit couvre l'anneau de débord avec une opacité ≥ 0,98.
- **Variantes** a, b, c : couleur du ruban ou du washi, angle, motif de dentelle, liseré.
- **États** :
  - `idle` : image figée sépia, cuite ;
  - `playing` : couleur, révélation aquarelle, tasse qui se remplit.
  - La cloche se soulève sur un ressort, avec un reflet qui balaie le verre.

## 8. Mains et encres

| Main | Police | Invités | Encre par défaut |
|---|---|---|---|
| `mamie` | Playwrite FR Trad | Rose, Odile | brune, plume |
| `ecole` | Playwrite FR Moderne | Léa, Camille, Margaux, Élise | plume |
| `soignee` | Kalam | Julie, Sophie, Anaïs, Inès | bic, crayon |
| `feutre` | Shantell Sans | Mathis, Noé, Lucas | feutre, noire |
| `capitales` | Patrick Hand SC | Bernard, Paul, Hugo, Karim | noire, crayon |
| `pressee` | La Belle Aurore | Antoine, Victor, Yasmine | bic, plume |
| `cecile` | Caveat | Cécile (légendes, sommaire, repères) | `gc-ink` |

- **Encres** : `gc-ink-plume`, `-bic`, `-crayon`, `-brune`, `-noire`, `-feutre`, `-rouge`.
- **Le rouge** est réservé aux corrections, aux soulignés et aux titres ≥ 48 px.
- **Glyphes manquants** : `metrics.json` les liste ; `handText()` les remplace.
- **Hauteur d'x** ≥ 14 px à l'écran pour tout texte courant, à tous les crans et à 0,95 de zoom. C'est garanti par les tokens `gc-x-*` si l'on passe par `handStyle()`.

## 9. Contenu

- **Fichiers** :
  - `src/content/roster.json` : figé, ne pas renommer les slugs ;
  - `invites.ts` : recettes et mots ;
  - `mains.ts` : `GuestStyle` (main, encre, souligné, puces, mise en page, inclinaison, graine, papier) et annotations.
- **Balisage dans les textes** :
  - `~~150 g~~>120 g` : rature dessinée, correction en rouge au-dessus ;
  - `__mot__` : souligné.
- **Ton** : tendre, tutoiement, recettes sucrées réalistes, vocabulaire français (« th. 6 (180 °C) », « 1 c. à s. »).
- **Budget d'une page vidéo**, mesuré au cran le plus serré qui s'applique :
  - titre d'une ligne ;
  - 8 ingrédients au plus ;
  - 4 étapes au plus ;
  - mot de 90 caractères au plus.
  - Un débordement est une erreur : on raccourcit, on ne réduit jamais.

## 10. Vérification

- `[data-gc-fit="overflow"]` interdit.
- Planchers de lisibilité respectés aux 3 crans et aux zooms 0,95 et 1,05.
- Texte dans la zone de sécurité.
- Glyphes présents dans la police.
- Contraste mesuré sur les pixels réels du papier.
- Écrins : alignement du masque, test magenta, transparence.
- Mouvement : aucun recalcul de mise en page pendant un geste, 40 calques au plus.

## 11. Tous les écrans : téléphone, tablette, ordinateur, TV

- **Une seule mise en page** : tout reste dessiné dans la scène logique 1920×1080 et ses trois crans. On ne recompose jamais une page pour un petit écran : la **caméra** cadre et met à l'échelle.
- **Cadrage** (`src/lib/viewport.ts`, `useViewport()`), choisi selon la forme de l'écran :
  - `double` (écran plus large que haut) : la double page entière, à l'échelle « contain ». La table déborde jusqu'aux bords de l'écran, sans bandes noires.
  - `page` (portrait : téléphone, tablette debout) : **une page à la fois**, à la plus grande échelle possible. On passe de la page gauche à la page droite par un glissement de caméra. Quand la page droite tourne, **la caméra suit la feuille** et atterrit sur la page gauche suivante (en reculant, l'inverse). Deux points discrets indiquent la page de la double page.
  - Changer d'orientation garde la double page et la page courantes, sans rechargement.
- **Lisibilité** : à chaque taille d'écran, la hauteur d'x à l'écran, ramenée à l'angle de vue à la distance de lecture habituelle (TV 3 m, ordinateur 60 cm, tablette 40 cm, téléphone 30 cm), reste au moins celle de la TV : 14 px à 3 m sur 1920 px.
- **Gestes** (pointeur : doigt, stylet, souris) :
  - **glisser horizontalement** sur le livre (feuillet monté dès 4 px, geste à partir de 8 px) : la feuille suit le doigt, puis le relâcher la laisse retomber sur un ressort en gardant sa vitesse (un geste vif suffit) ;
  - **toucher l'écrin** : lecture / pause ;
  - **toucher la marge** extérieure gauche ou droite : page précédente / suivante ;
  - `touch-action: pinch-zoom` sur le livre : le pincement du navigateur reste permis (accessibilité). Aucun défilement vertical de la page.
  - Aucune interaction ne dépend du survol.
- **Contrôles** (flèches, plein écran, points de page, repère de distance) : en **px d'écran**, hors de la scène mise à l'échelle.
  - Cibles d'au moins **44×44 px** sur écran tactile ; discrets sur la TV.
  - Respect des zones sûres : `viewport-fit=cover`, `env(safe-area-inset-*)`.
- **Clavier et télécommande** : inchangés (§ 1, README de `Livre`). Les crans de distance ne servent que sur un grand écran. Quand la page (cadrage `page`) ou le livre (petit écran couché) remplit déjà l'écran, la caméra est fixe et on prend la **mise en page du cran `loin`** : c'est celle dont l'écriture est la plus grande par rapport à la page. Sur une tablette couchée, le cran par défaut est `proche`.
- **Liens profonds** : `#<invité>` (par exemple `#julie`) ouvre sa double page, en cadrage `page` sur sa page vidéo. Le QR de l'A5 pointe là. L'URL suit la page affichée (`history.replaceState`), sans empiler l'historique.
- **Vidéos** :
  - MP4 H.264 + AAC, 720p, environ 5 à 10 Mo par vidéo d'une minute ;
  - `playsinline`, `preload="metadata"`, affiche : l'image sépia cuite ;
  - `play()` est appelé **dans** le geste (exigence d'iOS) ; le son est permis puisque c'est un geste.
- **Performance** : sur un téléphone, 60 i/s pendant un tourne-page (même règle de calques que § 4). Les images cuites à 1,25 × servent partout ; en 4K (échelle 2), un léger flou est accepté pour l'instant.
- **Vérification** (`scripts/verify-devices.mjs`, émulation Playwright) :
  - écrans : iPhone 13 portrait et paysage, Pixel 7, iPad portrait et paysage, ordinateur 1440×900 et 1280×800, TV 1920×1080 et 3840×2160 ;
  - pour chacun : aucun débordement hors cadre, contrôles visibles et dans les zones sûres, cibles ≥ 44 px sur tactile, hauteur d'x angulaire suffisante ;
  - glisser du doigt pour tourner (vers l'avant et l'arrière, geste vif), toucher l'écrin, lien profond, rotation de l'écran.
