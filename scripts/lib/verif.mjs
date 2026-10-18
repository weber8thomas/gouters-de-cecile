// Outils partagés des vérifications (lot T) : écrans standard, navigateur, instrumentation du geste
// et de play(), mesures (rects, zone sûre, cibles ≥ 44 px), gestes au doigt, captures, planche
// contact, rapports OK / KO / ATTENTE, cibles à vérifier (banc factice, carte Carnet, site construit).
//
// Statuts d'un test :
//   OK       conforme ;
//   KO       non conforme (code de sortie 1) ;
//   ATTENTE  l'élément du contrat n'existe pas encore : à relancer après intégration ;
//   INFO     mesure ou limite de l'environnement (ex. H.264 non décodable dans ce Chromium).
import { chromium, devices } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { serve, serveSite, ROOT } from './serve.mjs';

export { ROOT, serve, serveSite };
export const OUT_T = join(ROOT, 'verification/out/t');
export const rel = (f) => relative(ROOT, f) || '.';

// ---- Arguments --------------------------------------------------------------------------------
/** opt('url', défaut) · drapeau('banc') · liste('only', 'a,b') */
export function lireArgs(argv = process.argv.slice(2)) {
  const opt = (k, d) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };
  const drapeau = (k) => argv.includes(`--${k}`);
  const liste = (k, d) => opt(k, d)?.split(',').map((s) => s.trim()).filter(Boolean);
  return { opt, drapeau, liste, argv };
}

// ---- Écrans standard (CONTRACT § 11) ------------------------------------------------------------
const tel = (d) => {
  const { defaultBrowserType, ...ctx } = devices[d];
  void defaultBrowserType;
  return ctx;
};
/** insets : [haut, droite, bas, gauche] simulés (encoches) — le banc de l'écran les applique. */
export const ECRANS = [
  { nom: 'iphone13-portrait', titre: 'iPhone 13 debout', classe: 'telephone', ctx: tel('iPhone 13'), insets: [47, 0, 34, 0] },
  { nom: 'iphone13-paysage', titre: 'iPhone 13 couché', classe: 'telephone', ctx: tel('iPhone 13 landscape'), insets: [0, 47, 21, 47] },
  { nom: 'pixel7', titre: 'Pixel 7 debout', classe: 'telephone', ctx: tel('Pixel 7'), insets: [0, 0, 0, 0] },
  { nom: 'pixel7-paysage', titre: 'Pixel 7 couché', classe: 'telephone', ctx: tel('Pixel 7 landscape'), insets: [0, 0, 0, 0] },
  { nom: 'ipad-portrait', titre: 'iPad (7ᵉ gén.) debout', classe: 'tablette', ctx: tel('iPad (gen 7)'), insets: [20, 0, 0, 0] },
  { nom: 'ipad-paysage', titre: 'iPad (7ᵉ gén.) couché', classe: 'tablette', ctx: tel('iPad (gen 7) landscape'), insets: [20, 0, 0, 0] },
  { nom: 'ordi-1440', titre: 'Ordinateur 1440 × 900', classe: 'ordinateur', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, insets: [0, 0, 0, 0] },
  { nom: 'ordi-1280', titre: 'Ordinateur 1280 × 800', classe: 'ordinateur', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, insets: [0, 0, 0, 0] },
  { nom: 'tv-1080', titre: 'TV 1920 × 1080', classe: 'tv', ctx: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, insets: [0, 0, 0, 0] },
  { nom: 'tv-4k', titre: 'TV 3840 × 2160 (dpr 1)', classe: 'tv', mm: 1200 / 3840, ctx: { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 }, insets: [0, 0, 0, 0] },
];
export const ecran = (nom) => {
  const e = ECRANS.find((x) => x.nom === nom);
  if (!e) throw new Error(`écran inconnu : ${nom} (connus : ${ECRANS.map((x) => x.nom).join(', ')})`);
  return e;
};
export const ecrans = (noms) => (noms?.length ? noms.map(ecran) : ECRANS);
export const tactile = (e) => !!e.ctx.hasTouch;

// ---- Navigateur ---------------------------------------------------------------------------------
// Chromium sans GPU : rastérisation logicielle (comme fps.mjs). Lecture : un play() hors geste est
// refusé (comme sur iPhone) : --autoplay-policy=user-gesture-required.
export const ARGS_GPU = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
export const ARGS_MEDIA = ['--autoplay-policy=user-gesture-required', '--mute-audio'];

/** GC_CHROME=/chemin/vers/chrome : un navigateur qui décode H.264 (Chrome stable), pour la lecture réelle. */
export async function lancer({ args = ARGS_GPU, media = true, chrome = process.env.GC_CHROME } = {}) {
  const tous = [...args, ...(media ? ARGS_MEDIA : [])];
  if (chrome) return chromium.launch({ executablePath: chrome, args: tous });
  try {
    return await chromium.launch({ args: tous });
  } catch (e) {
    const fallback = '/opt/pw-browsers/chromium';
    if (existsSync(fallback)) return chromium.launch({ executablePath: fallback, args: tous });
    throw e;
  }
}

