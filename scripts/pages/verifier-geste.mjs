// Tourne-page sur les VRAIES doubles pages de la démo (pages cuites) : la carte DemoCarnet,
// Julie → Rose → Mathis, processeur ralenti ×4. Compte les Layout / Paint pendant chaque geste
// (trace devtools bornée par les événements gc-livre-geste), les images de pages cuites encore non
// décodées au départ du geste, et le temps de frame.
//
//   node scripts/pages/verifier-geste.mjs [--bundle dist/ds-n3/components] [--out verification/out/n3]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serve, ROOT } from '../lib/serve.mjs';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const bundle = opt('bundle', 'dist/ds-n3/components');
const out = resolve(ROOT, opt('out', 'verification/out/n3'));
const throttle = Number(opt('throttle', 4));
mkdirSync(out, { recursive: true });
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing'];

const srv = await serve();
// comme scripts/fps.mjs : rendu GPU logiciel (SwiftShader), images régulières
const ARGS = process.env.GC_ARGS ? process.env.GC_ARGS.split(' ') : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: ARGS }).catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ARGS }));
void existsSync;
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) erreurs.push(`${r.status()} ${r.url()}`); });
const css = opt('css', '');
if (css) await page.addInitScript((c) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = c; document.head.appendChild(st); }); }, css);
await page.addInitScript(() => {
  const M = (window.__n3 = { gestes: [], frames: [] });
  document.addEventListener('gc-livre-geste', (e) => {
    M.gestes.push({ ...e.detail, t: performance.now() });
    performance.mark(`gc-geste-${e.detail.phase}-${e.detail.type}`);
    if (e.detail.phase === 'debut') {
      // images de pages cuites pas encore décodées au départ du mouvement
      const ko = [...document.querySelectorAll('.gc-page-cuite img')].filter((i) => !i.complete || !i.naturalWidth);
      M.nonDecodees = ko.length;
      M.nonDecodeesSrc = [...new Set(ko.map((i) => i.src.split('/').slice(-2).join('/')))];
      M.debutT = performance.now();
    }
  });
  const loop = (t) => { M.frames.push(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
await page.goto(`${srv.url}/harness/card.html?c=${encodeURIComponent('src/artboards/DemoCarnet/preview.html')}&b=${encodeURIComponent(bundle)}`);
await page.waitForFunction(() => window.__gcReady === true, null, { timeout: 30000 });
await page.mouse.click(960, 1060);

const attendreFin = (type, n) => page.waitForFunction(([type, n]) => window.__n3.gestes.filter((g) => g.phase === 'fin' && g.type === type).length >= n, [type, n], { timeout: 30000 });

// ouverture de la couverture → Julie
await page.keyboard.press('ArrowRight');
await attendreFin('couverture', 1);
await page.waitForTimeout(1500);

const cdp = await context.newCDPSession(page);
const rapport = { bundle, throttle, gestes: [] };
for (const [k, nom] of [[1, 'julie → rose'], [2, 'rose → mathis']]) {
  await page.waitForTimeout(1200);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await browser.startTracing(page, { categories: CATEGORIES });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(600);
  const f0 = await page.evaluate(() => window.__n3.frames.length);
  await page.keyboard.press('ArrowRight');
  await attendreFin('page', k);
  await page.waitForTimeout(200);
  const buf = await browser.stopTracing();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const M = await page.evaluate(() => window.__n3);
  const ev = JSON.parse(buf.toString()).traceEvents;
  const marque = (n) => ev.filter((e) => e.name === n && String(e.cat).includes('blink.user_timing')).map((e) => e.ts).sort((a, b) => a - b);
  const t0 = marque('gc-geste-debut-page').at(-1);
  const t1 = marque('gc-geste-fin-page').at(-1);
  console.log(`  trace : ${ev.length} événements, marques ${[...new Set(ev.filter((e) => String(e.cat).includes('user_timing')).map((e) => e.name))].join(', ')} ; t0 ${t0} t1 ${t1}`);
  const dans = (e) => t0 != null && t1 != null && e.ts >= t0 && e.ts <= t1 && (e.ph === 'X' || e.ph === 'B');
  const compte = (n) => ev.filter((e) => e.name === n && dans(e)).length;
  const decodes = ev.filter((e) => /Decode/i.test(e.name) && dans(e));
  const lay = ev.filter((e) => (e.name === 'Layout' || e.name === 'Paint' || e.name === 'UpdateLayoutTree') && dans(e))
    .map((e) => `${e.name}@${Math.round((e.ts - t0) / 1000)}ms ${JSON.stringify(e.args?.beginData?.stackTrace?.[0]?.functionName ?? e.args?.data?.nodeName ?? '')}`);
  if (lay.length) console.log('  détail : ' + lay.join(' | ') + ` (geste ${Math.round((t1 - t0) / 1000)} ms)`);
  const longs = ev.filter((e) => e.ph === 'X' && e.dur > 30000 && t0 != null && e.ts + e.dur >= t0 - 500000 && e.ts <= t1)
    .sort((a, b) => b.dur - a.dur).slice(0, 6).map((e) => `${e.name} ${Math.round(e.dur / 1000)} ms à ${Math.round((e.ts - t0) / 1000)} ms`);
  console.log('  gestes : ' + M.gestes.slice(-6).map((g) => `${g.phase}/${g.type}@${Math.round(g.t)}`).join(' ') + ` · frames ${M.frames.length} (dernière ${Math.round(M.frames.at(-1))})`);
  const d = M.gestes.filter((g) => g.phase === 'debut' && g.type === 'page').at(-1);
  const f = M.gestes.filter((g) => g.phase === 'fin' && g.type === 'page').at(-1);
  const fr = M.frames.slice(f0).filter((t) => t >= d.t && t <= f.t);
  const dt = fr.slice(1).map((t, i) => t - fr[i]).sort((a, b) => a - b);
  const r = {
    geste: nom,
    dureeMs: Math.round(f.t - d.t),
    Layout: compte('Layout'),
    Paint: compte('Paint'),
    UpdateLayoutTree: compte('UpdateLayoutTree'),
    decodagesPendant: decodes.length,
    decodagesPendantMs: Math.round(decodes.reduce((s, e) => s + (e.dur ?? 0), 0) / 100) / 10,
    imagesNonDecodeesAuDepart: M.nonDecodees,
    imagesNonDecodeesSrc: M.nonDecodeesSrc,
    nFrames: fr.length,
    tachesLongues: longs,
    frameMs: { p50: Math.round(dt[Math.floor(dt.length * 0.5)] ?? 0), p95: Math.round(dt[Math.floor(dt.length * 0.95)] ?? 0), max: Math.round(dt.at(-1) ?? 0) },
  };
  rapport.gestes.push(r);
  console.log('  tâches longues : ' + longs.join(' | '));
  console.log(`■ ${nom} : ${r.dureeMs} ms · Layout ${r.Layout} · Paint ${r.Paint} · recalcul de style ${r.UpdateLayoutTree} · décodages d'image pendant le geste ${r.decodagesPendant} (${r.decodagesPendantMs} ms) · images non chargées au départ ${r.imagesNonDecodeesAuDepart} ${JSON.stringify(r.imagesNonDecodeesSrc)} · ${r.nFrames} frames · frame p50 ${r.frameMs.p50} / p95 ${r.frameMs.p95} / max ${r.frameMs.max} ms`);
}
await page.screenshot({ path: join(out, 'geste-apres.png') });
rapport.erreurs = erreurs;
writeFileSync(join(out, 'geste.json'), JSON.stringify(rapport, null, 1) + '\n');
if (erreurs.length) console.log(`erreurs : ${erreurs.join(' | ')}`);
await browser.close();
await srv.close();
