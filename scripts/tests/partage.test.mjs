// Aller-retour de la version partagée (chiffrement, noms masqués, enveloppe de clé, garde-fou), sans navigateur.
//   node --test scripts/tests/partage.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ITERATIONS, b64u, chiffrerFichier, dechiffrerFichier, deB64u, envelopper, importerCles, nomMasque, normaliserMotDePasse, nouvelleCle, ouvrirVerrou } from '../partage/coeur.mjs';
import { entropieBits, lireMots, phraseDePasse } from '../partage/secret.mjs';
import { CHARGEUR, verifier } from '../garde-partage.mjs';

const RAPIDE = 2000; // tours PBKDF2 des essais (le vrai nombre est testé une fois)

test('verrou : bon mot de passe → K, mauvais → rejeté, accents/casse/séparateurs sans effet', async () => {
  const k = nouvelleCle();
  const verrou = await envelopper(k, 'Pâté lumière — étoile  forêt-cidre', { iterations: RAPIDE });
  assert.deepEqual(Object.keys(verrou).sort(), ['cleEnveloppee', 'iterations', 'iv', 'sel', 'v']);
  assert.equal(deB64u(verrou.sel).length, 16);
  assert.equal(deB64u(verrou.iv).length, 12);
  assert.deepEqual(await ouvrirVerrou(verrou, 'pate lumiere etoile foret cidre'), k);
  assert.deepEqual(await ouvrirVerrou(verrou, 'PATÉ  LUMIÈRE étoile forêt-cidre'), k);
  await assert.rejects(ouvrirVerrou(verrou, 'pate lumiere etoile foret sucre'), /mauvais mot de passe/);
  await assert.rejects(ouvrirVerrou(verrou, ''), /mauvais mot de passe/);
  const autre = { ...verrou, cleEnveloppee: b64u(new Uint8Array(48)) };
  await assert.rejects(ouvrirVerrou(autre, 'pate lumiere etoile foret cidre'), /mauvais mot de passe/);
});

test('verrou : 600 000 tours PBKDF2 par défaut', async () => {
  assert.equal(ITERATIONS, 600_000);
  const k = nouvelleCle();
  const verrou = await envelopper(k, 'un deux trois quatre cinq');
  assert.equal(verrou.iterations, 600_000);
  assert.deepEqual(await ouvrirVerrou(verrou, 'un deux trois quatre cinq'), k);
});

test('fichier : aller-retour, type MIME dans le chiffré, IV aléatoire, falsification et mauvais chemin rejetés', async () => {
  const k = nouvelleCle();
  const { cle } = await importerCles(k, { ecriture: true });
  const clair = new Uint8Array(100_000).map((_, i) => (i * 31) % 251);
  const c1 = await chiffrerFichier(cle, 'prive-baked/videos/cecile-1.mp4', 'video/mp4', clair);
  const c2 = await chiffrerFichier(cle, 'prive-baked/videos/cecile-1.mp4', 'video/mp4', clair);
  assert.notDeepEqual(c1.subarray(0, 12), c2.subarray(0, 12));
  assert.equal(c1.length, 12 + 1 + 'video/mp4'.length + clair.length + 16);
  const lu = await dechiffrerFichier(cle, 'prive-baked/videos/cecile-1.mp4', c1);
  assert.equal(lu.mime, 'video/mp4');
  assert.deepEqual(lu.donnees, clair);
  await assert.rejects(dechiffrerFichier(cle, 'prive-baked/videos/cecile-2.mp4', c1)); // fichier échangé
  const abime = c1.slice(); abime[500] ^= 1;
  await assert.rejects(dechiffrerFichier(cle, 'prive-baked/videos/cecile-1.mp4', abime));
  const { cle: autreCle } = await importerCles(nouvelleCle());
  await assert.rejects(dechiffrerFichier(autreCle, 'prive-baked/videos/cecile-1.mp4', c1)); // autre clé = révoquée
});

test('clés du navigateur : non extractables, déchiffrement seul', async () => {
  const { cle, noms } = await importerCles(nouvelleCle());
  assert.equal(cle.extractable, false);
  assert.equal(noms.extractable, false);
  assert.deepEqual(cle.usages, ['decrypt']);
  assert.deepEqual(noms.usages, ['sign']);
});

