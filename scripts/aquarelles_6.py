"""Bibliothèque d'aquarelles, lot 6 « anniversaire » (les trente ans de Cécile : page de titre, dédicace).

Réutilise la chaîne du thème 1 (scripts/aquarelles.py) et l'éclaircissement du lot 3
(scripts/aquarelles_3.py) : charger_sur_blanc, eclaircir_papier, detourer, rogner, reduire, harmoniser.

Source : Pixabay, Pixabay Content License (usage libre, modification permise, sans attribution
obligatoire ; l'auteur est crédité quand même). Règle des lots 4 et 5 : pas d'illustration étiquetée
« AI generated », publiée avant 2022. Le gâteau rose de fineartdaily était déjà relevé dans le thème 1
(scripts/aquarelles.py, « gateau-anniversaire-2 » : licence et auteur lus sur la page) ; l'original
est dans originaux/. Publication : 10 avril 2016 (chemin du CDN, 2016/04/10, et lot de l'auteur avec
la part au chocolat 1320366 du lot 4), bien avant les images générées.

    PY=tools/ecriture/.venv/bin/python
    $PY -I -B scripts/aquarelles_6.py telecharger   # si l'original manque
    $PY -I -B scripts/aquarelles_6.py traiter

Ce script ne lit que des images téléchargées depuis la page ci-dessous : on le lance avec `-I`.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "scripts"))  # `-I` ne met pas le dossier du script dans sys.path
import aquarelles as t1  # noqa: E402  (chaîne de traitement du thème 1)
import aquarelles_3 as t3  # noqa: E402  (éclaircissement du papier, est_image)

V5 = RACINE / "verification/out/v5-aquarelles"
ORIGINAUX = V5 / "originaux"
TELECHARGEMENTS = V5 / "telechargements-6"
SORTIE = RACINE / "design-system/aquarelles"
CATALOGUE = SORTIE / "catalogue-6.json"

MANIFESTE = [
    {
        "nom": "gateau-bougies",
        "sujet": "gâteau d'anniversaire rose à trois couches et cinq bougies allumées, aquarelle ; "
                 "le « HAPPY HAPPY! » écrit sous le gâteau est coupé",
        "page": "https://pixabay.com/illustrations/birthday-cake-birthday-pink-cake-1320359/",
        "url": "https://cdn.pixabay.com/photo/2016/04/10/17/24/birthday-cake-1320359_1280.jpg",
        "auteur": "fineartdaily (Pixabay)",
        "publiee": "2016-04-10",
        "original": "gateau-anniversaire-2.jpg",
        "boite": (0, 14, 822, 856),   # hors du texte écrit sous le gâteau
    },
]


def telecharger() -> None:
    ORIGINAUX.mkdir(parents=True, exist_ok=True)
    for item in MANIFESTE:
        dest = ORIGINAUX / item["original"]
        if dest.exists() and t3.est_image(dest):
            print(f"déjà là : {dest.name}")
            continue
        travail = TELECHARGEMENTS / item["nom"]
        shutil.rmtree(travail, ignore_errors=True)
        travail.mkdir(parents=True)                       # dossier vide, à part
        tmp = travail / item["original"]
        # Le CDN de Pixabay refuse les requêtes sans Referer de la page d'origine.
        r = subprocess.run(["curl", "-sS", "--fail", "-L", "-m", "120", "-A", t1.UA,
                            "-e", "https://pixabay.com/", "-o", str(tmp), item["url"]],
                           capture_output=True, text=True)
        if r.returncode or not t3.est_image(tmp):
            print(f"ÉCHEC {item['nom']} : {r.stderr.strip() or 'réponse non image'}")
        else:
            os.replace(tmp, dest)
            print(f"téléchargé : {dest.name}")
        shutil.rmtree(travail, ignore_errors=True)


def traiter_un(item: dict) -> Image.Image:
    rgb = t1.charger_sur_blanc(ORIGINAUX / item["original"])
    rgb = t3.eclaircir_papier(rgb)
    k, a = t1.detourer(rgb, item.get("plancher", t1.PLANCHER_PAPIER))
    k, a = t1.rogner(k, a, item["boite"], item.get("fondu", 0))
    k, a = t1.reduire(k, a)
    k = t1.harmoniser(k)
    rgba = np.concatenate([(k * 255).round(), (a[..., None] * 255).round()], axis=2)
    return Image.fromarray(rgba.astype(np.uint8))


def traiter() -> None:
    catalogue = {}
    for item in MANIFESTE:
        if not (ORIGINAUX / item["original"]).exists():
            print(f"absent, ignoré : {item['nom']} (lancer `telecharger`)")
            continue
        im = traiter_un(item)
        dest = SORTIE / f"{item['nom']}.png"
        im.save(dest, optimize=True)
        catalogue[item["nom"]] = {
            "sujet": item["sujet"],
            "source": item["page"],
            "auteur": item["auteur"],
            "publiee": item["publiee"],
            "licence": t1.LICENCE,
            "fichier": dest.name,
        }
        print(f"{dest.name} : {im.width}x{im.height}, {dest.stat().st_size // 1024} Ko")
    CATALOGUE.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"catalogue : {CATALOGUE.relative_to(RACINE)} ({len(catalogue)} entrées)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("etape", choices=["telecharger", "traiter"])
    args = parser.parse_args()
    if args.etape == "telecharger":
        telecharger()
    else:
        traiter()


if __name__ == "__main__":
    main()
