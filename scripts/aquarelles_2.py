#!/usr/bin/env python3
"""Bibliothèque d'aquarelles, thème 2 (fruits, ingrédients, décor) : détourage, recadrage, harmonisation.

  tools/ecriture/.venv/bin/python -I scripts/aquarelles_2.py

Entrées (hors dépôt, téléchargées une fois depuis les sources listées dans catalogue-2.json) :
  verification/out/v5-aquarelles/originaux/<src>.jpg|png

Sorties :
  design-system/aquarelles/<nom>.png        RGBA, 900 px au plus, détourage en alpha
  design-system/aquarelles/catalogue-2.json  sujet, source, auteur, licence, fichier
  verification/out/v5-aquarelles/planche-2.png  planche de contrôle sur papier f9.webp

Détourage : le fond est la composante du bord qui ressemble à la couleur du papier (médiane des bords
clairs). Les pixels de fond connectés au bord passent à alpha 0 ; une bande de 2 px autour reçoit une
transition linéaire, et sa couleur est corrigée (désaturation du papier retirée) pour ne pas laisser de
halo. Recadrage serré autour de l'alpha. Harmonisation : désaturation légère et réchauffement pour
s'accorder au papier crème. Déterministe, sans réseau. PIL et numpy seulement.
"""
import hashlib
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(ROOT, 'verification', 'out', 'v5-aquarelles', 'originaux')
OUT = os.path.join(ROOT, 'design-system', 'aquarelles')
PLANCHE = os.path.join(ROOT, 'verification', 'out', 'v5-aquarelles', 'planche-2.png')
PAPIER = os.path.join(ROOT, 'design-system', 'baked', 'pages', 'papier', 'f9.webp')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
FONT_I = '/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf'

MAX_SIDE = 900
T_CORE = 0.075   # distance RGB (0..1) au papier sous laquelle un pixel est candidat au fond
T_EDGE = 0.20    # au-delà, le pixel est pleinement opaque
DESAT = 0.88     # 1 = inchangé
WARM = (1.025, 1.0, 0.93)

USDA = 'USDA Pomological Watercolor Collection (domaine public, États-Unis)'
CATTO = 'Aberdeen Art Gallery & Museums (CC0 pour la reproduction ; oeuvre du domaine public)'
YCBA = 'Yale Center for British Art (CC0)'
KOHLER = "Köhler's Medizinal-Pflanzen (domaine public, marque PD)"

