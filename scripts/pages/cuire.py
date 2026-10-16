"""Cuisson des pages du carnet (appelé par `node scripts/bake-pages.mjs`).

    tools/ecriture/.venv/bin/python scripts/pages/cuire.py [--only lisa,julie] [--force] [--apercus]

Pages cuites :
  - les descriptions écrites à la main : `src/content/pages/<id>.json` ;
  - les recettes reçues du plan `src/content/pages/recettes.json` : `src/content/recettes/<slug>.json`
    (RecetteRecue) → recette.py (pagination automatique) → <slug>-gauche, <slug>-droite et, si la
    recette est longue, <slug>-feuillet-recto / -verso (feuille de cahier glissée dans le carnet).

Pour chaque page :
  1. papier → design-system/baked/pages/papier/<f>.webp : un FEUILLET du carnet par image (recto =
     folio impair, verso = la même image en miroir, src/content/pages/papiers.json) ; pour le feuillet
     volant, une image par face (petits carreaux, cahiers de papiers.json) ;
  2. mise en page naturelle (mise_en_page.py, gestes.py) avec l'écriture générée de N2 (ecriture.py)
     et les croquis du lot C (croquis.py : traits comme l'encre, lavis multiplié ensuite) ;
  3. rastérisation des traits et composition encre × papier exactement dessous (rendu_encre.py), avec la
     transparence de la page au dos (`dos` explicite pour le feuillet volant) et la lumière ;
  4. calque d'encre → design-system/baked/pages/<id>.webp (RGBA, 2×) et pages/1x/<id>.webp (1×) ;
  5. manifeste → src/content/pages/manifeste.json (lu par <PageCuite>).

Code de sortie 1 si un mot ne tient pas (débordement, annotation non placée, recette trop longue
même avec le feuillet) : aucun mot n'est jamais perdu en silence.

Déterministe ; cache par empreinte (description, page au dos, papier, croquis utilisés, version de
l'outil d'écriture et du moteur) dans design-system/baked/pages/.cuisson.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
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
import recette as RC  # noqa: E402

RACINE = ICI.parents[1]
DESCRIPTIONS = RACINE / "src/content/pages"
SOURCES = RACINE / "design-system/sources/papier"
SORTIE = RACINE / "design-system/baked/pages"
APERCUS = RACINE / "verification/out/b/pages"
CACHE = SORTIE / ".cuisson.json"
ECHELLE = 2
LARG, HAUT = int(MEP.W * ECHELLE), int(MEP.H * ECHELLE)
VERSION_MOTEUR = 2
Q_PAPIER, Q_ENCRE, Q_ALPHA = 86, 50, 70
BUDGET_ENCRE = 245 * 1024  # encre ≤ 250 Ko par page à 2× : au-delà, qualités un peu plus basses
PALIERS = [(Q_ENCRE, Q_ALPHA), (46, 64), (42, 58), (38, 52)]
NON_PAGES = {"manifeste.json", "papiers.json", "recettes.json"}


def h(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def empreinte_moteur() -> str:
    m = hashlib.sha256(str(VERSION_MOTEUR).encode())
    for f in sorted(ICI.glob("*.py")):
        m.update(f.read_bytes())
    return m.hexdigest()[:16]


def charger_descriptions(dossier: Path | None = None):
    dossier = dossier or DESCRIPTIONS
    pages = {}
    for f in sorted(dossier.glob("*.json")):
        if f.name in NON_PAGES:
            continue
        d = json.loads(f.read_text())
        d.setdefault("id", f.stem)
        pages[d["id"]] = d
    papiers = json.loads((dossier / "papiers.json").read_text())
    plan_f = dossier / "recettes.json"
    plan = json.loads(plan_f.read_text()) if plan_f.exists() else {"recettes": {}}
    return pages, papiers, plan


def taille_page(page: dict) -> tuple[int, int]:
    """Taille de la page en px de la page de référence (850 × 960, ou la `taille` du feuillet)."""
    w, h_ = page.get("taille", (MEP.W, MEP.H))
    return int(round(w)), int(round(h_))


def feuillet_de(page: dict):
    """(id du papier, miroir). Carnet : recto = folio impair, verso = folio pair (dos du recto
    précédent, même image en miroir). Feuillet volant : une image par face, sans miroir."""
    if page.get("type") == "feuillet":
        return f"{page['papier']}-{page.get('face', 'recto')}", False
    folio = page["folio"]
    if folio % 2:
        return f"f{folio}", False
    return f"f{folio - 1}", True


def folio_dos(folio: int) -> int:
    return folio + 1 if folio % 2 else folio - 1


class Cuisine:
    def __init__(self, pages, papiers, force=False, apercus=False, sortie: Path | None = None, apercus_dir: Path | None = None,
                 cache: Path | None = None):
        self.pages = pages
        self.papiers = papiers
        self.force = force
        self.apercus = apercus
        sortie = sortie or SORTIE
        self.sortie = sortie
        self.apercus_dir = apercus_dir or APERCUS
        self.cache_f = cache or (sortie / ".cuisson.json")
        self.cache = json.loads(self.cache_f.read_text()) if self.cache_f.exists() else {}
        self.par_folio = {p["folio"]: p for p in pages.values() if "folio" in p and p.get("type") != "feuillet"}
        self._papier = {}
        self._papier1 = {}
        self._recto = {}
        self.moteur = empreinte_moteur()
        self.outil = ECR.version_outil()
        self.journal = []

    # ---- papier -------------------------------------------------------------------------------
    def cfg_papier(self, fid: str) -> dict:
        if fid in self.papiers.get("feuillets", {}):
            return self.papiers["feuillets"][fid]
        base, _, face = fid.rpartition("-")
        return dict(self.papiers["cahiers"][base], face=face)

    def papier(self, fid: str, taille=(LARG, HAUT)) -> np.ndarray:
        """Papier tel que le navigateur le décodera (pixels du WebP)."""
        if fid in self._papier:
            return self._papier[fid]
        cfg = self.cfg_papier(fid)
        larg, haut = taille
        cle = h({"cfg": cfg, "v": self.moteur, "q": Q_PAPIER, "taille": [larg, haut]})
        f = self.sortie / "papier" / f"{fid}.webp"
        if not self.force and self.cache.get(f"papier/{fid}") == cle and f.exists():
            pass
        else:
            t = time.time()
            if "face" in cfg:
                img = PAP.cahier(cfg, larg, haut, SOURCES, cfg["face"], ECHELLE)
            else:
                img = PAP.feuillet(cfg, larg, haut, SOURCES)
            data = R.webp(img, Q_PAPIER)
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(data)
            self.cache[f"papier/{fid}"] = cle
            self.journal.append(f"papier {fid} : {len(data) // 1024} Ko ({time.time() - t:.1f} s)")
        from PIL import Image
        arr = np.asarray(Image.open(f).convert("RGB"))
        # variante 1× (écrans de densité 1 : TV 1080p, ordinateur) : 4 fois moins de pixels à décoder
        f1 = self.sortie / "1x" / "papier" / f"{fid}.webp"
        if self.force or self.cache.get(f"papier1x/{fid}") != cle or not f1.exists():
            petit = Image.fromarray(arr).resize((larg // ECHELLE, haut // ECHELLE), Image.LANCZOS)
            f1.parent.mkdir(parents=True, exist_ok=True)
            f1.write_bytes(R.webp(np.asarray(petit), Q_PAPIER))
            self.cache[f"papier1x/{fid}"] = cle
        self._papier[fid] = arr
        self._papier1[fid] = np.asarray(Image.open(f1).convert("RGB"))
        return arr

    def _px(self, page):
        w, h_ = taille_page(page)
        return w * ECHELLE, h_ * ECHELLE

    def papier_page1(self, page: dict) -> np.ndarray:
        fid, miroir = feuillet_de(page)
        self.papier(fid, self._px(page))
        P = self._papier1[fid]
        return P[:, ::-1].copy() if miroir else P

    def papier_page(self, page: dict) -> np.ndarray:
        fid, miroir = feuillet_de(page)
        P = self.papier(fid, self._px(page))
        return P[:, ::-1].copy() if miroir else P

    def dos_de(self, page: dict):
        if page.get("dos"):
            return self.pages.get(page["dos"])
        if page.get("type") == "feuillet" or "folio" not in page:
            return None
        return self.par_folio.get(folio_dos(page["folio"]))

    # ---- encre --------------------------------------------------------------------------------
    def recto(self, pid: str):
        """Mise en page + transmittance de l'encre de la page (sans transparence du verso)."""
        if pid in self._recto:
            return self._recto[pid]
        page = self.pages[pid]
        t = time.time()
        mise = MEP.mettre_en_page(page)
        P = self.papier_page(page)
        larg, haut = self._px(page)
        rel = R.relief(P)
        rng = np.random.default_rng(page.get("graine", 1) + 991)
        bruit = PAP.grain_bruit(P, rel, rng)
        cartes = R.rasteriser(mise.traces, larg, haut, ECHELLE, bruit)
        lam = R.lumiere_carte(larg, haut, page.get("cote", "droite"))
        Rt, union = R.transmittance(cartes, rel, lam)
        # lavis des croquis : multiplié avec l'encre, juste après elle (même papier, même relief)
        if mise.lavis:
            C = MEP.croquis_module()
            for lv in mise.lavis:
                try:
                    try:
                        T = C.transmittance_lavis(lv, (haut, larg), ECHELLE, rel, lam)
                    except TypeError:
                        T = C.transmittance_lavis(lv, (haut, larg), ECHELLE, rel)
                    T = np.asarray(T, np.float32)
                    if T.shape[:2] != (haut, larg):
                        raise ValueError(f"forme {T.shape} au lieu de {(haut, larg, 3)}")
                    if T.ndim == 2:
                        T = T[..., None]
                    T = np.clip(T, 0, 1)
                    Rt = Rt * T
                    cv = getattr(C, "couverture_lavis", None)
                    u = cv(T) if cv else np.clip((1 - T.min(axis=2)) * 6, 0, 1)
                    union = np.maximum(union, np.asarray(u, np.float32))
                except Exception as e:  # le lot C travaille en parallèle : on garde le trait
                    self.journal.append(f"{pid} : lavis ignoré ({type(e).__name__}: {e})")
        self._recto[pid] = (mise, Rt, union)
        reserves = [c["nom"] for c in mise.croquis if not c["dessine"]]
        self.journal.append(f"{pid} : mise en page + rendu {time.time() - t:.1f} s, {len(mise.lignes)} lignes"
                            + (f", serrage {mise.serre}" if getattr(mise, "serre", None) else "")
                            + (f", croquis {sum(c['dessine'] for c in mise.croquis)}/{len(mise.croquis)}"
                               + (f" (place réservée : {sorted(set(reserves))})" if reserves else "") if mise.croquis else "")
                            + (f" — DÉBORDE : {mise.deborde}" if mise.deborde else "")
                            + (f" — mots douteux : {mise.douteux}" if mise.douteux else ""))
        return self._recto[pid]

    def empreinte_contenu(self, page: dict) -> dict:
        return {"page": page, "croquis": MEP.croquis_empreinte(MEP.noms_croquis(page))}

    def empreinte_page(self, pid: str) -> str:
        page = self.pages[pid]
        dos = self.dos_de(page)
        fid, miroir = feuillet_de(page)
        return h({"page": self.empreinte_contenu(page), "dos": self.empreinte_contenu(dos) if dos else None,
                  "papier": self.cfg_papier(fid), "miroir": miroir, "outil": self.outil, "moteur": self.moteur,
                  "q": [Q_ENCRE, Q_ALPHA]})

    def cuire(self, pid: str):
        page = self.pages[pid]
        cle = self.empreinte_page(pid)
        f = self.sortie / f"{pid}.webp"
        ent = self.cache.get(f"page/{pid}")
        if not self.force and ent and ent.get("cle") == cle and f.exists() and (self.sortie / "1x" / f"{pid}.webp").exists():
            return ent["manifeste"]
        mise, Rt, union = self.recto(pid)
        P = self.papier_page(page)
        fid, miroir = feuillet_de(page)
        dos = self.dos_de(page)
        V = None
        if dos is not None:
            _, R_dos, _ = self.recto(dos["id"])
            force = float(self.cfg_papier(fid).get("transparence", 0.045))
            V = R.verso_transmittance(R_dos, force)
        rgba, voulu = R.composer(P, Rt, union, V)
        for q, qa in PALIERS:
            data = R.webp(rgba, q, qa)
            if len(data) <= BUDGET_ENCRE:
                break
        if (q, qa) != PALIERS[0]:
            self.journal.append(f"{pid} : encre au-dessus du budget, qualités {q}/{qa}")
        f.parent.mkdir(parents=True, exist_ok=True)
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
            self.apercus_dir.mkdir(parents=True, exist_ok=True)
            Image.fromarray(np.clip(np.round(vu), 0, 255).astype(np.uint8)).save(self.apercus_dir / f"{pid}.png")
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
        (self.sortie / "1x").mkdir(parents=True, exist_ok=True)
        (self.sortie / "1x" / f"{pid}.webp").write_bytes(d1)
        self.journal.append(f"{pid} : encre 1× {len(d1) // 1024} Ko")
        W_, H_ = mise.W, mise.H
        fr = lambda r: [round(r[0] / W_, 5), round(r[1] / H_, 5), round((r[2] - r[0]) / W_, 5), round((r[3] - r[1]) / H_, 5)]  # noqa: E731
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
            "vivants": {k: fr(r) for k, r in mise.vivants.items()},
            "deborde": mise.deborde + [f"annotation non placée : {a}" for a in mise.non_places],
            "lignes": len(mise.lignes),
        }
        if page.get("type") == "feuillet":
            man["type"] = "feuillet"
            man["taille"] = list(taille_page(page))
            man["face"] = page.get("face", "recto")
            if page.get("dos"):
                man["dos"] = page["dos"]
        if page.get("volant"):
            man["volant"] = dict(page["volant"])
        if page.get("suite"):
            man["suite"] = page["suite"]
        if page.get("recette"):
            man["recette"] = page["recette"]
        if mise.croquis:
            man["croquis"] = [{"nom": c["nom"], "role": c["role"], "dessine": c["dessine"],
                               "boite": [round(c["boite"][0] / W_, 4), round(c["boite"][1] / H_, 4),
                                         round(c["boite"][2] / W_, 4), round(c["boite"][3] / H_, 4)]}
                              for c in mise.croquis]
        if mise.croquis_non_places:
            man["croquis_non_places"] = mise.croquis_non_places
        if mise.douteux:
            man["douteux"] = mise.douteux
        self.cache[f"page/{pid}"] = {"cle": cle, "manifeste": man}
        return man

    def ecrire_cache(self):
        self.cache_f.parent.mkdir(parents=True, exist_ok=True)
        self.cache_f.write_text(json.dumps(self.cache, indent=1, ensure_ascii=False) + "\n")


