# Lumiere

## Éclairage Cycles (actif)

Quand `lumiere/vide` est présent dans l'inventaire, les anciens dégradés CSS ci-dessous sont remplacés
par trois images par état : fond, variation du feu, variation de la bougie. La flamme de la bougie
pilote l'opacité de son voile ; aucune animation de filtre ou de peinture supplémentaire.

La cuisson `scripts/lumiere3d/composer.py` prolonge l'illumination du papier sur le repli des cartons.
Le modèle 3D simplifié possédait son propre biseau spéculaire, qui dessinait une deuxième bande claire
ou sombre par-dessus les chants déjà présents dans les images du livre. La correction conserve les
ombres portées sur la table. La bougie contribue davantage sur le papier à partir de sa variation
tracée, avec un plafond à l'albédo du papier : la flamme et la taille de la bougie ne changent pas.
Cette retouche est une correction de composition des rendus existants, pas un nouveau lancer de rayons.

Reproduire sans les lourdes passes EXR :

```sh
python3 scripts/lumiere3d/composer.py --retoucher-cuisson
npm run assets
```

`scripts/lumiere3d/calques-cycles-v1.zip` conserve les trente calques originaux et leurs SHA256,
vérifiés avant lecture. La commande relit toujours ces originaux ; la sortie n'est jamais son entrée.
`--seulement moyenne-ouvert` permet une vérification ciblée. Les prochains rendus bruts passent par
la même correction dans le compositeur. Dépendances : Python 3, NumPy, Pillow.

Vérification adaptée aux calques Cycles :

```sh
GC_CHROME=/usr/bin/chromium node scripts/verify-lumiere-v8.mjs --site dist/site
```

Le script couvre les trois crans, livre fermé et ouvert, deux orientations de tablette, le zoom fin,
les modes réduit et feu désactivé, et le contraste sur les mêmes pixels d'encre en remplaçant uniquement
les images de lumière par les originaux Cycles. Il ne mesure pas la cadence GPU de la TV physique.

## Dégradés CSS (repli sans images Cycles)

La lumière d'un feu de cheminée hors champ, **à gauche** de la table (plan v4, lot L). Calques de dégradés statiques, peints une fois ; le feu (`src/lib/feu.ts`) ne change que leur opacité et leur translation (MotionValues, aucun rendu React).

| Composant | Où | Contenu | Vivant |
|---|---|---|---|
| `LumiereTable` | sous le contenu (`Stage`) | lueur indirecte orangée côté feu (une seule nappe, très douce), ombre portée générique du livre au repos (cachée livre fermé, pendant l'arrivée, ou si `OmbreFeu` est monté) | opacité + translation (1 calque) |
| `LumiereLivre` | au-dessus du contenu (`Stage`) | ambiance du soir (bandes de bord ou vignettage, pénombre loin du feu), voile chaud plus fort côté feu | voile : opacité (1 calque) ; ambiance statique |
| `OmbreFeu` | **montée dans `Livre`** (`.gc-livre__corps`, avant les cartons, v5) | ombre portée du livre vers la droite, au bord du carton ; elle suit la source (dx, dy) et l'intensité | opacité + translation |

Couleurs : `--gc-feu-flamme`, `--gc-feu-braise`, `--gc-feu-nuit` (mélanges de tokens ; nuit = encre + encre noire) ; source `--gc-feu-x`, `--gc-feu-y` (px de scène).

Vacillement (v5) : l'intensité de `feu.ts` va de 0,6 à 1,6 ; chaque calque la traduit en opacité par `reglage()` (bain 0,2 → 1, ombre 0,2 → 1, voile 0,25 → 1). La table est sombre sur ses bords et au loin (vignettage et nuit, `Stage.css`) ; le livre reste le point le plus clair.

Lisibilité : le voile reste ≤ 4,2 % sur la colonne de texte gauche au plus fort d'une flambée ; la pénombre ≤ 6 % à droite. L'encre garde ≥ 90 % de son contraste (`scripts/verify-lumiere.mjs`).
