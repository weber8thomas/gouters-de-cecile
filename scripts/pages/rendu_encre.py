"""Rendu des pages cuites : traits → couverture et densité d'encre → calque d'encre RGBA composé
avec le papier exactement dessous.

Modèle (lumière linéaire, absorption) :
    sortie = papier × V × Π_k (1 − a_k + a_k · T_k · F)
  - a_k : couverture du trait de l'encre k (0–1), bords « bus » par les fibres : le bord du trait
    est déplacé de ± 0,35 px (à 2×) selon le relief du papier scanné (passe-haut de sa luminance),
    plus un très léger duvet (encre qui file dans les fibres) pour la plume et le feutre ;
  - T_k : transmittance de l'encre, T = exp(−DO), DO interpolée par canal entre la nuance claire
    et la nuance chargée de l'encre (mesurées sur papier #eee1bf, références § 4.4) selon la
    quantité d'encre de chaque point (N2) — trait rapide plus pâle ;
  - crayon : la mine n'accroche que les reliefs (couverture modulée par le grain du papier) ;
  - F : lumière de fin d'après-midi venant du haut à gauche de la DOUBLE page (formule de N2,
    intensité 0,22) : encre plus claire et plus chaude dans la lumière, plus froide dans l'ombre ;
  - V : transparence du verso — l'encre de la page au dos, en miroir, floutée par l'épaisseur
    du papier (σ = 3 px à 2×), assombrit le papier de 2 à 3,5 % au plus (teinte chaude).

Échelle : tous les rayons (px) sont réglés à l'échelle 2 (page 1700 × 1920) et ramenés à l'échelle
de cuisson par `formats.rayon` (format `ecran` ×2 et passe ×4 de la loupe, format `a5` à 300 dpi) ;
à l'échelle 2, le rendu est inchangé au bit près.

Le calque stocké (WebP RGBA, alpha sans perte) est la solution exacte de la composition « over »
en sRGB : alpha = max(couverture, 1 − min_c sortie/papier), couleur = papier × (1 − (1 − R)/alpha).
Posé normalement sur le même papier au même endroit, il reproduit `sortie` au niveau près, sans
filtre ni mélange à l'exécution. Les pixels vides reçoivent une couleur prolongée (convolution
normalisée) pour que la compression ne fasse aucun liseré.
"""
from __future__ import annotations

import io
import math

import numpy as np
from PIL import Image

from formats import rayon

PAPIER_REF = "#eee1bf"  # papier sur lequel les nuances d'encre ont été mesurées
LUMIERE = 0.22
CHAUD = np.array([1.035, 1.0, 0.95]) * 1.05
FROID = np.array([0.95, 0.965, 1.02]) * 0.92
DUVET = {"plume": 0.10, "feutre": 0.08, "bille": 0.03, "crayon": 0.0}
# Lisibilité à 3 m et sur un téléphone : traits un peu plus nourris que l'épaisseur conseillée par N2,
# et mine de crayon plus grasse (le vrai crayon, #8d836a au cœur, serait trop pâle à l'écran).
GRAISSE = {"plume": 1.08, "feutre": 1.05, "bille": 1.12, "crayon": 1.25}
APPUI = {"crayon": 1.35}


def hex_rgb(c: str) -> np.ndarray:
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def vers_lin(s):
    s = np.asarray(s, np.float32) / 255.0
    return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4).astype(np.float32)


def vers_srgb(l):
    l = np.clip(l, 0, 1)
    return (np.where(l <= 0.0031308, l * 12.92, 1.055 * np.power(l, 1 / 2.4) - 0.055) * 255.0).astype(np.float32)


def flou(a: np.ndarray, sigma: float) -> np.ndarray:
    """Flou gaussien (FFT, bords en miroir) d'une image 2D ou 3D (canaux en dernier)."""
    if sigma <= 0:
        return a
    pad = int(3 * sigma) + 2
    if a.ndim == 2:
        a = a[..., None]
        seul = True
    else:
        seul = False
    A = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode="reflect")
    h, w = A.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi * sigma) ** 2 * (fx ** 2 + fy ** 2)).astype(np.float32)
    out = np.empty_like(A, dtype=np.float32)
    for c in range(A.shape[2]):
        out[..., c] = np.fft.irfft2(np.fft.rfft2(A[..., c]) * g, s=(h, w))
    out = out[pad:-pad, pad:-pad]
    return out[..., 0] if seul else out


