// Toute la vérification du lot T, d'une seule commande, et un résumé verification/out/t/resume.md.
//
//   1. médias d'essai (ffmpeg : mp4 H.264 + AAC +faststart, webm VP9, affiche sépia) ;
//   2. serve.mjs : Range (200, 206, 416, HEAD, plusieurs intervalles), /_blob/<id>, mode site, ../ refusé ;
//      vidéos du lot V : ≤ 2 Mo, +faststart, H.264 720p, noms logiques de videos.json, crédits, 206 ;
//   3. bundle de la carte Carnet (--bundle, ou --bundle-frais : dist/ds-t construit maintenant) ;
//   4. verify-devices (tous les écrans) · 5. verify-soulever · 6. verify-reglages ;
//   7. fps : tourne-page, tourne-page avec photo, envol ;
//   8. verify-site (--site <dossier>, --build, ou dist/site s'il existe) ;
//   9. tests de cuisson (scripts/pages/tests, s'ils existent) ;
//  10. --autotest : le banc factice harness/banc-soulever.html, sain puis avec chaque défaut injecté,
//      prouve que les tests détectent ce qu'ils doivent (play() hors geste, focus qui fuit…).
// Chaque étape écrit son rapport JSON + MD sous verification/out/t/<étape>/ et son journal sous
// verification/out/t/logs/. Statut d'une étape : OK, KO, ATTENTE (rien de faux, mais des éléments du
// contrat pas encore intégrés), ERREUR (le script a planté).
//
//   node scripts/verify-all.mjs [--site dist/site | --build] [--cible-site] [--bundle dist/ds-t/components | --bundle-frais]
//        [--seulement serve,videos,devices,soulever,reglages,fps,site,cuisson] [--sans fps] [--rapide] [--autotest]
//        [--autotest-seul] [--sans-bundle-frais] [--sans-precedents]
// Les étapes non relancées reprennent leur dernier rapport (marqué « rapport précédent ») : on peut relancer
// une partie (--seulement soulever) sans perdre le résumé complet.
// Sans --bundle, la carte Carnet est d'abord reconstruite dans dist/ds-t (build-bundle isolé).
// --site <dossier> ou --build (vite build dans verification/out/t/site-build) : l'étape « site » ;
// devices, soulever et réglages restent sur la carte Carnet, sauf --cible-site.
// --rapide : verify-devices sans les interactions, soulever et réglages sur un téléphone et la TV.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { request } from 'node:http';
import {
  ROOT, OUT_T, lireArgs, medias, serve, serveSite, Rapport, bundleParDefaut, rel, lancer, codecH264, atomesMp4,
} from './lib/verif.mjs';

const { opt, drapeau, liste } = lireArgs();
const seulement = liste('seulement');
const sans = liste('sans', '');
const rapide = drapeau('rapide');
const autotestSeul = drapeau('autotest-seul');
const autotest = drapeau('autotest') || autotestSeul;
const LOGS = join(OUT_T, 'logs');
mkdirSync(LOGS, { recursive: true });
const veut = (cle) => !autotestSeul && (!seulement || seulement.includes(cle)) && !sans.includes(cle);
const etapes = [];
const t00 = Date.now();

/** Lance un script node, journal dans logs/<cle>.log ; lit son rapport JSON. */
function lancerScript(cle, titre, args, rapport) {
  return new Promise((ok) => {
    const t0 = Date.now();
    const log = join(LOGS, `${cle}.log`);
    const flux = createWriteStream(log);
    const cmd = ['node', ...args].join(' ');
    console.log(`\n▶ ${titre}\n  ${cmd}`);
    const p = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
    p.stdout.on('data', (d) => { flux.write(d); process.stdout.write(d.toString().split('\n').filter((l) => /✗ KO|■|^\S+ : OK/.test(l)).map((l) => `  ${l}\n`).join('')); });
    p.stderr.on('data', (d) => flux.write(d));
    p.on('close', (code) => {
      flux.end();
      let r = null;
      try { r = JSON.parse(readFileSync(rapport, 'utf8')); } catch { /* pas de rapport */ }
      const e = { cle, titre, cmd, code, duree: Math.round((Date.now() - t0) / 1000), rapport: existsSync(rapport) ? rel(rapport) : null, log: rel(log), json: r };
      e.statut = !r || (code !== 0 && code !== 1) ? 'ERREUR' : r.bilan.KO ? 'KO' : r.bilan.ATTENTE ? 'ATTENTE' : 'OK';
      if (r?.planche) e.planche = r.planche;
      console.log(`  → ${e.statut} (${e.duree} s)${r ? ` · OK ${r.bilan.OK} · KO ${r.bilan.KO} · ATTENTE ${r.bilan.ATTENTE} · INFO ${r.bilan.INFO}` : ''}`);
      etapes.push(e);
      ok(e);
    });
  });
}

