import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {lancer,ouvrirCible,ecran,initReglages} from './lib/verif.mjs';
const out='verification/out/quete-v13/affichage';mkdirSync(out,{recursive:true});
const opt=k=>{const n=process.argv.indexOf(`--${k}`);return n>=0?process.argv[n+1]:undefined;};
const cible=await ouvrirCible(opt('url')?{url:opt('url')}:{site:opt('site')??'dist/site'}),browser=await lancer({media:false});const results=[];
try{for(const nom of ['iphone13-paysage','tv-1080']){
 const ctx=await browser.newContext(ecran(nom).ctx);
 const init=initReglages({animations:'reduites',musiqueActive:false,feu:false,lectureAuto:false,boutonsToujoursVisibles:true});
 await ctx.addInitScript(init.fn,init.arg);
 // Pas de rechargement HMR pendant les mesures, même quand l’aperçu Vite évolue.
 await ctx.routeWebSocket('**/*',ws=>ws.close());
 const page=await ctx.newPage();await page.goto(cible.url(ecran(nom),'sommaire'));
 await page.waitForSelector('.gc-quete__compagnon[data-gc-secret-actif="oui"]');
 const geometrie=await page.locator('.gc-quete__legende').evaluate(el=>{const r=el.getBoundingClientRect();const parent=el.closest('.gc-quete__compagnon').getBoundingClientRect();const pages=[...document.querySelectorAll('.gc-livre__page--visible .gc-page-cuite')].map(x=>x.getBoundingClientRect());return{r:{x:r.x,y:r.y,w:r.width,h:r.height},parent:{x:parent.x,y:parent.y,w:parent.width,h:parent.height},horsPapier:pages.every(p=>r.right<=p.left||r.left>=p.right||r.bottom<=p.top||r.top>=p.bottom),dansEcran:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,font:getComputedStyle(el).fontSize};});
 assert(geometrie.dansEcran,JSON.stringify(geometrie));assert(geometrie.horsPapier,JSON.stringify(geometrie));assert(geometrie.r.w<=geometrie.parent.w+1);
 const dessins=await page.locator('.gc-livre__page--visible [data-gc-page-cuite="sommaire"] [data-gc-aquarelle]').count();assert.equal(dessins,9,'huit vignettes et la tasse du titre');
 await page.screenshot({path:`${out}/${nom}-ferme.png`});
 await page.keyboard.press('s');await page.waitForSelector('#gc-guide-quete');
 const g=await page.locator('#gc-guide-quete').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,contenu:el.scrollWidth<=el.clientWidth+1,dansEcran:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}});assert(g.dansEcran&&g.contenu,JSON.stringify(g));
 await page.screenshot({path:`${out}/${nom}-guide.png`});results.push({nom,geometrie,guide:g,dessins});
 if(nom==='tv-1080'){
  const salut=await page.evaluate(()=>{
   // Même SVG et mêmes règles que le compagnon, isolés pour figer le geste sans animer tout le livre.
   const source=document.querySelector('svg.gc-quete__chien');if(!source)throw new Error('chien SVG absent');
   const fixture=document.createElement('div');fixture.className='gc-quete__compagnon';fixture.dataset.gcQueteReduit='non';
   Object.assign(fixture.style,{position:'fixed',left:'0',top:'0',width:'300px',height:'400px',zIndex:'999'});
   fixture.append(source.cloneNode(true));document.body.append(fixture);
   const tete=fixture.querySelector('.gc-quete__tete'),corps=fixture.querySelector('image');
   const fixe=corps.getCTM().toString();tete.classList.remove('gc-quete__tete--salue');void tete.getBoundingClientRect();tete.classList.add('gc-quete__tete--salue');
   const animation=tete.getAnimations()[0];if(!animation)throw new Error('salut non animé');animation.pause();animation.currentTime=315;
   const matrice=tete.getCTM(),angle=Math.atan2(matrice.b,matrice.a)*180/Math.PI;
   const stable=fixe===corps.getCTM().toString();
   fixture.id='gc-quete-fixture-salut';return{stable,angle,animation:animation.animationName};
  });
  assert(salut.stable,'le corps reste fixe pendant le hochement');assert(Math.abs(salut.angle)>0.2&&Math.abs(salut.angle)<1.5,JSON.stringify(salut));
  await page.locator('#gc-quete-fixture-salut').screenshot({path:`${out}/chien-salut.png`});
  const reduit=await page.locator('#gc-quete-fixture-salut').evaluate(el=>{el.dataset.gcQueteReduit='oui';return getComputedStyle(el.querySelector('.gc-quete__tete')).animationName;});assert.equal(reduit,'none');
  results.push({nom:'salut-isole',...salut,reduit});
 }
 await ctx.close();
}}finally{await browser.close();await cible.close();}
writeFileSync(`${out}/rapport.json`,JSON.stringify(results,null,2));console.log('Guide et cartouche dans l’écran, hors papier ; 8 vignettes visibles : mobile et TV OK');
