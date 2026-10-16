// Une page du carnet cuite au build (scripts/bake-pages.mjs) : le vrai papier ancien scanné et
// l'encre déjà « bue » par ce papier (écriture trait par trait, croquis à l'aquarelle), en deux images
// alignées au pixel. Rien n'est calculé à l'exécution (aucun filtre, aucun mélange) : on pose deux
// <img>, le texte réel de la page pour l'accessibilité, et les objets vivants dans les zones que la
// page leur a réservées (photo collée, coin du feuillet volant).
import React from 'react';
import { assetInfo, assetUrl } from '../../lib/assets';
import manifesteJson from '../../content/pages/manifeste.json';
import './PageCuite.css';

/** Rectangle en fractions de la page : [x, y, largeur, hauteur]. */
export type RectPage = [number, number, number, number];

/** Zones vivantes d'une page : aucune encre dessous. */
export interface ZonesVivantes {
  /** Tirage collé de la vidéo de l'invité (PhotoCollee) : la boîte du tirage de travers, coins compris. */
  photo?: RectPage;
  /** Coin du feuillet volant qui dépasse de la page droite (FeuilletVolant). */
  volant?: RectPage;
  [nom: string]: RectPage | undefined;
}

/** Feuillet volant glissé dans le carnet, porté par la page droite d'une recette longue. */
export interface VolantInfo {
  /** Pages cuites du feuillet (type « feuillet ») : recto puis verso. */
  recto: string;
  verso: string;
  /** Inclinaison du feuillet posé (degrés, négatif = sens inverse des aiguilles). */
  angle: number;
  /** Où serait le feuillet entier, coin haut-gauche avant rotation, en fractions de la page qui le
   *  porte : [x, y, largeur, hauteur]. La partie dans `vivants.volant` est le coin visible. */
  rect: RectPage;
}

/** Croquis cuit dans la page (puce, icône, petit dessin de marge). */
export interface CroquisPage {
  nom: string;
  role: 'puce' | 'icone' | 'dessin';
  /** false : place réservée, le croquis n'était pas prêt à la cuisson. */
  dessine: boolean;
  /** [x, y, largeur, hauteur] en fractions de la page. */
  boite: RectPage;
}

/** Entrée du manifeste des pages cuites (src/content/pages/manifeste.json, écrit par la cuisson). */
export interface PageCuiteInfo {
  double: string;
  cote: 'gauche' | 'droite';
  /** Folio imprimé (pages du carnet) ; absent sur un feuillet volant. */
  folio?: number | null;
  /** « feuillet » : page d'un feuillet volant (feuille de cahier), à sa propre `taille`. */
  type?: 'feuillet';
  /** Taille d'une page de feuillet, en px de la page de référence (`largeur` × `hauteur` du manifeste). */
  taille?: [number, number];
  /** Face d'un feuillet volant, et la page au dos (vue par transparence). */
  face?: 'recto' | 'verso';
  dos?: string;
  /** Nom logique du papier (« pages/papier/f13 », « pages/papier/c-lisa-recto »). */
  papier: string;
  /** Verso d'un feuillet du carnet : le papier est affiché retourné (miroir horizontal). */
  miroir: boolean;
  /** Nom logique du calque d'encre (« pages/julie-droite »), cuit à 2×. */
  encre: string;
  /** Variantes 1× (écrans de densité 1 : TV 1080p, ordinateur), même composition réduite. */
  papier1x?: string;
  encre1x?: string;
  /** Texte réel de la page, dans l'ordre de lecture (une ligne par bloc). */
  texte: string;
  /** Zones réservées aux éléments vivants (aucune encre dessous). */
  vivants: ZonesVivantes;
  /** Page droite d'une recette longue : le feuillet volant glissé dans le carnet. */
  volant?: VolantInfo;
  /** Page où le texte continue (« suite sur la feuille » → recto, recto → verso). */
  suite?: string;
  /** Recette reçue d'où vient la page (src/content/recettes/<slug>.json). */
  recette?: string;
  croquis?: CroquisPage[];
  /** Ce qui n'a pas tenu sur la page à la cuisson (toujours vide : sinon la cuisson échoue). */
  deborde: string[];
  lignes: number;
  /** Mots mal relus restants (relecture de l'écriture générée). */
  douteux?: string[];
}

