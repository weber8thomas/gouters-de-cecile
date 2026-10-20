import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lancer, ouvrirCible, ecran } from './lib/verif.mjs';
const out=resolve('verification/out/quete-v12');
const compiled=await build({entryPoints:['src/lib/quete.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const q=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const checks=[];
const check=(nom,f)=>{f();checks.push({nom,ok:true});console.log('OK',nom);};
check('une étape future ne peut ni se révéler ni se valider',()=>{
 for(let i=1;i<q.CACHETTES.length;i++)for(const type of ['reveler','valider'])assert.equal(q.avancerQuete(q.QUETE_INITIALE,{type,index:i}),q.QUETE_INITIALE);
});
check('cinq révélations et confirmations séquentielles puis rejouer',()=>{
 let etat=q.QUETE_INITIALE;
 for(let index=0;index<q.CACHETTES.length;index++){
  assert.equal(q.avancerQuete(etat,{type:'valider',index}),etat);
  etat=q.avancerQuete(etat,{type:'reveler',index}); assert.equal(etat.revele,true);
  etat=q.avancerQuete(etat,{type:'valider',index}); assert.equal(etat.trouves,index+1);
 }
 assert.deepEqual(q.avancerQuete(etat,{type:'rejouer'}),q.QUETE_INITIALE);
});
check('progression persistée validée, valeurs corrompues ignorées',()=>{
 for(const v of [null,'bad','{}','{"trouves":-1}','{"trouves":6}','{"trouves":1.5}'])assert.deepEqual(q.lireEtatQuete(v),q.QUETE_INITIALE);
 assert.deepEqual(q.lireEtatQuete('{"trouves":3,"revele":true}'),{trouves:3,revele:true});
});
const opt=(k)=>{const n=process.argv.indexOf(`--${k}`);return n>=0?process.argv[n+1]:undefined;};
const cible=await ouvrirCible({site:opt('site'),url:opt('url'),bundle:opt('bundle')??'dist/ds-quete/components'});
const browser=await lancer({media:false});
let page;
try {
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 await context.addInitScript(()=>{if(!sessionStorage.getItem('quete-test-init')){
  localStorage.removeItem('gc:quete:v1');
  localStorage.setItem('gc:reglages:v4',JSON.stringify({animations:'completes',feu:false,musiqueActive:false,lectureAuto:false,boutonsToujoursVisibles:true,vitesseEcriture:4}));
  sessionStorage.setItem('quete-test-init','1');
 }});
 page=await context.newPage();
 const erreurs=[];page.on('pageerror',e=>erreurs.push(e.message));
 const capturer=async(nom)=>{await page.waitForFunction(()=>!document.querySelector('.gc-livre__page--visible [data-gc-ecrit="a-ecrire"]'),null,{timeout:30000});await page.waitForTimeout(450);await page.screenshot({path:resolve(out,nom)});};
 console.log('TV ouverture'); await page.goto(cible.url(ecran('tv-1080'),'titre'),{waitUntil:'domcontentloaded'});
 await page.waitForSelector('.gc-quete__compagnon[data-gc-secret-actif="oui"]',{timeout:90000});
 await page.waitForTimeout(1800); console.log('TV actif');
 const corps=await page.locator('body').innerText();
 assert.ok(!corps.includes('glissé sur le ventre'));
 assert.equal(await page.locator('.gc-livre__page img[src*="jack-russell"]').count(),0);
 const visible=()=>page.locator('.gc-livre__page--visible [data-gc-page-cuite]').evaluateAll(es=>es.map(e=>e.dataset.gcPageCuite));
 const avant=await visible();
 await page.keyboard.press('s'); await page.waitForTimeout(200); console.log('TV S',await page.evaluate(()=>({guide:document.querySelector('#gc-guide-quete')?.outerHTML.slice(0,300),stock:localStorage.getItem('gc:quete:v1')})));
 await page.waitForSelector('[data-gc-quete-etape="serment"][data-gc-quete-revele="oui"]');
 assert.deepEqual(await visible(),avant);
 assert.ok((await page.locator('#gc-guide-quete').innerText()).includes('Je jure solennellement que mes intentions sont gourmandes'));
 await capturer('tv-01-serment.png');
 await page.locator('[data-gc-quete-principal]').focus(); await page.keyboard.press('Enter');
 await page.waitForSelector('[data-gc-quete-etape="album"]');
 assert.deepEqual(await visible(),avant);
 checks.push({nom:'S révèle le serment, Entrée débloque album, aucune navigation automatique',ok:true});
 await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.gc-quete__compagnon[data-gc-secret-actif="oui"]',{timeout:90000});
 assert.equal(await page.locator('.gc-quete__compagnon').getAttribute('data-gc-quete-progres'),'1');
 await page.keyboard.press('s'); await page.waitForSelector('[data-gc-quete-etape="album"][data-gc-quete-revele="non"]');
 assert.equal(await page.locator('[data-gc-quete-principal]').count(),0);
 checks.push({nom:'rechargement conserve 1/5 ; S sur une autre page donne la piste sans révéler',ok:true});
 const geometrie=await page.locator('.gc-quete__compagnon').evaluate(el=>{
  const r=el.getBoundingClientRect(),root=el.closest('.gc-ecran');
  const pages=[...root.querySelectorAll('.gc-livre__page--visible .gc-page-cuite')].map(p=>p.getBoundingClientRect());
  const chevauche=b=>r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;
  return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},horsPapier:pages.every(p=>!chevauche(p)),animations:el.getAnimations({subtree:true}).length,src:el.querySelector('img')?.src};
 });
 assert.ok(geometrie.horsPapier);assert.equal(geometrie.animations,0);
 checks.push({nom:'chien assis extérieur aux pages, aucune animation de pose',ok:true,...geometrie});
 await page.keyboard.press('Escape');
 for(const [index,hash] of [[1,'cecile-1'],[2,'cecile-2'],[3,'gateaux'],[4,'fin']]){
  await page.evaluate(h=>location.hash=h,hash);
  await page.waitForFunction(h=>[...document.querySelectorAll('.gc-livre__page--visible [data-gc-page-cuite]')].some(el=>el.dataset.gcPageCuite.startsWith(h))&&!document.querySelector('.gc-livre[data-gc-geste]'),hash,{timeout:60000});
  await page.waitForSelector('.gc-quete__compagnon[data-gc-secret-actif="oui"]');
  await page.keyboard.press('s');
  await page.waitForSelector(`[data-gc-quete-etape="${q.CACHETTES[index].id}"][data-gc-quete-revele="oui"]`);
  if(index===2){
   const t=await page.locator('#gc-guide-quete').innerText();assert.ok(t.includes('Oh, Cécile est si calme et douce…'));assert.ok(t.includes('Scorpion ascendant Scorpion. Les proches savent.'));
  }
  if(index===1||index===2||index===3)await capturer(`tv-0${index+1}-${hash}.png`);
  const locationAvant=page.url();
  await page.locator('[data-gc-quete-principal]').click();
  assert.equal(page.url(),locationAvant);
  await page.keyboard.press('Escape');
 }
 await page.keyboard.press('s');
 await page.waitForSelector('[data-gc-quete-progres="5"]');
 assert.ok((await page.locator('#gc-guide-quete').innerText()).includes('Tous les secrets sont retrouvés !'));
 await capturer('tv-06-final.png');
 await page.locator('[data-gc-quete-principal]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('.gc-quete__compagnon').getAttribute('data-gc-quete-progres'),'0');
 checks.push({nom:'quête intégrale via navigation volontaire : albums, Scorpion, cuisine, final et rejouer',ok:true});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.gc-livre__page img[src*="jack-russell"]').count(),0);
 assert.deepEqual(erreurs,[]);
 checks.push({nom:'aucune erreur navigateur, aucune silhouette de chien dans le papier',ok:true});
 writeFileSync(resolve(out,'preuves.json'),JSON.stringify({checks},null,2)+'\n');
} catch(e) {
 console.error(e); if(page)await page.screenshot({path:resolve(out,'echec.png')}).catch(()=>{});
 writeFileSync(resolve(out,'echec.json'),JSON.stringify({checks,erreur:String(e)},null,2));process.exitCode=1;
} finally {await browser.close();cible.close();}
