// Fluidité du livre : tourne-page, ouverture de la couverture, cran de caméra, zoom fin, et (plan v3)
// tourne-page avec une photo collée sur la feuille, envol de la photo (Soulever). Pour chaque scénario :
//   1. mesure (processeur ralenti ×4 par CDP) : temps de frame p50/p95/p99 échantillonnés par rAF,
//      frames > 25 ms, nombre de Layout / Paint / recalculs de style PENDANT le geste (trace
//      devtools.timeline bornée par les marques gc-geste-debut-<type> / gc-geste-fin-<type>),
//      Performance.getMetrics (de l'appui à la fin), propriétés CSS modifiées pendant le geste
//      (styles en ligne, classes, nœuds ajoutés, animations en cours) ;
//   2. nombre de calques pendant le geste (CDP LayerTree, passe à part) ;
//   3. vidéo webm 960×540 (recordVideo) d'une petite chorégraphie, en compositing logiciel
//      (--disable-gpu : sous SwiftShader, la capture ne suit pas le mouvement) ;
//   4. captures figées à mi-geste (banc harness/motion.html, scénario pose).
// Exigences (CONTRACT § 10, plan v3), en KO pour turn, open, turn-photo et envol, en INFO ailleurs :
//   0 Layout et ≤ 2 Paint pendant le geste, transform / opacity seulement, ≤ 44 calques (PLAFOND_CALQUES).
//   Les Paint d'une vidéo qui joue (nœud VIDEO, et autant de Paint de la racine du document) sont
//   comptés à part : en rendu logiciel, chaque image de la vidéo est un Paint, sans rapport avec l'envol.
// Bornes du geste : les événements « gc-livre-geste » du livre ; pour l'envol (pas d'événement
// propre), début = 2 images après [data-gc-soulever="ouvert"], fin = 8 images sans mutation de style
// ni animation en cours.
// L'instrumentation est posée par ce script (addInitScript) : n'importe quel banc convient.
//   - turn, open, camera, zoom, reduit : harness/motion.html (livre factice) ;
//   - turn-photo : harness/motion.html?…&photo=1 (photo collée factice au verso de la feuille qui tourne),
//     ou le vrai carnet : --banc-photo 'harness/devices.html#rose' --touche-photo ArrowLeft (la page gauche
//     de Rose, avec sa photo, tourne vers Julie) ;
//   - envol : --banc-envol <url>, défaut le carnet harness/devices.html#julie (photo [data-gc-objet="photo"]
//     cliquée ; --envol-objet feuillet pour le coin du feuillet) ; harness/banc-soulever.html pour le banc
//     factice. Sans l'objet : ATTENTE.
// Plan v4 (lot A, livre vivant), en KO aussi :
//   - coin : glisser tactile CDP en diagonale depuis l'angle bas droit (le coin suit le doigt, puis le
//     tourne-page 3D prend le relais) ; fenêtre = du début du « coin » à la fin de la « page » ;
//   - survol : la souris entre dans l'angle (le coin se lève), puis en sort (il retombe) ;
//   - riffle : touche Fin depuis la double page 1 (feuilles légères + feuille finale) ;
//   - arrivee : le livre glisse sur la table et se pose (banc motion.html?scenario=arrivee, Entrée le monte) ;
//   - lien : harness/devices.html#bernard chargé à froid : arrivée, ouverture, feuilletage ; ≤ 2,2 s du
//     premier début à la dernière fin ; puis, à part, un toucher à 0,5 s doit atterrir en ≤ 300 ms.
// Chromium sans GPU : --use-angle=swiftshader --enable-unsafe-swiftshader. Les i/s absolus y sont peu
// fiables ; ce qui compte : aucun Layout pendant le geste, des frames régulières.
//
//   node scripts/fps.mjs [--scenarios turn,open,camera,zoom,reduit,turn-photo,envol,coin,survol,riffle,arrivee,lien] [--throttle 4]
//        [--bundle dist/ds-t/components] [--banc-photo url] [--touche-photo ArrowLeft] [--banc-envol url]
//        [--envol-objet photo|feuillet] [--banc url (les deux)]
//        [--out verification/out/t/fps] [--no-video] [--no-poses] [--banc-lien 'harness/devices.html#bernard']
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serve, ROOT, lireArgs, Rapport, rectDe, attendrePret, bundleParDefaut, rel, cdpDe } from './lib/verif.mjs';

// Plafond de calques composités pendant un geste (CONTRACT § 10) : 36 sans lumière, + 4 feu, + 4 bougie.
const PLAFOND_CALQUES = 44;

const { opt, drapeau, liste } = lireArgs();
const scenarios = liste('scenarios', 'turn,open,camera,zoom,reduit');
const throttle = Number(opt('throttle', 4));
const bundle = opt('bundle', bundleParDefaut());
const outDir = resolve(ROOT, opt('out', 'verification/out/t/fps'));
const video = !drapeau('no-video');
const poses = !drapeau('no-poses');
mkdirSync(outDir, { recursive: true });

const W = 1920, H = 1080;
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'];
// Vidéo : sous SwiftShader, la capture d'écran CDP de recordVideo ne reçoit presque aucune image
// pendant un mouvement ; en compositing logiciel, elle suit (≈ 12 images capturées par seconde).
const ARGS_VIDEO = ['--disable-gpu', '--mute-audio'];
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing'];
const PERMIS = new Set(['transform', 'opacity', 'will-change', 'visibility', 'pointer-events', 'translate', 'rotate', 'scale', 'transform-origin']);
const PHOTO = '[data-gc-objet="photo"]';
const OBJET_ENVOL = `[data-gc-objet="${opt('envol-objet', 'photo')}"]`;

const bancPhoto = opt('banc-photo', opt('banc', 'harness/motion.html?scenario=turn&index=1&photo=1'));
const touchePhoto = opt('touche-photo', 'ArrowRight');
const bancEnvol = opt('banc-envol', opt('banc', 'harness/devices.html#julie'));
const bancLien = opt('banc-lien', 'harness/devices.html#bernard');
/** Lien profond : durée maximale de la séquence et de l'atterrissage après un toucher (ms). */
const LIEN_MAX_MS = 2200;
const SAUT_MAX_MS = 300;

