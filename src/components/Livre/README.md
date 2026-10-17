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
| `arrivee` | `true \| { vers: number; cote?: 'gauche' \| 'droite' }` | **Plan v4.** Au montage, le livre glisse sur la table et se pose (`true`). Avec `vers` (lien profond, QR de l'A5) : il arrive, s'ouvre, puis feuillette jusqu'à cette double page (≈ 2,1 s). Un toucher ou une touche saute à la fin (fondu de 150 ms) ; onglet caché : tout est sauté. Sautée en mouvement réduit ou si la page a mis plus de 1,5 s à se charger (`window.__gcArriveeToujours = true` l'impose : bancs de mesure). Attribut `data-gc-arrivee="en-cours\|fini"` sur `.gc-livre`. |
| `invitation` | `(opacite: MotionValue<number>) => ReactNode` | **Plan v4.** L'invitation à ouvrir du lot S (`(o) => <InvitationOuvrir opacite={o} />`), posée sur le tiers bas de la couverture fermée. Le livre en pilote l'opacité : arrivée finie × (1 − lisse(0, 0,06, p)). Sans elle : un emplacement vide et invisible. |
| `couverture` | `CSSProperties` | **Plan v4.** Variables de la couverture cuite (lot C, `couvertureVars()`), posées sur `.gc-livre` et lues élément par élément (README de `Couverture`) : `--gc-couv-plat` (plat avant), `--gc-couv-contreplat` (carton gauche, verso de la couverture), `--gc-couv-contreplat-arriere` (carton droit, intérieur du plat arrière), `--gc-couv-arriere` (plat arrière fermé), `--gc-couv-chant`, `--gc-couv-fond`, `--gc-couv-biseau`, `--gc-couv-teinte`, `--gc-couv-plat-taille`. Sans elles : les dégradés actuels. Le filet de reliure reste chocolat (`--gc-couv-dos` est l'extérieur du dos). |
| `couvertureArriere` | `ReactNode` | **Plan v4** (prêt, pas encore branché dans `Carnet` : `PLAT_ARRIERE = false`, une butée en fin de carnet pour le prototype). La dernière double page est le colophon et la garde arrière : tourner sa page (→, glisser, marge) **referme le livre sur son plat arrière** (index `spreads.length`), symétrique de l'ouverture (ressort `cover`, caméra recentrée, tassement, son `couverture-fermer`). ← (ou toucher le plat) le rouvre ; « Aller à… » ou un lien le rouvrent. `true` : la toile seule ; un nœud : ce qui est posé sur le plat. Fin reste la dernière double page ouverte. |
| `apiRef` | `MutableRefObject<LivreApi \| null>` | **Plan v4.** Commandes impératives : `aller(i, cote?)` (même navigation que `index`), `sauter()` (fin immédiate de l'arrivée / du lien profond). |

Exporte `Livre`, `COIN_2D`, `LivreProps`, `LivrePose`, `LivreApi`, `CotePage`, `ToucherPage`, et ré-exporte `CameraProvider`, `useCamera`, `CameraProviderProps` de `src/lib/camera.tsx` (absents de `src/index.ts`).

### Sauter à une double page (sommaire cliquable, « Aller à… », liens)

Une seule navigation : changer `index` (ou `apiRef.current.aller(i)`). Le livre va à la double page **par le plus court geste** : un seul feuillet tourne de la page affichée à la cible (avec `FEUILLETAGE = true`, dès 2 doubles pages d'écart, il feuillette : jusqu'à 3 feuilles légères en décalé, puis la feuille finale — reporté après validation du prototype) ; livre fermé, il s'ouvre d'abord. Le sommaire n'a donc qu'à appeler `setIndex(cible)` (ou `aller(cible)`) depuis ses boutons ; aucune autre API.

## Touches

| Touche | Effet |
|---|---|
| → · PageDown | double page suivante (télécommandes de présentation : PageDown) |
| ← · PageUp | double page précédente |
| Début | revient au début (referme le carnet s'il a une couverture) |
| Fin | dernière double page (ouverte) |
| → sur la dernière double page | avec `couvertureArriere` : le livre se referme sur son plat arrière (← le rouvre) |
| Entrée / Espace, livre fermé | l'ouvre (`Carnet`, CONTRACT § 13.1 ; sinon : vidéo de la double page) |
| + / − | cran de caméra plus proche / plus loin (`CameraProvider keyboard`) |
| Alt + « + » / « − » | zoom fin ± 1 % (bornes par cran, `zoomBornes`, de 85 % à 115 %) ; ↑ est réservé au feuillet volant (CONTRACT § 12) |
| 0 | zoom fin à 100 % |

Les répétitions d'une touche maintenue sont ignorées ; Ctrl/Cmd/Alt + flèche est laissé au navigateur ; **une touche déjà consommée (`defaultPrevented`) est ignorée** : sous la loupe, le contrôleur du lot B prend les flèches pour déplacer la vue et ne laisse passer ← → qu'au bord (la page tourne alors en fondu, et la vue revient en haut de la nouvelle page, `ancrerLoupe('haut')`). Les deux flèches de la table sont des `<button>` (Entrée/Espace), anneau `:focus-visible` miel, aucun survol. En cadrage « page », ← / → et les flèches avancent d'**une page** (gauche → droite → gauche suivante).

## Gestes (doigt, stylet, souris — Pointer Events)

| Geste | Effet |
|---|---|
| Glisser horizontalement | La feuille suit le doigt : `p` = déplacement ÷ largeur de page à l'écran, amorti au-delà de 0 et 1 (`pElastique`). Au lâcher, le ressort `SPRINGS.paper` repart **avec la vitesse du doigt** ; la page tourne si `p` a franchi 0,35 (depuis son départ) ou si le geste est vif (≥ 1 largeur de page par seconde). |
| Glisser sur la page gauche vers la gauche (cadrage « page ») | La caméra glisse vers la page droite (suit le doigt, amortie aux bornes ; même règle 0,35 / geste vif, ressort `SPRINGS.camera`). Symétrique sur la page droite vers la droite. |
| Glisser en butée (première ou dernière page) | Le livre résiste : il glisse un peu sur la table (`rebond`, amorti) et revient sur `SPRINGS.settle`. |
| Toucher la couverture fermée | Elle s'ouvre. |
| Toucher une page | `onToucherPage` puis l'événement `gc-livre-toucher` (en bulle, annulable) sur l'élément touché : la double page s'en sert (lecture / pause). |
| Toucher la marge extérieure (12 % de la page) | Page précédente / suivante (en cadrage « page » : bord gauche / droit de la page cadrée). |
| Glisser vertical, appui long | Rien. |
| **Doigt posé dans un angle** (14 % W × 14 % H, angles extérieurs) | Le coin se lève de 2,5 % (`settle`, son `coin` très doux). Un simple toucher d'angle le repose : **la page ne tourne pas**. |
| **Glisser depuis un angle** (vers l'intérieur, en diagonale) | **Le coin suit le doigt** en x et en y : rabat plat (le pli est la médiatrice angle–doigt, contraintes anti-déchirure, il se redresse en s'enfonçant). Au-delà d'une profondeur de 0,28, ou sur un lancer, le tourne-page 3D prend le relais sans saut (p résolu par `bordProjete`) et le rabat s'efface en 120 ms. Lâché avant : le rabat retombe, rien ne tourne. |
| **Survol d'un angle** (souris) | Le coin se lève (et retombe en sortant). Curseurs posés en JS (`pointermove`, **aucune règle `:hover`**) par `data-gc-curseur` sur la surface : `grab` dans un angle, `grabbing` en glissant, `pointer` sur une marge qui tourne la page ou la couverture fermée ; l'attribut ne change qu'avec l'état. |
| Pincement, double toucher, ctrl + molette | La loupe du carnet (lot B). Zoomé : **aucun glisser ne tourne la page** ; les touchers d'objets (photo, feuillet) marchent, pas ceux de marge. Au début d'un geste de loupe (`gc-loupe`), le doigt en cours est abandonné (la feuille retombe). |

- Toucher / glisser : seuil de 8 px ; un toucher dure moins de 600 ms. Dès 4 px horizontaux, le sens est connu et le **feuillet est monté** (préparation, comme au clavier) : il est prêt quand le glisser commence ; un simple toucher ne monte rien (la page vivante, vidéo comprise, n'est jamais remplacée par sa copie figée). Le doigt pilote `p` tout de suite, sans attendre la cadence stable.
- Un geste clavier en cours : le doigt **rattrape** le ressort (il reprend `p` où il en est) ; un toucher de marge le relance comme un appui rapide. Pendant que le doigt tient la feuille, le clavier est ignoré.
- `touch-action` : `none` dans un `Ecran` (la loupe du carnet remplace le pincement du navigateur, CONTRACT § 13.2), `pan-y pinch-zoom` seul (la carte vit dans une page qui défile). Pas de sélection de texte, de glisser d'image ni de menu d'appui long ; le clic qui suit un glisser est avalé (souris, clic fantôme).
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

## Plan v4 : le livre vivant

### Coin qui suit le doigt (`coin.ts`, `CoinRabat.tsx`)
- `coin.ts` : géométrie **pure** (testable sans DOM) dans le repère de la page qu'on plie (reliure en x = 0) : `plier(angle, fx, fy, W, H)` (doigt contraint : |F − dos| ≤ W, |F − dos opposé| ≤ √(W² + H²), pas au-delà du bord ; profondeur λ ; le pli se redresse entre λ = 0,15 et 0,3 ; corde), `matrices()` (demi-plans et contenus), `matricePli()`, `pRelais()` (dichotomie sur `bordProjete(angles(p))`), `zoneCoin()`.
- `CoinRabat.tsx` (composant `Coin`, nommé ainsi parce qu'esbuild confond `./coin` et `./Coin`) : **six calques**, transformations seulement : dessous (demi-plan tourné `overflow: hidden` + la page suivante contre-tournée + ombre jetée, bande fixe en opacité), rabat (demi-plan + verso réfléchi, ombre portée fixe sur ses bords) et la courbure du pli **dans** la page du rabat (rotation + translation, jamais d'échelle : une échelle sous une découpe se repeint). La page de gauche est vue en miroir (racine en `scaleX(−1)`).
- Monté 500 ms après que la page s'est posée (les deux côtés en cadrage double, la page cadrée sinon) ; démonté pendant un tour (sauf celui qu'il a lancé), sous la loupe et en mouvement réduit. Au repos, son pli est de taille nulle à opacité 1 : rien ne se voit, et aucune passe hors écran ne tourne.
- Au doigt posé : le feuillet 3D du tour est monté **tout de suite** (mise en page et peinture avant le geste), un seul rabat reste monté. Événements `gc-livre-geste` : `coin` (début au premier glisser, fin quand le rabat est retombé ou effacé), puis `page` au relais. `data-gc-coin="gauche|droite"` sur `.gc-livre` pendant le geste.
- Cadrage « page » : la caméra ne suit la feuille qu'à partir du relais (aucun saut).
- **Repli** : `COIN_2D = false` (constante exportée) : le coin se lève à p = 0,03 sur le feuillet 3D et seul le suivi horizontal reste.

### Arrivée, ouverture lestée, lien profond
- Arrivée : la MotionValue `arr` (ressort `SPRINGS.arrivee`) pilote `y` (+70 % de la scène → 0) et `rotate` (5° → 0) de la caméra (`Camera.tsx`), calque promu le temps du mouvement. Elle part après le cadrage, `pret()` et `cadenceStable()`.
- Ouverture lestée : p monte à 0,015 en 90 ms, puis le ressort `cover` part avec de la vitesse ; quand le carton se pose, le livre se tasse de 2,5 px (`settle`), l'ombre gauche respire (calque `.gc-livre__ombre--pouls`, opacité) et l'on entend `couverture-poser`. Même chose, inversée, pour le plat arrière (`couverture-fermer`).
- Lien profond (prototype, `FEUILLETAGE = false`) : l'arrivée, puis le moteur ordinaire ouvre le livre (ouverture lestée) et tourne un feuillet jusqu'à la page ; `data-gc-arrivee` reste `en-cours` jusqu'à la page. Avec `FEUILLETAGE = true` : la couverture et toutes les feuilles sont montées et peintes **avant** l'arrivée, la couverture part à 0,45 s (lancée à 3 p/s), le feuilletage dès qu'elle passe 60 % (≈ 2,1 s en tout). Dans les deux cas, un `pointerdown` ou `keydown` (en capture) appelle `sauter()` : fondu de 150 ms (`html[data-gc-livre-vt="saut"]`) vers la page d'arrivée ; ce geste est avalé (aucune page ne tourne, aucune photo ne se lève).

### Feuilletage (`FeuilletLeger.tsx`) — prêt, désactivé (`FEUILLETAGE = false`) jusqu'à validation du prototype
- Un saut d'au moins 2 doubles pages (Aller à…, Début, Fin, lien, sommaire) : `Tour.feuilles` = jusqu'à 3 doubles pages intermédiaires réparties ; chacune est une **feuille légère** (plan rigide, recto et verso : 2 calques, copies statiques) pilotée par `r` (ressort `SPRINGS.riffle`, décalage `STAGGER.sommaire`), puis le `Feuillet` final, piloté par p (ressort `riffle`, parti après les légères) : `atterrir` est inchangé. Une feuille posée s'efface quand la suivante se pose dessus (elles sont peintes dans l'ordre inverse). Un feuilletage va au bout (ni reprise au doigt, ni relance).
- Événement `riffle` (début, fin).

### Sons (`jouerSon`, lot S)
`page` au lâcher du doigt (avec la vitesse du geste) et pour un tour au clavier ; `couverture-ouvrir` / `couverture-poser` / `couverture-fermer` ; `riffle` ; `coin` (gain 0,35) à la levée.

### Loupe (lot B)
Au repos, le livre publie le rectangle de son contenu (px d'écran du document, à z = 1 ; couverture fermée centrée, page cadrée en cadrage « page ») et la page cadrée : `publierContenuLoupe(rect, cote)`. Zoomé : pas de glisser de page, pas de rabat, flèches de l'écran en style « papier » (‹ ›), page tournée en fondu + `ancrerLoupe('haut')` dans la même mise à jour. Le facteur de repos de la loupe re-promeut le monde composité (rendu net).

## Contrat des faces

- Une face = `.gc-livre-face` : surface `var(--gc-paper)` + `<Page side>` avec le contenu de `spread.render(mode)[side]` + folio (`gc-folio`) + ombre de pli vers la reliure (`.gc-livre-face__pli`). La même face sert aux emplacements et, en copies découpées, au feuillet.
- Le feuillet et les voisines sont rendus en mode **`static`** : aucune vidéo, aucun mouvement, images cuites seulement. La double page affichée est en `live` et le reste pendant le geste (sa page qui tourne est remplacée par une copie statique).
- `render(mode)` peut être appelé plusieurs fois (jusqu'à 4 copies pendant un geste) : il doit être pur et bon marché. Les `<img>` doivent pouvoir être décodées (`decode()`).
- Le contenu ne doit pas porter de `view-transition-name` ni de `will-change` permanent.

## Règles de performance (mesurées, voir `scripts/fps.mjs`)

- Pendant un geste : `transform` et `opacity` seulement, sur des calques déjà composités ; **0 Layout, ≤ 2 Paint**.
- Les ombres du livre (`ombre--gauche`, `--droite`, `--epaisseur`, `--pouls`) ne sont des calques que pendant un geste de carton (`data-gc-geste="couverture"`) : un tourne-page de papier en compte trois de moins, ce qui laisse la place au rabat du coin (38 calques au plus mesurés pendant un coin relayé).
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
node scripts/fps.mjs --scenarios coin,survol,riffle,arrivee,lien --bundle … --out …   # plan v4
node scripts/verify-devices.mjs   # téléphones, tablettes, ordinateurs, TV : cadrage, zones sûres, cibles, hauteur d'x, gestes
```

Banc d'essai : `harness/motion.html?scenario=turn|open|camera|zoom|pose|arrivee` (`&index=`, `&vers=`, `&p=`, `&r=`, `&distance=`, `&coin=droite,bas,0.6,0.7`, `&arrivee=0.4`, `&dos=1`).

## À éviter

- Rendre une page dans un `Livre` qui dépend de sa taille réelle au moment du geste (tout est mis en page avant).
- Ajouter une ombre en `box-shadow` animé, un filtre ou un `mix-blend-mode` sur une face.
- Envelopper `Livre` dans une `Stage` ou un parent transformé pendant un geste.
