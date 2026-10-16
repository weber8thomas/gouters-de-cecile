# TasseProgression

`TasseProgression` remplace la barre de lecture : une tasse en porcelaine sur sa soucoupe qui se remplit de thé, de chocolat ou de café au lait au fil de la vidéo, et qui fume quand elle est pleine.

```tsx
<TasseProgression progress={0.6} liquid="the" />
<TasseProgression progress={1} liquid="chocolat" size={96} />
```

Dans un écrin, elle est posée automatiquement par `Ecrin` au point `cup` du manifeste (centre du bas de la soucoupe).

## Props — `TasseProgressionProps`

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `progress` | `number` | — | Avancement 0–1 (borné). |
| `liquid` | `'the' \| 'chocolat' \| 'cafe-au-lait'` | `'the'` | `--gc-tea`, `--gc-chocolate`, `--gc-cafe-au-lait`. |
| `size` | `number` | `--gc-cup-size` | Largeur en px (hauteur = 100/120 de la largeur). |
| `className` | `string` | — | Sur la racine `.gc-tasse`. |

Racine : `<div class="gc-tasse gc-tasse--<liquide>" role="progressbar" aria-label="Progression de la vidéo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="…" data-full>`,
SVG en ligne `viewBox="0 0 120 100"`.

## Fonctionnement

- Le liquide est découpé par l'intérieur de la tasse (bol + ouverture) et monte par `transform: scaleY(var(--p))`
  depuis le fond ; le **ménisque** elliptique suit le niveau (translation) et prend la largeur intérieure du bol à cette
  hauteur (échelle calculée en JS, `--gc-tasse-s`). Légère ondulation du ménisque.
- **Vapeur** : trois volutes animées (`stroke-dashoffset` + opacité), seulement à partir de `progress ≥ 0,98`.
- Ancrage pour un placement précis : `TASSE_ANCHOR = { x: 0.5, y: 0.96 }` (centre du bas de la soucoupe, en fractions de la boîte).

## Règles d'usage

- Taille : `--gc-cup-size` (112 px, plage 96–120 px) sur la TV ; ne pas descendre sous 96 px dans une scène.
- Couleurs uniquement par tokens : porcelaine `--gc-porcelain` / `--gc-porcelain-shade`, filet `--gc-honey-500`,
  contour `--gc-ink` (3 px à 112 px, 1,5 px pour le bord intérieur), ombre portée `--gc-ink` à 13 %.
- Animations en `transform`, `opacity` (et `stroke-dashoffset` pour la vapeur), durées dérivées de `--gc-dur-dome` ;
  tout s'arrête avec `prefers-reduced-motion` (vapeur fixe).

## À faire / à éviter

- ✔ Une tasse par vidéo, posée sur la table à côté de l'écrin, jamais sur la vidéo.
- ✔ Choisir le liquide de l'invité (`video.liquid` du roster).
- ✘ Pas de pourcentage ni de barre à côté : la tasse suffit.
- ✘ Ne pas l'agrandir pour « mieux voir » au-delà de 120 px : elle concurrencerait la vidéo.
