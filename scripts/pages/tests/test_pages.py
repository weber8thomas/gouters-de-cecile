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
import json
import math
import re
import shutil
import sys
import tempfile
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
        MEP._BLOCS.clear()
        MEP.CROQUIS_MODULE = CroquisFactice
        MEP._CROQUIS_ETAT.clear()
        CroquisFactice.version = 1
        RC.SURCHARGES.clear()

    def tearDown(self):
        ECR.ecrire_bloc = self._ecrire
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
        vus = [aid for pid in res.ordre for aid in res.repartition[pid]]
        self.assertEqual(vus, ids, "chaque atome une fois, dans l'ordre")
        i = 0
        for pid in res.ordre:
            n = len(res.repartition[pid])
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
        b = self.paginer("longue", photo=dict(plan_test()["photo"], largeur=0.42))  # pagination différente
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

    def cuisine(self, sortie: Path, pages: dict):
        return CU.Cuisine(pages, papiers(), sortie=sortie, apercus_dir=sortie / "apercus", cache=sortie / ".cuisson.json")

    def pages_courtes(self):
        res = RC.paginer(fixture("courte"), plan_test(), papiers())
        return res.pages

    def test_deux_cuissons_memes_octets(self):
        pages = self.pages_courtes()
        sorties = []
        for k in range(2):
            MEP._BLOCS.clear()
            out = self.tmp / f"c{k}"
            c = self.cuisine(out, pages)
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


if __name__ == "__main__":
    unittest.main()
