"""Papier des pages cuites : découpes de vrais feuillets anciens scannés (domaine public,
design-system/sources/papier/), une image par FEUILLET du carnet.

Un feuillet porte deux pages : le recto (folio impair, page de droite d'une double page) et le
verso (folio pair suivant, page de gauche de la double page suivante). Le verso est la même image
retournée (miroir horizontal, `transform: scaleX(-1)` à l'affichage) : les rousseurs traversent la
feuille, le bord extérieur reste le même bord. Pendant un tourne-page, la feuille qui tourne montre
donc la même pâte des deux côtés, comme un vrai feuillet.

Une image = la découpe (échelle, position, rotation de 0 ou 180°, miroir du scan) + une légère
variation de teinte (± 4 niveaux) + l'usure des bords en CADRE (pas une vignette ronde) : extérieur
plus marqué, tête et pied un peu, reliure à peine ; limite intérieure irrégulière. Cuite en WebP
opaque à 2× (1700 × 1920).

Plan v4 : le carnet a vécu. Chaque effet a sa clé dans papiers.json ; une clé absente = aucun effet
(mêmes octets qu'avant). Tous sont tirés d'une graine stable par feuillet (`graine` + décalage
propre à l'effet, ou `graine` de l'effet) :

  - `rousseurs` : piqûres brun-roux en grappes et points isolés, plus denses près des bords ;
  - `pouce` : coin bas extérieur (et un peu le haut) assombri, fibres grisées, à peine lustré ;
  - `taches` : 0 à 2 taches de cuisine légères (gras translucide, café, chocolat, rond de tasse),
    rendues comme les lavis des croquis (densité optique, auréole au bord, granulation) ;
  - `lumiere` : très léger dégradé de lumière (le haut plus clair et plus chaud), la même source
    que celle de l'encre (rendu_encre.lumiere_carte) ;
  - ombre de reliure cuite (paramètre `ombre_reliure`, pour l'A5 : à l'écran, le CSS la fait) ;
  - le décalque (encre de la page en vis-à-vis) n'est pas dans le papier : `decalque()` donne une
    transmittance que la cuisson multiplie avec celle de la transparence du verso.

Règle § 6 du contrat : jamais de rousseur ni de tache sous du texte. Sans `eviter`, elles restent
dans les marges communes aux deux faces (bandes de bord, hors folio) ; avec `eviter` (boîtes des
mots des deux faces, `zones_mise`), elles peuvent aussi aller dans les blancs de la page.

Échelle : les rayons, les grains et les tailles sont réglés à l'échelle 2 (px de l'image par px de
la page de référence 850 px) et suivent `echelle` (format a5 : 2,0565 à 300 dpi). La page rognée
garde 850 px de référence de large ; `fond_perdu` (px de référence de chaque côté, compris dans
l'image) prolonge le papier au-delà de la coupe, les effets restent placés sur la page rognée.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

from rendu_encre import flou, vers_lin, vers_srgb

SOURCES = None  # chemin, posé par cuire.py
ECHELLE_REF = 2.0  # échelle à laquelle les rayons ci-dessous ont été réglés (cuisson écran)


def _r(v: float, echelle: float) -> float:
    """Rayon ou taille (px) réglé à l'échelle 2, ramené à `echelle`."""
    return float(v) * float(echelle) / ECHELLE_REF


def _bruit_basse(rng, h, w, echelle):
    """Bruit lisse ≈ N(0, 1) de longueur de corrélation `echelle` px."""
    gh, gw = int(h / echelle) + 3, int(w / echelle) + 3
    g = rng.normal(0, 1, (gh, gw)).astype(np.float32)
    im = Image.fromarray(g, mode="F").resize((w + 2 * int(echelle), h + 2 * int(echelle)), Image.BICUBIC)
    a = np.asarray(im)[int(echelle):int(echelle) + h, int(echelle):int(echelle) + w]
    return a / (a.std() + 1e-6)


# =============================================================================================
# Découpe d'un scan
# =============================================================================================
def _decoupe(cfg: dict, larg: int, haut: int, sources_dir, echelle: float = ECHELLE_REF) -> np.ndarray:
    """Découpe (float32, niveaux sRGB) du scan `source` : échelle `echelle` du cfg réglée pour la
    cuisson à 2× (0,54 ≈ grain à 1,3 × l'échelle réelle d'un A5), `miroir` (scan retourné, avant la
    rotation), `rotation` 0 ou 180, position `x`, `y` (0–1) dans la marge du scan."""
    src = Image.open(Path(sources_dir) / f"{cfg['source']}.jpg").convert("RGB")
    if cfg.get("miroir"):
        src = src.transpose(Image.FLIP_LEFT_RIGHT)
    e = float(cfg.get("echelle", 0.54)) * float(echelle) / ECHELLE_REF
    sw, sh = round(src.width * e), round(src.height * e)
    if sw < larg or sh < haut:
        e = max(larg / src.width, haut / src.height) * 1.001
        sw, sh = round(src.width * e), round(src.height * e)
    im = src.resize((sw, sh), Image.LANCZOS)
    if int(cfg.get("rotation", 0)) % 360 == 180:
        im = im.rotate(180)
    x = round(float(cfg.get("x", 0.5)) * (sw - larg))
    y = round(float(cfg.get("y", 0.5)) * (sh - haut))
    return np.asarray(im.crop((x, y, x + larg, y + haut))).astype(np.float32)


def _usure_bords(a, cfg, rng, larg, haut, echelle, fp, defaut=(0.05, 0.03, 0.035, 0.012)):
    """Usure des bords en cadre (bruni : la luminance baisse, le bleu un peu plus)."""
    yy, xx = np.mgrid[0:haut, 0:larg].astype(np.float32)
    lw, lh = larg - 2 * fp, haut - 2 * fp  # page rognée (px)
    if fp:
        xx -= fp
        yy -= fp
    bords = cfg.get("bords", {})
    k_ext = float(bords.get("exterieur", defaut[0]))
    k_tete = float(bords.get("tete", defaut[1]))
    k_pied = float(bords.get("pied", defaut[2]))
    k_rel = float(bords.get("reliure", defaut[3]))
    n1 = _bruit_basse(rng, haut, larg, _r(90.0, echelle))
    n2 = _bruit_basse(rng, haut, larg, _r(22.0, echelle))
    irr = 0.75 * n1 + 0.35 * n2

    def bande(dist, largeur, k):
        d = dist + irr * largeur * 0.45
        return k * np.clip(1 - d / largeur, 0, 1) ** 1.6

    usure = (bande(lw - 1 - xx, 0.045 * lw, k_ext) + bande(yy, 0.028 * lh, k_tete)
             + bande(lh - 1 - yy, 0.03 * lh, k_pied) + bande(xx, 0.012 * lw, k_rel))
    usure = np.clip(usure, 0, 0.12)
    a *= (1 - usure[..., None] * np.array([0.85, 1.0, 1.45], np.float32))
    return a


