// Planche de choix « La vitesse des pages qui tournent » : un carnet ouvert qui tourne ses pages tout
// seul (une toutes les ~3,5 s, jusqu'au bout puis en revenant), en changeant de réglage à chaque page :
//   A : vif (0,6 s, petit rebond) · B : comme maintenant (design-system/motion.json) · C : lent et lourd (1,3 s).
// Une grande étiquette posée sur la table, en haut à gauche, dit le réglage en cours.
// Touches 1 / 2 / 3 : garder A / B / C (la lecture continue avec ce seul réglage) ; 0 : reprendre l'alternance.
// Le ressort du papier est réglé par regleRessort (src/lib/motion.ts) avant chaque page, puis remis à sa
// valeur d'origine au démontage. Les doubles pages sont propres à cette planche.
import React from 'react';
import { Livre, CameraProvider } from '../../components/Livre';
import { Papier } from '../../components/Papier';
import { Ecriture, TitreMain, Annotation } from '../../components/Ecriture';
import { assetUrl } from '../../lib/assets';
import { regleRessort } from '../../lib/motion';
import type { SpreadSpec } from '../../lib/spread';
import motionSpec from '../../../design-system/motion.json';
import { Etiquette, Pastille } from '../ChoixEcriture/planche';
import './ChoixMouvement.css';

// ---- Les réglages comparés ------------------------------------------------------------------

const ORIGINE = { visualDuration: motionSpec.springs.paper.visualDuration, bounce: motionSpec.springs.paper.bounce };
export const REGLAGES = [
  { lettre: 'A', nom: 'Vif', ressort: { visualDuration: 0.6, bounce: 0.1 } },
  { lettre: 'B', nom: 'Comme maintenant', ressort: ORIGINE },
  { lettre: 'C', nom: 'Lent et lourd', ressort: { visualDuration: 1.3, bounce: 0 } },
];
/** Une page toutes les ~3,5 s (du début d'un tour au début du suivant). */
const PERIODE = 3500;
/** Pause minimale après l'atterrissage (rastérisation logicielle lente : la période s'allonge). */
const PAUSE_MIN = 400;
/** Premier tour, peu après l'ouverture de la carte : ça bouge tout de suite. */
const PREMIER = 900;
/** Filet de sécurité : si un tour n'atterrit jamais, on relance quand même. */
const SECOURS = PERIODE + 8000;

// ---- Les doubles pages ----------------------------------------------------------------------

/** Le papier ancien couvre toute la feuille, sous la zone de texte de <Page>. */
function Feuille({ side, seed, age }: { side: 'left' | 'right'; seed: number; age: 1 | 2 }) {
  return (
    <div className={`gc-cm-feuille gc-cm-feuille--${side}`} aria-hidden="true">
      <Papier seed={seed} side={side} age={age} />
    </div>
  );
}

function PageMain({ side, seed, age = 1, children }: { side: 'left' | 'right'; seed: number; age?: 1 | 2; children: React.ReactNode }) {
  return (
    <div className="gc-cm-isole">
      <Feuille side={side} seed={seed} age={age} />
      <div className="gc-cm-page">{children}</div>
    </div>
  );
}

const CAKE: SpreadSpec = {
  id: 'choix-cake', kind: 'recette', table: 'bois', folios: [2, 3], seed: 1301,
  render: () => ({
    left: (
      <PageMain side="left" seed={1301}>
        <TitreMain hand="soignee" ink="bic" underline="regle" underlineInk="rouge" seed={1301} slant={-0.7}>Le cake citron de Julie</TitreMain>
        <img className="gc-cm-illu" src={assetUrl('illustrations/essai/cake-citron')} alt="" draggable={false} />
        <Ecriture hand="cecile" ink="crayon" role="annotation" seed={1302} slant={-2} className="gc-cm-legende">testé le 3 mars, un régal</Ecriture>
      </PageMain>
    ),
    right: (
      <PageMain side="right" seed={1301}>
        <Ecriture hand="soignee" ink="bic" role="body" seed={1303} souligne="main">Ingrédients :</Ecriture>
        {['3 œufs', '150 g de sucre', '2 citrons non traités', '180 g de farine', '125 g de beurre fondu'].map((s, i) => (
          <Ecriture key={i} hand="soignee" ink="bic" role="body" seed={1310 + i} puce="tiret" drift={1}>{s}</Ecriture>
        ))}
        <Ecriture hand="soignee" ink="bic" role="signature" seed={1304} slant={-2} className="gc-cm-signature">Julie</Ecriture>
      </PageMain>
    ),
  }),
};

