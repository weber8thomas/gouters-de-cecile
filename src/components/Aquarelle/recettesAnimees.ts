/** Une scène par vraie étape, pas une suite de mouvements indépendants des recettes. */
import lisa from '../../content/recettes/lisa.json';
import emeline from '../../content/recettes/emeline.json';
import clemence from '../../content/recettes/clemence.json';
import pierrette from '../../content/recettes/pierrette.json';
import anatole from '../../content/recettes/anatole.json';
import lise from '../../content/recettes/lise.json';
import julien from '../../content/recettes/julien.json';
import laura from '../../content/recettes/laura.json';
import { acteur, transition, fruitAuBol, fouetter, casserOeuf, verser } from './gestesCuisine';
import { cloche } from './scenes';
import type { EtatTableau } from './tableaux';

const RECETTES={lisa,emeline,clemence,pierrette,anatole,lise,julien,laura};
export type RecetteSlug=keyof typeof RECETTES;
export type RecetteTableau=`recette-${RecetteSlug}`;
const art=(n:string)=>`aquarelles/acteurs/${n}`;
const fini:Record<RecetteSlug,string>={lisa:'carotte',emeline:'fondant-chocolat',clemence:'framboises-speculoos',pierrette:'citron',anatole:'tarte-myrtilles',lise:'tarte-pommes',julien:'cookies',laura:'crepes-banane'};
const dessert=Object.fromEntries(Object.entries(fini).map(([k,v])=>[k,`aquarelles/${v}`])) as Record<RecetteSlug,string>;dessert.lisa=art('carrot-cake');dessert.pierrette=art('cake-citron');
export function recetteDe(page:string,nom:string):RecetteTableau|undefined{
  const slug=page.replace(/-droite$/,'') as RecetteSlug;
  return page.endsWith('-droite')&&slug in fini&&fini[slug]===nom?`recette-${slug}`:undefined;
}
const GESTES:Record<RecetteSlug,string[]>={
 lisa:['Fouetter les œufs et le sucre','Ajouter huile, vanille et épices','Fouetter progressivement la pâte','Incorporer carottes et noix','Verser dans le moule','Cuire puis laisser refroidir'],
 emeline:['Casser le chocolat, fondre avec le beurre','Fouetter les œufs et le sucre','Incorporer chocolat, farine et sel','Verser dans le moule puis cuire','Laisser tiédir le cœur fondant'],
 clemence:['Émietter les biscuits, mélanger au beurre','Fouetter crème, sucre et œufs','Verser sur le biscuit et ajouter les fruits','Cuire, refroidir puis réfrigérer','Décorer de framboises et de coulis'],
 pierrette:['Parfumer le sucre avec les zestes','Fouetter avec les œufs','Ajouter crème, farine et beurre','Cuire le cake et préparer le sirop','Imbiber le cake de sirop tiède'],
 anatole:['Étaler et piquer la pâte','Saupoudrer de poudre d’amandes','Ajouter les myrtilles sucrées','Cuire la tarte','Refroidir et servir avec de la crème'],
 lise:['Étaler la pâte dans le moule','Découper et disposer les pommes','Mélanger crème, œufs, cannelle et sucre','Cuire la tarte aux pommes'],
 julien:['Crémer beurre et sucres, ajouter l’œuf','Incorporer farine, pépites et noisettes','Former les boules et réserver au frais','Cuire les cookies','Laisser tiédir sur la plaque'],
 laura:['Mélanger œufs, farine, sucre et lait','Verser la pâte dans la crêpière','Retourner la crêpe','Garnir de chocolat, banane et chantilly'],
};
// Même horloge et mêmes outils pour les huit recettes. Chargement limité aux sprites de la page.
const COMMUNS=['bol','oeuf','coquille-gauche','coquille-droite','jaune','fouet','sac-farine','pichet-lait','pate','sucre','beurre','beurre-fondu','moule','four','tamis'];
const EXTRAS:Record<RecetteSlug,string[]>={lisa:['carottes-rapees','noix','gousse','carrot-cake'],emeline:['chocolat','chocolat-fondu','casserole'],clemence:['speculoos','speculoos-gauche','speculoos-droite','framboise','chantilly'],pierrette:['cake-citron'],anatole:['myrtilles','rouleau','chantilly','pate-sablee'],lise:['pomme-coupee','rouleau','pate-sablee'],julien:['chocolat','noix','boules-cookies'],laura:['crepe','poele','louche','banane','banane-rondelles','chantilly','chocolat-fondu']};
export const RECETTES_TABLEAUX=Object.fromEntries(Object.entries(RECETTES).map(([slug,r])=>{
 const s=slug as RecetteSlug;
 if(GESTES[s].length!==r.etapes.length)throw new Error(`Étapes illustrées incomplètes : ${s}`);
 return [`recette-${s}`,{duree:r.etapes.length*8,libelle:`La recette de ${r.nom} se prépare étape par étape`,assets:[...new Set([...COMMUNS,...EXTRAS[s]].map(art).concat([dessert[s],'aquarelles/scenes/citron-entier','aquarelles/scenes/citron-gauche','aquarelles/scenes/citron-droite','aquarelles/scenes/couteau','aquarelles/pomme']))],uneFois:true}];
})) as Record<RecetteTableau,{duree:number;libelle:string;assets:string[];uneFois:boolean}>;
export const ETAPES_RECETTES=Object.fromEntries(Object.entries(RECETTES).map(([slug,r])=>[`recette-${slug}`,r.etapes.map((_,k)=>(k+1)*8-(k===r.etapes.length-1?0:1.2))])) as Record<RecetteTableau,number[]>;