const http = (url, { methode = 'GET', entetes = {} } = {}) => new Promise((ok, ko) => {
  const req = request(url, { method: methode, headers: entetes }, (res) => {
    const morceaux = [];
    res.on('data', (c) => morceaux.push(c));
    res.on('end', () => ok({ statut: res.statusCode, entetes: res.headers, corps: Buffer.concat(morceaux) }));
  });
  req.on('error', ko);
  req.end();
});

// ---- 1–2. Médias et serveur ---------------------------------------------------------------------
async function etapeServe() {
  const t0 = Date.now();
  const R = new Rapport('serve', { dir: join(OUT_T, 'serve') });
  console.log('\n▶ serve.mjs : Range, types, /_blob, mode site');
  const f = medias();
  const taille = readFileSync(f.mp4).length;
  const a = atomesMp4(f.mp4);
  R.ok(null, 'mp4 d\'essai : H.264 +faststart', a.faststart, `${(taille / 1024).toFixed(0)} Ko · ${a.atomes.join(' ')}`);
  const srv = await serve();
  const u = `${srv.url}/${rel(f.mp4)}`;
  const tests = [
    ['sans Range → 200 complet, Accept-Ranges', {}, (r) => r.statut === 200 && r.corps.length === taille && r.entetes['accept-ranges'] === 'bytes' && r.entetes['content-type'] === 'video/mp4'],
    ['bytes=0-1023 → 206, Content-Range, 1024 octets', { Range: 'bytes=0-1023' }, (r) => r.statut === 206 && r.entetes['content-range'] === `bytes 0-1023/${taille}` && r.corps.length === 1024 && r.corps.equals(readFileSync(f.mp4).subarray(0, 1024))],
    ['bytes=1000- → 206 jusqu\'à la fin', { Range: 'bytes=1000-' }, (r) => r.statut === 206 && r.corps.length === taille - 1000 && r.entetes['content-range'] === `bytes 1000-${taille - 1}/${taille}`],
    ['bytes=-500 → 206, les 500 derniers octets', { Range: 'bytes=-500' }, (r) => r.statut === 206 && r.corps.equals(readFileSync(f.mp4).subarray(taille - 500))],
    ['bytes=au-delà → 416, Content-Range: bytes */taille', { Range: `bytes=${taille + 10}-` }, (r) => r.statut === 416 && r.entetes['content-range'] === `bytes */${taille}`],
    ['plusieurs intervalles → 200 complet', { Range: 'bytes=0-1,5-9' }, (r) => r.statut === 200 && r.corps.length === taille],
  ];
  for (const [nom, entetes, f_] of tests) {
    const r = await http(u, { entetes });
    R.ok(null, `mp4 ${nom}`, f_(r), `${r.statut} · ${r.entetes['content-range'] ?? '—'} · ${r.corps.length} octets`);
  }
  const h = await http(u, { methode: 'HEAD', entetes: { Range: 'bytes=0-9' } });
  R.ok(null, 'HEAD → en-têtes seuls', h.statut === 206 && h.corps.length === 0 && Number(h.entetes['content-length']) === 10, `${h.statut} · content-length ${h.entetes['content-length']}`);
  const w = await http(`${srv.url}/${rel(f.webm)}`, { entetes: { Range: 'bytes=0-9' } });
  R.ok(null, 'webm → video/webm, 206', w.statut === 206 && w.entetes['content-type'] === 'video/webm', `${w.statut} ${w.entetes['content-type']}`);
  const t = await http(`${srv.url}/../../etc/passwd`);
  const t2 = await http(`${srv.url}/%2e%2e/%2e%2e/etc/passwd`);
  R.ok(null, 'hors de la racine (../) refusé', t.statut >= 400 && t2.statut >= 400, `${t.statut} / ${t2.statut}`);
  const html = await http(`${srv.url}/harness/devices.html`);
  R.ok(null, 'HTML : text/html, 200', html.statut === 200 && /text\/html/.test(html.entetes['content-type']), html.entetes['content-type']);
  // /_blob/<id> : le premier asset téléversé dont le fichier existe encore
  try {
    const lock = JSON.parse(readFileSync(join(ROOT, 'design-system/assets.lock.json'), 'utf8'));
    const assets = JSON.parse(readFileSync(join(ROOT, 'design-system/assets.json'), 'utf8'));
    const [sha, id] = Object.entries(lock).find(([s]) => { const x = Object.values(assets).find((y) => y.sha === s); return x && existsSync(join(ROOT, 'design-system', x.file)); }) ?? [];
    if (id) {
      const x = Object.values(assets).find((y) => y.sha === sha);
      const b = await http(`${srv.url}/_blob/${id}`);
      const br = await http(`${srv.url}/_blob/${id}`, { entetes: { Range: 'bytes=0-9' } });
      R.ok(null, '/_blob/<id> → le fichier de l\'asset (et Range)', b.statut === 200 && b.corps.equals(readFileSync(join(ROOT, 'design-system', x.file))) && br.statut === 206, `${x.file} · ${b.statut} / ${br.statut}`);
    } else R.info(null, '/_blob/<id>', 'aucun asset téléversé dont le fichier existe');
    const inc = await http(`${srv.url}/_blob/inconnu`);
    R.ok(null, '/_blob/inconnu → 404', inc.statut === 404, String(inc.statut));
  } catch (x) {
    R.info(null, '/_blob/<id>', `pas de design-system/assets.lock.json (${String(x).split('\n')[0]})`);
  }
  await srv.close();
  // Mode site, monté sous /gouters-de-cecile/ comme GitHub Pages
  const s = await serveSite(join(OUT_T, 'media'), { base: '/gouters-de-cecile/' });
  const racine = s.url.replace(/\/gouters-de-cecile$/, '');
  const r1 = await http(`${s.url}/essai.mp4`, { entetes: { Range: 'bytes=0-1' } });
  const r2 = await http(`${racine}/essai.mp4`);
  const r3 = await http(`${racine}/gouters-de-cecile`);
  R.ok(null, 'mode site sous /gouters-de-cecile/ : 206 dedans, 404 dehors, 301 sans « / »', r1.statut === 206 && r2.statut === 404 && r3.statut === 301, `${r1.statut} / ${r2.statut} / ${r3.statut} → ${r3.entetes.location}`);
  R.ok(null, 'journal du serveur', s.journal.length === 3 && s.journal[0].statut === 206, s.journal.map((j) => `${j.statut} ${j.chemin}`).join(', '));
  await s.close();
  // Le navigateur : H.264 décodable ?
  const b = await lancer();
  const p = await b.newPage();
  const c = await codecH264(p);
  await b.close();
  R.info(null, 'ce Chromium décode H.264', `${c.decodable ? 'oui' : 'non'} (avc1 « ${c.h264} », mp4 « ${c.mp4} », VP9 « ${c.vp9} ») — lecture réelle des mp4 : vrai iPhone ou GC_CHROME`);
  const fj = R.ecrire({ codec: c });
  const j = JSON.parse(readFileSync(fj, 'utf8'));
  etapes.push({ cle: 'serve', titre: 'serve.mjs : Range, types, /_blob, mode site', cmd: 'interne (verify-all)', code: R.code(), duree: Math.round((Date.now() - t0) / 1000), rapport: rel(fj), log: null, json: j, statut: R.bilan().KO ? 'KO' : 'OK' });
  return c;
}

