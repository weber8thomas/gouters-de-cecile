"""Recette reçue → pages cuites de l'invité (pagination automatique).

    tools/ecriture/.venv/bin/python scripts/pages/recette.py lisa      # rapport + descriptions
                                                                         # dans verification/out/b/pages/

Entrée : `src/content/recettes/<slug>.json` (type `RecetteRecue`, src/content/types.ts) et son plan
de cuisson dans `src/content/pages/recettes.json` (double page, folios, zone photo, coin du feuillet,
papier du feuillet…). Sortie : les descriptions des pages (même format que src/content/pages/<id>.json)

    <slug>-gauche            zone `photo` en haut (un peu de travers, blanc autour), titre souligné,
                             note de marge près du titre, ingrédients à puces-croquis ;
    <slug>-droite            la suite (étapes, après, options, fin, signature) ; si le feuillet sert :
                             zone `volant` (coin du feuillet qui dépasse) et « suite sur la feuille »
                             au crayon de Cécile, flèche vers le coin ;
    <slug>-feuillet-recto    feuille de cahier glissée dans le carnet (`type: feuillet`, sa `taille`),
    <slug>-feuillet-verso    « (suite) » en tête du recto ; le verso continue.

Pagination :
  1. découpe en ATOMES : titre, ligne d'ingrédient, titre d'option, phrase (la première phrase
     d'une étape porte son titre « Étape n » : jamais de titre seul), mot de la fin, signature ;
     chaque atome a une GRAINE STABLE = hash(slug, id de l'atome) — son écriture ne dépend pas de
     la page où il tombe ;
  2. coulage gauche → droite → feuillet recto → feuillet verso : pour chaque page, plus long
     préfixe d'atomes qui tient (recherche dichotomique sur la composition, sans rastériser,
     resserrage des dernières lignes compris), puis recul jusqu'à une coupure permise : ni titre
     (de recette, d'option) en bas de page, ni ingrédient seul de son groupe en bas ou en haut d'une
     page, ni signature séparée de ce qui la précède ;
  3. si la droite ne suffit pas, elle est recomposée avec la zone `volant` et la note de suite ;
  4. s'il reste des atomes après le verso : `Deborde` (la cuisson sort en code 1) — aucun mot perdu.
Les étapes s'écrivent « Étape n » sur sa ligne quand tout tient ainsi, sinon en tête de paragraphe.
Le petit dessin de la recette se pose dans le premier blanc assez grand des pages indiquées.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

ICI = Path(__file__).resolve().parent
if str(ICI) not in sys.path:
    sys.path.insert(0, str(ICI))

import mise_en_page as MEP  # noqa: E402
import feuillets as PAP  # noqa: E402

RACINE = ICI.parents[1]
PLAN = RACINE / "src/content/pages/recettes.json"
PAPIERS = RACINE / "src/content/pages/papiers.json"
SORTIE_DESC = RACINE / "verification/out/b/pages"

# main de la recette (RecetteRecue.style.main, mains de l'écriture) → main du moteur de pages
MAINS = {"ado": "ado", "papa": "papa", "mamie": "mamie", "ecole": "ecole", "soignee": "soignee",
         "pressee": "pressee", "cecile": "cecile", "feutre": "feutre", "capitales": "capitales"}


class Deborde(Exception):
    """La recette ne tient pas sur gauche + droite + feuillet recto + verso."""


SURCHARGES: dict = {}  # (slug, id d'atome) → graine choisie à la relecture (plan : « graines »)


def graine_atome(slug: str, aid: str) -> int:
    """Graine stable d'un atome : ne dépend que de la recette et de l'atome, jamais de sa page.
    Le plan peut en imposer une (`graines` : { id d'atome : graine }) quand un mot se relit mal."""
    if (slug, aid) in SURCHARGES:
        return int(SURCHARGES[(slug, aid)])
    return int(hashlib.sha256(f"{slug}/{aid}".encode()).hexdigest()[:8], 16) % 100_000_000


# =============================================================================================
# Atomes
# =============================================================================================
@dataclass
class Atome:
    id: str
    genre: str  # titre | groupe-titre | ligne | phrase | fin | mot | signature
    texte: str
    graine: int
    bloc: str = ""  # bloc logique (groupe d'ingrédients, étape, paragraphe)
    puce: str | None = None
    titre: dict | None = None  # étape : segment « Étape n » porté par la 1re phrase
    colle: bool = False  # ne peut pas finir une page (titre)
    colle_avant: bool = False  # ne peut pas commencer une page (signature)
    disposition: str = "auto"  # étape : titre sur sa ligne (ligne), en tête de paragraphe (tete), ou choix de la page (auto)
    premier: bool = True  # premier atome de son bloc (alinéa possible)


_ABREV = {"th.", "c.", "s.", "env.", "min.", "cl.", "g.", "ex.", "p.", "cf.", "càc.", "càs.", "m.", "mme.", "st."}


def phrases(texte: str) -> list[str]:
    """Découpe un paragraphe en phrases (après . ! ? … suivis d'une majuscule), sans couper les
    abréviations (« th. 6 », « 1 c. à s. »)."""
    mots = texte.split()
    out, cur = [], []
    for k, m in enumerate(mots):
        cur.append(m)
        suivant = mots[k + 1] if k + 1 < len(mots) else None
        fin = re.search(r"[.!?…]+[»)]*$", m) is not None and m.lower() not in _ABREV
        if fin and suivant and re.match(r"^[«(]?[A-ZÀ-ÖØ-Þ]", suivant):
            out.append(" ".join(cur))
            cur = []
    if cur:
        out.append(" ".join(cur))
    return out


def propositions(phrase: str, longue: int = 64, mini: int = 26) -> list[str]:
    """Une phrase longue se coupe aussi après ses virgules (« …(pour éviter les projections), | puis
    allumer… ») : une page peut finir au milieu d'une phrase, comme dans les vrais carnets, au lieu de
    laisser un trou de plusieurs lignes."""
    if len(phrase) <= longue:
        return [phrase]
    mots = phrase.split()
    out, cur = [], []
    for k, m in enumerate(mots):
        cur.append(m)
        reste = " ".join(mots[k + 1:])
        if m.endswith(",") and len(" ".join(cur)) >= mini and len(reste) >= mini:
            out.append(" ".join(cur))
            cur = []
    if cur:
        out.append(" ".join(cur))
    return out


def atomes(rec: dict, alias: dict | None = None) -> list[Atome]:
    """`alias` : nom de croquis du contenu → nom du croquis dessiné (😎 « lunettes-soleil » →
    « sourire-lunettes », choix de l'utilisatrice)."""
    alias = alias or {}
    al = lambda n: alias.get(n, n) if n else n  # noqa: E731
    slug = rec["slug"]
    g = lambda aid: graine_atome(slug, aid)  # noqa: E731
    A: list[Atome] = []
    A.append(Atome("titre", "titre", rec["titre"], g("titre"), bloc="titre", colle=True))

    def groupe(grp, gid):
        if grp.get("titre"):
            A.append(Atome(f"{gid}/titre", "groupe-titre", grp["titre"], g(f"{gid}/titre"), bloc=f"{gid}/titre", colle=True))
        for k, l in enumerate(grp.get("lignes") or []):
            puce = al(l["puce"] if "puce" in l else grp.get("puce"))
            A.append(Atome(f"{gid}/ligne-{k + 1}", "ligne", l["texte"], g(f"{gid}/ligne-{k + 1}"), bloc=gid, puce=puce))
        for p, par in enumerate(grp.get("paragraphes") or []):
            paragraphe(par, f"{gid}/paragraphe-{p + 1}")

    def paragraphe(texte, pid, titre=None):
        n = 0
        for k, ph in enumerate(phrases(texte)):
            props = propositions(ph)
            for j, pr in enumerate(props):
                aid = f"{pid}/phrase-{k + 1}" + (f".{j + 1}" if len(props) > 1 else "")
                A.append(Atome(aid, "phrase", pr, g(aid), bloc=pid, titre=titre if n == 0 else None, premier=n == 0))
                n += 1

    for i, grp in enumerate(rec.get("ingredients") or []):
        groupe(grp, f"ingredients-{i + 1}")
    for n, e in enumerate(rec.get("etapes") or [], 1):
        eid = f"etape-{n}"
        t = {"texte": e["titre"], "graine": g(f"{eid}/titre")} if e.get("titre") else None
        paragraphe(e["texte"], eid, titre=t)
    for p, par in enumerate(rec.get("apres") or []):
        paragraphe(par, f"apres-{p + 1}")
    for i, grp in enumerate(rec.get("extras") or []):
        groupe(grp, f"extra-{i + 1}")
    if rec.get("fin"):
        f = rec["fin"]
        texte = f["texte"] + "".join(f" :{al(c)}:" for c in f.get("croquis") or [])
        A.append(Atome("fin", "fin", texte, g("fin"), bloc="fin"))
    if rec.get("mot"):
        A.append(Atome("mot", "mot", rec["mot"], g("mot"), bloc="mot"))
    if rec.get("signature"):
        A.append(Atome("signature", "signature", rec["signature"], g("signature"), bloc="signature", colle_avant=True))
    return A


def coupure_ok(A: list[Atome], i: int, j: int) -> bool:
    """Peut-on finir la page (commencée à l'atome i) avant l'atome j ?"""
    if j >= len(A):
        return True
    if j <= i:
        return False
    a, b = A[j - 1], A[j]
    if a.colle or b.colle_avant:
        return False
    if a.genre == "ligne" and b.genre == "ligne" and a.bloc == b.bloc:
        avant = 0
        k = j - 1
        while k >= i and A[k].genre == "ligne" and A[k].bloc == a.bloc:
            avant += 1
            k -= 1
        apres = 0
        k = j
        while k < len(A) and A[k].genre == "ligne" and A[k].bloc == a.bloc:
            apres += 1
            k += 1
        if avant < 2 or apres < 2:
            return False
    return True


# =============================================================================================
# Pages
# =============================================================================================
@dataclass
class Gabarits:
    """Descriptions de base des quatre pages possibles (sans les blocs coulés)."""
    slug: str
    rec: dict
    plan: dict
    gauche: dict
    droite: dict
    droite_volant: dict
    recto: dict
    verso: dict
    style: dict = field(default_factory=dict)


def rect_photo(p: dict, cote: str) -> list:
    """Zone `photo` : boîte du tirage tourné de `angle` + place des coins / du scotch, en fractions."""
    import math
    w = float(p.get("largeur", 0.6))  # largeur du tirage (fraction de la largeur de page)
    ratio = float(p.get("ratio", 0.74))  # hauteur / largeur du tirage (bord blanc compris)
    a = math.radians(abs(float(p.get("angle", -2.5))))
    wp, hp = w * MEP.W, w * MEP.W * ratio
    bw = wp * math.cos(a) + hp * math.sin(a)
    bh = hp * math.cos(a) + wp * math.sin(a)
    m = float(p.get("marge", 0.028)) * MEP.W  # coins photo / scotch qui débordent du tirage
    bw, bh = bw + 2 * m, bh + 2 * m
    x = float(p.get("x", 0.07 if cote == "gauche" else 0.24)) * MEP.W
    y = float(p.get("y", 0.035)) * MEP.H
    return [round(x / MEP.W, 5), round(y / MEP.H, 5), round(bw / MEP.W, 5), round(bh / MEP.H, 5)]


def gabarits(rec: dict, plan: dict, papiers: dict) -> Gabarits:
    slug = rec["slug"]
    st = rec.get("style", {})
    main = MAINS.get(st.get("main", "soignee"), st.get("main", "soignee"))
    encre = st.get("encre", "bic")
    G = int(plan.get("graine", st.get("graine", 1)))
    double = plan.get("double", slug)
    f0, f1 = plan["folios"]
    commun = dict(double=double, main=main, encre=encre, recette=slug, serrage_max=int(plan.get("serrage_max", 1)))
    if plan.get("outil"):
        commun["outil"] = plan["outil"]
    ph = plan.get("photo", {})
    rp = rect_photo(ph, "gauche")
    gauche = dict(commun, id=f"{slug}-gauche", cote="gauche", folio=f0, graine=G + 1, gabarit="C",
                  vivants=[{"nom": "photo", "rect": rp}],
                  marges={"haut": round(rp[1] + rp[3] + float(ph.get("blanc", 0.012)), 5)})
    droite = dict(commun, id=f"{slug}-droite", cote="droite", folio=f1, graine=G + 2, gabarit="D")
    vol = plan.get("volant", {})
    rv = vol.get("zone", [0.80, 0.58, 0.2, 0.28])
    rs = vol.get("note", [0.06, 0.862, 0.72, 0.07])
    recto_id, verso_id = f"{slug}-feuillet-recto", f"{slug}-feuillet-verso"
    fe = plan.get("feuillet", {})
    tw, th = fe.get("taille", [0.8, 0.8])
    taille = [int(round(tw * MEP.W)), int(round(th * MEP.H))]  # px entiers : images paires à 2× et 1×
    droite_volant = dict(droite, vivants=[{"nom": "volant", "rect": rv},
                                          {"nom": "suite", "rect": rs, "vivant": False}],
                         volant={"recto": recto_id, "verso": verso_id, "angle": float(vol.get("angle", -7.0)),
                                 "rect": vol.get("rect", [rv[0] + 0.02, rv[1] + 0.025, tw, th])},
                         suite=recto_id)
    pid = fe.get("papier", f"c-{slug}")
    cfg = papiers.get("cahiers", {}).get(pid, {})
    base_f = dict(commun, type="feuillet", taille=taille, papier=pid, xh_facteur=float(fe.get("xh", 0.86)),
                  cote="droite", marges={"haut": float(fe.get("haut", 0.05)), "bas": float(fe.get("bas", 0.04))})
    recto = dict(base_f, id=recto_id, face="recto", dos=verso_id, graine=G + 3, suite=verso_id,
                 grille=PAP.grille_cahier(cfg, taille[0], taille[1], "recto"))
    verso = dict(base_f, id=verso_id, face="verso", dos=recto_id, graine=G + 4,
                 grille=PAP.grille_cahier(cfg, taille[0], taille[1], "verso"))
    return Gabarits(slug, rec, plan, gauche, droite, droite_volant, recto, verso, style=dict(main=main, encre=encre))


def _seg(a: Atome) -> dict:
    return {"texte": a.texte, "graine": a.graine}


def assembler(gab: Gabarits, base: dict, A: list[Atome], tete: list | None = None, fin: list | None = None,
              disposition: str = "ligne") -> dict:
    """Description d'une page : son gabarit + les blocs fabriqués à partir de ses atomes."""
    rec = gab.rec
    blocs = list(tete or [])
    prec = None
    for a in A:
        premier = not blocs
        if a.genre == "titre":
            blocs.append({"type": "titre", "id": "titre", "segments": [_seg(a)], "position": gab.plan.get("titre_position", "fer"),
                          "souligne": rec.get("titreSouligne", "trait"), "avant": 0.0 if premier else 0.5})
        elif a.genre == "groupe-titre":
            blocs.append({"type": "paragraphe", "id": a.id, "segments": [_seg(a)], "alinea": 0.0,
                          "avant": 0.0 if premier else 0.65})
        elif a.genre == "ligne":
            if prec is not None and prec.genre == "ligne" and prec.bloc == a.bloc and blocs and blocs[-1]["type"] == "ingredients":
                blocs[-1]["lignes"].append({"texte": a.texte, "graine": a.graine, "puce": a.puce})
            else:
                avant = 0.0 if premier or (prec is not None and prec.genre == "groupe-titre") else (0.3 if prec and prec.genre == "titre" else 0.4)
                blocs.append({"type": "ingredients", "id": f"{a.bloc}@{a.id.split('/')[-1]}", "disposition": "puces",
                              "graine_puces": graine_atome(gab.slug, f"{a.bloc}/puces"),
                              "avant": avant, "lignes": [{"texte": a.texte, "graine": a.graine, "puce": a.puce}]})
        elif a.genre == "phrase":
            if prec is not None and prec.genre == "phrase" and prec.bloc == a.bloc and blocs and blocs[-1]["type"] in ("etape", "paragraphe") \
                    and blocs[-1].get("source") == a.bloc:
                blocs[-1]["segments"].append(_seg(a))
            else:
                avant = 0.0 if premier else (0.45 if prec is not None and prec.genre in ("ligne", "titre") else
                                             (0.12 if a.titre else 0.3))
                if a.titre:
                    blocs.append({"type": "etape", "id": a.bloc, "source": a.bloc, "titre": a.titre, "segments": [_seg(a)],
                                  "disposition": a.disposition if a.disposition != "auto" else disposition,
                                  "avant": avant, "alinea": 0.0})
                else:
                    blocs.append({"type": "paragraphe", "id": f"{a.bloc}@{a.id.split('/')[-1]}", "source": a.bloc,
                                  "segments": [_seg(a)], "avant": avant,
                                  "alinea": 0.04 if (a.premier and not premier) else 0.0})
        elif a.genre == "fin":
            blocs.append({"type": "paragraphe", "id": "fin", "segments": [_seg(a)], "avant": 0.0 if premier else 0.45,
                          "alinea": 0.05})
        elif a.genre == "mot":
            blocs.append({"type": "mot", "id": "mot", "segments": [_seg(a)], "avant": 0.5})
        elif a.genre == "signature":
            blocs.append({"type": "signature", "id": "signature", "texte": a.texte, "graine": a.graine,
                          "avant": 0.0 if premier else 0.15})
        prec = a
    blocs += list(fin or [])
    d = dict(base, blocs=blocs, atomes=[a.id for a in A])
    return d


def _note_marge(gab: Gabarits) -> list:
    out = []
    for k, n in enumerate(gab.rec.get("notesMarge") or []):
        if n.get("pres", "titre") != "titre":
            continue
        out.append({"type": "annotation", "id": f"note-{k + 1}", "texte": n["texte"],
                    "main": MAINS.get(n.get("main"), n.get("main")) or gab.style["main"],
                    "encre": n.get("encre") or gab.style["encre"],
                    "graine": graine_atome(gab.slug, f"note-{k + 1}"), "pente": -4.0,
                    "places": [{"apres": "titre", "dx": 1.6, "dy": -0.5}, {"apres": "titre", "dx": 1.1, "dy": 0.4},
                               {"au_dessus": "titre", "dx": 0.25, "dy": 1.2}]})
    return out


def _note_suite(gab: Gabarits) -> list:
    s = gab.plan.get("suite", {})
    return [{"type": "annotation", "id": "suite-note", "texte": s.get("texte", "suite sur la feuille"),
             "main": s.get("main", "cecile"), "encre": s.get("encre", "crayon"), "role": "annotation",
             "graine": graine_atome(gab.slug, "suite-note"), "pente": float(s.get("pente", -2.5)), "dans": "suite",
             "aligne": "droite", "sans_parentheses": True,
             "fleche": {"depuis": "fin", "vers_zone": "volant", "fx": 0.16, "fy": 0.8, "courbure": 0.25}}]


def _tete_recto(gab: Gabarits) -> list:
    return [{"type": "paragraphe", "id": "suite-tete", "segments": [{"texte": "(suite)", "graine": graine_atome(gab.slug, "feuillet/suite")}],
             "alinea": 0.0}]


@dataclass
class Resultat:
    pages: dict  # id → description
    ordre: list
    feuillet: bool
    disposition: str
    repartition: dict  # id → atomes
    sondes: int = 0
    duree: float = 0.0


class Paginateur:
    def __init__(self, gab: Gabarits, A: list[Atome], disposition: str):
        self.gab = gab
        self.A = A
        self.disposition = disposition
        self.cache: dict = {}
        self.sondes = 0

    def tient(self, base, i, j, tete=None, fin=None) -> bool:
        cle = (base["id"], bool(base.get("volant")), i, j)
        if cle not in self.cache:
            self.sondes += 1
            d = assembler(self.gab, base, self.A[i:j], tete, fin, self.disposition)
            self.cache[cle] = MEP.tient(MEP.mettre_en_page(d, dessins=False))
        return self.cache[cle]

    def plus_long(self, base, i, tete=None, fin=None) -> int:
        """Plus long préfixe A[i:j] qui tient sur la page et finit sur une coupure permise."""
        n = len(self.A)
        if i >= n:
            return i
        if self.tient(base, i, n, tete, fin):
            return n
        lo, hi = i, n  # tient(lo) (page vide), pas tient(hi)
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if self.tient(base, i, mid, tete, fin):
                lo = mid
            else:
                hi = mid
        j = lo
        while j > i and not (coupure_ok(self.A, i, j) and self.tient(base, i, j, tete, fin)):
            j -= 1
        return j

    def paginer(self) -> Resultat:
        gab, A, n = self.gab, self.A, len(self.A)
        rep = {}
        note = _note_marge(gab)
        j = self.plus_long(gab.gauche, 0, fin=note)
        if j == 0:
            raise Deborde(f"{gab.slug} : rien ne tient sur la page de gauche")
        rep[gab.gauche["id"]] = (gab.gauche, 0, j, None, note)
        i = j
        j = self.plus_long(gab.droite, i)
        if j >= n:
            rep[gab.droite["id"]] = (gab.droite, i, n, None, None)
            return self._resultat(rep, feuillet=False)
        suite = _note_suite(gab)
        j = self.plus_long(gab.droite_volant, i, fin=suite)
        rep[gab.droite["id"]] = (gab.droite_volant, i, j, None, suite)
        i = j
        tete = _tete_recto(gab)
        j = self.plus_long(gab.recto, i, tete=tete)
        rep[gab.recto["id"]] = (gab.recto, i, j, tete, None)
        i = j
        j = self.plus_long(gab.verso, i)
        rep[gab.verso["id"]] = (gab.verso, i, j, None, None)
        if j < n:
            raise Deborde(f"{gab.slug} : {n - j} atome(s) ne tiennent pas (dès « {A[j].id} » : {A[j].texte[:40]}…)")
        return self._resultat(rep, feuillet=True)

    def _resultat(self, rep, feuillet) -> Resultat:
        pages, ordre, repartition = {}, [], {}
        for pid, (base, i, j, tete, fin) in rep.items():
            d = assembler(self.gab, base, self.A[i:j], tete, fin, self.disposition)
            pages[pid] = d
            ordre.append(pid)
            repartition[pid] = [a.id for a in self.A[i:j]]
        if not feuillet:
            gd = self.gab.droite["id"]
            if gd not in pages:
                pages[gd] = assembler(self.gab, self.gab.droite, [], None, None, self.disposition)
                ordre.append(gd)
                repartition[gd] = []
        return Resultat(pages, ordre, feuillet, self.disposition, repartition, self.sondes)


def placer_croquis(gab: Gabarits, res: Resultat):
    """Le petit dessin de la recette : dans le premier blanc assez grand des pages du plan
    (`gauche` = à côté de la photo, `fin` = la dernière page écrite, `droite`…)."""
    noms = gab.rec.get("croquis") or []
    if not noms:
        return
    cfg = gab.plan.get("croquis", {})
    noms_plan = cfg.get("noms", {})
    for k, nom in enumerate(noms):
        variantes = noms_plan.get(nom, [nom])
        if nom not in variantes:
            variantes = [nom] + variantes
        cibles = []
        for p in cfg.get("pages", ["gauche", "fin", "droite"]):
            if p == "fin":
                ecrites = [pid for pid in res.ordre if res.repartition.get(pid)]
                cibles.append(ecrites[-1] if ecrites else res.ordre[-1])
            else:
                cibles.append(f"{gab.slug}-{p}")
        for pid in dict.fromkeys(cibles):
            if pid not in res.pages:
                continue
            d = res.pages[pid]
            pres = cfg.get("pres", {}).get(pid.replace(gab.slug + "-", ""), [0.84, 0.2] if pid.endswith("gauche") else [0.7, 0.85])
            b = {"type": "croquis", "id": f"croquis-{k + 1}", "nom": variantes, "taille": cfg.get("taille", [0.19, 0.19]),
                 "pres": pres, "graine": graine_atome(gab.slug, f"croquis-{k + 1}")}
            essai = dict(d, blocs=d["blocs"] + [b])
            m = MEP.mettre_en_page(essai, dessins=False)
            if MEP.tient(m) and not m.croquis_non_places:
                res.pages[pid] = essai
                break


def paginer(rec: dict, plan: dict, papiers: dict) -> Resultat:
    t0 = time.time()
    for aid, gr in (plan.get("graines") or {}).items():
        SURCHARGES[(rec["slug"], aid)] = int(gr)
    gab = gabarits(rec, plan, papiers)
    A = atomes(rec, (plan.get("croquis") or {}).get("alias"))
    mode = plan.get("etapes", "auto")
    essais = ["ligne", "tete"] if mode == "auto" else [mode]
    err = None
    for disp in essais:
        try:
            res = Paginateur(gab, A, disp).paginer()
            break
        except Deborde as e:
            err = e
    else:
        raise err
    placer_croquis(gab, res)
    res.duree = time.time() - t0
    return res


def charger_plan() -> tuple[dict, dict]:
    plan = json.loads(PLAN.read_text()) if PLAN.exists() else {"recettes": {}}
    papiers = json.loads(PAPIERS.read_text())
    return plan, papiers


def charger_recette(slug: str, plan_r: dict) -> dict:
    src = RACINE / plan_r.get("source", f"src/content/recettes/{slug}.json")
    return json.loads(src.read_text())


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*")
    a = ap.parse_args(argv)
    plan, papiers = charger_plan()
    slugs = a.slugs or list(plan.get("recettes", {}))
    code = 0
    for slug in slugs:
        pr = plan["recettes"][slug]
        rec = charger_recette(slug, pr)
        try:
            res = paginer(rec, pr, papiers)
        except Deborde as e:
            print(f"✗ {e}")
            code = 1
            continue
        SORTIE_DESC.mkdir(parents=True, exist_ok=True)
        print(f"{slug} : {len(res.ordre)} pages, étapes « {res.disposition} », {res.sondes} sondes, {res.duree:.1f} s")
        for pid in res.ordre:
            print(f"  {pid} : {len(res.repartition[pid])} atomes {res.repartition[pid][:1]}…{res.repartition[pid][-1:]}")
            (SORTIE_DESC / f"{pid}.json").write_text(json.dumps(res.pages[pid], indent=1, ensure_ascii=False) + "\n")
    return code


if __name__ == "__main__":
    sys.exit(main())
