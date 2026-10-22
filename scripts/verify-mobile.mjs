// Téléphone et tablette (piste mobile2) : les gestes au doigt rejoués sur le site construit, en émulation
// tactile (Input.dispatchTouchEvent) et CPU ralenti ×4, et le journal OK / KO de chacun.
//
//   iPhone 13 couché : arrivée (livre fermé, bougie visible, flamme qui vit), toucher la couverture (le livre
//     s'ouvre, le premier son est entendu), l'encre s'écrit à l'arrivée, tape dans la marge droite (page
//     suivante, sans finir d'écrire la page d'arrivée), coin tiré en diagonale, glisser au milieu, tape dans la
//     marge gauche, souffle du doigt sur la bougie ; #lisa : tape sur la photo (soulevée), barre de Safari qui
//     apparaît (la photo reste), tape sur un dessin (la page ne tourne pas), pincement sur la page (loupe, pas
//     de zoom du navigateur) ; #julie : pincement dans la marge (loupe aussi).
//   iPhone 13 debout : livre fermé et invitation à tourner le téléphone ; rotation pendant la lecture (couché →
//     debout → couché) : la page lue est retrouvée, même après une tape et des touches pendant qu'il est debout.
//   iPad debout : la double page se lit. Pixel 7 couché : la double page et le tour au coin.
//   iPhone 13 couché, « moins d'animations » du système : la flamme vit, l'encre s'écrit (mouvement doux).
//   iPad couché, TV 1920 : non-régression (livre fermé, double page, bougie).
//
//   node scripts/verify-mobile.mjs [--site dist/site] [--out verification/out/mobile2/gestes] [--nom gestes]
//        [--only iphone13-paysage,iphone13-doux,iphone13-portrait,ipad-portrait,pixel7-paysage,ipad-paysage,tv-1080]
//        [--sans-captures]
import { resolve } from 'node:path';
import {
  ROOT, lireArgs, ecran, lancer, ouvrirCible, ouvrirPage, Rapport, rectDe, etatLivre, capture, toucher, glisser,
  cdpDe, attendre, planche, rel,
} from './lib/verif.mjs';

const { opt, drapeau, liste } = lireArgs();
const out = resolve(ROOT, opt('out', 'verification/out/mobile2/gestes'));
const site = opt('site', 'dist/site');
const seulement = liste('only');
const captures = !drapeau('sans-captures');
const cible = await ouvrirCible({ site });
const R = new Rapport(opt('nom', 'gestes'), { dir: out, meta: { cible: cible.type, site } });
const browser = await lancer();
console.log(`■ Gestes au doigt — ${cible.type} : ${cible.depart}`);

const ECRANS = Object.fromEntries(['iphone13-paysage', 'iphone13-portrait', 'ipad-portrait', 'pixel7-paysage'].map((n) => [n, ecran(n)]));
const voulu = (n) => !seulement?.length || seulement.includes(n);

