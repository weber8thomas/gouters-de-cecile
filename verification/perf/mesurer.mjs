// Coût GPU / CPU du carnet AU REPOS, effet par effet (rien ne bouge : pas de souris, pas de geste).
//
//   COMMANDE UNIQUE (depuis la racine du dépôt ; ~40 min pour tout, voir --variantes / --scenarios pour restreindre) :
//     sh verification/perf/construire.sh && NODE_OPTIONS= node verification/perf/mesurer.mjs
//   puis le tableau :
//     NODE_OPTIONS= node verification/perf/rapport.mjs verification/out/perf/mesures.json
//
//   Options : --scenarios julien,cecile-3,sommaire   (hash du carnet : julien = recette + aquarelle du chapitre gâteaux,
//                                                      cecile-3 = album avec deux vidéos en boucle, sommaire)
//             --variantes base,magie,bougie,…         (voir VARIANTES ci-dessous ; défaut : toutes)
//             --reps 2 --duree 15 --calme 12 --trace 5
//             --bundle dist/perf-nomin --port 4398    (bundle NON minifié de construire.sh : les piles de rAF portent les
//                                                      vrais noms ; un serveur `vite preview` est lancé s'il n'y en a pas)
//             --out verification/out/perf/mesures.json
//   Environnement : GC_CHROME = binaire de Chrome (défaut /Applications/Google Chrome.app).
//
// Méthode : un vrai Chrome AVEC GPU (profil temporaire, fenêtre 1366×1024 CSS px, DPR 2 sur écran Retina), une page neuve
// par mesure (chargement à froid), attente que l'encre ait fini d'écrire, puis on coupe UN suspect et on mesure `duree` s :
//   - CPU des processus GPU / renderer / browser de CE Chrome (CDP SystemInfo.getProcessInfo, toutes les 0,5 s) ;
//   - par rAF : fréquence et ms de JS par seconde (sonde lib.mjs) ; par canvas WebGL : dessins/s et Mpx/s remplis ;
//   - une trace (Tracing) : images affichées/s (Display::DrawAndSwap), tâches GPU (ms/s), tuiles rastérisées/s, Paint par nœud ;
//   - utilisation GPU du système (ioreg), globale à la machine : à prendre comme un indice, pas comme une mesure.
// Garde-fou : avant chaque mesure on attend qu'aucun python/ffmpeg lourd ne tourne (d'autres agents calculent parfois sur le GPU).
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import {
  ROOT, lancerChrome, pagePrete, cpuProcessus, SONDE, chargerCarte, dormir, attendreCalme, processusLourds,
  utilisationGpuSysteme, etatMachine,
} from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const SCENARIOS = opt('scenarios', 'julien,cecile-3,sommaire').split(',');
const REPS = Number(opt('reps', 2));
const DUREE = Number(opt('duree', 15));
const CALME = Number(opt('calme', 12));
const DUREE_TRACE = Number(opt('trace', 5));
const BUNDLE = resolve(ROOT, opt('bundle', 'dist/perf-nomin'));
const PORT = Number(opt('port', 4398));
const SORTIE = resolve(ROOT, opt('out', 'verification/out/perf/mesures.json'));
const URL = `http://localhost:${PORT}/`;
const L = 1366, H = 1024;