// ---- Vidéos du lot V (design-system/baked/videos, src/content/videos.json) --------------------------
async function etapeVideos() {
  const t0 = Date.now();
  const R = new Rapport('videos', { dir: join(OUT_T, 'videos') });
  console.log('\n▶ vidéos du lot V : poids, faststart, H.264, noms logiques, Range');
  const dir = join(ROOT, 'design-system/baked/videos');
  const mp4 = existsSync(dir) ? readdirSync(dir).filter((n) => /\.mp4$/i.test(n)).sort() : [];
  if (!mp4.length) R.attente(null, 'mp4 sous design-system/baked/videos', 'aucun : à relancer après le lot V');
  const ffprobe = spawnSync('ffprobe', ['-version']).status === 0;
  const srv = await serve();
  for (const n of mp4) {
    const f = join(dir, n);
    const a = atomesMp4(f);
    R.ok(n, '≤ 2 Mo', a.octets <= 2 * 1024 * 1024, `${(a.octets / 1024).toFixed(0)} Ko`);
    R.ok(n, '+faststart (moov avant mdat)', a.faststart, a.atomes.join(' '));
    if (ffprobe) {
      const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,width,height:format=duration', '-of', 'json', f], { encoding: 'utf8' });
      const j = JSON.parse(p.stdout || '{}');
      const v = (j.streams ?? []).find((x) => x.codec_type === 'video');
      const au = (j.streams ?? []).find((x) => x.codec_type === 'audio');
      R.ok(n, 'H.264 720p, AAC ou muet', v?.codec_name === 'h264' && v?.height === 720 && (!au || au.codec_name === 'aac'), `${v?.codec_name} ${v?.profile} ${v?.width}×${v?.height}${au ? ` · ${au.codec_name}` : ' · muet'} · ${Number(j.format?.duration ?? 0).toFixed(1)} s`);
    }
    const r = await http(`${srv.url}/design-system/baked/videos/${n}`, { entetes: { Range: 'bytes=0-1' } });
    R.ok(n, 'servi en 206 (Range)', r.statut === 206 && r.entetes['content-type'] === 'video/mp4', `${r.statut} · ${r.entetes['content-range']}`);
  }
  await srv.close();
  const fj = join(ROOT, 'src/content/videos.json');
  if (!existsSync(fj)) R.attente(null, 'src/content/videos.json', 'absent : à relancer après le lot V');
  else {
    const vids = JSON.parse(readFileSync(fj, 'utf8'));
    const fichier = (nom, ext) => existsSync(join(ROOT, 'design-system/baked', `${nom}.${ext}`));
    for (const [id, x] of Object.entries(vids)) {
      const manque = [['video', 'mp4'], ['affiche', 'webp'], ['tirage', 'webp'], ['coins', 'webp']].filter(([k, ext]) => !x[k] || !fichier(x[k], ext)).map(([k]) => `${k} (${x[k] ?? '—'})`);
      R.ok(id, 'videos.json : fichiers des noms logiques présents', !manque.length, manque.length ? `manquent : ${manque.join(', ')}` : `${x.video}, ${x.affiche}, ${x.tirage}, ${x.coins}`);
      const c = x.credit ?? {};
      R.ok(id, 'videos.json : crédit (auteur, source, licence)', !!(c.auteur && c.source && c.licence), `${c.auteur ?? '?'} · ${c.licence ?? '?'}`);
    }
  }
  const f = R.ecrire();
  etapes.push({ cle: 'videos', titre: 'vidéos du lot V : poids, faststart, H.264, noms logiques, Range', cmd: 'interne (verify-all)', code: R.code(), duree: Math.round((Date.now() - t0) / 1000), rapport: rel(f), log: null, json: JSON.parse(readFileSync(f, 'utf8')), statut: R.bilan().KO ? 'KO' : R.bilan().ATTENTE ? 'ATTENTE' : 'OK' });
}

