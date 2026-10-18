#!/usr/bin/env python3
"""Bougie du carnet (v5, bougie en 3D) : cuisson des calques du composant Bougie.

  tools/ecriture/.venv/bin/python -I scripts/bake-bougie.py

La bougie est modélisée et rendue dans Blender par scripts/bougie3d/scene.py, avec la caméra de la scène :
une table vue d'en haut, donc une bougie verticale vue presque du dessus, un peu en fuite vers le coin de
l'écran, sa flaque de cire figée au pied. Ce script en cuit les calques :

  cire.webp        la bougie, flamme basse (la cire est éclairée par sa flamme)
  cire-vive.webp   la même, flamme haute : l'application fond l'une dans l'autre au rythme de la flamme
  ombre.webp       l'ombre portée par la cheminée (hors champ à gauche) sur la table, en alpha
  flamme-fixe.webp la flamme de secours (sans WebGL) : la photo d'une vraie flamme (Pexels, Numan Gilgil),
                   détourée, puis mise en perspective (vue d'en haut, elle pointe vers le coin de l'écran)
  halo.webp        la lueur chaude de la flamme sur la table (dessinée)

et écrit leur géométrie (px de scène 1920 × 1080) dans src/components/Bougie/geometrie.json. La flamme
elle-même est rendue en temps réel par une toile WebGL (src/components/Bougie/flamme.ts), avec son reflet
dans la cire liquide du puits et les gouttes de cire qui coulent de temps en temps (cire.ts) : le script
n'en écrit que la géométrie, la boîte de la toile (autour de la mèche, du puits et des coulures), la
hauteur de la mèche au-dessus de la table (« flamme »), et le chemin des coulures où la cire coule
(« coulees » : la crête de la coulure figée, du puits à la flaque, relevée sur le maillage par scene.py).

Entrées (hors dépôt) :
  verification/out/v5-bougie3d/rendu/   rendu Blender : bougie.png, bougie-vive.png, ombre.png, reperes.json
  verification/out/v5-bougie2/originaux/pexels-9299394.jpeg   la photo de la flamme (sha256 vérifié)
Licence et choix de la photo : design-system/sources/bougie/credits.json.

Déterministe, sans réseau. PIL et numpy seulement.
"""
import hashlib
import json
import math
import os
import re

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RENDU = os.path.join(ROOT, 'verification', 'out', 'v5-bougie3d', 'rendu')
ORIG = os.path.join(ROOT, 'verification', 'out', 'v5-bougie2', 'originaux', 'pexels-9299394.jpeg')
SHA256 = 'a88c958b0677589e33d038777566782ecb6b245179a6629cfe3d3563a1f0e1d2'
OUT = os.path.join(ROOT, 'design-system', 'baked', 'bougie')
GEOMETRIE = os.path.join(ROOT, 'src', 'components', 'Bougie', 'geometrie.json')

CUISSON = 1.25          # px cuits par px de scène : celui du rendu Blender (scene.py, CUISSON) ; changer les deux avec un nouveau rendu
FLOU_CIRE = 0           # px de scène : la cire est nette (le flou de profondeur de champ est retiré)
DECALAGE = (-88, -20)   # px de scène : la bougie est posée dans le coin, loin du livre (pied (196, 846) → (108, 826))
TAILLE = 0.6            # et plus petite (autour de son pied) : la pointe de la flamme reste à l'écran et la cire à ~115 px
                        # de scène du livre (bordure comprise) : on tourne les pages sans passer la main au-dessus
OMBRE_R0, OMBRE_R1 = 90.0, 230.0   # l'ombre s'efface entre ces distances au pied (px de scène)
ASSOMBRI = 0.9          # la pièce est sombre : la cire reste devinée plutôt que montrée
PXCM, HCAM = 39.0, 80.0  # la caméra de la scène (scene.py)

