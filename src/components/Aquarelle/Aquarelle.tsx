import React from 'react';
import { useReducedMotion } from '../../lib/motion';
import { assetInfo, assetUrl } from '../../lib/assets';
import { useRenderMode } from '../../lib/spread';
import { PAGES_CUITES, taillePage } from '../PageCuite/PageCuite';
import { TOUCHER_EVENT } from '../Livre/evenements';
import type { ToucherPage } from '../Livre/evenements';
import { toile, webglOk, type DessinPage, type Toile } from './vivante';
import { CREATURES } from './effets';
import './Aquarelle.css';
import { TableauFixe } from './TableauFixe';
import { ModeCuisine } from './ModeCuisine';
import { CUISINE_EVENT, tableauDe, type CommandeTableau } from './tableaux';

export interface AquarelleProps {
  /** Nom de l'aquarelle cuite (design-system/baked/aquarelles/<nom>.webp). */
  nom: string;
  /** Sans WebGL seulement (animation CSS) : « fleurit » (défaut) : elle apparaît à l'arrivée sur la page ;
   *  « vapeur » : deux volutes montent en boucle ; « balance » : elle oscille ; « fixe » : rien. */
  anime?: string;
  /** Inclinaison (degrés). */
  angle?: number;
  /** Rang sur la page : les aquarelles se peignent l'une après l'autre. */
  ordre?: number;
  /** Page du livre où elle est posée : elle se peint une fois par page et par visite. */
  page?: string;
}

// ---- État partagé par toutes les copies d'une page (page vivante, feuillet qui tourne, loupe) -------
// Les aquarelles déjà peintes (une fois par page et par visite) : tant qu'elle n'est pas peinte, aucune
// copie ne la montre. Les pages dont la toile vivante est prête (ses images fixes se cachent) ou a échoué.
const peintes = new Set<string>();
const pretes = new Set<string>();
const echouees = new Set<string>();
const abonnes = new Set<() => void>();
let version = 0;
const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};
const lireVersion = () => version;
const changer = () => {
  version++;
  abonnes.forEach((f) => f());
};
function marquer(cle: string) {
  if (peintes.has(cle)) return;
  peintes.add(cle);
  changer();
}
function prete(page: string, oui: boolean) {
  if (oui === pretes.has(page)) return;
  if (oui) pretes.add(page);
  else pretes.delete(page);
  changer();
}

// Les toiles vivantes montées, pour la vérification (scripts de capture) : window.__gcDessins.
const toiles = new Map<string, Toile>();
if (typeof window !== 'undefined') {
  (window as unknown as { __gcDessins: unknown }).__gcDessins = {
    /** État de chaque toile (aquarelles, scènes, créatures). */
    etat: () => [...toiles.values()].map((t) => t.etat()),
    /** Finit les peintures en cours. */
    finir: () => toiles.forEach((t) => t.finir()),
    /** Joue une scène : `nom` d'aquarelle (toutes sinon), `scene` (la suivante sinon). */
    scene: (nom?: string, scene?: string) => toiles.forEach((t) => t.scene(nom, scene)),
    commande: (nom:string,commande:CommandeTableau) => toiles.forEach(t=>t.commande(nom,commande)),
    /** Touche une page (fractions de la page). */
    toucher: (page: string, x: number, y: number) => toiles.get(page)?.toucher(x, y) ?? false,
    /** Fige le temps de toutes les toiles (true), qui n'avance plus que par `avancer(ms)` : images exactes. */
    figer: (oui: boolean) => toiles.forEach((t) => t.figer(oui)),
    avancer: (ms: number) => toiles.forEach((t) => t.avancer(ms)),
  };
}

/** Les aquarelles d'une page du manifeste, dans l'ordre (zones vivantes du même nom). */
function dessinsDe(page: string): Omit<DessinPage, 'peindre'>[] {
  const info = PAGES_CUITES.pages[page];
  if (!info?.aquarelles) return [];
  return Object.entries(info.aquarelles).flatMap(([zone, a], ordre) => {
    const r = info.vivants[zone];
    return r ? [{ nom: a.aquarelle, zone: r, angle: a.angle ?? 0, ordre, fixe: info.double==='sommaire'&&a.anime==='fixe' }] : [];
  });
}

