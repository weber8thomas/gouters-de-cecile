// Publie le build Vite à la racine de gh-pages sans effacer les essais ni son historique.
// Prérequis : npm run build:site. Fonctionne avec le proxy Git du cloud et avec
// l'authentification déjà installée par actions/checkout (aucune URL contenant un jeton).
//
//   node scripts/publish-pages.mjs
//   node scripts/publish-pages.mjs --repo /chemin/du/depot --site dist/site --remote origin
//
// Le checkout, son index et HEAD restent intacts. Un index et un dossier temporaires
// fabriquent le nouveau commit, puis un push ordinaire refuse toute divergence distante.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const options = { repo: resolve(dirname(fileURLToPath(import.meta.url)), '..'), site: 'dist/site', remote: 'origin' };
for (let i = 2; i < process.argv.length; i++) {
  const name = process.argv[i].replace(/^--/, '');
  if (!process.argv[i].startsWith('--') || !Object.hasOwn(options, name) || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) {
    console.error('Usage : node scripts/publish-pages.mjs [--repo chemin] [--site dist/site] [--remote origin]');
    process.exit(1);
  }
  options[name] = process.argv[++i];
}

const repo = resolve(options.repo);
const site = resolve(repo, options.site);
const branch = 'refs/heads/gh-pages';
const temporaryRef = `refs/codex-pages/${randomUUID()}`;
let temporary;
let refCreated = false;

// Les erreurs réseau peuvent contenir l'URL du remote ou un en-tête d'authentification.
// On capture leur sortie sans la réafficher, y compris pour les échecs de push.
function git(args, { cwd = repo, env = process.env, label = 'Git' } = {}) {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${label} a échoué (code ${result.status ?? 'indisponible'}).`);
  return result.stdout.trim();
}

function validateBuild() {
  try {
    if (!lstatSync(site).isDirectory()) throw new Error();
    for (const file of ['index.html', 'version.json']) {
      const stat = lstatSync(join(site, file));
      if (!stat.isFile() || stat.size === 0) throw new Error();
    }
  } catch {
    throw new Error('Build absent ou incomplet : index.html et version.json sont obligatoires. Lancer npm run build:site.');
  }
  let version;
  try { version = JSON.parse(readFileSync(join(site, 'version.json'), 'utf8')).version; } catch { /* Diagnostic ci-dessous. */ }
  if (typeof version !== 'string' || !version.trim()) throw new Error('version.json doit contenir une version non vide.');

  function inspect(directory, top = true) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.toLowerCase() === '.git' || (top && entry.name === 'essais')) {
        throw new Error('Le build contient un chemin réservé (.git ou essais). Publication annulée.');
      }
      if (entry.name === 'prive-baked') throw new Error('Le build contient prive-baked : c\u2019est la version locale (médias privés), jamais publiée. Publication annulée.');
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
        throw new Error('Le build doit contenir uniquement des fichiers et dossiers ordinaires.');
      }
      if (entry.isDirectory()) inspect(join(directory, entry.name), false);
    }
  }
  inspect(site);
}

try {
  validateBuild();
  // Exiger un nom de remote configuré : ne jamais accepter un jeton dans une URL en argument.
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(options.remote) || !git(['remote']).split('\n').includes(options.remote)) {
    throw new Error('Remote Git non configuré ou nom invalide.');
  }
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  const source = git(['rev-parse', '--verify', 'HEAD']);
  const remoteHead = spawnSync('git', ['ls-remote', '--exit-code', '--heads', options.remote, branch], {
    cwd: repo, encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  if (remoteHead.error || ![0, 2].includes(remoteHead.status)) throw new Error('Lecture de gh-pages impossible avec l’authentification Git existante.');

  let parent;
  if (remoteHead.status === 0) {
    git(['fetch', '--no-tags', '--no-write-fetch-head', options.remote, `${branch}:${temporaryRef}`], { label: 'Récupération de gh-pages' });
    refCreated = true;
    parent = git(['rev-parse', temporaryRef]);
  }

  temporary = mkdtempSync(join(tmpdir(), 'cecile-pages-'));
  const staging = join(temporary, 'site');
  cpSync(site, staging, { recursive: true });
  writeFileSync(join(staging, '.nojekyll'), '');
  const indexEnv = { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: staging, GIT_INDEX_FILE: join(temporary, 'index') };
  const indexedGit = (args) => git(args, { cwd: staging, env: indexEnv });
  indexedGit(['read-tree', '--empty']);
  indexedGit(['add', '--all', '--force']);
  if (parent) {
    const essais = git(['ls-tree', parent, '--', 'essais']);
    if (essais) {
      if (!/^040000 tree /.test(essais)) throw new Error('essais doit être un dossier sur gh-pages. Publication annulée.');
      // Reprendre les objets existants : aucune suppression ou réécriture des essais.
      indexedGit(['read-tree', '--prefix=essais/', `${parent}:essais`]);
    }
  }
  const tree = indexedGit(['write-tree']);
  let published = parent;
  if (parent && tree === git(['rev-parse', `${parent}^{tree}`])) {
    console.log('gh-pages contient déjà ce build ; aucune publication nécessaire.');
  } else {
    const commit = git([
      '-c', 'user.name=github-actions[bot]',
      '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit-tree', tree, ...(parent ? ['-p', parent] : []),
      '-m', `Carnet publié depuis ${source.slice(0, 7)}`,
    ]);
    git(['push', '--porcelain', options.remote, `${commit}:${branch}`], {
      label: 'Publication de gh-pages (si la branche a changé, relancer après vérification ; aucun push forcé)',
    });
    published = commit;
    console.log(`gh-pages publié (${commit.slice(0, 7)}) ; historique et essais conservés.`);
  }
  // Le workflow archive ce commit précis, avec les essais, sans nouvelle lecture distante.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `commit=${published}\n`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (refCreated) {
    try { git(['update-ref', '-d', temporaryRef]); } catch { console.error('Nettoyage de la référence Git temporaire impossible.'); process.exitCode = 1; }
  }
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
