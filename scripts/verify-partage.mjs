// Test navigateur de la version partagée (dist/partage servi comme Cloudflare Pages, Chrome réel).
//
//   npm run verify:partage            (nice -n 19 ; un seul Chrome, contextes l'un après l'autre)
//
// Vérifie : chargeur, mauvais mot de passe, bon mot de passe, album (photos), vidéo (Range → 206), « se souvenir » et
// « oublier », mode session, lien #cle=, clé invalide, aucune violation de CSP, rien de lisible côté serveur.
// Mesure : PBKDF2 dans Chrome, ouverture du carnet, chargement d'une double page avec / sans chiffrement.
// Captures : prive/baked/apercus/partage-*.png (elles montrent des photos privées).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT, PRIVE } from './lib/prive.mjs';
import { serveSite } from './lib/serve.mjs';
import { servirPartage } from './lib/serveur-partage.mjs';
import { lireSecret } from './partage/secret.mjs';

const APERCUS = join(PRIVE, 'baked/apercus');
mkdirSync(APERCUS, { recursive: true });
const secret = lireSecret();
if (!secret || !existsSync(join(ROOT, 'dist/partage/verrou.json'))) { console.error('verify:partage : npm run build:partage d\'abord.'); process.exit(1); }

const resultats = [];
const mesures = {};
const etape = async (nom, f) => {
  try { const detail = await f(); resultats.push({ nom, ok: true, detail }); console.log(`  ok   ${nom}${detail ? ` — ${detail}` : ''}`); }
  catch (e) { resultats.push({ nom, ok: false, detail: e.message }); console.log(`  ECHEC ${nom} — ${e.message}`); }
};
const verifie = (cond, msg) => { if (!cond) throw new Error(msg); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const mediane = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const srv = await servirPartage(join(ROOT, 'dist/partage'));
const navigateur = await chromium.launch({ channel: 'chrome', headless: true });
const violations = [];
const erreursPage = [];
const surveiller = (page) => {
  page.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => erreursPage.push(String(e).slice(0, 200)));
};
const nouveauContexte = async () => navigateur.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
const carnetOuvert = (page, timeout = 30000) => page.waitForFunction(() => document.querySelector('#carnet')?.children.length > 0, null, { timeout });
const chargeurAffiche = (page, timeout = 15000) => page.waitForSelector('#forme:not([hidden])', { timeout });
const saisir = async (page, mdp, souvenir) => {
  await page.fill('#mdp', mdp);
  if (souvenir) await page.check('#souvenir');
  await page.click('#ouvrir');
};
const toutesImagesChargees = (page) => page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30000 });

