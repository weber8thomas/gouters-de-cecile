// Une page du carnet cuite au build (scripts/bake-pages.mjs) : le vrai papier ancien scanné et
// l'encre déjà « bue » par ce papier (écriture trait par trait, croquis à l'aquarelle), en deux images
// alignées au pixel. Rien n'est calculé à l'exécution (aucun filtre, aucun mélange) : on pose deux
// <img>, le texte réel de la page pour l'accessibilité, et les objets vivants dans les zones que la
// page leur a réservées (photo collée, coin du feuillet volant).
//
// Sous la loupe (plan v4) : à partir de 1,5×, la page visible pose par-dessus son encre ×2 les tuiles
// d'encre ×4 (manifeste `encre4x`, 2 × 2 tuiles), seulement celles qui sont à l'écran
// (IntersectionObserver), décodées puis montrées en fondu ; retirées sous 1,25×. Rien ne se rend
// pendant un geste (loupe ou livre) : les rappels attendent sa fin.
import React from 'react';
import { assetInfo, assetUrl } from '../../lib/assets';
import { useRenderMode } from '../../lib/spread';
import { LOUPE_EVENT, LOUPE_HD, LOUPE_HD_SORTIE, abonnerLoupe, getLoupe, loupeOccupee } from '../../lib/loupe';
import { GESTE_EVENT, type GesteDetail } from '../Livre/evenements';
import manifesteJson from '../../content/pages/manifeste.json';
import { aEcrire, abonnerEcriture, ecrire, marquerEcrite, plumeOccupee, versionEcriture } from './encreVivante';
import './PageCuite.css';

/** Rectangle en fractions de la page : [x, y, largeur, hauteur]. */
export type RectPage = [number, number, number, number];

/** Zones vivantes d'une page : aucune encre dessous. */
export interface ZonesVivantes {
  /** Tirage collé de la vidéo de l'invité (PhotoCollee) : la boîte du tirage de travers, coins compris. */
  photo?: RectPage;
  /** Coin du feuillet volant qui dépasse de la page droite (FeuilletVolant). */
  volant?: RectPage;
  [nom: string]: RectPage | undefined;
}

/** Feuillet volant glissé dans le carnet, porté par la page droite d'une recette longue. */
export interface VolantInfo {
  /** Pages cuites du feuillet (type « feuillet ») : recto puis verso. */
  recto: string;
  verso: string;
  /** Inclinaison du feuillet posé (degrés, négatif = sens inverse des aiguilles). */
  angle: number;
  /** Où serait le feuillet entier, coin haut-gauche avant rotation, en fractions de la page qui le
   *  porte : [x, y, largeur, hauteur]. La partie dans `vivants.volant` est le coin visible. */
  rect: RectPage;
}

/** Croquis cuit dans la page (puce, icône, petit dessin de marge). */
export interface CroquisPage {
  nom: string;
  role: 'puce' | 'icone' | 'dessin';
  /** false : place réservée, le croquis n'était pas prêt à la cuisson. */
  dessine: boolean;
  /** [x, y, largeur, hauteur] en fractions de la page. */
  boite: RectPage;
}

