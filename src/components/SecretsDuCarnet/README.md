# Notes en marge — v16

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

La première clé et les mots « Intentions gourmandes… » ne sont plus cachés sous un dépôt de farine (effet
supprimé : `FarineCachette` et son canvas ont disparu) : un clic, un toucher ou **Entrée/Espace** sur la clé
découvre directement la note. Les autres cachettes mêlent enveloppe, papier plié et tache d’encre.

Pour tout remettre au départ : **S** (ou « Psst… »), puis **Recommencer les découvertes**.
Cette commande reste visible en bas du rabat à chaque étape, même avant la première note.
Elle efface les notes gardées, referme les cachettes et  Le retour « Tout est à redécouvrir. »
confirme l’action et le focus reste sur le bouton. Les réglages audio et de lumière sont conservés.
Une révision interne force le remontage du canvas ; revenir seulement à zéro dans le stockage
ne suffirait pas à restaurer une surface déjà frottée.

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

Vérification ciblée du reset, sans build :

```sh
GC_CHROME=/usr/bin/chromium node src/components/SecretsDuCarnet/verify-reset-v16.mjs --url http://127.0.0.1:5173 --fixture
```

La fixture charge les vrais composants de découverte dans une page vide, sans démarrer le livre 3D.
Le contrôle vérifie, sur TV et mobile, le retour au départ après ouverture de l'enveloppe et archivage de deux notes
(la farine n'existe plus : l'étape qui comparait son dépôt est sautée).
Il compare aussi les réglages avant/après et vérifie que le premier geste reste progressif.
Preuves : `verification/out/notes-reset-v16/`.

Sans `--fixture`, le même parcours peut viser le livre complet ; `--captures` active alors les captures.
