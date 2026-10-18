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


# ---- ornements : cadre orné des frontispices, nœud de ruban, frise (pages décorées) -----------------
def _spirale(c, r0, r1, a0, tours, sens, n=40):
    """Spirale de rayon r0 (départ, angle a0) à r1, sur `tours` tours ; sens +1 : sens des aiguilles
    d'une montre (y vers le bas)."""
    t = np.linspace(0, 1, n)
    a = a0 + sens * 2 * math.pi * tours * t
    r = r0 + (r1 - r0) * t ** 0.9
    return np.column_stack([c[0] + r * np.cos(a), c[1] + r * np.sin(a)])


def _feuille(p, direction, longueur, largeur, rng, n=22):
    """Petite feuille en amande, d'un seul geste : de la tige à la pointe par un bord, retour par l'autre."""
    d = np.array([math.cos(direction), math.sin(direction)])
    nrm = np.array([-d[1], d[0]])
    t = np.linspace(0, 1, n)
    larg = largeur * rng.uniform(0.85, 1.15)
    aller = p[None] + d[None] * (longueur * t)[:, None] + nrm[None] * (larg * np.sin(math.pi * t) ** 0.8)[:, None]
    retour = p[None] + d[None] * (longueur * t[::-1])[:, None] - nrm[None] * (larg * 0.8 * np.sin(math.pi * t[::-1]) ** 0.8)[:, None]
    return np.vstack([aller, retour[1:]])


def _coin_orne(cx, cy, sx, sy, k, rng, xh):
    """Ornement d'un angle du cadre (cx, cy : l'angle du cadre intérieur ; sx, sy : vers l'intérieur,
    ±1 ; k : unité de taille, px) : deux volutes qui partent le long des côtés et s'enroulent vers la
    diagonale, une feuille et un point dans l'angle."""
    out = []
    j = lambda s=0.06: rng.normal(0, s)  # noqa: E731
    for cote in (0, 1):
        # local (u : le long du côté, v : vers l'intérieur ; unité k) → page
        def P(u, v):
            return np.array([cx + sx * k * (u if cote == 0 else v), cy + sy * k * (v if cote == 0 else u)])
        depart = P(5.0 + j(0.2), 0.4 + j(0.04))
        milieu = P(3.0, 0.55 + j())
        centre = P(2.2 + j(), 1.3 + j())
        # le sens d'enroulement : vers la diagonale (miroir d'un côté à l'autre et selon l'angle)
        sens = 1 if (sx * sy > 0) == (cote == 0) else -1
        a0 = math.atan2(milieu[1] - centre[1], milieu[0] - centre[0])
        spir = _spirale(centre, float(np.linalg.norm(milieu - centre)), 0.18 * k, a0, rng.uniform(1.05, 1.25), -sens)
        chemin = np.vstack([trait_courbe(depart, milieu, rng, xh, 0.02, 10)[:-1], spir])
        out.append(geste(chemin, rng, xh, appui=0.78, vif=1.2, tremble=0.012))
    # la feuille sur la diagonale, et un point d'appui au-delà
    base = np.array([cx + sx * 2.3 * k, cy + sy * 2.3 * k])
    direction = math.atan2(sy, sx) + rng.normal(0, 0.08)
    out.append(geste(_feuille(base, direction, 1.25 * k, 0.32 * k, rng), rng, xh, appui=0.75, vif=1.1, tremble=0.01))
    pt = base + np.array([sx, sy]) * 1.6 * k
    out.append(geste(np.array([pt, pt + [0.12 * k, 0.05 * k]]), rng, xh, appui=0.95, vif=0.7, tremble=0.0, depart=False))
    return out


def noeud(cx, cy, taille, rng, xh):
    """Nœud de ruban (le cadeau d'anniversaire) : deux boucles de part et d'autre du nœud, deux pans qui
    retombent, coupés en biseau. (cx, cy) : le nœud ; `taille` : largeur des deux boucles (px)."""
    w = taille / 2
    h = taille * 0.3
    out = []
    for s in (-1, 1):
        # la boucle : du nœud vers le haut et le côté, retour par le bas
        t = np.linspace(0, 1, 34)
        a = math.pi * t
        x = cx + s * (w * np.sin(a) ** 1.1 * (0.9 + 0.1 * t))
        y = cy - h * np.sin(2 * a) * 0.95 - 0.12 * h * np.sin(a)
        boucle = np.column_stack([x, y])
        boucle[:, 0] += rng.normal(0, 0.02) * w
        out.append(geste(boucle, rng, xh, appui=0.8, vif=1.2, tremble=0.012))
        # un pli dans la boucle
        pli = np.array([[cx + s * 0.25 * w, cy - 0.05 * h], [cx + s * 0.62 * w, cy - 0.32 * h]])
        out.append(geste(trait_courbe(pli[0], pli[1], rng, xh, 0.08, 8), rng, xh, appui=0.6, vif=1.4, tremble=0.008))
        # le pan : il retombe en s'écartant, ondule un peu, finit en biseau
        L = taille * rng.uniform(0.62, 0.72)
        t = np.linspace(0, 1, 26)
        px = cx + s * (0.08 * w + 0.42 * w * t + 0.06 * w * np.sin(math.pi * t * 1.5))
        py = cy + 0.15 * h + L * t
        bord1 = np.column_stack([px - s * 0.09 * w, py])
        bord2 = np.column_stack([px + s * 0.11 * w, py - 0.05 * h])
        fin = np.array([bord1[-1], [px[-1] + s * 0.01 * w, py[-1] - 0.32 * h], bord2[-1]])
        out.append(geste(bord1, rng, xh, appui=0.78, vif=1.3, tremble=0.012))
        out.append(geste(np.vstack([bord2, fin[::-1][1:]]), rng, xh, appui=0.78, vif=1.3, tremble=0.012))
    # le nœud
    t = np.linspace(0, 2 * math.pi, 30)
    k = np.column_stack([cx + 0.17 * w * np.cos(t), cy + 0.06 * h + 0.24 * h * np.sin(t)])
    out.append(geste(np.vstack([k, k[1:4]]), rng, xh, appui=0.85, vif=1.0, tremble=0.01))
    return out


