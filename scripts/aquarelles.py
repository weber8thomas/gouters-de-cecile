"""Bibliothèque d'aquarelles, thème 1 « pâtisseries et vaisselle » (lot v5).

Toutes les images viennent de Pixabay, sous la Pixabay Content License (usage libre, modification
permise). La licence et l'auteur ont été lus sur la page de chaque image (`page` ci-dessous).

Étapes :
  telecharger : récupère les originaux (non versionnés) dans verification/out/v5-aquarelles/originaux/ ;
  traiter     : détoure le blanc en transparence (le blanc devient l'alpha, c'est-à-dire la
                transmittance), recadre serré, limite à 900 px de côté, harmonise la teinte vers le
                papier crème, écrit design-system/aquarelles/<nom>.png et catalogue-1.json ;
  planche     : pose chaque aquarelle par multiplication sur du papier du carnet (contrôle visuel).

    PY=tools/ecriture/.venv/bin/python
    $PY -I scripts/aquarelles.py telecharger
    $PY -I scripts/aquarelles.py traiter
    $PY -I scripts/aquarelles.py planche
    $PY -I scripts/aquarelles.py tout

Ce script ne lit que des images téléchargées depuis les pages ci-dessous : on le lance avec `-I`.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parents[1]
V5 = RACINE / "verification/out/v5-aquarelles"
ORIGINAUX = V5 / "originaux"
PLANCHE = V5 / "planche-1.png"
SORTIE = RACINE / "design-system/aquarelles"
CATALOGUE = SORTIE / "catalogue-1.json"
PAPIER = RACINE / "design-system/baked/pages/papier/f9.webp"

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
LICENCE = "Pixabay Content License (usage libre, modification permise)"
COTE_MAX = 900                 # limite de côté, en pixels
PLANCHER_PAPIER = 0.035        # bruit de fond des scans JPEG : au-dessous, transparent
DESATURATION = 0.84            # < 1 : un peu moins saturé
TEINTE = np.array([1.025, 1.0, 0.93], np.float32)   # un peu plus chaud, vers le papier crème
LUMINANCE = np.array([0.299, 0.587, 0.114], np.float32)

# nom : fichier de sortie. `boite` : zone de recadrage en pixels de l'original (None = automatique
# d'après l'encre). `fondu` : pixels du bas adoucis vers la transparence (bougie coupée).
MANIFESTE = [
    {
        "nom": "cupcake",
        "sujet": "cupcake aquarelle, crème rose et framboise, moule lilas",
        "page": "https://pixabay.com/illustrations/cupcake-watercolor-food-sweets-4054535/",
        "url": "https://cdn.pixabay.com/photo/2019/03/14/10/07/cupcake-4054535_1280.png",
        "auteur": "Nic0leta (Pixabay)",
        "original": "cupcake.png",
        "boite": None,
    },
    {
        "nom": "gateau-anniversaire",
        "sujet": "gâteau d'anniversaire à trois étages et bougies, aquarelle "
                 "(image générée par IA, étiquette Pixabay)",
        "page": "https://pixabay.com/illustrations/date-of-birth-cake-candles-8279663/",
        "url": "https://cdn.pixabay.com/photo/2023/09/27/14/47/date-of-birth-8279663_1280.png",
        "auteur": "Darkmoon_Art (Dorothe Wouters)",
        "original": "gateau-anniversaire.png",
        "boite": None,
    },
    {
        "nom": "gateau-anniversaire-2",
        "sujet": "gâteau d'anniversaire rose et bougies, aquarelle (texte du bas recadré)",
        "page": "https://pixabay.com/illustrations/birthday-cake-birthday-pink-cake-1320359/",
        "url": "https://cdn.pixabay.com/photo/2016/04/10/17/24/birthday-cake-1320359_1280.jpg",
        "auteur": "fineartdaily (Pixabay)",
        "original": "gateau-anniversaire-2.jpg",
        "boite": (0, 14, 822, 856),
    },
    {
        "nom": "tarte-cerises",
        "sujet": "part de tarte aux cerises, aquarelle (aucune tarte aux pommes aquarelle trouvée)",
        "page": "https://pixabay.com/illustrations/watercolor-tea-snack-pie-7924019/",
        "url": "https://cdn.pixabay.com/photo/2023/04/14/04/15/watercolor-7924019_1280.png",
        "auteur": "Mia_Tortilla (Pixabay)",
        "original": "tarte-cerises-et-tasse.png",
        "boite": (78, 228, 672, 672),
    },
    {
        "nom": "tasse",
        "sujet": "tasse de thé sur sa soucoupe, aquarelle (la vapeur, blanche sur blanc, "
                 "ne survit pas au détourage)",
        "page": "https://pixabay.com/illustrations/watercolor-tea-snack-pie-7924019/",
        "url": "https://cdn.pixabay.com/photo/2023/04/14/04/15/watercolor-7924019_1280.png",
        "auteur": "Mia_Tortilla (Pixabay)",
        "original": "tarte-cerises-et-tasse.png",
        "boite": (742, 136, 1262, 646),
    },
    {
        "nom": "tasse-2",
        "sujet": "tasse à café en grès, aquarelle (café, pas thé)",
        "page": "https://pixabay.com/illustrations/mug-cup-coffee-tea-watercolor-8032892/",
        "url": "https://cdn.pixabay.com/photo/2023/06/01/06/52/mug-8032892_1280.png",
        "auteur": "ZAIDoopro (Pixabay)",
        "original": "tasse-2.png",
        "boite": None,
    },
    {
        "nom": "theiere",
        "sujet": "théière fleurie avec ses tasses et des pétales, aquarelle",
        "page": "https://pixabay.com/illustrations/teapot-teacup-drink-watercolor-10035657/",
        "url": "https://cdn.pixabay.com/photo/2025/12/26/08/56/teapot-10035657_1280.png",
        "auteur": "ZAIDoopro (Pixabay)",
        "original": "theiere.png",
        "boite": None,
    },
    {
        "nom": "cookie",
        "sujet": "biscuit en forme de cœur fourré à la crème, myrtilles, aquarelle "
                 "(gaufre, pas un cookie rond)",
        "page": "https://pixabay.com/illustrations/cookies-wafer-dessert-sweet-6009324/",
        "url": "https://cdn.pixabay.com/photo/2021/02/12/18/40/cookies-6009324_1280.jpg",
        "auteur": "MayaSchedrina (Pixabay)",
        "original": "cookie.jpg",
        "boite": (190, 120, 1200, 905),
        "plancher": 0.13,   # le papier rosé de la photo laisse un lavis gris : plus haut seuil
    },
    {
        "nom": "bougie",
        "sujet": "bougie rouge allumée, aquarelle (image générée par IA, étiquette Pixabay ; "
                 "branches coupées)",
        "page": "https://pixabay.com/illustrations/candle-advent-christmas-watercolor-9084626/",
        "url": "https://cdn.pixabay.com/photo/2024/09/30/03/58/candle-9084626_1280.jpg",
        "auteur": "geralt (Gerd Altmann, Pixabay)",
        "original": "bougie.jpg",
        "boite": (434, 34, 626, 432),   # hors des branches, qui débordent au bas du fût
        "fondu": 60,
    },
]


# =============================================================================================
# Téléchargement des originaux
# =============================================================================================
def telecharger() -> None:
    ORIGINAUX.mkdir(parents=True, exist_ok=True)
    deja = set()
    for item in MANIFESTE:
        if item["original"] in deja:
            continue
        deja.add(item["original"])
        dest = ORIGINAUX / item["original"]
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"déjà là : {dest.name}")
            continue
        # Le CDN de Pixabay refuse les requêtes sans Referer de la page d'origine.
        r = subprocess.run(["curl", "-sS", "--fail", "-m", "90", "-A", UA,
                            "-e", "https://pixabay.com/", "-o", str(dest), item["url"]],
                           capture_output=True, text=True)
        if r.returncode:
            print(f"ÉCHEC {item['nom']} : {r.stderr.strip()}")
        else:
            print(f"téléchargé : {dest.name} ({dest.stat().st_size} o)")


# =============================================================================================
# Détourage, recadrage, harmonisation
# =============================================================================================
def charger_sur_blanc(chemin: Path) -> np.ndarray:
    """Image aplatie sur fond blanc, en flottants de 0 à 1 (H, W, 3)."""
    im = Image.open(chemin).convert("RGBA")
    fond = Image.new("RGBA", im.size, (255, 255, 255, 255))
    return np.asarray(Image.alpha_composite(fond, im).convert("RGB")).astype(np.float32) / 255


def detourer(rgb: np.ndarray, plancher: float = PLANCHER_PAPIER) -> tuple[np.ndarray, np.ndarray]:
    """Le blanc devient la transmittance.

    L'encre d'un pixel est le déficit de son canal le plus clair. Elle donne l'alpha. La couleur
    est le pigment seul (le blanc retiré), de sorte qu'aplatie sur blanc on retrouve l'original.
    Posée ensuite par multiplication, l'aquarelle prend la teinte du papier, sans halo blanc.
    """
    encre = (1.0 - rgb).max(axis=2)
    k = (rgb - (1.0 - encre)[..., None]) / np.maximum(encre, 1e-6)[..., None]
    k = np.clip(k, 0.0, 1.0)
    a = np.clip((encre - plancher) / (1.0 - plancher), 0.0, 1.0)
    a[a < 0.02] = 0.0
    return k.astype(np.float32), a.astype(np.float32)


def rogner(k: np.ndarray, a: np.ndarray, boite, fondu: int) -> tuple[np.ndarray, np.ndarray]:
    if boite is not None:
        x0, y0, x1, y1 = boite
        k, a = k[y0:y1, x0:x1], a[y0:y1, x0:x1]
    else:
        ys, xs = np.where(a > 0.03)
        marge = 8
        x0, x1 = max(xs.min() - marge, 0), min(xs.max() + 1 + marge, a.shape[1])
        y0, y1 = max(ys.min() - marge, 0), min(ys.max() + 1 + marge, a.shape[0])
        k, a = k[y0:y1, x0:x1], a[y0:y1, x0:x1]
    if fondu:
        hauteur = a.shape[0]
        rampe = np.clip((hauteur - np.arange(hauteur)) / fondu, 0.0, 1.0).astype(np.float32)
        a = a * rampe[:, None]
    return k, a


def reduire(k: np.ndarray, a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Limite le plus grand côté à COTE_MAX. Réduit la prémultiplication, jamais agrandi."""
    h, w = a.shape
    echelle = min(1.0, COTE_MAX / max(h, w))
    if echelle >= 1.0:
        return k, a
    nw, nh = round(w * echelle), round(h * echelle)
    pm = Image.fromarray((k * a[..., None] * 255).round().astype(np.uint8))
    al = Image.fromarray((a * 255).round().astype(np.uint8))
    pm = np.asarray(pm.resize((nw, nh), Image.LANCZOS)).astype(np.float32) / 255
    al = np.asarray(al.resize((nw, nh), Image.LANCZOS)).astype(np.float32) / 255
    k2 = np.where(al[..., None] > 1e-3, pm / np.maximum(al, 1e-3)[..., None], 0.0)
    return np.clip(k2, 0.0, 1.0).astype(np.float32), al


