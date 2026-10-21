/** Le vrai dialogue et ses scènes SVG, sans coût du livre WebGL derrière la fixture. */
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {lancer} from './lib/verif.mjs';
const base=process.env.GC_TEST_URL??'http://127.0.0.1:5173';
const out='verification/out/coherence-v16/cuisine';mkdirSync(out,{recursive:true});
const b=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ModeCuisine} from './src/components/Aquarelle/ModeCuisine';import {CUISINE_EVENT} from './src/components/Aquarelle/tableaux';
window.creer=()=>{document.body.innerHTML='<button id="ouvrir">Démarrer la recette</button><div id="app"></div>';createRoot(document.getElementById('app')).render(React.createElement(ModeCuisine,{page:'emeline-droite'}));document.getElementById('ouvrir').onclick=()=>window.dispatchEvent(new CustomEvent(CUISINE_EVENT,{detail:{page:'emeline-droite',nom:'fondant-chocolat',type:'recette-emeline'}}));};`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},platform:'browser',format:'iife',write:false});
const browser=await lancer({media:false});const erreurs=[],preuves=[];
try{for(const [nom,viewport]of [['tv',{width:1920,height:1080}],['mobile',{width:390,height:844}]]){
 const p=await browser.newPage({viewport});p.on('pageerror',e=>erreurs.push(String(e)));await p.routeWebSocket('**/*',ws=>ws.close());await p.route('**/__cuisine_fixture__',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await p.goto(base+'/__cuisine_fixture__');await p.setContent('<html><body style="margin:0;background:#f4ecd9"></body></html>');
 for(const f of ['design-system/tokens.css','src/components/Aquarelle/Aquarelle.css','src/components/Aquarelle/ModeCuisine.css'])await p.addStyleTag({content:readFileSync(f,'utf8').replaceAll('url("fonts/',`url("${base}/design-system/fonts/`)});
 await p.addScriptTag({content:b.outputFiles[0].text});await p.evaluate(()=>window.creer());
 await p.waitForTimeout(100);await p.locator('#ouvrir').click();const dialog=p.locator('dialog');await dialog.waitFor({state:'visible'});assert.equal(await p.getByRole('heading',{name:'Les ingrédients',exact:true}).count(),1);
 assert.equal(await dialog.getAttribute('data-mode'),'etapes');assert.equal(await p.getByRole('button',{name:'Mode pas à pas',exact:true}).getAttribute('aria-pressed'),'true');
 const cases=p.getByRole('checkbox');assert(await cases.count()>3);await cases.first().check();assert(await cases.first().isChecked());
 await p.getByRole('button',{name:'Commencer la préparation'}).click();await p.getByRole('heading',{name:'Étape 1 sur 5',exact:true}).waitFor();
 await p.waitForFunction(()=>document.querySelector('.gc-cuisine__dessin svg[data-gc-tableau]'));assert(await p.evaluate(async()=>{const n=[...document.querySelectorAll('.gc-cuisine__dessin image')].find(n=>n.getAttribute('href')?.includes('/hd/acteurs/casserole'));if(!n)return false;const i=new Image();i.src=n.getAttribute('href');await i.decode();return i.naturalWidth>=1200;}),'La casserole du mode cuisine charge réellement sa source haute définition');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(9000);assert.equal(await p.getByRole('heading',{name:'Étape 1 sur 5',exact:true}).count(),1,'Le mode manuel ne passe pas à la recette suivante seul');await p.screenshot({path:`${out}/${nom}-etape-1.png`});
 await p.getByRole('button',{name:'Suivante',exact:true}).focus();await p.keyboard.press('Enter');await p.getByRole('heading',{name:'Étape 2 sur 5',exact:true}).waitFor();
 await p.keyboard.press('ArrowLeft');await p.getByRole('heading',{name:'Étape 1 sur 5',exact:true}).waitFor();
 await p.getByRole('button',{name:'Voir les ingrédients',exact:true}).click();assert(await cases.first().isChecked());
 await p.getByRole('button',{name:'Lecture auto',exact:true}).click();await p.getByRole('heading',{name:'Étape 1 sur 5',exact:true}).waitFor();
 await p.getByRole('button',{name:'Mode pas à pas',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Lecture auto',exact:true}).getAttribute('aria-pressed'),'false');
 const rects=await p.locator('.gc-cuisine__pied button,.gc-cuisine__entete button').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));assert(rects.every(r=>r.x>=0&&r.y>=0&&r.x+r.w<=viewport.width+1&&r.y+r.h<=viewport.height+1),'Commandes visibles');
 assert.equal(await dialog.locator('[title],svg title').count(),0);await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await p.locator('#ouvrir').evaluate(n=>document.activeElement===n),true);
 preuves.push({format:nom,ingredientsCochables:true,etapesClavier:true,retourIngredientsConserve:true,autoEtManuel:true,commandesVisibles:true,focusRestaure:true});await p.close();
 }assert.deepEqual(erreurs,[]);writeFileSync(`${out}/rapport.json`,JSON.stringify({preuves,erreurs},null,2));console.log('Mode cuisine : ingrédients, étapes, clavier, commandes et focus OK sur TV/mobile');
}finally{await browser.close();}
