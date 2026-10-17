"""Planche de graines : écrit un bloc d'une page avec plusieurs graines pour choisir celle dont
chaque mot se lit bien (un mot raté se corrige en changeant la graine du bloc).

    tools/ecriture/.venv/bin/python scripts/pages/planche_graines.py mathis-droite recette 1,2,3,4
        → verification/out/n3/graines/<page>-<bloc>.png (une rangée par graine, mots douteux notés)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

from PIL import Image, ImageDraw  # noqa: E402

import ecriture as ECR  # noqa: E402
import mise_en_page as MEP  # noqa: E402

RACINE = ICI.parents[1]


def main(argv):
    pid, bid, graines = argv[0], argv[1], [int(g) for g in argv[2].split(",")]
    desc = json.loads((RACINE / "src/content/pages" / f"{pid}.json").read_text())
    b = next(x for x in desc["blocs"] if x.get("id") == bid)
    texte = b["texte"] if "texte" in b else "\n".join(b["lignes"])
    brut, _ = MEP.analyser(texte)
    main_ = b.get("main", desc.get("main"))
    enc = b.get("encre", desc.get("encre"))
    outil = b.get("outil", desc.get("outil") if enc == desc.get("encre") else None)
    px, larg = 26, 2400
    rangs = []
    for g in graines:
        bloc = ECR.ecrire_bloc(brut, main_, g, enc, outil, essais=1)
        rangs.append((g, bloc))
    hauteur = sum(60 + 4 * px * max(1, len(bl.lignes) + sum(len(l) for l in bl.lignes) // 9) for _, bl in rangs)
    im = Image.new("L", (larg, hauteur), 255)
    d = ImageDraw.Draw(im)
    y = 30
    for g, bloc in rangs:
        d.text((10, y - 25), f"graine {g} — douteux : {bloc.douteux}", fill=0)
        x, yb = 20.0, y + 2.2 * px
        for ligne in bloc.lignes:
            for m in ligne:
                w = (m.largeur + 0.9) * px
                if x + w > larg - 20:
                    x, yb = 20.0, yb + 3.4 * px
                for T in m.traits:
                    pts = [(x + a * px, yb + c * px) for a, c in T[:, :2]]
                    d.line(pts if len(pts) > 1 else pts * 2, fill=0, width=2)
                x += w
            x, yb = 20.0, yb + 3.4 * px
        y = int(yb + 1.5 * px)
    out = RACINE / "verification/out/n3/graines" / f"{pid}-{bid}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    im.crop((0, 0, larg, y)).save(out)
    print(out)


if __name__ == "__main__":
    main(sys.argv[1:])
