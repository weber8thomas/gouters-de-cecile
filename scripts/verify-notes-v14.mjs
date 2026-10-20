import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {lancer,ouvrirCible,ecran,initReglages} from './lib/verif.mjs';
const opt=k=>{const n=process.argv.indexOf(`--${k}`);return n>=0?process.argv[n+1]:undefined;};
const out=resolve('verification/out/notes-v14');mkdirSync(out,{recursive:true});
const module=await build({entryPoints:['src/lib/quete.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const q=await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].text).toString('base64')}`);
const resultats=[];const ok=(nom,preuve={})=>{resultats.push({nom,ok:true,...preuve});console.log('OK',nom);};
let etat=q.QUETE_INITIALE;
for(let index=0;index<q.CACHETTES.length;index++){
 assert.equal(q.avancerQuete(etat,{type:'valider',index}),etat);
 assert.equal(q.avancerQuete(etat,{type:'reveler',index:index+1}),etat);
 etat=q.avancerQuete(etat,{type:'reveler',index});etat=q.avancerQuete(etat,{type:'valider',index});
}
assert.equal(etat.trouves,5);assert.deepEqual(q.avancerQuete(etat,{type:'rejouer'}),q.QUETE_INITIALE);ok('Les cinq notes restent ordonnées, persistables et rejouables');
const cible=await ouvrirCible(opt('url')?{url:opt('url')}:{site:opt('site')??'dist/site'});
const browser=await lancer({media:false});let page;const erreurs=[];
try{
 for(const nom of ['tv-1080','iphone13-paysage'].filter(n=>!opt('only')||n===opt('only'))){
  const ctx=await browser.newContext(ecran(nom).ctx);
  const init=initReglages({animations:'reduites',musiqueActive:false,lectureAuto:false,feu:false,boutonsToujoursVisibles:true,vitesseEcriture:4});await ctx.addInitScript(init.fn,init.arg);
  await ctx.addInitScript(()=>localStorage.removeItem('gc:quete:v1'));
  // Figer les modules chargés : les retouches parallèles dans Vite ne rechargent pas ce parcours.
  await ctx.routeWebSocket('**/*',ws=>ws.close());page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));
  await page.goto(cible.url(ecran(nom),nom==='tv-1080'?'titre':'sommaire'));
  const actif=()=>page.waitForSelector('.gc-quete__compagnon[data-gc-secret-actif="oui"]',{timeout:90000});await actif();
  const ouvrir=async()=>{await page.keyboard.press('s');await page.waitForSelector('#gc-guide-quete');};
  const borne=async()=>{
   const g=await page.locator('#gc-guide-quete').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,top:r.top,width:r.width,right:r.right,bottom:r.bottom,fenetre:[innerWidth,innerHeight],deborde:el.scrollWidth>el.clientWidth+1};});
   assert(g.left>=g.fenetre[0]*.5-1&&g.right<=g.fenetre[0]&&g.top>=0&&g.bottom<=g.fenetre[1]&&!g.deborde,JSON.stringify(g));return g;
  };
  await ouvrir();const geometrie=await borne();
  assert.equal(await page.locator('.gc-quete__destination').count(),0);assert.equal(await page.locator('#gc-guide-quete a').count(),0);
  assert(!/\d\s*\/\s*5|page 2|petite clé/i.test(await page.locator('#gc-guide-quete').innerText()));
  assert.equal(await page.locator('.gc-quete__legende').innerText(),'Psst…');
  await page.locator('[data-gc-quete-principal]').click();assert.equal(await page.locator('.gc-quete__destination').count(),0);
  await page.locator('[data-gc-quete-principal]').click();assert((await page.locator('.gc-quete__destination').innerText()).includes('Page 2'));await borne();
  await page.screenshot({path:resolve(out,`${nom}-rabat.png`)});ok(`${nom} : rabat latéral borné, aide choisie en deux temps`,{geometrie});
  await page.keyboard.press('Escape');
  if(nom==='tv-1080'){
   const canvas=page.locator('.gc-livre__page--visible .gc-secrets__farine');await canvas.waitFor();const r=await canvas.boundingBox();assert(r);
   await page.screenshot({path:resolve(out,'farine-avant.png')});
   for(const y of [.38,.6,.48]){
    if(!await canvas.count())break;
    await page.mouse.move(r.x+r.width*.18,r.y+r.height*y);await page.mouse.down();await page.mouse.move(r.x+r.width*.82,r.y+r.height*y,{steps:14});await page.mouse.up();
   }
   await page.waitForSelector('[data-gc-quete-etape="serment"][data-gc-quete-revele="oui"]');assert.equal(await canvas.count(),0);
   assert((await page.locator('#gc-guide-quete blockquote').innerText()).includes(q.CACHETTES[0].revelation));ok('Balayer la farine révèle la clé et le serment, sans compteur ni saut de page');
   await page.locator('[data-gc-quete-principal]').click();assert.equal(await page.locator('#gc-guide-quete').count(),0);
   for(let index=1;index<q.CACHETTES.length;index++){
    const c=q.CACHETTES[index];await page.evaluate(hash=>location.hash=hash,c.double);
    await page.waitForFunction(id=>[...document.querySelectorAll('.gc-livre__page--visible [data-gc-page-cuite]')].some(el=>el.dataset.gcPageCuite===id)&&!document.querySelector('.gc-livre[data-gc-geste]'),c.page,{timeout:60000});await actif();
    const dessin=page.locator(`.gc-livre__page--visible [data-gc-secret="${c.id}"] button`);await dessin.waitFor();await dessin.focus();await page.keyboard.press('Enter');
    await page.waitForSelector(`[data-gc-quete-etape="${c.id}"][data-gc-quete-revele="oui"]`);assert.equal(await page.locator('#gc-guide-quete blockquote').innerText(),c.revelation);
    await page.locator('[data-gc-quete-principal]').click();assert.equal(await page.locator('#gc-guide-quete').count(),0);
   }
   assert.equal(await page.locator('.gc-quete__compagnon').getAttribute('data-gc-quete-progres'),'5');await ouvrir();
   assert((await page.locator('#gc-guide-quete').innerText()).includes('Joyeux anniversaire'));assert.equal(await page.locator('.gc-quete__archives li').count(),5);
   await page.locator('.gc-quete__recommencer').click();await page.keyboard.press('Escape');await page.evaluate(()=>location.hash='titre');await actif();
   await page.waitForSelector('.gc-livre__page--visible [data-gc-secret="serment"] button');
   await page.locator('.gc-livre__page--visible [data-gc-secret="serment"] button').focus();await page.keyboard.press('Enter');
   await page.waitForSelector('[data-gc-quete-etape="serment"][data-gc-quete-revele="oui"]');ok('Cinq découvertes naturelles au clavier, citations intactes, archivage et alternative clavier à la farine');
  }else{
   await page.evaluate(()=>location.hash='titre');await page.waitForSelector('.gc-livre__page--visible [data-gc-secret="serment"][data-gc-secret-actif="oui"] .gc-secrets__farine');await actif();const canvas=page.locator('.gc-livre__page--visible .gc-secrets__farine');await canvas.waitFor();
   await canvas.tap();await page.waitForSelector('[data-gc-quete-etape="serment"][data-gc-quete-revele="oui"]');await borne();ok('Mobile : toucher simple écarte aussi la farine');
  }
  assert.equal(await page.locator('.gc-secrets [title], .gc-quete__compagnon [title], #gc-guide-quete [title]').count(),0);
  await ctx.close();
 }
 assert.deepEqual(erreurs,[]);ok('Aucune erreur navigateur ni infobulle native dans les cachettes');
 writeFileSync(resolve(out,'rapport.json'),JSON.stringify({resultats},null,2));
}catch(e){if(page)await page.screenshot({path:resolve(out,'echec.png')}).catch(()=>{});writeFileSync(resolve(out,'echec.json'),JSON.stringify({resultats,erreur:String(e),erreurs},null,2));throw e;
}finally{await browser.close();cible.close();}
