// Loupe du carnet (plan v4, CONTRACT § 13, lot B) : calque .gc-ecran__loupe, bouton
// [data-gc-loupe-bouton], [data-gc-loupe="repos|zoome"] sur .gc-ecran, état window.GoutersDeCecile.getLoupe().
// Émulation Playwright : iPhone 13 debout (DPR 3, encoches 47/34), Pixel 7, iPad couché, ordinateur
// 1440 × 900, TV 1920 × 1080 au clavier. Carte Carnet autonome (harness/devices.html + bundle).
//
// Pour chaque écran :
//   - bouton loupe : présent, dans la zone sûre, ≥ 44 px au doigt, à gauche du plein écran ; toucher = 1× ↔ 2× ;
//   - doigt : pincement à deux points (Input.dispatchTouchEvent) et Input.synthesizePinchGesture : dérive du
//     foyer ≤ 4 px, visualViewport.scale === 1, la page ne tourne pas ;
//   - double toucher : intérieur → 2× au point touché ; marge → page voisine ; photo → soulèvement ;
//   - un doigt zoomé : déplacement, jamais de tourne-page (aucun gc-livre-geste page / glisse / couverture) ;
//   - souris : ctrl + molette au curseur (dérive ≤ 4 px), molette seule zoomée = déplacement, glisser zoomé ;
//   - clavier : + / − paliers 1 · 1,5 · 2 · 3, 0 → 1, flèches zoomées = déplacement, au bord ← → tournent la
//     page en gardant la loupe ; Échap → 1× ; touches sans effet quand le menu est ouvert ;
//   - bornes : le contenu couvre la zone sûre ; ancrerLoupe('haut') met le haut de la page sous l'encoche ;
//   - encre ×4 : seules les tuiles visibles (rootMargin 25 %) sont demandées, fondu, encre ×2 masquée
//     dessous, retirées sous 1,25× ; aucun changement d'état de tuile pendant un geste ;
//   - zoom du navigateur (Emulation.setPageScaleFactor) : loupe retirée ; rotation : la loupe reste ;
//     rechargement : 1× (rien n'est mémorisé).
// Trace (CPU ×4, Chrome tracing) entre les marques gc-geste-debut-loupe et gc-geste-fin-loupe :
// 0 Layout, ≤ 2 Paint (pincement au doigt, déplacement, ctrl + molette). La lumière du feu (lot L,
// window.__gcFeu) est figée pendant toute la suite : son vacillement peint de lui-même, hors de la loupe.
//
// Tuiles ×4 : celles du manifeste (lot P) si elles existent ; sinon des tuiles d'essai fabriquées ici
// (encre ×2 agrandie, verification/out/v4-b/tuiles), posées par definirSourceEncre4x().
//
//   node scripts/verify-loupe.mjs [--bundle dist/ds-v4-b/components] [--only iphone13-portrait,…]
//        [--out verification/out/v4-b/loupe] [--sans-trace] [--lien julie]
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ROOT, lireArgs, ecrans, tactile, lancer, ouvrirCible, ouvrirPage, Rapport, rectDe, zoneSure, dansZone, cibles44,
  etatLivre, capture, toucher, glisser, glisserSouris, cdpDe, planche, rel, gestes, nbGestes, attendre,
} from './lib/verif.mjs';

const { opt, drapeau, liste } = lireArgs();
const out = resolve(ROOT, opt('out', 'verification/out/v4-b/loupe'));
const lien = opt('lien', 'julie');
const DOSSIER_TUILES = join(ROOT, 'verification/out/v4-b/tuiles');
const cible = await ouvrirCible({ bundle: opt('bundle', 'dist/ds-v4-b/components') });
const R = new Rapport('loupe', { dir: out, meta: { cible: cible.type, depart: cible.depart } });
const browser = await lancer();
console.log(`■ Loupe — ${cible.type} : ${cible.depart}`);

const BOUTON = '[data-gc-loupe-bouton]';
const CALQUE = '.gc-ecran__loupe';
const PLEIN = '[data-gc-controle="plein-ecran"]';
const DERIVE_MAX = 4;

// ---- Instrumentation : marques de geste (trace), changements d'état des tuiles ---------------------
function INIT_LOUPE() {
  if (window.__gcLoupeEssai) return;
  const L = (window.__gcLoupeEssai = { tuilesPendantGeste: [], signaux: [], soulever: [] });
  document.addEventListener('gc-livre-geste', (e) => {
    const d = e.detail ?? {};
    try { performance.mark(`gc-geste-${d.phase}-${d.type}`); } catch { /* rien */ }
  });
  window.addEventListener('gc-loupe', (e) => L.signaux.push({ phase: e.detail?.phase, t: performance.now() }));
  const mo = new MutationObserver((ms) => {
    const occupee = !!window.GoutersDeCecile?.loupeOccupee?.();
    for (const m of ms) {
      const el = m.target;
      if (m.attributeName === 'data-gc-soulever') L.soulever.push(el.getAttribute('data-gc-soulever'));
      const tuile = el instanceof Element && (el.matches('.gc-page-cuite__tuile, .gc-page-cuite__tuile img') || (el.matches('.gc-page-cuite__encre') && m.attributeName === 'style'));
      if (occupee && tuile) L.tuilesPendantGeste.push(`${el.className} ${m.attributeName}=${String(el.getAttribute(m.attributeName)).slice(0, 40)}`);
      if (occupee && m.type === 'childList' && [...m.addedNodes].some((n) => n instanceof Element && n.matches?.('.gc-page-cuite__tuile, .gc-page-cuite__tuile img'))) L.tuilesPendantGeste.push('tuile montée');
    }
  });
  const go = () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-gc-tuile-etat', 'style', 'src', 'data-gc-soulever'] });
  if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go);
}
const INIT = { fn: INIT_LOUPE };

// ---- Lecture de l'état --------------------------------------------------------------------------------
/** Vue du calque (translate3d + scale), état au repos, attributs. */
const lire = (page) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const t = el?.style.transform ?? 'none';
  const m = /translate3d\(([-\d.e]+)px,\s*([-\d.e]+)px,\s*0(?:px)?\)\s*scale\(([-\d.e]+)\)/.exec(t);
  const G = window.GoutersDeCecile;
  const ec = document.querySelector('.gc-ecran');
  return {
    x: m ? +m[1] : 0, y: m ? +m[2] : 0, z: m ? +m[3] : 1, transform: t,
    etat: G?.getLoupe ? { ...G.getLoupe(), contenu: undefined } : null,
    occupee: !!G?.loupeOccupee?.(),
    attr: ec?.getAttribute('data-gc-loupe') ?? null,
    navigateur: ec?.hasAttribute('data-gc-loupe-navigateur') ?? false,
    vv: window.visualViewport?.scale ?? 1,
    willChange: el?.style.willChange ?? '',
  };
}, CALQUE);

