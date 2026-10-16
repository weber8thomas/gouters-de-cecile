# Livre

Le carnet qui se feuillette : un livre ouvert posé sur la table, dont les pages tournent comme une vraie feuille de papier épais (courbure, ombrage, ombre portée), qui s'ouvre depuis sa couverture cartonnée, et dont la caméra se règle au clavier (3 crans de distance + zoom fin). Clavier, doigt, stylet ou souris ; deux flèches discrètes. Seul, il rend la scène TV 1920 × 1080 ; dans un `<Ecran>`, il s'adapte à tous les écrans (voir « Tous les écrans »).

## Utilisation

```tsx
import { Livre, CameraProvider } from '…/components/Livre';

function Carnet({ spreads }: { spreads: SpreadSpec[] }) {
  const [i, setI] = React.useState(-1); // −1 : livre fermé sur sa couverture
  return (
    <CameraProvider keyboard>
      <Livre spreads={spreads} index={i} onIndexChange={setI} keyboard cover={<Etiquette />} />
    </CameraProvider>
  );
}
```

`Livre` rend sa propre `<Stage>` (1920 × 1080) : ne pas l'envelopper dans une autre scène.

## Props (`LivreProps`)

| Prop | Type | Rôle |
|---|---|---|
| `spreads` | `SpreadSpec[]` | Les doubles pages, dans l'ordre (`src/lib/spread.ts`). |
| `index` | `number` | Double page affichée (0 = la première). Avec `cover`, `−1` = livre fermé. Un changement venu du parent lance le geste vers ce nouvel index. |
| `onIndexChange` | `(i) => void` | Appelé **à la fin** du geste, quand une double page est atteinte. L'écho de cette valeur par le parent est ignoré (il n'écrase pas une cible plus lointaine). |
| `keyboard` | `boolean` | Écoute ←/→, PageUp/PageDown, Début/Fin (voir plus bas). |
| `cover` | `ReactNode` | Contenu du plat de couverture (étiquette). Le livre s'ouvre depuis lui. |
| `className` | `string` | Classe ajoutée à la racine `.gc-stage`. |
| `pose` | `{ vers: number; p: number }` | Fige un geste (aperçus, captures à mi-geste) : vers la double page `vers`, avancée `p` de 0 à 1. Ni mouvement ni clavier. |
| `coteInitial` | `'gauche' \| 'droite'` | Cadrage « page » (dans un `Ecran` en portrait) : page cadrée au départ. Défaut : `gauche`. |
| `onToucherPage` | `(t: ToucherPage) => boolean \| void` | Toucher (ou clic) sur une page sans glisser : `{ spreadId, side, x, y, cible }` (x, y en fractions de la page). Renvoyer `true` consomme le toucher (pas de navigation par la marge). Appelé **dans** le geste (`play()` y est permis sur iOS). |
| `gestes` | `boolean` | Gestes au pointeur (glisser, toucher). Défaut : `true`. |

Exporte `Livre`, `LivreProps`, `LivrePose`, `CotePage`, `ToucherPage`, et ré-exporte `CameraProvider`, `useCamera`, `CameraProviderProps` de `src/lib/camera.tsx` (absents de `src/index.ts`).

## Touches

