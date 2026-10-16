// Le carnet sur tous les écrans (CONTRACT § 11) : émulation Playwright de téléphones, tablettes,
// ordinateurs et TV sur la page autonome harness/devices.html (React UMD + bundle.js, Artboards.Carnet).
//
// Pour chaque écran (au repos, couverture puis double page de Julie) :
//   - aucune page hors cadre (les pages cadrées tiennent dans la fenêtre et dans la zone sûre) ;
//   - contrôles visibles et dans les zones sûres (encoches simulées : &insets=) ;
//   - cibles ≥ 44 px sur écran tactile ;
//   - hauteur d'x angulaire ≥ celle de la TV (14 px à 3 m sur une TV de 1,2 m pour 1920 px) :
//     la plus petite hauteur d'x des tokens du cran affiché × l'échelle de la page à l'écran,
//     ramenée à l'angle de vue (téléphone 0,16 mm/px à 30 cm, tablette 0,19 mm/px à 40 cm,
//     ordinateur 0,26 mm/px à 60 cm, TV 1,2 m de large à 3 m) ;
//   - aucun [data-gc-fit="overflow"].
// Interactions (doigt : événements tactiles CDP → Pointer Events « touch » ; souris pour l'ordinateur) :
//   glisser vers l'avant et l'arrière, geste vif court, toucher l'écrin (la tasse se remplit), toucher la
//   marge, lien profond (#rose, puis changement de fragment), rotation portrait → paysage en cours de
//   lecture (on reste sur la même page).
// Captures dans <out>/, planche contact <out>/planche.png, rapport <out>/devices.json + tableau.
//
//   node scripts/verify-devices.mjs [--bundle dist/ds-r1/components] [--out verification/out/r1]
//                                   [--only iphone13-portrait,tv-1080] [--no-interactions]
//                                   [--suites doigt,rotation,reduit,souris]
import { chromium, devices } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serve, ROOT } from './lib/serve.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const bundle = opt('bundle', 'dist/ds-r1/components');
const outDir = resolve(ROOT, opt('out', 'verification/out/r1'));
const only = opt('only')?.split(',').filter(Boolean);
const interactions = !args.includes('--no-interactions');
const suitesVoulues = opt('suites')?.split(',').filter(Boolean); // doigt, rotation, reduit, souris
mkdirSync(outDir, { recursive: true });

// Chromium sans GPU (rastérisation logicielle) : comme scripts/fps.mjs.
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/** Lecture : mm par px CSS et distance de lecture (mm). */
const LECTURE = {
  telephone: { mm: 0.16, dist: 300, libelle: 'téléphone, 30 cm' },
  tablette: { mm: 0.19, dist: 400, libelle: 'tablette, 40 cm' },
  ordinateur: { mm: 0.26, dist: 600, libelle: 'ordinateur, 60 cm' },
  tv: { mm: 1200 / 1920, dist: 3000, libelle: 'TV 1,2 m, 3 m' },
};
/** Référence : 14 px de hauteur d'x sur la TV 1920 px (1,2 m de large) vue à 3 m (mrad). */
const REF_MRAD = ((14 * 1200) / 1920 / 3000) * 1000;

const tel = (d, insets) => ({ ctx: { ...devices[d] }, insets });
const ECRANS = [
  { nom: 'iphone13-portrait', titre: 'iPhone 13 debout', classe: 'telephone', ...tel('iPhone 13', [47, 0, 34, 0]) },
  { nom: 'iphone13-paysage', titre: 'iPhone 13 couché', classe: 'telephone', ...tel('iPhone 13 landscape', [0, 47, 21, 47]) },
  { nom: 'pixel7', titre: 'Pixel 7 debout', classe: 'telephone', ...tel('Pixel 7', [0, 0, 0, 0]) },
  { nom: 'ipad-portrait', titre: 'iPad (7ᵉ gén.) debout', classe: 'tablette', ...tel('iPad (gen 7)', [20, 0, 0, 0]) },
  { nom: 'ipad-paysage', titre: 'iPad (7ᵉ gén.) couché', classe: 'tablette', ...tel('iPad (gen 7) landscape', [20, 0, 0, 0]) },
  { nom: 'ordi-1440', titre: 'Ordinateur 1440 × 900', classe: 'ordinateur', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, insets: [0, 0, 0, 0] },
  { nom: 'ordi-1280', titre: 'Ordinateur 1280 × 800', classe: 'ordinateur', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, insets: [0, 0, 0, 0] },
  { nom: 'tv-1080', titre: 'TV 1920 × 1080', classe: 'tv', ctx: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, insets: [0, 0, 0, 0] },
  { nom: 'tv-4k', titre: 'TV 3840 × 2160 (dpr 1)', classe: 'tv', mm: 1200 / 3840, ctx: { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 }, insets: [0, 0, 0, 0] },
].filter((e) => !only || only.includes(e.nom));

