// Médias de la VERSION LOCALE : cuit les vraies photos et vidéos de prive/ (jamais publiées) vers
// prive/baked/, avec les mêmes fonctions de rendu que le site public (tirage sépia, coins photo ou scotch,
// affiche, montage 720p ≤ 2 Mo : scripts/bake-videos.mjs et scripts/bake-photos-cecile.py).
//
//   npm run medias:local                        tout cuire (ce qui n'a pas changé est gardé : cache par sha256)
//   npm run medias:local -- --only lisa,julien  seulement ces invités (« cecile » : l'album ; les autres gardent leur entrée)
//   npm run medias:local -- --force             tout recuire
//   npm run medias:local -- --sans-cecile | --sans-invites
//   npm run medias:planche                      planche contact de prive/cecile → prive/baked/planche-cecile.png
//   GC_PRIVE=<dossier>                          autre dossier que prive/ (essais) · GC_PYTHON, GC_FFMPEG, GC_FFPROBE, GC_CHROME
//
// Entrées (prive/ est ignoré par git ; voir prive/LISEZMOI.md et prive/cecile/LISEZMOI.md)
//   prive/cecile/photos/, prive/cecile/videos/, prive/cecile/choix.json     album de Cécile
//       { "cecile-1": { "fichier": "petite.jpeg", "video"?: "VID_0001.mp4", "montage"?: [segments] }, … }
//       Aucun rognage : chaque tirage garde le ratio exact de sa photo ou de sa vidéo (paysage, carré, 3:4, 9:16…).
//       Les photos sont cuites par scripts/bake-local-cecile.py. Un emplacement avec `video` est cuit ici : montage
//       720p (vertical 720×1280 si la vidéo est verticale), 12 s au plus, ou sa durée réelle si elle est plus courte
//       (ni boucle ni ralenti), affiche, et sans `fichier` un tirage qui est la 1re image de la vidéo.
//   prive/<slug>/videos/*   vidéos de l'invité (slugs de src/content/roster.json). S'il y en a une : montage de 12 s,
//                           par défaut un plan pris au milieu de la première vidéo (plus court que 12 s : ralenti
//                           léger ou plan répété en fondu enchaîné).
//   prive/<slug>/montage.json  (facultatif) choix des plans, même format que les segments de bake-videos.mjs :
//                           { "segments": [ { "fichier": "film.mov", "de": 4, "a": 11.5, "x": 0.5, "y": 0.3,
//                                             "z": 1, "lenteur": 1 }, … ], "angle": -2 }
//                           `fichier` : nom dans prive/<slug>/videos/ (défaut : la première) ; x, y : position du cadre
//                           dans la vidéo (0 à 1, y petit = plus haut : utile pour une vidéo prise en portrait) ;
//                           z : zoom ≥ 1 ; `de`, `a` en secondes ; plusieurs plans s'enchaînent en fondu.
//   prive/<slug>/photos/*   sans vidéo : « mode photo seule » : vidéo de 12 s faite d'un lent zoom (effet Ken Burns)
//                           sur la première photo, avec le même tirage et la même affiche. Même montage.json
//                           possible, avec un seul segment { "x", "y" } pour placer le cadre.
//   Ni vidéo ni photo : rien (le site garde le placeholder de l'invité).
//
// Sorties (prive/baked/, jamais design-system/baked ni src/content : suivis par git)
//   videos/<id>.mp4, videos/<id>-affiche.webp, photos/<id>/{tirage,coins}.webp   (id : slug d'invité ou cecile-N)
//   videos.json, photos-cecile.json   équivalents locaux de src/content/videos.json et photos-cecile.json,
//                                     superposés aux placeholders par `npm run build:local` (GC_LOCAL=1)
//   .cache-invites.json               cache : sha256 des originaux + paramètres + code de rendu
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { launch } from './lib/browser.mjs';
import { hash } from './lib/prng.mjs';
import {
  ROOT, PRIVE, BAKED_LOCAL, EXT_PHOTOS, EXT_VIDEOS, listerMedias, sha256Fichier,
} from './lib/prive.mjs';
import {
  FFMPEG, V, T, INVITES, avecFormat, filtrePlan, encoderGraphe, encoderVideo, premiereImage, webp, tirageSepia,
  cadreTirage, svgMaintien, rendreSvg, empreintesCode, f5,
} from './bake-videos.mjs';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const oi = args.indexOf('--only');
const ONLY = oi >= 0 ? args[oi + 1].split(',') : null;
/** Faut-il (re)cuire cet identifiant (slug d'invité, ou cecile-N / « cecile » pour tout l'album) ? */
const vise = (id) => !ONLY || ONLY.includes(id) || (id.startsWith('cecile-') && ONLY.includes('cecile'));

