// Régression zoom : vraie molette Ctrl du contrôleur, DPR de contexte vérifié et pincement natif CDP.
// Chromium Linux avec DPR émulé ; ne vaut pas un essai matériel Mac/Safari.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { lancer, ouvrirCible, ROOT, lireArgs } from './lib/verif.mjs';
const { opt, drapeau } = lireArgs();
const natifSeulement=drapeau('natif-seulement');
const out = resolve(opt('out', join(ROOT, 'verification/out/magie-zoom'))); mkdirSync(out, { recursive: true });
const cible = await ouvrirCible({ site: opt('site', 'dist/site') });
const browser = await lancer(); const resultats = [], erreurs = [];
try {
  // Le DPR est fixé par le contexte Playwright et contrôlé avant ET après chaque capture.
  // L'ancien test CDP n'assertait pas la valeur réellement observée.
  for (const dpr of (natifSeulement?[2]:[1, 2])) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => localStorage.setItem('gc:reglages:v4', JSON.stringify({ v: 1, animations: 'reduites', muet: true, boutonsToujoursVisibles: true })));
    const p = await ctx.newPage(); p.on('pageerror', e => erreurs.push(String(e)));
    await p.goto(cible.url(null, 'gateaux'));
    await p.waitForFunction(() => window.__gcMagie?.etat().pages.some(x => x.fini && x.orn > 0), null, { timeout: 30000 });
    await p.evaluate(() => window.__gcDessins?.figer(true));
    await p.addStyleTag({ content: '.gc-lumiere-papier__bougie{opacity:.65!important}.gc-lumiere-tracee__voile{opacity:.2!important}' });
    const cdp = await ctx.newCDPSession(p);
    async function verifier(nom, scale=1) {
      await p.waitForFunction(({dpr,scale}) => {
        const c = document.querySelector('.gc-magie'), s = window.__gcMagie?.etat();
        if (!s || !c || s.pauseLoupe || getComputedStyle(c).visibility !== 'visible' || devicePixelRatio !== dpr || Math.abs(visualViewport.scale-scale)>.01) return false;
        const q = c.getBoundingClientRect().width / 1920;
        const attendu = Math.min(q * Math.min(2, devicePixelRatio * visualViewport.scale), Math.sqrt(2.4e6 / (1920 * 1080)));
        return Math.abs(s.q - q) < .005 && Math.abs(c.width - 1920 * attendu) < 3;
      }, {dpr,scale}, { timeout: 8000 });
      const marche = await p.evaluate(() => window.__gcMagie.pas());
      assert.equal(marche,true,`${nom} : les pas peuvent encore naître sur la page visible`);
      await p.waitForTimeout(250);
      const avant = await p.evaluate(() => ({dpr:devicePixelRatio,scale:visualViewport.scale}));
      const a = await p.screenshot(); const style = await p.addStyleTag({ content: '.gc-magie{visibility:hidden!important}' });
      const z = await p.screenshot(); await style.evaluate(e => e.remove());
      const A = PNG.sync.read(a), Z = PNG.sync.read(z); let pixels = 0;
      // Le recadrage du viewport natif à 1,5 peut arrondir un bord physique d'un pixel.
      assert.ok(Math.abs(A.width-1280*dpr)<=2,`${nom} : largeur physique de la capture (${A.width})`);
      for (let i = 0; i < A.data.length; i += 4) if (Math.max(Math.abs(A.data[i] - Z.data[i]), Math.abs(A.data[i + 1] - Z.data[i + 1]), Math.abs(A.data[i + 2] - Z.data[i + 2])) > 12) pixels++;
      const s = await p.evaluate(() => ({ ...window.__gcMagie.etat(), dprReel:devicePixelRatio, loupe: document.querySelector('.gc-ecran')?.dataset.gcLoupe, scale: visualViewport.scale, contextePerdu: document.querySelector('.gc-magie').getContext('webgl').isContextLost() }));
      const ok = pixels > 30*dpr*dpr && !s.contextePerdu && !s.pauseLoupe && avant.dpr===dpr && s.dprReel===dpr && Math.abs(s.scale-scale)<.01;
      writeFileSync(join(out,`${nom}.png`),a);
      resultats.push({ nom, ok, pasDeclenches:marche, pixelsDeMagie: pixels, capture:[A.width,A.height], avant, etat: s });
      console.log(nom, ok ? 'OK' : 'KO', JSON.stringify({ pixels, dpr: s.dprReel, q: s.q, k: s.k, scale: s.scale, loupe: s.loupe }));
    }
    if(!natifSeulement) {
      await verifier(`initial-dpr${dpr}`);
      await p.mouse.move(580, 360); await p.keyboard.down('Control');
      await p.mouse.wheel(0, -100); await p.mouse.wheel(0, -100); await p.keyboard.up('Control');
      await p.waitForFunction(() => document.querySelector('.gc-ecran')?.dataset.gcLoupe === 'zoome');
      await verifier(`trackpad-loupe-dpr${dpr}`);
      await p.keyboard.press('0'); await p.waitForFunction(() => document.querySelector('.gc-ecran')?.dataset.gcLoupe !== 'zoome');
    }
    if(dpr===2) {
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
      await verifier(`zoom-natif-1_5-dpr${dpr}`,1.5);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      await verifier(`retour-zoom-dpr${dpr}`);
    }
    await ctx.close();
  }
  process.exitCode = erreurs.length || resultats.some(x => !x.ok) ? 1 : 0;
} finally {
  writeFileSync(join(out, 'rapport.json'), JSON.stringify({ environnement: 'Chromium Linux, DPR de contexte observé et zoom natif émulé CDP ; Mac/Safari matériel non testé', erreurs, resultats }, null, 2));
  await browser.close(); await cible.close();
}
