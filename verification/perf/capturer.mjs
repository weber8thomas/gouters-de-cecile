// Captures de #julien (ou autre hash) : une image fixe + 3 images à 0,5 s d'intervalle (la lueur et la flamme bougent-elles ?).
//   NODE_OPTIONS= node verification/perf/capturer.mjs --bundle dist/perf-nomin --prefixe verification/out/perf/avant-julien [--hash julien] [--attente 20] [--port 4398]
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { lancerChrome, pagePrete, dormir, ROOT } from './lib.mjs';

const a = process.argv.slice(2);
const opt = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
const BUNDLE = resolve(ROOT, opt('bundle', 'dist/perf-nomin'));
const PREFIXE = resolve(ROOT, opt('prefixe', 'verification/out/perf/capture'));
const PORT = Number(opt('port', 4398));
const HASH = opt('hash', 'julien');
const ATTENTE = Number(opt('attente', 20));
const URL = `http://localhost:${PORT}/`;

let sv = null;
try { if (!(await fetch(URL)).ok) throw 0; } catch {
  sv = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', BUNDLE, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { await dormir(250); try { if ((await fetch(URL)).ok) break; } catch { /* encore */ } }
}
mkdirSync(dirname(PREFIXE), { recursive: true });
const chrome = await lancerChrome({ largeur: 1366, hauteur: 1024 });
try {
  const page = await pagePrete(chrome.browser, 1366, 1024);
  await page.goto('about:blank');
  await page.goto(URL + '#' + HASH);
  await dormir(ATTENTE * 1000);
  await page.screenshot({ path: `${PREFIXE}.png` });
  for (let i = 1; i <= 3; i++) { await page.screenshot({ path: `${PREFIXE}-${i}.png` }); await dormir(500); }
  console.log('écrit', PREFIXE + '(-1..3).png');
} finally {
  await chrome.fermer();
  sv?.kill();
}
