// Le carnet, tel que les invités l'ouvrent : sur téléphone, tablette, ordinateur ou TV (CONTRACT
// §§ 11–12). MotionConfig (niveau de mouvement) › CameraProvider › Ecran (plein écran, cadrage « double »,
// ou « tourner » : téléphone debout, le livre fermé invite à tourner le téléphone) › SoulevementProvider
// (photo-vidéo et feuillet volant soulevés au-dessus du livre) ›
// Livre, avec le menu de réglages dans l'Ecran. Racine de l'application (index.html → src/app/main.tsx)
// et de la page autonome (harness/devices.html : React UMD + bundle.js, Artboards.Carnet).
// Plan v4 : le livre arrive sur la table ; un lien profond (QR de l'A5) l'ouvre et feuillette jusqu'à la
// page de l'invité ; Entrée ou Espace ouvre le livre fermé. Pas de plat arrière : la fin du livre est une butée.
import React from 'react';
import { EtiquetteCouverture, couvertureVars } from '../../components/Couverture';
import { Ecran } from '../../components/Ecran';
import { InvitationOuvrir } from '../../components/Invitation';
import { Livre, type LivreApi, type LivreProps } from '../../components/Livre';
import { Reglages, CREDITS_REGLAGES } from '../../components/Reglages';
import { CompagnonDuCarnet } from '../../components/SecretsDuCarnet';
import { SoulevementProvider, souleverObjet, useSoulevement } from '../../components/Soulever';
import { CAMERA_DEFAULT, CameraProvider } from '../../lib/camera';
import { MotionConfig, useNiveauMouvement, type MotionValue } from '../../lib/motion';
import { useReglages } from '../../lib/reglages';
import { ViewportOverride, type ViewportForce } from '../../lib/viewport';
import { CREDITS_VIDEOS, SPREADS_DEMO, videoDe } from '../DemoCarnet/spreads';
import { indexDuLien, useLienProfond } from './liens';

export interface CarnetProps {
  /**
   * Écran imposé (ViewportOverride) : { w, h } pour un écran simulé (cartes), ou seulement { insets }
   * pour simuler des encoches sur la vraie fenêtre (tests).
   */
  ecran?: ViewportForce;
  /** Liens profonds : #<id> ouvre la double page, l'URL suit la page affichée. */
  liens?: boolean;
  /** Double page de départ sans lien (−1 : couverture, défaut). */
  depart?: number;
  /** Cadrage « page » : page de départ (défaut : gauche, la vidéo). */
  coteInitial?: 'gauche' | 'droite';
}

const CLE_CAMERA = 'gc:camera:v3';

/** Sur un écran tactile, le cran par défaut est « proche » (s'il n'a jamais été réglé). */
function cranTactileParDefaut(tactile: boolean): void {
  if (!tactile) return;
  try {
    if (!localStorage.getItem(CLE_CAMERA)) localStorage.setItem(CLE_CAMERA, JSON.stringify({ distance: 'proche', zoom: CAMERA_DEFAULT.zoom }));
  } catch { /* stockage indisponible : cran par défaut du fournisseur */ }
}

export function Carnet({ ecran, liens = false, depart = -1, coteInitial }: CarnetProps) {
  const spreads = SPREADS_DEMO;
  const simule = !!ecran && ecran.w != null && ecran.h != null;
  // Départ : le lien profond (ou la double page imposée), lu une seule fois.
  const [initial] = React.useState(() => {
    if (!simule) {
      const tactile = ecran?.tactile ?? (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
      cranTactileParDefaut(tactile);
    }
    if (liens && typeof location !== 'undefined') {
      const i = indexDuLien(spreads, location.hash);
      if (i >= 0 || location.hash) return { index: i, lien: i >= 0 }; // id inconnu : couverture
    }
    return { index: depart, lien: false };
  });
  const [index, setIndex] = React.useState(initial.index);
  // Arrivée (application seulement, pas les cartes figées) : le livre glisse sur la table et se pose ;
  // avec un lien profond, il s'ouvre et feuillette jusqu'à la page (le livre gère tout, ≈ 2,1 s).
  const [arrivee] = React.useState<CarnetLivreProps['arrivee']>(() => {
    if (simule) return undefined;
    if (initial.lien) return { vers: initial.index, cote: coteInitial ?? 'gauche' };
    return initial.index === -1 ? true : undefined;
  });
  useLienProfond(liens, spreads, index, setIndex);
  // Fermer le carnet (bouton, Échap) : le livre revient à sa couverture par son tourne-page (aller(-1)).
  const livreRef = React.useRef<LivreApi | null>(null);
  const fermerCarnet = React.useCallback(() => livreRef.current?.aller(-1, 'gauche'), []);
  // Niveau de mouvement (src/lib/motion.ts) : crochet CSS sur la racine (data-gc-mouvement="reduit|doux|normal"),
  // et MotionConfig : seules les animations réduites (réglage) coupent celles des composants ; en version
  // douce (préférence du système), elles restent.
  const niveau = useNiveauMouvement();
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-gc-mouvement', niveau === 'complet' ? 'normal' : niveau);
  }, [niveau]);

  const carnet = (
    <MotionConfig reducedMotion={niveau === 'reduit' ? 'always' : 'never'}>
      <CameraProvider keyboard persist={!simule} fixed={simule && ecran?.tactile ? { distance: 'proche' } : undefined}>
        <Ecran pleinEcran onFermerCarnet={index >= 0 ? fermerCarnet : undefined}>
          <SoulevementProvider>
            <CarnetLivre index={index} setIndex={setIndex} coteInitial={coteInitial} arrivee={arrivee} apiRef={livreRef} />
          </SoulevementProvider>
        </Ecran>
      </CameraProvider>
    </MotionConfig>
  );
  return ecran ? <ViewportOverride.Provider value={ecran}>{carnet}</ViewportOverride.Provider> : carnet;
}

