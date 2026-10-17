"""Répare les mots importants qui se lisent mal sur l'encre rendue (CONTRACT § 13) : pour chaque bloc
où la relecture (ecriture.relire_rendu) trouve un mot important douteux, essaie d'autres graines et
garde celle qui se relit le mieux, puis l'inscrit dans la description de la page :
  - page décrite à la main (src/content/pages/<id>.json) : `graine` du bloc ;
  - page d'une recette reçue (Lisa) : `graines` du plan (src/content/pages/recettes.json), par atome.

    tools/ecriture/.venv/bin/python scripts/pages/reparer.py mathis-gauche,lisa-gauche [--essais 6]
    … --forcer dedicace:dedicace     (change la graine d'un bloc même si la relecture ne voit rien :
                                       mot non important mal écrit, repéré à l'œil)

Puis recuire : node scripts/bake-pages.mjs --only <pages>. Rien n'est cuit ici.
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

import cuire as C  # noqa: E402
import ecriture as ECR  # noqa: E402
import recette as RC  # noqa: E402

RACINE = ICI.parents[1]
PAGES = RACINE / "src/content/pages"
PAS = 7919  # écart entre deux graines essayées


def preparer():
    pages, papiers, plan = C.charger_descriptions()
    carnet, roster = RC.charger_carnet(), RC.charger_roster()
    journal: list = []
    pages = C.appliquer_carnet(pages, carnet, roster, journal)
    cu = C.Cuisine(pages, papiers, force=True, x4=False)
    gen, _ = C.paginer_recettes(plan, papiers, cu.cache, cu.moteur, cu.outil, False, (), journal, carnet, roster)
    pages.update(gen)
    pages = C.ajouter_contextes(pages, plan)
    cu.pages = pages
    cu.par_folio = {p["folio"]: p for p in pages.values() if "folio" in p and p.get("type") != "feuillet"}
    return cu, set(gen)


def relire(cu, pid: str) -> tuple[list, list]:
    """(douteux, mots placés) de la page telle qu'elle est décrite en mémoire."""
    cu._mises.pop(pid, None)
    cu._recto.pop(pid, None)
    mise, Rt, union, _ = cu.recto(pid)
    P = cu.papier_page(cu.pages[pid])
    rgba, _ = C.R.composer(P, Rt, union, None, cu.ech)
    mots = cu.mots_places(mise)
    res = ECR.relire_rendu(rgba, mots, contexte=mise.desc.get("contexte_importants"))
    return list(res or []), mots


SUFFIXES = ("-sous", "-signature", "-titre")


def base_bloc(b: str) -> str:
    """Bloc décrit d'un mot placé : « cadre-signature » → « cadre », « bandeau-sous » → « bandeau »."""
    for suf in SUFFIXES:
        if b.endswith(suf):
            return b[: -len(suf)]
    return b


def score(douteux: list, mots: list, bloc: str) -> float:
    """Plus c'est bas, mieux ça se lit : un point par mot douteux du bloc, plus son manque d'écart."""
    s = 0.0
    for d in douteux:
        if any(base_bloc(mots[i].get("bloc", "")) == bloc for i in d.get("mots", []) if i < len(mots)):
            s += 1.0 + max(0.0, float(d.get("seuil", 3.0)) - float(d.get("ecart", 0.0))) / 3.0
    return s


def blocs_douteux(douteux: list, mots: list) -> list[str]:
    out = []
    for d in douteux:
        for i in d.get("mots", []):
            if i < len(mots):
                b = base_bloc(mots[i].get("bloc", ""))
                if b and b not in out:
                    out.append(b)
    return out


def bloc_de(page: dict, bid: str):
    for idx, b in enumerate(page.get("blocs", [])):
        if b.get("id") == bid:
            return idx, b
    return None, None


def decaler(page: dict, idx: int, orig: dict, delta: int) -> None:
    """Remplace le bloc idx par l'original dont toutes les graines sont décalées de delta."""
    b = copy.deepcopy(orig)
    base = int(page.get("graine", 1))
    b["graine"] = int(orig.get("graine", base * 31 + idx * 7)) + delta
    for cle in ("lignes", "segments"):
        for k, l in enumerate(b.get(cle) or []):
            if isinstance(l, dict) and "graine" in l:
                l["graine"] = int(l["graine"]) + delta
    page["blocs"][idx] = b