// ---- Les suspects ----------------------------------------------------------------------------------------------------
// raf: fichiers source dont on ignore les requestAnimationFrame (la boucle meurt à sa prochaine demande) ;
// css: feuille injectée ; video: pause de toutes les vidéos ; reglages: localStorage 'gc:reglages:v4' ; mq: prefers-reduced-motion.
const CSS_LUMIERE = '.gc-lumiere,.gc-lumiere__bain,.gc-lumiere__ambiance,.gc-lumiere__voile,.gc-lumiere__ombre,.gc-lumiere-papier,.gc-lumiere-tracee,.gc-ombre-feu{display:none!important}';
const CSS_ANIM = '*,*::before,*::after{animation:none!important;transition:none!important}';
const CSS_OMBRES = '.gc-livre__ombre,.gc-livre__ombre--gauche,.gc-book__shadow{box-shadow:none!important}';
const CSS_FILTRES = '*{filter:none!important;backdrop-filter:none!important}';
const RAF = {
  magie: ['src/components/Magie/'],
  bougie: ['src/components/Bougie/'],
  feu: ['src/lib/feu.ts'],
  aquarelle: ['src/components/Aquarelle/vivante.ts'],
  encre: ['src/components/PageCuite/encreVivante.ts'],
};
const TOUS_RAF = Object.values(RAF).flat();
const sauf = (n) => Object.entries(RAF).filter(([k]) => k !== n).flatMap(([, v]) => v);
export const VARIANTES = {
  base: {},
  magie: { raf: RAF.magie, desc: 'couche WebGL « Magie » (moteur.ts : poussière, photos vivantes, vidéos, reflets) : boucle rAF coupée' },
  'magie-masquee': { css: '.gc-magie{display:none!important}', desc: 'canvas Magie display:none (la boucle tourne, plus rien n\'est composité)' },
  bougie: { raf: RAF.bougie, desc: 'flamme de bougie (canvas WebGL Bougie) : rAF coupé' },
  feu: { raf: RAF.feu, desc: 'horloge du feu (lueur vacillante, MotionValues → opacité des calques de lumière) : rAF coupé' },
  aquarelle: { raf: RAF.aquarelle, desc: 'aquarelles vivantes (vivante.ts, WebGL par page) : rAF coupé' },
  encre: { raf: RAF.encre, desc: 'encre vivante (encreVivante.ts) : rAF coupé' },
  lumiere: { css: CSS_LUMIERE, desc: 'calques de lumière (gc-lumiere*, gc-ombre-feu) display:none' },
  'animations-css': { css: CSS_ANIM, desc: 'animations et transitions CSS coupées' },
  ombres: { css: CSS_OMBRES, desc: 'box-shadow --gc-sh-book (blur 64 px) du livre coupée' },
  filtres: { css: CSS_FILTRES, desc: 'filter / backdrop-filter / drop-shadow coupés' },
  video: { video: true, desc: 'vidéos de l\'album mises en pause' },
  'reglage-reduites': { reglages: { animations: 'reduites' }, desc: 'réglage de l\'app « Animations : réduites »' },
  'reglage-feu-off': { reglages: { feu: false }, desc: 'réglage de l\'app « feu » désactivé' },
  'prefers-reduced-motion': { mq: true, desc: 'prefers-reduced-motion: reduce émulé (réglage app « système »)' },
  'dpr1': { dpr: 1, desc: 'devicePixelRatio 1 au lieu de 2' },
  // « seul » : tout est coupé SAUF un suspect (échelle ascendante : le coût propre de chaque effet, à partir du plancher « tout »)
  'seul-magie': { raf: sauf('magie'), css: CSS_ANIM, desc: 'SEUL Magie tourne (tout le reste coupé, vidéos en pause)', video: true },
  'seul-magie+video': { raf: sauf('magie'), css: CSS_ANIM, desc: 'SEUL Magie tourne, vidéos de l\'album jouées' },
  'seul-bougie': { raf: sauf('bougie'), css: CSS_ANIM, video: true, desc: 'SEULE la bougie tourne' },
  'seul-feu': { raf: sauf('feu'), css: CSS_ANIM, video: true, desc: 'SEUL le feu tourne (lueur vacillante des calques de lumière)' },
  'seul-feu-sans-lumiere': { raf: sauf('feu'), css: CSS_ANIM + CSS_LUMIERE, video: true, desc: 'SEUL le feu tourne, calques de lumière masqués' },
  'seul-aquarelle': { raf: sauf('aquarelle'), css: CSS_ANIM, video: true, desc: 'SEULES les aquarelles vivantes tournent' },
  'seul-encre': { raf: sauf('encre'), css: CSS_ANIM, video: true, desc: 'SEULE l\'encre vivante tourne' },
  'seul-animations-css': { raf: TOUS_RAF, video: true, desc: 'SEULES les animations CSS tournent' },
  tout: { raf: TOUS_RAF, css: CSS_ANIM, video: true, desc: 'TOUT coupé : tous les rAF applicatifs, animations CSS, vidéos' },
  'tout+lumiere': { raf: TOUS_RAF, css: CSS_ANIM + CSS_LUMIERE, video: true, desc: 'tout coupé + calques de lumière masqués' },
};
const VARIANTES_DEFAUT = {
  julien: ['base', 'magie', 'magie-masquee', 'bougie', 'feu', 'aquarelle', 'encre', 'lumiere', 'animations-css', 'ombres', 'filtres', 'reglage-reduites', 'reglage-feu-off', 'prefers-reduced-motion', 'dpr1', 'tout', 'tout+lumiere', 'seul-magie', 'seul-bougie', 'seul-feu', 'seul-feu-sans-lumiere', 'seul-aquarelle', 'seul-animations-css'],
  'cecile-3': ['base', 'video', 'magie', 'bougie', 'feu', 'aquarelle', 'tout', 'seul-magie', 'seul-magie+video', 'seul-bougie', 'seul-feu', 'seul-aquarelle'],
  sommaire: ['base', 'magie', 'bougie', 'feu', 'aquarelle', 'encre', 'tout', 'seul-magie', 'seul-bougie', 'seul-feu', 'seul-aquarelle', 'seul-encre'],
};
const demandees = opt('variantes', '').split(',').filter(Boolean);