const FFPROBE = process.env.GC_FFPROBE || FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const VENV = join(ROOT, 'tools/ecriture/.venv/bin/python');
const PYTHON = process.env.GC_PYTHON || (existsSync(VENV) ? VENV : 'python3');
const SCRIPT_CECILE = join(ROOT, 'scripts/bake-local-cecile.py');
const CACHE = join(BAKED_LOCAL, '.cache-invites.json');
const CONTENU = join(BAKED_LOCAL, 'videos.json');
const CONTENU_PHOTOS = join(BAKED_LOCAL, 'photos-cecile.json');
const CONVERTIS = join(BAKED_LOCAL, '.convertis');
const CHOIX = join(PRIVE, 'cecile/choix.json');
const D_CECILE_VIDEOS = join(PRIVE, 'cecile/videos');
const VERSION_FFMPEG = execFileSync(FFMPEG, ['-version']).toString().split('\n')[0];

/** Zoom lent du mode photo seule : l'image grossit de 14 % en 12 s ; le tirage et l'affiche sont l'image de départ. */
const KEN_BURNS = { zoom: 0.14, echelle: 4 };
const COULEUR_DEFAUT = { saturation: 0.95, u: -1, v: 1 };
/** Inclinaisons des tirages de l'album (les mêmes que scripts/bake-local-cecile.py). */
const ANGLES = [-3, 2, -1.5, 2.5, -2.5, 1.2, 3, -1, 2, -3];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const empreinte = (o) => sha256(JSON.stringify(o));
const nfc = (s) => s.normalize('NFC').toLowerCase();
const lireJson = (f, defaut) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : defaut);
const numero = (id) => Number(id.replace(/\D/g, '')) || 0;

function python(argv, { silencieux = false } = {}) {
  const r = spawnSync(PYTHON, ['-I', SCRIPT_CECILE, ...argv], {
    stdio: silencieux ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8',
    env: { ...process.env, GC_PRIVE: PRIVE, GC_FFMPEG: FFMPEG },
  });
  if (r.status !== 0) throw new Error(`${PYTHON} ${argv[0]} a échoué (${r.status}). Pillow et NumPy sont nécessaires (tools/ecriture/.venv, ou GC_PYTHON).`);
  return r.stdout;
}

// ---------------------------------------------------------------------------------------------
// Montages

/** Durée (s) et orientation d'affichage (rotation des vidéos de téléphone comprise) d'une vidéo. */
function sonde(chemin) {
  const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'format=duration:stream=width,height,duration:stream_side_data=rotation:stream_tags=rotate', '-of', 'json', chemin]).toString());
  const st = j.streams?.[0] ?? {};
  const dur = parseFloat(j.format?.duration ?? st.duration);
  if (!(dur > 0)) throw new Error(`durée illisible : ${chemin}`);
  const rot = Math.abs(Number(st.side_data_list?.find((d) => d.rotation != null)?.rotation ?? st.tags?.rotate ?? 0)) % 180;
  const [w, h] = rot === 90 ? [st.height, st.width] : [st.width, st.height];
  return { duree: dur, w, h, orientation: h > w ? 'portrait' : 'paysage' };
}
const dureeVideo = (chemin) => sonde(chemin).duree;

