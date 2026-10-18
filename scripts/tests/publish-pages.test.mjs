// Intégration Git réelle, uniquement avec des dépôts bare temporaires locaux.
//   node --test scripts/tests/publish-pages.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../publish-pages.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function put(root, name, contents) {
  mkdirSync(dirname(join(root, name)), { recursive: true });
  writeFileSync(join(root, name), contents);
}
function fixture(t, { pages = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'cecile-pages-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const remote = join(directory, 'remote.git');
  const repo = join(directory, 'source');
  git(directory, 'init', '--bare', '--initial-branch=main', remote);
  git(directory, 'init', '--initial-branch=main', repo);
  git(repo, 'config', 'user.name', 'Test publication');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'remote', 'add', 'origin', remote);
  put(repo, '.gitignore', 'dist/\n');
  put(repo, 'source.txt', 'source versionnée\n');
  git(repo, 'add', '--all');
  git(repo, 'commit', '-m', 'Sources');
  git(repo, 'push', 'origin', 'main');
  let parent;
  if (pages) {
    git(repo, 'checkout', '--orphan', 'gh-pages');
    git(repo, 'rm', '-r', '-f', '--', '.');
    put(repo, 'index.html', 'ancienne page');
    put(repo, 'version.json', '{"version":"ancienne"}\n');
    put(repo, 'assets/obsolete.js', 'ancien asset');
    put(repo, 'obsolete.txt', 'à retirer');
    put(repo, 'essais/mobile/index.html', 'essai mobile à conserver');
    put(repo, 'essais/mobile/assets/pixel.bin', Buffer.from([0, 1, 128, 255]));
    put(repo, 'essais/autre/index.html', 'autre essai à conserver');
    git(repo, 'add', '--all');
    git(repo, 'commit', '-m', 'Publication précédente avec essais');
    git(repo, 'push', 'origin', 'gh-pages');
    parent = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', 'main');
  }
  put(repo, 'dist/site/index.html', '<html>nouveau carnet</html>');
  put(repo, 'dist/site/version.json', '{"version":"20261018T120000"}\n');
  put(repo, 'dist/site/assets/carnet.js', 'nouveau JavaScript');
  // Une modification utilisateur et un fichier non suivi doivent survivre à la publication.
  put(repo, 'source.txt', 'modification locale non commitée\n');
  put(repo, 'notes-locales.txt', 'à préserver\n');
  return { directory, repo, remote, parent };
}
function publish(repo, env = {}) {
  return spawnSync(process.execPath, [script, '--repo', repo], {
    encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '', ...env },
  });
}
function checkoutSnapshot(repo) {
  const files = {};
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!prefix && entry.name === '.git') continue;
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) visit(join(directory, entry.name), `${name}/`);
      else files[name] = createHash('sha256').update(readFileSync(join(directory, entry.name))).digest('hex');
    }
  }
  visit(repo);
  return {
    files,
    head: git(repo, 'rev-parse', 'HEAD'),
    branch: git(repo, 'symbolic-ref', 'HEAD'),
    status: git(repo, 'status', '--porcelain=v1', '--untracked-files=all'),
    index: readFileSync(join(repo, '.git/index')).toString('base64'),
    fetchHead: existsSync(join(repo, '.git/FETCH_HEAD')) ? readFileSync(join(repo, '.git/FETCH_HEAD'), 'utf8') : null,
  };
}

