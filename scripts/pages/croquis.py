"""Croquis à la main (lot C) : icônes d'ingrédients et petits dessins de recette, griffonnés par
l'invité dans son carnet, à son encre, avec une touche d'aquarelle, cuits dans le papier comme
l'écriture.

    import croquis as C
    C.disponibles()                         # ['beurre', 'cannelle', 'carotte', …]
    d = C.dessiner("carotte", boite=(60, 200, 34, 34), encre="feutre", graine=12, main="ado")
    d["traits"]   # [[(x, y, pression, vitesse, encre), …], …] px de page 850 × 960 (format N2)
    d["lavis"]    # touches d'aquarelle (géométrie en px de page, teinte, réglages), JSON
    d["diam"]     # largeur du trait à pression 1 (px de page), comme mise_en_page.Trace.diam
    d["encre"]    # {id, outil, charge, clair}, comme mise_en_page.Trace.encre
    C.traces(d)   # → [mise_en_page.Trace] prêts pour rendu_encre.rasteriser
    T = C.transmittance_lavis(d["lavis"], forme=(HAUT, LARG), echelle=2, relief=R.relief(papier))
    # cuisson : Rt, union = R.transmittance(cartes, rel, lam) ; Rt *= T

Sources des dessins : design-system/croquis/<nom>/<variante>.json
  - « quickdraw » : vrais dessins de joueurs de Quick, Draw! (Google, CC BY 4.0, voir LICENCE.md),
    choisis à l'œil (scripts/croquis/quickdraw.py) ;
  - « maison » : dessinés à main levée au même format (scripts/croquis/maison.py).
Chaque fichier : traits normalisés [[x, y, t], …] (plus grand côté = 1, t en s) et `lavis` : où
poser l'aquarelle (remplir le contour de certains traits, suivre un trait, tache, polygone).

Le tracé (`dessiner`) : variante choisie par la graine (parmi celles faites pour cette taille),
redessinée « à nouveau » à chaque graine (légère déformation lente, rotation ± 6°), proportions
conservées dans la boîte ; chaque trait est lissé (Catmull-Rom centripète), reçoit un tremblé
lent de la main, une vitesse (temps réel du joueur pour Quick, Draw!), une attaque appuyée et un
relâché, parfois un repassage ; l'encre de chaque point vient du modèle d'encre de l'outil
d'écriture (tools/ecriture/encre.py : plume qui se vide, bille qui saute, crayon granuleux,
feutre plus foncé aux croisements).

La touche d'aquarelle (`transmittance_lavis`) : une ou deux taches décalées du trait (3 à 6 px),
bord irrégulier qui déborde, couverture partielle (le papier respire, reflet laissé en blanc en
haut à gauche, côté lumière), pigment inégal qui s'accumule vers le bas, auréole plus foncée au
bord (l'eau sèche en poussant le pigment), granulation dans les creux du papier (relief, même
convention que rendu_encre.relief). Transmittance par canal T = exp(−d · DO), DO mesurée de la
teinte sur le papier de référence #eee1bf : multipliée avec l'encre, sans aplat.
"""
from __future__ import annotations

import functools
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np

ICI = Path(__file__).resolve().parent
RACINE = ICI.parents[1]
DOSSIER = RACINE / "design-system" / "croquis"
if str(ICI) not in sys.path:
    sys.path.insert(0, str(ICI))

W, H = 850.0, 1200.0  # page de référence (mise_en_page.W, H)
PAPIER_REF = "#eee1bf"  # rendu_encre.PAPIER_REF : papier où les teintes sont définies
ICONE_MAX = 72.0  # au-delà (px de page, plus grand côté de la boîte), c'est un « dessin »
# « Une touche d'aquarelle » : sur les dessins, le lavis couvre un peu moins et reste plus léger que la
# description de la variante (le papier respire) ; les icônes (≤ 45 px) gardent leur touche entière,
# sinon la couleur disparaîtrait à la taille d'une ligne.
TOUCHE_COUVERTURE = 0.86
TOUCHE_DENSITE = 0.9

# ---------------------------------------------------------------------------------------------
# Teintes d'aquarelle : couleur d'une couche moyenne posée sur le papier de référence (d = 1).
# Tirées des jetons (gc-terracotta, gc-honey, gc-sage, gc-pink, gc-crust…) et sourdies vers le
# papier ; saturation HSV ≤ 0,62 pour rester ≤ 70 % même dans l'auréole.
# ---------------------------------------------------------------------------------------------
TEINTES: dict[str, str] = {
    "carotte": "#e39563",      # orange doux (gc-terracotta-300 réchauffé vers gc-honey-500)
    "tige": "#97ad72",         # vert tige (gc-sage-500 plus vif)
    "feuille": "#8fae7a",
    "citron": "#e8cf6a",       # jaune citron (gc-honey-300 vers le citron)
    "rose": "#df9ea3",         # rose poudré (gc-pink-300 / 500)
    "fraise": "#d9776d",       # rouge fraise sourdi (gc-terracotta-300 / gc-jam)
    "cerise": "#c9685f",
    "pomme": "#d27b62",
    "pomme-verte": "#acc070",
    "biscuit": "#dcab6a",      # gc-crust
    "mie": "#e9c98e",          # gc-crumb
    "chocolat": "#8a644a",     # gc-chocolate éclairci
    "cannelle": "#b77d4e",
    "muscade": "#ad8a68",
    "noix": "#c39a6c",
    "vanille": "#7a5c45",
    "beurre": "#eed985",
    "oeuf": "#e3c39c",
    "huile": "#ddc25e",
    "the": "#c69a6c",          # gc-kraft
    "bleu": "#a3b9cc",         # bleu faïence pâle
    "sauge": "#a7bea6",        # gc-sage-300
    "metal": "#aeb3b6",
    "gris": "#8f8c90",
    "verre-fume": "#6c6873",   # verres de lunettes de soleil
    "banane": "#e9d276",
    "poire": "#bfcb75",
    "ananas": "#e2bb5a",
    "raisin": "#a68aaa",
    "myrtille": "#8995c0",
    "pasteque": "#e2837a",
    "glace": "#ebb9bf",
    "miel": "#e3b468",         # gc-honey-500 adouci
}


