// Dessins vivants (aquarelles « marionnettes », créatures, pages décorées) : src/components/Aquarelle.
// Le site construit (dist/site) ou la carte Carnet (--carnet), Chromium en WebGL logiciel (SwiftShader).
//
// Suites :
//   pages     TV 1920 × 1080 : chaque double page décorée (sommaire, frontispices des gâteaux et des
//             biscuits, fin), pendant la peinture puis peinte ; état des toiles (une par page, prête,
//             qui joue) ;
//   films     planches de films en temps réel (une image toutes les ~0,3 s) de scènes de marionnettes :
//             la scène est lancée (window.__gcDessins.scene), les images sont prises pendant qu'elle joue ;
//   creature  une créature arrive, se pose ; on la touche, elle s'envole (planche de la double page) ;
//   iphone    iPhone 13 couché (844 × 390, dpr 3, tactile) : les toiles jouent, le temps avance ;
//             une tape lance sa scène ; captures.
//   autonomie aucune entrée : scènes spontanées, horloge proportionnelle à la vitesse,
//             pause hors vue / onglet masqué, images fixes avec mouvement réduit.
// Sorties : verification/out/dessins (planches film-*.png, page-*.png, iphone-*.png, dessins.json).
//
//   node scripts/verify-dessins.mjs [--site dist/site | --carnet [--bundle dist/ds/components]]
//        [--url http://127.0.0.1:5173] [--suites pages,films,creature,iphone,autonomie] [--films cupcake-bougie,…] [--out verification/out/dessins]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, lireArgs, ecran, lancer, ouvrirCible, ouvrirPage as ouvrir, Rapport, rel, toucher, attendre, initReglages, ARGS_GPU } from './lib/verif.mjs';

const { opt, liste, drapeau } = lireArgs();
const suites = liste('suites', 'pages,films,creature,iphone,autonomie');
const out = resolve(ROOT, opt('out', 'verification/out/dessins'));
mkdirSync(out, { recursive: true });
const cible = await ouvrirCible(opt('url') ? { url: opt('url') } : drapeau('carnet') ? { bundle: opt('bundle') } : { site: opt('site', 'dist/site') });
const browser = await lancer({ args: ['--use-gl=angle', ...ARGS_GPU, '--ignore-gpu-blocklist', '--mute-audio'], media: false });
const rapport = new Rapport('dessins', { dir: out });
const resultats = {};

/** Ouvre le carnet sur une double page (lien profond) et attend le livre ouvert, posé. */
async function ouvrirPage(b, c, e, hash, options = {}) {
  const r = await ouvrir(b, c, e, hash, options);
  await r.page.waitForFunction(() => {
    const l = document.querySelector('.gc-livre');
    return l?.getAttribute('data-gc-etat') === 'ouvert' && !l.hasAttribute('data-gc-geste');
  }, null, { timeout: 90000, polling: 200 }).catch(() => r.surv.erreurs.push('livre jamais ouvert'));
  await attendre(600);
  return r;
}

/** L'état des toiles vivantes (window.__gcDessins). */
const etat = (page) => page.evaluate(() => window.__gcDessins?.etat() ?? []);

/** Attend que les toiles des pages visibles soient prêtes ; renvoie leur état. */
async function toilesPretes(page, n = 1, timeout = 20000) {
  await page.waitForFunction((k) => (window.__gcDessins?.etat() ?? []).filter((t) => t.pret).length >= k, n, { timeout, polling: 200 }).catch(() => {});
  return etat(page);
}

/** Attend que l'encre des pages visibles soit écrite (PageCuite : plus de data-gc-ecrit « a-ecrire »). */
const encreEcrite = (page, timeout = 25000) =>
  page.waitForFunction(() => !document.querySelector('.gc-livre__page--visible [data-gc-ecrit="a-ecrire"]'), null, { timeout, polling: 250 }).catch(() => {});

/** Rectangle à l'écran d'une aquarelle (son image fixe), élargi du débord de sa boîte (vivante.ts, DEBORD). */
const zoneAquarelle = (page, nom, bas = 0.1) => page.evaluate(([n, b]) => {
  const el = [...document.querySelectorAll(`.gc-livre__page--visible [data-gc-aquarelle="${n}"]`)][0];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = Math.max(0, r.left - 0.18 * r.width);
  const y = Math.max(0, r.top - 0.55 * r.height);
  return { x, y, width: Math.min(innerWidth - x, r.width * 1.36), height: Math.min(innerHeight - y, r.height * (1.55 + b)) };
}, [nom, bas]);

