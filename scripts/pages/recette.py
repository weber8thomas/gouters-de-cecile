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
CARNET = RACINE / "src/content/carnet.json"
ROSTER = RACINE / "src/content/roster.json"
SORTIE_DESC = RACINE / "verification/out/b/pages"
TROU_MAX = 1.5  # lignes de blanc tolérées en bas d'une page qui n'est pas la dernière de la recette
MOT_A_VENIR = "mot à venir"  # cadre d'un invité sans mot (`mot: null`) : écrit au crayon de Cécile
LIGNES_MOT_A_VENIR = 3  # même hauteur de cadre qu'un mot de trois lignes

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
    genre: str  # titre | groupe-titre | ligne | phrase | cuisson | fin | mot | signature
    texte: str
    graine: int
    bloc: str = ""  # bloc logique (groupe d'ingrédients, étape, paragraphe)
    puce: str | None = None
    titre: dict | None = None  # étape : segment « Étape n » porté par la 1re phrase
    colle: bool = False  # ne peut pas finir une page (titre)
    colle_avant: bool = False  # ne peut pas commencer une page (signature)
    disposition: str = "auto"  # étape : titre sur sa ligne (ligne), en tête de paragraphe (tete), ou choix de la page (auto)
    premier: bool = True  # premier atome de son bloc (alinéa possible)
    opts: dict = field(default_factory=dict)  # réglages du bloc d'origine (page décrite à la main : correction…)


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


def atomes(rec: dict, alias: dict | None = None, cadre: bool | None = None) -> list[Atome]:
    """`alias` : nom de croquis du contenu → nom du croquis dessiné (😎 « lunettes-soleil » →
    « sourire-lunettes », choix de l'utilisatrice). `cadre` (défaut : la recette a un mot) : le mot
    pour Cécile et la signature vont dans le cadre (bloc posé avant la recette), pas dans le texte."""
    if cadre is None:
        cadre = bool(rec.get("mot"))
    alias = alias or {}
    al = lambda n: alias.get(n, n) if n else n  # noqa: E731
    slug = rec["slug"]
    g = lambda aid: graine_atome(slug, aid)  # noqa: E731
    A: list[Atome] = []
    A.append(Atome("titre", "titre", rec["titre"], g("titre"), bloc="titre", colle=True))
    for i, texte in enumerate(rec.get("details") or [], 1):
        A.append(Atome(f"detail-{i}", "groupe-titre", texte, g(f"detail-{i}"), bloc="details", colle=True))

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
        if rec.get("style", {}).get("police") and not grp.get("lignes") and grp.get("paragraphes"):
            # L'introduction reçue de Lise reste une citation, distincte de sa liste d'ingrédients.
            for p, par in enumerate(grp["paragraphes"]):
                paragraphe(f"« {par} »", f"ingredients-{i + 1}/paragraphe-{p + 1}")
            continue
        if rec.get("style", {}).get("police") and not any(a.id == "section-ingredients" for a in A):
            A.append(Atome("section-ingredients", "section", "Ingrédients", g("section-ingredients"), colle=True))
        if rec.get("style", {}).get("police"):
            # Les lignes regroupées de Clémence/Pierrette deviennent une vraie liste. Les virgules
            # dans une parenthèse restent intactes ; les textes reçus ne sont jamais modifiés.
            lignes = []
            for l in grp.get("lignes") or []:
                morceaux = re.split(r",\s*(?![^()]*\))", l["texte"])
                lignes += [dict(l, texte=t.strip(), puce="point") for t in morceaux if t.strip()]
            grp = dict(grp, lignes=lignes)
        groupe(grp, f"ingredients-{i + 1}")
    if rec.get("style", {}).get("police") and rec.get("etapes"):
        A.append(Atome("section-preparation", "section", "Préparation", g("section-preparation"), colle=True))
    for n, e in enumerate(rec.get("etapes") or [], 1):
        eid = f"etape-{n}"
        t = {"texte": e["titre"], "graine": g(f"{eid}/titre")} if e.get("titre") else None
        paragraphe(e["texte"], eid, titre=t)
    # cuisson (optionnelle) : sa propre ligne, après les étapes. Texte seul → label « Cuisson : » ajouté ;
    # `{ "titre", "texte" }` → le titre du carnet (« Étape 6 ») est gardé, mot pour mot.
    if rec.get("cuisson"):
        c = rec["cuisson"] if isinstance(rec["cuisson"], dict) else {"texte": rec["cuisson"]}
        t = c.get("titre") or "Cuisson :"
        A.append(Atome("cuisson", "cuisson", c["texte"], g("cuisson"), bloc="cuisson",
                       titre={"texte": t, "graine": g("cuisson/titre")}))
    for p, par in enumerate(rec.get("apres") or []):
        paragraphe(par, f"apres-{p + 1}")
    for i, grp in enumerate(rec.get("extras") or []):
        groupe(grp, f"extra-{i + 1}")
    if rec.get("fin"):
        f = rec["fin"]
        texte = f["texte"] + "".join(f" :{al(c)}:" for c in f.get("croquis") or [])
        A.append(Atome("fin", "fin", texte, g("fin"), bloc="fin"))
    if rec.get("mot") and not cadre:
        A.append(Atome("mot", "mot", rec["mot"], g("mot"), bloc="mot"))
    if rec.get("signature") and not cadre:
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


# =============================================================================================
# Carnet (src/content/carnet.json) : ordre, folios, sommaire, intercalaires ; roster
# =============================================================================================
def charger_carnet(chemin: Path | None = None) -> dict:
    f = chemin or CARNET
    return json.loads(f.read_text()) if f.exists() else {"doubles": []}