/** Vidéo montée à son ratio d'origine : grand côté 1280 px (720p), dimensions paires (H.264). */
function dimsVideo(w, h) {
  const pair = (n) => Math.max(2, 2 * Math.round(n / 2));
  return w >= h ? { w: 1280, h: pair((1280 * h) / w) } : { w: pair((1280 * w) / h), h: 1280 };
}
/** Photo du tirage au ratio w / h, grand côté 1080 px (comme bake-local-cecile.py), aucun rognage. */
function dimsTirage(w, h) {
  return w >= h ? { pw: 1080, ph: Math.max(1, Math.round((1080 * h) / w)) } : { pw: Math.max(1, Math.round((1080 * w) / h)), ph: 1080 };
}
/** Zoom du cadre du tirage dans le cadre vidéo pour que la photo montre toute la vidéo (rognage < 0,2 %, arrondis des pixels). */
const zoomPlein = (v, t) => Math.max(t.pw / v.w, t.ph / v.h);
const orientationDe = (pw, ph) => (Math.abs(pw - ph) <= 2 ? 'carre' : ph > pw ? 'portrait' : 'paysage');

/** Retrouve un fichier par son nom dans une liste (accents NFC/NFD, casse, extension facultative). */
function trouver(demande, noms) {
  const d = nfc(demande);
  return noms.find((n) => nfc(n) === d) ?? (() => {
    const c = noms.filter((n) => nfc(n.replace(/\.[^.]+$/, '')) === d);
    return c.length === 1 ? c[0] : undefined;
  })();
}

/**
 * Plans par défaut d'une vidéo : 12,3 s pris au milieu (la coupe à 12 s garde une marge de sécurité).
 * `court` (album de Cécile) : une vidéo plus courte garde sa durée réelle, sans ralenti ni répétition ;
 * sinon elle est ralentie un peu (≥ 8 s) ou répétée en fondu enchaîné pour atteindre 12 s.
 */
function plansParDefaut(fichier, { court = false } = {}) {
  const dur = dureeVideo(fichier);
  const voulu = V.duree + 0.3;
  if (dur >= voulu) {
    const de = (dur - voulu) / 2;
    return [{ fichier, de: +de.toFixed(3), a: +(de + voulu).toFixed(3) }];
  }
  if (court) return [{ fichier, de: 0, a: +dur.toFixed(3) }];
  if (dur >= 8) return [{ fichier, de: 0, a: +dur.toFixed(3), lenteur: +(voulu / dur).toFixed(4) }]; // ralenti léger
  // Trop courte : le plan est répété (fondu enchaîné de V.fondu entre deux), ralenti si moins de 2 s.
  const lenteur = dur < 2 ? Math.min(3, 2 / dur) : 1;
  const d = dur * lenteur;
  const n = Math.ceil((voulu - V.fondu) / (d - V.fondu));
  if (n > 8) throw new Error(`vidéo trop courte (${dur.toFixed(1)} s) : ${fichier}`);
  return Array.from({ length: n }, () => ({ fichier, de: 0, a: +dur.toFixed(3), lenteur }));
}

/** Segments de montage.json (objet { segments } ou tableau) → plans {fichier, de, a, x, y, z, lenteur}. */
function plansDeMontage(montage, dossierVideos, noms) {
  const liste = Array.isArray(montage) ? montage : montage.segments;
  if (!Array.isArray(liste) || !liste.length) throw new Error('montage : « segments » doit être une liste non vide');
  return liste.map((s, k) => {
    const demande = s.fichier ?? s.clip;
    const nom = demande ? trouver(demande, noms) : noms[0];
    if (!nom) throw new Error(`montage : segment ${k + 1} : « ${demande ?? '(aucune vidéo)'} » introuvable dans ${dossierVideos} (présent : ${noms.join(', ') || 'rien'})`);
    const fichier = join(dossierVideos, nom);
    const dur = dureeVideo(fichier);
    const de = Number(s.de ?? 0);
    const a = Number(s.a ?? dur);
    if (!(de >= 0 && a > de)) throw new Error(`montage : segment ${k + 1} : de=${s.de} a=${s.a} incohérents`);
    return { fichier, de, a: Math.min(a, dur), ...(s.x != null && { x: s.x }), ...(s.y != null && { y: s.y }), ...(s.z != null && { z: s.z }), ...(s.lenteur != null && { lenteur: s.lenteur }) };
  });
}

