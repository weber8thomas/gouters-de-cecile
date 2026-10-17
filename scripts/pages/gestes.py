"""Tracés faits main du moteur de pages : soulignés, ratures, filets, chevrons d'insertion (‸),
barres de colonne, accolades, flèches, tirets. Jamais de géométrie propre : chaque tracé est
une suite de points [x, y, pression, vitesse] (px de page), avec une courbure, un tremblement
lent, une attaque appuyée et une fin qui s'allège, comme un vrai geste. L'encre de chaque point
est posée ensuite par le modèle d'encre de l'outil d'écriture (`ecriture.encrer_traits`).
"""
from __future__ import annotations

import math

import numpy as np


def _bruit_lent(rng, n, echelle, amp):
    """Bruit lisse (marche aléatoire interpolée) de n points, période ~ `echelle` points."""
    k = max(3, int(n / max(echelle, 1)) + 3)
    noeuds = rng.normal(0, amp, k)
    return np.interp(np.linspace(0, k - 1, n), np.arange(k), noeuds)


def geste(chemin: np.ndarray, rng, xh: float, appui=0.8, vif=1.25, tremble=0.025, depart=True) -> np.ndarray:
    """Points d'un chemin (m, 2) px → (n, 4) [x, y, p, v] rééchantillonnés tous les 0,05 xh,
    avec tremblement perpendiculaire, pression et vitesse d'un geste humain."""
    P = np.asarray(chemin, float)
    if len(P) < 2:
        P = np.vstack([P, P + [0.3, 0.1]])
    d = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.r_[0, np.cumsum(d)]
    L = float(s[-1]) or 1.0
    n = max(4, int(L / (0.05 * xh)) + 1)
    t = np.linspace(0, L, n)
    X = np.interp(t, s, P[:, 0])
    Y = np.interp(t, s, P[:, 1])
    # tremblement lent perpendiculaire au tracé
    dx, dy = np.gradient(X), np.gradient(Y)
    nn = np.hypot(dx, dy) + 1e-9
    nx, ny = -dy / nn, dx / nn
    w = _bruit_lent(rng, n, max(8, n / 5), tremble * xh)
    X, Y = X + nx * w, Y + ny * w
    u = t / L
    # vitesse : lente au départ et à l'arrivée, vive au milieu
    v = 0.55 + (vif - 0.55) * np.sin(np.pi * np.clip(u, 0, 1)) ** 0.7
    # pression : attaque appuyée (petit point d'appui), corps, fin qui se lève
    p = appui * (0.86 + 0.14 * np.cos(np.pi * u)) + _bruit_lent(rng, n, max(6, n / 7), 0.05)
    if depart:
        p += 0.22 * np.exp(-(t / (0.18 * xh)) ** 2)
    p *= 0.7 + 0.3 * np.clip((L - t) / (0.35 * xh), 0, 1)
    return np.column_stack([X, Y, np.clip(p, 0.15, 1.0), v])


def _rot(v, a):
    c, s = math.cos(a), math.sin(a)
    return np.array([v[0] * c - v[1] * s, v[0] * s + v[1] * c])


