// Fluidité du livre (composant Livre) : tourne-page, ouverture de la couverture, cran de caméra,
// zoom fin. Pour chaque scénario du banc d'essai (harness/motion.html) :
//   1. mesure (processeur ralenti ×4 par CDP) : temps de frame p50/p95/p99 échantillonnés par rAF,
//      frames > 25 ms, nombre de Layout / Paint / recalculs de style PENDANT le geste (trace
//      devtools.timeline bornée par les marques gc-geste-debut / gc-geste-fin), Performance.getMetrics
//      (LayoutCount, RecalcStyleCount… de l'appui à la fin) ;
//   2. nombre de calques pendant le geste (CDP LayerTree, passe à part) ;
//   3. vidéo webm 960×540 (recordVideo) d'une petite chorégraphie pilotée par les gestes, en
//      compositing logiciel (--disable-gpu : sous SwiftShader, la capture ne suit pas le mouvement) ;
//   4. captures figées à mi-geste (p = 0,25 / 0,5 / 0,75).
// Chromium sans GPU : --use-angle=swiftshader --enable-unsafe-swiftshader. Les i/s absolus y sont peu
// fiables ; ce qui compte : aucun Layout pendant le geste, des frames régulières.
//
//   node scripts/fps.mjs [--scenarios turn,open,camera,zoom,reduit] [--throttle 4]
//                        [--bundle dist/ds-s4/components] [--out verification/out/s4] [--no-video] [--no-poses]
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serve, ROOT } from './lib/serve.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const scenarios = opt('scenarios', 'turn,open,camera,zoom,reduit').split(',').filter(Boolean);
const throttle = Number(opt('throttle', 4));
const bundle = opt('bundle', 'dist/ds-s4/components');
const outDir = resolve(ROOT, opt('out', 'verification/out/s4'));
const video = !args.includes('--no-video');
const poses = !args.includes('--no-poses');
mkdirSync(outDir, { recursive: true });

const W = 1920, H = 1080;
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
// Vidéo : sous SwiftShader, la capture d'écran CDP de recordVideo ne reçoit presque aucune image
// pendant un mouvement ; en compositing logiciel, elle suit (≈ 12 images capturées par seconde).
const ARGS_VIDEO = ['--disable-gpu'];
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing'];

// Scénarios : requête du banc d'essai, touche du geste mesuré, type du geste, chorégraphie vidéo.
const SCENARIOS = {
  turn: {
    titre: 'Tourne-page (double page 2 → 3)', query: 'scenario=turn&index=1', touche: 'ArrowRight', type: 'page',
    video: [[600], ['ArrowRight'], ['ArrowLeft'], ['ArrowRight', 150], ['ArrowRight', 150], ['ArrowRight'], ['PageUp'], ['End']],
  },
  open: {
    titre: 'Ouverture de la couverture', query: 'scenario=open', touche: 'ArrowRight', type: 'couverture',
    video: [[600], ['ArrowRight'], ['ArrowRight'], ['ArrowLeft'], ['ArrowLeft']],
  },
  camera: {
    titre: 'Cran de caméra (moyenne → loin), transition de vue', query: 'scenario=camera&index=1', touche: '-', type: 'distance',
    video: [[600], ['-'], ['+'], ['+'], ['-']],
  },
  zoom: {
    titre: 'Zoom fin (95 % → 100 %)', query: 'scenario=zoom&index=1', touche: '0', type: 'zoom',
    video: [[600], ['0'], ['ArrowUp', 110], ['ArrowUp', 110], ['ArrowUp', 110], ['ArrowUp', 110], ['ArrowUp'], ['ArrowDown', 110], ['ArrowDown', 110], ['ArrowDown', 110], ['ArrowDown', 110], ['ArrowDown', 110], ['ArrowDown', 110], ['ArrowDown', 110], ['ArrowDown', 110], ['ArrowDown', 110], ['ArrowDown'], ['0']],
  },
  reduit: {
    titre: 'Moins de mouvement : fondu court', query: 'scenario=turn&index=1', touche: 'ArrowRight', type: 'fondu', reduced: true,
    video: [[600], ['ArrowRight'], ['ArrowRight'], ['ArrowLeft']],
  },
};

