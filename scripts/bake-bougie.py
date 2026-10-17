#!/usr/bin/env python3
"""Bougie du carnet (composant Bougie, lot L) : cire crème, coulures, bougeoir en laiton, ombre portée
sur la table, et les deux calques de la flamme. PIL seul, déterministe (graines fixes), aucun réseau.

  python3 -I scripts/bake-bougie.py

Sorties (design-system/baked/bougie/, WebP à alpha) :
  bougie.webp         pose complète, 340 × 408 px de scène (cuite à 425 × 510) : bougie, bougeoir, ombre
  flamme-corps.webp   flamme orangée, cadre 96 × 160 (cuite à 120 × 200), base au centre-bas
  flamme-coeur.webp   cœur bleu-blanc, même cadre
Le halo n'est pas cuit : c'est un dégradé radial CSS, peint une fois (Bougie.css).

Repère : origine = coin haut-gauche de la pose (Bougie.css la place au bas de la scène, à droite). La bougie
est centrée en x = 158 ; le plateau repose vers y = 356 ; la mèche est vers y = 6 ; la flamme naît en
y = 6 et s'élève. Le dessin est fait en repère de scène ; il est cuit à 1,25 × la taille affichée
(ECHELLE, qui doit valoir --gc-bougie-k dans Bougie.css). Les masques sont dessinés en supersampling × 4
puis réduits, pour des bords nets. Le corps et le bougeoir sont assombris (SOMBRE) : pénombre.
"""
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'design-system', 'baked', 'bougie')

ECHELLE = 0.36   # taille affichée de la pose, en fraction de la scène (Bougie.css : --gc-bougie-k)
S = 1.25 * ECHELLE   # échelle de cuisson : 1,25 × la taille affichée (CONTRACT § 6)
SS = 4     # supersampling des masques
CX = 158   # axe de la bougie, repère de la pose

# ---- Couleurs -----------------------------------------------------------------------------------
# Cire crème, lumière venue de la gauche (la cheminée est hors champ à gauche) : bord gauche chaud,
# reflet doux à 26 % de la largeur, bord droit dans l'ombre.
CIRE = [(0.00, (204, 178, 130)), (0.08, (236, 216, 176)), (0.24, (255, 247, 228)), (0.40, (245, 231, 200)),
        (0.62, (224, 198, 154)), (0.80, (186, 150, 106)), (0.93, (146, 110, 74)), (1.00, (104, 72, 46))]
# Laiton : sombre aux bords, reflet vif à 37 %.
LAITON = [(0.00, (60, 38, 12)), (0.14, (130, 90, 33)), (0.30, (212, 168, 90)), (0.37, (250, 232, 176)),
          (0.46, (204, 158, 78)), (0.70, (124, 84, 29)), (0.90, (76, 50, 17)), (1.00, (50, 30, 10))]
OMBRE = (26, 13, 7)  # ombre portée sur le bois

FLAMME = [(0.00, (214, 70, 22)), (0.12, (238, 104, 30)), (0.36, (250, 146, 46)), (0.62, (255, 190, 92)),
          (0.86, (255, 232, 170)), (1.00, (255, 250, 228))]          # pointe → base
COEUR = [(0.00, (214, 232, 255)), (0.50, (238, 246, 255)), (0.80, (160, 196, 255)), (1.00, (104, 146, 255))]


def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def couleur_stops(stops, t):
    t = clamp(t)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        if t <= p1:
            u = 0.0 if p1 == p0 else (t - p0) / (p1 - p0)
            return tuple(int(round(c0[k] + (c1[k] - c0[k]) * u)) for k in range(3))
    return stops[-1][1]


