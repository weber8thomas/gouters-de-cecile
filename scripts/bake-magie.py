#!/usr/bin/env python3
"""Carte de la magie (piste « magie ») : pour chaque page cuite, ce que la toile dorée du livre a besoin de
savoir de la mise en page, sans lire une image.

    tools/ecriture/.venv/bin/python scripts/bake-magie.py

Sortie : src/components/Magie/carte.json, par page :
  - titres : [{ type, r: [x0, y0, x1, y1], a }] boîte des mots des titres, bandeaux et chapitres (px de
    page) et pente de leur ligne de base (degrés) : le reflet doré y passe, les frises s'y accrochent ;
  - libre : le papier sans encre, en cases de CASE px (une ligne de chiffres hexadécimaux par rangée,
    bit à 1 = case occupée) : les pas du maraudeur et les ornements de coin s'y posent. Les photos,
    aquarelles et croquis sont ajoutés par l'application depuis le manifeste (ils bougent sans recuire) ;
  - plume : le chemin de la plume, N points [x, y, t] (px de page, t en millièmes du temps d'écriture),
    même horloge que la carte des temps (scripts/bake-temps-encre.py) : les paillettes suivent la plume ;
  - encre : la couleur moyenne de l'encre de la page (et `c`, celle de chaque titre), lue dans l'encre
    cuite (pages/1x/<page>) : les ornements s'écrivent de la même encre que le titre qu'ils entourent.

Hors de scripts/pages/ : ne change pas l'empreinte du moteur, ne recuit rien.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI / "pages"))

import apercu as A  # noqa: E402

RACINE = ICI.parent
SORTIE = RACINE / "src/components/Magie/carte.json"
LEVE = 9.0  # px de page : un levé de plume (comme bake-temps-encre.py)
CASE = 50  # px de page : côté d'une case de la grille du papier libre
N_PLUME = 90  # points du chemin de la plume
TYPES_TITRE = {"titre": "titre", "bandeau": "bandeau", "chapitre": "chapitre", "suivre": "titre"}


def type_titre(bloc: str, types: dict) -> str | None:
    t = types.get(bloc)
    if t in ("titre", "chapitre"):
        return t
    for prefixe, nom in TYPES_TITRE.items():
        if bloc == prefixe or bloc.startswith(prefixe + "-"):
            return nom
    return None


def couleur(encre: np.ndarray | None, r=None) -> list | None:
    """Couleur moyenne de l'encre (pondérée par son opacité), dans r = (x0, y0, x1, y1) ou toute la page."""
    if encre is None:
        return None
    a = encre if r is None else encre[max(0, r[1]):r[3], max(0, r[0]):r[2]]
    w = a[..., 3:4] / 255.0
    if w.sum() < 20:
        return None
    return [int(round(v)) for v in (a[..., :3] * w).sum((0, 1)) / w.sum()]


def titres(mise) -> list:
    types = {b.get("id"): b.get("type") for b in mise.desc.get("blocs", [])}
    groupes: dict = {}
    for w in mise.mots:
        if getattr(w, "rature", False):
            continue
        t = type_titre(w.bloc, types)
        if t:
            groupes.setdefault((w.bloc, t), []).append(w)
    sortie = []
    for (bloc, t), ws in groupes.items():
        x0 = min(w.boite[0] for w in ws)
        y0 = min(w.boite[1] for w in ws)
        x1 = max(w.boite[2] for w in ws)
        y1 = max(w.boite[3] for w in ws)
        # pente moyenne des lignes de base, pondérée par la longueur des mots
        dx = sum(w.base[2] - w.base[0] for w in ws) or 1.0
        dy = sum(w.base[3] - w.base[1] for w in ws)
        a = float(np.degrees(np.arctan2(dy, dx)))
        sortie.append(dict(type=t, bloc=bloc, r=[int(round(v)) for v in (x0, y0, x1, y1)], a=round(a, 2)))
    sortie.sort(key=lambda d: d["r"][1])
    return sortie


def libre(mise, W: int, H: int) -> list:
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    for t in mise.traces:
        p = np.asarray(t.pts, float)[:, :2]
        lw = max(2, int(round(t.diam * 1.3 + 2)))
        if len(p) == 1:
            x, y = p[0]
            d.ellipse([x - lw, y - lw, x + lw, y + lw], fill=255)
        else:
            d.line([tuple(q) for q in p], fill=255, width=lw)
    for (x0, y0, x1, y1), _nom in mise.reserves:
        d.rectangle([x0, y0, x1, y1], fill=255)
    for x0, y0, x1, y1 in mise.marques_boites:
        d.rectangle([x0, y0, x1, y1], fill=255)
    # l'encre a besoin d'air autour : un pas de maraudeur ne frôle pas un mot
    im = im.filter(ImageFilter.MaxFilter(17))
    a = np.asarray(im) > 0
    nx, ny = (W + CASE - 1) // CASE, (H + CASE - 1) // CASE
    rangs = []
    for j in range(ny):
        bits = 0
        for i in range(nx):
            if a[j * CASE:(j + 1) * CASE, i * CASE:(i + 1) * CASE].any():
                bits |= 1 << i
        rangs.append(format(bits, "x"))
    return rangs


def plume(mise) -> list:
    traces = [np.asarray(t.pts, float)[:, :2] for t in mise.traces if len(t.pts) >= 1]
    if not traces:
        return []
    # temps cumulé de chaque point, comme la carte des temps : longueur écrite + un levé par trait
    xs, ts = [], []
    debut = 0.0
    for p in traces:
        seg = np.hypot(*np.diff(p, axis=0).T) if len(p) > 1 else np.zeros(0)
        cum = np.concatenate([[0.0], np.cumsum(seg)])
        xs.append(p)
        ts.append(debut + cum)
        debut += float(seg.sum()) + LEVE
    total = debut or 1.0
    P = np.concatenate(xs)
    T = np.concatenate(ts) / total
    cibles = np.linspace(0.0, T[-1], N_PLUME)
    k = np.clip(np.searchsorted(T, cibles), 0, len(T) - 1)
    out = []
    for i, c in zip(k, cibles):
        out += [int(round(P[i, 0])), int(round(P[i, 1])), int(round(c * 1000))]
    return out


def lire_encre(pid: str) -> np.ndarray | None:
    f = RACINE / f"design-system/baked/pages/1x/{pid}.webp"
    return np.asarray(Image.open(f).convert("RGBA"), float) if f.exists() else None


def main(argv=None) -> int:
    cu, _ = A.preparer(RACINE / "verification/out/magie/_cuisine")
    W, H = int(A.C.MEP.W), int(A.C.MEP.H)
    ids = sorted(p for p, v in cu.pages.items() if v.get("type") != "feuillet")
    carte = dict(version=1, W=W, H=H, case=CASE, pages={})
    for pid in ids:
        mise = cu.mise(pid)
        encre = lire_encre(pid)
        tt = titres(mise)
        for t in tt:
            t["c"] = couleur(encre, t["r"]) or couleur(encre)
        carte["pages"][pid] = dict(titres=tt, libre=libre(mise, W, H), plume=plume(mise), encre=couleur(encre))
        tt = ", ".join(f"{t['type']}:{t['bloc']}" for t in carte["pages"][pid]["titres"])
        print(f"{pid:24s} {len(mise.traces):5d} traits  {tt}")
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(json.dumps(carte, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"→ {SORTIE.relative_to(RACINE)} ({SORTIE.stat().st_size // 1024} Ko)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