// ---- Programme -------------------------------------------------------------------------------------
let codec = null;
if (veut('serve') || autotest) codec = await etapeServe().catch((x) => { console.error(x); etapes.push({ cle: 'serve', titre: 'serve.mjs', statut: 'ERREUR', duree: 0, cmd: 'interne', json: null }); return null; });

if (veut('videos')) await etapeVideos().catch((x) => { console.error(x); etapes.push({ cle: 'videos', titre: 'vidéos du lot V', statut: 'ERREUR', duree: 0, cmd: 'interne', json: null }); });

let bundle = opt('bundle');
// Par défaut (ni --bundle ni --site) : un bundle frais de l'état du dépôt, isolé dans dist/ds-t.
const besoinBundle = ['devices', 'soulever', 'reglages', 'fps'].some(veut);
const frais = besoinBundle && (drapeau('bundle-frais') || (!bundle && !(opt('site') && drapeau('cible-site')) && !drapeau('sans-bundle-frais')));
if (frais) {
  const comps = readdirSync(join(ROOT, 'src/components'), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(ROOT, 'src/components', d.name, 'index.ts'))).map((d) => d.name).join(',');
  console.log('\n▶ bundle frais de la carte Carnet → dist/ds-t');
  const r = spawnSync(process.execPath, ['scripts/build-bundle.mjs', '--only', comps, '--boards', 'Carnet,DemoCarnet', '--tag', 't'], { cwd: ROOT, encoding: 'utf8' });
  console.log(`  ${(r.stdout || r.stderr).trim().split('\n').pop()}`);
  if (r.status === 0) bundle = 'dist/ds-t/components';
  else etapes.push({ cle: 'bundle', titre: 'bundle frais (dist/ds-t)', statut: 'ERREUR', duree: 0, cmd: 'scripts/build-bundle.mjs', json: null });
}
bundle ??= bundleParDefaut();
// --site / --build : le site construit, pour l'étape « site » ; les autres étapes restent sur la carte
// Carnet (encoches simulées), sauf --cible-site qui les fait aussi tourner sur le site.
let site = opt('site');
if (drapeau('build')) site = 'verification/out/t/site-build';
const siteAuto = !site && existsSync(join(ROOT, 'dist/site/index.html')) ? 'dist/site' : null;
const cibleArgs = site && drapeau('cible-site') && !drapeau('build') ? ['--site', site] : ['--bundle', bundle];
const O = (cle) => ['--out', rel(join(OUT_T, cle))];

