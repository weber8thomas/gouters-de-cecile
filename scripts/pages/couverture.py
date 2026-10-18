"""Couverture du carnet, cuite comme les pages (lot C, plan v4).

    tools/ecriture/.venv/bin/python scripts/pages/couverture.py [--variantes a,b,c] [--indices] [--planche]
                                                              [--reecrire] [--sans-cuisson] [--sources]

La couverture est faite des mêmes matières que les pages : de VRAIES reliures anciennes scannées
(Wellcome Collection, Public Domain Mark, voir design-system/sources/couverture/*.licence.md), une
étiquette en vrai papier ancien (design-system/sources/papier), le titre écrit trait par trait par
l'outil d'écriture (scripts/pages/ecriture.py, lecture seule) et un croquis (scripts/pages/croquis.py,
lecture seule), l'encre « bue » par le papier (scripts/pages/rendu_encre.py, lecture seule).

Variantes (planche du GATE) :
  a — toile de reliure vert sauge (Beeton, 1899) + étiquette papier collée (cadre imprimé terracotta),
      titre « Les goûters de Cécile » à la plume (main du carnet `soignee` + `plume`) et une théière ;
  b — carton marbré (vrai papier peigné du « Receipt Book of Jane Freestone », 1843) avec dos et coins
      toilés (toile verte, Crawford 1853) + étiquette papier (cadre bleu), un cupcake ;
  c — toile bleu passé (Haultain, 1894), titre écrit directement sur la toile au feutre peinture crème
      (main `cecile`), un petit cupcake au même feutre.

Produit, pour chaque variante v (2× = netteté ; 1× = écrans de densité 1), dans design-system/baked/couverture/v/ :
  plat         plat avant (868 × 982 px de référence = page 850 × 960 + débords du carton 18 / 6 / 16), RGBA
  arriere      plat arrière (vu de l'extérieur : dos à droite), RGBA
  contreplat   intérieur du plat, livre ouvert (bord extérieur à gauche, mors à droite) : rempli de toile
               et garde collée (garde-uni / garde-marbre de papiers.json si Pa les fournit, sinon sources)
  dos          dos arrondi (largeur = épaisseur du livre, haut en haut), RGBA
  chant        tranche du carton (10 px de référence), toile repliée sur le bord
  tranche      gouttière : l'épaisseur des pages vue de côté (bloc de 24 px × hauteur de page), RGBA
  tranche-pied la même vue d'en bas (largeur de page × bloc), RGBA
  etiquette    étiquette collée (a, b) : papier découpé, cadre imprimé, titre, croquis, ombre cuite, déjà
               tournée ; posée par <EtiquetteCouverture> au rectangle du manifeste (fractions du plat)
et 1x/<partie>.webp. Indices « … pour ouvrir » au crayon (main `cecile`) : design-system/baked/indices/
{toucher,cliquer,entree}.webp (un petit billet de papier écrit au crayon, fond transparent autour, ombre cuite)
et {…}-crayon.webp (le crayon seul, fond transparent, pour un fond de papier clair).

Manifeste : src/components/Couverture/couverture.json (lu par le composant Couverture).
Planche : verification/out/v4-c/couvertures.png (--planche ; capture Playwright de planche.html).

Déterministe. L'écriture et les croquis sont figés dans design-system/sources/couverture/{ecriture,croquis}/
(JSON) : la couverture ne change pas quand l'outil d'écriture évolue (--reecrire pour les refaire).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ICI = Path(__file__).resolve().parent
if str(ICI) not in sys.path:
    sys.path.insert(0, str(ICI))
RACINE = ICI.parents[1]

import rendu_encre as R  # noqa: E402  (lecture seule : lot P2)

SOURCES = RACINE / "design-system/sources/couverture"
SOURCES_PAPIER = RACINE / "design-system/sources/papier"
SORTIE = RACINE / "design-system/baked/couverture"
SORTIE_INDICES = RACINE / "design-system/baked/indices"
MANIFESTE = RACINE / "src/components/Couverture/couverture.json"
PAPIERS = RACINE / "src/content/pages/papiers.json"
ORIGINAUX = RACINE / "verification/out/v4-c/originaux"
VERIF = RACINE / "verification/out/v4-c"

# ---- géométrie (px de la page de référence, comme les pages cuites) -------------------------
ECH = 2
PAGE_W, PAGE_H = 850, 1200
OUT, HAUT, BAS, EP = 18, 6, 16, 10  # débords du carton (Livre.css --gc-livre-carton-*), épaisseur du carton
PLAT_W, PLAT_H = PAGE_W + OUT, PAGE_H + HAUT + BAS  # 868 × 982
BLOC = 40  # épaisseur du bloc de pages (≈ 80 feuillets d'un papier épais : 8 mm pour un plat de 17 cm)
DOS_W = int(round(1.18 * (BLOC + 2 * EP)))  # dos arrondi : un peu plus large que l'épaisseur
PW, PH = PLAT_W * ECH, PLAT_H * ECH
Q_TOILE, Q_ALPHA = 80, 90
# Variante retenue (plan v4, sans GATE : choix du lot C). Elle seule est cuite dans design-system/baked/ ;
# les autres (comparaison) vont dans verification/out/v4-c/variantes/ et ne partent ni sur le site ni dans l'artifact.
ACTIVE = "a"
BAKED = RACINE / "design-system/baked"
COMPAREES = VERIF / "variantes"


def dossier_de(v: str) -> Path:
    return BAKED if v == ACTIVE else COMPAREES


def url_de(v: str) -> str:
    return "/design-system/baked" if v == ACTIVE else "/verification/out/v4-c/variantes"
PAPIER_REF = "#eee1bf"


# =============================================================================================
# Outils
# =============================================================================================
@dataclass
class Trace:
    """Même forme que mise_en_page.Trace (lue par rendu_encre.rasteriser)."""
    pts: np.ndarray  # (n, 5) x, y, pression, vitesse, encre — px de référence
    diam: float
    encre: dict


def _graine(*parts) -> int:
    return int.from_bytes(hashlib.sha256(repr(parts).encode()).digest()[:8], "little") % (2 ** 31)


def rng_de(*parts) -> np.random.Generator:
    return np.random.default_rng(_graine(*parts))


def bruit(rng, h, w, echelle) -> np.ndarray:
    """Bruit lisse ≈ N(0, 1), longueur de corrélation `echelle` px."""
    e = max(1.0, float(echelle))
    gh, gw = int(h / e) + 3, int(w / e) + 3
    g = rng.normal(0, 1, (gh, gw)).astype(np.float32)
    m = int(e)
    a = np.asarray(Image.fromarray(g, mode="F").resize((w + 2 * m, h + 2 * m), Image.BICUBIC))[m:m + h, m:m + w]
    return (a - a.mean()) / (a.std() + 1e-6)


def lum(T: np.ndarray) -> np.ndarray:
    return T @ np.array([0.299, 0.587, 0.114], np.float32)


def desaturer(T: np.ndarray, garde: float) -> np.ndarray:
    L = lum(T)[..., None]
    return L + (T - L) * garde


def hexrgb(c: str) -> np.ndarray:
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def rgbhex(v) -> str:
    return "#%02x%02x%02x" % tuple(int(np.clip(round(float(x)), 0, 255)) for x in v)


def u8(T: np.ndarray) -> np.ndarray:
    return np.clip(np.round(T), 0, 255).astype(np.uint8)


def charger(nom: str) -> np.ndarray:
    return np.asarray(Image.open(SOURCES / f"{nom}.jpg").convert("RGB")).astype(np.float32)


def fenetre(img: np.ndarray, w: int, h: int, cx=0.5, cy=0.5, zoom=1.0, miroir=False, tourne=0) -> np.ndarray:
    """La plus grande découpe de proportion w/h (÷ zoom), placée en fractions (cx, cy), rééchantillonnée."""
    im = Image.fromarray(u8(img))
    if tourne:
        im = im.rotate(tourne, expand=True)
    W, H = im.size
    asp = w / h
    cw = min(W, H * asp) / zoom
    ch = cw / asp
    x0 = (W - cw) * cx
    y0 = (H - ch) * cy
    out = im.resize((w, h), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))
    a = np.asarray(out).astype(np.float32)
    return a[:, ::-1].copy() if miroir else a


def flou(a, s):
    return R.flou(np.asarray(a, np.float32), float(s))


def decaler(a: np.ndarray, dx: float, dy: float) -> np.ndarray:
    """Translation entière (px) avec bord nul."""
    dx, dy = int(round(dx)), int(round(dy))
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = a[ys, xs]
    return out


def webp(arr: np.ndarray, q=Q_TOILE, qa=Q_ALPHA) -> bytes:
    return R.webp(arr, q, qa)


def lumiere(w: int, h: int, x0=0.0, y0=0.0, sx=1.0, sy=1.0) -> np.ndarray:
    """λ de la lumière de fin d'après-midi (haut gauche), comme les pages : +1 lumière, −1 ombre.
    (x0, y0, sx, sy) : position et échelle des pixels dans le plat (px de référence)."""
    X = (x0 + (np.arange(w, dtype=np.float32) + 0.5) * sx) / PLAT_W
    Y = (y0 + (np.arange(h, dtype=np.float32) + 0.5) * sy) / PLAT_H
    u = X / 2 + 0.5  # le plat avant est la moitié droite du livre ouvert
    return np.clip(1 - (0.85 * u[None, :] + 1.15 * Y[:, None]) + 0.45, -1, 1)


def dist_poly(xx, yy, pts) -> np.ndarray:
    """Distance signée (+ dedans) au bord d'un polygone CONVEXE."""
    n = len(pts)
    aire = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    s = 1.0 if aire > 0 else -1.0
    d = np.full(xx.shape, np.inf, np.float32)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        ex, ey = x1 - x0, y1 - y0
        L = math.hypot(ex, ey) or 1.0
        di = s * ((xx - x0) * (-ey / L) + (yy - y0) * (ex / L))
        d = np.minimum(d, di.astype(np.float32))
    return d


# =============================================================================================
# Écriture et croquis, figés en JSON (sources/couverture/ecriture, …/croquis)
# =============================================================================================
REECRIRE = False
UTILISES: set = set()  # fichiers figés lus pendant la cuisson (les autres sont nettoyés après une cuisson complète)


def _ecr():
    import ecriture as ECR  # lecture seule (lot E)
    return ECR


MAINS_N2 = {"soignee": "soignee", "cecile": "cecile", "mamie": "mamie", "ecole": "ecole", "pressee": "pressee",
            "feutre": "ado", "capitales": "papa", "ado": "ado", "papa": "papa"}


def _n2(texte: str, main: str, graine: int, encre: str, outil: str | None) -> dict:
    """Écriture par l'outil N2 (tools/ecriture/ecrire.py, API stable) ; chaque mot remis dans son repère
    (ligne de base y = 0, départ x = 0, unité = hauteur d'x), comme scripts/pages/ecriture.py."""
    outil_dir = str(RACINE / "tools" / "ecriture")
    if outil_dir not in sys.path:
        sys.path.append(outil_dir)
    from ecrire import ecrire as n2_ecrire
    r = n2_ecrire(texte, style=MAINS_N2.get(main, main), graine=int(graine), largeur_max=None, encre=encre, outil=outil)
    lignes, douteux = [], []
    for l in r["lignes"]:
        mots, prec = [], None
        for m in l["mots"]:
            (x0, y0), (x1, y1) = [tuple(map(float, p)) for p in m["ligne_de_base"]]
            ang = math.atan2(y1 - y0, x1 - x0)
            ca, sa = math.cos(-ang), math.sin(-ang)
            traits = []
            for t in m["traits"]:
                T = np.asarray(t, float)
                if T.ndim != 2 or not len(T):
                    continue
                if T.shape[1] < 5:
                    T = np.column_stack([T[:, :4] if T.shape[1] >= 4 else np.column_stack([T[:, :2], np.full(len(T), 0.7), np.ones(len(T))]),
                                         np.full(len(T), 0.8)])
                X, Y = T[:, 0] - x0, T[:, 1] - y0
                T = T.copy()
                T[:, 0] = X * ca - Y * sa
                T[:, 1] = X * sa + Y * ca
                traits.append(np.round(T, 4).tolist())
            lu = m.get("lu")
            if lu is not None and not all(lu if isinstance(lu, list) else [lu]):
                douteux.append(m["texte"])
            mots.append({"texte": m["texte"], "largeur": round(math.hypot(x1 - x0, y1 - y0), 4),
                         "espace_avant": round(0.0 if prec is None else max(0.0, x0 - prec), 4), "traits": traits})
            prec = x1
        lignes.append(mots)
    enc = r.get("encre") or {}
    return {"encre": {k: enc[k] for k in ("id", "outil", "charge", "clair") if k in enc},
            "epaisseur": float(r.get("epaisseur_conseillee", 0.115)), "interligne": float(r.get("interligne", 3.0)),
            "lignes": lignes, "douteux": douteux, "version_n2": r.get("version")}


