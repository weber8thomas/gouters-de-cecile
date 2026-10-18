// Sons du livre (plan v4, lot S, CONTRACT § 13.3) : moteur Web Audio, banque cuite, licences.
// Un espion (addInitScript) enveloppe AudioContext : création (état, userActivation), resume() (dans un
// geste ?), decodeAudioData, et chaque start() d'AudioBufferSourceNode (fichier joué, débit, gain du
// nœud de gain branché derrière). Le fichier joué est retrouvé par le chemin fetch → arrayBuffer →
// decodeAudioData → AudioBuffer.
//
// Suites :
//   banc      jouerSon() appelé directement (page de test construite ici, esbuild : src/lib/son.ts) :
//             suspendu / aucun contexte avant le premier geste, actif après (resume dans le geste) ;
//             geste vif → débit plus élevé qu'un geste lent (bornes 0,9 + 0,25 v, ± 3 %) ; variantes
//             jamais deux fois de suite ; gain = volume des bruitages × (0,35 + 0,65 v) × gain × mixage ; × 0,3 pendant
//             une vidéo ; sons coupés → rien ; un 404 est sans effet (pas d'erreur, un seul essai) ;
//   iphone    iPhone 13 émulé, réglages par défaut (sons actifs, téléphone compris) : rien avant le premier
//             toucher, puis la banque se charge et les sons jouent ; « Sons du livre » coupés → rien ;
//             « muet » → rien, gain maître à 0 ;
//   soulever  carte Soulever (bundle) : photo-lever à l'envol, photo-poser à l'atterrissage, feuillet
//             soulevé, retourné, reposé ;
//   livre     carnet (harness/devices.html) : glisser lent / vif → débit des sons « page » (lot A ;
//             ATTENTE tant que le livre ne les joue pas). Pas dans la liste par défaut : test complet du
//             lead, après intégration (--suites livre) ;
//   ambiance  le feu et la cuisine (src/lib/ambiance.ts, branchée comme dans le SoulevementProvider) :
//             rien avant le premier geste, fondu d'entrée de 3 s après ; sourdine × 0,15 pendant une
//             vidéo ; volume ; « muet » : gain maître à 0, le feu continue en silence ; un bruit de cuisine
//             prévu dans 5 à 15 s, au gain de la banque × 2, un peu à gauche ou à droite, jamais le même
//             deux fois de suite (40 tirages), chacun un peu au-dessus du feu sans passer devant (sonie,
//             0 à + 8 dB) ; pause quand
//             l'onglet est caché ; coupée par le réglage ; la lumière du feu reçoit ses crépitements
//             (window.__gcFeuSync, « gc-feu-sync ») ; iPhone (réglage par défaut) : jouée après le premier
//             toucher ; coupée par le réglage : rien ;
//   licences  chaque MP3 de la banque : source CC0 ou domaine public vérifiée (Freesound, OpenGameArt,
//             Wikimedia Commons ; ou « synthese »), sha256, ≤ 30 Ko (sons du livre) ou ≈ 96 kb/s
//             (ambiance), et chaque son de banque.json a ses fichiers.
// Rapport : verification/out/v4-s/sons/sons.json + .md.
//
//   node scripts/verify-sons.mjs [--suites licences,banc,ambiance,iphone,soulever,livre] [--bundle dist/ds-v4s/components]
//        [--out verification/out/v4-s/sons]
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { generate } from './gen-entry.mjs';
import {
  ROOT, lireArgs, ecran, lancer, serve, Rapport, rel, bundleParDefaut, glisserSouris, toucher, initReglages, attendre,
} from './lib/verif.mjs';

const { opt, liste } = lireArgs();
const out = resolve(ROOT, opt('out', 'verification/out/v4-s/sons'));
const suites = liste('suites', 'licences,banc,ambiance,iphone,soulever');
const bundle = opt('bundle', bundleParDefaut());
const BAKED = join(ROOT, 'design-system/baked/sons');
const LICENCES = join(ROOT, 'design-system/sources/sons/licences.json');
const banque = JSON.parse(readFileSync(join(BAKED, 'banque.json'), 'utf8'));
const TOTAL = Object.values(banque.sons).flat().length;
const R = new Rapport('sons', { dir: out, meta: { bundle, total: TOTAL } });
mkdirSync(out, { recursive: true });
console.log(`■ Sons du livre — ${TOTAL} fichiers`);