async function lancer() {
  try {
    return await chromium.launch({ args: ARGS });
  } catch (e) {
    const fallback = '/opt/pw-browsers/chromium';
    if (existsSync(fallback)) return chromium.launch({ executablePath: fallback, args: ARGS });
    throw e;
  }
}

const url = (srv, e, hash = '') => `${srv.url}/harness/devices.html?b=${encodeURIComponent(bundle)}&insets=${e.insets.join(',')}${hash}`;

async function ouvrir(context, srv, e, hash) {
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (x) => erreurs.push(String(x)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  await page.goto(url(srv, e, hash));
  await page.waitForFunction(() => window.__gcDevices?.ready === true, null, { timeout: 30000 });
  const err = await page.evaluate(() => window.__gcDevices.error);
  if (err) erreurs.push(err);
  await page.waitForTimeout(500);
  return { page, erreurs };
}

const etat = (page) => page.evaluate(() => window.__gcDevices.etat());
/** Attend l'état voulu (sous rastérisation logicielle, un geste peut prendre plusieurs secondes). */
async function attendreEtat(page, attendu, f = (s) => s, ms = 45000) {
  const t0 = Date.now();
  let s = f(await etat(page));
  while (!Object.entries(attendu).every(([k, v]) => s[k] === v) && Date.now() - t0 < ms) {
    // Demande une image : en émulation, un changement de fenêtre n'est traité qu'à la prochaine image.
    await page.evaluate(() => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 1000); }));
    await page.waitForTimeout(250);
    s = f(await etat(page));
  }
  return s;
}
const calme = (page, ms = 450, debutMax = 4000) => page.evaluate(([a, b]) => window.__gcDevices.attendreCalme(a, b), [ms, debutMax]);

