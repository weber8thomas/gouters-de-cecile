// La flamme de la bougie : un volume émissif rendu en temps réel dans une petite toile WebGL, vu sous
// l'angle exact de la caméra de la scène (scripts/bougie3d/scene.py : caméra en perspective à HCAM cm
// au-dessus du centre de l'écran, PXCM px de scène par cm de table).
//
// Le fragment shader lance, pour chaque pixel de la toile, le rayon de la caméra à travers la flamme et
// le parcourt en NB_PAS pas, de haut en bas (de la pointe vers la cire). La flamme est une vraie flamme
// de bougie, à l'échelle : la zone lumineuse fait ≈ 0,72 cm de large et ≈ 2 cm de haut, la plus large
// vers le tiers bas, effilée en pointe. Autour de la mèche, une zone sombre peu émissive ; à la base,
// une coupelle bleue faible ; au-dessus, la suie incandescente, du jaune-blanc au cœur à l'orangé sur
// les bords et à la pointe, plus transparente. Couleurs : rayonnement du corps noir (≈ 1500 à 2400 K,
// trois longueurs d'onde), puis une courbe tonale douce (le cœur sature presque en blanc chaud, les
// bords gardent leur couleur). La mèche est un petit trait opaque, recourbé, avec une braise au bout.
//
// Vue presque d'en haut (tan α ≈ 0,31), la flamme est une goutte lumineuse autour de la mèche, un peu
// allongée vers le coin de l'écran : un point à h cm au-dessus de la mèche se projette décalé de
// ≈ h · tan α vers l'extérieur.
//
// Mouvement (une flamme calme) :
//   - l'axe de la flamme se déplace latéralement ∝ h², d'une onde qui monte de la base vers la pointe
//     (balancement lent, déphasé avec la hauteur), et se couche sous le vent de la main ;
//   - la longueur respire (± 4 %) et la pointe frémit vite (8 à 12 Hz, faible) ;
//   - un bruit de valeur 3D continu, porté vers le haut par les gaz chauds, ride les bords (plus fort
//     vers la pointe) : rien ne boucle de façon visible.
// L'état global (longueur, éclat, axe) est calculé ici en JS (etatFlamme) et passé au shader : la
// lumière tracée de la bougie (flammeBougie) suit exactement ce qui est rendu.
//
// Le reflet de la flamme dans la cire liquide du puits : la nappe est un miroir faible (Fresnel ≈ 3 % vu
// presque d'aplomb, adouci à l'œil), qu'une marche de plus parcourt le long du rayon réfléchi (le même volume, vu depuis
// sous la nappe). Le reflet bouge avec la flamme, et une ride lente de la nappe (la convection autour de
// la mèche) le fait frémir. Il n'existe que sur la nappe (geometrie.json : flamme.puits).
//
// La toile couvre aussi les coulures : la cire qui coule (cire.ts) y est dessinée avant la flamme, par
// un second programme, dans le même contexte (dessiner(e, avant)).
//
// WebGL 1 (GLSL ES 1.00), un seul triangle plein écran, aucune texture. Alpha prémultiplié normal : la
// suie couvre la cire comme une lumière très vive, la coupelle bleue, le halo et le reflet restent
// faibles en alpha (ils éclairent sans assombrir la cire crème).

/** Géométrie de la scène (scripts/bougie3d/scene.py). */
const PXCM = 39;
const HCAM = 80;
const CENTRE: [number, number] = [960, 540];

/** La toile et la mèche, en px de scène (geometrie.json : flamme). */
export interface GeoFlamme {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Bout de la mèche à l'écran (px de scène). */
  meche: number[];
  /** Hauteur du bout de la mèche au-dessus de la table (cm). */
  z: number;
  /** La nappe liquide du puits : centre (cm, x et y comme l'écran, depuis l'aplomb de la mèche) et rayon. */
  puits?: number[];
}

