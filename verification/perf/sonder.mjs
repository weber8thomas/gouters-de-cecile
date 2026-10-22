// Sonde de debug : état des toiles et des boucles après N s (hash donné), avec le CPU des processus GPU / renderer.
//   NODE_OPTIONS= nice -n 19 node verification/perf/sonder.mjs --bundle dist/local --hash cecile-3 --attente 8 --fenetre 10 [--avant]
//   --avant   force l'ancienne boucle de la magie (window.__gcMagieRaf : un rAF continu tant qu'une photo est vivante),
//             pour comparer avec la boucle pilotée par les images vidéo (défaut).
//   --fenetre durée de la mesure (s) : rAF/s et CPU du processus GPU (% d'un cœur), sur cette fenêtre.
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { lancerChrome, pagePrete, dormir, cpuProcessus, ROOT, SONDE } from './lib.mjs';
const a = process.argv.slice(2);
const opt = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
const AVANT = a.includes('--avant');
const FENETRE = Number(opt('fenetre', 2));
const PORT = 4398, URL = `http://localhost:${PORT}/`;
let sv = null;
try { if (!(await fetch(URL)).ok) throw 0; } catch {
  sv = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', resolve(ROOT, opt('bundle', 'dist/perf-nomin')), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { await dormir(250); try { if ((await fetch(URL)).ok) break; } catch {} }
}
const chrome = await lancerChrome({ largeur: 1366, hauteur: 1024 });
try {
  const page = await pagePrete(chrome.browser, 1366, 1024);
  await page.addInitScript(SONDE);
  if (AVANT) await page.addInitScript('window.__gcMagieRaf = true;');
  await page.goto(URL + '#' + opt('hash', 'julien'));
  await dormir(Number(opt('attente', 15)) * 1000);
  const bc = await chrome.browser.newBrowserCDPSession();
  await page.evaluate(() => window.__gc.zero());
  const avant = await cpuProcessus(bc);
  const t0 = Date.now();
  await dormir(FENETRE * 1000);
  const apres = await cpuProcessus(bc);
  const dt = (Date.now() - t0) / 1000;
  const cpu = { gpu: 0, renderer: 0, browser: 0 };
  for (const [id, p] of apres) {
    const t = /gpu/i.test(p.type) ? 'gpu' : /renderer/i.test(p.type) ? 'renderer' : /browser/i.test(p.type) ? 'browser' : null;
    const prev = avant.get(id);
    if (t && prev) cpu[t] += p.cpu - prev.cpu;
  }
  const r = await page.evaluate(() => {
    const i = window.__gc.instantane();
    const n = Object.values(i.raf).reduce((s, e) => s + e.n, 0);
    return { duree: i.duree, rafTotal: n, raf: Object.fromEntries(Object.entries(i.raf).map(([k, e]) => [k + ' ' + e.nom, e.n])), videos: i.videos, dessins: i.canvas.map((c) => ({ id: c.id, dessins: c.dessins, visible: c.visible })) };
  });
  console.log(JSON.stringify({
    boucle: AVANT ? 'ancienne (rAF continu)' : 'images vidéo',
    fenetre_s: +dt.toFixed(1),
    rafParSeconde: +(r.rafTotal / r.duree).toFixed(1),
    rafParSource: r.raf,
    dessinsWebGLParSeconde: r.dessins.map((c) => ({ canvas: c.id, parSeconde: +(c.dessins / r.duree).toFixed(1) })),
    cpuPourCent: { gpu: +((cpu.gpu / dt) * 100).toFixed(1), renderer: +((cpu.renderer / dt) * 100).toFixed(1), navigateur: +((cpu.browser / dt) * 100).toFixed(1) },
    videosEnLecture: r.videos.filter((v) => !v.paused).length,
    videos: r.videos.map((v) => `${v.src} ${v.paused ? 'pause' : 'joue'}`),
  }, null, 1));
} finally { await chrome.fermer(); sv?.kill(); }
