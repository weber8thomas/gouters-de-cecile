// Moteur de production inchangé, WebAudio réel et petit WAV local de 30,25 s.
// Le dernier thème commence à 27,25 s : il doit rester audible jusqu'à la fin naturelle.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { serve } from './lib/serve.mjs';
import { lancer } from './lib/verif.mjs';
const dir='verification/out/musique-entiers';mkdirSync(dir,{recursive:true});
const sr=8000,duree=30.25,n=Math.round(sr*duree),wav=Buffer.alloc(44+n*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*2,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);
for(let i=0;i<n;i++){const t=i/sr,hz=t<duree-3?220:660;wav.writeInt16LE(Math.round(Math.sin(t*hz*2*Math.PI)*.12*32767),44+i*2);}
writeFileSync(`${dir}/fixture.wav`,wav);
await build({stdin:{contents:`import {etatMusique,changerMorceau,MORCEAUX} from './src/lib/musique';import {getReglages,setReglages} from './src/lib/reglages';import {marquerVideo,contexteAudio} from './src/lib/son';window.banc={etatMusique,changerMorceau,MORCEAUX,getReglages,setReglages,marquerVideo,contexteAudio};`,resolveDir:process.cwd(),loader:'ts'},outfile:`${dir}/banc.js`,bundle:true,format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-audio-seulement',setup(p){
 p.onResolve({filter:/^\.\/assets$/},a=>({path:a.path,namespace:'audio-assets'}));
 p.onLoad({filter:/.*/,namespace:'audio-assets'},()=>({contents:`export const assetInfo=n=>n.startsWith('musique/')?{u:'/${dir}/fixture.wav'}:null;export const assetUrl=n=>'/${dir}/fixture.wav';export const assetNames=()=>[];`}));
}}]});
writeFileSync(`${dir}/index.html`,'<!doctype html><meta charset="utf-8"><button>Écouter</button><script src="banc.js"></script>');
const srv=await serve(),browser=await lancer({args:['--disable-webgl']}),context=await browser.newContext(),page=await context.newPage();
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const ok=(nom,condition,detail)=>{assert.ok(condition,`${nom} : ${JSON.stringify(detail)}`);checks.push({nom,detail});console.log(`OK ${nom}`);};
await page.addInitScript(()=>{
 localStorage.setItem('gc:reglages:v4',JSON.stringify({v:1,musique:'toutes',musiqueActive:true,musiqueEnchaine:true,volumeMusique:1,muet:false,sonsLivre:false,ambiance:false}));
 window.audioTest={starts:[],stops:[],ends:[],courbes:[],analyses:[]};
 const connecter=AudioNode.prototype.connect;
 AudioNode.prototype.connect=function(...args){
  if(this instanceof AudioBufferSourceNode)this.__gainTest=args[0]?.gain;
  if(this instanceof GainNode&&args[0]===this.context.destination){
   const a=this.context.createAnalyser();a.fftSize=1024;window.audioTest.analyses.push(a);
   connecter.call(this,a);connecter.call(a,args[0]);return args[0];
  }
  return connecter.apply(this,args);
 };
 const courbe=AudioParam.prototype.setValueCurveAtTime;
 AudioParam.prototype.setValueCurveAtTime=function(xs,t,d){window.audioTest.courbes.push({param:this,t,d,premier:xs[0],milieu:xs[31],dernier:xs[xs.length-1]});return courbe.call(this,xs,t,d);};
 const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
 AudioBufferSourceNode.prototype.start=function(...args){
  if(this.buffer?.duration>1){
   this.__idTest=window.audioTest.starts.length;
   window.audioTest.starts.push({id:this.__idTest,duration:this.buffer.duration,offset:args[1]??0,when:args[0]??0,appel:this.context.currentTime,loop:this.loop,gain:this.__gainTest});
   this.addEventListener('ended',()=>window.audioTest.ends.push({id:this.__idTest,t:this.context.currentTime}));
  }
  return start.apply(this,args);
 };
 AudioBufferSourceNode.prototype.stop=function(...args){if(this.__idTest!==undefined)window.audioTest.stops.push({id:this.__idTest,when:args[0],appel:this.context.currentTime});return stop.apply(this,args);};
});
const instant=()=>page.evaluate(()=>({musique:window.banc.etatMusique(),reglages:window.banc.getReglages(),t:window.banc.contexteAudio().currentTime,starts:window.audioTest.starts.map(({gain,...s})=>s),stops:window.audioTest.stops,ends:window.audioTest.ends}));
const attendreTemps=secondes=>page.waitForFunction(s=>window.banc.contexteAudio().currentTime>=window.audioTest.starts[0].when+s,secondes,{timeout:35000});
const energie=()=>page.evaluate(()=>Math.max(...window.audioTest.analyses.map(a=>{const x=new Float32Array(a.fftSize);a.getFloatTimeDomainData(x);return Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);})));
try{
 await page.goto(`${srv.url}/${dir}/`);await page.waitForFunction(()=>!!window.banc);
 ok('autoplay attend un geste',await page.evaluate(()=>window.banc.contexteAudio()===null));
 await page.locator('button').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.banc.etatMusique().joue,null,{timeout:15000});
 const initial=await instant();
 await attendreTemps(25.25);const a25=await instant();
 ok('25,25 secondes réelles : même morceau, aucune voix arrêtée',a25.musique.morceau===initial.musique.morceau&&a25.starts.length===1&&a25.stops.length===0,a25.t);
 await attendreTemps(27.5);const rms27=await energie(),a27=await instant();
 ok('les trois dernières secondes commencent sans fondu sortant',a27.starts.length===1&&a27.stops.length===0&&rms27>.005,{rms:rms27,t:a27.t});
 await attendreTemps(29.5);const rms29=await energie();
 ok('la dernière seconde est encore audible',rms29>.005,rms29);
 await page.waitForFunction(()=>window.audioTest.starts.length===2,null,{timeout:6000});
 const fin=await instant(),s0=fin.starts[0],s1=fin.starts[1],e0=fin.ends.find(e=>e.id===0),respiration=s1.when-e0.t;
 ok('progression uniquement après ended naturel',s1.when>=s0.when+s0.duration&&fin.stops.length===0&&fin.musique.morceau!==initial.musique.morceau,fin);
 ok('respiration de 350 ms puis entrée de 1,6 s',respiration>.34&&respiration<.42&&await page.evaluate(()=>window.audioTest.courbes.find(c=>c.param===window.audioTest.starts[1].gain)?.d===1.6),respiration);
 ok('la playlist garde son choix tous les morceaux',fin.reglages.musique==='toutes'&&fin.starts.every(s=>!s.loop));
 await page.evaluate(()=>window.banc.changerMorceau(1));await page.waitForFunction(()=>window.audioTest.starts.length===3);
 const manuel=await page.evaluate(()=>{const a=window.audioTest,entree=a.courbes.find(c=>c.param===a.starts[2].gain),sortie=a.courbes.filter(c=>c.param===a.starts[1].gain).at(-1);return {entree:entree.d,sortie:sortie.d,puissance:entree.milieu**2+sortie.milieu**2};});
 // Le courant sort ici avant d'avoir fini son entrée naturelle : sa puissance est tenue, sans saut.
 ok('changement manuel : deux courbes douces de trois secondes',manuel.entree===3&&manuel.sortie===3,manuel);
 await page.waitForTimeout(450);const avantVideo=await instant();
 await page.evaluate(()=>window.banc.marquerVideo(true));ok('pause pendant la vidéo',await page.evaluate(()=>window.banc.etatMusique().statut==='pause-video'));
 await page.waitForTimeout(250);await page.evaluate(()=>window.banc.marquerVideo(false));await page.waitForFunction(()=>window.audioTest.starts.length===4);
 const reprise=await instant(),offsetAttendu=avantVideo.t-avantVideo.starts[2].when;
 ok('reprise vidéo au même offset',Math.abs(reprise.starts[3].offset-offsetAttendu)<.12,{offset:reprise.starts[3].offset,attendu:offsetAttendu});
 ok('cache de deux tampons au maximum',reprise.musique.decodes<=2,reprise.musique.decodes);
 await page.evaluate(()=>window.banc.setReglages({musiqueActive:false}));ok('pause utilisateur',await page.evaluate(()=>!window.banc.etatMusique().joue));
 ok('aucune erreur WebAudio',errors.length===0,errors);
 writeFileSync(`${dir}/rapport.json`,JSON.stringify({ok:true,fixture:{secondes:duree,octets:wav.length,sampleRate:sr},checks,initial,fin,manuel,reprise},null,2)+'\n');
 console.log(`WebAudio réel : ${checks.length} contrôles OK, morceau entier et outro audible, fin naturelle, transitions et pause vidéo.`);
}finally{await context.close();await browser.close();await srv.close();}
