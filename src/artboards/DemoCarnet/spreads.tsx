// Doubles pages de la démo du carnet, partagées par l'application (Carnet), la carte DemoCarnet et la
// carte Formats. L'ordre vient de src/content/carnet.json (source unique, aussi lue par la cuisson) :
// page de titre, sommaire, intercalaires, Lisa (vraie recette, longue : feuillet volant), Julie, Mamie
// Rose, Mathis et Bernard, puis le mot de la fin. Toutes sur la table en bois (CONTRACT § 12, § 13).
//
// Chaque page est une PAGE CUITE (<PageCuite>, scripts/bake-pages.mjs) : vrai papier ancien scanné,
// écriture générée trait par trait et croquis, l'encre cuite dans le papier. Ce qui reste vivant se
// pose dans les zones que la page réserve (`vivants` du manifeste) :
//   photo  → <PhotoCollee> : la vidéo de l'invité, en tirage sépia (se soulève au toucher, Entrée) ;
//   volant → <FeuilletVolant> : la suite d'une recette trop longue (se soulève au toucher, ↑).
// Rien d'autre que des <img> dans le livre : la vidéo vit dans le calque Soulever. Une double page
// dont les pages ne sont pas encore cuites est sautée.
import React from 'react';
import { PageCuite, PAGES_CUITES } from '../../components/PageCuite';
import type { VideoInfo } from '../../components/Soulever';
import { PhotoCollee } from '../../components/PhotoCollee';
import { FeuilletVolant } from '../../components/FeuilletVolant';
import type { SpreadSpec } from '../../lib/spread';
import videosJson from '../../content/videos.json';
import carnetJson from '../../content/carnet.json';
import photosCecileJson from '../../content/photos-cecile.json';
import { assetUrl } from '../../lib/assets';
import type { Carnet, DoubleCarnet } from '../../content/types';

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

/** Tirages de l'album « Cécile en cuisine » (src/content/photos-cecile.json), dans l'ordre des zones photo-1…photo-10. */
const PHOTOS_CECILE = photosCecileJson as { id: string; age: string; tirage: string; coins: string; angle?: number }[];

/** Un tirage collé sans vidéo (album « Cécile en cuisine ») : le tirage et ses coins, un peu de travers. */
function TirageColle({ tirage, coins, angle = 0 }: { tirage: string; coins: string; angle?: number }) {
  const img: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' };
  return (
    <div style={{ position: 'absolute', inset: '3%', transform: `rotate(${angle}deg)` }}>
      <img src={assetUrl(tirage)} alt="" draggable={false} style={img} />
      <img src={assetUrl(coins)} alt="" draggable={false} style={img} />
    </div>
  );
}

/** Une page cuite, avec sa photo collée et son feuillet volant s'il y en a. */
function Page({ id, graine }: { id: string; graine: number }) {
  const info = PAGES_CUITES.pages[id] as (typeof PAGES_CUITES.pages)[string] & { volant?: VolantInfo };
  const slots: Record<string, React.ReactNode> = {};
  const video = videoInfo(videoDePage(id));
  if (video) slots.photo = <PhotoCollee video={video} graine={graine} />;
  for (const nom of Object.keys(info?.vivants ?? {})) {
    const n = /^photo-(\d+)$/.exec(nom);
    const t = n ? PHOTOS_CECILE[Number(n[1]) - 1] : undefined;
    if (t) slots[nom] = <TirageColle tirage={t.tirage} coins={t.coins} angle={t.angle} />;
  }
  if (info?.vivants?.volant && info.volant) {
    slots.volant = <FeuilletVolant recto={info.volant.recto} verso={info.volant.verso ?? null} angle={info.volant.angle} graine={graine} />;
  }
  return <PageCuite page={id} slots={slots} />;
}

const CARNET = carnetJson as unknown as Carnet;

/** Identifiants des deux pages d'une double page du carnet. */
export const pagesDe = (d: DoubleCarnet): { gauche: string; droite: string } =>
  d.pages ?? { gauche: `${d.id}-gauche`, droite: `${d.id}-droite` };

/** Folios de la double page k (0 = titre) : gauche 2k+2, droite 2k+3 (CONTRACT § 13). */
export const foliosDe = (k: number): [number, number] => [2 * k + 2, 2 * k + 3];

/** Graine stable d'une double page (papier, photo) : tirée de son id. */
function graineDe(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 9000 + 100;
}

function double(d: DoubleCarnet, k: number): SpreadSpec | null {
  const { gauche: g, droite: dr } = pagesDe(d);
  if (!PAGES_CUITES.pages[g] || !PAGES_CUITES.pages[dr]) return null;
  const seed = d.graine ?? graineDe(d.id);
  const gauche = <Page id={g} graine={seed} />;
  const droite = <Page id={dr} graine={seed + 1} />;
  const [f0, f1] = foliosDe(k);
  return {
    id: d.id,
    kind: d.type,
    folios: d.sansFolio ? [null, null] : [f0, f1],
    seed,
    titre: d.titre,
    invite: d.invites?.[0],
    invites: d.invites,
    render: () => ({ left: gauche, right: droite }),
  };
}

/** Les doubles pages de la démo, dans l'ordre (liste stable : mêmes objets à chaque rendu). */
export const SPREADS_DEMO: SpreadSpec[] = CARNET.doubles
  .map((d, k) => double(d, k))
  .filter((s): s is SpreadSpec => s !== null);

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
