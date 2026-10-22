#!/usr/bin/env python3
"""Ancienne cuisson parallèle (dossiers de workers, --resume, --repair) : remplacée par la cuisson
parallèle de cuire.py elle-même (`npm run pages:complet`, `npm run pages:rapide`, `--jobs N`).

Gardé pour les commandes déjà écrites (docs/reprise-v17.md) : --jobs et --sans-4x sont transmis à
cuire.py ; --out, --resume et --repair n'ont plus d'objet (le cache de cuire.py reprend une cuisson
interrompue page par page) et sont ignorés.
"""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts/pages'))
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')
import cuire as C  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--jobs', type=int, default=C.jobs_defaut(), choices=range(1, 9))
    ap.add_argument('--out')
    ap.add_argument('--sans-4x', action='store_true')
    ap.add_argument('--resume', action='store_true')
    ap.add_argument('--repair', type=int)
    a = ap.parse_args()
    if a.out or a.resume or a.repair is not None:
        print('--out, --resume et --repair sont ignorés : cuire.py reprend lui-même depuis son cache.', flush=True)
    return C.main(['--apercus', '--jobs', str(a.jobs)] + (['--sans-4x'] if a.sans_4x else []))


if __name__ == '__main__':
    sys.exit(main())
