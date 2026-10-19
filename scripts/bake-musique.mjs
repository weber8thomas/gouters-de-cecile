// Musique de fond du carnet (lot M, src/lib/musique.ts) : sept morceaux libres de droits, en boucle sur le
// même AudioContext que les sons du livre et l'ambiance.
//
//   node scripts/bake-musique.mjs [--sans-ecoute]
//
// Entrées
//   design-system/sources/musique/licences.json   titre, auteur, page, licence, texte de crédit, sha256 et
//                                                 extrait (début, fin) de chaque morceau
//   design-system/sources/musique/<id>.mp3        la source (Kevin MacLeod, incompetech.com, CC BY 4.0) ; si elle
//                                                 manque, elle est retéléchargée (curl) et son sha256 vérifié
// Sorties
//   design-system/baked/musique/<id>.mp3          [musique/<id>] stéréo, 44,1 kHz, MP3 96 kb/s, bouclable
//   design-system/baked/musique/banque.json       { v, morceaux: [{ id, titre, auteur, licence, licenceUrl, url, credit, f, d }] } :
//                                                 la liste lue par src/lib/musique.ts et le menu (reglages.ts) ;
//                                                 url = page du morceau au catalogue, pour les crédits
//   verification/out/v5-musique/extraits.mp3      20 s de chaque morceau, pour l'écoute (sauf --sans-ecoute)
//
// Chaîne : extrait [début, fin] décodé par ffmpeg (flottants stéréo 44,1 kHz) → niveau en deux passes
// loudnorm (−26 LUFS intégrés, crête −3 dBTP, gain constant : la dynamique reste) → bouclage : les X dernières
// secondes se fondent dans les X premières (fondu croisé à puissance constante), donc la fin du fichier rejoint
// son début sans couture ; la durée d de la banque est exacte (L − X) → MP3 96 kb/s par ffmpeg.
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const sansEcoute = args.includes('--sans-ecoute');

const SOURCES = join(ROOT, 'design-system/sources/musique');
const LICENCES = join(SOURCES, 'licences.json');
const BAKED = join(ROOT, 'design-system/baked/musique');
const ECOUTE = join(ROOT, 'verification/out/v5-musique');

const SR = 44100;
/** Niveau d'écoute visé, LUFS intégrés (le lecteur joue à 0,25 × le volume réglé). */
const CIBLE_LUFS = -26;
const CRETE_DBTP = -3;
/** Durée du fondu croisé de bouclage (s). */
const FONDU = 4;
const DEBIT = '96k';

const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const lic = JSON.parse(readFileSync(LICENCES, 'utf8'));
// Ordre de la liste publiée : Victoria reste le premier morceau de la rotation.
const ORDRE = ['melodie-victoria', 'gymnopedie-piano', 'casse-noisette-fee-dragee',
  'touching-moments-piano', 'fairytale-waltz', 'path-of-the-goblin-king', 'frozen-star'];

/** La source du morceau : présente et conforme, sinon téléchargée et vérifiée. */
function assurerSource(m) {
  const f = join(SOURCES, m.fichier.nom);
  if (existsSync(f)) {
    if (sha256(f) !== m.fichier.sha256) throw new Error(`${m.id} : sha256 de ${f} différent de licences.json`);
    return f;
  }
  execFileSync('curl', ['-sSfL', '-o', f, m.fichier.url], { stdio: 'inherit' });
  if (sha256(f) !== m.fichier.sha256) {
    unlinkSync(f);
    throw new Error(`${m.id} : téléchargement corrompu (sha256 inattendu)`);
  }
  return f;
}

/** Mesure le niveau intégré de l'extrait (première passe de loudnorm). */
function mesurer(src, debut, fin) {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-nostats', '-i', src, '-ss', String(debut), '-to', String(fin),
    '-vn', '-af', `loudnorm=I=${CIBLE_LUFS}:LRA=20:TP=${CRETE_DBTP}:print_format=json`, '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const bloc = r.stderr.match(/\{[^{}]*"input_i"[\s\S]*?\}/);
  if (!bloc) throw new Error(`mesure impossible pour ${src}`);
  return JSON.parse(bloc[0]);
}

function duree(f) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
}

