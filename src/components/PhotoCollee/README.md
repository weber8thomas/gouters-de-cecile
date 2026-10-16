# PhotoCollee

La vidéo d'un invité, posée dans la page comme une **photo collée** (CONTRACT § 12) : un tirage sépia à bord blanc, un peu de travers, tenu par des coins photo ou du scotch jauni, avec un **▶ discret à l'encre** sur sa marge blanche. Au toucher, au clic ou à Entrée, elle **se soulève** (`Soulever`) : le tirage quitte la page, les coins restent.

```tsx
import { PhotoCollee } from '…/components/PhotoCollee';

<PageCuite page="lisa-gauche" slots={{ photo: <PhotoCollee video={VIDEOS.lisa} graine={7} /> }} />
```

Elle se pose dans la zone `vivants.photo` d'une `PageCuite` (aucune encre dessous) et y prend **le plus grand tirage qui tient**, coins compris, une fois tourné (centré, `container-type: size`).

## Props (`PhotoColleeProps`)

| Prop | Type | Rôle |
|---|---|---|
| `video` | `VideoInfo` | `{ id, titre, video, affiche, tirage, coins, angle?, duree? }` + `geometrie?` (cuite par le lot V : `{ id, ...videos[id] }`) : noms logiques d'`assetUrl()` (ou URL directes pour les essais). Voir « Tirage : géométrie » dans le README de `Soulever`. |
| `graine` | `number` | Inclinaison si `video.angle` manque : 1,2° à 3,4° d'un côté ou de l'autre. Défaut : 1. |
| `onSoulever` | `(source: HTMLElement) => void` | Remplace le soulèvement par défaut (`soulever({ type: 'photo', video, source })` du `SoulevementProvider`). Appelé dans le geste. |

## Anatomie

```
.gc-photo-collee                         remplit la zone, container-type: size, centre le tirage
└─ .gc-photo-collee__photo               LE PAPIER du tirage (boîte mesurée quand il se soulève) :
   │                                     data-gc-objet="photo", data-gc-objet-mode="live|static",
   │                                     rotate(--gc-pc-angle), aspect-ratio du papier
   ├─ img.gc-photo-collee__tirage        tirage sépia à bord blanc, marge transparente comprise (déborde
   │                                     du papier) ; ombre de contact cuite (V) ou CSS statique
   ├─ img.gc-photo-collee__lire          ▶ à la plume sur la marge du bas (SVG en data URI, jeton --gc-ink)
   └─ img.gc-photo-collee__coins         coins ou scotch, même cadre que le tirage
```

- **Rien que des `<img>`**, identiques en mode `live` et `static` (copies du tourne-page) ; décodées avec la peinture (`decoding="sync"`, le `Livre` les pré-décode).
- Soulevée (`data-gc-souleve` posé par le provider) : le tirage et le ▶ passent à l'opacité 0 (une repeinture au départ, une au retour) ; les coins restent sur la page.

## Interaction (mode `live` seulement)

- **Toucher / clic** : l'événement `gc-livre-toucher` du `Livre` (émis dans le geste) ; la photo se soulève et l'annule (pas de navigation par la marge). Elle ne porte **ni `data-gc-controle` ni `role="button"`** : le livre la traiterait comme un contrôle et un glisser horizontal qui part d'elle ne tournerait plus la page.
- **Clavier** : focusable (`tabIndex=0`, `role="img"`, libellé « Photo : <titre>. Entrée pour regarder la vidéo. ») ; Entrée ou Espace la soulèvent ; anneau miel en `:focus-visible`.
- **Demande** : `souleverObjet('photo')` (Entrée du livre) lui envoie l'événement `gc-soulever`.
- Mode `static` : ni focus, ni écouteur, `aria-hidden`.

## À éviter

- La poser hors d'une zone `vivants` (il y aurait de l'encre dessous) ou dans une zone trop étroite pour sa proportion (elle rapetisse pour tenir).
- Lui ajouter `data-gc-controle`, un rôle de bouton ou un `<video>` : la vidéo vit dans le calque du `SoulevementProvider`.
