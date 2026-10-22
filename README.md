# Les goûters de Cécile

Carnet numérique de recettes de goûter offert à Cécile pour son anniversaire : une vingtaine de proches partagent leur recette sucrée préférée et un petit mot, certains avec une courte vidéo. Le carnet est projeté sur une TV 16:9 (1920×1080) pendant la fête, puis imprimé en A5.

Ce dépôt contient le design system du carnet.

## Développer et vérifier

Le carnet utilise React 18, TypeScript et Vite. Node 22 est utilisé en CI ; Node 24 est aussi validé dans le cloud.
Les pages, écritures et illustrations déjà cuites sont versionnées : aucun modèle ni service externe n'est nécessaire pour lancer le site.

```bash
npm ci
npm run dev
npm run build:site
GC_CHROME=/usr/bin/chromium node scripts/verify-site.mjs --site dist/site --only tv-1080
node --test scripts/tests/publish-pages.test.mjs
```

`GC_CHROME` désigne le navigateur installé dans le cloud ; omettre cette variable si Playwright trouve déjà Chromium.
Les rapports et captures vont dans `verification/out/`, ignoré par Git. Ne pas lancer plusieurs mesures de fluidité en parallèle.

La cuisson de nouveaux textes et l'ajout d'invités utilisent `tools/ecriture/` et ses modèles publics :
voir [ses instructions](tools/ecriture/README.md). Une couverture dont les tracés sont déjà figés se recuit avec Python, NumPy et Pillow.

## Version locale avec les vrais médias

Les vraies photos et vidéos ne sont jamais publiées : elles vivent dans `prive/` (ignoré par git) et ne servent qu'à une
version locale, montrée depuis un Mac sur une TV ou un iPad. Le site public garde ses photos de remplacement.

```bash
npm run medias:planche    # planche contact des photos d'album (prive/baked/planche-cecile.png)
npm run medias:local      # cuit les médias de prive/ vers prive/baked/ (même rendu que le site, cache par sha256)
npm run build:local       # dist/local : le même build, avec les médias de prive/baked par-dessus les placeholders
npm run preview:local     # sert dist/local sur le réseau local
```

Le mode d'emploi (dépôt des fichiers, `choix.json`, montages) est dans `prive/LISEZMOI.md`. `GC_PRIVE=<dossier>` remplace
`prive/` (essais). `npm run build:site` échoue si un fichier de `prive/` se retrouve dans `dist/site`, et `publish-pages.mjs`
refuse un build local. `medias:local` demande ffmpeg (`GC_FFMPEG`), Pillow et NumPy (`tools/ecriture/.venv`, ou `GC_PYTHON`)
et un Chrome (`GC_CHROME`) pour les coins photo.

## Publier

Après construction et vérification : `node scripts/publish-pages.mjs`. Cette commande met à jour la racine de `gh-pages`, conserve `essais/` et l'historique, et refuse un push divergent.

Le workflow de `main` déploie le site complet avec les actions officielles Pages. Pour cette automatisation, sélectionner **Settings → Pages → Source → GitHub Actions** ; autoriser `main` si l'environnement `github-pages` limite les branches de déploiement. Aucun nouveau secret n'est nécessaire.

La reprise et les priorités de livraison sont décrites dans [le plan v8](docs/plan-v8.md) et [l'état de reprise](docs/etat-reprise.md).

## Crédits

L'écriture des invités est générée trait par trait (`tools/ecriture/`, détails et licences dans son README) :

- réseau d'écriture : *pytorch-handwriting-synthesis-toolkit*, © 2021 Evgenii Dolotov (X-rayLaser), licence MIT ;
- lignes d'amorce : *handwriting-generation*, © 2018 Grzegorz Opoka (Grzego), licence MIT ;
- relecture des mots : TrOCR, Microsoft (`microsoft/unilm`), licence MIT ;
- ces modèles sont entraînés sur l'**IAM On-Line Handwriting Database** (M. Liwicki et H. Bunke, *IAM-OnDB – an On-Line English Sentence Database Acquired from Handwritten Text on a Whiteboard*, ICDAR 2005), réservée à un usage non commercial : ce carnet est un cadeau privé, sans aucun usage commercial.

Papiers anciens : scans du domaine public (Wellcome Collection, Library of Congress, Biblioteka Jagiellońska), sources et licences dans `design-system/sources/papier/`.