# =============================================================================================
# Outils
# =============================================================================================
def _graine(*parts) -> int:
    return int.from_bytes(hashlib.sha256(repr(parts).encode()).digest()[:8], "little")


def _rng(*parts) -> np.random.Generator:
    return np.random.default_rng(_graine(*parts))


def _hex(c: str) -> np.ndarray:
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _bruit1(rng, n: int, periode: float, amp: float) -> np.ndarray:
    """Bruit lisse 1D de n échantillons (période ~ `periode` échantillons)."""
    if n <= 0:
        return np.zeros(0)
    k = max(3, int(n / max(periode, 1.0)) + 3)
    noeuds = rng.normal(0, amp, k)
    x = np.linspace(0, k - 1, n)
    # interpolation cosinus (plus douce que linéaire)
    i = np.clip(np.floor(x).astype(int), 0, k - 2)
    f = x - i
    f = (1 - np.cos(np.pi * f)) / 2
    return noeuds[i] * (1 - f) + noeuds[i + 1] * f


def _bruit2(rng, h: int, w: int, echelle: float) -> np.ndarray:
    """Bruit 2D lisse ≈ N(0, 1), longueur de corrélation `echelle` px (grille bicubique)."""
    from PIL import Image
    echelle = max(echelle, 1.5)
    gh, gw = int(h / echelle) + 4, int(w / echelle) + 4
    g = rng.normal(0, 1, (gh, gw)).astype(np.float32)
    big = Image.fromarray(g, mode="F").resize((int(gw * echelle), int(gh * echelle)), Image.BICUBIC)
    a = np.asarray(big)
    o = int(echelle)
    a = a[o:o + h, o:o + w]
    if a.shape != (h, w):
        a = np.pad(a, ((0, h - a.shape[0]), (0, w - a.shape[1])), mode="edge")
    return (a - a.mean()) / (a.std() + 1e-6)


# =============================================================================================
# Catalogue
# =============================================================================================
def disponibles() -> list[str]:
    """Noms des croquis disponibles (dossiers de design-system/croquis/ qui ont une variante)."""
    if not DOSSIER.exists():
        return []
    return sorted(p.name for p in DOSSIER.iterdir() if p.is_dir() and any(p.glob("*.json")))


def variantes(nom: str) -> list[str]:
    return sorted(f.stem for f in (DOSSIER / nom).glob("*.json"))


@functools.lru_cache(maxsize=None)
def _charger(nom: str, variante: str) -> dict:
    d = json.loads((DOSSIER / nom / f"{variante}.json").read_text())
    d["_traits"] = [np.asarray(t, float).reshape(-1, 3) for t in d["traits"]]
    return d


def info(nom: str) -> list[dict]:
    """Métadonnées des variantes (source, key_id, licence, usage) sans les traits."""
    out = []
    for v in variantes(nom):
        d = _charger(nom, v)
        out.append({k: d[k] for k in d if k not in ("traits", "_traits", "lavis")})
    return out


def choisir_variante(nom: str, graine: int, taille: float | None = None) -> str:
    """Variante tirée par la graine parmi celles faites pour cette taille (icône ≤ 72 px de page,
    sinon dessin). Pour une liste à puces, tirer UNE variante pour toute la liste et la passer à
    `dessiner(variante=…)` : une vraie personne garde le même petit dessin d'une ligne à l'autre."""
    vs = variantes(nom)
    if not vs:
        raise KeyError(f"croquis inconnu : {nom} (disponibles : {', '.join(disponibles())})")
    if taille is not None:
        genre = "icone" if taille <= ICONE_MAX else "dessin"
        ok = [v for v in vs if _charger(nom, v).get("pour", "tous") in ("tous", genre)]
        vs = ok or vs
    return vs[int(_rng("variante", nom, int(graine)).integers(len(vs)))]


# =============================================================================================
# Tracé
# =============================================================================================
_MAIN_DE_L_ENCRE = {"feutre": "ado", "bille-bleue": "ado", "bic": "soignee", "plume": "ecole", "brune": "mamie",
                    "noire": "papa", "crayon": "soignee", "chocolat": "cecile", "rouge": "soignee"}


def _catmull_rom(P: np.ndarray, pas: float) -> np.ndarray:
    """Spline de Catmull-Rom centripète par les points P (n, k) (colonnes 0-1 = x, y ; les autres
    colonnes sont interpolées le long du paramètre). Points tous les ≈ `pas` px."""
    n = len(P)
    if n == 1:
        return P.copy()
    X = P[:, :2]
    ext = np.vstack([2 * X[0] - X[1], X, 2 * X[-1] - X[-2]])
    morceaux = []
    for i in range(n - 1):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        d01 = max(np.linalg.norm(p1 - p0), 1e-6) ** 0.5
        d12 = max(np.linalg.norm(p2 - p1), 1e-6) ** 0.5
        d23 = max(np.linalg.norm(p3 - p2), 1e-6) ** 0.5
        t0, t1 = 0.0, d01
        t2, t3 = t1 + d12, t1 + d12 + d23
        L = float(np.linalg.norm(p2 - p1))
        m = max(2, int(math.ceil(L / pas)) + 1)
        u = np.linspace(t1, t2, m)
        if i < n - 2:
            u = u[:-1]
        uu = u[:, None]
        A1 = (t1 - uu) / (t1 - t0) * p0 + (uu - t0) / (t1 - t0) * p1
        A2 = (t2 - uu) / (t2 - t1) * p1 + (uu - t1) / (t2 - t1) * p2
        A3 = (t3 - uu) / (t3 - t2) * p2 + (uu - t2) / (t3 - t2) * p3
        B1 = (t2 - uu) / (t2 - t0) * A1 + (uu - t0) / (t2 - t0) * A2
        B2 = (t3 - uu) / (t3 - t1) * A2 + (uu - t1) / (t3 - t1) * A3
        C = (t2 - uu) / (t2 - t1) * B1 + (uu - t1) / (t2 - t1) * B2
        f = ((u - t1) / (t2 - t1))[:, None]
        autres = P[i, 2:][None] * (1 - f) + P[i + 1, 2:][None] * f
        morceaux.append(np.column_stack([C, autres]))
    return np.vstack(morceaux)


