# Contrat de fabrication — « Les goûters de Cécile »

Ce contrat lie toutes les personnes et tous les agents qui fabriquent le design system.
Il prime sur les habitudes : en cas de doute, demander au responsable (le « lead ») plutôt qu'inventer.

## 1. Le projet en une minute

Carnet de recettes de goûter sucré, projeté sur une TV 16:9 (scène fixe **1920×1080**, vue à **3 m**)
pendant l'anniversaire de Cécile, puis imprimé en **A5**. Chaque double page = un livre ouvert posé sur
une table (bois ou nappe), reliure visible au centre. Papier crème texturé, coins cornés, taches discrètes,
fleurs séchées, lumière dorée de fin d'après-midi. Palette : crème, terracotta, rose poudré, sauge, chocolat.
Typo : Caveat (manuscrit) + une serif (Cormorant Garamond ou Playfair Display, choix en attente).
Aucune interface au survol, aucune marque ni logo.

## 2. Où vit quoi

| Chemin | Contenu | Remarques |
|---|---|---|
| `design-system/tokens.json` | **source unique** des couleurs, typo, espacements, ombres, géométrie | format du type Design System (listes de tokens). Seul le lead le modifie : demandez un token. |
| `design-system/tokens.css` | généré (`npm run tokens`) | ne jamais modifier à la main |
| `design-system/fonts/` | woff2 Caveat, Cormorant, Playfair | |
| `design-system/metrics.json` | hauteur d'x mesurée de chaque police | |
| `design-system/textures/` | sources SVG + WebP pré-rendus | |
| `design-system/ecrins/<id>/` | écrins vidéo (§ 6) | SVG générés par `build.mjs` |
| `design-system/illustrations/<zone>/` | illustrations SVG | générées par `build.mjs` ou écrites à la main si courtes |
| `src/components/<Comp>/` | composant React : `<Comp>.tsx`, `<Comp>.css`, `index.ts`, `README.md`, `preview.html` | un dossier par composant |
| `src/artboards/<Nom>/` | gabarit 1920×1080 (ou A5) : `<Nom>.tsx`, `index.ts` (export default), `preview.html` | |
| `src/content/` | `roster.json` (invités, figé), `invites.ts` (recettes, mots), `types.ts` | |
| `src/lib/` | utilitaires partagés (réglages, types d'écrin) | lead |
| `src/generated/` | généré par `scripts/gen-entry.mjs` | ne jamais modifier |
| `scripts/` | outillage Node | `scripts/lib/` = aides partagées |

Les exports sont **automatiques** : tout `src/components/<Comp>/index.ts` est ré-exporté dans
`window.GoutersDeCecile`, tout `src/artboards/<Nom>/index.ts` (export default) dans
`GoutersDeCecile.Artboards.<Nom>`, tout écrin et toute illustration dans `ECRINS` et `ILLUSTRATIONS`.
Personne ne modifie `src/index.ts`.

## 3. Règles de travail

- **Périmètre** : chaque agent écrit uniquement dans les chemins qui lui sont attribués.
  Besoin d'un changement ailleurs (token, utilitaire partagé, composant d'un autre) → le noter dans le compte rendu.
- **Interdits** : git, `npm install`, `playwright install`, accès réseau (sauf Google Fonts déjà prévu), suppression de fichiers hors de son périmètre.
- **Commandes utiles** :
  - `npm run tokens` — régénère tokens.css et vérifie les contrastes ;
  - `npm run gen` — exécute tous les `build.mjs` puis régénère les entrées (`node scripts/gen-svg.mjs ecrins/cloche` pour un seul) ;
  - `npm run typecheck` — TypeScript strict ;
  - `npm run bundle` — construit `dist/ds/components/bundle.{js,css}` ;
  - `node scripts/shot.mjs src/components/<Comp>/preview.html [--w 1920 --h 1080] [--out verification/out/<zone>]`
    — rend la carte dans le banc d'essai (identique au cadre de l'artifact) et l'enregistre en PNG.
    **Regardez vos captures** (outil Read sur le PNG) : c'est le seul moyen de juger le rendu.
- **Compte rendu attendu** : fichiers écrits, chemins des captures, sortie des commandes ci-dessus, points ouverts, demandes de tokens.

## 4. React et TypeScript

- React **18**, JSX **classique** : chaque `.tsx` commence par `import React from 'react';`. Aucune autre dépendance d'exécution.
- Composants de présentation, pilotés par props ; état local seulement pour la lecture (horloge, tasse).
- `index.ts` du dossier : `export { Comp } from './Comp'; export type { CompProps } from './Comp';`.
- Le CSS du composant est importé par le composant (`import './Comp.css';`) et finit dans `bundle.css`.
- Lire les réglages de scène avec `useSettings()` / `useTitleClass(role)` (`src/lib/settings.tsx`).
- Lire le contenu avec `getGuest(slug)`, `chapters`, `guestsOf(chapterId)` (`src/content`).

## 5. CSS

- Préfixe **`gc-`** en BEM : `.gc-ecrin`, `.gc-ecrin__media`, `.gc-ecrin--playing`. Aucun sélecteur global (`body`, `p`, `*`).
- **Couleurs : uniquement `var(--gc-…)`**. Aucune valeur hex, rgb ou nommée en dur. Transparence : `color-mix(in srgb, var(--gc-ink) 30%, transparent)`.
- **Typographie : uniquement les classes de style des tokens** (`gc-hand-body`, `gc-recipe-title`, `gc-a5-hand-body`…), posées dans le balisage.
  Aucune `font-size` en dur. Tailles planchers sur TV : Caveat 38 px, Cormorant 36 px (32 px pour un folio), Playfair 27 px.
