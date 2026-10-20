import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {lancer} from './lib/verif.mjs';
const out='verification/out/recettes-v14';mkdirSync(out,{recursive:true});
const r=await build({entryPoints:['src/components/Aquarelle/tableaux.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {TABLEAUX,ETAPES_TABLEAUX,etatTableau,tableauDe}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
const noms={lisa:'carotte',emeline:'fondant-chocolat',clemence:'framboises-speculoos',pierrette:'citron',anatole:'tarte-myrtilles',lise:'tarte-pommes',julien:'cookies',laura:'crepes-banane'};
const preuves=[];
for(const [slug,nom]of Object.entries(noms)){
 const type=`recette-${slug}`,def=TABLEAUX[type];assert.equal(tableauDe(nom,`${slug}-droite`),type);assert.notEqual(tableauDe(nom,'gateaux-gauche'),type);
 for(const a of def.assets)assert(existsSync(`design-system/baked/${a}.webp`),a);
 const bornes=ETAPES_TABLEAUX[type];assert(bornes.length>=4&&bornes.length<=6);assert.equal(bornes.at(-1),def.duree);
 for(let t=8;t<def.duree;t+=8){assert(etatTableau(type,t-.001).acteurs.every(a=>a.alpha<.01));assert(etatTableau(type,t+.001).acteurs.every(a=>a.alpha<.01));}
 const images=[];for(let k=0;k<bornes.length;k++){const e=etatTableau(type,bornes[k]);assert.equal(e.legende.etape,k+1);assert.equal(e.legende.total,bornes.length);assert(e.acteurs.some(a=>a.alpha>.9));images.push({temps:bornes[k],legende:e.legende});}
 for(let t=0;t<=def.duree;t+=.05){const e=etatTableau(type,t);assert(e.acteurs.length<=24);assert(e.acteurs.every(a=>a.alpha>=0&&a.alpha<=1&&a.w>0&&[a.x,a.y,a.angle,a.sy??1].every(Number.isFinite)));}
 preuves.push({slug,etapes:images});
}
const casse=etatTableau('recette-emeline',1.3),fondu=etatTableau('recette-emeline',6);assert.equal(casse.acteurs.filter(a=>a.clip&&a.alpha>.9).length,2);assert.equal(fondu.acteurs.find(a=>a.asset.endsWith('/beurre')).alpha,0);assert(fondu.surface.alpha>.99);
const gateau=etatTableau('gateau-enchante',0,{},'gateau');assert.equal(gateau.flammes.length,1);assert(gateau.flammes[0].force>.5);
writeFileSync(out+'/contrats.json',JSON.stringify({preuves,chocolatCasse:true,beurreFondu:true,bougieGateaux:true},null,2));
const base=process.env.GC_TEST_URL??'http://127.0.0.1:5173';
const code=await build({stdin:{contents:`import {Theatre} from './src/components/Aquarelle/tableaux';import {assetInfo,assetUrl} from './src/lib/assets';
window.creer=async(slug,nom,type)=>{window.t?.detruire();document.body.replaceChildren();const host=document.createElement('div');Object.assign(host.style,{position:'relative',width:'1000px',height:'760px'});document.body.append(host);window.t=new Theatre(host,[{nom,zone:[0,0,1,1],angle:0,ordre:0}],n=>assetInfo(n)?new URL(assetUrl(n),'${base}/').href:undefined,()=>{},1000/760,slug+'-droite');const limite=Date.now()+20000;while(!window.t.disponible(nom,type)){if(Date.now()>limite)throw new Error('acteurs absents '+type);await new Promise(r=>setTimeout(r,30));}};`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',write:false});
const browser=await lancer({media:false});const p=await browser.newPage({viewport:{width:1000,height:760}}),erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
try{await p.routeWebSocket('**/*',ws=>ws.close());await p.goto(base);await p.setContent('<html><body style="margin:0;background:#f4ecd9"></body></html>');await p.addStyleTag({url:`${base}/src/components/Aquarelle/Aquarelle.css`});await p.addStyleTag({url:`${base}/design-system/tokens.css`});await p.addScriptTag({content:code.outputFiles[0].text});
 for(const [slug,nom]of Object.entries(noms)){
  const type=`recette-${slug}`;await p.evaluate(([s,n,t])=>window.creer(s,n,t),[slug,nom,type]);
  for(let k=0;k<ETAPES_TABLEAUX[type].length;k++){const t=ETAPES_TABLEAUX[type][k];await p.evaluate(([n,type,t])=>window.t.rendre(n,type,t,1,{temps:t,cible:t}),[nom,type,t]);await p.screenshot({path:`${out}/${slug}-${k+1}.png`});}
  assert.equal(await p.locator('[title],svg title').count(),0);assert.equal(await p.locator('.gc-recette-legende').count(),1);
 }
 assert.deepEqual(erreurs,[]);writeFileSync(out+'/captures.json',JSON.stringify({captures:preuves.reduce((n,p)=>n+p.etapes.length,0),erreurs},null,2));console.log('8 recettes / 39 étapes : acteurs, captions, chocolat, beurre, bougie et captures OK');
}finally{await browser.close();}