def _arc(P: np.ndarray) -> np.ndarray:
    return np.r_[0.0, np.cumsum(np.hypot(*np.diff(P[:, :2], axis=0).T))] if len(P) > 1 else np.zeros(1)


def _vitesse(P: np.ndarray, s: np.ndarray) -> np.ndarray | None:
    """Vitesse brute (px/s) depuis le temps des points ; None si le temps est inutilisable."""
    t = P[:, 2]
    if len(P) < 3 or t[-1] - t[0] < 0.03:
        return None
    # lissage : vitesse moyenne sur une fenêtre de ±3 px d'arc
    fen = 3.0
    a = np.searchsorted(s, s - fen)
    b = np.clip(np.searchsorted(s, s + fen), 0, len(s) - 1)
    dt = t[b] - t[a]
    ds = s[b] - s[a]
    v = np.where(dt > 1e-4, ds / np.maximum(dt, 1e-4), np.nan)
    if np.all(np.isnan(v)):
        return None
    med = np.nanmedian(v)
    return np.where(np.isnan(v), med, v)


def _geste(P: np.ndarray, rng, *, taille: float, diam: float, appui: float, repasse: bool = False):
    """Points lissés (m, 3) [x, y, t] px → (n, 4) [x, y, pression, vitesse brute (px/s ou nan)]."""
    Q = _catmull_rom(P, 0.35)
    s = _arc(Q)
    L = float(s[-1])
    n = len(Q)
    X, Y = Q[:, 0].copy(), Q[:, 1].copy()
    # tremblé lent de la main, perpendiculaire au trait (amplitude absolue : la main tremble
    # pareil pour une icône et pour un grand dessin)
    if n > 2:
        dx, dy = np.gradient(X), np.gradient(Y)
        nn = np.hypot(dx, dy) + 1e-9
        nx, ny = -dy / nn, dx / nn
        amp = float(np.clip(0.0032 * taille, 0.16, 0.55)) * (1.25 if repasse else 1.0)
        per = max(6.0, 0.07 * taille) / 0.35  # en échantillons
        w = _bruit1(rng, n, per, amp) + _bruit1(rng, n, per / 3.5, amp * 0.3)
        X, Y = X + nx * w, Y + ny * w
    v = _vitesse(Q, s)
    u = s / max(L, 1e-6)
    # pression : attaque appuyée, corps, relâché ; plus légère quand ça file
    p = appui + _bruit1(rng, n, max(8, n / 6), 0.045)
    if not repasse:
        p = p + 0.2 * np.exp(-(s / (1.4 * diam + 0.4)) ** 2)
    p = p * (0.7 + 0.3 * np.clip((L - s) / (2.2 * diam + 0.6), 0, 1))
    return np.column_stack([X, Y, p, v if v is not None else np.full(n, np.nan)]), u


def _transformer(traits, boite, rng, angle):
    """Traits normalisés → px de page dans la boîte (proportions conservées, rotation, nouvelle
    main levée : légère déformation lente propre à la graine)."""
    A = np.vstack([T[:, :2] for T in traits])
    c = (A.min(0) + A.max(0)) / 2
    ext = float(max(np.ptp(A[:, 0]), np.ptp(A[:, 1]), 1e-6))
    # déformation lente (la même personne redessine : jamais deux fois pareil)
    sx, sy = rng.normal(1, 0.035), rng.normal(1, 0.035)
    cis = rng.normal(0, 0.035)
    kx = rng.normal(0, 1, (3, 3)) * 0.012 * ext
    ky = rng.normal(0, 1, (3, 3)) * 0.012 * ext

    def warp(Pn):
        q = (Pn - c) / ext  # ≈ [-0.5, 0.5]
        gx = np.clip((q[:, 0] + 0.5) * 2, 0, 2)
        gy = np.clip((q[:, 1] + 0.5) * 2, 0, 2)
        ix = np.clip(gx.astype(int), 0, 1)
        iy = np.clip(gy.astype(int), 0, 1)
        fx, fy = gx - ix, gy - iy

        def bil(K):
            return (K[iy, ix] * (1 - fx) * (1 - fy) + K[iy, ix + 1] * fx * (1 - fy)
                    + K[iy + 1, ix] * (1 - fx) * fy + K[iy + 1, ix + 1] * fx * fy)
        x = (Pn[:, 0] - c[0]) * sx + cis * (Pn[:, 1] - c[1]) + bil(kx)
        y = (Pn[:, 1] - c[1]) * sy + bil(ky)
        return np.column_stack([x, y])

    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)
    tour = []
    for T in traits:
        q = warp(T[:, :2])
        r = np.column_stack([q[:, 0] * ca - q[:, 1] * sa, q[:, 0] * sa + q[:, 1] * ca])
        tour.append(r)
    B = np.vstack(tour)
    bw, bh = float(np.ptp(B[:, 0])), float(np.ptp(B[:, 1]))
    x, y, w, h = boite
    s = min(w / max(bw, 1e-6), h / max(bh, 1e-6)) * float(rng.uniform(0.93, 1.0))
    jx = (w - bw * s) * float(rng.uniform(0.3, 0.7))
    jy = (h - bh * s) * float(rng.uniform(0.3, 0.7))
    ox = x + jx - B[:, 0].min() * s
    oy = y + jy - B[:, 1].min() * s
    out = []
    for T, r in zip(traits, tour):
        out.append(np.column_stack([ox + r[:, 0] * s, oy + r[:, 1] * s, T[:, 2]]))
    taille = max(bw, bh) * s
    return out, taille, (ox, oy, s, ca, sa, c, warp)


