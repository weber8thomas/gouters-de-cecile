// Planche de choix « Le papier : plutôt neuf ou plutôt ancien ? » : la même double page écrite à la main
// (les sablés de Mamie Rose), même graine, quatre âges du papier, en grille 2 × 2 aussi grande que possible.
//   A : âge 0, presque neuf · B : âge 1, un peu jauni · C : âge 2, jauni · D : âge 3, très ancien.
// Les doubles pages sont au cran « loin » (la géométrie où l'écriture est la plus grande par rapport à
// la page), réduites à 52 % : l'écriture reste lisible et il reste de la place pour les étiquettes.
import React from 'react';
import { DoublePage } from '../../components/DoublePage';
import { Papier } from '../../components/Papier';
import { Ecriture, TitreMain, Annotation } from '../../components/Ecriture';
import { Planche, Choix, Reduction } from '../ChoixEcriture/planche';
import './ChoixPapier.css';

type Age = 0 | 1 | 2 | 3;
const SEED = 811;

/** Le papier ancien couvre toute la feuille, sous la zone de texte de <Page>. */
function Feuille({ side, age }: { side: 'left' | 'right'; age: Age }) {
  return (
    <div className={`gc-cp-feuille gc-cp-feuille--${side}`} aria-hidden="true">
      <Papier seed={SEED} side={side} age={age} />
    </div>
  );
}

function Gauche({ age }: { age: Age }) {
  return (
    <div className="gc-cp-isole">
      <Feuille side="left" age={age} />
      <div className="gc-cp-page">
        <TitreMain hand="mamie" ink="brune" underline="double" seed={SEED}>Les sablés de Rose</TitreMain>
        <Ecriture hand="mamie" ink="brune" role="note" seed={SEED + 1} slant={-1}>Ma recette de toujours !</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 2} souligne="main" className="gc-cp-label">Ingrédients :</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 3} puce="tiret">250 g de farine</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 4} puce="tiret">{'~~150 g~~>125 g de beurre'}</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 5} puce="tiret">100 g de sucre glace</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 6} puce="tiret">1 jaune d’œuf</Ecriture>
      </div>
    </div>
  );
}

function Droite({ age }: { age: Age }) {
  return (
    <div className="gc-cp-isole">
      <Feuille side="right" age={age} />
      <div className="gc-cp-page">
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 10} souligne="main">Préparation :</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 11}>1. Sable beurre et farine.</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 12}>2. Ajoute sucre et jaune.</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 13}>3. Une heure au frais.</Ecriture>
        <Ecriture hand="mamie" ink="brune" role="body" seed={SEED + 16}>4. Four th. 6, 12 minutes.</Ecriture>
        <Annotation text="et une pincée de cannelle !" hand="cecile" ink="crayon" tilt={-4} seed={SEED + 14} className="gc-cp-annotation" />
        <Ecriture hand="mamie" ink="brune" role="signature" seed={SEED + 15} slant={-3} className="gc-cp-signature">Mamie Rose</Ecriture>
      </div>
    </div>
  );
}

/** La double page, au cran « loin », posée en (x, y) à l'échelle S. */
function Livre({ x, y, age, tilt }: { x: number; y: number; age: Age; tilt: number }) {
  return (
    <Reduction x={x} y={y} s={S} w="calc(var(--gc-page-w) * 2)" h="var(--gc-page-h)" distance="loin" tilt={tilt}>
      <div className="gc-cp-livre">
        <DoublePage folios={[14, 15]} left={<Gauche age={age} />} right={<Droite age={age} />} />
      </div>
    </Reduction>
  );
}

// Mise en page (px de scène) : doubles pages de 1500 × 888 au cran loin → 780 × 462 à 52 %.
const S = 0.52;
const X1 = 168;
const X2 = 972;
const Y1 = 128;
const Y2 = 608;

export function ChoixPapier() {
  return (
    <Planche
      table="bois"
      question="Le papier : plutôt neuf ou plutôt ancien ?"
      aide="Répondez A, B, C ou D."
      enLigne
      lumiere={false}
      questionStyle={{ left: 300, top: 12 }}
      questionTilt={-0.5}
    >
      <Livre x={X1} y={Y1} age={0} tilt={-0.4} />
      <Livre x={X2} y={Y1} age={1} tilt={0.3} />
      <Livre x={X1} y={Y2} age={2} tilt={0.25} />
      <Livre x={X2} y={Y2} age={3} tilt={-0.35} />

      <Choix lettre="A" sens="colonne" tilt={-2} style={{ left: 9, top: Y1 + 20, width: 152 }}>Presque neuf</Choix>
      <Choix lettre="B" sens="colonne" tilt={1.6} style={{ left: 1760, top: Y1 + 34, width: 156 }}>Un peu jauni</Choix>
      <Choix lettre="C" sens="colonne" tilt={1.2} style={{ left: 6, top: Y2 + 30, width: 156 }}>Jauni</Choix>
      <Choix lettre="D" sens="colonne" tilt={-1.5} style={{ left: 1758, top: Y2 + 18, width: 156 }}>Très ancien</Choix>
    </Planche>
  );
}

export default ChoixPapier;
