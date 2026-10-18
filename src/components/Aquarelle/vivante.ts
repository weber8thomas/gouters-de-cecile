// Aquarelles vivantes : un petit moteur WebGL qui donne vie aux aquarelles d'une page, comme les images
// d'un livre de magie. UNE toile par page (ToileAquarelles), posée sur toute la page : chaque aquarelle y
// est dessinée dans sa boîte (sa zone vivante, inclinée, avec un débord pour la vapeur et les sauts), puis
// les créatures de la double page (creatures.ts) par-dessus.
//
// À la première arrivée sur la page, chaque aquarelle se dessine toute seule : le crayon trace les traits
// l'un après l'autre (carte du tracé cuite par scripts/bake-trace-aquarelles.py), puis la couleur s'étend
// zone par zone depuis leur cœur, front mouillé plus sombre, pigment humide qui sèche.
// Puis elle vit : elle respire et se balance, et ses parties mobiles (parties.json, cuites par
// scripts/bake-parties-aquarelles.py) jouent de petites scènes de marionnette (scenes.ts) toutes les 6 à 15 s
// et au toucher : le couvercle de la théière se soulève et claque, la framboise rebondit, le cookie se
// casse… Ses effets (effets.ts) : vapeur en volutes, bougies qui vacillent, vent, reflet, miettes et
// gouttes, ronds dans le café, confettis, fanions qui ondulent. Sous le curseur ou le doigt qui glisse,
// l'image se bombe et ses parties sont bousculées (ressorts).
//
// Les aquarelles cuites sont teintées du papier (bake-aquarelles.py) : la toile se pose simplement sur la
// page (alpha prémultiplié), sans mode de fusion. 30 images/s au plus, rien quand la page est cachée, le
// livre en mouvement ou l'onglet masqué. Contexte WebGL perdu : les images fixes reviennent.

import { ecouterPointeur } from '../../lib/pointeur';
import { facteurAnimations } from '../../lib/vitesse';
import { EFFETS, SCENES_PAGE, type Effets } from './effets';
import { REPOS, SCENES, poseNeutre, type Ctx, type Fx } from './scenes';
import { essaimDe, ESPECES, type Essaim } from './creatures';
import partiesJson from './parties.json';

export type { Effets } from './effets';

interface PartieInfo {
  nom: string;
  pivot: [number, number];
  boite: [number, number, number, number];
  rayon: number;
}
const PARTIES = partiesJson as unknown as Record<string, { parties: PartieInfo[] }>;

/** Parties mobiles d'une aquarelle (parties.json). */
export const partiesDe = (nom: string): PartieInfo[] => PARTIES[nom]?.parties ?? [];

/** Débord de la boîte de chaque aquarelle autour de sa zone (fractions de la zone) : gauche, haut, droite, bas. */
export const DEBORD = [0.15, 0.5, 0.15, 0.08] as const;

/** Teinte du papier (bake-aquarelles.py, PAPIER) : le pigment que le moteur ajoute est posé dessus. */
const PAPIER = [0.9, 0.857, 0.737] as const;

/**
 * Le pas de temps des animations (ms) : le SEUL endroit où leur temps avance, borné (un onglet qui se
 * réveille ne saute pas), multiplié par le réglage « Vitesse des animations ».
 */
export const pas = (ms: number): number => Math.min(100, Math.max(0, ms)) * facteurAnimations();

const MAX_PARTIES = 6;
const MAX_VAPEUR = 4;
const MAX_FLAMMES = 5;

// ---- Shaders -----------------------------------------------------------------------------------------
const TETE = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

// Une aquarelle : sa boîte dans la page, inclinée autour du centre de sa zone.
const VS_DESSIN = `attribute vec2 p;
uniform vec4 boite; // la boîte (zone + débord) dans la page : x, y, largeur, hauteur (fractions de la page)
uniform vec4 rot;   // centre de la zone (fractions de la page), cos, sin de l'inclinaison
uniform float aspP; // proportions de la page (largeur / hauteur)
varying vec2 v;
void main(){
  v=p;
  vec2 P=boite.xy+p*boite.zw;
  vec2 d=(P-rot.xy)*vec2(aspP,1.);
  d=vec2(d.x*rot.z-d.y*rot.w,d.x*rot.w+d.y*rot.z);
  P=rot.xy+d/vec2(aspP,1.);
  gl_Position=vec4(P.x*2.-1.,1.-P.y*2.,0.,1.);
}`;

