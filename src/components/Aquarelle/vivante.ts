// Aquarelles vivantes : un petit moteur WebGL qui donne vie à une aquarelle posée sur la page, comme les
// images d'un livre de magie. À la première arrivée sur la page, elle se dessine toute seule : le crayon
// trace les traits l'un après l'autre (carte du tracé cuite par scripts/bake-trace-aquarelles.py), puis la
// couleur s'étend zone par zone depuis leur cœur, front mouillé plus sombre, pigment humide qui sèche.
// Sans carte du tracé : l'esquisse et la couleur partent du cœur du motif.
// Puis elle vit en boucle, selon son sujet (effets.ts) : la vapeur monte en volutes au-dessus d'une tasse ou
// d'une théière, la flamme peinte d'une bougie vacille, le blé ploie au vent, un reflet glisse sur un fruit ;
// et toujours toute l'image se balance un peu et le pigment respire. Sous le curseur (ou au toucher),
// l'image se bombe et ondule en cercles, la vapeur s'écarte et les couleurs se ravivent.
//
// Le canvas déborde du motif (marges : la vapeur monte au-dessus) et se pose sur la page par multiplication,
// comme l'image fixe qu'il remplace : il ne peut que teinter le papier, jamais l'éclairer. Une seule image
// par rafraîchissement, 30 images/s au plus, et rien du tout quand la page est cachée ou pendant un geste.

import { ecouterPointeur } from '../../lib/pointeur';

export interface Effets {
  /** Sources de vapeur : [x, y, largeur], en fractions de l'image (y vers le bas : le haut du liquide). */
  vapeur?: [number, number, number][];
  /** Flamme peinte qui vacille : [x, y, rayon] (le cœur de la flamme), en fractions de l'image. */
  flamme?: [number, number, number];
  /** Vent : amplitude (1 = un brin de blé), le pied reste fixe. */
  vent?: number;
  /** Reflet qui glisse sur un fruit (0 à 1). */
  reflet?: number;
  /** Miettes qui tombent d'un biscuit : [x, y, largeur] du bord d'où elles se détachent, en fractions de l'image. */
  miettes?: [number, number, number];
}

/** Débord du canvas autour de la zone de l'aquarelle (fractions de la zone) : gauche, haut, droite, bas. */
export const DEBORD = [0.15, 0.5, 0.15, 0.05] as const;

const VS = `attribute vec2 p;varying vec2 v;
void main(){v=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0.,1.);}`;