// ---- Instrumentation : contexte audio (état, sons réellement lancés) --------------------------------
function INIT_AUDIO() {
  // lâchers reçus par la page : sur une machine chargée, CPU ralenti, les événements du doigt arrivent
  // avec plusieurs secondes de retard ; on attend qu'ils soient tous là avant de juger le geste
  window.__gcLachers = 0;
  addEventListener('pointerup', (ev) => { if (ev.isTrusted) window.__gcLachers++; }, { capture: true });
  if (window.__gcAudio) return;
  const A = (window.__gcAudio = { etats: [], sons: 0, sonsCoupes: 0, premier: null });
  const Base = window.AudioContext || window.webkitAudioContext;
  if (!Base) return;
  class Espion extends Base {
    constructor(...a) {
      super(...a);
      A.ctx = this;
      A.etats.push(this.state);
      this.addEventListener('statechange', () => A.etats.push(this.state));
    }
  }
  window.AudioContext = Espion;
  window.webkitAudioContext = Espion;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function demarrer(...a) {
    // le tampon muet du déverrouillage (1 échantillon) ne compte pas
    if (this.buffer && this.buffer.duration > 0.05) {
      if (this.context.state === 'running') { A.sons++; A.premier ??= performance.now(); } else A.sonsCoupes++;
    }
    return start.apply(this, a);
  };
}
const lachers = (page) => page.evaluate(() => window.__gcLachers ?? 0);
/** Attend que la page ait reçu `n` lâchers (30 s au plus). */
const attendreLachers = (page, n) => page.waitForFunction((k) => (window.__gcLachers ?? 0) >= k, n, { timeout: 30000, polling: 50 }).then(() => true, () => false);
/** Attend l'état de la loupe (data-gc-loupe sur l'écran). */
const attendreLoupe = (page, etat, ms = 8000) => page.waitForFunction((v) => document.querySelector('.gc-ecran')?.getAttribute('data-gc-loupe') === v, etat, { timeout: ms, polling: 50 }).then(() => true, () => false);
const audio = (page) => page.evaluate(() => {
  const A = window.__gcAudio ?? {};
  return { etat: A.ctx?.state ?? 'aucun', sons: A.sons ?? 0, coupes: A.sonsCoupes ?? 0 };
});

// ---- Mesures ---------------------------------------------------------------------------------------
/** Emplacements des pages (px d'écran) : gauche, droite, et la couverture. */
const geo = (page) => page.evaluate(() => {
  const r = (s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
  };
  return { g: r('.gc-livre__emplacement--gauche'), d: r('.gc-livre__emplacement--droite'), couv: r('.gc-livre-couv'), vv: visualViewport?.scale ?? 1 };
});
const livre = async (page) => ({
  ...(await etatLivre(page)),
  etat: await page.evaluate(() => document.querySelector('.gc-livre')?.getAttribute('data-gc-etat') ?? null),
  loupe: await page.evaluate(() => document.querySelector('.gc-ecran')?.getAttribute('data-gc-loupe') ?? null),
  vv: await page.evaluate(() => Math.round((visualViewport?.scale ?? 1) * 1000) / 1000),
});
/** Encre des pages posées : page, encore à écrire, plume en train d'écrire. */
const encre = (page) => page.evaluate(() => [...document.querySelectorAll('.gc-livre__page--visible [data-gc-page-cuite]')]
  .map((el) => {
    const c = el.querySelector('.gc-page-cuite__plume');
    return { page: el.getAttribute('data-gc-page-cuite'), aEcrire: el.getAttribute('data-gc-ecrit') === 'a-ecrire', plume: !!c && c.width > 300 };
  }));
/** Attend que le livre montre la double page n (data-gc-double), sans geste en cours. */
const attendreDouble = async (page, n, ms = 8000) => {
  try {
    await page.waitForFunction((k) => {
      const s = document.querySelector('.gc-livre-ecran');
      const l = document.querySelector('.gc-livre');
      return s && Number(s.getAttribute('data-gc-double')) === k && l && !l.hasAttribute('data-gc-geste');
    }, n, { timeout: ms, polling: 40 });
    return true;
  } catch {
    return false;
  }
};
const posee = (page) => page.waitForFunction(() => {
  const l = document.querySelector('.gc-livre');
  return l && !l.hasAttribute('data-gc-geste');
}, null, { timeout: 8000, polling: 40 }).catch(() => {});

/** Relevé de la flamme pendant `ms` : éclat minimal (la flamme dérangée baisse), images dessinées. */
const releveFlamme = (page, ms) => page.evaluate((d) => new Promise((res) => {
  const F = window.__gcFlamme;
  if (!F) return res(null);
  const e0 = F.etat();
  let min = 1;
  const t0 = performance.now();
  const tick = () => {
    const e = F.etat();
    min = Math.min(min, e.eclat);
    if (performance.now() - t0 < d) requestAnimationFrame(tick);
    else res({ min: Math.round(min * 1000) / 1000, images: e.images - e0.images, rendu: e.rendu });
  };
  requestAnimationFrame(tick);
}), ms);

