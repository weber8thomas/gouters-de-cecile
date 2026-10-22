# Version partagée (chiffrée, Cloudflare Pages)

Les vraies données de `build:local` (photos, vidéos, textes privés), **entièrement chiffrées**, envoyées sur Cloudflare Pages
par envoi direct (wrangler, sans git). Le serveur ne stocke que des fichiers opaques aux noms masqués. Le navigateur de
l'invité les déchiffre à la volée (service worker, WebCrypto) avec une clé qui ne quitte jamais son appareil.

Ce qui ouvre le carnet : une **phrase de passe** (5 mots français) ou un **lien secret** dont la clé est dans le fragment `#cle=…`
(le fragment n'est jamais envoyé au serveur).

## Première fois

```bash
npx wrangler login                                   # une seule fois, dans le navigateur (Thomas)
export PARTAGE_PROJET=gouters-de-cecile              # nom du projet Cloudflare Pages (à choisir)
npm run partage:cle                                  # phrase de passe, lien secret, QR code
npm run build:partage                                # build:local, chiffrement, garde-fou → dist/partage
npm run preview:partage                              # essai local : http://localhost:4173
npm run deploy:partage                               # envoi sur Cloudflare Pages
```

Le projet Pages peut être créé au premier envoi (wrangler le propose) ou avant : `npx wrangler pages project create <nom> --production-branch main`.
L'adresse est `https://<nom>.pages.dev` (Cloudflare ajoute un suffixe si le nom est pris : dans ce cas,
`PARTAGE_URL=https://<adresse réelle> npm run partage:cle` refait le lien et le QR code).

Un rebuild réutilise le même secret : ni la phrase de passe, ni le lien ne changent.

## Le secret (jamais ailleurs que dans `prive/partage/`)

| Fichier | Contenu |
| --- | --- |
| `prive/partage/secret.json` | phrase de passe, clé de contenu, verrou (gitignoré, mode 600) |
| `prive/partage/lien.txt` | lien avec la clé : `https://<projet>.pages.dev/#cle=…` |
| `prive/partage/qr.png` | QR code de ce lien (TV, téléphone) |

## Partager

- **Phrase de passe** : à donner à part (message, de vive voix). Accents, majuscules et tirets n'ont pas d'importance
  (« Pâté-lumière » = « pate lumiere »). Sur la page d'ouverture, « Se souvenir sur cet appareil » garde le carnet ouvert ;
  sans la case, il se referme quand l'onglet est fermé.
- **Lien secret / QR code** : ouvre directement, sans rien saisir (pratique pour la TV). Le lien est mémorisé sur l'appareil.
  Qui a le lien a le carnet : ne pas le poster dans un groupe public.
- **Oublier ce carnet** : lien en bas de la page d'ouverture, ou `https://<adresse>/?oublier` (efface la clé de l'appareil).
- Un invité qui change d'iPhone ou vide ses données redemande simplement la phrase de passe. Safari peut aussi effacer les données d'un
  site non visité depuis une semaine (sauf ajouté à l'écran d'accueil) : même remède.

## Révoquer

Changer le secret invalide tout ce qui a été partagé :

```bash
npm run partage:cle -- --nouveau     # nouvelle clé et nouvelle phrase de passe
npm run build:partage
npm run deploy:partage
```

Puis, dans le tableau de bord Cloudflare (Workers & Pages → le projet → Deployments), **supprimer les anciens déploiements** :
chacun reste en ligne à son adresse propre (`<hash>.<projet>.pages.dev`) avec l'ancienne clé, donc lisible par qui l'a. Les appareils
qui avaient l'ancienne clé reviennent à la page d'ouverture au prochain chargement d'un nouveau déploiement.

## Comment c'est fait

- **Clés** : K (AES-256-GCM, aléatoire) chiffre tous les fichiers. K est enveloppée par une clé dérivée de la phrase de passe
  (PBKDF2-SHA-256, 600 000 tours, sel de 16 octets) ; `verrou.json` (public) contient `{v, sel, iterations, cleEnveloppee, iv}`.
  Une clé de noms Kn = HKDF(K, « noms »).
- **Fichiers** : `IV (12 octets) ‖ AES-GCM(type MIME + contenu)`, le chemin d'origine lié au chiffré. Nom publié = `base64url(HMAC-SHA-256(Kn, chemin))`.
- **Chargeur en clair** : `index.html`, `ouvrir.js`, `sw.js`, `favicon.svg`, `police.woff2`, `verrou.json` (+ `robots.txt`, `404.html`, `_headers`).
- **Navigateur** : la clé est importée non extractable et rangée dans IndexedDB ; `sw.js` répond aux requêtes (y compris `Range` → 206 pour les vidéos,
  clair gardé dans un cache mémoire LRU de 96 Mo / 32 fichiers).
- **En-têtes** (`_headers`) : CSP stricte (tout vient de la même origine), `noindex`, `Referrer-Policy: no-referrer`, `nosniff`, `Permissions-Policy` minimal.
- **Garde-fou** (`scripts/garde-partage.mjs`, lancé en fin de `build:partage` et avant `deploy:partage`) : refuse le build si un fichier est lisible
  (entropie, signatures JPEG/PNG/WebP/MP4/HTML, mots du carnet, noms d'invités, légendes, extraits des textes) ou si un nom d'origine apparaît.

## Tests

```bash
npm run test:partage      # Node : chiffrer → déchiffrer, noms masqués, enveloppe, mauvais mot de passe, garde-fou
npm run verify:partage    # Chrome réel sur dist/partage : chargeur, mots de passe, album, vidéo (Range), souvenir/oublier, #cle=, CSP
```

Les captures de `verify:partage` (`prive/baked/apercus/partage-*.png`) montrent des photos privées : elles restent dans `prive/`.

## Limites (honnêtement)

- **Quiconque a la phrase de passe ou le lien a tout**, et peut le transmettre. Il n'y a ni compte ni révocation individuelle : révoquer, c'est tout changer pour tout le monde.
- **Un invité peut faire des captures d'écran**, enregistrer l'écran, ou copier les fichiers déchiffrés depuis son navigateur. Le chiffrement protège le serveur et les curieux, pas un invité.
- **La sécurité dépend de la longueur de la phrase de passe** : 5 mots sur 2 080 ≈ 55 bits, avec 600 000 tours de PBKDF2 : hors de portée d'une attaque
  hors ligne raisonnable, mais pas d'un adversaire doté de moyens considérables. Ne pas la raccourcir, ne pas en choisir une soi-même. Le lien secret contient une clé de 256 bits (inattaquable), mais se perd comme n'importe quel lien.
- Le serveur voit le nombre et la taille des fichiers (donc, à peu près, la forme du carnet), pas leur contenu ni leur nom.
- Cloudflare voit les adresses IP et les moments des visites.
- Chaque déploiement re-chiffre tout avec de nouveaux IV : wrangler renvoie les ~120 Mo à chaque fois.
- Navigation privée de Firefox : pas de service worker, donc pas d'ouverture (message affiché).
