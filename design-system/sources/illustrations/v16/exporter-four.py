"""Dérive les trois couches du four peint existant, à canevas et charnière communs."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUTPUT = ROOT / 'design-system/aquarelles'
m = json.loads((HERE / 'manifeste.json').read_text())['derivation_four']
im = Image.open(HERE / m['source']).convert('RGBA')
mask = Image.new('L', im.size)
ImageDraw.Draw(mask).polygon([tuple(p) for p in m['porte_polygone']], fill=255)
p = np.asarray(mask, dtype=np.uint8)
rgba = np.array(im)
corps = rgba.copy(); corps[..., 3][p > 0] = 0
porte = rgba.copy(); porte[..., 3][p == 0] = 0
x0, y0, x1, y1 = mask.getbbox()
cavite = Image.new('RGBA', im.size)
rack = im.crop(tuple(m['cavite_source'])).resize((x1-x0, y1-y0), Image.Resampling.LANCZOS)
cavite.paste(rack, (x0, y0))
c = np.array(cavite); c[..., 3] = p
cat_path = OUTPUT / 'catalogue-v16.json'
cat = json.loads(cat_path.read_text())
for name, array in [('four-corps', corps), ('four-cavite', c), ('four-porte', porte)]:
    out = OUTPUT / 'acteurs' / f'{name}.png'
    Image.fromarray(array).save(out)
    cat[f'acteurs/{name}'] = {'sujet': name, 'fichier': f'acteurs/{name}.png', 'source': str((HERE / m['source']).relative_to(ROOT)), 'auteur': 'Dérivation technique du four anglais v14', 'licence': 'Création pour ce projet ; provenance dans le manifeste v14', 'serie': 'anglaise-v16', 'reproduction': 'design-system/sources/illustrations/v16/exporter-four.py'}
    print(name, im.size)
cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=2)+'\n')
# Le découpage fermé préserve chaque pigment et son alpha, sans double contour.
recompose = Image.alpha_composite(Image.fromarray(corps), Image.fromarray(porte))
assert np.array_equal(np.asarray(recompose), rgba)
