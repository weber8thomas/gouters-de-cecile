// Lumière du feu (plan v4, lot L) : src/lib/feu.ts (horloge du feu), Stage + Lumiere (calques).
// Carte Carnet autonome (harness/devices.html + bundle), TV 1920 × 1080 au clavier, téléphones émulés.
//
// Vérifie :
//   - présence des calques [data-gc-lumiere] (bain, ombre, ambiance, voile) ; aucun ne capte le pointeur
//     (pointer-events: none sur eux et leurs conteneurs ; elementFromPoint ne tombe jamais dessus) ;
//   - le feu est vivant : l'opacité des calques varie dans le temps (valeurs distinctes, amplitude) ;
//   - pause quand l'onglet est caché (visibilitychange) : le moteur ne calcule plus d'image, reprise ensuite ;
//   - mouvement réduit (prefers-reduced-motion) et réglage feu: false : lumière statique (mode « statique »,
//     intensité 1, opacités constantes) ; feu: false en ATTENTE tant que reglages.ts (lot S) ne le garde pas ;
//   - performance (trace Chrome, CPU ×4) : 5 s au repos, puis un tour de page (→ sur la page du carnet) :
//     0 Layout et 0 Paint attribuables au feu (Paint sur un calque de lumière, ou écart feu vivant / feu figé),
//     calques composités en plus dus à la lumière (CDP LayerTree, lumière retirée par CSS) ≤ 4 ;
//   - téléphone milieu de gamme émulé (Pixel 7, CPU ×4) : temps de script et cadence, feu vivant / figé ;
//   - contraste de l'encre d'une page cuite (Julie) : ≥ 90 % du contraste sans voile, sur chaque tuile
//     de la page qui porte de l'encre, feu figé au plus bas, à la moyenne et au plus fort.
// Captures dans verification/out/v4-l : TV à 3 instants du vacillement, couverture, téléphone debout,
// avant / après (bundle --avant), planche ; vidéo feu.mp4 (H.264, ffmpeg) : le feu vivant puis un tour de page.
//
//   node scripts/verify-lumiere.mjs [--bundle dist/ds-v4-l/components] [--avant dist/ds-v4-l-avant/components]
//        [--only presence,pointeur,vivant,pause,reduit,feu-off,perf,telephone,contraste,captures,video]
//        [--out verification/out/v4-l] [--lien julie] [--throttle 4]
import { mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import {
  ROOT, lireArgs, ecran, lancer, ouvrirCible, ouvrirPage, Rapport, rectDe, capture, planche, rel, cdpDe,
  initReglages, attendrePret, instrumenterGeste,
} from './lib/verif.mjs';

const { opt, liste, drapeau } = lireArgs();
const out = resolve(ROOT, opt('out', 'verification/out/v4-l'));
const lien = opt('lien', 'julie');
const throttle = Number(opt('throttle', 4));
const bundle = opt('bundle', 'dist/ds-v4-l/components');
const avant = opt('avant', existsSync(join(ROOT, 'dist/ds-v4-l-avant/components/bundle.js')) ? 'dist/ds-v4-l-avant/components' : null);
const tests = new Set(liste('only', 'presence,pointeur,vivant,pause,reduit,feu-off,perf,telephone,contraste,captures,video'));
mkdirSync(out, { recursive: true });

const cible = await ouvrirCible({ bundle });
const R = new Rapport('lumiere', { dir: out, meta: { cible: cible.type, depart: cible.depart, bundle } });
// Compositing logiciel par défaut : sur une machine chargée, le GPU SwiftShader ne rend presque plus
// d'images (rAF à l'arrêt) ; --swiftshader pour le chemin GPU des autres vérifications.
const ARGS = drapeau('swiftshader') ? undefined : ['--disable-gpu'];
const browser = await lancer({ args: ARGS });
console.log(`■ Lumière du feu — ${cible.type} : ${cible.depart} (${ARGS ? 'compositing logiciel' : 'SwiftShader'})`);

const TV = ecran('tv-1080');
const TEL = ecran('iphone13-portrait');
const PIXEL = ecran('pixel7');
const CALQUES = '[data-gc-lumiere]';
const NOMS = ['bain', 'ombre', 'ambiance', 'voile'];
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing'];
const SANS_LUMIERE = '.gc-lumiere { display: none !important; }';
const SANS_VOILE = '.gc-lumiere--livre { visibility: hidden !important; }';
// Mesure de l'encre : les objets vivants (photo, feuillet, invitation) bougent avec les indices du lot S
// et ne sont pas de l'encre ; on les cache pendant la mesure.
const SANS_OBJETS = '[data-gc-objet], .gc-livre__invitation { visibility: hidden !important; }';

// Marques de geste (trace) et journal des gestes du livre.
function INIT_MARQUES() {
  if (window.__gcLum) return;
  const L = (window.__gcLum = { gestes: [] });
  document.addEventListener('gc-livre-geste', (e) => {
    const d = e.detail ?? {};
    L.gestes.push({ phase: d.phase, type: d.type, t: performance.now() });
    try { performance.mark(`gc-geste-${d.phase}-${d.type}`); } catch { /* rien */ }
  });
}

const etatFeu = (page) => page.evaluate(() => window.__gcFeu?.etat?.() ?? null);
const figer = (page, v) => page.evaluate((x) => window.__gcFeu?.figer?.(x), v);
const flamber = (page) => page.evaluate(() => window.__gcFeu?.flamber?.());
const styleEnPlus = async (page, css) => page.addStyleTag({ content: css }).then((h) => h.evaluate((el) => { el.dataset.gcEssai = '1'; }));
const retirerStyles = (page) => page.evaluate(() => document.querySelectorAll('style[data-gc-essai]').forEach((s) => s.remove()));
const deuxImages = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function ouvrir(e, hash = lien, options = {}) {
  const r = await ouvrirPage(browser, cible, e, hash, { ...options, init: [INIT_MARQUES, ...(options.init ?? [])] });
  await r.page.waitForTimeout(400);
  return r;
}

/** Opacités des calques de lumière, échantillonnées à chaque image pendant `ms`. */
const echantillonner = (page, ms) => page.evaluate(([sel, duree]) => new Promise((resolve) => {
  const par = {};
  const t0 = performance.now();
  let images = 0;
  const tick = () => {
    images++;
    for (const el of document.querySelectorAll(sel)) {
      const k = el.getAttribute('data-gc-lumiere');
      const cs = getComputedStyle(el);
      const p = (par[k] ??= { op: [], tr: new Set() });
      p.op.push(Number(cs.opacity));
      p.tr.add(cs.transform);
    }
    if (performance.now() - t0 < duree) requestAnimationFrame(tick);
    else {
      resolve({
        images,
        par: Object.fromEntries(Object.entries(par).map(([k, p]) => [k, {
          distinctes: new Set(p.op.map((v) => v.toFixed(4))).size,
          min: Math.min(...p.op), max: Math.max(...p.op), transforms: p.tr.size,
        }])),
      });
    }
  };
  requestAnimationFrame(tick);
}), [CALQUES, ms]);

const r3 = (v) => Math.round(v * 1000) / 1000;
const pc = (v) => `${Math.round(v * 1000) / 10} %`;

// ---- 1. Présence et pointeur -------------------------------------------------------------------------
if (tests.has('presence') || tests.has('pointeur')) {
  const { ctx, page, surv } = await ouvrir(TV);
  const noms = await page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.getAttribute('data-gc-lumiere')), CALQUES);
  if (tests.has('presence')) {
    R.ok('tv-1080', 'calques de lumière présents (bain, ombre, ambiance, voile)', NOMS.every((n) => noms.includes(n)), noms.join(', '));
    R.ok('tv-1080', 'aucune erreur de page', surv.erreurs.length === 0, surv.erreurs.slice(0, 3).join(' · '));
    const ordre = await page.evaluate(() => {
      const st = document.querySelector('.gc-stage');
      const enfants = st ? [...st.children].map((c) => c.className.split(' ')[0]) : [];
      return enfants;
    });
    const iT = ordre.indexOf('gc-lumiere');
    const iC = ordre.indexOf('gc-stage__content');
    const iL = ordre.indexOf('gc-stage__light');
    R.ok('tv-1080', 'ordre : table → lumière de table → livre → ambiance et voile', iT >= 0 && iT < iC && iC < iL, ordre.join(' › '));
  }
  if (tests.has('pointeur')) {
    const pe = await page.evaluate((s) => {
      const mauvais = [];
      for (const el of document.querySelectorAll(`${s}, .gc-lumiere, .gc-stage__light`)) {
        if (getComputedStyle(el).pointerEvents !== 'none') mauvais.push(el.className);
      }
      // elementFromPoint sur une grille de l'écran : jamais un calque de lumière.
      const touches = [];
      for (let y = 20; y < innerHeight; y += 90) for (let x = 20; x < innerWidth; x += 120) {
        const t = document.elementFromPoint(x, y);
        if (t && t.closest('.gc-lumiere, .gc-stage__light')) touches.push([x, y]);
      }
      return { mauvais, touches };
    }, CALQUES);
    R.ok('tv-1080', 'pointer-events: none sur tous les calques de lumière', pe.mauvais.length === 0, pe.mauvais.join(', '));
    R.ok('tv-1080', 'elementFromPoint ne tombe jamais sur la lumière (grille 120 × 90 px)', pe.touches.length === 0, pe.touches.slice(0, 5).map((p) => p.join(',')).join(' '));
    // Le tour de page au clic dans la marge et la photo restent atteignables.
    const photo = await rectDe(page, '[data-gc-objet="photo"]');
    if (photo) {
      const sous = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-gc-objet]')?.getAttribute('data-gc-objet') ?? null, [photo.cx, photo.cy]);
      R.ok('tv-1080', 'la photo collée reste sous le doigt (au-dessus de la lumière ou traversée)', sous === 'photo', `${sous}`);
    }
  }
  await ctx.close();
}