def charger_roster(chemin: Path | None = None) -> dict:
    f = chemin or ROSTER
    return json.loads(f.read_text()) if f.exists() else {"guests": [], "chapters": []}


def pages_double(d: dict) -> tuple[str, str]:
    p = d.get("pages") or {}
    return p.get("gauche", f"{d['id']}-gauche"), p.get("droite", f"{d['id']}-droite")


def folios_carnet(carnet: dict) -> dict:
    """id de page → {folio, double, cote, sansFolio} : double page k (0 = titre) → gauche 2k+2,
    droite 2k+3 (CONTRACT § 13)."""
    out = {}
    for k, d in enumerate(carnet.get("doubles", [])):
        g, dr = pages_double(d)
        for cote, pid, folio in (("gauche", g, 2 * k + 2), ("droite", dr, 2 * k + 3)):
            out[pid] = {"folio": folio, "double": d["id"], "cote": cote, "sansFolio": bool(d.get("sansFolio", False))}
    return out


def invite_info(slug: str, roster: dict) -> dict:
    return next((g for g in roster.get("guests", []) if g.get("slug") == slug), {})


def nom_invite(slug: str, roster: dict, rec: dict | None = None) -> str:
    """Le nom tel que l'invité signe sa page (« Mamie Rose ») : RecetteRecue.nom, sinon le prénom."""
    if rec and rec.get("nom"):
        return rec["nom"]
    g = invite_info(slug, roster)
    return g.get("firstName") or slug.capitalize()


def sous_titre(slug: str, roster: dict, rec: dict | None = None) -> str | None:
    """« depuis Lyon » : RecetteRecue.sousTitre, sinon la ville du roster (rien si elle est vide)."""
    if rec and rec.get("sousTitre"):
        return rec["sousTitre"]
    ville = invite_info(slug, roster).get("city")
    return f"depuis {ville}" if ville else None


def lignes_sommaire(carnet: dict, roster: dict, chapitres=None, fin: bool = True, titres: dict | None = None) -> list:
    """Lignes du sommaire, générées depuis l'ordre du carnet : titre de chaque chapitre (lien vers son
    intercalaire), puis ses invités « Prénom — recette » avec le folio de leur page ; la double page
    finale à la fin. `chapitres` : ids des chapitres à garder (une page de sommaire peut n'en porter
    qu'une partie) ; `titres` : texte imposé pour un invité (doubles pages partagées)."""
    titres = titres or {}
    out, chap = [], None
    for k, d in enumerate(carnet.get("doubles", [])):
        t = d.get("type")
        if t == "intercalaire":
            chap = d.get("chapitre", d["id"])
            if chapitres is None or chap in chapitres:
                out.append({"texte": d.get("titre", chap), "chapitre": True, "cible": d["id"], "id_chapitre": chap})
            continue
        if t in ("titre", "sommaire"):
            continue
        if t == "finale":
            chap = None
            if fin:
                out.append({"texte": d.get("titre", "Fin"), "folio": 2 * k + 2, "cible": d["id"], "avant": 0.9})
            continue
        if chapitres is not None and chap not in chapitres:
            continue
        invites = d.get("invites", [])
        for j, slug in enumerate(invites):
            if slug in titres:
                texte = titres[slug]
            elif len(invites) == 1 and d.get("titre"):
                texte = d["titre"]
            else:
                texte = nom_invite(slug, roster)
            out.append({"texte": texte, "folio": 2 * k + 2 + (1 if j else 0), "cible": d["id"], "invite": slug})
    return out


def nom_carnet(slug: str, double: dict, roster: dict) -> str:
    """Le nom d'un invité tel que le carnet l'écrit : « Mamie Rose » pour la double page « Mamie Rose —
    Sablés » (un seul invité), sinon son prénom du roster."""
    titre = double.get("titre", "")
    if len(double.get("invites") or []) == 1 and " — " in titre:
        return titre.split(" — ")[0].strip()
    return nom_invite(slug, roster)


def invites_chapitre(carnet: dict, roster: dict, chapitre: str) -> list[str]:
    noms, chap = [], None
    for d in carnet.get("doubles", []):
        if d.get("type") == "intercalaire":
            chap = d.get("chapitre", d["id"])
            continue
        if d.get("type") == "finale":
            chap = None
        if chap == chapitre:
            noms += [nom_carnet(s, d, roster) for s in d.get("invites", [])]
    return noms


def resoudre_generes(desc: dict, carnet: dict, roster: dict) -> dict:
    """Blocs générés depuis le carnet : `sommaire` (`lignes` absentes → depuis carnet.json, filtrées
    par `chapitres`), `chapitre` (`titre`, `invites` absents → depuis le carnet et le roster)."""
    blocs = []
    change = False
    for b in desc.get("blocs", []):
        if b.get("type") == "sommaire" and "lignes" not in b:
            b = dict(b, lignes=lignes_sommaire(carnet, roster, b.get("chapitres"), b.get("fin", True), b.get("titres")))
            change = True
        elif b.get("type") == "chapitre" and b.get("chapitre"):
            dd = next((d for d in carnet.get("doubles", []) if d.get("chapitre") == b["chapitre"]), {})
            if "titre" not in b:
                b = dict(b, titre=dd.get("titre", b["chapitre"]))
            if "invites" not in b:
                b = dict(b, invites=invites_chapitre(carnet, roster, b["chapitre"]))
            change = True
        blocs.append(b)
    return dict(desc, blocs=blocs) if change else desc


