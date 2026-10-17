#!/usr/bin/env python3
"""Aquarelles du carnet (tour 3) : design-system/aquarelles/<nom>.png → design-system/baked/aquarelles/<nom>.webp.

    tools/ecriture/.venv/bin/python -I scripts/bake-aquarelles.py

Entrée : les aquarelles retenues (détourées, harmonisées vers le crème par scripts/aquarelles*.py), une par
entrée des catalogue-*.json (licence, source, auteur). Sortie : WebP avec transparence, 800 px au plus de
côté, que l'application pose par multiplication sur la page (src/components/Aquarelle). Déterministe.
"""
import json
from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parents[1]
SOURCE = RACINE / "design-system/aquarelles"
SORTIE = RACINE / "design-system/baked/aquarelles"
COTE_MAX = 800
# Zones effacées (gauche, haut, droite, bas, en fractions) : signature de planche restée sous le citron.
EFFACER = {"citron-2": [(0.0, 0.92, 0.3, 1.0)]}


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
        out = SORTIE / f"{nom}.webp"
        im.save(out, "WEBP", quality=88, method=6, exact=True)
        print(f"{nom:22s} {im.size[0]}×{im.size[1]}  {out.stat().st_size // 1024} Ko")
    for vieux in SORTIE.glob("*.webp"):
        if vieux.stem not in noms:
            vieux.unlink()
            print(f"retirée : {vieux.name}")


if __name__ == "__main__":
    main()
