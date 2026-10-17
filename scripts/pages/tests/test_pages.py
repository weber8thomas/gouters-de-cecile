"""Tests de la cuisson des pages (lot B) : pagination des recettes reçues, feuillet volant, croquis,
déterminisme et cache.

    tools/ecriture/.venv/bin/python -m unittest discover -s scripts/pages/tests -v

Commande unique, depuis la racine du dépôt, sans réseau ni GPU (≈ 1 min). L'écriture générée (N2) est
remplacée par une écriture factice déterministe (des « mots » en zigzag de la largeur de leur texte)
et les croquis du lot C par un module factice : on teste la mise en page, la pagination et la
cuisson, pas le réseau d'écriture. Les fixtures sont des RecetteRecue (src/content/types.ts) :
courte → 2 pages ; longue → + feuillet recto ; très longue → + verso ; trop longue → code 1.
"""
from __future__ import annotations

import copy
import hashlib
import os
import json
import math
import re
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path

ICI = Path(__file__).resolve().parent
PAGES = ICI.parent
sys.path.insert(0, str(PAGES))

import numpy as np  # noqa: E402

import ecriture as ECR  # noqa: E402
import mise_en_page as MEP  # noqa: E402
import recette as RC  # noqa: E402
import cuire as CU  # noqa: E402

FIXTURES = ICI / "fixtures"
RACINE = PAGES.parents[1]


# =============================================================================================
# Écriture et croquis factices
# =============================================================================================
def _graine(*parts) -> int:
    return int(hashlib.sha256("/".join(map(str, parts)).encode()).hexdigest()[:8], 16)


def ecrire_factice(texte, main, graine, encre=None, outil=None, essais=3):
    """Un mot = un zigzag de 0,58 hauteur d'x par caractère (≈ la largeur moyenne des vraies mains)."""
    info = ECR.main_info(main)
    rng = np.random.default_rng(_graine(texte, main, graine))
    lignes = []
    for ligne in texte.split("\n"):
        mots = []
        for k, w in enumerate(ligne.split()):
            larg = 0.58 * len(w) * float(rng.uniform(0.95, 1.05))
            n = max(4, int(larg * 6))
            x = np.linspace(0, larg, n)
            y = -0.5 - 0.45 * np.sin(np.arange(n) * 1.7 + float(rng.uniform(0, 3)))
            T = np.column_stack([x, y, np.full(n, 0.7), np.ones(n), np.full(n, 0.8)])
            mots.append(ECR.Mot(texte=w, traits=[T], largeur=larg, espace_avant=0.0 if k == 0 else 0.9))
        lignes.append(mots)
    return ECR.Bloc(lignes=lignes, main=main, style=info["style"], interligne=info["interligne"], taille=info["taille"],
                    epaisseur=info["epaisseur"], encre=ECR.nuances(encre or "bic", outil), graine=int(graine))


class CroquisFactice:
    """Module de croquis factice (même API que scripts/pages/croquis.py)."""
    version = 1

    @staticmethod
    def disponibles():
        return ["carotte", "cupcake", "carrot-cake", "sourire-lunettes", "citron"]

    @classmethod
    def dessiner(cls, nom, *, boite, encre="feutre", graine=1, lavis=True, **_):
        x, y, w, h = boite
        rng = np.random.default_rng(_graine(nom, graine, cls.version))
        t = np.linspace(0, 2 * math.pi, 24)
        r = 0.4 + 0.02 * cls.version
        trait = [(x + w * (0.5 + r * math.cos(a)), y + h * (0.5 + r * math.sin(a)), 0.7, 1.0, 0.8) for a in t]
        return {"traits": [trait], "lavis": [{"centre": [x + w / 2, y + h / 2], "r": w / 3, "v": cls.version}] if lavis else [],
                "boite": boite, "diam": 1.6, "encre": ECR.nuances(encre), "nom": nom, "graine": int(rng.integers(1e6))}

    @staticmethod
    def transmittance_lavis(lavis, forme, echelle, relief=None, lumiere=None):
        T = np.ones((int(forme[0]), int(forme[1]), 3), np.float32)
        for it in lavis:
            cx, cy = it["centre"]
            r = it["r"] * echelle
            yy, xx = np.ogrid[: T.shape[0], : T.shape[1]]
            m = (xx - cx * echelle) ** 2 + (yy - cy * echelle) ** 2 < r * r
            T[m] *= np.array([0.95, 0.85, 0.75], np.float32)
        return T


def plan_test(**surcharge) -> dict:
    """Plan de cuisson de test : celui de Lisa (photo, coin du feuillet, cahier), folios 10–11."""
    plan = json.loads((RACINE / "src/content/pages/recettes.json").read_text())["recettes"]["lisa"]
    plan = copy.deepcopy(plan)
    plan.pop("graines", None)
    plan.update(surcharge)
    return plan


def papiers() -> dict:
    return json.loads((RACINE / "src/content/pages/papiers.json").read_text())


def fixture(nom: str) -> dict:
    return json.loads((FIXTURES / f"{nom}.json").read_text())


def mots_lisibles(textes) -> list[str]:
    out = []
    for t in textes:
        out += [w for w in re.split(r"\s+", MEP.texte_sans_balises(t)) if w]
    return out


