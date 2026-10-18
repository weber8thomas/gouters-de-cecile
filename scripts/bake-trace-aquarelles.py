#!/usr/bin/env python3
"""Carte du trait et de la couleur des aquarelles (« le dessin se trace, puis se colore »).

    tools/ecriture/.venv/bin/python scripts/bake-trace-aquarelles.py [theiere,gateau] [--film]

Pour chaque aquarelle cuite (design-system/baked/aquarelles/<nom>.webp), écrit
design-system/baked/aquarelles/trace/<nom>.webp, même taille, sans perte. Canaux :
- R, G : temps du crayon sur 16 bits (R = octet fort, G = octet faible). 0 = premier trait tracé,
  65534 = dernier pixel de trait ; 65535 = aucun trait ici.
- B : temps de la couleur, 0 à 254 (0 = première couleur posée), pour les pixels du dessin (alpha > 0,1) ;
  255 hors du dessin.
- A : 255.

Le crayon suit l'ordre d'un dessinateur, en trois temps :
1. la silhouette : le contour extérieur de chaque objet (alpha lissé, seuil bas, trous bouchés) est
   parcouru d'un seul tenant, du point le plus proche de la plume jusqu'au retour à ce point ; les objets
   sont tracés du plus grand au plus petit ;
2. les traits intérieurs : le squelette des contours intérieurs est découpé en tronçons entre deux
   jonctions ; chaque tronçon est parcouru d'un bout à l'autre (distance géodésique), du bout le plus
   proche de la plume, les tronçons par longueur décroissante (les détails arrivent en dernier) ;
3. la couleur, à part : elle part des zones (SLIC) les plus proches du crayon, et s'étale depuis le cœur
   de chaque zone vers ses bords.

Avec --film : écrit verification/out/c3/<nom>-film.png, une bande de 8 images qui simule la révélation
(5 images de crayon, 3 images de couleur). Pas de recuit de l'application, ce script est hors de src/.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import draw, filters, graph, measure, morphology

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "design-system/baked/aquarelles"
SORTIE = SOURCE / "trace"
APERCU = RACINE / "verification/out/c3"

SIGMA = 2.5  # lissage avant le gradient (px)
SEUIL_BAS, SEUIL_HAUT = 90, 98  # centiles du gradient : hystérésis des bords
LONGUEUR_MIN = 30  # px : fragments plus courts jetés
SEUIL_SILHOUETTE = 0.3  # alpha lissé : seuil bas, pour un contour continu même sur un bord flou
SIGMA_SILHOUETTE = 1.5  # px : lissage de l'alpha avant ce seuil
AIRE_MIN = 40  # px² : objets plus petits (poussière) sans silhouette tracée
PRUNE = 5  # px : petits embranchements (bouts) jetés
EPAISSEUR = 1.8  # px : demi-épaisseur du trait tracé autour du squelette
LEVE = 4.0  # px de temps : levé de plume entre deux tronçons
N_ZONES = 24  # zones de couleur (SLIC)
RECOUVREMENT = 2.2  # fenêtre de chaque zone, en pas de zone (recouvrement)
CREME = np.array([0xF3, 0xEA, 0xD8], float)
PAPIER = np.array([0.900, 0.857, 0.737])  # teinte du papier des aquarelles cuites (bake-aquarelles.py)
GRAPHITE = np.array([0x5A, 0x54, 0x4D], np.uint8)
VOISINS = np.ones((3, 3), int)
VOISINS[1, 1] = 0


def sans_papier(rgba: np.ndarray) -> np.ndarray:
    """L'aquarelle cuite est teintée du papier (bake-aquarelles.py, PAPIER) : on retire la teinte, les traits
    se cherchent dans les couleurs d'origine."""
    rgb = np.clip(np.round(rgba[..., :3] / PAPIER), 0, 255).astype(np.uint8)
    return np.dstack([rgb, rgba[..., 3]])