// ---- Espion ------------------------------------------------------------------------------------------
function ESPION() {
  if (window.__gcSonsEspion) return;
  const E = (window.__gcSonsEspion = { contextes: [], resumes: [], starts: [], fetchs: [], decodes: 0 });
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const nomDe = new WeakMap();
  const court = (u) => String(u).split('?')[0].split('/').pop();
  const f0 = window.fetch;
  window.fetch = function fetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    const p = f0.call(this, input, init);
    if (!/\.mp3(\?|#|$)/i.test(url)) return p;
    E.fetchs.push({ f: court(url), t: performance.now() });
    return p.then((r) => {
      const ab0 = r.arrayBuffer.bind(r);
      r.arrayBuffer = () => ab0().then((ab) => { nomDe.set(ab, court(url)); return ab; });
      return r;
    });
  };
  class Espion extends AC {
    constructor(...a) {
      super(...a);
      const rec = { t: performance.now(), activation: navigator.userActivation ? navigator.userActivation.isActive : null, etats: [this.state], options: a[0] || null };
      E.contextes.push(rec);
      this.addEventListener('statechange', () => rec.etats.push(this.state));
    }
  }
  window.AudioContext = Espion;
  if (window.webkitAudioContext) window.webkitAudioContext = Espion;
  const r0 = AC.prototype.resume;
  AC.prototype.resume = function resume(...a) {
    E.resumes.push({ t: performance.now(), activation: navigator.userActivation ? navigator.userActivation.isActive : null, etat: this.state });
    return r0.apply(this, a);
  };
  const d0 = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function decodeAudioData(ab, ok, ko) {
    const nom = nomDe.get(ab);
    const marquer = (b) => { if (b && nom) nomDe.set(b, nom); if (b) E.decodes++; return b; };
    const p = d0.call(this, ab, ok ? (b) => ok(marquer(b)) : undefined, ko);
    return p && p.then ? p.then((b) => { if (!ok) marquer(b); return b; }) : p;
  };
  const c0 = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function connect(dest, ...a) {
    if (this instanceof AudioBufferSourceNode) this.__gcGain = dest instanceof GainNode ? dest : null;
    return c0.call(this, dest, ...a);
  };
  const s0 = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function start(...a) {
    const b = this.buffer;
    E.starts.push({
      t: performance.now(), f: b ? nomDe.get(b) || null : null, duree: b ? b.duration : 0, debit: this.playbackRate.value,
      gain: this.__gcGain ? this.__gcGain.gain.value : null, etat: this.context.state, activation: navigator.userActivation ? navigator.userActivation.isActive : null,
    });
    return s0.apply(this, a);
  };
}
const espion = (page) => page.evaluate(() => window.__gcSonsEspion);
/** Sons joués (hors tampon muet du déverrouillage) depuis l'indice n. */
const joues = async (page, n = 0) => ((await espion(page))?.starts ?? []).slice(n).filter((s) => s.duree > 0.01);
const nbStarts = async (page) => ((await espion(page))?.starts ?? []).length;
const attendreDecodes = (page, n = TOTAL, timeout = 20000) => page.waitForFunction((n) => (window.__gcSonsEspion?.decodes ?? 0) >= n, n, { timeout }).then(() => true, () => false);
const attendreSon = (page, re, n0, timeout = 6000) => page.waitForFunction(([src, n0]) => (window.__gcSonsEspion?.starts ?? []).slice(n0).some((s) => s.duree > 0.01 && new RegExp(src).test(s.f || '')), [re.source, n0], { timeout }).then(() => true, () => false);

// ---- Page de test (jouerSon direct) ------------------------------------------------------------------
const BANC_DIR = join(ROOT, 'verification/out/v4-s/banc');
async function construireBanc() {
  mkdirSync(BANC_DIR, { recursive: true });
  const gen = join(BANC_DIR, 'gen');
  generate({ outDir: gen, components: [], artboards: [], target: 'harness' });
  await build({
    stdin: {
      contents: `import { jouerSon, etatSons, marquerVideo, sonsLivreEffectif } from './src/lib/son';
import { brancherAmbiance, etatAmbiance, jouerCuisine, ambianceEffective, GAIN_CUISINE, CUISINE_MIN_S, CUISINE_MAX_S } from './src/lib/ambiance';
import { setReglages, getReglages } from './src/lib/reglages';
// Comme le SoulevementProvider (useAmbiance) : l'ambiance est branchée dès le chargement.
brancherAmbiance();
window.__banc = { jouer: jouerSon, etat: etatSons, video: marquerVideo, reglages: setReglages, lire: getReglages,
  effectif: () => sonsLivreEffectif(getReglages()), ambiance: etatAmbiance, cuisine: jouerCuisine,
  ambianceEffective: () => ambianceEffective(getReglages()), gainCuisine: GAIN_CUISINE, cuisineBornes: [CUISINE_MIN_S, CUISINE_MAX_S], pret: true };`,
      resolveDir: ROOT, loader: 'ts', sourcefile: 'banc-sons.ts',
    },
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: join(BANC_DIR, 'banc-sons.js'),
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
    plugins: [{ name: 'gen', setup(b) { b.onResolve({ filter: /generated\/(components|assets)\.gen$/ }, (a) => ({ path: join(gen, `${a.path.split('/').pop()}.ts`) })); } }],
  });
  writeFileSync(join(BANC_DIR, 'index.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Banc des sons</title><link rel="icon" href="data:,">
<style>html,body{margin:0;height:100%;background:#4a2e1f}#geste{position:absolute;left:40%;top:40%;width:20%;height:20%;background:#e8d8b8;border:0}</style>
</head><body><button id="geste" type="button">geste</button><script src="banc-sons.js"></script></body></html>\n`);
}

// ---- Suites --------------------------------------------------------------------------------------------
let srv;
let browser;

async function ouvrir(e, chemin, { init = [], route = null, contexteExtra = {} } = {}) {
  const ctx = await browser.newContext({ ...e.ctx, ...contexteExtra });
  await ctx.addInitScript(ESPION);
  for (const s of init) await ctx.addInitScript(s.fn ?? s, s.arg);
  if (route) await ctx.route(route.motif, route.gerer);
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (x) => erreurs.push(`exception : ${String(x).slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(`console : ${m.text().slice(0, 200)}`); });
  await page.goto(`${srv.url}/${chemin}`);
  return { ctx, page, erreurs };
}

async function geste(page, e) {
  const r = await page.evaluate(() => { const b = document.getElementById('geste')?.getBoundingClientRect(); return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : { x: 8, y: 8 }; });
  if (e.ctx.hasTouch) await toucher(page, r.x, r.y);
  else await page.mouse.click(r.x, r.y);
}

const moyenne = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

async function suiteBanc() {
  const e = ecran('tv-1080');
  const nom = e.nom;
  const { ctx, page, erreurs } = await ouvrir(e, 'verification/out/v4-s/banc/index.html');
  try {
    await page.waitForFunction(() => window.__banc?.pret === true);
    // 1. Avant tout geste
    await page.evaluate(() => window.__banc.jouer('page', { vitesse: 0.8 }));
    await page.waitForTimeout(400);
    const E0 = await espion(page);
    const actifAvant = E0.contextes.some((c) => c.etats.at(-1) === 'running');
    R.ok(nom, 'avant le premier geste : aucun contexte actif (aucun ou « suspended »)', !actifAvant && !(await joues(page)).length,
      `${E0.contextes.length} contexte(s)${E0.contextes.length ? ` : ${E0.contextes.map((c) => c.etats.join('→')).join(', ')}` : ''} · ${E0.starts.length} start()`);
    // 2. Premier geste : déverrouillage
    await geste(page, e);
    const actif = await page.waitForFunction(() => window.__banc.etat().contexte === 'running', null, { timeout: 5000 }).then(() => true, () => false);
    const E1 = await espion(page);
    const dansGeste = E1.resumes.some((r) => r.activation === true) || E1.contextes.some((c) => c.activation === true);
    R.ok(nom, 'après le premier geste : contexte « running », resume() dans le geste + tampon muet', actif && dansGeste && E1.resumes.some((r) => r.activation === true),
      `contextes : ${E1.contextes.map((c) => `${c.etats.join('→')} (activation ${c.activation}, ${JSON.stringify(c.options)})`).join(' ; ')} · resume : ${E1.resumes.map((r) => `${r.etat}/activation ${r.activation}`).join(', ') || 'aucun'} · tampon muet : ${E1.starts.filter((s) => s.duree <= 0.01).length}`);
    const dec = await attendreDecodes(page);
    R.ok(nom, `banque décodée après le déverrouillage (${TOTAL} fichiers)`, dec, `${(await espion(page)).decodes} décodés · ${(await espion(page)).fetchs.length} MP3 chargés`);

    // 3. Vitesse → débit
    await page.evaluate(() => window.__banc.reglages({ volumeBruitages: 1, sonsLivre: true }));
    const jouerN = async (nomSon, o, n) => {
      const n0 = await nbStarts(page);
      for (let i = 0; i < n; i++) {
        await page.evaluate(([s, o]) => window.__banc.jouer(s, o), [nomSon, o]);
        await page.waitForTimeout(n > 1 ? 160 : 30); // moins de 8 voix à la fois (VOIX_MAX)
      }
      await page.waitForTimeout(150);
      // Seulement ce son (l'ambiance, branchée, joue aussi les siens).
      return (await joues(page, n0)).filter((x) => new RegExp(`^${nomSon}(-\\d+)?\\.mp3$`).test(x.f || ''));
    };
    const lents = await jouerN('page', { vitesse: 0.1 }, 12);
    const vifs = await jouerN('page', { vitesse: 0.95 }, 12);
    const mL = moyenne(lents.map((s) => s.debit));
    const mV = moyenne(vifs.map((s) => s.debit));
    const borne = (s, v) => s.debit >= (0.9 + 0.25 * v) * 0.97 - 1e-3 && s.debit <= (0.9 + 0.25 * v) * 1.03 + 1e-3;
    R.ok(nom, 'geste vif → débit plus élevé qu\'un geste lent', lents.length === 12 && vifs.length === 12 && mV > mL + 0.1,
      `lent (v 0,1) : ${lents.length} sons, débit moyen ${mL.toFixed(3)} · vif (v 0,95) : ${vifs.length} sons, ${mV.toFixed(3)}`);
    R.ok(nom, 'débit = 0,9 + 0,25 × vitesse, ± 3 %', lents.every((s) => borne(s, 0.1)) && vifs.every((s) => borne(s, 0.95)),
      `lent ${Math.min(...lents.map((s) => s.debit)).toFixed(3)}–${Math.max(...lents.map((s) => s.debit)).toFixed(3)} · vif ${Math.min(...vifs.map((s) => s.debit)).toFixed(3)}–${Math.max(...vifs.map((s) => s.debit)).toFixed(3)}`);
    const suite = [...lents, ...vifs].map((s) => s.f);
    const doubles = suite.filter((f, i) => i > 0 && f === suite[i - 1]).length;
    R.ok(nom, 'page : variante au hasard, jamais la même deux fois de suite', doubles === 0 && new Set(suite).size >= 4,
      `${new Set(suite).size} variantes sur ${suite.length} sons, ${doubles} répétition(s) · ${suite.slice(0, 10).join(' ')}…`);

    // 4. Gain : volume, vitesse, gain, mixage, vidéo
    const riffle = banque.sons.riffle[0];
    const gainDe = async (o, reglages = {}) => {
      await page.evaluate((r) => window.__banc.reglages(r), { volumeBruitages: 1, ...reglages });
      const s = await jouerN('riffle', o, 1);
      return s[0]?.gain ?? null;
    };
    const g1 = await gainDe({ vitesse: 1 });
    const gV = await gainDe({ vitesse: 1 }, { volumeBruitages: 0.5 });
    const gLent = await gainDe({ vitesse: 0 });
    const gOpt = await gainDe({ vitesse: 1, gain: 0.5 });
    await page.evaluate(() => window.__banc.video(true));
    const gVideo = await gainDe({ vitesse: 1 });
    await page.evaluate(() => window.__banc.video(false));
    const proche = (a, b) => a != null && Math.abs(a - b) < 0.002;
    R.ok(nom, 'gain = volume × 0,3 × (0,35 + 0,65 × vitesse) × gain × mixage (banque.json)', proche(g1, GAIN_BRUITAGES * riffle.g) && proche(gLent, 0.35 * GAIN_BRUITAGES * riffle.g) && proche(gOpt, 0.5 * GAIN_BRUITAGES * riffle.g),
      `riffle (mixage ${riffle.g}) : v 1 → ${g1?.toFixed(4)} · v 0 → ${gLent?.toFixed(4)} · gain 0,5 → ${gOpt?.toFixed(4)}`);
    R.ok(nom, 'le volume des bruitages règle le gain', proche(gV, 0.5 * g1), `volume 1 → ${g1?.toFixed(4)} · volume 0,5 → ${gV?.toFixed(4)}`);
    R.ok(nom, 'pendant une vidéo : × 0,3', proche(gVideo, 0.3 * g1), `${gVideo?.toFixed(4)} (attendu ${(0.3 * g1).toFixed(4)})`);
    await page.evaluate(() => window.__banc.reglages({ sonsLivre: false }));
    const coupes = await jouerN('page', { vitesse: 1 }, 3);
    R.ok(nom, '« Sons du livre » coupés → aucun son', !coupes.length, `${coupes.length} start()`);
    await page.evaluate(() => window.__banc.reglages({ sonsLivre: null }));
    // « Couper tous les sons » (muet) : rien de nouveau ne joue, le gain maître des sons tombe à 0 ; rétabli ensuite
    // Attente de la cible (horloge audio : elle peut prendre du retard sur le temps réel quand la machine est chargée).
    await page.evaluate(() => window.__banc.reglages({ muet: true }));
    const coupe = await page.waitForFunction(() => window.__banc.etat().maitre < 0.01, null, { timeout: 8000 }).then(() => true, () => false);
    const maitreMuet = await page.evaluate(() => window.__banc.etat().maitre);
    const pendantMuet = await jouerN('page', { vitesse: 1 }, 3);
    await page.evaluate(() => window.__banc.reglages({ muet: false }));
    const rendu = await page.waitForFunction(() => window.__banc.etat().maitre > 0.99, null, { timeout: 8000 }).then(() => true, () => false);
    const maitreRetour = await page.evaluate(() => window.__banc.etat().maitre);
    const apresMuet = await jouerN('page', { vitesse: 1 }, 2);
    R.ok(nom, 'muet : aucun son du livre, gain maître à 0 ; rétabli ensuite (gain 1, les sons reviennent)',
      coupe && maitreMuet < 0.01 && !pendantMuet.length && rendu && Math.abs(maitreRetour - 1) < 0.01 && apresMuet.length === 2,
      `gain maître ${maitreMuet?.toFixed(3)} · ${pendantMuet.length} son(s) pendant le muet · après : gain ${maitreRetour?.toFixed(3)}, ${apresMuet.length} son(s)`);
    const inconnu = await page.evaluate(() => { try { window.__banc.jouer('inconnu'); window.__banc.jouer('page', { vitesse: NaN, gain: -2, delai: Infinity }); return 'aucune exception'; } catch (x) { return `exception ${x}`; } });
    R.ok(nom, 'jouerSon ne lève jamais d\'erreur (son inconnu, options absurdes)', inconnu === 'aucune exception', inconnu);
    R.ok(nom, 'banc : aucune erreur de page', !erreurs.length, erreurs.slice(0, 3).join(' | '));
  } finally {
    await ctx.close();
  }

  // 5. Un 404
  const route = { motif: '**/sons/riffle.mp3', gerer: (r) => r.fulfill({ status: 404, body: 'introuvable' }) };
  const b = await ouvrir(e, 'verification/out/v4-s/banc/index.html', { route });
  try {
    await b.page.waitForFunction(() => window.__banc?.pret === true);
    await geste(b.page, e);
    await attendreDecodes(b.page, TOTAL - 1);
    await b.page.waitForTimeout(500);
    const n0 = await nbStarts(b.page);
    for (let i = 0; i < 3; i++) await b.page.evaluate(() => window.__banc.jouer('riffle', { vitesse: 1 }));
    await b.page.evaluate(() => window.__banc.jouer('page', { vitesse: 1 }));
    await b.page.waitForTimeout(500);
    const s = await joues(b.page, n0);
    const E = await espion(b.page);
    const essais = E.fetchs.filter((x) => x.f === 'riffle.mp3').length;
    R.ok(nom, 'un 404 est sans effet : pas d\'erreur, pas de son, un seul essai, les autres sons jouent',
      !b.erreurs.length && !s.some((x) => x.f === 'riffle.mp3') && s.some((x) => /^page-/.test(x.f)) && essais === 1,
      `riffle : ${essais} requête(s), ${s.filter((x) => x.f === 'riffle.mp3').length} son · page : ${s.filter((x) => /^page-/.test(x.f || '')).length} son · erreurs : ${b.erreurs.length ? b.erreurs.join(' | ') : 'aucune'}`);
  } finally {
    await b.ctx.close();
  }
}

/** Volume des bruitages par défaut (src/lib/reglages.ts, REGLAGES_DEFAUT) et niveau réel à 100 % du curseur
 * (GAIN_BRUITAGES) : le niveau plein de l'ambiance est leur produit. */
const VOLUME_BRUITAGES_DEFAUT = 0.5;
const GAIN_BRUITAGES = 0.3;
const NIVEAU_DEFAUT = VOLUME_BRUITAGES_DEFAUT * GAIN_BRUITAGES;

async function suiteAmbiance() {
  const e = ecran('tv-1080');
  const nom = e.nom;
  const { ctx, page, erreurs } = await ouvrir(e, 'verification/out/v4-s/banc/index.html');
  try {
    await page.waitForFunction(() => window.__banc?.pret === true);
    await page.waitForTimeout(500);
    const a0 = await page.evaluate(() => window.__banc.ambiance());
    const feuAvant = (await espion(page)).starts.filter((s) => s.f === 'ambiance-feu.mp3').length;
    R.ok(nom, 'ambiance : rien avant le premier geste (voulue, pas en marche)', a0.voulue && !a0.enMarche && !feuAvant, JSON.stringify({ voulue: a0.voulue, enMarche: a0.enMarche, niveau: a0.niveau }));
    await geste(page, e);
    const marche = await page.waitForFunction(() => window.__banc.ambiance().enMarche, null, { timeout: 15000 }).then(() => true, () => false);
    const t0 = Date.now();
    const echant = [];
    for (const ms of [700, 1600, 3800]) {
      await attendre(Math.max(0, ms - (Date.now() - t0)));
      echant.push(await page.evaluate(() => window.__banc.ambiance().niveau));
    }
    const feu = (await espion(page)).starts.filter((s) => s.f === 'ambiance-feu.mp3');
    R.ok(nom, 'ambiance : le feu démarre après le geste, en fondu sur 3 s', marche && feu.length >= 1 && echant[0] > 0.025 * NIVEAU_DEFAUT && echant[0] < 0.75 * NIVEAU_DEFAUT && echant[1] > echant[0] && Math.abs(echant[2] - NIVEAU_DEFAUT) < 0.005,
      `niveau à 0,7 / 1,6 / 3,8 s : ${echant.map((v) => v?.toFixed(3)).join(' / ')} · ${feu.length} passage(s) du feu (gain du passage ${feu[0]?.gain ?? '—'})`);
    const sync = await page.evaluate(async () => {
      const s = window.__gcFeuSync;
      if (!s) return null;
      const h0 = s.horloge();
      await new Promise((r) => setTimeout(r, 600));
      return { n: s.onsets.length, duree: s.duree, h0, h1: s.horloge() };
    });
    R.ok(nom, 'ambiance : la lumière du feu reçoit ses crépitements (window.__gcFeuSync, horloge qui avance)', !!sync && sync.n > 10 && sync.duree > 0 && sync.h1 > sync.h0 + 0.3,
      sync ? `${sync.n} crépitements sur ${sync.duree} s · horloge ${sync.h0.toFixed(2)} → ${sync.h1.toFixed(2)} s` : 'rien de publié');
    // Sourdine pendant une vidéo, puis retour
    await page.evaluate(() => window.__banc.video(true));
    await attendre(1400);
    const enVideo = await page.evaluate(() => window.__banc.ambiance().niveau);
    await page.evaluate(() => window.__banc.video(false));
    await attendre(2600);
    const apres = await page.evaluate(() => window.__banc.ambiance().niveau);
    R.ok(nom, 'ambiance : × 0,15 pendant une vidéo, puis retour', Math.abs(enVideo - 0.15 * NIVEAU_DEFAUT) < 0.003 && Math.abs(apres - NIVEAU_DEFAUT) < 0.005, `pendant ${enVideo?.toFixed(3)} · après ${apres?.toFixed(3)}`);
    // Volume
    await page.evaluate(() => window.__banc.reglages({ volumeBruitages: 1 }));
    await attendre(1200);
    const vol = await page.evaluate(() => window.__banc.ambiance().niveau);
    R.ok(nom, 'ambiance : suit le volume des bruitages', Math.abs(vol - GAIN_BRUITAGES) < 0.005, `volume des bruitages 1 → niveau ${vol?.toFixed(3)} (attendu ${GAIN_BRUITAGES})`);
    // « Couper tous les sons » : le gain maître de l'ambiance tombe à 0 (le feu tourne en silence), aucun
    // bruit de cuisine ; rétabli ensuite
    await page.evaluate(() => window.__banc.reglages({ muet: true }));
    await page.waitForFunction(() => window.__banc.ambiance().niveau < 0.01, null, { timeout: 8000 }).catch(() => undefined);
    const muetAmb = await page.evaluate(() => ({ niveau: window.__banc.ambiance().niveau, marche: window.__banc.ambiance().enMarche }));
    const n0m = await nbStarts(page);
    await page.evaluate(() => { window.__banc.cuisine('cuisine-tasse'); window.__banc.cuisine('cuisine-the'); });
    await attendre(500);
    const cuisineMuet = (await joues(page, n0m)).filter((x) => /^cuisine-/.test(x.f || ''));
    await page.evaluate(() => window.__banc.reglages({ muet: false }));
    await page.waitForFunction((g) => window.__banc.ambiance().niveau > 0.98 * g, GAIN_BRUITAGES, { timeout: 8000 }).catch(() => undefined);
    const retourAmb = await page.evaluate(() => window.__banc.ambiance().niveau);
    R.ok(nom, 'muet : ambiance à 0 (le feu tourne en silence), aucun bruit de cuisine ; rétabli ensuite',
      muetAmb.niveau < 0.003 && muetAmb.marche && !cuisineMuet.length && Math.abs(retourAmb - GAIN_BRUITAGES) < 0.005,
      `niveau pendant le muet ${muetAmb.niveau?.toFixed(3)} (en marche ${muetAmb.marche}) · ${cuisineMuet.length} bruit(s) de cuisine · après : ${retourAmb?.toFixed(3)}`);
    // Cuisine : prévue dans 5 à 15 s ; jouée au gain de la banque × 2, un peu à gauche ou à droite
    const prevue = await page.evaluate(() => window.__banc.ambiance().prochaineCuisineS);
    const n0 = await nbStarts(page);
    await page.evaluate(() => window.__banc.cuisine('cuisine-tasse'));
    await attendre(600);
    const tasse = (await joues(page, n0)).filter((x) => /^cuisine-tasse/.test(x.f || ''));
    const j = await page.evaluate(() => window.__banc.ambiance().cuisine.at(-1));
    const gTasse = Object.fromEntries((AMB?.cuisine['cuisine-tasse'] ?? []).map((v) => [`${v.f}.mp3`, v.g]));
    const gCuisine = await page.evaluate(() => window.__banc.gainCuisine);
    const [sMin, sMax] = await page.evaluate(() => window.__banc.cuisineBornes);
    R.ok(nom, `ambiance : un bruit de cuisine prévu dans ${sMin} à ${sMax} s`, sMin === 5 && sMax === 15 && prevue != null && prevue > 0 && prevue <= sMax, `prochain dans ${prevue?.toFixed(1)} s`);
    R.ok(nom, `ambiance : bruit de cuisine relevé (banque × ${gCuisine}), un peu à gauche ou à droite (StereoPanner)`,
      gCuisine === 2 && tasse.length === 1 && Math.abs(tasse[0].gain - gTasse[tasse[0].f] * gCuisine) < 1e-3 && j && Math.abs(j.pan) >= 0.25 && Math.abs(j.pan) <= 0.7,
      tasse.length ? `${tasse[0].f} gain ${tasse[0].gain?.toFixed(3)} (banque ${gTasse[tasse[0].f]} × ${gCuisine}) · panoramique ${j?.pan?.toFixed(2)}` : 'aucun son');
    // Au hasard, jamais le même bruit deux fois de suite (40 tirages d'affilée, le dernier est relu à chaque tirage)
    const tirages = await page.evaluate(() => {
      const t = [];
      for (let i = 0; i < 40; i++) { window.__banc.cuisine(); t.push(window.__banc.ambiance().derniereCuisine); }
      return t;
    });
    const repetes = tirages.filter((n, i) => i > 0 && n === tirages[i - 1]).length;
    const nbBruits = Object.keys(AMB?.cuisine ?? {}).length;
    R.ok(nom, 'ambiance : bruit de cuisine au hasard, jamais le même deux fois de suite', repetes === 0 && new Set(tirages).size >= Math.min(10, nbBruits),
      `${new Set(tirages).size} bruits différents sur ${tirages.length} tirages (${nbBruits} dans la banque), ${repetes} répétition(s)`);
    // Niveau : chaque bruit, au gain de la banque × GAIN_CUISINE, dépasse le feu (sa sonie au gain de son bus : −36 dB)
    // sans passer devant : de 0 à + 8 dB (l'ambiance est un fond, jamais au premier plan)
    const sFeu = AMB ? sonieMp3(AMB.feu.f) : null;
    if (sFeu == null) R.attente(nom, 'ambiance : chaque bruit de cuisine un peu au-dessus du feu, pas au premier plan', 'ffmpeg absent : sonie non mesurée');
    else {
      const feuDb = sFeu + 20 * Math.log10(AMB.feu.g);
      const marges = Object.values(AMB.cuisine).flat().map((v) => ({ f: v.f, m: sonieMp3(v.f) + 20 * Math.log10(v.g * gCuisine) - feuDb }));
      const hors = marges.filter((x) => !(x.m >= -1 && x.m <= 8));
      R.ok(nom, 'ambiance : chaque bruit de cuisine un peu au-dessus du feu (sonie), pas au premier plan (0 à + 8 dB)', marges.length > 0 && !hors.length,
        `feu ${feuDb.toFixed(1)} dB · ${marges.map((x) => `${x.f.replace('cuisine-', '')} ${x.m >= 0 ? '+' : ''}${x.m.toFixed(1)}`).join(', ')}${hors.length ? ` · hors bornes : ${hors.map((x) => x.f).join(', ')}` : ''}`);
    }
    // Onglet caché : le contexte est suspendu, puis repris
    const cache = await page.evaluate(async () => {
      const etat = () => window.__banc.etat().contexte;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 500));
      const pendant = etat();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 500));
      return { pendant, apres: etat() };
    });
    R.ok(nom, 'ambiance : en pause quand l\'onglet est caché (contexte suspendu), reprise au retour', cache.pendant === 'suspended' && cache.apres === 'running', `${cache.pendant} → ${cache.apres}`);
    // Réglage « ambiance » coupé
    await page.evaluate(() => window.__banc.reglages({ ambiance: false }));
    await attendre(1800);
    const coupee = await page.evaluate(() => ({ ...window.__banc.ambiance(), sync: window.__gcFeuSync }));
    R.ok(nom, 'ambiance : coupée par le réglage (fondu de sortie, la lumière est prévenue)', !coupee.enMarche && coupee.niveau < 0.01 && coupee.sync === null, `en marche ${coupee.enMarche} · niveau ${coupee.niveau?.toFixed(3)}`);
    R.ok(nom, 'ambiance : aucune erreur de page', !erreurs.length, erreurs.slice(0, 3).join(' | '));
  } finally {
    await ctx.close();
  }
  // iPhone, réglages par défaut (ambiance active, téléphone compris) : rien avant le premier toucher ; puis
  // le feu se met en marche, en fondu sur 3 s. Ambiance coupée par le réglage : rien.
  const ip = ecran('iphone13-portrait');
  const a = await ouvrir(ip, 'verification/out/v4-s/banc/index.html');
  try {
    await a.page.waitForFunction(() => window.__banc?.pret === true);
    const avant = await a.page.evaluate(() => ({ eff: window.__banc.ambianceEffective(), ...window.__banc.ambiance() }));
    const E0 = await espion(a.page);
    R.ok(ip.nom, 'iPhone (réglage par défaut) : ambiance voulue, rien en marche avant le premier toucher', avant.eff && !avant.enMarche && !E0.contextes.length, `effective ${avant.eff} · en marche ${avant.enMarche} · ${E0.contextes.length} contexte(s)`);
    await geste(a.page, ip);
    const marche = await a.page.waitForFunction(() => window.__banc.ambiance().enMarche, null, { timeout: 15000 }).then(() => true, () => false);
    await attendre(3800); // fondu d'entrée de 3 s
    const apres = await a.page.evaluate(() => window.__banc.ambiance().niveau);
    const E = await espion(a.page);
    const feu = E.starts.filter((s) => s.f === 'ambiance-feu.mp3' && s.duree > 0.01);
    R.ok(ip.nom, 'iPhone (réglage par défaut) : l\'ambiance joue après le premier toucher (feu en fondu sur 3 s)', marche && feu.length >= 1 && Math.abs(apres - NIVEAU_DEFAUT) < 0.005,
      `${E.contextes.map((c) => c.etats.join('→')).join(', ')} · niveau 3,8 s après le geste ${apres?.toFixed(3)} · ${feu.length} passage(s) du feu`);
  } finally {
    await a.ctx.close();
  }
  const b = await ouvrir(ip, 'verification/out/v4-s/banc/index.html', { init: [initReglages({ ambiance: false })] });
  try {
    await b.page.waitForFunction(() => window.__banc?.pret === true);
    await geste(b.page, ip);
    await attendre(1500);
    const st = await b.page.evaluate(() => window.__banc.ambiance());
    const E = await espion(b.page);
    R.ok(ip.nom, 'iPhone, ambiance coupée par le réglage : ni feu ni bruit de cuisine', !st.enMarche && !E.starts.some((s) => s.f === 'ambiance-feu.mp3'), `en marche ${st.enMarche} · ${E.starts.length} start()`);
  } finally {
    await b.ctx.close();
  }
}

