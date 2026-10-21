/** Gestes partagés : mêmes courbes pour chaque recette, sans horloge ni DOM propres. */
import { cloche, lisse } from './scenes';
import type { Acteur } from './tableaux';
export const transition = (s: number, a: number, b: number) => Math.max(0, Math.min(1, lisse((s-a)/(b-a))));
export const acteur = (asset:string,x:number,y:number,w:number,angle=0,alpha=1):Acteur => ({asset,x,y,w,angle,alpha});
const art=(n:string)=>`aquarelles/acteurs/${n}`;
/** Un trajet en arche se pose avec vitesse nulle, sans rebond artificiel. */
export function fruitAuBol(asset:string,s:number,debut:number,fin:number,retrait:number,retour:number,repos:[number,number],arrivee:[number,number],w:number,angle=0):Acteur {
  const q=transition(s,debut,fin)*(1-transition(s,retrait,retour));
  return acteur(asset,repos[0]+(arrivee[0]-repos[0])*q,repos[1]+(arrivee[1]-repos[1])*q-180*Math.sin(Math.PI*q),w,angle*q);
}
export function casserOeuf(s:number):Acteur[] {
  const avance=transition(s,.7,2.4)*(1-transition(s,11.2,13.5));
  const casse=transition(s,2.6,3.1)*(1-transition(s,10.8,11.2)),tombe=transition(s,3.2,4.25);
  const x=185+315*avance,y=260-75*avance;
  return [acteur(art('oeuf'),x,y,150,0,1-casse),acteur(art('coquille-gauche'),x-70*casse,y-10*casse,125,-35*casse,casse),acteur(art('coquille-droite'),x+70*casse,y-10*casse,125,35*casse,casse),acteur(art('jaune'),500,230+175*tombe*tombe,115,0,casse*(1-transition(s,4.1,4.45)))];
}
export function fouetter(s:number,debut:number,fin:number):Acteur {
  const approche=transition(s,debut,debut+1)*(1-transition(s,fin,fin+1.6)),bat=cloche(s,debut+.5,fin);
  return acteur(art('fouet'),785-265*approche+bat*30*Math.sin(s*9),210+125*bat+10*bat*Math.sin(s*18),250,-40*approche+bat*8*Math.sin(s*9),transition(s,debut,debut+.5)*(1-transition(s,fin+.6,fin+1.1)));
}
/** Un récipient approche, s'incline au-dessus du bol, puis revient à sa place. */
export function verser(asset:string,s:number,debut:number,fin:number,repos:[number,number],w:number,angle:number) {
  const approche=transition(s,debut,debut+1)*(1-transition(s,fin+1,fin+2));
  const inclinaison=transition(s,debut+1,debut+1.7)*(1-transition(s,fin,fin+.7));
  return {acteur:acteur(asset,repos[0]+(660-repos[0])*approche,repos[1]+(220-repos[1])*approche,w,angle*inclinaison),debit:cloche(s,debut+1.6,fin)};
}