const FS = `precision mediump float;
varying vec2 v;
uniform sampler2D img;
uniform sampler2D carteN, carteL; // carte du tracé, lue au plus proche (temps du crayon) et lissée (couleur)
uniform float aCarte;
uniform vec2 tpx;               // un texel de la carte (uv)
uniform vec3 souris;            // le curseur dans le canvas (0 à 1, y vers le bas), force (0 : absent)
uniform vec4 rect;      // l'image dans le canvas (uv) : x, y, l, h
uniform vec2 asp;       // proportions du canvas (l/h, 1)
uniform float t, peint, vent, reflet;
uniform vec3 vap0, vap1, vap2;  // x, y, largeur (0 : absente)
uniform vec3 fl;                // flamme : x, y, rayon (0 : absente)
uniform vec3 mi;                // miettes : x, y, largeur du bord (0 : absentes)
float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 q){float s=0.,a=.5;for(int k=0;k<4;k++){s+=a*n(q);q=q*2.03+vec2(1.7,9.2);a*=.5;}return s;}
vec4 lire(vec2 uv){
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return vec4(0.);
  return texture2D(img,uv);}
vec4 sur(vec4 dessus,vec4 dessous){return dessus+dessous*(1.-dessus.a);}
// temps du crayon (0 à 1 ; 1 : aucun trait ici), sur 16 bits (R octet fort, G octet faible)
float tc(vec2 q){
  if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)return 1.;
  vec4 m=texture2D(carteN,q);return m.r*(65280./65535.)+m.g*(255./65535.);}
// le trait est-il déjà tracé ici (x : son temps, p : où en est le crayon) ?
float trace(float x,float p){return step(x,p)*step(x,.9999);}
vec4 volute(vec3 s,vec2 uv){
  if(s.z<=0.)return vec4(0.);
  vec2 q=(uv-s.xy)/s.z;             // q.y < 0 : au-dessus de la source
  q.y*=rect.w/rect.z*asp.y/asp.x;   // l'unité est la largeur de la source, dans les deux sens
  if(q.y>.1||q.y<-2.6)return vec4(0.);
  float m=-q.y;                     // hauteur au-dessus du liquide
  // deux filets fins, peints d'un trait : ils ondulent, l'onde monte avec eux, et ils s'élargissent en
  // se dissipant ; le trait se casse et se reforme (pinceau sec), chaque filet respire à son rythme
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
  a=min(a,1.)*smoothstep(0.,.3,m)*(1.-smoothstep(1.,2.5,m));
  // un voile très léger autour des filets
  float l=.35+.25*m;
  float voile=exp(-q.x*q.x/(l*l))*fbm(vec2(q.x*2.,m*1.2-t*.35))*smoothstep(0.,.4,m)*(1.-smoothstep(.7,2.,m));
  a=a*.5+voile*.09;
  return vec4(vec3(.56,.58,.62)*a,a);}
void main(){
  vec2 uv=(v-rect.xy)/rect.zw;
  vec3 lu=vec3(.3,.59,.11);
  // la main : sous le curseur, l'image se bombe (loupe douce) et ondule en cercles
  float o=0.;
  if(souris.z>0.){
    vec2 d=(v-souris.xy)*vec2(asp.x,1.);
    float r=length(d);
    o=exp(-r*r/.03)*souris.z;
    float onde=.007*sin(r*50.-t*8.)*exp(-r*5.)*souris.z;
    vec2 dv=d*(.3*o)+d/(r+.0001)*onde;
    uv-=vec2(dv.x/asp.x,dv.y)/rect.zw;
  }
  // toute l'image se balance un peu autour de son pied, et respire
  vec2 pied=vec2(.5,1.);
  vec2 ech=vec2(rect.z*asp.x,rect.w);
  vec2 qq=(uv-pied)*ech;
  float an=.011*sin(t*.55)+.005*sin(t*1.37+1.);
  qq=mat2(cos(an),sin(an),-sin(an),cos(an))*qq*(1.+.007*sin(t*.83));
  uv=pied+qq/ech;
  // le pigment respire : un léger courant dans la couleur
  uv+=.0035*vec2(n(uv*5.+vec2(t*.13,0.))-.5,n(uv*5.+vec2(7.,t*.11))-.5);
  // vent : le haut ploie, le pied reste fixe
  if(vent>0.){
    float haut=1.-clamp(uv.y,0.,1.);
    uv.x+=vent*.03*haut*haut*(sin(t*.9+uv.y*2.)*.7+sin(t*2.3+uv.x*6.)*.3);
  }
  // flamme : les pixels de la flamme peinte ondulent et s'étirent
  if(fl.z>0.){
    vec2 f=(uv-fl.xy)/fl.z;
    float pres=exp(-dot(f,f)*.6);
    uv.x+=pres*fl.z*(.32*sin(t*9.+f.y*3.)+.18*sin(t*15.3));
    uv.y+=pres*fl.z*.26*sin(t*7.1)*clamp(-f.y+1.,0.,2.);
  }
  vec4 c=lire(uv);
  // où en est la couleur (la vapeur vient avec elle)
  float pk=aCarte>.5?clamp((peint-.52)/.48,0.,1.):peint;
  if(peint<1.&&aCarte>.5){
    // elle se dessine : le crayon suit la carte du tracé, trait après trait (les 60 premiers %), puis la
    // couleur s'étend zone par zone depuis leur cœur, front mouillé plus sombre, pigment humide qui sèche
    float pc=clamp(peint/.6,0.,1.);
    float tb=texture2D(carteL,clamp(uv,0.,1.)).b*(255./254.);
    float f=pk*1.08;
    float m=1.-smoothstep(f-.06,f,tb);
    float bord=smoothstep(f-.12,f-.02,tb)*m;
    float humide=smoothstep(f-.3,f-.04,tb);
    vec2 e=vec2(.006,.0045)*humide;
    vec4 flou=(lire(uv+e)+lire(uv-e)+lire(uv+vec2(e.x,-e.y))+lire(uv-vec2(e.x,-e.y)))*.25;
    c=mix(c,flou,humide*.8);
    c.rgb*=1.-.3*bord;
    c*=m;
    // le trait : quatre lectures au plus proche (un temps ne s'interpole pas), moyennées, pour un trait lisse ;
    // la pointe du crayon appuie un peu plus
    vec2 a=tpx*.35;
    float x1=tc(uv+vec2(-a.x,-a.y)),x2=tc(uv+vec2(a.x,-a.y)),x3=tc(uv+vec2(-a.x,a.y)),x4=tc(uv+a);
    float tr=(trace(x1,pc)+trace(x2,pc)+trace(x3,pc)+trace(x4,pc))*.25;
    float x=min(min(x1,x2),min(x3,x4));
    float pointe=tr*(1.-smoothstep(0.,.015,pc-x));
    tr*=.6+.4*n(uv*90.);                              // grain du crayon
    tr*=1.-.8*m;                                       // la couleur recouvre le trait, qui reste deviné
    float al=tr*.62+pointe*.25;
    c=sur(c,vec4(vec3(.32,.29,.27)*al,al));
  } else if(peint<1.){
    // sans carte : d'abord l'esquisse, les contours du motif apparaissent au crayon depuis le cœur ; puis
    // la couleur s'étend derrière elle, front mouillé plus sombre, pigment humide et flou qui sèche.
    float k=length((uv-vec2(.5,.56))*vec2(1.,1.15))*.95+fbm(uv*3.2)*.55;
    float fe=clamp(peint/.36,0.,1.)*1.35;            // front de l'esquisse (le motif tient dans k < 1)
    float front=clamp((peint-.3)/.66,0.,1.)*1.35;    // front de la couleur, régulier
    float m=1.-smoothstep(front-.07,front,k);
    float bord=smoothstep(front-.16,front-.04,k)*m;
    float humide=smoothstep(front-.4,front-.08,k);
    vec2 e=vec2(.006,.0045)*humide;
    vec4 flou=(lire(uv+e)+lire(uv-e)+lire(uv+vec2(e.x,-e.y))+lire(uv-vec2(e.x,-e.y)))*.25;
    c=mix(c,flou,humide*.8);
    c.rgb*=1.-.28*bord;
    c*=m;
    // l'esquisse : la luminance du motif posé sur du blanc, ses variations fortes font le trait
    vec2 px=vec2(.0028,.0028*rect.z/rect.w*asp.x/asp.y);
    vec4 a1=lire(uv+vec2(px.x,0.)),a2=lire(uv-vec2(px.x,0.)),a3=lire(uv+vec2(0.,px.y)),a4=lire(uv-vec2(0.,px.y));
    float g=abs(dot(a1.rgb+1.-a1.a,lu)-dot(a2.rgb+1.-a2.a,lu))+abs(dot(a3.rgb+1.-a3.a,lu)-dot(a4.rgb+1.-a4.a,lu));
    float trait=smoothstep(.05,.22,g)*(1.-smoothstep(fe-.05,fe,k));
    trait*=.55+.45*n(uv*90.);                         // grain du crayon
    trait*=1.-m;                                       // la couleur recouvre l'esquisse
    c=sur(c,vec4(vec3(.36,.33,.3)*trait*.6,trait*.6));
  }
  // reflet : une bande claire glisse lentement sur le fruit
  if(reflet>0.&&c.a>0.){
    float b=fract(t/6.);
    float d=(uv.x*.6+uv.y*.4)-(b*1.8-.4);
    float band=exp(-d*d/.003)*smoothstep(.2,.6,c.a);
    c.rgb=mix(c.rgb,vec3(c.a),band*.42*reflet);
  }
  // sous la main, les couleurs se ravivent
  if(o>0.){float l=dot(c.rgb,lu);c.rgb=clamp(mix(vec3(l),c.rgb,1.+.7*o),0.,c.a);}
  // la flamme rayonne : un lavis orangé autour, qui pulse
  if(fl.z>0.){
    vec2 f=(uv-fl.xy)/fl.z;
    f.y*=rect.w/rect.z*asp.y/asp.x;
    float g=exp(-dot(f,f)*.12)*(.22+.07*sin(t*6.3)+.04*sin(t*11.));
    c=sur(c,vec4(vec3(.98,.62,.28)*g,g));
  }
  // des miettes se détachent du bord du biscuit, tombent en tournant un peu et se posent sur la page
  if(mi.z>0.){
    vec4 coul=lire(mi.xy+vec2(0.,-.04));
    coul=coul.a>0.?coul/coul.a:vec4(.62,.45,.27,1.);
    for(int k=0;k<6;k++){
      float fk=float(k);
      float cy=fract(t/3.1+h(vec2(fk,1.))); // chaque miette a son cycle
      float x0=mi.x+(h(vec2(fk,2.))-.5)*mi.z;
      float chute=min(cy*1.6,1.);
      vec2 pm=vec2(x0+.015*sin(cy*9.+fk),mi.y+chute*chute*.16);
      vec2 d=(uv-pm)*vec2(rect.z*asp.x/rect.w,1.);
      float r=.006+.004*h(vec2(fk,3.));
      float a=(1.-smoothstep(r*.6,r,length(d)))*smoothstep(0.,.05,cy)*(1.-smoothstep(.75,1.,cy));
      c=sur(vec4(coul.rgb*.85*a,a)*pk,c);
    }
  }
  // la vapeur passe devant le motif
  vec4 s=volute(vap0,uv)+volute(vap1,uv)+volute(vap2,uv);
  s=min(s,vec4(.5));
  c=sur(s*pk,c);
  gl_FragColor=c;
}`;

