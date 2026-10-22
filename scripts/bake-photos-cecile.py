#!/usr/bin/env python3
"""Photos « Cécile en cuisine » (lot V, mission 2) : tirages collés, cuits à partir de placeholders.

  python3 -I scripts/bake-photos-cecile.py

Entrées
  design-system/sources/photos-cecile/credits.json   photos (fichier, sha256, auteur, licence, cadrage, coins)
  verification/out/v5-photos/originaux/<fichier>     originaux Pexels (hors dépôt, vérifiés par sha256)

Sorties
  design-system/baked/photos/<id>/tirage.webp   papier 1200×840 à bord blanc cassé, photo 1080×720 passée
                                                (couleurs atténuées, teinte chaude, grain), coins arrondis,
                                                ombre de contact, dans une image 1400×1040 (alpha)
  design-system/baked/photos/<id>/coins.webp    coins photo noirs ou kraft, même cadre (se superposent)
  src/content/photos-cecile.json                [{ id, orientation, tirage, coins, angle }]

Orientation (credits.json : « orientation »: « paysage » par défaut, ou « portrait »)
  paysage   photo 3:2 de 1080×720 dans un papier de 1200×840, image 1400×1040
  portrait  photo 2:3 de 720×1080 dans un papier de 840×1200, image 1040×1400
  Mêmes bords du papier (58/62/56/64 px), même marge, mêmes coins et mêmes ombres dans les deux cas.
  Les fonctions prennent une géométrie `g` (PAYSAGE par défaut) : scripts/bake-local-cecile.py les réutilise
  pour la version locale (vraies photos de prive/, jamais publiées).

Le cadre (marges, bords) reprend celui des tirages des invités de bake-videos.mjs.
Déterministe : graines fixes. Aucun effet à l'exécution.
"""
import hashlib
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'design-system/sources/photos-cecile')
ORIG = os.path.join(ROOT, 'verification/out/v5-photos/originaux')
BAKED = os.path.join(ROOT, 'design-system/baked/photos')
CONTENU = os.path.join(ROOT, 'src/content/photos-cecile.json')

# Géométrie : identique aux tirages des invités (bake-videos.mjs, T)
BG, BD, BH, BB = 58, 62, 56, 64       # bords du papier : gauche, droite, haut, bas
MARGE, RAYON = 100, 9
L_COIN, E_COIN = 118, 4.5             # côté du triangle de coin, débord


class Geometrie:
    """Dimensions d'un tirage pour une photo de pw × ph px (les bords, la marge et les coins ne changent pas)."""

    def __init__(self, pw, ph):
        self.PW, self.PH = pw, ph
        self.PAP_W, self.PAP_H = pw + BG + BD, ph + BH + BB            # paysage 1200 × 840, portrait 840 × 1200
        self.CW, self.CH = self.PAP_W + 2 * MARGE, self.PAP_H + 2 * MARGE  # 1400 × 1040, 1040 × 1400
        self.PX, self.PY = MARGE + BG, MARGE + BH                     # coin haut-gauche de la photo dans l'image


PAYSAGE = Geometrie(1080, 720)        # photo 3:2
PORTRAIT = Geometrie(720, 1080)       # photo 2:3
GEOMETRIES = {'paysage': PAYSAGE, 'portrait': PORTRAIT}
# Constantes du paysage, gardées pour les scripts qui les importent
PW, PH, PAP_W, PAP_H, CW, CH, PX, PY = (PAYSAGE.PW, PAYSAGE.PH, PAYSAGE.PAP_W, PAYSAGE.PAP_H,
                                        PAYSAGE.CW, PAYSAGE.CH, PAYSAGE.PX, PAYSAGE.PY)

SS = 4                                # sur-échantillonnage des masques (anticrénelage)


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def cadrer(im, cx, cy, zoom=1.0, g=PAYSAGE):
    """Recadre en 3:2 (2:3 en portrait) autour de (cx, cy) (fractions) ; zoom < 1 resserre le cadre. Réduit à la photo du tirage."""
    PW, PH = g.PW, g.PH
    w, h = im.size
    cible = PW / PH
    if w / h > cible:
        nw, nh = round(h * cible), h
    else:
        nw, nh = w, round(w / cible)
    nw = round(nw * zoom)
    nh = round(nw / cible)
    x0 = min(max(round(cx * w - nw / 2), 0), w - nw)
    y0 = min(max(round(cy * h - nh / 2), 0), h - nh)
    return im.crop((x0, y0, x0 + nw, y0 + nh)).resize((PW, PH), Image.LANCZOS)


