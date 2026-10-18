"""Bibliothèque d'aquarelles, lot « dessins » : les créatures qui traversent les pages (papillons,
coccinelle), la guirlande de fanions et le cupcake d'anniversaire.

Créatures : planches anciennes du domaine public (Wikimedia Commons, numérisations de la Biodiversity
Heritage Library), vues de dessus, tête en haut, détourées par la chaîne du thème 1 (scripts/aquarelles.py :
charger_sur_blanc, detourer, rogner, harmoniser) après éclaircissement du papier jauni (comme le lot 5),
puis recadrées symétriquement autour du corps (le moteur bat des ailes de part et d'autre de l'axe :
src/components/Aquarelle/vivante.ts) et réduites (une créature reste petite sur la page).

Guirlande et bougie : peintes ici, à l'aquarelle simulée (lavis à bords irréguliers, pigment qui se
concentre au bord en séchant, granulation), dans la palette des confettis du moteur. La guirlande suit
exactement la ficelle que le moteur fait onduler (effets.ts, `fanions` : y aux deux bouts, creux) ; la
bougie est plantée dans la crème du cupcake du thème 1 (Pixabay, Nic0leta), sa flamme peinte vacille
(effets.ts, `flammes`).

    PY=tools/ecriture/.venv/bin/python
    $PY -I -B scripts/aquarelles_dessins.py telecharger
    $PY -I -B scripts/aquarelles_dessins.py traiter
    $PY -I -B scripts/aquarelles_dessins.py planche
    $PY -I -B scripts/aquarelles_dessins.py tout

Ce script ne lit que des images téléchargées depuis les pages ci-dessous : on le lance avec `-I`.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "scripts"))  # `-I` ne met pas le dossier du script dans sys.path
import aquarelles as t1  # noqa: E402  (chaîne de traitement du thème 1)
from aquarelles_5 import eclaircir_papier  # noqa: E402  (papier crème ramené au blanc)

V = RACINE / "verification/out/dessins-aquarelles"
ORIGINAUX = V / "originaux"
TELECHARGEMENTS = V / "telechargements"
PLANCHE = RACINE / "verification/out/dessins/planche-aquarelles.png"
SORTIE = RACINE / "design-system/aquarelles"
CATALOGUE = SORTIE / "catalogue-dessins.json"
POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
POLICE_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"

UA = "GoutersDeCecile/1.0 (carnet de recettes ; script ponctuel)"
DOMAINE_PUBLIC = "domaine public (œuvre ancienne, auteur mort depuis plus de 70 ans ; Wikimedia Commons : Public domain)"
COTE_CREATURE = 360            # une créature est petite sur la page : inutile de la garder grande

# Créatures. `region` : partie de la planche (px de l'original) où elle est seule ; `plancher` : le grain du
# papier ancien sous ce seuil devient transparent ; `petits` : taille minimale (px) d'un morceau gardé
# (les antennes, fines, sont des morceaux à part).
CREATURES = [
    {
        "nom": "papillon-paon",
        "sujet": "paon-du-jour (Aglais io), vu de dessus, planche gravée et coloriée à la main",
        "source": "https://commons.wikimedia.org/wiki/File:Histoire_naturelle_des_l%C3%A9pidopt%C3%A8res_d%27Europe_(Plate_1)_(6053240027).jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Histoire_naturelle_des_l%C3%A9pidopt%C3%A8res_d%27Europe_%28Plate_1%29_%286053240027%29.jpg/1280px-Histoire_naturelle_des_l%C3%A9pidopt%C3%A8res_d%27Europe_%28Plate_1%29_%286053240027%29.jpg",
        "auteur": "Alexis Nicolas Noël (dessin), H. Lucas, « Histoire naturelle des lépidoptères d'Europe », Paris, 1845, planche 1 (Biodiversity Heritage Library)",
        "original": "noel-1845-pl1.jpg",
        "region": (200, 700, 1060, 1200),
        "plancher": 0.045,
        "petits": 12,
    },
    {
        "nom": "papillon-vulcain",
        "sujet": "vulcain (Vanessa atalanta), vu de dessus, planche gravée et coloriée à la main",
        "source": "https://commons.wikimedia.org/wiki/File:Histoire_naturelle_des_l%C3%A9pidopt%C3%A8res_d%27Europe_(Plate_1)_(6053240027).jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Histoire_naturelle_des_l%C3%A9pidopt%C3%A8res_d%27Europe_%28Plate_1%29_%286053240027%29.jpg/1280px-Histoire_naturelle_des_l%C3%A9pidopt%C3%A8res_d%27Europe_%28Plate_1%29_%286053240027%29.jpg",
        "auteur": "Alexis Nicolas Noël (dessin), H. Lucas, « Histoire naturelle des lépidoptères d'Europe », Paris, 1845, planche 1 (Biodiversity Heritage Library)",
        "original": "noel-1845-pl1.jpg",
        "region": (200, 1205, 1060, 1700),
        "plancher": 0.045,
        "petits": 12,
    },
    {
        "nom": "papillon-bleu",
        "sujet": "thècle (Atlides halesus), vu de dessus (figure de gauche), planche coloriée à la main",
        "source": "https://commons.wikimedia.org/wiki/File:Atlides_halesus_CramerStoll.png",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Atlides_halesus_CramerStoll.png/1280px-Atlides_halesus_CramerStoll.png",
        "auteur": "Pieter Cramer et Caspar Stoll, « De uitlandsche Kapellen », Amsterdam, 1779 (Biodiversity Heritage Library)",
        "original": "cramer-atlides.png",
        "region": (0, 40, 650, 600),
        "plancher": 0.05,
    },
    {
        "nom": "coccinelle",
        "sujet": "coccinelle à sept points (Coccinella septempunctata), vue de dessus, planche chromolithographiée (figure 17, déjà détourée sur Commons)",
        "source": "https://commons.wikimedia.org/wiki/File:Coccinella_septempunctata_Jacobson.png",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Coccinella_septempunctata_Jacobson.png/330px-Coccinella_septempunctata_Jacobson.png",
        "auteur": "Georgiy Jacobson, « Жуки России и Западной Европы » (Les coléoptères de Russie et d'Europe occidentale), Saint-Pétersbourg, 1905-1915, planche 24, figure 17",
        "original": "cocc-jacobson-330.png",
        "region": None,
        "plancher": 0.04,
    },
]

# Palette des lavis : celle des confettis du moteur (vivante.ts), plus une terre cuite.
ROSE = (0.91, 0.56, 0.62)
OCRE = (0.94, 0.75, 0.38)
BLEU = (0.52, 0.67, 0.85)
SAUGE = (0.6, 0.77, 0.6)
TERRE = (0.86, 0.53, 0.43)
SEPIA = (0.45, 0.34, 0.26)

# La ficelle de la guirlande (fractions de l'image) : y aux deux bouts, creux au milieu. Les mêmes
# nombres dans effets.ts (`fanions`), pour que le moteur fasse onduler la ficelle peinte.
GUIRLANDE_Y, GUIRLANDE_CREUX = 0.07, 0.12

PEINTES = [
    {
        "nom": "guirlande",
        "sujet": "guirlande de fanions de papier sur une ficelle, aquarelle (peinte par le script)",
        "source": "scripts/aquarelles_dessins.py (peinte)",
        "auteur": "peinte par le script du carnet",
        "licence": "création du carnet",
    },
    {
        "nom": "cupcake-bougie",
        "sujet": "cupcake à la crème et à la framboise, une bougie d'anniversaire allumée plantée dedans (la bougie est peinte par le script)",
        "source": "https://pixabay.com/illustrations/cupcake-watercolor-food-sweets-4054535/ (cupcake) ; bougie peinte par scripts/aquarelles_dessins.py",
        "auteur": "Nic0leta (Pixabay) pour le cupcake ; la bougie : le script du carnet",
        "licence": t1.LICENCE + " (cupcake) ; la bougie : création du carnet",
    },
]


def est_image(chemin: Path) -> bool:
    try:
        with Image.open(chemin) as im:
            im.verify()
        return True
    except Exception:
        return False


# =============================================================================================
# Téléchargement des originaux (Commons limite fort le débit : on réessaie), un dossier vide par fichier
# =============================================================================================
def telecharger() -> None:
    ORIGINAUX.mkdir(parents=True, exist_ok=True)
    faits = set()
    for item in CREATURES:
        dest = ORIGINAUX / item["original"]
        if item["original"] in faits or (dest.exists() and est_image(dest)):
            print(f"déjà là : {dest.name}")
            continue
        travail = TELECHARGEMENTS / item["nom"]
        shutil.rmtree(travail, ignore_errors=True)
        travail.mkdir(parents=True)                       # dossier vide, à part
        tmp = travail / item["original"]
        for essai in range(12):
            r = subprocess.run(["curl", "-sS", "-L", "-m", "120", "-A", UA, "-o", str(tmp), "-w", "%{http_code}",
                                item["url"]], capture_output=True, text=True)
            if r.stdout.strip() == "200" and est_image(tmp):
                os.replace(tmp, dest)
                print(f"téléchargé : {dest.name} ({dest.stat().st_size} o)")
                break
            print(f"  {item['nom']} : réponse {r.stdout.strip() or r.stderr.strip()}, nouvel essai dans 60 s")
            time.sleep(60)
        else:
            print(f"ÉCHEC {item['nom']}")
        faits.add(item["original"])
        shutil.rmtree(travail, ignore_errors=True)


# =============================================================================================
# Créatures : région de la planche, papier éclairci, détourage, recadrage symétrique autour du corps
# =============================================================================================
def reduire_a(k: np.ndarray, a: np.ndarray, cote: int) -> tuple[np.ndarray, np.ndarray]:
    ancien = t1.COTE_MAX
    t1.COTE_MAX = cote
    try:
        return t1.reduire(k, a)
    finally:
        t1.COTE_MAX = ancien


def traiter_creature(item: dict) -> Image.Image:
    rgb = t1.charger_sur_blanc(ORIGINAUX / item["original"])
    if item.get("region"):
        x0, y0, x1, y1 = item["region"]
        rgb = rgb[y0:y1, x0:x1]
    rgb = eclaircir_papier(rgb)
    k, a = t1.detourer(rgb, item.get("plancher", t1.PLANCHER_PAPIER))
    # le plus gros morceau (le corps et les ailes) et les morceaux assez grands tout près (les antennes)
    # (fermeture : les antennes, en pointillé sur la gravure, restent d'un seul morceau)
    lab, n = ndi.label(ndi.binary_closing(a > 0.04, iterations=2))
    tailles = ndi.sum(np.ones_like(a), lab, range(1, n + 1))
    gros = int(np.argmax(tailles)) + 1
    m = lab == gros
    ys, xs = np.where(m)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max(), ys.max()
    pres = ndi.binary_dilation(m, iterations=int(0.06 * (by1 - by0)))
    touchent = set(np.unique(lab[pres]).tolist()) - {0}
    garde = np.isin(lab, [i for i in touchent if tailles[i - 1] >= item.get("petits", 25)])
    a = a * ndi.binary_dilation(garde, iterations=2)
    ys, xs = np.where(a > 0.03)
    # boîte symétrique autour du milieu des ailes (l'axe du corps)
    cx = 0.5 * (xs.min() + xs.max())
    demi = max(cx - xs.min(), xs.max() - cx) + 6
    x0, x1 = int(round(cx - demi)), int(round(cx + demi)) + 1
    y0, y1 = max(0, ys.min() - 6), min(a.shape[0], ys.max() + 7)
    pad = max(0, -x0), max(0, x1 - a.shape[1])
    k = np.pad(k, ((0, 0), pad, (0, 0)), constant_values=1.0)
    a = np.pad(a, ((0, 0), pad), constant_values=0.0)
    x0 += pad[0]
    x1 += pad[0]
    k, a = k[y0:y1, x0:x1], a[y0:y1, x0:x1]
    k, a = reduire_a(k, a, COTE_CREATURE)
    k = t1.harmoniser(k)
    rgba = np.concatenate([(k * 255).round(), (a[..., None] * 255).round()], axis=2)
    return Image.fromarray(rgba.astype(np.uint8))


# =============================================================================================
# Aquarelle simulée : lavis à bords irréguliers, bord plus sombre, granulation (densités optiques)
# =============================================================================================
def bruit(h: int, w: int, echelle: float, rng, octaves: int = 4) -> np.ndarray:
    """Bruit lisse (somme d'octaves de bruit gaussien agrandi), centré réduit."""
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(1.0, echelle / 2 ** o)
        gh, gw = int(h / s) + 3, int(w / s) + 3
        g = rng.normal(0, 1, (gh, gw)).astype(np.float32)
        up = ndi.zoom(g, (s, s), order=3)[:h, :w]
        out[:up.shape[0], :up.shape[1]] += amp * up
        amp, tot = amp * 0.5, tot + amp
    out /= tot
    return (out - out.mean()) / (out.std() + 1e-6)


def masque_poly(h: int, w: int, pts, sur: int = 4) -> np.ndarray:
    im = Image.new("L", (w * sur, h * sur), 0)
    ImageDraw.Draw(im).polygon([(x * sur, y * sur) for x, y in pts], fill=255)
    return np.asarray(im.resize((w, h), Image.BOX), np.float32) / 255.0


def lavis(m: np.ndarray, couleur, rng, densite: float = 0.62, bord: float = 0.75, ondule: float = 1.6) -> np.ndarray:
    """Densité optique (H, W, 3) d'un lavis posé dans le masque m (0 à 1) : bord irrégulier, pigment qui
    se concentre au bord en séchant, fond inégal, granulation. Sur blanc : rgb = exp(−densité)."""
    h, w = m.shape
    dedans = m > 0.5
    sdf = ndi.distance_transform_edt(~dedans) - ndi.distance_transform_edt(dedans)
    sdf = sdf + ondule * bruit(h, w, 16, rng, 2) + 0.2 * bruit(h, w, 4, rng, 1)
    cov = np.clip(0.5 - sdf / 1.1, 0.0, 1.0)
    din = ndi.distance_transform_edt(sdf < 0)
    D = densite * (0.82 + 0.16 * bruit(h, w, 38, rng))
    D = D + densite * bord * np.exp(-din / 2.4)
    D = D * (1.0 + 0.13 * bruit(h, w, 1.5, rng, 1))
    D = np.clip(D, 0.0, None) * cov
    absorbe = -np.log(np.clip(np.asarray(couleur, np.float32), 0.04, 1.0))
    return D[..., None] * absorbe[None, None, :]


def trait(h: int, w: int, pts, largeur: float, sur: int = 4) -> np.ndarray:
    """Masque (0 à 1) d'un trait le long d'une suite de points."""
    im = Image.new("L", (w * sur, h * sur), 0)
    ImageDraw.Draw(im).line([(x * sur, y * sur) for x, y in pts], fill=255, width=max(1, round(largeur * sur)),
                            joint="curve")
    return np.asarray(im.resize((w, h), Image.BOX), np.float32) / 255.0


def sur_blanc(D: np.ndarray) -> np.ndarray:
    return np.exp(-D).astype(np.float32)


# =============================================================================================
# La guirlande : neuf fanions sous une ficelle qui pend (celle que le moteur fait onduler)
# =============================================================================================
def peindre_guirlande(graine: int = 30) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(graine)
    W, H = 1800, 400
    ficelle = lambda x: H * (GUIRLANDE_Y + 4 * GUIRLANDE_CREUX * x * (1 - x))  # noqa: E731
    D = np.zeros((H, W, 3), np.float32)
    couleurs = [ROSE, OCRE, BLEU, SAUGE, TERRE, BLEU, ROSE, OCRE]
    n = len(couleurs)
    marge = 0.04
    pas_ = (1 - 2 * marge) / n
    for i, c in enumerate(couleurs):
        xa = marge + i * pas_ + 0.05 * pas_
        xb = marge + (i + 1) * pas_ - 0.05 * pas_
        A = np.array([xa * W, ficelle(xa) - 3])
        B = np.array([xb * W, ficelle(xb) - 3])
        mil = (A + B) / 2
        d = (B - A) / np.linalg.norm(B - A)
        nrm = np.array([-d[1], d[0]])                       # vers le bas
        haut = H * rng.uniform(0.6, 0.66)
        pointe = mil + nrm * haut + d * rng.normal(0, 0.03) * haut
        # un fanion de papier : côtés un peu bombés, pointe à peine arrondie
        cotes = []
        for P, Q in ((A, pointe), (pointe, B)):
            t = np.linspace(0, 1, 14)[:, None]
            bombe = np.sin(np.pi * t) * rng.uniform(-0.025, 0.02) * haut
            L = P + (Q - P) * t
            nn = np.array([-(Q - P)[1], (Q - P)[0]]) / np.linalg.norm(Q - P)
            cotes += [tuple(p) for p in (L + nn[None] * bombe)]
        m = masque_poly(H, W, [tuple(A)] + cotes + [tuple(B)])
        D += lavis(m, c, rng, densite=rng.uniform(0.85, 1.0), bord=rng.uniform(0.6, 0.9))
        # le repli de papier sur la ficelle : une bande un peu plus foncée en haut du fanion
        bande = masque_poly(H, W, [tuple(A), tuple(B), tuple(B + nrm * 15), tuple(A + nrm * 15)])
        D += lavis(bande * m, c, rng, densite=0.35, bord=0.3, ondule=0.6)
        # des pois sur un fanion sur trois, d'un lavis plus soutenu
        if i % 3 == 1:
            yy, xx = np.mgrid[0:H, 0:W]
            centre = (A + B + pointe) / 3
            for _ in range(5):
                r1, r2 = rng.uniform(0, 1, 2)
                if r1 + r2 > 1:
                    r1, r2 = 1 - r1, 1 - r2
                p = centre + 0.62 * (A + r1 * (B - A) + r2 * (pointe - A) - centre)
                r = rng.uniform(9, 12)
                disque = (((xx - p[0]) ** 2 + (yy - p[1]) ** 2) < r * r).astype(np.float32)
                D += lavis(disque * (m > 0.5), tuple(np.asarray(c) ** 1.8), rng, densite=0.55, bord=0.5, ondule=0.8)
    # la ficelle, tracée d'un geste (un peu tremblée), par-dessus les replis
    xs = np.linspace(0.0, 1.0, 120)
    pts = [(x * W, ficelle(x) + 1.2 * math.sin(x * 23 + 1) + rng.normal(0, 0.35)) for x in xs]
    f = trait(H, W, pts, 2.6)
    D += f[..., None] * (-np.log(np.asarray(SEPIA, np.float32)))[None, None] * 1.15
    rgb = sur_blanc(D)
    k, a = t1.detourer(rgb)
    # pas de recadrage : la ficelle va d'un bord à l'autre, à la hauteur que le moteur connaît
    return t1.harmoniser(k), a


# =============================================================================================
# Le cupcake d'anniversaire : une bougie torsadée peinte, plantée dans la crème, derrière la framboise
# =============================================================================================
def peindre_bougie(H: int, W: int, base, hauteur: float, largeur: float, rng) -> tuple[np.ndarray, float, float]:
    """Densité optique d'une bougie fine (rayures roses en spirale sur fond crème), sa mèche et sa
    flamme ; renvoie aussi le centre (x, y) de la flamme en pixels."""
    bx, by = base
    x0, x1 = bx - largeur / 2, bx + largeur / 2
    yt = by - hauteur
    D = np.zeros((H, W, 3), np.float32)
    corps = masque_poly(H, W, [(x0, yt), (x1, yt), (x1 + 0.6, by), (x0 - 0.6, by)])
    D += lavis(corps, (0.98, 0.93, 0.84), rng, densite=0.5, bord=0.5, ondule=0.5)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # rayures en spirale : bandes obliques, plus étroites vers les bords (le cylindre tourne)
    u = np.clip((xx - x0) / largeur, 0, 1)
    phase = (yy - yt) / (largeur * 1.15) + 0.9 * np.arcsin(2 * u - 1) / math.pi
    raie = (np.sin(2 * math.pi * phase) > 0.15).astype(np.float32) * (corps > 0.5)
    D += lavis(raie, ROSE, rng, densite=0.62, bord=0.5, ondule=0.45)
    # le modelé : l'ombre du côté droit
    D += (corps * np.clip((u - 0.55) / 0.45, 0, 1) ** 1.5)[..., None] * 0.22 * (-np.log(np.asarray((0.8, 0.72, 0.7))))
    # la mèche
    D += trait(H, W, [(bx, yt + 1), (bx + 0.6, yt - 7)], 1.6)[..., None] * 1.6
    # la flamme : une goutte, cœur jaune pâle, bord orangé, la pointe qui s'effile
    fh, fw = largeur * 3.0, largeur * 1.15
    fy0 = yt - 5                                        # bas de la flamme, juste sur la mèche
    # profil en goutte : paramétré par la hauteur s (0 en bas, 1 à la pointe)
    s = np.linspace(0, 1, 60)
    demi = 0.5 * fw * np.sin(np.pi * np.clip(s * 1.05, 0, 1)) ** 0.7 * (1 - s) ** 0.35 * 1.25
    gauche = [(bx - d + 0.8 * si * si, fy0 - si * fh) for si, d in zip(s, demi)]
    droite = [(bx + d + 0.8 * si * si, fy0 - si * fh) for si, d in zip(s, demi)]
    goutte = masque_poly(H, W, gauche + droite[::-1])
    D += lavis(goutte, (0.96, 0.58, 0.28), rng, densite=0.95, bord=0.6, ondule=0.4)
    coeur = masque_poly(H, W, [(bx + (x - bx) * 0.5, fy0 - (fy0 - y) * 0.62 - 1) for x, y in gauche + droite[::-1]])
    D = D * (1 - 0.75 * coeur[..., None]) + lavis(coeur, (1.0, 0.9, 0.55), rng, densite=0.7, bord=0.2, ondule=0.3)
    return D, bx, fy0 - fh * 0.32


def peindre_cupcake_bougie(graine: int = 31) -> tuple[np.ndarray, np.ndarray, dict]:
    rng = np.random.default_rng(graine)
    cup = np.asarray(Image.open(SORTIE / "cupcake.png").convert("RGBA"), np.float32) / 255.0
    ch, cw = cup.shape[:2]
    dessus = int(0.42 * ch)                              # de la place au-dessus pour la bougie
    H, W = ch + dessus, cw
    base = (0.7 * cw, dessus + 0.215 * ch)               # plantée dans la crème, à droite de la framboise
    D, fx, fy = peindre_bougie(H, W, base, hauteur=0.4 * ch, largeur=0.048 * cw, rng=rng)
    kb, ab = t1.detourer(sur_blanc(D))
    kb = t1.harmoniser(kb)
    # le cupcake devant : sa silhouette (pas seulement son lavis, transparent par endroits) cache le pied
    # de la bougie
    kc = np.zeros((H, W, 3), np.float32)
    ac = np.zeros((H, W), np.float32)
    kc[dessus:] = cup[..., :3]
    ac[dessus:] = cup[..., 3]
    silhouette = ndi.binary_fill_holes(ndi.binary_closing(ac > 0.12, iterations=3))
    ab = ab * (1 - ndi.gaussian_filter(silhouette.astype(np.float32), 0.8))
    a = ac + ab * (1 - ac)
    k = np.where(a[..., None] > 1e-4, (kc * ac[..., None] + kb * (ab * (1 - ac))[..., None]) / np.maximum(a, 1e-4)[..., None], 1.0)
    ys, xs = np.where(a > 0.03)
    y0 = max(0, ys.min() - 8)
    k, a = k[y0:], a[y0:]
    info = {"flamme": [round(fx / W, 4), round((fy - y0) / (H - y0), 4)], "taille": [W, H - y0]}
    return np.clip(k, 0, 1).astype(np.float32), a.astype(np.float32), info


# =============================================================================================
def ecrire(nom: str, k: np.ndarray, a: np.ndarray) -> Path:
    rgba = np.concatenate([(k * 255).round(), (a[..., None] * 255).round()], axis=2)
    im = Image.fromarray(rgba.astype(np.uint8))
    dest = SORTIE / f"{nom}.png"
    im.save(dest, optimize=True)
    print(f"{dest.name} : {im.width}x{im.height}, {dest.stat().st_size // 1024} Ko")
    return dest


def traiter() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    catalogue = json.loads(CATALOGUE.read_text(encoding="utf-8")) if CATALOGUE.exists() else {}
    for item in CREATURES:
        if not (ORIGINAUX / item["original"]).exists():
            print(f"absent, ignoré : {item['nom']} (lancer `telecharger`)")
            continue
        im = traiter_creature(item)
        dest = SORTIE / f"{item['nom']}.png"
        im.save(dest, optimize=True)
        print(f"{dest.name} : {im.width}x{im.height}, {dest.stat().st_size // 1024} Ko")
        catalogue[item["nom"]] = {"sujet": item["sujet"], "source": item["source"], "auteur": item["auteur"],
                                  "licence": DOMAINE_PUBLIC, "fichier": dest.name}
    k, a = peindre_guirlande()
    ecrire("guirlande", k, a)
    k, a, info = peindre_cupcake_bougie()
    ecrire("cupcake-bougie", k, a)
    print(f"cupcake-bougie : flamme à {info['flamme']} (fractions de l'image)")
    for item in PEINTES:
        catalogue[item["nom"]] = {k_: item[k_] for k_ in ("sujet", "source", "auteur", "licence")} | {"fichier": f"{item['nom']}.png"}
    CATALOGUE.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"catalogue : {CATALOGUE.relative_to(RACINE)} ({len(catalogue)} entrées)")


