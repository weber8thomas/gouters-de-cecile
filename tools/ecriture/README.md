# Écriture générée trait par trait

Plus de polices : chaque invité écrit **de sa main**, générée trait par trait comme un vrai
stylo. Chaque lettre est différente, les lettres se lient, le stylo se lève, appuie, accélère ;
l'encre se charge et pâlit. La sortie est une liste de traits (points avec pression, vitesse et
quantité d'encre), en unités de **hauteur d'x**, prête à être cuite dans le papier par l'étape
suivante.

![spécimen](../../verification/out/n2/specimen.png)

## Démarrage

```sh
bash tools/ecriture/telecharger.sh          # venv + poids et données (≈ 175 Mo dans vendor/) + conversion
tools/ecriture/.venv/bin/python tools/ecriture/ecrire.py --style soignee --graine 4127 --largeur 14 \
    "Le cake citron de Julie"               # JSON sur la sortie standard
tools/ecriture/.venv/bin/python tools/ecriture/ecrire.py --style mamie --svg apercu.svg "3 œufs, ½ sachet"
tools/ecriture/.venv/bin/python tools/ecriture/specimen.py   # verification/out/n2/specimen.{svg,png,json}
tools/ecriture/.venv/bin/python tools/ecriture/banc.py       # verification/out/n2/performances.json
```