const POSES = [
  ['turn-p25', 'scenario=pose&index=1&vers=2&p=0.25'],
  ['turn-p50', 'scenario=pose&index=1&vers=2&p=0.5'],
  ['turn-p75', 'scenario=pose&index=1&vers=2&p=0.75'],
  ['back-p50', 'scenario=pose&index=2&vers=1&p=0.5'],
  ['open-p25', 'scenario=pose&index=-1&vers=0&p=0.25'],
  ['open-p50', 'scenario=pose&index=-1&vers=0&p=0.5'],
  ['open-p75', 'scenario=pose&index=-1&vers=0&p=0.75'],
  ['repos-ferme', 'scenario=open'],
  ['repos-proche', 'scenario=turn&index=1&distance=proche'],
  ['repos-moyenne', 'scenario=turn&index=1&distance=moyenne'],
  ['repos-loin', 'scenario=turn&index=1&distance=loin'],
];

async function lancer(args = ARGS) {
  try {
    return await chromium.launch({ args });
  } catch (e) {
    const fallback = '/opt/pw-browsers/chromium';
    if (existsSync(fallback)) return chromium.launch({ executablePath: fallback, args });
    throw e;
  }
}

async function ouvrir(context, srv, query) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${srv.url}/harness/motion.html?${query}&b=${encodeURIComponent(bundle)}`);
  await page.waitForFunction(() => window.__gcMotion?.ready === true, null, { timeout: 30000 });
  const err = await page.evaluate(() => window.__gcMotion.error);
  if (err) errors.push(err);
  return { page, errors };
}

const quantile = (xs, q) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
};
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const metrics = (res) => Object.fromEntries(res.metrics.map((m) => [m.name, m.value]));

// ---- 1. Mesure ------------------------------------------------------------------------------
async function mesurer(browser, srv, nom, sc) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: sc.reduced ? 'reduce' : 'no-preference' });
  const { page, errors } = await ouvrir(context, srv, sc.query);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.waitForTimeout(800);
  const m0 = metrics(await cdp.send('Performance.getMetrics'));
  await browser.startTracing(page, { categories: CATEGORIES });
  await page.evaluate(() => window.__gcMotion.arm());
  await page.keyboard.press(sc.touche);
  const res = await page.evaluate((type) => window.__gcMotion.waitEnd(type), sc.type);
  const buf = await browser.stopTracing();
  const m1 = metrics(await cdp.send('Performance.getMetrics'));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await context.close();

  // Bornes du geste : marques posées par le banc d'essai (horloge de la trace, µs).
  const ev = JSON.parse(buf.toString()).traceEvents;
  const marque = (nom) => ev.filter((e) => e.name === nom && String(e.cat).includes('blink.user_timing')).map((e) => e.ts).sort((a, b) => a - b);
  const t0 = marque(`gc-geste-debut-${sc.type}`)[0];
  const fins = marque(`gc-geste-fin-${sc.type}`);
  const t1 = fins.find((t) => t > t0) ?? fins[fins.length - 1];
  const dans = (e) => t0 != null && t1 != null && e.ts >= t0 && e.ts <= t1 && (e.ph === 'X' || e.ph === 'B');
  const compte = (n) => ev.filter((e) => e.name === n && dans(e)).length;
  const details = (n) => ev.filter((e) => e.name === n && dans(e)).map((e) => r1((e.ts - t0) / 1000));

  // Temps de frame (rAF) pendant le geste.
  const d = res.gestes.find((g) => g.phase === 'debut' && g.type === sc.type);
  const prepa = res.gestes.find((g) => g.phase === 'prepa' && g.type === sc.type);
  const f = res.gestes.find((g) => g.phase === 'fin' && g.type === sc.type);
  const frames = d && f ? res.frames.filter((t) => t >= d.t && t <= f.t) : [];
  const dt = frames.slice(1).map((t, i) => t - frames[i]);
  return {
    scenario: nom,
    titre: sc.titre,
    erreurs: errors,
    expire: res.timeout,
    dureeGesteMs: d && f ? r1(f.t - d.t) : null,
    preparationMs: prepa && d ? r1(d.t - prepa.t) : null,
    frames: dt.length,
    frameMs: { p50: r1(quantile(dt, 0.5)), p95: r1(quantile(dt, 0.95)), p99: r1(quantile(dt, 0.99)), max: r1(Math.max(...dt)) },
    framesPlusDe25ms: dt.filter((x) => x > 25).length,
    intervallesMs: dt.map((x) => Math.round(x)),
    pendantLeGeste: {
      Layout: compte('Layout'),
      Paint: compte('Paint'),
      UpdateLayoutTree: compte('UpdateLayoutTree'),
      LayoutA_ms: details('Layout'),
      PaintA_ms: details('Paint'),
    },
    appuiJusquaFin: {
      LayoutCount: (m1.LayoutCount ?? 0) - (m0.LayoutCount ?? 0),
      RecalcStyleCount: (m1.RecalcStyleCount ?? 0) - (m0.RecalcStyleCount ?? 0),
      LayoutDurationMs: r1(((m1.LayoutDuration ?? 0) - (m0.LayoutDuration ?? 0)) * 1000),
      RecalcStyleDurationMs: r1(((m1.RecalcStyleDuration ?? 0) - (m0.RecalcStyleDuration ?? 0)) * 1000),
      ScriptDurationMs: r1(((m1.ScriptDuration ?? 0) - (m0.ScriptDuration ?? 0)) * 1000),
    },
  };
}

// ---- 2. Calques (CDP LayerTree, passe à part : le domaine ralentit le compositeur) ----------
async function compterCalques(browser, srv, sc) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: sc.reduced ? 'reduce' : 'no-preference' });
  const { page } = await ouvrir(context, srv, sc.query);
  const cdp = await context.newCDPSession(page);
  let calques = 0, dessines = 0;
  cdp.on('LayerTree.layerTreeDidChange', ({ layers }) => {
    if (!layers) return;
    calques = Math.max(calques, layers.length);
    dessines = Math.max(dessines, layers.filter((l) => l.drawsContent).length);
  });
  await cdp.send('LayerTree.enable');
  await page.keyboard.press(sc.touche);
  await page.evaluate(() => window.__gcMotion.attendreCalme(500, 8000));
  await cdp.send('LayerTree.disable').catch(() => {});
  await context.close();
  return { calquesMax: calques, calquesDessinesMax: dessines };
}

// ---- 3. Vidéo : chorégraphie pilotée par les gestes (on attend la fin de chaque mouvement) -----
// [touche] : appui puis attente du calme · [touche, ms] : appui puis pause · [ms] : pause.
async function filmer(browser, srv, nom, sc) {
  if (!video) return { video: null };
  const tmp = join(outDir, '.video-tmp');
  const context = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: sc.reduced ? 'reduce' : 'no-preference',
    recordVideo: { dir: tmp, size: { width: W / 2, height: H / 2 } },
  });
  const { page, errors } = await ouvrir(context, srv, sc.query);
  for (const etape of sc.video) {
    if (typeof etape[0] === 'number') { await page.waitForTimeout(etape[0]); continue; }
    await page.keyboard.press(etape[0]);
    if (etape[1] !== undefined) await page.waitForTimeout(etape[1]);
    else await page.evaluate(() => window.__gcMotion.attendreCalme(700, 8000));
  }
  await page.waitForTimeout(500);
  const v = page.video();
  await context.close();
  const chemin = join(outDir, `${nom}.webm`);
  await v.saveAs(chemin);
  await v.delete();
  return { video: chemin.replace(ROOT + '/', ''), erreursVideo: errors };
}

// ---- 4. Captures à mi-geste ------------------------------------------------------------------
async function capturer(browser, srv) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const fichiers = [];
  for (const [nom, query] of POSES) {
    const { page, errors } = await ouvrir(context, srv, query);
    await page.waitForTimeout(250);
    const f = join(outDir, `${nom}.png`);
    await page.screenshot({ path: f });
    fichiers.push(f.replace(ROOT + '/', '') + (errors.length ? `  ✗ ${errors.join(' | ')}` : ''));
    await page.close();
  }
  // Captures interactives : le repère de caméra (zoom fin) et l'anneau de focus d'une flèche.
  const { page } = await ouvrir(context, srv, 'scenario=turn&index=1&tables=bois');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, 'repere-zoom.png') });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(outDir, 'focus-fleche.png') });
  fichiers.push(join(outDir, 'repere-zoom.png').replace(ROOT + '/', ''), join(outDir, 'focus-fleche.png').replace(ROOT + '/', ''));
  await context.close();
  return fichiers;
}

const srv = await serve();
const browser = await lancer();
const browserVideo = video ? await lancer(ARGS_VIDEO) : null;
const rapport = { date: new Date().toISOString(), throttle, bundle, navigateur: browser.version(), args: ARGS, argsVideo: ARGS_VIDEO, scenarios: [] };
for (const nom of scenarios) {
  const sc = SCENARIOS[nom];
  if (!sc) { console.warn(`scénario inconnu : ${nom}`); continue; }
  const r = await mesurer(browser, srv, nom, sc);
  Object.assign(r, await compterCalques(browser, srv, sc));
  Object.assign(r, await filmer(browserVideo, srv, nom, sc));
  rapport.scenarios.push(r);
  const g = r.pendantLeGeste;
  console.log(`\n■ ${r.titre}${r.expire ? '  (⚠ fin du geste non reçue)' : ''}`);
  console.log(`  geste ${r.dureeGesteMs} ms${r.preparationMs != null ? ` (captures de la transition de vue avant le mouvement : ${r.preparationMs} ms)` : ''} · ${r.frames} frames · frame p50 ${r.frameMs.p50} / p95 ${r.frameMs.p95} / p99 ${r.frameMs.p99} / max ${r.frameMs.max} ms · > 25 ms : ${r.framesPlusDe25ms}`);
  console.log(`  pendant le geste : Layout ${g.Layout} · Paint ${g.Paint} · recalcul de style ${g.UpdateLayoutTree}${g.Layout ? `  (Layout à ${g.LayoutA_ms.join(', ')} ms)` : ''}${g.Paint ? `  (Paint à ${g.PaintA_ms.join(', ')} ms)` : ''}`);
  console.log(`  de l'appui à la fin : LayoutCount ${r.appuiJusquaFin.LayoutCount} · RecalcStyleCount ${r.appuiJusquaFin.RecalcStyleCount} · Layout ${r.appuiJusquaFin.LayoutDurationMs} ms · script ${r.appuiJusquaFin.ScriptDurationMs} ms`);
  console.log(`  calques : ${r.calquesMax} (dont ${r.calquesDessinesMax} dessinés)${r.video ? ` · vidéo ${r.video}` : ''}`);
  const errs = [...r.erreurs, ...(r.erreursVideo ?? [])];
  if (errs.length) console.log(`  erreurs : ${errs.join(' | ')}`);
}
if (poses) {
  rapport.captures = await capturer(browser, srv);
  console.log(`\ncaptures :\n  ${rapport.captures.join('\n  ')}`);
}
await browser.close();
await browserVideo?.close();
await srv.close();
writeFileSync(join(outDir, 'fps.json'), JSON.stringify(rapport, null, 2));
console.log(`\nrapport : ${join(outDir, 'fps.json').replace(ROOT + '/', '')}`);