// Scénarios : banc, déclencheur (touche ou clic sur un sélecteur), type du geste, chorégraphie vidéo.
// [touche] : appui puis attente du calme · [touche, ms] : appui puis pause · [ms] : pause · ['@'] : déclencheur.
const SCENARIOS = {
  turn: {
    titre: 'Tourne-page (double page 2 → 3)', banc: 'harness/motion.html?scenario=turn&index=1', touche: 'ArrowRight', type: 'page', exigences: true,
    video: [[600], ['ArrowRight'], ['ArrowLeft'], ['ArrowRight', 150], ['ArrowRight', 150], ['ArrowRight'], ['PageUp'], ['End']],
  },
  open: {
    titre: 'Ouverture de la couverture', banc: 'harness/motion.html?scenario=open', touche: 'ArrowRight', type: 'couverture', exigences: true,
    video: [[600], ['ArrowRight'], ['ArrowRight'], ['ArrowLeft'], ['ArrowLeft']],
  },
  camera: {
    titre: 'Cran de caméra (moyenne → loin), transition de vue', banc: 'harness/motion.html?scenario=camera&index=1', touche: '-', type: 'distance',
    video: [[600], ['-'], ['+'], ['+'], ['-']],
  },
  zoom: {
    titre: 'Zoom fin (95 % → 100 %)', banc: 'harness/motion.html?scenario=zoom&index=1', touche: '0', type: 'zoom',
    video: [[600], ['0'], ...Array(4).fill(['Alt+=', 110]), ['Alt+='], ...Array(9).fill(['Alt+-', 110]), ['Alt+-'], ['0']],
  },
  reduit: {
    titre: 'Moins de mouvement : fondu court', banc: 'harness/motion.html?scenario=turn&index=1', touche: 'ArrowRight', type: 'fondu', reduced: true,
    video: [[600], ['ArrowRight'], ['ArrowRight'], ['ArrowLeft']],
  },
  'turn-photo': {
    titre: 'Tourne-page avec une photo collée sur la feuille', banc: bancPhoto, touche: touchePhoto, type: 'page', exigences: true, requiertApres: PHOTO,
    video: [[600], [touchePhoto], [touchePhoto === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'], [touchePhoto]],
  },
  envol: {
    titre: `Envol ${OBJET_ENVOL === PHOTO ? 'de la photo' : 'du feuillet'} (Soulever)`, banc: bancEnvol, clic: OBJET_ENVOL, type: 'envol', exigences: true, requiert: OBJET_ENVOL,
    video: [[600], ['@'], [1600], ['Escape'], [1400], ['@'], [1200], ['Escape'], [1200]],
  },
  // ---- Plan v4 : le livre vivant (lot A) ----
  coin: {
    titre: 'Coin qui suit le doigt (diagonale tactile, relais vers le tourne-page 3D)', banc: 'harness/motion.html?scenario=turn&index=1', geste: 'coin', type: ['coin', 'page'], exigences: true, tactile: true,
    video: [[700], ['@'], [1300], ['@'], [1300]],
  },
  survol: {
    titre: 'Survol d\'un coin à la souris (il se lève, puis retombe)', banc: 'harness/motion.html?scenario=turn&index=1', geste: 'survol', type: 'coin', exigences: true,
    video: [[700], ['@'], [900], ['@'], [900]],
  },
  riffle: {
    titre: 'Feuilletage (Fin depuis la double page 1)', banc: 'harness/motion.html?scenario=turn&index=0', touche: 'End', type: 'riffle', exigences: true,
    video: [[600], ['End'], ['Home'], ['ArrowRight'], ['End']],
  },
  arrivee: {
    titre: 'Arrivée du livre sur la table', banc: 'harness/motion.html?scenario=arrivee', touche: 'Enter', type: 'arrivee', exigences: true,
    video: [[500], ['Enter'], [900], ['ArrowRight']],
  },
};

const POSES = [
  ['turn-p25', 'scenario=pose&index=1&vers=2&p=0.25'],
  ['turn-p50', 'scenario=pose&index=1&vers=2&p=0.5'],
  ['turn-p75', 'scenario=pose&index=1&vers=2&p=0.75'],
  ['back-p50', 'scenario=pose&index=2&vers=1&p=0.5'],
  ['open-p25', 'scenario=pose&index=-1&vers=0&p=0.25'],
  ['open-p50', 'scenario=pose&index=-1&vers=0&p=0.5'],
  ['open-p75', 'scenario=pose&index=-1&vers=0&p=0.75'],
  ['photo-p50', 'scenario=pose&index=1&vers=2&p=0.5&photo=1'],
  ['repos-ferme', 'scenario=open'],
  ['repos-proche', 'scenario=turn&index=1&distance=proche'],
  ['repos-moyenne', 'scenario=turn&index=1&distance=moyenne'],
  ['repos-loin', 'scenario=turn&index=1&distance=loin'],
  // Plan v4 : coin, arrivée, feuilletage figés.
  ['coin-leve', 'scenario=pose&index=1&coin=droite,bas,0.975,0.98'],
  ['coin-bas', 'scenario=pose&index=1&coin=droite,bas,0.74,0.82'],
  ['coin-diagonale', 'scenario=pose&index=1&coin=droite,bas,0.56,0.6'],
  ['coin-relais', 'scenario=pose&index=1&coin=droite,bas,0.46,0.55'],
  ['coin-haut-gauche', 'scenario=pose&index=2&coin=gauche,haut,0.7,0.14'],
  ['arrivee-20', 'scenario=pose&index=-1&arrivee=0.2'],
  ['arrivee-60', 'scenario=pose&index=-1&arrivee=0.6'],
  ['arrivee-95', 'scenario=pose&index=-1&arrivee=0.95'],
  ['riffle-r35', 'scenario=pose&index=0&vers=5&p=0.05&r=0.35'],
  ['riffle-r70', 'scenario=pose&index=0&vers=5&p=0.25&r=0.7'],
  ['riffle-r100', 'scenario=pose&index=0&vers=5&p=0.6&r=1'],
];

// ---- Instrumentation (addInitScript) --------------------------------------------------------------
// window.__gcFps { arm(), waitEnd(type), attendreCalme(), armerEnvol() } : frames (rAF), gestes du livre
// (+ performance.mark), mutations de style / classe / DOM et propriétés des animations en cours.
function INIT_FPS() {
  if (window.__gcFps) return;
  const F = (window.__gcFps = { frames: [], gestes: [], journal: [], actifs: [], mutations: [], anims: {}, sampling: false });
  const noter = (d, startTime) => {
    F.gestes.push(d);
    F.journal.push(d);
    if (d.phase === 'fin') F.actifs = F.actifs.filter((t) => t !== d.type);
    else if (!F.actifs.includes(d.type)) F.actifs.push(d.type);
    try { performance.mark(`gc-geste-${d.phase}-${d.type}`, startTime != null ? { startTime } : undefined); } catch { performance.mark(`gc-geste-${d.phase}-${d.type}`); }
  };
  document.addEventListener('gc-livre-geste', (e) => noter({ ...e.detail, t: performance.now() }));

  let scratch = null;
  const props = (css) => {
    scratch ??= document.createElement('div');
    scratch.style.cssText = css || '';
    const o = {};
    for (let i = 0; i < scratch.style.length; i++) { const p = scratch.style[i]; o[p] = scratch.style.getPropertyValue(p); }
    return o;
  };
  let derniereMutation = 0;
  const mo = new MutationObserver((liste) => {
    const t = performance.now();
    derniereMutation = t;
    if (!F.sampling) return;
    for (const m of liste) {
      if (m.type === 'childList') { if (m.addedNodes.length || m.removedNodes.length) F.mutations.push({ t, props: ['@dom'] }); continue; }
      if (m.attributeName === 'class') { F.mutations.push({ t, props: ['@class'] }); continue; }
      const a = props(m.oldValue);
      const b = props(m.target.getAttribute('style'));
      const ch = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
      if (ch.length) F.mutations.push({ t, props: ch });
    }
  });
  const observer = () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class'] });
  if (document.documentElement) observer(); else document.addEventListener('DOMContentLoaded', observer);

  // document.getAnimations() remet le style à jour : appelé à chaque image, il perturbe la mesure
  // (des Paint en plus) ; on ne l'appelle qu'une image sur 6.
  const animsEnCours = () => document.getAnimations().filter((a) => a.playState === 'running');
  F.arm = () => {
    F.frames = []; F.gestes = []; F.mutations = []; F.anims = {}; F.sampling = true;
    let n = 0;
    const loop = (t) => {
      if (!F.sampling) return;
      F.frames.push(t);
      if (n++ % 6 === 0) for (const a of animsEnCours()) {
        const ps = a.transitionProperty ? [a.transitionProperty] : (a.effect?.getKeyframes?.() ?? []).flatMap((k) => Object.keys(k)).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p));
        for (const p of new Set(ps)) F.anims[p] = (F.anims[p] ?? []).concat(t).slice(-400);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  F.waitEnd = (type, timeout = 20000) => new Promise((resolve) => {
    const t0 = performance.now();
    const check = () => {
      const fin = F.gestes.find((g) => g.phase === 'fin' && (!type || g.type === type));
      if (fin || performance.now() - t0 > timeout) {
        setTimeout(() => { F.sampling = false; resolve({ frames: F.frames.slice(), gestes: F.gestes.slice(), mutations: F.mutations.slice(), anims: F.anims, timeout: !fin }); }, 250);
        return;
      }
      setTimeout(check, 30);
    };
    check();
  });
  F.attendreCalme = (calme = 700, debutMax = 6000) => new Promise((resolve) => {
    const n0 = F.journal.length;
    const t0 = performance.now();
    let depuis = 0;
    const tick = () => {
      const now = performance.now();
      const parti = F.journal.length > n0 || now - t0 > debutMax;
      if (parti && F.actifs.length === 0) {
        if (!depuis) depuis = now;
        if (now - depuis >= calme) return resolve(now - t0);
      } else depuis = 0;
      setTimeout(tick, 40);
    };
    tick();
  });
  // Envol : le prochain geste de confiance (pointerup, click, keydown) ouvre la mesure. Si le calque porte
  // data-gc-phase (lot S : ferme → envol → ouvert), le vol va de « envol » à sa sortie ; sinon : 2 images
  // après [data-gc-soulever="ouvert"], jusqu'à 8 images sans mutation ni animation (fin datée à la 1re).
  let envolArme = false;
  F.armerEnvol = () => { envolArme = true; };
  const surGeste = (e) => {
    if (!envolArme || !e.isTrusted) return;
    envolArme = false;
    const t0 = performance.now();
    let etape = 'attente';
    let images = 0;
    let calmes = 0;
    let premierCalme = 0;
    const phaseDe = () => document.querySelector('[data-gc-soulever][data-gc-phase]')?.getAttribute('data-gc-phase') ?? null;
    let parPhase = false;
    const tick = (t) => {
      const ouvert = document.querySelector('[data-gc-soulever="ouvert"]');
      if (etape === 'attente') {
        if (ouvert) { etape = 'ouvert'; images = 0; parPhase = phaseDe() === 'envol'; }
        else if (t - t0 > 4000) { noter({ phase: 'fin', type: 'envol', t: performance.now(), echec: 'jamais ouvert' }); return; }
      } else if (etape === 'ouvert') {
        if (++images >= 2) { etape = 'vol'; noter({ phase: 'debut', type: 'envol', t: performance.now(), bornes: parPhase ? 'data-gc-phase' : 'immobilité' }); }
      } else if (parPhase) {
        if (phaseDe() !== 'envol' || t - t0 > 8000) { const fin = performance.now(); noter({ phase: 'fin', type: 'envol', t: fin }, fin); return; }
      } else {
        const tranquille = performance.now() - derniereMutation > 20 && (images++ % 3 !== 0 || animsEnCours().length === 0);
        if (tranquille) { if (!calmes) premierCalme = performance.now(); calmes++; } else calmes = 0;
        if (calmes >= 8 || t - t0 > 8000) { const fin = premierCalme || performance.now(); noter({ phase: 'fin', type: 'envol', t: fin }, fin); return; }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  for (const t of ['pointerup', 'click', 'keydown']) window.addEventListener(t, surGeste, true);
}

async function lancer(args = ARGS) {
  try {
    return await chromium.launch({ args });
  } catch (e) {
    const fallback = '/opt/pw-browsers/chromium';
    if (existsSync(fallback)) return chromium.launch({ executablePath: fallback, args });
    throw e;
  }
}

function urlDe(srv, banc, extra = '') {
  if (/^https?:\/\//.test(banc)) return banc;
  const u = new URL(`${srv.url}/${banc.replace(/^\//, '')}`);
  if (/harness\//.test(u.pathname) && !u.searchParams.has('b')) u.searchParams.set('b', bundle);
  for (const [k, v] of new URLSearchParams(extra)) u.searchParams.set(k, v);
  return u.toString();
}

async function ouvrir(context, srv, banc, extra) {
  await context.addInitScript(INIT_FPS);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(urlDe(srv, banc, extra));
  const err = await attendrePret(page).catch((x) => `banc jamais prêt : ${String(x).split('\n')[0]}`);
  if (err) errors.push(err);
  await page.waitForTimeout(300);
  return { page, errors };
}

/** Glisser tactile (CDP) en diagonale depuis l'angle bas droit de la page de droite : le coin suit le doigt. */
async function diagonaleCoin(page, { pose = 220, ms = 650, n = 26 } = {}) {
  const r = await rectDe(page, '.gc-livre__emplacement--droite');
  if (!r) return false;
  const cdp = await cdpDe(page);
  const [x0, y0] = [r.r - r.w * 0.035, r.b - r.h * 0.035];
  const [x1, y1] = [r.x + r.w * 0.1, r.y + r.h * 0.42];
  const t0 = Date.now() / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }], timestamp: t0 });
  await page.waitForTimeout(pose); // le doigt se pose : le coin se lève
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const e = t * t * (3 - 2 * t);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * e, y: y0 + (y1 - y0) * e, id: 1 }], timestamp: t0 + (pose + (i * ms) / n) / 1000 });
    await page.waitForTimeout(ms / n);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + (pose + ms) / 1000 + 0.008 });
  return true;
}

