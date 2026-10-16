// Spécimen « livre de grand-mère » : la double page de Julie, assemblée avec les pièces de la phase S
// (papier ancien, écriture de Julie, cloche cuite au crayon + aquarelle) à un cran de distance donné.
// Les composants définitifs (RecetteMain, Ecrin à calques cuits, Livre) viendront en phase B ;
// ce gabarit sert à juger la direction.
import React from 'react';
import { Stage } from '../../components/Stage';
import { DoublePage } from '../../components/DoublePage';
import { Papier } from '../../components/Papier';
import { Ecriture, TitreMain, Annotation } from '../../components/Ecriture';
import { TasseProgression } from '../../components/TasseProgression';
import { getGuest } from '../../content';
import { assetUrl } from '../../lib/assets';
import { ECRINS } from '../../generated/ecrins.gen';
import type { Distance } from '../../lib/settings';
import './SpecimenJulie.css';

const SEED = 4127;
type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** Le papier ancien couvre toute la feuille, sous la zone de texte de <Page>. */
function Feuille({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`gc-sj-feuille gc-sj-feuille--${side}`} aria-hidden="true">
      <Papier seed={SEED} side={side} age={2} />
    </div>
  );
}

/** La cloche cuite : calques empilés au même cadrage, vidéo (scène figée ou couleur) masquée par mask-soft. */
function ClocheCuite({ playing, progress }: { playing: boolean; progress: number }) {
  const man = ECRINS.cloche.manifest;
  const [W, H] = man.viewBox;
  const a = man.aperture as { cx: number; cy: number; r: number };
  const lift = man.lift!;
  const cup = man.cup!;
  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  const lifted: Vars = {
    transformOrigin: `${pct(a.cx, W)} ${pct(a.cy, H)}`,
    transform: playing ? `translate(${pct(lift.dx, W)}, ${pct(lift.dy, H)}) rotate(${lift.rotate}deg)` : 'none',
  };
  const img = (part: string, style?: React.CSSProperties) => (
    <img className="gc-sj-calque" src={assetUrl(`ecrins/cloche/a/${part}`)} alt="" style={style} draggable={false} />
  );
  return (
    <div className="gc-sj-cloche" style={{ aspectRatio: `${W} / ${H}` }} data-state={playing ? 'playing' : 'idle'}>
      {img('back')}
      {img('domeBack', lifted)}
      <div className="gc-sj-media" style={{ '--gc-sj-mask': `url("${assetUrl('ecrins/cloche/a/mask-soft')}")` } as Vars}>
        <div className="gc-sj-slot" style={{ left: pct(a.cx - a.r, W), top: pct(a.cy - a.r, H), width: pct(2 * a.r, W), height: pct(2 * a.r, H) }}>
          <img src={assetUrl('scenes/julie/sepia')} alt="" className="gc-sj-scene gc-sj-scene--sepia" />
          <img src={assetUrl('scenes/julie/couleur')} alt="" className="gc-sj-scene gc-sj-scene--couleur" />
        </div>
      </div>
      {img('front')}
      {img('dome', lifted)}
      {img('glint', { ...lifted, opacity: playing ? 1 : 0.6 })}
      <div className="gc-sj-tasse" style={{ left: pct(cup.x, W), top: pct(cup.y, H) }}>
        <TasseProgression progress={playing ? progress : 0} liquid="the" />
      </div>
    </div>
  );
}

function PetitMotMain({ note, signature }: { note: string; signature: string }) {
  return (
    <div className="gc-sj-mot">
      <Ecriture hand="soignee" ink="bic" role="note" seed={SEED + 50} slant={-0.8}>{note}</Ecriture>
      <Ecriture hand="soignee" ink="bic" role="signature" seed={SEED + 51} slant={-3} className="gc-sj-signature">{signature}</Ecriture>
    </div>
  );
}

function RecetteMain({ withNote }: { withNote: boolean }) {
  const g = getGuest('julie');
  const r = g.recipe!;
  const ingredients = r.ingredients.map((s) => (/^150.g de sucre$/.test(s) ? '~~150 g~~>120 g de sucre' : s));
  const steps = r.steps.map((s, i) => (i === 1 ? s.replace('zestes', '__zestes__') : i === 3 ? s.replace(/45.min/, '~~45 min~~>40 min') : s));
  const pente = (i: number) => -0.6 + [0.2, -0.25, 0.05, 0.3, -0.1, -0.3, 0.15, 0, 0.25, -0.2][i % 10];
  return (
    <div className="gc-sj-recette">
      <TitreMain hand="soignee" ink="bic" underline="regle" underlineInk="rouge" seed={SEED} slant={-0.7}>{r.title}</TitreMain>
      <Ecriture hand="soignee" ink="bic" role="meta" seed={SEED + 1} slant={-0.4}>{`Prép. ${r.prep} · cuisson ${r.cook} · ${r.servings}`}</Ecriture>
      <Ecriture hand="soignee" ink="bic" role="body" seed={SEED + 2} souligne="main" className="gc-sj-label">Ingrédients :</Ecriture>
      <ul className="gc-sj-ingredients">
        {ingredients.map((s, i) => (
          <Ecriture key={i} as="li" hand="soignee" ink="bic" role="body" seed={SEED + 10 + i} slant={pente(i)} drift={1} puce="tiret" rature="trait">{s}</Ecriture>
        ))}
      </ul>
      <div className="gc-sj-label gc-sj-label-row">
        <Ecriture hand="soignee" ink="bic" role="body" seed={SEED + 3} souligne="main">Préparation :</Ecriture>
        <Annotation text="testé le 3 mars, un régal" hand="cecile" ink="crayon" tilt={-3} seed={SEED + 41} />
      </div>
      <ol className="gc-sj-etapes">
        {steps.map((s, i) => (
          <li key={i} className="gc-sj-etape">
            <Ecriture as="span" hand="soignee" ink="bic" role="body" seed={SEED + 30 + i}>{`${i + 1})`}</Ecriture>
            <span>
              <Ecriture as="span" hand="soignee" ink="bic" role="body" seed={SEED + 20 + i} slant={pente(i + 3)} fixHand="cecile" fixInk="rouge" fixPlace="dessus" rature="trait">{s}</Ecriture>
              {i === 0 && <Annotation text="bien chaud !" hand="soignee" ink="bic" arrow="courbe" tilt={-5} seed={SEED + 40} />}
            </span>
          </li>
        ))}
      </ol>
      {withNote && <PetitMotMain note={g.note!} signature={g.signature!} />}
    </div>
  );
}

export interface SpecimenJulieProps {
  distance?: Distance;
  playing?: boolean;
  progress?: number;
}

export function SpecimenJulie({ distance = 'moyenne', playing = false, progress = 0.6 }: SpecimenJulieProps) {
  const g = getGuest('julie');
  const noteLeft = distance === 'loin';
  return (
    <Stage table="bois" distance={distance}>
      <DoublePage
        folios={[12, 13]}
        dogEars={['br']}
        left={
          <>
            <Feuille side="left" />
            <div className="gc-sj-gauche">
              <div className="gc-sj-ecrin">
                <ClocheCuite playing={playing} progress={progress} />
              </div>
              <Ecriture hand="cecile" ink="crayon" role="meta" seed={SEED + 60} slant={-2} className="gc-sj-legende">{g.video!.caption}</Ecriture>
              {noteLeft && <PetitMotMain note={g.note!} signature={g.signature!} />}
            </div>
          </>
        }
        right={
          <>
            <Feuille side="right" />
            <RecetteMain withNote={!noteLeft} />
          </>
        }
      />
    </Stage>
  );
}

export default SpecimenJulie;