def contexte_recette(rec: dict) -> dict:
    """Contexte des mots importants (lot E, importants.important) : les lignes d'ingrédients de la
    recette (ses ingrédients et ses options) ; les mêmes pour la pagination et pour la cuisson."""
    lignes = []
    for g in (rec.get("ingredients") or []) + (rec.get("extras") or []):
        lignes += [l.get("texte", "") if isinstance(l, dict) else str(l) for l in g.get("lignes") or []]
    return {"ingredients": sorted(set(l for l in lignes if l))} if lignes else {}


def gabarits(rec: dict, plan: dict, papiers: dict, roster: dict | None = None) -> Gabarits:
    slug = rec["slug"]
    st = rec.get("style", {})
    main = MAINS.get(st.get("main", "soignee"), st.get("main", "soignee"))
    encre = st.get("encre", "bic")
    G = int(plan.get("graine", st.get("graine", 1)))
    double = plan.get("double", slug)
    f0, f1 = plan["folios"]
    roster = charger_roster() if roster is None else roster
    commun = dict(double=double, main=main, encre=encre, recette=slug, serrage_max=int(plan.get("serrage_max", 1)))
    if st.get("police"):
        commun["police"] = st["police"]
    ctx = contexte_recette(rec)
    if ctx:
        commun["contexte_importants"] = ctx
    if plan.get("outil"):
        commun["outil"] = plan["outil"]
    if plan.get("ecriture"):  # taille, epaisseur de l'écriture (mise_en_page : « ecriture » d'une page)
        commun["ecriture"] = plan["ecriture"]
    ph = plan.get("photo", {})
    rp = rect_photo(ph, "gauche")
    nom = nom_invite(slug, roster, rec)
    fixes_g, fixes_d = [], []
    if plan.get("bandeau", True):
        bd = {"type": "bandeau", "id": "bandeau", "texte": nom, "graine": graine_atome(slug, "bandeau")}
        sous = sous_titre(slug, roster, rec)
        if sous:
            bd.update(sous=sous, sous_graine=graine_atome(slug, "bandeau/sous"))
        bd.update(plan.get("bandeau") if isinstance(plan.get("bandeau"), dict) else {})
        fixes_g.append(bd)
    if plan.get("courant", True):
        fixes_d.append({"type": "courant", "id": "courant", "texte": nom, "graine": graine_atome(slug, "courant")})
    # le mot pour Cécile vit dans le cadre, sous le prénom du bandeau, à droite de la photo (page gauche)
    cadre_plan = plan.get("cadre") if isinstance(plan.get("cadre"), dict) else {}
    if rec.get("mot"):
        cd = {"type": "cadre", "id": "cadre", "texte": rec["mot"], "signature": rec.get("signature") or nom,
              "graine": graine_atome(slug, "mot"), "signature_graine": graine_atome(slug, "signature")}
        cd.update(cadre_plan)
    else:
        # pas de mot (`mot: null`) : un cadre de même taille, « mot à venir » au crayon de Cécile.
        # On n'écrit jamais de mot à la place de l'invité.
        cd = {"type": "cadre", "id": "cadre", "texte": MOT_A_VENIR, "main": "cecile", "encre": "crayon",
              "graine": graine_atome(slug, "mot"), "lignes_min": LIGNES_MOT_A_VENIR}
        cd.update({k: v for k, v in cadre_plan.items() if k not in ("texte", "signature", "main", "encre", "lignes_min")})
    cd.setdefault("style", "double")
    cd["position"] = "bandeau"
    fixes_g.append(cd)
    gauche = dict(commun, id=f"{slug}-gauche", cote="gauche", folio=f0, graine=G + 1, gabarit="C",
                  vivants=[{"nom": "photo", "rect": rp}],
                  marges={"haut": round(rp[1] + rp[3] + float(ph.get("blanc", 0.012)), 5)}, blocs_fixes=fixes_g)
    droite = dict(commun, id=f"{slug}-droite", cote="droite", folio=f1, graine=G + 2, gabarit="D", blocs_fixes=fixes_d)
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
    # aquarelles vivantes du plan ({page: gauche|droite, nom, rect, aquarelle, anime, angle}) : zones
    # réservées comme la photo, l'encre passe autour. `bande` : le texte s'arrête au-dessus du dessin, sur
    # toute la largeur jusqu'au bas de la page (ou jusqu'à la note « suite ») : pas de bout de phrase
    # orphelin sous les dessins
    for aq in plan.get("aquarelles", []):
        v = {k: x for k, x in aq.items() if k not in ("page", "bande")}
        for d in [gauche] if aq.get("page") == "gauche" else [droite, droite_volant]:
            zones = [v]
            if aq.get("bande"):
                y = v["rect"][1]
                bas = rs[1] - 0.005 if d is droite_volant else 1.0
                zones.append({"nom": f"{v['nom']}-bande", "rect": [0.0, y, 1.0, round(bas - y, 5)], "vivant": False})
            d["vivants"] = d.get("vivants", []) + zones
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
    # « atome » : pour inscrire une graine choisie à la relecture dans le plan (scripts/pages/reparer.py)
    return {"texte": a.texte, "graine": a.graine, "atome": a.id}


