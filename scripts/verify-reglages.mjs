// Menu de réglages (CONTRACT § 12, § 12.1, § 12.2, § 12.3 ; plan v3, lot R) : bouton
// [data-gc-reglages="bouton"], panneau [data-gc-reglages="panneau"]. Émulation Playwright
// (iPhone 13 debout, ordinateur 1440 × 900, TV 1080p par défaut).
//
// Pour chaque écran :
//   - bouton dans la zone sûre, cible ≥ 44 px au doigt ;
//   - ouvrir par le bouton, par M et par « , » ; role=dialog, aria-modal ; focus sur un contrôle du panneau ;
//   - focus piégé (Tab et Maj+Tab ne sortent pas) ; ↓ ↑ changent de ligne ; ← → changent une valeur ;
//   - Échap ferme et rend le focus au bouton ;
//   - son, lecture auto, animations réduites (gc:reglages:v4 et [data-gc-mouvement]) ; vitesse des
//     animations (réglette de 25 à 200 %) réglée au menu à 150 %, 100 % et 70 %, puis mesurée sur un
//     tourne-page (gc-livre-geste debut → fin, deux tours entrelacés, le plus court gardé : 150 % < 100 %
//     < 70 % ; écrans « double ») ; vitesse de l'écriture (réglette de 25 à 400 %) ; zoom borné
//     par zoomBornes(cran) (src/lib/camera.tsx) ; « Aller à… » (double page, et l'URL #… si les liens
//     profonds sont actifs) ; réglages par défaut ;
//   - persistance après rechargement ; localStorage.setItem qui lève → aucun plantage ;
//   - cibles ≥ 44 px au doigt, rien hors de la zone sûre.
// Indépendamment du menu (valide dès maintenant) : la vitesse des animations écrite dans gc:reglages:v4 règle
// bien la durée d'un tourne-page (écrans « double »), et l'ancien choix « lente » (champ `vitesse`) est lu
// comme 70 %.
// Plan v4 (CONTRACT § 13, lot B) : ligne « Loupe » (100 à 300 %, pas de 25) sur TOUS les écrans, téléphone
// compris ; ligne « Sons du livre » (automatique / oui / non → sonsLivre null / true / false, mémorisé ;
// défaut « oui » depuis la clé v2) ; « remettre les réglages par défaut » remet aussi la loupe à 1×
// ([data-gc-loupe="repos"]) et le zoom fin à 95 % (CAMERA_DEFAULT, src/lib/camera.tsx).
// Section « Ambiance » (lots L et S) : « Sons du livre », « Feu de cheminée et cuisine » (automatique / oui /
// non → ambiance null / true / false, défaut « oui ») et « Lumière du feu » (oui / non → feu, défaut oui) ;
// ligne « Musique » (« aucune » ou un morceau de la banque, défaut : le premier) ; remis par défaut avec le reste.
// Lignes cherchées par [data-gc-reglage="<champ>"] (banc factice) ou [data-gc-reglages-ligne="<id>"] (lot R :
// taille, zoom, son, volume, auto, vitesseEcriture, vitesseAnimations, mouvement, aller, invites, fin), puis par rôle et nom accessible.
// Un oui / non est un groupe radio (lot R) ou un interrupteur (banc). Ce qui manque encore est ATTENTE
// (bouton ou panneau absents) ; un contrôle introuvable dans un panneau présent est KO (avec ce qui a été
// cherché). Chaque bloc est isolé : un échec n'arrête pas les suivants.
// Rapport <out>/reglages.json + .md, captures, planche.
//
//   node scripts/verify-reglages.mjs [--site dist/site | --url … | --banc [--defaut x]] [--bundle …]
//        [--only iphone13-paysage,ordi-1440,tv-1080] [--aller rose] [--lien julie] [--sans-vitesse-stockee]
//        [--out verification/out/t/reglages] [--sans-webgl]
// --sans-webgl : contrôle le menu et les vitesses dans le repli sans WebGL ; les effets WebGL sont
// vérifiés séparément par verify-dessins et verify-lumiere-v8. Utile sur Chromium logiciel en cloud.
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  ROOT, lireArgs, ecrans, tactile, lancer, ouvrirCible, ouvrirPage, Rapport, rectDe, zoneSure, dansZone, cibles44, stabiliser,
  etatLivre, attendreGeste, nbGestes, calme, capture, taper, initReglages, initStockageQuiLeve, zoomBornes,
  REGLAGES_DEFAUT, planche, medias, rel,
} from './lib/verif.mjs';

const { opt, drapeau, liste } = lireArgs();
const out = resolve(ROOT, opt('out', 'verification/out/t/reglages'));
const aller = opt('aller', 'rose');
const lien = opt('lien', 'julie');
if (drapeau('banc')) medias();
const cible = await ouvrirCible({ site: opt('site'), url: opt('url'), banc: drapeau('banc'), defaut: opt('defaut'), bundle: opt('bundle') });
const R = new Rapport('reglages', { dir: out, meta: { cible: cible.type, depart: cible.depart } });
const sansWebgl = drapeau('sans-webgl');
const browser = await lancer({ args: sansWebgl ? ['--disable-webgl', '--disable-webgl2'] : undefined });
const insetsDe = (e) => (cible.type === 'site' || cible.type === 'url' ? null : e.insets);
const BORNES = zoomBornes();
/**
 * Valeurs par défaut de la clé gc:reglages:v4 (src/lib/reglages.ts, REGLAGES_DEFAUT) : sons du livre,
 * ambiance et lumière du feu actifs (« oui ») ; muet coupé ; musique coupée (musiqueActive faux, menu sur
 * « aucune ») ; morceau choisi = le premier de la banque (design-system/baked/musique/banque.json, comme
 * reglages.ts le lit par MUSIQUES_IDS[0]).
 */
const PREMIER_MORCEAU = JSON.parse(readFileSync(join(ROOT, 'design-system/baked/musique/banque.json'), 'utf8')).morceaux[0];
const DEFAUT = { ...REGLAGES_DEFAUT, vitesseEcriture: 2, luminosite: 1, eclatBougie: 1, sonsLivre: true, ambiance: true, feu: true, muet: false, musique: 'toutes', musiqueActive: true };
/** Clés de stockage : réglages (v3, src/lib/reglages.ts) et caméra (v2, src/lib/camera.tsx). */
const CLE_REGLAGES = 'gc:reglages:v4';
const CLE_CAMERA = 'gc:camera:v3';
/** Zoom fin par défaut (CAMERA_DEFAULT.zoom, src/lib/camera.tsx). */
const ZOOM_DEFAUT = 1;
/**
 * Lumière du feu figée (lot L, window.__gcFeu) pendant ces essais : son vacillement repeint l'écran à
 * chaque image, ce qui, en rendu logiciel, retarde les animations du menu de plusieurs secondes. Le menu
 * n'en dépend pas.
 */
/**
 * Attend une cadence d'images régulière (≥ 30 i/s pendant 400 ms, 40 s au plus). En rendu logiciel, la
 * première rastérisation d'une page fraîchement ouverte retient les images plusieurs secondes : une
 * animation du menu ou un tourne-page mesurés pendant ce temps n'ont pas de sens.
 */
const cadence = (page, max = 40000) => {
  // Le contrôle fonctionnel du repli ne mesure pas la performance : attendre 30 i/s sur le
  // compositeur logiciel peut retarder chaque tour de 40 s. Les pages/fontes sont déjà prêtes.
  if (sansWebgl) return page.waitForTimeout(500).then(() => 500);
  return page.evaluate((max) => new Promise((resolve) => {
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
}), max).catch(() => -1);
};
const FEU_FIGE = {
  fn: () => {
    const t0 = Date.now();
    const id = setInterval(() => {
      try { if (window.__gcFeu?.figer) { window.__gcFeu.figer({ intensite: 1, dx: 0, dy: 0 }); clearInterval(id); } } catch { clearInterval(id); }
      if (Date.now() - t0 > 20000) clearInterval(id);
    }, 50);
  },
};
console.log(`■ Réglages — ${cible.type} : ${cible.depart}${sansWebgl ? ' (repli sans WebGL, effets vérifiés séparément)' : ''}`);