class Base(unittest.TestCase):
    def setUp(self):
        self._ecrire = ECR.ecrire_bloc
        ECR.ecrire_bloc = ecrire_factice
        # relecture de l'encre rendue (lot E, TrOCR) neutralisée : l'écriture est factice
        self._relire = getattr(ECR, "relire_rendu", None)
        ECR.relire_rendu = lambda encre, mots, **kw: []
        MEP._BLOCS.clear()
        MEP.CROQUIS_MODULE = CroquisFactice
        MEP._CROQUIS_ETAT.clear()
        CroquisFactice.version = 1
        RC.SURCHARGES.clear()

    def tearDown(self):
        ECR.ecrire_bloc = self._ecrire
        if self._relire is None:
            del ECR.relire_rendu
        else:
            ECR.relire_rendu = self._relire
        MEP._BLOCS.clear()
        MEP.CROQUIS_MODULE = None
        MEP._CROQUIS_ETAT.clear()


# =============================================================================================
# Pagination
# =============================================================================================
class Pagination(Base):
    def paginer(self, nom, **plan):
        return RC.paginer(fixture(nom), plan_test(**plan), papiers())

    def verifier_coupures(self, res, A):
        """Ni titre (de recette, d'option) en bas de page, ni ingrédient seul de son groupe, ni
        signature séparée, et chaque atome sur exactement une page."""
        ids = [a.id for a in A]
        vus = []
        for pid in res.ordre:  # une phrase coupée entre deux pages (« x~a », « x~b ») compte une fois
            for aid in res.repartition[pid]:
                base = aid.split("~")[0]
                if not (vus and vus[-1] == base and aid.endswith("~b")):
                    vus.append(base)
        self.assertEqual(vus, ids, "chaque atome une fois, dans l'ordre")
        i = 0
        for pid in res.ordre:
            n = len([a for a in res.repartition[pid] if not a.endswith("~b")])
            if res.repartition[pid] and res.repartition[pid][-1].endswith("~a"):
                i += n
                continue
            if n and i + n < len(A):
                self.assertTrue(RC.coupure_ok(A, i, i + n), f"coupure interdite en bas de {pid} : {A[i + n - 1].id}")
                self.assertFalse(A[i + n - 1].colle, f"titre orphelin en bas de {pid}")
            i += n

    def verifier_mots(self, res, rec):
        """Aucun mot perdu : chaque page tient, et tous les mots de la recette sont sur les pages."""
        textes = []
        for pid in res.ordre:
            m = MEP.mettre_en_page(res.pages[pid])
            self.assertEqual(m.deborde, [], pid)
            self.assertEqual(m.non_places, [], pid)
            textes += m.texte
        attendus = mots_lisibles([a.texte for a in RC.atomes(rec)])
        poses = mots_lisibles(textes)
        reste = list(poses)
        for w in attendus:
            self.assertIn(w, reste, f"mot perdu : {w}")
            reste.remove(w)

    def test_courte_deux_pages(self):
        rec = fixture("courte")
        res = self.paginer("courte")
        self.assertFalse(res.feuillet)
        self.assertEqual(res.ordre, ["test-gauche", "test-droite"])
        self.assertNotIn("volant", res.pages["test-droite"])
        self.verifier_coupures(res, RC.atomes(rec))
        self.verifier_mots(res, rec)

    def test_longue_feuillet_recto(self):
        rec = fixture("longue")
        res = self.paginer("longue")
        self.assertTrue(res.feuillet)
        self.assertEqual(res.ordre, ["test-gauche", "test-droite", "test-feuillet-recto", "test-feuillet-verso"])
        self.assertTrue(res.repartition["test-feuillet-recto"])
        self.assertEqual(res.repartition["test-feuillet-verso"], [], "le verso reste blanc")
        d = res.pages["test-droite"]
        self.assertEqual(d["volant"]["recto"], "test-feuillet-recto")
        self.assertIn("volant", [v["nom"] for v in d["vivants"]])
        self.assertEqual(res.pages["test-feuillet-recto"]["type"], "feuillet")
        self.assertEqual(res.pages["test-feuillet-recto"]["blocs"][0]["segments"][0]["texte"], "(suite)")
        self.assertTrue(any(b.get("id") == "suite-note" for b in d["blocs"]), "« suite sur la feuille » en bas de la droite")
        self.verifier_coupures(res, RC.atomes(rec))
        self.verifier_mots(res, rec)

    def test_tres_longue_feuillet_verso(self):
        rec = fixture("tres-longue")
        res = self.paginer("tres-longue")
        self.assertTrue(res.feuillet)
        self.assertTrue(res.repartition["test-feuillet-verso"])
        self.verifier_coupures(res, RC.atomes(rec))
        self.verifier_mots(res, rec)

    def test_trop_longue_deborde(self):
        with self.assertRaises(RC.Deborde):
            self.paginer("trop-longue")

    def test_pas_de_titre_orphelin(self):
        """Une option dont le titre tomberait en bas de page passe entière à la page suivante."""
        rec = fixture("tres-longue")
        A = RC.atomes(rec)
        res = self.paginer("tres-longue")
        for pid in res.ordre:
            ids = res.repartition[pid]
            if ids:
                der = next(a for a in A if a.id == ids[-1])
                self.assertNotIn(der.genre, ("titre", "groupe-titre"), f"{pid} finit sur un titre")
        # et la règle elle-même : un titre d'option seul en bas est refusé
        k = next(i for i, a in enumerate(A) if a.genre == "groupe-titre")
        self.assertFalse(RC.coupure_ok(A, 0, k + 1))
        lignes = [i for i, a in enumerate(A) if a.genre == "ligne" and a.bloc == A[k + 1].bloc]
        self.assertFalse(RC.coupure_ok(A, 0, lignes[0] + 1), "un ingrédient seul en haut d'une page")

    def test_graine_stable_par_atome(self):
        """Déplacer un atome d'une page à l'autre ne change pas son écriture (sa graine)."""
        rec = fixture("longue")
        a = self.paginer("longue")
        b = self.paginer("longue", photo=dict(plan_test()["photo"], largeur=0.62, ratio=0.9))  # pagination différente
        def graines(res):
            out = {}
            for pid in res.ordre:
                for bl in res.pages[pid]["blocs"]:
                    for s in bl.get("segments", []) or []:
                        out.setdefault(s["texte"], set()).add((s["graine"], pid))
                    for l in bl.get("lignes", []) or []:
                        if isinstance(l, dict):
                            out.setdefault(l["texte"], set()).add((l["graine"], pid))
            return out
        ga, gb = graines(a), graines(b)
        self.assertNotEqual(a.repartition, b.repartition, "les deux paginations doivent différer")
        deplaces = 0
        for t in ga:
            if t in gb:
                self.assertEqual({g for g, _ in ga[t]}, {g for g, _ in gb[t]}, t)
                deplaces += {p for _, p in ga[t]} != {p for _, p in gb[t]}
        self.assertGreater(deplaces, 0, "au moins un atome a changé de page")
        for at in RC.atomes(rec):
            self.assertEqual(at.graine, RC.graine_atome("test", at.id))

    def test_feuillet_suit_la_reglure(self):
        """Sur le cahier, chaque ligne de base est posée sur un trait de la réglure (± 0,3 x)."""
        res = self.paginer("tres-longue")
        d = res.pages["test-feuillet-recto"]
        m = MEP.mettre_en_page(d)
        g = d["grille"]
        for L in m.lignes:
            if not L.mots:
                continue
            y = L.y0 - math.tan(math.radians(g["angle"])) * (L.x0 - g["xc"])
            k = (y - g["y0"]) / g["carreau"]
            self.assertLess(abs(k - round(k)) * g["carreau"], 0.32 * L.xh + 0.5)

    def test_rien_sous_les_zones(self):
        res = self.paginer("tres-longue")
        for pid in ("test-gauche", "test-droite"):
            m = MEP.mettre_en_page(res.pages[pid])
            for nom, (a0, b0, a1, b1) in m.vivants.items():
                for w in m.mots:
                    x0, y0, x1, y1 = w.boite
                    self.assertFalse(x0 < a1 and x1 > a0 and y0 < b1 and y1 > b0, f"{pid} : « {w.texte} » sous {nom}")

    def test_puces_croquis(self):
        """Puce = croquis, une même variante de liste, ≈ 1,1 à 1,4 hauteur d'x, sur la ligne de base."""
        res = self.paginer("courte")
        m = MEP.mettre_en_page(res.pages["test-gauche"])
        puces = [c for c in m.croquis if c["role"] == "puce"]
        self.assertTrue(puces)
        self.assertTrue(all(c["dessine"] for c in puces))
        xh = m.xh_de("corps", m.main)
        for c in puces:
            self.assertTrue(1.0 * xh <= c["boite"][3] <= 1.45 * xh, c)
        self.assertEqual(len({c["liste"] for c in puces}), 1)


