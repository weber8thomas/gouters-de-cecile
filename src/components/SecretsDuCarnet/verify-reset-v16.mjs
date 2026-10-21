import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {lancer,ouvrirCible,ecran,initReglages} from '../../../scripts/lib/verif.mjs';
const opt=k=>{const n=process.argv.indexOf(`--${k}`);return n>=0?process.argv[n+1]:undefined;};
const out=resolve('verification/out/notes-reset-v16');mkdirSync(out,{recursive:true});
const resultat=[];const ok=(nom,preuve={})=>{resultat.push({nom,ok:true,...preuve});console.log('OK',nom);};
const module=await build({entryPoints:['src/lib/quete.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const q=await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].text).toString('base64')}`);
const revision=q.repriseQuete();const initial=q.etatQuete();q.agirQuete({type:'rejouer'});
assert.equal(q.repriseQuete(),revision+1);assert.notEqual(q.etatQuete(),initial);assert.deepEqual(q.etatQuete(),q.QUETE_INITIALE);
q.agirQuete({type:'rejouer'});assert.equal(q.repriseQuete(),revision+2);ok('Même à zéro découverte, chaque reprise invalide les gestes locaux');
// Fixture sans Carnet/Livre 3D : les composants de découverte restent les vrais composants.
const fixture=process.argv.includes('--fixture');
const fixtureCode=`
import React from 'react';import{createRoot}from'react-dom/client';
import{SecretsDuCarnet,CompagnonDuCarnet}from'./src/components/SecretsDuCarnet/SecretsDuCarnet';
import{EcranContext}from'./src/components/Ecran/contexte';import{setAssetResolver}from'./src/lib/assets';
import{CACHETTES}from'./src/lib/quete';import inventaire from'./design-system/assets.json';
setAssetResolver((nom,info)=>inventaire[nom]?'/design-system/'+inventaire[nom].file:info.u);
function Fixture(){const[controles,setControles]=React.useState(null);const[page,setPage]=React.useState('garde');
React.useEffect(()=>{const hash=()=>setPage(CACHETTES.find(c=>c.double===location.hash.slice(1))?.page??'garde');hash();addEventListener('hashchange',hash);return()=>removeEventListener('hashchange',hash);},[]);
return <div className="gc-ecran" style={{position:'relative',width:'100vw',height:'100vh'}}>
<EcranContext.Provider value={{controles,simule:true,vp:{}}}>
<div className="gc-livre" data-gc-etat="ouvert"><div className={'gc-livre__page gc-livre__page--visible '+page} style={{position:'absolute',left:20,top:20,width:'calc(100vw - 170px)',height:'calc(100vh - 40px)'}}>
<div className="gc-page-cuite" data-gc-page-cuite={page} style={{position:'relative',width:'100%',height:'100%',background:'#f4ebda'}}><SecretsDuCarnet key={page} page={page}/></div>
</div></div><div ref={setControles} style={{position:'absolute',inset:0,pointerEvents:'none'}}/><CompagnonDuCarnet/>
</EcranContext.Provider></div>;}createRoot(document.getElementById('fixture')).render(<Fixture/>);`;
const bundle=fixture?await build({stdin:{contents:fixtureCode,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',outdir:'/tmp/notes-reset-v16',define:{'process.env.NODE_ENV':'"production"'}}):null;
const scriptFixture=bundle?.outputFiles.find(f=>f.path.endsWith('.js'))?.text;
const styleFixture=bundle?.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
const cible=await ouvrirCible(opt('url')?{url:opt('url')}:{site:opt('site')??'dist/site'});const browser=await lancer({media:false});let page;const erreurs=[];
try{
 for(const nom of ['tv-1080','iphone13-paysage']){
  const ctx=await browser.newContext(ecran(nom).ctx);await ctx.routeWebSocket('**/*',ws=>ws.close());
  const init=initReglages({animations:'reduites',musiqueActive:false,lectureAuto:false,feu:false,vitesseEcriture:4,boutonsToujoursVisibles:true,luminosite:1.15});await ctx.addInitScript(init.fn,init.arg);
  await ctx.addInitScript(()=>localStorage.removeItem('gc:quete:v1'));
  page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));
  if(fixture){
   const adresse=new URL('/__notes_fixture__',cible.depart).toString();
   await page.route('**/__notes_fixture__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="fixture"></div></body></html>'}));
   await page.goto(adresse);
   await page.addStyleTag({content:readFileSync('design-system/tokens.css','utf8').replaceAll('url("fonts/','url("/design-system/fonts/')+styleFixture});
   await page.addScriptTag({content:scriptFixture});
  }else await page.goto(cible.url(ecran(nom),'titre'));
  const actif=()=>page.waitForSelector('.gc-quete__compagnon[data-gc-secret-actif="oui"]',{timeout:90000});await actif();
  const canvas=()=>page.locator('.gc-livre__page--visible .gc-secrets__farine');await canvas().waitFor();
  const poudre=()=>canvas().evaluate(el=>{const p=el.getContext('2d').getImageData(0,0,el.width,el.height).data;let n=0;for(let i=3;i<p.length;i+=4)n+=p[i];return n;});
  const reglages=await page.evaluate(()=>localStorage.getItem('gc:reglages:v4'));const entier=await poudre();assert(entier>0);
  const boutonBrosse=()=>page.locator('.gc-livre__page--visible [data-gc-secret="serment"] button');
  if(nom==='tv-1080'){await boutonBrosse().focus();await page.keyboard.press('Enter');}else await canvas().tap();
  assert.equal(await canvas().count(),1);const partiel=await poudre();assert(partiel<entier&&partiel>entier*.15);
  await page.keyboard.press('s');await page.waitForSelector('#gc-guide-quete');
  const reset=page.getByRole('button',{name:'Recommencer les découvertes',exact:true});assert.equal(await reset.count(),1);
  const borne=await reset.evaluate(el=>{const r=el.getBoundingClientRect(),g=el.closest('#gc-guide-quete').getBoundingClientRect();return{visible:r.top>=g.top&&r.bottom<=g.bottom+1&&r.right<=innerWidth&&r.left>=0,hauteur:r.height};});assert(borne.visible&&borne.hauteur>=44,JSON.stringify(borne));
  if(nom==='tv-1080'){await reset.focus();await page.keyboard.press('Enter');}else await reset.tap();
  await page.waitForFunction(()=>document.querySelector('.gc-quete__retour')?.textContent==='Tout est à redécouvrir.');
  await page.waitForFunction(n=>{const c=document.querySelector('.gc-livre__page--visible .gc-secrets__farine');if(!c)return false;const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let s=0;for(let i=3;i<p.length;i+=4)s+=p[i];return s===n;},entier);
  assert.equal(await page.locator('.gc-quete__archives').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('gc:reglages:v4')),reglages);
  assert.equal(await reset.evaluate(el=>el===document.activeElement),true);
  if(fixture||process.argv.includes('--captures'))await page.screenshot({path:resolve(out,`${nom}-reset-partiel.png`)});ok(`${nom} : reset disponible après frottage partiel, farine entière restaurée, réglages intacts`,{entier,partiel,borne});
  await page.keyboard.press('Escape');await boutonBrosse().focus();await page.keyboard.press('Enter');assert.equal(await canvas().count(),1,'un premier geste reste partiel après remise à zéro');
  for(let n=0;n<15&&await canvas().count();n++)await page.keyboard.press('Enter');
  await page.waitForSelector('[data-gc-quete-etape="serment"][data-gc-quete-revele="oui"]');
  await page.locator('[data-gc-quete-principal]').click();assert.equal(await page.locator('.gc-quete__compagnon').getAttribute('data-gc-quete-progres'),'1');
  await page.evaluate(()=>location.hash='cecile-1');await page.waitForSelector('.gc-livre__page--visible [data-gc-secret="album"][data-gc-secret-actif="oui"] button');await actif();
  await page.locator('.gc-livre__page--visible [data-gc-secret="album"] button').click();await page.waitForSelector('[data-gc-quete-etape="album"][data-gc-quete-revele="oui"]');
  await page.locator('[data-gc-quete-principal]').click();await page.keyboard.press('s');await page.waitForSelector('#gc-guide-quete');assert.equal(await page.locator('.gc-quete__archives li').count(),2);
  await reset.click();assert.equal(await page.locator('.gc-quete__archives').count(),0);assert.equal(await page.locator('.gc-quete__compagnon').getAttribute('data-gc-quete-progres'),'0');assert.equal(await page.locator('.gc-secrets[data-gc-secret="album"]').count(),0);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('gc:quete:v1'))),{trouves:0,revele:false});assert.equal(await page.evaluate(()=>localStorage.getItem('gc:reglages:v4')),reglages);
  await page.keyboard.press('Escape');await page.evaluate(()=>location.hash='titre');await page.waitForSelector('.gc-livre__page--visible [data-gc-secret="serment"][data-gc-secret-actif="oui"] .gc-secrets__farine');assert.equal(await poudre(),entier);
  ok(`${nom} : notes archivées et enveloppe refermées ; farine restaurée après découverte`);await ctx.close();
 }
 assert.deepEqual(erreurs,[]);ok('Aucune erreur navigateur ; aucun réglage audio ou lumière effacé');writeFileSync(resolve(out,'rapport.json'),JSON.stringify({cible:fixture?'fixture DOM des vrais composants':'livre complet',resultat},null,2));for(const f of ['echec.json','echec.png'])rmSync(resolve(out,f),{force:true});
}catch(e){if(page&&(fixture||process.argv.includes('--captures')))await page.screenshot({path:resolve(out,'echec.png')}).catch(()=>{});writeFileSync(resolve(out,'echec.json'),JSON.stringify({resultat,erreur:String(e),erreurs},null,2));throw e;}finally{await browser.close();cible.close();}