async function suiteIphone() {
  const e = ecran('iphone13-portrait');
  const { ctx, page, erreurs } = await ouvrir(e, 'verification/out/v4-s/banc/index.html');
  try {
    await page.waitForFunction(() => window.__banc?.pret === true);
    const eff = await page.evaluate(() => window.__banc.effectif());
    // Réglage par défaut (sons actifs, téléphone compris) : avant le toucher, rien ; après, les sons jouent.
    await page.evaluate(() => window.__banc.jouer('page', { vitesse: 1 }));
    await page.waitForTimeout(300);
    const avant = await espion(page);
    await geste(page, e);
    const dec = await attendreDecodes(page, TOTAL, 15000);
    await page.waitForTimeout(500);
    const n0 = await nbStarts(page);
    for (const s of ['page', 'photo-lever', 'couverture-ouvrir']) await page.evaluate((s) => window.__banc.jouer(s, { vitesse: 1 }), s);
    await page.waitForTimeout(1500);
    const E = await espion(page);
    const jeux = (await joues(page, n0)).filter((x) => /^(page|photo-lever|couverture-ouvrir)/.test(x.f || ''));
    R.ok(e.nom, 'iPhone (réglage par défaut) : sons du livre actifs, rien avant le premier toucher, puis ils jouent', eff === true && !avant.contextes.length && !avant.starts.length && jeux.length === 3,
      `effectif ${eff} · avant le toucher : ${avant.contextes.length} contexte(s), ${avant.starts.length} son(s) · après : ${E.contextes.map((c) => c.etats.join('→')).join(', ')} · ${jeux.map((x) => x.f).join(', ')} · banque ${dec ? 'décodée' : 'pas entièrement décodée'}`);
    R.ok(e.nom, 'iPhone : aucune erreur de page', !erreurs.length, erreurs.slice(0, 3).join(' | '));
  } finally {
    await ctx.close();
  }
  // « Sons du livre » et ambiance coupés par le réglage : aucun contexte, aucun MP3, aucun son.
  const f = await ouvrir(e, 'verification/out/v4-s/banc/index.html', { init: [initReglages({ sonsLivre: false, ambiance: false })] });
  try {
    await f.page.waitForFunction(() => window.__banc?.pret === true);
    await geste(f.page, e);
    await f.page.evaluate(() => window.__banc.jouer('page', { vitesse: 1 }));
    await f.page.waitForTimeout(1000);
    const E = await espion(f.page);
    R.ok(e.nom, 'iPhone, « Sons du livre » et ambiance coupés : aucun contexte, aucun MP3, aucun son', !E.contextes.length && !E.fetchs.length && !E.starts.length,
      `${E.contextes.length} contexte(s) · ${E.fetchs.length} MP3 · ${E.starts.length} start()`);
  } finally {
    await f.ctx.close();
  }
  // « Couper tous les sons » (muet) : rien ne joue, le gain maître des sons est à 0 (l'ambiance aussi).
  const h = await ouvrir(e, 'verification/out/v4-s/banc/index.html', { init: [initReglages({ muet: true })] });
  try {
    await h.page.waitForFunction(() => window.__banc?.pret === true);
    await geste(h.page, e);
    await attendreDecodes(h.page, TOTAL, 15000);
    await h.page.waitForFunction(() => window.__banc.ambiance().enMarche, null, { timeout: 15000 }).catch(() => undefined);
    const n0 = await nbStarts(h.page);
    for (const s of ['page', 'photo-lever']) await h.page.evaluate((s) => window.__banc.jouer(s, { vitesse: 1 }), s);
    await h.page.waitForTimeout(1200);
    const maitre = await h.page.evaluate(() => window.__banc.etat().maitre);
    const jeux = (await joues(h.page, n0)).filter((x) => /^(page|photo-lever)/.test(x.f || ''));
    const niveau = await h.page.evaluate(() => window.__banc.ambiance().niveau);
    R.ok(e.nom, 'iPhone, « Couper tous les sons » : aucun son, gain maître à 0 (sons du livre et ambiance)', maitre === 0 && !jeux.length && niveau === 0,
      `gain maître ${maitre} · ${jeux.length} son(s) du livre · niveau de l'ambiance ${niveau}`);
  } finally {
    await h.ctx.close();
  }
}

