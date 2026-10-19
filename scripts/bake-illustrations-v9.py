#!/usr/bin/env python3
"""Exporte les planches originales de la série anglaise en images transparentes indépendantes.

Les dessins viennent des PNG originaux versionnés, jamais de formes redessinées par le script.
Le cadrage et les proportions de sortie sont figés dans le manifeste ; aucune régénération IA
ou requête réseau au build. Ensuite : bake-aquarelles.py, puis bake-trace-aquarelles.py.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'design-system/sources/illustrations/v9'
OUTPUT = ROOT / 'design-system/aquarelles'


def export(manifest):
    catalogue = {}
    for sheet in manifest['planches']:
        original = Image.open(SOURCES / sheet['fichier']).convert('RGBA')
        for subject in sheet['sujets']:
            name = subject['nom']
            image = original.crop(tuple(subject['cellule']))
            # Deux sujets très proches dans une planche peuvent partager quelques lignes de
            # cadrage : conserver alors la composante du sujet, pas un fragment du voisin.
            if subject.get('composante_principale'):
                rgba = np.array(image)
                labels, count = ndimage.label(rgba[..., 3] > 12, structure=np.ones((3, 3)))
                if count:
                    areas = np.bincount(labels.ravel()); areas[0] = 0
                    keep = ndimage.binary_dilation(labels == areas.argmax(), iterations=2)
                    rgba[~keep, 3] = 0
                    image = Image.fromarray(rgba, 'RGBA')
            # Les couleurs RGB sous alpha=0 ne sont pas du papier à détourer : on conserve
            # intégralement le canal alpha fourni par l'original et les contours de pigment.
            alpha = np.asarray(image)[..., 3]
            yy, xx = np.nonzero(alpha > 8)
            if not len(xx):
                raise ValueError(f'Cellule vide : {name}')
            margin = 4
            image = image.crop((max(0, int(xx.min()) - margin), max(0, int(yy.min()) - margin),
                                min(image.width, int(xx.max()) + margin + 1),
                                min(image.height, int(yy.max()) + margin + 1)))
            width, height = subject['taille']
            padding = max(4, round(min(width, height) * 0.035))
            factor = min((width - 2 * padding) / image.width, (height - 2 * padding) / image.height)
            image = image.resize((max(1, round(image.width * factor)), max(1, round(image.height * factor))), Image.Resampling.LANCZOS)
            result = Image.new('RGBA', (width, height))
            result.alpha_composite(image, ((width - image.width) // 2, (height - image.height) // 2))
            destination = OUTPUT / f'{name}.png'
            result.save(destination)
            catalogue[name] = {
                'sujet': subject['sujet'], 'fichier': destination.name,
                'source': f'design-system/sources/illustrations/v9/{sheet["fichier"]}',
                'auteur': 'Série anglaise créée pour le carnet, génération assistée et direction artistique commune',
                'licence': 'Création pour ce projet ; provenance et consignes dans le manifeste de la série',
                'serie': 'anglaise-v9',
            }
            print(f'{name}: {width}×{height}')
    (OUTPUT / 'catalogue-v9.json').write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    export(json.loads((SOURCES / 'manifeste.json').read_text()))
