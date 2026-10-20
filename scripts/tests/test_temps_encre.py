"""Régression : une longue décoration ne doit plus apparaître d'un seul coup."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location(
    "temps_encre", Path(__file__).resolve().parents[1] / "bake-temps-encre.py"
)
temps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(temps)


def trait(*points):
    return SimpleNamespace(pts=np.array(points, float), diam=1, glyphe=None)


def carte(*traces):
    return temps.carte(SimpleNamespace(traces=traces), 128, 128)


class TempsEncre(unittest.TestCase):
    def test_soulignement_deux_points_avance_jusqu_au_bout(self):
        c = carte(trait((10, 60), (110, 60)))
        valeurs = c[60, 15:106:10].astype(int)
        self.assertTrue(np.all(np.diff(valeurs) > 0), valeurs)
        self.assertGreater(c[60, 105], temps.MAX * .8)
        self.assertLess(c[60, 15], temps.MAX * .1)

    def test_trait_trace_de_droite_a_gauche(self):
        c = carte(trait((110, 60), (10, 60)))
        valeurs = c[60, 15:106:10].astype(int)
        self.assertTrue(np.all(np.diff(valeurs) < 0), valeurs)

    def test_croisement_garde_le_temps_du_premier_trait(self):
        c = carte(trait((10, 60), (110, 60)), trait((60, 10), (60, 110)))
        self.assertLess(c[60, 60], temps.MAX * .3)
        self.assertGreater(c[90, 60], temps.MAX * .8)
        self.assertEqual(c[0, 0], temps.MAX)


if __name__ == "__main__":
    unittest.main()
