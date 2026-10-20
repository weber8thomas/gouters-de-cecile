"""Régressions du split de phrases : texte intégral et feuille de suite réellement requise.

À lancer après installation locale de l'outil d'écriture, sans navigateur ni cuisson :
    tools/ecriture/.venv/bin/python scripts/tests/test_pagination_split.py
Les deux cas emploient la recette de Julien et réutilisent le cache neural disponible.
"""
from __future__ import annotations
import copy
import json
import re
import sys
import time
import unittest
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/pages'))
import mise_en_page as MEP
import recette as RC
recipe = json.loads((ROOT / 'src/content/recettes/julien.json').read_text())
plan = json.loads((ROOT / 'src/content/pages/recettes.json').read_text())['recettes']['julien']
papers = json.loads((ROOT / 'src/content/pages/papiers.json').read_text())
roster = RC.charger_roster()
for aid, seed in plan.get('graines', {}).items():
    RC.SURCHARGES['julien', aid] = seed
REPORT = []

def tokens(text):
    return re.findall("\\w+(?:['’]\\w+)*|[^\\w\\s]", MEP.texte_sans_balises(text).replace('’', "'"))

def source_texts():
    texts = [recipe['titre'], recipe['mot'], recipe['signature']]
    texts.extend((n['texte'] for n in recipe.get('notesMarge', [])))
    for group in recipe.get('ingredients', []) + recipe.get('extras', []):
        if group.get('titre'):
            texts.append(group['titre'])
        texts.extend((line['texte'] for line in group.get('lignes', [])))
        texts.extend(group.get('paragraphes', []))
    for step in recipe['etapes']:
        if step.get('titre'):
            texts.append(step['titre'])
        texts.append(step['texte'])
    texts.extend(recipe.get('apres', []))
    return texts
EXPECTED = Counter((t for text in source_texts() for t in tokens(text)))
TAIL = 'ils durcissent en surface tout en restant fondants à cœur.'

def paginate(gab):
    P = RC.Paginateur(gab, RC.atomes(recipe), 'ligne')
    splits = []
    original = P.couper_phrase

    def record(*a, **kw):
        before = len(P.A)
        answer = original(*a, **kw)
        if answer is not None:
            splits.append({'avant': before, 'apres': len(P.A), 'mots_a_gauche': answer})
        return answer
    P.couper_phrase = record
    result = P.paginer()
    return (P, result, splits)

def measure(result):
    rendered = []
    problems = []
    for pid in result.ordre:
        m = MEP.mettre_en_page(result.pages[pid], dessins=False)
        problems.extend(((pid, x) for x in m.deborde + m.non_places))
        rendered.extend(m.texte)
    counts = Counter((t for text in rendered for t in tokens(text)))
    return (EXPECTED - counts, problems, ' '.join(rendered))

@unittest.skipUnless((ROOT / 'vendor/poids/xray_epoch_52.npz').is_file(), 'Outil d’écriture local à installer avant cette régression.')
class SplitRegression(unittest.TestCase):

    def test_1_julien_texte_complet_apres_split(self):
        started = time.time()
        gab = RC.gabarits(recipe, plan, papers, roster)
        P, result, splits = paginate(gab)
        missing, problems, text = measure(result)
        row = {'probe': 'julien-actuel', 'source': 'current', 'splits': splits, 'feuillet': result.feuillet, 'pages': result.ordre, 'manquants': dict(missing), 'problemes': problems, 'tail_present': TAIL in text, 'secondes': round(time.time() - started, 2)}
        REPORT.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
        self.assertTrue(splits, 'La régression doit exercer une vraie coupure de phrase.')
        self.assertFalse(problems)
        self.assertFalse(missing, 'Le texte source doit apparaître entièrement, avec multiplicité des mots.')
        self.assertIn(TAIL, text)
        with self.assertRaises(RC.Deborde, msg='Une couverture incomplète doit échouer explicitement.'):
            P._resultat({gab.gauche['id']: (gab.gauche, 0, len(P.A) - 1, None, None)}, feuillet=False)

    def test_2_split_qui_impose_le_feuillet(self):
        started = time.time()
        gab = RC.gabarits(recipe, plan, papers, roster)
        before = RC.Paginateur(gab, RC.atomes(recipe), 'ligne')
        old_count = len(before.A)
        left, j = before.remplir(gab.gauche, 0, fin=RC._note_marge(gab))
        self.assertGreater(len(before.A), old_count, 'La gauche doit couper une phrase et ajouter un atome.')
        complete = RC.assembler(gab, gab.droite, before.A[j:])
        without_tail = RC.assembler(gab, gab.droite, before.A[j:-1])
        full_m = MEP.mettre_en_page(complete, dessins=False)
        short_m = MEP.mettre_en_page(without_tail, dessins=False)
        y_full = max((L.y0 for L in full_m.lignes if L.mots))
        y_short = max((L.y0 for L in short_m.lignes if L.mots))
        suggested = 1 - (y_full + y_short) / (2 * full_m.H)
        selected = None
        # Des caches neufs évitent de réutiliser une sonde faite avec une autre marge.
        offsets = [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, -0.01, -0.02]
        for delta in offsets:
            bottom = max(0.05, min(0.82, suggested + delta))
            base = copy.deepcopy(gab.droite)
            base.setdefault('marges', {})['bas'] = bottom
            probe = RC.Paginateur(gab, copy.deepcopy(before.A), 'ligne')
            end = probe.plus_long(base, j)
            if end == old_count:
                selected = bottom
                break
        self.assertIsNotNone(selected, 'Le cas doit atteindre exactement la limite tronquée de l’ancien code.')
        for name in ['droite', 'droite_volant']:
            getattr(gab, name).setdefault('marges', {})['bas'] = selected
        suite = RC.Paginateur(gab, RC.atomes(recipe), 'ligne')
        with self.assertRaises(RC.Deborde, msg='Deux pages de suite ne doivent pas masquer le dernier atome.'):
            suite.paginer_suite([gab.gauche, gab.droite], note=RC._note_marge(gab))
        P, result, splits = paginate(gab)
        missing, problems, text = measure(result)
        row = {'probe': 'julien-feuillet-requis', 'source': 'current', 'marge_basse_droite': selected, 'splits': splits, 'feuillet': result.feuillet, 'pages': result.ordre, 'manquants': dict(missing), 'problemes': problems, 'tail_present': TAIL in text, 'secondes': round(time.time() - started, 2)}
        REPORT.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
        self.assertTrue(result.feuillet, 'Le dernier atome exige réellement le feuillet après la coupure.')
        self.assertTrue(result.repartition.get('julien-feuillet-recto'))
        self.assertFalse(problems)
        self.assertFalse(missing)
        self.assertIn(TAIL, text)
if __name__ == '__main__':
    unittest.main(verbosity=2)