// ---- Mesures au repos ----------------------------------------------------------------------------
async function mesurerRepos(page, e) {
  return page.evaluate(({ insets, tactile }) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const [it, ir, ib, il] = insets;
    const s = document.querySelector('.gc-livre-ecran');
    const cadrage = s?.getAttribute('data-gc-cadrage');
    const cote = s?.getAttribute('data-gc-cote');
    const double = Number(s?.getAttribute('data-gc-double'));
    const livre = document.querySelector('.gc-livre');
    const cs = livre ? getComputedStyle(livre) : null;
    const W = cs ? parseFloat(cs.getPropertyValue('--gc-page-w')) : 0;
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const g = document.querySelector('.gc-livre__emplacement--gauche');
    const d = document.querySelector('.gc-livre__emplacement--droite');
    // Pages cadrées : les deux en « double » (une seule, la droite, couverture fermée), celle du côté en « page ».
    const pages = [];
    if (double === -1) pages.push(['couverture', rect(document.querySelector('.gc-livre-couv') ?? d)]);
    else if (cadrage === 'page') pages.push([cote, rect(cote === 'gauche' ? g : d)]);
    else { pages.push(['gauche', rect(g)]); pages.push(['droite', rect(d)]); }
    const tol = 1;
    const hors = pages.filter(([, r]) => r.x < -tol || r.y < -tol || r.r > vw + tol || r.b > vh + tol).map(([n]) => n);
    // Zone sûre : côtés et haut (le papier peut passer sous la barre d'accueil, pas un contrôle).
    const horsSure = pages.filter(([, r]) => r.x < il - tol || r.y < it - tol || r.r > vw - ir + tol).map(([n]) => n);
    // Contrôles : boutons du calque de l'écran.
    const ctrls = [...document.querySelectorAll('.gc-ecran__controles button')].map((b) => {
      const r = rect(b);
      const st = getComputedStyle(b);
      const visible = r.w > 0 && r.h > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
      const dansSure = r.x >= il - tol && r.y >= it - tol && r.r <= vw - ir + tol && r.b <= vh - ib + tol;
      return { nom: b.getAttribute('aria-label'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), visible, dansSure };
    });
    const fleches = ctrls.filter((c) => /Page (précédente|suivante)/.test(c.nom ?? ''));
    // Hauteur d'x : plus petite valeur des tokens du cran affiché, à l'échelle de la page à l'écran.
    const roles = ['title', 'body', 'note', 'meta', 'signature', 'annotation'];
    const xs = cs ? roles.map((k) => parseFloat(cs.getPropertyValue(`--gc-x-${k}`))).filter((v) => v > 0) : [];
    const xMin = xs.length ? Math.min(...xs) : 0;
    const echelle = W > 0 ? rect(d).w / W : 0;
    return {
      vw, vh, cadrage, cote, double, distance: livre?.closest('[data-gc-distance]')?.getAttribute('data-gc-distance'),
      echelle: Math.round(echelle * 10000) / 10000, xMinToken: xMin, xPx: Math.round(xMin * echelle * 100) / 100,
      pages: pages.map(([n, r]) => ({ n, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })),
      hors, horsSure, controles: ctrls, fleches: fleches.length,
      debordements: document.querySelectorAll('.gc-livre__page--visible [data-gc-fit="overflow"]').length,
      tactile,
    };
  }, { insets: e.insets, tactile: !!e.ctx.hasTouch });
}

function juger(e, m) {
  const lect = LECTURE[e.classe];
  const mm = e.mm ?? lect.mm;
  const mrad = (m.xPx * mm) / lect.dist * 1000;
  const visibles = m.controles.filter((c) => c.visible);
  const ok = (v) => (v ? 'OK' : 'KO');
  return {
    horsCadre: { ok: ok(!m.hors.length && !m.horsSure.length && !m.debordements), detail: [...m.hors.map((n) => `${n} hors fenêtre`), ...m.horsSure.map((n) => `${n} hors zone sûre`), m.debordements ? `${m.debordements} débordement(s)` : ''].filter(Boolean).join(', ') },
    controles: { ok: ok(m.fleches === 2 && visibles.length >= 2 && visibles.every((c) => c.dansSure)), detail: visibles.filter((c) => !c.dansSure).map((c) => `${c.nom} hors zone sûre`).join(', ') },
    cibles: { ok: m.tactile ? ok(visibles.every((c) => c.w >= 44 && c.h >= 44)) : 's.o.', detail: `min ${Math.min(...visibles.map((c) => Math.min(c.w, c.h)))} px` },
    hauteurX: { ok: ok(mrad >= REF_MRAD - 1e-6), px: m.xPx, mrad: Math.round(mrad * 1000) / 1000, ref: Math.round(REF_MRAD * 1000) / 1000, lecture: lect.libelle },
  };
}

// ---- Gestes ----------------------------------------------------------------------------------------
// Les événements portent leur propre horodatage (celui d'un vrai doigt) : sous rastérisation logicielle,
// le navigateur les traite en retard, mais la vitesse mesurée au lâcher reste celle du geste.
async function toucher(cdp, page, x, y) {
  const t0 = Date.now() / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }], timestamp: t0 });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + 0.06 });
}

/** Glisser au doigt de (x0, y0) à (x1, y1) en `ms`, en `n` pas ; `avantLacher` : capture à mi-geste. */
async function glisser(cdp, page, [x0, y0], [x1, y1], { ms = 500, n = 16, avantLacher } = {}) {
  const t0 = Date.now() / 1000;
  const dt = ms / n / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }], timestamp: t0 });
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, id: 1 }], timestamp: t0 + i * dt });
    await page.waitForTimeout(ms / n);
  }
  if (avantLacher) await avantLacher();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + n * dt + 0.008 });
}

