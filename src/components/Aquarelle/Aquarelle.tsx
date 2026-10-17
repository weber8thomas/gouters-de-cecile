import React from 'react';
import { useReducedMotion } from '../../lib/motion';
import { assetUrl } from '../../lib/assets';
import './Aquarelle.css';

export interface AquarelleProps {
  /** Nom de l'aquarelle cuite (design-system/baked/aquarelles/<nom>.webp). */
  nom: string;
  /** « fleurit » (défaut) : la couleur s'étale à l'arrivée sur la page ; « vapeur » : en plus, deux volutes
   *  montent en boucle ; « balance » : elle oscille doucement en boucle ; « fixe » : rien ne bouge. */
  anime?: string;
  /** Inclinaison (degrés). */
  angle?: number;
  /** Rang sur la page : les aquarelles fleurissent l'une après l'autre. */
  ordre?: number;
}

// Une aquarelle posée sur la page, dans une zone vivante réservée à la cuisson (aucune encre dessous). Elle
// se mêle au papier par multiplication, comme de la couleur sur une feuille. Quand la page devient visible
// (classe gc-livre__page--visible, posée par le Livre), elle « fleurit » : une copie floue, comme de la
// couleur encore mouillée, s'étale puis s'efface pendant que l'image nette apparaît. Opacité et
// transformation seulement. Moins d'animations (système ou réglage) : l'aquarelle est posée telle quelle.
export function Aquarelle({ nom, anime = 'fleurit', angle = 0, ordre = 0 }: AquarelleProps) {
  const reduit = useReducedMotion(); // système ou réglage du carnet
  const src = assetUrl(`aquarelles/${nom}`);
  const style = {
    '--gc-aq-angle': `${angle}deg`,
    '--gc-aq-delai': `${(0.45 + ordre * 0.3).toFixed(2)}s`,
  } as React.CSSProperties;
  const cls = ['gc-aquarelle', `gc-aquarelle--${reduit ? 'fixe' : anime}`].join(' ');
  return (
    <div className={cls} style={style} aria-hidden="true" data-gc-aquarelle={nom}>
      {!reduit && <img className="gc-aquarelle__mouille" src={src} alt="" draggable={false} decoding="async" />}
      <img className="gc-aquarelle__seche" src={src} alt="" draggable={false} decoding="async" />
      {!reduit && anime === 'vapeur' && (
        <>
          <span className="gc-aquarelle__volute" />
          <span className="gc-aquarelle__volute gc-aquarelle__volute--2" />
        </>
      )}
    </div>
  );
}

export default Aquarelle;
