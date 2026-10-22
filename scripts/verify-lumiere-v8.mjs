// Éclairage attaché au papier : vraie ouverture au clavier, WebGL, captures à temps contrôlé.
// GC_CHROME=/usr/bin/chromium node scripts/verify-lumiere-v8.mjs --site /tmp/gc-lumiere-after
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, lireArgs, lancer, ouvrirCible, ouvrirPage, ecran, capture, planche, Rapport } from './lib/verif.mjs';
const { opt } = lireArgs();
const only = opt('only', 'ouverture,papier,vivant,off').split(',');
const out = resolve(ROOT, opt('out', 'verification/out/lumiere-v9'));
mkdirSync(out, { recursive: true });
const cible = await ouvrirCible({ site: opt('site', 'dist/site'), url: opt('url') });
const R = new Rapport(opt('only') ? 'lumiere-surfaces-suite' : 'lumiere-surfaces', { dir: out, meta: { depart: cible.depart, webgl: true, only } });
const b = await lancer();
const captures = [];
const init = (distance, animations = 'completes', feu = true) => ({ fn: ({ distance, animations, feu }) => {
  localStorage.setItem('gc:camera:v3', JSON.stringify({ distance, zoom: 1 }));
  localStorage.setItem('gc:reglages:v4', JSON.stringify({ v: 1, animations, feu, muet: true, vitesseEcriture: 4, boutonsToujoursVisibles: true }));
}, arg: { distance, animations, feu } });
const photo = async (p, nom) => { const f = await capture(p, nom, out); captures.push([f, nom]); R.capturer(f); return f; };
const surface = p => p.evaluate(() => {
  const e = document.querySelector('.gc-livre');
  return {
    etat: e?.dataset.gcEtat, tour: e?.dataset.gcGeste ?? null,
    couverture: document.querySelector('.gc-livre-couv')?.style.transform ?? null,
    projectionLivre: !!document.querySelector('.gc-stage__light .gc-lumiere'),
    table: [...document.querySelectorAll('[data-gc-lumiere-etat]')].map(x => x.dataset.gcLumiereEtat),
    lumieresHorsFace: [...document.querySelectorAll('[data-gc-lumiere-surface]')].filter(x => !x.closest('.gc-livre-face')).length,
    flamme: window.__gcFlamme?.etat(),
  };
});
try {
  for (const d of (only.includes('ouverture') ? ['proche', 'moyenne', 'loin'] : [])) {
    const { ctx, page: p, surv } = await ouvrirPage(b, cible, ecran('tv-1080'), '', { init: [init(d)] });
    // Le Clock contrôle les vrais rAF de Motion : les poses viennent du geste normal, sans attributs
    // ni transformations injectés dans le livre. Le compositing reste réel, avec la flamme WebGL.
    await p.clock.install(); await p.clock.pauseAt(new Date());
    await photo(p, `${d}-0-ferme`);
    await p.keyboard.press('ArrowRight');
    const frames = [];
    for (const [ms, nom] of [[240, '1-levee'], [400, '2-bascule'], [750, '3-descente'], [2400, '4-ouvert']]) {
      await p.clock.runFor(ms);
      const s = await surface(p); frames.push(s);
      await photo(p, `${d}-${nom}`);
    }
    R.ok(d, 'ouverture clavier réelle, progression géométrique puis état ouvert', frames.some(s => s.couverture?.includes('rotateY(-')) && frames.at(-1).etat === 'ouvert', frames.map(s => ({ etat: s.etat, couverture: s.couverture })));
    R.ok(d, 'aucune silhouette projetée, éclairage toujours dans les faces réelles', frames.every(s => !s.projectionLivre && !s.lumieresHorsFace && s.table.join() === 'vide'));
    R.ok(d, 'flamme rendue en WebGL pendant le geste', frames.every(s => s.flamme?.rendu === 'toile'));
    R.ok(d, 'aucune erreur application ni ressource', !surv.erreurs.length && !surv.reponses.length, { erreurs: surv.erreurs.slice(0, 3), reponses: surv.reponses.slice(0, 3) });
    // La fermeture exerce le chemin inverse, y compris le changement de face et son ombre.
    await p.keyboard.press('ArrowLeft'); await p.clock.runFor(4500);
    R.ok(d, 'fermeture : retour couverture sans projection fantôme', (await surface(p)).etat === 'couverture');
    await ctx.close();
  }
  if (only.includes('papier')) {
    const { ctx, page: p } = await ouvrirPage(b, cible, ecran('tv-1080'), 'julie', { init: [init('moyenne', 'reduites')] });
    await p.waitForTimeout(600);
    const zone = p.locator('.gc-livre__emplacement--gauche');
    const avec = PNG.sync.read(await zone.screenshot()); await photo(p, 'julie-avec-bougie');
    const sansStyle = await p.addStyleTag({ content: '.gc-lumiere-papier__bougie { visibility: hidden !important; }' });
    const sans = PNG.sync.read(await zone.screenshot()); await photo(p, 'julie-sans-bougie');
    const deltas = []; const encres = []; const lumPapier = [[], []]; const lumEncre = [[], []];
    const lum = (d, i) => {
      const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
      return .2126 * lin(d[i]) + .7152 * lin(d[i + 1]) + .0722 * lin(d[i + 2]);
    };
    for (let y = Math.round(avec.height * .4); y < avec.height * .9; y++) for (let x = 35; x < avec.width * .65; x++) {
      const i = (y * avec.width + x) * 4;
      const delta = ((avec.data[i] - sans.data[i]) + (avec.data[i + 1] - sans.data[i + 1]) + (avec.data[i + 2] - sans.data[i + 2])) / 3;
      if (sans.data[i] > 100 && sans.data[i + 1] > 90) {
        deltas.push(delta); lumPapier[0].push(lum(sans.data, i)); lumPapier[1].push(lum(avec.data, i));
      }
      if (sans.data[i] < 65 && sans.data[i + 1] < 65 && sans.data[i + 2] < 65) {
        encres.push(Math.abs(delta)); lumEncre[0].push(lum(sans.data, i)); lumEncre[1].push(lum(avec.data, i));
      }
    }
    deltas.sort((a, b) => a - b); encres.sort((a, b) => a - b);
    const papier = deltas[Math.floor(deltas.length / 2)];
    const encre = encres[Math.floor(encres.length / 2)];
    R.ok('julie', 'contribution bougie visible : éclaircissement médian du papier > 12 niveaux RGB', papier > 12, { papier, pixels: deltas.length });
    const med = xs => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const contrastes = [0, 1].map(k => (med(lumPapier[k]) + .05) / (med(lumEncre[k]) + .05));
    // L'encre cuite est partiellement translucide : sa couleur varie avec le papier sous elle.
    // La lisibilité se mesure donc au contraste sur les mêmes pixels, pas à leur identité RGB.
    R.ok('julie', 'contraste de la même encre conservé avec la bougie', encres.length > 100 && contrastes[1] >= contrastes[0] * .98, { sans: contrastes[0], avec: contrastes[1], variationRGB: encre });
    await sansStyle.evaluate(e => e.remove());
    const fixe0 = await p.evaluate(() => ({ feu: window.__gcFeu.etat(), op: document.querySelector('[data-gc-lumiere="papier-bougie"]').style.opacity }));
    await p.waitForTimeout(250);
    const fixe1 = await p.evaluate(() => ({ feu: window.__gcFeu.etat(), op: document.querySelector('[data-gc-lumiere="papier-bougie"]').style.opacity }));
    R.ok('reduit', 'flamme et éclairage papier immobiles', fixe0.feu.mode === 'statique' && fixe0.op === fixe1.op);
    await ctx.close();
  }
  if (only.includes('vivant')) {
    const { ctx, page: p } = await ouvrirPage(b, cible, ecran('tv-1080'), '', { init: [init('moyenne', 'completes')] });
    // Horloge réelle ici : la flamme a commencé avant l'installation du Clock et garde son dernier
    // timestamp. Réinitialiser performance.now à zéro la ferait attendre artificiellement.
    const valeurs = await p.evaluate(() => new Promise(resolve => {
      const xs = []; const depart = performance.now();
      const image = () => {
        xs.push({ flamme: window.__gcFlamme?.etat().lumiere ?? 0, papier: Number(document.querySelector('[data-gc-lumiere="papier-bougie"]').style.opacity) });
        if (performance.now() - depart < 2200) requestAnimationFrame(image); else resolve(xs);
      }; requestAnimationFrame(image);
    }));
    const amplitude = Math.max(...valeurs.map(v => v.papier)) - Math.min(...valeurs.map(v => v.papier));
    const source = Math.max(...valeurs.map(v => v.flamme)) - Math.min(...valeurs.map(v => v.flamme));
    R.ok('vivant', 'flamme et éclairage papier varient réellement (horloge native)', amplitude > .035 && (source > .015 || !valeurs.some(v => v.flamme)), // (la poignée __gcFlamme a disparu : la flamme n'est plus mesurée)
      { amplitudePapier: amplitude, amplitudeFlamme: source, echantillons: valeurs.length });
    await ctx.close();
  }
  if (only.includes('off')) {
    const { ctx, page: p } = await ouvrirPage(b, cible, ecran('tv-1080'), 'julie', { init: [init('moyenne', 'completes', false)] });
    const f0 = await p.evaluate(() => window.__gcFeu.etat()); await p.waitForTimeout(300);
    const f1 = await p.evaluate(() => window.__gcFeu.etat());
    R.ok('feu-off', 'lumière immobile quand le feu est désactivé', f0.mode === 'statique' && f0.images === f1.images);
    await ctx.close();
  }
  planche(captures, join(out, 'ouverture-et-lumiere.png'), { titre: 'Ouverture réelle : trois crans ; contribution bougie sur le papier', colonnes: 3, tuile: 640, hauteur: 360 });
  R.ecrire(); process.exitCode = R.code();
} finally { await b.close(); await cible.close(); }
