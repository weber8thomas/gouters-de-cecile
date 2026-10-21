#!/usr/bin/env python3
"""Aquarelles du carnet (tour 3) : design-system/aquarelles/<nom>.png → design-system/baked/aquarelles/<nom>.webp.

    tools/ecriture/.venv/bin/python -I scripts/bake-aquarelles.py

Entrée : les aquarelles retenues (détourées, harmonisées vers le crème par scripts/aquarelles*.py), une par
entrée des catalogue-*.json (licence, source, auteur). Sortie : WebP avec transparence, 800 px au plus de
côté, que l'application pose simplement sur la page (src/components/Aquarelle). Déterministe.
Les pigments gardent leur saturation d'origine, puis sont légèrement teintés du papier (PAPIER) ; l'alpha
ne bouge pas. Posée sur le papier, l'aquarelle teintée donne la même couleur qu'une multiplication avec
lui (a·c·P + (1 − a)·P) : pas de mode de fusion à l'écran, un calque de moins à composer.
"""
import json
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

RACINE = Path(__file__).resolve().parents[1]
SOURCE = RACINE / "design-system/aquarelles"
SORTIE = RACINE / "design-system/baked/aquarelles"
COTE_MAX = 800
# Les originaux de la série anglaise portent déjà leur palette commune : ne pas la saturer au build.
# Un pixel proche du bord de la gamme RGB est moins saturé plutôt qu'écrêté : pas de couleur plate ni de saut.
SATURATION = 1.0
LUMINANCE = np.array([0.299, 0.587, 0.114])  # luminance Rec. 601 (comme PIL « L »)
# Couleur moyenne des papiers du carnet (design-system/baked/pages/papier, mesurée) : la teinte du pigment
# posé sur la page. scripts/bake-trace-aquarelles.py la retire avant de chercher les traits.
PAPIER = np.array([0.960, 0.940, 0.880])


def teinter(im: Image.Image) -> Image.Image:
    """Renvoie l'image RGBA dont la couleur est multipliée par PAPIER, alpha inchangé."""
    rgba = np.asarray(im, dtype=float)
    rgb = np.clip(np.round(rgba[..., :3] * PAPIER), 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, rgba[..., 3].astype(np.uint8)]), "RGBA")


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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', help='Noms logiques séparés par des virgules ; défaut : tout cuire')
    args = parser.parse_args()
    selection = set(args.only.split(',')) if args.only else None
    SORTIE.mkdir(parents=True, exist_ok=True)
    noms = {}
    for cat in sorted(SOURCE.glob("catalogue-*.json")):
        for nom, e in json.loads(cat.read_text()).items():
            f = SOURCE / e.get("fichier", f"{nom}.png")
            if f.exists():
                noms[nom] = (f, int(e.get('cote_max', COTE_MAX)), int(e.get('qualite', 88)))
    for nom, (f, cote_max, qualite) in sorted(noms.items()):
        if selection is not None and nom not in selection:
            continue
        im = Image.open(f).convert("RGBA")
        im.thumbnail((cote_max, cote_max), Image.LANCZOS)
        im = teinter(saturer(im))
        out = SORTIE / f"{nom}.webp"
        out.parent.mkdir(parents=True, exist_ok=True)
        im.save(out, "WEBP", quality=qualite, method=6, exact=True)
        print(f"{nom:22s} {im.size[0]}×{im.size[1]}  {out.stat().st_size // 1024} Ko")
    for vieux in ([] if selection is not None else SORTIE.glob("*.webp")):
        if vieux.stem not in noms:
            vieux.unlink()
            print(f"retirée : {vieux.name}")


if __name__ == "__main__":
    main()