| Touche | Effet |
|---|---|
| → · PageDown | double page suivante (télécommandes de présentation : PageDown) |
| ← · PageUp | double page précédente |
| Début | revient au début (referme le carnet s'il a une couverture) |
| Fin | dernière double page |
| + / − | cran de caméra plus proche / plus loin (`CameraProvider keyboard`) |
| ↑ / ↓ · Alt + « + » / « − » | zoom fin ± 1 % (95 % – 105 %) |
| 0 | zoom fin à 100 % |

Les répétitions d'une touche maintenue sont ignorées ; Ctrl/Cmd/Alt + flèche est laissé au navigateur. Les deux flèches de la table sont des `<button>` (Entrée/Espace), anneau `:focus-visible` miel, aucun survol. En cadrage « page », ← / → et les flèches avancent d'**une page** (gauche → droite → gauche suivante).

## Gestes (doigt, stylet, souris — Pointer Events)

| Geste | Effet |
|---|---|
| Glisser horizontalement | La feuille suit le doigt : `p` = déplacement ÷ largeur de page à l'écran, amorti au-delà de 0 et 1 (`pElastique`). Au lâcher, le ressort `SPRINGS.paper` repart **avec la vitesse du doigt** ; la page tourne si `p` a franchi 0,35 (depuis son départ) ou si le geste est vif (≥ 1 largeur de page par seconde). |
| Glisser sur la page gauche vers la gauche (cadrage « page ») | La caméra glisse vers la page droite (suit le doigt, amortie aux bornes ; même règle 0,35 / geste vif, ressort `SPRINGS.camera`). Symétrique sur la page droite vers la droite. |
| Glisser en butée (première ou dernière page) | Le livre résiste : il glisse un peu sur la table (`rebond`, amorti) et revient sur `SPRINGS.settle`. |
| Toucher la couverture fermée | Elle s'ouvre. |
| Toucher une page | `onToucherPage` puis l'événement `gc-livre-toucher` (en bulle, annulable) sur l'élément touché : la double page s'en sert (lecture / pause). |
| Toucher la marge extérieure (12 % de la page) | Page précédente / suivante (en cadrage « page » : bord gauche / droit de la page cadrée). |
| Glisser vertical, appui long, pincement | Rien (le pincement du navigateur reste permis). |

- Toucher / glisser : seuil de 8 px ; un toucher dure moins de 600 ms. Dès 4 px horizontaux, le sens est connu et le **feuillet est monté** (préparation, comme au clavier) : il est prêt quand le glisser commence ; un simple toucher ne monte rien (la page vivante, vidéo comprise, n'est jamais remplacée par sa copie figée). Le doigt pilote `p` tout de suite, sans attendre la cadence stable.
- Un geste clavier en cours : le doigt **rattrape** le ressort (il reprend `p` où il en est) ; un toucher de marge le relance comme un appui rapide. Pendant que le doigt tient la feuille, le clavier est ignoré.
- `touch-action` : `pinch-zoom` dans un `Ecran` (aucun défilement), `pan-y pinch-zoom` seul (la carte vit dans une page qui défile). Pas de sélection de texte, de glisser d'image ni de menu d'appui long ; le clic qui suit un glisser est avalé (souris, clic fantôme).
- Moins de mouvement : un glisser fait page suivante / précédente en fondu (aucun feuillet).

## Tous les écrans (dans un `<Ecran>`)

```
Ecran (.gc-ecran, plein écran ; contexte : fenêtre, cadrage, calque des contrôles)
├─ .gc-livre-ecran            surface des gestes (tout l'écran)
│  └─ .gc-livre-monde         translate + scale (écran ← scène), origine 0 0 ; calque composité en cadrage page
│     └─ Stage debord=…        table et lumière prolongées hors de la scène
│        └─ Camera …          (inchangé ; zoom fin = 1 quand la caméra est fixe)
└─ .gc-ecran__controles       px d'écran : flèches, points de page, repère (portail du livre), plein écran
```

- **Cadrage** (`useViewport().cadrage`, `src/lib/viewport.ts`) : `double` → `cadrerDouble` (la scène du cran en « contain » ; sur un petit écran, le livre seul, cartons compris) ; `page` → `cadrerPage` (une page + 3 %, la plus grande possible dans la zone sûre).
- **Caméra fixe** (cadrage `page`, ou `double` sur un écran dont le côté court est < 720 px) : la page ou le livre remplit déjà l'écran, le cran ne change plus le cadrage. La mise en page est alors celle du cran **« loin »**, dont la hauteur d'x est la plus grande par rapport à la page (15 px pour 750 px de large, contre 15 pour 896 au cran proche : +19 % à l'écran) ; zoom fin à 1, pas de repère de distance. Les crans et le zoom fin ne servent que sur un grand écran (tablette couchée, ordinateur, TV).
- **Position** = (double page, côté). Au repos, la caméra (abscisse de scène) est la MotionValue `glisse` : centre de la page cadrée. Suivant : gauche → droite (glissement `SPRINGS.camera`) ; droite → la feuille tourne et **la caméra suit la feuille** : `x = x₀ + (x₁ − x₀)·(1 − cos πp)/2` (le centre apparent de la feuille), dérivé de `p` par `useTransform`, de la page quittée (`coteLo` à p = 0) à la page d'arrivée (`coteHi` à p = 1). Précédent : symétrique. Un ressort relancé vers l'autre sens ramène aussi la caméra : tout est fonction de `p`.
- **Couverture** en portrait : la caméra cadre le plat (centre du livre fermé, sur la reliure), puis suit l'ouverture jusqu'à la page gauche de la première double page.
- Le **monde** (scène + table) est translaté : la table bouge avec le livre (vraie caméra). En cadrage page il est composité en permanence (`will-change: transform`), retiré puis remis à chaque changement d'échelle (rotation) pour être rastérisé net. Translation au pixel physique (`auPixel`), échelle à 4 décimales.
- **Rotation** : la double page et la page restent ; le changement de mise en page qui l'accompagne (caméra fixe ↔ libre) s'applique tout de suite, sans transition de vue.
- **Contrôles** : flèches en bas à droite (`place="coin"`, comme sur la TV) ou, sur un téléphone couché, une de chaque côté du livre (`place="cotes"`) ; deux points de page (cadrage page, boutons) ; repère de distance (quand les crans servent) à l'échelle de l'écran. Cibles `--gc-ecran-cible` (≥ 44 px au doigt).
- Attributs de test sur `.gc-livre-ecran` : `data-gc-cadrage`, `data-gc-double`, `data-gc-cote`.
- Événements : `gc-livre-geste` gagne les types `glisse` (caméra d'une page à l'autre) et `rebond` (butée au doigt).

## Architecture du tourne-page

```
Stage (cran, table en bois ; overlay : repère + flèches)
└─ Camera  .gc-livre-camera   scale(zoom) sur SPRINGS.camera ; porte --gc-livre-perspective
   └─ .gc-livre               position du livre (--gc-book-x/y), 2 × --gc-page-w
      ├─ .gc-livre__corps     ombres, cartons, tranches, emplacements fixes, filet, ombres portées
      └─ .gc-livre__espace    perspective 10 W (couverture : 20 W), point de fuite au centre de la scène
         └─ Feuillet | FeuilletCouverture
```

- **Emplacements fixes** : chaque double page montée pose sa page gauche et sa page droite dans deux emplacements ; une seule de chaque côté est visible. Pendant un geste entre les doubles pages `lo` < `hi` : à gauche `L(lo)`, à droite `R(hi)`.
- **Feuillet** : recto = `R(lo)`, verso = `L(hi)`. En avançant, `p` va de 0 à 1 ; en reculant, de 1 à 0 (« arrière : sens inverse »). Un saut (Début/Fin, appuis rapides) tourne **une seule** feuille de `lo` à `hi`.
- **Courbure** : 3 segments emboîtés (0–20 %, 20–55 %, 55–100 % de la largeur), chacun tourné par rapport au précédent (`transform-origin` sur sa jointure) et ré-affichant la même page découpée (`.gc-livre-feuillet__decoupe`). Angle absolu du segment k : `−180·p + w_k·sens·κ·sin(πp)` avec κ = 28°, w = (−0,2 ; 0,3 ; 1) : la reliure est un peu en retard, le bord libre mène. Le dépassement du ressort soulève légèrement le bord (coussin d'air) au lieu de traverser la page.
- **Ombrage** : lumière en haut à gauche (Lambert). Chaque face porte deux voiles en dégradé (côté reliure, côté bord libre) dont les opacités valent l'ombrage des **jointures** qui la bordent : ombrage continu, sans facettes. Recto qui se tourne vers la fenêtre : voile porcelaine (≤ 30 %) ; verso qui lui tourne le dos : ombre chaude sépia-chocolat (≤ 38 %) ; liseré clair au pli de la charnière.
- **Ombres portées** : sur la page découverte, une ombre qui naît sous le bord apparent du feuillet (projection en perspective de `Σ w_k·W·cos θ_k`) et s'étire vers la droite, opacité `sin(πp)·0,35` ; sur la page bientôt recouverte, une pénombre étroite en seconde moitié.
- **Couverture** : même moteur, ressort `SPRINGS.cover`. Le carton est un plan unique (recto et verso mis à plat dedans) qui descend de l'épaisseur pendant la rotation, plus un **chant de 10 px** (`--gc-livre-epaisseur`) qu'on voit quand il se dresse. Le contreplat porte la page gauche de la première double page. Perspective plus plate que pour le papier (`--gc-livre-perspective-couverture`, 20 largeurs de page). Mouvement de caméra : livre fermé centré → cadrage ouvert, et **recul calculé** (`reculCouverture`, d'après le cran et le zoom fin lus avant le geste) : quand la couverture se dresse, la caméra recule juste assez pour qu'elle ne dépasse jamais sa taille au repos (≤ 1 074 px de haut au cran proche à 105 %). L'ombre du livre fermé, plus dense, s'allège.
- **Une seule MotionValue `p`** pilote tout via `useTransform` (rotations, voiles, visibilité des faces, ombres, mouvement de caméra de l'ouverture) : **aucun rendu React pendant le geste**. Les rendus n'ont lieu qu'à la préparation (montage du feuillet) et à l'atterrissage.
- **Moteur** : une cible (`index` ou clavier). Appui pendant un geste → si la cible change de côté, le ressort est **relancé** vers 0 ou 1 en gardant sa vitesse ; sinon le geste continue et, à l'atterrissage, un seul nouveau geste va directement à la cible (pas de pile). La couverture s'ouvre toujours sur la première double page (et s'y referme).
- **Pré-rendu** : la double page affichée (`live`) et ses voisines −1 / +1 (`static`, `RenderModeContext`) restent montées et mises en page, invisibles. Avant de lancer un geste : `img.decode()` + `document.fonts.ready` (300 ms au plus), puis attente d'une **cadence stable** (≥ 5 images dont 3 régulières) : les calques du feuillet sont rastérisés avant le mouvement, jamais pendant.
- **Caméra** : le cran (`useCamera().distance`) est passé à `<Stage distance>` (vraie mise en page) via `document.startViewTransition(() => flushSync(…))` ; le livre et ses deux pages visibles portent `gc-livre`, `gc-livre-gauche`, `gc-livre-droite` le temps de la transition (glissement sur la courbe `--gc-spring-camera`, fondu des images deux fois plus court). Repli sans View Transitions : fondu sortant/entrant sur `SPRINGS.camera`. Le zoom fin est un `scale` de la caméra sur `SPRINGS.camera`, sans mise en page.
- **Table** : toujours le bois (plan v3) ; elle ne change jamais d'une double page à l'autre.
- **Repère** : étiquette `gc-hand-caption` (`--gc-ink` sur `--gc-paper-lace`, ombre `--gc-sh-lift`), posée de biais en bas à gauche : « loin · 97 % », apparaît au réglage et s'efface en 1,5 s.
- **Moins de mouvement** (`prefers-reduced-motion`) : aucun feuillet, aucune courbure ; changement de page en fondu enchaîné court (transition de vue, 250 ms) ; zoom fin immédiat.

## Contrat des faces

- Une face = `.gc-livre-face` : surface `var(--gc-paper)` + `<Page side>` avec le contenu de `spread.render(mode)[side]` + folio (`gc-folio`) + ombre de pli vers la reliure (`.gc-livre-face__pli`). La même face sert aux emplacements et, en copies découpées, au feuillet.
- Le feuillet et les voisines sont rendus en mode **`static`** : aucune vidéo, aucun mouvement, images cuites seulement. La double page affichée est en `live` et le reste pendant le geste (sa page qui tourne est remplacée par une copie statique).
- `render(mode)` peut être appelé plusieurs fois (jusqu'à 4 copies pendant un geste) : il doit être pur et bon marché. Les `<img>` doivent pouvoir être décodées (`decode()`).
- Le contenu ne doit pas porter de `view-transition-name` ni de `will-change` permanent.

## Règles de performance (mesurées, voir `scripts/fps.mjs`)

- Pendant un geste : `transform` et `opacity` seulement, sur des calques déjà composités ; **0 Layout, ≤ 4 Paint**.
- `will-change` seulement pendant un geste (feuillet monté le temps du geste ; attributs `data-gc-geste` / style en ligne pour la caméra et la couverture).
- **Jamais d'opacité 0 sur un calque qui va servir** : une face cachée ou un voile éteint garde 0,002 (imperceptible), sinon le navigateur ne le rastérise qu'en plein geste. Pour la même raison, pas de `backface-visibility` : la face qui tourne le dos passe à 0,002 au passage des 90°, quand elle est vue par la tranche.
- Les voiles sont des **frères** coplanaires des faces, pas leurs enfants : une face à opacité variable contenant des calques imposerait une passe hors écran à chaque image.
- Pas de tri 3D entre plans non coplanaires qui se touchent (carton + chant dans un même contexte 3D) ; ne pas transformer le parent commun du corps et de l'espace 3D (il faudrait aplatir tout le livre à chaque image) ; les ombres portées ne font que glisser (une échelle changerait leur zone de découpe et forcerait une repeinture).
- Perspective du papier = 10 largeurs de page (≈ 8 500 px au cran moyen) : à mi-geste, le bord libre ne grandit que de 11 % (mesuré ×1,108) ; à 2 400 px il grossissait de 50 % et sortait de la scène. Le relief que la perspective n'apporte plus est porté par l'ombrage (voiles 30 % / 38 %) et l'ombre portée.
- ≤ 40 calques (37 au plus mesurés pendant un tourne-page).
- Chaque geste émet `gc-livre-geste` (`{ phase: 'prepa' | 'debut' | 'fin', type: 'page' | 'couverture' | 'zoom' | 'distance' | 'fondu' | 'glisse' | 'rebond' }`), en bulle jusqu'au document.
- Au doigt, aucun rendu React pendant le glisser : le feuillet est monté à l'amorce (4 px), puis `p.set()` à chaque `pointermove` ; le lâcher relance le ressort (aucun rendu non plus).

## Vérifier

```
node scripts/build-bundle.mjs --only Livre,Stage,Ecran,DoublePage,Page --boards Carnet,Formats,DemoCarnet --tag r1
node scripts/shot.mjs src/components/Livre/preview.html --bundle dist/ds-r1/components --out verification/out/r1
node scripts/fps.mjs --bundle dist/ds-r1/components --out verification/out/r1/fps   # turn, open, camera, zoom, reduit
node scripts/verify-devices.mjs   # téléphones, tablettes, ordinateurs, TV : cadrage, zones sûres, cibles, hauteur d'x, gestes
```

Banc d'essai : `harness/motion.html?scenario=turn|open|camera|zoom|pose` (`&index=`, `&vers=`, `&p=`, `&distance=`).

## À éviter

- Rendre une page dans un `Livre` qui dépend de sa taille réelle au moment du geste (tout est mis en page avant).
- Ajouter une ombre en `box-shadow` animé, un filtre ou un `mix-blend-mode` sur une face.
- Envelopper `Livre` dans une `Stage` ou un parent transformé pendant un geste.
