# Loupe

Le vrai zoom du carnet (plan v4, CONTRACT § 13) : de **1× à 3×**, sur **tous les écrans**, téléphone compris. Il remplace le pincement du navigateur sur le livre (`touch-action: none`). Rien n'est mémorisé : la loupe revient à 1× au rechargement et à la rotation.

La loupe vit dans l'`Ecran` : le livre est posé dans le calque `.gc-ecran__loupe` (`translate3d(x, y, 0) scale(z)`, origine `0 0`, trois MotionValues). Les contrôles, la photo soulevée et le menu sont en portail **hors** de ce calque : ils ne zooment jamais. Ce dossier fournit le contrôleur des gestes et le bouton ; l'état partagé est dans `src/lib/loupe.ts`.

```tsx
<CameraProvider keyboard>
  <Ecran>                      {/* loupe par défaut ; <Ecran loupe={false}> pour s'en passer */}
    <Livre … />
  </Ecran>
</CameraProvider>
```

## Gestes et touches

| Entrée | Effet |
|---|---|
| Pincer à deux doigts | `z = z0 · d / d0`, libre de 1 à 3, élastique jusqu'à 0,9 et 3,3 ; le point sous les doigts reste sous les doigts. Au lâcher, ressort `camera` vers les bornes. |
| Un doigt (ou la souris), zoomé | Déplace la vue ; élan au lâcher (`INERTIE`), puis ressort `camera` si l'on sort des bornes. Le livre ne voit pas ces déplacements : **jamais de tourne-page**. |
| Double toucher (≤ 300 ms, ≤ 24 px) | Dans l'intérieur d'une page : 1× ↔ 2× au point touché. Pas dans la bande `MARGE_TOUCHER`, ni sur un objet (`[data-gc-objet]`), un contrôle (`[data-gc-controle]`, bouton…), ni sur la couverture fermée. Le simple toucher reste au livre (photo, marges). Double clic à la souris : pareil. |
| Ctrl + molette, pincement du pavé tactile | Zoom au curseur, facteur `exp(−dy/100)` borné à [0,8 ; 1,25] par cran. |
| Molette seule, zoomé | Déplacement (Maj : horizontal). |
| Safari (Mac) | `gesturestart` / `gesturechange` / `gestureend` (`e.scale`) ; ctrl + molette ignorée pendant ce geste. Sur iPhone, les doigts sont suivis par les événements de pointeur (les `gesture*` sont seulement annulés). |
| `+` / `−` (`=`, `_`, `Add`, `Subtract`) | Paliers 1 · 1,5 · 2 · 3 (`palierVoisin`, à partir du palier visé : `+ +` coup sur coup va à 2). Dans `src/lib/camera.tsx`. |
| `0` | Loupe à 1× et zoom fin à 100 %. |
| Alt + `+` / `−` | Zoom fin de la caméra (inchangé). |
| Flèches, zoomé | Déplacent la vue de 20 % de la zone sûre ; au bord, ← → ne sont **pas** consommées : le livre tourne la page, la loupe reste. ↑ ↓ sont toujours consommées (pas de feuillet volant par erreur). |
| Échap, Retour arrière, zoomé | Loupe à 1×. |
| Bouton loupe | 1× ↔ 2× autour du centre de la zone sûre. |

Rien de tout cela quand le menu ou un objet soulevé tient le clavier (`clavierModalActif()`). Quand le navigateur est déjà zoomé (`visualViewport.scale > 1,01`), la loupe se retire : `[data-gc-loupe-navigateur]` sur `.gc-ecran`, et le pincement du navigateur revient sur le livre pour qu'on puisse dézoomer.

## Bornes

Le contenu du livre (publié par le livre, sinon mesuré : la page visible en cadrage « page », les deux pages en « double ») **couvre la zone sûre** dès qu'il est plus grand qu'elle ; plus petit, il reste dans la zone (ou là où il était à 1×). Le haut d'une page peut donc venir juste sous l'encoche, jamais dessous. À 1×, aucune translation (`transform: none` au repos : aucun calque composité de plus).

