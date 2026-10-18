"""Planche de revue (travail) : chaque variante en grand (feutre, bic, crayon) et en icônes.

    tools/ecriture/.venv/bin/python scripts/croquis/revue.py [noms…] [--sortie f.png] [--graine 3]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RACINE / "scripts/pages"))
import croquis as C  # noqa: E402

ENCRES = ["feutre", "bic", "crayon"]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("noms", nargs="*")
    ap.add_argument("--sortie", default=str(RACINE / "verification/out/c/essais/revue.png"))
    ap.add_argument("--graine", type=int, default=3)
    ap.add_argument("--grand", type=float, default=150)
    a = ap.parse_args(argv)
    noms = a.noms or C.disponibles()
    lignes = [(n, v) for n in noms for v in C.variantes(n)]
    E = 2
    G = a.grand
    col_w = G + 40
    Wp = int(3 * col_w + 4 * 46 + 40)
    Hl = G + 30
    Hp = int(len(lignes) * Hl + 40)
    P = C.papier(Wp * E, Hp * E, y=0.1)
    els = []
    for r, (nom, v) in enumerate(lignes):
        y0 = 30 + r * Hl
        for k, enc in enumerate(ENCRES):
            els.append(C.dessiner(nom, boite=(20 + k * col_w, y0, G, G), encre=enc, graine=a.graine + k, variante=v))
        for j in range(4):
            enc = ENCRES[j % 3]
            els.append(C.dessiner(nom, boite=(20 + 3 * col_w + j * 46, y0 + G / 2 - 17, 34, 34), encre=enc,
                                  graine=a.graine + 10 + j, variante=v))
    img = Image.fromarray(C.rendre(els, P, E))
    dr = ImageDraw.Draw(img)
    try:
        fnt = ImageFont.truetype("DejaVuSans.ttf", 22)
    except OSError:
        fnt = ImageFont.load_default()
    for r, (nom, v) in enumerate(lignes):
        dr.text((8, (14 + r * Hl) * E), f"{nom}/{v}", fill=(120, 40, 30), font=fnt)
    Path(a.sortie).parent.mkdir(parents=True, exist_ok=True)
    img.save(a.sortie)
    print(a.sortie, img.size)


if __name__ == "__main__":
    main()