/** Souris : du milieu de la page vers l'angle bas droit (le coin se lève), puis on en sort (il retombe). */
async function survolCoin(page, { tenir = 700 } = {}) {
  const r = await rectDe(page, '.gc-livre__emplacement--droite');
  if (!r) return false;
  const [xa, ya] = [r.x + r.w * 0.5, r.y + r.h * 0.5];
  const [xc, yc] = [r.r - r.w * 0.05, r.b - r.h * 0.05];
  await page.mouse.move(xa, ya);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(xa + ((xc - xa) * i) / 10, ya + ((yc - ya) * i) / 10); await page.waitForTimeout(16); }
  await page.waitForTimeout(tenir);
  for (let i = 1; i <= 6; i++) { await page.mouse.move(xc - ((xc - xa) * i) / 6, yc - ((yc - ya) * i) / 6); await page.waitForTimeout(16); }
  return true;
}

async function declencher(page, sc) {
  if (sc.type === 'envol') await page.evaluate(() => window.__gcFps.armerEnvol());
  if (sc.geste === 'coin') return diagonaleCoin(page);
  if (sc.geste === 'survol') return survolCoin(page);
  if (sc.clic) {
    const r = await rectDe(page, sc.clic);
    if (!r) return false;
    await page.mouse.click(r.cx, r.cy);
  } else await page.keyboard.press(sc.touche);
  return true;
}