async function glisserSouris(page, [x0, y0], [x1, y1], { ms = 500, n = 16 } = {}) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    await page.waitForTimeout(ms / n);
  }
  await page.mouse.up();
}

const centre = async (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}, sel);

/** Niveau de la tasse (%) : attend qu'il dépasse `seuil` (au plus `ms`). */
const remplissage = async (page, seuil = 5, ms = 8000) => {
  const lire = () => page.evaluate(() => Number(document.querySelector('.gc-livre__page--visible .gc-tasse')?.getAttribute('aria-valuenow') ?? -1));
  const t0 = Date.now();
  let v = await lire();
  while (v <= seuil && Date.now() - t0 < ms) { await page.waitForTimeout(250); v = await lire(); }
  return v;
};

async function suiteTactile(browser, srv, e, captures) {
  const ctx = await browser.newContext({ ...e.ctx });
  const { page, erreurs } = await ouvrir(ctx, srv, e, '#julie');
  const cdp = await ctx.newCDPSession(page);
  const res = [];
  const W = page.viewportSize().width;
  const H = page.viewportSize().height;
  const y = H * 0.5;
  const verifier = async (test, attendu, f = (s) => s) => {
    const obtenu = await attendreEtat(page, attendu, f);
    await calme(page, 300, 300);
    const ok = Object.entries(attendu).every(([k, v]) => obtenu[k] === v);
    res.push({ test, attendu, obtenu: Object.fromEntries(Object.keys(attendu).map((k) => [k, obtenu[k]])), ok: ok ? 'OK' : 'KO' });
    return ok;
  };
  const shot = async (nom) => { const f = join(outDir, `${e.nom}-${nom}.png`); await page.screenshot({ path: f, timeout: 120000 }); captures.push(f); };
  const page_ = (await etat(page)).cadrage === 'page';

  // 1. Toucher l'écrin : la lecture démarre, la tasse se remplit.
  const cloche = await centre(page, '.gc-livre__page--visible .gc-sj-cloche');
  if (cloche) {
    await toucher(cdp, page, cloche[0], cloche[1]);
    const niveau = await remplissage(page);
    await verifier('toucher la cloche : lecture', { lecture: 'playing', tasse: true }, (s) => ({ ...s, tasse: niveau > 5 }));
    await shot('lecture');
    await toucher(cdp, page, cloche[0], cloche[1]);
    await page.waitForTimeout(400);
    await verifier('toucher la cloche de nouveau : pause', { lecture: 'idle' });
  }

  if (page_) {
    // 2. Page gauche → glisser vers la gauche : la caméra glisse vers la page droite.
    await glisser(cdp, page, [W * 0.8, y], [W * 0.3, y], { ms: 450, avantLacher: () => shot('glisse-mi') });
    await calme(page);
    await verifier('glisser ← sur la page gauche : page droite', { double: 0, cote: 'droite' });
    await shot('julie-droite');
  }
  // 3. Glisser vers la gauche : la feuille tourne (la caméra la suit en cadrage page).
  await glisser(cdp, page, [W * 0.85, y], [W * 0.2, y], { ms: 700, n: 20, avantLacher: () => shot('tour-mi') });
  await calme(page);
  await verifier('glisser ← : double page suivante', page_ ? { double: 1, cote: 'gauche', hash: '#rose' } : { double: 1, hash: '#rose' });
  await shot('rose');
  // 4. Glisser vers la droite : retour.
  await glisser(cdp, page, [W * 0.2, y], [W * 0.85, y], { ms: 700, n: 20, avantLacher: () => shot('retour-mi') });
  await calme(page);
  await verifier('glisser → : double page précédente', page_ ? { double: 0, cote: 'droite' } : { double: 0 });
  // 5. Geste vif court : ~ 15 % de la largeur en 70 ms.
  await glisser(cdp, page, [W * 0.6, y], [W * 0.45, y], { ms: 70, n: 5 });
  await calme(page);
  await verifier('geste vif court ← : la page tourne', page_ ? { double: 1, cote: 'gauche' } : { double: 1 });
  // 6. Toucher les marges : précédent, puis suivant.
  const marge = await page.evaluate(() => {
    const s = document.querySelector('.gc-livre-ecran');
    const pageMode = s.getAttribute('data-gc-cadrage') === 'page';
    const g = document.querySelector('.gc-livre__emplacement--gauche').getBoundingClientRect();
    const d = document.querySelector('.gc-livre__emplacement--droite').getBoundingClientRect();
    const p = pageMode ? (s.getAttribute('data-gc-cote') === 'gauche' ? g : d) : null;
    const gauche = p ? p.left : g.left;
    const droite = p ? p.right : d.right;
    return { g: gauche + d.width * 0.05, d: droite - d.width * 0.05, y: (g.top + g.bottom) / 2 };
  });
  await toucher(cdp, page, marge.g, marge.y);
  await calme(page);
  await verifier('toucher la marge gauche : page précédente', page_ ? { double: 0, cote: 'droite' } : { double: 0 });
  const marge2 = await page.evaluate(() => {
    const s = document.querySelector('.gc-livre-ecran');
    const pageMode = s.getAttribute('data-gc-cadrage') === 'page';
    const d = document.querySelector('.gc-livre__emplacement--droite').getBoundingClientRect();
    const g = document.querySelector('.gc-livre__emplacement--gauche').getBoundingClientRect();
    const p = pageMode ? (s.getAttribute('data-gc-cote') === 'gauche' ? g : d) : d;
    return { d: p.right - d.width * 0.05, y: (d.top + d.bottom) / 2 };
  });
  await toucher(cdp, page, marge2.d, marge2.y);
  await calme(page);
  await verifier('toucher la marge droite : page suivante', page_ ? { double: 1, cote: 'gauche' } : { double: 1 });
  // 7. Lien profond dans le carnet ouvert : le fragment change, le livre y va.
  await page.evaluate(() => { location.hash = '#mathis'; });
  await calme(page, 450, 6000);
  await verifier('fragment #mathis : double page de Mathis', { double: 2, hash: '#mathis' });
  // Glisser vertical : rien ne bouge (aucun défilement non plus).
  await glisser(cdp, page, [W * 0.5, H * 0.7], [W * 0.52, H * 0.3], { ms: 300 });
  await page.waitForTimeout(400);
  const defile = await page.evaluate(() => window.scrollY + document.scrollingElement.scrollTop);
  await verifier('glisser vertical : rien ne bouge', { double: 2, defilement: 0 }, (s) => ({ ...s, defilement: defile }));
  await ctx.close();

  // 8. Lien profond à l'ouverture.
  const ctx2 = await browser.newContext({ ...e.ctx });
  const o2 = await ouvrir(ctx2, srv, e, '#rose');
  const s2 = await etat(o2.page);
  res.push({ test: 'ouvrir …#rose', attendu: { double: 1 }, obtenu: { double: s2.double, cote: s2.cote }, ok: s2.double === 1 && (s2.cadrage !== 'page' || s2.cote === 'gauche') ? 'OK' : 'KO' });
  const o3 = await ouvrir(ctx2, srv, e, '#inconnu');
  const s3 = await etat(o3.page);
  res.push({ test: 'ouvrir …#inconnu : couverture', attendu: { double: -1 }, obtenu: { double: s3.double }, ok: s3.double === -1 ? 'OK' : 'KO' });
  erreurs.push(...o2.erreurs, ...o3.erreurs);
  await ctx2.close();
  return { tests: res, erreurs };
}