/** Cuit un morceau : extrait normalisé, bouclé, MP3. Renvoie la durée de la boucle (s). */
function cuire(m, src) {
  const { debut, fin } = m.extrait;
  const L = fin - debut;
  const X = FONDU;
  if (L < 2 * X + 60) throw new Error(`${m.id} : extrait trop court pour un bouclage de ${X} s`);

  // 1. Décodage de l'extrait, niveau constant (deux passes), en flottants stéréo 44,1 kHz.
  const mes = mesurer(src, debut, fin);
  const norme = [
    `loudnorm=I=${CIBLE_LUFS}:LRA=20:TP=${CRETE_DBTP}`,
    `measured_I=${mes.input_i}`, `measured_LRA=${mes.input_lra}`, `measured_TP=${mes.input_tp}`,
    `measured_thresh=${mes.input_thresh}`, `offset=${mes.target_offset}`, 'linear=true',
  ].join(':');
  const brut = execFileSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-i', src, '-ss', String(debut), '-to', String(fin),
    '-vn', '-af', norme, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1',
  ], { maxBuffer: 1 << 30 });
  const seg = new Float32Array(brut.buffer.slice(brut.byteOffset, brut.byteOffset + brut.byteLength));
  const N = seg.length / 2; // trames stéréo
  const Xs = Math.round(X * SR);

  // 2. Bouclage. Sortie = [fondu (queue → tête) de Xs trames] + [milieu : trames Xs à N − Xs].
  //    La première trame de la sortie est la queue (N − Xs) : elle suit la dernière trame du milieu (N − Xs − 1)
  //    sans couture. Fondu à puissance constante (cos² + sin² = 1).
  const M = N - Xs;
  const out = new Float32Array(M * 2);
  for (let i = 0; i < Xs; i++) {
    const t = i / Xs;
    const queue = Math.cos((t * Math.PI) / 2);
    const tete = Math.sin((t * Math.PI) / 2);
    for (let c = 0; c < 2; c++) out[2 * i + c] = seg[2 * (N - Xs + i) + c] * queue + seg[2 * i + c] * tete;
  }
  out.set(seg.subarray(2 * Xs, 2 * (N - Xs)), 2 * Xs);

  // 3. Encodage MP3 96 kb/s stéréo.
  const sortie = join(BAKED, `${m.id}.mp3`);
  execFileSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-y', '-loglevel', 'error',
    '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0',
    '-c:a', 'libmp3lame', '-b:a', DEBIT, '-id3v2_version', '3',
    '-metadata', `title=${m.titre}`, '-metadata', `artist=${m.auteur} (incompetech.com)`,
    '-metadata', `copyright=${m.licence}`, '-metadata', `comment=${m.licenceUrl}`,
    sortie,
  ], { input: Buffer.from(out.buffer) });
  return M / SR;
}

/** Vingt secondes de chaque morceau (fondus d'entrée et de sortie), séparées d'une seconde de silence. */
function ecouter(fichiers) {
  const entrees = fichiers.flatMap((f) => ['-i', f]);
  const parties = [];
  const liste = [];
  fichiers.forEach((_, i) => {
    parties.push(`[${i}:a]atrim=0:20,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=19.2:d=0.8,aformat=sample_rates=44100:channel_layouts=stereo[m${i}]`);
    liste.push(`[m${i}]`);
    if (i < fichiers.length - 1) {
      parties.push(`anullsrc=r=44100:cl=stereo,atrim=0:1[z${i}]`);
      liste.push(`[z${i}]`);
    }
  });
  const graphe = [...parties, `${liste.join('')}concat=n=${liste.length}:v=0:a=1[out]`].join(';');
  mkdirSync(ECOUTE, { recursive: true });
  const sortie = join(ECOUTE, 'extraits.mp3');
  execFileSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-y', '-loglevel', 'error', ...entrees,
    '-filter_complex', graphe, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k', '-ac', '2', sortie,
  ]);
  return sortie;
}

mkdirSync(BAKED, { recursive: true });
const banque = { v: 1, morceaux: [] };
const fichiersCuits = [];
for (const m of lic.morceaux) {
  const src = assurerSource(m);
  const d = cuire(m, src);
  banque.morceaux.push({
    id: m.id, titre: m.titre, auteur: m.auteur, licence: m.licence, licenceUrl: m.licenceUrl, url: m.url,
    credit: m.credit, f: `musique/${m.id}`, d: Math.round(d * 100) / 100,
  });
  fichiersCuits.push(join(BAKED, `${m.id}.mp3`));
  console.log(`${m.id} : boucle de ${d.toFixed(2)} s, ${(readFileSync(join(BAKED, `${m.id}.mp3`)).length / 1024).toFixed(0)} Ko, durée fichier ${duree(join(BAKED, `${m.id}.mp3`)).toFixed(2)} s`);
}
banque.morceaux.sort((a, b) => {
  const ia = ORDRE.indexOf(a.id), ib = ORDRE.indexOf(b.id);
  return (ia < 0 ? ORDRE.length : ia) - (ib < 0 ? ORDRE.length : ib);
});
writeFileSync(join(BAKED, 'banque.json'), JSON.stringify(banque, null, 2) + '\n');
console.log(`banque.json : ${banque.morceaux.length} morceaux`);
if (!sansEcoute) console.log(`écoute : ${ecouter(fichiersCuits)}`);

// La banque active suit exclusivement licences.json. Les interprétations numériques historiques
// ont leur script séparé ; les recuire ici remplacerait la Gymnopédie sélectionnée par une autre prise.