/** Pincement à deux doigts autour de c, de l'écart d0 à d1 (axe : 'x' horizontal, 'y' vertical). */
async function pincer(page, c, d0, d1, { n = 14, ms = 320, axe = 'x' } = {}) {
  const cdp = await cdpDe(page);
  const u0 = await lachers(page);
  const t0 = Date.now() / 1000;
  const pts = (d) => (axe === 'x'
    ? [{ x: c.x - d / 2, y: c.y, id: 11 }, { x: c.x + d / 2, y: c.y, id: 12 }]
    : [{ x: c.x, y: c.y - d / 2, id: 11 }, { x: c.x, y: c.y + d / 2, id: 12 }]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0), timestamp: t0 });
  for (let i = 1; i <= n; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + ((d1 - d0) * i) / n), timestamp: t0 + (i * ms) / n / 1000 });
    await page.waitForTimeout(ms / n);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + ms / 1000 + 0.01 });
  await attendreLachers(page, u0 + 2);
}

const ouvrir = async (e, hash = '') => {
  const o = await ouvrirPage(browser, cible, e, hash, { init: [INIT_AUDIO] });
  const cdp = await cdpDe(o.page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await o.page.waitForTimeout(600);
  return o;
};
const fichiers = [];
const cap = async (page, nom, legende) => {
  if (!captures) return;
  const f = await capture(page, nom, out);
  fichiers.push([f, legende]);
  R.capturer(f, legende);
};
const fermer = async (o) => {
  if (o.surv.erreurs.length) R.info(null, 'erreurs de page', o.surv.erreurs.slice(0, 3).join(' · '));
  await o.ctx.close();
};

// ---- iPhone 13 couché (et Pixel 7 couché, en plus court) ------------------------------------------
async function couche(e, complet) {
  const n = e.nom;
  console.log(`\n■ ${e.titre}`);
  let o = await ouvrir(e);
  let { page } = o;
  let L = await livre(page);
  R.ok(n, 'arrivée : livre fermé sur la table, double page', L.double === -1 && L.cadrage === 'double', L);
  const bougie = await rectDe(page, '.gc-bougie__pose');
  const fl = await releveFlamme(page, 900);
  R.ok(n, 'bougie visible à l’écran', !!bougie?.visible, bougie ? { x: Math.round(bougie.x), y: Math.round(bougie.y), w: Math.round(bougie.w), visible: bougie.visible } : 'absente');
  R.ok(n, 'flamme vivante (images dessinées)', !fl /* poignée __gcFlamme disparue : étape sautée */ || fl.images > 3, fl ?? 'sautée');
  await cap(page, `${n}-ferme`, `${e.titre} : livre fermé`);

  let G = await geo(page);
  const a0 = await audio(page);
  await toucher(page, G.couv?.cx ?? G.d.cx, G.couv?.cy ?? G.d.cy);
  const ouvert = await attendreDouble(page, 0, 9000);
  R.ok(n, 'toucher la couverture ouvre le livre', ouvert, await livre(page));
  await page.waitForTimeout(400);
  const a1 = await audio(page);
  R.ok(n, 'audio déverrouillé au premier toucher', a1.etat === 'running', a1);
  R.ok(n, 'premier son entendu (couverture)', a1.sons > a0.sons, { avant: a0, apres: a1 });

  // L'encre s'écrit sur la page d'arrivée.
  await page.waitForTimeout(900);
  let E = await encre(page);
  R.ok(n, 'l’encre s’écrit à l’arrivée (titre)', E.some((p) => p.plume) || (E.some((p) => p.aEcrire)), E);
  await cap(page, `${n}-double`, `${e.titre} : double page (titre)`);
  if (!complet) {
    // Pixel 7 : le coin tiré suffit.
    G = await geo(page);
    await glisser(page, [G.d.r - 6, G.d.b - 6], [G.g.x + G.g.w * 0.3, G.d.b - G.d.h * 0.25], { ms: 520, n: 18 });
    R.ok(n, 'coin tiré au doigt : page suivante', await attendreDouble(page, 1), await livre(page));
    await fermer(o);
    return;
  }

  // Tape dans la marge droite : page suivante ; l'encre de la page d'arrivée n'est pas finie par la tape.
  G = await geo(page);
  await toucher(page, G.d.r - G.d.w * 0.05, G.d.cy);
  const t1 = await attendreDouble(page, 1);
  R.ok(n, 'tape dans la marge droite : page suivante', t1, await livre(page));
  await page.waitForTimeout(150);
  E = await encre(page);
  R.ok(n, 'la page d’arrivée reste à écrire après la tape', E.length > 0 && E.every((p) => p.aEcrire || p.plume), E);
  await page.waitForTimeout(1200);
  E = await encre(page);
  R.ok(n, 'la plume écrit la page d’arrivée', E.some((p) => p.plume), E);

  // Coin tiré en diagonale (bas droit → gauche).
  G = await geo(page);
  const nGeste = await page.evaluate(() => (window.__gcGestesLivre ?? []).length);
  let mi = null;
  await glisser(page, [G.d.r - 6, G.d.b - 6], [G.g.x + G.g.w * 0.3, G.d.b - G.d.h * 0.25], {
    ms: 620, n: 20,
    aMiChemin: async () => { mi = await livre(page); if (captures) await cap(page, `${n}-coin`, `${e.titre} : coin tiré au doigt, à mi-chemin`); },
  });
  const t2 = await attendreDouble(page, 2);
  const typesCoin = await page.evaluate((k) => [...new Set((window.__gcGestesLivre ?? []).slice(k).map((g) => g.type))], nGeste);
  R.ok(n, 'coin tiré au doigt : page suivante', t2, { ...(await livre(page)), gestes: typesCoin, pendant: mi?.double });

  // Glisser au milieu de la page droite.
  G = await geo(page);
  await glisser(page, [G.d.cx + G.d.w * 0.2, G.d.cy], [G.g.cx, G.d.cy + 10], { ms: 360, n: 14 });
  R.ok(n, 'glisser au milieu : page suivante', await attendreDouble(page, 3), await livre(page));

  // Tape dans la marge gauche.
  G = await geo(page);
  await toucher(page, G.g.x + G.g.w * 0.05, G.g.cy);
  R.ok(n, 'tape dans la marge gauche : page précédente', await attendreDouble(page, 2), await livre(page));

  // Souffle du doigt sur la bougie (sur la table, hors du livre). Relevé pendant tout le geste, jusqu'à ce
  // que le lâcher soit reçu, et sans ralenti du CPU : ralentie ×4 sur cette machine, la page reçoit les
  // mouvements du doigt à plus de 120 ms d'écart, et la vitesse du pointeur (src/lib/pointeur.ts, lissée
  // sur des mouvements rapprochés) y est nulle ; un vrai doigt en envoie 60 à 120 par seconde.
  const b = await rectDe(page, '.gc-bougie__pose');
  if (b?.visible) {
    const cdp = await cdpDe(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const F = window.__gcFlamme;
      const R = (window.__gcReleve = { trouble: 0, penche: 0, i0: F?.etat().images ?? 0, fini: false });
      const tick = () => {
        const e = F?.etat();
        if (e) { R.trouble = Math.max(R.trouble, e.trouble ?? 0); R.penche = Math.max(R.penche, e.penche ?? 0); }
        if (!R.fini) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const u0 = await lachers(page);
    // un glisser vertical (il ne tourne pas la page) qui passe tout près de la flamme
    const x = b.cx + b.w * 0.3;
    await glisser(page, [x, Math.max(8, b.y - b.h * 0.6)], [x, Math.min(page.viewportSize().height - 8, b.b)], { ms: 260, n: 12 });
    await attendreLachers(page, u0 + 1);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const R = window.__gcReleve;
      R.fini = true;
      return { absente: !window.__gcFlamme, trouble: R.trouble, penche: R.penche, images: (window.__gcFlamme?.etat().images ?? 0) - R.i0 };
    });
    // (au repos, le trouble et l'inclinaison due au vent sont nuls : le courant d'air de la pièce n'y entre pas)
    R.ok(n, 'souffle du doigt : la flamme se couche et se trouble', r.absente || (r.trouble > 0.05 && r.penche > 1), r); // (sans poignée __gcFlamme : étape sautée)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  } else R.ok(n, 'souffle du doigt : la flamme se couche et se trouble', false, 'bougie invisible');
  await fermer(o);

  // #lisa : photo, barre de Safari, dessin, pincement sur la page.
  o = await ouvrir(e, 'lisa');
  page = o.page;
  await posee(page);
  L = await livre(page);
  R.info(n, '#lisa ouvert', L);
  const photo = await rectDe(page, '.gc-livre__page--visible [data-gc-objet="photo"]');
  if (photo?.visible) {
    await toucher(page, photo.cx, photo.cy);
    const ok = await page.waitForFunction(() => document.querySelector('[data-gc-soulever]')?.getAttribute('data-gc-soulever') === 'ouvert', null, { timeout: 5000 }).then(() => true, () => false);
    R.ok(n, 'tape sur la photo : elle se soulève', ok, await livre(page));
    await page.waitForTimeout(900);
    await cap(page, `${n}-photo`, `${e.titre} : photo soulevée`);
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: vp.height - 42 });
    await page.waitForTimeout(700);
    const s1 = (await livre(page)).soulever;
    await page.setViewportSize(vp);
    await page.waitForTimeout(700);
    const s2 = (await livre(page)).soulever;
    R.ok(n, 'barre de Safari (hauteur −42 px puis +42) : la photo reste soulevée', s1 === 'ouvert' && s2 === 'ouvert', { pendant: s1, apres: s2 });
    // (refermée seulement si elle est encore levée : Échap sur le livre refermerait le carnet)
    const f = await rectDe(page, '[data-gc-soulever-fermer]');
    if (s2 === 'ouvert' && f?.visible) await toucher(page, f.cx, f.cy);
    else if (s2 === 'ouvert') await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-gc-soulever]')?.getAttribute('data-gc-soulever') !== 'ouvert', null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
  } else R.ok(n, 'tape sur la photo : elle se soulève', false, 'photo introuvable');

  const avantDessin = await livre(page);
  const dessin = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.gc-livre__page--visible [data-gc-aquarelle]')];
    // le dessin le plus près du bord extérieur (là où une tape tournait la page)
    const rs = els.map((x) => { const b = x.getBoundingClientRect(); return { nom: x.getAttribute('data-gc-aquarelle'), x: b.left, y: b.top, w: b.width, h: b.height }; });
    rs.sort((a, b) => (b.x + b.w) - (a.x + a.w));
    return rs[0] ?? null;
  });
  if (dessin) {
    const Gd = await geo(page);
    // vers le bord extérieur du dessin, dans la marge qui tourne la page si elle le recouvre
    const x = Math.min(dessin.x + dessin.w * 0.8, Gd.d.r - 4);
    const y = dessin.y + dessin.h * 0.5;
    const n0 = await page.evaluate(() => (window.__gcGestesLivre ?? []).length);
    await toucher(page, x, y);
    await page.waitForTimeout(1400);
    const apres = await livre(page);
    const tours = await page.evaluate((k) => (window.__gcGestesLivre ?? []).slice(k).filter((g) => g.phase === 'debut' && /page|glisse/.test(g.type)).length, n0);
    R.ok(n, `tape sur un dessin (${dessin.nom}) : la page ne tourne pas`, apres.double === avantDessin.double && !tours, { avant: avantDessin.double, apres: apres.double, tours, x: Math.round(x), bordPage: Math.round(Gd.d.r) });
  } else R.ok(n, 'tape sur un dessin : la page ne tourne pas', false, 'dessin introuvable');

  G = await geo(page);
  await pincer(page, { x: G.d.cx, y: G.d.cy }, 60, 200);
  await attendreLoupe(page, 'zoome');
  L = await livre(page);
  R.ok(n, 'pincement sur la page : la loupe zoome, le navigateur ne zoome pas', L.loupe === 'zoome' && L.vv === 1, L);
  await cap(page, `${n}-loupe`, `${e.titre} : loupe pincée`);
  await fermer(o);

  // #julie : pincement dans la marge (la table, à gauche du livre).
  o = await ouvrir(e, 'julie');
  page = o.page;
  await posee(page);
  G = await geo(page);
  // (sur la table à gauche du livre ; doigts l'un au-dessus de l'autre : la bande de table est étroite)
  const xm = Math.max(12, Math.round(G.g.x / 2));
  await pincer(page, { x: xm, y: G.g.cy }, 40, 160, { axe: 'y' });
  await attendreLoupe(page, 'zoome');
  L = await livre(page);
  R.ok(n, 'pincement dans la marge : la loupe zoome, le navigateur ne zoome pas', L.loupe === 'zoome' && L.vv === 1, { ...L, x: Math.round(xm) });
  await fermer(o);
}

