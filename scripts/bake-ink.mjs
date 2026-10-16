// Grain d'encre des écritures : une tuile raccordable, cuite une fois, posée en masque (alpha)
// sur le texte manuscrit par <Ecriture> (src/components/Ecriture). À l'exécution, aucun filtre.
//   node scripts/bake-ink.mjs [--force]
//
// La tuile est un masque (seul l'alpha compte) : alpha 1 presque partout (l'encre couvre), avec
// de petites zones où l'encre accroche moins (le papier transparaît, alpha ≥ 0,47) et une
// modulation lente (la plume charge plus ou moins). Les couleurs ne viennent pas d'ici : le
// masque garde l'encre de chaque invité (currentColor) et laisse voir le papier réel dessous.
// <Ecriture> atténue le grain selon l'outil (couche uniforme --gc-grain-lift : feutre 70 %,
// bille 35 %, crayon 0 %…) et sur les gros traits (titres, signatures).
import { createBaker } from './lib/bake.mjs';
import { c } from './lib/tokens.mjs';

const S = 256; // tuile de 256 px affichée à 1:1 (mask-size: 256px)
const per = (k) => +(k / S).toFixed(6); // fréquence raccordable : k périodes par tuile
// Deux cartes d'alpha multipliées :
//  - grain fin (3 à 5 px, un peu étiré dans le sens des fibres) : l'encre accroche moins par
//    endroits, seulement sur les pics du bruit (le bruit fractal reste entre 0,3 et 0,7) ;
//  - charge lente (~50 px) : la plume ou la bille dépose un peu plus ou un peu moins.
const table = (n, f) => Array.from({ length: n }, (_, i) => +f(i / (n - 1)).toFixed(3)).join(' ');
const ramp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const FINE = table(32, (t) => 1 - 0.46 * Math.pow(ramp(t, 0.55, 0.74), 1.2)); // alpha mini ≈ 0,54
const SLOW = table(16, (t) => 1 - 0.12 * ramp(t, 0.42, 0.62)); // 0,88–1

const alpha = (id, freq, octaves, seed, values) =>
  `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch" result="${id}"/>` +
  `<feColorMatrix in="${id}" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0" result="${id}a"/>` +
  `<feComponentTransfer in="${id}a" result="${id}t"><feFuncA type="table" tableValues="${values}"/></feComponentTransfer>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
  <filter id="grain" filterUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}" color-interpolation-filters="sRGB">
    ${alpha('fin', `${per(84)} ${per(52)}`, 2, 11, FINE)}
    ${alpha('lent', `${per(5)} ${per(4)}`, 2, 4, SLOW)}
    <feComposite in="fint" in2="lentt" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/>
  </filter>
</defs>
<rect width="${S}" height="${S}" fill="${c('gc-ink-noire')}" filter="url(#grain)"/>
</svg>`;

const baker = await createBaker({ force: process.argv.includes('--force') });
const file = await baker.bake({ svg, out: 'ink/grain.webp', width: S, height: S, scale: 1, quality: 0.9 });
const { made, kept } = await baker.close();
console.log(`${file} (${made} cuite(s), ${kept} inchangée(s))`);