/** Le livre ouvert (les deux pages visibles) à l'écran. */
const zoneLivre = (page) => page.evaluate(() => {
  const ps = [...document.querySelectorAll('.gc-livre__page--visible')].map((e) => e.getBoundingClientRect());
  if (!ps.length) return null;
  const x0 = Math.max(0, Math.min(...ps.map((r) => r.left)));
  const y0 = Math.max(0, Math.min(...ps.map((r) => r.top)));
  const x1 = Math.min(innerWidth, Math.max(...ps.map((r) => r.right)));
  const y1 = Math.min(innerHeight, Math.max(...ps.map((r) => r.bottom)));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
});

/** Une bande d'images légendées (PIL) : [[fichier, légende]] → sortie. */
function bande(images, sortie, titre, { hauteur = 300, colonnes = 8 } = {}) {
  const py = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
a = json.loads(sys.argv[1])
H = a["hauteur"]
ims = []
for e in a["images"]:
    f, leg = e[0], e[1]
    im = Image.open(f).convert("RGB")
    if len(e) > 2 and e[2]:
        x0, y0, x1, y1 = e[2]
        im = im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))
    im = im.resize((max(1, round(im.width * H / im.height)), H))
    ims.append((im, leg))
col = min(a["colonnes"], len(ims))
lw = max(i.width for i, _ in ims)
rangs = (len(ims) + col - 1) // col
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
except Exception:
    font = ImageFont.load_default()