/** Contexte de l'écran e (options Playwright supplémentaires : reducedMotion, storageState…). */
export const contexte = (browser, e, extra = {}) => browser.newContext({ ...e.ctx, ...extra });

// ---- Instrumentation (addInitScript) -----------------------------------------------------------
// window.__gcGeste : vrai pendant un geste de l'utilisateur (pointerup, keydown, click, touchend de
// confiance, écoutés en capture sur window, donc avant l'application), remis à faux au setTimeout(0)
// suivant. HTMLMediaElement.prototype.play est enveloppé : chaque appel est noté dans
// window.__gcPlays { dansGeste, geste, touche, t, src, video, muted, activation, resultat }.
// window.__gcGestesLivre : les événements « gc-livre-geste » { phase, type, t, recu }.
// window.__gcMedia : play / playing / pause / ended / error des médias { type, t, src, temps }.
function INIT_GESTE() {
  if (window.__gcInstrumente) return;
  window.__gcInstrumente = true;
  window.__gcGeste = false;
  window.__gcGesteType = null;
  window.__gcGesteTouche = null;
  window.__gcPlays = [];
  window.__gcGestesLivre = [];
  window.__gcMedia = [];
  window.__gcEvenements = [];
  const marquer = (e) => {
    if (!e.isTrusted) return; // un dispatchEvent() ne compte pas comme geste
    window.__gcGeste = true;
    window.__gcGesteType = e.type;
    window.__gcGesteTouche = e.key ?? null;
    window.__gcEvenements.push({ type: e.type, t: performance.now(), touche: e.key ?? null });
    if (window.__gcEvenements.length > 400) window.__gcEvenements.splice(0, 200);
    setTimeout(() => { window.__gcGeste = false; window.__gcGesteType = null; window.__gcGesteTouche = null; }, 0);
  };
  for (const t of ['pointerup', 'keydown', 'click', 'touchend']) window.addEventListener(t, marquer, { capture: true });

  const play0 = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function play(...a) {
    const src = this.currentSrc || this.src || this.querySelector?.('source')?.src || '';
    const rec = {
      dansGeste: window.__gcGeste === true,
      geste: window.__gcGesteType,
      touche: window.__gcGesteTouche,
      t: performance.now(),
      src: src.split('/').slice(-2).join('/'),
      video: this.hasAttribute?.('data-gc-video') ?? false,
      muted: this.muted,
      activation: navigator.userActivation ? navigator.userActivation.isActive : null,
      resultat: 'en attente',
    };
    window.__gcPlays.push(rec);
    let p;
    try {
      p = play0.apply(this, a);
    } catch (err) {
      rec.resultat = `exception ${err?.name}`;
      throw err;
    }
    if (p && typeof p.then === 'function') p.then(() => { rec.resultat = 'lecture'; }, (err) => { rec.resultat = `refus ${err?.name}`; });
    return p;
  };

  document.addEventListener('gc-livre-geste', (e) => {
    window.__gcGestesLivre.push({ ...(e.detail ?? {}), recu: performance.now() });
  });
  for (const t of ['play', 'playing', 'pause', 'ended', 'error', 'loadedmetadata']) {
    document.addEventListener(t, (e) => {
      const m = e.target;
      if (!(m instanceof HTMLMediaElement)) return;
      window.__gcMedia.push({ type: t, t: performance.now(), src: (m.currentSrc || '').split('/').pop(), temps: m.currentTime });
    }, true); // les événements des médias ne bullent pas : capture
  }
}

/** Instrumente un contexte ou une page (avant tout chargement). */
export const instrumenterGeste = (cible) => cible.addInitScript(INIT_GESTE);
export const plays = (page) => page.evaluate(() => window.__gcPlays ?? []);
export const nbPlays = (page) => page.evaluate(() => (window.__gcPlays ?? []).length);
export const nbGestes = (page) => page.evaluate(() => (window.__gcGestesLivre ?? []).length);
export const gestes = (page, depuis = 0) => page.evaluate((d) => (window.__gcGestesLivre ?? []).slice(d), depuis);

/** Attend un événement gc-livre-geste (phase, type facultatif) reçu après l'indice `depuis`. */
export async function attendreGeste(page, phase, type, { depuis = 0, timeout = 20000 } = {}) {
  try {
    const h = await page.waitForFunction(
      ([p, ty, d]) => (window.__gcGestesLivre ?? []).slice(d).find((g) => g.phase === p && (!ty || g.type === ty)) ?? false,
      [phase, type ?? null, depuis], { timeout, polling: 25 });
    return await h.jsonValue();
  } catch {
    return null;
  }
}

/** Durée (ms, horloge de la page) du premier geste `type` complet reçu après `depuis`. */
export async function dureeGeste(page, type, { depuis = 0, timeout = 30000 } = {}) {
  const fin = await attendreGeste(page, 'fin', type, { depuis, timeout });
  if (!fin) return null;
  const g = await gestes(page, depuis);
  const debut = g.find((x) => x.phase === 'debut' && x.type === type);
  return debut ? Math.round(fin.t - debut.t) : null;
}

