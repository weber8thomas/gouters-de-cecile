import React from 'react';

export interface FarineCachetteRef { balayer: () => void }

/** Dépôt mat, brosse granuleuse et gestes conservés. Aucun travail ne tourne entre deux gestes. */
export const FarineCachette = React.forwardRef<FarineCachetteRef, { actif: boolean; decouvrir: () => void }>(function FarineCachette({ actif, decouvrir }, ref) {
  const toile = React.useRef<HTMLCanvasElement>(null);
  const brosse = React.useRef<HTMLCanvasElement | null>(null);
  const geste = React.useRef<{ id: number; x: number; y: number; distance: number } | null>(null);
  const poidsInitial = React.useRef(0), coup = React.useRef(0), termine = React.useRef(false);
  const [etat, setEtat] = React.useState('La farine peut être balayée. Répète les gestes pour dégager ce qui se trouve dessous.');
  const largeur = 384, hauteur = 288;
  React.useEffect(() => {
    const ctx = toile.current?.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
    let graine = 1249;
    const hasard = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    const image = ctx.createImageData(largeur, hauteur);
    const amas = [[.37,.36,.30,.24], [.60,.44,.28,.30], [.40,.68,.32,.20], [.69,.66,.19,.21], [.22,.57,.15,.18]];
    let poids = 0;
    for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) {
      const u = x / largeur, v = y / hauteur;
      let densite = 0;
      for (const [cx, cy, rx, ry] of amas) densite += Math.exp(-2.8 * (((u-cx)/rx)**2 + ((v-cy)/ry)**2));
      const grain = hasard();
      const bord = .90 + .13*Math.sin(x*.073+y*.047) + .09*Math.sin(x*.183-y*.139);
      const chance = Math.min(.99, densite * bord * 1.9);
      if (grain > chance) continue;
      const i = (y * largeur + x) * 4;
      // Blanc cassé neutre : pas d'aplat ocre ni de halos transparents additionnés.
      const nuance = Math.floor(hasard()*12);
      image.data[i] = 252 - nuance; image.data[i+1] = 249 - nuance; image.data[i+2] = 239 - nuance;
      image.data[i+3] = Math.round(150 + hasard()*105); poids += image.data[i+3];
    }
    ctx.putImageData(image, 0, 0); poidsInitial.current = poids;
    const pinceau = document.createElement('canvas'); pinceau.width = 88; pinceau.height = 76;
    const bc = pinceau.getContext('2d');
    if (bc) {
      const empreinte = bc.createImageData(88,76);
      for (let y=0;y<76;y++) for(let x=0;x<88;x++) {
        const r = Math.hypot((x-44)/44,(y-38)/38);
        const bord = 1 + .10*Math.sin(x*.6+y*.17) + .08*Math.cos(y*.8);
        const force = Math.max(0, Math.min(1, (bord-r)*3));
        empreinte.data[(y*88+x)*4+3] = Math.round(force*(.35+hasard()*.65)*255);
      }
      bc.putImageData(empreinte,0,0); brosse.current=pinceau;
    }
  }, []);
  React.useEffect(() => { if (!actif) geste.current = null; }, [actif]);
  const possible = () => actif && !document.hidden && !termine.current;
  const tracer = (deX: number, deY: number, x: number, y: number) => {
    if (!possible()) return;
    const ctx=toile.current?.getContext('2d'), empreinte=brosse.current;if(!ctx||!empreinte)return;
    ctx.globalCompositeOperation='destination-out';
    const n=Math.max(1,Math.ceil(Math.hypot(x-deX,y-deY)/7));
    for(let k=0;k<=n;k++) ctx.drawImage(empreinte,deX+(x-deX)*k/n-44,deY+(y-deY)*k/n-38);
    ctx.globalCompositeOperation='source-over';
  };
  const mesurer = () => {
    if (!possible()) return;
    const ctx=toile.current?.getContext('2d');if(!ctx||!poidsInitial.current)return;
    const pixels=ctx.getImageData(0,0,largeur,hauteur).data;let restant=0;
    for(let i=3;i<pixels.length;i+=4)restant+=pixels[i];
    const avancement=1-restant/poidsInitial.current;
    setEtat(avancement<.22 ? 'Un peu de farine s’écarte. Continue à balayer.' : avancement<.60 ? 'Quelques traits apparaissent sous la farine.' : 'Les mots deviennent lisibles. Encore un peu de farine à écarter.');
    if(avancement>=.83){termine.current=true;decouvrir();}
  };
  const balayerUnPeu = () => {
    if(!possible())return;
    // Une pression = un petit coup de brosse. Même progression au clavier et au toucher.
    const rangs=[.49,.31,.68,.18,.82,.40,.59];
    const y=rangs[coup.current%rangs.length]*hauteur;coup.current++;
    tracer(largeur*.26,y,largeur*.74,y+Math.sin(coup.current)*13);mesurer();
  };
  React.useImperativeHandle(ref,()=>({balayer:balayerUnPeu}));
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r=e.currentTarget.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*largeur,y:(e.clientY-r.top)/r.height*hauteur};
  };
  return <>
    <canvas ref={toile} width={largeur} height={hauteur} className="gc-secrets__farine" aria-hidden="true"
      onPointerDown={(e)=>{e.preventDefault();e.stopPropagation();if(!possible())return;const p=point(e);geste.current={id:e.pointerId,...p,distance:0};e.currentTarget.setPointerCapture(e.pointerId);tracer(p.x,p.y,p.x,p.y);}}
      onPointerMove={(e)=>{const g=geste.current;if(g?.id!==e.pointerId||!possible())return;e.stopPropagation();const p=point(e);g.distance+=Math.hypot(p.x-g.x,p.y-g.y);tracer(g.x,g.y,p.x,p.y);g.x=p.x;g.y=p.y;}}
      onPointerUp={(e)=>{e.stopPropagation();const g=geste.current;if(g?.id!==e.pointerId)return;geste.current=null;if(g.distance<8)balayerUnPeu();else mesurer();}}
      onPointerCancel={()=>{geste.current=null;}} onClick={(e)=>e.stopPropagation()}/>
    <span className="gc-quete__annonce" role="status" aria-live="polite">{etat}</span>
  </>;
});
