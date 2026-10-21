import React from 'react';
import { createPortal } from 'react-dom';
import { assetInfo, assetUrl } from '../../lib/assets';
import { clavierModalActif } from '../../lib/clavier';
import { handStyle, handText } from '../../lib/hands';
import { useReducedMotion } from '../../lib/motion';
import { useRenderMode } from '../../lib/spread';
import { LOUPE_EVENT, loupeOccupee } from '../../lib/loupe';
import { placerCompagnon, zoneLibreSecret, type RectSecret } from '../../lib/secrets';
import { abonnerQuete, agirQuete, CACHETTES, etatQuete, QUETE_INITIALE, QUETE_OUVRIR_EVENT } from '../../lib/quete';
import { useEcran } from '../Ecran/contexte';
import { GESTE_EVENT } from '../Livre/evenements';
import { pageCuite, PAGES_CUITES } from '../PageCuite/PageCuite';
import { FarineCachette, type FarineCachetteRef } from './FarineCachette';
import './SecretsDuCarnet.css';

export interface SecretsDuCarnetProps { page: string }
const useQuete = () => React.useSyncExternalStore(abonnerQuete, etatQuete, () => QUETE_INITIALE);

// Un observateur partagé, sans horloge : rien ne change tout seul pendant la lecture.
type Inscription = { el: HTMLElement; actif: (oui: boolean) => void; table?: boolean; placer?: () => void };
const inscrits = new Set<Inscription>();
let observateur: MutationObserver | null = null;
function verifier() {
  for (const i of inscrits) {
    const feuille = i.el.closest('.gc-livre__page');
    const livre = i.el.closest('.gc-livre') ?? i.el.closest('.gc-ecran')?.querySelector('.gc-livre');
    i.actif(!document.hidden && !loupeOccupee() && (i.table || !!feuille?.classList.contains('gc-livre__page--visible')) === true &&
      livre?.getAttribute('data-gc-etat') === 'ouvert' && !livre.hasAttribute('data-gc-geste'));
    i.placer?.();
  }
}
function inscrire(i: Inscription): () => void {
  inscrits.add(i);
  if (!observateur) {
    observateur = new MutationObserver(verifier);
    const ecran = i.el.closest('.gc-ecran') ?? i.el.closest('.gc-livre');
    if (ecran) observateur.observe(ecran, { attributes: true, subtree: true, attributeFilter: ['class', 'data-gc-etat', 'data-gc-geste'] });
    document.addEventListener('visibilitychange', verifier);
    document.addEventListener(GESTE_EVENT, verifier);
    window.addEventListener(LOUPE_EVENT, verifier);
    window.addEventListener('resize', verifier);
  }
  verifier();
  return () => {
    inscrits.delete(i);
    if (inscrits.size) return;
    observateur?.disconnect(); observateur = null;
    document.removeEventListener('visibilitychange', verifier);
    document.removeEventListener(GESTE_EVENT, verifier);
    window.removeEventListener(LOUPE_EVENT, verifier);
    window.removeEventListener('resize', verifier);
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
    const cv = document.createElement('canvas');
    const [w, h] = info.taille ?? [PAGES_CUITES.largeur, PAGES_CUITES.hauteur];
    cv.width = 170; cv.height = Math.round(170 * h / w);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, cv.width, cv.height);
    const zones = [...Object.values(info.vivants).filter((z): z is RectSecret => !!z), ...(info.liens ?? []).map((l) => l.rect)];
    return zoneLibreSecret(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, zones);
  })().catch(() => null);
  cartes.set(page, promesse);
  return promesse;
}