def assembler(gab: Gabarits, base: dict, A: list[Atome], tete: list | None = None, fin: list | None = None,
              disposition: str = "ligne") -> dict:
    """Description d'une page : son gabarit + les blocs fabriqués à partir de ses atomes."""
    rec = gab.rec
    blocs = list(base.get("blocs_fixes", [])) + list(tete or [])
    n_fixes = len(base.get("blocs_fixes", []))
    prec = None
    for a in A:
        premier = len(blocs) <= n_fixes
        if a.genre == "titre":
            blocs.append({"type": "titre", "id": "titre", "segments": [_seg(a)], "position": gab.plan.get("titre_position", "fer"),
                          "souligne": rec.get("titreSouligne", "trait"), "avant": 0.0 if premier else 0.5})
        elif a.genre == "groupe-titre":
            blocs.append({"type": "paragraphe", "id": a.id, "segments": [_seg(a)], "alinea": 0.0,
                          "avant": 0.0 if premier else 0.65})
        elif a.genre == "section":
            blocs.append({"type": "paragraphe", "id": a.id, "segments": [_seg(a)], "alinea": 0.0,
                          "avant": 0.0 if premier else 0.65, "echelle": 1.1})
        elif a.genre == "ligne":
            if prec is not None and prec.genre == "ligne" and prec.bloc == a.bloc and blocs and blocs[-1]["type"] == "ingredients":
                blocs[-1]["lignes"].append({"texte": a.texte, "graine": a.graine, "puce": a.puce, "atome": a.id})
            else:
                avant = 0.0 if premier or (prec is not None and prec.genre == "groupe-titre") else (0.3 if prec and prec.genre == "titre" else 0.4)
                blocs.append({"type": "ingredients", "id": f"{a.bloc}@{a.id.split('/')[-1]}", "disposition": "puces",
                              "graine_puces": graine_atome(gab.slug, f"{a.bloc}/puces"),
                              "avant": avant, "lignes": [{"texte": a.texte, "graine": a.graine, "puce": a.puce, "atome": a.id}]})
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
        elif a.genre == "cuisson":
            # « Cuisson : » (ou le titre de la recette) : sur sa ligne quand il y en a un, comme une étape
            avant = 0.0 if premier else 0.45
            if a.titre:
                blocs.append({"type": "paragraphe", "id": "cuisson-titre", "segments": [a.titre], "avant": avant,
                              "alinea": 0.0})
                avant = 0.0
            blocs.append({"type": "paragraphe", "id": "cuisson", "segments": [_seg(a)], "avant": avant, "alinea": 0.0})
        elif a.genre == "fin":
            blocs.append({"type": "paragraphe", "id": "fin", "segments": [_seg(a)], "avant": 0.0 if premier else 0.45,
                          "alinea": 0.05})
        elif a.genre == "mot":
            blocs.append({"type": "mot", "id": "mot", "segments": [_seg(a)], "avant": 0.5})
        elif a.genre == "signature":
            blocs.append({"type": "signature", "id": "signature", "texte": a.texte, "graine": a.graine,
                          "avant": 0.0 if premier else 0.15})
        if a.opts and blocs and blocs[-1] is not None and len(blocs) > n_fixes:
            for k, v in a.opts.items():
                blocs[-1].setdefault(k, v)
        prec = a
    blocs += list(fin or [])
    d = dict(base, blocs=blocs, atomes=[a.id for a in A])
    d.pop("blocs_fixes", None)
    return d


def _note_marge(gab: Gabarits) -> list:
    out = []
    for k, n in enumerate(gab.rec.get("notesMarge") or []):
        if n.get("pres", "titre") != "titre":
            continue
        # Les conseils personnels restent distincts des instructions, sans modifier leur source.
        texte = n["texte"].strip()
        if not (texte.startswith("«") and texte.endswith("»")):
            texte = f"« {texte} »"
        out.append({"type": "annotation", "id": f"note-{k + 1}", "texte": texte, "sans_parentheses": True,
                    "main": MAINS.get(n.get("main"), n.get("main")) or gab.style["main"],
                    "encre": n.get("encre") or gab.style["encre"],
                    "graine": graine_atome(gab.slug, f"note-{k + 1}"), "pente": -4.0,
                    # Garder les placements validés avant d'essayer les replis pour les notes longues.
                    "places": [{"au_dessus": "titre", "dx": 0.5, "dy": 3.0}, {"au_dessus": "titre", "dx": 0.5, "dy": 2.2},
                               {"au_dessus": "titre", "dx": 0.5, "dy": 4.0}, {"au_dessus": "titre", "dx": 0.5, "dy": 5.0},
                               {"au_dessus": "titre", "dx": 0.56, "dy": 3.0}, {"apres": "titre", "dx": 1.6, "dy": -0.5},
                               {"apres": "titre", "dx": 1.1, "dy": 0.4}, {"au_dessus": "titre", "dx": 0.25, "dy": 1.2},
                               {"au_dessus": "titre", "dx": 0.0, "dy": 1.2}, {"au_dessus": "titre", "dx": 0.0, "dy": 2.2},
                               {"au_dessus": "titre", "dx": 0.0, "dy": 3.0},
                               # Sinon la note reste entière en marge basse, au-dessus du folio. La sonde
                               # de pagination garde moins d'atomes ici et fait suivre le reste, sans le couper.
                               {"x": 0.065, "y": 0.91}, {"x": 0.065, "y": 0.88}, {"x": 0.065, "y": 0.85}]})
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
    ajustements: dict = field(default_factory=dict)  # id → réglage pris pour combler un trou
    trous: dict = field(default_factory=dict)  # id → blanc en bas de page (lignes)


# Trou en bas d'une page (plus de TROU_MAX lignes libres alors que la recette continue) : on essaie,
# dans l'ordre et en cumulant, de resserrer davantage les dernières lignes, de serrer l'interligne de
# la page de 4 %, puis de ne laisser la zone du folio bloquer que les lignes qui la touchent vraiment.
VARIANTES_TROU = [
    ("serrage 2", {"serrage_max": 2}),
    ("interligne −4 %", {"serrage_max": 2, "pas_local": 0.96}),
    ("marge du folio juste", {"serrage_max": 2, "pas_local": 0.96, "folio_juste": True}),
]