out = Image.new("RGB", (col * (lw + 8) + 8, 40 + rangs * (H + 30)), (250, 247, 240))
d = ImageDraw.Draw(out)
d.text((8, 10), a["titre"], fill=(40, 30, 20), font=font)
for k, (im, leg) in enumerate(ims):
    x = 8 + (k % col) * (lw + 8)
    y = 40 + (k // col) * (H + 30)
    out.paste(im, (x, y))
    d.text((x + 4, y + H + 6), leg, fill=(60, 50, 40), font=font)
out.save(a["sortie"])
`;
  const r = spawnSync('python3', ['-I', '-c', py, JSON.stringify({ images, sortie, titre, hauteur, colonnes })], { encoding: 'utf8' });
  if (r.status !== 0) console.warn(`bande : ${(r.stderr || '').trim().split('\n').pop()}`);
  return sortie;
}

/**
 * Un film : une image toutes les `pas` ms du temps des toiles, pendant `duree` ms. Le temps des toiles est
 * figé (window.__gcDessins.figer) puis avancé de `pas` entre deux images : chaque image est exactement à
 * son instant. (En rendu logiciel, le navigateur ne compose ici que 1 à 3 images par seconde en 1920 × 1080 :
 * des captures prises au vol ne seraient pas espacées de 0,3 s. Que les toiles jouent en temps réel est
 * vérifié à part : suite iphone, l'horloge avance.)
 */
async function film(page, clip, dossier, prefixe, { pas = 300, duree = 4000 } = {}) {
  mkdirSync(dossier, { recursive: true });
  await page.evaluate(() => window.__gcDessins?.figer(true));
  const images = [];
  for (let k = 0, t = 0; t <= duree; k++, t += pas) {
    await attendre(150); // la dernière image de la toile est présentée
    const f = join(dossier, `${prefixe}-${String(k).padStart(2, '0')}.png`);
    await page.screenshot({ path: f, clip, timeout: 60000 });
    images.push([f, `${(t / 1000).toFixed(1)} s`]);
    await page.evaluate((ms) => window.__gcDessins?.avancer(ms), pas);
  }
  await page.evaluate(() => window.__gcDessins?.figer(false));
  return images;
}

const TV = ecran('tv-1080');
const TMP = join(out, 'images');

// ---- pages décorées -------------------------------------------------------------------------------
if (suites.includes('pages')) {
  for (const spread of ['sommaire', 'gateaux', 'biscuits', 'fin']) {
    const { ctx, page, surv } = await ouvrirPage(browser, cible, TV, `#${spread}`);
    const e0 = await toilesPretes(page, 1);
    await attendre(1800);
    await page.screenshot({ path: join(out, `peinture-${spread}.png`) });
    await page.evaluate(() => window.__gcDessins?.finir());
    await encreEcrite(page);
    await attendre(2500);
    await page.screenshot({ path: join(out, `page-${spread}.png`) });
    const e1 = await etat(page);
    resultats[`page-${spread}`] = e1;
    const visibles = e1.filter((t) => t.pret);
    rapport.ajouter(null, `[pages] ${spread} : toiles prêtes`, visibles.length >= 1 ? 'OK' : 'KO',
      e1.map((t) => `${t.page} (${t.dessins.length} dessins, ${t.creatures.length} créatures, ${t.joue ? 'joue' : 'arrêtée'})`).join(' · ') || 'aucune');
    const nToiles = await page.evaluate(() => [...document.querySelectorAll('.gc-livre__page--visible')].map((p) => p.querySelectorAll('canvas.gc-aquarelles-toile').length));
    rapport.ajouter(null, `[pages] ${spread} : une toile au plus par page`, nToiles.every((n) => n <= 1) ? 'OK' : 'KO', `toiles par page visible : ${nToiles.join(', ')}`);
    void e0;
    if (spread === 'fin') {
      // contexte WebGL perdu (WEBGL_lose_context) : la toile s'en va, les images fixes reviennent
      await page.evaluate(() => {
        for (const cv of document.querySelectorAll('.gc-livre__page--visible canvas.gc-aquarelles-toile'))
          cv.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
      });
      await attendre(800);
      const apres = await page.evaluate(() => {
        const vis = [...document.querySelectorAll('.gc-livre__page--visible')];
        const toiles = vis.reduce((n, p) => n + p.querySelectorAll('canvas.gc-aquarelles-toile').length, 0);
        const imgs = vis.flatMap((p) => [...p.querySelectorAll('[data-gc-aquarelle] img')]);
        const visibles = imgs.filter((i) => getComputedStyle(i).visibility === 'visible' && i.complete).length;
        return { toiles, images: imgs.length, visibles };
      });
      await page.screenshot({ path: join(out, 'page-fin-contexte-perdu.png') });
      rapport.ajouter(null, '[pages] contexte WebGL perdu : images fixes', apres.toiles === 0 && apres.visibles === apres.images && apres.images > 0 ? 'OK' : 'KO',
        `toiles ${apres.toiles}, images fixes visibles ${apres.visibles}/${apres.images}`);
    }
    if (surv.erreurs.length) rapport.ajouter(null, `[pages] ${spread} : erreurs`, 'KO', surv.erreurs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

// ---- autonomie, vitesse, pauses, mouvement réduit ----------------------------------------------------
if (suites.includes('autonomie')) {
  const { ctx, page } = await ouvrirPage(browser, cible, TV, '#gateaux');
  await toilesPretes(page, 1);
  await page.evaluate(() => { window.__gcDessins?.finir(); window.__gcDessins?.figer(true); });
  const scenes = new Set();
  // Le moteur choisit et lance ses scènes : aucun appel à scene(), aucun pointeur ni toucher.
  for (let k = 0; k < 24; k++) {
    await page.evaluate(() => window.__gcDessins?.avancer(300));
    for (const t of await etat(page)) if (t.joue) for (const d of t.dessins) if (d.scene) scenes.add(`${d.nom}/${d.scene}`);
  }
  rapport.ajouter(null, '[autonomie] scènes lancées sans entrée', scenes.size ? 'OK' : 'KO', [...scenes].join(' · ') || 'aucune scène en 7,2 s après la peinture');
  await page.screenshot({ path: join(out, 'tv-autonome.png') });
  await page.evaluate(() => window.__gcDessins?.figer(false));

  // La vraie boucle doit s'arrêter quand la page perd sa classe de visibilité.
  const visibles = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('.gc-livre__page--visible')];
    ps.forEach((p) => { p.setAttribute('data-gc-test-visible', ''); p.classList.remove('gc-livre__page--visible'); });
    return ps.length;
  });
  await attendre(200);
  const pauseVue = await etat(page);
  await attendre(400);
  const apresVue = await etat(page);
  const pauses = pauseVue.filter((t) => t.pret);
  rapport.ajouter(null, '[autonomie] hors vue : horloge arrêtée', visibles > 0 && pauses.length > 0 && pauses.every((t) => !t.joue && apresVue.find((x) => x.page === t.page)?.horloge === t.horloge) ? 'OK' : 'KO', `${visibles} pages masquées ; ${pauses.map((t) => `${t.page} ${t.horloge} ms`).join(' · ')}`);
  await page.evaluate(() => document.querySelectorAll('[data-gc-test-visible]').forEach((p) => { p.classList.add('gc-livre__page--visible'); p.removeAttribute('data-gc-test-visible'); }));
  await attendre(200);

  // Visibilité de document simulée : vérifie le gestionnaire, sans dépendre du focus de Chromium headless.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pauseOnglet = await etat(page);
  await attendre(400);
  const apresOnglet = await etat(page);
  rapport.ajouter(null, '[autonomie] onglet masqué : horloge arrêtée', pauseOnglet.length > 0 && pauseOnglet.every((t) => !t.joue && apresOnglet.find((x) => x.page === t.page)?.horloge === t.horloge) ? 'OK' : 'KO', 'document.hidden simulé, événement visibilitychange');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction((avant) => (window.__gcDessins?.etat() ?? []).some((t) => t.joue && t.horloge > (avant.find((x) => x.page === t.page)?.horloge ?? Infinity)), apresOnglet, { timeout: 10000, polling: 100 }).catch(() => {});
  const reprise = await etat(page);
  rapport.ajouter(null, '[autonomie] retour visible : reprise', reprise.some((t) => t.joue && t.horloge > (apresOnglet.find((x) => x.page === t.page)?.horloge ?? Infinity)) ? 'OK' : 'KO', reprise.map((t) => `${t.page} : joue=${t.joue}, ${apresOnglet.find((x) => x.page === t.page)?.horloge} → ${t.horloge} ms`).join(' · '));
  resultats.autonomie = { scenes: [...scenes], reprise };
  await ctx.close();

  const avances = [];
  for (const vitesse of [0.5, 2]) {
    const { ctx: c, page: p } = await ouvrirPage(browser, cible, TV, '#gateaux', { init: [initReglages({ vitesseAnimations: vitesse })] });
    await toilesPretes(p, 1);
    await p.evaluate(() => window.__gcDessins?.figer(true));
    const a = await etat(p);
    await p.evaluate(() => window.__gcDessins?.avancer(1000));
    const b = await etat(p);
    const t = b.find((x) => x.pret && x.joue);
    const delta = t ? t.horloge - (a.find((x) => x.page === t.page)?.horloge ?? 0) : NaN;
    avances.push({ vitesse, delta });
    rapport.ajouter(null, `[autonomie] vitesse ${vitesse * 100} %`, Math.abs(delta - vitesse * 1000) <= 2 ? 'OK' : 'KO', `${delta} ms d'animation pour 1 000 ms demandées`);
    await c.close();
  }
  resultats.vitesse = avances;

  // Préférence système et réglage du carnet : aucun canvas animé, originales visibles dès l'ouverture.
  for (const [nom, options] of [
    ['système', { contexteExtra: { reducedMotion: 'reduce' } }],
    ['réglage', { init: [initReglages({ animations: 'reduites' })] }],
  ]) {
    const { ctx: c, page: p } = await ouvrirPage(browser, cible, TV, '#gateaux', options);
    const fixe = await p.evaluate(() => {
      const pages = [...document.querySelectorAll('.gc-livre__page--visible')];
      const images = pages.flatMap((p) => [...p.querySelectorAll('[data-gc-aquarelle] img')]);
      return {
        toiles: pages.reduce((n, p) => n + p.querySelectorAll('.gc-aquarelles-toile').length, 0),
        images: images.length,
        visibles: images.filter((i) => i.complete && i.naturalWidth > 0 && getComputedStyle(i).visibility === 'visible').length,
      };
    });
    rapport.ajouter(null, `[autonomie] mouvement réduit (${nom}) : dessins fixes`, fixe.toiles === 0 && fixe.images > 0 && fixe.visibles === fixe.images ? 'OK' : 'KO', fixe);
    await p.screenshot({ path: join(out, `tv-reduit-${nom === 'système' ? 'systeme' : 'reglage'}.png`) });
    await c.close();
  }
}

