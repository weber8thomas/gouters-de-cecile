"""Croquis « maison » : ce que Quick, Draw! n'a pas (œuf, citron, farine, sucre, huile, beurre, noix,
vanille, cannelle, muscade, fouet, moule à cake, cupcake, part de carrot cake, lunettes de soleil,
sachet de levure), dessinés à main levée au même format que les dessins retenus de Quick, Draw!
(traits [[x, y, t], …], plus grand côté = 1, t en secondes).

Chaque croquis est écrit à la main, trait par trait, comme le ferait quelqu'un qui griffonne vite
dans son carnet : peu de traits, contours ouverts ou qui se chevauchent, coins qui débordent un
peu, rien de symétrique. Les points de contrôle reçoivent ensuite une imperfection tirée par la
graine (léger flottement, boucles qui ne se referment pas exactement) et un temps de tracé
(lent au départ et dans les virages, vif dans les lignes droites).

    tools/ecriture/.venv/bin/python scripts/croquis/maison.py [noms…]   # → design-system/croquis/<nom>/<v>.json
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parents[2]
CROQUIS = RACINE / "design-system/croquis"


# =============================================================================================
# Main levée
# =============================================================================================
class Main:
    def __init__(self, graine: int, flottement: float = 0.008):
        self.rng = np.random.default_rng(graine)
        self.fl = flottement
        self.coins = 0.0  # > 0 : objets anguleux, les coins restent des coins (rayon ≈ coins)

    def _bouger(self, P, k=1.0):
        P = np.asarray(P, float)
        return P + self.rng.normal(0, self.fl * k, P.shape)

    def ligne(self, *pts, k=1.0, coins=None):
        """Polyligne par des points de contrôle. Avec `coins` (> 0), des points sont ajoutés près de
        chaque sommet : le lissage arrondit à peine le coin au lieu de gonfler les côtés."""
        P = self._bouger(pts, k)
        r = self.coins if coins is None else coins
        if r <= 0 or len(P) < 3:
            return P
        out = [P[0]]
        for i in range(len(P) - 1):
            a, b = P[i], P[i + 1]
            L = float(np.hypot(*(b - a)))
            f = min(r * self.rng.uniform(0.7, 1.3), 0.3 * L) / max(L, 1e-9)
            if i > 0:
                out.append(a + (b - a) * f)
            if i < len(P) - 2:
                out.append(b - (b - a) * f)
            out.append(b)
        return np.asarray(out)

    def boucle(self, cx, cy, rx, ry, depart=-100.0, tour=1.07, n=14, rot=0.0, irr=0.035, sens=1,
               pointe=None):
        """Boucle ovale à main levée : départ à `depart` degrés, `tour` tours (> 1 : chevauche,
        < 1 : reste ouverte), rayon qui flotte, légère spirale. `pointe` : (angle, force) pour un
        bout pointu (citron, œuf)."""
        m = max(6, int(n * tour))
        th = np.radians(depart) + sens * np.linspace(0, 2 * math.pi * tour, m)
        harm = sum(self.rng.normal(0, irr / (j + 1)) * np.cos((j + 2) * th + self.rng.uniform(0, 6.3)) for j in range(3))
        spir = np.linspace(0, self.rng.normal(0, 0.04), m)
        r = 1 + harm + spir
        if pointe is not None:
            a, f = pointe
            d = np.angle(np.exp(1j * (th - np.radians(a))))
            r = r + f * np.exp(-(d / 0.42) ** 2)
        x = rx * r * np.cos(th)
        y = ry * r * np.sin(th)
        ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        P = np.column_stack([cx + x * ca - y * sa, cy + x * sa + y * ca])
        return self._bouger(P, 0.5)

    def arc(self, cx, cy, rx, ry, a0, a1, n=8, rot=0.0):
        th = np.radians(np.linspace(a0, a1, n))
        x, y = rx * np.cos(th), ry * np.sin(th)
        ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        return self._bouger(np.column_stack([cx + x * ca - y * sa, cy + x * sa + y * ca]), 0.6)

    def festons(self, x0, y0, x1, y1, n, hauteur, vers=-1, pts=4):
        """Ligne de petites bosses (glaçage, nuage) de (x0, y0) à (x1, y1)."""
        out = []
        for i in range(n):
            a = np.array([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n])
            b = np.array([x0 + (x1 - x0) * (i + 1) / n, y0 + (y1 - y0) * (i + 1) / n])
            h = hauteur * self.rng.uniform(0.75, 1.25)
            for j in range(pts):
                t = j / pts
                p = a + (b - a) * t
                p = p + np.array([0, vers * h * math.sin(math.pi * t)])
                out.append(p)
        out.append(np.array([x1, y1]))
        return self._bouger(out, 0.5)

    def point(self, x, y, r=0.012):
        """Petit point / tiret (pépite, graine)."""
        a = self.rng.uniform(0, math.pi)
        return self._bouger([[x - r * math.cos(a), y - r * math.sin(a)], [x + r * math.cos(a), y + r * math.sin(a)]], 0.2)


def temps(traits, rng, vitesse=1.1):
    """Ajoute le temps de tracé (s) : lent au départ, aux virages et à l'arrivée."""
    out = []
    t0 = 0.0
    for P in traits:
        P = np.asarray(P, float)
        if len(P) == 1:
            out.append(np.column_stack([P, [t0]]))
            t0 += 0.25
            continue
        d = np.hypot(*np.diff(P, axis=0).T)
        v = np.full(len(d), vitesse) * rng.uniform(0.8, 1.2)
        if len(P) > 2:
            u = np.diff(P, axis=0)
            u /= np.maximum(np.hypot(*u.T)[:, None], 1e-9)
            cos = np.r_[1.0, np.sum(u[1:] * u[:-1], axis=1)]
            v *= 0.45 + 0.55 * np.clip(cos, 0, 1)
        n = len(d)
        prof = 0.5 + 0.5 * np.sin(np.pi * (np.arange(n) + 0.5) / n) ** 0.6
        v = np.maximum(v * prof, 0.08)
        t = np.r_[t0, t0 + np.cumsum(d / v)]
        out.append(np.column_stack([P, t]))
        t0 = float(t[-1]) + rng.uniform(0.15, 0.45)
    return out


