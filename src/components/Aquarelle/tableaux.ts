// Petits tableaux du carnet. Même horloge que les aquarelles : aucune animation CSS ou boucle parallèle.
// Les dessins restent des sprites rigides ; seul le thé est un trait SVG entre le bec et la tasse.
import { assetInfo } from '../../lib/assets';
import { cloche, lisse, trajet } from './scenes';
import { RECETTES_TABLEAUX, ETAPES_RECETTES, recetteDe, etatRecette, type RecetteTableau } from './recettesAnimees';
import type { DessinPage } from './vivante';
import { acteur, transition, casserOeuf, fouetter, fruitAuBol, verser } from './gestesCuisine';

export type TableauNom = 'levitation' | 'service-the' | 'coupe-citron' | 'carotte-grignote' | 'gateau-enchante' | 'oeuf-au-bol' | 'vanille-au-bol' | 'framboise-biscuit' | 'pate-crepes' | RecetteTableau;
export const TABLEAUX: Record<TableauNom, { duree: number; libelle: string; assets: string[]; uneFois?:boolean }> = {
  ...RECETTES_TABLEAUX,
  levitation: { duree: 10, libelle: 'La tasse se soulève puis se repose', assets: ['tasse-vide'] },
  'service-the': { duree: 16, libelle: 'La théière sert le thé toute seule', assets: ['theiere-seule', 'tasse-vide'] },
  'coupe-citron': { duree: 11, libelle: 'Le citron se coupe en deux', assets: ['citron-entier', 'citron-gauche', 'citron-droite', 'couteau'] },
  'carotte-grignote': { duree: 9.6, libelle: 'La carotte se grignote puis repousse', assets: [ 'carotte-0', 'carotte-1', 'carotte-2', 'carotte-3'] },
  'oeuf-au-bol': { duree: 14, libelle: 'L’œuf se casse dans le bol et le fouet mélange', assets: ['aquarelles/acteurs/bol', 'aquarelles/acteurs/oeuf', 'aquarelles/acteurs/coquille-gauche', 'aquarelles/acteurs/coquille-droite', 'aquarelles/acteurs/jaune', 'aquarelles/acteurs/fouet'] },
  'vanille-au-bol': { duree: 12, libelle: 'La gousse de vanille parfume le bol', assets: ['aquarelles/acteurs/bol', 'aquarelles/acteurs/gousse', 'aquarelles/acteurs/fleur-vanille'] },
  'framboise-biscuit': { duree: 15, libelle: 'Les spéculoos se cassent et les framboises rejoignent le bol', assets: ['aquarelles/acteurs/bol', 'aquarelles/acteurs/framboise', 'aquarelles/acteurs/speculoos', 'aquarelles/acteurs/speculoos-gauche', 'aquarelles/acteurs/speculoos-droite', 'aquarelles/acteurs/fouet'] },
  'pate-crepes': { duree: 23, libelle: 'Les œufs, la farine et le lait deviennent une pâte à crêpes', assets: ['aquarelles/acteurs/bol', 'aquarelles/acteurs/oeuf', 'aquarelles/acteurs/coquille-gauche', 'aquarelles/acteurs/coquille-droite', 'aquarelles/acteurs/jaune', 'aquarelles/acteurs/fouet', 'aquarelles/acteurs/pichet-lait', 'aquarelles/acteurs/sac-farine', 'aquarelles/acteurs/pate'] },
  'gateau-enchante': { duree: 10, libelle: 'Les gâteaux prennent leur envol', assets: ['aquarelles/gateau-bougies', 'aquarelles/gateau', 'aquarelles/cupcake', 'aquarelles/cupcake-bougie'] },
};
export const estTableau = (n: string): n is TableauNom => n in TABLEAUX;
export function tableauDe(nom: string, page = ''): TableauNom | undefined {
  const recette=recetteDe(page,nom);if(recette)return recette;
  if (nom === 'oeufs') return 'pate-crepes';
  if (nom === 'vanille') return 'vanille-au-bol';
  if (nom === 'framboises-speculoos') return 'framboise-biscuit';
  if (nom === 'theiere') return 'service-the';
  if (nom === 'tasse-2' || nom === 'tasse-coeur') return 'levitation';
  if (nom === 'citron' || nom === 'citron-2') return 'coupe-citron';
  if (nom === 'carotte') return 'carotte-grignote';
  if (['gateau-bougies', 'gateau', 'cupcake', 'cupcake-bougie'].includes(nom)) return 'gateau-enchante';
  return undefined;
}