// ---- films de marionnettes ---------------------------------------------------------------------------
const FILMS = [
  ['gateaux', 'cupcake-bougie', 'allume', 0.5],
  ['gateaux', 'cupcake-bougie', 'bougies', 0.5],
  ['gateaux', 'tasse-coeur', 'bat', 0.1],
  ['biscuits', 'noix', 'domino', 0.1],
  ['biscuits', 'cupcake', 'rebond', 0.1],
  ['fin', 'theiere', 'bouillir', 0.1],
  ['fin', 'guirlande', 'fete', 0.5],
  ['fin', 'cupcake-bougie', 'souffle', 0.5],
  ['mathis', 'cookies', 'casse', 0.1],
];
if (suites.includes('films')) {
  const seuls = liste('films', ''); // --films cupcake-bougie,… : ces aquarelles seulement
  const parSpread = new Map();
  for (const f of FILMS) if (!seuls.length || seuls.includes(f[1])) parSpread.set(f[0], [...(parSpread.get(f[0]) ?? []), f]);
  for (const [spread, films] of parSpread) {
    const { ctx, page } = await ouvrirPage(browser, cible, TV, `#${spread}`);
    await toilesPretes(page, 1);
    await page.evaluate(() => window.__gcDessins?.finir());
    await attendre(2500);
    for (const [, nom, scene, bas] of films) {
      const clip = await zoneAquarelle(page, nom, bas);
      if (!clip) {
        rapport.ajouter(null, `[films] ${nom}`, 'KO', `aquarelle introuvable sur ${spread}`);
        continue;
      }
      await page.evaluate(([n, s]) => {
        window.__gcDessins?.figer(true);
        window.__gcDessins?.scene(n, s);
      }, [nom, scene]);
      const images = await film(page, clip, TMP, `${nom}-${scene}`, { pas: 300, duree: 4200 });
      const f = bande(images, join(out, `film-${nom}-${scene}.png`), `${nom} : scène « ${scene} » (une image toutes les 0,3 s du temps de l'animation)`, { hauteur: 220, colonnes: 8 });
      rapport.ajouter(null, `[films] ${nom} « ${scene} »`, 'INFO', rel(f));
      await attendre(800);
    }
    await ctx.close();
  }
}