class Paginateur:
    def __init__(self, gab: Gabarits, A: list[Atome], disposition: str):
        self.gab = gab
        self.A = A
        self.disposition = disposition
        self.cache: dict = {}
        self.mises: dict = {}
        self.sondes = 0
        self.ajustements: dict = {}
        self.trous: dict = {}

    @staticmethod
    def _cle(base, i, j):
        return (base["id"], bool(base.get("volant")), base.get("serrage_max"), base.get("pas_local"),
                bool(base.get("folio_juste")), i, j)

    def tient(self, base, i, j, tete=None, fin=None) -> bool:
        cle = self._cle(base, i, j)
        if cle not in self.cache:
            self.sondes += 1
            d = assembler(self.gab, base, self.A[i:j], tete, fin, self.disposition)
            m = MEP.mettre_en_page(d, dessins=False)
            self.cache[cle] = MEP.tient(m)
            self.mises[cle] = m
        return self.cache[cle]

    def trou(self, base, i, j, tete=None, fin=None) -> float:
        self.tient(base, i, j, tete, fin)
        return MEP.trou_bas(self.mises[self._cle(base, i, j)])

    def remplir(self, base, i, tete=None, fin=None):
        """Plus long préfixe ; si la page laisse plus de TROU_MAX lignes vides en bas alors que la
        recette continue, essaie les VARIANTES_TROU (dans l'ordre) et garde la première qui comble le
        trou (sinon celle qui fait tenir le plus d'atomes). → (base retenue, j)."""
        j = self.plus_long(base, i, tete, fin)
        if j >= len(self.A) or j <= i:
            return base, j
        t = self.trou(base, i, j, tete, fin)
        self.trous[base["id"]] = round(t, 2)
        if t <= TROU_MAX:
            return base, j
        meilleur = (base, j, t, None)
        for nom, opts in VARIANTES_TROU:
            b2 = dict(base)
            for k, v in opts.items():
                if k == "serrage_max":
                    v = max(int(base.get("serrage_max") or 1), v)
                b2[k] = v
            j2 = self.plus_long(b2, i, tete, fin)
            if j2 <= meilleur[1]:
                continue
            t2 = self.trou(b2, i, j2, tete, fin) if j2 < len(self.A) else 0.0
            meilleur = (b2, j2, t2, nom)
            if t2 <= TROU_MAX:
                break
        if meilleur[2] > TROU_MAX and meilleur[1] < len(self.A):
            coupe = self.couper_phrase(meilleur[0], i, meilleur[1], tete, fin)
            if coupe is not None:
                j2 = meilleur[1] + 1
                t2 = self.trou(meilleur[0], i, j2, tete, fin)
                meilleur = (meilleur[0], j2, t2, (meilleur[3] + " + " if meilleur[3] else "") + f"phrase coupée ({coupe})")
        if meilleur[3]:
            self.ajustements[base["id"]] = meilleur[3]
            self.trous[base["id"]] = round(meilleur[2], 2)
        return meilleur[0], meilleur[1]

    def couper_phrase(self, base, i, j, tete=None, fin=None):
        """Trou en bas de page et la suite est une phrase : elle est coupée entre deux mots (au moins
        deux de chaque côté), le début finit la page et la fin ouvre la suivante, comme dans un vrai
        carnet. Le début garde la graine de la phrase (même écriture), la fin a la sienne.
        → nombre de mots gardés sur la page, ou None."""
        a = self.A[j]
        if a.genre not in ("phrase", "fin") or a.colle:
            return None
        mots = a.texte.split()
        if len(mots) < 4 or re.search(r"~~|__|\^\{", a.texte):
            return None
        lo, hi = 1, len(mots) - 1  # lo : nb de mots (insuffisant ou non testé) ; on cherche le plus grand qui tient
        ok = None
        A0 = list(self.A)
        while lo < hi:
            k = (lo + hi + 1) // 2
            if k < 2 or len(mots) - k < 2:
                hi = k - 1
                continue
            essai = A0[:j] + [Atome(a.id + "~a", a.genre, " ".join(mots[:k]), a.graine, bloc=a.bloc, titre=a.titre,
                                    premier=a.premier, opts=dict(a.opts))] + A0[j + 1:]
            self.A = essai
            self.cache.clear()
            self.mises.clear()
            if self.tient(base, i, j + 1, tete, fin):
                ok, lo = k, k
            else:
                hi = k - 1
        self.A = A0
        self.cache.clear()
        self.mises.clear()
        if ok is None:
            return None
        g2 = graine_atome(self.gab.slug, a.id + "~b")
        self.A = A0[:j] + [Atome(a.id + "~a", a.genre, " ".join(mots[:ok]), a.graine, bloc=a.bloc, titre=a.titre, premier=a.premier,
                                 opts=dict(a.opts)),
                           Atome(a.id + "~b", a.genre, " ".join(mots[ok:]), g2, bloc=a.bloc, titre=None, premier=False,
                                 opts=dict(a.opts))] + A0[j + 1:]
        self.cache.clear()
        self.mises.clear()
        return ok

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
        gab = self.gab
        rep = {}
        note = _note_marge(gab)
        bg, j = self.remplir(gab.gauche, 0, fin=note)
        if j == 0:
            raise Deborde(f"{gab.slug} : rien ne tient sur la page de gauche")
        rep[gab.gauche["id"]] = (bg, 0, j, None, note)
        i = j
        j = self.plus_long(gab.droite, i)
        if j >= len(self.A):
            rep[gab.droite["id"]] = (gab.droite, i, j, None, None)
            return self._resultat(rep, feuillet=False)
        suite = _note_suite(gab)
        bd, j = self.remplir(gab.droite_volant, i, fin=suite)
        rep[gab.droite["id"]] = (bd, i, j, None, suite)
        i = j
        tete = _tete_recto(gab)
        br, j = self.remplir(gab.recto, i, tete=tete)
        rep[gab.recto["id"]] = (br, i, j, tete, None)
        i = j
        j = self.plus_long(gab.verso, i)
        rep[gab.verso["id"]] = (gab.verso, i, j, None, None)
        if j < len(self.A):
            raise Deborde(f"{gab.slug} : {len(self.A) - j} atome(s) ne tiennent pas (dès « {self.A[j].id} » : {self.A[j].texte[:40]}…)")
        return self._resultat(rep, feuillet=True)

    def paginer_suite(self, bases: list, note=None) -> Resultat:
        """Coulage sur une suite de pages (feuille A5 : recto, verso, pages en plus) : chacune prend le
        plus long préfixe qui tient (trou en bas comblé comme ailleurs). Deborde s'il reste des atomes."""
        rep, i = {}, 0
        for k, base in enumerate(bases):
            fin = note if k == 0 else None
            if k == len(bases) - 1:
                j = self.plus_long(base, i, fin=fin)
                b2 = base
            else:
                b2, j = self.remplir(base, i, fin=fin)
            if k == 0 and j == 0 and self.A:
                raise Deborde(f"{self.gab.slug} : rien ne tient sur {base['id']}")
            rep[base["id"]] = (b2, i, j, None, fin)
            i = j
        if i < len(self.A):
            raise Deborde(f"{self.gab.slug} : {len(self.A) - i} atome(s) ne tiennent pas sur {len(bases)} pages (dès « {self.A[i].id} »)")
        return self._resultat(rep, feuillet=False, completer=False)

    def _resultat(self, rep, feuillet, completer=True) -> Resultat:
        # remplir() peut couper une phrase et ajouter un atome : aucune tranche ne doit
        # être oubliée, répétée ou arrêtée à une ancienne longueur de self.A.
        couverts = [k for _, i, j, _, _ in rep.values() for k in range(i, j)]
        if couverts != list(range(len(self.A))):
            raise Deborde(f"{self.gab.slug} : pagination incomplète ({len(couverts)}/{len(self.A)} atomes)")
        pages, ordre, repartition = {}, [], {}
        for pid, (base, i, j, tete, fin) in rep.items():
            d = assembler(self.gab, base, self.A[i:j], tete, fin, self.disposition)
            pages[pid] = d
            ordre.append(pid)
            repartition[pid] = [a.id for a in self.A[i:j]]
        if not feuillet and completer:
            gd = self.gab.droite["id"]
            if gd not in pages:
                pages[gd] = assembler(self.gab, self.gab.droite, [], None, None, self.disposition)
                ordre.append(gd)
                repartition[gd] = []
        return Resultat(pages, ordre, feuillet, self.disposition, repartition, self.sondes,
                        ajustements=dict(self.ajustements), trous=dict(self.trous))


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