/** Photo d'invité prête pour ffmpeg (orientation EXIF, HEIC converti, ≤ 4000 px) : JPEG dans prive/baked/.convertis/. */
function photoNormalisee(chemin, sha) {
  const sortie = join(CONVERTIS, `${sha.slice(0, 24)}-invite.jpg`);
  if (!existsSync(sortie)) {
    mkdirSync(CONVERTIS, { recursive: true });
    python(['normaliser', chemin, sortie], { silencieux: true });
  }
  return sortie;
}

/** Vidéo de 12 s en mode photo seule : lent zoom sur l'image (zoompan sur une image agrandie 4×, sans à-coup). */
function encoderPhotoSeule(id, photo, seg, couleur, sortie) {
  const { saturation = 1, gamma = 1, contraste = 1, u = 0, v = 0 } = couleur;
  const [x, y] = [seg.x ?? 0.5, seg.y ?? 0.5];
  const W = V.w * KEN_BURNS.echelle, H = V.h * KEN_BURNS.echelle;
  const n = V.duree * V.fps;
  const fc =
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}:(iw-${W})*${x}:(ih-${H})*${y},setsar=1,format=yuv420p,` +
    `eq=saturation=${saturation}:gamma=${gamma}:contrast=${contraste},lutyuv=u=val${u >= 0 ? '+' : ''}${u}:v=val${v >= 0 ? '+' : ''}${v},` +
    `zoompan=z='1+${KEN_BURNS.zoom}*on/${n - 1}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${n}:s=${V.w}x${V.h}:fps=${V.fps},setsar=1,format=yuv420p[v]`;
  return encoderGraphe(id, ['-i', photo], fc, 1, sortie);
}

async function lancerNavigateur() {
  try {
    return await launch();
  } catch (e) {
    const candidats = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    ];
    const trouve = candidats.find((p) => existsSync(p));
    if (!trouve) throw new Error(`${e.message.split('\n')[0]}\nAucun Chrome/Chromium trouvé : installe-le, ou indique GC_CHROME=<exécutable>.`);
    return chromium.launch({ executablePath: trouve });
  }
}

/** État partagé : cache, navigateur (lancé à la demande, pour les coins). */
function contexte() {
  let navigateur = null, page = null;
  return {
    cache: lireJson(CACHE, {}),
    async page() {
      if (!page) {
        navigateur = await lancerNavigateur();
        page = await navigateur.newPage();
        await page.setContent('<!doctype html><body style="margin:0"></body>');
      }
      return page;
    },
    async fermer() { if (navigateur) await navigateur.close(); },
  };
}

/** Zone du cadre vidéo montrée par une photo de pw × ph px (le plus grand rectangle de cette proportion), en fractions. */
function cadreGeneral(vw, vh, pw, ph, x = 0.5, y = 0.5) {
  const [cw, ch] = vw / vh < pw / ph ? [vw, (vw * ph) / pw] : [(vh * pw) / ph, vh];
  return [((vw - cw) * x) / vw, ((vh - ch) * y) / vh, cw / vw, ch / vh].map(f5);
}

