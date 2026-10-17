# Stage

Scène fixe 1920 × 1080 du carnet projeté : une table en bois, un soir au coin du feu (plan v4). Une cheminée hors champ, **à gauche**, éclaire la table et le livre d'une lumière chaude qui vacille en direct. La scène fournit aussi les réglages de scène à tous les composants.

## Props (inchangées)

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `idle` | `'aquarelle' \| 'sepia'` | réglage parent, sinon `'sepia'` | Aspect des images figées avant lecture. |
| `distance` | `Distance` | réglage parent | Cran de distance (géométrie du livre, tailles de texte). |
| `fit` | `boolean` | `false` | Met la scène à l'échelle de la largeur du parent. |
| `children` | `ReactNode` | — | Contenu de la scène (le livre). |
| `overlay` | `ReactNode` | — | Calque au-dessus de tout, lumière comprise (navigation). Seuls ses enfants captent le pointeur. |
| `className` | `string` | — | Classe ajoutée à la racine `.gc-stage`. |
| `debord` | `number` | `0` | Débord de la table (px de scène) pour un écran d'une autre forme (`Ecran`). |

## Calques

Table (bois du soir) → **lumière de table** (`LumiereTable` : bain orangé côté feu, reflet sur le vernis, ombre portée du livre) → contenu → **ambiance et voile** (`LumiereLivre`) → `overlay`. Les contrôles de l'`Ecran`, la photo soulevée et le menu sont en portail hors de la scène : la lumière passe dessous.

- Le feu (`src/lib/feu.ts`) n'anime que l'opacité et la translation de **deux** calques (bain, voile) : 0 Layout, 0 Paint, +4 calques composités au plus (mesuré par `scripts/verify-lumiere.mjs`).
- Mouvement réduit ou réglage `feu: false` : la lumière reste chaude mais immobile.
- Rien ne capte le pointeur.
- Débord : tous les dessins sont ancrés sur la scène en px et se prolongent sans couture ; avec un débord, l'ambiance passe des bandes de bord (TV) à un vignettage elliptique.
- Loupe : la lumière est dans la scène, donc dans le calque de la loupe ; elle grossit avec la page (c'est la lumière posée sur la table et le papier, pas un filtre d'écran).

## À éviter

- Ajouter un autre voile clair sur le livre : le budget de contraste de l'encre (≥ 90 %) est partagé.
- `mix-blend-mode`, `backdrop-filter`, filtre animé.
