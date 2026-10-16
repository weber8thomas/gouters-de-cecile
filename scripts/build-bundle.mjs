// Construit le bundle du design system tel que l'artifact l'attend :
//   dist/ds/components/bundle.js  — UN script classique qui assigne window.GoutersDeCecile,
//                                   lit window.React / window.ReactDOM, sans import ni réseau ;
//   dist/ds/components/bundle.css — toutes les feuilles importées par src/.
// Les SVG sont inclus comme texte, les textures WebP comme data URI.
import { build } from 'esbuild';
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/ds/components');
mkdirSync(out, { recursive: true });
export const NAMESPACE = 'GoutersDeCecile';

const GLOBALS = { react: 'window.React', 'react-dom': 'window.ReactDOM', 'react-dom/client': 'window.ReactDOM' };
const reactGlobals = {
  name: 'react-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/client)?$/ }, (a) => ({ path: a.path, namespace: 'react-global' }));
    b.onLoad({ filter: /.*/, namespace: 'react-global' }, (a) => ({ contents: `module.exports = ${GLOBALS[a.path]};`, loader: 'js' }));
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
  minify: !process.argv.includes('--dev'),
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl', '.woff2': 'empty' },
  legalComments: 'none',
  plugins: [reactGlobals],
  metafile: true,
  logLevel: 'warning',
});

// Composants exposés (dossiers de src/components avec un aperçu ou un README), dans l'ordre alphabétique
const compDir = join(root, 'src/components');
const components = existsSync(compDir)
  ? readdirSync(compDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && (existsSync(join(compDir, d.name, 'preview.html')) || existsSync(join(compDir, d.name, 'README.md'))))
      .map((d) => ({ name: d.name }))
  : [];

const jsPath = join(out, 'bundle.js');
if (!existsSync(join(out, 'bundle.css'))) writeFileSync(join(out, 'bundle.css'), '');
let js = readFileSync(jsPath, 'utf8');
// Le bundle est parfois inséré en ligne par les consommateurs : neutraliser </script et <!--
// (dans une chaîne JS, « <\/script » et « <\!-- » donnent exactement les mêmes caractères).
const before = js.length;
js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
if (js.length !== before) console.warn('bundle.js : séquences </script ou <!-- neutralisées');
js = js.replace(`var ${NAMESPACE}=`, `window.${NAMESPACE}=`).replace(`var ${NAMESPACE} =`, `window.${NAMESPACE} =`);
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: NAMESPACE, components })} */\n`;
writeFileSync(jsPath, header + js);

const kb = (p) => (existsSync(p) ? (readFileSync(p).length / 1024).toFixed(0) : '0');
console.log(`bundle.js ${kb(jsPath)} Ko · bundle.css ${kb(join(out, 'bundle.css'))} Ko · ${components.length} composants`);
if (result.warnings.length) console.warn(`${result.warnings.length} avertissement(s) esbuild`);