/** Attend qu'aucun geste du livre ne soit en cours pendant `calme` ms (un geste peut démarrer d'ici `debutMax`). */
export const calme = (page, { calme: c = 450, debutMax = 3000, max = 45000 } = {}) => page.evaluate(([c, debutMax, max]) => new Promise((resolve) => {
  const L = () => window.__gcGestesLivre ?? [];
  const n0 = L().length;
  const t0 = performance.now();
  let depuis = 0;
  const actifs = () => {
    const a = new Set();
    for (const g of L()) { if (g.phase === 'fin') a.delete(g.type); else a.add(g.type); }
    return a.size;
  };
  const tick = () => {
    const now = performance.now();
    const parti = L().length > n0 || now - t0 > debutMax;
    if ((parti && actifs() === 0) || now - t0 > max) {
      if (!depuis) depuis = now;
      if (now - depuis >= c || now - t0 > max) return resolve(Math.round(now - t0));
    } else depuis = 0;
    setTimeout(tick, 40);
  };
  tick();
}), [c, debutMax, max]);

// ---- Mesures dans la page -------------------------------------------------------------------------
/** Rect à l'écran du premier élément visible (ou du premier) qui correspond, null s'il n'y en a pas. */
export const rectDe = (page, selecteur) => page.evaluate((s) => {
  const els = [...document.querySelectorAll(s)];
  if (!els.length) return null;
  const vu = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  const el = els.find(vu) ?? els[0];
  const r = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  const visible = vu(el) && Number(st.opacity) > 0.02;
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, visible, n: els.length };
}, selecteur);

export const existe = (page, selecteur) => page.evaluate((s) => !!document.querySelector(s), selecteur);

/**
 * Zone sûre de la fenêtre : la plus grande des marges entre les variables de l'écran
 * (--gc-ecran-haut… sur .gc-ecran, encoches simulées comprises), env(safe-area-inset-*) et `insets`.
 */
export const zoneSure = (page, insets = null) => page.evaluate((imp) => {
  const vw = innerWidth;
  const vh = innerHeight;
  let i = [0, 0, 0, 0];
  const sources = [];
  const ec = document.querySelector('.gc-ecran');
  if (ec) {
    const cs = getComputedStyle(ec);
    const v = ['haut', 'droite', 'bas', 'gauche'].map((k) => parseFloat(cs.getPropertyValue(`--gc-ecran-${k}`)));
    if (v.every(Number.isFinite)) { i = v; sources.push('écran'); }
  }
  const s = document.createElement('div');
  s.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(s);
  const cs = getComputedStyle(s);
  const env = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat);
  s.remove();
  if (env.some((x) => x > 0)) sources.push('env()');
  if (imp?.some((x) => x > 0)) sources.push('imposée');
  i = i.map((x, k) => Math.max(x || 0, env[k] || 0, imp?.[k] || 0));
  return { x: i[3], y: i[0], r: vw - i[1], b: vh - i[2], vw, vh, insets: i, sources };
}, insets);

/** Le rect tient dans la zone (tolérance en px ; ignorerBas : une feuille du bas peut passer sous la barre d'accueil). */
export const dansZone = (r, z, tol = 1, { ignorerBas = false } = {}) =>
  !!r && r.x >= z.x - tol && r.y >= z.y - tol && r.r <= z.r + tol && (ignorerBas || r.b <= z.b + tol);

/** Écart maximal (px) entre deux rects (x, y, largeur, hauteur). */
export const ecartRect = (a, b) => (a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h)) : Infinity);

/**
 * Cibles tactiles des éléments visibles qui correspondent : taille du rect, et zone touchable réelle
 * (un carré de `min` px centré sur l'élément : ses 4 coins et son centre touchent-ils l'élément ?
 * elementFromPoint, donc une zone agrandie par un ::before compte). ok si l'un ou l'autre atteint `min`.
 */
export const cibles44 = (page, selecteur, min = 44) => page.evaluate(([s, m]) => [...document.querySelectorAll(s)].map((el) => {
  const r = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  // Rogné par un conteneur qui défile (feuille du bas) : hors de vue, ni mesuré ni « hors zone ».
  let clippe = false;
  for (let p = el.parentElement; p && p !== document.body && !clippe; p = p.parentElement) {
    const o = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(o.overflowX + o.overflowY)) {
      const q = p.getBoundingClientRect();
      const cx0 = r.left + r.width / 2;
      const cy0 = r.top + r.height / 2;
      clippe = cx0 < q.left || cx0 > q.right || cy0 < q.top || cy0 > q.bottom;
    }
  }
  const visible = r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !clippe;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const d = m / 2 - 1;
  const pts = [[cx, cy], [cx - d, cy - d], [cx + d, cy - d], [cx - d, cy + d], [cx + d, cy + d]];
  const touche = pts.every(([x, y]) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); });
  return {
    nom: el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) || el.tagName.toLowerCase(),
    x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: r.right, b: r.bottom,
    visible, zoneTouchable: touche, ok: (r.width >= m - 0.5 && r.height >= m - 0.5) || touche,
  };
}).filter((c) => c.visible), [selecteur, min]);

