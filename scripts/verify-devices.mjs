// Le carnet sur tous les écrans (CONTRACT § 11, § 12) : émulation Playwright de téléphones, tablettes,
// ordinateurs et TV, sur la page autonome harness/devices.html (React UMD + bundle.js,
// Artboards.Carnet, encoches simulées par &insets=) ou sur le site construit (--site).
//
// Pour chaque écran (au repos : couverture, puis double page de Julie) :
//   - aucune page hors cadre (les pages cadrées tiennent dans la fenêtre et dans la zone sûre) ;
//   - contrôles visibles et dans les zones sûres ; cibles ≥ 44 px sur écran tactile ;
//   - hauteur d'x angulaire ≥ celle de la TV (14 px à 3 m sur une TV de 1,2 m pour 1920 px) :
//     la plus petite hauteur d'x des tokens du cran affiché × l'échelle de la page à l'écran,
//     ramenée à l'angle de vue (téléphone 0,16 mm/px à 30 cm, tablette 0,19 mm/px à 40 cm,
//     ordinateur 0,26 mm/px à 60 cm, TV 1,2 m de large à 3 m) ;
//   - aucun [data-gc-fit="overflow"] ;
//   - bouton de réglages [data-gc-reglages="bouton"] : visible, dans la zone sûre, ≥ 44 px au doigt ;
//   - photo collée [data-gc-objet="photo"] sur la page vidéo de chaque lien de --videos (julie, lisa) ;
//   - #lisa ouvre la double page de Lisa (en cadrage « page » : sa page vidéo, à gauche).
//   Ce qui n'est pas encore intégré (bouton, photo, Lisa) est ATTENTE, pas KO.
// Interactions (doigt : événements tactiles CDP → Pointer Events « touch » ; souris pour l'ordinateur) :
//   toucher la photo (elle se soulève, Échap la repose), glisser vers l'avant et l'arrière, geste vif
//   court, toucher la marge, lien profond (#mathis, puis à l'ouverture #rose et #inconnu), rotation
//   portrait → paysage → portrait (on reste sur la même page ; une photo soulevée se repose).
// Plan v4 (livre vivant, lot A) :
//   - coin (iPad couché, cadrage double ; iPhone debout, cadrage page) : un simple toucher d'angle lève le
//     coin et le repose sans tourner ; une diagonale depuis l'angle tourne la page (relais vers le 3D) ;
//   - curseurs (ordinateur, souris) : data-gc-curseur = grab dans un angle, pointer dans une marge, rien au
//     milieu de la page, grabbing en glissant ; Entrée ouvre le livre fermé ; l'annonce aux lecteurs
//     d'écran reprend le titre de la double page ; Fin puis → referme le livre sur son plat arrière
//     (ATTENTE tant que le colophon n'est pas cuit).
// Boutons qui s'effacent (src/lib/controles.ts) : ils disparaissent seuls après 3 s sans activité ; avant chaque
//   mesure, un petit mouvement de souris les rappelle (reveiller). Par écran : l'état caché (data-gc-controles =
//   « caches », opacité effective nulle, mais ni display:none, ni visibility:hidden, ni inert, ni aria-hidden) et
//   le retour au clavier (Tab) ; suite « boutons » : au doigt, le premier toucher sur un bouton effacé ne fait que
//   les rappeler ; à la souris, le mouvement les rappelle et le réglage « toujours visibles » les garde.
// Captures dans <out>/, planche contact <out>/planche.png, rapport <out>/devices.json + devices.md.
//
//   node scripts/verify-devices.mjs [--bundle dist/ds-t/components | --site dist/site]
//        [--out verification/out/t/devices] [--only iphone13-portrait,tv-1080] [--no-interactions]
//        [--suites doigt,rotation,reduit,souris,coin,curseurs,boutons] [--videos julie,lisa]
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ROOT, lireArgs, ECRANS, ecrans, tactile, lancer, ouvrirCible, ouvrirPage, Rapport, etatLivre, calme, capture,
  toucher, glisser, glisserSouris, rectDe, existe, attendreAttr, stabiliser, cibles44, zoneSure, dansZone, planche,
  bundleParDefaut, rel, cdpDe,
} from './lib/verif.mjs';

const { opt, drapeau, liste } = lireArgs();
const site = opt('site');
const bundle = site ? null : opt('bundle', bundleParDefaut());
const outDir = resolve(ROOT, opt('out', 'verification/out/t/devices'));
const interactions = !drapeau('no-interactions');
const suitesVoulues = liste('suites');
const videos = liste('videos', 'julie,lisa');
const ECRANS_ = ecrans(liste('only'));

/** Lecture : mm par px CSS et distance de lecture (mm). */
const LECTURE = {
  telephone: { mm: 0.16, dist: 300, libelle: 'téléphone, 30 cm' },
  tablette: { mm: 0.19, dist: 400, libelle: 'tablette, 40 cm' },
  ordinateur: { mm: 0.26, dist: 600, libelle: 'ordinateur, 60 cm' },
  tv: { mm: 1200 / 1920, dist: 3000, libelle: 'TV 1,2 m, 3 m' },
};
/** Référence : 14 px de hauteur d'x sur la TV 1920 px (1,2 m de large) vue à 3 m (mrad). */
const REF_MRAD = ((14 * 1200) / 1920 / 3000) * 1000;
const PHOTO = '.gc-livre__page--visible [data-gc-objet="photo"]';
const CALQUE = '[data-gc-soulever]';
const BOUTON_REGLAGES = '[data-gc-reglages="bouton"]';

const cible = await ouvrirCible({ site, url: opt('url'), bundle });
const R = new Rapport('devices', { dir: outDir, meta: { cible: cible.type, depart: cible.depart, bundle, refMrad: Math.round(REF_MRAD * 1000) / 1000 } });
const insets = (e) => (cible.type === 'carnet' ? e.insets : [0, 0, 0, 0]);
console.log(`■ Tous les écrans — ${cible.type} : ${cible.depart}`);

/** Attend l'état voulu (sous rastérisation logicielle, un geste peut prendre plusieurs secondes). */
async function attendreEtat(page, attendu, f = (s) => s, ms = 45000) {
  const t0 = Date.now();
  let s = f(await etatLivre(page));
  while (!Object.entries(attendu).every(([k, v]) => s[k] === v) && Date.now() - t0 < ms) {
    // Demande une image : en émulation, un changement de fenêtre n'est traité qu'à la prochaine image.
    await page.evaluate(() => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 1000); }));
    await page.waitForTimeout(250);
    s = f(await etatLivre(page));
  }
  return s;
}
const repos = (page, ms = 450, debutMax = 4000) => calme(page, { calme: ms, debutMax });