/** Une seule cachette par étape, jamais de chien dans le papier. Les futures restent fermées. */
export function SecretsDuCarnet({ page }: SecretsDuCarnetProps) {
  const mode = useRenderMode();
  const reduit = useReducedMotion();
  const quete = useQuete();
  const index = CACHETTES.findIndex((c) => c.page === page);
  const cachette = CACHETTES[index];
  const racine = React.useRef<HTMLDivElement>(null);
  const farine = React.useRef<FarineCachetteRef>(null);
  const [zone, setZone] = React.useState<RectSecret | null>(null);
  const [actif, setActif] = React.useState(false);
  const accessible = index >= 0 && index <= quete.trouves;
  React.useEffect(() => {
    if (mode !== 'live' || !accessible) return;
    let monte = true;
    emplacement(page).then((z) => { if (monte) setZone(z); });
    return () => { monte = false; };
  }, [page, accessible, mode]);
  React.useEffect(() => {
    if (!zone || !racine.current || mode !== 'live' || !accessible) return;
    return inscrire({ el: racine.current, actif: setActif });
  }, [zone, mode, accessible]);
  if (!zone || !cachette || !accessible || mode !== 'live') return null;
  const trouve = index < quete.trouves;
  const style = { left: `${zone[0] * 100}%`, top: `${zone[1] * 100}%`, width: `${zone[2] * 100}%`, height: `${zone[3] * 100}%`, ...handStyle('cecile', 'meta', 'crayon') } as React.CSSProperties;
  const decouvrir = () => { agirQuete({ type: 'reveler', index }); window.dispatchEvent(new CustomEvent(QUETE_OUVRIR_EVENT, { detail: index })); };
  const poudre = index === 0 && !trouve && !quete.revele;
  return <div ref={racine} className="gc-secrets" style={style} data-gc-secrets={page} data-gc-secret={cachette.id} data-gc-secret-matiere={cachette.matiere} data-gc-secret-actif={actif ? 'oui' : 'non'} data-gc-secret-reduit={reduit ? 'oui' : 'non'} data-gc-secret-trouve={trouve ? 'oui' : 'non'} data-gc-secret-revele={index === quete.trouves && quete.revele ? 'oui' : 'non'} aria-hidden={!actif || undefined}>
    <button type="button" className="gc-secrets__bouton" data-gc-controle="" tabIndex={actif ? 0 : -1} aria-label={poudre ? 'Balayer la farine. Balayer du doigt ou répéter les clics, Entrée ou Espace'  : `${trouve ? 'Relire' : 'Découvrir'} une note cachée`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
      e.stopPropagation();
      if (poudre) farine.current?.balayer(); else decouvrir();
    }}>
      {cachette.matiere !== 'farine' && <span className={`gc-secrets__papier gc-secrets__papier--${cachette.matiere}`} aria-hidden="true"/>}
      <img className={`gc-secrets__dessin gc-secrets__dessin--${cachette.id}`} src={assetUrl(`aquarelles/${cachette.dessin}`)} alt="" draggable={false}/>
      {index === 0 && <span className="gc-secrets__murmure" aria-hidden="true">{handText('Intentions gourmandes…', 'cecile')}</span>}
      {poudre && <FarineCachette ref={farine} actif={actif} decouvrir={decouvrir}/>}
    </button>
  </div>;
}
export default SecretsDuCarnet;

interface CadreGuide { left: number; top: number; width: number; maxHeight: number }
interface Placement { chien: RectSecret | null; guide: CadreGuide; pages: string[] }
const PAGES_VIDES: string[] = [];