class Toile:
    """Une image de cuisson : taille en px de scène (repère local) et taille cuite."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.W, self.H = round(w * S), round(h * S)

    def masque(self, polygones, flou=0.0):
        """Union de polygones (repère local), antialiasée, éventuellement adoucie."""
        m = Image.new('L', (self.W * SS, self.H * SS), 0)
        d = ImageDraw.Draw(m)
        k = S * SS
        for p in polygones:
            d.polygon([(x * k, y * k) for x, y in p], fill=255)
        m = m.resize((self.W, self.H), Image.LANCZOS)
        if flou:
            m = m.filter(ImageFilter.GaussianBlur(flou * S))
        return m

    def grad_h(self, x0, x1, stops):
        """Dégradé horizontal : x0 → t = 0, x1 → t = 1 (repère local ; hors plage : les bords)."""
        ligne = Image.new('RGB', (self.W, 1))
        ligne.putdata([couleur_stops(stops, ((i + 0.5) / S - x0) / (x1 - x0)) for i in range(self.W)])
        return ligne.resize((self.W, self.H), Image.NEAREST)

    def grad_v(self, y0, y1, stops):
        """Dégradé vertical : y0 → t = 0, y1 → t = 1."""
        colonne = Image.new('RGB', (1, self.H))
        colonne.putdata([couleur_stops(stops, ((j + 0.5) / S - y0) / (y1 - y0)) for j in range(self.H)])
        return colonne.resize((self.W, self.H), Image.NEAREST)

    def radial_alpha(self, cx, cy, rx, ry, a_centre, a_bord):
        """Masque elliptique : opacité a_centre au centre, a_bord au bord de l'ellipse."""
        g = Image.radial_gradient('L').resize((max(1, round(2 * rx * S)), max(1, round(2 * ry * S))), Image.BILINEAR)
        fond = Image.new('L', (self.W, self.H), 255)  # hors de l'ellipse : le bord (opacité a_bord)
        fond.paste(g, (round((cx - rx) * S), round((cy - ry) * S)))
        lut = [int(round(255 * clamp(a_centre + (a_bord - a_centre) * min(1.0, i / BORD_RADIAL)))) for i in range(256)]
        return fond.point(lut)

    def radial(self, cx, cy, rx, ry, stops):
        """Dégradé elliptique : t = 0 au centre (cx, cy), t = 1 au bord de l'ellipse (rx, ry)."""
        g = Image.radial_gradient('L').resize((max(1, round(2 * rx * S)), max(1, round(2 * ry * S))), Image.BILINEAR)
        fond = Image.new('L', (self.W, self.H), 255)
        fond.paste(g, (round((cx - rx) * S), round((cy - ry) * S)))
        return lut_rgb(fond, stops)


# PIL : Image.radial_gradient vaut ≈ 179 sur le bord de l'ellipse inscrite (255 aux coins) ; on ramène
# le bord de l'ellipse à t = 1.
BORD_RADIAL = 179.0


def lut_rgb(gris, stops):
    luts = [[], [], []]
    for i in range(256):
        c = couleur_stops(stops, min(1.0, i / BORD_RADIAL))
        for k in range(3):
            luts[k].append(c[k])
    return Image.merge('RGB', [gris.point(luts[k]) for k in range(3)])


# La bougie reste dans la pénombre : seule sa lueur compte. Le corps et le bougeoir sont assombris
# d'un facteur chaud (la flamme et le halo, cuits à part, ne sont pas touchés).
SOMBRE = (0.36, 0.32, 0.29)


def assombrir(im, facteur):
    rgb, alpha = im.convert('RGB'), im.getchannel('A')
    teinte = Image.new('RGB', im.size, tuple(int(round(255 * c)) for c in facteur))
    out = ImageChops.multiply(rgb, teinte)
    out.putalpha(alpha)
    return out


def couche(rgb, masque, opacite=1.0):
    """Une couche RGBA : couleur (RGB) découpée par le masque, opacité multipliée."""
    im = rgb.convert('RGBA')
    im.putalpha(masque if opacite >= 1.0 else masque.point(lambda v: int(round(v * opacite))))
    return im


def sur(fond, dessus):
    return Image.alpha_composite(fond, dessus)


def aplat(T, couleur):
    return Image.new('RGB', (T.W, T.H), couleur)


def liseré(masque, taille=3):
    """Contour fin d'un masque (intérieur), en masque."""
    return ImageChops.subtract(masque, masque.filter(ImageFilter.MinFilter(taille)))


def grain(T, amplitude, graine):
    """Grain de cire : bruit gaussien doux, sans biais de luminosité."""
    rnd = random.Random(graine)
    donnees = bytes(max(0, min(255, int(rnd.gauss(128, amplitude)))) for _ in range(T.W * T.H))
    g = Image.frombytes('L', (T.W, T.H), donnees).filter(ImageFilter.GaussianBlur(0.6))
    bruit = Image.merge('RGB', (g, g, g))
    return bruit


def ellipse(cx, cy, rx, ry, a0=0, a1=360, n=72):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def coulure(x, y0, longueur, demi):
    """Une coulure : bande qui descend du bord supérieur, bout arrondi (bulbe)."""
    yb = y0 + longueur
    return ([(x - demi, y0), (x - demi, yb)] + ellipse(x, yb, demi, demi * 1.15, 180, 0, 24) + [(x + demi, y0)])


def ordonnee_bord(x, cy=18.0, rx=50.0, ry=10.0):
    """Ordonnée du bord inférieur de l'ellipse du haut de la bougie, à l'abscisse x (repère local)."""
    u = (x - CX) / rx
    return cy + ry * math.sqrt(max(0.0, 1 - u * u))


