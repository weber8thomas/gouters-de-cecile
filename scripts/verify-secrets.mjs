// Vérification rapide de la sécurité des marges ; --site dist/site ajoute un contrôle TV réel.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const code = await build({ entryPoints:['src/lib/secrets.ts'], bundle:true, write:false, format:'esm', platform:'node' });
const { zoneLibreSecret, placerCompagnon, numeroSecret, SECRETS } = await import(`data:text/javascript;base64,${Buffer.from(code.outputFiles[0].text).toString('base64')}`);
const checks = [];
function verifier(nom, f) { f(); checks.push({ nom, ok:true }); console.log(`OK ${nom}`); }
const W=100,H=100;
const blanc = () => new Uint8ClampedArray(W*H*4);
const chevauche = (a,b) => a[0]+a[2]>b[0] && a[0]<b[0]+b[2] && a[1]+a[3]>b[1] && a[1]<b[1]+b[3];

verifier('la page vide réserve une grande vignette, pas un minuscule chien', () => {
  const r=zoneLibreSecret(blanc(),W,H,[]); assert.ok(r); assert.ok(r[3]>=.20);
});
verifier('encre dense : aucune vignette sur la recette', () => {
  const a=blanc(); for(let i=3;i<a.length;i+=4)a[i]=255;
  assert.equal(zoneLibreSecret(a,W,H,[]),null);
});
verifier('photo pleine page : aucune vignette ni traversée', () => assert.equal(zoneLibreSecret(blanc(),W,H,[[0,0,1,1]]),null));
verifier('une photo, un lien et un feuillet restent tous protégés', () => {
  const zones=[[0,0,.5,.5],[.5,.5,.5,.5],[0,.5,.30,.5]];
  const r=zoneLibreSecret(blanc(),W,H,zones); assert.ok(r); assert.ok(zones.every(z=>!chevauche(r,z)));
});
verifier('une carte alpha inconnue ne rend pas le chien sur du contenu inconnu', () => assert.equal(zoneLibreSecret(new Uint8ClampedArray(1),W,H,[]),null));
verifier('un fragment de place insuffisant ne fait pas découper un chien', () => {
  const a=blanc(); for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!(x>40&&x<55&&y>70))a[(y*W+x)*4+3]=255;
  assert.equal(zoneLibreSecret(a,W,H,[]),null);
});
verifier('la bibliothèque possède 12 surprises et quatre histoires de chien', () => {
  assert.equal(new Set(SECRETS.map(s=>s.id)).size,12); assert.equal(SECRETS.filter(s=>'chien'in s).length,4);
  assert.ok([...Array(40)].every((_,i)=>numeroSecret(`page-${i}`,'gauche')<4));
});
verifier('compagnon extérieur : livre, bougie et bords écran protégés aux trois distances', () => {
  for(const livre of [[250,120,1420,840],[330,160,1260,750],[420,210,1080,640]]) {
    const bougie=[120,700,120,250];
    const r=placerCompagnon([0,0,1920,1080],livre,bougie);
    assert.ok(r); assert.ok(r[3]>=125); assert.ok(!chevauche(r,livre)); assert.ok(!chevauche(r,bougie));
    assert.ok(r[0]>=0&&r[1]>=0&&r[0]+r[2]<=1920&&r[1]+r[3]<=1080);
  }
});
verifier('loupe plein écran : aucune superposition improvisée sur le texte', () => assert.equal(placerCompagnon([0,0,1920,1080],[-100,-100,2120,1280]),null));