if (veut('devices')) await lancerScript('devices', 'verify-devices : tous les écrans', ['scripts/verify-devices.mjs', ...cibleArgs, ...O('devices'), ...(rapide ? ['--no-interactions'] : [])], join(OUT_T, 'devices/devices.json'));
if (veut('soulever')) await lancerScript('soulever', 'verify-soulever : photo, feuillet, mouvement réduit', ['scripts/verify-soulever.mjs', ...cibleArgs, ...O('soulever'), ...(rapide ? ['--only', 'iphone13-portrait,tv-1080'] : [])], join(OUT_T, 'soulever/soulever.json'));
if (veut('reglages')) await lancerScript('reglages', 'verify-reglages : menu de réglages', ['scripts/verify-reglages.mjs', ...cibleArgs, ...O('reglages'), ...(rapide ? ['--only', 'iphone13-portrait,ordi-1440'] : [])], join(OUT_T, 'reglages/reglages.json'));
if (veut('fps')) await lancerScript('fps', 'fps : tourne-page, tourne-page avec photo, envol', ['scripts/fps.mjs', '--scenarios', 'turn,turn-photo,envol', '--bundle', bundle, ...O('fps'), '--no-video', '--no-poses'], join(OUT_T, 'fps/fps.json'));
if (veut('site') && (site || siteAuto || drapeau('build'))) {
  await lancerScript('site', 'verify-site : site construit', ['scripts/verify-site.mjs', ...(drapeau('build') ? ['--build'] : ['--site', site ?? siteAuto]), ...O('site')], join(OUT_T, 'site/site.json'));
}
if (veut('cuisson')) {
  const dir = join(ROOT, 'scripts/pages/tests');
  const t0 = Date.now();
  if (!existsSync(dir)) etapes.push({ cle: 'cuisson', titre: 'tests de cuisson (scripts/pages/tests)', statut: 'ATTENTE', duree: 0, cmd: '—', json: { bilan: { OK: 0, KO: 0, ATTENTE: 1, INFO: 0 }, tests: [{ test: 'scripts/pages/tests', statut: 'ATTENTE', detail: 'pas encore écrits (lot B)' }] } });
  else {
    // Python du venv d'écriture (numpy, Pillow…), comme l'indique scripts/pages/tests/test_pages.py.
    const venv = join(ROOT, 'tools/ecriture/.venv/bin/python');
    const py = existsSync(venv) ? venv : 'python3';
    const args = ['-m', 'unittest', 'discover', '-s', 'scripts/pages/tests', '-v'];
    console.log(`\n▶ tests de cuisson : ${rel(py)} ${args.join(' ')}`);
    const r = spawnSync(py, args, { cwd: ROOT, encoding: 'utf8', timeout: 1800000 });
    writeFileSync(join(LOGS, 'cuisson.log'), `${r.stdout}\n${r.stderr}`);
    const ok = r.status === 0;
    const der = `${r.stdout}\n${r.stderr}`.trim().split('\n').filter(Boolean).pop() ?? '';
    console.log(`  → ${ok ? 'OK' : 'KO'} : ${der}`);
    mkdirSync(join(OUT_T, 'cuisson'), { recursive: true });
    writeFileSync(join(OUT_T, 'cuisson/cuisson.json'), JSON.stringify({ nom: 'cuisson', date: new Date().toISOString(), bilan: { OK: ok ? 1 : 0, KO: ok ? 0 : 1, ATTENTE: 0, INFO: 0 }, tests: [{ test: 'tests de cuisson', statut: ok ? 'OK' : 'KO', detail: der }] }, null, 2));
    etapes.push({ cle: 'cuisson', titre: 'tests de cuisson (scripts/pages/tests)', statut: ok ? 'OK' : 'KO', duree: Math.round((Date.now() - t0) / 1000), cmd: `${py === 'python3' ? 'python3' : rel(py)} ${args.join(' ')}`, log: rel(join(LOGS, 'cuisson.log')), json: { bilan: { OK: ok ? 1 : 0, KO: ok ? 0 : 1, ATTENTE: 0, INFO: 0 }, tests: [{ test: 'tests de cuisson', statut: ok ? 'OK' : 'KO', detail: der }] } });
  }
}

