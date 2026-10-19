# Interprétations numériques

La playlist alterne les trois enregistrements CC BY4.0 de Kevin MacLeod avec deux rendus numériques :

- **Gymnopédie n°1**, Satie : les 39 premières mesures de la partition Mutopia, trois voix, piano, pédale et respiration légère. La source LilyPond est fournie ; son en-tête déclare le domaine public.
- **Casse-Noisette — fantaisie au célesta**, Tchaïkovski : arrangement court pour célesta, piano et cordes pincées, sur le thème de la fée Dragée. Le script contient les notes et le développement. Il ne s'agit pas d'un enregistrement orchestral.

La banque TimGM6mb (Tim Brechbill, David Bolton) est fournie avec sa licence GPL2. Pour permettre une redistribution sans ambiguïté, ces deux rendus numériques et leur script sont également proposés sous GPL2. Le fichier `banque.json` donne les crédits complets, sources et empreinte de la banque. Le reste du projet et les trois enregistrements historiques gardent leurs licences respectives.

Reproduction depuis la racine, avec Python3, NumPy, libfluidsynth3 et ffmpeg :

```sh
OMP_NUM_THREADS=1 python3 scripts/bake-musique-classique.py
node scripts/assets.mjs
```

Le script met à jour les deux MP3 et la playlist. Il ne dépend d'aucun téléchargement au moment de la lecture. Le séquenceur joue les morceaux entiers, effectue un fondu croisé de2s et continue sur le suivant. La musique attend le premier geste du lecteur, s'arrête pendant une vidéo et reprend au même endroit ; le contexte audio partagé suspend tout lorsque l'onglet est caché.
