# Magie

La magie du carnet, façon livre de sorcier : de l'or qui suit les pages, de la poussière qui danse dans la lumière de la bougie, de l'encre qui s'écrit toute seule, des photos qui vivent. Le tout tient dans **une seule toile WebGL par livre**, montée par `Livre` dans la caméra, juste au-dessus du livre. La toile suit donc le zoom, l'ouverture et le glissement d'une page à l'autre, et compte pour un seul calque composité. Elle ne capte jamais le pointeur. Le moteur (`moteur.ts`) fait tout hors React : aucun rendu pendant un geste. Il lit le DOM seulement au repos.

## Ce qu'elle fait

- **Gerbe d'or à chaque tour de page**, quel que soit le chemin : doigt, clic dans la marge, flèches, clavier (la main invisible), sommaire, « Aller à… », Début / Fin, couverture et plat arrière.
  - Des étincelles naissent le long du bord libre de la feuille. Ce bord est calculé comme dans `Livre` : `angles`, `bordProjete`, perspective, mouvement de caméra de l'ouverture. Elles sont émises à la mesure de sa vitesse, avec un trait de lumière sur le bord.
  - D'autres suivent le coin saisi (rabats du coin 2D) ; une bouffée d'or s'échappe de dessous la feuille quand elle se pose.
  - À l'ouverture de la couverture, la gerbe est plus généreuse, et un petit feu d'artifice d'or, sobre, éclate au-dessus du livre ouvert (trois gerbes, puis un crépitement d'étoiles).
- **Poussière d'or** (`poussiere.ts`) : des grains flottent dans la lumière de la bougie, plus nombreux et plus clairs près de la flamme, et montent dans sa chaleur. La main qui passe les fait tourbillonner (`lib/pointeur`). Une flambée du feu (`abonnerFlambee`) les avive et fait monter des braises ; un crépitement allume des étoiles.
- **Titres** : de temps en temps, un reflet doré passe sur l'encre d'un titre, d'un bandeau ou d'un chapitre. Il est masqué par l'encre cuite du titre : seules les lettres brillent. Toucher un titre, ou le survoler à la souris, y dessine un paraphe d'or qui sèche puis s'efface.
- **Encre magique** (`encre.ts`) :
  - une fois la page écrite, une frise s'écrit toute seule sous le titre d'un chapitre (et sur les pages de titre, du sommaire et de l'album) ;
  - des ornements d'angle s'écrivent dans un ou deux coins libres, plume large, or humide qui sèche en encre de la page ; ils restent ensuite ;
  - de temps en temps, les pas du maraudeur se promènent dans le papier libre, puis s'effacent.
- **La plume** qui écrit la page (`PageCuite/encreVivante`, événements `ecouterPlume`) laisse des paillettes derrière sa pointe, puis une bouffée quand elle a fini.
- **Vignettes vivantes** (`photos.ts`) : une vignette qui a une boucle la joue en continu, muette, virée au ton du tirage, dès que la double page est posée et visible (jamais pendant un geste). C'est la vraie vidéo d'un invité ou de l'album, ou, version locale, sa boucle de **parallaxe** de 4 s au ratio de la photo (`data-gc-parallaxe` sur la vignette, `prive/baked/parallaxe/`, voir `scripts/medias-local.mjs`). La toile pose sur la zone photo la même image et redessine par-dessus les coins et le ▶ ; le DOM n'est pas touché. Le tirage reste mat : ni reflet, ni respiration, ni parallaxe sous la main. La photo ouverte est la vraie photo fixe (`Soulever`).
- **Coût** : au repos, aucun rAF. Chaque nouvelle image vidéo (`requestVideoFrameCallback`) réveille le moteur, qui redessine au plus 30 fois par seconde et n'envoie à la carte graphique que les textures dont l'image a changé ; il ne garde la boucle d'images que pendant un geste, une animation ou un fondu. Seules les vignettes de la double page visible jouent : les autres boucles sont arrêtées et leurs éléments vidéo relâchés, de même qu'une photo soulevée arrête tout derrière elle. `window.__gcMagieRaf = true` rend l'ancienne boucle (un rAF continu) pour comparer les mesures.

## Ce qu'elle sait de la page

`carte.json` vient de `scripts/bake-magie.py` (recalculé depuis la mise en page, sans rien recuire) :

```sh
tools/ecriture/.venv/bin/python scripts/bake-magie.py
```

Il donne, par page :

- les boîtes et la pente des titres, avec la couleur de leur encre ;
- la grille du papier libre, en cases de 50 px de page ;
- le chemin de la plume, à la même horloge que la carte des temps de l'encre ;
- la couleur de l'encre de la page.

Les photos, aquarelles, croquis et le feuillet volant viennent du manifeste des pages, au chargement.

## Coût et pauses

- **Toile** : un seul calque.
  - Sa définition est bornée : au plus 2 px de toile par px d'écran, et au plus 2,4 Mpx (1,6 Mpx au doigt).
  - Elle tourne à 60 images/s quand quelque chose bouge et à 30 au calme. Elle dort (un coup d'œil tous les quarts de seconde) quand rien n'est à l'écran.
  - Sur un petit écran (téléphone couché, scène réduite à ≈ 0,36), l'or est grossi (≈ ×2) pour rester visible ; il y a moins de grains au doigt. Sur un grand écran, qu'on regarde de plus loin, il l'est un peu aussi (×1,25).
- **Pas de temps** : il est calculé à un seul endroit (`image()` dans `moteur.ts`), multiplié par `vitesseAnimations()` : c'est là que se branche le réglage « vitesse des animations » (`facteurAnimations()`).
- **Pauses** : la magie s'arrête quand l'onglet est caché. Elle est cachée sous la loupe (zoomée, ou pendant son geste).
- **Mouvement réduit** :
  - pas de trajectoires rapides : des étoiles scintillent sur place au changement de page et à l'ouverture ;
  - la poussière est lente, les ornements et paraphes viennent en fondu ;
  - ni pas du maraudeur, ni reflets, ni photos qui bougent, ni vidéo.
- **Sans WebGL**, ou si le contexte est perdu (`webglcontextlost`) : la toile s'efface, et le livre reste le même.

## Props

| Prop | Type | Rôle |
|---|---|---|
| `p` | `MotionValue<number>` | La MotionValue du tourne-page. |
| `tour` | `{ current: TourMagie \| null }` | Le tour en cours (`sens`, `couverture`, `arriere`, `but`). |
| `rabats` | `{ current: { gauche, droite } }` | Les rabats du coin qui suit le doigt (`fx`, `fy`). |
| `livre` | `{ current: HTMLElement \| null }` | La racine `.gc-livre` : gestes (`gc-livre-geste`), touchers (`gc-livre-toucher`), pages visibles. |
| `zoom` | `{ current: number }` | Zoom de la caméra (recul de l'ouverture). |
| `geo` | `GeometrieLivre \| null` | Géométrie du cran (px de scène). |

## Débogage

`window.__gcMagie` (dernier livre monté) : `etat()`, `feuDArtifice()`, `pas()`, `reflet()`, `paraphe()`, `titres()`, `ornements()`, `mesurer()`.
