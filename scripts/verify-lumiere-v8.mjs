// Éclairage Cycles : état/cran/zoom, non-interception, modes figés et lecture sur la même encre.
// GC_CHROME=/usr/bin/chromium node scripts/verify-lumiere-v8.mjs --url http://127.0.0.1:5187/
// --site dist/site vérifie le site construit ; --captures-seules omet les comparaisons aux sources.
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import {
  ROOT, lireArgs, lancer, ouvrirCible, ouvrirPage, ecran, capture, planche, Rapport,
} from './lib/verif.mjs';

const { opt, drapeau } = lireArgs();
const out = resolve(ROOT, opt('out', 'verification/out/lumiere-v8'));
mkdirSync(out, { recursive: true });
const originaux = join(out, 'cycles-v1');
const archive = join(ROOT, 'scripts/lumiere3d/calques-cycles-v1.zip');
const extraction = spawnSync('python3', ['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', archive, originaux]);
if (extraction.status !== 0) throw new Error(String(extraction.stderr));
const cible = await ouvrirCible({ site: opt('site'), url: opt('url') });
const R = new Rapport('lumiere-v8', { dir: out, meta: { depart: cible.depart } });
const browser = await lancer({ args: ['--disable-gpu'] });
const tuiles = [];

const init = (distance, zoom = 1, extra = {}) => ({ fn: ({ distance, zoom, extra }) => {
  localStorage.setItem('gc:camera:v3', JSON.stringify({ distance, zoom }));
  localStorage.setItem('gc:reglages:v4', JSON.stringify({ v: 1, animations: 'reduites', mouvementReduit: true, boutonsToujoursVisibles: true, vitesseEcriture: 4, son: false, ambiance: false, musiqueActive: false, ...extra }));
}, arg: { distance, zoom, extra } });
const deuxImages = (p) => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const luminosite = (d, i) => {
  const l = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return .2126 * l(d[i]) + .7152 * l(d[i + 1]) + .0722 * l(d[i + 2]);
};
const mediane = xs => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Même ensemble de pixels d'encre dans les deux captures, papier médian local (grille 3 × 4).
function contrastes(reference, resultat) {
  const a = PNG.sync.read(reference), b = PNG.sync.read(resultat), ratios = [];
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 3; tx++) {
    const p = [];
    for (let y = Math.floor(ty * a.height / 4); y < Math.floor((ty + 1) * a.height / 4); y++) {
      for (let x = Math.floor(tx * a.width / 3); x < Math.floor((tx + 1) * a.width / 3); x++) {
        const i = (y * a.width + x) * 4;
        p.push([luminosite(a.data, i), luminosite(b.data, i)]);
      }
    }
    const seuil = Math.min(.25, [...p].sort((u, v) => u[0] - v[0])[Math.floor(p.length * .04)][0]);
    const encre = p.filter(x => x[0] <= seuil && x[0] < .25);
    if (encre.length < 100) continue;
    const c = [0, 1].map(k => (mediane(p.map(x => x[k])) + .05) / (encre.reduce((s, x) => s + x[k], 0) / encre.length + .05));
    ratios.push({ tx, ty, avant: c[0], apres: c[1], rapport: c[1] / c[0] });
  }
  return ratios;
}

async function ouvrir(nom, distance, hash = 'julie', zoom = 1, extra = {}) {
  const o = await ouvrirPage(browser, cible, ecran(nom), hash, { init: [init(distance, zoom, extra)] });
  // Les effets de fête ne font pas partie de l'éclairage de la scène.
  await o.page.addStyleTag({ content: '.gc-fete { visibility: hidden !important; }' });
  await o.page.waitForFunction(() => !document.querySelector('[data-gc-ecrit="a-ecrire"]'), null, { timeout: 20000 }).catch(() => {});
  await o.page.waitForTimeout(1100);
  return o;
}

