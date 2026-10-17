import React from 'react';
import { useReducedMotion } from '../../lib/motion';
import { assetInfo, assetUrl } from '../../lib/assets';
import { useRenderMode } from '../../lib/spread';
import { animer, webglOk } from './vivante';
import { EFFETS } from './effets';
import './Aquarelle.css';

export interface AquarelleProps {
  /** Nom de l'aquarelle cuite (design-system/baked/aquarelles/<nom>.webp). */
  nom: string;
  /** Sans WebGL seulement (animation CSS) : « fleurit » (défaut) : la couleur s'étale à l'arrivée sur la
   *  page ; « vapeur » : deux volutes montent en boucle ; « balance » : elle oscille ; « fixe » : rien. */
  anime?: string;
  /** Inclinaison (degrés). */
  angle?: number;
  /** Rang sur la page : les aquarelles se peignent l'une après l'autre. */
  ordre?: number;
  /** Page du livre où elle est posée : elle se peint une fois par page et par visite. */
  page?: string;
}

// Les aquarelles déjà peintes (une fois par page et par visite), partagées par toutes les copies d'une page
// (page vivante, feuillet qui tourne, loupe) : tant qu'elle n'est pas peinte, aucune copie ne la montre.
const peintes = new Set<string>();
const abonnes = new Set<() => void>();
let version = 0;
const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};
const lireVersion = () => version;
function marquer(cle: string) {
  if (peintes.has(cle)) return;
  peintes.add(cle);
  version++;
  abonnes.forEach((f) => f());
}

// Une aquarelle posée sur la page, dans une zone vivante réservée à la cuisson (aucune encre dessous). Elle
// se mêle au papier par multiplication, comme de la couleur sur une feuille.
//
// Avec WebGL (vivante.ts), sur la page vivante du livre : à la première arrivée sur la page, elle se peint
// toute seule, puis elle vit selon son sujet (effets.ts : vapeur, flamme, vent, reflet). Elle ne s'anime que
// page visible et livre posé. Sans WebGL : l'ancienne floraison en CSS (opacité et transformation).
// Moins d'animations (système ou réglage) : l'aquarelle est posée telle quelle.
export function Aquarelle({ nom, anime = 'fleurit', angle = 0, ordre = 0, page }: AquarelleProps) {
  const reduit = useReducedMotion(); // système ou réglage du carnet
  const mode = useRenderMode();
  React.useSyncExternalStore(abonner, lireVersion, lireVersion);
  const src = assetUrl(`aquarelles/${nom}`);
  const cle = `${page ?? ''}/${nom}`;
  const gl = !reduit && typeof document !== 'undefined' && webglOk();
  const [etat, setEtat] = React.useState<'attente' | 'gl' | 'image'>('attente');
  const aPeindre = gl && !!page && etat !== 'image' && !peintes.has(cle);
  const toile = React.useRef<HTMLCanvasElement>(null);
  const vivanteIci = gl && mode === 'live';

  React.useEffect(() => {
    const cv = toile.current;
    if (!vivanteIci || !cv) return;
    const feuille = cv.closest('.gc-livre__page');
    const livre = cv.closest('.gc-livre');
    if (!feuille || !livre) {
      setEtat('image'); // hors du livre : l'image fixe
      return;
    }
    // le canvas à la taille où il est vu (livre zoomé, écran dense), sans excès
    const r = cv.getBoundingClientRect();
    const k = Math.max(1, r.width / Math.max(1, cv.offsetWidth)) * Math.min(2, window.devicePixelRatio || 1);
    const s = Math.min(1, 1100 / Math.max(cv.offsetWidth * k, cv.offsetHeight * k));
    cv.width = Math.round(cv.offsetWidth * k * s);
    cv.height = Math.round(cv.offsetHeight * k * s);
    // avec sa carte du tracé, elle se dessine trait à trait (≈ 7 s), puis se colore (≈ 5 s)
    const trace = assetInfo(`aquarelles/trace/${nom}`) ? assetUrl(`aquarelles/trace/${nom}`) : undefined;
    const v = animer(cv, src, EFFETS[nom] ?? {}, {
      peindre: page && !peintes.has(cle) ? (trace ? 12000 : 3600) : 0,
      trace,
      delai: 650 + ordre * 450,
      peinte: () => marquer(cle),
      echec: () => {
        setEtat('image');
        marquer(cle);
      },
      pret: () => setEtat('gl'),
    });
    const verifier = () => {
      const visible = feuille.classList.contains('gc-livre__page--visible');
      const pose = !livre.hasAttribute('data-gc-geste') && livre.getAttribute('data-gc-etat') === 'ouvert';
      v.jouer(visible && pose);
    };
    const obs = new MutationObserver(verifier);
    obs.observe(feuille, { attributes: true, attributeFilter: ['class'] });
    obs.observe(livre, { attributes: true, attributeFilter: ['data-gc-geste', 'data-gc-etat'] });
    verifier();
    return () => {
      obs.disconnect();
      v.arreter();
      setEtat((e) => (e === 'gl' ? 'attente' : e)); // une nouvelle toile devra se préparer
    };
    // l'aquarelle d'une zone ne change pas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vivanteIci, nom, src]);

  const style = {
    '--gc-aq-angle': `${angle}deg`,
    '--gc-aq-delai': `${(0.45 + ordre * 0.3).toFixed(2)}s`,
  } as React.CSSProperties;
  const animCss = reduit || gl ? 'fixe' : anime;
  const cls = ['gc-aquarelle', `gc-aquarelle--${animCss}`].join(' ');
  // cachée tant qu'elle n'est pas peinte ; la toile remplace l'image dès qu'elle est prête
  const vue = vivanteIci && etat === 'gl' ? 'toile' : aPeindre ? 'cachee' : undefined;
  return (
    <div className={cls} style={style} aria-hidden="true" data-gc-aquarelle={nom} data-gc-aq={vue}>
      {animCss !== 'fixe' && <img className="gc-aquarelle__mouille" src={src} alt="" draggable={false} decoding="async" />}
      <img className="gc-aquarelle__seche" src={src} alt="" draggable={false} decoding="async" />
      {animCss === 'vapeur' && (
        <>
          <span className="gc-aquarelle__volute" />
          <span className="gc-aquarelle__volute gc-aquarelle__volute--2" />
        </>
      )}
      {vivanteIci && etat !== 'image' && <canvas ref={toile} className="gc-aquarelle__toile" />}
    </div>
  );
}

export default Aquarelle;
