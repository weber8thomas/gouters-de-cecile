// La couverture du carnet, cuite comme les pages (lot C, plan v4) : une vraie toile de reliure ancienne
// scannée, une étiquette en vrai papier ancien collée dessus, le titre écrit à la plume trait par trait et
// une théière au crayon et à l'aquarelle, l'encre bue par le papier (scripts/pages/couverture.py).
// Rien n'est calculé à l'exécution : des images cuites, posées par variables CSS (couvertureVars) sur le
// livre, et une <img> pour l'étiquette (EtiquetteCouverture). Aucun texte en police web.
import React from 'react';
import { assetInfo, assetUrl, cssUrl } from '../../lib/assets';
import manifesteJson from './couverture.json';
import './Couverture.css';

/** Parties cuites d'une couverture (design-system/baked/couverture/<variante>/<partie>.webp, et 1x/…). */
export type PartieCouverture =
  | 'plat'
  | 'arriere'
  | 'plat-arriere'
  | 'contreplat'
  | 'contreplat-arriere'
  | 'dos'
  | 'chant'
  | 'tranche'
  | 'tranche-pied'
  | 'etiquette';

/** Densité des images : 1× (écran de densité 1 : TV 1080p, ordinateur), 2×, ou selon l'écran. */
export type DensiteCouverture = 1 | 2 | 'auto';

/** Modalité d'entrée, comme `src/lib/modalite.ts`. */
export type ModaliteOuvrir = 'toucher' | 'cliquer' | 'entree';

/** Rectangle en fractions du plat : [x, y, largeur, hauteur]. */
export type RectPlat = [number, number, number, number];

export interface PartieCuiteInfo {
  w: number;
  h: number;
  ko: number;
  ko1x?: number;
}

export interface VarianteCouvertureInfo {
  nom: string;
  description: string;
  /** Couleur médiane de la toile du plat (repli si l'image manque). */
  teinte: string;
  /** Couleur médiane de la garde du contre-plat. */
  teinte_garde: string;
  /** D'où vient le papier de garde (papiers.json du lot Pa, ou une source). */
  garde: string;
  /** Étiquette collée : rectangle de son image (ombre comprise, déjà tournée) sur le plat. */
  etiquette: { rect: RectPlat; angle: number } | null;
  parties: Partial<Record<PartieCouverture, PartieCuiteInfo>>;
}

export interface IndiceOuvrirInfo {
  texte: string;
  /** L'étiquette : un billet de papier écrit au crayon, fond transparent autour, ombre cuite. */
  image: string;
  /** Le crayon seul, fond transparent (pour un fond de papier clair). */
  crayon: string;
  /** Taille en px de référence (images cuites à 2×). */
  taille: [number, number];
  taille_crayon: [number, number];
  xh: number;
}

export interface CouvertureManifeste {
  version: number;
  /** Variante retenue (la seule cuite dans design-system/baked). */
  active: string;
  /** Plat de référence en px : page 850 × 960 + débords du carton (18 / 6 / 16). */
  plat: [number, number];
  dos: number;
  bloc: number;
  epaisseur: number;
  titre: string;
  variantes: Record<string, VarianteCouvertureInfo>;
  comparees?: Record<string, { nom: string; description: string; dossier: string }>;
  indices: Record<ModaliteOuvrir, IndiceOuvrirInfo>;
}

/** Le manifeste écrit par scripts/pages/couverture.py. */
export const COUVERTURE_CUITE = manifesteJson as unknown as CouvertureManifeste;

/** La variante retenue (toile vert sauge et étiquette collée). */
export const VARIANTE_COUVERTURE: string = COUVERTURE_CUITE.active;

/** Noms logiques (assetUrl) des étiquettes « … pour ouvrir », par modalité (useModalite()). */
export const INDICES_OUVRIR: Record<ModaliteOuvrir, string> = {
  toucher: 'indices/toucher',
  cliquer: 'indices/cliquer',
  entree: 'indices/entree',
};

