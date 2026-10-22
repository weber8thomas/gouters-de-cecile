"""Relecture des mots importants : lecture libre équivalente au texte voulu (ecriture.lecture_equivalente)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ecriture import lecture_equivalente  # noqa: E402


class LectureEquivalente(unittest.TestCase):
    def test_lu_identique(self):
        for t in ("sucre", "160 g", "24h/24", "Elise", "1"):
            self.assertTrue(lecture_equivalente(t, t), t)

    def test_accents_ponctuation_espaces(self):
        for voulu, lu in [("Cécile,", "Cecile ."), ("200 g", "2 00 g"), ("tamisée", "tamisee"), ("30,", "30 ,"),
                          ("d’huile", "d'huile"), ("Chocolat", "chocolat"), ("levure)", "levure )"),
                          ("crème.", "crime ."), ("sèche", "siche")]:
            self.assertTrue(lecture_equivalente(voulu, lu), (voulu, lu))

    def test_numeros_et_1_lu_l(self):
        for voulu, lu in [("1.", "1'"), ("1.", "l"), ("1", '" I'), ("5.", "5 ,"), ("1 c.", "I C."), ("d'1 cm", 'd"I\'cm')]:
            self.assertTrue(lecture_equivalente(voulu, lu), (voulu, lu))

    def test_unite_lue_comme_chiffre(self):
        for voulu, lu in [("120g", "1209"), ("100g", "1009"), ("125 g", "125 9"), ("200 g", "2009")]:
            self.assertTrue(lecture_equivalente(voulu, lu), (voulu, lu))

    def test_oe(self):
        for lu in ("ceufs", "aeufs .", "oeufs"):
            self.assertTrue(lecture_equivalente("œufs", lu), lu)

    def test_vraies_fautes_gardees(self):
        for voulu, lu in [("180", "100"), ("120", "170"), ("300g", "3ccg"), ("16", "1"), ("1.", "7 ."), ("60g", "lolg ."),
                          ("2026.", "2o26"), ("50 cl", "50 d"), ("beurre", "bcurre"), ("farine", "famine"),
                          ("farine", "firine"), ("œufs", "cents"), ("sel", "selves")]:
            self.assertFalse(lecture_equivalente(voulu, lu), (voulu, lu))

    def test_sans_lecture(self):
        self.assertFalse(lecture_equivalente("sucre", None))
        self.assertFalse(lecture_equivalente("sucre", ""))


if __name__ == "__main__":
    unittest.main()
