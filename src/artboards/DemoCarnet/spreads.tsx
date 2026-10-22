// Doubles pages de la démo du carnet, partagées par l'application (Carnet), la carte DemoCarnet et la
// carte Formats. L'ordre vient de src/content/carnet.json (source unique, aussi lue par la cuisson) :
// ouverture, albums, sommaire, quatre chapitres et les huit recettes reçues, puis le mot de la fin.
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
import { useSoulevementActions } from '../../components/Soulever/contexte';
import { geometrieDe, proportionImage, type Fractions } from '../../components/Soulever/media';
import { PhotoCollee } from '../../components/PhotoCollee';
import { FeuilletVolant } from '../../components/FeuilletVolant';
import { Aquarelle, ToileAquarelles } from '../../components/Aquarelle';
import { SecretsDuCarnet } from '../../components/SecretsDuCarnet';
import { TOUCHER_EVENT } from '../../components/Livre/evenements';
import { useRenderMode, type SpreadSpec } from '../../lib/spread';
import videosJson from '../../content/videos.json';
import carnetJson from '../../content/carnet.json';
import photosCecileJson from '../../content/photos-cecile.json';
import rosterJson from '../../content/roster.json';
import { assetInfo, assetUrl, cssUrl } from '../../lib/assets';
import { handStyle } from '../../lib/hands';
import type { Carnet, DoubleCarnet, EncartCarnet } from '../../content/types';
import './Souvenirs.css';

const VIDEOS = videosJson as unknown as Record<string, Omit<VideoInfo, 'id'>>;

/** Fiche vidéo complète d'un invité (videos.json), ou null. */
export function videoInfo(id: string | null | undefined): VideoInfo | null {
  if (!id || !VIDEOS[id]) return null;
  return { id, ...VIDEOS[id] } as VideoInfo;
}

/** Vidéo posée sur chaque page qui réserve une zone `photo` : l'invité de la double page. */
const videoDePage = (page: string): string | null => {
  const info = PAGES_CUITES.pages[page];
  if (!info?.vivants?.photo) return null;
  return info.double;
};

interface VolantInfo { recto: string; verso?: string | null; angle?: number }

/**
 * Tirages de l'album « Le goût des bonnes choses » (src/content/photos-cecile.json), un par emplacement cecile-N, pour la
 * zone photo-N de la page. Chaque tirage garde le ratio de sa source (aucun rognage) : la zone photo-N est une BOÎTE
 * MAXIMALE, le tirage s'y inscrit à son ratio réel (image contenue, centrée, inclinée de `angle`). `video` : identifiant
 * d'une entrée de videos.json (emplacement vidéo, version locale). Le site public n'a que des placeholders en paysage 3:2
 * (cecile-1 à 10) : un emplacement dont le tirage n'a pas la forme de sa zone, ou sans tirage, reste une carte papier vide.
 */
interface PhotoCecile {
  id: string; orientation?: string; ratio?: number; tirage: string; coins: string; angle?: number; video?: string;
  /** Version locale seulement (prive/baked) : la photo en couleurs, la boucle de parallaxe de la vignette, la légende et la date. */
  couleur?: string; parallaxe?: string; legende?: string; date?: string;
}
const PHOTOS_CECILE = new Map((photosCecileJson as PhotoCecile[]).map((p) => [p.id, p]));

/** Carte au monogramme du proche, en attendant son véritable souvenir. Aucun portrait de tiers. */
function CarteSouvenir({ slug, papier }: { slug: string; papier: string }) {
  const proche = rosterJson.guests.find(g => g.slug === slug);
  if (!proche) return null;
  return <div className="gc-carte-souvenir" aria-hidden="true" style={{ '--gc-souvenir-papier':cssUrl(papier) } as React.CSSProperties}>
    <div className="gc-carte-souvenir__papier">
      <svg viewBox="0 0 300 200" preserveAspectRatio="none"><path d="M7 8 Q150 5 292 9 L290 191 Q150 194 8 190 Z M10 11 L289 12 287 188 11 187 Z"/></svg>
      <span style={handStyle('cecile','title','brune')}>{proche.firstName[0]}</span>
    </div>
    <img className="gc-carte-souvenir__coins" src={assetUrl('photos/lisa/coins')} alt="" draggable={false}/>
  </div>;
}