# =============================================================================================
# Planche de contrôle, posée sur du papier du carnet
# =============================================================================================
def planche() -> None:
    noms = [c["nom"] for c in CREATURES] + [p["nom"] for p in PEINTES]
    cols, cell_w, cell_h, pad, tete = 3, 520, 420, 30, 110
    rows = (len(noms) + cols - 1) // cols
    W, H = cols * cell_w + 2 * pad, tete + rows * cell_h + pad
    papier = Image.open(t1.PAPIER).convert("RGB").resize((W, H), Image.LANCZOS)
    board = np.asarray(papier, np.float32) / 255.0
    teinte = np.array([0.900, 0.857, 0.737], np.float32)
    base = Image.fromarray((board * 255).astype(np.uint8))
    for i, nom in enumerate(noms):
        cx, cy = pad + (i % cols) * cell_w, tete + (i // cols) * cell_h
        f = SORTIE / f"{nom}.png"
        if f.exists():
            img = Image.open(f).convert("RGBA")
            s = min((cell_w - 40) / img.width, (cell_h - 90) / img.height)
            im2 = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
            ox, oy = cx + (cell_w - im2.width) // 2, cy + (cell_h - 90 - im2.height) // 2
            a = np.asarray(im2, np.float32)[..., 3:4] / 255.0
            art = np.asarray(im2.convert("RGB"), np.float32) / 255.0 * teinte
            reg = board[oy:oy + im2.height, ox:ox + im2.width]
            board[oy:oy + im2.height, ox:ox + im2.width] = reg * (1 - a) + art * a
        base = Image.fromarray((board * 255).astype(np.uint8))
        ImageDraw.Draw(base).text((cx + cell_w // 2, cy + cell_h - 60), nom, fill=(60, 45, 35),
                                  font=ImageFont.truetype(POLICE, 26), anchor="mm")
        board = np.asarray(base, np.float32) / 255.0
    ImageDraw.Draw(base).text((W // 2, 50), "Les goûters de Cécile : créatures et touches de fête",
                              fill=(60, 45, 35), font=ImageFont.truetype(POLICE, 34), anchor="mm")
    PLANCHE.parent.mkdir(parents=True, exist_ok=True)
    base.save(PLANCHE, optimize=True)
    print(f"planche : {PLANCHE}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("etape", choices=["telecharger", "traiter", "planche", "tout"])
    args = parser.parse_args()
    if args.etape in ("telecharger", "tout"):
        telecharger()
    if args.etape in ("traiter", "tout"):
        traiter()
    if args.etape in ("planche", "tout"):
        planche()


if __name__ == "__main__":
    main()
