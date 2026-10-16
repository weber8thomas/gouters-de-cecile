#!/usr/bin/env python3
"""Spécimen : chaque main écrit les phrases témoins (dans son encre), puis une ligne par outil
(plume, bille, crayon, feutre) dans la même main pour comparer les encres.

    python tools/ecriture/specimen.py [--sortie verification/out/n2/specimen.svg] [--styles mamie,ecole]

Écrit le SVG, le PNG (Chromium, `rendre_png.mjs`) et un JSON de mesures (durées, lectures).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

from ecrire import ecrire  # noqa: E402
from rendu import fond, groupe  # noqa: E402
from styles import STYLES  # noqa: E402

PHRASES = [
    "Le cake citron de Julie",
    "3 œufs, 120 g de sucre, ½ sachet de levure",
    "Fouette les œufs avec le sucre jusqu'à ce que ça blanchisse.",
    "Joyeux anniversaire ma Cécile !",
    "Mamie Rose",
]
LIGNE_ENCRES = "Fouette les œufs avec le sucre jusqu'à ce que ça blanchisse."
ENCRES_DEMO = [("plume", "plume"), ("bic", "bille"), ("crayon", "crayon"), ("feutre", "feutre")]


def _etiquette(x, y, texte, taille=20):
    return (f'<text x="{x:.0f}" y="{y:.0f}" font-family="Georgia, serif" font-size="{taille}" '
            f'fill="#8a6a4a">{texte}</text>')


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--sortie", default=str(ICI.parents[1] / "verification/out/n2/specimen.svg"))
    ap.add_argument("--styles", default=",".join(STYLES))
    ap.add_argument("--graine", type=int, default=4127)
    ap.add_argument("--largeur", type=float, default=22.0)
    ap.add_argument("--colonnes", type=int, default=2)
    ap.add_argument("--lumiere", type=float, default=0.3)
    ap.add_argument("--main-encres", default="soignee", help="main des lignes d'encres")
    ap.add_argument("--sans-encres", action="store_true")
    ap.add_argument("--sans-cache", action="store_true")
    ap.add_argument("--debug", action="store_true")
    a = ap.parse_args(argv)
    noms = [s for s in a.styles.split(",") if s]
    E = 30.0  # px par hauteur d'x
    col_w = (a.largeur + 5) * E
    n_col = a.colonnes
    W = 40 + n_col * col_w
    blocs, mesures = [], {}
    for nom in noms:
        st = STYLES[nom]
        y = 1.6 * E
        parts = []
        t_style = []
        enc = None
        for k, texte in enumerate(PHRASES, start=1):
            t0 = time.time()
            res = ecrire(texte, nom, a.graine + k, a.largeur, cache=not a.sans_cache)
            enc = res["encre"]
            t_style.append(dict(texte=texte, duree_s=round(time.time() - t0, 3), cache=res["cache"],
                                lignes=len(res["lignes"]), non_geres=res["non_geres"],
                                lectures=[m["lecture"] for l in res["lignes"] for m in l["mots"]]))
            b = res["boite"]
            parts.append(groupe(res, E, 0.4 * E, y - b[1] * E, lumiere=a.lumiere, debug=a.debug,
                                page=(-1, -2 - y / E, a.largeur + 4, 40 - y / E)))
            y += (b[3] - b[1]) * E + 0.9 * E
        parts.insert(0, _etiquette(0, 0.9 * E, f"{nom} — {st.description} · encre {enc['id']} ({enc['outil']})"))
        mesures[nom] = t_style
        blocs.append((y, "".join(parts)))
    out, y = [], 20.0
    for i in range(0, len(blocs), n_col):
        rang = blocs[i : i + n_col]
        h = max(b[0] for b in rang)
        for c, (_, g) in enumerate(rang):
            out.append(f'<g transform="translate({20 + c * col_w:.0f},{y:.0f})">{g}</g>')
        y += h + 30
    # --- une ligne par outil, même main, plus grand ------------------------------------------
    if not a.sans_encres:
        E2 = 44.0
        y += 10
        out.append(_etiquette(20, y + 20, f"Encres — main « {a.main_encres} », même texte, lumière de fin "
                                          f"d'après-midi en haut à gauche (aperçu)", 22))
        y += 40
        mesures["encres"] = []
        for k, (enc_id, outil) in enumerate(ENCRES_DEMO):
            t0 = time.time()
            res = ecrire(LIGNE_ENCRES, a.main_encres, a.graine + 40, (W - 120) / E2, encre=enc_id, outil=outil,
                         cache=not a.sans_cache)
            b = res["boite"]
            out.append(_etiquette(20, y + 18, f"{enc_id} · {outil}", 18))
            out.append(groupe(res, E2, 40 - b[0] * E2, y + 30 - b[1] * E2, lumiere=a.lumiere,
                              page=(b[0] - 1, b[1] - 3 - 4 * k, b[0] + (W - 80) / E2, b[1] + 16 - 4 * k)))
            mesures["encres"].append(dict(encre=enc_id, outil=outil, duree_s=round(time.time() - t0, 3),
                                          trempes=res["encre"].get("trempes")))
            y += (b[3] - b[1]) * E2 + 60
    H = y + 10
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}">'
           f'{fond(W, H, lumiere=a.lumiere)}{"".join(out)}</svg>')
    sortie = Path(a.sortie)
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(svg)
    sortie.with_suffix(".json").write_text(json.dumps(mesures, ensure_ascii=False, indent=1))
    png = sortie.with_suffix(".png")
    subprocess.run(["node", str(ICI / "rendre_png.mjs"), str(sortie), str(png)], check=True, cwd=ICI.parents[1])
    tot = sum(m["duree_s"] for v in mesures.values() for m in v)
    print(f"{sortie} + {png.name} ({tot:.1f} s de génération, {len(svg) // 1024} Ko)")


if __name__ == "__main__":
    main()
