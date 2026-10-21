/** Commandes réelles dans le livre publié : ni changement de page, ni déplacement des boutons. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {lancer,ouvrirCible,ecran,initReglages} from './lib/verif.mjs';
const out='verification/out/recettes-v15/livre';mkdirSync(out,{recursive:true});
const cible=await ouvrirCible({site:process.env.GC_SITE??'dist/site'});
const browser=await lancer({media:false}),preuves=[],erreurs=[];
try{
 for(const slug of ['marie','sarah']){
  const ctx=await browser.newContext(ecran('tv-1080').ctx);
  const init=initReglages({animations:'completes',musiqueActive:false,lectureAuto:false,feu:false,vitesseEcriture:4});await ctx.addInitScript(init.fn,init.arg);
  const p=await ctx.newPage();p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto(cible.url(ecran('tv-1080'),slug));
  await p.waitForFunction(slug=>document.querySelector('.gc-livre')?.getAttribute('data-gc-etat')==='ouvert'&&!document.querySelector('.gc-livre')?.hasAttribute('data-gc-geste')&&(window.__gcDessins?.etat()??[]).some(t=>t.page===slug+'-droite'&&t.pret),slug,{timeout:90000});
  await p.evaluate(()=>{window.__gcDessins.finir();window.__gcDessins.figer(true);window.__gcDessins.avancer(33)});
  const controles=p.locator('.gc-livre__page--visible .gc-recette-commandes:visible');await controles.waitFor({timeout:30000});
  await p.waitForFunction(slug=>(window.__gcDessins.etat().find(t=>t.page===slug+'-droite')?.dessins??[]).some(d=>d.tableau?.nom==='recette-'+slug),slug,{timeout:30000});
  await p.evaluate(slug=>{window.__gcDessins.commande(slug==='sarah'?'brioche':'fondant-chocolat','rejouer');window.__gcDessins.avancer(33)},slug);
  const double=await p.locator('.gc-livre-ecran').getAttribute('data-gc-double');
  assert(double!==null);
  const etat=()=>p.evaluate(slug=>(window.__gcDessins.etat().find(t=>t.page===slug+'-droite')?.dessins??[]).find(d=>d.tableau?.nom==='recette-'+slug),slug);
  const avancer=ms=>p.evaluate(ms=>window.__gcDessins.avancer(ms),ms);
  const positions=()=>controles.locator('button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return{commande:b.dataset.commande,x:r.x,y:r.y,w:r.width,h:r.height}}));
  const avant=await positions();
  await controles.getByRole('button',{name:'Pas à pas',exact:true}).click();await avancer(8000);assert.equal((await etat()).tableau.legende.etape,1);
  await controles.getByRole('button',{name:'Suivante',exact:true}).click();await avancer(8000);assert.equal((await etat()).tableau.legende.etape,2);
  await controles.getByRole('button',{name:'Précédente',exact:true}).focus();await p.keyboard.press('Enter');await avancer(8000);assert.equal((await etat()).tableau.legende.etape,1);
  assert.equal(await p.locator('.gc-livre-ecran').getAttribute('data-gc-double'),double);
  const apres=await positions();assert.deepEqual(apres,avant);
  const cadre=await controles.evaluate(el=>{const r=el.getBoundingClientRect(),page=el.closest('.gc-livre__page').getBoundingClientRect();return{dansPage:r.left>=page.left-1&&r.right<=page.right+1&&r.top>=page.top&&r.bottom<=page.bottom,x:r.x,y:r.y,w:r.width,h:r.height}});assert(cadre.dansPage);
  await p.screenshot({path:`${out}/${slug}-tv.png`});preuves.push({slug,double,etapes:2,positionsFixes:true,navigationAuClavier:true,resteSurLaRecette:true,cadre});await ctx.close();
 }
 assert.deepEqual(erreurs,[]);writeFileSync(out+'/rapport.json',JSON.stringify({preuves,erreurs},null,2));console.log('Marie et Sarah : commandes dans le livre, clavier, positions fixes et cadre OK');
}finally{await browser.close();cible.close();}