def _base_feuillet(cfg, larg, haut, sources_dir, echelle, fp):
    a = _decoupe(cfg, larg, haut, sources_dir, echelle)
    rng = np.random.default_rng(int(cfg.get("graine", 7)))
    # teinte : décalage par canal (niveaux) et luminosité
    a += np.array(cfg.get("teinte", [0, 0, 0]), np.float32)
    a = _usure_bords(a, cfg, rng, larg, haut, echelle, fp)
    # marbrure très lente propre au feuillet (deux feuillets voisins ne se ressemblent pas)
    m = _bruit_basse(rng, haut, larg, _r(420.0, echelle)) * float(cfg.get("marbrure", 1.6))
    a += m[..., None] * np.array([1.0, 1.0, 1.25], np.float32)
    return a


def _base_uni(cfg, larg, haut, sources_dir, echelle, fp):
    """Papier de garde uni : la pâte d'un scan, épaisse (grain adouci), teintée à la cuve vers `ton`
    (la teinte n'est jamais tout à fait égale), bords brunis par l'air."""
    a = _decoupe(cfg, larg, haut, sources_dir, echelle)
    rng = np.random.default_rng(int(cfg.get("graine", 2)))
    lisse = flou(a, _r(1.4, echelle))
    a = lisse + (a - lisse) * float(cfg.get("grain", 0.7))
    cible = np.array(cfg.get("ton", [214, 212, 190]), np.float32)
    moy = a.reshape(-1, 3).mean(0)
    a = a + (cible - moy) * float(cfg.get("ton_force", 0.92))
    a += np.array(cfg.get("teinte", [0, 0, 0]), np.float32)
    a = _usure_bords(a, cfg, rng, larg, haut, echelle, fp, defaut=(0.035, 0.03, 0.035, 0.02))
    m = _bruit_basse(rng, haut, larg, _r(380.0, echelle)) * float(cfg.get("marbrure", 2.2))
    a += m[..., None] * np.array([1.0, 1.0, 1.1], np.float32)
    return a


def _base_marbre(cfg, larg, haut, sources_dir, echelle, fp):
    """Papier de garde marbré : la photo d'un vrai papier marbré ancien, éclairage aplani, couleurs un
    peu passées (`saturation`), éclaircie vers le papier (`eclaircir`), bords à peine brunis."""
    a = _decoupe(cfg, larg, haut, sources_dir, echelle)
    rng = np.random.default_rng(int(cfg.get("graine", 3)))
    w = np.array([0.299, 0.587, 0.114], np.float32)
    k = float(cfg.get("aplanir", 0.7))
    if k:
        Lb = flou(a @ w, _r(300.0, echelle))
        a *= (float(Lb.mean()) / np.maximum(Lb, 1.0))[..., None] ** k
    L = (a @ w)[..., None]
    a = L + (a - L) * float(cfg.get("saturation", 0.85))
    ecl = float(cfg.get("eclaircir", 0.0))
    if ecl:
        fond = np.array(cfg.get("fond", [236, 222, 196]), np.float32)
        a = a + (fond - a) * ecl
    a += np.array(cfg.get("teinte", [0, 0, 0]), np.float32)
    a = _usure_bords(a, cfg, rng, larg, haut, echelle, fp, defaut=(0.03, 0.025, 0.03, 0.02))
    return a


# =============================================================================================
# Le papier vécu : rousseurs, pouce, taches, lumière, ombre de reliure
# =============================================================================================
class _Geo:
    """Page rognée dans l'image (orientation du recto : reliure à gauche, extérieur à droite)."""

    def __init__(self, larg, haut, echelle, fond_perdu):
        self.larg, self.haut = int(larg), int(haut)
        self.e = float(echelle)
        self.fp = float(fond_perdu) * self.e  # px
        self.lw = self.larg - 2 * self.fp
        self.lh = self.haut - 2 * self.fp
        self.W = self.lw  # unité de taille : la largeur de la page rognée (px)

    def px(self, fx, fy):
        return self.fp + fx * self.lw, self.fp + fy * self.lh

    def fenetre(self, cx, cy, rx, ry):
        x0 = int(max(0, math.floor(cx - rx)))
        x1 = int(min(self.larg, math.ceil(cx + rx) + 1))
        y0 = int(max(0, math.floor(cy - ry)))
        y1 = int(min(self.haut, math.ceil(cy + ry) + 1))
        if x1 - x0 < 1 or y1 - y0 < 1:
            return None
        return y0, y1, x0, x1


# Marges communes aux deux faces (fractions de la page rognée, orientation du recto) : la page droite
# écrit de 7,8 % à 97,8 % de la largeur, la page gauche (en miroir) de 5,8 % à 94,8 % ; tête 6,2 %,
# pied 96,5 % (mise_en_page.py, Mise.__init__). Le folio est en bas, côté extérieur, sur les deux faces.
ZONE_TEXTE = (0.058, 0.062, 0.978, 0.965)
ZONE_FOLIO = (0.84, 0.935, 0.965, 1.0)
GRILLE = 220  # résolution de la carte des zones interdites (cases sur la largeur)

# Densités optiques des matières (transmittance en lumière linéaire à densité 1, sur le papier).
DO = {
    "rousseur": -np.log(np.array([0.70, 0.50, 0.33], np.float32)),
    "aureole": -np.log(np.array([0.93, 0.85, 0.70], np.float32)),
    "gras": -np.log(np.array([0.90, 0.86, 0.70], np.float32)),
    "cafe": -np.log(np.array([0.80, 0.63, 0.45], np.float32)),
    "chocolat": -np.log(np.array([0.56, 0.40, 0.26], np.float32)),
    "pouce": -np.log(np.array([0.80, 0.785, 0.775], np.float32)),  # crasse gris-brun
}