const FS_DESSIN = `${TETE}
varying vec2 v;
uniform sampler2D img;          // l'aquarelle (teintée du papier, prémultipliée)
uniform sampler2D carteN,carteL; // carte du tracé, lue au plus proche (temps du crayon) et lissée (couleur)
uniform sampler2D parts;        // numéro de la partie de chaque pixel (× 40)
uniform sampler2D fond;         // ce que découvre une partie qui bouge
uniform vec4 rect;              // l'image dans la boîte : x, y, l, h
uniform vec2 asp;               // proportions de la boîte (l/h), de l'image (l/h)
uniform vec4 tp;                // temps (s), peinture (0 à 1), carte du tracé (0/1), nombre de parties
uniform vec2 tpx;               // un texel de la carte du tracé
uniform vec3 souris;            // la main dans la boîte (0 à 1), force (0 : absente)
uniform vec4 gA,gB;             // pose du corps : pivot (x, y), translation ; angle, sx, sy, ploiement
uniform vec4 pA[${MAX_PARTIES}],pB[${MAX_PARTIES}],pC[${MAX_PARTIES}]; // parties : idem, et pC.x : elle a bougé (0 à 1)
uniform vec4 vap[${MAX_VAPEUR}];   // vapeur : x, y, largeur, force
uniform vec4 fl[${MAX_FLAMMES}];   // flammes : x, y, rayon, intensité
uniform vec4 flv[${MAX_FLAMMES}];  // flammes : penche, fumée
uniform vec4 ef;                // vent, reflet, nombre de flammes, 0
uniform vec4 fa;                // fanions : y de la ficelle, creux, force
uniform vec4 ge,geB;            // gerbe : x, y, largeur, âge ; élan, sol, x, y de la couleur
uniform vec4 on;                // ondes : x, y, rayon, âge
uniform vec4 cf;                // confettis : x, y, largeur, âge
uniform float cft;              // confettis : taille (mise à l'échelle de la page, pas de l'image)
uniform vec3 pap;               // teinte du papier
float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 q){float s=0.,a=.5;for(int k=0;k<4;k++){s+=a*n(q);q=q*2.03+vec2(1.7,9.2);a*=.5;}return s;}
bool dehors(vec2 u){return u.x<0.||u.y<0.||u.x>1.||u.y>1.;}
vec4 lire(vec2 u){return dehors(u)?vec4(0.):texture2D(img,u);}
float ident(vec2 u){return dehors(u)?0.:floor(texture2D(parts,u).r*255./40.+.5);}
vec4 sur(vec4 a,vec4 b){return a+b*(1.-a.a);}
// d'une position affichée (unités de l'image : la hauteur vaut 1) à sa position au repos
vec2 inv(vec2 q,vec4 a,vec4 b){
  vec2 d=q-a.xy-a.zw;
  float an=-(b.x+b.w*length(d));
  float c=cos(an),s=sin(an);
  d=vec2(d.x*c-d.y*s,d.x*s+d.y*c);
  return a.xy+d/vec2(b.y,b.z);
}
// les flammes peintes : elles ondulent, penchent, rapetissent vers la mèche quand elles s'éteignent ;
// hors de la flamme qui reste : rien (x < 0)
vec2 flam(vec2 u){
  for(int k=0;k<${MAX_FLAMMES};k++){
    if(float(k)>=ef.z)break;
    vec4 F=fl[k];
    vec2 f=(u-F.xy)/F.z;
    if(abs(f.x)<1.9&&f.y>-2.8&&f.y<1.25){
      float fk=float(k);
      float pres=exp(-dot(f,f)*.6);
      float haut=clamp(1.2-f.y,0.,3.);
      f.x+=pres*(.32*sin(tp.x*9.+f.y*3.+fk*1.7)+.18*sin(tp.x*15.3+fk))-flv[k].x*haut*.35;
      f.y+=pres*.26*sin(tp.x*7.1+fk*2.3)*clamp(-f.y+1.,0.,2.);
      vec2 m=vec2(0.,1.2);
      f=m+(f-m)/max(F.w,.03);
      if(abs(f.x)>1.9||f.y<-2.8)return vec2(-1.);
      u=F.xy+f*F.z;
    }
  }
  return u;
}
float tc(vec2 q){
  if(dehors(q))return 1.;
  vec4 m=texture2D(carteN,q);return m.r*(65280./65535.)+m.g*(255./65535.);}
float trace(float x,float p){return step(x,p)*step(x,.9999);}
vec4 volute(vec4 s,vec2 uv,float ai){
  if(s.z<=0.||s.w<=0.)return vec4(0.);
  vec2 q=(uv-s.xy)/s.z;
  q.y/=ai;                          // l'unité est la largeur de la source, dans les deux sens
  float H=2.5+.9*(s.w-1.);          // un jet monte plus haut
  if(q.y>.1||q.y<-H-.1)return vec4(0.);
  float m=-q.y;
  float t=tp.x*(1.+.45*(s.w-1.));
  float a=0.;
  for(int k=0;k<2;k++){
    float fk=float(k);
    float ph=fk*2.4+s.x*7.;
    float cx=(fk-.5)*.3+.2*sin(m*2.6-t*1.25+ph)*m+.07*sin(m*6.-t*2.+ph*1.7);
    float w=.07+.08*m;
    float d=(q.x-cx)/w;
    float casse=smoothstep(.32,.6,fbm(vec2(m*2.6-t*.8+fk*4.,fk*7.+q.x*1.5)));
    a+=exp(-d*d)*casse*(.6+.4*sin(t*.6+fk*2.1));
  }
  a=min(a,1.)*smoothstep(0.,.3,m)*(1.-smoothstep(H*.4,H,m));
  float l=.35+.25*m;
  float voile=exp(-q.x*q.x/(l*l))*fbm(vec2(q.x*2.,m*1.2-t*.35))*smoothstep(0.,.4,m)*(1.-smoothstep(H*.28,H*.8,m));
  a=a*.5*min(s.w,2.2)+voile*.09*s.w;
  a=min(a,.6);
  return vec4(vec3(.56,.58,.62)*pap*a,a);}
void main(){
  float t=tp.x,peint=tp.y;
  vec2 uv=(v-rect.xy)/rect.zw;
  float ai=asp.y;
  vec3 lu=vec3(.3,.59,.11);
  // la main : sous le curseur ou le doigt, l'image se bombe (loupe douce) et ondule en cercles
  float o=0.;
  if(souris.z>0.){
    vec2 d=(v-souris.xy)*vec2(asp.x,1.);
    float r=length(d);
    o=exp(-r*r/.03)*souris.z;
    float onde=.007*sin(r*50.-t*8.)*exp(-r*5.)*souris.z;
    vec2 dv=d*(.3*o)+d/(r+.0001)*onde;
    uv-=vec2(dv.x/asp.x,dv.y)/rect.zw;
  }
  // fanions : la ficelle ondule (fixe aux deux bouts), chaque fanion se balance sous elle
  if(fa.z>0.){
    float x=clamp(uv.x,0.,1.);
    float env=sin(3.14159*x);
    float yc=fa.x+4.*fa.y*x*(1.-x);
    float sous=max(uv.y-yc,0.);
    float ph=t*1.6-x*6.5;
    uv.y-=fa.z*.022*env*sin(ph);
    uv.x-=fa.z*sous*.2*sin(ph-1.2)*(.4+.6*env)/ai;
  }
  // pose du corps (saut, balancement, écrasement)
  vec2 q=inv(vec2(uv.x*ai,uv.y),gA,gB);
  vec2 ub0=vec2(q.x/ai,q.y);
  // le pigment respire : un léger courant dans la couleur
  vec2 res=.0035*vec2(n(ub0*5.+vec2(t*.13,0.))-.5,n(ub0*5.+vec2(7.,t*.11))-.5);
  vec2 ub=ub0+res;
  // vent : le haut ploie, le pied reste fixe
  if(ef.x>0.){
    float haut=1.-clamp(ub.y,0.,1.);
    ub.x+=ef.x*.03*haut*haut*(sin(t*.9+ub.y*2.)*.7+sin(t*2.3+ub.x*6.)*.3);
  }
  // ronds dans le liquide (ellipse vue en perspective)
  if(on.w>=0.&&on.z>0.){
    vec2 d=(ub-on.xy)*vec2(ai,1.);
    float e=length(vec2(d.x,d.y/.38))/(on.z*ai);
    if(e<1.){
      float w=sin(e*20.-on.w*11.)*exp(-on.w*1.1)*smoothstep(1.,.6,e)*smoothstep(0.,.15,on.w);
      ub+=normalize(d+1e-5)*w*.006/vec2(ai,1.);
    }
  }
  vec2 uf=flam(ub);
  vec4 c=vec4(0.);
  if(uf.x>-.5){
    c=lire(uf);
    if(tp.w>0.){
      // un pixel d'une partie qui a bougé : le fond découvert
      float id=ident(uf);
      if(id>.5){
        float w=0.;
        for(int k=0;k<${MAX_PARTIES};k++){if(abs(id-float(k+1))<.5)w=pC[k].x;}
        if(w>0.)c=mix(c,texture2D(fond,uf),w);
      }
    }
  }
  // les parties qui bougent, de l'arrière vers l'avant
  for(int k=0;k<${MAX_PARTIES};k++){
    if(float(k)>=tp.w)break;
    float w=pC[k].x;
    if(w<=0.)continue;
    vec2 qk=inv(q,pA[k],pB[k]);
    vec2 uk=flam(vec2(qk.x/ai,qk.y)+res);
    if(uk.x<-.5)continue;
    if(abs(ident(uk)-float(k+1))<.5)c=sur(lire(uk)*w,c);
  }
  // où en est la couleur (la vapeur vient avec elle)
  float pk=tp.z>.5?clamp((peint-.52)/.48,0.,1.):peint;
  if(peint<1.&&tp.z>.5){
    // elle se dessine : le crayon suit la carte du tracé, trait après trait (les 60 premiers %), puis la
    // couleur s'étend zone par zone depuis leur cœur, front mouillé plus sombre, pigment humide qui sèche
    float pc=clamp(peint/.6,0.,1.);
    float tb=texture2D(carteL,clamp(ub,0.,1.)).b*(255./254.);
    float f=pk*1.08;
    float m=1.-smoothstep(f-.06,f,tb);
    float bord=smoothstep(f-.12,f-.02,tb)*m;
    float humide=smoothstep(f-.3,f-.04,tb);
    vec2 e=vec2(.006,.0045)*humide;
    vec4 flou=(lire(ub+e)+lire(ub-e)+lire(ub+vec2(e.x,-e.y))+lire(ub-vec2(e.x,-e.y)))*.25;
    c=mix(c,flou,humide*.8);
    c.rgb*=1.-.3*bord;
    c*=m;
    vec2 a=tpx*.35;
    float x1=tc(ub+vec2(-a.x,-a.y)),x2=tc(ub+vec2(a.x,-a.y)),x3=tc(ub+vec2(-a.x,a.y)),x4=tc(ub+a);
    float tr=(trace(x1,pc)+trace(x2,pc)+trace(x3,pc)+trace(x4,pc))*.25;
    float x=min(min(x1,x2),min(x3,x4));
    float pointe=tr*(1.-smoothstep(0.,.015,pc-x));
    tr*=.6+.4*n(ub*90.);
    tr*=1.-.8*m;
    float al=tr*.62+pointe*.25;
    c=sur(c,vec4(vec3(.32,.29,.27)*pap*al,al));
  } else if(peint<1.){
    // sans carte : l'esquisse puis la couleur partent du cœur du motif
    float k=length((ub-vec2(.5,.56))*vec2(1.,1.15))*.95+fbm(ub*3.2)*.55;
    float fe=clamp(peint/.36,0.,1.)*1.35;
    float front=clamp((peint-.3)/.66,0.,1.)*1.35;
    float m=1.-smoothstep(front-.07,front,k);
    float bord=smoothstep(front-.16,front-.04,k)*m;
    float humide=smoothstep(front-.4,front-.08,k);
    vec2 e=vec2(.006,.0045)*humide;
    vec4 flou=(lire(ub+e)+lire(ub-e)+lire(ub+vec2(e.x,-e.y))+lire(ub-vec2(e.x,-e.y)))*.25;
    c=mix(c,flou,humide*.8);
    c.rgb*=1.-.28*bord;
    c*=m;
    vec2 px=vec2(.0028,.0028*ai);
    vec4 a1=lire(ub+vec2(px.x,0.)),a2=lire(ub-vec2(px.x,0.)),a3=lire(ub+vec2(0.,px.y)),a4=lire(ub-vec2(0.,px.y));
    float g=abs(dot(a1.rgb+1.-a1.a,lu)-dot(a2.rgb+1.-a2.a,lu))+abs(dot(a3.rgb+1.-a3.a,lu)-dot(a4.rgb+1.-a4.a,lu));
    float trait=smoothstep(.05,.22,g)*(1.-smoothstep(fe-.05,fe,k));
    trait*=.55+.45*n(ub*90.);
    trait*=1.-m;
    c=sur(c,vec4(vec3(.36,.33,.3)*pap*trait*.6,trait*.6));
  }
  // reflet : une bande claire glisse lentement sur le fruit
  if(ef.y>0.&&c.a>0.){
    float b=fract(t/6.);
    float d=(ub.x*.6+ub.y*.4)-(b*1.8-.4);
    float band=exp(-d*d/.003)*smoothstep(.2,.6,c.a);
    c.rgb=mix(c.rgb,vec3(c.a)*pap,band*.42*ef.y);
  }
  // sous la main, les couleurs se ravivent
  if(o>0.){float l=dot(c.rgb,lu);c.rgb=clamp(mix(vec3(l),c.rgb,1.+.7*o),0.,c.a);}
  // les flammes rayonnent (un lavis orangé qui pulse) ; une fumée monte d'une mèche éteinte
  vec4 s=vec4(0.);
  for(int k=0;k<${MAX_FLAMMES};k++){
    if(float(k)>=ef.z)break;
    vec4 F=fl[k];
    vec2 f=(ub0-F.xy)/F.z;
    f.y/=ai;
    float i=min(F.w,1.6);
    float g=exp(-dot(f,f)*.12)*(.2+.07*sin(t*6.3+float(k))+.04*sin(t*11.))*i*pk;
    c=sur(vec4(vec3(.98,.62,.28)*pap*g,g),c);
    if(flv[k].y>0.)s+=volute(vec4(F.x,F.y+F.z*.9,F.z*1.2,flv[k].y*.9),ub0,ai)*vec4(.85,.85,.85,1.);
  }
  // une gerbe (miettes qui tombent, gouttes qui sautent et retombent)
  if(ge.w>0.&&ge.z>0.){
    vec4 cc=lire(geB.zw);
    cc=cc.a>.05?cc/cc.a:vec4(vec3(.6,.45,.3)*pap,1.);
    float g=1.7;
    for(int k=0;k<8;k++){
      float fk=float(k);
      float a0=ge.w-h(vec2(fk,5.))*.18;
      if(a0<0.)continue;
      float vy=geB.x*(.6+.8*h(vec2(fk,3.)));
      float vx=(h(vec2(fk,7.))-.5)*.22;
      float x0=ge.x+(h(vec2(fk,2.))-.5)*ge.z;
      float tsol=(-vy+sqrt(max(vy*vy+2.*g*(geB.y-ge.y),0.)))/g;
      float ta=min(a0,tsol);
      vec2 pm=vec2(x0+vx*ta,ge.y+vy*ta+.5*g*ta*ta);
      // sur la table, une miette reste un moment ; dans le café, une goutte disparaît
      float reste=geB.y>ge.y+.03?.9:0.;
      float vis=1.-smoothstep(tsol+reste,tsol+reste+.35,a0);
      vec2 d=(ub0-pm)*vec2(ai,1.);
      float r=.006+.005*h(vec2(fk,4.));
      float a=(1.-smoothstep(r*.45,r,length(d)))*vis;
      c=sur(vec4(cc.rgb*.92*a,a),c);
    }
  }
  // confettis d'aquarelle : ils jaillissent, puis planent en se balançant et en tournant sur eux-mêmes
  if(cf.w>0.&&cf.z>0.){
    for(int k=0;k<18;k++){
      float fk=float(k);
      float a0=cf.w-h(vec2(fk,11.))*.3;
      if(a0<0.)continue;
      float an=(h(vec2(fk,12.))-.5)*2.2;
      float v0=.7+.5*h(vec2(fk,13.));
      float e=(1.-exp(-2.6*a0))/2.6;
      vec2 pm=cf.xy+vec2((h(vec2(fk,14.))-.5)*cf.z,0.);
      pm+=vec2(sin(an)*v0*e/ai,-cos(an)*v0*e);
      pm.y+=.16*max(a0-e,0.);
      pm.x+=.025*sin(a0*4.+fk)/ai;
      vec2 d=(ub0-pm)*vec2(ai,1.);
      float ro=fk+a0*(3.+2.*h(vec2(fk,15.)));
      d=vec2(d.x*cos(ro)-d.y*sin(ro),d.x*sin(ro)+d.y*cos(ro));
      float fl=.25+.75*abs(cos(a0*6.+fk*1.3));   // il se retourne
      vec2 tl=vec2(.011*fl,.0065)*cft;
      vec2 qd=abs(d)/tl;
      float forme=max(qd.x,qd.y)+.25*n(d*400.+fk);
      float a=(1.-smoothstep(.8,1.05,forme))*(1.-smoothstep(2.6,3.8,a0))*.85;
      float sel=h(vec2(fk,16.));
      vec3 col=sel<.25?vec3(.93,.55,.62):sel<.5?vec3(.95,.76,.36):sel<.75?vec3(.52,.68,.86):vec3(.58,.78,.6);
      col*=1.-.25*smoothstep(.55,1.,forme);  // le bord du lavis, plus sombre
      c=sur(vec4(col*pap*a,a),c);
    }
  }
  // la vapeur passe devant le motif
  for(int k=0;k<${MAX_VAPEUR};k++)s+=volute(vap[k],ub0,ai);
  s=min(s,vec4(.6));
  c=sur(s*pk,c);
  gl_FragColor=c;
}`;