const BOUTON = '[data-gc-reglages="bouton"]';
const PANNEAU = '[data-gc-reglages="panneau"]';
const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="slider"], [role="switch"], [role="radio"], [role="checkbox"], [role="option"]';

// ---- Lecture de l'état -------------------------------------------------------------------------------
const lireReglages = (page) => page.evaluate(([d, cle]) => { try { return { ...d, ...(JSON.parse(localStorage.getItem(cle)) || {}) }; } catch { return { ...d }; } }, [DEFAUT, CLE_REGLAGES]);
/** État de la loupe lu sur l'écran : [data-gc-loupe] et la réglette « Loupe » du menu. */
const lireLoupe = (page) => page.evaluate(() => {
  const r = document.querySelector('[data-gc-reglages-ligne="loupe"] [role="slider"]');
  return { attr: document.querySelector('.gc-ecran')?.getAttribute('data-gc-loupe') ?? null, valeur: r ? Number(r.getAttribute('aria-valuenow')) : null, texte: r?.getAttribute('aria-valuetext') ?? null };
});
const lireCamera = (page) => page.evaluate((cle) => { try { return JSON.parse(localStorage.getItem(cle)) || null; } catch { return null; } }, CLE_CAMERA);
const panneauVisible = (page) => page.evaluate((s) => {
  const p = document.querySelector(s);
  if (!p || p.hidden || !p.getClientRects().length) return false;
  const st = getComputedStyle(p);
  const r = p.getBoundingClientRect();
  return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
}, PANNEAU);
/** Ouverture ou fermeture en cours ([data-gc-reglages-etat="fermeture"|"ouverture"] du lot R) ? */
const enTransition = (page) => page.evaluate(() => /fermeture|ouverture/.test(document.querySelector('[data-gc-reglages-etat]')?.getAttribute('data-gc-reglages-etat') ?? ''));
async function attendrePanneau(page, visible, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await panneauVisible(page)) === visible && !(await enTransition(page))) return true;
    await page.waitForTimeout(80);
  }
  return (await panneauVisible(page)) === visible;
}
/** Élément actif : identifiant stable (posé au besoin) ; dans le panneau ; un contrôle (pas la fiche elle-même) ; le bouton. */
const actif = (page) => page.evaluate(([p, b]) => {
  const a = document.activeElement;
  if (!a || a === document.body) return { id: null, dans: false, controle: false, bouton: false, nom: 'body', y: null };
  if (!a.dataset.gcT) a.dataset.gcT = String((window.__gcT = (window.__gcT || 0) + 1));
  const pan = a.closest(p);
  const r = a.getBoundingClientRect();
  return { id: a.dataset.gcT, dans: !!pan, controle: !!pan && a !== pan, bouton: !!a.closest(b), nom: a.getAttribute('aria-label') || a.textContent.trim().slice(0, 30) || a.tagName.toLowerCase(), y: r.top + r.height / 2 };
}, [PANNEAU, BOUTON]);
const focusablesDuPanneau = (page) => page.evaluate(([p, f]) => {
  const pan = document.querySelector(p);
  if (!pan) return [];
  return [...pan.querySelectorAll(f)].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden], [inert]')).map((el) => {
    if (!el.dataset.gcT) el.dataset.gcT = String((window.__gcT = (window.__gcT || 0) + 1));
    return el.dataset.gcT;
  });
}, [PANNEAU, FOCUSABLES]);
/** Instantané des valeurs : réglages, caméra, aria-checked / pressed / valuenow / value dans le panneau. */
const instantane = (page) => page.evaluate((p) => {
  let s = '';
  try { s = (localStorage.getItem('gc:reglages:v4') || '') + (localStorage.getItem('gc:camera:v3') || ''); } catch { /* rien */ }
  const pan = document.querySelector(p);
  const aria = pan ? [...pan.querySelectorAll('[aria-checked], [aria-pressed], [aria-valuenow], [aria-selected], input, select')].map((el) => `${el.getAttribute('aria-checked')}${el.getAttribute('aria-pressed')}${el.getAttribute('aria-valuenow')}${el.getAttribute('aria-selected')}${el.value ?? ''}${el.checked ?? ''}`).join('|') : '';
  return s + '§' + aria;
}, PANNEAU);

// ---- Contrôles du panneau -------------------------------------------------------------------------
async function premier(locs) {
  for (const l of locs) {
    const n = await l.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const x = l.nth(i);
      if (await x.isVisible().catch(() => false)) return x;
    }
  }
  return null;
}
const LIGNES = {
  distance: ['distance', 'taille'], zoom: ['zoom'], son: ['son'], volume: ['volume'], lectureAuto: ['lectureAuto', 'auto'],
  vitesseAnimations: ['vitesseAnimations'], vitesseEcriture: ['vitesseEcriture'], mouvementReduit: ['mouvementReduit', 'mouvement'], aller: ['aller', 'invites'], defaut: ['defaut', 'fin'],
  loupe: ['loupe'], sonsLivre: ['sonsLivre'], ambiance: ['ambiance'], feu: ['feu'],
};
const ligne = (page, cle) => page.locator((LIGNES[cle] ?? [cle]).flatMap((id) => [`${PANNEAU} [data-gc-reglage="${id}"]`, `${PANNEAU} [data-gc-reglages-ligne="${id}"]`]).join(', '));
const pan = (page) => page.locator(PANNEAU);
const choix = (page, cle, re) => premier([
  ligne(page, cle).getByRole('radio', { name: re }), ligne(page, cle).getByRole('button', { name: re }), ligne(page, cle).getByRole('option', { name: re }),
  pan(page).getByRole('radio', { name: re }), pan(page).getByRole('button', { name: re }), pan(page).getByRole('option', { name: re }), pan(page).getByLabel(re), pan(page).getByText(re),
]);
const interrupteur = (page, cle, re) => premier([
  ligne(page, cle).getByRole('switch'), ligne(page, cle).getByRole('checkbox'), ligne(page, cle).locator('button, input[type="checkbox"]'),
  pan(page).getByRole('switch', { name: re }), pan(page).getByRole('checkbox', { name: re }), pan(page).getByRole('button', { name: re }), pan(page).getByLabel(re),
]);
const NOMS = {
  son: /^(le )?son\b|\bson( et volume| des vidéos)?$/i,
  lectureAuto: /lecture auto|lancer la vidéo/i,
  mouvementReduit: /moins d.animation|mouvement r[ée]duit/i,
  zoom: /zoom|ajuster/i,
  aller: /aller [àa]|choisir un invit/i,
  defaut: /par d[ée]faut|remettre|r[ée]initialiser|à z[ée]ro/i,
};
const CHERCHE = (cle) => `[data-gc-reglage|data-gc-reglages-ligne="${(LIGNES[cle] ?? [cle]).join('|')}"] ou nom accessible ${NOMS[cle] ?? cle}`;
const estChoisi = (loc) => loc.evaluate((el) => el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || el.checked === true || el.getAttribute('aria-current') === 'true');