// Une aquarelle posée sur la page, dans une zone vivante réservée à la cuisson (aucune encre dessous) :
// l'image fixe, teintée du papier (elle se pose simplement dessus). Sur la page vivante du livre, la toile
// de la page (ToileAquarelles) la dessine et l'anime : l'image se cache dès que la toile est prête, et
// reste cachée sur toutes les copies tant que l'aquarelle ne s'est pas peinte. Sans WebGL : l'ancienne
// apparition en CSS (opacité et transformation).
export function Aquarelle({ nom, anime = 'fleurit', angle = 0, ordre = 0, page }: AquarelleProps) {
  const reduit = useReducedMotion(); // système ou réglage du carnet
  const mode = useRenderMode();
  React.useSyncExternalStore(abonner, lireVersion, lireVersion);
  const src = assetUrl(`aquarelles/${nom}`);
  const info = page ? PAGES_CUITES.pages[page] : undefined;
  const z = info && Object.entries(info.aquarelles ?? {}).find(([,a]) => a.aquarelle === nom)?.[0];
  const zone = z ? info?.vivants[z] : undefined;
  const tableau = !!tableauDe(nom,page) && !!zone && zone[2] >= .24 && zone[3] >= .15;
  const gl = typeof document !== 'undefined' && webglOk();
  const aPeindre = gl && !reduit && !!page && !echouees.has(page) && !peintes.has(`${page}/${nom}`);
  const parToile = mode === 'live' && !!page && pretes.has(page);
  const style = {
    '--gc-aq-angle': `${tableau ? 0 : angle}deg`,
    '--gc-aq-delai': `${(0.45 + ordre * 0.3).toFixed(2)}s`,
  } as React.CSSProperties;
  const animCss = reduit || gl ? 'fixe' : anime;
  const cls = ['gc-aquarelle', `gc-aquarelle--${animCss}`].join(' ');
  const vue = parToile ? 'toile' : aPeindre ? 'cachee' : undefined;
  return (
    <>
    <div className={cls} style={style} aria-hidden="true" data-gc-aquarelle={nom} data-gc-aq={vue}>
      {tableau && page && zone ? <TableauFixe nom={nom} page={page} zone={zone}/> : <img src={src} alt="" draggable={false} decoding="async" />}
      {animCss === 'vapeur' && (
        <>
          <span className="gc-aquarelle__volute" />
          <span className="gc-aquarelle__volute gc-aquarelle__volute--2" />
        </>
      )}
    </div>
    {mode==='live'&&page&&tableau&&(reduit||!gl||echouees.has(page))&&tableauDe(nom,page)?.startsWith('recette-')&&<button className="gc-recette-demarrer-repli" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();window.dispatchEvent(new CustomEvent(CUISINE_EVENT,{detail:{page,nom,type:tableauDe(nom,page)}}));}}>Démarrer la recette</button>}
    </>
  );
}

/**
 * La toile vivante d'une page : une seule toile WebGL sur toute la page, pour toutes ses aquarelles et les
 * créatures de la double page (vivante.ts). Seulement sur la page vivante du livre (pas sur le feuillet qui
 * tourne ni hors du livre). Elle ne s'anime que page visible et livre posé, onglet affiché. Moins
 * d'animations : les aquarelles originales restent fixes, sans toile ni boucle d'animation.
 * Contexte WebGL perdu : les images fixes reviennent.
 */