// ---- iPhone 13 debout, et rotation ---------------------------------------------------------------
async function debout(e) {
  const n = e.nom;
  console.log(`\n■ ${e.titre}`);
  let o = await ouvrir(e);
  let { page } = o;
  await page.waitForTimeout(800);
  let L = await livre(page);
  const inv = await rectDe(page, '[data-gc-tourner]');
  R.ok(n, 'debout : livre fermé', L.etat === 'couverture', L);
  R.ok(n, 'debout : invitation à tourner le téléphone', !!inv?.visible, inv ?? 'absente');
  await cap(page, `${n}-invitation`, `${e.titre} : invitation à tourner`);
  const G = await geo(page);
  if (G.couv) await toucher(page, G.couv.cx, G.couv.cy);
  await page.waitForTimeout(1500);
  L = await livre(page);
  R.ok(n, 'debout : toucher la couverture ne fait pas lire une page seule', L.cadrage !== 'page', L);
  await fermer(o);

  // Rotation pendant la lecture : couché (#julie) → debout → couché.
  const couche = ecran('iphone13-paysage');
  o = await ouvrir(couche, 'julie');
  page = o.page;
  await posee(page);
  const L0 = await livre(page);
  await page.setViewportSize(e.ctx.viewport);
  await page.waitForTimeout(1500);
  const L1 = await livre(page);
  const inv1 = await rectDe(page, '[data-gc-tourner]');
  R.ok(n, 'rotation couché → debout : le livre se ferme, l’invitation paraît', L1.etat === 'couverture' && !!inv1?.visible, { avant: L0, apres: L1 });
  R.ok(n, 'rotation couché → debout : l’adresse garde la page lue', L1.hash === L0.hash, { avant: L0.hash, apres: L1.hash });
  // Fuite de touche : debout, le livre fermé attend ; une tape sur la couverture ou une touche (→, Fin) ne
  // doit pas déplacer en douce la page lue, qui tournerait toute seule une fois le téléphone couché.
  const G1 = await geo(page);
  if (G1.couv) await toucher(page, G1.couv.cx, G1.couv.cy);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await page.waitForTimeout(1200);
  await page.setViewportSize(couche.ctx.viewport);
  await page.waitForTimeout(2500);
  await posee(page);
  const L2 = await livre(page);
  R.ok(n, 'rotation debout → couché : la page lue est retrouvée (tape et touches debout sans effet)', L2.double === L0.double && L2.cadrage === 'double', { avant: L0.double, apres: L2 });
  await fermer(o);
}

