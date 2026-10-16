# Ecrin

`Ecrin` pose la vidéo d'un invité dans un cadre décoratif du design system (cloche à gâteau, napperon, étiquette…) : il empile les calques SVG de l'écrin, découpe la vidéo à son ouverture et ajoute la tasse-progression et la légende manuscrite.

```tsx
<Ecrin type="cloche" variant="a" state="playing" progress={0.6} liquid="the"
       caption="Julie, depuis Lyon" media={<SceneVideo scene="julie" />} />

// Lecture au clavier ou au clic, horloge comprise :
<EcrinLecteur type="cloche" caption="Julie, depuis Lyon" duration={42} media={<SceneVideo scene="julie" />} />
```

La largeur vient du parent (ou de `style.width`) et la hauteur du `viewBox` de l'écrin (`aspect-ratio`). On peut aussi fixer la hauteur (`height: 100%`, comme dans `PageVideo`) : la largeur suit.

## Props — `EcrinProps`

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `type` | `EcrinId` | — | Écrin du chapitre, clé de `ECRINS` (`'cloche'`, `'napperon'`…). |
| `variant` | `string` | 1re variante | `'a'`, `'b'`, `'c'`. |
| `state` | `'idle' \| 'playing'` | — | Avant lecture (image figée traitée) ou en lecture (couleur, tasse). Posé en `data-state` sur la racine. |
| `media` | `ReactNode` | — | Enfant du slot (ex. `<SceneVideo/>`). Prioritaire sur `video`. |
| `video` | `{ src, poster? }` | — | Vraie vidéo : poster traité avant lecture, `<video>` en couleur en lecture. |
| `progress` | `number` | `0` | 0–1, remplit la tasse. Ignoré avant lecture (tasse vide). |
| `liquid` | `'the' \| 'chocolat' \| 'cafe-au-lait'` | `'the'` | Contenu de la tasse. |
| `caption` | `string` | — | Légende manuscrite (`gc-hand-caption`, `--gc-chocolate`). |
| `showCup` | `boolean` | `true` | Affiche la tasse (si le manifeste prévoit `cup`). |
| `lifted` | `boolean` | `state === 'playing'` | Dôme soulevé (cloche). |
| `className`, `style` | | | Sur la racine `.gc-ecrin`. |
| `videoRef` | `Ref<HTMLVideoElement>` | — | Accès à la `<video>` (utilisé par `EcrinLecteur`). |

### `EcrinLecteur`

Mêmes props sans `state` ni `progress`, plus `duration?: number` (secondes simulées, 30 par défaut) et `autoPlay?: boolean`.
Toute la surface est un bouton : Entrée, Espace ou clic lance / met en pause ; `:focus-visible` = anneau `--gc-honey-500`.
Avant la première lecture l'écrin est `idle` ; ensuite `playing` (même en pause, `data-paused="true"` sur le lecteur) ;
à la fin la tasse reste pleine et fume (`data-ended="true"`). Avec `video`, l'horloge reflète la vraie vidéo.

### `useMediaClock(duration, { autoPlay?, media? })`

Horloge au contrat d'une `HTMLVideoElement` : `currentTime`, `duration`, `paused`, `ended`, `progress` (0–1), `play()`, `pause()`.
Sans `media`, elle simule la lecture ; avec un élément `<video>`, elle le reflète et lui délègue `play()` / `pause()`.

## Calques et contrat cadre + masque

Racine : `<div class="gc-ecrin gc-ecrin--<type>" data-ecrin data-variant data-state data-lifted data-idle>`.
Calques absolus `inset: 0`, au **même viewBox**, dans cet ordre :

1. `.gc-ecrin__back` — `back.svg` en ligne (présentoir, ombre portée dessinée, arrière du bord du dôme) ;
2. `.gc-ecrin__media` — masqué par `mask.svg` (`mask-size: 100% 100%`), contient le **slot** `.gc-ecrin__slot`, posé exactement sur la boîte englobante de l'ouverture, `overflow: hidden` ;
3. `.gc-ecrin__front` — `front.svg` (anneau qui couvre la bande de débord, avant du plateau) ;
4. `.gc-ecrin__dome` — `dome.svg` (cloche seulement) ;
5. `.gc-ecrin__cup` — `TasseProgression` ancrée au point `cup` (centre du bas de la soucoupe), largeur `--gc-cup-size` ;
6. `.gc-ecrin__caption` — légende dans la zone `caption`.

Règles pour **tout** écrin (la cloche sert de référence, `design-system/ecrins/cloche/build.mjs`) :