// ---- Boutons qui s'effacent (src/lib/controles.ts) -------------------------------------------------
/** Attend l'état des boutons (data-gc-controles = « visibles » | « caches » sur .gc-ecran) ; false si jamais atteint. */
const attendreControles = (page, valeur, timeout = 8000) =>
  page.waitForFunction((v) => document.querySelector('.gc-ecran')?.getAttribute('data-gc-controles') === v, valeur, { timeout }).then(() => true, () => false);
let reveil = 0;
/**
 * Les boutons s'effacent après 3 s sans activité : un petit mouvement de souris (toujours près du bord haut, au
 * milieu, où il n'y a rien) les rappelle, puis on laisse finir le fondu (0,2 s). Deux fois le même point ne
 * compterait pas : on alterne. À faire juste avant de mesurer ou de photographier les contrôles.
 */
async function reveiller(page) {
  const { width: W } = page.viewportSize();
  await page.mouse.move(W * 0.5 + (reveil++ % 2 ? 7 : -7), 3, { steps: 2 });
  await attendreControles(page, 'visibles', 5000);
  await page.waitForTimeout(350);
}
/** La double page affichée est celle de l'invité `id` (identifiant « id » ou « …-id »). */
const sur = (s, id) => s.double >= 0 && s.spreads.some((x) => x.toLowerCase() === id || x.toLowerCase().endsWith(`-${id}`));
// Les attentes sont relatives à la double page de départ (#julie) : l'ordre des invités peut changer
// (Lisa en tête de la démo), pas le fait qu'un geste avance ou recule d'une double page.

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
    // Opacité effective : celle du bouton fois celles de ses ancêtres (la barre, les flèches et les points
    // s'effacent en bloc : le bouton, lui, garde sa propre opacité).
    const effective = (el) => { let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
    const ctrls = [...document.querySelectorAll('.gc-ecran__controles button')].map((b) => {
      const r = rect(b);
      const st = getComputedStyle(b);
      const visible = r.w > 0 && r.h > 0 && st.visibility !== 'hidden' && st.display !== 'none' && effective(b) > 0.05 && !b.closest('[inert], [hidden]');
      const dansSure = r.x >= il - tol && r.y >= it - tol && r.r <= vw - ir + tol && r.b <= vh - ib + tol;
      return { nom: b.getAttribute('aria-label') || b.textContent.trim().slice(0, 30), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), visible, dansSure };
    });
    const fleches = ctrls.filter((c) => /Page (précédente|suivante)/.test(c.nom ?? ''));
    // Hauteur d'x : plus petite valeur des tokens du cran affiché, à l'échelle de la page à l'écran.
    const roles = ['title', 'body', 'note', 'meta', 'signature', 'annotation'];
    const xs = cs ? roles.map((k) => parseFloat(cs.getPropertyValue(`--gc-x-${k}`))).filter((v) => v > 0) : [];
    const xMin = xs.length ? Math.min(...xs) : 0;
    const echelle = W > 0 && d ? rect(d).w / W : 0;
    return {
      vw, vh, cadrage, cote, double, distance: livre?.closest('[data-gc-distance]')?.getAttribute('data-gc-distance'),
      echelle: Math.round(echelle * 10000) / 10000, xMinToken: xMin, xPx: Math.round(xMin * echelle * 100) / 100,
      pages: pages.map(([n, r]) => ({ n, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })),
      hors, horsSure, controles: ctrls, fleches: fleches.length,
      debordements: document.querySelectorAll('.gc-livre__page--visible [data-gc-fit="overflow"]').length,
      tactile,
    };
  }, { insets: insets(e), tactile: tactile(e) });
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
    cibles: { ok: m.tactile ? ok(visibles.every((c) => c.w >= 44 && c.h >= 44)) : 's.o.', detail: visibles.length ? `min ${Math.min(...visibles.map((c) => Math.min(c.w, c.h)))} px` : 'aucun contrôle' },
    hauteurX: { ok: ok(mrad >= REF_MRAD - 1e-6), px: m.xPx, mrad: Math.round(mrad * 1000) / 1000, ref: Math.round(REF_MRAD * 1000) / 1000, lecture: lect.libelle },
  };
}

/** Bouton de réglages : présent, dans la zone sûre, ≥ 44 px au doigt (ATTENTE s'il n'est pas intégré). */
async function jugerReglages(page, e) {
  const b = await rectDe(page, BOUTON_REGLAGES);
  if (!b) return { ok: 'ATTENTE', detail: 'bouton absent : à relancer après intégration' };
  const z = await zoneSure(page, insets(e));
  const c = (await cibles44(page, BOUTON_REGLAGES))[0];
  const pb = [!b.visible && 'invisible', b.visible && !dansZone(b, z) && 'hors zone sûre', tactile(e) && c && !c.ok && `cible ${c.w}×${c.h} px`].filter(Boolean);
  return { ok: pb.length ? 'KO' : 'OK', detail: pb.join(', ') || `${Math.round(b.w)}×${Math.round(b.h)} à ${Math.round(b.x)},${Math.round(b.y)}` };
}

/**
 * Boutons effacés : après 3 s sans activité, data-gc-controles = « caches » et l'opacité effective des boutons est
 * nulle, mais ils restent là (ni display:none, ni visibility:hidden, ni inert, ni aria-hidden) ; Tab les atteint et
 * les rappelle. À faire en dernier sur la page : le focus qu'on y laisse empêche les boutons de s'effacer.
 */