def dessin(rgba: np.ndarray):
    """Masques du dessin : intérieur (alpha > 0,1) et contour net (alpha > 0,5)."""
    a = rgba[..., 3].astype(float) / 255
    return a > 0.1, ndi.gaussian_filter(a, 0.7) > 0.5


def lignes(rgba: np.ndarray, dedans: np.ndarray, noyau: np.ndarray) -> np.ndarray:
    """Squelette des traits : crêtes du gradient couleur (hystérésis) + contour du dessin, fins et sans fragments."""
    rgb = rgba[..., :3].astype(float) / 255
    # hors du dessin : couleur moyenne, pour qu'aucun faux bord n'apparaisse à la découpe
    rgb = np.where(dedans[..., None], rgb, rgb[dedans].mean(axis=0))
    lisse = ndi.gaussian_filter(rgb, (SIGMA, SIGMA, 0))
    # gradient sur les trois canaux : un bord pâle (porcelaine) reste visible en couleur
    grad = np.sqrt(sum(ndi.sobel(lisse[..., c], 0) ** 2 + ndi.sobel(lisse[..., c], 1) ** 2 for c in range(3)))
    zone = ndi.binary_erosion(dedans, iterations=3)
    bas, haut = np.percentile(grad[zone], [SEUIL_BAS, SEUIL_HAUT])
    bords = morphology.skeletonize(filters.apply_hysteresis_threshold(grad, bas, haut) & zone)
    contour = noyau & ~ndi.binary_erosion(noyau)
    sq = morphology.skeletonize(ndi.binary_dilation(bords | contour))
    etiq, _ = ndi.label(sq, structure=np.ones((3, 3)))
    tailles = np.bincount(etiq.ravel())
    garde = tailles >= LONGUEUR_MIN
    garde[0] = False
    return garde[etiq]


def silhouette(rgba: np.ndarray) -> list:
    """Contour extérieur de chaque objet : alpha lissé > SEUIL_SILHOUETTE, trous bouchés, un contour fermé par objet.

    Retourne [(aire, points)] : points = ligne fermée (n, 2) en (ligne, colonne), sous-pixel, sans ordre imposé.
    """
    a = ndi.gaussian_filter(rgba[..., 3].astype(float) / 255, SIGMA_SILHOUETTE)
    plein = ndi.binary_fill_holes(a > SEUIL_SILHOUETTE)
    etiq, _ = ndi.label(plein, structure=np.ones((3, 3)))
    tailles = np.bincount(etiq.ravel())
    tailles[0] = 0
    polys = []
    for c in np.nonzero(tailles >= AIRE_MIN)[0]:
        if c == 0:
            continue
        m = np.pad(etiq == c, 1).astype(float)  # marge : le contour reste fermé au bord de l'image
        ligne = max(measure.find_contours(m, 0.5), key=len) - 1.0
        polys.append((int(tailles[c]), ligne))
    return polys


def ligne_pixels(pts: np.ndarray):
    """Pixels d'une ligne (points flottants, dans l'ordre du crayon) : (lignes, colonnes, temps en px)."""
    p = np.round(pts).astype(int)
    cum = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(pts, axis=0).T))])
    ys, xs, ts = [], [], []
    for i in range(len(p) - 1):
        ry, rx = draw.line(p[i, 0], p[i, 1], p[i + 1, 0], p[i + 1, 1])
        ys.append(ry)
        xs.append(rx)
        ts.append(np.linspace(cum[i], cum[i + 1], len(ry), endpoint=False))
    return np.concatenate(ys), np.concatenate(xs), np.concatenate(ts)


def degre(sq: np.ndarray) -> np.ndarray:
    """Nombre de voisins (8-connexes) de chaque pixel du masque, 0 hors du masque."""
    return ndi.convolve(sq.astype(np.uint8), VOISINS, mode="constant") * sq