- Espacements et géométrie : `var(--gc-space-N)`, `var(--gc-page-…)`, `var(--gc-safe-…)`. Ombres : `var(--gc-sh-…)`.
- **Pas de `:hover`.** Focus clavier : `outline: 3px solid var(--gc-honey-500); outline-offset: 4px` sur `:focus-visible`.
- Animations : `transform` et `opacity` seulement ; durées `var(--gc-dur-…)`, courbe `var(--gc-ease)` ;
  toutes coupées sous `@media (prefers-reduced-motion: reduce)`.
- Pas de `backdrop-filter`, pas de `mix-blend-mode` sur de grandes surfaces, pas de filtre animé.

## 6. SVG (écrins et illustrations)

- Générés par un `build.mjs` (Node) qui s'appuie sur `scripts/lib/organic.mjs` (contours faits main, festons,
  bords déchirés, taches) et `scripts/lib/prng.mjs` (aléatoire à graine). Couleurs **toujours** via
  `c('gc-…')` de `scripts/lib/tokens.mjs` : le SVG porte des couleurs littérales, mais elles viennent des tokens.
- Document autonome : `viewBox` à l'origine, **sans** `width`/`height`, **sans** `<style>`, `<text>`, commentaire,
  référence externe ni `<image>`. Utiliser `svgDoc([w, h], corps)` de `organic.mjs`.
- **Ids uniques dans tout le bundle** (les SVG sont insérés en ligne ensemble) : `gc-<zone>-<variante>-<partie>`,
  ex. `gc-cloche-a-glass-grad`.
- Classes autorisées pour l'animation : `gc-anim-<nom>` (définies dans le CSS du composant qui anime).
- Ombres portées **dessinées comme des formes** (ellipse floue simulée par plusieurs ellipses à faible opacité,
  ou dégradé radial), jamais par `<filter>` dans un écrin (les fichiers doivent rester exportables tels quels).
- **Style d'illustration** (identique partout) :
  - contour encre `gc-ink`, 3 unités à l'échelle d'affichage (1,5 pour les détails), bouts et jointures ronds ;
  - aplats + **un** ton d'ombre ; hachures à 45° seulement dans les ombres (pas de 6, `gc-chocolate` à 30 %) ;
  - dégradés réservés au verre, à la porcelaine et aux liquides ;
  - lumière venant d'en haut à gauche : reflets en haut à gauche, ombres vers le bas à droite ;
  - trait légèrement irrégulier (`wobbly…`), jamais de géométrie parfaite à la règle.
- Taille raisonnable : répéter un motif avec `<use href="#…">` plutôt que dupliquer (dentelle, liseré).

## 7. Écrins vidéo

Un écrin = un cadre décoratif autour d'une vidéo, réutilisable et **séparable** (exporté en PNG/SVG transparents
pour être incrusté dans les vidéos). Dossier `design-system/ecrins/<id>/` :

```
build.mjs        générateur déterministe → écrit les fichiers ci-dessous
ecrin.json       manifeste (type EcrinManifest, src/lib/ecrin-types.ts)
<v>/back.svg     ce qui est DERRIÈRE la vidéo (napperon, assiette, présentoir, ombre portée)
<v>/front.svg    ce qui est DEVANT la vidéo (bord, verre, washi, ruban) ; recouvre la bande de débord
<v>/mask.svg     l'ouverture élargie de `bleed` unités, en blanc #fff opaque sur transparent, rien d'autre
<v>/dome.svg     cloche uniquement : le dôme en place (soulevé par transformation CSS, cf. manifest.lift)
```

- `<v>` = `a`, `b`, `c` (variantes légères : couleur du ruban ou du washi, angle, motif de dentelle, liseré).
- **Même viewBox pour tous les fichiers d'un écrin** et pour tous ses états ; la place du dôme soulevé est prévue dès le départ.
- **L'ouverture est définie une seule fois** dans `build.mjs` et sert à la fois au trou du `front`, au masque et à `ecrin.json`.
- Les sources vidéo sont en 16:9 : les ouvertures rondes ou ovales recadrent au centre (`focus`).
- Deux états : `idle` (avant lecture : image figée traitée aquarelle ou sépia, comme dessinée) et `playing`
  (couleur, la tasse-progression se remplit). La cloche se soulève en lecture.

## 8. Contenu

- Invités, chapitres, écrins et variantes : `src/content/roster.json` (figé ; ne pas renommer les slugs).
- Budget d'une page vidéo (mesuré : 760×888 utiles) : titre ≤ 23 caractères (une ligne) ; ≤ 8 ingrédients
  de ≤ 22 caractères ; ≤ 4 étapes tenant sur ≤ 5 lignes (~45 caractères par ligne, ≤ 180 caractères au total) ;
  petit mot ≤ 90 caractères (2 lignes) + signature. Un débordement est une erreur :
  on raccourcit le texte, on ne réduit jamais la taille.
- Ton : tendre, simple, tutoiement entre proches ; recettes sucrées réalistes, vocabulaire français
  (« th. 6 (180 °C) », « 1 c. à s. », « moule à manqué 24 cm », « une pincée de fleur de sel »).