/** Les mêmes, au crayon seul sur fond transparent (sans le billet de papier). */
export const INDICES_OUVRIR_CRAYON: Record<ModaliteOuvrir, string> = {
  toucher: 'indices/toucher-crayon',
  cliquer: 'indices/cliquer-crayon',
  entree: 'indices/entree-crayon',
};

/** Texte de chaque étiquette (lecteurs d'écran, `alt`). */
export const TEXTES_OUVRIR: Record<ModaliteOuvrir, string> = {
  toucher: 'touchez pour ouvrir',
  cliquer: 'cliquez pour ouvrir',
  entree: 'appuyez sur Entrée pour ouvrir',
};

const varianteDe = (v?: string): string => (v && COUVERTURE_CUITE.variantes[v] ? v : VARIANTE_COUVERTURE);

function densiteDe(d: DensiteCouverture): 1 | 2 {
  if (d !== 'auto') return d;
  if (typeof window === 'undefined') return 2;
  return (window.devicePixelRatio || 1) < 1.5 ? 1 : 2;
}

/** Nom logique d'une partie cuite : la variante 1× si elle est demandée et cuite, sinon 2×. */
export function nomCouverture(partie: PartieCouverture, variante?: string, densite: 1 | 2 = 2): string {
  const v = varianteDe(variante);
  const n1 = `couverture/${v}/1x/${partie}`;
  return densite === 1 && assetInfo(n1) ? n1 : `couverture/${v}/${partie}`;
}

/**
 * Variables CSS de la couverture cuite, à poser en style en ligne sur le livre (`.gc-livre`) : chaque
 * élément du livre lit la sienne (voir le README pour le branchement exact dans Livre.css).
 *
 *   --gc-couv-plat                plat avant (868 × 982 px de référence), coins usés en transparence
 *   --gc-couv-arriere             plat arrière vu de l'extérieur (dos à droite)
 *   --gc-couv-contreplat          intérieur du plat avant, livre ouvert (bord extérieur à gauche)
 *   --gc-couv-contreplat-arriere  intérieur du plat arrière, livre ouvert (mors à gauche)
 *   --gc-couv-dos                 dos arrondi (épaisseur du livre × hauteur du plat)
 *   --gc-couv-chant               tranche du carton (10 px × hauteur du plat)
 *   --gc-couv-tranche             gouttière : l'épaisseur des pages vue de côté (bloc × hauteur de page)
 *   --gc-couv-tranche-pied        la même vue d'en bas (largeur de page × bloc)
 *   --gc-couv-plat-taille         « 100% 100% » (background-size des images)
 *   --gc-couv-fond                « transparent » (background-color : les coins usés laissent voir dessous)
 *   --gc-couv-biseau              « none » (les arêtes, l'usure et la lumière sont cuites dans les images)
 *   --gc-couv-teinte, --gc-couv-teinte-garde   couleurs médianes (replis)
 *
 * Si les images ne sont pas cuites (asset inconnu), renvoie {} : les replis de Livre.css s'appliquent.
 */
export function couvertureVars(variante?: string, densite: DensiteCouverture = 'auto'): React.CSSProperties {
  const v = varianteDe(variante);
  const info = COUVERTURE_CUITE.variantes[v];
  if (!info || !assetInfo(`couverture/${v}/plat`)) return {};
  const d = densiteDe(densite);
  const url = (p: PartieCouverture) => cssUrl(nomCouverture(p, v, d));
  return {
    '--gc-couv-plat': url('plat'),
    // le plat arrière cuit avec son petit médaillon (4e de couverture), sinon la toile seule
    '--gc-couv-arriere': url(assetInfo(nomCouverture('plat-arriere', v, d)) ? 'plat-arriere' : 'arriere'),
    '--gc-couv-contreplat': url('contreplat'),
    '--gc-couv-contreplat-arriere': url('contreplat-arriere'),
    '--gc-couv-dos': url('dos'),
    '--gc-couv-chant': url('chant'),
    '--gc-couv-tranche': url('tranche'),
    '--gc-couv-tranche-pied': url('tranche-pied'),
    '--gc-couv-plat-taille': '100% 100%',
    '--gc-couv-fond': 'transparent',
    '--gc-couv-biseau': 'none',
    '--gc-couv-teinte': info.teinte,
    '--gc-couv-teinte-garde': info.teinte_garde,
  } as React.CSSProperties;
}

