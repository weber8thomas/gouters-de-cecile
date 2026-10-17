"""Bibliothèque d'aquarelles, thème 3 « cuisine et goûter » (lot 3).

Réutilise la chaîne du thème 1 (scripts/aquarelles.py) : charger_sur_blanc, detourer, rogner,
reduire, harmoniser. Ajoute deux choses : un éclaircissement du papier crème vers le blanc avant
le détourage (le détourage du thème 1 ne retire que le blanc), et une planche à 10 cases.

Sources : Wikimedia Commons, domaine public ou CC0 (licence lue sur chaque page, voir catalogue-3.json).
Téléchargements espacés (le quota de Commons répond 429) ; chaque original passe par un dossier
vide de téléchargement avant d'être déplacé dans originaux/.

    PY=tools/ecriture/.venv/bin/python
    $PY -I -B scripts/aquarelles_3.py telecharger
    $PY -I -B scripts/aquarelles_3.py traiter
    $PY -I -B scripts/aquarelles_3.py planche
    $PY -I -B scripts/aquarelles_3.py tout

Ce script ne lit que des images téléchargées depuis les pages ci-dessous : on le lance avec `-I`.
"""
from __future__ import annotations

import argparse
import json
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
from aquarelles_2 import paper_colour  # noqa: E402  (couleur du papier, médiane des bords)

V5 = RACINE / "verification/out/v5-aquarelles"
ORIGINAUX = V5 / "originaux"
TELECHARGEMENTS = V5 / "telechargements-3"
PLANCHE = V5 / "planche-3.png"
SORTIE = RACINE / "design-system/aquarelles"
CATALOGUE = SORTIE / "catalogue-3.json"
POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
POLICE_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"
PAUSE = 30                      # secondes entre deux requêtes vers Commons

UA = ("gouters-de-cecile-aquarelles/1.0 (carnet de recettes personnel; "
      "recherche d'images)")
PD = "Domaine public"
CC0 = "CC0 1.0 (Wikimedia Commons)"
KOHLER = "Domaine public (Köhler's Medizinal-Pflanzen, planche PD)"
CATTO = "CC0 1.0 (Aberdeen Art Gallery & Museums, reproduction ; oeuvre du domaine public)"

# nom : métadonnées lues sur la page Commons (`page`), fichier local, URL directe, recadrage.
# `boite` : zone de recadrage en pixels de l'original (None = automatique d'après l'encre).
MANIFESTE = [
    {
        "nom": "ble",
        "sujet": "épi et tige de blé (Triticum aestivum), planche botanique de Köhler ; recadré sur la tige",
        "page": "https://commons.wikimedia.org/wiki/File:Triticum_aestivum_-_K%C3%B6hler%E2%80%93s_Medizinal-Pflanzen-274.jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/0/01/Triticum_aestivum_-_K%C3%B6hler%E2%80%93s_Medizinal-Pflanzen-274.jpg",
        "auteur": "Walther Otto Müller (planche de Köhler's Medizinal-Pflanzen)",
        "licence": KOHLER,
        "original": "ble.jpg",
        "boite": (130, 0, 345, 400),    # tige et épi ; exclut les figures de détail 12-13, « A » et graines du bas
        "fondu": 60,
    },
    {
        "nom": "oeufs",
        "sujet": "œuf d'oiseau bleu tacheté, aquarelle sur papier crème (œuf sauvage, pas un œuf de poule)",
        "page": "https://commons.wikimedia.org/wiki/File:James_Sowerby_-_A_Bird%27s_Egg_-_B1978.43.100_-_Yale_Center_for_British_Art.jpg",
        "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3c/James_Sowerby_-_A_Bird%27s_Egg_-_B1978.43.100_-_Yale_Center_for_British_Art.jpg/960px-James_Sowerby_-_A_Bird%27s_Egg_-_B1978.43.100_-_Yale_Center_for_British_Art.jpg",
        "auteur": "James Sowerby (1757-1822), Yale Center for British Art",
        "licence": "CC0 1.0 (Yale Center for British Art)",
        "original": "oeufs.jpg",
        "boite": (285, 300, 775, 735),
    },
    {
        "nom": "carotte",
        "sujet": "carotte avec fanes (Daucus carota), planche de la Flore des pays nordiques",
        "page": "https://commons.wikimedia.org/wiki/File:Billeder_af_nordens_flora_(Plate_254)_(6028854365).jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/2/25/Billeder_af_nordens_flora_%28Plate_254%29_%286028854365%29.jpg",
        "auteur": "August Mentz et C. H. Ostenfeld, Billeder af nordens flora (planche 254, BHL)",
        "licence": PD,
        "original": "carotte.jpg",
        "boite": None,          # à régler après lecture de l'original (texte « 254 GULEROD » en haut)
    },
    {
        "nom": "fraises",
        "sujet": "fraise des bois (Fragaria vesca), aquarelle botanique",
        "page": "https://commons.wikimedia.org/wiki/File:Wild_strawberry_(Fragaria_vesca)_-_William_Catto_-_ABDAG016057.jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/1/1e/Wild_strawberry_%28Fragaria_vesca%29_-_William_Catto_-_ABDAG016057.jpg",
        "auteur": "William Catto (1843-1927), Aberdeen Art Gallery & Museums (1914)",
        "licence": CATTO,
        "original": "fraises.jpg",
        "boite": None,
    },
    {
        "nom": "fleurs",
        "sujet": "violette des chiens (Viola canina), aquarelle botanique, délicate",
        "page": "https://commons.wikimedia.org/wiki/File:Dog_Violet_(Viola_Canina)_-_William_Catto_-_ABDAG016305.jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/5/52/Dog_Violet_%28Viola_Canina%29_-_William_Catto_-_ABDAG016305.jpg",
        "auteur": "William Catto (1843-1927), Aberdeen Art Gallery & Museums (1907)",
        "licence": CATTO,
        "original": "fleurs.jpg",
        "boite": None,
    },
]

