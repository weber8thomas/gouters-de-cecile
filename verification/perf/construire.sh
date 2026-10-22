#!/bin/sh
# Construit le bundle « perf » : le même build que `npm run build:local` (GC_LOCAL=1, vraies photos/vidéos),
# mais NON minifié (dist/perf-nomin, ignoré par git), pour que les piles d'appels de requestAnimationFrame
# portent les vrais noms de fonctions (image, pas, boucle…). Le coût GPU est identique à celui du build minifié.
#   sh verification/perf/construire.sh
set -e
cd "$(dirname "$0")/../.."
GC_LOCAL=1 node scripts/build-tokens.mjs >/dev/null
GC_LOCAL=1 node scripts/gen-entry.mjs --target site >/dev/null
GC_LOCAL=1 node node_modules/vite/bin/vite.js build --minify false --sourcemap --outDir dist/perf-nomin --emptyOutDir
# src/generated (ignoré par git) redevient celui du site public, comme build-local.mjs
env -u GC_LOCAL node scripts/gen-entry.mjs --target site >/dev/null
echo "dist/perf-nomin prêt"
