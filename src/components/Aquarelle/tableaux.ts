// Petits tableaux du carnet. Même horloge que les aquarelles : aucune animation CSS ou boucle parallèle.
// Les dessins restent des sprites rigides ; seul le thé est un trait SVG entre le bec et la tasse.
import { assetInfo } from '../../lib/assets';
import { cloche, lisse, trajet } from './scenes';
import type { DessinPage } from './vivante';

export type TableauNom = 'levitation' | 'service-the' | 'coupe-citron' | 'lapin-carotte' | 'gateau-enchante';
export const TABLEAUX: Record<TableauNom, { duree: number; libelle: string; assets: string[] }> = {
  levitation: { duree: 10, libelle: 'Les tasses se mettent à léviter', assets: ['tasse-vide'] },
  'service-the': { duree: 11, libelle: 'La théière sert le thé toute seule', assets: ['theiere-seule', 'tasse-vide'] },
  'coupe-citron': { duree: 11, libelle: 'Le citron se coupe en deux', assets: ['citron-entier', 'citron-gauche', 'citron-droite', 'couteau'] },
  'lapin-carotte': { duree: 11, libelle: 'Le lapin vient grignoter la carotte', assets: ['lapin', 'carotte-0', 'carotte-1', 'carotte-2', 'carotte-3'] },
  'gateau-enchante': { duree: 10, libelle: 'Les gâteaux prennent leur envol', assets: ['aquarelles/gateau-bougies', 'aquarelles/gateau', 'aquarelles/cupcake', 'aquarelles/cupcake-bougie'] },
};
export const estTableau = (n: string): n is TableauNom => n in TABLEAUX;
export function tableauDe(nom: string): TableauNom | undefined {
  if (nom === 'theiere') return 'service-the';
  if (nom === 'tasse-2' || nom === 'tasse-coeur') return 'levitation';
  if (nom === 'citron' || nom === 'citron-2') return 'coupe-citron';
  if (nom === 'carotte') return 'lapin-carotte';
  if (['gateau-bougies', 'gateau', 'cupcake', 'cupcake-bougie'].includes(nom)) return 'gateau-enchante';
  return undefined;
}

export interface Acteur { asset: string; x: number; y: number; w: number; angle: number; alpha: number }
// Repères des nouveaux sprites v10, mesurés dans leur canevas commun. La deuxième morsure était
// décalée à gauche : on aligne les attaches des fanes avant de composer les étapes.
export const BOUCHE_LAPIN: [number, number] = [.1, .48];
export const ANCRES_CAROTTE: { attache: [number, number]; bout: [number, number] }[] = [
  { attache: [.52, .415], bout: [.535, .94] },
  { attache: [.525, .415], bout: [.54, .875] },
  { attache: [.46, .415], bout: [.465, .705] },
  { attache: [.535, .415], bout: [.535, .565] },
];
export interface EtatTableau {
  phase: string;
  acteurs: Acteur[];
  liquide: [number, number];
  jet: number;
  tasseVisee: 0 | 1;
  flammes?: { x: number; y: number; rayon: number; angle: number; force: number }[];
}
const acteur = (asset: string, x: number, y: number, w: number, angle = 0, alpha = 1): Acteur => ({ asset, x, y, w, angle, alpha });
/** Coordonnées d'un repère peint dans le sprite, après sa transformation rigide. */
export function pointActeur(a: Acteur, p: [number, number], aspects: Record<string, number> = {}): [number, number] {
  const h = a.w / (aspects[a.asset] ?? 1), an = a.angle * Math.PI / 180;
  const dx = (p[0] - 0.5) * a.w, dy = (p[1] - 0.5) * h;
  return [a.x + dx * Math.cos(an) - dy * Math.sin(an), a.y + dx * Math.sin(an) + dy * Math.cos(an)];
}

const transition = (s: number, a: number, b: number) => lisse((s - a) / (b - a));
export const presenceTableau = (type: TableauNom, temps: number) => transition(temps, 0, .65) * (1 - transition(temps, TABLEAUX[type].duree - .8, TABLEAUX[type].duree));

/** Cadres réservés aux dessins : aucune extension générale sur les textes ou les photos. */
export function cadreTableau(page: string, nom: string, zone: [number, number, number, number]): [number, number, number, number] {
  if (page === 'julie-droite' && ['citron', 'citron-2'].includes(nom)) return [.2, .5, .58, .383];
  if (page === 'titre' && nom === 'gateau-bougies') return [.2, .62, .6, .31];
  if (page === 'gateaux-gauche' && nom === 'tasse-coeur') return [.05, .64, .48, .24];
  if (page.startsWith('gateaux-') && ['gateau', 'cupcake-bougie'].includes(nom)) return [.23, zone[1], .54, zone[3]];
  return zone;
}