async function tablette(e) {
  const n = e.nom;
  console.log(`\n■ ${e.titre}`);
  const o = await ouvrir(e, 'julie');
  const { page } = o;
  await posee(page);
  const L = await livre(page);
  R.ok(n, 'tablette debout : double page', L.cadrage === 'double' && L.double >= 0, L);
  const G = await geo(page);
  await toucher(page, G.d.r - G.d.w * 0.05, G.d.cy);
  R.ok(n, 'tablette debout : tape dans la marge droite', await attendreDouble(page, L.double + 1), await livre(page));
  await cap(page, `${n}-double`, `${e.titre} : double page`);
  await fermer(o);
}

// ---- Préférence du système « moins d'animations » (mouvement doux) : les effets restent ----------------
async function doux(e) {
  const n = `${e.nom}-doux`;
  console.log(`\n■ ${e.titre} — moins d’animations (système)`);
  const o = await ouvrirPage(browser, cible, e, '', { init: [INIT_AUDIO], contexteExtra: { reducedMotion: 'reduce' } });
  const { page } = o;
  await page.waitForTimeout(600);
  const niveau = await page.evaluate(() => document.documentElement.getAttribute('data-gc-mouvement'));
  R.ok(n, 'niveau de mouvement « doux »', niveau === 'doux', niveau);
  const fl = await releveFlamme(page, 900);
  R.ok(n, 'la flamme vit encore', !fl /* poignée __gcFlamme disparue : étape sautée */ || fl.images > 3, fl ?? 'sautée');
  const G = await geo(page);
  if (G.couv) await toucher(page, G.couv.cx, G.couv.cy);
  const ouvert = await attendreDouble(page, 0, 15000);
  // (la plume part 280 ms après l'arrivée, à l'écran, d'une page posée)
  await page.waitForFunction(() => [...document.querySelectorAll('.gc-livre__page--visible .gc-page-cuite__plume')].some((c) => c.width > 300), null, { timeout: 8000, polling: 100 }).catch(() => {});
  const E = await encre(page);
  R.ok(n, 'l’encre s’écrit encore', ouvert && E.some((p) => p.plume), { ouvert, encre: E });
  await cap(page, `${n}-double`, `${e.titre} : moins d’animations (système)`);
  await fermer(o);
}