/** Entrée du manifeste des pages cuites (src/content/pages/manifeste.json, écrit par la cuisson). */
export interface PageCuiteInfo {
  double: string;
  cote: 'gauche' | 'droite';
  /** Folio imprimé (pages du carnet) ; absent sur un feuillet volant. */
  folio?: number | null;
  /** « feuillet » : page d'un feuillet volant (feuille de cahier), à sa propre `taille`. */
  type?: 'feuillet';
  /** Taille d'une page de feuillet, en px de la page de référence (`largeur` × `hauteur` du manifeste). */
  taille?: [number, number];
  /** Face d'un feuillet volant, et la page au dos (vue par transparence). */
  face?: 'recto' | 'verso';
  dos?: string;
  /** Nom logique du papier (« pages/papier/f13 », « pages/papier/c-lisa-recto »). */
  papier: string;
  /** Verso d'un feuillet du carnet : le papier est affiché retourné (miroir horizontal). */
  miroir: boolean;
  /** Nom logique du calque d'encre (« pages/julie-droite »), cuit à 2×. */
  encre: string;
  /** Variantes 1× (écrans de densité 1 : TV 1080p, ordinateur), même composition réduite. */
  papier1x?: string;
  encre1x?: string;
  /** Texte réel de la page, dans l'ordre de lecture (une ligne par bloc). */
  texte: string;
  /** Zones réservées aux éléments vivants (aucune encre dessous). */
  vivants: ZonesVivantes;
  /** Page droite d'une recette longue : le feuillet volant glissé dans le carnet. */
  volant?: VolantInfo;
  /** Lignes cliquables (sommaire) : double page visée, invité, zone en fractions de page. */
  liens?: { cible: string; rect: RectPage; invite?: string }[];
  /** Page où le texte continue (« suite sur la feuille » → recto, recto → verso). */
  suite?: string;
  /** Recette reçue d'où vient la page (src/content/recettes/<slug>.json). */
  recette?: string;
  croquis?: CroquisPage[];
  /** Aquarelles posées par l'application dans une zone vivante (même nom) : fichier de
   *  design-system/baked/aquarelles, animation (« fleurit » à l'arrivée, « vapeur »…), inclinaison. */
  aquarelles?: Record<string, { aquarelle: string; anime?: string; angle?: number }>;
  /** Ce qui n'a pas tenu sur la page à la cuisson (toujours vide : sinon la cuisson échoue). */
  deborde: string[];
  lignes: number;
  /** Mots mal relus restants (relecture de l'écriture générée). */
  douteux?: string[];
  /**
   * Encre ×4 (cuisson P2, site seulement) : tuiles 2 × 2 `pages/4x/<id>-<r><c>`, 4 px de
   * recouvrement ; [r, c, x, y, largeur, hauteur], le rectangle en fractions de la page.
   */
  encre4x?: { tuiles: [number, number, number, number, number, number][] };
}

export interface PageCuiteManifeste {
  version: number;
  largeur: number;
  hauteur: number;
  echelle: number;
  pages: Record<string, PageCuiteInfo>;
}

export const PAGES_CUITES = manifesteJson as unknown as PageCuiteManifeste;

/** Entrée du manifeste d'une page cuite (undefined si inconnue). */
export function pageCuite(page: string): PageCuiteInfo | undefined {
  return PAGES_CUITES.pages[page];
}

/** Taille d'une page en px de la page de référence : [850, 960], ou la `taille` d'un feuillet. */
export function taillePage(page: string): [number, number] {
  const info = PAGES_CUITES.pages[page];
  return info?.taille ?? [PAGES_CUITES.largeur, PAGES_CUITES.hauteur];
}

// ---- Encre ×4 sous la loupe -------------------------------------------------------------------------

/** Une tuile d'encre ×4 prête à poser : rang et colonne (« 01 »), rectangle (fractions), URL. */
export interface TuileEncre4x {
  rc: string;
  rect: RectPage;
  src: string;
}

/** D'où viennent les tuiles d'une page (null : pas d'encre ×4, rien ne change). */
export type SourceEncre4x = (page: string, info: PageCuiteInfo) => TuileEncre4x[] | null;

/** Le manifeste (`encre4x`) et les images cuites `pages/4x/<id>-<rc>` ; toutes ou aucune. */
const sourceManifeste: SourceEncre4x = (page, info) => {
  const t = info.encre4x?.tuiles;
  if (!t?.length) return null;
  const out: TuileEncre4x[] = [];
  for (const [r, c, x, y, w, h] of t) {
    const nom = `pages/4x/${page}-${r}${c}`;
    if (!assetInfo(nom)) return null; // artifact du design system : pas de tuiles ×4
    out.push({ rc: `${r}${c}`, rect: [x, y, w, h], src: assetUrl(nom) });
  }
  return out;
};
let sourceEncre4x: SourceEncre4x = sourceManifeste;

/** Remplace la source des tuiles ×4 (essais : tuiles fabriquées hors des images cuites) ; null : le manifeste. */
export function definirSourceEncre4x(f: SourceEncre4x | null): void {
  sourceEncre4x = f ?? sourceManifeste;
}

/** Tuiles d'encre ×4 d'une page, ou null. */
export function tuilesEncre4x(page: string): TuileEncre4x[] | null {
  const info = PAGES_CUITES.pages[page];
  return info ? sourceEncre4x(page, info) : null;
}

