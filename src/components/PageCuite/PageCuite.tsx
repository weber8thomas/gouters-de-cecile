// Une page du carnet cuite au build (scripts/bake-pages.mjs) : le vrai papier ancien scanné et
// l'encre déjà « bue » par ce papier, en deux images alignées au pixel qui remplissent la face.
// Rien n'est calculé à l'exécution (aucun filtre, aucun mélange) : on pose deux <img>, le texte réel
// de la page pour l'accessibilité, et des emplacements pour ce qui reste vivant (écrin vidéo).
import React from 'react';
import { assetInfo, assetUrl } from '../../lib/assets';
import manifesteJson from '../../content/pages/manifeste.json';
import './PageCuite.css';

/** Rectangle en fractions de la page : [x, y, largeur, hauteur]. */
export type RectPage = [number, number, number, number];

/** Entrée du manifeste des pages cuites (src/content/pages/manifeste.json, écrit par la cuisson). */
export interface PageCuiteInfo {
  double: string;
  cote: 'gauche' | 'droite';
  folio: number;
  /** Nom logique du papier du feuillet (« pages/papier/f13 »), partagé par le recto et le verso. */
  papier: string;
  /** Verso du feuillet : le papier est affiché retourné (miroir horizontal). */
  miroir: boolean;
  /** Nom logique du calque d'encre (« pages/julie-droite »), cuit à 2×. */
  encre: string;
  /** Variantes 1× (écrans de densité 1 : TV 1080p, ordinateur), même composition réduite. */
  papier1x?: string;
  encre1x?: string;
  /** Texte réel de la page, dans l'ordre de lecture (une ligne par bloc). */
  texte: string;
  /** Zones réservées aux éléments vivants (aucune encre dessous). */
  vivants: Record<string, RectPage>;
  /** Ce qui n'a pas tenu sur la page à la cuisson (doit rester vide). */
  deborde: string[];
  lignes: number;
}

export interface PageCuiteManifeste {
  version: number;
  largeur: number;
  hauteur: number;
  echelle: number;
  pages: Record<string, PageCuiteInfo>;
}

export const PAGES_CUITES = manifesteJson as unknown as PageCuiteManifeste;

export interface PageCuiteProps {
  /** Identifiant de la page cuite (« julie-droite »), clé de src/content/pages/manifeste.json. */
  page: string;
  /** Éléments vivants, posés dans les zones réservées par la page (`vivants` du manifeste). */
  slots?: Partial<Record<string, React.ReactNode>>;
  className?: string;
}

const pc = (v: number) => `${+(v * 100).toFixed(4)}%`;

/**
 * Les deux images sont décodées avec la peinture (`decoding="sync"`) : une page n'apparaît jamais sans
 * son encre. Le Livre les pré-décode (`decode()`) avant un tourne-page ; elles sont partagées
 * (même URL) par les copies du feuillet.
 *
 * Remplit son parent positionné (`position: absolute; inset: 0`) : dans une <Page> (Livre, DoublePage),
 * elle couvre toute la feuille, marges comprises.
 */
export function PageCuite({ page, slots, className }: PageCuiteProps) {
  const info = PAGES_CUITES.pages[page];
  if (!info) {
    if (typeof console !== 'undefined') console.warn(`Page cuite inconnue : ${page}`);
    return null;
  }
  const cls = ['gc-page-cuite', `gc-page-cuite--${info.cote}`, className].filter(Boolean).join(' ');
  // 1× sur un écran de densité 1, 2× ailleurs (téléphone, tablette, TV 4K) ; taille intrinsèque
  // connue d'avance : le chargement d'une copie ne relance aucune mise en page.
  const source = (nom2: string, nom1?: string) => {
    const a = assetInfo(nom2);
    const taille = a ? { width: Math.round(a.w / PAGES_CUITES.echelle), height: Math.round(a.h / PAGES_CUITES.echelle) } : {};
    if (!nom1 || !assetInfo(nom1)) return { src: assetUrl(nom2), ...taille };
    return { src: assetUrl(nom1), srcSet: `${assetUrl(nom1)} 1x, ${assetUrl(nom2)} 2x`, ...taille };
  };
  const lignes = info.texte.split('\n').filter(Boolean);
  return (
    <div className={cls} data-gc-page-cuite={page} lang="fr">
      <img
        className={`gc-page-cuite__papier${info.miroir ? ' gc-page-cuite__papier--miroir' : ''}`}
        {...source(info.papier, info.papier1x)}
        alt=""
        draggable={false}
        decoding="sync"
      />
      <img className="gc-page-cuite__encre" {...source(info.encre, info.encre1x)} alt="" draggable={false} decoding="sync" />
      <div className="gc-page-cuite__texte">
        {lignes.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
      {Object.entries(info.vivants).map(([nom, [x, y, w, h]]) =>
        slots?.[nom] ? (
          <div key={nom} className="gc-page-cuite__vivant" data-gc-vivant={nom} style={{ left: pc(x), top: pc(y), width: pc(w), height: pc(h) }}>
            {slots[nom]}
          </div>
        ) : null,
      )}
    </div>
  );
}

export default PageCuite;