/** Décodage des vidéos : canPlayType et MediaSource.isTypeSupported. h264 : vrai si H.264 + AAC est lisible. */
export const codecH264 = (page) => page.evaluate(() => {
  const v = document.createElement('video');
  const t = {
    h264: 'video/mp4; codecs="avc1.42E01E"',
    h264Main: 'video/mp4; codecs="avc1.4D401F"',
    aac: 'audio/mp4; codecs="mp4a.40.2"',
    mp4: 'video/mp4',
    vp9: 'video/webm; codecs="vp9, opus"',
  };
  const r = Object.fromEntries(Object.entries(t).map(([k, x]) => [k, v.canPlayType(x)]));
  r.mse = typeof MediaSource !== 'undefined' ? MediaSource.isTypeSupported(t.h264) : null;
  r.decodable = r.h264 !== '' || r.h264Main !== '';
  return r;
});

/** État du livre, lu dans le DOM (carte Carnet, site ou banc factice). */
export const etatLivre = (page) => page.evaluate(() => {
  const s = document.querySelector('.gc-livre-ecran');
  const sv = document.querySelector('[data-gc-soulever]');
  const vis = [...document.querySelectorAll('.gc-livre__page--visible[data-gc-spread], .gc-livre__page--visible [data-gc-spread]')]
    .map((e) => e.getAttribute('data-gc-spread'));
  const tous = [...document.querySelectorAll('[data-gc-spread]')].map((e) => e.getAttribute('data-gc-spread'));
  return {
    double: s ? Number(s.getAttribute('data-gc-double')) : null,
    cote: s?.getAttribute('data-gc-cote') ?? null,
    cadrage: s?.getAttribute('data-gc-cadrage') ?? document.querySelector('[data-gc-cadrage]')?.getAttribute('data-gc-cadrage') ?? null,
    hash: location.hash,
    soulever: sv?.getAttribute('data-gc-soulever') ?? null,
    spreads: [...new Set(vis.length ? vis : tous)],
  };
});

/** Attend que le rect de `selecteur` ne bouge plus pendant `images` images (fin d'une animation). */
export const stabiliser = (page, selecteur, { images = 6, timeout = 8000 } = {}) => page.evaluate(([s, n, max]) => new Promise((resolve) => {
  const t0 = performance.now();
  let prec = null;
  let stables = 0;
  const lire = () => {
    const el = document.querySelector(s);
    if (!el) return 'absent';
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height].map((v) => v.toFixed(1)).join(',') + getComputedStyle(el).opacity;
  };
  const tick = () => {
    const v = lire();
    stables = v === prec ? stables + 1 : 0;
    prec = v;
    if (stables >= n || performance.now() - t0 > max) return resolve(stables >= n);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), [selecteur, images, timeout]);

/** Attend qu'un attribut prenne une valeur (true), ou timeout (false). */
export async function attendreAttr(page, selecteur, attr, valeur, timeout = 6000) {
  try {
    await page.waitForFunction(([s, a, v]) => {
      const els = [...document.querySelectorAll(s)];
      return els.some((el) => el.getAttribute(a) === v);
    }, [selecteur, attr, valeur], { timeout, polling: 30 });
    return true;
  } catch {
    return false;
  }
}

// ---- Échantillons de transformations (mouvement réduit, propriétés animées) ---------------------
/**
 * Démarre un relevé par image des transform / opacity calculés des éléments qui correspondent (même
 * montés après coup). arreterEchantillons() renvoie, par élément, le nombre de valeurs distinctes.
 */
export const demarrerEchantillons = (page, selecteur) => page.evaluate((s) => {
  const ids = new WeakMap();
  let n = 0;
  const E = (window.__gcEch = { actif: true, par: {}, images: 0 });
  const norme = (t) => (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)' ? 'identite' : t);
  const tick = () => {
    if (!E.actif) return;
    E.images++;
    const els = [...document.querySelectorAll(s)].slice(0, 300);
    for (const el of els) {
      if (!ids.has(el)) ids.set(el, `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}#${++n}`);
      const id = ids.get(el);
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const p = (E.par[id] ??= { transform: new Set(), opacity: new Set(), rect: new Set(), aire: 0 });
      p.transform.add(norme(cs.transform));
      p.opacity.add(cs.opacity);
      p.rect.add([r.left, r.top, r.width, r.height].map((v) => Math.round(v)).join(','));
      p.aire = Math.max(p.aire, r.width * r.height);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, selecteur);

export const arreterEchantillons = (page) => page.evaluate(() => {
  const E = window.__gcEch;
  if (!E) return null;
  E.actif = false;
  const ecran = innerWidth * innerHeight;
  const par = Object.entries(E.par).map(([id, p]) => ({ id, transforms: p.transform.size, opacites: p.opacity.size, rects: p.rect.size, part: Math.round((p.aire / ecran) * 1000) / 1000, exemple: [...p.transform].slice(0, 3) }));
  return {
    images: E.images,
    elements: par.length,
    // Animé en transform : au moins 3 valeurs (images intermédiaires), ou 2 valeurs pour un élément d'au
    // moins 5 % de l'écran (un objet qui saute de place) ; un petit trait posé une fois ne compte pas.
    transformes: par.filter((p) => p.transforms >= 3 || (p.transforms === 2 && p.part >= 0.05)),
    sauts: par.filter((p) => p.transforms === 2 && p.part < 0.05),
    deplaces: par.filter((p) => p.rects > 1),
    fondus: par.filter((p) => p.opacites > 1).length,
  };
});

// ---- Gestes (doigt : événements tactiles CDP ; souris ; clavier) --------------------------------
const sessions = new WeakMap();
export async function cdpDe(page) {
  if (!sessions.has(page)) sessions.set(page, await page.context().newCDPSession(page));
  return sessions.get(page);
}

/** Toucher bref au doigt (touchStart → touchEnd) : pointerdown/up « touch », puis click. */
export async function toucher(page, x, y, { ms = 60 } = {}) {
  const cdp = await cdpDe(page);
  const t0 = Date.now() / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }], timestamp: t0 });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + ms / 1000 });
}