- **Ouverture** définie une seule fois dans `build.mjs`, réutilisée par le masque, le trou du `front` et `ecrin.json`.
  Cercle et ellipse : slot = boîte englobante. Rectangle : slot = le rectangle, tourné de `rotate` degrés **autour de son centre**.
- **Masque** : l'ouverture élargie de `bleed` (4) en `#fff` opaque, rien d'autre.
- **Front** : couvre toute la bande `[ouverture, ouverture + bleed]` avec de la marge des deux côtés
  (cloche : anneau plein de `r − 2` à `r + 10`). Vérifié avec un média magenta : rien ne dépasse.
- **Dôme soulevé** (`lift`) : rotation de `rotate`° autour du **centre de l'ouverture**, puis translation `(dx, dy)`,
  en `--gc-dur-dome` / `--gc-ease`. Le dôme soulevé reste entièrement dans le viewBox.
  Ce qui, dans `back.svg`, appartient au dôme (arrière du bord) est groupé dans `<g class="gc-anim-lift">` : le composant
  lui applique la même transformation (en unités du viewBox). Pour un export vidéo, animer ce groupe avec le dôme.
- **Tasse** : `cup` = centre du bas de la soucoupe, sur la table, hors du cadre ; la tasse fait `--gc-cup-size` de large
  quelle que soit l'échelle de l'écrin — garder ~150 unités libres autour.
- **Légende** : `caption` = coin haut-gauche + largeur (+ rotation autour de ce coin), texte centré, deux lignes au plus.
- **Ids** : `gc-<écrin>-<variante>-<fichier>-<partie>`. Le composant suffixe les ids par instance : plusieurs écrins
  identiques peuvent cohabiter sur une page. Ne pas cibler d'id en CSS : seulement des classes `gc-anim-…`.

## Contrat avec le média (slot)

- L'enfant du slot le **remplit** (le composant lui donne `position: absolute; inset: 0`) et gère lui-même ses deux rendus
  d'après l'ancêtre `.gc-ecrin[data-state]` — c'est ce que fait `SceneVideo`.
- Aides disponibles pour tout enfant : `.gc-ecrin__still` (au-dessus, traité selon `data-idle`), `.gc-ecrin__live`
  (en dessous, couleur) et `.gc-ecrin__wash` (voile de papier en vignette) ; fondu en `--gc-dur-state` / `--gc-ease`.
- `data-idle` vient de `useSettings().idle` : `aquarelle` (désaturé, clair) ou `sepia` (sépia crayonné), filtres CSS fixes.
- Vraie vidéo (`video`) : le poster est l'image figée, la `<video>` est en couleur ; `object-fit: cover`,
  `object-position` = `focus` du manifeste. Le passage `idle → playing` lance la vidéo, `playing → idle` la remet à zéro.

## Règles d'usage

- Verre : voile `gc-glass-tint` (opacité cumulée mesurée sur la vidéo ≈ 0,06, plafond 0,35), reflets `gc-glass-highlight`
  **jamais** sur la vidéo — ni en place, ni soulevé (`build.mjs` le vérifie). Lumière dorée `gc-glow` hors vidéo.
- Porcelaine `gc-porcelain` / `gc-porcelain-shade`, filet doré `gc-honey-500`, ruban `gc-terracotta-500` / `-700`.
- Ombres dessinées en formes (`gc-ink` à faible opacité, vers le bas à droite), hachures `gc-chocolate` à 30 % dans les ombres.
- Trait `gc-ink` : 3 px à l'affichage (≈ 3,5 unités pour un écrin de ~860 px de haut), 1,5 px pour les détails.
- Légende : classe `gc-hand-caption`, couleur `--gc-chocolate` ; tasse : `--gc-cup-size`.

## À faire / à éviter

- ✔ Laisser la page dimensionner l'écrin (largeur **ou** hauteur) ; l'`aspect-ratio` fait le reste.
- ✔ Donner un `poster` à toute vraie vidéo (sinon pas de fondu entre l'image figée et la couleur).
- ✔ Passer `progress` seulement en lecture ; préférer `EcrinLecteur` quand il faut une vraie interaction.
- ✘ Pas de `display: none` sur un écrin pour le cacher pendant une transition (préférer l'opacité).
- ✘ Ne pas modifier les SVG à la main : relancer `node scripts/gen-svg.mjs ecrins/<id>`.
- ✘ Pas d'interface au survol ni de barre de lecture : la tasse est la seule progression.

Vérifications automatiques (masque, slot, magenta, opacité du verre) : `node verification/out/f3/verify.mjs`.