// ---- Serveur ---------------------------------------------------------------------------------------------------------
async function serveur() {
  try { const r = await fetch(URL); if (r.ok) return null; } catch { /* à lancer */ }
  const p = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', BUNDLE, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { await dormir(250); try { if ((await fetch(URL)).ok) return p; } catch { /* encore */ } }
  p.kill(); throw new Error('serveur de prévisualisation introuvable');
}

// ---- Une mesure ------------------------------------------------------------------------------------------------------
const moy = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const ecart = (a) => { const m = moy(a); return Math.sqrt(moy(a.map((x) => (x - m) ** 2))); };

async function analyserTrace(events, secondes) {
  const meta = {};
  for (const e of events) if (e.ph === 'M' && e.name === 'process_name') meta[e.pid] = e.args.name;
  const gpu = (e) => meta[e.pid] === 'GPU Process';
  let swaps = 0, gpuTaskUs = 0, raster = 0, rasterGpuUs = 0, beginMain = 0, draw = 0;
  const paints = {};
  for (const e of events) {
    if (e.ph === 'M') continue;
    if (e.name === 'Display::DrawAndSwap' && gpu(e)) swaps++;
    else if (e.name === 'GPUTask' && e.cat.includes('devtools.timeline')) gpuTaskUs += e.dur || 0;
    else if (e.name === 'RasterTask') raster++;
    else if (e.name === 'RasterDecoderImpl::DoEndRasterCHROMIUM' && gpu(e)) rasterGpuUs += e.dur || 0;
    else if (e.name === 'ProxyMain::BeginMainFrame') beginMain++;
    else if (e.name === 'Paint' && e.args?.data?.nodeName) {
      const n = e.args.data.nodeName.replace(/\s+id='[^']*'/, '');
      paints[n] = (paints[n] || 0) + 1;
    }
  }
  return {
    imagesAffichees: swaps / secondes,
    tachesGpuMs: gpuTaskUs / 1000 / secondes,
    tuilesRasterisees: raster / secondes,
    rasterGpuMs: rasterGpuUs / 1000 / secondes,
    beginMainFrame: beginMain / secondes,
    paints: Object.entries(paints).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => [n, +(c / secondes).toFixed(1)]),
  };
}

