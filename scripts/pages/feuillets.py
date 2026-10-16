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


# =============================================================================================
# Feuillet volant : une feuille de cahier à petits carreaux glissée dans le carnet
# =============================================================================================
# Références (design-system/docs/references-carnets.md § 2.4, réf. 18 « quadrillé 5 mm », 05, 07) :
# la réglure imprimée ne garde jamais son bleu franc (gris-mauve pâle, 5 à 20 niveaux sous le
# papier), la marge rouge vire au saumon ; la réglure est un peu de travers et décalée par rapport à
# la feuille (impression), pâlie par endroits ; l'écriture la suit (une ligne tous les deux carreaux).
# Le papier est plus clair et plus lisse que celui du carnet (feuille plus récente), un peu jauni
# aux bords ; on voit par transparence la réglure du dos (l'autre face, en miroir).

def grille_cahier(cfg: dict, larg: float, haut: float, face: str = "recto") -> dict:
    """Géométrie de la réglure d'une face (px de la page, y vers le bas) — partagée par le papier
    (cuit à l'échelle 2) et la mise en page (l'écriture se pose sur les traits)."""
    c = float(cfg.get("carreau", 23.0))
    rng = np.random.default_rng(int(cfg.get("graine", 3)) + (0 if face == "recto" else 17))
    ang = float(cfg.get("angle", 0.3)) + (0.0 if face == "recto" else float(rng.normal(0, 0.12)))
    return dict(
        carreau=c,
        angle=ang,  # degrés, la réglure tourne autour du centre de la face
        xc=larg / 2, yc=haut / 2,
        x0=larg / 2 + float(cfg.get("phase", [0.37, 0.61])[0] + rng.uniform(-0.2, 0.2)) * c,
        y0=haut / 2 + float(cfg.get("phase", [0.37, 0.61])[1] + rng.uniform(-0.2, 0.2)) * c,
        marge_x=float(cfg.get("marge", 0.115)) * larg + float(rng.normal(0, 0.004)) * larg,
    )


def _traits_reguliers(u: np.ndarray, pas: float, demi: float) -> np.ndarray:
    """Couverture (0–1) de traits parallèles de demi-largeur `demi` px tous les `pas` px (anticrénelée)."""
    d = np.abs(((u / pas) + 0.5) % 1.0 - 0.5) * pas
    return np.clip(demi + 0.5 - d, 0, 1)


def _reglure(g: dict, larg: int, haut: int, echelle: float, rng, force: float = 1.0):
    """Transmittance (h, w, 3) de la réglure imprimée d'une face (petits carreaux + marge)."""
    yy, xx = np.mgrid[0:haut, 0:larg].astype(np.float32)
    X, Y = xx / echelle, yy / echelle  # px de page
    a = math.radians(g["angle"])
    ca, sa = math.cos(a), math.sin(a)
    # repère de la réglure (tournée autour du centre)
    dx, dy = X - g["xc"], Y - g["yc"]
    u = dx * ca + dy * sa  # le long des lignes
    v = -dx * sa + dy * ca  # perpendiculaire
    c = g["carreau"]
    # léger tremblé d'impression (rouleau) : les traits ondulent de ± 0,15 px
    ond = 0.15 * np.sin(u / 37.0 + 1.3) + 0.1 * np.sin(v / 53.0)
    oy = g["y0"] - g["yc"]
    ox = g["x0"] - g["xc"]
    demi = 0.36 * echelle  # trait de ≈ 0,7 px de page
    hor = _traits_reguliers(v - oy + ond, c, demi)
    ver = _traits_reguliers(u - ox + ond, c, demi)
    lignes = np.maximum(hor, ver)
    # encre d'impression inégale : pâlie par plages, plus faible dans le sens du papier
    pale = np.clip(0.78 + 0.2 * _bruit_basse(rng, haut, larg, 260.0) + 0.06 * _bruit_basse(rng, haut, larg, 30.0), 0.45, 1.0)
    cov = lignes * pale * force
    # gris-mauve pâle : ≈ 9 à 12 niveaux sous le papier (#e2e1cf sur #eee9d6), plus bleu que lui
    t_ligne = np.array([0.905, 0.915, 0.94], np.float32)
    T = 1 - cov[..., None] * (1 - t_ligne)
    # marge : un filet saumon un peu plus gras, parallèle aux verticales
    xm = g["marge_x"] - g["xc"]
    dm = np.abs(u - xm + 0.2 * np.sin(v / 41.0))
    marge = np.clip(0.62 * echelle + 0.5 - dm, 0, 1) * np.clip(pale + 0.1, 0, 1) * force
    t_marge = np.array([0.95, 0.80, 0.74], np.float32)
    T = T * (1 - marge[..., None] * (1 - t_marge))
    return T.astype(np.float32)


