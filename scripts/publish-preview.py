#!/usr/bin/env python3
"""Publie un aperçu sous essais/, avec parent Git et vérification des chemins préservés."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[1]
site = repo / 'dist/site'
DEFAULT_PREFIX = 'essais/reprise-v8/'


def preview_prefix(value):
    """Un chemin Git littéral, strictement sous essais/, avec slash final canonique."""
    path = value[:-1] if value.endswith('/') else value
    if not re.fullmatch(r'essais/[A-Za-z0-9][A-Za-z0-9_-]*(?:/[A-Za-z0-9][A-Za-z0-9_-]*)*', path):
        raise argparse.ArgumentTypeError(
            'préfixe attendu : essais/<nom>/ ; segments composés uniquement de lettres ASCII, '
            'chiffres, tirets ou underscores, sans chemin absolu, point ni métacaractère'
        )
    return path + '/'


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prefix', type=preview_prefix, default=DEFAULT_PREFIX,
                        help='chemin de l’aperçu sous essais/ (défaut : %(default)s)')
    return parser.parse_args(argv)


def report_path(root, prefix):
    # Conserver le chemin du rapport historique pour la commande sans option.
    if prefix == DEFAULT_PREFIX:
        return root / 'verification/out/harmonisation-v9/preview-publication.json'
    return root / 'verification/out/previews' / prefix.removeprefix('essais/') / 'preview-publication.json'


def require(condition, message):
    # Ces protections restent actives même si Python est lancé avec -O.
    if not condition:
        raise RuntimeError(message)

def git(*args, env=None, cwd=repo, data=None):
    result = subprocess.run(['git', *args], cwd=cwd, env=env, input=data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(f'Git {args[0]} a échoué (code {result.returncode})')
    return result.stdout.decode().strip()

def main(argv=None):
    prefix = parse_args(argv).prefix
    require((site / 'index.html').is_file(), 'Construire le site avant publication')
    version = json.loads((site / 'version.json').read_text())['version']
    require(bool(version), 'Version de build absente')
    require(not (site / '.git').exists(), 'Le build ne doit pas contenir de dossier .git')
    git('fetch', '--no-tags', 'origin', '+refs/heads/gh-pages:refs/remotes/origin/gh-pages')
    parent = git('rev-parse', 'refs/remotes/origin/gh-pages')
    source = git('rev-parse', 'HEAD')
    require(not git('status', '--porcelain', '--untracked-files=no'), 'Commiter les sources avant publication')
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
        require(changed and all(name.startswith(prefix) for name in changed),
                'Publication vide ou modification en dehors du préfixe autorisé')
        require(git('rev-parse', parent + ':index.html') == git('rev-parse', tree + ':index.html'),
                'La page de production a changé')
        require(git('rev-parse', parent + ':assets') == git('rev-parse', tree + ':assets'),
                'Les assets de production ont changé')
        require(git('rev-parse', tree + ':' + prefix.rstrip('/')) == build,
                'L’arbre de l’aperçu diffère du build')
        commit = git('-c', 'user.name=Codex', '-c', 'user.email=codex@users.noreply.github.com',
                     'commit-tree', tree, '-p', parent, '-m',
                     f'Essai {prefix.rstrip("/")} : aperçu depuis {source[:7]} ({version})')
        git('push', 'origin', commit + ':refs/heads/gh-pages')
        remote = git('ls-remote', '--heads', 'origin', 'refs/heads/gh-pages').split()[0]
        require(remote == commit, 'La branche distante diffère du commit publié')
        output = report_path(repo, prefix)
        report = dict(commit=commit, parent=parent, source=source, version=version,
                      prefix=prefix, changed_files=len(changed), production_unchanged=True,
                      url='https://weber8thomas.github.io/gouters-de-cecile/' + prefix,
                      report=str(output.relative_to(repo)))
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report))


if __name__ == '__main__':
    main()