/**
 * Attend une cadence d'images régulière (≥ 30 i/s pendant 400 ms, 40 s au plus). Rastérisation logicielle
 * (SwiftShader) : après un chargement ou un changement d'échelle, le navigateur peut retenir ses images
 * plusieurs secondes ; un ressort n'avance qu'avec elles.
 */
const cadence = (page, max = 40000) => page.evaluate((max) => new Promise((resolve) => {
  const t0 = performance.now();
  const ts = [];
  const tick = (t) => {
    ts.push(t);
    while (ts.length && t - ts[0] > 400) ts.shift();
    if ((t - t0 > 450 && ts.length >= 12) || t - t0 > max) return resolve(Math.round(t - t0));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => resolve(-1), max + 2000);
}), max);

/** Capture après une cadence régulière (les images sont posées). */
const capt = async (page, nom, dir, options) => {
  await cadence(page);
  return capture(page, nom, dir, options);
};

/** Attend la fin de tout geste (loupe et livre), puis `calme` ms sans rien. */
async function repos(page, { calme = 350, max = 40000 } = {}) {
  const t0 = Date.now();
  let depuis = 0;
  while (Date.now() - t0 < max) {
    const occ = await page.evaluate(() => !!window.GoutersDeCecile?.loupeOccupee?.() || (window.__gcDevices?.actifs?.length ?? 0) > 0);
    if (!occ) {
      if (!depuis) depuis = Date.now();
      if (Date.now() - depuis >= calme) return true;
    } else depuis = 0;
    await page.waitForTimeout(40);
  }
  return false;
}

/** Centre de la face visible (page vivante) et son rect. */
const faceVisible = (page) => page.evaluate(() => {
  const faces = [...document.querySelectorAll('.gc-livre__page--visible .gc-livre-face')];
  const vus = faces.map((f) => ({ f, r: f.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight);
  // La plus visible
  const aire = ({ r }) => Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  vus.sort((a, b) => aire(b) - aire(a));
  const v = vus[0];
  if (!v) return null;
  const r = v.r;
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, cote: v.f.classList.contains('gc-livre-face--left') ? 'gauche' : 'droite' };
});

/** Contenu borné par la loupe, à l'écran : la page visible en cadrage « page », les deux pages sinon. */
const contenuEcran = (page) => page.evaluate(() => {
  const le = document.querySelector('.gc-livre-ecran');
  const pageSeule = le?.getAttribute('data-gc-cadrage') === 'page';
  const sel = pageSeule ? `.gc-livre__emplacement--${le.getAttribute('data-gc-cote') === 'droite' ? 'droite' : 'gauche'}` : '.gc-livre__emplacement--gauche, .gc-livre__emplacement--droite';
  const els = [...document.querySelectorAll(sel)].map((x) => x.getBoundingClientRect());
  return { x: Math.min(...els.map((r) => r.left)), y: Math.min(...els.map((r) => r.top)), r: Math.max(...els.map((r) => r.right)), b: Math.max(...els.map((r) => r.bottom)) };
});

/** Point de l'écran (px) du point du contenu q (coordonnées du calque) pour la vue v. */
const ecranDe = (v, q) => ({ x: v.x + v.z * q.x, y: v.y + v.z * q.y });
const contenuDe = (v, p) => ({ x: (p.x - v.x) / v.z, y: (p.y - v.y) / v.z });
const ecart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r1 = (v) => Math.round(v * 10) / 10;

async function demander(page, z, foyer) {
  await page.evaluate(([z, f]) => window.GoutersDeCecile.demanderLoupe(z, f ?? undefined), [z, foyer ?? null]);
  await page.waitForTimeout(60);
  await repos(page);
}

// ---- Gestes (CDP) -------------------------------------------------------------------------------------
/** Pincement à deux doigts autour de `c` : écartement d0 → d1 (px entre les doigts), le milieu glisse de `glisse`. */
async function pincer(page, c, d0, d1, { n = 14, ms = 280, glisse = { x: 0, y: 0 }, avantLacher } = {}) {
  const cdp = await cdpDe(page);
  const t0 = Date.now() / 1000;
  const pts = (d, k) => {
    const m = { x: c.x + glisse.x * k, y: c.y + glisse.y * k };
    return [{ x: m.x - d / 2, y: m.y, id: 11 }, { x: m.x + d / 2, y: m.y, id: 12 }];
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0, 0), timestamp: t0 });
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + (d1 - d0) * k, k), timestamp: t0 + (i * ms) / n / 1000 });
    await page.waitForTimeout(ms / n);
  }
  const fin = { x: c.x + glisse.x, y: c.y + glisse.y };
  const avant = avantLacher ? await avantLacher(fin) : null;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + ms / 1000 + 0.01 });
  return avant;
}

/**
 * Double toucher : deux touchers de 50 ms, `ecartMs` entre eux, sur une seule horloge (les horodatages des
 * événements sont ceux d'un vrai doigt même si le navigateur, en rendu logiciel, les reçoit en retard).
 */
async function doubleToucher(page, x, y, { ecartMs = 140 } = {}) {
  const cdp = await cdpDe(page);
  const t0 = Date.now() / 1000;
  const pt = [{ x, y, id: 21 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt, timestamp: t0 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + 0.05 });
  await page.waitForTimeout(ecartMs);
  const t1 = t0 + 0.05 + ecartMs / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt, timestamp: t1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t1 + 0.05 });
}

async function roue(page, x, y, deltaY, { ctrl = false, deltaX = 0, n = 1, ms = 30 } = {}) {
  const cdp = await cdpDe(page);
  for (let i = 0; i < n; i++) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY, modifiers: ctrl ? 2 : 0 });
    await page.waitForTimeout(ms);
  }
}

const gestesLivre = async (page, depuis) => (await gestes(page, depuis)).filter((g) => g.type !== 'loupe');

