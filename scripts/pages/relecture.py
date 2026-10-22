"""Relecture OCR de l'encre rendue, À LA DEMANDE (jamais pendant la cuisson).

    tools/ecriture/.venv/bin/python scripts/pages/relecture.py [--only coralie,lise]
    npm run pages:relire [-- --only coralie,lise]

Relit les pages DÉJÀ cuites, sans les recuire : l'encre RGBA de design-system/baked/pages/<id>.webp
(telle que le visiteur la voit) est confrontée aux mots posés par la mise en page (refaite à partir des
descriptions et de la pagination en cache, comme à la cuisson ; aucun rendu). Seuls les mots importants
(nombres, unités, noms, ingrédients) sont relus, par le lecteur TrOCR de l'outil d'écriture
(ecriture.relire_rendu ; verdicts en cache disque : une page inchangée se relit presque instantanément).

Un mot douteux ne fait JAMAIS échouer quoi que ce soit (code de sortie 0) : il va dans un rapport lisible,
verification/out/relecture.md (et .json), où les nombres et les quantités, qui sont les vrais risques
(« 60g » lu « lolg »), passent avant les autres mots. L'OCR se trompe aussi : à regarder à l'œil.
Seul un lecteur TrOCR introuvable donne le code 2 (rien n'a été relu).

Aussi appelé par `bake-pages.mjs --mode complet --relire` (relire_cuisine) une fois les pages cuites.

Ce fichier est HORS de l'empreinte du moteur (cuire.HORS_EMPREINTE) : il ne change aucun octet des pages.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

import numpy as np  # noqa: E402

RACINE = ICI.parents[1]
RAPPORT = RACINE / "verification/out/relecture"
NOMBRE = re.compile(r"\d|[½¼¾°]")
UNITE = re.compile(r"^(th\.?|c\.?|(g|kg|cl|ml|l|dl|min|h|cm|mm)[.,;:)]*)$")


def est_nombre(texte: str) -> bool:
    """Nombre ou quantité (« 60g », « 50 cl », « 4 °C », « 40 min »)."""
    return bool(NOMBRE.search(texte)) or any(UNITE.match(t) for t in texte.split())


def _ligne_de(mots: list, idx: list) -> str:
    """Texte de la ligne du premier mot douteux (pour le retrouver sur la page)."""
    if not idx or idx[0] >= len(mots):
        return ""
    m0 = mots[idx[0]]
    return " ".join(m["texte"] for m in mots if m.get("bloc") == m0.get("bloc") and m.get("ligne") == m0.get("ligne"))


def relire_page(cuisine, pid: str, ecr) -> dict:
    """Relit une page cuite → {douteux: [...], perimee, erreur?}."""
    from PIL import Image
    f = cuisine.sortie / f"{pid}.webp"
    if not f.exists():
        return {"erreur": "pas encore cuite (image absente)"}
    ent = cuisine.cache.get(f"page/{pid}")
    try:
        perimee = not ent or ent.get("cle") != cuisine.empreinte_page(pid)
    except Exception:
        perimee = None
    mise = cuisine.mise(pid)
    mots = cuisine.mots_places(mise)
    rgba = np.asarray(Image.open(f).convert("RGBA"))
    H, W = rgba.shape[:2]
    res = ecr.relire_rendu(rgba, mots, contexte=mise.desc.get("contexte_importants")) or []
    out = []
    for d in res:
        texte = str(d.get("texte", ""))
        x, y, w, h = d.get("boite") or (0, 0, 0, 0)
        out.append({"mot": texte, "lu": d.get("lu"), "raison": d.get("raison"), "ecart": d.get("ecart"),
                    "nombre": est_nombre(texte), "ligne": _ligne_de(mots, d.get("mots") or []),
                    "position": [round((x + w / 2) / W * 100), round((y + h / 2) / H * 100)]})
    out.sort(key=lambda d: (not d["nombre"], -(d["ecart"] or 0)))
    return {"douteux": out, "mots": sum(1 for m in mots if m["important"]), "perimee": perimee}


def relire_pages(cuisine, ids: list, ecr) -> dict:
    """{id de page: résultat} ; une erreur sur une page n'arrête pas les autres."""
    out = {}
    for pid in ids:
        t = time.time()
        try:
            out[pid] = relire_page(cuisine, pid, ecr)
        except Exception as e:
            out[pid] = {"erreur": f"{type(e).__name__}: {e}"}
        r = out[pid]
        etat = r.get("erreur") or f"{len(r['douteux'])} douteux sur {r['mots']} mots importants"
        print(f"  {pid} : {etat} ({time.time() - t:.1f} s)", flush=True)
    return out


def _tableau(lignes: list) -> list:
    t = ["| Page | Mot voulu | Lu par l'OCR | Ligne | Position |", "|---|---|---|---|---|"]
    for pid, d in lignes:
        lu = f"« {d['lu']} »" if d.get("lu") else "—"
        t.append(f"| {pid} | **{d['mot']}** | {lu} | {d['ligne'].replace('|', '/')} | x {d['position'][0]} %, y {d['position'][1]} % |")
    return t


