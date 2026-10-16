"""Diacritiques et petits glyphes tracés à la main, en unités de hauteur d'x
(y vers le bas, ligne de base à 0, haut des minuscules à −1).

Chaque fonction renvoie une liste de traits (tableaux (n, 2)), dans l'ordre où on les écrit.
Un peu d'aléa (graine) : deux accents ne sont jamais identiques.
"""
from __future__ import annotations

import numpy as np


def _bezier(pts, n=10):
    pts = np.asarray(pts, float)
    t = np.linspace(0, 1, n)[:, None]
    if len(pts) == 3:
        return (1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t**2 * pts[2]
    if len(pts) == 4:
        return (1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t**2 * pts[2] + t**3 * pts[3]
    raise ValueError


def _polyline(pts, n=12):
    """Courbe lisse passant près des points (Catmull-Rom)."""
    P = np.asarray(pts, float)
    if len(P) == 2:
        t = np.linspace(0, 1, n)[:, None]
        return P[0] * (1 - t) + P[1] * t
    P = np.vstack([P[0] * 2 - P[1], P, P[-1] * 2 - P[-2]])
    out = []
    per = max(3, n // (len(P) - 3))
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, per, endpoint=(i == len(P) - 3)):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return np.array(out)


def _point(cx, cy, rng, r=0.035):
    """Un point posé : un tout petit trait (le stylo touche et repart)."""
    a = rng.uniform(-0.6, 0.9)
    L = rng.uniform(0.025, 0.05)
    d = np.array([np.cos(a), np.sin(a)]) * L
    c = np.array([cx, cy]) + rng.normal(0, r * 0.3, 2)
    return np.array([c - d / 2, c - d / 6, c + d / 6, c + d / 2])


def marque(nom: str, cx: float, haut: float, rng: np.random.Generator, pente: float = 0.0,
           echelle: float = 1.0, bas: float = 0.0) -> list[np.ndarray]:
    """Diacritique centré en x sur `cx`, posé au-dessus de `haut` (le haut de la lettre, y<0),
    ou sous `bas` pour la cédille. `pente` : tangente de l'inclinaison de l'écriture (accent
    décalé vers la droite quand l'écriture penche)."""
    s = echelle * rng.uniform(0.92, 1.1)
    j = lambda e=0.03: rng.normal(0, e)  # noqa: E731
    traits = []
    if nom in ("aigu", "grave", "circonflexe", "trema", "tilde"):
        y0 = haut - (0.16 + abs(j(0.03))) * s  # écart au-dessus de la lettre
        cx = cx + pente * (0.3 * s) + j(0.03)
        if nom == "aigu":
            a = np.radians(rng.uniform(48, 66))
            L = rng.uniform(0.32, 0.42) * s
            haut_pt = np.array([cx + np.cos(a) * L * 0.55, y0 - np.sin(a) * L])
            bas_pt = np.array([cx - np.cos(a) * L * 0.45, y0])
            mil = (haut_pt + bas_pt) / 2 + np.array([j(0.02), -abs(j(0.025))])
            traits.append(_bezier([haut_pt, mil, bas_pt], 9))
        elif nom == "grave":
            a = np.radians(rng.uniform(48, 66))
            L = rng.uniform(0.32, 0.42) * s
            haut_pt = np.array([cx - np.cos(a) * L * 0.55, y0 - np.sin(a) * L])
            bas_pt = np.array([cx + np.cos(a) * L * 0.45, y0])
            mil = (haut_pt + bas_pt) / 2 + np.array([j(0.02), -abs(j(0.025))])
            traits.append(_bezier([haut_pt, mil, bas_pt], 9))
        elif nom == "circonflexe":
            w = rng.uniform(0.17, 0.23) * s
            h = rng.uniform(0.24, 0.32) * s
            g = np.array([cx - w, y0 + j(0.02)])
            sommet = np.array([cx + j(0.03), y0 - h])
            d = np.array([cx + w * rng.uniform(0.9, 1.1), y0 + j(0.02)])
            traits.append(np.vstack([_bezier([g, (g + sommet) / 2 + [-0.01, -0.01], sommet], 6),
                                     _bezier([sommet, (sommet + d) / 2 + [0.01, -0.01], d], 6)[1:]]))
        elif nom == "trema":
            e = rng.uniform(0.13, 0.17) * s
            y = y0 - 0.06 * s
            traits.append(_point(cx - e, y + j(0.015), rng))
            traits.append(_point(cx + e, y + j(0.015), rng))
        elif nom == "tilde":
            w = 0.22 * s
            y = y0 - 0.1 * s
            traits.append(_polyline([[cx - w, y + 0.03], [cx - w / 2, y - 0.06], [cx + w / 2, y + 0.04], [cx + w, y - 0.05]], 12))
    elif nom == "cedille":
        x = cx + j(0.02) - pente * 0.15
        y = bas + 0.01
        traits.append(_polyline([[x, y - 0.02], [x + 0.01, y + 0.13 * s], [x + 0.13 * s, y + 0.22 * s],
                                 [x + 0.08 * s, y + 0.36 * s], [x - 0.09 * s, y + 0.38 * s]], 14))
    return traits


# écart entre la fin du mot et le glyphe dessiné qui le suit (hauteurs d'x)
ECART_AVANT = {".": 0.16, ",": 0.12, ";": 0.1, ":": 0.1, "!": 0.12, "?": 0.12, "»": 0.15, "°": 0.06,
               "⁄": 0.02, "x": 0.08}


def glyphe(ch: str, rng: np.random.Generator, pente: float = 0.0) -> tuple[list[np.ndarray], float]:
    """Petit glyphe dessiné que le réseau ne connaît pas. Renvoie (traits, largeur)."""
    j = lambda e=0.025: rng.normal(0, e)  # noqa: E731
    traits: list[np.ndarray] = []

    def penche(P):
        P = np.asarray(P, float).copy()
        P[:, 0] -= P[:, 1] * pente
        return P

    if ch == "x":  # x minuscule final
        w = rng.uniform(0.42, 0.52)
        h = rng.uniform(0.92, 1.0)
        a = _polyline([[0.0 + j(0.02), -h], [w * 0.45, -h * 0.5 + j(0.02)], [w + j(0.02), 0.0]], 9)
        b = _polyline([[w + j(0.02), -h + j(0.02)], [w * 0.55, -h * 0.48 + j(0.02)], [0.0 + j(0.02), 0.02]], 9)
        return [penche(a), penche(b)], w
    if ch == "⁄":  # barre de fraction
        P = [[0.0 + j(0.02), 0.08], [0.2, -0.8 + j(0.03)], [0.42 + j(0.02), -1.72]]
        return [penche(_polyline(P, 10))], 0.42
    if ch == ".":
        return [_point(0.05 + j(0.01), -0.05 + j(0.01), rng)], 0.12
    if ch == ",":
        P = [[0.09, -0.08], [0.095 + j(0.01), 0.07], [0.0 + j(0.02), 0.3 + j(0.03)]]
        return [penche(_polyline(P, 8))], 0.14
    if ch == ";":
        P = [[0.11, -0.08], [0.115 + j(0.01), 0.07], [0.02 + j(0.02), 0.3 + j(0.03)]]
        return [penche(_point(0.1, -0.72 + j(0.03), rng)), penche(_polyline(P, 8))], 0.17
    if ch == ":":
        return [penche(_point(0.07, -0.72 + j(0.03), rng)), penche(_point(0.07, -0.05, rng))], 0.15
    if ch == "!":
        h = rng.uniform(1.55, 1.8)
        tige = _polyline([[0.12 + j(0.02), -h], [0.1, -h * 0.6 + j(0.02)], [0.08 + j(0.01), -0.42]], 10)
        return [penche(tige), penche(_point(0.07, -0.05, rng))], 0.2
    if ch == "?":
        h = rng.uniform(0.95, 1.08)
        P = [[0.0, -1.35 * h], [0.12, -1.68 * h], [0.38, -1.74 * h], [0.53, -1.46 * h], [0.42, -1.12 * h],
             [0.26 + j(0.02), -0.9 * h], [0.24 + j(0.02), -0.5]]
        P = [[x + j(0.015), y + j(0.015)] for x, y in P]
        return [penche(_polyline(P, 22)), penche(_point(0.24, -0.05, rng))], 0.56
    if ch in "«»":
        w, h = rng.uniform(0.2, 0.26), rng.uniform(0.42, 0.52)
        yc = -0.5 + j()
        for k in range(2):
            x0 = k * rng.uniform(0.2, 0.26)
            if ch == "«":
                P = [[x0 + w, yc - h / 2 + j()], [x0 + j(0.015), yc + j(0.015)], [x0 + w + j(), yc + h / 2 + j()]]
            else:
                P = [[x0, yc - h / 2 + j()], [x0 + w + j(0.015), yc + j(0.015)], [x0 + j(), yc + h / 2 + j()]]
            traits.append(penche(np.vstack([_bezier([P[0], (np.array(P[0]) + P[1]) / 2, P[1]], 5),
                                            _bezier([P[1], (np.array(P[1]) + P[2]) / 2, P[2]], 5)[1:]])))
        return traits, 0.5
    if ch == "°":
        r = rng.uniform(0.13, 0.17)
        c = np.array([r + 0.02, -1.35 + j()])
        t = np.linspace(0.6, 0.6 + 2 * np.pi * rng.uniform(1.0, 1.1), 16)
        rr = r * (1 + 0.08 * np.sin(3 * t + rng.uniform(0, 6)))
        traits.append(penche(np.stack([c[0] + rr * np.cos(t), c[1] - rr * np.sin(t)], 1)))
        return traits, 2 * r + 0.08
    if ch == "=":
        for y in (-0.62, -0.32):
            traits.append(penche(_polyline([[0.02, y + j(0.02)], [0.3, y + j(0.015)], [0.6, y + j(0.02)]], 8)))
        return traits, 0.64
    if ch == "*":
        c = np.array([0.22, -1.1])
        for a in (90, 30, 150):
            d = np.array([np.cos(np.radians(a + j(5) * 40)), np.sin(np.radians(a))]) * 0.2
            traits.append(penche(np.array([c - d, c + d])))
        return traits, 0.46
    if ch == "€":
        t = np.linspace(np.radians(50), np.radians(310), 18)
        traits.append(penche(np.stack([0.5 + 0.42 * np.cos(t), -0.7 - 0.62 * np.sin(t)], 1)))
        for y in (-0.82, -0.58):
            traits.append(penche(np.array([[0.0, y + j(0.02)], [0.55, y + j(0.02)]])))
        return traits, 0.95
    return traits, 0.0
