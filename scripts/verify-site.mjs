// Le site construit (vite build), servi comme sur GitHub Pages par scripts/lib/serve.mjs (mode site,
// Range) : iPhone 13 debout, ordinateur 1440 × 900, TV 1080p par défaut.
//
// Sur le dossier :
//   - index.html présent ; JavaScript total ≤ 3 Mo ;
//   - chaque mp4 : ≤ 2 Mo, « +faststart » (moov avant mdat), H.264 (+ AAC ou muet) si ffprobe est là ;
//   - encre ×4 de la loupe (pages/4x/**, plan v4 § 13.4) : chaque tuile de l'inventaire est publiée avec
//     le site (même taille, référencée par le JavaScript), et absente de l'artifact du design system
//     (inventaire de la cible artifact, dist/artifact/assets.json, bundle de l'artifact) ;
// Par HTTP : un mp4 demandé avec « Range: bytes=0-1 » → 206, Content-Range, video/mp4, Accept-Ranges.
// Dans le navigateur, pour chaque lien (--liens, défaut lisa,julie) et chaque écran :
//   - #<lien> ouvre la bonne double page (en cadrage « page » : la page vidéo, à gauche), l'URL le garde ;
//   - photo collée sur la page vidéo ; les requêtes de la vidéo [data-gc-video] reçoivent des 206 ;
//   - images des pages cuites décodées ; aucune 404, aucune requête en échec, aucune erreur console.
// Ce qui n'existe pas encore dans le site (Lisa, mp4, photo) est ATTENTE.
//
//   node scripts/verify-site.mjs [--site dist/site] [--base /gouters-de-cecile/] [--liens lisa,julie]
//        [--only iphone13-paysage,ordi-1440,tv-1080] [--out verification/out/t/site]
//   node scripts/verify-site.mjs --build [--build-out verification/out/t/site-build] [--gen]
//        (vite build dans un dossier à part ; --gen régénère d'abord src/generated/ : gen-entry --target site)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { inventory, siteSeulement } from './assets.mjs';
import { spawnSync } from 'node:child_process';
import {
  ROOT, lireArgs, ecrans, lancer, serveSite, Rapport, etatLivre, rectDe, existe, capture, surveiller, attendrePret,
  instrumenterGeste, contexte, atomesMp4, planche, rel, tactile, toucher, attendreAttr, plays,
} from './lib/verif.mjs';

const { opt, drapeau, liste } = lireArgs();
const out = resolve(ROOT, opt('out', 'verification/out/t/site'));
const liens = liste('liens', 'lisa,julie');
const base = opt('base', '/');
let dossier = resolve(ROOT, opt('site', 'dist/site'));
const R = new Rapport('site', { dir: out });