/** Glisser au doigt de (x0, y0) à (x1, y1) en `ms`, en `n` pas ; avantLacher : rappel avant le lâcher. */
export async function glisser(page, [x0, y0], [x1, y1], { ms = 500, n = 16, avantLacher, aMiChemin } = {}) {
  const cdp = await cdpDe(page);
  const t0 = Date.now() / 1000;
  const dt = ms / n / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }], timestamp: t0 });
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, id: 1 }], timestamp: t0 + i * dt });
    await page.waitForTimeout(ms / n);
    // (le doigt à mi-chemin, encore posé : capture d'un geste en cours)
    if (aMiChemin && i === Math.ceil(n / 2)) await aMiChemin();
  }
  if (avantLacher) await avantLacher();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + n * dt + 0.008 });
}

export async function glisserSouris(page, [x0, y0], [x1, y1], { ms = 500, n = 16 } = {}) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    await page.waitForTimeout(ms / n);
  }
  await page.mouse.up();
}

/** Toucher sur un écran tactile, clic sinon. */
export const taper = (page, e, x, y) => (tactile(e) ? toucher(page, x, y) : page.mouse.click(x, y));
/** Glisser au doigt sur un écran tactile, à la souris sinon. */
export const glisserSur = (page, e, a, b, o) => (tactile(e) ? glisser(page, a, b, o) : glisserSouris(page, a, b, o));