/** Les poses changent parce que l’ingrédient est transformé ; la dernière étape garde le résultat. */
export function etatRecette(type:RecetteTableau,temps:number):EtatTableau {
 const slug=type.slice(8) as RecetteSlug,n=GESTES[slug].length;
 const i=Math.min(n-1,Math.floor(Math.max(0,temps)/8)),s=Math.min(7.999,Math.max(0,temps-i*8));
 const e:EtatTableau={phase:`${slug}-etape-${i+1}`,acteurs:[],liquide:[0,0],jet:0,tasseVisee:0,legende:{etape:i+1,total:n,texte:GESTES[slug][i]}};
 const a=(name:string,x:number,y:number,w:number,angle=0,alpha=1)=>acteur(art(name),x,y,w,angle,alpha);
 const bol=()=>{e.acteurs.push(a('bol',500,430,580));e.recipient={index:0,coupe:.45};};
 const surface=(chocolat=false,alpha=1)=>{const tin=e.acteurs[0]?.asset===art('moule');e.surface={cx:500,cy:tin?385:327,rx:tin?210:195,ry:tin?50:35,alpha,asset:art(chocolat?'chocolat-fondu':'pate')};};
 const poudre=(debut=1,fin=5,couleur='#e9dfc8')=>{e.couleurMiettes=couleur;e.miettes=Array.from({length:15},(_,k)=>{const q=(s*.9+k/15)%1;return{x:500+Math.sin(k*7)*100,y:170+q*q*165,rayon:2+k%3,alpha:cloche(s,debut,fin)*Math.sin(Math.PI*q)}});};
 const battre=(chocolat=false)=>{bol();surface(chocolat,transition(s,2,4));e.acteurs.push(fouetter(s,0,6));};
 const ajouter=(nom:string,k=0,w=180)=>{const q=transition(s,1+k*.7,3+k*.7);e.acteurs.push(a(nom,260+k*480+(500-(260+k*480))*q,210+120*q*q,w,-25*q,1-transition(s,3.1+k*.7,4.8+k*.7)));};
 const sucre=()=>{const v=verser(art('sucre'),s,0,4,[800,250],225,-65);e.acteurs.push(v.acteur);poudre(1.5,4.5);};
 const oeufs=()=>e.acteurs.push(...casserOeuf(s));
 const farine=()=>{const v=verser(art('sac-farine'),s,.3,4.5,[780,210],220,-70);e.acteurs.push(v.acteur);poudre(1.8,4.5);};
 const verse=(nom='pichet-lait',couleur='#eee0bd')=>{const v=verser(art(nom),s,.2,4.8,[800,260],260,-48);e.acteurs.push(v.acteur);e.versement={origine:[v.acteur.x-85,v.acteur.y+12],cible:[500,330],alpha:v.debit,couleur};};
 const moule=()=>{e.acteurs.push(a('moule',500,440,640));e.recipient={index:0,coupe:.47,forme:'moule'};};
 const resultat=(w=710)=>{e.acteurs.push(acteur(dessert[slug],500,390,w,0));};
 const cuire=()=>{e.acteurs.push(a('four',650,340,520));const q=transition(s,.8,3.2);e.acteurs.push(a('moule',220+400*q,420-40*q,330-110*q,0,1-transition(s,2.5,3.8)));if(s>4)e.acteurs.push(acteur(dessert[slug],365,390,440,0,transition(s,4,5.5)));};
 const fruit=(nom:string,k:number,w=170)=>{const p=fruitAuBol(art(nom),s,.5+k*.7,2.7+k*.7,20,21,[220+560*k,150],[440+120*k,310],w,(k?1:-1)*25);e.acteurs.push(p);};
 const etaler=()=>{moule();e.acteurs.push({...a('pate-sablee',500,385,500),sy:.34});const q=Math.sin(s*2.1)*cloche(s,.5,6);e.acteurs.push(a('rouleau',500+140*q,200,420,-12));};
 if(slug==='emeline'&&i===0){
  e.acteurs=[a('casserole',500,440,590)];e.recipient={index:0,coupe:.55,forme:'casserole'};
  const casse=transition(s,.6,1.2),tombe=transition(s,1.5,3),fondu=transition(s,3,6);
  e.acteurs.push(a('chocolat',450,180,330,0,1-casse));
  e.acteurs.push({...a('chocolat',450-70*casse,180+240*tombe*tombe,330,-15*casse,casse*(1-fondu)),clip:[0,0,.5,1]});
  e.acteurs.push({...a('chocolat',450+70*casse,180+240*tombe*tombe,330,15*casse,casse*(1-fondu)),clip:[.5,0,.5,1]});
  e.acteurs.push(a('beurre',740-200*tombe,200+220*tombe*tombe,180*(1-.5*fondu),0,1-fondu));
  e.surface={cx:420,cy:425,rx:156,ry:62,alpha:fondu,asset:art('chocolat-fondu')};
 }else if((slug==='emeline'&&i===1)||(slug==='lisa'&&i===0)||(slug==='pierrette'&&i===1)||(slug==='julien'&&i===0)){
  battre();oeufs();sucre();if(slug==='julien')ajouter('beurre');
 }else if((slug==='emeline'&&i===2)||(slug==='lisa'&&i===1)||(slug==='pierrette'&&i===2)){
  battre(slug==='emeline');if(slug==='emeline')verse('casserole','#603523');else verse();farine();if(slug==='pierrette')ajouter('beurre');
 }else if(slug==='lisa'&&i===2){battre();
 }else if(slug==='lisa'&&i===3){battre();ajouter('carottes-rapees');ajouter('noix',1);
 }else if((slug==='lisa'&&i===4)||(slug==='emeline'&&i===3)){
  moule();surface(slug==='emeline',transition(s,1,4));const v=verser(art('bol'),s,0,4,[780,210],320,-65);e.acteurs.push(v.acteur);e.versement={origine:[570,220],cible:[500,380],alpha:v.debit,couleur:slug==='emeline'?'#603523':'#e7d09a'};
  if(slug==='emeline'){const q=transition(s,3.5,4.5);e.acteurs.forEach(a=>a.alpha*=1-q);if(e.surface)e.surface.alpha*=1-q;const n=e.acteurs.length;cuire();e.acteurs.slice(n).forEach(a=>a.alpha*=q);}

 }else if(slug==='clemence'&&i===0){
  moule();const q=transition(s,.6,1.2);e.acteurs.push(a('speculoos',500,175,300,0,1-q),a('speculoos-gauche',500-60*q,175,180,-15*q,q),a('speculoos-droite',500+60*q,175,180,15*q,q));poudre(1,5,'#b68850');ajouter('beurre',0,150);
 }else if(slug==='clemence'&&i===1){battre();ajouter('chantilly');oeufs();sucre();
 }else if(slug==='clemence'&&i===2){moule();surface(false,transition(s,0,2));fruit('framboise',0,150);fruit('framboise',1,130);
 }else if(slug==='clemence'&&i===4){resultat();e.acteurs.push(fruitAuBol(art('framboise'),s,.5,3,20,21,[180,100],[470,260],160,-20),fruitAuBol(art('framboise'),s,1.5,4,20,21,[820,110],[560,270],140,25));
 }else if(slug==='pierrette'&&i===0){bol();sucre();const q=transition(s,.5,4);e.acteurs.push(acteur('citron-entier',500+95*Math.sin(s*5)*cloche(s,1,4),200,240,25*q));poudre(1,5,'#d8b455');
 }else if(slug==='pierrette'&&i===4){resultat();verse('pichet-lait','#d3b859');
 }else if((slug==='anatole'&&i===0)||(slug==='lise'&&i===0)){etaler();
 }else if(slug==='anatole'&&i===1){moule();e.acteurs.push({...a('pate-sablee',500,385,500),sy:.34},a('tamis',500+35*Math.sin(s*7)*cloche(s,1,5),200,300));poudre(1,5);
 }else if(slug==='anatole'&&i===2){moule();e.acteurs.push({...a('pate-sablee',500,385,500),sy:.34});fruit('myrtilles',0,260);fruit('myrtilles',1,220);sucre();
 }else if(slug==='anatole'&&i===4){resultat();e.acteurs.push(fruitAuBol(art('chantilly'),s,.5,3,20,21,[800,150],[600,290],190));
 }else if(slug==='lise'&&i===1){
  moule();const coupe=transition(s,1,2),arrive=transition(s,3,5);
  e.acteurs.push(acteur('aquarelles/pomme',450,180,280,0,1-coupe),{...a('pomme-coupee',450-80*coupe,180+230*arrive,280,-30*coupe,coupe),sy:1-.65*arrive},{...a('pomme-coupee',450+80*coupe,180+230*arrive,280,30*coupe,coupe),sy:1-.65*arrive},acteur('couteau',550,60+180*Math.sin(Math.PI*transition(s,.5,2.5)),240,-30,1-transition(s,2.7,3.3)));
 }else if(slug==='lise'&&i===2){battre();oeufs();sucre();verse();
 }else if(slug==='julien'&&i===1){battre(true);farine();ajouter('chocolat',0,200);ajouter('noix',1,180);
 }else if(slug==='julien'&&i===2){
  moule();for(let k=0;k<4;k++){const q=transition(s,.5+k*.65,2+k*.65);e.acteurs.push({...a('boules-cookies',500,180+220*q,440,0,q),clip:[(k%2)*.5,Math.floor(k/2)*.5,.5,.5]});}
 }else if(slug==='laura'&&i===0){battre();oeufs();farine();verse();
 }else if(slug==='laura'&&i===1){
  e.acteurs.push(a('poele',500,430,680));const q=transition(s,.5,2);e.acteurs.push(a('louche',760-160*q,160,300,-45*q));e.surface={cx:450,cy:410,rx:170,ry:60,alpha:transition(s,2,4),asset:art('pate')};e.versement={origine:[570,250],cible:[450,410],alpha:cloche(s,1.6,3.8),couleur:'#e4d2aa'};
 }else if(slug==='laura'&&i===2){
  e.acteurs.push(a('poele',500,430,680));const q=cloche(s,1,5),vole=Math.sin(Math.PI*transition(s,1,5));e.acteurs.push(a('crepe',450,400-240*vole,390,180*transition(s,1,5)));e.acteurs.at(-1)!.sy=1-.84*q;
 }else if(slug==='laura'&&i===3){
  resultat();const q=transition(s,.5,2);e.acteurs.push(a('banane',500,140,280,0,1-q),a('banane-rondelles',500,140+120*q,320,0,q),a('chantilly',650,260,170,0,transition(s,3,4.5)));
 }else if(i===n-1&&slug!=='lisa'){resultat();
 }else{cuire();}
 // Une respiration courte entre deux opérations, sans échange brutal d’illustration.
 const apparition=(i===0?1:transition(s,0,.45))*(i<n-1?1-transition(s,7.4,8):1);e.acteurs.forEach(x=>x.alpha*=apparition);
 if(e.surface)e.surface.alpha*=apparition;
 return e;
}
