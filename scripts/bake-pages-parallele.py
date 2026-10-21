#!/usr/bin/env python3
"""Cuisson CPU isolée, qualité inchangée, avec reprise des sorties validées.

Huit workers maximum (trois par défaut) utilisent le moteur Cuisine, chacun dans son dossier et
son cache. Une page valide est recuite pour prouver l'identité des six WebP ; les
papiers dupliqués sont comparés aussi. Le moteur normal écrit le manifeste final.
Un lot interrompu se reprend avec --repair N, puis --resume réunit les résultats.
Sans aucune page encore valide (moteur modifié), la preuve exacte est remplacée
par la comparaison des papiers dupliqués et la validation normale finale.
--sans-4x saute la passe de la loupe, comme `bake-pages.mjs --sans-4x`.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
import hashlib
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts/pages'))
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')
import cuire as C


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


X4 = True


def preparer():
    pages, papers, plan = C.charger_descriptions()
    carnet, roster = C.RC.charger_carnet(), C.RC.charger_roster()
    pages = C.appliquer_carnet(pages, carnet, roster, [])
    cuisine = C.Cuisine(pages, papers, apercus=True, x4=X4)
    generated, errors = C.paginer_recettes(plan, papers, cuisine.cache, cuisine.moteur, cuisine.outil,
                                          carnet=carnet, roster=roster)
    if errors:
        raise RuntimeError(errors)
    pages.update(generated)
    pages = C.ajouter_contextes(pages, plan)
    cuisine.pages = pages
    cuisine.par_folio = {p['folio']: p for p in pages.values() if 'folio' in p and p.get('type') != 'feuillet'}
    if C.verifier_contenus(pages):
        raise RuntimeError('Correction dans un mot important')
    cuisine.ecrire_cache()
    return pages, papers, cuisine


def worker(number, ids, pages, papers, snapshot, out, x4=True):
    folder = Path(out) / f'worker-{number}'
    if folder.exists():
        raise RuntimeError(f'Dossier worker déjà présent : {folder}')
    folder.mkdir(parents=True)
    cache = folder / 'cache.json'
    cache.write_text(json.dumps(snapshot, ensure_ascii=False))
    cuisine = C.Cuisine(pages, papers, apercus=True, sortie=folder / 'pages',
                        apercus_dir=folder / 'apercus', cache=cache, x4=x4)
    invalides = []
    for index, pid in enumerate(ids):
        t = time.monotonic()
        result = cuisine.cuire(pid)
        cuisine.ecrire_cache()
        C._imprimer(cuisine.journal)
        cuisine.journal.clear()
        if result.get('deborde') or result.get('douteux_importants'):
            invalides.append(pid)
        print(f'worker {number}: {index+1}/{len(ids)} {pid} {time.monotonic()-t:.1f}s', flush=True)
    if invalides:
        raise RuntimeError(f'Pages à corriger, autres sorties conservées : {invalides}')
    return number, ids


def actifs(pid, man):
    paths = [Path(f'{pid}.webp'), Path(f'1x/{pid}.webp')]
    paths += [Path(f'4x/{pid}-{r}{c}.webp') for r, c, *_ in man.get('encre4x', {}).get('tuiles', [])]
    for nom in ('papier', 'papier1x'):
        if man.get(nom):
            paths.append(Path(man[nom].removeprefix('pages/') + '.webp'))
    return paths


def candidats(out, pages, papers, cuisine):
    fingerprints = {pid: cuisine.empreinte_page(pid) for pid in pages}
    result = {}
    for folder in sorted(out.glob('worker-*')):
        try:
            cache = json.loads((folder / 'cache.json').read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            continue  # un worker peut être en train d'écrire son cache
        c = C.Cuisine(pages, papers, sortie=folder / 'pages', cache=folder / 'cache.json', x4=X4)
        for pid in pages:
            entry = cache.get(f'page/{pid}')
            if (entry and entry.get('cle') == fingerprints[pid]
                    and not entry['manifeste'].get('deborde')
                    and not entry['manifeste'].get('douteux_importants')
                    and c._a_jour(pid, entry)):
                result.setdefault(pid, []).append((folder, cache, entry))
    return result


def reunir(out, pages, papers, cuisine, attente=False):
    plan = json.loads((out / 'plan.json').read_text())
    snapshot = dict(cuisine.cache)
    valid = {pid for pid in pages if (entry := snapshot.get(f'page/{pid}'))
             and entry.get('cle') == cuisine.empreinte_page(pid) and cuisine._a_jour(pid, entry)}
    debut = time.monotonic()
    while True:
        candidates = candidats(out, pages, papers, cuisine)
        missing = set(pages) - valid - candidates.keys()
        if not missing:
            break
        if not attente or time.monotonic() - debut > 7200:
            raise RuntimeError(f'Sorties valides encore absentes : {sorted(missing)}')
        print(f'Reprise : attente de {len(missing)} faces valides : {sorted(missing)}', flush=True)
        time.sleep(30)
    proof = plan['preuve']
    checks = []
    if proof is not None:
        if proof not in valid or proof not in candidates:
            raise RuntimeError('La preuve doit être conservée ET recuite')
        proof_folder = candidates[proof][0][0] / 'pages'
        proof_files = [Path(f'{proof}.webp'), Path(f'1x/{proof}.webp')]
        if X4:
            proof_files += [Path(f'4x/{proof}-{r}{c}.webp') for r in range(2) for c in range(2)]
        for rel in proof_files:
            if digest(C.SORTIE / rel) != digest(proof_folder / rel):
                raise RuntimeError(f'Restitution différente : {rel}')
            checks.append(str(rel))
    seen = {}; sources = {}; apercus = {}; merged = dict(snapshot)
    for pid, entries in sorted(candidates.items()):
        for folder, cache, entry in entries:
            man = entry['manifeste']
            for rel in actifs(pid, man):
                source = folder / 'pages' / rel
                sha = digest(source)
                if str(rel) in seen and seen[str(rel)] != sha:
                    raise RuntimeError(f'Actif non déterministe entre workers : {rel}')
                seen[str(rel)] = sha; sources[str(rel)] = source
            for nom in ('papier', 'papier1x'):
                if man.get(nom):
                    fid = Path(man[nom]).name
                    key = f'{nom}/{fid}'
                    if key in cache:
                        merged[key] = cache[key]
            merged[f'page/{pid}'] = entry
            if (p := folder / 'apercus' / f'{pid}.png').exists():
                apercus[pid] = p
    # Toutes les sources ont été contrôlées avant de toucher la sortie commune.
    for rel, source in sources.items():
        target = C.SORTIE / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for pid, source in apercus.items():
        C.APERCUS.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, C.APERCUS / f'{pid}.png')
    cuisine.cache = merged; cuisine.ecrire_cache()
    status = C.main(['--apercus'] + ([] if X4 else ['--sans-4x']))
    if status:
        raise RuntimeError(f'Validation normale : code {status}')
    manifest = json.loads((C.DESCRIPTIONS / 'manifeste.json').read_text())
    if set(manifest['pages']) != set(pages) or any(p.get('deborde') for p in manifest['pages'].values()):
        raise RuntimeError('Le manifeste ne couvre pas exactement les faces sans débordement')
    report = {'faces': len(pages), 'jobs': plan['jobs'], 'pages_conservees': sorted(valid),
              'pages_cuites': sorted(candidates), 'preuve_exacte': proof, 'fichiers_identiques': checks,
              'fichiers_copies': len(sources), 'sorties_dupliquees_identiques': True, 'debordements': 0}
    (out / 'rapport.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False), flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--jobs', type=int, default=3, choices=range(1, 9))
    ap.add_argument('--out', default='verification/out/parallele')
    ap.add_argument('--sans-4x', action='store_true', help="sans la passe d'encre ×4 (loupe)")
    ap.add_argument('--resume', action='store_true')
    ap.add_argument('--repair', type=int)
    args = ap.parse_args()
    global X4
    X4 = not args.sans_4x
    out = ROOT / args.out
    if out.exists() and not (args.resume or args.repair is not None):
        raise SystemExit(f'Dossier déjà présent : {out}. Utiliser --resume ou choisir un autre --out.')
    out.mkdir(parents=True, exist_ok=True)
    pages, papers, cuisine = preparer()
    if args.repair is not None:
        plan = json.loads((out / 'plan.json').read_text())
        ids = plan['batches'][args.repair]
        worker(f'repair-{args.repair}', ids, pages, papers, dict(cuisine.cache), out, X4)
        return
    if args.resume:
        reunir(out, pages, papers, cuisine, attente=True)
        return
    valid = []; pending = []
    for pid in pages:
        entry = cuisine.cache.get(f'page/{pid}')
        if entry and entry.get('cle') == cuisine.empreinte_page(pid) and cuisine._a_jour(pid, entry):
            valid.append(pid)
        else:
            pending.append(pid)
    proof = valid[0] if valid else None
    if proof is None:
        print('Aucune page valide en cache : pas de preuve exacte, papiers dupliqués et validation finale seulement.', flush=True)
    batches = [[] for _ in range(args.jobs)]
    for i in range(0, len(pending), 2):
        batches[(i // 2) % args.jobs].extend(pending[i:i+2])
    if proof is not None:
        batches[0].append(proof)
    plan = {'valides': valid, 'a_cuire': pending, 'preuve': proof, 'batches': batches, 'jobs': args.jobs}
    (out / 'plan.json').write_text(json.dumps(plan, indent=2, ensure_ascii=False))
    print(f'{len(pages)} faces : {len(valid)} en cache, {len(pending)} à cuire, preuve exacte {proof}, {args.jobs} workers isolés, 4× {"oui" if X4 else "non"}.', flush=True)
    context = multiprocessing.get_context('spawn')
    with ProcessPoolExecutor(max_workers=args.jobs, mp_context=context) as pool:
        futures = [pool.submit(worker, i, ids, pages, papers, dict(cuisine.cache), out, X4) for i, ids in enumerate(batches)]
        for future in as_completed(futures):
            number, ids = future.result()
            print(f'worker {number} terminé : {len(ids)} faces.', flush=True)
    reunir(out, pages, papers, cuisine)


if __name__ == '__main__':
    main()
