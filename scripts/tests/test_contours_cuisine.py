"""Contrats de l'export technique : alpha réel, frontières disjointes et coordonnées bornées."""
import importlib.util
from pathlib import Path
import re
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location("contours", Path(__file__).resolve().parents[1] / "bake-contours-cuisine.py")
contours = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contours)


class ContoursCuisine(unittest.TestCase):
    def test_rectangle_sans_faux_traits_interieurs(self):
        a = np.zeros((160, 200, 4), np.uint8)
        a[30:130, 20:180] = [220, 190, 140, 255]
        paths = contours.chemins(a)
        self.assertEqual(len(paths), 1)
        self.assertTrue(paths[0].endswith(" Z"))

    def test_objets_separes_sans_trait_entre_eux(self):
        a = np.zeros((160, 200, 4), np.uint8)
        a[30:130, 10:70] = [220, 190, 140, 255]
        a[30:130, 130:190] = [220, 190, 140, 255]
        paths = contours.chemins(a)
        self.assertEqual(len(paths), 2)
        for p in paths:
            points = np.asarray([[float(x), float(y)] for x, y in re.findall(r"[ML]([.\d]+),([.\d]+)", p)])
            self.assertTrue(np.all(points[:, 0] < .4) or np.all(points[:, 0] > .6))

    def test_rgb_transparent_ne_cree_aucun_contour(self):
        a = np.zeros((160, 200, 4), np.uint8)
        a[30:130, 20:180] = [220, 190, 140, 255]
        b = a.copy()
        rgb = np.random.default_rng(123).integers(0, 256, (160, 200, 3), dtype=np.uint8)
        b[..., :3] = np.where((b[..., 3] == 0)[..., None], rgb, b[..., :3])
        self.assertEqual(contours.chemins(a), contours.chemins(b))

    def test_sortie_bornee_et_simplifiee(self):
        theta = np.linspace(0, 2 * np.pi, 5000)
        pts = np.column_stack([50 + 45 * np.sin(theta), 50 + 45 * np.cos(theta)])
        path = contours.svg(pts, 100, 100, True)
        points = re.findall(r"[ML]([.\d]+),([.\d]+)", path)
        self.assertLessEqual(len(points), 200)
        self.assertTrue(all(0 <= float(v) <= 1 for p in points for v in p))

    def test_vide_reste_vide(self):
        self.assertEqual(contours.chemins(np.zeros((120, 120, 4), np.uint8)), [])


if __name__ == "__main__":
    unittest.main()
