// Soulever (CONTRACT § 12, § 12.3) : la photo collée qui s'envole et joue sa vidéo, le feuillet volant.
// Émulation Playwright (iPhone 13 debout, Pixel 7, TV 1080p par défaut), sur la carte Carnet autonome,
// le site construit, une URL, ou le banc factice.
//
// Photo [data-gc-objet="photo"] (page du lien --lien, défaut #julie) :
//   - toucher (téléphones) ou Entrée (TV) → [data-gc-soulever="ouvert"] ;
//   - play() appelé DANS le geste (window.__gcPlays, scripts/lib/verif.mjs : instrumenterGeste) ;
//   - lecture réelle si ce navigateur décode H.264 (sinon : INFO, à cocher sur un vrai iPhone ;
//     GC_CHROME=/chemin/chrome pour un navigateur qui le décode) ;
//   - l'objet soulevé tient dans la zone sûre ;
//   - un glisser horizontal pendant l'envol ne tourne pas la page ;
//   - Échap, toucher (clic sur la TV), Retour arrière et ↓ (TV) → « ferme », photo revenue à ±2 px ;
//   - fin de la vidéo → « ferme » (fin réelle si la vidéo se lit, sinon événement « ended » simulé).
// Feuillet [data-gc-objet="feuillet"] (page du lien --lien-feuillet, défaut #lisa) :
//   - toucher, glisser vers le haut, ↑ → « ouvert » ; → verso, ← recto (captures comparées) ;
//     toucher le feuillet soulevé le retourne ; ↓ et Échap → « ferme », coin revenu à ±2 px.
// Mouvement réduit (emulateMedia reducedMotion « reduce », puis réglage gc:reglages:v1.mouvementReduit) :
//   aucune transformation pendant l'ouverture (transform calculé constant, relevé à chaque image) ;
//   témoin : le même relevé voit bien l'envol normal.
// Tout ce qui manque encore (photo, calque, feuillet, vidéo) est noté ATTENTE (« non trouvé : à relancer
// après intégration ») au lieu de planter. Rapport <out>/soulever.json + .md, captures avant / pendant /
// ouvert / après, planche <out>/planche-soulever.png.
//
//   node scripts/verify-soulever.mjs [--site dist/site | --url harness/devices.html?b=… | --banc [--defaut x]]
//        [--bundle dist/ds-t/components] [--only iphone13-portrait,pixel7,tv-1080]
//        [--suites photo,feuillet,reduit] [--lien julie] [--lien-feuillet lisa] [--out verification/out/t/soulever]
import { resolve, join } from 'node:path';
import {
  ROOT, lireArgs, ecrans, tactile, lancer, ouvrirCible, ouvrirPage, Rapport, rectDe, existe, zoneSure, dansZone,
  ecartRect, codecH264, plays, nbPlays, nbGestes, gestes, etatLivre, attendreAttr, stabiliser, capture, toucher,
  glisserSur, taper, demarrerEchantillons, arreterEchantillons, initReglages, pixelsDifferents, planche, calme, medias, rel,
} from './lib/verif.mjs';

const { opt, drapeau, liste } = lireArgs();
const out = resolve(ROOT, opt('out', 'verification/out/t/soulever'));
const lienPhoto = opt('lien', 'julie');
const lienFeuillet = opt('lien-feuillet', 'lisa');
const suites = liste('suites', 'photo,feuillet,reduit');
const SEL = {
  calque: '[data-gc-soulever]',
  photo: '.gc-livre__page--visible [data-gc-objet="photo"], [data-gc-objet="photo"]',
  feuillet: '.gc-livre__page--visible [data-gc-objet="feuillet"], [data-gc-objet="feuillet"]',
  video: '[data-gc-video]',
};
const RECHERCHE = '[data-gc-soulever], [data-gc-soulever] *, [data-gc-objet], [data-gc-objet] *';

if (drapeau('banc')) medias();
const cible = await ouvrirCible({ site: opt('site'), url: opt('url'), banc: drapeau('banc'), defaut: opt('defaut'), bundle: opt('bundle') });
const R = new Rapport('soulever', { dir: out, meta: { cible: cible.type, depart: cible.depart, lienPhoto, lienFeuillet } });
const browser = await lancer();
const insetsDe = (e) => (cible.type === 'site' || cible.type === 'url' ? null : e.insets);
console.log(`■ Soulever — ${cible.type} : ${cible.depart}`);

