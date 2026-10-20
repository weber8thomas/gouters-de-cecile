"""Glyphes manuscrits déterministes pour les recettes, dans le paginateur et l'encre existants.

La fonte Kalam du projet fournit les lettres exactes, accents et chiffres compris. Les mots gardent
leurs métriques et leur pose dans Mise ; seul leur masque remplace le tracé neuronal. Aucun service
ou paquet supplémentaire n'est requis : Pillow lit la fonte WOFF2 déjà présente dans le dépôt.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parents[2]
POLICES = {"kalam": "kalam-latin-400-normal.woff2"}
TAILLE = 384  # masque source net, y compris pour les tuiles de loupe ×4


@lru_cache(maxsize=4)
def fonte(nom: str):
    return ImageFont.truetype(str(RACINE / "design-system/fonts" / POLICES[nom]), TAILLE)


@lru_cache(maxsize=1024)
def masque(texte: str, nom: str):
    f = fonte(nom)
    boite = f.getbbox(texte, anchor="ls")
    x0, y0, x1, y1 = boite
    im = Image.new("L", (max(1, x1 - x0), max(1, y1 - y0)), 0)
    ImageDraw.Draw(im).text((-x0, -y0), texte, font=f, fill=255, anchor="ls")
    return im, boite


def ecrire_bloc(texte: str, main: str, nom: str, encre: str | None, outil: str | None):
    import ecriture as ECR
    f = fonte(nom)
    hx = float(-f.getbbox("x", anchor="ls")[1])
    info = ECR.main_info(main)
    lignes = []
    for ligne in texte.split("\n"):
        mots = []
        for t in re.findall(r"\S+", ligne):
            _, (x0, y0, x1, y1) = masque(t, nom)
            pts = np.array([[x0 / hx, y0 / hx, 1, 1, .95],
                            [x1 / hx, y0 / hx, 1, 1, .95],
                            [x1 / hx, y1 / hx, 1, 1, .95],
                            [x0 / hx, y1 / hx, 1, 1, .95]], float)
            avance = float(f.getlength(t)) / hx
            mot = ECR.Mot(t, [pts], avance, float(f.getlength(" ")) / hx,
                          debord_g=max(0., -x0 / hx), debord_d=max(0., x1 / hx - avance), important=True)
            mot.glyphe = {"texte": t, "police": nom, "hauteur_x": hx}
            mots.append(mot)
        lignes.append(mots)
    return ECR.Bloc(lignes, main, "police-" + nom, info["interligne"], info["taille"],
                    info["epaisseur"], ECR.nuances(encre or "bic", outil))


def rasteriser(glyphe: dict, echelle: float, origine=(0., 0.)):
    """Masque du mot tourné : (x, y, alpha), dans la fenêtre demandée par le rendu de l'encre."""
    im, (bx, by, _, _) = masque(glyphe["texte"], glyphe["police"])
    ca, sa = np.cos(glyphe["angle"]), np.sin(glyphe["angle"])
    sx, sy = glyphe["sx"] * echelle, glyphe["sy"] * echelle
    B = np.array([[ca * sx, -sa * sy], [sa * sx, ca * sy]])
    O = np.array([glyphe["x"] * echelle - origine[0], glyphe["y"] * echelle - origine[1]]) + B @ [bx, by]
    coins = np.array([[0, 0], [im.width, 0], [im.width, im.height], [0, im.height]]) @ B.T + O
    bas = np.floor(coins.min(0) - 2).astype(int)
    haut = np.ceil(coins.max(0) + 2).astype(int)
    inv = np.linalg.inv(B)
    decalage = inv @ (bas - O)
    coef = (inv[0, 0], inv[0, 1], decalage[0], inv[1, 0], inv[1, 1], decalage[1])
    out = im.transform(tuple((haut - bas).tolist()), Image.Transform.AFFINE, coef, Image.Resampling.BICUBIC)
    return int(bas[0]), int(bas[1]), np.asarray(out, np.float32) / 255.
