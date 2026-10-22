// Vérification des scorpions cachés (v22) : positions, fuite, trace, compteur, carte finale, mouvement réduit, clavier, mémoire.
//   NODE_OPTIONS= nice -n 19 node verification/scorpions-v22.mjs [--url http://localhost:5188/] [--out verification/out/v22]
// Les animations sont figées à un instant donné (document.getAnimations) pour des captures déterministes.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { lancerChrome, pagePrete, dormir, ROOT } from './perf/lib.mjs';
const a = process.argv.slice(2);
const opt = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
const URL = opt('url', 'http://localhost:5188/');
const OUT = resolve(ROOT, opt('out', 'verification/out/v22'));
mkdirSync(OUT, { recursive: true });
const TOUS = ['garde', 'sommaire', 'marge', 'photo', 'aquarelle', 'chapitre', 'fin', 'table'];
const REGLAGES = (animations) => ({ v: 1, animations, musiqueActive: false, lectureAuto: false, vitesseEcriture: 4 });
let echecs = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) echecs++; };

const chrome = await lancerChrome({ largeur: 1366, hauteur: 1024 });
try {
  const page = await pagePrete(chrome.browser, 1366, 1024);
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  const init = async (animations, trouves) => {
    await page.evaluate(([r, t]) => { localStorage.setItem('gc:reglages:v4', JSON.stringify(r)); if (t === null) localStorage.removeItem('gc:scorpions:v1'); else localStorage.setItem('gc:scorpions:v1', JSON.stringify({ trouves: t })); }, [REGLAGES(animations), trouves]);
  };
  const ouvrir = async (hash, id) => {
    await page.goto('about:blank'); await page.goto(URL + '#' + hash);
    await page.waitForSelector(`[data-gc-scorpion="${id}"]`, { timeout: 60000 });
    await dormir(7000);
  };
  const zone = async (id, marge = 90) => {
    const b = await page.locator(`[data-gc-scorpion="${id}"]`).boundingBox();
    return { x: Math.max(0, b.x - marge), y: Math.max(0, b.y - marge), width: 2 * marge + b.width, height: 2 * marge + b.height };
  };
  const figer = (ms) => page.evaluate((t) => document.getAnimations().forEach((an) => { an.pause(); an.currentTime = t; }), ms);

  // 0. état vierge, mouvement complet
  await page.goto(URL); await init('completes', null);

  // 1. deux scorpions en place (zoom)
  await ouvrir('lisa', 'marge');
  await page.screenshot({ path: `${OUT}/en-place-marge.png`, clip: await zone('marge', 130) });
  ok(await page.locator('[data-gc-scorpion="marge"] button[aria-label="Un scorpion !"]').count() === 1, 'marge : bouton « Un scorpion ! »');
  ok(await page.locator('.gc-scorpions__compteur').count() === 0, 'pas de compteur avant la première trouvaille');
  await page.screenshot({ path: `${OUT}/page-marge.png` });
  const avantTab = await page.evaluate(() => document.querySelectorAll('[data-gc-scorpion] button:not([tabindex="-1"])').length);
  ok(avantTab === 0, 'avant tout Tab : aucun scorpion dans l’ordre du clavier');
  // le premier Tab ne se pose pas sur un scorpion
  await page.keyboard.press('Tab'); await dormir(100);
  ok(await page.evaluate(() => !document.activeElement?.closest('[data-gc-scorpion]')), 'premier Tab : pas de focus sur un scorpion');
  await dormir(100);
  ok(await page.evaluate(() => document.querySelectorAll('.gc-livre__page--visible [data-gc-scorpion] button:not([tabindex="-1"])').length === 1), 'après le premier Tab : le scorpion de la page est atteignable');

  // 2. clic : la fuite
  const rb = await page.locator('[data-gc-scorpion="marge"]').boundingBox();
  await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await dormir(60);
  await figer(300);
  await page.screenshot({ path: `${OUT}/fuite-milieu.png`, clip: { x: Math.max(0, rb.x - 150), y: Math.max(0, rb.y - 150), width: 330, height: 330 } });
  const nb = await page.evaluate(() => ({ svg: document.querySelectorAll('[data-gc-scorpion="marge"] svg').length, trace: document.querySelectorAll('.gc-scorpion__trace').length }));
  ok(nb.svg === 3 && nb.trace === 1, `fuite : 3 poses et une trace (${JSON.stringify(nb)})`);
  await figer(640);
  await page.screenshot({ path: `${OUT}/trace.png`, clip: { x: Math.max(0, rb.x - 150), y: Math.max(0, rb.y - 150), width: 330, height: 330 } });
  await page.evaluate(() => document.getAnimations().forEach((an) => an.play()));
  await dormir(2200);
  ok(await page.locator('[data-gc-scorpion="marge"]').count() === 0, 'après la fuite : le scorpion a disparu du DOM');
  ok(await page.locator('.gc-scorpion__trace').count() === 0, 'après 1,5 s : la trace a disparu');
  const compteur = await page.locator('.gc-scorpions__compteur').innerText().catch(() => '');
  ok(/1\/8/.test(compteur), `compteur : « ${compteur} »`);
  await page.screenshot({ path: `${OUT}/compteur.png`, clip: { x: 340, y: 930, width: 700, height: 90 } });
  await page.screenshot({ path: `${OUT}/compteur-plein.png` });
  const stock = await page.evaluate(() => localStorage.getItem('gc:scorpions:v1'));
  ok(stock === '{"trouves":["marge"]}', `mémorisé : ${stock}`);

  // 3. mémoire : après rechargement il ne revient pas
  await page.goto('about:blank'); await page.goto(URL + '#lisa'); await dormir(8000);
  ok(await page.locator('[data-gc-scorpion="marge"]').count() === 0, 'après rechargement : le scorpion trouvé ne réapparaît pas');
  ok(/1\/8/.test(await page.locator('.gc-scorpions__compteur').innerText().catch(() => '')), 'après rechargement : le compteur reste');

  // 4. un second en place : la photo (glissé sous le coin) et la table
  await init('completes', []);
  await ouvrir('marie', 'photo');
  await page.screenshot({ path: `${OUT}/en-place-photo.png`, clip: await zone('photo', 120) });
  await page.screenshot({ path: `${OUT}/en-place-table.png`, clip: await zone('table', 120) });

  // 5. mouvement réduit : un simple fondu
  await init('reduites', []);
  await ouvrir('lisa', 'marge');
  const r2 = await page.locator('[data-gc-scorpion="marge"]').boundingBox();
  await page.mouse.click(r2.x + r2.width / 2, r2.y + r2.height / 2); await dormir(80);
  const red = await page.evaluate(() => ({ svg: document.querySelectorAll('[data-gc-scorpion="marge"] svg').length, trace: document.querySelectorAll('.gc-scorpion__trace').length, anims: document.getAnimations().length }));
  ok(red.svg === 1 && red.trace === 0, `animations réduites : fondu seul, ni poses ni trace (${JSON.stringify(red)})`);
  await dormir(700);
  ok(await page.locator('[data-gc-scorpion="marge"]').count() === 0, 'animations réduites : disparu après le fondu');

  // 6. carte finale : sept trouvés, on touche le huitième
  await init('completes', TOUS.filter((i) => i !== 'fin'));
  await ouvrir('fin', 'fin');
  ok(/7\/8/.test(await page.locator('.gc-scorpions__compteur').innerText()), 'sept trouvés : « 7/8 »');
  const rf = await page.locator('[data-gc-scorpion="fin"]').boundingBox();
  await page.mouse.click(rf.x + rf.width / 2, rf.y + rf.height / 2);
  await page.waitForSelector('.gc-scorpions__carte', { timeout: 8000 });
  await dormir(900);
  await page.screenshot({ path: `${OUT}/carte-finale.png` });
  const carte = await page.locator('.gc-scorpions__carte').innerText();
  ok(/tout trouvé/.test(carte), `carte finale : « ${carte.replace(/\n+/g, ' ')} »`);
  await page.keyboard.press('Escape'); await dormir(300);
  ok(await page.locator('.gc-scorpions__carte').count() === 0, 'Échap referme la carte');
  ok(await page.locator('.gc-scorpions__compteur--bouton').count() === 1, '8/8 : le compteur devient un bouton pour rouvrir la carte');
  await page.locator('.gc-scorpions__compteur--bouton').click(); await dormir(400);
  ok(await page.locator('.gc-scorpions__carte').count() === 1, 'le compteur rouvre la carte');

  ok(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
} finally { await chrome.fermer(); }
process.exit(echecs ? 1 : 0);