// Une créature : son quad dans la page, centré, tourné selon son cap.
const VS_CREATURE = `attribute vec2 p;
uniform vec4 cr;    // centre (fractions de la page), demi-taille (unités de la hauteur de la page)
uniform vec2 cap;   // cos, sin du cap
uniform float aspP;
varying vec2 v;
void main(){
  v=p;
  vec2 d=(p-.5)*2.*cr.zw;
  d=vec2(d.x*cap.x-d.y*cap.y,d.x*cap.y+d.y*cap.x);
  vec2 P=cr.xy+vec2(d.x/aspP,d.y);
  gl_Position=vec4(P.x*2.-1.,1.-P.y*2.,0.,1.);
}`;

const FS_CREATURE = `${TETE}
varying vec2 v;
uniform sampler2D tex;
uniform vec4 cp;   // genre (0 papillon, 1 coccinelle), ouverture (0 à 1), phase des ailes, épaules (y)
uniform vec4 om;   // ombre (0/1), flou, opacité, demi-largeur du corps
uniform vec3 pap;
vec4 sur(vec4 a,vec4 b){return a+b*(1.-a.a);}
vec4 lire(vec2 u){return (u.x<0.||u.y<0.||u.x>1.||u.y>1.)?vec4(0.):texture2D(tex,u);}
vec2 tourne(vec2 d,float a){float c=cos(a),s=sin(a);return vec2(d.x*c-d.y*s,d.x*s+d.y*c);}
// papillon : les ailes battent, vues d'en haut elles se raccourcissent vers le corps
vec4 papillon(vec2 u){
  float dx=u.x-.5,ad=abs(dx),b=om.w;
  float k=max(cp.y,.05);
  if(ad>b)ad=b+(ad-b)/k;
  vec4 c=lire(vec2(.5+sign(dx)*ad,u.y));
  if(abs(dx)>b)c.rgb*=.7+.3*k;
  return c;
}
// coccinelle : les élytres s'ouvrent, les ailes fines battent dessous
vec4 coccinelle(vec2 u){
  float o=cp.y,ye=cp.w;
  vec4 c=vec4(0.);
  if(o>0.){
    for(int k=0;k<2;k++){
      float cote=k==0?-1.:1.;
      vec2 d=u-vec2(.5+cote*.06,ye+.04);
      d=tourne(d,cote*(1.1+.45*sin(cp.z)));
      float e=length(vec2(d.x/.14,(d.y-.3)/.32));
      float a=(1.-smoothstep(.75,1.,e))*.38*o;
      c=sur(vec4(vec3(.62,.6,.6)*pap*a,a),c);
    }
    float e=length((u-vec2(.5,.62))/vec2(.27,.3));
    float a=(1.-smoothstep(.85,1.,e))*smoothstep(0.,.4,o);
    c=sur(vec4(vec3(.13,.1,.09)*pap*a,a),c);
  }
  if(u.y<ye)return sur(lire(u),c);
  float cote=u.x<.5?-1.:1.;
  vec2 piv=vec2(.5,ye);
  vec2 d=tourne(u-piv,cote*o*.6);
  d.y/=1.-.4*o;
  vec2 s=piv+d;
  if((s.x-.5)*cote>=0.&&s.y>=ye)c=sur(lire(s),c);
  return c;
}
vec4 creature(vec2 u){return cp.x<.5?papillon(u):coccinelle(u);}
void main(){
  if(om.x>.5){
    // l'ombre portée : la silhouette floue, plus floue et plus pâle quand elle vole haut
    float a=0.;
    vec2 e=vec2(om.y,0.);
    a+=creature(v).a*.4+creature(v+e).a*.15+creature(v-e).a*.15+creature(v+e.yx).a*.15+creature(v-e.yx).a*.15;
    a*=om.z;
    gl_FragColor=vec4(vec3(.24,.19,.14)*a,a);
    return;
  }
  gl_FragColor=creature(v)*om.z;
}`;

