import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {lancer,ouvrirCible,ouvrirPage,ecran,initReglages} from './lib/verif.mjs';
const out='verification/out/coherence-v12/guide-affichage';mkdirSync(out,{recursive:true});
const cible=await ouvrirCible({site:'dist/site'}),browser=await lancer({media:false});const results=[];
try{for(const nom of ['iphone13-paysage','tv-1080']){
 const {page,ctx}=await ouvrirPage(browser,cible,ecran(nom),'sommaire',{init:[initReglages({animations:'reduites',musiqueActive:false,feu:false,lectureAuto:false})]});
 await page.waitForSelector('.gc-quete__compagnon[data-gc-secret-actif="oui"]');
 const geometrie=await page.locator('.gc-quete__legende').evaluate(el=>{const r=el.getBoundingClientRect();const parent=el.closest('.gc-quete__compagnon').getBoundingClientRect();const pages=[...document.querySelectorAll('.gc-livre__page--visible .gc-page-cuite')].map(x=>x.getBoundingClientRect());return{r:{x:r.x,y:r.y,w:r.width,h:r.height},parent:{x:parent.x,y:parent.y,w:parent.width,h:parent.height},horsPapier:pages.every(p=>r.right<=p.left||r.left>=p.right||r.bottom<=p.top||r.top>=p.bottom),dansEcran:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,font:getComputedStyle(el).fontSize};});
 assert(geometrie.dansEcran,JSON.stringify(geometrie));assert(geometrie.horsPapier,JSON.stringify(geometrie));assert(geometrie.r.w<=geometrie.parent.w+1);
 const dessins=await page.locator('.gc-livre__page--visible [data-gc-page-cuite="sommaire"] [data-gc-aquarelle]').count();assert.equal(dessins,9,'huit vignettes et la tasse du titre');
 await page.screenshot({path:`${out}/${nom}-ferme.png`});
 await page.keyboard.press('s');await page.waitForSelector('#gc-guide-quete');
 const g=await page.locator('#gc-guide-quete').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,contenu:el.scrollWidth<=el.clientWidth+1,dansEcran:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}});assert(g.dansEcran&&g.contenu,JSON.stringify(g));
 await page.screenshot({path:`${out}/${nom}-guide.png`});results.push({nom,geometrie,guide:g,dessins});await ctx.close();
}}finally{await browser.close();await cible.close();}
writeFileSync(`${out}/rapport.json`,JSON.stringify(results,null,2));console.log('Guide et cartouche dans l’écran, hors papier ; 8 vignettes visibles : mobile et TV OK');