// ---- Tuiles ×4 d'essai ----------------------------------------------------------------------------------
/** Tuiles 2 × 2 de 4 px de recouvrement, fabriquées dans le navigateur depuis l'encre ×2 agrandie. */
async function fabriquerTuiles(page) {
  const fichier = join(DOSSIER_TUILES, 'tuiles.json');
  if (existsSync(fichier)) return JSON.parse(readFileSync(fichier, 'utf8'));
  mkdirSync(DOSSIER_TUILES, { recursive: true });
  const res = await page.evaluate(async () => {
    const G = window.GoutersDeCecile;
    const pages = G.PAGES_CUITES.pages;
    const sortie = {};
    for (const [id, info] of Object.entries(pages)) {
      if (info.type === 'feuillet') continue;
      const img = new Image();
      img.src = G.assetUrl(info.encre);
      await img.decode();
      const W4 = img.naturalWidth * 2;
      const H4 = img.naturalHeight * 2;
      const xs = [0, Math.round(W4 / 2), W4];
      const ys = [0, Math.round(H4 / 2), H4];
      const tuiles = [];
      const fichiers = {};
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const x0 = Math.max(0, xs[c] - (c ? 4 : 0));
          const x1 = Math.min(W4, xs[c + 1] + (c < 1 ? 4 : 0));
          const y0 = Math.max(0, ys[r] - (r ? 4 : 0));
          const y1 = Math.min(H4, ys[r + 1] + (r < 1 ? 4 : 0));
          const cv = document.createElement('canvas');
          cv.width = x1 - x0;
          cv.height = y1 - y0;
          const g = cv.getContext('2d');
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, x0 / 2, y0 / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, cv.width, cv.height);
          fichiers[`${r}${c}`] = cv.toDataURL('image/webp', 0.9).split(',')[1];
          tuiles.push([r, c, +(x0 / W4).toFixed(6), +(y0 / H4).toFixed(6), +((x1 - x0) / W4).toFixed(6), +((y1 - y0) / H4).toFixed(6)]);
        }
      }
      sortie[id] = { tuiles, fichiers, px: [W4, H4] };
    }
    return sortie;
  });
  const manifeste = {};
  for (const [id, x] of Object.entries(res)) {
    for (const [rc, b64] of Object.entries(x.fichiers)) writeFileSync(join(DOSSIER_TUILES, `${id}-${rc}.webp`), Buffer.from(b64, 'base64'));
    manifeste[id] = { base: `essai/${id}`, px: x.px, recouvrement: 4, tuiles: x.tuiles };
  }
  writeFileSync(fichier, JSON.stringify(manifeste, null, 1));
  return manifeste;
}

/** Pose la source des tuiles : le manifeste s'il a l'encre ×4, sinon les tuiles d'essai. Renvoie l'origine. */
async function poserTuiles(page, essai) {
  return page.evaluate(([T, base]) => {
    const G = window.GoutersDeCecile;
    const reelles = Object.keys(G.PAGES_CUITES.pages).some((id) => G.tuilesEncre4x?.(id));
    if (reelles) return 'manifeste (pages/4x/…)';
    G.definirSourceEncre4x((id) => (T[id] ? T[id].tuiles.map(([r, c, x, y, w, h]) => ({ rc: `${r}${c}`, rect: [x, y, w, h], src: `${base}/${id}-${r}${c}.webp` })) : null));
    return 'essai (encre ×2 agrandie)';
  }, [essai, '/verification/out/v4-b/tuiles']);
}