const quantile = (xs, q) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
};
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const metrics = (res) => Object.fromEntries(res.metrics.map((m) => [m.name, m.value]));

// ---- 1. Mesure ------------------------------------------------------------------------------
const typesDe = (sc) => (Array.isArray(sc.type) ? sc.type : [sc.type]);
const contexteDe = (browser, sc, extra = {}) => browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: sc.reduced ? 'reduce' : 'no-preference', ...(sc.tactile ? { hasTouch: true } : null), ...extra });

async function mesurer(browser, srv, nom, sc) {
  const context = await contexteDe(browser, sc);
  const { page, errors } = await ouvrir(context, srv, sc.banc);
  if (sc.requiert && !(await rectDe(page, sc.requiert))?.visible) {
    await context.close();
    return { scenario: nom, titre: sc.titre, attente: `${sc.requiert} absent du banc ${sc.banc}`, erreurs: errors };
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.waitForTimeout(800);
  const m0 = metrics(await cdp.send('Performance.getMetrics'));
  await browser.startTracing(page, { categories: CATEGORIES });
  await page.evaluate(() => window.__gcFps.arm());
  const types = typesDe(sc);
  await declencher(page, sc);
  const res = await page.evaluate((type) => window.__gcFps.waitEnd(type), types[types.length - 1]);
  const buf = await browser.stopTracing();
  const m1 = metrics(await cdp.send('Performance.getMetrics'));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // La photo était sur la feuille qui a tourné : elle est sur la page d'arrivée.
  const photoApres = sc.requiertApres ? (await rectDe(page, sc.requiertApres))?.visible : true;
  // Nœud de chaque Paint (backendNodeId de la trace) : une vidéo qui joue peint à chaque image en
  // rendu logiciel (VIDEO, et la racine du document avec elle) ; on les compte à part.
  const evTrace = JSON.parse(buf.toString()).traceEvents;
  const noeuds = {};
  try {
    await cdp.send('DOM.getDocument', { depth: -1 });
    for (const id of new Set(evTrace.filter((e) => e.name === 'Paint').map((e) => e.args?.data?.nodeId).filter((x) => x != null))) {
      const d = await cdp.send('DOM.describeNode', { backendNodeId: id }).catch(() => null);
      noeuds[id] = d?.node?.nodeName ?? '?';
    }
  } catch { /* DOM indisponible */ }
  await context.close();
  if (!photoApres) return { scenario: nom, titre: sc.titre, attente: `${sc.requiertApres} absent de la page d'arrivée (${sc.banc})`, erreurs: errors };

  // Bornes du geste : marques gc-geste-debut/fin-<type> (horloge de la trace, µs).
  const ev = evTrace;
  const marque = (n) => ev.filter((e) => e.name === n && String(e.cat).includes('blink.user_timing')).map((e) => e.ts).sort((a, b) => a - b);
  // Plusieurs types (coin puis page) : du premier début au dernier fin.
  const debuts = types.map((ty) => marque(`gc-geste-debut-${ty}`)[0]).filter((x) => x != null);
  const t0 = debuts.length ? Math.min(...debuts) : undefined;
  const fins = types.flatMap((ty) => marque(`gc-geste-fin-${ty}`)).sort((a, b) => a - b);
  const t1 = types.length > 1 ? fins.filter((t) => t > t0).pop() : (fins.find((t) => t > t0) ?? fins[fins.length - 1]);
  const dans = (e) => t0 != null && t1 != null && e.ts >= t0 && e.ts <= t1 && (e.ph === 'X' || e.ph === 'B');
  const compte = (n) => ev.filter((e) => e.name === n && dans(e)).length;
  const details = (n) => ev.filter((e) => e.name === n && dans(e)).map((e) => r1((e.ts - t0) / 1000));

  // Temps de frame (rAF) et propriétés modifiées pendant le geste (horloge de la page).
  const d = res.gestes.find((g) => g.phase === 'debut' && types.includes(g.type));
  const prepa = res.gestes.find((g) => g.phase === 'prepa' && types.includes(g.type));
  const f = types.length > 1 ? res.gestes.filter((g) => g.phase === 'fin' && types.includes(g.type)).pop() : res.gestes.find((g) => g.phase === 'fin' && g.type === sc.type);
  const frames = d && f ? res.frames.filter((t) => t >= d.t && t <= f.t) : [];
  const dt = frames.slice(1).map((t, i) => t - frames[i]);
  const proprietes = {};
  for (const m of res.mutations.filter((x) => d && f && x.t >= d.t && x.t <= f.t)) for (const p of m.props) proprietes[p] = (proprietes[p] ?? 0) + 1;
  for (const [p, ts] of Object.entries(res.anims)) { const n = ts.filter((t) => d && f && t >= d.t && t <= f.t).length; if (n) proprietes[`anim:${p}`] = n; }
  const paints = ev.filter((e) => e.name === 'Paint' && dans(e));
  const surNoeud = (n) => paints.filter((e) => noeuds[e.args?.data?.nodeId] === n).length;
  const paintVideo = surNoeud('VIDEO');
  const paintDocument = surNoeud('#document');
  const paintHorsVideo = paints.length - paintVideo - Math.min(paintDocument, paintVideo);
  const nom_ = (p) => p.replace(/^anim:/, '');
  // Classes et nœuds changés pendant le geste : signalés (detail), pas jugés ici — le compte de Layout
  // dit s'ils ont coûté une mise en page.
  const horsPermis = Object.keys(proprietes).filter((p) => !p.startsWith('@') && !nom_(p).startsWith('--') && !PERMIS.has(nom_(p)));
  const variables = Object.keys(proprietes).filter((p) => nom_(p).startsWith('--'));
  return {
    scenario: nom,
    titre: sc.titre,
    banc: sc.banc,
    erreurs: errors,
    expire: res.timeout,
    echec: f?.echec ?? null,
    dureeGesteMs: d && f ? r1(f.t - d.t) : null,
    bornes: d?.bornes ?? (types.length > 1 ? `gc-livre-geste (${types.join(' → ')})` : 'gc-livre-geste'),
    types: res.gestes.filter((g) => types.includes(g.type)).map((g) => `${g.phase}:${g.type}@${Math.round(g.t - (d?.t ?? g.t))}`),
    preparationMs: prepa && d ? r1(d.t - prepa.t) : null,
    frames: dt.length,
    frameMs: { p50: r1(quantile(dt, 0.5)), p95: r1(quantile(dt, 0.95)), p99: r1(quantile(dt, 0.99)), max: r1(dt.length ? Math.max(...dt) : NaN) },
    framesPlusDe25ms: dt.filter((x) => x > 25).length,
    intervallesMs: dt.map((x) => Math.round(x)),
    pendantLeGeste: {
      Layout: compte('Layout'),
      Paint: compte('Paint'),
      PaintVideo: paintVideo,
      PaintHorsVideo: paintHorsVideo,
      PaintNoeuds: Object.fromEntries(Object.entries(paints.reduce((o, e) => { const k = noeuds[e.args?.data?.nodeId] ?? '?'; o[k] = (o[k] ?? 0) + 1; return o; }, {}))),
      UpdateLayoutTree: compte('UpdateLayoutTree'),
      LayoutA_ms: details('Layout'),
      PaintA_ms: details('Paint'),
      proprietes,
      horsTransformOpacite: horsPermis,
      variables,
    },
    appuiJusquaFin: {
      LayoutCount: (m1.LayoutCount ?? 0) - (m0.LayoutCount ?? 0),
      RecalcStyleCount: (m1.RecalcStyleCount ?? 0) - (m0.RecalcStyleCount ?? 0),
      LayoutDurationMs: r1(((m1.LayoutDuration ?? 0) - (m0.LayoutDuration ?? 0)) * 1000),
      RecalcStyleDurationMs: r1(((m1.RecalcStyleDuration ?? 0) - (m0.RecalcStyleDuration ?? 0)) * 1000),
      ScriptDurationMs: r1(((m1.ScriptDuration ?? 0) - (m0.ScriptDuration ?? 0)) * 1000),
    },
  };
}

// ---- 2. Calques (CDP LayerTree, passe à part : le domaine ralentit le compositeur) ----------
async function compterCalques(browser, srv, sc) {
  const context = await contexteDe(browser, sc);
  const { page } = await ouvrir(context, srv, sc.banc);
  const cdp = await context.newCDPSession(page);
  let calques = 0, dessines = 0;
  cdp.on('LayerTree.layerTreeDidChange', ({ layers }) => {
    if (!layers) return;
    calques = Math.max(calques, layers.length);
    dessines = Math.max(dessines, layers.filter((l) => l.drawsContent).length);
  });
  await cdp.send('LayerTree.enable');
  await declencher(page, sc);
  await page.evaluate(() => window.__gcFps.attendreCalme(500, 8000));
  await cdp.send('LayerTree.disable').catch(() => {});
  await context.close();
  return { calquesMax: calques, calquesDessinesMax: dessines };
}

// ---- 3. Vidéo : chorégraphie pilotée par les gestes (on attend la fin de chaque mouvement) -----
async function filmer(browser, srv, nom, sc) {
  if (!video || !browser) return { video: null };
  const tmp = join(outDir, '.video-tmp');
  const context = await contexteDe(browser, sc, { recordVideo: { dir: tmp, size: { width: W / 2, height: H / 2 } } });
  const { page, errors } = await ouvrir(context, srv, sc.banc);
  for (const etape of sc.video) {
    if (typeof etape[0] === 'number') { await page.waitForTimeout(etape[0]); continue; }
    if (etape[0] === '@') await declencher(page, sc);
    else await page.keyboard.press(etape[0]);
    if (etape[1] !== undefined) await page.waitForTimeout(etape[1]);
    else if (etape[0] !== '@') await page.evaluate(() => window.__gcFps.attendreCalme(700, 8000));
  }
  await page.waitForTimeout(500);
  const v = page.video();
  await context.close();
  const chemin = join(outDir, `${nom}.webm`);
  await v.saveAs(chemin);
  await v.delete();
  return { video: rel(chemin), erreursVideo: errors };
}

// ---- Lien profond à froid (plan v4) : le carnet chargé sur #bernard ------------------------------
// Le banc ne compte pas son propre chargement (le livre saute son arrivée au-delà de 1,5 s : en
// émulation ralentie, ce serait toujours le cas) ; la mesure est armée dès le premier octet.
function INIT_LIEN() {
  window.__gcArriveeToujours = true;
  window.__gcToucher = null;
  window.addEventListener('pointerdown', (e) => { if (e.isTrusted && window.__gcToucher == null) window.__gcToucher = performance.now(); }, true);
  const armer = () => window.__gcFps?.arm();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armer);
  else armer();
}

