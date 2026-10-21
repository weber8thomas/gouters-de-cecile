import React from 'react';
import { createPortal } from 'react-dom';
import { assetInfo, assetUrl } from '../../lib/assets';
import { useClavierModal } from '../../lib/clavier';
import { useReducedMotion } from '../../lib/motion';
import { facteurAnimations } from '../../lib/vitesse';
import type { RecetteRecue } from '../../content/types';
import { RECETTES, REPERES_RECETTES, type RecetteSlug, type RecetteTableau } from './recettesAnimees';
import { CUISINE_EVENT, Theatre, TABLEAUX } from './tableaux';
import { iconeCuisine, type IconeCuisine } from './iconesCuisine';
import './ModeCuisine.css';

type Demande={page:string;nom:string;type:RecetteTableau};
const texte=(s:string)=>s.replace(/~~[^~]*~~>\{([^}]+)\}/g,'$1').replace(/__([^_]+)__/g,'$1').replace(/\^\{([^}]+)\}/g,'$1');
function Icone({nom}:{nom:IconeCuisine}){return <span aria-hidden="true" dangerouslySetInnerHTML={{__html:iconeCuisine(nom)}}/>;}

/** Une seule recette active. Le dialogue natif isole le clavier et conserve la page du carnet. */
export function ModeCuisine({page}:{page:string}){
 const [demande,setDemande]=React.useState<Demande|null>(null);
 React.useEffect(()=>{
  const ouvrir=(e:Event)=>{const d=(e as CustomEvent<Demande>).detail;if(d?.page===page)setDemande(d);};
  window.addEventListener(CUISINE_EVENT,ouvrir);return()=>window.removeEventListener(CUISINE_EVENT,ouvrir);
 },[page]);
 return demande?createPortal(<Cuisine demande={demande} fermer={()=>setDemande(null)}/>,document.body):null;
}
function Cuisine({demande,fermer}:{demande:Demande;fermer:()=>void}){
 const recette=RECETTES[demande.type.slice(8) as RecetteSlug] as RecetteRecue;
 const reduit=useReducedMotion();
 const [etape,setEtape]=React.useState(-1),[auto,setAuto]=React.useState(false),[reprise,setReprise]=React.useState(0),[fini,setFini]=React.useState(false);
 const [coches,setCoches]=React.useState<Set<string>>(()=>new Set());
 const [pret,setPret]=React.useState(false);
 const dialog=React.useRef<HTMLDialogElement>(null),couche=React.useRef<HTMLDivElement>(null),theatre=React.useRef<Theatre|null>(null),titre=React.useRef<HTMLHeadingElement>(null);
 const position=React.useRef(0),mode=React.useRef(auto);mode.current=auto;
 const index=React.useRef(etape);index.current=etape;
 const nb=recette.etapes.length,reperes=REPERES_RECETTES[demande.type];
 const intitule=etape>=0?recette.etapes[etape].titre?.replace(/^\d+[.)]?\s*/, ''):'';
 const naviguer=(i:number)=>{setAuto(false);setFini(false);setEtape(Math.max(-1,Math.min(nb-1,i)));setReprise(v=>v+1);};
 useClavierModal(true,e=>{
  if(e.key==='Escape'){fermer();return true;}
  if(e.key==='ArrowRight'){naviguer(etape+1);return true;}
  if(e.key==='ArrowLeft'){naviguer(etape-1);return true;}
 });
 React.useEffect(()=>{
  const d=dialog.current,avant=document.activeElement as HTMLElement|null;
  d?.showModal();
  return()=>{d?.close();if(avant?.isConnected)avant.focus({preventScroll:true});};
 },[]);
 React.useEffect(()=>{if(!mode.current) titre.current?.focus({preventScroll:true});const section=dialog.current?.querySelector('.gc-cuisine__texte');if(section)section.scrollTop=0;const contenu=dialog.current?.querySelector('.gc-cuisine__contenu');if(contenu)contenu.scrollTop=0;},[etape]);
 React.useEffect(()=>{
  const host=couche.current;if(!host)return;
  const t=new Theatre(host,[{nom:demande.nom,zone:[0,0,1,1],angle:0,ordre:0}],n=>assetInfo(n)?assetUrl(n):undefined,()=>{},1000/760,demande.page);
  theatre.current=t;let raf=0;
  const attendre=()=>{if(t.disponible(demande.nom,demande.type)){setPret(true);t.rendre(demande.nom,demande.type,0,1);}else raf=requestAnimationFrame(attendre);};attendre();
  return()=>{cancelAnimationFrame(raf);t.detruire();theatre.current=null;};
 },[demande]);
 React.useEffect(()=>{
  if(!pret||etape<0)return;
  position.current=reperes[etape].debut;setFini(false);
  if(reduit){theatre.current?.rendre(demande.nom,demande.type,reperes[etape].arret,1);return;}
  let raf=0,avant=performance.now();
  const image=(maintenant:number)=>{
   const dt=document.hidden?0:Math.min(.1,(maintenant-avant)/1000);avant=maintenant;
   const maximum=mode.current?TABLEAUX[demande.type].duree:Math.max(position.current,reperes[etape].arret);
   position.current=Math.min(maximum,position.current+dt*facteurAnimations());
   const actuel=position.current>=TABLEAUX[demande.type].duree?nb-1:Math.max(0,reperes.findIndex(r=>position.current<r.fin));
   if(mode.current&&actuel!==index.current){index.current=actuel;setEtape(actuel);}
   theatre.current?.rendre(demande.nom,demande.type,position.current,1);
   if(mode.current&&position.current>=TABLEAUX[demande.type].duree){setAuto(false);setFini(true);}
   raf=requestAnimationFrame(image);
  };raf=requestAnimationFrame(image);return()=>cancelAnimationFrame(raf);
  // Chaque changement d'étape relance uniquement son geste ; la sélection auto conserve l'ordre.
 },[pret,etape,reprise,demande,nb,reduit,reperes]);
 const fullscreen=()=>{const d=dialog.current;if(document.fullscreenElement)void document.exitFullscreen();else if(d?.requestFullscreen)void d.requestFullscreen().catch(()=>{});};
 const groupes=[...recette.ingredients,...(recette.extras??[])];
 return <dialog ref={dialog} className="gc-cuisine" aria-labelledby="gc-cuisine-titre" data-gc-cuisine="" onCancel={e=>{e.preventDefault();fermer();}} onClick={e=>{if(e.target===e.currentTarget)fermer();}}>
  <div className="gc-cuisine__papier">
   <header className="gc-cuisine__entete"><span>En cuisine avec {recette.nom}{recette.sousTitre?` ${recette.sousTitre}`:''}</span><div>
    <button aria-label="Plein écran" hidden={!document.fullscreenEnabled} onClick={fullscreen}><Icone nom="agrandir"/></button>
    <button aria-label="Retour au carnet" onClick={fermer}><Icone nom="fermer"/></button>
   </div></header>
   <h1 id="gc-cuisine-titre">{texte(recette.titre)}</h1>
   <div className="gc-cuisine__contenu" data-phase={etape<0?'ingredients':'etapes'}>
    <section className="gc-cuisine__texte">
     <h2 ref={titre} tabIndex={-1}>{etape<0?'Les ingrédients':`Étape ${etape+1} sur ${nb}`}</h2>
     {etape<0?<div className="gc-cuisine__ingredients">{recette.details?.map(s=><p key={s}>{texte(s)}</p>)}{groupes.map((g,k)=><div key={k}>{g.titre&&<h3>{texte(g.titre)}</h3>}{g.lignes?.map((l,j)=>{const id=`${k}-${j}`;return <label key={id}><input type="checkbox" checked={coches.has(id)} onChange={()=>setCoches(v=>{const n=new Set(v);if(n.has(id))n.delete(id);else n.add(id);return n;})}/><span>{texte(l.texte)}</span></label>;})}{g.paragraphes?.map(s=><p key={s}>{texte(s)}</p>)}</div>)}</div>:<>
      {intitule&&/[a-zà-ÿ]/i.test(intitule)&&<h3>{texte(intitule)}</h3>}
      <p className="gc-cuisine__instruction">{texte(recette.etapes[etape].texte)}</p>
      {etape===nb-1&&<>{recette.cuisson&&<p>{texte(typeof recette.cuisson==='string'?recette.cuisson:recette.cuisson.texte)}</p>}{recette.apres?.map(s=><p key={s}>{texte(s)}</p>)}{recette.fin?.texte&&<p>{texte(recette.fin.texte)}</p>}</>}
      {fini&&<p role="status">La démonstration est terminée. Bon goûter !</p>}
     </>}
    </section>
    <div className="gc-cuisine__dessin" ref={couche} aria-hidden="true"/>
   </div>
   <footer className="gc-cuisine__pied">
    <nav aria-label="Étapes de la recette">
     <button aria-label="Précédente" disabled={etape<0} onClick={()=>naviguer(etape-1)}><Icone nom="precedent"/></button>
     <button aria-label="Voir les ingrédients" aria-pressed={etape<0} onClick={()=>naviguer(-1)}><Icone nom="ingredients"/></button>
     <output aria-live="polite">{etape<0?'Ingrédients':`${etape+1} / ${nb}`}</output>
     <button aria-label={auto?'Pas à pas':'Lecture auto'} aria-pressed={auto} disabled={reduit||!pret} onClick={()=>{if(etape<0)setEtape(0);setFini(false);setAuto(v=>!v);}}><Icone nom={auto?'etapes':'auto'}/></button>
     <button aria-label="Rejouer cette étape" disabled={etape<0} onClick={()=>{setFini(false);setReprise(v=>v+1);}}><Icone nom="rejouer"/></button>
     <button aria-label="Suivante" disabled={etape===nb-1} onClick={()=>naviguer(etape+1)}><Icone nom="suivant"/></button>
    </nav>
    {etape<0&&<button className="gc-cuisine__commencer" onClick={()=>naviguer(0)}>Commencer la préparation <Icone nom="suivant"/></button>}
    <p>Les gestes sont accélérés. Respecte les temps de cuisson et de repos de la recette.</p>
   </footer>
  </div>
 </dialog>;
}