def harmoniser(k: np.ndarray) -> np.ndarray:
    """Un peu moins saturé et un peu plus chaud, pour s'accorder au papier ancien crème."""
    lum = (k @ LUMINANCE)[..., None]
    k = lum + (k - lum) * DESATURATION
    return np.clip(k * TEINTE, 0.0, 1.0).astype(np.float32)


def traiter() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    catalogue = {}
    for item in MANIFESTE:
        src = ORIGINAUX / item["original"]
        if not src.exists():
            sys.exit(f"original absent : {src} (lancer `telecharger` d'abord)")
        rgb = charger_sur_blanc(src)
        k, a = detourer(rgb, item.get("plancher", PLANCHER_PAPIER))
        k, a = rogner(k, a, item["boite"], item.get("fondu", 0))
        k, a = reduire(k, a)
        k = harmoniser(k)
        rgba = np.concatenate([(k * 255).round(), (a[..., None] * 255).round()], axis=2)
        dest = SORTIE / f"{item['nom']}.png"
        Image.fromarray(rgba.astype(np.uint8)).save(dest, optimize=True)
        catalogue[item["nom"]] = {
            "sujet": item["sujet"],
            "source": item["page"],
            "auteur": item["auteur"],
            "licence": LICENCE,
            "fichier": dest.name,
        }
        print(f"{dest.name} : {a.shape[1]}x{a.shape[0]}, {dest.stat().st_size // 1024} Ko")
    CATALOGUE.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"catalogue : {CATALOGUE.relative_to(RACINE)} ({len(catalogue)} entrées)")


