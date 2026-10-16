"""Papier des pages cuites : découpes de vrais feuillets anciens scannés (domaine public,
design-system/sources/papier/), une image par FEUILLET du carnet.

Un feuillet porte deux pages : le recto (folio impair, page de droite d'une double page) et le
verso (folio pair suivant, page de gauche de la double page suivante). Le verso est la même image
retournée (miroir horizontal, `transform: scaleX(-1)` à l'affichage) : les rousseurs traversent la
feuille, le bord extérieur reste le même bord. Pendant un tourne-page, la feuille qui tourne montre
donc la même pâte des deux côtés, comme un vrai feuillet.

Une image = la découpe (échelle, position, rotation de 0 ou 180°) + une légère variation de teinte
(± 4 niveaux) + l'usure des bords en CADRE (pas une vignette ronde) : extérieur plus marqué, tête et
pied un peu, reliure à peine ; limite intérieure irrégulière. Cuite en WebP opaque à 2× (1700 × 1920).
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image

from rendu_encre import flou

SOURCES = None  # chemin, posé par cuire.py


def _bruit_basse(rng, h, w, echelle):
    """Bruit lisse ≈ N(0, 1) de longueur de corrélation `echelle` px."""
    gh, gw = int(h / echelle) + 3, int(w / echelle) + 3
    g = rng.normal(0, 1, (gh, gw)).astype(np.float32)
    im = Image.fromarray(g, mode="F").resize((w + 2 * int(echelle), h + 2 * int(echelle)), Image.BICUBIC)
    a = np.asarray(im)[int(echelle):int(echelle) + h, int(echelle):int(echelle) + w]
    return a / (a.std() + 1e-6)


def feuillet(cfg: dict, larg: int, haut: int, sources_dir) -> np.ndarray:
    """Image RGB uint8 du recto du feuillet (reliure à gauche, bord extérieur à droite)."""
    src = Image.open(sources_dir / f"{cfg['source']}.jpg").convert("RGB")
    e = float(cfg.get("echelle", 0.54))
    sw, sh = round(src.width * e), round(src.height * e)
    if sw < larg or sh < haut:
        e = max(larg / src.width, haut / src.height) * 1.001
        sw, sh = round(src.width * e), round(src.height * e)
    im = src.resize((sw, sh), Image.LANCZOS)
    if int(cfg.get("rotation", 0)) % 360 == 180:
        im = im.rotate(180)
    x = round(float(cfg.get("x", 0.5)) * (sw - larg))
    y = round(float(cfg.get("y", 0.5)) * (sh - haut))
    a = np.asarray(im.crop((x, y, x + larg, y + haut))).astype(np.float32)
    rng = np.random.default_rng(int(cfg.get("graine", 7)))
    # teinte : décalage par canal (niveaux) et luminosité
    a += np.array(cfg.get("teinte", [0, 0, 0]), np.float32)
    # usure des bords en cadre
    yy, xx = np.mgrid[0:haut, 0:larg].astype(np.float32)
    bords = cfg.get("bords", {})
    k_ext = float(bords.get("exterieur", 0.05))
    k_tete = float(bords.get("tete", 0.03))
    k_pied = float(bords.get("pied", 0.035))
    k_rel = float(bords.get("reliure", 0.012))
    n1 = _bruit_basse(rng, haut, larg, 90.0)
    n2 = _bruit_basse(rng, haut, larg, 22.0)
    irr = 0.75 * n1 + 0.35 * n2

    def bande(dist, largeur, k):
        d = dist + irr * largeur * 0.45
        return k * np.clip(1 - d / largeur, 0, 1) ** 1.6

    usure = (bande(larg - 1 - xx, 0.045 * larg, k_ext) + bande(yy, 0.028 * haut, k_tete)
             + bande(haut - 1 - yy, 0.03 * haut, k_pied) + bande(xx, 0.012 * larg, k_rel))
    usure = np.clip(usure, 0, 0.12)
    # bruni : la luminance baisse, le bleu un peu plus (jaunit)
    a *= (1 - usure[..., None] * np.array([0.85, 1.0, 1.45], np.float32))
    # marbrure très lente propre au feuillet (deux feuillets voisins ne se ressemblent pas)
    m = _bruit_basse(rng, haut, larg, 420.0) * float(cfg.get("marbrure", 1.6))
    a += m[..., None] * np.array([1.0, 1.0, 1.25], np.float32)
    return np.clip(np.round(a), 0, 255).astype(np.uint8)


def grain_bruit(papier_u8: np.ndarray, rel: np.ndarray, rng) -> np.ndarray:
    """Déplacement du bord des traits (px à 2×) : l'encre file dans les creux du papier."""
    fin = flou(rng.normal(0, 1, rel.shape).astype(np.float32), 0.8)
    fin /= fin.std() + 1e-6
    return np.clip(-0.28 * rel + 0.14 * fin, -0.8, 0.8).astype(np.float32)
