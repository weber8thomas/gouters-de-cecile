// Démo du carnet animé : couverture qui s'ouvre, double page de Julie (Entrée lance la vidéo :
// le dôme se soulève, la couleur revient, la tasse se remplit), puis trois doubles pages écrites par
// d'autres invités, chacun de sa main, sur papier ancien. Clavier : ← → pour tourner, + / − pour la
// distance, ↑ ↓ pour le zoom fin, 0 pour revenir à 100 %.
import React from 'react';
import { Livre } from '../../components/Livre';
import { Papier } from '../../components/Papier';
import { Ecriture, TitreMain, Annotation } from '../../components/Ecriture';
import { CameraProvider } from '../../lib/camera';
import { assetUrl } from '../../lib/assets';
import type { SpreadSpec } from '../../lib/spread';
import { JulieGauche, JulieDroite } from '../SpecimenJulie/SpecimenJulie';
import './DemoCarnet.css';

function Feuille({ side, seed }: { side: 'left' | 'right'; seed: number }) {
  return (
    <div className={`gc-sj-feuille gc-sj-feuille--${side}`} aria-hidden="true">
      <Papier seed={seed} side={side} age={2} />
    </div>
  );
}

/** Une page de démonstration écrite dans la main d'un invité. */
function PageMain({ side, seed, children }: { side: 'left' | 'right'; seed: number; children: React.ReactNode }) {
  return (
    <div className="gc-sj-isole">
      <Feuille side={side} seed={seed} />
      <div className="gc-demo-page">{children}</div>
    </div>
  );
}

const Couverture = (
  <div className="gc-demo-couverture">
    <p className="gc-hand-caption gc-demo-couverture__sur">carnet de recettes</p>
    <p className="gc-recipe-title gc-demo-couverture__titre">Les goûters</p>
    <p className="gc-section-label gc-demo-couverture__de">de Cécile</p>
  </div>
);

export function DemoCarnet() {
  const [index, setIndex] = React.useState(-1);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  // Entrée / Espace sur la page de Julie : lecture simulée de 12 s (la tasse se remplit).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (index !== 0 || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index]);
  React.useEffect(() => {
    if (!playing) return;
    const t0 = performance.now() - progress * 12000;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 12000);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  React.useEffect(() => { if (index !== 0) setPlaying(false); }, [index]);

  const spreads: SpreadSpec[] = [
    {
      id: 'julie', kind: 'video', table: 'bois', folios: [12, 13], seed: 4127,
      render: (mode) => ({ left: <JulieGauche playing={mode === 'live' && playing} progress={progress} />, right: <JulieDroite /> }),
    },
    {
      id: 'rose', kind: 'recette', table: 'nappe', folios: [14, 15], seed: 811,
      render: () => ({
        left: (
          <PageMain side="left" seed={811}>
            <TitreMain hand="mamie" ink="brune" underline="double" seed={811}>Les sablés de Rose</TitreMain>
            <img className="gc-demo-illu" src={assetUrl('illustrations/essai/cake-citron')} alt="" />
            <Ecriture hand="mamie" ink="brune" role="note" seed={812} slant={-1}>Ma recette de toujours, pour ma Cécile qui en volait un de plus.</Ecriture>
          </PageMain>
        ),
        right: (
          <PageMain side="right" seed={811}>
            <Ecriture hand="mamie" ink="brune" role="body" seed={813} souligne="main">Ingrédients :</Ecriture>
            <Ecriture hand="mamie" ink="brune" role="body" seed={814} puce="tiret">250 g de farine</Ecriture>
            <Ecriture hand="mamie" ink="brune" role="body" seed={815} puce="tiret">{'~~150 g~~>125 g de beurre'}</Ecriture>
            <Ecriture hand="mamie" ink="brune" role="body" seed={816} puce="tiret">100 g de sucre glace</Ecriture>
            <Annotation text="et une pincée de cannelle !" hand="cecile" ink="crayon" tilt={-4} seed={817} />
            <Ecriture hand="mamie" ink="brune" role="signature" seed={818} slant={-3} className="gc-demo-signature">Mamie Rose</Ecriture>
          </PageMain>
        ),
      }),
    },
    {
      id: 'mathis', kind: 'video', table: 'bois', folios: [16, 17], seed: 905,
      render: () => ({
        left: (
          <PageMain side="left" seed={905}>
            <TitreMain hand="feutre" ink="feutre" underline="vague" seed={905}>Les cookies de Mathis</TitreMain>
            <Ecriture hand="feutre" ink="feutre" role="body" seed={906} puce="point">beaucoup de pépites !!</Ecriture>
            <Ecriture hand="feutre" ink="feutre" role="body" seed={907} puce="point">une pincée de fleur de sel</Ecriture>
          </PageMain>
        ),
        right: (
          <PageMain side="right" seed={905}>
            <Ecriture hand="capitales" ink="noire" role="body" seed={908} souligne="main">Le mot de Bernard</Ecriture>
            <Ecriture hand="capitales" ink="noire" role="note" seed={909}>Joyeux anniversaire Cécile, garde-moi une part de tarte.</Ecriture>
          </PageMain>
        ),
      }),
    },
    {
      id: 'fin', kind: 'finale', table: 'nappe', folios: [18, 19], seed: 1201,
      render: () => ({
        left: (
          <PageMain side="left" seed={1201}>
            <Ecriture hand="cecile" ink="crayon" role="title" seed={1202}>À suivre…</Ecriture>
          </PageMain>
        ),
        right: (
          <PageMain side="right" seed={1201}>
            <Ecriture hand="cecile" ink="crayon" role="note" seed={1203} slant={-1}>La version papier arrive bientôt…</Ecriture>
          </PageMain>
        ),
      }),
    },
  ];

  return (
    <CameraProvider keyboard persist={false}>
      <Livre spreads={spreads} index={index} onIndexChange={setIndex} keyboard cover={Couverture} />
    </CameraProvider>
  );
}

export default DemoCarnet;
