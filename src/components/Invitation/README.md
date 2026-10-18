# Invitation

L'**invitation à ouvrir** le carnet (plan v4, CONTRACT § 13.4) : sur le tiers bas de la couverture fermée, une étiquette écrite au crayon qui dit comment ouvrir, selon la façon dont la personne touche le carnet :

| Modalité | Étiquette cuite (lot C) | Quand |
|---|---|---|
| `toucher` | `indices/toucher` « touchez pour ouvrir » | doigt ou stylet (`pointerdown` tactile) ; départ sur `(pointer: coarse)` |
| `cliquer` | `indices/cliquer` « cliquez pour ouvrir » | souris ; départ sur `(pointer: fine)` |
| `entree` | `indices/entree` « appuyez sur Entrée pour ouvrir » | clavier ou télécommande ; départ sans pointeur (TV) |

La dernière entrée l'emporte (`useModalite()`, `src/lib/modalite.ts`). Rien que des `<img>` : aucun texte en police web sur la couverture. **Tant que les étiquettes cuites n'existent pas, rien n'est affiché.**

```tsx
import { InvitationOuvrir } from '…/components/Invitation';

// Dans la couverture (lot A) : 1 couverture fermée, 0 ouverte (la même MotionValue que l'ouverture).
<div className="gc-livre__invitation"><InvitationOuvrir opacite={invitation} /></div>
```

## Props (`InvitationOuvrirProps`)

| Prop | Type | Rôle |
|---|---|---|
| `opacite` | `MotionValue<number>` | Opacité d'ensemble, menée par le Livre (1 : fermé, 0 : ouvert). Défaut : 1. À 0, la respiration s'arrête. |
| `modalite` | `'toucher' \| 'cliquer' \| 'entree'` | Impose la modalité (cartes, tests). Défaut : `useModalite()`. |
| `etiquettes` | `Partial<Record<Modalite, string>>` | URL qui remplacent les images cuites (en attendant le lot C, ou pour une carte). |
| `className` | `string` | Classe en plus sur la racine. |

## Comportement

- **Taille** : l'étiquette prend toute la largeur de son conteneur, à la proportion de l'image cuite (`aspect-ratio` d'après `assetInfo`). C'est au Livre de lui donner sa place (tiers bas du plat, environ 55 % de sa largeur) ; elle ne prend aucun geste (`pointer-events: none`) : le toucher va à la couverture.
- **Respiration** : opacité de l'image entre 0,94 et 0,64, aller-retour en 5,2 s (`easeInOut`), un `animate` en boucle **joué par le compositeur** (WAAPI, pas de `repeatType: 'mirror'`), `will-change: opacity` seulement pendant la boucle. Opacité de repos : 0,82.
- **Arrêt** : quand `opacite` passe sous 0,01 (couverture ouverte), la boucle s'arrête et les styles en ligne sont retirés ; elle reprend quand la couverture se referme.
- **Mouvement réduit** (`useReducedMotion()` : système ou réglage) : aucune respiration, opacité fixe 0,82.
- **Changement de modalité** : les deux autres étiquettes sont décodées d'avance, l'image change sans clignoter.
- **Accessibilité** : décorative (`aria-hidden`, `alt=""`). La couverture porte son propre libellé (« Ouvrir le carnet »), lot A.

## Attributs (tests)

`data-gc-invitation="toucher|cliquer|entree"` sur la racine, `data-gc-reduit` en mouvement réduit.

## À éviter

- Écrire « touchez pour ouvrir » en police web : l'étiquette est cuite au crayon (lot C).
- La placer hors de la couverture, ou la laisser visible le livre ouvert (`opacite` à 0).
- Animer autre chose que l'opacité.

## Invitation à tourner le téléphone (`InvitationTourner`)

Téléphone debout (cadrage `tourner`, `src/lib/viewport.ts`) : on ne lit pas une page seule, le carnet reste fermé sur la table et le Livre pose, à la place des flèches et sous le livre, un petit téléphone dessiné à la craie (couleur dentelle) qui pivote d'un quart de tour au-dessus de deux lignes de la main de Cécile : « Tournez le téléphone / pour ouvrir le carnet ». Hors de la couverture : du texte en Caveat (comme la loupe), pas d'étiquette cuite.

- Props : `opacite?` (MotionValue, menée par le Livre comme l'invitation à ouvrir), `part` (part du bas de la zone sûre, `PART_INVITATION`).
- Le pivot est une boucle WAAPI de `transform` seul (compositeur), lancée tant que l'invitation se voit ; « Animations : réduites » : le téléphone est simplement penché. Elle ne prend aucun geste.
- Attribut de test : `[data-gc-tourner]`.