const pc = (x: number) => `${+(x * 100).toFixed(4)}%`;

export interface EtiquetteCouvertureProps {
  /** Variante (défaut : la variante retenue). */
  variante?: string;
  className?: string;
}

/**
 * Le contenu du plat : l'étiquette cuite (papier, cadre imprimé, titre à la plume, théière, ombre et coin
 * décollé), en <img>, à sa place sur le plat. Remplit son parent positionné (`.gc-livre-couv__contenu`,
 * ou n'importe quel cadre à la proportion du plat). Le titre réel est là pour les lecteurs d'écran.
 */
export function EtiquetteCouverture({ variante, className }: EtiquetteCouvertureProps) {
  const v = varianteDe(variante);
  const e = COUVERTURE_CUITE.variantes[v]?.etiquette ?? null;
  const n2 = `couverture/${v}/etiquette`;
  const n1 = `couverture/${v}/1x/etiquette`;
  const a2 = assetInfo(n2);
  const a1 = assetInfo(n1);
  const cls = ['gc-couv-etiquette', className].filter(Boolean).join(' ');
  return (
    <div className={cls} data-gc-couverture={v}>
      {e && a2 ? (
        <img
          className="gc-couv-etiquette__image"
          src={assetUrl(a1 ? n1 : n2)}
          srcSet={a1 ? `${assetUrl(n1)} 1x, ${assetUrl(n2)} 2x` : undefined}
          width={Math.round(a2.w / 2)}
          height={Math.round(a2.h / 2)}
          alt=""
          draggable={false}
          decoding="sync"
          style={{ left: pc(e.rect[0]), top: pc(e.rect[1]), width: pc(e.rect[2]), height: pc(e.rect[3]) }}
        />
      ) : null}
      <span className="gc-couv-etiquette__titre">{COUVERTURE_CUITE.titre}</span>
    </div>
  );
}

export interface IndiceOuvrirProps {
  modalite: ModaliteOuvrir;
  /** `crayon` : sans le billet de papier. Défaut : le billet. */
  crayon?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Une étiquette « … pour ouvrir » cuite, en <img> (taille naturelle en px de référence). */
export function IndiceOuvrir({ modalite, crayon = false, className, style }: IndiceOuvrirProps) {
  const nom = (crayon ? INDICES_OUVRIR_CRAYON : INDICES_OUVRIR)[modalite];
  const a = assetInfo(nom);
  if (!a) return null;
  return (
    <img
      className={['gc-couv-indice', className].filter(Boolean).join(' ')}
      src={assetUrl(nom)}
      width={Math.round(a.w / 2)}
      height={Math.round(a.h / 2)}
      alt={TEXTES_OUVRIR[modalite]}
      draggable={false}
      style={style}
    />
  );
}

/** Face d'une couverture rendue seule (cartes, aperçus, pages hors du livre). */
export type FaceCouverture = 'avant' | 'arriere' | 'contreplat' | 'contreplat-arriere';

export interface CouvertureProps {
  variante?: string;
  face?: FaceCouverture;
  densite?: DensiteCouverture;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * Une face de la couverture, seule, à la proportion du plat (largeur du parent) : plat avant avec son
 * étiquette, plat arrière, ou un contre-plat. Dans le livre, ce sont les variables de couvertureVars()
 * qui servent ; ce composant sert aux cartes et aux pages qui montrent le carnet fermé.
 */
export function Couverture({ variante, face = 'avant', densite = 'auto', className, style, children }: CouvertureProps) {
  const v = varianteDe(variante);
  const cls = ['gc-couverture', `gc-couverture--${face}`, className].filter(Boolean).join(' ');
  return (
    <div className={cls} style={{ ...couvertureVars(v, densite), ...style }} data-gc-couverture-face={face}>
      {face === 'avant' ? <EtiquetteCouverture variante={v} /> : null}
      {children}
    </div>
  );
}

export default Couverture;
