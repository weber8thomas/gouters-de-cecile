# Soulever

La photo d'une vidéo ou le feuillet volant **se soulève de la page et grandit au-dessus du livre** (CONTRACT § 12), puis redescend exactement à sa place. Un calque en px d'écran, dessiné en portail dans les contrôles de l'`Ecran`, avec un voile doux sur le livre, l'objet soulevé, son ombre et un bouton « Fermer » discret. La **vidéo unique** du carnet vit dans ce calque.

```tsx
import { SoulevementProvider, useSoulevement, souleverObjet } from '…/components/Soulever';

<MotionConfig …>
  <CameraProvider keyboard>
    <Ecran>
      <SoulevementProvider>
        <Livre … onIndexChange={(i) => { setI(i); /* + preparer, voir plus bas */ }} />
      </SoulevementProvider>
      <Reglages … />
    </Ecran>
  </CameraProvider>
</MotionConfig>
```

## API

| Export | Rôle |
|---|---|
| `SoulevementProvider` | `{ children }`. **Sous `Ecran`** (il lit `useEcran()` : fenêtre, zones sûres, calque des contrôles). Hors d'un `Ecran`, il dessine son calque en `position: fixed` sur `document.body`. |
| `useSoulevement()` | `{ etat, objet, face, soulever(objet), reposer(), preparer(video), retourner(face?), video() }`. Hors d'un provider : `etat: 'ferme'`, actions sans effet. |
| `souleverObjet(type, racine?)` | Soulève la photo (`'photo'`) ou le feuillet (`'feuillet'`) **vivant** de la double page affichée (le plus visible s'il y en a deux), de façon synchrone. Renvoie `true` si un objet a répondu. Pour les touches Entrée et ↑. |
| types | `VideoInfo`, `ObjetSoulevable`, `EtatSoulevement`, `Soulevement`, `SoulevementActions`, `SoulevementProviderProps`. |

- `etat` : `'ferme' | 'envol' | 'ouvert' | 'retour'`.
- `objet` :
  - `{ type: 'photo', video: VideoInfo, source: HTMLElement, angle? }` ;
  - `{ type: 'tirage', tirage, coins?, legende?, proportion?, source: HTMLElement, angle? }` : une photo fixe de l'album (sans vidéo, sans trait), en grand ; `tirage` et `coins` sont des noms logiques d'`assetUrl()`, `legende` s'écrit au crayon sous la photo (main de Cécile, encre claire). `proportion` défaut : celle de l'image cuite. Posée par `TirageColle` (`src/artboards/DemoCarnet/spreads.tsx`) ;
  - `{ type: 'feuillet', recto: string, verso?: string | null, source: HTMLElement, angle?, fenetre? }` (ids de pages cuites, rendues par `<PageCuite>`).
- `source` : l'élément posé dans la page (tourné ou non : sa rotation propre est lue). Sans `angle`, l'inclinaison de départ est celle de `source`.
- `soulever()` renvoie `false` si un autre objet est déjà soulevé ; appelé à nouveau pour **le même** objet, il le rattrape pendant son retour, ou relance la vidéo si elle n'a pas démarré (nouveau geste).
- `preparer(video | null)` pose la `src` de la vidéo unique (`preload="auto"`) et pré-décode le tirage et l'affiche. Sans effet pendant qu'une photo est soulevée.
- `retourner('recto' | 'verso')` (sans argument : bascule) : feuillet seulement.

## Ce que le lead branche (lot I)

1. **Ordre** : `MotionConfig › CameraProvider › Ecran › SoulevementProvider › Livre`, et `Reglages` dans l'`Ecran` (frère du provider ou dedans, peu importe).
2. **`preparer()` à l'atterrissage** d'un tourne-page : dans `onIndexChange`, `preparer(videoDe(spreads[i]) ?? null)`. La source ne change jamais pendant un geste.
3. **Changement de page** (« Aller à… », lien profond) : appeler `reposer()` avant de changer d'index. Le provider repose déjà seul sur `hashchange`, et se ferme sans animation à une vraie rotation (couché ↔ debout) ; quand seule la hauteur change (barre de Safari qui paraît ou s'efface), l'objet reste levé et se recentre.
4. **Entrée / Espace** (vidéo de la double page) et **↑** (feuillet) : dans le gestionnaire de touches du carnet, `souleverObjet('photo')` / `souleverObjet('feuillet')` (et `preventDefault()` s'il renvoie `true`). Pas besoin de passer la source : l'objet se soulève lui-même, **dans** le `keydown`.
5. **Toucher** : rien à brancher. `PhotoCollee` écoute l'événement `gc-livre-toucher` que le `Livre` émet **dans** le geste (juste avant `onToucherPage`) et l'annule (`preventDefault`) : le livre ne tourne pas la page par la marge. `FeuilletVolant` gère son propre toucher (`data-gc-controle`). Si `onToucherPage` appelle aussi `soulever()` pour la même photo, c'est sans effet (idempotent) ; il peut reconnaître la photo par `t.cible.closest('[data-gc-objet="photo"]')`.
6. **`inert`** : posé par le provider lui-même pendant que l'objet est en l'air, sur les frères de la racine `.gc-ecran` (dont `.gc-livre-ecran`) et sur les autres contrôles (flèches, plein écran), **sauf le menu de réglages** (`[data-gc-reglages]`). L'attribut `data-gc-souleve` est posé sur `.gc-ecran` pendant ce temps (pour un style éventuel). Rien à brancher.
7. **Lecture automatique** (`lectureAuto`) : `soulever()` hors d'un geste ; si le navigateur refuse le son, la vidéo repart sans le son et le premier toucher sur la photo le rend.

## Sons du livre et ambiance (plan v4, lot S)

Le moteur audio vit dans `src/lib/son.ts` ; il **se branche tout seul à l'import** (écouteurs en capture sur `window`), il n'y a rien à monter. Le provider s'en sert ainsi :

- `photo-lever` à l'envol de la photo (dans le geste) ; `photo-poser` quand elle retouche la page au retour (`p` ≈ 0, une fois ; pas de son pour un fondu sur place) ;
- `feuillet` quand la feuille se soulève, se retourne (← → ou toucher), et plus doux (gain 0,6) quand elle se repose ;
- `marquerVideo(true|false)` aux événements `playing` / `pause` / `ended` / `emptied` : les sons du livre passent à 30 %, l'ambiance à 15 % ;
- `useAmbiance()` : **l'ambiance** (feu de cheminée en boucle, rares bruits de cuisine : `src/lib/ambiance.ts`) tourne tant que le provider est monté.

### API pour le Livre (lot A)

```ts
import { jouerSon } from '…/lib/son';
jouerSon('page', { vitesse, gain, delai });   // ne lève jamais d'erreur
```

| Option | Rôle |
|---|---|
| `vitesse` | 0 (lent) à 1 (vif), défaut 0,5. Débit = 0,9 + 0,25 × vitesse (± 3 % au hasard) ; gain × (0,35 + 0,65 × vitesse). Pour un tourne-page : la vitesse angulaire au lâcher, ramenée à 0–1. |
| `gain` | Facteur en plus (défaut 1). Le gain final = volume des réglages × (0,35 + 0,65 v) × gain × mixage de la banque (× 0,3 pendant une vidéo). |
| `delai` | Secondes avant de jouer. `BANQUE_SONS[nom][k].a` donne l'instant du choc de chaque variante (la page qui retombe vers 0,4 s, le carton de `couverture-fermer` à 0,54 s) pour caler un son sur un atterrissage. |

Noms : `page` (×5), `riffle`, `couverture-ouvrir`, `couverture-poser`, `couverture-fermer`, `feuillet` (×2), `photo-lever`, `photo-poser`, `coin` (×2, très doux). Une variante au hasard, jamais la même deux fois de suite ; 8 voix au plus (au-delà, le son est ignoré). Avant le premier geste, rien ne joue (le contexte n'existe pas encore) : le **premier** son d'un geste (ouvrir la couverture) peut arriver jusqu'à 0,3 s après, le temps du décodage ; au-delà il est oublié. `etatSons()` décrit le moteur (tests).

### API pour les Réglages (lot B)

- `reglages.sonsLivre: boolean | null` et `sonsLivreEffectif(r)` (`src/lib/son.ts`) : actifs partout, téléphone compris, sauf `false` (`null`, l'ancien « automatique », vaut « oui »). `useSonsLivre()` donne la valeur effective.
- `reglages.ambiance: boolean | null` et `ambianceEffective(r)` (`src/lib/ambiance.ts`) : même règle.
- `reglages.feu: boolean` (défaut `true`) : la lumière du feu vacille (lu par le lot L).
- Activer « Sons du livre » ou « Ambiance » d'un clic dans le menu déverrouille l'audio dans ce même clic. Un petit `jouerSon('page')` juste après l'activation donne un aperçu.

### Banque, adresses

`design-system/baked/sons/*.mp3` (MP3 mono 96 kb/s), décrits par `banque.json` (importé dans le bundle). Les adresses passent par `assetUrl('sons/<fichier>')` dès que l'inventaire liste les MP3 (**à faire par l'intégration** : `.mp3` dans `scripts/assets.mjs`, `mp3` dans le `import.meta.glob` de `src/app/main.tsx`, et les exclure de l'artifact comme les vidéos dans `gen-entry.mjs`). En attendant, sur le banc d'essai (adresses absolues `/…/design-system/baked/…`), le moteur les cherche à côté des images cuites ; ailleurs (site, artifact), silence plutôt qu'une 404. `setSonResolver(fn)` remplace la résolution.

## Menu de réglages

Le calque est à `z-index: 3` dans les contrôles, **sous** le menu (`z-index: 4`). Choix : **le menu s'ouvre par-dessus la photo soulevée** (le bouton ⚙ reste actif, M et « , » le cliquent) ; son clavier modal passe devant le nôtre (le dernier ouvert gagne) : Échap ferme d'abord le menu, puis repose la photo. Aucun nom de transition de vue.

## Déroulé

1. **Dans le geste** (photo) : `muted` / `volume` d'après `getReglages()` (`son`, `volume`), `currentTime = 0`, `play()` — avant tout `setState` ou `await`. Refus (`NotAllowedError`) : relance sans le son.
2. **Préparation** (2 images) : la carte est montée à sa **pose d'arrivée**, presque invisible (opacité 0,002) avec `will-change` : le navigateur la rastérise à pleine taille.
3. **Envol** : `p` passe de 0 à 1 sur `SPRINGS.lift`. Pose de départ = rect de `source` à l'écran (`getBoundingClientRect` + `offsetWidth/Height` + rotation propre), pose d'arrivée = boîte centrée dans la zone sûre, à la proportion de l'objet, au plus **82 %** de la largeur et de la hauteur utiles (sur un écran debout : toute la largeur moins 10 à 24 px de gouttière). Centre, taille et inclinaison interpolés (la photo se redresse), petit arc vers le haut à mi-course, léger rebond en haut. Le voile suit `p` (opacité seule). L'ombre portée (large, douce) naît en fondu ; l'ombre de contact est celle de l'objet.
4. **L'objet dans la page** : l'attribut `data-gc-souleve` est posé sur `source` (à l'image suivante : jamais avant que la carte soit peinte) et retiré dès le retour terminé (tout de suite : jamais après que la carte a disparu). `PhotoCollee` y cache son tirage (les coins restent), `FeuilletVolant` sa feuille.
5. **Photo** : tirage sépia → affiche en couleur (fondu de `p` = 0,28 à 0,88) → vidéo visible à l'événement `playing` (`SPRINGS.settle`). Avancement : un **trait de crayon** sur la marge blanche du bas, révélé par deux translations opposées (fenêtre + encre), lu à chaque image dans `requestAnimationFrame` (`currentTime / duration` → MotionValue), sans rendu React. Fin de la vidéo → on repose.
6. **Feuillet** : la feuille entière apparaît en fondu sur les premiers 20 % du vol (le reste de la feuille « sort » de sous la page), le coin dans la page est caché à `p = 0,2`. Recto / verso : `rotateY` sur `SPRINGS.lift`, deux faces `backface-visibility: hidden` ; l'ombre portée s'efface quand la feuille passe par la tranche.
7. **Reposer** : la source est **re-mesurée**, `p` revient à 0 (rebond bas ignoré : l'objet ne s'enfonce pas dans la page), la couleur repart vers le sépia, la vidéo est mise en pause. Si la source a quitté la page : fondu sur place.

**Mouvement réduit** (`useReducedMotion()` : système ou réglage) : fondu sur place (250 ms), aucune transformation ; le feuillet change de face en fondu enchaîné (`data-gc-reduit` sur le calque).

## Fermer

Toucher la photo ou le voile ; feuillet : toucher hors de la feuille (toucher la feuille la retourne) ; **Échap, Retour arrière, ↓** ; bouton « Fermer » ; `hashchange` ; rotation couché ↔ debout (fermeture immédiate ; la barre de Safari ne ferme rien) ; fin de la vidéo ; `reposer()`. Le clic qui suit le toucher qui a soulevé l'objet ne le repose pas (un toucher ne compte que s'il a commencé sur le calque ouvert).

## Clavier et focus

- `useClavierModal(etat !== 'ferme', …)` : Échap / Retour arrière / ↓ reposent ; ← → retournent le feuillet ; Entrée / Espace : le bouton qui a le focus, sinon reposer (photo) ou retourner (feuillet) ; ↑, PageUp/PageDown, Début/Fin avalés ; Tab garde le focus sur « Fermer » ; M et « , » ouvrent le menu ; les autres touches ne vont pas plus loin que leur cible.
- À l'ouverture, le focus va au bouton « Fermer » (croix au crayon, `--gc-ecran-cible`, anneau miel en `:focus-visible`), placé au-dessus du coin haut droit de l'objet (sinon à sa droite, sinon dedans). À la fermeture, il revient à l'objet de départ (la photo est focusable en mode vivant ; pour le feuillet, son coin).
- Le calque est `role="dialog"`, `aria-modal`, libellé « Vidéo : <titre> » ou « Feuillet volant, recto|verso ». Fermé : `inert` et `aria-hidden`.

## Attributs (tests)

| Élément | Attribut |
|---|---|
| Calque | `data-gc-soulever="ouvert\|ferme"`, `data-gc-phase="ferme\|envol\|ouvert\|retour"`, `data-gc-type="photo\|tirage\|feuillet"`, `data-gc-reduit` |
| Vidéo unique | `data-gc-video` (`playsinline`, `webkit-playsinline`, `preload="auto"`, `disablepictureinpicture`) |
| Objet posé, soulevé | `data-gc-souleve` (sur `source`) |
| Carte photo en lecture | `data-gc-lecture` |
| Carte du feuillet | `data-gc-face="recto\|verso"` |
| Bouton | `data-gc-soulever-fermer` |

## Tirage : géométrie

`VideoInfo` (noms logiques d'`assetUrl()`, ou URL directes pour les essais) : `{ id, titre, video, affiche, tirage, coins, angle?, duree? }`, et la géométrie du tirage :

- **`geometrie`** (cuite par le lot V, `src/content/videos.json`, prioritaire) : `{ taille, papier, photo, cadreVideo }`. L'image du tirage a une **marge transparente** (ombre de contact cuite, scotch qui déborde) ; `papier` et `photo` sont en fractions de cette image, `cadreVideo` est la partie du cadre 16:9 que montre la photo 3:2. La boîte mesurée et soulevée est **le papier** ; l'image du tirage et celle des coins (même cadre) débordent d'elle ; l'affiche et la vidéo sont posées en entier (16:9) derrière la fenêtre de la photo, si bien que la couleur recouvre exactement le sépia. Pas d'ombre CSS (elle est cuite). Le lead passe l'entrée telle quelle : `{ id, ...videos[id] }`.
- **Sans `geometrie`** (convention par défaut, fixtures du banc) : le tirage est le papier (image 16:9 + bord blanc de 4,5 % de la largeur en haut et sur les côtés, 13 % en bas : `CADRE_TIRAGE`, proportion ≈ 1,456), ou `cadre` / `proportion` explicites ; les coins ont la même échelle de pixels et sont centrés sur le tirage (`debordCoins`, sinon déduit des tailles cuites).

`geometrieDe(video)` (`media.ts`) ramène les deux cas à une seule géométrie rapportée au papier (image, coins, photo, cadre vidéo, débord, ombre cuite) : `PhotoCollee` et la carte soulevée s'en servent.

## Performance (mesurée, `verification/out/s/verifier.mjs --seul trace`)

- Pendant le vol : `transform` et `opacity` seulement ; **0 Layout, 0 Paint** (envol et retour de la photo, TV et iPhone) ; feuillet : seulement les deux repeintures attendues du coin qui quitte / retrouve la page à `p = 0,2`.
- `will-change` en vol seulement (carte, ombre, voile, affiche), et sur le trait pendant la lecture.
- La carte photo porte une `perspective` : sans elle, Chromium ré-enregistre la carte toutes les 2 ou 3 images du retour (sa zone à peindre grandit quand elle rapetisse).
- Aucun rendu React par image : les rendus n'ont lieu qu'aux changements de phase. Les objets posés n'utilisent que les actions (contexte stable) : ils ne sont jamais rendus à nouveau quand l'objet s'envole.

## Vérifier

```
node scripts/build-bundle.mjs --only Soulever,PhotoCollee,FeuilletVolant,PageCuite,Ecran,Livre,Stage,DoublePage,Page,Reglages --tag s
python3 verification/out/s/fixtures.py verification/out/s/fixtures   # clips ffmpeg, affiche, tirage, coins (en-tête du script)
node verification/out/s/verifier.mjs          # iphone, tv, lecture, feuillet, toucher, reglages, reduit, trace, film
node scripts/verify-soulever.mjs --suites indices --bundle dist/ds-v4s/components   # indices sans texte (plan v4)
node scripts/verify-sons.mjs --bundle dist/ds-v4s/components                       # sons du livre, ambiance, licences
```

La carte (`preview.html`, groupe « Mouvement ») lit les vraies vidéos (`videos/julie`, `photos/julie/…`) ; `&fixtures=verification/out/s/fixtures` sert les images d'essai du banc, `&format=webm` le clip VP9 (Chromium sans H.264), `&ecran=reel` la vraie fenêtre (appareils émulés), `&reglages` ajoute le menu.

## À éviter

- Placer le provider hors de l'`Ecran` (le calque ne serait plus en px d'écran ni dans les zones sûres).
- Appeler `soulever()` après un `await` ou dans un `setTimeout` : sur iPhone, `play()` n'est permis que dans le geste.
- Changer la `src` de la vidéo pendant un tourne-page (`preparer()` à l'atterrissage seulement).
- Animer autre chose que `transform` et `opacity` dans le calque, ou y poser un filtre.