test('noms masqués : stables, distincts, 43 caractères, rien d\'origine, dépendent de K', async () => {
  const { noms } = await importerCles(nouvelleCle());
  const a = await nomMasque(noms, 'prive-baked/videos/cecile-1.mp4');
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a, await nomMasque(noms, './prive-baked/videos/cecile-1.mp4'));
  assert.notEqual(a, await nomMasque(noms, 'prive-baked/videos/cecile-2.mp4'));
  assert.ok(!a.toLowerCase().includes('cecile'));
  const { noms: autres } = await importerCles(nouvelleCle());
  assert.notEqual(a, await nomMasque(autres, 'prive-baked/videos/cecile-1.mp4'));
});

test('phrase de passe : 5 mots français distincts de la liste, ≥ 55 bits', () => {
  const mots = lireMots();
  assert.ok(mots.length >= 2048, `liste de ${mots.length} mots`);
  assert.equal(new Set(mots.map((m) => normaliserMotDePasse(m))).size, mots.length, 'mots en double');
  assert.ok(entropieBits() >= 55);
  const p = phraseDePasse();
  assert.equal(p.split(' ').length, 5);
  assert.ok(p.split(' ').every((m) => mots.includes(m)));
  assert.notEqual(phraseDePasse(), phraseDePasse());
});

test('garde-partage : accepte un dossier chiffré, refuse du clair', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'gc-partage-'));
  try {
    const { cle, noms } = await importerCles(nouvelleCle(), { ecriture: true });
    const alea = () => new Uint8Array(20_000).map(() => Math.floor(Math.random() * 256));
    const ecrire = async (chemin, donnees) => writeFileSync(join(dossier, await nomMasque(noms, chemin)), await chiffrerFichier(cle, chemin, 'application/octet-stream', donnees));
    await ecrire('assets/a.js', alea());
    await ecrire('prive-baked/photos/cecile-1/tirage.webp', alea());
    for (const f of CHARGEUR) writeFileSync(join(dossier, f), f === 'verrou.json' ? JSON.stringify({ v: 1, sel: 'x', iterations: 1, cleEnveloppee: 'y', iv: 'z' }) : 'rien');
    const temoins = [{ valeur: 'Goûter entre cousines d\'amour', origine: 'légende' }, { valeur: 'Cécile', origine: 'mot' }, { valeur: 'lea', origine: 'invité' }];
    const options = { temoins, secret: null, dossierLocal: join(dossier, 'inexistant') };
    assert.deepEqual(verifier(dossier, options).problemes, []);

    writeFileSync(join(dossier, 'index.html'), '<h1>Les goûters de Cécile</h1> clear');            // chargeur : « Cécile » interdit, « clear » ≠ lea
    assert.ok(verifier(dossier, options).problemes.some((p) => p.includes('Cécile')));
    assert.ok(!verifier(dossier, options).problemes.some((p) => p.includes('lea')));
    writeFileSync(join(dossier, 'index.html'), 'rien');
    mkdirSync(join(dossier, 'sous'));                                                            // fichier clair non masqué
    writeFileSync(join(dossier, 'sous', 'cecile-1.mp4'), Buffer.concat([Buffer.from('....ftypisom'), Buffer.alloc(9000, 1)]));
    const p = verifier(dossier, options).problemes.join('\n');
    assert.match(p, /nom non masqué : sous\/cecile-1\.mp4/);
    rmSync(join(dossier, 'sous'), { recursive: true });
    writeFileSync(join(dossier, 'B'.repeat(43)), Buffer.concat([alea(), Buffer.from('Goûter entre cousines d\'amour'), alea()])); // légende lisible dans un « chiffré »
    assert.match(verifier(dossier, options).problemes.join('\n'), /Goûter entre cousines d'amour/);
    writeFileSync(join(dossier, 'B'.repeat(43)), Buffer.alloc(9000, 65));                       // entropie nulle
    assert.match(verifier(dossier, options).problemes.join('\n'), /entropie/);
    writeFileSync(join(dossier, 'B'.repeat(43)), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), alea()])); // JPEG
    assert.match(verifier(dossier, options).problemes.join('\n'), /JPEG/);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