def relief(papier_u8: np.ndarray, echelle: float = 2.0) -> np.ndarray:
    """Passe-haut de la luminance du papier, normalisé (≈ écart-type 1) : + = relief clair."""
    L = papier_u8.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    hp = L - flou(L, rayon(2.0, echelle))
    return np.clip(hp / (hp.std() + 1e-6), -3, 3).astype(np.float32)


# =============================================================================================
# Rastérisation : chaque trait rééchantillonné tous les 0,5 px, disques pondérés (couverture
# lissée), maximum par pixel ; la densité du point qui couvre le plus est gardée.
# =============================================================================================
def _reechantillonner(P: np.ndarray, pas: float):
    if len(P) == 1:
        return P
    d = np.linalg.norm(np.diff(P[:, :2], axis=0), axis=1)
    s = np.r_[0, np.cumsum(d)]
    n = max(2, int(s[-1] / pas) + 2)
    t = np.linspace(0, s[-1], n)
    return np.column_stack([np.interp(t, s, P[:, k]) for k in range(P.shape[1])])


PLANCHER_SANS_SAUT = 0.5  # encre minimale d'un trait marqué « sans saut » (glyphe d'un mot important)


def rasteriser(traces, larg: int, haut: int, echelle: float, bruit: np.ndarray, origine=(0.0, 0.0)):
    """traces : liste de mise_en_page.Trace (px de page). → {clé d'encre: (a, t, encre)}.
    `origine` : coin haut-gauche (px de l'image entière) de la fenêtre rendue (tuiles de la passe ×4) ;
    `bruit` a la forme de la fenêtre. Un trait marqué `sans_saut` (drapeau du lot E : glyphe d'un mot
    important) ne descend jamais sous PLANCHER_SANS_SAUT d'encre : pas de blanc de bille dedans."""
    paquets: dict = {}
    ox, oy = float(origine[0]), float(origine[1])
    r_min = rayon(0.55, echelle)
    pas = 0.25 * echelle  # 0,5 px à l'échelle 2
    for tr in traces:
        P = tr.pts.copy()
        P[:, :2] *= echelle
        if ox or oy:
            P[:, 0] -= ox
            P[:, 1] -= oy
            m = tr.diam * echelle + 8
            if P[:, 0].max() < -m or P[:, 1].max() < -m or P[:, 0].min() > larg + m or P[:, 1].min() > haut + m:
                continue
        P = _reechantillonner(P, pas)
        r = 0.5 * tr.diam * echelle * GRAISSE.get(tr.encre.get("outil"), 1.1) * (0.42 + 0.78 * np.clip(P[:, 2], 0, 1))
        r = np.maximum(r, r_min)
        t = np.clip(P[:, 4] - 0.07 * np.clip(P[:, 3] - 1, 0, 1.5), 0, 1)
        if getattr(tr, "sans_saut", False):
            t = np.maximum(t, PLANCHER_SANS_SAUT)
        cle = (tr.encre["id"], tr.encre.get("outil"), tr.encre["charge"], tr.encre["clair"])
        paquets.setdefault(cle, []).append(np.column_stack([P[:, 0], P[:, 1], r, t]))
    sortie = {}
    for cle, morceaux in paquets.items():
        A = np.vstack(morceaux)
        cov = np.zeros(larg * haut, np.float32)
        ta = np.zeros(larg * haut, np.float32)
        K = np.ceil(A[:, 2] + 1.6).astype(int)
        for k in np.unique(K):
            S = A[K == k]
            off = np.arange(-k, k + 1)
            for i in range(0, len(S), 40000):
                c = S[i:i + 40000]
                x, y, rr, tt = c[:, 0], c[:, 1], c[:, 2], c[:, 3]
                ix = np.floor(x).astype(np.int32)
                iy = np.floor(y).astype(np.int32)
                X = ix[:, None, None] + off[None, None, :]
                Y = iy[:, None, None] + off[None, :, None]
                X, Y = np.broadcast_arrays(X, Y)
                ok = (X >= 0) & (X < larg) & (Y >= 0) & (Y < haut)
                Xc = np.clip(X, 0, larg - 1)
                Yc = np.clip(Y, 0, haut - 1)
                dx = X + 0.5 - x[:, None, None]
                dy = Y + 0.5 - y[:, None, None]
                d = np.sqrt(dx * dx + dy * dy)
                cv = np.clip(rr[:, None, None] + bruit[Yc, Xc] - d + 0.5, 0, 1)
                m = ok & (cv > 0)
                idx = (Yc * larg + Xc)[m]
                v = cv[m]
                np.maximum.at(cov, idx, v)
                np.maximum.at(ta, idx, v * np.broadcast_to(tt[:, None, None], cv.shape)[m])
        a = cov.reshape(haut, larg)
        t = np.where(a > 1e-4, ta.reshape(haut, larg) / np.maximum(a, 1e-4), 0)
        sortie[cle] = (a, t, dict(id=cle[0], outil=cle[1], charge=cle[2], clair=cle[3]))
    return sortie


