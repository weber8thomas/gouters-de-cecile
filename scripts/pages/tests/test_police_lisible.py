"""Les glyphes des recettes restent entiers dans la loupe et dans leur révélation d'encre."""
import importlib.util
from pathlib import Path
import sys
import unittest

import numpy as np

PAGES = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PAGES))
import mise_en_page as MEP
import rendu_encre as R
import recette as RC
import police_lisible as POL


class PoliceLisible(unittest.TestCase):
    def setUp(self):
        self.mise = MEP.mettre_en_page({
            "id": "lecture", "graine": 23, "police": "kalam", "main": "soignee", "encre": "bic",
            "blocs": [{"type": "paragraphe", "texte": "Emeline Clémence Pierrette : 160 g, 150 °C, 90 g, 2 œufs."}],
        }, dessins=False)
        self.traces = [t for t in self.mise.traces if t.glyphe]

    def test_loupe_tuiles_reproduisent_les_glyphes_entiers(self):
        self.assertFalse(self.mise.deborde)
        self.assertEqual([m.texte for m in self.mise.mots],
                         "Emeline Clémence Pierrette : 160 g, 150 °C, 90 g, 2 œufs.".split())
        larg, haut, ech = 1700, 350, 2.
        plein = R.rasteriser(self.traces, larg, haut, ech, np.zeros((haut, larg)))
        reconstitue = np.zeros((haut, larg), np.float32)
        for x0, x1 in [(0, 477), (477, larg)]:
            tuile = R.rasteriser(self.traces, x1-x0, haut, ech, np.zeros((haut, x1-x0)), (x0, 0))
            for _, (alpha, _, _) in tuile.items():
                reconstitue[:, x0:x1] = np.maximum(reconstitue[:, x0:x1], alpha)
        alpha = next(iter(plein.values()))[0]
        self.assertGreater(np.count_nonzero(alpha), 100)
        np.testing.assert_allclose(reconstitue, alpha, atol=1/255)

    def test_revelation_couvre_aussi_interieur_des_lettres(self):
        spec = importlib.util.spec_from_file_location("temps_encre", PAGES.parent / "bake-temps-encre.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        temps = module.carte(self.mise, 850, 180)
        rendu = R.rasteriser(self.traces, 850, 180, 1., np.zeros((180, 850)))
        alpha = next(iter(rendu.values()))[0]
        self.assertTrue(np.all(temps[alpha > .1] < 65535), "des pixels de lettres attendent la fin du lavis")
        self.assertGreater(np.ptp(temps[alpha > .1]), 10000, "la phrase doit s'écrire progressivement")
        debut = R.rasteriser(self.traces[:1], 850, 180, 1., np.zeros((180, 850)))
        premier_mot = next(iter(debut.values()))[0] > .1
        self.assertGreater(np.ptp(temps[premier_mot]), 1000, "un mot ne doit pas apparaître d'un seul bloc")

    def test_mains_distinctes_conservent_accents_et_quantites(self):
        texte = "Clémence, Pierrette : 70 % minimum, 150 °C, 2 œufs."
        empreintes = []
        for nom in POL.POLICES:
            with self.subTest(police=nom):
                f = POL.fonte(nom)
                for c in set(texte) - {" "}:
                    self.assertNotEqual(bytes(f.getmask(c)), bytes(f.getmask("\uffff")),
                                        f"glyphe absent : {c}")
                m = MEP.mettre_en_page({
                    "id": "mains", "graine": 23, "police": nom, "main": "soignee",
                    "blocs": [{"type": "paragraphe", "texte": texte}],
                }, dessins=False)
                self.assertFalse(m.deborde)
                self.assertEqual([mot.texte for mot in m.mots], texte.split())
                empreintes.append(bytes(POL.masque("Cécile", nom)[0].tobytes()))
        self.assertEqual(len(set(empreintes)), len(POL.POLICES), "les mains doivent réellement différer")

    def test_huit_recettes_integrales_restent_dans_le_paginateur(self):
        plan, papiers = RC.charger_plan()
        for slug, configuration in plan["recettes"].items():
            with self.subTest(recette=slug):
                recette = RC.charger_recette(slug, configuration)
                resultat = RC.paginer(recette, configuration, papiers)
                attendus = {a.id: a.texte.split() for a in RC.atomes(recette)}
                places = {}
                for pid in resultat.ordre:
                    for b in resultat.pages[pid]["blocs"]:
                        for s in b.get("segments", []) + b.get("lignes", []):
                            if s.get("atome"):
                                # Une phrase peut finir sur la page suivante. Contrôler ses mots
                                # dans l'ordre, avec leur multiplicité, plutôt que refuser ~a/~b.
                                aid = s["atome"].split("~")[0]
                                places.setdefault(aid, []).extend(s["texte"].split())
                self.assertEqual(places, attendus, "le texte intégral doit survivre aux coupures")
                self.assertFalse(resultat.feuillet, "ces huit recettes tiennent sur leurs deux pages")
                notes = [b["texte"] for p in resultat.pages.values() for b in p["blocs"]
                         if b.get("id", "").startswith("note-")]
                self.assertEqual(notes, [f'« {n["texte"]} »' for n in recette.get("notesMarge", [])])
                etapes = [b for p in resultat.pages.values() for b in p["blocs"] if b["type"] == "etape"]
                self.assertEqual(len(etapes), len(recette["etapes"]))
                self.assertTrue(all(b["disposition"] == "tete" for b in etapes))


if __name__ == "__main__":
    unittest.main()
