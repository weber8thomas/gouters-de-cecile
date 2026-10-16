# SceneVideo — scène vidéo factice

En attendant les vraies vidéos des invités, `SceneVideo` affiche une **illustration animée** d'une personne
attablée devant son goûter (`design-system/illustrations/scenes/<scène>.svg`). Elle se place dans le slot
d'un écrin (cloche, napperon, Polaroid…) et le remplit entièrement.

Deux états, comme une vraie vidéo :

- **avant lecture** (`idle`) : image figée, traitée comme dessinée dans le carnet, soit **aquarelle douce**
  (lavis pastel qui bave, pigment accumulé au bord des zones, trait d'encre net, grain du papier), soit
  **sépia crayonné** (carte de dégradé `gc-sepia-4 → gc-sepia-0`, tremblé de crayon, grain de graphite) ;
- **en lecture** (`playing`) : la même scène en couleur, animée (respiration, clignement, gorgée de thé,
  vapeur). Fondu `var(--gc-dur-state)` / `var(--gc-ease)` entre les deux.

## Props

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `scene` | `string` | — | slug de la scène : `ILLUSTRATIONS['scenes/<scene>']`, ex. `julie` (= `guest.video.scene`) |
| `look` | `'aquarelle' \| 'sepia'` | `useSettings().idle` | traitement de l'image figée avant lecture |
| `state` | `'idle' \| 'playing'` | — | si fourni, commande l'état (`data-state` sur la racine) ; sinon on suit l'écrin ancêtre |
| `className` | `string` | — | classe ajoutée à la racine `.gc-scene-video` |

Scène inconnue : la racine s'affiche vide sur fond `var(--gc-paper)` (pas d'erreur).
La racine est `aria-hidden` : c'est un décor, la légende de l'écrin porte le sens.

```jsx
<SceneVideo scene="julie" />                                  // suit l'écrin ancêtre, look des réglages
<SceneVideo scene="julie" look="sepia" state="idle" />        // planche comparative
<SceneVideo scene={guest.video.scene} state={playing ? 'playing' : 'idle'} />
```

## Contrat avec `Ecrin`

- La racine de l'écrin porte la classe **`.gc-ecrin`** et **`data-state="idle|playing"`**.
- `SceneVideo` est posé dans le slot média de l'écrin, qu'il remplit à **100 % × 100 %** ; l'écrin recadre
  (masque rond, ovale ou rectangle). Le SVG est en `preserveAspectRatio="xMidYMid slice"`.
- Sans prop `state`, la bascule suit `.gc-ecrin[data-state='playing'] .gc-scene-video` (CSS seul, sans
  JavaScript). Avec `state`, c'est la prop qui gagne.
- Composition : les écrins ronds recadrent au point focal **[0,5 ; 0,42]**. Chaque scène garde visage, tasse
  et part de gâteau dans un **cercle de rayon ~380 centré en (800, 400)** du viewBox 1600×900.

## Fonctionnement

- Le SVG de la scène est inséré **deux fois** : `__live` (couleur, animée) dessous, `__still` (figée, filtrée)
  dessus. Chaque copie a ses ids préfixés par un identifiant d'instance (`React.useId`, deux-points retirés) :
  `id="…"`, `url(#…)` et `href="#…"` sont réécrits, plusieurs scènes peuvent cohabiter sur une page.
- Le filtre (`<filter>` construit dans le composant) n'existe que dans la copie figée, enveloppe toute la
  scène et n'est **jamais animé**. Ses couleurs de papier viennent des tokens (`flood-color: var(--gc-paper)`,
  `var(--gc-sepia-0…4)`).
- Les animations (`transform` / `opacity` seulement) ne sont déclarées que sur la copie `__live` ; elles sont
  **en pause** avant lecture et **coupées** sous `prefers-reduced-motion` (le fondu aussi).

### Classes d'animation (posées par le kit dans le SVG)

| Classe | Effet | Pivot |
|---|---|---|
| `gc-anim-breathe` | buste + tête : respiration et léger balancement | taille (rectangle-pivot) |
| `gc-anim-blink` | yeux : clignement | centre des yeux |
| `gc-anim-sip` / `gc-anim-sip-left` | avant-bras + tasse montent jusqu'aux lèvres (tasse à droite / à gauche de l'image) | paume (rectangle-pivot) |
| `gc-anim-sip-eyes` | yeux fermés pendant la gorgée | centre des yeux |
| `gc-anim-steam-sip` | la vapeur s'efface pendant la gorgée | — |
| `gc-anim-steam` | volutes de vapeur (décalées entre elles) | bas de la volute |
| `gc-anim-toast` / `gc-anim-toast-left` | tasse levée : petit « tchin » | coude (rectangle-pivot) |