# nom : (fichier source, recadrage (x0, y0, x1, y1) en fractions de la source, sujet, page source,
#        auteur, licence, collection)
SPEC = {
    'citron': ('pom-128.jpg', (0.19, 0.122, 0.72, 0.80), 'citron Eureka (entier et demi-coupe)',
               'https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00000128.jpg',
               'Ellen Isham Schutt (1873-1955)', 'Domaine public (USDA, oeuvre fédérale américaine)', USDA),
    'citron-2': ('pom-090.jpg', (0.30, 0.41, 0.68, 0.805), 'citron Pica (entier et demi-coupe)',
                 'https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00000090.jpg',
                 'Amanda Almira Newton (morte en 1943)', 'Domaine public (USDA, oeuvre fédérale américaine)', USDA),
    'pomme': ('pom-131.jpg', (0.22, 0.13, 0.78, 0.785), 'pomme Yankee (entière et demi-coupe)',
              'https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00000131.jpg',
              'Amanda Almira Newton (morte en 1943)', 'Domaine public (USDA, oeuvre fédérale américaine)', USDA),
    'pomme-2': ('pom-147.jpg', (0.25, 0.13, 0.80, 0.455), 'pomme Dominie (entière)',
                'https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00000147.jpg',
                'Amanda Almira Newton (morte en 1943)', 'Domaine public (USDA, oeuvre fédérale américaine)', USDA),
    'fraise': ('catto-fraise.jpg', None, 'fraise des bois (Fragaria vesca), aquarelle botanique',
               'https://commons.wikimedia.org/wiki/File:Wild_strawberry_(Fragaria_vesca)_-_William_Catto_-_ABDAG016057.jpg',
               'William Catto (1843-1927)', 'CC0 1.0 (reproduction numérique) ; oeuvre du domaine public', CATTO),
    'orange': ('pom-260.jpg', (0.26, 0.47, 0.78, 0.81), 'orange Valencia (demi-coupe)',
               'https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00000260.jpg',
               'Royal Charles Steadman (1875-1964)', 'Domaine public (USDA, oeuvre fédérale américaine)', USDA),
    'orange-2': ('pom-261.jpg', (0.26, 0.15, 0.76, 0.81), 'deux oranges Valencia',
                 'https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00000261.jpg',
                 'Royal Charles Steadman (1875-1964)', 'Domaine public (USDA, oeuvre fédérale américaine)', USDA),
    'oeufs': ('ycba-egg-100.jpg', None, "oeuf d'oiseau, aquarelle sur papier crème",
              'https://commons.wikimedia.org/wiki/File:James_Sowerby_-_A_Bird%27s_Egg_-_B1978.43.100_-_Yale_Center_for_British_Art.jpg',
              'James Sowerby (1757-1822)', 'CC0 1.0', YCBA),
    'oeufs-2': ('ycba-egg-101.jpg', None, "oeuf d'oiseau, aquarelle sur papier crème",
                'https://commons.wikimedia.org/wiki/File:James_Sowerby_-_A_Bird%27s_Egg_-_B1978.43.101_-_Yale_Center_for_British_Art.jpg',
                'James Sowerby (1757-1822)', 'CC0 1.0', YCBA),
    'cannelle': ('kohler-cannelle.jpg', None, 'branche de cannellier (Cinnamomum verum), planche botanique',
                 'https://commons.wikimedia.org/wiki/File:Cinnamomum_verum_-_K%C3%B6hler%E2%80%93s_Medizinal-Pflanzen-182.jpg',
                 'Franz Eugen Köhler', 'Domaine public (marque PDM 1.0)', KOHLER),
    'vanille': ('kohler-vanille.jpg', None, 'plant de vanille (Vanilla planifolia), planche botanique',
                'https://commons.wikimedia.org/wiki/File:Vanilla_planifolia_-_K%C3%B6hler%E2%80%93s_Medizinal-Pflanzen-278.jpg',
                'Franz Eugen Köhler', 'Domaine public (marque PDM 1.0)', KOHLER),
    'noix': ('pom-7469.jpg', (0.20, 0.125, 0.85, 0.298), 'noix (Juglans), une variété',
             'https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00007469.jpg',
             'Amanda Almira Newton (morte en 1943)', 'Domaine public (USDA, oeuvre fédérale américaine)', USDA),
    'branche': ('catto-cerisier.jpg', None, 'branche de merisier (Prunus padus), aquarelle botanique',
                'https://commons.wikimedia.org/wiki/File:Bird_Cherry_(Prunus_Padus)_-_William_Catto_-_ABDAG016200.jpg',
                'William Catto (1843-1927)', 'CC0 1.0 (reproduction numérique) ; oeuvre du domaine public', CATTO),
    'branche-2': ('catto-rosier.jpg', None, 'branche de rosier (Rosa spinosissima), aquarelle botanique',
                  'https://commons.wikimedia.org/wiki/File:Burnet_rose_(rosa_spinosissima)_-_William_Catto_-_ABDAG016412.jpg',
                  'William Catto (1843-1927)', 'CC0 1.0 (reproduction numérique) ; oeuvre du domaine public', CATTO),
}

SHORT = {USDA: 'USDA (domaine public)', CATTO: 'Aberdeen AAGM (CC0)', KOHLER: 'Köhler (PD, planche)', YCBA: 'Yale Center (CC0)'}

# Sujets sans aquarelle libre trouvée (aucune source vérifiée) : listés tels quels dans la planche.
MANQUANTS = ['carotte', 'farine', 'beurre', 'sucre', 'chocolat', 'guirlande']


def frac_crop(im, fr):
    if fr is None:
        return im
    w, h = im.size
    x0, y0, x1, y1 = fr
    return im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))


def trim_dark_edges(arr, thr=0.22, max_frac=0.08):
    """Retire les bords sombres du scan (passe-partout noir des fichiers Commons)."""
    lum = arr.mean(axis=2)
    top, bottom, left, right = 0, lum.shape[0], 0, lum.shape[1]
    lim_v = int(lum.shape[0] * max_frac)
    lim_h = int(lum.shape[1] * max_frac)
    while top < lim_v and lum[top, left:right].mean() < thr:
        top += 1
    while bottom > lum.shape[0] - lim_v and lum[bottom - 1, left:right].mean() < thr:
        bottom -= 1
    while left < lim_h and lum[top:bottom, left].mean() < thr:
        left += 1
    while right > lum.shape[1] - lim_h and lum[top:bottom, right - 1].mean() < thr:
        right -= 1
    return arr[top:bottom, left:right]


