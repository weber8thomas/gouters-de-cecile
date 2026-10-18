// Les trois programmes WebGL de la magie, dans une seule toile :
//   points  — poussière d'or, étincelles, étoiles, pas du maraudeur (sprites, une forme par genre) ;
//   traits  — ornements à la plume (trait large, révélé dans le temps, d'abord or humide puis encre) et
//             lueur du bord libre de la feuille qui tourne (trait de lumière) ;
//   images  — photos vivantes (respiration, parallaxe, vidéo, reflet du papier) et reflet doré des titres.
// Positions en px de scène (1920 × 1080, repère de la caméra) ; u_k : px de toile par px de scène. Toile à
// alpha prémultiplié : une couleur d'alpha nul est de la lumière qui s'ajoute (l'or), un alpha plein de
// l'encre qui couvre.

export const SCENE_W = 1920;
export const SCENE_H = 1080;

/** Un sommet de point : x, y (scène), taille (px de scène), genre, r, g, b, a (prémultipliés), angle. */
export const POINT = 9;
export const GENRE = { halo: 0, etoile: 1, pas: 2 } as const;

const VS_POINTS = `attribute vec2 a_p;attribute float a_t;attribute float a_g;attribute vec4 a_c;attribute float a_r;
uniform vec2 u_scene;uniform float u_k;uniform float u_max;
varying vec4 v_c;varying float v_g;varying float v_r;varying float v_px;
void main(){vec2 c=a_p/u_scene*2.-1.;gl_Position=vec4(c.x,-c.y,0.,1.);
float s=a_t*u_k;gl_PointSize=clamp(s,1.,u_max);
v_c=a_c*min(1.,s*s/2.25);v_g=a_g;v_r=a_r;v_px=gl_PointSize;}`;

// halo : cœur chaud et lueur douce ; étoile : quatre rayons fins ; pas : semelle et talon, tournés.
const FS_POINTS = `precision mediump float;
varying vec4 v_c;varying float v_g;varying float v_r;varying float v_px;
void main(){vec2 q=gl_PointCoord*2.-1.;float d2=dot(q,q);
if(v_g<.5){gl_FragColor=v_c*(exp(-d2*5.)*.5+exp(-d2*26.));}
else if(v_g<1.5){float r=exp(-abs(q.x)*20.-q.y*q.y*2.6)+exp(-abs(q.y)*20.-q.x*q.x*2.6);
gl_FragColor=v_c*(exp(-d2*34.)*1.3+exp(-d2*7.)*.25+r*.75);}
else{float c=cos(v_r),s=sin(v_r);vec2 u=vec2(c*q.x+s*q.y,-s*q.x+c*q.y);
float a1=length((u-vec2(0.,-.3))/vec2(.3,.5))-1.;float a2=length((u-vec2(0.,.58))/vec2(.23,.24))-1.;
float d=min(a1*.3,a2*.23);float aa=1.6/v_px;float a=1.-smoothstep(-aa,aa,d);
gl_FragColor=v_c*a;}}`;

/** Un sommet de trait : x, y (px de page), travers (−1 à 1), instant d'écriture (0 à 1), demi-largeur (px de page). */
export const TRAIT = 5;

const VS_TRAITS = `attribute vec2 a_p;attribute vec3 a_d;
uniform vec2 u_scene;uniform float u_k;uniform vec3 u_page;
varying vec3 v_d;varying vec2 v_q;
void main(){vec2 s=u_page.xy+a_p*u_page.z;vec2 c=s/u_scene*2.-1.;gl_Position=vec4(c.x,-c.y,0.,1.);
v_d=vec3(a_d.x,a_d.y,a_d.z*u_page.z*u_k);v_q=a_p;}`;

// Encre : bord net anticrénelé, grain du papier, or humide à la pointe qui sèche en encre (u_sec = 0 :
// reste d'or, pour un paraphe de lumière). Lumière (u_lum = 1) : profil doux, additif.
const FS_TRAITS = `precision mediump float;
varying vec3 v_d;varying vec2 v_q;
uniform float u_t;uniform float u_dur;uniform float u_op;uniform float u_lum;uniform float u_sec;
uniform vec3 u_encre;uniform vec3 u_or;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){if(v_d.y>u_t)discard;
if(u_lum>.5){float a=exp(-v_d.x*v_d.x*3.2)*u_op;gl_FragColor=vec4(u_or*a,0.);return;}
float e=1.-abs(v_d.x);float aa=1./max(v_d.z,.6);float a=smoothstep(0.,aa*1.5,e);
float age=(u_t-v_d.y)*u_dur;float m=mix(1.,exp(-age*1.6),u_sec);
a*=(.8+.2*h(floor(v_q*1.3)))*u_op;
vec3 c=mix(u_encre,u_or,m);gl_FragColor=vec4(c*a,a*(1.-.6*m));}`;

/** Un sommet d'image : x, y (scène), u, v. */
export const IMAGE = 4;

const VS_IMAGES = `attribute vec2 a_p;attribute vec2 a_uv;uniform vec2 u_scene;varying vec2 v_uv;
void main(){vec2 c=a_p/u_scene*2.-1.;gl_Position=vec4(c.x,-c.y,0.,1.);v_uv=a_uv;}`;

