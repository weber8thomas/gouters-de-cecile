"""Aperçu d'une ou plusieurs pages (papier + encre composés) SANS rien cuire : ni manifeste, ni
design-system/baked, ni cache. Sert aux essais en parallèle (plusieurs personnes / agents à la fois).

    tools/ecriture/.venv/bin/python scripts/pages/apercu.py julie-gauche,julie-droite [--sortie DOSSIER]
        → DOSSIER/<page>.png (défaut : verification/out/apercu/), plus DOSSIER/<double>.png quand les
          deux pages d'une double page sont demandées, et la liste des mots douteux / débordements.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import cuire as C  # noqa: E402
import recette as RC  # noqa: E402

RACINE = ICI.parents[1]


def preparer(sortie: Path):
    pages, papiers, plan = C.charger_descriptions()
    carnet, roster = RC.charger_carnet(), RC.charger_roster()
    journal: list = []
    pages = C.appliquer_carnet(pages, carnet, roster, journal)
    # sortie à part : le papier mis en cache par la cuisine ne touche pas design-system/baked
    cu = C.Cuisine(pages, papiers, force=True, x4=False, sortie=sortie, cache=sortie / ".cuisson.json")
    cu.ecrire_cache = lambda: None  # aperçu : on n'écrit jamais le cache de cuisson
    gen, erreurs = C.paginer_recettes(plan, papiers, dict(cu.cache), cu.moteur, cu.outil, False, (), journal, carnet, roster)
    pages.update(gen)
    pages = C.ajouter_contextes(pages, plan)
    cu.pages = pages
    cu.par_folio = {p["folio"]: p for p in pages.values() if "folio" in p and p.get("type") != "feuillet"}
    return cu, erreurs


def composer(cu, pid: str) -> tuple[np.ndarray, object]:
    mise, Rt, union, _ = cu.recto(pid)
    page = cu.pages[pid]
    P = cu.papier_page(page)
    V = None
    try:
        V = cu.transparence(page, P.shape[:2])
    except Exception:
        V = None
    _, voulu = C.R.composer(P, Rt, union, V, cu.ech)
    img = np.clip(np.round(voulu), 0, 255).astype(np.uint8)
    return img, mise


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", help="ids de pages séparés par des virgules (julie-gauche,julie-droite)")
    ap.add_argument("--sortie", default=str(RACINE / "verification/out/apercu"))
    a = ap.parse_args(argv)
    out = Path(a.sortie)
    out.mkdir(parents=True, exist_ok=True)
    cu, erreurs = preparer(out / "_cuisine")
    for e in erreurs:
        print(f"✗ recette trop longue : {e}")
    images = {}
    for pid in filter(None, a.pages.split(",")):
        if pid not in cu.pages:
            print(f"✗ page inconnue : {pid}")
            continue
        img, mise = composer(cu, pid)
        Image.fromarray(img).save(out / f"{pid}.png")
        images[pid] = img
        deb = getattr(mise, "deborde", None) or []
        print(f"{pid} : {out / (pid + '.png')}" + (f" — DÉBORDE : {deb}" if deb else "") +
              (f" — douteux : {list(mise.douteux)}" if getattr(mise, "douteux", None) else ""))
    # doubles pages complètes
    for pid, img in images.items():
        if pid.endswith("-gauche") and pid.replace("-gauche", "-droite") in images:
            d = images[pid.replace("-gauche", "-droite")]
            h = max(img.shape[0], d.shape[0])
            dbl = np.full((h, img.shape[1] + d.shape[1], 3), 40, np.uint8)
            dbl[: img.shape[0], : img.shape[1]] = img
            dbl[: d.shape[0], img.shape[1]:] = d
            Image.fromarray(dbl).resize((dbl.shape[1] // 2, h // 2)).save(out / f"{pid[:-7]}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
