// Le soulignement reste l'encre cuite de la page : seul son masque suit à nouveau la plume.
// Aucun deuxième dessin, aplat de papier ou rAF supplémentaire.
export interface TraitRedessin { pts: number[][]; diam: number }
export interface RedessinCarte { bloc: string; traits: TraitRedessin[] }
export interface PageRedessin { id: string; el: HTMLElement; ecrite: boolean }

const NS = 'http://www.w3.org/2000/svg';
const EFFACE = .85, PAUSE = .2, TRACE = 3.1;
// Plus de redessin autonome au repos (perf iPad : il repeignait l'encre ≈ 37 fois par seconde) ; `relancer` le déclenche à la demande.
const PREMIER_REDESSIN = Infinity, REPOS_REDESSIN = Infinity;
export const DUREE_REDESSIN = EFFACE + PAUSE + TRACE;
const borne = (n: number) => Math.max(0, Math.min(1, n));

/** Intervalle caché du trait : l'encre s'efface dans le sens de la plume, puis revient dans ce sens. */
export function cycleRedessin(temps: number, reduit = false): { phase: string; debut: number; fin: number } {
  if (reduit || temps < 0 || temps >= DUREE_REDESSIN) return { phase: 'repos', debut: 0, fin: 0 };
  if (temps < EFFACE) return { phase: 'efface', debut: 0, fin: borne(temps / EFFACE) };
  if (temps < EFFACE + PAUSE) return { phase: 'pause', debut: 0, fin: 1 };
  return { phase: 'trace', debut: borne((temps - EFFACE - PAUSE) / TRACE), fin: 1 };
}

export const longueurTrait = (t: TraitRedessin) => t.pts.slice(1).reduce((l, p, i) => l + Math.hypot(p[0] - t.pts[i][0], p[1] - t.pts[i][1]), 0);

/** Découpe un intervalle global sur un trait d'un ensemble (double soulignement, plusieurs mots). */
export function portionTrait(debut: number, fin: number, avant: number, longueur: number, total: number): [number, number] {
  if (!(longueur > 0 && total > 0)) return [0, 0];
  return [borne((debut * total - avant) / longueur), borne((fin * total - avant) / longueur)];
}

type Masque = { svg: SVGSVGElement; image: HTMLImageElement; chemins: SVGPathElement[]; origine: string; origineWebkit: string };
type Etat = { idx: number; attente: number; temps: number | null; masque?: Masque; page: PageRedessin; phase: string };
let numero = 0;

export class Redessins {
  private etats = new Map<string, Etat>();
  constructor(private pages: Record<string, { redessins?: RedessinCarte[] }>, private largeur: number, private hauteur: number) {}

  private retirer(e: Etat) {
    const m = e.masque; if (!m) return;
    m.image.style.maskImage = m.origine;
    m.image.style.webkitMaskImage = m.origineWebkit;
    m.svg.remove(); delete e.masque;
  }

  private creer(e: Etat, redessin: RedessinCarte): Masque | undefined {
    const image = e.page.el.querySelector<HTMLImageElement>(':scope > .gc-page-cuite__encre');
    if (!image) return;
    const svg = document.createElementNS(NS, 'svg'), defs = document.createElementNS(NS, 'defs');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('data-gc-redessin', redessin.bloc);
    Object.assign(svg.style, { position: 'absolute', width: '0', height: '0', pointerEvents: 'none' });
    const mask = document.createElementNS(NS, 'mask'), blanc = document.createElementNS(NS, 'rect');
    mask.id = `gc-redessin-${++numero}`; mask.setAttribute('maskUnits', 'objectBoundingBox'); mask.setAttribute('maskContentUnits', 'objectBoundingBox');
    mask.setAttribute('x', '0'); mask.setAttribute('y', '0'); mask.setAttribute('width', '1'); mask.setAttribute('height', '1');
    mask.setAttribute('mask-type', 'luminance');
    blanc.setAttribute('width', '1'); blanc.setAttribute('height', '1'); blanc.setAttribute('fill', 'white'); mask.append(blanc);
    const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', `scale(${1 / this.largeur} ${1 / this.hauteur})`); mask.append(g);
    const chemins = redessin.traits.map((t) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', t.pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' '));
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'black'); p.setAttribute('stroke-width', String(t.diam * 2.2 + 4));
      p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('pathLength', '1');
      p.setAttribute('display', 'none'); g.append(p); return p;
    });
    defs.append(mask); svg.append(defs); e.page.el.append(svg);
    const m = { svg, image, chemins, origine: image.style.maskImage, origineWebkit: image.style.webkitMaskImage };
    image.style.maskImage = `url("#${mask.id}")`; image.style.webkitMaskImage = `url("#${mask.id}")`;
    return m;
  }

  /** Appelé exclusivement par l'horloge de Magie. Les pages absentes, gestes et loupe ne consomment pas le cycle. */
  avancer(dt: number, vues: PageRedessin[], options: { repos: boolean; reduit: boolean }) {
    const presentes = new Set(vues.map((p) => p.id));
    for (const [id, e] of this.etats) if (!presentes.has(id)) this.retirer(e);
    for (const page of vues) {
      const dessins = this.pages[page.id]?.redessins;
      if (!dessins?.length) continue;
      let e = this.etats.get(page.id);
      if (!e) { e = { idx: 0, attente: PREMIER_REDESSIN, temps: null, page, phase: 'repos' }; this.etats.set(page.id, e); }
      if (e.page.el !== page.el) this.retirer(e);
      e.page = page;
      if (!options.repos || options.reduit || !page.ecrite || page.el.dataset.gcEncre4x === 'oui') {
        this.retirer(e);
        if (options.reduit) { e.temps = null; e.attente = PREMIER_REDESSIN; e.phase = 'repos'; }
        continue;
      }
      if (e.temps == null) {
        e.attente -= Math.max(0, dt);
        if (e.attente > 0) continue;
        e.temps = 0;
      } else e.temps += Math.max(0, dt);
      if (e.temps >= DUREE_REDESSIN) {
        this.retirer(e); e.temps = null; e.phase = 'repos'; e.attente = REPOS_REDESSIN; e.idx = (e.idx + 1) % dessins.length; continue;
      }
      const dessin = dessins[e.idx];
      if (!e.masque) e.masque = this.creer(e, dessin);
      if (!e.masque) continue;
      const cycle = cycleRedessin(e.temps); e.phase = cycle.phase;
      const longueurs = dessin.traits.map(longueurTrait), total = longueurs.reduce((a, b) => a + b, 0);
      let avant = 0;
      e.masque.chemins.forEach((p, i) => {
        const [a, b] = portionTrait(cycle.debut, cycle.fin, avant, longueurs[i], total); avant += longueurs[i];
        p.setAttribute('display', b > a ? 'inline' : 'none');
        p.setAttribute('stroke-dasharray', `${b - a} 2`); p.setAttribute('stroke-dashoffset', String(-a));
      });
    }
  }

  actif() { return [...this.etats.values()].some((e) => !!e.masque); }
  suspendre() { this.etats.forEach((e) => this.retirer(e)); }
  detruire() { this.suspendre(); this.etats.clear(); }
  etat() { return [...this.etats.values()].map((e) => ({ page: e.page.id, bloc: this.pages[e.page.id]?.redessins?.[e.idx]?.bloc, temps: e.temps, phase: e.phase, masque: !!e.masque })); }
  relancer(vues: PageRedessin[]) {
    this.avancer(0, vues, { repos: true, reduit: false });
    for (const v of vues) { const e = this.etats.get(v.id); if (e) { this.retirer(e); e.temps = 0; e.attente = 0; } }
  }
}