const JULIE: SpreadSpec = {
  id: 'choix-julie', kind: 'video', table: 'bois', folios: [4, 5], seed: 1321,
  render: () => ({
    left: (
      <PageMain side="left" seed={1321} age={2}>
        <img className="gc-cm-portrait" src={assetUrl('illustrations/portraits/julie')} alt="" draggable={false} />
        <Ecriture hand="cecile" ink="crayon" role="meta" seed={1322} slant={-2} className="gc-cm-legende">Julie, depuis Lyon</Ecriture>
      </PageMain>
    ),
    right: (
      <PageMain side="right" seed={1321} age={2}>
        <Ecriture hand="soignee" ink="bic" role="note" seed={1323} slant={-0.8} className="gc-cm-mot">Pour toutes nos pauses goûter à refaire le monde. Joyeux anniversaire ma Cécile !</Ecriture>
        <Ecriture hand="soignee" ink="bic" role="signature" seed={1324} slant={-2} className="gc-cm-signature">Julie</Ecriture>
      </PageMain>
    ),
  }),
};

const ROSE: SpreadSpec = {
  id: 'choix-rose', kind: 'recette', table: 'bois', folios: [6, 7], seed: 1341,
  render: () => ({
    left: (
      <PageMain side="left" seed={1341}>
        <TitreMain hand="mamie" ink="brune" underline="double" seed={1341}>Les sablés de Rose</TitreMain>
        <Ecriture hand="mamie" ink="brune" role="note" seed={1342} slant={-1}>Ma recette de toujours !</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={1343} puce="tiret">250 g de farine</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={1344} puce="tiret">{'~~150 g~~>125 g de beurre'}</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={1345} puce="tiret">100 g de sucre glace</Ecriture>
      </PageMain>
    ),
    right: (
      <PageMain side="right" seed={1341}>
        <Ecriture hand="mamie" ink="brune" role="body" seed={1346}>1. Sable beurre et farine.</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={1347}>2. Ajoute sucre et jaune.</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={1348}>3. Four th. 6, 12 minutes.</Ecriture>
        <Annotation text="et une pincée de cannelle !" hand="cecile" ink="crayon" tilt={-4} seed={1349} className="gc-cm-annotation" />
        <Ecriture hand="mamie" ink="brune" role="signature" seed={1350} slant={-3} className="gc-cm-signature">Mamie Rose</Ecriture>
      </PageMain>
    ),
  }),
};

const GOUTER: SpreadSpec = {
  id: 'choix-gouter', kind: 'finale', table: 'bois', folios: [8, 9], seed: 1361,
  render: () => ({
    left: (
      <PageMain side="left" seed={1361} age={2}>
        <figure className="gc-cm-photo">
          <img src={assetUrl('scenes/julie/couleur')} alt="" draggable={false} />
        </figure>
        <Ecriture hand="cecile" ink="crayon" role="meta" seed={1362} slant={-2} className="gc-cm-legende">le goûter chez Julie</Ecriture>
      </PageMain>
    ),
    right: (
      <PageMain side="right" seed={1361} age={2}>
        <Ecriture hand="cecile" ink="crayon" role="title" seed={1363} slant={-1.2}>Joyeux anniversaire Cécile !</Ecriture>
        <Ecriture hand="cecile" ink="crayon" role="note" seed={1364} slant={-1}>Et maintenant, on retourne au début…</Ecriture>
      </PageMain>
    ),
  }),
};

/** Liste stable (mêmes objets à chaque rendu). */
const SPREADS: SpreadSpec[] = [CAKE, JULIE, ROSE, GOUTER];
const N = SPREADS.length;

// ---- La planche -----------------------------------------------------------------------------