def _interdit(eviter, cfg, geo: _Geo) -> np.ndarray:
    """Carte (gh, gw) booléenne des zones où ne poser ni rousseur ni tache (texte des deux faces,
    folio), un peu dilatée."""
    gw = GRILLE
    gh = max(8, int(round(GRILLE * geo.lh / max(geo.lw, 1))))
    M = np.zeros((gh, gw), bool)
    if eviter is None:
        rects = [ZONE_TEXTE]
    elif isinstance(eviter, np.ndarray):
        e = np.asarray(eviter, np.float32)
        im = Image.fromarray((np.clip(e, 0, 1) * 255).astype(np.uint8)).resize((gw, gh), Image.BOX)
        M |= np.asarray(im) > 20
        rects = []
    else:
        rects = list(eviter)
    if cfg.get("folio", True):
        rects.append(ZONE_FOLIO)
    for x0, y0, x1, y1 in rects:
        a0, a1 = int(math.floor(max(0.0, x0) * gw)), int(math.ceil(min(1.0, x1) * gw))
        b0, b1 = int(math.floor(max(0.0, y0) * gh)), int(math.ceil(min(1.0, y1) * gh))
        if a1 > a0 and b1 > b0:
            M[b0:b1, a0:a1] = True
    # marge de sécurité ≈ 1 % de la largeur (≈ 8 px de page)
    d = max(1, int(round(0.01 * gw)))
    D = M.copy()
    for k in range(1, d + 1):
        D[k:, :] |= M[:-k, :]
        D[:-k, :] |= M[k:, :]
    M2 = D.copy()
    for k in range(1, d + 1):
        M2[:, k:] |= D[:, :-k]
        M2[:, :-k] |= D[:, k:]
    return M2


def _libre(M, fx, fy) -> bool:
    gh, gw = M.shape
    if not (0 <= fx < 1 and 0 <= fy < 1):
        return True
    return not M[min(gh - 1, int(fy * gh)), min(gw - 1, int(fx * gw))]


def _recouvrement(M, fx, fy, rx, ry, anneau=None):
    """Empreinte d'une tache : ellipse de demi-axes `rx` (fraction de la largeur) et `ry` (fraction
    de la hauteur) ; `anneau` : épaisseur relative quand seul le bord compte (rond de tasse).
    → (part de l'empreinte visible qui tombe en zone interdite, nombre de cases visibles)."""
    gh, gw = M.shape
    ys, xs = np.mgrid[0:gh, 0:gw]
    dx = ((xs + 0.5) / gw - fx) / rx
    dy = ((ys + 0.5) / gh - fy) / ry
    d = np.sqrt(dx * dx + dy * dy)
    emp = d <= 1.0 if anneau is None else np.abs(d - 1.0) <= anneau
    n = int(emp.sum())
    if n == 0:
        return 0.0, 0.0
    total = math.pi * rx * gw * ry * gh * (1.0 if anneau is None else 4 * anneau)
    return float((emp & M).sum()) / n, min(1.0, n / max(total, 1.0))


def _relief_local(a_win: np.ndarray, echelle: float) -> np.ndarray:
    """Passe-haut de la luminance (≈ écart-type 1) : + = fibre claire (en relief)."""
    L = a_win @ np.array([0.299, 0.587, 0.114], np.float32)
    hp = L - flou(L, _r(2.0, echelle))
    return np.clip(hp / (hp.std() + 1e-6), -3, 3).astype(np.float32)


def _appliquer(Lin, win, T):
    y0, y1, x0, x1 = win
    Lin[y0:y1, x0:x1] *= T


# ---- rousseurs -------------------------------------------------------------------------------
def _point(Lin, geo, cx, cy, r, d, rng_vals, halo_k=3.0):
    """Une piqûre : cœur brun-roux irrégulier (deux gouttes décalées) et auréole jaunâtre."""
    ang, asp, ox, oy, k2 = rng_vals
    R = r * halo_k * 2.0 + 2.0
    win = geo.fenetre(cx, cy, R, R)
    if win is None:
        return
    y0, y1, x0, x1 = win
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dx, dy = xx + 0.5 - cx, yy + 0.5 - cy
    ca, sa = math.cos(ang), math.sin(ang)
    u = (dx * ca + dy * sa) / (r * 1.0)
    v = (-dx * sa + dy * ca) / (r * asp)
    c1 = np.exp(-(u * u + v * v) * 1.1)
    u2, v2 = u - ox, v - oy
    c2 = np.exp(-(u2 * u2 + v2 * v2) * 1.6) * k2
    coeur = np.maximum(c1, c2)
    rh = halo_k
    halo = np.exp(-(u * u + v * v) / (rh * rh)) * 0.22
    D = d * coeur[..., None] * DO["rousseur"] + d * halo[..., None] * DO["aureole"]
    _appliquer(Lin, win, np.exp(-D))


def _rousseurs(Lin, cfg_r: dict, geo: _Geo, graine: int, M):
    rng = np.random.default_rng(int(cfg_r.get("graine", graine * 7 + 101)))
    force = float(cfg_r.get("force", 1.0))
    taille = float(cfg_r.get("taille", 1.0))
    n_pts = int(cfg_r.get("points", 22))
    n_amas = int(cfg_r.get("amas", 1))
    e = geo.e
    lw, lh = geo.lw, geo.lh
    rapport = lw / lh

    def sur_un_bord(rng, echelle_bord):
        bord = int(rng.choice(4, p=[0.44, 0.22, 0.24, 0.10]))  # extérieur, tête, pied, reliure
        dist = min(float(rng.exponential(echelle_bord)), 0.09)  # en largeurs de page
        le_long = float(rng.uniform(0.02, 0.98))
        if bord == 0:
            return 1.0 - dist, le_long
        if bord == 1:
            return le_long, dist * rapport
        if bord == 2:
            return le_long, 1.0 - dist * rapport
        return dist, le_long

    def tirer_point(rng, r_moy, d_moy):
        gros = rng.random() < 0.06
        r = float(np.clip(np.exp(rng.normal(math.log(r_moy), 0.45)), 0.35, 3.0))
        if gros:
            r = float(rng.uniform(1.8, 4.2))
        d = float(np.clip(np.exp(rng.normal(math.log(d_moy), 0.6)), 0.06, 1.0))
        vals = (float(rng.uniform(0, math.pi)), float(rng.uniform(0.55, 1.0)), float(rng.normal(0, 0.7)),
                float(rng.normal(0, 0.7)), float(rng.uniform(0.3, 0.9)))
        hk = float(rng.uniform(2.2, 3.6))
        return r * taille, d, vals, hk

    # points isolés, plus serrés près des bords
    for _ in range(n_pts):
        fx, fy = sur_un_bord(rng, 0.03)
        r, d, vals, hk = tirer_point(rng, 0.8, 0.32)
        if not _libre(M, fx, fy):
            continue
        cx, cy = geo.px(fx, fy)
        _point(Lin, geo, cx, cy, r * e, d * force, vals, hk)
    # grappes : un nuage brun très pâle et des piqûres serrées, dans un blanc près d'un bord
    for _ in range(n_amas):
        cands = [sur_un_bord(rng, 0.03) for _ in range(10)]
        n = int(rng.integers(10, 26))
        sig = float(rng.uniform(0.008, 0.02))  # largeurs de page
        asp = float(rng.uniform(0.5, 1.0))
        ang = float(rng.uniform(0, math.pi))
        pts = [(rng.normal(0, 1), rng.normal(0, 1)) + tirer_point(rng, 0.75, 0.45) for _ in range(n)]
        nuage = _bruit_basse(rng, 64, 64, 9.0)
        libres = [c for c in cands if _libre(M, *c)]
        if not libres:
            continue  # jamais sous le texte
        fx, fy = libres[0]
        cx, cy = geo.px(fx, fy)
        # nuage (coupé là où il toucherait le texte)
        R = sig * lw * 3.0
        win = geo.fenetre(cx, cy, R, R)
        if win is not None:
            y0, y1, x0, x1 = win
            yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
            g = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (sig * lw * 1.6) ** 2))
            nz = np.asarray(Image.fromarray(nuage).resize((x1 - x0, y1 - y0), Image.BICUBIC))
            g = g * np.clip(0.7 + 0.35 * nz, 0.2, 1.3) * _champ_libre(M, geo, win)
            _appliquer(Lin, win, np.exp(-(0.22 * force) * g[..., None] * DO["aureole"]))
        ca, sa = math.cos(ang), math.sin(ang)
        for gx, gy, r, d, vals, hk in pts:
            ox, oy = gx * sig, gy * sig * asp
            px_ = fx + ox * ca - oy * sa
            py_ = fy + (ox * sa + oy * ca) * rapport
            if not _libre(M, px_, py_):
                continue
            qx, qy = geo.px(px_, py_)
            _point(Lin, geo, qx, qy, r * e, d * force, vals, hk)