// ---- La flamme (cm ; h : hauteur au-dessus du bout de la mèche) ---------------------------------------
const HB = -0.3; // bas de la flamme (coupelle bleue), sous le bout de la mèche
const HT = 2.05; // pointe, au repos
const PISCINE = -0.47; // surface de la cire liquide (la mèche en sort)
/** Hauteur verticale de référence pour l'inclinaison (une flamme penchée de θ : axe ∝ tan θ · h² / LV). */
const LV = HT;

// ---- Le mouvement (fréquences en Hz ; poids ; phase en rad) ------------------------------------------
type Onde = readonly [number, number, number];
const TAU = Math.PI * 2;
const somme = (o: readonly Onde[], t: number) => o.reduce((s, [f, a, p]) => s + a * Math.sin(TAU * f * t + p), 0);
/** Respiration de la longueur (± 1, lente et moyenne). */
const RESPIRE: readonly Onde[] = [[0.27, 0.5, 0.4], [0.58, 0.35, 2.1], [1.18, 0.25, 1.2]];
/** Ondulation naturelle de l'éclat de la flamme au repos (courants d'air doux de la pièce). */
const LUEUR: readonly Onde[] = [[0.41, 0.45, 0.2], [0.93, 0.35, 1.7], [1.85, 0.25, 3.1], [3.4, 0.15, 0.8]];
/** Frémissement de la pointe (± 1, 8 à 12 Hz). */
const FREMIT: readonly Onde[] = [[8.7, 0.5, 0], [10.3, 0.3, 1.1], [11.9, 0.2, 2.3]];
/** Balancement de l'axe, en x et en y (± 1, cm à la pointe : × BALANCE). */
const BALANCE_X: readonly Onde[] = [[0.53, 0.55, 0.3], [0.86, 0.3, 1.9], [1.31, 0.15, 4.0]];
const BALANCE_Y: readonly Onde[] = [[0.61, 0.5, 2.2], [0.97, 0.32, 0.7], [1.47, 0.18, 3.3]];
const BALANCE = 0.13; // cm, déplacement de la pointe
const MONTEE = 10; // cm/s : l'onde du balancement monte de la base vers la pointe (0,2 s de retard en haut)
/** Vacillement de la flamme dérangée (°, multiplié par trouble), en x et en y. */
const VACILLE_X: readonly Onde[] = [[3.66, 5, 0], [5.89, 3, 1]];
const VACILLE_Y: readonly Onde[] = [[3.02, 4, 2], [4.93, 3, 0.5]];
/** Le bruit monte avec les gaz : vitesse de sa coordonnée de temps (≈ 5 cm/s pour une fréquence de 2,2 /cm). */
const BRUIT_VITESSE = 11;

// L'axe de la flamme est un polynôme sans terme constant, A(h) = c1 h + c2 h² + c3 h³ + c4 h⁴ (h ≥ 0),
// ajusté à chaque image (moindres carrés) sur NB_AJUSTE hauteurs : le shader l'évalue en quelques
// multiplications.
const NB_AJUSTE = 10;
const H_AJUSTE = Array.from({ length: NB_AJUSTE }, (_, k) => ((k + 1) / NB_AJUSTE) * 2.6);
const AJUSTE = (() => {
  // (XᵀX)⁻¹ Xᵀ, X[k] = [h, h², h³, h⁴]
  const X = H_AJUSTE.map((h) => [h, h * h, h ** 3, h ** 4]);
  const n = 4;
  const a = Array.from({ length: n }, (_, i) => [
    ...Array.from({ length: n }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)),
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    [a[i], a[p]] = [a[p], a[i]];
    const d = a[i][i];
    for (let j = 0; j < 2 * n; j++) a[i][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = a[r][i];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[i][j];
    }
  }
  const inv = a.map((r) => r.slice(n));
  return inv.map((r) => X.map((x) => r.reduce((s, v, j) => s + v * x[j], 0)));
})();