def ecriture(texte: str, main: str, graine: int, encre: str, outil: str | None) -> dict:
    """Bloc d'écriture figé en JSON versionné (design-system/sources/couverture/ecriture). On essaie
    quelques graines jusqu'à ce que N2 relise chaque mot (« lu ») ; repli : l'adaptateur ecriture.py."""
    cle = hashlib.sha256(json.dumps([texte, main, graine, encre, outil], ensure_ascii=False).encode()).hexdigest()[:10]
    f = SOURCES / "ecriture" / f"{main}-{encre}-{cle}.json"
    UTILISES.add(f)
    if f.exists() and not REECRIRE:
        return json.loads(f.read_text())
    d = None
    try:
        for k in range(6):
            g = int(graine) + 7919 * k
            essai = _n2(texte, main, g, encre, outil)
            essai["graine_retenue"] = g
            if d is None or len(essai["douteux"]) < len(d["douteux"]):
                d = essai
            if not essai["douteux"]:
                break
    except Exception as e:  # outil absent : l'adaptateur des pages
        print(f"  écriture N2 directe impossible ({type(e).__name__}: {e}) : adaptateur ecriture.py")
        b = _ecr().ecrire_bloc(texte, main=main, graine=graine, encre=encre, outil=outil)
        d = {"encre": dict(b.encre), "epaisseur": float(b.epaisseur), "interligne": float(b.interligne),
             "douteux": list(getattr(b, "douteux", [])), "graine_retenue": int(getattr(b, "graine", graine)),
             "lignes": [[{"texte": m.texte, "largeur": round(float(m.largeur), 4), "espace_avant": round(float(m.espace_avant), 4),
                          "traits": [np.round(np.asarray(t, float), 4).tolist() for t in m.traits]} for m in l] for l in b.lignes]}
    d.update({"texte": texte, "main": main, "graine": graine})
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(d, ensure_ascii=False) + "\n")
    return d


def encrer(chemins: list, encre: str, outil: str, graine: int, main: str) -> list:
    """Tracés faits main (x, y, p, v en hauteurs d'x) → (n, 5) avec l'encre de N2 (repli : densité constante)."""
    try:
        return [np.asarray(t, float) for t in _ecr().encrer_traits(chemins, encre, outil, graine, main)]
    except Exception:
        out = []
        for c in chemins:
            c = np.asarray(c, float)
            out.append(np.column_stack([c[:, :4], np.full(len(c), 0.8)]))
        return out


def croquis(nom: str, boite, encre: str, graine: int, main: str, outil: str | None, xh: float, lavis=True, variante=None) -> dict:
    """Croquis de scripts/pages/croquis.py (lecture seule), figé en JSON."""
    cle = hashlib.sha256(json.dumps([nom, [round(v, 2) for v in boite], encre, graine, main, outil, round(xh, 2), lavis, variante]).encode()).hexdigest()[:10]
    f = SOURCES / "croquis" / f"{nom}-{cle}.json"
    UTILISES.add(f)
    if f.exists() and not REECRIRE:
        return json.loads(f.read_text())
    import croquis as CQ
    d = CQ.dessiner(nom, boite=tuple(boite), encre=encre, graine=graine, main=main, outil=outil, xh=xh, lavis=lavis, variante=variante)
    d = json.loads(json.dumps(d, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o)))
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(d, ensure_ascii=False) + "\n")
    return d


def lavis_croquis(d: dict, forme, rel, lam) -> np.ndarray:
    if not d.get("lavis"):
        return np.ones((*forme, 3), np.float32)
    import croquis as CQ
    try:
        return np.asarray(CQ.transmittance_lavis(d["lavis"], forme, ECH, rel, lam), np.float32)
    except TypeError:
        return np.asarray(CQ.transmittance_lavis(d["lavis"], forme, ECH, rel), np.float32)


def traces_croquis(d: dict, encre: dict | None = None, diam: float | None = None) -> list:
    enc = encre or dict(d["encre"])
    return [Trace(np.asarray(t, float), float(diam or d["diam"]), enc) for t in d["traits"] if len(t)]


def poser_texte(bloc: dict, xh: float, lignes_pos: list, rng, encre: dict | None = None, diam_k: float = 1.0) -> tuple[list, list]:
    """Pose les lignes d'un bloc : lignes_pos[i] = (x, y_base, alignement 'g'|'c', angle en degrés).
    → (traces, boîtes des lignes (x0, y0, x1, y1))."""
    enc = encre or dict(bloc["encre"])
    diam = bloc["epaisseur"] * xh * diam_k
    traces, boites = [], []
    for ligne, (x, yb, al, ang) in zip(bloc["lignes"], lignes_pos):
        larg = sum((m["espace_avant"] if k else 0) + m["largeur"] for k, m in enumerate(ligne)) * xh
        x0 = x - larg / 2 if al == "c" else x
        a = math.radians(ang)
        ca, sa = math.cos(a), math.sin(a)
        cur = 0.0
        tous = []
        for k, m in enumerate(ligne):
            if k:
                cur += m["espace_avant"] * xh
            da = math.radians(float(rng.normal(0, 0.5)))
            dy = float(rng.normal(0, 0.03)) * xh
            for t in m["traits"]:
                T = np.asarray(t, float).copy()
                lx = cur + T[:, 0] * xh * math.cos(da) - T[:, 1] * xh * math.sin(da)
                ly = T[:, 0] * xh * math.sin(da) + T[:, 1] * xh * math.cos(da) + dy
                T[:, 0] = x0 + lx * ca - ly * sa
                T[:, 1] = yb + lx * sa + ly * ca
                traces.append(Trace(T, diam, enc))
                tous.append(T[:, :2])
            cur += m["largeur"] * xh
        A = np.vstack(tous)
        boites.append((float(A[:, 0].min()), float(A[:, 1].min()), float(A[:, 0].max()), float(A[:, 1].max())))
    return traces, boites