export interface Vivante {
  /** Avance l'animation (true) ou la fige à sa dernière image (false). */
  jouer(oui: boolean): void;
  arreter(): void;
}

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

/**
 * Anime l'aquarelle `src` dans `canvas`. `zone` : taille de la zone de l'aquarelle (px CSS à l'écran) ;
 * `peindre` : durée de la peinture (ms, 0 : déjà peinte) après `delai` ms ; `peinte` est appelée à la fin.
 * `trace` : la carte du tracé (sans elle, ou si elle manque, l'ancienne peinture depuis le cœur).
 * Échec (WebGL, image) : `echec`.
 */
export function animer(
  canvas: HTMLCanvasElement,
  src: string,
  effets: Effets,
  opts: { peindre: number; delai: number; trace?: string; peinte: () => void; echec: () => void; pret: () => void },
): Vivante {
  let arrete = false;
  let raf = 0;
  let joue = false;
  let gl: WebGLRenderingContext | null = null;
  let dessiner: ((now: number) => void) | null = null;
  let tPeinture = opts.peindre > 0 ? -1 : Infinity; // début de la peinture (horloge de l'animation)
  let horloge = 0; // ms d'animation écoulées (figée en pause)
  let dernier = 0;
  const boucle = () => {
    if (arrete || !joue || !dessiner) return;
    const now = performance.now(); // même horloge que `dernier`
    if (now - dernier >= 30) {
      horloge += Math.min(100, now - dernier);
      dernier = now;
      dessiner(horloge);
    }
    raf = requestAnimationFrame(boucle);
  };
  // la main : position dans le canvas et force (monte au survol, plus vite si la main bouge vite ; une tape
  // au toucher la lance d'un coup, puis elle retombe)
  const main = { x: 0.5, y: 0.5, f: 0, cible: 0, bouge: 0 };
  let boite: DOMRect | null = null;
  let lue = -1e9;
  const placer = (x: number, y: number, t: number) => {
    if (!boite || t - lue > 500) {
      boite = canvas.getBoundingClientRect();
      lue = t;
    }
    if (!boite.width || !boite.height) return false;
    const u = (x - boite.left) / boite.width;
    const w = (y - boite.top) / boite.height;
    if (u < -0.05 || u > 1.05 || w < -0.05 || w > 1.05) return false;
    main.x = u;
    main.y = w;
    return true;
  };
  const desabonner = ecouterPointeur((p) => {
    if (!joue) return;
    if (p.type === 'touch' || !placer(p.x, p.y, p.t)) {
      main.cible = 0;
      return;
    }
    main.cible = Math.min(1, 0.5 + Math.hypot(p.vx, p.vy) / 1200);
    main.bouge = performance.now();
  });
  const tape = (e: PointerEvent) => {
    if (!joue || !placer(e.clientX, e.clientY, e.timeStamp)) return;
    main.f = 1;
    main.cible = e.pointerType === 'mouse' ? 0.5 : 0;
    main.bouge = performance.now();
  };
  window.addEventListener('pointerdown', tape, { passive: true });

  const charger = (u: string) => {
    const i = new Image();
    i.decoding = 'async';
    i.src = u;
    return i.decode().then(() => i);
  };
  const im = new Image();
  im.decoding = 'async';
  im.src = src;
  Promise.all([im.decode(), opts.trace ? charger(opts.trace).catch(() => null) : null])
    .then(([, carte]) => {
      if (arrete) return;
      gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
      if (!gl) return opts.echec();
      const prog = gl.createProgram()!;
      for (const [type, s] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, s);
        gl.compileShader(sh);
        gl.attachShader(prog, sh);
      }
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return opts.echec();
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const p = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(p);
      gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
      const tx = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      const u = (nom: string) => gl!.getUniformLocation(prog, nom);
      gl.uniform1i(u('img'), 0);
      // la carte du tracé : des données, pas une image (ni prémultipliée ni convertie de couleur), deux fois :
      // au plus proche pour le temps du crayon (16 bits sur deux octets), lissée pour celui de la couleur
      gl.uniform1f(u('aCarte'), carte ? 1 : 0);
      if (carte) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        [gl.NEAREST, gl.LINEAR].forEach((filtre, k) => {
          gl!.activeTexture(gl!.TEXTURE1 + k);
          gl!.bindTexture(gl!.TEXTURE_2D, gl!.createTexture());
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, filtre);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, filtre);
          gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, carte);
        });
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(u('carteN'), 1);
        gl.uniform1i(u('carteL'), 2);
        gl.uniform2f(u('tpx'), 1 / carte.naturalWidth, 1 / carte.naturalHeight);
      }
      // l'image, posée « contain » dans la zone, puis la zone dans le canvas (débord)
      const [dg, dh, dd, db] = DEBORD;
      const zw = canvas.clientWidth / (1 + dg + dd);
      const zh = canvas.clientHeight / (1 + dh + db);
      const ai = im.naturalWidth / im.naturalHeight;
      let iw = zw, ih = zw / ai;
      if (ih > zh) { ih = zh; iw = zh * ai; }
      const cw = zw * (1 + dg + dd), ch = zh * (1 + dh + db);
      const rx = (dg * zw + (zw - iw) / 2) / cw;
      const ry = (dh * zh + (zh - ih) / 2) / ch;
      gl.uniform4f(u('rect'), rx, ry, iw / cw, ih / ch);
      gl.uniform2f(u('asp'), cw / ch, 1);
      gl.uniform1f(u('vent'), effets.vent ?? 0);
      gl.uniform1f(u('reflet'), effets.reflet ?? 0);
      const vap = effets.vapeur ?? [];
      ['vap0', 'vap1', 'vap2'].forEach((nom, k) => {
        const s = vap[k];
        gl!.uniform3f(u(nom), s?.[0] ?? 0, s?.[1] ?? 0, s?.[2] ?? 0);
      });
      const f = effets.flamme;
      gl.uniform3f(u('fl'), f?.[0] ?? 0, f?.[1] ?? 0, f?.[2] ?? 0);
      const mi = effets.miettes;
      gl.uniform3f(u('mi'), mi?.[0] ?? 0, mi?.[1] ?? 0, mi?.[2] ?? 0);
      const uT = u('t'), uPeint = u('peint'), uSouris = u('souris');
      gl.viewport(0, 0, canvas.width, canvas.height);
      dessiner = (ms: number) => {
        if (!gl) return;
        if (tPeinture < 0 && ms >= opts.delai) tPeinture = ms;
        const x = tPeinture === Infinity ? 1 : tPeinture < 0 ? 0 : Math.min(1, (ms - tPeinture) / opts.peindre);
        const pe = x;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uT, ms / 1000);
        gl.uniform1f(uPeint, pe);
        if (performance.now() - main.bouge > 300) main.cible = Math.min(main.cible, 0.5);
        main.f += (main.cible - main.f) * (main.cible > main.f ? 0.3 : 0.05);
        gl.uniform3f(uSouris, main.x, main.y, main.f < 0.01 ? 0 : main.f);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (x >= 1 && tPeinture !== Infinity) {
          tPeinture = Infinity;
          opts.peinte();
        }
      };
      dessiner(horloge);
      opts.pret();
      if (joue) {
        dernier = performance.now();
        raf = requestAnimationFrame(boucle);
      }
    })
    .catch(() => {
      if (!arrete) opts.echec();
    });
  return {
    jouer(oui: boolean) {
      if (arrete || oui === joue) return;
      joue = oui;
      cancelAnimationFrame(raf);
      if (oui && dessiner) {
        dernier = performance.now();
        raf = requestAnimationFrame(boucle);
      }
    },
    arreter() {
      if (arrete) return;
      arrete = true;
      cancelAnimationFrame(raf);
      desabonner();
      window.removeEventListener('pointerdown', tape);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