// ---- Outils --------------------------------------------------------------------------------------
const etatCalque = (page) => page.evaluate((s) => document.querySelector(s)?.getAttribute('data-gc-soulever') ?? null, SEL.calque);
const ouvert = (page, ms = 6000) => attendreAttr(page, SEL.calque, 'data-gc-soulever', 'ouvert', ms);
const ferme = (page, ms = 6000) => attendreAttr(page, SEL.calque, 'data-gc-soulever', 'ferme', ms);

/**
 * L'objet soulevé : la carte active [data-gc-actif] du calque ouvert (lot S, et le banc), sinon le plus
 * grand élément visible (opacité > 0,05), hors aria-hidden (ombre, traits) et hors voile plein écran.
 */
const rectSouleve = (page) => page.evaluate(() => {
  const c = document.querySelector('[data-gc-soulever="ouvert"]');
  if (!c) return null;
  const A = innerWidth * innerHeight;
  const vu = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width >= 20 && r.height >= 20 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !el.closest('[aria-hidden="true"]') && r.width * r.height < 0.95 * A;
  };
  const actifs = [...c.querySelectorAll('[data-gc-actif]')].filter(vu);
  const cands = actifs.length ? actifs : [...c.querySelectorAll('*')].filter(vu);
  let best = null;
  for (const el of cands) {
    const r = el.getBoundingClientRect();
    const a = r.width * r.height;
    if (!best || a > best.a) best = { a, x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, el: `${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ')[0]}` };
  }
  return best;
});

/**
 * Fin de l'envol : data-gc-phase (lot S, banc : envol → ouvert) quitte « envol », puis 3 images ; sans
 * phase, l'objet soulevé ne bouge plus pendant 6 images.
 */
const finEnvol = (page) => page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now();
  let prec = '';
  let n = 0;
  const phase = () => document.querySelector('[data-gc-soulever][data-gc-phase]')?.getAttribute('data-gc-phase') ?? null;
  const lire = () => {
    const c = document.querySelector('[data-gc-soulever="ouvert"]');
    if (!c) return 'ferme';
    return [...c.querySelectorAll('*')].slice(0, 60).map((el) => { const r = el.getBoundingClientRect(); return `${r.left | 0},${r.top | 0},${r.width | 0}`; }).join(';');
  };
  const tick = () => {
    if (performance.now() - t0 > 8000) return resolve();
    const ph = phase();
    if (ph != null) {
      n = ph === 'envol' ? 0 : n + 1;
      if (n >= 3) return resolve();
    } else {
      const v = lire();
      n = v === prec ? n + 1 : 0;
      prec = v;
      if (n >= 6) return resolve();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));

async function declencher(page, e, rect, mode) {
  if (mode === 'entree') return page.keyboard.press('Enter');
  if (mode === 'haut') return page.keyboard.press('ArrowUp');
  if (mode === 'glisser-haut') return glisserSur(page, e, [rect.cx, rect.cy], [rect.cx, Math.max(4, rect.cy - Math.max(120, rect.h * 1.5))], { ms: 300, n: 10 });
  if (mode === 'toucher') return toucher(page, rect.cx, rect.cy);
  return page.mouse.click(rect.cx, rect.cy);
}
const LIBELLE = { entree: 'Entrée', toucher: 'toucher', clic: 'clic', haut: '↑', 'glisser-haut': 'glisser vers le haut' };

/** Ferme puis vérifie le retour de l'objet `sel` à son rect d'avant (±2 px). */
async function verifierRetour(page, e, sel, avant, comment, fermer) {
  await fermer();
  const f = await ferme(page);
  R.ok(e.nom, `${comment} → data-gc-soulever="ferme"`, f, f ? '' : `état : ${await etatCalque(page)}`);
  await stabiliser(page, sel, { images: 8 });
  const apres = await rectDe(page, sel);
  const ec = ecartRect(avant, apres);
  R.ok(e.nom, `${comment} : objet revenu à son rect ±2 px`, ec <= 2, Number.isFinite(ec) ? `écart ${ec.toFixed(1)} px` : 'objet introuvable après le retour');
  return f;
}