// Rien ne se rend pendant un geste : un rappel (tuile visible, image décodée, fondu fini) attend la
// fin de la loupe et des gestes du livre (au plus 3 s, au cas où une fin se perdrait).
const gestesLivre = new Map<string, number>();
const enAttente = new Set<() => void>();
let ecoute = false;
const livreOccupe = () => {
  const t = typeof performance !== 'undefined' ? performance.now() : 0;
  for (const [k, t0] of gestesLivre) if (t - t0 > 3000) gestesLivre.delete(k);
  return gestesLivre.size > 0;
};
const occupe = () => loupeOccupee() || livreOccupe();
function vider() {
  if (occupe()) return;
  const fs = [...enAttente];
  enAttente.clear();
  fs.forEach((f) => f());
}
function ecouter() {
  if (ecoute || typeof window === 'undefined') return;
  ecoute = true;
  window.addEventListener(LOUPE_EVENT, () => setTimeout(vider, 0));
  document.addEventListener(GESTE_EVENT, (e) => {
    const d = (e as CustomEvent<GesteDetail>).detail;
    if (!d || d.type === 'loupe' || d.phase === 'prepa') return;
    if (d.phase === 'debut') gestesLivre.set(d.type, performance.now());
    else {
      gestesLivre.delete(d.type);
      setTimeout(vider, 0);
    }
  });
}
if (typeof window !== 'undefined') ecouter();
function quandLibre(f: () => void): void {
  if (!occupe()) {
    f();
    return;
  }
  enAttente.add(f);
  setTimeout(vider, 3100);
}

const lireZ = () => getLoupe().z;
const lireCote = () => getLoupe().cote;
const unZ = () => 1;
const aucunCote = () => null;

/** Polygone (clip-path) de l'union de rectangles en fractions : chaque rectangle relié au coin 0 0 par
 *  un aller-retour sans surface (règle nonzero). */
function polygoneUnion(rects: RectPage[]): string {
  const p = (x: number, y: number) => `${pc(x)} ${pc(y)}`;
  const pts = ['0% 0%'];
  for (const [x, y, w, h] of rects) pts.push(p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h), p(x, y), '0% 0%');
  return `polygon(${pts.join(', ')})`;
}

/** Cellules d'une grille 2 × 2 de tuiles qui se recouvrent : coupées au milieu des recouvrements. */
function cellules(tuiles: TuileEncre4x[]): Map<string, RectPage> {
  const cs = new Map<string, RectPage>();
  const cote = (a: 'r' | 'c', v: 0 | 1) => tuiles.filter((t) => t.rc[a === 'r' ? 0 : 1] === String(v));
  const coupe = (a: 'r' | 'c') => {
    const i = a === 'r' ? 1 : 0;
    const avant = cote(a, 0).map((t) => t.rect[i] + t.rect[i + 2]);
    const apres = cote(a, 1).map((t) => t.rect[i]);
    return avant.length && apres.length ? (Math.min(...avant) + Math.max(...apres)) / 2 : null;
  };
  const sx = coupe('c');
  const sy = coupe('r');
  for (const t of tuiles) {
    const [x, y, w, h] = t.rect;
    const r = t.rc[0] === '1';
    const c = t.rc[1] === '1';
    const x0 = sx == null ? x : c ? sx : Math.min(x, 0);
    const x1 = sx == null ? x + w : c ? Math.max(x + w, 1) : sx;
    const y0 = sy == null ? y : r ? sy : Math.min(y, 0);
    const y1 = sy == null ? y + h : r ? Math.max(y + h, 1) : sy;
    cs.set(t.rc, [x0, y0, x1 - x0, y1 - y0]);
  }
  return cs;
}

type EtatTuile = 'demandee' | 'prete' | 'couverte';