def normaliser(traits):
    A = np.vstack([T[:, :2] for T in traits])
    x0, y0 = A[:, 0].min(), A[:, 1].min()
    cote = max(np.ptp(A[:, 0]), np.ptp(A[:, 1]))
    out = []
    for T in traits:
        T = T.copy()
        T[:, 0] = (T[:, 0] - x0) / cote
        T[:, 1] = (T[:, 1] - y0) / cote
        out.append(T)
    return out, (x0, y0, cote)


def _norm_pts(pts, ref):
    x0, y0, cote = ref
    return [[round((x - x0) / cote, 4), round((y - y0) / cote, 4)] for x, y in pts]


# =============================================================================================
# Les croquis (coordonnées dans un carré ≈ [0, 1], y vers le bas)
# =============================================================================================
def cupcake(m: Main, v: str):
    m.coins = 0.025
    if v == "a":  # caissette plissée, dôme de glaçage en festons, cerise
        caisse = m.ligne([0.2, 0.57], [0.25, 0.75], [0.29, 0.95], [0.5, 0.965], [0.71, 0.95], [0.76, 0.74], [0.8, 0.56])
        plis = [m.ligne([0.37, 0.62], [0.39, 0.93]), m.ligne([0.52, 0.63], [0.52, 0.94]), m.ligne([0.66, 0.62], [0.63, 0.92])]
        dome = np.vstack([m.festons(0.13, 0.6, 0.27, 0.36, 2, 0.05, vers=-1),
                          m.festons(0.27, 0.36, 0.71, 0.33, 3, 0.07, vers=-1)[1:],
                          m.festons(0.71, 0.33, 0.87, 0.6, 2, 0.05, vers=-1)[1:]])
        base = m.festons(0.11, 0.6, 0.89, 0.58, 5, 0.035, vers=1)
        cerise = m.boucle(0.5, 0.19, 0.075, 0.07, depart=200, tour=1.08, n=12)
        queue = m.ligne([0.53, 0.13], [0.57, 0.06], [0.64, 0.02])
        traits = [caisse, *plis, dome, base, cerise, queue]
        lavis = [{"teinte": "rose", "traits": [4, 5], "mode": "remplir"},
                 {"teinte": "bleu", "traits": [0, 5], "mode": "remplir", "couverture": 0.6, "densite": 0.9},
                 {"teinte": "cerise", "traits": [6], "mode": "remplir", "couverture": 0.85, "reflet": False}]
        return traits, lavis, "tous"
    if v == "b":  # glaçage en tortillon (aller-retour qui rétrécit), vermicelles
        caisse = m.ligne([0.22, 0.62], [0.3, 0.96], [0.7, 0.96], [0.78, 0.62])
        plis = [m.ligne([0.4, 0.66], [0.42, 0.93]), m.ligne([0.59, 0.66], [0.58, 0.93])]
        m.coins = 0.0
        tortillon = m.ligne([0.2, 0.62], [0.12, 0.58], [0.13, 0.5], [0.24, 0.46], [0.5, 0.47], [0.78, 0.45], [0.88, 0.5],
                            [0.86, 0.58], [0.78, 0.63], [0.5, 0.65], [0.2, 0.63])
        etage = m.ligne([0.24, 0.46], [0.2, 0.39], [0.28, 0.32], [0.5, 0.31], [0.7, 0.3], [0.79, 0.36], [0.76, 0.45])
        pointe = m.ligne([0.3, 0.32], [0.34, 0.24], [0.46, 0.18], [0.56, 0.1], [0.58, 0.04], [0.63, 0.12], [0.68, 0.22], [0.7, 0.3])
        verm = [m.point(0.32, 0.54, 0.02), m.point(0.6, 0.39, 0.02), m.point(0.68, 0.55, 0.018), m.point(0.47, 0.24, 0.016)]
        traits = [caisse, *plis, tortillon, etage, pointe, *verm]
        lavis = [{"teinte": "rose", "traits": [3, 4, 5], "mode": "remplir"},
                 {"teinte": "miel", "traits": [0], "mode": "remplir", "couverture": 0.6, "densite": 0.85, "reflet": False}]
        return traits, lavis, "dessin"
    # c : icône simple (caissette, dôme, cerise)
    caisse = m.ligne([0.22, 0.56], [0.3, 0.95], [0.7, 0.95], [0.78, 0.55])
    pli = m.ligne([0.5, 0.62], [0.5, 0.92])
    dome = m.ligne([0.14, 0.58], [0.16, 0.44], [0.3, 0.33], [0.5, 0.29], [0.7, 0.33], [0.84, 0.44], [0.86, 0.58], [0.5, 0.62], [0.12, 0.58])
    cerise = m.boucle(0.52, 0.19, 0.08, 0.075, depart=210, tour=1.06, n=10)
    traits = [caisse, pli, dome, cerise]
    lavis = [{"teinte": "rose", "traits": [2], "mode": "remplir", "couverture": 0.8},
             {"teinte": "cerise", "traits": [3], "mode": "remplir", "couverture": 0.9, "reflet": False}]
    return traits, lavis, "icone"


