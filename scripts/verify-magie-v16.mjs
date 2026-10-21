import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {build} from 'esbuild';

async function charger(file) {
  const b = await build({entryPoints:[file], bundle:true, platform:'node', format:'esm', write:false});
  return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
}
const {grille, grilleMaraudeurRecette, promenade, delaiMaraudeur, libre} = await charger('src/components/Magie/encre.ts');
const {cycleRedessin, portionTrait, DUREE_REDESSIN} = await charger('src/components/Magie/redessins.ts');
const carte = JSON.parse(readFileSync('src/components/Magie/carte.json'));
const manifeste = JSON.parse(readFileSync('src/content/pages/manifeste.json'));
const finale = process.argv.includes('--carte-finale');
const titres = [];
let seed = 54321;
const alea = () => ((seed = Math.imul(seed,1664525)+1013904223 >>> 0) / 4294967296);
const pages = [];
for (const [id, cp] of Object.entries(carte.pages)) {
  const info = manifeste.pages[id]; if (!info?.recette) continue;
  if (cp.titres.some((t)=>t.bloc==='titre')) {
    const exporte = !!cp.redessins?.some((r)=>r.bloc==='titre' && r.traits.length);
    titres.push({page:id,recette:info.recette,exporte});
    if (finale) assert(exporte,`${id}: le titre de recette doit exporter au moins un vrai soulignement pour être retracé`);
  }
  const initiale = grille(cp, info), bord = grilleMaraudeurRecette(initiale);
  assert.notEqual(bord.occ, initiale.occ);
  initiale.occ.forEach((v,i) => { if (v) assert.equal(bord.occ[i],1,`${id}: une case d'encre ne doit jamais être libérée`); });
  let reussites=0, nombre=0;
  for (let tentative=0; tentative<40; tentative++) {
    const pas = promenade(bord, alea); if (!pas) continue;
    reussites++; nombre+=pas.length;
    pas.forEach((p,i) => {
      assert.equal(p.patte,false,`${id}: chaussures humaines uniquement`);
      assert(libre(bord,[p.x-10,p.y-10,p.x+10,p.y+10]),`${id}: jamais dans l'encre ni le cœur de page`);
      for (const q of pas.slice(0,i)) assert(Math.hypot(p.x-q.x,p.y-q.y)>34,`${id}: les empreintes ne se superposent pas`);
      if(i) assert(p.dt-pas[i-1].dt>=.519,`${id}: allure de marche conservée`);
    });
  }
  assert(reussites>=30,`${id}: la bordure conserve assez d'espace pour des passages réguliers (${reussites}/40)`);
  pages.push({id, reussites, essais:40, pas:nombre});
}
assert(pages.length>=26);
assert.equal(delaiMaraudeur(true,()=>0),6);assert.equal(delaiMaraudeur(true,()=>1),9);
assert.equal(delaiMaraudeur(false,()=>0),16);assert.equal(delaiMaraudeur(false,()=>1),24);
assert.equal(cycleRedessin(.9).phase,'pause');assert.equal(cycleRedessin(1.1).phase,'trace');
assert.equal(cycleRedessin(DUREE_REDESSIN).phase,'repos');
for (let t=0;t<DUREE_REDESSIN;t+=.05) assert.deepEqual(cycleRedessin(t,true),{phase:'repos',debut:0,fin:0});
const a=cycleRedessin(1.3), b=cycleRedessin(3.9);
assert(b.debut>a.debut+.8,'La plume retrace progressivement le même dessin, sans apparition instantanée');
assert.deepEqual(portionTrait(.25,.75,0,100,200),[.5,1]);
const out='verification/out/coherence-v16';mkdirSync(out,{recursive:true});
writeFileSync(`${out}/magie.json`,JSON.stringify({pages,titres,carteFinale:finale,delaiRecette:[6,9],delaiAutres:[16,24],redessin:DUREE_REDESSIN,tests:'échantillonnage de 40 routes par page : chaussures humaines, marges hors texte, distances ; cadence, progression, mouvement réduit'},null,2));
console.log(`${pages.length} pages de recettes : échantillonnage de 40 routes par page, pas humains espacés dans les marges ; ${titres.filter(t=>t.exporte).length}/${titres.length} titres retracés${finale?' (carte finale)':''}.`);