def _pen(main: str, encre: str, outil: str | None, xh: float | None):
    import ecriture as ECR
    import mise_en_page as MEP
    info = ECR.main_info(main)
    if xh is None:
        xh = MEP.ROLES["corps"] * MEP.W * info["taille"]
    enc = ECR.nuances(encre, outil)
    return info, float(xh), enc


def dessiner(nom: str, *, boite, encre: str = "feutre", graine: int = 1, lavis: bool = True,
             main: str | None = None, outil: str | None = None, variante: str | int | None = None,
             angle: float | None = None, xh: float | None = None, repasse: float = 1.0) -> dict:
    """Un croquis dans la boîte (x, y, w, h) en px de page 850 × 960.

    - `encre` : encre de l'invité (plume, brune, noire, bic, crayon, feutre, rouge, chocolat) ;
      `outil` : outil s'il diffère de celui de l'encre ; `main` : main de l'invité (épaisseur du
      stylo ; par défaut la main habituelle de cette encre) ; `xh` : hauteur d'x du corps de
      texte de l'invité (px de page), pour que le stylo ait la même largeur que dans l'écriture.
    - `graine` : variante (sauf `variante=`), rotation, déformation, tremblé, lavis.
    - `variante` : nom (« a ») ou indice ; pour une liste à puces, fixez-la (voir choisir_variante).
    - `angle` : rotation en degrés (défaut : tirée, ± 6°).
    - `repasse` : facteur sur la probabilité de repasser un trait (0 : jamais).

    → {'traits': [[(x, y, p, v, e), …], …], 'lavis': [...], 'boite': (x, y, w, h), 'diam', 'encre',
       'nom', 'variante', 'angle', 'taille'}"""
    import ecriture as ECR

    x, y, w, h = map(float, boite)
    taille_boite = max(w, h)
    if variante is None:
        v = choisir_variante(nom, graine, taille_boite)
    elif isinstance(variante, int):
        vs = variantes(nom)
        v = vs[variante % len(vs)]
    else:
        v = variante
    d = _charger(nom, v)
    rng = _rng("croquis", nom, v, int(graine))
    main = main or _MAIN_DE_L_ENCRE.get(encre, "soignee")
    info, xh_v, enc = _pen(main, encre, outil, xh)
    diam = info["epaisseur"] * xh_v
    if angle is None:
        angle = float(np.clip(rng.normal(0, 2.6), -6, 6))
    traits, taille, geo = _transformer(d["_traits"], (x, y, w, h), rng, angle)

    appui = float(rng.uniform(0.72, 0.84))
    bruts = []
    vits = []
    longs = [float(_arc(T)[-1]) for T in traits]
    total = sum(longs) or 1.0
    repasses = 0
    for k, T in enumerate(traits):
        G, u = _geste(T, rng, taille=taille, diam=diam, appui=appui)
        bruts.append(G)
        vits.append(G[:, 3])
        # parfois un trait repassé (contour principal surtout), une fois par dessin au plus le plus souvent
        part = longs[k] / total
        proba = repasse * (0.22 if part > 0.3 else 0.07) * (0.35 if repasses else 1.0)
        if len(T) > 2 and longs[k] > 4 * diam and rng.random() < proba:
            repasses += 1
            a0 = float(rng.uniform(0.0, 0.35))
            a1 = float(rng.uniform(max(a0 + 0.35, 0.6), 1.0))
            Q = _catmull_rom(T, 0.35)
            sQ = _arc(Q) / max(_arc(Q)[-1], 1e-6)
            m = (sQ >= a0) & (sQ <= a1)
            if m.sum() > 4:
                Q = Q[m]
                dx, dy = np.gradient(Q[:, 0]), np.gradient(Q[:, 1])
                nn = np.hypot(dx, dy) + 1e-9
                dec = (rng.choice([-1, 1]) * rng.uniform(0.5, 1.0) * diam
                       + _bruit1(rng, len(Q), max(10, len(Q) / 3), 0.35 * diam))
                Q2 = Q.copy()
                Q2[:, 0] += -dy / nn * dec
                Q2[:, 1] += dx / nn * dec
                Q2 = Q2[::3] if len(Q2) > 9 else Q2
                G2, _ = _geste(Q2, rng, taille=taille, diam=diam, appui=appui * 0.88, repasse=True)
                bruts.append(G2)
                vits.append(G2[:, 3])
    # vitesse relative (1 = médiane du dessin) ; sans temps : lente aux bouts, vive au milieu
    tout = np.concatenate([vv for vv in vits if len(vv)])
    med = np.nanmedian(tout) if np.any(~np.isnan(tout)) else np.nan
    sortie_xh = []
    for G in bruts:
        s = _arc(G)
        L = float(s[-1]) or 1.0
        uu = s / L
        prof = 0.6 + 0.65 * np.sin(np.pi * np.clip(uu, 0, 1)) ** 0.7
        if np.isnan(med) or np.all(np.isnan(G[:, 3])):
            vr = prof
        else:
            vr = np.where(np.isnan(G[:, 3]), prof, G[:, 3] / med)
            vr = 0.55 * vr + 0.45 * prof  # le temps d'écran est bruité : mêlé au profil d'un geste
        vr = np.clip(vr, 0.35, 2.0)
        p = np.clip(G[:, 2] - 0.1 * np.clip(vr - 1, 0, 1) + 0.05 * np.clip(1 - vr, 0, 1), 0.15, 1.0)
        sortie_xh.append(np.column_stack([G[:, 0] / xh_v, G[:, 1] / xh_v, p, vr]))
    encres = ECR.encrer_traits(sortie_xh, enc["id"], enc["outil"], _graine("encre", nom, v, int(graine)) % (2**31), main)
    out_traits = []
    for T in encres:
        P = np.asarray(T, float).copy()
        P[:, 0] *= xh_v
        P[:, 1] *= xh_v
        out_traits.append([tuple(round(float(c), 3) for c in pt) for pt in P])
    res = {
        "nom": nom, "variante": v, "angle": round(angle, 2), "taille": round(taille, 2),
        "boite": (x, y, w, h), "diam": round(diam, 4), "encre": enc,
        "traits": out_traits,
        "lavis": _lavis(d, traits, taille, rng, nom, v, graine) if lavis else [],
    }
    return res


