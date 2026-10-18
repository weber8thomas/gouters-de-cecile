"""Bibliothèque d'aquarelles, lot 4 « pâtisseries » (Pixabay uniquement).

Réutilise la chaîne du thème 1 (scripts/aquarelles.py) et l'éclaircissement du lot 3
(scripts/aquarelles_3.py) : charger_sur_blanc, detourer, rogner, reduire, harmoniser, eclaircir_papier.

Sources : Pixabay, Pixabay Content License. Règle : pas d'illustration étiquetée « AI generated »
(ni mention d'IA), publiée avant 2022 (date lue sur la page, et portée dans le catalogue).
Wikimedia Commons n'est pas utilisé (quota 429).

Les téléchargements passent par un dossier vide par fichier (telechargements-4/<nom>/) puis sont
déplacés dans originaux/.

    PY=tools/ecriture/.venv/bin/python
    $PY -I -B scripts/aquarelles_4.py telecharger
    $PY -I -B scripts/aquarelles_4.py traiter
    $PY -I -B scripts/aquarelles_4.py planche
    $PY -I -B scripts/aquarelles_4.py tout

Ce script ne lit que des images téléchargées depuis les pages ci-dessous : on le lance avec `-I`.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "scripts"))  # `-I` ne met pas le dossier du script dans sys.path
import aquarelles as t1  # noqa: E402  (chaîne de traitement du thème 1)
import aquarelles_3 as t3  # noqa: E402  (éclaircissement du papier, est_image, polices)

V5 = RACINE / "verification/out/v5-aquarelles"
ORIGINAUX = V5 / "originaux"
TELECHARGEMENTS = V5 / "telechargements-4"
PLANCHE = V5 / "planche-4.png"
SORTIE = RACINE / "design-system/aquarelles"
CATALOGUE = SORTIE / "catalogue-4.json"
PAUSE = 3                         # secondes entre deux téléchargements

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
LICENCE = t1.LICENCE              # Pixabay Content License (usage libre, modification permise)

# nom : métadonnées lues sur la page Pixabay (`page`), fichier local, URL directe, recadrage.
MANIFESTE = [
    {
        "nom": "gateau",
        "sujet": "part de gâteau au chocolat et bougie, aquarelle (anniversaire)",
        "page": "https://pixabay.com/illustrations/birthday-cake-chocolate-birthday-1320366/",
        "url": "https://cdn.pixabay.com/photo/2016/04/10/17/38/birthday-cake-1320366_1280.jpg",
        "auteur": "fineartdaily (Pixabay)",
        "publiee": "2016-04-12",
        "original": "gateau-chocolat-1320366.jpg",
        "boite": None,
    },
    {
        "nom": "tarte-pommes",
        "sujet": "tarte aux pommes en rosace, peinture à la main (style numérique, pas aquarelle pure) ; "
                 "légende « Apple pie » du bas coupée",
        "page": "https://pixabay.com/illustrations/apple-pie-dessert-pastry-6618095/",
        "url": "https://cdn.pixabay.com/photo/2021/09/12/11/22/apple-pie-6618095_1280.png",
        "auteur": "auteur non indiqué sur la page (Pixabay)",
        "publiee": "2021-09-15",
        "original": "tarte-pommes-6618095.png",
        "boite": (0, 0, 1280, 812),   # hors de la légende « Apple pie » écrite sous la tarte
        "fondu": 24,                  # bord coupé adouci vers la transparence
    },
]

# Sujets demandés sans source acceptable à ce jour (planche : cases vides), dans l'ordre de priorité.
ORDRE = ["cake", "tarte-pommes", "cookie", "sables", "fouet", "gateau"]
MANQUANTS = ["cake", "cookie", "sables", "fouet"]


# =============================================================================================
# Téléchargement des originaux, un dossier vide par fichier
# =============================================================================================
def telecharger(pause: int = PAUSE) -> None:
    ORIGINAUX.mkdir(parents=True, exist_ok=True)
    for item in MANIFESTE:
        dest = ORIGINAUX / item["original"]
        if dest.exists() and dest.stat().st_size > 1000 and t3.est_image(dest):
            print(f"déjà là : {dest.name}")
            continue
        travail = TELECHARGEMENTS / item["nom"]
        shutil.rmtree(travail, ignore_errors=True)
        travail.mkdir(parents=True)                       # dossier vide, à part
        tmp = travail / item["original"]
        # Le CDN de Pixabay refuse les requêtes sans Referer de la page d'origine.
        r = subprocess.run(["curl", "-sS", "--fail", "-L", "-m", "120", "-A", UA,
                            "-e", "https://pixabay.com/", "-o", str(tmp), item["url"]],
                           capture_output=True, text=True)
        if r.returncode or not t3.est_image(tmp):
            print(f"ÉCHEC {item['nom']} : {r.stderr.strip() or 'réponse non image'}")
            tmp.unlink(missing_ok=True)
        else:
            os.replace(tmp, dest)                         # déplacement vers originaux/
            print(f"téléchargé : {dest.name} ({dest.stat().st_size} o)")
        shutil.rmtree(travail, ignore_errors=True)
        time.sleep(pause)


# =============================================================================================
# Traitement : éclaircissement du papier, détourage du thème 1, recadrage, harmonisation
# =============================================================================================
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
    SORTIE.mkdir(parents=True, exist_ok=True)
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
            "licence": LICENCE,
            "fichier": dest.name,
        }
        print(f"{dest.name} : {im.width}x{im.height}, {dest.stat().st_size // 1024} Ko")
    CATALOGUE.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"catalogue : {CATALOGUE.relative_to(RACINE)} ({len(catalogue)} entrées)")


# =============================================================================================
# Planche de contrôle : 3 colonnes, posée par multiplication sur du papier du carnet
# =============================================================================================
def planche() -> None:
    cols, cell_w, cell_h, pad, tete = 3, 480, 400, 30, 110
    par_nom = {item["nom"]: item for item in MANIFESTE}
    cases = [(nom, par_nom.get(nom)) for nom in ORDRE]
    rows = math.ceil(len(cases) / cols)
    W = cols * cell_w + 2 * pad
    H = tete + rows * cell_h + pad
    papier = Image.open(t1.PAPIER).convert("RGB")
    pw, ph = papier.size
    if pw / ph > W / H:
        nw = round(ph * W / H)
        papier = papier.crop(((pw - nw) // 2, 0, (pw - nw) // 2 + nw, ph))
    else:
        nh = round(pw * H / W)
        papier = papier.crop((0, (ph - nh) // 2, pw, (ph - nh) // 2 + nh))
    board = np.asarray(papier.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255.0
    police = ImageFont.truetype(t3.POLICE, 26)
    police_i = ImageFont.truetype(t3.POLICE_I, 20)
    police_t = ImageFont.truetype(t3.POLICE, 34)
    for i, (nom, item) in enumerate(cases):
        cx = pad + (i % cols) * cell_w
        cy = tete + (i // cols) * cell_h
        boite_w, boite_h = cell_w - 40, cell_h - 100
        base = Image.fromarray((board * 255).astype(np.uint8))
        dessin = ImageDraw.Draw(base)
        fichier = SORTIE / f"{nom}.png"
        if item is not None and fichier.exists():
            img = Image.open(fichier).convert("RGBA")
            s = min(boite_w / img.width, boite_h / img.height, 1.0)
            im2 = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
            ox = cx + (cell_w - im2.width) // 2
            oy = cy + (boite_h - im2.height) // 2 + 6
            a = np.asarray(im2, dtype=np.float32)[..., 3:4] / 255.0
            art = np.asarray(im2.convert("RGB"), dtype=np.float32) / 255.0
            region = board[oy:oy + im2.height, ox:ox + im2.width]
            board[oy:oy + im2.height, ox:ox + im2.width] = region * ((1.0 - a) + a * art)
            base = Image.fromarray((board * 255).astype(np.uint8))
            dessin = ImageDraw.Draw(base)
            legende = item["auteur"].split(" (")[0]
        else:
            dessin.rounded_rectangle((cx + 20, cy + 20, cx + cell_w - 20, cy + boite_h),
                                     18, outline=(120, 90, 70), width=2)
            dessin.text((cx + cell_w // 2, cy + boite_h // 2 - 8), "pas encore de source",
                        fill=(90, 70, 55), font=police_i, anchor="mm")
            legende = ""
        dessin.text((cx + cell_w // 2, cy + boite_h + 22), nom, fill=(60, 45, 35), font=police, anchor="mm")
        dessin.text((cx + cell_w // 2, cy + boite_h + 52), legende, fill=(110, 90, 75), font=police_i, anchor="mm")
        board = np.asarray(base, dtype=np.float32) / 255.0
    base = Image.fromarray((board * 255).astype(np.uint8))
    ImageDraw.Draw(base).text((W // 2, 46), "Les goûters de Cécile : aquarelles, thème 4 (lot en cours)",
                              fill=(60, 45, 35), font=police_t, anchor="mm")
    PLANCHE.parent.mkdir(parents=True, exist_ok=True)
    base.save(PLANCHE, optimize=True)
    print(f"planche : {PLANCHE}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("etape", choices=["telecharger", "traiter", "planche", "tout"])
    args = parser.parse_args()
    if args.etape in ("telecharger", "tout"):
        telecharger()
    if args.etape in ("traiter", "tout"):
        traiter()
    if args.etape in ("planche", "tout"):
        planche()


if __name__ == "__main__":
    main()
