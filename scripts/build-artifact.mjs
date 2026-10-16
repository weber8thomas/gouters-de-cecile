// Prépare les fichiers de l'artifact Design System (format du type, voir docs/artifact-type-notes.md)
// dans dist/artifact/project/, et la table des fichiers à publier (dist/artifact/files.json).
// Prérequis : npm run bundle (dist/ds/components).
//
//   node scripts/build-artifact.mjs
//
// L'index (project/design-system.json) est écrit depuis design-system/artifact-index.json (qui garde
// createdOnFiles et les enregistrements des assets téléversés) avec un lastChange daté de maintenant ;
// il n'est PAS dans files.json : on le publie en dernier (file_path de l'appel).
//   node scripts/build-artifact.mjs --note "ce qui a changé"
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'dist/artifact');
const proj = join(outRoot, 'project');
rmSync(proj, { recursive: true, force: true });
mkdirSync(proj, { recursive: true });
const files = {};
const problems = [];
const put = (rel, content) => {
  const dest = join(proj, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (typeof content === 'string' || Buffer.isBuffer(content)) writeFileSync(dest, content);
  else copyFileSync(content.from, dest);
  files[`project/${rel}`] = `project/${rel}`;
};
const dirsOf = (p) => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);

// tokens.json — déjà au format du type
const tokens = readFileSync(join(root, 'design-system/tokens.json'), 'utf8');
JSON.parse(tokens);
put('tokens.json', tokens);

// Charte (README) et sections
const docs = join(root, 'design-system/docs');
if (existsSync(docs)) for (const n of readdirSync(docs).filter((n) => n.endsWith('.md')).sort()) put(n, readFileSync(join(docs, n), 'utf8'));
if (!files['project/README.md']) problems.push('design-system/docs/README.md manquant (obligatoire)');

// Polices
for (const n of readdirSync(join(root, 'design-system/fonts')).filter((n) => n.endsWith('.woff2'))) put(`fonts/${n}`, { from: join(root, 'design-system/fonts', n) });

// Bundle
const ds = join(root, 'dist/ds/components');
for (const n of ['bundle.js', 'bundle.css']) {
  if (!existsSync(join(ds, n))) { problems.push(`${n} manquant : lancer npm run bundle`); continue; }
  const text = readFileSync(join(ds, n), 'utf8');
  if (n === 'bundle.js' && /<\/script|<!--/i.test(text)) problems.push('bundle.js contient </script ou <!--');
  if (n === 'bundle.css' && /<\/style/i.test(text)) problems.push('bundle.css contient </style');
  const limit = n === 'bundle.js' ? 6 : 2;
  if (text.length > limit * 1024 * 1024) problems.push(`${n} dépasse ${limit} Mo`);
  put(`components/${n}`, text);
}
if (existsSync(join(ds, 'index.d.ts'))) put('components/index.d.ts', readFileSync(join(ds, 'index.d.ts'), 'utf8'));

// Cartes : composants, gabarits, couverture
const cards = [];
for (const base of ['src/components', 'src/artboards']) {
  for (const name of dirsOf(join(root, base))) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) { problems.push(`nom de carte invalide : ${name}`); continue; }
    for (const f of ['README.md', 'preview.html']) {
      const p = join(root, base, name, f);
      if (!existsSync(p)) continue;
      const text = readFileSync(p, 'utf8');
      if (f === 'preview.html') {
        if (!text.startsWith('<!-- @dsCard')) problems.push(`${base}/${name}/preview.html : marqueur @dsCard absent en ligne 1`);
        if (/<iframe|<object|<embed|<frame|<portal|<noscript/i.test(text)) problems.push(`${base}/${name}/preview.html : élément interdit`);
        if (text.length > 256 * 1024) problems.push(`${base}/${name}/preview.html dépasse 256 Ko`);
        cards.push(name);
      }
      put(`components/${name}/${f}`, text);
    }
  }
}
const cover = join(root, 'design-system/cover/preview.html');
if (existsSync(cover)) put('components/Cover/preview.html', readFileSync(cover, 'utf8'));

// Contrôles
const paths = Object.keys(files);
if (paths.length > 254) problems.push(`${paths.length} fichiers : publier en plusieurs appels (≤ 255 chemins)`);
const total = paths.reduce((s, p) => s + statSync(join(outRoot, p)).size, 0);
if (total > 15 * 1024 * 1024) problems.push(`${(total / 1048576).toFixed(1)} Mio : dépasse un appel (16 Mio)`);
for (const p of paths) if (/(^|\/)\./.test(p) || p.includes('..')) problems.push(`chemin refusé : ${p}`);

writeFileSync(join(outRoot, 'files.json'), JSON.stringify(files, null, 2) + '\n');

// Index
const ni = process.argv.indexOf('--note');
const index = JSON.parse(readFileSync(join(root, 'design-system/artifact-index.json'), 'utf8'));
index.lastChange = { by: 'Claude', at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), via: 'Claude Code', note: ni > 0 ? process.argv[ni + 1] : 'Mise à jour' };
writeFileSync(join(proj, 'design-system.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`dist/artifact : ${paths.length} fichiers, ${(total / 1024).toFixed(0)} Ko, ${cards.length} cartes`);
if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