def lunettes_soleil(m: Main, v: str):
    m.coins = 0.025
    if v == "a":  # wayfarer : deux verres trapézoïdaux, pont, branches
        g = m.ligne([0.05, 0.38], [0.44, 0.36], [0.43, 0.5], [0.38, 0.64], [0.24, 0.68], [0.12, 0.64], [0.06, 0.5], [0.05, 0.37])
        d = m.ligne([0.56, 0.36], [0.95, 0.37], [0.94, 0.5], [0.88, 0.64], [0.76, 0.68], [0.62, 0.64], [0.57, 0.5], [0.56, 0.36])
        pont = m.ligne([0.44, 0.42], [0.5, 0.39], [0.56, 0.42])
        bg = m.ligne([0.05, 0.38], [0.0, 0.33])
        bd = m.ligne([0.95, 0.37], [1.0, 0.31])
        traits = [g, d, pont, bg, bd]
        lavis = [{"teinte": "verre-fume", "traits": [0], "mode": "remplir", "couverture": 0.8, "densite": 1.5},
                 {"teinte": "verre-fume", "traits": [1], "mode": "remplir", "couverture": 0.8, "densite": 1.5}]
        return traits, lavis, "tous"
    # b : rondes
    g = m.boucle(0.25, 0.5, 0.19, 0.17, depart=-150, tour=1.05, n=14)
    d = m.boucle(0.75, 0.5, 0.19, 0.17, depart=-30, tour=1.06, n=14, sens=-1)
    pont = m.ligne([0.43, 0.46], [0.5, 0.41], [0.57, 0.46])
    bg = m.ligne([0.07, 0.45], [0.0, 0.4])
    bd = m.ligne([0.93, 0.45], [1.0, 0.4])
    traits = [g, d, pont, bg, bd]
    lavis = [{"teinte": "verre-fume", "traits": [0], "mode": "remplir", "couverture": 0.78, "densite": 1.45},
             {"teinte": "verre-fume", "traits": [1], "mode": "remplir", "couverture": 0.78, "densite": 1.45}]
    return traits, lavis, "tous"


def oeuf(m: Main, v: str):
    if v == "a":
        o = m.boucle(0.5, 0.52, 0.3, 0.4, depart=-80, tour=1.06, n=16, pointe=(-90, 0.1))
        sol = m.ligne([0.3, 0.97], [0.55, 0.985], [0.82, 0.95])
        traits = [o, sol]
        lavis = [{"teinte": "oeuf", "traits": [0], "mode": "remplir", "couverture": 0.7}]
        return traits, lavis, "tous"
    # b : deux œufs, celui de derrière caché en partie
    o1 = m.boucle(0.36, 0.56, 0.24, 0.32, depart=-70, tour=1.05, n=14, pointe=(-90, 0.1), rot=-8)
    o2 = m.arc(0.7, 0.48, 0.24, 0.33, -150, 115, n=12, rot=10)
    traits = [o1, o2]
    lavis = [{"teinte": "oeuf", "traits": [0], "mode": "remplir", "couverture": 0.7},
             {"teinte": "oeuf", "mode": "tache", "centre": [0.74, 0.5], "rayon": [0.15, 0.24], "couverture": 0.7, "densite": 1.15}]
    return traits, lavis, "tous"


def citron(m: Main, v: str):
    if v == "a":  # citron entier et sa feuille
        c = m.ligne([0.08, 0.6], [0.14, 0.47], [0.3, 0.33], [0.52, 0.29], [0.72, 0.33], [0.86, 0.42], [0.95, 0.43],
                    [0.9, 0.5], [0.84, 0.64], [0.66, 0.77], [0.42, 0.79], [0.22, 0.74], [0.1, 0.65], [0.04, 0.62], [0.09, 0.57])
        f = m.ligne([0.78, 0.36], [0.8, 0.22], [0.9, 0.12], [0.98, 0.1], [0.97, 0.2], [0.9, 0.3], [0.8, 0.36])
        nerv = m.ligne([0.81, 0.33], [0.92, 0.17])
        traits = [c, f, nerv]
        lavis = [{"teinte": "citron", "traits": [0], "mode": "remplir"},
                 {"teinte": "feuille", "traits": [1], "mode": "remplir", "couverture": 0.85, "reflet": False}]
        return traits, lavis, "tous"
    # b : demi-citron en tranche
    ext = m.boucle(0.5, 0.5, 0.42, 0.4, depart=-120, tour=1.04, n=16)
    inter = m.boucle(0.5, 0.5, 0.33, 0.31, depart=60, tour=0.97, n=14)
    rayons = [m.ligne([0.5, 0.5], [0.5 + 0.3 * math.cos(a), 0.5 + 0.28 * math.sin(a)]) for a in np.radians([-80, -10, 60, 130, 200])]
    traits = [ext, inter, *rayons]
    lavis = [{"teinte": "citron", "traits": [0], "mode": "remplir", "couverture": 0.75},
             {"teinte": "citron", "traits": [1], "mode": "remplir", "couverture": 0.55, "densite": 0.7}]
    return traits, lavis, "dessin"