export function ChoixMouvement() {
  const [index, setIndex] = React.useState(0);
  const [reglage, setReglage] = React.useState(0);
  const [fige, setFige] = React.useState<number | null>(null);
  const fige$ = React.useRef<number | null>(null);
  fige$.current = fige;
  // État de la lecture automatique, hors React : aucun rendu pendant un geste.
  // dernier : réglage du dernier tour (le suivant, en alternance, est dernier + 1).
  const lecture = React.useRef({ index: 0, sens: 1 as 1 | -1, dernier: -1, depart: 0, minuteur: 0 });

  const programmer = React.useRef<(ms: number) => void>(() => {});
  const tourner = React.useCallback(() => {
    const L = lecture.current;
    const r = fige$.current ?? (L.dernier + 1) % REGLAGES.length;
    L.dernier = r;
    regleRessort('paper', REGLAGES[r].ressort); // relu par le livre au lancement du ressort
    let next = L.index + L.sens;
    if (next < 0 || next >= N) {
      L.sens = L.sens === 1 ? -1 : 1;
      next = L.index + L.sens;
    }
    L.index = next;
    L.depart = performance.now();
    setReglage(r);
    setIndex(next);
    programmer.current(SECOURS);
  }, []);
  programmer.current = (ms: number) => {
    window.clearTimeout(lecture.current.minuteur);
    lecture.current.minuteur = window.setTimeout(tourner, ms);
  };

  React.useEffect(() => {
    const L = lecture.current;
    regleRessort('paper', REGLAGES[0].ressort);
    programmer.current(PREMIER);
    return () => {
      window.clearTimeout(L.minuteur);
      regleRessort('paper', ORIGINE);
    };
  }, []);

  // Atterrissage : la double page atteinte devient l'index (écho ignoré par le livre), puis tour suivant.
  const atterri = React.useCallback((i: number) => {
    const L = lecture.current;
    L.index = i;
    setIndex(i);
    programmer.current(Math.max(PAUSE_MIN, PERIODE - (performance.now() - L.depart)));
  }, []);

  // Touches 1 / 2 / 3 : garder un réglage ; 0 : reprendre l'alternance.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const k = ['1', '2', '3'].indexOf(e.key);
      if (k >= 0) {
        e.preventDefault();
        lecture.current.dernier = k; // en reprenant l'alternance, on repart du suivant
        regleRessort('paper', REGLAGES[k].ressort);
        setFige(k);
        setReglage(k);
      } else if (e.key === '0') {
        e.preventDefault();
        setFige(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Le livre ne se rend que quand l'index change (jamais à cause de l'étiquette).
  const livre = React.useMemo(() => (
    <CameraProvider fixed={{ distance: 'loin', zoom: 0.95 }} persist={false}>
      <Livre spreads={SPREADS} index={index} onIndexChange={atterri} />
    </CameraProvider>
  ), [index, atterri]);

  const R = REGLAGES[reglage];
  return (
    <div className="gc-cm">
      {livre}
      <Etiquette tilt={-0.5} className="gc-choix-question gc-choix-question--ligne gc-cm-question">
        <p className="gc-hand-signature gc-choix-question__texte">La vitesse des pages qui tournent</p>
        <p className="gc-hand-caption gc-choix-question__aide">Répondez A, B ou C.</p>
      </Etiquette>
      <Etiquette tilt={-1.6} className="gc-cm-etiquette">
        <p className="gc-hand-caption gc-cm-etiquette__titre">en ce moment</p>
        <Pastille lettre={R.lettre} grande />
        <p className="gc-hand-note gc-cm-etiquette__nom" aria-live="polite">
          <span className="gc-choix-sr">{`Réglage ${R.lettre} : `}</span>
          {R.nom}
        </p>
        <p className="gc-hand-caption gc-cm-etiquette__etat">{fige != null ? 'gardé' : `puis ${REGLAGES[(reglage + 1) % REGLAGES.length].lettre}`}</p>
      </Etiquette>
      <Etiquette tilt={0.6} className="gc-cm-touches">
        <p className="gc-hand-caption">Touches 1, 2, 3 : garder A, B ou C · 0 : les alterner</p>
      </Etiquette>
    </div>
  );
}

export default ChoixMouvement;