/** L'état de la flamme à un instant : ce que le shader rend, et d'où la lumière de la bougie est tirée. */
export interface EtatFlamme {
  /** Longueur relative (1 au repos). */
  long: number;
  /** Éclat relatif (1 au repos). */
  eclat: number;
  /** Trouble (0 à 1) : la flamme dérangée vacille vite. */
  trouble: number;
  /** Coefficients de l'axe : c1.x, c1.y, c2.x, c2.y, c3.x, c3.y, c4.x, c4.y (cm). */
  axe: Float32Array;
  /** Temps du bruit (coordonnée, modulo 289 : le bruit y est périodique, sans raccord). */
  tn: number;
}

export const etatRepos = (): EtatFlamme => ({ long: 1, eclat: 1, trouble: 0, axe: new Float32Array(8), tn: 0 });

/**
 * La flamme à l'instant t (s) : `vent` est l'inclinaison due au vent (°, vecteur à l'écran, de la
 * physique du souffle de la main), `trouble` et `saut` comme dans Bougie.tsx. Même formule pour le rendu
 * et pour la lumière (flammeBougie = eclat × long). Écrit dans `e` (aucune allocation).
 */
export function etatFlamme(e: EtatFlamme, t: number, vent: [number, number], trouble: number, saut: number): EtatFlamme {
  // vacillement de la flamme dérangée, ajouté à l'inclinaison
  const vx = vent[0] + trouble * somme(VACILLE_X, t);
  const vy = vent[1] + trouble * somme(VACILLE_Y, t);
  const deg = Math.min(40, Math.hypot(vx, vy));
  const pente = Math.tan((deg * Math.PI) / 180);
  const dx = deg > 1e-4 ? vx / Math.hypot(vx, vy) : 0;
  const dy = deg > 1e-4 ? vy / Math.hypot(vx, vy) : 0;
  // sous le vent, la flamme se couche et s'allonge un peu ; dérangée, elle se raccourcit
  e.long = 1 + 0.075 * somme(RESPIRE, t) + 0.025 * somme(FREMIT, t) - saut - 0.16 * trouble
    + 0.05 * trouble * Math.sin(29 * t) + 0.1 * Math.sin((deg * Math.PI) / 180);
  e.eclat = 1 + 0.085 * somme(LUEUR, t) + 0.02 * somme(FREMIT, t + 0.4)
    - 0.6 * saut - 0.28 * trouble * (0.6 + 0.4 * Math.sin(31 * t));
  e.trouble = trouble;
  // l'axe aux hauteurs d'ajustement : couché par le vent (∝ h²), et l'onde du balancement (∝ h², en retard
  // avec la hauteur)
  const L = (HT - HB) * e.long;
  const c = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < NB_AJUSTE; k++) {
    const h = H_AJUSTE[k];
    const tau = t - h / MONTEE;
    const w = (h / L) ** 2;
    const ax = (pente * dx * h * h) / LV + BALANCE * w * somme(BALANCE_X, tau);
    const ay = (pente * dy * h * h) / LV + BALANCE * w * somme(BALANCE_Y, tau);
    for (let j = 0; j < 4; j++) {
      c[2 * j] += AJUSTE[j][k] * ax;
      c[2 * j + 1] += AJUSTE[j][k] * ay;
    }
  }
  e.axe.set(c);
  return e;
}

/** Avance le temps du bruit (plus vite quand la flamme est dérangée). */
export const avancerBruit = (tn: number, dt: number, trouble: number) => (tn + dt * BRUIT_VITESSE * (1 + 2 * trouble)) % 289;