def _champ_libre(M, geo: _Geo, win) -> np.ndarray:
    """1 hors des zones interdites, 0 dedans, adouci, sur une fenêtre de l'image."""
    y0, y1, x0, x1 = win
    gh, gw = M.shape
    yy = ((np.arange(y0, y1, dtype=np.float32) + 0.5 - geo.fp) / geo.lh * gh)
    xx = ((np.arange(x0, x1, dtype=np.float32) + 0.5 - geo.fp) / geo.lw * gw)
    iy = np.clip(yy.astype(int), 0, gh - 1)
    ix = np.clip(xx.astype(int), 0, gw - 1)
    dedans = ((yy >= 0) & (yy < gh))[:, None] & ((xx >= 0) & (xx < gw))[None, :]
    f = np.where(dedans, 1.0 - M[iy][:, ix].astype(np.float32), 1.0)
    return flou(f.astype(np.float32), max(1.0, 0.6 * geo.lw / gw)).astype(np.float32)


# ---- usure au pouce --------------------------------------------------------------------------
def _pouce(a, Lin, cfg_p: dict, geo: _Geo, graine: int):
    """Coin bas extérieur (et, plus faiblement, le haut) : le doigt qui tourne la page. Assombri et
    grisé, la crasse se pose sur les fibres en relief ; au plus frotté, le grain s'adoucit (lustre)."""
    rng = np.random.default_rng(int(cfg_p.get("graine", graine * 7 + 202)))
    force = float(cfg_p.get("force", 1.0))
    t = float(cfg_p.get("taille", 0.11))  # largeurs de page
    lustre = float(cfg_p.get("lustre", 1.0))
    coins = [(1.0, float(cfg_p.get("bas", 1.0))), (0.0, float(cfg_p.get("haut", 0.35)))]
    lw = geo.lw
    for fy_coin, k in coins:
        nb = _bruit_basse(rng, 96, 96, 14.0)
        dcx = float(rng.uniform(0.035, 0.06))
        dcy = float(rng.uniform(0.03, 0.06)) * lw / geo.lh
        if k <= 0:
            continue
        cx, cy = geo.px(1.0 - dcx, fy_coin + (-dcy if fy_coin > 0.5 else dcy))
        rx, ry = t * lw, t * lw * 1.25
        bx, by = geo.px(1.0, fy_coin)
        x0 = int(max(0, math.floor(cx - 2.4 * rx)))
        x1 = geo.larg
        if fy_coin > 0.5:
            y0, y1 = int(max(0, math.floor(cy - 2.4 * ry))), geo.haut
        else:
            y0, y1 = 0, int(min(geo.haut, math.ceil(cy + 2.4 * ry)))
        if x1 <= x0 or y1 <= y0:
            continue
        win = (y0, y1, x0, x1)
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        nz = np.asarray(Image.fromarray(nb).resize((x1 - x0, y1 - y0), Image.BICUBIC))
        dx = (xx - cx) / rx
        dy = (yy - cy) / ry
        m = np.exp(-(dx * dx + dy * dy)) * np.clip(1 + 0.35 * nz, 0.3, 1.6)
        # tout près des bords, la feuille est plus manipulée encore
        prox = np.exp(-np.clip(bx - xx, 0, None) / (0.02 * lw)) * np.exp(-np.abs(by - yy) / (0.03 * lw))
        m = np.clip(m + 0.35 * prox * np.clip(1 + 0.3 * nz, 0, 2), 0, 1.4) * k
        sub = a[y0:y1, x0:x1]
        rel = _relief_local(sub, geo.e)
        # lustre : là où l'on frotte le plus, les fibres se couchent (grain plus doux)
        if lustre:
            coeur = flou(np.clip(m, 0, 1), _r(24.0, geo.e)) ** 2
            lisse = flou(sub, _r(1.2, geo.e))
            a[y0:y1, x0:x1] = sub + (lisse - sub) * (0.12 * lustre * force * coeur)[..., None]
        mf = m * np.clip(1 + 0.5 * rel, 0.3, 2.0) * 0.75 * force
        _appliquer(Lin, win, np.exp(-mf[..., None] * DO["pouce"]))