const ETIQUETTE = <EtiquetteCouverture />;

const CREDITS = (
  <>
    <p>{CREDITS_REGLAGES}</p>
    <ul>
      {CREDITS_VIDEOS.map((c) => (
        <li key={c.titre}>{c.titre} : {c.auteur} ({c.licence})</li>
      ))}
    </ul>
  </>
);

interface CarnetLivreProps {
  index: number;
  setIndex: (i: number) => void;
  coteInitial?: 'gauche' | 'droite';
  arrivee?: LivreProps['arrivee'];
  apiRef: React.MutableRefObject<LivreApi | null>;
}

/** Le livre, ses touches (Entrée : vidéo, ↑ : feuillet), la vidéo préparée à chaque page, le menu. */
function CarnetLivre({ index, setIndex, coteInitial, arrivee, apiRef }: CarnetLivreProps) {
  const spreads = SPREADS_DEMO;
  // Couverture cuite (lot C) : images posées par variables CSS sur le livre, étiquette en <img>.
  const couverture = React.useMemo(() => couvertureVars(), []);
  // Fin du livre : la dernière double page fait butée (le livre résiste au doigt), sans plat arrière.
  const { preparer, reposer } = useSoulevement();
  const [reglages] = useReglages();
  const lectureAuto = React.useRef(reglages.lectureAuto);
  lectureAuto.current = reglages.lectureAuto;

  // La vidéo de la double page affichée est préparée à l'atterrissage (jamais pendant un geste).
  React.useEffect(() => {
    preparer(index >= 0 ? videoDe(spreads[index]) : null);
  }, [index, preparer, spreads]);

  const changer = React.useCallback((i: number) => {
    setIndex(i);
    if (i >= 0 && lectureAuto.current && videoDe(spreads[i])) {
      // Lecture automatique : la photo se soulève une fois la page posée (sans le son si le
      // navigateur le refuse hors d'un geste ; le premier toucher le rend).
      requestAnimationFrame(() => requestAnimationFrame(() => souleverObjet('photo')));
    }
  }, [setIndex, spreads]);

  // Entrée / Espace : la vidéo de la double page ; ↑ : le feuillet volant. Appelé DANS le keydown.
  // Livre fermé : Entrée / Espace l'ouvre. Une touche déjà consommée (loupe, menu) n'est pas reprise.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && cible.closest('button, a, input, select, textarea, [role="slider"]')) return;
      if (index < 0) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIndex(0);
        }
        return;
      }
      let fait = false;
      if (e.key === 'Enter' || e.key === ' ') fait = souleverObjet('photo');
      else if (e.key === 'ArrowUp') fait = souleverObjet('feuillet');
      if (fait) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, setIndex]);

  const invites = React.useMemo(() => spreads.map((s, i) => ({ index: i, titre: s.titre ?? s.id })), [spreads]);
  const invitation = React.useCallback((o: MotionValue<number>) => <InvitationOuvrir opacite={o} />, []);
  const aller = React.useCallback((i: number) => { reposer(); setIndex(i); }, [reposer, setIndex]);

  return (
    <>
      <Livre
        spreads={spreads}
        index={index}
        onIndexChange={changer}
        keyboard
        cover={ETIQUETTE}
        couverture={couverture}
        coteInitial={coteInitial}
        arrivee={arrivee}
        apiRef={apiRef}
        // 4e de couverture : tourner la dernière page referme le carnet sur son plat arrière, ← le rouvre
        couvertureArriere
        // Invitation à ouvrir (lot S) : l'étiquette cuite « … pour ouvrir », selon la modalité.
        invitation={invitation}
      />
      <CompagnonDuCarnet />
      <Reglages invites={invites} onAller={aller} credits={CREDITS} />
    </>
  );
}

export default Carnet;