/** Le panneau est ouvert et posé : visible, sans transition, focus sur un contrôle, fiche immobile. */
async function pose(page) {
  if (!(await attendrePanneau(page, true, 8000))) return false;
  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && !(await actif(page)).controle) await page.waitForTimeout(80);
  await stabiliser(page, PANNEAU, { images: 6, timeout: 8000 });
  return true;
}
async function ouvrirParBouton(page, e) {
  const b = await rectDe(page, BOUTON);
  if (!b) return false;
  await taper(page, e, b.cx, b.cy);
  return pose(page);
}
async function ouvrirMenu(page, e, touche = 'm') {
  if ((await panneauVisible(page)) && !(await enTransition(page))) return true;
  if (await enTransition(page)) await attendrePanneau(page, false);
  await page.keyboard.press(touche);
  if (await pose(page)) return true;
  // Machine chargée : un panneau déjà monté finit de s'ouvrir (recliquer ⚙ le refermerait).
  if (await page.locator(PANNEAU).count()) return pose(page);
  return ouvrirParBouton(page, e);
}
async function fermerMenu(page) {
  if (!(await panneauVisible(page))) return attendrePanneau(page, false);
  await page.keyboard.press('Escape');
  return attendrePanneau(page, false);
}
/** Clic (toucher au doigt) ; si l'élément reste instable ou couvert 3 s, clic forcé, noté dans `forces`. */
const forces = [];
async function cliquer(page, e, loc) {
  // La fiche peut encore bouger (ouverture, cran de caméra changé) : on attend qu'elle se pose.
  if (await panneauVisible(page)) await stabiliser(page, PANNEAU, { images: 5, timeout: 8000 });
  try {
    if (tactile(e)) {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await loc.tap({ timeout: 3000 });
    } else await loc.click({ timeout: 3000 });
  } catch (x) {
    const nom = await loc.evaluate((el) => el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30)).catch(() => '?');
    forces.push(`${e.nom} « ${nom} » : ${String(x).split('\n').find((l) => /intercepts|not stable|not visible|outside/.test(l))?.trim() ?? 'délai dépassé'}`);
    await loc.click({ force: true, timeout: 3000 });
  }
  await page.waitForTimeout(150);
}
/** Bascule un réglage oui / non : l'option non cochée d'un groupe radio, sinon interrupteur, case ou bouton. */
async function basculer(page, e, cle) {
  // « Animations » (comme l'appareil / complètes / réduites) : on bascule entre « réduites » et le défaut.
  if (cle === 'mouvementReduit') {
    const reduites = await premier([ligne(page, cle).getByRole('radio', { name: /^r[ée]duites$/i })]);
    if (reduites) {
      const vers = (await estChoisi(reduites)) ? await premier([ligne(page, cle).getByRole('radio', { name: /comme l.appareil|^auto$/i })]) : reduites;
      if (vers) { await cliquer(page, e, vers); return true; }
    }
  }
  const radio = await premier([ligne(page, cle).locator('[role="radio"][aria-checked="false"]'), ligne(page, cle).locator('input[type="radio"]:not(:checked)')]);
  if (radio) { await cliquer(page, e, radio); return true; }
  const loc = await interrupteur(page, cle, NOMS[cle]);
  if (!loc) return false;
  await cliquer(page, e, loc);
  return true;
}
const existeLigne = async (page, cle) => (await ligne(page, cle).count()) > 0 || !!(await interrupteur(page, cle, NOMS[cle]));

