"""Bibliothèque d'aquarelles, lot 5 « biscuits, carotte » (réutilise la chaîne du thème 1).

Réutilise la chaîne du thème 1 (scripts/aquarelles.py) : charger_sur_blanc, detourer, rogner,
reduire, harmoniser, avec un éclaircissement du papier crème avant le détourage (comme le lot 3),
et une planche de contrôle à quatre cases.

Sources : Pixabay, sous la Pixabay Content License (même licence que le thème 1). L'auteur est lu
sur chaque page (`page` ci-dessous) ; quand la page ne l'affiche pas, le catalogue le dit.
Les téléchargements passent par le CDN de Pixabay avec un Referer de la page d'origine (sans lui,
le CDN répond 403). Chaque original passe par un dossier vide avant d'être déplacé dans originaux/.

    PY=tools/ecriture/.venv/bin/python
    $PY -I -B scripts/aquarelles_5.py telecharger
    $PY -I -B scripts/aquarelles_5.py traiter
    $PY -I -B scripts/aquarelles_5.py planche
    $PY -I -B scripts/aquarelles_5.py tout

Ce script ne lit que des images téléchargées depuis les pages ci-dessous : on le lance avec `-I`.
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
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "scripts"))  # `-I` ne met pas le dossier du script dans sys.path
import aquarelles as t1  # noqa: E402  (chaîne de traitement du thème 1)
from aquarelles_2 import paper_colour  # noqa: E402  (couleur du papier, médiane des bords)

V5 = RACINE / "verification/out/v5-aquarelles"
ORIGINAUX = V5 / "originaux"
TELECHARGEMENTS = V5 / "telechargements-5"
PLANCHE = V5 / "planche-5.png"
SORTIE = RACINE / "design-system/aquarelles"
CATALOGUE = SORTIE / "catalogue-5.json"
POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
POLICE_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
LICENCE = "Pixabay Content License (usage libre, modification permise)"

# nom : métadonnées lues sur la page Pixabay (`page`), fichier local, URL directe (et replis),
# recadrage. `boite` : zone de recadrage en pixels de l'original (None = automatique d'après l'encre).
MANIFESTE = [
    {
        "nom": "carotte",
        "sujet": "carotte entière avec ses fanes, aquarelle (biscuits « carottes » et goûter du jardin)",
        "page": "https://pixabay.com/illustrations/carrot-vegetable-watercolor-food-5934702/",
        "url": "https://cdn.pixabay.com/photo/2021/01/20/15/39/carrot-5934702_1280.png",
        "auteur": "non affiché sur la page Pixabay (image 5934702)",
        "original": "carotte.png",
        "boite": None,
    },
    {
        "nom": "sables-etoiles",
        "sujet": "sablés en étoiles glacés, aquarelle (motif de biscuits de Noël, trois étoiles entières)",
        "page": "https://pixabay.com/illustrations/cookies-pattern-seamless-christmas-8416230/",
        "url": "https://cdn.pixabay.com/photo/2023/11/27/21/19/cookies-8416230_1280.jpg",
        "auteur": "RadishAndSquirrel (Pixabay)",
        "original": "sables-etoiles.jpg",
        # deux sablés en étoile entiers (5 et 8 branches) ; le sapin voisin est retiré (`garder`)
        "garder": [(700, 470), (960, 850)],
        "boite": (528, 228, 1110, 1010),   # w/h = 0,74 : portrait
    },
    {
        "nom": "cookies",
        "sujet": "pile de cookies aux pépites de chocolat, miettes devant (image générée par IA, étiquette Pixabay)",
        "page": "https://pixabay.com/illustrations/milk-cookies-chocolate-chip-cookies-10379921/",
        "url": "https://cdn.pixabay.com/photo/2026/07/16/01/56/krolestwo_nauki-milk-10379921_1280.png",
        "url_repli": "https://cdn.pixabay.com/photo/2026/07/16/01/56/krolestwo_nauki-milk-10379921_640.png",
        "auteur": "Królestwo_Nauki (Pixabay)",
        "original": "cookies.png",
        # pile de cookies à droite, miettes et pépites devant ; la bouteille de lait (à gauche,
        # en partie cachée par le cookie de devant) est effacée hors du disque du cookie de devant
        "effacer": [{"polygone": [(165, 60), (604, 60), (604, 760), (430, 1000), (190, 1000), (165, 960)],
                     "sauf_disque": (667, 872, 214)}],
        "boite": (260, 300, 1165, 1205),   # carré, pour rester proche de la zone de la page
    },
    {
        "nom": "tasse-coeur",
        "sujet": "tasse et biscuits en forme de cœur, aquarelle (image générée par IA, étiquette Pixabay)",
        "page": "https://pixabay.com/illustrations/mug-watercolor-cookie-heart-shape-10097479/",
        "url": "https://cdn.pixabay.com/photo/2026/01/31/10/40/mug-10097479_1280.jpg",
        "url_repli": "https://cdn.pixabay.com/photo/2026/01/31/10/40/mug-10097479_640.jpg",
        "auteur": "TyliJura (Pixabay)",
        "original": "tasse-coeur.jpg",
        "boite": None,
    },
]


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
def telecharger() -> None:
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
        erreur = ""
        for url in [item["url"], item.get("url_repli")]:
            if not url:
                continue
            # Le CDN de Pixabay refuse les requêtes sans Referer de la page d'origine.
            r = subprocess.run(["curl", "-sS", "--fail", "-L", "-m", "90", "-A", UA,
                                "-e", "https://pixabay.com/", "-o", str(tmp), url],
                               capture_output=True, text=True)
            if r.returncode == 0 and est_image(tmp):
                os.replace(tmp, dest)                     # déplacement vers originaux/
                print(f"téléchargé : {dest.name} ({dest.stat().st_size} o) depuis {url}")
                break
            erreur = r.stderr.strip() or "réponse non image"
            tmp.unlink(missing_ok=True)
        else:
            print(f"ÉCHEC {item['nom']} : {erreur}")
        shutil.rmtree(travail, ignore_errors=True)


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


def garder(a: np.ndarray, graines: list) -> np.ndarray:
    """Ne garde que les objets (composantes de l'alpha) qui contiennent une des graines (x, y).

    Sert quand un objet voisin, entier ou non, tombe dans la zone de recadrage : il est retiré.
    """
    from scipy import ndimage as ndi
    lab, _ = ndi.label(ndi.binary_closing(a > 0.05, iterations=2))
    ids = {int(lab[y, x]) for x, y in graines}
    if 0 in ids:
        raise ValueError(f"graine hors dessin : {graines}")
    return a * ndi.binary_dilation(np.isin(lab, list(ids)), iterations=4)


def effacer(a: np.ndarray, zones: list) -> np.ndarray:
    """Met à zéro l'alpha dans un polygone, sauf dans un disque (un objet de devant qui le recouvre)."""
    from PIL import ImageDraw
    for z in zones:
        masque = Image.new("L", (a.shape[1], a.shape[0]), 0)
        ImageDraw.Draw(masque).polygon(z["polygone"], fill=255)
        if "sauf_disque" in z:
            cx, cy, r = z["sauf_disque"]
            ImageDraw.Draw(masque).ellipse((cx - r, cy - r, cx + r, cy + r), fill=0)
        a = a * (1.0 - np.asarray(masque, dtype=np.float32) / 255.0)
    return a.astype(np.float32)


def traiter_un(item: dict) -> Image.Image:
    rgb = t1.charger_sur_blanc(ORIGINAUX / item["original"])
    rgb = eclaircir_papier(rgb)
    k, a = t1.detourer(rgb, item.get("plancher", t1.PLANCHER_PAPIER))
    if item.get("garder"):
        a = garder(a, item["garder"])
    if item.get("effacer"):
        a = effacer(a, item["effacer"])
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
            "licence": LICENCE,
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
    cases = [(item["nom"], item) for item in MANIFESTE]
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
        if (SORTIE / f"{nom}.png").exists():
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
            legende = LICENCE.split(" (")[0]
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
    ImageDraw.Draw(base).text((W // 2, 46), "Les goûters de Cécile : aquarelles, lot 5 (biscuits, carotte)",
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