def cadre_orne(x0, y0, x1, y1, rng, xh, ruban=True, coeur_bas=True):
    """Cadre orné d'un frontispice : double cadre à main levée, volutes et feuille à chaque angle, un nœud
    de ruban au milieu du haut (`ruban`), un petit cœur entre deux volutes au milieu du bas (`coeur_bas`)."""
    out = cadre(x0, y0, x1, y1, rng, xh, "double")
    e = 0.36 * xh
    k = max(0.9 * xh, min(x1 - x0, y1 - y0) * 0.028)
    for (cx, cy, sx, sy) in ((x0 + e, y0 + e, 1, 1), (x1 - e, y0 + e, -1, 1), (x1 - e, y1 - e, -1, -1), (x0 + e, y1 - e, 1, -1)):
        out += _coin_orne(cx, cy, sx, sy, k, rng, xh)
    xm = (x0 + x1) / 2 + rng.normal(0, 0.1) * xh
    if ruban:
        out += noeud(xm, y0 + rng.normal(0, 0.05) * xh, 5.2 * k, rng, xh)
    if coeur_bas:
        yb = y1 - e - 1.15 * k
        out += coeur(xm, yb, 1.5 * k, rng, xh)
        for s in (-1, 1):
            a = np.array([xm + s * 1.25 * k, yb + 0.15 * k])
            b = np.array([xm + s * 3.2 * k, yb + 0.35 * k])
            c = np.array([xm + s * 3.55 * k, yb - 0.25 * k])
            spir = _spirale(c, float(np.linalg.norm(b - c)), 0.12 * k, math.atan2(b[1] - c[1], b[0] - c[0]), 0.9, -s)
            out.append(geste(np.vstack([trait_courbe(a, b, rng, xh, 0.03, 10)[:-1], spir]), rng, xh, appui=0.75, vif=1.2,
                             tremble=0.01))
    return out


def frise(x0, x1, y, rng, xh, amplitude=0.55, onde=4.2):
    """Frise de rinceau : une tige qui ondule de x0 à x1 autour de y, une feuille à chaque crête (de
    part et d'autre, en alternance), une petite vrille à chaque creux sur deux, une volute aux deux bouts.
    Unités : amplitude et longueur d'onde en hauteurs d'x."""
    L = x1 - x0
    n = max(40, int(L / (0.1 * xh)))
    t = np.linspace(0, 1, n)
    k = L / (onde * xh)
    phase = rng.uniform(-0.2, 0.2)
    A = amplitude * xh
    X = x0 + L * t
    Y = y + A * np.sin(2 * math.pi * k * t + phase) + _bruit_lent(rng, n, max(8, n / 6), 0.04 * xh)
    out = [geste(np.column_stack([X, Y]), rng, xh, appui=0.74, vif=1.3, tremble=0.01)]
    # crêtes et creux : là où le sinus vaut ±1
    m = 0
    while True:
        u = ((m + 0.25) / k) - phase / (2 * math.pi * k)
        if u > 0.985:
            break
        if u > 0.02:
            i = int(u * (n - 1))
            p = np.array([X[i], Y[i]])
            haut = (m % 2) == 1  # sinus à -1 : la tige est en haut (y vers le bas)
            pente = math.atan2(Y[min(i + 1, n - 1)] - Y[max(i - 1, 0)], X[min(i + 1, n - 1)] - X[max(i - 1, 0)])
            cote = -1 if haut else 1
            direction = pente + cote * math.radians(rng.uniform(52, 68))
            if m % 2 == 0 or (m // 2) % 2 == 0:
                out.append(geste(_feuille(p, direction, 1.15 * xh, 0.3 * xh, rng), rng, xh, appui=0.74, vif=1.1, tremble=0.01))
            else:
                c = p + np.array([math.cos(direction), math.sin(direction)]) * 0.55 * xh
                out.append(geste(_spirale(c, 0.55 * xh, 0.1 * xh, direction + math.pi, 1.1, cote), rng, xh, appui=0.7,
                                 vif=1.2, tremble=0.008))
        m += 1
    for s, (xa, ya) in ((-1, (X[0], Y[0])), (1, (X[-1], Y[-1]))):
        c = np.array([xa + s * 0.45 * xh, ya - 0.45 * xh])
        out.append(geste(_spirale(c, 0.64 * xh, 0.1 * xh, math.atan2(ya - c[1], xa - c[0]), 1.15, s), rng, xh,
                         appui=0.72, vif=1.15, tremble=0.008))
    return out
