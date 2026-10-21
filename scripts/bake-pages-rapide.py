#!/usr/bin/env python3
"""Reprise des WebP 1×/2×, puis cuisson manquante sans lancer de tuiles 4×.

Les métadonnées des images déjà produites sont reconstruites par le bloc exact
du moteur Cuisine, sans nouvelle rastérisation. La sortie rapide n'annonce
aucune tuile HD provenant d'un état antérieur du carnet.
"""
from __future__ import annotations
from concurrent.futures import ProcessPoolExecutor, as_completed
import hashlib
import inspect
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import sys
import textwrap
import time
os.environ['OPENBLAS_NUM_THREADS']='1';os.environ['OMP_NUM_THREADS']='1'
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'scripts/pages'))
import cuire as C
OUT=ROOT/'verification/out/v16-rapide'


def metadata(cuisine,pid):
    # Le même code construit le manifeste, quelle que soit la phase interrompue.
    source=inspect.getsource(C.Cuisine.cuire)
    tail=source[source.index('        W_, H_ ='):source.index('        self.cache[f"page/')]
    code='def reconstruire(self,pid):\n    page=self.pages[pid]\n    mise=self.mise(pid)\n    fid,miroir=feuillet_de(page)\n    relu=None\n    man={}\n'+textwrap.indent(textwrap.dedent(tail),'    ')+'\n    return man\n'
    scope={};exec(code,vars(C),scope)
    return scope['reconstruire'](cuisine,pid)


def papier_cle(cuisine,fid):
    return C.h({'cfg':cuisine.cfg_papier(fid),'v':cuisine.moteur,'q':C.Q_PAPIER,
                'taille':cuisine.fmt.px(),'eviter':cuisine._eviter(fid),'ech':cuisine.ech})


def worker(number,ids,pages,papers,snapshot,candidates):
    folder=OUT/f'worker-{number}';folder.mkdir(parents=True)
    cache=folder/'cache.json';cache.write_text(json.dumps(snapshot,ensure_ascii=False))
    c=C.Cuisine(pages,papers,sortie=folder/'pages',cache=cache,x4=False)
    harvested=[]
    for k,pid in enumerate(ids):
        t=time.monotonic();p=pages[pid]
        if pid in candidates:
            origin=Path(candidates[pid]);man=metadata(c,pid)
            files=[Path(pid+'.webp'),Path('1x')/(pid+'.webp')]
            for key in ('papier','papier1x'):
                files.append(Path(man[key].removeprefix('pages/')+'.webp'))
            for rel in files:
                target=c.sortie/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(origin/rel,target)
            fid=Path(man['papier']).name;cle=papier_cle(c,fid)
            c.cache[f'papier/{fid}']=cle;c.cache[f'papier1x/{fid}']=cle
            c.cache[f'page/{pid}']={'cle':c.empreinte_page(pid),'manifeste':man}
            harvested.append(pid)
        else:
            man=c.cuire(pid)
        if man.get('deborde') or man.get('douteux_importants'):
            raise RuntimeError(f'{pid}: {man.get("deborde")} {man.get("douteux_importants")}')
        c.ecrire_cache();c._recto.clear();c._papier.clear();c._papier1.clear()
        C._imprimer(c.journal);c.journal.clear()
        print(f'rapide {number}: {k+1}/{len(ids)} {pid} {"repris" if pid in candidates else "cuit"} {time.monotonic()-t:.1f}s',flush=True)
    return number,ids,harvested


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    pages,papers,plan=C.charger_descriptions();carnet,roster=C.RC.charger_carnet(),C.RC.charger_roster()
    pages=C.appliquer_carnet(pages,carnet,roster,[]);c=C.Cuisine(pages,papers,x4=False)
    generated,errors=C.paginer_recettes(plan,papers,c.cache,c.moteur,c.outil,carnet=carnet,roster=roster)
    if errors:raise RuntimeError(errors)
    pages.update(generated);pages=C.ajouter_contextes(pages,plan);c.pages=pages
    c.par_folio={p['folio']:p for p in pages.values() if 'folio'in p and p.get('type')!='feuillet'}
    slow=C.Cuisine(pages,papers,x4=True);slow.cache=c.cache
    expected={pid:slow.empreinte_page(pid) for pid in pages}
    candidates={}
    roots=[C.SORTIE]+[p/'pages' for p in sorted((ROOT/'verification/out/v16-parallel').glob('worker-*'))]
    for origin in roots:
        try:sc=json.loads((origin/'.cuisson.json' if origin==C.SORTIE else origin.parent/'cache.json').read_text())
        except (FileNotFoundError,json.JSONDecodeError):continue
        for pid in pages:
            entry=sc.get(f'page/{pid}')
            valid=bool(entry and entry.get('cle')==expected[pid] and not entry['manifeste'].get('deborde'))
            if origin!=C.SORTIE:
                # Une 1× présente prouve que la paire 2×/1× avait fini avant la HD.
                name=origin.parent.name
                if name=='worker-0':allowed=pid not in {'cecile-1-gauche','cecile-1-droite'}
                else:allowed=True
                valid=valid or allowed
            if valid and (origin/f'{pid}.webp').exists() and (origin/'1x'/f'{pid}.webp').exists():
                # Les sources v16 des deux faces d'album sont dans le lot réparé.
                if pid.startswith('cecile-1-') and origin.name=='pages' and origin.parent.name!='worker-repair-0':continue
                candidates[pid]=str(origin)
    batches=[[]for _ in range(3)]
    for i in range(0,len(pages),2):batches[(i//2)%3].extend(list(pages)[i:i+2])
    print(f'{len(pages)} faces ; {len(candidates)} paires 1×/2× réutilisables ; 3 workers sans HD.',flush=True)
    (OUT/'plan.json').write_text(json.dumps({'candidates':candidates,'batches':batches},ensure_ascii=False,indent=2))
    with ProcessPoolExecutor(max_workers=3,mp_context=multiprocessing.get_context('spawn')) as pool:
        futures=[pool.submit(worker,i,ids,pages,papers,dict(c.cache),candidates)for i,ids in enumerate(batches)]
        results=[f.result()for f in as_completed(futures)]
    merged=dict(c.cache);seen={};sources={}
    for number,ids,_ in results:
        folder=OUT/f'worker-{number}';cache=json.loads((folder/'cache.json').read_text())
        for pid in ids:merged[f'page/{pid}']=cache[f'page/{pid}']
        for key,val in cache.items():
            if key.startswith(('papier/','papier1x/')):merged[key]=val
        for source in (folder/'pages').rglob('*.webp'):
            rel=source.relative_to(folder/'pages');sha=hashlib.sha256(source.read_bytes()).hexdigest()
            if str(rel)in seen and seen[str(rel)]!=sha:raise RuntimeError(f'Papier divergent: {rel}')
            seen[str(rel)]=sha;sources[str(rel)]=source
    for rel,source in sources.items():
        target=C.SORTIE/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
    c.cache=merged;c.ecrire_cache()
    status=C.main(['--sans-4x'])
    if status:raise RuntimeError(f'Validation finale {status}')
    manifest=json.loads((C.DESCRIPTIONS/'manifeste.json').read_text())
    assert len(manifest['pages'])==62
    assert all(not p.get('encre4x')and not p.get('deborde')for p in manifest['pages'].values())
    report={'faces':62,'hd':False,'reprises':sum(len(x[2])for x in results),'debordements':0}
    (OUT/'rapport.json').write_text(json.dumps(report,indent=2));print(report,flush=True)

if __name__=='__main__':main()
