#!/usr/bin/env python3
"""Parties mobiles des aquarelles (« marionnettes ») : carte des parties et fond découvert.

    tools/ecriture/.venv/bin/python -I scripts/bake-parties-aquarelles.py [theiere,gateau] [--planche]

Pour chaque aquarelle de PARTIES (aquarelle cuite design-system/baked/aquarelles/<nom>.webp), écrit :
- design-system/baked/aquarelles/parties/<nom>.webp, même taille, sans perte : R = G = B = numéro de la
  partie × 40 (0 = le corps, 1 à 6 = les parties, dans l'ordre de PARTIES), A = 255 ;
- design-system/baked/aquarelles/fond/<nom>.webp, moitié de la taille : ce que découvre une partie qui
  bouge (les couleurs voisines diffusées dans le trou, un creux sombre sous un couvercle), transparent
  ailleurs ;
- src/components/Aquarelle/parties.json : par aquarelle, ses parties dans l'ordre (nom, pivot, boîte, rayon),
  en fractions de l'image (y vers le bas).

Le moteur (src/components/Aquarelle/vivante.ts) déplace chaque partie autour de son pivot (rotation,
translation, écrasement) selon les scénarios d'effets.ts. Une partie est choisie par des sélecteurs, tous
en fractions de l'image : `boite` (x0, y0, x1, y1), `poly` (polygone), `cercle` (cx, cy, r ; r en
fraction de la largeur), `point` (le morceau d'un seul tenant qui contient ce point, dans la sélection),
`couleur` (« chaud », « rouge », « clair », « gris », « jaune »), `moins` (boîtes retirées). Un pixel
appartient à une seule partie : la première qui le prend. Déterministe.

Avec --planche : verification/out/dessins/parties.png (chaque aquarelle, ses parties teintées, son fond).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

RACINE = Path(__file__).resolve().parents[1]
SOURCE = RACINE / "design-system/baked/aquarelles"
SORTIE_PARTIES = SOURCE / "parties"
SORTIE_FOND = SOURCE / "fond"
JSON = RACINE / "src/components/Aquarelle/parties.json"
PLANCHE = RACINE / "verification/out/dessins/parties.png"
PAS_ID = 40  # R = numéro × 40 : lisible même après une conversion de couleur
SEUIL = 0.04  # alpha : en dessous, le pixel n'appartient à aucune partie (papier)
CITRONS_V9 = {"citron", "citron-2"}

# Parties de chaque aquarelle, de l'arrière vers l'avant (le moteur les pose dans cet ordre).
# `pivot` : point fixe des rotations (défaut : centre de la boîte de la partie) ; `sombre` : creux sombre
# découvert sous la partie (ellipse cx, cy, rx, ry).
PARTIES: dict[str, list[dict]] = {
    "theiere": [
        {"nom": "couvercle", "poly": [(0.33, 0.0), (0.62, 0.0), (0.62, 0.168), (0.595, 0.19), (0.355, 0.19), (0.33, 0.168)],
         "pivot": (0.475, 0.19), "sombre": (0.475, 0.19, 0.115, 0.022)},
        {"nom": "cuillere", "boite": (0.79, 0.24, 0.92, 0.405), "couleur": "gris", "pivot": (0.8, 0.42)},
    ],
    "gateau": [
        {"nom": "bougie", "boite": (0.585, 0.0, 0.71, 0.445), "couleur": "clair", "pivot": (0.645, 0.43)},
    ],
    "cupcake": [
        {"nom": "framboise", "boite": (0.28, 0.0, 0.76, 0.21), "couleur": "rouge", "pivot": (0.52, 0.19)},
    ],
    # le même cupcake, une bougie plantée derrière la framboise (scripts/aquarelles_dessins.py) : la boîte
    # s'arrête avant la bougie
    "cupcake-bougie": [
        {"nom": "framboise", "boite": (0.28, 0.25, 0.665, 0.415), "couleur": "rouge", "pivot": (0.52, 0.4)},
    ],
    "carotte": [
        {"nom": "fanes", "boite": (0.0, 0.0, 1.0, 0.395), "pivot": (0.6, 0.4)},
    ],
    "cookies": [
        {"nom": "moitie-g", "cercle": (0.455, 0.64, 0.255),
         "poly": [(0.0, 0.3), (0.47, 0.3), (0.5, 0.42), (0.46, 0.5), (0.5, 0.6), (0.455, 0.7), (0.49, 0.8), (0.47, 1.0), (0.0, 1.0)],
         "moins": [(0.0, 0.78, 0.2, 1.0)], "pivot": (0.32, 0.87)},
        {"nom": "moitie-d", "cercle": (0.455, 0.64, 0.255), "poly": [(0.47, 0.3), (1.0, 0.3), (1.0, 1.0), (0.47, 1.0), (0.49, 0.8), (0.455, 0.7), (0.5, 0.6), (0.46, 0.5), (0.5, 0.42)],
         "pivot": (0.6, 0.87)},
        {"nom": "pepite-1", "boite": (0.0, 0.8, 0.12, 0.95), "point": (0.07, 0.89)},
        {"nom": "pepite-2", "boite": (0.1, 0.76, 0.21, 0.88), "point": (0.16, 0.82)},
        {"nom": "pepite-3", "boite": (0.16, 0.83, 0.28, 0.95), "point": (0.22, 0.89)},
    ],
    "sables-etoiles": [
        {"nom": "etoile-1", "boite": (0.0, 0.0, 0.75, 0.5), "point": (0.3, 0.3), "pivot": (0.355, 0.24)},
        {"nom": "etoile-2", "boite": (0.4, 0.5, 1.0, 1.0), "point": (0.62, 0.8), "pivot": (0.7, 0.765)},
    ],
    "tasse-coeur": [
        {"nom": "biscuits", "boite": (0.69, 0.66, 1.0, 0.98), "pivot": (0.83, 0.95)},
        {"nom": "coeur", "poly": [(0.34, 0.62), (0.47, 0.58), (0.52, 0.62), (0.6, 0.58), (0.7, 0.62), (0.7, 0.75), (0.62, 0.9), (0.52, 0.97), (0.36, 0.92), (0.34, 0.8)],
         "pivot": (0.52, 0.77)},
    ],
    "citron": [
        {"nom": "citron", "boite": (0.1, 0.0, 0.95, 0.53), "point": (0.5, 0.25), "pivot": (0.5, 0.27)},
        {"nom": "moitie", "boite": (0.1, 0.53, 0.95, 1.0), "point": (0.5, 0.8), "pivot": (0.5, 0.97)},
    ],
    "citron-2": [
        {"nom": "citron", "boite": (0.0, 0.0, 0.8, 0.57), "point": (0.4, 0.25), "pivot": (0.42, 0.26)},
        {"nom": "rondelle", "boite": (0.25, 0.58, 1.0, 1.0), "point": (0.6, 0.8), "pivot": (0.6, 0.81)},
    ],
    "pomme": [
        {"nom": "pomme", "boite": (0.0, 0.0, 1.0, 0.52), "point": (0.5, 0.25), "pivot": (0.5, 0.5)},
        {"nom": "moitie", "boite": (0.0, 0.55, 1.0, 1.0), "point": (0.5, 0.8), "pivot": (0.5, 0.99)},
    ],
    "noix": [
        {"nom": "noix-1", "boite": (0.0, 0.0, 0.37, 1.0), "point": (0.18, 0.5), "pivot": (0.18, 0.95)},
        {"nom": "noix-2", "boite": (0.37, 0.0, 0.68, 1.0), "point": (0.53, 0.55), "pivot": (0.53, 0.97)},
        {"nom": "noix-3", "boite": (0.68, 0.0, 1.0, 1.0), "point": (0.85, 0.5), "pivot": (0.85, 0.92)},
    ],
}


def charger(nom: str) -> np.ndarray:
    return np.asarray(Image.open(SOURCE / f"{nom}.webp").convert("RGBA")).astype(float) / 255


def grille(h: int, w: int):
    y, x = np.mgrid[0:h, 0:w]
    return (x + 0.5) / w, (y + 0.5) / h


def masque_poly(h: int, w: int, pts) -> np.ndarray:
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).polygon([(x * w, y * h) for x, y in pts], fill=1)
    return np.asarray(im).astype(bool)


def selection(rgba: np.ndarray, spec: dict) -> np.ndarray:
    """Pixels de la partie : intersection des sélecteurs de `spec`, pixels peints seulement."""
    h, w = rgba.shape[:2]
    u, v = grille(h, w)
    m = rgba[..., 3] > SEUIL
    if "boite" in spec:
        x0, y0, x1, y1 = spec["boite"]
        m &= (u >= x0) & (u <= x1) & (v >= y0) & (v <= y1)
    if "poly" in spec:
        m &= masque_poly(h, w, spec["poly"])
    if "cercle" in spec:
        cx, cy, r = spec["cercle"]
        m &= ((u - cx) ** 2 + ((v - cy) * h / w) ** 2) <= r * r
    for x0, y0, x1, y1 in spec.get("moins", []):
        m &= ~((u >= x0) & (u <= x1) & (v >= y0) & (v <= y1))
    if "couleur" in spec:
        a = np.maximum(rgba[..., 3:], 1e-3)
        c = np.clip(rgba[..., :3] / a, 0, 1)  # couleur non prémultipliée
        r, g, b = c[..., 0], c[..., 1], c[..., 2]
        lum = c @ np.array([0.299, 0.587, 0.114])
        sat = c.max(-1) - c.min(-1)
        k = spec["couleur"]
        if k == "rouge":
            m &= (r > g + 0.12) & (r > b + 0.05)
        elif k == "chaud":
            m &= (r > b + 0.15)
        elif k == "clair":
            m &= lum > 0.42
        elif k == "gris":
            m &= (sat < 0.16) | (rgba[..., 3] < 0.35)
        elif k == "jaune":
            m &= (r > b + 0.15) & (g > b + 0.1)
        # quelques pixels isolés de la bonne couleur ne font pas une partie : on garde les gros morceaux
        m = ndi.binary_opening(m, iterations=1)
    if "point" in spec:
        px, py = spec["point"]
        etiq, _ = ndi.label(ndi.binary_closing(m, iterations=2) & (rgba[..., 3] > SEUIL), structure=np.ones((3, 3)))
        i, j = min(h - 1, int(py * h)), min(w - 1, int(px * w))
        if etiq[i, j] == 0:  # point sur un blanc : le morceau peint le plus proche
            _, (ii, jj) = ndi.distance_transform_edt(etiq == 0, return_indices=True)
            i, j = ii[i, j], jj[i, j]
        m &= etiq == etiq[i, j]
    # trous bouchés (un reflet blanc au milieu d'une partie en fait partie), bord doux compris
    m = ndi.binary_fill_holes(m)
    return m


def diffuser(rgba: np.ndarray, trou: np.ndarray) -> np.ndarray:
    """Remplit `trou` par les couleurs voisines (pyramide tirer-pousser, alpha prémultiplié)."""
    connu = (~trou).astype(float)
    niveaux = [(rgba * connu[..., None], connu)]
    while min(niveaux[-1][1].shape) > 2:
        c, k = niveaux[-1]
        h2, w2 = (c.shape[0] + 1) // 2, (c.shape[1] + 1) // 2
        cp = np.zeros((h2 * 2, w2 * 2, 4))
        kp = np.zeros((h2 * 2, w2 * 2))
        cp[: c.shape[0], : c.shape[1]] = c
        kp[: k.shape[0], : k.shape[1]] = k
        c2 = cp.reshape(h2, 2, w2, 2, 4).sum((1, 3))
        k2 = kp.reshape(h2, 2, w2, 2).sum((1, 3))
        niveaux.append((c2, k2))
    # descente : chaque niveau complète ses trous par le niveau plus grossier (normalisé)
    c, k = niveaux[-1]
    plein = c / np.maximum(k, 1e-6)[..., None]
    for c, k in reversed(niveaux[:-1]):
        haut = np.repeat(np.repeat(plein, 2, 0), 2, 1)[: c.shape[0], : c.shape[1]]
        haut = ndi.uniform_filter(haut, (3, 3, 1))
        poids = np.minimum(k, 1.0)[..., None]
        moy = c / np.maximum(k, 1e-6)[..., None]
        plein = moy * poids + haut * (1 - poids)
    return plein


def cuire(nom: str, specs: list[dict]):
    rgba = charger(nom)
    h, w = rgba.shape[:2]
    ids = np.zeros((h, w), np.uint8)
    infos = []
    for i, spec in enumerate(specs, 1):
        m = selection(rgba, spec) & (ids == 0)
        if m.sum() < 30:
            raise SystemExit(f"{nom} : partie vide « {spec['nom']} »")
        ids[m] = i
        ys, xs = np.nonzero(m)
        boite = [xs.min() / w, ys.min() / h, (xs.max() + 1) / w, (ys.max() + 1) / h]
        pivot = spec.get("pivot") or ((boite[0] + boite[2]) / 2, (boite[1] + boite[3]) / 2)
        # rayon (pour rouler) : demi-hauteur de la partie, en fraction de la hauteur de l'image
        rayon = (boite[3] - boite[1]) / 2
        infos.append({"nom": spec["nom"], "pivot": [round(pivot[0], 4), round(pivot[1], 4)],
                      "boite": [round(b, 4) for b in boite], "rayon": round(rayon, 4)})
    # le fond : sous les parties (un peu élargies, leur bord doux compris), les couleurs voisines
    trou = ndi.binary_dilation(ids > 0, iterations=3)
    pre = rgba.copy()
    pre[..., :3] *= pre[..., 3:]
    fond = diffuser(pre, trou)
    u, v = grille(h, w)
    for i, spec in enumerate(specs, 1):
        if "sombre" in spec:
            cx, cy, rx, ry = spec["sombre"]
            d = ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2
            k = np.clip((1.15 - d) / 0.3, 0, 1)[..., None] * 0.92
            creux = np.array([0.24, 0.19, 0.16, 1.0])
            fond = fond * (1 - k) + creux * k
    fond[~trou] = 0
    return rgba, ids, fond, infos


def ecrire(nom: str, ids: np.ndarray, fond: np.ndarray) -> tuple[int, int]:
    SORTIE_PARTIES.mkdir(parents=True, exist_ok=True)
    SORTIE_FOND.mkdir(parents=True, exist_ok=True)
    r = ids * PAS_ID
    carte = np.dstack([r, r, r, np.full_like(r, 255)])
    f1 = SORTIE_PARTIES / f"{nom}.webp"
    Image.fromarray(carte, "RGBA").save(f1, "WEBP", lossless=True, quality=100, method=6)
    # fond : non prémultiplié pour l'écriture (le moteur le relit prémultiplié), moitié de la taille
    a = fond[..., 3:]
    c = np.where(a > 1e-3, fond[..., :3] / np.maximum(a, 1e-3), 0)
    im = Image.fromarray(np.clip(np.dstack([c, a]) * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA")
    im = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS)
    f2 = SORTIE_FOND / f"{nom}.webp"
    im.save(f2, "WEBP", quality=80, method=6, exact=True)
    return f1.stat().st_size, f2.stat().st_size


TEINTES = [(0.95, 0.25, 0.3), (0.2, 0.55, 0.95), (0.2, 0.75, 0.3), (0.95, 0.65, 0.1), (0.6, 0.3, 0.85), (0.1, 0.8, 0.8)]


def vignette(rgba: np.ndarray, ids: np.ndarray, fond: np.ndarray, infos: list, cote: int = 260) -> Image.Image:
    h, w = ids.shape
    blanc = np.ones((h, w, 3))
    vue = rgba[..., :3] * rgba[..., 3:] + blanc * (1 - rgba[..., 3:])
    for i in range(1, ids.max() + 1):
        m = ids == i
        vue[m] = vue[m] * 0.45 + np.array(TEINTES[(i - 1) % len(TEINTES)]) * 0.55
    vf = fond[..., :3] + blanc * (1 - fond[..., 3:])
    paire = np.concatenate([vue, np.ones((h, max(4, w // 30), 3)), vf], 1)
    im = Image.fromarray((np.clip(paire, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    for p in infos:
        x, y = p["pivot"][0] * w, p["pivot"][1] * h
        d.ellipse((x - 5, y - 5, x + 5, y + 5), outline=(0, 0, 0), width=2)
    im.thumbnail((cote * 2, cote), Image.LANCZOS)
    return im


def cuire_citron_v9(nom):
    """Les deux sujets ENTiers de la nouvelle image : aucun trait de découpe arbitraire.

    Les deux grosses composantes alpha correspondent au fruit avec sa feuille et à sa tranche.
    Affecter ensuite chaque frange au sujet le plus proche évite de rogner les contours semi-transparents.
    Le fond découvert est vide puisque les deux peintures sont séparées dans l'original.
    """
    image = Image.open(SOURCE / f"{nom}.webp").convert("RGBA")
    alpha = np.asarray(image)[..., 3]
    labels, _ = ndi.label(alpha > 8, structure=np.ones((3, 3)))
    areas = np.bincount(labels.ravel()); areas[0] = 0
    largest = np.argsort(areas)[-2:]
    assert min(areas[largest]) > alpha.size * .08, f"Deux sujets attendus : {nom}"
    largest = sorted(largest, key=lambda k: np.nonzero(labels == k)[0].mean())
    primary = np.zeros(alpha.shape, np.uint8)
    infos = []
    for i, (label, role) in enumerate(zip(largest, ["fruit", "tranche"]), 1):
        primary[labels == label] = i
        yy, xx = np.nonzero(labels == label)
        h, w = alpha.shape
        box = [xx.min() / w, yy.min() / h, (xx.max() + 1) / w, (yy.max() + 1) / h]
        infos.append({"nom": role, "pivot": [round((box[0] + box[2]) / 2, 5), round((box[1] + box[3]) / 2, 5)],
                      "boite": [round(float(v), 5) for v in box], "rayon": round(float((box[3] - box[1]) / 2), 5)})
    _, positions = ndi.distance_transform_edt(primary == 0, return_indices=True)
    ids = primary[tuple(positions)]
    assert np.all(ids[alpha > 0] > 0), f"Frange perdue : {nom}"
    mask = np.zeros((*alpha.shape, 4), np.uint8)
    mask[..., 0] = ids * PAS_ID; mask[..., 3] = 255
    SORTIE_PARTIES.mkdir(exist_ok=True); SORTIE_FOND.mkdir(exist_ok=True)
    Image.fromarray(mask, "RGBA").save(SORTIE_PARTIES / f"{nom}.webp", "WEBP", lossless=True, exact=True)
    Image.new("RGBA", image.size).save(SORTIE_FOND / f"{nom}.webp", "WEBP", lossless=True, exact=True)
    print(f"{nom:16s} série anglaise : fruit et tranche entiers, fond transparent")
    return {"serie": "anglaise-v9", "parties": infos}


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    planche = "--planche" in argv
    argv = [a for a in argv if a != "--planche"]
    noms = argv[0].split(",") if argv else sorted(PARTIES)
    tout = json.loads(JSON.read_text()) if JSON.exists() else {}
    # Ces coordonnées appartiennent aux anciennes images. La série anglaise est animée entière :
    # ne jamais réappliquer ces sélections sur ses nouveaux fruits, gâteaux ou tasses.
    catalogue_v9 = RACINE / "design-system/aquarelles/catalogue-v9.json"
    indivisibles = set(json.loads(catalogue_v9.read_text())) if catalogue_v9.exists() else set()
    for nom in indivisibles:
        if nom in CITRONS_V9:
            continue
        tout.pop(nom, None)
        for dossier in (SORTIE_PARTIES, SORTIE_FOND):
            (dossier / f"{nom}.webp").unlink(missing_ok=True)
    vues = []
    for nom in noms:
        if nom in indivisibles:
            if nom in CITRONS_V9:
                tout[nom] = cuire_citron_v9(nom)
                continue
            print(f"{nom:16s} série anglaise : image entière, aucun découpage")
            continue
        if nom not in PARTIES or not (SOURCE / f"{nom}.webp").exists():
            print(f"✗ aquarelle sans parties ou inconnue : {nom}")
            continue
        rgba, ids, fond, infos = cuire(nom, PARTIES[nom])
        n1, n2 = ecrire(nom, ids, fond)
        tout[nom] = {"parties": infos}
        print(f"{nom:16s} {len(infos)} parties  carte {n1 // 1024} Ko  fond {n2 // 1024} Ko")
        if planche:
            vues.append(vignette(rgba, ids, fond, infos))
    # les aquarelles qui n'ont plus de parties sortent du fichier
    tout = {k: tout[k] for k in sorted(tout) if k in PARTIES}
    JSON.write_text(json.dumps(tout, ensure_ascii=False, indent=1) + "\n")
    if vues:
        larg = max(v.width for v in vues)
        rangs = [vues[k : k + 2] for k in range(0, len(vues), 2)]
        pl = Image.new("RGB", (larg * 2 + 30, sum(max(v.height for v in r) + 10 for r in rangs) + 10), "white")
        y = 10
        for k in range(0, len(vues), 2):
            pl.paste(vues[k], (10, y))
            if k + 1 < len(vues):
                pl.paste(vues[k + 1], (larg + 20, y))
            y += max(v.height for v in vues[k : k + 2]) + 10
        PLANCHE.parent.mkdir(parents=True, exist_ok=True)
        pl.save(PLANCHE)
        print(f"planche : {PLANCHE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
