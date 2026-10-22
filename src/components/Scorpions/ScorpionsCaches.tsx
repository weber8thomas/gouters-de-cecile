import React from 'react';
import { createPortal } from 'react-dom';
import { handStyle, handText } from '../../lib/hands';
import { clavierModalActif } from '../../lib/clavier';
import { useNiveauMouvement } from '../../lib/motion';
import { useRenderMode } from '../../lib/spread';
import {
  abonnerScorpions, etatScorpions, MESSAGE_SCORPIONS, SCORPIONS, SCORPIONS_CARTE_EVENT, SCORPIONS_COMPLET_EVENT, SCORPIONS_INITIAL,
  trouverScorpion, type DefScorpion,
} from '../../lib/scorpions';
import { useEcran } from '../Ecran/contexte';
import { inscrire } from '../SecretsDuCarnet/visibilite';
import { DessinScorpion } from './DessinScorpion';
import { VUES_SCORPION } from './dessins';
import { calculerTrajet, ligneDecalee, type Trajet } from './trajet';
import './Scorpions.css';

const DUREE_COURSE = 600;
const DUREE_TRACE = 1500;
const useTrouves = () => React.useSyncExternalStore(abonnerScorpions, etatScorpions, () => SCORPIONS_INITIAL).trouves;

// Pas de focus parasite au premier Tab : les scorpions n'entrent dans l'ordre du clavier qu'à partir du deuxième.
let tabVu = false;
const abonnesTab = new Set<() => void>();
function surTab(e: KeyboardEvent) {
  if (e.key !== 'Tab' || tabVu) return;
  // Après l'action par défaut de cette touche (le focus a déjà bougé), pas avant.
  setTimeout(() => { tabVu = true; abonnesTab.forEach((f) => f()); }, 0);
}
function abonnerTab(f: () => void): () => void {
  if (!abonnesTab.size && !tabVu) window.addEventListener('keydown', surTab, true);
  abonnesTab.add(f);
  return () => { abonnesTab.delete(f); if (!abonnesTab.size) window.removeEventListener('keydown', surTab, true); };
}
const useTabVu = () => React.useSyncExternalStore(abonnerTab, () => tabVu, () => false);

const graineDe = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

interface TraceEnCours { d1: string; d2: string; chemin: string; l: number; h: number }

/**
 * Un scorpion caché. Au repos : un seul <svg>, aucune animation, aucun calcul.
 * Au clic : il détale ~0,6 s (WAAPI sur transform et opacity, trois poses qui alternent en opacité), laisse des pas d'encre
 * (SVG statique révélé par stroke-dashoffset, qui s'estompe en 1,5 s), puis disparaît. Aucune boucle JS.
 * Son centre et sa trace se calculent dans la boîte positionnée qui le contient (page ou calque de la table).
 */