# ---- La pose : bougie, bougeoir, ombre -----------------------------------------------------------
def pose():
    T = Toile(340, 408)
    BORD_BAS = 330.0       # entrée de la bougie dans le bougeoir
    PLATEAU_Y = 356.0      # centre du plateau
    PLATEAU_E = 11.0       # épaisseur du plateau

    # Silhouettes : chaque élément est une liste de polygones (leur union), repère local
    plateau_haut = ellipse(CX, PLATEAU_Y, 112, 20)
    plateau_bas = ellipse(CX, PLATEAU_Y + PLATEAU_E, 112, 20)
    plateau_polys = [plateau_haut, plateau_bas, rect(CX - 112, PLATEAU_Y, CX + 112, PLATEAU_Y + PLATEAU_E)]
    douille_polys = [rect(CX - 58, BORD_BAS, CX + 58, 352), ellipse(CX, 352, 60, 10, 0, 180)]
    douille_bord = ellipse(CX, BORD_BAS, 58, 10)
    douille_bouche = ellipse(CX, BORD_BAS, 56, 9)
    corps_polys = [rect(CX - 50, 18, CX + 50, BORD_BAS), ellipse(CX, BORD_BAS, 50, 10, 0, 180), ellipse(CX, 18, 50, 10)]
    dessus = ellipse(CX, 18, 50, 10)
    coulures = [(118, 40, 3.2), (132, 92, 4.2), (146, 24, 3.0), (162, 128, 4.6), (176, 58, 3.8),
                (192, 30, 3.0), (110, 14, 2.4)]
    coul_polys = [coulure(x, ordonnee_bord(x) - 1.0, L, d) for x, L, d in coulures]

    objet = plateau_polys + douille_polys + corps_polys + coul_polys

    # Ombres portées sur le bois : une ombre longue et douce vers la droite, un liseré de contact sous le plateau.
    def decale(polys, dx, dy):
        return [[(x + dx, y + dy) for x, y in p] for p in polys]

    ombre = Image.new('RGBA', (T.W, T.H), (0, 0, 0, 0))
    ombre = sur(ombre, couche(aplat(T, OMBRE), T.masque(decale(objet, 44, 8), flou=10), 0.30))
    ombre = sur(ombre, couche(aplat(T, OMBRE), T.masque(decale(plateau_polys, 22, 5), flou=6), 0.42))
    ombre = sur(ombre, couche(aplat(T, OMBRE), T.masque([ellipse(CX + 4, PLATEAU_Y + 27, 118, 14)], flou=3.5), 0.80))
    ombre = sur(ombre, couche(aplat(T, OMBRE), T.masque([ellipse(CX + 14, PLATEAU_Y + 22, 150, 24)], flou=14), 0.20))
    img = ombre

    # Bougeoir : plateau (flanc puis dessus), douille (flanc, bouche, anneau), en laiton
    flanc_plateau = T.grad_h(46, 270, LAITON)
    img = sur(img, couche(flanc_plateau, T.masque(plateau_polys)))
    dessus_plateau = T.radial(142, PLATEAU_Y - 5, 130, 30,
                              [(0.0, (250, 232, 178)), (0.45, (210, 166, 86)), (1.0, (140, 96, 38))])
    img = sur(img, couche(dessus_plateau, T.masque([plateau_haut])))
    # Liseré clair sur le bord avant du plateau
    avant = T.masque([rect(40, PLATEAU_Y + 2, 280, PLATEAU_Y + 14)])
    img = sur(img, couche(aplat(T, (255, 236, 186)), ImageChops.multiply(liseré(T.masque([plateau_haut]), 3), avant), 0.55))

    flanc_douille = T.grad_h(96, 220, LAITON)
    img = sur(img, couche(flanc_douille, T.masque(douille_polys + [douille_bord])))
    img = sur(img, couche(T.radial(CX - 6, BORD_BAS - 2, 60, 12,
                                   [(0.0, (176, 130, 62)), (1.0, (104, 66, 24))]), T.masque([douille_bord])))
    # Anneau clair au milieu de la douille
    img = sur(img, couche(aplat(T, (246, 220, 150)), T.masque([rect(100, 343, 216, 346)]), 0.45))
    # Bouche du bougeoir : intérieur sombre, la bougie y entre
    img = sur(img, couche(aplat(T, (34, 20, 8)), T.masque([douille_bouche])))

    # Corps de la bougie : cire, ombre douce vers le bas, grain
    cire = T.grad_h(CX - 50, CX + 50, CIRE)
    ao = T.grad_v(18, BORD_BAS, [(0.0, (255, 255, 255)), (0.7, (240, 232, 222)), (1.0, (206, 194, 180))])
    cire = ImageChops.multiply(cire, ao)
    cire = ImageChops.add(cire, grain(T, 2.4, 11), 1.0, -128)
    img = sur(img, couche(cire, T.masque(corps_polys)))

    # Coulures : même cire, liseré discret, reflet sur le bout arrondi
    masque_coul = T.masque(coul_polys)
    img = sur(img, couche(cire, masque_coul))
    img = sur(img, couche(aplat(T, (150, 108, 70)), liseré(masque_coul, 3), 0.16))
    for x, L, d in coulures:
        yb = ordonnee_bord(x) - 1.0 + L
        reflet = T.masque([ellipse(x - d * 0.32, yb - d * 0.35, d * 0.34, d * 0.46)], flou=0.5)
        img = sur(img, couche(aplat(T, (255, 252, 242)), reflet, 0.55))

    # Lueur chaude de la flamme sur la tête de la bougie, qui fond doucement sous elle
    img = sur(img, couche(aplat(T, (255, 170, 90)),
                          ImageChops.multiply(T.masque(corps_polys), T.radial_alpha(CX, 30, 90, 70, 0.30, 0.0))))
    # Dessus de la bougie : cire lisse, bassin de fonte tiède, liseré de l'arête
    img = sur(img, couche(T.radial(152, 16, 60, 14,
                                   [(0.0, (255, 252, 242)), (0.55, (248, 236, 210)), (1.0, (212, 182, 134))]),
                          T.masque([dessus])))
    img = sur(img, couche(aplat(T, (232, 190, 112)), T.masque([ellipse(CX, 17.5, 16, 3.6)], flou=0.8), 0.55))
    img = sur(img, couche(aplat(T, (255, 248, 226)), T.masque([ellipse(CX - 4, 16.4, 6, 1.4)], flou=0.4), 0.55))
    img = sur(img, couche(aplat(T, (176, 138, 94)), liseré(T.masque([dessus]), 5), 0.50))

    # Reflet long sur la cire (du bord gauche de la bougie, le côté de la cheminée)
    img = sur(img, couche(aplat(T, (255, 252, 240)), T.masque([ellipse(CX - 24, 150, 4.5, 110)], flou=3.0), 0.22))

    # Mèche et son bout charbonné
    img = sur(img, couche(aplat(T, (46, 30, 20)), T.masque([rect(CX - 1.1, 6.0, CX + 1.1, 18.5)])))
    img = sur(img, couche(aplat(T, (22, 14, 9)), T.masque([ellipse(CX + 0.2, 6.6, 1.5, 2.0)], flou=0.3)))

    # Lèvre avant de la douille, par-dessus la bougie qui y entre
    levre = T.grad_h(96, 220, LAITON)
    img = sur(img, couche(levre, T.masque([ellipse(CX, BORD_BAS, 58, 10, 0, 180)])))
    img = sur(img, couche(aplat(T, (250, 228, 170)), liseré(T.masque([ellipse(CX, BORD_BAS, 58, 10)]), 3),
                          0.35))
    return assombrir(img, SOMBRE)