const arg=process.argv.indexOf('--site');
const outArg=process.argv.indexOf('--out');
const out=resolve(outArg>=0?process.argv[outArg+1]:'verification/out/secrets-v10'); mkdirSync(out,{recursive:true});
if(arg>=0) {
  const v=await import('./lib/verif.mjs');
  const cible=await v.ouvrirCible({site:process.argv[arg+1]});
  const browser=await v.lancer({args:['--use-gl=angle',...v.ARGS_GPU,'--ignore-gpu-blocklist','--mute-audio'],media:false});
  let pageCourante;
  try {
    console.log('QA TV : Lisa, puis intercalaire Biscuits (carnet des huit proches).');
    const {page}=await v.ouvrirPage(browser,cible,v.ecran('tv-1080'),'lisa',{init:[v.initReglages({animations:'completes',musiqueActive:false,lectureAuto:false})]});
    pageCourante=page;
    await page.waitForFunction(()=>document.querySelector('.gc-secrets--table[data-gc-secret-actif="oui"]'),null,{timeout:90000});
    await page.waitForFunction(()=>!document.querySelector('.gc-livre__page--visible [data-gc-ecrit="a-ecrire"]'),null,{timeout:25000});
    await page.waitForTimeout(700);
    const avant=await page.locator('.gc-secrets--table').getAttribute('data-gc-secret');
    await page.locator('.gc-secrets--table button').focus(); await page.keyboard.press('Enter');
    const apres=await page.locator('.gc-secrets--table').getAttribute('data-gc-secret');
    assert.notEqual(avant,apres); checks.push({nom:'Entrée sur le chien change sa scène, sans navigation',ok:true});
    const geometrie=await page.evaluate(()=>{
      const dog=document.querySelector('.gc-secrets--table').getBoundingClientRect();
      const pages=[...document.querySelectorAll('.gc-livre__page--visible .gc-page-cuite')].map(p=>p.getBoundingClientRect());
      return {chien:{x:dog.x,y:dog.y,w:dog.width,h:dog.height},collision:pages.some(r=>dog.right>r.left&&dog.left<r.right&&dog.bottom>r.top&&dog.top<r.bottom)};
    });
    assert.equal(geometrie.collision,false); checks.push({nom:'le grand compagnon reste réellement hors du livre',ok:true,geometrie});
    assert.ok(geometrie.chien.h>=125); checks.push({nom:'présence du grand chien lisible sur TV (hauteur de scène ≥125 px)',ok:true,hauteur:geometrie.chien.h});
    const images=await page.locator('.gc-secrets--table img').evaluateAll(async imgs=>{
      await Promise.all(imgs.map(i=>i.decode()));
      return imgs.map(i=>({src:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight,ok:i.complete&&i.naturalWidth>0}));
    });
    assert.ok(images.every(i=>i.ok)); assert.ok(images.some(i=>/bulle-vierge/.test(i.src)));
    const parole=await page.locator('.gc-secrets--table .gc-secrets__parole').evaluate(el=>({texte:el.textContent,famille:getComputedStyle(el).fontFamily,taille:getComputedStyle(el).fontSize}));
    assert.ok(['Une part pour le chien ?','Ça sent le beurre d’ici !'].includes(parole.texte));
    assert.match(parole.famille,/Caveat/i);
    checks.push({nom:'pose chargée, bulle dessinée et phrase française en vraie Caveat',ok:true,images,parole});
    await page.evaluate(()=>document.querySelector('.gc-secrets--table').getAnimations({subtree:true}).forEach(a=>{a.currentTime=7000;}));
    await page.screenshot({path:resolve(out,'tv-lisa.png')});
    console.log('QA TV : compagnon extérieur et bulle française contrôlés, capture Lisa écrite.');
    const anim=await page.locator('.gc-secrets--table .gc-secrets__compagnon').evaluate(el=>el.getAnimations().map(a=>({etat:a.playState,temps:a.currentTime})));
    assert.ok(anim.some(a=>a.etat==='running')); checks.push({nom:'chorégraphie du chien active, pas une illustration fixe',ok:true});
    const avantClic=await page.locator('.gc-secrets--table').getAttribute('data-gc-secret');
    await page.locator('.gc-secrets--table button').click();
    assert.notEqual(await page.locator('.gc-secrets--table').getAttribute('data-gc-secret'),avantClic);
    checks.push({nom:'clic sur le grand chien fait découvrir une autre pose',ok:true});
    await page.evaluate(()=>document.activeElement?.blur());
    const signature=()=>page.locator('.gc-secrets[data-gc-secret-actif="oui"]').evaluateAll(els=>els.map(e=>[e.dataset.gcSecret,e.dataset.gcSecretRevele]).join('|'));
    const avantS=await signature(); await page.keyboard.press('s');
    assert.notEqual(await signature(),avantS); checks.push({nom:'S révèle un secret des pages visibles',ok:true});
    await page.evaluate(()=>document.querySelector('.gc-livre').setAttribute('data-gc-geste','page'));
    await page.waitForFunction(()=>document.querySelector('.gc-secrets--table')?.dataset.gcSecretActif==='non');
    const pause=await page.locator('.gc-secrets--table .gc-secrets__compagnon').evaluate(el=>el.getAnimations().every(a=>a.playState==='paused'));
    assert.ok(pause); checks.push({nom:'un geste du livre suspend réellement les animations',ok:true});
    await page.evaluate(()=>document.querySelector('.gc-livre').removeAttribute('data-gc-geste'));
    await page.waitForFunction(()=>document.querySelector('.gc-secrets--table')?.dataset.gcSecretActif==='oui');
    const pageActive=()=>page.locator('.gc-livre__page--visible [data-gc-page-cuite]').evaluateAll(els=>els.map(e=>e.dataset.gcPageCuite).join(','));
    const avantFleche=await pageActive(); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(avant=>[...document.querySelectorAll('.gc-livre__page--visible [data-gc-page-cuite]')].map(e=>e.dataset.gcPageCuite).join(',')!==avant,avantFleche,{timeout:30000});
    checks.push({nom:'les flèches continuent à tourner le carnet après S/clic',ok:true});
    console.log('QA TV : Entrée, clic, S, pause de geste et navigation par flèche contrôlés.');
    await page.waitForFunction(()=>document.querySelector('.gc-secrets--table')?.dataset.gcSecretActif==='oui',null,{timeout:30000});
    await page.evaluate(()=>{location.hash='biscuits';});
    await page.waitForFunction(()=>document.querySelector('.gc-livre__page--visible [data-gc-page-cuite="biscuits-droite"]')&&!document.querySelector('.gc-livre[data-gc-geste]'),null,{timeout:60000});
    await page.waitForFunction(()=>!document.querySelector('.gc-livre__page--visible [data-gc-ecrit="a-ecrire"]'),null,{timeout:25000});
    // À gauche, les quatre poses de chien alternent ; les cachettes sont sur la page droite.
    const vignette=page.locator('.gc-livre__page--visible .gc-secrets[data-gc-secrets="biscuits-droite"][data-gc-secret-actif="oui"]');
    await vignette.waitFor({state:'visible',timeout:15000});
    await page.evaluate(()=>document.querySelectorAll('.gc-secrets[data-gc-secret-actif="oui"]').forEach(el=>el.getAnimations({subtree:true}).forEach(a=>{a.currentTime=7000;})));
    await page.screenshot({path:resolve(out,'tv-biscuits.png')});
    for(let n=0;n<36;n++) {
      if((await vignette.getAttribute('data-gc-secret'))==='constellation')break;
      await vignette.locator('button').click();
    }
    assert.equal(await vignette.getAttribute('data-gc-secret'),'constellation');
    await vignette.evaluate(el=>el.getAnimations({subtree:true}).forEach(a=>{a.currentTime=6000;}));
    await page.screenshot({path:resolve(out,'tv-cachette-etoiles.png')});
    checks.push({nom:'une cachette complète se découvre en interaction (carte des étoiles)',ok:true});
    await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForTimeout(150);
    const reduit=await page.locator('.gc-secrets--table .gc-secrets__compagnon').evaluate(el=>el.getAnimations().every(a=>a.playState!=='running'));
    assert.ok(reduit); checks.push({nom:'mouvement réduit coupe la chorégraphie',ok:true});
  } catch(erreur) {
    if(pageCourante&&!pageCourante.isClosed()) {
      await pageCourante.screenshot({path:resolve(out,'echec.png')}).catch(()=>{});
      const diagnostic=await pageCourante.evaluate(()=>({
        livre:document.querySelector('.gc-livre')?.getAttribute('data-gc-etat'),
        compagnon:document.querySelector('.gc-secrets--table')?.outerHTML.slice(0,1200),
        pages:[...document.querySelectorAll('.gc-livre__page--visible [data-gc-page-cuite]')].map(e=>e.dataset.gcPageCuite),
      })).catch(()=>null);
      writeFileSync(resolve(out,'echec.json'),JSON.stringify({erreur:String(erreur),diagnostic,checks},null,2));
    }
    throw erreur;
  } finally { await browser.close(); await cible.close?.(); }
}
writeFileSync(resolve(out,'secrets.json'),JSON.stringify({checks},null,2));
console.log(`${checks.length} contrôles réussis.`);