def traces(dessin: dict):
    """→ [mise_en_page.Trace] (px de page) prêts pour rendu_encre.rasteriser."""
    import mise_en_page as MEP
    return [MEP.Trace(np.asarray(t, float), float(dessin["diam"]), dict(dessin["encre"]))
            for t in dessin["traits"] if len(t)]


# =============================================================================================
# Lavis : description (JSON) puis transmittance
# =============================================================================================
def _lavis(d: dict, traits_px, taille: float, rng, nom, v, graine) -> list:
    """Touches d'aquarelle de la variante, en px de page (après transformation)."""
    specs = d.get("lavis", [])
    if not specs:
        return []
    # décalage commun (un seul geste de pinceau, même main) : 3 à 6 px selon la taille
    # (une icône de la hauteur d'une ligne, ≈ 30 px, garde un décalage proportionné : 2,2 à 3 px)
    mag = float(np.clip(1.5 + 0.022 * taille, 2.2, 6.0)) * float(rng.uniform(0.9, 1.08))
    mag = float(np.clip(mag, 2.2, 6.0))
    ang0 = float(rng.uniform(0, 2 * math.pi))
    touche_c, touche_d = (1.0, 1.0) if taille < 45 else (TOUCHE_COUVERTURE, TOUCHE_DENSITE)
    out = []
    for k, sp in enumerate(specs):
        teinte = sp.get("teinte", "carotte")
        hexa = TEINTES.get(teinte, teinte if teinte.startswith("#") else "#d9a15e")
        ang = ang0 + float(rng.normal(0, 0.5))
        m = mag * float(sp.get("decalage", 1.0)) * float(rng.uniform(0.85, 1.1))
        m = float(np.clip(m, 2.2, 6.0)) if sp.get("decalage", 1.0) > 0 else 0.0
        item = {
            "teinte": hexa,
            "nom": teinte,
            "mode": sp.get("mode", "remplir"),
            "decalage": [round(m * math.cos(ang), 2), round(m * math.sin(ang), 2)],
            "couverture": float(sp.get("couverture", rng.uniform(0.62, 0.8))) * touche_c,
            "densite": float(sp.get("densite", 1.0)) * float(rng.uniform(0.88, 1.08)) * touche_d,
            "reflet": bool(sp.get("reflet", True)),
            "taille": round(taille, 2),
            "graine": int(_graine("lavis", nom, v, int(graine), k) % (2**31)),
        }
        if item["mode"] in ("remplir", "trait"):
            idx = sp.get("traits", list(range(len(traits_px))))
            item["chemins"] = [[[round(float(a), 2), round(float(b), 2)] for a, b in _catmull_rom(traits_px[i], 1.0)[:, :2]]
                               for i in idx if i < len(traits_px)]
            if item["mode"] == "trait":
                item["largeur"] = round(float(sp.get("largeur", 0.07)) * taille, 2)
        else:
            # polygone ou tache, coordonnées normalisées de la variante → page (même transformation)
            if item["mode"] == "tache":
                cx, cy = sp["centre"]
                rx, ry = sp["rayon"] if isinstance(sp["rayon"], (list, tuple)) else (sp["rayon"], sp["rayon"])
                th = np.linspace(0, 2 * math.pi, 40, endpoint=False)
                pts = np.column_stack([cx + rx * np.cos(th), cy + ry * np.sin(th)])
            else:
                pts = np.asarray(sp["points"], float)
            item["chemins"] = [_vers_page(d, traits_px, pts)]
            item["mode"] = "polygone"
        if sp.get("trous"):  # contours à laisser blancs (trou d'un donut)
            item["trous"] = [[[round(float(a), 2), round(float(b), 2)] for a, b in _catmull_rom(traits_px[i], 1.0)[:, :2]]
                             for i in sp["trous"] if i < len(traits_px)]
        if sp.get("dans"):  # le lavis reste dans cette zone (coordonnées de la variante)
            item["dans"] = _vers_page(d, traits_px, np.asarray(sp["dans"], float))
        out.append(item)
    return out


def _vers_page(d, traits_px, pts):
    """Points normalisés de la variante → px de page, par la transformation affine qui envoie les
    points des traits normalisés sur les traits posés (moindres carrés : rotation, échelle,
    déformation lente comprises en moyenne)."""
    A = np.vstack([T[:, :2] for T in d["_traits"]])
    B = np.vstack([T[:, :2] for T in traits_px])
    M = np.column_stack([A, np.ones(len(A))])
    coef, *_ = np.linalg.lstsq(M, B, rcond=None)
    P = np.column_stack([pts, np.ones(len(pts))]) @ coef
    return [[round(float(a), 2), round(float(b), 2)] for a, b in P]


