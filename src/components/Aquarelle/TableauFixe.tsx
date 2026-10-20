import React from 'react';
import { assetInfo, assetUrl } from '../../lib/assets';
import { cadreTableau, etatTableau, tableauDe, TABLEAUX, vueTableau } from './tableaux';

/** Même distribution que le théâtre vivant, pour les feuillets tournants et le mode doux.
 * Le livre n'échange plus une image composite contre une autre au démarrage d'une action. */
export function TableauFixe({ nom, page, zone }: { nom: string; page: string; zone: [number, number, number, number] }) {
  const type = tableauDe(nom);
  if (!type) return null;
  const logique = (a: string) => a.startsWith('aquarelles/') ? a : `aquarelles/scenes/${a}`;
  const aspects = Object.fromEntries(TABLEAUX[type].assets.map(a => { const i=assetInfo(logique(a)); return [a, i ? i.w/i.h : 1]; }));
  const e=etatTableau(type,0,aspects,nom), cadre=cadreTableau(page,nom,zone);
  return <svg aria-hidden="true" viewBox={vueTableau(type)} preserveAspectRatio="xMidYMid meet" style={{position:'absolute',left:`${(cadre[0]-zone[0])/zone[2]*100}%`,top:`${(cadre[1]-zone[1])/zone[3]*100}%`,width:`${cadre[2]/zone[2]*100}%`,height:`${cadre[3]/zone[3]*100}%`,overflow:'hidden'}}>
    {e.acteurs.map((a,k)=>{const h=a.w/(aspects[a.asset]??1);return <image key={k} href={assetUrl(logique(a.asset))} x={-a.w/2} y={-h/2} width={a.w} height={h} transform={`translate(${a.x} ${a.y}) rotate(${a.angle})`} opacity={a.alpha}/>;})}
    {e.flammes?.map((f,k)=><path key={`f${k}`} d="M0,1 C-1.1,.2 -.7,-.9 0,-1.8 C.2,-.6 1.1,-.1 0,1Z" fill="#d58c42" transform={`translate(${f.x} ${f.y}) rotate(${f.angle}) scale(${f.rayon})`} opacity={f.force}/>)}
  </svg>;
}