def trait_courbe(a, b, rng, xh, courbure=0.006, points=24):
    """Chemin de a à b, légèrement arqué (flèche = courbure × longueur, signe tiré au sort)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    L = float(np.linalg.norm(b - a)) or 1.0
    d = (b - a) / L
    nrm = np.array([-d[1], d[0]])
    fl = courbure * L * (1 if rng.random() < 0.5 else -1) * rng.uniform(0.6, 1.3)
    t = np.linspace(0, 1, points)
    P = a[None] + (b - a)[None] * t[:, None] + nrm[None] * (fl * 4 * t * (1 - t))[:, None]
    return P


def souligne(x0, y0, x1, y1, rng, xh, double=False, dy=0.32):
    """Souligné sous une ligne de base (x0,y0)→(x1,y1) (px). Trait de 100 à 130 % du mot,
    un peu arqué, qui ne part et ne finit jamais exactement aux bouts."""
    a, b = np.array([x0, y0], float), np.array([x1, y1], float)
    L = float(np.linalg.norm(b - a)) or 1.0
    d = (b - a) / L
    nrm = np.array([-d[1], d[0]])  # vers le bas (y vers le bas)
    out = []
    passes = 2 if double else 1
    for k in range(passes):
        avant = rng.uniform(-0.03, 0.06) * L
        apres = rng.uniform(0.0, 0.16) * L
        dy_k = (dy + 0.36 * k) * xh + rng.normal(0, 0.05) * xh
        ang = math.radians(rng.normal(0, 0.6))
        pa = a - d * avant + nrm * (dy_k + rng.normal(0, 0.04) * xh)
        pb = b + d * apres + nrm * (dy_k + rng.normal(0, 0.06) * xh)
        m = (pa + pb) / 2
        pa = m + _rot(pa - m, ang)
        pb = m + _rot(pb - m, ang)
        out.append(geste(trait_courbe(pa, pb, rng, xh, 0.008), rng, xh, appui=0.78, vif=1.5))
    return out


def rature(x0, y0, x1, y1, rng, xh, passes=None):
    """Rature d'un mot : 1 ou 2 traits presque horizontaux à mi-hauteur d'x, qui dépassent un peu.
    (x0,y0)→(x1,y1) : ligne de base du mot raturé."""
    a, b = np.array([x0, y0], float), np.array([x1, y1], float)
    L = float(np.linalg.norm(b - a)) or 1.0
    d = (b - a) / L
    up = np.array([d[1], -d[0]])  # vers le haut
    passes = passes or (1 if rng.random() < 0.7 else 2)
    out = []
    for k in range(passes):
        h = (0.48 + rng.normal(0, 0.06) + (0.12 if k else 0)) * xh
        pa = a - d * rng.uniform(0.1, 0.35) * xh + up * (h + rng.normal(0, 0.05) * xh)
        pb = b + d * rng.uniform(0.05, 0.4) * xh + up * (h + rng.normal(0, 0.12) * xh)
        if k % 2:
            pa, pb = pb, pa  # aller-retour
        out.append(geste(trait_courbe(pa, pb, rng, xh, 0.01), rng, xh, appui=0.85, vif=1.6))
    return out


def chevron(x, y, rng, xh):
    """‸ d'insertion : petit chevron posé sous la ligne de base, pointe vers le haut."""
    h = rng.uniform(0.34, 0.44) * xh
    w = rng.uniform(0.22, 0.3) * xh
    P = np.array([[x - w, y + h * 0.95], [x - w * 0.45, y + h * 0.45], [x + rng.normal(0, 0.03) * xh, y],
                  [x + w * 0.5, y + h * 0.5], [x + w * 1.05, y + h * 1.02]])
    return [geste(P, rng, xh, appui=0.7, vif=1.2, tremble=0.01)]


def filet(xc, y, longueur, rng, xh):
    """Filet court centré (fin de recette, séparation)."""
    a = np.array([xc - longueur / 2 + rng.normal(0, 0.2) * xh, y + rng.normal(0, 0.1) * xh])
    b = np.array([xc + longueur / 2 + rng.normal(0, 0.3) * xh, y + rng.normal(0, 0.15) * xh])
    return [geste(trait_courbe(a, b, rng, xh, 0.004), rng, xh, appui=0.75, vif=1.6, tremble=0.015)]


def barre(x, y0, y1, rng, xh):
    """Barre verticale tracée à main levée (entre deux colonnes)."""
    a = np.array([x + rng.normal(0, 0.1) * xh, y0])
    b = np.array([x + rng.normal(0, 0.25) * xh + 0.03 * (y1 - y0), y1])
    return [geste(trait_courbe(a, b, rng, xh, 0.008), rng, xh, appui=0.7, vif=1.3, tremble=0.04)]


def accolade(x, y0, y1, rng, xh, largeur=None):
    """Accolade « } » de y0 à y1, pointe à droite au milieu."""
    w = largeur or rng.uniform(0.55, 0.75) * xh
    ym = (y0 + y1) / 2 + rng.normal(0, 0.05) * (y1 - y0)

    def bez(p0, p1, p2, p3, n=18):
        t = np.linspace(0, 1, n)[:, None]
        return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3

    p0 = np.array([x, y0])
    pm = np.array([x + w, ym])
    p3 = np.array([x + rng.normal(0, 0.05) * xh, y1])
    h1 = bez(p0, p0 + [w * 0.75, 0.1 * (ym - y0)], np.array([x + w * 0.2, ym - 0.05 * (ym - y0)]), pm)
    h2 = bez(pm, np.array([x + w * 0.2, ym + 0.05 * (y1 - ym)]), p3 + [w * 0.75, -0.1 * (y1 - ym)], p3)
    return [geste(np.vstack([h1, h2[1:]]), rng, xh, appui=0.75, vif=1.3, tremble=0.012)]


