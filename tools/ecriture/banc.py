#!/usr/bin/env python3
"""Banc de mesure : temps pour écrire une ligne de 40 caractères dans chaque main, avec et sans
relecture (TrOCR), sans cache. Écrit verification/out/n2/performances.json.

    python tools/ecriture/banc.py [--graines 3]
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

import ecrire as E  # noqa: E402
from styles import STYLES  # noqa: E402

LIGNES = [
    "Beurre le moule et préchauffe le four.",  # 38
    "Ajoute la farine et la levure tamisées.",  # 39
    "Verse dans le moule, cuis 35 minutes !",  # 38
]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--graines", type=int, default=3)
    ap.add_argument("--sortie", default=str(ICI.parents[1] / "verification/out/n2/performances.json"))
    a = ap.parse_args(argv)
    ecr = E.Ecrivain.get()
    t0 = time.time()
    for st in STYLES.values():
        ecr.main(st)  # amorces (≈ 1 s par main, mises en cache disque)
    t_mains = time.time() - t0
    t0 = time.time()
    ecr.lecteur()
    t_lecteur = time.time() - t0
    res = {"chargement_mains_s": round(t_mains, 2), "chargement_lecteur_s": round(t_lecteur, 2), "styles": {}}
    for nom in STYLES:
        d = {}
        for mode, relire in (("relu", True), ("rapide", False)):
            temps = []
            for g in range(a.graines):
                texte = LIGNES[g % len(LIGNES)]
                t = time.time()
                E.ecrire(texte, nom, 9000 + g, None, cache=False, relire=relire)
                temps.append(time.time() - t)
            d[mode] = dict(median_s=round(statistics.median(temps), 2), max_s=round(max(temps), 2))
        res["styles"][nom] = d
        print(nom, d, flush=True)
    t = time.time()
    E.ecrire(LIGNES[0], "soignee", 9000, None, cache=True)
    res["depuis_cache_s"] = round(time.time() - t, 3)
    Path(a.sortie).parent.mkdir(parents=True, exist_ok=True)
    Path(a.sortie).write_text(json.dumps(res, ensure_ascii=False, indent=1))
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()