// ---- Couleur : corps noir à trois longueurs d'onde (µm), équilibré pour un blanc de 6500 K ------------
// E(T) = chroma(T) · (B_vert(T) / B_vert(T_COEUR))^GAMMA, chroma normalisée sur le rouge. En log, chaque
// canal vaut B + A / T : le shader n'a qu'une exponentielle par échantillon.
const LAMBDA = [0.61, 0.55, 0.465];
const C2 = 14388; // µm·K
const T_BLANC = 6500;
const T_COEUR = 2400;
const GAMMA = 0.35; // l'intensité suit la température, adoucie (sinon les bords à 1500 K disparaissent)
const CORPS_NOIR = (() => {
  const planck = (l: number, T: number) => l ** -5 / (Math.exp(C2 / (l * T)) - 1);
  const k = LAMBDA.map((l) => Math.log(l ** -5 / planck(l, T_BLANC)));
  const [lr, lv] = [LAMBDA[0], LAMBDA[1]];
  const B = LAMBDA.map((_, i) => k[i] - k[0] + (GAMMA * C2) / (lv * T_COEUR));
  const A = LAMBDA.map((l) => -C2 * (1 / l - 1 / lr + GAMMA / lv));
  return { A, B };
})();

const VS = `attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

/** Nombre de pas de la marche (le long de la hauteur, ≈ 0,08 cm chacun). */
const NB_PAS = 32;
/** Nombre de pas de la marche du reflet (sans bruit : la ride de la nappe le brouille déjà). */
const NB_REFLET = 16;
/** Le reflet : la part de la flamme renvoyée par la nappe (Fresnel de la cire liquide, n ≈ 1,44 : ≈ 3 %
 *  d'aplomb), réglée à l'œil (ajoutée en gamma, elle paraît plus forte qu'en lumière linéaire). */
const REFLET = 0.015;

const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;      // taille de la toile (px de l'écran)
uniform vec4 uBoite;    // la toile en px de scène : x, y, w, h
uniform vec2 uSm;       // la mèche à l'écran, en cm de table depuis l'aplomb de la caméra
uniform float uZ0;      // hauteur du bout de la mèche (cm)
uniform float uLong;
uniform float uEclat;
uniform float uTrouble;
uniform float uTn;
uniform vec4 uAxe12;    // c1, c2
uniform vec4 uAxe34;    // c3, c4
uniform vec3 uCnA;
uniform vec3 uCnB;
uniform float uPx;      // taille d'un pixel (cm), pour l'antialias de la mèche
uniform vec3 uPuits;    // la nappe liquide : centre (cm, repère de la flamme) et rayon

const float PXCM = ${PXCM.toFixed(1)};
const float HCAM = ${HCAM.toFixed(1)};
const vec2 CENTRE = vec2(${CENTRE[0].toFixed(1)}, ${CENTRE[1].toFixed(1)});
const float HB = ${HB.toFixed(2)};
const float HT = ${HT.toFixed(2)};
const float PISCINE = ${PISCINE.toFixed(2)};
const float RMAX = 0.36;        // demi-largeur de la zone lumineuse (cm)
const float PA = 0.6;           // profil : R(s) ∝ s^PA (1 − s)^PB, le plus large à s = PA / (PA + PB)
const float PB = 1.35;
const float NORME = 0.3001;     // s*^PA (1 − s*)^PB, au plus large (s* = PA / (PA + PB))
const float EXPO = 8.0;         // exposition (courbe tonale 1 − e^(−EXPO x))
const float T_BORD = 1500.0;
const float T_COEUR = 2400.0;
const vec3 BLEU = vec3(0.03, 0.12, 1.0);
const vec3 HALO = vec3(1.0, 0.42, 0.12);
const vec3 MECHE = vec3(0.05, 0.035, 0.03);
const float R_MECHE = 0.028;
const int NB_PAS = ${NB_PAS};
const int NB_REFLET = ${NB_REFLET};
const float REFLET = ${REFLET.toFixed(3)};

float lisse(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// Bruit de valeur 3D, périodique de 289 sur chaque axe (permutation polynomiale mod 289).
vec4 permute(vec4 x) { return mod((34.0 * x + 1.0) * x, 289.0); }
float bruit(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  i = mod(i, 289.0);
  vec3 j = mod(i + 1.0, 289.0);
  vec4 px = permute(vec4(i.x, j.x, i.x, j.x));
  vec4 pxy = permute(px + vec4(i.y, i.y, j.y, j.y));
  vec4 h0 = permute(pxy + i.z) * (1.0 / 289.0);
  vec4 h1 = permute(pxy + j.z) * (1.0 / 289.0);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec4 h = mix(h0, h1, u.z);
  vec2 hy = mix(h.xy, h.zw, u.y);
  return mix(hy.x, hy.y, u.x);
}

// Rayon (o + t d, t : hauteur h) et segment [a, b] : distance la plus courte, et la hauteur où le rayon y passe.
vec2 croise(vec3 o, vec3 d, vec3 a, vec3 b) {
  vec3 e = b - a;
  vec3 w = o - a;
  float A = dot(d, d), B = dot(d, e), C = dot(e, e), D = dot(d, w), E = dot(e, w);
  float u = clamp((A * E - B * D) / max(A * C - B * B, 1e-6), 0.0, 1.0);
  float t = (B * u - D) / A;
  return vec2(length(o + t * d - a - u * e), t);
}

void main() {
  // le pixel en px de scène, puis en cm de table depuis l'aplomb de la caméra
  vec2 P = uBoite.xy + vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y) * uBoite.zw;
  vec2 S = (P - CENTRE) / PXCM;
  // le rayon, dans le repère de la flamme (cm, x et y comme l'écran, origine à l'aplomb du bout de la
  // mèche) : à la hauteur h, il passe en D − S h / HCAM
  vec2 D = (S - uSm) * ((HCAM - uZ0) / HCAM);
  vec3 o = vec3(D, 0.0);
  vec3 d = vec3(-S / HCAM, 1.0);

  // la mèche : un trait vertical qui sort de la cire, puis se recourbe de côté, vers la caméra (là où la
  // flamme la voile le moins) ; braise au bout
  vec2 u = normalize(uSm);
  vec2 cote = vec2(-u.y, u.x);
  vec3 m0 = vec3(0.0, 0.0, PISCINE);
  vec3 m1 = vec3(0.0, 0.0, -0.24);
  vec3 m2 = vec3(cote * 0.06 - u * 0.03, -0.13);
  vec3 m3 = vec3(cote * 0.13 - u * 0.09, -0.06);
  vec2 k1 = croise(o, d, m0, m1);
  vec2 k2 = croise(o, d, m1, m2);
  vec2 k3 = croise(o, d, m2, m3);
  float dm = min(k1.x, min(k2.x, k3.x));
  float hMeche = PISCINE - 1.0;
  if (k1.x < R_MECHE) hMeche = max(hMeche, k1.y);
  if (k2.x < R_MECHE) hMeche = max(hMeche, k2.y);
  if (k3.x < R_MECHE) hMeche = max(hMeche, k3.y);
  float tb = dot(m3 - o, d) / dot(d, d);
  float dBraise = length(o + tb * d - m3);

  vec2 c1 = uAxe12.xy, c2 = uAxe12.zw, c3 = uAxe34.xy, c4 = uAxe34.zw;
  float L = (HT - HB) * uLong;
  // le reflet : où le rayon touche la nappe ; au-dessus, le rayon réfléchi passe à la hauteur h là où le
  // rayon direct passerait à 2 PISCINE − h
  vec2 pr = D - S * (PISCINE / HCAM);
  float nappe = 1.0 - smoothstep(uPuits.z - 0.1, uPuits.z, length(pr - uPuits.xy));
  // tôt sorti : loin de l'axe à toutes les hauteurs, rien que le vide (la suie s'arrête à 1,4 R, la
  // queue du halo y est sous 1/255), ni pour le rayon, ni pour son reflet
  float loin = 9.0;
  float loinR = 9.0;
  for (int k = 0; k < 5; k++) {
    float h = HB + L * (float(k) + 0.5) / 5.0;
    float hp = max(h, 0.0);
    vec2 A = hp * (c1 + hp * (c2 + hp * (c3 + hp * c4)));
    loin = min(loin, length(D - S * (h / HCAM) - A));
    loinR = min(loinR, length(D - S * ((2.0 * PISCINE - h) / HCAM) - A));
  }
  bool reflet = nappe > 0.0 && loinR < RMAX + 0.3;
  if (loin > RMAX + 0.4 && !reflet) { gl_FragColor = vec4(0.0); return; }

  float hHaut = HB + L + 0.1;
  float hBas = PISCINE;
  float dh = (hHaut - hBas) / float(NB_PAS);
  // décalage du départ, différent à chaque pixel (bruit de gradient entrelacé) : pas de bandes
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 accS = vec3(0.0);
  vec3 accL = vec3(0.0);
  float bleu = 0.0;
  float agite = 1.0 + 1.5 * uTrouble;
  for (int i = 0; i < NB_PAS; i++) {
    float h = hHaut - (float(i) + j) * dh;
    if (h < hMeche) break;                 // la mèche cache ce qui est dessous
    vec2 p = D - S * (h / HCAM);
    float hp = max(h, 0.0);
    vec2 A = hp * (c1 + hp * (c2 + hp * (c3 + hp * c4)));
    vec2 Ad = c1 + hp * (2.0 * c2 + hp * (3.0 * c3 + 4.0 * hp * c4));
    vec2 r = p - A;
    // la tranche horizontale d'un axe penché est allongée dans le sens de la pente
    float p2 = dot(Ad, Ad);
    float rp = dot(r, Ad) * inversesqrt(p2 + 1e-8);
    float rho = sqrt(max(dot(r, r) - rp * rp * p2 / (1.0 + p2), 0.0));
    float l = h > 0.0 ? length(vec3(A, h)) : h;   // le long de l'axe (corde)
    float s = (l - HB) / L;
    // halo : la lumière diffusée autour de la flamme (bloom), plus fort autour du cœur
    accL += HALO * (0.002 * exp(-rho * rho * 16.0) * lisse(-0.1, 0.25, s) * (1.0 - lisse(0.5, 1.1, s)));
    if (s <= 0.0 || s >= 1.0) continue;
    float R = RMAX * pow(s, PA) * pow(1.0 - s, PB) / NORME;
    float q = rho / max(R, 1e-3);
    if (q > 1.4) continue;
    // les gaz montent : un bruit porté vers le haut ride les bords, plus fort vers la pointe
    float n = bruit(vec3(r * 3.0, l * 2.2 - uTn)) * 2.0 - 1.0;
    q *= 1.0 + (0.05 + 0.22 * s * s) * agite * n;
    // coupelle bleue à la base (une coquille, faible)
    bleu += lisse(-0.03, 0.04, s) * (1.0 - lisse(0.1, 0.2, s)) * exp(-(q - 0.9) * (q - 0.9) * 60.0);
    // suie : au-dessus de la coupelle, bord doux, zone sombre autour de la mèche, pointe plus claire
    float qd = 0.6 * (1.0 - lisse(-0.1, 0.6, h));
    float sombre = 1.0 - 0.94 * (1.0 - lisse(qd - 0.1, qd + 0.2, q)) * lisse(0.0, 0.2, qd);
    float dens = lisse(0.08, 0.26, s) * (1.0 - lisse(0.45, 1.0, q)) * sombre * (1.0 - 0.4 * lisse(0.5, 1.0, s));
    if (dens <= 0.0) continue;
    // température : cœur chaud au milieu, bords et pointe plus froids
    float bosse = lisse(0.05, 0.35, s) * (1.0 - 0.75 * lisse(0.4, 1.0, s));
    float T = T_BORD + (T_COEUR - T_BORD) * (1.0 - q * q) * (0.3 + 0.7 * bosse);
    accS += dens * exp(uCnB + uCnA / max(T, 900.0));
  }
  accS *= dh * uEclat;
  accL *= dh;
  vec3 accB = BLEU * (0.01 * bleu * dh * uEclat);
  // braise au bout de la mèche (≈ 1250 K)
  accL += exp(uCnB + uCnA / 1250.0) * (8.0 * exp(-dBraise * dBraise / 0.0009));

  // le reflet dans la nappe : la même suie (sans le bruit des bords), le long du rayon réfléchi, que la
  // nappe ridée fait dévier un peu (pente lente, ≈ 1 %)
  vec3 accR = vec3(0.0);
  if (reflet) {
    vec2 ride = 0.012 * vec2(bruit(vec3(pr * 3.0, uTn * 0.12)) - 0.5, bruit(vec3(pr * 3.0 + 31.0, uTn * 0.12)) - 0.5);
    float dr = (hHaut - PISCINE) / float(NB_REFLET);
    for (int i = 0; i < NB_REFLET; i++) {
      float h = PISCINE + (float(i) + j) * dr;
      vec2 p = D - S * ((2.0 * PISCINE - h) / HCAM) + 2.0 * ride * (h - PISCINE);
      float hp = max(h, 0.0);
      vec2 A = hp * (c1 + hp * (c2 + hp * (c3 + hp * c4)));
      float l = h > 0.0 ? length(vec3(A, h)) : h;
      float s = (l - HB) / L;
      if (s <= 0.0 || s >= 1.0) continue;
      float R = RMAX * pow(s, PA) * pow(1.0 - s, PB) / NORME;
      float q = length(p - A) / max(R, 1e-3);
      float qd = 0.6 * (1.0 - lisse(-0.1, 0.6, h));
      float sombre = 1.0 - 0.94 * (1.0 - lisse(qd - 0.1, qd + 0.2, q)) * lisse(0.0, 0.2, qd);
      float dens = lisse(0.08, 0.26, s) * (1.0 - lisse(0.45, 1.0, q)) * sombre * (1.0 - 0.4 * lisse(0.5, 1.0, s));
      if (dens <= 0.0) continue;
      float bosse = lisse(0.05, 0.35, s) * (1.0 - 0.75 * lisse(0.4, 1.0, s));
      float T = T_BORD + (T_COEUR - T_BORD) * (1.0 - q * q) * (0.3 + 0.7 * bosse);
      accR += dens * exp(uCnB + uCnA / max(T, 900.0));
    }
    accR *= dr * uEclat * nappe * REFLET;
  }
  vec3 cS = 1.0 - exp(-EXPO * accS);
  vec3 cB = 1.0 - exp(-EXPO * accB);
  vec3 rgb = pow(1.0 - exp(-EXPO * (accS + accB + accL)), vec3(1.0 / 2.2));
  // alpha : la suie couvre (lumière vive : son canal le plus fort, adouci vers sa luminance, pour que les
  // bords rouges sombres teintent la cire sans la salir), le bleu à peine, le halo et la braise pas du tout
  vec3 sS = pow(cS, vec3(1.0 / 2.2));
  float aS = mix(max(sS.r, max(sS.g, sS.b)), dot(sS, vec3(0.2126, 0.7152, 0.0722)), 0.35);
  float a = clamp(aS + max(cB.b, 0.0), 0.0, 1.0);
  // dessous : la mèche, opaque, vue à travers ce qui brille devant elle, ou le reflet (une lumière)
  float cm = 1.0 - smoothstep(R_MECHE - uPx, R_MECHE + uPx, dm);
  vec3 rgbR = pow(1.0 - exp(-EXPO * accR), vec3(1.0 / 2.2));
  rgb += (1.0 - a) * mix(rgbR, MECHE, cm);
  a += cm * (1.0 - a);
  gl_FragColor = vec4(rgb, a);
}`;

