// Génère (ou affiche) le secret de la version partagée.
//
//   npm run partage:cle              crée prive/partage/secret.json s'il n'existe pas, sinon l'affiche
//   npm run partage:cle -- --nouveau remplace le secret : nouvelle clé K, nouveau mot de passe (RÉVOCATION :
//                                    tout ce qui a été partagé cesse de fonctionner au prochain déploiement)
//   PARTAGE_URL=https://… ou PARTAGE_PROJET=<projet>   adresse du lien et du QR code
//
// Écrit aussi prive/partage/lien.txt et qr.png (lien avec la clé dans le fragment #cle=…). Tout reste dans prive/.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { DOSSIER_SECRET, creerSecret, entropieBits, lienSecret, lireMots, lireSecret, FICHIER_SECRET, NB_MOTS } from './partage/secret.mjs';
import { ITERATIONS } from './partage/coeur.mjs';

const nouveau = process.argv.includes('--nouveau');
let secret = lireSecret();
let cree = false;
if (!secret || nouveau) { secret = await creerSecret(); cree = true; }

const lien = lienSecret(secret);
writeFileSync(join(DOSSIER_SECRET, 'lien.txt'), lien + '\n', { mode: 0o600 });
await QRCode.toFile(join(DOSSIER_SECRET, 'qr.png'), lien, { errorCorrectionLevel: 'M', margin: 4, width: 640 });

console.log(cree ? (nouveau ? 'Nouveau secret créé (l\'ancien est révoqué dès le prochain déploiement).' : 'Secret créé.') : 'Secret existant conservé.');
console.log(`  fichier       : ${FICHIER_SECRET}`);
console.log(`  phrase de passe : ${secret.motDePasse}`);
console.log(`  force         : ${NB_MOTS} mots sur ${lireMots().length} ≈ ${entropieBits().toFixed(1)} bits, PBKDF2-SHA-256 ${ITERATIONS.toLocaleString('fr-FR')} tours`);
console.log(`  lien secret   : ${lien}`);
console.log(`  QR code       : ${join(DOSSIER_SECRET, 'qr.png')}`);
if (!process.env.PARTAGE_URL && !process.env.PARTAGE_PROJET) console.log('  (adresse provisoire : définir PARTAGE_PROJET=<projet Cloudflare> puis relancer pour refaire le lien et le QR)');