def ecrire_rapport(resultats: dict, dossier: Path = RAPPORT.parent, nom: str = RAPPORT.name) -> Path:
    """verification/out/relecture.md et .json."""
    dossier.mkdir(parents=True, exist_ok=True)
    tous = [(pid, d) for pid, r in resultats.items() for d in r.get("douteux", [])]
    nombres = [(p, d) for p, d in tous if d["nombre"]]
    autres = [(p, d) for p, d in tous if not d["nombre"]]
    sans = [p for p, r in resultats.items() if "douteux" in r and not r["douteux"]]
    erreurs = {p: r["erreur"] for p, r in resultats.items() if "erreur" in r}
    perimees = [p for p, r in resultats.items() if r.get("perimee")]
    md = ["# Relecture OCR de l'encre rendue", "",
          f"Faite le {time.strftime('%d/%m/%Y à %H:%M')} sur {len(resultats)} pages déjà cuites : "
          f"**{len(nombres)} nombres ou quantités** et {len(autres)} autres mots importants douteux.", "",
          "L'OCR (TrOCR) se trompe aussi : un mot douteux est un mot à regarder, pas une erreur avérée. "
          "Position : centre du mot, en % de la largeur (x) et de la hauteur (y) de la page.", ""]
    md += ["## Nombres et quantités (à vérifier en premier)", ""]
    md += _tableau(nombres) if nombres else ["Aucun."]
    md += ["", "## Autres mots importants (noms, ingrédients)", ""]
    md += _tableau(autres) if autres else ["Aucun."]
    if perimees:
        md += ["", "## Pages dont la description a changé depuis la cuisson", "",
               "Image et mots posés peuvent ne plus se correspondre (faux douteux possibles) : à recuire d'abord. "
               + ", ".join(perimees)]
    if erreurs:
        md += ["", "## Pages non relues", ""] + [f"- {p} : {e}" for p, e in erreurs.items()]
    md += ["", "## Pages sans mot douteux", "", ", ".join(sans) or "Aucune.", ""]
    f = dossier / f"{nom}.md"
    f.write_text("\n".join(md))
    (dossier / f"{nom}.json").write_text(json.dumps(
        {"pages": resultats, "nombres": [{"page": p, **d} for p, d in nombres]}, ensure_ascii=False, indent=1) + "\n")
    return f


def lecteur_disponible(ecr) -> bool:
    try:
        return bool(ecr._lecteur())
    except Exception as e:
        print(f"lecteur TrOCR indisponible : {type(e).__name__}: {e}", flush=True)
        return False


def relire_cuisine(cuisine, ids: list) -> Path | None:
    """Relecture des pages `ids` d'une Cuisine (images dans cuisine.sortie) → rapport. Jamais d'échec de
    cuisson : un lecteur absent est seulement signalé."""
    import ecriture as ECR
    if not lecteur_disponible(ECR):
        print("  relecture ignorée : lecteur TrOCR introuvable (tools/ecriture)", flush=True)
        return None
    print(f"  relecture de {len(ids)} pages", flush=True)
    f = ecrire_rapport(relire_pages(cuisine, ids, ECR))
    print(f"  rapport : {f.relative_to(RACINE)}", flush=True)
    return f


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="", help="doubles pages (coralie, lise…) ou pages (coralie-gauche…)")
    a = ap.parse_args(argv)
    import cuire as CU
    import recette as RC
    pages, papiers, plan = CU.charger_descriptions()
    carnet, roster = RC.charger_carnet(), RC.charger_roster()
    pages = CU.appliquer_carnet(pages, carnet, roster, [])
    cuisine = CU.Cuisine(pages, papiers, x4=False)
    # pagination du cache telle qu'elle a été cuite (aucune repagination : seul=[x] garde les entrées en cache)
    generees, erreurs = CU.paginer_recettes(plan, papiers, cuisine.cache, cuisine.moteur, cuisine.outil, False, ["-"], None,
                                            carnet, roster)
    for e in erreurs:
        print(f"recette trop longue (non relue) : {e}", flush=True)
    pages.update(generees)
    pages = CU.ajouter_contextes(pages, plan)
    cuisine.pages = pages
    cuisine.par_folio = {p["folio"]: p for p in pages.values() if "folio" in p and p.get("type") != "feuillet"}
    seul = [s for s in a.only.split(",") if s]
    ids = [pid for pid in CU.ordre_carnet(pages, list(pages))
           if not seul or any(pid == s or pages[pid].get("double") == s for s in seul)]
    if not ids:
        print(f"aucune page pour --only {a.only}", flush=True)
        return 0
    import ecriture as ECR
    if not lecteur_disponible(ECR):
        print("lecteur TrOCR introuvable : rien n'a été relu (bash tools/ecriture/telecharger.sh)", flush=True)
        return 2
    t0 = time.time()
    res = relire_pages(cuisine, ids, ECR)
    f = ecrire_rapport(res)
    nb = sum(len(r.get("douteux", [])) for r in res.values())
    print(f"{len(ids)} pages relues en {time.time() - t0:.0f} s : {nb} mots douteux → {f.relative_to(RACINE)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
