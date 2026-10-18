#!/usr/bin/env python3
"""Aquarelles du carnet (tour 3) : design-system/aquarelles/<nom>.png → design-system/baked/aquarelles/<nom>.webp.

    tools/ecriture/.venv/bin/python -I scripts/bake-aquarelles.py

Entrée : les aquarelles retenues (détourées, harmonisées vers le crème par scripts/aquarelles*.py), une par
entrée des catalogue-*.json (licence, source, auteur). Sortie : WebP avec transparence, 800 px au plus de
côté, que l'application pose par multiplication sur la page (src/components/Aquarelle). Déterministe.
Les couleurs sont saturées (SATURATION) avant écriture ; l'alpha ne bouge pas.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

RACINE = Path(__file__).resolve().parents[1]
SOURCE = RACINE / "design-system/aquarelles"
SORTIE = RACINE / "design-system/baked/aquarelles"
COTE_MAX = 800
# Zones effacées (gauche, haut, droite, bas, en fractions) : signature de planche restée sous le citron.
EFFACER = {"citron-2": [(0.0, 0.92, 0.3, 1.0)]}
# Saturation des couleurs ×1,25 : chaque couleur s'écarte de sa luminance (la teinte et la luminance restent).
# Un pixel proche du bord de la gamme RGB est moins saturé plutôt qu'écrêté : pas de couleur plate ni de saut.
SATURATION = 1.25
LUMINANCE = np.array([0.299, 0.587, 0.114])  # luminance Rec. 601 (comme PIL « L »)


def saturer(im: Image.Image) -> Image.Image:
    """Renvoie l'image RGBA avec les couleurs saturées de SATURATION, alpha inchangé."""
    rgba = np.asarray(im, dtype=float)
    rgb = rgba[..., :3]
    lum = (rgb @ LUMINANCE)[..., None]
    ecart = rgb - lum  # écart à la luminance, par canal
    with np.errstate(divide="ignore", invalid="ignore"):
        # facteur maximal avant qu'un canal sorte de [0, 255] (le facteur ne descend jamais sous 1)
        haut = np.where(ecart > 0, (255 - lum) / ecart, np.inf)
        bas = np.where(ecart < 0, -lum / ecart, np.inf)
    facteur = np.minimum(SATURATION, np.minimum(haut.min(axis=-1), bas.min(axis=-1)))[..., None]
    facteur = np.maximum(facteur, 1.0)
    neuf = np.clip(np.round(lum + facteur * ecart), 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([neuf, rgba[..., 3].astype(np.uint8)]), "RGBA")


def main() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    noms = {}
    for cat in sorted(SOURCE.glob("catalogue-*.json")):
        for nom, e in json.loads(cat.read_text()).items():
            f = SOURCE / e.get("fichier", f"{nom}.png")
            if f.exists():
                noms[nom] = f
    for nom, f in sorted(noms.items()):
        im = Image.open(f).convert("RGBA")
        for g, h, d, b in EFFACER.get(nom, []):
            im.paste((0, 0, 0, 0), (round(g * im.width), round(h * im.height), round(d * im.width), round(b * im.height)))
        im.thumbnail((COTE_MAX, COTE_MAX), Image.LANCZOS)
        im = saturer(im)
        out = SORTIE / f"{nom}.webp"
        im.save(out, "WEBP", quality=88, method=6, exact=True)
        print(f"{nom:22s} {im.size[0]}×{im.size[1]}  {out.stat().st_size // 1024} Ko")
    for vieux in SORTIE.glob("*.webp"):
        if vieux.stem not in noms:
            vieux.unlink()
            print(f"retirée : {vieux.name}")


if __name__ == "__main__":
    main()