async function suiteSoulever() {
  // Ordinateur 1280 × 800, vraie fenêtre (&ecran=reel) : la TV simulée de la carte (1920 × 1080) est très
  // lente à rastériser sans GPU, et les sons suivent les phases du vol.
  const e = ecran('ordi-1280');
  const { ctx, page, erreurs } = await ouvrir(e, `harness/card.html?c=src/components/Soulever/preview.html&b=${encodeURIComponent(bundle)}&ecran=reel`);
  try {
    await page.waitForFunction(() => window.__gcReady === true, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    if (!(await page.$('[data-gc-objet="photo"]'))) { R.attente(e.nom, 'carte Soulever : photo posée'); return; }
    // Déverrouillage par un clic hors du livre, puis la banque entière.
    await page.mouse.click(6, 6);
    const dec = await attendreDecodes(page, TOTAL, 20000);
    if (!dec) R.info(e.nom, 'banque décodée', `${(await espion(page)).decodes}/${TOTAL}`);
    const rect = async (s) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, s);
    const etat = () => page.evaluate(() => document.querySelector('[data-gc-soulever]')?.getAttribute('data-gc-soulever'));
    const attendreEtat = (v) => page.waitForFunction((v) => document.querySelector('[data-gc-soulever]')?.getAttribute('data-gc-soulever') === v, v, { timeout: 30000 }).then(() => true, () => false);
    const attendrePhase = (v) => page.waitForFunction((v) => document.querySelector('[data-gc-soulever]')?.getAttribute('data-gc-phase') === v, v, { timeout: 30000 }).then(() => true, () => false);

    let n0 = await nbStarts(page);
    const p = await rect('[data-gc-objet="photo"]');
    await page.mouse.click(p.x, p.y);
    const lever = await attendreSon(page, /^photo-lever/, n0);
    R.ok(e.nom, 'photo : « photo-lever » à l\'envol', lever && (await attendreEtat('ouvert')), `${(await joues(page, n0)).map((s) => `${s.f} (débit ${s.debit.toFixed(2)}, gain ${s.gain?.toFixed(3)})`).join(', ') || 'aucun son'} · état ${await etat()}`);
    await attendrePhase('ouvert');
    await page.waitForTimeout(400);
    n0 = await nbStarts(page);
    await page.keyboard.press('Escape');
    const poser = await attendreSon(page, /^photo-poser/, n0, 30000);
    await attendreEtat('ferme');
    R.ok(e.nom, 'photo : « photo-poser » à l\'atterrissage', poser, (await joues(page, n0)).map((s) => s.f).join(', ') || 'aucun son');

    await page.waitForTimeout(500);
    n0 = await nbStarts(page);
    await page.keyboard.press('ArrowUp');
    const fLever = await attendreSon(page, /^feuillet/, n0);
    const ouvert = await attendreEtat('ouvert');
    R.ok(e.nom, 'feuillet : « feuillet » quand on le soulève (↑)', fLever && ouvert, (await joues(page, n0)).map((s) => s.f).join(', ') || 'aucun son');
    await attendrePhase('ouvert');
    await page.waitForTimeout(400);
    n0 = await nbStarts(page);
    await page.keyboard.press('ArrowRight');
    const fTourne = await attendreSon(page, /^feuillet/, n0);
    R.ok(e.nom, 'feuillet : « feuillet » quand on le retourne (→)', fTourne, (await joues(page, n0)).map((s) => s.f).join(', ') || 'aucun son');
    await page.waitForTimeout(1500);
    n0 = await nbStarts(page);
    await page.keyboard.press('Escape');
    const fPose = await attendreSon(page, /^feuillet/, n0, 30000);
    await attendreEtat('ferme');
    R.ok(e.nom, 'feuillet : un « feuillet » plus doux quand il se repose', fPose, (await joues(page, n0)).map((s) => `${s.f} (gain ${s.gain?.toFixed(3)})`).join(', ') || 'aucun son');
    R.ok(e.nom, 'carte Soulever : aucune erreur de page', !erreurs.length, erreurs.slice(0, 3).join(' | '));
  } finally {
    await ctx.close();
  }
}

