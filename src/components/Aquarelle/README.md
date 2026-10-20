# Aquarelles vivantes

Une toile par page pilote la peinture et la même horloge anime les acteurs SVG. Aucun minuteur ni
boucle supplémentaire par objet. Les mouvements s’arrêtent hors vue, pendant les gestes et en onglet
masqué. Les sprites conservent leurs proportions et leurs pigments.

Depuis la reprise v12, le théâtre reste présent au repos : il n’échange plus l’illustration contre une
autre composition à chaque action. `TableauFixe.tsx` pose exactement les mêmes acteurs dans les
feuilles tournantes, en mode doux et sans WebGL. Le chargement attend tous les acteurs ensemble.

| Tableau | Action | Durée |
| --- | --- | --- |
| `service-the` | La même théière sert les deux mêmes tasses, qui se soulèvent pour déguster puis se reposent. | 16 s |
| `levitation` | Une seule tasse se soulève puis retrouve sa place. | 10 s |
| `coupe-citron` | Couteau, séparation des deux moitiés, réunion magique. Un seul citron sur la page de Pierrette. | 11 s |
| `carotte-grignote` | Trois bouchées, miettes et repousse ; même taille au repos et en action, fanes ancrées. | 11 s |
| `gateau-enchante` | Le gâteau reste seul, les flammes suivent les bougies, sans apparition de cupcakes supplémentaires. | 10 s |
| `oeuf-au-bol` | L’œuf arrive, la coquille s’ouvre, le jaune tombe puis le fouet mélange dans le bol. | 14 s |
| `vanille-au-bol` | La gousse se soulève et ses graines tombent dans le bol. | 12 s |
| `framboise-biscuit` | Le biscuit se casse et laisse tomber ses miettes ; les framboises rejoignent le bol. | 13 s |

Les sources transparentes et cadrages des nouveaux acteurs sont versionnés dans
`design-system/sources/illustrations/v12`. L’export conserve leurs pixels ; aucune reconstruction
rectangulaire d’une partie de dessin. Les deux anciens masques réels des citrons restent les seuls
masques autorisés. Les petites vignettes du sommaire ne deviennent pas des théâtres.

Les clics/Entrée/Espace peuvent rejouer l’action ; les scènes se lancent aussi seules. Les trois nouvelles
scènes remplacent les translations d’ensemble des œufs, vanille et framboises/spéculoos. Les autres
illustrations sans acteurs séparés conservent leurs gestes d’ensemble : ne pas prétendre que chaque
dessin du carnet possède déjà sa propre scène articulée.

Toile au niveau 4, théâtre au niveau 5, lumière du papier au niveau 1. Buffer ajusté à la taille réellement
vue, DPR plafonné à 2 et côté maximal 1600 px. Les captures SVG doivent inclure le DOM, pas seulement
le canvas WebGL.

## Vérification

```sh
node scripts/verify-coherence-v12.mjs
node scripts/verify-dessins.mjs --suites tableaux-courbes
GC_CHROME=/usr/bin/chromium node scripts/verify-tableaux-v12.mjs
GC_CHROME=/usr/bin/chromium node scripts/verify-dessins.mjs --site dist/site --suites tableaux
```

Les tests vérifient la distribution et l’échelle constantes, la pose de repos en fin de cycle, les
interactions, l’ancrage de la carotte, les pas humains espacés et les raccords de vitesse. Les captures
isolées servent à examiner les actions, les captures dans le livre à vérifier leur place dans la page.
`window.__gcDessins` expose `etat`, `finir`, `scene`, `figer`, `avancer`. `tableau` décrit aussi la pose de
repos : pour constater un départ autonome, lire `scene`, pas seulement la présence de `tableau`.
Chromium logiciel ne prouve pas la cadence du GPU d’un téléphone ou de l’ordinateur HDMI.

Depuis v14, `recettesAnimees.ts` associe les illustrations de droite à une séquence par étape réelle
(39 pour les huit recettes). `tableauDe(nom,page)` distingue la recette de l’illustration du chapitre.
Les séquences Auto conservent le résultat ; `commande(nom,'etapes'|'suivant'|'auto'|'rejouer')` pilote
la même horloge. Les légendes restent visibles pendant la scène, aucune infobulle au survol.
`verify-recettes-v14.mjs` vérifie chaque opération, `verify-recette-horloge-v14.mjs` ses vrais contrôles.