def chemin_main(points, rng, n=60, tremble=0.012, p=(0.55, 0.8), v=1.0) -> np.ndarray:
    """Courbe (Catmull-Rom) passant par `points` (hauteurs d'x), tremblé lent, pression en cloche → (n, 4)."""
    P = np.asarray(points, float)
    if len(P) == 2:
        P = np.vstack([P[0], (P[0] + P[1]) / 2, P[1]])
    Q = np.vstack([P[0] * 2 - P[1], P, P[-1] * 2 - P[-2]])
    seg = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        t = np.linspace(0, 1, n // (len(Q) - 3) + 2)[:-1, None]
        seg.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    C = np.vstack(seg + [Q[-2][None, :]])
    k = len(C)
    C[:, 0] += np.cumsum(rng.normal(0, tremble, k)) * 0.35
    C[:, 1] += np.cumsum(rng.normal(0, tremble, k)) * 0.35
    u = np.linspace(0, 1, k)
    pr = p[0] + (p[1] - p[0]) * np.sin(np.pi * np.clip(u * 1.1, 0, 1)) ** 0.6
    vi = v * (0.6 + 0.8 * np.sin(np.pi * u))
    return np.column_stack([C, pr, vi])


# =============================================================================================
# Encre → image (mêmes fonctions que la cuisson des pages)
# =============================================================================================
def grain(P: np.ndarray, rel: np.ndarray, rng) -> np.ndarray:
    try:
        import feuillets as PAP  # lecture seule (lot Pa)
        return PAP.grain_bruit(P, rel, rng)
    except Exception:
        fin = flou(rng.normal(0, 1, rel.shape).astype(np.float32), 0.8)
        fin /= fin.std() + 1e-6
        return np.clip(-0.28 * rel + 0.14 * fin, -0.8, 0.8).astype(np.float32)


def transmittance_encre(P: np.ndarray, traces: list, lam: np.ndarray | None, rng) -> tuple[np.ndarray, np.ndarray]:
    h, w = P.shape[:2]
    rel = R.relief(u8(P))
    cartes = R.rasteriser(traces, w, h, ECH, grain(u8(P), rel, rng))
    return R.transmittance(cartes, rel, lam)


def papier_ancien(w: int, h: int, source="wellcome-ms4489-i51-verge-creme", x=0.5, y=0.4, graine=11,
                  teinte=(2, 1, -2), marbrure=1.2, echelle=0.54) -> np.ndarray:
    """Un morceau du vrai papier des pages (design-system/sources/papier), sans usure de bords."""
    cfg = {"source": source, "echelle": echelle, "x": x, "y": y, "rotation": 0, "teinte": list(teinte),
           "graine": graine, "marbrure": marbrure, "bords": {"exterieur": 0.0, "tete": 0.0, "pied": 0.0, "reliure": 0.0}}
    try:
        import feuillets as PAP  # lecture seule (lot Pa)
        return np.asarray(PAP.feuillet(cfg, w, h, SOURCES_PAPIER), np.float32)
    except Exception:
        src = Image.open(SOURCES_PAPIER / f"{source}.jpg").convert("RGB")
        e = max(echelle, w / src.width, h / src.height)
        src = src.resize((round(src.width * e), round(src.height * e)), Image.LANCZOS)
        X = round(x * (src.width - w))
        Y = round(y * (src.height - h))
        return np.asarray(src.crop((X, Y, X + w, Y + h))).astype(np.float32) + np.array(teinte, np.float32)


def papier_garde(genre: str, w: int, h: int, graine: int) -> tuple[np.ndarray, str]:
    """Papier de garde : celui du lot Pa (papiers.json : `garde-uni` / `garde-marbre`) s'il existe,
    sinon le vrai papier marbré de la garde de Jane Freestone (marbre) ou un papier uni des sources."""
    cle = f"garde-{genre}"
    try:
        pp = json.loads(PAPIERS.read_text())
        cfg = None
        for groupe in ("gardes", "feuillets", "cahiers"):
            if isinstance(pp.get(groupe), dict) and cle in pp[groupe]:
                cfg = dict(pp[groupe][cle])
        if cfg is None and isinstance(pp.get(cle), dict):
            cfg = dict(pp[cle])
        if cfg is not None:
            import feuillets as PAP
            fn = getattr(PAP, "garde", None)
            # orientation d'un recto : la garde collée à gauche du livre ouvert est vue en miroir (comme la page `garde`)
            if fn is not None:
                return np.asarray(fn(cfg, w, h, SOURCES_PAPIER), np.float32)[:, ::-1].copy(), f"papiers.json:{cle} (feuillets.garde)"
            if (SOURCES_PAPIER / f"{cfg.get('source', '')}.jpg").exists():
                return np.asarray(PAP.feuillet(cfg, w, h, SOURCES_PAPIER), np.float32)[:, ::-1].copy(), f"papiers.json:{cle}"
    except Exception as e:  # le lot Pa travaille en parallèle
        print(f"  garde {cle} de Pa illisible ({type(e).__name__}: {e}) : repli sur les sources")
    if genre == "marbre":
        M = fenetre(charger("wellcome-ms8207-marbre-garde"), w, h, cx=0.45, cy=0.5)
        return M, "sources/couverture/wellcome-ms8207-marbre-garde"
    P = papier_ancien(w, h, source="loc-holmes1866-p66-reglure-fantome", x=0.3, y=0.5, graine=graine, teinte=(-4, -6, -12), marbrure=1.6)
    return P, "sources/papier/loc-holmes1866-p66-reglure-fantome"


# =============================================================================================
# Toile : patine (soleil, frottements, coins, taches, lumière, biseau des bords)
# =============================================================================================
def patiner(T: np.ndarray, rng, *, dos="gauche", fondu=0.2, frotte=8.0, rayon=6.0, chocs=(0.7, 1.0),
            taches=(), lumiere_k=0.05, biseau=True, mors=True, usure_fils=1.0, coins_libres=None) -> np.ndarray:
    """T : (h, w, 3) sRGB 0–255, à l'échelle ECH. → RGBA float (coins arrondis et émoussés en alpha).
    `dos` : côté du mors ('gauche' plat avant, 'droite' plat arrière ; None : quatre bords libres)."""
    h, w = T.shape[:2]
    e = ECH
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rel = R.relief(u8(T))
    crete = np.clip(rel, 0, 3) / 3  # sommets de la trame (les fils blanchissent d'abord là)
    n1 = bruit(rng, h, w, 230 * e)
    n2 = bruit(rng, h, w, 34 * e)
    n3 = bruit(rng, h, w, 6 * e)
    dg, dd, dh, db = xx, w - 1 - xx, yy, h - 1 - yy
    libres = []
    if dos != "gauche":
        libres.append(dg)
    if dos != "droite":
        libres.append(dd)
    libres += [dh, db]
    dl = np.minimum.reduce(libres)
    # 1. passé : marbrure lente + bords plus exposés (lumière, mains)
    passe = desaturer(T, 0.62) * np.array([1.03, 1.02, 0.97], np.float32) + 12
    bande = np.clip(1 - dl / (0.07 * w), 0, 1) ** 2
    f = np.clip(fondu * (0.55 + 0.45 * n1) + 0.32 * bande * (0.7 + 0.3 * n2), 0, 0.75)
    T = T + (passe - T) * f[..., None]
    # 2. frottement des bords libres : les fils blanchissent sur les crêtes de la trame
    frot = np.clip(1 - (dl + 2.2 * e * n2 + 0.8 * e * n3) / (frotte * e), 0, 1) ** 1.1
    blanc = desaturer(T, 0.3) * 1.08 + 46
    T = T + (blanc - T) * (frot * (0.24 + 0.7 * crete) * usure_fils)[..., None]
    # tout au bord, la toile repliée sur l'arête du carton est usée jusqu'à la trame blanche
    arete = np.exp(-np.maximum(dl + 0.6 * e * n3, 0) / (1.3 * e)) * (0.45 + 0.4 * np.clip(n2, -1, 1) * 0.5)
    T = T + (blanc - T) * (np.clip(arete, 0, 0.8) * usure_fils)[..., None]
    # 3. coins libres : émoussés, la toile usée laisse voir le carton gris-brun
    coins = coins_libres
    if coins is None:
        coins = [(w, 0), (w, h)] if dos == "gauche" else ([(0, 0), (0, h)] if dos == "droite" else [(0, 0), (w, 0), (0, h), (w, h)])
    alpha = np.ones((h, w), np.float32)
    carton = np.array([128, 112, 92], np.float32)
    for k, (cx, cy) in enumerate(coins):
        choc = chocs[k % len(chocs)]
        dc = np.hypot(xx - cx, yy - cy)
        zone = np.clip(1 - (dc + 6 * e * n2) / ((48 + 22 * choc) * e), 0, 1) ** 1.3 * choc
        T = T + (blanc - T) * (zone * (0.55 + 0.45 * crete))[..., None]
        bout = np.clip(1 - dc / ((16 + 10 * choc) * e) + 0.35 * n3, 0, 1) ** 1.1 * choc
        T = T + (carton - T) * (0.7 * bout)[..., None]
        # le carton écrasé autour du coin : un léger creux plus sombre
        T = T * (1 - 0.06 * np.exp(-((dc - (20 + 10 * choc) * e) / (6 * e)) ** 2) * choc)[..., None]
        # arrondi irrégulier (alpha)
        r = (rayon + 2.5 * choc) * e
        sx = 1 if cx == 0 else -1
        sy = 1 if cy == 0 else -1
        ccx, ccy = cx + sx * r, cy + sy * r
        dans = ((xx - ccx) * sx < 0) & ((yy - ccy) * sy < 0)
        d = np.hypot(xx - ccx, yy - ccy) - r + 0.9 * e * n3 * choc
        alpha = np.where(dans, np.minimum(alpha, np.clip(0.5 - d, 0, 1)), alpha)
    # coins côté mors : presque vifs
    for (cx, cy) in ([(0, 0), (0, h)] if dos == "gauche" else [(w, 0), (w, h)] if dos == "droite" else []):
        r = 2.0 * e
        sx = 1 if cx == 0 else -1
        sy = 1 if cy == 0 else -1
        ccx, ccy = cx + sx * r, cy + sy * r
        dans = ((xx - ccx) * sx < 0) & ((yy - ccy) * sy < 0)
        d = np.hypot(xx - ccx, yy - ccy) - r
        alpha = np.where(dans, np.minimum(alpha, np.clip(0.5 - d, 0, 1)), alpha)
    # bords libres un peu effilochés (alpha)
    alpha *= np.clip(dl + 0.6 + 0.45 * n3, 0, 1)
    # 4. taches : auréole d'eau (ligne de marée plus foncée, intérieur un peu lavé) et petites salissures
    for t in taches:
        cx, cy, r = t["x"] * w, t["y"] * h, t["r"] * w
        ang = np.arctan2(yy - cy, xx - cx)
        d = np.hypot(xx - cx, yy - cy)
        if t.get("rond"):  # fond de tasse : presque un cercle, bande plus foncée vers l'extérieur, cassée par endroits,
            # et un second anneau plus pâle, un peu décalé (la tasse reposée une autre fois)
            maree = np.zeros_like(d)
            for (dx, dy, k, dr) in ((0, 0, 1.0, 0), (5 * e, -4 * e, 0.4, 7 * e)):
                d2 = np.hypot(xx - cx - dx, yy - cy - dy)
                rr = r * (1 + 0.012 * np.sin(2 * ang + t.get("phase", 0))) + dr + 1.5 * e * n2
                lw = t.get("trait", 3.0) * e
                anneau = np.clip((d2 - (rr - lw)) / lw, 0, 1) ** 1.6 * (d2 <= rr) + np.exp(-((d2 - rr) / (1.1 * e)) ** 2) * (d2 > rr)
                maree = np.maximum(maree, anneau * k)
            maree = maree * np.clip(0.78 + 0.35 * n2, 0.35, 1) * (0.85 + 0.15 * np.clip(n3, -1, 1)) * t.get("force", 0.08)
        else:
            rr = r * (1 + 0.12 * np.sin(3 * ang + t.get("phase", 0)) + 0.06 * np.sin(7 * ang + 1.3)) + 3 * e * n2
            maree = np.exp(-((d - rr) / (t.get("trait", 2.2) * e)) ** 2) * t.get("force", 0.08)
        if "arc" in t:  # anneau de tasse : plus marqué d'un côté, presque effacé de l'autre
            a0, la = t["arc"]
            dang = np.angle(np.exp(1j * (ang - a0)))
            maree = maree * (0.45 + 0.55 * np.exp(-(dang / la) ** 2))
        dedans = np.clip((rr - d) / (6 * e), 0, 1) * t.get("lave", 0.04)
        T = T * (1 - maree[..., None] * np.array([0.9, 1.0, 1.15], np.float32))
        if t.get("the"):
            T = T + (np.array([118, 92, 58], np.float32) - T) * (maree * t["the"])[..., None]
        T = T + (desaturer(T, 0.7) + 10 - T) * dedans[..., None]
    for _ in range(int(rng.integers(3, 7))):
        cx, cy = rng.uniform(0.08, 0.92) * w, rng.uniform(0.08, 0.92) * h
        r = rng.uniform(0.6, 2.2) * e
        d = np.hypot(xx - cx, yy - cy)
        s = np.clip(1 - d / r, 0, 1) ** 1.2 * rng.uniform(0.12, 0.3)
        T = T * (1 - s[..., None] * np.array([0.85, 1.0, 1.2], np.float32))
    # 5. bord du carton qui plonge dans le mors (côté dos)
    if mors and dos in ("gauche", "droite"):
        dm = dg if dos == "gauche" else dd
        T = T * (1 - 0.16 * np.exp(-dm / (2.2 * e)) - 0.05 * np.exp(-dm / (12 * e)))[..., None]
    # 6. biseau des bords : arête du carton éclairée en haut et à gauche, dans l'ombre en bas et à droite
    if biseau:
        k = np.zeros((h, w), np.float32)
        k += 0.10 * np.exp(-dh / (1.4 * e))
        k -= 0.17 * np.exp(-db / (1.6 * e))
        if dos != "gauche":
            k += 0.07 * np.exp(-dg / (1.4 * e))
        if dos != "droite":
            k -= 0.13 * np.exp(-dd / (1.6 * e))
        T = T * (1 + k)[..., None]
    # 7. lumière (haut gauche) et léger gauchissement du carton
    lam = lumiere(w, h, sx=PLAT_W / w, sy=PLAT_H / h)
    T = T * (1 + lumiere_k * lam + 0.012 * n1)[..., None]
    return np.dstack([np.clip(T, 0, 255), alpha * 255])


# =============================================================================================
# Étiquette collée (variantes a et b)
# =============================================================================================
def forme_etiquette(genre: str, lw: float, lh: float) -> list:
    if genre == "octogone":
        c = 0.085 * min(lw, lh) * 1.6
        return [(c, 0), (lw - c, 0), (lw, c), (lw, lh - c), (lw - c, lh), (c, lh), (0, lh - c), (0, c)]
    return [(0, 0), (lw, 0), (lw, lh), (0, lh)]


def etiquette(v: str, cfg: dict) -> tuple[np.ndarray, dict]:
    """Étiquette collée, tournée, ombre cuite → (RGBA uint8, placement en fractions du plat)."""
    e = cfg["etiquette"]
    lw, lh = e["taille"]
    m = 16  # marge pour l'ombre (px de référence)
    W, H = int((lw + 2 * m) * ECH), int((lh + 2 * m) * ECH)
    rng = rng_de("etiquette", v)
    # papier : un morceau du vrai papier des pages, un peu plus jauni (collé depuis longtemps)
    P = papier_ancien(W, H, source=e.get("papier", "wellcome-ms4489-i51-verge-creme"), x=e.get("px", 0.62), y=e.get("py", 0.35),
                      graine=_graine("papier", v) % 1000, teinte=e.get("teinte", (3, 0, -9)), marbrure=1.3)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    X, Y = xx / ECH - m, yy / ECH - m  # px de référence dans l'étiquette
    pts = forme_etiquette(e["forme"], lw, lh)
    d = dist_poly(X, Y, pts)
    n_fin = bruit(rng, H, W, 1.6 * ECH)
    n_bord = bruit(rng, H, W, 26 * ECH)
    d_cut = d + 0.28 * n_fin + 0.45 * n_bord  # coup de ciseaux pas tout à fait droit
    alpha = np.clip(d_cut * ECH + 0.5, 0, 1)
    # vieillissement : bords jaunis par la colle et les doigts, ligne de colle, rousseurs, gondolage
    brun = np.clip(1 - (d + 2.5 * n_bord) / 11, 0, 1) ** 1.6
    P = P * (1 - (0.11 * brun)[..., None] * np.array([0.75, 1.0, 1.55], np.float32))
    colle = np.exp(-((d - 3.2 - 0.8 * n_bord) / 0.9) ** 2) * 0.035
    P = P * (1 - colle[..., None] * np.array([0.8, 1.0, 1.4], np.float32))
    P = P * (1 + 0.022 * bruit(rng, H, W, 70 * ECH))[..., None]
    for _ in range(int(rng.integers(4, 9))):
        cx, cy = rng.uniform(0.05, 0.95) * W, rng.uniform(0.05, 0.95) * H
        r = rng.uniform(0.5, 1.8) * ECH
        s = np.clip(1 - np.hypot(xx - cx, yy - cy) / r, 0, 1) ** 1.3 * rng.uniform(0.08, 0.22)
        P = P * (1 - s[..., None] * np.array([0.7, 1.0, 1.6], np.float32))
    # cadre imprimé (typographie : l'encre suit le grain du papier, quelques manques)
    Tp = np.ones((H, W, 3), np.float32)
    encre_cadre = hexrgb(e["cadre"])
    Ti = np.clip(R.vers_lin(encre_cadre) / R.vers_lin(hexrgb(PAPIER_REF)), 0.02, 1).astype(np.float32)
    rel = R.relief(u8(P))
    imp = np.clip(0.86 + 0.16 * rel + 0.1 * bruit(rng, H, W, 3 * ECH), 0.35, 1)
    for (dist, demi) in e.get("filets", [(8.5, 0.85), (12.5, 0.38)]):
        a = np.clip((demi - np.abs(d - dist)) * ECH + 0.5, 0, 1) * imp * 0.9
        Tp = Tp * (1 - a[..., None] + a[..., None] * Ti)
    # titre écrit à la main + croquis
    t = cfg["titre"]
    bloc = ecriture(t["texte"], t["main"], t["graine"], t["encre"], t.get("outil"))
    xh = t["xh"]
    pos = [(m + lw * x, m + lh * y, al, ang) for (x, y, al, ang) in t["lignes"]]
    traces, boites = poser_texte(bloc, xh, pos, rng_de("titre", v), diam_k=t.get("graisse", 1.0))
    lam_x0 = PLAT_W * e["centre"][0] - (lw / 2 + m)
    lam_y0 = PLAT_H * e["centre"][1] - (lh / 2 + m)
    lam = lumiere(W, H, x0=lam_x0, y0=lam_y0, sx=1 / ECH, sy=1 / ECH)
    T_lav = np.ones((H, W, 3), np.float32)
    rel_p = R.relief(u8(P))
    for s in t.get("soulignes", []):
        bx0, by0, bx1, by1 = boites[s["ligne"]]
        y0 = by1 + s.get("dy", 0.25) * xh
        pts_s = [(bx0 / xh + s.get("x0", 0.05) * (bx1 - bx0) / xh, y0 / xh), ((bx0 + (bx1 - bx0) * 0.5) / xh, y0 / xh + 0.06),
                 (bx1 / xh - s.get("x1", 0.0) * (bx1 - bx0) / xh, y0 / xh - 0.05)]
        ch = encrer([chemin_main(pts_s, rng_de("souligne", v), n=50)], bloc["encre"]["id"], bloc["encre"].get("outil"), 77, t["main"])
        for c in ch:
            c = c.copy()
            c[:, 0] *= xh
            c[:, 1] *= xh
            traces.append(Trace(c, bloc["epaisseur"] * xh * 0.85, dict(bloc["encre"])))
    q = cfg.get("croquis")
    if q:
        bx = (m + lw * q["boite"][0], m + lh * q["boite"][1], lw * q["boite"][2], lh * q["boite"][3])
        dq = croquis(q["nom"], bx, t["encre"], q.get("graine", 7), t["main"], t.get("outil"), xh * q.get("xh", 0.7), variante=q.get("variante"))
        traces += traces_croquis(dq)
        T_lav = T_lav * lavis_croquis(dq, (H, W), rel_p, lam)
    Rt, union = transmittance_encre(P, traces, lam, rng_de("encre", v))
    out = R.vers_srgb(R.vers_lin(u8(P)) * Rt * Tp * T_lav)
    # coin décollé : plus clair (il prend la lumière), son ombre s'écarte
    cx, cy = {"bas-droite": (lw, lh), "haut-droite": (lw, 0), "bas-gauche": (0, lh), "haut-gauche": (0, 0)}[e.get("decolle", "bas-droite")]
    dco = np.hypot(X - cx, Y - cy)
    lev = np.clip(1 - dco / (0.33 * min(lw, lh)), 0, 1) ** 1.7
    out = out * (1 + 0.07 * lev)[..., None]
    # le bord du coin levé : liseré clair (tranche du papier)
    bordc = np.exp(-(d / 0.7) ** 2) * lev
    out = out + (255 - out) * (0.35 * bordc)[..., None]
    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255])
    lev_img = (lev * alpha * 255)
    # rotation (l'ombre se calcule après : elle tombe toujours vers le bas à droite)
    ang = e.get("angle", 0.0)
    im = Image.fromarray(u8(rgba), "RGBA").rotate(ang, resample=Image.BICUBIC, expand=True)
    lv = Image.fromarray(u8(lev_img), "L").rotate(ang, resample=Image.BICUBIC, expand=True)
    A = np.asarray(im).astype(np.float32)
    a = A[..., 3] / 255
    L = np.asarray(lv).astype(np.float32) / 255
    contact = flou(decaler(a, 0.9 * ECH, 1.3 * ECH), 1.1 * ECH) * 0.42
    halo = flou(decaler(a, 2.0 * ECH, 2.8 * ECH), 3.2 * ECH) * 0.16
    leve = flou(decaler(a * L, 6 * ECH, 8.5 * ECH), 5.5 * ECH) * 0.55
    S = 1 - (1 - contact) * (1 - halo) * (1 - leve)
    # sous le coin levé, plus de contact : l'ombre de contact s'efface
    S = S * (1 - 0.6 * flou(L, 2 * ECH))
    ombre = hexrgb("#241c12")
    oa = a + S * (1 - a)
    rgb = (A[..., :3] * a[..., None] + ombre * (S * (1 - a))[..., None]) / np.maximum(oa[..., None], 1e-4)
    res = np.dstack([u8(rgb), u8(oa * 255)])
    # placement : centre de l'étiquette sur le plat, en fractions
    hh, ww = res.shape[:2]
    cxp, cyp = e["centre"][0] * PLAT_W, e["centre"][1] * PLAT_H
    rect = [round((cxp - ww / ECH / 2) / PLAT_W, 5), round((cyp - hh / ECH / 2) / PLAT_H, 5),
            round(ww / ECH / PLAT_W, 5), round(hh / ECH / PLAT_H, 5)]
    info = {"rect": rect, "angle": ang, "douteux": bloc.get("douteux", [])}
    return res, info