// ---- Construction (facultative) ------------------------------------------------------------------
if (drapeau('build')) {
  dossier = resolve(ROOT, opt('build-out', 'verification/out/t/site-build'));
  console.log(`■ Construction du site → ${rel(dossier)}`);
  // --gen : régénère d'abord src/generated (gen-entry --target site) ; sans lui, on construit avec les
  // registres présents (src/app/main.tsx résout les images quelle que soit la cible générée).
  const g = drapeau('gen') ? spawnSync(process.execPath, ['scripts/gen-entry.mjs', '--target', 'site'], { cwd: ROOT, encoding: 'utf8' }) : { status: 0 };
  const v = g.status === 0 && spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', dossier, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, encoding: 'utf8' });
  const ok = g.status === 0 && v?.status === 0;
  R.ok(null, 'vite build', ok, ok ? rel(dossier) : `${(g.stderr || v?.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
  if (!ok) { R.ecrire(); process.exit(1); }
}
R.meta.site = rel(dossier);
R.meta.base = base;
console.log(`■ Site ${rel(dossier)} (base ${base})`);

// ---- Le dossier ------------------------------------------------------------------------------------
const fichiers = [];
const parcourir = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) parcourir(f); else fichiers.push(f); } };
if (!existsSync(join(dossier, 'index.html'))) {
  R.ajouter(null, 'index.html présent', 'KO', `${rel(dossier)}/index.html introuvable (vite build ?)`);
  R.ecrire();
  process.exit(1);
}
parcourir(dossier);
const js = fichiers.filter((f) => f.endsWith('.js'));
const octetsJs = js.reduce((s, f) => s + statSync(f).size, 0);
R.ok(null, 'JavaScript total ≤ 3 Mo', octetsJs <= 3 * 1024 * 1024, `${(octetsJs / 1024).toFixed(0)} Ko en ${js.length} fichier(s)`);
const texteJs = js.map((f) => readFileSync(f, 'utf8')).join('\n');
const lienPresent = (l) => new RegExp(`["'\`/#-]${l}["'\`]`, 'i').test(texteJs) || new RegExp(`["'\`]p\\d+-${l}["'\`]`, 'i').test(texteJs);
const mp4 = fichiers.filter((f) => /\.(mp4|m4v)$/i.test(f));
if (!mp4.length) R.attente(null, 'vidéos mp4 dans le site', 'aucun mp4 : à relancer après le lot V et l\'intégration');
const ffprobe = spawnSync('ffprobe', ['-version']).status === 0;
for (const f of mp4) {
  const a = atomesMp4(f);
  R.ok(null, `${relative(dossier, f)} : ≤ 2 Mo`, a.octets <= 2 * 1024 * 1024, `${(a.octets / 1024).toFixed(0)} Ko`);
  R.ok(null, `${relative(dossier, f)} : +faststart (moov avant mdat)`, a.faststart, a.atomes.join(' '));
  if (ffprobe) {
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,width,height', '-of', 'json', f], { encoding: 'utf8' });
    const st = JSON.parse(p.stdout || '{"streams":[]}').streams;
    const v = st.find((s) => s.codec_type === 'video');
    const au = st.find((s) => s.codec_type === 'audio');
    R.ok(null, `${relative(dossier, f)} : H.264${au ? ' + AAC' : ' (muet)'}`, v?.codec_name === 'h264' && (!au || au.codec_name === 'aac'), `${v?.codec_name ?? '?'} ${v?.profile ?? ''} ${v?.width ?? '?'}×${v?.height ?? '?'}${au ? ` · ${au.codec_name}` : ''}`);
  }
}

// ---- Encre ×4 de la loupe, sons : sur le site, jamais dans l'artifact ------------------------------------
{
  const tout = inventory({ cible: 'site' });
  const tuiles = Object.entries(tout).filter(([n]) => /^pages\/4x\//.test(n));
  R.ok(null, 'règle « site seulement » : vidéos, sons et pages/4x/**, rien d\'autre', siteSeulement('pages/4x/julie-gauche-01', 'image/webp') && siteSeulement('videos/julie', 'video/mp4') && siteSeulement('sons/page-1', 'audio/mpeg') && !siteSeulement('pages/julie-gauche', 'image/webp') && !siteSeulement('pages/1x/julie-gauche', 'image/webp'));
  const sons = Object.keys(tout).filter((n) => /^sons\//.test(n));
  R.ok(null, 'sons du livre inventoriés (sons/<fichier>, audio/mpeg), hors de l\'artifact', sons.every((n) => tout[n].type === 'audio/mpeg' && tout[n].site) && !Object.keys(inventory({ cible: 'artifact' })).some((n) => /^sons\//.test(n)), `${sons.length} sons`);
  const artifact = Object.keys(inventory({ cible: 'artifact' }));
  R.ok(null, 'artifact : l\'inventaire de la cible artifact n\'a ni tuile ×4 ni vidéo', !artifact.some((n) => siteSeulement(n, tout[n]?.type)), `${artifact.length} images à téléverser`);
  const listeArtifact = join(ROOT, 'dist/artifact/assets.json');
  if (existsSync(listeArtifact)) {
    const noms = Object.keys(JSON.parse(readFileSync(listeArtifact, 'utf8')));
    R.ok(null, 'artifact : dist/artifact/assets.json sans tuile ×4', !noms.some((n) => /^pages\/4x\//.test(n)), `${noms.length} images`);
  } else R.info(null, 'artifact : dist/artifact/assets.json', 'absent (node scripts/build-artifact.mjs)');
  const bundleArtifact = join(ROOT, 'dist/artifact/project/components/bundle.js');
  if (existsSync(bundleArtifact)) {
    const b = readFileSync(bundleArtifact, 'utf8');
    if (/\/_blob\//.test(b)) R.ok(null, 'artifact : bundle.js ne référence aucune tuile ×4', !/["'`]pages\/4x\//.test(b));
    else R.info(null, 'artifact : bundle.js', 'construit pour une autre cible que l\'artifact (pas de /_blob/) : non jugé');
  }
  if (!tuiles.length) R.attente(null, 'encre ×4 (pages/4x/**) dans le site', 'aucune tuile cuite : à relancer après le lot P');
  else {
    // Vite déduplique les images identiques (notamment les tuiles sans encre). Leur nom de sortie
    // peut donc être celui d'une autre page : vérifier leur contenu, pas une copie par nom logique.
    const publies = new Set(fichiers.filter((f) => f.endsWith('.webp')).map((f) =>
      createHash('sha256').update(readFileSync(f)).digest('hex')));
    const manquent = tuiles.filter(([, a]) => !publies.has(a.sha)).map(([n]) => n);
    R.ok(null, `encre ×4 : ${tuiles.length} tuiles publiées avec le site (SHA-256, déduplication permise)`, !manquent.length, manquent.slice(0, 6).join(', '));
    R.ok(null, 'encre ×4 : référencée par le JavaScript du site', /baked\/pages\/4x\//.test(texteJs));
  }
}

// ---- HTTP : Range ------------------------------------------------------------------------------------
const srv = await serveSite(dossier, { base });
if (mp4.length) {
  const chemin = relative(dossier, mp4[0]).split('\\').join('/');
  const url = `${srv.url}/${chemin}`;
  const r = await fetch(url, { headers: { Range: 'bytes=0-1' } });
  const corps = Buffer.from(await r.arrayBuffer());
  const taille = statSync(mp4[0]).size;
  R.ok(null, `mp4 servi en 206 (Range: bytes=0-1) — ${chemin}`, r.status === 206 && r.headers.get('content-range') === `bytes 0-1/${taille}` && corps.length === 2 && /video\/mp4/.test(r.headers.get('content-type') ?? '') && r.headers.get('accept-ranges') === 'bytes',
    `${r.status} · ${r.headers.get('content-range')} · ${r.headers.get('content-type')} · accept-ranges ${r.headers.get('accept-ranges')}`);
}

// ---- Navigateur -----------------------------------------------------------------------------------
const browser = await lancer();
// (téléphone couché : debout, le carnet reste fermé et invite à tourner le téléphone)
for (const e of ecrans(liste('only', 'iphone13-paysage,ordi-1440,tv-1080'))) {
  console.log(`\n■ ${e.titre}`);
  for (const l of liens) {
    const ctx = await contexte(browser, e);
    await instrumenterGeste(ctx);
    const page = await ctx.newPage();
    const surv = surveiller(page);
    try {
      await page.goto(`${srv.url}/index.html#${l}`);
      const err = await attendrePret(page).catch((x) => `page jamais prête : ${String(x).split('\n')[0]}`);
      if (err) surv.erreurs.push(err);
      await page.waitForTimeout(1500);
      const s = await etatLivre(page);
      const trouve = s.double >= 0 && s.spreads.some((id) => id.toLowerCase() === l || id.toLowerCase().endsWith(`-${l}`));
      if (!trouve && !lienPresent(l)) R.attente(e.nom, `#${l} ouvre sa double page`, `« ${l} » absent du site : à relancer après intégration`);
      else R.ok(e.nom, `#${l} ouvre sa double page${s.cadrage === 'page' ? ' (page vidéo, à gauche)' : ''}`, trouve && s.hash === `#${l}` && (s.cadrage !== 'page' || s.cote === 'gauche'), `double ${s.double}, ${s.spreads.join(', ') || 'couverture'}, ${s.cadrage}${s.cadrage === 'page' ? ` ${s.cote}` : ''}, URL ${s.hash}`);
      // Photo et vidéo
      if (trouve) {
        const ph = await rectDe(page, '.gc-livre__page--visible [data-gc-objet="photo"]');
        if (ph?.visible) R.ok(e.nom, `#${l} : photo collée sur la page vidéo`, true, `${Math.round(ph.w)}×${Math.round(ph.h)}`);
        // Soulever est monté globalement, même sur les frontispices sans photo ni clip.
        // Exiger une photo sur les pages qui ont réellement une vidéo publiée.
        else if (inventory({ cible: 'site' })[`videos/${l}`]) R.ajouter(e.nom, `#${l} : photo collée sur la page vidéo`, 'KO', 'clip publié pour cette page, photo absente');
        else R.info(e.nom, `#${l} : page sans photo vidéo`, 'aucun clip attendu pour cette page');
      }
      const lireVideo = () => page.evaluate(() => { const x = document.querySelector('[data-gc-video]'); return x ? { src: x.currentSrc || x.src || x.querySelector('source')?.src || '', preload: x.preload } : null; });
      let v = await lireVideo();
      // Sans src au repos : on soulève la photo (toucher, ou Entrée), la vidéo est alors demandée.
      const ph2 = trouve && !(v?.src) ? await rectDe(page, '.gc-livre__page--visible [data-gc-objet="photo"]') : null;
      if (ph2?.visible) {
        if (tactile(e)) await toucher(page, ph2.cx, ph2.cy); else await page.keyboard.press('Enter');
        const o = await attendreAttr(page, '[data-gc-soulever]', 'data-gc-soulever', 'ouvert', 8000);
        await page.waitForTimeout(1500);
        v = await lireVideo();
        const p = await plays(page);
        R.ok(e.nom, `#${l} : photo soulevée, play() dans le geste`, o && p.length > 0 && p[0].dansGeste, p.length ? `${p[0].dansGeste ? 'dans' : 'HORS'} le geste (${p[0].geste ?? 'aucun'}) · ${p[0].src} · ${p[0].resultat}` : o ? 'aucun play()' : 'ne se soulève pas');
        R.capturer(await capture(page, `site-${e.nom}-${l}-souleve`, out), `${e.titre} — site #${l}, photo soulevée`);
        await page.keyboard.press('Escape');
        await attendreAttr(page, '[data-gc-soulever]', 'data-gc-soulever', 'ferme', 8000);
      }
      if (v?.src && /\.(mp4|m4v)/i.test(v.src)) {
        const vus = surv.medias.filter((m) => /\.(mp4|m4v)/i.test(m.url));
        if (vus.length) R.ok(e.nom, `#${l} : requêtes de la vidéo en 206`, vus.every((m) => m.statut === 206 || (m.statut === 200 && !m.range)) && vus.some((m) => m.statut === 206), vus.slice(0, 4).map((m) => `${m.statut} ${m.url}${m.range ? ` (${m.range})` : ''}`).join(', '));
        else {
          const st = await page.evaluate(async (u) => { const r = await fetch(u, { headers: { Range: 'bytes=0-1' } }); return r.status; }, v.src);
          R.ok(e.nom, `#${l} : vidéo (preload ${v.preload}) demandée avec Range → 206`, st === 206, `${st} ${v.src.split('/').pop()}`);
        }
      } else if (v) R.info(e.nom, `#${l} : vidéo unique`, `src ${v.src || 'vide'}${mp4.length ? '' : ' (pas encore de mp4)'}`);
      // Images des pages cuites
      const imgs = await page.evaluate(async () => {
        const els = [...document.querySelectorAll('.gc-page-cuite img, [data-gc-objet] img')];
        await Promise.all(els.map((i) => (i.decode ? i.decode().catch(() => null) : null)));
        return els.map((i) => ({ src: i.src.split('/').pop(), ok: i.complete && i.naturalWidth > 0 }));
      });
      const ko = imgs.filter((i) => !i.ok);
      if (!imgs.length) R.info(e.nom, `#${l} : images des pages`, 'aucune image de page cuite (site construit avant les pages cuites ?)');
      else R.ok(e.nom, `#${l} : images des pages décodées`, !ko.length, ko.length ? ko.slice(0, 4).map((i) => i.src).join(', ') : `${imgs.length} images`);
      R.capturer(await capture(page, `site-${e.nom}-${l}`, out), `${e.titre} — site #${l}`);
      const reseau = [...surv.reponses, ...surv.echecs];
      R.ok(e.nom, `#${l} : aucune 404 ni requête en échec`, !reseau.length, reseau.slice(0, 4).join(' | '));
      R.ok(e.nom, `#${l} : aucune erreur console ni exception`, !surv.erreurs.length, surv.erreurs.slice(0, 3).join(' | '));
    } catch (x) {
      R.ajouter(e.nom, `#${l} : exécution`, 'KO', `plantage : ${String(x).split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
}
await browser.close();
const s206 = srv.journal.filter((j) => j.statut === 206).length;
const s404 = srv.journal.filter((j) => j.statut === 404).map((j) => j.chemin);
R.info(null, 'journal du serveur', `${srv.journal.length} requêtes · 206 : ${s206} · 404 : ${s404.length}${s404.length ? ` (${[...new Set(s404)].slice(0, 5).join(', ')})` : ''}`);
await srv.close();
const pl = planche(R.captures, join(out, 'planche-site.png'), { titre: `Site construit — ${rel(dossier)}`, colonnes: 3 });
R.ecrire({ planche: pl ? rel(pl) : null });
process.exit(R.code());