// ---- Petits outils WebGL -------------------------------------------------------------------------
type GL = WebGLRenderingContext;

function programme(gl: GL, vs: string, fs: string): WebGLProgram | null {
  const prog = gl.createProgram()!;
  for (const [type, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      console.warn('Aquarelles vivantes :', gl.getShaderInfoLog(sh));
      return null;
    }
    gl.attachShader(prog, sh);
  }
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
}

function texture(gl: GL, im: TexImageSource, donnees: boolean, filtre: number): WebGLTexture {
  const tx = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tx);
  // une carte (tracé, parties) est une donnée : ni prémultipliée ni convertie de couleur
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !donnees);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, donnees ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtre);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtre);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
  return tx;
}

const chargerImage = (u: string): Promise<HTMLImageElement> => {
  const i = new Image();
  i.decoding = 'async';
  i.src = u;
  return i.decode().then(() => i);
};

let gl0: boolean | null = null;
/** WebGL disponible ? (une fois par visite) */
export function webglOk(): boolean {
  if (gl0 === null) {
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl');
      gl0 = !!g;
      g?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      gl0 = false;
    }
  }
  return gl0;
}

// ---- La toile d'une page ---------------------------------------------------------------------------
type Rect = [number, number, number, number];

export interface DessinPage {
  /** Aquarelle cuite (design-system/baked/aquarelles/<nom>.webp). */
  nom: string;
  /** Zone vivante, en fractions de la page. */
  zone: Rect;
  /** Inclinaison (degrés, sens des aiguilles d'une montre). */
  angle: number;
  /** Rang sur la page : elles se peignent l'une après l'autre. */
  ordre: number;
  /** À peindre à cette visite (sinon : déjà peinte). */
  peindre: boolean;
}