// ---- Autotest : le banc factice, sain puis avec chaque défaut ----------------------------------------
const MATRICE = [
  { script: 'soulever', defaut: '', only: 'iphone13-portrait,tv-1080', titre: 'banc sain' },
  { script: 'soulever', defaut: 'play-hors-geste', only: 'iphone13-portrait', suites: 'photo', test: /play\(\) appelé dans le geste/ },
  { script: 'soulever', defaut: 'glisser-tourne', only: 'iphone13-portrait', suites: 'photo', test: /glisser horizontal/ },
  { script: 'soulever', defaut: 'retour-decale', only: 'iphone13-portrait', suites: 'photo', test: /revenu à son rect/ },
  { script: 'soulever', defaut: 'fin-ignoree', only: 'tv-1080', suites: 'photo', test: /fin de la vidéo/ },
  { script: 'soulever', defaut: 'transforme-reduit', only: 'iphone13-portrait', suites: 'reduit', test: /mouvement réduit/ },
  { script: 'reglages', defaut: '', only: 'iphone13-portrait,ordi-1440', titre: 'banc sain' },
  { script: 'reglages', defaut: 'focus-fuit', only: 'ordi-1440', test: /focus piégé/ },
  { script: 'reglages', defaut: 'echap-focus', only: 'ordi-1440', test: /rend le focus au bouton/ },
  { script: 'reglages', defaut: 'stockage-plante', only: 'ordi-1440', test: /localStorage.*plantage/ },
  { script: 'reglages', defaut: 'petite-cible', only: 'iphone13-portrait', test: /44 px/ },
  { script: 'reglages', defaut: 'hors-zone', only: 'iphone13-portrait', test: /zone sûre/ },
  { script: 'reglages', defaut: 'vitesse-inversee', only: 'ordi-1440', test: /vive < normale < lente/ },
  { script: 'reglages', defaut: 'zoom-hors-bornes', only: 'ordi-1440', test: /zoom borné/ },
  { script: 'fps', defaut: '', titre: 'banc sain' },
  { script: 'fps', defaut: 'layout', test: /0 Layout|transform \/ opacity/ },
];
const autotests = [];
if (autotest) {
  console.log('\n▶ autotest : banc factice harness/banc-soulever.html, défauts injectés');
  medias();
  for (const m of MATRICE) {
    const nom = `${m.script}-${m.defaut || 'sain'}`;
    const dir = join(OUT_T, 'autotest', nom);
    const args = m.script === 'fps'
      ? ['scripts/fps.mjs', '--scenarios', 'envol', '--banc-envol', `harness/banc-soulever.html${m.defaut ? `?defaut=${m.defaut}` : ''}`, '--no-video', '--no-poses', '--out', rel(dir)]
      : [`scripts/verify-${m.script}.mjs`, '--banc', ...(m.defaut ? ['--defaut', m.defaut] : []), '--only', m.only, ...(m.suites ? ['--suites', m.suites] : []), '--out', rel(dir)];
    const t0 = Date.now();
    const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    writeFileSync(join(LOGS, `autotest-${nom}.log`), `${r.stdout}\n${r.stderr}`);
    let j = null;
    try { j = JSON.parse(readFileSync(join(dir, `${m.script}.json`), 'utf8')); } catch { /* rien */ }
    const kos = (j?.tests ?? []).filter((t) => t.statut === 'KO');
    let ok;
    let detail;
    if (!j) { ok = false; detail = `pas de rapport (code ${r.status})`; }
    else if (!m.test) { ok = kos.length === 0 && j.bilan.OK > 0; detail = ok ? `aucun KO (${j.bilan.OK} OK)` : `KO inattendus : ${kos.slice(0, 3).map((t) => t.test).join(' ; ')}`; }
    else {
      const vises = kos.filter((t) => m.test.test(t.test));
      ok = vises.length > 0;
      detail = ok ? `détecté : ${vises[0].test}${vises[0].detail ? ` — ${vises[0].detail.slice(0, 120)}` : ''}` : `NON détecté (KO : ${kos.map((t) => t.test).join(' ; ') || 'aucun'})`;
      const autres = kos.filter((t) => !m.test.test(t.test));
      if (ok && autres.length) detail += ` · autres KO : ${autres.slice(0, 2).map((t) => t.test).join(' ; ')}`;
    }
    const ligne = { script: m.script, defaut: m.defaut || '(aucun)', attendu: m.test ? `KO sur ${m.test.source}` : 'aucun KO', ok, detail, duree: Math.round((Date.now() - t0) / 1000), rapport: j ? rel(join(dir, `${m.script}.json`)) : null };
    autotests.push(ligne);
    console.log(`  ${ok ? '✓' : '✗'} ${m.script} · ${ligne.defaut} → ${detail} (${ligne.duree} s)`);
  }
}