export interface Acteur { asset: string; x: number; y: number; w: number; angle: number; alpha: number; clip?:[number,number,number,number]; sy?:number }
// Repères des nouveaux sprites v10, mesurés dans leur canevas commun. La deuxième morsure était
// décalée à gauche : on aligne les attaches des fanes avant de composer les étapes.
export const ANCRES_CAROTTE: { attache: [number, number]; bout: [number, number] }[] = [
  { attache: [.52, .415], bout: [.535, .94] },
  { attache: [.525, .415], bout: [.54, .875] },
  { attache: [.46, .415], bout: [.465, .705] },
  { attache: [.535, .415], bout: [.535, .565] },
];
export interface EtatTableau {
  phase: string;
  legende?:{etape:number;total:number;texte:string};
  recipient?:{index:number;coupe:number;forme?:'bol'|'moule'|'casserole'|'rectangle'};
  acteurs: Acteur[];
  liquide: [number, number];
  jet: number;
  tasseVisee: 0 | 1;
  couleurMiettes?:string;
  miettes?: { x: number; y: number; rayon: number; alpha: number }[];
  surface?: {cx:number;cy:number;rx:number;ry:number;alpha:number;asset?:string};
  versement?: {origine:[number,number];cible:[number,number];alpha:number;couleur:string};
  flammes?: { x: number; y: number; rayon: number; angle: number; force: number }[];
}

/** Coordonnées d'un repère peint dans le sprite, après sa transformation rigide. */
export function pointActeur(a: Acteur, p: [number, number], aspects: Record<string, number> = {}): [number, number] {
  const h = a.w / (aspects[a.asset] ?? 1), an = a.angle * Math.PI / 180;
  const dx = (p[0] - 0.5) * a.w, dy = (p[1] - 0.5) * h;
  return [a.x + dx * Math.cos(an) - dy * Math.sin(an), a.y + dx * Math.sin(an) + dy * Math.cos(an)];
}


export const presenceTableau = (type: TableauNom, temps: number) => transition(temps, 0, .65) * (1 - transition(temps, TABLEAUX[type].duree - .8, TABLEAUX[type].duree));