async function lienFroid(browser, srv, { toucherA = null, trace = false, calques = false, ralenti = true } = {}) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true });
  await context.addInitScript(INIT_FPS);
  await context.addInitScript(INIT_LIEN);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);
  if (ralenti) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  let calquesMax = 0;
  let dessinesMax = 0;
  if (calques) {
    cdp.on('LayerTree.layerTreeDidChange', ({ layers }) => {
      if (!layers) return;
      calquesMax = Math.max(calquesMax, layers.length);
      dessinesMax = Math.max(dessinesMax, layers.filter((l) => l.drawsContent).length);
    });
    await cdp.send('LayerTree.enable');
  }
  if (trace) await browser.startTracing(page, { categories: CATEGORIES });
  await page.goto(urlDe(srv, bancLien));
  let touche = null;
  if (toucherA != null) {
    await page.waitForFunction(() => (window.__gcFps?.gestes ?? []).some((g) => g.phase === 'debut'), null, { timeout: 60000, polling: 10 });
    const t = await page.evaluate(() => window.__gcFps.gestes.find((g) => g.phase === 'debut').t);
    await page.waitForFunction((x) => performance.now() >= x, t + toucherA, { timeout: 10000, polling: 5 });
    const c = await cdpDe(page);
    const vp = page.viewportSize();
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: vp.width * 0.5, y: vp.height * 0.55, id: 1 }] });
    await page.waitForTimeout(50);
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    touche = t + toucherA;
  }
  await page.waitForFunction(() => document.querySelector('[data-gc-arrivee="fini"]'), null, { timeout: 60000, polling: 20 }).catch(() => {});
  await page.evaluate(() => window.__gcFps.attendreCalme(400, 400));
  const buf = trace ? await browser.stopTracing() : null;
  if (calques) await cdp.send('LayerTree.disable').catch(() => {});
  const etat = await page.evaluate(() => ({
    gestes: window.__gcFps.gestes.slice(),
    frames: window.__gcFps.frames.slice(),
    toucher: window.__gcToucher,
    double: Number(document.querySelector('.gc-livre-ecran')?.getAttribute('data-gc-double')),
    hash: location.hash,
    spreads: [...new Set([...document.querySelectorAll('.gc-livre__page--visible [data-gc-spread]')].map((e) => e.getAttribute('data-gc-spread')))],
  }));
  await context.close();
  return { etat, buf, errors, calquesMax, dessinesMax, touche };
}

