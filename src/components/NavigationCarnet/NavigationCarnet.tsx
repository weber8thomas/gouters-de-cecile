import React from 'react';
import { createPortal } from 'react-dom';
import { useEcran } from '../Ecran';
import { useClavierModal, clavierModalActif } from '../../lib/clavier';
import { assetInfo, cssUrl } from '../../lib/assets';
import type { SpreadSpec } from '../../lib/spread';
import { extraitRecherche, indexerCarnet, rechercherCarnet } from './recherche';
import './NavigationCarnet.css';

export interface NavigationCarnetProps {
  spreads: SpreadSpec[];
  onAller: (index: number) => void;
}
function Icone({ recherche = false }: { recherche?: boolean }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {recherche ? <><path d="M21 20 28 27M23 13a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/><path d="M8 12c.4-2.5 2.4-4.3 5-4.5"/></>
      : <><path d="M5 5.5c4-1 7-.4 11 2 4-2.4 7-3 11-2v20c-4-1-7-.3-11 2-4-2.3-7-3-11-2Z M16 7.5v20"/><path d="m8 11 5 1m-5 4 5 1m6-5 5-1m-5 6 5-1"/></>}
  </svg>;
}
/** Deux signets toujours accessibles au clavier ; la recherche reste hors de la loupe du livre. */
export function NavigationCarnet({ spreads, onAller }: NavigationCarnetProps) {
  const ecran = useEcran();
  const [ouvert, setOuvert] = React.useState(false);
  const [requete, setRequete] = React.useState('');
  const panneau = React.useRef<HTMLDivElement>(null), champ = React.useRef<HTMLInputElement>(null);
  const retour = React.useRef<HTMLElement | null>(null);
  const rendreFocus = React.useRef(false);
  const bouton = React.useRef<HTMLButtonElement>(null);
  const id = React.useId();
  const sommaire = spreads.findIndex(s => s.kind === 'sommaire' || s.id === 'sommaire');
  const index = React.useMemo(() => indexerCarnet(spreads), [spreads]);
  const resultats = React.useMemo(() => rechercherCarnet(index, requete), [index, requete]);
  const fermer = React.useCallback(() => {
    rendreFocus.current = true;
    setOuvert(false);
  }, []);
  const ouvrir = React.useCallback(() => {
    retour.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : bouton.current;
    setOuvert(true);
  }, []);
  const choisir = (i: number) => { fermer(); onAller(i); };
  React.useLayoutEffect(() => {
    if (ouvert) champ.current?.focus({ preventScroll: true });
    else if (rendreFocus.current) {
      rendreFocus.current = false;
      (retour.current?.isConnected ? retour.current : bouton.current)?.focus({ preventScroll: true });
    }
  }, [ouvert]);
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || clavierModalActif()) return;
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable || t?.closest('input,textarea,select')) return;
      if (e.key === '/') { e.preventDefault(); ouvrir(); }
      else if (e.key.toLowerCase() === 't' && sommaire >= 0) { e.preventDefault(); onAller(sommaire); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [ouvrir, onAller, sommaire]);
  useClavierModal(ouvert, (e) => {
    const p = panneau.current;
    if (!p) return false;
    if (e.key === 'Escape') { fermer(); return true; }
    if (e.key === 'Tab') {
      const items = Array.from(p.querySelectorAll<HTMLElement>('button,input')).filter(el => !el.hasAttribute('disabled'));
      const a = items.indexOf(document.activeElement as HTMLElement);
      items[(a + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      return true;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = Array.from(p.querySelectorAll<HTMLButtonElement>('[data-gc-resultat]'));
      const a = items.indexOf(document.activeElement as HTMLButtonElement);
      const suivant = a < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : (a + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[suivant]?.focus();
      return true;
    }
    if (e.key === 'Enter' && document.activeElement === champ.current && resultats[0]) { choisir(resultats[0].index); return true; }
    return false;
  });
  const style = assetInfo('paper/base') ? { '--gc-recherche-papier': cssUrl('paper/base') } as React.CSSProperties : undefined;
  const contenu = <div className="gc-navigation-carnet">
    <nav className="gc-navigation-carnet__signets" aria-label="Retrouver une page" data-gc-effacable>
      {sommaire >= 0 && <button type="button" data-gc-controle="sommaire" aria-label="Aller au sommaire" aria-keyshortcuts="T" title="Sommaire (T)" onClick={() => onAller(sommaire)}><Icone/><span>Sommaire</span></button>}
      <button ref={bouton} type="button" data-gc-controle="recherche" aria-label="Rechercher une recette" aria-keyshortcuts="/" aria-haspopup="dialog" aria-expanded={ouvert} aria-controls={id} title="Rechercher (/)" onClick={ouvrir}><Icone recherche/><span>Rechercher</span></button>
    </nav>
    {ouvert && <div className="gc-navigation-carnet__voile">
      <button className="gc-navigation-carnet__fond" tabIndex={-1} type="button" aria-label="Fermer la recherche" onClick={fermer}/>
      <div ref={panneau} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-titre`} className="gc-navigation-carnet__fiche" style={style} data-gc-recherche>
        <header><h2 id={`${id}-titre`}>Retrouver une recette</h2><button type="button" className="gc-navigation-carnet__fermer" aria-label="Fermer la recherche" onClick={fermer}>×</button></header>
        <label htmlFor={`${id}-champ`}>Un nom, une recette ou un ingrédient</label>
        <input ref={champ} id={`${id}-champ`} type="search" value={requete} placeholder="Lisa, chocolat, cannelle…" autoComplete="off" spellCheck={false} enterKeyHint="search" onChange={e => setRequete(e.target.value)}/>
        <p className="gc-navigation-carnet__compte" role="status">{resultats.length ? `${resultats.length} recette${resultats.length > 1 ? 's' : ''}` : 'Aucune recette trouvée. Essayez un autre mot.'}</p>
        <ol className="gc-navigation-carnet__resultats" aria-label="Recettes trouvées">
          {resultats.map(r => <li key={r.id}><button type="button" data-gc-resultat={r.id} onClick={() => choisir(r.index)}>
            <span className="gc-navigation-carnet__titre">{r.titre}</span>
            <span className="gc-navigation-carnet__auteur">{r.auteurs}{r.folio != null ? ` · page ${r.folio}` : ''}</span>
            {requete.trim() && <span className="gc-navigation-carnet__extrait">{extraitRecherche(r, requete)}</span>}
          </button></li>)}
        </ol>
        <p className="gc-navigation-carnet__aide">↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour revenir</p>
      </div>
    </div>}
  </div>;
  return ecran?.controles ? createPortal(contenu, ecran.controles) : contenu;
}
