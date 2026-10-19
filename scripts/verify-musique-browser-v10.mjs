// Vrais MP3/WebAudio avec politique autoplay : tampons raccourcis à8s, rotation injectée à2s uniquement
// dans le bundle de test (la production reste à25s). La fin naturelle en fondu serait à5s : un changement
// avant4s prouve bien la rotation. Le test pur vérifie le vrai seuil25s sans attente via l'horloge simulée.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { serve } from './lib/serve.mjs';
import { lancer } from './lib/verif.mjs';
const dir = 'verification/out/musique-v10'; mkdirSync(dir, { recursive: true });
const sourceMusique = readFileSync('src/lib/musique.ts', 'utf8');
const rotationProduction = 'const DUREE_EXTRAIT_ROTATION = 25;';
assert.equal(sourceMusique.split(rotationProduction).length, 2, 'le moteur de production conserve un seul seuil de25s');
await build({ stdin: { contents: `import { etatMusique, changerMorceau, MORCEAUX } from './src/lib/musique'; import { getReglages, setReglages } from './src/lib/reglages'; import { marquerVideo, contexteAudio } from './src/lib/son'; window.banc = { etatMusique, changerMorceau, MORCEAUX, getReglages, setReglages, marquerVideo, contexteAudio };`, resolveDir: process.cwd(), loader: 'ts' }, outfile: `${dir}/banc.js`, bundle: true, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'rotation-courte-test', setup(p) { p.onLoad({ filter: /[/\\]src[/\\]lib[/\\]musique\.ts$/ }, () => ({ contents: sourceMusique.replace(rotationProduction, 'const DUREE_EXTRAIT_ROTATION = 2;'), loader: 'ts', resolveDir: resolve('src/lib') })); } }, { name: 'assets-audio', setup(p) { p.onResolve({ filter: /^\.\/assets$/ }, a => ({ path: a.path, namespace: 'audio-assets' })); p.onLoad({ filter: /.*/, namespace: 'audio-assets' }, () => ({ contents: `export const assetInfo=n=>({u:'/design-system/baked/'+n+'.mp3'}); export const assetUrl=n=>'/design-system/baked/'+n+'.mp3'; export const assetNames=()=>[];` })); } }] });
writeFileSync(`${dir}/index.html`, '<!doctype html><meta charset="utf-8"><button>Ouvrir le carnet</button><script src="banc.js"></script>');
const srv = await serve(); const browser = await lancer({ args: ['--disable-webgl'] });
const context = await browser.newContext(); const page = await context.newPage(); const errors=[]; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  window.audioTest = { decodes:0, starts:[] };
  const original=BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData=function(ab,ok,ko) {
    const short=b=>{ window.audioTest.decodes++;const n=Math.min(b.length,Math.round(8*b.sampleRate)); const out=this.createBuffer(b.numberOfChannels,n,b.sampleRate); for(let ch=0;ch<b.numberOfChannels;ch++)out.copyToChannel(b.getChannelData(ch).subarray(0,n),ch);return out; };
    return original.call(this,ab).then(b=>{const out=short(b); ok?.(out);return out;},e=>{ko?.(e);throw e;});
  };
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args) {if(this.buffer?.duration>.01)window.audioTest.starts.push({duration:this.buffer.duration,offset:args[1]??0,loop:this.loop}); return start.apply(this,args);};
});
try {
  await page.goto(`${srv.url}/${dir}/`); await page.waitForFunction(()=>!!window.banc); await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.banc.contexteAudio()), null, 'aucun contexte créé avant geste');
  await page.locator('button').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.banc.etatMusique().joue, null, {timeout:15000});
  assert.equal(await page.evaluate(()=>window.banc.getReglages().musique),'toutes');
  const premiere=await page.evaluate(()=>window.banc.etatMusique().morceau);
  const debutAudio=await page.evaluate(()=>window.banc.contexteAudio().currentTime);
  await page.waitForFunction(x=>window.banc.etatMusique().morceau!==x, premiere, {timeout:12000});
  await page.waitForFunction(()=>window.banc.etatMusique().joue);
  const delaiRotation=await page.evaluate(()=>window.banc.contexteAudio().currentTime)-debutAudio;
  assert.ok(delaiRotation<4,'la rotation injectée à2s arrive avant la fin naturelle en fondu à5s');
  const suivante=await page.evaluate(()=>window.banc.etatMusique().morceau);
  assert.equal(await page.evaluate(()=>window.banc.getReglages().musique),'toutes','tourner ne remplace pas le mode toutes');
  assert.ok((await page.evaluate(()=>window.audioTest.starts)).every(x=>!x.loop));
  await page.waitForTimeout(500); await page.evaluate(()=>window.banc.marquerVideo(true));
  assert.equal(await page.evaluate(()=>window.banc.etatMusique().statut),'pause-video');
  await page.waitForTimeout(200); await page.evaluate(()=>window.banc.marquerVideo(false));
  await page.waitForFunction(()=>window.banc.etatMusique().joue);
  assert.ok(await page.evaluate(()=>window.audioTest.starts.at(-1).offset>.1),'reprise à la position avant vidéo');
  await page.evaluate(()=>window.banc.setReglages({musiqueActive:false})); assert.equal(await page.evaluate(()=>window.banc.etatMusique().joue),false);
  const decoded=await page.evaluate(async()=>{const c=window.banc.contexteAudio();const results=[];for(const m of window.banc.MORCEAUX){const r=await fetch('/design-system/baked/'+m.f+'.mp3');const b=await c.decodeAudioData(await r.arrayBuffer());results.push({id:m.id,canal:b.numberOfChannels,sampleRate:b.sampleRate});}return results;});
  assert.equal(decoded.length,7); assert.equal(new Set(decoded.map(x=>x.id)).size,7);
  assert.ok(decoded.every(x=>x.canal===2)); assert.deepEqual(errors,[]);
  writeFileSync(`${dir}/rapport.json`,JSON.stringify({ok:true,decoded,rotation:{productionSecondes:25,testSecondes:2,tamponSecondes:8,premiere,suivante,delaiRotation},etat:await page.evaluate(()=>window.banc.etatMusique()),starts:await page.evaluate(()=>window.audioTest.starts)},null,2)+'\n');
  console.log('WebAudio Chromium : autoplay respecté, vrai décodage7MP3, rotation toutes accélérée2s (25s en production), démarrage clavier, fondu, pause vidéo/reprise et pause utilisateur : OK');
} finally {await context.close();await browser.close();await srv.close();}