// ---- Surveillance des erreurs et du réseau --------------------------------------------------------
/** Erreurs de page, console « error », réponses ≥ 400 et requêtes en échec (ERR_ABORTED des médias ignoré). */
export function surveiller(page) {
  const s = { erreurs: [], reponses: [], echecs: [], medias: [] };
  page.on('pageerror', (e) => s.erreurs.push(`exception : ${String(e).slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') s.erreurs.push(`console : ${m.text().slice(0, 300)}`); });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400) s.reponses.push(`${r.status()} ${u}`);
    if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(u)) s.medias.push({ url: u.split('/').pop(), statut: r.status(), range: r.request().headers().range ?? null, type: r.headers()['content-type'] ?? null });
  });
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(err) && /\.(mp4|webm|m4v|mov)(\?|$)|^data:/i.test(r.url())) return;
    s.echecs.push(`échec ${r.url()} ${err}`);
  });
  return s;
}

// ---- Captures et planche contact --------------------------------------------------------------------
export async function capture(page, nom, dir = OUT_T, options = {}) {
  mkdirSync(dir, { recursive: true });
  const f = join(dir, `${nom}.png`);
  await page.screenshot({ path: f, timeout: 120000, ...options });
  return f;
}

/** Proportion (0–1) de pixels différents entre deux PNG de même taille (seuil par canal). */
export function pixelsDifferents(a, b, seuil = 24) {
  const A = PNG.sync.read(Buffer.isBuffer(a) ? a : readFileSync(a));
  const B = PNG.sync.read(Buffer.isBuffer(b) ? b : readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return 1;
  let n = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    if (Math.abs(A.data[i] - B.data[i]) > seuil || Math.abs(A.data[i + 1] - B.data[i + 1]) > seuil || Math.abs(A.data[i + 2] - B.data[i + 2]) > seuil) n++;
  }
  return n / (A.width * A.height);
}

const PLANCHE_PY = `
import sys, json, os
from PIL import Image, ImageDraw, ImageFont
cfg = json.loads(sys.argv[1])
cols, tw, th = cfg['colonnes'], cfg['tuile'], cfg['hauteur']
items = [t for t in cfg['tuiles'] if os.path.exists(t[0])]
def police(n):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf']:
        if os.path.exists(f):
            return ImageFont.truetype(f, n)
    try:
        return ImageFont.load_default(size=n)
    except TypeError:
        return ImageFont.load_default()
f, ft = police(15), police(22)
pad, leg, haut = 18, 40, 60
rows = max(1, (len(items) + cols - 1) // cols)
W = pad + cols * (tw + pad)
H = haut + rows * (th + leg + pad) + pad
img = Image.new('RGB', (W, H), (43, 33, 27))
d = ImageDraw.Draw(img)
d.text((pad, 18), cfg['titre'], fill=(239, 228, 210), font=ft)
for k, (chemin, texte) in enumerate(items):
    x = pad + (k % cols) * (tw + pad)
    y = haut + (k // cols) * (th + leg + pad)
    d.rectangle([x, y, x + tw, y + th + leg], fill=(29, 22, 18))
    try:
        im = Image.open(chemin).convert('RGB')
        im.thumbnail((tw - 12, th - 12))
        img.paste(im, (x + (tw - im.width) // 2, y + (th - im.height) // 2))
    except Exception as e:
        d.text((x + 8, y + 8), str(e)[:60], fill=(255, 120, 120), font=f)
    lignes = [texte[i:i + 62] for i in range(0, len(texte), 62)][:2]
    for j, l in enumerate(lignes):
        d.text((x + 8, y + th + 2 + j * 18), l, fill=(239, 228, 210), font=f)
img.save(cfg['sortie'])
print(cfg['sortie'])
`;

/**
 * Planche contact (PIL) : fichiers = [chemin] ou [[chemin, légende]]. Renvoie le chemin, ou null
 * si Python/PIL manque (on ne plante pas pour une planche).
 */
export function planche(fichiers, sortie, { titre = 'Planche contact', colonnes = 4, tuile = 520, hauteur = 340 } = {}) {
  const tuiles = fichiers.map((f) => (Array.isArray(f) ? f : [f, basename(f).replace(/\.png$/, '')]));
  if (!tuiles.length) return null;
  mkdirSync(dirname(sortie), { recursive: true });
  const r = spawnSync('python3', ['-I', '-c', PLANCHE_PY, JSON.stringify({ tuiles, sortie, titre, colonnes, tuile, hauteur })], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.warn(`planche : échec (${(r.stderr || r.error || '').toString().trim().split('\n').pop()})`);
    return null;
  }
  return sortie;
}

// ---- Médias d'essai (ffmpeg) ------------------------------------------------------------------------
export const MEDIAS = join(OUT_T, 'media');
/**
 * mp4 H.264 + AAC (+faststart, 12 s comme les clips du lot V), webm VP9 + Opus (lisible par ce
 * Chromium), affiche sépia : générés une fois sous verification/out/t/media (forcer : regénérer).
 */
export function medias({ forcer = false } = {}) {
  mkdirSync(MEDIAS, { recursive: true });
  const f = {
    mp4: join(MEDIAS, 'essai.mp4'),
    webm: join(MEDIAS, 'essai.webm'),
    png: join(MEDIAS, 'essai-sepia.png'),
    webp: join(MEDIAS, 'essai-sepia.webp'),
  };
  const ff = (args) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg : ${r.stderr || r.error}`);
  };
  if (forcer || !existsSync(f.mp4)) ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '34', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-shortest', f.mp4]);
  if (forcer || !existsSync(f.webm)) ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libvpx-vp9', '-b:v', '250k', '-deadline', 'realtime', '-c:a', 'libopus', '-b:a', '32k', '-shortest', f.webm]);
  if (forcer || !existsSync(f.png)) ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=1:duration=1', '-frames:v', '1', '-vf', 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131', f.png]);
  if (forcer || !existsSync(f.webp)) ff(['-i', f.png, '-frames:v', '1', f.webp]);
  return f;
}

/** Atomes de tête d'un mp4 : faststart si « moov » précède « mdat ». */
export function atomesMp4(fichier) {
  const b = readFileSync(fichier);
  const atomes = [];
  let o = 0;
  while (o + 8 <= b.length && atomes.length < 64) {
    let taille = b.readUInt32BE(o);
    const type = b.toString('latin1', o + 4, o + 8);
    if (taille === 1 && o + 16 <= b.length) taille = Number(b.readBigUInt64BE(o + 8));
    if (taille === 0) taille = b.length - o;
    atomes.push({ type, o, taille });
    if (taille < 8) break;
    o += taille;
  }
  const moov = atomes.find((a) => a.type === 'moov');
  const mdat = atomes.find((a) => a.type === 'mdat');
  return { atomes: atomes.map((a) => a.type), faststart: !!moov && (!mdat || moov.o < mdat.o), octets: b.length };
}

// ---- Bundle et cible des vérifications ----------------------------------------------------------
/** Le bundle le plus récent de dist/ds-*\/components qui contient la carte Carnet. */
export function bundleParDefaut() {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) return 'dist/ds/components';
  const cands = readdirSync(dist)
    .filter((d) => /^ds(-|$)/.test(d) && existsSync(join(dist, d, 'components/bundle.js')))
    .map((d) => ({ d, t: statSync(join(dist, d, 'components/bundle.js')).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const c of cands) {
    const js = readFileSync(join(dist, c.d, 'components/bundle.js'), 'utf8');
    if (/Carnet/.test(js) && /Artboards/.test(js)) return `dist/${c.d}/components`;
  }
  return 'dist/ds/components';
}

/**
 * Cible des vérifications, selon les options :
 *   --site <dossier>   site construit (vite build), servi en mode site → index.html
 *   --url <url>        URL absolue (http…) ou chemin servi depuis la racine du dépôt
 *   --banc [--defaut x] banc factice harness/banc-soulever.html (défaut injecté facultatif)
 *   (rien)             carte Carnet autonome : harness/devices.html?b=<--bundle | le plus récent>
 * url(e, hash) compose l'adresse d'un écran (encoches simulées pour les bancs) et du lien profond.
 */
export async function ouvrirCible({ site, url, banc, defaut, bundle, base } = {}) {
  let srv = null;
  let depart;
  let type;
  if (site) {
    srv = await serveSite(resolve(ROOT, site), { base: base ?? '/' });
    depart = `${srv.url}/index.html`;
    type = 'site';
  } else if (url && /^https?:\/\//.test(url)) {
    depart = url;
    type = 'url';
  } else {
    srv = await serve(ROOT);
    if (url) { depart = `${srv.url}/${url.replace(/^\//, '')}`; type = 'url'; }
    else if (banc) { depart = `${srv.url}/harness/banc-soulever.html${defaut ? `?defaut=${encodeURIComponent(defaut)}` : ''}`; type = 'banc'; }
    else { depart = `${srv.url}/harness/devices.html?b=${encodeURIComponent(bundle ?? bundleParDefaut())}`; type = 'carnet'; }
  }
  const composer = (e, hash = '', extra = {}) => {
    const u = new URL(depart);
    const h = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : u.hash;
    u.hash = '';
    if (e && /harness\//.test(u.pathname) && !u.searchParams.has('insets')) u.searchParams.set('insets', e.insets.join(','));
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    return u.toString().replace(/#.*$/, '') + h;
  };
  return { srv, type, depart, url: composer, close: () => srv?.close() };
}

/** Attend que la page soit prête (banc, carte, site) ; renvoie l'erreur signalée par le banc, s'il y en a. */
export async function attendrePret(page, timeout = 30000) {
  await page.waitForFunction(() => window.__gcDevices?.ready === true || window.__gcBanc?.ready === true
    || window.__gcReady === true || window.__gcMotion?.ready === true
    || (!!document.querySelector('.gc-livre-ecran') && document.readyState === 'complete'), null, { timeout });
  await page.evaluate(() => document.fonts?.ready);
  // Plan v4 : le livre arrive sur la table (et, avec un lien profond, s'ouvre et feuillette jusqu'à la
  // page) ; on n'interagit et on ne mesure qu'une fois posé.
  await attendreArrivee(page, timeout);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(() => window.__gcDevices?.error ?? window.__gcBanc?.error ?? window.__gcError ?? window.__gcMotion?.error ?? null);
}

/** Attend la fin de l'arrivée du livre ([data-gc-arrivee="en-cours"] absent) ; true si elle a eu lieu. */
export async function attendreArrivee(page, timeout = 30000) {
  const avait = await page.evaluate(() => !!document.querySelector('[data-gc-arrivee]')).catch(() => false);
  await page.waitForFunction(() => !document.querySelector('[data-gc-arrivee="en-cours"]'), null, { timeout, polling: 50 }).catch(() => {});
  return avait;
}

/** Ouvre une page instrumentée dans un nouveau contexte de l'écran e. */
export async function ouvrirPage(browser, cible, e, hash = '', { contexteExtra = {}, init = [], extra = {} } = {}) {
  const ctx = await contexte(browser, e, contexteExtra);
  await instrumenterGeste(ctx);
  for (const s of init) await ctx.addInitScript(s.fn ?? s, s.arg);
  const page = await ctx.newPage();
  const surv = surveiller(page);
  await page.goto(cible.url(e, hash, extra));
  const err = await attendrePret(page).catch((x) => `page jamais prête : ${String(x).split('\n')[0]}`);
  if (err) surv.erreurs.push(err);
  await page.waitForTimeout(300);
  return { ctx, page, surv };
}

// ---- Rapport --------------------------------------------------------------------------------------
export const ATTENTE_INTEGRATION = 'non trouvé : à relancer après intégration';
const SYMBOLE = { OK: '✓', KO: '✗', ATTENTE: '…', INFO: 'i' };

export class Rapport {
  constructor(nom, { dir = OUT_T, meta = {} } = {}) {
    this.nom = nom;
    this.dir = dir;
    this.tests = [];
    this.captures = [];
    this.meta = { date: new Date().toISOString(), ...meta };
    mkdirSync(dir, { recursive: true });
  }

  ajouter(ecran, test, statut, detail = '') {
    const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
    this.tests.push({ ecran, test, statut, detail: d });
    console.log(`  ${SYMBOLE[statut] ?? '?'} ${statut.padEnd(7)} ${ecran ? `[${ecran}] ` : ''}${test}${d ? `  — ${d}` : ''}`);
    return statut === 'OK';
  }

  ok(ecran, test, cond, detail = '') { return this.ajouter(ecran, test, cond ? 'OK' : 'KO', detail); }
  attente(ecran, test, raison = ATTENTE_INTEGRATION) { return this.ajouter(ecran, test, 'ATTENTE', raison); }
  info(ecran, test, detail = '') { return this.ajouter(ecran, test, 'INFO', detail); }
  capturer(f, legende) { this.captures.push([f, legende ?? basename(f).replace(/\.png$/, '')]); return f; }

  bilan() {
    const b = { OK: 0, KO: 0, ATTENTE: 0, INFO: 0 };
    for (const t of this.tests) b[t.statut] = (b[t.statut] ?? 0) + 1;
    return b;
  }

  /** Écrit <dir>/<nom>.json et <dir>/<nom>.md ; renvoie le chemin du JSON. */
  ecrire(extra = {}) {
    const b = this.bilan();
    const f = join(this.dir, `${this.nom}.json`);
    writeFileSync(f, JSON.stringify({ nom: this.nom, ...this.meta, bilan: b, tests: this.tests, captures: this.captures.map(([c, l]) => [rel(c), l]), ...extra }, null, 2));
    const md = [`# ${this.nom}`, '', `${this.meta.date} · OK ${b.OK} · KO ${b.KO} · ATTENTE ${b.ATTENTE} · INFO ${b.INFO}`, '',
      '| Écran | Test | Statut | Détail |', '|---|---|---|---|',
      ...this.tests.map((t) => `| ${t.ecran ?? ''} | ${t.test} | ${t.statut} | ${String(t.detail).replace(/\|/g, '\\|').slice(0, 300)} |`)];
    writeFileSync(join(this.dir, `${this.nom}.md`), md.join('\n') + '\n');
    console.log(`\n${this.nom} : OK ${b.OK} · KO ${b.KO} · ATTENTE ${b.ATTENTE} · INFO ${b.INFO} → ${rel(f)}`);
    return f;
  }

  code() { return this.bilan().KO ? 1 : 0; }
}

// ---- Divers -------------------------------------------------------------------------------------------
/** Bornes du zoom fin par cran, lues dans src/lib/camera.tsx (zoomBornes) ; repli : valeurs du contrat. */
export function zoomBornes() {
  const defaut = { proche: [0.85, 1.08], moyenne: [0.87, 1.12], loin: [0.95, 1.15] };
  try {
    const src = readFileSync(join(ROOT, 'src/lib/camera.tsx'), 'utf8');
    const m = /function zoomBornes[\s\S]*?return\s+([\s\S]*?);\s*\n\}/.exec(src);
    if (!m) return defaut;
    const t = m[1];
    const pr = /'proche'\s*\?\s*\[([\d.]+),\s*([\d.]+)\]/.exec(t);
    const mo = /'moyenne'\s*\?\s*\[([\d.]+),\s*([\d.]+)\]/.exec(t);
    const lo = /:\s*\[([\d.]+),\s*([\d.]+)\]\s*$/.exec(t.trim());
    if (!pr || !mo || !lo) return defaut;
    return { proche: [+pr[1], +pr[2]], moyenne: [+mo[1], +mo[2]], loin: [+lo[1], +lo[2]] };
  } catch {
    return defaut;
  }
}

export const REGLAGES_DEFAUT = { v: 1, son: true, volume: 1, volumeBruitages: 0.8, lectureAuto: false, vitesse: 'normale', mouvementReduit: false, volumeMusique: 0.5 };

/** Script d'init : écrit des réglages (gc:reglages:v3) avant le chargement de l'application. */
export const initReglages = (r) => ({
  fn: (x) => { try { if (!sessionStorage.getItem('__gcInitFait')) { localStorage.setItem('gc:reglages:v3', JSON.stringify(x)); sessionStorage.setItem('__gcInitFait', '1'); } } catch { /* stockage indisponible */ } },
  arg: { v: 1, ...r },
});

/** Script d'init : localStorage.setItem lève toujours une exception (quota, navigation privée). */
export const initStockageQuiLeve = {
  fn: () => {
    const lever = () => { throw new DOMException('stockage plein (simulé)', 'QuotaExceededError'); };
    try { Storage.prototype.setItem = lever; } catch { /* rien */ }
    try { Object.defineProperty(window.localStorage, 'setItem', { value: lever, configurable: true }); } catch { /* rien */ }
  },
};

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