def farine(m: Main, v: str):
    m.coins = 0.035
    if v == "a":  # sachet en papier, haut replié en dents, étiquette, épi
        sac = m.ligne([0.24, 0.2], [0.2, 0.6], [0.19, 0.95], [0.5, 0.97], [0.81, 0.95], [0.8, 0.55], [0.77, 0.19])
        haut = m.ligne([0.22, 0.2], [0.3, 0.12], [0.37, 0.2], [0.45, 0.11], [0.52, 0.19], [0.6, 0.11], [0.68, 0.19], [0.75, 0.12], [0.79, 0.2])
        etiq = m.ligne([0.3, 0.45], [0.7, 0.44], [0.69, 0.76], [0.31, 0.77], [0.3, 0.44])
        m.coins = 0.0
        epi = m.ligne([0.5, 0.73], [0.5, 0.62], [0.51, 0.5])
        grains = [m.boucle(0.455, 0.6, 0.028, 0.045, rot=-35, tour=1.0, n=8), m.boucle(0.545, 0.58, 0.028, 0.045, rot=35, tour=1.0, n=8),
                  m.boucle(0.505, 0.5, 0.026, 0.045, tour=1.0, n=8)]
        traits = [sac, haut, etiq, epi, *grains]
        lavis = [{"teinte": "bleu", "traits": [2], "mode": "remplir", "couverture": 0.8},
                 {"teinte": "miel", "traits": [4, 5, 6], "mode": "remplir", "couverture": 0.9, "reflet": False, "decalage": 0.6}]
        return traits, lavis, "tous"
    # b : sachet ouvert, la farine dépasse en petit tas, étiquette
    gauche = m.ligne([0.18, 0.3], [0.16, 0.62], [0.17, 0.95], [0.5, 0.97], [0.82, 0.95], [0.83, 0.6], [0.8, 0.3])
    m.coins = 0.0
    bouche = m.boucle(0.49, 0.3, 0.31, 0.07, depart=170, tour=1.04, n=14)
    tas = m.ligne([0.24, 0.3], [0.34, 0.2], [0.46, 0.12], [0.56, 0.14], [0.66, 0.22], [0.74, 0.3])
    m.coins = 0.035
    etiq = m.ligne([0.3, 0.52], [0.68, 0.51], [0.68, 0.8], [0.31, 0.81], [0.3, 0.51])
    poudre = [m.point(0.9, 0.2, 0.01), m.point(0.95, 0.28, 0.008), m.point(0.12, 0.16, 0.01)]
    traits = [gauche, bouche, tas, etiq, *poudre]
    lavis = [{"teinte": "bleu", "traits": [3], "mode": "remplir", "couverture": 0.8},
             {"teinte": "miel", "traits": [0, 1], "mode": "remplir", "couverture": 0.4, "densite": 0.5, "reflet": False}]
    return traits, lavis, "dessin"


def sucre(m: Main, v: str):
    m.coins = 0.035
    def cube(ox, oy, s, k=1.0):
        f = m.ligne([ox, oy + 0.18 * s], [ox + 0.5 * s, oy + 0.19 * s], [ox + 0.5 * s, oy + 0.7 * s], [ox + 0.01 * s, oy + 0.69 * s], [ox, oy + 0.17 * s])
        dessus = m.ligne([ox, oy + 0.18 * s], [ox + 0.2 * s, oy], [ox + 0.7 * s, oy + 0.01 * s], [ox + 0.5 * s, oy + 0.19 * s])
        cote = m.ligne([ox + 0.7 * s, oy + 0.01 * s], [ox + 0.69 * s, oy + 0.5 * s], [ox + 0.5 * s, oy + 0.7 * s])
        return [f, dessus, cote]
    if v == "a":  # deux morceaux
        traits = cube(0.05, 0.3, 0.9) + cube(0.56, 0.5, 0.62)
        lavis = [{"teinte": "bleu", "mode": "polygone", "points": [[0.5, 0.47], [0.68, 0.3], [0.67, 0.75], [0.5, 0.93]],
                  "couverture": 0.75, "densite": 0.8, "reflet": False},
                 {"teinte": "bleu", "mode": "polygone", "points": [[0.87, 0.62], [1.0, 0.5], [1.0, 0.82], [0.87, 0.94]],
                  "couverture": 0.75, "densite": 0.8, "reflet": False}]
        return traits, lavis, "tous"
    # b : un morceau et quelques grains
    traits = cube(0.15, 0.2, 1.0) + [m.point(0.92, 0.85, 0.015), m.point(0.97, 0.78, 0.012), m.point(0.86, 0.93, 0.012)]
    lavis = [{"teinte": "bleu", "mode": "polygone", "points": [[0.65, 0.39], [0.85, 0.2], [0.84, 0.7], [0.65, 0.9]],
              "couverture": 0.75, "densite": 0.85, "reflet": False}]
    return traits, lavis, "tous"


def huile(m: Main, v: str):
    m.coins = 0.025
    if v == "a":  # bouteille, bouchon, étiquette, goutte
        b = m.ligne([0.42, 0.12], [0.42, 0.27], [0.36, 0.33], [0.27, 0.4], [0.26, 0.6], [0.26, 0.95], [0.5, 0.97],
                    [0.73, 0.95], [0.74, 0.6], [0.73, 0.4], [0.64, 0.33], [0.58, 0.27], [0.58, 0.12])
        bouchon = m.ligne([0.4, 0.12], [0.39, 0.03], [0.6, 0.02], [0.61, 0.12], [0.4, 0.13])
        e1 = m.ligne([0.27, 0.56], [0.5, 0.58], [0.73, 0.55])
        e2 = m.ligne([0.27, 0.77], [0.5, 0.79], [0.73, 0.76])
        goutte = m.ligne([0.88, 0.7], [0.84, 0.8], [0.86, 0.84], [0.9, 0.84], [0.92, 0.8], [0.88, 0.7], coins=0.0)
        traits = [b, bouchon, e1, e2, goutte]
        lavis = [{"teinte": "huile", "mode": "polygone",
                  "points": [[0.27, 0.44], [0.73, 0.43], [0.74, 0.95], [0.5, 0.97], [0.26, 0.95]], "couverture": 0.75},
                 {"teinte": "huile", "traits": [4], "mode": "remplir", "couverture": 0.9, "reflet": False}]
        return traits, lavis, "tous"
    # b : bouteille haute à bec verseur, et une olive avec sa feuille
    corps = m.ligne([0.3, 0.3], [0.22, 0.38], [0.21, 0.96], [0.4, 0.98], [0.59, 0.96], [0.58, 0.38], [0.5, 0.3])
    col = m.ligne([0.31, 0.31], [0.34, 0.12], [0.46, 0.12], [0.49, 0.31])
    bec = m.ligne([0.33, 0.12], [0.34, 0.06], [0.46, 0.05], [0.53, 0.0], [0.5, 0.07], [0.47, 0.12])
    m.coins = 0.0
    olive = m.boucle(0.8, 0.88, 0.075, 0.062, rot=10, depart=200, tour=1.05, n=10)
    queue = m.ligne([0.8, 0.82], [0.79, 0.76], [0.81, 0.71])
    feuille = m.ligne([0.8, 0.73], [0.74, 0.69], [0.66, 0.69], [0.71, 0.74], [0.8, 0.74])
    traits = [corps, col, bec, olive, queue, feuille]
    lavis = [{"teinte": "huile", "mode": "polygone", "points": [[0.22, 0.5], [0.58, 0.48], [0.59, 0.95], [0.4, 0.97], [0.21, 0.95]],
              "couverture": 0.8},
             {"teinte": "pomme-verte", "traits": [3], "mode": "remplir", "couverture": 0.9, "reflet": False},
             {"teinte": "feuille", "traits": [5], "mode": "remplir", "couverture": 0.9, "reflet": False, "decalage": 0.6}]
    return traits, lavis, "dessin"


