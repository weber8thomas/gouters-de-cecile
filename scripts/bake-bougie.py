#!/usr/bin/env python3
"""Bougie du carnet (composant Bougie, lot L, v5) : une vraie photo de bougie allumée, détourée sur fond
transparent, floutée comme un premier plan hors du plan de netteté, puis cuite en trois calques.

  tools/ecriture/.venv/bin/python -I scripts/bake-bougie.py

Entrée (hors dépôt, vérifiée par sha256) :
  verification/out/v5-bougie2/originaux/pexels-9299394.jpeg   photo de Numan Gilgil (licence Pexels)
  détails, licence et choix de la photo : design-system/sources/bougie/credits.json

Sorties (design-system/baked/bougie/, WebP à alpha, même grille de pixels pour la bougie et la flamme) :
  bougie.webp   la bougie seule : cire crème assombrie, floue (flou gaussien de 11 px de scène)
  flamme.webp   la flamme seule, floue (8 px de scène) ; son point de pivot est la mèche
  halo.webp     une lueur chaude et très douce, centrée sur la flamme (800 × 900 px de scène)

Détourage : le corps est géométrique (un cylindre dont les bords sont mesurés sur la photo ; la cire tombe
dans l'ombre vers le bas, où la luminance ne suffit plus). La flamme est sélectionnée par seuil de
luminance ; le halo de la photo est remplacé par halo.webp. La photo est prolongée de PROLONGE px sous le
cadre (répétition de la dernière ligne, très sombre) pour que le flou ne dessine pas de bord au bas de
l'écran.

Échelle : ECHELLE px de scène par px de la photo ; cuisson à CUISSON × la taille affichée (CONTRACT § 6).
Bougie.css reprend ces valeurs : --gc-bougie-ks = ECHELLE, --gc-bougie-k = 1 / CUISSON, et les dimensions
cuites (250 × 515 px pour la pose, 1000 × 1125 px pour le halo). Le script affiche les positions à reporter.

Déterministe, sans réseau. PIL et numpy seulement (pas de scipy : le flou est écrit ici).
"""
import hashlib
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(ROOT, 'verification', 'out', 'v5-bougie2', 'originaux', 'pexels-9299394.jpeg')
SHA256 = 'a88c958b0677589e33d038777566782ecb6b245179a6629cfe3d3563a1f0e1d2'
OUT = os.path.join(ROOT, 'design-system', 'baked', 'bougie')

SRC_W, SRC_H = 4272, 2848
ECHELLE = 0.142        # px de scène par px de la photo (Bougie.css : --gc-bougie-ks)
CUISSON = 1.25         # px cuits par px de scène (Bougie.css : --gc-bougie-k = 1 / CUISSON)
PROLONGE = 52          # px de photo répétés sous le cadre
SCENE_H = 1080         # hauteur de la scène (Bougie.css, bas de l'écran)
GAUCHE_SCENE = -57     # bord gauche du canevas, en px de scène : la bougie dépasse à gauche

# Canevas de cuisson, en repère de la photo : la cire, la flamme et la mèche.
X0, X1 = 2560, 3968
Y0, Y1 = 0, SRC_H + PROLONGE
MECHE = (3252, 1785)          # pied de la flamme : point de pivot de l'animation
FLAMME_SOMMET = 130           # pointe de la flamme (repère de la photo)

# Bords du corps, mesurés sur la photo (x en fonction de y) ; sommet de la cire : arc.
BORD_GAUCHE_Y = [1880, 2000, 2200, 2400, 2500, 2900]
BORD_GAUCHE_X = [2815, 2790, 2820, 2835, 2847, 2885]
BORD_DROIT_Y = [1880, 2000, 2200, 2300, 2900]
BORD_DROIT_X = [3705, 3715, 3722, 3726, 3732]
SOMMET_X, SOMMET_Y, SOMMET_COURBE, SOMMET_RAYON = 3265, 1796, 50, 460

# Flamme : seuil de luminance, fondue vers la mèche (sous FLAMME_FONDU, rien).
FLAMME_BAS, FLAMME_HAUT = 30, 140
FLAMME_FONDU = (1735, 1792)