/** Coordonnées dans un petit théâtre de 1000 × 650. Les raccords de mouvement ont une vitesse nulle. */
export function etatTableau(nom: TableauNom, s: number, aspects: Record<string, number> = {}, principal = 'gateau-bougies'): EtatTableau {
  const e: EtatTableau = { phase: 'arrivee', acteurs: [], liquide: [0, 0], jet: 0, tasseVisee: 0 };
  if (nom === 'levitation') {
    const monte = transition(s, 0.8, 3), descend = transition(s, 7, 9.2), envol = monte * (1 - descend);
    e.phase = s < 3 ? 'envol' : s < 7 ? 'levitation' : 'retour';
    for (let k = 0; k < 3; k++) {
      const vague = cloche(s, 2.2, 8) * Math.sin(s * 1.9 + k * 1.8);
      e.acteurs.push(acteur('tasse-vide', 250 + k * 250 + 28 * vague, 505 - envol * (200 + (k === 1 ? 65 : 0)) + 13 * vague, 215, envol * (7 * Math.sin(s * 1.3 + k))));
    }
  } else if (nom === 'service-the') {
    const x = trajet(s, [[0, 690], [1.7, 425], [4, 425], [5.5, 765], [8, 765], [10.2, 690], [11, 690]]);
    const y = trajet(s, [[0, 270], [1.7, 235], [4, 235], [5.5, 235], [8, 235], [10.2, 270], [11, 270]]);
    const angle = trajet(s, [[0, 0], [1.7, -28], [3.7, -28], [4.6, 0], [5.5, -28], [7.8, -28], [8.6, 0], [11, 0]]);
    e.phase = s < 1.7 ? 'approche' : s < 4 ? 'verse-premiere-tasse' : s < 5.5 ? 'change-de-tasse' : s < 8 ? 'verse-seconde-tasse' : 'retour';
    e.liquide = [transition(s, 1.9, 3.7), transition(s, 5.7, 7.8)];
    e.tasseVisee = s < 4.7 ? 0 : 1;
    e.jet = e.tasseVisee === 0 ? cloche(s, 1.8, 3.9) : cloche(s, 5.6, 7.95);
    e.acteurs = [acteur('theiere-seule', x, y, 360, angle), acteur('tasse-vide', 265, 500, 225), acteur('tasse-vide', 605, 500, 225)];
  } else if (nom === 'coupe-citron') {
    const coupe = transition(s, 3, 3.5), rejoint = transition(s, 8, 9.2), ouvert = coupe * (1 - rejoint);
    const ecart = trajet(s, [[0, 0], [3.3, 0], [4.8, 140], [7.5, 140], [9.2, 0], [11, 0]]);
    const lameY = trajet(s, [[0, -170], [1.8, 100], [2.5, 100], [3.5, 360], [4.4, 100], [6.2, -170], [11, -170]]);
    const lameX = trajet(s, [[0, 710], [1.8, 555], [4.4, 555], [6.2, 820], [11, 820]]);
    e.phase = s < 2.5 ? 'couteau-arrive' : s < 3.5 ? 'coupe' : s < 8 ? 'deux-moities' : 'reunion-magique';
    e.acteurs = [acteur('citron-entier', 500, 405, 385, 0, 1 - ouvert), acteur('citron-gauche', 500 - ecart, 422, 230, -ouvert * 5, ouvert), acteur('citron-droite', 500 + ecart, 422, 230, ouvert * 5, ouvert), acteur('couteau', lameX, lameY, 340, -24)];
  } else if (nom === 'lapin-carotte') {
    const approche = transition(s, 0.7, 2.8), retraite = transition(s, 8.4, 10.3), proche = approche * (1 - retraite);
    const manger = cloche(s, 3, 8.3), machouille = manger * Math.sin(s * 12);

    const b1 = transition(s, 3.8, 4.1), b2 = transition(s, 5.2, 5.5), b3 = transition(s, 6.6, 6.9);
    const retour = transition(s, 9.8, 10.7);
    const alphas = [1 - b1, b1 - b2, b2 - b3, b3];
    e.phase = s < 2.8 ? 'lapin-arrive' : s < 8.3 ? 'grignote' : 'lapin-repart';
    const carotte = acteur('carotte-0', 370, 335, 210, -60 + machouille * 1.5);
    const attache = pointActeur(carotte, ANCRES_CAROTTE[0].attache, aspects);
    const carottes = alphas.map((alpha, k) => {
      const c = { ...carotte, asset: `carotte-${k}`, alpha: k === 0 ? alpha + retour * (1 - alpha) : alpha * (1 - retour) };
      const p = pointActeur(c, ANCRES_CAROTTE[k].attache, aspects); c.x += attache[0] - p[0]; c.y += attache[1] - p[1]; return c;
    });
    const tip = carottes.reduce<[number, number]>((somme, c, k) => { const p = pointActeur(c, ANCRES_CAROTTE[k].bout, aspects); return [somme[0] + p[0] * alphas[k], somme[1] + p[1] * alphas[k]]; }, [0, 0]);
    const lapin = acteur('lapin', 0, 0, 310, machouille * 1.8);
    const bouche = pointActeur(lapin, BOUCHE_LAPIN, aspects);
    const x = 1160 + (tip[0] - bouche[0] - 1160) * proche;
    const y = 445 + (tip[1] - bouche[1] - 445) * proche;
    e.acteurs.push(...carottes);
    e.acteurs.push({ ...lapin, x, y });
  } else {
    const envol = transition(s, .7, 2.7) * (1 - transition(s, 7.6, 9.3));
    const vol = cloche(s, 1.5, 8.8), phase = s * 1.25;
    const patisserie = acteur(`aquarelles/${principal}`, 500 + 35 * vol * Math.sin(phase), 440 - 190 * envol + 18 * vol * Math.sin(phase * .8), 375, 5 * vol * Math.sin(phase));
    e.phase = s < 2.7 ? 'gateaux-decollent' : s < 7.6 ? 'ronde-des-gateaux' : 'gateaux-se-posent';
    e.acteurs = [patisserie];
    for (let k = 0; k < 2; k++) {
      const signe = k ? 1 : -1;
      e.acteurs.push(acteur('aquarelles/cupcake', 500 + signe * (285 + 45 * vol * Math.sin(phase)), 485 - 140 * envol + signe * 65 * vol * Math.cos(phase), 150, signe * 10 * vol * Math.sin(phase + 1), transition(s, .5, 1.3) * (1 - transition(s, 8.8, 9.5))));
    }
    const reperes: [number, number][] = principal === 'gateau-bougies' ? [[.2676, .2228], [.3525, .185], [.4926, .1472], [.6328, .1904], [.7287, .2228]] : principal === 'cupcake-bougie' ? [[.4624, .0946]] : [];
    e.flammes = reperes.map((p, k) => { const [x, y] = pointActeur(patisserie, p, aspects); return { x, y, rayon: principal === 'gateau-bougies' ? 7 : 10, angle: patisserie.angle + 8 * Math.sin(s * 4 + k), force: .86 + .14 * Math.sin(s * 8 + k) }; });
  }
  return e;
}