Options de la CLI : `--style` (mamie, ecole, soignee, ado, papa, pressee, cecile), `--graine`,
`--largeur` (hauteurs d'x), `--interligne`, `--pente` (degrés, pente des lignes, négatif = monte),
`--inclinaison` (degrés ajoutés à la pente des lettres), `--encre` (plume, brune, noire, bic,
crayon, feutre, rouge, chocolat), `--outil` (plume, bille, crayon, feutre), `--biais`,
`--candidats`, `--svg fichier.svg`, `--lumiere 0.3` (aperçu), `--rapide` (sans relecture),
`--sans-cache`, `--compact`, `--styles` (liste les mains). `\n` dans le texte force un retour à
la ligne.

API Python :

```python
import sys; sys.path.insert(0, "tools/ecriture")
from ecrire import ecrire
page = ecrire("Le cake citron de Julie", style="soignee", graine=4127, largeur_max=14,
              encre=None, outil=None,          # défaut : l'encre et l'outil de la main
              pente=None, inclinaison=0.0,     # degrés ; défaut : ceux de la main
              interligne=None, biais=None, candidats=None, cache=True, relire=True)
import rendu; open("apercu.svg", "w").write(rendu.svg(page, lumiere=0.3))
```

`ecrire()` est **déterministe** : même texte, même main, même graine, même encre → mêmes
traits (vérifié bit à bit sur deux exécutions sans cache). Un cache disque par (texte, main,
graine, réglages) vit dans `tools/ecriture/.cache/` (non versionné) : une page déjà écrite
revient en ~50 ms sans charger le réseau. La césure (`largeur_max`), la pente, l'inclinaison
et l'encre sont recalculées à chaque appel (rapide) : les changer ne régénère aucun mot.

**Stabilité (pour N3 « Pages cuites »)** : la signature d'`ecrire()` et le format ci-dessous ne
changeront que par ajouts. Changement par rapport aux toutes premières sorties : chaque point
a désormais **5 valeurs** (`encre` ajoutée en 5e position, `point` donne l'ordre).

## Format de sortie

```jsonc
{
  "version": 26, "texte": "...", "style": "soignee", "graine": 4127,
  "unite": "hauteur_x",                       // 1 = la hauteur d'un « x » de cette main
  "point": ["x", "y", "pression", "vitesse", "encre"],
  "largeur_max": 14, "interligne": 3.0,       // interligne de la main (hauteurs d'x)
  "pente": -0.3, "inclinaison": 0.0,          // degrés effectivement appliqués (lignes, lettres)
  "taille_conseillee": 1.0,                   // taille relative conseillée entre les mains
  "epaisseur_conseillee": 0.115,              // épaisseur du trait à pression 1 (hauteurs d'x)
  "boite": [x0, y0, x1, y1],                  // tout le texte
  "lignes": [{
    "boite": [...], "ligne_de_base": [[x0, y0], [x1, y1]],
    "mots": [{
      "texte": "cake",                       // tel qu'écrit (avec accents, ponctuation)
      "boite": [...],                        // toute l'encre du mot (accents compris)
      "ligne_de_base": [[x0, y0], [x1, y1]], // suit la pente et la rotation du mot
      "hauteur_x": 1.01, "haut_x": [x, y],   // haut des minuscules au début du mot
      "score": [1.9], "lecture": [0.12],     // par segment écrit par le réseau : score géométrique
      "lu": [true],                          // (bas = bien) ; relecture TrOCR : écart à la note du
                                             // mot dans une police propre, et « lu » = relu comme
                                             // le mot attendu (false : meilleur candidat trouvé,
                                             // mais douteux → changer la graine du bloc)
      "traits": [[[x, y, p, v, e], ...], ...] // dans l'ordre où le stylo les trace
    }]
  }],
  "encre": {"id": "bic", "outil": "bille", "charge": "#2e2e49", "clair": "#6c6b84",
            "parametres": {"sauts": 1.1, "saut_long": [0.02, 0.06], "pate": 0.12},
            "trempes": [[ligne, mot], ...]}, // plume : mots où l'on a retrempé
  "non_geres": [],                           // caractères ignorés (aucun pour le français courant)
  "cache": false, "duree_s": 1.4
}
```

- Repère : x vers la droite, **y vers le bas**, première ligne de base vers y = 0 ; mettre à
  l'échelle en multipliant par la hauteur d'x visée (`--gc-x-<rôle>` × `taille_conseillee`).
- Points denses (≤ 0,05 hauteur d'x entre deux points), lissés, dans l'ordre du tracé : on
  peut animer l'écriture (le temps entre deux points ∝ distance / vitesse).
- `pression` (0–1) : appui effectif, donne l'**épaisseur** : largeur ≈ `epaisseur_conseillee`
  × (0,42 + 0,78 p). Pour la plume, elle inclut l'ouverture du bec (pleins 2 à 3 × les déliés).
- `vitesse` : vitesse relative du stylo (1 = médiane du mot) ; > 1 rapide (trait plus fin,
  plus clair), < 1 lent (départs, arrêts, virages).
- `encre` (0–1) : quantité d'encre déposée (voir « Encres »).
- Ratures, soulignés : utiliser `ligne_de_base`, `haut_x` et `boite` de chaque mot (milieu de
  la hauteur d'x = ligne de base + 0,5 × (haut_x − ligne de base)).

## Technique retenue

**Synthèse d'écriture neuronale de Graves (2013)** : LSTM à 3 couches, fenêtre d'attention
gaussienne qui avance dans le texte, mélange de 20 gaussiennes pour chaque déplacement du
stylo (+ probabilité de lever le stylo). Le réseau a appris sur ~10 000 lignes d'écriture
réelle captées au stylo (IAM-OnDB) : les traits sont ceux de vraies mains, pas d'une police.

Essais qui ont mené là :

1. `sjvasquez/handwriting-synthesis` (piste initiale) : **aucune licence** dans le dépôt
   (vérifié : pas de fichier LICENSE, GitHub n'en déclare pas) → tous droits réservés,
   **écarté** (et effacé de `vendor/`).
2. Deux jeux de poids **MIT** trouvés et portés en NumPy (lecteurs de point de contrôle écrits
   à la main, sans PyTorch ni TensorFlow) : `X-rayLaser/pytorch-handwriting-synthesis-toolkit`
   (PyTorch, `Epoch_52`) et `Grzego/handwriting-generation` (TensorFlow 1). Comparés sur les
   mêmes phrases : X-rayLaser écrit plus droit et plus lisiblement (Grzego fait monter les
   lignes et se trompe davantage) ; Grzego fournit en revanche **8 lignes d'amorce** (vraies
   écritures d'IAM-OnDB) qui donnent les « mains ». Retenu : **réseau X-rayLaser + amorces
   Grzego** (mises à l'échelle du réseau ×87,6 et redressées à l'horizontale).
3. Ligne entière d'un coup : instable au-delà de ~30 caractères (le réseau a appris sur des
   séquences tronquées à 700 points). → **Mot par mot**, tous les mots d'un texte en un seul
   lot (plusieurs candidats par mot), chaque mot précédé de la ligne d'amorce et suivi d'un mot
   fictif (« the », « The » après . ! ?) pour que le réseau le finisse comme en milieu de ligne.
   Avantages : césure exacte, boîte de chaque mot, rapidité, robustesse.
4. Corrections indispensables trouvées en regardant les rendus :
   - fin de trait **tirée au sort** (et non au seuil 0,5 du code d'origine : le stylo restait
     posé et le réseau partait en traîne tremblée) ; anti-calage (biais relâché quand le stylo
     n'avance plus) ;
   - l'attention devance la lettre tracée d'≈ 0,35 lettre : on en tient compte pour
     attribuer chaque point à sa lettre (accents, points, barres) ;
   - nettoyage : souvenirs de l'amorce avant le mot, début du mot fictif, grands traits
     parasites qui reviennent en arrière ;
   - ponctuation finale, « x » final et ½ **dessinés** (le réseau, anglais, changeait le point
     en virgule, ratait le « x » de « joyeux ») ; points sur i/j et barres de t ajoutés
     quand le réseau les oublie (jamais en double).
5. **Choix du candidat lisible** : chaque candidat reçoit un score géométrique (lettre sautée
   ou bégayée, trait hors gabarit, largeur), puis est **relu par TrOCR** (reconnaissance
   d'écriture manuscrite, MIT) : on calcule log P(mot | image) en forçant le décodeur sur le
   mot attendu, comparé à la note du même mot écrit dans une police manuscrite propre (Kalam,
   OFL, déjà dans le projet) pour ne pas pénaliser les mots rares (« jusqu'à », « blanchisse »).
   On relit les candidats dans l'ordre du score jusqu'à en trouver un bien lu ; sinon on en
   redemande (3 tentatives, biais croissant, deux fois plus de tirages). Le modèle de langue de
   TrOCR « corrige » volontiers (« Ceile » lu « Cecile ») : un mot n'est accepté que si
   (a) chaque jeton attendu est (à 1,2 nat près) le premier choix du lecteur — un écart toléré
   pour les mots de 3 jetons et plus —, et (b) le même mot **amputé d'une lettre** ne se lit pas
   mieux (hors lettres doubles), le tout relativement à la police propre. C'est ce qui rend les
   mains cursives lisibles.
6. Accents et signes : la lettre de base est écrite par le réseau, le diacritique est tracé au
   stylo (petit trait vif, chevron, deux points, crochet de cédille), centré sur la lettre
   (points attribués à la lettre), posé au-dessus du haut de la lettre, décalé selon la pente
   de l'écriture ; le point du i est retiré sous î et ï. **« œ »** : « oe » écrit par le
   réseau, puis le e ramené de 0,3 hauteur d'x sur le o en douceur le long de la liaison
   (ligature, sans cassure du trait).
7. **Amorces « maison »** (`amorces_maison.py`, `amorces/*.npz`, versionnés) : les deux mains
   IAM les plus ambiguës (cursive n° 7 où « rs » ressemble à « n », rapide n° 2) sont d'abord
   recopiées au propre par le réseau lui-même (une ligne anglaise, biais 2,2, choisie sur
   planche `verification/out/n2/amorces-<main>.png`), puis servent d'amorce : même main, bien
   moins d'erreurs. « Mamie » et « pressée » les utilisent.

Repli procédural (polices « single-line ») : non utilisé — la voie neuronale fonctionne.

## Les mains

| Main | Amorce (IAM-OnDB, via Grzego) | Biais | Pente ajoutée | Encre (outil) | Caractère |
|---|---|---|---|---|---|
| `mamie` | maison, d'après n° 7 « prison welfare Officer complement » | 2,0 | +6° | brune (plume) | cursive liée, penchée, à l'ancienne |
| `ecole` | n° 3 « to need them, my eyes suddenly » | 2,0 | −2° | plume (plume) | semi-cursive sage, droite |
| `soignee` | n° 1 « Floor agreed. They rested on a bare » | 2,0 | 0° | bic (bille) | script adulte net, la plus lisible |
| `ado` | n° 6 « He dismissed the idea » | 1,7 | −3° | feutre (feutre) | ronde, grosse (taille 1,15), aérée |
| `papa` | n° 5 « She looked closely as she » | 2,4 | −4° | noire (bille) | script droit à lettres détachées |
| `pressee` | maison, d'après n° 2 « pump. At least, I don't think » | 1,5 | +8° | bic (bille) | rapide, très penchée, petite (0,9) |
| `cecile` | n° 4 « with a right-wing slant. » | 1,7 | +2° | chocolat (feutre) | vive, ronde, lisible : la main du livre |

Réglages par main dans `styles.py` : biais, candidats (6 pour les cursives), largeur, taille
conseillée, interligne (2,9 à 3,6 hauteurs d'x), espace entre mots, nervosité (dérive de ligne,
rotation des mots), pente de ligne, épaisseur. **Papa** : le réseau ne sait pas écrire des
mots entiers en capitales (essayé : illisible) → script droit à lettres détachées.

Mise en page (`mettre_en_page`) : césure par mot (jamais dans un mot, groupes insécables
« 120 g », « Cécile ! »), espaces inégaux (±12 %), lignes en légère pente avec une onde lente,
marge de gauche qui flotte, interligne qui varie un peu, mots légèrement tournés et redimensionnés
(± 2 à 5 %), tout cela à graine.

## Encres

Chaque point porte la quantité d'encre déposée `e` ∈ [0, 1], selon l'**outil** (`encre.py`,
déterministe par graine) :

| Outil | Comportement |
|---|---|
| plume | pleine et foncée après une trempée, se vide sur ≈ 5 à 15 mots (capacité 90–170 hauteurs d'x de trait), on retrempe au début d'un mot quand la réserve passe sous 12–30 % (`encre.trempes`) ; petites flaques aux arrêts, virages lents et bas de boucles ; pleins/déliés (pression) |
| bille | régulière (± 5 %), épaisseur presque constante ; petits sauts pâles (2–6 % de hauteur d'x) dans les traits rapides ; petit pâté au départ de 12 % des traits |
| crayon | suit l'appui ; plus clair et granuleux dans les traits rapides ; pas de plein/délié |
| feutre | très régulier ; plus foncé là où deux traits se croisent (double couche) |
| toutes | trait rapide = plus fin et plus clair ; trait lent, départs et arrêts = plus foncés |

Nuances (mesurées sur de vrais carnets, `design-system/docs/references-carnets.md` § 4.4) :

| Encre | Outil par défaut | Chargée (e = 1) | Claire (e ≈ 0,5) | Source |
|---|---|---|---|---|
| plume | plume | `#30375a` | `#7f8199` | bleu-noir tiré vers le gris (réf. 29, 30) |
| brune | plume | `#60533f` | `#9a8a6c` | ferrogallique (réf. 09) |
| noire | plume | `#2a1d12` | `#6e5b42` | noire brunie vers 1900 (réf. 13, 16) |
| bic | bille | `#2e2e49` | `#6c6b84` | bille bleue 1963 (réf. 25) |
| crayon | crayon | `#8d836a` | `#a69b82` | mine de plomb (réf. 18) |
| feutre | feutre | `#4a3d5f` | `#7a7090` | gc-ink-feutre sourdi |
| rouge | bille | `#83432f` | `#b17f6e` | rouge de correction (réf. 05) |
| chocolat | feutre | `#3d281b` | `#7c6450` | main de Cécile (gc-ink) |

Couleur d'un point (`encre.couleurs`, utilisée par l'aperçu et réutilisable à la cuisson) :
t = e − 0,07 × max(0, v − 1) ; t ≥ 0,5 → de `clair` à `charge` ; t < 0,5 → de « presque
papier » (22 % d'encre) à `clair`. L'encre n'est jamais un aplat.

**Aperçu** (`rendu.py`) : chaque trait est un ruban de petits quadrilatères + disques aux
jointures, couleur opaque pré-mélangée au papier (`#eee1bf`, médiane des vrais carnets) point
par point : pas de couture visible, pas de dégradé SVG.

**Lumière** (fin d'après-midi, chaude, du haut à gauche) : `rendu.svg(page, lumiere=0.3)`.
λ = clip(1 − (0,85 u + 1,15 v), −1, 1) avec (u, v) la position sur la page (0 en haut à
gauche) ; couleur × (1,035 ; 1 ; 0,95) × 1,05 vers la lumière (λ > 0, poids 0,3 λ), × (0,95 ;
0,965 ; 1,02) × 0,92 vers l'ombre ; reflet très léger (`#fff6e0`, 22 %) sur le bord tourné vers
la lumière des traits de plume frais et chargés (e > 0,82). **Pour la cuisson** : faire la même
chose en coordonnées de page réelles (passer `page=(x0, y0, x1, y1)` du bloc dans la page à
`rendu.groupe`, ou recalculer λ), puis multiplier l'encre sur le vrai papier (opacité selon
`e` et l'épaisseur : les traits fins prennent 40 à 60 % de la couleur du papier).

**Pour la cuisson (N3)**, tout est réutilisable tel quel :

```python
import numpy as np, encre, rendu
T = np.asarray(mot["traits"][k])                 # [x, y, pression, vitesse, encre]
lam = 0.3 * rendu.lumiere_page(X_page, Y_page, page=(0, 0, largeur_page, hauteur_page))
rgb = encre.couleurs(T[:, 4], T[:, 3], page["encre"]["id"], "#eee1bf", lumiere=lam)  # (n, 3) 0–255
largeur = page["epaisseur_conseillee"] * (0.42 + 0.78 * T[:, 2])   # en hauteurs d'x
encre.ENCRES, encre.OUTILS                       # nuances et réglages de chaque encre / outil
```

## Licences (à citer dans le README du projet)

| Élément | Licence | Utilisation |
|---|---|---|
| Poids du réseau d'écriture : X-rayLaser, *pytorch-handwriting-synthesis-toolkit*, © 2021 Evgenii Dolotov, commit `899e943` | **MIT** | `vendor/xray` → `vendor/poids/xray_epoch_52.npz` |
| Lignes d'amorce : Grzego, *handwriting-generation*, © 2018 Grzegorz Opoka, commit `26a618b` | **MIT** | `vendor/grzego/data` → `vendor/poids/amorces.npz` |
| Relecteur : TrOCR small handwritten, Microsoft (`microsoft/unilm`), export ONNX Xenova rév. `2432e24` | **MIT** (licence du dépôt unilm ; pas de licence séparée pour les poids) | `vendor/trocr`, choix des candidats seulement |
| Police de référence du relecteur : Kalam | OFL (déjà dans `design-system/fonts`) | image témoin, jamais dans le tracé |
| Données d'apprentissage : **IAM On-Line Handwriting Database** (Liwicki & Bunke, 2005) | **usage de recherche non commercial** | les poids en sont dérivés et les 8 amorces en sont des extraits |
| Amorces maison (`amorces/*.npz`) | sorties du réseau ci-dessus (pas des données IAM) | versionnées, petites (≈ 7 Ko) |
| Code de ce dossier | celui du projet | |

Ce que cela implique : citer les deux dépôts MIT (avec leur avis de copyright), TrOCR, et
IAM-OnDB (« M. Liwicki and H. Bunke, IAM-OnDB – an On-Line English Sentence Database
Acquired from Handwritten Text on a Whiteboard, ICDAR 2005 ») dans le README du projet.
Le carnet est privé et non commercial (anniversaire) : compatible avec les conditions
d'IAM-OnDB ; **une diffusion commerciale demanderait de réentraîner sur d'autres données**.
Les traits générés ne sont pas des copies d'IAM (le réseau écrit des mots qu'il n'a jamais
vus), mais leur style vient de ces écritures réelles.

## Performances

Mesurées par `banc.py` (CPU Xeon 2,1 GHz, 1 fil BLAS ; plus rapide qu'en multi-fil ici),
ligne de ≈ 40 caractères, sans cache — détail dans `verification/out/n2/performances.json` :

| Main | Relu (défaut) : médiane / max | `--rapide` : médiane / max |
|---|---|---|
| mamie | 3,6 s / 3,7 s | 1,2 s / 1,3 s |
| ecole | 5,0 s / 5,3 s | 1,0 s / 1,4 s |
| soignee | 2,8 s / 3,9 s | 1,0 s / 1,1 s |
| ado | 2,6 s / 3,9 s | 0,9 s / 1,1 s |
| papa | 3,2 s / 3,2 s | 0,8 s / 0,8 s |
| pressee | 8,6 s / 9,1 s | 1,2 s / 1,4 s |
| cecile | 3,5 s / 5,3 s | 0,9 s / 1,0 s |
| depuis le cache | 0,01 s | 0,01 s |

- Le premier appel d'un processus charge le réseau (≈ 0,3 s), le relecteur (≈ 1 s) et lit
  chaque main (≈ 1 s, puis en cache disque).
- Le réseau lui-même : ≈ 0,5–1 s pour tous les mots d'une ligne (lot de 30–60 lignes de calcul).
  La relecture coûte ≈ 0,3–0,4 s par image de 6 mots (+ vérification des lettres manquantes) ;
  les mots difficiles demandent une 2e ou 3e tentative (la main pressée presque toujours).
- `--rapide` (sans relecture) tient l'objectif de 2 s par ligne, mais laisse passer plus de
  lettres ratées dans les mains cursives (mamie, ecole, pressee). Le mode par défaut (relu)
  est fait pour cuire les pages une fois (cache).

## Limites

- Alphabet du réseau (IAM) : `a–z A–Z 0–9 ! " # % ' ( ) + , - . / : ; ? [` et l'espace.
  Tout le français courant passe (accents dessinés, œ en ligature, ’ → ', « » ° ½ ¼ ¾ = * € dessinés,
  … → ..., & → et). Caractères vraiment absents (@, $, ~…) : ignorés et listés dans
  `non_geres`.
- Mots entièrement en capitales : mal écrits par le réseau (il n'en a presque pas vu).
- Le réseau a appris l'anglais : certaines suites françaises restent fragiles. Le relecteur
  rattrape l'essentiel, pas tout : TrOCR lit parfois juste un mot imparfait (vu sur le
  spécimen : « Fouette » de la main soignée, graine 4167, dont le 2e t ressemble à « ti » ;
  « Rose » lu dans un « Rase » de la main pressée). Les mots que la relecture n'a pas validés
  portent `lu: false`. Changer la graine du bloc suffit à corriger un mot raté.
- Pas de liaison entre deux mots (on lève le stylo entre les mots, comme presque tout le monde).
- Déterminisme garanti sur une même installation (même NumPy/OpenBLAS) ; une autre machine peut
  donner d'autres tracés → **versionner le JSON produit**, pas le régénérer à la volée.
- Le relecteur ne lit pas les chiffres ni les mots d'une lettre (choix géométrique seul).

## Fichiers

| Fichier | Rôle |
|---|---|
| `ecrire.py` | API `ecrire()` + CLI : mains, génération par lots, analyse et score des candidats, accents, points/barres, ligature œ, mise en page, cache |
| `amorces_maison.py`, `amorces/*.npz` | amorces recopiées au propre par le réseau (mamie, pressee) |
| `moteur.py` | inférence NumPy du réseau (LSTM peephole, attention, mélange), lots déterministes |
| `lecteur.py` | relecture TrOCR (ONNX) des candidats |
| `texte.py` | découpe en mots, accents, ponctuation, insécables |
| `diacritiques.py` | accents et glyphes tracés (« » ° ½ . , ! ? x …) |
| `encre.py` | quantité d'encre par point selon l'outil, nuances des encres, couleur et lumière |
| `rendu.py` | aperçu SVG (rubans dégradés, lumière) |
| `styles.py` | les sept mains |
| `specimen.py`, `banc.py`, `rendre_png.mjs` | spécimen, mesures, rendu PNG (Chromium) |
| `convertir_poids.py`, `telecharger.sh`, `requirements.txt` | installation (sans PyTorch ni TensorFlow) |

Non versionnés : `tools/ecriture/.venv` (≈ 180 Mo), `tools/ecriture/.cache`, `vendor/`
(≈ 175 Mo : `xray` 29 Mo, `grzego` 0,4 Mo, `trocr` 127 Mo, `poids` 15 Mo).