def virage_passe(im, graine, g=PAYSAGE):
    """Vieux tirage couleur passé : couleurs atténuées, teinte chaude, noirs relevés, vignetage, grain."""
    PW, PH = g.PW, g.PH
    a = np.asarray(im, dtype=np.float32) / 255.0
    lum = a @ np.array([0.3, 0.59, 0.11], np.float32)
    a = lum[..., None] + (a - lum[..., None]) * 0.35          # couleurs passées
    a = a * np.array([1.07, 1.0, 0.8], np.float32)             # teinte chaude
    a = 0.12 + 0.88 * np.clip(a, 0, 1)                         # noirs relevés
    a = np.minimum(a, 0.95)                                    # blancs bridés
    yy, xx = np.mgrid[0:PH, 0:PW].astype(np.float32)
    r = np.sqrt(((xx - PW / 2) / (PW / 2)) ** 2 + ((yy - PH / 2) / (PH / 2)) ** 2) / math.sqrt(2)
    a = a * (1 - 0.13 * np.clip(r, 0, 1) ** 2.2)[..., None]
    rng = np.random.default_rng(graine)
    a = a + rng.normal(0, 0.02, (PH, PW))[..., None]
    return (np.clip(a, 0, 1) * 255).astype(np.uint8)


def papier(graine, g=PAYSAGE):
    """Bord de papier blanc cassé, jauni vers l'extérieur, fibres."""
    PAP_W, PAP_H = g.PAP_W, g.PAP_H
    creme = np.array([0xf1, 0xe9, 0xd8], np.float32) / 255
    jauni = np.array([0xdc, 0xca, 0xa6], np.float32) / 255
    yy, xx = np.mgrid[0:PAP_H, 0:PAP_W].astype(np.float32)
    d_bord = np.minimum.reduce([xx, yy, PAP_W - 1 - xx, PAP_H - 1 - yy])
    t = np.clip(d_bord / 34, 0, 1)
    j = 0.6 * (1 - t * t * (3 - 2 * t))
    rng = np.random.default_rng(graine + 1)
    bruit = rng.normal(0, 1, (PAP_H, PAP_W)).astype(np.float32)
    bruit_img = Image.fromarray(((bruit - bruit.min()) / (np.ptp(bruit) + 1e-6) * 255).astype(np.uint8))
    bruit = (np.asarray(bruit_img.filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255 - 0.5) * 2
    j = np.clip(j + 0.08 * bruit, 0, 1)[..., None]
    col = creme * (1 - j) + jauni * j
    col = col * (1 + 0.012 * bruit[..., None])
    return (np.clip(col, 0, 1) * 255).astype(np.uint8)


def masque_papier(g=PAYSAGE):
    PAP_W, PAP_H, CW, CH = g.PAP_W, g.PAP_H, g.CW, g.CH
    m = Image.new('L', (PAP_W * SS, PAP_H * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, PAP_W * SS - 1, PAP_H * SS - 1), radius=RAYON * SS, fill=255)
    m = m.resize((PAP_W, PAP_H), Image.LANCZOS)
    canvas = Image.new('L', (CW, CH), 0)
    canvas.paste(m, (MARGE, MARGE))
    return canvas


def rot_pt(x, y, quarts):
    for _ in range(quarts):
        x, y = -y, x
    return x, y


def coin(cx, cy, quarts, papier_coin):
    """Triangle de coin photo (noir ou kraft) : masque + couleur + liseré le long de l'hypoténuse."""
    R = L_COIN + 14
    x0, y0 = int(math.floor(cx - R)), int(math.floor(cy - R))
    w = h = 2 * R
    tri = [(-E_COIN, -E_COIN), (L_COIN, -E_COIN), (-E_COIN, L_COIN)]
    pts = [rot_pt(x, y, quarts) for x, y in tri]
    pts_t = [((cx + x - x0) * SS, (cy + y - y0) * SS) for x, y in pts]
    m = Image.new('L', (w * SS, h * SS), 0)
    ImageDraw.Draw(m).polygon(pts_t, fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    # liseré : bord intérieur de l'hypoténuse, plus clair
    lis = Image.new('L', (w * SS, h * SS), 0)
    a = rot_pt(L_COIN - 1, -E_COIN + 1.2, quarts)
    b = rot_pt(-E_COIN + 1.2, L_COIN - 1, quarts)
    ImageDraw.Draw(lis).line([((cx + a[0] - x0) * SS, (cy + a[1] - y0) * SS),
                              ((cx + b[0] - x0) * SS, (cy + b[1] - y0) * SS)], fill=255, width=int(1.3 * SS))
    lis = lis.resize((w, h), Image.LANCZOS)
    base, lisere = ((0x17, 0x11, 0x0e), (0x6d, 0x62, 0x5a)) if papier_coin == 'noir' else ((0xa7, 0x7c, 0x50), (0xe2, 0xc7, 0xa0))
    couleur = Image.new('RGB', (w, h), base)
    couleur.paste(Image.new('RGB', (w, h), lisere), (0, 0), lis.point(lambda v: int(v * 0.55)))
    # ombre de contact : masque décalé et flouté
    ombre = Image.new('L', (w + 8, h + 8), 0)
    ombre.paste(m, (4 + 2, 4 + 3))
    ombre = ombre.filter(ImageFilter.GaussianBlur(2.1)).point(lambda v: int(v * 0.5))
    ombre = ombre.crop((4, 4, 4 + w, 4 + h))
    return (x0, y0, m, couleur, ombre)


def composer(id_, photo, papier_coin, graine, g=PAYSAGE):
    PW, PH, PAP_W, PAP_H, CW, CH, PX, PY = g.PW, g.PH, g.PAP_W, g.PAP_H, g.CW, g.CH, g.PX, g.PY
    # --- tirage : papier + photo, ombre
    fond = Image.new('RGB', (CW, CH), (0, 0, 0))
    pap = Image.new('RGB', (PAP_W, PAP_H))
    pap.paste(Image.fromarray(papier(graine, g)), (0, 0))
    pap.paste(Image.fromarray(photo), (BG, BH))
    couche = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    couche.paste(pap.convert('RGBA'), (MARGE, MARGE))
    couche.putalpha(masque_papier(g))
    ombre_m = masque_papier(g)
    s1 = Image.new('L', (CW, CH), 0)
    s1.paste(ombre_m, (1, 2))
    s1 = s1.filter(ImageFilter.GaussianBlur(2.6)).point(lambda v: int(v * 0.3))
    s2 = Image.new('L', (CW, CH), 0)
    s2.paste(ombre_m, (3, 6))
    s2 = s2.filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * 0.12))
    ombre_tot = Image.fromarray(np.clip(
        255 * (1 - (1 - np.asarray(s1, np.float32) / 255) * (1 - np.asarray(s2, np.float32) / 255)), 0, 255).astype(np.uint8))
    ombre_couche = Image.new('RGBA', (CW, CH), (0x2a, 0x1b, 0x10, 0))
    ombre_couche.putalpha(ombre_tot)
    tirage = Image.alpha_composite(ombre_couche, couche)

    # --- coins photo
    corners = {'hg': (PX, PY, 0), 'hd': (PX + PW, PY, 1), 'bd': (PX + PW, PY + PH, 2), 'bg': (PX, PY + PH, 3)}
    coins_couche = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    ombres_couche = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    for nom, (cx, cy, q) in corners.items():
        x0, y0, m, couleur, ombre = coin(cx, cy, q, papier_coin)
        tuile = couleur.convert('RGBA')
        tuile.putalpha(255)
        coins_couche.paste(tuile, (x0, y0), m)
        ombre_t = Image.new('RGBA', ombre.size, (0x1c, 0x12, 0x0a, 0))
        ombre_t.putalpha(ombre)
        ombres_couche.alpha_composite(ombre_t, (x0, y0))
    coins = Image.alpha_composite(ombres_couche, coins_couche)
    return tirage, coins


