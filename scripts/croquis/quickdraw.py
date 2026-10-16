"""Quick, Draw! (Google Creative Lab, CC BY 4.0) : téléchargement partiel, filtre, planches
contact et extraction des dessins retenus.

Données : https://github.com/googlecreativelab/quickdraw-dataset — fichiers « raw » (coordonnées
d'écran et temps en ms de chaque point, `drawing = [[xs, ys, ts], …]`). On ne lit que le début de
chaque fichier (requête `Range`, ~6 Mo ≈ 600 à 1500 dessins) et l'on ne versionne QUE les dessins
retenus à l'œil, dans design-system/croquis/<nom>/<variante>.json.

    PY=tools/ecriture/.venv/bin/python
    $PY -I scripts/croquis/quickdraw.py telecharger [--mo 6] [carrot "birthday cake" …]
    $PY -I scripts/croquis/quickdraw.py planche carrot [--n 48] [--graine 0]
    $PY -I scripts/croquis/quickdraw.py retenir carrot 12 carotte a [--lavis '…json…']

Ce script est autonome (numpy, PIL) : il lit des données téléchargées, on le lance avec `-I`.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parents[2]
CACHE = RACINE / "verification/out/c/quickdraw"
CROQUIS = RACINE / "design-system/croquis"
URL = "https://storage.googleapis.com/quickdraw_dataset/full/raw/{}.ndjson"
CATEGORIES = [
    "carrot", "birthday cake", "cake", "cookie", "cup", "coffee cup", "mug", "teapot", "apple",
    "banana", "strawberry", "pear", "pineapple", "grapes", "ice cream", "donut", "bread", "spoon",
    "fork", "frying pan", "oven", "smiley face", "eyeglasses", "candle", "lollipop", "blueberry",
    "watermelon", "peanut", "wine bottle", "knife", "leaf", "flower", "popsicle",
]
ATTRIBUTION = ("Quick, Draw! — Google Creative Lab, The Quick, Draw! Dataset, "
               "https://github.com/googlecreativelab/quickdraw-dataset, CC BY 4.0 "
               "(https://creativecommons.org/licenses/by/4.0/)")


# =============================================================================================
# Téléchargement partiel
# =============================================================================================
def telecharger(cats, mo: float):
    dossier = CACHE / "raw"
    dossier.mkdir(parents=True, exist_ok=True)
    for c in cats:
        f = dossier / f"{c.replace(' ', '_')}.ndjson"
        if f.exists() and f.stat().st_size > 0.5e6:
            print(f"déjà là : {c}")
            continue
        brut = dossier / (f.name + ".part")
        fin = int(mo * 1e6) - 1
        r = subprocess.run(["curl", "-sS", "--fail", "-r", f"0-{fin}", "-o", str(brut),
                            URL.format(c.replace(" ", "%20"))], capture_output=True, text=True)
        if r.returncode:
            print(f"ÉCHEC {c} : {r.stderr.strip()}")
            continue
        data = brut.read_bytes()
        data = data[: data.rfind(b"\n") + 1]  # dernière ligne tronquée
        f.write_bytes(data)
        brut.unlink()
        print(f"{c} : {data.count(b'\n')} dessins, {len(data) / 1e6:.1f} Mo")


# =============================================================================================
# Lecture, normalisation, filtre
# =============================================================================================
def lire(cat: str):
    f = CACHE / "raw" / f"{cat.replace(' ', '_')}.ndjson"
    for ligne in f.read_text().splitlines():
        try:
            d = json.loads(ligne)
        except json.JSONDecodeError:
            continue
        if not isinstance(d, dict) or "drawing" not in d:
            continue
        yield d


def _rdp(P: np.ndarray, eps: float) -> np.ndarray:
    """Ramer–Douglas–Peucker sur les colonnes x, y (les autres suivent)."""
    if len(P) < 3:
        return P
    a, b = P[0, :2], P[-1, :2]
    ab = b - a
    n = np.hypot(*ab)
    if n < 1e-9:
        d = np.hypot(*(P[:, :2] - a).T)
    else:
        d = np.abs(ab[0] * (P[:, 1] - a[1]) - ab[1] * (P[:, 0] - a[0])) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        g = _rdp(P[: i + 1], eps)
        h = _rdp(P[i:], eps)
        return np.vstack([g[:-1], h])
    return np.vstack([P[0], P[-1]])


def normaliser(d: dict, eps_rel: float = 0.006):
    """→ traits [(n, 3) x, y, t] avec le plus grand côté = 1, origine en haut à gauche ; t en s
    depuis le premier point. Simplification RDP légère (0,6 % du plus grand côté)."""
    traits = []
    for s in d["drawing"]:
        xs, ys = s[0], s[1]
        ts = s[2] if len(s) > 2 else list(range(len(xs)))
        if len(xs) == 0:
            continue
        traits.append(np.column_stack([xs, ys, ts]).astype(float))
    A = np.vstack(traits)
    x0, y0 = A[:, 0].min(), A[:, 1].min()
    cote = max(np.ptp(A[:, 0]), np.ptp(A[:, 1]), 1.0)
    t0 = A[:, 2].min()
    out = []
    for T in traits:
        T = T.copy()
        T[:, 0] = (T[:, 0] - x0) / cote
        T[:, 1] = (T[:, 1] - y0) / cote
        T[:, 2] = (T[:, 2] - t0) / 1000.0
        # points dupliqués
        garde = np.r_[True, np.hypot(*np.diff(T[:, :2], axis=0).T) > 1e-6]
        T = T[garde]
        out.append(_rdp(T, eps_rel) if len(T) > 2 else T)
    return out


def _longueur(T):
    return float(np.hypot(*np.diff(T[:, :2], axis=0).T).sum()) if len(T) > 1 else 0.0


def qualite(d: dict, traits) -> tuple[bool, float, str]:
    """Filtre et note (plus haut = plus prometteur) d'un dessin normalisé."""
    if not d.get("recognized"):
        return False, 0, "non reconnu"
    n = len(traits)
    if not 2 <= n <= 10:
        return False, 0, f"{n} traits"
    A = np.vstack(traits)
    w, h = np.ptp(A[:, 0]), np.ptp(A[:, 1])
    asp = w / max(h, 1e-6)
    if not 0.3 <= asp <= 3.0:
        return False, 0, "proportions"
    L = [_longueur(T) for T in traits]
    tot = sum(L)
    if tot < 1.2 or tot > 14:
        return False, 0, "longueur"
    # traits parasites : minuscule point isolé loin du reste
    for T, l in zip(traits, L):
        if l < 0.015 and len(traits) > 2:
            c = T[:, :2].mean(0)
            autres = np.vstack([U[:, :2] for U in traits if U is not T])
            if np.min(np.hypot(*(autres - c).T)) > 0.12:
                return False, 0, "parasite"
    # brut d'écran : nombre de points par unité de longueur avant simplification (tracé souris en
    # escalier = beaucoup de petits segments axiaux)
    brut = sum(len(s[0]) for s in d["drawing"])
    dur = float(A[:, 2].max())
    if dur > 20:
        return False, 0, "trop long"
    # zigzags : changements de direction brusques
    zz = 0
    for T in traits:
        if len(T) > 3:
            v = np.diff(T[:, :2], axis=0)
            v /= np.maximum(np.hypot(*v.T)[:, None], 1e-9)
            cosang = np.sum(v[1:] * v[:-1], axis=1)
            zz += int(np.sum(cosang < -0.6))
    note = 1.0
    note -= 0.08 * abs(n - 4)
    note -= 0.12 * zz
    note -= 0.25 * abs(math.log(asp))
    note += 0.1 * min(brut / max(tot, 1e-6) / 60, 1)  # tracé dense = tactile, plus souple
    return True, note, ""