async function mesurerLien(browser, srv) {
  const sc = { titre: `Lien profond à froid (${bancLien}) : arrivée, ouverture, feuilletage`, banc: bancLien };
  const a = await lienFroid(browser, srv, { trace: true });
  const g = a.etat.gestes;
  const debuts = g.filter((x) => x.phase === 'debut');
  const finsG = g.filter((x) => x.phase === 'fin');
  const tA = debuts.length ? Math.min(...debuts.map((x) => x.t)) : null;
  const tB = finsG.length ? Math.max(...finsG.map((x) => x.t)) : null;
  const ev = JSON.parse(a.buf.toString()).traceEvents;
  const marques = ev.filter((e) => String(e.cat).includes('blink.user_timing') && /^gc-geste-(debut|fin)-/.test(e.name));
  const m0 = Math.min(...marques.filter((e) => e.name.startsWith('gc-geste-debut-')).map((e) => e.ts));
  const m1 = Math.max(...marques.filter((e) => e.name.startsWith('gc-geste-fin-')).map((e) => e.ts));
  const dans = (e) => Number.isFinite(m0) && Number.isFinite(m1) && e.ts >= m0 && e.ts <= m1 && (e.ph === 'X' || e.ph === 'B');
  const compte = (n) => ev.filter((e) => e.name === n && dans(e)).length;
  const aMs = (n) => ev.filter((e) => e.name === n && dans(e)).map((e) => r1((e.ts - m0) / 1000));
  const frames = tA != null && tB != null ? a.etat.frames.filter((t) => t >= tA && t <= tB) : [];
  const dt = frames.slice(1).map((t, i) => t - frames[i]);
  const c = await lienFroid(browser, srv, { calques: true });
  const b = await lienFroid(browser, srv, { toucherA: 500 });
  const finsB = b.etat.gestes.filter((x) => x.phase === 'fin');
  const tFinB = finsB.length ? Math.max(...finsB.map((x) => x.t)) : null;
  const saut = b.etat.toucher != null && tFinB != null ? tFinB - b.etat.toucher : null;
  return {
    scenario: 'lien', titre: sc.titre, banc: sc.banc, erreurs: [...a.errors, ...b.errors, ...c.errors],
    sequenceMs: tA != null && tB != null ? r1(tB - tA) : null,
    gestes: g.map((x) => `${x.phase}:${x.type}@${Math.round(x.t - (tA ?? 0))}`),
    frames: dt.length,
    frameMs: { p50: r1(quantile(dt, 0.5)), p95: r1(quantile(dt, 0.95)), p99: r1(quantile(dt, 0.99)), max: r1(dt.length ? Math.max(...dt) : NaN) },
    framesPlusDe25ms: dt.filter((x) => x > 25).length,
    pendantLeGeste: { Layout: compte('Layout'), Paint: compte('Paint'), LayoutA_ms: aMs('Layout'), PaintA_ms: aMs('Paint') },
    calquesMax: c.calquesMax, calquesDessinesMax: c.dessinesMax,
    arrivee: { double: a.etat.double, hash: a.etat.hash, spreads: a.etat.spreads },
    saut: { ms: saut != null ? r1(saut) : null, double: b.etat.double, spreads: b.etat.spreads, gestes: b.etat.gestes.map((x) => `${x.phase}:${x.type}@${Math.round(x.t - (b.etat.toucher ?? 0))}`) },
  };
}

