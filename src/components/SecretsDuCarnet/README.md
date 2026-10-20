# Notes en marge — v14

Le carnet garde cinq cachettes dans son ordre de lecture : clé de garde, premier album,
second album, cuisine et dernière page. Le Jack Russell reste sur la table, les pattes fixes.
Il hoche légèrement la tête au clic. Sa seule languette dit « Psst… » ; aucun compteur ni
panneau de progression ne s’affiche.

**S** ou le chien ouvre un petit rabat de papier sur le bord droit. Le rabat ne se centre
jamais et ne dévoile ni destination ni dessin à chercher d’emblée. « Souffle-moi une piste »
donne un indice doux. « Un peu plus d’aide » précise ensuite le lieu, le folio et le dessin ;
un lien peut y conduire seulement après activation du lecteur. L’ouverture reste facultative.
**Échap** replie la note. Les citations d’origine sont inchangées, notamment le Scorpion
ascendant Scorpion. Aucune anecdote n’a été inventée.

La première clé est sous une petite couche de farine magique. `FarineCachette` dessine sa
texture une fois sur un canvas et efface les traces au passage du doigt ou de la souris.
Plusieurs zones doivent être balayées avant de dévoiler la note. Un déplacement partiel ne
révèle pas tout au relâchement. Un toucher sans déplacement, un clic ou **Entrée/Espace**
sur le bouton de la cachette constituent une alternative complète. Aucune horloge ni boucle
`requestAnimationFrame` ne tourne. Les gestes sont ignorés quand le livre ou le document
est caché ; le mouvement réduit reste pleinement utilisable.

Le dessin trouvé affiche sa citation dans le rabat. « Garder cette note » replie le papier et
débloque la prochaine cachette. Les notes déjà gardées restent relisibles dans « Notes
retrouvées ». Le stockage `gc:quete:v1` conserve cette progression ; les sauvegardes v12/v13
restent compatibles. Les cachettes futures ne peuvent pas se révéler avant les précédentes.

`SecretsDuCarnet` réserve toujours une zone libre contrôlée contre l’encre, les objets vivants
et les liens. Il n’ajoute aucun chien sur le papier. Aucun attribut `title` ne produit une
infobulle sur les dessins ou le compagnon. Si une zone ne peut pas être posée, l’aide précise
du rabat permet de lire la note sur sa page, sans bloquer le carnet.

Contrôle ciblé actuel :

```sh
GC_CHROME=/usr/bin/chromium node scripts/verify-notes-v14.mjs --url http://localhost:5173
# ou --site dist/site
```

Le script fige les modules Vite en désactivant HMR pendant les mesures. Il vérifie le rabat
latéral sur TV et téléphone couché, les indices choisis, un vrai balayage, l’alternative au
clavier, les cinq citations, l’archivage et l’absence d’infobulles. Preuves dans
`verification/out/notes-v14/`. Les scripts v12 documentent les anciens guides et ne décrivent
plus cette présentation.