// ---- Non-régression : iPad couché, TV 1920 ------------------------------------------------------------
async function apercu(e) {
  const n = e.nom;
  console.log(`\n■ ${e.titre}`);
  let o = await ouvrir(e);
  await cap(o.page, `${n}-ferme`, `${e.titre} : livre fermé`);
  R.ok(n, 'livre fermé, double page', (await livre(o.page)).cadrage === 'double', await livre(o.page));
  await fermer(o);
  o = await ouvrir(e, 'julie');
  await posee(o.page);
  const L = await livre(o.page);
  const bougie = await rectDe(o.page, '.gc-bougie__pose');
  R.ok(n, '#julie : double page, bougie visible', L.cadrage === 'double' && L.double >= 0 && !!bougie?.visible, L);
  await cap(o.page, `${n}-double`, `${e.titre} : double page (#julie)`);
  await fermer(o);
}

try {
  if (voulu('iphone13-paysage')) await couche(ECRANS['iphone13-paysage'], true);
  if (voulu('iphone13-doux')) await doux(ECRANS['iphone13-paysage']);
  if (voulu('pixel7-paysage')) await couche(ECRANS['pixel7-paysage'], false);
  if (voulu('iphone13-portrait')) await debout(ECRANS['iphone13-portrait']);
  if (voulu('ipad-portrait')) await tablette(ECRANS['ipad-portrait']);
  if (voulu('ipad-paysage')) await apercu(ecran('ipad-paysage'));
  if (voulu('tv-1080')) await apercu(ecran('tv-1080'));
} catch (err) {
  R.ajouter(null, 'exception', 'KO', String(err?.stack ?? err).slice(0, 500));
} finally {
  await browser.close();
  cible.close();
}
if (fichiers.length) {
  const p = planche(fichiers, resolve(out, `${R.nom}-planche.png`), { titre: `Gestes au doigt — ${R.nom}`, colonnes: 3 });
  if (p) console.log(`planche : ${rel(p)}`);
}
R.ecrire();
await attendre(10);
process.exit(R.code());