/** Cadres réservés aux dessins : aucune extension générale sur les textes ou les photos. */
export function cadreTableau(_page: string, _nom: string, zone: [number, number, number, number]): [number, number, number, number] { return zone; }
export function vueTableau(type: TableauNom) {
  if(type.startsWith('recette-'))return '0 0 1000 760';
  return type === 'carotte-grignote' || type === 'levitation' ? '230 0 540 650' : type === 'gateau-enchante' ? '190 0 620 650' : type === 'coupe-citron' ? '180 0 640 650' : '0 0 1000 650';
}
export type CommandeTableau = 'rejouer' | 'auto' | 'etapes' | 'suivant' | 'precedent';
export const ETAPES_TABLEAUX: Partial<Record<TableauNom, number[]>> = {
  ...ETAPES_RECETTES,
  'oeuf-au-bol': [2.5,3.15,4.45,9,14],
  'vanille-au-bol': [2.8,7.5,12],
  'framboise-biscuit': [2.6,4.4,8,11,15],
  'pate-crepes': [4.45,8.4,13.5,18.5,23],
};
/** Coordonnées dans un petit théâtre de 1000 × 650. Les raccords de mouvement ont une vitesse nulle. */
export function etatTableau(nom: TableauNom, s: number, aspects: Record<string, number> = {}, principal = 'gateau-bougies'): EtatTableau {
  if(nom.startsWith('recette-'))return etatRecette(nom as RecetteTableau,s);
  const e: EtatTableau = { phase: 'arrivee', acteurs: [], liquide: [0, 0], jet: 0, tasseVisee: 0 };
  if (nom === 'levitation') {
    const monte = transition(s, 0.8, 3), descend = transition(s, 7, 9.2), envol = monte * (1 - descend);
    e.phase = s < 3 ? 'envol' : s < 7 ? 'levitation' : 'retour';
    for (let k = 0; k < 1; k++) {
      const vague = cloche(s, 2.2, 8) * Math.sin(s * 1.9 + k * 1.8);
      e.acteurs.push(acteur('tasse-vide', 500 + 18 * vague, 460 - envol * 175 + 8 * vague, 440, envol * (7 * Math.sin(s * 1.3 + k))));
    }
  } else if (nom === 'service-the') {
    const x = trajet(s, [[0, 690], [1.7, 425], [4, 425], [5.5, 765], [8, 765], [10.2, 690], [11, 690]]);
    const y = trajet(s, [[0, 270], [1.7, 235], [4, 235], [5.5, 235], [8, 235], [10.2, 270], [11, 270]]);
    const angle = trajet(s, [[0, 0], [1.7, -28], [3.7, -28], [4.6, 0], [5.5, -28], [7.8, -28], [8.6, 0], [11, 0]]);
    e.phase = s < 1.7 ? 'approche' : s < 4 ? 'verse-premiere-tasse' : s < 5.5 ? 'change-de-tasse' : s < 8 ? 'verse-seconde-tasse' : s < 9.2 ? 'retour-theiere' : s < 13.5 ? 'tasses-degustent' : 'tasses-se-posent';
    const boit = transition(s, 10, 13.5), leve = transition(s, 9.2, 10.5) * (1-transition(s, 13.5, 15.4));
    e.liquide = [transition(s, 1.9, 3.7)*(1-boit), transition(s, 5.7, 7.8)*(1-boit)];
    e.tasseVisee = s < 4.7 ? 0 : 1;
    e.jet = e.tasseVisee === 0 ? cloche(s, 1.8, 3.9) : cloche(s, 5.6, 7.95);
    e.acteurs = [acteur('theiere-seule', x, y, 360, angle), acteur('tasse-vide', 265, 500-100*leve, 225, -12*leve), acteur('tasse-vide', 605, 500-100*leve, 225, 12*leve)];
  } else if (nom === 'coupe-citron') {
    const coupe = transition(s, 3, 3.5), rejoint = transition(s, 8, 9.2), ouvert = coupe * (1 - rejoint);
    const ecart = trajet(s, [[0, 0], [3.3, 0], [4.8, 140], [7.5, 140], [9.2, 0], [11, 0]]);
    const lameY = trajet(s, [[0, -170], [1.8, 100], [2.5, 100], [3.5, 360], [4.4, 100], [6.2, -170], [11, -170]]);
    const lameX = trajet(s, [[0, 710], [1.8, 555], [4.4, 555], [6.2, 820], [9, 820], [11, 710]]);
    e.phase = s < 2.5 ? 'couteau-arrive' : s < 3.5 ? 'coupe' : s < 8 ? 'deux-moities' : 'reunion-magique';
    e.acteurs = [acteur('citron-entier', 500, 405, 385, 0, 1 - ouvert), acteur('citron-gauche', 500 - ecart, 422, 230, -ouvert * 5, ouvert), acteur('citron-droite', 500 + ecart, 422, 230, ouvert * 5, ouvert), acteur('couteau', lameX, lameY, 340, -24)];
  } else if (nom === 'carotte-grignote') {
    s *= 11 / TABLEAUX[nom].duree;
    const bouchées = [3.8, 5.2, 6.6];
    const repousse = transition(s, 9, 10.5);
    const mange = bouchées.reduce((n, t) => n + transition(s, t, t + .3), 0) * (1 - repousse);
    // Chaque passage entre deux dessins ralentit aux deux bouts, y compris à la repousse.
    const passages = [0, 1, 2].map((k) => Math.max(0, Math.min(1, lisse(mange - k))));
    const alphas = [1 - passages[0], passages[0] - passages[1], passages[1] - passages[2], passages[2]];
    const fremit = bouchées.reduce((v, t) => v + .7 * cloche(s, t, t + .4) * Math.sin((s - t) * 24), 0);
    e.phase = s < 3.8 ? 'entiere' : s < 6.9 ? 'grignotage' : s < 9 ? 'trognon' : 'repousse';
    const carotte = acteur('carotte-0', 500, 320, 440, fremit);
    const attache = pointActeur(carotte, ANCRES_CAROTTE[0].attache, aspects);
    e.acteurs = alphas.map((alpha, k) => {
      const c = { ...carotte, asset: `carotte-${k}`, alpha };
      const p = pointActeur(c, ANCRES_CAROTTE[k].attache, aspects);
      c.x += attache[0] - p[0]; c.y += attache[1] - p[1]; return c;
    });
    e.miettes = bouchées.flatMap((t, k) => {
      const p = pointActeur(e.acteurs[k], ANCRES_CAROTTE[k].bout, aspects), age = s - t;
      return Array.from({ length: 5 }, (_, j) => {
        const d = transition(age, 0, .7);
        return { x: p[0] + (j - 2) * 15 * d, y: p[1] - (22 + j * 2) * Math.sin(Math.PI * d) + 40 * d * d, rayon: 2 + (j % 2), alpha: .72 * cloche(age, 0, .7) };
      });
    });
  } else if (nom === 'oeuf-au-bol') {
    e.phase = s < 2.6 ? 'approche-du-bol' : s < 3.2 ? 'coquille-separee' : s < 4.5 ? 'jaune-tombe' : s < 10.7 ? 'fouet-melange' : 'retour';
    e.acteurs = [acteur('aquarelles/acteurs/bol',500,470,480),...casserOeuf(s),fouetter(s,4.5,10.7)];
    const bat=cloche(s,4.5,10.7);
    e.miettes = Array.from({length:8},(_,k)=>({x:500+Math.cos(k*2.4)*80*bat,y:355-Math.abs(Math.sin(s*7+k))*70*bat,rayon:2.5,alpha:bat*.55}));
  } else if (nom === 'vanille-au-bol') {
    const leve=transition(s,.8,2.6)*(1-transition(s,9,11.7)), gratte=cloche(s,3,8.5);
    e.phase=s<3?'gousse-approche':s<8.5?'graines-tombent':'retour';
    e.acteurs=[acteur('aquarelles/acteurs/gousse',220+280*leve+gratte*12*Math.sin(s*9),225-45*leve,300,-20*leve),acteur('aquarelles/acteurs/fleur-vanille',800,450,180),acteur('aquarelles/acteurs/bol',500,470,460)];
    e.miettes=Array.from({length:15},(_,k)=>{const t=(s*.9+k/15)%1;return{x:475+Math.sin(k*5)*55,y:220+t*t*185,rayon:1.8,alpha:gratte*.8*Math.sin(t*Math.PI)}});
  } else if (nom === 'framboise-biscuit') {
    const leve=transition(s,.7,2.5)*(1-transition(s,12,14.8)), casse=transition(s,2.8,3.4)*(1-transition(s,12,12.4));
    const x=220+280*leve,y=370-185*leve;
    e.phase=s<2.8?'biscuit-approche':s<4.5?'biscuit-casse':s<8.5?'framboises-dans-le-bol':s<11.5?'melange':'retour';
    e.acteurs=[acteur('aquarelles/acteurs/bol',500,480,500),acteur('aquarelles/acteurs/speculoos',x,y,275,0,1-casse),acteur('aquarelles/acteurs/speculoos-gauche',x-65*casse,y,170,-18*casse,casse),acteur('aquarelles/acteurs/speculoos-droite',x+65*casse,y,170,18*casse,casse),
      fruitAuBol('aquarelles/acteurs/framboise',s,5,6.8,11.8,14,[790,390],[455,355],145,-35),
      fruitAuBol('aquarelles/acteurs/framboise',s,5.7,7.6,12.2,14.8,[860,470],[550,365],125,30),
      {...fouetter(s,8,11.5),alpha:transition(s,7.7,8.2)*(1-transition(s,13.1,14.6))}];
    const emiette=cloche(s,3,6.5);
    e.miettes=Array.from({length:15},(_,k)=>{const t=(s*.8+k/15)%1;return{x:500+Math.sin(k*7)*85,y:225+170*t*t,rayon:2+k%3,alpha:emiette*.8*Math.sin(t*Math.PI)}});
  } else if (nom === 'pate-crepes') {
    const oeuf=casserOeuf(s<4.5?s:s<19?4.5:4.5+(s-19)*2.375);
    const farine=verser('aquarelles/acteurs/sac-farine',s,4.6,8.3,[160,300],220,-70);
    const lait=verser('aquarelles/acteurs/pichet-lait',s,9,13.4,[825,330],230,-48);
    const pate=transition(s,13.4,15)*(1-transition(s,20,23));
    e.phase=s<4.5?'oeuf-dans-le-bol':s<9?'farine-dans-le-bol':s<14?'lait-dans-le-bol':s<19?'pate-lisse':'retour';
    e.acteurs=[acteur('aquarelles/acteurs/bol',500,470,480),...oeuf,farine.acteur,lait.acteur,fouetter(s,14,19)];
    e.miettes=Array.from({length:15},(_,k)=>{const q=(s*.75+k/15)%1;return{x:500+Math.sin(k*7)*65,y:245+160*q*q,rayon:2+k%3,alpha:farine.debit*.8*Math.sin(q*Math.PI)}});
    e.couleurMiettes='#e8dcc3';
    e.surface={cx:500,cy:385,rx:164,ry:30,alpha:pate*.9};
    e.versement={origine:pointActeur(lait.acteur,[.1,.28],aspects),cible:[500,385],alpha:lait.debit,couleur:'#eee1be'};
  } else {
    const envol = transition(s, .7, 2.7) * (1 - transition(s, 7.6, 9.3));
    const vol = cloche(s, 1.5, 8.8), phase = s * 1.25;
    const patisserie = acteur(`aquarelles/${principal}`, 500 + 35 * vol * Math.sin(phase), 400 - 145 * envol + 18 * vol * Math.sin(phase * .8), 490, 5 * vol * Math.sin(phase));
    e.phase = s < 2.7 ? 'gateaux-decollent' : s < 7.6 ? 'ronde-des-gateaux' : 'gateaux-se-posent';
    e.acteurs = [patisserie];
    const reperes: [number, number][] = principal === 'gateau-bougies' ? [[.2676, .2228], [.3525, .185], [.4926, .1472], [.6328, .1904], [.7287, .2228]] : principal === 'gateau' ? [[.770,.207]] : principal === 'cupcake-bougie' ? [[.4624, .0946]] : [];
    e.flammes = reperes.map((p, k) => { const [x, y] = pointActeur(patisserie, p, aspects); return { x, y, rayon: principal === 'gateau-bougies' ? 7 : 10, angle: patisserie.angle + 8 * Math.sin(s * 4 + k), force: .86 + .14 * Math.sin(s * 8 + k) }; });
  }
  return e;
}