/** Entrée de videos.json (même forme que celle de bake-videos.mjs, sans crédit : médias personnels). Sous avecFormat(). */
function entreeContenu({ id, titre, duree, inv, mode, tirage, coins, cadreVideo }) {
  return {
    titre,
    duree,
    video: `local/videos/${id}`,
    affiche: `local/videos/${id}-affiche`,
    tirage: tirage ?? `local/photos/${id}/tirage`,
    coins: coins ?? `local/photos/${id}/coins`,
    angle: inv.angle,
    maintien: inv.maintien.type === 'scotch' ? 'scotch' : `coins-${inv.maintien.papier}`,
    mode,
    geometrie: {
      taille: [T.cw, T.ch],
      papier: [T.marge / T.cw, T.marge / T.ch, T.w / T.cw, T.h / T.ch].map(f5),
      photo: [(T.marge + T.bord.g) / T.cw, (T.marge + T.bord.h) / T.ch, T.pw / T.cw, T.ph / T.ch].map(f5),
      cadreVideo,
    },
  };
}

/**
 * Cuit les fichiers d'une vidéo : mp4, affiche (1re image), et, sauf `tirageExterne`, tirage sépia + coins.
 *   inv        { angle, segments, couleur, tirage, maintien } (comme INVITES de bake-videos.mjs)
 *   mode       'video' | 'photo' (photo seule : `sourcePhoto`, lent zoom)
 *   formats    { video, tirage } : 'paysage' | 'portrait'
 *   court      le montage peut durer moins de 12 s (album de Cécile)
 *   tirageExterne  { tirage, coins, orientation } : le tirage vient d'ailleurs (photo de l'album) ; ni tirage ni coins ici
 */
