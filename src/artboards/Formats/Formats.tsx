// La même double page de Julie vue sur cinq écrans simulés, côte à côte et à la même échelle (px CSS) :
// téléphone debout et couché, tablette debout, ordinateur, TV. Chaque écran est un <Ecran> sous un
// ViewportOverride (taille, tactile, zones sûres), dans un cadre d'appareil sobre dessiné en CSS.
// Statique : aucun geste, aucun clavier, aucun mouvement.
import React from 'react';
import { Ecran } from '../../components/Ecran';
import { Livre } from '../../components/Livre';
import { CameraProvider } from '../../lib/camera';
import { ViewportOverride, type ViewportForce } from '../../lib/viewport';
import type { Distance } from '../../lib/settings';
import { JULIE } from '../DemoCarnet/spreads';
import './Formats.css';

/** Échelle commune : 1 px CSS de chaque appareil = 0,36 px de la carte. */
const K = 0.36;

type Appareil = 'telephone' | 'tablette' | 'ordinateur' | 'tv';

interface Simule {
  cle: string;
  appareil: Appareil;
  legende: string;
  detail: string;
  vp: ViewportForce & { w: number; h: number };
  distance: Distance;
  cote?: 'gauche' | 'droite';
}

const SPREADS = [JULIE];

const ECRANS: Record<string, Simule> = {
  tv: { cle: 'tv', appareil: 'tv', legende: 'la TV, à 3 m', detail: '1920 × 1080 · double page', vp: { w: 1920, h: 1080, dpr: 1, tactile: false, pleinEcran: true }, distance: 'moyenne' },
  ordi: { cle: 'ordi', appareil: 'ordinateur', legende: "l'ordinateur", detail: '1440 × 900 · double page', vp: { w: 1440, h: 900, dpr: 2, tactile: false, pleinEcran: true }, distance: 'moyenne' },
  tablette: { cle: 'tablette', appareil: 'tablette', legende: 'la tablette debout', detail: '820 × 1180 · une page', vp: { w: 820, h: 1180, dpr: 2, tactile: true, pleinEcran: true, insets: { top: 24, bottom: 20 } }, distance: 'proche', cote: 'gauche' },
  debout: { cle: 'debout', appareil: 'telephone', legende: 'le téléphone debout', detail: '390 × 844 · une page', vp: { w: 390, h: 844, dpr: 3, tactile: true, pleinEcran: false, insets: { top: 47, bottom: 34 } }, distance: 'proche', cote: 'droite' },
  couche: { cle: 'couche', appareil: 'telephone', legende: 'le téléphone couché', detail: '844 × 390 · double page', vp: { w: 844, h: 390, dpr: 3, tactile: true, pleinEcran: false, insets: { left: 47, right: 47, bottom: 21 } }, distance: 'proche' },
};

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** Un écran simulé, à l'échelle K, dans son cadre d'appareil. */
function Appareil({ e }: { e: Simule }) {
  const { w, h } = e.vp;
  const style: Vars = { '--gc-formats-w': `${w * K}px`, '--gc-formats-h': `${h * K}px`, '--gc-formats-k': K };
  return (
    <figure className={`gc-formats__appareil gc-formats__appareil--${e.appareil}${w > h ? ' gc-formats__appareil--couche' : ''}`} style={style}>
      <div className="gc-formats__cadre">
        <div className="gc-formats__ecran" aria-hidden="true">
          <div className="gc-formats__echelle">
            <ViewportOverride.Provider value={e.vp}>
              <CameraProvider fixed={{ distance: e.distance, zoom: 1 }}>
                <Ecran>
                  <Livre spreads={SPREADS} index={0} gestes={false} coteInitial={e.cote} />
                </Ecran>
              </CameraProvider>
            </ViewportOverride.Provider>
          </div>
        </div>
        {e.appareil === 'ordinateur' && <div className="gc-formats__socle" aria-hidden="true" />}
        {e.appareil === 'tv' && <div className="gc-formats__pied" aria-hidden="true" />}
      </div>
      <figcaption className="gc-formats__legende">
        <span className="gc-hand-caption gc-formats__nom">{e.legende}</span>
        <span className="gc-hand-caption gc-formats__detail">{e.detail}</span>
      </figcaption>
    </figure>
  );
}

export function Formats() {
  return (
    <div className="gc-formats">
      <div className="gc-formats__colonne gc-formats__colonne--grands">
        <Appareil e={ECRANS.tv} />
        <Appareil e={ECRANS.ordi} />
      </div>
      <div className="gc-formats__colonne gc-formats__colonne--petits">
        <div className="gc-formats__rang">
          <Appareil e={ECRANS.tablette} />
          <Appareil e={ECRANS.debout} />
        </div>
        <Appareil e={ECRANS.couche} />
      </div>
    </div>
  );
}

export default Formats;