try {
  for (const distance of ['proche', 'moyenne', 'loin']) {
    for (const ouvert of [false, true]) {
      const nom = `tv-${distance}-${ouvert ? 'ouvert' : 'ferme'}`;
      const { ctx, page, surv } = await ouvrir('tv-1080', distance, ouvert ? 'julie' : '');
      const etat = await page.evaluate(() => {
        const actifs = [...document.querySelectorAll('[data-gc-lumiere-etat]')].filter(e => getComputedStyle(e).visibility === 'visible');
        const mauvais = [...document.querySelectorAll('.gc-lumiere, .gc-lumiere-tracee__fond, .gc-lumiere-tracee__voile')].filter(e => getComputedStyle(e).pointerEvents !== 'none');
        return { actifs: actifs.map(e => e.dataset.gcLumiereEtat), mauvais: mauvais.length, distance: document.querySelector('.gc-stage')?.dataset.gcDistance, feu: window.__gcFeu?.etat?.() };
      });
      R.ok(nom, 'un état tracé actif, au cran demandé', etat.actifs.length === 1 && etat.actifs[0] === (ouvert ? 'ouvert' : 'couverture') && etat.distance === distance, etat);
      R.ok(nom, 'la lumière ne capte aucun pointeur', etat.mauvais === 0);
      R.ok(nom, 'aucune erreur application ni ressource', !surv.erreurs.length && !surv.reponses.length && !surv.echecs.length,
        { erreurs: surv.erreurs.slice(0, 3), reponses: surv.reponses.slice(0, 3), echecs: surv.echecs.slice(0, 3), totalEchecs: surv.echecs.length });
      const f = await capture(page, nom, out); tuiles.push([f, nom]); R.capturer(f);
      if (ouvert && distance === 'moyenne' && !drapeau('captures-seules')) {
        // Conserver la page ET son encre : on remplace uniquement les URLs des 3 calques actifs.
        await page.addStyleTag({ content: '[data-gc-objet], .gc-livre__invitation { visibility: hidden !important; }' });
        const pageDroite = page.locator('.gc-livre__emplacement--droite');
        for (const intensite of [.6, 1, 1.6]) {
          await page.evaluate(i => window.__gcFeu.figer({ intensite: i }), intensite);
          await deuxImages(page);
          const apres = await pageDroite.screenshot();
          const urls = await page.evaluate(() => {
            const actif = [...document.querySelectorAll('[data-gc-lumiere-etat]')].find(e => getComputedStyle(e).visibility === 'visible');
            return [...actif.children].map(e => ({ url: getComputedStyle(e).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1], ancien: e.style.backgroundImage }));
          });
          const donnees = urls.map((u, i) => ({ ...u, data: readFileSync(join(originaux, `moyenne-ouvert${i === 0 ? '' : i === 1 ? '-feu' : '-bougie'}.webp`)).toString('base64') }));
          await page.evaluate(ds => {
            const actif = [...document.querySelectorAll('[data-gc-lumiere-etat]')].find(e => getComputedStyle(e).visibility === 'visible');
            [...actif.children].forEach((e, i) => { e.style.backgroundImage = `url(data:image/webp;base64,${ds[i].data})`; });
          }, donnees);
          await deuxImages(page);
          const avant = await pageDroite.screenshot();
          await page.evaluate(ds => {
            const actif = [...document.querySelectorAll('[data-gc-lumiere-etat]')].find(e => getComputedStyle(e).visibility === 'visible');
            [...actif.children].forEach((e, i) => { e.style.backgroundImage = ds[i].ancien; });
          }, donnees);
          const ratios = contrastes(avant, apres);
          R.ok(nom, `encre identique, contraste conservé face à Cycles v1 (feu ${intensite})`, ratios.length > 0 && ratios.every(x => x.rapport >= .98), ratios);
        }
        await page.evaluate(() => window.__gcFeu.figer(null));
        const f0 = await page.evaluate(() => window.__gcFeu.etat());
        await page.waitForTimeout(450);
        const f1 = await page.evaluate(() => window.__gcFeu.etat());
        R.ok(nom, 'animations réduites : horloge du feu arrêtée', f0.mode === 'statique' && f1.images === f0.images, { f0, f1 });
      }
      await ctx.close();
    }
  }
  for (const [nom, distance, zoom] of [['ipad-portrait', 'moyenne', 1], ['ipad-paysage', 'loin', 1], ['tv-1080', 'proche', .95], ['tv-1080', 'loin', 1.05]]) {
    const { ctx, page, surv } = await ouvrir(nom, distance, 'julie', zoom);
    const c = `${nom}-${distance}-zoom-${zoom}`;
    const f = await capture(page, c, out); tuiles.push([f, c]); R.capturer(f);
    const alignement = await page.evaluate(() => {
      const livre = document.querySelector('.gc-livre-camera');
      const lumiere = [...document.querySelectorAll('[data-gc-lumiere-etat]')].find(e => getComputedStyle(e).visibility === 'visible');
      return { livre: getComputedStyle(livre).transform, lumiere: getComputedStyle(lumiere).transform };
    });
    R.ok(c, 'zoom de la lumière identique au livre', alignement.livre === alignement.lumiere, alignement);
    R.ok(c, 'aucune erreur application', !surv.erreurs.length, surv.erreurs);
    await ctx.close();
  }
  const { ctx, page } = await ouvrir('tv-1080', 'moyenne', 'julie', 1, { animations: 'completes', mouvementReduit: false, feu: false });
  const f0 = await page.evaluate(() => window.__gcFeu.etat()); await page.waitForTimeout(500);
  const f1 = await page.evaluate(() => window.__gcFeu.etat());
  R.ok('tv-feu-off', 'feu désactivé : lumière chaude immobile', f0.mode === 'statique' && f1.images === f0.images, { f0, f1 });
  await ctx.close();
  planche(tuiles, join(out, 'planche.png'), { titre: 'Lumière v8 — TV, trois crans, tablette et zoom', colonnes: 2, tuile: 720, hauteur: 405 });
  R.ecrire();
  process.exitCode = R.code();
} finally { await browser.close(); await cible.close(); }