/**
 * Carte papier vide avec ses coins : place d'un emplacement de l'album sans tirage à la bonne orientation
 * (site public : seuls des placeholders en paysage existent). Rien n'est déformé ni recadré.
 */
function CartePapierVide({ papier, angle = 0 }: { papier: string; angle?: number }) {
  return <div className="gc-carte-souvenir" aria-hidden="true" style={{ '--gc-souvenir-papier': cssUrl(papier), inset: '7%', transform: `rotate(${angle}deg)` } as React.CSSProperties}>
    <div className="gc-carte-souvenir__papier">
      <svg viewBox="0 0 300 200" preserveAspectRatio="none"><path d="M7 8 Q150 5 292 9 L290 191 Q150 194 8 190 Z M10 11 L289 12 287 188 11 187 Z"/></svg>
    </div>
    <img className="gc-carte-souvenir__coins" src={assetUrl('photos/lisa/coins')} alt="" draggable={false}/>
  </div>;
}

/** Proportion (largeur / hauteur) d'une zone photo d'après son rectangle en fractions de la page (850×1200), ou null. */
function proportionDeZone(rect: number[] | undefined): number | null {
  if (!rect || !(rect[2] > 0 && rect[3] > 0)) return null;
  return (rect[2] * PAGES_CUITES.largeur) / (rect[3] * PAGES_CUITES.hauteur);
}

/** Écart de proportion toléré entre un tirage et sa zone (rapport) : au-delà, la zone reste une carte vide. */
const TOLERANCE_PROPORTION = 0.15;
const memeForme = (a: number, b: number | null): boolean => b !== null && Math.abs(Math.log(a / b)) <= TOLERANCE_PROPORTION;

/**
 * Un tirage collé sans vidéo (album « Cécile en cuisine ») : le tirage et ses coins, un peu de travers.
 * Il se soulève comme une photo (type « tirage » de Soulever) : au toucher, ou à Entrée quand il a le
 * focus (mode vivant). Sa légende au crayon s'écrit sous la photo en grand.
 */