/** Une flamme rendue dans une toile. */
export interface RenduFlamme {
  /** Taille du tampon (px de l'écran) ; la toile occupe `px` cm par pixel. */
  taille(w: number, h: number): void;
  /** Dessine la flamme ; `avant` dessine d'abord dans la toile ce qui est dessous (la cire qui coule). */
  dessiner(e: EtatFlamme, avant?: () => void): void;
  /** Le contexte et le triangle plein écran (attribut 0), pour un autre programme dans la même toile. */
  contexte(): { gl: WebGLRenderingContext; triangle: WebGLBuffer } | null;
  /** Durée moyenne d'un appel à dessiner (ms, côté JS) et nombre d'images. */
  mesure(): { ms: number; images: number };
  detruire(): void;
}

/** Crée le rendu WebGL de la flamme dans `toile` ; null sans WebGL (ou si le shader ne compile pas). */
export function creerRenduFlamme(toile: HTMLCanvasElement, geo: GeoFlamme): RenduFlamme | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    const opts: WebGLContextAttributes = {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'low-power',
    };
    gl = (toile.getContext('webgl', opts) ?? toile.getContext('experimental-webgl', opts)) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      console.warn('[Bougie] shader de la flamme :', gl.getShaderInfoLog(sh));
      return null;
    }
    gl.attachShader(prog, sh);
  }
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  // alpha prémultiplié : la flamme par-dessus ce qui est déjà dans la toile
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  const u = (nom: string) => gl!.getUniformLocation(prog, nom);
  const uRes = u('uRes'), uLong = u('uLong'), uEclat = u('uEclat'), uTrouble = u('uTrouble'), uTn = u('uTn');
  const uAxe12 = u('uAxe12'), uAxe34 = u('uAxe34'), uPx = u('uPx');
  gl.uniform4f(u('uBoite'), geo.x, geo.y, geo.w, geo.h);
  gl.uniform2f(u('uSm'), (geo.meche[0] - CENTRE[0]) / PXCM, (geo.meche[1] - CENTRE[1]) / PXCM);
  gl.uniform1f(u('uZ0'), geo.z);
  const puits = geo.puits ?? [0, 0, 0];
  gl.uniform3f(u('uPuits'), puits[0], puits[1], puits[2]);
  gl.uniform3f(u('uCnA'), CORPS_NOIR.A[0], CORPS_NOIR.A[1], CORPS_NOIR.A[2]);
  gl.uniform3f(u('uCnB'), CORPS_NOIR.B[0], CORPS_NOIR.B[1], CORPS_NOIR.B[2]);
  let w = 0;
  let h = 0;
  let cumul = 0;
  let images = 0;
  return {
    taille(nw, nh) {
      if (!gl || (nw === w && nh === h)) return;
      w = nw;
      h = nh;
      toile.width = w;
      toile.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uPx, geo.w / PXCM / Math.max(1, w));
    },
    dessiner(e, avant) {
      if (!gl || !w || gl.isContextLost()) return;
      const t0 = performance.now();
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (avant) {
        avant();
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      }
      gl.uniform1f(uLong, e.long);
      gl.uniform1f(uEclat, e.eclat);
      gl.uniform1f(uTrouble, e.trouble);
      gl.uniform1f(uTn, e.tn);
      gl.uniform4f(uAxe12, e.axe[0], e.axe[1], e.axe[2], e.axe[3]);
      gl.uniform4f(uAxe34, e.axe[4], e.axe[5], e.axe[6], e.axe[7]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      cumul += performance.now() - t0;
      images++;
    },
    mesure: () => ({ ms: images ? cumul / images : 0, images }),
    contexte: () => (gl && buf ? { gl, triangle: buf } : null),
    detruire() {
      if (!gl) return;
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl = null;
    },
  };
}