# =============================================================================================
# Feutre peinture sur la toile (variante c)
# =============================================================================================
def peindre(T: np.ndarray, cfg: dict, v: str) -> np.ndarray:
    """Titre et croquis au feutre peinture crème, directement sur la toile (T : RGBA float, échelle ECH)."""
    p = cfg["peinture"]
    h, w = T.shape[:2]
    rng = rng_de("peinture", v)
    bloc = ecriture(p["texte"], p["main"], p["graine"], "feutre", "feutre")
    xh = p["xh"]
    enc = {"id": "peinture", "outil": "feutre", "charge": "#20201e", "clair": "#5a5852"}
    pos = [(PLAT_W * x, PLAT_H * y, al, ang) for (x, y, al, ang) in p["lignes"]]
    traces, boites = poser_texte(bloc, xh, pos, rng_de("titre", v), encre=enc, diam_k=p.get("epaisseur", 1.9))
    for s in p.get("soulignes", []):
        bx0, by0, bx1, by1 = boites[s["ligne"]]
        y0 = by1 + s.get("dy", 0.3) * xh
        pts_s = [(bx0 / xh + 0.15, y0 / xh + 0.02), (bx0 / xh + 0.4 * (bx1 - bx0) / xh, y0 / xh + 0.2),
                 (bx1 / xh - 0.35, y0 / xh - 0.05), (bx1 / xh + 0.15, y0 / xh - 0.3)]
        for c in encrer([chemin_main(pts_s, rng_de("souligne", v), n=70, tremble=0.02)], "feutre", "feutre", 91, p["main"]):
            c = c.copy()
            c[:, 0] *= xh
            c[:, 1] *= xh
            traces.append(Trace(c, bloc["epaisseur"] * xh * p.get("epaisseur", 1.9) * 0.8, enc))
    q = cfg.get("croquis")
    if q:
        bx = (PLAT_W * q["boite"][0], PLAT_H * q["boite"][1], PLAT_W * q["boite"][2], PLAT_H * q["boite"][3])
        dq = croquis(q["nom"], bx, "feutre", q.get("graine", 7), p["main"], "feutre", xh * q.get("xh", 0.6), lavis=False, variante=q.get("variante"))
        traces += traces_croquis(dq, encre=enc, diam=float(dq["diam"]) * p.get("epaisseur", 1.9) * 0.75)
    rgb = T[..., :3]
    rel = R.relief(u8(rgb))
    fin = flou(rng.normal(0, 1, (h, w)).astype(np.float32), 0.9)
    fin /= fin.std() + 1e-6
    br = np.clip(-0.42 * rel + 0.25 * fin, -1.1, 1.1).astype(np.float32)
    cartes = R.rasteriser(traces, w, h, ECH, br)
    a = np.zeros((h, w), np.float32)
    tq = np.zeros((h, w), np.float32)
    for (ak, tk, _) in cartes.values():
        tq = np.where(ak > a, tk, tq)
        a = np.maximum(a, ak)
    # la peinture couvre les crêtes de la trame, un peu moins les creux ; plus chargée aux arrêts
    op = a * np.clip(0.86 + 0.14 * tq, 0, 1) * np.clip(0.93 + 0.06 * np.clip(rel, -2, 2), 0.78, 1)
    op = op * (1 - 0.1 * np.clip(bruit(rng, h, w, 2.5 * ECH), 0, 2))  # feutre un peu sec par endroits
    # usure : la peinture s'écaille un peu là où la toile frotte (rares petits manques)
    ecaille = np.clip(bruit(rng, h, w, 1.8 * ECH) - 2.3, 0, 1)
    op = op * (1 - 0.8 * ecaille)
    # épaisseur de la couche : arête claire en haut à gauche, ombre fine en bas à droite
    E_ = flou(a, 0.9 * ECH)
    gy, gx = np.gradient(E_)
    relief_p = np.clip(-(gx * 0.7 + gy * 0.7) * 3.0, -1, 1)
    couleur = hexrgb(p["couleur"])
    col = couleur[None, None, :] * (1 + 0.06 * relief_p)[..., None] * (1 + 0.025 * fin)[..., None]
    lam = lumiere(w, h, sx=PLAT_W / w, sy=PLAT_H / h)
    col = col * (1 + 0.04 * lam)[..., None]
    sortie = rgb + (col - rgb) * op[..., None]
    # ombre portée de la couche (très fine) en dehors du trait
    om = np.clip(flou(decaler(a, 0.6 * ECH, 0.8 * ECH), 0.7 * ECH) - a, 0, 1) * 0.16
    sortie = sortie * (1 - om)[..., None]
    T = T.copy()
    T[..., :3] = np.clip(sortie, 0, 255)
    return T


# =============================================================================================
# Parties de la reliure
# =============================================================================================
def toile_source(cfg: dict, cote: str) -> np.ndarray:
    src = cfg["toile"] if cote == "plat" else cfg.get("toile_arriere", cfg["toile"])
    return charger(src)


def grade(T: np.ndarray, g: dict | None) -> np.ndarray:
    """Ajustement doux de la teinte d'une toile scannée (garder la vraie trame, la vraie patine)."""
    if not g:
        return T
    T = desaturer(T, g.get("saturation", 1.0))
    T = T * np.array(g.get("gain", [1, 1, 1]), np.float32) + np.array(g.get("decalage", [0, 0, 0]), np.float32)
    return np.clip(T, 0, 255)


def plat_toile(v: str, cfg: dict, cote="plat") -> np.ndarray:
    f = cfg["fenetre"] if cote == "plat" else cfg.get("fenetre_arriere", cfg["fenetre"])
    T = fenetre(toile_source(cfg, cote), PW, PH, **f)
    T = grade(T, cfg.get("grade"))
    pat = dict(cfg.get("patine", {}))
    if cote != "plat":
        pat["taches"] = pat.get("taches_arriere", ())
    pat.pop("taches_arriere", None)
    return patiner(T, rng_de("patine", v, cote), dos="gauche" if cote == "plat" else "droite", **pat)