# =============================================================================================
# Composition
# =============================================================================================
def _do(encre: dict):
    P = vers_lin(hex_rgb(PAPIER_REF))
    C = vers_lin(hex_rgb(encre["charge"]))
    K = vers_lin(hex_rgb(encre["clair"]))
    return -np.log(np.clip(C / P, 1e-4, 1)), -np.log(np.clip(K / P, 1e-4, 1))


def transmittance(cartes: dict, rel: np.ndarray, lam: np.ndarray | None, echelle: float = 2.0):
    """→ (R linéaire (h, w, 3) = Π (1 − a + a T F), couverture réunie (h, w))."""
    h, w = rel.shape
    R = np.ones((h, w, 3), np.float32)
    union = np.zeros((h, w), np.float32)
    if lam is not None:
        lp = np.clip(lam, 0, 1)[..., None] * LUMIERE
        ln = np.clip(-lam, 0, 1)[..., None] * LUMIERE
        F = (1 + lp * (CHAUD - 1)) * (1 + ln * (FROID - 1))
    else:
        F = None
    for cle, (a, t, encre) in cartes.items():
        outil = encre.get("outil")
        if outil == "crayon":
            # la mine accroche les reliefs du papier : grain dans le trait
            a = a * np.clip(0.8 + 0.2 * rel, 0.38, 1.0)
        duvet = DUVET.get(outil, 0.04)
        if duvet:
            # l'encre file un peu dans les fibres : duvet très léger au bord, modulé par le relief
            d = flou(a, rayon(1.1, echelle)) * duvet * np.clip(1 - 0.5 * rel, 0.2, 1.8)
            a = np.maximum(a, d)
        do_c, do_k = _do(encre)
        tt = t[..., None]
        DO = np.where(tt >= 0.5, do_k + (do_c - do_k) * (tt - 0.5) / 0.5, do_k * (0.22 + 0.78 * tt / 0.5))
        T = np.exp(-DO * APPUI.get(outil, 1.0)).astype(np.float32)
        if F is not None:
            T = np.minimum(T * F, 1.0)
        R *= 1 - a[..., None] + a[..., None] * T
        union = 1 - (1 - union) * (1 - a)
    return R, union


def lumiere_carte(larg: int, haut: int, cote: str, fenetre=None) -> np.ndarray:
    """λ (−1 ombre … +1 lumière) sur la double page : source en haut à gauche. `fenetre` : (x0, y0,
    x1, y1) px d'une partie de la page (tuiles de la passe ×4) ; la carte reste celle de la page."""
    u = (np.arange(larg, dtype=np.float32) + 0.5) / larg / 2 + (0.5 if cote == "droite" else 0.0)
    v = (np.arange(haut, dtype=np.float32) + 0.5) / haut
    if fenetre is not None:
        x0, y0, x1, y1 = fenetre
        u, v = u[x0:x1], v[y0:y1]
    return np.clip(1 - (0.85 * u[None, :] + 1.15 * v[:, None]), -1, 1)


def verso_transmittance(R_dos: np.ndarray, force: float, echelle: float = 2.0) -> np.ndarray:
    """La page au dos vue par transparence : miroir horizontal, flou d'épaisseur, teinte chaude."""
    D = 1 - R_dos.mean(axis=2)
    D = flou(D[:, ::-1], rayon(3.0, echelle))
    teinte = np.array([1.0, 0.98, 0.8], np.float32)
    return (1 - force * np.clip(D, 0, 1)[..., None] * teinte).astype(np.float32)