function ScorpionCache({ def, trouve, actif, tabulable, pos }: { def: DefScorpion; trouve: boolean; actif: boolean; tabulable: boolean; pos?: { left: number; top: number } }) {
  const reduit = useNiveauMouvement() !== 'complet';
  const racine = React.useRef<HTMLDivElement>(null);
  const corps = React.useRef<HTMLSpanElement>(null);
  const [etat, setEtat] = React.useState<'repos' | 'fuit' | 'fini'>('repos');
  const [trace, setTrace] = React.useState<TraceEnCours | null>(null);
  const idMasque = React.useId().replace(/:/g, '');
  const vue = VUES_SCORPION[def.vue];
  React.useEffect(() => { if (!trouve) { setEtat('repos'); setTrace(null); } }, [trouve]);
  if (etat === 'fini' || (trouve && etat === 'repos')) return null;

  const fuir = () => {
    const el = racine.current, c = corps.current;
    if (!el || !c || etat !== 'repos') return;
    // Trouvé tout de suite (compteur, mémoire) ; la carte finale attend la fin de la fuite, même si la page se tourne.
    if (trouverScorpion(def.id)) setTimeout(() => window.dispatchEvent(new Event(SCORPIONS_COMPLET_EVENT)), DUREE_COURSE + 700);
    setEtat('fuit');
    if (reduit) {
      // Mouvement réduit : un simple fondu, sans trajet ni trace.
      c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out', fill: 'forwards' });
      setTimeout(() => setEtat('fini'), 500);
      return;
    }
    const couche = el.offsetParent as HTMLElement | null;
    const l = couche?.clientWidth || 600, h = couche?.clientHeight || 800;
    const t: Trajet = calculerTrajet(def.fuite, def.vue, Math.max(90, Math.min(170, l * .2)), def.angle, graineDe(def.id));
    const images: Keyframe[] = [{ offset: 0, transform: `rotate(${def.angle}deg)`, opacity: 1 }];
    t.points.forEach(([x, y], i) => {
      // Un petit demi-tour au départ, puis le cap de chaque tronçon ; il s'efface sur les deux derniers.
      const cap = t.caps[Math.min(i, t.caps.length - 1)];
      images.push({ offset: t.instants[i], transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${cap}deg)`, opacity: i < t.points.length - 2 ? 1 : i === t.points.length - 2 ? .85 : 0 });
    });
    c.animate(images, { duration: DUREE_COURSE, easing: 'linear', fill: 'forwards' });
    const [cx, cy] = [el.offsetLeft, el.offsetTop];
    setTrace({ d1: ligneDecalee(t.points, -2.6, cx, cy), d2: ligneDecalee(t.points, 2.6, cx, cy), chemin: ligneDecalee(t.points, 0, cx, cy), l, h });
    setTimeout(() => setEtat('fini'), DUREE_TRACE + 150);
  };

  const style = {
    left: pos ? pos.left : `${def.x * 100}%`, top: pos ? pos.top : `${def.y * 100}%`, aspectRatio: `${vue.largeur} / ${vue.hauteur}`,
    '--gc-sc-k': ((vue.largeur / 60) * (def.taille ?? 1)).toFixed(3),
    ...(def.coupe && etat === 'repos' ? { clipPath: `inset(${def.coupe})` } : {}),
  } as React.CSSProperties;
  return <>
    <div ref={racine} className="gc-scorpion" style={style} data-gc-scorpion={def.id} data-gc-scorpion-etat={etat}>
      <button type="button" className="gc-scorpion__bouton" data-gc-controle="" aria-label="Un scorpion !" tabIndex={actif && tabulable && etat === 'repos' ? 0 : -1}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); fuir(); }}>
        <span ref={corps} className="gc-scorpion__corps" style={{ transform: `rotate(${def.angle}deg)` }}>
          <DessinScorpion vue={def.vue} pose={0} className="gc-scorpion__pose gc-scorpion__pose--0"/>
          {etat === 'fuit' && !reduit && <>
            <DessinScorpion vue={def.vue} pose={1} className="gc-scorpion__pose gc-scorpion__pose--1"/>
            <DessinScorpion vue={def.vue} pose={2} className="gc-scorpion__pose gc-scorpion__pose--2"/>
          </>}
        </span>
      </button>
    </div>
    {trace && <svg className="gc-scorpion__trace" viewBox={`0 0 ${trace.l} ${trace.h}`} aria-hidden="true" focusable="false">
      <defs><mask id={idMasque} maskUnits="userSpaceOnUse" x="0" y="0" width={trace.l} height={trace.h}>
        <path className="gc-scorpion__revele" d={trace.chemin} pathLength="1" fill="none" stroke="#fff" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round"/>
      </mask></defs>
      <g mask={`url(#${idMasque})`} fill="none" stroke="currentColor" strokeLinecap="round">
        <path d={trace.d1} strokeWidth="3" strokeDasharray="0.1 8.5"/>
        <path d={trace.d2} strokeWidth="3" strokeDasharray="0.1 8.5" strokeDashoffset="4.25"/>
      </g>
    </svg>}
  </>;
}

/** Les scorpions d'une page : une couche posée sur la page, qui ne capte rien d'autre que les scorpions. */
export function ScorpionsCaches({ page }: { page: string }) {
  const mode = useRenderMode();
  const defs = React.useMemo(() => SCORPIONS.filter((s) => s.page === page), [page]);
  if (mode !== 'live' || !defs.length) return null;
  return <CoucheScorpions defs={defs}/>;
}
function CoucheScorpions({ defs }: { defs: DefScorpion[] }) {
  const racine = React.useRef<HTMLDivElement>(null);
  const [actif, setActif] = React.useState(false);
  const trouves = useTrouves();
  const tabulable = useTabVu();
  React.useEffect(() => (racine.current ? inscrire({ el: racine.current, actif: setActif }) : undefined), []);
  return <div ref={racine} className="gc-scorpions" data-gc-scorpions-actif={actif ? 'oui' : 'non'} aria-hidden={!actif || undefined}>
    {defs.map((d) => <ScorpionCache key={d.id} def={d} trouve={trouves.includes(d.id)} actif={actif} tabulable={tabulable}/>)}
  </div>;
}

interface PlaceTable { x: number; y: number; base: number }

/** Le scorpion de la table (près de la bougie), le compteur discret et la carte finale. */
export function ScorpionsDeTable() {
  const ecran = useEcran();
  const racine = React.useRef<HTMLDivElement>(null);
  const carte = React.useRef<HTMLElement>(null);
  const compteur = React.useRef<HTMLButtonElement>(null);
  const [actif, setActif] = React.useState(false);
  const [place, setPlace] = React.useState<PlaceTable | null>(null);
  const [ouverte, setOuverte] = React.useState(false);
  const trouves = useTrouves();
  const tabulable = useTabVu();
  const reduit = useNiveauMouvement() !== 'complet';
  const mode = useRenderMode();
  const def = SCORPIONS.find((s) => s.page === 'table');
  const total = SCORPIONS.length;
  const complet = trouves.length === total;

  React.useEffect(() => {
    const el = racine.current;
    if (!el || !ecran?.controles || !def || mode !== 'live') return;
    const placer = () => {
      const root = el.closest('.gc-ecran');
      const cire = root?.querySelector('.gc-bougie__cire')?.getBoundingClientRect();
      if (!root || !cire || !cire.width) { setPlace(null); return; }
      const er = root.getBoundingClientRect();
      const suivant: PlaceTable = {
        x: Math.round(cire.left - er.left + cire.width * (.5 + def.x)), y: Math.round(cire.top - er.top + cire.height * (.5 + def.y)),
        base: Math.round(Math.max(28, Math.min(46, cire.width * .38))),
      };
      setPlace((a) => (a && a.x === suivant.x && a.y === suivant.y && a.base === suivant.base ? a : suivant));
    };
    return inscrire({ el, table: true, actif: setActif, placer });
  }, [ecran?.controles, def, mode]);

  // La carte s'ouvre seule à la dernière trouvaille, puis sur demande (le compteur devient un bouton).
  React.useEffect(() => {
    const ouvrir = () => setOuverte(true);
    window.addEventListener(SCORPIONS_COMPLET_EVENT, ouvrir);
    window.addEventListener(SCORPIONS_CARTE_EVENT, ouvrir);
    return () => { window.removeEventListener(SCORPIONS_COMPLET_EVENT, ouvrir); window.removeEventListener(SCORPIONS_CARTE_EVENT, ouvrir); };
  }, []);
  React.useEffect(() => { if (!complet) setOuverte(false); }, [complet]);
  const fermer = React.useCallback(() => { setOuverte(false); compteur.current?.focus({ preventScroll: true }); }, []);
  React.useEffect(() => {
    if (!ouverte) return;
    const f = requestAnimationFrame(() => carte.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
    const clavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || clavierModalActif()) return;
      e.preventDefault(); e.stopImmediatePropagation(); fermer();
    };
    window.addEventListener('keydown', clavier, true);
    return () => { cancelAnimationFrame(f); window.removeEventListener('keydown', clavier, true); };
  }, [ouverte, fermer]);

  if (!ecran?.controles || mode !== 'live') return null;
  const texte = (s: string) => handText(s, 'cecile');
  const libelle = `Scorpions trouvés : ${trouves.length}/${total}`;
  return createPortal(<div ref={racine} className="gc-scorpions gc-scorpions--table" data-gc-scorpions-actif={actif ? 'oui' : 'non'} style={handStyle('cecile', 'meta', 'brune')}>
    {def && place && <div className="gc-scorpions__table" style={{ '--gc-sc-base': `${place.base}px` } as React.CSSProperties} aria-hidden={!actif || undefined}>
      <ScorpionCache def={def} pos={{ left: place.x, top: place.y }} trouve={trouves.includes(def.id)} actif={actif} tabulable={tabulable}/>
    </div>}
    {trouves.length > 0 && (complet
      ? <button ref={compteur} type="button" className="gc-scorpions__compteur gc-scorpions__compteur--bouton" data-gc-controle="" aria-haspopup="dialog" aria-expanded={ouverte} onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); setOuverte((o) => !o); }}>{texte(libelle)}</button>
      : <p className="gc-scorpions__compteur" role="status" aria-live="polite">{texte(libelle)}</p>)}
    {ouverte && complet && <section ref={carte} className="gc-scorpions__carte" data-gc-scorpions-carte="" data-gc-scorpions-reduit={reduit ? 'oui' : 'non'} role="dialog" aria-label={MESSAGE_SCORPIONS.titre}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
      <button type="button" className="gc-scorpions__fermer" aria-label="Refermer la carte" onClick={fermer}>×</button>
      <DessinScorpion vue="c" pose={0} className="gc-scorpions__sceau"/>
      <h2>{texte(MESSAGE_SCORPIONS.titre)}</h2>
      <p>{texte(MESSAGE_SCORPIONS.texte)}</p>
      <button type="button" className="gc-scorpions__action" onClick={fermer}>{texte(MESSAGE_SCORPIONS.bouton)}</button>
    </section>}
  </div>, ecran.controles);
}