# ---- taches de cuisine -----------------------------------------------------------------------
GENRES = ("gras", "cafe", "chocolat", "tasse")
# taille par défaut (rayon, en largeurs de page) et zones préférées (centres, fractions de page)
TACHES_DEFAUT = {
    # gras : là où les doigts tiennent la page (bord extérieur, pied), parfois en tête
    "gras": dict(taille=0.04, zones=[((0.9, 1.0), (0.45, 0.92)), ((0.2, 0.85), (0.9, 1.0)), ((0.15, 0.9), (0.0, 0.06))]),
    # café : une goutte tombée de la tasse posée au-dessus du carnet
    "cafe": dict(taille=0.02, zones=[((0.12, 0.9), (0.005, 0.05)), ((0.94, 1.0), (0.08, 0.5)), ((0.2, 0.8), (0.9, 1.0))]),
    # chocolat : un doigt qui a tenu la page en bas
    "chocolat": dict(taille=0.016, zones=[((0.2, 0.8), (0.9, 0.99)), ((0.95, 1.0), (0.5, 0.88)), ((0.15, 0.85), (0.005, 0.05))]),
    # tasse : le rond du fond d'une tasse posée sur le coin du carnet ouvert ; on n'en voit qu'un arc
    "tasse": dict(taille=0.17, zones=[((1.04, 1.14), (-0.12, -0.03)), ((1.04, 1.14), (1.03, 1.12)), ((0.3, 0.7), (-0.2, -0.155))]),
}


def _plan_taches(cfg: dict, geo: _Geo, graine: int, M) -> list:
    """Taches à peindre : genre, centre (fractions), rayon (largeurs), angle, graine, force.
    Une tache sans `x`/`y` est placée d'après la graine dans une zone préférée de son genre,
    là où elle ne touche pas le texte (sinon elle rapetisse, puis on y renonce)."""
    liste = cfg.get("taches") or []
    if isinstance(liste, dict):
        liste = [liste]
    rapport = geo.lw / geo.lh
    plan = []
    for i, t in enumerate(liste):
        genre = t.get("genre", "gras")
        if genre not in GENRES:
            raise ValueError(f"tache de genre inconnu : {genre} (connus : {GENRES})")
        dft = TACHES_DEFAUT[genre]
        g = int(t.get("graine", graine * 31 + 17 * i + 5))
        r_ = np.random.default_rng(g)
        taille = float(t.get("taille", dft["taille"] * float(r_.uniform(0.85, 1.2))))
        ang = float(t.get("angle", r_.uniform(0, 180)))
        impose = "x" in t and "y" in t
        if impose:
            groupes = [[(float(t["x"]), float(t["y"]))]]
        else:
            zones = dft["zones"]
            z0 = int(t.get("zone", r_.integers(len(zones))))
            groupes = []
            for k in range(len(zones)):
                (xa, xb), (ya, yb) = zones[(z0 + k) % len(zones)]
                groupes.append([(float(r_.uniform(xa, xb)), float(r_.uniform(ya, yb))) for _ in range(16)])
        anneau = 0.06 if genre == "tasse" else None
        vis_min = 0.06 if genre == "tasse" else 0.4  # une tache doit se voir, pas seulement dépasser
        choix = None
        if impose:
            choix = (groupes[0][0][0], groupes[0][0][1], taille)
        for s in (1.0, 0.8, 0.62):
            # zones dans l'ordre de préférence ; dans une zone, la place où la tache se voit le mieux
            for cands in groupes:
                if choix is not None:
                    break
                meilleur = None
                for cx, cy in cands:
                    part, vis = _recouvrement(M, cx, cy, taille * s, taille * s * rapport, anneau)
                    if part > 0.02 or vis < vis_min:
                        continue
                    note = min(vis, 0.8)
                    if meilleur is None or note > meilleur[0] + 1e-9:
                        meilleur = (note, cx, cy)
                if meilleur is not None:
                    choix = (meilleur[1], meilleur[2], taille * s)
            if choix is not None:
                break
        if choix is None:
            continue
        plan.append(dict(genre=genre, x=choix[0], y=choix[1], taille=choix[2], angle=ang, graine=g,
                         force=float(t.get("force", 1.0))))
    return plan


def _forme(rng, hh, ww, cx, cy, rx, ry, ang, irr, corr, douceur):
    """Champ (hh, ww) ≈ 1 dans la forme, 0 dehors, bord irrégulier adouci sur `douceur` (relatif)."""
    yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
    ca, sa = math.cos(ang), math.sin(ang)
    dx, dy = xx + 0.5 - cx, yy + 0.5 - cy
    u = (dx * ca + dy * sa) / rx
    v = (-dx * sa + dy * ca) / ry
    d = np.sqrt(u * u + v * v)
    n = _bruit_basse(rng, hh, ww, max(3.0, corr))
    champ = 1.0 - d + irr * n
    return np.clip(champ / max(douceur, 1e-3) + 0.5, 0, 1), d


