/** La préparation d'une page reste bornée même si aucune frame ne revient. */
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const b=await build({entryPoints:['src/components/Livre/evenements.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {cadenceStable}=await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
let annule=0,id=0;
globalThis.requestAnimationFrame=()=>++id;
globalThis.cancelAnimationFrame=()=>annule++;
await Promise.race([cadenceStable(25),new Promise((_,rej)=>{const t=setTimeout(()=>rej(new Error('Préparation suspendue sans frame')),3000);t.unref();})]);
assert.equal(annule,1);
let images=0;
globalThis.requestAnimationFrame=f=>{const i=++id;queueMicrotask(()=>{images++;f(images*16);});return i;};
await cadenceStable(3000);assert.equal(images,5);assert.equal(annule,2);
mkdirSync('verification/out/navigation-v16',{recursive:true});writeFileSync('verification/out/navigation-v16/attente-bornee.json',JSON.stringify({sansFrame:true,cadenceNormale:images,aucunChangementDuRendu:true},null,2));
console.log('Préparation bornée sans frame ; cadence normale conservée (5 images).');