def paginer(rec: dict, plan: dict, papiers: dict, roster: dict | None = None) -> Resultat:
    t0 = time.time()
    for aid, gr in (plan.get("graines") or {}).items():
        SURCHARGES[(rec["slug"], aid)] = int(gr)
    gab = gabarits(rec, plan, papiers, roster)
    A = atomes(rec, (plan.get("croquis") or {}).get("alias"))
    mode = "tete" if rec.get("style", {}).get("police") else plan.get("etapes", "auto")
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


# =============================================================================================
# Feuille A5 (impression) : recto (prénom, photo, début de la recette), verso (suite, mot encadré,
# QR), pages en plus si besoin — formats.A5, 148 × 210 mm + 3 mm de fond perdu
# =============================================================================================
def depuis_pages(slug: str, descs: list[dict]):
    """Pages d'invité décrites à la main → (pseudo RecetteRecue, atomes, cadre, noms de croquis) pour
    les repaginer (A5). Les réglages de chaque bloc (correction en rouge de Cécile, insertion au
    crayon…) suivent ses atomes."""
    d0 = descs[0]
    rec = {"slug": slug, "style": {"main": d0.get("main", "soignee"), "encre": d0.get("encre", "bic"),
                                   "graine": int(d0.get("graine", 1))}, "notesMarge": [], "croquis": []}
    A: list[Atome] = []
    g = lambda aid: graine_atome(slug, aid)  # noqa: E731
    cadre, croquis = {}, []
    titre_vu = False

    def opts_de(b, desc):
        o = {k: b[k] for k in ("correction", "insertion", "souligne_encre", "main", "encre", "outil") if k in b}
        if desc.get("main") != rec["style"]["main"]:
            o.setdefault("main", desc.get("main"))
        if desc.get("encre") != rec["style"]["encre"]:
            o.setdefault("encre", desc.get("encre"))
        if desc.get("outil") and "outil" not in o:
            o["outil"] = desc["outil"]
        return o

    def paragraphe(texte, pid, opts):
        n = 0
        for k, ph in enumerate(phrases(texte)):
            props = propositions(ph)
            for j, pr in enumerate(props):
                aid = f"{pid}/phrase-{k + 1}" + (f".{j + 1}" if len(props) > 1 else "")
                A.append(Atome(aid, "phrase", pr, g(aid), bloc=pid, premier=n == 0, opts=dict(opts)))
                n += 1

    for desc in descs:
        for b in desc.get("blocs", []):
            t = b["type"]
            bid = f"{desc['id']}/{b.get('id', t)}"
            texte = b.get("texte") or " ".join(x["texte"] for x in b.get("segments") or [])
            o = opts_de(b, desc)
            if t == "bandeau":
                rec["nom"] = b["texte"]
                if b.get("sous"):
                    rec["sousTitre"] = b["sous"]
            elif t == "cadre":
                # A5 : le mot reste encadré en bas du verso (la position « bandeau » est celle du carnet écran)
                cadre = {k: v for k, v in b.items() if k != "position"}
            elif t == "titre":
                if not titre_vu:
                    A.append(Atome("titre", "titre", texte, g("titre"), bloc="titre", colle=True, opts=o))
                    rec["titre"] = texte
                    rec["titreSouligne"] = b.get("souligne", "trait")
                    titre_vu = True
                else:
                    A.append(Atome(bid, "groupe-titre", texte, g(bid), bloc=bid, colle=True, opts=o))
            elif t == "ingredients":
                if b.get("intro"):
                    paragraphe(b["intro"], bid + "/intro", o)
                for k, l in enumerate(b.get("lignes") or []):
                    tl = l["texte"] if isinstance(l, dict) else l
                    A.append(Atome(f"{bid}/ligne-{k + 1}", "ligne", tl, g(f"{bid}/ligne-{k + 1}"), bloc=bid, puce=None, opts=o))
                    rec.setdefault("ingredients_lignes", []).append(tl)
            elif t in ("paragraphe", "note", "suite"):
                paragraphe(texte, bid, o)
            elif t == "etape":
                paragraphe(texte, bid, o)
            elif t == "mot":
                cadre.setdefault("texte", texte)
                for k in ("encre", "main", "outil"):
                    if k in b:
                        cadre.setdefault(k, b[k])
            elif t == "signature":
                cadre.setdefault("signature", b["texte"])
            elif t == "annotation":
                rec["notesMarge"].append({"texte": texte, "main": b.get("main"), "encre": b.get("encre"), "pres": "titre"})
            elif t == "croquis":
                croquis.append(b["nom"] if isinstance(b["nom"], list) else [b["nom"]])
    return rec, A, cadre, croquis