export function ToileAquarelles({ page }: { page: string }) {
  const reduit = useReducedMotion();
  const mode = useRenderMode();
  React.useSyncExternalStore(abonner, lireVersion, lireVersion);
  const info = PAGES_CUITES.pages[page];
  const dessins = React.useMemo(() => dessinsDe(page), [page]);
  const creatures = info ? CREATURES[info.double] ?? [] : [];
  const actif =
    mode === 'live' && !reduit && !!info && (dessins.length > 0 || creatures.length > 0) && !echouees.has(page) && typeof document !== 'undefined' && webglOk();
  const ref = React.useRef<HTMLCanvasElement>(null);
  const refTableaux = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const cv = ref.current;
    if (!actif || !cv || !info) return;
    const feuille = cv.closest('.gc-livre__page');
    const livre = cv.closest('.gc-livre');
    const racine = cv.parentElement;
    if (!feuille || !livre || !racine) return; // hors du livre : les images fixes
    // la toile à la taille où la page est vue (livre zoomé, écran dense), sans excès
    const r = cv.getBoundingClientRect();
    const k = r.width / Math.max(1, cv.offsetWidth) * Math.min(2, window.devicePixelRatio || 1);
    const s = Math.min(1, 1600 / Math.max(cv.offsetWidth * k, cv.offsetHeight * k));
    cv.width = Math.max(1, Math.round(cv.offsetWidth * k * s));
    cv.height = Math.max(1, Math.round(cv.offsetHeight * k * s));
    const [w, h] = taillePage(page);
    const url = (nom: string) => (assetInfo(nom) ? assetUrl(nom) : undefined);
    const t = toile(cv, {
      page,
      double: info.double,
      cote: info.cote,
      aspect: w / h,
      coucheTableaux: refTableaux.current ?? undefined,
      dessins: dessins.map((d) => ({ ...d, peindre: !reduit && !peintes.has(`${page}/${d.nom}`) })),
      douce: reduit,
      url,
      encre: url(info.encre1x ?? info.encre),
      zones: Object.values(info.vivants).filter((z): z is [number, number, number, number] => !!z),
      pret: () => prete(page, true),
      perdu: () => {
        echouees.add(page);
        dessins.forEach((d) => peintes.add(`${page}/${d.nom}`));
        pretes.delete(page);
        changer();
      },
      peinte: (nom) => marquer(`${page}/${nom}`),
    });
    toiles.set(page, t);
    const verifier = () => {
      const visible = feuille.classList.contains('gc-livre__page--visible');
      const pose = !livre.hasAttribute('data-gc-geste') && livre.getAttribute('data-gc-etat') === 'ouvert';
      t.jouer(visible && pose && !document.hidden);
    };
    const obs = new MutationObserver(verifier);
    obs.observe(feuille, { attributes: true, attributeFilter: ['class'] });
    obs.observe(livre, { attributes: true, attributeFilter: ['data-gc-geste', 'data-gc-etat'] });
    document.addEventListener('visibilitychange', verifier);
    // un toucher sur la page : une aquarelle joue sa scène, le chien s'arrête pour parler (et la page ne tourne pas)
    const toucher = (e: Event) => {
      const d = (e as CustomEvent<ToucherPage>).detail;
      if (e.defaultPrevented || !d) return;
      if (t.toucher(d.x, d.y)) e.preventDefault();
    };
    racine.addEventListener(TOUCHER_EVENT, toucher);
    // un clic dans le livre finit de peindre, comme il finit d'écrire (PageCuite)
    const finir = () => {
      if (feuille.classList.contains('gc-livre__page--visible')) t.finir();
    };
    livre.addEventListener('pointerdown', finir);
    verifier();
    return () => {
      obs.disconnect();
      document.removeEventListener('visibilitychange', verifier);
      racine.removeEventListener(TOUCHER_EVENT, toucher);
      livre.removeEventListener('pointerdown', finir);
      if (toiles.get(page) === t) toiles.delete(page);
      t.arreter();
      prete(page, false);
    };
    // les aquarelles d'une page ne changent pas ; « moins d'animations » relance la toile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, page, reduit]);

  return <>
    {mode==='live'&&<ModeCuisine page={page}/>}
    {actif&&<>
    <canvas ref={ref} className="gc-aquarelles-toile" aria-hidden="true" />
    <div ref={refTableaux} className="gc-tableaux" />
    </>}
  </>;
}

export default Aquarelle;