# Photo de la flamme (repère de la photo) : canevas, mèche (pivot), seuils de détourage.
SRC_W, SRC_H = 4272, 2848
X0, X1, Y0, Y1 = 2560, 3968, 0, 2848
ECHELLE_PHOTO = 0.142   # px de scène par px de la photo, pour une flamme debout de 235 px
MECHE = (3252, 1785)
FLAMME_BAS, FLAMME_HAUT = 30, 140
FLAMME_FONDU = (1735, 1792)
FLOU_FLAMME = 1.5       # px de scène, avant la mise en perspective (qui la réduit encore)
FLAMME_LARGEUR = 0.5    # échelle en travers (la largeur d'une flamme ne fuit pas)
FLAMME_RACCOURCI_MIN = 0.5   # vue presque d'en haut, la flamme se raccourcit, mais on la garde lisible
HALO_SCENE = (800, 900)
MECHE_Z = 5.6           # cm : bout de la mèche au-dessus de la table (scene.py : NIVEAU_PUITS + 0.78), avant TAILLE
TOILE_FLAMME = (84, 55, 40, 71)   # px de scène autour de la mèche (gauche, haut, droite, bas) : la toile de la
                                  # flamme WebGL, assez grande pour la flamme couchée à 35° dans tous les sens, halo compris ;
                                  # agrandie pour couvrir aussi le puits et les coulures où la cire coule (+ MARGE_TOILE)
RAYON_NAPPE = 2.04      # cm (avant TAILLE) : le bord visible de la cire liquide, au pied de la paroi du cratère
MARGE_TOILE = 10        # px de scène autour du puits et des coulures (la goutte déborde un peu de la crête)
PAS_COULEE = 0.06       # cm : pas du chemin d'une coulée


def marche(x, a, b):
    """Passage doux de 0 (x ≤ a) à 1 (x ≥ b)."""
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


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


def lire(chemin):
    """PNG du rendu → (rgb, alpha) float, rgb non prémultiplié 0..255, alpha 0..1."""
    a = np.asarray(Image.open(chemin).convert('RGBA'), dtype=np.float32)
    return a[..., :3], a[..., 3] / 255.0


def adoucir(rgb, alpha, sigma):
    if sigma <= 0:
        return rgb, alpha
    return flou_premultiplie(rgb * alpha[..., None], alpha, sigma, 'constant')


def boite_alpha(alpha, seuil=1 / 255, marge=4):
    ys, xs = np.nonzero(alpha > seuil)
    h, w = alpha.shape
    return (max(0, xs.min() - marge), max(0, ys.min() - marge), min(w, xs.max() + 1 + marge),
            min(h, ys.max() + 1 + marge))


def en_scene(boite_cuite, origine):
    """Boîte en px cuits (dans une image dont le coin est origine, en px de scène) → px de scène."""
    x0, y0, x1, y1 = boite_cuite
    return {'x': round(origine[0] + x0 / CUISSON, 2), 'y': round(origine[1] + y0 / CUISSON, 2),
            'w': round((x1 - x0) / CUISSON, 2), 'h': round((y1 - y0) / CUISSON, 2)}


def flamme_photo():
    """La flamme de la photo, détourée, sur le canevas (px cuits pour une flamme debout), et son pivot."""
    with open(ORIG, 'rb') as f:
        if hashlib.sha256(f.read()).hexdigest() != SHA256:
            raise SystemExit(f'sha256 inattendu pour {ORIG}')
    im = Image.open(ORIG).convert('RGB')
    assert im.size == (SRC_W, SRC_H), im.size
    src = np.asarray(im, dtype=np.float32)[Y0:Y1, X0:X1]
    yv = np.arange(Y0, Y1, dtype=np.float32)
    taille = (round((X1 - X0) * ECHELLE_PHOTO * CUISSON), round((Y1 - Y0) * ECHELLE_PHOTO * CUISSON))
    mf = masque_flamme(src, yv)
    pm = reechantillonne(src * mf[..., None], taille)
    a = reechantillonne(mf, taille)
    rgb, a = flou_premultiplie(pm, a, FLOU_FLAMME * CUISSON, 'constant')
    pivot = ((MECHE[0] - X0) * ECHELLE_PHOTO * CUISSON, (MECHE[1] - Y0) * ECHELLE_PHOTO * CUISSON)
    sommet = ((MECHE[1] - 130) * ECHELLE_PHOTO * CUISSON)   # longueur debout, mèche → pointe (px cuits)
    return rgb, a, pivot, sommet