async function jugerEffacement(page, e, captures) {
  await reveiller(page);
  const ok = await attendreControles(page, 'caches', 9000);
  await page.waitForTimeout(600); // fin du fondu (0,4 s)
  if (captures) captures.push(await capture(page, `${e.nom}-julie-boutons-caches`, outDir));
  const m = await page.evaluate(() => {
    const effective = (el) => { let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
    const boutons = [...document.querySelectorAll('.gc-ecran__controles [data-gc-effacable] button, .gc-ecran__controles button[data-gc-effacable]')];
    const caches = boutons.filter((b) => {
      const st = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      return st.display === 'none' || st.visibility === 'hidden' || r.width === 0 || r.height === 0 || !!b.closest('[inert], [aria-hidden="true"], [hidden]');
    }).length;
    return { n: boutons.length, opMax: Math.max(0, ...boutons.map(effective)), retires: caches };
  });
  await page.keyboard.press('Tab');
  let atteint = await page.evaluate(() => !!document.activeElement?.closest('[data-gc-effacable]'));
  let tabs = 1;
  while (!atteint && tabs < 20) {
    await page.keyboard.press('Tab');
    tabs++;
    atteint = await page.evaluate(() => !!document.activeElement?.closest('[data-gc-effacable]'));
  }
  const revenus = await attendreControles(page, 'visibles', 3000);
  const pb = [!ok && 'jamais effacés', m.n < 2 && `${m.n} bouton(s)`, m.opMax > 0.02 && `opacité ${m.opMax.toFixed(2)}`, m.retires && `${m.retires} bouton(s) retiré(s) (display, visibility, inert, aria-hidden)`, !atteint && 'Tab n\'atteint aucun bouton', !revenus && 'Tab ne les rappelle pas'].filter(Boolean);
  return { ok: pb.length ? 'KO' : 'OK', detail: pb.join(', ') || `${m.n} boutons effacés (opacité ${m.opMax.toFixed(2)}), Tab les atteint au ${tabs}ᵉ appui et les rappelle` };
}

/** Photo collée sur la page vidéo affichée (ATTENTE tant que Soulever n'est pas intégré). */
async function jugerPhoto(page) {
  const r = await rectDe(page, PHOTO);
  if (r?.visible) return { ok: 'OK', detail: `${Math.round(r.w)}×${Math.round(r.h)}` };
  const integre = await existe(page, CALQUE);
  return integre ? { ok: 'KO', detail: 'calque soulever présent mais aucune photo sur la page vidéo' } : { ok: 'ATTENTE', detail: 'photo absente : à relancer après intégration' };
}

// ---- Interactions --------------------------------------------------------------------------------
const centre = async (page, sel) => { const r = await rectDe(page, sel); return r ? [r.cx, r.cy] : null; };

/** Toucher (ou cliquer) la photo : elle se soulève ; Échap la repose. */
async function essaiPhoto(page, e, res, tap) {
  const p = await centre(page, PHOTO);
  if (!p) { res.push({ test: 'toucher la photo : elle se soulève', ok: 'ATTENTE', obtenu: 'photo absente : à relancer après intégration' }); return; }
  await tap(p[0], p[1]);
  const o = await attendreAttr(page, CALQUE, 'data-gc-soulever', 'ouvert');
  res.push({ test: `${tactile(e) ? 'toucher' : 'clic sur'} la photo : elle se soulève`, ok: o ? 'OK' : 'KO', obtenu: await etatLivre(page).then((s) => s.soulever) });
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  const f = await attendreAttr(page, CALQUE, 'data-gc-soulever', 'ferme');
  await stabiliser(page, PHOTO);
  res.push({ test: 'Échap : la photo se repose', ok: f ? 'OK' : 'KO', obtenu: await etatLivre(page).then((s) => s.soulever) });
}

async function suiteTactile(browser, e, captures) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, '#julie');
  const res = [];
  const W = page.viewportSize().width;
  const H = page.viewportSize().height;
  const y = H * 0.5;
  const verifier = async (test, attendu, f = (s) => s) => {
    const obtenu = await attendreEtat(page, attendu, f);
    await repos(page, 300, 300);
    const ok = Object.entries(attendu).every(([k, v]) => obtenu[k] === v);
    res.push({ test, attendu, obtenu: Object.fromEntries(Object.keys(attendu).map((k) => [k, obtenu[k]])), ok: ok ? 'OK' : 'KO' });
    return ok;
  };
  const shot = async (nom) => captures.push(await capture(page, `${e.nom}-${nom}`, outDir));
  const depart = await etatLivre(page);
  const page_ = depart.cadrage === 'page';
  const d0 = depart.double;

  // 1. Toucher la photo : elle se soulève, Échap la repose.
  await essaiPhoto(page, e, res, (x, yy) => toucher(page, x, yy));

  if (page_) {
    // 2. Page gauche → glisser vers la gauche : la caméra glisse vers la page droite.
    await glisser(page, [W * 0.8, y], [W * 0.3, y], { ms: 450, avantLacher: () => shot('glisse-mi') });
    await repos(page);
    await verifier('glisser ← sur la page gauche : page droite', { double: d0, cote: 'droite' });
    await shot('julie-droite');
  }
  // 3. Glisser vers la gauche : la feuille tourne (la caméra la suit en cadrage page).
  await glisser(page, [W * 0.85, y], [W * 0.2, y], { ms: 700, n: 20, avantLacher: () => shot('tour-mi') });
  await repos(page);
  await verifier('glisser ← : double page suivante (l\'URL suit)', page_ ? { double: d0 + 1, cote: 'gauche', urlSuit: true } : { double: d0 + 1, urlSuit: true }, (s) => ({ ...s, urlSuit: !!s.hash && s.hash !== '#julie' && sur(s, s.hash.slice(1).toLowerCase()) }));
  await shot('rose');
  // 4. Glisser vers la droite : retour.
  await glisser(page, [W * 0.2, y], [W * 0.85, y], { ms: 700, n: 20, avantLacher: () => shot('retour-mi') });
  await repos(page);
  await verifier('glisser → : double page précédente', page_ ? { double: d0, cote: 'droite' } : { double: d0 });
  // 5. Geste vif court : ~ 15 % de la largeur en 70 ms.
  await glisser(page, [W * 0.6, y], [W * 0.45, y], { ms: 70, n: 5 });
  await repos(page);
  await verifier('geste vif court ← : la page tourne', page_ ? { double: d0 + 1, cote: 'gauche' } : { double: d0 + 1 });
  // 6. Toucher les marges : précédent, puis suivant.
  const marge = async (cote_) => page.evaluate((c) => {
    const s = document.querySelector('.gc-livre-ecran');
    const pageMode = s.getAttribute('data-gc-cadrage') === 'page';
    const g = document.querySelector('.gc-livre__emplacement--gauche').getBoundingClientRect();
    const d = document.querySelector('.gc-livre__emplacement--droite').getBoundingClientRect();
    const p = pageMode ? (s.getAttribute('data-gc-cote') === 'gauche' ? g : d) : null;
    const gauche = p ? p.left : g.left;
    const droite = p ? p.right : d.right;
    return { x: c === 'g' ? gauche + d.width * 0.05 : droite - d.width * 0.05, y: (d.top + d.bottom) / 2 };
  }, cote_);
  let m = await marge('g');
  await toucher(page, m.x, m.y);
  await repos(page);
  await verifier('toucher la marge gauche : page précédente', page_ ? { double: d0, cote: 'droite' } : { double: d0 });
  m = await marge('d');
  await toucher(page, m.x, m.y);
  await repos(page);
  await verifier('toucher la marge droite : page suivante', page_ ? { double: d0 + 1, cote: 'gauche' } : { double: d0 + 1 });
  // 7. Lien profond dans le carnet ouvert : le fragment change, le livre y va.
  await page.evaluate(() => { location.hash = '#mathis'; });
  await repos(page, 450, 6000);
  await verifier('fragment #mathis : double page de Mathis', { mathis: true, hash: '#mathis' }, (s) => ({ ...s, mathis: sur(s, 'mathis') }));
  const dMathis = (await etatLivre(page)).double;
  // Glisser vertical : rien ne bouge (aucun défilement non plus).
  await glisser(page, [W * 0.5, H * 0.7], [W * 0.52, H * 0.3], { ms: 300 });
  await page.waitForTimeout(400);
  const defile = await page.evaluate(() => window.scrollY + document.scrollingElement.scrollTop);
  await verifier('glisser vertical : rien ne bouge', { double: dMathis, defilement: 0 }, (s) => ({ ...s, defilement: defile }));
  const erreurs = [...surv.erreurs];
  await ctx.close();

  // 8. Lien profond à l'ouverture.
  const o2 = await ouvrirPage(browser, cible, e, '#rose');
  const s2 = await etatLivre(o2.page);
  res.push({ test: 'ouvrir …#rose', attendu: { rose: true, cote: 'gauche (cadrage page)' }, obtenu: { double: s2.double, cote: s2.cote, pages: s2.spreads.join(', ') }, ok: sur(s2, 'rose') && (s2.cadrage !== 'page' || s2.cote === 'gauche') ? 'OK' : 'KO' });
  await o2.ctx.close();
  const o3 = await ouvrirPage(browser, cible, e, '#inconnu');
  const s3 = await etatLivre(o3.page);
  res.push({ test: 'ouvrir …#inconnu : couverture', attendu: { double: -1 }, obtenu: { double: s3.double }, ok: s3.double === -1 ? 'OK' : 'KO' });
  erreurs.push(...o2.surv.erreurs, ...o3.surv.erreurs);
  await o3.ctx.close();
  return { tests: res, erreurs };
}