def main():
    with open(os.path.join(SRC, 'credits.json'), encoding='utf-8') as f:
        cred = json.load(f)
    contenu = []
    for i, ph in enumerate(cred['photos']):
        src = ph['source']
        chemin = os.path.join(ORIG, src['fichier'])
        if sha256(chemin) != src['sha256']:
            sys.exit(f"{ph['id']} : sha256 inattendu pour {chemin}")
        im = ImageOps.exif_transpose(Image.open(chemin)).convert('RGB')
        orientation = ph.get('orientation', 'paysage')
        g = GEOMETRIES[orientation]
        im = cadrer(im, ph['cadrage']['cx'], ph['cadrage']['cy'], ph['cadrage'].get('zoom', 1.0), g)
        photo = virage_passe(im, 1000 + i, g)
        tirage, coins = composer(ph['id'], photo, ph['coins'], 2000 + i, g)
        dossier = os.path.join(BAKED, ph['id'])
        os.makedirs(dossier, exist_ok=True)
        tirage.save(os.path.join(dossier, 'tirage.webp'), 'WEBP', quality=86, method=6)
        coins.save(os.path.join(dossier, 'coins.webp'), 'WEBP', quality=90, method=6)
        print(f"{ph['id']:<10} {orientation:<9} {src['auteur']:<20} "
              f"{os.path.getsize(os.path.join(dossier, 'tirage.webp')) // 1024} Ko / "
              f"{os.path.getsize(os.path.join(dossier, 'coins.webp')) // 1024} Ko")
        contenu.append({'id': ph['id'], 'orientation': orientation, 'tirage': f"photos/{ph['id']}/tirage",
                        'coins': f"photos/{ph['id']}/coins", 'angle': ph['angle']})
    with open(CONTENU, 'w', encoding='utf-8') as f:
        json.dump(contenu, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('écrit :', os.path.relpath(CONTENU, ROOT))


if __name__ == '__main__':
    main()