def composer(papier_u8: np.ndarray, R: np.ndarray, union: np.ndarray, V: np.ndarray | None, echelle: float = 2.0):
    """→ RGBA uint8 du calque d'encre, et la sortie voulue (sRGB float) pour contrôle.

    Solution « alpha minimal » de la composition over : alpha = max_c(1 − sortie/papier), couleur =
    papier × (1 − (1 − R)/alpha). La couleur est alors celle du pigment (sombre, presque constante
    le long d'un trait, indépendante de la couverture) : le plan couleur est lisse et se compresse
    bien, tout le dessin est dans l'alpha (sans perte). Dans la transparence du verso seule
    (traits absents), l'alpha est arrondi au pas de 2/255 (paliers de 0,4 % de luminance)."""
    P_s = papier_u8.astype(np.float32)
    out_s = vers_srgb(vers_lin(papier_u8) * R * (V if V is not None else 1.0))
    Rs = np.clip(out_s / np.maximum(P_s, 1), 0, 1)
    A = (1 - Rs).max(axis=2)
    A8 = np.clip(np.round(A * 255), 0, 255).astype(np.uint8)
    seul_verso = union < 0.02
    A8[seul_verso] = (np.round(A8[seul_verso].astype(np.float32) / 2) * 2).astype(np.uint8)
    Aq = A8.astype(np.float32)[..., None] / 255.0
    with np.errstate(divide="ignore", invalid="ignore"):
        C = P_s * (1 - (1 - Rs) / np.where(Aq > 0, Aq, 1))
    C = np.clip(C, 0, 255)
    vide = A8 == 0
    if vide.any():
        # couleur prolongée sous les pixels transparents (aucun liseré à la compression)
        sig = rayon(6.0, echelle)
        poids = flou(Aq[..., 0], sig)
        moy = (C * Aq).reshape(-1, 3).sum(0) / max(float(Aq.sum()), 1e-6)
        rempl = flou(C * Aq, sig) / np.maximum(poids[..., None], 1e-6)
        rempl = np.where(poids[..., None] > 1e-3, rempl, moy)
        C[vide] = np.clip(rempl[vide], 0, 255)
    rgba = np.dstack([np.round(C).astype(np.uint8), A8])
    return rgba, out_s


def webp(rgba_ou_rgb: np.ndarray, qualite: int, alpha_qualite: int = 100) -> bytes:
    im = Image.fromarray(rgba_ou_rgb)
    b = io.BytesIO()
    im.save(b, "WEBP", quality=qualite, alpha_quality=alpha_qualite, method=6)
    return b.getvalue()


def jpeg(rgb: np.ndarray, qualite: int = 92, dpi: int | None = None) -> bytes:
    """Image opaque pour l'impression (pdf-lib ne lit que JPEG et PNG) : sous-échantillonnage 4:4:4."""
    im = Image.fromarray(rgb)
    b = io.BytesIO()
    kw = {"dpi": (dpi, dpi)} if dpi else {}
    im.save(b, "JPEG", quality=qualite, subsampling=0, optimize=True, **kw)
    return b.getvalue()


def agrandir(a: np.ndarray, facteur: int) -> np.ndarray:
    """Agrandissement bilinéaire entier (centres de pixels alignés, comme un navigateur qui étire une
    image) d'une image (h, w) ou (h, w, c) en float32."""
    a = np.asarray(a, np.float32)
    if facteur == 1:
        return a
    h, w = a.shape[:2]
    ys = (np.arange(h * facteur, dtype=np.float32) + 0.5) / facteur - 0.5
    xs = (np.arange(w * facteur, dtype=np.float32) + 0.5) / facteur - 0.5
    y0 = np.clip(np.floor(ys).astype(np.int32), 0, h - 1)
    x0 = np.clip(np.floor(xs).astype(np.int32), 0, w - 1)
    y1 = np.clip(y0 + 1, 0, h - 1)
    x1 = np.clip(x0 + 1, 0, w - 1)
    fy = np.clip(ys - y0, 0, 1)
    fx = np.clip(xs - x0, 0, 1)
    if a.ndim == 3:
        fy, fx = fy[:, None, None], fx[None, :, None]
    else:
        fy, fx = fy[:, None], fx[None, :]
    haut = a[y0][:, x0] * (1 - fx) + a[y0][:, x1] * fx
    bas = a[y1][:, x0] * (1 - fx) + a[y1][:, x1] * fx
    return (haut * (1 - fy) + bas * fy).astype(np.float32)


def decoder(data: bytes) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(data)).convert("RGBA" if data[12:16] == b"VP8X" else "RGB"))