/** Rotation : portrait → paysage → portrait, la page reste ; une photo soulevée se repose. */
async function suiteRotation(browser, e, captures) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, '#julie');
  const res = [];
  const vp = page.viewportSize();
  const d0 = (await etatLivre(page)).double;
  const p = await centre(page, PHOTO);
  if (p) {
    await toucher(page, p[0], p[1]);
    await attendreAttr(page, CALQUE, 'data-gc-soulever', 'ouvert');
    await page.waitForTimeout(500);
  }
  await page.setViewportSize({ width: vp.height, height: vp.width });
  let s = await attendreEtat(page, { cadrage: 'double' }, (x) => x, 90000);
  res.push({ test: 'rotation → paysage', attendu: { double: d0, cadrage: 'double' }, obtenu: { double: s.double, cadrage: s.cadrage }, ok: s.double === d0 && s.cadrage === 'double' ? 'OK' : 'KO' });
  if (p) {
    const f = await attendreAttr(page, CALQUE, 'data-gc-soulever', 'ferme');
    res.push({ test: 'rotation : la photo soulevée se repose', attendu: { soulever: 'ferme' }, obtenu: { soulever: (await etatLivre(page)).soulever }, ok: f ? 'OK' : 'KO' });
  } else res.push({ test: 'rotation : la photo soulevée se repose', ok: 'ATTENTE', obtenu: 'photo absente : à relancer après intégration' });
  captures.push(await capture(page, `${e.nom}-rotation-paysage`, outDir));
  await page.setViewportSize(vp);
  s = await attendreEtat(page, { cadrage: 'page' }, (x) => x, 90000);
  res.push({ test: 'retour en portrait : même page', attendu: { double: d0, cadrage: 'page', cote: 'gauche' }, obtenu: { double: s.double, cadrage: s.cadrage, cote: s.cote }, ok: s.double === d0 && s.cadrage === 'page' && s.cote === 'gauche' ? 'OK' : 'KO' });
  await repos(page, 300, 500);
  captures.push(await capture(page, `${e.nom}-rotation-retour`, outDir));
  const erreurs = [...surv.erreurs];
  await ctx.close();
  return { tests: res, erreurs };
}

/** Souris (ordinateur) : glisser pour tourner, clic sur la photo, clavier. */
async function suiteSouris(browser, e) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, '#julie');
  const res = [];
  const { width: W, height: H } = page.viewportSize();
  const d0 = (await etatLivre(page)).double;
  await glisserSouris(page, [W * 0.8, H * 0.5], [W * 0.35, H * 0.5], { ms: 500 });
  let s = await attendreEtat(page, { double: d0 + 1 });
  await repos(page);
  res.push({ test: 'souris : glisser ← tourne la page', attendu: { double: d0 + 1 }, obtenu: { double: s.double }, ok: s.double === d0 + 1 ? 'OK' : 'KO' });
  await glisserSouris(page, [W * 0.3, H * 0.5], [W * 0.75, H * 0.5], { ms: 500 });
  s = await attendreEtat(page, { double: d0 });
  await repos(page);
  res.push({ test: 'souris : glisser → revient', attendu: { double: d0 }, obtenu: { double: s.double }, ok: s.double === d0 ? 'OK' : 'KO' });
  await essaiPhoto(page, e, res, (x, y) => page.mouse.click(x, y));
  await page.keyboard.press('ArrowRight');
  s = await attendreEtat(page, { double: d0 + 1 });
  res.push({ test: 'clavier → : double page suivante', attendu: { double: d0 + 1 }, obtenu: { double: s.double }, ok: s.double === d0 + 1 ? 'OK' : 'KO' });
  const erreurs = [...surv.erreurs];
  await ctx.close();
  return { tests: res, erreurs };
}