def cahier(cfg: dict, larg: int, haut: int, sources_dir, face: str = "recto", echelle: float = 2.0) -> np.ndarray:
    """Image RGB uint8 d'une face du feuillet de cahier (petits carreaux, marge à gauche sur les
    deux faces, comme une vraie feuille). La pâte est la même des deux côtés (le verso est son
    miroir), chaque face a sa propre impression, et la réglure du dos se devine par transparence."""
    base_cfg = dict(cfg, bords=cfg.get("bords", {"exterieur": 0.03, "tete": 0.025, "pied": 0.03, "reliure": 0.02}),
                    marbrure=cfg.get("marbrure", 0.9))
    a = feuillet(base_cfg, larg, haut, sources_dir).astype(np.float32)
    if face != "recto":
        a = a[:, ::-1]
    # feuille plus récente que le carnet : plus claire, moins jaune, grain adouci
    lum = a.mean(axis=2, keepdims=True)
    lisse = flou(a, 1.2)
    a = lisse + (a - lisse) * float(cfg.get("grain", 0.55))
    cible = np.array(cfg.get("ton", [242, 236, 219]), np.float32)
    moy = a.reshape(-1, 3).mean(0)
    a = a + (cible - moy) * 0.85
    del lum
    rng = np.random.default_rng(int(cfg.get("graine", 3)) + (101 if face == "recto" else 202))
    g_face = grille_cahier(cfg, larg / echelle, haut / echelle, face)
    autre = "verso" if face == "recto" else "recto"
    g_dos = grille_cahier(cfg, larg / echelle, haut / echelle, autre)
    T = _reglure(g_face, larg, haut, echelle, rng, 1.0)
    # la réglure du dos, en miroir, vue à travers la feuille (très pâle, floue)
    T_dos = _reglure(g_dos, larg, haut, echelle, rng, float(cfg.get("transparence_reglure", 0.22)))[:, ::-1]
    T_dos = 1 - flou(1 - T_dos, 1.6)
    a = a * T * T_dos
    # pli : la feuille a été pliée en deux pour tenir dans le carnet, puis aplatie
    if cfg.get("pli", True):
        yy = np.arange(haut, dtype=np.float32)[:, None]
        xx = np.arange(larg, dtype=np.float32)[None, :]
        yp = haut * float(cfg.get("pli_y", 0.52)) + (xx - larg / 2) * math.tan(math.radians(float(cfg.get("pli_angle", -0.6))))
        d = yy - yp
        ombre = np.exp(-((d - 1.6 * echelle) / (1.3 * echelle)) ** 2) * 9.0
        lumiere = np.exp(-((d + 1.0 * echelle) / (1.1 * echelle)) ** 2) * 5.0
        vari = np.clip(0.75 + 0.25 * _bruit_basse(rng, haut, larg, 180.0), 0.3, 1.2)
        a = a - (ombre * vari)[..., None] + (lumiere * vari)[..., None]
    return np.clip(np.round(a), 0, 255).astype(np.uint8)
