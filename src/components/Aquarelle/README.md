# Aquarelles vivantes

Une toile WebGL par page peint les illustrations puis anime leurs effets. `tableaux.ts` ajoute des
scènes SVG avec de vrais acteurs indépendants, pilotées par **la même horloge** que la toile : aucune
boucle ou animation CSS supplémentaire. Les sprites gardent leurs proportions et leur dessin.

| Tableau | Action | Durée |
| --- | --- | --- |
| `service-the` | La théière se déplace, s'incline, sert deux tasses ; le liquide reste sous la lèvre avant. | 11 s |
| `levitation` | Trois tasses décollent, flottent à des hauteurs différentes et se reposent. | 10 s |
| `coupe-citron` | Un couteau descend, deux moitiés se séparent puis se réunissent. | 11 s |
| `lapin-carotte` | Le lapin approche, grignote trois bouchées au contact de la carotte puis repart. | 11 s |
| `gateau-enchante` | Un gâteau et deux cupcakes s'envolent en arcs ; les flammes suivent les bougies. | 10 s |

Les grands tableaux démarrent après la peinture, se relaient sur une même face et reprennent après
200 à 600 ms environ. Le clic, le toucher et Entrée/Espace sur un dessin permettent de lancer son
tableau. Les icônes trop petites gardent leurs effets habituels. `cadreTableau` réserve les scènes aux
espaces illustrés : les deux citrons de Julie s'effacent ensemble pendant la coupe pour éviter les
doublons. Sur la garde, la carotte dispose d'une zone dédiée. Les repères de bouche, morsures et
attaches des fanes compensent les différences de cadrage des sprites v10.

L'horloge s'arrête hors vue, pendant le mouvement du livre et lorsque l'onglet est masqué. Le réglage
explicite « moins d'animations » conserve les images fixes, sans théâtre. La préférence système suit
le niveau `doux` défini par `lib/motion.ts`. Une perte du contexte WebGL rend les images fixes visibles.
La vitesse des tableaux suit le réglage commun de vitesse des animations.

La toile est au niveau `z-index: 4`, comme les images fixes, et le théâtre SVG au niveau 5 : ils restent
au-dessus de la lumière du papier (niveau 1). Le buffer utilise la taille réellement affichée, y compris
la réduction de la scène sur mobile, avec un DPR plafonné à 2 et un côté maximal de 1600 px.

## Vérification

`window.__gcDessins` expose `etat()`, `finir()`, `scene(nom?, type?)`, `toucher(page, x, y)`,
`figer(oui)` et `avancer(ms)`. L'état de chaque dessin contient son `tableau`, sa phase et les poses des
acteurs. Pour une pose précise : figer, lancer la scène puis avancer son horloge. Les captures de scènes
comprennent le DOM/SVG : une extraction du canvas seul ne les montre pas.

```sh
# Actions et raccords C1, sans navigateur.
node scripts/verify-dessins.mjs --suites tableaux-courbes

# Site déjà construit : départs autonomes, clavier et captures aux instants d'action.
GC_CHROME=/usr/bin/chromium node scripts/verify-dessins.mjs --site dist/site --suites tableaux
```

Les cinq scènes sont capturées sur titre/garde, fin, gâteaux et Julie. La suite vérifie aussi les contacts
géométriques, le service des deux tasses, les quatre états de carotte, la séparation des moitiés et les
raccords C1. Les images à temps déterministes prouvent les poses, pas une cadence matérielle :
Chromium SwiftShader ne mesure pas les performances d'un GPU de téléphone ou de TV.