def troncons(sq: np.ndarray):
    """Découpe le squelette en tronçons (sans les jonctions), élague les petits embranchements.

    Retourne (squelette émondé, jonctions, étiquettes des tronçons, nombre de tronçons).
    """
    jonction = sq & (degre(sq) >= 3)
    seg = sq & ~jonction
    for _ in range(2):
        etiq, n = ndi.label(seg, structure=np.ones((3, 3)))
        taille = np.bincount(etiq.ravel(), minlength=n + 1)
        bout = seg & (degre(seg) <= 1)
        touche_bout = np.bincount(etiq[bout], minlength=n + 1) > 0
        pres_jonc = ndi.binary_dilation(jonction, np.ones((3, 3))) & seg
        touche_jonc = np.bincount(etiq[pres_jonc], minlength=n + 1) > 0
        court = (taille < PRUNE) & touche_bout & touche_jonc
        court[0] = False
        if not court.any():
            break
        seg &= ~court[etiq]
    sq = seg | (jonction & sq)
    etiq, n = ndi.label(seg, structure=np.ones((3, 3)))
    return sq, jonction, etiq, n


def temps_crayon(sq0: np.ndarray, polys: list, forme: tuple):
    """Temps (en px de trait parcouru) de chaque pixel : silhouettes d'abord, puis traits intérieurs.

    sq0 : squelette des traits intérieurs (sans la bande autour des silhouettes) ; polys : silhouettes
    (voir silhouette) ; forme : taille de l'image. Retourne (squelette final, temps) ; NaN hors du squelette.
    """
    temps = np.full(forme, np.nan)
    contour = np.zeros(forme, bool)
    pen = np.array([0.0, 0.0])  # la plume part du coin haut-gauche
    t_courant = 0.0
    # 1. silhouettes : chaque contour fermé est parcouru d'un tenant, du point le plus proche de la plume,
    #    du plus grand objet au plus petit
    for _, pts in sorted(polys, key=lambda q: -q[0]):
        d = np.hypot(pts[:-1, 0] - pen[0], pts[:-1, 1] - pen[1])
        pts = np.roll(pts[:-1], -int(np.argmin(d)), axis=0)
        pts = np.clip(np.vstack([pts, pts[:1]]), 0, np.array(forme, float) - 1)  # contour au bord de l'image
        ys, xs, ts = ligne_pixels(pts)
        temps[ys, xs] = t_courant + ts
        contour[ys, xs] = True
        t_courant += float(np.hypot(*np.diff(pts, axis=0).T).sum()) + LEVE
        pen = pts[0].copy()
    sq = sq0 & ~ndi.binary_dilation(contour, iterations=2)
    # 2. traits intérieurs : tronçons par longueur décroissante, chacun entré par le bout le plus proche de la plume
    sq_seg, jonction, etiq, n = troncons(sq)
    if n > 0:
        objets = ndi.find_objects(etiq)
        deg_seg = degre(etiq > 0)
        taille = np.bincount(etiq.ravel())
        bouts = {}  # tronçon -> liste de (ligne, colonne) de ses bouts (ou de tout le tronçon si boucle)
        for k, sl in enumerate(objets, start=1):
            m = etiq[sl] == k
            ys, xs = np.nonzero(m & (deg_seg[sl] <= 1))
            if len(ys) == 0:
                ys, xs = np.nonzero(m)
            bouts[k] = [(y + sl[0].start, x + sl[1].start) for y, x in zip(ys, xs)]
        for k in sorted(range(1, n + 1), key=lambda k: -taille[k]):
            sl = objets[k - 1]
            m = etiq[sl] == k
            y0, x0 = min(bouts[k], key=lambda p: (p[0] - pen[0]) ** 2 + (p[1] - pen[1]) ** 2)
            cost = np.where(m, 1.0, 1e9)
            mcp = graph.MCP_Geometric(cost, fully_connected=True)
            dist, _ = mcp.find_costs([(y0 - sl[0].start, x0 - sl[1].start)])
            dist = np.where(m, dist, 0.0)
            temps[sl][m] = t_courant + dist[m]
            longueur = float(dist[m].max())
            # la plume finit au point le plus loin de son départ
            yf, xf = np.unravel_index(np.argmax(np.where(m, dist, -1)), m.shape)
            pen = np.array([yf + sl[0].start, xf + sl[1].start], float)
            t_courant += longueur + LEVE
        # jonctions : temps du pixel de tronçon le plus proche
        if jonction.any():
            _, (iy, ix) = ndi.distance_transform_edt(~(etiq > 0), return_indices=True)
            temps[jonction] = temps[iy[jonction], ix[jonction]]
    return contour | (sq_seg if n > 0 else np.zeros(sq.shape, bool)), temps