async function suiteLivre() {
  const e = ecran('tv-1080');
  const { ctx, page, erreurs } = await ouvrir(e, `harness/devices.html?b=${encodeURIComponent(bundle)}#julie`, { init: [{ fn: () => { try { localStorage.setItem('gc:indices:v1', JSON.stringify({ v: 1, coupe: true })); } catch { /* rien */ } } }] });
  try {
    await page.waitForFunction(() => window.__gcDevices?.ready === true, null, { timeout: 30000 });
    if (await page.evaluate(() => window.__gcDevices?.error)) { R.attente(e.nom, 'carnet (devices.html)', await page.evaluate(() => window.__gcDevices.error)); return; }
    await page.waitForTimeout(1500);
    await page.mouse.click(6, 6);
    await attendreDecodes(page, TOTAL, 20000);
    const W = 1920;
    const H = 1080;
    const tirer = async (ms, sens) => {
      const n0 = await nbStarts(page);
      const [a, b] = sens > 0 ? [[W * 0.86, H * 0.5], [W * 0.14, H * 0.5]] : [[W * 0.14, H * 0.5], [W * 0.86, H * 0.5]];
      await glisserSouris(page, a, b, { ms, n: Math.max(6, Math.round(ms / 40)) });
      await attendre(2200);
      return (await joues(page, n0)).filter((s) => /^page-/.test(s.f || ''));
    };
    const lent = await tirer(1400, 1);
    const vif = await tirer(140, -1);
    if (!lent.length && !vif.length) {
      R.attente(e.nom, 'tourne-page : sons « page » (jouerSon branché par le lot A)', 'aucun son « page » joué par le livre : à relancer après intégration');
    } else {
      const mL = moyenne(lent.map((s) => s.debit));
      const mV = moyenne(vif.map((s) => s.debit));
      R.ok(e.nom, 'tourne-page : un geste vif donne un débit plus élevé qu\'un geste lent', lent.length && vif.length && mV > mL,
        `lent : ${lent.map((s) => s.debit.toFixed(3)).join(', ')} · vif : ${vif.map((s) => s.debit.toFixed(3)).join(', ')}`);
    }
    R.info(e.nom, 'carnet : erreurs de page', erreurs.slice(0, 3).join(' | ') || 'aucune');
  } finally {
    await ctx.close();
  }
}

