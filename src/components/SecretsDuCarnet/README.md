# Notes en marge — v15

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

La première clé et les mots « Intentions gourmandes… » sont sous un dépôt de farine magique.
`FarineCachette` dessine une fois des grains blanc cassé réunis en amas irréguliers ; la brosse
utilise elle aussi une empreinte granuleuse, sans disque net. Le canvas conserve les traces
entre les gestes. La révélation dépend de la quantité de poudre réellement enlevée, et non du
simple relâchement du doigt.

Un clic, un toucher sans déplacement ou **Entrée/Espace** donnent chacun un petit coup de
brosse. Il faut répéter ces gestes pour découvrir la même note qu’en balayant librement.
Le retour vocal indique si les premiers traits ou les mots apparaissent, sans compteur à
l’écran. Il n’y a aucune horloge ni boucle `requestAnimationFrame` ; les gestes s’arrêtent
quand le livre ou le document est caché. Le mouvement réduit conserve tout le fonctionnement.
L’aide précise du rabat propose aussi « Lire la note sans balayer », un choix explicite qui
évite de bloquer la lecture. Les autres cachettes mêlent enveloppe, papier plié et tache d’encre.

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
GC_CHROME=/usr/bin/chromium node scripts/verify-notes-v15.mjs --url http://localhost:5173
# ou --site dist/site
```

Le script fige les modules Vite en désactivant HMR pendant les mesures. Il vérifie le rabat
latéral sur TV et téléphone couché, les indices choisis, un vrai balayage, les traces conservées après petit geste et premier clic, les alternatives
progressives au toucher et au clavier, les cinq citations, l’archivage et l’absence d’infobulles. Preuves dans
`verification/out/notes-v15/`. Les scripts v12 et v14 documentent les anciennes présentations ou l’ancienne
alternative au toucher immédiate ; ils ne décrivent plus ce geste progressif.
