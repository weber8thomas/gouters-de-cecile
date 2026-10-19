#!/usr/bin/env python3
"""Exporte les sprites de scènes et secrets, puis prépare leurs WebP transparents.

Les originaux générés et les cadrages sont versionnés. Aucun dessin n'est reconstruit par le script.
Les quatre étapes de carotte gardent le même canevas : les feuilles restent à la même place.
"""
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'design-system/sources/illustrations/v10'


def main():
    # Le fruit entier est isolé de la planche v9 existante, en conservant ses pixels et ses franges.
    original = Image.open(ROOT / 'design-system/aquarelles/citron.png').convert('RGBA')
    rgba = np.array(original)
    labels, _ = ndimage.label(rgba[..., 3] > 8, structure=np.ones((3, 3)))
    areas = np.bincount(labels.ravel()); areas[0] = 0
    large = np.argsort(areas)[-2:]
    top = min(large, key=lambda k: np.nonzero(labels == k)[0].mean())
    bases = np.isin(labels, large)
    _, nearest = ndimage.distance_transform_edt(~bases, return_indices=True)
    rgba[labels[tuple(nearest)] != top, 3] = 0
    fruit = Image.fromarray(rgba, 'RGBA')
    yy, xx = np.nonzero(rgba[..., 3] > 8)
    fruit = fruit.crop((max(0, int(xx.min()) - 4), max(0, int(yy.min()) - 4),
                        min(fruit.width, int(xx.max()) + 5), min(fruit.height, int(yy.max()) + 5)))
    fruit.thumbnail((610, 610), Image.Resampling.LANCZOS)
    whole = Image.new('RGBA', (650, 650))
    whole.alpha_composite(fruit, ((650 - fruit.width) // 2, (650 - fruit.height) // 2))
    whole.save(SOURCE / 'citron-entier.png')

    spec = importlib.util.spec_from_file_location('export_aquarelles', ROOT / 'scripts/bake-illustrations-v9.py')
    exporteur = importlib.util.module_from_spec(spec); spec.loader.exec_module(exporteur)
    exporteur.SOURCES = SOURCE
    manifest = json.loads((SOURCE / 'manifeste.json').read_text())
    exporteur.export(manifest, catalogue_name='catalogue-v10.json')
    catalogue = json.loads((ROOT / 'design-system/aquarelles/catalogue-v10.json').read_text())
    papier = np.array([.960, .940, .880])
    seuls = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
    for name, info in catalogue.items():
        if seuls and name not in seuls:
            continue
        image = Image.open(ROOT / 'design-system/aquarelles' / info['fichier']).convert('RGBA')
        image.thumbnail((800, 800), Image.Resampling.LANCZOS)
        pixels = np.array(image)
        pixels[..., :3] = np.clip(np.round(pixels[..., :3] * papier), 0, 255).astype(np.uint8)
        out = ROOT / 'design-system/baked/aquarelles' / f'{name}.webp'
        out.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(pixels, 'RGBA').save(out, 'WEBP', quality=88, method=6, exact=True)
        print(f'cuit : {name}', flush=True)


if __name__ == '__main__':
    main()
