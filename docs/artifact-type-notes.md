# Notes : format de l'artifact Design System

Résumé (dans nos mots) du format attendu par l'artifact « Les goûters de Cécile »
(https://claude.ai/artifact/Lc8sL2ha32HVArCJkY89Gx), créé à partir du type Design System.
`scripts/build-artifact.mjs` est le seul endroit qui connaît ce format.

## Fichiers sous `project/`

| Chemin | Source dans le dépôt |
|---|---|
| `design-system.json` | index (titre, namespace, bibliothèques, groupes d'assets) — écrit en dernier |
| `tokens.json` | `design-system/tokens.json` (format en listes, noms `gc-…`) |
| `README.md` + autres `*.md` | charte et sections (`design-system/docs/`) |
| `fonts/*.woff2` | `design-system/fonts/` |
| `components/bundle.js` · `bundle.css` | `dist/ds/components/` (esbuild, IIFE → `window.GoutersDeCecile`, React global) |
| `components/index.d.ts` | types générés |
| `components/<Comp>/README.md` · `preview.html` | `src/components/<Comp>/`, `src/artboards/<Nom>/` |
| `components/Cover/preview.html` | couverture du design system (écrite en dernier, sans README) |
| `assets/<Groupe>/…` | images, SVG, PNG : téléversés comme assets et déclarés dans l'index |

`tokens.css`, `manifest.json` et les cartes `api/` sont générés par la page : on ne les écrit pas.

## Aperçus (`preview.html`)

- Ligne 1 : `<!-- @dsCard group="…" height=N -->` ; `width=1920 height=1080` pour un gabarit TV
  (mis à l'échelle), `page` pour une page de démonstration qui n'est pas un export du bundle.
- Le cadre charge déjà tokens.css, les polices, bundle.css, React 18 (jsDelivr) et bundle.js.
  Le fichier ne contient qu'un élément racine et un `<script>` qui monte le composant.
- Pas d'iframe ; images en chemin relatif, `/_blob/<id>` ou `data:` ; ≤ 256 Ko.

## Contraintes utiles

- `bundle.js` : un seul script classique, sans `import`, sans réseau, sans `</script` ni `<!--` littéral ; ≤ 6 Mo.
- `bundle.css` ≤ 2 Mo. Un fichier ≤ 15 Mio, un appel ≤ 16 Mio, ≤ 255 chemins par appel.
- Tokens : familles en listes `{"tokens":[{name, value, usage}]}` ; couleurs en hex/rgb/alias `{token}`,
  sans `var()` ni `color-mix()` ; ≤ 12 familles supplémentaires ; une note d'usage par token.
- Texte ≥ 4,5:1 sur les fonds nommés dans sa note d'usage.