# =============================================================================================
# Cuisson : déterminisme, cache, croquis manquants, code de sortie
# =============================================================================================
class Cuisson(Base):
    def setUp(self):
        super().setUp()
        self.tmp = Path(tempfile.mkdtemp(prefix="gc-cuisson-"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)
        super().tearDown()

    def cuisine(self, sortie: Path, pages: dict, x4: bool = False, **kw):
        return CU.Cuisine(pages, papiers(), sortie=sortie, apercus_dir=sortie / "apercus", cache=sortie / ".cuisson.json", x4=x4, **kw)

    def pages_courtes(self):
        res = RC.paginer(fixture("courte"), plan_test(), papiers())
        return res.pages

    def test_deux_cuissons_memes_octets(self):
        pages = self.pages_courtes()
        sorties = []
        for k in range(2):
            MEP._BLOCS.clear()
            out = self.tmp / f"c{k}"
            c = self.cuisine(out, pages, x4=LONGS)
            for pid in pages:
                c.cuire(pid)
            sorties.append(out)
        fichiers = sorted(p.relative_to(sorties[0]) for p in sorties[0].rglob("*.webp"))
        self.assertTrue(fichiers)
        for f in fichiers:
            self.assertEqual((sorties[0] / f).read_bytes(), (sorties[1] / f).read_bytes(), str(f))

    def test_changer_un_croquis_invalide_le_cache(self):
        pages = self.pages_courtes()
        c = self.cuisine(self.tmp / "c", pages)
        avant = {pid: c.empreinte_page(pid) for pid in pages}
        MEP._CROQUIS_ETAT.clear()
        CroquisFactice.version = 2  # le lot C redessine ses croquis
        apres = {pid: c.empreinte_page(pid) for pid in pages}
        self.assertNotEqual(avant["test-gauche"], apres["test-gauche"], "la page aux puces-carottes doit être recuite")
        CroquisFactice.version = 1
        MEP._CROQUIS_ETAT.clear()
        self.assertEqual(avant, {pid: c.empreinte_page(pid) for pid in pages})

    def test_croquis_absent_place_reservee(self):
        """Sans module de croquis, la cuisson ne plante pas : la place est réservée, rien n'est dessiné."""
        MEP.CROQUIS_MODULE = False
        MEP._CROQUIS_ETAT.clear()
        res = RC.paginer(fixture("courte"), plan_test(), papiers())
        m = MEP.mettre_en_page(res.pages["test-gauche"])
        self.assertTrue(m.croquis)
        self.assertFalse(any(c["dessine"] for c in m.croquis))
        self.assertEqual(m.lavis, [])

    def test_trop_longue_code_1(self):
        """Une recette qui ne tient pas même avec le feuillet : la cuisson sort en code 1."""
        d = self.tmp / "contenu"
        d.mkdir()
        (d / "papiers.json").write_text(json.dumps(papiers()))
        plan = plan_test(source=str(FIXTURES / "trop-longue.json"), double="test")
        (d / "recettes.json").write_text(json.dumps({"recettes": {"test": plan}}))
        anciens = (CU.DESCRIPTIONS, CU.SORTIE, CU.APERCUS)
        try:
            CU.DESCRIPTIONS, CU.SORTIE, CU.APERCUS = d, self.tmp / "sortie", self.tmp / "apercus"
            self.assertEqual(CU.main([]), 1)
        finally:
            CU.DESCRIPTIONS, CU.SORTIE, CU.APERCUS = anciens


# =============================================================================================
# v4 : bandeau, cadre, titre courant, sommaire et liens, carnet (folios), trou de Lisa, A5, ×4
# =============================================================================================
def page_test(**kw) -> dict:
    d = {"id": "essai-gauche", "double": "essai", "cote": "gauche", "folio": 10, "graine": 7, "main": "soignee", "encre": "bic",
         "blocs": []}
    d.update(kw)
    return d


TEXTE_LONG = ("Fouette les œufs avec le sucre jusqu'à ce que ça blanchisse, ajoute les zestes et le jus des citrons, "
              "puis la farine, la levure, le sel, le pavot et enfin le beurre fondu. ") * 3


def chevauche(a, b) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


class Blocs(Base):
    def test_bandeau_pres_de_la_photo(self):
        """Le prénom en grand (2,2 à 2,8 × la hauteur d'x du corps), souligné, son sous-titre au crayon,
        tout près de la photo et jamais dessus ; la zone est réservée (le texte coule autour)."""
        d = page_test(vivants=[{"nom": "photo", "rect": [0.06, 0.035, 0.5, 0.37]}], marges={"haut": 0.42},
                      blocs=[{"id": "bandeau", "type": "bandeau", "texte": "Lisa", "sous": "depuis Lyon"},
                             {"id": "p", "type": "paragraphe", "texte": TEXTE_LONG}])
        m = MEP.mettre_en_page(d)
        self.assertTrue(MEP.tient(m), (m.deborde, m.non_places))
        self.assertIn("bandeau", m.zones_blocs)
        nom = [w for w in m.mots if w.bloc == "bandeau"]
        sous = [w for w in m.mots if w.bloc == "bandeau-sous"]
        self.assertEqual([w.texte for w in nom], ["Lisa"])
        self.assertEqual([w.texte for w in sous], ["depuis", "Lyon"])
        xh_c = m.xh_de("corps", "soignee")
        self.assertTrue(2.2 * xh_c <= nom[0].xh <= 2.8 * xh_c, nom[0].xh / xh_c)
        self.assertLess(sous[0].xh, nom[0].xh)
        self.assertEqual(sous[0].xh, m.xh_de("legende", "cecile"))
        photo = m.vivants["photo"]
        bx = m.zones_blocs["bandeau"]
        self.assertFalse(chevauche(bx, photo))
        ecart = max(bx[0] - photo[2], photo[0] - bx[2], bx[1] - photo[3], photo[1] - bx[3])
        self.assertLess(ecart, 0.08 * m.W, "la photo et le prénom se lisent ensemble")
        self.assertTrue(any(b[1] > nom[0].base[1] for b in m.marques_boites), "souligné sous le prénom")
        for w in m.mots:
            if w.bloc == "p":
                self.assertFalse(chevauche(w.boite, bx), f"« {w.texte} » sous le prénom")
        self.assertIn("Lisa, depuis Lyon", m.texte)

    def test_bandeau_dessous_si_pas_de_place_a_cote(self):
        d = page_test(vivants=[{"nom": "photo", "rect": [0.12, 0.04, 0.78, 0.35]}],
                      blocs=[{"id": "bandeau", "type": "bandeau", "texte": "Bernard", "sous": "depuis Dijon"}])
        m = MEP.mettre_en_page(d)
        self.assertTrue(MEP.tient(m))
        self.assertGreater(m.zones_blocs["bandeau"][1], m.vivants["photo"][3] - 1)

    def page_cadre(self, style="double", **kw):
        blocs = [{"id": "cadre", "type": "cadre", "style": style, "texte": "Pour toutes nos pauses goûter à refaire le monde. "
                  "Joyeux anniversaire ma Cécile !", "signature": "Julie", "encre": "plume"},
                 {"id": "titre", "type": "titre", "texte": "Le cake citron de Julie"},
                 {"id": "p", "type": "paragraphe", "texte": TEXTE_LONG}]
        return page_test(id="essai-droite", cote="droite", folio=11, blocs=blocs, **kw)

    def test_cadre_reserve_avant_la_recette(self):
        """Le cadre est posé AVANT la recette, en bas de la page droite : le mot, « Pour Cécile » et la
        signature dedans, aucun mot de la recette dans sa zone."""
        m = MEP.mettre_en_page(self.page_cadre())
        self.assertTrue(MEP.tient(m), (m.deborde, m.non_places))
        x0, y0, x1, y1 = m.cadre_rect
        self.assertGreater(y1, 0.85 * m.H, "en bas de page")
        self.assertIn("cadre", [nom for _, nom in m.reserves])
        dedans = [w for w in m.mots if w.bloc.startswith("cadre")]
        self.assertEqual([w.texte for w in dedans if w.bloc == "cadre-titre"], ["Pour", "Cécile"])
        self.assertEqual([w.texte for w in dedans if w.bloc == "cadre-signature"], ["Julie"])
        for w in dedans:
            cx, cy = (w.boite[0] + w.boite[2]) / 2, (w.boite[1] + w.boite[3]) / 2
            self.assertTrue(x0 < cx < x1 and y0 < cy < y1, f"« {w.texte} » hors du cadre")
        zone = m.zones_blocs["cadre"]
        for w in m.mots:
            if not w.bloc.startswith("cadre"):
                self.assertFalse(chevauche(w.boite, zone), f"« {w.texte} » dans le cadre")
        self.assertEqual(m.n_avant, len([L for L in m.lignes[:m.n_avant]]))
        self.assertTrue(any(t.startswith("Pour Cécile : Pour toutes nos pauses") and t.endswith("— Julie") for t in m.texte))

    def test_cadre_deux_styles(self):
        """`double` : deux cadres (8 côtés) ; `ondule` : 4 côtés ondulés et un petit cœur."""
        a = MEP.mettre_en_page(self.page_cadre("double"))
        b = MEP.mettre_en_page(self.page_cadre("ondule"))
        self.assertTrue(MEP.tient(a) and MEP.tient(b))
        import gestes as TR
        rng = np.random.default_rng(1)
        self.assertEqual(len(TR.cadre(0, 0, 300, 120, rng, 16, "double")), 8)
        self.assertEqual(len(TR.cadre(0, 0, 300, 120, rng, 16, "ondule")), 4)
        self.assertEqual(len(TR.coeur(10, 10, 20, rng, 16)), 1)
        self.assertGreater(len(b.marques_boites), 0)

    def test_pas_de_cadre_sans_mot(self):
        """Une recette sans mot (Lisa, `mot: null`) n'a pas de cadre : on n'invente jamais de mot."""
        rec = json.loads((RACINE / "src/content/recettes/lisa.json").read_text())
        self.assertIsNone(rec.get("mot"))
        gab = RC.gabarits(rec, plan_test(), papiers())
        types = [b["type"] for base in (gab.gauche, gab.droite) for b in base.get("blocs_fixes", [])]
        self.assertNotIn("cadre", types)
        self.assertIn("bandeau", types)
        self.assertIn("courant", types)
        rec2 = dict(rec, mot="Un mot pour toi", signature="Lisa")
        gab2 = RC.gabarits(rec2, plan_test(), papiers())
        self.assertIn("cadre", [b["type"] for b in gab2.droite["blocs_fixes"]])
        self.assertNotIn("mot", [a.genre for a in RC.atomes(rec2)], "le mot va dans le cadre, pas dans le texte")

    def test_courant_en_tete(self):
        d = page_test(id="essai-droite", cote="droite", blocs=[{"id": "courant", "type": "courant", "texte": "Julie"},
                                                            {"id": "p", "type": "paragraphe", "texte": TEXTE_LONG}])
        m = MEP.mettre_en_page(d)
        self.assertTrue(MEP.tient(m))
        c = [w for w in m.mots if w.bloc == "courant"]
        self.assertEqual([w.texte for w in c], ["Julie"])
        self.assertLess(c[0].boite[3], 0.08 * m.H)
        self.assertGreater(c[0].boite[0], 0.6 * m.W, "côté extérieur de la page droite")
        self.assertLess(c[0].xh, m.xh_de("corps", "soignee") * 1.01)


class Carnet(Base):
    def test_folios(self):
        """Double page k (0 = titre) → gauche 2k+2, droite 2k+3 ; garde et titre ; sansFolio."""
        f = RC.folios_carnet(RC.charger_carnet())
        attendu = {"garde": 2, "titre": 3, "dedicace": 4, "sommaire": 5, "gateaux-gauche": 6, "colophon": 20, "garde-arriere": 21,
                   "lisa-gauche": 8, "lisa-droite": 9, "julie-gauche": 10, "julie-droite": 11, "biscuits-droite": 13,
                   "rose-gauche": 14, "rose-droite": 15, "mathis-gauche": 16, "mathis-droite": 17, "fin-gauche": 18, "fin-droite": 19}
        for pid, folio in attendu.items():
            self.assertEqual(f[pid]["folio"], folio, pid)
        for pid in ("garde", "titre", "gateaux-gauche", "gateaux-droite", "biscuits-gauche", "biscuits-droite", "colophon",
                    "garde-arriere"):
            self.assertTrue(f[pid]["sansFolio"], pid)
        self.assertFalse(f["lisa-gauche"]["sansFolio"])
        plan = json.loads((RACINE / "src/content/pages/recettes.json").read_text())
        self.assertEqual(plan["recettes"]["lisa"]["folios"], [8, 9])

    def test_descriptions_du_carnet(self):
        """Chaque page du carnet a sa description (ou sa recette) ; les folios sont réalignés."""
        pages, _, plan = CU.charger_descriptions()
        carnet, roster = RC.charger_carnet(), RC.charger_roster()
        pages = CU.appliquer_carnet(pages, carnet, roster)
        recettes = {f"{s}-{c}" for s in plan["recettes"] for c in ("gauche", "droite")}
        for pid, info in RC.folios_carnet(carnet).items():
            self.assertTrue(pid in pages or pid in recettes, pid)
            if pid in pages:
                self.assertEqual(pages[pid]["folio"], info["folio"], pid)

    def test_sans_folio_pas_de_zone(self):
        d = page_test(sansFolio=True, blocs=[{"id": "p", "type": "paragraphe", "texte": "Bonjour"}])
        self.assertNotIn("folio", [nom for _, nom in MEP.Mise(d).reserves])
        self.assertIn("folio", [nom for _, nom in MEP.Mise(page_test()).reserves])

    def test_sommaire_lignes_et_liens(self):
        carnet, roster = RC.charger_carnet(), RC.charger_roster()
        lignes = RC.lignes_sommaire(carnet, roster, titres={"mathis": "Mathis — cookies", "bernard": "Bernard — tarte"})
        ids = {d["id"] for d in carnet["doubles"]}
        par_invite = {l.get("invite"): l for l in lignes if l.get("invite")}
        self.assertEqual(par_invite["lisa"]["folio"], 8)
        self.assertEqual(par_invite["julie"]["folio"], 10)
        self.assertEqual(par_invite["rose"]["folio"], 14)
        self.assertEqual((par_invite["mathis"]["folio"], par_invite["bernard"]["folio"]), (16, 17))
        self.assertEqual(par_invite["bernard"]["cible"], "mathis")
        self.assertEqual([l["texte"] for l in lignes if l.get("chapitre")], ["Gâteaux & cakes", "Biscuits"])
        self.assertTrue(all(l["cible"] in ids for l in lignes))
        # une page de sommaire : chaque ligne donne un lien cliquable dans la page
        d = page_test(id="sommaire", double="sommaire", cote="droite", folio=5, encre="plume",
                      blocs=[{"id": "titre", "type": "titre", "texte": "Sommaire"},
                             {"id": "sommaire", "type": "sommaire", "lignes": lignes}])
        m = MEP.mettre_en_page(d)
        self.assertTrue(MEP.tient(m), m.deborde)
        self.assertEqual(len(m.liens), len(lignes))
        for l, lien in zip(lignes, m.liens):
            self.assertEqual(lien["cible"], l["cible"])
            x0, y0, x1, y1 = lien["rect"]
            self.assertTrue(0 <= x0 < x1 <= m.W and 0 <= y0 < y1 <= m.H)
        folios = [w for w in m.mots if w.texte == "17"]
        self.assertEqual(len(folios), 1)
        # les rects ne se chevauchent pas (une ligne = un lien)
        for a, b in zip(m.liens, m.liens[1:]):
            self.assertLessEqual(a["rect"][3], b["rect"][1] + 2)

    def test_chapitre_genere(self):
        carnet, roster = RC.charger_carnet(), RC.charger_roster()
        d = RC.resoudre_generes(page_test(id="biscuits-droite", blocs=[{"id": "chapitre", "type": "chapitre", "chapitre": "biscuits",
                                                                        "croquis": ["cookie"]}]), carnet, roster)
        b = d["blocs"][0]
        self.assertEqual(b["titre"], "Biscuits")
        self.assertEqual(b["invites"], ["Mamie Rose", "Mathis", "Bernard"])
        m = MEP.mettre_en_page(dict(d, sansFolio=True))
        self.assertTrue(MEP.tient(m))
        self.assertIn("Mamie Rose, Mathis et Bernard", m.texte)


class Lisa(Base):
    def test_sans_trou_ni_mot_perdu(self):
        """La vraie recette de Lisa : aucune page (sauf la dernière) ne laisse plus de 1,5 ligne vide en
        bas, et aucun mot n'est perdu."""
        rec = json.loads((RACINE / "src/content/recettes/lisa.json").read_text())
        plan = json.loads((RACINE / "src/content/pages/recettes.json").read_text())["recettes"]["lisa"]
        res = RC.paginer(rec, plan, papiers())
        ecrites = [pid for pid in res.ordre if res.repartition[pid]]
        A = {a.id: a for a in RC.atomes(rec)}
        suivants = {pid: ecrites[k + 1] for k, pid in enumerate(ecrites[:-1])}
        for pid in ecrites[:-1]:
            m = MEP.mettre_en_page(res.pages[pid])
            self.assertTrue(MEP.tient(m), pid)
            # une nouvelle partie (titre d'option) peut commencer en haut de la page suivante
            prochain = A.get(res.repartition[suivants[pid]][0].split("~")[0])
            if prochain is not None and prochain.genre in ("titre", "groupe-titre"):
                continue
            self.assertLessEqual(MEP.trou_bas(m), RC.TROU_MAX + 1e-6, f"{pid} : trou de {MEP.trou_bas(m):.2f} lignes")
        Pagination.verifier_mots(self, res, rec)

    def test_variantes_du_trou(self):
        """Les réglages pour combler un trou sont essayés dans l'ordre : serrage 2, interligne −4 %,
        marge du folio juste (la zone du folio ne bloque que les lignes qui la touchent)."""
        self.assertEqual([n for n, _ in RC.VARIANTES_TROU], ["serrage 2", "interligne −4 %", "marge du folio juste"])
        large = MEP.Mise(page_test())
        juste = MEP.Mise(page_test(folio_juste=True))
        xh = large.xh_de("corps", "soignee")
        y = 0.94 * large.H - 0.8 * xh  # jambages au-dessus du numéro, corps dans la bande large
        self.assertIsNone(large.plage(y, xh, large.ml, large.xr))
        self.assertIsNotNone(juste.plage(y, xh, juste.ml, juste.xr))
        m = MEP.Mise(page_test(pas_local=0.96))
        self.assertAlmostEqual(m.global_pas, 0.96)


class A5(Base):
    def test_format(self):
        import formats as F
        self.assertEqual(F.A5.px(), (1819, 2551))
        self.assertAlmostEqual(F.A5.W * F.A5.extras["mm_par_px"], 154.0, places=3)
        self.assertAlmostEqual(F.A5.H * F.A5.extras["mm_par_px"], 216.0, places=3)
        self.assertEqual(F.ECRAN.px(), (1700, 1920))
        self.assertEqual(F.rayon(2.0, 2.0), 2.0)
        self.assertEqual(F.rayon(2.0, 4.0), 4.0)

    def pages_julie(self):
        import formats as F
        pages, papiers_, plan = CU.charger_descriptions()
        carnet, roster = RC.charger_carnet(), RC.charger_roster()
        pages = CU.appliquer_carnet(pages, carnet, roster)
        return RC.pages_a5("julie", pages, plan, papiers_, carnet, roster, F.A5)

    def test_julie_recto_verso(self):
        """Recto : prénom, photo, début de la recette ; verso : la suite, le mot encadré, la zone du QR
        (26 mm + zone calme) et « Scanne-moi pour voir ma vidéo »."""
        import formats as F
        res = self.pages_julie()
        self.assertEqual(res.ordre[:2], ["julie-a5-recto", "julie-a5-verso"])
        recto = MEP.mettre_en_page(res.pages["julie-a5-recto"])
        verso = MEP.mettre_en_page(res.pages[res.ordre[-1]])
        self.assertTrue(MEP.tient(recto) and MEP.tient(verso), (recto.deborde, verso.deborde, verso.non_places))
        self.assertIn("photo", recto.vivants)
        self.assertIn("bandeau", recto.zones_blocs)
        self.assertIn("titre", [w.bloc for w in recto.mots])
        self.assertIn("qr", verso.vivants)
        self.assertIn("cadre", verso.zones_blocs)
        mm = F.A5.extras["mm_par_px"]
        x0, y0, x1, y1 = verso.vivants["qr"]
        self.assertAlmostEqual((x1 - x0) * mm, 28, delta=0.5)
        self.assertTrue(any("Scanne-moi" in t for t in verso.texte))
        # la page rognée garde 850 px de référence et le texte reste à 3 mm au moins de la coupe
        for m in (recto, verso):
            fp = F.A5.fond_perdu
            for w in m.mots:
                self.assertGreater(w.boite[0], fp + 3 / mm, w.texte)
                self.assertLess(w.boite[2], m.W - fp - 3 / mm, w.texte)
        # aucun mot perdu entre l'écran et l'A5
        ecran = []
        for pid in ("julie-gauche", "julie-droite"):
            ecran += [w for w in re.split(r"\s+", " ".join(MEP.mettre_en_page(res_pages_ecran(pid)).texte)) if w]
        a5 = [w for pid in res.ordre for w in re.split(r"\s+", " ".join(MEP.mettre_en_page(res.pages[pid]).texte)) if w]
        for w in ecran:
            self.assertIn(w.strip("()"), " ".join(a5), f"« {w} » perdu en A5")


def res_pages_ecran(pid):
    pages, _, _ = CU.charger_descriptions()
    return CU.appliquer_carnet(pages, RC.charger_carnet(), RC.charger_roster())[pid]


LONGS = os.environ.get("GC_TESTS_LONGS") == "1"  # passe ×4 et A5 cuits (reportés : prototype d'abord)


class CuissonV4(Base):
    def setUp(self):
        super().setUp()
        self.tmp = Path(tempfile.mkdtemp(prefix="gc-cuisson-v4-"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)
        super().tearDown()

    @unittest.skipUnless(LONGS, "passe ×4 reportée (GC_TESTS_LONGS=1 pour la tester)")
    def test_tuiles_4x(self):
        """Passe ×4 : 4 tuiles WebP (2 × 2, 4 px de recouvrement) qui couvrent toute la page ; le
        manifeste les décrit en fractions de page."""
        from PIL import Image
        pages = {"essai-droite": page_test(id="essai-droite", cote="droite", folio=11,
                                           blocs=[{"id": "p", "type": "paragraphe", "texte": "Four à th. 6 (180 °C)."}])}
        c = CU.Cuisine(pages, papiers(), sortie=self.tmp, apercus_dir=self.tmp / "ap", cache=self.tmp / ".c.json", x4=True)
        man = c.cuire("essai-droite")
        e = man["encre4x"]
        self.assertEqual(e["base"], "pages/4x/essai-droite")
        self.assertEqual(len(e["tuiles"]), 4)
        W4, H4 = e["px"]
        self.assertEqual((W4, H4), (3400, 3840))
        aire = 0.0
        for r, c_, x, y, w, h in e["tuiles"]:
            im = Image.open(self.tmp / "4x" / f"essai-droite-{r}{c_}.webp")
            self.assertEqual(im.mode, "RGBA")
            self.assertEqual(im.size, (round(w * W4), round(h * H4)))
            aire += w * h
            if c_:
                self.assertAlmostEqual(x * W4, W4 / 2 - 4, places=3)
            if r:
                self.assertAlmostEqual(y * H4, H4 / 2 - 4, places=3)
        self.assertGreater(aire, 1.0)  # recouvrement
        self.assertLess(aire, 1.01)

    def test_douteux_important_code_1(self):
        """Un mot important mal relu sur l'encre rendue (relire_rendu du lot E) fait sortir en code 1 ;
        un mot ordinaire douteux reste un avertissement."""
        pages = {"essai-droite": page_test(id="essai-droite", cote="droite", folio=11,
                                           blocs=[{"id": "p", "type": "paragraphe", "texte": "Cuire 40 min, bonne dégustation."}])}
        ancien = ECR.relire_rendu
        try:
            ECR.relire_rendu = lambda rgba, mots, **kw: [{"texte": "40 min", "mots": [1, 2], "lu": "4 min", "important": True}]
            c = CU.Cuisine(pages, papiers(), sortie=self.tmp, apercus_dir=self.tmp / "ap", cache=self.tmp / ".c.json", x4=False)
            man = c.cuire("essai-droite")
            self.assertEqual(man["douteux_importants"], ["40 min"])
            self.assertEqual(CU.bilan({"essai-droite": man}, ["essai-droite"], [], {}, time.time()), 1)
            ECR.relire_rendu = lambda rgba, mots, **kw: []
            c2 = CU.Cuisine(pages, papiers(), sortie=self.tmp / "b", apercus_dir=self.tmp / "ap", cache=self.tmp / "b.json", x4=False)
            man2 = c2.cuire("essai-droite")
            self.assertNotIn("douteux_importants", man2)
            man2["douteux"] = ["dégustation"]
            self.assertEqual(CU.bilan({"essai-droite": man2}, ["essai-droite"], [], {}, time.time()), 0)
        finally:
            ECR.relire_rendu = ancien

    def test_mots_places_pour_la_relecture(self):
        """Les mots passés à relire_rendu : boîte (x, y, l, h) en px de l'image, drapeau important ; ni
        icônes ni mots barrés."""
        d = page_test(id="essai-droite", cote="droite", folio=11,
                      blocs=[{"id": "p", "type": "paragraphe", "texte": "~~150 g~~>{120 g} de sucre :citron:"}])
        c = CU.Cuisine({"essai-droite": d}, papiers(), sortie=self.tmp, cache=self.tmp / ".c.json", x4=False)
        mots = c.mots_places(c.mise("essai-droite"))
        textes = [m["texte"] for m in mots]
        self.assertNotIn(":citron:", textes)
        self.assertEqual(textes.count("150"), 0, "le mot barré n'est pas relu")
        self.assertIn("120", textes)
        m120 = mots[textes.index("120")]
        self.assertTrue(m120["important"])
        self.assertEqual(len(m120["boite"]), 4)
        self.assertGreater(m120["boite"][2], 0)

    @unittest.skipUnless(LONGS, "format A5 reporté (GC_TESTS_LONGS=1 pour le tester)")
    def test_cuisson_a5(self):
        """Format A5 : image composée 1819 × 2551 (JPEG, fond perdu compris), photo et QR réservés."""
        import formats as F
        from PIL import Image
        res = A5.pages_julie(self)
        c = CU.Cuisine(res.pages, papiers(), sortie=self.tmp, apercus_dir=self.tmp / "ap", cache=self.tmp / ".c.json", fmt=F.A5)
        man = c.cuire("julie-a5-verso")
        with Image.open(self.tmp / "julie-a5-verso.jpg") as im:
            self.assertEqual(im.size, (1819, 2551))
        self.assertIn("qr", man["vivants"])
        self.assertEqual(man["deborde"], [])
        self.assertEqual(man["face"], "verso")


class Livre(Base):
    """Le carnet entier (src/content/carnet.json) se met en page : chaque page existe, tient (aucun
    débordement, aucune annotation non placée) et écrit tous ses mots."""

    @staticmethod
    def jetons(textes) -> list[str]:
        out = []
        for t in textes:
            out += re.findall(r"[0-9A-Za-zÀ-ÖØ-öø-ÿœŒæÆ'’]+", MEP.texte_sans_balises(t).lower().replace("’", "'"))
        return out

    def test_toutes_les_pages_tiennent(self):
        pages, papiers_, plan = CU.charger_descriptions()
        carnet, roster = RC.charger_carnet(), RC.charger_roster()
        pages = CU.appliquer_carnet(pages, carnet, roster)
        gen, err = CU.paginer_recettes(plan, papiers_, {}, "test", "test", False, [], None, carnet, roster)
        self.assertEqual(err, [])
        pages.update(gen)
        pages = CU.ajouter_contextes(pages, plan)
        for pid in RC.folios_carnet(carnet):
            self.assertIn(pid, pages, f"page du carnet sans description : {pid}")
        for pid, d in sorted(pages.items()):
            m = MEP.mettre_en_page(d)
            self.assertEqual(m.deborde, [], pid)
            self.assertEqual(m.non_places, [], pid)
            ecrits = self.jetons(m.texte)
            for w in self.jetons(CU.textes_page(d)):
                self.assertIn(w, ecrits, f"{pid} : « {w} » perdu")
                ecrits.remove(w)


if __name__ == "__main__":
    unittest.main()
