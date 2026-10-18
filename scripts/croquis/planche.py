"""Planche spécimen des croquis (GATE utilisatrice) : verification/out/c/planche.png (≈ 1800 px).

Deux feuillets de vrai papier posés sur la table :
  1. « en situation » : la liste d'ingrédients de Lisa écrite par l'outil d'écriture (main ado,
     encre feutre) avec des carottes en puce, le glaçage avec des cupcakes, la fin « Yummy » avec
     la carotte et 😎, et la part de carrot cake dessinée en marge ;
  2. tous les croquis : chacun en grand (petit dessin de recette) et à la taille d'une icône
     (hauteur d'une ligne d'écriture) au feutre, à la bille et au crayon.
Tout est rendu comme à la cuisson des pages (scripts/pages/rendu_encre.py, importé tel quel) :
encre bue par le papier, lavis multiplié, 2 px de sortie par px de page.

    tools/ecriture/.venv/bin/python scripts/croquis/planche.py [--sortie …] [--seul-situation]
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RACINE / "scripts/pages"))
import croquis as C  # noqa: E402
import ecriture as ECR  # noqa: E402
import gestes as TR  # noqa: E402
import mise_en_page as MEP  # noqa: E402

E = 2  # px de sortie par px de page (comme la cuisson)
LARG = 900  # px de page → 1800 px
BOIS = (74, 46, 31)  # gc-wood-3
CRAYON = (141, 131, 106)  # gc crayon mesuré (#8d836a)
POLICE = RACINE / "design-system/fonts/caveat-latin-500-normal.woff2"


def police(t):
    try:
        return ImageFont.truetype(str(POLICE), int(t))
    except OSError:
        return ImageFont.load_default()


# =============================================================================================
# Écriture posée à la main (petit moteur : lignes en légère pente, mots de N2)
# =============================================================================================
class Page:
    def __init__(self, graine=7):
        self.traces = []
        self.dessins = []
        self.rng = np.random.default_rng(graine)
        self.etiquettes = []  # (x, y, texte, taille) px de page

    def mots(self, bloc, ligne_idx, x0, y0, xh, x_max, retrait=0.0, pente=None):
        """Pose une ligne de N2 à partir de (x0, y0 = ligne de base) ; renvoie (y de la dernière
        ligne de base, x de fin)."""
        mots = bloc.lignes[ligne_idx]
        th = math.radians(pente if pente is not None else self.rng.normal(-0.3, 0.35))
        x, y = x0, y0
        debut = x0
        for k, m in enumerate(mots):
            esp = (m.espace_avant if k else 0.0) * xh * 1.1
            w = m.largeur * xh
            if k and x + esp + w > x_max:
                y += 2.75 * xh
                x = debut = x0 + retrait
                esp = 0.0
            x += esp
            ang = th + math.radians(self.rng.normal(0, 0.3))
            yy = y + math.tan(th) * (x - debut) + self.rng.normal(0, 0.03) * xh
            ca, sa = math.cos(ang), math.sin(ang)
            for T in m.traits:
                P = np.asarray(T, float).copy()
                lx, ly = P[:, 0] * xh, P[:, 1] * xh
                P[:, 0] = x + lx * ca - ly * sa
                P[:, 1] = yy + lx * sa + ly * ca
                self.traces.append(MEP.Trace(P, bloc.epaisseur * xh, dict(bloc.encre)))
            x += w
        return y, x

    def souligne(self, x0, y0, x1, y1, xh, encre, ep, main, graine, double=False, dy=0.55):
        chemins = TR.souligne(x0, y0, x1, y1, np.random.default_rng(graine), xh, double=double, dy=dy)
        ech = [np.column_stack([c[:, 0] / xh, c[:, 1] / xh, c[:, 2], c[:, 3]]) for c in chemins]
        for T in ECR.encrer_traits(ech, encre["id"], encre.get("outil"), graine, main):
            P = np.asarray(T, float).copy()
            P[:, :2] *= xh
            self.traces.append(MEP.Trace(P, ep * xh, encre))


def feuille_lisa(page: Page, haut: float):
    """Liste d'ingrédients de Lisa, carottes en puce, part de carrot cake en marge."""
    main, encre, graine = "ado", "feutre", 2611
    info = ECR.main_info(main)
    xh = MEP.ROLES["corps"] * MEP.W * info["taille"]  # ≈ 18,6 px de page
    xh_t = MEP.ROLES["titre"] * MEP.W * info["taille"]
    ingr = ["250g de sucre", "180 g d'huile de coco (ou autre huile végétale)", "1 sachet de levure chimique",
            "300g de carottes (3 à 4 grosses carottes)", "250g de farine fluide",
            "2 cuillères à café d'extrait de vanille", "2 cuillères de muscade",
            "2 à 3 cuillères à café de cannelle (moins selon les goûts)", "4 œufs", "120g de noix concassées"]
    glacage = ["3 cuillères à soupe de sucre glace", "Jus de citron ou fleur d'oranger selon préférences"]
    titre = ECR.ecrire_bloc("Carrot cake", main, graine, encre=encre)
    bloc = ECR.ecrire_bloc("\n".join(ingr), main, graine + 1, encre=encre)
    bloc_g = ECR.ecrire_bloc("\n".join(glacage), main, graine + 2, encre=encre)
    option = ECR.ecrire_bloc("Option avec le glaçage plutôt healthy, sans beurre quoi...", main, graine + 3, encre=encre)
    fin = ECR.ecrire_bloc("Yummy après c'est la régalade", main, graine + 4, encre=encre)
    ml, xr = 70.0, 830.0
    gateau = (616.0, haut + 20, 205.0, 132.0)  # la part de carrot cake, en haut à droite
    # titre souligné deux fois
    y = haut + 74
    _, xf = page.mots(titre, 0, ml + 40, y, xh_t, xr, pente=-0.6)
    page.souligne(ml + 36, y + 2, xf + 4, y - 4, xh_t, dict(titre.encre), titre.epaisseur, main, 5, double=True)
    # liste : une seule variante de carotte pour toute la liste (une vraie personne garde son dessin)
    ic = 1.95 * xh
    v = "b"  # la carotte en biais, comme l'emoji de Lisa
    y += 2.4 * xh_t + 0.6 * xh
    for i in range(len(ingr)):
        page.dessins.append(C.dessiner("carotte", boite=(ml - 4 + page.rng.normal(0, 1.5), y - 1.55 * xh, ic, ic),
                                       encre=encre, main=main, graine=graine * 10 + i, variante=v))
        x_max = gateau[0] - 12 if y - 1.8 * xh < gateau[1] + gateau[3] else xr
        y, _ = page.mots(bloc, i, ml + ic + 6, y, xh, x_max, retrait=0.0)
        y += 2.6 * xh
    # part de carrot cake en marge, à côté des lignes courtes du haut
    page.dessins.append(C.dessiner("carrot-cake", boite=gateau, encre=encre, main=main, graine=4, variante="ma", angle=-4))
    # le glaçage, cupcakes en puce
    y += 0.5 * xh
    y, _ = page.mots(option, 0, ml + 10, y, xh, xr)
    y += 2.7 * xh
    vg = C.choisir_variante("cupcake", graine, ic)
    for i in range(len(glacage)):
        page.dessins.append(C.dessiner("cupcake", boite=(ml - 4, y - 1.6 * xh, ic, ic), encre=encre, main=main,
                                       graine=graine * 20 + i, variante=vg))
        y, _ = page.mots(bloc_g, i, ml + ic + 6, y, xh, xr)
        y += 2.6 * xh
    # la fin : « Yummy après c'est la régalade » soulignée, puis 🥕😎 dessinés
    y += 0.8 * xh
    _, xf = page.mots(fin, 0, ml + 30, y, xh, xr, pente=-1.0)
    page.souligne(ml + 26, y + 1, xf, y - 0.017 * (xf - ml - 26), xh, dict(fin.encre), fin.epaisseur, main, 9)
    page.dessins.append(C.dessiner("carotte", boite=(xf + 14, y - 1.7 * xh, ic, ic), encre=encre, main=main,
                                   graine=77, variante=v))
    page.dessins.append(C.dessiner("sourire-lunettes", boite=(xf + 14 + ic + 6, y - 1.75 * xh, ic * 1.05, ic * 1.05),
                                   encre=encre, main=main, graine=78))
    y += 3.2 * xh
    page.etiquettes.append((ml - 40, y, "en situation : la liste de Lisa (main « ado », feutre), carottes et "
                                        "cupcakes en puce, part de carrot cake en marge", 21))
    return y + 40


