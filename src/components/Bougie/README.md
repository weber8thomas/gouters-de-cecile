# Bougie

Une petite source de lumière chaude, presque hors champ : une bougie sombre, coupée par le bord bas de l'écran, dans le coin droit de la table, à l'écart du livre. On devine la bougie ; on voit surtout sa **flamme** et sa **lueur**, qui dansent sur la table et un peu sur le bas de la page droite. Le corps de la cire et le bougeoir restent dans la pénombre. Montée dans `Stage`, au-dessus de la table et du livre, sous les contrôles. Elle ne passe jamais devant le texte du livre.

## Props

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `className` | `string` | — | Classe ajoutée à la racine `.gc-bougie`. |

## Position et taille

Position fixe dans la scène 1920 × 1080 : axe de la bougie à x = 1760 px, plateau à y = 1120 px (sous le bord bas, qui coupe le bougeoir). La pose est mise à l'échelle `--gc-bougie-k` (0,36) ; la flamme visible ne dépasse pas ≈ 135 px de haut, soit environ 1/8 de l'écran. Le livre (cran « proche », carton compris : x ≤ 1686) reste à gauche de la bougie ; aucune partie de la bougie ne recouvre le texte.

## Calques

| Calque | Source | Animation |
|---|---|---|
| Lueur | dégradé radial CSS (décroissance progressive, sans bord net), centré sur la flamme | opacité (`intensite`), échelle légère |
| Cire, bougeoir, ombre portée | `design-system/baked/bougie/bougie.webp` (cuite, assombrie) | aucune |
| Flamme orangée | `flamme-corps.webp` | échelle (`intensite`), opacité, balancement ≈ ± 3° (0,22 × `dx`) |
| Cœur bleu-blanc | `flamme-coeur.webp` | échelle et opacité plus discrètes, balancement ≈ ± 1,2° |

Toutes les animations passent par `transform` et `opacity`. Aucun filtre (CSS ou SVG) ni `mix-blend-mode` à l'exécution. Les images sont cuites par `python3 -I scripts/bake-bougie.py` (PIL) ; `ECHELLE` du script doit rester égal à `--gc-bougie-k`.

## Mouvement réduit et téléphone

- Mouvement réduit (système ou réglage du carnet) ou réglage `feu: false` : la flamme reste fixe (intensité 1, pas de balancement) ; le moteur du feu s'arrête dans ce cas.
- Téléphone en portrait (`orientation: portrait` et largeur ≤ 760 px) : la bougie est masquée, on ne garde que la lueur.

## À éviter

- Éclaircir le corps de la bougie ou agrandir la pose : elle doit rester une source devinée.
- Ajouter un filtre ou un `box-shadow` animé : le budget de calques de la scène est compté (`scripts/verify-lumiere.mjs`).
- Déplacer la bougie sur le livre : elle doit rester à droite du carton.