export interface OptionsToile {
  page: string;
  double: string;
  cote: 'gauche' | 'droite';
  /** Proportions de la page (largeur / hauteur). */
  aspect: number;
  dessins: DessinPage[];
  /** Version douce (moins d'animations) : pas de peinture, pas de scène d'elle-même, à peine de mouvement. */
  douce: boolean;
  /** URL d'un fichier cuit (nom logique) ou undefined s'il n'existe pas. */
  url: (nom: string) => string | undefined;
  /** Encre 1× de la page : les créatures se posent là où il n'y a rien d'écrit. */
  encre?: string;
  /** Zones vivantes de la page (photo, tirages…) : pas de créature posée dessus. */
  zones: Rect[];
  pret: () => void;
  perdu: () => void;
  peinte: (nom: string) => void;
}

export interface Toile {
  /** Avance l'animation (true) ou la fige à sa dernière image (false). */
  jouer(oui: boolean): void;
  arreter(): void;
  /** Un toucher sur la page (fractions de la page) : une aquarelle joue sa scène, une créature s'envole. */
  toucher(x: number, y: number): boolean;
  /** Joue une scène (vérification) : sur l'aquarelle `nom` (toutes sinon), la scène `scene` (la suivante sinon). */
  scene(nom?: string, scene?: string): void;
  /** Finit d'un coup la peinture en cours (un clic dans le livre, comme pour l'encre ; vérification). */
  finir(): void;
  /** Vérification : fige le temps (true), qui n'avance plus que par `avancer`. */
  figer(oui: boolean): void;
  /** Vérification : fait avancer le temps de `ms`, image par image, et dessine. */
  avancer(ms: number): void;
  etat(): Record<string, unknown>;
}

interface Ressort {
  a: number;
  va: number;
  x: number;
  vx: number;
  y: number;
  vy: number;
}
const ressort = (): Ressort => ({ a: 0, va: 0, x: 0, vx: 0, y: 0, vy: 0 });

interface Sprite {
  d: DessinPage;
  e: Effets;
  parties: PartieInfo[];
  img?: WebGLTexture;
  carte?: WebGLTexture[];
  carteTpx: [number, number];
  parts?: WebGLTexture;
  fond?: WebGLTexture;
  ai: number;
  boite: Rect;
  rect: Rect;
  aspB: number;
  cx: number;
  cy: number;
  cos: number;
  sin: number;
  /** Peinture : début (ms d'horloge ; -1 pas commencée, Infinity finie), durée, délai. */
  debut: number;
  duree: number;
  delai: number;
  scene: { nom: string; debut: number; h: number } | null;
  prochaine: number;
  rang: number;
  ressorts: Ressort[];
  penche: Ressort;
  main: { x: number; y: number; f: number; cible: number; bouge: number };
}

const AMORCE = 1500; // ms : la première scène après la peinture

