// « L'encre s'écrit toute seule » (tour 3) : la première fois qu'on arrive sur une page du livre, son encre
// apparaît trait après trait, dans l'ordre où la main l'a écrite, comme sous une plume invisible. Puis la
// page redevient l'image cuite ordinaire.
//
// La cuisson fournit une carte des temps par page (scripts/bake-temps-encre.py → pages/temps/<page>,
// 1 px de page, t sur 16 bits : rouge = octet fort, vert = octet faible). Un petit canvas WebGL révèle
// l'encre de la page (RGBA) là où t ≤ progression. Tant qu'une page n'est pas écrite, toutes ses copies
// (feuillet qui tourne, loupe) cachent leur encre : on ne la voit jamais avant qu'elle s'écrive.
//
// Une seule fois par page et par visite. Rien ne s'écrit en mouvement réduit (système ou réglage), hors du
// livre vivant, pendant un geste, ni si WebGL manque : l'encre est alors simplement là.

import { assetInfo, assetUrl } from '../../lib/assets';
import { prefersReducedMotion } from '../../lib/motion';

const ecrites = new Set<string>();
const abonnes = new Set<() => void>();
let version = 0;

export const tempsDe = (page: string): string | null => (assetInfo(`pages/temps/${page}`) ? `pages/temps/${page}` : null);

/** La page a-t-elle encore à s'écrire ? (carte des temps présente, pas encore écrite, mouvement permis) */
export function aEcrire(page: string): boolean {
  return !ecrites.has(page) && !!tempsDe(page) && !prefersReducedMotion();
}

export function marquerEcrite(page: string): void {
  if (ecrites.has(page)) return;
  ecrites.add(page);
  version++;
  abonnes.forEach((f) => f());
}

export const abonnerEcriture = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};
export const versionEcriture = () => version;

const VS = `attribute vec2 p;varying vec2 uv;
void main(){uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0.,1.);}`;
const FS = `precision highp float;varying vec2 uv;uniform sampler2D encre;uniform sampler2D temps;uniform float t;uniform float bord;
void main(){vec4 c=texture2D(encre,uv);vec2 m=texture2D(temps,uv).rg;float tt=(m.r*65280.+m.g*255.)/65535.;
float a=1.-smoothstep(t-bord,t,tt);gl_FragColor=c*a;}`;

function charger(src: string): Promise<HTMLImageElement> {
  const im = new Image();
  im.decoding = 'async';
  im.src = src;
  return im.decode().then(() => im);
}

function texture(gl: WebGLRenderingContext, im: HTMLImageElement, unite: number, filtre: number): WebGLTexture | null {
  const tx = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unite);
  gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtre);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtre);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
  return tx;
}

/**
 * Écrit l'encre de `page` dans `canvas` en `duree` ms, puis appelle `fin`. Renvoie une fonction d'arrêt
 * (arrêt = la page est écrite d'un coup). Échec (WebGL, image) : `fin` tout de suite.
 */
export function ecrire(canvas: HTMLCanvasElement, page: string, encre: string, duree: number, fin: () => void): () => void {
  let arrete = false;
  let raf = 0;
  let gl: WebGLRenderingContext | null = null;
  const terminer = () => {
    if (arrete) return;
    arrete = true;
    cancelAnimationFrame(raf);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    fin();
  };
  const temps = tempsDe(page);
  if (!temps) {
    terminer();
    return terminer;
  }
  Promise.all([charger(assetUrl(encre)), charger(assetUrl(temps))])
    .then(([imE, imT]) => {
      if (arrete) return;
      canvas.width = imE.naturalWidth;
      canvas.height = imE.naturalHeight;
      gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
      if (!gl) return terminer();
      const prog = gl.createProgram()!;
      for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        gl.attachShader(prog, s);
      }
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return terminer();
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const p = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(p);
      gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      texture(gl, imE, 0, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      texture(gl, imT, 1, gl.NEAREST); // jamais d'interpolation entre octet fort et octet faible
      gl.uniform1i(gl.getUniformLocation(prog, 'encre'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'temps'), 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'bord'), 0.004);
      const uT = gl.getUniformLocation(prog, 't');
      gl.viewport(0, 0, canvas.width, canvas.height);
      const t0 = performance.now();
      const image = (now: number) => {
        if (arrete || !gl) return;
        const x = Math.min(1, (now - t0) / duree);
        // la plume part doucement et finit sans à-coup
        const t = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uT, t * 1.004);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (x >= 1) terminer();
        else raf = requestAnimationFrame(image);
      };
      raf = requestAnimationFrame(image);
    })
    .catch(terminer);
  return terminer;
}
