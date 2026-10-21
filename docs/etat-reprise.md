# Reprise — état au 21 octobre 2026

## Décisions

- Démo vendredi 23 octobre : ordinateur HDMI, TV 1920 × 1080, navigation clavier.
- Plan courant : [mission du 19 octobre](mission-finalisation-2026-10-19.md). Les bilans précédents
  restent dans [le bilan Claude](bilan-claude-2026-10-18.md) et [le plan v8](plan-v8.md).
- Dix-huit recettes reçues : Lisa Allienne, Emeline, Clémence, Pierrette, Laura Geyer, Marie, Léa,
  Coralie, Antoine, Suzanne, Margot Chapuzy, Anatole, Lise, Julien, Lisa De Paris, Sarah,
  Laura Gramegna et Elise ; cinq chapitres.
  Conserver tous les textes, quantités, mots et notes. Utiliser la pagination existante, sans réduire
  l’écriture pour faire tenir une recette. Voir [audit des sources](audit-recettes-v11.md).
- Illustrations anglaises anciennes au crayon fin et à l’aquarelle mate, beaucoup d’animations et de
  cachettes. Depuis la nouvelle revue v12 : aucun Jack Russell dans le papier ; un chien frontal, assis sur la table, guide une quête. Carotte de taille constante au repos/en action, sans lapin.
- Quête séquentielle de cinq cachettes : serment gourmand, albums, cuisine, anniversaire.
  Douce Cécile est ironique : « Oh, Cécile est si calme et douce… » puis « Scorpion ascendant Scorpion.
  Les proches savent. » Aucun récit biographique ajouté. Anecdote de la poêle retirée à la demande
  du 20 octobre. Les lunettes au clic et les pattes canines dans le livre sont supprimées.
- Vrais clips et portraits encore absents. Cartes manuscrites au monogramme en attendant ; aucun
  portrait de tiers attribué aux proches. Anciens médias et recettes fictives archivés hors des actifs.
- Luminosité initiale 150 %, plage 50–300 %. Éclat bougie initial 200 %, plage 25–400 %.
  Conserver le vacillement, même aux intensités élevées. Écriture initiale 200 %.
  Les choix explicitement enregistrés par un visiteur sont préservés.
- Sept morceaux existants, dont Melodie Victoria, piano et Casse-Noisette. Tous joués en entier :
  préchargement du suivant, fin naturelle, respiration 350 ms et entrée douce 1,6 s. Changement manuel
  en fondu croisé de 3 s. Aucun seuil de 25 secondes ni départ anticipé en fin de piste.
  Lecture après geste, pause pendant une vidéo puis reprise à la même position. Licences dans la banque.
- Couverture avec cachet de cire « 30 ». Ne pas refondre l’architecture ni relancer de génération sans raison.
- Git, sous-agents nécessaires et publication d’aperçus autorisés. Réutiliser les spécialistes ; éviter
  les audits redondants et les navigateurs concurrents pour économiser le quota.
- Aucun redémarrage automatique après expiration du quota. La reprise nécessite un message utilisateur.

## Revue v16

Voir [la passe v16](reprise-v16.md) : mode cuisine sur toute la fenêtre, ingrédients cochables,
107 étapes et commandes à l’encre, recherche (/), sommaire dès la page 8 (T), remise à zéro des
découvertes dans les notes (S). Cinq nouvelles recettes, Lisa Allienne distinguée de Lisa De Paris,
quatorze petits mots provisoires et quatre authentiques. Numéro personnel masqué partout.
Porte de four articulée, apports des amandes successifs, contours avant couleur, traits retracés
et chaussures humaines dans les marges. Aucune optimisation GPU demandée ni appliquée.

## Revue v15

Voir [la livraison v15](reprise-v15.md) et la [source du nouveau lot](sources/recettes-recueillies-2026-10-20-v15.md).
Cinq recettes ajoutées, crêpes attribuées à Laura Gramegna, cuisson de Léa corrigée à 180 °C sur confirmation.
Quatre petits mots sont explicitement marqués « Lorem ipsum — message à venir » ; celui de Coralie est authentique.
Treize recettes et 70 étapes, sommaire sur deux pages, feuillet de suite natif pour Sarah. Commandes fixes
Précédente/compteur/Suivante, mode et rejeu ; les gestes sélectionnés avancent sans lecture inversée.
Farine granuleuse dégagée par petits gestes successifs, cachettes en enveloppe, pli et tache.
Aperçu de cette passe : `essais/coherence-v15/`. Tests : `verify-recettes-v15.mjs`,
`verify-recette-horloge-v15.mjs`, `verify-recette-livre-v15.mjs`, `verify-notes-v15.mjs`, pagination et glyphes des treize recettes.