// ---- 4. Captures à mi-geste (banc harness/motion.html) ---------------------------------------
async function capturer(browser, srv) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const fichiers = [];
  for (const [nom, query] of POSES) {
    const { page, errors } = await ouvrir(context, srv, `harness/motion.html?${query}`);
    await page.waitForTimeout(250);
    const f = join(outDir, `${nom}.png`);
    await page.screenshot({ path: f });
    fichiers.push(rel(f) + (errors.length ? `  ✗ ${errors.join(' | ')}` : ''));
    await page.close();
  }
  // Captures interactives : le repère de caméra (zoom fin) et l'anneau de focus d'une flèche.
  const { page } = await ouvrir(context, srv, 'harness/motion.html?scenario=turn&index=1');
  await page.keyboard.press('Alt+-');
  await page.keyboard.press('Alt+-');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, 'repere-zoom.png') });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(outDir, 'focus-fleche.png') });
  fichiers.push(rel(join(outDir, 'repere-zoom.png')), rel(join(outDir, 'focus-fleche.png')));
  await context.close();
  return fichiers;
}

// ---- Programme -------------------------------------------------------------------------------
const srv = await serve();
const browser = await lancer();
const browserVideo = video ? await lancer(ARGS_VIDEO) : null;
const R = new Rapport('fps', { dir: outDir, meta: { throttle, bundle, navigateur: browser.version(), args: ARGS, argsVideo: ARGS_VIDEO } });
const resultats = [];
for (const nom of scenarios) {
  if (nom === 'lien') {
    let r;
    try { r = await mesurerLien(browser, srv); } catch (x) { R.ajouter(nom, 'mesure', 'KO', `plantage : ${String(x).split('\n')[0]}`); continue; }
    resultats.push(r);
    const g = r.pendantLeGeste;
    const surBernard = (sp) => sp.some((x) => /mathis|bernard/.test(x));
    console.log(`\n■ ${r.titre}`);
    console.log(`  séquence ${r.sequenceMs} ms · ${r.frames} frames · p50 ${r.frameMs.p50} / p95 ${r.frameMs.p95} / max ${r.frameMs.max} ms · Layout ${g.Layout} · Paint ${g.Paint} · calques ${r.calquesMax}`);
    console.log(`  gestes : ${r.gestes.join(', ')}`);
    console.log(`  toucher à 0,5 s : posé en ${r.saut.ms} ms (${r.saut.gestes.join(', ')})`);
    R.ajouter(nom, `séquence ≤ ${LIEN_MAX_MS} ms (premier début → dernière fin)`, r.sequenceMs != null && r.sequenceMs <= LIEN_MAX_MS ? 'OK' : 'KO', `${r.sequenceMs} ms`);
    R.ajouter(nom, 'arrive sur la double page de Bernard', surBernard(r.arrivee.spreads) ? 'OK' : 'KO', `double ${r.arrivee.double} (${r.arrivee.spreads.join(', ')}) ${r.arrivee.hash}`);
    R.ajouter(nom, '0 Layout pendant la séquence', g.Layout === 0 ? 'OK' : 'KO', `${g.Layout}${g.Layout ? ` (à ${g.LayoutA_ms.join(', ')} ms)` : ''}`);
    R.ajouter(nom, '≤ 2 Paint pendant la séquence', g.Paint <= 2 ? 'OK' : 'KO', `${g.Paint}${g.Paint ? ` (à ${g.PaintA_ms.join(', ')} ms)` : ''}`);
    R.ajouter(nom, `≤ ${PLAFOND_CALQUES} calques`, r.calquesMax <= PLAFOND_CALQUES ? 'OK' : 'KO', `${r.calquesMax} (dont ${r.calquesDessinesMax} dessinés)`);
    R.ajouter(nom, `toucher à 0,5 s : posé en ≤ ${SAUT_MAX_MS} ms`, r.saut.ms != null && r.saut.ms <= SAUT_MAX_MS ? 'OK' : 'KO', `${r.saut.ms} ms`);
    R.ajouter(nom, 'toucher à 0,5 s : sur la double page de Bernard', surBernard(r.saut.spreads) ? 'OK' : 'KO', `double ${r.saut.double} (${r.saut.spreads.join(', ')})`);
    R.info(nom, 'temps de frame', `p50 ${r.frameMs.p50} · p95 ${r.frameMs.p95} · max ${r.frameMs.max} ms · ${r.framesPlusDe25ms} > 25 ms · ${r.frames} images`);
    if (r.erreurs.length) R.ajouter(nom, 'aucune erreur de page', 'KO', r.erreurs.slice(0, 3).join(' | '));
    continue;
  }
  const sc = SCENARIOS[nom];
  if (!sc) { console.warn(`scénario inconnu : ${nom}`); continue; }
  let r;
  try {
    // Machine chargée : un geste sans images (page affamée) ne dit rien du temps de frame → jusqu'à 3 essais.
    for (let essai = 1; essai <= 3; essai++) {
      const m = await mesurer(browser, srv, nom, sc);
      if (!r || m.attente || (m.frames ?? 0) > (r.frames ?? 0)) r = { ...m, essais: essai };
      if (m.attente || (m.frames ?? 0) >= 10) break;
      console.log(`  (essai ${essai} : ${m.frames ?? 0} images pendant le geste, on recommence)`);
    }
  } catch (x) {
    R.ajouter(nom, 'mesure', 'KO', `plantage : ${String(x).split('\n')[0]}`);
    continue;
  }
  if (r.attente) {
    console.log(`\n■ ${r.titre}`);
    R.attente(nom, sc.titre, `${r.attente} : à relancer après intégration`);
    resultats.push(r);
    continue;
  }
  Object.assign(r, await compterCalques(browser, srv, sc));
  Object.assign(r, await filmer(browserVideo, srv, nom, sc).catch((x) => ({ video: null, erreursVideo: [String(x).split('\n')[0]] })));
  resultats.push(r);
  const g = r.pendantLeGeste;
  console.log(`\n■ ${r.titre}${r.expire ? '  (⚠ fin du geste non reçue)' : ''}`);
  console.log(`  ${sc.banc}`);
  console.log(`  geste ${r.dureeGesteMs} ms${r.preparationMs != null ? ` (préparation : ${r.preparationMs} ms)` : ''} · ${r.frames} frames · frame p50 ${r.frameMs.p50} / p95 ${r.frameMs.p95} / p99 ${r.frameMs.p99} / max ${r.frameMs.max} ms · > 25 ms : ${r.framesPlusDe25ms}`);
  console.log(`  pendant le geste : Layout ${g.Layout} · Paint ${g.Paint} · recalcul de style ${g.UpdateLayoutTree}${g.Layout ? `  (Layout à ${g.LayoutA_ms.join(', ')} ms)` : ''}${g.Paint ? `  (Paint à ${g.PaintA_ms.join(', ')} ms)` : ''}`);
  console.log(`  propriétés modifiées : ${Object.entries(g.proprietes).map(([k, v]) => `${k} ×${v}`).join(', ') || 'aucune'}`);
  console.log(`  de l'appui à la fin : LayoutCount ${r.appuiJusquaFin.LayoutCount} · RecalcStyleCount ${r.appuiJusquaFin.RecalcStyleCount} · Layout ${r.appuiJusquaFin.LayoutDurationMs} ms · script ${r.appuiJusquaFin.ScriptDurationMs} ms`);
  console.log(`  calques : ${r.calquesMax} (dont ${r.calquesDessinesMax} dessinés)${r.video ? ` · vidéo ${r.video}` : ''}`);
  const errs = [...r.erreurs, ...(r.erreursVideo ?? [])];
  const juge = (test, cond, detail) => R.ajouter(nom, test, sc.exigences ? (cond ? 'OK' : 'KO') : 'INFO', detail);
  if (r.expire || r.echec || r.dureeGesteMs == null) R.ajouter(nom, 'geste mesuré (début et fin reçus)', 'KO', r.echec ?? 'fin du geste non reçue');
  juge('0 Layout pendant le geste', g.Layout === 0, `${g.Layout}${g.Layout ? ` (à ${g.LayoutA_ms.join(', ')} ms)` : ''}`);
  juge('≤ 2 Paint pendant le geste (hors images de la vidéo)', g.PaintHorsVideo <= 2, `${g.PaintHorsVideo}${g.PaintVideo ? ` (+ ${g.Paint - g.PaintHorsVideo} pour la vidéo qui joue)` : ''} · par nœud : ${Object.entries(g.PaintNoeuds).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`);
  juge('transform / opacity seulement', !g.horsTransformOpacite.length, g.horsTransformOpacite.length ? `aussi : ${g.horsTransformOpacite.join(', ')}` : `${Object.keys(g.proprietes).join(', ') || 'aucune propriété en ligne'}${g.variables.length ? ` (variables : ${g.variables.join(', ')})` : ''}`);
  juge(`≤ ${PLAFOND_CALQUES} calques`, r.calquesMax <= PLAFOND_CALQUES, `${r.calquesMax} (dont ${r.calquesDessinesMax} dessinés)`);
  R.info(nom, 'bornes du geste', r.bornes);
  R.info(nom, 'temps de frame', `p50 ${r.frameMs.p50} · p95 ${r.frameMs.p95} · max ${r.frameMs.max} ms · ${r.framesPlusDe25ms} > 25 ms · geste ${r.dureeGesteMs} ms · ${r.frames} images${r.essais > 1 ? ` (${r.essais} essais : machine chargée)` : ''}`);
  if (errs.length) R.ajouter(nom, 'aucune erreur de page', 'KO', errs.slice(0, 3).join(' | '));
}
let captures = null;
if (poses) {
  captures = await capturer(browser, srv);
  console.log(`\ncaptures :\n  ${captures.join('\n  ')}`);
}
await browser.close();
await browserVideo?.close();
await srv.close();
R.ecrire({ scenarios: resultats, captures });
process.exit(R.code());