def epaissir(temps: np.ndarray, sq: np.ndarray, dedans: np.ndarray) -> np.ndarray:
    """Donne le temps du squelette aux pixels à moins de EPAISSEUR px : le trait a une largeur."""
    dist, (iy, ix) = ndi.distance_transform_edt(~sq, return_indices=True)
    proche = (dist <= EPAISSEUR) & (dedans | sq)
    t = np.where(proche, temps[iy, ix], np.nan)
    return t


def couleur(rgba: np.ndarray, dedans: np.ndarray, temps_proche: np.ndarray) -> np.ndarray:
    """Temps de la couleur (en px) : zones SLIC ordonnées par le crayon, étalées depuis leur cœur."""
    from skimage.segmentation import slic

    rgb = rgba[..., :3].astype(float) / 255
    fond = rgb[dedans].mean(axis=0)
    rgb = np.where(dedans[..., None], rgb, fond)
    rgb = ndi.gaussian_filter(rgb, (1.5, 1.5, 0))
    zones = slic(rgb, n_segments=N_ZONES, compactness=12, sigma=0, mask=dedans, start_label=1,
                 channel_axis=-1)
    ids = [k for k in np.unique(zones) if k > 0]
    cles = {}
    for k in ids:
        m = zones == k
        bord = m & ~ndi.binary_erosion(m)
        bord = ndi.binary_dilation(bord, iterations=3) & dedans
        cles[k] = float(np.percentile(temps_proche[bord], 5)) if bord.any() else float(temps_proche[m].min())
    ordre = sorted(ids, key=lambda k: cles[k])
    pas = 255.0 / max(len(ordre), 1)
    fenetre = pas * RECOUVREMENT
    best = np.full(dedans.shape, np.inf)
    for r, k in enumerate(ordre):
        m = zones == k
        depart = r * pas
        dedans_z = ndi.distance_transform_edt(m)
        emax = max(float(dedans_z.max()), 1.0)
        dehors = ndi.distance_transform_edt(~m)
        # dedans : cœur (0) vers le bord (fenêtre) ; dehors : la zone déborde de dehors/emax
        t_in = depart + fenetre * (1 - dedans_z / emax)
        t_out = depart + fenetre * (1 + dehors / emax)
        t = np.where(m, t_in, np.where(dehors <= emax, t_out, np.inf))
        best = np.minimum(best, t)
    best = np.where(dedans, best, np.nan)
    return best