def beurre(m: Main, v: str):
    m.coins = 0.035
    if v == "a":  # plaquette en perspective, une tranche coupée
        dessus = m.ligne([0.06, 0.48], [0.32, 0.3], [0.94, 0.31], [0.7, 0.49], [0.05, 0.48])
        face = m.ligne([0.06, 0.48], [0.06, 0.74], [0.7, 0.75], [0.7, 0.49])
        cote = m.ligne([0.7, 0.75], [0.94, 0.56], [0.94, 0.31])
        coupe = m.ligne([0.56, 0.49], [0.78, 0.31])
        traits = [dessus, face, cote, coupe]
        lavis = [{"teinte": "beurre", "traits": [0, 1, 2], "mode": "remplir", "couverture": 0.72}]
        return traits, lavis, "tous"
    # b : sur une petite assiette, un couteau à beurre posé à côté
    dessus = m.ligne([0.2, 0.45], [0.38, 0.33], [0.78, 0.34], [0.62, 0.46], [0.19, 0.45])
    face = m.ligne([0.2, 0.45], [0.2, 0.66], [0.62, 0.67], [0.62, 0.46])
    cote = m.ligne([0.62, 0.67], [0.78, 0.55], [0.78, 0.34])
    m.coins = 0.0
    assiette = m.ligne([0.04, 0.6], [0.06, 0.74], [0.3, 0.82], [0.62, 0.82], [0.9, 0.74], [0.97, 0.6])
    couteau = m.ligne([0.5, 0.9], [0.76, 0.87], [0.99, 0.82], [0.97, 0.88], [0.76, 0.91], [0.5, 0.92])
    traits = [dessus, face, cote, assiette, couteau]
    lavis = [{"teinte": "beurre", "traits": [0, 1, 2], "mode": "remplir", "couverture": 0.75},
             {"teinte": "bleu", "mode": "polygone", "points": [[0.05, 0.62], [0.2, 0.68], [0.62, 0.69], [0.96, 0.62], [0.9, 0.74], [0.62, 0.81], [0.3, 0.81], [0.07, 0.74]],
              "couverture": 0.6, "densite": 0.7, "reflet": False}]
    return traits, lavis, "dessin"


def noix(m: Main, v: str):
    if v == "a":
        o = m.boucle(0.5, 0.52, 0.4, 0.42, depart=-95, tour=1.05, n=18, irr=0.07, pointe=(-90, 0.08))
        cou = m.ligne([0.5, 0.1], [0.47, 0.3], [0.53, 0.5], [0.47, 0.72], [0.51, 0.94])
        r1 = m.ligne([0.24, 0.38], [0.3, 0.46], [0.27, 0.56])
        r2 = m.ligne([0.72, 0.36], [0.68, 0.48], [0.74, 0.6])
        r3 = m.ligne([0.3, 0.72], [0.37, 0.78])
        traits = [o, cou, r1, r2, r3]
        lavis = [{"teinte": "noix", "traits": [0], "mode": "remplir", "couverture": 0.7}]
        return traits, lavis, "tous"
    # b : deux noix, la deuxième plus petite derrière
    o1 = m.boucle(0.36, 0.58, 0.3, 0.32, depart=-95, tour=1.05, n=16, irr=0.07)
    c1 = m.ligne([0.36, 0.27], [0.33, 0.5], [0.38, 0.7], [0.35, 0.89])
    o2 = m.arc(0.74, 0.44, 0.23, 0.25, -170, 110, n=12)
    c2 = m.ligne([0.76, 0.2], [0.74, 0.35], [0.78, 0.48])
    traits = [o1, c1, o2, c2]
    lavis = [{"teinte": "noix", "traits": [0], "mode": "remplir", "couverture": 0.7},
             {"teinte": "noix", "mode": "tache", "centre": [0.78, 0.42], "rayon": [0.14, 0.18], "couverture": 0.7, "densite": 1.15}]
    return traits, lavis, "dessin"


def vanille(m: Main, v: str):
    def gousse(dx=0.0, dy=0.0, k=1.0):
        P = lambda pts: [[dx + x * k, dy + y * k] for x, y in pts]  # noqa: E731
        haut = m.ligne(*P([[0.03, 0.74], [0.3, 0.5], [0.6, 0.31], [0.86, 0.2], [0.97, 0.17], [1.0, 0.22], [0.96, 0.28], [0.92, 0.26]]))
        bas = m.ligne(*P([[0.0, 0.8], [0.06, 0.79], [0.33, 0.62], [0.63, 0.43], [0.9, 0.29], [0.95, 0.27]]))
        bout = m.ligne(*P([[0.03, 0.74], [0.0, 0.8]]))
        fente = m.ligne(*P([[0.24, 0.61], [0.42, 0.5], [0.6, 0.39]]))
        return [haut, bas, bout, fente]
    if v == "a":  # une gousse un peu tordue, fendue, bout recourbé, quelques graines
        traits = gousse() + [m.point(0.35, 0.6, 0.008), m.point(0.47, 0.52, 0.008), m.point(0.55, 0.47, 0.008)]
        lavis = [{"teinte": "vanille", "traits": [0, 1, 2], "mode": "remplir", "couverture": 0.8, "reflet": False}]
        return traits, lavis, "dessin"  # en icône, une gousse seule n'est qu'un tiret : voir mb
    # b : gousse et fleur de vanille (orchidée à cinq pétales)
    traits = gousse(0.0, 0.22, 0.78)
    for a in (-90, -18, 54, 126, 198):
        r = math.radians(a)
        traits.append(m.boucle(0.76 + 0.1 * math.cos(r), 0.2 + 0.1 * math.sin(r), 0.1, 0.045, rot=a, depart=180, tour=1.0, n=9))
    traits.append(m.boucle(0.76, 0.2, 0.03, 0.03, tour=1.1, n=7))
    lavis = [{"teinte": "vanille", "traits": [0, 1, 2], "mode": "remplir", "couverture": 0.8, "reflet": False},
             {"teinte": "beurre", "mode": "tache", "centre": [0.76, 0.2], "rayon": [0.17, 0.16], "couverture": 0.75, "densite": 1.1}]
    return traits, lavis, "tous"