type SceneDOM = { d: Omit<DessinPage, 'peindre'>; type: TableauNom; bouton: HTMLButtonElement; svg: SVGSVGElement; acteurs: SVGImageElement[]; liquides: SVGEllipseElement[]; fronts: SVGImageElement[]; jet: SVGPathElement; miettes: SVGCircleElement[]; flammes: SVGPathElement[]; surface: SVGImageElement; surfaceEllipse:SVGEllipseElement; legende?:HTMLParagraphElement; commandes?: HTMLDivElement; compteur?: HTMLOutputElement; pret: boolean; etat?: EtatTableau };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(nom: K): SVGElementTagNameMap[K] => document.createElementNS(NS, nom);
const attributs = (el: Element, a: Record<string, string | number>) => { for (const [k, v] of Object.entries(a)) el.setAttribute(k, String(v)); };
const logique = (a: string) => a.startsWith('aquarelles/') ? a : `aquarelles/scenes/${a}`;

export class Theatre {
  private scenes = new Map<string, SceneDOM>();
  private aspects: Record<string, number> = {};
  constructor(private couche: HTMLElement, dessins: Omit<DessinPage, 'peindre'>[], private url: (nom: string) => string | undefined, declencher: (nom: string, type: TableauNom, commande: CommandeTableau) => void, _aspect: number, page = '') {
    for (const d of dessins) {
      const type = tableauDe(d.nom,page); if (!type || d.zone[2] < .24 || d.zone[3] < .15) continue;
      const def = TABLEAUX[type];
      for (const a of def.assets) { const info = assetInfo(logique(a)); if (info) this.aspects[a] = info.w / info.h; }
      if (!def.assets.every((a) => url(logique(a)))) continue;
      const bouton = document.createElement('button'); bouton.type = 'button'; bouton.className = 'gc-tableau-bouton'; bouton.disabled = true;
      bouton.setAttribute('data-gc-tableau-cible', d.nom);
      bouton.setAttribute('aria-label', def.libelle);
      Object.assign(bouton.style, { left: `${d.zone[0] * 100}%`, top: `${d.zone[1] * 100}%`, width: `${d.zone[2] * 100}%`, height: `${d.zone[3] * 100}%` });
      bouton.addEventListener('pointerdown', (e) => e.stopPropagation()); bouton.addEventListener('click', (e) => { e.stopPropagation(); declencher(d.nom, type, 'rejouer'); });
      const svg = svgEl('svg'); svg.classList.add('gc-tableau'); svg.setAttribute('aria-hidden', 'true'); attributs(svg, { viewBox: vueTableau(type), preserveAspectRatio: 'xMidYMid meet' });
      const [x, y, largeur, hauteur] = cadreTableau(page, d.nom, d.zone);
      Object.assign(svg.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${largeur * 100}%`, height: `${hauteur * 100}%`, opacity: '0' });
      const acteurs: SVGImageElement[] = [];
      const decoupes=svgEl('defs');svg.append(decoupes);
      for (let k = 0; k < 24; k++) { const im = svgEl('image'); im.setAttribute('preserveAspectRatio', 'xMidYMid meet'); const clip=svgEl('clipPath'),r=svgEl('rect');clip.id=`gc-acteur-${Math.random().toString(36).slice(2)}`;clip.setAttribute('clipPathUnits','userSpaceOnUse');clip.append(r);decoupes.append(clip);im.dataset.decoupe=clip.id;svg.append(im); acteurs.push(im); }
      const surface=svgEl('image'); const surfaceClip=svgEl('clipPath'),surfaceEllipse=svgEl('ellipse'),surfaceId=`gc-pate-${Math.random().toString(36).slice(2)}`; surfaceClip.id=surfaceId;surfaceClip.setAttribute('clipPathUnits','userSpaceOnUse');attributs(surfaceEllipse,{cx:500,cy:385,rx:164,ry:30});surfaceClip.append(surfaceEllipse);svg.append(surfaceClip);attributs(surface,{href:url('aquarelles/acteurs/pate')??'',opacity:0,'clip-path':`url(#${surfaceId})`,preserveAspectRatio:'none'}); svg.insertBefore(surface,acteurs[1]);
      const liquides = [svgEl('ellipse'), svgEl('ellipse')], fronts = [svgEl('image'), svgEl('image')];
      const defs = svgEl('defs'); svg.append(defs);
      for (let k = 0; k < 2; k++) {
        liquides[k].setAttribute('fill', '#b98245'); liquides[k].setAttribute('opacity', '0'); svg.append(liquides[k]);
        const clip = svgEl('clipPath'), rect = svgEl('rect'), id = `gc-the-rim-${d.nom}-${Math.random().toString(36).slice(2)}`;
        attributs(rect, { x: -10000, y: 0, width: 20000, height: 10000 }); clip.setAttribute('clipPathUnits', 'userSpaceOnUse'); clip.append(rect); clip.id = id; defs.append(clip);
        fronts[k].setAttribute('clip-path', `url(#${id})`); fronts[k].setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg.append(fronts[k]);
      }
      const jet = svgEl('path'); attributs(jet, { fill: 'none', stroke: '#b78348', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0 }); svg.append(jet);
      const miettes = Array.from({ length: 15 }, () => {
        const c = svgEl('circle'); attributs(c, { fill: '#c88b4d', opacity: 0 }); svg.append(c); return c;
      });
      const flammes = Array.from({ length: 5 }, () => {
        const f = svgEl('path'); attributs(f, { d: 'M0,1 C-1.1,.2 -.7,-.9 0,-1.8 C.2,-.6 1.1,-.1 0,1Z', fill: '#d58c42', opacity: 0 }); svg.append(f); return f;
      });
      let commandes: HTMLDivElement|undefined, compteur:HTMLOutputElement|undefined;
      if (ETAPES_TABLEAUX[type]) {
        commandes=document.createElement('div'); commandes.className='gc-recette-commandes';
        Object.assign(commandes.style,{left:`${d.zone[0]*100}%`,top:`${(d.zone[1]+d.zone[3]) *100}%`,width:`${d.zone[2]*100}%`});
        commandes.setAttribute('role','group');commandes.setAttribute('aria-label','Animation de cuisine');
        for(const [label,commande] of [['Précédente','precedent'],['Suivante','suivant'],['Pas à pas','etapes'],['Rejouer','rejouer']] as const){
          const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.commande=commande;
          b.addEventListener('pointerdown',e=>e.stopPropagation());b.addEventListener('click',e=>{e.stopPropagation();declencher(d.nom,type,commande==='etapes'&&commandes?.dataset.mode==='etapes'?'auto':commande)});commandes.append(b);
        }
        compteur=document.createElement('output');compteur.className='gc-recette-commandes__etape';compteur.setAttribute('aria-label','Étape de la recette');commandes.append(compteur);
      }
      let legende:HTMLParagraphElement|undefined;if(type.startsWith('recette-')){legende=document.createElement('p');legende.className='gc-recette-legende';Object.assign(legende.style,{left:`${d.zone[0]*100}%`,top:`${(d.zone[1]+d.zone[3])*100}%`,width:`${d.zone[2]*100}%`});}
      this.couche.append(svg, bouton);if(commandes)this.couche.append(commandes);if(legende)this.couche.append(legende);
      const scene: SceneDOM = { d, type, bouton, svg, acteurs, liquides, fronts, jet, miettes, flammes, surface, surfaceEllipse, legende, commandes, compteur, pret: false }; this.scenes.set(d.nom, scene);
      Promise.all(def.assets.map(async (a) => { const im = new Image(); im.src = url(logique(a))!; await im.decode(); })).then(() => { scene.pret = true; bouton.disabled = false; }).catch(() => { bouton.remove(); svg.remove();commandes?.remove();legende?.remove(); this.scenes.delete(d.nom); });
    }
  }

  disponible(nom: string, type: TableauNom) { const s = this.scenes.get(nom); return !!s?.pret && s.type === type; }
  prepare(nom: string) { return this.scenes.has(nom); }
  cacher(nom: string) { const s = this.scenes.get(nom); if (s) { s.svg.style.opacity = '0'; s.svg.removeAttribute('data-gc-tableau'); s.etat = undefined; } }
  etat(nom: string) { const s = this.scenes.get(nom); return s?.etat ? { nom: s.type, ...s.etat } : null; }
  private poserImage(im: SVGImageElement, a: Acteur) {
    const u = this.url(logique(a.asset))!, info = assetInfo(logique(a.asset)), h = a.w / (info ? info.w / info.h : 1);
    attributs(im, { href: u, x: -a.w / 2, y: -h / 2, width: a.w, height: h, transform: `translate(${a.x} ${a.y}) rotate(${a.angle}) scale(1 ${a.sy??1})`, opacity: a.alpha });
    const id=im.dataset.decoupe;if(id&&a.clip){const rect=im.ownerSVGElement?.querySelector(`#${id} rect`);if(rect)attributs(rect,{x:-a.w/2+a.clip[0]*a.w,y:-h/2+a.clip[1]*h,width:a.clip[2]*a.w,height:a.clip[3]*h});im.setAttribute('clip-path',`url(#${id})`);}else if(id)im.removeAttribute('clip-path');
    return h;
  }

  rendre(nom: string, type: TableauNom, temps: number, peinture = 1, pilotage?:{temps:number;cible:number}): number {
    const s = this.scenes.get(nom); if (!s?.pret || s.type !== type) return 0;
    const e = etatTableau(type, temps, this.aspects, s.d.nom), alpha = Math.min(1, Math.max(0, peinture));
    if(s.commandes){
      s.commandes.dataset.mode=pilotage?'etapes':'auto';s.commandes.style.visibility=peinture>=1?'visible':'hidden';
      const rep=ETAPES_TABLEAUX[type]??[];
      const index=pilotage?Math.max(0,rep.findIndex(t=>t>=pilotage.cible-.01)):(e.legende?.etape??Math.max(1,rep.findIndex(t=>t>=temps)+1))-1;
      const compte=`${index+1} / ${rep.length}`;if(s.compteur&&s.compteur.textContent!==compte)s.compteur.textContent=compte;
      for(const b of s.commandes.querySelectorAll<HTMLButtonElement>('button')){
        const c=b.dataset.commande;
        b.disabled=!s.pret||(c==='precedent'&&index===0)||(c==='suivant'&&index===rep.length-1);
        if(c==='etapes'){const label=pilotage?'Lecture auto':'Pas à pas';if(b.textContent!==label)b.textContent=label;}
      }
    }
    if(s.legende){const texte=e.legende?`${e.legende.etape}. ${e.legende.texte}`:'';if(s.legende.textContent!==texte)s.legende.textContent=texte;s.legende.style.visibility=peinture>=1?'visible':'hidden';}
    s.etat = e; s.svg.style.opacity = String(alpha); s.svg.setAttribute('data-gc-tableau', type); s.svg.setAttribute('data-gc-phase', e.phase);
    s.acteurs.forEach((im, k) => { const a = e.acteurs[k]; if (a) this.poserImage(im, a); else im.setAttribute('opacity', '0'); });
    const surface=e.surface,puree=surface?.asset?.endsWith('/puree-orange'),facteur=puree?4:2.2;
    attributs(s.surface,{href:this.url(surface?.asset??'aquarelles/acteurs/pate')??''});
    attributs(s.surfaceEllipse,{cx:surface?.cx??0,cy:surface?.cy??0,rx:surface?.rx??0,ry:surface?.ry??0});
    attributs(s.surface,{x:surface?(surface.cx-surface.rx*facteur):0,y:surface?(surface.cy-surface.ry*2*facteur*(puree?.35:.5)):0,width:(surface?.rx??0)*2*facteur,height:(surface?.ry??0)*2*facteur,opacity:surface?.alpha??0});
    s.liquides.forEach((el) => el.setAttribute('opacity', '0')); s.fronts.forEach((el) => el.setAttribute('opacity', '0'));
    s.jet.setAttribute('opacity', '0');
    s.miettes.forEach((c, k) => {
      const m = e.miettes?.[k];
      if (m) attributs(c, { cx: m.x, cy: m.y, r: m.rayon, opacity: m.alpha, fill:e.couleurMiettes??'#c88b4d' }); else c.setAttribute('opacity', '0');
    });
    s.flammes.forEach((f, k) => {
      const a = e.flammes?.[k];
      if (a) attributs(f, { transform: `translate(${a.x} ${a.y}) rotate(${a.angle}) scale(${a.rayon})`, opacity: a.force });
      else f.setAttribute('opacity', '0');
    });
    if(e.recipient){
      const a=e.acteurs[e.recipient.index],h=this.poserImage(s.fronts[0],a);
      const clipId=s.fronts[0].getAttribute('clip-path')?.slice(4,-1),clip=clipId?s.svg.querySelector(clipId):null;
      const r=clip?.querySelector('rect');if(r)r.setAttribute('display','none');
      let path=clip?.querySelector('path');if(!path&&clip){path=svgEl('path');clip.append(path);}
      const f=e.recipient.forme??'bol';
      const q=f==='moule'?[-.46,-.04,0,.38,.46,-.04]:f==='casserole'?[-.45,-.067,-.14,.24,.17,-.067]:[-.45,-.14,0,.04,.45,-.14];
      if(path)attributs(path,{display:'inline',d:f==='rectangle'?`M${-.46*a.w} ${-.053*h} L${-.14*a.w} ${.092*h} L${.455*a.w} ${-.20*h} L${a.w} ${h} L${-a.w} ${h}Z`:`M${q[0]*a.w} ${q[1]*h} Q${q[2]*a.w} ${q[3]*h} ${q[4]*a.w} ${q[5]*h} L${a.w} ${h} L${-a.w} ${h}Z`});
    }
    if(['oeuf-au-bol','vanille-au-bol','framboise-biscuit','pate-crepes'].includes(type)){
      const bol=e.acteurs.find(a=>a.asset==='aquarelles/acteurs/bol');if(bol){
        const h=this.poserImage(s.fronts[0],bol);
        const clipId=s.fronts[0].getAttribute('clip-path')?.slice(4,-1);const r=clipId?s.svg.querySelector(clipId)?.querySelector('rect'):null;if(r)r.setAttribute('y',String(-h*.05));
      }
    }
    if(e.versement){const v=e.versement;attributs(s.jet,{d:`M${v.origine[0]} ${v.origine[1]} Q${v.origine[0]-12} ${v.cible[1]-65} ${v.cible[0]} ${v.cible[1]}`,stroke:v.couleur,opacity:v.alpha*.9});}
    if (type === 'service-the') {
      s.jet.setAttribute('stroke','#b78348');
      // Le liquide repose sous une copie de la lèvre avant : la tasse garde son dessin et son volume.
      for (let k = 0; k < 2; k++) {
        const a = e.acteurs[k + 1], info = assetInfo(logique(a.asset)), h = a.w / (info ? info.w / info.h : 1);
        const cx = a.x - a.w * .017, cy = a.y - h * .31, rx = a.w * .31, ry = h * .12;
        attributs(s.liquides[k], { cx, cy, rx, ry, opacity: e.liquide[k] * 0.88 });
        this.poserImage(s.fronts[k], a);
        const clipId = s.fronts[k].getAttribute('clip-path')?.slice(4, -1), clip = clipId ? s.svg.querySelector(clipId) : null;
        const rect = clip?.querySelector('rect'); if (rect) rect.setAttribute('y', String(cy + ry * .9 - a.y));
      }
      const p = e.acteurs[0], info = assetInfo(logique(p.asset)), h = p.w / (info ? info.w / info.h : 1), an = p.angle * Math.PI / 180;
      const dx = -p.w * .42, dy = -h * .225, sx = p.x + dx * Math.cos(an) - dy * Math.sin(an), sy = p.y + dx * Math.sin(an) + dy * Math.cos(an);
      const cible = e.acteurs[e.tasseVisee + 1], ci = assetInfo(logique(cible.asset)), ch = cible.w / (ci ? ci.w / ci.h : 1), tx = cible.x - cible.w * .017, ty = cible.y - ch * .31;
      attributs(s.jet, { d: `M ${sx} ${sy} C ${sx + 8} ${sy + 90}, ${tx - 10} ${ty - 75}, ${tx} ${ty}`, opacity: e.jet * 0.85 });
    }
    return 1;
  }
  detruire() { this.scenes.clear(); this.couche.replaceChildren(); }
}