/** Moins de mouvement : un glisser tourne la page en fondu, sans feuillet. */
async function suiteReduite(browser, e) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, '#julie', { contexteExtra: { reducedMotion: 'reduce' } });
  const { width: W, height: H } = page.viewportSize();
  const d0 = (await etatLivre(page)).double;
  await glisser(page, [W * 0.8, H * 0.5], [W * 0.3, H * 0.5], { ms: 300 });
  await attendreEtat(page, { cote: 'droite' }, (x) => x, 20000);
  await glisser(page, [W * 0.8, H * 0.5], [W * 0.3, H * 0.5], { ms: 300 });
  const s = await attendreEtat(page, { double: d0 + 1 }, (x) => x, 20000);
  const feuillet = await page.evaluate(() => document.querySelectorAll('.gc-livre-feuillet').length);
  const erreurs = [...surv.erreurs];
  await ctx.close();
  return { tests: [{ test: '2 glisser ← = 2 pages, aucun feuillet', attendu: { double: d0 + 1, cote: 'gauche', feuillets: 0 }, obtenu: { double: s.double, cote: s.cote, feuillets: feuillet }, ok: s.double === d0 + 1 && s.cote === 'gauche' && feuillet === 0 ? 'OK' : 'KO' }], erreurs };
}

// ---- Plan v4 : le coin, les curseurs, Entrée, l'annonce, le plat arrière -----------------------------
/** Le doigt se pose sur (x0, y0), attend que le coin se lève, puis glisse jusqu'à (x1, y1). */
async function diagonale(page, [x0, y0], [x1, y1], { pose = 220, ms = 650, n = 24 } = {}) {
  const cdp = await cdpDe(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  await page.waitForTimeout(pose);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const e = t * t * (3 - 2 * t);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * e, y: y0 + (y1 - y0) * e, id: 1 }] });
    await page.waitForTimeout(ms / n);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Angle bas extérieur de la page cadrée (page de droite en cadrage double) et un point vers l'intérieur. */
const angleBas = (page) => page.evaluate(() => {
  const s = document.querySelector('.gc-livre-ecran');
  const pageMode = s.getAttribute('data-gc-cadrage') === 'page';
  const cote = pageMode ? s.getAttribute('data-gc-cote') : 'droite';
  const r = document.querySelector(`.gc-livre__emplacement--${cote}`).getBoundingClientRect();
  const dx = r.width * 0.03;
  const dy = r.height * 0.03;
  return cote === 'droite'
    ? { cote, a: [r.right - dx, r.bottom - dy], b: [r.left + r.width * 0.1, r.top + r.height * 0.42] }
    : { cote, a: [r.left + dx, r.bottom - dy], b: [r.right - r.width * 0.1, r.top + r.height * 0.42] };
});

/** Coin au doigt : un toucher d'angle ne tourne pas la page, une diagonale la tourne. */
async function suiteCoin(browser, e, captures) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, '#julie');
  const res = [];
  const d0 = (await etatLivre(page)).double;
  // Le rabat est monté 500 ms après que la page s'est posée.
  const monte = await page.waitForFunction(() => !!document.querySelector('.gc-livre-coin'), null, { timeout: 8000 }).then(() => true, () => false);
  if (!monte) {
    res.push({ test: 'rabat du coin monté au repos', ok: 'KO', obtenu: 'aucun .gc-livre-coin' });
    const erreurs = [...surv.erreurs];
    await ctx.close();
    return { tests: res, erreurs };
  }
  let z = await angleBas(page);
  await toucher(page, z.a[0], z.a[1], { ms: 90 });
  await page.waitForTimeout(1300);
  await repos(page, 300, 400);
  let s = await etatLivre(page);
  res.push({ test: `simple toucher de l'angle (${z.cote}) : la page ne tourne pas`, attendu: { double: d0 }, obtenu: { double: s.double }, ok: s.double === d0 ? 'OK' : 'KO' });
  // Diagonale : le coin suit le doigt, puis le tourne-page 3D prend le relais.
  await page.waitForFunction(() => !!document.querySelector('.gc-livre-coin'), null, { timeout: 8000 }).catch(() => {});
  z = await angleBas(page);
  const n0 = await page.evaluate(() => (window.__gcGestesLivre ?? []).length);
  await diagonale(page, z.a, z.b);
  const attendu = z.cote === 'droite' ? d0 + 1 : d0 - 1;
  s = await attendreEtat(page, { double: attendu });
  await repos(page);
  const types = await page.evaluate((k) => (window.__gcGestesLivre ?? []).slice(k).map((g) => `${g.phase}:${g.type}`), n0);
  res.push({ test: `diagonale depuis l'angle (${z.cote}) : la page tourne`, attendu: { double: attendu }, obtenu: { double: s.double, gestes: types.join(' ') }, ok: s.double === attendu && types.includes('debut:coin') ? 'OK' : 'KO' });
  captures.push(await capture(page, `${e.nom}-coin-apres`, outDir));
  const erreurs = [...surv.erreurs];
  await ctx.close();
  return { tests: res, erreurs };
}