# Sujets demandés sans source trouvée ou téléchargeable à ce jour (planche : cases vides).
MANQUANTS = ["cake", "tarte-pommes", "sables", "cookie", "fouet"]


def est_image(chemin: Path) -> bool:
    try:
        with Image.open(chemin) as im:
            im.verify()
        return True
    except Exception:
        return False


# =============================================================================================
# Téléchargement des originaux, un dossier vide par fichier
# =============================================================================================
def telecharger(pause: int = PAUSE) -> None:
    ORIGINAUX.mkdir(parents=True, exist_ok=True)
    for item in MANIFESTE:
        dest = ORIGINAUX / item["original"]
        if dest.exists() and dest.stat().st_size > 1000 and est_image(dest):
            print(f"déjà là : {dest.name}")
            continue
        travail = TELECHARGEMENTS / item["nom"]
        shutil.rmtree(travail, ignore_errors=True)
        travail.mkdir(parents=True)                       # dossier vide, à part
        tmp = travail / item["original"]
        r = subprocess.run(["curl", "-sS", "--fail", "-L", "-m", "120", "-A", UA,
                            "-o", str(tmp), item["url"]], capture_output=True, text=True)
        if r.returncode or not est_image(tmp):
            print(f"ÉCHEC {item['nom']} : {r.stderr.strip() or 'réponse non image (quota ?)'}")
            tmp.unlink(missing_ok=True)
        else:
            os.replace(tmp, dest)                         # déplacement vers originaux/
            print(f"téléchargé : {dest.name} ({dest.stat().st_size} o)")
        shutil.rmtree(travail, ignore_errors=True)
        time.sleep(pause)


# =============================================================================================
# Traitement : éclaircissement du papier, détourage du thème 1, recadrage, harmonisation
# =============================================================================================
def eclaircir_papier(rgb: np.ndarray) -> np.ndarray:
    """Un fond crème ou teinté est ramené au blanc (division par la couleur du papier).

    Le détourage du thème 1 ne retire que le blanc : sans cette étape, le papier crème devient
    une teinte parasite une fois posé sur le carnet. Un fond déjà blanc n'est pas modifié.
    """
    papier = paper_colour(rgb)
    if papier.min() >= 0.9:
        return rgb
    return np.clip(rgb / np.maximum(papier, 0.2), 0.0, 1.0).astype(np.float32)


def traiter_un(item: dict) -> Image.Image:
    rgb = t1.charger_sur_blanc(ORIGINAUX / item["original"])
    rgb = eclaircir_papier(rgb)
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
            "licence": item["licence"],
            "fichier": dest.name,
        }
        print(f"{dest.name} : {im.width}x{im.height}, {dest.stat().st_size // 1024} Ko")
    CATALOGUE.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"catalogue : {CATALOGUE.relative_to(RACINE)} ({len(catalogue)} entrées)")


# =============================================================================================
# Planche de contrôle : 4 colonnes, posée par multiplication sur du papier du carnet
# =============================================================================================
def planche() -> None:
    cols, cell_w, cell_h, pad, tete = 4, 400, 380, 30, 110
    cases = [(item["nom"], item) for item in MANIFESTE] + [(nom, None) for nom in MANQUANTS]
    rows = (len(cases) + cols - 1) // cols
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
    police = ImageFont.truetype(POLICE, 26)
    police_i = ImageFont.truetype(POLICE_I, 20)
    police_t = ImageFont.truetype(POLICE, 34)
    for i, (nom, item) in enumerate(cases):
        cx = pad + (i % cols) * cell_w
        cy = tete + (i // cols) * cell_h
        boite_w, boite_h = cell_w - 40, cell_h - 100
        base = Image.fromarray((board * 255).astype(np.uint8))
        dessin = ImageDraw.Draw(base)
        if item is not None and (SORTIE / f"{nom}.png").exists():
            img = Image.open(SORTIE / f"{nom}.png").convert("RGBA")
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
            legende = item["licence"].split(" (")[0]
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
    ImageDraw.Draw(base).text((W // 2, 46), "Les goûters de Cécile : aquarelles, thème 3 (lot en cours)",
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