// ---- Trace (CPU ×4) ---------------------------------------------------------------------------------------
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing'];
async function tracer(page, action) {
  const cdp = await cdpDe(page);
  await cadence(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(400);
  await browser.startTracing(page, { categories: CATEGORIES });
  await action();
  await repos(page, { calme: 300 });
  const buf = await browser.stopTracing();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const ev = JSON.parse(buf.toString()).traceEvents;
  const marque = (n) => ev.filter((e) => e.name === n && String(e.cat).includes('blink.user_timing')).map((e) => e.ts).sort((a, b) => a - b);
  const t0 = marque('gc-geste-debut-loupe')[0];
  const t1 = marque('gc-geste-fin-loupe').find((t) => t > t0);
  if (t0 == null || t1 == null) return null;
  const dans = (e) => e.ts >= t0 && e.ts <= t1 && (e.ph === 'X' || e.ph === 'B');
  const compte = (n) => ev.filter((e) => e.name === n && dans(e));
  return { Layout: compte('Layout').length, Paint: compte('Paint').length, Style: compte('UpdateLayoutTree').length, ms: Math.round((t1 - t0) / 1000), paintA: compte('Paint').map((e) => Math.round((e.ts - t0) / 1000)) };
}

// ---- Suites ------------------------------------------------------------------------------------------------
/** Fige la lumière du feu (lot L) : ses peintures ne sont pas celles de la loupe. */
const figerFeu = (page) => page.evaluate(() => { try { window.__gcFeu?.figer?.({ intensite: 1, dx: 0, dy: 0 }); return !!window.__gcFeu; } catch { return false; } });

async function ouvrir(e, hash = lien, extra = {}) {
  const r = await ouvrirPage(browser, cible, e, hash, { init: [INIT], ...extra });
  await figerFeu(r.page);
  await r.page.waitForTimeout(500);
  await repos(r.page, { calme: 500 });
  await cadence(r.page);
  return r;
}

async function suiteEcran(e, essai) {
  const { ctx, page, surv } = await ouvrir(e);
  const T = (test, cond, d) => R.ok(e.nom, test, cond, d);
  const bloc = async (nom, f) => {
    try {
      await cadence(page);
      await f();
    } catch (x) {
      R.ajouter(e.nom, `${nom} : exécution`, 'KO', `plantage : ${String(x).split('\n')[0]}`);
    } finally {
      // Retour à 1×, menu et objet soulevé refermés, entre deux blocs
      await page.keyboard.press('Escape').catch(() => {});
      await page.evaluate(() => window.GoutersDeCecile?.demanderLoupe?.(1)).catch(() => {});
      await repos(page).catch(() => {});
    }
  };
  const touch = tactile(e);
  try {
    if (!(await page.evaluate(() => !!window.GoutersDeCecile?.getLoupe))) { R.attente(e.nom, 'loupe dans le bundle (getLoupe)'); return; }
    const insets = e.insets;
    const zone = await zoneSure(page, insets);
    R.info(e.nom, 'cadrage', `${(await etatLivre(page)).cadrage} · zone sûre ${zone.x},${zone.y} → ${zone.r},${zone.b}`);

    // 1. Bouton
    await bloc('bouton', async () => {
      const b = await rectDe(page, BOUTON);
      if (!b?.visible) { R.ajouter(e.nom, 'bouton loupe [data-gc-loupe-bouton]', 'KO', 'absent ou invisible'); return; }
      T('bouton loupe dans la zone sûre', dansZone(b, zone), `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}`);
      const p = await rectDe(page, PLEIN);
      if (p?.visible) T('bouton loupe à gauche du plein écran (même ligne, sans chevauchement)', b.r <= p.x + 0.5 && Math.abs(b.cy - p.cy) < 2, `loupe → ${Math.round(b.r)}, plein écran ${Math.round(p.x)}`);
      if (touch) {
        const c = (await cibles44(page, BOUTON))[0];
        T('bouton loupe : cible ≥ 44 px au doigt', !!c?.ok, c ? `${c.w}×${c.h}` : '');
      } else R.info(e.nom, 'bouton loupe : opacité', await page.evaluate((s) => getComputedStyle(document.querySelector(s)).opacity, BOUTON));
      R.capturer(await capt(page, `${e.nom}-bouton-1x`, out, { clip: { x: Math.max(0, b.x - 80), y: Math.max(0, b.y - 20), width: Math.min(260, e.ctx.viewport.width - Math.max(0, b.x - 80)), height: b.h + 40 } }), `${e.titre} — bouton loupe à 1×`);
      if (touch) await toucher(page, b.cx, b.cy); else await page.mouse.click(b.cx, b.cy);
      await page.waitForTimeout(80);
      await repos(page);
      const s = await lire(page);
      T('bouton : un toucher → 2×, [data-gc-loupe="zoome"]', Math.abs(s.etat.z - 2) < 0.01 && s.attr === 'zoome', `z ${s.etat.z}, attr ${s.attr}`);
      const b2 = await rectDe(page, BOUTON);
      const texte = await page.evaluate((sel) => document.querySelector(sel)?.textContent?.replace(/\s/g, ' ').trim(), BOUTON);
      T('bouton zoomé : affiche « 200 % »', /^200\s?%$/.test(texte ?? ''), texte);
      R.capturer(await capt(page, `${e.nom}-bouton-2x`, out, { clip: { x: Math.max(0, b2.x - 80), y: Math.max(0, b2.y - 20), width: Math.min(260, e.ctx.viewport.width - Math.max(0, b2.x - 80)), height: b2.h + 40 } }), `${e.titre} — bouton loupe à 2×`);
      if (touch) await toucher(page, b2.cx, b2.cy); else await page.mouse.click(b2.cx, b2.cy);
      await page.waitForTimeout(80);
      await repos(page);
      const s2 = await lire(page);
      T('bouton : un second toucher → 1× (transform none)', s2.etat.z === 1 && s2.transform === 'none' && s2.attr === 'repos', `z ${s2.etat.z}, ${s2.transform}`);
    });

    const f0 = await faceVisible(page);
    if (!f0) { R.ajouter(e.nom, 'page visible', 'KO', 'aucune face visible'); return; }
    const centre = { x: Math.round(f0.cx), y: Math.round(f0.y + f0.h * 0.42) };

    if (touch) {
      // 2. Pincement à deux points
      await bloc('pincement (dispatchTouchEvent)', async () => {
        const e0 = await etatLivre(page);
        const n0 = await nbGestes(page);
        const v0 = await lire(page);
        const q = contenuDe(v0, centre);
        const pendant = await pincer(page, centre, 80, 200, { glisse: { x: 12, y: -18 }, avantLacher: async (m) => ({ v: await lire(page), m }) });
        const derive = ecart(ecranDe(pendant.v, q), pendant.m);
        await repos(page);
        const v1 = await lire(page);
        const e1 = await etatLivre(page);
        T(`pincement : z suit l'écartement (${r1(pendant.v.z)} attendu 2,5)`, Math.abs(pendant.v.z - 2.5) < 0.05, `z ${r1(pendant.v.z)} → repos ${v1.etat.z}`);
        T(`pincement : dérive du foyer ≤ ${DERIVE_MAX} px`, derive <= DERIVE_MAX, `${r1(derive)} px`);
        T('pincement : visualViewport.scale === 1', v1.vv === 1, `${v1.vv}`);
        T('pincement : la page ne tourne pas', e1.double === e0.double && e1.cote === e0.cote && !(await gestesLivre(page, n0)).some((g) => /page|glisse|couverture/.test(g.type)), `${e0.double}/${e0.cote} → ${e1.double}/${e1.cote}`);
        T('pincement : état au repos publié, [data-gc-loupe="zoome"], will-change retiré', v1.etat.zoome && v1.attr === 'zoome' && !v1.willChange && !v1.occupee, `${JSON.stringify(v1.etat)} · will-change « ${v1.willChange} »`);
        const sig = await page.evaluate(() => window.__gcLoupeEssai.signaux.map((s) => s.phase).join(','));
        T('pincement : événements gc-loupe début puis fin', /debut,fin$/.test(sig), sig);
        R.capturer(await capt(page, `${e.nom}-pince`, out), `${e.titre} — pincement (${r1(v1.etat.z)}×)`);
        // Le contenu couvre la zone sûre
        const fv = await faceVisible(page);
        const couvre = await contenuEcran(page);
        T('bornes : le contenu zoomé (page visible, ou les deux pages) couvre la zone sûre', couvre.x <= zone.x + 1 && couvre.y <= zone.y + 1 && couvre.r >= zone.r - 1 && couvre.b >= zone.b - 1, `livre ${Math.round(couvre.x)},${Math.round(couvre.y)} → ${Math.round(couvre.r)},${Math.round(couvre.b)} · page ${fv ? `${Math.round(fv.x)},${Math.round(fv.y)}` : '?'}`);
        // Pincer pour revenir
        await pincer(page, centre, 220, 60);
        await repos(page);
        const v2 = await lire(page);
        T('pincement inverse : retour à 1× (élastique, puis ressort)', v2.etat.z === 1 && v2.transform === 'none', `z ${v2.etat.z}`);
      });

      // 3. Input.synthesizePinchGesture
      await bloc('synthesizePinchGesture', async () => {
        const cdp = await cdpDe(page);
        const v0 = await lire(page);
        const q = contenuDe(v0, centre);
        let ok = true;
        try {
          await cdp.send('Input.synthesizePinchGesture', { x: centre.x, y: centre.y, scaleFactor: 2, relativeSpeed: 600, gestureSourceType: 'touch' });
        } catch (x) {
          ok = false;
          R.info(e.nom, 'Input.synthesizePinchGesture', `indisponible : ${String(x).split('\n')[0]}`);
        }
        if (!ok) return;
        await page.waitForTimeout(100);
        await repos(page);
        const v1 = await lire(page);
        const derive = ecart(ecranDe(v1, q), centre);
        T('synthesizePinchGesture : la loupe zoome (≈ 2×, le geste synthétique ajoute la marge de toucher de Chrome)', v1.etat.z > 1.6 && v1.etat.z < 2.8, `z ${v1.etat.z}`);
        T(`synthesizePinchGesture : dérive du foyer ≤ ${DERIVE_MAX} px, visualViewport.scale === 1`, derive <= DERIVE_MAX && v1.vv === 1, `${r1(derive)} px · scale ${v1.vv}`);
      });

      // 4. Double toucher : intérieur, marge, photo
      await bloc('double toucher', async () => {
        const fv = await faceVisible(page);
        const p = { x: Math.round(fv.cx), y: Math.round(fv.y + fv.h * 0.62) };
        const q = contenuDe(await lire(page), p);
        const e0 = await etatLivre(page);
        await doubleToucher(page, p.x, p.y);
        await page.waitForTimeout(60);
        await repos(page);
        const v1 = await lire(page);
        const derive = ecart(ecranDe(v1, q), p);
        T('double toucher à l\'intérieur : 2× au point touché', Math.abs(v1.etat.z - 2) < 0.01, `z ${v1.etat.z}, point touché déplacé de ${r1(derive)} px (bornes comprises)`);
        T('double toucher à l\'intérieur : la page ne change pas', (await etatLivre(page)).double === e0.double);
        await doubleToucher(page, p.x, p.y);
        await page.waitForTimeout(60);
        await repos(page);
        T('double toucher zoomé : retour à 1×', (await lire(page)).etat.z === 1);
        // Marge extérieure : la page voisine, pas de zoom
        const fm = await faceVisible(page);
        const mx = fm.cote === 'gauche' ? fm.x + fm.w * 0.05 : fm.r - fm.w * 0.05;
        const ea = await etatLivre(page);
        const nm = await nbGestes(page);
        await doubleToucher(page, Math.round(mx), Math.round(fm.cy));
        // Le livre tourne (ou glisse) vers la page voisine : on juge le départ du geste (en rendu
        // logiciel, la feuille peut mettre plusieurs secondes à se poser).
        let tour = null;
        for (let i = 0; i < 40 && !tour; i++) {
          await page.waitForTimeout(200);
          tour = (await gestesLivre(page, nm)).find((g) => g.phase === 'debut' && /page|glisse|couverture|riffle/.test(g.type)) ?? null;
        }
        const vm = await lire(page);
        await repos(page, { calme: 600 });
        const eb = await etatLivre(page);
        T('double toucher dans la marge : le livre va à la page voisine, pas de loupe', (!!tour || eb.double !== ea.double || eb.cote !== ea.cote) && vm.etat.z === 1 && vm.transform === 'none', `geste ${tour ? tour.type : 'aucun'} · ${ea.double}/${ea.cote} → ${eb.double}/${eb.cote}, z ${vm.etat.z}`);
        // Retour à la page de la photo
        await page.goto(cible.url(e, lien));
        await page.waitForTimeout(800);
        await figerFeu(page);
        await repos(page, { calme: 500 });
        await cadence(page);
        const ph = await rectDe(page, '.gc-livre__page--visible [data-gc-objet="photo"]');
        if (!ph?.visible) { R.info(e.nom, 'double toucher sur la photo', 'pas de photo visible'); return; }
        await page.evaluate(() => { window.__gcLoupeEssai.soulever = []; });
        await doubleToucher(page, ph.cx, ph.cy);
        await page.waitForTimeout(900);
        const s = await etatLivre(page);
        const vp = await lire(page);
        const vu = await page.evaluate(() => window.__gcLoupeEssai.soulever);
        T('double toucher sur la photo : elle se soulève (premier toucher), pas de loupe', vu.includes('ouvert') && vp.etat.z === 1 && vp.transform === 'none', `soulever ${vu.join(' → ') || '—'}, z ${vp.etat.z}`);
        if (s.soulever !== 'ouvert') R.info(e.nom, 'double toucher sur la photo : le second toucher la repose', 'comportement du calque Soulever (lot S) : un toucher pendant la montée la repose');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(900);
      });

      // 5. Un doigt zoomé : déplacement, jamais de tourne-page
      await bloc('déplacement au doigt', async () => {
        await demander(page, 2, centre);
        const e0 = await etatLivre(page);
        const n0 = await nbGestes(page);
        const v0 = await lire(page);
        await glisser(page, [centre.x + 60, centre.y], [centre.x - 140, centre.y + 10], { ms: 160, n: 10 }); // geste vif
        await repos(page);
        const v1 = await lire(page);
        await glisser(page, [centre.x - 60, centre.y], [centre.x + 160, centre.y - 10], { ms: 140, n: 10 });
        await repos(page);
        await glisser(page, [centre.x, centre.y], [centre.x - 30, centre.y - 120], { ms: 400, n: 12 });
        await repos(page);
        const v2 = await lire(page);
        const e1 = await etatLivre(page);
        const gl = (await gestesLivre(page, n0)).filter((g) => /page|glisse|couverture|rebond/.test(g.type));
        T('déplacement zoomé : la vue suit le doigt (avec élan)', Math.abs(v1.x - v0.x) > 20, `x ${r1(v0.x)} → ${r1(v1.x)} → ${r1(v2.x)}, y ${r1(v0.y)} → ${r1(v2.y)}`);
        T('déplacement zoomé : jamais de tourne-page', e1.double === e0.double && e1.cote === e0.cote && !gl.length, `${e0.double}/${e0.cote} → ${e1.double}/${e1.cote}${gl.length ? ` · gestes du livre : ${gl.map((g) => `${g.phase} ${g.type}`).join(', ')}` : ''}`);
        T('déplacement zoomé : la loupe reste à 2×', Math.abs(v2.etat.z - 2) < 0.01, `z ${v2.etat.z}`);
        const couvre = await contenuEcran(page);
        T('déplacement zoomé : revenu dans les bornes (le contenu couvre la zone sûre)', couvre.x <= zone.x + 1 && couvre.y <= zone.y + 1 && couvre.r >= zone.r - 1 && couvre.b >= zone.b - 1, `${Math.round(couvre.x)},${Math.round(couvre.y)} → ${Math.round(couvre.r)},${Math.round(couvre.b)}`);
        // Flèche à l'écran (‹ ›, hors du calque) : la page change, la loupe reste
        const fl = await rectDe(page, '.gc-livre-nav__fleche--suivante, [aria-label*="suivante" i]');
        if (fl?.visible) {
          const ea = await etatLivre(page);
          await toucher(page, fl.cx, fl.cy);
          await page.waitForTimeout(200);
          await repos(page, { calme: 600 });
          const eb = await etatLivre(page);
          const vb = await lire(page);
          T('flèche à l\'écran zoomé : la page change, la loupe reste', (eb.double !== ea.double || eb.cote !== ea.cote) && Math.abs(vb.etat.z - 2) < 0.01, `${ea.double}/${ea.cote} → ${eb.double}/${eb.cote}, z ${vb.etat.z}`);
        } else R.info(e.nom, 'flèche à l\'écran', 'introuvable');
      });
    } else {
      // 6. Souris : ctrl + molette, molette, glisser, double clic
      await bloc('ctrl + molette', async () => {
        // Au centre de l'écran (le livre y est centré) et 3 crans (≈ 1,95×) : les bornes (le livre couvre
        // l'écran) ne déplacent pas le point visé ; ailleurs, elles le décalent à bon droit.
        const centre = { x: Math.round(e.ctx.viewport.width / 2), y: Math.round(e.ctx.viewport.height / 2) };
        const v0 = await lire(page);
        const q = contenuDe(v0, centre);
        await page.mouse.move(centre.x, centre.y);
        await roue(page, centre.x, centre.y, -60, { ctrl: true, n: 3 });
        const pendant = await lire(page);
        await repos(page);
        const v1 = await lire(page);
        const derive = ecart(ecranDe(pendant, q), centre);
        T('ctrl + molette : zoom au curseur', v1.etat.z > 1.5, `z ${v1.etat.z}`);
        T(`ctrl + molette : dérive du curseur ≤ ${DERIVE_MAX} px`, derive <= DERIVE_MAX, `${r1(derive)} px (z ${r1(pendant.z)})`);
        const n0 = await nbGestes(page);
        const e0 = await etatLivre(page);
        await roue(page, centre.x, centre.y, 120, { n: 3 });
        await repos(page);
        const v2 = await lire(page);
        T('molette seule zoomée : déplacement vertical', Math.abs(v2.y - v1.y) > 20 && Math.abs(v2.etat.z - v1.etat.z) < 1e-3, `y ${r1(v1.y)} → ${r1(v2.y)}`);
        await glisserSouris(page, [centre.x + 100, centre.y], [centre.x - 150, centre.y], { ms: 200, n: 10 });
        await repos(page);
        const v3 = await lire(page);
        const e1 = await etatLivre(page);
        const gl = (await gestesLivre(page, n0)).filter((g) => /page|glisse|couverture/.test(g.type));
        T('glisser à la souris zoomé : déplacement, jamais de tourne-page', Math.abs(v3.x - v2.x) > 20 && e1.double === e0.double && !gl.length, `x ${r1(v2.x)} → ${r1(v3.x)} · ${e0.double} → ${e1.double}`);
        R.capturer(await capt(page, `${e.nom}-molette`, out), `${e.titre} — ctrl + molette (${r1(v3.etat.z)}×)`);
        await roue(page, centre.x, centre.y, 400, { ctrl: true, n: 8 });
        await repos(page);
        T('ctrl + molette arrière : retour à 1×', (await lire(page)).etat.z === 1);
      });
      await bloc('double clic', async () => {
        const fv = await faceVisible(page);
        const p = { x: Math.round(fv.cx), y: Math.round(fv.y + fv.h * 0.6) };
        await page.mouse.dblclick(p.x, p.y);
        await page.waitForTimeout(60);
        await repos(page);
        T('double clic à l\'intérieur : 2×', Math.abs((await lire(page)).etat.z - 2) < 0.01);
      });
    }

    // 7. Clavier : paliers, flèches, Échap, menu ouvert
    await bloc('clavier', async () => {
      const zs = [];
      for (const k of ['+', '+', '+', '+']) { await page.keyboard.press(k); await page.waitForTimeout(40); await repos(page); zs.push((await lire(page)).etat.z); }
      T('+ : paliers 1,5 · 2 · 3 · 3', zs.join(' ') === '1.5 2 3 3', zs.join(' '));
      await page.keyboard.press('-');
      await repos(page);
      T('− : palier précédent (2)', (await lire(page)).etat.z === 2);
      await page.keyboard.press('0');
      await repos(page);
      T('0 : loupe à 1×', (await lire(page)).etat.z === 1);
      // + + coup sur coup : le second part du palier visé
      await page.keyboard.press('+');
      await page.keyboard.press('+');
      await repos(page);
      T('+ + coup sur coup : 2× (paliers visés)', (await lire(page)).etat.z === 2, `${(await lire(page)).etat.z}`);
      // Flèches zoomées : déplacement, au bord la page tourne et la loupe reste
      const v0 = await lire(page);
      await page.keyboard.press('ArrowDown');
      await repos(page);
      const vd = await lire(page);
      T('↓ zoomé : la vue descend (déplacement, pas de feuillet)', vd.y < v0.y - 5 && vd.etat.z === 2, `y ${r1(v0.y)} → ${r1(vd.y)}`);
      const e0 = await etatLivre(page);
      let tours = 0;
      let eA = e0;
      for (; tours < 12; tours++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(80);
        await repos(page, { calme: 400 });
        await cadence(page);
        eA = await etatLivre(page);
        if (eA.double !== e0.double || eA.cote !== e0.cote) break;
      }
      const vA = await lire(page);
      T('→ zoomé : déplace la vue, puis au bord la page change et la loupe reste', (eA.double !== e0.double || eA.cote !== e0.cote) && tours >= 1 && vA.etat.z === 2, `${tours} pas de déplacement avant le bord · ${e0.double}/${e0.cote} → ${eA.double}/${eA.cote}, z ${vA.etat.z}`);
      // Haut de page sous les zones sûres (ancrerLoupe, appelé par le livre après un tour)
      await page.evaluate(() => window.GoutersDeCecile.ancrerLoupe('haut'));
      await page.waitForTimeout(60);
      await repos(page);
      const fh = await faceVisible(page);
      T('ancrerLoupe(\'haut\') : le haut de la page juste sous la zone sûre (jamais sous l\'encoche)', fh && fh.y >= zone.y - 1 && fh.y <= zone.y + 2, fh ? `haut de page à ${r1(fh.y)} px, zone sûre ${zone.y} px` : 'page ?');
      R.capturer(await capt(page, `${e.nom}-ancre-haut`, out), `${e.titre} — 2×, haut de page ancré`);
      await page.keyboard.press('Escape');
      await repos(page);
      T('Échap zoomé : loupe à 1×', (await lire(page)).etat.z === 1);
      await demander(page, 2);
      await page.keyboard.press('Backspace');
      await repos(page);
      T('Retour arrière zoomé : loupe à 1×', (await lire(page)).etat.z === 1);
      // Menu ouvert : la loupe ne reçoit rien
      await page.keyboard.press('m');
      await page.waitForTimeout(700);
      const menu = await page.evaluate(() => !!document.querySelector('[data-gc-reglages="panneau"]'));
      if (!menu) { R.info(e.nom, 'menu ouvert', 'panneau absent'); return; }
      const ligne = await page.evaluate(() => !!document.querySelector('[data-gc-reglages="panneau"] [data-gc-reglages-ligne="loupe"]'));
      T('menu : ligne « Loupe » présente', ligne);
      await page.evaluate(() => document.activeElement?.blur?.());
      await page.keyboard.press('+');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      await repos(page);
      const vm = await lire(page);
      const em = await etatLivre(page);
      T('menu ouvert : + et → ne touchent ni la loupe ni le livre', vm.etat.z === 1 && em.double === eA.double, `z ${vm.etat.z}, double ${eA.double} → ${em.double}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
    });

    // 8. Encre ×4 : seules les tuiles visibles
    await bloc('encre ×4', async () => {
      await page.goto(cible.url(e, lien));
      await page.waitForTimeout(800);
      await figerFeu(page);
      await repos(page, { calme: 500 });
      await cadence(page);
      const origine = await poserTuiles(page, essai);
      R.info(e.nom, 'tuiles ×4', origine);
      const demandes = [];
      const ecoute = (r) => { if (/\/(tuiles|4x)\/[^/]+-\d\d\.webp/.test(r.url())) demandes.push(r.url().split('/').pop()); };
      page.on('request', ecoute);
      const fv = await faceVisible(page);
      await demander(page, 3, { x: fv.x + fv.w * 0.2, y: fv.y + fv.h * 0.15 });
      await page.waitForTimeout(1600);
      await repos(page);
      // Décodage puis fondu (rendu logiciel : quelques secondes) : on attend que les tuiles demandées soient posées.
      for (let i = 0; i < 40; i++) {
        const enCours = await page.evaluate(() => [...document.querySelectorAll('.gc-page-cuite__tuile')].some((t) => /demandee|prete/.test(t.getAttribute('data-gc-tuile-etat'))));
        if (!enCours) break;
        await page.waitForTimeout(300);
      }
      const info = await page.evaluate(() => {
        // Racine de l'observateur : .gc-ecran, agrandie de 25 % ; la tuile rognée par la page et le livre.
        const ec = document.querySelector('.gc-ecran').getBoundingClientRect();
        const zone = { x0: ec.left - 0.25 * ec.width, y0: ec.top - 0.25 * ec.height, x1: ec.right + 0.25 * ec.width, y1: ec.bottom + 0.25 * ec.height };
        const inter = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
        return [...document.querySelectorAll('.gc-page-cuite[data-gc-encre4x] .gc-page-cuite__tuile')].map((t) => {
          const r = inter(inter(t.getBoundingClientRect(), t.closest('.gc-livre-face').getBoundingClientRect()), t.closest('.gc-livre-ecran').getBoundingClientRect());
          const id = t.closest('.gc-page-cuite').getAttribute('data-gc-page-cuite');
          return { nom: `${id}-${t.getAttribute('data-gc-tuile')}.webp`, etat: t.getAttribute('data-gc-tuile-etat'), visible: r.right > r.left && r.bottom > r.top && r.right > zone.x0 && r.left < zone.x1 && r.bottom > zone.y0 && r.top < zone.y1 };
        });
      });
      const attendues = info.filter((t) => t.visible).map((t) => t.nom);
      const hors = [...new Set(demandes)].filter((d) => !attendues.includes(d));
      T('encre ×4 à 3× : des tuiles montées sur la page visible', info.length > 0, `${info.length} boîtes : ${info.map((t) => `${t.nom} ${t.etat}${t.visible ? '' : ' (hors vue)'}`).join(', ')}`);
      T('encre ×4 : seules les tuiles visibles (marge 25 %) sont demandées', demandes.length > 0 && !hors.length && info.filter((t) => !t.visible).length > 0 ? true : demandes.length > 0 && !hors.length, `demandées ${[...new Set(demandes)].join(', ') || 'aucune'}${hors.length ? ` · HORS VUE : ${hors.join(', ')}` : ''} · ${info.filter((t) => !t.visible).length} tuile(s) hors vue non demandée(s)`);
      const etats = info.filter((t) => t.visible).map((t) => t.etat);
      T('encre ×4 : tuiles visibles décodées puis posées (fondu fini)', etats.length > 0 && etats.every((s) => s === 'couverte'), etats.join(', '));
      const clip = await page.evaluate(() => { const i = document.querySelector('.gc-page-cuite[data-gc-encre4x] .gc-page-cuite__encre'); return i ? (i.style.clipPath || i.style.visibility || '') : null; });
      T('encre ×4 : l\'encre ×2 est masquée sous les tuiles posées (pas d\'encre deux fois)', !!clip, String(clip).slice(0, 80));
      R.capturer(await capt(page, `${e.nom}-3x`, out), `${e.titre} — 3×, encre ×4 (${origine.split(' ')[0]})`);
      // Un déplacement : aucune tuile ne change pendant le geste
      if (touch) await glisser(page, [centre.x - 100, centre.y], [centre.x + 120, centre.y + 140], { ms: 300, n: 12 });
      else await glisserSouris(page, [centre.x - 100, centre.y], [centre.x + 120, centre.y + 140], { ms: 300, n: 12 });
      await page.waitForTimeout(1200);
      await repos(page);
      const pend = await page.evaluate(() => window.__gcLoupeEssai.tuilesPendantGeste);
      T('encre ×4 : aucun changement de tuile pendant un geste (rappels en attente)', !pend.length, pend.slice(0, 4).join(', '));
      await demander(page, 1.3);
      const garde = await page.evaluate(() => document.querySelectorAll('.gc-page-cuite__tuile').length);
      await demander(page, 2);
      R.capturer(await capt(page, `${e.nom}-2x`, out), `${e.titre} — 2×`);
      await demander(page, 1.2);
      const retire = await page.evaluate(() => document.querySelectorAll('.gc-page-cuite__tuile').length);
      const clip2 = await page.evaluate(() => [...document.querySelectorAll('.gc-page-cuite__encre')].some((i) => i.style.clipPath || i.style.visibility));
      T('encre ×4 : gardée à 1,3× (hystérésis), retirée sous 1,25× (encre ×2 rendue entière)', garde > 0 && retire === 0 && !clip2, `1,3× : ${garde} tuiles · 1,2× : ${retire} tuiles, masque ${clip2}`);
      page.off('request', ecoute);
      // Captures de lecture : la recette (page droite) à 2× et 3×, centrées sur l'écriture.
      await demander(page, 1);
      if ((await etatLivre(page)).cadrage === 'page') {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(300);
        await repos(page, { calme: 600 });
      }
      const fr = await page.evaluate(() => {
        const f = [...document.querySelectorAll('.gc-livre__page--visible .gc-livre-face--right')].map((x) => x.getBoundingClientRect()).find((r) => r.width > 0);
        return f ? { x: f.left + f.width * 0.45, y: f.top + f.height * 0.42 } : null;
      });
      if (fr) {
        for (const z of [2, 3]) {
          await demander(page, z, fr);
          for (let i = 0; i < 40; i++) {
            if (!(await page.evaluate(() => [...document.querySelectorAll('.gc-page-cuite__tuile')].some((t) => /demandee|prete/.test(t.getAttribute('data-gc-tuile-etat')))))) break;
            await page.waitForTimeout(300);
          }
          R.capturer(await capt(page, `${e.nom}-recette-${z}x`, out), `${e.titre} — la recette à ${z}× (encre ×4 : ${origine.split(' ')[0]})`);
        }
      }
    });

    // 9. Trace (CPU ×4) : 0 Layout, ≤ 2 Paint pendant le geste
    if (!drapeau('sans-trace')) {
      await bloc('trace', async () => {
        await page.goto(cible.url(e, lien));
        await page.waitForTimeout(800);
        await figerFeu(page);
        await repos(page, { calme: 500 });
        await cadence(page);
        const essais = [];
        if (touch) {
          essais.push(['pincement au doigt', () => pincer(page, centre, 80, 190, { n: 16, ms: 400 })]);
          essais.push(['déplacement au doigt (2×)', async () => glisser(page, [centre.x + 80, centre.y], [centre.x - 120, centre.y + 30], { ms: 300, n: 14 })]);
        } else {
          essais.push(['ctrl + molette', () => roue(page, centre.x, centre.y, -50, { ctrl: true, n: 6, ms: 40 })]);
          essais.push(['glisser à la souris (2×)', () => glisserSouris(page, [centre.x + 80, centre.y], [centre.x - 120, centre.y + 30], { ms: 300, n: 14 })]);
        }
        essais.push(['+ au clavier (ressort)', () => page.keyboard.press('+')]);
        for (const [nom, f] of essais) {
          if (/2×/.test(nom)) await demander(page, 2, centre);
          else { await demander(page, 1); }
          const m = await tracer(page, f);
          if (!m) { R.ajouter(e.nom, `trace ${nom}`, 'KO', 'marques gc-geste-debut/fin-loupe absentes'); continue; }
          T(`trace ${nom} (CPU ×4) : 0 Layout, ≤ 2 Paint`, m.Layout === 0 && m.Paint <= 2, `Layout ${m.Layout} · Paint ${m.Paint}${m.Paint ? ` (à ${m.paintA.join(', ')} ms)` : ''} · style ${m.Style} · ${m.ms} ms`);
        }
      });
    }

    // 10. Zoom du navigateur, rotation, rechargement
    await bloc('rotation', async () => {
      await demander(page, 2);
      const vp = e.ctx.viewport;
      await page.setViewportSize({ width: vp.height, height: vp.width });
      await page.waitForTimeout(900);
      await cadence(page);
      await repos(page);
      const s = await lire(page);
      T('rotation : la loupe reste (même facteur)', Math.abs(s.etat.z - 2) < 0.01 && Math.abs(s.z - 2) < 0.01, `z ${s.etat.z} · ${s.transform}`);
      await page.setViewportSize(vp);
      await page.waitForTimeout(900);
      await repos(page);
      const s2 = await lire(page);
      T('rotation retour : la loupe reste', Math.abs(s2.etat.z - 2) < 0.01, `z ${s2.etat.z}`);
      await demander(page, 1);
    });
    await bloc('navigateur zoomé', async () => {
      const cdp = await cdpDe(page);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
      await page.waitForTimeout(400);
      const s = await lire(page);
      if (s.vv <= 1.01) { R.info(e.nom, 'zoom du navigateur', `visualViewport.scale ${s.vv} : non simulable ici`); await cdp.send('Emulation.resetPageScaleFactor').catch(() => {}); return; }
      await page.keyboard.press('+');
      await page.waitForTimeout(300);
      const s2 = await lire(page);
      T('navigateur zoomé (scale > 1,01) : loupe retirée ([data-gc-loupe-navigateur], + sans effet)', s2.navigateur && s2.etat.z === 1, `scale ${s2.vv}, z ${s2.etat.z}`);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      await cadence(page);
      for (let i = 0; i < 30 && (await lire(page)).navigateur; i++) await page.waitForTimeout(300);
      T('navigateur revenu à 1 : loupe rendue', !(await lire(page)).navigateur, `scale ${(await lire(page)).vv}`);
    });
    await bloc('rechargement', async () => {
      await demander(page, 2);
      await page.reload();
      await page.waitForTimeout(800);
      await repos(page);
      const s = await lire(page);
      const cles = await page.evaluate(() => { try { return Object.keys(localStorage).filter((k) => /loupe/i.test(k)); } catch { return []; } });
      T('rechargement : loupe à 1× (rien n\'est mémorisé)', s.etat.z === 1 && !cles.length, cles.join(', '));
    });
  } finally {
    R.ok(e.nom, 'aucune erreur de page', !surv.erreurs.length, surv.erreurs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

/** Fonctions pures du contrôleur (dans la page : le bundle les expose). */
async function suitePure() {
  const { ctx, page } = await ouvrir(ecrans(['ordi-1280'])[0]);
  try {
    const r = await page.evaluate(() => {
      const G = window.GoutersDeCecile;
      if (!G.zoomFoyer) return null;
      const out = {};
      const v = G.zoomFoyer({ x: 0, y: 0, z: 1 }, 2, { x: 100, y: 50 });
      out.foyer = v.x === -100 && v.y === -50 && v.z === 2;
      const p = G.pincer({ x: 0, y: 0, z: 1 }, { x: 100, y: 100 }, 100, { x: 120, y: 90 }, 200);
      out.pincer = Math.abs(p.z - 2) < 1e-9 && Math.abs(p.x - (120 - 200)) < 1e-9 && Math.abs(p.y - (90 - 200)) < 1e-9;
      const C = { x: 100, y: 50, w: 800, h: 600 };
      const S = { x: 0, y: 47, w: 1000, h: 700 };
      const b1 = G.bornerPan({ x: 37, y: -12 }, 1, C, S);
      out.repos = b1.x === 0 && b1.y === 0;
      const b2 = G.bornesPan(2, C, S); // 1600 ≥ 1000 : couvrir
      out.couvre = b2.x[0] === 1000 - 2 * 900 && b2.x[1] === -200 && b2.y[1] === 47 - 100;
      const bc = G.bornesAxe(1.25, 100, 600, 0, 1000); // 750 < 1000 : dans la zone
      out.dedans = bc[0] === 0 - 125 && bc[1] === 1000 - 1.25 * 700;
      const seuil = G.bornesAxe(1000 / 800, 100, 800, 0, 1000);
      out.continu = Math.abs(seuil[0] - seuil[1]) < 1e-9;
      const a = G.ancrerHaut({ x: 100, y: 50, w: 400, h: 600 }, 2, S, C);
      out.ancre = Math.abs(a.y - (47 - 100)) < 1e-9;
      out.elastique = G.zElastique(0.5) >= 0.9 && G.zElastique(0.95) < 1 && G.zElastique(10) <= 3.3 + 1e-9 && G.zElastique(3.2) > 3 && G.zElastique(2) === 2;
      out.paliers = [G.palierVoisin(1, 1), G.palierVoisin(1.5, 1), G.palierVoisin(2, 1), G.palierVoisin(3, 1), G.palierVoisin(3, -1), G.palierVoisin(1.2, -1)].join(' ') === '1.5 2 3 3 2 1';
      return out;
    });
    if (!r) { R.attente(null, 'fonctions pures exposées (zoomFoyer…)'); return; }
    for (const [k, v] of Object.entries(r)) R.ok(null, `fonction pure : ${k}`, v);
  } finally {
    await ctx.close();
  }
}

// ---- Programme -------------------------------------------------------------------------------------------
const liste_ = ecrans(liste('only', 'iphone13-portrait,pixel7,ipad-paysage,ordi-1440,tv-1080'));
let essai = null;
{
  const { ctx, page } = await ouvrir(liste_[0]);
  try { essai = await fabriquerTuiles(page); } catch (x) { R.info(null, 'tuiles d\'essai', `non fabriquées : ${String(x).split('\n')[0]}`); }
  await ctx.close();
}
R.info(null, 'tuiles d\'essai ×4', essai ? `${Object.keys(essai).length} pages → ${rel(DOSSIER_TUILES)}` : 'aucune');
await suitePure();
for (const e of liste_) {
  console.log(`\n■ ${e.titre}`);
  try {
    await suiteEcran(e, essai);
  } catch (x) {
    R.ajouter(e.nom, 'exécution', 'KO', `plantage : ${String(x).split('\n')[0]}`);
  }
}
const pl = planche(R.captures, join(out, 'planche-loupe.png'), { titre: `Loupe — ${cible.type} · ${new Date().toISOString().slice(0, 16)}`, colonnes: 4 });
R.ecrire({ planche: pl ? rel(pl) : null });
await browser.close();
await cible.close();
await attendre(10);
process.exit(R.code());