/** Rotation en cours de lecture : portrait → paysage → portrait, la page et la lecture restent. */
async function suiteRotation(browser, srv, e, captures) {
  const ctx = await browser.newContext({ ...e.ctx });
  const { page, erreurs } = await ouvrir(ctx, srv, e, '#julie');
  const cdp = await ctx.newCDPSession(page);
  const res = [];
  const vp = page.viewportSize();
  const cloche = await centre(page, '.gc-livre__page--visible .gc-sj-cloche');
  await toucher(cdp, page, cloche[0], cloche[1]);
  await page.waitForTimeout(800);
  await page.setViewportSize({ width: vp.height, height: vp.width });
  let s = await attendreEtat(page, { cadrage: 'double' }, (x) => x, 90000);
  res.push({ test: 'rotation → paysage en cours de lecture', attendu: { double: 0, cadrage: 'double', lecture: 'playing' }, obtenu: { double: s.double, cadrage: s.cadrage, lecture: s.lecture }, ok: s.double === 0 && s.cadrage === 'double' && s.lecture === 'playing' ? 'OK' : 'KO' });
  let f = join(outDir, `${e.nom}-rotation-paysage.png`);
  await page.screenshot({ path: f, timeout: 120000 });
  captures.push(f);
  await page.setViewportSize(vp);
  s = await attendreEtat(page, { cadrage: 'page' }, (x) => x, 90000);
  res.push({ test: 'retour en portrait : même page', attendu: { double: 0, cadrage: 'page', cote: 'gauche', lecture: 'playing' }, obtenu: { double: s.double, cadrage: s.cadrage, cote: s.cote, lecture: s.lecture }, ok: s.double === 0 && s.cadrage === 'page' && s.cote === 'gauche' && s.lecture === 'playing' ? 'OK' : 'KO' });
  // (la lecture simulée repeint la page à chaque image : on la met en pause avant la capture)
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  f = join(outDir, `${e.nom}-rotation-retour.png`);
  await page.screenshot({ path: f, timeout: 120000 });
  captures.push(f);
  await ctx.close();
  return { tests: res, erreurs };
}

