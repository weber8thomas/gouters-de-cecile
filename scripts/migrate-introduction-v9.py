#!/usr/bin/env python3
"""Remplace les trois anciens croquis décoratifs de l'introduction par la série commune.

Migration des actifs déjà cuits, sans modèles d'écriture : seuls les rectangles réservés aux dessins
sont effacés du calque transparent. Les pixels de texte restent identiques. Les nouveaux dessins
occupent des zones vivantes, comme sur les autres pages. Les descriptions source sont mises à jour
pour que les futures cuissons de pages produisent directement cette disposition.
"""
import io
import json
import math
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / 'design-system/baked/pages'
CONTENT = ROOT / 'src/content/pages'
ARCHIVE = ROOT / 'design-system/sources/illustrations/v9/encres-introduction-avant-v9.zip'


def main():
    manifeste = json.loads((CONTENT / 'manifeste.json').read_text())
    with ZipFile(ARCHIVE) as archive:
        migrations = json.loads(archive.read('migration.json'))
        for page in migrations:
            ancienne = json.loads(archive.read(f'sources/{page}.json'))
            actuelle = json.loads((CONTENT / f'{page}.json').read_text())
            sans_croquis = lambda p: [b for b in p['blocs'] if b.get('type') != 'croquis']
            assert sans_croquis(ancienne) == sans_croquis(actuelle), f'Texte modifié depuis la migration : {page} ; recuire normalement'
        for page, migration in migrations.items():
            original = migration['original']
            dessins = [c for c in original['croquis'] if c['nom'] in migration['remplacer']]
            fichiers = [(f'{page}.webp', [0, 0, 1, 1]), (f'1x/{page}.webp', [0, 0, 1, 1])]
            fichiers += [(f'4x/{page}-{r}{c}.webp', [x, y, w, h])
                         for r, c, x, y, w, h in original['encre4x']['tuiles']]
            for nom, (tx, ty, tw, th) in fichiers:
                image = Image.open(io.BytesIO(archive.read(nom))).convert('RGBA')
                avant = np.asarray(image).copy()
                masque = np.zeros((image.height, image.width), dtype=bool)
                for dessin in dessins:
                    x, y, w, h = dessin['boite']
                    # 0,6 % de marge pour le bord humide, sans atteindre les blocs de texte.
                    l = max(0, math.floor((x - .006 - tx) / tw * image.width))
                    t = max(0, math.floor((y - .006 - ty) / th * image.height))
                    r = min(image.width, math.ceil((x + w + .006 - tx) / tw * image.width))
                    b = min(image.height, math.ceil((y + h + .006 - ty) / th * image.height))
                    if l < r and t < b:
                        image.paste((0, 0, 0, 0), (l, t, r, b))
                        masque[t:b, l:r] = True
                destination = PAGES / nom
                image.save(destination, 'WEBP', lossless=True, exact=True, method=4)
                apres = np.asarray(Image.open(destination).convert('RGBA'))
                assert np.array_equal(avant[~masque], apres[~masque]), f'Texte modifié : {nom}'
                assert not apres[masque, 3].any(), f'Ancien croquis restant : {nom}'
                print(nom, flush=True)

            source = json.loads((CONTENT / f'{page}.json').read_text())
            source['blocs'] = [b for b in source['blocs']
                               if not (b.get('type') == 'croquis' and any(n in migration['remplacer'] for n in b.get('nom', [])))]
            source['_'] = 'Introduction : textes et cartouches conservés ; gâteau et guirlande de la série anglaise commune dans des zones vivantes.'
            info = manifeste['pages'][page]
            info['croquis'] = [c for c in info.get('croquis', []) if c['nom'] not in migration['remplacer']]
            for dessin in dessins:
                nom = f'aq-{dessin["nom"]}'
                aquarelle = migration['remplacer'][dessin['nom']]
                rect = dessin['boite']
                source['vivants'] = [v for v in source.get('vivants', []) if v['nom'] != nom]
                source['vivants'].append({'nom': nom, 'rect': rect, 'aquarelle': aquarelle})
                info['vivants'][nom] = rect
                info.setdefault('aquarelles', {})[nom] = {'aquarelle': aquarelle}
            (CONTENT / f'{page}.json').write_text(json.dumps(source, ensure_ascii=False, indent=1) + '\n')
    (CONTENT / 'manifeste.json').write_text(json.dumps(manifeste, ensure_ascii=False, indent=1) + '\n')
    cache_file = PAGES / '.cuisson.json'
    cache = json.loads(cache_file.read_text())
    for page in migrations:
        cache.pop(f'page/{page}', None)
    cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