/** Les tuiles ×4 d'une page : une boîte par tuile, l'image demandée quand la boîte entre à l'écran. */
function Encre4x({ tuiles, racine, onCouvertes }: { tuiles: TuileEncre4x[]; racine: Element | null; onCouvertes: (rcs: string[]) => void }) {
  const [etats, setEtats] = React.useState<Record<string, EtatTuile>>({});
  const boites = React.useRef(new Map<string, HTMLDivElement>());
  const vivant = React.useRef(true);
  React.useEffect(() => () => { vivant.current = false; }, []);
  const maj = React.useCallback((rc: string, e: EtatTuile) => {
    quandLibre(() => {
      if (!vivant.current) return;
      setEtats((x) => (x[rc] === e || (e === 'demandee' && x[rc]) ? x : { ...x, [rc]: e }));
    });
  }, []);

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    // Racine : l'écran (.gc-ecran), pas la fenêtre. Son overflow: hidden rognerait les tuiles à la
    // fenêtre avant la marge de 25 % ; posée sur lui, la marge s'applique (tuiles juste hors de vue
    // demandées d'avance).
    const io = new IntersectionObserver((entrees) => {
      for (const en of entrees) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        const rc = (en.target as HTMLElement).dataset.gcTuile;
        if (rc) maj(rc, 'demandee');
      }
    }, { root: racine, rootMargin: '25%' });
    boites.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [tuiles, racine, maj]);

  const couvertes = tuiles.filter((t) => etats[t.rc] === 'couverte').map((t) => t.rc).join(',');
  React.useEffect(() => { onCouvertes(couvertes ? couvertes.split(',') : []); }, [couvertes, onCouvertes]);

  return (
    <>
      {tuiles.map((t) => {
        const etat = etats[t.rc];
        return (
          <div
            key={t.rc}
            ref={(el) => { if (el) boites.current.set(t.rc, el); else boites.current.delete(t.rc); }}
            className="gc-page-cuite__tuile"
            data-gc-tuile={t.rc}
            data-gc-tuile-etat={etat ?? 'attente'}
            style={{ left: pc(t.rect[0]), top: pc(t.rect[1]), width: pc(t.rect[2]), height: pc(t.rect[3]) }}
          >
            {etat && (
              <img
                src={t.src}
                alt=""
                draggable={false}
                decoding="async"
                ref={(img) => {
                  if (!img || img.dataset.gcDecode) return;
                  img.dataset.gcDecode = '1';
                  // Fondu fini (transitionend), ou sans fondu (mouvement réduit) : la tuile couvre l'encre ×2.
                  const pret = () => {
                    maj(t.rc, 'prete');
                    setTimeout(() => maj(t.rc, 'couverte'), 900);
                  };
                  (img.decode ? img.decode() : Promise.resolve()).then(pret, () => undefined);
                }}
                onTransitionEnd={() => maj(t.rc, 'couverte')}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/** Encre ×4 voulue pour cette page : loupe ≥ 1,5× (gardée jusqu'à 1,25×), page vivante, côté de la loupe. */
function useEncre4xVoulue(cote: 'gauche' | 'droite'): boolean {
  const z = React.useSyncExternalStore(abonnerLoupe, lireZ, unZ);
  const coteLoupe = React.useSyncExternalStore(abonnerLoupe, lireCote, aucunCote);
  const hd = React.useRef(false);
  if (z >= LOUPE_HD) hd.current = true;
  else if (z < LOUPE_HD_SORTIE) hd.current = false;
  return hd.current && (coteLoupe == null || coteLoupe === cote);
}

export interface PageCuiteProps {
  /** Identifiant de la page cuite (« julie-droite », « lisa-feuillet-recto »), clé du manifeste. */
  page: string;
  /** Éléments vivants, posés dans les zones réservées par la page : `photo` (PhotoCollee),
   *  `volant` (FeuilletVolant). Une zone sans élément reste du papier. */
  slots?: Partial<Record<keyof ZonesVivantes, React.ReactNode>>;
  /**
   * `parent` (défaut) : remplit son parent positionné (faces du Livre, DoublePage).
   * `propre` : bloc dans le flux, largeur du parent, hauteur selon la proportion propre de la page
   * (feuillet volant soulevé, aperçus).
   */
  cadre?: 'parent' | 'propre';
  className?: string;
}

const pc = (v: number) => `${+(v * 100).toFixed(4)}%`;

/**
 * Les deux images sont décodées avec la peinture (`decoding="sync"`) : une page n'apparaît jamais sans
 * son encre. Le Livre les pré-décode (`decode()`) avant un tourne-page ; elles sont partagées
 * (même URL) par les copies du feuillet.
 */
export function PageCuite({ page, slots, cadre = 'parent', className }: PageCuiteProps) {
  const info = PAGES_CUITES.pages[page];
  const mode = useRenderMode();
  const voulue = useEncre4xVoulue(info?.cote ?? 'gauche');
  const racine = React.useRef<HTMLDivElement>(null);
  const [couvertes, setCouvertes] = React.useState<string[]>([]);
  const [, relire] = React.useReducer((n: number) => n + 1, 0);
  // Tuiles ×4 seulement pour une page vivante posée dans le calque de la loupe (pas le feuillet soulevé).
  const dansLoupe = !!racine.current?.closest('.gc-ecran__loupe');
  const tuiles = info && voulue && mode === 'live' ? tuilesEncre4x(page) : null;
  const hd = !!tuiles && dansLoupe;
  // Montée déjà zoomée (saut direct) : la page n'était pas encore dans le DOM au premier rendu.
  React.useEffect(() => {
    if (tuiles && !dansLoupe && racine.current?.closest('.gc-ecran__loupe')) relire();
  });
  React.useEffect(() => { if (!hd) setCouvertes([]); }, [hd]);
  const garderCouvertes = React.useCallback((rcs: string[]) => setCouvertes((x) => (x.join() === rcs.join() ? x : rcs)), []);
  // L'encre qui s'écrit (encreVivante.ts) : tant que la page n'est pas écrite, son encre reste cachée.
  React.useSyncExternalStore(abonnerEcriture, versionEcriture, versionEcriture);
  const [horsLivre, setHorsLivre] = React.useState(false);
  const plume = React.useRef<HTMLCanvasElement>(null);
  // Toutes les copies de la page dans le livre (statique pendant un tour, feuillet, loupe) cachent l'encre ;
  // seule la page vivante posée l'écrit.
  const aEcrireIci = !!info && cadre === 'parent' && !horsLivre && aEcrire(page);
  React.useEffect(() => {
    if (!aEcrireIci) return;
    const el = racine.current;
    if (!document.querySelector('.gc-livre')) { setHorsLivre(true); return; }
    // Seule la page posée dans le livre écrit (pas le feuillet qui tourne, ni la loupe) : les autres copies
    // attendent, encre cachée, qu'elle ait fini.
    const feuille = el?.closest('.gc-livre__page');
    const livre = el?.closest('.gc-livre');
    if (!el || !feuille || !livre || !info || mode !== 'live') return;
    // à vitesse de plume (environ 22 signes par seconde), de 4 à 14 s
    const duree = Math.min(14000, Math.max(4000, 900 + info.texte.length * 45));
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    const encre = dpr > 1.25 || !info.encre1x ? info.encre : info.encre1x;
    let arreter: (() => void) | null = null;
    let minuteur = 0;
    const verifier = () => {
      const visible = feuille.classList.contains('gc-livre__page--visible');
      const pose = !livre.hasAttribute('data-gc-geste') && livre.getAttribute('data-gc-etat') === 'ouvert';
      if (!visible) {
        window.clearTimeout(minuteur);
        minuteur = 0;
        if (arreter) arreter(); // quittée en cours d'écriture : elle est écrite
        return;
      }
      if (pose && !arreter && !minuteur) {
        const lancer = () => {
          minuteur = 0;
          // une plume à la fois : la page de droite attend que la gauche ait fini
          if (plumeOccupee()) {
            minuteur = window.setTimeout(lancer, 250);
            return;
          }
          if (plume.current) arreter = ecrire(plume.current, page, encre, duree, () => marquerEcrite(page));
        };
        minuteur = window.setTimeout(lancer, info.cote === 'droite' ? 400 : 280);
      } else if (!pose && minuteur) {
        window.clearTimeout(minuteur);
        minuteur = 0;
      }
    };
    // un clic dans le livre finit d'écrire (la page en cours comme celle qui attend)
    const finir = () => {
      if (!feuille.classList.contains('gc-livre__page--visible')) return;
      window.clearTimeout(minuteur);
      minuteur = 0;
      if (arreter) arreter();
      else marquerEcrite(page);
    };
    livre.addEventListener('pointerdown', finir);
    const obs = new MutationObserver(verifier);
    obs.observe(feuille, { attributes: true, attributeFilter: ['class'] });
    obs.observe(livre, { attributes: true, attributeFilter: ['data-gc-geste', 'data-gc-etat'] });
    verifier();
    return () => {
      obs.disconnect();
      livre.removeEventListener('pointerdown', finir);
      window.clearTimeout(minuteur);
      if (arreter) arreter();
    };
  }, [aEcrireIci, page, info, mode]);
  if (!info) {
    if (typeof console !== 'undefined') console.warn(`Page cuite inconnue : ${page}`);
    return null;
  }
  const [w, h] = taillePage(page);
  const cls = [
    'gc-page-cuite',
    `gc-page-cuite--${info.cote}`,
    info.type === 'feuillet' ? 'gc-page-cuite--feuillet' : null,
    cadre === 'propre' ? 'gc-page-cuite--propre' : null,
    className,
  ].filter(Boolean).join(' ');
  // 1× sur un écran de densité 1, 2× ailleurs (téléphone, tablette, TV 4K) ; taille intrinsèque
  // connue d'avance : le chargement d'une copie ne relance aucune mise en page.
  const source = (nom2: string, nom1?: string) => {
    const a = assetInfo(nom2);
    const taille = a ? { width: Math.round(a.w / PAGES_CUITES.echelle), height: Math.round(a.h / PAGES_CUITES.echelle) } : {};
    if (!nom1 || !assetInfo(nom1)) return { src: assetUrl(nom2), ...taille };
    return { src: assetUrl(nom1), srcSet: `${assetUrl(nom1)} 1x, ${assetUrl(nom2)} 2x`, ...taille };
  };
  const lignes = info.texte.split('\n').filter(Boolean);
  const style = cadre === 'propre' ? ({ aspectRatio: `${w} / ${h}` } as React.CSSProperties) : undefined;
  // Sous les tuiles ×4 posées, l'encre ×2 s'efface (sinon l'encre serait posée deux fois, plus grasse).
  let styleEncre: React.CSSProperties | undefined;
  if (hd && tuiles && couvertes.length) {
    const cs = cellules(tuiles);
    const libres = tuiles.filter((t) => !couvertes.includes(t.rc)).map((t) => cs.get(t.rc)!);
    styleEncre = libres.length ? { clipPath: polygoneUnion(libres) } : { visibility: 'hidden' };
  }
  return (
    <div ref={racine} className={cls} style={style} data-gc-page-cuite={page} data-gc-page-type={info.type ?? 'page'} data-gc-encre4x={hd ? 'oui' : undefined} data-gc-ecrit={aEcrireIci ? 'a-ecrire' : undefined} lang="fr">
      <img
        className={`gc-page-cuite__papier${info.miroir ? ' gc-page-cuite__papier--miroir' : ''}`}
        {...source(info.papier, info.papier1x)}
        alt=""
        draggable={false}
        decoding="sync"
      />
      <img className="gc-page-cuite__encre" {...source(info.encre, info.encre1x)} alt="" draggable={false} decoding="sync" style={styleEncre} />
      {hd && tuiles && <Encre4x tuiles={tuiles} racine={racine.current?.closest('.gc-ecran') ?? null} onCouvertes={garderCouvertes} />}
      {aEcrireIci && <canvas ref={plume} className="gc-page-cuite__plume" aria-hidden="true" />}
      <div className="gc-page-cuite__texte">
        {lignes.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
      {mode === 'live' &&
        info.liens?.map((l) => (
          // Lien profond (#<invité>) : le carnet suit le fragment d'URL (Carnet, useLienProfond).
          <a
            key={`${l.cible}-${l.invite ?? ''}`}
            className="gc-page-cuite__lien"
            href={`#${encodeURIComponent(l.invite ?? l.cible)}`}
            data-gc-controle=""
            aria-label={`Aller à la page de ${l.invite ?? l.cible}`}
            style={{ left: pc(l.rect[0]), top: pc(l.rect[1]), width: pc(l.rect[2]), height: pc(l.rect[3]) }}
          />
        ))}
      {Object.entries(info.vivants).map(([nom, r]) =>
        r && slots?.[nom] ? (
          <div
            key={nom}
            className={`gc-page-cuite__vivant gc-page-cuite__vivant--${nom}`}
            data-gc-vivant={nom}
            style={{ left: pc(r[0]), top: pc(r[1]), width: pc(r[2]), height: pc(r[3]) }}
          >
            {slots[nom]}
          </div>
        ) : null,
      )}
    </div>
  );
}

export default PageCuite;