/** Souris (ordinateur) : glisser pour tourner, clic sur la cloche. */
async function suiteSouris(browser, srv, e) {
  const ctx = await browser.newContext({ ...e.ctx });
  const { page, erreurs } = await ouvrir(ctx, srv, e, '#julie');
  const res = [];
  const { width: W, height: H } = page.viewportSize();
  await glisserSouris(page, [W * 0.8, H * 0.5], [W * 0.35, H * 0.5], { ms: 500 });
  let s = await attendreEtat(page, { double: 1 });
  await calme(page);
  res.push({ test: 'souris : glisser ← tourne la page', attendu: { double: 1 }, obtenu: { double: s.double }, ok: s.double === 1 ? 'OK' : 'KO' });
  await glisserSouris(page, [W * 0.3, H * 0.5], [W * 0.75, H * 0.5], { ms: 500 });
  s = await attendreEtat(page, { double: 0 });
  await calme(page);
  res.push({ test: 'souris : glisser → revient', attendu: { double: 0 }, obtenu: { double: s.double }, ok: s.double === 0 ? 'OK' : 'KO' });
  const cloche = await centre(page, '.gc-livre__page--visible .gc-sj-cloche');
  await page.mouse.click(cloche[0], cloche[1]);
  s = await attendreEtat(page, { lecture: 'playing' }, (x) => x, 10000);
  res.push({ test: 'souris : clic sur la cloche', attendu: { lecture: 'playing' }, obtenu: { lecture: s.lecture }, ok: s.lecture === 'playing' ? 'OK' : 'KO' });
  await page.keyboard.press('Enter'); // pause (la lecture simulée repeint à chaque image)
  await page.keyboard.press('ArrowRight');
  s = await attendreEtat(page, { double: 1 });
  res.push({ test: 'clavier → : double page suivante', attendu: { double: 1 }, obtenu: { double: s.double }, ok: s.double === 1 ? 'OK' : 'KO' });
  await ctx.close();
  return { tests: res, erreurs };
}

