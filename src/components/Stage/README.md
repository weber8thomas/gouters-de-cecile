# Stage

Scène fixe 1920 × 1080 du carnet projeté : une table (bois ou nappe en lin à carreaux vichy) éclairée par une lumière dorée de fin d'après-midi venant d'en haut à gauche, qui fournit aussi les réglages de scène à tous les composants.

## Props

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `table` | `'bois' \| 'nappe'` | réglage parent, sinon `'bois'` | Fond de scène : bois pour les pages vidéo, la couverture et la page finale ; nappe pour les recettes seules, les doubles recettes, les intercalaires et le sommaire. |
| `idle` | `'aquarelle' \| 'sepia'` | réglage parent, sinon `'sepia'` | Aspect des écrins avant lecture (sépia crayonné retenu). |
| `fit` | `boolean` | `false` | Met la scène à l'échelle de la largeur du parent (`transform: scale`, `ResizeObserver`) ; l'enveloppe `.gc-stage-fit` prend la hauteur mise à l'échelle. |
| `children` | `ReactNode` | — | Contenu de la scène, en général un `DoublePage`. |
| `overlay` | `ReactNode` | — | Calque au-dessus de tout, lumière comprise (navigation). Seuls ses enfants captent le pointeur. |
| `className` | `string` | — | Classe ajoutée à la racine `.gc-stage`. |
| `debord` | `number` | `0` | Débord de la table (px de scène, des quatre côtés) : la table et la lumière se prolongent hors de la scène 1920 × 1080 pour un écran d'une autre forme (composant `Ecran`, via `Livre`). Multiple de 48 px conseillé (phase du vichy). |

Exporte `StageProps`.

## Ce que fait la scène

- Taille `var(--gc-stage-w)` × `var(--gc-stage-h)`, `overflow: hidden`, `isolation: isolate`.
- Fournit `SettingsContext` : chaque prop absente reprend le réglage du contexte parent (donc `DEFAULT_SETTINGS` hors de tout fournisseur). Pose `data-gc-table` et `data-gc-idle` (`settingsAttrs`) sur sa racine, plus la classe `gc-stage--bois` ou `gc-stage--nappe`.
- **Bois** : texture pré-rendue `design-system/textures/wood.webp` (planches en `gc-wood-1/2/3`) + vignettage chaud vers `gc-wood-3`.
- **Nappe** : lin `linen.webp` (`gc-linen`, `gc-linen-shade`) + vichy en bandes croisées `repeating-linear-gradient` de `gc-terracotta-500` translucide (`color-mix`), cellule de 48 px, posée un peu de biais ; deux grands plis doux (`gc-paper-lace` côté fenêtre, `gc-chocolate` côté ombre).
- **Lumière** (au-dessus du contenu) : voile radial `var(--gc-glow)` à `var(--gc-glow-alpha)` depuis le haut à gauche, tache de soleil d'une fenêtre à croisillon (`gc-glow`, très légère), ombre chaude `gc-wood-3` dans le coin opposé.
- Ordre des calques : table → contenu → lumière → `overlay`.
- **Débord** (`debord > 0`, classe `gc-stage--debord`, variable `--gc-stage-debord`) : la scène ne rogne plus (`overflow: visible`) ; la table, le voile doré et l'ombre chaude s'étendent du débord, avec les mêmes dessins ancrés sur la scène en px (rien ne bouge dans les 1920 × 1080, tout se prolonge sans couture : bois et lin décalés du débord, dégradés linéaires repris en px de leur ligne d'origine). Sans débord, la scène est exactement celle d'avant.

## Règles d'usage

- Une seule `Stage` par écran ; le livre (`DoublePage`) se place dedans, positionné par `--gc-book-x` / `--gc-book-y`.
- Les composants lisent les réglages avec `useSettings()` ou `useTitleClass(role)`, jamais avec des props recopiées.
- Le voile doré éclaircit un peu l'encre dans le coin haut gauche (≈ 8:1 au lieu de 10:1 pour `gc-ink` sur `gc-paper`) : c'est voulu et mesuré. Ne pas ajouter d'autre voile par-dessus.
- Tout est statique : textures pré-rendues, dégradés et masques calculés une fois. Rien n'est animé.

## À faire

- Utiliser `fit` pour un aperçu dans une colonne étroite ; laisser la scène à 1:1 sur la TV.
- Placer la navigation dans `overlay` (cible `var(--gc-nav-size)`, opacité `var(--gc-nav-alpha)`).

## À éviter

- Poser du texte directement sur la table : le texte ne va que sur le papier, le lin ou la porcelaine.
- Ajouter `mix-blend-mode`, `backdrop-filter` ou un filtre animé sur la scène.
- Changer la taille de la scène : la géométrie vient des tokens `gc-stage-*`.