def _mm(v: float, fmt) -> float:
    return float(v) / fmt.extras["mm_par_px"]


def gabarits_a5(slug: str, rec: dict, fmt, papier: str, photo_ratio: float, cadre: dict | None, n_pages: int,
                roster: dict, qr: bool = True) -> list[dict]:
    """Descriptions de base des pages A5 d'un invité (sans les blocs coulés). Fractions de la page
    AVEC fond perdu ; la page rognée garde 850 px de référence de large (formats.A5)."""
    W, H, fp = fmt.W, fmt.H, fmt.fond_perdu
    Hr = H - 2 * fp  # hauteur rognée
    st = rec.get("style", {})
    main = MAINS.get(st.get("main", "soignee"), st.get("main", "soignee"))
    encre = st.get("encre", "bic")
    G = int(st.get("graine", 1))
    xh = getattr(fmt, "xh_facteur", 1.0)
    commun = dict(format="a5", taille=fmt.taille(), main=main, encre=encre, invite=slug, sansFolio=True, zone_folio=False,
                  xh_facteur=xh, xh_min=round(MEP.XH_MIN / MEP.W * xh, 6), papier=papier, serrage_max=2)
    if rec.get("ingredients"):
        commun["recette"] = slug
    ctx = contexte_recette(rec) or ({"ingredients": sorted(set(rec["ingredients_lignes"]))} if rec.get("ingredients_lignes") else {})
    if ctx:
        commun["contexte_importants"] = ctx
    fx = lambda v: round((fp + v) / W, 5)  # noqa: E731
    fy = lambda v: round((fp + v) / H, 5)  # noqa: E731
    reliure, exterieur, tete, pied = 0.085 * 850, 0.06 * 850, 0.05 * Hr, 0.05 * Hr
    pages = []
    for k in range(n_pages):
        face = "recto" if k % 2 == 0 else "verso"
        cote = "droite" if face == "recto" else "gauche"  # recto : reliure à gauche
        pid = f"{slug}-a5-{face}" if k < 2 else f"{slug}-a5-{k + 1}"
        mg, md = (reliure, exterieur) if cote == "droite" else (exterieur, reliure)
        d = dict(commun, id=pid, cote=cote, face=face, ordre=k + 1, graine=G + 11 + k,
                 marges={"gauche": fx(mg) - 0.0, "droite": round((fp + md) / W, 5), "haut": fy(tete), "bas": round((fp + pied) / H, 5)},
                 blocs_fixes=[], vivants=[])
        # la feuille : recto et verso se voient par transparence
        if k % 2 == 0 and k + 1 < n_pages:
            d["dos"] = f"{slug}-a5-verso" if k == 0 else f"{slug}-a5-{k + 2}"
        elif k % 2 == 1:
            d["dos"] = f"{slug}-a5-recto" if k == 1 else f"{slug}-a5-{k}"
        if k >= 2:
            d["papier"] = f"{papier}-{k // 2 + 1}"
        if k == 0:
            # photo collée en haut, côté extérieur ; le prénom à côté
            pw = 0.5 * 850
            ph = pw / photo_ratio
            x = 850 - exterieur - pw + 0.01 * 850
            y = tete - 0.01 * Hr
            d["vivants"] = [{"nom": "photo", "rect": [fx(x), fy(y), round(pw / W, 5), round(ph / H, 5)]}]
            d["marges"]["haut"] = fy(y + ph + 0.022 * Hr)
            nom = nom_invite(slug, roster, rec)
            bd = {"type": "bandeau", "id": "bandeau", "texte": nom, "graine": graine_atome(slug, "bandeau"), "taille": 2.5,
                  "places": ["cote", "dessous"]}
            sous = sous_titre(slug, roster, rec)
            if sous:
                bd.update(sous=sous, sous_graine=graine_atome(slug, "bandeau/sous"))
            d["blocs_fixes"].append(bd)
        if k == n_pages - 1:
            fixes = []
            if cadre and cadre.get("texte"):
                cd = {kk: v for kk, v in cadre.items() if kk not in ("x", "y", "_")}
                cd.update(type="cadre", id="cadre", largeur=0.56, bas=round((fp + pied) / H + 0.004, 5))
                cd.setdefault("graine", graine_atome(slug, "mot"))
                cd.setdefault("signature_graine", graine_atome(slug, "signature"))
                fixes.append(cd)
            if qr:
                # QR de 26 mm (+ zone calme) côté extérieur en bas, « Scanne-moi… » au crayon dessous
                qw, qh = _mm(28, fmt), _mm(28, fmt)
                bw, bh = _mm(32, fmt), _mm(42, fmt)
                x = exterieur if cote == "gauche" else 850 - exterieur - bw
                y = Hr - pied - bh
                d["vivants"].append({"nom": "qr", "rect": [fx(x + (bw - qw) / 2), fy(y), round(qw / W, 5), round(qh / H, 5)]})
                fixes.append({"type": "etiquette", "id": "qr-legende", "texte": "Scanne-moi pour voir ma vidéo",
                              "main": "cecile", "encre": "crayon", "graine": graine_atome(slug, "qr"), "interligne": 0.78,
                              "rect": [fx(x - 0.01 * 850), fy(y + qh + _mm(1.5, fmt)), round((bw + 0.02 * 850) / W, 5),
                                       round((bh - qh - _mm(1.5, fmt)) / H, 5)]})
                if cadre and cadre.get("texte"):
                    fixes[0]["largeur"] = round(min(0.56, (850 - reliure - exterieur - bw - 0.04 * 850) / W), 4)
                    fixes[0]["x"] = round((fp + (exterieur + bw + 0.035 * 850 if cote == "gauche" else reliure)) / W, 5)
            d["blocs_fixes"] += fixes
        pages.append(d)
    return pages