const AMB = banque.ambiance ?? null;

/** Sonie (dB) d'un MP3 de la banque : RMS des trames de 10 ms à moins de 30 dB de la plus forte, comme scripts/bake-sons.mjs ; null sans ffmpeg. */
function sonieMp3(nom) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', join(BAKED, `${nom}.mp3`), '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0) return null;
  const x = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length - (r.stdout.length % 4)));
  const n = 441;
  const p = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let t = 0;
    for (let j = i; j < i + n; j++) t += x[j] * x[j];
    p.push(t / n);
  }
  const max = p.reduce((a, b) => (b > a ? b : a), 0);
  const actives = p.filter((v) => v >= max * 1e-3);
  return 10 * Math.log10(actives.reduce((a, b) => a + b, 0) / actives.length + 1e-24);
}
const ambianceFichiers = new Map(AMB ? [AMB.feu, ...Object.values(AMB.cuisine).flat()].map((v) => [v.f, v]) : []);

function suiteLicences() {
  const lic = JSON.parse(readFileSync(LICENCES, 'utf8'));
  const mp3 = readdirSync(BAKED).filter((f) => f.endsWith('.mp3')).sort();
  const manquants = [];
  const fautes = [];
  for (const f of mp3) {
    const n = f.replace(/\.mp3$/, '');
    const x = lic.fichiers?.[n];
    const octets = statSync(join(BAKED, f)).size;
    const sha = createHash('sha256').update(readFileSync(join(BAKED, f))).digest('hex');
    if (!x) { manquants.push(f); continue; }
    const amb = ambianceFichiers.get(n);
    const max = amb ? Math.ceil(amb.d * 12.5 * 1024 + 4096) : 30 * 1024;
    if (octets > max) fautes.push(`${f} : ${octets} o > ${max} o`);
    if (x.sha256 !== sha) fautes.push(`${f} : sha256 ≠ licences.json`);
    if (x.source === 'synthese') continue;
    for (const cle of [...new Set([x.source, ...(x.couches ?? []).map((c) => c.source)])]) {
    const s = lic.sources?.[cle];
    if (!s) fautes.push(`${f} : source ${cle} inconnue`);
    else {
      // CC0 1.0 (lue sur la page de la source), ou domaine public (fiche Wikimedia Commons : pd)
      const cc0 = s.licence === 'CC0 1.0' && /publicdomain\/zero\/1\.0/.test(s.licenceUrl ?? '') && /publicdomain\/zero\/1\.0/.test(s.licenceLue ?? '');
      const pd = s.licence === 'Domaine public' && /publicdomain\/(mark|zero)\//.test(s.licenceUrl ?? '') && /^https:\/\/commons\.wikimedia\.org\//.test(s.url ?? '');
      if (!cc0 && !pd) fautes.push(`${f} : licence ${s.licence}`);
      const freesound = /^https:\/\/freesound\.org\//.test(s.url ?? '');
      if ((freesound && !s.id) || !s.auteur || !/^https:\/\/(freesound\.org|opengameart\.org|commons\.wikimedia\.org)\//.test(s.url ?? '') || !s.date) fautes.push(`${f} : fiche incomplète (${x.source})`);
      const src = join(ROOT, 'design-system/sources/sons', s.fichier?.nom ?? '');
      if (!existsSync(src) || createHash('sha256').update(readFileSync(src)).digest('hex') !== s.fichier.sha256) fautes.push(`${f} : source ${s.fichier?.nom} absente ou modifiée`);
    }
    }
  }
  const sources = new Set(Object.values(lic.fichiers ?? {}).map((x) => x.source));
  R.ok(null, 'chaque MP3 de la banque a sa licence (CC0 1.0 ou domaine public vérifiés, ou « synthese »)', mp3.length > 0 && !manquants.length && !fautes.length,
    `${mp3.length} MP3 · sources : ${[...sources].join(', ')}${manquants.length ? ` · sans licence : ${manquants.join(', ')}` : ''}${fautes.length ? ` · ${fautes.join(' ; ')}` : ''}`);
  const absents = Object.values(banque.sons).flat().filter((v) => !existsSync(join(BAKED, `${v.f}.mp3`))).map((v) => v.f);
  const NOMS = ['page', 'riffle', 'couverture-ouvrir', 'couverture-poser', 'couverture-fermer', 'feuillet', 'photo-lever', 'photo-poser', 'coin'];
  const sansSon = NOMS.filter((n) => !banque.sons[n]?.length);
  R.ok(null, 'banque.json : les 9 sons, page ×5, chaque fichier présent', !absents.length && !sansSon.length && banque.sons.page.length === 5,
    `${NOMS.map((n) => `${n} ×${banque.sons[n]?.length ?? 0}`).join(', ')}${absents.length ? ` · absents : ${absents.join(', ')}` : ''}`);
  const CUISINE = [
    'cuisine-cuillere', 'cuisine-tasse', 'cuisine-bouilloire', 'cuisine-the', 'cuisine-boite',
    'cuisine-couteau', 'cuisine-assiette', 'cuisine-sel', 'cuisine-minuteur', 'cuisine-chat',
    'cuisine-horloge', 'cuisine-paquet', 'cuisine-chaise', 'cuisine-tiroir', 'cuisine-verre',
  ];
  const ambAbsents = [...ambianceFichiers.keys()].filter((f) => !existsSync(join(BAKED, `${f}.mp3`)));
  const feu = AMB?.feu;
  const boucleOk = !!feu && feu.boucle >= 30 && feu.boucle <= 60 && feu.d >= feu.boucle + feu.fondu - 0.05 && feu.onsets.length > 10 && feu.onsets.every((t) => t >= 0 && t < feu.boucle) && feu.forces.length === feu.onsets.length;
  R.ok(null, 'ambiance : boucle du feu de 30 à 60 s (+ fondu croisé), crépitements, les 15 bruits de cuisine', !!AMB && boucleOk && CUISINE.every((n) => AMB.cuisine[n]?.length) && !ambAbsents.length,
    AMB ? `feu ${feu.boucle} s + ${feu.fondu} s de fondu (${feu.d} s, ${(statSync(join(BAKED, `${feu.f}.mp3`)).size / 1024).toFixed(0)} Ko, ${(8 * statSync(join(BAKED, `${feu.f}.mp3`)).size / feu.d / 1000).toFixed(0)} kb/s), ${feu.onsets.length} crépitements · ${CUISINE.map((n) => `${n.replace('cuisine-', '')} ×${AMB.cuisine[n]?.length ?? 0}`).join(', ')}${ambAbsents.length ? ` · absents : ${ambAbsents.join(', ')}` : ''}` : 'pas de clé « ambiance » dans banque.json');
}

// ---- Programme -----------------------------------------------------------------------------------------
if (suites.includes('licences')) suiteLicences();
const pagees = suites.filter((s) => s !== 'licences');
if (pagees.length) {
  srv = await serve(ROOT);
  browser = await lancer();
  if (pagees.some((s) => ['banc', 'iphone', 'ambiance'].includes(s))) await construireBanc();
  for (const [s, f] of [['banc', suiteBanc], ['ambiance', suiteAmbiance], ['iphone', suiteIphone], ['soulever', suiteSoulever], ['livre', suiteLivre]]) {
    if (!suites.includes(s)) continue;
    console.log(`\n■ ${s}`);
    try { await f(); } catch (x) { R.ajouter(null, `${s} : exécution`, 'KO', `plantage : ${String(x).split('\n')[0]}`); }
  }
  await browser.close();
  await srv.close();
}
R.ecrire({ sortie: rel(out) });
process.exit(R.code());