def _peindre_tache(Lin, a, t: dict, geo: _Geo):
    e = geo.e
    lw = geo.lw
    rng = np.random.default_rng(t["graine"])
    genre = t["genre"]
    R = t["taille"] * lw
    cx, cy = geo.px(t["x"], t["y"])
    ang = math.radians(t["angle"])
    f = t["force"]
    if genre == "tasse":
        ext = R * 1.15
    elif genre == "cafe":
        ext = R * 3.2
    else:
        ext = R * 1.6
    win = geo.fenetre(cx, cy, ext, ext)
    if win is None:
        return
    y0, y1, x0, x1 = win
    hh, ww = y1 - y0, x1 - x0
    lx, ly = cx - x0, cy - y0
    sub = a[y0:y1, x0:x1]
    rel = _relief_local(sub, e)
    dens = np.zeros((hh, ww), np.float32)
    if genre == "gras":
        # tache de beurre : forme molle, translucide, bord un peu plus marqué, pâte inégale
        M, _ = _forme(rng, hh, ww, lx, ly, R, R * float(rng.uniform(0.7, 0.95)), ang, 0.13, 0.8 * R, 0.14)
        Mb = flou(M, _r(2.5, e))
        bord = np.clip(Mb - flou(Mb, _r(5.0, e)), 0, 1)
        bord /= bord.max() + 1e-6
        nz = _bruit_basse(rng, hh, ww, max(3.0, 0.3 * R))
        dens = Mb * np.clip(0.8 + 0.18 * nz, 0.4, 1.2) + 0.35 * bord
        dens *= np.clip(1 + 0.18 * rel, 0.6, 1.4)  # la graisse rend la formation du papier visible
        mat = "gras"
        dens *= 0.85 * f
    elif genre == "cafe":
        # goutte de café : intérieur pâle, auréole foncée au bord (effet « rond de café »), éclaboussures
        dens = np.zeros((hh, ww), np.float32)
        gouttes = [(lx, ly, R, 1.0)]
        dirn = ang
        for _ in range(int(rng.integers(2, 6))):
            dd = R * float(rng.uniform(1.5, 3.0))
            aa = dirn + float(rng.normal(0, 0.45))
            gouttes.append((lx + dd * math.cos(aa), ly + dd * math.sin(aa), R * float(rng.uniform(0.07, 0.22)),
                            float(rng.uniform(0.7, 1.1))))
        for gx, gy, gr, gk in gouttes:
            M, _ = _forme(rng, hh, ww, gx, gy, gr, gr * float(rng.uniform(0.8, 1.0)), float(rng.uniform(0, math.pi)),
                          0.05, max(3.0, 0.9 * gr), 0.06)
            Mb = flou(M, _r(0.8, e))
            aur = np.clip(Mb - flou(Mb, max(_r(1.0, e), 0.09 * gr)), 0, 1)
            aur /= aur.max() + 1e-6
            nz = _bruit_basse(rng, hh, ww, max(3.0, 0.35 * gr))
            dens = np.maximum(dens, gk * (Mb * np.clip(0.32 + 0.1 * nz, 0.12, 0.6) + 0.75 * aur))
        dens *= np.clip(1 - 0.22 * rel, 0.6, 1.5)  # granulation : le pigment se dépose dans les creux
        mat = "cafe"
        dens *= f
    elif genre == "chocolat":
        # trace de doigt chocolaté : allongée, striée dans le sens du geste, plus chargée d'un côté
        M, d = _forme(rng, hh, ww, lx, ly, R * 1.5, R * 0.6, ang, 0.18, 0.5 * R, 0.25)
        Mb = flou(M, _r(1.2, e))
        ca, sa = math.cos(ang), math.sin(ang)
        yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
        u = ((xx - lx) * ca + (yy - ly) * sa) / (R * 1.5)
        v = (-(xx - lx) * sa + (yy - ly) * ca)
        stries = 0.75 + 0.25 * np.sin(v / max(_r(1.6, e), 0.8) + 0.6 * _bruit_basse(rng, hh, ww, max(3.0, 0.4 * R)))
        charge = np.clip(0.55 + 0.45 * (-u), 0.2, 1.0)
        dens = Mb * stries * charge
        dens *= np.clip(1 - 0.2 * rel, 0.6, 1.4)
        mat = "chocolat"
        dens *= 0.55 * f
    else:  # tasse : rond laissé par le fond d'une tasse, incomplet, dont on ne voit qu'un arc
        yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
        dx, dy = xx + 0.5 - lx, yy + 0.5 - ly
        rr = np.sqrt(dx * dx + dy * dy)
        # angle compté depuis la direction du centre de la page (la coupure du bruit tombe à l'opposé)
        pcx, pcy = geo.px(0.5, 0.5)
        th0 = math.atan2(pcy - cy, pcx - cx)
        phi = (np.arctan2(dy, dx) - th0 + math.pi) % (2 * math.pi)
        k_ang = (phi / (2 * math.pi) * 95).ravel()
        p_r = np.interp(k_ang, np.arange(96), _bruit_basse(rng, 1, 96, 6.0)[0]).reshape(hh, ww)
        p_p = np.interp(k_ang, np.arange(96), _bruit_basse(rng, 1, 96, 4.0)[0]).reshape(hh, ww)
        # rayon un peu irrégulier, anneau interrompu (la tasse n'appuyait pas partout)
        rayon = R * (1 + 0.004 * p_r)
        ep = _r(2.0, e)
        trait = np.exp(-((rr - rayon) / ep) ** 2)  # bord sec, net, plus foncé
        bande = np.exp(-((rr - rayon + 3.2 * ep) / (2.6 * ep)) ** 2) * 0.35  # liseré intérieur plus pâle
        film = np.clip((rayon - rr) / (0.3 * R), 0, 1) * (rr < rayon) * 0.07
        presence = np.clip(0.5 + 0.55 * p_p, 0, 1)
        nz = _bruit_basse(rng, hh, ww, max(3.0, 0.15 * R))
        dens = ((trait + bande) * presence + film * np.clip(0.7 + 0.3 * nz, 0, 1)) * np.clip(1 - 0.2 * rel, 0.6, 1.4)
        mat = "cafe"
        dens *= 0.8 * f
    T = np.exp(-dens[..., None] * DO[mat][None, None, :])
    _appliquer(Lin, win, T)


def plan_taches(cfg: dict, larg: int, haut: int, *, echelle: float = ECHELLE_REF, fond_perdu: float = 0.0,
                eviter=None) -> list:
    """Où tombent les taches d'un feuillet (fractions de la page rognée, orientation du recto) :
    pour une planche ou une vérification (aucune sous le texte)."""
    geo = _Geo(larg, haut, echelle, fond_perdu)
    return _plan_taches(cfg, geo, int(cfg.get("graine", 7)), _interdit(eviter, cfg, geo))


# ---- lumière et ombre de reliure --------------------------------------------------------------
def _lumiere(Lin, amp: float, geo: _Geo, face):
    """Dégradé de lumière de la double page (source en haut à gauche, comme l'encre) : partie
    verticale seulement pour une image partagée par le recto et le verso, complète pour une face."""
    v = (np.arange(geo.haut, dtype=np.float32) + 0.5 - geo.fp) / geo.lh
    lam = (1.15 * (0.5 - v))[:, None] * np.ones((1, geo.larg), np.float32)
    if face in ("recto", "verso"):
        fx = (np.arange(geo.larg, dtype=np.float32) + 0.5 - geo.fp) / geo.lw  # orientation du recto
        u = 0.5 + 0.5 * fx if face == "recto" else 0.5 * (1 - fx)  # fraction de la double page
        lam = lam + (0.85 * (0.5 - u))[None, :]
    lam = np.clip(lam, -1, 1)
    chaud = np.array([1.15, 1.0, 0.8], np.float32)
    froid = np.array([0.9, 0.97, 1.12], np.float32)
    k = np.where(lam[..., None] > 0, chaud, froid)
    Lin *= 1 + amp * lam[..., None] * k


# Ombre du pli (Livre.css, .gc-livre-face__pli), en fractions de la largeur de page (70 px sur 896) :
# chocolat #5b3a28 posé en « over », puis le reflet de la page droite (#fbf6ec) qui s'arrondit.
CHOCOLAT = np.array([0x5b, 0x3a, 0x28], np.float32)
DENTELLE = np.array([0xfb, 0xf6, 0xec], np.float32)
PLI = {
    "verso": ([0.0, 9 / 896, 30 / 896, 55 / 896, 70 / 896], [0.46, 0.22, 0.09, 0.03, 0.0], None),
    "recto": ([0.0, 7 / 896, 20 / 896], [0.42, 0.14, 0.0],
              ([20 / 896, 35 / 896, 56 / 896, 70 / 896], [0.0, 0.65, 0.22, 0.0])),
}


