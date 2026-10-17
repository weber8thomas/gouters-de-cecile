#!/usr/bin/env python3
"""Amorces « maison » : une main d'IAM-OnDB trop ambiguë (cursive où « rs » ressemble à « n »)
est d'abord *recopiée au propre par le réseau lui-même* : on lui fait écrire une courte ligne
anglaise dans cette main, à biais élevé, et on garde la plus nette comme nouvelle amorce. Le
réseau, amorcé par une écriture plus régulière de la même main, se trompe beaucoup moins.

    # 1) planche de candidats (SVG/PNG dans verification/out/n2/amorces-<main>.*)
    python tools/ecriture/amorces_maison.py --main mamie --base 7
    # 2) choisir le numéro le plus net, l'enregistrer dans tools/ecriture/amorces/<main>.npz
    python tools/ecriture/amorces_maison.py --main mamie --base 7 --choix 9

Le fichier .npz (offsets du stylo + texte) est versionné : il est petit et rend les mains
indépendantes de la machine qui l'a produit. Puis dans styles.py : amorce="mamie".
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

import numpy as np  # noqa: E402

import ecrire as E  # noqa: E402
import moteur  # noqa: E402

TEXTES = ["the old house was quiet", "she wrote a letter home", "come and sit by the fire"]
BIAIS = (2.2, 3.0)
DOSSIER = ICI / "amorces"


def candidats(ec, style):
    main = ec.main(style)
    dem = [(t, b, moteur.graine_de("am", t, k, b)) for t in TEXTES for b in BIAIS for k in range(4)]
    tr = ec.modele.ecrire_lot(dem, amorce=main.etat, garde=8 * main.xh, fin=E.SUITE, marge_fin=E.ARRET,
                              fin_par_position=True)
    return dem, tr


def offsets_propres(t, texte):
    """Points du mot sans le début du mot fictif qui suit, remis en déplacements."""
    P = t.points
    L = len(texte)
    fins = np.where(P[:, 2] > 0.5)[0]
    debs = np.r_[0, fins[:-1] + 1]
    garde = [np.arange(a, b + 1) for a, b in zip(debs, fins) if np.median(t.car[a : b + 1]) <= L + 0.4]
    Q = P[np.concatenate(garde)].copy()
    off = np.diff(np.vstack([[0, 0, 0], Q]), axis=0)
    off[:, 2] = Q[:, 2]
    off[0, :2] = 0
    return off.astype(np.float32)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--main", required=True, help="nom de la main (styles.py)")
    ap.add_argument("--base", type=int, required=True, help="n° de l'amorce IAM d'origine (0–7)")
    ap.add_argument("--choix", type=int, default=None)
    a = ap.parse_args(argv)
    ec = E.Ecrivain.get()
    style = replace(E.STYLES[a.main], amorce=a.base)
    dem, tr = candidats(ec, style)
    if a.choix is None:
        parts, y0 = [], 40
        for i, (d, t) in enumerate(zip(dem, tr)):
            P = t.points.copy()
            P[:, :2] -= P[:, :2].min(0)
            x0, yy = 20 + (i % 2) * 820, y0 + (i // 2) * 70
            deb = 0
            for j in range(len(P)):
                if P[j, 2] > 0.5:
                    seg = P[deb : j + 1]
                    deb = j + 1
                    if len(seg) > 1:
                        pts = " ".join(f"{u * 0.16 + x0:.1f},{v * 0.16 + yy:.1f}" for u, v in seg[:, :2])
                        parts.append(f'<polyline points="{pts}" fill="none" stroke="#123" stroke-width="1.4"/>')
            parts.append(f'<text x="{x0}" y="{yy + 8}" font-size="10" fill="#c00">{i} biais {d[1]}</text>')
        H = y0 + len(dem) // 2 * 70 + 40
        sortie = ICI.parents[1] / "verification" / "out" / "n2" / f"amorces-{a.main}.svg"
        sortie.parent.mkdir(parents=True, exist_ok=True)
        sortie.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1660 {H}" width="1660" height="{H}">'
                          f'<rect width="100%" height="100%" fill="#fff"/>{"".join(parts)}</svg>')
        subprocess.run(["node", str(ICI / "rendre_png.mjs"), str(sortie), str(sortie.with_suffix(".png"))],
                       check=True, cwd=ICI.parents[1])
        print("planche :", sortie.with_suffix(".png"))
        return
    texte = dem[a.choix][0]
    off = offsets_propres(tr[a.choix], texte)
    DOSSIER.mkdir(exist_ok=True)
    np.savez(DOSSIER / f"{a.main}.npz", offsets=off, texte=np.array(texte), base=np.array(a.base),
             biais=np.array(dem[a.choix][1]))
    print("écrit", DOSSIER / f"{a.main}.npz", repr(texte), len(off), "points")


if __name__ == "__main__":
    main()
