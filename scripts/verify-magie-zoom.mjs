// Régression zoom : vraie molette Ctrl du contrôleur, changements DPR et pincement natif CDP.
// Chromium Linux avec DPR émulé ; ne vaut pas un essai matériel Mac/Safari.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { lancer, ouvrirCible, capture, ROOT } from './lib/verif.mjs';
const out = join(ROOT, 'verification/out/magie-zoom'); mkdirSync(out, { recursive: true });
const cible = await ouvrirCible({ bundle: 'dist/ds-magie-zoom/components' });
const browser = await lancer(); const resultats = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.setItem('gc:reglages:v4', JSON.stringify({ v: 1, animations: 'reduites', muet: true, boutonsToujoursVisibles: true })));
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(String(e)));
  await p.goto(cible.url(null, 'gateaux'));
  await p.waitForFunction(() => window.__gcMagie?.etat().pages.some(x => x.fini && x.orn > 0), null, { timeout: 25000 });
  const cdp = await ctx.newCDPSession(p);
  async function verifier(nom) {
    await p.waitForFunction(() => {
      const c = document.querySelector('.gc-magie'), s = window.__gcMagie?.etat();
      if (!s || !c || s.pauseLoupe || getComputedStyle(c).visibility !== 'visible') return false;
      const q = c.getBoundingClientRect().width / 1920;
      const attendu = Math.min(q * Math.min(2, devicePixelRatio * (visualViewport?.scale || 1)), Math.sqrt(2.4e6 / (1920 * 1080)));
      return Math.abs(s.q - q) < .005 && Math.abs(c.width - 1920 * attendu) < 3;
    }, null, { timeout: 6000 });
    const a = await p.screenshot(); const style = await p.addStyleTag({ content: '.gc-magie{visibility:hidden!important}' });
    const z = await p.screenshot(); await style.evaluate(e => e.remove());
    const A = PNG.sync.read(a), Z = PNG.sync.read(z); let pixels = 0;
    for (let i = 0; i < A.data.length; i += 4) if (Math.max(Math.abs(A.data[i] - Z.data[i]), Math.abs(A.data[i + 1] - Z.data[i + 1]), Math.abs(A.data[i + 2] - Z.data[i + 2])) > 12) pixels++;
    const s = await p.evaluate(() => ({ ...window.__gcMagie.etat(), loupe: document.querySelector('.gc-ecran')?.dataset.gcLoupe, scale: visualViewport?.scale, contextePerdu: document.querySelector('.gc-magie').getContext('webgl').isContextLost() }));
    await capture(p, nom, out);
    const ok = pixels > 30 && !s.contextePerdu && !s.pauseLoupe;
    resultats.push({ nom, ok, pixelsDeMagie: pixels, etat: s });
    console.log(nom, ok ? 'OK' : 'KO', JSON.stringify({ pixels, dpr: s.dpr, q: s.q, k: s.k, scale: s.scale, loupe: s.loupe }));
  }
  await verifier('initial-dpr1');
  await p.mouse.move(580, 360); await p.keyboard.down('Control');
  await p.mouse.wheel(0, -100); await p.mouse.wheel(0, -100); await p.keyboard.up('Control');
  await p.waitForFunction(() => document.querySelector('.gc-ecran')?.dataset.gcLoupe === 'zoome');
  await verifier('trackpad-loupe');
  await p.keyboard.press('0'); await p.waitForFunction(() => document.querySelector('.gc-ecran')?.dataset.gcLoupe !== 'zoome');
  for (const dpr of [2, 1.5]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: dpr, mobile: false });
    await verifier(`retina-dpr${dpr}`);
  }
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
  await verifier('zoom-natif-1_5');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await verifier('retour-zoom-natif');
  const rapport = { environnement: 'Chromium Linux, DPR et zoom natif émulés CDP ; Mac/Safari matériel non testé', erreurs, resultats };
  writeFileSync(join(out, 'rapport.json'), JSON.stringify(rapport, null, 2));
  process.exitCode = erreurs.length || resultats.some(x => !x.ok) ? 1 : 0;
  await ctx.close();
} finally { await browser.close(); await cible.close(); }
