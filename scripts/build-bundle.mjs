// Construit le bundle du design system tel que l'artifact l'attend :
//   <out>/bundle.js  — UN script classique qui assigne window.GoutersDeCecile,
//                      lit window.React / window.ReactDOM, sans import ni réseau ;
//   <out>/bundle.css — toutes les feuilles importées par src/.
// Les SVG sont inclus comme texte, les textures WebP comme data URI.
//
//   node scripts/build-bundle.mjs                         → dist/ds/components (tout)
//   node scripts/build-bundle.mjs --target artifact                 → URL des images en /_blob/<id>
//   node scripts/build-bundle.mjs --only Livre,Stage --boards DemoCarnet --tag f3
//                                                         → dist/ds-f3/components (build isolé :
//     seuls ces composants et artboards, registres régénérés dans dist/ds-f3/gen)
import { build } from 'esbuild';
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generate, ROOT as root } from './gen-entry.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('only')?.split(',').filter(Boolean);
const boardsOpt = opt('boards')?.split(',').filter(Boolean);
const tag = opt('tag');
const target = opt('target') ?? 'harness';
const BUDGET = 3 * 1024 * 1024; // bundle.js : échec au-delà de 3 Mo (plafond de l'artifact : 6 Mo)
const isolated = Boolean(only || boardsOpt || tag);
const base = join(root, isolated ? `dist/ds-${tag ?? 'partiel'}` : 'dist/ds');
const out = join(base, 'components');
mkdirSync(out, { recursive: true });
export const NAMESPACE = 'GoutersDeCecile';

// Registres : partagés (src/generated) ou isolés (<base>/gen)
const genDir = isolated ? join(base, 'gen') : join(root, 'src/generated');
const gen = generate({ outDir: genDir, components: isolated ? only ?? [] : undefined, artboards: isolated ? boardsOpt ?? [] : undefined, target });
const redirectGenerated = {
  name: 'generated-dir',
  setup(b) {
    if (!isolated) return;
    b.onResolve({ filter: /generated\/(components|assets)\.gen$/ }, (a) => ({ path: join(genDir, a.path.split('/').pop() + '.ts') }));
  },
};

// React vient des globales du cadre d'aperçu (React 18 UMD). Motion importe aussi react/jsx-runtime :
// on le reconstruit sur createElement (les props contiennent déjà children).
const JSX_RUNTIME = `var R = window.React;
function jsx(type, props, key) { return R.createElement(type, key === undefined ? props : Object.assign({}, props, { key: key })); }
module.exports = { jsx: jsx, jsxs: jsx, jsxDEV: jsx, Fragment: R.Fragment };`;
const GLOBALS = { react: 'module.exports = window.React;', 'react-dom': 'module.exports = window.ReactDOM;', 'react-dom/client': 'module.exports = window.ReactDOM;', 'react/jsx-runtime': JSX_RUNTIME, 'react/jsx-dev-runtime': JSX_RUNTIME };
const reactGlobals = {
  name: 'react-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/client|\/jsx-runtime|\/jsx-dev-runtime)?$/ }, (a) => ({ path: a.path, namespace: 'react-global' }));
    b.onLoad({ filter: /.*/, namespace: 'react-global' }, (a) => ({ contents: GLOBALS[a.path], loader: 'js' }));
  },
};

const result = await build({
  entryPoints: { bundle: join(root, 'src/index.ts') },
  outdir: out,
  bundle: true,
  format: 'iife',
  globalName: NAMESPACE,
  platform: 'browser',
  target: 'es2020',
  minify: !args.includes('--dev'),
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl', '.woff2': 'empty' },
  legalComments: 'none',
  plugins: [redirectGenerated, reactGlobals],
  logLevel: 'warning',
});

// Composants exposés : dossiers de src/components avec un aperçu ou un README (ordre alphabétique)
const compDir = join(root, 'src/components');
const components = (existsSync(compDir) ? readdirSync(compDir, { withFileTypes: true }) : [])
  .filter((d) => d.isDirectory() && gen.comps.includes(d.name) && (existsSync(join(compDir, d.name, 'preview.html')) || existsSync(join(compDir, d.name, 'README.md'))))
  .map((d) => ({ name: d.name }));

const jsPath = join(out, 'bundle.js');
if (!existsSync(join(out, 'bundle.css'))) writeFileSync(join(out, 'bundle.css'), '');
let js = readFileSync(jsPath, 'utf8');
// Le bundle est parfois inséré en ligne par les consommateurs : neutraliser </script et <!--
// (dans une chaîne JS, « <\/script » et « <\!-- » donnent exactement les mêmes caractères).
const before = js;
js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
if (js !== before) console.warn('bundle.js : séquences </script ou <!-- neutralisées');
js = js.replace(`var ${NAMESPACE}=`, `window.${NAMESPACE}=`).replace(`var ${NAMESPACE} =`, `window.${NAMESPACE} =`);
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: NAMESPACE, components })} */\n`;
writeFileSync(jsPath, header + js);

const kb = (p) => (existsSync(p) ? (readFileSync(p).length / 1024).toFixed(0) : '0');
if (readFileSync(jsPath).length > BUDGET) { console.error(`bundle.js dépasse le budget de ${BUDGET / 1048576} Mo`); process.exitCode = 1; }
console.log(`${out.replace(root + '/', '')} [${target}] : bundle.js ${kb(jsPath)} Ko · bundle.css ${kb(join(out, 'bundle.css'))} Ko · ${gen.comps.length} composants · ${gen.boards.length} artboards · ${gen.assets} images`);
if (result.warnings.length) console.warn(`${result.warnings.length} avertissement(s) esbuild`);