def candidats(cat: str, n: int, graine: int):
    vus = []
    for d in lire(cat):
        tr = normaliser(d)
        if not tr:
            continue
        ok, note, _ = qualite(d, tr)
        if ok:
            vus.append((note, d, tr))
    vus.sort(key=lambda x: -x[0])
    # on garde les 3 n meilleurs puis on en tire n (variété)
    rng = np.random.default_rng(graine)
    tete = vus[: 3 * n]
    if len(tete) > n:
        idx = np.sort(rng.choice(len(tete), n, replace=False))
        tete = [tete[i] for i in idx]
    return tete, len(vus)


# =============================================================================================
# Planche contact
# =============================================================================================
def dessiner_vignette(traits, taille=200, marge=16, ep=3):
    im = Image.new("RGB", (taille, taille), (238, 225, 191))
    dr = ImageDraw.Draw(im)
    A = np.vstack(traits)
    w, h = np.ptp(A[:, 0]), np.ptp(A[:, 1])
    s = (taille - 2 * marge) / max(w, h, 1e-6)
    ox = marge + (taille - 2 * marge - w * s) / 2 - A[:, 0].min() * s
    oy = marge + (taille - 2 * marge - h * s) / 2 - A[:, 1].min() * s
    for k, T in enumerate(traits):
        pts = [(ox + x * s, oy + y * s) for x, y in T[:, :2]]
        col = (60, 50, 80) if k % 2 == 0 else (140, 60, 50)
        if len(pts) > 1:
            dr.line(pts, fill=col, width=ep, joint="curve")
        else:
            dr.ellipse([pts[0][0] - 2, pts[0][1] - 2, pts[0][0] + 2, pts[0][1] + 2], fill=col)
    return im