def perspective(rgb, alpha, pivot, angle, sx, sy, cote=320):
    """Met la flamme en perspective : échelle (sx en travers, sy le long), puis rotation (degrés, sens
    horaire, comme CSS) autour du pivot. Sortie : carré de `cote` px cuits, pivot au centre."""
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    # sortie (x, y) relative au centre → entrée : S⁻¹ R⁻¹ (q) + pivot
    a = c / sx
    b = s / sx
    d = -s / sy
    e = c / sy
    cx = cy = cote / 2
    data = (a, b, pivot[0] - a * cx - b * cy, d, e, pivot[1] - d * cx - e * cy)
    plans = [Image.fromarray(np.ascontiguousarray(p, dtype=np.float32), 'F').transform(
        (cote, cote), Image.AFFINE, data, resample=Image.BICUBIC) for p in
        [rgb[..., k] * alpha for k in range(3)] + [alpha]]
    pa = np.clip(np.asarray(plans[3]), 0, 1)
    pm = np.stack([np.asarray(p) for p in plans[:3]], axis=-1)
    return np.clip(pm / np.maximum(pa, 1e-4)[..., None], 0, 255), pa


def lisse_1d(v, sigma):
    """Lissage gaussien d'une suite (bords répétés)."""
    r = max(1, int(math.ceil(3 * sigma)))
    x = np.arange(-r, r + 1, dtype=np.float64)
    k = np.exp(-x * x / (2 * sigma * sigma))
    k /= k.sum()
    p = np.pad(np.asarray(v, np.float64), r, mode='edge')
    return np.convolve(p, k, mode='valid')


def chemin_coulee(c, rep):
    """Le chemin de la cire qui coule sur une coulure (repère de la bougie, cm, axes de Blender) : depuis la
    nappe liquide du puits, par l'encoche, sur la lèvre, puis le long de la crête de la coulure figée, et
    jusque dans la flaque si la coulure y arrive. Rééchantillonné tous les PAS_COULEE cm, avec la normale à la
    cire figée (dans le plan méridien) et la demi-largeur de la coulure. Renvoie aussi l'abscisse du bord de
    la lèvre (où la goutte gonfle avant de tomber) et celle du pied."""
    niveau = rep['niveau']
    profil = np.array(c['profil'], np.float64)          # z, phi, rho, demi, flanc
    z_haut = profil[0, 0]
    phi0 = c['phi']
    pts = [(1.95, niveau, phi0, 0.1)]                  # dans la nappe, devant l'encoche
    levre = [(r, z) for r, z in c['levre'] if 2.0 <= r and z > z_haut]
    for r, z in levre:
        pts.append((r, max(z, niveau), phi0, 0.11))
    n_levre = len(pts)
    rho = lisse_1d(profil[:, 2], 1.5)
    phi = lisse_1d(profil[:, 1], 2.0)
    demi = lisse_1d(profil[:, 3], 2.0)
    for k in range(len(profil)):
        pts.append((rho[k], profil[k, 0], phi[k], demi[k]))
    n_flanc = len(pts)
    if c['au_pied']:
        r_bas = rho[-1]
        for r, z in c['pied']:
            if r > r_bas + 0.06 and z < profil[-1, 0] and r < r_bas + 0.5:
                pts.append((r, z, phi[-1], 0.4))
    pts = np.array(pts)
    xyz = np.stack([pts[:, 0] * np.cos(pts[:, 2]), pts[:, 0] * np.sin(pts[:, 2]), pts[:, 1]], axis=-1)
    s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(xyz, axis=0), axis=1))])
    s_levre = s[n_levre - 1]                              # le bord de la lèvre
    s_pied = s[n_flanc - 1]
    su = np.arange(0.0, s[-1] + 1e-6, PAS_COULEE)
    q = np.stack([np.interp(su, s, xyz[:, k]) for k in range(3)], axis=-1)
    largeur = np.interp(su, s, pts[:, 3])
    # normale : perpendiculaire à la tangente dans le plan méridien, vers l'extérieur (le coin de la lèvre
    # arrondi par le lissage)
    rq = lisse_1d(np.hypot(q[:, 0], q[:, 1]), 1.5)
    zq = lisse_1d(q[:, 2], 1.5)
    dr, dz = np.gradient(rq), np.gradient(zq)
    nn = np.hypot(dr, dz) + 1e-9
    nr, nz = -dz / nn, dr / nn
    ph = np.arctan2(q[:, 1], q[:, 0])
    n = np.stack([nr * np.cos(ph), nr * np.sin(ph), nz], axis=-1)
    return q, n, largeur, float(s_levre), float(s_pied)


def projette(rep, p):
    """Point du repère de la bougie (cm) → px de scène du rendu (avant le déplacement de la bougie)."""
    bx, by = rep['base']
    k = HCAM / (HCAM - p[2])
    return 960 + (bx + p[0]) * k * PXCM, 540 - (by + p[1]) * k * PXCM