async function mesure(browser, carte, scenario, nomVariante, rep) {
  const v = VARIANTES[nomVariante];
  const ctx = browser.contexts()[0];
  const anciennes = ctx.pages();
  const page = await ctx.newPage();
  for (const p of anciennes) await p.close().catch(() => {});
  await pagePrete(browser, L, H);
  const cdp = await ctx.newCDPSession(page);
  await page.addInitScript(SONDE);
  if (v.reglages) {
    await page.addInitScript((r) => { try { localStorage.setItem('gc:reglages:v4', JSON.stringify({ v: 1, ...r })); } catch { /* ignoré */ } }, v.reglages);
  }
  if (v.mq) await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (v.dpr) await cdp.send('Emulation.setDeviceMetricsOverride', { width: L, height: H, deviceScaleFactor: v.dpr, mobile: false });

  const attente = await attendreCalme({ log: () => {} });
  await page.goto('about:blank');
  await page.goto(URL + '#' + scenario);
  // attente : au moins `calme` s, et plus aucune encre qui s'écrit (rAF de encreVivante muet pendant 2 s)
  const t0 = Date.now();
  let dernierEncre = Date.now();
  while (Date.now() - t0 < 60000) {
    await dormir(1000);
    const inst = await page.evaluate(() => window.__gc.instantane());
    const actif = Object.entries(inst.raf).some(([k]) => (carte(k) || '').includes('encreVivante'));
    await page.evaluate(() => window.__gc.zero());
    if (actif) dernierEncre = Date.now();
    if (Date.now() - t0 > CALME * 1000 && Date.now() - dernierEncre > 2000) break;
  }
  const settle = Math.round((Date.now() - t0) / 1000);

  // ---- on coupe le suspect
  if (v.raf) {
    const cles = cleBloquer(v.raf);
    await page.evaluate((c) => { for (const k of c) window.__gc.bloquerRaf.add(k); }, cles);
  }
  if (v.css) await page.addStyleTag({ content: v.css });
  if (v.video) {
    await page.evaluate(() => { for (const el of window.__gc.videos) el.pause(); HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; });
  }
  await dormir(2500);

  // ---- mesure CPU / rAF / GL
  const bc = await browser.newBrowserCDPSession();
  await page.evaluate(() => window.__gc.zero());
  const gpuSys = [];
  const series = { gpu: [], renderer: [], browser: [] };
  let avant = await cpuProcessus(bc);
  let tAvant = Date.now();
  const debutTotal = Date.now();
  const cumul = { gpu: 0, renderer: 0, browser: 0 };
  let derniereIo = 0;
  while ((Date.now() - debutTotal) / 1000 < DUREE) {
    await dormir(500);
    const apres = await cpuProcessus(bc);
    const dt = (Date.now() - tAvant) / 1000;
    tAvant = Date.now();
    const somme = { gpu: 0, renderer: 0, browser: 0 };
    for (const [id, p] of apres) {
      const t = /gpu/i.test(p.type) ? 'gpu' : /renderer/i.test(p.type) ? 'renderer' : /browser/i.test(p.type) ? 'browser' : null;
      if (!t) continue;
      const prev = avant.get(id);
      if (prev) somme[t] += p.cpu - prev.cpu;
    }
    for (const t of Object.keys(series)) { series[t].push((somme[t] / dt) * 100); cumul[t] += somme[t]; }
    avant = apres;
    if (Date.now() - derniereIo > 1000) { derniereIo = Date.now(); const u = utilisationGpuSysteme(); if (u) gpuSys.push(u.device); }
  }
  const inst = await page.evaluate(() => window.__gc.instantane());
  const lourds1 = processusLourds();

  // ---- trace
  const ev = [];
  bc.on('Tracing.dataCollected', (d) => ev.push(...d.value));
  const fini = new Promise((r) => bc.on('Tracing.tracingComplete', r));
  await bc.send('Tracing.start', { traceConfig: { includedCategories: ['viz', 'cc', 'gpu', 'toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline'] }, transferMode: 'ReportEvents' });
  await dormir(DUREE_TRACE * 1000);
  await bc.send('Tracing.end');
  await fini;
  const trace = await analyserTrace(ev, DUREE_TRACE);
  const encore = await page.evaluate(() => ({ hash: location.hash, anims: document.getAnimations().length, dpr: devicePixelRatio, iw: innerWidth, ih: innerHeight }));
  await bc.detach().catch(() => {});

  const raf = Object.entries(inst.raf).map(([k, e]) => ({ cle: k, src: carte(k) || k, nom: e.nom, parSeconde: +(e.n / inst.duree).toFixed(1), jsMs: +(e.ms / inst.duree).toFixed(2) }))
    .sort((a, b) => b.jsMs - a.jsMs);
  const canvas = inst.canvas.filter((c) => c.dessins > 0).map((c) => ({
    id: c.id, taille: `${c.w}x${c.h}`, css: c.css.join('x'), nom: c.chemin.split(' < ')[0], visible: c.visible,
    dessinsParS: +(c.dessins / inst.duree).toFixed(1), mpxParS: +(c.pixels / inst.duree / 1e6).toFixed(0),
  }));
  return {
    scenario, variante: nomVariante, rep, settle, attenteCalme: attente,
    cpu: { gpu: +moy(series.gpu).toFixed(1), gpuEcart: +ecart(series.gpu).toFixed(1), renderer: +moy(series.renderer).toFixed(1), rendererEcart: +ecart(series.renderer).toFixed(1), browser: +moy(series.browser).toFixed(1) },
    gpuSysteme: gpuSys.length ? +moy(gpuSys).toFixed(0) : null,
    jsTotalMsParS: +(inst.total.ms / inst.duree).toFixed(1), rappelsParS: +(inst.total.rappels / inst.duree).toFixed(0),
    raf, canvas, videos: inst.videos.filter((x) => !x.paused).length, trace, animsCss: encore.anims, page: encore,
    lourdsFinMesure: lourds1.map((p) => `${p.cmd} ${p.cpu}%`),
  };
}