def plat_marbre(v: str, cfg: dict, cote="plat") -> np.ndarray:
    """Demi-reliure : carton couvert de papier marbré, bande de toile du dos et coins toilés."""
    mb = cfg["marbre"]
    rng = rng_de("marbre", v, cote)
    T_toile = grade(fenetre(charger(cfg["toile"]), PW, PH, cx=0.5, cy=0.3 if cote == "plat" else 0.75), cfg.get("grade_toile"))
    M = fenetre(charger(mb["source"]), PW, PH, **(mb["fenetre"] if cote == "plat" else mb.get("fenetre_arriere", mb["fenetre"])))
    if cote != "plat":
        M = M[:, ::-1].copy()
    h, w = PH, PW
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    if cote != "plat":
        xx_d = w - 1 - xx  # distance depuis le dos (à droite sur le plat arrière)
    else:
        xx_d = xx
    n_b = bruit(rng, h, w, 18 * ECH)
    n_f = bruit(rng, h, w, 1.4 * ECH)
    # bande du dos : le papier recouvre la toile à partir de `bande` (px de référence)
    bande = mb.get("bande", 96) * ECH
    d_bande = xx_d - (bande + 1.2 * ECH * n_b + 0.3 * ECH * n_f)
    # coins : triangles toilés aux deux coins libres, le papier coupé en biais par-dessus
    coin = mb.get("coin", 132) * ECH
    d_coins = []
    for (cy0, sens) in ((0, 1), (h, -1)):
        # distance (signée, + côté papier) à la diagonale du coin libre
        u = (w - 1 - xx_d) + (yy - cy0) * sens  # = coin sur la diagonale
        d_coins.append((u - coin) / math.sqrt(2) + 0.9 * ECH * n_b + 0.25 * ECH * n_f)
    dp = np.minimum.reduce([d_bande] + d_coins)
    papier = np.clip(dp + 0.5, 0, 1)
    # le papier marbré, un peu fané ; sous ses bords, la tranche du papier (liseré clair) et une ombre fine sur la toile
    M = M * (1 + 0.025 * bruit(rng, h, w, 120 * ECH))[..., None]
    T = T_toile + (M - T_toile) * papier[..., None]
    lis = np.exp(-((dp - 0.6) / 0.8) ** 2)
    T = T + (np.array([214, 200, 172], np.float32) - T) * (0.22 * lis)[..., None]
    om = np.clip(1 - (-dp) / (1.6 * ECH), 0, 1) * (dp < 0) * 0.25
    T = T * (1 - om)[..., None]
    pat = dict(cfg.get("patine", {}))
    pat.pop("taches_arriere", None)
    if cote != "plat":
        pat["taches"] = ()
    out = patiner(T, rng_de("patine", v, cote), dos="gauche" if cote == "plat" else "droite", **pat)
    return out


def dos(v: str, cfg: dict) -> np.ndarray:
    """Dos arrondi : toile du livre, plus passée (le soleil de l'étagère), coiffes usées."""
    w, h = DOS_W * ECH, PH
    rng = rng_de("dos", v)
    src = charger(cfg.get("toile_dos", cfg["toile"]))
    # une bande de la toile à l'échelle du plat (une fenêtre aussi étroite agrandirait la trame)
    Hs, Ws = src.shape[:2]
    k = PH / Hs
    bw = int(math.ceil(w / k)) + 2
    x0 = int(Ws * 0.42)
    bandeau = Image.fromarray(u8(src[:, x0:x0 + bw])).resize((int(round(bw * k)), PH), Image.LANCZOS)
    T = np.asarray(bandeau).astype(np.float32)[:, :w]
    T = grade(T, cfg.get("grade_dos", cfg.get("grade")))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (xx + 0.5) / w * 2 - 1  # −1 … 1 à travers le dos
    # passé du dos
    passe = desaturer(T, 0.5) * np.array([1.04, 1.02, 0.95], np.float32) + 16
    f = np.clip(0.38 + 0.1 * bruit(rng, h, w, 120 * ECH), 0, 0.7)
    T = T + (passe - T) * f[..., None]
    # rondeur : la lumière vient de gauche, les bords tournent dans l'ombre
    ombre = 1 - 0.26 * np.abs(u) ** 2.2 + 0.06 * np.exp(-((u + 0.35) / 0.35) ** 2)
    T = T * ombre[..., None]
    # coiffes : tête et queue usées, fils blancs, un peu effilochées
    dt = np.minimum(yy, h - 1 - yy)
    n3 = bruit(rng, h, w, 3 * ECH)
    rel = R.relief(u8(T))
    coiffe = np.clip(1 - (dt + 2 * ECH * n3) / (14 * ECH), 0, 1) ** 1.3
    blanc = desaturer(T, 0.3) * 1.08 + 46
    T = T + (blanc - T) * (coiffe * (0.3 + 0.5 * np.clip(rel, 0, 3) / 3))[..., None]
    # deux filets à froid près de la tête et de la queue
    for y0 in (0.075 * h, 0.925 * h):
        for dy in (-3 * ECH, 3 * ECH):
            T = T * (1 - 0.1 * np.exp(-((yy - y0 - dy) / (0.9 * ECH)) ** 2))[..., None]
    alpha = np.clip(dt + 0.4 + 0.5 * n3, 0, 1) * 255
    return np.dstack([np.clip(T, 0, 255), alpha])