## Revue v14

Voir [la livraison v14](reprise-v14.md). Mains distinctes rétablies avec fontes locales exactes, plume sur
la garde, sous-titre lisible. Les 39 étapes des huit recettes ont leur scène simplifiée : Auto jusqu’au résultat,
Pas à pas/Suivant et Rejouer. Les soulignements cuits s’effacent et se retracent réellement. Notes en marge
latérales et indices à la demande ; clé sous la farine à balayer, clic/toucher/Entrée également possibles.
La flamme de la part de gâteau est réparée, les infobulles des illustrations retirées.
Aperçu courant : `essais/coherence-v14/`. Tests nouveaux : `verify-recettes-v14.mjs`,
`verify-recette-horloge-v14.mjs`, `verify-redessins-v14.mjs`, `verify-notes-v14.mjs`.

## Revue v13

Voir [la livraison v13](reprise-v13.md). Dessins agrandis, pages 15/29 rééquilibrées, conseils cités,
carotte à 9,6 s et soulignements progressivement tracés. Gestes de cuisine partagés (œuf/farine/lait/fouet/fruits),
modes Auto et Pas à pas. Guide avec page visée, Découvrir puis Continuer ; chien stable et bref hochement de tête.
Aperçu courant : `essais/coherence-v13/`.

## Revue v12

Voir [la livraison v12](reprise-v12.md) et [les recettes lisibles](lisibilite-recettes-v12.md).
Branche `codex/reprise-v8`, aperçu `essais/coherence-v12/`, build final `20261020T143044`.
Les contrôles du carnet animé, du contenu, des huit liens TV, du mobile et du guide borné passent ; les détails et limites sont dans le rapport.

## Sources et actifs

Branche distante : `codex/reprise-v8` ; le checkout cloud peut être sur `work` au même historique.
`main` reste au commit initial. Les sept commits distants jusqu’à cf52476 ont été réconciliés dans
d8abf69 ; préserver leurs réglages compacts, musique, couverture et lumière lors des prochaines modifications.

Les recettes JSON et leurs TXT intégraux sont dans `src/content/recettes/`. `carnet.json`, `roster.json`
et `pages/recettes.json` fixent l’ordre, les mains et les réserves. Les notes trop longues pour le
voisinage du titre peuvent se poser intégralement en marge basse ; le paginateur reporte le texte suivant.

Les illustrations originales et leurs manifestes reproductibles sont dans
`design-system/sources/illustrations/v9`, `v10`, `v11`, `v12`, `v13`, `v14`, `v15`, `v16`. V11 ajoute les desserts ; v12 des acteurs séparés et un chien frontal ; v13 le pichet, la farine et une texture de pâte.
Le site emploie uniquement les images cuites ; aucune génération ni modèle distant au runtime.
Les scènes partagent une horloge. Même distribution au repos, pendant l’action et dans les feuilles
qui tournent : pas de tasse qui devient trois, pas de changement de taille de carotte. Nouveaux tableaux :
œuf/coquilles/jaune/bol/fouet, vanille/graines/bol et biscuit cassé/framboises/bol. Les autres dessins
sans acteurs séparés conservent leurs mouvements d’ensemble ; ne pas les annoncer tous articulés.
Toile vivante au niveau 4, théâtre SVG au niveau 5, lumière du papier au niveau 1.

Les huit recettes emploient désormais les glyphes déterministes de leurs mains distinctes (voir v14), avec leurs encres propres.
Le paginateur reste le même, les textes restent entiers. Ingrédients à puces, sections distinctes,
numéros d’étapes en début de ligne et citation de Lise entre guillemets. La carte d’écriture et la
carte magique suivent les masques réels des mots. Les sommaires ont huit vignettes associées aux recettes.

## Reprendre et vérifier

Utiliser le checkout existant, sans nouveau worktree. Préserver les changements et les caches valides.
Les processus et les sessions de commande peuvent disparaître : conserver les journaux dans
`verification/out/`, plutôt que seulement dans `/tmp`.

```sh
npm run build:site
npm run dev -- --host 0.0.0.0 --port 5173
```

