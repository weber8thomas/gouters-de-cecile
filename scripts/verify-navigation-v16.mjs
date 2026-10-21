// Vrai Livre animé, commandes clavier pendant un geste et recherche du carnet reçu.
// La fixture garde les pages textuelles légères ; une passe séparée monte aussi le Carnet réel.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { lancer, serve, ROOT } from './lib/verif.mjs';
const out='verification/out/navigation-v16';mkdirSync(out,{recursive:true});
const carnet=JSON.parse(readFileSync('src/content/carnet.json'));
const spec=carnet.doubles.map((d,k)=>({id:d.id,kind:d.type,titre:d.titre,invites:d.invites,folios:[2*k+2,2*k+3]}));
const b=await build({entryPoints:['src/components/NavigationCarnet/recherche.ts'],bundle:true,platform:'node',format:'esm',write:false});
const recherche=await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
const index=recherche.indexerCarnet(spec);
assert.equal(index.length,spec.filter(s=>['recette','deux-recettes','video'].includes(s.kind)).length);
assert.deepEqual(recherche.rechercherCarnet(index,'Lisa cannelle').map(r=>r.id),['lisa']);
assert.deepEqual(recherche.rechercherCarnet(index,'clemence cheesecake').map(r=>r.id),['clemence']);
assert.deepEqual(recherche.rechercherCarnet(index,'Laura amandes').map(r=>r.id),['laura-geyer']);
assert.deepEqual(recherche.rechercherCarnet(index,'œufs').map(r=>r.id),recherche.rechercherCarnet(index,'oeufs').map(r=>r.id));
assert.equal(recherche.rechercherCarnet(index,'zzzintrouvable').length,0);
if(process.argv.includes('--final')) {assert.equal(index.length,18);assert.ok(index.every(e=>e.lignes.length>0),'les dix-huit recettes ont leur texte cuit indexé');}
console.log(`INDEX OK : ${index.length} recettes, auteurs/titres/ingrédients et accents.`);
if(process.argv.includes('--index-seul')) process.exit(0);
const globals={react:'module.exports=window.React;', 'react-dom':'module.exports=window.ReactDOM;', 'react-dom/client':'module.exports=window.ReactDOM;', 'react/jsx-runtime':'var R=window.React;function jsx(t,p,k){return R.createElement(t,k===undefined?p:Object.assign({},p,{key:k}));}module.exports={jsx,jsxs:jsx,Fragment:R.Fragment};'};
const sourceLivre=readFileSync('src/components/Livre/Livre.tsx','utf8');
assert.equal(sourceLivre.split('apiRef.current = {').length,2);
await build({stdin:{contents:`export {Livre,CameraProvider} from './src/components/Livre';export {Ecran} from './src/components/Ecran';export {NavigationCarnet} from './src/components/NavigationCarnet';`,resolveDir:ROOT,loader:'ts'},outfile:`${out}/geste/bundle.js`,bundle:true,format:'iife',globalName:'GoutersDeCecile',minify:true,define:{'process.env.NODE_ENV':'"production"'},loader:{'.svg':'text','.webp':'dataurl','.png':'dataurl','.woff2':'empty'},plugins:[
 {name:'decor-canvas-absents-du-banc',setup(p){p.onLoad({filter:/components[/\\](Bougie[/\\]Bougie|Magie[/\\]Magie)\.tsx$/},a=>({contents:a.path.includes('Bougie')?'export const Bougie=()=>null;':'export const Magie=()=>null;',loader:'tsx'}));}},
 {name:'diagnostic-livre-test-seulement',setup(p){p.onLoad({filter:/components[/\\]Livre[/\\]Livre\.tsx$/},a=>({contents:sourceLivre.replace('apiRef.current = {',`apiRef.current = { etat:()=>({affiche:afficheRef.current,cible:cibleRef.current,p:p.get(),animation:!!animRef.current,tour:tourRef.current?{id:tourRef.current.id,but:tourRef.current.but,lo:tourRef.current.lo,hi:tourRef.current.hi,doigt:tourRef.current.doigt,lance:tourRef.current.lance}:null,doigt:doigtRef.current?{id:doigtRef.current.id,etat:doigtRef.current.etat,apres:doigtRef.current.apres}:null}),`),loader:'tsx',resolveDir:dirname(a.path)}));}},
 {name:'react-umd',setup(p){p.onResolve({filter:/^react(-dom)?(\/client|\/jsx-runtime|\/jsx-dev-runtime)?$/},a=>({path:a.path,namespace:'react-umd'}));p.onLoad({filter:/.*/,namespace:'react-umd'},a=>({contents:globals[a.path]}));}},
]});
const bundle=`/${out}/geste`;
writeFileSync(`${out}/fixture.html`,`<!doctype html><html lang="fr" data-theme="carnet"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/design-system/tokens.css"><link rel="stylesheet" href="${bundle}/bundle.css"><style>html,body{margin:0;height:100%;overflow:hidden}.page-test{height:100%;box-sizing:border-box;padding:40px;background:#f6e7c5;color:#34271d;font:32px var(--font-hand)}</style><script src="/node_modules/react/umd/react.production.min.js"></script><script src="/node_modules/react-dom/umd/react-dom.production.min.js"></script><script src="${bundle}/bundle.js"></script><div id="app"></div><script>
const R=React,G=GoutersDeCecile,spreads=${JSON.stringify(spec)}.map(s=>({...s,render:()=>({left:R.createElement('div',{className:'page-test'},s.titre),right:R.createElement('div',{className:'page-test'},'Le carnet continue…')})}));
window.banc={evenements:[],indices:[],spreads};document.addEventListener('gc-livre-geste',e=>window.banc.evenements.push({...e.detail,t:performance.now()}));
function App(){const[i,set]=R.useState(spreads.findIndex(s=>s.id==='lisa')),api=R.useRef(null);window.banc.api=api;const aller=i=>api.current?api.current.aller(i):set(i);return R.createElement(G.CameraProvider,{keyboard:true},R.createElement(G.Ecran,{pleinEcran:false},R.createElement(G.Livre,{spreads,index:i,onIndexChange:i=>{window.banc.indices.push(i);set(i)},keyboard:true,cover:R.createElement('p',null,'Les goûters de Cécile'),apiRef:api}),R.createElement(G.NavigationCarnet,{spreads,onAller:aller})));}ReactDOM.createRoot(document.getElementById('app')).render(R.createElement(App));</script>`);
const srv=await serve(ROOT),browser=await lancer(),checks=[],erreurs=[];
const garde=setTimeout(()=>{console.error('Délai maximal du créneau navigateur atteint');void browser.close();},240000);
const ok=(nom,condition,detail)=>{assert.ok(condition,`${nom}: ${JSON.stringify(detail)}`);checks.push({nom,detail});writeFileSync(`${out}/progression.json`,JSON.stringify({checks,erreurs},null,2));console.log(`OK ${nom}`);};
const init=()=>localStorage.setItem('gc:reglages:v4',JSON.stringify({v:1,animations:'completes',musiqueActive:false,sonsLivre:false,lectureAuto:false,boutonsToujoursVisibles:true}));
const actuel=p=>p.locator('.gc-livre-ecran').getAttribute('data-gc-double').then(Number);
const diagnostic=p=>Promise.race([p.evaluate(()=>({double:document.querySelector('.gc-livre-ecran')?.getAttribute('data-gc-double'),geste:document.querySelector('.gc-livre')?.getAttribute('data-gc-geste'),coin:document.querySelector('.gc-livre')?.getAttribute('data-gc-coin'),etat:window.banc?.api?.current?.etat(),indices:window.banc?.indices,evenements:window.banc?.evenements?.slice(-12)})),new Promise(r=>setTimeout(()=>r('lecture du navigateur bloquée'),2000))]);
const attendre=async(p,i)=>{try{await p.waitForFunction(i=>Number(document.querySelector('.gc-livre-ecran')?.getAttribute('data-gc-double'))===i&&!document.querySelector('.gc-livre')?.hasAttribute('data-gc-geste'),i,{timeout:60000,polling:100});}catch(e){console.log('ATTENTE KO',i,await diagnostic(p));throw e;}};
try{
 const ctx=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:1});await ctx.addInitScript(init);
 const p=await ctx.newPage();p.on('pageerror',e=>{erreurs.push(String(e));console.log('PAGEERROR',String(e))});await p.goto(`${srv.url}/${out}/fixture.html`,{waitUntil:'domcontentloaded'});
 const lisa=spec.findIndex(s=>s.id==='lisa'),sommaire=spec.findIndex(s=>s.id==='sommaire');await attendre(p,lisa);await p.waitForTimeout(800);
 console.log('INITIAL',await diagnostic(p));await p.evaluate(()=>{for(let k=0;k<3;k++)document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));});
 console.log('TROIS DEMANDES',await diagnostic(p));await attendre(p,lisa+3);
 ok('trois demandes de flèche pendant le coin animé atteignent trois doubles pages plus loin',await actuel(p)===lisa+3,await p.evaluate(()=>window.banc.indices));
 await p.waitForTimeout(700);await p.evaluate(()=>{document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true}));});await attendre(p,sommaire);
 ok('Sommaire demandé pendant un tour est conservé',await actuel(p)===sommaire);
 const gestes=await p.evaluate(()=>window.banc.evenements);ok('les animations de page restent présentes',gestes.some(g=>g.phase==='debut'&&g.type==='page')&&gestes.some(g=>g.phase==='fin'&&g.type==='page'));
 await p.keyboard.press('/');const champ=p.getByLabel('Un nom, une recette ou un ingrédient');await champ.waitFor();ok('le raccourci recherche place le focus dans le champ',await champ.evaluate(e=>e===document.activeElement));
 await champ.fill('cannelle Lisa');ok('recherche ingrédients et auteur cumulés',await p.locator('[data-gc-resultat]').count()===1&&await p.locator('[data-gc-resultat="lisa"]').count()===1);
 const stable=await actuel(p);await p.keyboard.press('ArrowDown');ok('les flèches du dialogue choisissent un résultat sans feuilleter',await actuel(p)===stable&&await p.locator('[data-gc-resultat="lisa"]').evaluate(e=>e===document.activeElement));
 if(process.argv.includes('--captures'))await p.screenshot({path:`${out}/recherche-clavier.png`});await p.keyboard.press('Enter');await attendre(p,lisa);ok('Entrée ouvre la recette trouvée',await actuel(p)===lisa&&await p.locator('[data-gc-recherche]').count()===0);
 await p.getByRole('button',{name:'Rechercher une recette',exact:true}).focus();await p.keyboard.press('Enter');await champ.fill('zzzintrouvable');ok('absence de résultat annoncée',await p.getByText('Aucune recette trouvée. Essayez un autre mot.').isVisible());
 await p.keyboard.press('Escape');await p.locator('[data-gc-recherche]').waitFor({state:'detached'});ok('Échap rend le focus au signet recherche',await p.getByRole('button',{name:'Rechercher une recette',exact:true}).evaluate(e=>e===document.activeElement));
 await ctx.close();
 const mobile=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true,isMobile:true});await mobile.addInitScript(init);const m=await mobile.newPage();m.on('pageerror',e=>erreurs.push(String(e)));await m.goto(`${srv.url}/${out}/fixture.html`,{waitUntil:'domcontentloaded'});await attendre(m,lisa);
 await m.getByRole('button',{name:'Rechercher une recette',exact:true}).tap();const entree=m.getByLabel('Un nom, une recette ou un ingrédient');await entree.fill('Laura amandes');const cible=m.locator('[data-gc-resultat="laura-geyer"]');await cible.waitFor();
 const dimensions=await cible.boundingBox(),cadre=await m.locator('[data-gc-recherche]').boundingBox();ok('recherche mobile : cible tactile et fiche dans la fenêtre',dimensions.height>=44&&cadre.x>=0&&cadre.y>=0&&cadre.x+cadre.width<=845&&cadre.y+cadre.height<=391,{dimensions,cadre});
 if(process.argv.includes('--captures'))await m.screenshot({path:`${out}/recherche-mobile.png`});await cible.tap();await attendre(m,spec.findIndex(s=>s.id==='laura-geyer'));ok('le toucher ouvre la recette correspondante sur mobile',await m.locator('[data-gc-recherche]').count()===0);await mobile.close();
 // Vérifier le montage réel dans Carnet et ses données, indépendamment de la fixture de geste.
 if(process.argv.includes('--carnet-reel')) {const app=await browser.newContext({viewport:{width:960,height:650},deviceScaleFactor:1});await app.addInitScript(()=>localStorage.setItem('gc:reglages:v4',JSON.stringify({v:1,animations:'reduites',musiqueActive:false,sonsLivre:false,lectureAuto:false,boutonsToujoursVisibles:true})));const a=await app.newPage();a.on('pageerror',e=>erreurs.push(String(e)));await a.goto(`${srv.url}/harness/devices.html?b=dist/ds-navigation-v16/components#lisa`);await a.getByRole('button',{name:'Rechercher une recette',exact:true}).waitFor({timeout:30000});await a.getByRole('button',{name:'Rechercher une recette',exact:true}).click();await a.getByLabel('Un nom, une recette ou un ingrédient').fill('muscade');ok('le Carnet réel monte la recherche et indexe ses ingrédients',await a.locator('[data-gc-resultat="lisa"]').isVisible());await app.close();}
 ok('aucune erreur navigateur',erreurs.length===0,erreurs);
 writeFileSync(`${out}/rapport.json`,JSON.stringify({checks,erreurs,recettesIndexees:index.length,gestes,environnement:'Chromium Linux, ordinateur 960 × 540 au clavier et mobile paysage DPR 1 émulé ; fixture du vrai Livre à pages textuelles, Bougie et Magie remplacées par null uniquement dans le bundle de test'},null,2));
 console.log(`${checks.length} contrôles navigateur OK ; index : ${index.length} recettes.`);
}finally{clearTimeout(garde);await browser.close();await srv.close();}
