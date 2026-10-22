// Cuit src/components/Bougie/flamme-sprites.webp + flamme-sprites.json (voir cuire-flamme.ts).
//   NODE_OPTIONS= node verification/perf/cuire-flamme.mjs
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lancerChrome, pagePrete, dormir, ROOT } from './lib.mjs';

const PORT = 5197;
const sv = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const chrome = await lancerChrome({ largeur: 900, hauteur: 700 });
try {
  const url = `http://localhost:${PORT}/verification/perf/cuire-flamme.html`;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* encore */ } await dormir(500); }
  const page = await pagePrete(chrome.browser, 900, 700);
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[erreur]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => document.title === 'fini', null, { timeout: 120000 });
  const r = await page.evaluate(() => window.__resultat);
  const png = join(ROOT, 'src/components/Bougie/flamme-sprites.png');
  writeFileSync(png, Buffer.from(r.png.split(',')[1], 'base64'));
  const { png: _, ...meta } = r;
  writeFileSync(join(ROOT, 'src/components/Bougie/flamme-sprites.json'), JSON.stringify(meta));
  execFileSync('cwebp', ['-q', '88', '-alpha_q', '95', '-m', '6', png, '-o', join(ROOT, 'src/components/Bougie/flamme-sprites.webp')]);
  execFileSync('rm', [png]);
  console.log('ok', meta.n, 'images', meta.fw + 'x' + meta.fh);
} finally { await chrome.fermer(); sv.kill(); }
