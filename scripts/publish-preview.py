#!/usr/bin/env python3
"""Publie seulement essais/reprise-v8, avec parent Git et vérification des chemins préservés."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

import sys

repo = Path(__file__).resolve().parents[1]
site = repo / 'dist/site'
prefix = 'essais/reprise-v8/'
if '--prefix' in sys.argv:
    idx = sys.argv.index('--prefix')
    if idx + 1 < len(sys.argv):
        prefix = sys.argv[idx + 1].strip('/') + '/'
        assert prefix.startswith('essais/'), 'Le préfixe doit commencer par essais/'

def git(*args, env=None, cwd=repo, data=None):
    result = subprocess.run(['git', *args], cwd=cwd, env=env, input=data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(f'Git {args[0]} a échoué (code {result.returncode})')
    return result.stdout.decode().strip()

assert (site / 'index.html').is_file()
version = json.loads((site / 'version.json').read_text())['version']
assert version
assert not (site / '.git').exists()
git('fetch', '--no-tags', 'origin', '+refs/heads/gh-pages:refs/remotes/origin/gh-pages')
parent = git('rev-parse', 'refs/remotes/origin/gh-pages')
source = git('rev-parse', 'HEAD')
assert not git('status', '--porcelain', '--untracked-files=no'), 'Commiter les sources avant publication'
gitdir = git('rev-parse', '--absolute-git-dir')

with tempfile.TemporaryDirectory(prefix='cecile-preview-') as temporary:
    env = dict(os.environ, GIT_DIR=gitdir, GIT_WORK_TREE=str(site),
               GIT_INDEX_FILE=str(Path(temporary) / 'build-index'))
    git('read-tree', '--empty', env=env, cwd=site)
    git('add', '--all', '--force', env=env, cwd=site)
    build = git('write-tree', env=env, cwd=site)

    env['GIT_INDEX_FILE'] = str(Path(temporary) / 'publication-index')
    git('read-tree', parent, env=env, cwd=site)
    old = subprocess.run(['git', 'ls-files', '-z', '--', prefix], cwd=site,
                         env=env, capture_output=True, check=True).stdout
    if old:
        git('update-index', '--force-remove', '-z', '--stdin', env=env, cwd=site, data=old)
    git('read-tree', '--prefix=' + prefix, build, env=env, cwd=site)
    tree = git('write-tree', env=env, cwd=site)
    changed = git('diff-tree', '--no-commit-id', '--name-only', '-r',
                  parent + '^{tree}', tree).splitlines()
    assert changed and all(name.startswith(prefix) for name in changed)
    assert git('rev-parse', parent + ':index.html') == git('rev-parse', tree + ':index.html')
    assert git('rev-parse', parent + ':assets') == git('rev-parse', tree + ':assets')
    assert git('rev-parse', tree + ':' + prefix.rstrip('/')) == build
    commit = git('-c', 'user.name=Codex', '-c', 'user.email=codex@users.noreply.github.com',
                 'commit-tree', tree, '-p', parent, '-m',
                 f'Essai reprise : harmonisation depuis {source[:7]} ({version})')
    git('push', 'origin', commit + ':refs/heads/gh-pages')
    remote = git('ls-remote', '--heads', 'origin', 'refs/heads/gh-pages').split()[0]
    assert remote == commit
    report = dict(commit=commit, parent=parent, source=source, version=version,
                  prefix=prefix, changed_files=len(changed), production_unchanged=True,
                  url='https://weber8thomas.github.io/gouters-de-cecile/' + prefix)
    output = repo / 'verification/out/harmonisation-v9/preview-publication.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
