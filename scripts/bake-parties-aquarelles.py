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
SEPARES_V9 = {
    "citron": ("fruit", "tranche"),
    "citron-2": ("fruit", "tranche"),
    "pomme": ("pomme", "moitie"),
}

# Parties de chaque aquarelle, de l'arrière vers l'avant (le moteur les pose dans cet ordre).
# `pivot` : point fixe des rotations (défaut : centre de la boîte de la partie) ; `sombre` : creux sombre
# découvert sous la partie (ellipse cx, cy, rx, ry) ; `fond_boite` : zone où le fond découvert est diffusé
# depuis les couleurs voisines (ailleurs, la partie qui bouge découvre simplement le papier).
PARTIES: dict[str, list[dict]] = {
    "theiere": [
        {"nom": "verseuse", "boite": (0.0, 0.0, 1.0, 0.86),
         "moins": [(0.12, 0.60, 0.415, 0.96), (0.12, 0.77, 0.46, 0.96), (0.58, 0.60, 0.88, 0.96), (0.54, 0.77, 0.88, 0.96)],
         "pivot": (0.48, 0.46)},
        {"nom": "tasse-g",
         "poly": [(0.12, 0.60), (0.415, 0.60), (0.415, 0.76), (0.46, 0.81), (0.46, 0.96), (0.12, 0.96)],
         "pivot": (0.30, 0.78)},
        {"nom": "tasse-d",
         "poly": [(0.58, 0.60), (0.88, 0.60), (0.88, 0.96), (0.54, 0.96), (0.54, 0.81), (0.58, 0.76)],
         "pivot": (0.70, 0.78)},
    ],
    "tasse-2": [
        {"nom": "tasse",
         "poly": [(0.20, 0.16), (0.78, 0.16), (0.91, 0.25), (0.91, 0.53), (0.71, 0.55), (0.63, 0.65), (0.48, 0.67), (0.37, 0.60), (0.25, 0.53), (0.20, 0.45)],
         "pivot": (0.50, 0.46),
         "fond_boite": (0.27, 0.55, 0.70, 0.68),
         "sombre": (0.50, 0.625, 0.18, 0.042)},
    ],
    "tasse-coeur": [
        {"nom": "tasse", "boite": (0.0, 0.0, 0.92, 0.92),
         "moins": [(0.45, 0.66, 1.0, 1.0), (0.23, 0.48, 0.38, 0.64)],
         "pivot": (0.38, 0.52)},
        {"nom": "coeur", "boite": (0.225, 0.475, 0.385, 0.645),
         "pivot": (0.305, 0.555), "fond_boite": (0.22, 0.47, 0.39, 0.65)},
        {"nom": "biscuits",
         "poly": [(0.45, 0.78), (0.55, 0.67), (0.64, 0.68), (0.69, 0.73), (0.73, 0.61), (0.83, 0.60), (0.96, 0.66), (0.96, 0.97), (0.45, 0.97)],
         "pivot": (0.70, 0.80)},
    ],
    "gateau": [
        {"nom": "bougie", "boite": (0.695, 0.18, 0.775, 0.55), "pivot": (0.735, 0.53),
         "fond_boite": (0.69, 0.46, 0.78, 0.56)},
        {"nom": "framboise", "boite": (0.30, 0.19, 0.50, 0.32), "couleur": "rouge", "pivot": (0.40, 0.27),
         "fond_boite": (0.30, 0.26, 0.50, 0.33)},
    ],
    "cupcake": [
        {"nom": "framboise", "boite": (0.42, 0.03, 0.77, 0.28), "couleur": "rouge", "pivot": (0.59, 0.18),
         "fond_boite": (0.42, 0.16, 0.77, 0.29)},
    ],
    "cupcake-bougie": [
        {"nom": "framboise", "boite": (0.43, 0.20, 0.77, 0.42), "couleur": "rouge", "pivot": (0.60, 0.33),
         "fond_boite": (0.43, 0.31, 0.77, 0.43)},
    ],
    "carotte": [
        {"nom": "fanes", "boite": (0.0, 0.0, 1.0, 0.375), "pivot": (0.50, 0.37)},
    ],
    "cookies": [
        {"nom": "moitie-g",
         "poly": [(0.03, 0.27), (0.29, 0.27), (0.31, 0.40), (0.27, 0.52), (0.30, 0.64), (0.27, 0.75), (0.29, 0.86), (0.03, 0.86)],
         "pivot": (0.22, 0.74)},
        {"nom": "moitie-d",
         "poly": [(0.29, 0.27), (0.46, 0.33), (0.525, 0.48), (0.51, 0.64), (0.42, 0.78), (0.29, 0.86), (0.27, 0.75), (0.30, 0.64), (0.27, 0.52), (0.31, 0.40)],
         "pivot": (0.37, 0.74), "fond_boite": (0.34, 0.32, 0.53, 0.80)},
        {"nom": "pepite-1", "cercle": (0.73, 0.28, 0.045), "pivot": (0.73, 0.28), "fond_boite": (0.67, 0.22, 0.79, 0.34)},
        {"nom": "pepite-2", "cercle": (0.74, 0.55, 0.042), "pivot": (0.74, 0.55), "fond_boite": (0.68, 0.49, 0.80, 0.61)},
        {"nom": "pepite-3", "cercle": (0.68, 0.74, 0.042), "pivot": (0.68, 0.74), "fond_boite": (0.62, 0.68, 0.74, 0.80)},
    ],
    "sables-etoiles": [
        {"nom": "etoile-1",
         "poly": [(0.32, 0.26), (0.44, 0.36), (0.61, 0.36), (0.52, 0.49), (0.46, 0.67), (0.33, 0.61), (0.14, 0.66), (0.18, 0.51), (0.04, 0.41), (0.22, 0.38)],
         "moins": [(0.45, 0.48, 1.0, 0.82)],
         "pivot": (0.33, 0.46)},
        {"nom": "etoile-2",
         "poly": [(0.66, 0.40), (0.76, 0.50), (0.96, 0.53), (0.83, 0.64), (0.85, 0.80), (0.66, 0.72), (0.45, 0.75), (0.51, 0.60), (0.41, 0.49), (0.57, 0.49)],
         "pivot": (0.68, 0.60)},
    ],
    "citron": [],
    "citron-2": [],
    "pomme": [],
    "orange": [
        {"nom": "rondelle", "cercle": (0.695, 0.665, 0.265), "pivot": (0.695, 0.665)},
    ],
    "noix": [
        {"nom": "noix-1",
         "poly": [(0.24, 0.14), (0.46, 0.14), (0.48, 0.38), (0.39, 0.58), (0.40, 0.86), (0.24, 0.86)],
         "pivot": (0.35, 0.52)},
        {"nom": "noix-3",
         "poly": [(0.46, 0.03), (0.76, 0.03), (0.76, 0.72), (0.61, 0.72), (0.63, 0.52), (0.56, 0.35), (0.46, 0.35)],
         "pivot": (0.62, 0.38)},
        {"nom": "noix-2",
         "poly": [(0.45, 0.35), (0.58, 0.35), (0.64, 0.55), (0.62, 0.86), (0.51, 0.96), (0.40, 0.86), (0.38, 0.55)],
         "pivot": (0.51, 0.66)},
    ],
    "oeufs": [
        {"nom": "coquille",
         "poly": [(0.30, 0.58), (0.37, 0.51), (0.46, 0.53), (0.53, 0.60), (0.65, 0.64), (0.66, 0.82), (0.56, 0.94), (0.36, 0.94), (0.29, 0.80)],
         "pivot": (0.48, 0.78), "fond_boite": (0.29, 0.50, 0.66, 0.85)},
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
    # trous bouchés (un reflet blanc au milieu d'une partie en fait partie), sans boucher le papier transparent
    m = ndi.binary_fill_holes(m) & (rgba[..., 3] > SEUIL)
    for x0, y0, x1, y1 in spec.get("moins", []):
        m &= ~((u >= x0) & (u <= x1) & (v >= y0) & (v <= y1))
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
    # Rattraper la frange semi-transparente (2 px) autour des parties pour ne laisser aucun liseré au départ
    dist, pos = ndi.distance_transform_edt(ids == 0, return_indices=True)
    frange = (ids == 0) & (rgba[..., 3] > 0) & (dist <= 2.5)
    ids[frange] = ids[tuple(pos)][frange]
    # Le fond découvert : uniquement dans les zones où la partie recouvre un autre objet (`fond_boite` / `sombre`),
    # transparent (le papier) partout où la partie est devant le fond de page.
    trou = ndi.binary_dilation(ids > 0, iterations=3)
    pre = rgba.copy()
    pre[..., :3] *= pre[..., 3:]
    fond_plein = diffuser(pre, trou)
    u, v = grille(h, w)
    garder = np.zeros((h, w), dtype=bool)
    for i, spec in enumerate(specs, 1):
        if "fond_boite" in spec:
            x0, y0, x1, y1 = spec["fond_boite"]
            garder |= (u >= x0) & (u <= x1) & (v >= y0) & (v <= y1) & (ids == i)
        if "sombre" in spec:
            cx, cy, rx, ry = spec["sombre"]
            d = ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2
            k = np.clip((1.15 - d) / 0.3, 0, 1)[..., None] * 0.92
            creux = np.array([0.24, 0.19, 0.16, 1.0])
            fond_plein = fond_plein * (1 - k) + creux * k
            garder |= d <= 1.25
    garder = ndi.binary_dilation(garder, iterations=2) & trou
    fond = np.where(garder[..., None], fond_plein, 0.0)
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


def cuire_citron_v9(nom: str, roles: tuple[str, str] = ("fruit", "tranche")):
    """Les deux sujets entiers de l'image : aucun trait de découpe arbitraire.

    Les deux grosses composantes alpha correspondent au fruit avec sa feuille et à sa tranche/moitié.
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
    for i, (label, role) in enumerate(zip(largest, roles), 1):
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
    print(f"{nom:16s} série anglaise : {roles[0]} et {roles[1]} entiers, fond transparent")
    return {"serie": "anglaise-v9", "parties": infos}


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    planche = "--planche" in argv
    argv = [a for a in argv if a != "--planche"]
    noms = argv[0].split(",") if argv else sorted(PARTIES)
    tout = json.loads(JSON.read_text()) if JSON.exists() else {}
    vues = []
    for nom in noms:
        if nom in SEPARES_V9:
            tout[nom] = cuire_citron_v9(nom, SEPARES_V9[nom])
            continue
        if nom not in PARTIES or not (SOURCE / f"{nom}.webp").exists():
            print(f"✗ aquarelle sans parties ou inconnue : {nom}")
            continue
        rgba, ids, fond, infos = cuire(nom, PARTIES[nom])
        n1, n2 = ecrire(nom, ids, fond)
        tout[nom] = {"serie": "anglaise-v9", "parties": infos}
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
