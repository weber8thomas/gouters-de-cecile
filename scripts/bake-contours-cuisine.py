#!/usr/bin/env python3
"""Exporte les vrais contours des PNG d'aquarelles en chemins SVG normalisés (aucune image modifiée).

Silhouettes alpha d'abord (12 au maximum), puis quelques lignes intérieures longues issues des
gradients du dessin. Coordonnées normalisées 0..1, trois décimales, 200 points maximum par chemin.
Le runtime les révèle sur l'horloge existante, puis laisse venir les couleurs de l'original.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import filters, measure, morphology

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design-system/aquarelles"
SORTIE = ROOT / "src/components/Aquarelle/contours.json"
MAX_SILHOUETTES = 12
MAX_INTERIEURS = 6
MAX_POINTS = 200


def svg(points: np.ndarray, largeur: int, hauteur: int, ferme: bool) -> str:
    """Points (ligne,colonne) conservés dans leur ordre géométrique, simplifiés à environ un pixel."""
    tolerance = 1.0
    p = measure.approximate_polygon(points, tolerance=tolerance)
    while len(p) > MAX_POINTS:
        tolerance *= 1.25
        p = measure.approximate_polygon(points, tolerance=tolerance)
    if len(p) < 2:
        return ""
    p = np.clip(p / [hauteur, largeur], 0, 1)
    if ferme and np.linalg.norm(p[0] - p[-1]) < 1e-5:
        p = p[:-1]
    if len(p) < 2:
        return ""
    return " ".join(f"{'M' if i == 0 else 'L'}{x:.3f},{y:.3f}" for i, (y, x) in enumerate(p)) + (" Z" if ferme else "")


def silhouette(rgba: np.ndarray) -> list[np.ndarray]:
    alpha = ndi.gaussian_filter(rgba[..., 3].astype(float) / 255, 1.2)
    etiquettes, _ = ndi.label(alpha > .3)
    tailles = np.bincount(etiquettes.ravel())
    garde = tailles >= 40; garde[0] = False
    masque = garde[etiquettes]
    # Une marge d'un pixel ferme même un objet touchant le bord de son fichier.
    contours = [p - 1 for p in measure.find_contours(np.pad(masque, 1).astype(float), .5)]
    contours = [p for p in contours if len(p) >= 12 and np.hypot(*np.diff(p, axis=0).T).sum() >= 30]
    return sorted(contours, key=lambda p: -len(p))[:MAX_SILHOUETTES]


def interieurs(rgba: np.ndarray) -> list[np.ndarray]:
    dedans = ndi.binary_erosion(rgba[..., 3] > 100, iterations=7)
    if dedans.sum() < 100:
        return []
    rgb = rgba[..., :3].astype(float) / 255
    # La couleur hors alpha n'a pas de sens : elle ne doit créer aucun faux trait de découpe.
    peint = rgba[..., 3] > 20
    rgb = np.where(peint[..., None], rgb, rgb[peint].mean(axis=0))
    lisse = ndi.gaussian_filter(rgb, (2.5, 2.5, 0))
    gradient = np.sqrt(sum(ndi.sobel(lisse[..., c], 0) ** 2 + ndi.sobel(lisse[..., c], 1) ** 2 for c in range(3)))
    bas, haut = np.percentile(gradient[dedans], [90, 98])
    if haut < .01:
        return []
    sq = morphology.skeletonize(filters.apply_hysteresis_threshold(gradient, bas, haut) & dedans)
    voisins = np.ones((3, 3), np.uint8); voisins[1, 1] = 0
    degre = ndi.convolve(sq.astype(np.uint8), voisins, mode="constant")
    # Les jonctions séparent les tronçons ; jamais de raccourci reliant deux morceaux éloignés.
    morceaux, n = ndi.label(sq & (degre <= 2), structure=np.ones((3, 3)))
    tailles = np.bincount(morceaux.ravel(), minlength=n + 1)
    chemins = []
    for k in sorted(range(1, n + 1), key=lambda i: -tailles[i]):
        if tailles[k] < 40:
            break
        points = set(zip(*np.nonzero(morceaux == k)))
        voisins_de = lambda q: [(q[0] + dy, q[1] + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                                if (dy or dx) and (q[0] + dy, q[1] + dx) in points]
        debut = min((p for p in points if len(voisins_de(p)) == 1), default=min(points))
        ligne, vus, p = [], set(), debut
        while p not in vus:
            ligne.append(p); vus.add(p)
            choix = [q for q in voisins_de(p) if q not in vus]
            if not choix:
                break
            p = min(choix)
        if len(ligne) >= 40:
            chemins.append(np.asarray(ligne, float))
        if len(chemins) >= MAX_INTERIEURS:
            break
    return chemins


def chemins(rgba: np.ndarray) -> list[str]:
    h, w = rgba.shape[:2]
    sortie = [svg(p, w, h, True) for p in silhouette(rgba)]
    sortie += [svg(p, w, h, False) for p in interieurs(rgba)]
    return [s for s in sortie if s]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Noms source séparés par des virgules (acteurs/bol, gateau…).")
    args = parser.parse_args()
    selection = set(args.only.split(",")) if args.only else None
    resultat = json.loads(SORTIE.read_text()) if selection and SORTIE.exists() else {}
    fichiers = sorted(SOURCE.rglob("*.png"))
    for fichier in fichiers:
        nom = fichier.relative_to(SOURCE).with_suffix("").as_posix()
        if selection is not None and nom not in selection:
            continue
        rgba = np.asarray(Image.open(fichier).convert("RGBA"))
        resultat[f"aquarelles/{nom}"] = chemins(rgba)
        print(f"{nom:34s} {len(resultat[f'aquarelles/{nom}']):2d} chemins", flush=True)
    SORTIE.write_text(json.dumps(resultat, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n")
    print(f"{len(resultat)} aquarelles → {SORTIE.relative_to(ROOT)} ({SORTIE.stat().st_size // 1024} Ko)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