def pages_a5(slug: str, pages_ecran: dict, plan: dict, papiers: dict, carnet: dict, roster: dict, fmt) -> Resultat:
    """Repagine le contenu d'un invité pour une feuille A5 recto-verso (pages en plus si besoin)."""
    t0 = time.time()
    k, double = next(((k, d) for k, d in enumerate(carnet.get("doubles", [])) if slug in (d.get("invites") or [])), (None, None))
    if double is None:
        raise Deborde(f"{slug} : absent de carnet.json")
    invites = double["invites"]
    j = invites.index(slug)
    folio_d = 2 * k + 3
    papier = f"f{folio_d}"
    recettes = plan.get("recettes", {})
    cfg_croquis = {}
    if slug in recettes:
        pr = recettes[slug]
        for aid, gr in (pr.get("graines") or {}).items():
            SURCHARGES[(slug, aid)] = int(gr)
        rec = charger_recette(slug, pr)
        A = atomes(rec, (pr.get("croquis") or {}).get("alias"), cadre=True)
        cadre = {"texte": rec["mot"], "signature": rec.get("signature") or nom_invite(slug, roster, rec),
                 "style": (pr.get("cadre") or {}).get("style", "double")} if rec.get("mot") else None
        rp = rect_photo(pr.get("photo", {}), "gauche")
        ratio = (rp[2] * MEP.W) / (rp[3] * MEP.H)
        cfg_croquis = dict(pr.get("croquis") or {})
        etapes = pr.get("etapes", "auto")
    else:
        g, d = pages_double(double)
        ids = [g, d] if len(invites) == 1 else [[g, d][min(j, 1)]]
        descs = [pages_ecran[i] for i in ids if i in pages_ecran]
        if not descs:
            raise Deborde(f"{slug} : pages {ids} introuvables")
        rec, A, cadre, noms_croquis = depuis_pages(slug, descs)
        ph = next((v["rect"] for dd in descs for v in dd.get("vivants", []) if v.get("nom") == "photo"), [0, 0, 0.6, 0.42])
        ratio = (ph[2] * MEP.W) / (ph[3] * MEP.H)
        if noms_croquis:
            rec["croquis"] = [n[0] for n in noms_croquis]
            cfg_croquis = {"noms": {n[0]: n for n in noms_croquis}}
        etapes = "tete"
    cfg_croquis.update(pages=["a5-verso", "fin", "a5-recto"], taille=[0.2, 0.18])
    cfg_croquis.setdefault("pres", {"a5-verso": [0.7, 0.25], "a5-recto": [0.75, 0.8]})
    plan_a5 = {"croquis": cfg_croquis, "titre_position": "fer"}
    err = None
    for n_pages in (2, 3, 4):
        bases = gabarits_a5(slug, rec, fmt, papier, ratio, cadre, n_pages, roster)
        gab = Gabarits(slug, rec, plan_a5, bases[0], bases[-1], bases[-1], bases[-1], bases[-1],
                       style=dict(main=bases[0]["main"], encre=bases[0]["encre"]))
        for disp in (["ligne", "tete"] if etapes == "auto" else [etapes]):
            try:
                res = Paginateur(gab, A, disp).paginer_suite(bases, note=_note_marge(gab))
                placer_croquis(gab, res)
                res.duree = time.time() - t0
                return res
            except Deborde as e:
                err = e
    raise err


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
