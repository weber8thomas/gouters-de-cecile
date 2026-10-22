#!/usr/bin/env python3
"""Roulés à la cannelle (recette de Lily) : design-system/aquarelles/roules-cannelle.png.

    tools/ecriture/.venv/bin/python -I scripts/aquarelle-roules-cannelle.py
    tools/ecriture/.venv/bin/python -I scripts/bake-aquarelles.py --only roules-cannelle

Aucune aquarelle du carnet ne montre de roulés : le moule cannelé de la série anglaise (acteurs/moule.png)
reçoit sept roulés, peints ici dans la même facture que les autres (pâte dorée, spirale de cannelle,
glaçage blanc, contour au crayon brun fin, grain du papier). Déterministe (graine fixe).
Sortie : PNG 600 × 600 avec transparence, même cadrage que le moule ; la cuisson (bake-aquarelles.py)
fait le reste (WebP, teinte du papier).
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

RACINE = Path(__file__).resolve().parents[1]
MOULE = RACINE / "design-system/aquarelles/acteurs/moule.png"
SORTIE = RACINE / "design-system/aquarelles/roules-cannelle.png"
SS = 3  # sur-échantillonnage

# Ouverture du moule (px de l'image 600 × 600) : bord avant, fond du moule
OUV = dict(cx=301.0, cy=256.0, rx=273.0, ry=146.0)
FOND = dict(cx=300.0, cy=334.0, rx=227.0)
VUE = 0.54  # écrasement vertical du plan horizontal (même point de vue que le moule)

PATE_CLAIR = np.array([240, 200, 128], float)
PATE_DORE = np.array([205, 146, 74], float)
CANNELLE = np.array([148, 84, 42], float)
CANNELLE_SOMBRE = np.array([112, 62, 32], float)
CREME = np.array([253, 247, 234], float)
CRAYON = (104, 66, 38)


def bruit(taille, graine, sigma, force):
    """Grain doux multiplicatif autour de 1."""
    r = np.random.default_rng(graine).normal(0, 1, (taille[1], taille[0])).astype(np.float32)
    im = Image.fromarray(((r - r.min()) / (r.max() - r.min()) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))
    a = np.asarray(im, np.float32) / 255.0 - 0.5
    a = a / max(1e-6, a.std()) * force
    return 1.0 + a


def pinceau(draw, pts, largeurs, couleur):
    for (x, y), w in zip(pts, largeurs):
        draw.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=couleur)


def dessus(r, graine):
    """Le dessus d'un roulé, à plat (disque RGBA de 2r × SS px de côté)."""
    D = int(2 * r * SS)
    rg = np.random.default_rng(graine)
    yy, xx = np.mgrid[0:D, 0:D].astype(np.float32)
    d = np.hypot(xx - D / 2, yy - D / 2) / (D / 2)
    # lumière en haut à gauche, bord plus cuit
    lum = np.clip(1 - 0.35 * ((xx - D / 2) * 0.6 + (yy - D / 2) * 0.8) / (D / 2), 0.7, 1.15)[..., None]
    cuit = np.clip(d, 0, 1)[..., None] ** 1.8
    base = PATE_CLAIR * (1 - cuit) + PATE_DORE * cuit
    img = Image.fromarray(np.clip(base * lum, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    # spirale de cannelle : rho de 0,10 à 0,94, 2,7 tours, départ aléatoire
    tours = 2.7 + rg.uniform(-0.15, 0.15)
    t0 = rg.uniform(0, 2 * math.pi)
    n = 900
    th = np.linspace(0, 2 * math.pi * tours, n)
    rho = 0.10 + 0.84 * th / th[-1]
    pas = 0.84 / tours  # écart entre deux tours (en rayon unité)
    ph = rg.uniform(0, 6, 3)
    irr = lambda t: 1 + 0.035 * math.sin(1.7 * t + ph[0]) + 0.025 * math.sin(3.1 * t + ph[1])
    pts = [(D / 2 + math.cos(t + t0) * p * irr(t) * D / 2 * 0.95, D / 2 + math.sin(t + t0) * p * irr(t) * D / 2 * 0.95) for t, p in zip(th, rho)]
    couche = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    dr = ImageDraw.Draw(couche)
    w_ext = pas * D / 2 * 0.46
    pinceau(dr, pts, [w_ext * (0.9 + 0.12 * math.sin(i / 17)) for i in range(n)], tuple(int(v) for v in CANNELLE_SOMBRE) + (255,))
    couche2 = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    dr2 = ImageDraw.Draw(couche2)
    pinceau(dr2, pts, [w_ext * (0.62 + 0.12 * math.sin(i / 13)) for i in range(n)], tuple(int(v) for v in CANNELLE) + (255,))
    couche = couche.filter(ImageFilter.GaussianBlur(SS * 0.9))
    couche2 = couche2.filter(ImageFilter.GaussianBlur(SS * 0.7))
    img.alpha_composite(couche)
    img.alpha_composite(couche2)
    # grains de sucre roux
    gr = ImageDraw.Draw(img)
    for _ in range(int(r * 1.2)):
        i = rg.integers(0, n)
        x, y = pts[i]
        x += rg.normal(0, w_ext * 0.18)
        y += rg.normal(0, w_ext * 0.18)
        s = SS * rg.uniform(0.7, 1.5)
        gr.ellipse([x - s, y - s, x + s, y + s], fill=(236, 190, 120, 200))
    # glaçage : quelques coulées crémeuses en travers
    gl = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    ang0 = rg.uniform(0, math.pi)
    for k in range(3):
        ang = ang0 + rg.uniform(-0.12, 0.12)
        dec = (k - 1) * 0.42 * D / 2 + rg.uniform(-0.05, 0.05) * D
        px, py = math.cos(ang + math.pi / 2) * dec, math.sin(ang + math.pi / 2) * dec
        ph = rg.uniform(0, 6)
        ligne = []
        for u in np.linspace(-1.05, 1.05, 70):
            l = u * D / 2
            ond = math.sin(u * 5.0 + ph) * D * 0.035
            ligne.append((D / 2 + px + math.cos(ang) * l - math.sin(ang) * ond, D / 2 + py + math.sin(ang) * l + math.cos(ang) * ond))
        pinceau(gd, ligne, [D * 0.042 * (0.75 + 0.45 * math.sin(i / 6 + k)) for i in range(70)], tuple(int(v) for v in CREME) + (185,))
    gl = gl.filter(ImageFilter.GaussianBlur(SS * 1.1))
    img.alpha_composite(gl)
    # grain du papier aquarellé
    a = np.asarray(img, np.float32)
    a[..., :3] *= bruit((D, D), graine + 7, SS * 1.6, 0.045)[..., None]
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
    return img


def roule(r, graine):
    """Un roulé vu de trois quarts : dessus écrasé + flanc doré. Renvoie (image RGBA, y du centre du dessus)."""
    D = int(2 * r * SS)
    hd = int(D * VUE)
    haut = int(r * 0.62 * SS)
    H = hd + haut + SS * 4
    top = dessus(r, graine).resize((D, hd), Image.LANCZOS)
    rg = np.random.default_rng(graine + 1)
    f = rg.uniform(0, 6, 3)
    def forme(dy):
        pts = []
        for t in np.linspace(0, 2 * math.pi, 120, endpoint=False):
            m = 1 + 0.03 * math.sin(3 * t + f[0]) + 0.022 * math.sin(5 * t + f[1]) + 0.012 * math.sin(9 * t + f[2])
            pts.append((D / 2 + math.cos(t) * (D / 2 - 2 * SS) * m, hd / 2 + dy + math.sin(t) * (hd / 2 - 2 * SS) * m))
        return pts
    masque_top = Image.new("L", (D, H), 0)
    ImageDraw.Draw(masque_top).polygon(forme(0), fill=255)
    silhouette = Image.new("L", (D, H), 0)
    sd = ImageDraw.Draw(silhouette)
    sd.polygon(forme(0), fill=255)
    sd.polygon(forme(haut), fill=255)
    sd.rectangle([int(D * 0.03), hd // 2, int(D * 0.97), hd // 2 + haut], fill=255)
    silhouette = silhouette.filter(ImageFilter.GaussianBlur(SS * 0.8)).point(lambda p: 255 if p > 127 else int(p * 2))
    # flanc : doré en haut, plus cuit en bas, un peu plus sombre à droite, lobes verticaux discrets
    yy, xx = np.mgrid[0:H, 0:D].astype(np.float32)
    v = np.clip((yy - hd / 2) / max(1, hd / 2 + haut), 0, 1)
    flanc = (np.array([226, 176, 100], float) * (1 - v[..., None]) + np.array([168, 104, 50], float) * v[..., None])
    ombre = 1.0 - 0.22 * np.clip((xx / D - 0.35) / 0.65, 0, 1) - 0.10 * (0.5 + 0.5 * np.sin(xx / (D * 0.09) + graine))
    flanc *= ombre[..., None]
    flanc *= bruit((D, H), graine + 3, SS * 1.4, 0.05)[..., None]
    im = Image.fromarray(np.clip(flanc, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    im.putalpha(silhouette)
    # dessus
    hautim = Image.new("RGBA", (D, H), (0, 0, 0, 0))
    hautim.paste(top, (0, 0))
    hautim.putalpha(ImageChops.multiply(hautim.getchannel("A"), masque_top))
    im.alpha_composite(hautim)
    # contour au crayon brun fin : silhouette puis bord du dessus
    contour = Image.new("RGBA", (D, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(contour)
    cd.line(forme(0) + [forme(0)[0]], fill=CRAYON + (120,), width=SS * 2)
    bord = ImageChops.subtract(silhouette, silhouette.filter(ImageFilter.MinFilter(SS * 4 + 1)))
    coul = Image.new("RGBA", (D, H), CRAYON + (0,))
    coul.putalpha(bord.point(lambda p: int(p * 0.6)))
    im.alpha_composite(coul)
    im.alpha_composite(contour)
    return im, hd / 2


def main() -> None:
    moule = Image.open(MOULE).convert("RGBA").resize((600, 600), Image.LANCZOS)
    canevas = Image.new("RGBA", (600 * SS, 600 * SS), (0, 0, 0, 0))
    r = 75.0
    # sept roulés : un au centre, six autour (coordonnées du plan du fond du moule)
    pos = [(0.0, 0.0)] + [(2.0 * r * math.cos(math.radians(a)), 2.0 * r * math.sin(math.radians(a))) for a in (90 + 60 * k + 30 for k in range(6))]
    pos.sort(key=lambda p: p[1])  # de l'arrière vers l'avant
    for k, (u, v) in enumerate(pos):
        im, c = roule(r, 40 + k * 11)
        gx = FOND["cx"] + u
        gy = FOND["cy"] + v * VUE - 36  # les roulés gonflent au-dessus du fond
        canevas.alpha_composite(im, (int((gx - r) * SS), int((gy - c / SS) * SS)))
    # le bord avant du moule cache le bas des roulés : on ne garde que ce qui est au-dessus de son arc
    yy, xx = np.mgrid[0:600 * SS, 0:600 * SS].astype(np.float32)
    x = xx / SS
    y = yy / SS
    t = np.clip(1 - ((x - OUV["cx"]) / (OUV["rx"] * 0.965)) ** 2, 0, 1)
    arc = OUV["cy"] + OUV["ry"] * 0.975 * np.sqrt(t)
    garde = ((y < arc) & (np.abs(x - OUV["cx"]) < OUV["rx"] * 0.965)).astype(np.uint8) * 255
    m = Image.fromarray(garde, "L").filter(ImageFilter.GaussianBlur(SS * 0.6))
    canevas.putalpha(ImageChops.multiply(canevas.getchannel("A"), m))
    roulés = canevas.resize((600, 600), Image.LANCZOS)
    out = moule.copy()
    out.alpha_composite(roulés)
    out.save(SORTIE, optimize=True)
    print(f"{SORTIE.relative_to(RACINE)} {out.size[0]}×{out.size[1]}")


if __name__ == "__main__":
    main()
