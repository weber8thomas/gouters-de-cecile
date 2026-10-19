import React from 'react';
import { createPortal } from 'react-dom';
import { assetInfo, assetUrl } from '../../lib/assets';
import { clavierModalActif } from '../../lib/clavier';
import { handStyle, handText } from '../../lib/hands';
import { useReducedMotion } from '../../lib/motion';
import { useRenderMode } from '../../lib/spread';
import { abonnerVitesse, facteurAnimations } from '../../lib/vitesse';
import { LOUPE_EVENT, loupeOccupee } from '../../lib/loupe';
import { numeroSecret, placerCompagnon, SECRETS, zoneLibreSecret, type RectSecret } from '../../lib/secrets';
import { useEcran } from '../Ecran/contexte';
import { GESTE_EVENT } from '../Livre/evenements';
import { pageCuite, PAGES_CUITES } from '../PageCuite/PageCuite';
import './SecretsDuCarnet.css';

export interface SecretsDuCarnetProps { page: string }

// Un observateur pour toutes les vignettes du livre. Le CSS fait le mouvement : aucune boucle
// requestAnimationFrame supplémentaire, aucun rendu React pendant un tour de page.
type Inscription = { el: HTMLElement; actif: (oui: boolean) => void; jouer: () => void; suivant: () => void; temps?: number; table?: boolean; placer?: () => void };
const inscrits = new Set<Inscription>();
let observateur: MutationObserver | null = null;
let tourClavier = 0;
let horloge = 0;
function verifier() {
  for (const i of inscrits) {
    const feuille = i.el.closest('.gc-livre__page');
    const livre = i.el.closest('.gc-livre') ?? i.el.closest('.gc-ecran')?.querySelector('.gc-livre');
    i.actif(!document.hidden && !loupeOccupee() && (i.table || !!feuille?.classList.contains('gc-livre__page--visible')) === true &&
      livre?.getAttribute('data-gc-etat') === 'ouvert' && !livre.hasAttribute('data-gc-geste'));
    i.placer?.();
  }
}
function clavier(e: KeyboardEvent) {
  if (e.key.toLowerCase() !== 's' || e.ctrlKey || e.altKey || e.metaKey || e.repeat || clavierModalActif()) return;
  const cible = e.target as HTMLElement | null;
  if (cible?.closest('input,textarea,select,[contenteditable="true"],button,a')) return;
  const presents = [...inscrits].filter((i) => i.el.dataset.gcSecretActif === 'oui');
  if (!presents.length) return;
  presents[tourClavier++ % presents.length].jouer();
  e.preventDefault();
  e.stopPropagation();
}
function inscrire(i: Inscription): () => void {
  inscrits.add(i);
  if (!observateur) {
    observateur = new MutationObserver(verifier);
    const livre = i.el.closest('.gc-ecran') ?? i.el.closest('.gc-livre');
    if (livre) observateur.observe(livre, { attributes: true, subtree: true, attributeFilter: ['class', 'data-gc-etat', 'data-gc-geste'] });
    document.addEventListener('visibilitychange', verifier);
    document.addEventListener(GESTE_EVENT, verifier);
    window.addEventListener(LOUPE_EVENT, verifier);
    window.addEventListener('keydown', clavier);
    window.addEventListener('resize', verifier);
    horloge = window.setInterval(() => {
      for (const entree of inscrits) {
        if (entree.el.dataset.gcSecretActif !== 'oui' || entree.el.dataset.gcSecretReduit === 'oui') continue;
        entree.temps = (entree.temps ?? 0) + facteurAnimations();
        if (entree.temps >= 14) { entree.temps = 0; entree.suivant(); }
      }
    }, 1000);
  }
  verifier();
  return () => {
    inscrits.delete(i);
    if (inscrits.size) return;
    observateur?.disconnect(); observateur = null;
    document.removeEventListener('visibilitychange', verifier);
    document.removeEventListener(GESTE_EVENT, verifier);
    window.removeEventListener(LOUPE_EVENT, verifier);
    window.removeEventListener('keydown', clavier);
    window.removeEventListener('resize', verifier);
    window.clearInterval(horloge);
  };
}

