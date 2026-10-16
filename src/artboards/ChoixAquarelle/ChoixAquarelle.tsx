// Planche de choix « Les dessins au crayon et à l'aquarelle : quelle intensité ? » : trois colonnes, les
// mêmes dessins au même cadrage, sur la même feuille de papier ancien :
//   A : plus léger (surtout le crayon, une touche de couleur) — images re-cuites, choix/leger/… ;
//   B : comme maintenant — les images cuites actuelles ;
//   C : plus de couleur — images re-cuites, choix/intense/….
// Chaque colonne : la part de cake au citron, Julie en buste et la cloche avant lecture (scène sépia).
// Les variantes sont cuites par scripts/bake-choix.mjs (mêmes dessins, autres réglages de lavis et de crayon).
import React from 'react';
import { Papier } from '../../components/Papier';
import { assetUrl } from '../../lib/assets';
import { ECRINS } from '../../generated/ecrins.gen';
import { Planche, Choix, type Vars } from '../ChoixEcriture/planche';
import './ChoixAquarelle.css';

/** Préfixe des images cuites d'une colonne : '' = les images actuelles. */
type Cuisson = '' | 'choix/leger/' | 'choix/intense/';
const SEED = 2207;

/** La cloche cuite, avant lecture : calques empilés au même cadrage, scène sépia masquée par mask-soft. */
function Cloche({ cuisson }: { cuisson: Cuisson }) {
  const man = ECRINS.cloche.manifest;
  const [W, H] = man.viewBox;
  const a = man.aperture as { cx: number; cy: number; r: number };
  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  const calque = (part: string, style?: React.CSSProperties) => (
    <img className="gc-ca-calque" src={assetUrl(`${cuisson}ecrins/cloche/a/${part}`)} alt="" style={style} draggable={false} />
  );
  return (
    <div className="gc-ca-cloche" style={{ aspectRatio: `${W} / ${H}` }}>
      {calque('back')}
      {calque('domeBack')}
      {/* le masque ne dépend pas de l'intensité : toujours l'original */}
      <div className="gc-ca-media" style={{ '--gc-ca-masque': `url("${assetUrl('ecrins/cloche/a/mask-soft')}")` } as Vars}>
        <div className="gc-ca-ouverture" style={{ left: pct(a.cx - a.r, W), top: pct(a.cy - a.r, H), width: pct(2 * a.r, W), height: pct(2 * a.r, H) }}>
          <img className="gc-ca-scene" src={assetUrl(`${cuisson}scenes/julie/sepia`)} alt="" draggable={false} />
        </div>
      </div>
      {calque('front')}
      {calque('dome')}
      {calque('glint', { opacity: 0.6 })}
    </div>
  );
}

/** Une feuille de papier ancien avec les trois dessins, au même cadrage dans chaque colonne. */
function Feuille({ cuisson }: { cuisson: Cuisson }) {
  return (
    <div className="gc-ca-feuille">
      <Papier seed={SEED} side="right" age={1} keepOut={[]} foxing={0.6}>
        <div className="gc-ca-dessins">
          <div className="gc-ca-place gc-ca-place--cloche">
            <Cloche cuisson={cuisson} />
          </div>
          <img className="gc-ca-place gc-ca-place--julie" src={assetUrl(`${cuisson}illustrations/portraits/julie`)} alt="" draggable={false} />
          <img className="gc-ca-place gc-ca-place--cake" src={assetUrl(`${cuisson}illustrations/essai/cake-citron`)} alt="" draggable={false} />
        </div>
      </Papier>
    </div>
  );
}

const COLONNES: { lettre: string; cuisson: Cuisson; phrase: string; x: number; tilt: number; tiltTag: number }[] = [
  { lettre: 'A', cuisson: 'choix/leger/', phrase: 'Plus léger : surtout le crayon, une touche de couleur', x: 40, tilt: -0.5, tiltTag: -1.2 },
  { lettre: 'B', cuisson: '', phrase: 'Comme maintenant', x: 668, tilt: 0.35, tiltTag: 0.8 },
  { lettre: 'C', cuisson: 'choix/intense/', phrase: 'Plus de couleur', x: 1296, tilt: -0.3, tiltTag: -0.6 },
];

export function ChoixAquarelle() {
  return (
    <Planche
      table="bois"
      question="Les dessins au crayon et à l’aquarelle : quelle intensité ?"
      aide="Répondez A, B ou C."
      enLigne
      lumiere={false}
      questionStyle={{ left: 170, top: 14 }}
      questionTilt={-0.4}
    >
      {COLONNES.map((c) => (
        <React.Fragment key={c.lettre}>
          <div className="gc-ca-colonne" style={{ left: c.x, '--gc-choix-tilt': `${c.tilt}deg` } as Vars}>
            <Feuille cuisson={c.cuisson} />
          </div>
          <Choix lettre={c.lettre} tilt={c.tiltTag} className="gc-ca-option" style={{ left: c.x + 18 }}>{c.phrase}</Choix>
        </React.Fragment>
      ))}
    </Planche>
  );
}

export default ChoixAquarelle;