# ---- La flamme : deux calques, base au centre-bas du cadre ----------------------------------------
def profil_flamme(base_y, haut, large, puissance, n=96):
    """Contour d'une flamme (repère local du cadre 96 × 160) : base arrondie, pointe, léger déhanchement."""
    droite, gauche = [], []
    for i in range(n + 1):
        v = i / n
        demi = large * (math.sin(math.pi * v ** puissance) ** 0.8)
        demi *= 1 + 0.05 * math.sin(7 * v + 0.8)
        y = base_y - v * haut
        penche = 3.0 * v * v
        droite.append((48 + penche + demi, y))
        gauche.append((48 + penche - demi, y))
    return droite + gauche[::-1]


def flamme():
    T = Toile(96, 160)
    corps_poly = profil_flamme(158, 128, 19.0, 1.35)
    coeur_poly = profil_flamme(158, 56, 10.5, 1.2)

    m_corps = T.masque([corps_poly], flou=1.0)
    m_coeur = T.masque([coeur_poly], flou=1.4)

    corps = couche(T.grad_v(30, 158, FLAMME), m_corps, 0.94)
    coeur = couche(T.grad_v(102, 158, COEUR), m_coeur, 0.95)
    return corps, coeur


def main():
    os.makedirs(OUT, exist_ok=True)
    img = pose()
    img.save(os.path.join(OUT, 'bougie.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
    corps, coeur = flamme()
    corps.save(os.path.join(OUT, 'flamme-corps.webp'), 'WEBP', quality=92, alpha_quality=100, method=6)
    coeur.save(os.path.join(OUT, 'flamme-coeur.webp'), 'WEBP', quality=92, alpha_quality=100, method=6)
    for nom in ('bougie.webp', 'flamme-corps.webp', 'flamme-coeur.webp'):
        chemin = os.path.join(OUT, nom)
        print(f'{os.path.relpath(chemin, ROOT)} {Image.open(chemin).size} {os.path.getsize(chemin)} o')


if __name__ == '__main__':
    main()