def paginer_recettes(plan: dict, papiers: dict, cache: dict, moteur: str, outil: str, force=False, seul=(), journal=None):
    """Recettes du plan → descriptions de pages (pagination en cache : elle ne dépend que de la
    recette, du plan, du papier du feuillet et des versions du moteur et de l'outil d'écriture)."""
    pages, erreurs = {}, []
    for slug, pr in plan.get("recettes", {}).items():
        rec = RC.charger_recette(slug, pr)
        cfg = papiers.get("cahiers", {}).get(pr.get("feuillet", {}).get("papier", f"c-{slug}"))
        cle = h({"recette": rec, "plan": pr, "cahier": cfg, "moteur": moteur, "outil": outil})
        ent = cache.get(f"pagination/{slug}")
        if not force and ent and ent.get("cle") == cle:
            pages.update(ent["pages"])
            continue
        if seul and not any(s == slug or s.startswith(slug + "-") for s in seul) and ent:
            # pas demandée : on garde l'ancienne pagination (elle sera refaite quand on la cuira)
            pages.update(ent["pages"])
            continue
        try:
            res = RC.paginer(rec, pr, papiers)
        except RC.Deborde as e:
            erreurs.append(str(e))
            continue
        if journal is not None:
            journal.append(f"{slug} : pagination {len(res.ordre)} pages ({', '.join(res.ordre)}), étapes « {res.disposition} », "
                           f"{res.sondes} sondes, {res.duree:.1f} s")
            for pid in res.ordre:
                journal.append(f"    {pid} : {len(res.repartition[pid])} atomes")
        pages.update(res.pages)
        cache[f"pagination/{slug}"] = {"cle": cle, "pages": res.pages, "ordre": res.ordre, "disposition": res.disposition}
    return pages, erreurs


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--apercus", action="store_true", help="écrit aussi verification/out/b/pages/<id>.png")
    a = ap.parse_args(argv)
    t0 = time.time()
    pages, papiers, plan = charger_descriptions()
    seul = [s for s in a.only.split(",") if s]
    cuisine = Cuisine(pages, papiers, force=a.force, apercus=a.apercus)
    journal = []
    generees, erreurs = paginer_recettes(plan, papiers, cuisine.cache, cuisine.moteur, cuisine.outil, a.force, seul, journal)
    for l in journal:
        print("  " + l, flush=True)
    for e in erreurs:
        print(f"✗ recette trop longue : {e}", flush=True)
    doublons = set(generees) & set(pages)
    if doublons:
        print(f"✗ pages décrites deux fois (à la main et par une recette) : {sorted(doublons)}")
        return 1
    pages.update(generees)
    cuisine.pages = pages
    cuisine.par_folio = {p["folio"]: p for p in pages.values() if "folio" in p and p.get("type") != "feuillet"}
    choisies = [pid for pid in pages if not seul or any(pid == s or pages[pid].get("double") == s for s in seul)]
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
        "version": 2,
        "largeur": MEP.W, "hauteur": MEP.H, "echelle": ECHELLE,
        "pages": entrees,
    }
    manifeste_f.write_text(json.dumps(man, indent=1, ensure_ascii=False) + "\n")
    cuisine.ecrire_cache()
    if a.apercus:
        APERCUS.mkdir(parents=True, exist_ok=True)
        for pid in choisies:
            (APERCUS / f"{pid}.json").write_text(json.dumps(pages[pid], indent=1, ensure_ascii=False) + "\n")
    deb = {k: v["deborde"] for k, v in entrees.items() if v.get("deborde")}
    dou = {k: v["douteux"] for k, v in entrees.items() if v.get("douteux")}
    res = {k: sorted({c["nom"] for c in v.get("croquis", []) if not c["dessine"]}) for k, v in entrees.items()}
    res = {k: v for k, v in res.items() if v}
    if res:
        print(f"croquis en attente (place réservée) : {res}")
    if dou:
        print(f"mots douteux restants : {dou}")
    print(f"pages cuites : {len(choisies)} en {time.time() - t0:.1f} s" + (f" — débordements : {deb}" if deb else ""))
    return 1 if (deb or erreurs) else 0


if __name__ == "__main__":
    sys.exit(main())