Pour une modification de texte, cuire seulement les recettes concernées :

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 node scripts/bake-pages.mjs --only lisa,pierrette --apercus
tools/ecriture/.venv/bin/python scripts/bake-temps-encre.py
tools/ecriture/.venv/bin/python scripts/bake-magie.py
node scripts/assets.mjs
npm run build:site
```

Les poids locaux X-ray et les amorces sont prêts dans `vendor/poids`. S’ils manquent mais que les
sources téléchargées sont présentes : `tools/ecriture/.venv/bin/python -I tools/ecriture/convertir_poids.py`.
TrOCR reste absent : le proxy refuse son téléchargement Hugging Face. Ne pas annoncer de relecture
OCR des quantités ; comparer les sources et les rendus. Les recettes en Kalam dessinent les caractères
exacts ; les anciennes pages neuronales restent à contrôler visuellement. Ne pas désactiver TLS ni les contrôles d’intégrité.

Les contrôles utiles sont `verify-site.mjs` avec `--liens lisa,emeline,clemence,pierrette,anatole,lise,julien,laura`,
`verify-dessins.mjs --suites tableaux`, `verify-coherence-v13.mjs`, `verify-cuisine-v13.mjs`, le parcours de quête (scripts v12 mis à jour v13), `verify-luminosite-v10.mjs`,
`verify-magie-zoom.mjs`, `verify-musique-v10.mjs` et `verify-musique-browser-v10.mjs`.
Lancer les navigateurs successivement avec `GC_CHROME=/usr/bin/chromium`. Les captures ne prouvent pas
la fluidité sur la TV physique ni Safari/Mac ; conserver ces limites dans les comptes rendus.
Deux cas historiques de la longue suite réglages restent non résolus : absence de tour après un
long parcours de menu et injection de migration lente. Ne pas annoncer cette suite entièrement verte.

## Vérifications antérieures v11 (avant cette nouvelle revue)

Les huit transcriptions de recettes conservent tous les mots sources, quantités comprises, avec leur
multiplicité ; aucun débordement. Une perte de fin de phrase de Julien a été corrigée : après une
coupure, le paginateur utilise la nouvelle longueur et refuse toute tranche d’atomes manquante.
Deux témoins échouaient avant, passent après, dont un cas imposant un véritable feuillet. Les nombres
ambigus et la signature Lisa ont été retracés avec les surcharges de graines existantes.

Lumière : 16 contrôles réussis, dont mémoire, reset et vacillement au défaut et au maximum.
Cause corrigée : le gain de bougie était appliqué deux fois. Zoom : six états réussis, DPR 1/2
réellement observés, loupe et zoom natif. Musique : rotation réelle 25 s vérifiée par horloge contrôlée,
et sept vrais MP3 décodés sous WebAudio ; démarrage clavier, pause vidéo/reprise et pause utilisateur
validés. Vite démarre et ouvre Lisa avec ses deux pages et son monogramme sans exception.
La construction de production du carnet complet et le typage TypeScript réussissent.

Rapports de cette passe : `verification/out/recettes-v11/`, `verification/out/luminosite-fusion-corrigee/`,
`verification/out/magie-zoom-fusion/` et `verification/out/magie-zoom-natif-fusion/`.
Secrets : 20 contrôles réussis (bulles françaises, compagnon extérieur, Entrée/clic/S/flèches,
cachette des étoiles et mouvement réduit). Mobile : aquarelles terminées comparées à leurs images
fixes en émulation iPhone paysage DPR 3, écart moyen 1,402 RGB et alpha prémultiplié valide.
Une règle plus spécifique de Lumiere.css remettait la toile au niveau 2 : elle est maintenant
au niveau 4 avec les images fixes, au-dessus du pli. Les légendes des cachettes gardent davantage
d’espace sous leur dessin pour ne pas chevaucher la porte miniature.

Les cinq tableaux ont été vérifiés sur le carnet des huit proches : 18 contrôles distincts réussis
après reprise ciblée du lancement automatique de la lévitation. Le contrôle initial trop court
(14 secondes) et son échec restent dans les rapports ; le contrôle observe maintenant le cycle
partagé des scènes, en temps simulé. Cela ne mesure pas les FPS du matériel HDMI.

## Publication

Après validation et commit propre, pousser normalement vers `codex/reprise-v8`, puis :

```sh
python3 scripts/publish-preview.py --prefix essais/coherence-v14/
```

Ce script garde la racine et les autres essais de `gh-pages`, vérifie les arbres puis le commit
poussé, sans force. `publish-pages.mjs` remplace la racine : ne pas l’utiliser pour cet aperçu.
Distinguer la preuve Git du déploiement public : le proxy peut refuser Pages (CONNECT403).
Aperçu dédié : https://weber8thomas.github.io/gouters-de-cecile/essais/coherence-v14/
Rapport des huit liens TV : `verification/out/recettes-v11/site/site.json`.
Rapport de publication : `verification/out/previews/coherence-v14/preview-publication.json`.
