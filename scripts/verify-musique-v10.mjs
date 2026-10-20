// Contrat du moteur audio : horloge et fins de tampon simulées, réseau/décodage isolés.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const banque = JSON.parse(readFileSync('design-system/baked/musique/banque.json'));
assert.equal(banque.morceaux.length, 7, 'sept morceaux publiés');
assert.equal(new Set(banque.morceaux.map(x => x.id)).size, 7, 'aucun doublon');
let r = { musique: 'toutes', musiqueActive: true, musiqueEnchaine: true, volumeMusique: .5, muet: false };
const subscribers = { reglages: new Set(), audio: new Set(), video: new Set(), visibilite: new Set() };
const sources = [], requetes = [], intervals = []; let video = false;
const context = { currentTime: 0, state: 'running', destination: {},
  createGain() { return { gain: param(), connect() {}, disconnect() {} }; },
  createBufferSource() {
    const x = { buffer: null, loop: false, onended: null, connect(g) { x.gain = g.gain; }, disconnect() {},
      start(t, offset) { x.startAt = t; x.offset = offset; }, stop(t) { x.stopAt = t; } };
    sources.push(x); return x;
  },
  decodeAudioData(_a, cb) { const b = { duration: 30 }; cb(b); return Promise.resolve(b); },
};
function param() {
  let base=0, courbe=null;
  return {
    courbes: [],
    get value() {
      if(!courbe||context.currentTime<courbe.t) return base;
      const i=Math.min(courbe.valeurs.length-1,Math.max(0,(context.currentTime-courbe.t)/courbe.d*(courbe.valeurs.length-1)));
      const a=Math.floor(i),b=Math.ceil(i); return courbe.valeurs[a]+(courbe.valeurs[b]-courbe.valeurs[a])*(i-a);
    },
    set value(v) { base=v; },
    cancelScheduledValues() { courbe=null; },
    cancelAndHoldAtTime() { base=this.value; courbe=null; },
    setValueAtTime(v) { base=v; },
    linearRampToValueAtTime(v) { base=v; },
    setValueCurveAtTime(v,t,d) { courbe={valeurs:Array.from(v),t,d};this.courbes.push(courbe); },
  };
}
globalThis.__gcMusicTest = { getReglages: () => r, setReglages(x) { r = { ...r, ...x }; subscribers.reglages.forEach(f => f()); }, abonnerReglages: f => subscribers.reglages.add(f), contexteAudio: () => context, abonnerAudio: f => subscribers.audio.add(f), abonnerVideo: f => subscribers.video.add(f), besoinAudio() {}, videoEnLecture: () => video };
globalThis.window = { setInterval(f) { intervals.push(f); } };
globalThis.document = { hidden: false, addEventListener(n,f) { if(n==='visibilitychange')subscribers.visibilite.add(f); } };
globalThis.fetch = async (url) => { requetes.push({url,t:context.currentTime});return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };
const stubs = { './reglages': 'export const { getReglages, setReglages, abonnerReglages } = globalThis.__gcMusicTest;', './son': 'export const { contexteAudio, abonnerAudio, abonnerVideo, besoinAudio, videoEnLecture } = globalThis.__gcMusicTest;', './assets': 'export const assetInfo=()=>({}); export const assetUrl=x=>x;' };
const b = await build({ entryPoints: ['src/lib/musique.ts'], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'audio-fixture', setup(p) { p.onResolve({ filter: /^\.\/(reglages|son|assets)$/ }, x => ({ path: x.path, namespace: 'fixture' })); p.onLoad({ filter: /.*/, namespace: 'fixture' }, x => ({ contents: stubs[x.path] })); } }] });
const m = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const regler=x=>globalThis.__gcMusicTest.setReglages(x);
const poll=async(t)=>{context.currentTime=t;intervals.forEach(f=>f());await flush();};
const fin=async(v)=>{context.currentTime=v.startAt+v.buffer.duration-v.offset;v.onended();await flush();};
const notes=[];const ok=(nom,test)=>{assert.ok(test,nom);notes.push(nom);};
subscribers.audio.forEach(f => f()); await flush();
let v=sources.at(-1);const premier=m.etatMusique().morceau;
ok('démarrage sans boucle native et gain utilisateur',m.etatMusique().joue&&!v.loop&&m.etatMusique().cible===.1);
await poll(v.startAt+10.1);
ok('suivant préchargé avant la fin',requetes.some(x=>x.url.includes(banque.morceaux[1].id))&&requetes.length===2&&sources.length===1);
for(const secondes of [24.8,25.2,27.5,29.95]){
 await poll(v.startAt+secondes);
 ok(`${secondes}s : aucune coupure ni transition anticipée`,sources.at(-1)===v&&m.etatMusique().morceau===premier&&v.stopAt===undefined&&v.gain.courbes.length===1);
}
await fin(v);const suivant=sources.at(-1),finPremiere=context.currentTime;
ok('seule la fin réelle lance le suivant',suivant!==v&&m.etatMusique().morceau!==premier&&r.musique==='toutes');
ok('respiration courte après les 30 secondes complètes',Math.abs(suivant.startAt-finPremiere-.38)<.001);
ok('entrée musicale courte après la fin naturelle',suivant.gain.courbes[0].d===1.6&&suivant.gain.courbes[0].valeurs[0]===0&&suivant.gain.courbes[0].valeurs.at(-1)===1);
context.currentTime=suivant.startAt+12;video=true;subscribers.video.forEach(f=>f());
ok('pause vidéo et sourdine',m.etatMusique().statut==='pause-video'&&m.etatMusique().cible===0);
await poll(context.currentTime+50);const idPause=m.etatMusique().morceau;
video=false;subscribers.video.forEach(f=>f());await flush();v=sources.at(-1);
ok('reprise au même offset après une longue vidéo',Math.abs(v.offset-12)<.001&&m.etatMusique().morceau===idPause);
await poll(v.startAt+17.95);
ok('les dernières 50 ms du morceau repris sont conservées',sources.at(-1)===v&&v.stopAt===undefined);
await fin(v);v=sources.at(-1);
context.currentTime=v.startAt+6;const avantManuel=m.etatMusique().morceau;
m.changerMorceau(1);await flush();let nouveau=sources.at(-1);
ok('suivant manuel conserve le mode tous les morceaux',m.etatMusique().morceau!==avantManuel&&r.musique==='toutes');
const entree=nouveau.gain.courbes[0],sortie=v.gain.courbes.at(-1),milieu=31;
ok('fondu croisé manuel de trois secondes à puissance égale',entree.d===3&&sortie.d===3&&Math.abs(entree.valeurs[milieu]**2+sortie.valeurs[milieu]**2-1)<1e-5);
// Un second choix pendant l'entrée tient le gain courant, sans saut de volume.
context.currentTime=nouveau.startAt+.4;const gainAvant=nouveau.gain.value;
m.changerMorceau(-1);await flush();
ok('changer encore pendant un fondu ne rétablit pas brutalement le volume',Math.abs(nouveau.gain.courbes.at(-1).valeurs[0]-gainAvant)<1e-6);
ok('précédent revient au morceau joué',m.etatMusique().morceau===avantManuel);
ok('cache borné à deux tampons',m.etatMusique().decodes<=2);
regler({musiqueEnchaine:false});v=sources.at(-1);const conserve=m.etatMusique().morceau;
await poll(v.startAt+29.95);ok('répétition attend aussi la fin entière',sources.at(-1)===v);
await fin(v);ok('sans enchaînement le morceau recommence à zéro',m.etatMusique().morceau===conserve&&sources.at(-1).offset===0);
v=sources.at(-1);context.currentTime=v.startAt+7;
regler({musiqueActive:false});ok('pause utilisateur sans perte de choix',!m.etatMusique().joue);
regler({musiqueActive:true});await flush();ok('reprise utilisateur au même offset',Math.abs(sources.at(-1).offset-7)<.001);
const temps=context.currentTime,nombre=sources.length;
document.hidden=true;context.state='suspended';subscribers.audio.forEach(f=>f());
await poll(temps+100);ok('onglet caché ne fait pas avancer la playlist',m.etatMusique().statut==='pause-onglet'&&sources.length===nombre&&m.etatMusique().morceau===conserve);
context.currentTime=temps;document.hidden=false;context.state='running';subscribers.audio.forEach(f=>f());
ok('retour onglet conserve la même source',sources.length===nombre&&m.etatMusique().joue);
// Choix nominatif : son enchaînement respecte également la fin naturelle.
regler({musique:banque.morceaux[3].id,musiqueEnchaine:true});await flush();v=sources.at(-1);
await poll(v.startAt+29.95);ok('choix nominatif : pas de coupure des trois dernières secondes',sources.at(-1)===v);
await fin(v);ok('choix nominatif : progression à fin naturelle',r.musique===banque.morceaux[4].id);
ok('cache reste borné après les choix et répétitions',m.etatMusique().decodes<=2);
mkdirSync('verification/out',{recursive:true});
writeFileSync('verification/out/musique-v11-pure.json',JSON.stringify({ok:true,controles:notes.length,notes,requetes,sources:sources.map(x=>({debut:x.startAt,offset:x.offset,arret:x.stopAt,finNaturelle:x.startAt+x.buffer.duration-x.offset}))},null,2));
console.log(`Musique entière : ${notes.length} contrôles OK (25s sans coupure, fin réelle, préchargement, transitions, pauses et cache).`);