def feuille_catalogue(page: Page, haut: float, noms):
    """Chaque croquis : en grand, puis trois icônes (feutre, bille, crayon) à la hauteur d'une ligne."""
    cols = 6
    cw, chh = LARG / cols, 196.0
    encres = [("feutre", "ado"), ("bic", "soignee"), ("crayon", "soignee")]
    xh = MEP.ROLES["corps"] * MEP.W  # corps de texte (main de taille 1)
    ic = 1.9 * xh
    for k, nom in enumerate(noms):
        r, c = divmod(k, cols)
        x0, y0 = c * cw, haut + 46 + r * chh
        enc, main = encres[k % 3]
        g = 3 + k
        vg = C.choisir_variante(nom, g, 140)
        page.dessins.append(C.dessiner(nom, boite=(x0 + 18, y0 + 24, cw - 34, 112), encre=enc, main=main, graine=g,
                                       variante=vg))
        vi = C.choisir_variante(nom, g + 1, ic)
        for j, (e2, m2) in enumerate(encres):
            page.dessins.append(C.dessiner(nom, boite=(x0 + 22 + j * (ic + 12), y0 + 146, ic, ic), encre=e2, main=m2,
                                           graine=g * 7 + j, variante=vi))
        page.etiquettes.append((x0 + 12, y0 + 2, nom, 22))
    rangs = math.ceil(len(noms) / cols)
    page.etiquettes.append((14, haut + 8, "tous les croquis : en grand (petit dessin de recette) et à la taille d'une "
                                          "ligne d'écriture (feutre, bille, crayon)", 21))
    return haut + 46 + rangs * chh + 10