type SceneDOM = { d: Omit<DessinPage, 'peindre'>; type: TableauNom; bouton: HTMLButtonElement; svg: SVGSVGElement; acteurs: SVGImageElement[]; liquides: SVGEllipseElement[]; fronts: SVGImageElement[]; jet: SVGPathElement; flammes: SVGPathElement[]; pret: boolean; etat?: EtatTableau };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(nom: K): SVGElementTagNameMap[K] => document.createElementNS(NS, nom);
const attributs = (el: Element, a: Record<string, string | number>) => { for (const [k, v] of Object.entries(a)) el.setAttribute(k, String(v)); };
const logique = (a: string) => a.startsWith('aquarelles/') ? a : `aquarelles/scenes/${a}`;

export class Theatre {
  private scenes = new Map<string, SceneDOM>();
  private aspects: Record<string, number> = {};
  constructor(private couche: HTMLElement, dessins: Omit<DessinPage, 'peindre'>[], private url: (nom: string) => string | undefined, declencher: (nom: string, type: TableauNom) => void, _aspect: number, page = '') {
    for (const d of dessins) {
      const type = tableauDe(d.nom); if (!type || d.zone[2] < .24 || d.zone[3] < .15) continue;
      const def = TABLEAUX[type];
      for (const a of def.assets) { const info = assetInfo(logique(a)); if (info) this.aspects[a] = info.w / info.h; }
      if (!def.assets.every((a) => url(logique(a)))) continue;
      const bouton = document.createElement('button'); bouton.type = 'button'; bouton.className = 'gc-tableau-bouton'; bouton.disabled = true;
      bouton.setAttribute('data-gc-tableau-cible', d.nom);
      bouton.setAttribute('aria-label', def.libelle); bouton.title = def.libelle;
      Object.assign(bouton.style, { left: `${d.zone[0] * 100}%`, top: `${d.zone[1] * 100}%`, width: `${d.zone[2] * 100}%`, height: `${d.zone[3] * 100}%` });
      bouton.addEventListener('pointerdown', (e) => e.stopPropagation()); bouton.addEventListener('click', (e) => { e.stopPropagation(); declencher(d.nom, type); });
      const svg = svgEl('svg'); svg.classList.add('gc-tableau'); svg.setAttribute('aria-hidden', 'true'); attributs(svg, { viewBox: '0 0 1000 650', preserveAspectRatio: 'xMidYMid meet' });
      const [x, y, largeur, hauteur] = cadreTableau(page, d.nom, d.zone);
      Object.assign(svg.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${largeur * 100}%`, height: `${hauteur * 100}%`, opacity: '0' });
      const acteurs: SVGImageElement[] = [];
      for (let k = 0; k < 5; k++) { const im = svgEl('image'); im.setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg.append(im); acteurs.push(im); }
      const liquides = [svgEl('ellipse'), svgEl('ellipse')], fronts = [svgEl('image'), svgEl('image')];
      const defs = svgEl('defs'); svg.append(defs);
      for (let k = 0; k < 2; k++) {
        liquides[k].setAttribute('fill', '#b98245'); liquides[k].setAttribute('opacity', '0'); svg.append(liquides[k]);
        const clip = svgEl('clipPath'), rect = svgEl('rect'), id = `gc-the-rim-${d.nom}-${Math.random().toString(36).slice(2)}`;
        attributs(rect, { x: -10000, y: 0, width: 20000, height: 10000 }); clip.setAttribute('clipPathUnits', 'userSpaceOnUse'); clip.append(rect); clip.id = id; defs.append(clip);
        fronts[k].setAttribute('clip-path', `url(#${id})`); fronts[k].setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg.append(fronts[k]);
      }
      const jet = svgEl('path'); attributs(jet, { fill: 'none', stroke: '#b78348', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0 }); svg.append(jet);
      const flammes = Array.from({ length: 5 }, () => {
        const f = svgEl('path'); attributs(f, { d: 'M0,1 C-1.1,.2 -.7,-.9 0,-1.8 C.2,-.6 1.1,-.1 0,1Z', fill: '#d58c42', opacity: 0 }); svg.append(f); return f;
      });
      this.couche.append(svg, bouton);
      const scene: SceneDOM = { d, type, bouton, svg, acteurs, liquides, fronts, jet, flammes, pret: false }; this.scenes.set(d.nom, scene);
      Promise.all(def.assets.map(async (a) => { const im = new Image(); im.src = url(logique(a))!; await im.decode(); })).then(() => { scene.pret = true; bouton.disabled = false; }).catch(() => { bouton.remove(); svg.remove(); this.scenes.delete(d.nom); });
    }
  }

  disponible(nom: string, type: TableauNom) { const s = this.scenes.get(nom); return !!s?.pret && s.type === type; }
  cacher(nom: string) { const s = this.scenes.get(nom); if (s) { s.svg.style.opacity = '0'; s.svg.removeAttribute('data-gc-tableau'); s.etat = undefined; } }
  etat(nom: string) { const s = this.scenes.get(nom); return s?.etat ? { nom: s.type, ...s.etat } : null; }
  private poserImage(im: SVGImageElement, a: Acteur) {
    const u = this.url(logique(a.asset))!, info = assetInfo(logique(a.asset)), h = a.w / (info ? info.w / info.h : 1);
    attributs(im, { href: u, x: -a.w / 2, y: -h / 2, width: a.w, height: h, transform: `translate(${a.x} ${a.y}) rotate(${a.angle})`, opacity: a.alpha });
    return h;
  }

  rendre(nom: string, type: TableauNom, temps: number): number {
    const s = this.scenes.get(nom); if (!s?.pret || s.type !== type) return 0;
    const e = etatTableau(type, temps, this.aspects, s.d.nom), alpha = presenceTableau(type, temps);
    s.etat = e; s.svg.style.opacity = String(alpha); s.svg.setAttribute('data-gc-tableau', type); s.svg.setAttribute('data-gc-phase', e.phase);
    s.acteurs.forEach((im, k) => { const a = e.acteurs[k]; if (a) this.poserImage(im, a); else im.setAttribute('opacity', '0'); });
    s.liquides.forEach((el) => el.setAttribute('opacity', '0')); s.fronts.forEach((el) => el.setAttribute('opacity', '0'));
    s.jet.setAttribute('opacity', '0');
    s.flammes.forEach((f, k) => {
      const a = e.flammes?.[k];
      if (a) attributs(f, { transform: `translate(${a.x} ${a.y}) rotate(${a.angle}) scale(${a.rayon})`, opacity: a.force });
      else f.setAttribute('opacity', '0');
    });
    if (type === 'service-the') {
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
    return alpha;
  }
  detruire() { this.scenes.clear(); this.couche.replaceChildren(); }
}