def main():
    rep = json.load(open(os.path.join(RENDU, 'reperes.json')))
    os.makedirs(OUT, exist_ok=True)
    geo = {'cuisson': CUISSON}
    bx0, by0 = rep['boite'][0], rep['boite'][1]

    # 1. la cire, flamme basse et flamme haute : même boîte (l'union des deux)
    cire = [lire(os.path.join(RENDU, f)) for f in ('bougie.png', 'bougie-vive.png')]
    b = boite_alpha(np.maximum(cire[0][1], cire[1][1]))
    for (rgb, a), nom in zip(cire, ('cire', 'cire-vive')):
        rgb, a = adoucir(rgb, a, FLOU_CIRE * CUISSON)
        rgb, a = rgb[b[1]:b[3], b[0]:b[2]], a[b[1]:b[3], b[0]:b[2]]
        vers_webp(rgb * ASSOMBRI, a, os.path.join(OUT, f'{nom}.webp'))
    geo['cire'] = en_scene(b, (bx0, by0))

    # 2. l'ombre de la cheminée : du noir, l'alpha est l'ombre
    _, a = lire(os.path.join(RENDU, 'ombre.png'))
    # elle s'efface en s'éloignant du pied (pénombre), bien avant le bord de la boîte rendue
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]].astype(np.float32)
    d = np.hypot(xx / CUISSON + bx0 - rep['pied'][0], yy / CUISSON + by0 - rep['pied'][1])
    a = a * (1 - marche(d, OMBRE_R0, OMBRE_R1))
    b = boite_alpha(a, 2 / 255)
    a = a[b[1]:b[3], b[0]:b[2]]
    vers_webp(np.zeros(a.shape + (3,), np.float32), a, os.path.join(OUT, 'ombre.webp'))
    geo['ombre'] = en_scene(b, (bx0, by0))

    # 3. les coulées : le chemin de la cire sur les coulures où elle coule (cire.ts)
    coulees = []
    for c in rep['coulures']:
        q, n, largeur, s_levre, s_pied = chemin_coulee(c, rep)
        coulees.append({'auPied': bool(c['au_pied']), 'levre': round(s_levre, 3), 'pied': round(s_pied, 3),
                        'q': [round(float(v), 3) for v in q.ravel()], 'n': [round(float(v), 2) for v in n.ravel()],
                        'largeur': [round(float(v), 2) for v in largeur]})
    px, py = rep['pied']
    geo['coulees'] = {'pas': PAS_COULEE, 'base': rep['base'], 'niveau': rep['niveau'],
                      'rayonLiquide': rep['rayon_liquide'], 'meche': [round(v, 3) for v in rep['meche_monde']],
                      'pied': [round(px, 3), round(py, 3)], 'taille': TAILLE, 'decalage': list(DECALAGE),
                      'coulures': coulees}

    # 4. la flamme de secours, mise en perspective : de la mèche vers la pointe projetée (la toile de la
    #    flamme WebGL, « flamme », est posée une fois la bougie déplacée)
    geo['flamme'] = {}
    rgb, a, pivot, longueur = flamme_photo()
    mx, my = rep['meche']
    px, py = rep['flamme_pointe']
    vx, vy = px - mx, py - my
    angle = math.degrees(math.atan2(vx, -vy))            # 0 = debout ; sens horaire
    sy = max(FLAMME_RACCOURCI_MIN, math.hypot(vx, vy) * CUISSON / longueur)
    rgb, a = perspective(rgb, a, pivot, angle, FLAMME_LARGEUR, sy)
    b = boite_alpha(a, 1 / 255, 6)
    cote = a.shape[0]
    vers_webp(rgb[b[1]:b[3], b[0]:b[2]], a[b[1]:b[3], b[0]:b[2]], os.path.join(OUT, 'flamme-fixe.webp'))
    f = en_scene(b, (mx - cote / 2 / CUISSON, my - cote / 2 / CUISSON))
    f['pivot'] = [round((cote / 2 - b[0]) / (b[2] - b[0]) * 100, 2), round((cote / 2 - b[1]) / (b[3] - b[1]) * 100, 2)]
    geo['flammeFixe'] = f

    # 5. le halo, centré sur le milieu de la flamme
    hw, hh = round(HALO_SCENE[0] * CUISSON), round(HALO_SCENE[1] * CUISSON)
    h_rgb, h_alpha = halo(hw, hh)
    vers_webp(h_rgb, h_alpha, os.path.join(OUT, 'halo.webp'))
    cx, cy = rep['flamme']
    geo['halo'] = {'x': round(cx - HALO_SCENE[0] / 2, 2), 'y': round(cy - HALO_SCENE[1] / 2, 2),
                   'w': HALO_SCENE[0], 'h': HALO_SCENE[1]}

    # la bougie est posée ailleurs sur la table, un peu plus petite : ses calques, sa lueur et son ombre
    # suivent d'un bloc, réduits autour du pied (les pixels ne changent pas, seule la géométrie bouge)
    px, py = rep['pied']
    for calque in [geo['cire'], geo['ombre'], geo['flammeFixe'], geo['halo']]:
        calque['x'] = round(px + (calque['x'] - px) * TAILLE + DECALAGE[0], 2)
        calque['y'] = round(py + (calque['y'] - py) * TAILLE + DECALAGE[1], 2)
        calque['w'] = round(calque['w'] * TAILLE, 2)
        calque['h'] = round(calque['h'] * TAILLE, 2)
    # la toile de la flamme WebGL : autour de la mèche déplacée ; la mèche (px de scène) et sa hauteur (cm)
    mx = round(px + (rep['meche'][0] - px) * TAILLE + DECALAGE[0], 2)
    my = round(py + (rep['meche'][1] - py) * TAILLE + DECALAGE[1], 2)
    g, h, d, b = TOILE_FLAMME
    x0, y0, x1, y1 = mx - g, my - h, mx + d, my + b
    # le puits et les coulures, déplacés comme la bougie
    deplace = lambda o: (px + (o[0] - px) * TAILLE + DECALAGE[0], py + (o[1] - py) * TAILLE + DECALAGE[1])
    contour = [(rep['rayon_liquide'] * math.cos(a), rep['rayon_liquide'] * math.sin(a), rep['niveau'])
               for a in np.linspace(0, 2 * math.pi, 73)]
    for c in geo['coulees']['coulures']:
        contour += [tuple(c['q'][k:k + 3]) for k in range(0, len(c['q']), 3)]
    for p in contour:
        ex, ey = deplace(projette(rep, p))
        x0, y0 = min(x0, ex - MARGE_TOILE), min(y0, ey - MARGE_TOILE)
        x1, y1 = max(x1, ex + MARGE_TOILE), max(y1, ey + MARGE_TOILE)
    g, h, d, b = math.ceil(mx - x0), math.ceil(my - y0), math.ceil(x1 - mx), math.ceil(y1 - my)
    # la nappe liquide du puits, dans le repère de la flamme (cm, x et y comme l'écran, depuis l'aplomb du
    # bout de la mèche) : centre (l'axe de la bougie) et rayon (jusqu'au pied de la paroi du cratère)
    mw = rep['meche_monde']
    geo['flamme'] = {'x': round(mx - g, 2), 'y': round(my - h, 2), 'w': g + d, 'h': h + b,
                     'meche': [mx, my], 'z': round(MECHE_Z * TAILLE, 2),
                     'puits': [round(-mw[0] * TAILLE, 3), round(mw[1] * TAILLE, 3), round(RAYON_NAPPE * TAILLE, 3)]}

    # la planche vidéo de la flamme (v6) n'est plus utilisée : la flamme est rendue en WebGL
    # les planches de gouttes (v8) non plus : la cire qui coule est rendue en WebGL avec la flamme
    for vieux in ('bougie.webp', 'flamme.webp', *[n for n in os.listdir(OUT) if n.startswith('goutte-')]):
        p = os.path.join(OUT, vieux)
        if os.path.exists(p):
            os.remove(p)
    texte = json.dumps(geo, indent=2, ensure_ascii=False)
    # les listes de nombres sur une ligne (les chemins des coulées sont longs)
    texte = re.sub(r'\[[-0-9.,\s]+\]', lambda m: '[' + ', '.join(m.group(0)[1:-1].split()).replace(',,', ',') + ']', texte)
    with open(GEOMETRIE, 'w') as fj:
        fj.write(texte + '\n')
    for nom in sorted(os.listdir(OUT)):
        chemin = os.path.join(OUT, nom)
        print(f'{os.path.relpath(chemin, ROOT)} {Image.open(chemin).size} {os.path.getsize(chemin) // 1024} Ko')
    print(json.dumps(geo, ensure_ascii=False))


if __name__ == '__main__':
    main()
