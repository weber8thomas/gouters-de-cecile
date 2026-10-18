# Reglages

Le menu de réglages du carnet (CONTRACT § 12) : un petit **engrenage tracé à l'encre** en haut à gauche de l'écran, et une **fiche bristol** glissée par-dessus le livre. La fiche est réglée de bleu pâle, avec une marge rouge et un coin un peu corné. Les libellés sont de la main de Cécile (Caveat) et le choix actif est **entouré au crayon**.

- **TV et ordinateur** : la fiche est posée à droite, un peu de travers (−1,2°). Son corps est de 38 px sur une TV 1080p (hauteur d'x de 14 px, le plancher de lecture à 3 m) et suit la taille de l'écran (`min(l/1920, h/1080)`, 80 px au plus en 4K).
- **Téléphone debout** (cadrage `page`, moins de 600 px de large) : une feuille monte du bas, sur toute la largeur. Les lignes font au moins 44 px et la feuille respecte l'encoche du bas. Une bande du livre reste visible en haut : la toucher referme la feuille.
- **Tablette, téléphone couché** : la fiche, au moins 21 px de corps au doigt. Elle défile si elle ne tient pas en hauteur.

```tsx
import { Reglages } from '…/components/Reglages';

<CameraProvider keyboard>
  <Ecran>
    <Livre spreads={spreads} index={i} onIndexChange={setI} keyboard />
    <Reglages
      invites={spreads.flatMap((s, k) => (s.titre ? [{ index: k, titre: s.titre }] : []))}
      onAller={setI}
    />
  </Ecran>
</CameraProvider>
```

Dans un `Ecran`, le bouton et la fiche sont rendus **en portail dans le calque des contrôles** (`useEcran().controles`, px d'écran, zones sûres) ; hors d'un `Ecran`, ils sont rendus en place, dans le parent positionné. `Reglages` doit être sous le `CameraProvider` du livre (cran et zoom).

## Props (`ReglagesProps`)

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `invites` | `{ index: number; titre: string }[]` | `[]` | Les invités de « Aller à… ». La ligne est masquée si la liste est vide. |
| `onAller` | `(index: number) => void` | — | Aller à la double page `index`. Le menu se referme. |
| `credits` | `ReactNode` | `CREDITS_REGLAGES` | Texte des crédits. Il remplace le texte par défaut, exporté pour qu'on puisse le reprendre et le compléter. |
| `cameraFixe` | `boolean` | déduit de l'écran | Masque « Taille du livre » et « Ajuster ». Par défaut, la valeur se calcule comme dans le livre : cadrage `page`, ou petit écran couché (`partScene < 1`). |
| `ouvertAuDepart` | `boolean` | `false` | Fiche ouverte dès le premier rendu, sans prendre le focus (cartes, captures). |

Le composant exporte aussi `ReglagesInvite` (type) et `CREDITS_REGLAGES` (texte par défaut).

## Lignes

| # | Libellé | Valeurs | Source | Masquée quand |
|---|---|---|---|---|
| 1 | Taille du livre | proche · moyenne · loin | `useCamera().setDistance` | la caméra est fixe |
| 2 | Ajuster | − réglette + et la valeur en % (pas 0,01, bornes `zoomBornes(cran)`, repère à 100 %) | `useCamera().setZoom` | la caméra est fixe |
| 3 | Loupe | − réglette + et la valeur en % (100 à 300 %, pas de 25 %, repère à 100 %) | `demanderLoupe(z)`, état `useLoupe()` (plan v4) | — : **sur tous les écrans**, téléphone compris |
| 4 | Plein écran | non · oui | Fullscreen API (appelée dans le geste) | l'API manque (iPhone, écran simulé) |
| 5 | Son des vidéos | coupé · avec son | `reglages.son` | — |
| 6 | Sons du livre | automatique · oui · non | `reglages.sonsLivre` : `null` · `true` · `false` (automatique : coupés sur téléphone, `sonsLivreEffectif`) | — |
| 7 | Volume | réglette 0 à 100 % (pas 5 %), atténuée quand le son des vidéos est coupé | `reglages.volume` (vidéos seules) | le volume des vidéos est en lecture seule (iOS : on écrit `volume` sur un `<audio>` jetable, puis on le relit) |
| 7 bis | Bruitages | réglette 0 à 100 % (pas 5 %, défaut 80 %), atténuée quand ni les sons du livre ni le feu et la cuisine ne sont actifs | `reglages.volumeBruitages` : pages, couverture, feuillets, photo, feu, cuisine (gain Web Audio, sans reconstruire le graphe) | — |
| 7 ter | Musique | réglette 0 à 100 % (pas 5 %, défaut 50 %), atténuée quand la musique est coupée, mais toujours réglable (le niveau attend le prochain départ) | `reglages.volumeMusique` (la musique de fond, toujours sous le feu) | — |
| 8 | Lancer la vidéo en arrivant sur la page | non · oui | `reglages.lectureAuto` | — |
| 9 | Vitesse des pages | vive · normale · lente | `reglages.vitesse` (règle `SPRINGS.paper`) | — |
| 10 | Moins d'animations | non · oui | `reglages.mouvementReduit` (lu par `useReducedMotion`) | — |
| 10 bis | Boutons | s'effacent · toujours visibles (« visibles » sur la feuille du téléphone) | `reglages.boutonsToujoursVisibles` (défaut : s'effacent ; lu par `src/lib/controles.ts`) | — |
| 11 | Aller à… | « choisir un invité », qui déplie les noms | `onAller(index)` | `invites` est vide |
| 12 | remettre les réglages par défaut · crédits | — | `resetReglages()`, puis la caméra revient à `moyenne` (`proche` au doigt, comme dans `Carnet`) et au zoom 1, et la **loupe à 1×** ; « crédits » déplie le texte | — |

La loupe n'est pas mémorisée (elle revient à 1× au rechargement). Au clavier, + / − règlent la loupe (paliers 1 · 1,5 · 2 · 3) ; les crans de distance (« Taille du livre ») ne se règlent plus que dans ce menu.

Les réglages sont mémorisés par `src/lib/reglages.ts` (clé `gc:reglages:v3`, repli sur v2 puis v1 ; la musique est coupée par défaut, le bouton musique de la barre la rallume) et la caméra par `src/lib/camera.tsx` (clé `gc:camera:v1`). Si le stockage est indisponible, les réglages restent en mémoire.

## Clavier

| Touche | Effet |
|---|---|
| `M` ou `,` | Ouvre la fiche. Le focus va sur la première ligne. |
| ↑ ↓ | Ligne précédente ou suivante. Une petite flèche de crayon la montre dans la marge. |
| ← → | Change la valeur : choix voisin, réglette ±1 pas, nom voisin dans la liste des invités. |
| Début, Fin | Réglette au minimum ou au maximum. |
| Entrée, Espace | Active le bouton qui a le focus (déplier, aller chez un invité, remettre par défaut…). |
| Tab, Maj + Tab | Passe d'un bouton à l'autre ; le focus reste dans la fiche. |
| Échap, Retour arrière, `M` | Ferme la fiche et rend le focus au bouton ⚙. Retour arrière sert en plein écran, où le navigateur garde Échap. |

Tant que la fiche est ouverte, elle seule reçoit les touches (`useClavierModal` de `src/lib/clavier.ts`) : le livre ne tourne pas et la caméra ne bouge pas. Un objet soulevé (lot S) qui tient le clavier l'emporte sur `M`.

## Au doigt et à la souris

Tout se fait avec des boutons natifs, sans survol : toucher un choix, faire glisser le pâté d'encre de la réglette (`touch-action: none` sur la réglette, la fiche défile verticalement), toucher le voile ou la croix pour fermer.

## Accessibilité

- Bouton : `aria-label="Réglages"`, `aria-haspopup="dialog"`, `aria-expanded`, `data-gc-reglages="bouton"`. Cible `--gc-ecran-cible` (≥ 44 px au doigt, 56 px sur la TV).
- Fiche : `role="dialog"`, `aria-modal="true"`, titrée par « Réglages », `data-gc-reglages="panneau"`.
- Choix : `role="radiogroup"` / `role="radio"` + `aria-checked`, avec un focus itinérant (seul le choix coché est atteint par Tab).
- Réglettes : `role="slider"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext` (« 104 % »).
- Listes dépliées : `aria-expanded` + `aria-controls`. « c'est fait » est annoncé (`role="status"`).
- Focus : `outline: 3px solid var(--gc-honey-500); outline-offset: 4px` sur `:focus-visible`.

## Mouvement

- **Ouverture et fermeture** : une seule MotionValue (0 → 1), sur le ressort `SPRINGS.settle`. La fiche glisse depuis la droite en se redressant un peu ; la feuille monte du bas ; le voile se fond. On n'anime que `transform` et `opacity`, et `will-change` n'est posé que pendant le mouvement.
- **Moins d'animations** (système ou réglage) : la fiche est posée et retirée d'un coup.
- **Changement de cran pendant que la fiche est ouverte** : le voile et la fiche portent un `view-transition-name`, si bien que la transition de vue du livre passe dessous.
- **Statique** : les tracés (engrenage, cercles de crayon, flèche de marge, réglette) sont des SVG en ligne, sans filtre ni mélange. Le papier est l'image cuite `paper/base`, posée par propriété personnalisée (aucune URL dans `bundle.css`).

## Attributs pour les tests

| Élément | Attribut |
|---|---|
| Bouton ⚙ | `data-gc-reglages="bouton"` (et `data-gc-controle="reglages"`) |
| Fiche | `data-gc-reglages="panneau"` |
| Une ligne | `data-gc-reglages-ligne="taille\|zoom\|loupe\|plein\|son\|sonsLivre\|volume\|volumeBruitages\|volumeMusique\|auto\|vitesse\|mouvement\|aller\|invites\|fin"` |
| Racine | `data-gc-reglages-etat="ferme\|ouvert\|fermeture"` |
| Réglette | `data-gc-reglette` (`role="slider"`) |

## Vérifier

```
node scripts/build-bundle.mjs --only Reglages,Ecran,Livre,Stage,DoublePage,Page,PageCuite --boards Carnet --tag r
node scripts/shot.mjs src/components/Reglages/preview.html --bundle dist/ds-r/components --out verification/out/r
node verification/out/r/verifier-reglages.mjs     # iPhone 13 debout et TV 1080p, puis d'autres écrans en captures
```