def _do(hexa: str) -> np.ndarray:
    import rendu_encre as R
    P = R.vers_lin(R.hex_rgb(PAPIER_REF))
    C = R.vers_lin(R.hex_rgb(hexa))
    return (-np.log(np.clip(C / P, 1e-4, 1.0))).astype(np.float32)


SATURATION_MAX = 0.65  # saturation HSV visée au plus fort d'un lavis sur le papier de référence (contrat : ≤ 70 %)


@functools.lru_cache(maxsize=None)
def _dmax(hexa: str) -> float:
    """Densité au-delà de laquelle la teinte, posée sur le papier de référence, dépasserait
    SATURATION_MAX (recherche par dichotomie, en sRGB comme on la mesure)."""
    import rendu_encre as R
    P = R.vers_lin(R.hex_rgb(PAPIER_REF))
    DO = _do(hexa)

    def sat(d):
        c = R.vers_srgb(P * np.exp(-d * DO))
        return float((c.max() - c.min()) / max(c.max(), 1e-6))
    if sat(4.0) <= SATURATION_MAX:
        return 4.0
    a, b = 0.0, 4.0
    for _ in range(40):
        m = (a + b) / 2
        a, b = (m, b) if sat(m) <= SATURATION_MAX else (a, m)
    return a


def _plafond(d: np.ndarray, dmax: float) -> np.ndarray:
    """Identité jusqu'à 70 % de dmax, puis approche douce de dmax (jamais au-delà)."""
    k = 0.7 * dmax
    haut = k + (dmax - k) * np.tanh((d - k) / max(dmax - k, 1e-6))
    return np.where(d <= k, d, haut).astype(np.float32)


def _dehors(libre: np.ndarray) -> np.ndarray:
    """Pixels libres reliés au bord de la fenêtre (remplissage par propagation de segments,
    lignes puis colonnes, jusqu'à stabilité)."""
    O = np.zeros_like(libre)
    O[0, :] = libre[0, :]
    O[-1, :] = libre[-1, :]
    O[:, 0] = libre[:, 0]
    O[:, -1] = libre[:, -1]
    for _ in range(200):
        avant = int(O.sum())
        for trans in (False, True):
            A = libre.T if trans else libre
            Oa = O.T if trans else O
            h, w = A.shape
            flat = np.ascontiguousarray(A).ravel()
            of = np.ascontiguousarray(Oa).ravel()
            brk = np.ones(h * w, bool)
            brk[1:] = flat[1:] != flat[:-1]
            brk[::w] = True
            ids = np.cumsum(brk) - 1
            has = np.bincount(ids, weights=(of & flat).astype(float), minlength=int(ids[-1]) + 1) > 0
            nouv = (has[ids] & flat).reshape(h, w)
            O = nouv.T if trans else nouv
        if int(O.sum()) == avant:
            break
    return O


def _masque(item: dict, x0: int, y0: int, hh: int, ww: int, echelle: float) -> np.ndarray:
    """Masque (hh, ww) float de la forme à laver, déjà décalée, en pixels de sortie (trous et zone
    de restriction appliqués)."""
    from PIL import Image, ImageDraw
    M = _masque_forme(item, item["chemins"], item["mode"], x0, y0, hh, ww, echelle)
    if item.get("trous"):
        T = _masque_forme(item, item["trous"], "remplir", x0, y0, hh, ww, echelle, mur_plein=False)
        M = M * (1 - T)
    if item.get("dans"):
        dx, dy = item["decalage"]
        im = Image.new("L", (ww, hh), 0)
        ImageDraw.Draw(im).polygon([((a + dx) * echelle - x0, (b + dy) * echelle - y0) for a, b in item["dans"]], fill=255)
        M = M * (np.asarray(im, np.float32) / 255.0)
    return M


def _masque_forme(item: dict, chemins, mode, x0: int, y0: int, hh: int, ww: int, echelle: float,
                  mur_plein: bool = True) -> np.ndarray:
    from PIL import Image, ImageDraw
    dx, dy = item["decalage"]
    taille = float(item["taille"]) * echelle

    def pts(ch):
        return [((a + dx) * echelle - x0, (b + dy) * echelle - y0) for a, b in ch]

    im = Image.new("L", (ww, hh), 0)
    dr = ImageDraw.Draw(im)
    if mode == "polygone":
        for ch in chemins:
            if len(ch) > 2:
                dr.polygon(pts(ch), fill=255)
        return np.asarray(im, np.float32) / 255.0
    if mode == "trait":
        lg = max(2, int(round(float(item.get("largeur", 4)) * echelle)))
        for ch in chemins:
            p = pts(ch)
            if len(p) > 1:
                dr.line(p, fill=255, width=lg, joint="curve")
            r = lg / 2
            for q in (p[0], p[-1]):
                dr.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=255)
        return np.asarray(im, np.float32) / 255.0
    # remplir : intérieur du contour formé par les traits (petites ouvertures refermées)
    lg = max(2, int(round(max(0.05 * taille, 2.2 * echelle))))
    for ch in chemins:
        p = pts(ch)
        if len(p) > 1:
            dr.line(p, fill=255, width=lg, joint="curve")
    mur = np.asarray(im) > 0
    dedans = ~_dehors(~mur)
    if not mur_plein:  # trou : l'intérieur seul, sans l'épaisseur du mur
        dedans = dedans & ~mur
    aire_mur = mur.sum()
    if dedans.sum() < 1.6 * aire_mur:
        # contour trop ouvert : on le referme (chaîne des traits par leurs bouts les plus proches)
        im2 = Image.new("L", (ww, hh), 0)
        dr2 = ImageDraw.Draw(im2)
        chaine = _chainer([pts(ch) for ch in chemins if len(ch) > 1])
        if len(chaine) > 2:
            dr2.polygon(chaine, fill=255)
        dedans = (np.asarray(im2) > 0) | mur
    return dedans.astype(np.float32)