# Flou (px de scène), assombrissement de la cire, halo.
FLOU_BOUGIE = 11
FLOU_FLAMME = 8
ASSOMBRI = 0.90
DESATURE = 0.30       # cire crème : on retire 30 % de saturation (la lumière du feu la rend orangée)
HALO_SCENE = (800, 900)
HALO_CENTRE_Y_SRC = (FLAMME_SOMMET + MECHE[1]) / 2   # milieu de la flamme


def marche(x, a, b):
    """Passage doux de 0 (x ≤ a) à 1 (x ≥ b)."""
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def masque_corps(xs, yv):
    """Corps de la bougie (1 dedans, 0 dehors), en repère de la photo."""
    xl = np.interp(yv, BORD_GAUCHE_Y, BORD_GAUCHE_X)[:, None]
    xr = np.interp(yv, BORD_DROIT_Y, BORD_DROIT_X)[:, None]
    sommet = SOMMET_Y + SOMMET_COURBE * ((xs - SOMMET_X) / SOMMET_RAYON) ** 2
    return ((xs >= xl) & (xs <= xr) & (yv[:, None] >= sommet)).astype(np.float32)


def masque_flamme(src, yv):
    """Flamme (0 à 1) : seuil de luminance, fondu vers la mèche."""
    lum = 0.2126 * src[..., 0] + 0.7152 * src[..., 1] + 0.0722 * src[..., 2]
    fondu = np.clip((FLAMME_FONDU[1] - yv) / (FLAMME_FONDU[1] - FLAMME_FONDU[0]), 0.0, 1.0)[:, None]
    return marche(lum, FLAMME_BAS, FLAMME_HAUT) * fondu


def reechantillonne(arr, taille):
    """Réduction en moyenne de surface (BOX) ; arr (H, W) ou (H, W, C), float."""
    if arr.ndim == 2:
        plan = np.ascontiguousarray(arr, dtype=np.float32)
        return np.asarray(Image.fromarray(plan, mode='F').resize(taille, Image.BOX))
    return np.stack([reechantillonne(arr[..., c], taille) for c in range(arr.shape[2])], axis=-1)


def flou(arr, sigma, mode):
    """Flou gaussien séparable (numpy), bords traités selon mode ('constant' : vide ; 'edge' : répété)."""
    r = int(math.ceil(3 * sigma))
    x = np.arange(-r, r + 1, dtype=np.float32)
    k = np.exp(-(x * x) / (2 * sigma * sigma)).astype(np.float32)
    k /= k.sum()
    h, w = arr.shape[:2]
    extra = ((0, 0),) * (arr.ndim - 2)
    p = np.pad(arr, ((r, r), (0, 0)) + extra, mode=mode)
    v = sum(k[i] * p[i:i + h] for i in range(2 * r + 1))
    p = np.pad(v, ((0, 0), (r, r)) + extra, mode=mode)
    return sum(k[i] * p[:, i:i + w] for i in range(2 * r + 1)).astype(np.float32)


def flou_premultiplie(pm, alpha, sigma, mode):
    """Flou d'une image prémultipliée par son alpha : pas de liseré sombre au bord."""
    fpm = flou(pm, sigma, mode)
    fa = flou(alpha, sigma, mode)
    rgb = fpm / np.maximum(fa, 1e-4)[..., None]
    return np.clip(rgb, 0.0, 255.0), np.clip(fa, 0.0, 1.0)


def desature(rgb, part):
    """Retire une part de la saturation (vers la luminance du pixel)."""
    lum = (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2])[..., None]
    return lum + (rgb - lum) * (1.0 - part)


def vers_webp(rgb, alpha, chemin):
    img = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha, 0, 1)[..., None] * 255.0]).round().astype(np.uint8)
    Image.fromarray(img, 'RGBA').save(chemin, 'WEBP', quality=90, alpha_quality=100, method=6)