const cartes = new Map<string, Promise<RectSecret | null>>();
function emplacement(page: string): Promise<RectSecret | null> {
  const existant = cartes.get(page); if (existant) return existant;
  const info = pageCuite(page);
  if (!info) return Promise.resolve(null);
  const promesse = (async () => {
    const nom = info.encre1x && assetInfo(info.encre1x) ? info.encre1x : info.encre;
    if (!assetInfo(nom)) return null;
    const image = new Image(); image.src = assetUrl(nom); await image.decode();
    const cv = document.createElement('canvas'); cv.width = 170; cv.height = 192;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, cv.width, cv.height);
    const zones = [...Object.values(info.vivants).filter((z): z is RectSecret => !!z), ...(info.liens ?? []).map((l) => l.rect)];
    return zoneLibreSecret(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, zones);
  })().catch(() => null);
  cartes.set(page, promesse);
  return promesse;
}

function Cle() {
  if (assetInfo('aquarelles/cle-ancienne')) return <img className="gc-secrets__cle" src={assetUrl('aquarelles/cle-ancienne')} alt="" draggable={false} />;
  return <svg className="gc-secrets__cle" viewBox="0 0 100 45" aria-hidden="true"><path d="M26 5C5 2 1 36 23 38C43 41 48 8 26 5ZM42 22L91 24L90 36L80 35L80 26L69 26L68 34" /></svg>;
}
function Etoile({ classe = '' }: { classe?: string }) {
  return <svg className={`gc-secrets__etoile ${classe}`} viewBox="0 0 50 50" aria-hidden="true"><path d="M25 3L31 18L47 20L35 31L37 47L24 39L9 46L12 29L2 19L19 17Z" /></svg>;
}
function Patte({ n }: { n: number }) {
  return <svg className="gc-secrets__patte" style={{ '--gc-secret-n': n } as React.CSSProperties} viewBox="0 0 32 40" aria-hidden="true"><path d="M9 26C3 35 11 39 16 35C23 39 30 33 23 25C19 19 14 20 9 26Z"/><ellipse cx="6" cy="15" rx="4" ry="6"/><ellipse cx="14" cy="8" rx="4" ry="6"/><ellipse cx="23" cy="10" rx="4" ry="6"/><ellipse cx="29" cy="19" rx="3" ry="5"/></svg>;
}

function BulleDuChien({ index }: { index: number }) {
  const phrase = index % 2 ? 'Ça sent le beurre d’ici !' : 'Une part pour le chien ?';
  if (!assetInfo('aquarelles/bulle-vierge')) return null;
  return <span className="gc-secrets__bulle">
    <img src={assetUrl('aquarelles/bulle-vierge')} alt="" draggable={false}/>
    <span className="gc-secrets__parole" style={handStyle('cecile', 'meta', 'brune')}>{handText(phrase, 'cecile')}</span>
  </span>;
}