# =============================================================================================
# Planche de contrôle : multiplication sur du papier du carnet
# =============================================================================================
def planche() -> None:
    PLANCHE.parent.mkdir(parents=True, exist_ok=True)
    largeur, hauteur, cellule, cols = 1300, 1300, 420, 3
    base = Image.open(PAPIER).convert("RGB").crop((150, 200, 150 + largeur, 200 + hauteur))
    fond = np.asarray(base).astype(np.float32) / 255
    police = ImageFont.load_default(size=24)
    for i, item in enumerate(MANIFESTE):
        im = Image.open(SORTIE / f"{item['nom']}.png").convert("RGBA")
        im.thumbnail((360, 330), Image.LANCZOS)
        arr = np.asarray(im).astype(np.float32) / 255
        k, a = arr[..., :3], arr[..., 3]
        col, lig = i % cols, i // cols
        x0 = 20 + col * cellule + (cellule - 40 - im.width) // 2
        y0 = 20 + lig * (cellule + 10) + (330 - im.height) // 2
        zone = fond[y0:y0 + im.height, x0:x0 + im.width]
        fond[y0:y0 + im.height, x0:x0 + im.width] = zone * (1 - a[..., None] + a[..., None] * k)
    image_planche = Image.fromarray((np.clip(fond, 0, 1) * 255).astype(np.uint8))
    dessin = ImageDraw.Draw(image_planche)
    for i, item in enumerate(MANIFESTE):
        col, lig = i % cols, i // cols
        dessin.text((28 + col * cellule, 20 + lig * (cellule + 10) + 340), item["nom"],
                    fill=(70, 45, 30), font=police)
    image_planche.save(PLANCHE)
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