def _ombre_reliure(a, force: float, geo: _Geo, face):
    fx = (np.arange(geo.larg, dtype=np.float32) + 0.5 - geo.fp) / geo.lw  # depuis la reliure (recto)
    fx = np.maximum(fx, 0.0)
    if face in ("recto", "verso"):
        xs, al, lace = PLI[face]
        alpha = np.interp(fx, xs, al)
    else:  # image partagée : moyenne des deux profils, sans le reflet
        alpha = 0.5 * (np.interp(fx, *PLI["recto"][:2]) + np.interp(fx, *PLI["verso"][:2]))
        lace = None
    alpha = (np.clip(alpha * force, 0, 1)).astype(np.float32)[None, :, None]
    a = a * (1 - alpha) + CHOCOLAT * alpha
    if lace is not None:
        b = (np.clip(np.interp(fx, lace[0], lace[1]) * force, 0, 1)).astype(np.float32)[None, :, None]
        a = a * (1 - b) + DENTELLE * b
    return a


def _vecu(a, cfg, geo: _Geo, face, ombre_reliure, eviter):
    actifs = [k for k in ("rousseurs", "pouce", "taches", "lumiere") if cfg.get(k)]
    if not actifs and not ombre_reliure:
        return a
    graine = int(cfg.get("graine", 7))
    M = _interdit(eviter, cfg, geo)
    Lin = None
    if actifs:
        plan = _plan_taches(cfg, geo, graine, M) if cfg.get("taches") else []
        base = a.copy()  # le relief des fibres est lu sur le papier avant les effets
        Lin = vers_lin(np.clip(a, 0, 255))
        for t in plan:
            _peindre_tache(Lin, base, t, geo)
        if cfg.get("rousseurs"):
            _rousseurs(Lin, cfg["rousseurs"], geo, graine, M)
        if cfg.get("pouce"):
            # le lustre agit sur les niveaux : on le recopie dans la lumière linéaire de sa fenêtre
            avant = a.copy()
            _pouce(a, Lin, cfg["pouce"], geo, graine)
            diff = np.any(a != avant, axis=2)
            if diff.any():
                ys, xs = np.nonzero(diff)
                y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
                ratio = vers_lin(np.clip(a[y0:y1, x0:x1], 0, 255)) / np.maximum(vers_lin(np.clip(avant[y0:y1, x0:x1], 0, 255)), 1e-5)
                Lin[y0:y1, x0:x1] *= ratio
        if cfg.get("lumiere"):
            _lumiere(Lin, float(cfg["lumiere"]), geo, face)
        a = vers_srgb(Lin)
    if ombre_reliure:
        f = float(cfg.get("ombre_reliure", 0.8)) * (1.0 if ombre_reliure is True else float(ombre_reliure))
        a = _ombre_reliure(a, f, geo, face)
    return a


# =============================================================================================
# API
# =============================================================================================
def feuillet(cfg: dict, larg: int, haut: int, sources_dir, *, echelle: float = ECHELLE_REF,
             fond_perdu: float = 0.0, face: str | None = None, ombre_reliure: bool | float = False,
             eviter=None) -> np.ndarray:
    """Image RGB uint8 d'un feuillet du carnet.

    - `cfg` : une entrée de papiers.json (`feuillets`). `genre` : `feuillet` (défaut, page du
      carnet), `uni` ou `marbre` (papiers de garde) ;
    - `larg`, `haut` : taille de l'image (px), fond perdu compris ;
    - `echelle` : px de l'image par px de la page de référence (850 px de large pour la page rognée) :
      2 à l'écran, 2,0565 en A5 à 300 dpi (formats.A5.echelle). Grain, flous et tailles suivent ;
    - `fond_perdu` : px de référence de chaque côté (formats.A5.fond_perdu ≈ 17,2), compris dans
      `larg` × `haut` ; le papier continue au-delà de la coupe, les effets restent sur la page ;
    - `face` : None (défaut) = image du recto, partagée par les deux faces (le verso est son miroir) ;
      `recto` / `verso` = image d'une seule face (le verso est rendu déjà retourné), avec la partie
      horizontale de la lumière et le profil d'ombre de reliure propres à cette face (A5) ;
    - `ombre_reliure` : cuit l'ombre du pli (profil de Livre.css) ; True ou un facteur, multiplié par
      `ombre_reliure` du cfg (défaut 0,8 : 1 = le profil du CSS). Laissé à False à l'écran (le CSS
      la dessine) ;
    - `eviter` : zones sans rousseur ni tache, en fractions de la page rognée, orientation du recto
      (reliure à gauche) : liste de (x0, y0, x1, y1), ou masque (h, w) quelconque (> 0,5 = texte).
      `zones_mise(mise)` les tire d'une mise en page. Défaut : la zone d'écriture des deux faces."""
    genre = cfg.get("genre", "feuillet")
    fp = float(fond_perdu) * float(echelle)
    if genre == "marbre":
        a = _base_marbre(cfg, larg, haut, sources_dir, echelle, fp)
    elif genre == "uni":
        a = _base_uni(cfg, larg, haut, sources_dir, echelle, fp)
    else:
        a = _base_feuillet(cfg, larg, haut, sources_dir, echelle, fp)
    geo = _Geo(larg, haut, echelle, fond_perdu)
    a = _vecu(a, cfg, geo, face, ombre_reliure, eviter)
    if face == "verso":
        a = a[:, ::-1]
    return np.clip(np.round(a), 0, 255).astype(np.uint8)


def zones_mise(mise, miroir: bool = False, fond_perdu: float = 0.0, marge: float = 0.0) -> list:
    """Boîtes du texte et des dessins d'une mise en page (mise_en_page.Mise) en fractions de la page
    rognée, pour `eviter`. `miroir=True` pour la page gauche (verso du feuillet : on la ramène dans
    l'orientation du recto). `marge` : agrandit chaque boîte (px de référence)."""
    W, H = float(mise.W), float(mise.H)
    fp = float(fond_perdu)
    lw, lh = W - 2 * fp, H - 2 * fp
    boites = []
    for m in getattr(mise, "mots", []):
        boites.append(tuple(m.boite))
    for b in getattr(mise, "marques_boites", []):
        boites.append(tuple(b[:4]))
    for c in getattr(mise, "croquis", []):
        if c.get("dessine", True) and c.get("boite"):
            x, y, w, h = c["boite"]
            boites.append((x, y, x + w, y + h))
    for r in getattr(mise, "vivants", {}).values():
        boites.append(tuple(r))
    out = []
    for x0, y0, x1, y1 in boites:
        x0, x1 = (min(x0, x1) - marge - fp) / lw, (max(x0, x1) + marge - fp) / lw
        y0, y1 = (min(y0, y1) - marge - fp) / lh, (max(y0, y1) + marge - fp) / lh
        if miroir:
            x0, x1 = 1 - x1, 1 - x0
        out.append((round(x0, 5), round(y0, 5), round(x1, 5), round(y1, 5)))
    return out


