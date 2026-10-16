"""Cuisson des pages du carnet (appelé par `node scripts/bake-pages.mjs`).

    tools/ecriture/.venv/bin/python scripts/pages/cuire.py [--only julie,rose] [--force] [--apercus]

Pour chaque description `src/content/pages/<id>.json` :
  1. papier du feuillet (src/content/pages/papiers.json) → design-system/baked/pages/papier/<f>.webp
     (partagé par le recto et le verso du feuillet) ;
  2. mise en page naturelle (mise_en_page.py, gestes.py) avec l'écriture générée de N2 (ecriture.py) ;
  3. rastérisation des traits et composition encre × papier exactement dessous (rendu_encre.py), avec la
     transparence de la page au dos et la lumière de la double page ;
  4. calque d'encre → design-system/baked/pages/<id>.webp (RGBA, 2×) et pages/1x/<id>.webp (1×,
     même encre réduite, résolue sur le papier 1× décodé) ;
  5. manifeste → src/content/pages/manifeste.json (lu par <PageCuite>).

Déterministe ; cache par empreinte (description, page au dos, papier, version de l'outil d'écriture
et du moteur) dans design-system/baked/pages/.cuisson.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

import numpy as np  # noqa: E402

import ecriture as ECR  # noqa: E402
import mise_en_page as MEP  # noqa: E402
import feuillets as PAP  # noqa: E402
import rendu_encre as R  # noqa: E402

RACINE = ICI.parents[1]
DESCRIPTIONS = RACINE / "src/content/pages"
SOURCES = RACINE / "design-system/sources/papier"
SORTIE = RACINE / "design-system/baked/pages"
APERCUS = RACINE / "verification/out/n3/pages"
CACHE = SORTIE / ".cuisson.json"
ECHELLE = 2
LARG, HAUT = int(MEP.W * ECHELLE), int(MEP.H * ECHELLE)
VERSION_MOTEUR = 1
Q_PAPIER, Q_ENCRE, Q_ALPHA = 86, 50, 70


def h(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def empreinte_moteur() -> str:
    m = hashlib.sha256(str(VERSION_MOTEUR).encode())
    for f in sorted(ICI.glob("*.py")):
        m.update(f.read_bytes())
    return m.hexdigest()[:16]


def charger():
    pages = {}
    for f in sorted(DESCRIPTIONS.glob("*.json")):
        if f.name in ("manifeste.json", "papiers.json"):
            continue
        d = json.loads(f.read_text())
        d.setdefault("id", f.stem)
        pages[d["id"]] = d
    papiers = json.loads((DESCRIPTIONS / "papiers.json").read_text())
    return pages, papiers


def feuillet_de(folio: int):
    """(id du feuillet, miroir) : recto = folio impair, verso = folio pair (dos du recto précédent)."""
    if folio % 2:
        return f"f{folio}", False
    return f"f{folio - 1}", True


def folio_dos(folio: int) -> int:
    return folio + 1 if folio % 2 else folio - 1


class Cuisine:
    def __init__(self, pages, papiers, force=False, apercus=False):
        self.pages = pages
        self.papiers = papiers
        self.force = force
        self.apercus = apercus
        self.cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
        self.par_folio = {p["folio"]: p for p in pages.values() if "folio" in p}
        self._papier = {}
        self._papier1 = {}
        self._recto = {}
        self.moteur = empreinte_moteur()
        self.outil = ECR.version_outil()
        self.journal = []

    # ---- papier -------------------------------------------------------------------------------
    def papier(self, fid: str) -> np.ndarray:
        """Papier du feuillet tel que le navigateur le décodera (pixels du WebP)."""
        if fid in self._papier:
            return self._papier[fid]
        cfg = self.papiers["feuillets"][fid]
        cle = h({"cfg": cfg, "v": self.moteur, "q": Q_PAPIER, "taille": [LARG, HAUT]})
        f = SORTIE / "papier" / f"{fid}.webp"
        if not self.force and self.cache.get(f"papier/{fid}") == cle and f.exists():
            data = f.read_bytes()
        else:
            t = time.time()
            img = PAP.feuillet(cfg, LARG, HAUT, SOURCES)
            data = R.webp(img, Q_PAPIER)
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(data)
            self.cache[f"papier/{fid}"] = cle
            self.journal.append(f"papier {fid} : {len(data) // 1024} Ko ({time.time() - t:.1f} s)")
        from PIL import Image
        arr = np.asarray(Image.open(f).convert("RGB"))
        # variante 1× (écrans de densité 1 : TV 1080p, ordinateur) : 4 fois moins de pixels à décoder
        f1 = SORTIE / "1x" / "papier" / f"{fid}.webp"
        if self.force or self.cache.get(f"papier1x/{fid}") != cle or not f1.exists():
            petit = Image.fromarray(arr).resize((LARG // ECHELLE, HAUT // ECHELLE), Image.LANCZOS)
            f1.parent.mkdir(parents=True, exist_ok=True)
            f1.write_bytes(R.webp(np.asarray(petit), Q_PAPIER))
            self.cache[f"papier1x/{fid}"] = cle
        self._papier[fid] = arr
        self._papier1[fid] = np.asarray(Image.open(f1).convert("RGB"))
        return arr

    def papier_page1(self, page: dict) -> np.ndarray:
        fid, miroir = feuillet_de(page["folio"])
        self.papier(fid)
        P = self._papier1[fid]
        return P[:, ::-1].copy() if miroir else P

    def papier_page(self, page: dict) -> np.ndarray:
        fid, miroir = feuillet_de(page["folio"])
        P = self.papier(fid)
        return P[:, ::-1].copy() if miroir else P

    # ---- encre --------------------------------------------------------------------------------
    def recto(self, pid: str):
        """Mise en page + transmittance de l'encre de la page (sans transparence du verso)."""
        if pid in self._recto:
            return self._recto[pid]
        page = self.pages[pid]
        t = time.time()
        mise = MEP.mettre_en_page(page)
        P = self.papier_page(page)
        rel = R.relief(P)
        rng = np.random.default_rng(page.get("graine", 1) + 991)
        bruit = PAP.grain_bruit(P, rel, rng)
        cartes = R.rasteriser(mise.traces, LARG, HAUT, ECHELLE, bruit)
        lam = R.lumiere_carte(LARG, HAUT, page.get("cote", "droite"))
        Rt, union = R.transmittance(cartes, rel, lam)
        self._recto[pid] = (mise, Rt, union)
        self.journal.append(f"{pid} : mise en page + rendu {time.time() - t:.1f} s, {len(mise.lignes)} lignes"
                            + (f", serrage {mise.serre}" if getattr(mise, "serre", None) else "")
                            + (f" — DÉBORDE : {mise.deborde}" if mise.deborde else "")
                            + (f" — mots douteux : {mise.douteux}" if mise.douteux else ""))
        return self._recto[pid]

    def empreinte_page(self, pid: str) -> str:
        page = self.pages[pid]
        dos = self.par_folio.get(folio_dos(page["folio"]))
        fid, miroir = feuillet_de(page["folio"])
        return h({"page": page, "dos": dos, "papier": self.papiers["feuillets"][fid], "miroir": miroir,
                  "outil": self.outil, "moteur": self.moteur, "q": [Q_ENCRE, Q_ALPHA]})

    def cuire(self, pid: str):
        page = self.pages[pid]
        cle = self.empreinte_page(pid)
        f = SORTIE / f"{pid}.webp"
        ent = self.cache.get(f"page/{pid}")
        if not self.force and ent and ent.get("cle") == cle and f.exists() and (SORTIE / "1x" / f"{pid}.webp").exists():
            return ent["manifeste"]
        mise, Rt, union = self.recto(pid)
        P = self.papier_page(page)
        fid, miroir = feuillet_de(page["folio"])
        dos = self.par_folio.get(folio_dos(page["folio"]))
        V = None
        if dos is not None:
            _, R_dos, _ = self.recto(dos["id"])
            force = float(self.papiers["feuillets"][fid].get("transparence", 0.045))
            V = R.verso_transmittance(R_dos, force)
        rgba, voulu = R.composer(P, Rt, union, V)
        data = R.webp(rgba, Q_ENCRE, Q_ALPHA)
        f.write_bytes(data)
        # contrôle : le calque décodé posé sur le papier décodé redonne la composition voulue
        from PIL import Image
        import io
        dec = np.asarray(Image.open(io.BytesIO(data)).convert("RGBA")).astype(np.float32)
        a = dec[..., 3:4] / 255.0
        vu = dec[..., :3] * a + P.astype(np.float32) * (1 - a)
        err = np.abs(vu - voulu)
        self.journal.append(f"{pid} : encre {len(data) // 1024} Ko, écart composé moyen {err.mean():.2f} "
                            f"niveau, p99,9 {np.percentile(err, 99.9):.1f}")
        if self.apercus:
            APERCUS.mkdir(parents=True, exist_ok=True)
            Image.fromarray(np.clip(np.round(vu), 0, 255).astype(np.uint8)).save(APERCUS / f"{pid}.png")
        # variante 1× : la même encre réduite (transmittance moyennée), résolue sur le papier 1× décodé
        P1 = self.papier_page1(page)
        hh, ww = P1.shape[:2]
        # (on réduit la transmittance, pas la sortie : le papier 1× décodé n'est pas exactement la
        # réduction du papier 2×, et l'écart deviendrait un voile d'encre sur toute la page)
        Rv = Rt * (V if V is not None else 1.0)
        R1 = Rv.reshape(hh, 2, ww, 2, 3).mean(axis=(1, 3))
        u1 = union.reshape(hh, 2, ww, 2).mean(axis=(1, 3))
        rgba1, _ = R.composer(P1, R1.astype(np.float32), u1.astype(np.float32), None)
        d1 = R.webp(rgba1, Q_ENCRE, Q_ALPHA)
        (SORTIE / "1x").mkdir(parents=True, exist_ok=True)
        (SORTIE / "1x" / f"{pid}.webp").write_bytes(d1)
        self.journal.append(f"{pid} : encre 1× {len(d1) // 1024} Ko")
        man = {
            "double": page.get("double"),
            "cote": page.get("cote"),
            "folio": page.get("folio"),
            "papier": f"pages/papier/{fid}",
            "miroir": miroir,
            "encre": f"pages/{pid}",
            "papier1x": f"pages/1x/papier/{fid}",
            "encre1x": f"pages/1x/{pid}",
            "texte": "\n".join(t for t in mise.texte if t),
            "vivants": {k: [round(x0 / MEP.W, 5), round(y0 / MEP.H, 5), round((x1 - x0) / MEP.W, 5), round((y1 - y0) / MEP.H, 5)]
                        for k, (x0, y0, x1, y1) in mise.vivants.items()},
            "deborde": mise.deborde + [f"annotation non placée : {a}" for a in mise.non_places],
            "lignes": len(mise.lignes),
        }
        if mise.douteux:
            man["douteux"] = mise.douteux
        self.cache[f"page/{pid}"] = {"cle": cle, "manifeste": man}
        return man

    def ecrire_cache(self):
        CACHE.write_text(json.dumps(self.cache, indent=1, ensure_ascii=False) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--apercus", action="store_true", help="écrit aussi verification/out/n3/pages/<id>.png")
    a = ap.parse_args(argv)
    pages, papiers = charger()
    seul = [s for s in a.only.split(",") if s]
    choisies = [pid for pid in pages if not seul or any(pid == s or pages[pid].get("double") == s for s in seul)]
    t0 = time.time()
    cuisine = Cuisine(pages, papiers, force=a.force, apercus=a.apercus)
    SORTIE.mkdir(parents=True, exist_ok=True)
    manifeste_f = DESCRIPTIONS / "manifeste.json"
    ancien = json.loads(manifeste_f.read_text()) if manifeste_f.exists() else {"pages": {}}
    entrees = dict(ancien.get("pages", {}))
    for pid in choisies:
        entrees[pid] = cuisine.cuire(pid)
        cuisine.ecrire_cache()
        for l in cuisine.journal:
            print("  " + l, flush=True)
        cuisine.journal.clear()
    entrees = {k: v for k, v in sorted(entrees.items()) if k in pages}
    man = {
        "version": 1,
        "largeur": MEP.W, "hauteur": MEP.H, "echelle": ECHELLE,
        "pages": entrees,
    }
    manifeste_f.write_text(json.dumps(man, indent=1, ensure_ascii=False) + "\n")
    cuisine.ecrire_cache()
    deb = {k: v["deborde"] for k, v in entrees.items() if v.get("deborde")}
    dou = {k: v["douteux"] for k, v in entrees.items() if v.get("douteux")}
    if dou:
        print(f"mots douteux restants : {dou}")
    print(f"pages cuites : {len(choisies)} en {time.time() - t0:.1f} s" + (f" — débordements : {deb}" if deb else ""))
    return 1 if deb else 0


if __name__ == "__main__":
    sys.exit(main())
