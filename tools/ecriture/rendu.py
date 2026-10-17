"""Aperçu SVG d'un résultat d'`ecrire()` : l'encre n'est jamais un aplat.

Chaque trait est un ruban fait de petits quadrilatères (un par segment) et de disques aux
jointures : épaisseur selon la pression (plus fin quand le stylo va vite, plus épais aux
départs et arrêts), couleur point par point selon la quantité d'encre et la vitesse, entre la
nuance « chargée » et la nuance « claire » de l'encre, mêlée au papier (couleurs opaques
pré-mélangées : aucun recouvrement ne fait de couture). Les éléments de même couleur sont
regroupés dans un seul chemin pour garder le fichier léger.

Lumière (facultative) : lumière chaude de fin d'après-midi venant du haut à gauche ; l'encre
est un peu plus claire et plus chaude dans la lumière, plus sombre et plus froide dans l'ombre,
et l'encre de plume fraîche et chargée a un léger reflet sur le bord tourné vers la lumière.

Ce n'est qu'un aperçu : la cuisson de l'encre dans le papier se fait ailleurs (même formule de
couleur : `encre.couleurs`).
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

import encre as E

PAPIER = "#eee1bf"  # médiane mesurée des vrais carnets (références § 2.1)
DIR_LUMIERE = np.array([-0.62, -0.78])  # vers la source (haut-gauche), repère y vers le bas


def _decimer(T, pas=0.06):
    """Garde un point tous les `pas` (hauteurs d'x) environ, toujours les extrémités."""
    if len(T) <= 2:
        return T
    garde = [0]
    acc = 0.0
    d = np.linalg.norm(np.diff(T[:, :2], axis=0), axis=1)
    for i in range(1, len(T) - 1):
        acc += d[i - 1]
        if acc >= pas:
            garde.append(i)
            acc = 0.0
    garde.append(len(T) - 1)
    return T[garde]


def _hexa(c):
    return "#%02x%02x%02x" % tuple(int(round(x)) for x in c)


def _cercle(x, y, r):
    return f"M{x - r:.1f},{y:.1f}a{r:.1f},{r:.1f} 0 1,0 {2 * r:.1f},0a{r:.1f},{r:.1f} 0 1,0 {-2 * r:.1f},0"


def lumiere_page(x, y, page):
    """−1 (ombre, bas-droite) … +1 (lumière, haut-gauche) selon la position sur la page."""
    x0, y0, x1, y1 = page
    u = (x - x0) / max(x1 - x0, 1e-6)
    v = (y - y0) / max(y1 - y0, 1e-6)
    return np.clip(1.0 - (0.85 * u + 1.15 * v), -1, 1)


def groupe(res: dict, echelle: float, ox: float, oy: float, papier: str = PAPIER, ep=None,
           lumiere: float = 0.0, page=None, debug=False) -> str:
    """Éléments SVG de tout le texte. `lumiere` : intensité de l'éclairage (0 = aucun, 0,3 =
    discret, conseillé). `page` : rectangle (x0, y0, x1, y1) de la page en unités du texte
    (défaut : la boîte du texte)."""
    ep = ep or res.get("epaisseur_conseillee", 0.085)
    enc = res.get("encre", {"id": "bic", "outil": "bille"})
    page = page or res["boite"]
    paquets: dict[str, list[str]] = defaultdict(list)
    reflets: list[str] = []
    q = 3  # pas de quantification des couleurs (niveaux sur 255)
    for ligne in res["lignes"]:
        for mot in ligne["mots"]:
            for t in mot["traits"]:
                T = np.asarray(t, float)
                if T.ndim != 2 or len(T) == 0:
                    continue
                if T.shape[1] < 5:  # résultat sans encre : chargé uniforme
                    T = np.column_stack([T, np.full(len(T), 0.85)])
                T = _decimer(T)
                lu = lumiere * lumiere_page(T[:, 0], T[:, 1], page) if lumiere else None
                col = E.couleurs(T[:, 4], T[:, 3], enc["id"], papier, lumiere=lu)
                col = (np.round(col / q) * q).clip(0, 255)
                P = T[:, :2] * echelle + [ox, oy]
                w = ep * echelle * (0.42 + 0.78 * T[:, 2]) / 2
                if len(P) == 1 or np.ptp(P[:, 0]) + np.ptp(P[:, 1]) < 0.5:
                    c = P.mean(0)
                    paquets[_hexa(col.mean(0))].append(_cercle(c[0], c[1], max(w.max(), 0.55 * ep * echelle)))
                    continue
                d = np.gradient(P, axis=0)
                d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                nrm = np.stack([-d[:, 1], d[:, 0]], 1)
                G = P + nrm * w[:, None]
                D = P - nrm * w[:, None]
                for i in range(len(P) - 1):
                    cs = _hexa((col[i] + col[i + 1]) / 2)
                    paquets[cs].append(
                        f"M{G[i,0]:.1f},{G[i,1]:.1f}L{G[i+1,0]:.1f},{G[i+1,1]:.1f}"
                        f"L{D[i+1,0]:.1f},{D[i+1,1]:.1f}L{D[i,0]:.1f},{D[i,1]:.1f}Z")
                for i in range(len(P)):
                    paquets[_hexa(col[i])].append(_cercle(P[i, 0], P[i, 1], w[i]))
                # reflet de l'encre de plume fraîche et chargée, côté lumière
                if lumiere and enc.get("outil") == "plume":
                    face = (nrm @ DIR_LUMIERE)
                    cote = np.where(face[:, None] >= 0, nrm, -nrm)
                    charge = (T[:, 4] > 0.82) & (w > 0.9)
                    for i in range(len(P) - 1):
                        if charge[i] and charge[i + 1]:
                            a = P[i] + cote[i] * w[i] * 0.55
                            b = P[i + 1] + cote[i + 1] * w[i + 1] * 0.55
                            reflets.append(f"M{a[0]:.1f},{a[1]:.1f}L{b[0]:.1f},{b[1]:.1f}")
    out = ['<g stroke="none">']
    for c, chemins in paquets.items():
        out.append(f'<path fill="{c}" d="{"".join(chemins)}"/>')
    out.append("</g>")
    if reflets:
        out.append(f'<path fill="none" stroke="#fff6e0" stroke-opacity="{0.22 * min(1.0, lumiere / 0.3):.2f}" '
                   f'stroke-width="{max(0.6, ep * echelle * 0.18):.1f}" stroke-linecap="round" d="{"".join(reflets)}"/>')
    if debug:
        out.append('<g fill="none" stroke-width="0.6">')
        for ligne in res["lignes"]:
            for mot in ligne["mots"]:
                b = mot["boite"]
                out.append(f'<rect x="{b[0]*echelle+ox:.1f}" y="{b[1]*echelle+oy:.1f}" width="{(b[2]-b[0])*echelle:.1f}" '
                           f'height="{(b[3]-b[1])*echelle:.1f}" stroke="#4a90d9"/>')
                (x0, y0), (x1, y1) = mot["ligne_de_base"]
                out.append(f'<line x1="{x0*echelle+ox:.1f}" y1="{y0*echelle+oy:.1f}" x2="{x1*echelle+ox:.1f}" '
                           f'y2="{y1*echelle+oy:.1f}" stroke="#d94a4a"/>')
        out.append("</g>")
    return "".join(out)


def fond(W, H, papier=PAPIER, lumiere=0.0, ident="gc-papier"):
    """Rectangle de papier ; avec lumière, un dégradé très doux chaud→ombre (aperçu seulement)."""
    if not lumiere:
        return f'<rect width="{W:.0f}" height="{H:.0f}" fill="{papier}"/>'
    P = E._hex(papier)
    clair = np.clip(P * np.array([1.02, 1.01, 0.985]) + 4 * lumiere / 0.3, 0, 255)
    sombre = np.clip(P * np.array([0.955, 0.955, 0.965]), 0, 255)
    return (f'<defs><linearGradient id="{ident}" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{_hexa(clair)}"/><stop offset="1" stop-color="{_hexa(sombre)}"/>'
            f'</linearGradient></defs><rect width="{W:.0f}" height="{H:.0f}" fill="url(#{ident})"/>')


def svg(res: dict, echelle: float = 40.0, marge: float = 1.0, papier: str = PAPIER, lumiere: float = 0.0,
        debug=False) -> str:
    b = res["boite"]
    x0, y0 = b[0] - marge, b[1] - marge
    W = (b[2] - b[0] + 2 * marge) * echelle
    H = (b[3] - b[1] + 2 * marge) * echelle
    page = (x0, y0, b[2] + marge, b[3] + marge)
    g = groupe(res, echelle, -x0 * echelle, -y0 * echelle, papier=papier, lumiere=lumiere, page=page, debug=debug)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}">'
            f'{fond(W, H, papier, lumiere)}{g}</svg>')