def paper_colour(arr):
    """Couleur du papier : médiane des pixels clairs du bord de l'image."""
    strips = np.concatenate([
        arr[:4].reshape(-1, 3), arr[-4:].reshape(-1, 3),
        arr[:, :4].reshape(-1, 3), arr[:, -4:].reshape(-1, 3),
    ])
    lum = strips.mean(axis=1)
    bright = strips[lum >= np.percentile(lum, 50)]
    return np.median(bright, axis=0)


def shift_or(m):
    """Dilatation 4-connexe d'un masque booléen de 1 px."""
    out = m.copy()
    out[1:, :] |= m[:-1, :]
    out[:-1, :] |= m[1:, :]
    out[:, 1:] |= m[:, :-1]
    out[:, :-1] |= m[:, 1:]
    return out


def flood_from_border(mask):
    """Pixels de `mask` reliés (4-connexité) au bord de l'image."""
    seed = np.zeros_like(mask)
    seed[0, :] = mask[0, :]
    seed[-1, :] = mask[-1, :]
    seed[:, 0] |= mask[:, 0]
    seed[:, -1] |= mask[:, -1]
    cur = seed
    while True:
        grow = shift_or(cur) & mask
        if np.array_equal(grow, cur):
            return cur
        cur = grow


def dilate(m, n):
    out = m
    for _ in range(n):
        out = shift_or(out)
    return out


def detoure(arr, mode='connexe', t_core=T_CORE, t_edge=T_EDGE, band_px=4):
    """Renvoie (rgb corrigé, alpha) à partir d'une image RGB float dans [0, 1].

    mode 'connexe' : seul le fond relié au bord est retiré (aquarelles sur papier, le blanc
    enclavé d'un fruit est conservé). mode 'globale' : tout pixel proche du papier est retiré
    (planches botaniques à fond blanc pur, dont le blanc est enclavé entre les feuilles).
    """
    paper = paper_colour(arr)
    d = np.linalg.norm(arr - paper, axis=2)
    cand = d < t_core
    bg = cand if mode == 'globale' else flood_from_border(cand)
    band = dilate(bg, band_px) & ~bg
    alpha = np.ones(d.shape, dtype=np.float32)
    alpha[bg] = 0.0
    ramp = np.clip((d - t_core) / (t_edge - t_core), 0.0, 1.0).astype(np.float32)
    alpha[band] = ramp[band]
    rgb = arr.copy()
    m = band & (alpha > 0.02)
    a = alpha[m][:, None]
    # Retire la part du papier mélangée au bord : I = a*C + (1-a)*P  ->  C = (I - (1-a)*P) / a
    rgb[m] = np.clip((arr[m] - (1.0 - a) * paper) / a, 0.0, 1.0)
    return rgb, alpha


def harmonise(rgb):
    lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2])[..., None]
    rgb = lum + (rgb - lum) * DESAT
    rgb = rgb * np.array(WARM, dtype=np.float32)
    return np.clip(rgb, 0.0, 1.0)


def tight_crop(rgb, alpha, pad=6):
    ys, xs = np.where(alpha > 0.03)
    if ys.size == 0:
        raise SystemExit('détourage vide')
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, alpha.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, alpha.shape[1])
    return rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]


# Réglages de détourage propres à une source ; les autres utilisent les valeurs par défaut.
OPTS = {
    'cannelle': {'mode': 'globale', 't_core': 0.07, 't_edge': 0.16, 'band_px': 2},
    'vanille': {'mode': 'globale', 't_core': 0.07, 't_edge': 0.16, 'band_px': 2},
}


def process(src_path, crop, opts=None):
    im = Image.open(src_path).convert('RGB')
    im = frac_crop(im, crop)
    arr = np.asarray(im, dtype=np.float32) / 255.0
    arr = trim_dark_edges(arr)
    rgb, alpha = detoure(arr, **(opts or {}))
    rgb, alpha = tight_crop(rgb, alpha)
    rgb = harmonise(rgb)
    h, w = alpha.shape
    if max(h, w) > MAX_SIDE:
        s = MAX_SIDE / max(h, w)
        nw, nh = max(1, round(w * s)), max(1, round(h * s))
        rgba = np.dstack([rgb, alpha[..., None]])
        img = Image.fromarray((rgba * 255).round().astype(np.uint8), 'RGBA')
        img = img.resize((nw, nh), Image.LANCZOS)
    else:
        rgba = np.dstack([rgb, alpha[..., None]])
        img = Image.fromarray((rgba * 255).round().astype(np.uint8), 'RGBA')
    return img


