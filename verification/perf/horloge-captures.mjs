// Trois captures à 0,5 s d'intervalle de #julien au repos (bundle perf, serveur de prévisualisation), pour vérifier à
// l'œil que la flamme danse toujours et que la lueur vit avec l'horloge commune de 12 Hz (src/lib/horloge.ts).
//   NODE_OPTIONS= nice -n 19 node verification/perf/horloge-captures.mjs [--bundle dist/perf-nomin] [--prefixe horloge]
// → verification/out/perf/<prefixe>-1.png, -2.png, -3.png (page entière) et <prefixe>-flamme-1…3.png (flamme agrandie).
// Affiche aussi, pour chaque paire, l'écart moyen de la flamme et de la lueur sur la table, et les phases (ms, modulo
// un palier de 1/12 s) de toutes les animations de la page : elles doivent être égales (horloge commune).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lancerChrome, pagePrete, dormir, ROOT } from './lib.mjs';

const a = process.argv.slice(2);
const opt = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
const PORT = 4397, URL = `http://localhost:${PORT}/`;
const PREFIXE = opt('prefixe', 'horloge');
const sortie = join(ROOT, 'verification/out/perf');
mkdirSync(sortie, { recursive: true });
const sv = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', resolve(ROOT, opt('bundle', 'dist/perf-nomin')), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { await dormir(250); try { if ((await fetch(URL)).ok) break; } catch { /* encore */ } }
const chrome = await lancerChrome({ largeur: 1366, hauteur: 1024 });
try {
  const page = await pagePrete(chrome.browser, 1366, 1024);
  await page.goto(URL + '#julien');
  await dormir(Number(opt('attente', 18)) * 1000);
  const info = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
    const PAS = 1000 / 12;
    const phases = document.getAnimations().filter((x) => x.effect?.target && (x.effect.getTiming().iterations === Infinity)).map((x) => {
      const t = x.effect.getComputedTiming();
      const nom = x.effect.target.className?.toString().split(' ')[0] ?? '';
      return { nom, debut: x.startTime, duree: t.duration, delai: t.delay, reste: +(((x.startTime - t.delay) % PAS + PAS) % PAS).toFixed(4) };
    });
    return { flamme: r('.gc-bougie__flamme'), halo: r('.gc-bougie__halo'), phases };
  });
  console.log('animations bouclées :', info.phases.length);
  for (const p of info.phases) console.log(`  ${p.nom.padEnd(28)} startTime ${p.debut}  durée ${p.duree}  délai ${p.delai}  (startTime − délai) mod 1/12 s = ${p.reste}`);
  const fl = info.flamme;
  const marge = 14;
  const clip = fl && { x: Math.max(0, fl.x - marge), y: Math.max(0, fl.y - marge), width: fl.width + 2 * marge, height: fl.height + 2 * marge };
  for (let i = 1; i <= 3; i++) {
    await page.screenshot({ path: join(sortie, `${PREFIXE}-${i}.png`) });
    if (clip) await page.screenshot({ path: join(sortie, `${PREFIXE}-flamme-${i}.png`), clip });
    if (i < 3) await dormir(500);
  }
  console.log(JSON.stringify({ flamme: info.flamme, halo: info.halo }));
} finally { await chrome.fermer(); sv.kill(); }