def fleche(a, b, rng, xh, courbure=0.12):
    """Flèche courbe de a vers b, pointe en deux petits traits."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    corps = trait_courbe(a, b, rng, xh, courbure, 30)
    out = [geste(corps, rng, xh, appui=0.65, vif=1.4, tremble=0.015)]
    d = corps[-1] - corps[-4]
    d /= np.linalg.norm(d) + 1e-9
    for s in (1, -1):
        bras = _rot(-d, s * math.radians(rng.uniform(28, 38))) * rng.uniform(0.55, 0.75) * xh
        out.append(geste(np.array([b + bras, b]), rng, xh, appui=0.7, vif=1.1, tremble=0.005))
    return out


def tiret(x, y, longueur, rng, xh):
    """Tiret de fin de ligne ou « — » centré."""
    a = np.array([x, y - 0.42 * xh + rng.normal(0, 0.05) * xh])
    b = a + [longueur, rng.normal(0, 0.06) * xh]
    return [geste(trait_courbe(a, b, rng, xh, 0.01, 10), rng, xh, appui=0.75, vif=1.4, tremble=0.01)]


def coche(x, y, rng, xh):
    """✓ d'appréciation."""
    P = np.array([[x, y - 0.5 * xh], [x + 0.3 * xh, y], [x + 1.0 * xh, y - 1.3 * xh]])
    return [geste(P, rng, xh, appui=0.8, vif=1.3, tremble=0.01)]


# =============================================================================================
# v4 : bandeau, cadre du mot, points de conduite (sommaire)
# =============================================================================================
def souligne_nom(x0, y0, x1, y1, rng, xh, dy=0.42, double=False):
    """Souligné d'un prénom écrit en grand : un seul geste vif, un peu irrégulier — il part un peu
    avant la première lettre, ondule à peine, et finit par une petite remontée (le stylo qui se lève
    en filant). `xh` : hauteur d'x du prénom ; (x0,y0)→(x1,y1) : sa ligne de base."""
    a, b = np.array([x0, y0], float), np.array([x1, y1], float)
    L = float(np.linalg.norm(b - a)) or 1.0
    d = (b - a) / L
    nrm = np.array([-d[1], d[0]])
    out = []
    for k in range(2 if double else 1):
        dk = (dy + 0.3 * k) * xh + rng.normal(0, 0.04) * xh
        pa = a - d * rng.uniform(0.0, 0.18) * xh + nrm * (dk + rng.normal(0, 0.05) * xh)
        pb = b + d * rng.uniform(0.15, 0.55) * xh + nrm * (dk + rng.normal(0.06, 0.06) * xh)
        n = 40
        t = np.linspace(0, 1, n)
        P = pa[None] + (pb - pa)[None] * t[:, None]
        # légère ondulation (main qui file) + arc d'ensemble
        ond = (_bruit_lent(rng, n, 9, 0.045 * xh) + rng.choice([-1, 1]) * 0.05 * L * 4 * t * (1 - t) * rng.uniform(0.04, 0.12))
        P = P + nrm[None] * ond[:, None]
        # remontée finale : les derniers 6 % filent vers le haut
        fin = np.clip((t - 0.94) / 0.06, 0, 1) ** 1.6
        P = P - nrm[None] * (fin * rng.uniform(0.18, 0.35) * xh)[:, None]
        out.append(geste(P, rng, xh, appui=0.82, vif=1.7, tremble=0.012))
    return out