function DessinSecret({ index }: { index: number }) {
  const s = SECRETS[index];
  if ('chien' in s) {
    const nom = assetInfo(`aquarelles/${s.chien}`) ? s.chien : 'jack-russell';
    return <>
      <span className="gc-secrets__compagnon"><img className="gc-secrets__chien" src={assetUrl(`aquarelles/${nom}`)} alt="" draggable={false} />
        {s.id === 'chien-cle' && <Cle />}
      </span>
      <BulleDuChien index={index}/>
      {s.id === 'chien-etoile' && <Etoile classe="gc-secrets__jouet" />}
      {s.id === 'chien-dodo' && <><span className="gc-secrets__reve gc-secrets__reve--1">z</span><span className="gc-secrets__reve gc-secrets__reve--2">z</span><span className="gc-secrets__biscuit" /></>}
      {s.id === 'chien-pattes' && <span className="gc-secrets__pattes">{[0, 1, 2, 3, 4, 5].map((n) => <Patte key={n} n={n} />)}</span>}
    </>;
  }
  return <>
    {(s.id === 'lettre' || s.id === 'poche') && <><span className="gc-secrets__enveloppe">{assetInfo('aquarelles/enveloppe') ? <img src={assetUrl('aquarelles/enveloppe')} alt="" draggable={false}/> : <><span className="gc-secrets__rabat" /><span className="gc-secrets__cachet">C</span></>}</span>{s.id === 'poche' && assetInfo('aquarelles/fiole-magique') ? <img className="gc-secrets__lettre gc-secrets__fiole" src={assetUrl('aquarelles/fiole-magique')} alt="" draggable={false}/> : <span className="gc-secrets__lettre"><span>Terrible Cécile</span><span className="gc-secrets__lignes" /></span>}{s.id === 'poche' && <span className="gc-secrets__poche" />}</>}
    {s.id === 'constellation' && <span className={`gc-secrets__carte${assetInfo('aquarelles/carte-etoiles') ? ' gc-secrets__carte--illustree' : ''}`}>{assetInfo('aquarelles/carte-etoiles') && <img src={assetUrl('aquarelles/carte-etoiles')} alt="" draggable={false}/>}<svg viewBox="0 0 180 110" aria-hidden="true"><path className="gc-secrets__constellation" d="M18 80L45 23L86 40L133 14L163 60L118 88L86 40L68 93" />{[[18,80],[45,23],[86,40],[133,14],[163,60],[118,88],[68,93]].map(([x,y], n) => <circle key={n} cx={x} cy={y} r={n === 2 ? 4 : 2.5} style={{ '--gc-secret-n': n } as React.CSSProperties}/>)}</svg><Etoile /></span>}
    {s.id === 'plume' && <><span className="gc-secrets__manuscrit">Douce<br />Cécile</span>{assetInfo('aquarelles/plume') ? <img className="gc-secrets__plume" src={assetUrl('aquarelles/plume')} alt="" draggable={false}/> : <svg className="gc-secrets__plume" viewBox="0 0 90 160" aria-hidden="true"><path d="M13 151C28 83 36 22 78 8C88 41 60 86 25 105M28 95L65 43M33 80L28 61M39 65L65 60M44 48L43 35" /></svg>}<span className="gc-secrets__encrier" /></>}
    {s.id === 'porte' && <><span className="gc-secrets__seuil"><span>Fée<br />du logis</span></span><span className="gc-secrets__porte"><Cle /></span></>}
    {s.id === 'livre' && <span className="gc-secrets__grimoire"><span className="gc-secrets__feuillet gc-secrets__feuillet--1"/><span className="gc-secrets__feuillet gc-secrets__feuillet--2"/><span className="gc-secrets__plat">Cordon<br />bleu<Etoile /></span></span>}
    {s.id === 'trente' && <><span className="gc-secrets__chiffre">30</span>{[0,1,2,3,4].map((n) => <span key={n} className="gc-secrets__orbite" style={{ '--gc-secret-n': n } as React.CSSProperties}><Etoile /></span>)}</>}
    {s.id === 'piste' && <><span className="gc-secrets__pattes gc-secrets__pattes--seules">{[0,1,2,3,4,5,6,7].map((n) => <Patte key={n} n={n}/>)}</span><span className="gc-secrets__trappe"><Cle /></span></>}
  </>;
}

/** Compagnons, courriers et cachettes. S révèle tour à tour un secret des pages visibles. */
export function SecretsDuCarnet({ page }: SecretsDuCarnetProps) {
  const mode = useRenderMode();
  const reduit = useReducedMotion();
  const vitesse = React.useSyncExternalStore(abonnerVitesse, facteurAnimations, () => 1);
  const info = pageCuite(page);
  const racine = React.useRef<HTMLDivElement>(null);
  const [zone, setZone] = React.useState<RectSecret | null>(null);
  const [actif, setActif] = React.useState(false);
  const [clics, setClics] = React.useState(0);
  const [tour, setTour] = React.useState(0);
  const [chienGauche, setChienGauche] = React.useState(true);
  const jouer = React.useCallback(() => setClics((n) => n + 1), []);
  const suivant = React.useCallback(() => setTour((n) => n + 1), []);
  React.useEffect(() => {
    if (mode !== 'live' || !info || info.type === 'feuillet') return;
    let monte = true;
    emplacement(page).then((z) => { if (monte) setZone(z); });
    if (info.cote === 'droite') {
      const gauche = Object.entries(PAGES_CUITES.pages).find(([, p]) => p.double === info.double && p.cote === 'gauche' && p.type !== 'feuillet');
      if (gauche) emplacement(gauche[0]).then((z) => { if (monte) setChienGauche(!!z); });
      else setChienGauche(false);
    }
    return () => { monte = false; };
  }, [page, info, mode]);
  React.useEffect(() => {
    if (!zone || !racine.current || mode !== 'live') return;
    return inscrire({ el: racine.current, actif: setActif, jouer, suivant });
  }, [zone, mode, jouer, suivant]);
  if (!zone || !info || mode !== 'live') return null;
  const base = numeroSecret(page, info.cote);
  const variation = tour + Math.max(0, clics - 1);
  const index = info.cote === 'gauche' ? (base + variation) % 4 : !chienGauche && variation % 3 !== 2 ? variation % 4 : 4 + (base - 4 + variation) % 8;
  const secret = SECRETS[index];
  const style = { left: `${zone[0] * 100}%`, top: `${zone[1] * 100}%`, width: `${zone[2] * 100}%`, height: `${zone[3] * 100}%`, '--gc-secret-cycle': `${14 / vitesse}s`, '--gc-secret-temps': `${1 / vitesse}s`, '--gc-secret-papier': `url("${assetUrl(info.papier)}")`, ...handStyle('cecile', 'meta', 'crayon') } as React.CSSProperties;
  return <div ref={racine} className="gc-secrets" style={style} data-gc-secrets={page} data-gc-secret={secret.id} data-gc-secret-actif={actif ? 'oui' : 'non'} data-gc-secret-reduit={reduit ? 'oui' : 'non'} data-gc-secret-revele={clics ? 'oui' : 'non'} aria-hidden={!actif || undefined}>
    <button type="button" className="gc-secrets__bouton" data-gc-controle="" tabIndex={actif ? 0 : -1} aria-label={`${secret.titre}. Révéler le secret ; appuyer de nouveau pour une autre surprise.`} aria-keyshortcuts="S" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); jouer(); }}>
      <span className={`gc-secrets__scene gc-secrets__scene--${secret.id}`} key={`${index}-${clics}-${tour}`} aria-hidden="true"><DessinSecret index={index}/></span>
      <span className="gc-secrets__mot" key={`mot-${clics}-${tour}`} aria-hidden="true">{handText(secret.mot, 'cecile')}</span>
      <span className="gc-secrets__indice" aria-hidden="true">un petit secret…</span>
    </button>
    <span className="gc-secrets__annonce" role="status" aria-live="polite">{clics ? `${secret.titre} : ${secret.mot}` : ''}</span>
  </div>;
}