// ---- une créature ------------------------------------------------------------------------------------
if (suites.includes('creature')) {
  const { ctx, page } = await ouvrirPage(browser, cible, TV, '#biscuits');
  await toilesPretes(page, 1);
  await page.evaluate(() => window.__gcDessins?.finir());
  // elle arrive quand la page a fini de se peindre (6,5 à 10 s), vole, se pose
  await page.waitForFunction(() => (window.__gcDessins?.etat() ?? []).some((t) => t.creatures.some((c) => c.etat === 'pose' || c.etat === 'marche')), null, { timeout: 40000, polling: 250 }).catch(() => {});
  const clip = await zoneLivre(page);
  const avant = await film(page, clip, TMP, 'creature-a', { pas: 400, duree: 2400 });
  // on la touche : elle s'envole
  const pos = await page.evaluate(() => {
    const t = (window.__gcDessins?.etat() ?? []).find((x) => x.creatures.some((c) => c.etat === 'pose' || c.etat === 'marche'));
    if (!t) return null;
    const c = t.creatures.find((x) => x.etat === 'pose' || x.etat === 'marche');
    const pages = [...document.querySelectorAll('.gc-livre__page--visible')].map((e) => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    const A = pages[0].width / pages[0].height;
    const droite = c.x > A;
    const r = droite ? pages[pages.length - 1] : pages[0];
    return { x: r.left + ((droite ? c.x / A - 1 : c.x / A)) * r.width, y: r.top + c.y * r.height, espece: c.espece, cx: c.x, cy: c.y };
  });
  let apres = [];
  if (pos) {
    await page.mouse.move(pos.x - 60, pos.y + 40);
    await page.mouse.move(pos.x, pos.y, { steps: 6 });
    await page.mouse.click(pos.x, pos.y);
    apres = await film(page, clip, TMP, 'creature-b', { pas: 400, duree: 4000 });
  }
  const e = await etat(page);
  resultats.creature = e.map((t) => t.creatures);
  // elle a bougé : envolée, ou posée ailleurs
  const apresC = e.flatMap((t) => t.creatures).filter((c) => c.espece === pos?.espece);
  const bouge = !!pos && apresC.some((c) => c.etat === 'vol' || Math.hypot(c.x - pos.cx, c.y - pos.cy) > 0.04);
  const f = bande([...avant, ...apres.map(([i, l, c]) => [i, `touchée +${l}`, c])], join(out, 'film-creature.png'),
    `Biscuits : ${pos?.espece ?? 'créature'} posée, puis touchée (elle s'envole)`, { hauteur: 260, colonnes: 4 });
  rapport.ajouter(null, '[creature] posée puis envolée', bouge ? 'OK' : 'KO', `${rel(f)} · touchée en ${pos ? `${pos.cx.toFixed(3)}, ${pos.cy.toFixed(3)}` : '—'} · après : ${JSON.stringify(apresC)}`);
  await ctx.close();
}

// ---- iPhone 13 couché --------------------------------------------------------------------------------
if (suites.includes('iphone')) {
  const IP = ecran('iphone13-paysage');
  const { ctx, page, surv } = await ouvrirPage(browser, cible, IP, '#gateaux');
  const e0 = await toilesPretes(page, 1);
  await attendre(1500);
  const h0 = (await etat(page)).map((t) => t.horloge);
  await attendre(2000);
  const e1 = await etat(page);
  // le temps des toiles avance (un pas de 100 ms au plus par image : en rendu logiciel, à dpr 3, le
  // navigateur ne compose ici que quelques images par seconde, le temps avance donc moins vite que l'horloge)
  const avance = e1.some((t, k) => t.joue && t.horloge > (h0[k] ?? 0) + 150);
  await page.screenshot({ path: join(out, 'iphone-peinture.png') });
  rapport.ajouter(null, '[iphone] les toiles jouent et le temps avance', avance ? 'OK' : 'KO',
    e1.map((t, k) => `${t.page} ${t.joue ? 'joue' : 'arrêtée'} ${h0[k]} → ${t.horloge} ms (en 2 s)`).join(' · ') || `aucune toile (${JSON.stringify(e0)})`);
  // Le cupcake vit sans suivre le doigt ; une tape reste un raccourci vers sa scène.
  await page.evaluate(() => window.__gcDessins?.finir());
  await attendre(1500);
  const r = await page.evaluate(() => {
    const el = document.querySelector('.gc-livre__page--visible [data-gc-aquarelle="cupcake-bougie"]');
    const b = el?.getBoundingClientRect();
    return b ? { x: b.left + b.width / 2, y: b.top + b.height * 0.55, w: b.width } : null;
  });
  if (r) {
    await page.screenshot({ path: join(out, 'iphone-autonome.png') });
    const tourne = await page.evaluate(() => document.querySelector('.gc-livre')?.getAttribute('data-gc-etat'));
    await attendre(600);
    await toucher(page, r.x, r.y);
    await attendre(500);
    const e2 = await etat(page);
    const scene = e2.flatMap((t) => t.dessins).find((d) => d.nom === 'cupcake-bougie')?.scene ?? null;
    await page.screenshot({ path: join(out, 'iphone-tape.png') });
    rapport.ajouter(null, '[iphone] une tape sur le cupcake lance sa scène', scene ? 'OK' : 'KO', `scène : ${scene} · livre ${tourne}`);
  } else rapport.ajouter(null, '[iphone] cupcake visible', 'KO', 'introuvable');
  if (surv.erreurs.length) rapport.ajouter(null, '[iphone] erreurs', 'KO', surv.erreurs.slice(0, 3).join(' | '));
  resultats.iphone = await etat(page);
  await ctx.close();
}

rmSync(TMP, { recursive: true, force: true });
writeFileSync(join(out, 'dessins.json'), JSON.stringify(resultats, null, 1));
await browser.close();
cible.close();
rapport.ecrire();
process.exit(rapport.code());