def cannelle(m: Main, v: str):
    def baton(x0, y0, x1, y1, e):
        d = np.array([x1 - x0, y1 - y0])
        L = np.hypot(*d)
        u = d / L
        nrm = np.array([-u[1], u[0]]) * e
        a, b = np.array([x0, y0]), np.array([x1, y1])
        haut = m.ligne(a - nrm, (a + b) / 2 - nrm * 1.03, b - nrm)
        bas = m.ligne(a + nrm, (a + b) / 2 + nrm * 0.97, b + nrm)
        fin = m.ligne(b - nrm, b + nrm * 1.05)
        # bout roulé : spirale bien visible (écorce enroulée)
        th = np.linspace(0, 2.6 * math.pi, 18)
        r = e * (1.0 - 0.33 * th / (2 * math.pi))
        loc = np.column_stack([r * np.cos(th + math.pi / 2) * 0.6, r * np.sin(th + math.pi / 2)])
        spr = np.column_stack([x0 + loc[:, 0] * u[0] - loc[:, 1] * u[1], y0 + loc[:, 0] * u[1] + loc[:, 1] * u[0]])
        return [haut, bas, fin, m._bouger(spr, 0.25)]
    if v == "a":  # fagot de trois bâtons noués d'une ficelle
        traits = baton(0.06, 0.66, 0.9, 0.56, 0.1) + baton(0.12, 0.88, 0.96, 0.8, 0.1) + baton(0.16, 0.42, 0.94, 0.34, 0.09)
        ficelle = m.ligne([0.5, 0.3], [0.53, 0.5], [0.51, 0.7], [0.54, 0.92])
        traits.append(ficelle)
        lavis = [{"teinte": "cannelle", "traits": [0, 1, 2], "mode": "remplir", "couverture": 0.78, "reflet": False},
                 {"teinte": "cannelle", "traits": [4, 5, 6], "mode": "remplir", "couverture": 0.78, "reflet": False},
                 {"teinte": "cannelle", "traits": [8, 9, 10], "mode": "remplir", "couverture": 0.78, "reflet": False}]
        return traits, lavis, "dessin"
    # b : deux bâtons courts qui se croisent (icône)
    traits = baton(0.05, 0.42, 0.86, 0.22, 0.12) + baton(0.14, 0.78, 0.95, 0.58, 0.12)
    lavis = [{"teinte": "cannelle", "traits": [0, 1, 2], "mode": "remplir", "couverture": 0.8, "reflet": False},
             {"teinte": "cannelle", "traits": [4, 5, 6], "mode": "remplir", "couverture": 0.8, "reflet": False}]
    return traits, lavis, "tous"

def muscade(m: Main, v: str):
    if v == "a":  # noix de muscade ovale et ses côtes
        o = m.boucle(0.5, 0.5, 0.42, 0.33, depart=-150, tour=1.06, n=16, rot=-15, irr=0.04)
        c1 = m.arc(0.5, 0.5, 0.27, 0.25, -60, 50, n=6, rot=-15)
        c2 = m.arc(0.42, 0.52, 0.14, 0.2, 110, 200, n=5, rot=-15)
        c3 = m.ligne([0.55, 0.66], [0.66, 0.62])
        traits = [o, c1, c2, c3]
        lavis = [{"teinte": "muscade", "traits": [0], "mode": "remplir", "couverture": 0.72}]
        return traits, lavis, "tous"
    # b : entière + moitié marbrée
    o = m.boucle(0.32, 0.5, 0.28, 0.24, depart=-150, tour=1.05, n=14, rot=-10)
    c1 = m.arc(0.32, 0.5, 0.17, 0.15, -60, 40, n=5)
    demi = m.ligne([0.62, 0.36], [0.6, 0.55], [0.66, 0.72], [0.8, 0.78], [0.94, 0.7], [0.98, 0.52], [0.92, 0.38], [0.76, 0.32], [0.62, 0.36])
    marbre = m.ligne([0.68, 0.46], [0.75, 0.52], [0.72, 0.6], [0.82, 0.62], [0.88, 0.5])
    traits = [o, c1, demi, marbre]
    lavis = [{"teinte": "muscade", "traits": [0], "mode": "remplir", "couverture": 0.72},
             {"teinte": "muscade", "traits": [2], "mode": "remplir", "couverture": 0.6, "densite": 0.7}]
    return traits, lavis, "dessin"