async function cuireMontage(ctx, { id, titre, mode, inv, sourcePhoto, formats, court = false, tirageExterne = null }) {
  return avecFormat(formats, async () => {
    const segsCle = inv.segments.map(({ fichier, ...s }) => ({ ...s, sha: mode === 'photo' ? inv.shaPhoto : sha256Fichier(fichier) }));
    const fVideo = join(BAKED_LOCAL, `videos/${id}.mp4`);
    const fAffiche = join(BAKED_LOCAL, `videos/${id}-affiche.webp`);
    const fTirage = join(BAKED_LOCAL, `photos/${id}/tirage.webp`);
    const fCoins = join(BAKED_LOCAL, `photos/${id}/coins.webp`);
    mkdirSync(join(BAKED_LOCAL, 'videos'), { recursive: true });
    if (!tirageExterne) mkdirSync(join(BAKED_LOCAL, `photos/${id}`), { recursive: true });
    const code = empreintesCode();
    const c0 = ctx.cache[id] ?? {};
    const base = { v: 4, mode, formats, court, V, couleur: inv.couleur, ff: VERSION_FFMPEG, fp: String(filtrePlan) };
    const kVideo = empreinte({ ...base, segs: segsCle, kb: mode === 'photo' ? KEN_BURNS : 0, enc: String(encoderGraphe) });
    const kImage = empreinte({ ...base, T, s0: segsCle[0], tirage: inv.tirage, id, code: code.tirage, externe: !!tirageExterne });
    const kCoins = empreinte({ v: 2, T, maintien: inv.maintien, id, code: code.coins });
    const fait = [];
    if (FORCE || c0.video !== kVideo || !existsSync(fVideo)) {
      const t0 = Date.now();
      let enc;
      try {
        enc = mode === 'video' ? encoderVideo(id, inv, fVideo, { court, cfr: true }) : encoderPhotoSeule(id, sourcePhoto, inv.segments[0], inv.couleur, fVideo);
      } catch (e) {
        if (/trop court/.test(e.message)) throw new Error(`${e.message}. Allonge les plans (« de » / « a ») ou ajoute « lenteur » dans le montage de ${id} : il faut 12 s en tout, fondus de ${V.fondu} s déduits.`);
        throw e;
      }
      const { crf, octets } = enc;
      fait.push(`${mode === 'video' ? 'montage' : 'zoom sur la photo'} ${(octets / 1e6).toFixed(2)} Mo (CRF ${crf}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      c0.video = kVideo;
    }
    if (FORCE || c0.image !== kImage || !existsSync(fAffiche) || (!tirageExterne && !existsSync(fTirage))) {
      const frame = premiereImage(inv);
      if (frame.length !== V.w * V.h * 3) throw new Error(`${id} : première image incomplète (${frame.length} octets)`);
      webp(frame, V.w, V.h, 'rgb24', fAffiche, 82);
      if (!tirageExterne) webp(tirageSepia(id, frame, inv.tirage), T.cw, T.ch, 'rgba', fTirage, 86);
      fait.push(tirageExterne ? 'affiche' : 'affiche + tirage');
      c0.image = kImage;
    }
    if (!tirageExterne && (FORCE || c0.coins !== kCoins || !existsSync(fCoins))) {
      writeFileSync(fCoins, await rendreSvg(await ctx.page(), svgMaintien(id, inv.maintien), T.cw, T.ch));
      fait.push(inv.maintien.type === 'scotch' ? 'scotch' : `coins ${inv.maintien.papier}`);
      c0.coins = kCoins;
    }
    ctx.cache[id] = c0;
    const duree = +sonde(fVideo).duree.toFixed(2);
    const cadreVideo = tirageExterne
      ? cadreGeneral(V.w, V.h, T.pw, T.ph, inv.tirage.x, inv.tirage.y)
      : [...cadreTirage(inv.tirage)].map((v, k) => v / [V.w, V.h, V.w, V.h][k]).map(f5);
    const entree = entreeContenu({ id, titre, duree: court ? duree : V.duree, inv, mode, ...(tirageExterne ?? {}), cadreVideo });
    const poids = [fVideo, fAffiche, ...(tirageExterne ? [] : [fTirage, fCoins])].map((f) => (statSync(f).size / 1024).toFixed(0) + ' Ko');
    console.log(`${id.padEnd(15)} ${mode === 'video' ? 'vidéo      ' : 'photo seule'} ${(typeof formats.video === 'string' ? formats.video === 'portrait' : formats.video.h > formats.video.w) ? 'portrait' : 'paysage '} ${fait.length ? fait.join(' · ') : 'à jour'} — ${poids.join(' / ')}`);
    return entree;
  });
}

function nettoyer(id, { garderPhotos = false } = {}) {
  const fichiers = [`videos/${id}.mp4`, `videos/${id}-affiche.webp`, ...(garderPhotos ? [] : [`photos/${id}`])];
  for (const f of fichiers) rmSync(join(BAKED_LOCAL, f), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------
// Invités

async function invites(ctx, precedent) {
  const roster = lireJson(join(ROOT, 'src/content/roster.json'), { guests: [] }).guests;
  const slugs = new Set(roster.map((g) => g.slug));
  const contenu = {};
  const cles = Object.keys(INVITES);
  const nb = { video: 0, photo: 0, rien: 0 };
  for (const g of roster) {
    const slug = g.slug;
    if (!vise(slug)) { if (precedent[slug]) contenu[slug] = precedent[slug]; continue; }
    const dossier = join(PRIVE, slug);
    const dVideos = join(dossier, 'videos'), dPhotos = join(dossier, 'photos');
    const videos = listerMedias(dVideos, EXT_VIDEOS);
    const photos = listerMedias(dPhotos, EXT_PHOTOS);
    const montage = lireJson(join(dossier, 'montage.json'), null);
    if (!videos.length && !photos.length) {
      nettoyer(slug);
      delete ctx.cache[slug];
      nb.rien++;
      continue;
    }
    const mode = videos.length ? 'video' : 'photo';
    if (mode === 'video' && videos.length > 1 && !montage) console.log(`  ${slug} : ${videos.length} vidéos, seule « ${videos[0]} » est montée (montage.json pour en choisir d'autres)`);
    if (mode === 'photo' && photos.length > 1) console.log(`  ${slug} : ${photos.length} photos, seule « ${photos[0]} » est utilisée`);
    let segments, sourcePhoto = null, shaPhoto = null;
    if (mode === 'video') {
      segments = montage ? plansDeMontage(montage, dVideos, videos) : plansParDefaut(join(dVideos, videos[0]));
    } else {
      const chemin = join(dPhotos, photos[0]);
      shaPhoto = sha256Fichier(chemin);
      sourcePhoto = photoNormalisee(chemin, shaPhoto);
      const s0 = (Array.isArray(montage) ? montage[0] : montage?.segments?.[0]) ?? {};
      segments = [{ fichier: sourcePhoto, image: true, de: 0, a: 1, x: s0.x ?? 0.5, y: s0.y ?? 0.5, z: 1 }];
    }
    const preset = INVITES[cles[hash(slug) % cles.length]];
    const inv = {
      angle: montage?.angle ?? preset.angle,
      segments,
      shaPhoto,
      couleur: preset.couleur ?? COULEUR_DEFAUT,
      tirage: { ...preset.tirage, x: 0.5 }, // la photo 3:2 est centrée dans le cadre 16:9
      maintien: preset.maintien,
    };
    contenu[slug] = await cuireMontage(ctx, { id: slug, titre: g.firstName, mode, inv, sourcePhoto, formats: { video: 'paysage', tirage: 'paysage' } });
    nb[mode]++;
  }
  for (const n of readdirSync(PRIVE, { withFileTypes: true })) {
    if (n.isDirectory() && !slugs.has(n.name) && !['cecile', 'baked'].includes(n.name) && !n.name.startsWith('.')) {
      console.log(`  ! prive/${n.name}/ n'est pas un invité de roster.json : ignoré`);
    }
  }
  console.log(`invités : ${nb.video} vidéo(s), ${nb.photo} en photo seule, ${nb.rien} sans média (placeholder)`);
  return contenu;
}

// ---------------------------------------------------------------------------------------------
// Album de Cécile : les photos sont cuites par bake-local-cecile.py ; les emplacements avec vidéo, ici.

async function cecile(ctx, precedent) {
  const choix = lireJson(CHOIX, {});
  const ids = Object.keys(choix).sort((a, b) => numero(a) - numero(b));
  const contenu = {};
  python(['cuire', ...(FORCE ? ['--force'] : [])]);          // photos des emplacements ayant un `fichier`
  const parId = Object.fromEntries(lireJson(CONTENU_PHOTOS, []).map((p) => [p.id, p]));
  const nomsVideos = listerMedias(D_CECILE_VIDEOS, EXT_VIDEOS);
  const cles = Object.keys(INVITES);
  for (const id of ids) {
    const c = choix[id];
    if (!c.video) { nettoyer(id, { garderPhotos: true }); continue; }
    const nomVideo = trouver(c.video, nomsVideos);
    if (!nomVideo) throw new Error(`choix.json : ${id} → vidéo « ${c.video} » introuvable dans prive/cecile/videos/ (présent : ${nomsVideos.join(', ') || 'rien'})`);
    const chemin = join(D_CECILE_VIDEOS, nomVideo);
    const externe = parId[id] ?? null;                           // photo à part : son tirage sert, la vidéo n'a que son affiche
    const sonde0 = sonde(chemin);
    // Ratio d'origine, aucun rognage : la vidéo est montée à son ratio (grand côté 1280), son tirage a le même
    // (grand côté 1080). Avec une photo à part, le tirage a celui de la photo (et la vidéo n'est montrée qu'en partie
    // si les deux ratios diffèrent : à éviter).
    const formatVideo = dimsVideo(sonde0.w, sonde0.h);
    const formatTirage = externe ? { pw: externe.taille[0], ph: externe.taille[1] } : dimsTirage(sonde0.w, sonde0.h);
    const n = numero(id);
    const angle = c.angle ?? externe?.angle ?? ANGLES[(n - 1) % ANGLES.length];
    // La fiche de l'emplacement : le tirage (photo à part, sinon 1re image de la vidéo) et l'identifiant de la vidéo.
    parId[id] = { ...(externe ?? { id, orientation: orientationDe(formatTirage.pw, formatTirage.ph), taille: [formatTirage.pw, formatTirage.ph], ratio: +((formatTirage.pw + 320) / (formatTirage.ph + 320)).toFixed(5), tirage: `local/photos/${id}/tirage`, coins: `local/photos/${id}/coins`, angle }), video: id };
    if (!vise(id)) { if (precedent[id]) contenu[id] = precedent[id]; continue; }
    const segments = c.montage
      ? plansDeMontage(c.montage, D_CECILE_VIDEOS, [nomVideo, ...nomsVideos.filter((n2) => n2 !== nomVideo)])
      : plansParDefaut(chemin, { court: true });
    const preset = INVITES[cles[hash(id) % cles.length]];
    const maintien = c.coins ? { type: 'coins', papier: c.coins, jeu: 1 } : preset.maintien;
    const inv = {
      angle,
      segments,
      couleur: preset.couleur ?? COULEUR_DEFAUT,
      // la photo montre toute la vidéo (zoom < 1 : le cadre du tirage est celui de la vidéo entière)
      tirage: { ...preset.tirage, x: 0.5, y: 0.5, z: zoomPlein(formatVideo, formatTirage) },
      maintien,
    };
    contenu[id] = await cuireMontage(ctx, {
      id, titre: 'Cécile', mode: 'video', inv, court: true, formats: { video: formatVideo, tirage: formatTirage },
      tirageExterne: externe && { tirage: externe.tirage, coins: externe.coins },
    });
  }
  // Vidéos d'emplacements retirés du choix
  for (const f of existsSync(join(BAKED_LOCAL, 'videos')) ? readdirSync(join(BAKED_LOCAL, 'videos')) : []) {
    const m = /^(cecile-\d+)(-affiche)?\.(mp4|webp)$/.exec(f);
    if (m && !choix[m[1]]?.video) rmSync(join(BAKED_LOCAL, 'videos', f));
  }
  const liste = Object.values(parId).sort((a, b) => numero(a.id) - numero(b.id));
  writeFileSync(CONTENU_PHOTOS, JSON.stringify(liste, null, 2) + '\n');
  console.log(`album de Cécile : ${liste.length} emplacement(s), dont ${liste.filter((p) => p.video).length} avec vidéo · prive/baked/photos-cecile.json`);
  return contenu;
}

// ---------------------------------------------------------------------------------------------

async function main() {
  if (!existsSync(PRIVE)) {
    console.log(`${PRIVE} n'existe pas : rien à cuire (le build local utilisera les placeholders).`);
    return;
  }
  mkdirSync(BAKED_LOCAL, { recursive: true });
  if (args.includes('--planche')) { python(['planche']); return; }
  const ctx = contexte();
  const precedent = lireJson(CONTENU, {});
  let contenu = {};
  try {
    if (!args.includes('--sans-cecile') && (!ONLY || ONLY.some((o) => o === 'cecile' || o.startsWith('cecile-')))) {
      Object.assign(contenu, await cecile(ctx, precedent));
    } else {
      for (const k of Object.keys(precedent)) if (k.startsWith('cecile-')) contenu[k] = precedent[k];
    }
    if (!args.includes('--sans-invites')) Object.assign(contenu, await invites(ctx, precedent));
    else for (const k of Object.keys(precedent)) if (!k.startsWith('cecile-')) contenu[k] = precedent[k];
  } finally {
    await ctx.fermer();
    writeFileSync(CACHE, JSON.stringify(ctx.cache, null, 2) + '\n');
  }
  const roster = lireJson(join(ROOT, 'src/content/roster.json'), { guests: [] }).guests.map((g) => g.slug);
  const ordre = [...roster, ...Object.keys(contenu).filter((k) => !roster.includes(k)).sort((a, b) => numero(a) - numero(b))];
  writeFileSync(CONTENU, JSON.stringify(Object.fromEntries(ordre.filter((k) => contenu[k]).map((k) => [k, contenu[k]])), null, 2) + '\n');
  console.log('écrit : prive/baked/videos.json');
  console.log('Ensuite : npm run build:local puis npm run preview:local');
}

await main();