def chant(v: str, cfg: dict) -> np.ndarray:
    """Tranche du carton (10 px) : la toile repliée sur le bord, la plus frottée de toutes."""
    w, h = EP * ECH, PH
    src = charger(cfg.get("toile_dos", cfg["toile"]))
    Hs, Ws = src.shape[:2]
    k = PH / Hs
    bw = int(math.ceil(w / k)) + 2
    T = np.asarray(Image.fromarray(u8(src[:, Ws // 2:Ws // 2 + bw])).resize((int(round(bw * k)), PH), Image.LANCZOS)).astype(np.float32)[:, :w]
    T = grade(T, cfg.get("grade_dos", cfg.get("grade")))
    rng = rng_de("chant", v)
    rel = R.relief(u8(T))
    blanc = desaturer(T, 0.3) * 1.08 + 46
    T = T + (blanc - T) * (0.18 + 0.4 * np.clip(rel, 0, 3) / 3 + 0.1 * np.clip(bruit(rng, h, w, 40 * ECH), 0, 2))[..., None]
    u = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 - 1
    T = T * (1 - 0.2 * u[None, :] ** 2)[..., None]
    return np.dstack([np.clip(T, 0, 255), np.full((h, w), 255, np.float32)])


def tranche(v: str, longueur_ref: int, rng) -> np.ndarray:
    """Épaisseur des pages vue de côté : feuillets inégaux, cahiers, poussière. → RGBA (longueur × BLOC),
    feuillets le long de l'axe court (x), longueur le long de l'axe long (y)."""
    w, h = BLOC * ECH, longueur_ref * ECH
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # un feuillet ≈ 1 px à 2× ; tous les 8 feuillets un cahier (un creux un peu plus marqué)
    n_f = int(w / 1.05)
    bords = np.sort(np.concatenate([[0, w], rng.uniform(0, w, n_f - 1)]))
    idx = np.clip(np.searchsorted(bords, xx[0] + 0.5) - 1, 0, n_f - 1)
    ton = rng.normal(0, 1, n_f).astype(np.float32)
    cahier = (np.arange(n_f) % 8 == 0).astype(np.float32)
    # chaque feuillet dépasse un peu plus ou un peu moins (bords inégaux) : plus clair s'il avance
    avance = np.cumsum(rng.normal(0, 0.35, n_f)).astype(np.float32)
    avance = (avance - avance.mean()) / (avance.std() + 1e-6)
    prof = 1 + 0.02 * ton[idx] + 0.012 * avance[idx]
    # creux entre feuillets (sous-pixel : on module par la distance au bord le plus proche)
    dfe = np.minimum(xx[0] + 0.5 - bords[idx], bords[idx + 1] - (xx[0] + 0.5))
    creux = np.clip(1 - dfe / 0.45, 0, 1) * (0.05 + 0.11 * cahier[idx])
    base = hexrgb("#e2d3b1")
    T = np.broadcast_to(base, (h, w, 3)).astype(np.float32).copy()
    T = T * (prof * (1 - creux))[None, :, None]
    # le long de la tranche : légère ondulation, poussière vers la tête, doigts au milieu
    n_l = bruit(rng, h, 1, 40 * ECH)[:, :1]
    T = T * (1 + 0.025 * n_l)[..., None]
    v_ = (yy + 0.5) / h
    poussiere = np.clip(1 - v_ / 0.12, 0, 1) ** 1.5 * 0.1 + 0.05 * np.exp(-((v_ - 0.62) / 0.16) ** 2)
    T = T * (1 - poussiere[..., None] * np.array([0.85, 1.0, 1.3], np.float32))
    # bords extérieurs des feuillets brunis (oxydation des tranches), plus près des cartons (poussière)
    T = T * np.array([0.97, 0.95, 0.9], np.float32)
    xr = (xx + 0.5) / w
    T = T * (1 - 0.07 * (np.exp(-xr / 0.06) + np.exp(-(1 - xr) / 0.06)))[..., None]
    # grain du papier : un vrai scan, étiré dans le sens des feuillets
    try:
        G = papier_ancien(w * 6, h // 3 + 4, x=0.3, y=0.6, graine=3)
        G = np.asarray(Image.fromarray(u8(G)).resize((w, h), Image.BICUBIC)).astype(np.float32)
        Lg = lum(G)
        T = T * (1 + 0.6 * (Lg - Lg.mean()) / 255)[..., None]
    except Exception:
        pass
    # feuillets de longueurs inégales : les bouts de la tranche sont dentelés
    bout = 0.5 + np.abs(avance[idx]) * 0.9 * ECH
    dt = np.minimum(yy, h - 1 - yy)
    alpha = np.clip(dt - bout[None, :] + 1, 0, 1) * 255
    return np.dstack([np.clip(T, 0, 255), alpha])


def contreplat(v: str, cfg: dict, cote: str = "avant") -> tuple[np.ndarray, str]:
    """Intérieur d'un plat, livre ouvert : les remplis de toile autour, la garde collée par-dessus,
    l'empreinte des remplis et le bruni de la colle.
    `avant` : plat avant ouvert, à gauche (bord extérieur à gauche, mors à droite), garde vue en miroir ;
    `arriere` : plat arrière, à droite sous le dernier feuillet (mors à gauche, bord extérieur à droite)."""
    rng = rng_de("contreplat", v, cote)
    src = charger(cfg.get("toile_dedans", cfg["toile"]))
    T = fenetre(src, PW, PH, cx=0.3 if cote == "avant" else 0.7, cy=0.6 if cote == "avant" else 0.3, miroir=True)
    T = grade(T, cfg.get("grade_dedans", cfg.get("grade")))
    # remplis : abrités du soleil, presque pas passés ; coins en onglet
    T4 = patiner(T, rng, dos="droite", fondu=0.06, frotte=4, rayon=5, chocs=(0.5, 0.8), lumiere_k=0.03, mors=False)
    h, w = PH, PW
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    X, Y = xx / ECH, yy / ECH
    # la garde, collée : un peu plus petite que le carton, bords coupés à la main
    x0, y0, x1, y1 = OUT - 3.0, HAUT - 2.5, PLAT_W + 2, PLAT_H - BAS + 2.5
    n_b = bruit(rng, h, w, 30 * ECH)
    n_f = bruit(rng, h, w, 1.5 * ECH)
    dg = np.minimum.reduce([X - x0, Y - y0, y1 - Y]) + 0.5 * n_b + 0.25 * n_f
    a_g = np.clip(dg * ECH + 0.5, 0, 1)
    genre = cfg.get("garde", "uni")
    G, origine = papier_garde(genre, w, h, _graine("garde", v, cote) % 997)
    G = np.asarray(G, np.float32)[:h, :w]
    # bruni de la colle des remplis (bande de ≈ 13 mm sous la garde), empreinte du bord des remplis
    rempli = 46 + 2.0 * n_b
    d_bord = np.minimum.reduce([X, Y, PLAT_H - Y])
    bande = np.clip((rempli - d_bord) / 10, 0, 1) * (d_bord > 0) * (0.75 + 0.25 * n_b)
    G = G * (1 - (0.05 * bande)[..., None] * np.array([0.75, 1.0, 1.6], np.float32))
    marche = np.exp(-((d_bord - rempli) / 1.6) ** 2)
    G = G * (1 - 0.02 * marche)[..., None]
    G = G * (1 + 0.008 * np.exp(-((d_bord - rempli + 2.4) / 1.4) ** 2))[..., None]
    # pli du mors (côté droit) : la garde plonge vers la charnière
    dm = PLAT_W - X
    G = G * (1 - 0.18 * np.exp(-dm / 7) - 0.05 * np.exp(-dm / 40))[..., None]
    G = G * (1 + 0.02 * lumiere(w, h, sx=1 / ECH, sy=1 / ECH))[..., None]
    rgb = T4[..., :3] + (G - T4[..., :3]) * a_g[..., None]
    # tranche de la garde : un liseré clair, et l'ombre de son épaisseur sur la toile
    lis = np.exp(-((dg - 0.4) / 0.6) ** 2)
    rgb = rgb + (np.array([226, 214, 188], np.float32) - rgb) * (0.2 * lis)[..., None]
    om = np.clip(1 - (-dg) / 1.4, 0, 1) * (dg < 0) * 0.22
    rgb = rgb * (1 - om)[..., None]
    out = np.dstack([np.clip(rgb, 0, 255), T4[..., 3]])
    if cote == "arriere":  # même construction, retournée : mors à gauche ; la garde reprend le sens d'un recto
        out = out[:, ::-1].copy()
    return out, origine


# =============================================================================================
# Indices « … pour ouvrir »
# =============================================================================================
INDICES = {
    "toucher": "touchez pour ouvrir",
    "cliquer": "cliquez pour ouvrir",
    "entree": "appuyez sur Entrée pour ouvrir",
}
XH_INDICE = 15.0  # hauteur d'x (px de référence) : ≥ 14 px à l'écran (CONTRACT § 8) au cran le plus loin


# « touchez » : le « r » de « pour » finissait en petit crochet qui se lisait comme un point (« pour. ») ;
# on reprend « pour ouvrir » du billet « cliquez » (même main, même crayon : un seul billet se voit à la fois).
EMPRUNTS = {"toucher": ("cliquer", 1)}


def _bloc_indice(cle: str) -> dict:
    bloc = ecriture(INDICES[cle], "cecile", 300 + sum(map(ord, cle)), "crayon", "crayon")
    if cle in EMPRUNTS:
        autre, k = EMPRUNTS[cle]
        b2 = _bloc_indice(autre)
        bloc = dict(bloc, lignes=[bloc["lignes"][0][:k] + b2["lignes"][0][k:]], douteux=bloc["douteux"] + b2["douteux"])
    return bloc


def indice(cle: str, texte: str) -> dict:
    rng = rng_de("indice", cle)
    bloc = _bloc_indice(cle)
    xh = XH_INDICE
    larg = sum((m["espace_avant"] if k else 0) + m["largeur"] for k, m in enumerate(bloc["lignes"][0])) * xh
    fl = 3.4 * xh  # flèche
    mg = 0.8 * xh
    lw, lh = larg + fl + 2 * mg + 0.6 * xh, 3.6 * xh
    W, H = int(math.ceil(lw * ECH)), int(math.ceil(lh * ECH))
    yb = mg + 1.9 * xh
    traces, boites = poser_texte(bloc, xh, [(mg, yb, "g", -1.2)], rng, diam_k=1.25)
    # petite flèche : part après le texte, file vers la droite et remonte un peu (le plat s'ouvre par là)
    bx1 = boites[0][2]
    xa = bx1 / xh + 0.55
    ya = (yb - 0.45 * xh) / xh
    corps = [(xa, ya + 0.05), (xa + 1.2, ya + 0.12), (xa + 2.3, ya - 0.15), (xa + 2.85, ya - 0.7)]
    bout = np.array(corps[-1])
    direc = bout - np.array(corps[-2])
    direc /= np.linalg.norm(direc)
    nrm = np.array([-direc[1], direc[0]])
    b1 = [tuple(bout - 0.55 * direc + 0.38 * nrm), tuple(bout + 0.02 * direc)]
    b2 = [tuple(bout + 0.02 * direc), tuple(bout - 0.6 * direc - 0.36 * nrm)]
    chemins = [chemin_main(corps, rng, n=70, p=(0.5, 0.78), v=1.1), chemin_main(b1, rng, n=16, p=(0.6, 0.75)),
               chemin_main(b2, rng, n=16, p=(0.7, 0.55))]
    for c in encrer(chemins, "crayon", "crayon", 123, "cecile"):
        c = c.copy()
        c[:, 0] *= xh
        c[:, 1] *= xh
        traces.append(Trace(c, bloc["epaisseur"] * xh * 1.25, dict(bloc["encre"])))
    # 1) fond transparent : calque d'encre résolu sur le papier de référence (posé sur un autre fond, la
    #    mine garde sa couleur et sa densité)
    P = np.broadcast_to(hexrgb(PAPIER_REF), (H, W, 3)).astype(np.float32).copy()
    P = P * (1 + 0.025 * bruit(rng, H, W, 1.2 * ECH))[..., None]
    Rt, union = transmittance_encre(P, traces, None, rng_de("mine", cle))
    rgba, _ = R.composer(u8(P), Rt, union, None)
    # 2) sur un petit billet de papier déchiré, posé de travers, ombre cuite
    m = 10
    W2, H2 = W + 2 * m * ECH, H + 2 * m * ECH
    Pp = papier_ancien(W2, H2, x=rng.uniform(0.1, 0.9), y=rng.uniform(0.1, 0.9), graine=_graine("billet", cle) % 991, teinte=(1, 0, -4))
    yy, xx = np.mgrid[0:H2, 0:W2].astype(np.float32)
    X, Y = xx / ECH - m, yy / ECH - m
    d = dist_poly(X, Y, [(1, 2), (lw - 1, 0.5), (lw, lh - 1.5), (0, lh)])
    nb = bruit(rng, H2, W2, 5 * ECH)
    nf = bruit(rng, H2, W2, 1.1 * ECH)
    d = d + 1.1 * nb * (Y < lh * 0.5) + 0.45 * nf  # bord du haut déchiré, les autres coupés
    a_b = np.clip(d * ECH + 0.5, 0, 1)
    Pp = Pp * (1 - 0.08 * np.clip(1 - d / 5, 0, 1)[..., None] * np.array([0.8, 1.0, 1.5], np.float32))
    tr2 = [Trace(np.column_stack([t.pts[:, 0] + m, t.pts[:, 1] + m, t.pts[:, 2:]]), t.diam, t.encre) for t in traces]
    Rt2, _ = transmittance_encre(Pp, tr2, None, rng_de("mine2", cle))
    out = R.vers_srgb(R.vers_lin(u8(Pp)) * Rt2)
    im = Image.fromarray(u8(np.dstack([out, a_b * 255])), "RGBA").rotate(1.6 if cle != "entree" else -1.1, resample=Image.BICUBIC, expand=True)
    A = np.asarray(im).astype(np.float32)
    a = A[..., 3] / 255
    S = 1 - (1 - flou(decaler(a, 0.8 * ECH, 1.2 * ECH), 1.0 * ECH) * 0.4) * (1 - flou(decaler(a, 2.5 * ECH, 3.5 * ECH), 3.5 * ECH) * 0.18)
    oa = a + S * (1 - a)
    ombre = hexrgb("#241c12")
    rgb = (A[..., :3] * a[..., None] + ombre * (S * (1 - a))[..., None]) / np.maximum(oa[..., None], 1e-4)
    billet = np.dstack([u8(rgb), u8(oa * 255)])
    return {"transparent": rgba, "papier": billet, "douteux": bloc.get("douteux", [])}


# =============================================================================================
# Variantes
# =============================================================================================
TITRE = "Les goûters\nde Cécile"
VARIANTES = {
    "a": {
        "nom": "Toile vert sauge, étiquette collée",
        "description": "Toile de reliure vert sauge (vraie toile 1899, passée et frottée), étiquette en papier ancien "
                       "collée, cadre imprimé terracotta, titre à la plume (main du carnet) et une théière au crayon et à l'aquarelle.",
        "type": "toile",
        "toile": "wellcome-beeton1899-toile-sauge-plat",
        "toile_arriere": "wellcome-beeton1899-toile-sauge-arriere",
        "toile_dos": "wellcome-beeton1899-toile-sauge-arriere",
        "toile_dedans": "wellcome-beeton1899-toile-sauge-arriere",
        "fenetre": {"cx": 0.5, "cy": 0.42},
        "fenetre_arriere": {"cx": 0.1, "cy": 0.55, "zoom": 1.08},
        "grade": {"saturation": 0.82, "gain": [1.02, 1.0, 0.97], "decalage": [6, 4, 0]},
        "patine": {"fondu": 0.24, "frotte": 13, "rayon": 11, "chocs": (0.85, 1.0),
                   "taches": [{"x": 0.8, "y": 0.84, "r": 0.075, "force": 0.07, "lave": 0.04, "phase": 1.0}],
                   # au dos, l'anneau d'une tasse de thé posée sur le carnet un jour de goûter
                   "taches_arriere": [{"x": 0.36, "y": 0.7, "r": 0.085, "force": 0.26, "lave": 0.015, "phase": 0.4,
                                       "trait": 7.0, "arc": (2.3, 1.6), "the": 0.9, "rond": True}]},
        "etiquette": {"forme": "octogone", "taille": (500, 258), "centre": (0.53, 0.335), "angle": 1.3,
                      "cadre": "#a4563c", "decolle": "bas-droite", "px": 0.66, "py": 0.3, "teinte": (2, -4, -18)},
        "titre": {"texte": TITRE, "main": "soignee", "encre": "plume", "outil": "plume", "graine": 43, "xh": 31.0,
                  "graisse": 1.15, "lignes": [(0.065, 0.4, "g", -1.0), (0.17, 0.75, "g", -0.6)]},
        "croquis": {"nom": "theiere", "variante": "a", "boite": (0.755, 0.18, 0.195, 0.56), "graine": 5, "xh": 0.62},
        "garde": "uni",
    },
    "b": {
        "nom": "Carton marbré, dos et coins toilés",
        "description": "Demi-reliure : vrai papier marbré peigné (1843) sur le carton, dos et coins de toile verte, "
                       "étiquette en papier ancien (cadre bleu), titre à la plume et un cupcake.",
        "type": "marbre",
        "toile": "wellcome-crawford1853-toile-verte",
        "toile_dos": "wellcome-crawford1853-toile-verte",
        "toile_dedans": "wellcome-crawford1853-toile-verte",
        "grade_toile": {"saturation": 0.9, "gain": [1.18, 1.12, 1.1], "decalage": [10, 8, 6]},
        "grade_dos": {"saturation": 0.9, "gain": [1.18, 1.12, 1.1], "decalage": [10, 8, 6]},
        "grade_dedans": {"saturation": 0.9, "gain": [1.18, 1.12, 1.1], "decalage": [10, 8, 6]},
        "marbre": {"source": "wellcome-ms8207-marbre-plat", "fenetre": {"cx": 0.6, "cy": 0.08, "zoom": 1.0},
                   "fenetre_arriere": {"cx": 0.3, "cy": 0.95, "zoom": 1.0}, "bande": 92, "coin": 128},
        "fenetre": {"cx": 0.5, "cy": 0.5},
        "patine": {"fondu": 0.1, "frotte": 10, "rayon": 7, "chocs": (0.9, 0.7), "usure_fils": 0.9},
        "etiquette": {"forme": "rectangle", "taille": (470, 236), "centre": (0.565, 0.355), "angle": -0.9,
                      "cadre": "#3c5675", "decolle": "haut-droite", "px": 0.25, "py": 0.6, "teinte": (3, -3, -16),
                      "filets": [(9.0, 0.5), (11.6, 1.0)]},
        "titre": {"texte": TITRE, "main": "soignee", "encre": "plume", "outil": "plume", "graine": 41, "xh": 29.0,
                  "graisse": 1.15, "lignes": [(0.27, 0.42, "g", 0.6), (0.37, 0.78, "g", 0.9)]},
        "croquis": {"nom": "cupcake", "variante": "ma", "boite": (0.045, 0.17, 0.2, 0.64), "graine": 3, "xh": 0.62},
        "garde": "marbre",
    },
    "c": {
        "nom": "Toile bleu passé, titre au feutre peinture",
        "description": "Toile bleu passé (vraie toile 1894), le titre écrit directement sur la toile au feutre "
                       "peinture crème, dans la main de Cécile, avec un petit cupcake au même feutre.",
        "type": "toile",
        "toile": "wellcome-haultain1894-toile-bleue-plat",
        "toile_arriere": "wellcome-haultain1894-toile-bleue-arriere",
        "toile_dos": "wellcome-haultain1894-toile-bleue-arriere",
        "toile_dedans": "wellcome-haultain1894-toile-bleue-arriere",
        "fenetre": {"cx": 0.5, "cy": 0.36},
        "fenetre_arriere": {"cx": 0.5, "cy": 0.6},
        "grade": {"saturation": 0.86, "gain": [1.0, 1.0, 0.98], "decalage": [4, 2, 0]},
        "patine": {"fondu": 0.2, "frotte": 12, "rayon": 8, "chocs": (1.0, 0.75),
                   "taches": [{"x": 0.16, "y": 0.9, "r": 0.06, "force": 0.06, "lave": 0.035, "phase": 2.0}]},
        "peinture": {"texte": TITRE, "main": "cecile", "graine": 60, "xh": 42.0, "couleur": "#f3ead6", "epaisseur": 1.9,
                     "lignes": [(0.2, 0.25, "g", -2.5), (0.36, 0.36, "g", -2.0)],
                     "soulignes": [{"ligne": 1, "dy": 0.42}]},
        "croquis": {"nom": "cupcake", "variante": "ma", "boite": (0.63, 0.42, 0.17, 0.19), "graine": 9, "xh": 0.5},
        "garde": "uni",
    },
}


# =============================================================================================
# Cuisson
# =============================================================================================
def ecrire_image(nom: str, arr: np.ndarray, q=Q_TOILE, qa=Q_ALPHA, un=True, opaque=False, racine: Path = BAKED) -> dict:
    """<racine>/<nom>.webp (2×) et, si `un`, la variante 1× (<dossier>/1x/<partie>.webp)."""
    a = u8(arr)
    if opaque and a.shape[2] == 4:
        a = a[..., :3]
    f = racine / f"{nom}.webp"
    f.parent.mkdir(parents=True, exist_ok=True)
    data = webp(a, q, qa)
    f.write_bytes(data)
    info = {"nom": nom, "w": a.shape[1], "h": a.shape[0], "ko": round(len(data) / 1024, 1)}
    if un:
        mode = "RGBA" if a.shape[2] == 4 else "RGB"
        petit = Image.fromarray(a, mode).resize((max(1, a.shape[1] // 2), max(1, a.shape[0] // 2)), Image.LANCZOS)
        d1 = webp(np.asarray(petit), q, qa)
        dossier, _, partie = nom.rpartition("/")
        f1 = racine / dossier / "1x" / f"{partie}.webp"
        f1.parent.mkdir(parents=True, exist_ok=True)
        f1.write_bytes(d1)
        info["ko1x"] = round(len(d1) / 1024, 1)
    return info


def teinte_moyenne(arr: np.ndarray) -> str:
    a = arr[..., :3].reshape(-1, 3)
    if arr.shape[2] == 4:
        m = arr[..., 3].reshape(-1) > 200
        a = a[m]
    return rgbhex(np.median(a, axis=0))


def cuire_variante(v: str) -> dict:
    cfg = VARIANTES[v]
    t0 = time.time()
    journal = []
    base = f"couverture/{v}"
    man = {"nom": cfg["nom"], "description": cfg["description"], "parties": {}}
    if cfg["type"] == "marbre":
        plat = plat_marbre(v, cfg, "plat")
        arr = plat_marbre(v, cfg, "arriere")
    else:
        plat = plat_toile(v, cfg, "plat")
        arr = plat_toile(v, cfg, "arriere")
    if "peinture" in cfg:
        plat = peindre(plat, cfg, v)
    man["teinte"] = teinte_moyenne(plat)
    rac = dossier_de(v)
    for partie, img in (("plat", plat), ("arriere", arr)):
        journal.append(ecrire_image(f"{base}/{partie}", img, racine=rac))
    cp, origine = contreplat(v, cfg, "avant")
    journal.append(ecrire_image(f"{base}/contreplat", cp, q=82, racine=rac))
    cpa, _ = contreplat(v, cfg, "arriere")
    journal.append(ecrire_image(f"{base}/contreplat-arriere", cpa, q=82, racine=rac))
    man["garde"] = origine
    man["teinte_garde"] = rgbhex(np.median(cp[int(0.2 * PH):int(0.8 * PH), int(0.2 * PW):int(0.8 * PW), :3].reshape(-1, 3), axis=0))
    journal.append(ecrire_image(f"{base}/dos", dos(v, cfg), q=84, racine=rac))
    journal.append(ecrire_image(f"{base}/chant", chant(v, cfg), q=84, racine=rac))
    journal.append(ecrire_image(f"{base}/tranche", tranche(v, PAGE_H, rng_de("tranche", v)), q=86, racine=rac))
    tp = tranche(v, PAGE_W, rng_de("tranche-pied", v))
    tp = np.transpose(tp, (1, 0, 2))[::-1].copy()  # longueur à l'horizontale, feuillets de haut en bas
    journal.append(ecrire_image(f"{base}/tranche-pied", tp, q=86, racine=rac))
    if "etiquette" in cfg:
        et, place = etiquette(v, cfg)
        journal.append(ecrire_image(f"{base}/etiquette", et, q=88, qa=95, racine=rac))
        man["etiquette"] = place
        if place.get("douteux"):
            print(f"  ⚠ {v} : mots douteux sur l'étiquette : {place['douteux']}")
    else:
        man["etiquette"] = None
    for j in journal:
        man["parties"][j["nom"].rpartition("/")[2]] = {k: j[k] for k in ("w", "h", "ko", "ko1x") if k in j}
    print(f"  {v} — {cfg['nom']} : " + ", ".join(f"{j['nom'].rpartition('/')[2]} {j['ko']} Ko" for j in journal)
          + f" ({time.time() - t0:.1f} s)")
    return man


def cuire_indices() -> dict:
    out = {}
    for cle, texte in INDICES.items():
        r = indice(cle, texte)
        # indices/<m> : l'étiquette — un billet de papier écrit au crayon, fond transparent autour, ombre cuite
        # (lisible sur la toile à 3 m) ; indices/<m>-crayon : le crayon seul, pour un fond de papier clair.
        i2 = ecrire_image(f"indices/{cle}", r["papier"], q=88, qa=95, un=False)
        i1 = ecrire_image(f"indices/{cle}-crayon", r["transparent"], q=90, qa=100, un=False)
        out[cle] = {"texte": texte, "image": f"indices/{cle}", "crayon": f"indices/{cle}-crayon",
                    "taille": [i2["w"] // ECH, i2["h"] // ECH], "taille_crayon": [i1["w"] // ECH, i1["h"] // ECH],
                    "xh": XH_INDICE}
        if r["douteux"]:
            print(f"  ⚠ indice {cle} : mots douteux {r['douteux']}")
        print(f"  indice {cle} : {i1['ko']} Ko, billet {i2['ko']} Ko")
    return out


def ecrire_manifeste(variantes: dict, indices: dict | None):
    ancien = json.loads(MANIFESTE.read_text()) if MANIFESTE.exists() else {}
    vs = {k: v for k, v in ancien.get("variantes", {}).items() if k == ACTIVE}
    vs.update({k: v for k, v in variantes.items() if k == ACTIVE})
    comp = {k: v for k, v in ancien.get("comparees", {}).items() if k != ACTIVE}
    comp.update({k: {"nom": v["nom"], "description": v["description"], "dossier": f"verification/out/v4-c/variantes/couverture/{k}"}
                 for k, v in variantes.items() if k != ACTIVE})
    # la planche de comparaison relit les manifestes complets des variantes écartées
    (COMPAREES / "couverture").mkdir(parents=True, exist_ok=True)
    for k, v in variantes.items():
        if k != ACTIVE:
            (COMPAREES / "couverture" / k / "manifeste.json").write_text(json.dumps(v, indent=1, ensure_ascii=False) + "\n")
    man = {
        "_": "Écrit par scripts/pages/couverture.py (lot C). Noms logiques d'assetUrl() (design-system/baked/…). "
             "Rectangles en fractions du plat [x, y, largeur, hauteur]. Plat de référence : 868 × 1222 px "
             "(page 850 × 1200 + débords du carton 18 / 6 / 16), cuit à 2× (et 1×).",
        "version": 1,
        "active": ACTIVE,
        "plat": [PLAT_W, PLAT_H],
        "dos": DOS_W, "bloc": BLOC, "epaisseur": EP,
        "titre": "Les goûters de Cécile",
        "variantes": dict(sorted(vs.items())),
        "comparees": dict(sorted(comp.items())),
        "indices": indices if indices is not None else ancien.get("indices", {}),
    }
    MANIFESTE.parent.mkdir(parents=True, exist_ok=True)
    MANIFESTE.write_text(json.dumps(man, indent=1, ensure_ascii=False) + "\n")


# =============================================================================================
# Planche du GATE (HTML capturé par Playwright)
# =============================================================================================
def _manifeste_de(v: str) -> dict:
    if v == ACTIVE:
        return json.loads(MANIFESTE.read_text())["variantes"][v]
    return json.loads((COMPAREES / "couverture" / v / "manifeste.json").read_text())


def _page_html(pid: str | None) -> str:
    """Une page cuite (papier + encre), sinon un feuillet vierge du carnet."""
    pages = json.loads((RACINE / "src/content/pages/manifeste.json").read_text()).get("pages", {})
    p = pages.get(pid) if pid else None
    if p and (BAKED / f"{p['encre']}.webp").exists() and (BAKED / f"{p['papier']}.webp").exists():
        mir = ' style="transform:scaleX(-1)"' if p.get("miroir") else ""
        return f'<img class="pg" src="/design-system/baked/{p["papier"]}.webp"{mir}><img class="pg" src="/design-system/baked/{p["encre"]}.webp">'
    return '<img class="pg" src="/design-system/baked/pages/papier/f9.webp">'


def _livre_ferme(v: str, c: dict, face: str = "avant", s: float = 0.5) -> str:
    """Carnet fermé, boîte 3D CSS : dessus (plat ou plat arrière), tranches de pied et de gouttière, dos."""
    b = f"{url_de(v)}/couverture/{v}"
    et = ""
    if face == "avant" and c.get("etiquette"):
        x, y, w_, h_ = c["etiquette"]["rect"]
        et = f'<img class="et" src="{b}/etiquette.webp" style="left:{x * 100:.3f}%;top:{y * 100:.3f}%;width:{w_ * 100:.3f}%;height:{h_ * 100:.3f}%">'
    dessus = "plat" if face == "avant" else "arriere"
    return f"""
      <div class="livre {face}" style="--s:{s}">
        <div class="ombre"></div><div class="ombre ombre2"></div>
        <div class="f chant-pied bas" style="background-image:url({b}/{dessus}.webp)"></div>
        <div class="f bloc-pied" style="background-image:url({b}/tranche-pied.webp)"></div>
        <div class="f chant-pied haut" style="background-image:url({b}/{dessus}.webp)"></div>
        <div class="f chant-cote bas" style="background-image:url({b}/chant.webp)"></div>
        <div class="f bloc-goutt" style="background-image:url({b}/tranche.webp)"></div>
        <div class="f chant-cote haut" style="background-image:url({b}/chant.webp)"></div>
        <div class="f dos" style="background-image:url({b}/dos.webp)"></div>
        <div class="f dessus"><img class="plat" src="{b}/{dessus}.webp">{et}</div>
      </div>"""


def _livre_ouvert(v: str, moment: str = "debut", s: float = 0.5) -> str:
    """Carnet ouvert à plat : au début (contre-plat avant + page de titre) ou à la fin (dernière page +
    contre-plat arrière)."""
    b = f"{url_de(v)}/couverture/{v}"
    if moment == "debut":
        gauche = f'<div class="carton g"><img src="{b}/contreplat.webp"></div>'
        droite = (f'<div class="carton d"><img src="{b}/contreplat-arriere.webp"></div><div class="feuilles d"></div>'
                  f'<div class="page d">{_page_html("titre")}<div class="pli d"></div></div>')
    else:
        gauche = (f'<div class="carton g"><img src="{b}/contreplat.webp"></div><div class="feuilles g"></div>'
                  f'<div class="page g">{_page_html("fin-gauche")}<div class="pli g"></div></div>')
        droite = f'<div class="carton d"><img src="{b}/contreplat-arriere.webp"></div>'
    return f'<div class="ouvert-livre {moment}" style="--s:{s}">{gauche}{droite}<div class="gouttiere"></div></div>'


CSS_PLANCHE = """
body { margin:0; background:#231d19; font:16px/1.35 system-ui, sans-serif; color:#eadfcc; }
h1 { font-weight:600; font-size:24px; margin:20px 30px 4px; }
p.note { margin:0 30px 6px; font-size:15px; color:#c4b8a4; max-width:1600px; }
.ligne h2 { font-weight:600; font-size:19px; margin:18px 30px 8px; }
.ligne h2 small { font-weight:400; color:#c4b8a4; font-size:15px; }
.scenes { display:flex; gap:18px; padding:0 30px; }
.vue { position:relative; height:600px; border-radius:6px; overflow:hidden; background:#5a3c28; }
.ferme { width:760px; perspective:1500px; perspective-origin:88% 92%; }
.ouvert { flex:1; background:#6b4a33 url(/design-system/textures/wood.webp) 0 0 / 1000px auto; box-shadow: inset 0 0 140px rgba(20,10,0,.5); }
.pose { position:absolute; left:150px; top:46px; transform-style:preserve-3d; transform: rotateX(30deg) rotateZ(-5deg); }
.bois { position:absolute; left:-900px; top:-700px; width:2400px; height:2200px; transform: translateZ(-1px);
  background:#6b4a33 url(/design-system/textures/wood.webp) 0 0 / 1000px auto; box-shadow: inset 0 0 260px rgba(20,10,0,.55); }
.livre { --W:calc(868px*var(--s)); --H:calc(982px*var(--s)); --E:calc(10px*var(--s)); --B:calc(""" + str(BLOC) + """px*var(--s));
  --pw:calc(850px*var(--s)); --ph:calc(960px*var(--s)); --hh:calc(6px*var(--s)); --oo:calc(18px*var(--s)); --T:calc(var(--E)*2 + var(--B));
  position:absolute; width:var(--W); height:var(--H); transform-style:preserve-3d; }
.f { position:absolute; background-size:100% 100%; backface-visibility:hidden; transform-origin:0 0; }
.ombre { position:absolute; inset:0; background:rgba(28,14,4,.55); filter:blur(3px); transform: translate(3px,4px); border-radius:6px; }
.ombre2 { background:rgba(28,14,4,.35); filter:blur(18px); transform: translate(20px,26px) scale(1.02); }
.dessus { left:0; top:0; width:var(--W); height:var(--H); transform: translateZ(var(--T)); }
.dessus .plat { position:absolute; inset:0; width:100%; height:100%; }
.dessus .et { position:absolute; }
.chant-pied { left:0; top:var(--H); width:var(--W); height:var(--E); background-size:100% calc(982px*var(--s)); background-position:0 100%; filter:brightness(.78); }
.chant-pied.haut { transform: translateZ(var(--T)) rotateX(-90deg); }
.chant-pied.bas { transform: translateZ(var(--E)) rotateX(-90deg); }
.bloc-pied { top:calc(var(--hh) + var(--ph)); width:var(--pw); height:var(--B); transform: translateZ(calc(var(--E) + var(--B))) rotateX(-90deg); }
.chant-cote { top:0; width:var(--E); height:var(--H); filter:brightness(.9); }
.bloc-goutt { top:var(--hh); width:var(--B); height:var(--ph); }
.dos { top:0; width:var(--T); height:var(--H); }
/* plat avant en haut : dos à gauche, gouttière à droite */
.avant .bloc-pied { left:0; }
.avant .chant-cote { left:var(--W); }
.avant .chant-cote.haut { transform: translateZ(var(--T)) rotateY(90deg); }
.avant .chant-cote.bas { transform: translateZ(var(--E)) rotateY(90deg); }
.avant .bloc-goutt { left:var(--pw); transform: translateZ(calc(var(--E) + var(--B))) rotateY(90deg); }
.avant .dos { left:0; transform: rotateY(-90deg); }
/* posé sur le plat avant, plat arrière en haut : dos à droite, gouttière à gauche */
.arriere .bloc-pied { left:var(--oo); }
.arriere .chant-cote { left:0; transform-origin:0 0; }
.arriere .chant-cote.haut { transform: translateZ(calc(var(--T) - var(--E))) rotateY(-90deg); }
.arriere .chant-cote.bas { transform: rotateY(-90deg); }
.arriere .bloc-goutt { left:var(--oo); transform: translateZ(var(--E)) rotateY(-90deg); }
.arriere .dos { left:var(--W); transform: translateZ(var(--T)) rotateY(90deg); }
.ouvert-livre { --W:calc(868px*var(--s)); --H:calc(982px*var(--s)); --pw:calc(850px*var(--s)); --ph:calc(960px*var(--s));
  position:absolute; left:50%; top:50%; width:calc(var(--pw)*2); height:var(--ph); transform: translate(-50%,-50%) rotate(-1.4deg); }
.ouvert-livre .carton { position:absolute; top:calc(-6px*var(--s)); width:var(--W); height:var(--H); filter: drop-shadow(8px 12px 14px rgba(25,12,2,.5)); }
.ouvert-livre .carton img { width:100%; height:100%; display:block; }
.ouvert-livre .carton.g { left:calc(-18px*var(--s)); }
.ouvert-livre .carton.d { left:var(--pw); }
.ouvert-livre .feuilles { position:absolute; top:0; width:var(--pw); height:var(--ph); background:#e2d3b1; }
.ouvert-livre .feuilles.d { left:var(--pw); box-shadow: 1px 1px 0 #d6c6a2, 2px 2px 0 #e4d6b6, 3px 3px 0 #cdbb95, 4px 4px 0 #e0d1ae, 5px 5px 0 #c9b791; }
.ouvert-livre .feuilles.g { left:0; box-shadow: -1px 1px 0 #d6c6a2, -2px 2px 0 #e4d6b6, -3px 3px 0 #cdbb95, -4px 4px 0 #e0d1ae, -5px 5px 0 #c9b791; }
.ouvert-livre .page { position:absolute; top:0; width:var(--pw); height:var(--ph); overflow:hidden; }
.ouvert-livre .page.d { left:var(--pw); }
.ouvert-livre .page.g { left:0; }
.ouvert-livre .pg { position:absolute; inset:0; width:100%; height:100%; }
.ouvert-livre .pli { position:absolute; inset:0; }
.ouvert-livre .pli.d { background:linear-gradient(to right, rgba(60,35,20,.42), rgba(60,35,20,.12) 12px, transparent 40px); }
.ouvert-livre .pli.g { background:linear-gradient(to left, rgba(60,35,20,.46), rgba(60,35,20,.14) 12px, transparent 44px); }
.ouvert-livre .gouttiere { position:absolute; left:calc(var(--pw) - 30px); width:60px; top:0; height:var(--ph);
  background:linear-gradient(to right, transparent, rgba(60,35,20,.22) 45%, rgba(60,35,20,.3) 50%, rgba(60,35,20,.12) 55%, transparent); }
"""


def _capturer(html: str, nom: str, sorties: list[tuple[str, str]]):
    """Écrit verification/out/v4-c/<nom>.html et le capture (page entière + éléments)."""
    VERIF.mkdir(parents=True, exist_ok=True)
    (VERIF / f"{nom}.html").write_text(html)
    sel = json.dumps(sorties)
    js = f"""
import {{ launch }} from '{(RACINE / 'scripts/lib/browser.mjs').as_posix()}';
import {{ serve }} from '{(RACINE / 'scripts/lib/serve.mjs').as_posix()}';
const srv = await serve();
const b = await launch();
const p = await b.newPage({{ viewport: {{ width: 1920, height: 1000 }}, deviceScaleFactor: 1 }});
const erreurs = [];
p.on('pageerror', (e) => erreurs.push(String(e)));
p.on('response', (r) => {{ if (r.status() >= 400) erreurs.push(r.status() + ' ' + r.url()); }});
await p.goto(srv.url + '/verification/out/v4-c/{nom}.html');
await p.waitForLoadState('networkidle');
await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => 0))));
await p.waitForTimeout(300);
await p.screenshot({{ path: '{(VERIF / nom).as_posix()}.png', fullPage: true }});
for (const [s, f] of {sel}) {{
  const el = await p.$(s);
  if (el) await el.screenshot({{ path: '{VERIF.as_posix()}/' + f }});
}}
await b.close(); await srv.close();
for (const e of erreurs) console.log('  ✗ ' + e);
console.log('planche : {(VERIF / nom).as_posix()}.png');
"""
    subprocess.run(["node", "--input-type=module", "-e", js], cwd=RACINE, check=True)


def planche(variantes: list[str]):
    """Planches : couvertures.png (les trois variantes, fermées et ouvertes) et couverture-finale.png (la
    variante retenue : fermée sur ses deux plats, ouverte au début et à la fin)."""
    lignes, sorties = [], []
    for k, v in enumerate(variantes):
        c = _manifeste_de(v)
        choix = " <small>(retenue)</small>" if v == ACTIVE else ""
        lignes.append(f"""
<section class="ligne" id="v-{v}">
  <h2>{v.upper()} — {c['nom']}{choix}</h2>
  <div class="scenes">
    <div class="vue ferme"><div class="pose"><div class="bois"></div>{_livre_ferme(v, c)}</div></div>
    <div class="vue ouvert">{_livre_ouvert(v, "debut")}</div>
  </div>
</section>""")
        sorties += [(f"#v-{v} .ferme", f"couverture-{v}-ferme.png"), (f"#v-{v} .ouvert", f"couverture-{v}-ouvert.png")]
    html = (f'<!doctype html><html lang="fr"><meta charset="utf-8"><title>Couvertures</title><style>{CSS_PLANCHE}</style>'
            f'<h1>Couverture cuite — 3 variantes comparées</h1>'
            f'<p class="note">Vraies reliures anciennes scannées (Wellcome Collection, domaine public), étiquette en vrai papier '
            f'ancien, titre écrit trait par trait, l’encre bue par le papier, comme les pages. À gauche : le carnet fermé, posé '
            f'sur la table. À droite : ouvert sur le contre-plat (remplis de toile, garde de Pa collée) et la page de titre '
            f'(feuillet vierge tant qu’elle n’est pas cuite).</p>{"".join(lignes)}</html>')
    _capturer(html, "couvertures", sorties)
    # planche de la variante retenue
    v = ACTIVE
    c = _manifeste_de(v)
    html = (f'<!doctype html><html lang="fr"><meta charset="utf-8"><title>Couverture retenue</title><style>{CSS_PLANCHE}</style>'
            f'<h1>Couverture retenue : {v.upper()} — {c["nom"]}</h1><p class="note">{c["description"]}</p>'
            f'<section class="ligne" id="f1"><h2>Fermé, plat avant · ouvert au début (contre-plat avant, page de titre)</h2><div class="scenes">'
            f'<div class="vue ferme"><div class="pose"><div class="bois"></div>{_livre_ferme(v, c, "avant")}</div></div>'
            f'<div class="vue ouvert">{_livre_ouvert(v, "debut")}</div></div></section>'
            f'<section class="ligne" id="f2"><h2>Ouvert à la fin (dernière page, contre-plat arrière) · refermé sur le plat arrière</h2><div class="scenes">'
            f'<div class="vue ferme"><div class="pose"><div class="bois"></div>{_livre_ferme(v, c, "arriere")}</div></div>'
            f'<div class="vue ouvert">{_livre_ouvert(v, "fin")}</div></div></section></html>')
    _capturer(html, "couverture-finale", [("#f1 .ferme", "finale-avant.png"), ("#f1 .ouvert", "finale-ouvert-debut.png"),
                                          ("#f2 .ferme", "finale-arriere.png"), ("#f2 .ouvert", "finale-ouvert-fin.png")])


# =============================================================================================
def main(argv=None):
    global REECRIRE
    ap = argparse.ArgumentParser()
    ap.add_argument("--variantes", default="a,b,c")
    ap.add_argument("--indices", action="store_true", help="cuit aussi les indices « … pour ouvrir »")
    ap.add_argument("--planche", action="store_true", help="capture verification/out/v4-c/couvertures.png")
    ap.add_argument("--sans-cuisson", action="store_true", help="planche seule (images déjà cuites)")
    ap.add_argument("--reecrire", action="store_true", help="refait l'écriture et les croquis figés (sources/couverture)")
    a = ap.parse_args(argv)
    REECRIRE = a.reecrire
    vs = [v for v in a.variantes.split(",") if v]
    t0 = time.time()
    if not a.sans_cuisson:
        faites = {v: cuire_variante(v) for v in vs}
        ind = cuire_indices() if a.indices else None
        ecrire_manifeste(faites, ind)
        if set(vs) >= set(VARIANTES) and a.indices:  # cuisson complète : on retire l'écriture figée qui ne sert plus
            for d in ("ecriture", "croquis"):
                for g in (SOURCES / d).glob("*.json"):
                    if g not in UTILISES:
                        g.unlink()
    if a.planche:
        planche(vs)
    print(f"couverture : {time.time() - t0:.1f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