def fouet(m: Main, v: str):
    def boucle_fil(cx, larg, haut, bas_y):
        return m.ligne([cx - 0.04, bas_y], [cx - larg * 0.7, bas_y - haut * 0.45], [cx - larg, bas_y - haut * 0.8],
                       [cx - larg * 0.45, bas_y - haut * 1.0], [cx + larg * 0.45, bas_y - haut * 1.0],
                       [cx + larg, bas_y - haut * 0.8], [cx + larg * 0.7, bas_y - haut * 0.45], [cx + 0.04, bas_y], coins=0.0)
    m.coins = 0.025
    if v == "a":  # debout : manche et trois boucles
        manche = m.ligne([0.45, 0.6], [0.44, 0.92], [0.5, 0.98], [0.56, 0.92], [0.55, 0.6])
        bague = m.ligne([0.43, 0.62], [0.57, 0.61])
        b1 = boucle_fil(0.5, 0.32, 0.58, 0.61)
        b2 = boucle_fil(0.5, 0.15, 0.6, 0.61)
        traits = [manche, bague, b1, b2]
        lavis = [{"teinte": "miel", "traits": [0], "mode": "remplir", "couverture": 0.8, "reflet": False}]
        return traits, lavis, "tous"
    # b : penché, deux boucles et des éclaboussures
    manche = m.ligne([0.62, 0.62], [0.82, 0.9], [0.9, 0.93], [0.9, 0.85], [0.7, 0.56])
    m.coins = 0.0
    b1 = m.ligne([0.64, 0.6], [0.4, 0.55], [0.18, 0.4], [0.12, 0.22], [0.24, 0.12], [0.42, 0.18], [0.6, 0.38], [0.68, 0.56])
    b2 = m.ligne([0.66, 0.58], [0.48, 0.48], [0.32, 0.32], [0.3, 0.2], [0.4, 0.2], [0.55, 0.36], [0.67, 0.57])
    g1 = m.point(0.1, 0.55, 0.015)
    g2 = m.point(0.2, 0.62, 0.012)
    traits = [manche, b1, b2, g1, g2]
    lavis = [{"teinte": "miel", "traits": [0], "mode": "remplir", "couverture": 0.8, "reflet": False}]
    return traits, lavis, "dessin"

def moule(m: Main, v: str):
    m.coins = 0.035
    # moule à cake de 3/4, bords évasés ; le cake gonfle au-dessus et se fend
    bord = m.ligne([0.02, 0.4], [0.2, 0.27], [0.98, 0.27], [0.8, 0.4], [0.01, 0.4])
    face = m.ligne([0.02, 0.4], [0.14, 0.82], [0.7, 0.83], [0.8, 0.41])
    cote = m.ligne([0.7, 0.83], [0.86, 0.68], [0.98, 0.28])
    m.coins = 0.0
    cake = m.ligne([0.1, 0.35], [0.2, 0.2], [0.42, 0.13], [0.66, 0.13], [0.84, 0.2], [0.9, 0.29])
    fente = m.ligne([0.3, 0.27], [0.4, 0.22], [0.47, 0.25], [0.58, 0.19], [0.68, 0.23])
    traits = [bord, face, cote, cake, fente]
    lavis = [{"teinte": "biscuit", "mode": "polygone",
              "points": [[0.1, 0.36], [0.2, 0.2], [0.42, 0.13], [0.66, 0.13], [0.84, 0.2], [0.9, 0.29], [0.8, 0.36], [0.06, 0.38]],
              "couverture": 0.8},
             {"teinte": "metal", "mode": "polygone", "points": [[0.04, 0.42], [0.8, 0.43], [0.97, 0.3], [0.86, 0.68], [0.7, 0.82], [0.14, 0.81]],
              "couverture": 0.6, "densite": 0.65, "reflet": False}]
    return traits, lavis, "tous"

def carrot_cake(m: Main, v: str):
    m.coins = 0.035
    if v == "a":  # part couchée, pointe à gauche, glaçage qui coule, petite carotte dessus
        dessus = m.ligne([0.06, 0.55], [0.6, 0.33], [0.94, 0.44])
        face = m.ligne([0.06, 0.55], [0.08, 0.86], [0.93, 0.8], [0.94, 0.44], [0.06, 0.56])
        couche = m.ligne([0.07, 0.7], [0.5, 0.68], [0.93, 0.62])
        coule = m.ligne([0.06, 0.58], [0.25, 0.56], [0.3, 0.62], [0.35, 0.56], [0.6, 0.52], [0.64, 0.58], [0.68, 0.5], [0.93, 0.48])
        carotte = m.ligne([0.52, 0.32], [0.62, 0.18], [0.68, 0.2], [0.53, 0.33])
        fanes = m.ligne([0.64, 0.17], [0.66, 0.08], [0.69, 0.16], [0.75, 0.1])
        miettes = [m.point(0.3, 0.78, 0.012), m.point(0.55, 0.76, 0.012), m.point(0.75, 0.73, 0.012)]
        traits = [dessus, face, couche, coule, carotte, fanes, *miettes]
        lavis = [{"teinte": "biscuit", "mode": "polygone",
                  "points": [[0.07, 0.6], [0.3, 0.62], [0.62, 0.56], [0.93, 0.5], [0.93, 0.8], [0.08, 0.86]],
                  "couverture": 0.78, "densite": 1.1},
                 {"teinte": "carotte", "traits": [4], "mode": "remplir", "couverture": 0.9, "reflet": False},
                 {"teinte": "tige", "traits": [5], "mode": "trait", "largeur": 0.05, "couverture": 0.9, "reflet": False}]
        return traits, lavis, "tous"
    # b : la part dans l'autre sens, un cerneau de noix dessus, sur une assiette
    dessus = m.ligne([0.94, 0.5], [0.4, 0.3], [0.06, 0.4])
    face = m.ligne([0.94, 0.5], [0.92, 0.78], [0.07, 0.73], [0.06, 0.4], [0.94, 0.51])
    couche = m.ligne([0.93, 0.66], [0.5, 0.63], [0.07, 0.58])
    coule = m.ligne([0.94, 0.53], [0.75, 0.5], [0.7, 0.57], [0.65, 0.49], [0.4, 0.45], [0.36, 0.51], [0.32, 0.44], [0.07, 0.43])
    m.coins = 0.0
    assiette = m.ligne([0.0, 0.76], [0.08, 0.86], [0.5, 0.92], [0.92, 0.88], [1.0, 0.8])
    noix_ = m.boucle(0.42, 0.24, 0.09, 0.055, depart=170, tour=1.05, n=10, irr=0.08)
    traits = [dessus, face, couche, coule, assiette, noix_, m.point(0.3, 0.68, 0.012), m.point(0.62, 0.71, 0.012)]
    lavis = [{"teinte": "biscuit", "mode": "polygone",
              "points": [[0.93, 0.56], [0.7, 0.58], [0.38, 0.5], [0.07, 0.46], [0.07, 0.72], [0.91, 0.77]],
              "couverture": 0.78, "densite": 1.1},
             {"teinte": "noix", "traits": [5], "mode": "remplir", "couverture": 0.9, "reflet": False},
             {"teinte": "bleu", "mode": "polygone", "points": [[0.02, 0.78], [0.5, 0.86], [0.98, 0.82], [0.92, 0.88], [0.5, 0.92], [0.08, 0.86]],
              "couverture": 0.6, "densite": 0.7, "reflet": False}]
    return traits, lavis, "dessin"