test('remplace la racine, préserve tous les essais et ajoute un commit sans toucher aux sources', (t) => {
  const { directory, repo, remote, parent } = fixture(t);
  const before = checkoutSnapshot(repo);
  const output = join(directory, 'github-output');
  const result = publish(repo, { GITHUB_OUTPUT: output });
  assert.equal(result.status, 0, result.stderr);
  const published = git(remote, 'rev-parse', 'gh-pages');
  assert.equal(readFileSync(output, 'utf8'), `commit=${published}\n`);
  assert.equal(git(remote, 'rev-parse', `${published}^`), parent);
  assert.equal(git(remote, 'merge-base', '--is-ancestor', parent, published), '');
  assert.equal(git(remote, 'rev-parse', `${published}:essais`), git(remote, 'rev-parse', `${parent}:essais`));
  assert.equal(git(remote, 'show', 'gh-pages:index.html'), '<html>nouveau carnet</html>');
  assert.equal(git(remote, 'show', 'gh-pages:assets/carnet.js'), 'nouveau JavaScript');
  assert.equal(git(remote, 'show', 'gh-pages:.nojekyll'), '');
  const paths = git(remote, 'ls-tree', '-r', '--name-only', 'gh-pages').split('\n');
  assert.ok(!paths.includes('assets/obsolete.js'));
  assert.ok(!paths.includes('obsolete.txt'));
  assert.ok(!paths.includes('source.txt'));
  // Même export que le workflow : la racine reconstruite ET les essais préservés.
  const artifact = join(directory, 'artifact');
  mkdirSync(artifact);
  const archive = execFileSync('git', ['archive', published], { cwd: repo });
  execFileSync('tar', ['-x', '-C', artifact], { input: archive });
  assert.equal(readFileSync(join(artifact, 'index.html'), 'utf8'), '<html>nouveau carnet</html>');
  assert.deepEqual(readFileSync(join(artifact, 'essais/mobile/assets/pixel.bin')), Buffer.from([0, 1, 128, 255]));
  assert.ok(!existsSync(join(artifact, 'assets/obsolete.js')));
  assert.deepEqual(checkoutSnapshot(repo), before);
  assert.equal(git(repo, 'for-each-ref', '--format=%(refname)', 'refs/codex-pages/'), '');

  const again = publish(repo, { GITHUB_OUTPUT: output });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /déjà ce build/);
  assert.equal(git(remote, 'rev-parse', 'gh-pages'), published);
  assert.equal(readFileSync(output, 'utf8'), `commit=${published}\ncommit=${published}\n`);
  assert.deepEqual(checkoutSnapshot(repo), before);
});

test('refuse un build absent, incomplet, invalide ou contenant des essais', (t) => {
  const { repo, remote, parent } = fixture(t);
  const cases = [
    () => rmSync(join(repo, 'dist/site'), { recursive: true }),
    () => put(repo, 'dist/site/index.html', 'sans version'),
    () => put(repo, 'dist/site/version.json', '{"version":""}'),
    () => { put(repo, 'dist/site/version.json', '{"version":"v1"}'); put(repo, 'dist/site/essais/index.html', 'ne pas écraser'); },
  ];
  for (const arrange of cases) {
    arrange();
    const before = checkoutSnapshot(repo);
    const result = publish(repo);
    assert.equal(result.status, 1);
    assert.equal(git(remote, 'rev-parse', 'gh-pages'), parent);
    assert.deepEqual(checkoutSnapshot(repo), before);
    assert.equal(git(repo, 'for-each-ref', '--format=%(refname)', 'refs/codex-pages/'), '');
  }
});

test('peut créer une première branche gh-pages sans réécrire main', (t) => {
  const { repo, remote } = fixture(t, { pages: false });
  const before = checkoutSnapshot(repo);
  const main = git(remote, 'rev-parse', 'main');
  const result = publish(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(remote, 'rev-list', '--count', 'gh-pages'), '1');
  assert.equal(git(remote, 'show', 'gh-pages:index.html'), '<html>nouveau carnet</html>');
  assert.equal(git(remote, 'rev-parse', 'main'), main);
  assert.deepEqual(checkoutSnapshot(repo), before);
});

test('une publication concurrente fait échouer le push sans exposer sa sortie confidentielle', (t) => {
  const { repo, remote, parent } = fixture(t);
  const tree = git(repo, 'rev-parse', `${parent}^{tree}`);
  const concurrent = git(repo, 'commit-tree', tree, '-p', parent, '-m', 'Autre publication concurrente');
  // Envoyer l'objet sans avancer gh-pages : le hook le fera entre fetch et push.
  git(repo, 'push', 'origin', `${concurrent}:refs/heads/concurrent-test`);
  const hook = join(repo, '.git/hooks/pre-push');
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  put(repo, '.git/hooks/pre-push', `#!/bin/sh\ngit --git-dir=${quote(remote)} update-ref refs/heads/gh-pages ${quote(concurrent)}\necho 'https://x-access-token:secret-factice@github.com/test/depot.git' >&2\n`);
  chmodSync(hook, 0o755);
  const before = checkoutSnapshot(repo);
  const result = publish(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /aucun push forcé/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes('secret-factice'));
  assert.equal(git(remote, 'rev-parse', 'gh-pages'), concurrent);
  assert.deepEqual(checkoutSnapshot(repo), before);
  assert.equal(git(repo, 'for-each-ref', '--format=%(refname)', 'refs/codex-pages/'), '');
});