/** Moins de mouvement : un glisser tourne la page en fondu, sans feuillet. */
async function suiteReduite(browser, srv, e) {
  const ctx = await browser.newContext({ ...e.ctx, reducedMotion: 'reduce' });
  const { page, erreurs } = await ouvrir(ctx, srv, e, '#julie');
  const cdp = await ctx.newCDPSession(page);
  const { width: W, height: H } = page.viewportSize();
  await glisser(cdp, page, [W * 0.8, H * 0.5], [W * 0.3, H * 0.5], { ms: 300 });
  await attendreEtat(page, { cote: 'droite' }, (x) => x, 20000);
  await glisser(cdp, page, [W * 0.8, H * 0.5], [W * 0.3, H * 0.5], { ms: 300 });
  const s = await attendreEtat(page, { double: 1 }, (x) => x, 20000);
  const feuillet = await page.evaluate(() => document.querySelectorAll('.gc-livre-feuillet').length);
  await ctx.close();
  return { tests: [{ test: 'moins de mouvement : 2 glisser ← = 2 pages, aucun feuillet', attendu: { double: 1, cote: 'gauche', feuillets: 0 }, obtenu: { double: s.double, cote: s.cote, feuillets: feuillet }, ok: s.double === 1 && s.cote === 'gauche' && feuillet === 0 ? 'OK' : 'KO' }], erreurs };
}

