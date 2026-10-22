// Sonde de debug : état des toiles et des boucles après N s (hash donné).
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { lancerChrome, pagePrete, dormir, ROOT, SONDE } from './lib.mjs';
const a = process.argv.slice(2);
const opt = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
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
  await page.goto(URL + '#' + opt('hash', 'julien'));
  await dormir(Number(opt('attente', 15)) * 1000);
  console.log(await page.evaluate(async () => {
    window.__gc.zero(); await new Promise(r => setTimeout(r, 2000));
    const i = window.__gc.instantane();
    return JSON.stringify({ raf: i.raf, etat: window.__gcDessins?.etat?.().map(e => ({ page: e.page, joue: e.joue, d: e.dessins.map(x => x.nom + ':' + x.peinte + ':' + x.scene) })), anims: document.getAnimations().length, magie: window.__gcMagie?.etat?.() }, null, 1).slice(0, 6000);
  }));
} finally { await chrome.fermer(); sv?.kill(); }