try {
  // ---- 1. chargeur, mauvais mot de passe, bon mot de passe (mode session) ---------------------------------------------
  const ctx = await nouveauContexte();
  let page = await ctx.newPage();
  surveiller(page);
  await etape('chargeur affiché (page sobre, aucune donnée du carnet)', async () => {
    await page.goto(srv.url + '/');
    await chargeurAffiche(page);
    const texte = await page.evaluate(() => document.body.innerText);
    verifie(/Le carnet/.test(texte) && /Ouvrir le carnet/.test(texte) && /Se souvenir sur cet appareil/.test(texte) && /Oublier ce carnet/.test(texte), `textes : ${texte}`);
    verifie(!/Cécile|goûters/i.test(texte + (await page.title())), 'nom du carnet dans le chargeur');
    verifie((await page.evaluate(() => document.fonts.check('20px Caveat'))), 'police manuscrite non chargée');
    await page.screenshot({ path: join(APERCUS, 'partage-chargeur.png') });
  });
  await etape('mauvais mot de passe refusé, sans plantage', async () => {
    await saisir(page, 'mauvais mot de passe du tout', false);
    await page.waitForFunction(() => /pas la bonne/.test(document.getElementById('message').textContent), null, { timeout: 15000 });
    verifie(await page.isEnabled('#ouvrir'), 'bouton resté bloqué');
    verifie((await page.evaluate(() => document.querySelector('#carnet'))) === null, 'le carnet s\'est ouvert');
    await page.screenshot({ path: join(APERCUS, 'partage-mauvais-mot-de-passe.png') });
  });
  await etape('bon mot de passe (avec accents/majuscules autres) → le carnet s\'ouvre', async () => {
    const t0 = Date.now();
    await saisir(page, secret.motDePasse.toUpperCase().replace(/ /g, '  '), false);
    await carnetOuvert(page);
    mesures.ouvertureMs = Date.now() - t0;
    await pause(2500);
    const sw = await page.evaluate(() => !!navigator.serviceWorker.controller);
    verifie(sw, 'la page n\'est pas contrôlée par le service worker');
    await page.screenshot({ path: join(APERCUS, 'partage-carnet-ouvert.png') });
    return `${mesures.ouvertureMs} ms entre le clic et le carnet affiché`;
  });

  // ---- 2. album : une double avec ses photos --------------------------------------------------------------------------------
  await etape('une double de l\'album affiche ses photos réelles', async () => {
    await page.goto(srv.url + '/#cecile-1');
    await page.reload();
    await carnetOuvert(page);
    await pause(1500);
    await toutesImagesChargees(page);
    // le carnet repasse brièvement par #titre vers la 3e seconde (comportement de l'application, identique dans dist/local)
    await page.waitForFunction(() => location.hash === '#cecile-1', null, { timeout: 15000 });
    await page.waitForFunction(() => [...document.images].some((i) => /prive-baked\/photos\/cecile-1\/tirage/.test(i.currentSrc) && i.naturalWidth > 0), null, { timeout: 20000 });
    await pause(1500);
    const info = await page.evaluate(() => ({
      images: [...document.images].filter((i) => i.naturalWidth > 0).length,
      sources: [...document.images].map((i) => i.currentSrc).filter((s) => /prive-baked\/photos\//.test(s)).length,
      hash: location.hash,
    }));
    verifie(info.images >= 3, `${info.images} image(s) seulement`);
    verifie(info.sources >= 3, `${info.sources} tirage(s) réels (prive-baked/photos) dans la page`);
    verifie(srv.journal.filter((j) => /^\/[A-Za-z0-9_-]{43}$/.test(j.chemin)).length > 20, 'peu de requêtes par nom masqué');
    await page.screenshot({ path: join(APERCUS, 'partage-album-double.png') });
    return `${info.images} images décodées (dont ${info.sources} tirages réels)`;
  });

  // ---- 3. vidéo + Range ---------------------------------------------------------------------------------------------------------
  await etape('Range : 206 / Content-Range / 416 sur une vidéo chiffrée', async () => {
    const r = await page.evaluate(async () => {
      const url = 'prive-baked/videos/cecile-10.mp4';
      const tout = await fetch(url);
      const total = (await tout.arrayBuffer()).byteLength;
      const a = await fetch(url, { headers: { Range: 'bytes=0-99' } });
      const b = await fetch(url, { headers: { Range: 'bytes=100-' } });
      const c = await fetch(url, { headers: { Range: 'bytes=-50' } });
      const d = await fetch(url, { headers: { Range: `bytes=${total + 10}-` } });
      const ab = await a.arrayBuffer();
      return {
        total, type: tout.headers.get('content-type'),
        a: [a.status, a.headers.get('content-range'), ab.byteLength, [...new Uint8Array(ab.slice(4, 8))].map((x) => String.fromCharCode(x)).join('')],
        b: [b.status, b.headers.get('content-range'), (await b.arrayBuffer()).byteLength],
        c: [c.status, c.headers.get('content-range'), (await c.arrayBuffer()).byteLength],
        d: [d.status, d.headers.get('content-range')],
      };
    });
    verifie(r.type === 'video/mp4', `type ${r.type}`);
    verifie(r.a[0] === 206 && r.a[1] === `bytes 0-99/${r.total}` && r.a[2] === 100 && r.a[3] === 'ftyp', `a ${JSON.stringify(r.a)}`);
    verifie(r.b[0] === 206 && r.b[1] === `bytes 100-${r.total - 1}/${r.total}` && r.b[2] === r.total - 100, `b ${JSON.stringify(r.b)}`);
    verifie(r.c[0] === 206 && r.c[2] === 50, `c ${JSON.stringify(r.c)}`);
    verifie(r.d[0] === 416 && r.d[1] === `bytes */${r.total}`, `d ${JSON.stringify(r.d)}`);
    return `fichier de ${r.total} octets`;
  });
  await etape('une vidéo joue (balise <video>, lecture, avance, saut)', async () => {
    const r = await page.evaluate(async () => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.style.cssText = 'position:fixed;left:0;top:0;width:360px;z-index:99999';
      v.src = 'prive-baked/videos/cecile-10.mp4';
      document.body.appendChild(v);
      await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = () => ko(new Error('erreur vidéo ' + (v.error?.message ?? v.error?.code))); setTimeout(() => ko(new Error('délai')), 20000); });
      await v.play();
      await new Promise((ok) => setTimeout(ok, 1200));
      const t1 = v.currentTime;
      v.currentTime = Math.min(v.duration - 0.6, v.duration * 0.6);
      await new Promise((ok) => { v.onseeked = ok; setTimeout(ok, 5000); });
      await new Promise((ok) => setTimeout(ok, 700));
      return { w: v.videoWidth, h: v.videoHeight, duree: v.duration, t1, t2: v.currentTime };
    });
    verifie(r.w > 0 && r.h > 0, 'pas d\'image vidéo');
    verifie(r.t1 > 0.2, `la lecture n'avance pas (${r.t1})`);
    verifie(r.t2 > r.t1, `le saut a échoué (${r.t1} → ${r.t2})`);
    await page.screenshot({ path: join(APERCUS, 'partage-video.png') });
    await page.evaluate(() => document.querySelectorAll('video').forEach((v) => { if (v.style.zIndex === '99999') v.remove(); }));
    return `${r.w}×${r.h}, ${r.duree.toFixed(1)} s`;
  });

  // ---- 4. session : rechargement garde, nouvel onglet seul → chargeur ---------------------------------------------------------
  await etape('mode session : le rechargement garde le carnet ouvert', async () => {
    await page.goto(srv.url + '/#cecile-1');
    await page.reload();
    await carnetOuvert(page);
  });
  await etape('mode session : onglets fermés puis rouverts → retour au chargeur', async () => {
    await page.close();
    await pause(1500);
    page = await ctx.newPage();
    surveiller(page);
    await page.goto(srv.url + '/');
    await Promise.race([chargeurAffiche(page, 15000), carnetOuvert(page, 15000).then(() => { throw new Error('carnet resté ouvert'); })]);
  });
  await ctx.close();

  // ---- 5. se souvenir / oublier --------------------------------------------------------------------------------------------
  const ctx2 = await nouveauContexte();
  let p2 = await ctx2.newPage();
  surveiller(p2);
  await etape('« Se souvenir » : réouverture directe après fermeture de l\'onglet', async () => {
    await p2.goto(srv.url + '/');
    await chargeurAffiche(p2);
    await saisir(p2, secret.motDePasse, true);
    await carnetOuvert(p2);
    await p2.close();
    await pause(1500);
    p2 = await ctx2.newPage();
    surveiller(p2);
    await p2.goto(srv.url + '/#cecile-1');
    await carnetOuvert(p2);
    verifie(await p2.evaluate(() => document.getElementById('forme') === null), 'le chargeur est apparu');
  });
  await etape('« Oublier ce carnet » referme (lien ?oublier)', async () => {
    await p2.goto(srv.url + '/?oublier');
    await chargeurAffiche(p2);
    await p2.waitForFunction(() => /oublié/.test(document.getElementById('message').textContent), null, { timeout: 10000 });
    await p2.goto(srv.url + '/');
    await chargeurAffiche(p2);
    verifie(await p2.evaluate(() => document.querySelector('#carnet') === null), 'carnet encore ouvert');
    verifie(await p2.evaluate(async () => {
      const bd = await new Promise((ok) => { const r = indexedDB.open('gc-verrou'); r.onsuccess = () => ok(r.result); });
      const v = await new Promise((ok) => { const r = bd.transaction('cles').objectStore('cles').get('carnet'); r.onsuccess = () => ok(r.result); });
      bd.close();
      return v === undefined;
    }), 'la clé est restée dans IndexedDB');
  });
  await etape('clé enregistrée non extractable, illisible depuis la page', async () => {
    await saisir(p2, secret.motDePasse, true);
    await carnetOuvert(p2);
    const r = await p2.evaluate(async () => {
      const bd = await new Promise((ok) => { const x = indexedDB.open('gc-verrou'); x.onsuccess = () => ok(x.result); });
      const v = await new Promise((ok) => { const x = bd.transaction('cles').objectStore('cles').get('carnet'); x.onsuccess = () => ok(x.result); });
      bd.close();
      let export_ = 'refusé';
      try { await crypto.subtle.exportKey('raw', v.cle); export_ = 'exporté !'; } catch { /* attendu */ }
      return { extractable: v.cle.extractable, nomsExtractable: v.noms.extractable, usages: v.cle.usages, export_ };
    });
    verifie(!r.extractable && !r.nomsExtractable && r.export_ === 'refusé', JSON.stringify(r));
  });
  await ctx2.close();

  // ---- 6. lien secret #cle= ---------------------------------------------------------------------------------------------------
  const ctx3 = await nouveauContexte();
  const p3 = await ctx3.newPage();
  surveiller(p3);
  await etape('lien #cle= : ouvre directement et efface le fragment', async () => {
    const vues = [];
    p3.on('request', (r) => vues.push(r.url()));
    await p3.goto(`${srv.url}/#cle=${secret.cle}`);
    await carnetOuvert(p3);
    verifie(!p3.url().includes('cle='), `adresse : ${p3.url()}`);
    verifie(!vues.some((u) => u.includes(secret.cle)), 'la clé a voyagé dans une requête');
    verifie(!srv.journal.some((j) => j.chemin.includes(secret.cle)), 'le serveur a vu la clé');
    await p3.reload();
    await carnetOuvert(p3);
    await p3.screenshot({ path: join(APERCUS, 'partage-lien-cle.png') });
  });
  await ctx3.close();

  const ctx4 = await nouveauContexte();
  const p4 = await ctx4.newPage();
  surveiller(p4);
  await etape('lien #cle= invalide (carnet révoqué) : message clair, retour au chargeur', async () => {
    await p4.goto(`${srv.url}/#cle=${'A'.repeat(43)}`);
    await chargeurAffiche(p4);
    await p4.waitForFunction(() => /introuvable ou a changé/.test(document.getElementById('message').textContent), null, { timeout: 10000 });
  });
  await ctx4.close();

  // ---- 7. rien de lisible côté serveur, CSP --------------------------------------------------------------------------------------
  await etape('le serveur n\'a vu que des noms masqués et les fichiers du chargeur', async () => {
    const autorises = /^\/($|[A-Za-z0-9_-]{43}$|ouvrir\.js$|sw\.js$|verrou\.json$|favicon\.svg$|police\.woff2$|\?oublier)/;
    const hors = [...new Set(srv.journal.map((j) => j.chemin))].filter((c) => !autorises.test(c));
    verifie(!hors.length, `chemins lisibles vus : ${hors.slice(0, 5).join(', ')}`);
    const n404 = srv.journal.filter((j) => j.statut === 404).length;
    return `${new Set(srv.journal.map((j) => j.chemin)).size} chemins distincts, ${n404} réponse(s) 404`;
  });
  await etape('aucune violation de CSP ni erreur de page', async () => {
    verifie(!violations.length, violations.slice(0, 3).join(' | '));
    verifie(!erreursPage.length, erreursPage.slice(0, 3).join(' | '));
  });

  // ---- mesures --------------------------------------------------------------------------------------------------------------------
  const ctxM = await nouveauContexte();
  const pm = await ctxM.newPage();
  await pm.goto(srv.url + '/');
  const pbkdf = [];
  for (let i = 0; i < 5; i++) {
    pbkdf.push(await pm.evaluate(async () => {
      const t = performance.now();
      const b = await crypto.subtle.importKey('raw', new TextEncoder().encode('essai'), 'PBKDF2', false, ['deriveKey']);
      await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(16), iterations: 600000 }, b, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      return performance.now() - t;
    }));
  }
  mesures.pbkdf2Ms = Math.round(mediane(pbkdf));
  const dechiffrement = await pm.evaluate(async () => {
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const clair = new Uint8Array(1 << 20);
    const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, k, clair);
    const t = performance.now();
    for (let i = 0; i < 20; i++) await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, k, c);
    return (performance.now() - t) / 20;
  });
  mesures.aesMsParMo = Math.round(dechiffrement * 100) / 100;
  await ctxM.close();

  // Chargement d'une double : avec chiffrement (service worker) et sans (dist/local servi tel quel). Contextes neufs.
  const mesurerDouble = async (url, deverrouiller) => {
    const c = await nouveauContexte();
    const p = await c.newPage();
    await p.goto(url);
    if (deverrouiller) { await chargeurAffiche(p); await saisir(p, secret.motDePasse, false); }
    await carnetOuvert(p);
    await pause(3000);
    const sorties = [];
    for (const id of ['cecile-1', 'cecile-2', 'cecile-3', 'cecile-4', 'cecile-5']) {
      // délai entre le changement de double et l'arrivée de la dernière ressource demandée, d'après Resource Timing
      sorties.push(await p.evaluate(async (h) => {
        const t0 = performance.now();
        location.hash = h;
        await new Promise((ok) => setTimeout(ok, 3500));
        const e = performance.getEntriesByType('resource').filter((r) => r.startTime >= t0);
        return { ressources: e.length, dernierMs: Math.round(Math.max(0, ...e.map((r) => r.responseEnd)) - t0), cumuleMs: Math.round(e.reduce((a, r) => a + (r.responseEnd - r.startTime), 0)) };
      }, `#${id}`));
    }
    await c.close();
    return sorties;
  };
  const local = await serveSite(join(ROOT, 'dist/local'));
  mesures.doubleClairMs = await mesurerDouble(local.url + '/', false);
  await local.close();
  mesures.doubleChiffreeMs = await mesurerDouble(srv.url + '/', true);
} finally {
  await navigateur.close();
  await srv.close();
}

const echecs = resultats.filter((r) => !r.ok);
console.log(`\nmesures : ${JSON.stringify(mesures)}`);
console.log(`\nverify:partage : ${resultats.length - echecs.length}/${resultats.length} étapes réussies.`);
process.exit(echecs.length ? 1 : 0);
void readFileSync;