def _chainer(chemins):
    if not chemins:
        return []
    reste = [list(c) for c in chemins]
    out = reste.pop(0)
    while reste:
        fin = np.array(out[-1])
        best, k, inv = 1e18, 0, False
        for i, c in enumerate(reste):
            for j, q in ((False, c[0]), (True, c[-1])):
                dd = float(np.hypot(*(np.array(q) - fin)))
                if dd < best:
                    best, k, inv = dd, i, j
        c = reste.pop(k)
        out += c[::-1] if inv else c
    return out


def _smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _peindre(T: np.ndarray, item: dict, echelle: float, relief: np.ndarray | None, lumiere=None):
    import rendu_encre as R
    Hh, Ww = T.shape[:2]
    rng = np.random.default_rng(int(item["graine"]))
    toutes = np.array([p for ch in item["chemins"] for p in ch], float)
    if len(toutes) == 0:
        return
    dx, dy = item["decalage"]
    taille = float(item["taille"])
    marge = (abs(dx) + abs(dy) + 0.2 * taille + 8) * echelle
    x0 = int(max(0, math.floor((toutes[:, 0].min() + dx) * echelle - marge)))
    y0 = int(max(0, math.floor((toutes[:, 1].min() + dy) * echelle - marge)))
    x1 = int(min(Ww, math.ceil((toutes[:, 0].max() + dx) * echelle + marge)))
    y1 = int(min(Hh, math.ceil((toutes[:, 1].max() + dy) * echelle + marge)))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return
    hh, ww = y1 - y0, x1 - x0
    M = _masque(item, x0, y0, hh, ww, echelle)
    aire = float(M.sum())
    if aire < 4:
        return
    s = taille * echelle  # taille du dessin en px de sortie
    # étendue propre de la forme (pour le reflet et le gradient)
    ys, xs = np.nonzero(M > 0.5)
    fx0, fx1, fy0, fy1 = xs.min(), xs.max(), ys.min(), ys.max()
    fw, fh = max(fx1 - fx0, 2), max(fy1 - fy0, 2)
    fs = max(fw, fh)
    # 1) bord qui bave : forme adoucie + bruit lent
    Mb = R.flou(M, max(1.0, 0.035 * fs))
    n1 = _bruit2(rng, hh, ww, max(3.0, 0.22 * fs))
    pres = np.clip(R.flou(M, max(1.5, 0.08 * fs)) * 3, 0, 1)  # le bruit n'agit que près de la forme
    champ = Mb + 0.15 * n1 * pres
    # 2) le papier respire : reflet laissé en blanc côté lumière (haut à gauche)
    yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
    if item.get("reflet", True) and fs > 10 * echelle:
        rx = fx0 + fw * float(rng.uniform(0.22, 0.4))
        ry = fy0 + fh * float(rng.uniform(0.18, 0.36))
        rr = 0.17 * fs * float(rng.uniform(0.8, 1.2))
        g = np.exp(-(((xx - rx) / (rr * 1.25)) ** 2 + ((yy - ry) / rr) ** 2) / 2)
        champ = champ - float(rng.uniform(0.45, 0.75)) * g
    # 3) couverture partielle visée : seuil = quantile
    cible = float(np.clip(item.get("couverture", 0.72), 0.2, 1.0)) * aire
    vals = np.sort(champ.ravel())[::-1]
    k = int(np.clip(cible, 1, len(vals) - 1))
    seuil = float(np.clip(vals[k], 0.22, 0.8))
    B = (champ > seuil).astype(np.float32)
    # pinceau sec : un ou deux manques allongés dans le sens du geste (une fois sur deux)
    if rng.random() < 0.5 and fs > 14 * echelle:
        a = float(rng.uniform(0, math.pi))
        for _ in range(int(rng.integers(1, 3))):
            ix = int(rng.integers(len(xs)))
            cx, cy = xs[ix], ys[ix]
            lg, ep = 0.16 * fs * float(rng.uniform(0.7, 1.3)), 0.035 * fs * float(rng.uniform(0.7, 1.3))
            u = (xx - cx) * math.cos(a) + (yy - cy) * math.sin(a)
            w_ = -(xx - cx) * math.sin(a) + (yy - cy) * math.cos(a)
            B *= 1 - 0.95 * (((u / lg) ** 2 + (w_ / ep) ** 2) < 1)
    Wm = R.flou(B, 0.55 * echelle)  # bord net de lavis (≈ 1 px)
    # 4) pigment inégal : flaques lentes, accumulation vers le bas (et au bout du geste)
    n3 = _bruit2(rng, hh, ww, max(3.0, 0.3 * fs))
    yrel = np.clip((yy - fy0) / fh, 0, 1)
    dens = np.clip(0.66 + 0.2 * n3, 0.35, 1.05) * (0.86 + 0.3 * yrel)
    # 5) auréole : le bord sèche plus foncé
    E = np.clip(Wm - R.flou(Wm, 1.5 * echelle), 0, 1)
    E = E / (E.max() + 1e-6)
    dens = dens * (1 + float(rng.uniform(0.9, 1.3)) * E)
    # 6) granulation dans les creux du papier + floculation fine
    if relief is not None:
        rel = relief[y0:y1, x0:x1]
        dens = dens * np.clip(1 - 0.24 * rel, 0.5, 1.6)
    fin = R.flou(rng.normal(0, 1, (hh, ww)).astype(np.float32), 0.6 * echelle)
    fin /= fin.std() + 1e-6
    dens = np.clip(dens * (1 + 0.09 * fin), 0, 1.8)  # jamais d'encre : l'auréole reste un lavis
    d = _plafond(float(item.get("densite", 1.0)) * Wm * dens, _dmax(item["teinte"]))
    Tp = np.exp(-d[..., None] * _do(item["teinte"])[None, None, :])
    if lumiere is not None:
        lam = lumiere[y0:y1, x0:x1]
        lp = np.clip(lam, 0, 1)[..., None] * R.LUMIERE
        Tp = np.minimum(Tp * (1 + lp * (R.CHAUD - 1)), 1.0)
    T[y0:y1, x0:x1] *= Tp.astype(np.float32)


