# Bougie

Une bougie de cire crème à moitié consumée, posée sur la table dans le coin bas gauche, à gauche du livre. La scène est une table vue d'en haut : la bougie est verticale et on la voit presque du dessus, un peu en fuite vers le coin de l'écran. On voit son puits de cire liquide doré et sa mèche, son flanc couvert de coulures et la flaque de cire figée à son pied. Une goutte de cire liquide coule de temps en temps le long de deux coulures. Montée dans `Stage`, au-dessus du livre et sous les contrôles. Elle ne recouvre jamais le texte du livre.

## D'où elle vient

- **Modèle et rendu 3D** : `scripts/bougie3d/scene.py`, à lancer dans Blender (module Python `bpy`, hors dépôt). Le script fixe la caméra au-dessus de la table, à la place de celle de la scène. Il modélise ensuite :
  - un cylindre tourné, avec un cratère au sommet ;
  - des coulures en métaballes ;
  - une flaque en galette à bord en ménisque.

  Le tout est réuni par un remaillage voxel. La cire est translucide (diffusion sous la surface). Elle est éclairée par la flamme, par la cheminée hors champ à gauche, et par un peu de lumière renvoyée par le livre.
- **Cuisson** : `scripts/bake-bougie.py` (PIL et numpy). Il produit les calques WebP dans `design-system/baked/bougie/` et leur géométrie, en px de scène 1920 × 1080, dans `geometrie.json`.
- **La flamme** est la boucle d'une vraie flamme filmée (Wikimedia Commons, Jahobr, CC0 ; licence et empreinte dans `design-system/sources/bougie/credits.json`). La fenêtre de 3 s (72 images à 24 i/s, fondu enchaîné pour boucler) est détourée sur le fond statique de la cire, teintée, puis mise en perspective comme l'était la photo : vue d'en haut, une flamme se raccourcit et pointe vers le coin de l'écran. Les images sont rangées dans une planche en grille, avec leur luminosité et leur hauteur relatives (`geometrie.json`).

Recuire :

```sh
uv venv -p 3.11 <dossier>/.venv && uv pip install -p <dossier>/.venv/bin/python "bpy==4.2.*"
<dossier>/.venv/bin/python scripts/bougie3d/scene.py verification/out/v5-bougie3d/rendu   # ≈ 25 min
tools/ecriture/.venv/bin/python -I scripts/bake-bougie.py
npm run assets
```

La vidéo de la flamme doit être dans `verification/out/bougie2/originaux/White_candle_video.webm` (non versionnée, sha256 vérifié) ; `ffmpeg` la lit. `--apercu` fait un rendu rapide, et `--seulement bougie,gouttes,ombre` ne refait que certaines passes.

## Props

| Prop | Type | Défaut | Rôle |
|---|---|---|---|
| `className` | `string` | — | Classe ajoutée à la racine `.gc-bougie`. |

## Calques

De bas en haut :

| Calque | Fichier | Animation |
|---|---|---|
| Ombre portée par la cheminée sur la table | `ombre.webp` (alpha) | opacité suivant l'intensité du feu ; glisse à l'opposé de la source (`dx`, `dy`) |
| Lueur de la flamme sur la table | `halo.webp` | opacité (`intensite`), échelle 0,96 à 1,04, glisse ≤ 9 px (`dx`) |
| Cire, flamme basse | `cire.webp` | aucune |
| Cire, flamme haute | `cire-vive.webp` | opacité 0,12 à 0,9 suivant l'intensité : la cire s'éclaire et s'assombrit avec sa flamme |
| Gouttes qui coulent | `goutte-1.webp`, `goutte-3.webp` | planches de 48 images, plus une image vide. Une animation Web les fait défiler par paliers (`transform`, `steps`), à 20 images par seconde. Il passe une goutte toutes les 14 s par coulure, en décalé. |
| Flamme | `flamme.webp` (planche de 72 images, 8 colonnes) | une case par image, à 24 i/s, par une animation Web en paliers (`transform`). Échelle 0,96 à 1,04, opacité 0,7 à 1, rotation ≤ 2° autour de la mèche (`pivot`). La lumière tracée suit la luminosité de l'image, la lueur sur la table sa hauteur. |

Tout passe par `transform` et `opacity`. Aucun filtre (CSS ou SVG) ni `mix-blend-mode` à l'exécution : le flou de profondeur de champ, très léger, est cuit.

## Mouvement réduit et téléphone

- Mouvement réduit (système ou réglage du carnet) ou réglage `feu: false` : tout est immobile. La flamme est fixe, la cire éclairée reste à mi-opacité, et aucune goutte ne coule.
- Téléphone en portrait (`orientation: portrait` et largeur ≤ 760 px) : la bougie est masquée, on ne garde que la lueur.

## À éviter

- Poser une bougie vue de côté (photo de profil) : la table est vue d'en haut, la bougie doit l'être aussi.
- Animer un `filter`, un `box-shadow` ou `background-position` : le budget de calques de la scène est compté (`scripts/verify-lumiere.mjs`, CONTRACT § 10).
- Déplacer la bougie sur le livre : elle doit rester à gauche du carton, hors du texte.