/** Capture d'une zone, répétée jusqu'à deux images identiques (fin d'animation). */
async function captureStable(page, clip, ms = 5000) {
  const t0 = Date.now();
  let prec = await page.screenshot({ clip, timeout: 60000 });
  while (Date.now() - t0 < ms) {
    await page.waitForTimeout(250);
    const b = await page.screenshot({ clip, timeout: 60000 });
    if (pixelsDifferents(prec, b) < 0.002) return b;
    prec = b;
  }
  return prec;
}

const clipDe = (r, vp) => {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  return { x, y, width: Math.max(1, Math.min(vp.width - x, Math.ceil(r.w))), height: Math.max(1, Math.min(vp.height - y, Math.ceil(r.h))) };
};

// ---- Photo -----------------------------------------------------------------------------------------
async function suitePhoto(e) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, lienPhoto);
  try {
    const avant = await rectDe(page, SEL.photo);
    if (!avant || !avant.visible) {
      R.attente(e.nom, `photo posée [data-gc-objet="photo"] sur #${lienPhoto}`);
      if (!(await existe(page, SEL.calque))) R.attente(e.nom, 'calque [data-gc-soulever]');
      return;
    }
    if (!(await existe(page, SEL.calque))) { R.attente(e.nom, 'calque [data-gc-soulever]'); return; }
    const codec = await codecH264(page);
    const mode = tactile(e) ? 'toucher' : 'entree';
    R.capturer(await capture(page, `${e.nom}-photo-avant`, out), `${e.titre} — photo posée (avant)`);

    // 1. Envol
    const n0 = await nbPlays(page);
    await declencher(page, e, avant, mode);
    R.capturer(await capture(page, `${e.nom}-photo-pendant`, out), `${e.titre} — envol (${LIBELLE[mode]})`);
    const o = await ouvert(page);
    R.ok(e.nom, `${LIBELLE[mode]} sur la photo → data-gc-soulever="ouvert"`, o, o ? '' : `état : ${await etatCalque(page)}`);
    if (!o) return;
    const p = (await plays(page)).slice(n0);
    const decrire = (x) => `${x.dansGeste ? 'dans' : 'HORS'} le geste (${x.geste ?? 'aucun'}${x.touche ? ` ${x.touche}` : ''}) · ${x.video ? '[data-gc-video]' : 'autre média'} · ${x.src || 'sans src'} · ${x.muted ? 'muet' : 'son'} · ${x.resultat}`;
    if (!p.length) R.ajouter(e.nom, 'play() appelé dans le geste', 'KO', 'aucun appel à play()');
    else R.ok(e.nom, 'play() appelé dans le geste', p[0].dansGeste, p.map(decrire).join(' ; '));

    // 2. Lecture réelle
    const v = await page.evaluate((s) => { const x = document.querySelector(s); return x ? { src: x.currentSrc || x.src || '', paused: x.paused } : null; }, SEL.video);
    if (!v) R.attente(e.nom, 'vidéo unique [data-gc-video]');
    else if (/\.(mp4|m4v)(\?|#|$)/i.test(v.src) && !codec.decodable) {
      R.info(e.nom, 'lecture réelle de la vidéo', `H.264 non décodable dans ce Chromium (canPlayType avc1 = "") : non vérifiable ici — à cocher sur un vrai iPhone, ou GC_CHROME=<Chrome>`);
    } else {
      const lit = await page.waitForFunction((s) => { const x = document.querySelector(s); return !!x && !x.paused && x.currentTime > 0.2; }, SEL.video, { timeout: 8000 }).then(() => true, () => false);
      R.ok(e.nom, 'lecture réelle de la vidéo (currentTime avance)', lit, `${v.src.split('/').pop()}${codec.decodable ? '' : ' (pas de H.264 ici)'}`);
    }

    // 3. Zone sûre
    await finEnvol(page);
    const rs = await rectSouleve(page);
    const z = await zoneSure(page, insetsDe(e));
    R.ok(e.nom, 'objet soulevé dans la zone sûre', dansZone(rs, z), rs ? `${rs.el} ${Math.round(rs.x)},${Math.round(rs.y)} ${Math.round(rs.w)}×${Math.round(rs.h)} · zone ${z.x},${z.y} → ${z.r},${z.b}` : 'objet soulevé introuvable');
    R.capturer(await capture(page, `${e.nom}-photo-ouvert`, out), `${e.titre} — photo soulevée`);

    const reouvrir = async () => {
      if ((await etatCalque(page)) !== 'ouvert') {
        await ferme(page, 3000);
        await stabiliser(page, SEL.photo, { images: 6 });
        const r = await rectDe(page, SEL.photo);
        if (r) await declencher(page, e, r, mode);
      }
      const ok = await ouvert(page);
      if (ok) await finEnvol(page);
      return ok;
    };

    // 4. Glisser horizontal pendant l'envol : la page ne tourne pas. (L'objet doit être encore soulevé
    //    au moment du glisser : une vidéo finie l'aurait reposé, et le glisser tournerait alors la page.)
    if (await reouvrir()) {
      const { width: W, height: H } = page.viewportSize();
      const g0 = await nbGestes(page);
      const e0 = await etatLivre(page);
      await glisserSur(page, e, [W * 0.88, H * 0.5], [W * 0.12, H * 0.5], { ms: 350, n: 14 });
      const pendant = (await gestes(page, g0)).length;
      await page.waitForTimeout(1200);
      const e1 = await etatLivre(page);
      const tours = (await gestes(page, g0)).filter((x) => x.phase === 'debut' && ['page', 'glisse', 'fondu', 'couverture'].includes(x.type));
      R.ok(e.nom, "glisser horizontal pendant l'envol : la page ne tourne pas", e1.double === e0.double && e1.cote === e0.cote && !tours.length,
        `double ${e0.double} → ${e1.double}, côté ${e0.cote} → ${e1.cote}${tours.length ? `, gestes ${tours.map((x) => x.type).join(', ')}${pendant ? ' (dès le glisser)' : ''}` : ''} · objet ${e1.soulever === 'ouvert' ? 'toujours soulevé' : 'reposé par le glisser'}`);
      await calme(page, { calme: 300, debutMax: 200 });
    }

    // 5. Échap
    if (await reouvrir()) {
      await verifierRetour(page, e, SEL.photo, avant, 'Échap', () => page.keyboard.press('Escape'));
      R.capturer(await capture(page, `${e.nom}-photo-apres`, out), `${e.titre} — photo reposée (après)`);
      if (mode === 'entree') {
        const f = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.getAttribute('data-gc-objet') ? `[data-gc-objet=${a.getAttribute('data-gc-objet')}]` : ''}${a.getAttribute('aria-label') ? ` « ${a.getAttribute('aria-label')} »` : ''}` : 'aucun'; });
        R.info(e.nom, 'focus après le retour (clavier)', f);
      }
    } else R.ajouter(e.nom, 'rouvrir la photo (Échap)', 'KO', 'ne se rouvre pas');

    // 6. Toucher (clic sur la TV) l'objet soulevé
    if (await reouvrir()) {
      const r = await rectSouleve(page);
      await verifierRetour(page, e, SEL.photo, avant, tactile(e) ? 'toucher la photo soulevée' : 'clic sur la photo soulevée', () => taper(page, e, r.cx, r.cy));
    }

    // 7. Retour arrière et ↓ (clavier, TV)
    if (!tactile(e)) {
      for (const [touche, nom] of [['Backspace', 'Retour arrière'], ['ArrowDown', '↓']]) {
        if (await reouvrir()) await verifierRetour(page, e, SEL.photo, avant, nom, () => page.keyboard.press(touche));
      }
    }

    // 8. Fin de la vidéo
    if (await reouvrir()) {
      const lisible = v && !(/\.(mp4|m4v)(\?|#|$)/i.test(v.src) && !codec.decodable);
      const reelle = lisible && await page.evaluate(async (s) => {
        const x = document.querySelector(s);
        if (!x || !Number.isFinite(x.duration) || x.duration <= 0) return false;
        x.currentTime = Math.max(0, x.duration - 0.3);
        if (x.paused) await x.play().catch(() => {});
        return true;
      }, SEL.video);
      if (!reelle) await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new Event('ended')), SEL.video);
      await verifierRetour(page, e, SEL.photo, avant, `fin de la vidéo (${reelle ? 'réelle' : 'événement « ended » simulé'})`, async () => {});
    }
  } finally {
    R.ok(e.nom, 'photo : aucune erreur de page', !surv.erreurs.length, surv.erreurs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

// ---- Feuillet --------------------------------------------------------------------------------------
async function suiteFeuillet(e) {
  const { ctx, page, surv } = await ouvrirPage(browser, cible, e, lienFeuillet);
  try {
    let avant = await rectDe(page, SEL.feuillet);
    if (!avant?.visible && (await etatLivre(page)).cadrage === 'page') { // coin sur la page droite : → ou glisser du doigt
      await page.keyboard.press('ArrowRight');
      await calme(page);
      await stabiliser(page, SEL.feuillet, { images: 8 });
      avant = await rectDe(page, SEL.feuillet);
      if (!avant?.visible && tactile(e)) {
        const { width: W, height: H } = page.viewportSize();
        await glisserSur(page, e, [W * 0.8, H * 0.5], [W * 0.3, H * 0.5], { ms: 400 });
        await calme(page);
        await stabiliser(page, SEL.feuillet, { images: 8 });
        avant = await rectDe(page, SEL.feuillet);
      }
    }
    if (!avant || !avant.visible) { R.attente(e.nom, `coin du feuillet [data-gc-objet="feuillet"] sur #${lienFeuillet}`); return; }
    if (!(await existe(page, SEL.calque))) { R.attente(e.nom, 'calque [data-gc-soulever]'); return; }
    R.capturer(await capture(page, `${e.nom}-feuillet-avant`, out), `${e.titre} — coin du feuillet (avant)`);
    const vp = page.viewportSize();
    const n0 = await nbPlays(page);
    const essai = async (mode) => {
      const r = await rectDe(page, SEL.feuillet);
      await declencher(page, e, r, mode);
      const o = await ouvert(page);
      R.ok(e.nom, `feuillet : ${LIBELLE[mode]} → data-gc-soulever="ouvert"`, o, o ? '' : `état : ${await etatCalque(page)}`);
      if (o) await finEnvol(page);
      return o;
    };
    // 1. Toucher (clic) puis Échap
    if (await essai(tactile(e) ? 'toucher' : 'clic')) {
      R.capturer(await capture(page, `${e.nom}-feuillet-ouvert`, out), `${e.titre} — feuillet soulevé`);
      const rs = await rectSouleve(page);
      const z = await zoneSure(page, insetsDe(e));
      R.ok(e.nom, 'feuillet soulevé dans la zone sûre', dansZone(rs, z), rs ? `${Math.round(rs.w)}×${Math.round(rs.h)} à ${Math.round(rs.x)},${Math.round(rs.y)}` : 'introuvable');
      await verifierRetour(page, e, SEL.feuillet, avant, 'feuillet : Échap', () => page.keyboard.press('Escape'));
    }
    // 2. Glisser vers le haut puis ↓
    if (await essai('glisser-haut')) await verifierRetour(page, e, SEL.feuillet, avant, 'feuillet : ↓', () => page.keyboard.press('ArrowDown'));
    // 3. ↑ au clavier, recto → verso → recto, toucher le retourne, ↓
    if (await essai('haut')) {
      const rs = await rectSouleve(page);
      const clip = clipDe(rs, vp);
      const recto = await captureStable(page, clip);
      await page.keyboard.press('ArrowRight');
      const verso = await captureStable(page, clip);
      const dV = pixelsDifferents(recto, verso);
      R.ok(e.nom, 'feuillet : → montre le verso', dV > 0.03, `${(dV * 100).toFixed(1)} % de pixels changés`);
      R.capturer(await capture(page, `${e.nom}-feuillet-verso`, out), `${e.titre} — feuillet, verso`);
      await page.keyboard.press('ArrowLeft');
      const recto2 = await captureStable(page, clip);
      const dR = pixelsDifferents(recto, recto2);
      R.ok(e.nom, 'feuillet : ← revient au recto', dR < 0.02 && pixelsDifferents(verso, recto2) > 0.03, `écart au recto ${(dR * 100).toFixed(1)} %`);
      await taper(page, e, rs.cx, rs.cy);
      const tape = await captureStable(page, clip);
      const encore = (await etatCalque(page)) === 'ouvert';
      R.ok(e.nom, 'feuillet : toucher le feuillet soulevé le retourne', encore && pixelsDifferents(recto2, tape) > 0.03, encore ? `${(pixelsDifferents(recto2, tape) * 100).toFixed(1)} % changés` : 'le toucher a reposé le feuillet');
      if (encore) await verifierRetour(page, e, SEL.feuillet, avant, 'feuillet : ↓ (après retournement)', () => page.keyboard.press('ArrowDown'));
    }
    const p = (await plays(page)).slice(n0);
    R.ok(e.nom, 'feuillet : aucune vidéo lancée', !p.length, p.length ? `${p.length} play()` : '');
  } finally {
    R.ok(e.nom, 'feuillet : aucune erreur de page', !surv.erreurs.length, surv.erreurs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

// ---- Mouvement réduit ----------------------------------------------------------------------------
async function suiteReduite(e, temoin) {
  const variantes = [
    ...(temoin ? [{ nom: 'témoin, mouvement normal', temoin: true }] : []),
    { nom: 'système : prefers-reduced-motion', contexteExtra: { reducedMotion: 'reduce' } },
    { nom: 'réglage : gc:reglages:v1.mouvementReduit', init: [initReglages({ mouvementReduit: true })] },
  ];
  for (const va of variantes) {
    const { ctx, page, surv } = await ouvrirPage(browser, cible, e, lienPhoto, { contexteExtra: va.contexteExtra ?? {}, init: va.init ?? [] });
    try {
      const r = await rectDe(page, SEL.photo);
      if (!r || !r.visible || !(await existe(page, SEL.calque))) { R.attente(e.nom, `mouvement réduit (${va.nom}) : photo et calque`); continue; }
      await demarrerEchantillons(page, RECHERCHE);
      await declencher(page, e, r, tactile(e) ? 'toucher' : 'entree');
      const o = await ouvert(page);
      await page.waitForTimeout(1200);
      const ech = await arreterEchantillons(page);
      const det = `${ech.images} images, ${ech.elements} éléments ; transformés : ${ech.transformes.map((t) => `${t.id} (${t.transforms} valeurs)`).slice(0, 4).join(', ') || 'aucun'}${ech.sauts.length ? ` ; petits éléments posés une fois (non comptés) : ${ech.sauts.map((t) => t.id).slice(0, 3).join(', ')}` : ''} ; en fondu : ${ech.fondus}`;
      if (va.temoin) R.info(e.nom, `témoin : l'envol normal est vu comme une transformation (${ech.transformes.length ? 'oui' : 'NON'})`, det);
      else R.ok(e.nom, `mouvement réduit (${va.nom}) : aucune transformation pendant l'ouverture`, o && ech.transformes.length === 0, o ? det : 'ne s\'ouvre pas');
      if (!va.temoin && o) R.capturer(await capture(page, `${e.nom}-reduit-${va.contexteExtra ? 'systeme' : 'reglage'}`, out), `${e.titre} — ouverture, moins d'animations (${va.contexteExtra ? 'système' : 'réglage'})`);
    } finally {
      if (surv.erreurs.length) R.ajouter(e.nom, `mouvement réduit (${va.nom}) : erreurs de page`, 'KO', surv.erreurs.slice(0, 3).join(' | '));
      await ctx.close();
    }
  }
}

// ---- Programme -------------------------------------------------------------------------------------
const liste_ = ecrans(liste('only', 'iphone13-portrait,pixel7,tv-1080'));
let premier = true;
for (const e of liste_) {
  console.log(`\n■ ${e.titre}`);
  try {
    if (suites.includes('photo')) await suitePhoto(e);
    if (suites.includes('feuillet')) await suiteFeuillet(e);
    if (suites.includes('reduit')) await suiteReduite(e, premier);
  } catch (x) {
    R.ajouter(e.nom, 'exécution', 'KO', `plantage : ${String(x).split('\n')[0]}`);
  }
  premier = false;
}
const pl = planche(R.captures, join(out, 'planche-soulever.png'), { titre: `Soulever — ${cible.type} · ${new Date().toISOString().slice(0, 16)}` });
R.ecrire({ planche: pl ? rel(pl) : null });
await browser.close();
await cible.close();
process.exit(R.code());