// ---- Étapes non relancées : leur dernier rapport (sauf --sans-precedents) ---------------------------------
const TITRES = {
  serve: 'serve.mjs : Range, types, /_blob, mode site', videos: 'vidéos du lot V : poids, faststart, H.264, noms logiques, Range',
  devices: 'verify-devices : tous les écrans', soulever: 'verify-soulever : photo, feuillet, mouvement réduit',
  reglages: 'verify-reglages : menu de réglages', fps: 'fps : tourne-page, tourne-page avec photo, envol', site: 'verify-site : site construit',
  cuisson: 'tests de cuisson (scripts/pages/tests)',
};
if (!drapeau('sans-precedents')) {
  for (const [cle, titre] of Object.entries(TITRES)) {
    if (etapes.some((e) => e.cle === cle)) continue;
    const f = join(OUT_T, cle, `${cle}.json`);
    if (!existsSync(f)) continue;
    try {
      const j = JSON.parse(readFileSync(f, 'utf8'));
      etapes.push({ cle, titre: `${titre} — rapport précédent (${String(j.date ?? '').slice(0, 16).replace('T', ' ')})`, statut: j.bilan.KO ? 'KO' : j.bilan.ATTENTE ? 'ATTENTE' : 'OK', duree: 0, cmd: null, rapport: rel(f), log: existsSync(join(LOGS, `${cle}.log`)) ? rel(join(LOGS, `${cle}.log`)) : null, json: j, planche: j.planche, precedent: true });
    } catch { /* rapport illisible */ }
  }
  const ordre = ['serve', 'videos', 'bundle', 'devices', 'soulever', 'reglages', 'fps', 'site', 'cuisson'];
  etapes.sort((a, b) => ordre.indexOf(a.cle) - ordre.indexOf(b.cle));
  if (!autotest) {
    try {
      const avant = JSON.parse(readFileSync(join(OUT_T, 'resume.json'), 'utf8'));
      for (const a of avant.autotests ?? []) autotests.push({ ...a, precedent: true });
    } catch { /* pas de résumé précédent */ }
  }
}

