// Planche de choix « L'écriture d'Antoine » : sa main « pressée » (cursive penchée, très grande) ne fait
// pas tenir une recette entière sur une page. On montre la même page recette trois fois, sur papier ancien :
//   Aujourd'hui (petit, à part) : tout dans sa main → ça déborde ;
//   A : la recette dans une main soignée, son petit mot et sa signature dans sa main à lui ;
//   B : tout dans la main soignée.
// La recette d'Antoine n'existe pas encore dans le contenu : elle est écrite ici (budget d'une page vidéo).
import React from 'react';
import { Papier } from '../../components/Papier';
import { Page } from '../../components/Page';
import { Ecriture, TitreMain } from '../../components/Ecriture';
import type { HandId } from '../../lib/hands';
import { Planche, Choix, Etiquette, Reduction } from './planche';
import './ChoixEcriture.css';

const SEED = 3301;
const RECETTE = {
  titre: 'Le gâteau au yaourt d’Antoine',
  meta: 'Prép. 10 min · cuisson 35 min · 8 parts',
  ingredients: ['1 pot de yaourt nature', '2 pots de sucre', '3 pots de farine', '3 œufs', '½ pot d’huile', '1 sachet de levure'],
  etapes: ['Four à 180 °C (th. 6).', 'Mélange yaourt, sucre et œufs.', 'Ajoute farine, levure, puis l’huile.', 'Moule beurré, 35 min au four.'],
  mot: 'Le gâteau de nos mercredis. Bon anniversaire Cécile !',
  signature: 'Antoine',
};
const pente = (i: number) => -0.7 + [0.2, -0.25, 0.05, 0.3, -0.1, -0.3, 0.15, 0, 0.25, -0.2][i % 10];

/** La page recette d'Antoine, écrite dans `recette` (titre, ingrédients, étapes) et `mot` (petit mot, signature). */
function RecetteAntoine({ recette, mot }: { recette: HandId; mot: HandId }) {
  const large = recette === 'pressee';
  return (
    <div className={`gc-ce-recette${large ? ' gc-ce-recette--large' : ''}`}>
      <TitreMain hand={recette} ink="bic" underline="regle" underlineInk="rouge" seed={SEED} slant={-0.8}>{RECETTE.titre}</TitreMain>
      <Ecriture hand={recette} ink="bic" role="meta" seed={SEED + 1} slant={-0.4}>{RECETTE.meta}</Ecriture>
      <Ecriture hand={recette} ink="bic" role="body" seed={SEED + 2} souligne="main" className="gc-ce-label">Ingrédients :</Ecriture>
      <ul className="gc-ce-ingredients">
        {RECETTE.ingredients.map((s, i) => (
          <Ecriture key={i} as="li" hand={recette} ink="bic" role="body" seed={SEED + 10 + i} slant={pente(i)} drift={1} puce="tiret">{s}</Ecriture>
        ))}
      </ul>
      <Ecriture hand={recette} ink="bic" role="body" seed={SEED + 3} souligne="main" className="gc-ce-label">Préparation :</Ecriture>
      <ol className="gc-ce-etapes">
        {RECETTE.etapes.map((s, i) => (
          <li key={i} className="gc-ce-etape">
            <Ecriture as="span" hand={recette} ink="bic" role="body" seed={SEED + 30 + i}>{`${i + 1})`}</Ecriture>
            <Ecriture as="span" hand={recette} ink="bic" role="body" seed={SEED + 20 + i} slant={pente(i + 3)}>{s}</Ecriture>
          </li>
        ))}
      </ol>
      <div className="gc-ce-mot">
        <Ecriture hand={mot} ink="bic" role="note" seed={SEED + 50} slant={-0.8}>{RECETTE.mot}</Ecriture>
        <Ecriture hand={mot} ink="bic" role="signature" seed={SEED + 51} slant={-1.5} className="gc-ce-signature">{RECETTE.signature}</Ecriture>
      </div>
    </div>
  );
}

/** Une feuille de papier ancien libre (page de droite d'une double page), posée sur la nappe. */
function Feuille({ children }: { children: React.ReactNode }) {
  return (
    <div className="gc-ce-feuille">
      <Papier seed={SEED} side="right" age={2}>{children}</Papier>
    </div>
  );
}

/** Page qui tient : la boîte <Page> garde l'œil sur le débordement (data-gc-fit). */
function PageQuiTient({ recette, mot }: { recette: HandId; mot: HandId }) {
  return (
    <Feuille>
      <Page side="right">
        <RecetteAntoine recette={recette} mot={mot} />
      </Page>
    </Feuille>
  );
}

/** Aujourd'hui : tout dans la main d'Antoine. La page déborde : le texte sort par le bas de la feuille. */
function PageQuiDeborde() {
  return (
    <div className="gc-ce-deborde">
      <Feuille>
        <div className="gc-ce-zone">
          <RecetteAntoine recette="pressee" mot="pressee" />
        </div>
      </Feuille>
    </div>
  );
}

// Mise en page (px de scène, 1920 × 1080).
const S_AUJ = 0.42; // « aujourd'hui », petit, à part
const S_OPT = 0.73; // les options A et B
const X_A = 548;
const X_B = 1234;
const Y_OPT = 248;

export function ChoixEcriture() {
  return (
    <Planche
      table="nappe"
      distance="moyenne"
      question="L’écriture d’Antoine"
      detail="Il écrit vite, penché et très grand : toute sa recette n’entre pas sur une page. Que fait-on ?"
      aide="Répondez simplement A ou B."
      questionStyle={{ left: 40, top: 30, width: 450 }}
      questionTilt={-1.2}
    >
      {/* Aujourd'hui */}
      <Etiquette tilt={1.4} className="gc-ce-aujourdhui" style={{ left: 70, top: 470 }}>
        <p className="gc-section-label gc-ce-aujourdhui__titre">Aujourd’hui</p>
        <p className="gc-hand-caption gc-ce-aujourdhui__note">ça déborde de la page !</p>
      </Etiquette>
      <Reduction x={96} y={590} s={S_AUJ} w="var(--gc-page-w)" h="var(--gc-page-h)" tilt={-1.6}>
        <PageQuiDeborde />
      </Reduction>

      {/* Les deux options */}
      <Choix lettre="A" tilt={-0.8} style={{ left: X_A - 4, top: 30, width: 632 }}>
        Son écriture seulement pour son petit mot et sa signature
      </Choix>
      <Reduction x={X_A} y={Y_OPT} s={S_OPT} w="var(--gc-page-w)" h="var(--gc-page-h)" tilt={-0.5}>
        <PageQuiTient recette="soignee" mot="pressee" />
      </Reduction>

      <Choix lettre="B" tilt={0.7} style={{ left: X_B + 6, top: 44, width: 612 }}>
        On abandonne cette écriture
      </Choix>
      <Reduction x={X_B} y={Y_OPT} s={S_OPT} w="var(--gc-page-w)" h="var(--gc-page-h)" tilt={0.6}>
        <PageQuiTient recette="soignee" mot="soignee" />
      </Reduction>
    </Planche>
  );
}

export default ChoixEcriture;