def reparer(cu, pid: str, essais: int, forces: list[str]) -> dict:
    """{bloc: delta retenu} ; la page en mémoire garde les meilleures graines."""
    page = cu.pages[pid]
    t = time.time()
    douteux, mots = relire(cu, pid)
    cibles = blocs_douteux(douteux, mots)
    for f in forces:
        if f not in cibles:
            cibles.append(f)
    print(f"{pid} : {len(douteux)} douteux, blocs {cibles} ({time.time() - t:.0f} s)", flush=True)
    retenus = {}
    for bid in cibles:
        idx, orig = bloc_de(page, bid)
        if orig is None:
            print(f"  {bid} : bloc introuvable, ignoré")
            continue
        orig = copy.deepcopy(orig)
        meilleur = (score(douteux, mots, bid), 0)
        force = bid in forces
        if force:
            meilleur = (float("inf"), 0)  # changer de graine quoi qu'il arrive
        for k in range(1, essais + 1):
            if meilleur[0] == 0:
                break
            decaler(page, idx, orig, k * PAS)
            d2, m2 = relire(cu, pid)
            s = score(d2, m2, bid)
            print(f"  {bid} +{k}·{PAS} : {s:.2f}", flush=True)
            if s < meilleur[0]:
                meilleur = (s, k * PAS)
        if meilleur[1]:
            decaler(page, idx, orig, meilleur[1])
            retenus[bid] = meilleur[1]
        else:
            page["blocs"][idx] = orig
        print(f"  {bid} : retenu +{meilleur[1]} (score {meilleur[0]:.2f})", flush=True)
    return retenus


def inscrire(cu, pid: str, retenus: dict, generees: set) -> None:
    page = cu.pages[pid]
    if pid in generees:
        # recette reçue : graines par atome dans le plan
        plan_f = PAGES / "recettes.json"
        plan = json.loads(plan_f.read_text())
        slug = page.get("recette") or page.get("double")
        rec = plan["recettes"][slug]
        gr = rec.setdefault("graines", {})
        for bid in retenus:
            _, b = bloc_de(page, bid)
            for l in (b.get("lignes") or []) + (b.get("segments") or []):
                if isinstance(l, dict) and l.get("atome"):
                    gr[l["atome"]] = int(l["graine"])
        plan_f.write_text(json.dumps(plan, indent=1, ensure_ascii=False) + "\n")
        print(f"{pid} : graines d'atomes inscrites dans recettes.json ({slug})")
        return
    f = PAGES / f"{pid}.json"
    desc = json.loads(f.read_text())
    for bid in retenus:
        _, nouveau = bloc_de(page, bid)
        for b in desc.get("blocs", []):
            if b.get("id") == bid:
                b["graine"] = nouveau["graine"]
                if isinstance(b.get("lignes"), list) and b["lignes"] and isinstance(b["lignes"][0], dict):
                    for l, n in zip(b["lignes"], nouveau.get("lignes") or []):
                        if isinstance(l, dict) and isinstance(n, dict) and "graine" in n:
                            l["graine"] = n["graine"]
    f.write_text(json.dumps(desc, indent=1, ensure_ascii=False) + "\n")
    print(f"{pid} : graines inscrites dans {f.relative_to(RACINE)}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pages")
    ap.add_argument("--essais", type=int, default=6)
    ap.add_argument("--forcer", default="", help="page:bloc,… à changer même sans douteux")
    a = ap.parse_args(argv)
    forces: dict[str, list[str]] = {}
    for x in filter(None, a.forcer.split(",")):
        p, b = x.split(":")
        forces.setdefault(p, []).append(b)
    cu, generees = preparer()
    for pid in filter(None, a.pages.split(",")):
        retenus = reparer(cu, pid, a.essais, forces.get(pid, []))
        if retenus:
            inscrire(cu, pid, retenus, generees)
    return 0


if __name__ == "__main__":
    sys.exit(main())