def sourire_lunettes(m: Main, v: str):
    # 😎 : une tête ronde, un grand sourire, des lunettes de soleil
    tete = m.boucle(0.5, 0.52, 0.45, 0.44, depart=-120, tour=1.05, n=20, irr=0.03)
    m.coins = 0.02
    verres = m.ligne([0.12, 0.38], [0.47, 0.37], [0.45, 0.5], [0.38, 0.56], [0.24, 0.56], [0.16, 0.5], [0.13, 0.39],
                     [0.5, 0.4], [0.88, 0.37], [0.86, 0.5], [0.78, 0.56], [0.63, 0.56], [0.55, 0.5], [0.53, 0.39])
    m.coins = 0.0
    bouche = m.ligne([0.3, 0.7], [0.4, 0.78], [0.52, 0.8], [0.64, 0.76], [0.72, 0.68])
    coin = m.ligne([0.69, 0.66], [0.74, 0.7])
    traits = [tete, verres, bouche, coin]
    lavis = [{"teinte": "verre-fume", "traits": [1], "mode": "remplir", "couverture": 0.85, "densite": 1.35, "decalage": 0.5},
             {"teinte": "miel", "traits": [0], "mode": "remplir", "couverture": 0.45, "densite": 0.55}]
    return traits, lavis, "tous"


def levure(m: Main, v: str):
    m.coins = 0.035
    # sachet plat aux bords dentelés
    haut = m.ligne(*[[0.12 + 0.76 * i / 8, 0.22 + (0.03 if i % 2 else 0)] for i in range(9)])
    bas = m.ligne(*[[0.12 + 0.76 * i / 8, 0.78 + (0.03 if i % 2 else 0)] for i in range(9)])
    g = m.ligne([0.12, 0.22], [0.11, 0.5], [0.12, 0.78])
    d = m.ligne([0.88, 0.22], [0.89, 0.5], [0.88, 0.78])
    bande = m.ligne([0.13, 0.45], [0.5, 0.47], [0.87, 0.44])
    traits = [haut, bas, g, d, bande]
    lavis = [{"teinte": "rose", "mode": "polygone", "points": [[0.13, 0.25], [0.87, 0.25], [0.87, 0.44], [0.13, 0.45]],
              "couverture": 0.75, "reflet": False}]
    return traits, lavis, "tous"


CROQUIS_MAISON = {
    "cupcake": (cupcake, "abc"),
    "lunettes-soleil": (lunettes_soleil, "ab"),
    "oeuf": (oeuf, "ab"),
    "citron": (citron, "ab"),
    "farine": (farine, "ab"),
    "sucre": (sucre, "ab"),
    "huile": (huile, "ab"),
    "beurre": (beurre, "ab"),
    "noix": (noix, "ab"),
    "vanille": (vanille, "ab"),
    "cannelle": (cannelle, "ab"),
    "muscade": (muscade, "ab"),
    "fouet": (fouet, "ab"),
    "moule": (moule, "a"),
    "carrot-cake": (carrot_cake, "ab"),
    "levure": (levure, "a"),
    "sourire-lunettes": (sourire_lunettes, "a"),
}
# variante → préfixe de nom de fichier ; les variantes maison s'appellent m-a, m-b… pour ne jamais
# écraser une variante Quick, Draw! (a, b, c…) du même nom.


def construire(nom: str):
    f, vs = CROQUIS_MAISON[nom]
    for k, v in enumerate(vs):
        graine = 1000 + sum(map(ord, nom)) * 7 + k
        m = Main(graine)
        traits, lavis, pour = f(m, v)
        traits = temps([np.asarray(t, float) for t in traits], m.rng)
        traits, ref = normaliser(traits)
        for sp in lavis:
            if "points" in sp:
                sp["points"] = _norm_pts(sp["points"], ref)
            if "centre" in sp:
                sp["centre"] = _norm_pts([sp["centre"]], ref)[0]
                r = sp["rayon"]
                sp["rayon"] = [round(r[0] / ref[2], 4), round(r[1] / ref[2], 4)]
        A = np.vstack(traits)
        out = {
            "nom": nom,
            "variante": f"m{v}",
            "source": "maison",
            "licence": "celle du projet (dessin original)",
            "auteur": "lot C « Croquis », dessiné à main levée en coordonnées (scripts/croquis/maison.py)",
            "graine": graine,
            "taille": [round(float(np.ptp(A[:, 0])), 4), round(float(np.ptp(A[:, 1])), 4)],
            "point": ["x", "y", "t"],
            "traits": [[[round(float(x), 4), round(float(y), 4), round(float(t), 3)] for x, y, t in T] for T in traits],
            "pour": pour,
            "lavis": lavis,
        }
        dossier = CROQUIS / nom
        dossier.mkdir(parents=True, exist_ok=True)
        (dossier / f"m{v}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
        print(f"{nom}/m{v} : {len(traits)} traits ({pour})")


if __name__ == "__main__":
    noms = sys.argv[1:] or list(CROQUIS_MAISON)
    for n in noms:
        construire(n)