/** Même silhouette et mêmes pattes : seule la tête répond brièvement au clic. */
function ChienGuide({ reaction, reduit }: { reaction: number; reduit: boolean }) {
  const id = React.useId().replace(/:/g, '');
  const guide = assetInfo('aquarelles/jack-russell-guide');
  const src = assetUrl(guide ? 'aquarelles/jack-russell-guide' : 'aquarelles/jack-russell-assis');
  if (!guide) return <img className="gc-quete__chien" src={src} alt="" draggable={false}/>;
  return <svg className="gc-quete__chien" viewBox="0 0 600 800" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${id}-corps`}><rect x="0" y="293" width="600" height="507"/></clipPath>
      <clipPath id={`${id}-tete`}><rect x="0" y="0" width="600" height="300"/></clipPath>
    </defs>
    <image href={src} width="600" height="800" clipPath={`url(#${id}-corps)`}/>
    <g key={reaction} className={reaction > 0 && !reduit ? 'gc-quete__tete gc-quete__tete--salue' : 'gc-quete__tete'}>
      <image href={src} width="600" height="800" clipPath={`url(#${id}-tete)`}/>
    </g>
  </svg>;
}

/** Sur la table, le guide propose un lien : seule une action du lecteur change de double page. */
export function CompagnonDuCarnet() {
  const ecran = useEcran();
  const racine = React.useRef<HTMLDivElement>(null);
  const panneau = React.useRef<HTMLElement>(null);
  const quete = useQuete();
  const reduit = useReducedMotion();
  const [actif, setActif] = React.useState(false);
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const [ouvert, setOuvert] = React.useState(false);
  const [selection, setSelection] = React.useState<number | null>(null);
  const [reaction, setReaction] = React.useState(0);
  const [aide, setAide] = React.useState(0);
  const pages = placement?.pages ?? PAGES_VIDES;
  const fini = quete.trouves === CACHETTES.length;
  const index = selection != null && selection < quete.trouves ? selection : Math.min(quete.trouves, CACHETTES.length - 1);
  const cachette = CACHETTES[index];
  const ici = pages.includes(cachette.page);
  const revele = index < quete.trouves || (index === quete.trouves && quete.revele);
  const infoPage = pageCuite(cachette.page);
  const reperePage = `Page ${infoPage?.folio ?? 'du carnet'} · ${infoPage?.cote ?? 'gauche'}`;
  const doubleIci = pages.some((p) => pageCuite(p)?.double === cachette.double);

  React.useEffect(() => {
    const el = racine.current;
    if (!el || !ecran?.controles) return;
    const placer = () => {
      const root = el.closest('.gc-ecran');
      const visibles = root?.querySelectorAll<HTMLElement>('.gc-livre__page--visible .gc-page-cuite');
      if (!root || !visibles?.length) { setPlacement(null); return; }
      const rs = [...visibles].map((p) => p.getBoundingClientRect());
      const er = root.getBoundingClientRect();
      const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top));
      const x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom));
      const br = root.querySelector('.gc-bougie__cire')?.getBoundingClientRect();
      const z = placerCompagnon([er.left, er.top, er.width, er.height], [x0, y0, x1 - x0, y1 - y0], br ? [br.left, br.top, br.width, br.height] : undefined);
      const marge = er.right - x1;
      const width = Math.min(280, Math.max(190, marge - 24), er.width * .42);
      const left = marge >= width + 24 ? x1 - er.left + 12 : er.width - width - 54;
      const suivant: Placement = {
        chien: z ? [z[0] - er.left, z[1] - er.top, z[2], z[3]] : null,
        guide: { left, top: er.height < 600 ? 58 : 92, width, maxHeight: Math.max(140, er.height - (er.height < 600 ? 116 : 280)) },
        pages: [...visibles].map((p) => p.dataset.gcPageCuite ?? ''),
      };
      setPlacement((ancien) => JSON.stringify(ancien) === JSON.stringify(suivant) ? ancien : suivant);
    };
    return inscrire({ el, table: true, actif: setActif, placer });
  }, [ecran?.controles]);

  const montrer = React.useCallback((n?: number) => {
    const voulu = n ?? Math.min(quete.trouves, CACHETTES.length - 1);
    setSelection(n == null && quete.trouves === CACHETTES.length ? null : voulu);
    setAide(0);
    setOuvert(true);
  }, [quete.trouves]);
  React.useEffect(() => {
    if (!actif) return;
    const ouvrir = (e: Event) => { montrer((e as CustomEvent<number>).detail); setReaction((n) => n + 1); };
    const clavier = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || clavierModalActif()) return;
      if ((e.target as HTMLElement | null)?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault(); e.stopPropagation(); montrer();
        requestAnimationFrame(() => (panneau.current?.querySelector<HTMLElement>('[data-gc-quete-principal]') ?? panneau.current?.querySelector<HTMLButtonElement>('.gc-quete__fermer'))?.focus({ preventScroll: true }));
      } else if (e.key === 'Escape' && ouvert) {
        e.preventDefault(); e.stopImmediatePropagation(); setOuvert(false);
        racine.current?.querySelector<HTMLButtonElement>('.gc-quete__appel')?.focus();
      }
    };
    window.addEventListener(QUETE_OUVRIR_EVENT, ouvrir);
    window.addEventListener('keydown', clavier, true);
    return () => { window.removeEventListener(QUETE_OUVRIR_EVENT, ouvrir); window.removeEventListener('keydown', clavier, true); };
  }, [actif, montrer, ouvert]);

  React.useEffect(() => {
    if (!ouvert || !actif) return;
    const image = requestAnimationFrame(() => (panneau.current?.querySelector<HTMLElement>('[data-gc-quete-principal]') ?? panneau.current?.querySelector<HTMLButtonElement>('.gc-quete__fermer'))?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(image);
  }, [ouvert, actif, index, revele, fini, aide]);

  if (!ecran?.controles) return null;
  const zone = placement?.chien;
  const style = { ...(zone ? { left: zone[0], top: zone[1], width: zone[2], height: zone[3] } : {}), ...handStyle('cecile', 'meta', 'brune') } as React.CSSProperties;
  const texte = (s: string) => handText(s, 'cecile');
  return createPortal(<>
    <div ref={racine} className={`gc-quete__compagnon${zone ? '' : ' gc-quete__compagnon--discret'}`} style={style} data-gc-secret-actif={actif ? 'oui' : 'non'} data-gc-quete-progres={quete.trouves} data-gc-quete-reduit={reduit ? 'oui' : 'non'} aria-hidden={!actif || undefined}>
      <button className="gc-quete__appel" type="button" data-gc-controle="" aria-label={`${ouvert ? 'Replier' : 'Ouvrir'} les notes en marge`} aria-expanded={ouvert} aria-controls="gc-guide-quete" aria-keyshortcuts="S" tabIndex={actif ? 0 : -1} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); setReaction((n) => n + 1); if (ouvert) setOuvert(false); else montrer(); }}>
        {zone && <ChienGuide reaction={reaction} reduit={reduit}/>}
        <span className="gc-quete__legende">{texte('Psst…')}</span>
      </button>
    </div>
    {ouvert && actif && placement && <section ref={panneau} id="gc-guide-quete" className="gc-quete__guide" style={{ ...placement.guide, '--gc-quete-papier': `url("${assetUrl(pageCuite(cachette.page)?.papier1x ?? pageCuite(cachette.page)!.papier)}")`, ...handStyle('cecile', 'meta', 'brune') } as React.CSSProperties} data-gc-quete-etape={cachette.id} data-gc-quete-revele={revele ? 'oui' : 'non'} data-gc-quete-reduit={reduit ? 'oui' : 'non'} role="region" aria-label="Notes en marge" data-gc-quete-lateral="oui" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
      <button type="button" className="gc-quete__fermer" aria-label="Replier les notes en marge" onClick={() => setOuvert(false)}>×</button>
      <h2>{texte('Notes en marge')}</h2>
      {fini && selection == null ? <>
        <p>{texte('Le carnet a confié toutes ses petites notes.')}</p>
        <p>{texte(CACHETTES[CACHETTES.length - 1].suite)}</p>
      </> : revele ? <>
        <div className={`gc-quete__revelation gc-quete__revelation--${cachette.id}`}>
          <p className="gc-quete__amorce">{texte(cachette.amorce)}</p>
          <blockquote>{texte(cachette.revelation)}</blockquote>
          {'question' in cachette && <p>{texte(cachette.question)}</p>}
        </div>
        {index === quete.trouves && <button type="button" className="gc-quete__action" data-gc-quete-principal="" onClick={() => { agirQuete({ type: 'valider', index }); setSelection(null); setAide(0); setOuvert(false); }}>{texte('Garder cette note')}</button>}
        {index < quete.trouves && <button type="button" className="gc-quete__action" data-gc-quete-principal="" onClick={() => { setSelection(null); setAide(0); }}>{texte('Revenir au fil du carnet')}</button>}
      </> : <>
        {aide === 0 && <p>{texte('Il reste peut-être quelque chose entre ces pages. Rien ne presse…')}</p>}
        {aide >= 1 && <p className="gc-quete__indice-doux">{texte(cachette.indice)}</p>}
        {aide < 2 && <button type="button" className="gc-quete__action" data-gc-quete-principal="" onClick={() => setAide((n) => n + 1)}>{texte(aide === 0 ? 'Souffle-moi une piste' : 'Un peu plus d’aide')}</button>}
        {aide === 2 && <>
          <p className="gc-quete__destination">{texte(`${reperePage} · « ${cachette.pageTitre} »`)}</p>
          <p>{texte(`Cherche ${cachette.chercher}.${index === 0 ? ' Un peu de farine la recouvre : balaie-la du doigt, ou répète les petits coups de brosse avec Entrée.' : ''}`)}</p>
          {!ici && !doubleIci && <a className="gc-quete__action" data-gc-quete-principal="" href={`#${encodeURIComponent(cachette.double)}`} onClick={() => setOuvert(false)}>{texte('Feuilleter jusque-là')}</a>}
          {!ici && doubleIci && <p>{texte(`La note est sur la page de ${infoPage?.cote}. Les flèches du carnet permettent d’y aller.`)}</p>}
          {ici && <button type="button" className="gc-quete__action" data-gc-quete-principal="" onClick={() => { agirQuete({ type: 'reveler', index }); setReaction((n) => n + 1); }}>{texte(index === 0 ? 'Lire la note sans balayer' : 'Lire la note')}</button>}
        </>}
      </>}
      {quete.trouves > 0 && <details className="gc-quete__archives">
        <summary>{texte('Notes retrouvées')}</summary>
        <ul>{CACHETTES.slice(0, quete.trouves).map((c, n) => <li key={c.id}><button type="button" onClick={() => { setSelection(n); setAide(0); }}>{texte(c.titre)}</button></li>)}</ul>
      </details>}
      {fini && selection == null && <button type="button" className="gc-quete__recommencer" onClick={() => { agirQuete({ type: 'rejouer' }); setSelection(null); setAide(0); }}>{texte('Retrouver les notes une autre fois')}</button>}
      <p className="gc-quete__touches">{texte('S : notes · Échap : replier')}</p>
      <span className="gc-quete__annonce" role="status" aria-live="polite">{fini && selection == null ? 'Toutes les notes sont gardées. Tu peux les relire.' : revele ? 'Une note se dévoile. Tu peux la lire puis la garder.' : aide === 0 ? 'Notes en marge ouvertes. Un indice est disponible si tu le souhaites.' : aide === 1 ? cachette.indice : `${reperePage}. ${cachette.pageTitre}. Cherche ${cachette.chercher}.`}</span>
    </section>}
  </>, ecran.controles);
}
