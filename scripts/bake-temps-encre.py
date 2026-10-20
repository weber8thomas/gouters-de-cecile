#!/usr/bin/env python3
"""Carte des temps de l'encre (tour 3, « l'encre s'écrit toute seule ») : pour chaque page cuite, quand
chaque pixel d'encre a été écrit, dans l'ordre réel des traits de la mise en page.

    tools/ecriture/.venv/bin/python scripts/bake-temps-encre.py [julie-gauche,julie-droite]

Sortie : design-system/baked/pages/temps/<page>.webp, 850 × 1200 (1 px de page), sans perte. Le temps t
(0 à 1) est codé sur 16 bits : rouge = octet fort, vert = octet faible. L'encre qui ne vient d'aucun trait
(lavis des croquis) vaut 1 : elle apparaît en dernier. L'application (src/components/EncreVivante) révèle
l'encre de la page selon cette carte, une fois, à l'arrivée sur la page.

Le temps suit la longueur écrite : chaque trait avance la plume de sa longueur, et chaque levé de plume
coûte LEVE px. Recalculé depuis la mise en page (déterministe), sans rien recuire : ce script est hors de
scripts/pages/, il ne change pas l'empreinte du moteur.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI / "pages"))

import apercu as A  # noqa: E402  (prépare la cuisine comme l'aperçu : rien n'est écrit dans baked/)

RACINE = ICI.parent
SORTIE = RACINE / "design-system/baked/pages/temps"
LEVE = 9.0  # px de page : un levé de plume entre deux traits
MAX = 65535


def carte(mise, larg: int, haut: int) -> np.ndarray:
    traces = [t for t in mise.traces if len(t.pts) >= 1]
    longueurs = []
    for t in traces:
        p = np.asarray(t.pts, float)[:, :2]
        seg = np.hypot(*np.diff(p, axis=0).T) if len(p) > 1 else np.zeros(0)
        longueurs.append(seg)
    total = sum(float(s.sum()) + LEVE for s in longueurs) or 1.0
    im = Image.new("I", (larg, haut), MAX)
    d = ImageDraw.Draw(im)
    debut = 0.0
    debuts = []
    for s in longueurs:
        debuts.append(debut)
        debut += float(s.sum()) + LEVE
    glyphes = []
    # du dernier au premier : le trait écrit le plus tôt garde le pixel (croisements)
    for t, s, t0 in reversed(list(zip(traces, longueurs, debuts))):
        p = np.asarray(t.pts, float)
        cum = np.concatenate([[0.0], np.cumsum(s)])
        if getattr(t, "glyphe", None):
            from police_lisible import rasteriser
            x, y, alpha = rasteriser(t.glyphe, 1.)
            # Révélation continue de gauche à droite : les glyphes exacts s'écrivent dans l'ordre,
            # sans demander au réseau de redessiner leurs lettres ni laisser leur intérieur vide.
            progression = np.linspace(0., float(cum[-1]), alpha.shape[1])[None, :]
            valeurs = np.broadcast_to(((t0 + progression) / total * MAX).astype(np.int64), alpha.shape)
            glyphes.append((x, y, alpha, valeurs))
            continue
        larg_trait = max(2, int(round(t.diam * 1.3 + 2)))
        if len(p) == 1:
            v = int(t0 / total * MAX)
            x, y = p[0, :2]
            d.ellipse([x - larg_trait / 2, y - larg_trait / 2, x + larg_trait / 2, y + larg_trait / 2], fill=v)
            continue
        for k in range(len(p) - 1, 0, -1):
            v = int((t0 + cum[k - 1]) / total * MAX)
            d.line([tuple(p[k - 1, :2]), tuple(p[k, :2])], fill=v, width=larg_trait)
    a = np.asarray(im, np.int64)
    for x, y, alpha, valeurs in glyphes:
        x0, y0, x1, y1 = max(0, x), max(0, y), min(larg, x + alpha.shape[1]), min(haut, y + alpha.shape[0])
        if x1 <= x0 or y1 <= y0:
            continue
        masque = alpha[y0-y:y1-y, x0-x:x1-x] > .01
        v = valeurs[y0-y:y1-y, x0-x:x1-x]
        a[y0:y1, x0:x1] = np.where(masque, np.minimum(a[y0:y1, x0:x1], v), a[y0:y1, x0:x1])
    # un pixel de marge, au temps le plus tôt voisin (l'encre déborde du trait idéal)
    a = np.asarray(Image.fromarray(a.astype(np.int32)).filter(ImageFilter.MinFilter(3)), np.int64)
    return np.clip(a, 0, MAX).astype(np.uint16)


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    SORTIE.mkdir(parents=True, exist_ok=True)
    cu, _ = A.preparer(RACINE / "verification/out/temps/_cuisine")
    ids = argv[0].split(",") if argv else sorted(p for p, v in cu.pages.items() if v.get("type") != "feuillet")
    for pid in ids:
        if pid not in cu.pages:
            print(f"✗ page inconnue : {pid}")
            continue
        mise = cu.mise(pid)
        c = carte(mise, int(A.C.MEP.W), int(A.C.MEP.H))
        rgb = np.zeros(c.shape + (3,), np.uint8)
        rgb[..., 0] = c >> 8
        rgb[..., 1] = c & 255
        out = SORTIE / f"{pid}.webp"
        Image.fromarray(rgb, "RGB").save(out, "WEBP", lossless=True, quality=100, method=6)
        print(f"{pid:24s} {len(mise.traces):5d} traits  {out.stat().st_size // 1024} Ko")
    return 0


if __name__ == "__main__":
    sys.exit(main())