// Clés rAF d'un ou plusieurs fichiers : tous les « ligne:colonne » du bundle dont la carte de sources renvoie ce fichier.
let TABLE = [];
const cleBloquer = (fichiers) => TABLE.filter(([, src]) => fichiers.some((f) => src.startsWith(f))).map(([k]) => k);

// ---- Programme -------------------------------------------------------------------------------------------------------
const sv = await serveur();
const carte = chargerCarte(BUNDLE);
{
  // table des positions de requestAnimationFrame( dans le bundle non minifié
  const dir = join(BUNDLE, 'assets');
  const js = readdirSync(dir).find((f) => /^index-.*\.js$/.test(f));
  const lignes = readFileSync(join(dir, js), 'utf8').split('\n');
  TABLE = [];
  lignes.forEach((l, i) => {
    let m; const re = /requestAnimationFrame\(/g;
    while ((m = re.exec(l))) {
      // la sonde relève la position de l'appel dans la pile : ligne i+1, colonne du « requestAnimationFrame » + 1
      const cle = `${i + 1}:${m.index + 1}`;
      const src = carte(cle);
      if (src) TABLE.push([cle, src]);
    }
  });
}

mkdirSync(dirname(SORTIE), { recursive: true });
const chrome = await lancerChrome({ largeur: L, hauteur: H });
const resultats = [];
const debut = new Date().toISOString();
const machine0 = etatMachine();
try {
  for (let rep = 1; rep <= REPS; rep++) {
    for (const sc of SCENARIOS) {
      const liste = (demandees.length ? demandees : VARIANTES_DEFAUT[sc] ?? VARIANTES_DEFAUT.julien).filter((n) => VARIANTES[n]);
      for (const nom of liste) {
        process.stdout.write(`[rep ${rep}] ${sc} / ${nom} … `);
        const r = await mesure(chrome.browser, carte, sc, nom, rep);
        resultats.push(r);
        console.log(`GPU ${r.cpu.gpu}% (±${r.cpu.gpuEcart})  renderer ${r.cpu.renderer}%  images/s ${r.trace.imagesAffichees.toFixed(0)}  ioreg ${r.gpuSysteme}%${r.lourdsFinMesure.length ? '  ! ' + r.lourdsFinMesure.join(',') : ''}`);
        writeFileSync(SORTIE, JSON.stringify({ debut, machine0, machine1: etatMachine(), reps: REPS, duree: DUREE, resultats }, null, 1));
      }
    }
  }
} finally {
  await chrome.fermer();
  sv?.kill();
}
console.log('écrit', SORTIE);