/** Souris : curseurs (attribut data-gc-curseur), annonce, Entrée sur le livre fermé, plat arrière. */
async function suiteCurseurs(browser, e, captures) {
  const res = [];
  const erreurs = [];
  {
    const { ctx, page, surv } = await ouvrirPage(browser, cible, e, '#julie');
    await page.waitForFunction(() => !!document.querySelector('.gc-livre-coin'), null, { timeout: 8000 }).catch(() => {});
    const r = await rectDe(page, '.gc-livre__emplacement--droite');
    const curseur = () => page.evaluate(() => document.querySelector('.gc-livre-ecran')?.getAttribute('data-gc-curseur') ?? null);
    const aller = async (x, y) => { await page.mouse.move(x, y, { steps: 6 }); await page.waitForTimeout(250); return curseur(); };
    const milieu = await aller(r.cx, r.cy);
    const coin = await aller(r.r - r.w * 0.04, r.b - r.h * 0.04);
    captures.push(await capture(page, `${e.nom}-survol-coin`, outDir));
    const marge = await aller(r.r - r.w * 0.05, r.cy);
    await aller(r.r - r.w * 0.04, r.b - r.h * 0.04);
    await page.mouse.down();
    await page.mouse.move(r.r - r.w * 0.12, r.b - r.h * 0.1, { steps: 4 });
    await page.waitForTimeout(150);
    const saisi = await curseur();
    await page.mouse.up();
    await page.waitForTimeout(900);
    await repos(page, 300, 400);
    const ok = milieu === null && coin === 'grab' && marge === 'pointer' && saisi === 'grabbing';
    res.push({ test: 'curseurs : rien au milieu, grab dans l\'angle, pointer dans la marge, grabbing en glissant', attendu: { milieu: null, coin: 'grab', marge: 'pointer', saisi: 'grabbing' }, obtenu: { milieu, coin, marge, saisi }, ok: ok ? 'OK' : 'KO' });
    const annonce = await page.evaluate(() => document.querySelector('.gc-livre__annonce')?.textContent ?? '');
    const titre = await page.evaluate(() => document.querySelector('.gc-livre__page--visible [data-gc-spread]')?.getAttribute('data-gc-spread'));
    res.push({ test: 'annonce : « <titre>, double page N sur M »', attendu: 'Julie — …, double page', obtenu: annonce, ok: /julie/i.test(annonce) && /, double page \d+ sur \d+/.test(annonce) ? 'OK' : 'KO' });
    void titre;
    // Plat arrière : Fin, puis → depuis la dernière double page.
    await page.keyboard.press('End');
    await repos(page, 400, 3000);
    const colophon = await existe(page, '.gc-livre__page--visible [data-gc-spread="colophon"]');
    if (!colophon) res.push({ test: 'Fin puis → : le livre se referme sur son plat arrière', ok: 'ATTENTE', obtenu: 'colophon pas encore dans le carnet (pages non cuites)' });
    else {
      await page.keyboard.press('ArrowRight');
      const ferme = await attendreAttr(page, '.gc-livre', 'data-gc-etat', 'arriere', 15000);
      await repos(page);
      captures.push(await capture(page, `${e.nom}-plat-arriere`, outDir));
      res.push({ test: 'Fin puis → : le livre se referme sur son plat arrière', attendu: { etat: 'arriere' }, obtenu: { etat: await page.evaluate(() => document.querySelector('.gc-livre')?.getAttribute('data-gc-etat')) }, ok: ferme ? 'OK' : 'KO' });
      await page.keyboard.press('ArrowLeft');
      const rouvert = await attendreAttr(page, '.gc-livre', 'data-gc-etat', 'ouvert', 15000);
      res.push({ test: '← sur le plat arrière : le livre se rouvre', attendu: { etat: 'ouvert' }, obtenu: { etat: await page.evaluate(() => document.querySelector('.gc-livre')?.getAttribute('data-gc-etat')) }, ok: rouvert ? 'OK' : 'KO' });
    }
    erreurs.push(...surv.erreurs);
    await ctx.close();
  }
  {
    // Entrée sur le livre fermé : il s'ouvre (sur la première double page).
    const { ctx, page, surv } = await ouvrirPage(browser, cible, e, '');
    const avant = (await etatLivre(page)).double;
    await page.keyboard.press('Enter');
    const s = await attendreEtat(page, { double: 0 }, (x) => x, 30000);
    res.push({ test: 'Entrée sur le livre fermé : il s\'ouvre', attendu: { avant: -1, double: 0 }, obtenu: { avant, double: s.double }, ok: avant === -1 && s.double === 0 ? 'OK' : 'KO' });
    erreurs.push(...surv.erreurs);
    await ctx.close();
  }
  return { tests: res, erreurs };
}

// ---- Boutons qui s'effacent : le toucher de rappel, la souris, le réglage ---------------------------------
/** Au doigt : un toucher sur un bouton effacé ne fait que les rappeler ; un toucher sur le livre fait son action ET les rappelle. */
async function suiteBoutonsDoigt(browser, e, captures) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, '#julie');
  const res = [];
  const mesure = () => page.evaluate(() => document.querySelector('.gc-ecran')?.getAttribute('data-gc-controles'));
  const effaces = async () => { const ok = await attendreControles(page, 'caches', 9000); await page.waitForTimeout(600); return ok; };
  const d0 = (await etatLivre(page)).double;
  // 1. Toucher le livre (la photo) quand les boutons sont effacés : elle se soulève, et ils reviennent.
  const photo = await centre(page, PHOTO);
  if (!photo) res.push({ test: 'boutons effacés, toucher la photo : elle se soulève ET les boutons reviennent', ok: 'ATTENTE', obtenu: 'photo absente : à relancer après intégration' });
  else {
    const ok0 = await effaces();
    await toucher(page, photo[0], photo[1]);
    const leve = await attendreAttr(page, CALQUE, 'data-gc-soulever', 'ouvert');
    const revenus = await attendreControles(page, 'visibles', 3000);
    res.push({ test: 'boutons effacés, toucher la photo : elle se soulève ET les boutons reviennent', attendu: { effaces: true, soulevee: true, controles: 'visibles' }, obtenu: { effaces: ok0, soulevee: leve, controles: await mesure() }, ok: ok0 && leve && revenus ? 'OK' : 'KO' });
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await attendreAttr(page, CALQUE, 'data-gc-soulever', 'ferme');
    await stabiliser(page, PHOTO);
  }
  // 2. Toucher la flèche « suivante » effacée : la page ne tourne pas, les boutons reviennent.
  const ok1 = await effaces();
  const fl = await rectDe(page, '[aria-label="Page suivante"]');
  if (!fl) { res.push({ test: 'boutons effacés, toucher la flèche : la page ne tourne pas', ok: 'KO', obtenu: 'flèche « Page suivante » introuvable' }); }
  else {
    await toucher(page, fl.cx, fl.cy);
    await page.waitForTimeout(1200);
    await repos(page, 400, 1500);
    const apres = await etatLivre(page);
    const vus = await mesure();
    res.push({ test: 'boutons effacés, toucher la flèche : la page ne tourne pas, les boutons reviennent', attendu: { effaces: true, double: d0, controles: 'visibles' }, obtenu: { effaces: ok1, double: apres.double, controles: vus }, ok: ok1 && apres.double === d0 && vus === 'visibles' ? 'OK' : 'KO' });
    captures.push(await capture(page, `${e.nom}-boutons-rappeles`, outDir));
    // 3. Boutons revenus : la flèche agit.
    await toucher(page, fl.cx, fl.cy);
    const s2 = await attendreEtat(page, { double: d0 + 1 });
    await repos(page);
    res.push({ test: 'boutons visibles, toucher la flèche : la page tourne', attendu: { double: d0 + 1 }, obtenu: { double: s2.double }, ok: s2.double === d0 + 1 ? 'OK' : 'KO' });
  }
  const erreurs = [...surv.erreurs];
  await ctx.close();
  return { tests: res, erreurs };
}