export function toile(canvas: HTMLCanvasElement, opts: OptionsToile): Toile {
  let arrete = false;
  let raf = 0;
  let joue = false;
  let fige = false;
  let gl: GL | null = null;
  let horloge = 0; // ms d'animation écoulées (figée en pause)
  let dernier = 0;
  let derniereScene = -1e9;
  const sprites: Sprite[] = [];
  const A = opts.aspect;
  const essaim: Essaim | null = essaimDe(opts.double);
  let attache = false;
  const micro = opts.douce ? 0.3 : 1;

  // ---- placement : la boîte de chaque aquarelle, son image « contain » dans la zone ----
  for (const d of [...opts.dessins].sort((a, b) => a.ordre - b.ordre)) {
    const [x, y, w, h] = d.zone;
    // les scènes propres à cette page, s'il y en a, remplacent celles de l'aquarelle
    const sp = SCENES_PAGE[opts.page]?.[d.nom];
    const e: Effets = { ...(EFFETS[d.nom] ?? {}), ...(sp ? { scenes: sp } : {}) };
    const [dg, dh, dd] = DEBORD;
    // des confettis retombent sous l'aquarelle : la boîte descend plus bas
    const db = e.confettis ? 0.5 : DEBORD[3];
    const an = (d.angle * Math.PI) / 180;
    sprites.push({
      d,
      e,
      parties: partiesDe(d.nom).slice(0, MAX_PARTIES),
      carteTpx: [0, 0],
      ai: 1,
      boite: [x - dg * w, y - dh * h, w * (1 + dg + dd), h * (1 + dh + db)],
      rect: [0, 0, 1, 1],
      aspB: 1,
      cx: x + w / 2,
      cy: y + h / 2,
      cos: Math.cos(an),
      sin: Math.sin(an),
      debut: d.peindre && !opts.douce ? -1 : Infinity,
      duree: 3000,
      delai: 650 + d.ordre * 450,
      scene: null,
      prochaine: Infinity,
      rang: 0,
      ressorts: [],
      penche: ressort(),
      main: { x: 0.5, y: 0.5, f: 0, cible: 0, bouge: -1e9 },
    });
  }
  const placer = (s: Sprite, iw: number, ih: number) => {
    const [, , w, h] = s.d.zone;
    s.ai = iw / ih;
    // image contenue dans la zone, centrée (comme object-fit: contain)
    let fw = w;
    let fh = (w * A) / s.ai;
    if (fh > h) {
      fh = h;
      fw = (h * s.ai) / A;
    }
    const [bx, by, bw, bh] = s.boite;
    s.rect = [(s.d.zone[0] + (w - fw) / 2 - bx) / bw, (s.d.zone[1] + (h - fh) / 2 - by) / bh, fw / bw, fh / bh];
    s.aspB = (bw * A) / bh;
  };

  // ---- la main (souris, stylet, doigt qui glisse) ----
  let boiteToile: DOMRect | null = null;
  let lue = -1e9;
  const versPage = (x: number, y: number, t: number): [number, number] | null => {
    if (!boiteToile || t - lue > 500) {
      boiteToile = canvas.getBoundingClientRect();
      lue = t;
    }
    if (!boiteToile.width || !boiteToile.height) return null;
    return [(x - boiteToile.left) / boiteToile.width, (y - boiteToile.top) / boiteToile.height];
  };
  /** D'un point de la page à la boîte d'une aquarelle (0 à 1 dans la boîte). */
  const versBoite = (s: Sprite, px: number, py: number): [number, number] => {
    const dx = (px - s.cx) * A;
    const dy = py - s.cy;
    const rx = dx * s.cos + dy * s.sin;
    const ry = -dx * s.sin + dy * s.cos;
    return [(s.cx + rx / A - s.boite[0]) / s.boite[2], (s.cy + ry - s.boite[1]) / s.boite[3]];
  };
  const desabonner = ecouterPointeur((p) => {
    if (!joue) return;
    const pp = versPage(p.x, p.y, p.t);
    if (!pp || !boiteToile) return;
    const [px, py] = pp;
    const vitesse = Math.hypot(p.vx, p.vy);
    // vitesse en unités de l'image : la hauteur de la page vaut 1
    const vx = p.vx / boiteToile.height;
    const vy = p.vy / boiteToile.height;
    for (const s of sprites) {
      const [bx, by] = versBoite(s, px, py);
      const dedans = bx > -0.05 && bx < 1.05 && by > -0.05 && by < 1.05;
      if (!dedans) {
        s.main.cible = 0;
        continue;
      }
      s.main.x = bx;
      s.main.y = by;
      s.main.cible = p.type === 'touch' ? Math.min(0.8, 0.3 + vitesse / 1500) : Math.min(1, 0.5 + vitesse / 1200);
      s.main.bouge = performance.now();
      // les ressorts : la main bouscule ce qu'elle touche (en unités de l'image : sa hauteur vaut 1)
      const hImg = s.rect[3] * s.boite[3];
      const ix = (bx - s.rect[0]) / s.rect[2];
      const iy = (by - s.rect[1]) / s.rect[3];
      const kx = Math.max(-3, Math.min(3, vx / hImg)) * micro;
      const ky = Math.max(-3, Math.min(3, vy / hImg)) * micro;
      const pousse = (r: Ressort, f: number) => {
        r.va += kx * 0.5 * f;
        r.vx += kx * 0.012 * f;
        r.vy += ky * 0.008 * f;
      };
      if (ix > -0.05 && ix < 1.05 && iy > -0.05 && iy < 1.05) {
        pousse(s.ressorts[0], 0.25);
        s.parties.forEach((pt, k) => {
          const [x0, y0, x1, y1] = pt.boite;
          if (ix > x0 - 0.06 && ix < x1 + 0.06 && iy > y0 - 0.06 && iy < y1 + 0.06) pousse(s.ressorts[k + 1], 1);
        });
        s.penche.vx += kx * 0.6;
      }
    }
    essaim?.main(opts.cote, px, py, vx, vy, p.type);
  });

  // ---- dessiner ----
  let progD: WebGLProgram | null = null;
  let progC: WebGLProgram | null = null;
  const ud: Record<string, WebGLUniformLocation | null> = {};
  const uc: Record<string, WebGLUniformLocation | null> = {};
  let vide: WebGLTexture | null = null;
  const texCreatures = new Map<string, { tx: WebGLTexture; ai: number }>();

  const avancerRessort = (r: Ressort, dt: number) => {
    const K = 70;
    const D = 6.5;
    r.va += (-K * r.a - D * r.va) * dt;
    r.a = Math.max(-0.3, Math.min(0.3, r.a + r.va * dt));
    r.vx += (-K * r.x - D * r.vx) * dt;
    r.x = Math.max(-0.03, Math.min(0.03, r.x + r.vx * dt));
    r.vy += (-K * r.y - D * r.vy) * dt;
    r.y = Math.max(-0.03, Math.min(0.03, r.y + r.vy * dt));
  };

  const lancerScene = (s: Sprite, nom?: string) => {
    const liste = (s.e.scenes ?? []).filter((n) => SCENES[n]);
    if (!liste.length) return false;
    const n = nom && SCENES[nom] ? nom : liste[s.rang++ % liste.length];
    s.scene = { nom: n, debut: horloge, h: Math.random() };
    derniereScene = horloge;
    // une créature posée dessus s'envole
    essaim?.effrayer(opts.cote, s.cx, s.cy, Math.max(s.d.zone[2] * A, s.d.zone[3]) * 0.6);
    return true;
  };

  const fxNeutre = (s: Sprite): Fx => ({
    vap: (s.e.vapeur ?? []).map(() => 1),
    fl: (s.e.flammes ?? []).map(() => 1),
    fumee: (s.e.flammes ?? []).map(() => 0),
    gerbe: -1,
    ondes: -1,
    confettis: -1,
    vent: 1,
    fanions: 1,
    penche: 0,
  });

  const poser = (s: Sprite, dt: number, t: number) => {
    const corps = poseNeutre();
    const poses = s.parties.map(() => poseNeutre());
    const fx = fxNeutre(s);
    const ctx: Ctx = {
      s: t,
      corps,
      partie: (nom) => {
        const k = s.parties.findIndex((p) => p.nom === nom);
        return k >= 0 ? poses[k] : poseNeutre();
      },
      rayon: (nom) => s.parties.find((p) => p.nom === nom)?.rayon ?? 0.2,
      fx,
      h: 0.5,
    };
    // repos : toute l'image se balance un peu autour de son pied, et respire
    corps.a += micro * (0.011 * Math.sin(t * 0.55 + s.d.ordre) + 0.005 * Math.sin(t * 1.37 + 1));
    const r0 = 1 + 0.007 * micro * Math.sin(t * 0.83 + s.d.ordre);
    corps.sx *= r0;
    corps.sy *= r0;
    if (s.e.repos && REPOS[s.e.repos]) REPOS[s.e.repos](ctx);
    // la scène en cours
    if (s.scene) {
      const sc = SCENES[s.scene.nom];
      const ts = (horloge - s.scene.debut) / 1000;
      if (!sc || ts > sc.duree) {
        s.scene = null;
        s.prochaine = horloge + 6000 + Math.random() * 9000;
      } else {
        ctx.s = ts;
        ctx.h = s.scene.h;
        sc.jouer(ctx);
      }
    }
    // les ressorts (la main)
    s.ressorts.forEach((r, k) => {
      avancerRessort(r, dt);
      const p = k === 0 ? corps : poses[k - 1];
      if (!p) return;
      p.a += r.a;
      p.tx += r.x;
      p.ty += r.y;
    });
    avancerRessort(s.penche, dt);
    return { corps, poses, fx };
  };

  const dessinerSprite = (s: Sprite, t: number, dt: number) => {
    if (!gl || !s.img) return;
    const g = gl;
    // la peinture
    if (s.debut === -1 && horloge >= s.delai) s.debut = horloge;
    // debut : -1 en attente, Infinity peinte ; finir() la met très loin dans le passé (peinte d'un coup)
    const peint = s.debut === Infinity ? 1 : s.debut === -1 ? 0 : Math.min(1, (horloge - s.debut) / s.duree);
    if (peint >= 1 && s.debut !== Infinity) {
      s.debut = Infinity;
      opts.peinte(s.d.nom);
      s.prochaine = horloge + AMORCE + s.d.ordre * 1500 + Math.random() * 2500;
    }
    if (peint >= 1 && !s.scene && !opts.douce && horloge >= s.prochaine) {
      // une scène à la fois sur la page, à 2,5 s d'écart au moins
      if (horloge - derniereScene > 2500) lancerScene(s);
      else s.prochaine = derniereScene + 2500 + Math.random() * 1500;
    }
    const { corps, poses, fx } = poser(s, dt / 1000, peint >= 1 ? t : 0);
    // la main : la force monte vite, retombe doucement
    if (performance.now() - s.main.bouge > 300) s.main.cible = Math.min(s.main.cible, 0);
    s.main.f += (s.main.cible - s.main.f) * (s.main.cible > s.main.f ? 0.3 : 0.06);

    g.uniform4f(ud.boite, ...s.boite);
    g.uniform4f(ud.rot, s.cx, s.cy, s.cos, s.sin);
    g.uniform4f(ud.rect, ...s.rect);
    g.uniform2f(ud.asp, s.aspB, s.ai);
    g.uniform4f(ud.tp, t, peint, s.carte ? 1 : 0, s.parts ? s.parties.length : 0);
    g.uniform2f(ud.tpx, ...s.carteTpx);
    g.uniform3f(ud.souris, s.main.x, s.main.y, s.main.f < 0.01 ? 0 : s.main.f * micro);
    // pose du corps : pivot au pied (défaut : milieu du bas), en unités de l'image (hauteur 1)
    const pied = s.e.pied ?? [0.5, 1];
    g.uniform4f(ud.gA, pied[0] * s.ai, pied[1], corps.tx, corps.ty);
    g.uniform4f(ud.gB, corps.a, corps.sx, corps.sy, corps.flex);
    const pA = new Float32Array(4 * MAX_PARTIES);
    const pB = new Float32Array(4 * MAX_PARTIES);
    const pC = new Float32Array(4 * MAX_PARTIES);
    s.parties.forEach((pt, k) => {
      const p = poses[k];
      pA.set([pt.pivot[0] * s.ai, pt.pivot[1], p.tx, p.ty], k * 4);
      pB.set([p.a, p.sx, p.sy, p.flex], k * 4);
      // a-t-elle bougé ? (au repos, la partie reste dans l'image du corps : aucun double bord)
      const r = Math.max(pt.rayon, 0.05);
      const bouge = Math.hypot(p.tx, p.ty) + Math.abs(p.a) * r + (Math.abs(p.sx - 1) + Math.abs(p.sy - 1)) * r + Math.abs(p.flex) * r * r;
      pC[k * 4] = Math.min(1, bouge * 400);
    });
    g.uniform4fv(ud.pA, pA);
    g.uniform4fv(ud.pB, pB);
    g.uniform4fv(ud.pC, pC);
    const vap = new Float32Array(4 * MAX_VAPEUR);
    (s.e.vapeur ?? []).slice(0, MAX_VAPEUR).forEach((v, k) => vap.set([v[0], v[1], v[2], (fx.vap[k] ?? 1) * (opts.douce ? 0.6 : 1)], k * 4));
    g.uniform4fv(ud.vap, vap);
    const fl = new Float32Array(4 * MAX_FLAMMES);
    const flv = new Float32Array(4 * MAX_FLAMMES);
    const flammes = (s.e.flammes ?? []).slice(0, MAX_FLAMMES);
    flammes.forEach((f, k) => {
      fl.set([f[0], f[1], f[2], fx.fl[k] ?? 1], k * 4);
      flv.set([Math.max(-1.2, Math.min(1.2, s.penche.x * 60 + fx.penche)), fx.fumee[k] ?? 0, 0, 0], k * 4);
    });
    g.uniform4fv(ud.fl, fl);
    g.uniform4fv(ud.flv, flv);
    g.uniform4f(ud.ef, (s.e.vent ?? 0) * fx.vent * micro, s.e.reflet ?? 0, flammes.length, 0);
    g.uniform4f(ud.fa, s.e.fanions?.[0] ?? 0, s.e.fanions?.[1] ?? 0, s.e.fanions ? fx.fanions * micro : 0, 0);
    const ge = s.e.gerbe;
    g.uniform4f(ud.ge, ge?.[0] ?? 0, ge?.[1] ?? 0, ge?.[2] ?? 0, ge ? fx.gerbe : -1);
    g.uniform4f(ud.geB, ge?.[3] ?? 0, ge?.[4] ?? 0, ge?.[5] ?? 0, ge?.[6] ?? 0);
    const on = s.e.ondes;
    g.uniform4f(ud.on, on?.[0] ?? 0, on?.[1] ?? 0, on?.[2] ?? 0, on ? fx.ondes : -1);
    const cf = s.e.confettis;
    g.uniform4f(ud.cf, cf?.[0] ?? 0, cf?.[1] ?? 0, cf?.[2] ?? 0, cf ? fx.confettis : -1);
    // la taille des confettis suit la page, pas l'image (un centième de la hauteur de page)
    g.uniform1f(ud.cft, Math.min(8, 0.85 / Math.max(0.05, s.rect[3] * s.boite[3])));
    const lier = (unite: number, tx: WebGLTexture | null | undefined) => {
      g.activeTexture(g.TEXTURE0 + unite);
      g.bindTexture(g.TEXTURE_2D, tx ?? vide);
    };
    lier(0, s.img);
    lier(1, s.carte?.[0]);
    lier(2, s.carte?.[1]);
    lier(3, s.parts);
    lier(4, s.fond);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  };

  const dessinerCreatures = () => {
    if (!gl || !progC || !essaim) return;
    const g = gl;
    const dx = opts.cote === 'droite' ? 1 : 0;
    let actif = false;
    for (const c of essaim.creatures) {
      const t = texCreatures.get(c.espece);
      if (!t) continue;
      // fractions de la page : x (largeur de page), y ; taille en unités de la hauteur de page
      const px = c.x / A - dx;
      const py = c.y;
      const demi = c.taille / 2;
      if (px < -0.3 || px > 1.3) continue;
      if (!actif) {
        g.useProgram(progC);
        g.uniform1f(uc.aspP, A);
        g.uniform3f(uc.pap, ...PAPIER);
        actif = true;
      }
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, t.tx);
      const esp = ESPECES[c.espece];
      g.uniform4f(uc.cp, esp.genre === 'coccinelle' ? 1 : 0, c.ouv, c.phase, esp.epaules ?? 0.35);
      g.uniform2f(uc.cap, Math.cos(c.cap), Math.sin(c.cap));
      // l'ombre, décalée vers le bas à droite (la lampe est en haut à gauche), plus loin quand elle vole
      const h = c.alt;
      g.uniform4f(uc.cr, px + (0.004 + 0.03 * h) / A, py + 0.006 + 0.045 * h, demi * t.ai * (1 - 0.15 * h), demi * (1 - 0.15 * h));
      g.uniform4f(uc.om, 1, 0.012 + 0.03 * h, 0.32 - 0.16 * h, esp.corps ?? 0.05);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      g.uniform4f(uc.cr, px, py, demi * t.ai, demi);
      g.uniform4f(uc.om, 0, 0, 1, esp.corps ?? 0.05);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    }
  };

  const dessiner = (dt: number) => {
    if (!gl || !progD) return;
    const g = gl;
    const t = (horloge / 1000) % 3600;
    g.viewport(0, 0, canvas.width, canvas.height);
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
    g.useProgram(progD);
    g.uniform1f(ud.aspP, A);
    g.uniform3f(ud.pap, ...PAPIER);
    for (const s of sprites) dessinerSprite(s, t, dt);
    dessinerCreatures();
  };

  const boucle = () => {
    if (arrete || !joue || !gl || fige) return;
    const now = performance.now();
    if (now - dernier >= 30) {
      const dt = pas(now - dernier);
      horloge += dt;
      dernier = now;
      if (essaim?.maitre === opts.cote) essaim.avancer(dt / 1000, opts.douce);
      dessiner(dt);
    }
    raf = requestAnimationFrame(boucle);
  };

  // ---- chargement : toutes les images de la page, puis le contexte ----
  const perdu = (e: Event) => {
    e.preventDefault();
    if (arrete) return;
    arrete = true;
    cancelAnimationFrame(raf);
    if (attache) essaim?.detacher(opts.cote);
    attache = false;
    opts.perdu();
  };
  canvas.addEventListener('webglcontextlost', perdu);

  const charge = Promise.all(
    sprites.map(async (s) => {
      const u = opts.url(`aquarelles/${s.d.nom}`);
      if (!u) throw new Error(`aquarelle inconnue : ${s.d.nom}`);
      const tr = s.debut === -1 ? opts.url(`aquarelles/trace/${s.d.nom}`) : undefined;
      const up = s.parties.length ? opts.url(`aquarelles/parties/${s.d.nom}`) : undefined;
      const uf = s.parties.length ? opts.url(`aquarelles/fond/${s.d.nom}`) : undefined;
      const [im, carte, parts, fond] = await Promise.all([
        chargerImage(u),
        tr ? chargerImage(tr).catch(() => null) : null,
        up ? chargerImage(up).catch(() => null) : null,
        uf ? chargerImage(uf).catch(() => null) : null,
      ]);
      return { s, im, carte, parts: parts && fond ? parts : null, fond: parts && fond ? fond : null };
    }),
  );
  const especes = essaim ? essaim.especes : [];
  const chargeCreatures = Promise.all(
    especes.map(async (e) => {
      const u = opts.url(`aquarelles/${e}`);
      return u ? { e, im: await chargerImage(u).catch(() => null) } : { e, im: null };
    }),
  );

  Promise.all([charge, chargeCreatures])
    .then(([images, creatures]) => {
      if (arrete) return;
      gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false });
      if (!gl) return opts.perdu();
      const g = gl;
      progD = programme(g, VS_DESSIN, FS_DESSIN);
      progC = programme(g, VS_CREATURE, FS_CREATURE);
      if (!progD || !progC) return opts.perdu();
      for (const n of ['boite', 'rot', 'aspP', 'img', 'carteN', 'carteL', 'parts', 'fond', 'rect', 'asp', 'tp', 'tpx', 'souris', 'gA', 'gB', 'pA', 'pB', 'pC', 'vap', 'fl', 'flv', 'ef', 'fa', 'ge', 'geB', 'on', 'cf', 'cft', 'pap'])
        ud[n] = g.getUniformLocation(progD, n);
      for (const n of ['cr', 'cap', 'aspP', 'tex', 'cp', 'om', 'pap']) uc[n] = g.getUniformLocation(progC, n);
      const buf = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, buf);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), g.STATIC_DRAW);
      g.enableVertexAttribArray(0);
      g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
      vide = texture(g, new ImageData(1, 1), true, g.NEAREST);
      for (const { s, im, carte, parts, fond } of images) {
        s.img = texture(g, im, false, g.LINEAR);
        placer(s, im.naturalWidth, im.naturalHeight);
        if (carte) {
          s.carte = [texture(g, carte, true, g.NEAREST), texture(g, carte, true, g.LINEAR)];
          s.carteTpx = [1 / carte.naturalWidth, 1 / carte.naturalHeight];
          s.duree = 7000;
        } else if (s.debut === -1) s.duree = 3000;
        if (parts && fond) {
          s.parts = texture(g, parts, true, g.NEAREST);
          s.fond = texture(g, fond, false, g.LINEAR);
        }
        s.ressorts = [ressort(), ...s.parties.map(() => ressort())];
        if (s.debut === Infinity) s.prochaine = AMORCE + s.d.ordre * 1800 + Math.random() * 2500;
      }
      for (const { e, im } of creatures) if (im) texCreatures.set(e, { tx: texture(g, im, false, g.LINEAR), ai: im.naturalWidth / im.naturalHeight });
      // les créatures : la page s'inscrit auprès de l'essaim de sa double page (perchoirs sur ses aquarelles)
      if (essaim) {
        const perchoirs: [number, number][] = [];
        for (const s of sprites) {
          for (const [ix, iy] of s.e.perchoirs ?? []) {
            // de l'image à la boîte, de la boîte à la page, puis l'inclinaison autour du centre de la zone
            const x = s.boite[0] + (s.rect[0] + ix * s.rect[2]) * s.boite[2];
            const y = s.boite[1] + (s.rect[1] + iy * s.rect[3]) * s.boite[3];
            const dx = (x - s.cx) * A;
            const dy = y - s.cy;
            perchoirs.push([s.cx + (dx * s.cos - dy * s.sin) / A, s.cy + dx * s.sin + dy * s.cos]);
          }
        }
        essaim.attacher(opts.cote, perchoirs, opts.encre, opts.zones, A);
        attache = true;
      }
      g.useProgram(progD);
      ['img', 'carteN', 'carteL', 'parts', 'fond'].forEach((n, k) => g.uniform1i(ud[n], k));
      g.useProgram(progC);
      g.uniform1i(uc.tex, 0);
      dessiner(0);
      opts.pret();
      if (joue) {
        dernier = performance.now();
        raf = requestAnimationFrame(boucle);
      }
    })
    .catch(() => {
      if (!arrete) opts.perdu();
    });

  return {
    jouer(oui: boolean) {
      if (arrete || oui === joue) return;
      joue = oui;
      cancelAnimationFrame(raf);
      if (oui && gl) {
        dernier = performance.now();
        raf = requestAnimationFrame(boucle);
      }
    },
    arreter() {
      if (attache) essaim?.detacher(opts.cote);
      attache = false;
      if (arrete) return;
      arrete = true;
      cancelAnimationFrame(raf);
      desabonner();
      canvas.removeEventListener('webglcontextlost', perdu);
      // quittée en cours de peinture : elle est peinte
      for (const s of sprites) if (s.debut !== Infinity) opts.peinte(s.d.nom);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    },
    toucher(x: number, y: number) {
      if (!joue) return false;
      if (essaim?.toucher(opts.cote, x, y)) return true;
      for (const s of [...sprites].reverse()) {
        const [bx, by] = versBoite(s, x, y);
        const ix = (bx - s.rect[0]) / s.rect[2];
        const iy = (by - s.rect[1]) / s.rect[3];
        if (ix < 0 || ix > 1 || iy < 0 || iy > 1 || s.debut !== Infinity) continue;
        if (s.scene) return true;
        return lancerScene(s);
      }
      return false;
    },
    scene(nom?: string, scene?: string) {
      for (const s of sprites) if (!nom || s.d.nom === nom) lancerScene(s, scene);
    },
    finir() {
      for (const s of sprites) if (s.debut !== Infinity) s.debut = -1e9;
    },
    figer(oui: boolean) {
      fige = oui;
      cancelAnimationFrame(raf);
      if (!oui && joue && gl && !arrete) {
        dernier = performance.now();
        raf = requestAnimationFrame(boucle);
      }
    },
    avancer(ms: number) {
      if (!gl || arrete) return;
      for (let reste = ms; reste > 0; reste -= 33) {
        const dt = pas(Math.min(33, reste));
        horloge += dt;
        if (essaim?.maitre === opts.cote) essaim.avancer(dt / 1000, opts.douce);
        dessiner(dt);
      }
    },
    etat() {
      return {
        page: opts.page,
        pret: !!gl,
        joue,
        horloge: Math.round(horloge),
        dessins: sprites.map((s) => ({ nom: s.d.nom, peinte: s.debut === Infinity, scene: s.scene?.nom ?? null, parties: s.parties.length })),
        creatures: essaim?.creatures.map((c) => ({ espece: c.espece, etat: c.etat, x: +c.x.toFixed(3), y: +c.y.toFixed(3) })) ?? [],
      };
    },
  };
}
