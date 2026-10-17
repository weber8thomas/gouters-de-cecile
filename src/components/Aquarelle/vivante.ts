// Aquarelles vivantes : un petit moteur WebGL qui donne vie à une aquarelle posée sur la page, comme les
// images d'un livre de magie. À la première arrivée sur la page, elle se peint toute seule : la couleur
// s'étend depuis le cœur du motif, front mouillé plus sombre, pigment d'abord humide et flou, qui sèche.
// Puis elle vit en boucle, selon son sujet (effets.ts) : la vapeur monte en volutes au-dessus d'une tasse ou
// d'une théière, la flamme peinte d'une bougie vacille, le blé ploie au vent, un reflet glisse sur un fruit ;
// et toujours, très doucement, le pigment respire.
//
// Le canvas déborde du motif (marges : la vapeur monte au-dessus) et se pose sur la page par multiplication,
// comme l'image fixe qu'il remplace : il ne peut que teinter le papier, jamais l'éclairer. Une seule image
// par rafraîchissement, 30 images/s au plus, et rien du tout quand la page est cachée ou pendant un geste.

export interface Effets {
  /** Sources de vapeur : [x, y, largeur], en fractions de l'image (y vers le bas : le haut du liquide). */
  vapeur?: [number, number, number][];
  /** Flamme peinte qui vacille : [x, y, rayon] (le cœur de la flamme), en fractions de l'image. */
  flamme?: [number, number, number];
  /** Vent : amplitude (1 = un brin de blé), le pied reste fixe. */
  vent?: number;
  /** Reflet qui glisse sur un fruit (0 à 1). */
  reflet?: number;
}

/** Débord du canvas autour de la zone de l'aquarelle (fractions de la zone) : gauche, haut, droite, bas. */
export const DEBORD = [0.15, 0.5, 0.15, 0.05] as const;

const VS = `attribute vec2 p;varying vec2 v;
void main(){v=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0.,1.);}`;

const FS = `precision mediump float;
varying vec2 v;
uniform sampler2D img;
uniform vec4 rect;      // l'image dans le canvas (uv) : x, y, l, h
uniform vec2 asp;       // proportions du canvas (l/h, 1)
uniform float t, peint, vent, reflet;
uniform vec3 vap0, vap1, vap2;  // x, y, largeur (0 : absente)
uniform vec3 fl;                // flamme : x, y, rayon (0 : absente)
float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 q){float s=0.,a=.5;for(int k=0;k<4;k++){s+=a*n(q);q=q*2.03+vec2(1.7,9.2);a*=.5;}return s;}
vec4 lire(vec2 uv){
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return vec4(0.);
  return texture2D(img,uv);}
vec4 sur(vec4 dessus,vec4 dessous){return dessus+dessous*(1.-dessus.a);}
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
  a=a*.36+voile*.06;
  return vec4(vec3(.56,.58,.62)*a,a);}
void main(){
  vec2 uv=(v-rect.xy)/rect.zw;
  // le pigment respire : un très léger courant dans la couleur
  uv+=.0022*vec2(n(uv*5.+vec2(t*.13,0.))-.5,n(uv*5.+vec2(7.,t*.11))-.5);
  // vent : le haut ploie, le pied reste fixe
  if(vent>0.){
    float haut=1.-clamp(uv.y,0.,1.);
    uv.x+=vent*.018*haut*haut*(sin(t*.9+uv.y*2.)*.7+sin(t*2.3+uv.x*6.)*.3);
  }
  // flamme : les pixels de la flamme peinte ondulent et s'étirent
  if(fl.z>0.){
    vec2 f=(uv-fl.xy)/fl.z;
    float pres=exp(-dot(f,f)*.6);
    uv.x+=pres*fl.z*(.22*sin(t*9.+f.y*3.)+.12*sin(t*15.3));
    uv.y+=pres*fl.z*.18*sin(t*7.1)*clamp(-f.y+1.,0.,2.);
  }
  vec4 c=lire(uv);
  // elle se dessine puis se peint (peint : 0 à 1, linéaire). D'abord l'esquisse : les contours du motif
  // apparaissent au crayon, depuis le cœur ; puis la couleur s'étend derrière elle, front mouillé plus
  // sombre, pigment humide et flou qui sèche.
  if(peint<1.){
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
    vec3 lu=vec3(.3,.59,.11);
    float g=abs(dot(a1.rgb+1.-a1.a,lu)-dot(a2.rgb+1.-a2.a,lu))+abs(dot(a3.rgb+1.-a3.a,lu)-dot(a4.rgb+1.-a4.a,lu));
    float trait=smoothstep(.05,.22,g)*(1.-smoothstep(fe-.05,fe,k));
    trait*=.55+.45*n(uv*90.);                         // grain du crayon
    trait*=1.-m;                                       // la couleur recouvre l'esquisse
    c=sur(c,vec4(vec3(.36,.33,.3)*trait*.6,trait*.6));
  }
  // reflet : une bande claire glisse lentement sur le fruit
  if(reflet>0.&&c.a>0.){
    float b=fract(t/8.);
    float d=(uv.x*.6+uv.y*.4)-(b*1.8-.4);
    float band=exp(-d*d/.003)*smoothstep(.2,.6,c.a);
    c.rgb=mix(c.rgb,vec3(c.a),band*.32*reflet);
  }
  // la flamme rayonne : un lavis orangé autour, qui pulse
  if(fl.z>0.){
    vec2 f=(uv-fl.xy)/fl.z;
    f.y*=rect.w/rect.z*asp.y/asp.x;
    float g=exp(-dot(f,f)*.12)*(.16+.05*sin(t*6.3)+.03*sin(t*11.));
    c=sur(c,vec4(vec3(.98,.62,.28)*g,g));
  }
  // la vapeur passe devant le motif
  vec4 s=volute(vap0,uv)+volute(vap1,uv)+volute(vap2,uv);
  s=min(s,vec4(.5));
  c=sur(s*peint,c);
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
 * Échec (WebGL, image) : `echec`.
 */
export function animer(
  canvas: HTMLCanvasElement,
  src: string,
  effets: Effets,
  opts: { peindre: number; delai: number; peinte: () => void; echec: () => void; pret: () => void },
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
  const im = new Image();
  im.decoding = 'async';
  im.src = src;
  im.decode()
    .then(() => {
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
      const uT = u('t'), uPeint = u('peint');
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
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
