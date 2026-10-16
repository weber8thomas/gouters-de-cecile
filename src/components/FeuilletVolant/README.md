# FeuilletVolant

La suite d'une recette trop longue, écrite sur une **feuille de cahier glissée dans le carnet** (CONTRACT § 12). Dans la page, on n'en voit que **le coin qui dépasse** : la page cuite du recto, à l'échelle de la page, de travers, découpée par sa zone, avec une ombre fine. Au toucher, en glissant vers le haut ou avec ↑, la feuille **se soulève** (`Soulever`, même mécanique que la photo) ; on la retourne (recto / verso) au toucher ou avec ← →.

```tsx
import { FeuilletVolant } from '…/components/FeuilletVolant';

<PageCuite page="lisa-droite" slots={{ volant: <FeuilletVolant recto="lisa-feuillet-recto" verso="lisa-feuillet-verso" angle={5} /> }} />
```

## Props (`FeuilletVolantProps`)

| Prop | Type | Rôle |
|---|---|---|
| `recto` | `string` | Page cuite du recto (manifeste des pages). |
| `verso` | `string \| null` | Page cuite du verso, s'il y en a un. |
| `angle` | `number` | Inclinaison de la feuille (degrés). Défaut : tirée de la graine, 3,5° à 6,5° (vers la droite le plus souvent). |
| `coin` | `[number, number]` | Coin haut gauche de la feuille dans la zone, en fractions de la zone. Défaut : `[0.1, 0.16]`. |
| `graine` | `number` | Graine de l'inclinaison par défaut. |

## Anatomie

```
.gc-feuillet-volant                      remplit la zone « volant », overflow: hidden (la découpe)
│                                        data-gc-objet="feuillet", data-gc-controle, data-gc-objet-mode
└─ .gc-feuillet-volant__feuille          la feuille entière (taille du manifeste, à l'échelle de la page :
   │                                     var(--gc-page-w/h) × taille / 850 × 960), rotate(angle) autour
   │                                     de son coin haut gauche, ombre fine
   └─ PageCuite page={recto}
```

- Taille de la feuille : `taille: [w, h]` de la page de feuillet dans le manifeste (lot B), sinon celle d'une page. L'écriture a donc la même taille que dans la page.
- **Zone `volant` (lot B)** : la poser **contre le bord extérieur et le bas** de la page droite (la feuille semble continuer sous la tranche), dans un blanc sans encre, sans le folio. Le coin (défaut `[0.1, 0.16]` de la zone) montre le début du recto : « (suite) », le titre… Un tiers de la page en hauteur et la moitié en largeur suffisent.
- Soulevée (`data-gc-souleve`) : la feuille passe à l'opacité 0 dans la page quand la feuille entière est apparue au-dessus (à `p = 0,2`).

## Interaction (mode `live` seulement)

- `data-gc-controle` : le livre ne s'occupe pas des gestes qui partent du coin (un glisser horizontal sur le coin ne tourne pas la page).
- **Toucher** (moins de 10 px et de 600 ms) ou **glisser vers le haut** (au-delà de 30 px, plus vertical qu'horizontal) : la feuille se soulève (pointer events, capture du pointeur).
- **Clavier** : focusable (`role="button"`, libellé « Feuillet volant : la suite de la recette… »), Entrée, Espace ou ↑ ; `souleverObjet('feuillet')` pour la touche ↑ du livre.
- Une fois soulevée : toucher la feuille ou ← → la retournent ; Échap, ↓, Retour arrière ou un toucher hors de la feuille la reposent.
- Mode `static` : ni focus ni écouteur, `aria-hidden`.

## À éviter

- Une zone `volant` au milieu de la page : la découpe se verrait (la feuille doit sembler sortir de sous le bord).
- Changer la taille de la feuille à la main : elle vient du manifeste.