/** À la souris : un mouvement les rappelle, ils s'effacent de nouveau ; « toujours visibles » (menu) les garde. */
async function suiteBoutonsSouris(browser, e, captures) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, '#julie');
  const res = [];
  const attr = () => page.evaluate(() => document.querySelector('.gc-ecran')?.getAttribute('data-gc-controles'));
  const op = () => page.evaluate(() => Math.min(...[...document.querySelectorAll('[data-gc-effacable]')].map((el) => { let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; })));
  const ok0 = await attendreControles(page, 'caches', 9000);
  await page.waitForTimeout(600);
  const opCache = await op();
  await page.mouse.move(300, 3, { steps: 2 });
  const revenus = await attendreControles(page, 'visibles', 3000);
  await page.waitForTimeout(350);
  const opVu = await op();
  res.push({ test: 'souris : un mouvement rappelle les boutons', attendu: { avant: 'caches', apres: 'visibles' }, obtenu: { effaces: ok0, opaciteEffacee: Math.round(opCache * 100) / 100, revenus, opaciteRappelee: Math.round(opVu * 100) / 100 }, ok: ok0 && revenus && opCache < 0.02 && opVu > 0.5 ? 'OK' : 'KO' });
  const denouveau = await attendreControles(page, 'caches', 9000);
  res.push({ test: 'souris : sans activité, ils s\'effacent de nouveau', attendu: { controles: 'caches' }, obtenu: { controles: await attr() }, ok: denouveau ? 'OK' : 'KO' });
  // Le menu : Boutons → « toujours visibles » ; la fiche ouverte les garde visibles, et fermée aussi.
  await page.keyboard.press('m');
  const radio = page.locator('[data-gc-reglages-ligne="boutons"] [role="radio"]').nth(1);
  const present = await radio.count();
  if (!present) res.push({ test: 'menu : « Boutons — toujours visibles » garde les boutons à l\'écran', ok: 'KO', obtenu: 'ligne « Boutons » absente du menu' });
  else {
    const visiblesFiche = await attendreControles(page, 'visibles', 3000);
    await radio.click();
    await page.waitForTimeout(300);
    const memo = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('gc:reglages:v3') || '{}').boutonsToujoursVisibles; } catch { return null; } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await page.mouse.move(900, 3, { steps: 2 });
    await page.waitForTimeout(5000);
    const encore = await attr();
    const opApres = await op();
    captures.push(await capture(page, `${e.nom}-boutons-toujours-visibles`, outDir));
    res.push({ test: 'menu : « Boutons — toujours visibles » garde les boutons à l\'écran (et se mémorise)', attendu: { memo: true, controles: 'visibles' }, obtenu: { fiche: visiblesFiche, memo, controles: encore, opacite: Math.round(opApres * 100) / 100 }, ok: visiblesFiche && memo === true && encore === 'visibles' && opApres > 0.5 ? 'OK' : 'KO' });
  }
  const erreurs = [...surv.erreurs];
  await ctx.close();
  return { tests: res, erreurs };
}

// ---- Programme -------------------------------------------------------------------------------------
const browser = await lancer();
const ecransRapport = [];
const tuiles = [];
const captures = [];
for (const e of ECRANS_) {
  const ligne = { nom: e.nom, titre: e.titre, viewport: e.ctx.viewport, dpr: e.ctx.deviceScaleFactor, tactile: tactile(e), insets: insets(e), erreurs: [] };
  try {
    // Couverture
    const a = await ouvrirPage(browser, cible, e, '');
    await reveiller(a.page);
    const fc = await capture(a.page, `${e.nom}-couverture`, outDir);
    await reveiller(a.page);
    ligne.couverture = await mesurerRepos(a.page, e);
    ligne.erreurs.push(...a.surv.erreurs, ...a.surv.reponses, ...a.surv.echecs);
    await a.ctx.close();
    // Julie (page vidéo)
    const b = await ouvrirPage(browser, cible, e, '#julie');
    await reveiller(b.page);
    const fj = await capture(b.page, `${e.nom}-julie`, outDir);
    await reveiller(b.page);
    const m = await mesurerRepos(b.page, e);
    ligne.julie = m;
    ligne.reglages = await jugerReglages(b.page, e);
    ligne.photos = { julie: await jugerPhoto(b.page) };
    ligne.effacement = await jugerEffacement(b.page, e, captures);
    ligne.erreurs.push(...b.surv.erreurs, ...b.surv.reponses, ...b.surv.echecs);
    await b.ctx.close();
    // #lisa, et les autres pages vidéo de --videos
    for (const v of videos.filter((x) => x !== 'julie')) {
      const c = await ouvrirPage(browser, cible, e, `#${v}`);
      const s = await etatLivre(c.page);
      const trouve = s.double >= 0 && s.spreads.some((id) => id.toLowerCase() === v || id.toLowerCase().endsWith(`-${v}`));
      if (v === 'lisa') {
        ligne.lisa = trouve
          ? { ok: s.hash === '#lisa' && (s.cadrage !== 'page' || s.cote === 'gauche') ? 'OK' : 'KO', detail: `double ${s.double}, ${s.cadrage}${s.cadrage === 'page' ? ` (${s.cote})` : ''}, ${s.hash}` }
          : { ok: 'ATTENTE', detail: `#lisa → ${s.double < 0 ? 'couverture' : `double ${s.double} (${s.spreads.join(', ')})`} : Lisa pas encore dans le carnet` };
        if (trouve) tuiles.push([await capture(c.page, `${e.nom}-lisa`, outDir), `${e.titre} — #lisa`]);
      }
      ligne.photos[v] = trouve ? await jugerPhoto(c.page) : { ok: 'ATTENTE', detail: `#${v} absent du carnet` };
      ligne.erreurs.push(...c.surv.erreurs, ...c.surv.reponses, ...c.surv.echecs);
      await c.ctx.close();
    }
    ligne.criteres = juger(e, m);
    const jc = juger(e, ligne.couverture);
    ligne.criteres.horsCadre.ok = ligne.criteres.horsCadre.ok === 'OK' && jc.horsCadre.ok === 'OK' ? 'OK' : 'KO';
    ligne.criteres.controles.ok = ligne.criteres.controles.ok === 'OK' && jc.controles.ok === 'OK' ? 'OK' : 'KO';
    tuiles.push([fc, `${e.titre} — couverture (${ligne.couverture.cadrage})`], [fj, `${e.titre} — Julie · échelle ${m.echelle} · x ${m.xPx} px`]);
    const c = ligne.criteres;
    R.ajouter(e.nom, 'aucune page hors cadre, aucun débordement', c.horsCadre.ok, c.horsCadre.detail);
    R.ajouter(e.nom, 'contrôles visibles dans la zone sûre', c.controles.ok, c.controles.detail);
    if (c.cibles.ok !== 's.o.') R.ajouter(e.nom, 'cibles ≥ 44 px au doigt', c.cibles.ok, c.cibles.detail);
    R.ajouter(e.nom, `hauteur d'x angulaire ≥ ${c.hauteurX.ref} mrad`, c.hauteurX.ok, `${c.hauteurX.mrad} mrad (${c.hauteurX.px} px, ${c.hauteurX.lecture})`);
    R.ajouter(e.nom, 'bouton de réglages (zone sûre, ≥ 44 px au doigt)', ligne.reglages.ok, ligne.reglages.detail);
    R.ajouter(e.nom, 'boutons effacés après 3 s (opacité nulle, toujours atteignables au clavier)', ligne.effacement.ok, ligne.effacement.detail);
    for (const [v, j] of Object.entries(ligne.photos)) R.ajouter(e.nom, `photo collée sur la page vidéo #${v}`, j.ok, j.detail);
    if (ligne.lisa) R.ajouter(e.nom, '#lisa ouvre la double page de Lisa', ligne.lisa.ok, ligne.lisa.detail);
    R.ok(e.nom, 'aucune erreur de page ni requête en échec', !ligne.erreurs.length, ligne.erreurs.slice(0, 3).join(' | '));
  } catch (x) {
    R.ajouter(e.nom, 'exécution', 'KO', `plantage : ${String(x).split('\n')[0]}`);
  }
  ecransRapport.push(ligne);
}