def planche(cat: str, n: int, graine: int, colonnes=8, taille=200):
    tete, total = candidats(cat, n, graine)
    lignes = math.ceil(len(tete) / colonnes)
    im = Image.new("RGB", (colonnes * taille, lignes * (taille + 22) + 30), (250, 246, 236))
    dr = ImageDraw.Draw(im)
    try:
        fnt = ImageFont.truetype("DejaVuSans.ttf", 15)
    except OSError:
        fnt = ImageFont.load_default()
    dr.text((8, 6), f"{cat} — {len(tete)} candidats sur {total} retenus par le filtre", fill=(0, 0, 0), font=fnt)
    liste = []
    for i, (note, d, tr) in enumerate(tete):
        x = (i % colonnes) * taille
        y = 30 + (i // colonnes) * (taille + 22)
        im.paste(dessiner_vignette(tr, taille), (x, y))
        dr.text((x + 6, y + taille + 2), f"{i}  {d.get('countrycode', '?')}  {len(tr)}t", fill=(80, 20, 20), font=fnt)
        liste.append({"i": i, "key_id": d["key_id"], "pays": d.get("countrycode"), "note": round(note, 3)})
    sortie = CACHE / "planches"
    sortie.mkdir(parents=True, exist_ok=True)
    f = sortie / f"{cat.replace(' ', '_')}.png"
    im.save(f)
    (sortie / f"{cat.replace(' ', '_')}.json").write_text(json.dumps(liste, indent=0))
    print(f"{f} ({len(tete)} / {total})")


# =============================================================================================
# Extraction d'un dessin retenu
# =============================================================================================
def retenir(cat: str, index: int, nom: str, variante: str, lavis: list | None, note: str = "", pour: str = "tous"):
    liste = json.loads((CACHE / "planches" / f"{cat.replace(' ', '_')}.json").read_text())
    retenir_cle(cat, liste[index]["key_id"], nom, variante, lavis, note, pour, index)


def selection():
    """Applique scripts/croquis/selection.json (choix faits à l'œil sur les planches contact)."""
    sel = json.loads((Path(__file__).resolve().parent / "selection.json").read_text())
    for e in sel["retenus"]:
        retenir_cle(e["categorie"], e["key_id"], e["nom"], e["variante"], e.get("lavis"), e.get("note", ""),
                    e.get("pour", "tous"), e.get("planche"))


def retenir_cle(cat: str, key: str, nom: str, variante: str, lavis: list | None, note: str = "", pour: str = "tous",
                index=None):
    d = next(x for x in lire(cat) if x["key_id"] == key)
    tr = normaliser(d)
    A = np.vstack(tr)
    out = {
        "nom": nom,
        "variante": variante,
        "source": "quickdraw",
        "categorie": cat,
        "key_id": key,
        "pays": d.get("countrycode"),
        "date": d.get("timestamp"),
        "licence": "CC BY 4.0",
        "attribution": ATTRIBUTION,
        "modifications": ("coordonnées ramenées à [0, 1] (proportions conservées), temps en secondes depuis "
                          "le premier point, simplification RDP de 0,6 % du plus grand côté ; à l'emploi : "
                          "lissage, tremblé, pression et encre ajoutés, lavis d'aquarelle"),
        "taille": [round(float(np.ptp(A[:, 0])), 4), round(float(np.ptp(A[:, 1])), 4)],
        "point": ["x", "y", "t"],
        "traits": [[[round(float(x), 4), round(float(y), 4), round(float(t), 3)] for x, y, t in T] for T in tr],
        "pour": pour,
        "lavis": lavis or [],
    }
    if note:
        out["note"] = note
    f = CROQUIS / nom / f"{variante}.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"{nom}/{variante} : {cat} key_id {key} ({d.get('countrycode')}), {len(tr)} traits")


def licence():
    """design-system/croquis/LICENCE.md : attribution Quick, Draw! (CC BY 4.0) et liste de tous les dessins."""
    lignes_qd, lignes_m = [], []
    for f in sorted(CROQUIS.glob("*/*.json")):
        d = json.loads(f.read_text())
        rel = f"{d['nom']}/{f.name}"
        if d.get("source") == "quickdraw":
            lignes_qd.append(f"| `{rel}` | {d['categorie']} | `{d['key_id']}` | {d.get('pays') or '?'} | "
                             f"{(d.get('date') or '')[:10]} | {d.get('pour', 'tous')} |")
        else:
            lignes_m.append(f"| `{rel}` | {d.get('pour', 'tous')} | {len(d['traits'])} |")
    texte = f"""# Croquis du carnet : licences et attributions

Les croquis de `design-system/croquis/<nom>/<variante>.json` viennent de deux sources.

## 1. Quick, Draw! (Google) — CC BY 4.0

Les variantes `a`, `b`, `c`, `d` sont de **vrais dessins de joueurs** du jeu *Quick, Draw!*, tirés du
jeu de données public **The Quick, Draw! Dataset** de Google Creative Lab :

- source : https://github.com/googlecreativelab/quickdraw-dataset (fichiers « raw »,
  `https://storage.googleapis.com/quickdraw_dataset/full/raw/<catégorie>.ndjson`) ;
- licence : **Creative Commons Attribution 4.0 International (CC BY 4.0)**,
  https://creativecommons.org/licenses/by/4.0/ — « This data made available by Google, Inc. under the
  Creative Commons Attribution 4.0 International license. » ;
- attribution à faire figurer (crédits du site et du carnet) : *Croquis d'après The Quick, Draw!
  Dataset, Google Creative Lab, CC BY 4.0.*

**Modifications** (indiquées comme le demande CC BY 4.0) : coordonnées ramenées à [0, 1] (proportions
conservées), temps en secondes depuis le premier point, simplification Ramer-Douglas-Peucker de 0,6 %
du plus grand côté ; à l'emploi (`scripts/pages/croquis.py`) : légère déformation, rotation, lissage,
tremblé, pression et encre ajoutés, touches d'aquarelle. Chaque fichier garde `key_id`, `categorie`,
`pays`, `date`, `licence` et `attribution`. Seuls les dessins retenus sont versionnés ; les extraits
téléchargés restent dans `verification/out/c/quickdraw/` (non versionné). Choix :
`scripts/croquis/selection.json` (planches contact `verification/out/c/quickdraw/planches/`).

| Fichier | Catégorie | key_id | Pays | Date | Usage |
|---|---|---|---|---|---|
""" + "\n".join(lignes_qd) + """

## 2. Croquis maison

Les variantes `m*` (`ma`, `mb`, `mc`) sont des dessins originaux du projet, tracés à main levée en
coordonnées par le lot C (`scripts/croquis/maison.py`) pour ce que Quick, Draw! n'a pas (œuf, citron,
farine, sucre, huile, beurre, noix, vanille, cannelle, muscade, fouet, moule, cupcake, part de carrot
cake, lunettes de soleil, sachet de levure, 😎). Licence : celle du projet.

| Fichier | Usage | Traits |
|---|---|---|
""" + "\n".join(lignes_m) + """

`Usage` : `icone` (taille d'une ligne d'écriture), `dessin` (petit dessin de recette) ou `tous`.
"""
    (CROQUIS / "LICENCE.md").write_text(texte)
    print(f"LICENCE.md : {len(lignes_qd)} dessins Quick, Draw!, {len(lignes_m)} croquis maison")


def main(argv=None):
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    t = sp.add_parser("telecharger")
    t.add_argument("cats", nargs="*")
    t.add_argument("--mo", type=float, default=6.0)
    p = sp.add_parser("planche")
    p.add_argument("cats", nargs="+")
    p.add_argument("--n", type=int, default=48)
    p.add_argument("--graine", type=int, default=0)
    r = sp.add_parser("retenir")
    r.add_argument("cat")
    r.add_argument("index", type=int)
    r.add_argument("nom")
    r.add_argument("variante")
    r.add_argument("--lavis", default="")
    r.add_argument("--note", default="")
    r.add_argument("--pour", default="tous", choices=["tous", "icone", "dessin"])
    sp.add_parser("selection")
    sp.add_parser("licence")
    a = ap.parse_args(argv)
    if a.cmd == "telecharger":
        telecharger(a.cats or CATEGORIES, a.mo)
    elif a.cmd == "planche":
        for c in a.cats:
            planche(c, a.n, a.graine)
    elif a.cmd == "selection":
        selection()
        licence()
    elif a.cmd == "licence":
        licence()
    else:
        retenir(a.cat, a.index, a.nom, a.variante, json.loads(a.lavis) if a.lavis else None, a.note, a.pour)


if __name__ == "__main__":
    main()