def cuire(nom: str) -> tuple[np.ndarray, np.ndarray]:
    """Calcule (R, G, B) du trait et de la couleur pour une aquarelle. Retourne (t16, flood)."""
    rgba = sans_papier(np.asarray(Image.open(SOURCE / f"{nom}.webp").convert("RGBA")))
    dedans, noyau = dessin(rgba)
    sq, t_sq = temps_crayon(lignes(rgba, dedans, noyau), silhouette(rgba), rgba.shape[:2])
    t_trait = epaissir(t_sq, sq, dedans)
    # temps du trait en pixels parcourus, ramené sur 0..65534 (65535 = pas de trait)
    total = float(np.nanmax(t_trait))
    trait = ~np.isnan(t_trait)
    t16 = np.full(sq.shape, 65535, np.uint16)
    t16[trait] = np.clip(np.round(t_trait[trait] / total * 65534), 0, 65534).astype(np.uint16)
    # temps du crayon partout sur la surface (sert à ordonner les zones de couleur)
    _, (iy, ix) = ndi.distance_transform_edt(~sq, return_indices=True)
    t_champ = t_sq[iy, ix] / total
    flood_brut = couleur(rgba, dedans, t_champ)
    flood = np.full(sq.shape, 255, np.uint8)
    lo, hi = float(np.nanmin(flood_brut)), float(np.nanmax(flood_brut))
    norme = (flood_brut - lo) / max(hi - lo, 1e-6)
    ok = dedans & np.isfinite(norme)
    flood[ok] = np.clip(np.round(norme[ok] * 254), 0, 254).astype(np.uint8)
    return t16, flood


def sortie(nom: str, t16: np.ndarray, flood: np.ndarray) -> Path:
    rgba = np.zeros(t16.shape + (4,), np.uint8)
    rgba[..., 0] = t16 >> 8
    rgba[..., 1] = t16 & 255
    rgba[..., 2] = flood
    rgba[..., 3] = 255
    SORTIE.mkdir(parents=True, exist_ok=True)
    out = SORTIE / f"{nom}.webp"
    Image.fromarray(rgba, "RGBA").save(out, "WEBP", lossless=True, quality=100, method=6)
    return out


def film(nom: str, rgba: np.ndarray, t16: np.ndarray, flood: np.ndarray) -> Path:
    """Bande de 8 images : 5 de crayon (graphite), 3 de couleur (les traits et les couleurs)."""
    h = 360
    dedans = rgba[..., 3] > 25
    alpha = rgba[..., 3:4].astype(float) / 255
    couleurs = rgba[..., :3] * alpha + CREME * (1 - alpha)
    images = []
    seuils_crayon = [0.2, 0.4, 0.6, 0.8, 1.0]
    seuils_couleur = [0.33, 0.66, 1.0]
    trait = t16 < 65535
    for s in seuils_crayon:
        img = np.broadcast_to(CREME, couleurs.shape).copy()
        img[trait & (t16 <= s * 65534)] = GRAPHITE
        images.append(img)
    for s in seuils_couleur:
        img = np.broadcast_to(CREME, couleurs.shape).copy()
        couleur_ok = dedans & (flood < s * 255)
        img[couleur_ok] = couleurs[couleur_ok]
        img[trait & (t16 <= 65534)] = GRAPHITE
        images.append(img)
    w = round(rgba.shape[1] * h / rgba.shape[0])
    espace = 12
    bande = Image.new("RGB", (8 * w + 7 * espace + 2 * espace, h + 2 * espace), tuple(int(c) for c in CREME))
    for i, img in enumerate(images):
        vignette = Image.fromarray(img.astype(np.uint8)).resize((w, h), Image.LANCZOS)
        bande.paste(vignette, (espace + i * (w + espace), espace))
    APERCU.mkdir(parents=True, exist_ok=True)
    out = APERCU / f"{nom}-film.png"
    bande.save(out)
    return out


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    apercu = "--film" in argv
    argv = [a for a in argv if a != "--film"]
    if argv:
        noms = argv[0].split(",")
    else:
        noms = sorted(p.stem for p in SOURCE.glob("*.webp"))
    for nom in noms:
        if not (SOURCE / f"{nom}.webp").exists():
            print(f"✗ aquarelle inconnue : {nom}")
            continue
        debut = time.time()
        t16, flood = cuire(nom)
        out = sortie(nom, t16, flood)
        dt = time.time() - debut
        print(f"{nom:16s} {dt:5.1f} s  {out.stat().st_size // 1024} Ko")
        if apercu:
            rgba = np.asarray(Image.open(SOURCE / f"{nom}.webp").convert("RGBA"))
            print(f"  aperçu : {film(nom, rgba, t16, flood)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