def decalque(R_vis_a_vis: np.ndarray, cfg: dict | None = None, *, echelle: float = ECHELLE_REF,
             graine: int = 0) -> np.ndarray:
    """Décalque : l'encre de la page en vis-à-vis (même double page, de l'autre côté du pli), déposée
    à l'envers quand le carnet était fermé. → transmittance (h, w, 3) en lumière linéaire, à
    multiplier avec celle de la transparence du verso (rendu_encre.verso_transmittance) avant
    rendu_encre.composer.

    - `R_vis_a_vis` : transmittance linéaire (h, w, 3) de l'encre de l'autre page (Cuisine.recto),
      même taille que cette page ; on la retourne ici (miroir par le pli) ;
    - `cfg` : papiers.json `decalque` : `force` (assombrissement maximal, 0,03 ≈ à peine visible),
      `flou` (px à 2×), `decalage` (px de référence : les pages ne tombent jamais pile), `taches`
      (0–1 : le dépôt est inégal, plus ou moins de pression) ;
    - `graine` : celle de la page (décalage et inégalité du dépôt)."""
    cfg = cfg or {}
    h, w = R_vis_a_vis.shape[:2]
    force = float(cfg.get("force", 0.03))
    if force <= 0:
        return np.ones((h, w, 3), np.float32)
    rng = np.random.default_rng(int(graine) * 13 + 404)
    D = np.clip(1 - np.asarray(R_vis_a_vis, np.float32), 0, 1)
    D = 0.5 * D + 0.5 * D.mean(axis=2, keepdims=True)  # la teinte de l'encre, en plus terne
    D = D[:, ::-1]
    dmax = float(cfg.get("decalage", 2.5)) * echelle
    dx, dy = (int(round(v)) for v in rng.uniform(-dmax, dmax, 2))
    D = np.roll(D, (dy, dx), axis=(0, 1))
    if dy > 0:
        D[:dy] = 0
    elif dy < 0:
        D[dy:] = 0
    if dx > 0:
        D[:, :dx] = 0
    elif dx < 0:
        D[:, dx:] = 0
    D = flou(D, _r(float(cfg.get("flou", 2.4)), echelle))
    inegal = float(cfg.get("taches", 0.6))
    nz = _bruit_basse(rng, h, w, _r(180.0, echelle))
    pression = np.clip(1 - inegal * 0.5 + inegal * 0.5 * nz, 0, 1) ** 1.4
    brun = np.array([0.9, 1.0, 1.15], np.float32)  # dépôt un peu brun (absorbe plus le bleu)
    return (1 - force * np.clip(D * pression[..., None], 0, 1) * brun).astype(np.float32)


def grain_bruit(papier_u8: np.ndarray, rel: np.ndarray, rng, echelle: float = ECHELLE_REF) -> np.ndarray:
    """Déplacement du bord des traits (px de l'image) : l'encre file dans les creux du papier.
    Réglé à 2× ; suit `echelle`."""
    s = float(echelle) / ECHELLE_REF
    fin = flou(rng.normal(0, 1, rel.shape).astype(np.float32), _r(0.8, echelle))
    fin /= fin.std() + 1e-6
    return np.clip((-0.28 * rel + 0.14 * fin) * s, -0.8 * s, 0.8 * s).astype(np.float32)


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
    pale = np.clip(0.78 + 0.2 * _bruit_basse(rng, haut, larg, _r(260.0, echelle))
                   + 0.06 * _bruit_basse(rng, haut, larg, _r(30.0, echelle)), 0.45, 1.0)
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
    a = feuillet(base_cfg, larg, haut, sources_dir, echelle=echelle).astype(np.float32)
    if face != "recto":
        a = a[:, ::-1]
    # feuille plus récente que le carnet : plus claire, moins jaune, grain adouci
    lisse = flou(a, _r(1.2, echelle))
    a = lisse + (a - lisse) * float(cfg.get("grain", 0.55))
    cible = np.array(cfg.get("ton", [242, 236, 219]), np.float32)
    moy = a.reshape(-1, 3).mean(0)
    a = a + (cible - moy) * 0.85
    rng = np.random.default_rng(int(cfg.get("graine", 3)) + (101 if face == "recto" else 202))
    g_face = grille_cahier(cfg, larg / echelle, haut / echelle, face)
    autre = "verso" if face == "recto" else "recto"
    g_dos = grille_cahier(cfg, larg / echelle, haut / echelle, autre)
    T = _reglure(g_face, larg, haut, echelle, rng, 1.0)
    # la réglure du dos, en miroir, vue à travers la feuille (très pâle, floue)
    T_dos = _reglure(g_dos, larg, haut, echelle, rng, float(cfg.get("transparence_reglure", 0.22)))[:, ::-1]
    T_dos = 1 - flou(1 - T_dos, _r(1.6, echelle))
    a = a * T * T_dos
    # pli : la feuille a été pliée en deux pour tenir dans le carnet, puis aplatie
    if cfg.get("pli", True):
        yy = np.arange(haut, dtype=np.float32)[:, None]
        xx = np.arange(larg, dtype=np.float32)[None, :]
        yp = haut * float(cfg.get("pli_y", 0.52)) + (xx - larg / 2) * math.tan(math.radians(float(cfg.get("pli_angle", -0.6))))
        d = yy - yp
        ombre = np.exp(-((d - 1.6 * echelle) / (1.3 * echelle)) ** 2) * 9.0
        lumiere = np.exp(-((d + 1.0 * echelle) / (1.1 * echelle)) ** 2) * 5.0
        vari = np.clip(0.75 + 0.25 * _bruit_basse(rng, haut, larg, _r(180.0, echelle)), 0.3, 1.2)
        a = a - (ombre * vari)[..., None] + (lumiere * vari)[..., None]
    return np.clip(np.round(a), 0, 255).astype(np.uint8)