// ---- Planche contact -------------------------------------------------------------------------------
async function planche(browser, srv, tuiles) {
  const page = await browser.newPage({ viewport: { width: 2400, height: 100 }, deviceScaleFactor: 1 });
  const rel = (f) => `${srv.url}/${f.replace(ROOT + '/', '')}`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#2b211b;font:15px/1.3 system-ui,sans-serif;color:#efe4d2}
    .g{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;padding:24px}
    figure{margin:0;background:#1d1612;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px}
    .i{height:330px;display:flex;align-items:center;justify-content:center}
    img{max-width:100%;max-height:330px;box-shadow:0 2px 8px #0008}
    figcaption{font-size:14px;opacity:.85}
    h1{margin:24px 24px 0;font-size:22px;font-weight:600}
  </style><h1>Le carnet sur tous les écrans — verify-devices</h1><div class="g">${tuiles.map(([f, t]) => `<figure><div class="i"><img src="${rel(f)}"></div><figcaption>${t}</figcaption></figure>`).join('')}</div>`;
  await page.setContent(html);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 2400, height: h });
  const f = join(outDir, 'planche.png');
  await page.screenshot({ path: f, fullPage: true });
  await page.close();
  return f;
}

// ---- Programme -------------------------------------------------------------------------------------
const srv = await serve();
const browser = await lancer();
const rapport = { date: new Date().toISOString(), bundle, refMrad: Math.round(REF_MRAD * 1000) / 1000, ecrans: [], interactions: [] };
const tuiles = [];
const captures = [];
for (const e of ECRANS) {
  const ctx = await browser.newContext({ ...e.ctx });
  const ligne = { nom: e.nom, titre: e.titre, viewport: e.ctx.viewport, dpr: e.ctx.deviceScaleFactor, tactile: !!e.ctx.hasTouch, insets: e.insets, erreurs: [] };
  // Couverture
  const a = await ouvrir(ctx, srv, e, '');
  const fc = join(outDir, `${e.nom}-couverture.png`);
  await a.page.screenshot({ path: fc });
  ligne.couverture = await mesurerRepos(a.page, e);
  ligne.erreurs.push(...a.erreurs);
  await a.page.close();
  // Julie
  const b = await ouvrir(ctx, srv, e, '#julie');
  const fj = join(outDir, `${e.nom}-julie.png`);
  await b.page.screenshot({ path: fj });
  const m = await mesurerRepos(b.page, e);
  ligne.julie = m;
  ligne.erreurs.push(...b.erreurs);
  await b.page.close();
  await ctx.close();
  ligne.criteres = juger(e, m);
  const jc = juger(e, ligne.couverture);
  ligne.criteres.horsCadre.ok = ligne.criteres.horsCadre.ok === 'OK' && jc.horsCadre.ok === 'OK' ? 'OK' : 'KO';
  ligne.criteres.controles.ok = ligne.criteres.controles.ok === 'OK' && jc.controles.ok === 'OK' ? 'OK' : 'KO';
  rapport.ecrans.push(ligne);
  tuiles.push([fc, `${e.titre} — couverture (${m.cadrage})`], [fj, `${e.titre} — Julie · échelle ${m.echelle} · x ${m.xPx} px`]);
  const c = ligne.criteres;
  console.log(`■ ${e.titre.padEnd(26)} ${String(m.vw).padStart(4)}×${String(m.vh).padEnd(4)} ${m.cadrage.padEnd(6)} cran ${String(m.distance).padEnd(7)} s=${m.echelle}  hors cadre ${c.horsCadre.ok} · contrôles ${c.controles.ok} · cibles ${c.cibles.ok} · x ${c.hauteurX.px}px ${c.hauteurX.mrad}/${c.hauteurX.ref} mrad ${c.hauteurX.ok}${ligne.erreurs.length ? `  ✗ ${ligne.erreurs.join(' | ')}` : ''}`);
  if (c.horsCadre.detail || c.controles.detail) console.log(`    ${[c.horsCadre.detail, c.controles.detail].filter(Boolean).join(' · ')}`);
}

if (interactions) {
  const suites = [
    ['iphone13-portrait', 'doigt, cadrage page', (e) => suiteTactile(browser, srv, e, captures), 'doigt'],
    ['iphone13-portrait', 'rotation', (e) => suiteRotation(browser, srv, e, captures), 'rotation'],
    ['iphone13-portrait', 'moins de mouvement', (e) => suiteReduite(browser, srv, e), 'reduit'],
    ['ipad-paysage', 'doigt, cadrage double', (e) => suiteTactile(browser, srv, e, captures), 'doigt'],
    ['ordi-1440', 'souris et clavier', (e) => suiteSouris(browser, srv, e), 'souris'],
  ];
  for (const [nom, titre, f, cle] of suites) {
    if (suitesVoulues && !suitesVoulues.includes(cle)) continue;
    const e = ECRANS.find((x) => x.nom === nom) ?? (only ? null : undefined);
    if (!e) continue;
    const r = await f(e);
    rapport.interactions.push({ ecran: nom, suite: titre, ...r });
    console.log(`\n■ Interactions — ${e.titre} (${titre})`);
    for (const t of r.tests) console.log(`  ${t.ok}  ${t.test}  ${JSON.stringify(t.obtenu)}`);
    if (r.erreurs.length) console.log(`  erreurs : ${r.erreurs.join(' | ')}`);
  }
  for (const f of captures) tuiles.push([f, f.split('/').pop().replace(/\.png$/, '')]);
}

rapport.planche = (await planche(browser, srv, tuiles)).replace(ROOT + '/', '');
await browser.close();
await srv.close();

// Tableau
const lignes = ['| Écran | Fenêtre | Cadrage | Cran | Échelle | Hors cadre | Contrôles | Cibles ≥ 44 | Hauteur d\'x (mrad, réf. ' + rapport.refMrad + ') |', '|---|---|---|---|---|---|---|---|---|'];
for (const l of rapport.ecrans) {
  const c = l.criteres;
  lignes.push(`| ${l.titre} | ${l.julie.vw}×${l.julie.vh} @${l.dpr} | ${l.julie.cadrage} | ${l.julie.distance} | ${l.julie.echelle} | ${c.horsCadre.ok} | ${c.controles.ok} | ${c.cibles.ok} | ${c.hauteurX.ok} ${c.hauteurX.mrad} (${c.hauteurX.px} px, ${c.hauteurX.lecture}) |`);
}
rapport.tableau = lignes.join('\n');
writeFileSync(join(outDir, 'devices.json'), JSON.stringify(rapport, null, 2));
console.log(`\n${rapport.tableau}\n\nplanche : ${rapport.planche}\nrapport : ${join(outDir, 'devices.json').replace(ROOT + '/', '')}`);
const ko = rapport.ecrans.some((l) => Object.values(l.criteres).some((c) => c.ok === 'KO')) || rapport.interactions.some((s) => s.tests.some((t) => t.ok === 'KO'));
process.exit(ko ? 1 : 0);