const interactionsRapport = [];
if (interactions) {
  const suites = [
    ['iphone13-portrait', 'doigt, cadrage page', (e) => suiteTactile(browser, e, captures), 'doigt'],
    ['iphone13-portrait', 'rotation', (e) => suiteRotation(browser, e, captures), 'rotation'],
    ['iphone13-portrait', 'moins de mouvement', (e) => suiteReduite(browser, e), 'reduit'],
    ['ipad-paysage', 'doigt, cadrage double', (e) => suiteTactile(browser, e, captures), 'doigt'],
    ['ordi-1440', 'souris et clavier', (e) => suiteSouris(browser, e), 'souris'],
    ['ipad-paysage', 'coin, cadrage double', (e) => suiteCoin(browser, e, captures), 'coin'],
    ['iphone13-portrait', 'coin, cadrage page', (e) => suiteCoin(browser, e, captures), 'coin'],
    ['ordi-1440', 'curseurs, annonce, Entrée, plat arrière', (e) => suiteCurseurs(browser, e, captures), 'curseurs'],
    ['iphone13-paysage', 'boutons qui s\'effacent, au doigt', (e) => suiteBoutonsDoigt(browser, e, captures), 'boutons'],
    ['ordi-1440', 'boutons qui s\'effacent, souris et menu', (e) => suiteBoutonsSouris(browser, e, captures), 'boutons'],
  ];
  for (const [nom, titre, f, cle] of suites) {
    if (suitesVoulues && !suitesVoulues.includes(cle)) continue;
    const e = ECRANS_.find((x) => x.nom === nom) ?? (liste('only') ? null : ECRANS.find((x) => x.nom === nom));
    if (!e) continue;
    console.log(`\n■ Interactions — ${e.titre} (${titre})`);
    try {
      const r = await f(e);
      interactionsRapport.push({ ecran: nom, suite: titre, ...r });
      for (const t of r.tests) R.ajouter(nom, `${titre} : ${t.test}`, t.ok, t.ok === 'ATTENTE' ? t.obtenu : JSON.stringify(t.obtenu));
      R.ok(nom, `${titre} : aucune erreur de page`, !r.erreurs.length, r.erreurs.slice(0, 3).join(' | '));
    } catch (x) {
      R.ajouter(nom, `${titre} : exécution`, 'KO', `plantage : ${String(x).split('\n')[0]}`);
    }
  }
  for (const f of captures) tuiles.push([f, f.split('/').pop().replace(/\.png$/, '')]);
}
await browser.close();
await cible.close();

const pl = planche(tuiles, join(outDir, 'planche.png'), { titre: `Le carnet sur tous les écrans — verify-devices (${cible.type})` });
const lignes = ['| Écran | Fenêtre | Cadrage | Cran | Échelle | Hors cadre | Contrôles | Cibles ≥ 44 | Hauteur d\'x (mrad, réf. ' + Math.round(REF_MRAD * 1000) / 1000 + ') | Réglages | Photo | #lisa |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const l of ecransRapport) {
  const c = l.criteres;
  if (!c) { lignes.push(`| ${l.titre} | — | — | — | — | KO | — | — | — | — | — | — |`); continue; }
  const photos = Object.entries(l.photos ?? {}).map(([v, j]) => `${v} ${j.ok}`).join(', ');
  lignes.push(`| ${l.titre} | ${l.julie.vw}×${l.julie.vh} @${l.dpr} | ${l.julie.cadrage} | ${l.julie.distance} | ${l.julie.echelle} | ${c.horsCadre.ok} | ${c.controles.ok} | ${c.cibles.ok} | ${c.hauteurX.ok} ${c.hauteurX.mrad} (${c.hauteurX.px} px, ${c.hauteurX.lecture}) | ${l.reglages?.ok ?? '—'} | ${photos} | ${l.lisa?.ok ?? '—'} |`);
}
const tableau = lignes.join('\n');
R.ecrire({ planche: pl ? rel(pl) : null, tableau, ecrans: ecransRapport, interactions: interactionsRapport });
writeFileSync(join(outDir, 'devices-tableau.md'), tableau + '\n');
console.log(`\n${tableau}\n\nplanche : ${pl ? rel(pl) : '—'}`);
process.exit(R.code());