function TirageColle({ tirage, coins, angle = 0, legende, date, couleur, parallaxe }: { tirage: string; coins: string; angle?: number; legende?: string; date?: string; couleur?: string; parallaxe?: string }) {
  const mode = useRenderMode();
  const vivant = mode === 'live';
  const actions = useSoulevementActions();
  const ref = React.useRef<HTMLDivElement>(null);
  // Le tirage tient dans sa zone à sa proportion (image contenue), puis il est incliné.
  const A = proportionImage(tirage);
  // Zone de la photo dans l'image du tirage (scripts/bake-photos-cecile.py : marge 100, bords 58 / 62 et 56 / 64 px) : celle où
  // la photo en couleurs prend la place du tirage à l'ouverture.
  const info = couleur ? assetInfo(tirage) : undefined;
  const zonePhoto: Fractions | undefined = info && info.w > 320 && info.h > 320 ? [158 / info.w, 156 / info.h, (info.w - 320) / info.w, (info.h - 320) / info.h] : undefined;
  // Version locale : légende et date au crayon sous le tirage, dans une bande réservée en bas de la zone (le tirage rétrécit
  // d'autant : aucun chevauchement avec les voisins ni avec le bord de la page).
  const reserve = legende ? 24 : date ? 11 : 0;
  const haut = 100 - reserve;
  const hauteurTirage = `min(100cqw / ${A.toFixed(5)}, ${haut}cqh)`;
  const decalage = `(100cqh - ${hauteurTirage} - ${Math.max(0, reserve - 3)}cqh) / 2`;

  const souleverRef = React.useRef<() => boolean>(() => false);
  souleverRef.current = () => {
    const el = ref.current;
    return !!el && !!actions?.soulever({ type: 'tirage', tirage, coins, legende, date, couleur, zonePhoto, source: el });
  };

  // Toucher dans le livre (dans le geste) : la photo se soulève, et le livre ne tourne pas la page.
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !vivant) return undefined;
    const prendre = (e: Event) => {
      if (souleverRef.current()) e.preventDefault();
    };
    el.addEventListener(TOUCHER_EVENT, prendre);
    return () => el.removeEventListener(TOUCHER_EVENT, prendre);
  }, [vivant]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (souleverRef.current()) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div style={{ position: 'absolute', inset: '3%', containerType: 'size', display: 'grid', placeItems: reserve ? 'start center' : 'center' }}>
      <div
        ref={ref}
        className="gc-tirage__photo"
        style={{ width: `min(100cqw, ${(A * haut).toFixed(3)}cqh)`, aspectRatio: `${A.toFixed(5)}`, transform: `rotate(${angle}deg)`, ...(reserve && { marginTop: `calc(${decalage})` }) }}
        data-gc-objet="tirage"
        data-gc-objet-mode={mode}
        data-gc-parallaxe={parallaxe}
        tabIndex={vivant ? 0 : undefined}
        role={vivant ? 'img' : undefined}
        aria-label={vivant ? `Photo${legende ? ` : ${legende}` : ''}. Entrée pour la voir en grand.` : undefined}
        aria-hidden={vivant ? undefined : true}
        onKeyDown={vivant ? onKeyDown : undefined}
      >
        <img className="gc-tirage__image" src={assetUrl(tirage)} alt="" draggable={false} decoding="sync" />
        <img src={assetUrl(coins)} alt="" draggable={false} decoding="sync" />
      </div>
      {reserve > 0 && (
        <div className="gc-legende" aria-hidden="true" style={{ top: `calc(${decalage} + ${hauteurTirage} + 2.4cqh)` }}>
          {legende && <div className="gc-legende__texte">{legende}</div>}
          {date && <div className="gc-legende__date">{date}</div>}
        </div>
      )}
    </div>
  );
}

