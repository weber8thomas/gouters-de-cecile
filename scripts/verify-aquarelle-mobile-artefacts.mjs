// Audit ciblé : iPhone paysage DPR3, aquarelles terminées, GL / img / ordre des couches corrigé.
// GC_CHROME=/usr/bin/chromium node scripts/verify-aquarelle-mobile-artefacts.mjs --site /tmp/site
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
import { lancer, ouvrirCible, ecran, lireArgs, capture, ROOT } from './lib/verif.mjs';
const { opt } = lireArgs();
const out = resolve(ROOT, opt('out', 'verification/out/artefacts-aq-mobile'));
mkdirSync(out, { recursive: true });
const c = await ouvrirCible({ site: opt('site', 'dist/site') });
const b = await lancer();
try {
  const ctx = await b.newContext(ecran('iphone13-paysage').ctx);
  await ctx.addInitScript(() => localStorage.setItem('gc:reglages:v4', JSON.stringify({ v: 1, animations: 'completes', muet: true, vitesseEcriture: 4 })));
  const p = await ctx.newPage();
  await p.goto(c.url(ecran('iphone13-paysage'), opt('slug', 'julie')));
  await p.waitForSelector('.gc-livre'); await p.waitForTimeout(300);
  // Sauter l'arrivée est une commande du carnet ; elle garde le lien profond et son rendu réel.
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => document.querySelector('.gc-livre[data-gc-etat="ouvert"]') && window.__gcDessins?.etat().some(x => x.pret && x.joue), null, { timeout: 30000 });
  await p.evaluate(() => {
    window.__gcDessins.figer(true); window.__gcDessins.finir(); window.__gcDessins.avancer(33);
    // Comparer la même pose de l'illustration, hors du tableau qui la remplace pendant la coupe.
    window.__gcDessins.scene(undefined, 'duo-citron'); window.__gcDessins.avancer(0);
    window.__gcFeu?.figer({ intensite: 1 });
  });
  await p.addStyleTag({ content: '.gc-magie,.gc-secrets { visibility:hidden!important; } .gc-lumiere-papier__bougie { opacity:.7!important; }' });
  const clip = await p.evaluate(() => {
    const xs = [...document.querySelectorAll('.gc-livre__page--visible [data-gc-aquarelle]')].map(x => x.getBoundingClientRect());
    const x = Math.max(0, Math.min(...xs.map(r => r.x)) - 8), y = Math.max(0, Math.min(...xs.map(r => r.y)) - 8);
    return { x, y, width: Math.min(innerWidth, Math.max(...xs.map(r => r.right)) + 8) - x, height: Math.min(innerHeight, Math.max(...xs.map(r => r.bottom)) + 8) - y };
  });
  const initial = await capture(p, 'recadre-gl-fini', out, { clip });
  const donnees = await p.evaluate(() => {
    window.__gcDessins.avancer(0);
    const cvs = [...document.querySelectorAll('.gc-livre__page--visible .gc-aquarelles-toile')];
    return { dpr: devicePixelRatio, dessins: window.__gcDessins.etat(), canvases: cvs.map(cv => {
      const g = cv.getContext('webgl'), px = new Uint8Array(cv.width * cv.height * 4);
      g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, px);
      let invalides = 0, presents = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3]) presents++;
        if (Math.max(px[i], px[i + 1], px[i + 2]) > px[i + 3] + 2) invalides++;
      }
      const r = cv.getBoundingClientRect();
      return { width: cv.width, height: cv.height, affiche: [r.width, r.height], z: getComputedStyle(cv).zIndex, alphaPremultiplie: g.getContextAttributes().premultipliedAlpha, pixelsPremultInvalides: invalides, pixelsPresents: presents };
    }) };
  });
  const fixe = await p.addStyleTag({ content: '.gc-livre__page--visible .gc-aquarelles-toile,.gc-livre__page--visible .gc-tableaux{visibility:hidden!important}.gc-livre__page--visible .gc-aquarelle[data-gc-aq="toile"] img{visibility:visible!important}' });
  const reference = await capture(p, 'recadre-img-fixe', out, { clip });
  await fixe.evaluate(e => e.remove());
  await p.addStyleTag({ content: '.gc-livre__page--visible .gc-aquarelles-toile{z-index:4!important}' });
  const corrige = await capture(p, 'recadre-gl-z4', out, { clip });
  const lire = async f => PNG.sync.read((await import('node:fs')).readFileSync(f));
  const A = await lire(initial), I = await lire(reference), C = await lire(corrige);
  const difference = (X, Y) => {
    let n = 0, total = 0;
    for (let i = 0; i < X.data.length; i += 4) {
      const d = (Math.abs(X.data[i] - Y.data[i]) + Math.abs(X.data[i + 1] - Y.data[i + 1]) + Math.abs(X.data[i + 2] - Y.data[i + 2])) / 3;
      total += d; if (d > 12) n++;
    }
    return { erreurMoyenneRGB: total / (X.width * X.height), pixelsEcartSup12: n / (X.width * X.height) };
  };
  const rapport = { date: new Date().toISOString(), cible: c.depart, environnement: 'Chromium, émulation iPhone paysage DPR3 (Safari réel non couvert)', clip, ...donnees,
    glVersImg: difference(A, I), glZ4VersImg: difference(C, I), captures: [initial, reference, corrige] };
  writeFileSync(join(out, 'audit.json'), JSON.stringify(rapport, null, 2));
  console.log(JSON.stringify({ canvases: donnees.canvases, glVersImg: rapport.glVersImg, glZ4VersImg: rapport.glZ4VersImg }));
  assert.ok(donnees.canvases.length > 0);
  assert.ok(donnees.canvases.every(cv => cv.z === '4' && cv.pixelsPremultInvalides === 0 && cv.width <= 1600 && cv.height <= 1600));
  assert.ok(rapport.glVersImg.erreurMoyenneRGB < 3 && rapport.glVersImg.pixelsEcartSup12 < .04,
    'Une illustration terminée doit garder les couleurs de son image fixe');
  await ctx.close();
} finally { await b.close(); await c.close(); }