def halo(w, h):
    """Lueur chaude : centre plein, décroissance douce jusqu'au bord de l'ellipse (alpha nul au bord)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (xx + 0.5 - w / 2) / (w / 2)
    v = (yy + 0.5 - h / 2) / (h / 2)
    r = np.clip(np.sqrt(u * u + v * v), 0.0, 1.0)
    alpha = 0.34 * (1.0 - r) ** 1.8 + 0.10 * np.exp(-(r * r) * 12.0)
    c_centre = np.array([255.0, 226.0, 168.0], np.float32)
    c_bord = np.array([236.0, 150.0, 78.0], np.float32)
    rgb = c_centre[None, None, :] * (1 - r[..., None]) + c_bord[None, None, :] * r[..., None]
    return rgb, alpha.astype(np.float32)


def main():
    with open(ORIG, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    if sha != SHA256:
        raise SystemExit(f'sha256 inattendu pour {ORIG} : {sha}')
    im = Image.open(ORIG).convert('RGB')
    assert im.size == (SRC_W, SRC_H), im.size
    src = np.asarray(im, dtype=np.float32)
    src = np.pad(src, ((0, PROLONGE), (0, 0), (0, 0)), mode='edge')[Y0:Y1, X0:X1]
    h_src, w_src = src.shape[:2]
    xv = np.arange(X0, X1, dtype=np.float32)
    yv = np.arange(Y0, Y1, dtype=np.float32)

    taille = (round(w_src * ECHELLE * CUISSON), round(h_src * ECHELLE * CUISSON))
    w_cuit, h_cuit = taille
    os.makedirs(OUT, exist_ok=True)

    # Bougie : cire assombrie, prémultipliée, floue ; le bas reste plein (répétition de la dernière ligne).
    mc = masque_corps(xv[None, :], yv)
    cire_pm = reechantillonne(src * mc[..., None], taille)
    cire_a = reechantillonne(mc, taille)
    cire_rgb, cire_alpha = flou_premultiplie(cire_pm, cire_a, FLOU_BOUGIE * CUISSON, 'edge')
    vers_webp(desature(cire_rgb, DESATURE) * ASSOMBRI, cire_alpha, os.path.join(OUT, 'bougie.webp'))

    # Flamme : seuil de luminance, prémultipliée, floue (pas de bord au pied : la mèche est fondue).
    mf = masque_flamme(src, yv)
    flamme_pm = reechantillonne(src * mf[..., None], taille)
    flamme_a = reechantillonne(mf, taille)
    flamme_rgb, flamme_alpha = flou_premultiplie(flamme_pm, flamme_a, FLOU_FLAMME * CUISSON, 'constant')
    vers_webp(flamme_rgb, flamme_alpha, os.path.join(OUT, 'flamme.webp'))

    # Halo : une lueur dessinée, centrée sur le milieu de la flamme.
    hw, hh = round(HALO_SCENE[0] * CUISSON), round(HALO_SCENE[1] * CUISSON)
    h_rgb, h_alpha = halo(hw, hh)
    vers_webp(h_rgb, h_alpha, os.path.join(OUT, 'halo.webp'))

    # Positions à reporter dans Bougie.css (repère de la scène 1920 × 1080).
    hauteur_scene = h_cuit / CUISSON
    haut_scene = SCENE_H + PROLONGE * ECHELLE - hauteur_scene
    pivot_x = (MECHE[0] - X0) / w_src * 100
    pivot_y = (MECHE[1] - Y0) / h_src * 100
    flamme_x = GAUCHE_SCENE + (MECHE[0] - X0) * ECHELLE
    flamme_y_mi = haut_scene + (HALO_CENTRE_Y_SRC - Y0) * ECHELLE
    for nom in ('bougie.webp', 'flamme.webp', 'halo.webp'):
        chemin = os.path.join(OUT, nom)
        print(f'{os.path.relpath(chemin, ROOT)} {Image.open(chemin).size} {os.path.getsize(chemin)} o')
    print(f'pose : {w_cuit} × {h_cuit} px cuits, {w_cuit / CUISSON:.1f} × {h_cuit / CUISSON:.1f} px de scène')
    print(f'--gc-bougie-x: {GAUCHE_SCENE}px ; haut de la pose : {haut_scene:.1f}px ; bas : {PROLONGE * ECHELLE:.2f}px sous le cadre')
    print(f'pivot de la flamme : {pivot_x:.2f}% {pivot_y:.2f}%')
    print(f'centre de la flamme (scène) : x {flamme_x:.1f}px, y {flamme_y_mi:.1f}px')
    print(f'halo : {hw} × {hh} px cuits ; à placer centré sur ({flamme_x:.1f}px, {flamme_y_mi:.1f}px)')


if __name__ == '__main__':
    main()