// Le magasin conserve les valeurs explicites des visiteurs existants.
const storage = new Map(); globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) };
const settingsBundle = await build({ entryPoints: ['src/lib/reglages.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const settingsUrl = `data:text/javascript;base64,${Buffer.from(settingsBundle.outputFiles[0].text).toString('base64')}`;
let settings = await import(settingsUrl + '#nouveau');
assert.equal(settings.getReglages().luminosite, 1.5); assert.equal(settings.getReglages().eclatBougie, 2);
assert.equal(settings.getReglages().vitesseEcriture, 2); assert.equal(settings.getReglages().musique, 'toutes');
assert.equal(settings.getReglages().musiqueActive, true); assert.equal(settings.getReglages().musiqueEnchaine, true);
storage.set('gc:reglages:v4', JSON.stringify({ vitesseEcriture: .7, musique: 'melodie-victoria', musiqueActive: false, musiqueEnchaine: false, luminosite: .9, eclatBougie: 1.3 })); settings = await import(settingsUrl + '#existant');
assert.equal(settings.getReglages().vitesseEcriture, .7); assert.equal(settings.getReglages().musique, 'melodie-victoria');
assert.equal(settings.getReglages().musiqueActive, false); assert.equal(settings.getReglages().musiqueEnchaine, false);
assert.equal(settings.getReglages().luminosite, .9); assert.equal(settings.getReglages().eclatBougie, 1.3);
console.log('Réglages v10 : défaut 200 %, musique active au premier geste, choix existants conservés : OK');

settings.setReglages({ luminosite: 10 }); assert.equal(settings.getReglages().luminosite, settings.LUMINOSITE_MAX);
settings.setReglages({ luminosite: -2 }); assert.equal(settings.getReglages().luminosite, settings.LUMINOSITE_MIN);
settings.resetReglages(); assert.equal(settings.getReglages().luminosite, 1.5); assert.equal(settings.getReglages().eclatBougie, 2);
console.log('Luminosité et éclat : défauts150%/200%, bornes et remise à zéro : OK');
