"""Tests du lot E (écriture fiable) : mots importants, validation du contenu, encre sans saut sur les
mots importants, encre « bille-bleue », et le chemin TrOCR réel (tolérance zéro, relecture du rendu).

    tools/ecriture/.venv/bin/python -m unittest discover -s scripts/pages/tests -v
    tools/ecriture/.venv/bin/python -m unittest scripts/pages/tests/test_importants.py -v

Le chemin TrOCR écrit pour de vrai (réseau d'écriture + relecteur, CPU) un petit échantillon :
« 40 min » (main soignée, encre rouge : la correction de Cécile sur la page de Julie). À froid
(cache de tools/ecriture/.cache vide) il faut une minute environ ; ensuite quelques secondes. Il est
sauté si le relecteur (vendor/trocr) n'est pas installé.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ICI = Path(__file__).resolve().parent
PAGES = ICI.parent
RACINE = PAGES.parents[1]
sys.path.insert(0, str(PAGES))

import numpy as np  # noqa: E402

import ecriture as ECR  # noqa: E402
import importants as IMP  # noqa: E402

sys.path.insert(0, str(RACINE / "tools/ecriture"))
import encre as ENC  # noqa: E402
import lecteur as LEC  # noqa: E402


# =============================================================================================
# important()
# =============================================================================================
class Important(unittest.TestCase):
    def test_nombres_et_signes(self):
        for t in ["180", "(180", "4", "40", "250g", "1h,", "175°", "5/6).", "½", "°C).", "°", "12"]:
            self.assertTrue(IMP.important(t), t)

    def test_unites(self):
        for t in ["g", "kg", "mg", "cl", "ml", "l", "dl", "cm", "mm", "min", "min.", "h", "°C", "c.", "s.",
                  "càs", "càc", "th.", "g,"]:
            self.assertTrue(IMP.important(t), t)

    def test_unites_de_la_mise_en_page(self):
        """Toute unité de mise_en_page.UNITES (lot P) est une unité ici aussi."""
        import mise_en_page as MEP
        for u in MEP.UNITES:
            self.assertTrue(IMP.important(u), u)

    def test_noms(self):
        for t in ["Lisa", "Julie", "Bernard,", "Cécile", "Cécile !", "cecile", "Mamie", "Rose", "Élise", "Noé", "Léa"]:
            self.assertTrue(IMP.important(t), t)
        self.assertTrue(IMP.important("Thomas", {"noms": ["Thomas"]}))
        self.assertFalse(IMP.important("Thomas"))

    def test_ingredients(self):
        for t in ["farine", "farine,", "sucre", "beurre", "œufs", "œuf", "d'huile", "l'huile", "lait", "levure",
                  "sel", "chocolat", "vanille", "cannelle", "citrons", "carottes", "noix", "crème", "miel", "pommes"]:
            self.assertTrue(IMP.important(t), t)
        ctx = {"ingredients": ["2 cuillères de spéculoos", "1 sachet de levure chimique"]}
        self.assertTrue(IMP.important("spéculoos", ctx))
        self.assertFalse(IMP.important("spéculoos"))
        for vide in ["cuillères", "sachet", "chimique", "de"]:
            self.assertFalse(IMP.important(vide, ctx), vide)

    def test_contexte_recette(self):
        rec = {"ingredients": [{"lignes": [{"texte": "120g de noix concassées"}, {"texte": "2 cuillères de tonka"}]}]}
        self.assertTrue(IMP.important("tonka", {"recette": rec}))
        self.assertFalse(IMP.important("tonka"))
        self.assertFalse(IMP.important("concassées", {"recette": rec}))

    def test_mots_ordinaires(self):
        for t in ["Joyeux", "anniversaire", "de", "à", "le", "four", "Mélanger", "q", "l'", "jusqu'à", ""]:
            self.assertFalse(IMP.important(t), t)


# =============================================================================================
# verifier_contenu()
# =============================================================================================
class VerifierContenu(unittest.TestCase):
    INTERDITS = [
        "180^{g} de farine",  # lettre (unité) collée à un nombre
        "250 g de farin^{e}",  # lettre ajoutée à un ingrédient
        "180 ^{g} de beurre",  # unité ajoutée à côté d'un nombre
        "fari~~m~~>{n}e",  # rature partielle d'un ingrédient
        "~~farin~~>{farine}",  # correction qui ajoute la lettre manquante
        "~~180~~>{180 g}",  # correction qui ajoute l'unité manquante
        "Cé^{c}ile",  # lettre ajoutée à un nom
        "4 ~~°~~>{°C}",  # rature partielle d'une unité ? (collée à rien, mais ajoute l'unité)
        "grosses ~~carrières~~>{carottes})",  # coquille corrigée (deux formes du même mot)
        "une bel^{l}e pomme",  # fausse faute dans un mot ordinaire
        "~~maison~~>{masion}",
    ]
    PERMIS = [
        "1 pincée de sel^{ et 1 de cannelle}",  # une phrase ajoutée (ajout de Rose)
        "~~150 g~~>{120 g} de sucre",  # remplacement complet d'une quantité (Cécile)
        "~~45 min~~>{40 min} au four",
        "~~150 g~~>{125 g} de beurre bien froid",
        "une ~~belle~~>{jolie} pomme",  # un mot remplacé par un autre
        "~~pomme~~>{poire}",
        "~~oups~~ 250 g de farine",  # rature sans correction
        "__Étape 1__ : mélanger",
        "Four à th. 6 (180 °C).",
    ]

    def test_interdits(self):
        for t in self.INTERDITS:
            self.assertTrue(IMP.verifier_contenu(t), f"devrait être refusé : {t}")

    def test_permis(self):
        for t in self.PERMIS:
            self.assertEqual(IMP.verifier_contenu(t), [], t)

    def test_message_dit_le_mot_important(self):
        e = IMP.verifier_contenu("180^{g} de farine")
        self.assertEqual(len(e), 1)
        self.assertIn("mot important", e[0])
        self.assertIn("180g", e[0])

    def test_cli_code_1(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "x.json"
            f.write_text(json.dumps({"ingredients": [{"lignes": [{"texte": "180^{g} de farine"}]}]}))
            self.assertEqual(IMP.main([str(f)]), 1)
            f.write_text(json.dumps({"ingredients": [{"lignes": [{"texte": "180 g de farine"}]}]}))
            self.assertEqual(IMP.main([str(f)]), 0)


# =============================================================================================
# Encre : bille-bleue, aucun saut de bille sur un mot important
# =============================================================================================
def _mot_rapide(n=400):
    """Un long trait rapide (vitesse 2) : la bille y saute souvent."""
    x = np.linspace(0, 12, n)
    return np.column_stack([x, 0.2 * np.sin(x * 3), np.full(n, 0.7), np.full(n, 2.0)]).tolist()


class Encre(unittest.TestCase):
    def test_bille_bleue(self):
        self.assertIn("bille-bleue", ENC.ENCRES)
        b = ENC.ENCRES["bille-bleue"]
        self.assertEqual(b["outil"], "bille")
        bic = ENC.ENCRES["bic"]
        bleu = lambda c: ENC._hex(c)[2] - ENC._hex(c)[0]  # noqa: E731
        self.assertGreater(bleu(b["charge"]), bleu(bic["charge"]), "plus bleue que bic")
        self.assertGreater(bleu(b["clair"]), bleu(b["charge"]) - 5, "déliés plus froids")
        self.assertLess(ENC._hex(b["charge"]).mean(), 70, "un vrai bleu-noir, pas un bleu vif")
        n = ECR.nuances("bille-bleue")
        self.assertEqual((n["charge"], n["outil"]), (b["charge"], "bille"))

    def _encrer(self, imp_a: bool, imp_b: bool):
        res = {"style": "ado", "lignes": [{"mots": [
            {"texte": "40", "important": imp_a, "traits": [_mot_rapide()]},
            {"texte": "four", "important": imp_b, "traits": [_mot_rapide()]},
        ]}]}
        ENC.encrer(res, "bille-bleue", None, 2611)
        return [np.asarray(m["traits"][0]) for m in res["lignes"][0]["mots"]]

    def test_pas_de_saut_sur_un_mot_important(self):
        a_protege, b = self._encrer(True, False)
        e_a, e_b = a_protege[:, 4], b[:, 4]
        self.assertLess(e_b.min(), 0.45, "la bille saute sur un mot ordinaire")
        self.assertGreater(e_a.min(), 0.55, "aucun saut sur un mot important")
        # les tirages sont les mêmes : l'encre des autres mots ne change pas
        a_libre, b2 = self._encrer(False, False)
        np.testing.assert_array_equal(b, b2)
        self.assertLess(a_libre[:, 4].min(), 0.45)
        # hors des sauts, l'encre du mot protégé est celle qu'il aurait eue (pression, nuance)
        sans_saut = a_libre[:, 4] > 0.6
        np.testing.assert_allclose(a_protege[sans_saut, 4], a_libre[sans_saut, 4])
        np.testing.assert_allclose(a_protege[:, 2], a_libre[:, 2])

    def test_drapeau_par_trait(self):
        res = {"style": "ado", "lignes": [{"mots": [
            {"texte": "5/6", "proteger": [True, False], "traits": [_mot_rapide(), _mot_rapide()]}]}]}
        ENC.encrer(res, "bic", None, 7)
        t0, t1 = (np.asarray(t) for t in res["lignes"][0]["mots"][0]["traits"])
        self.assertGreater(t0[:, 4].min(), 0.55)
        self.assertLess(t1[:, 4].min(), 0.45)

    def test_encrer_traits_proteger(self):
        T = np.asarray(_mot_rapide())
        libre = ECR.encrer_traits([T], "rouge", None, 11)
        garde = ECR.encrer_traits([T], "rouge", None, 11, proteger=True)
        self.assertLess(libre[0][:, 4].min(), 0.45)
        self.assertGreater(garde[0][:, 4].min(), 0.55)


# =============================================================================================
# Groupes de lecture et variantes (sans réseau)
# =============================================================================================
class Groupes(unittest.TestCase):
    def test_groupes(self):
        mots = ["Four", "à", "th.", "6", "(180", "°C).", "1", "c.", "à", "s.", "de", "pavot", "40", "min", "250g", "de", "farine"]
        dr = [IMP.important(m) for m in mots]
        self.assertEqual(ECR._groupes(mots, dr), [[2, 3], [4, 5], [6, 7, 8, 9], [11], [12, 13], [14], [16]])

    def test_variantes(self):
        v = dict(ECR.variantes_groupe(["180", "g"]))
        for faux in ["100 g", "18C g", "180 9", "180 q", "180", "18 g"]:
            self.assertIn(faux, v)
        self.assertEqual(v["180 9"], 1)
        self.assertEqual(v["100 g"], 0)
        self.assertIn("4C", LEC.variantes("40", strict=True))
        self.assertIn("4", LEC.variantes("40", strict=True))  # chiffre oublié
        self.assertIn("2509", LEC.variantes("250g", strict=True))
        self.assertEqual(LEC.variantes("farine"), sorted(LEC.variantes("farine")))

    def test_lectures_equivalentes(self):
        self.assertEqual(ECR.texte_lu("Cécile"), "Cecile")
        self.assertEqual(ECR.texte_lu("œufs"), "oeufs")
        c = ECR._cibles(["4", "°C"])
        self.assertIn("4 °C", c)
        self.assertIn("4 oC", c)
        self.assertIn('4 " C', c)


# =============================================================================================
# Chemin TrOCR réel (minimal) : « 40 min » écrit à tolérance zéro, rendu, relu sur l'encre rendue
# =============================================================================================
E = 2


def poser_et_rendre(blocs, xh=17.0, larg=420):
    """Pose les blocs les uns sous les autres et rend l'encre comme la cuisson (rendu_encre) sur un
    papier uni → (calque RGBA, mots posés pour relire_rendu)."""
    import mise_en_page as MEP
    import rendu_encre as R
    traces, places = [], []
    y = 40.0
    for b in blocs:
        x = 20.0
        for k, m in enumerate(b.lignes[0]):
            if k:
                x += max(m.espace_avant, 0.3) * xh
            tous = []
            for T in m.traits:
                P = T.copy()
                P[:, 0] = x + P[:, 0] * xh
                P[:, 1] = y + P[:, 1] * xh
                traces.append(MEP.Trace(P[:, :5], b.epaisseur * xh, b.encre))
                tous.append(P[:, :2])
            A = np.vstack(tous)
            places.append(dict(texte=m.texte, important=m.important, ligne=0, bloc=str(id(b)),
                               boite=(A[:, 0].min() * E, A[:, 1].min() * E, np.ptp(A[:, 0]) * E, np.ptp(A[:, 1]) * E)))
            x += m.largeur * xh
        y += 3.2 * xh
    haut = int(y)
    P = np.zeros((haut * E, larg * E, 3), np.uint8) + np.array([238, 225, 191], np.uint8)
    rel = R.relief(P)
    cartes = R.rasteriser(traces, larg * E, haut * E, E, np.zeros((haut * E, larg * E), np.float32))
    Rt, union = R.transmittance(cartes, rel, None)
    rgba, _ = R.composer(P, Rt, union, None)
    return rgba, places


@unittest.skipUnless(LEC.disponible(), "relecteur TrOCR absent (vendor/trocr)")
class CheminTrOCR(unittest.TestCase):
    """Le « 40 min » de Julie (« 4C min ») : écrit sans tolérance, sans saut de bille, relu juste sur
    l'encre rendue ; le même rendu avec le flanc droit du 0 effacé est refusé."""

    @classmethod
    def setUpClass(cls):
        cls.bloc = ECR.ecrire_bloc("40 min", "soignee", 100, encre="rouge")
        cls.rgba, cls.places = poser_et_rendre([cls.bloc])

    def test_tolerance_zero(self):
        self.assertEqual(self.bloc.douteux, [])
        mots = self.bloc.lignes[0]
        self.assertEqual([m.texte for m in mots], ["40", "min"])
        self.assertTrue(all(m.important for m in mots))
        for m in mots:  # encre bille (rouge) : aucun saut sur un mot important
            self.assertGreater(min(float(T[:, 4].min()) for T in m.traits), 0.5, m.texte)

    def test_relire_rendu(self):
        self.assertEqual(ECR.relire_rendu(self.rgba, self.places, cache=False), [])
        k = next(i for i, p in enumerate(self.places) if p["texte"] == "40")
        x, y, w, h = self.places[k]["boite"]
        abime = self.rgba.copy()
        abime[int(y): int(y + h) + 1, int(x + 0.78 * w): int(x + w) + 2, 3] = 0  # flanc droit du 0 effacé
        dou = ECR.relire_rendu(abime, self.places, cache=False)
        self.assertTrue(any(k in d["mots"] for d in dou), dou)


if __name__ == "__main__":
    unittest.main()