## API

- `<BoutonLoupe z onBasculer className? />` : à 1×, une loupe tracée à l'encre (papier sur le bois, comme le plein écran) ; zoomé, une étiquette de papier « 150 % » écrite à la main, lisible sur le papier comme sur le bois. `data-gc-loupe-bouton="repos|zoome"`, `aria-pressed`. L'`Ecran` le pose en haut à droite (`.gc-loupe-bouton--ecran`), à gauche du plein écran (`--decale`).
- `creerControleur({ racine, calque, lx, ly, lz, vp, globale, onRepos })` → `{ demander, ancrer, vise, basculer, majVp, reinitialiser, detacher }` (branché par l'`Ecran` ; `globale: false` pour un écran simulé : gestes et bouton seulement, sans clavier ni état partagé).
- Fonctions pures : `zoomFoyer(vue, z, foyer)`, `pincer(v0, m0, d0, m, d)`, `bornesAxe`, `bornesPan(z, contenu, zone)`, `bornerPan(pan, z, contenu, zone)`, `bornerVue`, `ancrerHaut(page, z, zone, contenu)`, `zElastique`, `transformLoupe`.
- Ré-exporte l'état de `src/lib/loupe.ts` : `getLoupe()`, `useLoupe()`, `abonnerLoupe()`, `loupeOccupee()`, `demanderLoupe(z, foyer?)`, `ancrerLoupe('haut')`, `publierContenuLoupe(rect, cote)`, `palierVoisin(z, ±1)`, `loupeVisee()`, constantes `LOUPE_*`.

### État au repos et pendant un geste

- Au repos : `getLoupe()` → `{ z, zoome, hd, cote, contenu }`, publié **à la fin** d'un geste (`majLoupe`) ; `cote` = la page vue zoomée : la page affichée en cadrage « page », celle du centre de la zone sûre en « double » (null à 1×).
- Pendant un geste : `loupeOccupee()`, événement `gc-loupe` `{ phase: 'debut' | 'fin' }` sur `window` (dès le premier instant : le livre lâche son doigt), et `gc-livre-geste` de type `loupe` sur `.gc-ecran` : `prepa` (le calque est promu, `will-change: transform` : une mise en page et quelques peintures, une seule fois), puis `debut` deux images plus tard, puis `fin`. Entre `debut` et `fin`, seules les transformations changent (mesuré : 0 Layout, 0 Paint au pincement et au clavier, CPU ×4). Aucun rendu React.
- Attributs : `.gc-ecran[data-gc-loupe="repos|zoome"]` (curseur `grab`), `[data-gc-loupe-geste="deplacer|elan"]` pendant un déplacement (curseur `grabbing`), `will-change: transform` sur le calque pendant le geste seulement.

## Ce que le livre branche (lot A)

- Publier au repos le rectangle de son contenu, en px d'écran à 1× : `publierContenuLoupe(rect, cote)`.
- Pas de glisser de page quand `getLoupe().zoome` ; abandonner son geste sur `gc-loupe` `debut`.
- Après un tour (ou un glissement de caméra) à la loupe : `ancrerLoupe('haut')` (la vue revient en haut de la page, à gauche ; en avançant on lit la page gauche, en reculant la droite).
- Re-promouvoir `will-change` du monde après `gc-loupe` `fin` (rastérisation à la nouvelle échelle).

## Encre nette à fort zoom

`PageCuite` pose les tuiles d'encre ×4 (`encre4x` du manifeste) quand `hd` (z ≥ 1,5) et les retire sous 1,25 : voir `src/components/PageCuite/README.md`.

## Vérifier

```
node scripts/build-bundle.mjs --only Ecran,Livre,Loupe,PageCuite,Reglages,Soulever,Stage,DoublePage,Page,PhotoCollee,FeuilletVolant --boards Carnet,Formats --tag v4-b
node scripts/verify-loupe.mjs            # iPhone 13, Pixel 7, iPad, 1440, TV ; verification/out/v4-b/loupe
```