// u_mode 0 : photo vivante. v_uv parcourt l'image du tirage ; dans la zone photo (u_photo), la photo
// zoomée (u_zoom : facteur, décalage) ou la vidéo virée au ton du tirage (u_vid ; u_niv : niveaux, u_ton :
// teinte), sous les coins (u_tex1) ; sur
// tout le papier, le reflet (u_reflet). u_mode 1 : image simple (le ▶ par-dessus). u_mode 2 : reflet
// doré d'un titre, sur l'encre seule (u_tex0 : l'encre du titre ; halo de 5 prises).
const FS_IMAGES = `precision mediump float;varying vec2 v_uv;
uniform sampler2D u_tex0;uniform sampler2D u_tex1;uniform sampler2D u_tex2;
uniform float u_mode;uniform float u_op;uniform vec4 u_photo;uniform vec3 u_zoom;uniform float u_vid;
uniform vec4 u_cadre;uniform vec3 u_ton;uniform vec2 u_niv;uniform float u_reflet;uniform vec2 u_aa;uniform vec3 u_or;uniform vec2 u_px;
void main(){
if(u_mode<.5){vec2 q=(v_uv-u_photo.xy)/u_photo.zw;
vec2 b=smoothstep(vec2(0.),u_aa,q)*smoothstep(vec2(0.),u_aa,1.-q);float dedans=b.x*b.y;
vec2 z=(q-.5)/u_zoom.x+.5+u_zoom.yz;
vec4 ph=texture2D(u_tex0,u_photo.xy+z*u_photo.zw);
if(u_vid>0.){vec3 v=texture2D(u_tex2,u_cadre.xy+z*u_cadre.zw).rgb;float l=u_niv.x+u_niv.y*dot(v,vec3(.299,.587,.114));
ph.rgb=mix(ph.rgb,clamp(l*u_ton,0.,1.),u_vid);}
vec4 co=texture2D(u_tex1,v_uv);float k=dedans*u_op;
vec4 c=co*k+ph*k*(1.-co.a);
float pap=smoothstep(.9,1.,texture2D(u_tex0,v_uv).a);float d=v_uv.x+v_uv.y*.42-u_reflet;
c.rgb+=vec3(1.,.93,.8)*(exp(-d*d*110.)*.14+exp(-d*d*14.)*.04)*pap*u_op;
gl_FragColor=c;}
else if(u_mode<1.5){gl_FragColor=texture2D(u_tex0,v_uv)*u_op;}
else{float a=texture2D(u_tex0,v_uv).a;
float g=(texture2D(u_tex0,v_uv+vec2(u_px.x,0.)).a+texture2D(u_tex0,v_uv-vec2(u_px.x,0.)).a
+texture2D(u_tex0,v_uv+vec2(0.,u_px.y)).a+texture2D(u_tex0,v_uv-vec2(0.,u_px.y)).a)*.25;
float d=(v_uv.x-u_reflet)*u_zoom.x+(v_uv.y-.5)*.55;float bande=exp(-d*d*u_zoom.y);
gl_FragColor=vec4(u_or*(a*1.15+g*.45)*bande*u_op,0.);}}`;

export interface Programme {
  prog: WebGLProgram;
  attr: Record<string, number>;
  unif: Record<string, WebGLUniformLocation | null>;
}

function compiler(gl: WebGLRenderingContext, vs: string, fs: string, attrs: string[], unifs: string[]): Programme | null {
  const prog = gl.createProgram();
  if (!prog) return null;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const attr: Record<string, number> = {};
  for (const a of attrs) attr[a] = gl.getAttribLocation(prog, a);
  const unif: Record<string, WebGLUniformLocation | null> = {};
  for (const u of unifs) unif[u] = gl.getUniformLocation(prog, u);
  return { prog, attr, unif };
}

export interface Programmes {
  points: Programme;
  traits: Programme;
  images: Programme;
  /** Taille maximale d'un point (px de toile). */
  maxPoint: number;
}

export function programmes(gl: WebGLRenderingContext): Programmes | null {
  const points = compiler(gl, VS_POINTS, FS_POINTS, ['a_p', 'a_t', 'a_g', 'a_c', 'a_r'], ['u_scene', 'u_k', 'u_max']);
  const traits = compiler(gl, VS_TRAITS, FS_TRAITS, ['a_p', 'a_d'],
    ['u_scene', 'u_k', 'u_page', 'u_t', 'u_dur', 'u_op', 'u_lum', 'u_sec', 'u_encre', 'u_or']);
  const images = compiler(gl, VS_IMAGES, FS_IMAGES, ['a_p', 'a_uv'],
    ['u_scene', 'u_tex0', 'u_tex1', 'u_tex2', 'u_mode', 'u_op', 'u_photo', 'u_zoom', 'u_vid', 'u_cadre', 'u_ton', 'u_niv', 'u_reflet', 'u_aa', 'u_or', 'u_px']);
  if (!points || !traits || !images) return null;
  const r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
  return { points, traits, images, maxPoint: r ? Math.min(256, r[1]) : 64 };
}

/** Lie les attributs d'un tampon entrelacé (tailles en flottants, dans l'ordre). */
export function lier(gl: WebGLRenderingContext, P: Programme, tampon: WebGLBuffer, champs: [string, number][]): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
  const pas = champs.reduce((s, [, n]) => s + n, 0) * 4;
  let o = 0;
  for (const [nom, n] of champs) {
    const a = P.attr[nom];
    if (a >= 0) {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, n, gl.FLOAT, false, pas, o);
    }
    o += n * 4;
  }
}

/** Détache les attributs d'un programme (le suivant n'hérite pas d'un tableau activé trop court). */
export function delier(gl: WebGLRenderingContext, P: Programme): void {
  for (const a of Object.values(P.attr)) if (a >= 0) gl.disableVertexAttribArray(a);
}

/** Texture depuis une image ou une toile (alpha prémultiplié ; mipmaps si puissance de deux). */
export function texture(gl: WebGLRenderingContext, src: TexImageSource, mip = false): WebGLTexture | null {
  const t = gl.createTexture();
  if (!t) return null;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mip) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return t;
}
