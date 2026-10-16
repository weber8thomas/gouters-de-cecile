# Ecran

La coque plein écran du carnet (CONTRACT § 11) : le même carnet sur téléphone, tablette, ordinateur et TV. `Ecran` occupe toute la fenêtre, mesure la fenêtre d'affichage (`useViewport()`), en déduit le **cadrage** et le donne au `Livre` qu'il contient ; il porte aussi le calque des contrôles en **px d'écran** (hors de la scène mise à l'échelle) et le bouton plein écran.

```tsx
import { Ecran } from '…/components/Ecran';
import { Livre, CameraProvider } from '…/components/Livre';

<CameraProvider keyboard>
  <Ecran>
    <Livre spreads={spreads} index={i} onIndexChange={setI} keyboard cover={<Etiquette />} />
  </Ecran>
</CameraProvider>
```

L'application complète (liens profonds, lecture de Julie, cran « proche » par défaut au doigt) est l'artboard `Carnet` (`src/artboards/Carnet`).

## Props (`EcranProps`)

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `children` | `ReactNode` | — | Le carnet : un `<Livre>` (qui rend sa propre scène 1920 × 1080). |
| `pleinEcran` | `boolean` | `true` | Bouton plein écran en haut à droite (Fullscreen API ; masqué si elle manque, par exemple sur iPhone). |
| `className` | `string` | — | Classe ajoutée à la racine `.gc-ecran`. |

Exporte aussi `useEcran()` (contexte lu par le livre), et ré-exporte de `src/lib/viewport.ts` : `useViewport`, `ViewportOverride`, `cadrageDe`, `echelleContain`, `cadrerDouble`, `cadrerPage`, types `Viewport`, `ViewportForce`, `Cadrage`, `Insets`.

## Fenêtre d'affichage (`useViewport()`, `src/lib/viewport.ts`)

| Champ | Source |
|---|---|
| `w`, `h` | `visualViewport` (sinon `innerWidth/Height`) ; figés pendant un pincement (le zoom du navigateur reste un zoom). |
| `dpr` | `devicePixelRatio` |
| `tactile` | `matchMedia('(pointer: coarse)')` |
| `insets` | sonde CSS `padding: env(safe-area-inset-*)` (nécessite `viewport-fit=cover`) |
| `cadrage` | `page` si la fenêtre est plus haute que large, `double` sinon ; hystérésis de 6 % (une rotation ne clignote pas). |
| `pleinEcran` | `document.fullscreenEnabled` (ou préfixe webkit) |

`<ViewportOverride.Provider value={{ w: 390, h: 844, tactile: true, insets: { top: 47, bottom: 34 } }}>` impose une fenêtre : avec `w` et `h`, l'écran devient une **boîte simulée** de cette taille (cartes, artboard `Formats`) ; avec seulement `insets`, il garde la vraie fenêtre et simule des encoches (tests).

Fonctions pures (testables) : `cadrageDe(w, h, avant)`, `echelleContain(cadre, zone)`, `zoneSure(vp, ignorerBas)`, `cadrerDouble(vp, geo)`, `cadrerPage(vp, geo)`, `centrePage(geo, côté)`, `debordNecessaire(vp, cadre, xs, geo)`, `translationMonde(cadre, x, dpr)`, `auPixel`, `arrondiEchelle`.

## Cadrages

- **double** : la scène du cran (livre entier + la table voulue par le cran) en « contain ». Sur un grand écran (côté court ≥ 720 px), c'est exactement la composition 1920 × 1080 validée sur la TV (échelle 1 sur une TV 1080p, 2 en 4K). Sur un téléphone couché (côté court ≤ 480 px), on se rapproche jusqu'au livre seul, cartons compris, à 4 px des bords ; entre les deux, mélange linéaire. Le livre peut passer sous la barre d'accueil, jamais sous une encoche.
- **page** : une page (`--gc-page-w × --gc-page-h` + 3 % de marge : on voit le carton, un peu de table, le bord de la page voisine), à la plus grande échelle possible dans la zone sûre.
- **Caméra fixe** (cadrage `page`, ou `double` quand le côté court est < 720 px) : la page ou le livre remplit l'écran, le cran ne change plus le cadrage ; le livre prend la mise en page du cran « loin », la plus lisible rapportée à la page (+19 % de hauteur d'x par rapport à « proche »). Les crans (+ / −) et le zoom fin ne servent que sur un grand écran.
- La **table** déborde jusqu'aux bords de l'écran : `Stage debord` (multiple de 48 px, phase du vichy gardée ; dessins de la table et de la lumière ancrés sur la scène, sans couture).
- Échelle arrondie à 4 décimales, translation au pixel physique ; `transform` seulement.

## Contrôles (px d'écran)

Posés par le livre dans le calque `.gc-ecran__controles` (portail) : flèches, points de page (cadrage `page`), repère de distance (quand les crans servent). Le plein écran est à l'Ecran.

- Cible : `--gc-ecran-cible` = `--gc-nav-size` à l'échelle de l'écran (`--gc-ecran-u` = min(l/1920, h/1080)), jamais sous 44 px au doigt (`data-gc-tactile`), 32 px à la souris. Sur une TV 1080p : 56 px, comme dans la scène.
- Zones sûres : `--gc-ecran-haut/droite/bas/gauche` (px) + bords à l'échelle (`--gc-ecran-bord`, `--gc-ecran-bord-bas`).
- Aucun survol, `:focus-visible` miel, `touch-action: manipulation` sur les boutons.
- Couleur selon la table affichée (`data-gc-table` posé par le livre) : papier sur le bois, encre sur la nappe.

## Ce que fait la coque

- `position: fixed; inset: 0`, `overflow: hidden`, `touch-action: pinch-zoom` (aucun défilement, le pincement reste permis), `overscroll-behavior: none`, ni sélection, ni menu d'appui long, ni reflet de toucher, images non glissables.
- Page hôte : `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` et `html, body { margin: 0; height: 100%; overflow: hidden }` (voir `index.html`, `harness/devices.html`).

## À éviter

- Mettre autre chose qu'un `Livre` dedans, ou un `Livre` dans une `Stage` ou un parent transformé.
- Poser un contrôle dans la scène quand le livre est dans un `Ecran` : il serait mis à l'échelle avec elle (illisible au téléphone, minuscule en 4K).
- Des tailles de contrôles en dur : passer par `--gc-ecran-cible`.

## Vérifier

```
node scripts/build-bundle.mjs --only Livre,Stage,Ecran,DoublePage,Page --boards Carnet,Formats,DemoCarnet --tag r1
node scripts/verify-devices.mjs          # 9 écrans émulés + gestes ; verification/out/r1 (planche.png, devices.json)
node scripts/shot.mjs src/components/Ecran/preview.html --bundle dist/ds-r1/components --out verification/out/r1
```