def planche(items):
    """items: liste (nom, Image RGBA ou None, libellé court)."""
    cols, cell_w, cell_h, pad, head = 4, 380, 360, 30, 90
    rows = (len(items) + cols - 1) // cols
    W = cols * cell_w + 2 * pad
    H = head + rows * cell_h + pad
    paper = Image.open(PAPIER).convert('RGB')
    pw, ph = paper.size
    target = W / H
    # recadrage du papier à la proportion de la planche, puis mise à l'échelle
    if pw / ph > target:
        nw = round(ph * target)
        paper = paper.crop(((pw - nw) // 2, 0, (pw - nw) // 2 + nw, ph))
    else:
        nh = round(pw / target)
        paper = paper.crop((0, (ph - nh) // 2, pw, (ph - nh) // 2 + nh))
    board = np.asarray(paper.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255.0
    font = ImageFont.truetype(FONT, 26)
    font_i = ImageFont.truetype(FONT_I, 20)
    font_t = ImageFont.truetype(FONT, 34)
    for i, (nom, img, legende) in enumerate(items):
        cx = pad + (i % cols) * cell_w
        cy = head + (i // cols) * cell_h
        box_w, box_h = cell_w - 30, cell_h - 90
        if img is not None:
            s = min(box_w / img.width, box_h / img.height, 1.0)
            im2 = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
            ox = cx + (cell_w - im2.width) // 2
            oy = cy + (box_h - im2.height) // 2 + 6
            a = np.asarray(im2, dtype=np.float32)[..., 3:4] / 255.0
            art = np.asarray(im2.convert('RGB'), dtype=np.float32) / 255.0
            region = board[oy:oy + im2.height, ox:ox + im2.width]
            board[oy:oy + im2.height, ox:ox + im2.width] = region * ((1.0 - a) + a * art)
        base = Image.fromarray((board * 255).astype(np.uint8))
        draw = ImageDraw.Draw(base)
        if img is None:
            draw.rounded_rectangle((cx + 20, cy + 20, cx + cell_w - 20, cy + box_h), 18, outline=(120, 90, 70), width=2)
            draw.text((cx + cell_w // 2, cy + box_h // 2 - 8), 'aucune source libre', fill=(90, 70, 55), font=font_i, anchor='mm')
        draw.text((cx + cell_w // 2, cy + box_h + 22), nom, fill=(60, 45, 35), font=font, anchor='mm')
        draw.text((cx + cell_w // 2, cy + box_h + 52), legende, fill=(110, 90, 75), font=font_i, anchor='mm')
        board = np.asarray(base, dtype=np.float32) / 255.0
    base = Image.fromarray((board * 255).astype(np.uint8))
    draw = ImageDraw.Draw(base)
    draw.text((W // 2, 40), 'Les goûters de Cécile : aquarelles, thème 2', fill=(60, 45, 35), font=font_t, anchor='mm')
    os.makedirs(os.path.dirname(PLANCHE), exist_ok=True)
    base.save(PLANCHE, optimize=True)
    return PLANCHE


def _est_image(path):
    try:
        with Image.open(path) as im:
            im.verify()
        return True
    except Exception:
        return False


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    os.makedirs(OUT, exist_ok=True)
    catalogue = {}
    planche_items = []
    for nom, (src, crop, sujet, page, auteur, licence, collection) in SPEC.items():
        path = os.path.join(ORIG, src)
        if not os.path.exists(path) or not _est_image(path):
            print('absent, ignoré :', nom, path)
            planche_items.append((nom, None, 'téléchargement bloqué (429)'))
            continue
        img = process(path, crop, OPTS.get(nom))
        out_name = nom + '.png'
        img.save(os.path.join(OUT, out_name), optimize=True)
        catalogue[nom] = {
            'sujet': sujet,
            'source': page,
            'auteur': auteur,
            'licence': licence,
            'fichier': out_name,
        }
        planche_items.append((nom, img, SHORT[collection]))
        print(nom, img.size, sha256(os.path.join(OUT, out_name))[:12])
    for nom in MANQUANTS:
        planche_items.append((nom, None, ''))
    with open(os.path.join(OUT, 'catalogue-2.json'), 'w', encoding='utf-8') as f:
        json.dump(catalogue, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('planche :', planche(planche_items))


if __name__ == '__main__':
    main()
