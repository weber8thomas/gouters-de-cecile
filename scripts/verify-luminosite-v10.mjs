// Paramètres réels : lumière ambiante, mémoire, clavier et vacillement indépendant.
// GC_CHROME=/usr/bin/chromium node scripts/verify-luminosite-v10.mjs --site dist/site
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { lancer, ouvrirCible, ouvrirPage, ecran, lireArgs } from './lib/verif.mjs';

const { opt } = lireArgs();
const out = resolve(opt('out', 'verification/out/luminosite-v10'));
mkdirSync(out, { recursive: true });
const cible = await ouvrirCible({ site: opt('site', 'dist/site') });
const browser = await lancer();
const checks = [];
const ok = (nom, condition, detail) => {
  assert.ok(condition, `${nom} : ${JSON.stringify(detail)}`);
  checks.push({ nom, ok: true, detail }); console.log(`OK ${nom}`);
};
try {
  const { ctx, page: p, surv } = await ouvrirPage(browser, cible, ecran('tv-1080'), 'julie', {
    init: [() => {
      if (sessionStorage.getItem('gc-luminosite-test')) return;
      localStorage.setItem('gc:reglages:v4', JSON.stringify({ v:1, muet:true, animations:'completes' }));
      sessionStorage.setItem('gc-luminosite-test','1');
    }],
  });
  const stocke = () => p.evaluate(() => JSON.parse(localStorage.getItem('gc:reglages:v4')));
  const luminosite = () => p.locator('.gc-stage').getAttribute('data-gc-luminosite').then(Number);
  ok('nouveau profil : luminosité 150 %', await luminosite() === 150);
  await p.keyboard.press('m');
  const slider = p.locator('[data-gc-reglages-ligne="luminosite"] [role="slider"]');
  await slider.waitFor({ state:'visible' });
  const vitesse = p.locator('[data-gc-reglages-ligne="vitesseEcriture"] [role="slider"]');
  ok('vitesse d’écriture par défaut 200 %', Number(await vitesse.getAttribute('aria-valuenow')) === 2);
  await p.screenshot({ path:resolve(out, 'parametres.png') });
  // Fixer seulement l'éclairage pour comparer les niveaux sur les mêmes pixels de papier.
  const fixe = await p.addStyleTag({ content:'.gc-lumiere-papier__bougie{opacity:.65!important}.gc-secrets,.gc-magie{visibility:hidden!important}' });
  await p.evaluate(() => { window.__gcDessins?.figer(true); window.__gcDessins?.finir(); });
  const prises = {};
  async function regler(niveau) {
    await slider.focus(); await p.keyboard.press('Home');
    for (let i=50; i<niveau; i+=5) await p.keyboard.press('ArrowRight');
    ok(`curseur au clavier ${niveau} %`, await luminosite() === niveau);
    await p.keyboard.press('Escape');
    await p.waitForSelector('[data-gc-reglages="panneau"]', { state:'hidden' });
    prises[niveau] = PNG.sync.read(await p.locator('.gc-livre__emplacement--gauche').screenshot());
    await p.screenshot({ path:resolve(out, `luminosite-${niveau}.png`) });
    await p.keyboard.press('m'); await slider.waitFor({ state:'visible' });
  }
  for (const n of [50,100,150,300]) await regler(n);
  const ecart = (a,b) => {
    const xs=[];
    for(let y=Math.round(a.height*.4);y<a.height*.85;y++) for(let x=35;x<a.width*.65;x++) {
      const i=(y*a.width+x)*4;
      if(a.data[i]>90&&a.data[i+1]>80) xs.push(((b.data[i]-a.data[i])+(b.data[i+1]-a.data[i+1])+(b.data[i+2]-a.data[i+2]))/3);
    }
    return xs.sort((x,y)=>x-y)[Math.floor(xs.length/2)];
  };
  ok('le défaut 150 % éclaire réellement le papier', ecart(prises[100],prises[150])>10, ecart(prises[100],prises[150]));
  ok('la plage 50–300 % produit une différence visible', ecart(prises[50],prises[300])>40, ecart(prises[50],prises[300]));
  await slider.focus(); await p.keyboard.press('End');
  ok('Fin atteint 300 %, valeur mémorisée', (await stocke()).luminosite === 3);
  const eclat=p.locator('[data-gc-reglages-ligne="eclatBougie"] [role="slider"]');
  await eclat.focus(); await p.keyboard.press('End');
  ok('éclat de bougie au clavier : 400 % mémorisé', (await stocke()).eclatBougie===4);
  await p.reload();
  await p.waitForSelector('.gc-stage[data-gc-luminosite="300"]');
  ok('luminosité restaurée après rechargement', await luminosite() === 300);
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => document.querySelector('[data-gc-lumiere="papier-bougie"]'));
  const valeurs = await p.evaluate(() => new Promise(resolve => {
    const xs=[], debut=performance.now();
    const tick=()=> {
      xs.push(Number(document.querySelector('[data-gc-lumiere="papier-bougie"]').style.opacity));
      if(performance.now()-debut<2200) requestAnimationFrame(tick); else resolve(xs);
    }; requestAnimationFrame(tick);
  }));
  const amplitude = Math.max(...valeurs)-Math.min(...valeurs);
  ok('la bougie vacille encore à luminosité 300 %', amplitude>.035, amplitude);
  await p.keyboard.press('m'); await slider.waitFor({ state:'visible' });
  await p.getByRole('button', {name:'remettre les réglages par défaut', exact:true}).click();
  ok('remise à zéro : luminosité 150 %, écriture 200 %', await luminosite()===150&&(await stocke()).vitesseEcriture===2&&(await stocke()).eclatBougie===2);
  ok('aucune erreur ni ressource manquante', !surv.erreurs.length&&!surv.reponses.length, {erreurs:surv.erreurs,reponses:surv.reponses});
  await ctx.close();
} finally {
  writeFileSync(resolve(out,'rapport.json'), JSON.stringify({ checks },null,2));
  await browser.close(); await cible.close();
}