// ---- 2. Le feu vit ; pause onglet caché ---------------------------------------------------------------
if (tests.has('vivant') || tests.has('pause')) {
  const { ctx, page } = await ouvrir(TV);
  if (tests.has('vivant')) {
    const f0 = await etatFeu(page);
    const e = await echantillonner(page, 4000);
    const f = await etatFeu(page);
    R.ok('tv-1080', 'moteur du feu « vivant »', f?.mode === 'vivant' && f.images > f0.images, `${JSON.stringify(f)} · ${f.images - f0.images} images en 4 s (page : ${e.images})`);
    const assez = Math.max(4, Math.min(20, Math.floor(e.images / 3)));
    for (const n of ['bain', 'voile']) { // l'ombre est peinte dans le bain ; l'ambiance est statique
      const p = e.par[n];
      R.ok('tv-1080', `opacité du calque « ${n} » qui varie (4 s)`, !!p && p.distinctes >= assez && p.max - p.min >= 0.015, p ? `${p.distinctes} valeurs sur ${e.images} images (seuil ${assez}), ${r3(p.min)} → ${r3(p.max)}, ${p.transforms} transforms` : 'absent');
    }
    R.ok('tv-1080', 'la source bouge (transform du bain)', (e.par.bain?.transforms ?? 0) >= assez, `${e.par.bain?.transforms} valeurs`);
  }
  if (tests.has('pause')) {
    const cacher = (cache) => page.evaluate((h) => {
      Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, cache);
    await cacher(true);
    await page.waitForTimeout(150);
    const a = await etatFeu(page);
    const e = await echantillonner(page, 1200);
    const b = await etatFeu(page);
    R.ok('tv-1080', 'onglet caché : moteur en pause (aucune image calculée)', a.mode === 'pause' && b.images === a.images, `mode ${a.mode}, images ${a.images} → ${b.images}`);
    R.ok('tv-1080', 'onglet caché : opacités figées', Object.values(e.par).every((p) => p.distinctes === 1), Object.entries(e.par).map(([k, p]) => `${k} ${p.distinctes}`).join(', '));
    await cacher(false);
    await page.waitForTimeout(600);
    const c = await etatFeu(page);
    R.ok('tv-1080', 'onglet de nouveau visible : le feu repart', c.mode === 'vivant' && c.images > b.images, `mode ${c.mode}, images ${b.images} → ${c.images}`);
  }
  await ctx.close();
}

// ---- 3. Mouvement réduit, feu: false ------------------------------------------------------------------
async function statique(nom, options, attenteSi) {
  const { ctx, page } = await ouvrir(TV, lien, options);
  const e = await echantillonner(page, 1800);
  const f = await etatFeu(page);
  const fixe = Object.values(e.par).every((p) => p.distinctes === 1 && p.transforms === 1);
  const detail = `mode ${f?.mode}, intensité ${f?.intensite}, ${Object.entries(e.par).map(([k, p]) => `${k} ${p.distinctes}×${r3(p.max)}`).join(', ')}`;
  if (attenteSi && f?.mode !== 'statique') R.attente('tv-1080', `${nom} : lumière statique`, attenteSi);
  else R.ok('tv-1080', `${nom} : lumière statique, à l'intensité moyenne`, f?.mode === 'statique' && f?.intensite === 1 && fixe, detail);
  await ctx.close();
}
if (tests.has('reduit')) await statique('mouvement réduit (système)', { contexteExtra: { reducedMotion: 'reduce' } });
if (tests.has('reduit')) await statique('moins d\'animations (réglage du carnet)', { init: [initReglages({ mouvementReduit: true })] });
if (tests.has('feu-off')) {
  const garde = /\bfeu\b\s*[:?]/.test(readFileSync(join(ROOT, 'src/lib/reglages.ts'), 'utf8'));
  await statique('réglage feu: false', { init: [initReglages({ feu: false })] }, garde ? null : 'reglages.ts (lot S) ne garde pas encore le champ « feu » : à relancer après intégration');
}

// ---- 4. Performance : trace (CPU ×4) au repos et pendant un tour de page, calques -----------------------
async function tracer(page, cdp, fn) {
  await browser.startTracing(page, { categories: CATEGORIES });
  const m0 = await cdp.send('Performance.getMetrics');
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  const m1 = await cdp.send('Performance.getMetrics');
  const ev = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
  const met = (m, n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
  return { ev, ms, script: (met(m1, 'ScriptDuration') - met(m0, 'ScriptDuration')) * 1000, style: (met(m1, 'RecalcStyleDuration') - met(m0, 'RecalcStyleDuration')) * 1000 };
}

/** Compte Layout / Paint (entre deux marques si données) et décrit les nœuds peints. */
async function compter(cdp, ev, debut, fin) {
  const marque = (n) => ev.filter((e) => e.name === n && String(e.cat).includes('blink.user_timing')).map((e) => e.ts).sort((a, b) => a - b);
  const t0 = debut ? marque(debut)[0] : -Infinity;
  const t1 = fin ? marque(fin).find((t) => t > t0) : Infinity;
  const dans = (e) => e.ts >= t0 && e.ts <= (t1 ?? Infinity) && (e.ph === 'X' || e.ph === 'B');
  const paints = ev.filter((e) => e.name === 'Paint' && dans(e));
  const noeuds = {};
  try {
    await cdp.send('DOM.getDocument', { depth: -1 });
    for (const id of new Set(paints.map((e) => e.args?.data?.nodeId).filter((x) => x != null))) {
      const d = await cdp.send('DOM.describeNode', { backendNodeId: id }).catch(() => null);
      const n = d?.node;
      const cls = n?.attributes ? (n.attributes[n.attributes.indexOf('class') + 1] ?? '') : '';
      noeuds[id] = `${n?.nodeName ?? '?'}${cls ? '.' + cls.split(' ')[0] : ''}`;
    }
  } catch { /* DOM indisponible */ }
  const lumiere = paints.filter((e) => /gc-lumiere|gc-ombre-feu/.test(noeuds[e.args?.data?.nodeId] ?? ''));
  const parNoeud = {};
  for (const e of paints) { const k = noeuds[e.args?.data?.nodeId] ?? '?'; parNoeud[k] = (parNoeud[k] ?? 0) + 1; }
  return {
    trouve: t1 != null && Number.isFinite(t0),
    Layout: ev.filter((e) => e.name === 'Layout' && dans(e)).length,
    Paint: paints.length,
    PaintLumiere: lumiere.length,
    UpdateLayoutTree: ev.filter((e) => e.name === 'UpdateLayoutTree' && dans(e)).length,
    parNoeud,
  };
}

async function calques(page, cdp, fn) {
  let max = 0;
  let dernier = 0;
  const ecoute = ({ layers }) => { if (layers) { max = Math.max(max, layers.length); dernier = layers.length; } };
  cdp.on('LayerTree.layerTreeDidChange', ecoute);
  await cdp.send('LayerTree.enable');
  await fn();
  await cdp.send('LayerTree.disable').catch(() => {});
  cdp.off('LayerTree.layerTreeDidChange', ecoute);
  return { max, dernier };
}

const attendreFin = (page, type, depuis) => page.waitForFunction(([ty, d]) => (window.__gcLum?.gestes ?? []).slice(d).some((g) => g.phase === 'fin' && g.type === ty), [type, depuis], { timeout: 20000, polling: 30 }).catch(() => null);
const nGestes = (page) => page.evaluate(() => window.__gcLum?.gestes.length ?? 0);

async function tourDePage(page, touche) {
  const n = await nGestes(page);
  await page.keyboard.press(touche);
  await attendreFin(page, 'page', n);
  await page.waitForTimeout(250);
}

if (tests.has('perf')) {
  const { ctx, page } = await ouvrir(TV);
  const cdp = await cdpDe(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.waitForTimeout(800);

  // Au repos, feu vivant puis figé. Les indices du lot S (la photo « respire » toutes les 6 à 9 s)
  // peignent de leur côté : les objets vivants sont retirés pendant ces deux mesures.
  await page.addStyleTag({ content: '[data-gc-objet], .gc-livre__invitation { display: none !important; }' }).then((h) => h.evaluate((el) => { el.dataset.gcEssai = '1'; }));
  await page.waitForTimeout(300);
  const vif = await tracer(page, cdp, () => page.waitForTimeout(5000));
  const cVif = await compter(cdp, vif.ev);
  await figer(page, { intensite: 1 });
  await page.waitForTimeout(300);
  const fige = await tracer(page, cdp, () => page.waitForTimeout(5000));
  const cFige = await compter(cdp, fige.ev);
  await figer(page, null);
  await retirerStyles(page);
  R.ok('tv-1080', `repos 5 s (CPU ×${throttle}) : 0 Layout dû au feu`, cVif.Layout - cFige.Layout <= 0, `feu vivant ${cVif.Layout} · figé ${cFige.Layout}`);
  R.ok('tv-1080', `repos 5 s (CPU ×${throttle}) : 0 Paint dû au feu`, cVif.PaintLumiere === 0 && cVif.Paint - cFige.Paint <= 0, `feu vivant ${cVif.Paint} (dont calques de lumière ${cVif.PaintLumiere}) · figé ${cFige.Paint} ; ${JSON.stringify(cVif.parNoeud)}`);
  R.info('tv-1080', `repos 5 s : coût du feu (CPU ×${throttle})`, `script ${Math.round(vif.script)} ms (figé ${Math.round(fige.script)} ms), recalcul de style ${Math.round(vif.style)} ms (figé ${Math.round(fige.style)} ms), UpdateLayoutTree ${cVif.UpdateLayoutTree} (figé ${cFige.UpdateLayoutTree})`);

  // Tour de page (→), feu vivant puis figé (retour ←).
  const tVif = await tracer(page, cdp, () => tourDePage(page, 'ArrowRight'));
  const ctVif = await compter(cdp, tVif.ev, 'gc-geste-debut-page', 'gc-geste-fin-page');
  await figer(page, { intensite: 1 });
  const tFige = await tracer(page, cdp, () => tourDePage(page, 'ArrowLeft'));
  const ctFige = await compter(cdp, tFige.ev, 'gc-geste-debut-page', 'gc-geste-fin-page');
  await figer(page, null);
  if (!ctVif.trouve) R.attente('tv-1080', 'tour de page : marques du geste introuvables', 'gc-livre-geste « page » non reçu');
  else {
    R.ok('tv-1080', `tour de page (CPU ×${throttle}) : 0 Layout dû au feu`, ctVif.Layout - ctFige.Layout <= 0, `feu vivant ${ctVif.Layout} · figé ${ctFige.Layout}`);
    R.ok('tv-1080', `tour de page (CPU ×${throttle}) : 0 Paint dû au feu`, ctVif.PaintLumiere === 0 && ctVif.Paint - ctFige.Paint <= 0, `feu vivant ${ctVif.Paint} (calques de lumière ${ctVif.PaintLumiere}) · figé ${ctFige.Paint} ; ${JSON.stringify(ctVif.parNoeud)}`);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // Calques : au repos et pendant un tour de page, avec puis sans lumière.
  const repos = await calques(page, cdp, () => page.waitForTimeout(700));
  const tour = await calques(page, cdp, () => tourDePage(page, 'ArrowRight'));
  await styleEnPlus(page, SANS_LUMIERE);
  await page.waitForTimeout(300);
  const reposSans = await calques(page, cdp, () => page.waitForTimeout(700));
  const tourSans = await calques(page, cdp, () => tourDePage(page, 'ArrowLeft'));
  await retirerStyles(page);
  const enPlus = Math.max(repos.dernier - reposSans.dernier, tour.max - tourSans.max);
  R.ok('tv-1080', 'calques composités en plus dus à la lumière ≤ 4', enPlus <= 4, `repos ${repos.dernier} (sans lumière ${reposSans.dernier}) · tour de page max ${tour.max} (sans ${tourSans.max})`);
  R.ok('tv-1080', 'calques pendant un tour de page ≤ 40 (CONTRACT § 10)', tour.max <= 40, `${tour.max}`);
  await ctx.close();
}

// ---- 5. Téléphone milieu de gamme émulé (Pixel 7, CPU ×4) ---------------------------------------------
if (tests.has('telephone')) {
  const { ctx, page } = await ouvrir(PIXEL);
  const cdp = await cdpDe(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.waitForTimeout(800);
  const cadence = (ms) => page.evaluate((d) => new Promise((resolve) => {
    const ts = [];
    const t0 = performance.now();
    const tick = (t) => { ts.push(t); if (t - t0 < d) requestAnimationFrame(tick); else resolve(ts.slice(1).map((v, i) => v - ts[i])); };
    requestAnimationFrame(tick);
  }), ms);
  const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const mesure = async () => {
    const m0 = await cdp.send('Performance.getMetrics');
    const dt = await cadence(4000);
    const m1 = await cdp.send('Performance.getMetrics');
    const met = (m, n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
    return { p50: Math.round(q(dt, 0.5) * 10) / 10, p95: Math.round(q(dt, 0.95) * 10) / 10, longues: dt.filter((x) => x > 25).length, images: dt.length, script: Math.round((met(m1, 'ScriptDuration') - met(m0, 'ScriptDuration')) * 1000), style: Math.round((met(m1, 'RecalcStyleDuration') - met(m0, 'RecalcStyleDuration')) * 1000) };
  };
  const vif = await mesure();
  await figer(page, { intensite: 1 });
  const fige = await mesure();
  await figer(page, null);
  R.info('pixel7', `repos 4 s, CPU ×${throttle} : cadence et coût, feu vivant / figé`, `vivant p50 ${vif.p50} ms p95 ${vif.p95} ms, ${vif.longues} images > 25 ms, script ${vif.script} ms, style ${vif.style} ms · figé p50 ${fige.p50} p95 ${fige.p95}, ${fige.longues} > 25 ms, script ${fige.script} ms, style ${fige.style} ms`);
  R.ok('pixel7', `repos, CPU ×${throttle} : le feu coûte moins de 1,5 ms de script + style par image`, (vif.script + vif.style - fige.script - fige.style) / Math.max(1, vif.images) < 1.5, `${r3((vif.script + vif.style - fige.script - fige.style) / Math.max(1, vif.images))} ms/image`);
  // Tour de page sur le téléphone (cadrage « page » : → glisse vers la page droite, → tourne).
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500);
  const n = await nGestes(page);
  const p0 = page.evaluate((d) => new Promise((resolve) => {
    const ts = [];
    const tick = (t) => {
      ts.push(t);
      const g = window.__gcLum.gestes.slice(d);
      if (g.some((x) => x.phase === 'fin' && x.type === 'page') || ts.length > 600) resolve(ts.slice(1).map((v, i) => v - ts[i]));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);
  await page.keyboard.press('ArrowRight');
  const dt = await p0;
  R.info('pixel7', `tour de page, CPU ×${throttle}, feu vivant`, `${dt.length} images, p50 ${Math.round(q(dt, 0.5) * 10) / 10} ms, p95 ${Math.round(q(dt, 0.95) * 10) / 10} ms, ${dt.filter((x) => x > 25).length} > 25 ms (SwiftShader : cadence absolue indicative)`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await ctx.close();
}

// ---- 6. Contraste de l'encre (page cuite) ---------------------------------------------------------------
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);

/**
 * Contraste encre / papier, tuile par tuile (grille 3 × 4) : encre = les pixels les plus sombres de la
 * tuile sans voile (≤ 4e centile et L < 0,3), papier = médiane ; les mêmes pixels avec la lumière.
 * Renvoie le rapport (avec / sans) le plus faible et la moyenne des tuiles qui portent de l'encre.
 */
function contraste(pngSans, pngAvec) {
  const A = PNG.sync.read(pngSans);
  const B = PNG.sync.read(pngAvec);
  const tuiles = [];
  const nx = 3;
  const ny = 4;
  for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
    const x0 = Math.floor((tx * A.width) / nx); const x1 = Math.floor(((tx + 1) * A.width) / nx);
    const y0 = Math.floor((ty * A.height) / ny); const y1 = Math.floor(((ty + 1) * A.height) / ny);
    const px = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * A.width + x) * 4; px.push([lum(A.data, i), lum(B.data, i)]); }
    const tri = px.map((p) => p[0]).sort((a, b) => a - b);
    const seuil = Math.min(tri[Math.floor(tri.length * 0.04)], 0.3);
    const encre = px.filter((p) => p[0] <= seuil && p[0] < 0.3);
    if (encre.length < 150) continue;
    const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const papierA = med(px.map((p) => p[0]));
    const papierB = med(px.map((p) => p[1]));
    const encreA = encre.reduce((s, p) => s + p[0], 0) / encre.length;
    const encreB = encre.reduce((s, p) => s + p[1], 0) / encre.length;
    const cA = (papierA + 0.05) / (encreA + 0.05);
    const cB = (papierB + 0.05) / (encreB + 0.05);
    tuiles.push({ tx, ty, sans: cA, avec: cB, rapport: cB / cA });
  }
  if (!tuiles.length) return null;
  const pire = tuiles.reduce((a, b) => (b.rapport < a.rapport ? b : a));
  return { pire, moyenne: tuiles.reduce((s, t) => s + t.rapport, 0) / tuiles.length, tuiles: tuiles.length };
}

async function mesurerContraste(page, label, e) {
  const res = [];
  await page.addStyleTag({ content: SANS_OBJETS });
  await page.waitForTimeout(200);
  for (const cote of ['gauche', 'droite']) {
    const r = await rectDe(page, `.gc-livre__emplacement--${cote}`);
    if (!r?.visible) continue;
    const clip = { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.w, e.ctx.viewport.width - Math.max(0, r.x)), height: Math.min(r.h, e.ctx.viewport.height - Math.max(0, r.y)) };
    for (const i of [0.8, 1, 1.4]) {
      await figer(page, { intensite: i });
      await deuxImages(page);
      await page.waitForTimeout(120);
      const avec = await page.screenshot({ clip });
      await styleEnPlus(page, SANS_VOILE);
      await deuxImages(page);
      await page.waitForTimeout(120);
      const sans = await page.screenshot({ clip });
      await retirerStyles(page);
      const c = contraste(sans, avec);
      if (c) res.push({ cote, i, ...c });
    }
  }
  await figer(page, null);
  return res;
}

if (tests.has('contraste')) {
  for (const e of [TV, TEL]) {
    const { ctx, page } = await ouvrir(e);
    const res = await mesurerContraste(page, 'apres', e);
    for (const cote of ['gauche', 'droite']) {
      const rs = res.filter((x) => x.cote === cote);
      if (!rs.length) continue;
      const pire = rs.reduce((a, b) => (b.pire.rapport < a.pire.rapport ? b : a));
      R.ok(e.nom, `contraste de l'encre, page ${cote} : ≥ 90 % du contraste sans voile (tuile la plus touchée, feu figé 0,8 / 1 / 1,4)`,
        pire.pire.rapport >= 0.9,
        `pire ${pc(pire.pire.rapport)} (tuile ${pire.pire.tx},${pire.pire.ty}, intensité ${pire.i} : ${r3(pire.pire.sans)}:1 → ${r3(pire.pire.avec)}:1) · moyenne ${rs.map((x) => `${x.i} → ${pc(x.moyenne)}`).join(', ')}`);
    }
    await ctx.close();
  }
  // Référence : la lumière de fenêtre d'avant (bundle --avant), même mesure (lumière retirée par CSS).
  if (avant) {
    const cA = await ouvrirCible({ bundle: avant });
    const ctx = await browser.newContext({ ...TV.ctx });
    await instrumenterGeste(ctx);
    const page = await ctx.newPage();
    await page.goto(cA.url(TV, lien));
    await attendrePret(page).catch(() => null);
    await page.waitForTimeout(600);
    for (const cote of ['gauche', 'droite']) {
      const r = await rectDe(page, `.gc-livre__emplacement--${cote}`);
      if (!r?.visible) continue;
      const clip = { x: r.x, y: r.y, width: r.w, height: Math.min(r.h, 1080 - r.y) };
      await page.addStyleTag({ content: SANS_OBJETS });
      await deuxImages(page);
      const avec = await page.screenshot({ clip });
      await page.addStyleTag({ content: '.gc-stage__light { visibility: hidden !important; }' });
      await deuxImages(page);
      const sans = await page.screenshot({ clip });
      await page.evaluate(() => document.querySelectorAll('style').forEach((s) => { if (s.textContent.includes('gc-stage__light { visibility')) s.remove(); }));
      const c = contraste(sans, avec);
      if (c) R.info('tv-1080', `référence : lumière de fenêtre d'avant, page ${cote}`, `pire ${pc(c.pire.rapport)}, moyenne ${pc(c.moyenne)}`);
    }
    await ctx.close();
    await cA.close();
  }
}

// ---- 7. Captures ----------------------------------------------------------------------------------------
if (tests.has('captures')) {
  const planches = [];
  {
    const { ctx, page } = await ouvrir(TV);
    for (const [k, attente, fl] of [[1, 0, false], [2, 650, false], [3, 900, true]]) {
      if (fl) { await flamber(page); }
      await page.waitForTimeout(attente);
      const f = await etatFeu(page);
      const c = await capture(page, `tv-instant-${k}`, out);
      R.capturer(c, `TV, instant ${k} : intensité ${r3(f.intensite)}, source ${Math.round(f.dx)},${Math.round(f.dy)} px`);
      planches.push([c, `TV instant ${k} — intensité ${r3(f.intensite)}`]);
    }
    // Contraste des instants extrêmes, pour l'œil : figé au plus bas et au plus fort.
    for (const i of [0.85, 1.35]) {
      await figer(page, { intensite: i });
      await deuxImages(page);
      const c = await capture(page, `tv-fige-${String(i).replace('.', '_')}`, out);
      planches.push([c, `TV figé ${i}`]);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await ouvrir(TV, '');
    await page.waitForTimeout(500);
    const c = await capture(page, 'tv-couverture', out);
    R.capturer(c, 'TV, livre fermé (la table au coin du feu)');
    planches.push([c, 'TV couverture']);
    await ctx.close();
  }
  {
    const { ctx, page } = await ouvrir(TEL);
    const g = await capture(page, 'telephone-gauche', out);
    R.capturer(g, 'iPhone 13 debout, page gauche (côté feu)');
    planches.push([g, 'iPhone 13 debout — page gauche']);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1800);
    const d = await capture(page, 'telephone-droite', out);
    R.capturer(d, 'iPhone 13 debout, page droite (côté ombre)');
    planches.push([d, 'iPhone 13 debout — page droite']);
    await ctx.close();
  }
  if (avant) {
    const cA = await ouvrirCible({ bundle: avant });
    for (const e of [TV, TEL]) {
      const ctx = await browser.newContext({ ...e.ctx });
      await instrumenterGeste(ctx);
      const page = await ctx.newPage();
      await page.goto(cA.url(e, lien));
      await attendrePret(page).catch(() => null);
      await page.waitForTimeout(700);
      const c = await capture(page, `avant-${e.nom}`, out);
      planches.push([c, `AVANT (fenêtre, fin d'après-midi) — ${e.titre}`]);
      await ctx.close();
    }
    await cA.close();
    const ap = await (async () => {
      const r = [];
      for (const e of [TV, TEL]) {
        const { ctx, page } = await ouvrir(e);
        await figer(page, { intensite: 1 });
        await deuxImages(page);
        r.push(await capture(page, `apres-${e.nom}`, out));
        await ctx.close();
      }
      return r;
    })();
    planche([[join(out, 'avant-tv-1080.png'), 'Avant : fenêtre de fin d\'après-midi'], [ap[0], 'Après : soirée au coin du feu (intensité moyenne)'], [join(out, 'avant-iphone13-portrait.png'), 'Avant — iPhone 13'], [ap[1], 'Après — iPhone 13']],
      join(out, 'avant-apres.png'), { titre: 'Lumière : avant / après (lot L)', colonnes: 2, tuile: 900, hauteur: 560 });
  }
  planche(planches, join(out, 'planche.png'), { titre: 'Lumière du feu — captures (lot L)', colonnes: 3, tuile: 640, hauteur: 380 });
}

// ---- 8. Vidéo : le feu vivant, une flambée, puis un tour de page -------------------------------------
if (tests.has('video')) {
  const tmp = join(out, '.video-tmp');
  rmSync(tmp, { recursive: true, force: true });
  // Compositing logiciel : sous SwiftShader, recordVideo ne reçoit presque aucune image en mouvement.
  const nav = await lancer({ args: ['--disable-gpu', '--mute-audio'], media: false });
  const ctx = await nav.newContext({ ...TV.ctx, recordVideo: { dir: tmp, size: { width: 1280, height: 720 } } });
  await instrumenterGeste(ctx);
  await ctx.addInitScript(INIT_MARQUES);
  const debut = Date.now();
  const page = await ctx.newPage();
  await page.goto(cible.url(TV, lien));
  await attendrePret(page).catch(() => null);
  await page.waitForTimeout(500);
  const pret = (Date.now() - debut) / 1000;
  await page.waitForTimeout(1300);
  await flamber(page);
  await page.waitForTimeout(2600);
  const tTour = (Date.now() - debut) / 1000;
  await tourDePage(page, 'ArrowRight');
  const tFin = (Date.now() - debut) / 1000;
  const doubleApres = await page.evaluate(() => document.querySelector('.gc-livre-ecran')?.getAttribute('data-gc-double'));
  R.info(null, 'vidéo : chronologie', `prêt ${pret.toFixed(1)} s, touche → ${tTour.toFixed(1)} s, tour fini ${tFin.toFixed(1)} s, double page ${doubleApres}`);
  await page.waitForTimeout(1800);
  const v = page.video();
  await ctx.close();
  const webm = join(out, 'feu.webm');
  await v.saveAs(webm);
  await nav.close();
  rmSync(tmp, { recursive: true, force: true });
  const mp4 = join(out, 'feu.mp4');
  // 3,2 s de feu vivant (la flambée comprise) avant la touche →, puis le tour de page et sa retombée.
  const debutClip = Math.max(pret, tTour - 3.2);
  const duree = Math.min(8, Math.max(6, tFin + 1.2 - debutClip));
  const ff = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', debutClip.toFixed(2), '-i', webm, '-t', duree.toFixed(2), '-vf', 'fps=30,format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', '-an', mp4], { encoding: 'utf8' });
  if (ff.status === 0) {
    rmSync(webm, { force: true });
    const pr = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', mp4], { encoding: 'utf8' });
    const info = JSON.parse(pr.stdout || '{}');
    const s = info.streams?.[0] ?? {};
    const d = Number(info.format?.duration ?? 0);
    R.ok(null, 'vidéo feu.mp4 (H.264, 6 à 8 s)', s.codec_name === 'h264' && d >= 6 && d <= 8.5, `${rel(mp4)} · ${s.codec_name} ${s.width}×${s.height} · ${d.toFixed(1)} s`);
  } else R.ok(null, 'vidéo feu.mp4', false, `ffmpeg : ${ff.stderr?.split('\n')[0]}`);
}

await browser.close();
await cible.close();
for (const f of readdirSync(out).filter((x) => x.startsWith('.'))) rmSync(join(out, f), { recursive: true, force: true });
R.ecrire();
process.exitCode = R.code();
