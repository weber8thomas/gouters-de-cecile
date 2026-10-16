// Doubles pages de la démo du carnet, partagées par l'application (Carnet), la carte DemoCarnet et la
// carte Formats : Lisa (vraie recette, longue : feuillet volant), Julie, Mamie Rose, Mathis et
// Bernard, puis le mot de la fin. Toutes sur la table en bois (CONTRACT § 12).
//
// Chaque page est une PAGE CUITE (<PageCuite>, scripts/bake-pages.mjs) : vrai papier ancien scanné,
// écriture générée trait par trait et croquis, l'encre cuite dans le papier. Ce qui reste vivant se
// pose dans les zones que la page réserve (`vivants` du manifeste) :
//   photo  → <PhotoCollee> : la vidéo de l'invité, en tirage sépia (se soulève au toucher, Entrée) ;
//   volant → <FeuilletVolant> : la suite d'une recette trop longue (se soulève au toucher, ↑).
// Rien d'autre que des <img> dans le livre : la vidéo vit dans le calque Soulever.
import React from 'react';
import { PageCuite, PAGES_CUITES } from '../../components/PageCuite';
import type { VideoInfo } from '../../components/Soulever';
import { PhotoCollee } from '../../components/PhotoCollee';
import { FeuilletVolant } from '../../components/FeuilletVolant';
import type { SpreadSpec } from '../../lib/spread';
import videosJson from '../../content/videos.json';
import './DemoCarnet.css';

/** Étiquette collée sur le plat de couverture. */
export const COUVERTURE = (
  <div className="gc-demo-couverture">
    <p className="gc-hand-caption gc-demo-couverture__sur">carnet de recettes</p>
    <p className="gc-recipe-title gc-demo-couverture__titre">Les goûters</p>
    <p className="gc-section-label gc-demo-couverture__de">de Cécile</p>
  </div>
);

const VIDEOS = videosJson as unknown as Record<string, Omit<VideoInfo, 'id'>>;

/** Fiche vidéo complète d'un invité (videos.json), ou null. */
export function videoInfo(id: string | null | undefined): VideoInfo | null {
  if (!id || !VIDEOS[id]) return null;
  return { id, ...VIDEOS[id] } as VideoInfo;
}

/**
 * Vidéo posée sur chaque page qui réserve une zone `photo` : l'invité de la double page, sauf la page
 * droite de Mathis, qui est celle de Bernard.
 */
const VIDEO_DE_PAGE: Record<string, string> = { 'mathis-droite': 'bernard' };
const videoDePage = (page: string): string | null => {
  const info = PAGES_CUITES.pages[page];
  if (!info?.vivants?.photo) return null;
  return VIDEO_DE_PAGE[page] ?? info.double;
};

interface VolantInfo { recto: string; verso?: string | null; angle?: number }

/** Une page cuite, avec sa photo collée et son feuillet volant s'il y en a. */
function Page({ id, graine }: { id: string; graine: number }) {
  const info = PAGES_CUITES.pages[id] as (typeof PAGES_CUITES.pages)[string] & { volant?: VolantInfo };
  const slots: Record<string, React.ReactNode> = {};
  const video = videoInfo(videoDePage(id));
  if (video) slots.photo = <PhotoCollee video={video} graine={graine} />;
  if (info?.vivants?.volant && info.volant) {
    slots.volant = <FeuilletVolant recto={info.volant.recto} verso={info.volant.verso ?? null} angle={info.volant.angle} graine={graine} />;
  }
  return <PageCuite page={id} slots={slots} />;
}

function double(o: { id: string; kind: SpreadSpec['kind']; folios: [number, number]; seed: number; titre: string; invite?: string }): SpreadSpec {
  const gauche = <Page id={`${o.id}-gauche`} graine={o.seed} />;
  const droite = <Page id={`${o.id}-droite`} graine={o.seed + 1} />;
  return { id: o.id, kind: o.kind, folios: o.folios, seed: o.seed, titre: o.titre, invite: o.invite ?? o.id, render: () => ({ left: gauche, right: droite }) };
}

const existe = (id: string) => !!PAGES_CUITES.pages[`${id}-gauche`] && !!PAGES_CUITES.pages[`${id}-droite`];

/** Les doubles pages de la démo, dans l'ordre (liste stable : mêmes objets à chaque rendu). */
export const SPREADS_DEMO: SpreadSpec[] = [
  existe('lisa') ? double({ id: 'lisa', kind: 'video', folios: [10, 11], seed: 2611, titre: 'Lisa — Carrot cake' }) : null,
  double({ id: 'julie', kind: 'video', folios: [12, 13], seed: 4127, titre: 'Julie — Cake au citron' }),
  double({ id: 'rose', kind: 'recette', folios: [14, 15], seed: 811, titre: 'Mamie Rose — Sablés' }),
  double({ id: 'mathis', kind: 'deux-recettes', folios: [16, 17], seed: 905, titre: 'Mathis et Bernard' }),
  double({ id: 'fin', kind: 'finale', folios: [18, 19], seed: 1201, titre: 'Le mot de la fin', invite: 'cecile' }),
].filter((s): s is SpreadSpec => s !== null);

/** Vidéo à préparer quand une double page devient visible (celle de la page gauche, sinon droite). */
export function videoDe(spread: SpreadSpec | undefined): VideoInfo | null {
  if (!spread) return null;
  return videoInfo(videoDePage(`${spread.id}-gauche`) ?? videoDePage(`${spread.id}-droite`));
}

/** Crédits des vidéos d'exemple, pour le menu de réglages. */
export const CREDITS_VIDEOS: { titre: string; auteur: string; licence: string; source: string }[] = Object.values(VIDEOS).map((v) => {
  const c = (v as unknown as { credit?: { auteur: string; licence: string; source: string } }).credit;
  return { titre: (v as { titre: string }).titre, auteur: c?.auteur ?? '', licence: c?.licence ?? '', source: c?.source ?? '' };
});

/** La double page de Julie (carte Formats). */
export const JULIE: SpreadSpec = SPREADS_DEMO.find((s) => s.id === 'julie')!;
/** Pages de Julie seules (carte AvantApres, en sursis). */
export const JulieGaucheCuite = () => <Page id="julie-gauche" graine={4127} />;
export const JulieDroiteCuite = () => <Page id="julie-droite" graine={4128} />;
