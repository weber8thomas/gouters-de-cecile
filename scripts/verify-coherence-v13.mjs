import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='verification/out/coherence-v13';mkdirSync(out,{recursive:true});
async function charger(file){const r=await build({entryPoints:[file],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);}
const {TABLEAUX,ETAPES_TABLEAUX,etatTableau,ANCRES_CAROTTE,pointActeur,vueTableau}=await charger('src/components/Aquarelle/tableaux.ts');
const aspects=Object.fromEntries([0,1,2,3].map(n=>[`carotte-${n}`,512/600]));
const checks=[];const test=(nom,f)=>{f();checks.push({nom,ok:true});};
for(const [n,{duree}] of Object.entries(TABLEAUX))test(`${n} : mêmes objets, échelle et pose au début et à la fin`,()=>{
 const a=etatTableau(n,0,aspects),b=etatTableau(n,duree,aspects);
 assert.equal(a.acteurs.length,b.acteurs.length);
 a.acteurs.forEach((x,k)=>{const y=b.acteurs[k];assert.equal(x.asset,y.asset);for(const p of x.alpha>0 ? ['x','y','w','angle','alpha'] : ['w','alpha'])assert(Math.abs(x[p]-y[p])<1e-7,`${n}/${k}/${p}`);});
 for(let t=0;t<duree;t+=.05){const q=etatTableau(n,t,aspects);assert(q.acteurs.every(a=>a.alpha>=0&&a.alpha<=1&&a.w>0&&[a.x,a.y,a.angle].every(Number.isFinite)),JSON.stringify({n,t,acteurs:q.acteurs}));}
});
test('Une tasse reste une tasse pendant toute sa lévitation',()=>{for(let t=0;t<=10;t+=.1)assert.equal(etatTableau('levitation',t).acteurs.length,1);assert(etatTableau('levitation',5).acteurs[0].y<330);});
test('Le service garde sa théière et ses deux tasses ; thé servi puis dégusté',()=>{assert(etatTableau('service-the',8).liquide.every(x=>x===1));assert(etatTableau('service-the',15).liquide.every(x=>x===0));assert(etatTableau('service-the',11).acteurs[1].y<420);});
test('Le jaune tombe entre les coquilles puis le fouet mélange',()=>{const acteur=(s,n)=>s.acteurs.find(a=>a.asset.endsWith('/'+n));const e=etatTableau('oeuf-au-bol',3.5),t=etatTableau('oeuf-au-bol',4.1),b=etatTableau('oeuf-au-bol',7);assert.equal(acteur(e,'oeuf').alpha,0);assert(acteur(e,'coquille-gauche').x<acteur(e,'coquille-droite').x);assert(acteur(t,'jaune').y>acteur(e,'jaune').y+70);assert(Math.abs(acteur(b,'fouet').x-acteur(etatTableau('oeuf-au-bol',7.1),'fouet').x)>5);});
test('Framboises visibles dans le bol, après le bol dans le plan de dessin',()=>{const e=etatTableau('framboise-biscuit',4),b=etatTableau('framboise-biscuit',8);assert.equal(e.acteurs[1].alpha,0);assert(e.acteurs[3].x-e.acteurs[2].x>=125);assert(e.miettes.some(m=>m.alpha>0));const bol=b.acteurs.findIndex(a=>a.asset.endsWith('/bol'));b.acteurs.forEach((a,k)=>{if(a.asset.endsWith('/framboise')){assert(k>bol);assert(a.y<390);assert(a.x>=450&&a.x<=550);}});});
test('La pâte à crêpes réutilise œuf, farine, lait puis fouet, sans changer de bol',()=>{for(let t=0;t<=23;t+=.1){const q=etatTableau('pate-crepes',t);assert.equal(q.acteurs.filter(a=>a.asset.endsWith('/bol')).length,1);assert.equal(q.acteurs[0].alpha,1);}assert(etatTableau('pate-crepes',7).miettes.some(m=>m.alpha>.1));assert(etatTableau('pate-crepes',12).versement.alpha>.5);assert(etatTableau('pate-crepes',17).surface.alpha>.8);});
test('Chaque mode pas à pas finit au repos après des repères strictement croissants',()=>{for(const [type,rep]of Object.entries(ETAPES_TABLEAUX)){assert(rep.every((x,k)=>x>(rep[k-1]??0)));assert.equal(rep.at(-1),TABLEAUX[type].duree);}});
test('Cadrages plus serrés pour les acteurs isolés, sans modifier leur distribution',()=>{assert.equal(vueTableau('levitation'),'230 0 540 650');assert.equal(vueTableau('gateau-enchante'),'190 0 620 650');assert.equal(etatTableau('gateau-enchante',0).acteurs[0].w,490);assert(TABLEAUX['carotte-grignote'].duree<10);});
test('La carotte ne change pas de largeur et ses fanes restent ancrées',()=>{for(let t=0;t<=11;t+=.1){const q=etatTableau('carotte-grignote',t,aspects),p=pointActeur(q.acteurs[0],ANCRES_CAROTTE[0].attache,aspects);q.acteurs.forEach((a,k)=>{assert.equal(a.w,440);const r=pointActeur(a,ANCRES_CAROTTE[k].attache,aspects);assert(Math.hypot(p[0]-r[0],p[1]-r[1])<1e-7);});}});
const {promenade,GENRES_SECRETS}=await charger('src/components/Magie/encre.ts');
test('Aucune lunette dans les surprises actives, une seule piste humaine bien espacée',()=>{assert(!GENRES_SECRETS.includes('lunettes-eclair'));let seed=42;const rng=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);let total=0;for(let i=0;i<40;i++){const p=promenade({nx:30,ny:40,c:30,occ:new Uint8Array(1200)},rng);if(!p)continue;assert(p.every(x=>!x.patte));for(let k=1;k<p.length;k++){assert(Math.hypot(p[k].x-p[k-1].x,p[k].y-p[k-1].y)>28);assert(p[k].dt-p[k-1].dt>=.51);}total+=p.length;}assert(total>30);});
writeFileSync(`${out}/contrats.json`,JSON.stringify(checks,null,2));console.log(`${checks.length} contrôles de cohérence OK`);