def _cote(a, b, rng, xh, avant, apres, courbure=0.006, ondule=None):
    """Un côté de cadre de a à b, qui dépasse un peu aux deux angles (le trait suivant chevauche)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    L = float(np.linalg.norm(b - a)) or 1.0
    d = (b - a) / L
    nrm = np.array([-d[1], d[0]])
    pa = a - d * avant + nrm * rng.normal(0, 0.06) * xh
    pb = b + d * apres + nrm * rng.normal(0, 0.1) * xh
    if ondule is None:
        return geste(trait_courbe(pa, pb, rng, xh, courbure, 30), rng, xh, appui=0.78, vif=1.45, tremble=0.02)
    amp, onde = ondule
    Lp = float(np.linalg.norm(pb - pa))
    n = max(24, int(Lp / (0.12 * xh)))
    t = np.linspace(0, 1, n)
    base = pa[None] + (pb - pa)[None] * t[:, None]
    phase = rng.uniform(0, 2 * math.pi)
    k = Lp / (onde * xh)
    a_var = amp * xh * (1 + _bruit_lent(rng, n, max(6, n / 5), 0.18))
    w = a_var * np.sin(2 * math.pi * k * t + phase + _bruit_lent(rng, n, max(6, n / 6), 0.25))
    P = base + nrm[None] * w[:, None]
    return geste(P, rng, xh, appui=0.74, vif=1.25, tremble=0.012)


def cadre(x0, y0, x1, y1, rng, xh, style="double"):
    """Cadre tracé à main levée autour du mot pour Cécile : quatre traits qui se chevauchent un peu
    aux angles, jamais tout à fait d'équerre. `double` : un second cadre juste à l'intérieur, tracé à
    part (il ne suit pas exactement le premier) ; `ondule` : trait ondulé, un petit cœur sur un angle
    (voir `coeur`). → liste de tracés [x, y, p, v] (px)."""
    out = []

    def rect(ax0, ay0, ax1, ay1, ondule=None):
        j = lambda: rng.normal(0, 0.12) * xh  # noqa: E731
        c = [np.array([ax0 + j(), ay0 + j()]), np.array([ax1 + j(), ay0 + j()]),
             np.array([ax1 + j(), ay1 + j()]), np.array([ax0 + j(), ay1 + j()])]
        res = []
        for k in range(4):
            a, b = c[k], c[(k + 1) % 4]
            res.append(_cote(a, b, rng, xh, avant=rng.uniform(0.05, 0.4) * xh, apres=rng.uniform(0.1, 0.55) * xh,
                             courbure=rng.uniform(0.002, 0.007), ondule=ondule))
        return res

    if style == "ondule":
        out += rect(x0, y0, x1, y1, ondule=(rng.uniform(0.13, 0.17), rng.uniform(1.15, 1.4)))
    else:
        out += rect(x0, y0, x1, y1)
        e = rng.uniform(0.3, 0.4) * xh
        out += rect(x0 + e + rng.normal(0, 0.05) * xh, y0 + e + rng.normal(0, 0.05) * xh,
                    x1 - e + rng.normal(0, 0.05) * xh, y1 - e + rng.normal(0, 0.05) * xh)
    return out


def coeur(cx, cy, taille, rng, xh):
    """Petit cœur d'un seul geste (départ au creux du haut, tour par la gauche, pointe en bas), un peu
    penché et asymétrique. (cx, cy) : centre ; `taille` : largeur (px)."""
    t = np.linspace(0, 2 * math.pi, 60)
    x = 16 * np.sin(t) ** 3
    y = -(13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t))
    P = np.column_stack([x, y]) / 32.0 * taille
    P[:, 0] *= rng.uniform(0.92, 1.08)
    P = P[::-1]  # sens de la main : du creux vers la gauche
    ang = math.radians(rng.normal(-8, 5))
    c, s = math.cos(ang), math.sin(ang)
    P = np.column_stack([P[:, 0] * c - P[:, 1] * s, P[:, 0] * s + P[:, 1] * c])
    P += np.array([cx, cy])
    # le trait se referme en dépassant un peu son départ
    P = np.vstack([P, P[1:4] + rng.normal(0, 0.03, (3, 2)) * xh])
    return [geste(P, rng, xh, appui=0.8, vif=1.15, tremble=0.015)]


def points_conduite(xa, ya, xb, yb, rng, xh, pas=0.62):
    """Points de conduite tracés à la main entre la fin d'un titre et son folio : petits appuis
    espacés irrégulièrement, sur la ligne de base (qui peut monter ou descendre un peu)."""
    a, b = np.array([xa, ya], float), np.array([xb, yb], float)
    L = float(np.linalg.norm(b - a))
    if L < 1.2 * xh:
        return []
    d = (b - a) / L
    out = []
    s = rng.uniform(0.1, 0.4) * xh
    while s < L - 0.15 * xh:
        p = a + d * s + np.array([0.0, rng.normal(-0.06, 0.05) * xh])
        q = p + np.array([rng.uniform(0.05, 0.11) * xh, rng.normal(-0.02, 0.02) * xh])
        out.append(geste(np.array([p, q]), rng, xh, appui=0.92, vif=0.8, tremble=0.0, depart=False))
        s += pas * xh * float(np.clip(rng.normal(1, 0.14), 0.7, 1.35))
    return out