export default SecretsDuCarnet;

/** À monter une fois sous Ecran, à côté du Livre. Le portail reste hors de la loupe.
 * Le grand Jack Russell accompagne aussi les recettes où la page ne laisse aucune marge. */
export function CompagnonDuCarnet() {
  const ecran = useEcran();
  const racine = React.useRef<HTMLDivElement>(null);
  const reduit = useReducedMotion();
  const vitesse = React.useSyncExternalStore(abonnerVitesse, facteurAnimations, () => 1);
  const [actif, setActif] = React.useState(false);
  const [zone, setZone] = React.useState<RectSecret | null>(null);
  const [tour, setTour] = React.useState(0);
  const suivant = React.useCallback(() => setTour((n) => n + 1), []);
  React.useEffect(() => {
    const el = racine.current;
    if (!el || !ecran?.controles) return;
    const placer = () => {
      const root = el.closest('.gc-ecran');
      const pages = root?.querySelectorAll('.gc-livre__page--visible .gc-page-cuite');
      if (!root || !pages?.length) { setZone(null); return; }
      const rs = [...pages].map((p) => p.getBoundingClientRect());
      const er = root.getBoundingClientRect();
      const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top));
      const x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom));
      // Le wrapper de la bougie couvre tout Stage ; seule la cire occupe réellement la table.
      const br = root.querySelector('.gc-bougie__cire')?.getBoundingClientRect();
      const z = placerCompagnon([er.left, er.top, er.width, er.height], [x0, y0, x1-x0, y1-y0], br ? [br.left, br.top, br.width, br.height] : undefined);
      const local: RectSecret | null = z ? [z[0]-er.left, z[1]-er.top, z[2], z[3]] : null;
      setZone((prev) => prev?.join(',') === local?.join(',') ? prev : local);
    };
    return inscrire({ el, table:true, actif:setActif, jouer:suivant, suivant, placer });
  }, [ecran?.controles, suivant]);
  if (!ecran?.controles) return null;
  const s = SECRETS[tour % 4];
  const style = { left:zone?.[0] ?? 0, top:zone?.[1] ?? 0, width:zone?.[2] ?? 190, height:zone?.[3] ?? 180, visibility:zone ? undefined : 'hidden', '--gc-secret-cycle':`${14/vitesse}s`, '--gc-secret-temps':`${1/vitesse}s`, ...handStyle('cecile','meta','crayon') } as React.CSSProperties;
  return createPortal(<div ref={racine} className="gc-secrets gc-secrets--table" style={style} data-gc-secret={s.id} data-gc-secret-actif={actif && zone ? 'oui' : 'non'} data-gc-secret-reduit={reduit ? 'oui' : 'non'} aria-hidden={!actif || !zone || undefined}>
    <button type="button" className="gc-secrets__bouton" data-gc-controle="" tabIndex={actif && zone ? 0 : -1} aria-label="Jouer avec le Jack Russell du carnet" aria-keyshortcuts="S" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); suivant(); }}>
      <span className={`gc-secrets__scene gc-secrets__scene--${s.id}`} key={tour} aria-hidden="true"><DessinSecret index={tour % 4}/></span>
    </button>
  </div>, ecran.controles);
}