def transmittance_lavis(lavis: list, forme, echelle: float, relief: np.ndarray | None = None,
                        lumiere: np.ndarray | None = None) -> np.ndarray:
    """Transmittance (H, W, 3) des touches d'aquarelle, en lumière linéaire, à multiplier avec celle
    de l'encre (rendu_encre.transmittance) avant la composition sur le papier.

    - `lavis` : la liste `dessin['lavis']` (ou plusieurs listes concaténées), px de page ;
    - `forme` : (H, W) de la sortie ; `echelle` : px de sortie par px de page (2 à la cuisson) ;
    - `relief` : relief du papier (rendu_encre.relief du papier exactement dessous, même forme) ;
    - `lumiere` : carte λ facultative (rendu_encre.lumiere_carte) : lavis un peu plus chaud dans la
      lumière."""
    Hh, Ww = int(forme[0]), int(forme[1])
    T = np.ones((Hh, Ww, 3), np.float32)
    for item in lavis or []:
        _peindre(T, item, float(echelle), relief, lumiere)
    _borner_saturation(T)
    return T


def _borner_saturation(T: np.ndarray, cible: float = SATURATION_MAX) -> None:
    """Là où des lavis se superposent, la couleur posée sur le papier de référence ne dépasse pas
    `cible` de saturation : T est rapproché (en place) du gris de même luminance, juste assez."""
    import rendu_encre as R
    m = T.min(axis=2) < 0.995
    if not m.any():
        return
    P = R.vers_lin(R.hex_rgb(PAPIER_REF)).astype(np.float32)
    w = np.array([0.2126, 0.7152, 0.0722], np.float32) * P
    t = T[m]
    g = (t @ w / w.sum())[:, None]

    def sat(a):
        c = R.vers_srgb(P * (g + a[:, None] * (t - g)))
        return (c.max(1) - c.min(1)) / np.maximum(c.max(1), 1e-6)
    trop = sat(np.ones(len(t), np.float32)) > cible
    if not trop.any():
        return
    t, g = t[trop], g[trop]
    lo, hi = np.zeros(len(t), np.float32), np.ones(len(t), np.float32)
    for _ in range(14):
        mid = (lo + hi) / 2
        c = R.vers_srgb(P * (g + mid[:, None] * (t - g)))
        ok = (c.max(1) - c.min(1)) / np.maximum(c.max(1), 1e-6) <= cible
        lo = np.where(ok, mid, lo)
        hi = np.where(ok, hi, mid)
    idx = np.flatnonzero(m.ravel())[trop]
    flat = T.reshape(-1, 3)
    flat[idx] = g + lo[:, None] * (t - g)


def couverture_lavis(T: np.ndarray) -> np.ndarray:
    """Couverture (H, W) d'une transmittance de lavis (pour réunir avec celle de l'encre)."""
    return np.clip((1 - T.min(axis=2)) * 6, 0, 1).astype(np.float32)


# =============================================================================================
# Rendu autonome (planches) : mêmes fonctions que la cuisson des pages, importées telles quelles
# =============================================================================================
def rendre(elements, papier_u8: np.ndarray, echelle: float = 2.0, graine: int = 7,
           lumiere: str | None = None) -> np.ndarray:
    """Compose des dessins (dicts de `dessiner`) et/ou des listes de mise_en_page.Trace sur un papier
    (H, W, 3) uint8 dont les pixels valent `echelle` px de sortie par px de page. → RGB uint8."""
    import feuillets as PAP
    import rendu_encre as R
    h, w = papier_u8.shape[:2]
    rel = R.relief(papier_u8)
    bruit = PAP.grain_bruit(papier_u8, rel, np.random.default_rng(graine))
    tr, lav = [], []
    for el in elements:
        if isinstance(el, dict):
            tr += traces(el)
            lav += el.get("lavis", [])
        else:
            tr += list(el)
    lam = R.lumiere_carte(w, h, lumiere) if lumiere else None
    cartes = R.rasteriser(tr, w, h, echelle, bruit)
    Rt, _ = R.transmittance(cartes, rel, lam)
    Rt = Rt * transmittance_lavis(lav, (h, w), echelle, rel, lam)
    out = R.vers_srgb(R.vers_lin(papier_u8) * Rt)
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def papier(larg: int, haut: int, source: str = "wellcome-ms4489-i51-verge-creme", x: float = 0.5,
           y: float = 0.3, graine: int = 11, teinte=(2, 1, -1)) -> np.ndarray:
    """Un morceau de vrai papier (design-system/sources/papier) au grain des pages cuites (2×)."""
    import feuillets as PAP
    cfg = {"source": source, "echelle": 0.54, "x": x, "y": y, "rotation": 0, "teinte": list(teinte),
           "graine": graine, "bords": {"exterieur": 0.0, "tete": 0.0, "pied": 0.0, "reliure": 0.0}}
    return PAP.feuillet(cfg, larg, haut, RACINE / "design-system/sources/papier")
