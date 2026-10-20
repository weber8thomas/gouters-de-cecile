# Reprise — état au 20 octobre 2026

## Décisions

- Démo vendredi 23 octobre : ordinateur HDMI, TV 1920 × 1080, navigation clavier.
- Plan courant : [mission du 19 octobre](mission-finalisation-2026-10-19.md). Les bilans précédents
  restent dans [le bilan Claude](bilan-claude-2026-10-18.md) et [le plan v8](plan-v8.md).
- Huit vrais proches : Lisa, Emeline, Clémence, Pierrette, Anatole, Lise, Julien, Laura ; quatre chapitres.
  Conserver tous les textes, quantités, mots et notes. Utiliser la pagination existante, sans réduire
  l’écriture pour faire tenir une recette. Voir [audit des sources](audit-recettes-v11.md).
- Illustrations anglaises anciennes au crayon fin et à l’aquarelle mate, beaucoup d’animations et de
  cachettes, Jack Russell très présent. Carotte agrandie et grignotée progressivement, sans lapin.
- Bulles françaises validées : « Une part pour le chien ? » et « Ça sent le beurre d’ici ! »,
  fond dessiné et écriture Caveat. Terrible Cécile, Fée du logis, Cordon bleu et Douce Cécile sont
  des cachettes animées réparties dans le carnet.
- Vrais clips et portraits encore absents. Cartes manuscrites au monogramme en attendant ; aucun
  portrait de tiers attribué aux proches. Anciens médias et recettes fictives archivés hors des actifs.
- Luminosité initiale 150 %, plage 50–300 %. Éclat bougie initial 200 %, plage 25–400 %.
  Conserver le vacillement, même aux intensités élevées. Écriture initiale 200 %.
  Les choix explicitement enregistrés par un visiteur sont préservés.
- Sept morceaux existants, dont Melodie Victoria, piano et Casse-Noisette. Mode « toutes » : rotation
  toutes les 25 secondes écoutées ; piste choisie : enchaînement en fin de morceau si activé.
  Lecture après geste, pause pendant une vidéo puis reprise à la même position. Licences dans la banque.
- Couverture avec cachet de cire « 30 ». Ne pas refondre l’architecture ni relancer de génération sans raison.
- Git, sous-agents nécessaires et publication d’aperçus autorisés. Réutiliser les spécialistes ; éviter
  les audits redondants et les navigateurs concurrents pour économiser le quota.
- Aucun redémarrage automatique après expiration du quota. La reprise nécessite un message utilisateur.

## Sources et actifs

Branche distante : `codex/reprise-v8` ; le checkout cloud peut être sur `work` au même historique.
`main` reste au commit initial. Les sept commits distants jusqu’à cf52476 ont été réconciliés dans
d8abf69 ; préserver leurs réglages compacts, musique, couverture et lumière lors des prochaines modifications.

Les recettes JSON et leurs TXT intégraux sont dans `src/content/recettes/`. `carnet.json`, `roster.json`
et `pages/recettes.json` fixent l’ordre, les mains et les réserves. Les notes trop longues pour le
voisinage du titre peuvent se poser intégralement en marge basse ; le paginateur reporte le texte suivant.

Les illustrations originales et leurs manifestes reproductibles sont dans
`design-system/sources/illustrations/v9`, `v10`, `v11`. V11 ajoute les quatre desserts manquants.
Le site emploie uniquement les images cuites ; aucune génération ni modèle distant au runtime.
Les scènes partagent une horloge : tasses en lévitation, théière servant deux tasses, citron coupé
puis réuni, carotte mangée et repoussant, gâteaux enchantés. Les aquarelles restent entières ; seuls
les citrons ont deux masques construits sur leurs composantes alpha réelles, jamais de rectangle dur.
Toile vivante et images fixes sont au même niveau au-dessus de la lumière du papier, théâtre au niveau5.

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
OCR des quantités ; comparer les sources et les rendus, et choisir une nouvelle graine ciblée si un
chiffre est ambigu. Ne pas désactiver TLS ni les contrôles d’intégrité.

Les contrôles utiles sont `verify-site.mjs` avec `--liens lisa,emeline,clemence,pierrette,anatole,lise,julien,laura`,
`verify-dessins.mjs --suites tableaux`, `verify-secrets.mjs`, `verify-luminosite-v10.mjs`,
`verify-magie-zoom.mjs`, `verify-musique-v10.mjs` et `verify-musique-browser-v10.mjs`.
Lancer les navigateurs successivement avec `GC_CHROME=/usr/bin/chromium`. Les captures ne prouvent pas
la fluidité sur la TV physique ni Safari/Mac ; conserver ces limites dans les comptes rendus.
Deux cas historiques de la longue suite réglages restent non résolus : absence de tour après un
long parcours de menu et injection de migration lente. Ne pas annoncer cette suite entièrement verte.

## Vérifications du 20 octobre

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
Les validations navigateur du nouveau carnet sont consignées séparément avant publication.

## Publication

Après validation et commit propre, pousser normalement vers `codex/reprise-v8`, puis :

```sh
python3 scripts/publish-preview.py --prefix essais/recettes-v11/
```

Ce script garde la racine et les autres essais de `gh-pages`, vérifie les arbres puis le commit
poussé, sans force. `publish-pages.mjs` remplace la racine : ne pas l’utiliser pour cet aperçu.
Distinguer la preuve Git du déploiement public : le proxy peut refuser Pages (CONNECT403).
Rapport de publication : `verification/out/previews/recettes-v11/preview-publication.json`.