Toutes utilisent `transform-box: fill-box` et `transform-origin: 50% 50%` : le kit ajoute dans chaque
groupe animé un **rectangle-pivot** sans fond (`pivotBox`) centré sur le pivot, ce qui place le centre de la
boîte englobante exactement sur l'épaule, la paume ou la taille. Les déplacements (ex. la gorgée
`translate(-42px, -161px) rotate(-10deg)`) sont exprimés dans le **repère canonique** du personnage : ils
restent justes quelle que soit la place ou l'échelle du personnage dans la scène.

## Ajouter une scène

1. Dans `design-system/illustrations/people/scenes.mjs`, ajouter une recette `SCENES.<slug>()` (slug =
   `guest.video.scene` du roster) en s'inspirant de `julie` : `createCtx('gc-scene-<slug>')`, décor
   (`wall`, `windowView`, `shelf`, `bunting`, `hoop`), ombre portée (`silhouette`), `person(...).back`,
   `tablecloth`, accessoires, `person(...).front`, `glowBeams`, puis `sceneDoc(ctx, [1600, 900], calques, { precision: 0 })`.
2. `node scripts/gen-svg.mjs illustrations/people` écrit `scenes/<slug>.svg` et vérifie : pas de `<style>`,
   `<text>`, `<filter>`, commentaire ni `width`/`height` ; ids tous préfixés `gc-scene-<slug>-` et uniques ;
   tracés bien formés.
3. `node scripts/gen-entry.mjs` : la scène devient `ILLUSTRATIONS['scenes/<slug>']`, `SceneVideo` la trouve.
4. Contrôler le cadrage rond (cercle r 380 en (800, 400)) et viser **< 150 Ko** par scène.

### Kit de personnages (`design-system/illustrations/people/kit.mjs`)

`person(ctx, look, options)` dessine n'importe quel invité à partir de son `look` (carnation `gc-skin-1…6`,
cheveux `gc-hair-1…6` et coiffure, haut, lunettes, barbe/moustache, âge) et renvoie `{ back, front, silhouette }` :
`back` passe derrière la table, `front` (avant-bras posés) devant. Options utiles : `x, y, scale`,
`pose: { left, right }` (`'repos' | 'tasse' | 'toast' | 'fourchette' | 'cache'`, côtés de l'image),
`tilt`, `neckline` (`'rond' | 'claudine' | 'v' | 'roule'`), `expression` (`'sourire' | 'rire' | 'doux'`),
`eyes` (`'ouverts' | 'rieurs'`), `lashes`, `liquid`, `cupDecor`, `forkTo`, `accessory` (`'barrette' | 'boucles'`),
`scarf`, `anim`. Accessoires de goûter réutilisables : `teacup`, `saucer`, `teapot`, `plate`, `cakeSlice`
(`citron`, `marbre`, `chocolat`), `jamJar`, `biscuitPlate`, `crepeStack`, `mug` (chocolat chaud), `lemon`,
`posy`, `napkin`, `crumbs`, `steam`.

## Style d'illustration (identique dans tout le carnet)

- Contour encre `gc-ink` légèrement irrégulier (formes « faites main » à graine), 3,6 unités (1,8 pour les
  détails), bouts et jointures ronds ; jamais de géométrie parfaite.
- Aplats + **un** ton d'ombre, en bas à droite : la lumière dorée de fin d'après-midi vient d'en haut à gauche
  (liseré `gc-glow` sur les bords éclairés, reflets en haut à gauche, ombres portées vers le bas à droite).
- Hachures à 45° (pas de 6, `gc-chocolate` à 30 %) seulement dans les ombres.
- Dégradés réservés à la porcelaine, au verre et aux liquides. Ombres portées dessinées (ellipses
  superposées), jamais de `<filter>` dans un SVG de scène.
- Visages simples et doux : yeux en points (ou en arcs rieurs), joues rose poudré, petit sourire, mains en moufle.
- Palette du carnet uniquement : crème, terracotta, rose poudré, sauge, chocolat, miel.

## À faire / à éviter

- **À faire** : garder le visage et la tasse au centre-haut (point focal [0,5 ; 0,42]) ; laisser un peu de décor
  autour pour les écrins rectangulaires ; vérifier les deux traitements avant lecture et 2–3 instants de l'animation.
- **À faire** : laisser le slot de l'écrin donner la taille — `SceneVideo` remplit 100 % de son parent.
- **À éviter** : modifier un SVG de scène à la main (il est régénéré) ; animer un filtre ; ajouter des
  propriétés autres que `transform` / `opacity` dans les animations ; poser du texte sur la scène.
- **À éviter** : mettre un `.svg` dans `illustrations/people/` (il deviendrait une illustration du bundle).