export interface PageCuiteManifeste {
  version: number;
  largeur: number;
  hauteur: number;
  echelle: number;
  pages: Record<string, PageCuiteInfo>;
}

export const PAGES_CUITES = manifesteJson as unknown as PageCuiteManifeste;

/** Entrée du manifeste d'une page cuite (undefined si inconnue). */
export function pageCuite(page: string): PageCuiteInfo | undefined {
  return PAGES_CUITES.pages[page];
}

/** Taille d'une page en px de la page de référence : [850, 960], ou la `taille` d'un feuillet. */
export function taillePage(page: string): [number, number] {
  const info = PAGES_CUITES.pages[page];
  return info?.taille ?? [PAGES_CUITES.largeur, PAGES_CUITES.hauteur];
}

export interface PageCuiteProps {
  /** Identifiant de la page cuite (« julie-droite », « lisa-feuillet-recto »), clé du manifeste. */
  page: string;
  /** Éléments vivants, posés dans les zones réservées par la page : `photo` (PhotoCollee),
   *  `volant` (FeuilletVolant). Une zone sans élément reste du papier. */
  slots?: Partial<Record<keyof ZonesVivantes, React.ReactNode>>;
  /**
   * `parent` (défaut) : remplit son parent positionné (faces du Livre, DoublePage).
   * `propre` : bloc dans le flux, largeur du parent, hauteur selon la proportion propre de la page
   * (feuillet volant soulevé, aperçus).
   */
  cadre?: 'parent' | 'propre';
  className?: string;
}

const pc = (v: number) => `${+(v * 100).toFixed(4)}%`;

/**
 * Les deux images sont décodées avec la peinture (`decoding="sync"`) : une page n'apparaît jamais sans
 * son encre. Le Livre les pré-décode (`decode()`) avant un tourne-page ; elles sont partagées
 * (même URL) par les copies du feuillet.
 */
export function PageCuite({ page, slots, cadre = 'parent', className }: PageCuiteProps) {
  const info = PAGES_CUITES.pages[page];
  if (!info) {
    if (typeof console !== 'undefined') console.warn(`Page cuite inconnue : ${page}`);
    return null;
  }
  const [w, h] = taillePage(page);
  const cls = [
    'gc-page-cuite',
    `gc-page-cuite--${info.cote}`,
    info.type === 'feuillet' ? 'gc-page-cuite--feuillet' : null,
    cadre === 'propre' ? 'gc-page-cuite--propre' : null,
    className,
  ].filter(Boolean).join(' ');
  // 1× sur un écran de densité 1, 2× ailleurs (téléphone, tablette, TV 4K) ; taille intrinsèque
  // connue d'avance : le chargement d'une copie ne relance aucune mise en page.
  const source = (nom2: string, nom1?: string) => {
    const a = assetInfo(nom2);
    const taille = a ? { width: Math.round(a.w / PAGES_CUITES.echelle), height: Math.round(a.h / PAGES_CUITES.echelle) } : {};
    if (!nom1 || !assetInfo(nom1)) return { src: assetUrl(nom2), ...taille };
    return { src: assetUrl(nom1), srcSet: `${assetUrl(nom1)} 1x, ${assetUrl(nom2)} 2x`, ...taille };
  };
  const lignes = info.texte.split('\n').filter(Boolean);
  const style = cadre === 'propre' ? ({ aspectRatio: `${w} / ${h}` } as React.CSSProperties) : undefined;
  return (
    <div className={cls} style={style} data-gc-page-cuite={page} data-gc-page-type={info.type ?? 'page'} lang="fr">
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
      {Object.entries(info.vivants).map(([nom, r]) =>
        r && slots?.[nom] ? (
          <div
            key={nom}
            className={`gc-page-cuite__vivant gc-page-cuite__vivant--${nom}`}
            data-gc-vivant={nom}
            style={{ left: pc(r[0]), top: pc(r[1]), width: pc(r[2]), height: pc(r[3]) }}
          >
            {slots[nom]}
          </div>
        ) : null,
      )}
    </div>
  );
}

export default PageCuite;