/** Une page cuite, avec sa photo collée et son feuillet volant s'il y en a. */
function Page({ id, graine }: { id: string; graine: number }) {
  const info = PAGES_CUITES.pages[id] as (typeof PAGES_CUITES.pages)[string] & { volant?: VolantInfo };
  const slots: Record<string, React.ReactNode> = {};
  const video = videoInfo(videoDePage(id));
  if (video) slots.photo = <PhotoCollee video={video} graine={graine} />;
  else if (info?.vivants?.photo && info.double) slots.photo = <CarteSouvenir slug={info.double} papier={info.papier}/>;
  for (const nom of Object.keys(info?.vivants ?? {})) {
    const n = /^photo-(\d+)$/.exec(nom);
    if (!n) continue;
    const t = PHOTOS_CECILE.get(`cecile-${n[1]}`);
    const zone = proportionDeZone(info.vivants[nom] as number[] | undefined);
    const film = t ? videoInfo(t.video) : null;
    // Proportion du tirage tel qu'il est cuit (image entière, marge comprise) ; la zone est sa boîte maximale.
    const proportion = !t ? null : film?.geometrie ? film.geometrie.taille[0] / film.geometrie.taille[1] : film ? geometrieDe(film).proportion : proportionImage(t.tirage);
    // Pas de tirage, ou de forme différente de la zone : carte papier vide (jamais de photo déformée ni minuscule).
    if (!t || proportion === null || !memeForme(proportion, zone)) {
      slots[nom] = <CartePapierVide papier={info.papier} angle={t?.angle ?? (Number(n[1]) % 2 ? -2 : 2)} />;
      continue;
    }
    slots[nom] = film
      ? <PhotoCollee video={film} graine={graine + Number(n[1])} />
      : <TirageColle tirage={t.tirage} coins={t.coins} angle={t.angle} legende={t.legende} date={t.date} couleur={t.couleur} parallaxe={t.parallaxe} />;
  }
  Object.entries(info?.aquarelles ?? {}).forEach(([nom, a], i) => {
    slots[nom] = <Aquarelle nom={a.aquarelle} anime={a.anime} angle={a.angle} ordre={i} page={id} />;
  });
  if (info?.vivants?.volant && info.volant) {
    slots.volant = <FeuilletVolant recto={info.volant.recto} verso={info.volant.verso ?? null} angle={info.volant.angle} graine={graine} />;
  }
  // une seule toile vivante pour toutes les aquarelles de la page (et les créatures de la double page)
  return <PageCuite page={id} slots={slots} dessus={<><ToileAquarelles page={id} /><SecretsDuCarnet page={id} /></>} />;
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

function double(d: DoubleCarnet, k: number | null): SpreadSpec | null {
  const { gauche: g, droite: dr } = pagesDe(d);
  if (!PAGES_CUITES.pages[g] || !PAGES_CUITES.pages[dr]) return null;
  const seed = d.graine ?? graineDe(d.id);
  const gauche = <Page id={g} graine={seed} />;
  const droite = <Page id={dr} graine={seed + 1} />;
  // Un encart (k = null) n'a pas de folio et n'en décale aucun.
  const [f0, f1] = k === null ? [null, null] : foliosDe(k);
  return {
    id: d.id,
    kind: d.type,
    folios: d.sansFolio || k === null ? [null, null] : [f0, f1],
    seed,
    titre: d.titre,
    invite: d.invites?.[0],
    invites: d.invites,
    render: () => ({ left: gauche, right: droite }),
  };
}

/**
 * Les doubles pages de la démo, dans l'ordre (liste stable : mêmes objets à chaque rendu). Les encarts
 * (carnet.json › encarts, sans folio) s'insèrent après leur double `apres` ; le rang k des folios ne
 * compte que les doubles de `doubles`, comme la cuisson.
 */
function ordreDuCarnet(): { d: DoubleCarnet; k: number | null }[] {
  const out: { d: DoubleCarnet; k: number | null }[] = [];
  const encarts: EncartCarnet[] = CARNET.encarts ?? [];
  const apres = (id: string) => {
    for (const e of encarts.filter((x) => x.apres === id)) {
      out.push({ d: e, k: null });
      apres(e.id);
    }
  };
  CARNET.doubles.forEach((d, k) => {
    out.push({ d, k });
    apres(d.id);
  });
  return out;
}

export const SPREADS_DEMO: SpreadSpec[] = ordreDuCarnet()
  .map(({ d, k }) => double(d, k))
  .filter((s): s is SpreadSpec => s !== null);

/** Vidéo à préparer quand une double page devient visible (celle de la page gauche, sinon droite). */
export function videoDe(spread: SpreadSpec | undefined): VideoInfo | null {
  if (!spread) return null;
  return videoInfo(videoDePage(`${spread.id}-gauche`) ?? videoDePage(`${spread.id}-droite`));
}

/** Crédits des vidéos d'exemple, pour le menu de réglages. */
export const CREDITS_VIDEOS: { titre: string; auteur: string; licence: string; source: string }[] = Object.values(VIDEOS).filter((v) => (v as unknown as { credit?: unknown }).credit).map((v) => {
  const c = (v as unknown as { credit?: { auteur: string; licence: string; source: string } }).credit;
  return { titre: (v as { titre: string }).titre, auteur: c?.auteur ?? '', licence: c?.licence ?? '', source: c?.source ?? '' };
});

/** La double page de Lisa (carte Formats). */
export const LISA: SpreadSpec = SPREADS_DEMO.find((s) => s.id === 'lisa')!;