LISA = ["carotte", "cupcake", "carrot-cake", "sucre", "huile", "levure", "farine", "vanille", "muscade", "cannelle",
        "oeuf", "noix", "citron", "lunettes-soleil", "sourire-lunettes", "fouet", "moule", "beurre"]


def ordre(noms):
    """Ce dont la recette de Lisa a besoin d'abord, puis le reste."""
    return [n for n in LISA if n in noms] + sorted(n for n in noms if n not in LISA)


def rendre_feuille(page: Page, hauteur: int, source: str, y: float, graine: int):
    P = C.papier(LARG * E, int(hauteur * E), source=source, y=y, graine=graine)
    img = Image.fromarray(C.rendre([*page.dessins, page.traces], P, E, graine=graine))
    dr = ImageDraw.Draw(img)
    for x, yy, t, s in page.etiquettes:
        dr.text((x * E, yy * E), t, fill=CRAYON, font=police(s * E))
    return img


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--sortie", default=str(RACINE / "verification/out/c/planche.png"))
    ap.add_argument("--seul-situation", action="store_true")
    a = ap.parse_args(argv)
    p1 = Page(11)
    h1 = feuille_lisa(p1, 0) + 10
    f1 = rendre_feuille(p1, h1, "wellcome-ms4489-i51-verge-creme", 0.15, 11)
    feuilles = [f1]
    if not a.seul_situation:
        p2 = Page(12)
        h2 = feuille_catalogue(p2, 0, ordre(C.disponibles())) + 40
        f2 = rendre_feuille(p2, h2, "wellcome-ms4489-i55-rousseur", 0.3, 13)
        d2 = ImageDraw.Draw(f2)
        d2.text((14 * E, (h2 - 30) * E), "d'après Quick, Draw! (Google Creative Lab, CC BY 4.0) et croquis maison — "
                                          "design-system/croquis/LICENCE.md", fill=CRAYON, font=police(19 * E))
        feuilles.append(f2)
    gout = 14 * E
    H = sum(f.height for f in feuilles) + gout * (len(feuilles) + 1)
    W = max(f.width for f in feuilles) + 2 * gout
    out = Image.new("RGB", (W, H), BOIS)
    y = gout
    for f in feuilles:
        out.paste(f, (gout, y))
        y += f.height + gout
    Path(a.sortie).parent.mkdir(parents=True, exist_ok=True)
    out.save(a.sortie, optimize=True)
    print(a.sortie, out.size)


if __name__ == "__main__":
    main()