// ---- Résumé --------------------------------------------------------------------------------------------
const b0 = { OK: 0, KO: 0, ATTENTE: 0, INFO: 0 };
const md = [];
md.push('# Vérification — résumé (lot T)', '');
md.push(`${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · durée ${Math.round((Date.now() - t00) / 60000)} min · cible : ${cibleArgs[0] === '--site' ? `site ${site}` : `carte Carnet, bundle ${bundle}`}${etapes.find((x) => x.cle === 'site')?.json?.site ? ` · site construit : ${etapes.find((x) => x.cle === 'site').json.site}` : ''}${codec ? ` · H.264 décodable par ce Chromium : ${codec.decodable ? 'oui' : 'non'}` : ''}`, '');
md.push('Statuts : **OK** conforme · **KO** non conforme · **ATTENTE** élément du contrat pas encore intégré (à relancer après intégration) · **ERREUR** le script a planté.', '');
if (etapes.length) {
  md.push('| Étape | Statut | OK | KO | ATTENTE | INFO | Durée | Rapport | Journal |', '|---|---|---|---|---|---|---|---|---|');
  for (const e of etapes) {
    const b = e.json?.bilan ?? b0;
    md.push(`| ${e.titre} | **${e.statut}** | ${b.OK} | ${b.KO} | ${b.ATTENTE} | ${b.INFO} | ${e.duree} s | ${e.rapport ?? '—'} | ${e.log ?? '—'} |`);
  }
  const lignes = (statut) => etapes.flatMap((e) => (e.json?.tests ?? []).filter((t) => t.statut === statut).map((t) => `- ${e.cle}${t.ecran ? ` [${t.ecran}]` : ''} — ${t.test}${t.detail ? ` : ${String(t.detail).slice(0, 220)}` : ''}`));
  /** Un même test sur plusieurs écrans : une ligne, les écrans entre crochets. */
  const groupes = (statut) => {
    const g = new Map();
    for (const e of etapes) for (const t of (e.json?.tests ?? []).filter((x) => x.statut === statut)) {
      const k = `${e.cle}\u0000${t.test}`;
      if (!g.has(k)) g.set(k, { cle: e.cle, test: t.test, ecrans: [], details: new Set() });
      const x = g.get(k);
      if (t.ecran) x.ecrans.push(t.ecran);
      if (t.detail) x.details.add(String(t.detail).slice(0, 160));
    }
    return [...g.values()].map((x) => `- ${x.cle}${x.ecrans.length ? ` [${x.ecrans.join(', ')}]` : ''} — ${x.test}${x.details.size ? ` : ${[...x.details].slice(0, 3).join(' · ')}` : ''}`);
  };
  const ko = lignes('KO');
  md.push('', `## KO (${ko.length})`, '', ...(ko.length ? ko : ['Aucun.']));
  const nAt = etapes.reduce((n, e) => n + (e.json?.bilan?.ATTENTE ?? 0), 0);
  const at = groupes('ATTENTE');
  md.push('', `## En attente d'intégration (${nAt} tests, ${at.length} sortes)`, '', ...(at.length ? at : ['Rien.']));
  const info = groupes('INFO');
  if (info.length) md.push('', `## Mesures et limites`, '', ...info);
  const tab = etapes.find((e) => e.cle === 'devices')?.json?.tableau;
  if (tab) md.push('', '## Tous les écrans', '', tab);
}
if (autotests.length) {
  md.push('', `## Autotest du banc factice (harness/banc-soulever.html)${autotests.some((a) => a.precedent) ? ' — résultats précédents' : ''}`, '', 'Le banc imite les attributs du contrat ; chaque défaut injecté doit faire échouer le test visé, et le banc sain ne doit en faire échouer aucun.', '');
  md.push('| Script | Défaut injecté | Attendu | Résultat | Détail |', '|---|---|---|---|---|');
  for (const a of autotests) md.push(`| ${a.script} | ${a.defaut} | ${a.attendu.replace(/\|/g, '\\|')} | ${a.ok ? '✓' : '✗'} | ${a.detail.replace(/\|/g, '\\|').slice(0, 260)} |`);
}
const planches = etapes.filter((e) => e.planche).map((e) => `- ${e.titre} : ${e.planche}`);
if (planches.length) md.push('', '## Planches contact', '', ...planches);
md.push('', '## Commandes', '', ...etapes.filter((e) => /^(node|python3|tools\/) ?/.test(e.cmd ?? '') && !e.precedent).map((e) => `- \`${e.cmd}\``), '- `node scripts/verify-all.mjs` (tout, bundle frais) · `--site <dossier>` · `--autotest-seul` (matrice du banc factice)', '');
const fres = join(OUT_T, 'resume.md');
writeFileSync(fres, md.join('\n'));
writeFileSync(join(OUT_T, 'resume.json'), JSON.stringify({ date: new Date().toISOString(), bundle, site, codec, etapes: etapes.map(({ json, ...e }) => ({ ...e, bilan: json?.bilan ?? null })), autotests }, null, 2));
console.log(`\nrésumé : ${rel(fres)}`);
const echec = etapes.some((e) => e.statut === 'KO' || e.statut === 'ERREUR') || autotests.some((a) => !a.ok);
process.exit(echec ? 1 : 0);