// ---- Vitesse : durée d'un tourne-page ---------------------------------------------------------------
// « Vitesse des animations » : une réglette de 25 à 200 % (pas de 5 %), 100 % par défaut. L'ancien choix
// « vive · normale · lente » est lu comme 150 %, 100 % et 70 % (le ressort « paper » durait 0,6 · 0,9 · 1,3 s).
const FACTEURS = { vive: 1.5, normale: 1, lente: 0.7 };
/** Règle la réglette « Vitesse des animations » (menu ouvert) : Début (25 %), puis → par pas de 5 %. */
async function reglerVitesse(page, facteur) {
  const sl = ligne(page, 'vitesseAnimations').getByRole('slider');
  await sl.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < Math.round((facteur - 0.25) / 0.05); i++) await page.keyboard.press('ArrowRight');
}
// Durée du tourne-page à la montre (debut → fin). Motion n'avance que de 40 ms au plus par image : sur une
// machine lente, la durée s'allonge mais l'ordre des vitesses reste. En information : « l'horloge du
// ressort » Σ min(Δt, 40 ms) sur les images vues entre debut et fin (fausse si la page est affamée).
const MAX_IMAGE_MS = 40;
async function mesurerTour(page) {
  await calme(page, { calme: 300, debutMax: 300 });
  await cadence(page);
  const n = await nbGestes(page);
  await page.evaluate(() => { window.__gcImg = []; window.__gcImgOn = true; const f = (t) => { window.__gcImg.push(t); if (window.__gcImgOn) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.keyboard.press('ArrowRight');
  const debut = await attendreGeste(page, 'debut', 'page', { depuis: n, timeout: 20000 });
  if (!debut) {
    await page.evaluate(() => { window.__gcImgOn = false; });
    throw new Error(`aucun tour de page déclenché : ${JSON.stringify(await etatLivre(page))}`);
  }
  const fin = await attendreGeste(page, 'fin', 'page', { depuis: n, timeout: 30000 });
  if (!fin) {
    await page.evaluate(() => { window.__gcImgOn = false; });
    throw new Error(`tour de page non terminé : ${JSON.stringify(await etatLivre(page))}`);
  }
  const ressort = debut && fin ? await page.evaluate(([a, b, max]) => {
    window.__gcImgOn = false;
    const im = window.__gcImg.filter((t) => t >= a && t <= b);
    let s = im.length ? Math.min(im[0] - a, max) : Math.min(b - a, max);
    for (let i = 1; i < im.length; i++) s += Math.min(im[i] - im[i - 1], max);
    return Math.round(s);
  }, [debut.t, fin.t, MAX_IMAGE_MS]) : null;
  const d = debut && fin ? { mur: Math.round(fin.t - debut.t), ressort } : null;
  const n2 = await nbGestes(page);
  await page.keyboard.press('ArrowLeft');
  await attendreGeste(page, 'fin', 'page', { depuis: n2, timeout: 30000 });
  await calme(page, { calme: 300, debutMax: 300 });
  return d;
}
const ordonne = (m) => m.vive != null && m.normale != null && m.lente != null && m.vive < m.normale && m.normale < m.lente;
/** Deux tours entrelacés (vive, normale, lente, vive, normale, lente) : la charge de la machine n'ajoute que du temps, on garde le plus court. */
async function mesurerVitesses(regler, mesurer) {
  const m = {};
  const tous = { vive: [], normale: [], lente: [] };
  for (let tour = 0; tour < 2; tour++) {
    for (const v of ['vive', 'normale', 'lente']) {
      await regler(v);
      const d = await mesurer(v);
      if (d != null) tous[v].push(d);
    }
  }
  for (const v of Object.keys(tous)) m[v] = tous[v].length ? Math.min(...tous[v].map((x) => x.mur)) : null;
  const liste_ = (v) => tous[v].map((x) => `${x.mur}${x.ressort != null ? ` (ressort ${x.ressort})` : ''}`).join(' / ');
  return { m, detail: `vive ${m.vive} ms · normale ${m.normale} ms · lente ${m.lente} ms — le plus court de : vive ${liste_('vive')} · normale ${liste_('normale')} · lente ${liste_('lente')}` };
}

/** La vitesse écrite dans gc:reglages:v4 règle la durée d'un tourne-page (sans le menu). */
async function vitesseStockee(e) {
  let pageMode = false;
  const { m, detail } = await mesurerVitesses(async () => {}, async (v) => {
    const { ctx, page } = await ouvrirPage(browser, cible, e, lien, { init: [initReglages({ vitesse: v, vitesseAnimations: FACTEURS[v] }), FEU_FIGE] });
    try {
      if ((await etatLivre(page)).cadrage === 'page') { pageMode = true; return null; }
      return await mesurerTour(page);
    } finally {
      await ctx.close();
    }
  });
  if (pageMode) R.info(e.nom, 'vitesse (réglage stocké)', 'cadrage « page » : mesure faite sur les écrans « double »');
  else R.ok(e.nom, 'vitesse (réglage stocké gc:reglages:v4) : tourne-page vive < normale < lente', ordonne(m), detail);
  // Une clé v3 d'avant les pourcentages (champ `vitesse` seul, sans vitesseAnimations) : « lente » est relue comme 70 %.
  // Avec les deux champs (ci-dessus), c'est vitesseAnimations qui l'emporte ; `vitesse` ne sert qu'au banc factice.
  if (cible.type === 'banc') return;
  const { ctx, page } = await ouvrirPage(browser, cible, e, lien, { init: [{ fn: () => { try { if (!sessionStorage.getItem('__gcAncienne')) { localStorage.setItem('gc:reglages:v3', JSON.stringify({ v: 1, vitesse: 'lente' })); sessionStorage.setItem('__gcAncienne', '1'); } } catch { /* stockage indisponible */ } } }, FEU_FIGE] });
  try {
    let affiche = null;
    if (await ouvrirMenu(page, e)) {
      const sl = ligne(page, 'vitesseAnimations').getByRole('slider');
      if (await sl.count()) affiche = ((await sl.getAttribute('aria-valuetext')) ?? '').replace(/\s/g, ' ');
    }
    R.ok(e.nom, 'ancien réglage « lente » (champ vitesse) relu comme 70 % par le menu', affiche === '70 %', affiche ?? 'menu ou réglette introuvable');
  } finally {
    await ctx.close();
  }
}

// ---- Suite du menu ----------------------------------------------------------------------------------
async function suiteMenu(e) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, lien, { init: [FEU_FIGE] });
  await cadence(page);
  const T = (test, cond, d) => R.ok(e.nom, test, cond, d);
  /** Un bloc de tests : une exception n'arrête pas les suivants ; le menu est rouvert au besoin. */
  const bloc = async (nom, f, { menu = true } = {}) => {
    try {
      if (menu && !(await ouvrirMenu(page, e))) { R.ajouter(e.nom, `${nom} : ouvrir le menu`, 'KO', 'le menu ne s\'ouvre pas'); return; }
      await f();
    } catch (x) {
      R.ajouter(e.nom, `${nom} : exécution`, 'KO', `plantage : ${String(x).split('\n')[0]}`);
    }
  };
  try {
    const b = await rectDe(page, BOUTON);
    if (!b || !b.visible) { R.attente(e.nom, `bouton ${BOUTON}`); return; }
    const z = await zoneSure(page, insetsDe(e));
    T('bouton dans la zone sûre', dansZone(b, z), `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)} · zone ${z.x},${z.y} → ${z.r},${z.b}`);
    if (tactile(e)) {
      const c = (await cibles44(page, BOUTON))[0];
      T('bouton : cible ≥ 44 px au doigt', !!c?.ok, c ? `${c.w}×${c.h} px${c.zoneTouchable ? ' (zone touchable ≥ 44)' : ''}` : 'invisible');
    }

    // 1. Ouvrir par le bouton (un panneau déjà ouvert au départ est d'abord refermé)
    if (await panneauVisible(page)) await fermerMenu(page);
    const o = await ouvrirParBouton(page, e);
    T('ouvrir par le bouton', o);
    if (!o) {
      if (!(await page.locator(PANNEAU).count())) R.attente(e.nom, `panneau ${PANNEAU}`);
      return;
    }
    R.capturer(await capture(page, `${e.nom}-menu`, out), `${e.titre} — menu ouvert`);
    const roles = await page.evaluate((p) => { const x = document.querySelector(p); if (!x) return { dialog: false, modal: null }; const d = x.closest('[role="dialog"]') ?? (x.getAttribute('role') === 'dialog' ? x : x.querySelector('[role="dialog"]')); return { dialog: !!d || x.getAttribute('role') === 'dialog', modal: (d ?? x).getAttribute('aria-modal') }; }, PANNEAU);
    T('panneau : role="dialog" et aria-modal="true"', roles.dialog && roles.modal === 'true', `dialog ${roles.dialog}, aria-modal ${roles.modal}`);
    const a0 = await actif(page);
    T('ouvert : le focus est sur un contrôle du panneau', a0.controle, a0.nom);

    // 1 bis. Défauts à l'ouverture, contexte neuf (rien n'a encore été changé) : sons du livre, ambiance et
    // lumière du feu sur « oui », musique active en rotation (« toutes (rotation) »). Jugés ici, avant toute remise à zéro.
    await bloc('défauts à l\'ouverture', async () => {
      const coche = (cle, opts) => premier([ligne(page, cle).getByRole('radio', opts)]).then((l) => !!l && estChoisi(l));
      const sons = await coche('sonsLivre', { name: /^oui$/i });
      const amb = await coche('ambiance', { name: /^oui$/i });
      const feu = await coche('feu', { name: /^oui$/i });
      T('défauts : sons du livre, ambiance et lumière du feu sur « oui »', sons && amb && feu, `sons du livre ${sons}, ambiance ${amb}, lumière du feu ${feu}`);
      const mus = await coche('musique', { name: /^toutes/i });
      T('défaut : musique active (« toutes (rotation) » au menu, bouton musique allumé)', mus);
    }, { menu: false });

    // 1 ter. Bouton musique (barre du haut, hors du menu) : allumé au départ, éteint au premier appui,
    // rallumé au second ; le haut-parleur (muet) n'en bouge pas.
    await bloc('bouton musique', async () => {
      if (await panneauVisible(page)) await fermerMenu(page);
      const btn = page.locator('[data-gc-controle="musique"]').first();
      if (!(await btn.count())) { R.ajouter(e.nom, 'bouton musique', 'KO', 'introuvable ([data-gc-controle="musique"])'); return; }
      const pressed = () => btn.getAttribute('aria-pressed');
      T('bouton musique : aria-pressed « true » au départ', (await pressed()) === 'true', `aria-pressed ${await pressed()}`);
      await cliquer(page, e, btn);
      const eteint = await lireReglages(page);
      T('bouton musique : premier appui → éteint (aria-pressed « false », musiqueActive faux)', (await pressed()) === 'false' && eteint.musiqueActive === false && eteint.muet === false,
        `aria-pressed ${await pressed()}, musiqueActive ${eteint.musiqueActive}, muet ${eteint.muet}`);
      await cliquer(page, e, btn);
      // Le focus revient au bouton ⚙ (le menu s'ouvre et se referme depuis lui : Échap le lui rend).
      await page.evaluate(() => document.querySelector('[data-gc-reglages="bouton"]')?.focus());
      const allume = await lireReglages(page);
      T('bouton musique : second appui → rallumé (aria-pressed « true », musiqueActive vrai, rotation)', (await pressed()) === 'true' && allume.musiqueActive === true && allume.musique === 'toutes', `aria-pressed ${await pressed()}, musiqueActive ${allume.musiqueActive}, morceau ${allume.musique}`);
    }, { menu: false });

    // 2. Échap ferme et rend le focus au bouton
    await bloc('Échap', async () => {
      const tf = Date.now();
      await page.keyboard.press('Escape');
      const f = await attendrePanneau(page, false);
      T('Échap ferme le panneau', f, `fermeture : ${Date.now() - tf} ms (rendu logiciel)`);
      const a = await actif(page);
      T('Échap rend le focus au bouton', a.bouton, `focus : ${a.nom}`);
    }, { menu: false });

    // 3. M et « , »
    await bloc('M et « , »', async () => {
      await fermerMenu(page);
      await page.keyboard.press('m');
      T('M ouvre le menu', await pose(page));
      R.info(e.nom, 'focus à l\'ouverture par M', (await actif(page)).nom);
      await fermerMenu(page);
      await page.keyboard.press(',');
      T('« , » ouvre le menu', await pose(page));
    }, { menu: false });

    // 4. Focus piégé
    await bloc('focus piégé', async () => {
      const fo = await focusablesDuPanneau(page);
      let fuite = null;
      for (const [touche, nom] of [['Tab', 'Tab'], ['Shift+Tab', 'Maj+Tab']]) {
        for (let i = 0; i < fo.length + 3 && !fuite; i++) {
          await page.keyboard.press(touche);
          const x = await actif(page);
          if (!x.dans) fuite = `${nom} n° ${i + 1} → ${x.nom}`;
        }
      }
      T('focus piégé (Tab et Maj+Tab restent dans le panneau)', !fuite && fo.length > 0, fuite ?? `${fo.length} éléments focalisables`);
    });

    // 5. ↓ ↑ : le focus descend d'une ligne, puis remonte (jugé sur la position à l'écran)
    await bloc('↓ ↑', async () => {
      await page.evaluate(([p, f]) => { // départ : l'option choisie (ou le premier élément) de la première ligne
        const pn = document.querySelector(p);
        const l = pn?.querySelector('[data-gc-reglages-ligne], [data-gc-reglage]');
        (l?.querySelector('[aria-checked="true"]') ?? l?.querySelector(f) ?? pn?.querySelector(f))?.focus();
      }, [PANNEAU, FOCUSABLES]);
      const d0 = await actif(page);
      await page.keyboard.press('ArrowDown');
      const d1 = await actif(page);
      await page.keyboard.press('ArrowUp');
      const d2 = await actif(page);
      T('↓ descend d\'une ligne, ↑ remonte (focus dans le panneau)', d1.dans && d2.dans && d1.y > d0.y + 2 && d2.y < d1.y - 2,
        `${d0.nom} (${Math.round(d0.y)}) → ↓ ${d1.nom} (${Math.round(d1.y)}) → ↑ ${d2.nom} (${Math.round(d2.y)})`);
    });

    // 6. ← → : une valeur change, puis revient
    await bloc('← →', async () => {
      const fo = await focusablesDuPanneau(page);
      let lr = null;
      for (const id of fo.slice(0, 18)) {
        if (!(await panneauVisible(page))) await ouvrirMenu(page, e);
        await page.evaluate(([p, i]) => document.querySelector(`${p} [data-gc-t="${i}"]`)?.focus(), [PANNEAU, id]);
        const nom = (await actif(page)).nom;
        const s0 = await instantane(page);
        await page.keyboard.press('ArrowRight');
        const s1 = await instantane(page);
        if (s1 === s0) continue;
        await page.keyboard.press('ArrowLeft');
        const s2 = await instantane(page);
        lr = { nom, revient: s2 === s0 };
        if (lr.revient) break;
      }
      T('← → changent une valeur (et ← la rend)', !!lr?.revient, lr ? `ligne « ${lr.nom} »${lr.revient ? '' : ' : ← ne revient pas'}` : 'aucune valeur ne change avec →');
    });

    // 7. Oui / non : son, lecture auto, moins d'animations
    for (const cle of ['son', 'lectureAuto', 'mouvementReduit']) {
      await bloc(`réglage « ${cle} »`, async () => {
        if (!(await existeLigne(page, cle))) { R.ajouter(e.nom, `réglage « ${cle} »`, 'KO', `introuvable (cherché : ${CHERCHE(cle)})`); return; }
        const r0 = await lireReglages(page);
        const m0 = await page.evaluate(() => document.querySelector('[data-gc-mouvement]')?.getAttribute('data-gc-mouvement') ?? null);
        await basculer(page, e, cle);
        const r1 = await lireReglages(page);
        T(`réglage « ${cle} » : ${r0[cle]} → ${r1[cle]} (gc:reglages:v4)`, r1[cle] === !r0[cle]);
        if (cle === 'mouvementReduit') {
          const m1 = await page.evaluate(() => document.querySelector('[data-gc-mouvement]')?.getAttribute('data-gc-mouvement') ?? null);
          if (m0 == null && m1 == null) R.info(e.nom, 'moins d\'animations : [data-gc-mouvement]', 'attribut absent');
          else T('moins d\'animations : [data-gc-mouvement] suit le réglage', m0 !== m1, `${m0} → ${m1}`);
        }
        if (!(await panneauVisible(page))) await ouvrirMenu(page, e);
        await basculer(page, e, cle);
      });
    }
    await bloc('volume', async () => {
      const vol = await premier([ligne(page, 'volume').getByRole('slider'), pan(page).getByRole('slider', { name: /volume/i }), pan(page).getByLabel(/volume/i)]);
      const ios = await page.evaluate(() => /iPhone|iPad/.test(navigator.userAgent));
      R.info(e.nom, 'volume', vol ? 'présent' : ios ? 'masqué (iOS : volume en lecture seule)' : 'introuvable');
    });

    // 8. Vitesses au menu (réglettes en pourcentage), puis mesurée
    let vitesses = 0;
    await bloc('vitesse des animations', async () => {
      const sl = ligne(page, 'vitesseAnimations').getByRole('slider');
      if (!(await sl.count())) { R.ajouter(e.nom, 'vitesse des animations', 'KO', `introuvable (cherché : ${CHERCHE('vitesseAnimations')} › slider)`); return; }
      const b = await sl.evaluate((x) => ({ min: x.getAttribute('aria-valuemin'), max: x.getAttribute('aria-valuemax'), now: x.getAttribute('aria-valuenow'), texte: (x.getAttribute('aria-valuetext') ?? '').replace(/\s/g, ' ') }));
      T('vitesse des animations : 100 % par défaut, bornes 25 – 200 %', b.now === '1' && b.min === '0.25' && b.max === '2' && b.texte === '100 %', `${b.texte} (${b.min} – ${b.max})`);
      for (const v of ['vive', 'normale', 'lente']) {
        if (!(await panneauVisible(page))) await ouvrirMenu(page, e);
        await reglerVitesse(page, FACTEURS[v]);
        const ok = (await lireReglages(page)).vitesseAnimations === FACTEURS[v];
        if (ok) vitesses++;
        T(`vitesse des animations ${Math.round(FACTEURS[v] * 100)} % réglée au menu (gc:reglages:v4)`, ok, `${(await lireReglages(page)).vitesseAnimations}`);
      }
      // Début et Fin : les bornes, et rien au-delà
      await sl.focus();
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowRight');
      const haut = (await lireReglages(page)).vitesseAnimations;
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowLeft');
      const bas = (await lireReglages(page)).vitesseAnimations;
      T('vitesse des animations : Fin = 200 %, Début = 25 %, jamais au-delà', haut === 2 && bas === 0.25, `Fin ${haut} · Début ${bas}`);
    });
    await bloc('vitesse de l\'écriture', async () => {
      const sl = ligne(page, 'vitesseEcriture').getByRole('slider');
      if (!(await sl.count())) { R.ajouter(e.nom, 'vitesse de l\'écriture', 'KO', `introuvable (cherché : ${CHERCHE('vitesseEcriture')} › slider)`); return; }
      if (!(await panneauVisible(page))) await ouvrirMenu(page, e);
      const b = await sl.evaluate((x) => ({ min: x.getAttribute('aria-valuemin'), max: x.getAttribute('aria-valuemax'), now: x.getAttribute('aria-valuenow'), texte: (x.getAttribute('aria-valuetext') ?? '').replace(/\s/g, ' ') }));
      T('vitesse de l\'écriture : 200 % par défaut, bornes 25 – 400 %', b.now === '2' && b.min === '0.25' && b.max === '4' && b.texte === '200 %', `${b.texte} (${b.min} – ${b.max})`);
      await sl.focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      const a = (await lireReglages(page)).vitesseEcriture;
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowRight');
      const z = (await lireReglages(page)).vitesseEcriture;
      T('vitesse de l\'écriture : Début + 2 pas = 35 %, Fin = 400 % (pas de 5 %, bornée)', Math.abs(a - 0.35) < 1e-9 && z === 4, `Début + 2 pas ${a} · Fin ${z}`);
      // Remise à 200 % pour la suite
      for (let i = 0; i < 60 && (await lireReglages(page)).vitesseEcriture > 2.0001; i++) await page.keyboard.press('ArrowLeft');
      T('vitesse de l\'écriture : ← revient à 200 %', (await lireReglages(page)).vitesseEcriture === 2, `${(await lireReglages(page)).vitesseEcriture}`);
    });
    if (vitesses === 3 && (await etatLivre(page)).cadrage !== 'page') {
      await bloc('vitesse mesurée', async () => {
        const { m, detail } = await mesurerVitesses(async (v) => {
          if (!(await ouvrirMenu(page, e)) && !(await ouvrirMenu(page, e))) throw new Error(`le menu ne se rouvre pas (vitesse ${v})`);
          await reglerVitesse(page, FACTEURS[v]);
          await fermerMenu(page);
        }, () => mesurerTour(page));
        T('vitesse choisie au menu : tourne-page 150 % < 100 % < 70 %', ordonne(m), detail);
      }, { menu: false });
    } else if (vitesses === 3) R.info(e.nom, 'vitesse mesurée', 'cadrage « page » : mesure faite sur les écrans « double »');

    // 9. Zoom borné par zoomBornes(cran)
    await bloc('zoom', async () => {
      const zs = await premier([ligne(page, 'zoom').getByRole('slider'), ligne(page, 'zoom').locator('input[type="range"]'), pan(page).getByRole('slider', { name: NOMS.zoom }), pan(page).getByLabel(NOMS.zoom)]);
      const zPlus = await premier([ligne(page, 'zoom').getByRole('button', { name: /près|agrandir|\+|zoom plus/i }), pan(page).getByRole('button', { name: /zoom.*(\+|plus)|(\+|plus).*zoom/i })]);
      const zMoins = await premier([ligne(page, 'zoom').getByRole('button', { name: /loin|réduire|−|-|zoom moins/i }), pan(page).getByRole('button', { name: /zoom.*(−|-|moins)|(−|-|moins).*zoom/i })]);
      if (!zs && !(zPlus && zMoins)) {
        // Caméra fixe (cadrage « page », ou petit écran couché : CONTRACT § 11) : ni taille du livre ni zoom.
        if (!(await ligne(page, 'distance').count()) && !(await ligne(page, 'zoom').count())) R.info(e.nom, 'zoom', `caméra fixe sur cet écran (cadrage ${(await etatLivre(page)).cadrage}) : ni « taille du livre » ni zoom au menu`);
        else R.ajouter(e.nom, 'zoom', 'KO', `introuvable (cherché : ${CHERCHE('zoom')}, curseur ou boutons plus près / plus loin)`);
        return;
      }
      const pousser = async (sens) => {
        if (zs) {
          await zs.focus();
          await page.keyboard.press(sens > 0 ? 'End' : 'Home');
          for (let i = 0; i < 45; i++) await page.keyboard.press(sens > 0 ? 'ArrowRight' : 'ArrowLeft');
        } else for (let i = 0; i < 45; i++) await (sens > 0 ? zPlus : zMoins).click({ timeout: 3000, force: true });
        await page.waitForTimeout(200);
        return lireCamera(page);
      };
      const haut = await pousser(1);
      const bas = await pousser(-1);
      if (!haut || !bas) { R.info(e.nom, 'zoom', `${CLE_CAMERA} non écrit (caméra non mémorisée : carte ou écran simulé)`); return; }
      const cran = haut.distance ?? 'moyenne';
      const [lo, hi] = BORNES[cran] ?? [0.6, 1.15];
      const dedans = (c) => c.zoom >= lo - 1e-3 && c.zoom <= hi + 1e-3;
      T(`zoom borné par zoomBornes(${cran}) = [${lo}, ${hi}]`, dedans(haut) && dedans(bas), `max ${haut.zoom} · min ${bas.zoom}${Math.abs(haut.zoom - hi) < 0.006 && Math.abs(bas.zoom - lo) < 0.006 ? ' (bornes atteintes)' : ''}`);
      if (zs) { await zs.focus(); for (let i = 0; i < 100 && ((await lireCamera(page))?.zoom ?? 1) < 1; i++) await page.keyboard.press('ArrowRight'); }
    });

    // 10. Réglages par défaut
    await bloc('réglages par défaut', async () => {
      const def = await premier([ligne(page, 'defaut').getByRole('button', { name: NOMS.defaut }), ligne(page, 'defaut').locator('button'), pan(page).getByRole('button', { name: NOMS.defaut })]);
      if (!def) { R.ajouter(e.nom, 'réglages par défaut', 'KO', `introuvable (cherché : ${CHERCHE('defaut')})`); return; }
      await reglerVitesse(page, FACTEURS.lente);
      const ecr = ligne(page, 'vitesseEcriture').getByRole('slider');
      if (await ecr.count()) { await ecr.focus(); await page.keyboard.press('End'); }
      if (!(await lireReglages(page)).lectureAuto) { if (!(await panneauVisible(page))) await ouvrirMenu(page, e); await basculer(page, e, 'lectureAuto'); }
      if (!(await panneauVisible(page))) await ouvrirMenu(page, e);
      // Hors défaut avant la remise (sinon elle ne prouve rien pour ces réglages) : sons du livre, ambiance,
      // lumière du feu coupés, musique jouée (le premier morceau, choisi au menu).
      const titreRe = new RegExp('^' + PREMIER_MORCEAU.titre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
      for (const [cle, re] of [['sonsLivre', /^non$/i], ['ambiance', /^non$/i], ['feu', /^non$/i], ['musique', titreRe]]) {
        const l = await premier([ligne(page, cle).getByRole('radio', { name: re })]);
        if (l) await cliquer(page, e, l);
        if (!(await panneauVisible(page))) await ouvrirMenu(page, e);
      }
      const d2 = await premier([ligne(page, 'defaut').getByRole('button', { name: NOMS.defaut }), ligne(page, 'defaut').locator('button'), pan(page).getByRole('button', { name: NOMS.defaut })]);
      await cliquer(page, e, d2);
      const r = await lireReglages(page);
      const ecarts = Object.entries(DEFAUT).filter(([k, v]) => r[k] !== v).map(([k]) => `${k}=${r[k]}`);
      T('réglages par défaut : retour aux valeurs du contrat (gc:reglages:v4)', !ecarts.length, ecarts.join(', ') || `sonsLivre ${r.sonsLivre}, ambiance ${r.ambiance}, feu ${r.feu}, musique ${r.musique}`);
      const cam = await lireCamera(page);
      T(`réglages par défaut : zoom fin ${Math.round(ZOOM_DEFAUT * 100)} % (gc:camera:v3, CAMERA_DEFAULT)`, !!cam && Math.abs(cam.zoom - ZOOM_DEFAUT) < 1e-6, `zoom ${cam?.zoom ?? 'non écrit'}`);
    });

    // 10 bis. Loupe et sons du livre (plan v4) : sur tous les écrans, téléphone compris
    await bloc('loupe et sons du livre', async () => {
      const lg = ligne(page, 'loupe');
      const sl = ligne(page, 'sonsLivre');
      T('ligne « Loupe » présente (tous les écrans)', (await lg.count()) > 0, `cadrage ${(await etatLivre(page)).cadrage}`);
      T('ligne « Sons du livre » présente (tous les écrans)', (await sl.count()) > 0);
      if (!(await lg.count()) || !(await sl.count())) return;
      const l0 = await lireLoupe(page);
      T('loupe : 100 % par défaut, bornes 100 – 300 %', l0.valeur === 1 && l0.attr === 'repos' && await lg.getByRole('slider').evaluate((x) => x.getAttribute('aria-valuemin') === '1' && x.getAttribute('aria-valuemax') === '3'), `${l0.texte}, ${l0.attr}`);
      // Loupe : le + de la ligne (pas de 25 % ; sur la feuille du téléphone, la réglette seule), puis → sur la réglette
      const plus = await premier([lg.getByRole('button', { name: /plus/i })]);
      if (plus) await cliquer(page, e, plus);
      else { await lg.getByRole('slider').focus(); await page.keyboard.press('ArrowRight'); }
      const attendreLoupe = async (attr, ms = 20000) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms && (await lireLoupe(page)).attr !== attr) await page.waitForTimeout(150);
      };
      await attendreLoupe('zoome');
      const l1 = await lireLoupe(page);
      T(`loupe : ${plus ? '« + » de la ligne' : '→ sur la réglette'} → 125 %, le livre est zoomé`, l1.valeur === 1.25 && l1.attr === 'zoome', `${l1.texte}, ${l1.attr}`);
      await lg.getByRole('slider').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(900);
      const l2 = await lireLoupe(page);
      T('loupe : → sur la réglette → 150 %', l2.valeur === 1.5, l2.texte);
      // Sons du livre (défaut « oui ») : « non », puis « oui », tous deux mémorisés (gc:reglages:v4)
      const non0 = await premier([sl.getByRole('radio', { name: /^non$/i })]);
      if (non0) await cliquer(page, e, non0);
      T('sons du livre : « non » → sonsLivre false (gc:reglages:v4)', (await lireReglages(page)).sonsLivre === false);
      const oui = await premier([sl.getByRole('radio', { name: /^oui$/i })]);
      if (oui) await cliquer(page, e, oui);
      T('sons du livre : « oui » → sonsLivre true (gc:reglages:v4)', (await lireReglages(page)).sonsLivre === true);
      const vol = await premier([ligne(page, 'volume').getByRole('slider')]);
      T('volume visible quand les sons du livre sont actifs (Web Audio, iPhone compris)', !!vol);
      R.capturer(await capture(page, `${e.nom}-menu-loupe`, out), `${e.titre} — menu : Loupe et Sons du livre`);
      // Remettre par défaut : loupe à 1× aussi ; « non » d'abord, pour que le retour au « oui » se voie
      const non1 = await premier([sl.getByRole('radio', { name: /^non$/i })]);
      if (non1) await cliquer(page, e, non1);
      const def = await premier([ligne(page, 'defaut').getByRole('button', { name: NOMS.defaut })]);
      if (def) await cliquer(page, e, def);
      await attendreLoupe('repos');
      const l3 = await lireLoupe(page);
      const r3 = await lireReglages(page);
      T('remettre par défaut : loupe à 100 % et sons du livre « oui »', l3.attr === 'repos' && l3.valeur === 1 && r3.sonsLivre === true, `${l3.texte}, ${l3.attr}, sonsLivre ${r3.sonsLivre}`);
      // Persistance de sonsLivre : non, puis rechargement
      const non = await premier([sl.getByRole('radio', { name: /^non$/i })]);
      if (non) await cliquer(page, e, non);
      await fermerMenu(page);
      await page.reload();
      await page.waitForTimeout(800);
      await cadence(page);
      const r4 = await lireReglages(page);
      let montre = null;
      if (await ouvrirMenu(page, e)) {
        const n2 = await premier([ligne(page, 'sonsLivre').getByRole('radio', { name: /^non$/i })]);
        montre = !!n2 && await estChoisi(n2);
        const a2 = await premier([ligne(page, 'sonsLivre').getByRole('radio', { name: /^oui$/i })]);
        if (a2) await cliquer(page, e, a2); // retour au défaut (« oui ») pour la suite
      }
      T('sons du livre : « non » mémorisé après rechargement (sonsLivre false, menu)', r4.sonsLivre === false && montre === true, `sonsLivre ${r4.sonsLivre}, menu ${montre}`);
      T('loupe : 100 % après rechargement (rien n\'est mémorisé)', (await lireLoupe(page)).valeur === 1);
    });

    // 10 ter. Ambiance : feu de cheminée et cuisine, lumière du feu (champs du lot S, lus de façon défensive)
    await bloc('ambiance', async () => {
      const sec = await page.evaluate((p) => document.querySelector(`${p} [data-gc-reglages-section="ambiance"]`)?.textContent?.trim() ?? null, PANNEAU);
      T('section « Ambiance » présente', !!sec && /ambiance/i.test(sec), sec ?? 'absente');
      const la = ligne(page, 'ambiance');
      const lf = ligne(page, 'feu');
      T('ligne « Feu de cheminée et cuisine » présente', (await la.count()) > 0);
      T('ligne « Lumière du feu » présente', (await lf.count()) > 0);
      if (!(await la.count()) || !(await lf.count())) return;
      // (Les défauts « oui » sont jugés à l'ouverture, bloc « défauts à l'ouverture ».)
      const lireStocke = (cle) => page.evaluate(([k, c]) => { try { return JSON.parse(localStorage.getItem(k) || '{}')[c]; } catch { return undefined; } }, [CLE_REGLAGES, cle]);
      const non = await premier([la.getByRole('radio', { name: /^non$/i })]);
      if (non) await cliquer(page, e, non);
      const fnon = await premier([lf.getByRole('radio', { name: /^non$/i })]);
      if (fnon) await cliquer(page, e, fnon);
      const mem = (await lireStocke('ambiance')) === false && (await lireStocke('feu')) === false;
      T('ambiance « non » et lumière « non » mémorisées (gc:reglages:v4)', mem, `ambiance ${await lireStocke('ambiance')}, feu ${await lireStocke('feu')}`);
      const def = await premier([ligne(page, 'defaut').getByRole('button', { name: NOMS.defaut })]);
      if (def) await cliquer(page, e, def);
      await page.waitForTimeout(400);
      const a1 = await premier([ligne(page, 'ambiance').getByRole('radio', { name: /^oui$/i })]);
      const f1 = await premier([ligne(page, 'feu').getByRole('radio', { name: /^oui$/i })]);
      const choisisRemis = !!a1 && await estChoisi(a1) && !!f1 && await estChoisi(f1);
      T('remettre par défaut : ambiance et lumière du feu sur « oui » (affiché et mémorisé)', choisisRemis && (await lireStocke('ambiance')) === true && (await lireStocke('feu')) === true,
        `ambiance stockée ${await lireStocke('ambiance')}, feu stocké ${await lireStocke('feu')}`);
      R.capturer(await capture(page, `${e.nom}-menu-ambiance`, out), `${e.titre} — menu : section Ambiance`);
    });

    // 11. Cibles ≥ 44 px et zone sûre
    await bloc('cibles et zone sûre', async () => {
      const sel = `${BOUTON}, ${PANNEAU} button, ${PANNEAU} [role="slider"], ${PANNEAU} [role="switch"], ${PANNEAU} [role="radio"], ${PANNEAU} input, ${PANNEAU} select, ${PANNEAU} a[href]`;
      const cs = await cibles44(page, sel);
      if (tactile(e)) {
        const petites = cs.filter((c) => !c.ok);
        T('cibles du menu ≥ 44 px au doigt', cs.length > 0 && !petites.length, petites.length ? petites.slice(0, 6).map((c) => `${c.nom} ${c.w}×${c.h}`).join(', ') : `${cs.length} cibles`);
      }
      const z2 = await zoneSure(page, insetsDe(e));
      const hors = cs.filter((c) => !dansZone({ x: c.x, y: c.y, r: c.r, b: c.b }, z2));
      const rp = await rectDe(page, PANNEAU);
      T('rien hors de la zone sûre (bouton, contrôles ; le fond du panneau peut passer sous la barre du bas)', !hors.length && dansZone(rp, z2, 1, { ignorerBas: true }),
        hors.length ? hors.slice(0, 6).map((c) => `${c.nom} à ${c.x},${c.y}`).join(', ') : `panneau ${Math.round(rp.x)},${Math.round(rp.y)} → ${Math.round(rp.r)},${Math.round(rp.b)}`);
      R.capturer(await capture(page, `${e.nom}-menu-fin`, out), `${e.titre} — menu (après les essais)`);
    });

    // 12. Aller à… un invité dont la double page n'est pas affichée
    await bloc('Aller à…', async () => {
      const e0 = await etatLivre(page);
      const ici = (x) => e0.spreads.some((s) => s.toLowerCase() === x || s.toLowerCase().endsWith(`-${x}`));
      const liensActifs = !!e0.hash && ici(e0.hash.replace('#', '').toLowerCase());
      const cibles = [...new Set([aller, 'rose', 'julie', 'mathis', 'lisa'])].filter((x) => !ici(x));
      const deplier = await premier([ligne(page, 'aller').getByRole('button', { name: NOMS.aller }), ligne(page, 'aller').locator('button[aria-expanded="false"]'), pan(page).getByRole('button', { name: NOMS.aller })]);
      if (deplier && (await deplier.getAttribute('aria-expanded')) !== 'true') await cliquer(page, e, deplier);
      const select = await premier([ligne(page, 'aller').locator('select'), pan(page).getByRole('combobox', { name: NOMS.aller })]);
      let vise = null;
      for (const x of cibles) {
        const re = new RegExp(x, 'i');
        if (select) {
          const val = await select.evaluate((s, r) => [...s.options].find((o) => new RegExp(r, 'i').test(o.textContent))?.value ?? null, x).catch(() => null);
          if (val != null) { await select.selectOption(val); vise = x; break; }
        } else {
          const o2 = await premier([ligne(page, 'aller').getByRole('button', { name: re }), ligne(page, 'aller').getByRole('option', { name: re }), ligne(page, 'aller').getByRole('link', { name: re }),
            pan(page).getByRole('option', { name: re }), pan(page).getByRole('menuitem', { name: re }), pan(page).getByRole('link', { name: re })]);
          if (o2) { await cliquer(page, e, o2); vise = x; break; }
        }
      }
      if (!vise) { R.ajouter(e.nom, '« Aller à… »', 'KO', `introuvable (cherché : ${CHERCHE('aller')} puis ${cibles.join(', ')})`); return; }
      // le menu se ferme, puis le livre y va : on attend que la double page change (15 s au plus), puis le calme
      const t0 = Date.now();
      while (Date.now() - t0 < 15000 && (await etatLivre(page)).double === e0.double) await page.waitForTimeout(150);
      await calme(page, { calme: 500, debutMax: 1000 });
      const e1 = await etatLivre(page);
      const arrive = e1.spreads.some((s) => s.toLowerCase() === vise || s.toLowerCase().endsWith(`-${vise}`));
      T(`« Aller à… » ${vise} : la double page change`, arrive && e1.double !== e0.double, `double ${e0.double} → ${e1.double}, pages ${e1.spreads.join(', ')}`);
      if (liensActifs) T(`« Aller à… » ${vise} : l'URL suit (#${vise})`, e1.hash.toLowerCase().includes(vise), `${e0.hash} → ${e1.hash}`);
      else R.info(e.nom, '« Aller à… » : URL', `liens profonds inactifs ici (${e0.hash || 'pas de fragment'})`);
    });

    // 13. Persistance après rechargement
    await bloc('persistance', async () => {
      await fermerMenu(page);
      await ouvrirMenu(page, e);
      const mr = await existeLigne(page, 'mouvementReduit');
      await reglerVitesse(page, FACTEURS.lente);
      const avant = (await lireReglages(page)).mouvementReduit;
      let bascule = null;
      if (mr && !avant) { if (!(await panneauVisible(page))) await ouvrirMenu(page, e); bascule = await basculer(page, e, 'mouvementReduit'); }
      const avantRecharge = (await lireReglages(page)).mouvementReduit;
      await page.reload();
      await page.waitForTimeout(800);
      await cadence(page);
      const rr = await lireReglages(page);
      T('persistance : réglages relus après rechargement', rr.vitesseAnimations === FACTEURS.lente && (!mr || rr.mouvementReduit === true), `vitesse des animations ${rr.vitesseAnimations}, moins d'animations ${rr.mouvementReduit} (avant la bascule ${avant}, basculé ${bascule}, avant rechargement ${avantRecharge})`);
      if (await ouvrirMenu(page, e)) {
        const l2 = ligne(page, 'vitesseAnimations').getByRole('slider');
        const aff = (await l2.count()) ? (await l2.getAttribute('aria-valuetext')).replace(/\s/g, ' ') : null; // l'affichage met une espace insécable avant %
        T('persistance : le menu montre 70 % pour la vitesse des animations', aff === '70 %', aff ?? 'contrôle introuvable');
        const d2 = await premier([ligne(page, 'defaut').getByRole('button', { name: NOMS.defaut }), pan(page).getByRole('button', { name: NOMS.defaut })]);
        if (d2) await cliquer(page, e, d2); // remise à zéro pour la suite
      }
    }, { menu: false });
  } finally {
    R.ok(e.nom, 'aucune erreur de page', !surv.erreurs.length, surv.erreurs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

/** localStorage.setItem lève : le menu marche encore, sans plantage. */
async function suiteStockage(e) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, lien, { init: [initStockageQuiLeve, FEU_FIGE] });
  await cadence(page);
  try {
    const leve = await page.evaluate(() => { try { localStorage.setItem('x', '1'); return false; } catch { return true; } });
    if (!(await rectDe(page, BOUTON))) { R.attente(e.nom, 'localStorage qui lève : bouton de réglages'); return; }
    if (await panneauVisible(page)) await fermerMenu(page);
    const o = await ouvrirMenu(page, e);
    let detail = `setItem lève : ${leve}`;
    if (o) {
      const sl = ligne(page, 'vitesseAnimations').getByRole('slider');
      if (await sl.count()) { await sl.focus(); await page.keyboard.press('End'); detail += `, vitesse des animations ${await sl.getAttribute('aria-valuetext')} en mémoire`; }
      if (!(await panneauVisible(page))) await ouvrirMenu(page, e);
      await basculer(page, e, 'son');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    R.ok(e.nom, 'localStorage.setItem qui lève : aucun plantage', o && !surv.erreurs.length, surv.erreurs.length ? surv.erreurs.slice(0, 2).join(' | ') : detail);
  } catch (x) {
    R.ajouter(e.nom, 'localStorage qui lève : exécution', 'KO', `plantage : ${String(x).split('\n')[0]}`);
  } finally {
    await ctx.close();
  }
}

// ---- Programme -------------------------------------------------------------------------------------
// (téléphone couché : debout, le carnet reste fermé et invite à tourner le téléphone)
const liste_ = ecrans(liste('only', 'iphone13-paysage,ordi-1440,tv-1080'));
const ecranVitesse = liste_.find((x) => !tactile(x));
for (const e of liste_) {
  console.log(`\n■ ${e.titre}`);
  try {
    await suiteMenu(e);
    if (e === ecranVitesse && !drapeau('sans-vitesse-stockee')) await vitesseStockee(e);
    await suiteStockage(e);
  } catch (x) {
    R.ajouter(e.nom, 'exécution', 'KO', `plantage : ${String(x).split('\n')[0]}`);
  }
}
const pl = planche(R.captures, join(out, 'planche-reglages.png'), { titre: `Réglages — ${cible.type} · ${new Date().toISOString().slice(0, 16)}`, colonnes: 3 });
if (forces.length) R.info(null, 'clics forcés (élément instable ou couvert 3 s)', forces.slice(0, 8).join(' · '));
R.ecrire({ planche: pl ? rel(pl) : null, zoomBornes: BORNES });
await browser.close();
await cible.close();
process.exit(R.code());
